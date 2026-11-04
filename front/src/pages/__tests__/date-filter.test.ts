import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endOfLocalDay, isValidDay, startOfLocalDay, todayLocal, validateDay, validateRange } from '../date-filter';

/** Fija la zona horaria del proceso: las conversiones de día dependen de la del navegador. */
function inZone(zone: string) {
  vi.stubEnv('TZ', zone);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => inZone('America/Argentina/Buenos_Aires'));

/** 10-historial-operaciones US3 — día local, rango y tope de hoy (FR-027, FR-028, FR-031). */
describe('date-filter', () => {
  describe('todayLocal', () => {
    it('devuelve el día en la zona del navegador, no el de UTC', () => {
      // 02:00 UTC del 15 es todavía el 14 en Buenos Aires (UTC-3).
      expect(todayLocal(new Date('2026-10-15T02:00:00Z'))).toBe('2026-10-14');
      inZone('Pacific/Kiritimati');
      // 12:00 UTC del 14 ya es el 15 en Kiritimati (UTC+14).
      expect(todayLocal(new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-15');
    });
  });

  describe('endOfLocalDay / startOfLocalDay', () => {
    it('el final de un día en Buenos Aires es 23:59:59.999 locales, ya del día siguiente en UTC', () => {
      expect(endOfLocalDay('2026-10-14')).toBe('2026-10-15T02:59:59.999Z');
      expect(startOfLocalDay('2026-10-14')).toBe('2026-10-14T03:00:00.000Z');
    });

    it('en una zona adelantada, el final del día cae antes en UTC', () => {
      inZone('Pacific/Kiritimati');
      expect(endOfLocalDay('2026-10-14')).toBe('2026-10-14T09:59:59.999Z');
      expect(startOfLocalDay('2026-10-14')).toBe('2026-10-13T10:00:00.000Z');
    });

    it('una cotización calculada a las 02:00 del lunes en la zona del usuario cae en el lunes', () => {
      // Lunes 12 de octubre de 2026, 02:00 locales en Buenos Aires = 05:00 UTC.
      const calculated = new Date('2026-10-12T05:00:00Z').getTime();
      expect(calculated).toBeGreaterThanOrEqual(new Date(startOfLocalDay('2026-10-12')).getTime());
      expect(calculated).toBeLessThanOrEqual(new Date(endOfLocalDay('2026-10-12')).getTime());
      // Y no en el domingo anterior.
      expect(calculated).toBeGreaterThan(new Date(endOfLocalDay('2026-10-11')).getTime());
    });

    it('rechaza un día mal formado', () => {
      expect(() => endOfLocalDay('ayer')).toThrow('día inválido');
    });
  });

  describe('isValidDay', () => {
    it('acepta los días que existen y rechaza el resto', () => {
      expect(isValidDay('2026-10-14')).toBe(true);
      expect(isValidDay('2028-02-29')).toBe(true);
      for (const bad of ['', 'ayer', '2026-13-01', '2026-02-31', '2026-10-1', '14/10/2026', '2026-10-14T00:00']) {
        expect(isValidDay(bad)).toBe(false);
      }
    });
  });

  describe('validateDay', () => {
    const today = '2026-10-14';

    it('acepta hoy y los días pasados', () => {
      expect(validateDay('2026-10-14', today)).toBeNull();
      expect(validateDay('2025-01-01', today)).toBeNull();
    });

    it('rechaza un día futuro', () => {
      expect(validateDay('2026-10-15', today)).toMatch(/futuras/);
    });

    it('rechaza un día mal formado', () => {
      expect(validateDay('2026-02-31', today)).toMatch(/no es válida/);
    });
  });

  describe('validateRange', () => {
    const today = '2026-10-14';

    it('acepta un rango válido, incluso de un solo día', () => {
      expect(validateRange('2026-09-01', '2026-10-14', today)).toBeNull();
      expect(validateRange('2026-10-01', '2026-10-01', today)).toBeNull();
    });

    it('acepta un rango abierto en cualquiera de los extremos, y sin extremos', () => {
      expect(validateRange('2026-09-01', '', today)).toBeNull();
      expect(validateRange('', '2026-09-01', today)).toBeNull();
      expect(validateRange('', '', today)).toBeNull();
    });

    it('rechaza un rango invertido', () => {
      expect(validateRange('2026-10-10', '2026-10-01', today)).toMatch(/desde.*posterior.*hasta/);
    });

    it('rechaza una fecha futura en cualquiera de los extremos', () => {
      expect(validateRange('2026-10-01', '2026-10-20', today)).toMatch(/futuras/);
      expect(validateRange('2026-10-20', '', today)).toMatch(/futuras/);
    });

    it('rechaza una fecha mal formada', () => {
      expect(validateRange('2026-13-01', '2026-10-01', today)).toMatch(/no es válida/);
    });
  });
});
