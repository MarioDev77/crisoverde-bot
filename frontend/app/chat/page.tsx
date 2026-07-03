"use client";

import { useEffect, useRef, useState } from "react";
import { Leaf, LogOut, Send, ExternalLink } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { MessageText } from "@/components/MessageText";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import type { ChatMessage, ChatResponse, SourceRef } from "@/lib/types";

const MAX_MESSAGE_LENGTH = 2000;

// Mesma heurística leve usada no backend — aqui só liga o indicador visual
// opcional "Pesquisando na internet...", nunca decide o que é enviado.
const SEARCH_HINT_KEYWORDS = [
  "hoje", "agora", "atual", "notícia", "noticia", "última", "ultima", "recente",
  "resultado", "placar", "cotação", "cotacao", "dólar", "dolar", "clima",
  "temperatura", "previsão do tempo", "previsao do tempo", "quem ganhou",
  "está funcionando", "esta funcionando", "caiu", "fora do ar",
];

function looksLikeSearch(message: string): boolean {
  const normalized = message.toLowerCase();
  return SEARCH_HINT_KEYWORDS.some((kw) => normalized.includes(kw));
}

// Mensagem exibida na UI, com fontes anexadas quando a resposta usou busca
// externa. O histórico enviado ao backend continua sendo só {role, content}.
type UiMessage = ChatMessage & { sources?: SourceRef[] };

function ChatPageContent() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    setError(null);
    setInput("");
    setBusy(true);
    setSearching(looksLikeSearch(trimmed));

    const nextHistory: UiMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextHistory);

    try {
      const data = await api.post<ChatResponse>("/chat", {
        message: trimmed,
        history: messages.slice(-20).map(({ role, content }) => ({ role, content })),
      });
      setMessages([
        ...nextHistory,
        { role: "assistant", content: data.reply, sources: data.sources },
      ]);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Erro de conexão. Tente novamente.";
      setError(message);
      setMessages(nextHistory); // mantém a mensagem do usuário, só não adiciona resposta
    } finally {
      setBusy(false);
      setSearching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-screen flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest text-white">
            <Leaf size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold leading-none">Assistente Crisoverde</p>
            <p className="text-xs text-ink/50">Olá, {user?.name.split(" ")[0]}</p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink/60 hover:bg-paper hover:text-rust"
        >
          <LogOut size={15} />
          Sair
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.length === 0 && (
            <div className="mt-10 text-center text-ink/50">
              <p className="font-display text-lg text-ink/70">Como posso ajudar?</p>
              <p className="mt-1 text-sm">Pergunte sobre reciclagem, Crisomoeda ou o CrisoApp.</p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-forest text-white"
                    : "border border-line bg-surface text-ink"
                }`}
              >
                <MessageText text={m.content} />
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 border-t border-line/60 pt-2 text-xs text-ink/50">
                    <p className="mb-1 font-medium">Fontes:</p>
                    <ul className="space-y-0.5">
                      {m.sources.map((s, si) => (
                        <li key={si}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-forest hover:underline"
                          >
                            <ExternalLink size={11} />
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
                {searching && <span className="text-xs text-ink/50">Pesquisando na internet...</span>}
                <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
              </div>
            </div>
          )}

          {error && (
            <p className="text-center text-sm text-rust" role="alert">
              ⚠️ {error}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Digite sua mensagem..."
            className="field-input max-h-32 flex-1 resize-none"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="btn-primary !rounded-full !px-4 !py-2.5"
            aria-label="Enviar mensagem"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="mx-auto mt-1.5 max-w-2xl text-right text-xs text-ink/35">
          {input.length}/{MAX_MESSAGE_LENGTH}
        </p>
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink/30"
      style={{ animationDelay: delay }}
    />
  );
}

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatPageContent />
    </AuthGuard>
  );
}
