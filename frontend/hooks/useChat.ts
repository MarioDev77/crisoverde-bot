"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { uid } from "@/lib/format";
import type { ChatResponse, UiMessage } from "@/lib/types";
import type { ConversationsStore } from "./useConversations";

// Mesma heurística leve usada no backend — aqui só liga o indicador visual
// "Pesquisando na internet...", nunca decide o que é enviado. Só aparece se /health disser search: "on".
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

export interface ChatAttachment { name: string; mimeType: string; data: string; }
export type ChatMode = "auto" | "developer" | "teacher" | "sustainability";

export interface ChatError {
  convId: string;
  message: string;
  /** Mostra "Tentar de novo" (falhas temporárias: rede, 5xx, 429 de instabilidade, resposta interrompida). */
  retryable: boolean;
}

/**
 * Envio de mensagens. A lógica é a mesma que existia em app/chat/page.tsx (trava síncrona contra
 * envio duplo, "tentar de novo" sem duplicar o balão, contagem regressiva, 429 diário sem retry),
 * agora ligada à conversa ativa e com botão de interromper.
 */
export function useChat(store: ConversationsStore, searchEnabled: boolean) {
  const { active, create, append } = store;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  // Id da resposta que está sendo "escrita" na tela (efeito visual; só respostas novas, nunca o histórico).
  const [typingId, setTypingId] = useState<string | null>(null);

  // Trava síncrona: setState é assíncrono, então dois Enter rápidos poderiam enviar duas vezes.
  const sendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Último envio (texto, anexos, modo): "Tentar de novo" reenvia exatamente isso, sem perder os arquivos.
  const lastSendRef = useRef<{ text: string; attachments: ChatAttachment[]; mode: ChatMode } | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  // Contagem regressiva do "tentar de novo" (quando o backend informa retryAfterSeconds)
  useEffect(() => {
    if (retryIn <= 0) return;
    const id = setTimeout(() => setRetryIn((v) => v - 1), 1000);
    return () => clearTimeout(id);
  }, [retryIn]);

  // Cancela uma requisição em andamento se a página for fechada
  useEffect(() => () => abortRef.current?.abort(), []);

  /** `base` = histórico ANTES da mensagem do usuário (já exibida). Não acrescenta o balão do usuário. */
  const submit = useCallback(
    async (convId: string, text: string, base: UiMessage[], attachments: ChatAttachment[] = [], mode: ChatMode = "auto") => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setRetryIn(0);
      setTypingId(null); // um novo envio completa na hora a resposta anterior
      setPendingId(convId);
      setSearching(searchEnabled && looksLikeSearch(text));

      try {
        const data = await api.post<ChatResponse>(
          "/chat",
          {
            message: text,
            ...(convId.startsWith("local_") ? {} : { conversationId: convId }),
            attachments,
            mode,
            history: base
              .slice(-20)
              .map((m) =>
                m.role === "assistant"
                  ? { role: m.role, content: m.content, sig: m.sig }
                  : { role: m.role, content: m.content }
              ),
          },
          { signal: controller.signal }
        );
        const finalId = data.conversationId && data.conversationId !== convId ? data.conversationId : convId;
        if (finalId !== convId) { store.replaceId(convId, finalId); }
        const replyId = uid();
        append(finalId, { id: replyId, role: "assistant", content: data.reply, sources: data.sources, sig: data.sig });
        setTypingId(replyId);
        if (data.conversationId) void store.refresh();
      } catch (err) {
        if (controller.signal.aborted) {
          setError({ convId, message: "Resposta interrompida.", retryable: true });
        } else if (err instanceof ApiError) {
          // 429 por limite DIÁRIO e erros 4xx (mensagem inválida, bloqueio) não adiantam repetir.
          const retryable = err.code !== "DAILY_LIMIT" && err.code !== "AI_QUOTA_DAILY" && (err.status === 429 || err.status >= 500);
          setError({ convId, message: err.message, retryable });
          if (retryable && err.retryAfterSeconds) setRetryIn(Math.min(err.retryAfterSeconds, 120));
        } else {
          setError({ convId, message: "Erro de conexão. Tente novamente.", retryable: true });
        }
        // a mensagem do usuário continua na tela; só não há resposta
      } finally {
        sendingRef.current = false;
        abortRef.current = null;
        setPendingId(null);
        setSearching(false);
      }
    },
    [append, searchEnabled, store]
  );

  /** Envia `text` na conversa ativa, ou cria uma conversa nova se não houver ativa. */
  const send = useCallback(
    (text: string, attachments: ChatAttachment[] = [], mode: ChatMode = "auto") => {
      const trimmed = text.trim();
      if (!trimmed || sendingRef.current) return;
      const userMsg: UiMessage = { id: uid(), role: "user", content: trimmed };
      const current = activeRef.current;
      let convId: string;
      let base: UiMessage[];
      if (current) {
        convId = current.id;
        base = current.messages;
        append(convId, userMsg);
      } else {
        convId = create(userMsg);
        base = [];
      }
      lastSendRef.current = { text: trimmed, attachments, mode };
      void submit(convId, trimmed, base, attachments, mode);
    },
    [append, create, submit]
  );

  /** Reenvia a última mensagem do usuário (a que ficou sem resposta) sem duplicar o balão. */
  const retry = useCallback(() => {
    const current = activeRef.current;
    if (!current || sendingRef.current) return;
    const last = current.messages[current.messages.length - 1];
    if (!last || last.role !== "user") return;
    const prev = lastSendRef.current && lastSendRef.current.text === last.content ? lastSendRef.current : null;
    void submit(current.id, last.content, current.messages.slice(0, -1), prev?.attachments ?? [], prev?.mode ?? "auto");
  }, [submit]);

  /** Interrompe a espera pela resposta. O servidor pode já ter contado a mensagem na cota diária. */
  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** Termina o efeito de escrita: o texto completo aparece (ou já terminou sozinho). */
  const finishTyping = useCallback(() => setTypingId(null), []);

  return { pendingId, searching, error, retryIn, typingId, finishTyping, locked: pendingId !== null, send, retry, stop };
}
