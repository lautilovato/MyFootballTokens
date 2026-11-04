import { DEFAULT_INITIAL_CREDITS, parseInitialCredits } from './credits.model';

// FR-044, FR-045, research #11 — con un INITIAL_CREDITS inválido la aplicación no arranca.
describe('parseInitialCredits', () => {
  it.each(['0', '-5', '10.5', 'mucho'])('INITIAL_CREDITS=%s impide iniciar CreditsModule', (value) => {
    expect(() => parseInitialCredits(value)).toThrow(/INITIAL_CREDITS tiene que ser un entero positivo/);
  });

  it('INITIAL_CREDITS ausente usa 2000', () => {
    expect(parseInitialCredits(undefined)).toBe(DEFAULT_INITIAL_CREDITS);
    expect(DEFAULT_INITIAL_CREDITS).toBe(2000);
    expect(parseInitialCredits('3500')).toBe(3500);
  });

  it('un valor vacío o con espacios cuenta como ausente', () => {
    expect(parseInitialCredits('')).toBe(DEFAULT_INITIAL_CREDITS);
    expect(parseInitialCredits('   ')).toBe(DEFAULT_INITIAL_CREDITS);
  });
});
