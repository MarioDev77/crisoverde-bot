"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Leaf, LogOut, Send, ExternalLink, RotateCw } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { MessageText } from "@/components/MessageText";
import { MemoryPanel } from "@/components/MemoryPanel";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import type { ChatMessage, ChatResponse, SourceRef } from "@/lib/types";

const MAX_MESSAGE_LENGTH = 2000;

// Mesma heurística leve usada no backend — aqui só liga o indicador visual
// opcional "Pesquisando na internet...", nunca decide o que é enviado.
// O indicador só aparece se o backend informar que a pesquisa está ligada (/health).
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

// Mensagem exibida na UI, com fontes anexadas quando a resposta usou busca externa.
// `sig` (assinatura da resposta da IA) é devolvida ao backend junto do histórico.
type UiMessage = ChatMessage & { sources?: SourceRef[] };

interface UiError {
  message: string;
  /** Mostra o botão "Tentar de novo" (falhas temporárias: rede, 5xx, 429 de instabilidade). */
  retryable: boolean;
}

function ChatPageContent() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Trava síncrona: setBusy é assíncrono, então dois Enter rápidos poderiam enviar duas vezes.
  const sendingRef = useRef(false);

  useEffect(() => {
    api
      .get<{ search?: string }>("/health")
      .then((d) => setSearchEnabled(d.search === "on"))
      .catch(() => setSearchEnabled(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, error]);

  // Contagem regressiva do "tentar de novo" (quando o backend informa retryAfterSeconds)
  useEffect(() => {
    if (retryIn <= 0) return;
    const id = setTimeout(() => setRetryIn((v) => v - 1), 1000);
    return () => clearTimeout(id);
  }, [retryIn]);

  // Caixa de texto cresce com o conteúdo (até ~8 linhas)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  /**
   * Envia `text` ao backend. `base` = histórico ANTES da mensagem; `full` = lista exibida
   * (base + mensagem do usuário). Assim o "tentar de novo" reenvia sem duplicar o balão.
   */
  async function submit(text: string, base: UiMessage[], full: UiMessage[]) {
    if (sendingRef.current) return;
    sendingRef.current = true;

    setError(null);
    setRetryIn(0);
    setBusy(true);
    setSearching(searchEnabled && looksLikeSearch(text));
    setMessages(full);

    try {
      const data = await api.post<ChatResponse>("/chat", {
        message: text,
        history: base
          .slice(-20)
          .map((m) => (m.role === "assistant" ? { role: m.role, content: m.content, sig: m.sig } : { role: m.role, content: m.content })),
      });
      setMessages([...full, { role: "assistant", content: data.reply, sources: data.sources, sig: data.sig }]);
    } catch (err) {
      if (err instanceof ApiError) {
        // 429 por limite DIÁRIO e erros 4xx (mensagem inválida, bloqueio) não adiantam repetir.
        const retryable = err.code !== "DAILY_LIMIT" && (err.status === 429 || err.status >= 500);
        setError({ message: err.message, retryable });
        if (retryable && err.retryAfterSeconds) setRetryIn(Math.min(err.retryAfterSeconds, 120));
      } else {
        setError({ message: "Erro de conexão. Tente novamente.", retryable: true });
      }
      // a mensagem do usuário continua na tela; só não há resposta
    } finally {
      sendingRef.current = false;
      setBusy(false);
      setSearching(false);
    }
  }

  function send() {
    const trimmed = input.trim();
    if (!trimmed || sendingRef.current) return;
    setInput("");
    void submit(trimmed, messages, [...messages, { role: "user", content: trimmed }]);
  }

  function retry() {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user" || sendingRef.current) return;
    void submit(last.content, messages.slice(0, -1), messages);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest text-white">
            <Leaf size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold leading-none">Assistente Crisoverde</p>
            <p className="text-xs text-ink/50">Olá, {user?.name.split(" ")[0]}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMemoryOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink/60 hover:bg-paper hover:text-forest"
          >
            <Brain size={15} />
            Memória
          </button>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink/60 hover:bg-paper hover:text-rust"
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </header>

      <MemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-5 sm:px-4 sm:py-6"
        role="log"
        aria-live="polite"
        aria-label="Conversa"
      >
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
                className={`min-w-0 max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[80%] ${
                  m.role === "user"
                    ? "bg-forest text-white"
                    : "border border-line bg-surface text-ink"
                }`}
              >
                <MessageText text={m.content} plain={m.role === "user"} />
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
            <div className="flex justify-start" role="status">
              <span className="sr-only">A CRISO.AI está respondendo</span>
              <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3" aria-hidden="true">
                {searching && <span className="text-xs text-ink/50">Pesquisando na internet...</span>}
                <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2 text-center" role="alert">
              <p className="text-sm text-rust">⚠️ {error.message}</p>
              {error.retryable && (
                <button
                  onClick={retry}
                  disabled={busy || retryIn > 0}
                  className="btn-secondary !px-4 !py-1.5 !text-xs"
                >
                  <RotateCw size={13} />
                  {retryIn > 0 ? `Tentar de novo em ${retryIn}s` : "Tentar de novo"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-surface px-3 py-3 sm:px-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Digite sua mensagem..."
            aria-label="Mensagem para a CRISO.AI"
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
