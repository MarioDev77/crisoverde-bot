import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <p className="font-mono text-sm text-ink/40">404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-ink/60">
        O endereço que você tentou acessar não existe.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Voltar ao início
      </Link>
    </main>
  );
}
