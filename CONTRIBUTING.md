# Contributing to Sidequest

Thanks for helping improve Sidequest. Useful contributions include bug reports,
feedback on everyday workflows, documentation fixes, and focused code changes.
For a larger feature or architectural change, open an issue to discuss the
problem and proposed approach before starting work.

## Contribution licensing

By submitting a contribution, you agree to license it under Sidequest’s
[Sustainable Use License, Version 1.0](LICENSE.md). You retain ownership of your
contribution. Only contribute material you have the right to license under these
terms, and preserve any applicable third-party licenses and notices.

Sidequest uses the license terms [published by n8n](https://github.com/n8n-io/n8n/blob/master/LICENSE.md#sustainable-use-license).
n8n encourages other projects to adopt them in its
[license announcement](https://blog.n8n.io/announcing-new-sustainable-use-license/).

## Run the app locally

The application uses TanStack Start, TSRX, Bun, and Vite. It runs on Cloudflare
Workers, with D1 for application data and Durable Objects for board storage and
sync. Local development uses the Cloudflare Vite plugin.

Clone your fork, enter the repository, and install
[mise](https://mise.jdx.dev/getting-started.html). Provision the versions pinned
in `mise.toml` and install dependencies:

```sh
mise install
mise run setup
```

With mise activated in your shell, `bun` and `node` use the pinned project
versions. The commands below assume that environment.

### Configure your environment

Copy the example configuration and generate an authentication secret:

```sh
cp .dev.vars.example .dev.vars
openssl rand -base64 32
```

Edit `.dev.vars` before starting the server:

- Keep `BETTER_AUTH_URL=http://localhost:3000`.
- Set `BETTER_AUTH_SECRET` to the generated value. It must be at least 32
  characters. Keep it stable between runs; it also protects stored OAuth tokens.
- Set `RESEND_API_KEY` to your development Resend API key. Email sign-in sends a
  one-time code. The sender is currently defined as `Sidequest <login@sdqst.app>`
  in `src/auth/server.tsx`; for your own Resend account, change `EMAIL_SENDER`
  locally to a sender that account can use.
- Keep `BILLING_CHECKOUT_ENABLED=false` and `BILLING_ENFORCEMENT_ENABLED=false`
  for ordinary local development.

GitHub and Polar credentials are optional unless you are working on those
integrations. `RESEND_API_KEY` is required by environment validation even when
using GitHub sign-in. Keep `.dev.vars` and credentials out of commits. Restart
the development server after changing environment values.

Apply the migrations to local D1, then start the app:

```sh
bun run db:migrate:local
mise run dev
```

Open <http://localhost:3000> and sign in. The development server persists local
Cloudflare state under `.wrangler/`.

### Optional integrations

- [GitHub](docs/github.md): configure your own development GitHub App for
  sign-in, repository access, issue imports, and webhooks.
- [MCP](docs/mcp.md): client setup, OAuth, tool behavior, and validation.
- [Local billing setup](docs/billing-local-setup.md): configure Polar sandbox
  checkout and webhooks. See [billing](docs/billing.md) for the broader design.
- [Privacy](docs/privacy.md): consent behavior and privacy configuration.
- [Development tunnel](docs/local-tunnel.md): the maintainers’ webhook tunnel
  configuration. Contributors need their own tunnel and webhook hostname;
  `bun run dev:tunnel` expects a machine-specific Cloudflare configuration.

## Development conventions

Read [AGENTS.md](AGENTS.md) for the repository’s architecture and coding rules.
Keep changes focused, follow existing conventions, and avoid adding dependencies
without a clear reason.

- Use `.tsrx` for owned production components.
- Keep application RPC in TanStack Start `createServerFn` functions and raw HTTP
  endpoints in file server routes.
- Use Drizzle’s typed schema and query builder for D1 queries.
- Before changing Effect code, read `node_modules/effect/AGENTS.md` and the
  relevant installed `effect/ai-docs` and `effect/src` references. Write fallible
  workflows as named `Effect.fn` functions with typed errors, and run Effects at
  framework boundaries.
- Keep automated tests focused on explicit regressions.

### UI components

The UI uses Tailwind CSS v4 and shadcn/ui’s Base UI-backed Mira style. Generated
components are a starting point for code owned by this repository. The shared
`cn` utility uses `cnfast`.

Inspect and add one component at a time:

```sh
bunx shadcn add button --dry-run
bunx shadcn add button
```

Port the generated `src/components/ui/button.tsx` to `button.tsrx`, apply the
Sidequest design tokens and conventions, and remove the generated `.tsx` file.
Do not leave both extensions with the same basename: extensionless imports can
resolve to the generated TSX file. Later shadcn commands can recreate dependencies,
so check for duplicate basenames after each addition:

```sh
rg --files src/components/ui | sort
```

Preview upstream changes before merging them into owned components:

```sh
bunx shadcn add button --diff button.tsx
```

## Validate your changes

Run the local CI suite before opening a pull request:

```sh
mise run check
```

This checks formatting, linting, unused code, types, tests, and the production
build. Individual commands are useful while iterating:

| Command                  | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `bun run format`         | Check formatting and declaration spacing       |
| `bun run format:fix`     | Apply formatting                               |
| `bun run lint`           | Run type-aware linting                         |
| `bun run lint:fix`       | Apply safe lint fixes                          |
| `bun run knip`           | Find unused files, exports, and dependencies   |
| `bun run typecheck`      | Check TypeScript, TSRX, and Effect diagnostics |
| `bun run test`           | Run the unit and regression tests              |
| `bun run build`          | Create a production build                      |
| `bun run deploy:dry-run` | Validate the Cloudflare deployment bundle      |

For browser changes, run the relevant Playwright tests. Install Chromium once:

```sh
bunx playwright install chromium
bun run test:e2e
```

The browser test harness starts its own local server, applies migrations, and
uses isolated state under `.playwright/e2e-state`. The MCP tests also have a
built Worker check, `bun run test:e2e:mcp`. Integration-specific manual checks
are documented in the guides linked above.

`build`, `dev`, and `typecheck` regenerate Cloudflare Worker types using
`.dev.vars.example`. Run `bun run cf-typegen` to regenerate them independently.
TanStack Start regenerates `src/routeTree.gen.ts` during development and builds.
Include relevant generated changes in your patch; CI checks that generated
files are current.

## Open a pull request

Describe the problem, the resulting behavior, and how you validated the change.
Include screenshots for visible UI changes and call out any checks you could
not run. Keep unrelated edits out of the patch.

Lefthook is installed by `bun install`. The pre-commit hook formats and re-stages
supported files, then runs type-aware linting on staged source files. Commit
messages must follow Conventional Commits, such as `fix: preserve task focus
after moving lanes`. The commit-message hook validates this automatically; use
`bun run commitlint <message-file>` to check a message file manually.

For bug reports, include the steps to reproduce, expected and actual behavior,
and your browser and operating system. Remove personal task content and
credentials from screenshots and logs.

## Deployment

The checked-in `wrangler.jsonc` targets the hosted Sidequest app. For your own
deployment, configure your own Worker, D1 database, domains, integration
credentials, and GitHub Actions secrets first.

CI runs for pull requests and pushes to `main`. A successful push build on
`main` applies remote D1 migrations and deploys the Worker. This requires
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` repository secrets. Authentication
and integration secrets are managed separately as Worker secrets; consult the
integration guides for the settings required by enabled features.

For a configured deployment target, apply migrations before deploying manually:

```sh
bun run db:migrate:remote
bun run deploy
```
