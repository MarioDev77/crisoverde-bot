/**
 * Testes do limitador de requisições: stores isolados, chave por usuário e rotas ignoradas.
 * Rodar: node -r ts-node/register/transpile-only tests/ratelimit.test.ts
 */
import assert from "node:assert/strict";
import { advancedRateLimit } from "../src/securityMiddleware";

function call(mw: any, req: any) {
  let status = 200; let body: any = null; let nexted = false;
  const res: any = { setHeader() {}, status(c: number) { status = c; return this; }, json(b: any) { body = b; return this; } };
  mw({ path: "/chat", clientIp: "1.1.1.1", ...req }, res, () => { nexted = true; });
  return { status, body, nexted };
}

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; } catch (e) { console.log(`❌ ${name}\n     → ${(e as Error).message}`); failed++; }
}

test("bloqueia depois do máximo e devolve código/retryAfter", () => {
  const mw = advancedRateLimit({ max: 2, windowMinutes: 1, code: "X_LIMIT" });
  assert.ok(call(mw, {}).nexted); assert.ok(call(mw, {}).nexted);
  const r = call(mw, {});
  assert.equal(r.status, 429); assert.equal(r.body.code, "X_LIMIT"); assert.ok(r.body.retryAfterSeconds >= 1);
});

test("limitadores diferentes NÃO compartilham contagem (bug do Map único)", () => {
  const geral = advancedRateLimit({ max: 100, windowMinutes: 1 });
  const login = advancedRateLimit({ max: 3, windowMinutes: 5 });
  for (let i = 0; i < 20; i++) call(geral, {});            // 20 requisições "de chat/health" do mesmo IP
  assert.ok(call(login, {}).nexted, "login não deve contar as requisições do limitador geral");
});

test("chave por usuário: dois alunos no mesmo IP não se atrapalham", () => {
  const mw = advancedRateLimit({ max: 1, windowMinutes: 1, key: (r) => r.user?.id });
  assert.ok(call(mw, { user: { id: "ana" } }).nexted);
  assert.ok(call(mw, { user: { id: "joao" } }).nexted);
  assert.equal(call(mw, { user: { id: "ana" } }).status, 429);
});

test("skipPaths não conta (ex.: /health)", () => {
  const mw = advancedRateLimit({ max: 1, windowMinutes: 1, skipPaths: ["/health"] });
  for (let i = 0; i < 5; i++) assert.ok(call(mw, { path: "/health" }).nexted);
  assert.ok(call(mw, { path: "/chat" }).nexted);
});

console.log(`\n${passed}/${passed + failed} testes passaram`);
process.exit(failed ? 1 : 0);
