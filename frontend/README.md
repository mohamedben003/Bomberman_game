# Bomberman - Angular frontend

The Angular client for the Bomberman project. In normal mode it renders server-confirmed state only:
it never computes damage, lives, bomb legality, power-ups or results. The explicit offline demo uses
local sample events and never claims a real match.

## Requirements

- Node.js 20+ and npm 11+ (verified with Node 24.11.0 / npm 11.20.0)
- The Spring Boot backend of this repository running on port 8080
- A PostgreSQL database as described in `../docs/SETUP.md`

Angular CLI is local to the project; do not install it globally.

## Install

```bash
cd frontend
npm ci
```

## Run

```bash
npm start
```

Without the backend, open the nickname page and choose **Try offline demo**. The existing pages then
show simulated players, a short countdown, movement and bomb visuals, canned chat, and local sample
results/history. The persistent banner marks the preview and has **Exit demo** to return to the
normal server mode. A refresh during a match returns to nickname; sample results are session-only.
Demo mode does not call `/api` or open `/ws`.

This is `ng serve --proxy-config proxy.conf.json`. The dev server listens on
<http://localhost:4200> and proxies to the backend:

| Prefix | Target | Notes |
|---|---|---|
| `/api` | `http://localhost:8080` | REST session and match endpoints |
| `/ws` | `ws://localhost:8080` | `"ws": true` is required for the WebSocket handshake |

The browser therefore uses a single origin. Change the target in `proxy.conf.json` if the backend
runs elsewhere, then restart `npm start`.

## Build

```bash
npm run build
```

Output: `dist/frontend/browser`. Serve it with any static host that falls back to `index.html`, or
copy it into Spring Boot's static resources while keeping `/api` and `/ws` routed to their handlers.

## Tests

```bash
npm test -- --watch=false
```

The suite uses the Angular unit-test builder (Vitest + jsdom) and runs in watch mode by default
without the flag. Tests use fixtures for REST and WebSocket payloads; they do not need the backend.

## Routes

| Route | Guard | Purpose |
|---|---|---|
| `/nickname` | - | create a guest session (`POST /api/sessions`), validation and error/notice |
| `/waiting` | session | room id, player counter `count / 4`, server timers, chat, retry/leave |
| `/game` | session + room + match | board, HUD, chat, keyboard input; add `?debug` for the FPS overlay |
| `/results/:matchId` | - | persisted winner/draw, participants, lives, duration, play again |
| `/history` | - | latest 20 persisted matches, loading/error/empty states |
| `/history/:matchId` | - | persisted corners, lives and results for one match |

A refresh loses the in-memory guest session on purpose, so protected routes send the player back to
`/nickname` with the reason shown in the page. There is no reconnect nor rejoin into an active match.

## Controls

| Action | Keys |
|---|---|
| Move | Arrow keys or WASD (physical `event.code`; ZQSD works on AZERTY) |
| Place bomb | Space |
| Focus chat | Enter |
| Leave chat input | Escape |

The most recently pressed held key wins. Releasing all direction keys sends `STOP`; focusing chat,
window blur, tab hide, elimination and disconnect also release held input. Repeat events do not send
extra `PLACE_BOMB` messages, and typing in chat never moves the player.

## Rendering rules

- HTML and CSS only: no canvas, no WebGL, no game engine or other UI framework.
- In normal mode, exactly one WebSocket per tab (`GameSocketService`), opened on `/waiting`, reused by `/game`;
  callbacks from a closed connection cannot affect a newer one.
- Exactly one `requestAnimationFrame` loop, owned by `GamePage`.
- No auto-reconnect: a closed socket stops the loop, releases input, and the page says what happened.
- Per-frame snapshots stay in `GameViewService`; `RoomStore` only handles room, chat and errors.
- `GameViewService` maps server ticks to a local clock, interpolates 66 ms in the past, and snaps on
  stale data, a gap larger than 1.5 tiles, a hidden tab or `MATCH_START`. The buffer is capped at
  32 snapshots / 500 ms.
- The 195-cell grid is built once and only changes on `TILES`; players are a separate layer, so idle
  cells are not re-created per frame.
- Player and chat text use Angular interpolation/text bindings, never `innerHTML`.

## Design tokens

Colours, spacing, radius and the tile size live in `src/styles/tokens.css` and are consumed as CSS
custom properties (`--p0`..`--p3`, `--bg`, `--fg`, `--panel`, `--accent`, `--tile`). Do not hardcode
colours in components; add a token instead.

## Layout

```text
src/app/core/            models, SessionService, GameSocketService, RoomStore, GameViewService,
                         HistoryService, FpsMeterService, guards/
src/app/components/      board (+ tiles layer, players layer), hud, chat, countdown, player list,
                         connection banner, match table, perf overlay
src/app/pages/           nickname, waiting, game, results, history, match-details
src/styles/              tokens.css, base.css, board.css, chat.css, widgets.css
```

## Protocol

Message shapes come from `../docs/PROTOCOL.md`. Update `src/app/core/models/*` and this README in the
same pull request when the protocol changes. In normal mode, `ResultsPage` reloads persisted data
through `GET /api/matches/{matchId}`; it never trusts the live `MATCH_END` payload as the source of results.

## Known limitations

- No reconnect/rejoin into an active match; a refresh creates a new guest session.
- Live rooms, chat, bombs and countdowns come from the backend and are lost on backend restart.
- Rooms are one-shot; a rematch requires a new session (the nickname is pre-filled).
- Chat history is not available to late joiners.
- Results, history and match details show loading/error/empty/not-found states, but real persistence
  can only be checked with the backend and PostgreSQL running.
- Automated tests, the production build and source inspection pass locally; four-player
  performance, paint/layer traces and real WebSocket multiplayer remain pending because `backend/`
  is not present in this checkout.
