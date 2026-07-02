import { Request, Response, NextFunction } from "express";
import { verifyToken, findUserById, AuthUser } from "./auth";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const COOKIE_NAME = "cv_token";

/** Extrai o token do cookie HttpOnly da requisição. */
function getTokenFromRequest(req: Request): string | null {
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  return cookies?.[COOKIE_NAME] ?? null;
}

/**
 * Middleware que exige um usuário autenticado (qualquer papel).
 * Popula `req.user` com os dados do usuário vindos do banco (não confia
 * cegamente no payload do JWT além do id/role, sempre confirma no banco
 * que o usuário ainda existe).
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = getTokenFromRequest(req);

  if (!token) {
    res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Sessão inválida ou expirada.", code: "INVALID_SESSION" });
    return;
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado.", code: "USER_NOT_FOUND" });
    return;
  }

  req.user = user;
  next();
}

/**
 * Middleware que exige um usuário autenticado E com papel "admin".
 * Deve ser usado DEPOIS de requireAuth na cadeia de middlewares.
 */
export function requireAdminRole(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });
    return;
  }
  if (req.user.role !== "admin") {
    // Resposta genérica — não revela que a rota existe para não-admins.
    res.status(404).json({ error: "Não encontrado." });
    return;
  }
  next();
}

export { COOKIE_NAME };
