/**
 * typing.ts — funções PURAS do efeito "a resposta vai sendo escrita" (sem React, sem DOM).
 *
 * A API devolve a resposta inteira de uma vez; o efeito é só visual, no navegador: o texto completo
 * já existe (e é o que fica salvo/enviado no histórico) e a tela vai revelando um pedaço por vez.
 */

/** Caracteres por segundo: base confortável, mas respostas longas aceleram para terminar em ~6s. */
export function typingSpeed(totalChars: number): number {
  return Math.min(600, Math.max(70, totalChars / 6));
}

/** Quantos caracteres já devem aparecer após `elapsedMs`, sem cortar palavras no meio nem emojis ao meio. */
export function revealLength(text: string, elapsedMs: number): number {
  const total = text.length;
  if (total === 0) return 0;
  let n = Math.floor((Math.max(0, elapsedMs) / 1000) * typingSpeed(total));
  if (n >= total) return total;
  if (n <= 0) return 0;
  // não termina no meio de um par substituto (emoji)
  const code = text.charCodeAt(n - 1);
  if (code >= 0xd800 && code <= 0xdbff) n++;
  // avança até o fim da palavra atual (no máximo 24 caracteres), para a palavra aparecer inteira
  let guard = 0;
  while (n < total && guard < 24 && !/\s/.test(text[n])) {
    n++;
    guard++;
  }
  return Math.min(n, total);
}

const FENCE_LINE = /^\s*```/;

/**
 * Deixa um trecho PARCIAL de markdown "renderizável": fecha, só na prévia, o `código`, o **negrito**
 * ou o bloco ``` que ainda não fechou, e esconde marcadores soltos no fim. Sem isso, a tela mostraria
 * `**` e crases piscando enquanto o texto é escrito. Nunca altera o texto original.
 */
export function balancePartial(partial: string): string {
  const lines = partial.split("\n");
  const fences = lines.filter((l) => FENCE_LINE.test(l)).length;
  if (fences % 2 === 1) return partial; // dentro de um bloco de código: o parser já trata como código até o fim

  const last = lines[lines.length - 1];
  // "`" ou "``" soltos no começo da linha são o início de uma cerca ```: esconde até completar
  if (/^\s*`{1,2}$/.test(last)) return lines.slice(0, -1).join("\n");

  let out = partial;
  const ticks = (last.match(/`/g) || []).length;
  if (ticks % 2 === 1) out += "`";
  const stars = (last.replace(/`[^`]*`?/g, "").match(/\*\*/g) || []).length;
  if (stars % 2 === 1) out += "**";
  // "**" sem texto depois (acabou de abrir): não mostra marcador solto
  if (/\*\*\*\*$/.test(out)) out = out.slice(0, -4);
  return out;
}
