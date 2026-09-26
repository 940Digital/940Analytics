"use client";

import { SessionBreakdownDay } from "@/lib/analytics/types";

const CATEGORIES = [
  { key: "followedThrough" as const, label: "Followed through", color: "#16A34A" },
  { key: "bounced" as const, label: "Bounced", color: "#DC2626" },
  { key: "other" as const, label: "Browsed", color: "#B8BBC2" },
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx},${cy} L ${start.x},${start.y} A ${r},${r} 0 ${largeArc} 0 ${end.x},${end.y} Z`;
}

export function OutcomePieChart({ data }: { data: SessionBreakdownDay[] }) {
  const totals = CATEGORIES.map((c) => ({
    ...c,
    value: data.reduce((sum, d) => sum + d[c.key], 0),
  }));
  const total = totals.reduce((sum, c) => sum + c.value, 0);

  if (total === 0) {
    return <p className="text-xs text-grey-muted">No sessions in this window yet.</p>;
  }

  const size = 140;
  const r = 60;
  const cx = size / 2;
  const cy = size / 2;

  let angle = 0;
  const wedges = totals
    .filter((c) => c.value > 0)
    .map((c) => {
      const sweep = (c.value / total) * 360;
      const startAngle = angle;
      const endAngle = angle + sweep;
      angle = endAngle;
      const isFullCircle = sweep >= 359.999;
      return { ...c, startAngle, endAngle, isFullCircle };
    });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Session outcome share">
        {wedges.map((w) =>
          w.isFullCircle ? (
            <circle key={w.key} cx={cx} cy={cy} r={r} fill={w.color} />
          ) : (
            <path key={w.key} d={wedgePath(cx, cy, r, w.startAngle, w.endAngle)} fill={w.color} stroke="#FFFFFF" strokeWidth={1.5} />
          )
        )}
      </svg>
      <div className="space-y-1.5">
        {totals.map((c) => (
          <div key={c.key} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
            <span className="text-charcoal-text">{c.label}</span>
            <span className="text-grey-muted">
              {total ? Math.round((c.value / total) * 100) : 0}% ({c.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
