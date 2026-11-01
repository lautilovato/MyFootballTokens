import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_KEY_HEADER, httpClient, setUnauthorizedHandler } from '../http-client';
import { clearSession, readToken, saveSession } from '../session-storage';

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

describe('interceptor de respuesta ante un 401', () => {
  const reject = async (headers: Record<string, string>) => {
    const handlers = httpClient.interceptors.response as unknown as {
      handlers: Array<{ rejected: (e: unknown) => Promise<unknown> } | null>;
    };
    const error = { response: { status: 401 }, config: { headers } };
    for (const h of handlers.handlers) if (h) await expect(h.rejected(error)).rejects.toBe(error);
  };

  beforeEach(() => {
    saveSession('token-abc', USER);
    window.history.pushState({}, '', '/login');
  });

  it('descarta la sesion si la rechazada fue la credencial (FR-022)', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    await reject({});
    setUnauthorizedHandler(null);

    expect(readToken()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('conserva la sesion si lo rechazado fue la clave administrativa (16-config-estrategia FR-003)', async () => {
    await reject({ [ADMIN_KEY_HEADER]: 'mal' });
    expect(readToken()).toBe('token-abc');
  });
});
