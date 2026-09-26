"use client";

import { useState } from "react";
import { SessionBreakdownDay } from "@/lib/analytics/types";

const CATEGORIES = [
  { key: "other" as const, label: "Browsed", color: "#B8BBC2" },
  { key: "bounced" as const, label: "Bounced", color: "#DC2626" },
  { key: "followedThrough" as const, label: "Followed through", color: "#16A34A" },
];

function topRoundedBarPath(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height);
  if (height <= 0) return "";
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

/** Picks a clean integer step (1/2/5/10/20/50…) so ~4 gridlines land on whole numbers. */
function niceTicks(max: number, targetCount = 4): number[] {
  if (max <= 0) return [0, 1];
  const rawStep = max / targetCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = Math.max(1, Math.round((norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag));
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax; v += step) ticks.push(v);
  return ticks;
}

export function BreakdownChart({ data }: { data: SessionBreakdownDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 560;
  const height = 160;
  const padding = { top: 8, bottom: 20, left: 26, right: 4 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const totals = data.map((d) => d.bounced + d.followedThrough + d.other);
  const rawMax = Math.max(1, ...totals);
  const ticks = niceTicks(rawMax);
  const niceMax = ticks[ticks.length - 1];
  const gap = 3;
  const segmentGap = 2;
  const barW = data.length > 0 ? (plotW - gap * (data.length - 1)) / data.length : 0;

  return (
    <div>
      <div className="mb-2 flex items-center gap-4">
        {CATEGORIES.map((c) => (
          <div key={c.key} className="flex items-center gap-1.5 text-xs text-grey-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
            {c.label}
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Session outcomes over the selected range">
        {ticks.map((t) => {
          const y = padding.top + plotH - (t / niceMax) * plotH;
          return (
            <g key={t}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#B8BBC2"
                strokeWidth={1}
                opacity={t === 0 ? 1 : 0.5}
              />
              <text x={padding.left - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize="8" fill="#7B7E85">
                {t}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x = padding.left + i * (barW + gap);
          const segments = CATEGORIES.map((c) => ({ ...c, value: d[c.key] })).filter((s) => s.value > 0);
          let cumulative = 0;
          const isHovered = hover === i;
          return (
            <g key={d.date}>
              {segments.map((seg, si) => {
                const segH = (seg.value / niceMax) * plotH - (si < segments.length - 1 ? segmentGap : 0);
                const y = padding.top + (plotH - cumulative - Math.max(segH, 0));
                cumulative += (seg.value / niceMax) * plotH;
                const isTop = si === segments.length - 1;
                return (
                  <path
                    key={seg.key}
                    d={isTop ? topRoundedBarPath(x, y, barW, Math.max(segH, 2), 3) : `M${x},${y} h${barW} v${Math.max(segH, 2)} h${-barW} Z`}
                    fill={seg.color}
                    opacity={isHovered ? 1 : 0.9}
                  />
                );
              })}
              <rect
                x={x}
                y={padding.top}
                width={barW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {/* One string, not seven children. React separates adjacent
                    text nodes with comment markers in HTML, but the parser
                    coalesces them inside SVG, so a server render of this chart
                    with data in hand fails to hydrate: React looks for seven
                    text nodes and finds one. */}
                <title>
                  {`${d.label}\nFollowed through: ${d.followedThrough}\nBounced: ${d.bounced}\nBrowsed: ${d.other}`}
                </title>
              </rect>
              {/* At two years there are 24 buckets and every tick still fits, but a
                  month of daily bars crowds; drop every other label past 20. */}
              {data.length <= 20 || i % 2 === 0 ? (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize="8" fill="#7B7E85">
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
