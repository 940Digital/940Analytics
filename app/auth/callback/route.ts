import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Reached after a user clicks the confirmation link in their signup email.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

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
        // 23505 = unique violation, meaning the site already got provisioned once — fine to ignore.
        if (!siteError || siteError.code === "23505") {
          return NextResponse.redirect(`${origin}/dashboard`);
        }
      }
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("That confirmation link is invalid or expired.")}`);
}
