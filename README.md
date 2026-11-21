# Bomberman — Angular frontend + Spring Boot backend + PostgreSQL

A 2–4 player Bomberman game. Angular renders the server-confirmed state and sends player intentions
(move, stop, place bomb); Spring Boot owns rooms, timers and game rules; PostgreSQL stores completed
matches. The full contract is in [`docs/PROTOCOL.md`](docs/PROTOCOL.md) and the rules are in
[`docs/GAME_RULES.md`](docs/GAME_RULES.md).

> **Repository status at this commit**
> This checkout contains the Angular application (`frontend/`) and the shared documentation. It does
> **not** contain `backend/`; that folder and `docs/PROTOCOL.md` are owned by mbenboua. The backend
> commands below are the documented ones from [`docs/SETUP.md`](docs/SETUP.md) and have **not** been
> executed in this checkout. Frontend commands, tests and the production build were run locally — see
> [Verified evidence](#verified-evidence).

## Explore without a backend

Run `cd frontend && npm start`, open <http://localhost:4200/nickname>, and choose **Try offline demo**.
The preview uses the existing waiting room, board, chat, results and history pages with simulated
players and results. The orange banner stays visible throughout; **Exit demo** returns to normal
server mode. The preview makes no `/api` or `/ws` request. Move with arrows/WASD, place a sample
bomb with Space, move around the fixed crate obstacles, and use **Finish sample match** to open results. Sample history exists only in this
browser session and is not PostgreSQL evidence. A refresh during a match returns to nickname.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 21, TypeScript, standalone components, routing, reactive forms, signals/RxJS |
| Rendering | HTML + CSS grid only — no canvas, WebGL, game engine or other UI framework |
| Backend | Java 21, Spring Boot 3, Spring Web/WebSocket, Spring Data JPA, Flyway |
| Database | PostgreSQL 16+ |
| Realtime | One native WebSocket per tab at `/ws`, 30 Hz server snapshots, 66 ms client interpolation |
| Frontend tests | Angular unit-test builder (Vitest + jsdom) |

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 20 LTS or newer (verified with 24.11.0) | `node -v` |
| npm | 10+ (verified with 11.20.0) | `npm -v` |
| JDK | 21 (Temurin/OpenJDK) | `java -version` |
| Maven | 3.9+ or the included `./mvnw` | `./mvnw -v` |
| PostgreSQL | 16+ | `psql --version` |
| Docker | optional, for a disposable PostgreSQL | `docker -v` |
| Browser | current Chrome/Firefox with developer tools | — |

Angular CLI is not installed globally; the `npm` scripts use the local CLI.

## 1. Database

Option A — Docker (recommended on a clean machine):

```sh
docker run --name bomberman-pg \
  -e POSTGRES_DB=bomberman \
  -e POSTGRES_USER=bomberman \
  -e POSTGRES_PASSWORD=bomberman \
  -p 5432:5432 \
  -d postgres:16
```

Option B — local PostgreSQL:

```sh
sudo -u postgres psql <<'SQL'
CREATE USER bomberman WITH PASSWORD 'bomberman';
CREATE DATABASE bomberman OWNER bomberman;
SQL
```

Flyway creates the schema (players, matches, participations) on backend startup. Do not create tables
by hand and do not edit an applied migration; add `V2__...sql` instead.

## 2. Backend

Documented in `docs/SETUP.md`; `backend/` is not present in this checkout, so these commands are **not
locally verified**.

```sh
export DB_URL='jdbc:postgresql://localhost:5432/bomberman'
export DB_USERNAME='bomberman'
export DB_PASSWORD='bomberman'
export SERVER_PORT='8080'
export CORS_ALLOWED_ORIGINS='http://localhost:4200'
export WS_ALLOWED_ORIGINS='http://localhost:4200'

cd backend
./mvnw spring-boot:run
```

- REST base: `http://localhost:8080/api`
- WebSocket: `ws://localhost:8080/ws`
- Smoke check:

```sh
curl -i -X POST http://localhost:8080/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Ada"}'
```

Expected `201` with `sessionId`, `playerId`, `nickname`, `createdAt`. Backend tests: `cd backend &&
./mvnw test` (persistence tests need Docker/Testcontainers).

## 3. Frontend

```sh
cd frontend
npm ci
npm start
```

Open <http://localhost:4200>. `npm start` is `ng serve --proxy-config proxy.conf.json`; the dev server
proxies `/api` and `/ws` to `http://localhost:8080`, so the browser uses one origin.

Production build:

```sh
cd frontend
npm run build
# output: frontend/dist/frontend/browser
```

Serve that folder with any static host (keep an SPA fallback to `index.html`), or copy it into Spring
Boot's static resources while keeping `/api` and `/ws` routed to their handlers.

## 4. Routes

| Route | Guard | Purpose |
|---|---|---|
| `/nickname` | — | create a guest session (`POST /api/sessions`), nickname validation, error/notice |
| `/waiting` | session | room id, player counter `count / 4`, synchronized timers, chat, controls |
| `/game` | session + room + match | board, HUD, chat, keyboard input, `?debug` FPS overlay |
| `/results/:matchId` | — | persisted winner/draw, participants, lives, duration, play again |
| `/history` | — | latest 20 persisted matches, empty/error states, row selection |
| `/history/:matchId` | — | persisted corners, lives and results for one match |

A refresh loses the in-memory guest session on purpose, so protected routes return to `/nickname` with
a readable reason. There is no reconnect or rejoin into an active match.

## 5. Controls

| Action | Keys |
|---|---|
| Move | Arrow keys or WASD (physical `event.code`; ZQSD works on AZERTY) |
| Place bomb | Space |
| Focus chat | Enter |
| Leave chat input | Escape |

Holding a direction keeps it held; the most recently pressed held key wins. Releasing all direction
keys sends `STOP`. Focusing chat, window blur, tab hide and elimination also send `STOP`. Typing in
chat never moves the player or places a bomb.

## 6. Gameplay constants

The server is the source of truth. Summary: 15 × 13 map, 3 lives, 4 slots in fixed corners, 30 Hz
ticks, 3 s bomb fuse, 0.5 s flames, 2 s invulnerability, 20 s waiting timer, 10 s countdown, three
power-up types. Read [`docs/GAME_RULES.md`](docs/GAME_RULES.md) for every value and edge case.

## 7. API

REST and WebSocket payloads are documented in [`docs/PROTOCOL.md`](docs/PROTOCOL.md):

- `POST /api/sessions` — create a guest session;
- `GET /api/matches?limit=20` — completed matches, newest first;
- `GET /api/matches/{matchId}` — one persisted match with corners and remaining lives;
- WebSocket messages: `JOIN`, `CHAT`, `MOVE`, `STOP`, `PLACE_BOMB` (client) and `ROOM_STATE`, `CHAT`,
  `MATCH_START`, `TILES`, `SNAPSHOT`, `MATCH_END`, `ERROR` (server).

The Angular models in `frontend/src/app/core/models/` mirror this contract. Protocol changes must update
the Java DTOs, this documentation and the Angular models in the same pull request.

## 8. Tests

```sh
cd frontend
npm test -- --watch=false
```

Covered by automated tests: session service, single-socket lifecycle including stale close callbacks,
room store transitions and chat cap, tick-to-local-clock interpolation with stale/gap/visibility snaps
and match reset, route guards, history/results pages, tile and player layers, nickname validation and
play-again prefill.

`npm run build` produces the production bundle. The audit checklist tracks which items still need a real
backend and a real 2/4-player browser run.

## 9. Verified evidence

Run on 2026-11-20 on Windows, Node 24.11.0, npm 11.20.0, Angular CLI 21.2.29:

| Command | Result |
|---|---|
| `cd frontend && npm test -- --watch=false` | 15 test files, 70 tests passed (2026-11-21) |
| `cd frontend && npm run build` | success, output `frontend/dist/frontend/browser` |

Not verified here because `backend/` is absent: real REST sessions, WebSocket multiplayer, persistence
across restart, four-player performance traces.

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `relation "players" does not exist` | Flyway did not run, or the backend points at another database/schema |
| `Connection refused` on backend startup | PostgreSQL is not running, or `DB_URL`/port/credentials are wrong |
| REST blocked by CORS | Use the Angular proxy, or add `http://localhost:4200` to `CORS_ALLOWED_ORIGINS` |
| WebSocket fails through `ng serve` | `proxy.conf.json` must keep `"ws": true` for `/ws` |
| `/waiting` or `/game` returns to nickname | Expected after a refresh: the guest session is in memory only |
| `NICKNAME_TAKEN` | Another player in the same waiting room uses that nickname; retry with another one |
| `INVALID_SESSION` on `JOIN` | Backend restarted or the session expired; create a new session |
| History empty | No completed match is persisted yet; play and finish one first |
| Port already in use | Change `SERVER_PORT`, `ng serve --port`, or stop the conflicting process |

## 11. Known limitations

- No reconnect/rejoin into an active match; a refresh creates a new guest session.
- Live rooms, chat, bombs and countdowns are in memory and are lost on backend restart.
- Rooms are one-shot; a rematch requires a new session (the nickname is pre-filled).
- Chat history is not available to late joiners.
- Bonus modes (solo/co-op, extra power-ups, team mode, ghosts) are not implemented.
- `backend/` and protocol ownership remain with mbenboua; see `docs/AUDIT_CHECKLIST.md` for pending
  integration evidence.

## 12. Project layout

```text
README.md                     this file
bomberman-springboot-angular.md   original subject
docs/                         architecture, rules, protocol, setup, tasks, audit checklist
frontend/                     Angular application (Es-sadkia)
backend/                      Spring Boot application (mbenboua) — not in this checkout
```

Frontend details, structure and rendering rules: [`frontend/README.md`](frontend/README.md).
