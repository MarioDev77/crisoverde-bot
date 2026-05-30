import { Pool } from "pg";
import { UserMemory } from "./types";

// ─── Conexão com o PostgreSQL do Railway ─────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // obrigatório no Railway
});

// ─── Inicialização — cria a tabela se não existir ────────────────────────────

export async function initDB(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memories (
      session_id  TEXT PRIMARY KEY,
      data        JSONB        NOT NULL,
      updated_at  TIMESTAMPTZ  DEFAULT NOW()
    )
  `);
}

// ─── API pública ─────────────────────────────────────────────────────────────

export async function getMemory(sessionId: string): Promise<UserMemory> {
  const res = await pool.query(
    "SELECT data FROM memories WHERE session_id = $1",
    [sessionId]
  );
  return (
    res.rows[0]?.data ?? {
      interesses: [],
      preferencias: [],
      metas: [],
      acoes_sustentaveis: [],
      pontuacao_crisomoeda: 0,
      historico: [],
    }
  );
}

export async function saveMemory(
  sessionId: string,
  memory: UserMemory
): Promise<void> {
  const data = { ...memory, ultimaConversa: new Date().toISOString() };
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
  const res = await pool.query(
    "DELETE FROM memories WHERE updated_at < NOW() - INTERVAL '$1 days' RETURNING session_id",
    [days]
  );
  return res.rowCount ?? 0;
}

// ─── Extração automática de dados da mensagem ────────────────────────────────
// (sem alterações — lógica idêntica ao original)

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
  if (
    msg.includes("esqueça minha cidade") ||
    msg.includes("esquece minha cidade")
  ) {
    delete updated.cidade;
  }

  return updated;
}

// ─── Gera bloco de contexto para o system prompt ─────────────────────────────
// (sem alterações — lógica idêntica ao original)

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
    lines.push(
      `- Última conversa: ${new Date(memory.ultimaConversa).toLocaleDateString("pt-BR")}`
    );

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