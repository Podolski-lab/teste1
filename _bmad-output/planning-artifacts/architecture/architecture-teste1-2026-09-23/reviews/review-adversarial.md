---
name: 'Review adversarial — ARCHITECTURE-SPINE'
type: architecture-review
lens: adversarial
target: _bmad-output/planning-artifacts/architecture/architecture-teste1-2026-09-23/ARCHITECTURE-SPINE.md
created: '2026-09-23'
---

# Review adversarial — ARCHITECTURE-SPINE

Método: para cada AD-1..AD-6, construí pares de unidades (duas implementações independentes de uma mesma responsabilidade, ou dois Lambdas tocando o mesmo item) que obedecem a letra do AD mas produzem comportamento incompatível em runtime. Cada achado é um buraco que a spine, como está escrita, não fecha.

---

## Buraco 1 — Poller com retry do Lambda dispara `reminder-trigger` duas vezes (pergunta explícita do prompt)

**As duas unidades:** duas implementações plausíveis de `poller.ts` para o fluxo "task pendente → lembrete":

- **Poller A:** `fireTrigger('reminder-trigger', payload)` primeiro, depois `transitionTaskStatus(task, 'lembrete_enviado')`.
- **Poller B:** `transitionTaskStatus(task, 'lembrete_enviado')` primeiro, depois `fireTrigger(...)`.

Ambas passam por `transitionTaskStatus` (AD-3) e usam exatamente os nomes/payload fixos de AD-4. Nenhum AD é violado.

**Como divergem:** Lambda assíncrono (invocado por EventBridge) tem retry automático da própria AWS em caso de erro/timeout. Se o Poller A falhar *depois* de disparar o trigger mas *antes* de escrever `lembrete_enviado`, o retry encontra o item ainda em `pendente` e dispara `reminder-trigger` de novo — o usuário ouve o lembrete (ou a Routine dispara) duas vezes. Se o Poller B falhar *depois* de escrever `lembrete_enviado` mas *antes* de disparar o trigger, o retry vê o item já em `lembrete_enviado`, não repete a transição (ela seria inválida na máquina de estados) e **nunca dispara o trigger** — o lembrete se perde silenciosamente. Duas implementações "corretas" pelo texto da spine produzem, respectivamente, duplicação e perda de eventos.

**Qual AD quase cobre:** AD-4 fixa nomes/payload do trigger mas nada diz sobre ordem trigger-vs-escrita nem sobre idempotência diante de retry. AD-3 fixa a máquina de estados mas não define o que fazer quando uma transição é tentada a partir de um estado que já a "passou".

**AD novo/apertado proposto (estender AD-3 ou criar AD-3b):**
> Toda operação do Poller que causa efeito externo (disparar trigger) deve ser idempotente por `task_id`: a escrita da transição de status em DynamoDB usa `ConditionExpression` (compare-and-swap no estado anterior esperado) e só dispara o trigger *depois* que a escrita for confirmada. Se a escrita falhar por condição não satisfeita (already transitioned), o Poller **não** dispara o trigger de novo. `fireTrigger` nunca deve ocorrer antes da escrita confirmada da transição correspondente.

---

## Buraco 2 — Corrida entre invocações concorrentes do Poller na criação do `TaskInstance`

**As duas unidades:** duas implementações de "descobrir evento novo no Google Calendar e criar o `TaskInstance`":

- **Implementação A:** `GetItem(task_id)` → se não existir, `transitionTaskStatus`/cria com status inicial `pendente` via `PutItem` condicional (`attribute_not_exists(task_id)`).
- **Implementação B:** mesma lógica, mas `PutItem` **sem** `ConditionExpression` (simplesmente escreve se o `GetItem` anterior não achou nada).

**Como divergem:** se uma invocação do Poller demorar mais que o intervalo de ~10 min do EventBridge (ex.: Google Calendar API lenta) e uma segunda invocação começar antes da primeira terminar, ambas podem fazer `GetItem` e não encontrar o item (TOCTOU). A implementação A rejeita a segunda escrita (condição falha) e segue com uma única fonte de verdade. A implementação B deixa a segunda escrita sobrescrever silenciosamente o item criado pela primeira — se a primeira já tiver avançado o status (ex.: `lembrete_enviado`) entre o `GetItem` e o `PutItem` da segunda, o estado regride para `pendente` sem passar por `transitionTaskStatus` no sentido inverso, mas via um `PutItem` de criação que tecnicamente "nunca escreveu `status` fora da função de domínio" na primeira chamada — a segunda invocação, porém, achou o item inexistente por causa da corrida, não por reler o estado atual.

**Qual AD quase cobre:** AD-3 diz "nenhum adaptador escreve o campo `status` diretamente" e enuncia a ordem de transição, mas não exige escrita condicional/atômica nem trata concorrência entre duas invocações do **mesmo** Lambda (só menciona "Poller vs Skill handler").

**AD novo/apertado proposto:**
> Toda escrita em `TaskInstances` (criação ou transição) usa `ConditionExpression` no DynamoDB amarrada ao estado esperado (`attribute_not_exists(task_id)` na criação; `status = <estado_anterior_esperado>` na transição). Uma condição falha é tratada como no-op esperado (log e segue), nunca como erro fatal que force retry do Lambda.

---

## Buraco 3 — Quem transiciona para `aguardando_checkpoint`: Poller ou Skill Handler?

**As duas unidades:** duas formas legítimas de dividir a responsabilidade entre `poller.ts` e `skill.ts` para o fluxo de checkpoint (FR-3/FR-4):

- **Divisão A:** o Poller, ao disparar `checkpoint-trigger`, já chama `transitionTaskStatus(task, 'aguardando_checkpoint')` antes de notificar a Alexa Trigger API — a lógica de "meu invariante" fica no Poller.
- **Divisão B:** o Poller apenas dispara `checkpoint-trigger` (mantendo o item em `lembrete_enviado`); é o `RequestHandler` de `LaunchRequest`/`skill.ts`, ao abrir a sessão da Custom Task, que chama a transição para `aguardando_checkpoint`.

Ambas as divisões respeitam AD-2 ("os handlers só orquestram, chamam `src/domain/`") e AD-3 (a transição sempre passa por `transitionTaskStatus`).

**Como divergem:** a spine (Capability Map: "FR-3/FR-4 → Skill Handler, sessão ASK SDK; governado por AD-2, AD-3") sugere a Divisão B, mas AD-4 também governa FR-3 ("Poller → checkpoint-trigger") e não deixa claro se o Poller já muda o status antes de disparar. Se um dev implementa A no Poller e outro, revisando a Capability Map, implementa B no Skill Handler achando que é *sua* responsabilidade, o sistema acaba com a transição sendo tentada duas vezes por caminhos diferentes — uma delas encontrará o item já em `aguardando_checkpoint` e precisará decidir se isso é erro fatal ou no-op (comportamento não especificado nem aqui nem em `transitionTaskStatus`).

**Qual AD quase cobre:** AD-2 previne que os dois handlers *reimplementem a regra*, mas não previne que os dois handlers *cada um ache que é dono* de disparar a mesma transição.

**AD novo/apertado proposto:**
> Cada transição de status tem exatamente um chamador autorizado, explicitado na Capability Map: `pendente→lembrete_enviado` e `lembrete_enviado→aguardando_checkpoint` são responsabilidade exclusiva do Poller (executadas antes de disparar o trigger correspondente); `aguardando_checkpoint→respondido|sem_resposta` é responsabilidade exclusiva do Skill Handler. O Skill Handler nunca chama `transitionTaskStatus` para o par `pendente→lembrete_enviado` ou `lembrete_enviado→aguardando_checkpoint`, e vice-versa.

---

## Buraco 4 — Contagem do "retry único" do checkpoint: em DynamoDB ou em atributos de sessão do ASK SDK?

**As duas unidades:** duas implementações de FR-4 ("checkpoint + retry único") dentro de `skill.ts`:

- **Implementação A:** contador de retry é um campo persistido no `TaskInstance` (ex.: `checkpoint_retry_count`), incrementado via função de domínio a cada tentativa, lido do DynamoDB em cada invocação.
- **Implementação B:** contador de retry vive em `sessionAttributes` do ASK SDK (estado da sessão de voz gerenciado pela Alexa, não pelo Lambda).

Nenhuma viola AD-1 (domínio puro), AD-2 (é o handler que lê/grava o estado de sessão, não regra de negócio) ou AD-3 (o campo `status` da tabela não é tocado por essa contagem).

**Como divergem:** se a sessão da Custom Task for abandonada (ex.: usuário não responde, dispositivo perde conexão) e o `checkpoint-trigger` for disparado de novo — seja por um retry do Poller (Buraco 1) ou por o usuário reativar a Routine manualmente — a Implementação B começa uma sessão nova com `sessionAttributes` zerados: o limite de "um retry só" é perdido e o usuário pode ser questionado indefinidamente. A Implementação A mantém o contador no DynamoDB e barra corretamente. As duas passam nos critérios de AD-1/AD-2/AD-3 lidos ao pé da letra, mas uma quebra FR-4 sob re-disparo.

**Qual AD quase cobre:** AD-3 fixa o dono do **estado de tarefa** (`status`) mas não diz nada sobre outros campos de controle de fluxo (contador de retry) que também precisam sobreviver entre invocações stateless — e a spine não lista `checkpoint_retry_count` nem no ERD.

**AD novo/apertado proposto:**
> Todo contador ou flag de controle de fluxo que precisa sobreviver a mais de uma invocação de Lambda (ex.: contagem de retry do checkpoint) é persistido em `TaskInstances`, nunca em `sessionAttributes` do ASK SDK. Adicionar `checkpoint_retry_count` ao ERD de `TASK_INSTANCE` e à lista de campos mutados exclusivamente via função de domínio (extensão de AD-3).

---

## Buraco 5 — Reagendamento (FR-6): a Google Calendar é atualizada ou só o DynamoDB local?

**As duas unidades:** duas implementações de "reagendar" em `src/domain/taskState.ts` chamado a partir de `skill.ts`:

- **Implementação A:** ao processar a resposta de voz "reagenda pra amanhã", chama `CalendarClient.updateEvent(...)` (move o evento de origem) e localmente marca o `TaskInstance` atual como `reagendado` com `rescheduled_to` preenchido.
- **Implementação B:** ao processar a mesma resposta, só marca o `TaskInstance` atual como `reagendado`/`rescheduled_to` — sem tocar o Google Calendar, assumindo que o dado "reagendado" já é suficiente e que o Poller vai lidar com isso no próximo ciclo.

Ambas usam `src/domain/taskState.ts` (AD-1), passam a transição por `transitionTaskStatus` (AD-3) e nenhum handler reimplementa a regra (AD-2).

**Como divergem:** na Implementação B, o evento original no Google Calendar continua na data/hora antiga. No próximo ciclo, o Poller relê o Calendar, vê o mesmo `calendar_event_id` na data antiga, calcula o mesmo `task_id = {calendar_event_id}#{data_antiga}` — que já existe e está em estado terminal `reagendado`, então (corretamente) não recria nada. Só que **nenhuma nova tarefa é criada** para a data nova, porque nada no domínio ou no Poller sabe criar proativamente um `TaskInstance` para `rescheduled_to` sem um evento de Calendar correspondente naquela data — FR-6 fica quebrado silenciosamente. Já na Implementação A, o Poller no próximo ciclo vê o evento movido e cria naturalmente um novo `TaskInstance` com `task_id` da nova data — fluxo funciona. As duas implementações passam nos ADs lidos ao pé da letra; só uma delas entrega FR-6 de fato, e a spine não decide qual é a certa.

**Qual AD quase cobre:** Nenhum AD atribui dono a "quem é a fonte de verdade do horário real da tarefa" quando reagendada — AD-3 fala de estado de tarefa em DynamoDB, mas a tarefa em si deriva de um evento externo no Google Calendar, e a spine não resolve a tensão entre as duas fontes de verdade nesse caso.

**AD novo/apertado proposto (extensão de AD-3):**
> Reagendar uma tarefa (FR-6) sempre chama `CalendarClient.updateEvent` (ou cria um evento novo) antes de marcar o `TaskInstance` de origem como `reagendado`. Nenhuma transição para `reagendado` é considerada completa (e a função de domínio deve falhar/reverter) se a chamada ao `CalendarClient` não confirmar a mudança — o Google Calendar continua sendo a fonte de verdade sobre *quando* a tarefa acontece; o DynamoDB é fonte de verdade só sobre o *estado de acompanhamento* daquela instância.

---

## Buraco 6 — Owner de `pillar`/`purpose` em `TaskInstance`: gravado uma vez ou recalculado a cada leitura?

**As duas unidades:** duas leituras plausíveis de como `TaskInstance.pillar`/`TaskInstance.purpose` (campos que existem no ERD, redundantes com a resolução via `PillarConfig`) são preenchidos:

- **Leitura A:** o Poller resolve `pillar`/`purpose` via `PillarConfig` **uma vez**, no momento em que cria o `TaskInstance`, e grava nos campos — são um snapshot congelado; o Skill Handler, no checkpoint, **lê os campos já gravados** no `TaskInstance` (nunca reconsulta `PillarConfig`).
- **Leitura B:** o Skill Handler, ao montar a fala de reconexão com o propósito (FR-2) no checkpoint, chama de novo `pillarPurpose.ts` contra o `PillarConfig` atual em vez de usar os campos já persistidos no `TaskInstance` — para "estar sempre atualizado".

Ambas chamam a mesma função de domínio (AD-1), nenhum handler reimplementa regra (AD-2), e `PillarConfig` continua somente-leitura do ponto de vista da aplicação (AD-5).

**Como divergem:** como `PillarConfig` é editável fora da aplicação a qualquer momento (AD-5 permite isso deliberadamente), se o usuário editar a associação evento↔pilar entre o disparo do lembrete e a resposta do checkpoint (minutos ou horas depois), a Leitura B faz o Skill Handler falar um pilar/propósito diferente do que foi anunciado no lembrete original — inconsistência perceptível para o usuário dentro da mesma instância de tarefa. A Leitura A é consistente por construção. Nenhum AD determina qual comportamento é o certo; os dois são "válidos" architecturalmente.

**Qual AD quase cobre:** AD-5 define que `PillarConfig` é só-leitura e não exige redeploy para mudar, mas não define o *momento* de resolução (bind-time vs read-time) nem que `TaskInstance.pillar/purpose` é um snapshot imutável pós-criação.

**AD novo/apertado proposto (extensão de AD-3/AD-5):**
> `TaskInstance.pillar` e `TaskInstance.purpose` são resolvidos contra `PillarConfig` uma única vez, no momento da criação do `TaskInstance` pelo Poller, e tratados como snapshot imutável dali em diante. Nenhum handler (Skill ou Poller) reconsulta `PillarConfig` para uma instância de tarefa já criada — toda leitura subsequente (lembrete, checkpoint, resumo semanal) usa os campos já gravados no `TaskInstance`.

---

## Resumo dos buracos

| # | Par de unidades | AD que quase cobre | AD novo/apertado |
| --- | --- | --- | --- |
| 1 | Poller A (trigger→write) vs Poller B (write→trigger) sob retry de Lambda | AD-4 | Escrita condicional antes do trigger; trigger só após confirmação |
| 2 | Criação de `TaskInstance` com `PutItem` condicional vs incondicional sob invocações concorrentes do Poller | AD-3 | `ConditionExpression` obrigatória em toda escrita de `TaskInstances` |
| 3 | Poller vs Skill Handler, cada um achando que é dono da transição para `aguardando_checkpoint` | AD-2 | Dono único e explícito por transição na Capability Map |
| 4 | Contador de retry do checkpoint em DynamoDB vs em `sessionAttributes` do ASK SDK | AD-3 (implícito) | Contadores de fluxo persistidos em `TaskInstances`, nunca em sessão |
| 5 | Reagendamento que move o evento no Google Calendar vs que só marca o DynamoDB local | (nenhum) | Reagendar exige confirmação do `CalendarClient` antes de marcar `reagendado` |
| 6 | `pillar`/`purpose` como snapshot no `TaskInstance` vs recalculado a cada leitura contra `PillarConfig` | AD-5 (parcial) | `TaskInstance.pillar/purpose` é snapshot imutável pós-criação |

**Total: 6 buracos.**
