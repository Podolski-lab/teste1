# Reconciliation — UX Spines vs PRD (prd-teste1-2026-09-17)

Sources checked: `prd.md` (FR-1 through FR-11, NFR-1/2/3, SM-1 through SM-4 + contra-métrica, Jornadas UJ-1/UJ-2, Fora do Escopo) and `addendum.md` (mid-task support candidates).
UX spines checked: `DESIGN.md`, `EXPERIENCE.md`.

## Gaps found

- **FR-11 (manual pillar/purpose configuration) has no footprint in either UX document.** The PRD is explicit that associating a calendar event to a pillar and a propósito maior is done manually in the backend in v1, with no voice command or in-Skill configuration surface. `EXPERIENCE.md`'s Information Architecture table lists every recognized intent (including the newly proposed `WeeklySummaryOnDemandIntent`) but never states that no configuration intent exists or why. Worth one line — ideally right where the intent table sits — confirming this boundary explicitly, so a future reader doesn't wonder if a "configure pilar by voice" intent was simply forgotten.

- **FR-5's three-state checkpoint outcome (feita / não feita / sem resposta) collapses to two categories in the weekly summary spec.** FR-5 requires all three outcomes to be recorded for use in the weekly summary. `EXPERIENCE.md`'s Component Patterns row "Leitura por pilar" and the Voice/Tone "Resumo — abertura" line both describe the summary content as "% + tarefas feitas + tarefas não feitas" — a binary split. There's no statement of how a checkpoint that got no response at all (silence, FR-4's failure path) shows up in the weekly tally: folded into "não feita," or reported separately? This is a real behavioral gap, not a wording nitpick, since it changes what Lucas actually hears on Friday.

- **FR-7/FR-8's precise delivery windows are genericized.** The PRD pins the weekly summary to "sexta-feira, aproximadamente 14h–18h" with retry "domingo, aproximadamente 18h–21h." `EXPERIENCE.md`'s IA table and Flow 2 only say "sexta à tarde" / "retry domingo," dropping the specific windows. Minor, but since the PRD was precise and this is exactly the kind of scheduling detail a voice-flow spec should carry forward (it affects when the proactive intent actually fires), it's worth restoring rather than leaving implicit.

- **FR-3's calendar-edge-case assumption isn't carried into `EXPERIENCE.md`'s own assumption list.** The PRD explicitly flags as unresolved: events without an explicit end time, and overlapping pillar tasks — both left undefined for v1. `EXPERIENCE.md` follows the same "[ASSUMPTION: ...]" convention for other open questions (invocation name, single-device household, NLU synonym mapping) but doesn't add this one, even though it directly affects when `CheckpointQuestion` fires ("fim da janela da tarefa"). Since the doc already has the pattern for surfacing this kind of open question, the omission reads as accidental rather than a deliberate simplification.

## Confirmed coverage

- Overview / UJ-1 / UJ-2 journeys — matched almost verbatim by Flow 1 and Flow 2.
- FR-1 (proactive reminder near task start) — `ReminderDelivery` intent, "sempre — proativo."
- FR-2 (reminder reconnects to purpose, example phrasing and anti-pattern) — Voice/Tone table row, exact match including the "don't just read the title" anti-pattern.
- FR-4 (single retry on silence, then stop, no further attempts) — `AwaitingCheckpointRetry` state and the Interaction Primitives "Reprompt único por silêncio" entry.
- FR-6 (compassionate reprogramming, active time suggestion, anti-patterns like "you promised and didn't do it") — Voice/Tone "Checkpoint — não" row and the "Sugestão ativa, não pergunta aberta" primitive.
- FR-9 (per-pillar % + nominal done/not-done list) — Component Patterns "Leitura por pilar" (modulo the FR-5 three-state gap noted above).
- FR-10 (closing encouragement tied to larger purpose) — Voice/Tone "Resumo — fechamento" and Flow 2 step 5.
- NFR-3 (compassionate-partner tone across every spoken interaction) — `DESIGN.md` Brand & Style and threaded through every row of `EXPERIENCE.md`'s Voice and Tone table.
- SM-2 (stalled-project pillar as the real success signal) — explicitly named at the Flow 2 climax with a direct citation.
- "Fora do Escopo v1" list — none of those items (presence detection, sound reinforcement, LinkedIn suggestion, etc.) leak into the UX spine's intents or flows.
- Addendum's mid-task-support candidates (non-verbal cue, step-by-step voice guide, Pomodoro) — correctly excluded from v1, and Flow 1 explicitly cites the PRD's conscious trade-off for the silent execution window instead of silently omitting it.
