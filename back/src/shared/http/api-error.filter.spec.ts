import { ArgumentsHost, BadRequestException, ConflictException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { CorrelationIdStore } from '../logging/correlation-id.store';
import { ApiErrorFilter } from './api-error.filter';

/**
 * Formato de error de los controladores de 08 y 09 (08 FR-049, 09 FR-033): cada excepción se
 * responde como `{ code, message, correlationId }` con el status que corresponde.
 */
describe('ApiErrorFilter', () => {
  const logger = { error: () => undefined };
  const filter = new ApiErrorFilter(logger as never);

  function translate(exception: unknown): { status: number; body: Record<string, unknown> } {
    const result = { status: 0, body: {} as Record<string, unknown> };
    const response = {
      status(code: number) {
        result.status = code;
        return this;
      },
      json(body: Record<string, unknown>) {
        result.body = body;
      },
    };
    const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
    CorrelationIdStore.run('corr-123', () => filter.catch(exception, host));
    return result;
  }

  it('401 → UNAUTHENTICATED', () => {
    const { status, body } = translate(new UnauthorizedException());
    expect(status).toBe(401);
    expect(body).toMatchObject({ code: 'UNAUTHENTICATED', correlationId: 'corr-123' });
  });

  it('400 del ValidationPipe → 422 VALIDATION_ERROR con el detalle por campo', () => {
    const { status, body } = translate(new BadRequestException(['property price should not exist']));
    expect(status).toBe(422);
    expect(body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: ['property price should not exist'],
      correlationId: 'corr-123',
    });
  });

  it('una excepción de dominio con código → su status y su código', () => {
    const { status, body } = translate(new ConflictException({ code: 'LISTING_NOT_ACTIVE', message: 'Ya no está a la venta' }));
    expect(status).toBe(409);
    expect(body).toEqual({ code: 'LISTING_NOT_ACTIVE', message: 'Ya no está a la venta', correlationId: 'corr-123' });
  });

  it('429 del límite de frecuencia → RATE_LIMITED (09 research #11)', () => {
    const throttled = new HttpException('ThrottlerException: Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    const { status, body } = translate(throttled);
    expect(status).toBe(429);
    expect(body).toMatchObject({ code: 'RATE_LIMITED', correlationId: 'corr-123' });
  });

  it('cualquier otro error → 500 INTERNAL_ERROR sin detalle interno', () => {
    const { status, body } = translate(new Error('detalle interno'));
    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('detalle interno');
    expect(body.correlationId).toBe('corr-123');
  });
});
