# Diagnóstico: erros 429/503 no `/api/chat` e microfone

## 1. O que é o erro 429

`429 Too Many Requests` = "você pediu demais, espere". No console aparece só
"status of 429", mas **o corpo da resposta diz quem barrou**. Neste projeto o 429 pode vir de
**quatro lugares diferentes**:

| `code` na resposta | Quem barrou | Causa | Resolve em |
|---|---|---|---|
| `RATE_LIMIT` | **Google (Gemini)** | Cota por **minuto** (RPM) do modelo estourou | segundos |
| `AI_QUOTA_DAILY` | **Google (Gemini)** | Cota **diária** (RPD) do modelo acabou (zera à meia-noite, horário do Pacífico) | horas |
| `CHAT_RATE_LIMITED` / `RATE_LIMITED` | **Seu backend** | Muitas requisições do mesmo usuário/IP em 1 minuto | até 1 min |
| `DAILY_LIMIT` | **Seu backend** | Usuário passou de `CHAT_DAILY_LIMIT_PER_USER` (100/dia) | 24h |

O front mostra `código: XXX` abaixo da mensagem de erro (versão deste pacote). Na aba **Rede**
do DevTools, clique na requisição `chat` → **Resposta**: o JSON traz `code`.

O **503** (`AI_UNAVAILABLE`) é outra coisa: o Gemini demorou demais (timeout) ou respondeu 5xx
("modelo sobrecarregado"). Sem `GEMINI_FALLBACK_MODEL`, o servidor não tem para onde ir.

## 2. O que provavelmente ocorreu no seu print

Dois "oi" seguidos geraram 429, 429 e depois 503. Duas mensagens curtas **não** estouram o
limite do seu backend (30/min por IP, 100/dia por usuário). Logo, o mais provável é o
**429 vindo do Google**: no plano gratuito os modelos novos têm poucas requisições por minuto
(os números exatos de cada modelo só aparecem em <https://aistudio.google.com/rate-limit>,
logado) e a cota vale **por projeto e por modelo**, não por chave. Depois o modelo ficou
instável e veio o 503. **Confirme** abrindo o JSON da resposta (`code`) ou os logs do Railway
(procure `Erro ao chamar Gemini` com `quotaId` e `daily`).

## 3. Bugs reais encontrados no código (corrigidos)

1. **Um único contador para todos os limitadores.** O limite geral da API e o de login/cadastro
   guardavam as requisições no *mesmo* `Map` por IP; o de login (10 em 5 min) acabava contando
   chat, `/health` e lista de conversas → 429 em login/cadastro sem motivo. Agora cada
   limitador tem o seu.
2. **Limite por IP em rede compartilhada.** Escola e 4G (CGNAT) colocam dezenas de pessoas no
   mesmo IP; com 30 req/min por IP, um aluno gastava o limite do colega. Agora: o limite geral
   por IP subiu para 120/min (só rede de proteção), `/health` não conta, e o controle do chat é
   **por usuário** (`CHAT_RATE_PER_MIN`, padrão 10/min).
3. **Espera curta demais após 429 por minuto.** O servidor só esperava e repetia se o Google
   pedisse ≤ 8 s; o Google costuma pedir 10–15 s. Agora espera até 15 s (se couber no prazo),
   uma única vez.

## 4. O que VOCÊ precisa fazer (não dá para resolver só no código)

No Railway → serviço backend → **Variables**:

1. `GEMINI_FALLBACK_MODEL` = **outro** modelo Gemini disponível na sua conta (cada modelo tem
   cota própria; quando um dá 429/503 o servidor troca sozinho). É a correção que mais reduz erros.
2. `GEMINI_MAX_RPM` = um pouco **abaixo** do RPM do seu modelo em
   <https://aistudio.google.com/rate-limit> (ex.: se for 10, use 8). O servidor passa a
   segurar/organizar as chamadas em vez de tomar 429 do Google.
3. `CHAT_DAILY_LIMIT_GLOBAL` = teto de mensagens/dia de todos (ex.: um pouco abaixo do RPD do
   modelo), para o usuário receber o aviso amigável em vez de erro cru.
4. Se o uso real passa do gratuito: ative o faturamento no Google AI Studio (tier pago).
5. `RATE_LIMIT_MAX`: se estiver definida como 30 no Railway, apague ou suba para 120.
6. Após o deploy, abra `https://SEU-BACKEND/api/health` e teste o chat.

## 5. Atenção: o site publicado parece estar numa versão antiga

Nos seus prints a tela de erro **não mostra** a linha `código: …` e o aviso do microfone é
"Não foi possível acessar/transcrever o microfone." — **essa frase não existe neste pacote**.
Ou seja, o Vercel está servindo uma versão anterior. Faça commit/push do conteúdo desta pasta
para o GitHub e confirme que o deploy novo ficou **Ready** na Vercel.

## 6. Microfone

Como era: usava só o reconhecimento de fala do navegador (Chrome/Edge enviam o áudio aos
servidores do Google). Falhava em silêncio ou com mensagem genérica quando: a permissão estava
negada, outro programa usava o microfone, o navegador era Brave/Firefox/WebView, ou o serviço
de voz não conseguia conectar.

Como ficou (`frontend/hooks/useVoiceInput.ts`):

- **Diagnóstico real**: ao falhar, testa o microfone e diz a causa — bloqueado para o site,
  bloqueado nas configurações do Windows, sem microfone, ou ocupado por outro programa.
- **Fallback automático**: se o navegador não tem reconhecimento de fala (ou o serviço dele
  falha), grava o áudio (até 60 s) e o backend transcreve com o Gemini (`POST /api/transcribe`).
  O áudio não é salvo. O texto vai para a caixa e **você decide se envia**.
- Botão mostra estado: pulsando ao ouvir, *Transcrevendo…* ao processar.
- Custo: cada transcrição por fallback é **uma chamada ao Gemini** (limitada a
  `TRANSCRIBE_RATE_PER_MIN`, padrão 6/min). No Chrome/Edge normal o fallback quase não é usado.

Teste: Chrome → cadeado → Microfone: **Permitir** → recarregue → clique em **Áudio** e fale.
