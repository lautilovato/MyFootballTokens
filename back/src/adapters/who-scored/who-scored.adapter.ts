import { Injectable } from '@nestjs/common';
import { WhoScoredClient } from './who-scored.client';
import { WhoScoredParser } from './who-scored.parser';

const STATS_TABS = ['Summary', 'Offensive', 'Defensive'];
// Ids reales de los contenedores de pestañas, confirmados en vivo (research.md #4) — la
// página de equipo tiene dos widgets con pestañas de texto idéntico, el de plantel es este.
const TEAM_SQUAD_OPTIONS_ID = 'team-squad-stats-options';
const PLAYER_MATCHES_OPTIONS_ID = 'player-matches-stats-options';
// Sufijo del id del panel de contenido por categoría (`#statistics-table-{cat}{suffix}`),
// confirmado en vivo (research.md #4) — distinto entre la página de equipo y la de jugador.
const TEAM_PANEL_ID_SUFFIX = '';
const PLAYER_PANEL_ID_SUFFIX = '-matches';

export interface NormalizedSeasonStats {
  whoScoredPlayerId: string;
  whoScoredName: string;
  season: string;
  goals: number;
  assists: number;
  shotsPerGame: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  rating: number;
  height: number | null;
}

export interface NormalizedMatchStats {
  whoScoredMatchId: string;
  matchDate: string;
  season: string;
  goals: number;
  assists: number;
  shots: number;
  keyPasses: number;
  dribbles: number;
  tackles: number;
  rating: number;
}

export interface NormalizedStanding {
  whoScoredTeamId: string;
  whoScoredName: string;
}

/** Aísla el HTML/DOM crudo de WhoScored: nada fuera de este archivo conoce su estructura (research.md #4). */
@Injectable()
export class WhoScoredAdapter {
  constructor(
    private readonly client: WhoScoredClient,
    private readonly parser: WhoScoredParser,
  ) {}

  async getSquadStats(externalTeamId: string): Promise<NormalizedSeasonStats[]> {
    const baseUrl = process.env.WHO_SCORED_BASE_URL;
    const tabs = await this.client.fetchStatsTabs(
      `${baseUrl}/teams/${externalTeamId}`,
      STATS_TABS,
      TEAM_SQUAD_OPTIONS_ID,
      TEAM_PANEL_ID_SUFFIX,
    );
    const season = this.currentSeason();

    const summary = this.parser.parseStatsGrid(tabs.get('Summary') ?? '');
    const offensive = this.indexByHref(this.parser.parseStatsGrid(tabs.get('Offensive') ?? ''));
    const defensive = this.indexByHref(this.parser.parseStatsGrid(tabs.get('Defensive') ?? ''));

    return summary.map((row) => {
      const whoScoredPlayerId = this.extractId(row.href, '/players/');
      const off = whoScoredPlayerId ? offensive.get(whoScoredPlayerId) : undefined;
      const def = whoScoredPlayerId ? defensive.get(whoScoredPlayerId) : undefined;

      return {
        whoScoredPlayerId: whoScoredPlayerId ?? row.label,
        whoScoredName: row.label,
        season,
        goals: this.num(row.values.Goals),
        assists: this.num(row.values.Assists),
        shotsPerGame: this.num(row.values.SpG),
        keyPasses: this.num(off?.values.KeyP),
        dribbles: this.num(off?.values.Drb),
        tackles: this.num(def?.values.Tackles),
        rating: this.num(row.values.Rating),
        height: row.values.CM ? this.num(row.values.CM) : null,
      };
    });
  }

  async getPlayerMatchLog(externalPlayerId: string): Promise<NormalizedMatchStats[]> {
    const baseUrl = process.env.WHO_SCORED_BASE_URL;
    const tabs = await this.client.fetchStatsTabs(
      `${baseUrl}/players/${externalPlayerId}/matchstatistics`,
      STATS_TABS,
      PLAYER_MATCHES_OPTIONS_ID,
      PLAYER_PANEL_ID_SUFFIX,
    );
    const season = this.currentSeason();

    const summary = this.parser.parseStatsGrid(tabs.get('Summary') ?? '');
    const offensive = this.indexByHref(this.parser.parseStatsGrid(tabs.get('Offensive') ?? ''));
    const defensive = this.indexByHref(this.parser.parseStatsGrid(tabs.get('Defensive') ?? ''));

    return summary
      .map((row) => {
        const whoScoredMatchId = this.extractId(row.href, '/matches/');
        if (!whoScoredMatchId) return null;
        const off = offensive.get(whoScoredMatchId);
        const def = defensive.get(whoScoredMatchId);

        return {
          whoScoredMatchId,
          matchDate: this.parseDate(row.values.Date),
          season,
          goals: this.num(row.values.Goals),
          assists: this.num(row.values.Assists),
          shots: this.num(row.values.Shots),
          keyPasses: this.num(off?.values.KeyP),
          dribbles: this.num(off?.values.Drb),
          tackles: this.num(def?.values.Tackles),
          rating: this.num(row.values.Rating),
        };
      })
      .filter((row): row is NormalizedMatchStats => row !== null);
  }

  /**
   * Tabla de posiciones de una liga (04-team-whoscored-matching research.md #1) — sin
   * pestañas que clickear, una sola captura por request. Se espera una fila de datos
   * (`tbody tr`), no solo el elemento `<table>`: confirmado en vivo (sesión de
   * implementación 2026-09-16) que esperar solo el `<table>` es insuficiente — de forma
   * intermitente (~1 de cada 3 corridas reales), `page.content()` capturaba el HTML antes
   * de que las filas de equipos terminaran de agregarse al DOM, devolviendo una tabla vacía
   * sin ningún error.
   */
  async getLeagueStandings(whoScoredLeaguePath: string): Promise<NormalizedStanding[]> {
    const baseUrl = process.env.WHO_SCORED_BASE_URL;
    const html = await this.client.fetchRenderedPage(
      `${baseUrl}${whoScoredLeaguePath}`,
      'table[id^="standings-"] tbody tr',
    );

    return this.parser
      .parseStandingsGrid(html)
      .map((row) => {
        const whoScoredTeamId = this.extractId(row.href, '/teams/');
        return whoScoredTeamId ? { whoScoredTeamId, whoScoredName: row.label } : null;
      })
      .filter((row): row is NormalizedStanding => row !== null);
  }

  private indexByHref(rows: ReturnType<WhoScoredParser['parseStatsGrid']>) {
    const map = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const id = this.extractId(row.href, '/players/') ?? this.extractId(row.href, '/matches/');
      if (id) map.set(id, row);
    }
    return map;
  }

  private extractId(href: string | null, prefix: string): string | null {
    if (!href) return null;
    const idx = href.indexOf(prefix);
    if (idx === -1) return null;
    const rest = href.slice(idx + prefix.length);
    const id = rest.split('/')[0];
    return id || null;
  }

  private num(value: string | undefined): number {
    if (!value || value === '-') return 0;
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private parseDate(value: string | undefined): string {
    // WhoScored usa "dd-mm-aaaa" en las tablas de partido a partido (research.md #4).
    if (!value) return new Date().toISOString().slice(0, 10);
    const [day, month, year] = value.split('-');
    if (!day || !month || !year) return new Date().toISOString().slice(0, 10);
    return `${year}-${month}-${day}`;
  }

  /** Temporada europea (agosto-julio) derivada de la fecha actual — WhoScored no la expone como columna de la tabla (research.md #4). */
  private currentSeason(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const startYear = month >= 7 ? year : year - 1;
    return `${startYear}-${startYear + 1}`;
  }
}
