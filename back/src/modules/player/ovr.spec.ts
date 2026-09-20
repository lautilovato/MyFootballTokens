import { OVR_MAX, ovrFromRating, ratingLowerBoundForOvr, ratingUpperBoundForOvr } from './ovr';

// data-model.md §2.1 y §2.3 — derivación del OVR y su inversa para el filtrado.
describe('ovr', () => {
  describe('ovrFromRating', () => {
    it('toma la parte entera y el primer decimal', () => {
      expect(ovrFromRating('8.63')).toBe(86);
      expect(ovrFromRating('8.07')).toBe(80);
      expect(ovrFromRating('7.08')).toBe(70);
      expect(ovrFromRating('6.94')).toBe(69);
    });

    it('trunca el segundo decimal en lugar de redondearlo', () => {
      expect(ovrFromRating('7.49')).toBe(74);
      expect(ovrFromRating('7.41')).toBe(74);
      // Si redondeara, 7.49 daría 75 y las dos dejarían de coincidir.
      expect(ovrFromRating('7.49')).toBe(ovrFromRating('7.41'));
    });

    it('recorta a 99 los ratings de 10 o más (FR-028)', () => {
      expect(ovrFromRating('10.00')).toBe(OVR_MAX);
      expect(ovrFromRating('12.50')).toBe(OVR_MAX);
    });

    it('acepta number además de la string que devuelve MikroORM', () => {
      expect(ovrFromRating(8.63)).toBe(86);
    });

    it('devuelve null cuando no hay rating, sin confundirlo con cero (FR-030)', () => {
      expect(ovrFromRating(null)).toBeNull();
      expect(ovrFromRating(undefined)).toBeNull();
    });

    it('nunca devuelve un valor fuera de 0..99', () => {
      for (const r of ['0.00', '5.55', '9.99', '10.00']) {
        const ovr = ovrFromRating(r);
        expect(ovr).toBeGreaterThanOrEqual(0);
        expect(ovr).toBeLessThanOrEqual(OVR_MAX);
      }
    });
  });

  // La inversa es lo que permite filtrar en la base sin materializar el OVR (research #1).
  describe('cotas de rating para un extremo de OVR', () => {
    it('minOvr = n se traduce a rating >= n/10', () => {
      expect(ratingLowerBoundForOvr(85)).toBeCloseTo(8.5, 10);
      expect(ratingLowerBoundForOvr(70)).toBeCloseTo(7.0, 10);
    });

    it('maxOvr = n se traduce a rating < (n+1)/10', () => {
      expect(ratingUpperBoundForOvr(84)).toBeCloseTo(8.5, 10);
      expect(ratingUpperBoundForOvr(76)).toBeCloseTo(7.7, 10);
    });

    it('las cotas son coherentes con la derivación en todo el rango', () => {
      // El paso es 0.01 porque la columna es decimal(4,2): no existen ratings con más
      // decimales, y restar menos que un paso saldría de la grilla real de valores.
      for (let ovr = 0; ovr <= 99; ovr++) {
        const lower = ratingLowerBoundForOvr(ovr);
        const upper = ratingUpperBoundForOvr(ovr);
        // Cualquier rating dentro de [lower, upper) debe producir exactamente ese OVR.
        expect(ovrFromRating(lower)).toBe(ovr);
        expect(ovrFromRating(upper - 0.01)).toBe(ovr);
      }
    });

    it('resiste el error de punto flotante de multiplicar por 10', () => {
      // 0.3 * 10 da 2.9999999999999996 en coma flotante: truncar eso daría 2, no 3.
      expect(ovrFromRating('0.30')).toBe(3);
      expect(ovrFromRating('7.70')).toBe(77);
      expect(ovrFromRating('8.50')).toBe(85);
    });
  });
});
