# PROTOCOL — REST and WebSocket contract (v1.0 draft)

Owner: **mbenboua**. Reviewer: **Es-sadkia**. Freeze after M1 (two real browsers in one room exchanging
chat). Any change updates this file, the Java DTOs, the Angular models and the tests in the same pull
request.

Constants quoted here are defined in [`GAME_RULES.md`](GAME_RULES.md). The protocol is intentionally
small: JSON over native WebSockets, one envelope, explicit room scoping.

## 1. Transport

### 1.1 REST

- Base path `/api`.
- JSON requests and responses, `Content-Type: application/json`.
- Timestamps are ISO-8601 UTC strings (`2026-11-09T10:15:30Z`).
- Identifiers and tile arrays are abbreviated in examples; real UUIDs are 36 characters and a real
  map has exactly 195 integers.
- Errors use the shape below; HTTP status is meaningful.

```json
{
  "code": "INVALID_NICKNAME",
  "message": "Nickname must be 1 to 20 characters.",
  "timestamp": "2026-11-09T10:15:30Z",
  "path": "/api/sessions"
}
```

### 1.2 WebSocket

- One native WebSocket per browser tab at `/ws` (`ws://host/ws`, `wss://host/ws` when HTTPS).
- Text frames only, UTF-8, JSON envelope:

```json
{ "type": "SNAPSHOT", "data": { "tick": 42, "players": [] } }
```

- Maximum text frame: `MAX_WS_MESSAGE_BYTES` (4096 bytes). Binary frames are rejected with close code
  `1003`; oversized frames with `1009`.
- The first client message must be `JOIN` within 5 seconds. Before `JOIN`, only `JOIN` is accepted.
- After `JOIN`, the socket is bound to one guest session and one room for its lifetime. Actions never
  carry a player id or room id.
- TCP keeps frames in order. The server sends `TILES` before the `SNAPSHOT` of the same tick, and
  `MATCH_START` before the first snapshot.
- The server sends a WebSocket ping every 30 seconds; browsers answer pong automatically. A socket that
  misses a ping cycle is closed and handled like a normal disconnect.

### 1.3 Development proxy

The Angular dev server proxies `/api` and `/ws` to Spring Boot so the browser uses one origin. See
[`SETUP.md`](SETUP.md). CORS is still configurable for direct calls.

## 2. REST API

### 2.1 Create a guest session

`POST /api/sessions`

Request:

```json
{ "nickname": "Ada" }
```

Success `201 Created`:

```json
{
  "sessionId": "4f0e7f0e-4d8f-4f5d-9c6e-6f3a9d2b7c11",
  "playerId": "c2a9a6f1-1e6b-4d63-8b0a-4a7f0d9e2f34",
  "nickname": "Ada",
  "createdAt": "2026-11-09T10:15:30Z"
}
```

Rules:

- Trim the nickname; require 1–20 characters after trimming; reject control characters and
  whitespace-only values.
- The backend creates a `players` row and an in-memory guest session. The response's `sessionId` is an
  opaque bearer value used only by `JOIN`.
- Duplicate nicknames are **not** checked here because there is no room yet. They are checked on
  `JOIN` against the target room, case-insensitively after trimming (`Ada` and `ada` collide).
- A session is lost when its WebSocket disconnects or after the server's session TTL. Refreshing the
  browser requires a new session; this is intentional.

Errors:

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_NICKNAME` | blank, > 20 characters, control characters |
| 500 | `SERVER_ERROR` | unexpected failure |

### 2.2 List completed matches

`GET /api/matches?limit=20`

- Returns completed matches only, newest `endedAt` first.
- `limit` defaults to 20 and is capped at 20. The subject asks for the latest 20; pagination is not
  required.
- Duration is derived from timestamps.

Success `200 OK`:

```json
[
  {
    "matchId": "8b0d1f8e-3b1c-4a0e-9a6f-1f2d3c4b5a60",
    "startedAt": "2026-11-09T10:00:00Z",
    "endedAt": "2026-11-09T10:02:03Z",
    "durationSeconds": 123,
    "outcome": "WIN",
    "winnerNickname": "Ada",
    "playerCount": 3,
    "participants": [
      { "playerId": "c2a9…", "nickname": "Ada", "result": "WINNER" },
      { "playerId": "1b2c…", "nickname": "Bob", "result": "ELIMINATED" },
      { "playerId": "9d8e…", "nickname": "Cy", "result": "ELIMINATED" }
    ]
  }
]
```

`outcome` is `WIN` or `DRAW`; `winnerNickname` is `null` for a draw. The summary includes participant
names/results so the history list satisfies "with participants, outcome, and duration"; the details
endpoint adds corner and remaining lives.

### 2.3 Match details

`GET /api/matches/{matchId}`

Success `200 OK`:

```json
{
  "matchId": "8b0d1f8e-3b1c-4a0e-9a6f-1f2d3c4b5a60",
  "startedAt": "2026-11-09T10:00:00Z",
  "endedAt": "2026-11-09T10:02:03Z",
  "durationSeconds": 123,
  "outcome": "WIN",
  "winner": { "playerId": "c2a9a6f1-1e6b-4d63-8b0a-4a7f0d9e2f34", "nickname": "Ada" },
  "participants": [
    {
      "playerId": "c2a9a6f1-1e6b-4d63-8b0a-4a7f0d9e2f34",
      "nickname": "Ada",
      "slot": 0,
      "corner": "TOP_LEFT",
      "remainingLives": 2,
      "result": "WINNER"
    },
    {
      "playerId": "1b2c3d4e-5f60-4718-9a0b-1c2d3e4f5a6b",
      "nickname": "Bob",
      "slot": 1,
      "corner": "BOTTOM_RIGHT",
      "remainingLives": 0,
      "result": "ELIMINATED"
    }
  ]
}
```

- `result`: `WINNER`, `ELIMINATED`, `DISCONNECTED` or `DRAW`.
- `remainingLives`: 0–3; a disconnected player forfeits their lives, so it is 0.
- `winner` is `null` for a draw.
- `404 MATCH_NOT_FOUND` if the id is unknown.

### 2.4 Error codes

| Code | Status | Meaning |
|---|---|---|
| `INVALID_NICKNAME` | 400 | nickname failed validation |
| `INVALID_REQUEST` | 400 | malformed body/parameter |
| `MATCH_NOT_FOUND` | 404 | unknown match id |
| `SERVER_ERROR` | 500 | unexpected server failure |

## 3. WebSocket lifecycle

```text
Angular                                   Spring Boot
   │ POST /api/sessions ─────────────────────▶ create player + session
   │ ◀──────────────────── 201 sessionId
   │
   │ open ws://…/ws
   │ ── JOIN {sessionId} ─────────────────────▶ authenticate, matchmake, add to room
   │ ◀──────────────────── ROOM_STATE ───────── initial room snapshot
   │ ◀──────────────────── CHAT (system) ───── "Ada joined"
   │
   │ ── CHAT {text} ──────────────────────────▶ validate + broadcast
   │ ◀──────────────────── CHAT ────────────── room-scoped
   │
   │ ◀──────────────────── ROOM_STATE ───────── membership/timer changes, 1 Hz while timer runs
   │ ◀──────────────────── MATCH_START ──────── map + players + config
   │ ◀──────────────────── SNAPSHOT(tick 0)
   │ ── MOVE / STOP / PLACE_BOMB ─────────────▶ engine under room lock
   │ ◀──────────────────── TILES (when changed)
   │ ◀──────────────────── SNAPSHOT (30 Hz)
   │ ◀──────────────────── MATCH_END ────────── persisted result
   │
   │ GET /api/matches/{matchId}
   │ close socket
```

## 4. Client → server messages

All messages use `{ "type": "...", "data": { ... } }`.

### 4.1 `JOIN` (once, before anything else)

```json
{ "type": "JOIN", "data": { "sessionId": "4f0e7f0e-4d8f-4f5d-9c6e-6f3a9d2b7c11" } }
```

- Valid only as the first message and only once.
- The server resolves the session, checks membership/nickname, matchmakes if needed, and sends
  `ROOM_STATE`.
- Errors: `INVALID_SESSION` (fatal), `ALREADY_IN_ROOM` (non-fatal if repeated), `NICKNAME_TAKEN`
  (fatal; user must choose another nickname), `ROOM_FULL` (non-fatal; the server may retry once and
  then ask the client to retry).

### 4.2 `CHAT`

```json
{ "type": "CHAT", "data": { "text": "hello" } }
```

- Allowed after `JOIN`, in every room phase, including after elimination.
- Trim first; reject empty and > 300 characters (`CHAT_INVALID`, not broadcast).
- Rate limit 5 per 5 seconds per player (`RATE_LIMITED`).
- Control characters are stripped; if the sanitized result is empty, reject it too. Otherwise broadcast
  the result as text.

### 4.3 `MOVE`

```json
{ "type": "MOVE", "data": { "direction": "LEFT" } }
```

- Allowed only in `PLAYING` and only while alive.
- `direction`: `UP`, `DOWN`, `LEFT`, `RIGHT`.
- Sets the player's desired direction. The server moves the player; the client does not send
  positions.
- Sending the same direction again is harmless but unnecessary. The Angular client sends only on an
  effective direction change.

### 4.4 `STOP`

```json
{ "type": "STOP", "data": {} }
```

- Allowed only in `PLAYING` and while alive.
- Clears the desired direction. Sent on key release, window blur, tab hide and chat focus.

### 4.5 `PLACE_BOMB`

```json
{ "type": "PLACE_BOMB", "data": {} }
```

- Allowed only in `PLAYING` and while alive.
- One-shot request. The engine checks bomb limit, cell, phase and life state; an illegal request changes
  nothing.

## 5. Server → client messages

Tile arrays in the examples below are abbreviated; a real `tiles` array always contains exactly
`cols * rows` integer codes.

### 5.1 `ROOM_STATE`

Initial room snapshot after `JOIN`, then on every membership change and once per second while a timer
runs. It is **not** sent every game tick.

```json
{
  "type": "ROOM_STATE",
  "data": {
    "roomId": "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    "phase": "WAITING",
    "you": { "playerId": "c2a9…", "nickname": "Ada", "slot": null },
    "players": [
      { "playerId": "c2a9…", "nickname": "Ada", "slot": null, "connected": true }
    ],
    "count": 1,
    "maxPlayers": 4,
    "timer": {
      "kind": "WAITING",
      "secondsLeft": 17,
      "endsAtEpochMs": 1762683390000
    }
  }
}
```

- `phase`: `WAITING`, `COUNTDOWN`, `PLAYING`, `FINISHED`.
- `you.slot` and each `players[].slot` are `null` until `MATCH_START`; then they are `0..n-1`.
- `timer` is `null` when no timer runs. `kind`: `WAITING` (20 s) or `COUNTDOWN` (10 s).
  `secondsLeft = ceil(remainingMs / 1000)`; `endsAtEpochMs` lets clients render a smooth local
  countdown without deciding the phase change.
- `players` is ordered by join order; during `PLAYING` it is not re-sent per tick (snapshots carry
  lives/alive).

### 5.2 `CHAT`

```json
{
  "type": "CHAT",
  "data": {
    "messageId": "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f",
    "from": { "playerId": "c2a9…", "nickname": "Ada" },
    "text": "hello",
    "sentAt": "2026-11-09T10:15:31Z",
    "system": false
  }
}
```

- `from: null` and `system: true` identify server messages such as `"Bob joined"`,
  `"Bob left"` or `"Bob was eliminated"`.
- Room-scoped. There is no history for late joiners.
- Render message text as text, never HTML.

### 5.3 `MATCH_START`

Sent once to every player in the room when the countdown ends, before the first snapshot.

```json
{
  "type": "MATCH_START",
  "data": {
    "matchId": "8b0d1f8e-3b1c-4a0e-9a6f-1f2d3c4b5a60",
    "you": { "playerId": "c2a9…", "slot": 0 },
    "config": { "cols": 15, "rows": 13, "serverTickMs": 33, "interpolationDelayMs": 66 },
    "players": [
      { "playerId": "c2a9…", "nickname": "Ada", "slot": 0, "corner": "TOP_LEFT" },
      { "playerId": "1b2c…", "nickname": "Bob", "slot": 1, "corner": "BOTTOM_RIGHT" }
    ],
    "tiles": [0, 1, 2, "… 195 integers …"],
    "startedAt": "2026-11-09T10:00:00Z"
  }
}
```

- `tiles` length is `cols * rows`; codes are in `GAME_RULES.md` §2.
- Slots are compacted in join order. Corners follow the slot mapping.
- The first `SNAPSHOT` (tick 0) follows immediately.

### 5.4 `TILES`

Full tile array, sent only when at least one tile changed (bomb placed, explosion, flame expiry, block
destroyed, power-up revealed/picked up). Never a diff: a client that applies it cannot drift.

```json
{ "type": "TILES", "data": { "tiles": [0, 1, 2, "… 195 integers …"] } }
```

`TILES` is always sent before the `SNAPSHOT` of the same tick.

### 5.5 `SNAPSHOT`

Sent every server tick (~30 Hz) while `PLAYING`.

```json
{
  "type": "SNAPSHOT",
  "data": {
    "tick": 42,
    "players": [
      {
        "playerId": "c2a9…",
        "slot": 0,
        "x": 1.5,
        "y": 1.5,
        "direction": "DOWN",
        "moving": false,
        "alive": true,
        "lives": 3,
        "invulnerable": false,
        "activeBombs": 0,
        "maxBombs": 1,
        "range": 1,
        "speedLevel": 0,
        "speed": 3.5
      }
    ]
  }
}
```

- `x`,`y`: centre in tile units, rounded to 3 decimals. Tile `(1,1)` centre is `(1.5,1.5)`.
- `tick` starts at 0 and increments once per fixed server step. Simulation time is
  `tick * serverTickMs`.
- `direction`: last facing direction (`UP`, `DOWN`, `LEFT`, `RIGHT`); `moving`: position changed this
  tick.
- Dead/eliminated players remain in the array with `alive: false`, `lives: 0`; they do not move.
- `invulnerable`: server-calculated; the client only renders the blink.
- `activeBombs`, `maxBombs`, `range`, `speedLevel`, `speed`: current stats for the HUD. Power-ups are
  already applied; the client never computes them.
- Snapshots are identical for every player in the room; the server serializes once.

### 5.6 `MATCH_END`

Sent once when the match ends.

```json
{
  "type": "MATCH_END",
  "data": {
    "matchId": "8b0d1f8e-3b1c-4a0e-9a6f-1f2d3c4b5a60",
    "outcome": "WIN",
    "winner": { "playerId": "c2a9…", "nickname": "Ada" },
    "players": [
      { "playerId": "c2a9…", "nickname": "Ada", "slot": 0, "remainingLives": 2, "result": "WINNER" },
      { "playerId": "1b2c…", "nickname": "Bob", "slot": 1, "remainingLives": 0, "result": "ELIMINATED" }
    ],
    "startedAt": "2026-11-09T10:00:00Z",
    "endedAt": "2026-11-09T10:02:03Z",
    "durationSeconds": 123
  }
}
```

- `outcome`: `WIN` or `DRAW`; `winner` is `null` for a draw.
- `players` includes every participant, including disconnected and eliminated players.
- The server sends `MATCH_END` only after the match and all participations are committed to PostgreSQL.
  The client navigates to `/results/{matchId}` and fetches `GET /api/matches/{matchId}` so the results
  page uses persisted data, not only the live message.
- After `MATCH_END`, the room is `FINISHED`. Gameplay actions are rejected. The client closes the
  socket; the server releases the room after the last client leaves or a short grace period.

### 5.7 `ERROR`

```json
{
  "type": "ERROR",
  "data": {
    "code": "NICKNAME_TAKEN",
    "message": "That nickname is already used in this room.",
    "fatal": true
  }
}
```

| Code | Fatal | When / client action |
|---|---|---|
| `INVALID_SESSION` | yes | unknown/expired session; close, return to nickname |
| `ALREADY_IN_ROOM` | no | duplicate `JOIN`; ignore |
| `NICKNAME_TAKEN` | yes | duplicate in target room; return to nickname with message |
| `ROOM_FULL` | no | race; retry `JOIN` or return to nickname |
| `INVALID_MESSAGE` | no | malformed/oversized field; ignore and count toward close |
| `UNKNOWN_TYPE` | no | unsupported type; ignore |
| `RATE_LIMITED` | no | too many messages; drop the message |
| `CHAT_INVALID` | no | empty/> 300 chars; show a local hint if it was a user action |
| `NOT_PLAYING` | no | action outside `PLAYING`; ignore |
| `NOT_ALIVE` | no | eliminated player tried to act; ignore |
| `MATCH_FINISHED` | no | action after `MATCH_END`; ignore |
| `SERVER_ERROR` | no* | logged; the connection may stay open |

`fatal: true` means the server closes the socket after sending the error (close code `1008` unless a
more specific code is documented). Ten bad messages (`INVALID_MESSAGE`/`UNKNOWN_TYPE`) from one socket
also close it with `1008`.

## 6. Matchmaking and timer rules

These are the rules the server implements and the UI displays.

| Situation | Result |
|---|---|
| First player joins a room | 20 s `WAITING` timer starts |
| 4th player joins before it expires | cancel waiting, start 10 s `COUNTDOWN` immediately |
| `WAITING` expires with 2 or 3 players | start 10 s `COUNTDOWN` |
| `WAITING` expires with 1 player | keep waiting; next join that makes 2 starts 10 s `COUNTDOWN` |
| Join during `WAITING` (count < 4) | allowed; does not reset the 20 s timer |
| Join during `COUNTDOWN`/`PLAYING` | admission closed; goes to another waiting room or a new room |
| Countdown drops below 2 players | cancel, reopen admission, return to `WAITING`; fresh 10 s when 2 again |
| Countdown drops from 4 to 3 | countdown continues |
| Waiting room becomes empty | close the room and cancel timers |
| Countdown ends | start the match with the players present (2–4) |
| Nickname already used in the target room | `NICKNAME_TAKEN` |

`secondsLeft = ceil(remainingMs / 1000)`. The server broadcasts `ROOM_STATE` on every membership change
and at least once per second while a timer runs, so all clients see the same countdown.

## 7. Disconnects

- **Waiting/countdown**: remove the player and broadcast `ROOM_STATE` plus a system `CHAT`. Apply the
  countdown cancellation rules above.
- **Playing**: forfeit remaining lives, mark the player eliminated, broadcast a system `CHAT`, run the
  winner check, and keep the match running for the others. Their bombs/flames remain active.
- The disconnected browser sees the socket close. The Angular client stops input and rendering of stale
  state, shows a visible error, and offers a return to the nickname page.
- No reconnect, rejoin or state restore is supported. Refreshing creates a new guest session.
- If a disconnect leaves zero alive players, the match is a draw. Disconnected participants keep
  `DISCONNECTED`.

## 8. Limits and abuse handling

- `MAX_WS_MESSAGE_BYTES` 4096; binary frames close `1003`; oversized text closes `1009`.
- `WS_RATE` 60 messages/second/socket; over the limit → `RATE_LIMITED`, message dropped.
- `CHAT_RATE` 5 messages/5 seconds/player; over the limit → `RATE_LIMITED`.
- 10 malformed/unknown messages from one socket → close `1008`.
- Every handler is wrapped so one bad session cannot crash the process or affect another room.
- The server never trusts positions, lives, power-ups, player ids, room ids or results supplied by a
  client.
- Room broadcasts go only to sessions in that room; a socket never receives another room's messages.

## 9. Constants referenced by the protocol

| Name | Value |
|---|---|
| `MAX_PLAYERS` | 4 |
| `MIN_PLAYERS` | 2 |
| `WAITING_MS` | 20 000 |
| `COUNTDOWN_MS` | 10 000 |
| `SERVER_TICK_MS` | 33 |
| `INTERPOLATION_DELAY_MS` | 66 |
| `COLS` × `ROWS` | 15 × 13 |
| `NICKNAME_MAX` | 20 |
| `CHAT_MAX_LEN` | 300 |
| `MAX_WS_MESSAGE_BYTES` | 4096 |
| `WS_RATE` | 60/s |
| `CHAT_RATE` | 5/5 s |
