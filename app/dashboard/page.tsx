import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { logOut, createSite } from "@/app/auth/actions";
import { SnippetBox } from "@/components/SnippetBox";
import { ProjectProgress } from "@/components/ProjectProgress";
import { SessionChart } from "@/components/SessionChart";
import { StatTile } from "@/components/StatTile";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { error?: string; passwordUpdated?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: sites } = await supabase
    .from("sites")
    .select("id, name, domain, created_at")
    .eq("account_id", user.id)
    .order("created_at", { ascending: true });

  const site = sites?.[0] ?? null;

  // Row level security already limits this to reviews the viewer was granted,
  // so there is no account_id filter to write here. A client sees theirs; the
  // master account sees every one.
  const { data: reviews } = await supabase
    .from("rv_reviews")
    .select("id, title, status, created_at")
    .order("created_at", { ascending: false });

  let sessions: { id: string; session_start: string; is_bot: boolean; is_bounce: boolean | null; referrer: string | null }[] = [];
  // Matches SessionChart's own default range (30 days, day buckets) exactly,
  // so its first client render can reuse this instead of opening on a
  // spinner and refetching data the page already has.
  let chartInitialSessions: { id: string; session_start: string; is_bot: boolean; is_bounce: boolean | null; referrer: string | null }[] = [];

  if (site) {
    const { data } = await supabase
      .from("sessions")
      .select("id, session_start, is_bot, is_bounce, referrer")
      .eq("site_id", site.id)
      .order("session_start", { ascending: false })
      .limit(25);
    sessions = data ?? [];

    const chartSince = new Date();
    chartSince.setDate(chartSince.getDate() - 29);
    chartSince.setHours(0, 0, 0, 0);
    const chartAll: typeof chartInitialSessions = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: page, error } = await supabase
        .from("sessions")
        .select("id, session_start, is_bot, is_bounce, referrer")
        .eq("site_id", site.id)
        .gte("session_start", chartSince.toISOString())
        .order("session_start", { ascending: true })
        .range(offset, offset + 999);
      if (error || !page) break;
      chartAll.push(...page);
      if (page.length < 1000) break;
    }
    chartInitialSessions = chartAll;
  }

  let projectSteps: { id: string; title: string; status: string; completed_at: string | null }[] = [];
  let planTier: string | null = null;
  let show = { progress: false, website: false, analytics: false };

  if (site) {
    const { data: website } = await supabase
      .from("crm_websites")
      .select("id")
      .eq("site_id", site.id)
      .maybeSingle();

    if (website) {
      const { data: project } = await supabase
        .from("crm_projects")
        .select("id, plan_tier, show_progress, show_website, show_analytics")
        .eq("website_id", website.id)
        .eq("is_cancelled", false)
        .maybeSingle();

      if (project) {
        const { data: steps } = await supabase
          .from("crm_project_steps")
          .select("id, title, status, completed_at")
          .eq("project_id", project.id)
          .order("position", { ascending: true });
        projectSteps = steps ?? [];
        const p = project as {
          plan_tier?: string;
          show_progress?: boolean;
          show_website?: boolean;
          show_analytics?: boolean;
        };
        planTier = p.plan_tier ?? null;
        show = {
          progress: !!p.show_progress,
          website: !!p.show_website,
          analytics: !!p.show_analytics,
        };
      }
    }
  }

  // Analytics-only customers install the snippet on their own site, so they
  // need it in front of them. On any built plan we install it ourselves, and
  // handing that client a script tag with paste instructions is asking them to
  // do the job they are paying us for. No plan yet means a self-serve signup.
  const selfInstall = planTier === null || planTier === "analytics";

  // A self-serve signup has no CRM project behind it and nobody to decide what
  // they are shown, so they get everything they signed up for.
  if (planTier === null) show = { progress: false, website: true, analytics: true };

  const showWebsite = show.website && !!reviews && reviews.length > 0;
  const showProgress = show.progress && projectSteps.length > 0;
  const showAnalytics = show.analytics && !!site;
  const modules = [showWebsite, showProgress, showAnalytics].filter(Boolean).length;

  // With one module a two-column grid leaves a hole where the other should be,
  // so the layout only splits once there is something to put on both sides.
  const sideColumn = showProgress && (showWebsite || showAnalytics);

  const realVisits = sessions.filter((v) => !v.is_bot).length;
  const botHits = sessions.filter((v) => v.is_bot).length;
  const hasTraffic = sessions.length > 0;

  return (
    <main className="min-h-screen bg-sand">
      <header className="border-b border-charcoal-text/10 bg-white/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Logo dark size={20} />
          <form action={logOut}>
            <button className="text-sm text-grey-muted hover:text-charcoal-text">Log out</button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {searchParams.error && (
          <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </p>
        )}
        {searchParams.passwordUpdated && (
          <p className="mb-6 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            Password updated.
          </p>
        )}

        {!site && (!reviews || reviews.length === 0) ? (
          <OnboardingCard />
        ) : (
          <>
            {site ? (
              <div className="mb-6">
                <h1 className="font-display text-2xl font-bold text-charcoal-text">
                  {site.name}
                </h1>
                <p className="text-sm text-grey-muted">{site.domain}</p>
              </div>
            ) : null}

            {modules === 0 ? (
              <section className="rounded-lg border border-charcoal-text/10 bg-white px-6 py-12 text-center">
                <h2 className="font-display text-lg font-bold text-charcoal-text">
                  Nothing to show just yet
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-grey-muted">
                  We are still working behind the scenes. This is where your site and
                  your numbers will appear.
                </p>
              </section>
            ) : (
              <div className={sideColumn ? "grid gap-6 lg:grid-cols-3" : "space-y-6"}>
                <div className={sideColumn ? "space-y-6 lg:col-span-2" : "space-y-6"}>
                  {showWebsite ? (
                    <section className="rounded-lg border border-blue-accent/30 bg-blue-accent/[0.06] p-5">
                      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-grey-muted">
                        Your website
                      </h2>
                      <p className="mt-2 max-w-prose text-sm text-grey-muted">
                        Read the pages as they stand and mark up anything you want changed.
                        Click any words to leave a note or rewrite them.
                      </p>
                      <div className="mt-4 space-y-2">
                        {reviews!.map((r) => (
                          <a
                            key={r.id}
                            href={`/review/${r.id}`}
                            className="flex items-center justify-between gap-3 rounded-md bg-blue-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-hover"
                          >
                            <span className="truncate">
                              {reviews!.length === 1 ? "View my website" : r.title}
                            </span>
                            <span aria-hidden className="shrink-0">&rarr;</span>
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {showAnalytics && hasTraffic ? (
                    <>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        <StatTile label="Sessions" value={sessions.length} />
                        <StatTile label="Real visitors" value={realVisits} tone="good" />
                        <StatTile label="Bots filtered" value={botHits} tone="muted" />
                      </div>
                      <SessionChart siteId={site!.id} initialSessions={chartInitialSessions} />
                    </>
                  ) : null}

                  {showAnalytics && !hasTraffic ? (
                    <section className="rounded-lg border border-charcoal-text/10 bg-white p-5">
                      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-grey-muted">
                        Visitors
                      </h2>
                      <p className="mt-2 text-sm text-grey-muted">
                        Tracking is set up on {site!.domain}. Numbers appear here once the
                        site is live and people start arriving.
                      </p>
                    </section>
                  ) : null}

                  {/* Progress rides in the main column when there is no side */}
                  {showProgress && !sideColumn ? (
                    <ProjectProgress steps={projectSteps} />
                  ) : null}

                  {selfInstall && site ? (
                    <section className="rounded-lg border border-charcoal-text/10 bg-white p-5">
                      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-grey-muted">
                        Tracking snippet
                      </h2>
                      <p className="mt-2 text-xs text-grey-muted">
                        Paste this before the closing <code>&lt;/body&gt;</code> on every
                        page you want counted.
                      </p>
                      <SnippetBox siteId={site.id} />
                    </section>
                  ) : null}
                </div>

                {sideColumn ? (
                  <div className="h-full space-y-6">
                    <ProjectProgress steps={projectSteps} />
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function OnboardingCard() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-2xl font-bold text-charcoal-text">
        Let's set up your site
      </h1>
      <p className="mt-2 text-sm text-grey-muted">
        One site, one snippet. You can add more later.
      </p>
      <form action={createSite} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-charcoal-text">
            Business name
          </span>
          <input
            name="businessName"
            required
            className="w-full rounded-md border border-charcoal-text/15 bg-white px-3 py-2 text-sm focus:border-blue-accent focus:outline-none focus:ring-1 focus:ring-blue-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-charcoal-text">
            Website domain
          </span>
          <input
            name="domain"
            placeholder="acmeroofing.com"
            required
            className="w-full rounded-md border border-charcoal-text/15 bg-white px-3 py-2 text-sm focus:border-blue-accent focus:outline-none focus:ring-1 focus:ring-blue-accent"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-blue-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-hover"
        >
          Create site
        </button>
      </form>
    </div>
  );
}
