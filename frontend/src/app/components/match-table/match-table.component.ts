import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { MatchOutcome, MatchSummary } from '../../core/models/match.models';

/** Latest completed matches; one row per match, click or Enter opens the details. */
@Component({
  selector: 'app-match-table',
  template: `
    <table class="match-table">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Players</th>
          <th scope="col">Outcome</th>
          <th scope="col">Duration</th>
          <th scope="col"><span class="visually-hidden">Details</span></th>
        </tr>
      </thead>
      <tbody>
        @for (match of matches(); track match.matchId) {
          <tr
            tabindex="0"
            role="link"
            (click)="select.emit(match)"
            (keydown.enter)="select.emit(match)"
            (keydown.space)="onSpace($event, match)"
          >
            <td class="match-table__date">{{ date(match.startedAt) }}</td>
            <td class="match-table__players">{{ players(match) }}</td>
            <td>
              <span class="tag" [class.tag--draw]="match.outcome === 'DRAW'">
                {{ outcome(match.outcome, match.winnerNickname) }}
              </span>
            </td>
            <td class="match-table__duration">{{ duration(match.durationSeconds) }}</td>
            <td class="match-table__go" aria-hidden="true">Details</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchTableComponent {
  readonly matches = input.required<readonly MatchSummary[]>();
  readonly select = output<MatchSummary>();

  protected date(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  protected players(match: MatchSummary): string {
    return match.participants.map((player) => player.nickname).join(', ');
  }

  protected outcome(outcome: MatchOutcome, winner: string | null): string {
    if (outcome === 'DRAW') {
      return 'Draw';
    }
    return winner ? winner + ' won' : 'Win';
  }

  protected duration(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60);
    const rest = safe % 60;
    return minutes + ':' + String(rest).padStart(2, '0');
  }

  protected onSpace(event: Event, match: MatchSummary): void {
    event.preventDefault();
    this.select.emit(match);
  }
}
