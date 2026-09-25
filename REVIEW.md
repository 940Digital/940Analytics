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

Go to `/review` and pick the site's folder in **Push a site in**. It reads the
files in your browser and writes them with the session you are already signed
in with, so no password is typed anywhere and nothing is uploaded to a third
party. Pick an existing review to refresh it, or make a new one.

`blueprint.html` is skipped. Files over 6MB are skipped and named.

Snapshots are frozen, so re-push after you change the site or the client will
be reading yesterday's words.

### From the command line instead

`scripts/push-site.mjs` does the same thing for scripting or bulk work. It
signs in as your master account, so there is still no service key involved.

```bash
node scripts/push-site.mjs --dir "../azekah-group" --review <id>
node scripts/push-site.mjs --dir "../azekah-group" --title "New review"
node scripts/push-site.mjs --dir "../azekah-group" --review <id> --dry-run
```

It prompts for email and password, or reads `REVIEW_EMAIL` and
`REVIEW_PASSWORD` from `.env.local`. `--exclude "a.html,b.html"` overrides
what gets left out.

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

## Provisioned accounts, and how to close them up

Lindsay's account was created directly in the database on 2026-09-25 rather
than through signup, so that no confirmation email was ever needed. Email
confirmation is still ON project-wide, which is where it should stay: nothing
was loosened to make this work, and there is no auth bypass anywhere in this
codebase.

What that leaves to tidy:

- **The temporary password was chosen by the developer, not by her.** She
  should change it on first login. Until she does, treat it as shared.
- **Her CRM rows were made by the signup trigger**, so `crm_contacts` has her
  email and null name and business. Worth filling in.
- **She has no `sites` row**, so she has no analytics, only the review. That
  is deliberate. Adding one later is what turns her into a tracking client.

### Making another one

Supabase's Admin API is the supported route and needs the service role key.
Doing it in SQL instead means inserting two rows, and there is one trap:

1. `auth.users` with `email_confirmed_at` set, plus a matching
   `auth.identities` row with provider `email`. Password sign-in fails
   without the identity.
2. **The empty-string columns.** `confirmation_token`, `recovery_token`,
   `email_change`, `email_change_token_new` and the phone equivalents must be
   `''`, never NULL. GoTrue reads them into non-nullable strings, and a NULL
   comes back as a 500 `"Database error querying schema"` on an otherwise
   perfectly valid sign-in. This cost a debugging round; it is not guessable
   from the error.

Always finish by actually signing in against
`/auth/v1/token?grant_type=password` before handing the account over. The rows
can look completely correct and still not authenticate.

## Notes for later

- Assets are stored as rows, base64 for binaries, with a 6MB ceiling per file.
  A photo-heavy site would be better served by Supabase Storage.
- `rv_can_see` shows up in the Supabase security advisor as a definer function
  callable by signed-in users. It is, deliberately: the RLS policies call it.
  It only ever answers about the caller's own access.
