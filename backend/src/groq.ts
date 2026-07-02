import Groq from "groq-sdk";
import { ChatMessage } from "./types";
import { SYSTEM_PROMPT } from "./prompt";
import { buildMemoryContext, getMemory } from "./memory";
import { logger } from "./logger";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: 30_000, // evita ficar pendurado indefinidamente numa chamada travada
  maxRetries: 0, // retries ficam por conta do withRetry abaixo (mais controle sobre o que é retentável)
});

const MODEL = "llama-3.1-8b-instant";
const MAX_TOKENS = 512;
const MAX_HISTORY = 10;
const MAX_HISTORY_ITEM_LENGTH = 2000; // mesmo limite aplicado à mensagem atual

/**
 * Erros de rede transitórios (conexão fechada no meio da resposta, reset,
 * timeout) — nada a ver com o conteúdo da requisição. Vale a pena tentar
 * de novo automaticamente antes de estourar erro pro usuário.
 */
function isTransientNetworkError(error: unknown): boolean {
  const msg = String((error as Error)?.message ?? error).toLowerCase();
  return (
    msg.includes("premature close") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("fetch failed") ||
    msg.includes("etimedout") ||
    msg.includes("other side closed")
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isTransientNetworkError(error) || attempt === maxAttempts) {
        throw error;
      }

      const backoffMs = 300 * attempt; // 300ms, 600ms, ...
      logger.warn("Erro transitório ao chamar Groq API, tentando de novo", {
        attempt,
        maxAttempts,
        error: String(error),
      });
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
}

/**
 * Sanitiza o array de histórico vindo do cliente.
 *
 * IMPORTANTE: `history` chega direto do body da requisição (JSON), então
 * NUNCA pode ser confiado como já sendo `ChatMessage[]` — mesmo que o tipo
 * TypeScript diga isso. Um cliente malicioso pode enviar `role: "system"`
 * (ou qualquer outro valor) para tentar injetar uma segunda mensagem de
 * sistema no meio da conversa e sobrescrever as instruções reais do bot.
 *
 * Aqui validamos item a item: só aceitamos role "user" ou "assistant",
 * content precisa ser string não vazia, e limitamos o tamanho.
 */
function sanitizeHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return [];

  const clean: ChatMessage[] = [];

  for (const item of history) {
    if (!item || typeof item !== "object") continue;

    const role = (item as Record<string, unknown>).role;
    const content = (item as Record<string, unknown>).content;

    // Só aceitamos exatamente esses dois valores — qualquer outra coisa
    // ("system", "developer", "tool", etc.) é descartada silenciosamente.
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;

    clean.push({
      role,
      content: content.slice(0, MAX_HISTORY_ITEM_LENGTH),
    });
  }

  return clean;
}

export async function getReply(
  userMessage: string,
  history: ChatMessage[] = [],
  sessionId?: string
): Promise<string> {
  const trimmedHistory = sanitizeHistory(history).slice(-MAX_HISTORY);

  // getMemory agora é assíncrono (PostgreSQL)
  const memoryContext = sessionId
    ? buildMemoryContext(await getMemory(sessionId))
    : "";

  const fullSystemPrompt = SYSTEM_PROMPT + memoryContext;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: fullSystemPrompt },
    ...trimmedHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  logger.debug("Enviando para Groq", {
    model: MODEL,
    historyLength: trimmedHistory.length,
    msgLength: userMessage.length,
    hasMemory: !!memoryContext,
  });

  const response = await withRetry(() =>
    groq.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: 0.75,
    })
  );

  const reply =
    response.choices[0]?.message?.content ??
    "Ops! Não consegui responder agora. Tenta de novo? 🌿";

  logger.debug("Resposta recebida do Groq", {
    replyLength: reply.length,
    model: response.model,
  });

  return reply;
}