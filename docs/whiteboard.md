# Whiteboard editor

Sidequest embeds `@excalidraw/excalidraw@0.18.1` in the existing client-only task
sheet. The toolbar uses the public tool and viewport APIs. Native keyboard
undo/redo remains available; the custom history buttons have been removed.

Documents in the existing `whiteboards` collection use this envelope:

```json
{ "type": "excalidraw", "version": 1, "elements": [] }
```

This is Sidequest's document version, not Excalidraw's export-file version.
Only scene elements are stored. Selection, tools, viewport, files and other app
state are excluded. Shared Effect schemas validate writes both before local
transactions and on the server. Images, embeds, generated HTML and file-backed
elements are rejected. Paste/drop capture and the editor's supported options
also block asset ingestion; plain text and asset-free element clipboard data
remain supported.

Collection reads still accept JSON. Recognized TLDraw store snapshots open as
blank and remain stored unchanged until an edit. Unknown or malformed documents
show a read-only error instead of being replaced. There is no conversion,
bulk deletion or database migration. Task completion retention and deletion
cleanup remain unchanged.

Canonical scene comparison prevents loading, selection, zoom and tool callbacks
from saving. Incoming clean scenes use `CaptureUpdateAction.NEVER` to avoid local
undo entries. Pending local edits retain priority while dirty or saving; this
is single-document replacement, without multiplayer merging. Saving retains
the 500 ms debounce, revisions, serialized transactions and unmount flush.
Offline edits stay in the existing account-scoped outbox and finish syncing on
reconnect. The status can remain “Saving…” while offline.

## Assets and notices

Vite's `sidequest-whiteboard-fonts` plugin copies the pinned package's
`dist/prod/fonts` to `public/excalidraw/fonts` for development and production.
The generated directory is ignored by Git. No separate download or manual copy
is needed after `bun install`. The lazy loader sets `EXCALIDRAW_ASSET_PATH`
before importing the editor. Font files are served from `/excalidraw/fonts/`.
Excalidraw retains its upstream CDN fallback if a local font cannot load.

MIT and bundled font notices are retained in
`public/excalidraw/notices` and included in production assets. Sidequest's own
license is unchanged. The legacy TLDraw localStorage preference key may remain
in existing browsers but is no longer read or written.

## References and rollout

Context7: `/excalidraw/excalidraw/v0.18.0`, requested integration version 0.18.1;
verified against published 0.18.1 types and runtime. `/mui/base-ui`, requested
1.7.0, was consulted for cancellable dialog events. The sheet cancels dismissal
when Escape commits an Excalidraw textarea that has already been detached.

Deploy the editor and server validator together in the normal application
release. Old TLDraw clients can still read collection JSON but their whiteboard
writes are rejected; they must reload to edit. Existing drawings are not
converted. No production deployment is performed by the migration itself.

## Verification

The focused unit regressions cover legacy reads, unknown-document errors and
legacy/asset rejection at both mutation boundaries. `e2e/whiteboard.e2e.ts`
exercises shortcuts, zoom, native undo/redo, text entry, remote scene updates
without save loops, asset blocking, offline close/reconnect, reopen and local
font requests and hidden mobile toolbars. It also runs against the built Worker with
`E2E_BUILT_WORKER=1 bunx playwright test e2e/whiteboard.e2e.ts`.

Repository checks: `bun run format`, `bun run lint`, `bun run typecheck`,
`bun run test`, `bun run build`, `bun run privacy:validate`, and the existing
board-navigation E2E test. The existing large-chunk build advisory and the
privacy validator's existing DPO warning are unrelated to this migration.

Additional local Chromium checks exercised all eight tools, asset-free element
copy/paste, plain text URL paste, erasing, hand panning, task switching, focus
restoration, mobile touch drawing and pinch zoom. Desktop and mobile screenshots
were inspected. Production font requests succeeded locally with no TLDraw or
font-CDN requests. Physical touch devices and live production deployment were
not exercised.
