---
name: Assistente de Produtividade Pessoal com Alexa
status: final
updated: 2026-09-23
sources:
  - _bmad-output/planning-artifacts/prds/prd-teste1-2026-09-17/prd.md
  - _bmad-output/planning-artifacts/briefs/brief-teste1-2026-09-15/brief.md
---

# Assistente de Produtividade Pessoal com Alexa — Experience Spine

## Foundation

Superfície única: voz, via um dispositivo Alexa (Echo) — **[ASSUMPTION: apenas um dispositivo na casa; sem lógica de seleção/roteamento entre dispositivos]**. Skill customizada (Alexa Custom Skill, não Routines/Blueprints puro), com modelo de interação próprio — não herda um UI system visual porque não há UI visual. `DESIGN.md` cobre só a personalidade da voz; este arquivo cobre o comportamento.

**[ASSUMPTION: nome de invocação da Skill ainda não definido — usado como `{nome-da-skill}` neste documento; a definir na arquitetura/build.]**

A associação entre evento do calendário e pilar/propósito (FR-11 do PRD) é feita manualmente pelo próprio usuário direto no backend — não existe intent de voz nem tela pra isso. Fora de escopo desta spine por design: essa configuração não tem superfície de experiência na v1.

As assumptions do FR-3 do PRD (eventos do calendário sem horário de fim explícito; tarefas de pilares diferentes sobrepostas) valem também aqui — comportamento não definido nesses casos nesta v1. Ver `prd.md` § Assumptions Index; não duplicado neste documento.

## Information Architecture

Não há telas — a "arquitetura de informação" de uma Skill de voz é o conjunto de intents que ela reconhece e quando cada um está disponível.

| Intent | Disparado por | Disponível quando |
|---|---|---|
| `ReminderDelivery` | Rotina agendada (horário de início da tarefa, FR-1) | Sempre — proativo |
| `CheckpointQuestion` | Rotina agendada (fim da janela da tarefa, FR-3) | Sempre — proativo |
| `CheckpointYesIntent` / `CheckpointNoIntent` | Resposta verbal do usuário | Estado `AwaitingCheckpointResponse` / `AwaitingCheckpointRetry` |
| `RescheduleTimeIntent` (slot: novo horário/dia) | Resposta verbal após `CheckpointNoIntent` | Estado `AwaitingReschedule` |
| `WeeklyAvailabilityQuestion` | Rotina agendada (sexta 18h, retry domingo 20h — FR-7/FR-8) | Sempre — proativo |
| `AvailabilityYesIntent` / `AvailabilityNoIntent` | Resposta verbal do usuário | Estado `AwaitingWeeklyAvailability(Retry)` |
| `WeeklySummaryOnDemandIntent` (FR-12) | Usuário chama a Skill espontaneamente ("Alexa, pergunta ao {nome-da-skill} o resumo da semana") | Sempre — sob demanda |
| `AMAZON.FallbackIntent` | Fala não reconhecida | Qualquer estado aguardando resposta |
| `AMAZON.StopIntent` / `AMAZON.CancelIntent` | "para", "cancela" | Qualquer estado ativo |

`WeeklySummaryOnDemandIntent` surgiu neste discovery de UX e foi formalizado no PRD como FR-12.

## Voice and Tone

Microcopy — a postura de marca ("parceiro compreensivo") vive em `DESIGN.md.Brand & Style`; aqui vão as frases-modelo por situação.

| Situação | Frase-modelo | Evitar |
|---|---|---|
| Lembrete (FR-2) | "Olá Lucas, vamos trabalhar nas tarefas de [pilar] que você programou pra hoje? Isso vai te ajudar a [propósito]." | Ler só o título do evento, sem propósito. |
| Checkpoint | "Você executou as tarefas programadas pra hoje?" | Perguntas longas ou com juízo de valor embutido. |
| Checkpoint — sim | (confirmação curta, sem elogio efusivo — registra e segue) | Elogio exagerado tipo "Parabéns, você é incrível!" |
| Checkpoint — não (FR-6) | "Tudo bem, registrado aqui — não deixe de fazer isso em outro momento. Que tal tentarmos [novo horário]?" | "Você prometeu e não fez", qualquer cobrança ou comparação. |
| Reprompt por silêncio | "Lucas, você continua por aí?" | Repetir a pergunta original ao pé da letra na segunda tentativa. |
| Disponibilidade do resumo | "Posso fazer o resumo semanal agora? Você está disponível?" | Pular direto para os números sem perguntar. |
| Resumo — indisponível | (reconhece e informa o retry) "Sem problema, eu tento de novo no domingo." | Insistir na hora ou pressionar. |
| Resumo — abertura | "Bom, Lucas, essa semana você fez [%] do que estava programado no pilar [X]..." | Começar pelo que não foi feito. |
| Resumo — fechamento | Mensagem de encorajamento ligada ao propósito maior (FR-10) | Fechar só com números, sem contexto emocional. |

Vocabulário de confirmação deve aceitar variação natural, não só "sim"/"não" literais — **[ASSUMPTION: o modelo de intent do Alexa NLU mapeia sinônimos comuns ("fiz", "consegui", "não deu", "ainda não") para `CheckpointYesIntent`/`CheckpointNoIntent`; lista exata de utterances a definir na arquitetura.]**

Duas resoluções tonais do brief original, registradas aqui em vez de deixadas implícitas:
- **Cadência dos lembretes**: o brief pede lembretes "frequentes e sutis ao longo do dia"; esta spine segue a decisão do PRD de um único lembrete + silêncio até o checkpoint (trade-off já registrado no PRD, § Fora do Escopo v1). A "frequência" do produto acontece entre tarefas diferentes ao longo do dia, não dentro de uma mesma tarefa.
- **"Relatório de vergonha" → encorajamento**: o brief batiza o resumo semanal de "relatório de vergonha", mas o tom especificado (NFR-3, "nunca punitivo") resolve isso a favor do encorajamento — leitura fiel ao espírito do brief ("parceiro compreensivo" no seu próprio Executive Summary), mas uma resolução deliberada, não uma continuidade automática.

## Component Patterns

Comportamental — não há especificação visual (não existe `DESIGN.md.Components` para este produto).

| Padrão | Uso | Regra comportamental |
|---|---|---|
| Lembrete proativo | Início da janela da tarefa | Dispara uma vez; sem repetição se ignorado (não há checkpoint nesse momento). |
| Checkpoint sim/não | Fim da janela da tarefa | Exige resposta verbal; ver Reprompt Pattern abaixo. |
| Sugestão de reagendamento | Após `CheckpointNoIntent` | Alexa propõe ativamente um horário — não pergunta em aberto "quando você quer remarcar?" sem alternativa. |
| Gate de disponibilidade | Antes do resumo semanal | Pergunta sim/não antes de entregar conteúdo — nunca invade com o resumo sem esse aceite. |
| Leitura por pilar | Corpo do resumo semanal | Lista sequencial pilar a pilar: % + tarefas feitas + tarefas não feitas, por pilar. Checkpoints sem resposta (FR-5) contam como não feitas no % e na lista — a spine de voz não abre uma terceira categoria audível, mas o dado fica registrado distintamente no backend para uso futuro (ex.: relatórios mais ricos em v2). |
| Resumo sob demanda | `WeeklySummaryOnDemandIntent` | Mesma leitura por pilar do resumo agendado — sem o gate de disponibilidade (o usuário já pediu). |

## State Patterns

| Estado | Entrada | Saída |
|---|---|---|
| `Idle` | — | `ReminderDelivery` dispara → segue vida normal (sem estado de sessão ativo) |
| `AwaitingCheckpointResponse` | `CheckpointQuestion` disparado | Resposta em até ~10s → registra; silêncio → `AwaitingCheckpointRetry` |
| `AwaitingCheckpointRetry` | Silêncio em `AwaitingCheckpointResponse`, ou fala não reconhecida | Resposta em até ~10s → registra; silêncio de novo → `SessionEnded` (sem novas tentativas, FR-4) |
| `AwaitingReschedule` | `CheckpointNoIntent` recebido | Novo horário aceito → registra reagendamento → `SessionEnded` |
| `AwaitingWeeklyAvailability` | `WeeklyAvailabilityQuestion` disparado (sexta 18h) | Sim → `DeliveringWeeklySummary`; não → agenda retry de domingo 20h; silêncio ~10s → `AwaitingWeeklyAvailabilityRetry` |
| `AwaitingWeeklyAvailabilityRetry` | Silêncio em `AwaitingWeeklyAvailability` | Resposta → segue fluxo; silêncio de novo → aguarda retry de domingo |
| `DeliveringWeeklySummary` | Disponibilidade confirmada (agendado ou sob demanda) | Leitura completa por pilar → fechamento de encorajamento → `SessionEnded` |
| `SessionEnded` | Qualquer fluxo completo ou abandonado | Volta a `Idle` |

## Interaction Primitives

- **Confirmação sim/não**: padrão em todo ponto de decisão (checkpoint, disponibilidade). Aceita variação natural de fala, não só "sim"/"não" literais.
- **Reprompt único por silêncio**: ~10s de espera → repete a pergunta (frase de reprompt, não idêntica à original) → ~10s de espera → encerra sem nova tentativa. Mesmo orçamento vale para fala não reconhecida (`AMAZON.FallbackIntent` consome a mesma tentativa de retry, não abre uma terceira chance).
- **Barge-in permitido**: o usuário pode interromper a Alexa no meio da fala em qualquer momento para responder — não precisa esperar ela terminar.
- **Sugestão ativa, não pergunta aberta**: ao reagendar, a Alexa propõe um horário concreto em vez de perguntar "quando você quer?" — reduz a carga cognitiva no momento em que o usuário já falhou a tarefa.
- **Stop/Cancel padrão Alexa**: `AMAZON.StopIntent`/`AMAZON.CancelIntent` interrompem qualquer fluxo ativo a qualquer momento, sem pergunta de confirmação.

## Accessibility Floor

Comportamental — não há contraste visual a especificar (produto sem tela).

- **Sem literais rígidos**: todo ponto de confirmação sim/não deve aceitar sinônimos naturais, não forçar o usuário a decorar uma palavra exata.
- **Cadência**: falas da Alexa em frases curtas e completas — sem parágrafos longos que dependem de retenção auditiva de várias sentenças.
- **Tolerância de tempo**: ~10s de espera antes de reprompt (não é um teste de reflexo); ver Interaction Primitives.
- **Previsibilidade**: a mesma situação sempre gera a mesma estrutura de fala (ver Voice and Tone) — reduz carga cognitiva de decorar variações.
- **Sem dependência de dispositivo com tela**: toda a experiência funciona em um Echo sem tela; se um Echo Show entrar no setup futuramente, isso é aditivo, nunca uma dependência da v1.

## Key Flows

### Flow 1 — Loop diário (Lucas, início da tarde, dia de semana comum)

1. No horário programado, a Alexa dispara o lembrete: *"Olá Lucas, vamos trabalhar nas tarefas do projeto de modelagem de negócio que você programou pra hoje? Isso vai te ajudar a conseguir uma renda extra no futuro próximo."*
2. Lucas confirma verbalmente e começa a trabalhar. Nenhuma interação da Alexa até o fim da janela — silêncio proposital (ver trade-off registrado no PRD).
3. Ao final da janela, a Alexa pergunta: *"Você executou as tarefas programadas pra hoje?"*
4. **Climax**: Lucas admite que não conseguiu. A Alexa responde sem cobrança — *"Tudo bem, registrado aqui, não deixe de fazer isso em outro momento"* — e já sugere um novo horário pra reprogramar. É o momento exato em que o tom "parceiro compreensivo" precisa segurar: é fácil escorregar pra cobrança aqui, e é aqui que o produto ganha ou perde a confiança do usuário pra continuar respondendo aos checkpoints no futuro.
5. Lucas aceita o novo horário (ou propõe outro). Sessão encerra.

Falha: Lucas não responde ao checkpoint → Alexa insiste uma vez (~10s depois) → silêncio de novo → encerra sem tentar de novo, sem registrar reagendamento algum (fica em aberto até o próximo ciclo natural da tarefa).

### Flow 2 — Resumo semanal agendado (Lucas, sexta-feira, 18h)

1. A Alexa pergunta: *"Posso fazer o resumo semanal agora? Você está disponível?"*
2. Lucas confirma disponibilidade.
3. A Alexa percorre os 4 pilares, um a um: percentual de tarefas concluídas + lista nominal do que foi feito e do que ficou pra trás.
4. **Climax**: chega a vez do pilar Projetos Pessoais — o projeto de negócio parado há um ano, desenvolvido junto com um amigo, com um compromisso social real por trás (não é só uma tarefa pessoal esquecida). O número desse pilar específico é o que realmente importa (SM-2 no PRD); é o momento em que o resumo deixa de ser estatística e vira o termômetro real do propósito do produto — e da promessa feita a outra pessoa.
5. A Alexa encerra com uma mensagem de encorajamento ligada ao propósito maior.

Falha: Lucas não está disponível na sexta → Alexa reconhece e agenda retry pra domingo, 20h → mesmo fluxo se repete lá.

### Flow 3 — Resumo sob demanda (Lucas, num sábado qualquer, curioso sobre o andamento)

1. Lucas chama a Skill espontaneamente: *"Alexa, pergunta ao {nome-da-skill} o resumo da semana."*
2. A Alexa entrega o mesmo conteúdo do Flow 2 (passos 3–5), sem o gate de disponibilidade — o pedido explícito do usuário já é o consentimento.
