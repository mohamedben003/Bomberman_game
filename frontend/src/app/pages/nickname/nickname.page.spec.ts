import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { NicknamePage } from './nickname.page';
import { GameViewService } from '../../core/game-view.service';
import { RoomStore } from '../../core/room-store';
import { SessionService } from '../../core/session.service';
import type { GuestSession } from '../../core/models/session.models';

const SESSION: GuestSession = {
  sessionId: 's1',
  playerId: 'p1',
  nickname: 'Ada',
  createdAt: '2026-11-09T10:15:30Z',
};

describe('NicknamePage', () => {
  const create = vi.fn(() => of(SESSION));
  const navigate = vi.fn(() => Promise.resolve(true));
  const leave = vi.fn();
  const reset = vi.fn();

  function configure(reason: string | null = null): void {
    TestBed.configureTestingModule({
      imports: [NicknamePage],
      providers: [
        {
          provide: SessionService,
          useValue: { lastNickname: () => 'Ada', create } as unknown as SessionService,
        },
        { provide: RoomStore, useValue: { leave } as unknown as RoomStore },
        { provide: GameViewService, useValue: { reset } as unknown as GameViewService },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => reason } } },
        },
      ],
    });
  }

  beforeEach(() => {
    create.mockClear();
    navigate.mockClear();
    leave.mockClear();
    reset.mockClear();
  });

  it('pre-fills the last nickname so play again is one click', async () => {
    configure();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(NicknamePage);
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls.nickname.value).toBe('Ada');
  });

  it('shows the reason a guard or a fatal JOIN error sent the player back', async () => {
    configure('That nickname is already used in this room.');
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(NicknamePage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'That nickname is already used in this room.',
    );
  });

  it('rejects blank and over-long nicknames without calling the API', async () => {
    configure();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(NicknamePage);
    const page = fixture.componentInstance;

    page.form.controls.nickname.setValue('   ');
    page.submit();
    expect(create).not.toHaveBeenCalled();

    page.form.controls.nickname.setValue('x'.repeat(21));
    page.submit();
    expect(create).not.toHaveBeenCalled();
  });

  it('creates the session and navigates to the waiting room', async () => {
    configure();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(NicknamePage);
    const page = fixture.componentInstance;

    page.form.controls.nickname.setValue('  Bob  ');
    page.submit();

    expect(create).toHaveBeenCalledWith('  Bob  ');
    expect(leave).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/waiting']);
  });
});
