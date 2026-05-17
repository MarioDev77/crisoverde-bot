import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import routes from "./routes";
import { logger } from "./logger";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

if (!process.env.GROQ_API_KEY) {
  logger.error("GROQ_API_KEY não definida. Crie o arquivo .env com base no .env.example");
  process.exit(1);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5500")
  .split(",")
  .map((o) => o.trim());

app.use(helmet());
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

app.get("/", (_req, res) => {
  res.json({
    message: "🌿 Crisoverde Bot API (Groq) — funcionando!",
    engine: "Groq — LLaMA 3.3 70B Versatile (gratuito)",
    docs: "/api/health",
  });
});

app.use((_req, res) => {
  res.status(404).json({
    error: "Rota não encontrada.",
    code: "NOT_FOUND",
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  logger.info(`🌿 Crisoverde Bot (Groq) rodando em http://localhost:${PORT}`);
  logger.info(`Engine: Groq — LLaMA 3.3 70B Versatile (gratuito)`);
  logger.info(`Ambiente: ${process.env.NODE_ENV || "development"}`);
  logger.info(`CORS liberado para: ${allowedOrigins.join(", ")}`);
});

export default app;
