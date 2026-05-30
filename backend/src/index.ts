import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import routes from "./routes";
import { logger } from "./logger";
import { initDB } from "./memory";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// Necessário para funcionar corretamente atrás de proxy (Railway, Render, etc.)
app.set("trust proxy", 1);

if (!process.env.GROQ_API_KEY) {
  logger.error("GROQ_API_KEY não definida. Crie o arquivo .env com base no .env.example");
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

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://crisoverde-bot-production.up.railway.app", "https://cdn.jsdelivr.net"],
      frameAncestors: ["'self'", "https://crisoverdedigital.vercel.app", "http://localhost:5500", "http://127.0.0.1:5500"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origem não permitida: ${origin}`));
    }
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json({ limit: "50kb" }));
app.use(morgan("dev"));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || "30", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas requisições. Aguarde um momento antes de tentar novamente.",
    code: "RATE_LIMITED",
    timestamp: new Date().toISOString(),
  },
});

app.use("/api", limiter);
app.use("/api", routes);

// Servir o frontend estático
// No Railway: __dirname = /app/dist, frontend copiado para /app/dist/frontend
const frontendPath = path.join(__dirname, "frontend");
app.use(express.static(frontendPath));

// Qualquer rota não encontrada serve o frontend
app.get("*", (_req, res) => {
  const indexPath = path.join(frontendPath, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      logger.error("Frontend não encontrado em: " + indexPath);
      res.status(404).json({ error: "Frontend não encontrado.", path: indexPath });
    }
  });
});

// Inicializa o banco de dados antes de subir o servidor
initDB()
  .then(() => logger.info("PostgreSQL: tabela memories pronta ✅"))
  .catch((err) => {
    logger.error("Erro ao inicializar banco de dados: " + err);
    // não mata o servidor — ele tenta conectar nas próximas requisições
  });

app.listen(PORT, () => {
  logger.info(`🌿 Crisoverde Bot (Groq) rodando em http://localhost:${PORT}`);
  logger.info(`Engine: Groq — LLaMA 3.3 70B Versatile (gratuito)`);
  logger.info(`Ambiente: ${process.env.NODE_ENV || "development"}`);
  logger.info(`CORS liberado para: ${allowedOrigins.join(", ")}`);
});

export default app;