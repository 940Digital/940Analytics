import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Reached after a user clicks either the signup confirmation link or a
// password-reset link (requestPasswordReset() tags its redirectTo with
// ?type=recovery so this route knows which one it's looking at).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const isRecovery = searchParams.get("type") === "recovery";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user && isRecovery) {
      // Recovery just needs a live session to set a new password against -
      // no site to provision, nothing else to do here.
      return NextResponse.redirect(`${origin}/auth/update-password`);
    }

    if (!error && data.user) {
      const meta = data.user.user_metadata || {};
      const domain = meta.pending_domain as string | undefined;
      const businessName = (meta.display_name as string | undefined) || data.user.email;

      if (domain) {
        const { error: siteError } = await supabase.from("sites").insert({
          account_id: data.user.id,
          name: businessName,
          domain,
        });
        // 23505 = unique violation, meaning the site already got provisioned once (fine to ignore).
        if (!siteError || siteError.code === "23505") {
          return NextResponse.redirect(`${origin}/dashboard`);
        }
      }
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  const message = isRecovery
    ? "That reset link is invalid or expired. Request a new one."
    : "That confirmation link is invalid or expired.";
  const target = isRecovery ? "/forgot-password" : "/login";
  return NextResponse.redirect(`${origin}${target}?error=${encodeURIComponent(message)}`);
}
