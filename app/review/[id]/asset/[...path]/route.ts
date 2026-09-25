import { createClient } from "@/lib/supabase/server";
import { contentTypeFor, isTextAsset } from "@/lib/review/snapshot";

export const dynamic = "force-dynamic";

/**
 * Stylesheets, images and fonts belonging to a snapshot. Stored on the review
 * rather than fetched from the live site, because the whole point is to review
 * a site before it is live.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string; path: string[] } }
) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in first.", { status: 401 });

  const path = params.path.join("/");

  const { data: asset } = await supabase
    .from("rv_assets")
    .select("data, content_type, path")
    .eq("review_id", params.id)
    .eq("path", path)
    .maybeSingle();

  if (!asset) return new Response("Not found.", { status: 404 });

  const body = isTextAsset(asset.path)
    ? asset.data
    : Buffer.from(asset.data, "base64");

  return new Response(body, {
    headers: {
      "Content-Type": asset.content_type || contentTypeFor(asset.path),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
