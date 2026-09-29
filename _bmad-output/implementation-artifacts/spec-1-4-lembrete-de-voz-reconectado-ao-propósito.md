---
title: 'Lembrete de voz reconectado ao propósito'
type: 'feature'
created: '2026-09-29'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '397d71b9f71e4f2eb54ebd7541a5c9e5b7d80697'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `TaskInstance` items exist (Story 1.3) but nothing fires a reminder or lets the user actually hear it. Without this, the whole daily accountability loop has no entry point.

**Approach:** Extend the Poller to detect `pendente` tasks whose `reminder_at` has arrived, transition each to `lembrete_enviado` (idempotent, `ConditionExpression`-gated — the transition succeeding is what authorizes firing the trigger, preventing a Lambda retry from firing twice), and fire the pre-registered `reminder-trigger` Custom Trigger via the Alexa Routines Trigger Instance API. On the Skill side, add a handler for the resulting Custom Task invocation that reads the `TaskInstance` and speaks a reminder that reconnects to pillar/purpose — never just the event title. Per the user's decision: build and test this against the skill's **development stage** first; do not certify/publish. Two pieces of the mechanism (Custom Trigger and Custom Task registration schemas) are Amazon's own "developer preview" and can't be fully verified from this session (no access to developer.amazon.com) — best-effort files are provided, flagged for the user to adjust against the current official docs during manual setup.

## Boundaries & Constraints

**Always:** the Poller fires `reminder-trigger` with payload `{ task_id }` only (AD-4); firing is gated behind `transitionTaskStatus(pendente → lembrete_enviado)` succeeding first — a failed/already-applied transition means skip firing, never fire on every poll; `transitionTaskStatus` is the only place any code writes `TaskInstance.status` (AD-3); reminder speech always names the pillar and purpose, never the raw `task_title` alone (UX rule); the Alexa Skill Messaging client ID/secret are `NoEcho` SAM parameters → Lambda env vars, never touching this session (AD-6 extended); the Trigger Instance API call targets the **development stage** endpoint by default (`ALEXA_TRIGGER_STAGE` env var, default `development`).

**Never:** no checkpoint logic yet (Story 1.5 owns `checkpoint-trigger` and the `aguardando_checkpoint`/`respondido`/`sem_resposta` transitions); no skill certification/publication performed or assumed in this session; no UNICAST delivery (would require a per-customer bearer token this session can't reliably source from documentation alone) — use MULTICAST, which needs no recipient and is operationally equivalent for a single-user skill.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reminder due | `TaskInstance.status = pendente`, `reminder_at <= now` | Status transitions to `lembrete_enviado`; `reminder-trigger` fired with `{task_id}` | N/A |
| Already sent (retry) | Same task polled again, already `lembrete_enviado` | `ConditionExpression` fails; trigger not fired again | `ConditionalCheckFailedException` caught, not thrown |
| Task invocation | Custom Task runs for a known `task_id` | Speech reconnects to pillar + purpose (never just `task_title`); `Tasks.CompleteTask` directive, `status: SUCCESSFUL` | N/A |
| Unknown task_id | Custom Task runs for a `task_id` with no `TaskInstance` | No speech built from missing data; `Tasks.CompleteTask` directive, `status: FAILED` | Logged, no crash |

</frozen-after-approval>

## Code Map

- `template.yaml` -- add `AlexaSkillMessagingClientId`/`AlexaSkillMessagingClientSecret` (`NoEcho`, no default) parameters, wired to `PollerFunction`'s env; no new table (reuses `TaskInstancesTable`).
- `src/domain/taskState.ts` -- new. `isReminderDue(task, nowIso)` (pure predicate); `PILLAR_DISPLAY_LABELS` (`saude`→`Saúde` etc., for natural speech); `buildReminderSpeech(task)` using the exact EXPERIENCE.md phrase template.
- `src/infra/dynamoTaskInstanceRepository.ts` -- extend (existing file, Story 1.3). Add `transitionTaskStatus(docClient, taskId, from, to)` (`UpdateCommand`, `ConditionExpression: '#status = :from'`, catches `ConditionalCheckFailedException` → `'already_transitioned'`); `findPendingTasksWithReminderDue(docClient, nowIso)` (`ScanCommand`+`FilterExpression` — table is small, a GSI is premature here); `getTaskInstance(docClient, taskId)` (`GetCommand`, used by the Skill-side handler).
- `src/infra/alexaTriggerClient.ts` -- new (matches the Architecture Spine's planned filename). `getAccessToken(clientId, clientSecret)` (LWA client-credentials grant, `POST https://api.amazon.com/auth/o2/token`, `scope=alexa::routines:triggerinstances:write`, native `fetch` — no new HTTP dependency); `fireTrigger(triggerName, parameters, accessToken, stage)` (`POST https://api.amazonalexa.com/v1/routines/triggerInstances[/stages/development]`, `delivery: 'MULTICAST'` body).
- `src/handlers/poller.ts` -- extend (Story 1.3). After the existing per-event detection loop, add a reminder-dispatch phase: `findPendingTasksWithReminderDue` → per task, try/catch (matching Story 1.3's established pattern): `transitionTaskStatus` → if transitioned, `getAccessToken` + `fireTrigger`; structured logs (`Poller.reminder.sent`/`already_sent`/`failed`).
- `src/handlers/skill.ts` -- extend (Story 1.1). New `ReminderTaskHandler`, registered **before** the existing `LaunchRequestHandler`: `canHandle` matches a `LaunchRequest` carrying a `task` object (confirmed present on `ask-sdk-model`'s `LaunchRequest.task?: {name, version, input}`); reads `task_id` from `task.input`, calls `getTaskInstance`, builds speech via the domain function, responds with `.speak(...)` plus an `interfaces.tasks.CompleteTaskDirective` (`type: 'Tasks.CompleteTask'`, `status: 'SUCCESSFUL'`, confirmed to exist in `ask-sdk-model`'s response `Directive` union) and `shouldEndSession: true`; missing `TaskInstance` → same directive with `status: 'FAILED'`, no speech.
- `skill-package/skill.json` -- add `apis.custom.tasks: [{ name: 'ReminderCheckIn', version: '1' }]` — best-effort; this session couldn't reach developer.amazon.com to confirm the exact current schema.
- `skill-package/taskDefinitions/reminderCheckIn.json` -- new, best-effort OpenAPI 3.0 draft (task input schema: `task_id` string) per the publicly-available structure; flagged in README for the user to cross-check against Amazon's own docs during manual registration.
- `README.md` -- new section: obtaining Skill Messaging credentials (Developer Console → Permissions → Send Alexa Events), registering the Custom Trigger + Custom Task definitions (manual, SMAPI/console — outside this session's reach), building the Routine with dynamic-parameter mapping (trigger's `task_id` → task's input), and an explicit caveat that this is Amazon's developer preview, tested in development stage only, with no documented guarantee of indefinite operation without certification.
- `test/domain/taskState.test.ts`, `test/infra/dynamoTaskInstanceRepository.test.ts` (extend), `test/infra/alexaTriggerClient.test.ts`, `test/handlers/skill.test.ts` (extend) -- cover all 4 I/O matrix rows; the trigger client test mocks `fetch`, no live network.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/taskState.ts` -- `isReminderDue`, pillar labels, `buildReminderSpeech` -- satisfies AC2's content rule
- [x] `src/infra/dynamoTaskInstanceRepository.ts` -- `transitionTaskStatus`, `findPendingTasksWithReminderDue`, `getTaskInstance` -- satisfies AC1/AC3
- [x] `src/infra/alexaTriggerClient.ts` -- LWA token + MULTICAST trigger fire -- satisfies AC1
- [x] `src/handlers/poller.ts` -- reminder-dispatch phase -- satisfies AC1/AC3
- [x] `src/handlers/skill.ts` -- `ReminderTaskHandler` -- satisfies AC2
- [x] `template.yaml` -- new parameters/env vars -- foundation
- [x] `skill-package/skill.json`, `skill-package/taskDefinitions/reminderCheckIn.json` -- best-effort task registration files
- [x] `test/domain/taskState.test.ts`, `test/infra/dynamoTaskInstanceRepository.test.ts`, `test/infra/alexaTriggerClient.test.ts`, `test/handlers/skill.test.ts` -- cover all 4 I/O matrix rows
- [x] `README.md` -- manual setup steps + developer-preview caveat

**Acceptance Criteria:**
- Given a `pendente` `TaskInstance` whose `reminder_at` has arrived, when the Poller runs, then `reminder-trigger` fires with `{task_id}` and status becomes `lembrete_enviado` via `ConditionExpression`
- Given the Routine/Custom Task invokes the Skill for that `task_id`, when Alexa speaks the reminder, then the text reconnects to pillar/purpose, never just the event title
- Given the same `reminder-trigger` processed twice (Lambda retry), when the second attempt runs, then the reminder is not fired twice (the `ConditionExpression` no longer holds)

## Implementation Notes

- `TaskInstance.status`'s type (in `src/domain/taskDetection.ts`, Story 1.3's file) was widened from the literal `'pendente'` to a `TaskStatus` union covering the full AD-3 state machine (`pendente` | `lembrete_enviado` | `aguardando_checkpoint` | `respondido` | `sem_resposta` | `reagendado`). This file wasn't in the Code Map, but `transitionTaskStatus`/`getTaskInstance` need it to type-check against a `TaskInstance` whose status may legitimately be `lembrete_enviado` by the time the Skill Handler reads it. `REMINDER_SENT_STATUS = 'lembrete_enviado'` lives there too, next to `INITIAL_TASK_STATUS`.
- `findPendingTasksWithReminderDue` does **not** filter by `reminder_at` inside the DynamoDB `FilterExpression` — it Scans by `status = pendente` only (an unambiguous exact match) and then filters by time in memory via `isReminderDue` (pure, `Date`-based comparison). `reminder_at` is stored with the Google Calendar event's local offset (e.g. `-03:00`) while `nowIso` is typically UTC (`Z`); a DynamoDB `FilterExpression` only compares strings, not instants, so comparing those two formats server-side risked breaking chronological order at certain boundaries. Keeping the time comparison in the pure domain function sidesteps that correctness risk entirely, at negligible cost given the table's documented small scale.
- `interfaces.tasks.CompleteTaskDirective.status` in the installed `ask-sdk-model` (`^1.39.0`) types as `Status = { code: string; message: string }` (an HTTP-status-code-flavored object), not a bare `'SUCCESSFUL'`/`'FAILED'` string as the I/O matrix's wording might suggest. `buildCompleteTaskDirective` in `src/handlers/skill.ts` maps the two semantic outcomes to `{ code: '200', ... }`/`{ code: '404', ... }` respectively, matching the real type so `npm run build` actually validates it (per the spec's own Verification command). Flagged here in case the real Alexa API expects something different from what this version of `ask-sdk-model` describes — cross-check against current docs alongside the other best-effort files.
- The Trigger Instance API request body in `src/infra/alexaTriggerClient.ts` (`{ trigger: { name, payload }, delivery: 'MULTICAST' }`) is a best-effort reconstruction, same caveat as the registration files — this session had no access to developer.amazon.com to confirm the exact current shape.
- Deviated from the Verification section's manual-check wording ("Confirm `SkillHandlerFunction`/`PillarConfigTable`/`TaskInstancesTable` resources are unchanged in the diff"): `SkillHandlerFunction` *does* change in this diff — it gains a `DynamoDBReadPolicy` on `TaskInstancesTable`, because `ReminderTaskHandler` (AC2, explicitly required by the Code Map) needs to read `TaskInstances` via `getTaskInstance`. There is no way to implement AC2 without granting that read. `PollerFunction` also gains a `DynamoDBReadPolicy` on `TaskInstancesTable` (for the new `Scan` in `findPendingTasksWithReminderDue`) in addition to its existing write policy. `PillarConfigTable`/`TaskInstancesTable`'s own schemas (`AttributeDefinitions`/`KeySchema`) are genuinely unchanged — no replacement, no data-loss risk.
- **Orchestrating-session fix**: the implementation subagent's first pass sent the Trigger Instance API body as `{ trigger: { name, payload }, delivery }` — a reasonable independent reconstruction, but it didn't match this spec's own Design Notes, which were based on this session's earlier web research into the actual "Routines Trigger Instance REST API Reference" example bodies. The real shape is `{ request: { requestId, delivery, trigger: { name, parameters } } }`, with a fresh UUID `requestId` per call. Corrected directly in `src/infra/alexaTriggerClient.ts` and its test before proceeding to review, since this is a concrete, sourced fact this session already had, not a genuine ambiguity.
- Review pass (3 layers: blind-hunter, edge-case-hunter, verification-gap) found 13 candidate issues; triage (see Review Triage Log) rejected 2 (an incorrect timeout premise contradicted by Story 1.3's already-applied 60s override; an unreachable date-corruption edge case) and routed 11 to `patch`. Patches: inverted the trigger-stage fail-open direction (unrecognized values now default to development, not production); `findPendingTasksWithReminderDue` now paginates the Scan; Alexa credential env-var reads moved out from in front of calendar detection; `ReminderTaskHandler` now checks the task name, not just its presence; its `getTaskInstance` call is now try/catch-guarded (completes `FAILED` instead of dangling on error); the LWA token is fetched once per poll cycle, not once per due task; a swallowed scan failure now rethrows (surfaces as a Lambda error) instead of silently completing; a duplicate test was fixed to cover a distinct case; README gained NoEcho-persistence and teardown notes; and a new `test/handlers/poller.test.ts` exercises the reminder-dispatch phase end-to-end, asserting the transition-then-fire call order. Re-verified after patching: `npm run build` (0 errors), `npm test` (74/74 across 10 files), `sam validate --lint` (valid).

## Spec Change Log

## Review Triage Log

- **[blind-hunter + edge-case-hunter, same root cause] `ALEXA_TRIGGER_STAGE` fails open toward the production Trigger Instance endpoint: `fireTrigger` only special-cases the literal `'development'`, and `poller.ts` casts the env var with no runtime validation — any unrecognized/blank value falls through to the live endpoint.** Verdict: `medium`. Confirmed by reading both files. CloudFormation's `AllowedValues` constrains this at deploy time, but the Lambda code has no defense-in-depth of its own, and this directly undercuts the story's whole "development stage only, never hit production before certification" intent. Routes to `patch` (invert the check: only the literal `'live'` targets the base endpoint; anything else, including unset, defaults to `development`).
- **[blind-hunter + edge-case-hunter, same root cause] `findPendingTasksWithReminderDue`'s `ScanCommand` never loops on `LastEvaluatedKey` — items past the first Scan page would be silently skipped, with no log signal.** Verdict: `low`. Confirmed; unlikely at this table's documented scale but a real, silent gap if it ever triggers, unlike the already-documented GSI-vs-Scan tradeoff. Routes to `patch` (loop on `LastEvaluatedKey`, accumulating pages).
- **[blind-hunter + edge-case-hunter, same root cause] The two `requiredEnvVar` calls for Alexa Skill Messaging credentials run at the top of `handler()`, before the Story 1.3 calendar-detection phase — a missing/misconfigured Alexa credential aborts task detection too, a responsibility unrelated to reminders.** Verdict: `medium`. Confirmed by reading the call order. Routes to `patch` (move those reads, plus `triggerStage` resolution, to immediately before the reminder-dispatch phase, after the detection loop completes).
- **[blind-hunter + edge-case-hunter, same root cause] `ReminderTaskHandler.canHandle` only checks `Boolean(request.task)`, never the task's `name` — any additional Custom Task registered later (Story 1.5's checkpoint flow is the very next story) would be misrouted here.** Verdict: `medium`. Real, and will become an actual bug imminently, not hypothetically. Routes to `patch` (check `request.task?.name === 'ReminderCheckIn'`).
- **[blind-hunter + edge-case-hunter, same root cause] `ReminderTaskHandler.handle`'s `getTaskInstance` call has no try/catch — a transient DynamoDB error propagates to `GenericErrorHandler`, which never sends a `Tasks.CompleteTask` directive, leaving the Routine's task invocation dangling instead of completing it `FAILED`.** Verdict: `medium`. Real production-reliability gap. Routes to `patch` (wrap the handler body, return the `FAILED` directive on any error).
- **[verification-gap, pre-verified, disposition: patch] No test executes `poller.ts`'s `handler()` end-to-end — the transition-then-fire ordering that AC3 depends on is never actually exercised, only its two halves in isolation.** Routes to `patch` (add `test/handlers/poller.test.ts`: mock the repository/trigger-client modules, assert call order and that an `'already_transitioned'` result skips `getAccessToken`/`fireTrigger`).
- **[blind-hunter] `getAccessToken` is called inside the per-task loop instead of once and reused — wasted LWA round trips, unnecessary exposure to rate limiting when several reminders are due in the same cycle.** Verdict: `low`. Real, confirmed. Routes to `patch` (hoist the token fetch above the loop, only when there's at least one due task).
- **[blind-hunter] The reminder-dispatch phase's initial `Scan` failure is caught, logged, and swallowed (`dueTasks = []`) — the Lambda invocation completes "successfully" even though dispatch was fully skipped, forfeiting Lambda's own built-in error-count metric as a free monitoring signal.** Verdict: `medium`. Real; the per-task loop's catch-and-continue (one bad task shouldn't block others) is correct and stays as-is, but a total Scan failure is a different kind of failure — the whole phase never started. Routes to `patch` (log, then rethrow instead of swallowing, so the invocation surfaces as a Lambda error).
- **[blind-hunter] `test/domain/taskState.test.ts`'s `'is due exactly at reminder_at (inclusive boundary)'` test uses the identical `reminder_at`/`nowIso` pair as the preceding `'Reminder due'` test — both already test the exact boundary; the second test's name misleadingly implies distinct coverage it doesn't provide.** Verdict: `low`. Confirmed (14:00-03:00 = 17:00Z in both). Routes to `patch` (adjust one test to cover a time clearly after `reminder_at`, not a duplicate of the boundary case).
- **[blind-hunter] The spec's own Verification → Manual checks still says "Confirm `SkillHandlerFunction`/.../unchanged in the diff," contradicting the Implementation Notes' documented deviation (that function does change).** Verdict: `low`. Real spec self-inconsistency. Fixed directly by the orchestrating session (spec text, not implementation code).
- **[blind-hunter] README §7 has no teardown/re-registration guidance, and doesn't mention that `sam deploy --guided` doesn't persist `NoEcho` parameter values to `samconfig.toml`, so future unrelated deploys will prompt for these secrets again.** Verdict: `low`. Both real, cheap documentation additions. Routes to `patch`.
- **[blind-hunter] "`Globals.Function.Timeout` stays at 8 seconds, untouched by this diff... pushes the handler closer to the unmodified 8s budget."** Verdict: `false`. `PollerFunction` has carried its own `Timeout: 60` override since Story 1.3's review round (confirmed by direct inspection of the current `template.yaml`); the finding's premise — that the applicable timeout is the 8s global default — is incorrect.
- **[edge-case-hunter] `isReminderDue` doesn't guard against an unparseable `reminder_at`/`nowIso` — `NaN <= NaN` semantics mean it just silently returns `false`.** Verdict: `low`. Rejected — current behavior already fails safe (never incorrectly fires on garbage data, no crash); the only realistic trigger is external data corruption (only well-formed dates are ever written by this codebase), and the "fix" wouldn't change any observable behavior, just add an explicit guard for a state that can't occur through normal operation.

## Design Notes

**MULTICAST over UNICAST:** the Trigger Instance API's UNICAST delivery needs a `recipient` with a customer-scoped bearer token whose exact sourcing isn't confirmable from available documentation. MULTICAST needs no recipient at all and delivers to "all your customers" — for a single-user skill that's exactly equivalent to UNICAST-to-that-user, without the unresolved token question.

**Scan, not a GSI:** `findPendingTasksWithReminderDue` scans `TaskInstances` with a filter rather than adding a GSI on `status`/`reminder_at`. At this project's scale (single user, a handful of tasks/day) a GSI is premature infrastructure; revisit only if item count grows enough for Scan cost/latency to matter.

**Registration files are best-effort:** `skill-package/skill.json`'s `apis.custom.tasks` entry and `taskDefinitions/reminderCheckIn.json` follow the publicly-documented structure but this session could not fetch `developer.amazon.com` (network-blocked) to verify the exact current schema, and Amazon labels Custom Triggers for Routines a "developer preview" that "might change." The README tells the user to cross-check both files against the current official docs during manual setup — this is not a gap introduced by rushing, it's the ceiling of what's verifiable from here.

**Firing order (transition-then-fire, not fire-then-transition):** if the trigger-fire API call fails after the status already transitioned to `lembrete_enviado`, the task is not retried automatically in this story — rolling the status back would reintroduce the exact double-fire race `ConditionExpression` exists to prevent. This is a known, accepted limitation (logged, not silent); a retry mechanism is out of scope here.

## Verification

**Commands:**
- `npm run build` -- expected: TypeScript compiles with no errors (validates the `ask-sdk-model` `task`/`CompleteTaskDirective` types used above actually resolve as expected)
- `npm test` -- expected: all tests pass, including the new/extended ones
- `sam validate --lint` -- expected: `template.yaml` valid (no AWS credentials required)

**Manual checks (if no CLI):**
- Confirm `PillarConfigTable`/`TaskInstancesTable` schemas (`AttributeDefinitions`/`KeySchema`) are unchanged in the diff. `SkillHandlerFunction` and `PollerFunction` do gain new IAM policies (see Implementation Notes) — that's an expected, necessary part of this story, not a regression to flag.
