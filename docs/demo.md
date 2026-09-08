# Onboarding and demo boards

Run `bun run demo` to start the isolated local E2E server, create a fresh demo account, and open an authenticated Chromium window. Close the tab/window to finish. The account and temporary server data are removed on exit. This uses the same port (4173) and `.playwright/e2e-state` directory as Playwright; run it separately from E2E tests. If Chromium is missing, run `bunx playwright install chromium` first.

The default anchor is the current date. For a repeatable session:

```sh
DEMO_ANCHOR_DATE=2026-12-30 bun run demo
```

An explicit anchor also fixes the browser clock at local noon on that date. Tasks store full `YYYY-MM-DD` dates, calculated with Effect calendar arithmetic. Today and Inbox are computed views, never stored lanes. Nested tasks share their parent's lane and date.

`createSession(request, { seed: "demo", anchorDate: "2026-12-30" })` creates the same fixture in Playwright. `seed` also accepts `onboarding` and `empty`; omitting it creates an empty board. The local session endpoint accepts these as query parameters. Supplying `userId` logs in to an existing account and ignores seed options. Both the endpoint and internal E2E board method require E2E mode, local request/auth hosts, and the session secret.

New production accounts receive onboarding from Better Auth's user creation hook for both email OTP and OAuth registration. The seed attempt is awaited independently of email verification and welcome email delivery. Failures are logged and signup continues. Login and reopening never seed; edited or deleted starter content stays changed.

Seeds are version 1, use existing collections, and only write to empty boards after readiness and ownership checks. Collections persist sequentially. There is no cross-collection atomicity, retry, seed journal, or automatic repair; a failure may leave partial data. E2E seed failures return an error to the caller. Seed writes do not invoke link enrichment or GitHub integrations. Links are pre-authored attachments.

## Semantic IDs

All IDs are stable within a user's board. Builders return fresh objects. Fixture profiles and versions belong to the dataset and are not stored as an account eligibility flag.

| Fixture                          | IDs                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Getting started lane             | `onboarding-getting-started`                                                                                                  |
| Five guides                      | `onboarding-edit-task`, `onboarding-nest-task`, `onboarding-schedule-task`, `onboarding-add-note`, `onboarding-complete-task` |
| Nested next step / Inbox capture | `onboarding-next-step`, `onboarding-inbox-capture`                                                                            |
| Demo lanes                       | `demo-launch`, `demo-engineering`, `demo-learning`, `demo-life`                                                               |
| Three-level release hierarchy    | `demo-ship-release` → `demo-release-checklist` → `demo-smoke-test`                                                            |
| Other project groups             | `demo-improve-search`, `demo-flaky-build`, `demo-learn-spanish`, `demo-weekend-trip`                                          |
| Release-process whiteboard       | task ID `demo-release-process`; elements `release-stage-*`, `release-label-*`, `release-arrow-*`                              |

Onboarding has seven incomplete tasks. The demo has four custom lanes, 40 tasks (10 subtasks and eight completed), six substantive notes, empty notes for the remaining tasks, three link attachments, and one whiteboard. Completed tasks retain note records in storage; the existing sync snapshot omits their notes. Other semantic task and attachment IDs are authored in `src/board/seeds/demo.ts`.

Recording layout and video production are outside this command.

Documentation reference: Context7 `/better-auth/better-auth`, requested Better Auth version `1.7.2` (no version-specific Context7 entry available); behavior was also checked against the installed adapter and email OTP code.
