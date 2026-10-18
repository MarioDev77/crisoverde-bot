/**
 * context.ts — histórico de conversa: validação, janela por orçamento e formato do Gemini.
 *
 * O histórico chega do cliente (JSON) e NUNCA é confiável: só aceitamos roles "user"/"assistant",
 * conteúdo string, e aplicamos limites de tamanho/quantidade antes de enviar ao modelo.
 */
import { ChatMessage } from "../types";
import { GeminiTurn } from "./gemini";

const MAX_USER_ITEM = 2000;       // igual ao limite de mensagem da rota /chat
const MAX_ASSISTANT_ITEM = 6000;  // respostas com código podem ser longas

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/** Mantém o começo e o fim de textos longos (o fim costuma ter a conclusão / o erro). */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return `${text.slice(0, head)}\n[…trecho omitido…]\n${text.slice(text.length - tail)}`;
}

export function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const clean: ChatMessage[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as Record<string, unknown>).role;
    const content = (item as Record<string, unknown>).content;

    // "system", "developer", "tool" etc. são descartados silenciosamente.
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;

    clean.push({ role, content: clip(content.trim(), role === "user" ? MAX_USER_ITEM : MAX_ASSISTANT_ITEM) });
  }
  return clean;
}

/**
 * Janela de contexto: do mais novo para o mais antigo, até o limite de mensagens
 * (GEMINI_MAX_HISTORY_MESSAGES) e de caracteres (GEMINI_HISTORY_CHAR_BUDGET).
 * A mensagem mais recente do histórico sempre entra (cortada, se preciso).
 */
export function selectHistory(history: ChatMessage[]): ChatMessage[] {
  const maxMessages = envInt("GEMINI_MAX_HISTORY_MESSAGES", 12, 0, 40);
  const charBudget = envInt("GEMINI_HISTORY_CHAR_BUDGET", 12000, 500, 100000);
  if (maxMessages === 0) return [];

  const picked: ChatMessage[] = [];
  let used = 0;

  for (let i = history.length - 1; i >= 0 && picked.length < maxMessages; i--) {
    const msg = history[i];
    const remaining = charBudget - used;
    if (picked.length === 0) {
      const m = { ...msg, content: clip(msg.content, Math.min(msg.content.length, charBudget)) };
      picked.push(m);
      used += m.content.length;
      continue;
    }
    if (msg.content.length > remaining) break;
    picked.push(msg);
    used += msg.content.length;
  }
  return picked.reverse();
}

/**
 * Converte para o formato do Gemini (roles "user"/"model"), garantindo:
 *  - a conversa começa por "user";
 *  - turnos consecutivos do mesmo papel são unidos (ex.: usuário reenviou após um erro).
 */
export function toTurns(history: ChatMessage[], currentUserText: string): GeminiTurn[] {
  const raw: GeminiTurn[] = [
    ...history.map((m) => ({ role: (m.role === "assistant" ? "model" : "user") as "user" | "model", text: m.content })),
    { role: "user", text: currentUserText },
  ];

  const turns: GeminiTurn[] = [];
  for (const t of raw) {
    if (turns.length === 0 && t.role === "model") continue; // descarta "model" inicial
    const last = turns[turns.length - 1];
    if (last && last.role === t.role) last.text += `\n\n${t.text}`;
    else turns.push({ ...t });
  }
  return turns;
}
