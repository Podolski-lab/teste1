# Reconciliation — PRD vs Brief

## Gaps found

- **Reminder cadence/style ("frequentes e sutis") narrowed without acknowledgment.** Brief Scope ("Na v1") lists two distinct items: "Lembretes por voz frequentes e sutis das tarefas programadas" *and*, separately, "Lembrete de horário de início de cada tarefa" — echoing the Executive Summary's "lembretes de voz frequentes e sutis... pra manter o compromisso vivo ao longo do dia." The PRD collapses both into a single FR-1 (one voice reminder at task start time). The broader, ambient "frequentes" cadence (repeated touches to keep the commitment alive through the day, not just a start-time ping) and the "sutis" delivery-style attribute (low-key, non-intrusive) have no distinct FR or NFR — NFR-3 covers emotional tone (compassionate/non-punitive) but not delivery subtlety or frequency. The PRD's own addendum does record a related, deliberate decision ("v1 fica em silêncio entre o lembrete inicial e o checkpoint final"), so this is a transparent scope narrowing rather than a silent drop — but the tension with the brief's explicit "frequentes e sutis" framing is not called out anywhere in the PRD.

- **"Acima de tudo" primacy of the business-project metric is flattened.** The brief states three times, with escalating emphasis, that the stalled business-model project resuming is the *paramount* success signal — Executive Summary ("Sucesso aqui significa uso consistente... e, **acima de tudo**, ver aquele projeto de negócio parado finalmente voltar a andar"), Problem (the year-long stall is the whole origin story), and Vision ("Mas o **verdadeiro indicador de sucesso** continua sendo simples: aquela ideia de negócio parada há um ano finalmente ganha um modelo de negócio estruturado"). The PRD's Overview never restates this primacy, and "Métricas de Sucesso" lists "Movimento no pilar mais travado" as one bullet among four equally-weighted criteria, with no indication it is the defining north-star metric above usage frequency or pillar balance. The criterion itself is present — its narrative weight is not.

## Confirmed coverage

- 4-pillar structure (Saúde, Profissional, Projetos Pessoais, Lazer) — PRD Overview, FR-11
- Google Calendar integration for reading task times — NFR-2, FR-1
- Reconnection to the task's larger purpose before the checkpoint — FR-2
- Verbal-response-required checkpoint (the core "compromisso verbal, não visual" mechanism from "What Makes This Different") — FR-3
- Compassionate, firm-not-punitive tone ("parceiro compreensivo") — NFR-3, FR-6
- Active rescheduling offer when a task wasn't done — FR-6
- Weekly spoken summary with per-pillar completion % and named done/pending tasks (the brief's "relatório de vergonha semanal", reframed consistently with the non-punitive tone requirement) — FR-9, UJ-2
- Weekly summary closing with an encouragement message tied to purpose — FR-10
- All 4 brief Success Criteria (uso sustentado 5/7 dias×4 semanas, movimento no pilar mais travado, equilíbrio entre pilares, custo operacional free tier) — PRD Métricas de Sucesso
- All 7 "Explicitamente fora da v1" items from the brief, reproduced verbatim under "Fora do Escopo v1 / Candidatos v2 → Do brief original"
- Single user / no market ambition framing — PRD Overview
- Tier 3 (Skill customizada, AWS Lambda + Google Calendar API) architecture decision from the brief's addendum — PRD Overview
- Calendar integration limitations from the brief's addendum (no per-pillar tags, no instant sync) — NFR-2
- Checkpoint retry-once-then-stop behavior — FR-4
- Checkpoint response logging for use in the weekly summary — FR-5
- AWS free-tier cost constraint — NFR-1
