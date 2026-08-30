# Sidequest

Sidequest is a fast, clear, and intentionally simple personal task manager. It
combines a Linear-like interaction model with local-first reliability and an
interface designed to reduce friction for people with ADHD.

The first version is designed for a single user.

## Application development

The application uses TanStack Start, TSRX, Bun, and Vite. It targets Cloudflare
Workers through the official Cloudflare Vite plugin.

Install dependencies and start the development server:

```sh
bun install
bun run dev
```

The main repository commands are:

```sh
bun run build        # Create a production build
bun run commitlint   # Validate a commit-message file
bun run deploy       # Build and deploy with Wrangler
bun run deploy:dry-run # Validate the Cloudflare deployment bundle
bun run format      # Check formatting
bun run format:fix  # Apply formatting
bun run lint        # Run type-aware linting
bun run lint:fix    # Apply safe lint fixes
bun run knip        # Find unused files, exports, and dependencies
bun run test        # Run tests once
bun run typecheck   # Type-check TypeScript and TSRX
```

Lefthook is installed automatically by `bun install`. Before each commit it
formats and re-stages supported files, then runs type-aware linting against the
staged source files. The `commit-msg` hook uses Commitlint to enforce
Conventional Commit messages.

## UI components

The application uses Tailwind CSS v4 and shadcn/ui with the Base UI-backed
Mira style. The shadcn configuration is intentionally a source-code starting
point: production components are owned by this repository and use TSRX. The
shared `cn` utility is provided by `cnfast`.

Add one component at a time and inspect the generated source before porting it:

```sh
bunx shadcn add button --dry-run
bunx shadcn add button
```

The CLI writes `src/components/ui/button.tsx`. Rewrite that file as
`src/components/ui/button.tsrx`, apply the Sidequest design tokens and component
conventions, then remove the generated `.tsx` file. Do not leave both extensions
with the same basename because an extensionless import may resolve the generated
TSX version. A later shadcn command may recreate `.tsx` dependencies, so check
for same-basename siblings after every add:

```sh
rg --files src/components/ui | sort
```

For upstream changes, preview and merge rather than overwriting the owned TSRX
component:

```sh
bunx shadcn add button --diff button.tsx
```

`build`, `dev`, and `typecheck` automatically regenerate Cloudflare Worker
types. Run `bun run cf-typegen` directly to refresh them without starting
another task. TanStack Start regenerates its route tree during Vite development
and builds. GitHub Actions verifies that both generated files are committed and
current. Manual production deployments require `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` GitHub environment secrets.

## Product principles

- **Fast:** Capture and organise a thought in under three seconds.
- **Clear:** Show only the detail needed for the current decision.
- **Keyboard-first:** Every core action is available without a pointer.
- **Local-first:** The app remains fully usable without a connection.
- **Calm:** Avoid clutter, punitive overdue states, and unnecessary settings.
- **Safe:** Persist changes automatically and make actions reversible.

## Product model

The hierarchy is:

```text
Lane
└── Task
    └── Task
        └── Task ...
```

- A lane contains an ordered tree of tasks.
- Inbox and Today are fixed special lanes for quick capture and current focus.
- A subtask is a normal task with a parent, so tasks can nest to any depth.
- Tasks and their descendants can move within or between lanes.
- Each task can have a due date, recurrence rule, and link attachments.

## MVP

### Tasks and lanes

- Create, edit, and complete tasks.
- Create, rename, reorder, and remove lanes.
- Nest tasks to any depth and collapse task branches.
- Reorder tasks and move them between parents or lanes.
- Assign an optional date-only due date.
- Create simple daily, weekly, monthly, or yearly recurring tasks.
- Completing a parent completes all of its descendants.
- Completion is the only removal action. Completed tasks leave the canvas, and
  an immediate completion can be reversed with undo.

### Single canvas

- The entire app uses one horizontally scrolling canvas of lanes.
- Inbox and Today are always the first and second lanes and cannot be renamed,
  reordered, or removed.
- Inbox is the default destination for quick capture. Today is manually
  populated with the tasks that deserve current focus.
- Desktop users scroll horizontally or navigate between lanes with the
  keyboard.
- Mobile users swipe horizontally between full-width lanes.
- The active lane snaps into place on mobile and its position is restored when
  the app reopens.
- Tasks can be dragged across lane boundaries without opening another screen.
- Search and command-menu results focus the relevant task in its lane rather
  than navigating to a separate view.
- Due dates are shown inline and can be filtered or surfaced through the
  command menu.

Task branches collapse to keep each lane readable. Breadcrumbs preserve
context when working deeply within a task tree.

### Interaction model

- `Enter` creates the next task.
- `Cmd/Ctrl+Enter` completes the focused task.
- `Tab` makes a task a child of the task above it.
- `Shift+Tab` moves a task up one level.
- `ArrowUp` and `ArrowDown` navigate tasks.
- `ArrowLeft` and `ArrowRight` navigate between lanes when a task is not being
  edited.
- `Cmd/Ctrl+Shift+ArrowUp` and `Cmd/Ctrl+Shift+ArrowDown` reorder a task among
  its siblings.
- `Cmd/Ctrl+Shift+ArrowLeft` and `Cmd/Ctrl+Shift+ArrowRight` move the focused
  task to the adjacent lane. It becomes a root task and retains its descendants.
- `@` opens date selection.
- `Cmd/Ctrl+K` opens the command menu.
- Standard undo and redo shortcuts reverse structural and content changes.
- Drag-and-drop supports reordering, nesting, and moving tasks between lanes.

The command menu provides search and every core action, including task and lane
navigation, creation, movement, completion, and due-date changes.

### Rich tasks

- Task text uses a lightweight structured editor with inline link support, not
  a general-purpose rich-text or document editor.
- URLs are detected as they are typed, pasted, or dropped onto a task.
- Detected URLs become clickable inline links and create link attachments while
  preserving any surrounding task text.
- Link attachments display a compact preview containing the title, domain,
  description, and image when available.
- GitHub links can additionally show repository and issue or pull-request
  metadata.
- Failed or unavailable previews fall back to a normal URL without blocking
  task creation.

### Sync and offline behaviour

- Reads and writes happen against a local database first.
- Every feature remains usable while offline.
- Changes sync automatically when a connection is available.
- Multiple open clients receive updates in realtime.
- The interface exposes clear offline, syncing, synced, and conflict states.
- Deterministic conflict handling prevents silent data loss.
- Reordering uses stable ordering identifiers so concurrent edits converge.

### MCP server

The MCP server provides explicit read and write tools for:

- Searching and listing lanes and tasks
- Creating tasks
- Updating task content, due date, and recurrence
- Moving and nesting tasks
- Completing tasks

Write operations require clear user authorisation and return the resulting
task state.

### Platforms

- Begin with a responsive web application that can be installed as a PWA.
- Keep the local data and sync engine independent from the user interface.
- Validate mobile interaction and offline behaviour from the beginning.
- Add a native mobile shell only if PWA limitations materially affect the
  experience.

## Recurrence rules

- Recurrence is deliberately limited to daily, weekly, monthly, and yearly.
- Completing a recurring task creates its next occurrence.
- The next date is calculated from the scheduled due date, not the completion
  date.
- Recurring parent tasks recreate their full subtask tree.
- Exceptions and complex calendar rules are outside the MVP.

## Implementation plan

1. **Set acceptance gates:** Define measurable targets for capture speed,
   keyboard usability, mobile interaction, offline reliability, and sync
   convergence.
2. **Validate the risks:** Test the interactive UX with real tasks and build a
   disposable two-client sync spike covering offline edits, reconnects,
   conflicts, ordering, and subtree moves.
3. **Choose the architecture:** Decide the PWA and native boundary, sync
   provider, conflict policy, ordering strategy, completion retention, and
   local-data behaviour after logout.
4. **Establish foundations:** Create local, staging, and production
   environments with CI, migrations, preview deployments, secrets, logs,
   monitoring, backups, and recovery checks.
5. **Secure the system:** Add passwordless authentication, a single-user
   allowlist, ownership fields, row-level security, sync rules, token refresh,
   and protected server credentials.
6. **Build a vertical slice:** Deploy sign-in through offline task creation,
   backend upload, second-device sync, completion, and reconnect before adding
   the remaining features.
7. **Implement the MVP:** Add the recursive domain model, stable ordering,
   lanes, keyboard controls, drag-and-drop, command search, undo, due dates,
   recurrence, and responsive canvas.
8. **Add integrations:** Introduce secure rich-link metadata and a typed,
   authenticated, idempotent MCP server using the shared domain operations.
9. **Harden and trial:** Test large trees, accessibility, service-worker
   updates, storage limits, conflict recovery, export, real devices, and daily
   personal use before declaring the MVP complete.

## Initial non-goals

- Multi-user collaboration, assignment, comments, or permissions
- Time-based scheduling or timezones
- Dependencies, estimates, reporting, or project-management workflows
- Custom fields, tags, themes, or extensive personalisation
- Complex recurrence rules
- General-purpose documents or note-taking
- A broad integration marketplace

## Success criteria

- A thought becomes a task in under three seconds.
- Core workflows can be completed entirely from the keyboard.
- The app starts immediately and feels responsive with a large nested list.
- Going offline never interrupts task management or loses work.
- The single canvas makes every lane reachable without changing views.

## Market notes

Established personal task managers include Todoist, Microsoft To Do, TickTick,
Any.do, Apple Reminders, Google Tasks, and Things 3. Emerging products such as
Superlist, Hero, Tana, Hoop, Tiimo, Akiflow, Routine, and Morgen point towards
several opportunities:

- Automatic task capture from conversations and connected tools
- AI that completes or delegates work instead of only organising it
- ADHD- and neurodivergent-friendly planning
- Calendar-first planning that accounts for available time

Sidequest's initial differentiation is not feature breadth. It is the
combination of recursive task structure, keyboard speed, calm design, and a
high-quality local-first experience.
