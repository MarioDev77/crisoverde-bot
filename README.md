# 🌿 Crisoverde Bot — versão Groq (gratuito, funciona no Brasil)

Chatbot oficial do ecossistema **Crisoverde** usando **Groq + LLaMA 3.3 70B** — gratuito e sem restrição regional.

---

## Como obter a chave do Groq (grátis)

1. Acesse **https://console.groq.com**
2. Crie uma conta (pode usar Google ou e-mail)
3. No menu esquerdo clique em **"API Keys"**
4. Clique em **"Create API Key"**
5. Dê um nome (ex: `crisoverde`) e copie a chave

A chave começa com `gsk_...`

---

## Instalação

```bash
cd crisoverde-bot-groq/backend
npm install
cp .env.example .env
```

Abra o `.env` e cole sua chave:
```env
GROQ_API_KEY=gsk_sua_chave_aqui
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
```

## Rodar o servidor

```bash
npm run dev
```

Você verá:
```
🌿 Crisoverde Bot (Groq) rodando em http://localhost:3001
Engine: Groq — LLaMA 3.3 70B Versatile (gratuito)
```

## Abrir o frontend

Abra o arquivo `frontend/index.html` no navegador. Ou:

```bash
npx serve frontend -p 5500
```

Acesse: **http://localhost:5500**

---

## Limites gratuitos do Groq

| Recurso | Limite gratuito |
|---------|----------------|
| Requisições por minuto | 30 RPM |
| Requisições por dia | 14.400 RPD |
| Tokens por minuto | 6.000 TPM |

Mais que suficiente para uso em projetos e testes.

---

## Estrutura

```
crisoverde-bot-groq/
├── backend/
│   ├── src/
│   │   ├── index.ts    ← servidor Express
│   │   ├── routes.ts   ← POST /api/chat · GET /api/health
│   │   ├── groq.ts     ← integração com Groq API
│   │   ├── prompt.ts   ← conhecimento completo do bot
│   │   ├── logger.ts   ← logs coloridos
│   │   └── types.ts    ← interfaces TypeScript
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/
│   └── index.html      ← interface completa (4 abas)
└── README.md
```
# crisoverde-bot
