# Agent guide

- Use `.tsrx` for owned production components. Port generated shadcn components to `.tsrx` and remove the generated `.tsx` files.
- Before changing Effect code, read `node_modules/effect/AGENTS.md` and its relevant links. Use the installed `effect/ai-docs` and `effect/src` as version-matched references.
- Write fallible workflows as named `Effect.fn` functions with typed errors and Effect/Stream collection operations. Adapt individual Promise APIs with `Effect.tryPromise`; run Effects only at framework boundaries. Keep pure transformations simple.
- Use clear verb-and-subject function names such as `getAccessibleRepos` and `getGithubToken`. Keep functions focused and remove unnecessary wrappers and duplication.
- Keep application endpoints in TanStack Start: use `createServerFn` for app RPC and file server routes for webhooks/raw HTTP. Do not add endpoint dispatch to `src/server.ts`.
- Use Context7 for current third-party library and tool documentation.
- Use Drizzle's typed schema and query builder for D1 database queries.
- Keep automated tests minimal. Our approach is to write tests only for explicit regressions.

## Code structure and readability

- Organize by feature and responsibility. Put task attachment UI in `board/components/tasks/attachments/` with names such as `paste.tsrx` and `picker.tsrx`. Group related files before adding more prefixed siblings to a crowded folder. Keep shared domain code outside UI folders.
- Give each module one responsibility and each function one operation. Keep framework entry points thin: authenticate, decode, call a domain workflow, and translate its result. Separate validation, persistence, external I/O, and rendering.
- Aim for functions under 40 lines, components under 80 lines, and modules/classes under 250 lines. These are review triggers, not quotas: split at meaningful responsibilities, never into arbitrary numbered files, forwarding wrappers, or a new inheritance hierarchy just to meet a count. Explain any substantial exception in the final review.
- A workflow should read as a short sequence of named steps. Use named `Effect.fn` operations for meaningful fallible steps so Axiom shows where time and failures occur. Include stable operation names and relevant IDs/counts; do not create spans for trivial pure helpers or put user content in span names.
- Pass the smallest explicit dependencies a module needs. Do not pass a whole Durable Object, React component state bag, or generic service locator to extracted helpers. Keep transaction ownership and serialization at a clear boundary.
- Do not nest ternaries. Use early returns, named predicates, `switch`, or a lookup table. Extract complex JSX conditions and callbacks into named values or handlers.
- Name domain limits, timeouts, retry counts, byte offsets, and concurrency limits. Include units in names and colocate constants with the policy or format they describe. Ordinary indexing, HTTP status codes, and self-explanatory layout values do not need ceremonial constants.
- Prefer direct domain types and discriminated unions that rule out invalid states. Avoid optional fields that require repeated runtime checks after validation.
- Before finishing, review the diff for oversized functions, mixed responsibilities, repeated logic, nested ternaries, unexplained literals, and folder sprawl. Fix those issues in the touched code; do not leave cleanup as a follow-up.

## Validation

- Run the relevant existing tests and the repository's `format`, `lint`, `knip` and `typecheck` commands. For changes to Durable Object behavior or browser interactions, run the relevant existing E2E scenarios when available.
- Report exactly which checks passed and which could not run. Preserve the behavior and unrelated edits already present in the working tree. Do not create commits unless requested.
