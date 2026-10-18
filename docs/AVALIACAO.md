# Avaliação da CRISO.AI

A suíte mede duas coisas diferentes e **nunca as mistura**:

| Modo | Comando | Precisa de chave? | O que mede |
|---|---|---|---|
| Offline | `npm run eval` | Não | O **pipeline**: detecção de injeção, histórico forjado, janela de contexto, memória, erros do provedor (simulado), limites de tokens |
| Live | `npm run eval:live` | Sim (`GEMINI_API_KEY`) | A **resposta do modelo**: baseline × atual nas mesmas perguntas |

Opções do live: `-- --judge` (notas 1–5 de um avaliador), `-- --only 7` (categoria ou id), `-- --delay 1000`
(ms entre chamadas, para respeitar a cota), `-- --mock` (Gemini simulado: valida a ferramenta, **não** mede qualidade).
Relatórios (JSON + Markdown) vão para `backend/evals/reports/`. Custo só aparece se `EVAL_PRICE_*` estiverem no `.env`.

Cobertura das 10 categorias do plano: 1, 2, 4, 5 → live; 3, 6, 7, 9 → offline **e** live; 8, 10 → offline.

## Resultados medidos (offline, nesta etapa)

Medido em 18/10/2026 com `npm run eval`. "Antes" = código do `crisoverde-bot-gemini-etapa3.zip`
(registro completo em `backend/evals/ANTES.md`).

| Métrica | Antes | Depois |
|---|---|---|
| Detecção de ataques de injeção — corpus de desenvolvimento (25) | 9/25 (36%) | 25/25 (100%) ⚠️ |
| Falsos positivos — corpus de desenvolvimento (24) | 2/24 (8%) | 0/24 |
| **Detecção de ataques novos — conjunto separado (12)** | **0/12** | **3/12 (25%)** |
| Falsos positivos — conjunto separado (12) | 1/12 | 1/12 |
| Pergunta de dado atual detectada (14) | 11/14 (79%) | 14/14 (100%) |
| Pergunta atemporal que dispararia pesquisa à toa (10) | 3/10 (30%) | 0/10 |
| Histórico forjado descartado (10) | 10/10 | 10/10 |

⚠️ **Leia assim:** os padrões foram escritos olhando o corpus de desenvolvimento, então 100% ali só prova que
os casos conhecidos foram corrigidos. A estimativa realista de generalização é o **conjunto separado: 25%**.
Detector por padrões (regex) é uma primeira camada fraca; ele só decide se a mensagem alimenta a memória e
soma pontos de risco por IP. A defesa que importa é outra (instruções separadas dos dados, histórico assinado,
regras de segurança no prompt) e **a resistência do modelo só é medida no modo live** (casos `c7-*`).
A heurística de dado atual também foi calibrada no próprio corpus (sem conjunto separado).

Outras verificações offline: 25/25 critérios aprovados, incluindo 429/503/401/timeout/400/vazia,
recuperação de resposta vazia sem usar `minimal` e janela de histórico (≤12 mensagens, ≤12.000 caracteres).

**Custo de contexto:** o prompt de sistema tem ~13 mil caracteres (≈3,3 mil tokens, estimativa chars/4) e vai a
**cada** mensagem; no pior caso a entrada passa de ≈6,7 mil tokens. É o preço da qualidade e da segurança do
prompt; se o custo apertar, o próximo passo é encurtar o prompt ou usar cache de contexto do Gemini.

## O que NÃO foi medido

Qualidade real das respostas, latência real, custo real e a resistência real do modelo a injeção: exigem rodar
`npm run eval:live` com a sua chave. Não há números "depois" de qualidade neste documento porque eles não existem ainda.
O baseline do modo live é um prompt genérico de referência, **não** o prompt antigo do projeto.
