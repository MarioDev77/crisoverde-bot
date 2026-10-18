/**
 * memory.ts — memória da CRISO.AI por usuário (PostgreSQL, tabela `memories`, coluna JSONB).
 *
 * Evolução da versão anterior, SEM nova tabela e compatível com os registros já gravados:
 *  - extração por regras mais rígidas (menos falsos positivos);
 *  - dados temporários x duradouros (expiração por tipo);
 *  - filtro de dados sensíveis e de tentativas de injeção;
 *  - idade deixou de ser coletada e de ir para o prompt;
 *  - funções para o usuário consultar, corrigir e apagar o que está guardado.
 */
import { Pool } from "pg";
import { UserMemory } from "./types";

// ─── Conexão com o PostgreSQL do Railway ─────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // obrigatório no Railway
});

export async function initDB(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memories (
      session_id  TEXT PRIMARY KEY,
      data        JSONB        NOT NULL,
      updated_at  TIMESTAMPTZ  DEFAULT NOW()
    )
  `);
}

// ─── Política de retenção ─────────────────────────────────────────────────────
// Duradouro: nome e cidade (só saem se o usuário apagar).
// Com validade: profissão e interesses (1 ano) e metas (90 dias — são temporárias por natureza).

const DAY_MS = 86_400_000;
export const RETENTION_DAYS = { profissao: 365, interesses: 365, metas: 90 } as const;
export const LIMITS = { interesses: 8, metas: 5, nome: 40, cidade: 60, profissao: 40, item: 60 } as const;
/** Itens mais antigos que isso aparecem para a IA com aviso de "pode estar desatualizado". */
const STALE_HINT_DAYS = 90;

export function emptyMemory(): UserMemory {
  return {
    interesses: [],
    preferencias: [],
    metas: [],
    acoes_sustentaveis: [],
    pontuacao_crisomoeda: 0,
    historico: [],
    datas: {},
  };
}

// ─── Normalização (lê registros antigos e novos) ──────────────────────────────

const asStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const asStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];

export function normalizeMemory(raw: unknown, now: Date = new Date()): UserMemory {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const datas: Record<string, string> = {};
  if (r.datas && typeof r.datas === "object") {
    for (const [k, v] of Object.entries(r.datas as Record<string, unknown>)) {
      if (typeof v === "string" && Number.isFinite(Date.parse(v))) datas[k] = v;
    }
  }

  const mem: UserMemory = {
    nome: asStr(r.nome),
    cidade: asStr(r.cidade),
    idade: asStr(r.idade),
    profissao: asStr(r.profissao),
    interesses: asStrArr(r.interesses),
    preferencias: asStrArr(r.preferencias),
    metas: asStrArr(r.metas),
    acoes_sustentaveis: asStrArr(r.acoes_sustentaveis),
    pontuacao_crisomoeda:
      typeof r.pontuacao_crisomoeda === "number" && Number.isFinite(r.pontuacao_crisomoeda)
        ? r.pontuacao_crisomoeda
        : 0,
    historico: asStrArr(r.historico),
    ultimaConversa: asStr(r.ultimaConversa),
    datas,
  };

  // Registros antigos não têm data: o relógio de validade começa agora (nada é apagado de surpresa).
  const iso = now.toISOString();
  if (mem.profissao && !datas.profissao) datas.profissao = iso;
  for (const i of mem.interesses) if (!datas[`interesses:${i}`]) datas[`interesses:${i}`] = iso;
  for (const m of mem.metas) if (!datas[`metas:${m}`]) datas[`metas:${m}`] = iso;

  return mem;
}

function isExpired(iso: string | undefined, days: number, now: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && now.getTime() - t > days * DAY_MS;
}

/** Remove o que passou da validade e limpa datas órfãs. Não altera o objeto recebido. */
export function pruneExpired(memory: UserMemory, now: Date = new Date()): UserMemory {
  const mem = normalizeMemory(memory, now);
  const datas = { ...(mem.datas ?? {}) };

  if (mem.profissao && isExpired(datas.profissao, RETENTION_DAYS.profissao, now)) {
    delete mem.profissao;
  }
  mem.interesses = mem.interesses.filter((i) => !isExpired(datas[`interesses:${i}`], RETENTION_DAYS.interesses, now));
  mem.metas = mem.metas.filter((m) => !isExpired(datas[`metas:${m}`], RETENTION_DAYS.metas, now));

  const alive = new Set<string>();
  if (mem.profissao) alive.add("profissao");
  mem.interesses.forEach((i) => alive.add(`interesses:${i}`));
  mem.metas.forEach((m) => alive.add(`metas:${m}`));
  for (const k of Object.keys(datas)) if (!alive.has(k)) delete datas[k];

  mem.datas = datas;
  return mem;
}

// ─── API pública (banco) ──────────────────────────────────────────────────────

export async function getMemory(sessionId: string): Promise<UserMemory> {
  const res = await pool.query("SELECT data FROM memories WHERE session_id = $1", [sessionId]);
  return pruneExpired(res.rows[0]?.data ?? emptyMemory());
}

/** `touch: false` preserva `ultimaConversa` (ex.: usuário só editou a própria memória). */
export async function saveMemory(
  sessionId: string,
  memory: UserMemory,
  opts: { touch?: boolean } = {}
): Promise<void> {
  const clean = pruneExpired(memory);
  const data = opts.touch === false ? clean : { ...clean, ultimaConversa: new Date().toISOString() };
  await pool.query(
    `INSERT INTO memories (session_id, data, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (session_id)
     DO UPDATE SET data = $2, updated_at = NOW()`,
    [sessionId, JSON.stringify(data)]
  );
}

export async function clearMemory(sessionId: string): Promise<void> {
  await pool.query("DELETE FROM memories WHERE session_id = $1", [sessionId]);
}

// Remove sessões sem atividade há X dias — chame periodicamente ou via rota admin
export async function cleanOldSessions(days: number = 30): Promise<number> {
  // Intervalo parametrizado (em vez de interpolar a string) — evita SQL injection.
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30;
  const res = await pool.query(
    `DELETE FROM memories WHERE updated_at < NOW() - ($1 || ' days')::interval RETURNING session_id`,
    [safeDays]
  );
  return res.rowCount ?? 0;
}

// ─── Segurança dos valores guardados ──────────────────────────────────────────

// Heurística (não é perfeita): evita guardar categorias sensíveis, contatos, números longos e
// textos que pareçam instruções para a IA. Tudo isso iria para o prompt em mensagens futuras.
const SENSITIVE_RE =
  /(?<![\p{L}])(senha|password|cpf|rg|cart[aã]o|pix|conta banc\w*|depress\w*|ansied\w*|suic\w*|diagn[oó]stic\w*|doen[cç]a\w*|medicament\w*|rem[eé]dio\w*|c[aâ]ncer|religi\w*|igreja|crente|ateu|partido|elei[cç]\w*|pol[ií]tic\w*|gay|l[eé]sbica|sexual\w*|namorad\w*|gravidez|gr[aá]vida|defici[eê]ncia|autis\w*|tdah)(?![\p{L}])/iu;
const INJECTION_RE =
  /(?<![\p{L}])(ignor\w*|instru[cç]\w*|prompt|system|sistema|regras?|esque[cç]\w*|jailbreak|assistente|gemini|claude)(?![\p{L}])/iu;

function isUnsafeValue(text: string): boolean {
  return (
    /\d{5,}/.test(text) ||
    /@/.test(text) ||
    /https?:|www\./i.test(text) ||
    SENSITIVE_RE.test(text) ||
    INJECTION_RE.test(text)
  );
}

/** Limpa e valida um valor de memória. Retorna null se vazio, longo demais ou inseguro. */
function cleanValue(raw: string, maxLen: number): string | null {
  const v = raw
    .replace(/[\u0000-\u001F\u007F<>{}\[\]`\\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.!?,;:\s]+$/g, "")
    .trim();
  if (!v || v.length > maxLen) return null;
  if (isUnsafeValue(v)) return null;
  return v;
}

const LETTERS_ONLY_RE = /^[\p{L}][\p{L}\s'’-]*$/u;

const PARTICLES = new Set(["de", "da", "do", "das", "dos"]);
const STOP = new Set([
  "e", "eu", "mas", "que", "sou", "tenho", "moro", "vim", "to", "tô", "estou", "ou", "sim", "não", "nao",
  "com", "em", "de", "da", "do", "na", "no", "um", "uma", "o", "a", "os", "as", "por", "pra", "para", "se",
  "me", "meu", "minha", "gosto", "quero", "vou", "fui", "era", "tem", "aqui", "ai", "aí", "né", "ne", "kk",
  "kkk", "oi", "olá", "ola", "bom", "boa", "tudo", "bem", "mesmo", "tbm", "também", "tambem", "hoje",
  "agora", "muito", "pouco", "porque", "pq", "pois", "quando", "então", "entao",
]);
const CITY_BAD = new Set(["casa", "apartamento", "sítio", "sitio", "paz", "mundo", "lugar"]);

function titleCase(words: string[]): string {
  return words
    .map((w, i) => (i > 0 && PARTICLES.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Extração automática de dados da mensagem ────────────────────────────────

const NAME_RE = /(?<!n[aã]o\s)(?:me chamo|meu nome (?:é|e)|pode me chamar de)\s+([\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2})/iu;
const CITY_RE = /(?<!n[aã]o\s)(?:moro (?:em|na|no)|nasci em|minha cidade (?:é|e))\s+([\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,5})/iu;
const PROF_RE =
  /(?<!n[aã]o\s)(?:sou|trabalho como|atuo como)\s+(?:um\s+|uma\s+)?(estudante|programador(?:a)?|desenvolvedor(?:a)?|professor(?:a)?|designer|engenheiro(?:a)?|agricultor(?:a)?|reciclador(?:a)?)(?![\p{L}])/iu;
const INTEREST_RE =
  /(?<![\p{L}])(?:gosto (?:muito )?de|adoro|amo|me interesso por|tenho interesse em)\s+([^.,;!?\n]{2,60})/giu;
const GOAL_RE =
  /(?<![\p{L}])(?:quero|vou|pretendo|minha meta (?:é|e))\s+((?:reciclar|plantar|economizar|reduzir|preservar|compostar)[^.,;!?\n]{0,50})/giu;

function addItem(mem: UserMemory, campo: "interesses" | "metas", valor: string, nowIso: string): void {
  const list = mem[campo];
  const idx = list.findIndex((x) => x.toLowerCase() === valor.toLowerCase());
  const datas = (mem.datas ??= {});
  if (idx >= 0) {
    const existing = list[idx];
    list.splice(idx, 1);
    list.push(existing); // reconfirmado: renova a validade
    datas[`${campo}:${existing}`] = nowIso;
    return;
  }
  list.push(valor);
  datas[`${campo}:${valor}`] = nowIso;
  while (list.length > LIMITS[campo]) {
    const dropped = list.shift()!;
    delete datas[`${campo}:${dropped}`];
  }
}

function precededByNegation(text: string, index: number): boolean {
  return /n[aã]o\s*$/i.test(text.slice(Math.max(0, index - 12), index));
}

export function extractFromMessage(message: string, memory: UserMemory, now: Date = new Date()): UserMemory {
  const lower = message.toLowerCase();

  // Pedido de apagar tudo (mantém o saldo de Crisomoedas, como antes)
  if (lower.includes("apague minha memória") || lower.includes("esqueça tudo") || lower.includes("apaga tudo")) {
    return { ...emptyMemory(), pontuacao_crisomoeda: memory.pontuacao_crisomoeda ?? 0 };
  }

  const mem = normalizeMemory(memory, now);
  const nowIso = now.toISOString();
  mem.interesses = [...mem.interesses];
  mem.metas = [...mem.metas];
  mem.datas = { ...(mem.datas ?? {}) };

  // Nome
  const nameMatch = message.match(NAME_RE);
  if (nameMatch) {
    const words: string[] = [];
    for (const t of nameMatch[1].split(/\s+/)) {
      if (STOP.has(t.toLowerCase()) || t.length < 2 || t.length > 20) break;
      words.push(t);
      if (words.length === 2) break;
    }
    const value = words.length ? cleanValue(titleCase(words), LIMITS.nome) : null;
    if (value && LETTERS_ONLY_RE.test(value)) mem.nome = value;
  }

  // Cidade
  const cityMatch = message.match(CITY_RE);
  if (cityMatch) {
    const words: string[] = [];
    let content = 0;
    for (const t of cityMatch[1].split(/\s+/)) {
      const tl = t.toLowerCase();
      if (content > 0 && PARTICLES.has(tl)) { words.push(t); continue; }
      if (STOP.has(tl) || CITY_BAD.has(tl)) break;
      words.push(t);
      if (++content === 3) break;
    }
    while (words.length && PARTICLES.has(words[words.length - 1].toLowerCase())) words.pop();
    const value = content > 0 ? cleanValue(titleCase(words), LIMITS.cidade) : null;
    if (value && LETTERS_ONLY_RE.test(value)) mem.cidade = value;
  }

  // Profissão (lista fechada)
  const profMatch = message.match(PROF_RE);
  if (profMatch) {
    mem.profissao = sentenceCase(profMatch[1].toLowerCase());
    mem.datas.profissao = nowIso;
  }

  // Interesses ("não gosto de X" é ignorado)
  for (const m of message.matchAll(INTEREST_RE)) {
    if (precededByNegation(message, m.index ?? 0)) continue;
    const phrase = m[1].split(/\s+(?:e|mas|porque|pq|pois|que|quando|então|entao)\s+/i)[0];
    const tokens = phrase.trim().split(/\s+/).slice(0, 5);
    if (!tokens.length || STOP.has(tokens[0].toLowerCase())) continue;
    const value = cleanValue(sentenceCase(tokens.join(" ")), LIMITS.item);
    if (value) addItem(mem, "interesses", value, nowIso);
  }

  // Metas sustentáveis ("não quero reciclar" é ignorado)
  for (const m of message.matchAll(GOAL_RE)) {
    if (precededByNegation(message, m.index ?? 0)) continue;
    const value = cleanValue(sentenceCase(m[1].trim()), LIMITS.item);
    if (value) addItem(mem, "metas", value, nowIso);
  }

  // Esquecer campo específico
  if (lower.includes("esqueça meu nome") || lower.includes("esquece meu nome")) delete mem.nome;
  if (lower.includes("esqueça minha cidade") || lower.includes("esquece minha cidade")) delete mem.cidade;
  if (lower.includes("esqueça minha profissão") || lower.includes("esquece minha profissão")) {
    delete mem.profissao;
    delete mem.datas.profissao;
  }

  return pruneExpired(mem, now);
}

// ─── Bloco de contexto para o prompt (apenas DADOS) ──────────────────────────
// As instruções de uso ficam no prompt confiável (prompts/index.ts). A idade NÃO é enviada.

function staleSuffix(mem: UserMemory, key: string, now: Date): string {
  return isExpired(mem.datas?.[key], STALE_HINT_DAYS, now) ? " [informado há mais de 3 meses]" : "";
}

export function buildMemoryContext(memory: UserMemory, now: Date = new Date()): string {
  const mem = normalizeMemory(memory, now);
  const lines: string[] = [];

  if (mem.nome) lines.push(`- Nome: ${mem.nome}`);
  if (mem.cidade) lines.push(`- Cidade: ${mem.cidade}`);
  if (mem.profissao) lines.push(`- Ocupação: ${mem.profissao}${staleSuffix(mem, "profissao", now)}`);
  if (mem.interesses.length)
    lines.push(`- Interesses: ${mem.interesses.map((i) => i + staleSuffix(mem, `interesses:${i}`, now)).join("; ")}`);
  if (mem.metas.length)
    lines.push(`- Metas sustentáveis: ${mem.metas.map((m) => m + staleSuffix(mem, `metas:${m}`, now)).join("; ")}`);
  if (mem.acoes_sustentaveis.length) lines.push(`- Ações ecológicas: ${mem.acoes_sustentaveis.join("; ")}`);
  if (mem.pontuacao_crisomoeda > 0)
    lines.push(`- Crisomoedas registradas: ${mem.pontuacao_crisomoeda} (valor registrado, pode estar desatualizado)`);
  if (mem.ultimaConversa) lines.push(`- Última conversa: ${new Date(mem.ultimaConversa).toLocaleDateString("pt-BR")}`);

  return lines.join("\n");
}

// ─── Consulta, correção e exclusão pelo próprio usuário ──────────────────────

export interface MemoryEdit {
  set?: { nome?: string | null; cidade?: string | null; profissao?: string | null };
  add?: { interesses?: string[]; metas?: string[] };
  remove?: { interesses?: string[]; metas?: string[]; campos?: Array<"nome" | "cidade" | "profissao" | "idade"> };
}

const SET_FIELDS = ["nome", "cidade", "profissao"] as const;
const REMOVABLE_FIELDS = ["nome", "cidade", "profissao", "idade"] as const;

/** Valida o formato do corpo recebido pela API. Nunca confia no que veio do cliente. */
export function parseMemoryEdit(body: unknown): { edit?: MemoryEdit; error?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Corpo da requisição inválido." };
  const b = body as Record<string, unknown>;
  const edit: MemoryEdit = {};

  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const strList = (v: unknown, max: number): string[] | null =>
    Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && x.length <= 200) ? (v as string[]) : null;

  if (b.set !== undefined) {
    if (!isObj(b.set)) return { error: "'set' inválido." };
    const set: NonNullable<MemoryEdit["set"]> = {};
    for (const k of SET_FIELDS) {
      const v = (b.set as Record<string, unknown>)[k];
      if (v === undefined) continue;
      if (v !== null && typeof v !== "string") return { error: `'${k}' deve ser texto ou null.` };
      set[k] = v as string | null;
    }
    edit.set = set;
  }

  if (b.add !== undefined) {
    if (!isObj(b.add)) return { error: "'add' inválido." };
    const add: NonNullable<MemoryEdit["add"]> = {};
    for (const k of ["interesses", "metas"] as const) {
      const v = (b.add as Record<string, unknown>)[k];
      if (v === undefined) continue;
      const list = strList(v, 5);
      if (!list) return { error: `'add.${k}' deve ser uma lista de até 5 textos.` };
      add[k] = list;
    }
    edit.add = add;
  }

  if (b.remove !== undefined) {
    if (!isObj(b.remove)) return { error: "'remove' inválido." };
    const remove: NonNullable<MemoryEdit["remove"]> = {};
    for (const k of ["interesses", "metas"] as const) {
      const v = (b.remove as Record<string, unknown>)[k];
      if (v === undefined) continue;
      const list = strList(v, 20);
      if (!list) return { error: `'remove.${k}' deve ser uma lista de até 20 textos.` };
      remove[k] = list;
    }
    const campos = (b.remove as Record<string, unknown>).campos;
    if (campos !== undefined) {
      if (!Array.isArray(campos) || !campos.every((c) => (REMOVABLE_FIELDS as readonly string[]).includes(c as string))) {
        return { error: "'remove.campos' contém campo inválido." };
      }
      remove.campos = campos as Array<"nome" | "cidade" | "profissao" | "idade">;
    }
    edit.remove = remove;
  }

  if (!edit.set && !edit.add && !edit.remove) return { error: "Nada para alterar." };
  return { edit };
}

export function applyMemoryEdit(
  memory: UserMemory,
  edit: MemoryEdit,
  now: Date = new Date()
): { memory: UserMemory; rejected: string[] } {
  const mem = normalizeMemory(memory, now);
  mem.interesses = [...mem.interesses];
  mem.metas = [...mem.metas];
  mem.datas = { ...(mem.datas ?? {}) };
  const nowIso = now.toISOString();
  const rejected: string[] = [];
  const label = { nome: "Nome", cidade: "Cidade", profissao: "Ocupação" } as const;

  // Remoções primeiro (o usuário pode trocar um valor removendo e adicionando na mesma chamada)
  if (edit.remove) {
    for (const campo of edit.remove.campos ?? []) {
      delete mem[campo];
      if (campo === "profissao") delete mem.datas.profissao;
    }
    for (const campo of ["interesses", "metas"] as const) {
      for (const v of edit.remove[campo] ?? []) {
        const idx = mem[campo].findIndex((x) => x.toLowerCase() === v.trim().toLowerCase());
        if (idx >= 0) {
          const [gone] = mem[campo].splice(idx, 1);
          delete mem.datas[`${campo}:${gone}`];
        }
      }
    }
  }

  if (edit.set) {
    for (const campo of SET_FIELDS) {
      if (!(campo in edit.set)) continue;
      const raw = edit.set[campo];
      if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
        delete mem[campo];
        if (campo === "profissao") delete mem.datas.profissao;
        continue;
      }
      const value = cleanValue(String(raw), LIMITS[campo]);
      if (!value || !LETTERS_ONLY_RE.test(value)) {
        rejected.push(`${label[campo]}: não consigo guardar esse valor (use só letras, sem dados pessoais sensíveis).`);
        continue;
      }
      mem[campo] = value;
      if (campo === "profissao") mem.datas.profissao = nowIso;
    }
  }

  if (edit.add) {
    for (const campo of ["interesses", "metas"] as const) {
      for (const raw of edit.add[campo] ?? []) {
        const value = cleanValue(raw, LIMITS.item);
        if (!value) {
          rejected.push(`"${raw.slice(0, 30)}": não consigo guardar esse tipo de informação.`);
          continue;
        }
        addItem(mem, campo, sentenceCase(value), nowIso);
      }
    }
  }

  return { memory: pruneExpired(mem, now), rejected };
}

/** O que o usuário vê: tudo o que está guardado sobre ele, sem campos internos. */
export function memoryView(memory: UserMemory) {
  const m = normalizeMemory(memory);
  return {
    nome: m.nome ?? null,
    cidade: m.cidade ?? null,
    profissao: m.profissao ?? null,
    idade: m.idade ?? null,
    interesses: m.interesses,
    metas: m.metas,
    outros: {
      preferencias: m.preferencias,
      acoes_sustentaveis: m.acoes_sustentaveis,
      historico: m.historico,
    },
    ultimaConversa: m.ultimaConversa ?? null,
    retencaoDias: RETENTION_DAYS,
    limites: { interesses: LIMITS.interesses, metas: LIMITS.metas },
  };
}
