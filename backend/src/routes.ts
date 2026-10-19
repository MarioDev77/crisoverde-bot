import { Router, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { getReply } from "./ai/chat";
import { conversationsRouter, persistTurn } from "./conversations";
import { AIProviderError, getGeminiConfig } from "./ai/gemini";
import { createMemoryRouter } from "./memoryRoutes";
import { checkChatQuota } from "./usageLimit";
import { filterTrustedHistory, signReply } from "./historyAuth";
import { isSearchProviderConfigured } from "./search";
import { ChatMessage, ChatRequest, ChatResponse, ErrorResponse, SecurityStatus } from "./types";
import {
  extractFromMessage,
  getMemory,
  saveMemory,
  clearMemory,
  cleanOldSessions,
} from "./memory";
import {
  getIpStatus,
  unblockIp,
  getSecurityLogs,
  cleanOldSecurityData,
} from "./security";
import { injectionGuard, advancedRateLimit } from "./securityMiddleware";
import { logger } from "./logger";
import {
  createUser,
  findUserByEmail,
  findUserById,
  validateRegisterInput,
  verifyPassword,
  signToken,
  touchLastLogin,
  logChatEvent,
} from "./auth";
import { requireAuth, requireAdminRole, COOKIE_NAME } from "./authMiddleware";
import {
  getOverview,
  getNewUsersSeries,
  getChatEventsSeries,
  getSecurityEventsSeries,
  listUsers,
  metricsPool,
} from "./metrics";

const router = Router();

// ─── Cookies de sessão ─────────────────────────────────────────────────────────

const isProd = process.env.NODE_ENV === "production";

function setSessionCookies(res: Response, token: string, role: string): void {
  const commonOpts = {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias — mesmo prazo do JWT
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    path: "/",
  };

  // Cookie com o JWT — HttpOnly, JS do navegador nunca consegue ler/roubar via XSS.
  res.cookie(COOKIE_NAME, token, { ...commonOpts, httpOnly: true });

  // Cookie NÃO HttpOnly só com o papel — usado pelo front (Next.js middleware)
  // para decidir se mostra/esconde rotas. Nunca é usado para autorizar nada
  // no backend; a autorização real sempre valida o JWT assinado acima.
  res.cookie("cv_role", role, { ...commonOpts, httpOnly: false });
}

function clearSessionCookies(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.clearCookie("cv_role", { path: "/" });
}

// ─── Rate limit dedicado para rotas de autenticação ──────────────────────────
// Login/cadastro são alvo natural de força bruta — limite bem mais apertado
// que o rate limit geral da API.

const authRateLimit = advancedRateLimit({ max: 10, windowMinutes: 5 });

// ─── Middleware de autenticação admin (token fixo, mantido por compatibilidade) ─

/** Compara dois tokens em tempo constante, evitando timing attacks. */
function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Precisa ter o mesmo tamanho para o timingSafeEqual não lançar erro.
  // Como os tamanhos diferentes já revelam pouca informação (e ainda assim
  // fazemos a comparação com um buffer do mesmo tamanho de bufA), o retorno
  // continua false de forma segura.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA); // mantém tempo de execução consistente
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function requireAdmin(req: Request, res: Response, next: Function) {
  const token = req.headers["x-admin-token"];
  const validToken = process.env.ADMIN_TOKEN;

  if (!validToken) {
    return res.status(500).json({ error: "ADMIN_TOKEN não configurado no servidor." });
  }
  if (!token || typeof token !== "string" || !tokensMatch(token, validToken)) {
    return res.status(401).json({
      error: "Não autorizado.",
      code: "UNAUTHORIZED",
      timestamp: new Date().toISOString(),
    });
  }
  next();
}

// ─── Normalização de input ────────────────────────────────────────────────────
// NÃO escapamos HTML aqui. O texto vai para a IA, que precisa ver exatamente o que a pessoa
// escreveu (inclusive código com < > & ' "), e o frontend sempre renderiza como texto (React),
// nunca como HTML. O escape anterior corrompia o conteúdo (ex.: ' virava &amp;#x27;).

function sanitize(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") // caracteres de controle (mantém \n e \t)
    .replace(/\r\n?/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

// ─── POST /auth/register ──────────────────────────────────────────────────────

router.post("/auth/register", authRateLimit, async (req: Request, res: Response) => {
  const { name, email, password } = req.body ?? {};

  const validationError = validateRegisterInput({ name, email, password });
  if (validationError) {
    return res.status(400).json({ error: validationError, code: "INVALID_INPUT" });
  }

  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      // Mensagem genérica — não confirma nem nega qual campo já existe além do e-mail
      // (evita enumeração de contas, mas aqui é aceitável informar já que é o próprio
      // fluxo de cadastro pedindo pra tentar login).
      return res.status(409).json({ error: "Já existe uma conta com esse e-mail.", code: "EMAIL_TAKEN" });
    }

    const user = await createUser(name, email, password);
    const token = signToken(user);
    setSessionCookies(res, token, user.role);

    logger.info("Novo usuário cadastrado", { userId: user.id, ip: req.clientIp });

    // token vai também no corpo da resposta — o front guarda em localStorage
    // e manda via header Authorization como fallback para quando o cookie
    // cross-site é bloqueado (Safari/iOS, WebViews de apps).
    return res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    logger.error("Erro ao cadastrar usuário", { err: String(err) });
    return res.status(500).json({ error: "Erro interno ao criar conta.", code: "INTERNAL_ERROR" });
  }
});

// ─── POST /auth/login ──────────────────────────────────────────────────────────

router.post("/auth/login", authRateLimit, async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return res.status(400).json({ error: "E-mail e senha são obrigatórios.", code: "MISSING_FIELDS" });
  }

  try {
    const user = await findUserByEmail(email);

    // Mensagem idêntica para "não existe" e "senha errada" — evita
    // enumeração de contas via diferença de resposta.
    const genericError = { error: "E-mail ou senha inválidos.", code: "INVALID_CREDENTIALS" };

    if (!user) {
      return res.status(401).json(genericError);
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json(genericError);
    }

    const token = signToken(user);
    setSessionCookies(res, token, user.role);
    await touchLastLogin(user.id);

    logger.info("Login realizado", { userId: user.id, ip: req.clientIp });

    // token vai também no corpo da resposta — o front guarda em localStorage
    // e manda via header Authorization como fallback para quando o cookie
    // cross-site é bloqueado (Safari/iOS, WebViews de apps).
    return res.status(200).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    logger.error("Erro ao fazer login", { err: String(err) });
    return res.status(500).json({ error: "Erro interno ao autenticar.", code: "INTERNAL_ERROR" });
  }
});

// ─── POST /auth/logout ─────────────────────────────────────────────────────────

router.post("/auth/logout", (_req: Request, res: Response) => {
  clearSessionCookies(res);
  return res.status(200).json({ message: "Sessão encerrada." });
});

// ─── GET /auth/me ──────────────────────────────────────────────────────────────

router.get("/auth/me", requireAuth, (req: Request, res: Response) => {
  const user = req.user!;
  return res.status(200).json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// ─── POST /chat ───────────────────────────────────────────────────────────────
// Exige login (requireAuth) — a sessão de memória é sempre a do usuário
// autenticado (req.user.id), nunca um sessionId enviado pelo cliente.
// Isso elimina o risco de alguém acessar/sobrescrever a memória de outra
// pessoa apenas adivinhando ou reaproveitando um sessionId.
// injectionGuard roda depois, olhando o conteúdo da mensagem.

router.post("/chat", requireAuth, injectionGuard, async (req: Request, res: Response) => {
  const { message, history = [], conversationId, attachments = [], mode = "auto" } = req.body as ChatRequest;
  const sid = req.user!.id;

  if (!message || typeof message !== "string" || !message.trim()) {
    const err: ErrorResponse = {
      error: "O campo 'message' é obrigatório e não pode estar vazio.",
      code: "MISSING_MESSAGE",
      timestamp: new Date().toISOString(),
    };
    return res.status(400).json(err);
  }

  if (message.length > 2000) {
    const err: ErrorResponse = {
      error: "A mensagem não pode ter mais de 2000 caracteres.",
      code: "MESSAGE_TOO_LONG",
      timestamp: new Date().toISOString(),
    };
    return res.status(400).json(err);
  }

  // Limite diário de uso (custo): por usuário e, opcionalmente, global.
  const quota = await checkChatQuota(sid, req.user!.role);
  if (!quota.allowed) {
    const retryAfterSeconds = quota.retryAfterSeconds ?? 3600;
    logger.warn("Limite diário de mensagens atingido", { userId: sid, reason: quota.reason, used: quota.used, limit: quota.limit });
    const err: ErrorResponse = {
      error:
        quota.reason === "global"
          ? "A CRISO.AI atingiu o limite de uso de hoje 🌿 Volte mais tarde."
          : `Você chegou ao limite de ${quota.limit} mensagens por dia 🌿 Volte mais tarde para continuar.`,
      code: "DAILY_LIMIT",
      timestamp: new Date().toISOString(),
      retryAfterSeconds,
    };
    res.set("Retry-After", String(retryAfterSeconds));
    return res.status(429).json(err);
  }

  const cleanMessage = sanitize(message);

  // Anexos em base64: limite agregado de 8 MiB, MIME permitido e nome normalizado.
  const attachmentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  let attachmentText = "";
  if (!Array.isArray(attachments) || attachments.length > 5) {
    return res.status(400).json({ error: "Envie no máximo 5 anexos por mensagem.", code: "INVALID_ATTACHMENTS" });
  }
  let attachmentBytes = 0;
  for (const file of attachments) {
    if (!file || typeof file.name !== "string" || typeof file.mimeType !== "string" || typeof file.data !== "string") {
      return res.status(400).json({ error: "Um dos anexos está inválido.", code: "INVALID_ATTACHMENT" });
    }
    const mime = file.mimeType.toLowerCase();
    const allowed = /^(image\/(png|jpeg|webp))$/.test(mime) || mime === "application/pdf" || /^(text\/|application\/(json|xml))/.test(mime) || /\.(txt|md|csv|json|xml|js|jsx|ts|tsx|py|html|css|sql|log|yaml|yml)$/i.test(file.name);
    if (!allowed) return res.status(415).json({ error: `Formato não suportado: ${file.name}`, code: "UNSUPPORTED_FILE" });
    const bytes = Buffer.from(file.data, "base64");
    attachmentBytes += bytes.length;
    if (attachmentBytes > 8 * 1024 * 1024) return res.status(413).json({ error: "Os anexos juntos ultrapassam 8 MB.", code: "ATTACHMENTS_TOO_LARGE" });
    const safeName = file.name.replace(/[\\/\r\n]/g, "_").slice(0, 120);
    if (mime.startsWith("image/") || mime === "application/pdf") {
      attachmentParts.push({ inlineData: { mimeType: mime, data: bytes.toString("base64") } });
      attachmentText += `\n[Anexo enviado: ${safeName}]`;
    } else {
      const textContent = bytes.toString("utf8").slice(0, 120000);
      attachmentText += `\n\n--- CONTEÚDO DO ARQUIVO ${safeName} ---\n${textContent}\n--- FIM DO ARQUIVO ---`;
    }
  }
  const modeInstruction: Record<string, string> = {
    developer: "[Modo desenvolvedor: analise tecnicamente, explique a causa provável e proponha correções seguras e testáveis.]",
    teacher: "[Modo professor: explique passo a passo, em linguagem clara, com exemplos e verifique a compreensão.]",
    sustainability: "[Modo socioambiental: priorize sustentabilidade, impactos ambientais e soluções práticas; diferencie fatos de estimativas.]",
    auto: "",
  };
  const safeMode = typeof mode === "string" && mode in modeInstruction ? mode : "auto";
  const promptMessage = `${modeInstruction[safeMode]}\n${cleanMessage}${attachmentText}`.trim();

  logger.info("Nova mensagem recebida", {
    userId: sid,
    ip: req.clientIp,
    riskScore: req.riskScore ?? 0,
    msgLength: cleanMessage.length,
  });

  try {
    const memory = await getMemory(sid);
    // Mensagem com padrão de injeção detectado NÃO alimenta a memória.
    const suspicious = (req.detectedPatterns?.length ?? 0) > 0;
    const updatedMemory = suspicious ? memory : extractFromMessage(cleanMessage, memory);
    await saveMemory(sid, updatedMemory);

    // Só turnos "assistant" assinados por este servidor para ESTE usuário entram no contexto.
    const trustedHistory = filterTrustedHistory(history, sid) as ChatMessage[];
    const { reply, sources } = await getReply(promptMessage, trustedHistory, updatedMemory, attachmentParts);

    // A mensagem só entra na cota diária depois que a IA respondeu: falhas do provedor
    // (429/503) e cliques em "Tentar de novo" não gastam as mensagens do dia da pessoa.
    await logChatEvent(sid);

    let savedConversationId: string | undefined;
    try {
      const savedUserText = cleanMessage + (attachments.length ? `\n\n[Anexos: ${attachments.map((a: { name: string }) => String(a.name).replace(/[\\/\r\n]/g, "_").slice(0, 120)).join(", ")}]` : "");
      savedConversationId = await persistTurn(sid, typeof conversationId === "string" ? conversationId : undefined, savedUserText, reply, signReply(sid, reply));
    } catch (persistError) {
      logger.error("Não foi possível persistir a conversa", { userId: sid, error: String(persistError) });
    }

    const response: ChatResponse = {
      reply,
      sessionId: sid,
      ...(savedConversationId ? { conversationId: savedConversationId } : {}),
      timestamp: new Date().toISOString(),
      sig: signReply(sid, reply),
      ...(sources && sources.length ? { sources } : {}),
    };

    return res.status(200).json(response);
  } catch (error: unknown) {
    if (error instanceof AIProviderError) {
      logger.error("Erro ao chamar Gemini", {
        kind: error.kind,
        status: error.status,
        quotaId: error.quotaId,
        daily: error.daily,
        error: error.message,
      });

      const now = new Date().toISOString();

      // Mensagens ao usuário nunca expõem chave, modelo, stack ou detalhes do provedor.
      switch (error.kind) {
        case "rate_limit": {
          if (error.daily) {
            // Cota DIÁRIA do provedor esgotada: esperar alguns segundos não adianta.
            const retryAfterSeconds = error.retryAfterSeconds ?? 3600;
            const err: ErrorResponse = {
              error: "A CRISO.AI atingiu o limite de uso de hoje 🌿 Volte mais tarde para continuar.",
              code: "AI_QUOTA_DAILY",
              timestamp: now,
              retryAfterSeconds,
            };
            res.set("Retry-After", String(retryAfterSeconds));
            return res.status(429).json(err);
          }
          const retryAfterSeconds = error.retryAfterSeconds ?? 30;
          const err: ErrorResponse = {
            error: "Estamos com muita gente conversando agora 🌿 Tenta de novo em alguns segundos.",
            code: "RATE_LIMIT",
            timestamp: now,
            retryAfterSeconds,
          };
          res.set("Retry-After", String(retryAfterSeconds));
          return res.status(429).json(err);
        }
        case "timeout":
        case "unavailable": {
          const err: ErrorResponse = {
            error: "A IA está instável neste momento 🌿 Tenta de novo em instantes.",
            code: "AI_UNAVAILABLE",
            timestamp: now,
          };
          return res.status(503).json(err);
        }
        case "empty": {
          const err: ErrorResponse = {
            error: "Não consegui montar uma resposta agora. Tenta reformular a pergunta? 🌿",
            code: "AI_EMPTY",
            timestamp: now,
          };
          return res.status(502).json(err);
        }
        default: {
          // auth / bad_request / unknown → problema de configuração nosso, não do usuário
          const err: ErrorResponse = {
            error: "O assistente está indisponível no momento. Tente novamente mais tarde.",
            code: "AI_ERROR",
            timestamp: now,
          };
          return res.status(500).json(err);
        }
      }
    }

    logger.error("Erro ao processar /chat", { error: String(error) });

    const err: ErrorResponse = {
      error: "Erro interno ao processar sua mensagem. Tente novamente.",
      code: "API_ERROR",
      timestamp: new Date().toISOString(),
    };

    return res.status(500).json(err);
  }
});

// ─── GET /health ──────────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    status: "ok",
    version: "1.5.0",
    engine: `Gemini — ${getGeminiConfig().model}`,
    memory: "postgresql",
    search: isSearchProviderConfigured() ? "on" : "off",
    security: "active",
    timestamp: new Date().toISOString(),
  });
});

// ─── Histórico persistente de conversas (rotas autenticadas) ───────────────
router.use(conversationsRouter);

// ─── Memória do próprio usuário (consultar, corrigir, apagar) ────────────────

router.use(createMemoryRouter(requireAuth));

// ─── Rotas de memória administrativas (protegidas por token) ─────────────────

router.delete("/memory/:sessionId", requireAdmin, async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  await clearMemory(sessionId);
  logger.info("Memória apagada", { sessionId });
  return res.status(200).json({ message: "Memória apagada com sucesso.", sessionId });
});

router.get("/memory/:sessionId", requireAdmin, async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const memory = await getMemory(sessionId);
  return res.status(200).json({ sessionId, memory });
});

router.delete("/memory", requireAdmin, async (_req: Request, res: Response) => {
  const deleted = await cleanOldSessions(30);
  logger.info(`Limpeza de sessões: ${deleted} removidas`);
  return res.status(200).json({
    message: `${deleted} sessões antigas removidas.`,
    timestamp: new Date().toISOString(),
  });
});

// ─── Rotas de segurança (protegidas por admin) ────────────────────────────────

/**
 * GET /security/ip/:ip
 * Retorna o status de segurança de um IP específico.
 */
router.get("/security/ip/:ip", requireAdmin, async (req: Request, res: Response) => {
  const { ip } = req.params;
  const record = await getIpStatus(ip);

  if (!record) {
    return res.status(404).json({
      error: "IP não encontrado nos registros de segurança.",
      ip,
    });
  }

  const status: SecurityStatus = {
    ip: record.ip,
    riskScore: record.riskScore,
    suspiciousCount: record.suspiciousCount,
    blockCount: record.blockCount,
    isBlocked: record.blockedUntil !== null && new Date() < record.blockedUntil,
    blockedUntil: record.blockedUntil?.toISOString() ?? null,
    lastAttemptAt: record.lastAttemptAt.toISOString(),
  };

  return res.status(200).json(status);
});

/**
 * GET /security/logs/:ip
 * Retorna os últimos logs de segurança de um IP.
 * Query param: ?limit=20 (opcional)
 */
router.get("/security/logs/:ip", requireAdmin, async (req: Request, res: Response) => {
  const { ip } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string || "20", 10), 100);

  const logs = await getSecurityLogs(ip, limit);
  return res.status(200).json({ ip, logs, count: logs.length });
});

/**
 * POST /security/unblock/:ip
 * Desbloqueia manualmente um IP e zera seu score de risco.
 */
router.post("/security/unblock/:ip", requireAdmin, async (req: Request, res: Response) => {
  const { ip } = req.params;

  await unblockIp(ip);
  logger.info("IP desbloqueado manualmente", { ip, by: "admin" });

  return res.status(200).json({
    message: `IP ${ip} desbloqueado com sucesso.`,
    ip,
    timestamp: new Date().toISOString(),
  });
});

/**
 * DELETE /security/cleanup
 * Remove logs e registros de segurança antigos.
 * Query param: ?days=7 (opcional)
 */
router.delete("/security/cleanup", requireAdmin, async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string || "7", 10);
  const deleted = await cleanOldSecurityData(days);

  logger.info(`Limpeza de segurança: ${deleted} registros removidos`);
  return res.status(200).json({
    message: `${deleted} registros de segurança antigos removidos.`,
    days,
    timestamp: new Date().toISOString(),
  });
});

// ─── Rotas do painel administrativo (login + papel admin) ────────────────────
// Diferente das rotas /security e /memory acima (que usam o token fixo
// x-admin-token, mantidas por compatibilidade), estas usam a sessão de
// login normal — só usuários com role "admin" passam.

router.get(
  "/admin/metrics/overview",
  requireAuth,
  requireAdminRole,
  async (_req: Request, res: Response) => {
    try {
      const overview = await getOverview();
      return res.status(200).json(overview);
    } catch (err) {
      logger.error("Erro ao buscar overview de métricas", { err: String(err) });
      return res.status(500).json({ error: "Erro ao buscar métricas." });
    }
  }
);

/**
 * GET /admin/metrics/series?range=weekly|monthly
 * Retorna séries diárias para os últimos 7 (weekly) ou 30 (monthly) dias,
 * prontas para alimentar os gráficos do painel.
 */
router.get(
  "/admin/metrics/series",
  requireAuth,
  requireAdminRole,
  async (req: Request, res: Response) => {
    const range = req.query.range === "monthly" ? "monthly" : "weekly";
    const days = range === "monthly" ? 30 : 7;

    try {
      const [newUsers, chatMessages, securityEvents] = await Promise.all([
        getNewUsersSeries(days),
        getChatEventsSeries(days),
        getSecurityEventsSeries(days),
      ]);

      return res.status(200).json({ range, days, newUsers, chatMessages, securityEvents });
    } catch (err) {
      logger.error("Erro ao buscar séries de métricas", { err: String(err) });
      return res.status(500).json({ error: "Erro ao buscar séries de métricas." });
    }
  }
);

/**
 * GET /admin/users?limit=100&offset=0
 * Lista usuários cadastrados (sem hash de senha, óbvio).
 */
router.get(
  "/admin/users",
  requireAuth,
  requireAdminRole,
  async (req: Request, res: Response) => {
    const limit = parseInt((req.query.limit as string) || "100", 10);
    const offset = parseInt((req.query.offset as string) || "0", 10);

    try {
      const users = await listUsers(limit, offset);
      return res.status(200).json({ users, count: users.length });
    } catch (err) {
      logger.error("Erro ao listar usuários", { err: String(err) });
      return res.status(500).json({ error: "Erro ao listar usuários." });
    }
  }
);

/**
 * GET /admin/security/ips?limit=50
 * Lista os IPs com maior risco / mais bloqueios recentes — reaproveita
 * a tabela security_ips já existente.
 */
router.get(
  "/admin/security/ips",
  requireAuth,
  requireAdminRole,
  async (req: Request, res: Response) => {
    const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 200);
    try {
      const result = await metricsPool.query(
        `SELECT ip, risk_score, suspicious_count, block_count, blocked_until, last_attempt_at
         FROM security_ips
         ORDER BY risk_score DESC, last_attempt_at DESC
         LIMIT $1`,
        [limit]
      );
      return res.status(200).json({ ips: result.rows });
    } catch (err) {
      logger.error("Erro ao listar IPs de segurança", { err: String(err) });
      return res.status(500).json({ error: "Erro ao listar IPs." });
    }
  }
);

export default router;