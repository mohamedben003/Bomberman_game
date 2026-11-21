import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TILE_COUNT } from '../../core/models/game.constants';

/**
 * The 195 fixed cells of the board.
 *
 * `cells` is built once and never rebuilt; the component only re-renders when the
 * `tiles` input changes, which happens on a TILES message (never per frame).
 */
@Component({
  selector: 'app-tiles-layer',
  template: `
    @for (index of cells; track index) {
      <div [class]="cellClass(index)"></div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TilesLayerComponent {
  readonly tiles = input.required<readonly number[]>();

  /** Built once: 195 indices in fixed order. */
  protected readonly cells: readonly number[] = Array.from(
    { length: TILE_COUNT },
    (_, index) => index,
  );

  /** Tile code to CSS class. The client only maps codes; it never decides rules. */
  protected cellClass(index: number): string {
    const code = this.tiles()[index];
    const safe = typeof code === 'number' && code >= 0 && code <= 7 ? code : 0;
    return 'cell t' + safe;
  }
}