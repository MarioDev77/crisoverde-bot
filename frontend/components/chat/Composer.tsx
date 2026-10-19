"use client";

import { useEffect, type KeyboardEvent, type RefObject } from "react";
import { Mic, Paperclip, Send, Square } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** Esta conversa está esperando resposta. */
  busy: boolean;
  /** Qualquer requisição em andamento (bloqueia novo envio). */
  locked: boolean;
  max: number;
  inputRef: RefObject<HTMLTextAreaElement>;
}

export function Composer({ value, onChange, onSend, onStop, busy, locked, max, inputRef }: Props) {
  // Caixa de texto cresce com o conteúdo (até ~8 linhas)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value, inputRef]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  }

  const canSend = !!value.trim() && !locked;
  const nearLimit = value.length > max * 0.85;

  return (
    <div className="px-3 pb-3 pt-1 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-criso-accent/30 bg-criso-panel transition-colors focus-within:border-criso-accent/70">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, max))}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Digite sua mensagem..."
            aria-label="Mensagem para a CRISO.AI"
            className="block max-h-40 w-full resize-none bg-transparent px-4 pt-3.5 text-sm text-criso-text placeholder:text-criso-faint focus:outline-none"
          />

          <div className="flex items-center gap-2 px-3 pb-3 pt-2">
            {/* Anexar e gravar ainda não funcionam: ficam desabilitados e dizem isso (nada de botão de enfeite). */}
            <button
              disabled
              title="Envio de arquivos: em breve"
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-criso-faint disabled:cursor-not-allowed"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-criso-line">
                <Paperclip size={17} aria-hidden="true" />
              </span>
              <span className="hidden text-xs leading-tight sm:block">
                <span className="block">Anexar arquivo</span>
                <span className="block text-[11px]">Em breve</span>
              </span>
              <span className="sr-only sm:hidden">Anexar arquivo (em breve)</span>
            </button>
            <button
              disabled
              title="Gravação de áudio: em breve"
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-criso-faint disabled:cursor-not-allowed"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-criso-line">
                <Mic size={17} aria-hidden="true" />
              </span>
              <span className="hidden text-xs leading-tight sm:block">
                <span className="block">Gravar áudio</span>
                <span className="block text-[11px]">Em breve</span>
              </span>
              <span className="sr-only sm:hidden">Gravar áudio (em breve)</span>
            </button>

            <span
              className={`ml-auto text-xs tabular-nums ${nearLimit ? "text-criso-danger" : "text-criso-faint"}`}
              aria-label={`${value.length} de ${max} caracteres`}
            >
              {value.length}/{max}
            </span>

            {busy ? (
              <button
                onClick={onStop}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-criso-line text-criso-text hover:border-criso-danger hover:text-criso-danger"
                aria-label="Interromper resposta"
              >
                <Square size={15} aria-hidden="true" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!canSend}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-criso-accent text-criso-ink transition-colors hover:bg-criso-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Enviar mensagem"
              >
                <Send size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <p className="mt-2 hidden px-1 text-xs text-criso-faint sm:block">
          Shift + Enter para quebrar linha <span className="mx-2 text-criso-line">|</span> Enter para enviar
        </p>
      </div>
    </div>
  );
}
