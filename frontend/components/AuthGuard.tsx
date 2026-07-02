"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { UserRole } from "@/lib/types";
import { Loader2 } from "lucide-react";

/**
 * Protege uma página no cliente. Isso é só uma camada de UX (evita mostrar
 * a tela por um instante antes de redirecionar) — a segurança de verdade
 * está no backend, que valida o JWT assinado em toda chamada de API
 * protegida e nunca confia em nada vindo do navegador.
 */
export function AuthGuard({
  children,
  requireRole,
}: {
  children: React.ReactNode;
  requireRole?: UserRole;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (requireRole && user.role !== requireRole) {
      // Não revela que a rota existe — manda pro chat como se a rota não fosse admin.
      router.replace("/chat");
    }
  }, [user, loading, requireRole, router]);

  if (loading || !user || (requireRole && user.role !== requireRole)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-6 w-6 animate-spin text-forest" />
      </div>
    );
  }

  return <>{children}</>;
}
