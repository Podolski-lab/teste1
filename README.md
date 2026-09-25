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
