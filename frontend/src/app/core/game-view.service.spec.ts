import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';

import { GameSocketService, type SocketStatus } from './game-socket.service';
import { GameViewService } from './game-view.service';
import type { MatchStartPayload, Snapshot } from './models/match.models';
import type { ServerMessage } from './models/ws-messages';

class SocketStub {
  readonly messages$ = new Subject<ServerMessage>();
  readonly status = signal<SocketStatus>('open');
  readonly closeReason = signal<string | null>(null);
}

const PLAYERS: MatchStartPayload['players'] = [
  { playerId: 'p0', nickname: 'Ada', slot: 0, corner: 'TOP_LEFT' },
  { playerId: 'p1', nickname: 'Bob', slot: 1, corner: 'BOTTOM_RIGHT' },
];

function startMessage(matchId = 'match-1'): ServerMessage {
  return {
    type: 'MATCH_START',
    data: {
      matchId,
      you: { playerId: 'p0', slot: 0 },
      config: { cols: 15, rows: 13, serverTickMs: 33, interpolationDelayMs: 66 },
      players: PLAYERS,
      tiles: Array.from({ length: 195 }, () => 0),
      startedAt: '2026-11-09T10:00:00Z',
    },
  };
}

function snapshot(tick: number, x: number, y = 1.5, lives = 3): ServerMessage {
  return {
    type: 'SNAPSHOT',
    data: {
      tick,
      players: [
        {
          playerId: 'p0',
          slot: 0,
          x,
          y,
          direction: 'RIGHT',
          moving: true,
          alive: true,
          lives,
          invulnerable: false,
          activeBombs: 0,
          maxBombs: 1,
          range: 1,
          speedLevel: 0,
          speed: 3.5,
        },
      ],
    } satisfies Snapshot,
  };
}

describe('GameViewService', () => {
  let service: GameViewService;
  let socket: SocketStub;
  let now = 0;

  beforeEach(() => {
    now = 1000;
    socket = new SocketStub();
    TestBed.configureTestingModule({
      providers: [{ provide: GameSocketService, useValue: socket }],
    });
    service = TestBed.inject(GameViewService);
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function emit(message: ServerMessage, at: number): void {
    now = at;
    socket.messages$.next(message);
  }

  it('maps server ticks onto the local clock and interpolates 66 ms behind', () => {
    emit(startMessage(), 1000);
    emit(snapshot(0, 1.5), 1000);
    emit(snapshot(1, 2.0), 1033);

    const frame = service.sample(1083); // renderAt = 1017, between tick 0 and 1
    expect(frame.players[0].x).toBeCloseTo(1.5 + (0.5 * 17) / 33, 3);
  });

  it('renders the newest tick once the render clock reaches it, never extrapolating', () => {
    emit(startMessage(), 1000);
    emit(snapshot(0, 1.5), 1000);
    emit(snapshot(1, 2.0), 1033);

    expect(service.sample(1099).players[0].x).toBe(2);
    expect(service.sample(9000).players[0].x).toBe(2); // stale: no unbounded slide
  });

  it('snaps on a stale stream instead of sliding across the map', () => {
    emit(startMessage(), 1000);
    emit(snapshot(0, 1.5), 1000);
    emit(snapshot(1, 8.0), 1033);

    const frame = service.sample(1033 + 300); // last arrival 300 ms ago
    expect(frame.players[0].x).toBe(8);
  });

  it('snaps when a player would jump more than 1.5 tiles between snapshots', () => {
    emit(startMessage(), 1000);
    emit(snapshot(0, 1.5), 1000);
    emit(snapshot(1, 4.5), 1033);

    const frame = service.sample(1080); // renderAt 1014, inside the gap
    expect(frame.players[0].x).toBe(4.5);
  });

  it('honours an explicit visibility snap', () => {
    emit(startMessage(), 1000);
    emit(snapshot(0, 1.5), 1000);
    emit(snapshot(1, 2.0), 1033);

    service.snap();
    expect(service.sample(1083).players[0].x).toBe(2);
    expect(service.sample(1090).players[0].x).toBe(2); // never rewind into old history
  });

  it('recovers from a snap using only new snapshots', () => {
    emit(startMessage(), 1000);
    emit(snapshot(0, 1.5), 1000);
    emit(snapshot(1, 2), 1033);
    service.snap();
    expect(service.sample(1083).players[0].x).toBe(2);
    emit(snapshot(2, 2.5), 1066);
    expect(service.sample(1100).players[0].x).toBeGreaterThanOrEqual(2);
  });

  it('does not rewind after a gap or clock reanchor', () => {
    emit(startMessage(), 1000);
    emit(snapshot(0, 1.5), 1000);
    emit(snapshot(1, 2), 1033);
    emit(snapshot(10, 4), 2000);
    expect(service.sample(2070).players[0].x).toBe(4);
    expect(service.sample(2080).players[0].x).toBe(4);
  });

  it('resets everything on a second MATCH_START', () => {
    emit(startMessage('match-1'), 1000);
    emit(snapshot(5, 3), 1000);
    expect(service.bufferedSnapshots).toBe(1);
    expect(service.stats()).toHaveLength(1);

    emit(startMessage('match-2'), 2000);

    expect(service.match()?.matchId).toBe('match-2');
    expect(service.bufferedSnapshots).toBe(0);
    expect(service.stats()).toHaveLength(0);
    expect(service.sample(2000).players).toHaveLength(0);
  });

  it('keeps the snapshot buffer bounded', () => {
    emit(startMessage(), 1000);
    for (let index = 0; index < 40; index++) {
      emit(snapshot(index, 1.5 + index * 0.01), 1000 + index * 20);
    }
    expect(service.bufferedSnapshots).toBeGreaterThan(0);
    expect(service.bufferedSnapshots).toBeLessThanOrEqual(32);
  });

  it('publishes HUD stats only when a displayed value changes', () => {
    emit(startMessage(), 1000);
    emit(snapshot(0, 1.5), 1000);
    const first = service.stats();

    emit(snapshot(1, 1.6), 1033); // same lives/bombs, new position only
    expect(service.stats()).toBe(first);

    emit(snapshot(2, 1.6, 1.5, 2), 1066); // lives changed
    expect(service.stats()).not.toBe(first);
    expect(service.stats()[0].lives).toBe(2);
  });

  it('ignores duplicate and out-of-order ticks', () => {
    emit(startMessage(), 1000);
    emit(snapshot(5, 3), 1000);
    emit(snapshot(4, 9), 1033);
    expect(service.bufferedSnapshots).toBe(1);
  });
});
