# ARCHITECTURE — Spring Boot + Angular + PostgreSQL (v1.0)

Status: **integration draft**. The wire contract is frozen only after milestone M1 (two real browsers
join the same room and exchange chat). Until then, change the contract and all consumers in the same
pull request. mbenboua owns the backend implementation and the protocol text; Es-sadkia owns the
Angular implementation and reviews every contract change.

Goal: a 2–4 player Bomberman match in the browser. Angular renders HTML/CSS and sends player
intentions. Spring Boot owns rooms, timers and game rules. PostgreSQL stores completed match history.

## 1. Hard constraints

From [`../bomberman-springboot-angular.md`](../bomberman-springboot-angular.md):

- Frontend: Angular + TypeScript, HTML/CSS board. **No canvas, no WebGL, no other frontend framework,
  no ready-made game engine.**
- Backend: Java + Spring Boot. REST for guest sessions and match history; **WebSockets for live room
  membership, chat and gameplay**. Polling must not replace real-time communication.
- Database: PostgreSQL. Persist players and completed matches/participations with real constraints.
- Performance: around 60 fps during play, no sustained frame drops, `requestAnimationFrame`, measured
  with browser DevTools. Server state updates may be slower than client rendering.
- Flow: nickname → waiting room (player list, counter out of 4, chat, synchronized timers) → match →
  results → history.
- Required gameplay: 3 lives, corner spawns, fixed walls + random blocks, bombs, flames, chain
  reactions, three power-up types, respawn with invulnerability, last-player-standing/draw.
- Bonus modes are optional and must remain server-authoritative if implemented.

## 2. System overview

```text
┌──────────────────────────── Browser ────────────────────────────┐
│ Angular                                                          │
│  pages: nickname / waiting / game / results / history           │
│  services: SessionService  GameSocketService  RoomStore          │
│            GameViewService  HistoryService                       │
│  rendering: HTML/CSS board, requestAnimationFrame, interpolation │
└───────────────┬───────────────────────────────┬──────────────────┘
                │ REST /api/*                    │ WebSocket /ws
                ▼                                ▼
┌──────────────────────────── Spring Boot ────────────────────────┐
│ SessionController        GameWebSocketHandler                    │
│ SessionService           WsSessionRegistry / WsSender            │
│ MatchController          RoomManager → Room → GameEngine          │
│ MatchService             RoomTickService (30 Hz, one thread)      │
│ MatchPersistenceService                                           │
└───────────────────────────────┬───────────────────────────────────┘
                                │ Spring Data JPA + Flyway
                                ▼
                     PostgreSQL: players, matches, participations
```

Live state (rooms, timers, map, positions, bombs, flames, power-ups, chat) lives only in backend
memory. Completed matches are written to PostgreSQL once. If the backend restarts, live matches are
lost and must not be restored; history remains.

## 3. Repository layout and ownership

```text
bomberman-springboot-angular/
├─ README.md                                  Es-sadkia (final deliverable)
├─ docs/                                      shared; see owners below
├─ backend/                                   mbenboua
│  ├─ pom.xml
│  ├─ mvnw / mvnw.cmd / .mvn/
│  └─ src/
│     ├─ main/java/com/bomberman/
│     │  ├─ BombermanApplication.java
│     │  ├─ config/        WebSocketConfig, SchedulingConfig, CorsConfig
│     │  ├─ common/        ApiError, GlobalExceptionHandler, validation helpers
│     │  ├─ session/       GuestSession, SessionService, SessionController, dto/
│     │  ├─ room/          Room, RoomPhase, RoomManager, RoomService, LobbyTimer
│     │  ├─ ws/            GameWebSocketHandler, WsSessionRegistry, WsSender, WsMessage
│     │  ├─ game/          GameEngine, GameState, GameMapFactory, GameConstants, model/, logic/
│     │  ├─ match/         MatchService, MatchController, MatchPersistenceService, dto/
│     │  └─ persistence/   entity/PlayerEntity, MatchEntity, ParticipationEntity; repository/
│     ├─ main/resources/
│     │  ├─ application.yml
│     │  ├─ application-example.yml
│     │  └─ db/migration/V1__init.sql
│     └─ test/java/com/bomberman/...
└─ frontend/                                  Es-sadkia
   ├─ package.json, angular.json, proxy.conf.json
   └─ src/
      ├─ main.ts, styles.css
      └─ app/
         ├─ app.config.ts, app.routes.ts, app.component.ts
         ├─ core/        models/, guards/, session.service.ts, game-socket.service.ts,
         │               room-store.ts, game-view.service.ts, history.service.ts
         ├─ pages/       nickname/, waiting/, game/, results/, history/, match-details/
         ├─ components/  board/, player-list/, hud/, chat/, countdown/, match-table/
         │               connection-banner/, perf-overlay/
         └─ styles/      tokens.css, base.css, board.css, chat.css
```

Rules:

- mbenboua touches only `backend/` and `docs/PROTOCOL.md` (plus reviewed edits to shared docs).
- Es-sadkia touches only `frontend/`, root `README.md`, `docs/AUDIT_CHECKLIST.md` (plus reviewed edits
  to shared docs).
- Database entities never leave the backend; REST/WS DTOs are explicit and testable.
- The Angular app never imports server code. Shared constants are duplicated only as protocol
  documentation, not as a shared build module.

## 4. Identity, sessions and room lifecycle

### 4.1 Guest session

1. The nickname page validates locally (trim, 1–20 characters) and calls `POST /api/sessions`.
2. The backend trims and validates again, creates a `PlayerEntity` (generated id, nickname, creation
   time) and a server-side `GuestSession` with an opaque `sessionId`.
3. The response contains `sessionId`, `playerId` and `nickname`. The Angular `SessionService` keeps
   them **in memory**; a refresh deliberately loses the session and returns the user to the nickname
   page.
4. The waiting page opens one WebSocket and sends `JOIN {sessionId}`. Only then does the backend
   authenticate the socket and place the player in a room.
5. The player is identified by the socket's session mapping for the rest of its life. Actions never
   carry a player id, room id, position, life count or result.

Nickname uniqueness is checked in the **target room** at `JOIN`, not globally, and is
case-insensitive after trimming. The matchmaker selects the first open `WAITING` room with space; if
that room already uses the nickname, `JOIN` fails with `NICKNAME_TAKEN` and the user can retry with
another nickname. The backend does not silently move a duplicate nickname to another room, so the
rejection is deterministic and easy to audit.

### 4.2 Matchmaking

- `RoomManager` keeps `WAITING`, `COUNTDOWN`, `PLAYING` and `FINISHED` rooms.
- A joining player goes to the first `WAITING` room with fewer than 4 players. If the nickname is
  already used in that room, `JOIN` fails with `NICKNAME_TAKEN`; the matchmaker does not skip to
  another room, so behavior is deterministic.
- If no `WAITING` room has space, create a new `WAITING` room.
- `COUNTDOWN` and `PLAYING` rooms are closed to new players. A new arrival therefore always enters a
  waiting room, never an active match.
- An empty room is removed and its timers are cancelled.

### 4.3 Room state machine

```text
             first player
                 │
                 ▼
             ┌─────────┐   reaches 4 players, or 20 s elapsed with ≥ 2
             │ WAITING │ ────────────────────────────────────────────┐
             └─────────┘                                             ▼
                 ▲                                              ┌───────────┐
                 │  countdown drops below 2                      │ COUNTDOWN │
                 └───────────────────────────────────────────────└───────────┘
                                                                        │ 10 s
                                                                        ▼
                                                                   ┌─────────┐
                                                                   │ PLAYING │
                                                                   └─────────┘
                                                                        │ result
                                                                        ▼
                                                                   ┌──────────┐
                                                                   │ FINISHED │ → cleanup
                                                                   └──────────┘
```

Detailed timer rules are in [`GAME_RULES.md`](GAME_RULES.md) §8 and [`PROTOCOL.md`](PROTOCOL.md) §6.
The backend owns all timers; clients only display `secondsLeft` and never decide when a phase changes.

### 4.4 Match start and finish

- At countdown end, slots `0..n-1` are assigned in join order and mapped to corners:
  `0=TOP_LEFT`, `1=BOTTOM_RIGHT`, `2=TOP_RIGHT`, `3=BOTTOM_LEFT`.
- A match id is generated at start. The room sends `MATCH_START` with the map and then `SNAPSHOT`
  tick 0.
- The tick service advances the match at 30 Hz. On completion it stops the tick, persists the match and
  all participations in one transaction, and only after the commit sends `MATCH_END` and moves the room
  to `FINISHED`. The results page can therefore fetch the persisted match immediately.
- Rooms are one-shot. Clients navigate to the results page, close the socket, and start a new guest
  session to play again. There is no rematch inside the same room and no rejoin into a running match.

## 5. Backend architecture

### 5.1 Layers

| Package | Responsibility | Must not depend on |
|---|---|---|
| `session` | Guest session creation and lookup; player persistence entry point | WebSocket, room internals |
| `room` | Matchmaking, room membership, phase machine, lobby timers, match orchestration | HTTP/WS transport details |
| `ws` | WebSocket lifecycle, message parsing, session authentication, send registry | Game rules |
| `game` | Pure game engine: map, movement, bombs, flames, power-ups, damage, result | Spring, JPA, WebSocket |
| `match` | Match result persistence, history queries, REST DTOs | Live room internals |
| `persistence` | JPA entities and repositories | WS/REST DTOs |
| `common` | API error shape and global exception handling | Domain logic |

`GameEngine` is a plain Java object. It receives player ids/slots and `step(dtMs)` calls. It never
sends messages and never reads the clock; time comes only from accumulated `dtMs`. Randomness comes
from an injected seed so tests are deterministic.

### 5.2 WebSocket handling

- `WebSocketConfig` registers one native endpoint at `/ws` with a text message buffer limit
  (`MAX_WS_MESSAGE_BYTES`), allowed origins from configuration, and no SockJS/STOMP.
- `GameWebSocketHandler` handles `afterConnectionEstablished`, `handleTextMessage`,
  `handleTransportError` and `afterConnectionClosed`.
- The first valid client message must be `JOIN`. Before that only `JOIN` is accepted; after a 5 s
  grace period the socket is closed.
- `WsSessionRegistry` maps `WebSocketSession` id → `GuestSession`/room. `WsSender` serializes a frame
  once and sends it to the sessions of one room. Spring WebSocket sessions are wrapped with
  `ConcurrentWebSocketSessionDecorator` (or an equivalent per-session lock) because sends can come from
  the tick thread and from request threads.
- Malformed JSON, unknown types and invalid fields produce `ERROR`; they never reach the engine and
  never crash the handler. Repeated bad messages close the socket.

### 5.3 Room concurrency

- Each `Room` has a `ReentrantLock` (or is a synchronized monitor). WebSocket actions, lobby timer
  updates and game ticks all mutate the room under that lock.
- The tick service must **not** hold the lock while sending JSON or writing to the database. It copies
  the outgoing messages/snapshots under the lock, releases it, then sends.
- A `PLACE_BOMB`, power-up pickup or result is applied once per tick even if several events arrive
  concurrently.
- `GameEngine` methods are called only by the room under its lock, so the engine itself needs no
  internal synchronization.
- Match completion is latched (`finished=true`) under the room lock before persistence, so a second tick
  or disconnect cannot start another completion. The match id is generated once; a `saved=true` flag is
  set after the transaction commits and prevents a second `MATCH_END`.

### 5.4 Game loop

- One `ScheduledExecutorService` (or `TaskScheduler`) ticks every `SERVER_TICK_MS` (33 ms).
- Each tick iterates active `PLAYING` rooms. Per room, a nano-time accumulator runs 0..N fixed steps,
  capped at `MAX_CATCHUP_TICKS` so a long pause cannot cause a death spiral.
- A room tick: apply queued inputs → `engine.step(TICK_MS)` → if tiles changed, broadcast `TILES` →
  broadcast `SNAPSHOT` → check result. `TILES` always precedes the snapshot of the same tick.
- Lobby countdowns are wall-clock based (`Clock` injected) and are evaluated by the same scheduler or a
  separate lightweight scheduler; they do not depend on the game tick rate.
- Logging must be rate-limited (for example, one snapshot-rate log per second, never one line per
  tick).

### 5.5 Validation and errors

- REST: Bean Validation on request DTOs, trim before validation, `@RestControllerAdvice` returns
  `ApiError {code, message, timestamp, path}` with the right status.
- WS: validate envelope shape, type, field types, length limits, membership and phase. Unknown or
  out-of-phase actions are rejected with `ERROR` and do not mutate the room.
- The server never trusts client-supplied positions, lives, slot ids, room ids or results.

### 5.6 Cleanup

- On disconnect: remove from waiting room or forfeit the match (see `GAME_RULES.md` §10).
- On match end: stop ticking, persist exactly once, send `MATCH_END`, release the engine, stop all
  timers.
- Empty waiting rooms, finished rooms after all clients disconnect (or a short grace period), and
  expired guest sessions are removed. No static collection may grow forever.

## 6. Game engine

### 6.1 Model

- `GameState`: tick, map tile array, players, bombs, flames, hidden power-ups, elapsed time, result.
- `PlayerState`: playerId, nickname, slot, x/y in tile units, direction, moving, lives, alive,
  invulnerableUntil, maxBombs, range, speedLevel, activeBombs.
- `Bomb`: id, owner slot, cell, range captured at placement, explodeAt, passable player ids.
- `Flame`: cell, expiresAt.
- `Tile` codes are documented in `GAME_RULES.md` §2. The client receives the full array, never a diff.

### 6.2 Tick order

1. Apply the latest desired direction for each alive player.
2. Move players with collision, substeps and corner assist.
3. Collect power-ups on the player's centre cell.
4. Update bomb fuses and resolve explosions/chain reactions.
5. Expire flames and reveal hidden power-ups.
6. Apply flame damage, respawn or eliminate.
7. Increment tick and evaluate the match result.
8. Return `{tilesChanged}` plus the result if the match ended.

The exact rules and edge cases live in [`GAME_RULES.md`](GAME_RULES.md).

### 6.3 Determinism

- Map generation and power-up placement use a seeded `RandomGenerator`/`SplittableRandom`.
- Production seeds may come from `System.nanoTime()`; tests inject a fixed seed.
- No server rule may call `Math.random()` in a way that cannot be tested. No game rule depends on
  client timing.

## 7. Frontend architecture

### 7.1 Routes

| Route | Page | Guard |
|---|---|---|
| `/` | Nickname | none |
| `/waiting` | Waiting room | session + room joined |
| `/game` | Live match | session + active match |
| `/results/:matchId` | Results | match id present; data from REST |
| `/history` | Match history (latest 20) | none |
| `/history/:matchId` | Match details | match id present |
| `**` | Redirect to `/` | — |

A protected route without a live session/room redirects to `/` with a readable reason (query
parameter or store message). Refreshing mid-match therefore returns to the nickname page.

### 7.2 Components and pages

- `NicknamePage`: reactive form, trim/1–20 validation, join button, connection and server errors.
- `WaitingPage`: room id, player list, counter `count / 4`, timer status, shared `ChatComponent`,
  connection banner.
- `GamePage`: full board, `HudComponent`, `PlayerListComponent`, `ChatComponent`, countdown/elimination
  feedback, debug overlay. Owns the single `requestAnimationFrame` loop while active.
- `ResultsPage`: winner/draw, participant rows, duration, "Play again" → nickname/new session.
- `HistoryPage` / `MatchDetailsPage`: latest 20 completed matches, empty state, detail selection.
- Reusable: `BoardComponent`, `PlayerListComponent`, `HudComponent`, `ChatComponent`,
  `CountdownComponent`, `MatchTableComponent`, `ConnectionBannerComponent`.

`BoardComponent` renders exactly `COLS*ROWS` cells in a fixed order and exactly 4 player slots. It is
`ChangeDetectionStrategy.OnPush` and receives signals/inputs. Tiles are replaced only when a `TILES`
message arrives; player positions are updated by the game view at display rate. Split the visual board
into a **tiles grid** child (input changes only on `TILES`) and a **players layer** child (input changes
per frame), so Angular does not re-evaluate the 195-cell loop at 60 fps.

### 7.3 Services and state

- `SessionService`: `POST /api/sessions`, holds the in-memory session and nickname.
- `GameSocketService`: one native WebSocket, typed send/receive, connection status, no auto-reconnect,
  no duplicate connection on navigation. Exposes messages as an observable/signal. It feeds both the
  room store and the game view from the first message, so a `MATCH_START`/`SNAPSHOT` that arrives
  during navigation is not lost.
- `RoomStore`: shared source of truth for room phase, players, counter, timer, chat, match start,
  result, errors and connection status. Use Angular signals and immutable updates.
- `GameViewService`: per-frame data only. Buffers snapshots (bounded), interpolates positions, exposes
  the current frame. It is deliberately **not** the general room store, so 60 Hz data does not trigger
  whole-app change detection.
- `HistoryService`: `GET /api/matches` and `GET /api/matches/{id}`.
- Guards: session, room and match guards as above.

### 7.4 Rendering and interpolation

- Server snapshots arrive at 30 Hz with `tick`; simulation time is `tick * serverTickMs`.
- The client renders at display rate with one `requestAnimationFrame` loop and targets
  `interpolationDelayMs` (66 ms) behind the newest simulation time. It interpolates `x`/`y` between
  the two surrounding snapshots. Run the loop outside Angular's zone (or use zoneless change
  detection) and update only the game-view signal, so Angular does not schedule a global change
  detection pass for every frame.
- All other fields (lives, alive, invulnerable, maxBombs, range, speed, direction) come from the
  newest snapshot. Tiles/status changes are applied immediately.
- If snapshots are stale (> 250 ms), the position gap is > 1.5 tiles, or the tab becomes visible
  again, snap to the newest snapshot instead of sliding across the map. Never extrapolate unbounded.
- Player sprites are positioned with `translate3d(calc(var(--tile) * x), ...)`; only `transform` and
  `opacity` animate. `will-change: transform` is applied to the four sprites only, never to cells.
- Keep the tiles grid and the players layer as separate `OnPush` children. A frame signal update must
  not re-run the 195-cell template; only the four player bindings change.
- Keep the HUD and chat out of the per-frame path. The HUD receives `computed` stats that change only
  when lives/bombs/range/speed/alive change; chat changes only when a message arrives.
- The board scales with CSS custom property `--tile` (`min()` of viewport-based values); no layout
  reads in the frame loop.

### 7.5 Keyboard, chat and focus

- Move: arrows or WASD by physical key code (`KeyW` etc., which also gives ZQSD on AZERTY). Bomb:
  Space. Enter: focus chat. Escape: leave chat.
- The game keeps a stack of held direction keys; the most recently pressed still-held key wins. Send
  `MOVE` only when the effective direction changes and `STOP` when it becomes empty.
- Ignore movement/bomb keys while the event target is an input, textarea or contenteditable. On chat
  focus, clear held keys and send `STOP`; Space typed in chat must never place a bomb.
- Clear held keys and send `STOP` on window blur and tab hide.
- Chat messages render as text (`{{ }}`), never through `innerHTML`. The input is reset after send.

### 7.6 Cleanup and duplicate-protection

- `GamePage` cancels its rAF, removes keyboard listeners and unsubscribes WS/store handlers in
  `ngOnDestroy`.
- `GameSocketService` opens a connection only when there is no connecting/open socket. Navigation
  between waiting/game/results must not create a second socket.
- `MATCH_END` stops rendering and navigation to results closes or parks the socket.
- Connection loss during a match stops input immediately, shows a visible error and offers a return to
  the nickname page. No automatic reconnection.

## 8. Persistence

Three tables, created by Flyway; `spring.jpa.hibernate.ddl-auto=validate`:

- **players**: id (UUID PK), nickname (varchar 20, not null, trimmed length 1–20),
  created_at (timestamptz, not null).
- **matches**: id (UUID PK), started_at/ended_at (timestamptz, not null, `ended_at >= started_at`),
  outcome (`WIN`/`DRAW`), winner_player_id (nullable FK → players), check constraint that `WIN` has a
  winner and `DRAW` has none.
- **participations**: id (UUID PK), match_id (FK → matches, cascade delete), player_id (FK → players),
  corner (`TOP_LEFT`/`TOP_RIGHT`/`BOTTOM_LEFT`/`BOTTOM_RIGHT`), remaining_lives (0–3), result
  (`WINNER`/`ELIMINATED`/`DISCONNECTED`/`DRAW`), unique `(match_id, player_id)`.

`MatchPersistenceService.saveCompletedMatch(result)` is `@Transactional`: insert the match and all
participations, exactly once, or roll back. Duration is derived from timestamps in DTOs; it is not
stored. History queries return completed matches only, newest first, limit 20.

The match id is generated when the match starts, so a retry cannot create a second row. The room sets
a `saved` latch before saving and does not tick or send results twice if persistence fails. Details:
[`ARCHITECTURE.md`](ARCHITECTURE.md) §8, [`SETUP.md`](SETUP.md) and [`PROTOCOL.md`](PROTOCOL.md) §2.

## 9. Performance contract

1. **Server**: fixed 30 Hz tick, independent of rendering; one tick thread for all rooms is enough for
   this project. Broadcasts are serialized once per room.
2. **Client**: one rAF loop, only while the game page is active. No `setInterval` for rendering.
3. **DOM**: fixed 195 cells and 4 player slots. Only classes change on tiles; only transforms change
   per frame on players. Do not rebuild the tile list every frame.
4. **Paint/layers**: only `transform`/`opacity` animate; no `box-shadow`, `filter`, `blur` or
   `backdrop-filter` on the board; no CSS transition on player position; `will-change` only on player
   sprites. Verify with Paint flashing and Layers in DevTools.
5. **JS budget**: no layout reads (`offsetWidth`, `getBoundingClientRect`) inside the frame loop;
   keep per-frame work well under ~4 ms.
6. **Debug**: `?debug` shows FPS, average/max frame time and long-frame counts, refreshed at most 4×/s.
7. **Evidence**: a four-player match is recorded from the foreground tab; screenshots/traces are linked
   in `AUDIT_CHECKLIST.md`.

## 10. Conventions

- **Grid**: 15 columns × 13 rows. `x` right (0..14), `y` down (0..12), origin top-left; index =
  `y * 15 + x`.
- **Positions**: floats in tile units, centre-based. The centre of tile `(1,1)` is `(1.5,1.5)`;
  sprite top-left = `(x - 0.5, y - 0.5)` tiles.
- **Directions**: `UP`, `DOWN`, `LEFT`, `RIGHT` in JSON; last facing direction when stopped.
- **Slots/corners**: `0=TOP_LEFT`, `1=BOTTOM_RIGHT`, `2=TOP_RIGHT`, `3=BOTTOM_LEFT`.
- **Time**: server tick 33 ms (30 Hz), bomb fuse 3000 ms, flame 500 ms, invulnerability 2000 ms,
  countdown 10 s, waiting 20 s.
- **Ids**: UUID strings in REST/WS and PostgreSQL.
- **JSON**: camelCase fields; enum values are uppercase strings; timestamps are ISO-8601 UTC strings
  in REST and epoch milliseconds only where explicitly documented.
- **No secrets in source**: DB credentials come from environment variables; commit only
  `application-example.yml`.

## 11. Assumptions and decisions (review before M1)

| Decision | Rationale / consequence |
|---|---|
| Raw JSON WebSocket instead of STOMP/SockJS | Simpler envelope, explicit room routing, fewer dependencies; subject allows either |
| Guest session created by REST before WS `JOIN` | Satisfies "REST for guest sessions"; WS only needs the opaque session id |
| Nickname duplicate rejected in the target room | Deterministic audit behavior; the user retries with another nickname |
| Rooms are one-shot; no rematch/reconnect | Avoids complex reconnect semantics; refresh = new session |
| Chat is not persisted and has no history for late joiners | Subject only requires live room chat |
| Live game state is not persisted; only completed matches | Subject explicitly excludes restoring interrupted matches |
| Block density 65 %, power-up chance 30 %, at least 3 of each type | Documented, testable, and guarantees all three power-ups appear |
| Flames destroy exposed power-ups and continue | Consistent with bomb chains and avoids permanent free upgrades |
| 30 Hz server tick with 66 ms client interpolation | Meets "60 fps does not require 60 messages/s" |
| One tick thread for all rooms | Small scale, simpler ordering; per-room locks still protect state |

## 12. Milestones

| Milestone | Deliverable | Acceptance |
|---|---|---|
| **M0 — skeleton** | Backend boots with `/api/sessions` and `/ws`; Angular shell with nickname page and WS `JOIN`; Flyway schema | A session can be created and a socket can join/leave a room |
| **M1 — lobby + chat** | Matchmaking, waiting room, counter, shared timers, chat, room isolation | Two real browsers see the same counter and exchange messages; contract frozen |
| **M2 — match start** | Engine map/snapshot skeleton; `MATCH_START`, `TILES`, `SNAPSHOT`; Angular static board | 2/4 players start together on the same map from different corners |
| **M3 — playable match** | Movement, bombs, flames, power-ups, damage, respawn, elimination, winner/draw | Two real players can finish a match and see the same result |
| **M4 — persistence** | Transactional match save; results and history pages from PostgreSQL | History survives a backend restart; no duplicate participation |
| **M5 — audit** | Performance evidence, disconnect/abuse checks, README and checklist completed | Four-player match around 60 fps; all checklist items have evidence |

A milestone is integrated before polishing fake data, sprites or bonus modes. The first playable match
has no client prediction; measure latency with the real server before adding any.
