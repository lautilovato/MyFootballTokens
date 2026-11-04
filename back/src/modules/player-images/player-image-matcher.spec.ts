import type { TheSportsDbCandidate } from '../../adapters/the-sports-db/the-sports-db.adapter';
import {
  clubsMatch,
  pickBestCandidate,
  toSearchTerm,
  type PlayerToMatch,
} from './player-image-matcher';

const THRESHOLD = 0.85;

function candidate(overrides: Partial<TheSportsDbCandidate>): TheSportsDbCandidate {
  return {
    id: '1',
    name: 'Taiwo Awoniyi',
    team: 'Coventry City',
    isSoccer: true,
    dateBorn: '1997-08-12',
    nationality: 'Nigeria',
    ...overrides,
  };
}

const AWONIYI: PlayerToMatch = {
  fullName: 'Taiwo Awoniyi',
  dateOfBirth: '1997-08-12',
  teamName: 'Coventry City FC',
};

describe('clubsMatch', () => {
  it.each([
    ['Coventry City FC', 'Coventry City'],
    ['Real Sociedad de Fútbol', 'Real Sociedad'],
    ['Racing Club de Lens', 'Lens'],
    ['RCD Espanyol de Barcelona', 'Espanyol'],
    ['Hamburger SV', 'Hamburg SV'],
    ['Brighton & Hove Albion FC', 'Brighton and Hove Albion'],
  ])('reconoce "%s" y "%s" como el mismo club', (a, b) => {
    expect(clubsMatch(a, b)).toBe(true);
  });

  it.each([
    ['Real Madrid CF', 'Real Sociedad'],
    ['Manchester City FC', 'Manchester United'],
    ['AFC Bournemouth', 'Brentford'],
  ])('distingue "%s" de "%s"', (a, b) => {
    expect(clubsMatch(a, b)).toBe(false);
  });

  it('no coincide si un nombre queda vacío tras quitar el ruido', () => {
    expect(clubsMatch('FC', 'Coventry City')).toBe(false);
  });
});

describe('toSearchTerm', () => {
  it.each([
    ["Ibrahim M'Baye", 'Ibrahim MBaye'],
    ['Ibrahim M’Baye', 'Ibrahim MBaye'],
    ['  Lamine   Yamal ', 'Lamine Yamal'],
  ])('limpia "%s"', (input, expected) => {
    expect(toSearchTerm(input)).toBe(expected);
  });

  it('conserva los acentos: el buscador los tolera', () => {
    expect(toSearchTerm('João Pedro')).toBe('João Pedro');
  });
});

describe('pickBestCandidate', () => {
  it('acepta el candidato con el mismo nombre y la misma fecha de nacimiento', () => {
    const match = pickBestCandidate(AWONIYI, [candidate({})], THRESHOLD);

    expect(match?.id).toBe('1');
  });

  it('acepta por club cuando la fecha de nacimiento no coincide o falta', () => {
    const sinFecha = { ...AWONIYI, dateOfBirth: null };

    expect(pickBestCandidate(sinFecha, [candidate({ dateBorn: null })], THRESHOLD)?.id).toBe('1');
  });

  it('acepta por fecha de nacimiento aunque TheSportsDB tenga el club viejo', () => {
    const traspasado = candidate({ team: 'Nottingham Forest' });

    expect(pickBestCandidate(AWONIYI, [traspasado], THRESHOLD)?.id).toBe('1');
  });

  it('rechaza un homónimo sin fecha ni club que lo corroboren', () => {
    const homonimo = candidate({ team: 'Otro Club', dateBorn: '1990-01-01' });

    expect(pickBestCandidate(AWONIYI, [homonimo], THRESHOLD)).toBeNull();
  });

  it('rechaza a un jugador de otro deporte aunque coincida todo lo demás', () => {
    expect(pickBestCandidate(AWONIYI, [candidate({ isSoccer: false })], THRESHOLD)).toBeNull();
  });

  it('rechaza un nombre parecido que solo comparte el nombre de pila ("Pedri" vs "Pedrinho")', () => {
    const pedri: PlayerToMatch = { fullName: 'Pedri', dateOfBirth: '2002-11-25', teamName: 'FC Barcelona' };
    const pedrinho = candidate({ name: 'Pedrinho', team: '_Retired Soccer', dateBorn: '1975-10-11' });

    expect(pickBestCandidate(pedri, [pedrinho], THRESHOLD)).toBeNull();
  });

  it('prefiere al candidato que coincide por fecha sobre el que solo coincide por club', () => {
    const soloClub = candidate({ id: 'club', dateBorn: '1990-01-01' });
    const conFecha = candidate({ id: 'fecha', team: 'Otro Club' });

    expect(pickBestCandidate(AWONIYI, [soloClub, conFecha], THRESHOLD)?.id).toBe('fecha');
  });

  it('no vincula cuando dos candidatos son igual de buenos', () => {
    const duplicados = [candidate({ id: 'a' }), candidate({ id: 'b' })];

    expect(pickBestCandidate(AWONIYI, duplicados, THRESHOLD)).toBeNull();
  });

  it('cruza un nombre con apóstrofe contra su versión sin apóstrofe', () => {
    const mbaye: PlayerToMatch = {
      fullName: "Ibrahim M'Baye",
      dateOfBirth: '2008-01-24',
      teamName: 'Aston Villa FC',
    };
    const enTheSportsDb = candidate({
      id: 'mbaye',
      name: 'Ibrahim Mbaye',
      team: 'Paris Saint-Germain',
      dateBorn: '2008-01-24',
    });

    expect(pickBestCandidate(mbaye, [enTheSportsDb], THRESHOLD)?.id).toBe('mbaye');
  });

  it('devuelve null sin candidatos', () => {
    expect(pickBestCandidate(AWONIYI, [], THRESHOLD)).toBeNull();
  });
});
