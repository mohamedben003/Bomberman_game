import { TestBed } from '@angular/core/testing';

import { TILE_COUNT } from '../../core/models/game.constants';
import { TilesLayerComponent } from './tiles-layer.component';

describe('TilesLayerComponent', () => {
  async function create(tiles: readonly number[]): Promise<HTMLElement> {
    await TestBed.configureTestingModule({ imports: [TilesLayerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TilesLayerComponent);
    fixture.componentRef.setInput('tiles', tiles);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders exactly 195 cells in fixed order', async () => {
    const element = await create(Array.from({ length: TILE_COUNT }, () => 0));
    expect(element.querySelectorAll('.cell')).toHaveLength(195);
  });

  it('maps every tile code to its class', async () => {
    const tiles = Array.from({ length: TILE_COUNT }, () => 0);
    tiles[0] = 1; // wall
    tiles[1] = 2; // block
    tiles[2] = 3; // bomb
    tiles[3] = 4; // flame
    tiles[4] = 5; // power-up bomb
    tiles[5] = 6; // power-up flame
    tiles[6] = 7; // power-up speed

    const element = await create(tiles);
    const cells = element.querySelectorAll('.cell');

    expect(cells[0].className).toBe('cell t1');
    expect(cells[1].className).toBe('cell t2');
    expect(cells[2].className).toBe('cell t3');
    expect(cells[3].className).toBe('cell t4');
    expect(cells[4].className).toBe('cell t5');
    expect(cells[5].className).toBe('cell t6');
    expect(cells[6].className).toBe('cell t7');
  });

  it('falls back to floor for an unknown code or a short array', async () => {
    const tiles = [9, -1];
    const element = await create(tiles);
    const cells = element.querySelectorAll('.cell');

    expect(cells[0].className).toBe('cell t0');
    expect(cells[1].className).toBe('cell t0');
    expect(cells[194].className).toBe('cell t0');
  });
});
