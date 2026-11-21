import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { HistoryPage } from './history.page';
import { HistoryService } from '../../core/history.service';
import type { MatchSummary } from '../../core/models/match.models';

const MATCH: MatchSummary = {
  matchId: 'm1',
  startedAt: '2026-11-09T10:00:00Z',
  endedAt: '2026-11-09T10:02:03Z',
  durationSeconds: 123,
  outcome: 'WIN',
  winnerNickname: 'Ada',
  playerCount: 2,
  participants: [
    { playerId: 'p0', nickname: 'Ada', result: 'WINNER' },
    { playerId: 'p1', nickname: 'Bob', result: 'ELIMINATED' },
  ],
};

describe('HistoryPage', () => {
  function configure(list: () => ReturnType<HistoryService['list']>): void {
    TestBed.configureTestingModule({
      imports: [HistoryPage],
      providers: [
        { provide: HistoryService, useValue: { list } as unknown as HistoryService },
        provideRouter([]),
      ],
    });
  }

  it('shows the persisted matches with outcome and duration', async () => {
    configure(() => of([MATCH]));
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(HistoryPage);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Ada, Bob');
    expect(text).toContain('Ada won');
    expect(text).toContain('2:03');
  });

  it('shows a clear empty state', async () => {
    configure(() => of([]));
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(HistoryPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No completed matches yet',
    );
  });

  it('shows an error state with a retry action', async () => {
    configure(() =>
      throwError(
        () => new HttpErrorResponse({ status: 500, error: { message: 'database down' } }),
      ),
    );
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(HistoryPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('database down');
    expect(element.textContent).toContain('Try again');
  });

  it('opens the detail route when a row is selected', async () => {
    configure(() => of([MATCH]));
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(HistoryPage);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    (fixture.nativeElement as HTMLElement).querySelector('tbody tr')?.dispatchEvent(
      new MouseEvent('click'),
    );

    expect(navigate).toHaveBeenCalledWith(['/history', 'm1']);
  });
});
