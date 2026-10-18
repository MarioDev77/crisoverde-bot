/**
 * Testes do parser de markdown do frontend (função pura, sem React). Foco: segurança dos links,
 * ausência de HTML interpretado, blocos de código e desempenho com entradas hostis.
 */
import assert from "assert";
import { parseInline, parseMarkdown } from "../../frontend/lib/markdown";

const results: { name: string; pass: boolean; err?: string }[] = [];
function t(name: string, fn: () => void) {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, err: String((e as Error)?.message ?? e) }); }
}

t("links: só http(s) viram link; javascript:/data: ficam como texto", () => {
  const bad = parseInline("[clique](javascript:alert(1)) e [x](data:text/html,<b>) e [y](//evil.com)");
  assert.ok(!bad.some((i) => i.t === "link"), JSON.stringify(bad));
  const ok = parseInline("veja [site](https://crisoverde.com.br/a?b=1)");
  assert.deepStrictEqual(ok[1], { t: "link", v: "site", href: "https://crisoverde.com.br/a?b=1" });
});

t("URL solta vira link sem a pontuação final", () => {
  const r = parseInline("acesse https://exemplo.com/pagina, ok?");
  assert.deepStrictEqual(r[1], { t: "link", v: "https://exemplo.com/pagina", href: "https://exemplo.com/pagina" });
});

t("HTML nunca é interpretado: <script> e <img onerror> permanecem texto puro", () => {
  const blocks = parseMarkdown('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
  assert.strictEqual(blocks.length, 1);
  const flat = JSON.stringify(blocks);
  assert.ok(flat.includes("<script>alert(1)</script>"));
  assert.ok(blocks[0].t === "p");
});

t("bloco de código com linguagem, sem formatação interna", () => {
  const b = parseMarkdown("antes\n```ts\nconst a = **b** * 2;\n```\ndepois");
  assert.strictEqual(b.length, 3);
  assert.deepStrictEqual(b[1], { t: "code", lang: "ts", code: "const a = **b** * 2;" });
});

t("bloco de código sem fechamento (resposta cortada) vira código até o fim", () => {
  const b = parseMarkdown("```js\nlet x = 1;\nlet y = 2;");
  assert.deepStrictEqual(b, [{ t: "code", lang: "js", code: "let x = 1;\nlet y = 2;" }]);
});

t("listas, títulos e citações", () => {
  const b = parseMarkdown("## Título\n- a\n- b\n\n1. um\n2. dois\n> citado");
  assert.deepStrictEqual(b.map((x) => x.t), ["heading", "ul", "ol", "quote"]);
  assert.strictEqual((b[1] as any).items.length, 2);
  assert.strictEqual((b[2] as any).items.length, 2);
});

t("negrito, itálico, código inline e Crisomoeda; '2 * 3 * 4' não vira itálico", () => {
  const r = parseInline("**forte** e *leve* e `x` e Crisomoedas");
  assert.deepStrictEqual(r.map((i) => i.t), ["bold", "text", "italic", "text", "code", "text", "badge"]);
  assert.ok(!parseInline("2 * 3 * 4").some((i) => i.t === "italic"));
});

t("parágrafo preserva quebras de linha simples", () => {
  const b = parseMarkdown("linha 1\nlinha 2");
  assert.strictEqual(b.length, 1);
  assert.strictEqual((b[0] as any).lines.length, 2);
});

t("desempenho: entradas hostis grandes processam rápido (sem backtracking catastrófico)", () => {
  const inputs = [
    "*a".repeat(50_000), "**".repeat(50_000), "[".repeat(30_000), "`".repeat(30_000),
    "http://" + "a".repeat(100_000), "[x](" + "h".repeat(100_000), "- ".repeat(20_000),
    "```\n" + "x\n".repeat(20_000),
  ];
  const t0 = Date.now();
  for (const s of inputs) parseMarkdown(s);
  assert.ok(Date.now() - t0 < 2000, `demorou ${Date.now() - t0}ms`);
});

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.err ? `\n     → ${r.err}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} testes de markdown passaram`);
process.exit(failed.length ? 1 : 0);
