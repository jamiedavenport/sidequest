// Validated flattened OTLP log schema. Dashboard APL/MPL queries and filters are in dashboards.json.
// Three grouped monitors cover the planned conditions within the free-plan limit.

// Sidequest critical data and billing
['sidequest-logs']
| where _time between (ago(3m) .. ago(2m))
| where ['attributes.environment'] == 'production'
| extend operation=tostring(['attributes.operation']), category=tostring(['attributes.category']), component=tostring(['attributes.component']), release=tostring(['attributes.release']), outcome=tostring(['attributes.outcome']), event=tostring(['attributes.event']), account=tostring(['attributes.accountId']), session=tostring(['attributes.reportingSession']), seconds=todouble(['attributes.durationSeconds']), milliseconds=todouble(['attributes.durationMs']), provider=tostring(column_ifexists('attributes.provider', '')), fingerprint=tostring(column_ifexists('attributes.fingerprint', '')), errorClass=tostring(column_ifexists('attributes.errorTag', '')), stage=tostring(column_ifexists('attributes.failureStage', '')), eventId=tostring(column_ifexists('attributes.eventId', '')), canWrite=tobool(column_ifexists('attributes.canWrite', false)), ageMs=todouble(['attributes.pendingAgeMs']), online=tobool(['attributes.online'])
| where body == 'operation.completed'
| where outcome == 'unexpected_failure'
| where operation in ('BoardObject.persist','BoardObject.runMigrations','mcp.recoverCommand') or (operation == 'http.billingWebhook' and isnotempty(eventId))
| extend rule=iff(operation == 'http.billingWebhook', 'verified_billing_failure', 'persistence_or_recovery_failure')
| summarize value=count() by rule, operation, provider, release, errorClass

// Sidequest application and integrations
let application = ['sidequest-logs']
| where _time between (ago(7m) .. ago(2m))
| where ['attributes.environment'] == 'production'
| extend operation=tostring(['attributes.operation']), category=tostring(['attributes.category']), component=tostring(['attributes.component']), release=tostring(['attributes.release']), outcome=tostring(['attributes.outcome']), event=tostring(['attributes.event']), account=tostring(['attributes.accountId']), session=tostring(['attributes.reportingSession']), seconds=todouble(['attributes.durationSeconds']), milliseconds=todouble(['attributes.durationMs']), provider=tostring(column_ifexists('attributes.provider', '')), fingerprint=tostring(column_ifexists('attributes.fingerprint', '')), errorClass=tostring(column_ifexists('attributes.errorTag', '')), stage=tostring(column_ifexists('attributes.failureStage', '')), eventId=tostring(column_ifexists('attributes.eventId', '')), canWrite=tobool(column_ifexists('attributes.canWrite', false)), ageMs=todouble(['attributes.pendingAgeMs']), online=tobool(['attributes.online'])
| where body == 'operation.completed'
| where category in ('http','rpc') and operation != 'http.telemetry'
| summarize total=count(), failures=countif(outcome == 'unexpected_failure') by category, operation, provider, release
| project rule=strcat('application_',category), operation, provider, release, errorClass='unexpected_failure', value=toint(failures >= 5 and todouble(failures) / total > 0.05);
let integrations = ['sidequest-logs']
| where _time between (ago(12m) .. ago(2m))
| where ['attributes.environment'] == 'production'
| extend operation=tostring(['attributes.operation']), category=tostring(['attributes.category']), component=tostring(['attributes.component']), release=tostring(['attributes.release']), outcome=tostring(['attributes.outcome']), event=tostring(['attributes.event']), account=tostring(['attributes.accountId']), session=tostring(['attributes.reportingSession']), seconds=todouble(['attributes.durationSeconds']), milliseconds=todouble(['attributes.durationMs']), provider=tostring(column_ifexists('attributes.provider', '')), fingerprint=tostring(column_ifexists('attributes.fingerprint', '')), errorClass=tostring(column_ifexists('attributes.errorTag', '')), stage=tostring(column_ifexists('attributes.failureStage', '')), eventId=tostring(column_ifexists('attributes.eventId', '')), canWrite=tobool(column_ifexists('attributes.canWrite', false)), ageMs=todouble(['attributes.pendingAgeMs']), online=tobool(['attributes.online'])
| where body == 'operation.completed'
| where category == 'integration'
| summarize total=count(), failures=countif(outcome == 'unexpected_failure') by operation, provider, release
| project rule='integration_failure_rate', operation, provider, release, errorClass='unexpected_failure', value=toint(failures >= 5 and todouble(failures) / total > 0.1);
let latency = ['sidequest-logs']
| where _time between (ago(12m) .. ago(2m))
| where ['attributes.environment'] == 'production'
| extend operation=tostring(['attributes.operation']), category=tostring(['attributes.category']), component=tostring(['attributes.component']), release=tostring(['attributes.release']), outcome=tostring(['attributes.outcome']), event=tostring(['attributes.event']), account=tostring(['attributes.accountId']), session=tostring(['attributes.reportingSession']), seconds=todouble(['attributes.durationSeconds']), milliseconds=todouble(['attributes.durationMs']), provider=tostring(column_ifexists('attributes.provider', '')), fingerprint=tostring(column_ifexists('attributes.fingerprint', '')), errorClass=tostring(column_ifexists('attributes.errorTag', '')), stage=tostring(column_ifexists('attributes.failureStage', '')), eventId=tostring(column_ifexists('attributes.eventId', '')), canWrite=tobool(column_ifexists('attributes.canWrite', false)), ageMs=todouble(['attributes.pendingAgeMs']), online=tobool(['attributes.online'])
| where body == 'operation.completed'
| where category in ('http','rpc') and operation != 'http.telemetry'
| summarize total=count(), p95=percentile(seconds,95) by category, operation, provider, release
| project rule=strcat('latency_',category), operation, provider, release, errorClass='slow_operation', value=toint(total >= 100 and p95 > 2);
union application, integrations, latency
| summarize value=max(value) by rule, operation, provider, release, errorClass

// Sidequest browser and sync
let acknowledgements = ['sidequest-logs']
| where _time between (ago(12m) .. ago(2m))
| where ['attributes.environment'] == 'production'
| extend operation=tostring(['attributes.operation']), category=tostring(['attributes.category']), component=tostring(['attributes.component']), release=tostring(['attributes.release']), outcome=tostring(['attributes.outcome']), event=tostring(['attributes.event']), account=tostring(['attributes.accountId']), session=tostring(['attributes.reportingSession']), seconds=todouble(['attributes.durationSeconds']), milliseconds=todouble(['attributes.durationMs']), provider=tostring(column_ifexists('attributes.provider', '')), fingerprint=tostring(column_ifexists('attributes.fingerprint', '')), errorClass=tostring(column_ifexists('attributes.errorTag', '')), stage=tostring(column_ifexists('attributes.failureStage', '')), eventId=tostring(column_ifexists('attributes.eventId', '')), canWrite=tobool(column_ifexists('attributes.canWrite', false)), ageMs=todouble(['attributes.pendingAgeMs']), online=tobool(['attributes.online'])
| where body == 'browser.health'
| where online and event in ('acknowledgement_applied','acknowledgement_timeout','acknowledgement_error')
| summarize total=count(), timeouts=countif(event == 'acknowledgement_timeout') by release
| project rule='online_ack_timeouts', operation='sync.acknowledgement', provider='', release, errorClass='timeout', value=toint(timeouts >= 5 and todouble(timeouts) / total > 0.05);
let pending = ['sidequest-logs']
| where _time between (ago(12m) .. ago(2m))
| where ['attributes.environment'] == 'production'
| extend operation=tostring(['attributes.operation']), category=tostring(['attributes.category']), component=tostring(['attributes.component']), release=tostring(['attributes.release']), outcome=tostring(['attributes.outcome']), event=tostring(['attributes.event']), account=tostring(['attributes.accountId']), session=tostring(['attributes.reportingSession']), seconds=todouble(['attributes.durationSeconds']), milliseconds=todouble(['attributes.durationMs']), provider=tostring(column_ifexists('attributes.provider', '')), fingerprint=tostring(column_ifexists('attributes.fingerprint', '')), errorClass=tostring(column_ifexists('attributes.errorTag', '')), stage=tostring(column_ifexists('attributes.failureStage', '')), eventId=tostring(column_ifexists('attributes.eventId', '')), canWrite=tobool(column_ifexists('attributes.canWrite', false)), ageMs=todouble(['attributes.pendingAgeMs']), online=tobool(['attributes.online'])
| where body == 'browser.health'
| where event == 'outbox_observation' and isnotempty(account) and isnotempty(session)
| extend stuck=online and canWrite and ['attributes.pendingCount'] > 0 and ageMs > 300000
| order by _time desc
| summarize observations=make_list(stuck, 2) by account, session, release
| project rule='stuck_authorized_edits', operation='sync.outbox', provider='', release, errorClass='pending_over_5m', value=toint(array_length(observations) == 2 and observations[0] == true and observations[1] == true);
let regressions = ['sidequest-logs']
| where _time between (ago(17m) .. ago(2m))
| where ['attributes.environment'] == 'production'
| extend operation=tostring(['attributes.operation']), category=tostring(['attributes.category']), component=tostring(['attributes.component']), release=tostring(['attributes.release']), outcome=tostring(['attributes.outcome']), event=tostring(['attributes.event']), account=tostring(['attributes.accountId']), session=tostring(['attributes.reportingSession']), seconds=todouble(['attributes.durationSeconds']), milliseconds=todouble(['attributes.durationMs']), provider=tostring(column_ifexists('attributes.provider', '')), fingerprint=tostring(column_ifexists('attributes.fingerprint', '')), errorClass=tostring(column_ifexists('attributes.errorTag', '')), stage=tostring(column_ifexists('attributes.failureStage', '')), eventId=tostring(column_ifexists('attributes.eventId', '')), canWrite=tobool(column_ifexists('attributes.canWrite', false)), ageMs=todouble(['attributes.pendingAgeMs']), online=tobool(['attributes.online'])
| where body == 'browser.health'
| where event in ('global_error','render_error','unhandled_rejection') and isnotempty(fingerprint)
| summarize sessions=dcount(session) by fingerprint, ['attributes.clientRelease']
| project rule='browser_error_regression', operation='browser.errors', provider='', release=tostring(['attributes.clientRelease']), errorClass=fingerprint, value=toint(sessions >= 3);
union acknowledgements, pending, regressions
| summarize value=max(value) by rule, operation, provider, release, errorClass
