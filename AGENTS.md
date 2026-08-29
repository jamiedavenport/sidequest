# Agent guide

## General

- Use Conventional Commit messages and Context7 for current library and tool documentation.
- TSRX is in active beta. Prefer its current [LLM reference](https://tsrx.dev/llms.txt), [features guide](https://tsrx.dev/features), and [specification](https://tsrx.dev/specification) to model memory, historical examples, or copied summaries.

## TSRX and React

- This repository compiles `.tsrx` to React with `@tsrx/react` and `@tsrx/vite-plugin-react`: TSRX supplies authoring syntax; React supplies runtime semantics. Use `.tsrx` for owned production components; existing `.tsx` modules may import them normally.
- Write components as ordinary typed TypeScript functions. Use `function Component(props) @{ ... }` when setup and rendered output share a scope.
- In each statement container, place setup statements first and finish with exactly one output node. Use a fragment when the output contains multiple siblings, text, or a bare expression alongside elements.
- Use current template control flow: `@if`, `@for`, `@switch`, and `@try`. Do not introduce removed experimental syntax or legacy examples.
- Preserve React conventions: use `className` for host elements and component props, React event names, hooks, and normal component APIs.
- Scoped `<style>` blocks are allowed, but this application normally uses Tailwind CSS and the design tokens in `src/styles.css`. Follow nearby component conventions.
- When adding shadcn components, generate the `.tsx` source only as a reference, port the owned component to `.tsrx`, and remove any same-basename `.tsx` sibling.
- With TSRX MCP tools, run `inspect-project` before substantial work; use `format-tsrx`, `compile-tsrx`, and `analyze-tsrx` for generated code, and `validate-tsrx-file` for a read-only check of an existing file.

## Validation

- Prefer the smallest relevant check while iterating, then run all appropriate checks: `bun run format`, `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build`.
- Run `bun run format:fix` or `bun run lint:fix` only when intending to modify files.
