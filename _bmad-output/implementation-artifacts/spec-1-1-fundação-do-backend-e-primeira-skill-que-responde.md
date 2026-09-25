---
title: 'Fundação do backend e primeira Skill que responde'
type: 'feature'
created: '2026-09-25'
status: 'in-progress'
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
- [ ] `package.json`, `tsconfig.json` -- initialize Node 24/TypeScript project with `ask-sdk-core`, `ask-sdk-model`, build/test scripts -- foundation for everything else
- [ ] `src/domain/.gitkeep`, `src/infra/.gitkeep` -- create empty dirs matching Source Tree -- keeps later stories from having to restructure
- [ ] `src/handlers/skill.ts` -- `LaunchRequestHandler` (welcome speech), `SessionEndedRequestHandler` (log-only stub), generic `ErrorHandler`, exported ASK SDK Lambda handler -- satisfies both ACs
- [ ] `template.yaml` -- SAM template, one Lambda (nodejs24.x, esbuild), CloudWatch Logs-only IAM, no DynamoDB -- matches Story 1.1 AC precisely
- [ ] `skill-package/skill.json`, `skill-package/interactionModels/custom/pt-BR.json` -- manifest + interaction model with chosen invocation name and required built-in intents -- what the user uploads manually (AD-6)
- [ ] `README.md` -- "Setup" section with the exact manual steps (Developer Console skill creation, `sam deploy --guided`, wiring Lambda ARN as endpoint, uploading interaction model, enabling test) -- closes the gap `sam deploy` alone can't (it deploys AWS resources, not the Alexa-side skill registration)
- [ ] `test/handlers/skill.test.ts` -- unit test: `LaunchRequest` produces a non-empty pt-BR speech response and `shouldEndSession: true` -- covers the I/O matrix's Launch row without needing a live Alexa/AWS environment

**Acceptance Criteria:**
- Given the AWS SAM template with exactly one Lambda and no DynamoDB table, when the user runs `sam deploy --guided`, then only the Lambda (+ IAM role, log group) is created
- Given the skill package uploaded to the Alexa Developer Console and the skill published in development mode, when the user says "Alexa, abrir assistente pessoal", then the Lambda returns a non-empty welcome speech response

## Implementation Notes

## Spec Change Log

## Review Triage Log

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
