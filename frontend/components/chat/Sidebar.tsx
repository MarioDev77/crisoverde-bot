"use client";

import { useEffect } from "react";
import { Brain, Leaf, LogOut, PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
import { initials } from "@/lib/format";
import type { Conversation } from "@/lib/types";
import { ConversationList } from "./ConversationList";

interface Props {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  userName: string;
  userEmail: string;
  /** Já filtradas pela busca e ordenadas. */
  conversations: Conversation[];
  totalCount: number;
  filtering: boolean;
  activeId: string | null;
  pendingId: string | null;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onOpenMemory: () => void;
  onFocusSearch: () => void;
  onLogout: () => void;
}

export function Sidebar(p: Props) {
  // Esc fecha a gaveta no celular
  useEffect(() => {
    if (!p.drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onCloseDrawer();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.drawerOpen, p.onCloseDrawer]);

  // No desktop recolhido, só os ícones aparecem. Na gaveta (celular) os rótulos sempre aparecem.
  const hideLabel = p.collapsed ? "lg:hidden" : "";

  const navBtn =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-criso-muted transition-colors hover:bg-criso-surface hover:text-criso-text";

  return (
    <>
      {p.drawerOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={p.onCloseDrawer} aria-hidden="true" />
      )}

      <aside
        aria-label="Menu lateral"
        className={`fixed inset-y-0 left-0 z-40 flex w-[19rem] max-w-[85vw] flex-col border-r border-criso-line bg-criso-panel transition-transform duration-200 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:transition-[width] ${
          p.collapsed ? "lg:w-[76px]" : "lg:w-72"
        } ${p.drawerOpen ? "translate-x-0" : "invisible -translate-x-full lg:visible"}`}
      >
        {/* Marca */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-criso-accent/15 text-criso-accent">
            <Leaf size={22} aria-hidden="true" />
          </span>
          <div className={`min-w-0 flex-1 ${hideLabel}`}>
            <p className="truncate text-lg font-semibold leading-none">CRISO.AI</p>
            <p className="mt-1 truncate text-xs text-criso-muted">Sua assistente inteligente</p>
          </div>
          <button
            onClick={p.onToggleCollapsed}
            className="hidden rounded-lg p-2 text-criso-muted hover:bg-criso-surface hover:text-criso-text lg:block"
            aria-label={p.collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            aria-expanded={!p.collapsed}
          >
            {p.collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <div className="px-3">
          <button
            onClick={p.onNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-criso-accent px-3 py-3 text-sm font-semibold text-criso-ink transition-colors hover:bg-criso-accent-dark"
            title="Novo chat"
          >
            <Plus size={18} aria-hidden="true" />
            <span className={hideLabel}>Novo chat</span>
          </button>
        </div>

        <nav aria-label="Atalhos" className="space-y-0.5 px-3 pt-3">
          <button onClick={p.onOpenMemory} className={navBtn} title="Memória">
            <Brain size={18} className="shrink-0" aria-hidden="true" />
            <span className={hideLabel}>Memória</span>
          </button>
          <button
            onClick={() => {
              p.onCloseDrawer();
              p.onFocusSearch();
            }}
            className={navBtn}
            title="Pesquisa"
          >
            <Search size={18} className="shrink-0" aria-hidden="true" />
            <span className={hideLabel}>Pesquisa</span>
          </button>
        </nav>

        {/* Conversas */}
        <div className={`mt-4 flex min-h-0 flex-1 flex-col border-t border-criso-line pt-3 ${hideLabel}`}>
          <div className="flex items-center justify-between px-6 pb-2">
            <h2 className="text-sm font-medium">Conversas recentes</h2>
            <span
              className="rounded-full bg-criso-raised px-2 py-0.5 text-xs text-criso-muted"
              aria-label={`${p.totalCount} conversas`}
            >
              {p.totalCount}
            </span>
          </div>
          <div className="criso-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-2">
            <ConversationList
              conversations={p.conversations}
              activeId={p.activeId}
              pendingId={p.pendingId}
              onSelect={(id) => { p.onSelect(id); p.onCloseDrawer(); }}
              onRename={p.onRename}
              onRemove={p.onRemove}
              filtering={p.filtering}
            />
          </div>
          <p className="px-6 pb-2 text-[11px] leading-snug text-criso-faint">
            Suas conversas ficam salvas na sua conta. Reabra, renomeie ou exclua quando quiser.
          </p>
        </div>
        {p.collapsed && <div className="hidden flex-1 lg:block" />}

        {/* Perfil */}
        <div className="border-t border-criso-line p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-criso-accent text-sm font-semibold text-criso-ink"
              aria-hidden="true"
            >
              {initials(p.userName)}
            </span>
            <div className={`min-w-0 flex-1 ${hideLabel}`}>
              <p className="truncate text-sm font-medium">{p.userName}</p>
              <p className="truncate text-xs text-criso-muted">{p.userEmail}</p>
            </div>
            <button
              onClick={p.onLogout}
              className={`rounded-lg p-2 text-criso-muted hover:bg-criso-surface hover:text-criso-danger ${hideLabel}`}
              aria-label="Sair da conta"
              title="Sair"
            >
              <LogOut size={17} />
            </button>
          </div>
          {p.collapsed && (
            <button
              onClick={p.onLogout}
              className="mt-1 hidden w-full justify-center rounded-lg p-2 text-criso-muted hover:bg-criso-surface hover:text-criso-danger lg:flex"
              aria-label="Sair da conta"
              title="Sair"
            >
              <LogOut size={17} />
            </button>
          )}
        </div>

        <div className={`border-t border-criso-line px-5 py-3 ${hideLabel}`}>
          <p className="text-sm font-semibold text-criso-accent">Crisoverde Digital</p>
          <p className="text-xs text-criso-muted">Tecnologia que transforma</p>
        </div>
      </aside>
    </>
  );
}
