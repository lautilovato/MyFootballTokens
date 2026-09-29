import type { PlayerCardData, Position } from '../components/player-card/types';
import type { ApiPlayerCard } from './players.service';

/**
 * Respuesta de la API → la forma que el componente de carta ya declara en
 * components/player-card/types.ts.
 *
 * El componente está congelado (FR-020): si un dato no llega en la forma que espera, se
 * resuelve acá, nunca modificándolo. La traducción vive en `services/` porque es la única
 * capa que conoce la forma de las respuestas del backend (constitución §7).
 *
 * Tres detalles leídos del código del componente:
 *  - `photoUrl` y `club.crestUrl` son opcionales: sin definir, dibuja su silueta y un escudo
 *    con iniciales. Se dejan sin definir en vez de inventar una URL que daría una imagen
 *    rota (FR-026).
 *  - `price.history` solo dibuja el sparkline con más de un punto; con menos lo omite.
 *  - `nationality.code` alimenta la URL de flagcdn. El backend ya lo manda traducido desde el
 *    nombre del país; si no pudo mapearlo viene nulo y acá se manda vacío para que la bandera
 *    simplemente no cargue.
 */

/** El componente no acepta UNKNOWN; se muestra como mediocampista para no romper la carta. */
function toCardPosition(position: ApiPlayerCard['position']): Position {
  return position === 'UNKNOWN' ? 'MF' : position;
}

export function toPlayerCardData(player: ApiPlayerCard): PlayerCardData {
  return {
    name: player.name,
    position: toCardPosition(player.position),
    // Sin estadísticas no hay OVR: 0 es lo único que la carta puede mostrar, y la rareza
    // `common` que la acompaña ya comunica que el jugador no está valorado.
    overall: player.ovr ?? 0,
    club: {
      name: player.club.name,
      ...(player.club.crestUrl ? { crestUrl: player.club.crestUrl } : {}),
    },
    nationality: {
      name: player.nationality.name ?? 'Sin dato',
      code: player.nationality.code ?? '',
    },
    token: {
      rarity: player.rarity,
      supply: player.supply.total,
      minted: player.supply.minted,
    },
    price: {
      current: player.marketValue,
      currency: 'USD',
      changePct: player.changePct,
      history: player.priceHistory,
    },
    stats: [
      { label: 'G', value: player.goals ?? '—', title: 'Goles' },
      { label: 'A', value: player.assists ?? '—', title: 'Asistencias' },
      { label: 'OVR', value: player.ovr ?? '—', title: 'Valoración general' },
    ],
  };
}
