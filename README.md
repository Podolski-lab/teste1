# teste1
Primeiro teste com Claude Code

## Setup

Backend de uma Alexa Custom Skill (invocação: **"assistente pessoal"**), implantado via AWS SAM. Esta story (1.1) entrega só o Lambda que responde à abertura da skill — sem persistência (nenhuma tabela DynamoDB ainda).

Nenhuma credencial AWS ou Alexa é usada durante a implementação; deploy e cadastro na Alexa são passos manuais que você mesmo executa, na sua própria conta.

### 1. Instalar dependências e validar localmente

```bash
npm install
npm run build   # checagem de tipos TypeScript
npm test        # roda test/handlers/skill.test.ts
sam validate --lint
```

### 2. Deploy do backend (AWS)

Requer [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) e credenciais AWS configuradas na sua máquina (`aws configure`).

```bash
sam build
sam deploy --guided
```

No modo guiado, escolha a região `us-east-1` (recomendada para endpoints da Alexa Skills Kit). Ao final, o comando imprime o **ARN do Lambda** (`SkillHandlerFunctionArn` nos Outputs) — copie-o, você vai precisar dele no próximo passo.

Isso cria só o Lambda `assistente-pessoal-skill-handler`, seu IAM role (permissão apenas de CloudWatch Logs) e o log group. Nenhuma tabela DynamoDB é criada nesta story.

### 3. Cadastrar a skill no Alexa Developer Console

1. Acesse o [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) e crie uma nova skill:
   - Nome/idioma padrão: **pt-BR**
   - Modelo: **Custom**
   - Hosting: **Provision your own** (o backend é o Lambda que você já implantou)
2. Na aba **Build > Interaction Model > JSON Editor**, cole o conteúdo de `skill-package/interactionModels/custom/pt-BR.json` (invocação `assistente pessoal` + intents padrão `AMAZON.CancelIntent`/`AMAZON.StopIntent`/`AMAZON.HelpIntent`/`AMAZON.FallbackIntent`) e clique em **Save Model** > **Build Model**.
3. Na aba **Build > Endpoint**, escolha **AWS Lambda ARN** e cole em "Default Region" o ARN copiado no passo 2 (`SkillHandlerFunctionArn`). Salve.
4. De volta no console AWS, adicione um **trigger "Alexa Skills Kit"** ao Lambda `assistente-pessoal-skill-handler`, informando o **Skill ID** (visível no topo da página da skill, em Developer Console). Isso concede à Alexa permissão para invocar o Lambda — sem esse passo o endpoint responde com erro de permissão.
5. (Opcional) Revise `skill-package/skill.json` — ele traz o texto de publicação (nome, resumo, categoria) que também pode ser preenchido manualmente em **Distribution** no console; o `apis.custom.endpoint.uri` do arquivo é só um placeholder de referência, o endpoint real é configurado no passo 3.

### 4. Testar

Na aba **Test** do Developer Console, habilite o modo **Development**, e diga (ou digite):

> Alexa, abrir assistente pessoal

O Lambda deve responder com uma fala de boas-vindas em português e encerrar a sessão. Ainda não há mais nenhuma intent custom respondendo além dos handlers padrão (cancelar/parar/ajuda/fallback) — isso é conteúdo de stories futuras.

### 5. Associar pilar e propósito a um evento de calendário (Story 1.2)

A tabela `PillarConfig` (criada pelo `sam deploy` do passo 2) guarda o mapeamento `evento de calendário → pilar/propósito` que o Poller (Story 1.3) vai usar para resolver o pilar de uma tarefa. Ela é escrita **somente** pelo script local `scripts/associar-pilar.ts` — nenhum Lambda lê ou escreve essa tabela nesta story.

Requer credenciais AWS próprias configuradas localmente (`aws configure`), com permissão de escrita na tabela `PillarConfig`, e que `sam deploy` já tenha sido executado (passo 2).

```bash
npm run associar-pilar -- "nome do evento" saude "chegar na meta de dezembro"
```

- O **nome do evento** é usado literalmente como chave primária (sem wildcard/regex — o casamento com eventos reais do Calendar é definido na Story 1.3).
- O **pilar** precisa ser um dos quatro valores fixos (case-insensitive): `saude`, `profissional`, `projetos-pessoais`, `lazer`. Qualquer outro valor é rejeitado, sem gravação.
- Rodar o comando de novo para o mesmo nome de evento **atualiza** o item existente (upsert), em vez de criar um duplicado.
- Por padrão usa a região `us-east-1`; para usar outra, defina `AWS_REGION` no ambiente antes de rodar o comando.

### 6. Detectar tarefas do dia (Poller)

O Lambda `assistente-pessoal-poller` (criado pelo `sam deploy` do passo 2) roda a cada 10 minutos, lê os eventos de **hoje** do seu Google Calendar pessoal e cria um item em `TaskInstances` (`status: pendente`) para cada evento cujo título casa exatamente com uma entrada de `PillarConfig` (passo 5). Re-poller do mesmo evento nunca duplica — a criação é idempotente por `task_id`. Não lida ainda com checkpoint por voz (Story 1.5) nem com eventos de dia inteiro (sem horário). O lembrete de voz em si (falar o pilar/propósito no horário da tarefa) é a Story 1.4, seção 7 abaixo.

Nenhuma credencial Google é usada ou solicitada durante a implementação (AD-6) — os passos abaixo você executa na sua própria conta, fora desta sessão.

#### 6.1 Criar a service account no Google Cloud Console

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie (ou reutilize) um projeto.
2. Em **APIs e serviços > Biblioteca**, ative a **Google Calendar API**.
3. Em **APIs e serviços > Credenciais > Criar credenciais > Conta de serviço**, crie uma service account (não precisa de papéis/roles de projeto — o acesso ao calendário vem do compartilhamento no passo 4).
4. Na aba **Chaves** da service account criada, **Adicionar chave > Criar nova chave > JSON** — isso baixa um arquivo `.json` para sua máquina. Guarde-o com cuidado: ele é a credencial completa da service account.
5. Copie o **endereço de e-mail** da service account (algo como `nome@projeto.iam.gserviceaccount.com`, visível na página da conta de serviço).

#### 6.2 Compartilhar seu calendário com a service account

1. Abra o [Google Calendar](https://calendar.google.com/), vá em **Configurações** do seu calendário pessoal (o mesmo onde você marca as tarefas que quer que o assistente detecte).
2. Em **Compartilhar com pessoas específicas**, adicione o e-mail da service account (passo 6.1.5) com a permissão **"Ver todos os detalhes do evento"** ("See all event details").
3. Anote o **ID do calendário** (em **Integrar calendário**) — para o calendário pessoal principal, normalmente é o seu próprio endereço de e-mail do Google.

#### 6.3 Codificar a chave em base64

```bash
base64 -w0 caminho/para/a-chave-baixada.json
```

(no macOS, sem `coreutils`, use `base64 -i caminho/para/a-chave-baixada.json` sem `-w0`.) Copie a saída inteira — é o valor do parâmetro `GoogleServiceAccountKeyBase64` do próximo passo.

#### 6.4 Deploy com os três novos parâmetros

Rode `sam deploy --guided` novamente (ou `sam deploy` puro, se já tiver um `samconfig.toml` de um deploy anterior — nesse caso ele vai pedir só os parâmetros novos). Além dos parâmetros já existentes, informe:

| Parâmetro | Valor |
| --- | --- |
| `GoogleServiceAccountKeyBase64` | a string base64 do passo 6.3 (não é ecoada no terminal — `NoEcho`) |
| `GoogleCalendarId` | o ID do calendário do passo 6.2.3 |
| `UserTimeZone` | seu fuso horário IANA, ex.: `America/Sao_Paulo` |

Isso cria/atualiza a tabela `TaskInstances`, o Lambda `assistente-pessoal-poller` e sua regra do EventBridge (`rate(10 minutes)`) — sem afetar `SkillHandlerFunction` nem `PillarConfig`.

#### 6.5 Verificar

Depois do deploy, crie um evento de teste hoje no seu calendário com o mesmo título já associado no passo 5, e aguarde até 10 minutos. Em **CloudWatch > Log groups > `/aws/lambda/assistente-pessoal-poller`**, cada execução loga uma linha JSON por evento processado (`Poller.event.processed`/`Poller.event.skipped`) — confirme que aparece `"outcome":"created"` para o evento de teste, e que um item com esse `task_id` foi criado na tabela `TaskInstances` (console do DynamoDB).

**Guarde a chave com cuidado**: depois de codificar o arquivo `.json` baixado no passo 6.1.4 em base64 (passo 6.3), apague-o ou guarde-o em um cofre de segredos — ele é uma credencial viva da service account, não um artefato descartável.

#### 6.6 Troubleshooting

- **Erro 403/permission-denied nos logs do CloudWatch**: normalmente significa que o calendário não foi de fato compartilhado com o e-mail da service account (passo 6.2), ou que o e-mail compartilhado (passo 6.1.5) não é o mesmo usado na chave. Confira o compartilhamento e o `GoogleCalendarId` configurado.
- **Erro de autenticação/parsing de JSON**: normalmente significa que a string base64 (passo 6.3) foi copiada incompleta/incorreta, ou que a chave foi baixada de novo (nova chave) sem recodificar e reimplantar o base64 correspondente.

### 7. Lembrete de voz reconectado ao propósito (Story 1.4)

**Aviso antes de começar**: Custom Triggers for Routines é rotulado pela própria Amazon como **"developer preview"** ("might change"). Esta sessão não teve acesso a `developer.amazon.com` (rede bloqueada) pra confirmar o schema atual — `skill-package/skill.json` (`apis.custom.tasks`) e `skill-package/taskDefinitions/reminderCheckIn.json` são melhor esforço, construídos a partir da estrutura publicamente documentada. **Cruze os dois contra a documentação oficial da Amazon antes de registrar a Custom Task no Developer Console.** Por decisão do usuário, esta story foi construída e testada só contra a **stage de desenvolvimento** da skill — nenhuma certificação/publicação foi feita nem é assumida aqui, e a Amazon não documenta garantia de funcionamento indefinido sem certificação.

A partir de agora, o Poller (a cada execução) também: encontra `TaskInstance`s `pendente`s cujo `reminder_at` já chegou, transiciona cada uma pra `lembrete_enviado` (idempotente, via `ConditionExpression` — um retry do Lambda nunca dispara duas vezes) e dispara o Custom Trigger `reminder-trigger` (payload `{ task_id }`) via Alexa Routines Trigger Instance API. Do lado da Skill, um novo handler responde à Custom Task correspondente: lê a `TaskInstance` pelo `task_id` e fala o lembrete reconectado ao pilar/propósito — nunca só o título do evento.

#### 7.1 Obter as credenciais de Alexa Skill Messaging

1. No [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask), abra a skill criada no passo 3 e vá em **Permissions**.
2. Habilite **Send Alexa Events** (às vezes listado como "Alexa Skill Messaging" ou similar, conforme a versão atual do console).
3. Copie o **Client ID** e o **Client Secret** exibidos ali — são as credenciais que o Poller usa pra trocar por um access token via LWA (`client_credentials` grant) na hora de disparar `reminder-trigger`. Guarde-os com o mesmo cuidado da chave do Google (passo 6): são segredos, nunca solicitados nesta sessão de implementação (AD-6).

#### 7.2 Registrar a Custom Task e o Custom Trigger (manual, fora desta sessão)

Esta etapa é feita inteiramente por você no Developer Console/SMAPI — não há CLI/script aqui pra ela, porque a sessão não tinha acesso à documentação oficial pra automatizar com confiança.

1. Na aba **Build > Custom > Interfaces** (ou onde o console atual expuser Custom Tasks), registre a Custom Task `ReminderCheckIn` versão `1`, usando `skill-package/taskDefinitions/reminderCheckIn.json` como referência do schema de entrada (`task_id`, string) — **confira contra a documentação atual antes de salvar**, esse arquivo é melhor esforço (seção 7, aviso acima).
2. Registre o Custom Trigger `reminder-trigger` (nome fixo, `kebab-case`) associado a essa skill — é ele que o Poller dispara via `POST /v1/routines/triggerInstances[/stages/development]`.
3. Se o console pedir o `skill-package/skill.json` atualizado (com `apis.custom.tasks`), reenvie-o — o `skill.json` deste repositório já tem a entrada `{ name: "ReminderCheckIn", version: "1" }`.

#### 7.3 Deploy com os três novos parâmetros

Rode `sam deploy --guided` novamente (ou `sam deploy` puro, se já tiver `samconfig.toml`). Além dos parâmetros já existentes, informe:

| Parâmetro | Valor |
| --- | --- |
| `AlexaSkillMessagingClientId` | o Client ID do passo 7.1.3 (`NoEcho`) |
| `AlexaSkillMessagingClientSecret` | o Client Secret do passo 7.1.3 (`NoEcho`) |
| `AlexaTriggerStage` | `development` (padrão — deixe assim; só troque pra `live` depois de certificar a skill, o que esta sessão não faz) |

Isso adiciona as três variáveis de ambiente ao Lambda `assistente-pessoal-poller` e concede a ele leitura em `TaskInstances` (pra encontrar tarefas com lembrete pronto) além da escrita já existente, e concede ao Lambda `assistente-pessoal-skill-handler` leitura em `TaskInstances` (pra montar a fala do lembrete) — sem afetar `PillarConfigTable` nem o schema de `TaskInstancesTable`.

#### 7.4 Criar a Alexa Routine que liga o trigger à Custom Task

1. No app da Alexa (ou no Developer Console, conforme onde Routines com Custom Trigger estiverem disponíveis na sua conta), crie uma nova Rotina.
2. Em **Quando isto acontecer** (When this happens), escolha o Custom Trigger `reminder-trigger` registrado no passo 7.2.2.
3. Em **Adicionar ação** (Add action), escolha a Custom Task `ReminderCheckIn` da skill "assistente pessoal".
4. Mapeie o parâmetro dinâmico: o `task_id` que vem no payload do trigger (`{ task_id }`, AD-4) precisa ser mapeado pro `input.task_id` da Custom Task — o nome exato do campo de mapeamento na UI pode variar conforme a versão do app; é aqui que o valor de `skill-package/taskDefinitions/reminderCheckIn.json` precisa bater com o que o console espera.
5. Salve a Rotina. Repita pra qualquer outro dispositivo/conta onde quiser o lembrete, se aplicável.

#### 7.5 Testar (stage de desenvolvimento)

1. Confirme que a skill está habilitada em modo **Development** (aba Test do Developer Console, mesmo passo 4).
2. Crie/associe um evento de calendário com `reminder_at` daqui a poucos minutos (dentro da janela de até 10 minutos do próximo ciclo do Poller).
3. Em **CloudWatch > Log groups > `/aws/lambda/assistente-pessoal-poller`**, acompanhe as linhas `Poller.reminder.scan`/`Poller.reminder.sent`/`Poller.reminder.already_sent`/`Poller.reminder.failed`. `Poller.reminder.sent` confirma que a transição `pendente -> lembrete_enviado` valeu e que `reminder-trigger` foi disparado.
4. Em **CloudWatch > Log groups > `/aws/lambda/assistente-pessoal-skill-handler`**, confirme `ReminderTask.handled` com `"outcome":"spoken"` depois que a Rotina disparar a Custom Task — e que o dispositivo Alexa realmente fala o lembrete, reconectado ao pilar/propósito configurados no passo 5.
5. No console do DynamoDB, confirme que o item em `TaskInstances` para esse `task_id` tem `status: "lembrete_enviado"`.

#### 7.6 Troubleshooting

- **`Poller.reminder.failed` com erro de autenticação/401 da LWA**: normalmente `AlexaSkillMessagingClientId`/`AlexaSkillMessagingClientSecret` incorretos, ou a permissão **Send Alexa Events** (passo 7.1.2) não foi habilitada/salva.
- **`Poller.reminder.sent` aparece mas a Alexa nunca fala nada**: normalmente a Rotina (passo 7.4) não está configurada, o mapeamento de `task_id` está errado, ou o Custom Trigger/Custom Task registrados (passo 7.2) não batem exatamente com os nomes usados no código (`reminder-trigger`, `ReminderCheckIn` versão `1`).
- **`status` fica em `lembrete_enviado` pra sempre, sem re-tentativa**: comportamento esperado e documentado (ver Design Notes da spec 1.4, "Firing order") — se o disparo do trigger falhar depois da transição, não há retry automático nesta story, pra não reintroduzir disparo duplo. Investigue o log `Poller.reminder.failed` correspondente; não há ação automática de recuperação.
- **`ReminderTask.handled` com `"outcome":"not-found"`**: o `task_id` recebido pela Custom Task não existe em `TaskInstances` — confira se o mapeamento dinâmico da Rotina (passo 7.4.4) está mesmo repassando o `task_id` do payload do trigger, sem alteração.
