import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HistoryService } from '../../core/history.service';
import { GameViewService } from '../../core/game-view.service';
import type { MatchDetails, ParticipantResult } from '../../core/models/match.models';
import type { Corner } from '../../core/models/room.models';
import { RoomStore } from '../../core/room-store';
import { SessionService } from '../../core/session.service';

/** Detail view of one persisted match (PROTOCOL.md §2.3). */
@Component({
  selector: 'app-match-details-page',
  imports: [RouterLink],
  templateUrl: './match-details.page.html',
  styleUrl: './match-details.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchDetailsPage implements OnInit {
  private readonly history = inject(HistoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly rooms = inject(RoomStore);
  private readonly sessions = inject(SessionService);
  private readonly view = inject(GameViewService);

  protected readonly matchId = signal('');
  protected readonly details = signal<MatchDetails | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notFound = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('matchId') ?? '';
    this.matchId.set(id);
    this.load(id);
  }

  protected load(matchId = this.matchId()): void {
    if (!matchId) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);
    this.details.set(null);

    this.history.get(matchId).subscribe({
      next: (details) => {
        this.details.set(details);
        this.loading.set(false);
      },
      error: (failure: unknown) => {
        this.loading.set(false);
        if (failure instanceof HttpErrorResponse && failure.status === 404) {
          this.notFound.set(true);
          return;
        }
        this.error.set(this.describe(failure));
      },
    });
  }

  protected playAgain(): void {
    this.rooms.leave();
    this.sessions.clear();
    this.view.reset();
    void this.router.navigate(['/nickname']);
  }

  protected duration(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    return Math.floor(safe / 60) + ':' + String(safe % 60).padStart(2, '0');
  }

  protected corner(corner: Corner): string {
    switch (corner) {
      case 'TOP_LEFT':
        return 'Top left';
      case 'TOP_RIGHT':
        return 'Top right';
      case 'BOTTOM_LEFT':
        return 'Bottom left';
      case 'BOTTOM_RIGHT':
        return 'Bottom right';
    }
  }

  protected resultLabel(result: ParticipantResult): string {
    switch (result) {
      case 'WINNER':
        return 'Winner';
      case 'ELIMINATED':
        return 'Eliminated';
      case 'DISCONNECTED':
        return 'Disconnected';
      case 'DRAW':
        return 'Draw';
    }
  }

  protected date(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  private describe(failure: unknown): string {
    if (failure instanceof HttpErrorResponse) {
      if (failure.status === 0) {
        return 'Cannot reach the game server. Is the backend running?';
      }
      const body = failure.error as { message?: string } | null;
      return body?.message || 'The server could not load this match (HTTP ' + failure.status + ').';
    }
    return 'The server could not load this match.';
  }
}
