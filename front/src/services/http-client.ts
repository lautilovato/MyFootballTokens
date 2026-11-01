import axios from 'axios';
import { clearSession, readToken } from './session-storage';

/**
 * LA unica instancia de Axios del proyecto (constitucion §7).
 * Ninguna pagina ni componente debe crear otra ni invocar axios directamente.
 */
export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
});

/** Cabecera de la clave administrativa (back: `ADMIN_API_KEY_HEADER`). */
export const ADMIN_KEY_HEADER = 'x-api-key';

/** Adjunta la credencial en cada peticion, sin intervencion de quien la usa (FR-018). */
httpClient.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** El AuthProvider registra aca como limpiar su estado ante un 401 (FR-022). */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/**
 * Ante un rechazo por falta de autenticacion: descartar la credencial, limpiar
 * el estado y volver al login. Sin esto la app queda mostrando datos de una
 * sesion que ya no sirve (FR-022, quickstart E12). Un 401 de un pedido con clave administrativa
 * habla de la clave, no de la sesion: escribirla mal no debe cerrarla.
 */
httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && !error.config?.headers?.[ADMIN_KEY_HEADER]) {
      clearSession();
      onUnauthorized?.();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);
