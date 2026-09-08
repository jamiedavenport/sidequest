# Application health

Effect 4.0.0-rc.112 owns application logs, traces and metrics. The Worker, TanStack server functions, Board RPC/WebSocket events, provider calls and scheduled Board work carry explicit trace context. Each invocation creates its own metric registry and exporter scope. Framework Promise callbacks bridge through AsyncLocalStorage; nested Effects restore their parent span. Nothing stores a mutable current request globally.

Production export is **enabled and deployed**. Cloudflare Worker version `5fe8c33c-85df-47ae-aa6c-6145a1260b7c` was deployed on 8 September 2026. Dataset and credential setup is reported complete by the owner. Local/E2E runs export no data to Axiom and print sanitized records to the console. Named Effect spans provide operation summaries even when production head sampling excludes their trace. HTTP, RPC, domain, integration, storage, browser, background and internal categories must be queried separately. Internal helper spans are diagnostic detail, not an availability denominator.

The browser queue is memory-only (100 records, five-minute expiry); batches contain up to 20 records, flush every five seconds or at the threshold, and attempt a page-hide flush. The server accepts at most 64 KiB and 50 records, requires the same origin and JSON content type, and applies a Cloudflare rate limit of 30 batches/minute/IP. Account identity comes from the session. Authentication session IDs are never telemetry identifiers. Browser reports are best effort and must not supply operational denominators.

Logs and attributes use an explicit allowlist. Raw messages, exception causes, URLs, signed queries, SQL parameters, provider payloads, MCP arguments/results and board content are discarded. Errors retain typed tags and operation fingerprints; browser fingerprints hash the error class and source-frame locations, never the message. Automatic HTTP span attributes and events are filtered. Production application records are exported directly. Cloudflare platform failures and sanitized exporter failure/drop diagnostics are inspected manually in the Cloudflare dashboard. No native Axiom destination is configured.

All signals use Protobuf. Metrics use delta counters/histograms with isolated registries. Duration boundaries are 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10 and 30 seconds. Metric dimensions exclude accounts, boards, transactions, reporting sessions and trace IDs. Production traces use a deterministic 10% decision from the trace ID; incoming sampled flags and baggage cannot override it. Local/E2E uses 100% sampling.

Exporters flush on scope closure, which awaits in-flight exports. Export calls have 750 ms deadlines; exporter finalizers have 900 ms deadlines; total shutdown has a three-second bound. Records and spans are capped per invocation and drops emit sanitized console diagnostics without recursively exporting them. Streaming scopes remain open until EOF or cancellation. WebSocket upgrades preserve the original response. Background work owns its scope and starts a linked trace; the existing MCP journal stores optional producer context and creation time without migrating older entries.

## Setup and rollout status

The owner reports the remaining manual setup complete. The readability review and cleanup are complete, and the Worker is deployed. Axiom uses three datasets: `sidequest-logs` (Events, target retention 14 days), `sidequest-traces` (Events, 7 days) and `sidequest-metrics` (Metrics, 30 days), in **EU Central 1 (AWS)**. Retention targets remain subject to account limits. The Worker uses an ingest-only `AXIOM_TOKEN` scoped to those three datasets and `AXIOM_ENDPOINT=https://eu-central-1.aws.edge.axiom.co`.

The **Sidequest health email** notifier has ID `5BhWpqzKe9MvSJgwDV` and recipient `x@jxd.dev` in the [Axiom console](https://app.axiom.co). Live log, trace and metric ingestion and all dashboard/monitor queries were verified on 8 September 2026. See [validation evidence](validation.md) for the notification test and remaining verification limits.

Platform log export is omitted to fit the current account plan. Inspect platform failures and exporter failures/drops manually in Cloudflare's Worker dashboard; logs remain enabled with `invocation_logs=false`. There is no external uptime checker, readiness endpoint or missing-probe alert. Application health reports success rates from observed requests; it does not independently detect outages or missing telemetry during quiet periods.

The five dashboards and three enabled monitors below are installed. The [resource inventory](resources.json) records their IDs, thresholds and notification settings. [Dashboard definitions](dashboards.json) contain the validated APL/MPL queries and four filters; [monitor definitions](monitors.json) contain the full deployed configurations. [queries.apl](queries.apl) provides the same monitor queries for ad-hoc diagnosis. Logs use flattened `attributes.*` fields; fields absent from healthy traffic use `column_ifexists` defaults. Metrics use delta aggregation and seconds.

## Dashboards and monitors

Open the [Axiom console](https://app.axiom.co), select the connected organization, then open **Dashboards** and search **Sidequest**. The connector does not expose the organization URL, so this inventory records exact resource IDs instead of guessing deep links.

| Dashboard                        | UID                            | Coverage                                                                                           |
| -------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Sidequest application health     | `sidequest-application-health` | Request success, traffic, failure rates, latency, affected accounts, RPC outcomes and error traces |
| Sidequest board and offline sync | `sidequest-board-sync`         | Snapshot, acknowledgement and queue latency; persistence, storage, broadcast and pending edits     |
| Sidequest integrations and MCP   | `sidequest-integrations-mcp`   | Providers, rate limits, webhooks, billing, GitHub, MCP and background work                         |
| Sidequest browser health         | `sidequest-browser-health`     | Error fingerprints, storage/sync failures, reporting coverage and consented Web Vitals             |
| Sidequest telemetry health       | `sidequest-telemetry-health`   | Log/metric volume, sampling, recent correlations and last event by component                       |

All dashboards default to production and the last hour, refresh every minute, and filter by environment, release, component and operation. Forty data panels use unsampled logs for rates and diagnostic detail, with delta metrics for duration/Web Vitals and volume. Empty panels can mean that no matching events have arrived in the selected window.

The [Personal plan permits three monitors](https://axiom.co/docs/reference/limits). Eight alert conditions are grouped into three monitors, retaining `rule`, operation, provider, release and error class in their result groups. HTTP and RPC denominators stay separate.

| Monitor                                | ID                   | Conditions                                                                                                                                                                                    |
| -------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidequest critical data and billing    | `EABpmImCSNDFPeXjKZ` | Any unexpected board persistence/migration/recovery failure or signature-verified billing processing failure                                                                                  |
| Sidequest application and integrations | `EJnTcuZAhXqtqMrbAh` | HTTP/RPC: at least 5 failures and over 5% in 5 minutes; providers: at least 5 and over 10% in 10 minutes; interactive p95 over 2 seconds with at least 100 operations in 10 minutes           |
| Sidequest browser and sync             | `Hp7pHNFHWZXUvXvJe6` | At least 5 online ack timeouts and over 5% in 10 minutes; authorized pending edits older than 5 minutes on both latest reports; same browser fingerprint in at least 3 sessions in 15 minutes |

Monitors evaluate every minute and exclude the latest two minutes for ingestion. They notify the existing email destination on trigger and recovery; `notifyEveryRun=false` avoids per-minute repeats. An exact 30-minute repeat interval is not exposed by the connected API and has not been configured. No-data alerts are disabled because there is no scheduled probe or heartbeat.

Dashboard panels retain their queries. Creating additional standalone saved queries is optional: the connector can read saved queries but cannot create them. In the console, open a panel's query and save it if a separate shortcut is useful.

`TELEMETRY_ENABLED=true` and `TELEMETRY_ENVIRONMENT=production` remain set in `wrangler.jsonc`; localhost and E2E are excluded at runtime. The build embeds the Git SHA; `TELEMETRY_RELEASE` can override it for a controlled release. Keep server and browser releases consistent. Updating Axiom dashboards or monitors does not require a Worker deployment.

Pending-work observations include count, age, online state and retry count. For non-empty online outboxes the ingestion handler checks current session and billing access on the server and adds `canWrite` only when that check succeeds. The stuck-edits alert requires `canWrite=true` on both consecutive observations; missing authorization evidence is not treated as a confirmed stuck edit.

To open a cross-boundary trace, use **Sidequest telemetry health → Recent correlations**, select a `trace_id`, and choose **Find trace in another dataset → sidequest-traces**. The native trace schema is present. One verified browser → WebSocket → Durable Object → D1 trace is `fa40d38086e941fe8e3248e605da34c3` at `2026-09-08T21:26:15.506Z`, containing 24 spans. Expand the time window to include it. Unsampled operations still have log correlation IDs but no complete waterfall.

## Smoke and incident response

After deployment, sign in using the existing authenticated account flow, open two board tabs/devices, create and complete a harmless test task, reload, go offline and replay an edit, then undo/delete the test content. Verify browser → RPC and browser → mutation → DO → acknowledgement/application correlation, sampling flags, release, account and transaction identifiers in Axiom. Use the existing MCP OAuth flow to verify a read and an idempotent write. Use signature-verified provider test deliveries for webhooks; never invent authentication headers or send unverified events to reconciliation. Do not seed E2E users in production.

For persistence/recovery failures, inspect `BoardObject.persist`, migration and journal summaries for the account and trace. Preserve the existing durable journal/outbox; do not clear pending work to silence an alert. For ack timeouts, distinguish offline deferral, authentication loss, billing rejection, authorization-check unavailability and server delivery failure before retrying. A server send is not proof of application: use the browser application record and transaction/change ID.

For billing events, use the verified event/delivery ID and reconciliation stage. Retain provider retry behavior; do not manually grant access. For provider 429s, inspect rate-limit metadata and existing retry behavior. For exporter failures, check token scopes, dataset kinds, regional endpoint and the Cloudflare Worker dashboard; application success must remain independent of telemetry.

**Kill switch:** set `TELEMETRY_ENABLED` to `false` in `wrangler.jsonc` and run `bun run deploy`, or edit that variable in the Cloudflare Worker settings and deploy the resulting version. Confirm the new Worker version is active. To restore, set the variable to `true` and deploy after fixing ingestion.

Review CPU, subrequests, export volume and diagnostic drops after 48 hours. Review thresholds and noise after seven days. Check the retained logs/traces/metrics against the 14/7/30-day targets and record any account-plan limits.

## References

Context7: `/websites/axiom_co`; `/llmstxt/developers_cloudflare_workers_llms_txt`; `/websites/tanstack_start_framework_react` with installed Start **1.168.49**. Effect reference version `/effect-ts/effect/effect_4.0.0-rc.112` was verified directly against installed `effect/AGENTS.md`, `ai-docs/src/08_observability`, `OtlpExporter.ts`, `OtlpTracer.ts`, `OtlpLogger.ts`, `OtlpMetrics.ts`, `Metric.ts` and `Tracer.ts`. Effect's `Flusher.flush` alone does not await exports already underway; scope closure does. Web Vitals uses the installed **6.2.1** standard implementation and declarations; no attribution/DOM content is sent.

Primary references: [Axiom OTLP](https://axiom.co/docs/send-data/opentelemetry), [edge deployments](https://axiom.co/docs/reference/edge-deployments), [email notifier API](https://axiom.co/docs/restapi/endpoints/createNotifier), [Cloudflare trace limitations](https://developers.cloudflare.com/workers/observability/traces/custom-spans/).
