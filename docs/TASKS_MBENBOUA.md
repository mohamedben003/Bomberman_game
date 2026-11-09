# TASKS — mbenboua: Spring Boot backend, game engine, real-time rooms, PostgreSQL

Read first: [`ARCHITECTURE.md`](ARCHITECTURE.md) §4–§6 and §8, [`GAME_RULES.md`](GAME_RULES.md),
[`PROTOCOL.md`](PROTOCOL.md), [`SETUP.md`](SETUP.md), then
[`../bomberman-springboot-angular.md`](../bomberman-springboot-angular.md).

## Mission

Implement the authoritative backend: guest sessions, matchmaking, waiting-room timers, chat, the game
engine, the 30 Hz match loop, WebSocket broadcasts, transactional persistence, and match history REST.
The Angular application must be able to build against the protocol without reading your Java code.

You own `backend/` and `docs/PROTOCOL.md`. You do **not** edit `frontend/` or the root README.
Coordinate contract changes with Es-sadkia; update the protocol, DTOs and Angular models in the same
pull request while the contract is still a draft (before M1).

## Boundaries

- Backend only: Java 21, Spring Boot 3, Spring Web, Spring WebSocket, Spring Data JPA, Bean Validation,
  Flyway, PostgreSQL, JUnit 5, Testcontainers.
- `game/` is plain Java. It must not import Spring, JPA, WebSocket, HTTP or the room package. The room
  calls the engine; the engine never sends messages.
- Never trust a client-supplied player id, room id, position, life count, power-up or result. Derive the
  player from the WebSocket session.
- Never persist live rooms, positions, bombs, flames, countdowns or chat.
- The public contract is `PROTOCOL.md`; the rules are `GAME_RULES.md`. If an implementation detail
  contradicts them, fix one in the same PR.

## Files to create

```text
backend/pom.xml
backend/mvnw, backend/mvnw.cmd, backend/.mvn/
backend/src/main/java/com/bomberman/
├─ BombermanApplication.java
├─ config/WebSocketConfig.java
├─ config/SchedulingConfig.java
├─ config/CorsConfig.java
├─ common/ApiError.java
├─ common/GlobalExceptionHandler.java
├─ session/GuestSession.java
├─ session/SessionService.java
├─ session/SessionController.java
├─ session/dto/CreateSessionRequest.java
├─ session/dto/SessionResponse.java
├─ room/Room.java
├─ room/RoomPhase.java
├─ room/RoomManager.java
├─ room/RoomService.java
├─ room/LobbyTimer.java
├─ room/RoomTickService.java
├─ ws/GameWebSocketHandler.java
├─ ws/WsSessionRegistry.java
├─ ws/WsSender.java
├─ ws/WsMessage.java
├─ game/GameConstants.java
├─ game/GameEngine.java
├─ game/GameState.java
├─ game/GameMapFactory.java
├─ game/model/PlayerState.java
├─ game/model/Bomb.java
├─ game/model/Flame.java
├─ game/model/Tile.java
├─ game/model/Direction.java
├─ game/logic/Movement.java
├─ game/logic/Bombs.java
├─ game/logic/PowerUps.java
├─ game/logic/Damage.java
├─ match/MatchService.java
├─ match/MatchController.java
├─ match/MatchPersistenceService.java
├─ match/dto/MatchSummaryDto.java
├─ match/dto/MatchDetailsDto.java
├─ match/dto/ParticipantDto.java
├─ persistence/entity/PlayerEntity.java
├─ persistence/entity/MatchEntity.java
├─ persistence/entity/ParticipationEntity.java
├─ persistence/entity/MatchOutcome.java
├─ persistence/entity/ParticipationResult.java
├─ persistence/entity/Corner.java
├─ persistence/repository/PlayerRepository.java
├─ persistence/repository/MatchRepository.java
├─ persistence/repository/ParticipationRepository.java
backend/src/main/resources/application.yml
backend/src/main/resources/application-example.yml
backend/src/main/resources/db/migration/V1__init.sql
backend/src/test/java/com/bomberman/...
```

Names may be adjusted, but keep the layers and package responsibilities from `ARCHITECTURE.md` §5.
Angular depends on the wire contract, not on these names.

## Phase 0 — skeleton and unblocking (first PR)

Deliver:

1. Maven project with the Spring Boot parent, Java 21, wrapper, dependencies and test setup.
2. `POST /api/sessions` with validation, `PlayerEntity` persistence and an in-memory `GuestSession`.
3. Native WebSocket endpoint `/ws`; `JOIN {sessionId}`; a minimal `RoomManager` that places the player in
   one room and returns `ROOM_STATE`; basic `CHAT` broadcast; `ERROR` envelope.
4. Flyway `V1__init.sql` and `application-example.yml`; `ddl-auto=validate`.
5. `docs/PROTOCOL.md` v0.1 with the exact messages implemented so far.

Definition of done:

- `curl` creates a session; two browser tabs (or two `wscat` clients) can `JOIN`, see the same
  `ROOM_STATE`, and exchange `CHAT`.
- The Angular shell can create a session and reach the waiting page against the real backend.
- The backend starts against a fresh PostgreSQL database and fails clearly on a bad configuration.
- No game rules are required yet; the room can stay in `WAITING`.

## Phase 1 — matchmaking, waiting rooms, timers, chat

Implement:

- `RoomManager`: first open `WAITING` room with space, otherwise a new room; nickname uniqueness in the
  target room; remove empty rooms.
- `Room` phase machine `WAITING → COUNTDOWN → PLAYING → FINISHED` with injected `Clock` and the exact
  timer table from `GAME_RULES.md` §8.
- `LobbyTimer` (`kind`, `endsAt`, `secondsLeft`) and `ROOM_STATE` broadcasts on membership changes and at
  least once per second while a timer runs.
- `CHAT`: trim, 1–300, control-character strip, 5/5 s rate limit, room-scoped broadcast, system messages
  for join/leave/eliminated.
- `JOIN` errors: `INVALID_SESSION`, `NICKNAME_TAKEN`, `ALREADY_IN_ROOM`, `ROOM_FULL` race handling.
- `GameWebSocketHandler`: first-message rule, JSON parsing, per-socket rate limit, close on abuse,
  heartbeat/ping, cleanup exactly once.
- Session TTL and room cleanup; no timer or collection leaks.

Definition of done:

- Two real browsers: counter increments to `2 / 4`, both see the same timer and chat; a private-window
  third/fourth player joins the same room until it is full.
- With two players, 20 s → 10 s countdown; with four, the 10 s countdown starts immediately.
- A departure below two during countdown cancels it and reopens admission; a new second player gets a
  fresh 10 s countdown.
- Unit tests cover every timer row with a fake clock, nickname collisions, room isolation and chat
  limits.
- No room is created for a failed `JOIN` (or it is cleaned up immediately).

## Phase 2 — game engine (pure Java, test-first)

Implement in `game/`:

- `GameMapFactory`: 15×13 border/pillars, four safe-zone arms, 65 % blocks, seeded RNG, hidden power-up
  deck with at least 3 of each type. Deterministic for a fixed seed.
- `Movement`: centre-based floats, hitbox 0.35, sub-steps ≤ 0.25, walls/blocks/bombs, corner assist,
  own-bomb pass-through, players may share tiles, dead players frozen.
- `Bombs`: placement rules, captured range, 3 s fuse, active-bomb limit, explosion rays, first-block
  destruction, wall stop, chain queue resolving each bomb once per tick, flame expiry/reveal, 500 ms
  flames.
- `PowerUps`: collection on centre cell, caps, persistence across respawn.
- `Damage`: one life per hit, 2 s invulnerability, respawn at corner/nearest free tile, elimination at
  zero, self-damage, centre-cell rule.
- `GameEngine`: tick order from `GAME_RULES.md`, `TILES` dirty flag, snapshot DTO, result (winner/draw),
  `removePlayer` for disconnect (forfeit).
- `GameState`/DTOs: the exact snapshot fields in `PROTOCOL.md` §5.5, positions rounded to 3 decimals.

Definition of done:

- `./mvnw test` covers: identical maps for the same seed; safe zones empty; first-bomb escape route;
  wall/block/bomb collisions; corner assist; no tunnelling; fuse ±1 tick; range and stop rules; chain
  reactions once; own-bomb pass-through; bomb limit; block destruction; power-up reveal and all three
  types; pickup caps; exactly one life lost from overlapping flames; invulnerability; respawn; three
  hits → eliminated; last standing → winner; simultaneous death → draw; disconnect forfeit.
- A scripted engine-only match with four players completes and returns a valid result.
- The engine has no `Math.random()`, `Date.now()`, Spring or socket dependency.

## Phase 3 — real-time match orchestration

Implement:

- Start a match when the countdown ends: slots in join order, corners, map, match id, `MATCH_START`,
  tick-0 `SNAPSHOT`.
- `RoomTickService`: one 30 Hz scheduler for all `PLAYING` rooms, fixed-step accumulator capped at 5
  ticks, no per-room thread explosion.
- Per tick: apply queued intentions, `engine.step`, broadcast `TILES` before `SNAPSHOT`, broadcast the
  same snapshot to everyone, evaluate the result.
- Action routing: `MOVE`, `STOP`, `PLACE_BOMB` only for the socket's own player, only while alive and in
  `PLAYING`; ignore/reject the rest with the documented error.
- Eliminated players remain connected, receive snapshots and can chat; they cannot act.
- Disconnect during play: forfeit lives, system chat, winner check, keep the match for the others.
- `MATCH_END`, room `FINISHED`, stop ticking/timers, cleanup; no second broadcast or second result.
- Room isolation: two concurrent matches must not receive each other's messages.
- Send-safety: `ConcurrentWebSocketSessionDecorator` (or equivalent) and no I/O under the room lock.
- Log snapshot rate at most once per second, never per tick.

Definition of done:

- Four WebSocket clients (browser tabs or a small Java/JS test client) complete a full match.
- Two rooms can play simultaneously with no cross-talk.
- A mid-match disconnect produces a visible system message and the correct winner/result.
- No duplicate `MATCH_END`, no ticking after `FINISHED`, no stale room after all clients leave.
- `TILES` and `SNAPSHOT` ordering is verified by a test or a recorded client run.

## Phase 4 — persistence, results and history

Implement:

- JPA entities and repositories for `players`, `matches`, `participations`; enums stored as strings.
- `V1__init.sql`: PKs, FKs, required fields, `CHECK` constraints for time/outcome/lives, unique
  `(match_id, player_id)`, indexes for `endedAt` and participation lookup.
- `MatchPersistenceService.saveCompletedMatch(...)` `@Transactional`: insert match + all participations
  exactly once, or roll back. Generate the match id at match start; a retry must not duplicate it.
- Wire completion so the transaction commits **before** `MATCH_END` is broadcast; the results page may
  fetch the match immediately. During phase 3, before persistence exists, `MATCH_END` can be sent
  without a database write; phase 4 changes the order.
- Result mapping: winner, eliminated, disconnected, draw, including the draw rule from
  `GAME_RULES.md` §7.
- `GET /api/matches?limit=20` and `GET /api/matches/{id}` with DTOs, duration derived from timestamps,
  newest first, `404` for unknown ids.
- `MatchController` + `GlobalExceptionHandler`; entities never serialized directly.

Definition of done:

- A completed match is saved exactly once; a second attempt is impossible or harmless.
- `GET /api/matches?limit=20` returns the latest completed matches in order; details include every
  participant with corner, remaining lives and result.
- History survives a backend restart; live state does not.
- A draw saves connected final-update players as `DRAW` and earlier eliminations unchanged.
- Persistence tests use Testcontainers PostgreSQL and assert constraints/relationships.
- No duplicate participation is possible even under a repeated completion call.

## Phase 5 — hardening, tests and audit support

- Validate every REST body and WS field; reject oversized/binary/malformed frames; enforce rate limits
  and the 10-bad-message close.
- Verify concurrent actions: two bombs/pickups in the same tick, duplicate `PLACE_BOMB`, result raced by
  a disconnect.
- Check memory/timer cleanup: empty rooms, finished rooms, sessions, scheduler shutdown.
- Add tests for `SessionService`, `RoomManager`, `RoomTickService`, `MatchPersistenceService`, REST
  controllers (`@WebMvcTest` or `@SpringBootTest`), and the engine.
- Write the backend half of the README facts: ports, endpoints, environment variables, test command.
- Support Es-sadkia during the audit: expose any missing field, fix protocol mismatches, and keep the
  server logs readable.

Definition of done:

- `./mvnw test` green (unit + persistence), with the Testcontainers requirement documented.
- Abuse run: 2 MB frame, binary frame, 1000 messages/s, kill socket mid-match, restart backend during a
  match → server survives, other rooms unaffected, no duplicate history.
- Every backend audit line in `AUDIT_CHECKLIST.md` has evidence or a clear pending note.

## Audit questions you own

- Can the evaluator start PostgreSQL and Spring Boot from the README?
- Is the stack Spring Boot + JPA + PostgreSQL with controllers, services, repositories and entities
  separated?
- Does a nickname get validated? Are duplicate nicknames rejected in the same room?
- Do two browsers see the same counter and chat immediately over WebSockets?
- With two/three players, does the 10 s countdown begin after 20 s? With four, immediately?
- Does one player keep waiting? Does a departure below two cancel the countdown?
- Do all players start together in different safe corners on the same map?
- Are movement, collisions, speed, bomb limits, fuses, directional flames, blocked flames and chains
  enforced by the server?
- Does damage remove exactly one life, show invulnerability, and eliminate after three hits?
- Do destroyed blocks reveal all three power-up types with synchronized effects?
- Does everyone see the same winner/draw, and are results saved exactly once?
- Are disconnects, spectators and separate rooms handled without cross-talk?
- Are forged positions, lives, ids and invalid messages rejected?
- Do match/participation records have correct relationships/outcomes without duplicates?
- Does history remain after a restart?
- Do automated tests cover collisions, bomb damage, power-ups, timers, winner/draw and persistence?

## Pitfalls

- **Do not send per-player snapshots.** Build one message per room and send the same bytes to everyone.
- **Do not hold the room lock while sending or saving.** Copy state, release, then I/O.
- **Do not tick after `FINISHED`.** Latch the result and stop the scheduler for that room.
- **Do not reset a room by hand.** Create a fresh room/match; no per-game state can survive.
- **Do not trust `JOIN` twice.** An already-joined socket must not create a second membership.
- **Do not use `Math.random()`/`System.currentTimeMillis()` in the engine.** Inject the seed and feed
  time through `step(dt)`.
- **Do not mutate arrays returned to callers.** `getTiles()` returns a copy; snapshots are fresh DTOs.
- `TILES` must be sent for bomb placement, explosion, flame expiry, block destruction, power-up reveal
  and pickup. A missing one leaves a stale client forever.
- **Do not persist on every tick.** Only the completed match, once.
- **Keep entities out of the wire contract.** Map to DTOs explicitly.
- **Do not modify an applied Flyway migration.** Add a new version.
- **Do not log per snapshot.** It causes jitter and noisy evidence.
- `spring.jpa.open-in-view=false`; load the participations you need in the query/DTO.
- WebSocket `sendMessage` is not thread-safe; use a decorator/lock and handle closed sessions.
- Testcontainers needs Docker; document the fallback for unit-only runs.

## Suggested PR sequence

1. `mbenboua/backend-skeleton` — Maven, session endpoint, `/ws` JOIN/ROOM_STATE/CHAT, Flyway, protocol
   v0.1.
2. `mbenboua/rooms-and-timers` — matchmaking, phases, timers, chat limits, tests.
3. `mbenboua/game-engine` — map/movement/bombs/power-ups/damage/result + tests.
4. `mbenboua/realtime-match` — MATCH_START/TILES/SNAPSHOT/MATCH_END, tick service, disconnects, room
   isolation.
5. `mbenboua/persistence-history` — entities, transactional save, REST history/details, tests.
6. `mbenboua/hardening` — abuse checks, cleanup, full test pass, audit support.

Each PR description: what changed, how tested (commands), protocol/constant changes, and which audit
line it supports.
