import { findBestMatch, jaroWinkler, normalizeName } from './name-matcher';

// spec.md §9: reglas de matching cubiertas sin NestJS ni base de datos real.
describe('name-matcher', () => {
  describe('normalizeName', () => {
    it('quita acentos y pasa a minúsculas', () => {
      expect(normalizeName('Martín Ødegaard')).toBe('martin odegaard');
    });

    it('colapsa espacios repetidos', () => {
      expect(normalizeName('  Bukayo   Saka  ')).toBe('bukayo saka');
    });
  });

  describe('findBestMatch', () => {
    const threshold = 0.85;

    it('matchea nombres idénticos', () => {
      const result = findBestMatch(
        'Bukayo Saka',
        [
          { id: '1', fullName: 'Bukayo Saka' },
          { id: '2', fullName: 'Gabriel Magalhães' },
        ],
        threshold,
      );
      expect(result?.candidate.id).toBe('1');
    });

    it('matchea nombres con acentos distintos (WhoScored sin acento vs Player con acento)', () => {
      const result = findBestMatch(
        'Martin Odegaard',
        [{ id: '1', fullName: 'Martín Ødegaard' }],
        threshold,
      );
      expect(result?.candidate.id).toBe('1');
      expect(result?.similarity).toBe(1);
    });

    it('matchea variantes de mayúsculas/espacios por encima del umbral', () => {
      const result = findBestMatch(
        '  DECLAN   RICE ',
        [
          { id: '1', fullName: 'Declan Rice' },
          { id: '2', fullName: 'Kai Havertz' },
        ],
        threshold,
      );
      expect(result?.candidate.id).toBe('1');
    });

    it('no matchea por debajo del umbral (spec.md §4.3: mejor no tener el dato que vincularlo mal)', () => {
      const result = findBestMatch(
        'Completely Different Name',
        [{ id: '1', fullName: 'Bukayo Saka' }],
        threshold,
      );
      expect(result).toBeNull();
    });

    it('no matchea si dos jugadores del mismo equipo tienen nombres parecidos y no hay forma confiable de desempatar', () => {
      const result = findBestMatch(
        'John Smith',
        [
          { id: '1', fullName: 'Jon Smith' },
          { id: '2', fullName: 'Jhon Smith' },
        ],
        threshold,
      );
      expect(result).toBeNull();
    });
  });

  describe('jaroWinkler', () => {
    it('devuelve 1 para strings idénticos', () => {
      expect(jaroWinkler('saka', 'saka')).toBe(1);
    });

    it('devuelve 0 para un string vacío', () => {
      expect(jaroWinkler('', 'saka')).toBe(0);
    });
  });
});
