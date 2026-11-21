import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { HudPlayer } from '../../core/game-view.service';

/** Lives, bombs, range and speed of every player; only changes when values do. */
@Component({
  selector: 'app-hud',
  template: `
    <section class="hud panel">
      <h2 class="hud__title">Players</h2>
      <ul class="hud__list">
        @for (player of stats(); track player.playerId) {
          <li class="hud__row" [class.hud__row--me]="player.playerId === youId()">
            <span [class]="'dot p' + player.slot"></span>
            <span class="hud__name">{{ player.nickname }}</span>
            <span class="hud__lives">{{ player.alive ? player.lives + ' lives' : 'out' }}</span>
          </li>
        }
      </ul>

      @if (me(); as player) {
        <h2 class="hud__title">Your stats</h2>
        <dl class="hud__stats">
          <div class="hud__stat">
            <dt>Lives</dt>
            <dd>{{ player.lives }}</dd>
          </div>
          <div class="hud__stat">
            <dt>Bombs</dt>
            <dd>{{ player.activeBombs }} / {{ player.maxBombs }}</dd>
          </div>
          <div class="hud__stat">
            <dt>Range</dt>
            <dd>{{ player.range }}</dd>
          </div>
          <div class="hud__stat">
            <dt>Speed</dt>
            <dd>{{ player.speedLevel }}</dd>
          </div>
        </dl>
        @if (!player.alive) {
          <p class="hud__spectating" role="status">You are out - spectating.</p>
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HudComponent {
  readonly stats = input.required<readonly HudPlayer[]>();
  readonly youId = input<string | null>(null);

  protected readonly me = computed(() => {
    const id = this.youId();
    return id ? (this.stats().find((player) => player.playerId === id) ?? null) : null;
  });
}