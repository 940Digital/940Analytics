import { createBrowserClient } from "@supabase/ssr";
import { sharedCookieDomain } from "@/lib/sharedLogin";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { domain: sharedCookieDomain(typeof window === "undefined" ? null : window.location.hostname) } }
  );
}
