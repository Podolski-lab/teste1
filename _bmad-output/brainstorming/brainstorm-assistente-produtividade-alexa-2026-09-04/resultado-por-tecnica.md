# Brainstorming: Assistente de Produtividade Pessoal integrado à Alexa

## 1. Contexto da sessão

- **Tópico:** Assistente de produtividade pessoal integrado à Alexa
- **Objetivo:** Ter algo útil de verdade — organizar tarefas do dia a dia e aumentar produtividade pessoal, com avisos/alarmes via Alexa
- **Modo:** Partner (Creative Partner)
- **Status:** Completo

---

## 2. Técnica 1: Job to Be Done

**Job real identificado (usuário):** ter alguém/algo cobrando dele nas tarefas que ele mesmo não se cobra.

**Insight-chave sobre cobrança (usuário):** cobrança só funciona quando reconecta a tarefa ao propósito maior — mostrar o que está sendo perdido/deixado de alcançar gera consciência real, e não apenas um lembrete de tarefa isolada.

**Ideia complementar (coach):** a Alexa pode funcionar como *checkpoint de voz* — pergunta "você fez X?" e exige resposta verbal (sim/não/adiar). O compromisso verbal gera mais constrangimento/efeito do que simplesmente silenciar uma notificação.

### As 3 frentes de vida e seus propósitos (usuário)

| Pilar | Prática | Propósito |
|---|---|---|
| **Saúde** | Academia diária | Saúde / estética |
| **Profissional** | Organizar currículo, aplicar a vagas | Conseguir trabalho |
| **Projetos Pessoais** | Retomar projetos parados, estruturar e executar passos | Sucesso financeiro |

**Ideia complementar (coach):** cada tarefa pertence a um pilar, e a Alexa poderia detectar padrão de abandono por pilar, escalando a cobrança de forma diferente conforme o pilar — um "termômetro de abandono".

---

## 3. Técnica 2: Mind Mapping

Antes de ramificar, o usuário pediu (direção) separar melhor os limites entre os ramos **Profissional** e **Projetos Pessoais** para evitar sobreposição. Ficou decidido:

- **Profissional** = emprego/carreira formal + estudos/capacitação + construção de imagem pessoal (posts, marca pessoal)
- **Projetos Pessoais** = iniciativas autônomas, incluindo projetos que também sirvam de portfólio

Um quarto ramo, **Lazer/Descanso**, foi mantido puro dentro de Projetos Pessoais (decisão do usuário).

### Ramo Profissional (todas as ideias do usuário)
- Currículo
- Candidatura a vagas
- Treino de entrevistas (ser mais competitivo)
- Networking
- Estudos/capacitação
- Construção de imagem pessoal: consolidar conhecimento em posts no LinkedIn

### Ramo Projetos Pessoais (usuário)
- Empreendedorismo
- Desenvolvimento pessoal (conhecimentos não técnicos): ex. retiro espiritual, entender mais sobre DISC
- Contribuição social

### Ramo Saúde
- Academia (usuário)
- Alimentação (usuário)
- Sono (usuário)
- Beber água (usuário)
- Atividades ao ar livre (usuário)
- Check-ups médicos preventivos: exames de rotina, dentista (coach)

### Ramo Lazer/Descanso
- Mantido como ramo próprio, sem sub-ramos detalhados nesta sessão (decisão do usuário).

---

## 4. Técnica 3: Crazy 8s

Oito ideias rápidas, uma por caixa, na ordem em que foram geradas:

1. **(usuário)** Alexa olha a agenda do Google Calendar e ajuda a distribuir as tarefas ao longo do dia, alinhado aos objetivos.
2. **(coach)** Alexa toca um som de progresso diferente por pilar ao completar uma tarefa — reforço positivo.
3. **(usuário)** Alexa lembra o horário de começar cada tarefa, eliminando a decisão de "o que fazer agora" (reduz fadiga de decisão).
4. **(coach)** Alexa faz um check de energia antes de sugerir a próxima tarefa e reordena conforme a disposição (tarefa pesada vs. leve).
5. **(usuário)** Ao se despedir da Alexa, ela reconhece que ele saiu de casa e pausa os alertas automaticamente.
6. **(coach)** Briefing semanal falado de 1 minuto resumindo os 4 ramos (Profissional, Projetos Pessoais, Saúde, Lazer).
7. **(usuário)** Alexa reorganiza e rebalanceia os pilares automaticamente quando entra uma atividade inesperada no meio do calendário.

*Nota: o memlog registra 7 ideias numeradas de "Caixa 2" a "Caixa 8" (a Caixa 1 não aparece registrada explicitamente), totalizando as 8 caixas do exercício conforme confirmado na nota de encerramento da técnica.*

---

## 5. Técnica 4: One Feature Only

**Feature única escolhida (usuário):** lembretes por voz frequentes e sutis das tarefas programadas, sem depender da vontade pessoal.

**Justificativa:** essa é a funcionalidade que resolve diretamente o *job* identificado na Técnica 1 — substituir a autocobrança que falha por uma cobrança externa constante — e por isso foi definida como o núcleo do produto.

---

## 6. Convergência (MoSCoW)

Escopo final do MVP, com os ajustes definidos pelo usuário:

| Prioridade | Itens |
|---|---|
| **Must** | 4 pilares (Saúde, Profissional, Projetos Pessoais, Lazer) · Lembretes por voz · Integração com Google Calendar |
| **Should** | Reconexão com propósito · Lembrete de horário · Checkpoint com resposta verbal obrigatória · Relatório de vergonha semanal |
| **Could** | Detecção de presença · Som de progresso · Briefing semanal · Sugestão de post no LinkedIn |
| **Won't** | Termômetro de abandono por pilar · Check de energia · Rebalanceamento automático |

---

## 7. Síntese final

O *job* real do usuário é a **pressão externa que substitui a autocobrança** — e essa cobrança só funciona quando fica **reconectada ao propósito maior** de cada tarefa, não a ela isolada.

O produto está organizado em **4 pilares** (Saúde, Profissional, Projetos Pessoais, Lazer), cada um com propósito próprio. O **núcleo do produto** (One Feature Only) são os **lembretes por voz frequentes e sutis**. O escopo do MVP foi definido via MoSCoW: **Must** cobre os 4 pilares, os lembretes de voz e a integração com o Google Calendar; **Should** adiciona reconexão com propósito, lembrete de horário, checkpoint verbal e relatório de vergonha semanal; **Could** inclui presença, som de progresso, briefing semanal e sugestão de post no LinkedIn; e **Won't** deixa de fora o termômetro de abandono, o check de energia e o rebalanceamento automático.
