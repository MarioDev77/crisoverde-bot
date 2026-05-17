import Groq from "groq-sdk";
import { ChatMessage } from "./types";
import { SYSTEM_PROMPT } from "./prompt";
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
  history: ChatMessage[] = []
): Promise<string> {
  const trimmedHistory = history.slice(-MAX_HISTORY);

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
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
  });

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: MAX_TOKENS,
    temperature: 0.75,
  });

  const reply = response.choices[0]?.message?.content ?? "Ops! Não consegui responder agora. Tenta de novo? 🌿";

  logger.debug("Resposta recebida do Groq", {
    replyLength: reply.length,
    model: response.model,
  });

  return reply;
}