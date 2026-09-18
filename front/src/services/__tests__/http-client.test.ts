import { beforeEach, describe, expect, it } from 'vitest';
import { httpClient } from '../http-client';
import { clearSession, saveSession } from '../session-storage';

const USER = { id: 'u1', email: 'ana@example.com', username: 'ana' };

/** T043 / FR-018 / quickstart E10: el interceptor adjunta la credencial solo. */
describe('interceptor de peticion', () => {
  beforeEach(() => clearSession());

  async function buildHeaders() {
    const handlers = httpClient.interceptors.request as unknown as {
      handlers: Array<{ fulfilled: (c: unknown) => unknown } | null>;
    };
    let config: Record<string, unknown> = { headers: {} };
    for (const h of handlers.handlers) if (h) config = (await h.fulfilled(config)) as typeof config;
    return config.headers as Record<string, string>;
  }

  it('no adjunta Authorization cuando no hay sesion', async () => {
    expect((await buildHeaders()).Authorization).toBeUndefined();
  });

  it('adjunta Bearer con el token guardado', async () => {
    saveSession('token-abc', USER);
    expect((await buildHeaders()).Authorization).toBe('Bearer token-abc');
  });
});
