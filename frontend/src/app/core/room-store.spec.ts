import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';

import { GameSocketService, type SocketStatus } from './game-socket.service';
import { CHAT_CAP, RoomStore } from './room-store';
import type { ChatMessage, RoomState } from './models/room.models';
import type { ServerMessage } from './models/ws-messages';

class SocketStub {
  readonly messages$ = new Subject<ServerMessage>();
  readonly status = signal<SocketStatus>('open');
  readonly closeReason = signal<string | null>(null);
  readonly sent: unknown[] = [];
  readonly connect = vi.fn();
  readonly close = vi.fn();
  readonly join = vi.fn();

  send(message: unknown): void {
    this.sent.push(message);
  }
}

function roomState(count = 2): ServerMessage {
  const state: RoomState = {
    roomId: 'room-1',
    phase: 'WAITING',
    you: { playerId: 'p0', nickname: 'Ada', slot: null },
    players: [
      { playerId: 'p0', nickname: 'Ada', slot: null, connected: true },
      { playerId: 'p1', nickname: 'Bob', slot: null, connected: true },
    ].slice(0, count),
    count,
    maxPlayers: 4,
    timer: { kind: 'WAITING', secondsLeft: 17, endsAtEpochMs: 123 },
  };
  return { type: 'ROOM_STATE', data: state };
}

function chat(index: number): ServerMessage {
  const message: ChatMessage = {
    messageId: 'm' + index,
    from: { playerId: 'p0', nickname: 'Ada' },
    text: 'hello ' + index,
    sentAt: '2026-11-09T10:15:31Z',
    system: false,
  };
  return { type: 'CHAT', data: message };
}

describe('RoomStore', () => {
  let store: RoomStore;
  let socket: SocketStub;

  beforeEach(() => {
    socket = new SocketStub();
    TestBed.configureTestingModule({
      providers: [{ provide: GameSocketService, useValue: socket }],
    });
    store = TestBed.inject(RoomStore);
  });

  it('exposes room state, count and the joined flag', () => {
    expect(store.joined()).toBe(false);
    socket.messages$.next(roomState());

    expect(store.room()?.roomId).toBe('room-1');
    expect(store.count()).toBe(2);
    expect(store.players()).toHaveLength(2);
    expect(store.phase()).toBe('WAITING');
    expect(store.meId()).toBe('p0');
    expect(store.joined()).toBe(true);
  });

  it('caps the chat list', () => {
    for (let index = 0; index < CHAT_CAP + 50; index++) {
      socket.messages$.next(chat(index));
    }
    expect(store.chat()).toHaveLength(CHAT_CAP);
    expect(store.chat()[CHAT_CAP - 1].messageId).toBe('m' + (CHAT_CAP + 49));
  });

  it('trims chat and never sends an empty line', () => {
    store.sendChat('   ');
    expect(socket.sent).toHaveLength(0);

    store.sendChat('  hello  ');
    expect(socket.sent).toEqual([{ type: 'CHAT', data: { text: 'hello' } }]);
  });

  it('caps a chat line at the protocol maximum', () => {
    store.sendChat('x'.repeat(400));
    const sent = socket.sent[0] as { data: { text: string } };
    expect(sent.data.text).toHaveLength(300);
  });

  it('sends movement intent, stop and bomb as typed frames', () => {
    store.sendMove('LEFT');
    store.sendStop();
    store.placeBomb();

    expect(socket.sent).toEqual([
      { type: 'MOVE', data: { direction: 'LEFT' } },
      { type: 'STOP', data: {} },
      { type: 'PLACE_BOMB', data: {} },
    ]);
  });

  it('records ERROR and MATCH_END payloads', () => {
    socket.messages$.next({
      type: 'ERROR',
      data: { code: 'ROOM_FULL', message: 'full', fatal: false },
    });
    expect(store.lastError()?.code).toBe('ROOM_FULL');

    socket.messages$.next({
      type: 'MATCH_END',
      data: {
        matchId: 'match-1',
        outcome: 'DRAW',
        winner: null,
        players: [],
        startedAt: '2026-11-09T10:00:00Z',
        endedAt: '2026-11-09T10:02:03Z',
        durationSeconds: 123,
      },
    });
    expect(store.matchEnd()?.matchId).toBe('match-1');
  });

  it('closes the socket and clears state on leave', () => {
    socket.messages$.next(roomState());
    store.leave();

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(store.joined()).toBe(false);
    expect(store.chat()).toHaveLength(0);
    expect(store.matchEnd()).toBeNull();
  });

  it('retries JOIN on the open socket after a non-fatal error', () => {
    store.retryJoin('session-1');
    expect(socket.join).toHaveBeenCalledWith('session-1');
    expect(socket.connect).not.toHaveBeenCalled();
  });
});
