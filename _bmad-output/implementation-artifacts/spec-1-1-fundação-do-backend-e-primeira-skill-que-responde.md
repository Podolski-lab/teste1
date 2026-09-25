---
title: 'Fundação do backend e primeira Skill que responde'
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '3d9dee54dd55c80ea7170a5826cda6f558d4f0c9'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no code yet — only planning artifacts. Nothing can be built or deployed until a minimal AWS backend exists: a deployable Lambda running an Alexa Custom Skill that responds to invocation, with no persistence yet.

**Approach:** Scaffold the hexagonal source tree (`src/handlers/`, empty `src/domain/` and `src/infra/` placeholders per the Architecture Spine's Source Tree), an AWS SAM template defining exactly one Lambda (no DynamoDB tables — explicitly deferred to Story 1.2), the ASK SDK `LaunchRequest`/error/session-ended handlers with a welcome response, and the Alexa skill package (manifest + pt-BR interaction model) the user uploads by hand in the Alexa Developer Console. The user runs `sam deploy --guided` and does the Alexa-side manual registration themselves (AD-6: no AWS/Alexa credentials in this session).

## Boundaries & Constraints

**Always:** Node.js 24.x Lambda runtime, TypeScript, `ask-sdk-core` ^2.14.0 (AD per Architecture Spine Stack table); `src/domain/` never imports `aws-sdk`/`ask-sdk-core`/`googleapis` even though it starts empty in this story (AD-1); `src/handlers/skill.ts` is the only handler file this story adds, matching the Source Tree; the SAM template names Lambda resources so `poller.ts` (Story 1.3) can be added later without renaming the skill Lambda; locale is `pt-BR` throughout (matches every planning doc); AWS region `us-east-1` (Architecture Spine recommendation for ASK endpoints).

**Never:** no DynamoDB table in `template.yaml` this story (explicit AC); no AWS/Alexa credentials requested, stored, or used in this session — deploy and Alexa Developer Console registration are manual steps documented for the user, not executed here; no checkpoint/reminder/domain logic — that starts in Story 1.3+; do not hardcode the skill's invocation phrase inside handler code — it lives only in the interaction model.

**Decision:** Skill invocation name is `assistente pessoal` ("Alexa, abrir assistente pessoal") — user-confirmed, final, not a placeholder.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Launch | `LaunchRequest` | Welcome speech in pt-BR consistent with "parceiro compreensivo" tone; session ends (no follow-up defined yet) | N/A |
| Unhandled request | Any request type without a matching handler | Generic `ErrorHandler` returns a short apology in pt-BR, session ends | Logged as structured JSON |
| Session end | `SessionEndedRequest` | No-op stub that logs the reason; does **not** call any domain transition (`TaskInstances`/`transitionTaskStatus` don't exist yet — that wiring is Story 1.5's job per AD-2) | N/A |

</frozen-after-approval>

## Code Map

- Repo is empty of application code — everything below is new.
- `template.yaml` -- AWS SAM template; one `AWS::Serverless::Function` (skill handler), IAM role scoped to CloudWatch Logs only (no DynamoDB permissions yet), `esbuild` `Metadata.BuildMethod` for the TS Lambda.
- `src/handlers/skill.ts` -- ASK SDK `SkillBuilders.custom()`, registers `LaunchRequestHandler`, `SessionEndedRequestHandler`, generic `ErrorHandler`. Exported as the Lambda entrypoint (`exports.handler`).
- `src/domain/`, `src/infra/` -- created empty (placeholder `.gitkeep` or a no-op index) so the Source Tree exists per Architecture Spine; no logic yet (AD-1).
- `skill-package/skill.json` -- Alexa skill manifest (invocation category, pt-BR locale entry, endpoint placeholder for the user to fill with their deployed Lambda ARN).
- `skill-package/interactionModels/custom/pt-BR.json` -- interaction model: invocation name `assistente pessoal`, built-in intents (`AMAZON.CancelIntent`, `AMAZON.StopIntent`, `AMAZON.HelpIntent`, `AMAZON.FallbackIntent`) — required for Alexa certification even before they carry custom logic.
- `package.json`, `tsconfig.json` -- new; TypeScript + `ask-sdk-core` + `@types/node` deps, build script.
- `README.md` -- extend with a "Setup" section: manual steps to create the skill in the Alexa Developer Console, link it to the Lambda after `sam deploy --guided`, upload the interaction model, and test in dev mode.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `tsconfig.json` -- initialize Node 24/TypeScript project with `ask-sdk-core`, `ask-sdk-model`, build/test scripts -- foundation for everything else
- [x] `src/domain/.gitkeep`, `src/infra/.gitkeep` -- create empty dirs matching Source Tree -- keeps later stories from having to restructure
- [x] `src/handlers/skill.ts` -- `LaunchRequestHandler` (welcome speech), `SessionEndedRequestHandler` (log-only stub), generic `ErrorHandler`, exported ASK SDK Lambda handler -- satisfies both ACs
- [x] `template.yaml` -- SAM template, one Lambda (nodejs24.x, esbuild), CloudWatch Logs-only IAM, no DynamoDB -- matches Story 1.1 AC precisely
- [x] `skill-package/skill.json`, `skill-package/interactionModels/custom/pt-BR.json` -- manifest + interaction model with chosen invocation name and required built-in intents -- what the user uploads manually (AD-6)
- [x] `README.md` -- "Setup" section with the exact manual steps (Developer Console skill creation, `sam deploy --guided`, wiring Lambda ARN as endpoint, uploading interaction model, enabling test) -- closes the gap `sam deploy` alone can't (it deploys AWS resources, not the Alexa-side skill registration)
- [x] `test/handlers/skill.test.ts` -- unit tests: `LaunchRequest` (non-empty pt-BR speech, `shouldEndSession: true`), unmatched-intent request (routes to `GenericErrorHandler`, apology speech), `SessionEndedRequest` (no output speech, logs the reason) -- covers all three I/O matrix rows

**Acceptance Criteria:**
- Given the AWS SAM template with exactly one Lambda and no DynamoDB table, when the user runs `sam deploy --guided`, then only the Lambda (+ IAM role, log group) is created
- Given the skill package uploaded to the Alexa Developer Console and the skill published in development mode, when the user says "Alexa, abrir assistente pessoal", then the Lambda returns a non-empty welcome speech response

## Implementation Notes

- Added `esbuild` as an explicit devDependency (SAM's `esbuild` `BuildMethod` needs it resolvable; not in the original Code Map, small addition within footprint).
- Original implementation pass covered the Launch matrix row only; the orchestrating session's Matrix Test Audit found the `Unhandled request` and `Session end` rows lacked tests and added them (`GenericErrorHandler` test drives an unmatched-intent request through the real ASK SDK dispatcher's "no suitable handler" error path; `SessionEndedRequestHandler` test asserts no output speech and that the structured log line fires). All 3 tests pass.
- Verified locally: `npm run build` (tsc, 0 errors), `npm test` (3/3 vitest tests pass), `sam validate --lint` (valid, no AWS credentials needed), and the two `skill-package/*.json` files parse as valid JSON with all 4 required built-in intents present.
- `sam validate` (without `--lint`) requires AWS credentials/region in SAM CLI 1.166.2 since it calls the CloudFormation API; `--lint` (local `cfn-lint`) was used instead to honor AD-6. Documented for the user in case they run the bare command.
- Not verified (requires the user's own AWS/Amazon Developer accounts, per AD-6): actual `sam deploy`, Alexa Developer Console skill registration, and a live "Alexa, abrir assistente pessoal" round-trip on a real device. The README Setup section gives the exact manual steps, including the Lambda's "Alexa Skills Kit" trigger permission the console/template can't set without a live Skill ID.
- The `nodejs24.x` Lambda runtime string in `template.yaml` (matches the Architecture Spine's Stack table) is likewise unverified against the live AWS Lambda service, since no `sam deploy` was run in this session — worth the user double-checking on their first real deploy.
- Review pass (3 layers: blind-hunter, edge-case-hunter, verification-gap) found 12 candidate issues; triage (see Review Triage Log) rejected 2 as out-of-scope/unreachable and routed 8 to `patch`, applied by re-engaging the implementation subagent. Patches: `SessionEndedRequestHandler` now logs `request.error` detail when `reason === 'ERROR'`; both handler tests now assert the actual logged payload, not just that a log line was emitted; removed 2 dead `eslint-disable` comments (no ESLint configured in this repo); added `.env`/`.env*` to `.gitignore`; corrected the `AWSLambdaBasicExecutionRole` scope comment in `template.yaml`; added `test/skill-package.test.ts` covering the interaction model's invocation name and required built-in intents. Re-verified after patching: `npm run build` (0 errors), `npm test` (6/6 pass across 2 test files), `sam validate --lint` (valid).

## Spec Change Log

## Review Triage Log

- **[blind-hunter] Built-in intents (Cancel/Stop/Help/Fallback) declared in the interaction model have no matching handler in `skill.ts`; an unmatched intent falls through to `GenericErrorHandler`'s generic apology.** Verdict: `false`. The frozen Approach explicitly scopes this story to "LaunchRequest/error/session-ended handlers" only; the story's own AC (epics.md) only requires a welcome response to `LaunchRequest`, and the skill runs in Alexa development mode only (never submitted for Amazon certification per this project's setup), so the cited certification risk doesn't apply. Graceful apology + session end for an out-of-scope intent is acceptable stub behavior, not a defect.
- **[blind-hunter] Two `eslint-disable-next-line no-console` comments in `skill.ts` reference ESLint tooling that isn't configured anywhere in the repo (no `.eslintrc`/`eslint.config.*`, no `eslint` dependency).** Verdict: `low`. Confirmed via repo search — no ESLint config or dependency exists. Dead/misleading comments, no functional impact. Routes to `patch` (trivial: delete the two comments).
- **[blind-hunter] `sprint-status.yaml` still marks `epic-1`/`1-1-...` as `in-progress` while the spec is now `in-review` with all tasks checked.** Verdict: `low`. Real tracking-file mismatch. Routes to `patch` (trivial: update the two status values); fixed directly by the orchestrating session (not implementation code).
- **[blind-hunter] `template.yaml`'s `Runtime: nodejs24.x` is unverified against live AWS Lambda since `sam deploy` was never run (AD-6).** Verdict: `low`. Real but unavoidable given AD-6; value matches the Architecture Spine's Stack table. Routes to `patch` (trivial: one sentence added to Implementation Notes flagging the risk); fixed directly by the orchestrating session.
- **[blind-hunter] `.gitignore` doesn't exclude `.env`/`.env*`, and the architecture's convention is secrets via env vars.** Verdict: `low`. No `.env` exists yet, but the fix is a one-line preventive addition with zero cost. Routes to `patch`.
- **[blind-hunter] The `Policies` comment above `SkillHandlerFunction` in `template.yaml` says "Somente permissão de escrita em CloudWatch Logs," but `AWSLambdaBasicExecutionRole` is a broad AWS-managed policy, not scoped to this function's specific log group.** Verdict: `low`. Confirmed — the comment overstates how narrowly the permission is scoped. Routes to `patch` (trivial: reword the comment).
- **[blind-hunter] `skill-package/skill.json` and `skill-package/interactionModels/custom/pt-BR.json` have no automated test coverage — only the spec's manual-check step guards them.** Verdict: `low`. Real gap; a future edit could silently break skill registration with nothing catching it. Routes to `patch` (add a small test asserting valid JSON, invocation name, and the four required built-in intents).
- **[blind-hunter] `GenericErrorHandler` logs the full `error.stack` even for the routine "no suitable handler" case (Help/Cancel/Stop/Fallback), producing noisy CloudWatch entries for expected control flow.** Verdict: `low`. Real but cosmetic (observability noise, not wrong behavior). Rejected — the smallest fix would require branching on error type/message, which is more than a direct correction, and the defect is unlikely to be met in everyday use of this stub.
- **[verification-gap, pre-verified, disposition: patch] `SessionEndedRequestHandler`'s test never asserts the logged `reason` value equals the request's actual reason — a regression that hardcodes/misroutes the field would still pass.** Routes to `patch` (extend the test to parse the captured log arg and assert `reason === 'USER_INITIATED'`).
- **[verification-gap, pre-verified, disposition: patch] `GenericErrorHandler`'s test never asserts anything was logged at all — deleting the `logStructured` call would still pass.** Routes to `patch` (add a `console.log` spy assertion mirroring the `SessionEndedRequestHandler` test's pattern).
- **[edge-case-hunter] `SessionEndedRequestHandler` logs only the generic `reason` string; when `reason === 'ERROR'`, the accompanying `request.error` detail (type/message) is dropped from the structured log.** Verdict: `low`. Real, verified against the `ask-sdk-model` `SessionEndedRequest` shape. Routes to `patch` (extend the log payload with the error detail when present, consistent with the existing ternary pattern).
- **[edge-case-hunter] `GenericErrorHandler` dereferences `error.message`/`error.stack` without guarding against a non-`Error`/null thrown value, which could make the catch-all handler itself throw.** Verdict: `false`. Traced every throw site reachable in this diff: the only errors this story's code can produce are ASK SDK's own internal dispatch errors (confirmed via test output to be real `Error` instances) — no async/external/custom-reject code exists yet in Story 1.1 that could throw a non-`Error` value. No demonstrated reachable path; code that fails loudly on an unreached situation is not a defect.

## Design Notes

`SessionEndedRequestHandler` in this story is intentionally a log-only stub, not yet the AD-2 `transitionTaskStatus` translation — that function and the `TaskInstances` table don't exist until Stories 1.2/1.3/1.5. Wiring it now would either call a nonexistent domain function or hardcode a placeholder that Story 1.5 would have to unwind; the stub is the smaller footprint.

`LaunchRequest` ends the session (`shouldEndSession: true`) rather than leaving it open: no follow-up intent is defined by this story, and an open session with no reprompt is worse UX than a clean close.

## Verification

**Commands:**
- `npm run build` -- expected: TypeScript compiles with no errors
- `npm test` -- expected: `skill.test.ts` passes
- `sam validate` -- expected: `template.yaml` is valid (no AWS credentials required for template validation)

**Manual checks (if no CLI):**
- Inspect `skill-package/interactionModels/custom/pt-BR.json` for valid JSON and presence of all four required built-in intents.
