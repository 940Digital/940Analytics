import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { ReviewClient, type Thread } from "./ReviewClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/review/${params.id}`)}`);

  /* One select. If the reader has no grant, row level security returns
     nothing and this is a 404 to them, which is the right answer. */
  const { data: review } = await supabase
    .from("rv_reviews")
    .select("id, title, note, status, website_id, site_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!review) notFound();

  const { data: pages } = await supabase
    .from("rv_pages")
    .select("id, path, title, sort")
    .eq("review_id", params.id)
    .order("sort", { ascending: true });

  const { data: account } = await supabase
    .from("accounts")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const isMaster = account?.role === "master";

  const pageList = pages ?? [];
  if (pageList.length === 0) {
    /* Two different people hit this, and telling a client that "no pages have
       been pushed" tells them nothing they can act on. */
    return (
      <main className="min-h-screen bg-sand px-6 py-16 font-body text-charcoal-text">
        <div className="mx-auto max-w-lg text-center">
          <Link href="/dashboard">
            <Logo dark size={22} />
          </Link>
          <h1 className="mt-8 font-display text-2xl font-bold">
            {isMaster ? "This review is empty" : "Not quite ready"}
          </h1>
          <p className="mt-3 text-grey-muted">
            {isMaster
              ? "Nothing has been pushed into this one yet. Load it from the CRM."
              : "Your site is still being prepared for review. You will hear from us as soon as there is something to read."}
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-md bg-blue-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-hover"
          >
            Back to my dashboard
          </Link>
        </div>
      </main>
    );
  }

  const active =
    pageList.find((p) => p.id === searchParams.page) ?? pageList[0];

  const { data: threads } = await supabase
    .from("rv_threads")
    .select(
      "id, page_id, anchor, anchor_label, original_text, suggested_text, status, created_by, author_name, created_at, rv_messages(id, body, author_name, created_by, created_at)"
    )
    .in(
      "page_id",
      pageList.map((p) => p.id)
    )
    .order("created_at", { ascending: true });

  return (
    <ReviewClient
      reviewId={review.id}
      title={review.title}
      note={review.note}
      status={review.status}
      pages={pageList}
      activePageId={active.id}
      threads={(threads ?? []) as unknown as Thread[]}
      userId={user.id}
      isAgency={isMaster}
    />
  );
}
