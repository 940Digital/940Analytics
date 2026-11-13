import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeSiteMetrics, metricTiles, rangeBuckets, type MetricEvent, type MetricSession } from "../siteMetrics";

/*
 * Guards against the dashboard and the PDF report drifting apart again.
 *
 * 1. Golden figures: a fixed set of rows must always give these exact numbers.
 * 2. Same file in both apps: lib/analytics/siteMetrics.ts here and
 *    lib/siteMetrics.ts in 94D_CRM must hash the same. The CRM's copy of this
 *    test also checks that its PDF report prints these exact tiles. If you
 *    change it, copy it to the other repo and update SITE_METRICS_SHA256 in
 *    both tests.
 */
const SITE_METRICS_SHA256 = "c4ec1f9337dc62d42d8e45a21666b4bbd039b69d11a324077d26c986988e20e4";

const NOW = new Date("2026-11-13T18:00:00Z");
const at = (daysAgo: number, time = "15:00:00") => {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return `${d.toISOString().slice(0, 10)}T${time}.000Z`;
};

let minute = 0;
const person = (id: string, o: Partial<MetricSession>): MetricSession => ({
  id,
  session_start: at(3, `14:${String(minute++).padStart(2, "0")}:00`),
  duration_seconds: 30,
  is_bounce: false,
  is_bot: false,
  user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  referrer: null,
  channel: "Direct",
  landing_page: "/",
  city: "Denton",
  region: "TX",
  ...o,
});

const SESSIONS: MetricSession[] = [
  person("s1", { is_bounce: true, duration_seconds: 5 }),
  person("s2", { duration_seconds: 95, landing_page: "/contact" }),
  person("s3", { duration_seconds: 60, landing_page: "/contact" }),
  person("s4", { duration_seconds: 40 }),
  person("s5", { duration_seconds: 4000 }), // a tab left open: counts as 30 minutes
  person("s6", { is_bounce: true, duration_seconds: 2, city: "Prineville", region: "OR" }), // data centre, did nothing
  person("s7", { is_bounce: true, duration_seconds: 0, session_start: "2026-11-12T16:00:27.120Z", channel: "Social" }),
  person("s8", { is_bounce: true, duration_seconds: 0, session_start: "2026-11-12T16:00:27.840Z", channel: "Social" }),
  person("s9", { duration_seconds: 20, city: "Ashburn", region: "VA" }), // data centre town, but sent a form: a person
  person("s10", { is_bounce: true, duration_seconds: 1, user_agent: "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)" }),
  person("s11", { is_bounce: true, duration_seconds: null }),
  // Seen on Roofing Reformation: Meta's preview renderer holds /contact ~31 s and fires form_start.
  person("s12", { is_bounce: true, duration_seconds: 31, city: "Gallatin", region: "TN", channel: "Social", landing_page: "/contact" }),
  person("s13", { duration_seconds: 99, user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/5.1231.2 Chrome/156.0.8078.75 Safari/537.36" }),
  person("s14", { is_bounce: true, duration_seconds: 120, city: "Ashburn", region: "VA", channel: "Campaign" }), // stayed two minutes: a person
  person("b1", { is_bot: true, duration_seconds: 12, user_agent: "Mozilla/5.0 HeadlessChrome/131.0" }), // a scripted form test
  person("old", { session_start: at(45) }), // outside the window
];

const ev = (session_id: string | null, event_type: string, event_target: string | null, created_at = at(3, "15:00:10")): MetricEvent => ({
  session_id,
  event_type,
  event_target,
  created_at,
});

const EVENTS: MetricEvent[] = [
  ev("s2", "form_start", "inspection-request"),
  ev("s2", "lead_submit", "inspection-request", at(3, "15:01:00")),
  ev("s3", "form_start", "inspection-request"),
  ev("s4", "lead_submit", "sms_click"),
  ev("s4", "lead_submit", "phone_click"),
  ev("s4", "lead_submit", "phone_click", at(3, "15:00:20")), // same visitor tapping Call twice
  ev("s9", "lead_submit", "inspection-request"), // started and sent with no focus event (autofill)
  ev("b1", "form_start", "inspection-request"),
  ev("b1", "lead_submit", "inspection-request"),
  ev("gone", "lead_submit", "phone_click"), // its session row never arrived
  ev("s5", "social_click", "facebook"),
  ev("s12", "form_start", "inspection-request"),
];

const metrics = () => computeSiteMetrics(SESSIONS, EVENTS, rangeBuckets("month", NOW));

describe("site metrics", () => {
  it("gives the golden figures for the fixture", () => {
    const t = metrics().totals;
    expect(t.visitors).toBe(8);
    expect(t.bots).toBe(7);
    expect(t.botsFlagged).toBe(1);
    expect(t.botsLikely).toBe(6);
    expect(t.bounces).toBe(3);
    expect(t.leads).toBe(3);
    expect(t.leadsByKind).toEqual({ form: 2, call: 1, text: 1, email: 0 });
    expect(t.formStarts).toBe(3);
    expect(t.formsSent).toBe(2);
    expect(Math.round(t.formCompletion!)).toBe(67);
    expect(t.durationSamples).toBe(7);
    expect(Math.round(t.avgDuration)).toBe(306);
    expect(t.social).toBe(1);
  });

  it("explains every bot it removes", () => {
    const reasons = Object.fromEntries(metrics().rows.bots.map((s) => [s.id, s.bot_reason]));
    expect(reasons).toEqual({
      s6: "data center",
      s7: "same-second burst",
      s8: "same-second burst",
      s10: "user agent",
      s12: "data center",
      s13: "user agent",
      b1: "flagged",
    });
  });

  it("never counts a bot's lead or an orphan event", () => {
    const leadSessions = metrics().rows.leads.map((e) => e.session_id);
    expect(leadSessions).not.toContain("b1");
    expect(leadSessions).not.toContain("gone");
  });

  it("splits every visitor into exactly one outcome", () => {
    const m = metrics();
    const sum = m.outcomes.reduce((a, d) => ({ f: a.f + d.followedThrough, b: a.b + d.bounced, o: a.o + d.other }), { f: 0, b: 0, o: 0 });
    expect(sum).toEqual({ f: 3, b: 3, o: 2 });
    expect(sum.f + sum.b + sum.o).toBe(m.totals.visitors);
    expect(m.series.leads.reduce((a, n) => a + n, 0)).toBe(m.totals.leads);
  });

  it("words the tiles once", () => {
    expect(metricTiles(metrics()).map((x) => [x.label, x.value])).toEqual([
      ["Visitors", "8"],
      ["Bots filtered out", "7"],
      ["Avg. time on site", "5:06"],
      ["Bounces", "3 (38%)"],
      ["Lead follow-through", "3 (38%)"],
      ["Forms started", "3"],
    ]);
  });
});

describe("shared file", () => {
  it("matches the copy in 94D_CRM", () => {
    const src = readFileSync(path.join(__dirname, "..", "siteMetrics.ts"));
    expect(createHash("sha256").update(src).digest("hex")).toBe(SITE_METRICS_SHA256);
  });
});
