/**
 * Testes das funções puras do efeito de escrita (frontend/lib/typing.ts). O efeito é só visual:
 * estes testes garantem que o texto original nunca é alterado e que a prévia parcial não quebra o markdown.
 */
import assert from "assert";
import { balancePartial, revealLength, typingSpeed } from "../../frontend/lib/typing";
import { parseMarkdown } from "../../frontend/lib/markdown";

const results: { name: string; pass: boolean; err?: string }[] = [];
function t(name: string, fn: () => void) {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, err: String((e as Error)?.message ?? e) }); }
}

t("velocidade: mínimo 100/s e respostas longas terminam em ~3,5s (teto 800/s)", () => {
  assert.strictEqual(typingSpeed(10), 100);
  assert.strictEqual(typingSpeed(1400), 400);
  assert.strictEqual(typingSpeed(100000), 800);
});

t("revealLength: começa em 0, termina no total e nunca passa dele", () => {
  const text = "Olá, eu sou a CRISO.AI e vou te ajudar com sustentabilidade.";
  assert.strictEqual(revealLength(text, 0), 0);
  assert.strictEqual(revealLength(text, 60_000), text.length);
  assert.strictEqual(revealLength("", 500), 0);
});

t("revealLength: não corta palavra no meio e é crescente", () => {
  const text = "reciclagem de plástico transforma resíduos em oportunidades para toda a comunidade";
  let prev = 0;
  for (let ms = 0; ms <= 3000; ms += 40) {
    const n = revealLength(text, ms);
    assert.ok(n >= prev, "não pode voltar atrás");
    assert.ok(n === text.length || n === 0 || /\s/.test(text[n]), `cortou no meio: "${text.slice(0, n)}"`);
    prev = n;
  }
});

t("revealLength: não corta emoji (par substituto) ao meio", () => {
  const text = "🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿";
  for (let ms = 0; ms < 1000; ms += 10) {
    const n = revealLength(text, ms);
    if (n > 0 && n < text.length) {
      const c = text.charCodeAt(n - 1);
      assert.ok(!(c >= 0xd800 && c <= 0xdbff), "terminou no meio de um emoji");
    }
  }
});

t("balancePartial: **negrito** aberto é fechado só na prévia", () => {
  const b = parseMarkdown(balancePartial("isso é **muito impor"));
  assert.ok(JSON.stringify(b).includes('"t":"bold"'), JSON.stringify(b));
  assert.ok(!JSON.stringify(b).includes("**"));
});

t("balancePartial: `código` aberto é fechado e marcador solto some", () => {
  assert.ok(JSON.stringify(parseMarkdown(balancePartial("use `npm ins"))).includes('"t":"code"'));
  assert.strictEqual(balancePartial("texto\n``"), "texto");
  assert.strictEqual(balancePartial("texto **"), "texto ");
});

t("balancePartial: dentro de bloco ``` não mexe (o parser já trata como código até o fim)", () => {
  const partial = "antes\n```js\nconst a = **";
  assert.strictEqual(balancePartial(partial), partial);
  const b = parseMarkdown(partial);
  assert.strictEqual(b[1].t, "code");
});

t("texto completo (100%) passa idêntico: nada é perdido no final", () => {
  const full = "Veja **isso** e `aquilo`.\n\n```py\nprint(1)\n```\n\n- item 1\n- item 2";
  assert.strictEqual(balancePartial(full), full);
  assert.strictEqual(revealLength(full, 120_000), full.length);
});

let failed = 0;
for (const r of results) {
  if (r.pass) console.log(`✅ ${r.name}`);
  else { failed++; console.log(`❌ ${r.name}\n     → ${r.err}`); }
}
console.log(`\n${results.length - failed}/${results.length} testes de digitação passaram`);
if (failed) process.exit(1);
