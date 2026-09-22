# Reconciliation — UX Spines vs Product Brief (brief-teste1-2026-09-15)

Sources checked: `brief.md` (Executive Summary, Problem, Solution, What Makes This Different, Who This Serves, Success Criteria, Scope, Vision) and `addendum.md` (Alexa/Alexa+ technical research).
UX spines checked: `DESIGN.md`, `EXPERIENCE.md`.

## Gaps found

- **The brief's "frequent and subtle reminders throughout the day" vision is reduced to a single reminder + single checkpoint with total silence in between, and the UX docs only surface this via an unexplained pointer.** Both the Executive Summary ("lembretes de voz frequentes e sutis... pra manter o compromisso vivo ao longo do dia") and the Scope list ("Lembretes por voz frequentes e sutis das tarefas programadas") describe an experience with ongoing light-touch presence during the day. `EXPERIENCE.md` Flow 1 step 2 says only "Nenhuma interação da Alexa até o fim da janela — silêncio proposital (ver trade-off registrado no PRD)," which is accurate but requires the reader to already know the PRD addendum to understand how large this reduction is (from "frequent nudges all day" to "one message at the start, one at the end"). Given how central this idea was to the brief's Solution narrative, the reconciliation is worth doing explicitly in the UX doc itself rather than by reference only.

- **The "shame report" framing in the brief's own scope language doesn't survive into the UX tone spec, without comment.** The brief's Scope list names the weekly summary "Relatório de vergonha semanal (resumo falado)" — a self-aware, bracingly honest label the creator chose for his own deliverable. `EXPERIENCE.md`'s Voice and Tone table renders the summary entirely through warm "encorajamento," with "Começar pelo que não foi feito" explicitly listed as something to avoid. This is very likely the right call (it matches NFR-3's "nunca punitivo" and the brief's own "Who This Serves" note that Lucas prefers "firmeza gentil, não dureza"), but it's a real tonal choice made silently — the UX docs resolve an actual tension present in the source material without acknowledging that they did so.

- **The social-commitment context behind the stalled-project pillar is dropped.** The brief's Problem section grounds the stakes in a specific detail: the business idea was "desenvolvida com um amigo," and the year of inaction is framed partly as a failure of a commitment made to another person, not just to himself. Neither the PRD nor, downstream, `EXPERIENCE.md`'s Flow 2 climax (which cites "o projeto de negócio parado há um ano") carries this detail forward. It's a minor loss on its own, but it's the kind of texture that could usefully inform the exact wording of the weekly-summary climax line if the friend/co-founder angle still matters to the user.

## Confirmed coverage

- 4-pillar structure (Saúde, Profissional, Projetos Pessoais, Lazer) — present throughout `EXPERIENCE.md`.
- Google Calendar as the source of task timing — Foundation section and Flow 1.
- Verbal, required checkpoint response as the accountability mechanism — Component Patterns and State Patterns.
- Compassionate-but-firm persona ("firmeza gentil, não dureza") — `DESIGN.md` Brand & Style, matches "Who This Serves."
- Success Criteria (sustained use, movement on the stalled pillar, pillar balance, cost) — same items as PRD's SM-1–4, and SM-2 is explicitly cited at the Flow 2 climax.
- Scope v1 items (calendar integration, purpose reconnection, start-of-task reminder, mandatory verbal checkpoint, weekly spoken report) — all represented in the intent table and flows.
- "Explicitamente fora da v1" list — none of those items leak into the UX spine.
- Vision section's multi-year arc (cobrador → parceiro de manutenção, cumulative long-term reporting) — correctly left out of a v1-scoped UX spine; not a gap.
- Addendum's Tier 3 (custom Skill) technical decision — implicitly honored by the UX spine's reliance on dynamic per-pillar content and conditional state logic, which only a custom Skill (not Routines/Blueprints) can deliver.
