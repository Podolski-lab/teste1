---
title: 'Ler o Google Calendar e detectar tarefas do dia'
type: 'feature'
created: '2026-09-25'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'd574f0fdbc7189e9bfd5ecde05b770a87b1c0728'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing yet detects which of today's calendar events are configured tasks. Without this, no reminder or checkpoint (Stories 1.4/1.5) has anything to fire against.

**Approach:** Add a scheduled "Poller" Lambda (EventBridge, `rate(10 minutes)`) that reads today's timed events from the user's Google Calendar, looks each one up in `PillarConfig` by its exact title, and creates a `TaskInstance` (new `TaskInstances` table) for each match — idempotently, so re-polling the same day never duplicates. Google auth is a service account (its key never touches this session, matching AD-6's pattern for AWS credentials) that the user creates once and shares their calendar with; the calendar ID and IANA time zone are required `sam deploy --guided` parameters, not guessed here.

## Boundaries & Constraints

**Always:** `src/handlers/poller.ts` contains no matching/freezing/shape-building logic — that's a pure function in `src/domain/` (AD-2); `task_id` = `{calendar_event_id}#{YYYY-MM-DD}`; `pillar`/`purpose`/`task_title` are copied from `PillarConfig`/the event at creation and never re-read live afterward (AD-3); creating a `TaskInstance` uses `PutItem` with `ConditionExpression: attribute_not_exists(task_id)` so a re-poll of an already-created task no-ops instead of duplicating (AD-3's spirit, extended to creation); `PillarConfig` is read-only from the Poller (AD-5); the Google service-account key is a `NoEcho` SAM parameter → Lambda env var, and the calendar ID / time zone are required parameters with no default (the user supplies real values at their own deploy time); `TaskInstances` gets `DeletionPolicy`/`UpdateReplacePolicy: Retain` (same reasoning as `PillarConfig` in Story 1.2 — accumulated data, costly to lose).

**Never:** no reminder/checkpoint-trigger logic yet (Stories 1.4/1.5); no handling of `status = reagendado` items (AD-7's second Poller responsibility) — nothing can produce one before Story 1.6 exists, so that branch is dead code until then; no writes back to Google Calendar; no all-day events (no `dateTime`) — v1 assumption is timed events only; no AWS or Google credentials requested, stored, or used in this session.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Matched task | Timed event today, title exactly matches a `PillarConfig` entry, no existing `TaskInstance` | `TaskInstance` created, `status: pendente`, pillar/purpose/task_title frozen from the match | N/A |
| No match | Timed event today, title has no `PillarConfig` entry | No `TaskInstance` created | N/A |
| Re-poll | Same event polled again, `TaskInstance` already exists for that `task_id` | No duplicate; existing item untouched | `ConditionalCheckFailedException` caught, not thrown |
| All-day event | Event has `start.date` but no `start.dateTime` | Skipped, no `TaskInstance` created | N/A |

</frozen-after-approval>

## Code Map

- `template.yaml` -- add `TaskInstancesTable` (on-demand, PK `task_id` string, `DeletionPolicy`/`UpdateReplacePolicy: Retain`); `PollerFunction` (`AWS::Serverless::Function`, esbuild entry `src/handlers/poller.ts`, `Events.Poll.Type: Schedule`, `Schedule: rate(10 minutes)`, `DynamoDBReadPolicy` on `PillarConfigTable`, `DynamoDBWritePolicy` on `TaskInstancesTable`); three new `Parameters` (`GoogleServiceAccountKeyBase64` `NoEcho: true`, `GoogleCalendarId`, `UserTimeZone` — none with a `Default`), passed to `PollerFunction` as env vars. Leave `SkillHandlerFunction`/`PillarConfigTable` untouched.
- `src/domain/taskDetection.ts` -- new. `buildTaskInstanceIfMatched(event, pillarConfig, todayDate)`: pure function, no imports outside `src/domain/`. Returns `undefined` for an all-day event or when `pillarConfig` is `undefined`; otherwise returns the frozen `TaskInstance` shape (`task_id`, `calendar_event_id`, `date`, `pillar`, `purpose`, `task_title`, `status: 'pendente'`, `checkpoint_attempts: 0`, `reminder_at` = event start, `checkpoint_at` = event end).
- `src/infra/googleCalendarClient.ts` -- new. Wraps `googleapis`' `calendar_v3` client, JWT service-account auth built from the base64-decoded key env var. `listTimedEventsForDay(calendarId, date, timeZone): Promise<CalendarEvent[]>`.
- `src/infra/dynamoTaskInstanceRepository.ts` -- new. `createTaskInstance(docClient, item): Promise<'created' | 'already_exists'>` — `PutCommand` with `ConditionExpression: 'attribute_not_exists(task_id)'`, catches `ConditionalCheckFailedException` and returns `'already_exists'` instead of throwing (mirrors Story 1.2's tested-via-mock-client pattern).
- `src/infra/dynamoPillarConfigReader.ts` -- new, read-only counterpart to Story 1.2's write-only CLI. `getPillarConfigForEvent(docClient, eventTitle): Promise<PillarConfigEntry | undefined>` — `GetCommand` keyed on the trimmed title (PillarConfig's PK is the literal pattern; Story 1.2 explicitly deferred "how the Poller matches" to this story — resolved here as an exact key lookup, no fuzzy/substring matching).
- `src/handlers/poller.ts` -- new scheduled entrypoint. Reads env vars, calls the Calendar client for today (in `USER_TIMEZONE`), then per event: `getPillarConfigForEvent` → `buildTaskInstanceIfMatched` → `createTaskInstance` if defined. Structured JSON log per event outcome (created/no-match/already-exists/all-day-skipped).
- `package.json` -- add `googleapis` (dep; bundles `google-auth-library` for the service-account JWT flow).
- `README.md` -- new "6. Detectar tarefas do dia (Poller)" section: Google Cloud Console steps (enable Calendar API, create a service account, download its JSON key, share the user's personal calendar with the service account's email as "See all event details"), base64-encoding the key, and the three `sam deploy --guided` parameters.
- `test/domain/taskDetection.test.ts`, `test/infra/dynamoTaskInstanceRepository.test.ts` -- new; cover all four I/O matrix rows (the repository test mocks `DynamoDBDocumentClient.send`, no live AWS).

## Tasks & Acceptance

**Execution:**
- [x] `template.yaml` -- `TaskInstancesTable`, `PollerFunction`, schedule, parameters, IAM -- satisfies AC1
- [x] `src/domain/taskDetection.ts` -- pure matching/freezing/shape logic -- satisfies AC2/AC3, AD-1/AD-2
- [x] `src/infra/googleCalendarClient.ts` -- service-account auth, list today's timed events -- foundation for the Poller
- [x] `src/infra/dynamoPillarConfigReader.ts`, `src/infra/dynamoTaskInstanceRepository.ts` -- read/write adapters -- satisfies AC2/AC3
- [x] `src/handlers/poller.ts` -- orchestrates the above, no domain logic inline -- satisfies AC1's Lambda, AD-2
- [x] `test/domain/taskDetection.test.ts`, `test/infra/dynamoTaskInstanceRepository.test.ts` -- cover all 4 I/O matrix rows -- Matrix Test Audit
- [x] `README.md` -- Google Cloud Console + deploy-parameter setup steps -- closes the gap between `sam deploy` and a working Poller

**Acceptance Criteria:**
- Given the updated `template.yaml`, when the user runs `sam deploy`, then `TaskInstances`, `PollerFunction`, and its EventBridge schedule are created/updated, with `SkillHandlerFunction`/`PillarConfigTable` unaffected
- Given a task configured in `PillarConfig` with a calendar event today at 14h, when the Poller runs, then a `TaskInstance` is created with `status: pendente` and `pillar`/`purpose`/`task_title` frozen at creation
- Given a calendar event with no matching `PillarConfig` entry, when the Poller runs, then no `TaskInstance` is created for it

## Implementation Notes

- `googleapis` was the only new dependency added; the JWT service-account client is accessed via `google.auth.JWT` (re-exported by `googleapis`) rather than importing `google-auth-library` directly, avoiding a phantom dependency.
- Time-zone day-boundary conversion uses `Intl.DateTimeFormat` offset math (two-iteration correction near DST transitions) instead of a date library, keeping the dependency footprint minimal.
- `googleCalendarClient.ts` has no dedicated unit test — it's Google-API-facing infra with no pure logic of its own beyond the offset math, exercised indirectly via `sam build`'s bundling step; matches the spec's Code Map, which only listed domain/repository tests.
- Verified locally: `npm run build` (0 errors), `npm test` (31/31 pass across 5 files, 9 new), `sam validate --lint` (valid), `sam build` (extra check — esbuild bundles `googleapis` cleanly for both Lambdas), and confirmed via diff that `SkillHandlerFunction`/`PillarConfigTable` are unchanged.
- Not verified (requires the user's own Google/AWS accounts, per AD-6): actual service-account creation, calendar sharing, `sam deploy`, or a live Poller run against real Calendar data.

## Spec Change Log

## Review Triage Log

- **[blind-hunter + edge-case-hunter, same root cause] `poller.ts`'s `handler()` has no try/catch anywhere: an unhandled Calendar API failure (invalid/expired key, calendar not shared, network error), an invalid `USER_TIMEZONE`, invalid key JSON, or a single event's DynamoDB call throwing mid-loop all crash the entire invocation with only a generic Lambda error in CloudWatch — no structured `Poller.failed` log, and any remaining events in that poll cycle are abandoned.** Verdict: `medium`. Confirmed by reading `handler()` — zero try/catch. Real and plausible (network blips, an unshared calendar, transient DynamoDB throttling), and everything downstream (Stories 1.4/1.5) depends on this Lambda's output existing. Routes to `patch` (wrap the per-event body in try/catch — log `Poller.event.error` with the event id, `continue`, don't abort the cycle; wrap the top-level Calendar-fetch/timezone resolution in try/catch that logs a structured `Poller.failed` entry with the error before rethrowing).
- **[blind-hunter] `PollerFunction` inherits the 8-second `Globals.Function.Timeout` sized for the low-latency Alexa handler, not a scheduled batch job doing a Calendar API call plus a sequential per-event DynamoDB loop.** Verdict: `medium`. Real risk of a mid-loop timeout on a day with several tasks (idempotent creation means a timeout is recoverable on the next poll, not corrupting, but still delays the whole day's detection). Routes to `patch` (override `Timeout` on `PollerFunction` specifically, e.g. to 60s).
- **[verification-gap, pre-verified, disposition: patch + blind-hunter, same root cause] `getPillarConfigForEvent` (`src/infra/dynamoPillarConfigReader.ts`) has no test — a broken table/key/attribute mapping would make the Poller silently match nothing, ever, with `npm test` staying green.** Routes to `patch` (add `test/infra/dynamoPillarConfigReader.test.ts`, mocking `DynamoDBDocumentClient.send`, same pattern as the sibling repository test).
- **[verification-gap, pre-verified, disposition: patch] `googleCalendarClient.ts`'s day-boundary time-zone math (`zonedTimeToUtc`, `nextCalendarDate`, the DST-correction iteration) has no test anywhere — a sign error or off-by-one would silently shift the Poller's query window.** Routes to `patch` (export the pure functions and add `test/infra/googleCalendarClient.test.ts` covering a non-DST date and a DST-transition date).
- **[blind-hunter + edge-case-hunter, same root cause] `listTimedEventsForDay` doesn't loop on the Calendar API's `nextPageToken` — a day with more events than one page (default 250) would silently lose the remainder.** Verdict: `medium`. Confirmed — no pagination loop. Unlikely to trigger for a single personal calendar, but the consequence if it does (a real task's reminder/checkpoint never fires, with nothing to notice) is severe enough to outweigh the low likelihood. Routes to `patch` (loop on `response.data.nextPageToken`, accumulating pages).
- **[blind-hunter] `poller.ts` calls `getPillarConfigForEvent` for every event — including all-day ones — before checking whether it's all-day, wasting a DynamoDB read; the outcome log label also only checks `event.start.dateTime`, not `end.dateTime`, so a malformed event (start but no end) would be mislabeled `'no-match'` instead of `'all-day-skipped'` even though the domain function skips it the same way.** Verdict: `low`. Both confirmed by reading the loop body. Routes to `patch` (check `event.start.dateTime && event.end.dateTime` upfront; skip the lookup and log `'all-day-skipped'` directly when false).
- **[edge-case-hunter] `getPillarConfigForEvent` doesn't validate that a found item's `pillar`/`purpose` are actually strings before returning them — a manually corrupted `PillarConfig` item would silently produce a `TaskInstance` with `undefined` fields instead of being treated as "no match."** Verdict: `low`. Real defensive gap, unlikely trigger (only `associar-pilar.ts` writes this table, always with both fields) but cheap to guard. Routes to `patch` (typeof-check both fields, return `undefined` if either isn't a string).
- **[blind-hunter] `template.yaml` has no `Outputs` entry for `PollerFunction`'s ARN, unlike `SkillHandlerFunctionArn` for the existing Lambda.** Verdict: `low`. Real inconsistency, trivial fix. Routes to `patch` (add a matching `PollerFunctionArn` output).
- **[blind-hunter] README's new Poller section has no troubleshooting guidance (403/permission-denied if the calendar wasn't shared, a miscopied base64 key) and doesn't advise securing/deleting the downloaded JSON key file.** Verdict: `low`. Real documentation gap. Routes to `patch` (short troubleshooting subsection + a one-line reminder about the key file).
- **[blind-hunter] Service-account key stored as a plain (if `NoEcho`) Lambda environment variable rather than Secrets Manager/SSM `SecureString`.** Verdict: `false`. Considered trade-off, not a defect: the Architecture Spine's own Deferred section explicitly left "Secrets Manager ou variável de ambiente do Lambda" open as either being acceptable, and this is a single-user hobby AWS account — anyone with enough IAM access to read this function's env var (`lambda:GetFunctionConfiguration`) already has account-level access that Secrets Manager wouldn't meaningfully gate. Reasoning is documented in Design Notes.
- **[blind-hunter] The formal "Acceptance Criteria" section only restates 3 Given/When/Then scenarios, while the I/O & Edge-Case Matrix has 4 rows (re-poll/idempotency and all-day-skip aren't separately promoted to AC).** Verdict: `false`. Not a gap — the spec template explicitly instructs "AC covers system-level behaviors not captured by the I/O Matrix. Do not duplicate I/O scenarios here." The 3 ACs are epics.md's own literal acceptance criteria for this story; the matrix's other rows are edge cases by design, not omissions.
- **[blind-hunter] No CloudWatch alarm/DLQ configured for `PollerFunction`, so a later silent failure (key expiry, calendar unshared) would stop `TaskInstances` from being created with nothing to notify the user.** Verdict: `false`. Explicitly out of scope for this story: the Architecture Spine's Deferred section names exactly this ("CloudWatch Alarm no erro do Lambda do Poller... a implementar") and the epic's own story breakdown allocates it to a dedicated story — Story 1.7: "Monitoramento do Poller" — not to 1.3.

## Design Notes

Matching is a plain `GetItem` on the exact (trimmed) event title, not a domain-layer search over a fetched list: `PillarConfig`'s primary key already *is* the literal pattern (Story 1.2), so "does this event have a config" and "what is it" are the same lookup — no separate fuzzy-matching logic to write or to keep correct.

Google auth is a service account, not 3-legged OAuth: this backend has no HTTP-facing endpoint anywhere (Alexa talks to `SkillHandlerFunction` directly; the Poller is schedule-triggered) to receive an OAuth consent-screen redirect, so an interactive user-consent flow isn't buildable here at all. A service account whose key the user provides once, sharing their personal calendar with it, needs no redirect and no refresh-token lifecycle — it resolves the Architecture Spine's explicit "Deferred: armazenamento e refresh do token OAuth" item in favor of the option this architecture can actually support.

`USER_TIMEZONE` and `GOOGLE_CALENDAR_ID` are required deploy-time parameters (no default) rather than an assumption made in this session: getting either wrong has real correctness impact (wrong day boundary, wrong calendar), and unlike `us-east-1`/`PAY_PER_REQUEST` in earlier stories there's no single defensible default for a value that's inherently user-specific.

The service-account key is a `NoEcho` Lambda env var, not a Secrets Manager/SSM `SecureString` — reviewed and kept as-is (see Review Triage Log). The Architecture Spine's Deferred section explicitly left both options open, and in a single-user hobby AWS account, anyone with enough IAM access to read the env var (`lambda:GetFunctionConfiguration`) already has account-level access a secrets store wouldn't meaningfully gate.

## Verification

**Commands:**
- `npm run build` -- expected: TypeScript compiles with no errors
- `npm test` -- expected: all tests pass, including the new domain/infra tests
- `sam validate --lint` -- expected: `template.yaml` valid (no AWS credentials required)

**Manual checks (if no CLI):**
- Confirm `SkillHandlerFunction` and `PillarConfigTable` are unchanged in the diff.
