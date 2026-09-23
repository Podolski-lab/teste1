---
name: 'Assistente de Produtividade Pessoal com Alexa'
type: architecture-spine
purpose: build-substrate
altitude: initiative
paradigm: 'Hexagonal leve (Ports & Adapters)'
scope: 'Skill customizada para Alexa (backend Lambda, integração Google Calendar, agendamento de rotinas, dados de pilares/propósitos/checkpoints)'
status: final
created: '2026-09-23'
updated: '2026-09-23'
binds: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, NFR-1, NFR-2, NFR-3]
sources:
  - _bmad-output/planning-artifacts/prds/prd-teste1-2026-09-17/prd.md
  - _bmad-output/planning-artifacts/ux-designs/ux-teste1-2026-09-22/EXPERIENCE.md
  - _bmad-output/planning-artifacts/briefs/brief-teste1-2026-09-15/addendum.md
companions:
  - "Deck visual: https://claude.ai/artifact/CrdYQKwNZsRD1YkVYDNrGG"
---

# Architecture Spine — Assistente de Produtividade Pessoal com Alexa

## Design Paradigm

**Hexagonal leve (Ports & Adapters).** Três camadas:

- **Domínio** (`src/domain/`) — regras de pilar/propósito, máquina de estado do checkpoint, cálculo do resumo semanal. Puro TypeScript/JavaScript, sem import de `aws-sdk`, `ask-sdk-core` ou `googleapis`.
- **Interação** — dois adaptadores de entrada independentes que chamam o domínio: os `RequestHandlers` do ASK SDK (sessão de voz) e o handler do Lambda de polling (agendado).
- **Infraestrutura** — adaptadores de saída que o domínio invoca via interface: repositório DynamoDB, cliente Google Calendar API, cliente Alexa Trigger/Reminders API.

A restrição de plataforma que molda tudo isso: uma Skill customizada não pode abrir sessão de voz proativamente — só falar uma vez (Reminders API) ou notificar (Proactive Events API). O mecanismo viável para o checkpoint com diálogo real (pergunta → espera → retry) é uma **Alexa Routine disparando uma Custom Task** da Skill, que aí sim abre uma sessão completa. Rotinas de horário fixo (resumo semanal) disparam a Custom Task direto; rotinas de horário dinâmico (lembrete/checkpoint por tarefa) usam **Custom Triggers for Routines**, acionados programaticamente pelo Poller.

## Invariants & Rules

### AD-1 — Domínio isolado de infraestrutura

- **Binds:** todo o código em `src/domain/`
- **Prevents:** lógica de negócio duplicada ou divergente entre o handler da Skill e o Poller
- **Rule:** `src/domain/` nunca importa `aws-sdk`, `ask-sdk-core` ou `googleapis`. Toda comunicação com o mundo externo passa por uma interface (`TaskRepository`, `CalendarClient`, `TriggerClient`) implementada em `src/infra/`.

### AD-2 — Dois entrypoints, um domínio só

- **Binds:** `src/handlers/skill.ts`, `src/handlers/poller.ts`
- **Prevents:** os dois Lambdas implementarem a mesma regra (ex.: janela de retry do checkpoint) de formas incompatíveis
- **Rule:** `skill.ts` e `poller.ts` não contêm nenhum `if`/`switch` que ramifique sobre `status`, `pillar`, ou timing de checkpoint/retry — toda decisão desse tipo é uma chamada a uma função de `src/domain/` que devolve o próximo estado ou a próxima ação. Um handler que decide isso localmente é uma violação, revisável por leitura do arquivo. `skill.ts` é o único responsável por tratar `SessionEndedRequest` e traduzi-lo na transição `sem_resposta` (via `transitionTaskStatus`, AD-3) — nenhum outro lugar escreve esse valor.

### AD-3 — DynamoDB como fonte única de verdade do estado de tarefa

- **Binds:** FR-3, FR-4, FR-5, FR-9
- **Prevents:** estado assumido em memória entre invocações (Lambda é stateless); escritas conflitantes/duplicadas entre Poller e Skill handler sob retry automático do Lambda
- **Rule:** um item por instância de tarefa (`task_id`) na tabela `TaskInstances`, com os campos `pillar`, `purpose` e `task_title` **congelados no momento da criação** do item (não relidos ao vivo do `PillarConfig`/Calendar depois — evita inconsistência se a config mudar no meio de uma tarefa em andamento) e um campo `checkpoint_attempts` (contador do retry do FR-4, vive aqui, nunca em session attributes do ASK SDK). Campo `status` transiciona só por esses valores, nessa ordem: `pendente` → `lembrete_enviado` → `aguardando_checkpoint` → `respondido` | `sem_resposta` | `reagendado`. Toda transição passa por `transitionTaskStatus`, que escreve com `ConditionExpression` exigindo o status anterior esperado — uma transição cujo pré-requisito já não vale (porque outra invocação, ou um retry automático do Lambda, já aplicou) falha silenciosamente em vez de duplicar o efeito (reenviar trigger, reprocessar checkpoint). Nenhum adaptador escreve o campo `status` fora dessa função.

### AD-4 — Contrato fixo dos Custom Triggers

- **Binds:** FR-1, FR-3, Poller, setup de Rotinas na Alexa
- **Prevents:** nomes de trigger inconsistentes entre o que o Poller dispara e o que está registrado nas Rotinas do usuário; payload duplicando dado que já vive no DynamoDB (e podendo divergir dele)
- **Rule:** exatamente duas fontes de trigger, pré-registradas: `reminder-trigger` e `checkpoint-trigger`. Payload mínimo: `{ task_id }` — a Custom Task correspondente, ao rodar, lê o resto (`pillar`, `purpose`, `task_title`) direto do item `TaskInstances` via `task_id`. Isso é o que dá ao FR-2 seu trajeto de dados: o texto falado do lembrete vem do domínio lendo esse item, nunca de um payload separado que poderia ficar desatualizado. O resumo semanal (FR-7/FR-8/FR-12) não usa Custom Trigger — vai direto por Rotinas de horário fixo apontando pra sua própria Custom Task, ou por invocação direta do usuário (FR-12 sob demanda: `LaunchRequest`/intent comum, sem Rotina nenhuma envolvida).

### AD-5 — Config de pilar/propósito é dado, não código, editável pelo próprio usuário via CLI local

- **Binds:** FR-11
- **Prevents:** alterar a associação evento↔pilar exigir redeploy do Lambda ou depender de outra pessoa pra rodar o ajuste
- **Rule:** mapeamento vive na tabela `PillarConfig` (DynamoDB). Único caminho de escrita: um script de linha de comando (`scripts/associar-pilar.ts`, roda local com as credenciais AWS do próprio usuário, mesma toolchain do `sam deploy`) que o usuário executa diretamente — não uma interface de voz nem tela na Skill, condizente com FR-11. Os Lambdas de aplicação (Skill Handler, Poller) só leem essa tabela, nunca escrevem.

### AD-6 — Credenciais nunca passam pela sessão de implementação

- **Binds:** todo o deploy
- **Prevents:** segredos AWS/Google commitados no repo ou solicitados nesta sessão de implementação
- **Rule:** infraestrutura inteira definida via AWS SAM (`template.yaml`). O deploy roda localmente, com as credenciais AWS do próprio usuário (`sam deploy --guided`) — nunca com credenciais fornecidas à sessão que escreve o código.

### AD-7 — Reagendamento cria uma nova instância, não edita a origem

- **Binds:** FR-6
- **Prevents:** o Poller nunca mais encontrar uma tarefa reagendada porque ela some do range de leitura do Google Calendar (o `task_id` original ficou preso ao evento/data antigos)
- **Rule:** ao reagendar, o domínio cria um **novo** item `TaskInstances` (`task_id` = `{calendar_event_id}#{date}#r{n}`), copiando `pillar`/`purpose`/`task_title` do item original, com `reminder_at`/`checkpoint_at` setados diretamente pro novo horário (não derivados de uma leitura futura do Calendar — a v1 não escreve de volta no Google Calendar). O Poller, a cada execução, verifica dois conjuntos: eventos do Calendar no range de leitura (tarefas novas) **e** itens `TaskInstances` com `status = reagendado` cujo novo horário já chegou (tarefas reagendadas). O item original marcado `reagendado` nunca volta a disparar.

```mermaid
graph LR
  subgraph Interação
    SkillHandler[Skill Handler<br/>ASK SDK RequestHandlers]
    Poller[Poller Handler<br/>agendado via EventBridge]
  end
  subgraph Domínio
    Domain[src/domain/<br/>pilares · checkpoint · resumo]
  end
  subgraph Infraestrutura
    Repo[TaskRepository<br/>DynamoDB]
    Cal[CalendarClient<br/>Google Calendar API]
    Trigger[TriggerClient<br/>Alexa Custom Trigger / Reminders API]
  end
  SkillHandler --> Domain
  Poller --> Domain
  Domain --> Repo
  Domain --> Cal
  Domain --> Trigger
```

Um terceiro caminho não passa pelo Poller nem por Trigger nenhum: o resumo sob demanda (FR-12) é uma invocação comum da Skill — `LaunchRequest`/intent direto do usuário — que cai direto no Skill Handler, que lê `TaskInstances` via domínio e responde. Governado só por AD-1/AD-2, sem AD-4.

## Consistency Conventions

| Concern | Convention |
| --- | --- |
| Naming (entidades, arquivos, eventos) | `PascalCase` para tipos de domínio (`TaskInstance`, `PillarConfig`); `camelCase` para funções; nomes de trigger em `kebab-case` fixos (AD-4) |
| Dados & formatos | Datas em ISO 8601 UTC; `task_id` sempre `{calendar_event_id}#{YYYY-MM-DD}`; erros de adaptador convertidos para um tipo `DomainError` antes de cruzar pro domínio — domínio nunca vê exceção nativa da AWS SDK ou do Google API |
| Estado & cross-cutting | Mutação de estado só via `transitionTaskStatus` (AD-3); logging estruturado (JSON) em todo handler; config sensível (API keys) via variáveis de ambiente do Lambda, nunca hardcoded |

## Stack

| Name | Version |
| --- | --- |
| AWS Lambda (runtime) | nodejs24.x |
| Node.js | 24.x LTS |
| ask-sdk-core | ^2.14.0 |
| ask-sdk-model | ^1.x (peer dependency do ask-sdk-core) |
| AWS SDK for JavaScript | v3 (`@aws-sdk/client-dynamodb`) |
| googleapis (Node client) | latest — verificar versão exata na implementação |
| AWS SAM CLI | latest — verificado ativamente mantido (última atualização jul/2026, suporte a CloudFormation Language Extensions adicionado mai/2026); deploy via `sam deploy --guided` |
| Amazon DynamoDB | — (serviço gerenciado) |
| Amazon EventBridge (Scheduled Rule) | — (serviço gerenciado, dispara o Poller) |

## Structural Seed

### Contêineres e fluxo

```mermaid
flowchart TB
  GCal[(Google Calendar)]
  EventBridge[EventBridge<br/>Scheduled Rule ~10min]
  PollerFn[Lambda: Poller]
  DDB[(DynamoDB<br/>TaskInstances + PillarConfig)]
  TriggerAPI[Alexa Custom Trigger API]
  Routine[Alexa Routine<br/>horário fixo ou custom trigger]
  CustomTask[Custom Task da Skill]
  SkillFn[Lambda: Skill Handler<br/>ASK SDK]
  Device((Echo))

  EventBridge --> PollerFn
  PollerFn --> GCal
  PollerFn --> DDB
  PollerFn -->|dispara reminder-trigger / checkpoint-trigger| TriggerAPI
  TriggerAPI --> Routine
  Routine --> CustomTask
  CustomTask --> SkillFn
  SkillFn --> DDB
  SkillFn --> Device
  Device -->|resposta verbal| SkillFn
  Device -->|"Alexa, pergunta o resumo" (FR-12, sob demanda)| SkillFn
```

### Deployment & Environments

Ambiente único (v1 hobby — sem staging separado). Tudo numa única conta AWS, região única (`us-east-1`, exigida pela maioria dos endpoints da Alexa Skills Kit — confirmar na implementação).

```mermaid
flowchart LR
  subgraph "Conta AWS (do usuário)"
    Lambda1[Lambda: skill-handler]
    Lambda2[Lambda: poller]
    DDBTables[(DynamoDB)]
    EB[EventBridge Scheduled Rule]
  end
  subgraph "Amazon Developer / Alexa"
    ASK[Alexa Skill<br/>Custom Skill + Custom Tasks]
  end
  subgraph "Google Cloud"
    GCalAPI[Google Calendar API]
  end
  ASK <--> Lambda1
  EB --> Lambda2
  Lambda2 --> GCalAPI
  Lambda2 --> DDBTables
  Lambda1 --> DDBTables
```

**[ASSUMPTION: conta AWS e credenciais Google Calendar API partem do zero — provisionamento inicial (criar conta, ativar API, gerar OAuth client) faz parte do primeiro slice de implementação, não é um pré-requisito externo já resolvido.]**

### Core-entity ERD

```mermaid
erDiagram
  TASK_INSTANCE {
    string task_id PK
    string calendar_event_id
    string date
    string pillar
    string purpose
    string task_title
    string status
    number checkpoint_attempts
    string reminder_sent_at
    string checkpoint_response
    string rescheduled_from
  }
  PILLAR_CONFIG {
    string calendar_event_pattern PK
    string pillar
    string purpose
  }
  TASK_INSTANCE }o--|| PILLAR_CONFIG : "resolve pilar/propósito no momento da criação (AD-3)"
```

`pillar`/`purpose`/`task_title` ficam congelados no `TASK_INSTANCE` desde a criação (AD-3) — `PILLAR_CONFIG` é consultado uma vez, não a cada leitura. Uma instância nascida de reagendamento (AD-7) usa `rescheduled_from` para apontar pro `task_id` original, em vez de reusar seu id.

### Source tree

```text
{root}/
  template.yaml          # AWS SAM - define Lambdas, DynamoDB, EventBridge Rule, IAM
  src/
    domain/               # regras puras - pilares, checkpoint, resumo semanal (AD-1)
      taskState.ts
      weeklySummary.ts
      pillarPurpose.ts
    handlers/
      skill.ts             # entrypoint ASK SDK - RequestHandlers (AD-2)
      poller.ts             # entrypoint agendado (AD-2)
    infra/
      dynamoTaskRepository.ts
      googleCalendarClient.ts
      alexaTriggerClient.ts
  scripts/
    associar-pilar.ts     # CLI local do usuário - único caminho de escrita em PillarConfig (AD-5)
  test/
    domain/               # testes do domínio, sem mocks de AWS/Alexa
```

## Capability → Architecture Map

| Capability / Área | Vive em | Governado por |
| --- | --- | --- |
| FR-1 (lembrete no horário) | Poller → `reminder-trigger` → Custom Task | AD-3, AD-4 |
| FR-2 (reconexão com propósito) | `src/domain/pillarPurpose.ts` | AD-1 |
| FR-3/FR-4 (checkpoint + retry único) | Skill Handler, sessão ASK SDK | AD-2, AD-3 |
| FR-5 (registro da resposta) | `TaskInstance.status`, `checkpoint_response` | AD-3 |
| FR-6 (reagendamento) | `src/domain/taskState.ts` | AD-3, AD-7 |
| FR-7/FR-8 (resumo semanal agendado) | Rotina de horário fixo → Custom Task; `src/domain/weeklySummary.ts` | AD-4 |
| FR-12 (resumo sob demanda) | Skill Handler, invocação direta (sem Rotina/Trigger) | AD-2 |
| FR-9/FR-10 (conteúdo e fechamento do resumo) | `src/domain/weeklySummary.ts` | AD-1 |
| FR-11 (config de pilar/propósito) | Tabela `PillarConfig` | AD-5 |
| NFR-1 (custo free tier) | Stack inteira (Lambda + DynamoDB + EventBridge — todos com free tier generoso, ver nota em Deferred) | Stack |
| NFR-2 (limitações de sincronização do Calendar) | Poller (intervalo de polling, ver Deferred) | AD-4, Deferred |
| NFR-3 (tom de voz) | `src/domain/` — texto das falas centralizado, nunca hardcoded nos handlers | AD-1 |

## Deferred

- **Intervalo exato do polling** (ex.: 10 min vs 15 min) — ajustar na implementação junto com o orçamento de free tier do EventBridge/Lambda; é a alavanca real por trás do NFR-2, mas não muda nenhum AD.
- **Região AWS exata** — provavelmente `us-east-1` (a maioria dos endpoints da Alexa Skills Kit historicamente exige essa região), mas não verificado contra a documentação atual nesta sessão — confirmar antes do primeiro deploy.
- **Versão exata do cliente `googleapis`** e do **AWS SDK v3** (`@aws-sdk/client-dynamodb`) — fixar no momento do `npm install`, sem trilha de pesquisa nesta sessão.
- **Diretivas de Custom Task no `ask-sdk-core` 2.14.0** — se o SDK não tiver builder tipado pra Custom Task/Dialog (SDK sem release recente), construir o JSON da diretiva manualmente; não afeta a arquitetura, é detalhe de implementação.
- **Estratégia de teste de integração** (como testar o fluxo Rotina → Custom Trigger → Skill sem um dispositivo Echo físico) — não decidido; provavelmente mock manual durante o build.
- **Operações do Poller** — é o único ponto de disparo de todo o mecanismo de lembrete/checkpoint (AD-4); se ele falhar silenciosamente, o produto para sem ninguém notar. Direção: CloudWatch Alarm no erro do Lambda do Poller, com notificação por e-mail (SNS) — a implementar, não é um AD porque não é um ponto onde duas unidades poderiam divergir, é só um "não deixar isso mudo".
- **Armazenamento e refresh do token OAuth do Google Calendar** — provavelmente Secrets Manager ou variável de ambiente do Lambda; não decidido nesta sessão.
- **Setup manual do usuário na Alexa (fora do código)**: criar as Rotinas que ligam os Custom Triggers e horários fixos às Custom Tasks da Skill — mínimo de 4: `reminder-trigger` → Custom Task de lembrete; `checkpoint-trigger` → Custom Task de checkpoint; sexta 18h → Custom Task de resumo semanal; domingo 20h → mesma Custom Task de resumo. Passo novo em relação ao que PRD/UX previam (que só falavam em config manual de pilares no backend) — vai precisar de um roteiro passo a passo no momento do build.
- **Apoio durante a execução da tarefa (mid-task)** e **configuração de pilar por voz** — fora de escopo da v1 por decisão do PRD; não têm arquitetura aqui.
