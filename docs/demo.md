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

## Promotional screenshots

```sh
bun run demo:screenshots
```

This runs the same demo fixture in headless Chromium, captures four PNGs, and exits automatically. Images are saved in `.playwright/demo-screenshots/`, outside Playwright's disposable test-results directory. The account and temporary server data are cleaned up on success or failure. As with the interactive demo, run this separately from E2E tests because they share port 4173 and server state.

Screenshots use a fixed `2026-09-08` anchor, noon UTC, `en-GB`, light mode, reduced motion, and 2× device resolution. Override the date with `DEMO_ANCHOR_DATE=2026-12-30 bun run demo:screenshots`. The normal `bun run demo` command remains interactive and defaults to today's date.

Every screenshot uses the same 1392 × 982 viewport and exports at **2784 × 1964 pixels**. Captures keep the full browser viewport, including notes and whiteboards; there are no separate element crops or scene-specific viewport sizes.

| File                | Framing                                    |
| ------------------- | ------------------------------------------ |
| `01-board.png`      | Today, Inbox, Launch, and Engineering      |
| `02-projects.png`   | Launch, Engineering, Learning, and Life    |
| `03-notes.png`      | Release notes with board context           |
| `04-whiteboard.png` | Release-process drawing with board context |

The capture accepts necessary cookies only, waits for seeded content and two consecutive identical renders, removes text selections and carets, and hides scrollbars for the export. Whiteboard capture waits for the saved scene and fits the drawing into view. It uses the real UI and does not change the demo content or application styles.

Successful runs publish `manifest.json` with the anchor, browser settings, filenames, and actual pixel dimensions. Each PNG is also attached to the Playwright result. Reruns overwrite these filenames; copy approved assets elsewhere before another capture. If a capture fails, the command exits nonzero and no new manifest is published; any remaining PNGs may be from a partial or earlier run. Playwright's failure screenshot is available under `.playwright/test-results/`.

The viewport fits four of the current 348px desktop lanes. The projects screenshot scrolls to Launch without changing the viewport. If that layout changes, update the shared viewport in `playwright.demo.config.ts` and review every export. The command verifies that all PNGs match the configured 2× viewport dimensions and removes the older mixed-size filenames after a successful capture. Images may differ slightly across operating systems because of system fonts and browser rendering. Promotional backgrounds, typography, and video production are separate steps.

Screenshot API reference: Context7 `/microsoft/playwright/v1.58.2`, requested and installed Playwright version `1.58.2`.

Documentation reference: Context7 `/better-auth/better-auth`, requested Better Auth version `1.7.2` (no version-specific Context7 entry available); behavior was also checked against the installed adapter and email OTP code.
