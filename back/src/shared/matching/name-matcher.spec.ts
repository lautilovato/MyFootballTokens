import { findBestMatch, jaroWinkler, normalizeName, sharesSurname } from './name-matcher';

// spec.md §9: reglas de matching cubiertas sin NestJS ni base de datos real.
describe('name-matcher', () => {
  describe('normalizeName', () => {
    it('quita acentos y pasa a minúsculas', () => {
      expect(normalizeName('Martín Ødegaard')).toBe('martin odegaard');
    });

    it('translitera letras que NFD no descompone (đ croata, ı turca)', () => {
      expect(normalizeName('Luka Đurić')).toBe('luka djuric');
      expect(normalizeName('Kenan Yıldız')).toBe('kenan yildiz');
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

  describe('findBestMatch con sharesSurname (jugadores)', () => {
    const threshold = 0.85;

    it('matchea nombre corto de WhoScored contra nombre completo con el mismo apellido', () => {
      const result = findBestMatch(
        'Dan Ballard',
        [
          { id: '1', fullName: 'Daniel Ballard' },
          { id: '2', fullName: 'Daniel Neil' },
        ],
        threshold,
        sharesSurname,
      );
      expect(result?.candidate.id).toBe('1');
    });

    it('matchea cuando el nombre completo tiene un apellido más (Noël Aséko / Noel Aseko Nkili)', () => {
      const result = findBestMatch(
        'Noël Aséko',
        [{ id: '1', fullName: 'Noel Aseko Nkili' }],
        threshold,
        sharesSurname,
      );
      expect(result?.candidate.id).toBe('1');
    });

    it('no matchea jugadores distintos que solo comparten el nombre de pila (Nick Woltemade / Nick Pope)', () => {
      const candidates = [
        { id: '1', fullName: 'Nick Pope' },
        { id: '2', fullName: 'Kieran Trippier' },
      ];
      // Sin el filtro, Jaro-Winkler lo acepta por el prefijo común "nick ".
      expect(findBestMatch('Nick Woltemade', candidates, threshold)?.candidate.id).toBe('1');
      expect(findBestMatch('Nick Woltemade', candidates, threshold, sharesSurname)).toBeNull();
    });
  });

  describe('sharesSurname', () => {
    it('acepta apellidos con variaciones menores de escritura', () => {
      expect(sharesSurname('yeremy pino', 'yeremi pino')).toBe(true);
    });

    it('acepta nombres de una sola palabra contenidos en el otro', () => {
      expect(sharesSurname('reinildo mandava', 'reinildo')).toBe(true);
    });

    it('rechaza nombres sin ningún apellido en común', () => {
      expect(sharesSurname('promise david', 'promise akinpelu')).toBe(false);
    });

    // Casos reales (WhoScored vs Player) que el filtro no debe perder.
    it.each([
      ['Alexis Claude-Maurice', 'Alexis Claude Maurice'],
      ['Jonathan Asp Jensen', 'Jonathan Asp-Jensen'],
      ['Enrico Delprato', 'Enrico Del Prato'],
      ['Armel Bella-Kotchap', 'Armel Bella Kotchap'],
      ['Stanis Idumbo', 'Stanis Idumbo-Muzambo'],
      ['Pierre Lees-Melou', 'Pierre Lees Melou'],
      ['Jones El Abdellaoui', 'Jones El-Abdellaoui'],
      ['Luka Djuric', 'Luka Đurić'],
      ['Kenan Yildiz', 'Kenan Yıldız'],
    ])('acepta "%s" contra "%s" (guiones, espacios y letras especiales)', (whoScored, player) => {
      expect(sharesSurname(whoScored, player)).toBe(true);
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
