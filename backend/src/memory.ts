import fs from "fs";
import path from "path";
import { UserMemory } from "./types";

// Memórias salvas em arquivo JSON local (uma entrada por sessionId)
const MEMORY_FILE = path.resolve(__dirname, "../data/memories.json");

// ─── Helpers de I/O ──────────────────────────────────────────────────────────

function loadAll(): Record<string, UserMemory> {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return {};
    const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, UserMemory>): void {
  const dir = path.dirname(MEMORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ─── API pública ─────────────────────────────────────────────────────────────

export function getMemory(sessionId: string): UserMemory {
  const all = loadAll();
  return (
    all[sessionId] ?? {
      interesses: [],
      preferencias: [],
      metas: [],
      acoes_sustentaveis: [],
      pontuacao_crisomoeda: 0,
      historico: [],
    }
  );
}

export function saveMemory(sessionId: string, memory: UserMemory): void {
  const all = loadAll();
  all[sessionId] = { ...memory, ultimaConversa: new Date().toISOString() };
  saveAll(all);
}

export function clearMemory(sessionId: string): void {
  const all = loadAll();
  delete all[sessionId];
  saveAll(all);
}

// ─── Extração automática de dados da mensagem ────────────────────────────────

export function extractFromMessage(
  message: string,
  memory: UserMemory
): UserMemory {
  const updated = { ...memory };
  const msg = message.toLowerCase();

  // Nome
  const nomeMatch = msg.match(
    /(?:me chamo|meu nome[eé\s]+|sou o?a?\s+|pode me chamar de)\s+([a-záéíóúãõâêôàç]+(?:\s[a-záéíóúãõâêôàç]+)?)/i
  );
  if (nomeMatch) updated.nome = capitalize(nomeMatch[1].trim());

  // Cidade
  const cidadeMatch = msg.match(
    /(?:moro em|sou de|vim de|nasci em|minha cidade[eé\s]+)\s+([a-záéíóúãõâêôàç\s]+?)(?:\.|,|$)/i
  );
  if (cidadeMatch) updated.cidade = capitalize(cidadeMatch[1].trim());

  // Idade
  const idadeMatch = msg.match(/(?:tenho|com)\s+(\d{1,2})\s+anos/i);
  if (idadeMatch) updated.idade = idadeMatch[1];

  // Profissão
  const profMatch = msg.match(
    /(?:sou|trabalho como|atuo como)\s+(estudante|programador|desenvolvedor|professor|designer|engenheiro|agricultor|reciclador)[a]?/i
  );
  if (profMatch) updated.profissao = capitalize(profMatch[1]);

  // Interesses
  const interesseMatch = msg.match(
    /(?:gosto de|curto|tenho interesse em|adoro|amo)\s+([a-záéíóúãõâêôàç\s]+?)(?:\.|,|e |$)/i
  );
  if (interesseMatch) {
    const interesse = capitalize(interesseMatch[1].trim());
    if (!updated.interesses.includes(interesse)) {
      updated.interesses = [...updated.interesses, interesse];
    }
  }

  // Metas sustentáveis
  const metaMatch = msg.match(
    /(?:quero|vou|pretendo|minha meta[eé\s]+)\s+(reciclar|plantar|economizar|reduzir|preservar|compostar)[^.,$]*/i
  );
  if (metaMatch) {
    const meta = capitalize(metaMatch[0].trim());
    if (!updated.metas.includes(meta)) {
      updated.metas = [...updated.metas, meta];
    }
  }

  // Solicitação de apagar memória
  if (
    msg.includes("apague minha memória") ||
    msg.includes("esqueça tudo") ||
    msg.includes("apaga tudo")
  ) {
    return {
      interesses: [],
      preferencias: [],
      metas: [],
      acoes_sustentaveis: [],
      pontuacao_crisomoeda: memory.pontuacao_crisomoeda,
      historico: [],
    };
  }

  // Esquecer campo específico
  if (msg.includes("esqueça meu nome") || msg.includes("esquece meu nome")) {
    delete updated.nome;
  }
  if (msg.includes("esqueça minha cidade") || msg.includes("esquece minha cidade")) {
    delete updated.cidade;
  }

  return updated;
}

// ─── Gera bloco de contexto para o system prompt ─────────────────────────────

export function buildMemoryContext(memory: UserMemory): string {
  const lines: string[] = [];

  if (memory.nome) lines.push(`- Nome do usuário: ${memory.nome}`);
  if (memory.cidade) lines.push(`- Cidade: ${memory.cidade}`);
  if (memory.idade) lines.push(`- Idade: ${memory.idade} anos`);
  if (memory.profissao) lines.push(`- Profissão: ${memory.profissao}`);
  if (memory.interesses.length)
    lines.push(`- Interesses: ${memory.interesses.join(", ")}`);
  if (memory.metas.length)
    lines.push(`- Metas sustentáveis: ${memory.metas.join(", ")}`);
  if (memory.acoes_sustentaveis.length)
    lines.push(`- Ações ecológicas: ${memory.acoes_sustentaveis.join(", ")}`);
  if (memory.pontuacao_crisomoeda > 0)
    lines.push(`- Crisomoedas acumuladas: ${memory.pontuacao_crisomoeda}`);
  if (memory.ultimaConversa)
    lines.push(`- Última conversa: ${new Date(memory.ultimaConversa).toLocaleDateString("pt-BR")}`);

  if (!lines.length) return "";

  return `\n━━━━━━━━━━━━━━━━━━━━━━━\nMEMÓRIA DO USUÁRIO (use naturalmente na conversa)\n━━━━━━━━━━━━━━━━━━━━━━━\n${lines.join("\n")}\n\nUse essas informações para personalizar respostas. Chame o usuário pelo nome quando souber. Nunca liste a memória em voz alta — use-a de forma natural.\n`;
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function capitalize(str: string): string {
  return str
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}