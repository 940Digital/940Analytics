"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

/**
 * Takes the session from the CRM so a review opened there arrives signed in as
 * the agency rather than as whoever this browser last used here.
 *
 * The two apps are separate sites, so they cannot share a cookie. They do share
 * one Supabase project, which means a session minted in the CRM is valid here,
 * and the CRM can hand it over directly.
 *
 * It goes by postMessage rather than through the URL: a refresh token in a
 * query string ends up in history, in logs and in referrer headers. Both sides
 * name the other's exact origin, so the CRM will only ever send to this app and
 * this page will only ever accept from the CRM.
 *
 * If nothing answers, this is not a dead end. After a moment it simply goes on
 * to the review with whatever session the browser already had.
 */
/* Vercel serves the CRM on several hostnames at once, so pinning one meant
   the handoff quietly failed whenever it was opened from any of the others. */
const CRM_ORIGINS = (
  process.env.NEXT_PUBLIC_CRM_ORIGIN ??
  [
    "https://94-d-crm-beta.vercel.app",
    "https://94-d-crm-940-digital.vercel.app",
    "https://94-d-crm-git-main-940-digital.vercel.app",
    "http://localhost:3400",
  ].join(",")
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function HandoffInner() {
  const router = useRouter();
  const params = useSearchParams();
  const done = useRef(false);
  const [state, setState] = useState("Signing you in…");

  const to = params.get("to") || "";

  useEffect(() => {
    const target = to ? `/review/${to}` : "/dashboard";

    const go = () => {
      if (done.current) return;
      done.current = true;
      router.replace(target);
    };

    const onMessage = async (event: MessageEvent) => {
      if (!CRM_ORIGINS.includes(event.origin) || done.current) return;
      const data = event.data as {
        type?: string;
        access_token?: string;
        refresh_token?: string;
      };
      if (data?.type !== "ag:session" || !data.access_token || !data.refresh_token) return;

      try {
        const supabase = createClient();
        const { error } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (error) setState("That session could not be used. Opening anyway…");
      } catch {
        setState("Could not carry the session over. Opening anyway…");
      }
      go();
    };

    window.addEventListener("message", onMessage);

    /* Keep asking rather than announcing once. A single ping races the
       opener's listener and loses often enough to matter. The ping carries
       nothing, so it can go to any origin; the reply carrying the session is
       still only accepted from the CRM. */
    let asks = 0;
    const ask = () => {
      asks += 1;
      try {
        window.opener?.postMessage({ type: "ag:handoff-ready" }, "*");
      } catch {
        /* no opener, or not reachable: the timer below takes over */
      }
      if (asks > 12 || done.current) window.clearInterval(ping);
    };

    const ping = window.setInterval(ask, 200);
    ask();

    if (!window.opener) setState("Opening\u2026");

    const timer = window.setTimeout(() => {
      if (window.opener) setState("Could not carry your sign-in over. Opening anyway\u2026");
      go();
    }, 3000);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(ping);
      window.clearTimeout(timer);
    };
  }, [router, to]);

  return <Screen note={state} />;
}

function Screen({ note }: { note: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-charcoal-dark font-body text-sand">
      <Logo />
      <p className="text-sm text-grey-light">{note}</p>
    </main>
  );
}

/* useSearchParams needs a boundary, and the fallback is the same screen. */
export default function Handoff() {
  return (
    <Suspense fallback={<Screen note="Signing you in\u2026" />}>
      <HandoffInner />
    </Suspense>
  );
}
