"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchSessionBreakdown } from "@/lib/analytics/query";
import { AnalyticsRangeKey, SessionBreakdownDay } from "@/lib/analytics/types";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { BreakdownChart } from "./BreakdownChart";
import { OutcomePieChart } from "./OutcomePieChart";

/* Reads as a sentence after "Session outcomes, ", which the range buttons set. */
const RANGE_BLURB: Record<AnalyticsRangeKey, string> = {
  week: "last 7 days",
  month: "last 30 days",
  year: "last 12 months",
  "2y": "last 24 months",
};

/**
 * The same analytics the CRM shows on an account, shown to the client whose
 * site it is. It used to be three counters and a line of sessions here against
 * five stat cards, outcome charts and a details table there, which meant the
 * numbers we quoted a client and the numbers they could see were not the same
 * numbers. One range drives all of it.
 */
export function SiteAnalytics({ siteId }: { siteId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [range, setRange] = useState<AnalyticsRangeKey>("month");
  const [breakdown, setBreakdown] = useState<SessionBreakdownDay[]>([]);

  useEffect(() => {
    let live = true;
    fetchSessionBreakdown(supabase, siteId, range)
      .then((series) => {
        if (live) setBreakdown(series);
      })
      .catch(() => {
        if (live) setBreakdown([]);
      });
    return () => {
      live = false;
    };
  }, [supabase, siteId, range]);

  return (
    <section className="rounded-lg border border-charcoal-text/10 bg-white p-5">
      <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-wide text-grey-muted">
        Visitors
      </h2>

      <AnalyticsPanel siteId={siteId} range={range} onRangeChange={setRange} />

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-medium text-grey-muted">
          {`Session outcomes, ${RANGE_BLURB[range]}`}
        </h3>
        <BreakdownChart data={breakdown} />
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-medium text-grey-muted">
          {`Share of outcomes, ${RANGE_BLURB[range]}`}
        </h3>
        <OutcomePieChart data={breakdown} />
      </div>
    </section>
  );
}
