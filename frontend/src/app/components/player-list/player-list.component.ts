import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { RoomPlayer } from '../../core/models/room.models';

/** Names, colours and ready state of the players in the room. */
@Component({
  selector: 'app-player-list',
  template: `
    <ul class="player-list">
      @for (player of players(); track player.playerId) {
        <li
          class="player-list__row"
          [class.player-list__row--me]="player.playerId === meId()"
          [class.player-list__row--away]="!player.connected"
        >
          <span [class]="'dot p' + (player.slot ?? $index)"></span>
          <span class="player-list__name">{{ player.nickname }}</span>
          <span class="player-list__state">{{ player.connected ? 'ready' : 'left' }}</span>
        </li>
      }
      @if (players().length === 0) {
        <li class="player-list__empty">Nobody here yet.</li>
      }
    </ul>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerListComponent {
  readonly players = input.required<readonly RoomPlayer[]>();
  readonly meId = input<string | null>(null);
}