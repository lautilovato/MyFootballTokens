import { httpClient } from './http-client';

/**
 * Saldo de créditos del usuario de la sesión. Contrato en
 * .specify/specs/08-sobres/contracts/packs.openapi.yaml (GET /credits).
 */
export async function getBalance(): Promise<number> {
  const { data } = await httpClient.get<{ credits: number }>('/credits');
  return data.credits;
}
