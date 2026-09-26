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
const CRM_ORIGIN =
  process.env.NEXT_PUBLIC_CRM_ORIGIN ?? "https://94-d-crm-beta.vercel.app";

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
      if (event.origin !== CRM_ORIGIN || done.current) return;
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

    /* ask whoever opened this window for its session */
    try {
      window.opener?.postMessage({ type: "ag:handoff-ready" }, CRM_ORIGIN);
    } catch {
      /* no opener, or not allowed to reach it: fall through to the timer */
    }

    const timer = window.setTimeout(go, 2500);

    return () => {
      window.removeEventListener("message", onMessage);
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
