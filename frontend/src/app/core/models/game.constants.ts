/**
 * Client-side mirror of GAME_RULES.md §1.
 * These values are for layout and validation only — the server owns every rule.
 */

export const COLS = 15;
export const ROWS = 13;
export const TILE_COUNT = COLS * ROWS;

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const LIVES = 3;

export const NICKNAME_MIN = 1;
export const NICKNAME_MAX = 20;
export const CHAT_MAX_LEN = 300;

export const SERVER_TICK_MS = 33;
export const INTERPOLATION_DELAY_MS = 66;
export const SNAPSHOT_HISTORY_MS = 500;
export const SNAPSHOT_STALE_MS = 250;

export const WAITING_MS = 20_000;
export const COUNTDOWN_MS = 10_000;

export const WAITING_ROOM_SIZE = MAX_PLAYERS;
