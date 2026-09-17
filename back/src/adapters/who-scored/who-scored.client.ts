import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';

// User-agent/viewport de un navegador real: el Chromium headless por defecto de Playwright
// (sin estos) es detectado y bloqueado por el Cloudflare de WhoScored incluso sin ningún
// patrón de tráfico sospechoso — confirmado en vivo (research.md #4, sesión de implementación
// 2026-09-16). No es la "escalada pesada" que spec.md §5 reserva para un bloqueo persistente;
// es el mínimo para que un Chromium headless no se identifique como tal.
const REALISTIC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export class WhoScoredBlockedException extends Error {
  constructor(consecutiveFailures: number) {
    super(`WhoScored parece estar bloqueando el acceso (${consecutiveFailures} fallos consecutivos)`);
    this.name = 'WhoScoredBlockedException';
  }
}

/** Fetch headless de WhoScored: la tabla de stats se renderiza client-side, cheerio solo no alcanza (research.md #3/#4). */
@Injectable()
export class WhoScoredClient implements OnModuleDestroy {
  private readonly minDelayMs = Number(process.env.WHO_SCORED_MIN_DELAY_MS ?? 2000);
  private readonly maxConsecutiveFailures = Number(
    process.env.WHO_SCORED_MAX_CONSECUTIVE_FAILURES ?? 5,
  );

  private queue: Promise<unknown> = Promise.resolve();
  private consecutiveFailures = 0;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(private readonly logger: PinoLoggerService) {}

  /**
   * Navega una vez a `url` y captura el HTML renderizado del panel de stats activo para
   * cada pestaña en `tabLabels` (ej. ['Summary', 'Offensive', 'Defensive']), clickeando
   * cada una en el mismo `page` antes de capturar. La primera pestaña de la lista se asume
   * activa por defecto (no se clickea).
   *
   * `optionsContainerId` acota el click al nav de pestañas correcto: la página de equipo
   * tiene DOS widgets de stats con pestañas "Offensive"/"Defensive" idénticas en texto
   * (`#top-team-stats-options` para stats de equipo, `#team-squad-stats-options` para el
   * plantel) — un click sin acotar es ambiguo (confirmado en vivo, sesión 2026-09-16).
   *
   * `panelIdSuffix` (`''` para la página de equipo, `'-matches'` para la de jugador) arma el
   * id real del panel de contenido por categoría: `#statistics-table-{summary|offensive|
   * defensive}{panelIdSuffix}`. Al cambiar de pestaña, WhoScored **agrega** una tabla nueva
   * con el mismo id `top-player-stats-summary-grid` en vez de reemplazar el contenido de la
   * anterior — la vieja queda oculta pero sigue en el DOM (confirmado en vivo). Por eso NO
   * se captura `page.content()` completo (cheerio tomaría la primera tabla, que después de
   * un click es la vieja/oculta) — se captura el `innerHTML` de cada panel por su id
   * específico, que es único y sin ambigüedad.
   */
  async fetchStatsTabs(
    url: string,
    tabLabels: string[],
    optionsContainerId: string,
    panelIdSuffix: string,
  ): Promise<Map<string, string>> {
    return this.enqueue(url, () => this.requestStatsTabs(url, tabLabels, optionsContainerId, panelIdSuffix));
  }

  /**
   * Navega una vez a `url` y devuelve el HTML ya renderizado de toda la página — para
   * páginas sin pestañas que clickear (ej. la tabla de posiciones de una liga,
   * 04-team-whoscored-matching research.md #1/#2). Comparte la misma cola de rate-limit y
   * el mismo contador de fallos consecutivos que `fetchStatsTabs`.
   */
  async fetchRenderedPage(url: string, readySelector: string): Promise<string> {
    return this.enqueue(url, () => this.requestRenderedPage(url, readySelector));
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
  }

  private async enqueue<T>(url: string, work: () => Promise<T>): Promise<T> {
    const task = this.queue.then(() => this.delay(this.minDelayMs)).then(() => this.guarded(url, work));
    this.queue = task.catch(() => undefined);
    return task;
  }

  private async guarded<T>(url: string, work: () => Promise<T>): Promise<T> {
    try {
      const result = await work();
      this.consecutiveFailures = 0;
      return result;
    } catch (error: unknown) {
      this.consecutiveFailures += 1;
      this.logger.event('WhoScoredClient', 'request a WhoScored falló', {
        url,
        consecutiveFailures: this.consecutiveFailures,
        message: error instanceof Error ? error.message : String(error),
      });

      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        throw new WhoScoredBlockedException(this.consecutiveFailures);
      }
      throw error;
    }
  }

  private async requestStatsTabs(
    url: string,
    tabLabels: string[],
    optionsContainerId: string,
    panelIdSuffix: string,
  ): Promise<Map<string, string>> {
    const context = await this.getContext();
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // Espera una fila de datos, no solo el <table> — esperar solo el elemento es
      // insuficiente de forma intermitente (research.md #1 de 04-team-whoscored-matching,
      // mismo riesgo aplicable acá: page.content() puede capturar antes de que las filas
      // terminen de agregarse al DOM).
      await page.waitForSelector('table#top-player-stats-summary-grid tbody tr', { timeout: 20000 });

      const captures = new Map<string, string>();
      for (const [index, label] of tabLabels.entries()) {
        const panelId = `statistics-table-${label.toLowerCase()}${panelIdSuffix}`;
        const panel = page.locator(`#${panelId}`);
        if (index > 0) {
          await this.clickTabLink(page, optionsContainerId, label);
          // Espera una fila de datos, no solo que la tabla esté visible — mismo riesgo de
          // captura prematura que en el goto inicial (ver comentario arriba).
          await panel.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 });
        }
        captures.set(label, await panel.innerHTML());
      }
      return captures;
    } finally {
      await page.close();
    }
  }

  private async requestRenderedPage(url: string, readySelector: string): Promise<string> {
    const context = await this.getContext();
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector(readySelector, { timeout: 20000 });
      return await page.content();
    } finally {
      await page.close();
    }
  }

  /**
   * WhoScored tiene un elemento fixed/full-viewport con z-index máximo (assets del widget
   * "TEAMMATE") que intercepta clicks sintéticos de Playwright incluso cuando el link
   * target está visualmente descubierto — confirmado en vivo (sesión 2026-09-16): tanto un
   * click normal como uno con `force:true` fallan con "intercepts pointer events" o quedan
   * en la pestaña anterior sin error. La solución robusta es invocar `.click()` nativo del
   * elemento vía `page.evaluate`, que no hace hit-testing de pointer events en absoluto.
   */
  private async clickTabLink(page: Page, optionsContainerId: string, label: string): Promise<void> {
    const clicked = await page.evaluate(
      ({ navId, linkLabel }) => {
        const nav = document.getElementById(navId);
        const link = nav
          ? Array.from(nav.querySelectorAll('a')).find((a) => a.textContent?.trim() === linkLabel)
          : null;
        if (!link) return false;
        (link as HTMLElement).click();
        return true;
      },
      { navId: optionsContainerId, linkLabel: label },
    );
    if (!clicked) {
      throw new Error(`No se encontró el link de pestaña "${label}" dentro de #${optionsContainerId}`);
    }
  }

  private async getContext(): Promise<BrowserContext> {
    if (!this.context) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      this.context = await this.browser.newContext({
        userAgent: REALISTIC_USER_AGENT,
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
      });
    }
    return this.context;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
