/**
 * Match, live snapshot and persisted history models
 * (PROTOCOL.md §2.2, §2.3, §5.3–§5.6).
 */

import type { Corner, Direction } from './room.models';

export type MatchOutcome = 'WIN' | 'DRAW';

export type ParticipantResult = 'WINNER' | 'ELIMINATED' | 'DISCONNECTED' | 'DRAW';

/** Tile codes from GAME_RULES.md §2.1. The client maps codes to CSS classes only. */
export enum TileCode {
  Floor = 0,
  Wall = 1,
  Block = 2,
  Bomb = 3,
  Flame = 4,
  PowerUpBomb = 5,
  PowerUpFlame = 6,
  PowerUpSpeed = 7,
}

export interface MatchConfig {
  cols: number;
  rows: number;
  serverTickMs: number;
  interpolationDelayMs: number;
}

export interface MatchPlayer {
  playerId: string;
  nickname: string;
  slot: number;
  corner: Corner;
}

/** `MATCH_START` payload. */
export interface MatchStartPayload {
  matchId: string;
  you: { playerId: string; slot: number };
  config: MatchConfig;
  players: MatchPlayer[];
  /** Exactly `cols * rows` tile codes. */
  tiles: number[];
  startedAt: string;
}

export interface SnapshotPlayer {
  playerId: string;
  slot: number;
  /** Centre in tile units; tile (1,1) centre is (1.5, 1.5). */
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
  alive: boolean;
  lives: number;
  invulnerable: boolean;
  activeBombs: number;
  maxBombs: number;
  range: number;
  speedLevel: number;
  /** Tiles per second, already including power-ups. */
  speed: number;
}

/** `SNAPSHOT` payload, sent ~30 Hz while playing. */
export interface Snapshot {
  tick: number;
  players: SnapshotPlayer[];
}

export interface MatchEndPlayer {
  playerId: string;
  nickname: string;
  slot: number;
  remainingLives: number;
  result: ParticipantResult;
}

/** `MATCH_END` payload — navigation only; the results page refetches REST data. */
export interface MatchEndPayload {
  matchId: string;
  outcome: MatchOutcome;
  winner: { playerId: string; nickname: string } | null;
  players: MatchEndPlayer[];
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export interface MatchSummaryParticipant {
  playerId: string;
  nickname: string;
  result: ParticipantResult;
}

/** `GET /api/matches?limit=20` row. */
export interface MatchSummary {
  matchId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  outcome: MatchOutcome;
  winnerNickname: string | null;
  playerCount: number;
  participants: MatchSummaryParticipant[];
}

export interface MatchParticipantDetail {
  playerId: string;
  nickname: string;
  slot: number;
  corner: Corner;
  remainingLives: number;
  result: ParticipantResult;
}

/** `GET /api/matches/{matchId}`. */
export interface MatchDetails {
  matchId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  outcome: MatchOutcome;
  winner: { playerId: string; nickname: string } | null;
  participants: MatchParticipantDetail[];
}
