import type { PackData } from '../components/pack/types';
import type { PlayerCardData } from '../components/player-card/types';
import type { OpeningCard, PackTypeInfo, PackTypeKey } from './packs.service';
import { toPlayerCardData } from './player-card.mapper';
import type { ApiPlayerCard } from './players.service';

/**
 * Respuestas de sobres → las formas que ya declaran los componentes `Pack` y `PlayerCard`.
 * Vive en `services/` porque es la única capa que conoce la forma de las respuestas
 * (constitución §7). Los componentes no cambian.
 */

export const PACK_TYPE_NAMES: Record<PackTypeKey, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

/** El nivel visual del sobre coincide con la rareza de su mismo nombre (spec, Assumptions). */
export function toPackData(info: PackTypeInfo): PackData {
  return {
    name: PACK_TYPE_NAMES[info.type],
    tier: info.type,
    series: `${info.remaining} sin abrir`,
    cardCount: info.cards,
  };
}

/**
 * Una carta del inventario: la carta del jugador (con su cotización vigente) y el número de
 * serie de ese token, que la carta muestra junto a la rareza.
 */
export function toInventoryCard(player: ApiPlayerCard, serial: number): PlayerCardData {
  const base = toPlayerCardData(player);
  return { ...base, token: { ...base.token, serial } };
}

/**
 * Una carta recién abierta: la carta del jugador, pero con la rareza y la cotización del
 * momento cero (FR-058) y el número de serie del token.
 */
export function toRevealedCard(card: OpeningCard): PlayerCardData {
  return toInventoryCard({ ...card.player, rarity: card.rarity, marketValue: card.quotePrice }, card.serial);
}
