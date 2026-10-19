"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MemoryPanel } from "@/components/MemoryPanel";
import { useAuth } from "@/lib/auth-context";
import { useChat } from "@/hooks/useChat";
import { useConversations } from "@/hooks/useConversations";
import { useHealth } from "@/hooks/useHealth";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { RightPanel } from "./RightPanel";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Welcome } from "./Welcome";

const MAX_MESSAGE_LENGTH = 2000;

export function ChatApp() {
  const { user, logout } = useAuth();
  const health = useHealth();
  const store = useConversations();
  const chat = useChat(store, health.searchEnabled);

  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { conversations, active, activeId } = store;
  const messages = active?.messages ?? [];
  const busy = chat.pendingId !== null && chat.pendingId === active?.id;
  const error = chat.error && chat.error.convId === active?.id ? chat.error : null;

  const visibleConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    return q ? sorted.filter((c) => c.title.toLowerCase().includes(q)) : sorted;
  }, [conversations, query]);

  const focusInput = useCallback(() => {
    // espera o React terminar de trocar a tela antes de focar
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  /** Cartões, exemplos e sugestões só PREENCHEM o campo — a pessoa revisa e envia. */
  const pick = useCallback(
    (text: string) => {
      setInput(text.slice(0, MAX_MESSAGE_LENGTH));
      setDrawerOpen(false);
      setPanelOpen(false);
      focusInput();
    },
    [focusInput]
  );

  function newChat() {
    // Não apaga nada: só volta para a tela inicial. A conversa anterior continua na lista.
    store.startNew();
    setInput("");
    setDrawerOpen(false);
    focusInput();
  }

  function send() {
    const text = input.trim();
    if (!text || chat.locked) return;
    setInput("");
    chat.send(text);
  }

  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const showWelcome = !active || messages.length === 0;

  return (
    <div className="criso-theme flex h-[100dvh] overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
        userName={user?.name ?? ""}
        userEmail={user?.email ?? ""}
        conversations={visibleConversations}
        totalCount={conversations.length}
        filtering={query.trim().length > 0}
        activeId={activeId}
        pendingId={chat.pendingId}
        onNewChat={newChat}
        onSelect={store.select}
        onOpenMemory={() => {
          setDrawerOpen(false);
          setMemoryOpen(true);
        }}
        onFocusSearch={focusSearch}
        onLogout={() => void logout()}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          health={health}
          onOpenDrawer={() => setDrawerOpen(true)}
          onOpenPanel={() => setPanelOpen(true)}
        />

        <div className="flex min-h-0 flex-1 gap-4 px-3 pb-3 lg:px-4 lg:pb-4">
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-criso-line bg-criso-panel/60">
            {showWelcome ? (
              <div className="criso-scroll flex-1 overflow-y-auto">
                <Welcome onPick={pick} searchEnabled={health.searchEnabled} />
              </div>
            ) : (
              <MessageList
                messages={messages}
                busy={busy}
                searching={chat.searching}
                error={error}
                retryIn={chat.retryIn}
                locked={chat.locked}
                onRetry={chat.retry}
                onStop={chat.stop}
              />
            )}

            <Composer
              value={input}
              onChange={setInput}
              onSend={send}
              onStop={chat.stop}
              busy={busy}
              locked={chat.locked}
              max={MAX_MESSAGE_LENGTH}
              inputRef={inputRef}
            />
          </main>

          <RightPanel
            health={health}
            onOpenMemory={() => setMemoryOpen(true)}
            onPick={pick}
            className="hidden shrink-0 xl:flex"
          />
        </div>
      </div>

      {/* Painel de recursos como sobreposição em telas menores */}
      {panelOpen && (
        <div className="fixed inset-0 z-40 flex justify-end xl:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPanelOpen(false)} aria-hidden="true" />
          <RightPanel
            health={health}
            onOpenMemory={() => {
              setPanelOpen(false);
              setMemoryOpen(true);
            }}
            onPick={pick}
            onClose={() => setPanelOpen(false)}
            className="relative max-w-sm !rounded-r-none"
          />
        </div>
      )}

      <MemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />
    </div>
  );
}
