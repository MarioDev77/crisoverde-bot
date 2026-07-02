import Link from "next/link";
import { Leaf, Coins, MessageCircle, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="contour-bg">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest text-white">
              <Leaf size={18} />
            </span>
            <span className="font-display text-lg font-semibold">Crisoverde</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-ink/70 hover:text-forest">
              Entrar
            </Link>
            <Link href="/cadastro" className="btn-primary !px-5 !py-2 text-sm">
              Criar conta
            </Link>
          </nav>
        </header>

        <section className="mx-auto max-w-3xl px-6 pb-20 pt-16 text-center">
          <p className="mb-4 inline-block rounded-full border border-line bg-surface px-4 py-1 text-xs font-medium uppercase tracking-wide text-moss">
            Crisópolis · Bahia
          </p>
          <h1 className="text-balance font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Educação ambiental com quem entende do bairro
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-ink/70">
            Converse com a IA da Crisoverde: tire dúvidas sobre reciclagem, a
            Crisomoeda e o CrisoApp. Crie sua conta para testar o assistente.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/cadastro" className="btn-primary">
              <MessageCircle size={16} />
              Testar a IA agora
            </Link>
            <Link href="/login" className="btn-secondary">
              Já tenho conta
            </Link>
          </div>
        </section>
      </div>

      <section className="mx-auto grid max-w-4xl gap-4 px-6 pb-24 sm:grid-cols-3">
        <FeatureCard
          icon={<Leaf size={18} />}
          title="Reciclagem"
          text="Saiba o que pode ser reciclado e onde entregar em Crisópolis."
        />
        <FeatureCard
          icon={<Coins size={18} />}
          title="Crisomoeda"
          text="Entenda como pontuar e trocar por benefícios com parceiros locais."
        />
        <FeatureCard
          icon={<ShieldCheck size={18} />}
          title="Conversa segura"
          text="Cada conta tem sua própria sessão — sua conversa não se mistura com a de ninguém."
        />
      </section>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="card p-5">
      <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-forest/10 text-forest">
        {icon}
      </span>
      <h3 className="mb-1 font-display text-base font-semibold">{title}</h3>
      <p className="text-sm text-ink/65">{text}</p>
    </div>
  );
}
