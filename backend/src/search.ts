import { logger } from "./logger";

// ─── Configuração via variáveis de ambiente ───────────────────────────────────
// Nenhuma chave fica fixa no código. Se SEARCH_PROVIDER não for definido (ou
// for "none"), a busca externa fica desativada e o restante do sistema segue
// funcionando normalmente, mas a CRISO.AI avisa que não tem acesso à internet em vez de simular pesquisa.

export type SearchProvider = "serper" | "tavily" | "none";

function getProvider(): SearchProvider {
  const raw = (process.env.SEARCH_PROVIDER || "none").toLowerCase().trim();
  if (raw === "serper" || raw === "tavily") return raw;
  return "none";
}

function getApiKey(): string | undefined {
  return process.env.SEARCH_API_KEY?.trim() || undefined;
}

function getTimeoutMs(): number {
  const raw = parseInt(process.env.SEARCH_TIMEOUT || "5000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 5000; // 5s por padrão
}

function getCacheTtlMs(): number {
  const raw = parseInt(process.env.CACHE_TTL || "300", 10); // segundos
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 300;
  return seconds * 1000;
}

/** Busca externa está pronta pra uso (provider + chave configurados). */
export function isSearchProviderConfigured(): boolean {
  return getProvider() !== "none" && !!getApiKey();
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOutcome {
  results: SearchResult[];
  cached: boolean;
}

// ─── Heurística: a mensagem parece precisar de informação em tempo real? ─────
// (usada por ai/chat.ts). Trabalha sobre o texto SEM acentos e em minúsculas, então "cotação",
// "cotaçao" e "cotacao" valem igual.
//
// Cada acionamento (com pesquisa configurada) custa dinheiro e envia a mensagem a um provedor
// externo, então palavras ambíguas ("agora", "atual", "resultado", "caiu") só valem COM contexto:
// "valeu, agora entendi" ou "o resultado de 8/2" não disparam pesquisa.

/** Termos que, sozinhos, indicam dado em tempo real. */
const STRONG_TERMS = [
  "noticia", "cotacao", "dolar", "euro hoje", "bitcoin", "placar", "quem ganhou",
  "previsao do tempo", "clima", "temperatura", "preco atual", "fora do ar",
  "essa semana", "esta semana", "esse ano", "este ano", "lancamento", "ao vivo",
];

/** Palavra ambígua só conta se houver uma destas "âncoras" no texto. */
const CONTEXTUAL: RegExp[] = [
  // "atual" ligado a cargo, preço ou versão ("presidente atual", "versão atual")
  /\b(presidente|ceo|prefeito|governador|ministro|campeao|lider|preco|valor|versao|taxa|selic|inflacao|salario minimo)\b.{0,25}\batual\b|\batual\b.{0,15}\b(presidente|ceo|prefeito|governador|ministro|campeao|lider|preco|valor|versao|taxa|selic|inflacao)\b/,
  // "último/última" ligado a produto, versão ou novidade ("último iPhone", "último modelo")
  /\bultim[oa]s?\b.{0,25}\b(modelo|versao|lancamento|lancad[oa]s?|noticias?|atualizacao|jogo|filme|album|temporada|episodio|edicao|release|iphone|android|gemini|chatgpt|claude)\b/,
  // "resultado" ligado a competição ou sorteio
  /\bresultado\b.{0,25}\b(jogo|mega|loteria|quina|eleicao|concurso|enem|sorteio|rodada|partida|campeonato|prova|vestibular)\b|\b(mega ?sena|loteria|quina)\b/,
  // jogo/partida com marcador de tempo ("jogo do Bahia ontem")
  /\b(jogo|partida|rodada)\b.{0,30}\b(hoje|ontem|amanha|ao vivo|agora)\b/,
  // "hoje/agora" ligado a disponibilidade ou preço
  /\b(hoje|agora|hj)\b.{0,30}\b(aberto|online|funcionando|disponivel|custa|vale|cotacao|preco|passando|acontecendo)\b|\b(cotacao|preco|dolar|euro)\b.{0,30}\b(hoje|agora|hj)\b/,
  // "caiu / está funcionando" ligado a serviço ("o ChatGPT caiu?")
  /\b(site|servidor|app|aplicativo|internet|chatgpt|gemini|instagram|whatsapp|youtube|sistema|rede|servico|api|claude|github|vercel|railway)\b.{0,30}\b(caiu|fora do ar|esta funcionando|tem instabilidade)\b|\b(caiu|esta funcionando)\b.{0,20}\b(site|servidor|app|aplicativo|internet|chatgpt|gemini|instagram|whatsapp|youtube|sistema|rede|servico|api|claude|github|vercel|railway)\b/,
];

function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
}

export function needsWebSearch(message: string): boolean {
  const t = normalizeText(message);
  return STRONG_TERMS.some((kw) => t.includes(kw)) || CONTEXTUAL.some((re) => re.test(t));
}

// ─── Cache em memória (TTL configurável) ──────────────────────────────────────
// Suficiente para um único processo/instância. Perguntas repetidas como
// "cotação do dólar", "clima" ou "notícias" reaproveitam o resultado por
// alguns minutos, evitando bater na API de busca a cada mensagem.

interface CacheEntry {
  results: SearchResult[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 500; // limite simples pra não crescer indefinidamente

function cacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function getFromCache(query: string): SearchResult[] | null {
  const entry = cache.get(cacheKey(query));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(query));
    return null;
  }
  return entry.results;
}

function setCache(query: string, results: SearchResult[]): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // remove a entrada mais antiga (primeira inserida) — eviction simples
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(cacheKey(query), { results, expiresAt: Date.now() + getCacheTtlMs() });
}

// ─── Providers ─────────────────────────────────────────────────────────────

async function fetchSerper(
  query: string,
  apiKey: string,
  signal: AbortSignal
): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num: 5 }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Serper respondeu ${res.status}`);
  }

  const data = (await res.json()) as {
    organic?: { title?: string; link?: string; snippet?: string }[];
  };

  return (data.organic ?? [])
    .filter((r) => r.title && r.link)
    .slice(0, 5)
    .map((r) => ({
      title: r.title!,
      url: r.link!,
      snippet: r.snippet ?? "",
    }));
}

async function fetchTavily(
  query: string,
  apiKey: string,
  signal: AbortSignal
): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 5,
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Tavily respondeu ${res.status}`);
  }

  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };

  return (data.results ?? [])
    .filter((r) => r.title && r.url)
    .slice(0, 5)
    .map((r) => ({
      title: r.title!,
      url: r.url!,
      snippet: r.content ?? "",
    }));
}

// ─── API pública ───────────────────────────────────────────────────────────
/**
 * Busca resultados na web para `query`, com cache, timeout e logs
 * estruturados. NUNCA lança exceção — em qualquer falha (timeout, erro de
 * rede, provider fora do ar, chave inválida, limite excedido) retorna `null`
 * e quem chamou decide o fallback (nunca deve interromper a conversa).
 */
export async function webSearch(query: string): Promise<SearchOutcome | null> {
  const provider = getProvider();
  const apiKey = getApiKey();

  if (provider === "none" || !apiKey) {
    return null; // busca externa não configurada — quem chamou decide o fallback
  }

  const cached = getFromCache(query);
  if (cached) {
    logger.debug("Cache HIT", { query, provider, count: cached.length });
    return { results: cached, cached: true };
  }
  logger.debug("Cache MISS", { query, provider });

  const controller = new AbortController();
  const timeoutMs = getTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = Date.now();
  logger.info("Pesquisa iniciada", { query, provider, timeoutMs });

  try {
    const results =
      provider === "serper"
        ? await fetchSerper(query, apiKey, controller.signal)
        : await fetchTavily(query, apiKey, controller.signal);

    const elapsedMs = Date.now() - startedAt;
    logger.info("Pesquisa concluída", {
      query,
      provider,
      elapsedMs,
      count: results.length,
    });

    if (results.length) setCache(query, results);

    return { results, cached: false };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const aborted = controller.signal.aborted;

    logger.warn("Erro na pesquisa", {
      query,
      provider,
      elapsedMs,
      timeout: aborted,
      error: String(error),
    });
    logger.warn("Fallback ativado", { query, reason: aborted ? "timeout" : "erro" });

    return null; // a conversa segue só com a IA (sem pesquisa) — nunca quebra o sistema
  } finally {
    clearTimeout(timer);
  }
}
