"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";

/**
 * Renderiza uma mensagem do chat.
 *  - Resposta da IA (`plain` = false): markdown seguro (código com botão copiar, listas, links http(s)).
 *  - Mensagem do usuário (`plain` = true): texto puro, preservando quebras de linha.
 *
 * Tudo vira nós React — nunca `dangerouslySetInnerHTML`. Mesmo que a resposta contenha
 * `<script>` ou `<img onerror=...>`, o React trata como texto.
 */
export function MessageText({ text, plain = false }: { text: string; plain?: boolean }) {
  if (plain) return <span className="whitespace-pre-wrap break-words">{text}</span>;

  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.t) {
    case "code":
      return <CodeBlock lang={block.lang} code={block.code} />;
    case "heading":
      return (
        <p className={`font-semibold ${block.level <= 2 ? "text-base" : "text-sm"}`}>
          <Inlines items={block.inline} />
        </p>
      );
    case "ul":
      return (
        <ul className="list-disc space-y-0.5 pl-5">
          {block.items.map((it, i) => <li key={i}><Inlines items={it} /></li>)}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal space-y-0.5 pl-5">
          {block.items.map((it, i) => <li key={i}><Inlines items={it} /></li>)}
        </ol>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-criso-accent/40 pl-3 text-criso-muted">
          {block.lines.map((l, i) => <div key={i}><Inlines items={l} /></div>)}
        </blockquote>
      );
    default:
      return (
        <p>
          {block.lines.map((l, i) => (
            <span key={i}>
              <Inlines items={l} />
              {i < block.lines.length - 1 && <br />}
            </span>
          ))}
        </p>
      );
  }
}

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((it, i) => {
        switch (it.t) {
          case "bold":
            return <strong key={i}>{it.v}</strong>;
          case "italic":
            return <em key={i}>{it.v}</em>;
          case "code":
            return (
              <code key={i} className="rounded bg-criso-raised px-1 py-0.5 font-mono text-[0.85em] text-criso-text">
                {it.v}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={it.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="break-all text-criso-accent underline underline-offset-2 hover:text-criso-accent-dark"
              >
                {it.v}
              </a>
            );
          case "badge":
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[0.85em] font-medium text-amber-300"
              >
                🪙 {it.v}
              </span>
            );
          default:
            return <span key={i}>{it.v}</span>;
        }
      })}
    </>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard pode estar bloqueado (HTTP, WebView). Sem fallback: o texto continua selecionável.
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-criso-line bg-criso-bg text-criso-text">
      <div className="flex items-center justify-between gap-2 bg-white/5 px-3 py-1.5 text-xs text-criso-muted">
        <span className="font-mono">{lang || "código"}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 hover:bg-white/10 hover:text-white"
          aria-label={copied ? "Código copiado" : "Copiar código"}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
