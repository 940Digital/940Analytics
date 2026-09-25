# Client review mirror

A frozen copy of a client's site, served inside 940Analytics, that the client
can click through and mark up. Notes and rewritten copy come back to you in a
sidebar with accept and decline on each one.

Built for Lindsay reviewing Azekah Group, but nothing in it is specific to
that site.

## How it fits together

| Piece | Where |
|---|---|
| Snapshot of the pages and assets | `rv_pages`, `rv_assets` |
| The review and who may see it | `rv_reviews`, `rv_review_access`, `rv_invites` |
| Notes and rewrites | `rv_threads`, `rv_messages` |
| Counts for the CRM | view `rv_review_summary` |
| Serving a page same-origin | `app/review/[id]/frame/[pageId]` |
| The click-to-annotate layer | `lib/review/snapshot.ts` |
| Reviewer screen | `app/review/[id]` |
| Your index, invites, CRM link | `app/review` |

A review hangs off `crm_websites.id`, which is the same row the CRM already
keeps for that site. The CRM's websites table reads `rv_review_summary` and
shows the open-note count next to each website, linking straight into the
review. The CRM owns none of these tables and fails soft if they are missing.

## Pushing a site in

From this folder:

```bash
node scripts/push-site.mjs --dir "../azekah-group" --title "Azekah Group copy review"
```

It prints the review id. To refresh it later after edits:

```bash
node scripts/push-site.mjs --dir "../azekah-group" --review <id>
```

The script signs in as your master account, so there is no service key
anywhere and row level security is still deciding what may be written. Put
`REVIEW_EMAIL` and `REVIEW_PASSWORD` in `.env.local` to skip the prompt.

`blueprint.html` is excluded by default. Change that with
`--exclude "a.html,b.html"`.

## Getting the client in

On the reviews index, pick the CRM website, press **New link**, and copy it.
The link sends them to log in and drops them straight on the review. It also
gives their account a standing grant, so afterwards they can just log in and
press **View my website** on their dashboard. Links can be revoked.

## What the client sees

Scripts are stripped from every snapshot. That is not only about safety:
these sites gate their scroll animations behind a `.js` class their own
script adds, so with scripts gone the page renders its no-JS fallback,
everything visible, no intro animation, and no analytics beacon firing from
inside a review. It is the right state to read copy in.

Clicking any text selects the whole block it belongs to, not the italic
fragment inside it, and offers two boxes: a note, and the words themselves to
rewrite. You see the original and the suggestion side by side.

## Notes for later

- Snapshots are frozen. Re-push after you change the site or the client will
  be reviewing yesterday's words.
- Assets are stored as rows, base64 for binaries, with a 6MB ceiling per file.
  A photo-heavy site would be better served by Supabase Storage.
- `rv_can_see` shows up in the Supabase security advisor as a definer function
  callable by signed-in users. It is, deliberately: the RLS policies call it.
  It only ever answers about the caller's own access.
