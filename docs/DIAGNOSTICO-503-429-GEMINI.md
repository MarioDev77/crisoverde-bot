# Diagnóstico: `AI_UNAVAILABLE` (503) e `RATE_LIMIT` (429) no chat — 19/10/2026

## O que os prints mostram

| Evidência | O que significa |
|---|---|
| Railway → Logs: `Gemini 503: Este modelo está atualmente com alta demanda…` (`model: gemini-3.8-flash`, `kind: unavailable`) | **Quem falhou foi o Google**, não o seu servidor. O Gemini 3.8 Flash estava sobrecarregado. |
| Railway → Logs: `POST /api/chat 503 3165 ms` e `GET /api/health 200` | O backend está **saudável** (responde em 0,5 s). As 3 tentativas no mesmo modelo falharam em ~3 s (400 ms + 1200 ms de pausa) e o erro virou `AI_UNAVAILABLE`. |
| Railway → Rede: Postgres `OK`, tráfego normal | Banco e rede **não** são a causa. (`SEM_SOQUETE` ali é só o fim normal de conexões TCP.) |
| Vercel → Console: `429` em `/api/chat` + `código: RATE_LIMIT` | Esse código só sai quando o **Gemini** devolve 429 (cota por minuto estourada no modelo). Limites do seu backend usam outros códigos (`CHAT_RATE_LIMITED`, `RATE_LIMITED`, `DAILY_LIMIT`). |

## Causa raiz

O projeto dependia de **um único modelo** (`gemini-3.8-flash`). Quando ele fica sobrecarregado (503) ou
sem cota por minuto (429), o servidor não tinha para onde ir: `GEMINI_FALLBACK_MODEL` vem **vazio** no
`.env.example` e a lógica antiga tratava vazio como "sem reserva". Além disso, cada mensagem nova repetia
as tentativas no modelo doente, então todo usuário esperava e falhava de novo.

Não é bug de frontend, banco, CORS nem Railway: é capacidade/cota do modelo no Google.

## O que foi corrigido no código (`backend/src/ai/gemini.ts`)

1. **Reserva automático.** `GEMINI_FALLBACK_MODEL` vazio agora usa `gemini-3.6-flash` e depois
   `gemini-3.5-flash-lite` (modelos GA da documentação oficial). Aceita lista por vírgula; `none` desliga.
2. **Troca rápida.** Com reserva disponível, o principal recebe só 1 repetição (antes 2) e, em 429 ou
   timeout, vai direto ao reserva em vez de esperar até 15 s.
3. **Disjuntor por modelo.** Depois de 503/429/timeout o modelo fica 30–60 s em pausa (10 min se for cota
   diária ou modelo inexistente) e as próximas mensagens já começam pelo reserva, sem latência extra.
4. **Pausa com variação aleatória** (jitter) entre repetições, para não bater em sincronia no Google.
5. **Erro honesto.** Se o reserva não existir na conta (404), o erro devolvido continua sendo o 503/429 real.
6. Testes novos (reserva, disjuntor, 404 do reserva, lista, `none`): `npm test` → 29/29; `npm run eval` → 25/25.

## O que você precisa fazer

1. Publicar este código (commit + push → Railway redeploya sozinho).
2. No Railway → serviço backend → **Variables**: pode deixar `GEMINI_FALLBACK_MODEL` vazio (usa o padrão)
   ou definir, por exemplo, `gemini-3.6-flash,gemini-3.1-flash-lite`. Confirme em
   <https://aistudio.google.com/rate-limit> que a sua chave tem acesso aos modelos.
3. Se o `429` persistir mesmo com reserva, é cota do plano gratuito: ative faturamento no Google AI Studio
   ou defina `GEMINI_MAX_RPM` um pouco abaixo do RPM do seu modelo.
4. Teste: envie uma mensagem; nos logs do Railway, `Gemini: usando modelo reserva` indica que a troca
   funcionou, e `"model"` em `Gemini respondeu` mostra qual modelo respondeu.
