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
// Complementa o rateLimit básico do index.ts, com controle mais granular.
// Não depende de Redis — usa Map em memória (limpo automaticamente).

interface RateLimitEntry {
  timestamps: number[];  // timestamps das requisições na janela atual
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Limpa entradas antigas a cada 5 minutos para não acumular memória
setInterval(() => {
  const windowMs = (parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || "1", 10)) * 60 * 1000;
  const cutoff = Date.now() - windowMs;

  for (const [ip, entry] of rateLimitStore.entries()) {
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(ip);
    }
  }
}, 5 * 60 * 1000);

export function advancedRateLimit(options?: {
  /** Número máximo de requisições na janela (padrão: env RATE_LIMIT_MAX ou 30) */
  max?: number;
  /** Tamanho da janela em minutos (padrão: 1) */
  windowMinutes?: number;
}) {
  const max = options?.max ?? parseInt(process.env.RATE_LIMIT_MAX || "30", 10);
  const windowMinutes = options?.windowMinutes ?? 1;
  const windowMs = windowMinutes * 60 * 1000;

  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const ip = req.clientIp;
    const now = Date.now();
    const cutoff = now - windowMs;

    // Obtém ou cria entrada para o IP
    if (!rateLimitStore.has(ip)) {
      rateLimitStore.set(ip, { timestamps: [] });
    }

    const entry = rateLimitStore.get(ip)!;

    // Remove timestamps fora da janela (sliding window)
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

    if (entry.timestamps.length >= max) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfterSeconds = Math.ceil((oldestInWindow + windowMs - now) / 1000);

      logger.warn("[RATE_LIMIT] IP excedeu limite de requisições", {
        ip,
        count: entry.timestamps.length,
        max,
        retryAfterSeconds,
      });

      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");

      res.status(429).json({
        error: "Muitas requisições. Aguarde antes de tentar novamente.",
        code: "RATE_LIMITED",
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