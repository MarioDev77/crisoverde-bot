import Groq from "groq-sdk";
import { ChatMessage } from "./types";
import { SYSTEM_PROMPT } from "./prompt";
import { buildMemoryContext, getMemory } from "./memory";
import { logger } from "./logger";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Modelos gratuitos disponíveis no Groq:
// llama-3.3-70b-versatile  → mais inteligente
// llama-3.1-8b-instant     → mais rápido e econômico (recomendado)
// mixtral-8x7b-32768       → bom para contexto longo
const MODEL = "llama-3.1-8b-instant";
const MAX_TOKENS = 512;
const MAX_HISTORY = 10;

export async function getReply(
  userMessage: string,
  history: ChatMessage[] = [],
  sessionId?: string
): Promise<string> {
  const trimmedHistory = history.slice(-MAX_HISTORY);

  // Carrega memória do usuário e monta bloco de contexto
  const memoryContext = sessionId
    ? buildMemoryContext(getMemory(sessionId))
    : "";

  const fullSystemPrompt = SYSTEM_PROMPT + memoryContext;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: fullSystemPrompt },
    ...trimmedHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
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

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: MAX_TOKENS,
    temperature: 0.75,
  });

  const reply =
    response.choices[0]?.message?.content ??
    "Ops! Não consegui responder agora. Tenta de novo? 🌿";

  logger.debug("Resposta recebida do Groq", {
    replyLength: reply.length,
    model: response.model,
  });

  return reply;
}