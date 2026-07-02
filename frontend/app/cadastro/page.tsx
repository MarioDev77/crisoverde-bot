"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Leaf, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

function validate(name: string, email: string, password: string): string | null {
  if (name.trim().length < 2) return "Digite seu nome completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Digite um e-mail válido.";
  if (password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "A senha precisa ter letras e números.";
  }
  return null;
}

export default function CadastroPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validate(name, email, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    try {
      await register(name, email, password);
      router.push("/chat");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar a conta. Tente novamente.");
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
          <h1 className="font-display text-2xl font-semibold">Crie sua conta</h1>
          <p className="mt-1 text-sm text-ink/60">Leva menos de um minuto para começar a testar a IA.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          {error && (
            <p className="rounded-lg bg-rust/10 px-3 py-2 text-sm text-rust" role="alert">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="name" className="field-label">Nome</label>
            <input
              id="name"
              type="text"
              required
              autoComplete="name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>

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
              autoComplete="new-password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Pelo menos 8 caracteres, com letras e números"
            />
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Loader2 size={16} className="animate-spin" /> : "Criar conta"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-ink/60">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-forest hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
