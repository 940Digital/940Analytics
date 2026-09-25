import { createClient } from "@/lib/supabase/server";
import { buildFrameHtml } from "@/lib/review/snapshot";

export const dynamic = "force-dynamic";

/**
 * Serves one snapshot page, same-origin, so the reviewer's parent window can
 * talk to it directly. Row level security does the access check: a reader
 * without a grant on this review simply gets no row back.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string; pageId: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in to view this review.", { status: 401 });

  const { data: page } = await supabase
    .from("rv_pages")
    .select("html, review_id")
    .eq("id", params.pageId)
    .eq("review_id", params.id)
    .maybeSingle();

  if (!page) return new Response("Not found.", { status: 404 });

  return new Response(buildFrameHtml(page.html, `/review/${params.id}/asset/`), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      /* a snapshot is immutable for its lifetime, but it is also private */
      "Cache-Control": "private, no-store",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
