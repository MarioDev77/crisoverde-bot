# Crisoverde — Projeto completo (backend + frontend)

Assistente de IA da Crisoverde Digital, com cadastro/login de usuários e
painel administrativo com métricas.

```
crisoverde-projeto/
├── backend/                  # API (Node.js/Express + PostgreSQL + Gemini)
├── frontend/                 # App (Next.js 14 — cadastro, login, chat, painel admin)
└── frontend-legacy-static/   # Interface HTML antiga (não usa mais — ver nota abaixo)
```

## backend/

API em Express + TypeScript. Principais rotas:

- `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `GET /api/auth/me`
- `POST /api/chat` — **exige login** (cookie de sessão)
- `GET /api/admin/metrics/overview`, `/api/admin/metrics/series`, `/api/admin/users`, `/api/admin/security/ips` — exigem login **e** `role = "admin"`
- `/api/memory/*`, `/api/security/*` — rotas administrativas legadas, protegidas pelo token fixo `x-admin-token`

```bash
cd backend
npm install
cp .env.example .env   # preencha GEMINI_API_KEY, DATABASE_URL, JWT_SECRET, ADMIN_TOKEN
npm run dev
```

## frontend/

Next.js 14 (App Router). Páginas: `/`, `/login`, `/cadastro`, `/chat`
(protegida) e `/painel-x7k9` (painel admin — **URL secreta**, não linkada
em nenhum menu). Detalhes de segurança e como promover um usuário a admin
estão no `frontend/README.md`.

```bash
cd frontend
npm install
cp .env.local.example .env.local   # aponte para o backend
npm run dev
```

## frontend-legacy-static/

Essa era a interface HTML/JS estática que ficava dentro de `backend/frontend`,
servida pelo próprio Express. **Ela não funciona mais como estava**: agora
`/api/chat` exige login, e essa página antiga não tem tela de
cadastro/login — ela chamava o chat direto, sem autenticação.

Mantive a pasta só para você poder resgatar algum trecho de HTML/CSS se
quiser (ex: os ícones ou o layout de bolhas de chat), mas o frontend
oficial agora é o `frontend/` (Next.js). Pode apagar essa pasta com
segurança quando não precisar mais dela.

## Rodando os dois juntos localmente

1. Backend na porta 3001 (`cd backend && npm run dev`).
2. Frontend na porta 3000 (`cd frontend && npm run dev`), com
   `NEXT_PUBLIC_API_URL=http://localhost:3001` no `.env.local`.
3. No backend, `ALLOWED_ORIGINS` precisa incluir `http://localhost:3000`
   (já vem assim por padrão no `.env.example`).

## Memória da CRISO.AI e privacidade

A CRISO.AI guarda, por usuário (tabela `memories`, coluna JSONB — sem tabelas novas), só o que a pessoa conta sobre si:

| Dado | Validade |
|---|---|
| Nome, cidade | sem expiração (até o usuário apagar) |
| Ocupação, interesses (até 8) | 1 ano |
| Metas sustentáveis (até 5) | 90 dias |

- A **idade não é mais coletada** nem enviada ao modelo; o conteúdo das conversas **não** é guardado.
- Não são guardados: dados sensíveis (saúde, religião, política etc.), e-mails, links, números longos e textos que pareçam instruções para a IA. É uma heurística — não é garantia absoluta.
- Mensagens com padrão de prompt injection detectado não alimentam a memória.
- Dados com mais de 3 meses chegam ao modelo marcados como "pode estar desatualizado".

**Rotas do próprio usuário (exigem login; sempre a memória de quem está logado):**

- `GET /api/me/memory` — mostra tudo o que está guardado.
- `POST /api/me/memory` — corrige/adiciona/remove: `{ "set": {"nome": "Ana"}, "add": {"metas": ["Plantar horta"]}, "remove": {"interesses": ["Xadrez"], "campos": ["idade"]} }`
- `DELETE /api/me/memory` — apaga tudo.

No chat, o botão **Memória** (topo) faz o mesmo por uma tela. As rotas administrativas antigas (`x-admin-token`) continuam funcionando.

## Pesquisa na internet

A pesquisa só acontece com `SEARCH_PROVIDER=tavily|serper` e `SEARCH_API_KEY` configurados. Sem isso, a CRISO.AI avisa que não confirma dados em tempo real (não simula pesquisa). O frontend só mostra "Pesquisando na internet..." quando `/api/health` informa `search: "on"`.

## Segurança e uso (Etapa 3)

- **Limite diário de mensagens** (controle de custo), usando a tabela `chat_events` existente: `CHAT_DAILY_LIMIT_PER_USER` (padrão 100) e `CHAT_DAILY_LIMIT_GLOBAL` (padrão 0 = desligado; recomendado definir, pois qualquer pessoa pode criar conta). Administradores não são limitados. Ao estourar: `429` com `code: "DAILY_LIMIT"` e `Retry-After`.
- **Histórico confiável sem guardar conversas:** cada resposta da IA sai com uma assinatura (`sig`, HMAC derivado do `JWT_SECRET` e ligado ao usuário). O backend só aceita turnos `assistant` com assinatura válida; turnos forjados pelo cliente são descartados. Trocar o `JWT_SECRET` só faz conversas abertas perderem contexto.
- **Chat:** respostas em markdown seguro (listas, títulos, links `http(s)`, blocos de código com botão **Copiar**; HTML nunca é interpretado), botão **Tentar de novo** com contagem regressiva, trava contra envio duplicado, textarea que cresce, `100dvh` no mobile e `aria-live` para leitores de tela.

### Avaliação da inteligência

```bash
cd backend
npm run eval                 # offline, sem chave: mede o pipeline (segurança, contexto, erros do provedor)
npm run eval:live -- --judge # Gemini real: baseline × atual, latência, tokens, custo e notas (precisa de GEMINI_API_KEY)
```
Resultados medidos, método e limites: `docs/AVALIACAO.md`. Arquitetura e riscos: `docs/ARQUITETURA.md`.

### Testes

```bash
cd backend
npm test            # unitários (Gemini simulado, memória, segurança, markdown, detecção) — sem banco
DATABASE_URL=postgresql://... npm run test:db    # queries reais em PostgreSQL de TESTE
DATABASE_URL=postgresql://... npm run test:e2e   # sobe o servidor real + Gemini simulado
```
`test:db` e `test:e2e` gravam usuários/dados de teste: use um banco de teste, nunca o de produção.

### Riscos remanescentes

- O limite por IP e o `rejectUnauthorized: false` do Postgres (exigido no Railway) continuam como estavam.
- A conversa só existe no navegador (some ao atualizar a página).
- Filtros de dados sensíveis e de injeção são heurísticas: reduzem o risco, não o eliminam.
- Nada foi testado contra a API real do Gemini (nem a qualidade das respostas): rode `npm run eval:live` com a sua chave.
- A detecção de injeção por padrões não generaliza bem (ver `docs/AVALIACAO.md`); a defesa principal é a separação instruções/dados.
