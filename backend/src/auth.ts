/**
 * auth.ts — Cadastro, login e emissão de tokens de sessão
 *
 * Modelo de segurança:
 *  - Senhas nunca são guardadas em texto puro — usamos bcrypt (custo 12).
 *  - A sessão do usuário é um JWT assinado (HS256) guardado em cookie
 *    HttpOnly + Secure + SameSite=None (o front roda em outro domínio,
 *    então precisa de SameSite=None para o cookie ir junto nas requisições).
 *  - Como o cookie é HttpOnly, JS no navegador não consegue lê-lo nem roubá-lo
 *    via XSS — isso é intencional e é a principal defesa da sessão.
 *  - Um segundo cookie, NÃO HttpOnly (`cv_role`), guarda só o papel do usuário
 *    ("user" | "admin") para o middleware do Next.js decidir se mostra ou
 *    esconde rotas. Ele NUNCA é usado para autorizar nada no backend — é
 *    só uma dica de UI. A autorização real sempre valida o JWT assinado.
 */

import { Pool } from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { logger } from "./logger";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = "7d";
const BCRYPT_COST = 12;

export type UserRole = "user" | "admin";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

export interface JwtPayload {
  sub: string; // user id
  role: UserRole;
}

// ─── Inicialização da tabela ──────────────────────────────────────────────────

export async function initAuthDB(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name           TEXT NOT NULL,
      email          CITEXT UNIQUE NOT NULL,
      password_hash  TEXT NOT NULL,
      role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at  TIMESTAMPTZ
    )
  `).catch(async (err) => {
    // CITEXT pode não estar habilitado — tenta criar a extensão e refazer.
    if (String(err).includes("citext")) {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS citext`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name           TEXT NOT NULL,
          email          CITEXT UNIQUE NOT NULL,
          password_hash  TEXT NOT NULL,
          role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
          created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_login_at  TIMESTAMPTZ
        )
      `);
    } else {
      throw err;
    }
  });

  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`); // gen_random_uuid()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_events (
      id         SERIAL PRIMARY KEY,
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chat_events_created_at ON chat_events (created_at)
  `);

  logger.info("AuthDB: tabelas users e chat_events prontas ✅");
}

// ─── Validação de entrada ─────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegisterInput(input: {
  name?: unknown;
  email?: unknown;
  password?: unknown;
}): string | null {
  const { name, email, password } = input;

  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) {
    return "Nome precisa ter entre 2 e 80 caracteres.";
  }
  if (typeof email !== "string" || !EMAIL_REGEX.test(email) || email.length > 254) {
    return "E-mail inválido.";
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return "Senha precisa ter entre 8 e 128 caracteres.";
  }
  // Exige ao menos uma letra e um número — barato de checar, reduz senhas triviais.
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Senha precisa conter letras e números.";
  }
  return null;
}

// ─── Cadastro ──────────────────────────────────────────────────────────────────

export async function createUser(
  name: string,
  email: string,
  password: string
): Promise<AuthUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const res = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'user')
     RETURNING id, name, email, role, created_at`,
    [name.trim(), normalizedEmail, passwordHash]
  );

  const row = res.rows[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}

export async function findUserByEmail(
  email: string
): Promise<(AuthUser & { passwordHash: string }) | null> {
  const res = await pool.query(
    `SELECT id, name, email, role, password_hash, created_at
     FROM users WHERE email = $1`,
    [email.trim().toLowerCase()]
  );
  if (!res.rows[0]) return null;

  const row = res.rows[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const res = await pool.query(
    `SELECT id, name, email, role, created_at FROM users WHERE id = $1`,
    [id]
  );
  if (!res.rows[0]) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}

export async function touchLastLogin(id: string): Promise<void> {
  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [id]);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

export function signToken(user: AuthUser): string {
  const payload: JwtPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    // Fixamos o algoritmo esperado (HS256) para não aceitar tokens assinados
    // com "alg: none" ou trocados por outro algoritmo (ataque clássico de JWT).
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof decoded === "string") return null;
    return decoded as JwtPayload;
  } catch {
    return null;
  }
}

// ─── Registro de uso do chat (para métricas do painel admin) ─────────────────

export async function logChatEvent(userId: string): Promise<void> {
  try {
    await pool.query(`INSERT INTO chat_events (user_id) VALUES ($1)`, [userId]);
  } catch (err) {
    logger.error("Falha ao registrar chat_event", { err: String(err) });
  }
}

export { pool as authPool };
