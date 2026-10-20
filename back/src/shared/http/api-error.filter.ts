import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { CorrelationIdStore } from '../logging/correlation-id.store';
import { PinoLoggerService } from '../logging/pino-logger.service';

/** Formato de error estándar de los endpoints de 08-sobres (FR-049, contrato `ApiError`). */
export interface ApiErrorBody {
  code: string;
  message: string;
  correlationId: string;
  details?: string[];
}

const LOG_CONTEXT = 'ApiErrorFilter';

/**
 * Traduce cualquier excepción al formato `{ code, message, correlationId }` (research #10).
 *
 * Se aplica con `@UseFilters` solo a los controladores de `credits`, `tokens` y `packs`: los
 * contratos de 05 a 07 ya publicaron el formato por defecto de Nest y un filtro global los
 * rompería.
 *
 * - 401 → `UNAUTHENTICATED` (FR-047).
 * - 400 sin código (ValidationPipe, ParseUUIDPipe) → 422 `VALIDATION_ERROR` (FR-048).
 * - Excepciones de dominio con `code` en el body → su status y su código.
 * - Cualquier otra → 500 `INTERNAL_ERROR`, sin detalle interno.
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const correlationId = CorrelationIdStore.getId() ?? 'unknown';
    const { status, body } = this.translate(exception);

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `unexpected error: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
        LOG_CONTEXT,
      );
    }

    response.status(status).json({ ...body, correlationId } satisfies ApiErrorBody);
  }

  private translate(exception: unknown): { status: number; body: Omit<ApiErrorBody, 'correlationId'> } {
    if (exception instanceof UnauthorizedException) {
      return {
        status: HttpStatus.UNAUTHORIZED,
        body: { code: 'UNAUTHENTICATED', message: 'Se necesita una sesión válida' },
      };
    }

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const coded = readCode(payload);
      if (coded) return { status: exception.getStatus(), body: coded };

      if (exception instanceof BadRequestException) {
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          body: {
            code: 'VALIDATION_ERROR',
            message: 'La entrada es inválida',
            details: readMessages(payload),
          },
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado; no se aplicó ningún cambio' },
    };
  }
}

function readCode(payload: string | object): { code: string; message: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { code, message } = payload as { code?: unknown; message?: unknown };
  if (typeof code !== 'string') return null;
  return { code, message: typeof message === 'string' ? message : code };
}

function readMessages(payload: string | object): string[] {
  if (typeof payload === 'string') return [payload];
  const message = (payload as { message?: unknown }).message;
  if (Array.isArray(message)) return message.map(String);
  return typeof message === 'string' ? [message] : [];
}
