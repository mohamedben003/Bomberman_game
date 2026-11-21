/**
 * WebSocket envelope and typed messages (PROTOCOL.md §1.2, §4, §5).
 * One envelope: `{ "type": "...", "data": { ... } }`, text frames only.
 */

import type { MatchEndPayload, MatchStartPayload, Snapshot } from './match.models';
import type { ChatMessage, Direction, RoomState } from './room.models';

export type ClientMessageType = 'JOIN' | 'CHAT' | 'MOVE' | 'STOP' | 'PLACE_BOMB';

export type ServerMessageType =
  | 'ROOM_STATE'
  | 'CHAT'
  | 'MATCH_START'
  | 'TILES'
  | 'SNAPSHOT'
  | 'MATCH_END'
  | 'ERROR';

/** Empty `data` object for `STOP` and `PLACE_BOMB`. */
export type EmptyPayload = Record<string, never>;

export type ClientMessage =
  | { type: 'JOIN'; data: { sessionId: string } }
  | { type: 'CHAT'; data: { text: string } }
  | { type: 'MOVE'; data: { direction: Direction } }
  | { type: 'STOP'; data: EmptyPayload }
  | { type: 'PLACE_BOMB'; data: EmptyPayload };

export type WsErrorCode =
  | 'INVALID_SESSION'
  | 'ALREADY_IN_ROOM'
  | 'NICKNAME_TAKEN'
  | 'ROOM_FULL'
  | 'INVALID_MESSAGE'
  | 'UNKNOWN_TYPE'
  | 'RATE_LIMITED'
  | 'CHAT_INVALID'
  | 'NOT_PLAYING'
  | 'NOT_ALIVE'
  | 'MATCH_FINISHED'
  | 'SERVER_ERROR';

export interface WsError {
  code: WsErrorCode;
  message: string;
  /** `true` means the server closes the socket right after this message. */
  fatal: boolean;
}

export type ServerMessage =
  | { type: 'ROOM_STATE'; data: RoomState }
  | { type: 'CHAT'; data: ChatMessage }
  | { type: 'MATCH_START'; data: MatchStartPayload }
  | { type: 'TILES'; data: { tiles: number[] } }
  | { type: 'SNAPSHOT'; data: Snapshot }
  | { type: 'MATCH_END'; data: MatchEndPayload }
  | { type: 'ERROR'; data: WsError };

const SERVER_TYPES: readonly ServerMessageType[] = [
  'ROOM_STATE',
  'CHAT',
  'MATCH_START',
  'TILES',
  'SNAPSHOT',
  'MATCH_END',
  'ERROR',
];

/**
 * Narrow an untrusted frame to a `ServerMessage`.
 * Only the envelope shape and the type tag are checked; field validation stays the server's job.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const envelope = parsed as { type?: unknown; data?: unknown };
  if (typeof envelope.type !== 'string' || typeof envelope.data !== 'object') {
    return null;
  }
  if (!SERVER_TYPES.includes(envelope.type as ServerMessageType)) {
    return null;
  }
  return parsed as ServerMessage;
}
