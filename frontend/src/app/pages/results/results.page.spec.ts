import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { ResultsPage } from './results.page';
import { HistoryService } from '../../core/history.service';
import { GameViewService } from '../../core/game-view.service';
import { RoomStore } from '../../core/room-store';
import { SessionService } from '../../core/session.service';
import type { MatchDetails } from '../../core/models/match.models';

const DETAILS: MatchDetails = {
  matchId: 'm1',
  startedAt: '2026-11-09T10:00:00Z',
  endedAt: '2026-11-09T10:02:03Z',
  durationSeconds: 123,
  outcome: 'WIN',
  winner: { playerId: 'p0', nickname: 'Ada' },
  participants: [
    {
      playerId: 'p0',
      nickname: 'Ada',
      slot: 0,
      corner: 'TOP_LEFT',
      remainingLives: 2,
      result: 'WINNER',
    },
    {
      playerId: 'p1',
      nickname: 'Bob',
      slot: 1,
      corner: 'BOTTOM_RIGHT',
      remainingLives: 0,
      result: 'ELIMINATED',
    },
  ],
};

describe('ResultsPage', () => {
  function configure(get: () => ReturnType<HistoryService['get']>): void {
    TestBed.configureTestingModule({
      imports: [ResultsPage],
      providers: [
        { provide: HistoryService, useValue: { get } as unknown as HistoryService },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'm1' } } } },
        { provide: RoomStore, useValue: { leave: vi.fn() } as unknown as RoomStore },
        { provide: SessionService, useValue: { clear: vi.fn() } as unknown as SessionService },
        { provide: GameViewService, useValue: { reset: vi.fn() } as unknown as GameViewService },
      ],
    });
  }

  it('renders the persisted winner, lives, corners and duration', async () => {
    configure(() => of(DETAILS));
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ResultsPage);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Ada wins');
    expect(text).toContain('2:03');
    expect(text).toContain('Top left');
    expect(text).toContain('Eliminated');
    expect(text).toContain('Play again');
  });

  it('shows the not-found state for an unknown match id', async () => {
    configure(() => throwError(() => new HttpErrorResponse({ status: 404 })));
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ResultsPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Match not found');
  });

  it('shows a retryable error for a server failure', async () => {
    configure(() =>
      throwError(
        () => new HttpErrorResponse({ status: 503, error: { message: 'database down' } }),
      ),
    );
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ResultsPage);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('database down');
    expect(text).toContain('Try again');
  });
});
