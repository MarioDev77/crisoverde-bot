/**
 * run.ts — executor da suíte de avaliação.
 *
 *   npm run eval                      → offline (sem chave, sem rede): mede o pipeline
 *   npm run eval:live                 → Gemini real (exige GEMINI_API_KEY): baseline × atual
 *   npm run eval:live -- --judge      → inclui notas de um avaliador (mais chamadas/cota)
 *   npm run eval:live -- --only 7     → só a categoria 7 (ou um id, ex.: c2-sqli)
 *   npm run eval:live -- --mock       → valida a ferramenta com um Gemini simulado (NÃO mede qualidade)
 *
 * Relatórios (JSON + Markdown) são gravados em evals/reports/.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { CATEGORIES } from "./cases";
import { Metric, runOffline } from "./offline";
import { runLive } from "./live";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const value = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const REPORT_DIR = path.join(__dirname, "reports");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function offlineMarkdown(metrics: Metric[]): string {
  const lines: string[] = ["## Avaliação offline do pipeline", ""];
  for (const id of Object.keys(CATEGORIES).map(Number)) {
    const rows = metrics.filter((m) => m.category === id);
    if (!rows.length) continue;
    lines.push(`### ${id}. ${CATEGORIES[id as keyof typeof CATEGORIES]}`, "", "| Verificação | Resultado | Status |", "|---|---|---|");
    for (const m of rows) lines.push(`| ${m.name} | ${m.value} | ${m.pass === undefined ? "—" : m.pass ? "✅" : "❌"} |`);
    lines.push("");
    for (const m of rows) if (m.failures?.length) lines.push(`**${m.name}** — detalhes:`, ...m.failures.map((f) => `- ${f}`), "");
  }
  return lines.join("\n");
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  if (!flag("live")) {
    const metrics = await runOffline();
    const withCriteria = metrics.filter((m) => m.pass !== undefined);
    const failed = withCriteria.filter((m) => !m.pass);
    const md = `# CRISO.AI — avaliação offline (${new Date().toISOString()})\n\n${offlineMarkdown(metrics)}\n\n**Verificações com critério de aprovação:** ${withCriteria.length - failed.length}/${withCriteria.length} aprovadas.\n\n> Mede o pipeline do backend (segurança, contexto, erros do provedor). Não mede a qualidade do texto do modelo: use \`npm run eval:live\`.\n`;
    fs.writeFileSync(path.join(REPORT_DIR, `offline-${stamp}.json`), JSON.stringify(metrics, null, 2));
    fs.writeFileSync(path.join(REPORT_DIR, `offline-${stamp}.md`), md);
    console.log("\n" + md);
    process.exit(failed.length ? 1 : 0);
  }

  const { runs, summaries, model, mock } = await runLive({ mock: flag("mock"), judge: flag("judge"), only: value("only"), delayMs: value("delay") ? parseInt(value("delay")!, 10) : undefined });
  const f1 = (n?: number) => (n === undefined ? "n/d" : n.toFixed(1));
  const ms = (n?: number) => (n === undefined ? "n/d" : `${Math.round(n)} ms`);
  const pc = (n: number) => `${Math.round(n * 100)}%`;

  const md: string[] = [
    `# CRISO.AI — avaliação live (${new Date().toISOString()})`,
    "",
    mock ? "> ⚠️ **MODO --mock: Gemini simulado. Estes números NÃO medem qualidade; só provam que a ferramenta roda.**\n" : `Modelo: \`${model}\`. Baseline = prompt genérico (referência), atual = caminho real de produção.\n`,
    "| Métrica | Baseline | Atual |",
    "|---|---|---|",
  ];
  const [b, a] = summaries;
  md.push(
    `| Casos que passam em TODAS as checagens | ${pc(b.checkPassRate)} | ${pc(a.checkPassRate)} |`,
    `| Taxa de erro da chamada | ${pc(b.errorRate)} | ${pc(a.errorRate)} |`,
    `| Latência p50 / p95 | ${ms(b.latencyP50)} / ${ms(b.latencyP95)} | ${ms(a.latencyP50)} / ${ms(a.latencyP95)} |`,
    `| Tokens de entrada (média) | ${f1(b.avgInputTokens)} | ${f1(a.avgInputTokens)} |`,
    `| Tokens de saída incl. raciocínio (média) | ${f1(b.avgOutputTokens)} | ${f1(a.avgOutputTokens)} |`,
    `| Custo estimado (USD) | ${b.estCostUsd === undefined ? "n/d (defina EVAL_PRICE_*)" : b.estCostUsd.toFixed(5)} | ${a.estCostUsd === undefined ? "n/d" : a.estCostUsd.toFixed(5)} |`
  );
  if (b.judgeAvg && a.judgeAvg) {
    for (const k of ["precisao", "relevancia", "clareza", "consistencia"] as const) md.push(`| Nota do avaliador — ${k} (1–5) | ${f1(b.judgeAvg[k])} | ${f1(a.judgeAvg[k])} |`);
  }
  md.push("", "### Por categoria (casos aprovados / total)", "", "| Categoria | Baseline | Atual |", "|---|---|---|");
  for (const id of Object.keys(CATEGORIES).map(Number)) {
    const x = b.byCategory[id], y = a.byCategory[id];
    if (!x && !y) continue;
    md.push(`| ${id}. ${CATEGORIES[id as keyof typeof CATEGORIES]} | ${x ? `${x.passed}/${x.runs}` : "—"} | ${y ? `${y.passed}/${y.runs}` : "—"} |`);
  }
  const bad = runs.filter((r) => !r.ok || !r.checksPassed);
  if (bad.length) {
    md.push("", "### Falhas", "");
    for (const r of bad) md.push(`- [${r.variant}] **${r.id}** — ${r.error ?? r.checkFailures?.join("; ")}`);
  }
  md.push("", "> As checagens são objetivas (regex/tamanho) e portanto aproximadas: leia as respostas completas no JSON antes de concluir sobre qualidade. As categorias 8 e 10 (erros de API, limites) são medidas no modo offline.");

  fs.writeFileSync(path.join(REPORT_DIR, `live-${stamp}.json`), JSON.stringify({ model, mock, summaries, runs }, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, `live-${stamp}.md`), md.join("\n"));
  console.log("\n" + md.join("\n"));
}

main().catch((e) => {
  console.error("Falha na avaliação:", e instanceof Error ? e.message : e);
  process.exit(2);
});
