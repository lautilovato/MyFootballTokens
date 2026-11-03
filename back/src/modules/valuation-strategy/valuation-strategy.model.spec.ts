import { StrategyConfigInput, validateStrategyConfig } from './strategy-config.rules';

// Configuración de prestigio sembrada por la migración (data-model.md «Valores sembrados»).
function seededPrestige(): StrategyConfigInput {
  return {
    weights: {
      general: {
        worldReputation: 0.6, rating: 0.15, goals: 0.08, assists: 0.05, keyPasses: 0.04,
        dribbles: 0.04, tackles: 0.04, absence: -0.05,
      },
      byPosition: {
        GK: { worldReputation: 0.6, rating: 0.4, absence: -0.05 },
      },
    },
    baseValue: 100,
    scaleFactor: 900,
    minPrice: 10,
    defaultReputation: 20,
  };
}

describe('validateStrategyConfig (FR-012)', () => {
  it('acepta la configuración sembrada', () => {
    expect(validateStrategyConfig(seededPrestige())).toEqual([]);
  });

  it('rechaza una métrica desconocida', () => {
    const config = seededPrestige();
    config.weights.general.cards = -0.1;
    expect(validateStrategyConfig(config)).toEqual(['weights.general: métrica desconocida "cards"']);
  });

  it('rechaza una posición desconocida', () => {
    const config = seededPrestige();
    config.weights.byPosition = { XX: { rating: 1 } };
    expect(validateStrategyConfig(config)).toEqual([
      'weights.byPosition: posición desconocida "XX"',
    ]);
  });

  it('rechaza un perfil general sin ningún peso positivo', () => {
    const config = seededPrestige();
    config.weights.general = { absence: -0.1 };
    expect(validateStrategyConfig(config)).toEqual([
      'weights.general: debe tener al menos un peso positivo',
    ]);
  });

  it('rechaza un perfil por posición sin positivos', () => {
    const config = seededPrestige();
    config.weights.byPosition = { DF: { absence: -0.2 } };
    expect(validateStrategyConfig(config)).toEqual([
      'weights.byPosition.DF: debe tener al menos un peso positivo',
    ]);
  });

  it('rechaza pesos fuera de [-1, 1] o con más de 4 decimales', () => {
    const config = seededPrestige();
    config.weights.general = { rating: 1.5, goals: 0.12345 };
    expect(validateStrategyConfig(config)).toEqual([
      'weights.general.rating: el peso debe estar entre -1 y 1',
      'weights.general.goals: el peso admite a lo sumo 4 decimales',
    ]);
  });

  it('rechaza parámetros de conversión inválidos con un motivo por regla', () => {
    const config = { ...seededPrestige(), scaleFactor: 0, minPrice: 0, baseValue: -5, defaultReputation: 101 };
    expect(validateStrategyConfig(config)).toEqual([
      'baseValue: debe ser un entero mayor o igual a 0',
      'scaleFactor: debe ser un entero positivo',
      'minPrice: debe ser un entero mayor o igual a 1',
      'defaultReputation: debe ser un entero entre 0 y 100',
    ]);
  });
});
