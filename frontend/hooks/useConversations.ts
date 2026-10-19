"use client";

import { useCallback, useMemo, useState } from "react";
import { makeTitle, uid } from "@/lib/format";
import type { Conversation, UiMessage } from "@/lib/types";

/**
 * Lista de conversas.
 *
 * ETAPA 3: as conversas ficam só na memória do navegador (somem ao recarregar a página).
 * Na Etapa 4a este hook passa a ler/gravar em /api/conversations mantendo a mesma interface,
 * então os componentes não precisam mudar.
 *
 * `activeId === null` significa "conversa nova ainda não iniciada" (tela de boas-vindas). A
 * conversa só passa a existir na lista quando a primeira mensagem é enviada, para não acumular
 * conversas vazias a cada clique em "Novo chat".
 */
export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  /** Volta à tela de boas-vindas. Não apaga nem altera nenhuma conversa existente. */
  const startNew = useCallback(() => setActiveId(null), []);

  const select = useCallback((id: string) => setActiveId(id), []);

  /** Cria a conversa com a primeira mensagem do usuário e a torna ativa. Devolve o id. */
  const create = useCallback((first: UiMessage): string => {
    const id = uid();
    const now = Date.now();
    setConversations((prev) => [
      { id, title: makeTitle(first.content), createdAt: now, updatedAt: now, messages: [first] },
      ...prev,
    ]);
    setActiveId(id);
    return id;
  }, []);

  const append = useCallback((id: string, message: UiMessage) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() } : c))
    );
  }, []);

  return { conversations, activeId, active, startNew, select, create, append };
}

export type ConversationsStore = ReturnType<typeof useConversations>;
