import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { RenderPlayer } from '../../core/game-view.service';
import { PlayersLayerComponent } from '../players-layer/players-layer.component';
import { TilesLayerComponent } from '../tiles-layer/tiles-layer.component';

/**
 * The board: a fixed CSS grid holding two independent layers.
 *
 * - `app-tiles-layer` changes only when a TILES message arrives;
 * - `app-players-layer` changes every frame.
 *
 * Keeping them apart means a frame update never re-evaluates the 195 cells.
 * No canvas, no WebGL, no layout reads (TASKS pitfalls).
 */
@Component({
  selector: 'app-board',
  imports: [TilesLayerComponent, PlayersLayerComponent],
  template: `
    <div class="board" role="img" aria-label="Bomberman board">
      <app-tiles-layer [tiles]="tiles()" />
      <app-players-layer [players]="players()" [youId]="youId()" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardComponent {
  readonly tiles = input.required<readonly number[]>();
  readonly players = input.required<readonly RenderPlayer[]>();
  readonly youId = input<string | null>(null);
}
