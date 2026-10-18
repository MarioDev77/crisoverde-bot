/**
 * markdown.ts — parser de markdown MÍNIMO e SEGURO para as respostas da IA.
 *
 * Função pura (sem React): transforma texto em blocos/trechos de dados. Quem renderiza
 * (components/MessageText.tsx) usa só nós React, nunca HTML bruto. Links só aceitam http(s).
 *
 * Suporta: blocos de código (```lang), títulos (#), listas (-, *, 1.), citações (>),
 * parágrafos, e inline: `código`, **negrito**, *itálico*, [texto](https://link), URL solta.
 * Não suporta (de propósito): HTML, tabelas, imagens, listas aninhadas.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; v: string }
  | { t: "italic"; v: string }
  | { t: "code"; v: string }
  | { t: "link"; v: string; href: string }
  | { t: "badge"; v: string };

export type Block =
  | { t: "code"; lang: string; code: string }
  | { t: "heading"; level: number; inline: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "quote"; lines: Inline[][] }
  | { t: "p"; lines: Inline[][] };

// Ordem das alternativas = prioridade. Tudo limitado a uma linha e com tamanhos máximos.
const INLINE_RE = new RegExp(
  [
    "`([^`\\n]{1,300})`", //                                   1: código
    "\\*\\*(?=\\S)([^*\\n]{1,300}?)(?<=\\S)\\*\\*", //         2: negrito
    "\\*(?=\\S)([^*\\n]{1,300}?)(?<=\\S)\\*", //               3: itálico
    "\\[([^\\]\\n]{1,200})\\]\\((https?:\\/\\/[^\\s)]{1,500})\\)", // 4,5: [texto](url)
    "(https?:\\/\\/[^\\s<>()]{1,500}[^\\s<>().,;:!?])", //     6: URL solta
    "(Crisomoedas?)", //                                       7: destaque da moeda social
  ].join("|"),
  "g"
);

export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(line)) !== null) {
    if (m.index > last) out.push({ t: "text", v: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "bold", v: m[2] });
    else if (m[3] !== undefined) out.push({ t: "italic", v: m[3] });
    else if (m[4] !== undefined) out.push({ t: "link", v: m[4], href: m[5] });
    else if (m[6] !== undefined) out.push({ t: "link", v: m[6], href: m[6] });
    else if (m[7] !== undefined) out.push({ t: "badge", v: m[7] });
    last = INLINE_RE.lastIndex;
    if (m[0].length === 0) INLINE_RE.lastIndex++; // segurança contra laço infinito
  }
  if (last < line.length) out.push({ t: "text", v: line.slice(last) });
  return out;
}

const FENCE_OPEN = /^\s*```\s*([\w+#.-]{0,20})\s*$/;
const FENCE_CLOSE = /^\s*```\s*$/;
const HEADING = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/;
const UL = /^\s*[-*•]\s+(.+)$/;
const OL = /^\s*\d{1,3}[.)]\s+(.+)$/;
const QUOTE = /^\s*>\s?(.*)$/;

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: Inline[][] = [];

  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", lines: para });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(FENCE_OPEN);
    if (fence) {
      flushPara();
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) code.push(lines[i++]);
      // sem fence de fechamento (resposta cortada): trata o resto como código
      blocks.push({ t: "code", lang: fence[1] || "", code: code.join("\n") });
      continue;
    }

    if (!line.trim()) { flushPara(); continue; }

    const h = line.match(HEADING);
    if (h) { flushPara(); blocks.push({ t: "heading", level: h[1].length, inline: parseInline(h[2]) }); continue; }

    const ul = line.match(UL);
    if (ul) {
      flushPara();
      const prev = blocks[blocks.length - 1];
      const item = parseInline(ul[1]);
      if (prev && prev.t === "ul") prev.items.push(item); else blocks.push({ t: "ul", items: [item] });
      continue;
    }

    const ol = line.match(OL);
    if (ol) {
      flushPara();
      const prev = blocks[blocks.length - 1];
      const item = parseInline(ol[1]);
      if (prev && prev.t === "ol") prev.items.push(item); else blocks.push({ t: "ol", items: [item] });
      continue;
    }

    const q = line.match(QUOTE);
    if (q) {
      flushPara();
      const prev = blocks[blocks.length - 1];
      const inl = parseInline(q[1]);
      if (prev && prev.t === "quote") prev.lines.push(inl); else blocks.push({ t: "quote", lines: [inl] });
      continue;
    }

    para.push(parseInline(line));
  }
  flushPara();
  return blocks;
}
