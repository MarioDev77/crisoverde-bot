/**
 * format.ts — funções puras de apresentação do chat (sem React, testáveis em Node).
 */

/** Id local de mensagem/conversa. `crypto.randomUUID` não existe em contexto http inseguro. */
export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // cai no fallback
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** "gemini-3.8-flash" → "Gemini 3.8 Flash". Valor desconhecido segue legível. */
export function formatModel(raw: string | null | undefined): string {
  if (!raw) return "";
  const name = raw.replace(/^models\//, "").trim();
  if (!name) return "";
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

/** Título da conversa a partir da primeira mensagem do usuário. */
export function makeTitle(text: string, max = 42): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "Nova conversa";
  return oneLine.length > max ? `${oneLine.slice(0, max - 1).trimEnd()}…` : oneLine;
}

export type DayGroup = "Hoje" | "Ontem" | "Anteriores";

function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function dayGroup(ts: number, now: number = Date.now()): DayGroup {
  if (sameDay(ts, now)) return "Hoje";
  if (sameDay(ts, now - 24 * 60 * 60 * 1000)) return "Ontem";
  return "Anteriores";
}

/** "Hoje às 15:42", "Ontem às 17:45" ou "15/10/2025". */
export function formatWhen(ts: number, now: number = Date.now()): string {
  const group = dayGroup(ts, now);
  if (group === "Anteriores") return new Date(ts).toLocaleDateString("pt-BR");
  const time = new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${group} às ${time}`;
}

/** Iniciais para o avatar: "Gilvane Alves" → "GA". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}
