# AUDIT_CHECKLIST — evidence for the evaluation

Owner: **Es-sadkia**. Backend evidence is supplied by **mbenboua**. Record browser, OS, viewport,
player count, recording duration and trace/screenshot links for every manual run. Automated tests
supplement real-browser evidence; they do not replace it.

## 1. Evidence log

| Run | Date | Environment | Players | What was checked | Result / link |
|---|---|---|---|---|---|
| R1 | | | | | |
| R2 | | | | | |
| R3 | | | | | |

Environment template: browser + version, OS, viewport, display refresh rate, backend commit, frontend
commit, PostgreSQL version, Docker/Testcontainers used or not.

## 2. Functional checks

| # | Check | How to test / expected result | Owner | Status / evidence |
|---|---|---|---|---|
| F1 | README startup | On a clean machine, follow the root README: PostgreSQL, `./mvnw spring-boot:run`, `npm ci && npm start`. Both apps start and the nickname page loads. | mbenboua + Es-sadkia | Pending |
| F2 | Required stack and separation | Inspect sources: Spring Boot controllers/WS handlers, services, repositories, JPA entities; Angular pages/components/services; HTML/CSS board. No canvas/WebGL/other UI framework. | both | Pending |
| F3 | Nickname required | Empty/whitespace and > 20 characters rejected locally and by the API. A valid nickname creates a guest session. | Es-sadkia + mbenboua | Pending |
| F4 | Duplicate nickname | Two users in the same waiting room try the same nickname, including a case-only difference (`Ada`/`ada`); the second `JOIN` returns `NICKNAME_TAKEN` and the nickname page shows it. | both | Pending |
| F5 | Counter and chat | Two browsers/private windows join; both show the same `2 / 4` counter and exchange room chat immediately over WebSockets. | both | Pending |
| F6 | Two/three-player timer | With 2 or 3 players, wait 20 s: a 10 s countdown appears in every window, then the match starts together. | both | Pending |
| F7 | Four-player timer | With 4 players, the 10 s countdown starts immediately when the fourth joins, without waiting 20 s. | both | Pending |
| F8 | One player waiting | With one player, the room keeps waiting past 20 s. The next join that makes two starts a 10 s countdown. | mbenboua + Es-sadkia | Pending |
| F9 | Countdown cancellation | During countdown, make it fall below two players: countdown cancels, admission reopens, and a fresh 10 s countdown starts when two are present again. | both | Pending |
| F10 | Admission closed | A new player joining during countdown/play enters another waiting room, not the active room. | both | Pending |
| F11 | Same map and corners | All players receive the same 15×13 map and start in different safe corners (slot order documented). | both | Pending |
| F12 | Movement and collisions | Move with arrows/WASD; walls, blocks and bombs block; players may share a tile; speed is server-enforced; the whole map is visible without scrolling. | Es-sadkia + mbenboua | Pending |
| F13 | Bomb placement and limits | Space places a bomb on the player's floor cell if the active-bomb limit allows; a bomb cannot be placed on an occupied cell; the owner can leave the bomb but cannot walk back through it. | both | Pending |
| F14 | Fuse and flames | Bomb explodes after ~3 s; flames extend range in four directions, stop at walls, destroy the first block and stop, and last ~0.5 s. | mbenboua | Pending |
| F15 | Chain reactions | A flame triggers another bomb in the same tick; each bomb resolves once; clients receive the final tile array in order. | both | Pending |
| F16 | Damage and invulnerability | Standing on/near an own or foreign bomb removes exactly one life; the player respawns at the corner/nearest free tile with a visible 2 s invulnerability; overlapping flames do not remove more lives. | both | Pending |
| F17 | Elimination | Lose all three lives: the player is eliminated, cannot move/place bombs, can still watch and chat, and sees spectator feedback. | Es-sadkia + mbenboua | Pending |
| F18 | Power-ups | Destroy blocks until bombs/flames/speed appear; at least three types; walking on one collects it once, removes it for everyone, and applies the documented effect/cap. | both | Pending |
| F19 | Winner/draw | Finish a match: all clients see the same winner or draw, and the last surviving rule is correct. | both | Pending |
| F20 | Disconnect during match | Kill/refresh one player: remaining lives are forfeited, a system message is shown, the winner check runs, and other players continue. | both | Pending |
| F21 | Room isolation | Run two matches simultaneously (four+ players or two sets of browsers); no chat, state or result crosses rooms. A client cannot act for another player. | mbenboua + Es-sadkia | Pending |
| F22 | Invalid/forged messages | Send forged positions/lives/player ids, unknown types, malformed JSON, an oversized frame and binary frames: server rejects/ignores without changing valid state or crashing. | mbenboua | Pending |
| F23 | Loading/error UX | Stop the backend or drop the socket: visible connection error, gameplay stops, protected routes return to nickname with an explanation. | Es-sadkia | Pending |
| F24 | Results page | After `MATCH_END`, the results page shows winner/draw, participants, lives, results and duration from PostgreSQL. | Es-sadkia + mbenboua | Pending |
| F25 | History page | `/history` lists the latest 20 completed matches newest first; selecting one shows details; empty state and loading/error states are visible. | Es-sadkia | Pending |
| F26 | Navigation cleanup | Repeat waiting → game → results → new session several times; no duplicate sockets, duplicate messages, stale timers, keyboard listeners or rAF loops. | Es-sadkia | Pending |

## 3. Persistence checks

| # | Check | How to test / expected result | Owner | Status / evidence |
|---|---|---|---|---|
| P1 | Relationships and constraints | Inspect `V1__init.sql`: PKs, FKs, required fields, checks, unique `(match_id, player_id)`, outcome/winner consistency. | mbenboua | Pending |
| P2 | Save exactly once | Complete a match; exactly one `matches` row and one participation per player. Repeat completion/hard-refresh cannot duplicate. | mbenboua | Pending |
| P3 | Correct outcomes | Winner, eliminated, disconnected and draw rows match the match result; a draw marks connected final-update players `DRAW` and preserves earlier results. | mbenboua | Pending |
| P4 | Duration | Duration is derived from `started_at`/`ended_at`; no separate inconsistent duration column. | mbenboua | Pending |
| P5 | History survives restart | Finish a match, stop/restart Spring Boot, load `/history` and the result URL; data is still correct. | both | Pending |
| P6 | Live state not persisted | Rooms, chat, bombs, positions and countdowns are absent from the database; restarting does not restore a live match. | mbenboua | Pending |
| P7 | Automated tests | `./mvnw test` covers collisions, bomb damage, power-ups, matchmaking timers, winner/draw and saving a complete result. | mbenboua | Pending |
| P8 | Frontend tests | `npm test -- --watch=false` covers session/socket/store/guards/interpolation; `npm run build` succeeds. | Es-sadkia | Pending |

## 4. Performance checks

| # | Check | How to test / expected result | Owner | Status / evidence |
|---|---|---|---|---|
| R1 | FPS overlay | Open the game with `?debug`; FPS, average/max frame time and long-frame counts show and refresh at most 4×/s. | Es-sadkia | Pending |
| R2 | DevTools Performance | Record 10 s of a foreground four-player match with bombs/chat. Around 60 fps (or the display refresh), no sustained drops; save the trace with hardware/browser details. | Es-sadkia + mbenboua | Pending |
| R3 | Paint flashing | Paint flashing ON: changed tiles may paint; moving sprites should be composited; unchanged board/HUD/chat should not repeatedly paint. | Es-sadkia | Pending |
| R4 | Layers | Layers panel: few layers; only player sprites (and a few bombs) promoted; never 195 cell layers. | Es-sadkia | Pending |
| R5 | JS per frame | Performance panel/scripting: frame work is well under ~4 ms; no layout reads in the rAF loop. | Es-sadkia | Pending |
| R6 | Memory/listeners | Repeated matches/navigation: no growing listener/subscription/snapshot arrays, no duplicate sockets or loops. | Es-sadkia | Pending |

Tips: close unrelated tabs/apps/extensions, record the foreground tab (background tabs throttle rAF),
use separate devices for four real players where possible, and treat debug numbers as a supplement to
DevTools recordings.

## 5. Source-inspection checks

| # | Check | How to test / expected result | Owner | Status / evidence |
|---|---|---|---|---|
| S1 | No canvas/WebGL | Search runtime frontend sources for `canvas`, `getContext`, `webgl`, `WebGL`, and game-engine imports; inspect matches. | Es-sadkia | Pending |
| S2 | No other UI framework | `frontend/package.json` and imports contain Angular only (plus Angular/RxJS tooling); no React/Vue/Svelte/game engine. | Es-sadkia | Pending |
| S3 | Text rendering | User/chat names/messages use interpolation/text, not `innerHTML`; the board is HTML/CSS, not canvas or WebGL. | Es-sadkia | Pending |
| S4 | Backend separation | Controllers/WS handlers do not contain game rules; services orchestrate; entities are not returned directly; repositories are the only JPA access. | mbenboua | Pending |
| S5 | Server authority | Search for client-supplied positions/lives/results; actions carry only intentions and the server derives the player from the socket session. | mbenboua | Pending |
| S6 | No polling | Live membership/chat/game use WebSockets; REST is limited to sessions, history and details. | both | Pending |

## 6. Bonus checks (optional)

| # | Check | How to test / expected result | Owner | Status / evidence |
|---|---|---|---|---|
| B1 | Solo + Co-Op | Backend AI opponents; solo/co-op win conditions work and appear in results/history. | both | Not planned |
| B2 | Extra power-ups | At least two of bomb push/pass, block pass, detonator, 1-up implemented server-side with UI and history support. | both | Not planned |
| B3 | Drop after death | Losing a life drops a power-up according to the documented rule. | both | Not planned |
| B4 | Team mode | 2v2 with a recorded winning team in results/history. | both | Not planned |
| B5 | Ghost interaction | Eliminated players become ghosts with revive/permanent-death rules. | both | Not planned |

Bonus modes must remain server-authoritative; do not implement them only in Angular.

## 7. Release gate

- [ ] F1–F26 pass in a real 2-player run and a real 4-player run (or clearly documented limitations).
- [ ] P1–P8 pass, including a backend restart.
- [ ] R1–R6 pass with traces/screenshots linked.
- [ ] S1–S6 pass.
- [ ] Root README commands work from a clean checkout.
- [ ] `./mvnw test` and `npm test -- --watch=false` pass; `npm run build` succeeds.
- [ ] No `legacy-node` document or `FRAMEWORK_PATCH` is referenced by the new implementation.
- [ ] The final response/PR lists known limitations and the exact environment used.

## 8. Known limitations to state explicitly

- No reconnect/rejoin into an active match; refresh creates a new guest session.
- Live rooms, chat, bombs and countdowns are in memory and are lost on backend restart.
- Rooms are one-shot; a rematch requires a new session.
- Chat history is not available to late joiners.
- Testcontainers persistence tests require Docker; unit-only runs must be recorded as such.
