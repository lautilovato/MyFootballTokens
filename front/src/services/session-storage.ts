/**
 * Persistencia de la credencial en localStorage (FR-019).
 * Es el punto de encuentro entre React y el interceptor de Axios: el
 * interceptor vive fuera del arbol de render y no puede usar hooks, asi que
 * lee de aca en vez de leer del estado.
 */
const TOKEN_KEY = 'mft.accessToken';
const USER_KEY = 'mft.user';

export interface StoredUser {
  id: string;
  email: string;
  username: string;
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function readUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: StoredUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* almacenamiento bloqueado: la sesion vive solo en memoria */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* nada que limpiar */
  }
}
