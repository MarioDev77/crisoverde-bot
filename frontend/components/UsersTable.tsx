import type { AdminUserRow } from "@/lib/types";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h3 className="font-display text-sm font-semibold text-ink/80">Usuários recentes</h3>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface text-xs uppercase tracking-wide text-ink/45">
            <tr>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">E-mail</th>
              <th className="px-4 py-2 font-medium">Papel</th>
              <th className="px-4 py-2 font-medium">Cadastro</th>
              <th className="px-4 py-2 font-medium">Último login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-4 py-2">{u.name}</td>
                <td className="px-4 py-2 text-ink/70">{u.email}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.role === "admin" ? "bg-gold/15 text-gold-dark" : "bg-forest/10 text-forest"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2 text-ink/60">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-2 text-ink/60">{formatDate(u.lastLoginAt)}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink/40">
                  Nenhum usuário cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
