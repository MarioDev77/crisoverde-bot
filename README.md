# Crisoverde — Projeto completo (backend + frontend)

Assistente de IA da Crisoverde Digital, com cadastro/login de usuários e
painel administrativo com métricas.

```
crisoverde-projeto/
├── backend/                  # API (Node.js/Express + PostgreSQL + Groq)
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
cp .env.example .env   # preencha GROQ_API_KEY, DATABASE_URL, JWT_SECRET, ADMIN_TOKEN
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
