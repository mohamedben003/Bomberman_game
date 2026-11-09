# SETUP — local development and verification

This is the source for the root `README.md` (owned by Es-sadkia). Exact commands must work on a clean
machine with the prerequisites below.

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| JDK | 21 (Temurin/OpenJDK) | `java -version` |
| Maven | 3.9+ or the included `./mvnw` | `./mvnw -v` |
| Node.js | 20 LTS or newer | `node -v` |
| npm | 10+ | `npm -v` |
| PostgreSQL | 16+ | `psql --version` |
| Docker | optional, for Testcontainers and a disposable PostgreSQL | `docker -v` |
| Browser | current Chrome/Firefox with DevTools | — |

Angular CLI does not need a global install: use `npx ng` or the `npm` scripts in `frontend/`.

## 2. Database

### Option A — Docker (recommended for a clean machine)

```sh
docker run --name bomberman-pg \
  -e POSTGRES_DB=bomberman \
  -e POSTGRES_USER=bomberman \
  -e POSTGRES_PASSWORD=bomberman \
  -p 5432:5432 \
  -d postgres:16
```

### Option B — local PostgreSQL

```sh
sudo -u postgres psql <<'SQL'
CREATE USER bomberman WITH PASSWORD 'bomberman';
CREATE DATABASE bomberman OWNER bomberman;
SQL
```

Flyway creates the schema on backend startup. Do not create tables by hand and do not change an
already-applied migration; add `V2__...sql` instead.

Tables created by `V1__init.sql`:

- `players` — guest player id, nickname, creation time;
- `matches` — completed match id, start/end, outcome, winner;
- `participations` — match/player link, corner, remaining lives, result, unique `(match_id,
  player_id)`.

## 3. Configuration

The backend reads environment variables; no credentials are committed. `application.yml` contains the
same keys and safe local defaults, except the username/password which must come from the environment.
`application-example.yml` documents every key without real credentials:

```sh
cp backend/src/main/resources/application-example.yml backend/src/main/resources/application-local.yml
```

If you use `application-local.yml`, activate it explicitly for your run:

```sh
SPRING_PROFILES_ACTIVE=local ./mvnw spring-boot:run
```

`application-example.yml` contents (placeholders only):

```yaml
spring:
  datasource:
    url: ${DB_URL:jdbc:postgresql://localhost:5432/bomberman}
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
  jpa:
    hibernate:
      ddl-auto: validate
    open-in-view: false
  flyway:
    enabled: true

server:
  port: ${SERVER_PORT:8080}

app:
  cors:
    allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:4200}
  websocket:
    allowed-origins: ${WS_ALLOWED_ORIGINS:http://localhost:4200}
```

Export the variables (or use your IDE run configuration):

```sh
export DB_URL='jdbc:postgresql://localhost:5432/bomberman'
export DB_USERNAME='bomberman'
export DB_PASSWORD='bomberman'
export SERVER_PORT='8080'
export CORS_ALLOWED_ORIGINS='http://localhost:4200'
export WS_ALLOWED_ORIGINS='http://localhost:4200'
```

`application-local.yml` and `.env` files must be in `.gitignore`. Never commit a real password.

## 4. Run the backend

```sh
cd backend
./mvnw spring-boot:run
```

- REST base: `http://localhost:8080/api`.
- WebSocket: `ws://localhost:8080/ws`.
- Flyway runs before JPA validation. A schema mismatch fails startup instead of silently altering
  tables.
- Quick check:

```sh
curl -i -X POST http://localhost:8080/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Ada"}'
```

Expected: `201` with `sessionId`, `playerId`, `nickname`, `createdAt`.

## 5. Run the frontend

```sh
cd frontend
npm ci
npm start
```

`npm start` runs `ng serve --proxy-config proxy.conf.json`. Open `http://localhost:4200`.

`proxy.conf.json`:

```json
{
  "/api": {
    "target": "http://localhost:8080",
    "secure": false,
    "changeOrigin": true
  },
  "/ws": {
    "target": "ws://localhost:8080",
    "ws": true,
    "secure": false
  }
}
```

Using the proxy keeps REST and WebSocket on the same origin (`http://localhost:4200`) and avoids CORS
surprises. Direct calls to `http://localhost:8080` are also supported through
`CORS_ALLOWED_ORIGINS`.

Production build:

```sh
cd frontend
npm run build
# output: dist/bomberman/browser/
```

You can serve the output with any static server or copy it into the Spring Boot static resources. If
served by Spring Boot, add an SPA fallback so Angular routes return `index.html`; the API/WS paths must
still reach their handlers. For the evaluation, two dev servers are sufficient.

## 6. Two-player / four-player test

1. Start PostgreSQL, backend and frontend.
2. Open `http://localhost:4200` in a normal window and in a private window.
3. Join with two different nicknames.
4. Confirm the counter shows `2 / 4` in both windows and chat is delivered both ways.
5. Wait 20 seconds → a 10-second countdown must appear in both windows.
6. Repeat with four windows; the countdown must start immediately when the fourth joins.
7. Play: arrows/WASD move, Space places a bomb, Enter focuses chat, Escape leaves chat.
8. Finish a match, open the results page, then check `/history`.

Controls are displayed before play on the waiting page:

| Action | Keys |
|---|---|
| Move | Arrow keys or WASD (physical keys; ZQSD works on AZERTY) |
| Place bomb | Space |
| Focus chat | Enter |
| Leave chat input | Escape |

Debug performance overlay: append `?debug` to the game URL. It refreshes at most four times per second.

## 7. Tests

Backend:

```sh
cd backend
./mvnw test
```

- Pure unit tests: map generation, movement/collision, bombs/flames/chains, power-ups, damage/respawn,
  match result, lobby timers, message validation.
- Persistence/integration tests use Testcontainers PostgreSQL. Docker must be running; if Docker is not
  available, run the unit tests only and record that limitation in the audit checklist.

Frontend:

```sh
cd frontend
npm test -- --watch=false
```

Focused tests: session service, WebSocket service (no duplicate connections), room store transitions,
snapshot interpolation (regular/irregular/stale/visibility reset), route guards.

Manual evidence is recorded in [`AUDIT_CHECKLIST.md`](AUDIT_CHECKLIST.md). Automated tests supplement,
not replace, a real four-player browser run.

## 8. Useful commands

```sh
# Backend only
cd backend && ./mvnw spring-boot:run
cd backend && ./mvnw test

# Frontend only
cd frontend && npm start
cd frontend && npm run build

# Database shell
psql "postgresql://bomberman:bomberman@localhost:5432/bomberman"

# Stop/remove the disposable database
docker rm -f bomberman-pg
```

## 9. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `relation "players" does not exist` | Flyway did not run, or the app points to another database/schema |
| `Schema-validation: missing table` | `ddl-auto=validate` and migration mismatch; run Flyway, do not create tables manually |
| `Connection refused` on startup | PostgreSQL not running, wrong `DB_URL`/port, wrong credentials |
| REST calls blocked by CORS | Use the Angular proxy or add `http://localhost:4200` to `CORS_ALLOWED_ORIGINS` |
| WebSocket fails through `ng serve` | `proxy.conf.json` must set `"ws": true` for `/ws`; use the same path in the client |
| `401`/`403` on WebSocket handshake | No auth filter is expected; check the proxy path, `WS_ALLOWED_ORIGINS`, and that `/ws` is registered |
| `INVALID_SESSION` on `JOIN` | Backend restarted or session TTL expired; create a new session from the nickname page |
| `NICKNAME_TAKEN` | Another player in the same waiting room uses that nickname; retry with another one |
| Countdown does not update | Check that `ROOM_STATE` is arriving; the client must not run its own phase timer |
| Angular deep link returns 404 in production | Add the SPA fallback to `index.html` on the static host |
| Testcontainers fails | Docker daemon is not running; start it or run unit tests only |
| Port already in use | Change `SERVER_PORT`, `ng serve --port`, or stop the conflicting process |

## 10. Documentation checklist for the root README

The final root `README.md` must contain:

- prerequisites and versions;
- database creation and configuration (no secrets);
- exact backend and frontend startup commands;
- the Angular proxy note;
- controls;
- chosen gameplay constants (or a link to `GAME_RULES.md`);
- REST and WebSocket documentation (or a link to `PROTOCOL.md`);
- test commands;
- a short troubleshooting section.

Keep the README consistent with this file. If a command changes, update both in the same PR.
