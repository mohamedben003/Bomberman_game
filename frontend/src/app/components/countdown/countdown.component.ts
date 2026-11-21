import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { COUNTDOWN_MS, WAITING_MS } from '../../core/models/game.constants';
import type { RoomPhase, TimerKind } from '../../core/models/room.models';
import type { RoomTimer } from '../../core/models/room.models';

const MS_PER_SECOND = 1000;

/**
 * The two synchronized room timers.
 *
 * The numbers come straight from ROOM_STATE (`timer.secondsLeft`), which the
 * server broadcasts on every membership change and at least once per second.
 * Nothing here guesses the phase or runs a local countdown.
 */
@Component({
  selector: 'app-countdown',
  template: `
    @if (timer(); as current) {
      <section class="countdown panel" [class.countdown--urgent]="secondsLeft() <= 3">
        <p class="countdown__label">{{ label(current.kind) }}</p>
        <p class="countdown__value">{{ secondsLeft() }}<span class="countdown__unit">s</span></p>
        <div class="countdown__bar"><span [style.width.%]="progress()"></span></div>
        <p class="countdown__hint">{{ hint(current.kind) }}</p>
      </section>
    } @else {
      <section class="countdown panel">
        <p class="countdown__label">{{ phaseLabel() }}</p>
        <p class="countdown__hint">Waiting for the server.</p>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CountdownComponent {
  readonly timer = input<RoomTimer | null>(null);
  readonly phase = input<RoomPhase | null>(null);

  /** Server value; re-rendered with every ROOM_STATE. */
  protected readonly secondsLeft = computed(() => this.timer()?.secondsLeft ?? 0);

  protected readonly progress = computed(() => {
    const total = this.timer()?.kind === 'COUNTDOWN' ? COUNTDOWN_MS : WAITING_MS;
    const left = Math.max(0, Math.min(total, this.secondsLeft() * MS_PER_SECOND));
    return (left / total) * 100;
  });

  protected label(kind: TimerKind): string {
    return kind === 'COUNTDOWN' ? 'Match starts in' : 'Waiting room';
  }

  protected hint(kind: TimerKind): string {
    return kind === 'COUNTDOWN'
      ? '10 s countdown - the server decides when it ends.'
      : '20 s timer - the match starts early if the room fills.';
  }

  protected phaseLabel(): string {
    switch (this.phase()) {
      case 'PLAYING':
        return 'Match running';
      case 'FINISHED':
        return 'Match finished';
      case 'COUNTDOWN':
        return 'Starting';
      default:
        return 'Waiting';
    }
  }
}