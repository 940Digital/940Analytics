"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import {
  addThread,
  addMessage,
  setThreadStatus,
  deleteThread,
  deleteMessage,
} from "./actions";

export type Msg = {
  id: string;
  body: string;
  author_name: string | null;
  created_by: string;
  created_at: string;
};

export type Thread = {
  id: string;
  page_id: string;
  anchor: string;
  anchor_label: string | null;
  original_text: string | null;
  suggested_text: string | null;
  status: string;
  created_by: string;
  author_name: string | null;
  created_at: string;
  rv_messages: Msg[];
};

export type PageRow = { id: string; path: string; title: string | null; sort: number };

type Selection = { anchor: string; label: string; text: string; tag: string };

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  accepted: "Accepted",
  declined: "Declined",
  resolved: "Resolved",
};

const STATUS_CLASS: Record<string, string> = {
  open: "bg-blue-accent/15 text-blue-accent",
  accepted: "bg-emerald-600/15 text-emerald-700",
  declined: "bg-grey-muted/20 text-grey-muted",
  resolved: "bg-grey-muted/20 text-grey-muted",
};

export function ReviewClient({
  reviewId,
  title,
  note,
  status,
  pages,
  activePageId,
  threads,
  userId,
  isAgency,
}: {
  reviewId: string;
  title: string;
  note: string | null;
  status: string;
  pages: PageRow[];
  activePageId: string;
  threads: Thread[];
  userId: string;
  isAgency: boolean;
}) {
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [noteText, setNoteText] = useState("");
  const [suggestText, setSuggestText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const pageThreads = useMemo(
    () => threads.filter((t) => t.page_id === activePageId),
    [threads, activePageId]
  );

  /* Badge numbers are per page and follow the order they were written in,
     so a number in the sidebar means the same thing as a number on the page. */
  const numberOf = useMemo(() => {
    const m = new Map<string, number>();
    pageThreads.forEach((t, i) => m.set(t.id, i + 1));
    return m;
  }, [pageThreads]);

  const sendMarks = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      {
        type: "rv:marks",
        marks: pageThreads.map((t) => ({
          id: t.id,
          anchor: t.anchor,
          n: numberOf.get(t.id),
          status: t.status,
        })),
      },
      window.location.origin
    );
  }, [pageThreads, numberOf]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || !e.data) return;
      const d = e.data as Record<string, string>;

      if (d.type === "rv:ready") sendMarks();

      if (d.type === "rv:select") {
        setSelection({ anchor: d.anchor, label: d.label, text: d.text, tag: d.tag });
        setSuggestText(d.text || "");
        setNoteText("");
        setError(null);
        setOpenThread(null);
      }

      if (d.type === "rv:open") {
        setOpenThread(d.id);
        setSelection(null);
        document.getElementById(`thread-${d.id}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }

      if (d.type === "rv:nav") {
        const next = pages.find((p) => p.path.endsWith(d.href));
        if (next) router.push(`/review/${reviewId}?page=${next.id}`);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pages, reviewId, router, sendMarks]);

  useEffect(() => {
    sendMarks();
  }, [sendMarks]);

  function startGeneralNote() {
    setSelection({ anchor: "page", label: "About this page", text: "", tag: "page" });
    setSuggestText("");
    setNoteText("");
    setError(null);
    setOpenThread(null);
  }

  function submitThread() {
    if (!selection) return;
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    fd.set("pageId", activePageId);
    fd.set("anchor", selection.anchor);
    fd.set("anchorLabel", selection.label);
    fd.set("originalText", selection.text);
    fd.set("suggestedText", suggestText);
    fd.set("body", noteText);

    startTransition(async () => {
      const res = await addThread(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSelection(null);
      setNoteText("");
      setSuggestText("");
      setError(null);
      router.refresh();
    });
  }

  function reply(threadId: string, body: string, reset: () => void) {
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    fd.set("threadId", threadId);
    fd.set("body", body);
    startTransition(async () => {
      const res = await addMessage(fd);
      if (!res?.error) {
        reset();
        router.refresh();
      }
    });
  }

  function removeThread(threadId: string) {
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    fd.set("threadId", threadId);
    startTransition(async () => {
      const res = await deleteThread(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpenThread(null);
      router.refresh();
    });
  }

  function removeMessage(messageId: string) {
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    fd.set("messageId", messageId);
    startTransition(async () => {
      await deleteMessage(fd);
      router.refresh();
    });
  }

  function mark(threadId: string, next: string) {
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    fd.set("threadId", threadId);
    fd.set("status", next);
    startTransition(async () => {
      await setThreadStatus(fd);
      router.refresh();
    });
  }

  const accepted = threads.filter((t) => t.status === "accepted" && t.suggested_text);

  return (
    <>
      {/* Marking up a website means seeing it at the width it was designed for,
          side by side with the notes. On a phone that is neither. Rather than
          shipping a cramped version nobody would enjoy, say so plainly. */}
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-charcoal-dark px-8 text-center font-body text-sand lg:hidden">
        <Logo />
        <h1 className="mt-4 font-display text-xl font-bold">Open this on a computer</h1>
        <p className="max-w-xs text-sm leading-relaxed text-grey-light">
          Reviewing your site means seeing it full size next to your notes, which
          needs a bigger screen than this one. The link will be waiting.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 rounded-md border border-white/20 px-4 py-2 text-sm text-sand"
        >
          Back to my dashboard
        </Link>
      </div>

    <div className="hidden h-screen flex-col bg-charcoal-dark font-body text-sand lg:flex">
      {/* ---- header -------------------------------------------------- */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/10 px-5 py-3">
        <Link href="/dashboard" className="shrink-0">
          <Logo />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-sm font-semibold">{title}</h1>
          {note ? <p className="truncate text-xs text-grey-muted">{note}</p> : null}
        </div>
        <nav className="flex flex-wrap items-center gap-1">
          {pages.map((p) => {
            const count = threads.filter((t) => t.page_id === p.id).length;
            const on = p.id === activePageId;
            return (
              <Link
                key={p.id}
                href={`/review/${reviewId}?page=${p.id}`}
                className={`rounded px-2.5 py-1 text-xs transition ${
                  on
                    ? "bg-blue-accent text-white"
                    : "text-grey-light hover:bg-white/10 hover:text-sand"
                }`}
              >
                {p.title || p.path}
                {count > 0 ? (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 text-[10px] ${
                      on ? "bg-white/25" : "bg-white/10"
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---- the mirror ------------------------------------------- */}
        <div className="min-w-0 flex-1 bg-white">
          <iframe
            ref={frame}
            key={activePageId}
            src={`/review/${reviewId}/frame/${activePageId}`}
            className="h-full w-full border-0"
            title="Website preview"
            onLoad={sendMarks}
          />
        </div>

        {/* ---- notes ------------------------------------------------- */}
        <aside className="flex w-[390px] shrink-0 flex-col border-l border-white/10 bg-charcoal-mid">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-grey-light">
              {showAll ? "Every note" : "Notes on this page"}
            </p>
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-blue-accent hover:underline"
            >
              {showAll ? "This page" : `All (${threads.length})`}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!selection ? (
              <div className="border-b border-white/10 px-4 py-3">
                <p className="text-sm leading-relaxed text-grey-muted">
                  Click anything on the page to leave a note or rewrite it. Nothing on
                  the page will take you anywhere, so a button or a link can be
                  commented on like everything else.
                </p>
                <button
                  onClick={startGeneralNote}
                  className="mt-3 w-full rounded border border-white/15 px-3 py-1.5 text-xs font-medium text-grey-light transition hover:bg-white/10 hover:text-sand"
                >
                  Add a note about the whole page
                </button>
              </div>
            ) : null}

            {/* composer */}
            {selection ? (
              <div className="border-b border-white/10 bg-blue-accent/5 px-4 py-3">
                <p className="mb-2 font-mono text-[11px] text-blue-accent">
                  {selection.anchor === "page" ? "About this page" : selection.label}
                </p>

                <label className="mb-1 block text-xs text-grey-light">
                  {selection.anchor === "page" ? "Anything about this page" : "Your note"}
                </label>
                <textarea
                  autoFocus
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  placeholder="What should change, and why?"
                  className="w-full rounded border border-white/15 bg-charcoal-dark px-2.5 py-2 text-sm text-sand outline-none placeholder:text-grey-muted focus:border-blue-accent"
                />

                {selection.text && selection.anchor !== "page" ? (
                  <>
                    <label className="mb-1 mt-3 block text-xs text-grey-light">
                      Rewrite it (optional)
                    </label>
                    <textarea
                      value={suggestText}
                      onChange={(e) => setSuggestText(e.target.value)}
                      rows={4}
                      className="w-full rounded border border-white/15 bg-charcoal-dark px-2.5 py-2 text-sm text-sand outline-none focus:border-blue-accent"
                    />
                    <p className="mt-1 text-[11px] text-grey-muted">
                      Edit the words directly. Leave them as they are if the note says enough.
                    </p>
                  </>
                ) : null}

                {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={submitThread}
                    disabled={pending}
                    className="rounded bg-blue-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-hover disabled:opacity-50"
                  >
                    {pending ? "Sending" : "Send note"}
                  </button>
                  <button
                    onClick={() => {
                      setSelection(null);
                      setError(null);
                    }}
                    className="rounded px-3 py-1.5 text-sm text-grey-light transition hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {(showAll ? threads : pageThreads).map((t) => (
              <ThreadCard
                key={t.id}
                thread={t}
                n={numberOf.get(t.id)}
                userId={userId}
                isAgency={isAgency}
                isOpen={openThread === t.id}
                pending={pending}
                onFocus={() => {
                  setOpenThread(t.id);
                  if (t.page_id !== activePageId) {
                    router.push(`/review/${reviewId}?page=${t.page_id}`);
                    return;
                  }
                  frame.current?.contentWindow?.postMessage(
                    { type: "rv:scrollTo", anchor: t.anchor },
                    window.location.origin
                  );
                }}
                onReply={reply}
                onMark={mark}
                onDelete={removeThread}
                onDeleteMessage={removeMessage}
              />
            ))}
          </div>

          {isAgency && accepted.length > 0 ? (
            <div className="shrink-0 border-t border-white/10 px-4 py-3">
              <button
                onClick={() => {
                  const text = accepted
                    .map(
                      (t) =>
                        `${t.anchor_label || t.anchor}\nOLD: ${t.original_text || ""}\nNEW: ${t.suggested_text}`
                    )
                    .join("\n\n");
                  navigator.clipboard?.writeText(text);
                }}
                className="w-full rounded border border-white/15 px-3 py-2 text-xs text-grey-light transition hover:bg-white/10"
              >
                Copy {accepted.length} accepted rewrite{accepted.length === 1 ? "" : "s"}
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
    </>
  );
}

function ThreadCard({
  thread,
  n,
  userId,
  isAgency,
  isOpen,
  pending,
  onFocus,
  onReply,
  onMark,
  onDelete,
  onDeleteMessage,
}: {
  thread: Thread;
  n?: number;
  userId: string;
  isAgency: boolean;
  isOpen: boolean;
  pending: boolean;
  onFocus: () => void;
  onReply: (id: string, body: string, reset: () => void) => void;
  onMark: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onDeleteMessage: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const mine = thread.created_by === userId;
  const changed =
    thread.suggested_text && thread.suggested_text !== (thread.original_text || "");

  return (
    <div
      id={`thread-${thread.id}`}
      className={`border-b border-white/10 px-4 py-3 transition ${
        isOpen ? "bg-white/[0.04]" : ""
      }`}
    >
      <button onClick={onFocus} className="flex w-full items-start gap-2 text-left">
        <span className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-accent px-1.5 text-[11px] font-bold text-white">
          {n ?? "-"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[11px] text-grey-muted">
            {thread.anchor === "page"
              ? "About this page"
              : thread.anchor_label || `element ${thread.anchor}`}
          </span>
        </span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            STATUS_CLASS[thread.status] || ""
          }`}
        >
          {STATUS_LABEL[thread.status] || thread.status}
        </span>
      </button>

      {changed ? (
        <div className="mt-2 space-y-1 rounded border border-white/10 bg-charcoal-dark p-2">
          <p className="text-[10px] uppercase tracking-wider text-grey-muted">Was</p>
          <p className="text-xs leading-snug text-grey-light line-through decoration-grey-muted/60">
            {thread.original_text}
          </p>
          <p className="pt-1 text-[10px] uppercase tracking-wider text-grey-muted">Suggested</p>
          <p className="text-xs leading-snug text-sand">{thread.suggested_text}</p>
        </div>
      ) : null}

      <div className="mt-2 space-y-2">
        {thread.rv_messages
          ?.slice()
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((m) => (
            <div key={m.id} className="group/msg flex items-start gap-2 text-xs leading-relaxed">
              <span className="min-w-0 flex-1">
                <span
                  className={`font-semibold ${
                    m.created_by === userId ? "text-blue-accent" : "text-grey-light"
                  }`}
                >
                  {m.author_name || "Someone"}
                </span>
                <span className="ml-2 whitespace-pre-wrap text-grey-light">{m.body}</span>
              </span>
              {m.created_by === userId || isAgency ? (
                <button
                  onClick={() => onDeleteMessage(m.id)}
                  disabled={pending}
                  aria-label="Delete this reply"
                  className="shrink-0 text-grey-muted opacity-0 transition hover:text-red-400 focus:opacity-100 group-hover/msg:opacity-100 disabled:opacity-30"
                >
                  &times;
                </button>
              ) : null}
            </div>
          ))}
      </div>

      {isOpen ? (
        <div className="mt-2">
          <div className="flex gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  onReply(thread.id, draft.trim(), () => setDraft(""));
                }
              }}
              placeholder="Reply"
              className="min-w-0 flex-1 rounded border border-white/15 bg-charcoal-dark px-2 py-1.5 text-xs text-sand outline-none placeholder:text-grey-muted focus:border-blue-accent"
            />
            <button
              onClick={() => draft.trim() && onReply(thread.id, draft.trim(), () => setDraft(""))}
              disabled={pending}
              className="rounded bg-white/10 px-2.5 text-xs text-sand transition hover:bg-white/20 disabled:opacity-50"
            >
              Send
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {isAgency
              ? (["accepted", "declined", "open"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => onMark(thread.id, s)}
                    disabled={pending || thread.status === s}
                    className="rounded border border-white/15 px-2 py-1 text-[11px] text-grey-light transition hover:bg-white/10 disabled:opacity-40"
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))
              : null}

            {mine || isAgency ? (
              confirming ? (
                <span className="ml-auto flex items-center gap-2 text-[11px]">
                  <span className="text-grey-light">Delete this note?</span>
                  <button
                    onClick={() => onDelete(thread.id)}
                    disabled={pending}
                    className="font-semibold text-red-400 hover:underline disabled:opacity-40"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="text-grey-muted hover:underline"
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  disabled={pending}
                  className="ml-auto text-[11px] text-grey-muted transition hover:text-red-400 disabled:opacity-40"
                >
                  Delete note
                </button>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
