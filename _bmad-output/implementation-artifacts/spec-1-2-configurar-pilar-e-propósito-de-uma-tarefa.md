---
title: 'Configurar pilar e propósito de uma tarefa'
type: 'feature'
created: '2026-09-25'
status: 'in-progress'
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
- [ ] `template.yaml` -- add `PillarConfigTable` resource, on-demand billing, PK `calendar_event_pattern` -- satisfies AC1
- [ ] `package.json`, `tsconfig.json` -- add AWS SDK v3 DynamoDB deps, `ts-node`, `associar-pilar` npm script, `scripts/**/*.ts` in `tsconfig.include` -- foundation for the script
- [ ] `scripts/associar-pilar.ts` -- parse args, validate pillar, upsert via `PutCommand` -- satisfies AC2/AC3
- [ ] `test/scripts/associar-pilar.test.ts` -- unit tests for arg parsing/pillar validation (valid pillar, invalid pillar, missing args) -- covers the I/O matrix's Invalid pillar and Missing argument rows without needing live AWS
- [ ] `README.md` -- document how to run the script locally -- closes the gap between `sam deploy` and actually using the CLI

**Acceptance Criteria:**
- Given the updated `template.yaml`, when the user runs `sam deploy`, then `PillarConfig` is created empty, with no impact on `SkillHandlerFunction`
- Given `PillarConfig` exists, when the user runs `associar-pilar.ts "nome do evento" saude "chegar na meta de dezembro"` with their own AWS credentials, then one item is created
- Given an event already associated, when the user runs the command again for the same event with different pillar/purpose, then the existing item is updated in place, not duplicated

## Implementation Notes

## Spec Change Log

## Review Triage Log

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
