"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { makeTitle, uid } from "@/lib/format";
import type { Conversation, UiMessage } from "@/lib/types";

interface Summary { id: string; title: string; createdAt: string; updatedAt: string; }
interface Detail extends Summary { messages: { role: "user" | "assistant"; content: string; sig?: string }[]; }
const asConversation = (c: Summary): Conversation => ({ id: c.id, title: c.title, createdAt: Date.parse(c.createdAt), updatedAt: Date.parse(c.updatedAt), messages: [], loaded: false });

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const loading = useRef(new Set<string>());
  const active = useMemo(() => conversations.find(c => c.id === activeId) ?? null, [conversations, activeId]);

  const refresh = useCallback(async () => {
    try {
      const result = await api.get<{ conversations: Summary[] }>("/conversations");
      setConversations(prev => {
        const local = prev.filter(c => c.id.startsWith("local_"));
        const remote = result.conversations.map(item => { const fresh = asConversation(item); const old = prev.find(c => c.id === item.id); return old ? { ...fresh, messages: old.messages, loaded: old.loaded } : fresh; });
        return [...local, ...remote.filter(c => !local.some(l => l.id === c.id))];
      });
    } catch { /* API offline: chat ainda pode mostrar erro quando enviar */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const startNew = useCallback(() => setActiveId(null), []);
  const select = useCallback((id: string) => {
    setActiveId(id);
    const conv = conversations.find(c => c.id === id);
    if (!conv || conv.loaded || conv.id.startsWith("local_") || loading.current.has(id)) return;
    loading.current.add(id);
    void api.get<Detail>(`/conversations/${id}`).then(detail => {
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title: detail.title, messages: detail.messages.map((m,i) => ({ id: `${id}-${i}`, role: m.role, content: m.content, sig: m.sig })), loaded: true, updatedAt: Date.parse(detail.updatedAt) } : c));
    }).catch(() => {}).finally(() => loading.current.delete(id));
  }, [conversations]);
  const create = useCallback((first: UiMessage): string => {
    const id = `local_${uid()}`; const now = Date.now();
    setConversations(prev => [{ id, title: makeTitle(first.content), createdAt: now, updatedAt: now, messages: [first], loaded: true }, ...prev]);
    setActiveId(id); return id;
  }, []);
  const append = useCallback((id: string, message: UiMessage) => setConversations(prev => prev.map(c => c.id === id ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() } : c)), []);
  const replaceId = useCallback((oldId: string, newId: string) => {
    setConversations(prev => prev.map(c => c.id === oldId ? { ...c, id: newId, loaded: true } : c));
    setActiveId(cur => cur === oldId ? newId : cur);
  }, []);
  const rename = useCallback(async (id: string, title: string) => {
    if (!id.startsWith("local_")) await api.patch(`/conversations/${id}`, { title });
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
  }, []);
  const remove = useCallback(async (id: string) => {
    if (!id.startsWith("local_")) await api.del(`/conversations/${id}`);
    setConversations(prev => prev.filter(c => c.id !== id)); setActiveId(cur => cur === id ? null : cur);
  }, []);
  return { conversations, activeId, active, startNew, select, create, append, replaceId, rename, remove, refresh };
}
export type ConversationsStore = ReturnType<typeof useConversations>;
