/**
 * security.ts — Sistema de Segurança do Crisoverde Bot
 *
 * Responsabilidades:
 *  - Detectar tentativas de prompt injection
 *  - Atribuir pontuação de risco por IP
 *  - Bloquear temporariamente IPs com muitas tentativas suspeitas
 *  - Persistir dados de segurança no PostgreSQL (sem Redis)
 *  - Liberar bloqueios automaticamente após o tempo expirar
 */

import { Pool } from "pg";
import { logger } from "./logger";

// ─── Conexão com o banco (reutiliza a mesma DATABASE_URL) ────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ─── Constantes de configuração ──────────────────────────────────────────────

/** Tentativas suspeitas antes do primeiro bloqueio */
const BLOCK_THRESHOLD = 5;

/** Tempo base de bloqueio em minutos */
const BASE_BLOCK_MINUTES = 10;

/** Multiplicador de bloqueio a cada reincidência (bloqueio progressivo) */
const BLOCK_MULTIPLIER = 2;

/** Janela de tempo (minutos) para contagem de tentativas suspeitas */
const RISK_WINDOW_MINUTES = 30;

/** Pontuação máxima de risco antes de bloquear */
const MAX_RISK_SCORE = 100;

// ─── Padrões de prompt injection ─────────────────────────────────────────────
// Cada padrão tem um peso — quanto maior, mais suspeito

interface InjectionPattern {
  regex: RegExp;
  weight: number;   // pontos de risco que este padrão adiciona
  label: string;    // descrição para o log
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  // Instruções diretas para ignorar contexto
  {
    regex: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|context)/i,
    weight: 40,
    label: "ignore_previous_instructions",
  },
  {
    regex: /esqueça\s+(todas?\s+)?(as\s+)?(instruções?|regras?|contexto|prompt)/i,
    weight: 40,
    label: "ignore_instructions_pt",
  },
  {
    regex: /disregard\s+(all\s+)?(previous|prior)\s+(instructions?|prompts?)/i,
    weight: 40,
    label: "disregard_instructions",
  },

  // Tentativas de revelar o system prompt
  {
    regex: /reveal\s+(your\s+)?(system\s+prompt|instructions?|configuration|rules?)/i,
    weight: 50,
    label: "reveal_system_prompt",
  },
  {
    regex: /show\s+(me\s+)?(your\s+)?(system\s+prompt|hidden\s+instructions?|true\s+instructions?)/i,
    weight: 50,
    label: "show_system_prompt",
  },
  {
    regex: /mostre?\s+(seu\s+)?(prompt\s+de\s+sistema|instruções?\s+secretas?|configuração)/i,
    weight: 50,
    label: "reveal_prompt_pt",
  },
  {
    regex: /o\s+que\s+(está|fica)\s+no\s+(seu\s+)?(system\s+prompt|prompt\s+inicial)/i,
    weight: 45,
    label: "ask_system_prompt_pt",
  },

  // Jailbreak clássico — personas alternativas
  {
    regex: /\b(DAN|jailbreak|do\s+anything\s+now|developer\s+mode)\b/i,
    weight: 60,
    label: "jailbreak_persona",
  },
  {
    regex: /act\s+as\s+(if\s+you\s+are\s+)?(an?\s+)?(evil|unrestricted|unfiltered|uncensored)/i,
    weight: 55,
    label: "act_as_evil",
  },
  {
    regex: /pretend\s+(you\s+)?(are|have\s+no)\s+(restrictions?|limitations?|rules?)/i,
    weight: 50,
    weight2: 50,
    label: "pretend_no_limits",
  } as any,
  {
    regex: /finja\s+(que\s+)?(você\s+é|ser)\s+(uma?\s+)?(ia|assistente)?\s*(sem\s+(restrições?|limites?|regras?)|malévol|livre)/i,
    weight: 55,
    label: "pretend_evil_pt",
  },

  // Injeção de papel / role override
  {
    regex: /you\s+are\s+now\s+(a\s+)?(new|different|another|evil|unrestricted)\s+(ai|bot|assistant|model)/i,
    weight: 45,
    label: "role_override",
  },
  {
    regex: /sua?\s+nova?\s+(identidade|personalidade|missão)\s+é/i,
    weight: 40,
    label: "new_identity_pt",
  },
  {
    regex: /\[SYSTEM\]|\[INST\]|\[\/INST\]|<\|system\|>|<\|user\|>/i,
    weight: 60,
    label: "raw_prompt_tokens",
  },

  // Tentativas de exfiltração de dados internos
  {
    regex: /print\s+(all\s+)?(your\s+)?(memory|context|conversation|history|data)/i,
    weight: 35,
    label: "exfil_memory",
  },
  {
    regex: /repita\s+(tudo\s+que\s+)?(você\s+)?(sabe|tem|guarda)/i,
    weight: 30,
    label: "repeat_memory_pt",
  },

  // Bypass via formatação / codificação
  {
    regex: /(base64|rot13|hex)\s*(decode|encode|traduz)/i,
    weight: 25,
    label: "encoding_bypass",
  },
  {
    regex: /```\s*(system|prompt|instructions?)/i,
    weight: 35,
    label: "markdown_injection",
  },

  // Frases de manipulação leve (peso baixo — sozinhas não bloqueiam)
  {
    regex: /forget\s+(everything|what\s+you\s+know|your\s+training)/i,
    weight: 20,
    label: "forget_training",
  },
  {
    regex: /bypass\s+(your\s+)?(filters?|restrictions?|safety|guardrails?)/i,
    weight: 30,
    label: "bypass_filters",
  },
  {
    regex: /override\s+(your\s+)?(programming|directives?|training)/i,
    weight: 30,
    label: "override_programming",
  },
];

// ─── Tipos internos ──────────────────────────────────────────────────────────

export interface SecurityCheckResult {
  /** true = requisição liberada, false = bloqueada */
  allowed: boolean;
  /** Pontuação de risco atual do IP (0–100+) */
  riskScore: number;
  /** Padrões de injection detectados nesta mensagem */
  detectedPatterns: string[];
  /** Motivo do bloqueio (se houver) */
  blockReason?: string;
  /** Quando o bloqueio expira (se houver) */
  blockedUntil?: Date;
}

export interface IpSecurityRecord {
  ip: string;
  riskScore: number;
  suspiciousCount: number;
  blockCount: number;           // quantas vezes já foi bloqueado
  blockedUntil: Date | null;
  lastAttemptAt: Date;
  updatedAt: Date;
}

// ─── Inicialização das tabelas de segurança ──────────────────────────────────

export async function initSecurityDB(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_ips (
      ip              TEXT          PRIMARY KEY,
      risk_score      INTEGER       NOT NULL DEFAULT 0,
      suspicious_count INTEGER      NOT NULL DEFAULT 0,
      block_count     INTEGER       NOT NULL DEFAULT 0,
      blocked_until   TIMESTAMPTZ   NULL,
      last_attempt_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_logs (
      id          SERIAL        PRIMARY KEY,
      ip          TEXT          NOT NULL,
      event       TEXT          NOT NULL,
      details     JSONB         NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  // Índice para buscas rápidas por IP e data
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_security_logs_ip
    ON security_logs (ip, created_at DESC)
  `);

  logger.info("SecurityDB: tabelas security_ips e security_logs prontas ✅");
}

// ─── Log de segurança ────────────────────────────────────────────────────────

async function logSecurityEvent(
  ip: string,
  event: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO security_logs (ip, event, details) VALUES ($1, $2, $3)`,
      [ip, event, JSON.stringify(details)]
    );

    // Log no console também (com timestamp e IP)
    logger.warn(`[SECURITY] ${event}`, {
      ip,
      timestamp: new Date().toISOString(),
      ...details,
    });
  } catch (err) {
    // Nunca deixa erro de log derrubar a requisição
    logger.error("Falha ao registrar evento de segurança", { err: String(err) });
  }
}

// ─── Carrega / cria registro do IP ───────────────────────────────────────────

async function getOrCreateIpRecord(ip: string): Promise<IpSecurityRecord> {
  const res = await pool.query(
    `SELECT * FROM security_ips WHERE ip = $1`,
    [ip]
  );

  if (res.rows[0]) {
    const row = res.rows[0];
    return {
      ip: row.ip,
      riskScore: row.risk_score,
      suspiciousCount: row.suspicious_count,
      blockCount: row.block_count,
      blockedUntil: row.blocked_until ? new Date(row.blocked_until) : null,
      lastAttemptAt: new Date(row.last_attempt_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // Cria registro zerado
  await pool.query(
    `INSERT INTO security_ips (ip) VALUES ($1) ON CONFLICT DO NOTHING`,
    [ip]
  );

  return {
    ip,
    riskScore: 0,
    suspiciousCount: 0,
    blockCount: 0,
    blockedUntil: null,
    lastAttemptAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── Persiste registro atualizado do IP ──────────────────────────────────────

async function saveIpRecord(record: IpSecurityRecord): Promise<void> {
  await pool.query(
    `INSERT INTO security_ips
       (ip, risk_score, suspicious_count, block_count, blocked_until, last_attempt_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (ip)
     DO UPDATE SET
       risk_score       = $2,
       suspicious_count = $3,
       block_count      = $4,
       blocked_until    = $5,
       last_attempt_at  = NOW(),
       updated_at       = NOW()`,
    [
      record.ip,
      record.riskScore,
      record.suspiciousCount,
      record.blockCount,
      record.blockedUntil,
    ]
  );
}

// ─── Calcula duração do bloqueio progressivo ─────────────────────────────────

function calcBlockDuration(blockCount: number): number {
  // 1ª vez: 10 min | 2ª: 20 min | 3ª: 40 min | 4ª: 80 min … (cap: 24h)
  const minutes = BASE_BLOCK_MINUTES * Math.pow(BLOCK_MULTIPLIER, blockCount);
  return Math.min(minutes, 24 * 60); // máximo 24 horas
}

// ─── Análise de uma mensagem por padrões de injection ────────────────────────

export function analyzeMessage(message: string): {
  riskPoints: number;
  patterns: string[];
} {
  let riskPoints = 0;
  const patterns: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.regex.test(message)) {
      riskPoints += pattern.weight;
      patterns.push(pattern.label);
    }
  }

  return { riskPoints, patterns };
}

// ─── Verificação principal de segurança ──────────────────────────────────────

export async function checkSecurity(
  ip: string,
  message: string
): Promise<SecurityCheckResult> {
  // 1. Carrega (ou cria) o registro do IP
  const record = await getOrCreateIpRecord(ip);

  // 2. Verifica se IP está bloqueado (e se o bloqueio ainda está vigente)
  if (record.blockedUntil && new Date() < record.blockedUntil) {
    await logSecurityEvent(ip, "REQUEST_BLOCKED", {
      reason: "IP temporariamente bloqueado",
      blockedUntil: record.blockedUntil.toISOString(),
      riskScore: record.riskScore,
    });

    return {
      allowed: false,
      riskScore: record.riskScore,
      detectedPatterns: [],
      blockReason: "IP temporariamente bloqueado por atividade suspeita.",
      blockedUntil: record.blockedUntil,
    };
  }

  // 3. Se o bloqueio expirou, limpa o estado de bloqueio (mantém histórico)
  if (record.blockedUntil && new Date() >= record.blockedUntil) {
    record.blockedUntil = null;
    // Decai o riskScore pela metade ao desbloquear (segunda chance)
    record.riskScore = Math.floor(record.riskScore / 2);

    await logSecurityEvent(ip, "IP_UNBLOCKED", {
      reason: "Bloqueio expirado automaticamente",
      newRiskScore: record.riskScore,
    });
  }

  // 4. Analisa a mensagem em busca de padrões suspeitos
  const { riskPoints, patterns } = analyzeMessage(message);

  const isSuspicious = riskPoints > 0;

  if (isSuspicious) {
    record.riskScore = Math.min(record.riskScore + riskPoints, 999);
    record.suspiciousCount += 1;

    await logSecurityEvent(ip, "SUSPICIOUS_MESSAGE", {
      patterns,
      riskPoints,
      totalRiskScore: record.riskScore,
      suspiciousCount: record.suspiciousCount,
      messageSnippet: message.slice(0, 120), // só os primeiros 120 chars
    });
  } else {
    // Decai o riskScore lentamente para mensagens legítimas
    // (-2 pontos por mensagem limpa, mínimo 0)
    if (record.riskScore > 0) {
      record.riskScore = Math.max(0, record.riskScore - 2);
    }
  }

  // 5. Verifica se deve bloquear (threshold de score OU quantidade de tentativas)
  const shouldBlock =
    record.riskScore >= MAX_RISK_SCORE ||
    record.suspiciousCount >= BLOCK_THRESHOLD;

  if (shouldBlock) {
    const durationMinutes = calcBlockDuration(record.blockCount);
    record.blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    record.blockCount += 1;
    record.suspiciousCount = 0; // reseta contador para o próximo ciclo
    record.riskScore = Math.floor(record.riskScore * 0.6); // mantém 60% do score

    await logSecurityEvent(ip, "IP_BLOCKED", {
      reason: "Limite de atividade suspeita atingido",
      durationMinutes,
      blockCount: record.blockCount,
      blockedUntil: record.blockedUntil.toISOString(),
      riskScore: record.riskScore,
    });

    await saveIpRecord(record);

    return {
      allowed: false,
      riskScore: record.riskScore,
      detectedPatterns: patterns,
      blockReason: `Bloqueado por ${durationMinutes} minutos devido a atividade suspeita.`,
      blockedUntil: record.blockedUntil,
    };
  }

  // 6. Persiste o estado atualizado
  await saveIpRecord(record);

  // 7. Libera — mesmo mensagens com suspeita leve passam (proteção gradual)
  return {
    allowed: true,
    riskScore: record.riskScore,
    detectedPatterns: patterns,
  };
}

// ─── Funções administrativas ─────────────────────────────────────────────────

/** Desbloqueia manualmente um IP */
export async function unblockIp(ip: string): Promise<void> {
  await pool.query(
    `UPDATE security_ips
     SET blocked_until = NULL, risk_score = 0, suspicious_count = 0, updated_at = NOW()
     WHERE ip = $1`,
    [ip]
  );
  await logSecurityEvent(ip, "IP_MANUALLY_UNBLOCKED", { by: "admin" });
}

/** Retorna o status de segurança de um IP */
export async function getIpStatus(ip: string): Promise<IpSecurityRecord | null> {
  const res = await pool.query(`SELECT * FROM security_ips WHERE ip = $1`, [ip]);
  if (!res.rows[0]) return null;

  const row = res.rows[0];
  return {
    ip: row.ip,
    riskScore: row.risk_score,
    suspiciousCount: row.suspicious_count,
    blockCount: row.block_count,
    blockedUntil: row.blocked_until ? new Date(row.blocked_until) : null,
    lastAttemptAt: new Date(row.last_attempt_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** Retorna os últimos N logs de segurança de um IP */
export async function getSecurityLogs(
  ip: string,
  limit: number = 20
): Promise<Array<{ event: string; details: Record<string, unknown>; createdAt: Date }>> {
  const res = await pool.query(
    `SELECT event, details, created_at FROM security_logs
     WHERE ip = $1 ORDER BY created_at DESC LIMIT $2`,
    [ip, limit]
  );

  return res.rows.map((row) => ({
    event: row.event,
    details: row.details,
    createdAt: new Date(row.created_at),
  }));
}

/** Remove logs e registro de IPs antigos (chame periodicamente via rota admin) */
export async function cleanOldSecurityData(days: number = 7): Promise<number> {
  // Intervalo parametrizado (em vez de interpolar a string) — evita que
  // qualquer mudança futura na origem de `days` vire um vetor de SQL injection.
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;

  const res = await pool.query(
    `DELETE FROM security_logs
     WHERE created_at < NOW() - ($1 || ' days')::interval
     RETURNING id`,
    [safeDays]
  );

  // Remove IPs sem atividade, sem bloqueio ativo e com risco zerado
  await pool.query(
    `DELETE FROM security_ips
     WHERE updated_at < NOW() - ($1 || ' days')::interval
       AND blocked_until IS NULL
       AND risk_score = 0`,
    [safeDays]
  );

  return res.rowCount ?? 0;
}