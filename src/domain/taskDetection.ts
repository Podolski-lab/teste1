/**
 * Detecção de tarefas do dia a partir de eventos do Google Calendar (Story 1.3
 * / FR-11). Função pura — sem import de `aws-sdk`, `googleapis` ou qualquer
 * outra coisa fora de `src/domain/` (AD-1). O Poller (`src/handlers/poller.ts`)
 * chama esta função para decidir o que gravar; nenhuma lógica de casamento ou
 * de forma do item vive no handler (AD-2).
 */

/**
 * Formato mínimo de um evento do Google Calendar relevante para a detecção —
 * um subset do que `calendar_v3.Schema$Event` expõe, para manter este arquivo
 * livre de import de `googleapis` (AD-1). `src/infra/googleCalendarClient.ts`
 * é responsável por mapear a resposta real da API para este formato.
 */
export interface CalendarEvent {
  /** ID do evento no Google Calendar — vira o prefixo de `task_id`. */
  id: string;
  /** Título do evento, usado como chave de busca em `PillarConfig`. */
  summary: string;
  /**
   * Início do evento. Timed events trazem `dateTime` (ISO 8601 com offset);
   * all-day events trazem só `date` (`YYYY-MM-DD`), sem `dateTime` — esse é o
   * sinal usado para pular all-day events (v1 assumption, ver Boundaries).
   */
  start: { dateTime?: string; date?: string };
  /** Fim do evento — mesma forma de `start`. */
  end: { dateTime?: string; date?: string };
}

/** Entrada de `PillarConfig` (mapeamento evento -> pilar/propósito, Story 1.2). */
export interface PillarConfigEntry {
  pillar: string;
  purpose: string;
}

/** Status inicial de toda `TaskInstance` recém-criada (AD-3). */
export const INITIAL_TASK_STATUS = 'pendente' as const;

/**
 * Forma congelada de um item `TaskInstance` (AD-3): `pillar`/`purpose`/
 * `task_title` são copiados de `PillarConfig`/do evento no momento da
 * criação e nunca relidos ao vivo depois.
 */
export interface TaskInstance {
  task_id: string;
  calendar_event_id: string;
  date: string;
  pillar: string;
  purpose: string;
  task_title: string;
  status: typeof INITIAL_TASK_STATUS;
  checkpoint_attempts: 0;
  reminder_at: string;
  checkpoint_at: string;
}

/**
 * Monta o item `TaskInstance` para `event`, se ele for um evento com horário
 * (`dateTime`) que tem uma entrada correspondente em `PillarConfig`.
 *
 * Retorna `undefined` (nada a criar) quando:
 * - o evento é all-day (`start.dateTime` ausente — Boundaries: "no all-day
 *   events (no `dateTime`)");
 * - `pillarConfig` é `undefined` (nenhuma entrada em `PillarConfig` para o
 *   título do evento — quem faz essa busca é
 *   `src/infra/dynamoPillarConfigReader.ts`, chamado pelo Poller antes desta
 *   função).
 *
 * `todayDate` (`YYYY-MM-DD`) é passado explicitamente pelo chamador (o
 * Poller, que resolve "hoje" no fuso horário do usuário) em vez de lido de
 * `Date.now()` aqui — mantém a função pura e determinística.
 */
export function buildTaskInstanceIfMatched(
  event: CalendarEvent,
  pillarConfig: PillarConfigEntry | undefined,
  todayDate: string
): TaskInstance | undefined {
  if (!event.start.dateTime || !event.end.dateTime) {
    return undefined;
  }

  if (!pillarConfig) {
    return undefined;
  }

  return {
    task_id: `${event.id}#${todayDate}`,
    calendar_event_id: event.id,
    date: todayDate,
    pillar: pillarConfig.pillar,
    purpose: pillarConfig.purpose,
    task_title: event.summary,
    status: INITIAL_TASK_STATUS,
    checkpoint_attempts: 0,
    reminder_at: event.start.dateTime,
    checkpoint_at: event.end.dateTime,
  };
}
