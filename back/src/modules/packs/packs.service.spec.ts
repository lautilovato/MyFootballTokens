import { PacksService } from './packs.service';

/**
 * 08-sobres FR-045, research #11: con una configuración inválida la aplicación no arranca, y el
 * error nombra la regla que falla.
 */
describe('arranque con configuración inválida', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  function packsService(): PacksService {
    const logger = { event: () => undefined, error: () => undefined, warn: () => undefined };
    return new PacksService({} as never, {} as never, {} as never, logger as never, {} as never, {} as never);
  }

  it('PACK_TYPES_CONFIG inválida impide iniciar PacksModule', () => {
    const config = {
      common: { price: 0, cards: 3, probabilities: { common: 1 }, share: 1 },
      rare: { price: 200, cards: 4, probabilities: { common: 1 }, share: 0 },
      epic: { price: 400, cards: 5, probabilities: { common: 1 }, share: 0 },
      legendary: { price: 800, cards: 6, probabilities: { common: 1 }, share: 0 },
    };
    process.env.PACK_TYPES_CONFIG = JSON.stringify(config);
    process.env.PACKS_SCHEDULER_ENABLED = 'false';

    expect(() => packsService().onModuleInit()).toThrow(/common: el precio tiene que ser un entero positivo/);
  });

  it('un JSON malformado también impide iniciar', () => {
    process.env.PACK_TYPES_CONFIG = '{ roto';
    expect(() => packsService().onModuleInit()).toThrow(/no es un JSON válido/);
  });
});
