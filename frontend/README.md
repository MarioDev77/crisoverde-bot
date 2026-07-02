# Crisoverde — Frontend (Next.js)

Frontend em Next.js 14 (App Router) + TypeScript + Tailwind, com cadastro,
login e um painel administrativo escondido, feito para conversar com o
backend em `crisoverde-bot-groq`.

## Rodando localmente

```bash
npm install
cp .env.local.example .env.local   # ajuste NEXT_PUBLIC_API_URL se precisar
npm run dev
```

Abra http://localhost:3000. O backend precisa estar rodando (veja o README
do backend) com `ALLOWED_ORIGINS` incluindo `http://localhost:3000`.

## Páginas

| Rota                | O que é                                                             |
|---------------------|----------------------------------------------------------------------|
| `/`                 | Página inicial                                                       |
| `/cadastro`         | Criação de conta (papel `user` por padrão)                          |
| `/login`            | Login                                                                 |
| `/chat`             | Chat com a IA — exige login                                          |
| `/painel-x7k9`      | Painel administrativo — **URL secreta**, não linkada em nenhum menu |

## Como o painel admin fica "escondido"

- A rota `/painel-x7k9` não aparece em nenhum link, menu ou sitemap.
- Um usuário comum que descobrir a URL e tentar acessar recebe uma página
  **404 genérica** (não um redirecionamento para login, que confirmaria
  que a rota existe).
- A proteção real não depende do segredo da URL: toda chamada de API do
  painel (`/api/admin/*`) exige um cookie de sessão válido **e** que o
  usuário tenha `role = "admin"` no banco — isso é verificado no backend
  a cada requisição, então mesmo alguém que acerte a URL não vê dado
  nenhum sem estar logado como admin de verdade.

## Como promover um usuário a administrador

Não existe (de propósito) uma rota de API para isso — vira alvo fácil de
abuso. Promova direto no banco depois que a pessoa já tiver se cadastrado
normalmente pelo `/cadastro`:

```sql
UPDATE users SET role = 'admin' WHERE email = 'seu-email@exemplo.com';
```

Rode isso no console do PostgreSQL do Railway (aba "Query" do banco).
Depois disso, a pessoa precisa sair e entrar de novo (logout/login) para
o cookie de sessão ser reemitido já com `role: admin`.

## Deploy (Vercel)

1. Suba este projeto num repositório e importe na Vercel.
2. Configure a env var `NEXT_PUBLIC_API_URL` apontando para o backend no
   Railway (ex: `https://crisoverde-bot-production.up.railway.app`).
3. No backend, adicione a URL da Vercel em `ALLOWED_ORIGINS`.
4. Como front e back ficam em domínios diferentes, o cookie de sessão usa
   `SameSite=None; Secure` em produção — garanta que o backend está
   servido em HTTPS (Railway já faz isso por padrão).
