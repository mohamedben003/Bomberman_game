import { Injectable, inject, signal } from '@angular/core';

import {
  INTERPOLATION_DELAY_MS,
  SERVER_TICK_MS,
  SNAPSHOT_HISTORY_MS,
  SNAPSHOT_STALE_MS,
} from './models/game.constants';
import type { MatchStartPayload, Snapshot, SnapshotPlayer } from './models/match.models';
import type { Direction } from './models/room.models';
import type { ServerMessage } from './models/ws-messages';
import { GameSocketService } from './game-socket.service';

/** One player as drawn this frame (tile units, centre of the sprite). */
export interface RenderPlayer {
  playerId: string;
  slot: number;
  x: number;
  y: number;
  direction: Direction;
  alive: boolean;
  invulnerable: boolean;
}

export interface RenderFrame {
  players: readonly RenderPlayer[];
}

/** Values the HUD shows; they only change when the server sends a different value. */
export interface HudPlayer {
  playerId: string;
  slot: number;
  nickname: string;
  lives: number;
  alive: boolean;
  invulnerable: boolean;
  activeBombs: number;
  maxBombs: number;
  range: number;
  speedLevel: number;
}

interface BufferedSnapshot {
  tick: number;
  /** Simulation time in ms: `tick * serverTickMs` (ARCHITECTURE.md §7.4). */
  simMs: number;
  /** Local time on the same clock as `performance.now()`. */
  localMs: number;
  /** Local arrival time, used to detect a stalled stream. */
  at: number;
  players: readonly SnapshotPlayer[];
}

const EMPTY_FRAME: RenderFrame = { players: [] };

/** A jump larger than this is drawn as a snap, never as a slide across the map. */
const MAX_INTERPOLATED_TILES = 1.5;
/** Re-anchor the tick/local clock when it drifts further than this. */
const MAX_CLOCK_DRIFT_MS = 200;
/** Hard cap on buffered snapshots, on top of the 500 ms window. */
const MAX_BUFFER = 32;

/**
 * Owns everything that changes while a match runs.
 *
 * Snapshots carry a server `tick`; simulation time is `tick * serverTickMs`.
 * The service maps that clock onto `performance.now()` once, then keeps it
 * stable, so interpolation does not depend on network arrival jitter. It
 * renders `INTERPOLATION_DELAY_MS` in the past between the two surrounding
 * snapshots, keeps a bounded buffer, snaps on stale/gap/visibility and never
 * extrapolates.
 *
 * No game rule is computed here: lives, power-ups and deaths come straight
 * from the server (TASKS pitfalls).
 */
@Injectable({ providedIn: 'root' })
export class GameViewService {
  private readonly socket = inject(GameSocketService);

  readonly match = signal<MatchStartPayload | null>(null);
  readonly tiles = signal<readonly number[]>([]);
  readonly you = signal<{ playerId: string; slot: number } | null>(null);
  readonly stats = signal<readonly HudPlayer[]>([]);

  private buffer: BufferedSnapshot[] = [];
  private readonly nicknames = new Map<string, string>();
  private tickMs = SERVER_TICK_MS;
  private interpolationDelayMs = INTERPOLATION_DELAY_MS;
  /** `localMs = clockOrigin + simMs`. */
  private clockOrigin = 0;
  private clockReady = false;
  private forceSnap = false;
  private ended = false;

  constructor() {
    this.socket.messages$.subscribe((message) => this.onMessage(message));
  }

  /** Forgets the previous match; `MATCH_START` calls it so a second match resets cleanly. */
  reset(): void {
    this.buffer = [];
    this.nicknames.clear();
    this.tickMs = SERVER_TICK_MS;
    this.interpolationDelayMs = INTERPOLATION_DELAY_MS;
    this.clockOrigin = 0;
    this.clockReady = false;
    this.forceSnap = false;
    this.ended = false;
    this.match.set(null);
    this.tiles.set([]);
    this.you.set(null);
    this.stats.set([]);
  }

  /** True once `MATCH_END` arrived for the current match. */
  get isEnded(): boolean {
    return this.ended;
  }

  /** Number of buffered snapshots; used by tests and the debug overlay. */
  get bufferedSnapshots(): number {
    return this.buffer.length;
  }

  /** Drops older interpolation history on the next sample, e.g. after visibility returns. */
  snap(): void {
    this.forceSnap = true;
  }

  /**
   * Player positions to draw at `nowMs`.
   *
   * Renders `interpolationDelayMs` in the past, between the two snapshots that
   * bracket that instant. Snaps instead of sliding when the stream is stale,
   * when a player would jump more than 1.5 tiles, or when `snap()` was called.
   */
  sample(nowMs: number): RenderFrame {
    const buffer = this.buffer;
    if (buffer.length === 0) {
      return EMPTY_FRAME;
    }

    const newest = buffer[buffer.length - 1];

    // No fresh data for a while: show the newest confirmed state, do not slide.
    if (this.forceSnap || nowMs - newest.at > SNAPSHOT_STALE_MS) {
      this.forceSnap = false;
      this.buffer = [newest];
      return this.frameFrom(newest.players);
    }

    const renderAt = nowMs - this.interpolationDelayMs;

    if (renderAt >= newest.localMs) {
      return this.frameFrom(newest.players); // never extrapolate past the newest tick
    }

    const oldest = buffer[0];
    if (renderAt <= oldest.localMs) {
      return this.frameFrom(oldest.players);
    }

    let before = oldest;
    let after = newest;
    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i].localMs <= renderAt && renderAt <= buffer[i + 1].localMs) {
        before = buffer[i];
        after = buffer[i + 1];
        break;
      }
    }

    // A large position jump (gap in the stream, respawn) must snap, not slide.
    for (const player of after.players) {
      const previous = before.players.find((p) => p.playerId === player.playerId);
      if (previous && distance(previous, player) > MAX_INTERPOLATED_TILES) {
        this.buffer = [newest];
        return this.frameFrom(newest.players);
      }
    }

    const span = after.localMs - before.localMs;
    const t = span > 0 ? (renderAt - before.localMs) / span : 1;

    const players: RenderPlayer[] = after.players.map((player) => {
      const previous = before.players.find((p) => p.playerId === player.playerId);
      const canLerp = !!previous && previous.alive && player.alive && previous.slot === player.slot;

      return {
        playerId: player.playerId,
        slot: player.slot,
        x: canLerp && previous ? previous.x + (player.x - previous.x) * t : player.x,
        y: canLerp && previous ? previous.y + (player.y - previous.y) * t : player.y,
        direction: player.direction,
        alive: player.alive,
        invulnerable: player.invulnerable,
      };
    });

    return { players };
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'MATCH_START':
        this.startMatch(message.data);
        break;
      case 'TILES':
        this.tiles.set(message.data.tiles);
        break;
      case 'SNAPSHOT':
        this.push(message.data, performance.now());
        break;
      case 'MATCH_END':
        this.ended = true;
        break;
      default:
        break;
    }
  }

  private startMatch(data: MatchStartPayload): void {
    this.reset();
    this.match.set(data);
    this.you.set({ playerId: data.you.playerId, slot: data.you.slot });
    this.tiles.set(data.tiles);
    this.tickMs = data.config.serverTickMs > 0 ? data.config.serverTickMs : SERVER_TICK_MS;
    this.interpolationDelayMs =
      data.config.interpolationDelayMs >= 0
        ? data.config.interpolationDelayMs
        : INTERPOLATION_DELAY_MS;
    for (const player of data.players) {
      this.nicknames.set(player.playerId, player.nickname);
    }
  }

  private push(snapshot: Snapshot, at: number): void {
    const last = this.buffer[this.buffer.length - 1];

    if (last && snapshot.tick <= last.tick) {
      return; // duplicate or out-of-order frame: never rewind the clock
    }

    const simMs = snapshot.tick * this.tickMs;

    if (!this.clockReady) {
      this.clockOrigin = at - simMs;
      this.clockReady = true;
    } else {
      const expectedLocal = this.clockOrigin + simMs;
      const drift = at - expectedLocal;
      if (Math.abs(drift) > MAX_CLOCK_DRIFT_MS) {
        // The stream stalled or the clocks disagree too much: re-anchor and snap.
        this.clockOrigin = at - simMs;
        this.forceSnap = true;
        this.buffer = [];
      }
    }

    if (last && at - last.at > SNAPSHOT_STALE_MS) {
      this.forceSnap = true; // long gap: jump instead of sliding across the map
      this.buffer = [];
    }

    this.buffer.push({
      tick: snapshot.tick,
      simMs,
      localMs: this.clockOrigin + simMs,
      at,
      players: snapshot.players,
    });

    const cutoff = at - SNAPSHOT_HISTORY_MS;
    while (this.buffer.length > 2 && this.buffer[0].at < cutoff) {
      this.buffer.shift();
    }
    while (this.buffer.length > MAX_BUFFER) {
      this.buffer.shift();
    }

    this.publishStats(snapshot.players);
  }

  private frameFrom(players: readonly SnapshotPlayer[]): RenderFrame {
    return {
      players: players.map((player) => ({
        playerId: player.playerId,
        slot: player.slot,
        x: player.x,
        y: player.y,
        direction: player.direction,
        alive: player.alive,
        invulnerable: player.invulnerable,
      })),
    };
  }

  private publishStats(players: readonly SnapshotPlayer[]): void {
    const next = players.map<HudPlayer>((player) => ({
      playerId: player.playerId,
      slot: player.slot,
      nickname: this.nicknames.get(player.playerId) ?? 'Player',
      lives: player.lives,
      alive: player.alive,
      invulnerable: player.invulnerable,
      activeBombs: player.activeBombs,
      maxBombs: player.maxBombs,
      range: player.range,
      speedLevel: player.speedLevel,
    }));

    if (!sameStats(this.stats(), next)) {
      this.stats.set(next);
    }
  }
}

function distance(a: SnapshotPlayer, b: SnapshotPlayer): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Cheap value comparison so the HUD signal only changes on real changes. */
function sameStats(current: readonly HudPlayer[], next: readonly HudPlayer[]): boolean {
  if (current.length !== next.length) {
    return false;
  }
  for (let i = 0; i < current.length; i++) {
    const a = current[i];
    const b = next[i];
    if (
      a.playerId !== b.playerId ||
      a.slot !== b.slot ||
      a.nickname !== b.nickname ||
      a.lives !== b.lives ||
      a.alive !== b.alive ||
      a.invulnerable !== b.invulnerable ||
      a.activeBombs !== b.activeBombs ||
      a.maxBombs !== b.maxBombs ||
      a.range !== b.range ||
      a.speedLevel !== b.speedLevel
    ) {
      return false;
    }
  }
  return true;
}
