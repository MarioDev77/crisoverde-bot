"use client";

import { ChevronRight, Code2, FileText, Globe, GraduationCap, Lightbulb, MessageCircle, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Mascot } from "./Mascot";

interface Props {
  onPick: (text: string) => void;
  searchEnabled: boolean;
}

interface QuickCard {
  title: string;
  subtitle: string;
  icon: ReactNode;
  prompt: string;
  /** Quando preenchido, o cartão fica desabilitado e mostra este motivo (nada de botão que finge funcionar). */
  disabledReason?: string;
}

const EXAMPLES: { text: string; icon: ReactNode }[] = [
  { text: "Me ajude a corrigir esse erro no código", icon: <Code2 size={16} /> },
  { text: "Explique esse conceito de forma simples", icon: <Lightbulb size={16} /> },
  { text: "Pesquise as últimas novidades sobre IA", icon: <Search size={16} /> },
  { text: "Crie um plano de estudo para mim", icon: <GraduationCap size={16} /> },
];

export function Welcome({ onPick, searchEnabled }: Props) {
  const cards: QuickCard[] = [
    {
      title: "Tire dúvidas",
      subtitle: "sobre qualquer assunto",
      icon: <MessageCircle size={22} />,
      prompt: "Tenho uma dúvida: ",
    },
    {
      title: "Resolva problemas",
      subtitle: "do seu projeto",
      icon: <Code2 size={22} />,
      prompt: "Me ajude a resolver este problema no meu projeto: ",
    },
    {
      title: "Pesquise na internet",
      subtitle: searchEnabled ? "com fontes confiáveis" : "pesquisa não configurada",
      icon: <Globe size={22} />,
      prompt: "Quais são as últimas notícias sobre ",
      disabledReason: searchEnabled ? undefined : "A pesquisa na internet não está configurada neste servidor.",
    },
    {
      title: "Anexe arquivos",
      subtitle: "imagens, PDFs e código",
      icon: <FileText size={22} />,
      prompt: "Anexe um arquivo pelo campo de mensagem e diga o que deseja analisar.",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-8 text-center sm:py-10">
      <Mascot size={104} />
      <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
        Olá, eu sou a <span className="text-criso-accent">CRISO.AI</span>!
      </h1>
      <p className="mt-2 text-base text-criso-text sm:text-lg">Sua assistente inteligente da Crisoverde Digital.</p>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-criso-cyan sm:text-base">
        Estou aqui para te ajudar com estudos, programação, projetos, sustentabilidade e tudo que você precisar. É só me
        chamar!
      </p>

      <ul className="mt-8 grid w-full grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <li key={c.title}>
            <button
              onClick={() => onPick(c.prompt)}
              disabled={!!c.disabledReason}
              title={c.disabledReason}
              className="group flex h-full w-full flex-col rounded-2xl border border-criso-accent/25 bg-criso-surface p-4 text-left transition-colors enabled:hover:border-criso-accent/70 enabled:hover:bg-criso-raised disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-criso-accent/15 text-criso-accent">
                {c.icon}
              </span>
              <span className="mt-3 text-sm font-semibold">{c.title}</span>
              <span className="mt-0.5 flex w-full items-end justify-between gap-2 text-xs text-criso-muted">
                {c.subtitle}
                {!c.disabledReason && (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-criso-accent/15 text-criso-accent">
                    <ChevronRight size={14} aria-hidden="true" />
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-8 w-full text-left">
        <h2 className="text-sm font-medium">Exemplos de como você pode pedir:</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <li key={ex.text}>
              <button
                onClick={() => onPick(ex.text)}
                className="inline-flex items-center gap-2 rounded-full border border-criso-accent/25 bg-criso-panel px-4 py-2 text-xs text-criso-text transition-colors hover:border-criso-accent/70 hover:bg-criso-raised sm:text-sm"
              >
                <span className="text-criso-accent" aria-hidden="true">
                  {ex.icon}
                </span>
                {ex.text}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
