"use client";

import { useEffect, useRef, useState } from "react";
import { MessageText } from "@/components/MessageText";
import { balancePartial, revealLength } from "@/lib/typing";

interface Props {
  text: string;
  /** Chamado uma vez quando o texto terminou de aparecer. */
  onDone: () => void;
  /** Chamado a cada atualização (a lista usa para acompanhar a rolagem). */
  onTick?: () => void;
}

/**
 * Mostra a resposta da IA sendo escrita aos poucos. O texto completo é a fonte da verdade: leitores de tela
 * recebem tudo de uma vez (a parte animada fica oculta para eles) e quem pediu menos movimento no sistema
 * vê a resposta inteira na hora.
 */
export function TypedMessage({ text, onDone, onTick }: Props) {
  const [shown, setShown] = useState(0);
  const doneRef = useRef(onDone);
  const tickRef = useRef(onTick);
  doneRef.current = onDone;
  tickRef.current = onTick;

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !text) {
      setShown(text.length);
      doneRef.current();
      return;
    }
    let raf = 0;
    let finished = false;
    const start = performance.now();
    const frame = () => {
      const n = revealLength(text, performance.now() - start);
      setShown(n);
      tickRef.current?.();
      if (n >= text.length) {
        if (!finished) {
          finished = true;
          doneRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [text]);

  const partial = balancePartial(text.slice(0, shown));
  return (
    <>
      <span className="sr-only">{text}</span>
      <div aria-hidden="true">
        <MessageText text={partial} />
        {shown < text.length && (
          <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-criso-accent align-baseline" />
        )}
      </div>
    </>
  );
}
