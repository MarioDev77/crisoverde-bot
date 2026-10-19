"use client";

import type { RefObject } from "react";
import { Menu, Search, Sparkles, X } from "lucide-react";
import { formatModel } from "@/lib/format";
import type { HealthState } from "@/hooks/useHealth";

interface Props {
  query: string;
  onQuery: (v: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  health: HealthState;
  onOpenDrawer: () => void;
  onOpenPanel: () => void;
}

const STATUS_STYLE: Record<HealthState["status"], { dot: string; label: string }> = {
  loading: { dot: "bg-amber-400", label: "Verificando a CRISO.AI…" },
  online: { dot: "bg-criso-accent shadow-[0_0_8px_rgba(34,211,107,0.8)]", label: "CRISO.AI online" },
  offline: { dot: "bg-criso-danger", label: "CRISO.AI indisponível" },
};

export function TopBar({ query, onQuery, searchRef, health, onOpenDrawer, onOpenPanel }: Props) {
  const model = formatModel(health.model);
  const status = STATUS_STYLE[health.status];

  return (
    <header className="flex items-center gap-2 px-3 py-3 sm:gap-3 lg:px-4">
      <button
        onClick={onOpenDrawer}
        className="rounded-xl border border-criso-line p-2.5 text-criso-muted hover:border-criso-accent/50 hover:text-criso-text lg:hidden"
        aria-label="Abrir menu lateral"
      >
        <Menu size={18} />
      </button>

      <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-criso-line bg-criso-panel px-3.5 transition-colors focus-within:border-criso-accent/60">
        <Search size={17} className="shrink-0 text-criso-muted" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar nas conversas…"
          aria-label="Buscar nas conversas"
          className="min-w-0 flex-1 bg-transparent text-sm text-criso-text placeholder:text-criso-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            onClick={() => onQuery("")}
            className="rounded-full p-1 text-criso-muted hover:text-criso-text"
            aria-label="Limpar busca"
          >
            <X size={14} />
          </button>
        )}
        {model && (
          <span
            className="hidden shrink-0 items-center gap-1.5 border-l border-criso-line pl-3 text-sm text-criso-text sm:flex"
            title="Modelo configurado no servidor"
          >
            <Sparkles size={15} className="text-criso-cyan" aria-hidden="true" />
            {model}
          </span>
        )}
      </div>

      <button
        onClick={onOpenPanel}
        className="rounded-xl border border-criso-line p-2.5 text-criso-muted hover:border-criso-accent/50 hover:text-criso-text xl:hidden"
        aria-label="Abrir painel de recursos"
      >
        <Sparkles size={18} />
      </button>

      <span
        className={`h-3 w-3 shrink-0 rounded-full ${status.dot}`}
        role="img"
        aria-label={status.label}
        title={status.label}
      />
    </header>
  );
}
