---
title: Addendum — Assistente de Produtividade Pessoal com Alexa
related_brief: brief.md
updated: 2026-09-17
---

# Addendum

Material de apoio que informou o Product Brief mas não cabe nele — útil para os documentos seguintes (arquitetura, spec técnica).

## Pesquisa técnica: capacidades da Alexa/Alexa+ (Set/2026)

Pesquisa web realizada durante o discovery deste brief para responder: dá para construir o assistente usando apenas recursos prontos da Alexa, sem código?

**Resposta direta:** uma versão *básica* (lembretes fixos ligados ao calendário) é viável hoje sem código e sem custo. A visão completa do produto — lembretes dinâmicos por pilar e checkpoints com resposta verbal — não é.

### Integração com Google Calendar
Existe integração nativa e gratuita (app Alexa → Configurações → Calendário): leitura/escrita básica de eventos, avisos pré-compromisso. Recurso padrão da Alexa (não exclusivo do Alexa+). Limitação: sem tags/categorização por pilar, sem puxar dinamicamente uma lista de tarefas, sincronização não é instantânea.

### Mecânica de lembretes/rotinas
Rotinas da Alexa suportam gatilhos recorrentes via RRULE e uma ação "Alexa diz"/anúncio para texto falado customizado — bom para avisos de conteúdo fixo. Uma ação de rotina "Calendário" pode ler a agenda do dia em voz alta. Rotinas **não** inserem conteúdo dinâmico ("a tarefa de hoje do pilar Saúde") — cada mensagem distinta precisa de configuração manual própria. "Custom Triggers for Routines" existem (disparo por evento/webhook) mas exigem registro de uma fonte de trigger desenvolvida — ou seja, algum nível técnico.

### Alexa+ (capacidades específicas)
Lançado em 2025, EUA/Canadá apenas (até set/2026), grátis com Prime ou US$19,99/mês. Adiciona fluência conversacional e algum comportamento proativo (ex: ingerir agenda de e-mails, sugerir horários considerando trânsito, "Omnisense" para alertas contextuais). Tem "Actions" agenticas (Web Action SDK), mas voltadas para tarefas comerciais (reservas, compras) — não há recurso documentado para diálogos de accountability personalizados.

### Skills de terceiros existentes
A categoria "Calendars & Reminders" da loja de Skills tem conectores genéricos (Google Calendar, Todoist, Any.do), mas nenhuma Skill identificada oferece coaching de accountability por pilares com checkpoints de voz — nicho não preenchido.

### Opções de build, do mais simples ao mais robusto

| Tier | Descrição | Custo | Limitação |
|---|---|---|---|
| 0 | Calendário linkado + lembretes manuais fixos por rotina | Grátis | Estático, sem "pilares", sem check-in |
| 1 | Múltiplas Rotinas (RRULE + "Alexa diz") por pilar/tarefa | Grátis | Configuração manual por lembrete, sem resposta conversacional |
| 2 | IFTTT/Zapier conectando Google Calendar → notificações Alexa | ~R$0-100/mês | Sem programar, mas exige conta e lógica de automação de terceiros |
| 3 | Skill Alexa customizada (AWS Lambda + Google Calendar API) | Free tier AWS | Requer desenvolvimento real — mas é a única opção com lógica condicional, conteúdo dinâmico por pilar e checkpoints verbais |

**Decisão registrada no brief:** Tier 3 (Skill customizada), por ser a única opção que entrega os itens "Must" e "Should" definidos no escopo (lembretes dinâmicos por pilar + checkpoint verbal).

**Fontes:** documentação de desenvolvedor Amazon/AWS (Alexa Reminders API, Custom Triggers for Routines), páginas de ajuda da Amazon sobre vínculo de calendário, cobertura de imprensa sobre o rollout do Alexa+ (TechCrunch/CNBC, fev/2026; PYMNTS/aboutamazon.com; VentureBeat/Gearbrain sobre histórico da Reminders API).

**Ressalva:** Alexa+ é um rollout em rápida evolução (2025-2026); os recursos agenticos ainda são majoritariamente voltados a comércio, e a região é limitada a EUA/Canadá até a data desta pesquisa.
