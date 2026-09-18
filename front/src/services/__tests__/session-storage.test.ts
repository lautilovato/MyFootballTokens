import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, readToken, readUser, saveSession } from '../session-storage';

const USER = { id: 'u1', email: 'ana@example.com', username: 'ana' };

/** T056 / FR-021: lo que permite rehidratar la sesion al arrancar. */
describe('almacenamiento de la sesion', () => {
  beforeEach(() => clearSession());

  it('devuelve null cuando no hay nada guardado', () => {
    expect(readToken()).toBeNull();
    expect(readUser()).toBeNull();
  });

  it('persiste y recupera la credencial completa', () => {
    saveSession('token-abc', USER);
    expect(readToken()).toBe('token-abc');
    expect(readUser()).toEqual(USER);
  });

  it('limpia todo al cerrar sesion (FR-022)', () => {
    saveSession('token-abc', USER);
    clearSession();
    expect(readToken()).toBeNull();
    expect(readUser()).toBeNull();
  });

  it('no explota si el usuario guardado esta corrupto', () => {
    localStorage.setItem('mft.user', '{no es json');
    expect(readUser()).toBeNull();
  });
});
