# Arquitetura da CRISO.AI (estado atual)

```
Next.js (frontend/)  ──cookie HttpOnly / Bearer──▶  Express (backend/src)
                                                     ├─ securityMiddleware  IP, rate limit, injectionGuard
                                                     ├─ routes.ts           auth, /chat, /me/memory, admin
                                                     │    └─ usageLimit     limite diário (chat_events)
                                                     │    └─ historyAuth    histórico assinado (HMAC)
                                                     ├─ ai/chat.ts          memória + pesquisa + prompt + Gemini
                                                     │    ├─ prompts/       identidade, segurança, dev, fatos
                                                     │    ├─ ai/context.ts  validação e janela do histórico
                                                     │    ├─ search.ts      Tavily/Serper (opcional)
                                                     │    └─ ai/gemini.ts   REST, retry, fallback, timeout
                                                     └─ memory.ts           JSONB em PostgreSQL, por usuário
```

Fluxo de `POST /api/chat`: login → `injectionGuard` → validação/tamanho → cota diária → memória (só dados
informados pelo usuário, sem conteúdo de conversa) → histórico confiável (assistant só com assinatura válida) →
pesquisa (só se configurada **e** necessária) → `getReply` → resposta assinada. Chave do Gemini só no backend.

## Estado frente ao plano (fases 1–7)

| Fase | Estado |
|---|---|
| 1–2 Diagnóstico e plano | Concluídas (etapas anteriores) |
| 3 Inteligência / motor Gemini | Concluída. **Corrigido nesta etapa:** recuperação de resposta vazia usava `minimal` (recusado pelo `gemini-3.8-flash` segundo a documentação oficial); agora usa `low` + dobro de tokens, e níveis recusados com 400 são lembrados (evita latência dupla a cada mensagem) |
| 4 Memória e pesquisa | Concluída. Heurística de "dado atual" reescrita (sem acento, com contexto) |
| 5 Segurança e interface | Concluída. Injeção em português coberta (ver limites em `AVALIACAO.md`) |
| 6 Testes | **Concluída nesta etapa:** testes de banco e e2e executados de verdade (PostgreSQL com SSL), suíte de avaliação criada |
| 7 Entrega | Esta documentação, `SECURITY.md` real e CI |

## Verificado nesta etapa (execução real, 18/10/2026)

`tsc` backend e frontend sem erros · `npm test`: 68/68 · `test:db` (PostgreSQL 16 local): 9/9 · `test:e2e`: 8/8 ·
`npm run eval`: 25/25 critérios · build do frontend compila (com fontes do Google simuladas, pois o ambiente de teste
não tinha acesso a elas). **Não verificado:** qualquer chamada ao Gemini real, deploy no Railway/Vercel.

## Arquivos alterados nesta etapa

`backend/src/ai/gemini.ts` (recuperação de vazia, memória de níveis recusados) · `ai/chat.ts` (metadados de telemetria) ·
`security.ts` (padrões PT, `DAN` só maiúsculo, base64 sem falso positivo) · `search.ts` (heurística) ·
`tests/gemini.mock.test.ts` (atualizado), `tests/detection.test.ts` (novo) · `evals/*` (novo) · `.env.example` ·
`package.json` (scripts `eval`, `eval:live`) · `SECURITY.md` · `.github/workflows/ci.yml` · `docs/*`.

## Riscos remanescentes

- Detecção de injeção por padrões não generaliza (25% em ataques novos). Não confie nela como barreira.
- `rejectUnauthorized: false` no Postgres (exigência do Railway) e limite por IP continuam como estavam.
- A conta consome a cota diária mesmo se a chamada à IA falhar depois (o evento é gravado antes da resposta).
- `injectionGuard` e a checagem de cota liberam a requisição se o banco falhar (fail-open, por disponibilidade).
- Sem fallback para outro **provedor**: só outros modelos Gemini (`GEMINI_FALLBACK_MODEL`; vazio = padrão `gemini-3.6-flash`, `gemini-3.5-flash-lite`; `none` desliga), com disjuntor por modelo.
- Qualquer pessoa pode criar conta: defina `CHAT_DAILY_LIMIT_GLOBAL` para ter um teto real de gasto.
- Conversa só no navegador; filtros de dado sensível são heurísticos.

## O que falta e depende de você

1. Rodar `npm run eval:live -- --judge` com `GEMINI_API_KEY` (e `EVAL_PRICE_*`) para ter os números de qualidade, latência e custo.
2. Confirmar em produção que `GEMINI_MODEL=gemini-3.8-flash` responde com `GEMINI_THINKING_LEVEL=low` (a documentação oficial lista low/medium/high como suportados).
3. Definir `CHAT_DAILY_LIMIT_GLOBAL` e, se quiser pesquisa, `SEARCH_PROVIDER` + `SEARCH_API_KEY`.
