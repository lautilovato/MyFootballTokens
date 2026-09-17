import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as authApi from './auth.service';
import { setUnauthorizedHandler } from './http-client';
import { clearSession, readToken, readUser, saveSession } from './session-storage';
import type { StoredUser } from './session-storage';

export interface AuthContextValue {
  user: StoredUser | null;
  isAuthenticated: boolean;
  /** true mientras se rehidrata al arrancar: evita redirigir antes de saber si hay sesion. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Unica fuente de verdad sobre si hay usuario autenticado (FR-021).
 * Se resuelve con la Context API nativa: §2 no autoriza librerias de estado.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehidratacion al arrancar (FR-021, quickstart E12).
  useEffect(() => {
    const token = readToken();
    const stored = readUser();
    if (token && stored) setUser(stored);
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  // El interceptor avisa aca cuando el backend rechaza la sesion (FR-022).
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken, user: authed } = await authApi.login(email, password);
    saveSession(accessToken, authed);
    setUser(authed);
  }, []);

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      const { accessToken, user: authed } = await authApi.register(email, username, password);
      saveSession(accessToken, authed);
      setUser(authed);
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
