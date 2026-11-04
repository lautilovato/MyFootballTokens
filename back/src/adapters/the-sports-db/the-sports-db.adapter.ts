import { Injectable } from '@nestjs/common';
import {
  TheSportsDbLookupResponseDto,
  TheSportsDbSearchResponseDto,
} from './dtos/player.dto';
import { TheSportsDbClient } from './the-sports-db.client';

export interface TheSportsDbCandidate {
  id: string;
  name: string;
  team: string | null;
  isSoccer: boolean;
  dateBorn: string | null;
  nationality: string | null;
}

/** Aísla la forma cruda de TheSportsDB: nada fuera de este archivo conoce sus DTOs. */
@Injectable()
export class TheSportsDbAdapter {
  constructor(private readonly client: TheSportsDbClient) {}

  async searchPlayers(name: string): Promise<TheSportsDbCandidate[]> {
    const dto = await this.client.get<TheSportsDbSearchResponseDto>('searchplayers.php', { p: name });
    return (dto.player ?? []).map((player) => ({
      id: player.idPlayer,
      name: player.strPlayer,
      team: player.strTeam,
      isSoccer: player.strSport === 'Soccer',
      dateBorn: player.dateBorn,
      nationality: player.strNationality,
    }));
  }

  /** URL de la ilustración cartoon, o `null` si el jugador no tiene. */
  async getCartoonUrl(playerId: string): Promise<string | null> {
    const dto = await this.client.get<TheSportsDbLookupResponseDto>('lookupplayer.php', { id: playerId });
    return dto.players?.[0]?.strCartoon || null;
  }
}
