# Review — ARCHITECTURE-SPINE.md (Assistente de Produtividade Pessoal com Alexa)

**Reviewed:** `architecture/architecture-teste1-2026-09-23/ARCHITECTURE-SPINE.md` + `.memlog.md`
**Reviewer altitude check:** initiative-level spine, hobby-stakes, single AI-built implementation. Rigor calibrated accordingly — findings below are about real divergence risk, not enterprise-formality gaps.

## Overall verdict

The spine's layering/state-machine/trigger-contract core (AD-1 through AD-6) is genuinely well-formed: each Rule is a concrete, checkable constraint, not a platitude, and the Capability Map nominally touches every FR-1..FR-12 and NFR-1..3. But two of the product's actual mechanics — how a rescheduled task (FR-6) re-enters the reminder pipeline, and where the spoken task name (FR-2) comes from — have no data path decided anywhere in the document, not even in Deferred, which is exactly the class of gap a spine exists to catch. The Operations dimension (what happens when the Poller silently fails) is also completely unaddressed. These are narrow, fixable gaps, not a structural rewrite.

## Findings

### Critical

**C-1. FR-6 rescheduling has no architected mechanism, and it's not even in Deferred.**
`AD-3` makes `reagendado` a terminal status for a `TaskInstance`, and the ERD has a `rescheduled_to` field, but nothing decides how the *new* time actually re-enters the pipeline. `task_id` is defined (AD-3) as `{calendar_event_id}#{date}`, and the Poller's only documented data source is Google Calendar (see container diagram: `PollerFn --> GCal`). So either:
- rescheduling must write a new/updated event back to Google Calendar (requiring `CalendarClient` write scope and a write path from the Skill Handler, neither of which is mentioned anywhere — Stack, Rules, and diagrams all show Calendar access only from the Poller), or
- the Poller must also read `rescheduled_to` out of DynamoDB independently of Calendar (a second discovery path never described).

Nothing in the spine picks either option, and it isn't listed in Deferred (where it would at least flag the open risk). Two units — the reschedule-handling code in the Skill Handler and the task-discovery code in the Poller — could easily be built on incompatible assumptions about who owns "what happens next," silently breaking FR-6 in production. This is precisely the kind of divergence point the spine is supposed to fix.

**C-2. FR-2's task-naming requirement has no data path from Calendar to spoken text.**
FR-2's own acceptable example names the specific task ("projeto de modelagem de negócio"), not just the purpose. But `PILLAR_CONFIG` only stores `pillar`/`purpose` per `calendar_event_pattern`, `TASK_INSTANCE` carries no title/summary field, and AD-4's fixed trigger payload (`task_id, pillar, purpose, calendar_event_id`) also carries no title. Per the container diagram, only the Poller talks to `CalendarClient` — the Skill Handler (which composes/speaks the reminder) has no documented route to the event's title at all. Whoever implements this will have to invent either "Poller fetches title and stuffs it in the trigger payload" or "Skill Handler also gets a `CalendarClient`," and nothing here decides which, so two people (or two future stories) building the trigger-emit side and the speech-compose side independently would very plausibly disagree.

### High

**H-1. Operations is a silent dimension, not a deferred one.**
The checklist calls this out by name and it applies here: there is no decision, deferred item, or open question anywhere in the spine about what happens when the Poller Lambda errors (Google token expiry, calendar API rate limit, DynamoDB throttling, etc.), whether there's any alerting/monitoring, or a retry/backoff policy for the two external API calls. The Poller is the sole trigger for the entire product (nothing else initiates a reminder or checkpoint); a silent failure there means the whole assistant stops working with zero visibility, for a non-technical user who won't be debugging Lambda logs. Even at hobby stakes, this deserved at least one line in Deferred (e.g., "no alerting in v1; user notices only by absence of reminders — accepted risk") rather than total silence.

**H-2. AWS SAM is asserted in Stack/AD-6 without the verification trail the other two named techs got.**
The memlog's single `(version)` entry (line 21) documents web-research verification for the Lambda Node.js runtime (`nodejs24.x`) and `ask-sdk-core ^2.14.0`, including caveats (no recent SDK release, Custom Task builder may need manual JSON). There is no equivalent entry for AWS SAM — despite AD-6 making it the entire deploy/IaC mechanism and the task brief explicitly listing it as one of the three techs expected to have been verified. The Stack table hedges `googleapis` ("latest — verificar versão exata") but states `AWS SAM CLI | latest` with no such caveat, which reads as settled when it wasn't actually checked.

### Medium

**M-1. Capability Map mis-cites the governing AD for NFR-2.**
The row `NFR-2 (limitações de sincronização do Calendar) | Poller (intervalo de polling) | AD-4` points to AD-4, but AD-4 is the trigger-name/payload contract — it says nothing about polling cadence or timing precision. The actual lever for NFR-2 (poll interval) is explicitly *not* an AD; it's the first Deferred bullet ("Intervalo exato do polling ... não muda nenhum AD"). As written, the map could mislead an implementer into thinking timing precision is architecturally settled by AD-4 when it's actually an unpinned, to-be-decided budget trade-off.

**M-2. AD-2's Rule is the softest of the six.**
"os dois handlers só orquestram... nunca reimplementam regra localmente" has no structural enforcement (no lint boundary, no test), unlike AD-1's clean import-ban (mechanically checkable) or AD-3's single-writer-function rule. For a solo AI-agent build this is a minor risk (one author, presumably consistent), but it's worth tightening to something checkable, e.g. "handlers contain no `if`/`switch` on `status` or `pillar` — only domain does."

### Low

**L-1. Google OAuth token storage/refresh for `CalendarClient` is unmentioned anywhere** (Stack, Rules, Deferred). Low risk since only the Poller touches Calendar (no cross-unit divergence possible), but it's a hard prerequisite for FR-1 to function at all and isn't tracked as even an open question.

**L-2. `AWS SDK for JavaScript v3` and `AWS SAM CLI | latest` are unpinned** without the explicit "confirm at implementation time" hedge given to `googleapis` and the region choice — cosmetic inconsistency in how the Stack table communicates confidence, not a functional risk.

## Checklist walkthrough

- **Fixes real divergence points, misses none:** Mostly yes for the layering/state-machine/trigger-contract core; **no** for the reschedule data flow (C-1) and task-title data flow (C-2) — both are real coordination points between independently-built handlers that the spine leaves undecided and unflagged.
- **Every AD's Rule enforceable and prevents its divergence:** AD-1, AD-3, AD-4, AD-5, AD-6 are concrete and enforceable. AD-2 is directionally right but softer (M-2).
- **Nothing under Deferred could let two units diverge incompatibly:** Deferred section itself is clean — none of its six bullets are cross-unit coordination risks. The problem is what's *missing* from Deferred (C-1, C-2, H-1), not what's in it.
- **Named tech verified-current:** `nodejs24.x` and `ask-sdk-core ^2.14.0` are backed by a memlog research entry and the Stack table matches it exactly. `googleapis` is honestly hedged as unverified. `AWS SAM` is stated as settled in Stack/AD-6 with no matching memlog verification (H-2).
- **Capability → Architecture Map covers PRD:** All FR-1 through FR-12 and NFR-1 through NFR-3 have a row; no capability is missing. One row is mis-cited (M-1).
- **Every structural dimension decided/deferred/open:** Design paradigm, layering, state model, trigger contract, deployment topology, source tree, and data model are all decided. Deployment & environments and infra/provider strategy are both explicitly addressed. **Operations is the one dimension left genuinely silent** (H-1).

## Severity tally
Critical: 2 · High: 2 · Medium: 2 · Low: 2
