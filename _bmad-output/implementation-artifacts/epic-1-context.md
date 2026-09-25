# Epic 1 Context: Loop diário de accountability por voz

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deliver a working, self-contained daily accountability loop by voice through an Alexa Custom Skill: at a task's scheduled start, Alexa reminds the user and reconnects the task to its larger purpose (not just its title); at the end of the window, a checkpoint asks whether it was done, with one retry on silence; a "no" gets an understanding, never-punitive response plus an actively suggested new time. This epic also carries the full technical foundation the loop depends on — AWS backend, calendar polling, trigger mechanism, failure monitoring — since nothing else in the product works without it.

## Stories

- Story 1.1: Fundação do backend e primeira Skill que responde
- Story 1.2: Configurar pilar e propósito de uma tarefa
- Story 1.3: Ler o Google Calendar e detectar tarefas do dia
- Story 1.4: Lembrete de voz reconectado ao propósito
- Story 1.5: Checkpoint com retry único e registro da resposta
- Story 1.6: Reprogramação em tom compreensivo
- Story 1.7: Monitoramento do Poller

## Requirements & Constraints

- Reminder fires close to the task's start time (bounded by ~10min polling, not exact-second); must reconnect the task to its purpose in one sentence, never just the event title or a guilt-inducing phrase.
- End-of-window checkpoint requires a spoken yes/no (or natural synonym). On silence, retry once with a distinct reprompt (~10s each wait); second silence ends the session, no further attempts.
- Checkpoint outcome (done / not done / no response) must persist for Epic 2's weekly summary.
- "Not done" gets an understanding, non-punitive reply and an actively proposed concrete new time — never an open "when do you want?" question, guilt, or comparison to other weeks.
- Task-to-pillar/purpose mapping (4 pillars: Saúde, Profissional, Projetos Pessoais, Lazer) is configured manually via a local CLI (upsert by event); no voice/in-Skill config surface in v1.
- Assumed: calendar events always have an explicit end time and never overlap across pillars; Alexa device is reachable when reminders/checkpoints fire. Undefined behavior otherwise is acceptable for v1.
- Must stay within AWS free tier (~R$0/month). All spoken interaction keeps a "compreensive partner" tone — firm, never punitive.
- Out of scope: mid-task support (nudges, step breakdown, Pomodoro) and voice/UI-based pillar configuration.

## Technical Decisions

- Hexagonal architecture: `src/domain/` holds pure business rules (pillar/purpose, checkpoint state machine; never imports `aws-sdk`/`ask-sdk-core`/`googleapis`), called by two independent entrypoints — ASK SDK handlers (`src/handlers/skill.ts`) and a scheduled polling Lambda (`src/handlers/poller.ts`). Neither entrypoint branches on status/pillar/timing directly; all such decisions come from domain functions. Infra adapters (DynamoDB repo, Calendar client, Trigger client) live in `src/infra/`.
- DynamoDB `TaskInstances` is the single source of truth for task state (one item per `task_id`; Lambdas are stateless). `pillar`/`purpose`/`task_title` are frozen at creation, never re-read live later. Status transitions are strictly ordered (`pendente` → `lembrete_enviado` → `aguardando_checkpoint` → `respondido`|`sem_resposta`|`reagendado`) and go through one function using a `ConditionExpression` on the expected prior status, so a stale/duplicate transition (e.g. Lambda auto-retry) fails silently instead of double-firing an effect.
- Two pre-registered Alexa Custom Trigger sources — `reminder-trigger`, `checkpoint-trigger` — each with minimal payload `{ task_id }`; the Custom Task reads everything else from the `TaskInstances` item so spoken content can't drift from stored data.
- `PillarConfig` is written only by a local CLI script run with the user's own AWS credentials; application Lambdas only read it. No AWS/Google credentials are ever supplied to the implementation session (deploy is local, `sam deploy --guided`).
- Rescheduling creates a new `TaskInstances` item (copying pillar/purpose/title, new `reminder_at`/`checkpoint_at`) rather than editing the original, which is marked `reagendado`. The Poller checks both new Calendar events and `reagendado` items whose new time has arrived; v1 never writes back to Google Calendar.
- Infra as code via AWS SAM (`template.yaml`): Lambdas, DynamoDB tables, EventBridge Scheduled Rule (~10min poll). Single AWS account/region (`us-east-1`, tentative), no staging environment.
- Stack: Node.js 24.x LTS, `ask-sdk-core` ^2.14.0, AWS SDK v3, `googleapis`, AWS SAM CLI.
- Conventions: ISO 8601 UTC dates; `task_id` = `{calendar_event_id}#{YYYY-MM-DD}` (reschedules append `#r{n}`); adapter errors normalized to a `DomainError` before reaching the domain; structured JSON logging; secrets via Lambda env vars, never hardcoded.
- A CloudWatch Alarm on unhandled Poller exceptions triggers an SNS email alert — the Poller is the single point of failure for the whole mechanism.
- Outside the code: the user manually creates Alexa Routines wiring `reminder-trigger`/`checkpoint-trigger` to their Custom Tasks (weekly-summary Routines belong to Epic 2).

## UX & Interaction Patterns

- Session state machine: `Idle` → (proactive reminder, no session) → `AwaitingCheckpointResponse` → (silence) `AwaitingCheckpointRetry` → (`AwaitingReschedule` on "no" | `SessionEnded` on second silence or "yes").
- Intents: `ReminderDelivery`, `CheckpointQuestion` (both proactive/Routine-triggered), `CheckpointYesIntent`/`CheckpointNoIntent`, `RescheduleTimeIntent` (slot: new time/day), plus `AMAZON.FallbackIntent` and `AMAZON.StopIntent`/`AMAZON.CancelIntent` (available anytime, interrupt with no confirmation).
- Yes/no confirmation must accept natural synonyms ("fiz", "não deu", etc.), not just literal "sim"/"não"; exact utterance list is an implementation detail.
- Reprompt-on-silence: ~10s wait → one reprompt with a phrase distinct from the original → ~10s more → end, no further attempt. The same single retry budget also covers unrecognized speech (`AMAZON.FallbackIntent`).
- Barge-in must stay enabled (ASK SDK default). Rescheduling always proposes a concrete time, never an open question.
- Fixed model microcopy per situation (reminder, checkpoint yes/no, reprompt) is defined in the UX spec — follow it, avoiding effusive praise, "you promised and didn't do it," guilt, or comparison.

## Cross-Story Dependencies

- Story 1.1 (base Skill + Lambda) is the prerequisite for everything else in this epic.
- Story 1.2 (`PillarConfig` via CLI) must exist before Story 1.3's Poller can resolve pillar/purpose.
- Story 1.3 (Poller creating `TaskInstances`) is required before Story 1.4 (reminder) and Story 1.5 (checkpoint) can fire.
- Story 1.6 (rescheduling) depends on Story 1.5's "no" path and produces new `TaskInstances` that Story 1.3's Poller must also detect.
- Story 1.7 (monitoring) depends on the Poller existing (Story 1.3).
- Epic 2 (weekly summary) depends entirely on the `TaskInstances` records this epic produces and reuses the same Lambdas/domain/table — nothing in this epic's schema should be renamed or dropped without considering that.
