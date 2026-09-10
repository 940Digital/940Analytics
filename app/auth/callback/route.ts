import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Reached after a user clicks either the signup confirmation link or a
// password-reset link. Both have to use the exact same redirectTo
// (https://.../auth/callback, no query string, no extra path) because only
// that literal URL is in this Supabase project's Redirect URLs allowlist -
// anything else (even the same URL with ?type=recovery appended) silently
// falls back to the shared project's Site URL (940digital.com), the same
// bug that originally broke signup confirmation. So instead of a query
// param, recovery vs. signup is told apart by decoding the session's own
// JWT: Supabase tags a password-recovery session with amr: [{method:
// "recovery", ...}], which survives fine since it's part of the token
// itself, not the URL.
function isRecoverySession(accessToken: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
    const amr = payload.amr as { method?: string }[] | undefined;
    return Boolean(amr?.some((entry) => entry.method === "recovery"));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user && data.session) {
      if (isRecoverySession(data.session.access_token)) {
        // Recovery just needs a live session to set a new password against -
        // no site to provision, nothing else to do here.
        return NextResponse.redirect(`${origin}/auth/update-password`);
      }

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

  // Can't tell recovery from signup here - the code exchange itself failed,
  // so there's no session to inspect. Land on login either way; the
  // forgot-password link is one click away from there.
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("That link is invalid or expired.")}`
  );
}
