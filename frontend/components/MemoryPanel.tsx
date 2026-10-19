"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { MemoryResponse, MemoryView } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

type ItemField = "interesses" | "metas";

/**
 * Painel "Memória": o usuário vê tudo o que a CRISO.AI guarda sobre ele,
 * corrige, remove itens ou apaga tudo. Fala com GET/POST/DELETE /api/me/memory.
 */
export function MemoryPanel({ open, onClose }: Props) {
  const [memory, setMemory] = useState<MemoryView | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [profissao, setProfissao] = useState("");
  const [novoInteresse, setNovoInteresse] = useState("");
  const [novaMeta, setNovaMeta] = useState("");

  const closeRef = useRef<HTMLButtonElement>(null);

  const apply = useCallback((m: MemoryView) => {
    setMemory(m);
    setNome(m.nome ?? "");
    setCidade(m.cidade ?? "");
    setProfissao(m.profissao ?? "");
  }, []);

  // Carrega ao abrir
  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotice([]);
    setConfirmClear(false);
    setLoading(true);
    api
      .get<MemoryResponse>("/me/memory")
      .then((d) => apply(d.memory))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível carregar sua memória."))
      .finally(() => setLoading(false));
    closeRef.current?.focus();
  }, [open, apply]);

  // Esc fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function send(body: unknown) {
    setSaving(true);
    setError(null);
    setNotice([]);
    try {
      const d = await api.post<MemoryResponse>("/me/memory", body);
      apply(d.memory);
      if (d.rejected?.length) setNotice(d.rejected);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  function saveProfile() {
    if (!memory) return;
    const set: Record<string, string | null> = {};
    if (nome.trim() !== (memory.nome ?? "")) set.nome = nome.trim() || null;
    if (cidade.trim() !== (memory.cidade ?? "")) set.cidade = cidade.trim() || null;
    if (profissao.trim() !== (memory.profissao ?? "")) set.profissao = profissao.trim() || null;
    if (Object.keys(set).length === 0) return;
    void send({ set });
  }

  function addItem(campo: ItemField) {
    const value = (campo === "interesses" ? novoInteresse : novaMeta).trim();
    if (!value) return;
    (campo === "interesses" ? setNovoInteresse : setNovaMeta)("");
    void send({ add: { [campo]: [value] } });
  }

  async function clearAll() {
    setSaving(true);
    setError(null);
    setNotice([]);
    try {
      const d = await api.del<MemoryResponse>("/me/memory");
      apply(d.memory);
      setConfirmClear(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const profileChanged =
    !!memory &&
    (nome.trim() !== (memory.nome ?? "") ||
      cidade.trim() !== (memory.cidade ?? "") ||
      profissao.trim() !== (memory.profissao ?? ""));

  const hasOthers =
    !!memory &&
    (memory.outros.preferencias.length > 0 ||
      memory.outros.acoes_sustentaveis.length > 0 ||
      memory.outros.historico.length > 0);

  const isEmpty =
    !!memory &&
    !memory.nome && !memory.cidade && !memory.profissao && !memory.idade &&
    memory.interesses.length === 0 && memory.metas.length === 0 && !hasOthers;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-title"
        onClick={(e) => e.stopPropagation()}
        className="card max-h-[90vh] w-full max-w-md overflow-y-auto !rounded-b-none p-5 sm:!rounded-b-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="memory-title" className="text-lg font-semibold">Sua memória</h2>
            <p className="mt-1 text-xs leading-relaxed text-criso-muted">
              A CRISO.AI só guarda o que você conta sobre você. Metas expiram em{" "}
              {memory?.retencaoDias.metas ?? 90} dias; interesses e ocupação, em 1 ano. Ela não guarda o
              conteúdo das conversas.
            </p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="rounded-full p-1.5 text-criso-muted hover:bg-criso-raised hover:text-criso-text"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {loading && <p className="mt-6 text-sm text-criso-muted">Carregando...</p>}

        {error && (
          <p className="mt-4 text-sm text-criso-danger" role="alert">⚠️ {error}</p>
        )}

        {memory && !loading && (
          <div className="mt-5 space-y-5">
            {isEmpty && (
              <p className="rounded-xl bg-criso-raised px-4 py-3 text-sm text-criso-muted">
                Ainda não há nada guardado. Se você contar seu nome, cidade, interesses ou metas na conversa, eles aparecem aqui.
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label className="field-label" htmlFor="mem-nome">Nome</label>
                <input id="mem-nome" className="field-input" value={nome} maxLength={40}
                  onChange={(e) => setNome(e.target.value)} placeholder="Como você quer ser chamado(a)" />
              </div>
              <div>
                <label className="field-label" htmlFor="mem-cidade">Cidade</label>
                <input id="mem-cidade" className="field-input" value={cidade} maxLength={60}
                  onChange={(e) => setCidade(e.target.value)} placeholder="Onde você mora" />
              </div>
              <div>
                <label className="field-label" htmlFor="mem-prof">Ocupação</label>
                <input id="mem-prof" className="field-input" value={profissao} maxLength={40}
                  onChange={(e) => setProfissao(e.target.value)} placeholder="Ex.: estudante" />
              </div>
              <button className="btn-primary !px-4 !py-2" onClick={saveProfile} disabled={saving || !profileChanged}>
                Salvar alterações
              </button>
            </div>

            <ChipList
              title="Interesses"
              items={memory.interesses}
              limit={memory.limites.interesses}
              value={novoInteresse}
              onChange={setNovoInteresse}
              onAdd={() => addItem("interesses")}
              onRemove={(v) => void send({ remove: { interesses: [v] } })}
              disabled={saving}
            />
            <ChipList
              title="Metas sustentáveis"
              items={memory.metas}
              limit={memory.limites.metas}
              value={novaMeta}
              onChange={setNovaMeta}
              onAdd={() => addItem("metas")}
              onRemove={(v) => void send({ remove: { metas: [v] } })}
              disabled={saving}
            />

            {memory.idade && (
              <div className="flex items-center justify-between rounded-xl bg-criso-raised px-4 py-2.5 text-sm">
                <span>Idade registrada: {memory.idade}</span>
                <button
                  className="text-xs text-criso-danger hover:underline"
                  onClick={() => void send({ remove: { campos: ["idade"] } })}
                  disabled={saving}
                >
                  Remover
                </button>
              </div>
            )}

            {hasOthers && (
              <p className="rounded-xl bg-criso-raised px-4 py-3 text-xs text-criso-muted">
                Há outros registros antigos guardados. Eles saem se você usar “Apagar tudo”.
              </p>
            )}

            {notice.length > 0 && (
              <ul className="space-y-1 text-xs text-criso-danger" role="status">
                {notice.map((n, i) => <li key={i}>• {n}</li>)}
              </ul>
            )}

            <div className="border-t border-criso-line pt-4">
              {!confirmClear ? (
                <button
                  className="inline-flex items-center gap-1.5 text-sm text-criso-danger hover:underline"
                  onClick={() => setConfirmClear(true)}
                  disabled={saving || isEmpty}
                >
                  <Trash2 size={14} /> Apagar tudo
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-criso-muted">Apagar tudo que a CRISO.AI guarda sobre você?</span>
                  <button className="font-semibold text-criso-danger hover:underline" onClick={clearAll} disabled={saving}>
                    Sim, apagar
                  </button>
                  <button className="text-criso-muted hover:underline" onClick={() => setConfirmClear(false)}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChipList(props: {
  title: string;
  items: string[];
  limit: number;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (v: string) => void;
  disabled: boolean;
}) {
  const { title, items, limit, value, onChange, onAdd, onRemove, disabled } = props;
  return (
    <div>
      <p className="field-label">{title}</p>
      {items.length === 0 ? (
        <p className="mb-2 text-xs text-criso-muted">Nada por aqui.</p>
      ) : (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {items.map((it) => (
            <li key={it} className="inline-flex items-center gap-1 rounded-full border border-criso-line bg-criso-raised py-1 pl-3 pr-1.5 text-xs">
              {it}
              <button
                className="rounded-full p-0.5 text-criso-muted hover:bg-criso-line hover:text-criso-danger"
                onClick={() => onRemove(it)}
                disabled={disabled}
                aria-label={`Remover ${it}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className="field-input"
          value={value}
          maxLength={60}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder={`Adicionar (até ${limit})`}
          aria-label={`Adicionar em ${title}`}
        />
        <button className="btn-secondary !px-3 !py-2" onClick={onAdd} disabled={disabled || !value.trim()} aria-label={`Adicionar em ${title}`}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
