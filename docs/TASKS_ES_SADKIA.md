# TASKS — Es-sadkia: Angular application, board, real-time UX, history, performance

Read first: [`ARCHITECTURE.md`](ARCHITECTURE.md) §7 and §9, [`GAME_RULES.md`](GAME_RULES.md),
[`PROTOCOL.md`](PROTOCOL.md), [`SETUP.md`](SETUP.md), then
[`../bomberman-springboot-angular.md`](../bomberman-springboot-angular.md).

## Mission

Build the Angular application: routed pages, reusable components, typed HTTP/WebSocket services, the
shared room state, the HTML/CSS board, smooth 60 fps rendering, keyboard input, chat, results/history
pages, error/loading/disconnection UX, and the performance evidence. The frontend displays
server-confirmed state; it does not run game rules.

You own `frontend/`, root `README.md` and `docs/AUDIT_CHECKLIST.md`. You do **not** edit `backend/`.
Review the protocol before M1; while it is a draft, request changes from mbenboua and update the Angular
models/tests in the same PR.

## Boundaries

- Angular + TypeScript only. Standalone components, routing, reactive forms, services, signals/RxJS.
- HTML/CSS rendering only. **No canvas, WebGL, game engine or other UI framework.**
- One WebSocket per tab. No auto-reconnect, no duplicate connection on navigation.
- The game page owns one `requestAnimationFrame` loop. No `setInterval` for rendering.
- Never compute damage, lives, bomb legality, power-up effects or results on the client.
- All user-visible content that comes from other players is rendered as text, never HTML.

## Files to create

```text
frontend/package.json
frontend/angular.json
frontend/proxy.conf.json
frontend/src/main.ts
frontend/src/styles.css
frontend/src/app/
├─ app.config.ts
├─ app.routes.ts
├─ app.component.ts
├─ core/models/ws-messages.ts
├─ core/models/room.models.ts
├─ core/models/match.models.ts
├─ core/guards/session.guard.ts
├─ core/guards/room.guard.ts
├─ core/guards/match.guard.ts
├─ core/session.service.ts
├─ core/game-socket.service.ts
├─ core/room-store.ts
├─ core/game-view.service.ts
├─ core/history.service.ts
├─ core/fps-meter.service.ts
├─ pages/nickname/nickname.page.ts (+ html/scss)
├─ pages/waiting/waiting.page.ts
├─ pages/game/game.page.ts
├─ pages/results/results.page.ts
├─ pages/history/history.page.ts
├─ pages/match-details/match-details.page.ts
├─ components/board/board.component.ts
├─ components/player-list/player-list.component.ts
├─ components/hud/hud.component.ts
├─ components/chat/chat.component.ts
├─ components/countdown/countdown.component.ts
├─ components/match-table/match-table.component.ts
├─ components/connection-banner/connection-banner.component.ts
├─ components/perf-overlay/perf-overlay.component.ts
└─ styles/tokens.css, base.css, board.css, chat.css
```

Use Angular CLI conventions; file names may be `.ts`/`.html`/`.css` or `.scss` as long as they follow the
same structure. Keep the pages/components reusable rather than one giant component.

## Phase 0 — Angular shell and core services (first PR)

Deliver:

1. Angular workspace with standalone bootstrap, routing, strict TypeScript, `provideHttpClient` and
   `provideRouter`.
2. `tokens.css` with the player palette `--p0..--p3`, `--bg`, `--fg`, `--panel`, `--accent`; base
   typography/reset.
3. Typed models mirroring `PROTOCOL.md` (`ROOM_STATE`, `CHAT`, `MATCH_START`, `TILES`, `SNAPSHOT`,
   `MATCH_END`, `ERROR`; REST session/match DTOs).
4. `SessionService` (`POST /api/sessions`, in-memory session, clear).
5. `GameSocketService` (native WebSocket, one connection, status signal/observable, typed send,
   message dispatch, cleanup; no auto-reconnect).
6. `RoomStore` with signals for connection, room state, chat, match, result, error.
7. Nickname page (reactive form, trim/1–20, errors, join button) and route guards.
8. `proxy.conf.json` and `npm start` wired to `/api` and `/ws`.
9. Root `README.md` skeleton with the commands from `SETUP.md`.

Definition of done:

- `npm start` renders the nickname page with a visible connection/error state.
- Against the real backend, submitting a nickname creates a session, opens one WS, sends `JOIN`, and
  displays the returned `ROOM_STATE` on the waiting page.
- Navigating away does not leave a second socket open.
- Invalid/duplicate nickname errors return to the nickname page with a readable message.
- Root README commands are already correct enough for mbenboua to start the backend.

## Phase 1 — waiting room and chat

Deliver:

- `WaitingPage`: room id, player list, **counter `count / 4`**, waiting/countdown status, timer text,
  connection banner.
- `ChatComponent`: message list + form; Enter sends, Escape blurs; maxlength 300; trim/ignore empty;
  system messages distinct; sender and time visible; auto-scroll to bottom; text only.
- `CountdownComponent`: uses `timer.secondsLeft`/`endsAtEpochMs`; never changes the phase locally.
- `RoomStore` transitions for `ROOM_STATE`, `CHAT`, `ERROR`; chat cap (for example 200 messages).
- Keyboard focus behavior: focusing chat clears game input; typing Space/arrows never moves or bombs.
- Error/duplicate-join handling and a "play again" path placeholder.

Definition of done:

- Two real browsers/private windows show the same counter and exchange chat immediately.
- Both show the same 20 s waiting and 10 s countdown; the fourth player triggers the countdown
  immediately in all windows.
- A departure below two updates the room and reopens admission.
- `NICKNAME_TAKEN`, `INVALID_SESSION`, `RATE_LIMITED` and `CHAT_INVALID` have visible, useful handling.
- Chat list does not grow without bound; leaving the page unsubscribes/clears.

## Phase 2 — board, HUD and interpolation

Deliver:

- `BoardComponent`: exactly 195 cells in fixed order, CSS grid, classes for all tile codes; 4 player
  slots; sprite positioning via `transform`; dead/invulnerable/me classes; `OnPush`. Split the tiles
  grid (changes only on `TILES`) from the players layer (changes per frame) so a frame update does not
  re-evaluate the 195 cells.
- `HudComponent`: each player's nickname/lives/eliminated state; my bombs, range, speed; "You are out —
  spectating".
- `PlayerListComponent`: names/colours/lives in the game.
- `GameViewService`: bounded snapshot buffer (500 ms), tick/local-clock mapping, 66 ms interpolation,
  stale/gap/visibility snapping, reset on a new match; no unbounded extrapolation.
- `GamePage`: starts/stops the single rAF loop, reads `GameViewService`, renders board/HUD/chat; no
  per-frame store writes. On `MATCH_START` (received while on the waiting page) the app navigates to
  `/game`; `GameSocketService` feeds `GameViewService` from that moment so no first snapshot is lost.
- `board.css`: `--tile` responsive `min()`; full 15×13 board visible at 1366×768 with a ~260 px chat
  panel; `contain: layout paint`; `will-change` only on player sprites; no transitions on position.
- `?debug` FPS overlay (fps, avg/max frame ms, >20/>33 ms counts, refresh ≤4×/s).

Definition of done:

- With a recorded/fake `MATCH_START` + `TILES` + 30 Hz `SNAPSHOT`, four players glide smoothly at
  ~60 fps; tiles update only when `TILES` arrives.
- The whole map is visible without scrolling; all tile classes render correctly.
- A stale snapshot or a tab visibility change snaps instead of sliding across the map.
- Starting a second match resets the buffer and loop correctly.
- Unit tests cover regular/irregular snapshots, startup, stale data, visibility reset and a second match.

## Phase 3 — input, live gameplay and disconnection UX

Deliver:

- `GamePage` keyboard handling: arrows/WASD by physical `event.code`, Space bomb, Enter chat, Escape
  blur; held-direction stack; send `MOVE` only on effective direction change, `STOP` on release/blur/
  hide/chat focus; ignore keys when target is editable; `preventDefault` for game keys.
- Bomb keydown sends `PLACE_BOMB` once (ignore repeat); no input while dead/spectating.
- Spectator state: chat stays available; board/HUD remain visible; no movement/bombs.
- `MATCH_END`: stop rAF, clear input, close/park the socket, navigate `/results/:matchId`.
- WebSocket close/error during a match: stop input and animation, show a visible connection error, offer
  a return to the nickname page; no stale gameplay.
- `MATCH_START`: reset game view, set `you`/players, start the loop; handle a second match/new session
  cleanly.
- Navigation cleanup: unsubscribe, cancel rAF, remove listeners, no duplicate sockets.

Definition of done:

- In a real 2–4 player match, movement and bombs work; walls/blocks/bombs/speed/bomb limits are felt as
  server-enforced.
- Holding W → focusing chat → releasing W stops movement; clicking chat also stops movement; Space in
  chat never bombs.
- Elimination shows the spectator state and still allows chat.
- A killed socket shows the error and does not keep animating.
- Repeated waiting → game → results navigation creates no duplicate connections or messages.

## Phase 4 — results and history

Deliver:

- `ResultsPage`: fetch `GET /api/matches/{matchId}`; winner/draw, participant rows, remaining lives,
  duration, result labels, "Play again".
- `HistoryPage`: `GET /api/matches?limit=20`; table with date, players, outcome, duration; empty state;
  loading/error state; row selection.
- `MatchDetailsPage` or a details panel at `/history/:matchId`: participants, corners, lives, results.
- Navigation between nickname/waiting/game/results/history with guards.
- "Play again" goes to the nickname page with the previous nickname pre-filled and starts a **new**
  session; no rematch in the finished room.
- Results/history must use persisted REST data, not only the live `MATCH_END` payload.

Definition of done:

- After a match, both browsers see the same winner/draw and the same persisted details.
- Restarting the backend and refreshing `/history` still shows previous matches.
- Empty history shows a clear empty state; unknown match id shows a not-found/error state.
- Refresh/guards on `/waiting`, `/game`, `/results/:id`, `/history` behave as documented.

## Phase 5 — performance, polish and audit

- Run a four-player match in DevTools Performance: ~60 fps, no sustained drops, scripting per frame
  well under ~4 ms; record traces and screenshots.
- Paint flashing: only changed tiles should paint; player translation should be composited; no repeated
  paint of unchanged HUD/chat.
- Layers: few layers; only players (and a few bombs) promoted; never 195 cell layers.
- Memory: no growth or listener/subscription leaks over repeated matches/navigation.
- Polish sprites, bomb pulse, invulnerability blink, spectator banner, loading/empty/error states.
- Complete `docs/AUDIT_CHECKLIST.md` with evidence and update root `README.md` (prerequisites, commands,
  DB, controls, constants link, API link, tests, troubleshooting).
- Help mbenboua reproduce/fix protocol mismatches found during the audit.

Definition of done:

- A four-player match runs around 60 fps with limited paint/layers; evidence is attached.
- `npm test -- --watch=false` and `npm run build` pass.
- Root README lets a clean machine start PostgreSQL, backend and frontend.
- Every frontend audit item has a result, not just "implemented".

## Audit questions you own

- Is a nickname required, with validation and duplicate-room errors visible?
- Do separate browsers show the same counter and exchange chat immediately?
- Does the waiting page show the synchronized 20 s/10 s timers and player counter?
- Does the game page show the whole board, players, lives, bombs, flames and power-ups?
- Can players move/place bombs, and is chat usable without triggering gameplay keys?
- Is elimination/spectating and the final result clear?
- Do results/history use real persisted data, including duration and participants?
- Does the app show loading, disconnection and server errors visibly?
- Opening a protected route without a room returns to nickname with an explanation?
- Does repeated navigation avoid duplicate connections, subscriptions and keyboard actions?
- Does a four-player match run around 60 fps with minimal painting and sensible layers?
- Is source inspection free of canvas/WebGL/another UI framework and `innerHTML` for user content?

## Pitfalls

- **One socket, one loop.** A second `GameSocketService.connect()` or a second rAF loop is a bug.
- **Do not put per-frame snapshots in `RoomStore`.** Use `GameViewService`; otherwise the whole app
  change-detects 60 times per second. Keep HUD/chat on `OnPush` inputs that change only when their
  displayed values change; never feed them the raw per-frame signal.
- **Do not rebuild the 195-cell array every frame.** Replace it only on `TILES`; track by index. Keep
  the tiles grid and players layer in separate `OnPush` components, otherwise the frame signal can
  re-evaluate the whole cell loop.
- **No layout reads in the frame loop** (`offsetWidth`, `getBoundingClientRect`); use CSS `--tile`.
- **Keep the rAF loop out of Angular's zone** (or use zoneless change detection); otherwise every
  frame triggers a global change-detection pass.
- **Only transform/opacity animate.** No `transition` on player `left/top/transform`; no shadows/filters
  on the board; `will-change` on players only.
- **Chat focus is input focus.** Clear held keys and send `STOP`; otherwise typing moves the player.
- **Do not render server text with `innerHTML`.** Use Angular interpolation/text binding.
- **Guards are not optional.** Refresh loses the in-memory session; explain it and return to nickname.
- **No auto-reconnect.** A disconnected match is over for that player; stale snapshots must not animate.
- **Results come from REST.** The live `MATCH_END` can navigate, but the page must fetch persisted data.
- **Cleanup in `ngOnDestroy`.** Unsubscribe, cancel rAF, remove window listeners, close/park the socket.
- **No client-side rules.** Do not locally remove blocks, subtract lives, decide bomb legality or resolve
  power-ups; wait for `TILES`/`SNAPSHOT`.
- **Angular proxy needs `"ws": true`** for `/ws`; otherwise the handshake fails.
- **Do not create the socket on the nickname page and again on waiting.** Own it in one service and
  reuse it for the current session.
- **Avoid `setInterval` countdowns** that diverge from the server; render `secondsLeft`/`endsAt` from
  `ROOM_STATE`.

## Suggested PR sequence

1. `es-sadkia/angular-shell` — workspace, routing, tokens, models, SessionService, GameSocketService,
   RoomStore, nickname page, guards, proxy, README skeleton.
2. `es-sadkia/waiting-and-chat` — waiting page, counter, timers, chat, errors, focus handling.
3. `es-sadkia/board-and-interpolation` — board, HUD, game view, rAF, debug overlay, board CSS.
4. `es-sadkia/input-and-game-ux` — input, bombs, spectating, disconnect, results navigation.
5. `es-sadkia/results-history` — results/history/detail pages, guards, empty/error states, play again.
6. `es-sadkia/performance-audit` — performance pass, polish, README, AUDIT_CHECKLIST evidence.

Each PR description: what changed, how tested, protocol assumptions, and the audit line it supports.
