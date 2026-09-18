import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient, setUnauthorizedHandler } from '../http-client';
import { clearSession, readToken, saveSession } from '../session-storage';

const USER = { id: 'u1', email: 'ana@example.com', username: 'ana' };

/** T057 / FR-022 / quickstart E12: un 401 descarta la sesion, no la deja a medias. */
describe('interceptor de respuesta ante 401', () => {
  beforeEach(() => {
    clearSession();
    setUnauthorizedHandler(null);
  });

  async function emitir(status: number) {
    const handlers = httpClient.interceptors.response as unknown as {
      handlers: Array<{ rejected: (e: unknown) => unknown } | null>;
    };
    const error = { response: { status } };
    for (const h of handlers.handlers) {
      if (h?.rejected) {
        try {
          await h.rejected(error);
        } catch {
          /* el interceptor re-lanza el error, que es lo correcto */
        }
      }
    }
  }

  it('borra la credencial almacenada y avisa al provider', async () => {
    saveSession('token-abc', USER);
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await emitir(401);

    expect(readToken()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('no toca la sesion ante otros errores', async () => {
    saveSession('token-abc', USER);
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await emitir(500);

    expect(readToken()).toBe('token-abc');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
