/**
 * Días del filtro de fechas del gráfico de cotizaciones (10-historial-operaciones FR-027, FR-028,
 * FR-031). Funciones puras: «un día» es un `YYYY-MM-DD` en la zona horaria del navegador, y el
 * servidor solo recibe instantes (research #4, #11). Este es el único lugar donde «día» significa
 * algo; el resto de la aplicación habla de instantes.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** El día de hoy en la zona horaria del navegador, para el `max` del selector. */
export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Un `YYYY-MM-DD` que existe en el calendario (rechaza `2026-02-31` y `2026-13-01`). */
export function isValidDay(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function parts(day: string): [number, number, number] {
  const match = DAY_PATTERN.exec(day);
  if (!match) throw new Error(`día inválido: ${day}`);
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
}

/** El instante (ISO, UTC) en que empieza ese día en la zona horaria del navegador. */
export function startOfLocalDay(day: string): string {
  const [year, month, date] = parts(day);
  return new Date(year, month, date, 0, 0, 0, 0).toISOString();
}

/** El instante (ISO, UTC) en que termina ese día en la zona horaria del navegador. */
export function endOfLocalDay(day: string): string {
  const [year, month, date] = parts(day);
  return new Date(year, month, date, 23, 59, 59, 999).toISOString();
}

const INVALID_DAY = 'La fecha no es válida. Usá el formato día/mes/año.';
const FUTURE_DAY = 'No se pueden elegir fechas futuras.';

/** Mensaje si el día no se puede buscar (mal formado o futuro); nulo si es válido. */
export function validateDay(day: string, today: string = todayLocal()): string | null {
  if (!isValidDay(day)) return INVALID_DAY;
  if (day > today) return FUTURE_DAY;
  return null;
}

/**
 * Mensaje si el rango «desde–hasta» no se puede aplicar; nulo si es válido. Cualquiera de los dos
 * extremos puede quedar vacío (rango abierto); con los dos vacíos no hay filtro.
 */
export function validateRange(from: string, to: string, today: string = todayLocal()): string | null {
  for (const day of [from, to]) {
    if (day === '') continue;
    const message = validateDay(day, today);
    if (message) return message;
  }
  if (from !== '' && to !== '' && from > to) return 'La fecha «desde» no puede ser posterior a «hasta».';
  return null;
}
