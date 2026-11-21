/** Room, timer, membership and chat models (PROTOCOL.md §5.1, §5.2). */

export type RoomPhase = 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED';

export type TimerKind = 'WAITING' | 'COUNTDOWN';

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export type Corner = 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT';

export interface RoomTimer {
  kind: TimerKind;
  /** Server-computed `ceil(remainingMs / 1000)`. */
  secondsLeft: number;
  /** Epoch milliseconds, for a smooth local countdown that never changes the phase. */
  endsAtEpochMs: number;
}

export interface RoomPlayer {
  playerId: string;
  nickname: string;
  /** `null` until `MATCH_START`, then 0..n-1. */
  slot: number | null;
  connected: boolean;
}

export interface RoomYou {
  playerId: string;
  nickname: string;
  slot: number | null;
}

export interface RoomState {
  roomId: string;
  phase: RoomPhase;
  you: RoomYou;
  players: RoomPlayer[];
  /** Current player count, displayed as `count / maxPlayers`. */
  count: number;
  maxPlayers: number;
  /** `null` when no timer runs. */
  timer: RoomTimer | null;
}

export interface ChatAuthor {
  playerId: string;
  nickname: string;
}

export interface ChatMessage {
  messageId: string;
  /** `null` for system messages ("Bob joined", "Bob was eliminated"). */
  from: ChatAuthor | null;
  text: string;
  sentAt: string;
  system: boolean;
}
