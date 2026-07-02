import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware de borda — só uma dica de roteamento pra melhorar a UX
 * (evita renderizar a página antes de redirecionar). NÃO é a camada de
 * segurança: `cv_role` é um cookie legível por JS de propósito (não é o
 * JWT), então ele nunca deve ser tratado como prova de identidade. A
 * autorização de verdade acontece no backend, validando o cookie HttpOnly
 * assinado em toda chamada de API — o <AuthGuard> e este middleware
 * apenas evitam telas piscando antes do redirecionamento real.
 */
export function middleware(req: NextRequest) {
  const role = req.cookies.get("cv_role")?.value;
  const { pathname } = req.nextUrl;

  const isHiddenAdminPath = pathname.startsWith("/painel-x7k9");

  if (isHiddenAdminPath && role !== "admin") {
    // 404 em vez de redirect pro login — não confirma que a rota existe.
    return NextResponse.rewrite(new URL("/404", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/painel-x7k9/:path*"],
};
