"use client";

/** Tiny inline trend line for a stat card — no axes, just shape. */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const width = 120;
  const height = 28;
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => `${i * step},${height - (v / max) * (height - 2) - 1}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 h-7 w-full" preserveAspectRatio="none" role="presentation">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
