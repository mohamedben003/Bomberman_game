import { TestBed } from '@angular/core/testing';

import { PlayersLayerComponent } from './players-layer.component';
import type { RenderPlayer } from '../../core/game-view.service';

const PLAYER: RenderPlayer = {
  playerId: 'p0',
  slot: 0,
  x: 1.5,
  y: 1.5,
  direction: 'DOWN',
  alive: true,
  invulnerable: false,
};

describe('PlayersLayerComponent', () => {
  async function create(players: readonly RenderPlayer[], youId: string | null): Promise<HTMLElement> {
    await TestBed.configureTestingModule({ imports: [PlayersLayerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PlayersLayerComponent);
    fixture.componentRef.setInput('players', players);
    fixture.componentRef.setInput('youId', youId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('positions a sprite with a pure transform in tile units', async () => {
    const element = await create([PLAYER], null);
    const sprite = element.querySelector('.sprite') as HTMLElement;

    expect(sprite.style.transform).toBe('translate(100%, 100%)');
    expect(sprite.className).toContain('p0');
    expect(sprite.className).toContain('dir-down');
  });

  it('marks the local player and dead/invulnerable states', async () => {
    const element = await create(
      [{ ...PLAYER, alive: false, invulnerable: true }],
      'p0',
    );
    const sprite = element.querySelector('.sprite') as HTMLElement;

    expect(sprite.className).toContain('sprite--me');
    expect(sprite.className).toContain('sprite--dead');
    expect(sprite.className).toContain('sprite--invulnerable');
  });
});
