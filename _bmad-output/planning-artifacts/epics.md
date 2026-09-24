---
stepsCompleted: [1, 2, 3, 4]
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

FR-1: Epic 1 - Lembrete de voz no horário da tarefa
FR-2: Epic 1 - Lembrete reconectado ao propósito maior
FR-3: Epic 1 - Checkpoint pergunta se a tarefa foi executada
FR-4: Epic 1 - Retry único do checkpoint em caso de silêncio
FR-5: Epic 1 - Registro da resposta do checkpoint
FR-6: Epic 1 - Reprogramação em tom compreensivo
FR-7: Epic 2 - Resumo semanal agendado (sexta 18h)
FR-8: Epic 2 - Retry do resumo (domingo 20h)
FR-9: Epic 2 - Conteúdo do resumo por pilar (% + tarefas nominais)
FR-10: Epic 2 - Fechamento de encorajamento do resumo
FR-11: Epic 1 - Configuração de pilar/propósito via CLI (pré-requisito do FR-2)
FR-12: Epic 2 - Resumo semanal sob demanda

## Epic List

### Epic 1: Loop diário de accountability por voz
Você configura suas tarefas por pilar (CLI local) e, a partir daí, a Alexa lembra você na hora certa, reconectando a tarefa ao seu propósito maior — e no fim da janela, confere se você executou. Se não executou, ela reage com compreensão e já sugere um novo horário. É o ciclo completo e utilizável sozinho: lembrete → execução → checkpoint → (registro ou reprogramação).
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-11
**Notas de implementação:** inclui toda a fundação técnica que o loop diário exige — infraestrutura AWS (SAM: Lambdas, DynamoDB `TaskInstances`/`PillarConfig`, EventBridge Scheduled Rule), o mecanismo de Custom Trigger + Alexa Routines, a máquina de estados do checkpoint (AD-3), o mecanismo de reagendamento (AD-7), e o monitoramento do Poller (CloudWatch Alarm) — já que ele é o único ponto de disparo de todo esse ciclo.

### Epic 2: Resumo semanal de progresso
Toda sexta às 18h (ou domingo às 20h, se você não puder na sexta), a Alexa faz um balanço da semana, pilar por pilar — o que foi feito, o que ficou pra trás, e fecha com uma mensagem de encorajamento. Você também pode pedir esse resumo a qualquer momento, sem esperar o horário fixo. Constrói em cima dos dados que o Epic 1 já está registrando a cada checkpoint.
**FRs covered:** FR-7, FR-8, FR-9, FR-10, FR-12
**Notas de implementação:** reaproveita a infraestrutura e o domínio do Epic 1 (mesmas Lambdas, mesma tabela `TaskInstances`); adiciona as 2 Rotinas de horário fixo (sexta/domingo) e o intent de invocação direta.

## Epic 1: Loop diário de accountability por voz

Você configura suas tarefas por pilar (CLI local) e, a partir daí, a Alexa lembra você na hora certa, reconectando a tarefa ao seu propósito maior — e no fim da janela, confere se você executou. Se não executou, ela reage com compreensão e já sugere um novo horário.

**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-11

### Story 1.1: Fundação do backend e primeira Skill que responde

As a usuário,
I want uma Skill customizada básica hospedada na minha conta AWS respondendo a uma invocação simples,
So that existe uma base publicável sobre a qual todo o resto do produto é construído.

**Acceptance Criteria:**

**Given** uma conta AWS configurada
**When** rodo `sam deploy --guided`
**Then** a Skill (Lambda + ASK SDK) é criada na conta, sem nenhuma tabela DynamoDB ainda — este story não precisa de persistência

**Given** a Skill publicada em modo de desenvolvimento
**When** digo "Alexa, abrir [nome da Skill]"
**Then** ela responde com uma mensagem de boas-vindas

### Story 1.2: Configurar pilar e propósito de uma tarefa

As a usuário,
I want associar um evento do meu Google Calendar a um pilar e a um propósito via linha de comando,
So that a Skill saiba do que se trata a tarefa e por que ela importa. (FR-11)

**Acceptance Criteria:**

**Given** o template SAM é atualizado para incluir a tabela `PillarConfig`
**When** rodo `sam deploy` de novo
**Then** a tabela é criada, vazia

**Given** a tabela `PillarConfig` existe
**When** rodo `associar-pilar.ts "nome do evento" saude "chegar na meta de dezembro"`
**Then** um registro é criado na tabela

**Given** um evento já associado
**When** rodo o comando de novo pro mesmo evento com dados diferentes
**Then** o registro é atualizado (upsert), não duplicado

### Story 1.3: Ler o Google Calendar e detectar tarefas do dia

As a usuário,
I want que o sistema leia meu Google Calendar periodicamente e identifique tarefas configuradas,
So that o lembrete saiba quando disparar.

**Acceptance Criteria:**

**Given** o template SAM é atualizado para incluir a tabela `TaskInstances`, o Lambda Poller, e a EventBridge Scheduled Rule
**When** rodo `sam deploy` de novo
**Then** os três recursos são criados/atualizados na conta

**Given** uma tarefa configurada no `PillarConfig` com evento hoje às 14h
**When** o Poller roda
**Then** um `TaskInstance` é criado com `status=pendente`, e `pillar`/`purpose`/`task_title` congelados no momento da criação

**Given** um evento do calendário sem entrada correspondente no `PillarConfig`
**When** o Poller roda
**Then** nenhum `TaskInstance` é criado pra ele

### Story 1.4: Lembrete de voz reconectado ao propósito

As a usuário,
I want receber um lembrete de voz no horário da tarefa que reconecta ao meu propósito maior,
So that eu lembre por que aquilo importa, não só o que fazer. (FR-1, FR-2)

**Acceptance Criteria:**

**Given** um `TaskInstance` pendente cujo horário de lembrete chegou
**When** o Poller detecta isso
**Then** dispara o `reminder-trigger` com o `task_id`, e o status muda pra `lembrete_enviado` via `ConditionExpression`

**Given** a Rotina recebe o trigger e a Custom Task correspondente roda
**When** a Alexa fala o lembrete
**Then** o texto reconecta a tarefa ao propósito — nunca apenas o título do evento

**Given** o mesmo `reminder-trigger` é processado duas vezes (retry automático do Lambda)
**When** a segunda tentativa roda
**Then** o lembrete não é falado duas vezes (a `ConditionExpression` já não vale)

### Story 1.5: Checkpoint com retry único e registro da resposta

As a usuário,
I want que a Alexa confira se executei a tarefa no fim da janela, com uma segunda chance se eu não responder na hora,
So that minha execução (ou falta dela) fique registrada sem exigir atenção perfeita. (FR-3, FR-4, FR-5)

**Acceptance Criteria:**

**Given** uma tarefa em `lembrete_enviado` cujo fim de janela chegou
**When** o `checkpoint-trigger` dispara
**Then** a Alexa pergunta se a tarefa foi executada

**Given** a pergunta foi feita
**When** respondo "sim" ou "não" (ou sinônimo natural aceito pelo NLU)
**Then** o status vira `respondido`, com a resposta registrada

**Given** não respondo em ~10s
**When** o tempo de espera se esgota
**Then** a Alexa pergunta de novo uma vez, com frase de reprompt diferente da original

**Given** não respondo à segunda tentativa
**When** o tempo de espera se esgota de novo
**Then** a sessão encerra, o status vira `sem_resposta`, e nenhuma nova tentativa é feita

**Given** a Alexa está no meio de falar a pergunta do checkpoint
**When** eu começo a responder antes dela terminar (barge-in)
**Then** ela para de falar e escuta minha resposta — o comportamento padrão de barge-in do ASK SDK não é desabilitado

### Story 1.6: Reprogramação em tom compreensivo

As a usuário,
I want que, ao dizer que não fiz uma tarefa, a Alexa reaja sem cobrança e já sugira um novo horário,
So that eu não perca o hábito de responder aos checkpoints por medo de julgamento. (FR-6)

**Acceptance Criteria:**

**Given** respondo "não" no checkpoint
**When** a Alexa reage
**Then** ela usa uma frase compreensiva (nunca de cobrança ou comparação) e sugere um horário concreto pra reprogramar

**Given** aceito o horário sugerido
**When** a reprogramação é confirmada
**Then** uma nova `TaskInstance` é criada com o novo horário, `rescheduled_from` apontando pra instância original, e a original marcada `reagendado`

**Given** essa nova instância existe
**When** seu horário de lembrete chega
**Then** o Poller a detecta (mesmo sem vir de um evento novo do Calendar) e dispara o lembrete normalmente

### Story 1.7: Monitoramento do Poller

As a usuário,
I want ser avisado por e-mail se o Poller falhar,
So that eu saiba se o mecanismo inteiro de lembretes parou de funcionar.

**Acceptance Criteria:**

**Given** o Poller lança uma exceção não tratada
**When** o CloudWatch Alarm detecta a falha
**Then** um e-mail de alerta é enviado via SNS

**Given** o Poller roda normalmente
**When** não há erros
**Then** nenhum alerta é disparado

## Epic 2: Resumo semanal de progresso

Toda sexta às 18h (ou domingo às 20h, se você não puder na sexta), a Alexa faz um balanço da semana, pilar por pilar — o que foi feito, o que ficou pra trás, e fecha com uma mensagem de encorajamento. Você também pode pedir esse resumo a qualquer momento.

**FRs covered:** FR-7, FR-8, FR-9, FR-10, FR-12

### Story 2.1: Resumo semanal agendado com gate de disponibilidade

As a usuário,
I want que a Alexa pergunte se estou disponível antes de fazer o resumo, na sexta 18h (ou domingo 20h se eu não puder na sexta),
So that o resumo só aconteça quando eu realmente puder prestar atenção. (FR-7, FR-8)

**Acceptance Criteria:**

**Given** sexta 18h chega
**When** a Rotina dispara
**Then** a Alexa pergunta se estou disponível para o resumo semanal

**Given** respondo "não"
**When** a resposta é registrada
**Then** nenhum resumo é lido, e a Rotina de domingo 20h vai perguntar de novo

**Given** não respondo em ~10s
**When** o tempo de espera se esgota
**Then** a Alexa pergunta de novo uma vez; se eu não responder de novo, a sessão encerra sem nova tentativa até domingo

### Story 2.2: Conteúdo do resumo por pilar

As a usuário,
I want que o resumo mostre, pilar por pilar, o percentual concluído e a lista nominal do que foi feito e não feito,
So that eu veja claramente onde estou avançando e onde estou travado. (FR-9)

**Acceptance Criteria:**

**Given** confirmo disponibilidade
**When** a Alexa inicia o resumo
**Then** ela percorre os 4 pilares em sequência, cada um com percentual concluído e lista nominal de tarefas feitas e não feitas

**Given** um checkpoint ficou `sem_resposta` durante a semana
**When** o resumo é calculado
**Then** essa tarefa conta como não feita no percentual e na lista

### Story 2.3: Fechamento de encorajamento

As a usuário,
I want que o resumo termine com uma mensagem de encorajamento ligada ao meu propósito maior,
So that eu saia da conversa motivado, não cobrado. (FR-10)

**Acceptance Criteria:**

**Given** o resumo por pilar terminou
**When** a Alexa encerra a conversa
**Then** ela fala uma mensagem de encorajamento conectada ao propósito maior — nunca terminando só com números

### Story 2.4: Resumo sob demanda

As a usuário,
I want pedir o resumo semanal a qualquer momento, sem esperar o horário agendado,
So that eu possa conferir meu progresso quando estiver curioso, não só quando a Skill decidir. (FR-12)

**Acceptance Criteria:**

**Given** digo "Alexa, pergunta ao [nome da skill] o resumo da semana"
**When** a Skill processa a invocação
**Then** entrega o mesmo conteúdo do resumo agendado (Story 2.2/2.3), sem o gate de disponibilidade — o pedido explícito já é o consentimento
