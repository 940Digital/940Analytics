"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvite, revokeInvite, linkWebsite } from "./actions";

type Invite = {
  token: string;
  email: string | null;
  revoked: boolean;
  claimed_at: string | null;
};

export function InviteRow({
  reviewId,
  websiteId,
  websites,
  invites,
}: {
  reviewId: string;
  websiteId: string | null;
  websites: { id: string; name: string; domain: string | null }[];
  invites: Invite[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  function linkFor(token: string) {
    return `${window.location.origin}/review/invite/${token}`;
  }

  return (
    <div className="mt-4 border-t border-charcoal-text/10 pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-grey-muted">
            Linked CRM website
          </span>
          <select
            defaultValue={websiteId || ""}
            onChange={(e) => {
              const fd = new FormData();
              fd.set("reviewId", reviewId);
              fd.set("websiteId", e.target.value);
              start(async () => {
                await linkWebsite(fd);
                router.refresh();
              });
            }}
            className="rounded-md border border-charcoal-text/15 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Not linked</option>
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.domain ? ` (${w.domain})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-grey-muted">
            Invite (email optional, for your own records)
          </span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="lindsay@example.com"
            className="rounded-md border border-charcoal-text/15 bg-white px-2 py-1.5 text-sm"
          />
        </label>

        <button
          onClick={() => {
            const fd = new FormData();
            fd.set("reviewId", reviewId);
            fd.set("email", email);
            start(async () => {
              await createInvite(fd);
              setEmail("");
              router.refresh();
            });
          }}
          disabled={pending}
          className="rounded-md border border-blue-accent px-3 py-1.5 text-sm font-semibold text-blue-accent transition hover:bg-blue-accent hover:text-white disabled:opacity-50"
        >
          New link
        </button>
      </div>

      {invites.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {invites.map((i) => (
            <li
              key={i.token}
              className="flex flex-wrap items-center gap-2 text-xs text-grey-muted"
            >
              <code
                className={`truncate rounded bg-charcoal-text/5 px-2 py-1 font-mono ${
                  i.revoked ? "line-through opacity-50" : ""
                }`}
              >
                /review/invite/{i.token.slice(0, 12)}&hellip;
              </code>
              {i.email ? <span>{i.email}</span> : null}
              {i.claimed_at ? (
                <span className="rounded bg-emerald-600/10 px-1.5 py-0.5 text-emerald-700">
                  opened
                </span>
              ) : null}
              {!i.revoked ? (
                <>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(linkFor(i.token));
                      setCopied(i.token);
                      window.setTimeout(() => setCopied(null), 1500);
                    }}
                    className="text-blue-accent hover:underline"
                  >
                    {copied === i.token ? "Copied" : "Copy link"}
                  </button>
                  <button
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("token", i.token);
                      start(async () => {
                        await revokeInvite(fd);
                        router.refresh();
                      });
                    }}
                    className="text-grey-muted hover:underline"
                  >
                    Revoke
                  </button>
                </>
              ) : (
                <span>revoked</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
