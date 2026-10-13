/**
 * Forma cruda de TheSportsDB. Solo los campos que se usan: la API devuelve ~60 por jugador.
 *
 * `searchplayers.php` NO incluye `strCartoon`; hay que pedir `lookupplayer.php` con el
 * `idPlayer` para obtenerlo (verificado en vivo contra la API).
 */
export interface TheSportsDbPlayerDto {
  idPlayer: string;
  strPlayer: string;
  strTeam: string | null;
  strSport: string | null;
  dateBorn: string | null;
  strNationality: string | null;
  strStatus: string | null;
  strCartoon?: string | null;
}

export interface TheSportsDbSearchResponseDto {
  player: TheSportsDbPlayerDto[] | null;
}

export interface TheSportsDbLookupResponseDto {
  players: TheSportsDbPlayerDto[] | null;
}
