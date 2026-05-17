import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getReply } from "./groq";
import { ChatRequest, ChatResponse, ErrorResponse } from "./types";
import { logger } from "./logger";

const router = Router();

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

  const sid = sessionId || uuidv4();
  logger.info("Nova mensagem recebida", { sessionId: sid, msgLength: message.length });

  try {
    const reply = await getReply(message.trim(), history);

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
      (error.message.includes("401") || error.message.includes("API key") || error.message.includes("auth"));

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

router.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    status: "ok",
    version: "1.0.0",
    engine: "Groq — LLaMA 3.3 70B",
    timestamp: new Date().toISOString(),
  });
});

export default router;
