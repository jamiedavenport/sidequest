# Agent guide

- Use `.tsrx` for owned production components. Port generated shadcn components to `.tsrx` and remove the generated `.tsx` files.
- Before changing Effect code, read `node_modules/effect/AGENTS.md` and its relevant links. Use the installed `effect/ai-docs` and `effect/src` as version-matched references.
- Use Context7 for current third-party library and tool documentation.
- Use Drizzle's typed schema and query builder for D1 database queries.
- Keep automated tests minimal. Our approach is to write tests only for explicit regressions.
