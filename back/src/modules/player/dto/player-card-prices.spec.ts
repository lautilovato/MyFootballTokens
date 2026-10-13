import { Player, PlayerPosition } from '../../../infrastructure/database/entities/player.entity';
import { PlayerCardDto, PlayerDetailDto } from './player-response.dto';

function player(baseValue = '5000.00'): Player {
  return Object.assign(new Player(), {
    id: '22222222-2222-4222-8222-222222222222',
    fullName: 'Bruno Epico',
    position: PlayerPosition.MF,
    nationality: 'Portugal',
    baseValue,
    height: 180,
    team: { name: 'Lisboa FC', crestUrl: null, league: { name: 'Liga Portugal' } },
  });
}

describe('PlayerCardDto — precios de las cotizaciones', () => {
  it('toma la variación y la serie de las cotizaciones recibidas', () => {
    const dto = PlayerCardDto.fromEntity({
      player: player(),
      stats: null,
      priceSeries: [3000, 4000, 4500, 5000],
    });

    expect(dto.priceHistory).toEqual([3000, 4000, 4500, 5000]);
    expect(dto.changePct).toBe(11.1);
    expect(dto.marketValue).toBe(5000);
  });

  it('una fila sin cotizaciones (priceSeries ausente) da serie vacía y variación 0', () => {
    const dto = PlayerCardDto.fromEntity({ player: player(), stats: null });

    expect(dto.priceHistory).toEqual([]);
    expect(dto.changePct).toBe(0);
  });

  it('priceSeries vacía es lo mismo que ausente', () => {
    const dto = PlayerCardDto.fromEntity({ player: player(), stats: null, priceSeries: [] });

    expect(dto.priceHistory).toEqual([]);
    expect(dto.changePct).toBe(0);
  });

  it('el detalle reusa exactamente la misma variación y serie que la carta', () => {
    const row = { player: player(), stats: null, priceSeries: [100, 150] };
    const card = PlayerCardDto.fromEntity(row);
    const detail = PlayerDetailDto.fromEntity(row);

    expect(detail.priceHistory).toEqual(card.priceHistory);
    expect(detail.changePct).toBe(card.changePct);
    expect(detail.changePct).toBe(50);
  });
});
