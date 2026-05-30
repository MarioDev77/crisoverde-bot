import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getReply } from "./groq";
import { ChatRequest, ChatResponse, ErrorResponse } from "./types";
import {
  extractFromMessage,
  getMemory,
  saveMemory,
  clearMemory,
  cleanOldSessions,
} from "./memory";
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

router.post("/chat", async (req: Request, res: Response) => {
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

  // Sanitiza a mensagem e o sessionId
  const cleanMessage = sanitize(message);
  const sid = sessionId ? sanitize(sessionId).slice(0, 64) : uuidv4();

  logger.info("Nova mensagem recebida", {
    sessionId: sid,
    msgLength: cleanMessage.length,
  });

  try {
    // 1. Carrega memória atual do usuário
    const memory = await getMemory(sid);

    // 2. Extrai novas informações da mensagem e atualiza memória
    const updatedMemory = extractFromMessage(cleanMessage, memory);
    await saveMemory(sid, updatedMemory);

    // 3. Gera resposta com contexto de memória
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

// ─── DELETE /memory/:sessionId (protegido) ────────────────────────────────────

router.delete("/memory/:sessionId", requireAdmin, async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  await clearMemory(sessionId);
  logger.info("Memória apagada", { sessionId });
  return res.status(200).json({ message: "Memória apagada com sucesso.", sessionId });
});

// ─── GET /memory/:sessionId (protegido) ──────────────────────────────────────

router.get("/memory/:sessionId", requireAdmin, async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const memory = await getMemory(sessionId);
  return res.status(200).json({ sessionId, memory });
});

// ─── DELETE /memory (limpar sessões antigas — protegido) ──────────────────────

router.delete("/memory", requireAdmin, async (_req: Request, res: Response) => {
  const deleted = await cleanOldSessions(30);
  logger.info(`Limpeza de sessões: ${deleted} removidas`);
  return res.status(200).json({
    message: `${deleted} sessões antigas removidas.`,
    timestamp: new Date().toISOString(),
  });
});

// ─── GET /health ──────────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    status: "ok",
    version: "1.3.0",
    engine: "Groq — LLaMA 3.1 8B",
    memory: "postgresql",
    timestamp: new Date().toISOString(),
  });
});

export default router;