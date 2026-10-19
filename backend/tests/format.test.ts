/**
 * Testes das funções puras de apresentação do chat (frontend/lib/format.ts): nome do modelo,
 * título de conversa, agrupamento por dia e iniciais. Sem React e sem banco.
 */
import assert from "assert";
import { dayGroup, formatModel, formatWhen, initials, makeTitle, uid } from "../../frontend/lib/format";

const results: { name: string; pass: boolean; err?: string }[] = [];
function t(name: string, fn: () => void) {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, err: String((e as Error)?.message ?? e) }); }
}

t("formatModel: gemini-3.8-flash → Gemini 3.8 Flash", () => {
  assert.strictEqual(formatModel("gemini-3.8-flash"), "Gemini 3.8 Flash");
});
t("formatModel: aceita prefixo models/ e vazio", () => {
  assert.strictEqual(formatModel("models/gemini-3.8-flash"), "Gemini 3.8 Flash");
  assert.strictEqual(formatModel(null), "");
  assert.strictEqual(formatModel(""), "");
});
t("makeTitle: colapsa espaços e quebras de linha", () => {
  assert.strictEqual(makeTitle("  Olá\n\n   mundo  "), "Olá mundo");
});
t("makeTitle: corta textos longos com reticências dentro do limite", () => {
  const out = makeTitle("a".repeat(200), 42);
  assert.ok(out.length <= 42 && out.endsWith("…"), out);
});
t("makeTitle: texto vazio vira 'Nova conversa'", () => {
  assert.strictEqual(makeTitle("   "), "Nova conversa");
});
t("dayGroup: hoje, ontem e anteriores", () => {
  const now = new Date(2026, 9, 18, 15, 0, 0).getTime();
  assert.strictEqual(dayGroup(new Date(2026, 9, 18, 1, 0).getTime(), now), "Hoje");
  assert.strictEqual(dayGroup(new Date(2026, 9, 17, 23, 59).getTime(), now), "Ontem");
  assert.strictEqual(dayGroup(new Date(2026, 9, 10, 12, 0).getTime(), now), "Anteriores");
});
t("formatWhen: 'Hoje às HH:MM' e data para antigos", () => {
  const now = new Date(2026, 9, 18, 15, 0, 0).getTime();
  assert.match(formatWhen(new Date(2026, 9, 18, 9, 5).getTime(), now), /^Hoje às 09:05$/);
  assert.match(formatWhen(new Date(2026, 9, 17, 17, 45).getTime(), now), /^Ontem às 17:45$/);
  assert.match(formatWhen(new Date(2025, 9, 15, 12, 0).getTime(), now), /15\/10\/2025/);
});
t("initials: duas letras, uma palavra, vazio", () => {
  assert.strictEqual(initials("Gilvane Alves"), "GA");
  assert.strictEqual(initials("maria"), "M");
  assert.strictEqual(initials("Ana Maria da Silva"), "AS");
  assert.strictEqual(initials("   "), "?");
});
t("uid: ids diferentes entre si", () => {
  const ids = new Set(Array.from({ length: 500 }, () => uid()));
  assert.strictEqual(ids.size, 500);
});

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.err ? `\n     → ${r.err}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} testes de formatação passaram`);
process.exit(failed.length ? 1 : 0);
