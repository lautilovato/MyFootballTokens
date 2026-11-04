import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOperations, historyErrorMessage, HISTORY_PAGE_SIZE, type OperationsPage } from '../history.service';
import { httpClient } from '../http-client';

vi.mock('../http-client', () => ({ httpClient: { get: vi.fn() } }));

const get = vi.mocked(httpClient.get);

const page: OperationsPage = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };

/** 10-historial-operaciones — llamada del historial y mensajes por código de error. */
describe('history.service', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('getOperations pide el filtro, la página y el tamaño, y devuelve los datos tal cual', async () => {
    get.mockResolvedValue({ data: page });
    await expect(getOperations('acquired', 3, 10)).resolves.toBe(page);
    expect(get).toHaveBeenCalledWith('/history/operations', { params: { type: 'acquired', page: 3, limit: 10 } });
  });

  it('getOperations usa el tamaño de página por defecto', async () => {
    get.mockResolvedValue({ data: page });
    await getOperations('all', 1);
    expect(get).toHaveBeenCalledWith('/history/operations', { params: { type: 'all', page: 1, limit: HISTORY_PAGE_SIZE } });
  });

  it('un error de la red se propaga', async () => {
    get.mockRejectedValue(new Error('Network Error'));
    await expect(getOperations('sold', 1)).rejects.toThrow('Network Error');
  });

  it('traduce cada código a un mensaje propio y cualquier otro caso a uno genérico', () => {
    expect(historyErrorMessage('VALIDATION_ERROR')).toMatch(/Recargá/);
    expect(historyErrorMessage('INTERNAL_ERROR')).toMatch(/inesperado/);
    expect(historyErrorMessage(null)).toMatch(/conexión/);
    expect(historyErrorMessage('OTRO')).toMatch(/conexión/);
  });
});
