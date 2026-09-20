import { nationalityCode } from './nationality-code';

// research #7 — el componente de carta arma la URL de flagcdn con este código.
describe('nationality-code', () => {
  it('devuelve el alpha-2 en minúscula', () => {
    expect(nationalityCode('Argentina')).toBe('ar');
    expect(nationalityCode('Brazil')).toBe('br');
    expect(nationalityCode('France')).toBe('fr');
    expect(nationalityCode('Spain')).toBe('es');
    expect(nationalityCode('Germany')).toBe('de');
    expect(nationalityCode('Italy')).toBe('it');
  });

  it('mapea las selecciones británicas a las subdivisiones de flagcdn', () => {
    // Ningún estándar alpha-2 las contiene: flagcdn las sirve como subdivisiones.
    expect(nationalityCode('England')).toBe('gb-eng');
    expect(nationalityCode('Scotland')).toBe('gb-sct');
    expect(nationalityCode('Wales')).toBe('gb-wls');
    expect(nationalityCode('Northern Ireland')).toBe('gb-nir');
  });

  it('no se deja confundir por mayúsculas ni espacios sobrantes', () => {
    expect(nationalityCode('  argentina ')).toBe('ar');
    expect(nationalityCode('NETHERLANDS')).toBe('nl');
  });

  it('devuelve null para un país no mapeado, para que la carta omita la bandera', () => {
    expect(nationalityCode('Wakanda')).toBeNull();
  });

  it('devuelve null cuando el jugador no tiene nacionalidad cargada', () => {
    expect(nationalityCode(null)).toBeNull();
    expect(nationalityCode(undefined)).toBeNull();
    expect(nationalityCode('')).toBeNull();
  });
});
