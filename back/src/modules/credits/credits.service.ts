import { randomUUID } from 'node:crypto';
import { Injectable, OnApplicationBootstrap, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { CorrelationIdStore } from '../../shared/logging/correlation-id.store';
import { PinoLoggerService } from '../../shared/logging/pino-logger.service';
import { CreditBalanceDto } from './dto/credit-balance.dto';
import { InitialGrantsResultDto } from './dto/initial-grants-result.dto';
import { CreditsRepository } from './credits.repository';

const LOG_CONTEXT = 'CreditsService';

/** Cantidad inicial por defecto (spec, Assumptions). */
export const DEFAULT_INITIAL_CREDITS = 2000;

/** Tamaño de cada tanda de la regularización. */
const BACKFILL_BATCH_SIZE = 200;

/** Lee `INITIAL_CREDITS`: entero positivo, por defecto 2000 (FR-044, FR-045). */
export function parseInitialCredits(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_INITIAL_CREDITS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`INITIAL_CREDITS tiene que ser un entero positivo (recibido: "${raw}")`);
  }
  return value;
}

@Injectable()
export class CreditsService implements OnModuleInit, OnApplicationBootstrap {
  private initialCredits = DEFAULT_INITIAL_CREDITS;

  constructor(
    private readonly creditsRepository: CreditsRepository,
    private readonly logger: PinoLoggerService,
  ) {}

  /** Con un `INITIAL_CREDITS` inválido la aplicación no arranca (research #11). */
  onModuleInit(): void {
    this.initialCredits = parseInitialCredits(process.env.INITIAL_CREDITS);
  }

  /**
   * Regulariza a los usuarios anteriores a la feature al arrancar (FR-002). Nunca tira la app:
   * si falla, lo deja en el log y queda el disparo manual.
   */
  async onApplicationBootstrap(): Promise<void> {
    await CorrelationIdStore.run(randomUUID(), async () => {
      try {
        await this.backfillInitialGrants();
      } catch (error) {
        this.logger.warn(
          `initial grants backfill failed: ${error instanceof Error ? error.message : String(error)}`,
          LOG_CONTEXT,
        );
      }
    });
  }

  /**
   * Entrega inicial de un usuario (FR-001). Es una emisión de créditos (FR-007). Si ya hay una
   * transacción en curso —la del registro— se suma a ella.
   */
  async grantInitial(userId: string): Promise<boolean> {
    const correlationId = CorrelationIdStore.getId() ?? randomUUID();
    const granted = await this.creditsRepository.inTransaction(() =>
      this.creditsRepository.insertInitialGrant(userId, this.initialCredits, correlationId),
    );
    if (granted) {
      this.logger.event(LOG_CONTEXT, 'credits granted', { amount: this.initialCredits, movements: 1 });
    }
    return granted;
  }

  /** Entrega la cantidad inicial a quien no la tenga. Idempotente (FR-002, SC-004). */
  async backfillInitialGrants(): Promise<InitialGrantsResultDto> {
    let granted = 0;
    const seen = new Set<string>();

    for (;;) {
      const pending = (await this.creditsRepository.findUsersWithoutInitialGrant(BACKFILL_BATCH_SIZE)).filter(
        (id) => !seen.has(id),
      );
      if (pending.length === 0) break;

      for (const userId of pending) {
        seen.add(userId);
        if (await this.grantInitial(userId)) granted++;
      }
    }

    this.logger.event(LOG_CONTEXT, 'initial grants backfilled', { granted, amount: this.initialCredits });
    return { granted, amount: this.initialCredits };
  }

  async getBalance(userId: string): Promise<CreditBalanceDto> {
    const credits = await this.creditsRepository.getBalance(userId);
    // Un token válido de una cuenta que ya no existe no es una sesión válida (FR-047).
    if (credits === null) throw new UnauthorizedException();
    return { credits };
  }
}
