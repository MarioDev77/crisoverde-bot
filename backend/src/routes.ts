import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getReply } from "./groq";
import { ChatRequest, ChatResponse, ErrorResponse, SecurityStatus } from "./types";
import {
  extractFromMessage,
  getMemory,
  saveMemory,
  clearMemory,
  cleanOldSessions,
} from "./memory";
import {
  getIpStatus,
  unblockIp,
  getSecurityLogs,
  cleanOldSecurityData,
} from "./security";
import { injectionGuard } from "./securityMiddleware";
import { logger } from "./logger";

const router = Router();

// ─── Middleware de autenticação admin ─────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: Function) {
  const token = req.headers["x-admin-token"];
  const validToken = process.env.ADMIN_TOKEN;

  if (!validToken) {
    return res.status(500).json({ error: "ADMIN_TOKEN não configurado no servidor." });
  }
  if (!token || token !== validToken) {
    return res.status(401).json({
      error: "Não autorizado.",
      code: "UNAUTHORIZED",
      timestamp: new Date().toISOString(),
    });
  }
  next();
}

// ─── Sanitização de input ─────────────────────────────────────────────────────

function sanitize(text: string): string {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\\/g, "")
    .trim();
}

// ─── POST /chat ───────────────────────────────────────────────────────────────
// injectionGuard é aplicado AQUI (não globalmente) para proteger apenas o chat.

router.post("/chat", injectionGuard, async (req: Request, res: Response) => {
  const { sessionId, message, history = [] } = req.body as ChatRequest;

  if (!message || typeof message !== "string" || !message.trim()) {
    const err: ErrorResponse = {
      error: "O campo 'message' é obrigatório e não pode estar vazio.",
      code: "MISSING_MESSAGE",
      timestamp: new Date().toISOString(),
    };
    return res.status(400).json(err);
  }

  if (message.length > 2000) {
    const err: ErrorResponse = {
      error: "A mensagem não pode ter mais de 2000 caracteres.",
      code: "MESSAGE_TOO_LONG",
      timestamp: new Date().toISOString(),
    };
    return res.status(400).json(err);
  }

  const cleanMessage = sanitize(message);
  const sid = sessionId ? sanitize(sessionId).slice(0, 64) : uuidv4();

  logger.info("Nova mensagem recebida", {
    sessionId: sid,
    ip: req.clientIp,
    riskScore: req.riskScore ?? 0,
    msgLength: cleanMessage.length,
  });

  try {
    const memory = await getMemory(sid);
    const updatedMemory = extractFromMessage(cleanMessage, memory);
    await saveMemory(sid, updatedMemory);

    const reply = await getReply(cleanMessage, history, sid);

    const response: ChatResponse = {
      reply,
      sessionId: sid,
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json(response);
  } catch (error: unknown) {
    logger.error("Erro ao chamar Groq API", { error: String(error) });

    const isKeyError =
      error instanceof Error &&
      (error.message.includes("401") ||
        error.message.includes("API key") ||
        error.message.includes("auth"));

    const err: ErrorResponse = {
      error: isKeyError
        ? "Chave de API inválida. Verifique o arquivo .env."
        : "Erro interno ao processar sua mensagem. Tente novamente.",
      code: isKeyError ? "AUTH_ERROR" : "API_ERROR",
      timestamp: new Date().toISOString(),
    };

    return res.status(500).json(err);
  }
});

// ─── GET /health ──────────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    status: "ok",
    version: "1.4.0",
    engine: "Groq — LLaMA 3.1 8B",
    memory: "postgresql",
    security: "active",
    timestamp: new Date().toISOString(),
  });
});

// ─── Rotas de memória (protegidas) ───────────────────────────────────────────

router.delete("/memory/:sessionId", requireAdmin, async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  await clearMemory(sessionId);
  logger.info("Memória apagada", { sessionId });
  return res.status(200).json({ message: "Memória apagada com sucesso.", sessionId });
});

router.get("/memory/:sessionId", requireAdmin, async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const memory = await getMemory(sessionId);
  return res.status(200).json({ sessionId, memory });
});

router.delete("/memory", requireAdmin, async (_req: Request, res: Response) => {
  const deleted = await cleanOldSessions(30);
  logger.info(`Limpeza de sessões: ${deleted} removidas`);
  return res.status(200).json({
    message: `${deleted} sessões antigas removidas.`,
    timestamp: new Date().toISOString(),
  });
});

// ─── Rotas de segurança (protegidas por admin) ────────────────────────────────

/**
 * GET /security/ip/:ip
 * Retorna o status de segurança de um IP específico.
 */
router.get("/security/ip/:ip", requireAdmin, async (req: Request, res: Response) => {
  const { ip } = req.params;
  const record = await getIpStatus(ip);

  if (!record) {
    return res.status(404).json({
      error: "IP não encontrado nos registros de segurança.",
      ip,
    });
  }

  const status: SecurityStatus = {
    ip: record.ip,
    riskScore: record.riskScore,
    suspiciousCount: record.suspiciousCount,
    blockCount: record.blockCount,
    isBlocked: record.blockedUntil !== null && new Date() < record.blockedUntil,
    blockedUntil: record.blockedUntil?.toISOString() ?? null,
    lastAttemptAt: record.lastAttemptAt.toISOString(),
  };

  return res.status(200).json(status);
});

/**
 * GET /security/logs/:ip
 * Retorna os últimos logs de segurança de um IP.
 * Query param: ?limit=20 (opcional)
 */
router.get("/security/logs/:ip", requireAdmin, async (req: Request, res: Response) => {
  const { ip } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string || "20", 10), 100);

  const logs = await getSecurityLogs(ip, limit);
  return res.status(200).json({ ip, logs, count: logs.length });
});

/**
 * POST /security/unblock/:ip
 * Desbloqueia manualmente um IP e zera seu score de risco.
 */
router.post("/security/unblock/:ip", requireAdmin, async (req: Request, res: Response) => {
  const { ip } = req.params;

  await unblockIp(ip);
  logger.info("IP desbloqueado manualmente", { ip, by: "admin" });

  return res.status(200).json({
    message: `IP ${ip} desbloqueado com sucesso.`,
    ip,
    timestamp: new Date().toISOString(),
  });
});

/**
 * DELETE /security/cleanup
 * Remove logs e registros de segurança antigos.
 * Query param: ?days=7 (opcional)
 */
router.delete("/security/cleanup", requireAdmin, async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string || "7", 10);
  const deleted = await cleanOldSecurityData(days);

  logger.info(`Limpeza de segurança: ${deleted} registros removidos`);
  return res.status(200).json({
    message: `${deleted} registros de segurança antigos removidos.`,
    days,
    timestamp: new Date().toISOString(),
  });
});

export default router;