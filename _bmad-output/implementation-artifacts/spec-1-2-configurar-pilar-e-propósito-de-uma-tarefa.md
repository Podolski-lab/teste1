---
title: 'Configurar pilar e propósito de uma tarefa'
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'dbd71c594410188df16eaaeae34ebb1de812ff52'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing yet lets the Skill know which pillar/purpose a calendar event belongs to (FR-11). Without this mapping, the Poller (Story 1.3) has nothing to resolve a task's pillar/purpose from, and no reminder or checkpoint content is possible.

**Approach:** Add the `PillarConfig` DynamoDB table to `template.yaml` and a local CLI script (`scripts/associar-pilar.ts`) that upserts one `{event name → pillar, purpose}` mapping per run, using the user's own AWS credentials (AD-5/AD-6 — no credentials in this session, no deploy run here).

## Boundaries & Constraints

**Always:** the CLI is the only writer to `PillarConfig` (AD-5) — application Lambdas never write it; pillar values are validated against the four fixed pillars from planning (`saude`, `profissional`, `projetos-pessoais`, `lazer`), case-insensitive input, rejecting anything else with the valid list in the error; the primary key is the literal event-name string passed as the first argument (no pattern/wildcard matching — Story 1.3 defines how the Poller matches this against real Calendar events); `PillarConfig` uses on-demand (`PAY_PER_REQUEST`) billing, matching NFR-1's low-traffic hobby-scale intent.

**Never:** no code in `src/handlers/` reads or writes `PillarConfig` this story (that starts in Story 1.3); no AWS credentials requested, stored, or used in this session — the user runs the script and `sam deploy` locally; no wildcard/regex matching logic for the event-name key yet.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create | New event name, valid pillar, purpose text | Item written to `PillarConfig`; confirmation printed | N/A |
| Upsert | Same event name run again, different pillar/purpose | Existing item overwritten (same key), not duplicated | N/A |
| Invalid pillar | Pillar not one of the four valid values | No write; script exits non-zero | Error message lists the four valid pillar values |
| Missing argument | Fewer than 3 positional args | No write; script exits non-zero | Usage message printed |

</frozen-after-approval>

## Code Map

- `template.yaml` -- add `PillarConfigTable` (`AWS::DynamoDB::Table`, `PAY_PER_REQUEST`, PK `calendar_event_pattern` string, fixed `TableName: PillarConfig` so the script references it without reading CloudFormation outputs) alongside the existing `SkillHandlerFunction`; do not touch that function's resources.
- `scripts/associar-pilar.ts` -- new. Parses `process.argv` (3 positional args: event name, pillar, purpose), validates pillar, builds a `DynamoDBDocumentClient` (`@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`) region from `AWS_REGION` env var (default `us-east-1`, matching Story 1.1's convention), and does a plain `PutCommand` (DynamoDB `PutItem` without a key condition naturally upserts — no read-before-write needed, unlike `TaskInstances`' `ConditionExpression` pattern in AD-3, which governs a different table with different invariants).
- `package.json` -- add `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` (deps) and `ts-node` (devDep, so the script runs without a separate build step); add an `associar-pilar` script entry.
- `tsconfig.json` -- add `scripts/**/*.ts` to `include` (currently only `src/**/*.ts` and `test/**/*.ts`) so `tsc`/type-checking covers it.
- `README.md` -- extend Setup with how to run `associar-pilar.ts` (needs the user's own AWS credentials locally, after `sam deploy`).
- `test/scripts/associar-pilar.test.ts` -- new; tests the pillar-validation and argument-parsing logic in isolation from AWS (extract that logic into an exported pure function so it's testable without mocking the DynamoDB client).

## Tasks & Acceptance

**Execution:**
- [x] `template.yaml` -- add `PillarConfigTable` resource, on-demand billing, PK `calendar_event_pattern` -- satisfies AC1
- [x] `package.json`, `tsconfig.json` -- add AWS SDK v3 DynamoDB deps, `ts-node`, `associar-pilar` npm script, `scripts/**/*.ts` in `tsconfig.include` -- foundation for the script
- [x] `scripts/associar-pilar.ts` -- parse args, validate pillar, upsert via `PutCommand` -- satisfies AC2/AC3
- [x] `test/scripts/associar-pilar.test.ts` -- unit tests for arg parsing/pillar validation, plus a mocked-`DynamoDBDocumentClient` test of `upsertPillarConfig` -- covers all four I/O matrix rows without needing live AWS
- [x] `README.md` -- document how to run the script locally -- closes the gap between `sam deploy` and actually using the CLI

**Acceptance Criteria:**
- Given the updated `template.yaml`, when the user runs `sam deploy`, then `PillarConfig` is created empty, with no impact on `SkillHandlerFunction`
- Given `PillarConfig` exists, when the user runs `associar-pilar.ts "nome do evento" saude "chegar na meta de dezembro"` with their own AWS credentials, then one item is created
- Given an event already associated, when the user runs the command again for the same event with different pillar/purpose, then the existing item is updated in place, not duplicated

## Implementation Notes

- Original implementation pass tested only `parseArgs`/`validatePillar` (the Invalid pillar / Missing argument matrix rows). The orchestrating session's Matrix Test Audit found Create/Upsert untested; extracted the `PutCommand` call into an exported `upsertPillarConfig(docClient, ...)` function and added two tests against a mocked `DynamoDBDocumentClient` (`{ send: vi.fn() }`) — no real AWS credentials or network calls involved. All 4 matrix rows now have a passing covering test (18/18 total).
- Verified locally: `npm run build` (0 errors, `scripts/` included), `npm test` (18/18 pass across 3 files), `sam validate --lint` (valid), and manual runs of the CLI with no args / an invalid pillar confirmed no AWS call is attempted before validation passes.
- Not verified (requires the user's own AWS credentials, per AD-5/AD-6): an actual `sam deploy` creating `PillarConfig`, or a real `PutItem` write/upsert against a live table.
- Review pass (3 layers: blind-hunter, edge-case-hunter, verification-gap) found 12 candidate issues; triage (see Review Triage Log) rejected 5 as out-of-scope/incorrect/non-trivial-for-the-gain, deferred 1 (`main()`'s own wiring is untested — logged in `deferred-work.md`), and routed 6 to `patch`. Patches: pillar validation now strips diacritics (`"Saúde"` accepted); `parseArgs` requires exactly 3 args (extra args now rejected instead of silently truncated); `eventName`/`purpose` are trimmed, empty `eventName` rejected; `AWS_REGION=""` now falls back to the default region; `PillarConfigTable` got `DeletionPolicy`/`UpdateReplacePolicy: Retain`; `sprint-status.yaml` advanced to `review`. Re-verified after patching: `npm run build` (0 errors), `npm test` (22/22 pass across 3 files), `sam validate --lint` (valid).

## Spec Change Log

## Review Triage Log

- **[edge-case-hunter] Pillar validation only lowercases input, never strips diacritics — typing "Saúde" (the actual Portuguese spelling, used exactly this way in the planning docs) is rejected as invalid, even though the four canonical values are documented as accepted case-insensitively.** Verdict: `high`. Confirmed: `validatePillar` does `.trim().toLowerCase()` only; `"saúde" !== "saude"`. This is the single most likely real invocation to fail, since "Saúde" is how the pillar is spelled everywhere else in this project. Routes to `patch` (normalize diacritics — e.g. NFD + strip combining marks — before comparing/returning).
- **[blind-hunter] `PillarConfigTable` has no `DeletionPolicy`/`UpdateReplacePolicy`; a stack rollback, a future key/attribute change forcing replacement, or an accidental `sam delete` would silently destroy hand-curated, non-trivially-reconstructible data.** Verdict: `medium`. Real operational risk with a cheap fix. Routes to `patch` (add `DeletionPolicy: Retain` / `UpdateReplacePolicy: Retain`).
- **[edge-case-hunter] More than 3 positional args (e.g. an unquoted multi-word event name) are silently accepted — `parseArgs` checks `args.length < 3`, not `=== 3`, so extra tokens are dropped and the wrong values land in `eventName`/`pillar`/`purpose`.** Verdict: `medium`. Confirmed by reading the destructuring logic; a very plausible mistake (forgetting to quote a Portuguese event name with spaces) that currently fails silently instead of loudly. Routes to `patch` (`args.length !== 3`).
- **[blind-hunter + edge-case-hunter, same root cause] Neither `eventName` nor `purpose` is trimmed or checked for emptiness (only `pillar` is) — a stray space becomes part of the DynamoDB primary key (mismatching Story 1.3's future Calendar-event matching), and an empty `eventName` reaches `PutCommand` and fails with an opaque AWS `ValidationException` instead of a clean usage error.** Verdict: `low`. Both confirmed against `parseArgs`. Routes to `patch` (trim both fields; reject an empty `eventName` after trim with `UsageError`).
- **[edge-case-hunter] `AWS_REGION` set to an empty string (not merely unset) bypasses the `??` default — `DynamoDBClient` gets built with an empty region string instead of falling back to `us-east-1`.** Verdict: `low`. Confirmed via Node's `??` semantics (only null/undefined trigger the fallback). Uncommon trigger, real deviation from documented behavior. Routes to `patch` (`||` instead of `??`, or an explicit empty-string check).
- **[blind-hunter] `sprint-status.yaml` still marks `1-2-configurar-pilar-e-propósito-de-uma-tarefa` as `in-progress` while the spec is `in-review` with all tasks checked.** Verdict: `low`. Real tracking-file mismatch, same pattern as Story 1.1's review. Routes to `patch` (trivial: update the status value); fixed directly by the orchestrating session, not implementation code.
- **[blind-hunter] The reviewed diff file excludes `package-lock.json`, so a reviewer working only from it can't verify the lockfile matches `package.json`.** Verdict: `false`. Deliberate scoping choice in how the orchestrating session generates the diff for review (consistent with Story 1.1); the lockfile's consistency was verified by a successful `npm install` and is part of the actual commit — nothing about the shipped code is unverified.
- **[blind-hunter] The DynamoDB attribute name `calendar_event_pattern` foreshadows pattern/wildcard matching that doesn't exist yet, risking confusion or a breaking rename when Story 1.3 implements real matching.** Verdict: `false`. This field name is inherited verbatim from the Architecture Spine's own ERD (`PILLAR_CONFIG { string calendar_event_pattern PK }`), fixed at the architecture-planning phase before this story existed — not a naming choice introduced by this diff, and not this story's to change.
- **[blind-hunter] No special-casing for the likely first-run failure of running the CLI before `sam deploy` has created `PillarConfig` (falls through to a generic error).** Verdict: `low`. Real but cosmetic — the generic error message already names the table (`'Erro ao gravar em PillarConfig:'`), and README already documents the required order. Rejected — the fix (branching on a specific AWS exception type) is more than a direct correction, and the existing message already gives enough signal.
- **[blind-hunter] `@aws-sdk/client-dynamodb`/`@aws-sdk/lib-dynamodb` are under `dependencies` rather than `devDependencies`, unlike `ts-node`.** Verdict: `false`. The CLI script is a genuine runtime consumer of these packages when a user runs `npm run associar-pilar` (not a dev-only tool) — `dependencies` is the correct section; only `ts-node` (which runs/transpiles the script, a dev-tooling concern) belongs in `devDependencies`, which is exactly how it's currently split.
- **[blind-hunter] No way to list, look up, or delete an existing `PillarConfig` mapping — a typo creates an orphaned row with no cleanup path short of the AWS Console.** Verdict: `false`. Out of scope per the frozen Approach, which explicitly scopes the CLI to "upserts one mapping per run" — list/delete are new capabilities, not covered by this story's AC or epics.md.
- **[verification-gap, pre-verified, disposition: defer] `main()`'s error-dispatch (`UsageError`/`InvalidPillarError` vs. generic) and argument-threading are never exercised by a test — a regression there would ship with `npm test` green.** Same root cause independently raised by blind-hunter (the "18/18... All 4 matrix rows" claim doesn't cover `main()`'s own wiring). Deferred as filed: `main()` is a ~15-line synchronous wrapper around three already-unit-tested pure functions, run once by a human from a terminal; testing it would mean mocking `process.argv`/console/module-load side effects for a script with no other callers, disproportionate to this story's scope.

## Design Notes

Pillar values are validated against a fixed slug set now (`saude`/`profissional`/`projetos-pessoais`/`lazer`) rather than left freeform: an unnoticed typo here silently breaks every reminder/checkpoint for that event later, with no other safeguard in the pipeline until a real task fires.

The upsert uses a plain `PutItem`, not `TaskInstances`' `ConditionExpression`-guarded transition (AD-3): that pattern exists specifically to prevent double-firing a side effect on a concurrent/retried Lambda invocation, which doesn't apply here — a human runs this script once, synchronously, from their own terminal.

## Verification

**Commands:**
- `npm run build` -- expected: TypeScript compiles with no errors (including `scripts/`)
- `npm test` -- expected: all tests pass, including the new `associar-pilar` tests
- `sam validate --lint` -- expected: `template.yaml` valid (no AWS credentials required)

**Manual checks (if no CLI):**
- Inspect `template.yaml` for exactly one new `AWS::DynamoDB::Table` resource; confirm `SkillHandlerFunction` is unchanged.
