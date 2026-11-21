# AUDIT_CHECKLIST — evidence for the evaluation

Owner: **Es-sadkia**. Backend evidence is supplied by **mbenboua**. Record browser, OS, viewport,
player count, recording duration and trace/screenshot links for every manual run. Automated tests
supplement real-browser evidence; they do not replace it.

> **Checkout note (2026-11-20):** this clone contains `frontend/` and the shared docs, but **no
> `backend/`**. Every multiplayer, persistence and live-performance row below therefore stays
> pending until the backend branch is merged into a checkout used for the audit. Frontend-only
> evidence is recorded honestly and labelled as such; unit-test fixtures are not presented as a real
> two- or four-player run.

## 1. Evidence log

| Run | Date | Environment | Players | What was checked | Result / link |
|---|---|---|---|---|---|
| E1 | 2026-11-21 | Windows 11 build 26300, Node 24.11.0, npm 11.20.0, Angular CLI 21.2.29, Vitest 4.1.12, headless jsdom | 0 (tests) | `npm test -- --watch=false` in `frontend/` | 15 files / 68 tests passed, exit 0; see §9 |
| E2 | 2026-11-21 | same as E1 | 0 (build) | `npm run build` in `frontend/` | success, exit 0, output `frontend/dist/frontend/browser`; see §9 |
| E3 | 2026-11-20 | Chrome 157, 1280×720, DPR 1, `ng serve` on port 4210, **no backend** | 1 synthetic | `/`, `/game` guard, blank nickname validation, `/history` error, session error | Pages rendered; guard redirected to `/nickname?reason=...`; blank nickname showed "Enter a nickname."; `/history` showed "Could not load the history" with retry; POST `/api/sessions` showed a visible error. Synthetic, not multiplayer. |
| E4 | 2026-11-20 | source tree, `frontend/` | 0 | Runtime search for `canvas`, `getContext`, `WebGL`, `innerHTML`; dependency inventory | No runtime matches; only explanatory comments. Angular/RxJS only. See S1–S3. |
| E5 | 2026-11-21 | built-in Browser, local dev server on port 4211, **no backend** | 1 simulated + 1 sample player | Explicit offline demo: nickname → waiting/countdown → game movement, bomb and chat → results/history/details → play again → exit | Preview completed. Sprite transform changed from `translate(100%, 100%)` to `translate(190%, 100%)` after held Right; bomb tile appeared; canned reply, result and history/detail appeared. Exit returned to normal nickname. This is simulated UI evidence, not multiplayer/persistence evidence. |

Environment template for real runs: browser + version, OS, viewport, display refresh rate, backend
commit, frontend commit, PostgreSQL version, Docker/Testcontainers used or not. For E3 the backend
commit is absent because `backend/` is not in this checkout.

## 2. Functional checks

| # | Check | How to test / expected result | Owner | Status / evidence |
|---|---|---|---|---|
| F1 | README startup | On a clean machine, follow the root README: PostgreSQL, `./mvnw spring-boot:run`, `npm ci && npm start`. Both apps start and the nickname page loads. | mbenboua + Es-sadkia | **Frontend browser check 2026-11-20; tests/build 2026-11-21** (`ng serve` on port 4210, `npm test`, `npm run build`). `npm ci` was not re-run on the already-installed tree. Backend absent, so clean-machine end-to-end remains pending. |
| F2 | Required stack and separation | Inspect sources: Spring Boot controllers/WS handlers, services, repositories, JPA entities; Angular pages/components/services; HTML/CSS board. No canvas/WebGL/other UI framework. | both | **Frontend pass:** Angular 21 only, standalone components, HTML/CSS board. Backend inspection pending. |
| F3 | Nickname required | Empty/whitespace and > 20 characters rejected locally and by the API. A valid nickname creates a guest session. | Es-sadkia + mbenboua | **Frontend pass:** trimmed required/max/control-character validators covered by 4 nickname tests; browser check showed "Enter a nickname." for spaces. API rejection pending. |
| F4 | Duplicate nickname | Two users in the same waiting room try the same nickname, including a case-only difference (`Ada`/`ada`); the second `JOIN` returns `NICKNAME_TAKEN` and the nickname page shows it. | both | **Frontend ready:** fatal `JOIN` errors navigate to `/nickname?reason=...`; needs two real clients. |
| F5 | Counter and chat | Two browsers/private windows join; both show the same `2 / 4` counter and exchange room chat immediately over WebSockets. | both | **Frontend ready:** counter/chat components and socket path exist; real two-client run pending. |
| F6 | Two/three-player timer | With 2 or 3 players, wait 20 s: a 10 s countdown appears in every window, then the match starts together. | both | **Frontend ready:** countdown renders server timestamps; real run pending. |
| F7 | Four-player timer | With 4 players, the 10 s countdown starts immediately when the fourth joins, without waiting 20 s. | both | **Frontend ready:** same server-timer rendering; real run pending. |
| F8 | One player waiting | With one player, the room keeps waiting past 20 s. The next join that makes two starts a 10 s countdown. | mbenboua + Es-sadkia | Pending (backend timing). |
| F9 | Countdown cancellation | During countdown, make it fall below two players: countdown cancels, admission reopens, and a fresh 10 s countdown starts when two are present again. | both | Pending (backend timing + real run). |
| F10 | Admission closed | A new player joining during countdown/play enters another waiting room, not the active room. | both | Pending (backend matchmaking). |
| F11 | Same map and corners | All players receive the same 15×13 map and start in different safe corners (slot order documented). | both | **Frontend ready:** 195-cell HTML/CSS grid and corner/slot rendering tested; real four-client comparison pending. |
| F12 | Movement and collisions | Move with arrows/WASD; walls, blocks and bombs block; players may share a tile; speed is server-enforced; the whole map is visible without scrolling. | Es-sadkia + mbenboua | **Frontend pass:** physical-key input, held-direction stack, MOVE/STOP rules reviewed and unit-tested; collisions and speed are backend-owned and pending. |
| F13 | Bomb placement and limits | Space places a bomb on the player's floor cell if the active-bomb limit allows; a bomb cannot be placed on an occupied cell; the owner can leave the bomb but cannot walk back through it. | both | **Frontend pass:** exactly one `PLACE_BOMB` per physical press after `MATCH_START` and a live snapshot, blocked when eliminated/disconnected; legality pending backend. |
| F14 | Fuse and flames | Bomb explodes after ~3 s; flames extend range in four directions, stop at walls, destroy the first block and stop, and last ~0.5 s. | mbenboua | Pending (backend). |
| F15 | Chain reactions | A flame triggers another bomb in the same tick; each bomb resolves once; clients receive the final tile array in order. | both | Pending (backend). |
| F16 | Damage and invulnerability | Standing on/near an own or foreign bomb removes exactly one life; the player respawns at the corner/nearest free tile with a visible 2 s invulnerability; overlapping flames do not remove more lives. | both | **Frontend ready:** renders server lives/state; damage/respawn rules pending backend. |
| F17 | Elimination | Lose all three lives: the player is eliminated, cannot move/place bombs, can still watch and chat, and sees spectator feedback. | Es-sadkia + mbenboua | **Frontend ready:** dead players lose input, keep chat, and see spectator feedback; real elimination pending. |
| F18 | Power-ups | Destroy blocks until bombs/flames/speed appear; at least three types; walking on one collects it once, removes it for everyone, and applies the documented effect/cap. | both | Pending (backend rules; frontend renders server tiles). |
| F19 | Winner/draw | Finish a match: all clients see the same winner or draw, and the last surviving rule is correct. | both | **Frontend ready:** `MATCH_END` stops input/loop and navigates to persisted results; live winner rule pending backend. |
| F20 | Disconnect during match | Kill/refresh one player: remaining lives are forfeited, a system message is shown, the winner check runs, and other players continue. | both | **Frontend ready:** socket close stops gameplay, releases keys and shows a banner/back action; forfeit rule pending backend. |
| F21 | Room isolation | Run two matches simultaneously (four+ players or two sets of browsers); no chat, state or result crosses rooms. A client cannot act for another player. | mbenboua + Es-sadkia | Pending (backend + real run). |
| F22 | Invalid/forged messages | Send forged positions/lives/player ids, unknown types, malformed JSON, an oversized frame and binary frames: server rejects/ignores without changing valid state or crashing. | mbenboua | Pending (backend). Frontend sends intentions only. |
| F23 | Loading/error UX | Stop the backend or drop the socket: visible connection error, gameplay stops, protected routes return to nickname with an explanation. | Es-sadkia | **Frontend pass (synthetic):** browser run without backend showed visible session/history errors; `/game` redirected with a reason; live socket drop still needs a backend. |
| F24 | Results page | After `MATCH_END`, the results page shows winner/draw, participants, lives, results and duration from PostgreSQL. | Es-sadkia + mbenboua | **Frontend pass (fixtures):** live mode reloads `GET /api/matches/{id}`; the explicit offline demo reads labelled local sample results. Loading/404/error states are covered by tests. Live persistence pending. |
| F25 | History page | `/history` lists the latest 20 completed matches newest first; selecting one shows details; empty state and loading/error states are visible. | Es-sadkia | **Frontend pass (fixtures + browser):** list/detail pages, empty/error/loading states; browser showed the error state without a backend. Live data pending. |
| F26 | Navigation cleanup | Repeat waiting → game → results → new session several times; no duplicate sockets, duplicate messages, stale timers, keyboard listeners or rAF loops. | Es-sadkia | **Frontend reviewed/tested:** real router tests confirm waiting → history keeps its destination and closes the room, while `MATCH_START` → game keeps the socket and first snapshot; loop/listener cleanup and park-on-end are unit-tested. Repeated live matches still pending. |

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
| P8 | Frontend tests | `npm test -- --watch=false` covers session/socket/store/guards/interpolation/input/navigation and isolated offline demo; `npm run build` succeeds. | Es-sadkia | **Pass 2026-11-21:** 15 files / 68 tests passed (exit 0); production build succeeded (exit 0). Exact output in §9. |

## 4. Performance checks

| # | Check | How to test / expected result | Owner | Status / evidence |
|---|---|---|---|---|
| R1 | FPS overlay | Open the game with `?debug`; FPS, average/max frame time and long-frame counts show and refresh at most 4×/s. | Es-sadkia | **Implemented and unit-reviewed; capture pending** because no backend/match can start in this checkout. |
| R2 | DevTools Performance | Record 10 s of a foreground four-player match with bombs/chat. Around 60 fps (or the display refresh), no sustained drops; save the trace with hardware/browser details. | Es-sadkia + mbenboua | Pending (needs four players + backend). |
| R3 | Paint flashing | Paint flashing ON: changed tiles may paint; moving sprites should be composited; unchanged board/HUD/chat should not repeatedly paint. | Es-sadkia | Pending (needs live match trace). |
| R4 | Layers | Layers panel: few layers; only player sprites (and a few bombs) promoted; never 195 cell layers. | Es-sadkia | Pending (needs live match trace). |
| R5 | JS per frame | Performance panel/scripting: frame work is well under ~4 ms; no layout reads in the rAF loop. | Es-sadkia | **Code reviewed:** no layout reads in the loop; measurement pending. |
| R6 | Memory/listeners | Repeated matches/navigation: no growing listener/subscription/snapshot arrays, no duplicate sockets or loops. | Es-sadkia | **Code reviewed/unit-tested** (32-snapshot cap, generation-safe socket, listener cleanup); multi-match browser measurement pending. |

Tips: close unrelated tabs/apps/extensions, record the foreground tab (background tabs throttle rAF),
use separate devices for four real players where possible, and treat debug numbers as a supplement to
DevTools recordings.

## 5. Source-inspection checks

| # | Check | How to test / expected result | Owner | Status / evidence |
|---|---|---|---|---|
| S1 | No canvas/WebGL | Search runtime frontend sources for `canvas`, `getContext`, `webgl`, `WebGL`, and game-engine imports; inspect matches. | Es-sadkia | **Pass:** search over `frontend/src/**/*.{ts,html}` found only two explanatory comments; no `<canvas>`, `getContext`, WebGL or engine import. |
| S2 | No other UI framework | `frontend/package.json` and imports contain Angular only (plus Angular/RxJS tooling); no React/Vue/Svelte/game engine. | Es-sadkia | **Pass:** dependencies are Angular, RxJS and tslib; dev tooling is Angular CLI/build, TypeScript, Vitest, jsdom, Prettier. |
| S3 | Text rendering | User/chat names/messages use interpolation/text, not `innerHTML`; the board is HTML/CSS, not canvas or WebGL. | Es-sadkia | **Pass:** chat/player text uses interpolation; the 195 cells are HTML elements in two layers; no runtime `innerHTML`. |
| S4 | Backend separation | Controllers/WS handlers do not contain game rules; services orchestrate; entities are not returned directly; repositories are the only JPA access. | mbenboua | Pending (`backend/` absent). |
| S5 | Server authority | Search for client-supplied positions/lives/results; actions carry only intentions and the server derives the player from the socket session. | mbenboua | **Frontend pass:** client sends `JOIN`/`CHAT`/`MOVE`/`STOP`/`PLACE_BOMB` only, never positions, lives or results. Backend enforcement pending. |
| S6 | No polling | Live membership/chat/game use WebSockets; REST is limited to sessions, history and details. | both | **Frontend pass:** no timer-based polling; REST use is `POST /api/sessions`, `GET /api/matches`, `GET /api/matches/{id}`. Backend check pending. |

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
  *Frontend-ready rows are marked above; every live row still needs `backend/`.*
- [ ] P1–P8 pass, including a backend restart. *P8 (frontend tests/build) passes; P1–P7 are backend.*
- [ ] R1–R6 pass with traces/screenshots linked. *Implementation reviewed; no live trace yet.*
- [ ] S1–S6 pass. *S1–S3 and the frontend half of S5/S6 pass; backend rows pending.*
- [ ] Root README commands work from a clean checkout. *Frontend commands verified here; backend commands are documented only.*
- [ ] `./mvnw test` and `npm test -- --watch=false` pass; `npm run build` succeeds.
  *`npm test -- --watch=false` and `npm run build` pass on 2026-11-21; `backend/` and its Maven wrapper are absent, so `./mvnw test` was not run.*
- [ ] No `legacy-node` document or `FRAMEWORK_PATCH` is referenced by the new implementation. *No reference found in the frontend or docs.*
- [ ] The final response/PR lists known limitations and the exact environment used. *This file and the root README do.*

## 8. Known limitations to state explicitly

- No reconnect/rejoin into an active match; refresh creates a new guest session.
- Live rooms, chat, bombs and countdowns are in memory and are lost on backend restart.
- Rooms are one-shot; a rematch requires a new session.
- Chat history is not available to late joiners.
- Testcontainers persistence tests require Docker; unit-only runs must be recorded as such.
- `backend/` is not present in this checkout, so no real REST session, WebSocket match, PostgreSQL
  persistence, disconnect, four-player FPS/paint/layer trace or backend restart was exercised here.
- Frontend tests use explicit request/response fixtures for history and results; they prove the UI
  states and contract mapping, not that the backend actually persists those rows.
- Bonus modes remain unimplemented and out of scope.

## 9. Frontend evidence detail (2026-11-21)

Environment: Windows 11 build 26300, Node 24.11.0, npm 11.20.0, Angular CLI 21.2.29, Angular 21.2,
Vitest 4.1.12, jsdom. Commands run in `C:\Users\leno\Desktop\M2I\S3\Full_Stake\Bomberman_game\frontend`.

| Command | Output | Exit |
|---|---|---|
| `npm test -- --watch=false` | `Test Files 15 passed (15)`, `Tests 68 passed (68)`, duration 19.61 s | 0 |
| `npx tsc --noEmit -p tsconfig.app.json` | No diagnostics | 0 |
| `npm run build` | `Application bundle generation complete`, output `frontend/dist/frontend/browser` | 0 |

Automated coverage by file (68 tests): app shell (2), single-socket lifecycle incl. stale close
callbacks and a session change (7), tick/clock interpolation, stale/gap/visibility snaps and reset (11), room store
transitions/chat/retry/park (8), session + nickname prefill (3), history REST mapping (2), route
guards (5), nickname page validation/errors (4), waiting page disconnect/real routing (3), game page
input, disconnect, navigation, loop and match-end behavior (8), offline demo isolation/lifecycle (3), history page
states (4), results page states (3), tile layer (3), players layer (2).

Browser check (Chrome 157, 1280×720, dev server on port 4210, no backend):

- `/` rendered the nickname page; a blank/whitespace nickname showed "Enter a nickname.".
- `/game` redirected to `/nickname?reason=Your%20session%20ended...`, and the reason was visible.
- `/history` showed "Could not load the history" with "Try again"; the proxy logged
  `ECONNREFUSED` to `/api/matches?limit=20`.
- Submitting a nickname showed a visible session-creation error; the proxy logged `ECONNREFUSED` to
  `/api/sessions`.
- No real match, chat, countdown, disconnect or persisted row could be observed without the backend.

Source inspection: `frontend/src` has 14 spec files, and runtime search found
no `<canvas>`, `getContext`, WebGL or `innerHTML` use (only explanatory comments). `package.json`
dependencies are `@angular/*`, `rxjs` and `tslib`.
