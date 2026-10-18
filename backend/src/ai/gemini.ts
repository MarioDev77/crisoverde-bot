/**
 * gemini.ts — cliente da API Gemini (REST `generateContent`), sem dependências extras.
 *
 * - A chave vai no header `x-goog-api-key` (nunca na URL, para não vazar em logs).
 * - Instruções confiáveis vão em `systemInstruction`; mensagens do usuário em `contents`.
 * - Tudo configurável por variável de ambiente (ver .env.example).
 * - Erros são normalizados em AIProviderError, para a rota não depender de detalhes do provedor.
 */
import { logger } from "../logger";

// ─── Configuração ─────────────────────────────────────────────────────────────

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function envFloat(name: string, min: number, max: number): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(n, min), max);
}

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";
const THINKING_LEVELS: ThinkingLevel[] = ["minimal", "low", "medium", "high"];

export interface GeminiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  fallbackModel?: string;
  maxOutputTokens: number;
  timeoutMs: number;
  temperature?: number;
  thinkingLevel?: ThinkingLevel;
}

/** Lê a configuração no momento da chamada (permite testes e troca de modelo sem rebuild). */
export function getGeminiConfig(): GeminiConfig {
  const level = (process.env.GEMINI_THINKING_LEVEL || "").trim().toLowerCase();
  return {
    apiKey: (process.env.GEMINI_API_KEY || "").trim(),
    baseUrl: (process.env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, ""),
    model: (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim(),
    fallbackModel: (process.env.GEMINI_FALLBACK_MODEL || "").trim() || undefined,
    maxOutputTokens: envInt("GEMINI_MAX_OUTPUT_TOKENS", 2048, 64, 65536),
    timeoutMs: envInt("GEMINI_TIMEOUT_MS", 30000, 2000, 120000),
    temperature: envFloat("GEMINI_TEMPERATURE", 0, 2),
    thinkingLevel: (THINKING_LEVELS as string[]).includes(level) ? (level as ThinkingLevel) : undefined,
  };
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface GeminiTurn {
  role: "user" | "model";
  text: string;
}

export interface GenerateInput {
  systemInstruction: string;
  turns: GeminiTurn[];
}

export interface UsageInfo {
  promptTokens?: number;
  outputTokens?: number;
  thoughtsTokens?: number;
  totalTokens?: number;
}

export interface GenerateResult {
  text: string;
  /** true se a resposta foi cortada pelo limite de tokens de saída */
  truncated: boolean;
  /** true se o provedor bloqueou o conteúdo (política de segurança do modelo) */
  blocked: boolean;
  model: string;
  usage: UsageInfo;
  latencyMs: number;
  attempts: number;
}

export type AIErrorKind =
  | "rate_limit"   // 429 / cota
  | "unavailable"  // 5xx, rede, instabilidade
  | "timeout"
  | "auth"         // chave inválida / sem permissão
  | "bad_request"  // 400 (ex.: parâmetro não suportado)
  | "empty"        // resposta sem texto
  | "unknown";

export class AIProviderError extends Error {
  kind: AIErrorKind;
  status?: number;
  retryAfterSeconds?: number;

  constructor(kind: AIErrorKind, message: string, opts: { status?: number; retryAfterSeconds?: number } = {}) {
    super(message);
    this.name = "AIProviderError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extrai "30s" / "30.5s" de error.details[].retryDelay, quando o Google informa. */
function parseRetryDelay(body: any): number | undefined {
  const details = body?.error?.details;
  if (!Array.isArray(details)) return undefined;
  for (const d of details) {
    const m = String(d?.retryDelay ?? "").match(/^([\d.]+)s$/);
    if (m) return Math.max(1, Math.ceil(parseFloat(m[1])));
  }
  return undefined;
}

function classifyHttpError(status: number, body: any, headers: Headers): AIProviderError {
  const apiMsg = String(body?.error?.message ?? "").slice(0, 300);
  const apiStatus = String(body?.error?.status ?? "");
  const retryHeader = parseInt(headers.get("retry-after") ?? "", 10);
  const retryAfterSeconds = parseRetryDelay(body) ?? (Number.isFinite(retryHeader) ? retryHeader : undefined);

  if (status === 429 || apiStatus === "RESOURCE_EXHAUSTED") {
    return new AIProviderError("rate_limit", `Gemini 429: ${apiMsg}`, { status, retryAfterSeconds });
  }
  if (status === 401 || status === 403 || /API_KEY|API key/i.test(apiMsg)) {
    return new AIProviderError("auth", `Gemini ${status}: ${apiMsg}`, { status });
  }
  if (status === 400) {
    return new AIProviderError("bad_request", `Gemini 400: ${apiMsg}`, { status });
  }
  if (status >= 500 || apiStatus === "UNAVAILABLE" || apiStatus === "DEADLINE_EXCEEDED") {
    return new AIProviderError("unavailable", `Gemini ${status}: ${apiMsg}`, { status, retryAfterSeconds });
  }
  return new AIProviderError("unknown", `Gemini ${status}: ${apiMsg}`, { status });
}

// ─── Uma chamada HTTP ─────────────────────────────────────────────────────────

interface CallOptions {
  model: string;
  thinkingLevel?: ThinkingLevel;
  timeoutMs: number;
  /** Sobrescreve GEMINI_MAX_OUTPUT_TOKENS (usado ao recuperar de resposta vazia por limite de tokens). */
  maxOutputTokens?: number;
}

async function callOnce(cfg: GeminiConfig, input: GenerateInput, opts: CallOptions): Promise<Omit<GenerateResult, "latencyMs" | "attempts">> {
  const generationConfig: Record<string, unknown> = { maxOutputTokens: opts.maxOutputTokens ?? cfg.maxOutputTokens };
  if (cfg.temperature !== undefined) generationConfig.temperature = cfg.temperature;
  if (opts.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: opts.thinkingLevel };

  const body = {
    systemInstruction: { parts: [{ text: input.systemInstruction }] },
    contents: input.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig,
  };

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/models/${encodeURIComponent(opts.model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new AIProviderError("timeout", `Gemini excedeu ${opts.timeoutMs}ms`);
    }
    // erros de rede (ECONNRESET, "fetch failed", "other side closed"...) → instabilidade transitória
    throw new AIProviderError("unavailable", `Falha de rede ao chamar Gemini: ${String((err as Error)?.message ?? err)}`);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* corpo não-JSON: tratado abaixo */
  }

  if (!res.ok) throw classifyHttpError(res.status, data, res.headers);

  const candidate = data?.candidates?.[0];
  const finishReason: string = String(candidate?.finishReason ?? "");
  const blockReason: string = String(data?.promptFeedback?.blockReason ?? "");

  // Ignora partes de "pensamento" (thought: true) — só o texto final vai ao usuário.
  const parts: any[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts
    .filter((p) => typeof p?.text === "string" && !p?.thought)
    .map((p) => p.text)
    .join("")
    .trim();

  const um = data?.usageMetadata ?? {};
  const usage: UsageInfo = {
    promptTokens: um.promptTokenCount,
    outputTokens: um.candidatesTokenCount,
    thoughtsTokens: um.thoughtsTokenCount,
    totalTokens: um.totalTokenCount,
  };

  const blockedFinish = ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"].includes(finishReason);
  const blocked = (!!blockReason && blockReason !== "BLOCK_REASON_UNSPECIFIED") || (blockedFinish && !text);

  return { text, truncated: finishReason === "MAX_TOKENS", blocked, model: opts.model, usage };
}

// ─── Chamada com retry, fallback e prazo total ───────────────────────────────

const BACKOFF_MS = [400, 1200];
const MODEL_MAX_OUTPUT_TOKENS = 65536; // teto de saída dos modelos Gemini 3.x (documentação oficial)

/**
 * Combinações modelo+nível que a API já recusou com 400 (ex.: "minimal" no gemini-3.8-flash).
 * Evita repetir a chamada falha — e pagar a latência dupla — a cada mensagem.
 */
const rejectedThinking = new Set<string>();
export function _resetGeminiState(): void {
  rejectedThinking.clear();
}

/**
 * Estratégia:
 *  1. Modelo principal, até 3 tentativas para falhas TRANSITÓRIAS (rede, 5xx, timeout).
 *  2. 429 não é repetido no mesmo modelo (a cota não volta em milissegundos): vai direto ao
 *     GEMINI_FALLBACK_MODEL, se configurado.
 *  3. 400 com thinkingConfig → repete uma vez sem thinkingConfig (o modelo pode não aceitar o nível).
 *  4. Resposta vazia por MAX_TOKENS (o "pensamento" consumiu o limite) → repete UMA vez com thinkingLevel
 *     "low" e o dobro de tokens de saída (até o teto do modelo). Não usa "minimal": o gemini-3.8-flash
 *     não o aceita (a documentação oficial diz que retorna erro).
 *  5. Todo o processo respeita um prazo total de 2 × GEMINI_TIMEOUT_MS.
 */
export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const cfg = getGeminiConfig();
  if (!cfg.apiKey) throw new AIProviderError("auth", "GEMINI_API_KEY não configurada");

  const startedAt = Date.now();
  const deadline = startedAt + cfg.timeoutMs * 2;
  let attempts = 0;
  let lastError: AIProviderError | undefined;

  const models = [cfg.model, ...(cfg.fallbackModel && cfg.fallbackModel !== cfg.model ? [cfg.fallbackModel] : [])];

  for (const model of models) {
    let thinkingLevel = cfg.thinkingLevel;
    let maxOutputTokens: number | undefined;
    let transientTries = 0;
    let emptyRetried = false;

    while (true) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) {
        throw lastError ?? new AIProviderError("timeout", "Prazo total esgotado");
      }
      attempts++;

      // Nível já recusado por este modelo → não tenta de novo.
      if (thinkingLevel && rejectedThinking.has(`${model}|${thinkingLevel}`)) thinkingLevel = undefined;

      try {
        const out = await callOnce(cfg, input, { model, thinkingLevel, maxOutputTokens, timeoutMs: Math.min(cfg.timeoutMs, remaining) });

        if (out.text || out.blocked) {
          const result: GenerateResult = { ...out, latencyMs: Date.now() - startedAt, attempts };
          logger.debug("Gemini respondeu", {
            model, attempts, latencyMs: result.latencyMs, truncated: out.truncated, blocked: out.blocked, usage: out.usage,
          });
          return result;
        }

        // Sem texto e sem bloqueio
        if (out.truncated && !emptyRetried) {
          emptyRetried = true;
          thinkingLevel = "low";
          maxOutputTokens = Math.min((maxOutputTokens ?? cfg.maxOutputTokens) * 2, MODEL_MAX_OUTPUT_TOKENS);
          logger.warn("Gemini sem texto (limite de tokens consumido) — repetindo com thinkingLevel=low e mais tokens", {
            model, maxOutputTokens, usage: out.usage,
          });
          continue;
        }
        lastError = new AIProviderError("empty", "Gemini retornou resposta vazia");
        break; // tenta próximo modelo, se houver
      } catch (err) {
        const e = err instanceof AIProviderError ? err : new AIProviderError("unknown", String((err as Error)?.message ?? err));
        lastError = e;

        if (e.kind === "bad_request" && thinkingLevel) {
          logger.warn("Gemini recusou thinkingConfig — repetindo sem ele", { model, level: thinkingLevel, error: e.message });
          rejectedThinking.add(`${model}|${thinkingLevel}`);
          thinkingLevel = undefined;
          continue;
        }
        if ((e.kind === "unavailable" || e.kind === "timeout") && transientTries < BACKOFF_MS.length) {
          const wait = BACKOFF_MS[transientTries++];
          logger.warn("Falha transitória no Gemini — tentando de novo", { model, kind: e.kind, wait, error: e.message });
          await sleep(wait);
          continue;
        }
        if (e.kind === "auth" || e.kind === "bad_request") throw e; // fallback não resolve chave/requisição inválida
        break; // rate_limit, esgotou retries ou unknown → tenta próximo modelo
      }
    }
  }

  throw lastError ?? new AIProviderError("unknown", "Falha desconhecida ao chamar Gemini");
}

/** Verificação NÃO fatal no boot: confirma que o modelo configurado existe para esta chave. */
export async function checkModelAvailable(): Promise<void> {
  const cfg = getGeminiConfig();
  try {
    const res = await fetch(`${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}`, {
      headers: { "x-goog-api-key": cfg.apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      logger.info(`Gemini: modelo "${cfg.model}" disponível ✅`);
    } else {
      logger.warn(`Gemini: não foi possível confirmar o modelo "${cfg.model}" (HTTP ${res.status}). Confira GEMINI_MODEL e a chave.`);
    }
  } catch (err) {
    logger.warn("Gemini: verificação do modelo falhou (rede/timeout) — seguindo mesmo assim", { error: String(err) });
  }
}
