"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Session = {
  id: string;
  session_start: string;
  is_bot: boolean;
  is_bounce: boolean | null;
  referrer: string | null;
};

type Granularity = "day" | "week" | "month";

const RANGES: { key: string; label: string; days: number; granularity: Granularity }[] = [
  { key: "7d", label: "7 days", days: 7, granularity: "day" },
  { key: "30d", label: "30 days", days: 30, granularity: "day" },
  { key: "90d", label: "90 days", days: 90, granularity: "week" },
  { key: "365d", label: "12 months", days: 365, granularity: "month" },
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function bucketStart(d: Date, g: Granularity) {
  if (g === "day") return startOfDay(d);
  if (g === "week") return startOfWeek(d);
  return startOfMonth(d);
}
function bucketKey(d: Date, g: Granularity) {
  const b = bucketStart(d, g);
  return g === "month"
    ? `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}`
    : b.toISOString().slice(0, 10);
}
function nextBucket(d: Date, g: Granularity) {
  const x = new Date(d);
  if (g === "day") x.setDate(x.getDate() + 1);
  else if (g === "week") x.setDate(x.getDate() + 7);
  else x.setMonth(x.getMonth() + 1);
  return x;
}
function bucketLabel(start: Date, g: Granularity) {
  if (g === "day") return start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (g === "month") return start.toLocaleDateString(undefined, { month: "short" });
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–${end.toLocaleDateString(undefined, { day: "numeric" })}`;
}

function topRoundedBarPath(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, Math.max(height, 0));
  if (height <= 0) return "";
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}
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

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SessionChart({ siteId }: { siteId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rangeKey, setRangeKey] = useState(RANGES[1].key); // default 30 days
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1];

  // Scoped to the selected range, refetched on change - and paginated,
  // because Postgrest silently caps any single request at its own default
  // row limit (1000) no matter what .limit() asks for. A busy site's 12-
  // month window can easily clear that on its own, and without paging it
  // came back truncated - ascending-sorted, so it was always the OLDEST
  // rows that survived and the newest ones that silently vanished.
  useEffect(() => {
    let cancelled = false;
    setSessions(null);
    const since = new Date();
    since.setDate(since.getDate() - (range.days - 1));
    const windowStartIso = bucketStart(since, range.granularity).toISOString();
    const PAGE = 1000;

    (async () => {
      const all: Session[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from("sessions")
          .select("id, session_start, is_bot, is_bounce, referrer")
          .eq("site_id", siteId)
          .gte("session_start", windowStartIso)
          .order("session_start", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (cancelled) return;
        if (error || !data) break;
        all.push(...data);
        if (data.length < PAGE) break;
      }
      if (!cancelled) setSessions(all);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, siteId, range]);

  useEffect(() => {
    setSelected(null);
  }, [rangeKey]);

  const buckets = useMemo(() => {
    if (!sessions) return [];
    const since = new Date();
    since.setDate(since.getDate() - (range.days - 1));
    const windowStart = bucketStart(since, range.granularity);
    const inWindow = sessions.filter((s) => new Date(s.session_start) >= windowStart);

    const byKey = new Map<string, { start: Date; total: number; human: number; bot: number; sessions: Session[] }>();
    for (let cursor = new Date(windowStart); cursor <= new Date(); cursor = nextBucket(cursor, range.granularity)) {
      const key = bucketKey(cursor, range.granularity);
      byKey.set(key, { start: bucketStart(cursor, range.granularity), total: 0, human: 0, bot: 0, sessions: [] });
    }
    for (const s of inWindow) {
      const key = bucketKey(new Date(s.session_start), range.granularity);
      const b = byKey.get(key);
      if (!b) continue;
      b.total += 1;
      b.sessions.push(s);
      if (s.is_bot) b.bot += 1;
      else b.human += 1;
    }
    return Array.from(byKey.entries()).map(([key, b]) => ({ key, ...b }));
  }, [sessions, range]);

  const totals = useMemo(
    () =>
      buckets.reduce(
        (acc, b) => ({ total: acc.total + b.total, human: acc.human + b.human, bot: acc.bot + b.bot }),
        { total: 0, human: 0, bot: 0 }
      ),
    [buckets]
  );

  const selectedBucket = buckets.find((b) => b.key === selected) ?? null;

  const width = 700;
  const height = 200;
  const padding = { top: 8, bottom: 22, left: 30, right: 4 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const rawMax = Math.max(1, ...buckets.map((b) => b.total));
  const ticks = niceTicks(rawMax);
  const niceMax = ticks[ticks.length - 1];
  const gap = buckets.length > 40 ? 1 : 3;
  const barW = buckets.length > 0 ? (plotW - gap * (buckets.length - 1)) / buckets.length : 0;

  return (
    <div className="rounded-lg border border-charcoal-text/10 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-grey-muted">
          Traffic summary
        </h2>
        <div className="flex gap-1 rounded-lg bg-sand p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                rangeKey === r.key ? "bg-white text-charcoal-text shadow-sm" : "text-grey-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!sessions ? (
        <p className="mt-6 text-sm text-grey-muted">Loading…</p>
      ) : totals.total === 0 ? (
        <p className="mt-6 text-sm text-grey-muted">
          No sessions in this range yet. Once your snippet is live, visits will show up here.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-6">
            <Total label="Total sessions" value={totals.total} />
            <Total label="Real visitors" value={totals.human} tone="good" />
            <Total label="Bots blocked" value={totals.bot} tone="muted" />
          </div>

          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-grey-muted">
              <span className="h-2 w-2 rounded-full bg-blue-accent" /> Real visitors
            </div>
            <div className="flex items-center gap-1.5 text-xs text-grey-muted">
              <span className="h-2 w-2 rounded-full bg-grey-light" /> Bots blocked
            </div>
            <span className="text-xs text-grey-muted">Tap a bar for details</span>
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="mt-2 w-full"
            role="img"
            aria-label="Sessions over time"
          >
            {ticks.map((t) => {
              const y = padding.top + plotH - (t / niceMax) * plotH;
              return (
                <g key={t}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    stroke="var(--grey-light, #B8BBC2)"
                    strokeWidth={1}
                    opacity={t === 0 ? 1 : 0.4}
                  />
                  <text x={padding.left - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#7B7E85">
                    {t}
                  </text>
                </g>
              );
            })}
            {buckets.map((b, i) => {
              const x = padding.left + i * (barW + gap);
              const humanH = (b.human / niceMax) * plotH;
              const botH = (b.bot / niceMax) * plotH;
              const isSelected = selected === b.key;
              const isDimmed = selected !== null && !isSelected;
              return (
                <g key={b.key} opacity={isDimmed ? 0.35 : 1} style={{ cursor: b.total > 0 ? "pointer" : "default" }}>
                  {b.bot > 0 && (
                    <path
                      d={
                        b.human > 0
                          ? `M${x},${padding.top + plotH} h${barW} v${-botH} h${-barW} Z`
                          : topRoundedBarPath(x, padding.top + plotH - botH, barW, Math.max(botH, 2), 3)
                      }
                      fill="#B8BBC2"
                    />
                  )}
                  {b.human > 0 && (
                    <path
                      d={topRoundedBarPath(x, padding.top + plotH - botH - humanH, barW, Math.max(humanH, 2), 3)}
                      fill="#3194E0"
                    />
                  )}
                  <rect
                    x={x}
                    y={padding.top}
                    width={Math.max(barW, 1)}
                    height={plotH}
                    fill="transparent"
                    onClick={() => b.total > 0 && setSelected(isSelected ? null : b.key)}
                  >
                    <title>
                      {bucketLabel(b.start, range.granularity)}
                      {"\n"}Real visitors: {b.human}
                      {"\n"}Bots blocked: {b.bot}
                    </title>
                  </rect>
                  {(range.granularity !== "day" || buckets.length <= 14) && (
                    <text
                      x={x + barW / 2}
                      y={height - 6}
                      textAnchor="middle"
                      fontSize="8"
                      fill="#7B7E85"
                    >
                      {range.granularity === "day"
                        ? b.start.toLocaleDateString(undefined, { day: "numeric" })
                        : bucketLabel(b.start, range.granularity).split("–")[0]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {selectedBucket && (
            <div className="mt-4 rounded-lg border border-charcoal-text/10 bg-sand/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wide text-charcoal-text">
                  {bucketLabel(selectedBucket.start, range.granularity)} · {selectedBucket.total}{" "}
                  session{selectedBucket.total === 1 ? "" : "s"}
                </h3>
                <button
                  onClick={() => setSelected(null)}
                  className="text-xs text-grey-muted hover:text-charcoal-text"
                >
                  Close
                </button>
              </div>
              <div className="overflow-hidden rounded-md border border-charcoal-text/10 bg-white">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-charcoal-text/10 text-grey-muted">
                      <th className="px-3 py-1.5 font-medium">Time</th>
                      <th className="px-3 py-1.5 font-medium">Referrer</th>
                      <th className="px-3 py-1.5 font-medium">Outcome</th>
                      <th className="px-3 py-1.5 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBucket.sessions
                      .slice()
                      .sort((a, b) => b.session_start.localeCompare(a.session_start))
                      .map((s) => (
                        <tr key={s.id} className="border-b border-charcoal-text/5 text-charcoal-text last:border-0">
                          <td className="px-3 py-1.5">{fmtTime(s.session_start)}</td>
                          <td className="px-3 py-1.5 text-grey-muted">{s.referrer || "Direct"}</td>
                          <td className="px-3 py-1.5 text-grey-muted">{s.is_bounce ? "Bounced" : "Browsed"}</td>
                          <td className="px-3 py-1.5">
                            {s.is_bot ? (
                              <span className="rounded-full bg-grey-light/40 px-2 py-0.5 text-xs font-medium text-grey-muted">
                                Bot
                              </span>
                            ) : (
                              <span className="rounded-full bg-blue-accent/10 px-2 py-0.5 text-xs font-medium text-blue-accent">
                                Human
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Total({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "good" | "muted" }) {
  const color = tone === "good" ? "text-blue-accent" : tone === "muted" ? "text-grey-muted" : "text-charcoal-text";
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-grey-muted">{label}</p>
      <p className={`font-display text-2xl font-extrabold ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}
