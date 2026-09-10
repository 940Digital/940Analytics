export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "muted";
}) {
  const valueColor =
    tone === "good" ? "text-blue-accent" : tone === "muted" ? "text-grey-muted" : "text-charcoal-text";

  return (
    <div className="rounded-lg border border-charcoal-text/10 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-grey-muted">{label}</p>
      <p className={`mt-1 font-display text-3xl font-extrabold ${valueColor}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
