"use client";

import { Loader2, MessageSquare } from "lucide-react";
import { dayGroup, formatWhen, type DayGroup } from "@/lib/format";
import type { Conversation } from "@/lib/types";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  pendingId: string | null;
  onSelect: (id: string) => void;
  /** true quando há texto na busca (muda a mensagem de lista vazia). */
  filtering: boolean;
}

const GROUP_ORDER: DayGroup[] = ["Hoje", "Ontem", "Anteriores"];

export function ConversationList({ conversations, activeId, pendingId, onSelect, filtering }: Props) {
  if (conversations.length === 0) {
    return (
      <p className="px-3 py-4 text-xs leading-relaxed text-criso-faint">
        {filtering
          ? "Nenhuma conversa encontrada."
          : "Suas conversas desta sessão aparecem aqui. Clique em “Novo chat” ou escreva uma mensagem para começar."}
      </p>
    );
  }

  const now = Date.now();
  const groups = GROUP_ORDER.map((label) => ({
    label,
    items: conversations.filter((c) => dayGroup(c.updatedAt, now) === label),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-criso-faint">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((c) => {
              const isActive = c.id === activeId;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                      isActive ? "bg-criso-raised" : "hover:bg-criso-surface"
                    }`}
                  >
                    {pendingId === c.id ? (
                      <Loader2 size={16} className="shrink-0 animate-spin text-criso-accent" aria-label="Respondendo" />
                    ) : (
                      <MessageSquare size={16} className="shrink-0 text-criso-accent/80" aria-hidden="true" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-criso-text">{c.title}</span>
                      <span className="block truncate text-xs text-criso-faint">{formatWhen(c.updatedAt, now)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
