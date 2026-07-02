import "dotenv/config";
import { setGlobalDispatcher, Agent } from "undici";

// ─── Fix para "FetchError: Premature close" ao chamar a Groq API ────────────
// O fetch nativo do Node (undici) mantém conexões keep-alive abertas para
// reuso. Em ambientes como Railway, o servidor remoto (ou um proxy no meio
// do caminho) às vezes fecha essa conexão um pouco antes do timeout que o
// Node espera. Quando o Node tenta reaproveitar essa conexão "morta" na
// próxima requisição, o resultado é exatamente esse erro — de forma
// intermitente, o que bate com o padrão observado nos logs.
//
// A correção é forçar o Node a reciclar conexões ociosas ANTES desse
// timeout acontecer, configurando um keepAliveTimeout mais curto e
// conservador que o do servidor remoto.
setGlobalDispatcher(
  new Agent({
    keepAliveTimeout: 4_000, // fecha conexões ociosas após 4s (mais curto que o timeout remoto)
    keepAliveMaxTimeout: 10_000,
    connections: 50,
  })
);

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import routes from "./routes";
import { logger } from "./logger";
import { initDB } from "./memory";
import { initSecurityDB } from "./security";
import { initAuthDB } from "./auth";
import {
  ipExtractor,
  advancedRateLimit,
  securityLogger,
} from "./securityMiddleware";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// Necessário para funcionar corretamente atrás de proxy (Railway, Render, etc.)
app.set("trust proxy", 1);

if (!process.env.GROQ_API_KEY) {
  logger.error("GROQ_API_KEY não definida. Crie o arquivo .env com base no .env.example");
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  logger.error(
    "JWT_SECRET não definida (ou curta demais). Defina uma string aleatória com pelo menos 32 caracteres, ex: openssl rand -hex 32"
  );
  process.exit(1);
}

const allowedOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "https://crisoverdedigital.vercel.app",
  "https://crisoverde-bot-production.up.railway.app",
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()) : []),
];

// Previews do Vercel têm URL com hash aleatório a cada deploy
// (ex: crisoverde-qpyy5xwnt-mariodev77s-projects.vercel.app), então uma
// lista fixa nunca dá conta. Esse regex libera qualquer preview do seu
// time no Vercel (mariodev77s-projects), sem abrir pra domínios de terceiros.
const VERCEL_PREVIEW_REGEX = /^https:\/\/[a-z0-9-]+-mariodev77s-projects\.vercel\.app$/;

function isOriginAllowed(origin: string): boolean {
  return allowedOrigins.includes(origin) || VERCEL_PREVIEW_REGEX.test(origin);
}

// ─── Segurança HTTP (Helmet) ──────────────────────────────────────────────────

app.use(helmet({
  frameguard: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://crisoverde-bot-production.up.railway.app", "https://cdn.jsdelivr.net"],
      frameAncestors: [
        "'self'",
        "https://crisoverdedigital.vercel.app",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
      ],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origem não permitida: ${origin}`));
    }
  },
  credentials: true, // necessário para o navegador enviar/receber o cookie de sessão
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "x-admin-token"],
}));

app.use(cookieParser());
app.use(express.json({ limit: "50kb" }));
app.use(morgan("dev"));

// ─── Middlewares de Segurança (ordem importa!) ────────────────────────────────

// 1. Extrai o IP real do cliente (antes de qualquer verificação)
app.use(ipExtractor);

// 2. Logger de segurança — registra requisições suspeitas e status codes de erro
app.use("/api", securityLogger);

// 3. Rate limiting avançado com janela deslizante
//    Substitui o rateLimit básico anterior
app.use("/api", advancedRateLimit({
  max: parseInt(process.env.RATE_LIMIT_MAX || "30", 10),
  windowMinutes: 1,
}));

// ─── Rotas da API ─────────────────────────────────────────────────────────────
// O injectionGuard é aplicado diretamente na rota /chat (ver routes.ts),
// não globalmente, para não interferir em rotas de health/admin.

app.use("/api", routes);

// ─── 404 padrão ───────────────────────────────────────────────────────────────
// Este backend agora é uma API pura — o frontend (Next.js) mora em ../frontend
// e é servido separadamente (ex: Vercel). Não há mais HTML estático aqui.

app.use((_req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});


// ─── Inicialização do banco de dados ─────────────────────────────────────────

async function bootstrap() {
  try {
    await initDB();
    logger.info("PostgreSQL: tabela memories pronta ✅");
  } catch (err) {
    logger.error("Erro ao inicializar memories: " + err);
  }

  try {
    await initSecurityDB();
  } catch (err) {
    logger.error("Erro ao inicializar security tables: " + err);
    // Não mata o servidor — o injectionGuard tem fail-open
  }

  try {
    await initAuthDB();
    logger.info("PostgreSQL: tabelas users e chat_events prontas ✅");
  } catch (err) {
    logger.error("Erro ao inicializar auth tables: " + err);
    process.exit(1); // sem tabela de usuários, login/cadastro não funcionam — melhor falhar cedo
  }

  app.listen(PORT, () => {
    logger.info(`🌿 Crisoverde Bot (Groq) rodando em http://localhost:${PORT}`);
    logger.info(`Engine: Groq — LLaMA 3.1 8B Instant`);
    logger.info(`Ambiente: ${process.env.NODE_ENV || "development"}`);
    logger.info(`CORS liberado para: ${allowedOrigins.join(", ")}`);
    logger.info(`Sistema de segurança: ATIVO 🛡️`);
  });
}

bootstrap();

export default app;