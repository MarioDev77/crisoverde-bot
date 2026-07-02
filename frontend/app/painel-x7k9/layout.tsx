"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/lib/auth-context";
import { ShieldCheck, LogOut } from "lucide-react";

function AdminHeader() {
  const { user, logout } = useAuth();
  return (
    <header className="contour-bg flex items-center justify-between border-b border-line bg-surface px-6 py-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest-dark text-white">
          <ShieldCheck size={17} />
        </span>
        <div>
          <p className="font-display text-base font-semibold leading-none">Painel administrativo</p>
          <p className="mt-1 text-xs text-ink/50">{user?.name} · {user?.email}</p>
        </div>
      </div>
      <button
        onClick={() => logout()}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink/60 hover:bg-paper hover:text-rust"
      >
        <LogOut size={15} />
        Sair
      </button>
    </header>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireRole="admin">
      <div className="min-h-screen bg-paper">
        <AdminHeader />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
