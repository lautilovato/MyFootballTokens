import { ADMIN_KEY_HEADER, httpClient } from './http-client';

/**
 * Estrategias de cotización (07-cotizacion). Leer pide sesión; cambiar algo pide la clave
 * administrativa, que el administrador escribe en cada visita (16-config-estrategia FR-002).
 */

export const STRATEGY_METRICS = [
  'goals',
  'assists',
  'shots',
  'keyPasses',
  'dribbles',
  'tackles',
  'rating',
  'absence',
  'worldReputation',
] as const;

export const STRATEGY_POSITIONS = ['GK', 'DF', 'MF', 'FW'] as const;

export type StrategyMetric = (typeof STRATEGY_METRICS)[number];
export type StrategyPosition = (typeof STRATEGY_POSITIONS)[number];
export type StrategyProfile = Partial<Record<StrategyMetric, number>>;

export interface StrategyConfig {
  weights: {
    general: StrategyProfile;
    /** Un perfil por posición reemplaza completo a los pesos generales para esa posición. */
    byPosition?: Partial<Record<StrategyPosition, StrategyProfile>>;
  };
  baseValue: number;
  scaleFactor: number;
  minPrice: number;
  defaultReputation: number;
}

export interface StrategyVersion extends StrategyConfig {
  version: number;
  createdAt: string;
}

export interface ValuationStrategy {
  key: string;
  name: string;
  description: string;
  active: boolean;
  currentVersion: StrategyVersion;
}

const withKey = (apiKey: string) => ({ headers: { [ADMIN_KEY_HEADER]: apiKey } });

export async function listStrategies(): Promise<ValuationStrategy[]> {
  const { data } = await httpClient.get<ValuationStrategy[]>('/valuation-strategies');
  return data;
}

export async function createStrategyVersion(key: string, config: StrategyConfig, apiKey: string): Promise<StrategyVersion> {
  const { data } = await httpClient.post<StrategyVersion>(`/valuation-strategies/${key}/versions`, config, withKey(apiKey));
  return data;
}

export async function activateStrategy(key: string, apiKey: string): Promise<void> {
  await httpClient.post(`/valuation-strategies/${key}/activate`, undefined, withKey(apiKey));
}

export async function recalculateQuotes(strategyKey: string, apiKey: string): Promise<void> {
  await httpClient.post('/quotes/recalculate', { strategyKey }, withKey(apiKey));
}

const CODE_MESSAGES: Record<string, string> = {
  RUN_IN_PROGRESS: 'Ya hay un recálculo en curso. Probá de nuevo cuando termine.',
  NO_ACTIVE_STRATEGY: 'No hay ninguna estrategia activa.',
  NO_SEASON_DATA: 'Todavía no hay estadísticas de temporada para calcular.',
};

/** Estos endpoints usan el formato de error de Nest, no el de `ApiErrorFilter`. */
export function strategyErrorMessage(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { code?: unknown; message?: unknown } } })?.response;
  if (response?.status === 401) return 'La clave administrativa es incorrecta.';

  const code = response?.data?.code;
  if (typeof code === 'string' && code in CODE_MESSAGES) return CODE_MESSAGES[code];

  const message = response?.data?.message;
  if (response?.status === 400 && Array.isArray(message)) return message.join(' · ');
  return 'No se pudo completar la operación. Intentá de nuevo.';
}
