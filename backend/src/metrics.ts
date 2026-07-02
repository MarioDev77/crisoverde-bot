/**
 * metrics.ts — Agregações para o painel administrativo
 *
 * Todas as queries usam parâmetros ($1, $2...) — nenhuma interpolação de
 * string do usuário entra em SQL aqui.
 */

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export interface SeriesPoint {
  bucket: string; // ISO date do início do período (dia, semana ou mês)
  count: number;
}

export interface OverviewMetrics {
  totalUsers: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  totalChatMessages: number;
  chatMessagesThisWeek: number;
  chatMessagesThisMonth: number;
  blockedIpsActive: number;
  suspiciousEvents7d: number;
  totalCrisomoedas: number;
}

/** Série diária de novos usuários nos últimos N dias (para gráfico semanal/mensal). */
export async function getNewUsersSeries(days: number): Promise<SeriesPoint[]> {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 365) : 30;
  const res = await pool.query(
    `SELECT date_trunc('day', created_at) AS bucket, COUNT(*)::int AS count
     FROM users
     WHERE created_at >= NOW() - ($1 || ' days')::interval
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [safeDays]
  );
  return res.rows.map((r) => ({ bucket: r.bucket.toISOString(), count: r.count }));
}

/** Série diária de mensagens de chat enviadas nos últimos N dias. */
export async function getChatEventsSeries(days: number): Promise<SeriesPoint[]> {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 365) : 30;
  const res = await pool.query(
    `SELECT date_trunc('day', created_at) AS bucket, COUNT(*)::int AS count
     FROM chat_events
     WHERE created_at >= NOW() - ($1 || ' days')::interval
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [safeDays]
  );
  return res.rows.map((r) => ({ bucket: r.bucket.toISOString(), count: r.count }));
}

/** Série diária de eventos suspeitos de segurança nos últimos N dias. */
export async function getSecurityEventsSeries(days: number): Promise<SeriesPoint[]> {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 365) : 30;
  const res = await pool.query(
    `SELECT date_trunc('day', created_at) AS bucket, COUNT(*)::int AS count
     FROM security_logs
     WHERE created_at >= NOW() - ($1 || ' days')::interval
       AND event IN ('SUSPICIOUS_MESSAGE', 'IP_BLOCKED')
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [safeDays]
  );
  return res.rows.map((r) => ({ bucket: r.bucket.toISOString(), count: r.count }));
}

export async function getOverview(): Promise<OverviewMetrics> {
  const [
    totalUsersRes,
    newUsersWeekRes,
    newUsersMonthRes,
    totalChatRes,
    chatWeekRes,
    chatMonthRes,
    blockedIpsRes,
    suspiciousRes,
    crisomoedasRes,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM users`),
    pool.query(`SELECT COUNT(*)::int AS c FROM users WHERE created_at >= NOW() - INTERVAL '7 days'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM users WHERE created_at >= NOW() - INTERVAL '30 days'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM chat_events`),
    pool.query(`SELECT COUNT(*)::int AS c FROM chat_events WHERE created_at >= NOW() - INTERVAL '7 days'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM chat_events WHERE created_at >= NOW() - INTERVAL '30 days'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM security_ips WHERE blocked_until IS NOT NULL AND blocked_until > NOW()`),
    pool.query(`SELECT COUNT(*)::int AS c FROM security_logs WHERE created_at >= NOW() - INTERVAL '7 days' AND event = 'SUSPICIOUS_MESSAGE'`),
    pool.query(`SELECT COALESCE(SUM((data->>'pontuacao_crisomoeda')::numeric), 0)::float AS c FROM memories`),
  ]);

  return {
    totalUsers: totalUsersRes.rows[0].c,
    newUsersThisWeek: newUsersWeekRes.rows[0].c,
    newUsersThisMonth: newUsersMonthRes.rows[0].c,
    totalChatMessages: totalChatRes.rows[0].c,
    chatMessagesThisWeek: chatWeekRes.rows[0].c,
    chatMessagesThisMonth: chatMonthRes.rows[0].c,
    blockedIpsActive: blockedIpsRes.rows[0].c,
    suspiciousEvents7d: suspiciousRes.rows[0].c,
    totalCrisomoedas: crisomoedasRes.rows[0].c,
  };
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export async function listUsers(limit = 100, offset = 0): Promise<AdminUserRow[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 100, 1), 200);
  const safeOffset = Math.max(Math.floor(offset) || 0, 0);
  const res = await pool.query(
    `SELECT id, name, email, role, created_at, last_login_at
     FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset]
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    createdAt: r.created_at.toISOString(),
    lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
  }));
}

export { pool as metricsPool };
