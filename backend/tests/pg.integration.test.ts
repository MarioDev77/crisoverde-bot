/**
 * Teste de INTEGRAÇÃO com PostgreSQL real (usa DATABASE_URL). Valida as queries de verdade:
 * criação das tabelas, memória em JSONB (grava/lê/expira/apaga), limpeza de sessões antigas e
 * o limite diário por usuário/global (COUNT ... FILTER, MIN ... FILTER, janela de 24h).
 *
 * ATENÇÃO: cria usuários de teste e grava em `memories`/`chat_events`. Rode em um banco de teste:
 *   DATABASE_URL=postgresql://... npm run test:db
 * Sem DATABASE_URL o teste é ignorado.
 */
import assert from "assert";

if (!process.env.DATABASE_URL) {
  console.log("⏭️  DATABASE_URL não definida — teste de integração ignorado.");
  process.exit(0);
}
process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(40);
process.env.NODE_ENV = "production";

const results: { name: string; pass: boolean; err?: string }[] = [];
async function t(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, err: String((e as Error)?.message ?? e) }); }
}

async function main() {
  const { initAuthDB, authPool, logChatEvent } = await import("../src/auth");
  const mem = await import("../src/memory");
  const { checkChatQuota } = await import("../src/usageLimit");

  await initAuthDB();
  await mem.initDB();

  const mkUser = async (tag: string, role = "user") =>
    (await authPool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id`,
      [`Teste ${tag}`, `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.local`, role]
    )).rows[0].id as string;

  const alice = await mkUser("alice");
  const bob = await mkUser("bob");
  const root = await mkUser("root", "admin");
  const createdIds = [alice, bob, root];

  await t("memória: grava e lê JSONB (com datas), prune ao ler", async () => {
    const m = mem.extractFromMessage("me chamo Alice e gosto de reciclar garrafas, quero plantar uma horta", mem.emptyMemory());
    await mem.saveMemory(alice, m);
    const back = await mem.getMemory(alice);
    assert.strictEqual(back.nome, "Alice");
    assert.deepStrictEqual(back.metas, ["Plantar uma horta"]);
    assert.ok(back.ultimaConversa);
    assert.ok(back.datas!["metas:Plantar uma horta"]);
  });

  await t("memória: meta de 100 dias gravada no banco expira ao ler; nome permanece", async () => {
    const old = new Date(Date.now() - 100 * 86_400_000).toISOString();
    await authPool.query(
      `INSERT INTO memories (session_id, data) VALUES ($1, $2) ON CONFLICT (session_id) DO UPDATE SET data = $2`,
      [bob, JSON.stringify({ nome: "Bob", interesses: [], preferencias: [], metas: ["Plantar"], acoes_sustentaveis: [], pontuacao_crisomoeda: 0, historico: [], datas: { "metas:Plantar": old } })]
    );
    const back = await mem.getMemory(bob);
    assert.strictEqual(back.nome, "Bob");
    assert.deepStrictEqual(back.metas, []);
  });

  await t("memória: clearMemory remove a linha; cleanOldSessions (query parametrizada) executa", async () => {
    await mem.clearMemory(bob);
    assert.strictEqual((await authPool.query(`SELECT 1 FROM memories WHERE session_id=$1`, [bob])).rowCount, 0);
    await authPool.query(`UPDATE memories SET updated_at = NOW() - INTERVAL '40 days' WHERE session_id=$1`, [alice]);
    const removed = await mem.cleanOldSessions(30);
    assert.ok(removed >= 1);
    assert.strictEqual((await authPool.query(`SELECT 1 FROM memories WHERE session_id=$1`, [alice])).rowCount, 0);
  });

  await t("limite diário: sem eventos → permitido", async () => {
    process.env.CHAT_DAILY_LIMIT_PER_USER = "3";
    process.env.CHAT_DAILY_LIMIT_GLOBAL = "0";
    const q = await checkChatQuota(alice, "user");
    assert.strictEqual(q.allowed, true);
    assert.strictEqual(q.used, 0);
  });

  await t("limite diário: 3 mensagens → 4ª bloqueada com retryAfter; outro usuário não é afetado", async () => {
    for (let i = 0; i < 3; i++) await logChatEvent(alice);
    const q = await checkChatQuota(alice, "user");
    assert.strictEqual(q.allowed, false);
    assert.strictEqual(q.reason, "user");
    assert.strictEqual(q.used, 3);
    assert.ok(q.retryAfterSeconds! > 80_000 && q.retryAfterSeconds! <= 86_400, `retryAfter=${q.retryAfterSeconds}`);
    assert.strictEqual((await checkChatQuota(bob, "user")).allowed, true);
  });

  await t("limite diário: administrador nunca é limitado", async () => {
    for (let i = 0; i < 5; i++) await logChatEvent(root);
    assert.strictEqual((await checkChatQuota(root, "admin")).allowed, true);
  });

  await t("limite diário: eventos com mais de 24h não contam; janela libera quando o mais antigo sai", async () => {
    await authPool.query(`UPDATE chat_events SET created_at = NOW() - INTERVAL '25 hours' WHERE user_id=$1`, [alice]);
    assert.strictEqual((await checkChatQuota(alice, "user")).allowed, true);
    // 3 eventos, o mais antigo há 23h → bloqueia e libera em ~1h
    await authPool.query(`UPDATE chat_events SET created_at = NOW() - INTERVAL '23 hours' WHERE id = (SELECT MIN(id) FROM chat_events WHERE user_id=$1)`, [alice]);
    await authPool.query(`UPDATE chat_events SET created_at = NOW() - INTERVAL '1 hour' WHERE user_id=$1 AND created_at < NOW() - INTERVAL '24 hours'`, [alice]);
    const q = await checkChatQuota(alice, "user");
    assert.strictEqual(q.allowed, false);
    assert.ok(q.retryAfterSeconds! >= 60 && q.retryAfterSeconds! <= 3700, `retryAfter=${q.retryAfterSeconds}`);
  });

  await t("limite global: soma de todos os usuários bloqueia todos (exceto admin)", async () => {
    process.env.CHAT_DAILY_LIMIT_PER_USER = "0";
    process.env.CHAT_DAILY_LIMIT_GLOBAL = "5";
    const q = await checkChatQuota(bob, "user");
    assert.strictEqual(q.allowed, false);
    assert.strictEqual(q.reason, "global");
    assert.strictEqual((await checkChatQuota(root, "admin")).allowed, true);
  });

  await t("limites desligados (0/0) → sempre permitido", async () => {
    process.env.CHAT_DAILY_LIMIT_PER_USER = "0";
    process.env.CHAT_DAILY_LIMIT_GLOBAL = "0";
    assert.strictEqual((await checkChatQuota(alice, "user")).allowed, true);
  });

  // limpeza dos dados de teste
  await authPool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdIds]); // chat_events cai por CASCADE
  await authPool.query(`DELETE FROM memories WHERE session_id = ANY($1::text[])`, [createdIds]);
  await authPool.end();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.err ? `\n     → ${r.err}` : ""}`);
  console.log(`\n${results.length - failed.length}/${results.length} testes de integração (PostgreSQL) passaram`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
