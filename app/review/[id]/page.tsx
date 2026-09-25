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

  const pageList = pages ?? [];
  if (pageList.length === 0) {
    return (
      <main className="min-h-screen bg-sand px-6 py-16 font-body text-charcoal-text">
        <div className="mx-auto max-w-lg text-center">
          <Logo />
          <h1 className="mt-8 font-display text-2xl">Nothing to review yet</h1>
          <p className="mt-3 text-grey-muted">
            This review has been created but no pages have been pushed into it.
          </p>
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

  const { data: account } = await supabase
    .from("accounts")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const isMaster = account?.role === "master";

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
      isMaster={isMaster}
    />
  );
}
