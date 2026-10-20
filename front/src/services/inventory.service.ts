import { httpClient } from './http-client';
import type { ApiPlayerCard } from './players.service';

/**
 * Inventario del usuario de la sesión. Contrato en
 * .specify/specs/08-sobres/contracts/packs.openapi.yaml (GET /inventory).
 */

export interface InventoryToken {
  id: string;
  serial: number;
  /** Publicación activa del token; nulo si no está a la venta (09-mercado FR-025). */
  listingId: string | null;
}

export interface InventoryItem {
  /** Carta del jugador, con su cotización vigente en `marketValue`. */
  player: ApiPlayerCard;
  reputation: number | null;
  count: number;
  tokens: InventoryToken[];
}

export interface InventoryPage {
  data: InventoryItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export async function getInventory(page: number, limit: number): Promise<InventoryPage> {
  const { data } = await httpClient.get<InventoryPage>('/inventory', { params: { page, limit } });
  return data;
}
