import type { SecurityIpRow } from "@/lib/types";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function SecurityTable({ ips }: { ips: SecurityIpRow[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h3 className="font-display text-sm font-semibold text-ink/80">IPs monitorados</h3>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface text-xs uppercase tracking-wide text-ink/45">
            <tr>
              <th className="px-4 py-2 font-medium">IP</th>
              <th className="px-4 py-2 font-medium">Risco</th>
              <th className="px-4 py-2 font-medium">Suspeitas</th>
              <th className="px-4 py-2 font-medium">Bloqueios</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Última atividade</th>
            </tr>
          </thead>
          <tbody>
            {ips.map((row) => {
              const isBlocked = row.blocked_until && new Date(row.blocked_until) > new Date();
              return (
                <tr key={row.ip} className="border-t border-line">
                  <td className="px-4 py-2 font-mono text-xs">{row.ip}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`font-mono text-xs font-medium ${
                        row.risk_score > 50 ? "text-rust" : "text-ink/70"
                      }`}
                    >
                      {row.risk_score}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-ink/60">{row.suspicious_count}</td>
                  <td className="px-4 py-2 text-ink/60">{row.block_count}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        isBlocked ? "bg-rust/10 text-rust" : "bg-forest/10 text-forest"
                      }`}
                    >
                      {isBlocked ? "Bloqueado" : "Liberado"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-ink/60">{formatDate(row.last_attempt_at)}</td>
                </tr>
              );
            })}
            {ips.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink/40">
                  Nenhum IP registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
