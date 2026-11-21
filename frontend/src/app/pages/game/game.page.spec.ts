import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { GameSocketService, type SocketStatus } from '../../core/game-socket.service';
import type { ServerMessage } from '../../core/models/ws-messages';
import { SessionService } from '../../core/session.service';
import { GamePage } from './game.page';

class SocketStub {
  readonly messages$ = new Subject<ServerMessage>();
  readonly status = signal<SocketStatus>('open');
  readonly closeReason = signal<string | null>(null);
  readonly send = vi.fn();
  readonly close = vi.fn(() => this.status.set('closed'));
}

const room: Extract<ServerMessage, { type: 'ROOM_STATE' }> = {
  type: 'ROOM_STATE',
  data: {
    roomId: 'room-1', phase: 'COUNTDOWN',
    you: { playerId: 'p0', nickname: 'Ada', slot: null },
    players: [{ playerId: 'p0', nickname: 'Ada', slot: null, connected: true }],
    count: 1, maxPlayers: 4, timer: null,
  },
};

const start: Extract<ServerMessage, { type: 'MATCH_START' }> = {
  type: 'MATCH_START',
  data: {
    matchId: 'match-1', you: { playerId: 'p0', slot: 0 },
    config: { cols: 15, rows: 13, serverTickMs: 33, interpolationDelayMs: 66 },
    players: [{ playerId: 'p0', nickname: 'Ada', slot: 0, corner: 'TOP_LEFT' }],
    tiles: Array(195).fill(0), startedAt: '2026-11-09T10:00:00Z',
  },
};

function snapshot(alive = true, tick = 1): ServerMessage {
  return {
    type: 'SNAPSHOT',
    data: {
      tick,
      players: [{
        playerId: 'p0', slot: 0, x: 1.5, y: 1.5, direction: 'UP', moving: false,
        alive, lives: alive ? 3 : 0, invulnerable: false, activeBombs: 0,
        maxBombs: 1, range: 1, speedLevel: 0, speed: 3.5,
      }],
    },
  };
}

describe('GamePage', () => {
  let socket: SocketStub;
  let fixture: ComponentFixture<GamePage>;
  let router: Router;
  let hidden: boolean;
  let nextFrame: number;
  let frames: Map<number, FrameRequestCallback>;

  beforeEach(async () => {
    socket = new SocketStub();
    hidden = false;
    nextFrame = 1;
    frames = new Map();
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
    TestBed.configureTestingModule({
      imports: [GamePage],
      providers: [
        { provide: GameSocketService, useValue: socket },
        { provide: SessionService, useValue: { clear: vi.fn() } },
        provideRouter([]),
      ],
    });
    await TestBed.compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(GamePage);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function emit(message: ServerMessage): void {
    socket.messages$.next(message);
    fixture.detectChanges();
  }

  function ready(alive = true): void {
    emit(room);
    emit(start);
    emit(snapshot(alive));
  }

  function key(type: 'keydown' | 'keyup', code: string, repeat = false, target: EventTarget = window): void {
    const name = code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
    target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, code, key: name, repeat }));
  }

  function sentTypes(): string[] {
    return socket.send.mock.calls.map(([message]) => message.type);
  }

  it('accepts COUNTDOWN, MATCH_START, SNAPSHOT and preserves physical key order across repeats', () => {
    ready();
    expect(frames.size).toBe(1);
    key('keydown', 'KeyW');
    key('keydown', 'KeyD');
    key('keydown', 'KeyW', true);
    key('keydown', 'KeyW'); // duplicate non-repeat events are ignored too
    expect(socket.send.mock.calls.map(([message]) => message)).toEqual([
      { type: 'MOVE', data: { direction: 'UP' } },
      { type: 'MOVE', data: { direction: 'RIGHT' } },
    ]);
    key('keyup', 'KeyD');
    key('keyup', 'KeyW');
    expect(sentTypes()).toEqual(['MOVE', 'MOVE', 'MOVE', 'STOP']);
  });

  it('keeps a direction until both physical keys for it are released', () => {
    ready();
    key('keydown', 'KeyW');
    key('keydown', 'ArrowUp');
    key('keyup', 'KeyW');
    expect(sentTypes()).toEqual(['MOVE']);
    key('keyup', 'ArrowUp');
    expect(sentTypes()).toEqual(['MOVE', 'STOP']);
  });

  it('stops on chat focus, ignores editable input, and releases on blur', () => {
    ready();
    key('keydown', 'KeyW');
    const input = fixture.nativeElement.querySelector('input.chat__input') as HTMLInputElement;
    input.focus();
    fixture.detectChanges();
    key('keydown', 'KeyD', false, input);
    expect(sentTypes()).toEqual(['MOVE', 'STOP']);
    input.blur();
    key('keydown', 'KeyA');
    window.dispatchEvent(new Event('blur'));
    key('keyup', 'KeyA');
    expect(sentTypes()).toEqual(['MOVE', 'STOP', 'MOVE', 'STOP']);
  });

  it('places one bomb per press and blocks spectator movement while chat remains enabled', () => {
    ready();
    key('keydown', 'Space');
    key('keydown', 'Space', true);
    expect(sentTypes()).toEqual(['PLACE_BOMB']);
    key('keydown', 'KeyD');
    emit(snapshot(false, 2));
    key('keydown', 'KeyW');
    key('keydown', 'Space');
    expect(sentTypes()).toEqual(['PLACE_BOMB', 'MOVE', 'STOP']);
    expect((fixture.nativeElement.querySelector('input.chat__input') as HTMLInputElement).disabled).toBe(false);
    const input = fixture.nativeElement.querySelector('input.chat__input') as HTMLInputElement;
    input.value = 'hello';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form.chat__form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(sentTypes()).toEqual(['PLACE_BOMB', 'MOVE', 'STOP', 'CHAT']);
  });

  it('never resumes a frame after disconnect and cleans up listeners on navigation', () => {
    ready();
    const callback = [...frames.values()][0];
    key('keydown', 'KeyW');
    socket.status.set('closed');
    fixture.detectChanges();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    callback(1100); // an already queued callback must not schedule another frame
    expect(frames.size).toBe(0);
    fixture.destroy();
    key('keydown', 'KeyD');
    expect(sentTypes()).toEqual(['MOVE']);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('does not start a loop when the page mounts hidden', () => {
    fixture.destroy();
    socket.status.set('open');
    frames.clear();
    hidden = true;
    fixture = TestBed.createComponent(GamePage);
    fixture.detectChanges();
    ready();
    expect(frames.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(1);
  });

  it('sends STOP before closing on navigation away', () => {
    ready();
    key('keydown', 'KeyW');
    fixture.destroy();
    expect(sentTypes()).toEqual(['MOVE', 'STOP']);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('parks the socket and navigates to results on MATCH_END', () => {
    ready();
    key('keydown', 'KeyW');
    emit({
      type: 'MATCH_END', data: {
        matchId: 'match-1', outcome: 'DRAW', winner: null, players: [],
        startedAt: '2026-11-09T10:00:00Z', endedAt: '2026-11-09T10:01:00Z', durationSeconds: 60,
      },
    });
    expect(frames.size).toBe(0);
    expect(socket.close).toHaveBeenCalledWith('match finished');
    expect(router.navigate).toHaveBeenCalledWith(['/results', 'match-1']);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    fixture.destroy();
    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
