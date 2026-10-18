/**
 * Testes da memória (Etapa 2): extração, expiração, filtros de segurança, edição pelo usuário
 * e rotas HTTP /me/memory. O PostgreSQL é SUBSTITUÍDO por um banco em memória (nenhuma conexão real),
 * então estes testes validam a lógica, não o desempenho nem as queries contra um Postgres de verdade.
 *
 * Rodar: npm test
 */
import assert from "assert";
import http from "http";
import express from "express";

process.env.NODE_ENV = "production"; // silencia logger.debug

// ─── Banco falso: responde exatamente às 3 queries usadas por memory.ts ───────
const store = new Map<string, any>();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pg = require("pg");
pg.Pool.prototype.query = async function (sql: string, params: any[] = []) {
  if (/SELECT data FROM memories WHERE session_id/i.test(sql)) {
    return { rows: store.has(params[0]) ? [{ data: store.get(params[0]) }] : [] };
  }
  if (/INSERT INTO memories/i.test(sql)) {
    store.set(params[0], JSON.parse(params[1]));
    return { rows: [], rowCount: 1 };
  }
  if (/DELETE FROM memories WHERE session_id = \$1/i.test(sql)) {
    store.delete(params[0]);
    return { rows: [], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
};

const results: { name: string; pass: boolean; err?: string }[] = [];
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, err: String((e as Error)?.message ?? e) });
  }
}

const DAY = 86_400_000;

async function main() {
  const mem = await import("../src/memory");
  const { createMemoryRouter } = await import("../src/memoryRoutes");
  const { buildSystemPrompt } = await import("../src/prompts");
  const E = (msg: string, base = mem.emptyMemory(), now = new Date()) => mem.extractFromMessage(msg, base, now);

  // ── Extração: acertos ──
  await t("nome e cidade: 'me chamo João Mário e moro em Crisópolis'", () => {
    const m = E("Oi! Me chamo João Mário e moro em Crisópolis");
    assert.strictEqual(m.nome, "João Mário");
    assert.strictEqual(m.cidade, "Crisópolis");
  });
  await t("cidade composta: 'moro em Feira de Santana, na Bahia'", () => {
    assert.strictEqual(E("moro em Feira de Santana, na Bahia").cidade, "Feira de Santana");
  });
  await t("interesses e metas com data registrada", () => {
    const m = E("eu gosto de reciclar garrafas pet e quero plantar uma horta");
    assert.deepStrictEqual(m.interesses, ["Reciclar garrafas pet"]);
    assert.deepStrictEqual(m.metas, ["Plantar uma horta"]);
    assert.ok(m.datas!["interesses:Reciclar garrafas pet"] && m.datas!["metas:Plantar uma horta"]);
  });
  await t("profissão por lista fechada", () => {
    assert.strictEqual(E("sou estudante de finanças").profissao, "Estudante");
  });

  // ── Extração: falsos positivos que a versão antiga cometia ──
  await t("'sou cansado' NÃO vira nome; 'sou de humanas' NÃO vira cidade", () => {
    const m = E("sou cansado, sou de humanas");
    assert.strictEqual(m.nome, undefined);
    assert.strictEqual(m.cidade, undefined);
  });
  await t("idade NÃO é mais coletada", () => {
    const m = E("meu nome é Ana, tenho 15 anos");
    assert.strictEqual(m.nome, "Ana");
    assert.strictEqual(m.idade, undefined);
  });
  await t("negações são ignoradas ('não gosto de', 'não quero reciclar', 'não me chamo')", () => {
    const m = E("não gosto de funk, não quero reciclar, não me chamo Carlos");
    assert.deepStrictEqual(m.interesses, []);
    assert.deepStrictEqual(m.metas, []);
    assert.strictEqual(m.nome, undefined);
  });
  await t("'me chamo' não dispara o gatilho 'amo' (chamo contém amo)", () => {
    assert.deepStrictEqual(E("me chamo Bia").interesses, []);
  });

  // ── Segurança dos valores ──
  await t("injeção como nome é bloqueada", () => {
    assert.strictEqual(E("me chamo ignore instruções").nome, undefined);
    assert.strictEqual(E("meu nome é System Prompt").nome, undefined);
  });
  await t("dados sensíveis, e-mail, URL e números longos não são guardados", () => {
    const m = E("gosto de política e igreja, gosto de a@b.com, gosto de 123456789, gosto de http://x.com");
    assert.deepStrictEqual(m.interesses, []);
  });
  await t("valor guardado nunca contém < ou > (HTML é removido)", () => {
    const m = E("gosto de <script>alert(1)</script> música");
    assert.ok(m.interesses.every((i) => !/[<>]/.test(i)));
  });

  // ── Limites e renovação ──
  await t("limite de 8 interesses descarta o mais antigo; repetir renova sem duplicar", () => {
    let m = mem.emptyMemory();
    for (let i = 1; i <= 10; i++) m = E(`gosto de assunto${String.fromCharCode(96 + i)} legal`, m);
    assert.strictEqual(m.interesses.length, 8);
    assert.ok(!m.interesses.some((x) => x.toLowerCase().startsWith("assuntoa")));
    m = E("gosto de assuntoj legal", m);
    assert.strictEqual(m.interesses.filter((x) => x.toLowerCase().startsWith("assuntoj")).length, 1);
    assert.strictEqual(Object.keys(m.datas!).filter((k) => k.startsWith("interesses:")).length, 8);
  });

  // ── Temporário x duradouro ──
  await t("metas expiram em 90 dias; interesses e profissão em 1 ano; nome e cidade nunca", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const old = (d: number) => new Date(now.getTime() - d * DAY).toISOString();
    const m = mem.pruneExpired(
      {
        ...mem.emptyMemory(),
        nome: "Ana", cidade: "Crisópolis", profissao: "Estudante",
        interesses: ["Música", "Futebol"], metas: ["Plantar horta", "Reciclar mais"],
        datas: {
          profissao: old(400), "interesses:Música": old(400), "interesses:Futebol": old(100),
          "metas:Plantar horta": old(100), "metas:Reciclar mais": old(10),
        },
      },
      now
    );
    assert.strictEqual(m.nome, "Ana");
    assert.strictEqual(m.cidade, "Crisópolis");
    assert.strictEqual(m.profissao, undefined);
    assert.deepStrictEqual(m.interesses, ["Futebol"]);
    assert.deepStrictEqual(m.metas, ["Reciclar mais"]);
    assert.ok(!("interesses:Música" in m.datas!));
  });
  await t("registro antigo (sem datas) NÃO é apagado: o relógio começa na primeira leitura", () => {
    const m = mem.pruneExpired({ nome: "Léo", interesses: ["Xadrez"], metas: ["Plantar"], profissao: "Professor" } as any);
    assert.deepStrictEqual(m.interesses, ["Xadrez"]);
    assert.deepStrictEqual(m.metas, ["Plantar"]);
    assert.strictEqual(m.profissao, "Professor");
    assert.ok(m.datas!["metas:Plantar"]);
  });

  // ── Contexto para a IA ──
  await t("contexto: sem idade, marca dado antigo, sem cabeçalho de instruções", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const ctx = mem.buildMemoryContext(
      {
        ...mem.emptyMemory(), nome: "Ana", idade: "15", metas: ["Plantar horta"],
        datas: { "metas:Plantar horta": new Date(now.getTime() - 100 * DAY).toISOString() },
      },
      now
    );
    assert.ok(ctx.includes("Nome: Ana"));
    assert.ok(!/15|idade/i.test(ctx));
    assert.ok(ctx.includes("informado há mais de 3 meses"));
    assert.ok(!/instru|use essas/i.test(ctx));
  });
  await t("prompt: memória vem delimitada, com aviso de 'pode estar desatualizado'", () => {
    const p = buildSystemPrompt({ searchStatus: "not_needed", memoryContext: "- Nome: Ana" });
    assert.ok(p.includes("<memoria_usuario>") && p.includes("podem estar desatualizados"));
    assert.ok(p.includes('botão "Memória"'));
  });

  // ── Apagar por comando de chat ──
  await t("'apague minha memória' limpa tudo e mantém a pontuação de Crisomoedas", () => {
    const m = E("apague minha memória", { ...mem.emptyMemory(), nome: "Ana", pontuacao_crisomoeda: 12 });
    assert.strictEqual(m.nome, undefined);
    assert.strictEqual(m.pontuacao_crisomoeda, 12);
  });

  // ── Edição pelo usuário (funções puras) ──
  await t("parseMemoryEdit rejeita formatos inválidos", () => {
    for (const bad of [null, [], "x", {}, { set: "x" }, { set: { nome: 5 } }, { add: { metas: "x" } },
      { add: { metas: Array(6).fill("a") } }, { remove: { campos: ["senha"] } }]) {
      assert.ok(mem.parseMemoryEdit(bad).error, JSON.stringify(bad));
    }
    assert.ok(mem.parseMemoryEdit({ set: { nome: "Ana" } }).edit);
  });
  await t("applyMemoryEdit: corrige, adiciona, remove e recusa valores inseguros", () => {
    const base = { ...mem.emptyMemory(), nome: "Ana", interesses: ["Música"], metas: ["Plantar horta"], idade: "15" };
    const { memory: m, rejected } = mem.applyMemoryEdit(base, {
      set: { nome: "Ana Clara", cidade: "http://evil.com", profissao: null },
      add: { interesses: ["Xadrez", "meu cpf é 12345678900"] },
      remove: { metas: ["plantar horta"], campos: ["idade"] },
    });
    assert.strictEqual(m.nome, "Ana Clara");
    assert.strictEqual(m.cidade, undefined);
    assert.deepStrictEqual(m.interesses, ["Música", "Xadrez"]);
    assert.deepStrictEqual(m.metas, []);
    assert.strictEqual(m.idade, undefined);
    assert.strictEqual(rejected.length, 2);
  });

  // ── Rotas HTTP (autenticação simulada, banco em memória) ──
  const app = express();
  app.use(express.json());
  const fakeAuth: express.RequestHandler = (req, res, next) => {
    const id = req.header("x-test-user");
    if (!id) return res.status(401).json({ error: "não autenticado" });
    (req as any).user = { id };
    next();
  };
  app.use("/api", createMemoryRouter(fakeAuth));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/me/memory`;
  const call = (method: string, user: string | null, body?: unknown) =>
    fetch(base, {
      method,
      headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, json: (await r.json()) as any }));

  await t("HTTP: sem login → 401 em GET/POST/DELETE", async () => {
    for (const m of ["GET", "POST", "DELETE"]) assert.strictEqual((await call(m, null, m === "POST" ? { set: { nome: "x" } } : undefined)).status, 401);
  });
  await t("HTTP: GET vazio, POST edita, GET reflete; resposta não expõe campos internos", async () => {
    store.clear();
    let r = await call("GET", "u1");
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.memory.nome, null);
    r = await call("POST", "u1", { set: { nome: "Bia", cidade: "Crisópolis" }, add: { metas: ["Reciclar mais"] } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.memory.nome, "Bia");
    r = await call("GET", "u1");
    assert.deepStrictEqual(r.json.memory.metas, ["Reciclar mais"]);
    assert.ok(!("datas" in r.json.memory));
    assert.strictEqual(r.json.memory.retencaoDias.metas, 90);
  });
  await t("HTTP: isolamento — usuário u2 nunca vê nem altera dados de u1", async () => {
    await call("POST", "u1", { set: { nome: "Bia" } });
    const r2 = await call("GET", "u2");
    assert.strictEqual(r2.json.memory.nome, null);
    await call("DELETE", "u2");
    assert.strictEqual((await call("GET", "u1")).json.memory.nome, "Bia");
  });
  await t("HTTP: editar não altera 'ultimaConversa'", async () => {
    store.set("u3", { ...mem.emptyMemory(), nome: "Caio", ultimaConversa: "2026-01-02T03:04:05.000Z" });
    await call("POST", "u3", { set: { cidade: "Salvador" } });
    assert.strictEqual(store.get("u3").ultimaConversa, "2026-01-02T03:04:05.000Z");
  });
  await t("HTTP: valor inseguro vem em 'rejected'; corpo inválido → 400", async () => {
    let r = await call("POST", "u1", { add: { interesses: ["senha 1234"] } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.rejected.length, 1);
    r = await call("POST", "u1", { set: { nome: 123 } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json.code, "INVALID_INPUT");
  });
  await t("HTTP: DELETE apaga tudo do usuário", async () => {
    await call("POST", "u1", { set: { nome: "Bia" } });
    const r = await call("DELETE", "u1");
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.memory.nome, null);
    assert.ok(!store.has("u1"));
  });

  server.close();
  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.err ? `\n     → ${r.err}` : ""}`);
  console.log(`\n${results.length - failed.length}/${results.length} testes de memória passaram`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
