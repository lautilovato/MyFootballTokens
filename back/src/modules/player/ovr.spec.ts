import { OVR_MAX, ovrFromReputation } from './ovr';

/** 08-sobres FR-067, FR-068: el OVR es la reputación mundial cargada. */
describe('ovrFromReputation', () => {
  it('es la reputación', () => {
    expect(ovrFromReputation(91)).toBe(91);
    expect(ovrFromReputation(70)).toBe(70);
    expect(ovrFromReputation(0)).toBe(0);
  });

  it('una reputación de 100 se presenta como 99', () => {
    expect(ovrFromReputation(100)).toBe(OVR_MAX);
  });

  it('acota valores fuera de rango', () => {
    expect(ovrFromReputation(120)).toBe(OVR_MAX);
    expect(ovrFromReputation(-5)).toBe(0);
  });

  it('es nulo sin reputación cargada', () => {
    expect(ovrFromReputation(null)).toBeNull();
    expect(ovrFromReputation(undefined)).toBeNull();
    expect(ovrFromReputation(Number.NaN)).toBeNull();
  });
});
