"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Leaf, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.push("/chat");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="contour-bg flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-forest text-white">
            <Leaf size={20} />
          </span>
          <h1 className="font-display text-2xl font-semibold">Bem-vindo de volta</h1>
          <p className="mt-1 text-sm text-ink/60">Entre para conversar com a IA da Crisoverde.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          {error && (
            <p className="rounded-lg bg-rust/10 px-3 py-2 text-sm text-rust" role="alert">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="email" className="field-label">E-mail</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="field-label">Senha</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Loader2 size={16} className="animate-spin" /> : "Entrar"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-ink/60">
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="font-medium text-forest hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </main>
  );
}
