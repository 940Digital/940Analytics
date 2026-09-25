"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_EXCLUDE,
  MAX_ASSET,
  TEXT_ASSET,
  isHtml,
  pageOrder,
  relativePath,
  skip,
  titleOf,
  typeFor,
} from "@/lib/review/ingest";

type Picked = { path: string; file: File };

/** Browsers hand base64 back through a data URL more reliably than by walking
 *  a byte array, which blows the stack on anything image sized. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function PushSite({ reviews }: { reviews: { id: string; title: string }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[] | null>(null);
  const [folder, setFolder] = useState("");
  const [target, setTarget] = useState(reviews[0]?.id ?? "new");
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files || []);
    if (all.length === 0) return;

    const first = (all[0] as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    setFolder(first.split("/")[0] || "selection");

    const keep: Picked[] = [];
    for (const f of all) {
      const full = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const path = relativePath(full);
      if (!path || skip(path)) continue;
      if (isHtml(path) && DEFAULT_EXCLUDE.includes(path.split("/").pop() || "")) continue;
      keep.push({ path, file: f });
    }

    setPicked(keep);
    setError(null);
  }

  const pages = (picked ?? []).filter((p) => isHtml(p.path)).sort((a, b) => pageOrder(a.path, b.path));
  const assets = (picked ?? []).filter((p) => !isHtml(p.path));
  const weight = assets.reduce((n, a) => n + a.file.size, 0);
  const oversize = assets.filter((a) => a.file.size > MAX_ASSET);

  async function push() {
    if (!picked || pages.length === 0) return;
    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();

      let reviewId = target;
      if (target === "new") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Session expired. Log in again.");

        const { data, error: insErr } = await supabase
          .from("rv_reviews")
          .insert({ title: newTitle.trim() || folder, created_by: user.id })
          .select("id")
          .single();
        if (insErr) throw insErr;
        reviewId = data.id;
      }

      for (let i = 0; i < pages.length; i++) {
        setProgress(`Page ${i + 1} of ${pages.length}: ${pages[i].path}`);
        const html = await pages[i].file.text();
        const { error: pErr } = await supabase.from("rv_pages").upsert(
          {
            review_id: reviewId,
            path: pages[i].path,
            title: titleOf(html, pages[i].path),
            html,
            sort: i,
          },
          { onConflict: "review_id,path" }
        );
        if (pErr) throw pErr;
      }

      const sendable = assets.filter((a) => a.file.size <= MAX_ASSET);
      for (let i = 0; i < sendable.length; i++) {
        const a = sendable[i];
        setProgress(`Asset ${i + 1} of ${sendable.length}: ${a.path}`);
        const data = TEXT_ASSET.test(a.path) ? await a.file.text() : await toBase64(a.file);
        const { error: aErr } = await supabase.from("rv_assets").upsert(
          {
            review_id: reviewId,
            path: a.path,
            content_type: typeFor(a.path),
            data,
          },
          { onConflict: "review_id,path" }
        );
        if (aErr) throw aErr;
      }

      setProgress("");
      setPicked(null);
      setNewTitle("");
      if (input.current) input.current.value = "";
      router.refresh();
      router.push(`/review/${reviewId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-charcoal-text/10 bg-white p-5">
      <h2 className="font-display text-base font-bold">Push a site in</h2>
      <p className="mt-1 text-sm text-grey-muted">
        Pick the site&rsquo;s folder. Everything is read in your browser and written
        straight to your own account, so nothing is uploaded anywhere else.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          onChange={onPick}
          // @ts-expect-error non-standard, but how every browser does folders
          webkitdirectory=""
          directory=""
          multiple
          className="block w-full max-w-sm text-sm text-grey-muted file:mr-3 file:rounded-md file:border-0 file:bg-blue-accent file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-hover"
        />
      </div>

      {picked && pages.length === 0 ? (
        <p className="mt-3 text-sm text-red-700">
          No HTML pages in that folder. Pick the folder that holds index.html.
        </p>
      ) : null}

      {picked && pages.length > 0 ? (
        <div className="mt-4 rounded-md border border-charcoal-text/10 bg-sand p-4">
          <p className="text-sm font-medium text-charcoal-text">
            {folder}: {pages.length} page{pages.length === 1 ? "" : "s"}, {assets.length} asset
            {assets.length === 1 ? "" : "s"}, {(weight / 1e6).toFixed(2)}MB
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {pages.map((p) => (
              <li
                key={p.path}
                className="rounded bg-white px-2 py-0.5 font-mono text-xs text-grey-muted"
              >
                {p.path}
              </li>
            ))}
          </ul>
          {oversize.length > 0 ? (
            <p className="mt-2 text-xs text-red-700">
              {oversize.length} file{oversize.length === 1 ? "" : "s"} over 6MB will be skipped:{" "}
              {oversize.map((a) => a.path).join(", ")}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-grey-muted">
            Skipping {DEFAULT_EXCLUDE.join(", ")}.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-grey-muted">Into</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="rounded-md border border-charcoal-text/15 bg-white px-2 py-1.5 text-sm"
              >
                {reviews.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
                <option value="new">A new review&hellip;</option>
              </select>
            </label>

            {target === "new" ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-grey-muted">Title</span>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={`${folder} copy review`}
                  className="rounded-md border border-charcoal-text/15 bg-white px-2 py-1.5 text-sm"
                />
              </label>
            ) : null}

            <button
              onClick={push}
              disabled={busy}
              className="rounded-md bg-blue-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-hover disabled:opacity-50"
            >
              {busy ? "Pushing…" : "Push"}
            </button>
          </div>

          {progress ? (
            <p className="mt-3 font-mono text-xs text-grey-muted">{progress}</p>
          ) : null}
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
