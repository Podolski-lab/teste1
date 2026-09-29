/**
 * Domínio do lembrete de voz (Story 1.4 / FR-2). Função pura de novo
 * (AD-1) — sem import de `aws-sdk`, `ask-sdk-core` ou `fetch`. Decide se um
 * `TaskInstance` está pronto pro lembrete e monta o texto exato que a Alexa
 * fala, sempre reconectando a tarefa ao pilar/propósito — nunca lendo
 * `task_title` (UX rule / Boundaries da spec 1.4: "reminder speech always
 * names the pillar and purpose, never the raw task_title alone").
 */
import { INITIAL_TASK_STATUS, TaskInstance } from './taskDetection';

/**
 * Rótulos legíveis dos quatro pilares fixos (`scripts/associar-pilar.ts`'s
 * `VALID_PILLARS`), usados na fala pra soarem naturais em português em vez
 * do slug kebab-case salvo em `PillarConfig`/`TaskInstances`. Um pilar sem
 * entrada aqui (não deveria acontecer — `associar-pilar.ts` só grava um dos
 * quatro valores) cai de volta pro slug cru em `buildReminderSpeech`, em vez
 * de quebrar a fala.
 */
export const PILLAR_DISPLAY_LABELS: Record<string, string> = {
  saude: 'Saúde',
  profissional: 'Profissional',
  'projetos-pessoais': 'Projetos Pessoais',
  lazer: 'Lazer',
};

/**
 * Um `TaskInstance` está pronto pro lembrete quando ainda está `pendente` e
 * seu `reminder_at` já chegou. A comparação é feita por instante real
 * (`Date`), não por comparação lexicográfica das strings ISO — `reminder_at`
 * vem do Google Calendar com o offset local do usuário (ex.: `-03:00`)
 * enquanto `nowIso` normalmente vem de `new Date().toISOString()` (`Z`), e
 * comparar strings em offsets diferentes não preserva a ordem cronológica.
 *
 * `nowIso` é passado explicitamente pelo chamador (o Poller) em vez de lido
 * de `Date.now()` aqui, mantendo esta função pura e determinística — mesmo
 * padrão de `buildTaskInstanceIfMatched` em `taskDetection.ts`.
 */
export function isReminderDue(task: TaskInstance, nowIso: string): boolean {
  if (task.status !== INITIAL_TASK_STATUS) {
    return false;
  }

  return new Date(task.reminder_at).getTime() <= new Date(nowIso).getTime();
}

/**
 * Monta a fala do lembrete (FR-2), seguindo ao pé da letra o template de
 * `EXPERIENCE.md` > Voice and Tone > "Lembrete": "Olá Lucas, vamos
 * trabalhar nas tarefas de [pilar] que você programou pra hoje? Isso vai te
 * ajudar a [propósito]." Nunca usa `task.task_title` — essa é a regra
 * explícita da spec: a fala reconecta ao pilar/propósito, nunca só o título
 * do evento.
 */
export function buildReminderSpeech(task: TaskInstance): string {
  const pillarLabel = PILLAR_DISPLAY_LABELS[task.pillar] ?? task.pillar;

  return (
    `Olá Lucas, vamos trabalhar nas tarefas de ${pillarLabel} que você programou ` +
    `pra hoje? Isso vai te ajudar a ${task.purpose}.`
  );
}
