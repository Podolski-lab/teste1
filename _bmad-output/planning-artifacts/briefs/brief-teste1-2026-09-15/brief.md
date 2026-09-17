---
title: Assistente de Produtividade Pessoal com Alexa
status: draft
created: 2026-09-15
updated: 2026-09-15
---

# Product Brief: Assistente de Produtividade Pessoal com Alexa

_(rascunho em construção — conversa de discovery em andamento)_

## The Problem

Ter clareza sobre o que precisa ser feito não é o problema. O usuário sabe exatamente quais são as tarefas que o levam adiante em cada frente da sua vida — saúde, carreira, projetos pessoais. O que falta é a pressão externa que transforma essa clareza em execução.

O custo disso é real e mensurável: há um ano, ele se comprometeu com um amigo a estruturar o modelo de negócio de uma ideia de tecnologia que os dois vinham desenvolvendo juntos. Passado esse ano inteiro, **nenhum encaminhamento aconteceu** — não por falta de capacidade ou de plano, mas porque não havia ninguém (nem nada) cobrando essa execução no dia a dia. A ideia continua parada, e a janela de oportunidade que ela representava, também.

Ferramentas de produtividade convencionais (listas de tarefas, calendários, apps de hábito) assumem que a disciplina de *seguir* a lista já existe. Quando ela não existe, a lista vira só mais um lugar onde os planos vão morrer silenciosamente — sem ninguém notando, sem consequência, sem cobrança.

## The Solution

Uma Skill customizada para Alexa que transforma tarefas e compromissos — organizados em 4 pilares de vida (Saúde, Profissional, Projetos Pessoais, Lazer) — em lembretes de voz frequentes e sutis, ativados ao longo do dia sem que o usuário precise abrir um app ou consultar uma lista.

A Skill lê a agenda do Google Calendar do usuário e distribui os lembretes de acordo com os horários programados. Cada lembrete reconecta a tarefa ao seu propósito maior ("você ia treinar hoje pra chegar na meta de dezembro — treinou?"), e pode exigir uma resposta verbal — um compromisso falado que pesa mais do que silenciar uma notificação. Semanalmente, um breve resumo falado reflete de volta o que avançou e o que ficou parado em cada pilar.

O tom é de **parceiro compreensivo**: firme o suficiente para não deixar passar em branco, mas nunca punitivo — mais um aliado que nota quando algo importante está sendo deixado de lado do que um chefe cobrando resultado.

O resultado: uma pressão externa constante e de baixo esforço, que substitui a autocobrança que falha — sem exigir nenhuma disciplina adicional do usuário além de responder quando a Alexa pergunta.

## What Makes This Different

Não existe aqui nenhuma vantagem competitiva no sentido de mercado — isso não compete com Todoist, Google Tasks ou os apps de hábito existentes, nem pretende. A diferença real é o encaixe exato com o problema de uma pessoa só: onde apps genéricos tratam toda tarefa igual, este assistente é desenhado em cima da estrutura real de vida do usuário (os 4 pilares e seus propósitos específicos) e do mecanismo psicológico que comprovadamente falta pra ele — compromisso verbal, não visual.

A vantagem não é técnica nem de mercado. É que ninguém mais vai construir exatamente essa ferramenta pra essa pessoa.

## Who This Serves

**Usuário primário e único: o próprio criador do projeto.**

Alguém que sabe exatamente o que precisa fazer em cada área da vida — saúde, carreira, projetos pessoais — mas que historicamente falha em executar por falta de pressão externa, não por falta de plano. Já perdeu terreno real por isso (um projeto de negócio parado por um ano inteiro é prova disso). Prefere ser cutucado com firmeza gentil, não com dureza.

**Sucesso pra essa pessoa** parece: ao final de algumas semanas de uso, olhar pra trás e ver os 4 pilares recebendo atenção de forma mais equilibrada do que antes — especialmente aquele projeto pessoal que ficou um ano parado voltando a andar.

## Success Criteria

- **Uso sustentado**: responde ativamente aos lembretes/checkpoints em pelo menos 5 dos 7 dias da semana, por pelo menos 4 semanas seguidas.
- **Movimento no pilar mais travado**: o projeto de negócio parado sai do zero — pelo menos 1 marco concreto de progresso por mês depois de ativar o assistente.
- **Equilíbrio entre pilares**: nenhum dos 4 pilares fica mais de 1 semana sem receber atenção/resposta.
- **Custo operacional**: mantém-se dentro do free tier da AWS (essencialmente R$0/mês de infraestrutura).

## Scope

**Na v1:**
- Estrutura de 4 pilares (Saúde, Profissional, Projetos Pessoais, Lazer)
- Lembretes por voz frequentes e sutis das tarefas programadas
- Integração com Google Calendar
- Reconexão com o propósito maior antes de cobrar
- Lembrete de horário de início de cada tarefa
- Checkpoint com resposta verbal obrigatória
- Relatório de vergonha semanal (resumo falado)

**Explicitamente fora da v1** (candidatos a v2, não bloqueiam o lançamento):
- Detecção de presença (pausar alertas fora de casa)
- Som de progresso / reforço positivo sonoro
- Briefing semanal falado detalhado
- Sugestão automática de post no LinkedIn
- Termômetro de abandono por pilar
- Check de energia antes de sugerir tarefa
- Rebalanceamento automático por evento inesperado no calendário
