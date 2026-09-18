---
title: Assistente de Produtividade Pessoal com Alexa
status: draft
created: 2026-09-17
updated: 2026-09-18
---

# PRD: Assistente de Produtividade Pessoal com Alexa

## Overview

Skill customizada para Alexa que transforma tarefas dos 4 pilares de vida do usuário (Saúde, Profissional, Projetos Pessoais, Lazer) em lembretes de voz e checkpoints verbais ao longo do dia, lendo horários do Google Calendar. O problema não é falta de clareza sobre o que fazer, é falta de pressão externa para executar — um projeto de negócio parado há um ano é a prova concreta disso. A Skill supre essa pressão com tom de parceiro compreensivo, nunca punitivo.

Projeto pessoal, hobby, usuário único (o próprio criador), sem pretensão de mercado, construído como Skill customizada (AWS Lambda + Google Calendar API) dentro do free tier da AWS.

## Jornadas de Uso

### UJ-1: Loop diário — lembrete, execução, checkpoint

No horário programado no Google Calendar para uma tarefa de um pilar, a Alexa avisa e reconecta a tarefa ao propósito maior: *"Olá Lucas, vamos trabalhar nas tarefas do projeto de modelagem de negócio que você programou pra hoje? Isso vai te ajudar a conseguir uma renda extra no futuro próximo."* O usuário confirma verbalmente e inicia a execução — sem nenhum toque intermediário da Alexa durante esse tempo.

Ao final da janela programada, a Alexa retorna com o checkpoint: *"Você executou as tarefas programadas pra hoje?"*

- **Se sim**: registrado, segue o dia.
- **Se não**: a Alexa responde de forma compreensiva ("tudo bem, registrado aqui, não deixe de fazer isso em outro momento") e **sugere ativamente um novo horário** pra reprogramar a tarefa.
- **Se não houver resposta**: a Alexa insiste uma vez ("Lucas, você continua por aí?"). Se o silêncio persistir, encerra sem tentar de novo.

### UJ-2: Resumo semanal

Reservado para sexta-feira à tarde. A Alexa primeiro pergunta se o usuário está disponível para o resumo. Se **não estiver disponível**, ela tenta de novo no domingo, no final da tarde/noite.

Quando o usuário confirma disponibilidade, a Alexa apresenta o balanço da semana por pilar: percentual de tarefas programadas concluídas, e a lista nominal do que foi feito e do que ficou pra trás em cada pilar. Encerra com uma mensagem de encorajamento ligada ao propósito maior.

## Requisitos Funcionais

**Lembretes & Reconexão de Propósito**
- **FR-1**: A Skill deve emitir um lembrete de voz no horário de início de cada tarefa programada, lido do Google Calendar.
- **FR-2**: Cada lembrete deve reconectar a tarefa ao propósito maior associado ao seu pilar, não apenas nomear a tarefa.

**Checkpoint & Registro**
- **FR-3**: Ao final da janela de tempo programada da tarefa, a Skill deve emitir um checkpoint perguntando se a tarefa foi executada, exigindo resposta verbal (sim/não).
- **FR-4**: Se não houver resposta ao checkpoint, a Skill deve insistir uma única vez; na ausência de resposta na segunda tentativa, deve encerrar sem novas tentativas.
- **FR-5**: A resposta ao checkpoint (feita, não feita, sem resposta) deve ser registrada para uso no resumo semanal.

**Reprogramação**
- **FR-6**: Quando o usuário reportar que não executou a tarefa, a Skill deve responder em tom compreensivo (nunca punitivo) e sugerir ativamente um novo horário para reprogramá-la.

**Resumo Semanal**
- **FR-7**: A Skill deve iniciar um resumo semanal às sextas-feiras à tarde, perguntando antes se o usuário está disponível.
- **FR-8**: Se o usuário não estiver disponível na sexta, a Skill deve tentar novamente no domingo, no final da tarde/noite.
- **FR-9**: O resumo semanal deve apresentar, por pilar, o percentual de tarefas programadas concluídas e a lista nominal das tarefas feitas e não feitas.
- **FR-10**: O resumo semanal deve encerrar com uma mensagem de encorajamento conectada ao propósito maior do usuário.

**Configuração de Pilares & Propósitos**
- **FR-11**: Cada evento do Google Calendar deve poder ser associado a um pilar (Saúde, Profissional, Projetos Pessoais, Lazer) e a um propósito maior. Na v1, essa associação é feita manualmente pelo próprio usuário diretamente no backend — sem comando de voz ou interface de configuração na Skill.

## Requisitos Não-Funcionais

- **NFR-1 (Custo)**: A operação deve se manter dentro do free tier da AWS (~R$0/mês de infraestrutura).
- **NFR-2 (Integração)**: A Skill depende da integração nativa Alexa ↔ Google Calendar, que não suporta tags por pilar nem sincronização instantânea (ver `addendum.md` do brief) — a associação de pilar/propósito é responsabilidade da configuração manual (FR-11), não da API do calendário.
- **NFR-3 (Tom de voz)**: Toda interação falada — lembrete, checkpoint, reprogramação, resumo — deve manter o tom de parceiro compreensivo: firme o bastante para não deixar passar em branco, nunca punitivo.

## Métricas de Sucesso

- **Uso sustentado**: resposta ativa a lembretes/checkpoints em pelo menos 5 de 7 dias da semana, por pelo menos 4 semanas seguidas.
- **Movimento no pilar mais travado**: pelo menos 1 marco concreto de progresso por mês no projeto de negócio parado, depois de ativar o assistente.
- **Equilíbrio entre pilares**: nenhum dos 4 pilares fica mais de 1 semana sem receber atenção/resposta (visível no resumo semanal).
- **Custo operacional**: dentro do free tier da AWS.
- **Contra-métrica**: se o uso virar fardo — o usuário passa a ignorar sistematicamente os checkpoints ou cogita desativar a Skill — isso é sinal de falha mesmo que a métrica de frequência de uso esteja batendo. O tom (NFR-3) existe justamente para evitar esse efeito.

## Fora do Escopo v1 / Candidatos v2

Do brief original:
- Detecção de presença (pausar alertas fora de casa)
- Som de progresso / reforço positivo sonoro
- Briefing semanal falado mais detalhado
- Sugestão automática de post no LinkedIn
- Termômetro de abandono por pilar
- Check de energia antes de sugerir tarefa
- Rebalanceamento automático por evento inesperado no calendário

Surgidos durante este discovery (ver `addendum.md` deste PRD):
- Apoio durante a execução da tarefa: lembrete não-verbal sutil, quebra da tarefa em passos consultáveis por voz, ou modo Pomodoro. Nenhum entra na v1 — a execução fica em silêncio entre o lembrete e o checkpoint.
- Configuração de pilar/propósito por comando de voz ou interface na própria Skill (v1 é manual, direto no backend).
