import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INITIAL_TASK_STATUS, TaskInstance } from '../../src/domain/taskDetection';

const {
  listTimedEventsForDayMock,
  getPillarConfigForEventMock,
  createTaskInstanceMock,
  findPendingTasksWithReminderDueMock,
  transitionTaskStatusMock,
  fireTriggerMock,
  getAccessTokenMock,
} = vi.hoisted(() => ({
  listTimedEventsForDayMock: vi.fn(),
  getPillarConfigForEventMock: vi.fn(),
  createTaskInstanceMock: vi.fn(),
  findPendingTasksWithReminderDueMock: vi.fn(),
  transitionTaskStatusMock: vi.fn(),
  fireTriggerMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
}));

vi.mock('../../src/infra/googleCalendarClient', () => ({
  listTimedEventsForDay: listTimedEventsForDayMock,
}));

vi.mock('../../src/infra/dynamoPillarConfigReader', () => ({
  getPillarConfigForEvent: getPillarConfigForEventMock,
}));

vi.mock('../../src/infra/dynamoTaskInstanceRepository', () => ({
  createTaskInstance: createTaskInstanceMock,
  findPendingTasksWithReminderDue: findPendingTasksWithReminderDueMock,
  transitionTaskStatus: transitionTaskStatusMock,
}));

vi.mock('../../src/infra/alexaTriggerClient', () => ({
  fireTrigger: fireTriggerMock,
  getAccessToken: getAccessTokenMock,
}));

// Importado depois dos vi.mock acima, pra pegar as versões mockadas dos
// módulos que poller.ts importa (mesmo padrão de test/handlers/skill.test.ts).
import { handler } from '../../src/handlers/poller';

function buildTaskInstance(overrides: Partial<TaskInstance> = {}): TaskInstance {
  return {
    task_id: 'evt-123#2026-09-25',
    calendar_event_id: 'evt-123',
    date: '2026-09-25',
    pillar: 'saude',
    purpose: 'chegar na meta de dezembro',
    task_title: 'Correr no parque',
    status: INITIAL_TASK_STATUS,
    checkpoint_attempts: 0,
    reminder_at: '2026-09-25T14:00:00-03:00',
    checkpoint_at: '2026-09-25T15:00:00-03:00',
    ...overrides,
  };
}

const ORIGINAL_ENV = { ...process.env };

describe('poller.ts handler reminder-dispatch phase', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    process.env.GOOGLE_CALENDAR_ID = 'test-calendar-id';
    process.env.USER_TIMEZONE = 'America/Sao_Paulo';
    process.env.ALEXA_SKILL_MESSAGING_CLIENT_ID = 'test-client-id';
    process.env.ALEXA_SKILL_MESSAGING_CLIENT_SECRET = 'test-client-secret';
    delete process.env.ALEXA_TRIGGER_STAGE;

    // Fase de detecção (Story 1.3) fica vazia/sem efeito aqui — este
    // arquivo cobre só a fase de disparo de lembrete (Story 1.4).
    listTimedEventsForDayMock.mockResolvedValue([]);
    getPillarConfigForEventMock.mockResolvedValue(undefined);
    createTaskInstanceMock.mockResolvedValue('created');

    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('One due task: transitions the status before firing the trigger, with the right task_id/trigger name', async () => {
    const task = buildTaskInstance({ task_id: 'evt-123#2026-09-25' });
    findPendingTasksWithReminderDueMock.mockResolvedValue([task]);

    // Cada mock registra sua chamada numa ordem compartilhada, pra provar
    // que a transição roda ANTES do disparo do trigger (firing order da
    // spec 1.4), não só que ambos foram chamados.
    const callOrder: string[] = [];
    getAccessTokenMock.mockImplementation(async () => {
      callOrder.push('getAccessToken');
      return 'access-token-abc';
    });
    transitionTaskStatusMock.mockImplementation(async () => {
      callOrder.push('transitionTaskStatus');
      return 'transitioned';
    });
    fireTriggerMock.mockImplementation(async () => {
      callOrder.push('fireTrigger');
    });

    await handler();

    expect(transitionTaskStatusMock).toHaveBeenCalledWith(
      expect.anything(),
      'evt-123#2026-09-25',
      'pendente',
      'lembrete_enviado'
    );
    expect(getAccessTokenMock).toHaveBeenCalledWith('test-client-id', 'test-client-secret');
    expect(fireTriggerMock).toHaveBeenCalledWith(
      'reminder-trigger',
      { task_id: 'evt-123#2026-09-25' },
      'access-token-abc',
      'development'
    );

    // transitionTaskStatus autoriza o disparo (AD-3) — precisa ter
    // resolvido antes de fireTrigger ser chamado, não só antes na ordem de
    // invocação síncrona.
    expect(callOrder.indexOf('transitionTaskStatus')).toBeLessThan(callOrder.indexOf('fireTrigger'));
  });

  it('Already-transitioned: skips the trigger fire for that task, no double-fire', async () => {
    const task = buildTaskInstance({ task_id: 'evt-456#2026-09-25' });
    findPendingTasksWithReminderDueMock.mockResolvedValue([task]);
    transitionTaskStatusMock.mockResolvedValue('already_transitioned');
    getAccessTokenMock.mockResolvedValue('access-token-abc');

    await handler();

    expect(transitionTaskStatusMock).toHaveBeenCalledWith(
      expect.anything(),
      'evt-456#2026-09-25',
      'pendente',
      'lembrete_enviado'
    );
    // O sinal 'already_transitioned' é o que autoriza pular o disparo (ver
    // Design Notes "Firing order" da spec 1.4) — a asserção central desta
    // story: um regressão que removesse esse skip deixaria isto vermelho.
    expect(fireTriggerMock).not.toHaveBeenCalled();

    // Nota: getAccessToken é buscado uma única vez pro ciclo de poll
    // inteiro, ANTES do loop por tarefa (ver comentário em poller.ts: "Um
    // único access token da LWA é suficiente pro ciclo de poll inteiro"),
    // então ele é chamado aqui mesmo com essa única tarefa já transicionada
    // — o que importa é que ele não é usado (fireTrigger nunca chamado).
    expect(getAccessTokenMock).toHaveBeenCalledTimes(1);
  });
});
