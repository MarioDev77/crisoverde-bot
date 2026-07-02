export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "gold" | "rust";
}) {
  const valueColor =
    tone === "gold" ? "text-gold-dark" : tone === "rust" ? "text-rust" : "text-ink";

  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink/50">{label}</p>
      <p className={`mt-1.5 font-mono text-2xl font-semibold ${valueColor}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/45">{hint}</p>}
    </div>
  );
}
