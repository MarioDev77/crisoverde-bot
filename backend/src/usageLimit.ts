/**
 * usageLimit.ts — limite de consumo da IA (controle de custo e abuso).
 *
 * Usa a tabela `chat_events` que já existe (1 linha por mensagem enviada) — sem tabelas novas.
 *  - CHAT_DAILY_LIMIT_PER_USER: mensagens por usuário nas últimas 24h (padrão 100; 0 = sem limite).
 *  - CHAT_DAILY_LIMIT_GLOBAL:   mensagens de TODOS os usuários nas últimas 24h (padrão 0 = sem limite).
 *    É o teto real de gasto, já que qualquer pessoa pode criar conta.
 * Administradores não são limitados. Em caso de erro no banco, libera (fail-open), como o injectionGuard.
 */
import { authPool } from "./auth";
import { logger } from "./logger";

const DAY_SECONDS = 86_400;

function envInt(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface QuotaResult {
  allowed: boolean;
  reason?: "user" | "global";
  used: number;
  limit: number;
  retryAfterSeconds?: number;
}

function secondsUntilWindowFrees(oldest: unknown): number {
  const t = oldest ? new Date(oldest as string | Date).getTime() : NaN;
  if (!Number.isFinite(t)) return 3600;
  return Math.max(60, Math.ceil((t + DAY_SECONDS * 1000 - Date.now()) / 1000));
}

export async function checkChatQuota(userId: string, role?: string): Promise<QuotaResult> {
  const perUser = envInt("CHAT_DAILY_LIMIT_PER_USER", 100);
  const global = envInt("CHAT_DAILY_LIMIT_GLOBAL", 0);

  if (role === "admin" || (perUser === 0 && global === 0)) {
    return { allowed: true, used: 0, limit: perUser };
  }

  try {
    const { rows } = await authPool.query(
      `SELECT COUNT(*) FILTER (WHERE user_id = $1)::int AS u,
              COUNT(*)::int AS g,
              MIN(created_at) FILTER (WHERE user_id = $1) AS oldest_user,
              MIN(created_at) AS oldest_all
         FROM chat_events
        WHERE created_at > NOW() - INTERVAL '24 hours'`,
      [userId]
    );
    const r = rows[0] ?? {};
    const used = Number(r.u ?? 0);
    const total = Number(r.g ?? 0);

    if (perUser > 0 && used >= perUser) {
      return { allowed: false, reason: "user", used, limit: perUser, retryAfterSeconds: secondsUntilWindowFrees(r.oldest_user) };
    }
    if (global > 0 && total >= global) {
      return { allowed: false, reason: "global", used: total, limit: global, retryAfterSeconds: secondsUntilWindowFrees(r.oldest_all) };
    }
    return { allowed: true, used, limit: perUser };
  } catch (err) {
    logger.error("Falha ao checar limite diário — liberando", { err: String(err) });
    return { allowed: true, used: 0, limit: perUser };
  }
}
