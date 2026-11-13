/**
 * The one definition of every headline analytics figure: visitors, bots,
 * bounces, leads, lead follow-through, form starts and average time on site.
 *
 * The dashboard tiles, the outcome charts and the PDF report all take their
 * numbers from computeSiteMetrics() and their wording from metricTiles(), so
 * the same rows can never give two different answers on two screens.
 *
 * This file is pure (no Supabase, no React) and is kept byte-identical in
 * 94D_CRM (lib/siteMetrics.ts) and 940-analytics (lib/analytics/siteMetrics.ts).
 * Both repos run the same golden-fixture test against it, so a change to one
 * copy that is not made to the other fails that repo's test run.
 */

export const SITE_METRICS_VERSION = 1;

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export type MetricsRangeKey = "week" | "month" | "year" | "2y";

export interface MetricSession {
  id: string;
  session_start: string;
  duration_seconds: number | null;
  is_bounce: boolean;
  is_bot: boolean;
  user_agent?: string | null;
  referrer?: string | null;
  channel?: string | null;
  landing_page?: string | null;
  city?: string | null;
  region?: string | null;
}

export interface MetricEvent {
  session_id: string | null;
  event_type: string;
  event_target: string | null;
  created_at: string;
}

/** The only event types the headline figures read. Loaders should fetch just these. */
export const METRIC_EVENT_TYPES = ["lead_submit", "form_start", "social_click"] as const;

export interface MetricBucket {
  label: string;
  start: string;
  end: string;
}

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

/** A session counts for at most 30 minutes, so one idle tab cannot dominate the average. */
export const MAX_SESSION_SECONDS = 1800;

export type LeadKind = "form" | "call" | "text" | "email";

const CONTACT_LINK_KIND: Record<string, LeadKind> = {
  phone_click: "call",
  sms_click: "text",
  email_click: "email",
};

/**
 * A lead is a submitted form, or a tap on a phone, text or email link. The
 * tracker records all four as lead_submit; the target says which. A form that
 * was only started is not a lead (that is form_start, counted separately).
 */
export function leadKind(e: Pick<MetricEvent, "event_type" | "event_target">): LeadKind | null {
  if (e.event_type !== "lead_submit") return null;
  return CONTACT_LINK_KIND[e.event_target ?? ""] ?? "form";
}

export const LEAD_KIND_LABEL: Record<LeadKind, string> = {
  form: "Form sent",
  call: "Call tap",
  text: "Text tap",
  email: "Email click",
};

export const METRIC_HELP = {
  visitors: "Visits by people in this range. Bots and likely bots are left out.",
  bots: "Visits from crawlers, link previews and scripts. Not counted anywhere else.",
  avgTime: "Average visit length, each visit capped at 30 minutes. Visits by bots are left out.",
  bounces: "Visits that saw one page and did nothing on it.",
  leads:
    "Visits that ended in a sent form, a call tap, a text tap or an email click. Started forms do not count. The percentage is out of all visitors.",
  formStarts: "Visits where someone began filling in a form, sent or not.",
} as const;

/* ------------------------------------------------------------------ */
/* Bots that pass the collector's user agent check                     */
/* ------------------------------------------------------------------ */

/**
 * Fetchers the collector's user agent list did not know about when older rows
 * were stored. Matched again here so history is reclassified without touching
 * the stored rows.
 */
export const EXTRA_BOT_UA =
  /meta-externalagent|meta-externalfetcher|facebookcatalog|facebot|google-inspectiontool|googleother|google-extended|storebot-google|chrome-lighthouse|gtmetrix|pingdom|uptimerobot|vercel-screenshot|vercelbot|headless|lighthouse/i;

/**
 * Towns that are, for analytics purposes, hyperscale data centres (Meta, AWS,
 * Google, Microsoft). Real people live in some of them, so a visit from one is
 * only treated as a bot when it also did nothing (see likelyBotReason).
 */
export const DATA_CENTER_CITIES = new Set(
  [
    "prineville", // Meta, OR
    "forest city", // Meta, NC
    "altoona", // Meta, IA
    "papillion", // Meta, NE
    "los lunas", // Meta, NM
    "eagle mountain", // Meta, UT
    "henrico", // Meta, VA
    "boardman", // AWS, OR
    "ashburn", // AWS and others, VA
    "sterling", // AWS, VA
    "council bluffs", // Google, IA
    "the dalles", // Google, OR
    "lenoir", // Google, NC
    "moncks corner", // Google, SC
    "pryor", // Google, OK
    "quincy", // Microsoft, WA
    "boydton", // Microsoft, VA
  ].map((c) => c.toLowerCase())
);

/** A visit that did nothing: one page, no lead, and gone within this many seconds. */
const NO_INTERACTION_SECONDS = 30;

export type LikelyBotReason = "user agent" | "data center" | "same-second burst";

function secondKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19);
}

/**
 * Sessions the collector let through but which behave like crawlers or link
 * previews. Returns a reason per session id. Never applied to a visit that
 * produced a lead.
 */
export function findLikelyBots(sessions: MetricSession[], leadSessionIds: Set<string>): Map<string, LikelyBotReason> {
  const out = new Map<string, LikelyBotReason>();
  const idle = (s: MetricSession) =>
    !leadSessionIds.has(s.id) && s.is_bounce && (s.duration_seconds ?? 0) < NO_INTERACTION_SECONDS;

  // Two or more idle visits that start in the same second on the same landing
  // page: one link fetched by several preview servers at once (Meta does this
  // whenever a link is posted or sent in Messenger).
  const bySecond = new Map<string, MetricSession[]>();
  for (const s of sessions) {
    if (s.is_bot || !idle(s)) continue;
    const key = `${secondKey(s.session_start)}|${s.landing_page ?? ""}`;
    bySecond.set(key, [...(bySecond.get(key) ?? []), s]);
  }

  for (const s of sessions) {
    if (s.is_bot || leadSessionIds.has(s.id)) continue;
    if (s.user_agent && EXTRA_BOT_UA.test(s.user_agent)) {
      out.set(s.id, "user agent");
    } else if (idle(s) && DATA_CENTER_CITIES.has((s.city ?? "").trim().toLowerCase())) {
      out.set(s.id, "data center");
    } else if (idle(s) && (bySecond.get(`${secondKey(s.session_start)}|${s.landing_page ?? ""}`)?.length ?? 0) > 1) {
      out.set(s.id, "same-second burst");
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Range                                                               */
/* ------------------------------------------------------------------ */

/**
 * Daily buckets for week/month, monthly for year/2y, in the viewer's local
 * time. Every view builds its window from this, so a "last 30 days" figure
 * always starts at the same midnight.
 */
export function rangeBuckets(rangeKey: MetricsRangeKey, now: Date = new Date()): MetricBucket[] {
  const buckets: MetricBucket[] = [];
  if (rangeKey === "week" || rangeKey === "month") {
    const days = rangeKey === "week" ? 7 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      buckets.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, start: start.toISOString(), end: end.toISOString() });
    }
  } else {
    const months = rangeKey === "year" ? 12 : 24;
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      buckets.push({ label: start.toLocaleString("en-US", { month: "short" }), start: start.toISOString(), end: end.toISOString() });
    }
  }
  return buckets;
}

function bucketIndex(buckets: MetricBucket[], iso: string): number {
  const t = new Date(iso).getTime();
  for (let i = 0; i < buckets.length; i++) {
    if (t >= new Date(buckets[i].start).getTime() && t < new Date(buckets[i].end).getTime()) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

export interface OutcomeDay {
  date: string;
  label: string;
  followedThrough: number;
  bounced: number;
  other: number;
}

export interface SiteMetrics {
  version: number;
  buckets: MetricBucket[];
  totals: {
    /** Sessions by people (not unique people: the tracker has no login). */
    visitors: number;
    /** is_bot from the collector plus likely bots found here. */
    bots: number;
    botsFlagged: number;
    botsLikely: number;
    bounces: number;
    bounceRate: number;
    /** Sessions with at least one lead. */
    leads: number;
    leadRate: number;
    leadsByKind: Record<LeadKind, number>;
    /** Sessions where a form was started. */
    formStarts: number;
    /** Sessions where a form was sent. Same as leadsByKind.form. */
    formsSent: number;
    /** Sent / started, capped at 100. Null when nothing was started. */
    formCompletion: number | null;
    avgDuration: number;
    durationSamples: number;
    social: number;
    socialCounts: Record<string, number>;
  };
  series: {
    visitors: number[];
    bots: number[];
    avgDuration: number[];
    bounces: number[];
    leads: number[];
    social: number[];
  };
  outcomes: OutcomeDay[];
  /** Row-level detail for tables and for checking a figure by hand. */
  rows: {
    visitors: MetricSession[];
    bots: (MetricSession & { bot_reason: LikelyBotReason | "flagged" })[];
    leads: (MetricEvent & { kind: LeadKind })[];
    formStarts: MetricEvent[];
    social: MetricEvent[];
  };
}

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);

export function computeSiteMetrics(sessionsIn: MetricSession[], eventsIn: MetricEvent[], buckets: MetricBucket[]): SiteMetrics {
  const inRange = (iso: string) => bucketIndex(buckets, iso) !== -1;
  const sessions = sessionsIn.filter((s) => inRange(s.session_start));
  const byId = new Map(sessions.map((s) => [s.id, s]));

  // Only events that belong to a session in the window count. An event whose
  // session is missing (beacon raced or was blocked) cannot be attributed to a
  // person and is left out.
  const events = eventsIn.filter((e) => e.session_id && byId.has(e.session_id));

  const leadSessionsAll = new Set(events.filter((e) => leadKind(e)).map((e) => e.session_id as string));
  const likely = findLikelyBots(sessions, leadSessionsAll);

  const isPerson = (s: MetricSession) => !s.is_bot && !likely.has(s.id);
  const visitors = sessions.filter(isPerson);
  const botRows = sessions
    .filter((s) => !isPerson(s))
    .map((s) => ({ ...s, bot_reason: s.is_bot ? ("flagged" as const) : (likely.get(s.id) as LikelyBotReason) }));
  const personIds = new Set(visitors.map((s) => s.id));
  const personEvents = events.filter((e) => personIds.has(e.session_id as string));

  // Leads, one per session per kind: a visitor who taps Call twice is one call.
  const leadRows: (MetricEvent & { kind: LeadKind })[] = [];
  const seenLead = new Set<string>();
  for (const e of personEvents.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const kind = leadKind(e);
    if (!kind) continue;
    const key = `${e.session_id}|${kind}`;
    if (seenLead.has(key)) continue;
    seenLead.add(key);
    leadRows.push({ ...e, kind });
  }
  const leadSessions = new Set(leadRows.map((e) => e.session_id as string));
  const leadsByKind: Record<LeadKind, number> = { form: 0, call: 0, text: 0, email: 0 };
  for (const e of leadRows) leadsByKind[e.kind] += 1;

  const formStartRows = personEvents.filter((e) => e.event_type === "form_start");
  const formStartSessions = new Set(formStartRows.map((e) => e.session_id as string));
  // A sent form implies a started one even when the start beacon was lost.
  for (const e of leadRows) if (e.kind === "form") formStartSessions.add(e.session_id as string);
  const formsSent = leadsByKind.form;

  const social = personEvents.filter((e) => e.event_type === "social_click");
  const socialCounts: Record<string, number> = {};
  for (const e of social) socialCounts[e.event_target || "other"] = (socialCounts[e.event_target || "other"] || 0) + 1;

  const capped = (s: MetricSession) => Math.min(Math.max(s.duration_seconds ?? 0, 0), MAX_SESSION_SECONDS);
  const timed = visitors.filter((s) => typeof s.duration_seconds === "number");
  const avgDuration = timed.length ? timed.reduce((a, s) => a + capped(s), 0) / timed.length : 0;
  const bounces = visitors.filter((s) => !leadSessions.has(s.id) && s.is_bounce).length;

  const zeros = () => new Array(buckets.length).fill(0) as number[];
  const series = { visitors: zeros(), bots: zeros(), avgDuration: zeros(), bounces: zeros(), leads: zeros(), social: zeros() };
  const durSum = zeros();
  const durN = zeros();
  const outcomes = buckets.map((b) => ({ date: b.start, label: b.label, followedThrough: 0, bounced: 0, other: 0 }));
  for (const s of visitors) {
    const i = bucketIndex(buckets, s.session_start);
    series.visitors[i] += 1;
    if (typeof s.duration_seconds === "number") {
      durSum[i] += capped(s);
      durN[i] += 1;
    }
    if (leadSessions.has(s.id)) {
      series.leads[i] += 1;
      outcomes[i].followedThrough += 1;
    } else if (s.is_bounce) {
      series.bounces[i] += 1;
      outcomes[i].bounced += 1;
    } else {
      outcomes[i].other += 1;
    }
  }
  for (const s of botRows) series.bots[bucketIndex(buckets, s.session_start)] += 1;
  for (const e of social) {
    const i = bucketIndex(buckets, byId.get(e.session_id as string)!.session_start);
    series.social[i] += 1;
  }
  series.avgDuration = durSum.map((v, i) => (durN[i] ? v / durN[i] : 0));

  return {
    version: SITE_METRICS_VERSION,
    buckets,
    totals: {
      visitors: visitors.length,
      bots: botRows.length,
      botsFlagged: botRows.filter((s) => s.is_bot).length,
      botsLikely: botRows.filter((s) => !s.is_bot).length,
      bounces,
      bounceRate: pct(bounces, visitors.length),
      leads: leadSessions.size,
      leadRate: pct(leadSessions.size, visitors.length),
      leadsByKind,
      formStarts: formStartSessions.size,
      formsSent,
      formCompletion: formStartSessions.size ? Math.min(100, pct(formsSent, formStartSessions.size)) : null,
      avgDuration,
      durationSamples: timed.length,
      social: social.length,
      socialCounts,
    },
    series,
    outcomes,
    rows: { visitors, bots: botRows, leads: leadRows, formStarts: formStartRows, social },
  };
}

/* ------------------------------------------------------------------ */
/* Presentation shared by the dashboard and the report                 */
/* ------------------------------------------------------------------ */

export function fmtDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export interface MetricTile {
  key: "visitors" | "bots" | "avgTime" | "bounces" | "leads" | "formStarts";
  label: string;
  value: string;
  sub: string;
  help: string;
}

function leadMix(t: SiteMetrics["totals"]): string {
  const parts = (Object.keys(t.leadsByKind) as LeadKind[])
    .filter((k) => t.leadsByKind[k] > 0)
    .map((k) => `${t.leadsByKind[k]} ${LEAD_KIND_LABEL[k].toLowerCase()}${t.leadsByKind[k] === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "none yet";
}

/** The headline tiles, worded once. The dashboard and the PDF both render this list. */
export function metricTiles(m: SiteMetrics): MetricTile[] {
  const t = m.totals;
  return [
    { key: "visitors", label: "Visitors", value: t.visitors.toLocaleString("en-US"), sub: "bots excluded", help: METRIC_HELP.visitors },
    {
      key: "bots",
      label: "Bots filtered out",
      value: t.bots.toLocaleString("en-US"),
      sub: t.botsLikely ? `${t.botsLikely} caught by behaviour` : "not counted anywhere",
      help: METRIC_HELP.bots,
    },
    { key: "avgTime", label: "Avg. time on site", value: fmtDuration(t.avgDuration), sub: "per visit, capped at 30 min", help: METRIC_HELP.avgTime },
    { key: "bounces", label: "Bounces", value: `${t.bounces.toLocaleString("en-US")} (${Math.round(t.bounceRate)}%)`, sub: "one page, no action", help: METRIC_HELP.bounces },
    {
      key: "leads",
      label: "Lead follow-through",
      value: `${t.leads.toLocaleString("en-US")} (${Math.round(t.leadRate)}%)`,
      sub: leadMix(t),
      help: METRIC_HELP.leads,
    },
    {
      key: "formStarts",
      label: "Forms started",
      value: t.formStarts.toLocaleString("en-US"),
      sub: t.formCompletion === null ? "none started" : `${t.formsSent} sent (${Math.round(t.formCompletion)}%)`,
      help: METRIC_HELP.formStarts,
    },
  ];
}
