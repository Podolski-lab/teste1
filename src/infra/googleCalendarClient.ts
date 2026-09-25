/**
 * Adaptador de leitura do Google Calendar (Story 1.3). Autentica com uma
 * service account (AD-6/Design Notes — sem fluxo OAuth de 3 pernas, este
 * backend não tem endpoint HTTP pra receber um redirect de consentimento) e
 * lista os eventos de um dia específico, no fuso horário do usuário.
 *
 * O domínio (`src/domain/taskDetection.ts`) decide o que fazer com cada
 * evento (inclusive descartar all-day events) — este arquivo só busca e
 * mapeia a resposta da API para o formato `CalendarEvent`, sem lógica de
 * negócio (AD-1).
 */
import { google, calendar_v3 } from 'googleapis';

import { CalendarEvent } from '../domain/taskDetection';

// `googleapis` reexporta a classe JWT de `google-auth-library` (sua própria
// dependência) via `google.auth.JWT` — usamos esse caminho em vez de
// importar `google-auth-library` diretamente, que não é uma dependência
// própria deste pacote (só uma dependência transitiva de `googleapis`).
type JwtClient = InstanceType<typeof google.auth.JWT>;

/** Escopo somente-leitura — o Poller nunca escreve de volta no Calendar (Boundaries). */
const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

/**
 * Formato mínimo esperado dentro do JSON de chave de service account
 * (o mesmo arquivo baixado no Google Cloud Console).
 */
interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/**
 * Decodifica `serviceAccountKeyBase64` (o conteúdo base64 da variável de
 * ambiente `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`) e constrói um cliente JWT
 * autenticado como essa service account.
 */
function buildAuthClient(serviceAccountKeyBase64: string): JwtClient {
  const keyJson = Buffer.from(serviceAccountKeyBase64, 'base64').toString('utf-8');
  const key = JSON.parse(keyJson) as ServiceAccountKey;

  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [CALENDAR_READONLY_SCOPE],
  });
}

/** Offset (em minutos) de `instant` em `timeZone`, em relação a UTC. */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * Converte um horário local (`YYYY-MM-DDTHH:mm:ss`, sem offset) em
 * `timeZone` para o instante UTC correspondente. Duas iterações bastam pra
 * corrigir o offset perto de uma transição de horário de verão.
 */
export function zonedTimeToUtc(localDateTime: string, timeZone: string): Date {
  const naiveUtcMillis = new Date(`${localDateTime}Z`).getTime();
  let offset = offsetMinutesAt(new Date(naiveUtcMillis), timeZone);
  offset = offsetMinutesAt(new Date(naiveUtcMillis - offset * 60_000), timeZone);
  return new Date(naiveUtcMillis - offset * 60_000);
}

/** `date` (`YYYY-MM-DD`) + 1 dia corrido, sem depender de fuso horário. */
export function nextCalendarDate(date: string): string {
  const asUtcMidnight = new Date(`${date}T00:00:00Z`);
  asUtcMidnight.setUTCDate(asUtcMidnight.getUTCDate() + 1);
  return asUtcMidnight.toISOString().slice(0, 10);
}

function toCalendarEvent(event: calendar_v3.Schema$Event): CalendarEvent | undefined {
  if (!event.id) {
    return undefined;
  }

  return {
    id: event.id,
    summary: event.summary ?? '',
    start: { dateTime: event.start?.dateTime ?? undefined, date: event.start?.date ?? undefined },
    end: { dateTime: event.end?.dateTime ?? undefined, date: event.end?.date ?? undefined },
  };
}

/**
 * Lista os eventos de `calendarId` para o dia `date` (`YYYY-MM-DD`),
 * considerando a virada do dia em `timeZone` (IANA, ex.: `America/Sao_Paulo`).
 * Inclui all-day events na resposta — quem decide descartá-los é o domínio
 * (`buildTaskInstanceIfMatched`), não este adaptador.
 */
export async function listTimedEventsForDay(
  calendarId: string,
  date: string,
  timeZone: string
): Promise<CalendarEvent[]> {
  const serviceAccountKeyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!serviceAccountKeyBase64) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 não está definida.');
  }

  const auth = buildAuthClient(serviceAccountKeyBase64);
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = zonedTimeToUtc(`${date}T00:00:00`, timeZone).toISOString();
  const timeMax = zonedTimeToUtc(`${nextCalendarDate(date)}T00:00:00`, timeZone).toISOString();

  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      timeZone,
      singleEvents: true,
      orderBy: 'startTime',
      pageToken,
    });

    items.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return items.map(toCalendarEvent).filter((event): event is CalendarEvent => event !== undefined);
}
