# Browser SQLite temporary-directory cleanup

`@tanstack/browser-db-sqlite-persistence@0.2.19` ships its own bundled
`OPFSCoopSyncVFS` inside `dist/assets/opfs-worker-uyjx5Rus.js`. Patching the separate
wa-sqlite package does not affect this worker, so the Bun patch targets that
published asset, shared by the ESM and CommonJS entry points.

Startup previously failed if a temporary `.ahp-*` directory had no advisory Web
Lock but still had a browser-held file access handle. Cleanup now skips only
`NoModificationAllowedError` and `NotFoundError`; other failures still propagate.
The VFS also closes its temporary handles before releasing its directory lock.
Board database files and pending outbox transactions are unaffected.

`e2e/board-return.e2e.ts` holds a real temporary access handle, reproduces the
original failure, then verifies navigation and the held file's contents. Review
this patch when upgrading the dependency and remove it once upstream includes an
equivalent fix. Apply it with the normal `bun install` workflow.

Version-matched code was checked alongside Context7 `/tanstack/db` (persistence
0.2.19) and `/oven-sh/bun` (requested Bun 1.3.13). Calendar error handling was
checked with `/websites/developers_google_workspace_calendar_api` (API v3).
