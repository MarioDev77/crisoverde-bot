"use client";

import { useEffect, useRef } from "react";
import { ExternalLink, RotateCw, Square } from "lucide-react";
import { MessageText } from "@/components/MessageText";
import type { UiMessage } from "@/lib/types";
import type { ChatError } from "@/hooks/useChat";
import { Mascot } from "./Mascot";

interface Props {
  messages: UiMessage[];
  busy: boolean;
  searching: boolean;
  error: ChatError | null;
  retryIn: number;
  /** Há outra requisição em andamento (em outra conversa): bloqueia "tentar de novo". */
  locked: boolean;
  onRetry: () => void;
  onStop: () => void;
}

export function MessageList({ messages, busy, searching, error, retryIn, locked, onRetry, onStop }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, error]);

  return (
    <div
      ref={scrollRef}
      className="criso-scroll flex-1 overflow-y-auto px-3 py-5 sm:px-6"
      role="log"
      aria-live="polite"
      aria-label="Conversa"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}

        {busy && (
          <div className="flex items-end gap-2.5" role="status">
            <span className="sr-only">A CRISO.AI está respondendo</span>
            <Mascot size={30} className="shrink-0" />
            <div
              className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-criso-line bg-criso-surface px-4 py-3"
              aria-hidden="true"
            >
              {searching && <span className="text-xs text-criso-muted">Pesquisando na internet...</span>}
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </div>
            <button
              onClick={onStop}
              className="inline-flex items-center gap-1.5 rounded-full border border-criso-line px-3 py-1.5 text-xs text-criso-muted hover:border-criso-danger/60 hover:text-criso-danger"
            >
              <Square size={11} aria-hidden="true" />
              Parar
            </button>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-2 text-center" role="alert">
            <p className="text-sm text-criso-danger">⚠️ {error.message}</p>
            {error.retryable && (
              <button
                onClick={onRetry}
                disabled={busy || locked || retryIn > 0}
                className="inline-flex items-center gap-1.5 rounded-full border border-criso-line px-4 py-1.5 text-xs font-medium hover:border-criso-accent hover:text-criso-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCw size={13} aria-hidden="true" />
                {retryIn > 0 ? `Tentar de novo em ${retryIn}s` : "Tentar de novo"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({ message: m }: { message: UiMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="min-w-0 max-w-[88%] rounded-2xl rounded-br-md bg-criso-accent/15 px-4 py-2.5 text-sm leading-relaxed ring-1 ring-criso-accent/30 sm:max-w-[80%]">
          <MessageText text={m.content} plain />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2.5">
      <Mascot size={30} className="shrink-0" />
      <div className="min-w-0 max-w-[88%] rounded-2xl rounded-bl-md border border-criso-line bg-criso-surface px-4 py-2.5 text-sm leading-relaxed sm:max-w-[80%]">
        <MessageText text={m.content} />
        {m.sources && m.sources.length > 0 && (
          <div className="mt-2 border-t border-criso-line pt-2 text-xs text-criso-muted">
            <p className="mb-1 font-medium">Fontes:</p>
            <ul className="space-y-0.5">
              {m.sources.map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-criso-accent hover:underline"
                  >
                    <ExternalLink size={11} aria-hidden="true" />
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-criso-muted" style={{ animationDelay: delay }} />;
}
