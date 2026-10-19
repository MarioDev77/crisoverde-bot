"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/**
 * useVoiceInput — ditado por voz em dois motores:
 *  1) Web Speech API do navegador (Chrome/Edge): rápido, grátis, transcreve enquanto a pessoa fala.
 *  2) Fallback: grava o áudio (MediaRecorder) e o backend transcreve (/api/transcribe). Usado quando o
 *     navegador não tem reconhecimento de fala (Firefox, Brave, WebViews) ou o serviço de voz dele falha.
 *
 * Quando algo dá errado, a causa REAL é descoberta com getUserMedia (permissão negada, sem microfone,
 * microfone ocupado por outro programa...) em vez de uma mensagem genérica.
 */

const MAX_RECORD_MS = 60_000;

interface Options {
  /** Texto atual da caixa de mensagem (lido na hora de começar a gravar). */
  getValue: () => string;
  setValue: (v: string) => void;
  max: number;
  onError: (message: string) => void;
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m));
}

/** Descobre por que o microfone não abre e devolve uma mensagem em português. */
async function explainMicProblem(): Promise<string> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Este navegador não permite acesso ao microfone. Use o Chrome ou o Edge atualizado.";
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    // O microfone abre normalmente: o problema é o serviço de voz do navegador, não o aparelho.
    return "O microfone funciona, mas o serviço de voz do navegador não respondeu. Tente de novo em instantes.";
  } catch (err) {
    const name = (err as DOMException)?.name;
    switch (name) {
      case "NotAllowedError":
      case "SecurityError":
        return "O microfone está bloqueado para este site. Clique no cadeado ao lado do endereço, permita o microfone e tente de novo. Se já permitiu, confira em Configurações do Windows > Privacidade > Microfone se o navegador tem acesso.";
      case "NotFoundError":
      case "OverconstrainedError":
        return "Nenhum microfone foi encontrado. Conecte um e tente de novo.";
      case "NotReadableError":
      case "AbortError":
        return "O microfone está sendo usado por outro programa (Zoom, Meet, WhatsApp Desktop...). Feche-o e tente de novo.";
      default:
        return "Não foi possível acessar o microfone. Tente de novo.";
    }
  }
}

export function useVoiceInput({ getValue, setValue, max, onError }: Options) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const recognitionRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseRef = useRef("");
  const finalRef = useRef("");
  const gotResultRef = useRef(false);
  const aliveRef = useRef(true);

  // Os callbacks mudam a cada render; guardamos a versão mais recente em refs.
  const optsRef = useRef({ getValue, setValue, max, onError });
  optsRef.current = { getValue, setValue, max, onError };

  const releaseStream = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** Interrompe qualquer gravação/ditado em andamento (ex.: ao enviar a mensagem). */
  const abort = useCallback(() => {
    try { recognitionRef.current?.abort(); } catch { /* ignora */ }
    recognitionRef.current = null;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.ondataavailable = null;
      rec.onstop = null;
      try { rec.stop(); } catch { /* ignora */ }
    }
    recorderRef.current = null;
    releaseStream();
    setRecording(false);
  }, [releaseStream]);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; abort(); };
  }, [abort]);

  // ── Motor 2: gravar e transcrever no servidor ───────────────────────────────
  const startRecorder = useCallback(async () => {
    const mime = pickRecorderMime();
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      optsRef.current.onError("Seu navegador não oferece transcrição de voz. Use o Chrome ou o Edge atualizado.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      optsRef.current.onError(await explainMicProblem());
      return;
    }
    if (!aliveRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

    streamRef.current = stream;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorderRef.current = rec;

    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      releaseStream();
      recorderRef.current = null;
      setRecording(false);
      const type = rec.mimeType || mime || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size < 800) { optsRef.current.onError("Não ouvi nada. Fale mais perto do microfone e tente de novo."); return; }
      setTranscribing(true);
      try {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(blob);
        });
        const { text } = await api.post<{ text: string }>("/transcribe", { audio: dataUrl.split(",")[1] || "", mimeType: type });
        if (!aliveRef.current) return;
        const base = optsRef.current.getValue().replace(/\s+$/, "");
        optsRef.current.setValue(((base ? base + " " : "") + text).slice(0, optsRef.current.max));
      } catch (err: any) {
        optsRef.current.onError(err?.message || "Não foi possível transcrever agora. Tente de novo.");
      } finally {
        if (aliveRef.current) setTranscribing(false);
      }
    };

    rec.start();
    setRecording(true);
    // Limite de segurança: o áudio é enviado ao servidor, então não deixamos gravar para sempre.
    timerRef.current = setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, MAX_RECORD_MS);
  }, [releaseStream]);

  // ── Motor 1: reconhecimento de fala do navegador ────────────────────────────
  const startSpeechRecognition = useCallback((SR: any) => {
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.interimResults = true;
    rec.continuous = !/Android/i.test(navigator.userAgent);
    rec.maxAlternatives = 1;

    const current = optsRef.current.getValue();
    baseRef.current = current ? current.replace(/\s+$/, "") + " " : "";
    finalRef.current = "";
    gotResultRef.current = false;

    rec.onresult = (ev: any) => {
      gotResultRef.current = true;
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      optsRef.current.setValue((baseRef.current + finalRef.current + interim).slice(0, optsRef.current.max));
    };

    rec.onerror = async (ev: any) => {
      const code: string | undefined = ev?.error;
      recognitionRef.current = null;
      setRecording(false);
      if (code === "aborted") return;
      if (code === "no-speech") { optsRef.current.onError("Não ouvi nada. Fale mais perto do microfone e tente de novo."); return; }
      // Serviço de voz do navegador indisponível (Brave, rede, idioma): tenta o motor do servidor.
      if (code === "network" || code === "language-not-supported" || code === "service-not-allowed") {
        if (pickRecorderMime()) { void startRecorder(); return; }
      }
      // Permissão negada, microfone ausente/ocupado: descobre a causa real.
      optsRef.current.onError(await explainMicProblem());
    };

    rec.onend = () => { recognitionRef.current = null; setRecording(false); };

    recognitionRef.current = rec;
    try {
      rec.start();
      setRecording(true);
    } catch {
      recognitionRef.current = null;
      setRecording(false);
      void startRecorder();
    }
  }, [startRecorder]);

  const toggle = useCallback(async () => {
    optsRef.current.onError("");
    if (transcribing) return;

    // Já está gravando → parar (o texto final ainda chega antes do onend).
    if (recognitionRef.current) { recognitionRef.current.stop(); return; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") { recorderRef.current.stop(); return; }

    if (!window.isSecureContext) {
      optsRef.current.onError("O microfone só funciona em conexão segura (https).");
      return;
    }

    // Permissão já negada: nem adianta tentar, e a mensagem diz exatamente o que fazer.
    try {
      const status = await (navigator as any).permissions?.query?.({ name: "microphone" });
      if (status?.state === "denied") { optsRef.current.onError(await explainMicProblem()); return; }
    } catch { /* Safari/Firefox não suportam a consulta: segue normalmente */ }

    const W = window as any;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (SR) startSpeechRecognition(SR);
    else void startRecorder();
  }, [transcribing, startSpeechRecognition, startRecorder]);

  return { recording, transcribing, toggle, abort };
}
