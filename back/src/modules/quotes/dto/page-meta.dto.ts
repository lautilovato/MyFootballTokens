import { ApiProperty } from '@nestjs/swagger';

/** Metadatos de paginación compartidos por el historial y la lista de corridas. */
export class PageMetaDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;

  static of(total: number, page: number, limit: number): PageMetaDto {
    const meta = new PageMetaDto();
    meta.total = total;
    meta.page = page;
    meta.limit = limit;
    meta.totalPages = Math.ceil(total / limit);
    return meta;
  }
}
