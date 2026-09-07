# Agent guide

- Use `.tsrx` for owned production components. Port generated shadcn components to `.tsrx` and remove the generated `.tsx` files.
- Before changing Effect code, read `node_modules/effect/AGENTS.md` and its relevant links. Use the installed `effect/ai-docs` and `effect/src` as version-matched references.
- Write fallible workflows as named `Effect.fn` functions with typed errors and Effect/Stream collection operations. Adapt individual Promise APIs with `Effect.tryPromise`; run Effects only at framework boundaries. Keep pure transformations simple.
- Use clear verb-and-subject function names such as `getAccessibleRepos` and `getGithubToken`. Keep functions focused and remove unnecessary wrappers and duplication.
- Keep application endpoints in TanStack Start: use `createServerFn` for app RPC and file server routes for webhooks/raw HTTP. Do not add endpoint dispatch to `src/server.ts`.
- Use Context7 for current third-party library and tool documentation.
- Use Drizzle's typed schema and query builder for D1 database queries.
- Keep automated tests minimal. Our approach is to write tests only for explicit regressions.
