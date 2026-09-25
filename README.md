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

O Lambda `assistente-pessoal-poller` (criado pelo `sam deploy` do passo 2) roda a cada 10 minutos, lê os eventos de **hoje** do seu Google Calendar pessoal e cria um item em `TaskInstances` (`status: pendente`) para cada evento cujo título casa exatamente com uma entrada de `PillarConfig` (passo 5). Re-poller do mesmo evento nunca duplica — a criação é idempotente por `task_id`. Não lida ainda com lembrete/checkpoint por voz (Stories 1.4/1.5) nem com eventos de dia inteiro (sem horário).

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
