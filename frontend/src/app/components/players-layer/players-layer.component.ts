import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { RenderPlayer } from '../../core/game-view.service';

/**
 * The players layer: one absolutely positioned sprite per player slot.
 *
 * This is the only component that re-renders per frame. Position is a pure
 * `transform` translate in percent of one tile, so no layout is read and the
 * browser can composite the movement.
 */
@Component({
  selector: 'app-players-layer',
  template: `
    @for (player of players(); track player.slot) {
      <div
        [class]="classNames(player)"
        [style.transform]="transform(player)"
        [attr.data-slot]="player.slot"
        [attr.aria-label]="'player ' + player.slot"
      >
        <span class="sprite__shadow"></span>
        <span class="sprite__boots"></span>
        <span class="sprite__body"></span>
        <span class="sprite__face"></span>
        <span class="sprite__hat"></span>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayersLayerComponent {
  readonly players = input.required<readonly RenderPlayer[]>();
  readonly youId = input<string | null>(null);

  protected classNames(player: RenderPlayer): string {
    const classes = ['sprite', 'p' + player.slot, 'dir-' + player.direction.toLowerCase()];
    if (this.youId() === player.playerId) {
      classes.push('sprite--me');
    }
    if (!player.alive) {
      classes.push('sprite--dead');
    }
    if (player.invulnerable) {
      classes.push('sprite--invulnerable');
    }
    return classes.join(' ');
  }

  /** Sprite size is one tile, so 100% of its own width is exactly one tile. */
  protected transform(player: RenderPlayer): string {
    const x = (player.x - 0.5) * 100;
    const y = (player.y - 0.5) * 100;
    return 'translate(' + x + '%, ' + y + '%)';
  }
}
