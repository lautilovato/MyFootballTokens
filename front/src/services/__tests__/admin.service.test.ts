import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminErrorMessage, getAdminMetrics, type AdminMetrics } from '../admin.service';
import { httpClient } from '../http-client';

vi.mock('../http-client', () => ({ httpClient: { get: vi.fn() } }));

const get = vi.mocked(httpClient.get);
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** 11-admin-panel — llamada de las métricas y mensajes por código de error. */
describe('admin.service', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('pide el período con la zona horaria del navegador (FR-038)', async () => {
    const metrics = {} as AdminMetrics;
    get.mockResolvedValue({ data: metrics });

    await expect(getAdminMetrics({ from: '2026-10-01', to: '2026-10-31' })).resolves.toBe(metrics);

    expect(get).toHaveBeenCalledWith('/admin/metrics', {
      params: { from: '2026-10-01', to: '2026-10-31', timezone, refresh: undefined },
    });
  });

  it('«Todo» no manda fechas, y actualizar saltea la caché (FR-026)', async () => {
    get.mockResolvedValue({ data: {} });

    await getAdminMetrics({ from: null, to: null }, true);

    expect(get).toHaveBeenCalledWith('/admin/metrics', {
      params: { from: undefined, to: undefined, timezone, refresh: 'true' },
    });
  });

  it('traduce cada código a un mensaje propio y cualquier otro caso a uno genérico', () => {
    expect(adminErrorMessage('FORBIDDEN')).toMatch(/administradores/);
    expect(adminErrorMessage('VALIDATION_ERROR')).toMatch(/fechas/);
    expect(adminErrorMessage('INTERNAL_ERROR')).toMatch(/inesperado/);
    expect(adminErrorMessage(null)).toMatch(/conexión/);
    expect(adminErrorMessage('OTRO')).toMatch(/conexión/);
  });
});
