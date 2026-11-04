import { describe, expect, it } from 'vitest';
import { formatDay, periodLabel, presetPeriod, validateCustomRange } from '../admin-period';

const NOW = new Date(2026, 9, 31, 15, 0, 0);

/** 11-admin-panel — atajos y validación del selector de fechas (FR-036, FR-039). */
describe('admin-period', () => {
  it('cada atajo incluye hoy', () => {
    expect(presetPeriod('7d', NOW)).toEqual({ from: '2026-10-25', to: '2026-10-31' });
    expect(presetPeriod('30d', NOW)).toEqual({ from: '2026-10-02', to: '2026-10-31' });
    expect(presetPeriod('90d', NOW)).toEqual({ from: '2026-08-03', to: '2026-10-31' });
  });

  it('«Todo» no tiene fechas', () => {
    expect(presetPeriod('all', NOW)).toEqual({ from: null, to: null });
  });

  it('un rango necesita las dos fechas', () => {
    expect(validateCustomRange('', '2026-10-01', '2026-10-31')).toMatch(/dos fechas/);
    expect(validateCustomRange('2026-10-01', '', '2026-10-31')).toMatch(/dos fechas/);
  });

  it('rechaza rangos invertidos y fechas futuras, y acepta los válidos', () => {
    expect(validateCustomRange('2026-10-10', '2026-10-01', '2026-10-31')).toMatch(/posterior/);
    expect(validateCustomRange('2026-10-01', '2026-11-01', '2026-10-31')).toMatch(/futuras/);
    expect(validateCustomRange('2026-10-01', '2026-10-31', '2026-10-31')).toBeNull();
  });

  it('muestra el período en palabras sin correr el día', () => {
    expect(formatDay('2026-10-01')).toBe('01/10/2026');
    expect(periodLabel({ from: '2026-10-01', to: '2026-10-31' })).toBe('Del 01/10/2026 al 31/10/2026');
    expect(periodLabel({ from: null, to: null })).toBe('Toda la historia');
  });
});
