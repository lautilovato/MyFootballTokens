import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import pinoHttp, { type HttpLogger } from 'pino-http';
import { CorrelationIdStore } from './correlation-id.store';
import { CORRELATION_ID_HEADER, PinoLoggerService } from './pino-logger.service';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly httpLogger: HttpLogger<Request, Response>;

  constructor(private readonly logger: PinoLoggerService) {
    this.httpLogger = pinoHttp<Request, Response>({
      logger: this.logger.pino,
      genReqId: (req, res) => {
        const incoming = req.headers[CORRELATION_ID_HEADER];
        const id = typeof incoming === 'string' && incoming.trim().length > 0 ? incoming : randomUUID();
        res.setHeader(CORRELATION_ID_HEADER, id);
        return id;
      },
    });
  }

  use(req: Request, res: Response, next: NextFunction): void {
    this.httpLogger(req, res, () => {
      CorrelationIdStore.run(String((req as unknown as { id: string }).id), () => next());
    });
  }
}
