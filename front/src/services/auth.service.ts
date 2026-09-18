import { httpClient } from './http-client';
import type { StoredUser } from './session-storage';

export interface AuthResponse {
  accessToken: string;
  user: StoredUser;
}

/** Contrato en contracts/auth.openapi.yaml. */
export async function register(
  email: string,
  username: string,
  password: string,
): Promise<AuthResponse> {
  const { data } = await httpClient.post<AuthResponse>('/auth/register', {
    email,
    username,
    password,
  });
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await httpClient.post<AuthResponse>('/auth/login', { email, password });
  return data;
}
