import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';

import { GameSocketService, type SocketStatus } from '../../core/game-socket.service';
import { GameViewService } from '../../core/game-view.service';
import { matchGuard } from '../../core/guards/match.guard';
import { roomGuard } from '../../core/guards/room.guard';
import { sessionGuard } from '../../core/guards/session.guard';
import type { RoomState } from '../../core/models/room.models';
import type { ServerMessage } from '../../core/models/ws-messages';
import { RoomStore } from '../../core/room-store';
import { SessionService } from '../../core/session.service';
import { WaitingPage } from './waiting.page';

class SocketStub {
  readonly messages$ = new Subject<ServerMessage>();
  readonly status = signal<SocketStatus>('open');
  readonly closeReason = signal<string | null>(null);
  readonly connect = vi.fn();
  readonly close = vi.fn(() => this.status.set('closed'));
  readonly join = vi.fn();
  readonly send = vi.fn();
}

const ROOM: RoomState = {
  roomId: 'room-1',
  phase: 'WAITING',
  you: { playerId: 'p0', nickname: 'Ada', slot: null },
  players: [
    { playerId: 'p0', nickname: 'Ada', slot: null, connected: true },
    { playerId: 'p1', nickname: 'Bob', slot: null, connected: true },
  ],
  count: 2,
  maxPlayers: 4,
  timer: { kind: 'WAITING', secondsLeft: 17, endsAtEpochMs: 123 },
};

describe('WaitingPage', () => {
  let socket: SocketStub;

  beforeEach(() => {
    socket = new SocketStub();
    TestBed.configureTestingModule({
      imports: [WaitingPage],
      providers: [
        { provide: GameSocketService, useValue: socket },
        {
          provide: SessionService,
          useValue: { sessionId: signal('session-1'), clear: vi.fn() },
        },
        provideRouter([]),
      ],
    });
  });

  it('replaces the room with a disconnected panel when the socket closes', async () => {
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(WaitingPage);
    fixture.detectChanges();

    socket.messages$.next({ type: 'ROOM_STATE', data: ROOM });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Players');
    expect(element.textContent).toContain('2 / 4');

    socket.status.set('closed');
    socket.closeReason.set('server went away');
    fixture.detectChanges();

    expect(element.textContent).toContain('Disconnected');
    expect(element.textContent).toContain('No reconnect is attempted');
    expect(element.textContent).toContain('Back to nickname');
    expect(element.querySelector('.waiting__players')).toBeNull();
    expect(element.querySelector('.waiting__chat')).toBeNull();
  });

});

@Component({ template: 'History page' })
class HistoryStub {}

@Component({ template: 'Game page' })
class GameStub {}

@Component({ template: 'Nickname page' })
class NicknameStub {}

describe('WaitingPage routing', () => {
  let socket: SocketStub;
  let sessionId: ReturnType<typeof signal<string | null>>;
  let clearSession: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    socket = new SocketStub();
    sessionId = signal<string | null>('session-1');
    clearSession = vi.fn(() => sessionId.set(null));
    TestBed.configureTestingModule({
      providers: [
        { provide: GameSocketService, useValue: socket },
        { provide: SessionService, useValue: {
          sessionId, active: () => sessionId() !== null, clear: clearSession,
        } },
        provideRouter([
          { path: 'waiting', component: WaitingPage },
          { path: 'history', component: HistoryStub },
          { path: 'game', component: GameStub, canActivate: [sessionGuard, roomGuard, matchGuard] },
          { path: 'nickname', component: NicknameStub },
        ]),
      ],
    });
  });

  it('respects navigation from waiting to history while clearing the old room', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/waiting', WaitingPage);
    socket.messages$.next({ type: 'ROOM_STATE', data: ROOM });
    harness.detectChanges();

    await harness.navigateByUrl('/history', HistoryStub);
    expect(TestBed.inject(Router).url).toBe('/history');
    expect(harness.routeNativeElement?.textContent).toContain('History page');
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(RoomStore).room()).toBeNull();
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it('preserves the socket and first snapshot for the automatic game transition', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/waiting', WaitingPage);
    socket.messages$.next({ type: 'ROOM_STATE', data: ROOM });
    socket.messages$.next({
      type: 'MATCH_START',
      data: {
        matchId: 'match-1', you: { playerId: 'p0', slot: 0 },
        config: { cols: 15, rows: 13, serverTickMs: 33, interpolationDelayMs: 66 },
        players: [{ playerId: 'p0', nickname: 'Ada', slot: 0, corner: 'TOP_LEFT' }],
        tiles: Array(195).fill(0), startedAt: '2026-11-09T10:00:00Z',
      },
    });
    socket.messages$.next({
      type: 'SNAPSHOT',
      data: { tick: 1, players: [{
        playerId: 'p0', slot: 0, x: 2.5, y: 1.5, direction: 'RIGHT', moving: true,
        alive: true, lives: 3, invulnerable: false, activeBombs: 0,
        maxBombs: 1, range: 1, speedLevel: 0, speed: 3.5,
      }] },
    });
    harness.detectChanges();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/game');
    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.status()).toBe('open');
    expect(TestBed.inject(RoomStore).room()?.roomId).toBe('room-1');
    const view = TestBed.inject(GameViewService);
    expect(view.match()?.matchId).toBe('match-1');
    expect(view.bufferedSnapshots).toBe(1);
    expect(view.sample(performance.now()).players[0].x).toBe(2.5);
  });
});
