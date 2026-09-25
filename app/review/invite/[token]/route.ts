import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The link Owen sends out. Signed out, it sends you to log in and comes
 * straight back here afterwards. Signed in, it redeems the token for a
 * standing grant on the review and drops you on the page itself, so the
 * reviewer never has to be told where to click next.
 */
export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const url = new URL(request.url);
  const here = `/review/invite/${params.token}`;
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(here)}`, url.origin)
    );
  }

  const { data: reviewId, error } = await supabase.rpc("rv_claim_invite", {
    p_token: params.token,
  });

  if (error || !reviewId) {
    return NextResponse.redirect(
      new URL(
        `/dashboard?error=${encodeURIComponent(
          "That review link is no longer valid. Ask for a fresh one."
        )}`,
        url.origin
      )
    );
  }

  return NextResponse.redirect(new URL(`/review/${reviewId}`, url.origin));
}
