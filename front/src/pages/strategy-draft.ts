import {
  STRATEGY_METRICS,
  STRATEGY_POSITIONS,
  type StrategyConfig,
  type StrategyMetric,
  type StrategyPosition,
  type StrategyProfile,
  type StrategyVersion,
} from '../services/valuation-strategies.service';

/** Formulario de una estrategia: todo en texto, como lo escribe el administrador. */

export type ProfileKey = 'general' | StrategyPosition;
export type ProfileDraft = Partial<Record<StrategyMetric, string>>;

export const NUMBER_FIELDS = ['baseValue', 'scaleFactor', 'minPrice', 'defaultReputation'] as const;
export type NumberField = (typeof NUMBER_FIELDS)[number];

export interface StrategyDraft extends Record<NumberField, string> {
  profiles: Record<ProfileKey, ProfileDraft>;
}

const PROFILE_KEYS: ProfileKey[] = ['general', ...STRATEGY_POSITIONS];

function toProfileDraft(profile: StrategyProfile = {}): ProfileDraft {
  return Object.fromEntries(Object.entries(profile).map(([metric, weight]) => [metric, String(weight)]));
}

export function toDraft({ weights, baseValue, scaleFactor, minPrice, defaultReputation }: StrategyVersion): StrategyDraft {
  const { GK, DF, MF, FW } = weights.byPosition ?? {};
  return {
    profiles: {
      general: toProfileDraft(weights.general),
      GK: toProfileDraft(GK),
      DF: toProfileDraft(DF),
      MF: toProfileDraft(MF),
      FW: toProfileDraft(FW),
    },
    baseValue: String(baseValue),
    scaleFactor: String(scaleFactor),
    minPrice: String(minPrice),
    defaultReputation: String(defaultReputation),
  };
}

/** Un casillero vacío o en cero es una métrica ausente, que vale 0. */
function parseProfile(profile: ProfileDraft): StrategyProfile | null {
  const parsed: StrategyProfile = {};
  for (const metric of STRATEGY_METRICS) {
    const text = profile[metric]?.trim();
    if (!text) continue;
    const weight = Number(text);
    if (!Number.isFinite(weight)) return null;
    if (weight !== 0) parsed[metric] = weight;
  }
  return parsed;
}

/**
 * Arma la configuración, o dice qué falta. Solo verifica que sean números: las reglas de negocio
 * son del backend, que devuelve sus motivos (07-cotizacion FR-012). Una posición sin pesos no se
 * envía, y sus jugadores usan los generales.
 */
export function parseDraft(draft: StrategyDraft): { config: StrategyConfig } | { error: string } {
  const profiles: Partial<Record<ProfileKey, StrategyProfile>> = {};
  for (const key of PROFILE_KEYS) {
    const profile = parseProfile(draft.profiles[key]);
    if (!profile) return { error: 'Los pesos tienen que ser números.' };
    profiles[key] = profile;
  }

  const numbers = NUMBER_FIELDS.map((field) => (draft[field].trim() === '' ? Number.NaN : Number(draft[field])));
  if (!numbers.every(Number.isInteger)) return { error: 'Los valores de precio y la reputación tienen que ser números enteros.' };

  const byPosition = Object.fromEntries(
    STRATEGY_POSITIONS.filter((position) => Object.keys(profiles[position] ?? {}).length > 0).map((position) => [position, profiles[position]]),
  );
  const [baseValue, scaleFactor, minPrice, defaultReputation] = numbers;
  return {
    config: {
      weights: { general: profiles.general ?? {}, ...(Object.keys(byPosition).length > 0 ? { byPosition } : {}) },
      baseValue,
      scaleFactor,
      minPrice,
      defaultReputation,
    },
  };
}
