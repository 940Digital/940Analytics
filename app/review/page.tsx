import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { InviteRow } from "./InviteRow";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/review");

  const { data: account } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  /* Clients have no business on the index. Their way in is the button on
     their own dashboard, or the invite link they were sent. */
  if (account?.role !== "master") redirect("/dashboard");

  const { data: reviews } = await supabase
    .from("rv_reviews")
    .select("id, title, note, status, website_id, created_at")
    .order("created_at", { ascending: false });

  const { data: websites } = await supabase
    .from("crm_websites")
    .select("id, name, domain")
    .order("name");

  const ids = (reviews ?? []).map((r) => r.id);

  const { data: pages } = await supabase
    .from("rv_pages")
    .select("id, review_id")
    .in("review_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const { data: threads } = await supabase
    .from("rv_threads")
    .select("id, status, page_id");

  const { data: invites } = await supabase
    .from("rv_invites")
    .select("token, review_id, email, revoked, claimed_at, created_at")
    .order("created_at", { ascending: false });

  const pageToReview = new Map((pages ?? []).map((p) => [p.id, p.review_id]));

  function counts(reviewId: string) {
    const pageCount = (pages ?? []).filter((p) => p.review_id === reviewId).length;
    const mine = (threads ?? []).filter(
      (t) => pageToReview.get(t.page_id) === reviewId
    );
    return {
      pages: pageCount,
      notes: mine.length,
      open: mine.filter((t) => t.status === "open").length,
    };
  }

  return (
    <main className="min-h-screen bg-sand px-6 py-10 font-body text-charcoal-text">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <Link href="/dashboard">
            <Logo dark size={22} />
          </Link>
          <Link href="/dashboard" className="text-sm text-blue-accent hover:underline">
            Dashboard
          </Link>
        </div>

        <h1 className="mt-8 font-display text-2xl font-bold">Client reviews</h1>
        <p className="mt-2 max-w-xl text-sm text-grey-muted">
          A frozen copy of a site with the client&rsquo;s notes on it. Push pages in with{" "}
          <code className="rounded bg-charcoal-text/10 px-1 py-0.5 font-mono text-xs">
            node scripts/push-site.mjs
          </code>
          , then send the invite link.
        </p>

        {(reviews ?? []).length === 0 ? (
          <p className="mt-10 rounded-lg border border-dashed border-charcoal-text/20 px-5 py-10 text-center text-sm text-grey-muted">
            No reviews yet. Run the push script with{" "}
            <span className="font-mono">--title</span> to make the first one.
          </p>
        ) : null}

        <div className="mt-8 space-y-4">
          {(reviews ?? []).map((r) => {
            const c = counts(r.id);
            const site = (websites ?? []).find((w) => w.id === r.website_id);
            return (
              <section
                key={r.id}
                className="rounded-lg border border-charcoal-text/10 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-bold">{r.title}</h2>
                    <p className="mt-1 text-xs text-grey-muted">
                      {c.pages} page{c.pages === 1 ? "" : "s"} &middot; {c.notes} note
                      {c.notes === 1 ? "" : "s"}
                      {c.open > 0 ? (
                        <span className="ml-1 font-semibold text-blue-accent">
                          ({c.open} open)
                        </span>
                      ) : null}
                      {site ? (
                        <>
                          {" "}
                          &middot; CRM:{" "}
                          <span className="font-medium text-charcoal-text">{site.name}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <Link
                    href={`/review/${r.id}`}
                    className="shrink-0 rounded-md bg-blue-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-hover"
                  >
                    Open
                  </Link>
                </div>

                <InviteRow
                  reviewId={r.id}
                  websiteId={r.website_id}
                  websites={websites ?? []}
                  invites={(invites ?? []).filter((i) => i.review_id === r.id)}
                />
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
