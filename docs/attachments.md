# Task attachments

Create or edit a task and choose **Attach**, or press **Cmd/Ctrl+Shift+U**.
The picker accepts multiple files. Paste files or URL-only content into the task
field or onto the selected task. Prose remains text; notes and whiteboards keep
their existing paste behavior. Tasks still require a title.

Open a media preview and choose **Delete**, or right-click its thumbnail and
choose **Delete**. On a saved task this updates the task immediately and syncs the
removal; in a create/edit form it removes the file from the draft until you save.
Cancelling an edit preserves the saved attachments.

JPEG, PNG, GIF, WebP, and AVIF files can be up to 20 MiB; MP4, WebM, and MOV files
can be up to 50 MiB. A task can have ten media attachments. Originals are stored
without conversion. Video playback depends on the browser's codecs; the viewer
always offers a download. Remote URLs remain links rather than imported files.

Uploads require a connection. Drafts retain pending files only while their page
is open. Retry or remove failed files before saving. Task metadata continues to
use the existing offline outbox, including across the sync protocol upgrade.
Manual links and media survive title changes; title-derived links are refreshed.

## Storage and deployment

The private `ATTACHMENTS` R2 binding is configured in `wrangler.jsonc` and
`e2e/wrangler.jsonc`. Create the production bucket once before deploying:

```sh
bunx wrangler r2 bucket create sidequest-attachments
```

Local development and E2E runs use local R2 storage. Do not enable a public R2
URL or apply bucket-wide expiration: authenticated Start routes serve originals
and byte ranges, while each user's Board Durable Object owns upload records.
There is no D1 migration or new runtime dependency.

Unattached uploads expire after 24 hours. Cancellation invalidates the upload
immediately and retains its cleanup record for an hour to cover in-flight writes.
Committed removal or task deletion removes the associated objects. The Durable
Object alarm retries cleanup failures hourly. Cleanup is also reconciled after
board persistence. Upload references are bound to one task and checked against
server-owned metadata before acceptance.

Sync version 3 rejects older clients and hibernated version-2 sockets. Reloading
uses the same persisted collections and outbox. Queued updates carry the IDs of
attachments they originally knew, so stale edits preserve newer attachments and
do not restore attachments removed elsewhere.

Implementation references: installed Effect `4.0.0-rc.112` (`effect/AGENTS.md`,
`effect/ai-docs`), and Context7 `/websites/developers_cloudflare_r2`, queried for
Workers bindings using Wrangler `4.127.1` (R2 docs are unversioned). The context
menu follows Context7 `/shadcn-ui/ui` Base UI guidance with shadcn CLI `4.19.0`.
