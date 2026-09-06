# Sidequest MCP

Connect an OAuth-capable Streamable HTTP MCP client to **https://sdqst.app/mcp**.
Sign in with your email code, review the application, and choose read access or
allow task changes. Manage and revoke connections at **/connections**, linked
from the board header. Your MCP client controls approval of individual writes;
Sidequest tool annotations are descriptive and do not constitute approval.

## Access and tools

- `sidequest:read`: list lanes, list/search tasks, and get task details and ancestors.
- `sidequest:write`: create, update, move, and complete tasks; also requires read access.
- `offline_access`: permit refresh tokens for continued access while you are away.

The eight tools are `list_lanes`, `list_tasks`, `search_tasks`, `get_task`,
`create_task`, `update_task`, `move_task`, and `complete_task`. Discovery advertises
only the tools allowed by the connection. Tools accept no user or board ID; the
access token determines the board. Responses include structured data and a text
summary. Invalid arguments and domain failures return typed tool errors.

Task reads default to active tasks. Use `status: "completed"` or `"all"` to change
that, and `parentId: null` to select root tasks. Title search is case-insensitive.
Pagination defaults to 50 results, with a maximum of 100. Pass `nextCursor` as
`cursor` with the same filters and page size. Cursors expire when board revision,
results, or date context change; on `stale_cursor`, restart the listing.

MCP reads synchronized server state. Edits queued on an offline device become
visible only after that device reconnects. Browser offline conflict behavior is
unchanged: a later synchronized browser edit can supersede an MCP edit.

## Writes and dates

Every write requires an `idempotencyKey`, preferably a new UUID for each intended
operation. Reuse that key and the same arguments after a timeout or uncertain
response. Keys are scoped to the authenticated user and OAuth client. An identical
retry returns the original result and operation ID, even if the task has changed
since. Reusing a key for different arguments or a different tool returns
`idempotency_conflict`. Journals and results are retained with the board; there is
no automatic expiry in this release.

Write results contain the resulting task, `affectedTaskIds`, and `operationId`.
Task title changes clear link attachments and trigger enrichment after commitment;
other edits preserve existing attachments. Notes and whiteboards are retained.
Completing a task completes its current descendants and hides their editors using
the existing application behavior. Repeated completion is a successful no-op.
Other changes to completed tasks are rejected.

Explicit dates must be valid `YYYY-MM-DD` dates. Date-sensitive tools use UTC by
default and accept an IANA `timezone`, for example `Europe/London`. Today is a
date-based view, Inbox is virtual, and custom lanes are persisted. Existing legacy
date strings remain readable. Newly assigned Today dates include the year.

Creation defaults to Inbox. Its placement follows the browser's view semantics:
Today assigns today's date, and Inbox does not accept a date that would place the
task in Today. A parent must be active and in the destination view; nested tasks
inherit its placement. An explicit date can be supplied during creation.
`update_task` preserves omitted fields and clears a date with `date: null`.

`move_task.destination` is `{ viewId, edge: "append" }` or
`{ viewId, taskId, edge: "before" | "after" | "nest" }`. A move includes active
descendants. Moving to Inbox clears lane and date; moving to Today assigns today's
full date; moving to a custom lane preserves the date. Nesting inherits parent
placement. `sourceViewId` can select the source when a dated custom-lane task also
appears in Today. Cycles and missing or completed destinations are rejected.

## OAuth and browser clients

Discovery is available at `/.well-known/oauth-protected-resource/mcp` and
`/.well-known/oauth-authorization-server/api/auth` (root aliases also exist).
The issuer is `https://sdqst.app/api/auth`; the resource/audience is
`https://sdqst.app/mcp`. Dynamic registration is supported at
`/api/auth/oauth2/register`. Use authorization code with PKCE S256, request the MCP
resource, and submit token/refresh/revocation requests as form-encoded data.
Native clients with HTTP loopback callbacks must register `application_type:
"native"`. Web callbacks require HTTPS. Redirects are validated by the provider
against the registered URIs, including its native loopback rules.

Access tokens are opaque and validated against server storage on each request.
Revoking a connection atomically deletes that user's access tokens, refresh tokens,
and consent for the client. The integration does not accept cookie sessions as
MCP credentials. Missing/invalid credentials produce an OAuth challenge; denied
writes return an insufficient-scope challenge. Sender-constrained tokens are not
accepted by this Bearer-only endpoint.

Requests without Origin are supported for native clients. Set
`MCP_ALLOWED_ORIGINS` to a comma-separated list of exact origins for browser MCP
clients. The application origin is allowed automatically. This CORS configuration
is separate from Better Auth's trusted login origins and grants no cookie access.
The endpoint uses stateless JSON responses, with no SSE stream, prompts, resources,
subscriptions, or legacy transport. Recurrence, lane mutations, note/whiteboard
editing, and local stdio are outside this release.

## Deployment and recovery

MCP and its OAuth endpoints are always available; no feature flag is required.

1. Apply the additive D1 migrations before deploying: `bun run db:migrate:remote`.
2. Configure any browser origins and deploy with `bun run deploy`.
3. Verify discovery and a complete OAuth connection before announcing availability.

If a deployment needs to be rolled back, retain the OAuth tables and board data.

MCP and browser commits, reads, and enrichment persistence share a per-board
serialization queue. Each MCP command durably records its fixed IDs, prepared
mutations, and original result before application. Interrupted commands replay
those mutations before further board work is admitted. Recovery broadcasts a full
snapshot, covering a crash after persistence but before notification. Enrichment
starts after commitment and is retried on board initialization when still needed.

Structured `mcp.tool` telemetry records tool name, operation ID, duration, outcome,
and replay status. It excludes credentials and task content.

## Validation and references

`bun run test` covers domain behavior, stateless protocol, auth challenges,
provider OTP/PKCE/consent/refresh/revocation, and journal failure recovery.
`bun run test:e2e e2e/mcp.e2e.ts` uses local D1 and Durable Objects, an SDK client,
two browser clients, offline reconnection, and cross-user isolation.

Run `MCP_INSPECTOR_SMOKE=1 bun run test:e2e e2e/mcp.e2e.ts` to also verify
tool discovery using Inspector 2.5.0 with the locally issued OAuth token. Its local
settings are isolated and removed afterward.

For a manual Inspector smoke test, launch MCP Inspector, choose Streamable HTTP,
enter the endpoint, and complete its OAuth flow. List tools, create a task with a
new key, repeat the call with that key, observe the browser board, and revoke the
connection. Local validation does not deploy production migrations or exercise an
external hosted client's approval UI.

Implementation baseline: Context7 `/modelcontextprotocol/typescript-sdk/v1.29.0`,
requested **1.29.0**, and `/better-auth/better-auth`, requested **1.7.2**. Context7's
Better Auth result was current rather than versioned, so implementation was checked
against the installed **@better-auth/oauth-provider 1.7.2** types and source. The
SDK and provider are pinned to those versions. See the
[SDK transport](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.29.0/src/server/webStandardStreamableHttp.ts)
and [OAuth provider documentation](https://better-auth.com/docs/plugins/oauth-provider).
