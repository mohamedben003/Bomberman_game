import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

import { COLS, ROWS, TILE_COUNT } from './models/game.constants';
import type { MatchDetails, MatchStartPayload, SnapshotPlayer } from './models/match.models';
import { TileCode } from './models/match.models';
import type { Direction, RoomState } from './models/room.models';
import type { GuestSession } from './models/session.models';
import type { ClientMessage, ServerMessage } from './models/ws-messages';

const MODE_KEY = 'bomberman-offline-demo';
const REPLY = 'Sample reply: nice move!';

/** A small local preview that emits the same messages as a match, only when selected. */
@Injectable({ providedIn: 'root' })
export class DemoService {
  readonly enabled = signal(
    sessionStorage.getItem(MODE_KEY) === '1' || new URLSearchParams(location.search).has('demo'),
  );
  readonly messages$ = new Subject<ServerMessage>();

  private timers = new Set<ReturnType<typeof setTimeout>>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private results: MatchDetails[] = [];
  private nickname = 'Player 1';
  private match: MatchStartPayload | null = null;
  private startedAt = '';
  private tiles: number[] = [];
  private tick = 0;
  private x = 1.5;
  private y = 1.5;
  private direction: Direction | null = null;
  private run = 0;
  private chatId = 0;

  constructor() {
    if (this.enabled()) {
      this.seedHistory();
      sessionStorage.setItem(MODE_KEY, '1');
    }
  }

  enable(): void {
    this.enabled.set(true);
    sessionStorage.setItem(MODE_KEY, '1');
    this.seedHistory();
  }

  disable(): void {
    this.close();
    this.enabled.set(false);
    sessionStorage.removeItem(MODE_KEY);
    this.results = [];
  }

  createSession(nickname: string): GuestSession {
    this.nickname = nickname.trim();
    return {
      sessionId: 'demo-session-' + (++this.run), playerId: 'demo-you',
      nickname: this.nickname, createdAt: new Date().toISOString(),
    };
  }

  join(): void {
    this.close();
    this.emitRoom('WAITING', false);
    this.chat('Sample room: another player will join shortly.', true);
    this.later(() => {
      this.emitRoom('COUNTDOWN', true);
      this.chat('Sample player Alex joined. Starting a preview match.', true);
    }, 900);
    this.later(() => this.emitRoom('COUNTDOWN', true, 2), 1900);
    this.later(() => this.emitRoom('COUNTDOWN', true, 1), 2900);
    this.later(() => this.startMatch(), 3900);
  }

  receive(message: ClientMessage): void {
    if (!this.enabled()) {
      return;
    }
    switch (message.type) {
      case 'MOVE':
        if (this.match) this.direction = message.data.direction;
        break;
      case 'STOP':
        this.direction = null;
        break;
      case 'PLACE_BOMB':
        if (this.match) this.placeBomb();
        break;
      case 'CHAT':
        this.chat(message.data.text, false);
        this.later(() => this.chat(REPLY, false, true), 650);
        break;
      case 'JOIN':
        this.join();
        break;
    }
  }

  finish(): void {
    if (!this.match) {
      return;
    }
    const matchId = this.match.matchId;
    const endedAt = new Date().toISOString();
    const durationSeconds = Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(this.startedAt)) / 1000));
    const winner = { playerId: 'demo-you', nickname: this.nickname };
    const players: MatchDetails['participants'] = [
      { playerId: 'demo-you', nickname: this.nickname, slot: 0, corner: 'TOP_LEFT', remainingLives: 3, result: 'WINNER' },
      { playerId: 'demo-alex', nickname: 'Alex (sample)', slot: 1, corner: 'BOTTOM_RIGHT', remainingLives: 0, result: 'ELIMINATED' },
    ];
    this.results.unshift({
      matchId, outcome: 'WIN', winner, participants: players,
      startedAt: this.startedAt, endedAt, durationSeconds,
    });
    this.messages$.next({
      type: 'MATCH_END', data: {
        matchId, outcome: 'WIN', winner,
        players: players.map(({ playerId, nickname, slot, remainingLives, result }) =>
          ({ playerId, nickname, slot, remainingLives, result })),
        startedAt: this.startedAt, endedAt, durationSeconds,
      },
    });
    this.close();
  }

  list(limit = 20) {
    return this.results.slice(0, limit).map((match) => ({
      matchId: match.matchId, startedAt: match.startedAt, endedAt: match.endedAt,
      durationSeconds: match.durationSeconds, outcome: match.outcome,
      winnerNickname: match.winner?.nickname ?? null, playerCount: match.participants.length,
      participants: match.participants.map(({ playerId, nickname, result }) => ({ playerId, nickname, result })),
    }));
  }

  get(matchId: string): MatchDetails | undefined {
    return this.results.find((match) => match.matchId === matchId);
  }

  close(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
    this.match = null;
    this.direction = null;
  }

  private startMatch(): void {
    this.startedAt = new Date().toISOString();
    this.tick = 0;
    this.x = 1.5;
    this.y = 1.5;
    this.tiles = Array.from({ length: TILE_COUNT }, (_, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      return col === 0 || row === 0 || col === COLS - 1 || row === ROWS - 1
        ? TileCode.Wall : TileCode.Floor;
    });
    this.match = {
      matchId: 'demo-match-' + this.run,
      you: { playerId: 'demo-you', slot: 0 },
      config: { cols: COLS, rows: ROWS, serverTickMs: 33, interpolationDelayMs: 66 },
      players: [
        { playerId: 'demo-you', nickname: this.nickname, slot: 0, corner: 'TOP_LEFT' },
        { playerId: 'demo-alex', nickname: 'Alex (sample)', slot: 1, corner: 'BOTTOM_RIGHT' },
      ],
      tiles: [...this.tiles], startedAt: this.startedAt,
    };
    this.emitRoom('PLAYING', true);
    this.messages$.next({ type: 'MATCH_START', data: this.match });
    this.snapshot();
    this.ticker = setInterval(() => this.advance(), 33);
  }

  private advance(): void {
    const step = 0.09;
    if (this.direction === 'UP') this.y = Math.max(1.5, this.y - step);
    if (this.direction === 'DOWN') this.y = Math.min(ROWS - 1.5, this.y + step);
    if (this.direction === 'LEFT') this.x = Math.max(1.5, this.x - step);
    if (this.direction === 'RIGHT') this.x = Math.min(COLS - 1.5, this.x + step);
    this.tick++;
    this.snapshot();
  }

  private snapshot(): void {
    const players: SnapshotPlayer[] = [
      { playerId: 'demo-you', slot: 0, x: this.x, y: this.y, direction: this.direction ?? 'DOWN',
        moving: this.direction !== null, alive: true, lives: 3, invulnerable: false,
        activeBombs: 0, maxBombs: 1, range: 1, speedLevel: 0, speed: 2.7 },
      { playerId: 'demo-alex', slot: 1, x: 13.5, y: 11.5, direction: 'UP',
        moving: false, alive: true, lives: 1, invulnerable: false,
        activeBombs: 0, maxBombs: 1, range: 1, speedLevel: 0, speed: 2.7 },
    ];
    this.messages$.next({ type: 'SNAPSHOT', data: { tick: this.tick, players } });
  }

  private placeBomb(): void {
    const index = Math.floor(this.y) * COLS + Math.floor(this.x);
    this.tiles[index] = TileCode.Bomb;
    this.publishTiles();
    this.later(() => {
      this.tiles[index] = TileCode.Flame;
      this.publishTiles();
      this.later(() => {
        this.tiles[index] = TileCode.Floor;
        this.publishTiles();
      }, 450);
    }, 1800);
  }

  private publishTiles(): void {
    this.messages$.next({ type: 'TILES', data: { tiles: [...this.tiles] } });
  }

  private emitRoom(phase: RoomState['phase'], withAlex: boolean, secondsLeft = 3): void {
    const players: RoomState['players'] = [
      { playerId: 'demo-you', nickname: this.nickname, slot: phase === 'PLAYING' ? 0 : null, connected: true },
    ];
    if (withAlex) players.push({ playerId: 'demo-alex', nickname: 'Alex (sample)', slot: phase === 'PLAYING' ? 1 : null, connected: true });
    const timer = phase === 'COUNTDOWN'
      ? { kind: 'COUNTDOWN' as const, secondsLeft, endsAtEpochMs: Date.now() + secondsLeft * 1000 }
      : null;
    this.messages$.next({ type: 'ROOM_STATE', data: {
      roomId: 'DEMO-ROOM', phase,
      you: { playerId: 'demo-you', nickname: this.nickname, slot: phase === 'PLAYING' ? 0 : null },
      players, count: players.length, maxPlayers: 4, timer,
    } });
  }

  private chat(text: string, system: boolean, alex = false): void {
    this.messages$.next({ type: 'CHAT', data: {
      messageId: 'demo-chat-' + (++this.chatId),
      from: system ? null : alex
        ? { playerId: 'demo-alex', nickname: 'Alex (sample)' }
        : { playerId: 'demo-you', nickname: this.nickname },
      text, sentAt: new Date().toISOString(), system,
    } });
  }

  private later(action: () => void, delay: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      action();
    }, delay);
    this.timers.add(timer);
  }

  private seedHistory(): void {
    if (this.results.length) return;
    const endedAt = new Date(Date.now() - 86_400_000).toISOString();
    const startedAt = new Date(Date.parse(endedAt) - 75_000).toISOString();
    this.results = [{
      matchId: 'demo-sample-result', outcome: 'WIN',
      winner: { playerId: 'sample-mara', nickname: 'Mara (sample)' },
      startedAt, endedAt, durationSeconds: 75,
      participants: [
        { playerId: 'sample-mara', nickname: 'Mara (sample)', slot: 0, corner: 'TOP_LEFT', remainingLives: 1, result: 'WINNER' },
        { playerId: 'sample-theo', nickname: 'Theo (sample)', slot: 1, corner: 'BOTTOM_RIGHT', remainingLives: 0, result: 'ELIMINATED' },
      ],
    }];
  }
}
