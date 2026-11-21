/** REST payload for `POST /api/sessions` (PROTOCOL.md §2.1). */

export interface GuestSession {
  /** Opaque bearer value used by `JOIN`; kept in memory only. */
  sessionId: string;
  playerId: string;
  nickname: string;
  createdAt: string;
}
