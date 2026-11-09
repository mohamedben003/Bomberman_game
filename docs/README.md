# bomberman-springboot-angular — documentation

Canonical documentation for the **Spring Boot + Angular + PostgreSQL** version of Bomberman.
The old Node.js/mini-framework documents are kept in [`legacy-node/`](legacy-node/) for reference
only; they do **not** describe this stack. There is no framework-patch step in the new plan: Angular
and Spring Boot are used as standard frameworks.

## Read order

1. [`../bomberman-springboot-angular.md`](../bomberman-springboot-angular.md) — subject and evaluation criteria.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — system shape, packages, state ownership, performance and milestones.
3. [`GAME_RULES.md`](GAME_RULES.md) — exact gameplay constants, map, bomb, damage, power-up and lobby rules.
4. [`PROTOCOL.md`](PROTOCOL.md) — REST endpoints and WebSocket message contracts.
5. [`SETUP.md`](SETUP.md) — local PostgreSQL, backend, frontend, proxy and test commands.
6. Your task file: [`TASKS_MBENBOUA.md`](TASKS_MBENBOUA.md) or [`TASKS_ES_SADKIA.md`](TASKS_ES_SADKIA.md).
7. [`AUDIT_CHECKLIST.md`](AUDIT_CHECKLIST.md) — how every subject requirement is demonstrated.

If documents disagree, the subject wins, then `PROTOCOL.md`, then `ARCHITECTURE.md`.
Update the documents and their consumers in the same pull request.

## Stack and scope

| Layer | Technology | Notes |
|---|---|---|
| Backend | Java 21 + Spring Boot 3 | REST, raw WebSocket handler, authoritative game loop, in-memory rooms |
| Frontend | Angular (current stable) + TypeScript | Standalone components, routing, reactive forms, signals, services |
| Database | PostgreSQL 16+ | Players, completed matches and participations; Flyway migrations |
| Real time | Native WebSocket, JSON envelope `{type,data}` | No STOMP/SockJS, no polling for live state |
| Rendering | HTML + CSS only | No canvas, WebGL, game engine or other UI framework |

Microservices, accounts/passwords, reconnect into a running match, and persistence of live game state
are **out of scope**. One backend instance owns all rooms in memory.

## Owners

Only two people work on this version, split by stack. This keeps file ownership simple and avoids
merge conflicts.

| Owner | Owns | Main documents |
|---|---|---|
| **mbenboua** | `backend/` (Spring Boot, game engine, rooms, WebSocket, REST, PostgreSQL, backend tests) | `PROTOCOL.md`; reviews `ARCHITECTURE.md` and `GAME_RULES.md` |
| **Es-sadkia** | `frontend/` (Angular pages, components, services, board rendering, input, performance), root `README.md` | `AUDIT_CHECKLIST.md`; reviews `ARCHITECTURE.md`, `GAME_RULES.md` and `PROTOCOL.md` |

Shared and reviewed by both: `ARCHITECTURE.md`, `GAME_RULES.md`, the wire contract until milestone M1,
and the integration checklist. mbenboua owns the protocol text; Es-sadkia must be able to implement
every message from it without reading Java code.

### Task split at a glance

| Phase | mbenboua (backend) | Es-sadkia (frontend) |
|---|---|---|
| 0 — skeleton | Maven/Spring Boot, `POST /api/sessions`, `/ws` `JOIN` + `ROOM_STATE` + chat, Flyway, protocol v0.1 | Angular workspace, routes, models, `SessionService`, `GameSocketService`, `RoomStore`, nickname page, guards |
| 1 — lobby | Matchmaking, waiting rooms, 20 s/10 s timers, chat limits, disconnect cleanup, tests | Waiting page, counter, timer display, chat, connection/error UX |
| 2 — engine/board | Map, movement/collision, bombs/flames/chains, power-ups, damage/respawn, result, engine tests | Board, HUD, player list, snapshot interpolation, single rAF loop, debug overlay |
| 3 — live match | `MATCH_START`/`TILES`/`SNAPSHOT`/`MATCH_END`, 30 Hz tick service, input routing, spectators, room isolation | Keyboard input, bomb key, chat focus handling, spectating, disconnect UX, results navigation |
| 4 — persistence/history | JPA entities/repositories, transactional save, `GET /api/matches`, details, tests | Results page, history list/detail, loading/empty/error states, play-again flow |
| 5 — audit | Abuse checks, concurrency, cleanup, backend test pass, audit support | Performance traces, paint/layers, memory, README, audit checklist evidence |

The two stacks are developed in parallel against `PROTOCOL.md`; neither owner waits for the other's
implementation. The first integration point is M1 (two browsers, one room, chat).

Suggested branches:

```text
mbenboua/backend-skeleton
mbenboua/rooms-and-timers
mbenboua/game-engine
mbenboua/realtime-match
mbenboua/persistence-history
es-sadkia/angular-shell
es-sadkia/waiting-and-chat
es-sadkia/board-and-interpolation
es-sadkia/input-and-game-ux
es-sadkia/results-history
es-sadkia/performance-audit
```

One branch = one task phase. Rebase on `main`, keep pull requests small, and include in every PR
description: what changed, how it was tested, and which audit line it supports.

## Document map

| File | Purpose |
|---|---|
| `README.md` | Index, ownership, read order, working agreement |
| `ARCHITECTURE.md` | Components, repository layout, runtime flows, concurrency, performance contract, milestones |
| `GAME_RULES.md` | Single source of truth for numbers and edge cases |
| `PROTOCOL.md` | REST + WebSocket API, errors, sequencing, rate limits |
| `SETUP.md` | Prerequisites, database, environment variables, run and test commands |
| `TASKS_MBENBOUA.md` | Backend task breakdown and definition of done per phase |
| `TASKS_ES_SADKIA.md` | Frontend task breakdown and definition of done per phase |
| `AUDIT_CHECKLIST.md` | Manual/automated evidence for the evaluation criteria |

## Non-negotiable rules

- The **server is authoritative**: clients send intentions (`MOVE`, `STOP`, `PLACE_BOMB`); they never
  send positions, lives, power-ups or results.
- One WebSocket connection per tab. A player is identified by the server-issued guest session, never
  by a nickname or player id sent with an action.
- Rooms are isolated. A client receives messages only for its own room and can act only for itself.
- The board is HTML/CSS. The client animates with `requestAnimationFrame` and interpolates the 30 Hz
  server snapshots; it does not run game rules.
- The server tick is independent of rendering. 60 fps does **not** mean 60 network messages per second.
- Completed matches are persisted exactly once, in one transaction. Live rooms, chat, bombs and
  countdowns are not persisted.
- When a match finishes, the room is one-shot: clients go to the results page and start a new session
  to play again. Refreshing during a match creates a new session; rejoining an active match is not
  supported.
