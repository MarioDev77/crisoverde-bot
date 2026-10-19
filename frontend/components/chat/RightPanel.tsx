"use client";

import type { ReactNode } from "react";
import { Brain, Code2, FileSearch, Globe, GraduationCap, Leaf, ShieldCheck, X } from "lucide-react";
import type { HealthState } from "@/hooks/useHealth";
import { Mascot } from "./Mascot";

interface Props {
  health: HealthState;
  onOpenMemory: () => void;
  onPick: (text: string) => void;
  /** Presente quando o painel está aberto como sobreposição (telas menores). */
  onClose?: () => void;
  className?: string;
}

type Tone = "ok" | "auto" | "off" | "soon";

const TONE_STYLE: Record<Tone, string> = {
  ok: "bg-criso-accent/15 text-criso-accent",
  auto: "bg-criso-cyan/15 text-criso-cyan",
  off: "bg-criso-raised text-criso-muted",
  soon: "bg-criso-raised text-criso-faint",
};

const SUGGESTIONS = [
  "Quero ajuda com meu projeto",
  "Me explique algo sobre tecnologia",
  "Me ajude a estudar",
  "Quero uma ideia sustentável",
];

const STATUS_TEXT: Record<HealthState["status"], { text: string; dot: string }> = {
  loading: { text: "Verificando…", dot: "bg-amber-400" },
  online: { text: "Online", dot: "bg-criso-accent" },
  offline: { text: "Indisponível", dot: "bg-criso-danger" },
};

export function RightPanel({ health, onOpenMemory, onPick, onClose, className = "" }: Props) {
  const status = STATUS_TEXT[health.status];

  return (
    <aside
      aria-label="Painel da CRISO.AI"
      className={`criso-scroll flex w-full flex-col overflow-y-auto rounded-2xl border border-criso-line bg-criso-panel xl:w-80 ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-criso-line p-4">
        <Mascot size={52} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-none">CRISO.AI</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs">
            <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
            <span className={health.status === "online" ? "text-criso-accent" : "text-criso-muted"}>{status.text}</span>
          </p>
          <p className="mt-0.5 text-xs text-criso-muted">
            {health.status === "online" ? "Pronta para te ajudar" : "Sem conexão com o servidor"}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="self-start rounded-lg p-1.5 text-criso-muted hover:bg-criso-surface hover:text-criso-text"
            aria-label="Fechar painel"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <section className="p-4" aria-labelledby="recursos-title">
        <h2 id="recursos-title" className="text-sm font-semibold">
          Recursos disponíveis
        </h2>
        <ul className="mt-3 space-y-1">
          <Resource
            icon={<FileSearch size={18} />}
            title="Análise de arquivos"
            subtitle="PDF, imagens, código"
            badge="Em breve"
            tone="soon"
          />
          <Resource
            icon={<Globe size={18} />}
            title="Pesquisa na web"
            subtitle="Informações atualizadas"
            badge={health.searchEnabled ? "Ativa" : "Não configurada"}
            tone={health.searchEnabled ? "ok" : "off"}
          />
          <Resource
            icon={<Brain size={18} />}
            title="Memória inteligente"
            subtitle="Lembra o que você contou"
            badge="Ativa"
            tone="ok"
            onClick={onOpenMemory}
            actionLabel="Abrir minha memória"
          />
          <Resource
            icon={<Code2 size={18} />}
            title="Modo desenvolvedor"
            subtitle="Código, erros e soluções"
            badge="Automático"
            tone="auto"
          />
          <Resource
            icon={<GraduationCap size={18} />}
            title="Modo professor"
            subtitle="Explicações passo a passo"
            badge="Em breve"
            tone="soon"
          />
          <Resource
            icon={<ShieldCheck size={18} />}
            title="Modo socioambiental"
            subtitle="Dúvidas sobre sustentabilidade"
            badge="Em breve"
            tone="soon"
          />
        </ul>
      </section>

      <section className="px-4 pb-4" aria-labelledby="sugestoes-title">
        <h2 id="sugestoes-title" className="text-sm font-semibold">
          Sugestões rápidas
        </h2>
        <ul className="mt-3 space-y-2">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                onClick={() => {
                  onPick(s);
                  onClose?.();
                }}
                className="w-full rounded-xl border border-criso-accent/20 bg-criso-surface px-3 py-2.5 text-left text-sm transition-colors hover:border-criso-accent/60 hover:bg-criso-raised"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Arte decorativa (sem ação) */}
      <div
        className="relative mt-auto overflow-hidden border-t border-criso-line bg-gradient-to-t from-criso-accent/10 to-transparent px-5 py-5"
        aria-hidden="true"
      >
        <Leaf size={44} className="absolute -bottom-2 right-3 text-criso-accent/25" />
        <p className="max-w-[10rem] text-sm italic leading-snug text-criso-accent">
          Juntos por um futuro mais verde
        </p>
      </div>
    </aside>
  );
}

function Resource({
  icon,
  title,
  subtitle,
  badge,
  tone,
  onClick,
  actionLabel,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge: string;
  tone: Tone;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const body = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-criso-raised text-criso-text">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-criso-muted">{subtitle}</span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_STYLE[tone]}`}>{badge}</span>
    </>
  );

  return (
    <li>
      {onClick ? (
        <button
          onClick={onClick}
          aria-label={actionLabel}
          className="flex w-full items-center gap-3 rounded-xl px-1.5 py-2 text-left transition-colors hover:bg-criso-surface"
        >
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-1.5 py-2">{body}</div>
      )}
    </li>
  );
}
