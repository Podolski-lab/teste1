---
stepsCompleted: [1]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-teste1-2026-09-17/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-teste1-2026-09-23/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-teste1-2026-09-22/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-teste1-2026-09-22/EXPERIENCE.md
  - _bmad-output/planning-artifacts/briefs/brief-teste1-2026-09-15/addendum.md
---

# Assistente de Produtividade Pessoal com Alexa - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the Assistente de Produtividade Pessoal com Alexa, decomposing the requirements from the PRD, UX Design spine, and Architecture spine into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: A Skill deve emitir um lembrete de voz próximo ao horário de início de cada tarefa programada, lido do Google Calendar (precisão limitada pela frequência de polling, não é disparo no segundo exato).
FR-2: Cada lembrete deve reconectar a tarefa ao propósito maior associado ao seu pilar, não apenas nomear a tarefa.
FR-3: Ao final da janela de tempo programada da tarefa, a Skill deve emitir um checkpoint perguntando se a tarefa foi executada, exigindo resposta verbal (sim/não).
FR-4: Se não houver resposta ao checkpoint, a Skill deve insistir uma única vez; na ausência de resposta na segunda tentativa, deve encerrar sem novas tentativas.
FR-5: A resposta ao checkpoint (feita, não feita, sem resposta) deve ser registrada para uso no resumo semanal.
FR-6: Quando o usuário reportar que não executou a tarefa, a Skill deve responder em tom compreensivo (nunca punitivo) e sugerir ativamente um novo horário para reprogramá-la.
FR-7: A Skill deve iniciar um resumo semanal na sexta-feira, às 18h, perguntando antes se o usuário está disponível.
FR-8: Se o usuário não estiver disponível na sexta, a Skill deve tentar novamente no domingo, às 20h.
FR-9: O resumo semanal deve apresentar, por pilar, o percentual de tarefas programadas concluídas e a lista nominal das tarefas feitas e não feitas.
FR-10: O resumo semanal deve encerrar com uma mensagem de encorajamento conectada ao propósito maior do usuário.
FR-11: Cada evento do Google Calendar deve poder ser associado a um pilar e a um propósito maior. Na v1, essa associação é feita manualmente pelo próprio usuário, através de um script de linha de comando local.
FR-12: A Skill deve permitir que o usuário peça o resumo semanal sob demanda, a qualquer momento, por invocação direta — mesmo conteúdo do resumo agendado (FR-9/FR-10), sem o gate de disponibilidade do FR-7.

### NonFunctional Requirements

NFR-1 (Custo): A operação deve se manter dentro do free tier da AWS (~R$0/mês de infraestrutura).
NFR-2 (Integração): A Skill depende da integração Alexa ↔ Google Calendar, que não suporta tags por pilar nem sincronização instantânea — a associação de pilar/propósito é responsabilidade de FR-11, não da API do calendário; a ausência de sincronização instantânea limita a precisão de timing do FR-1.
NFR-3 (Tom de voz): Toda interação falada — lembrete, checkpoint, reprogramação, resumo — deve manter o tom de parceiro compreensivo: firme o bastante para não deixar passar em branco, nunca punitivo.

### Additional Requirements

Da Arquitetura (`ARCHITECTURE-SPINE.md`):

- **Sem starter template** — arquitetura hexagonal leve construída do zero (`src/domain/`, `src/handlers/`, `src/infra/`, `scripts/`), não há framework/boilerplate de partida.
- **Infra como código**: AWS SAM (`template.yaml`) define Lambdas, DynamoDB, EventBridge Scheduled Rule e IAM. Deploy roda localmente pelo usuário (`sam deploy --guided`) — nenhuma credencial AWS passa pela sessão de implementação (AD-6).
- **Dois Lambdas com um domínio só**: `skill.ts` (ASK SDK RequestHandlers) e `poller.ts` (agendado via EventBridge, ~10 min) — nenhuma regra de negócio duplicada entre eles (AD-1, AD-2).
- **DynamoDB como fonte única de verdade**: tabela `TaskInstances` com transições de estado idempotentes via `ConditionExpression` (evita disparo duplicado sob retry automático do Lambda) — AD-3. Tabela `PillarConfig` só-leitura do ponto de vista da aplicação (AD-5).
- **Contrato de Custom Trigger**: duas fontes fixas pré-registradas (`reminder-trigger`, `checkpoint-trigger`), payload mínimo `{ task_id }` — o resto é lido do DynamoDB (AD-4).
- **Reagendamento cria nova instância**: `TaskInstances` com `rescheduled_from` apontando pra origem; Poller passa a observar tanto o Calendar quanto tarefas com `status = reagendado` cujo novo horário chegou (AD-7).
- **Setup manual fora do código**: usuário precisa criar ~4 Alexa Routines uma vez (reminder-trigger, checkpoint-trigger, resumo sexta 18h, resumo domingo 20h) ligando os triggers/horários às Custom Tasks da Skill.
- **Integrações externas**: Google Calendar API (leitura, requer OAuth client próprio do usuário) e Alexa Custom Trigger API / Skill Management API.
- **Operações**: CloudWatch Alarm no erro do Lambda Poller + notificação por e-mail (SNS) — é o único ponto de disparo de todo o mecanismo, uma falha silenciosa para o produto inteiro.
- **Armazenamento de credenciais**: token OAuth do Google Calendar via Secrets Manager ou variável de ambiente do Lambda (a decidir no detalhamento da story correspondente).
- **Stack fixada**: AWS Lambda Node.js 24.x LTS, ask-sdk-core ^2.14.0, AWS SDK v3 (`@aws-sdk/client-dynamodb`), googleapis (Node client), AWS SAM CLI.
- **Região AWS**: provavelmente `us-east-1` (maioria dos endpoints da Alexa Skills Kit) — confirmar antes do primeiro deploy.

Do addendum de pesquisa técnica do brief (`brief-teste1-2026-09-15/addendum.md`):

- Confirma que Rotinas simples ("Alexa diz") não suportam conteúdo dinâmico por tarefa — reforça a necessidade do mecanismo Custom Trigger + Custom Task já capturado na arquitetura.
- A integração nativa Alexa↔Google Calendar (vínculo de calendário no app) não tem sincronização instantânea nem suporte a tags — confirma a origem do NFR-2 e a necessidade do Poller.

### UX Design Requirements

UX-DR1: Implementar os 8 intents do modelo de interação: `ReminderDelivery`, `CheckpointQuestion`, `CheckpointYesIntent`/`CheckpointNoIntent`, `RescheduleTimeIntent` (slot de horário/dia), `WeeklyAvailabilityQuestion`, `AvailabilityYesIntent`/`AvailabilityNoIntent`, `WeeklySummaryOnDemandIntent`, `AMAZON.FallbackIntent`, `AMAZON.StopIntent`/`AMAZON.CancelIntent`.
UX-DR2: Implementar a máquina de estados de sessão completa: `Idle` → `AwaitingCheckpointResponse` → `AwaitingCheckpointRetry` → (`AwaitingReschedule` | `SessionEnded`); e em paralelo `AwaitingWeeklyAvailability` → `AwaitingWeeklyAvailabilityRetry` → `DeliveringWeeklySummary` → `SessionEnded`.
UX-DR3: Microcopy fixa por situação (lembrete, checkpoint sim/não, reprompt, disponibilidade do resumo, abertura/fechamento do resumo) seguindo exatamente as frases-modelo e evitando os padrões vetados da tabela Voice and Tone do `EXPERIENCE.md`.
UX-DR4: NLU deve aceitar variação natural de confirmação sim/não (não só literais "sim"/"não") — lista de utterances sinônimas a definir na implementação.
UX-DR5: Reprompt único por silêncio (~10s de espera, frase de reprompt distinta da pergunta original, depois ~10s e encerra) — mesmo orçamento de tentativa cobre fala não reconhecida (`AMAZON.FallbackIntent`).
UX-DR6: Barge-in habilitado (comportamento padrão do ASK SDK — não deve ser desabilitado).
UX-DR7: Sugestão de reagendamento deve propor um horário concreto, nunca uma pergunta aberta ("quando você quer?").
UX-DR8: Resumo semanal percorre os 4 pilares em sequência, cada um com % concluído + lista nominal de feitas/não feitas.
UX-DR9: Resumo sob demanda entrega o mesmo conteúdo do agendado, sem o gate de disponibilidade.

### FR Coverage Map

{{requirements_coverage_map}}

## Epic List

{{epics_list}}
