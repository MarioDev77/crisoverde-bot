import Groq from "groq-sdk";
import { ChatMessage, SourceRef } from "./types";
import { SYSTEM_PROMPT } from "./prompt";
import { buildMemoryContext, getMemory } from "./memory";
import { logger } from "./logger";
import { isSearchProviderConfigured, needsWebSearch, webSearch } from "./search";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: 30_000, // evita ficar pendurado indefinidamente numa chamada travada
  maxRetries: 0, // retries ficam por conta do withRetry abaixo (mais controle sobre o que é retentável)
});

const CHAT_MODEL = "openai/gpt-oss-20b"; // llama-3.1-8b-instant foi descontinuado pela Groq em 17/06/2026 — este é o substituto recomendado
const SEARCH_MODEL = "groq/compound"; // só para perguntas que parecem precisar de info em tempo real
const MAX_TOKENS = 400; // reduzido de 512 — menos margem de resposta, mas menos consumo de TPM
const MAX_HISTORY = 6; // reduzido de 10 — menos histórico enviado a cada chamada, menos tokens
const MAX_HISTORY_ITEM_LENGTH = 2000; // mesmo limite aplicado à mensagem atual

/**
 * Monta o bloco de contexto enviado ao modelo quando temos resultados reais
 * de uma busca externa (provider configurado via SEARCH_PROVIDER). Segue o
 * formato: pergunta + resultados numerados + instrução de uso, sempre
 * deixando explícito que o modelo não deve inventar informações.
 */
function buildSearchAugmentedMessage(
  question: string,
  results: { title: string; url: string; snippet: string }[]
): string {
  const resultsBlock = results
    .map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\nFonte: ${r.url}`)
    .join("\n\n");

  return [
    `Pergunta do usuário:`,
    question,
    ``,
    `Resultados encontrados na internet:`,
    resultsBlock,
    ``,
    `Utilize essas informações para responder. Caso existam conflitos entre`,
    `fontes, priorize as mais confiáveis. Nunca invente informações além do`,
    `que está nos resultados acima. Responda em português, de forma objetiva`,
    `e profissional. Não liste as fontes na resposta — isso é feito`,
    `automaticamente pelo sistema.`,
  ].join("\n");
}

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

export interface GetReplyResult {
  reply: string;
  sources?: SourceRef[];
}

export async function getReply(
  userMessage: string,
  history: ChatMessage[] = [],
  sessionId?: string
): Promise<GetReplyResult> {
  const trimmedHistory = sanitizeHistory(history).slice(-MAX_HISTORY);

  // getMemory agora é assíncrono (PostgreSQL)
  const memoryContext = sessionId
    ? buildMemoryContext(await getMemory(sessionId))
    : "";

  const fullSystemPrompt = SYSTEM_PROMPT + memoryContext;

  const wantsSearch = needsWebSearch(userMessage);

  // ─── Busca externa (opcional, via SEARCH_PROVIDER/SEARCH_API_KEY) ──────────
  // Se não estiver configurada, `sources` fica undefined e o comportamento
  // segue 100% igual ao anterior (fallback pro groq/compound logo abaixo).
  let sources: SourceRef[] | undefined;
  let finalUserMessage = userMessage;
  let primaryModel = wantsSearch ? SEARCH_MODEL : CHAT_MODEL;

  if (wantsSearch && isSearchProviderConfigured()) {
    const outcome = await webSearch(userMessage);

    if (outcome && outcome.results.length) {
      finalUserMessage = buildSearchAugmentedMessage(userMessage, outcome.results);
      sources = outcome.results.map((r) => ({ title: r.title, url: r.url }));
      primaryModel = CHAT_MODEL; // já temos os resultados reais — não precisa do compound
    } else {
      // Falhou (timeout/erro/limite) — cai pro comportamento antigo
      // (groq/compound) em vez de deixar a pergunta sem tentativa de busca.
      primaryModel = SEARCH_MODEL;
    }
  }

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: fullSystemPrompt },
    ...trimmedHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: finalUserMessage },
  ];

  logger.debug("Enviando para Groq", {
    model: primaryModel,
    wantsSearch,
    usingExternalSearchResults: !!sources,
    historyLength: trimmedHistory.length,
    msgLength: userMessage.length,
    hasMemory: !!memoryContext,
  });

  async function call(model: string) {
    return withRetry(() =>
      groq.chat.completions.create({
        model,
        messages,
        max_tokens: MAX_TOKENS,
        temperature: 0.75,
      })
    );
  }

  let response;
  try {
    response = await call(primaryModel);
  } catch (error) {
    // O groq/compound tem um limite de tokens por requisição bem mais
    // apertado que os modelos normais (por causa da orquestração de
    // ferramentas embutida). Se ele recusar por tamanho, cai de volta pro
    // modelo de chat normal em vez de estourar erro pro usuário — só perde
    // a pesquisa nessa mensagem específica.
    const isRequestTooLarge =
      error instanceof Groq.APIError &&
      (error.status === 413 ||
        (error as any)?.error?.code === "request_too_large");

    if (wantsSearch && isRequestTooLarge) {
      logger.warn("groq/compound recusou por tamanho — respondendo sem pesquisa", {
        error: String(error),
      });
      response = await call(CHAT_MODEL);
    } else {
      throw error;
    }
  }

  const reply =
    response.choices[0]?.message?.content ??
    "Ops! Não consegui responder agora. Tenta de novo? 🌿";

  // `executed_tools` só existe em modelos compound (groq/compound) — mostra
  // se a resposta usou pesquisa na web e/ou execução de código.
  const executedTools = (response.choices[0]?.message as any)?.executed_tools;

  logger.debug("Resposta recebida do Groq", {
    replyLength: reply.length,
    model: response.model,
    toolsUsed: Array.isArray(executedTools)
      ? executedTools.map((t: any) => t.type)
      : undefined,
    sourcesCount: sources?.length ?? 0,
  });

  return { reply, sources };
}