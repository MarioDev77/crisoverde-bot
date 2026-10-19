/**
 * securityMiddleware.ts — Middlewares Express para o Sistema de Segurança
 *
 * Middlewares disponíveis:
 *  - ipExtractor       → captura o IP real mesmo atrás de proxy
 *  - advancedRateLimit → rate limiting por IP com janela deslizante (em memória)
 *  - injectionGuard    → verifica a mensagem contra padrões de prompt injection
 */

import { Request, Response, NextFunction } from "express";
import { checkSecurity } from "./security";
import { logger } from "./logger";

// ─── Extensão do tipo Request para carregar dados de segurança ───────────────

declare global {
  namespace Express {
    interface Request {
      /** IP real do cliente (já extraído pelo ipExtractor) */
      clientIp: string;
      /** Pontuação de risco calculada para este IP */
      riskScore?: number;
      /** Padrões de injection detectados nesta requisição */
      detectedPatterns?: string[];
    }
  }
}

// ─── 1. Extração do IP real ───────────────────────────────────────────────────
// Funciona corretamente atrás de proxies como Railway, Vercel, Nginx e Cloudflare.
// O `app.set("trust proxy", 1)` já está configurado no index.ts, o que faz
// req.ip resolver para o X-Forwarded-For correto.

export function ipExtractor(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // req.ip já considera "trust proxy" configurado no Express
  const rawIp =
    req.ip ||
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  // Normaliza IPv6 loopback (::1 → 127.0.0.1)
  req.clientIp = rawIp === "::1" ? "127.0.0.1" : rawIp.replace(/^::ffff:/, "");

  next();
}

// ─── 2. Rate Limiting Avançado (janela deslizante em memória) ─────────────────
// Não depende de Redis — usa Map em memória (limpo automaticamente).
//
// CORREÇÃO (429 indevido): antes, TODOS os limitadores (geral da API, login/cadastro)
// compartilhavam UM ÚNICO Map indexado só pelo IP. Cada limitador filtrava esse Map com a
// SUA janela e contava as requisições dos OUTROS: o limite de login (10 por 5 min) acabava
// contando chat, /health e listagem de conversas. Agora cada limitador tem o próprio Map.
//
// Também é possível escolher a CHAVE de contagem (ex.: id do usuário). Escolas e redes
// móveis (CGNAT) fazem muita gente compartilhar o mesmo IP; contar por IP faz um aluno
// "gastar" o limite do colega.

interface RateLimitEntry {
  timestamps: number[];  // timestamps das requisições na janela atual
}

const allStores: Array<{ store: Map<string, RateLimitEntry>; windowMs: number }> = [];

// Limpa entradas antigas a cada 5 minutos para não acumular memória
setInterval(() => {
  for (const { store, windowMs } of allStores) {
    const cutoff = Date.now() - windowMs;
    for (const [key, entry] of store.entries()) {
      entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export function advancedRateLimit(options?: {
  /** Número máximo de requisições na janela (padrão: env RATE_LIMIT_MAX ou 120) */
  max?: number;
  /** Tamanho da janela em minutos (padrão: 1) */
  windowMinutes?: number;
  /** Chave de contagem. Padrão: IP do cliente. Ex.: (req) => req.user?.id */
  key?: (req: Request) => string | undefined;
  /** Caminhos (req.path) que NÃO entram na contagem, ex.: ["/health"] */
  skipPaths?: string[];
  /** Mensagem e código devolvidos no 429 */
  message?: string;
  code?: string;
}) {
  const max = options?.max ?? parseInt(process.env.RATE_LIMIT_MAX || "120", 10);
  const windowMinutes = options?.windowMinutes ?? 1;
  const windowMs = windowMinutes * 60 * 1000;
  const skip = new Set(options?.skipPaths ?? []);
  const store = new Map<string, RateLimitEntry>(); // um Map POR limitador
  allStores.push({ store, windowMs });

  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (skip.has(req.path)) return next();

    const id = options?.key?.(req) ?? req.clientIp;
    const now = Date.now();
    const cutoff = now - windowMs;

    let entry = store.get(id);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(id, entry);
    }

    // Remove timestamps fora da janela (sliding window)
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

    if (entry.timestamps.length >= max) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));

      logger.warn("[RATE_LIMIT] limite de requisições excedido", {
        key: id,
        path: req.path,
        count: entry.timestamps.length,
        max,
        retryAfterSeconds,
      });

      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");

      res.status(429).json({
        error: options?.message ?? "Muitas requisições. Aguarde antes de tentar novamente.",
        code: options?.code ?? "RATE_LIMITED",
        retryAfterSeconds,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Registra esta requisição
    entry.timestamps.push(now);

    // Adiciona headers informativos
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(max - entry.timestamps.length));

    next();
  };
}

// ─── 3. Guard de Prompt Injection ────────────────────────────────────────────
// Verifica a mensagem da requisição antes de chegar no handler da rota.
// Bloqueia apenas quando o IP atinge o threshold de risco — não bloqueia
// por uma única mensagem suspeita leve, protegendo usuários legítimos.

export function injectionGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Só age em rotas que enviam mensagem de chat
  const message: unknown = req.body?.message;

  if (!message || typeof message !== "string") {
    return next(); // sem mensagem = não há injection a verificar
  }

  const ip = req.clientIp;

  // Execução assíncrona encapsulada (middleware Express não aceita async direto)
  checkSecurity(ip, message)
    .then((result) => {
      // Anexa os dados de segurança ao request para uso nos handlers
      req.riskScore = result.riskScore;
      req.detectedPatterns = result.detectedPatterns;

      if (!result.allowed) {
        const blockedUntilStr = result.blockedUntil
          ? result.blockedUntil.toISOString()
          : undefined;

        return res.status(403).json({
          error: result.blockReason ?? "Acesso temporariamente bloqueado.",
          code: "SECURITY_BLOCKED",
          blockedUntil: blockedUntilStr,
          timestamp: new Date().toISOString(),
        });
      }

      // Se detectou padrões suspeitos mas ainda não bloqueou,
      // adiciona um header de aviso (útil para monitoramento)
      if (result.detectedPatterns.length > 0) {
        res.setHeader("X-Security-Warning", "suspicious_content_detected");
      }

      next();
    })
    .catch((err) => {
      // Em caso de erro no sistema de segurança, NÃO bloqueia o usuário
      // (fail-open para não derrubar o chatbot por erro no banco)
      logger.error("[SECURITY] Erro no injectionGuard — liberando requisição", {
        ip,
        err: String(err),
      });
      next();
    });
}

// ─── 4. Logger de Requisições de Segurança ───────────────────────────────────
// Middleware leve para logar todas as requisições com IP e riskScore.
// Coloque DEPOIS do injectionGuard para ter acesso ao riskScore calculado.

export function securityLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ip = req.clientIp;
  const method = req.method;
  const path = req.path;

  // Log no final da requisição (tem acesso ao status code)
  res.on("finish", () => {
    const status = res.statusCode;
    const riskScore = req.riskScore ?? 0;
    const patterns = req.detectedPatterns ?? [];

    // Só loga detalhes extras se houver algo de interesse
    if (status >= 400 || riskScore > 0 || patterns.length > 0) {
      logger.info(`[REQUEST] ${method} ${path}`, {
        ip,
        status,
        riskScore,
        patterns: patterns.length > 0 ? patterns : undefined,
        timestamp: new Date().toISOString(),
      });
    }
  });

  next();
}