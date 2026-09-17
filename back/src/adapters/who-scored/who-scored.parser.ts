import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

const STATS_TABLE_SELECTOR = 'table#top-player-stats-summary-grid';
const STANDINGS_TABLE_SELECTOR = 'table[id^="standings-"]';

export interface StandingsRow {
  /** href del equipo, ej. "/teams/65/show/spain-barcelona" (04-team-whoscored-matching research.md #1). */
  href: string | null;
  /** Nombre limpio del equipo, tomado del `<a>` (nunca del texto completo de la celda, que trae la posición pegada, ej. "1Barcelona"). */
  label: string;
}

export interface StatsGridRow {
  /** href de la primera columna con link (jugador en la vista de plantel, partido en la vista de historial). */
  href: string | null;
  /** Texto de la primera columna (nombre de jugador u oponente), sin recortar por acentos/mayúsculas. */
  label: string;
  values: Record<string, string>;
}

/**
 * Parsea `#top-player-stats-summary-grid` (research.md #4) para UNA categoría (Summary,
 * Offensive o Defensive) ya renderizada por WhoScoredClient. El nombre de columna real
 * queda como clave del row (ej. "Goals", "SpG", "KeyP", "Tackles"); el adapter decide qué
 * columnas de qué categoría componen cada campo normalizado (data-model.md).
 */
@Injectable()
export class WhoScoredParser {
  parseStatsGrid(html: string): StatsGridRow[] {
    const $ = cheerio.load(html);
    const table = $(STATS_TABLE_SELECTOR).first();
    if (table.length === 0) return [];

    const headerCells = table.find('thead th, tr:first-child th').toArray();
    const columnIndexByHeader = new Map<string, number>();
    headerCells.forEach((th, index) => {
      const text = $(th).text().trim();
      if (text && !columnIndexByHeader.has(text)) {
        columnIndexByHeader.set(text, index);
      }
    });

    return table
      .find('tbody tr')
      .toArray()
      .map((tr) => {
        const cells = $(tr).find('td').toArray();
        const firstLink = $(tr).find('td a').first();
        const values: Record<string, string> = {};
        for (const [header, index] of columnIndexByHeader.entries()) {
          const cell = cells[index];
          if (cell) values[header] = $(cell).text().trim();
        }
        return {
          href: firstLink.attr('href') ?? null,
          label: firstLink.text().trim() || $(cells[0]).text().trim(),
          values,
        };
      })
      .filter((row) => row.label.length > 0);
  }

  /**
   * Parsea la tabla de posiciones de una liga (04-team-whoscored-matching research.md #1):
   * sin categorías que combinar, así que no hace falta el `columnIndexByHeader` genérico de
   * `parseStatsGrid` — solo se descartan las filas de encabezado (no tienen `<a
   * href="/teams/...">`) y se extrae nombre+href del link de cada fila de datos.
   */
  parseStandingsGrid(html: string): StandingsRow[] {
    const $ = cheerio.load(html);
    const table = $(STANDINGS_TABLE_SELECTOR).first();
    if (table.length === 0) return [];

    return table
      .find('tbody tr')
      .toArray()
      .map((tr) => {
        const link = $(tr).find('a[href^="/teams/"]').first();
        return { href: link.attr('href') ?? null, label: link.text().trim() };
      })
      .filter((row): row is StandingsRow => row.href !== null && row.label.length > 0);
  }
}
