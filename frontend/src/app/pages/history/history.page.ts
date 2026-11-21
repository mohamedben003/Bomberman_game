import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { MatchTableComponent } from '../../components/match-table/match-table.component';
import { HistoryService } from '../../core/history.service';
import type { MatchSummary } from '../../core/models/match.models';

/** Latest 20 completed matches from PostgreSQL (PROTOCOL.md §2.2). */
@Component({
  selector: 'app-history-page',
  imports: [MatchTableComponent, RouterLink],
  templateUrl: './history.page.html',
  styleUrl: './history.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage implements OnInit {
  private readonly history = inject(HistoryService);
  private readonly router = inject(Router);

  protected readonly matches = signal<readonly MatchSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.history.list(20).subscribe({
      next: (matches) => {
        this.matches.set(matches);
        this.loading.set(false);
      },
      error: (failure: unknown) => {
        this.matches.set([]);
        this.loading.set(false);
        this.error.set(this.describe(failure));
      },
    });
  }

  protected open(match: MatchSummary): void {
    void this.router.navigate(['/history', match.matchId]);
  }

  private describe(failure: unknown): string {
    if (failure instanceof HttpErrorResponse) {
      if (failure.status === 0) {
        return 'Cannot reach the game server. Is the backend running?';
      }
      const body = failure.error as { message?: string } | null;
      return body?.message || 'The server could not load the history (HTTP ' + failure.status + ').';
    }
    return 'The server could not load the history.';
  }
}
