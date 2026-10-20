import { randomUUID } from 'node:crypto';
import { Entity, Enum, PrimaryKey, Property, ManyToOne } from '@mikro-orm/decorators/legacy';
import { PackBatch } from './pack-batch.entity';

/** Los cuatro tipos de sobre, de menor a mayor (08-sobres FR-008). */
export enum PackType {
  COMMON = 'common',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary',
}

export enum PackStatus {
  UNOPENED = 'sin_abrir',
  OPENED = 'abierto',
}

/**
 * Una unidad del stock. Su contenido son los tokens con `pack_id` = este sobre, y mientras está
 * sin abrir nunca se expone en una respuesta ni en un log (FR-015).
 */
@Entity()
export class Pack {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => PackBatch)
  batch!: PackBatch;

  @Enum(() => PackType)
  type!: PackType;

  @Property({ type: 'smallint' })
  cardCount!: number;

  @Enum(() => PackStatus)
  status!: PackStatus;

  @Property({ type: 'Date', nullable: true })
  openedAt?: Date | null;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
