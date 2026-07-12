import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch, apiMutation, type GeneratedUrlFor } from '@/shared/api/client';

const generatedGetUrl: GeneratedUrlFor<'get'> = '/api/v1/topics/js.values.types';
const generatedGetUrlWithQuery: GeneratedUrlFor<'get'> = '/api/v1/content?kind=CODE';
const generatedPutUrl: GeneratedUrlFor<'put'> = '/api/v1/sessions/session-id/items/item-id/attempt';

// These compile-time assertions make OpenAPI drift fail strict typecheck.
// @ts-expect-error profile settings only supports PATCH in the generated contract
const invalidPostUrl: GeneratedUrlFor<'post'> = '/api/v1/profile/settings';
// @ts-expect-error an endpoint absent from generated OpenAPI is never a valid client URL
const unknownGetUrl: GeneratedUrlFor<'get'> = '/api/v1/unknown';

void generatedGetUrl;
void generatedGetUrlWithQuery;
void generatedPutUrl;
void invalidPostUrl;
void unknownGetUrl;

function assertGeneratedOperationTyping(): void {
  if (false) {
    // @ts-expect-error the generated contract does not expose profile settings as POST
    void apiMutation('/api/v1/profile/settings', 'POST');
    // @ts-expect-error a mutation-only route cannot be queried with GET
    void apiFetch<unknown>('/api/v1/profile/reset-confirm');
  }
}

void assertGeneratedOperationTyping;

describe('generated OpenAPI API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses same-origin generated routes and disables the fetch cache', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch<{ status: string }>('/api/v1/health/live')).resolves.toEqual({
      status: 'ok',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/health/live',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('serializes mutation bodies and sets JSON content type', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiMutation('/api/v1/profile/settings', 'PATCH', { reducedMotion: true }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/profile/settings',
      expect.objectContaining({
        body: JSON.stringify({ reducedMotion: true }),
        method: 'PATCH',
        headers: expect.any(Headers),
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });

  it('maps the stable API error envelope including requestId', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'REVISION_CONFLICT',
            message: 'Версия попытки устарела',
            requestId: 'req_test',
            details: { expectedRevision: 2 },
          },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const error = await apiMutation('/api/v1/profile/settings', 'PATCH', {}).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'REVISION_CONFLICT',
      requestId: 'req_test',
      details: { expectedRevision: 2 },
    });
  });
});
