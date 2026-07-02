/**
 * Renderiza o texto de uma mensagem (usuário OU IA) aplicando um markdown
 * bem simples (**negrito**, *itálico*, destaque em "Crisomoeda"), sempre
 * como nós React de verdade — nunca via `dangerouslySetInnerHTML`.
 *
 * Isso elimina a classe inteira de XSS que existia na versão HTML estática
 * (onde `innerHTML = fmt(texto)` inseria HTML bruto no DOM): aqui, mesmo
 * que a resposta do modelo contenha `<script>` ou `<img onerror=...>`,
 * o React trata tudo como texto puro e nunca interpreta como marcação.
 */

const PATTERN = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(Crisomoedas?)/g;

export function MessageText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, lineIdx) => (
        <span key={lineIdx}>
          {renderLine(line, lineIdx)}
          {lineIdx < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function renderLine(line: string, lineIdx: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  PATTERN.lastIndex = 0;
  while ((match = PATTERN.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **negrito**
      nodes.push(<strong key={`${lineIdx}-${key++}`}>{match[2]}</strong>);
    } else if (match[3]) {
      // *itálico*
      nodes.push(<em key={`${lineIdx}-${key++}`}>{match[4]}</em>);
    } else if (match[5]) {
      // Crisomoeda(s)
      nodes.push(
        <span
          key={`${lineIdx}-${key++}`}
          className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[0.85em] font-medium text-gold-dark"
        >
          🪙 {match[5]}
        </span>
      );
    }

    lastIndex = PATTERN.lastIndex;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
}
