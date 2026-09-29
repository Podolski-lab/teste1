import { afterEach, describe, expect, it, vi } from 'vitest';

import { fireTrigger, getAccessToken } from '../../src/infra/alexaTriggerClient';

function buildFetchResponse(overrides: Partial<Response> & { jsonBody?: unknown; textBody?: string } = {}) {
  const { jsonBody, textBody, ...responseOverrides } = overrides;
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(jsonBody),
    text: vi.fn().mockResolvedValue(textBody ?? ''),
    ...responseOverrides,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAccessToken', () => {
  it('exchanges client credentials for an LWA access token via client_credentials grant, no live network', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      buildFetchResponse({ jsonBody: { access_token: 'token-abc', token_type: 'bearer', expires_in: 3600 } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const token = await getAccessToken('client-id', 'client-secret');

    expect(token).toBe('token-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.amazon.com/auth/o2/token');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('client-id');
    expect(body.get('client_secret')).toBe('client-secret');
    expect(body.get('scope')).toBe('alexa::routines:triggerinstances:write');
  });

  it('throws instead of returning an undefined token when the LWA response has no access_token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(buildFetchResponse({ jsonBody: {} })));

    await expect(getAccessToken('client-id', 'client-secret')).rejects.toThrow();
  });

  it('throws with the response status and body when the LWA request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        buildFetchResponse({ ok: false, status: 401, textBody: 'invalid_client' })
      )
    );

    await expect(getAccessToken('client-id', 'wrong-secret')).rejects.toThrow(/401/);
  });
});

describe('fireTrigger', () => {
  it('Reminder due: POSTs to the development stage endpoint with a MULTICAST delivery body by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildFetchResponse());
    vi.stubGlobal('fetch', fetchMock);

    await fireTrigger('reminder-trigger', { task_id: 'evt-123#2026-09-25' }, 'access-token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.amazonalexa.com/v1/routines/triggerInstances/stages/development');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
    });
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody.request.delivery).toBe('MULTICAST');
    expect(parsedBody.request.trigger).toEqual({
      name: 'reminder-trigger',
      parameters: { task_id: 'evt-123#2026-09-25' },
    });
    expect(typeof parsedBody.request.requestId).toBe('string');
    expect(parsedBody.request.requestId.length).toBeGreaterThan(0);
  });

  it('uses a fresh requestId on every call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildFetchResponse());
    vi.stubGlobal('fetch', fetchMock);

    await fireTrigger('reminder-trigger', { task_id: 'evt-1' }, 'access-token');
    await fireTrigger('reminder-trigger', { task_id: 'evt-2' }, 'access-token');

    const [firstInit] = fetchMock.mock.calls[0].slice(1);
    const [secondInit] = fetchMock.mock.calls[1].slice(1);
    const firstRequestId = JSON.parse(firstInit.body as string).request.requestId;
    const secondRequestId = JSON.parse(secondInit.body as string).request.requestId;
    expect(firstRequestId).not.toBe(secondRequestId);
  });

  it('POSTs to the base (non-staged) endpoint when stage is "live"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildFetchResponse());
    vi.stubGlobal('fetch', fetchMock);

    await fireTrigger('reminder-trigger', { task_id: 'evt-123#2026-09-25' }, 'access-token', 'live');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.amazonalexa.com/v1/routines/triggerInstances');
  });

  it('throws with the response status and body when the Trigger Instance API request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(buildFetchResponse({ ok: false, status: 403, textBody: 'forbidden' }))
    );

    await expect(
      fireTrigger('reminder-trigger', { task_id: 'evt-123#2026-09-25' }, 'access-token')
    ).rejects.toThrow(/403/);
  });
});
