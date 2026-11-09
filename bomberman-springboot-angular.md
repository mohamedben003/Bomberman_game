## bomberman-springboot-angular

You certainly know Bomberman, right? Good good. You will make it. This time, your game will have an Angular frontend, a Spring Boot backend, and a PostgreSQL database. Add WebSockets, invite some friends, and see who survives the bombs. Let me explain.

### Objectives

Create a multiplayer Bomberman game where 2 to 4 players join a room and battle until only one remains. Players must be able to choose a nickname, wait for opponents, chat, play together in real time, and consult previous results.

This project should help you learn how an Angular application communicates with a Java backend, how the server keeps a multiplayer game synchronized, and how relational data is stored. Keep the application small: one Spring Boot application, one Angular application, and one PostgreSQL database. Microservices are outside the scope.

### Instructions

At the beginning, each player starts in a different corner. Everyone sees the same map, and everyone follows the same rules. The backend decides what actually happens; the frontend displays the game and sends player actions.

#### Technology requirements

- **Java + Spring Boot**: Implement the backend, HTTP API, game rules, matchmaking, and WebSocket communication.
- **Angular + TypeScript**: Implement the browser application using components, routing, forms, and shared services. These are standard Angular building blocks; see the [Angular overview](https://angular.dev/overview).
- **PostgreSQL**: Store players and completed match results. Use Spring Data JPA entities and repositories for persistence; see the [Spring Data JPA documentation](https://docs.spring.io/spring-data/jpa/reference/jpa.html).
- **WebSockets**: Exchange lobby updates, chat messages, player actions, and game state through persistent connections. Spring supports both raw WebSockets and STOMP messaging; either is acceptable. See the [Spring WebSocket documentation](https://docs.spring.io/spring-framework/reference/web/websocket.html).

Render the board with HTML elements and CSS. Canvas, WebGL, another frontend framework, and ready-made game engines are not allowed. The original mini-framework is replaced by Angular.

Respect **performance**: aim for 60fps during normal play, without sustained frame drops. Use `requestAnimationFrame` for animation, measure a four-player match with browser developer tools, and avoid unnecessary painting or layers. Browser rendering and server updates may run at different rates; 60fps does not require 60 network messages per second.

#### Game Mechanics

1. Players
   1. A match contains **2 to 4 players**, each starting with **3 lives**.
   2. Players move with the arrow keys or WASD and place bombs with Space. Show the controls before play.
   3. Walls, blocks, and bombs prevent movement. Players may share a tile. A player may leave a bomb they just placed, but cannot walk back through it.
   4. An explosion removes one life. A surviving player returns to their starting corner, or the nearest free tile, with two seconds of visible invulnerability. Overlapping flames cannot remove multiple lives from the same hit.
   5. At zero lives, the player is eliminated and can only watch and chat. Resolve each server update completely before checking the winner: the last surviving player wins; if no players remain, record a draw.

2. Map
   1. Use one fixed-size rectangular grid. Every player must see the whole board without scrolling.
   2. **Walls** are indestructible and always occupy the same positions. **Blocks** are destructible and randomly placed by the backend for each match.
   3. Players start in separate corners. Keep their starting tiles and escape paths clear so everyone can survive their first bomb.
   4. All clients receive the same generated map. Choose and document its dimensions and wall layout.

3. Bombs
   1. Players start with one active bomb allowed, an explosion range of one tile, and the same movement speed.
   2. A bomb occupies a tile and explodes after **three seconds**. Its owner can be hurt by it too.
   3. Flames affect the bomb's tile and extend in four directions. Walls stop flames; the first block hit is destroyed and stops that direction. Flames trigger other bombs immediately, creating chain reactions.
   4. Flames last half a second. A bomb slot becomes available again when that bomb explodes.

4. Power ups
   1. Each destroyed block has a chance to reveal one power up. Randomness is decided by the backend.
   2. **Bombs** increases the number of simultaneously active bombs by one.
   3. **Flames** increases explosion range by one tile in each direction.
   4. **Speed** increases movement speed.
   5. Walking onto a power up collects it once and removes it for everyone. Upgrades last until the match ends, including after losing a life. Document the drop probability, speed increase, and any upgrade limits; use identical rules for all players.

#### Waiting room and chat

When opening the game, the user must enter a nickname. Trim whitespace, require 1 to 20 characters, and reject nicknames already used in the same room. Create a guest player session; registration and passwords are not required.

Then display a waiting page with the player list, a **counter out of 4**, and a room chat. Matchmaking automatically places players in an available waiting room or creates another room when needed.

- Start a **20-second waiting period** when the first player joins.
- If a fourth player joins before it expires, immediately start a **10-second countdown**.
- Otherwise, start that countdown after 20 seconds if at least two players are present.
- With fewer than two players, keep waiting. Once the waiting period has elapsed, the next join that brings the room to two starts the countdown.
- Close admission when the countdown begins; new arrivals enter another waiting room. If departures leave fewer than two players, cancel the countdown and reopen admission. Start a fresh 10-second countdown once two players are present again.

The backend owns both timers. Everyone must see the same countdown and enter the match together. Chat remains available during play and while watching after elimination. Messages must show the sender and remain inside their room. Reject empty messages and messages longer than 300 characters; display them as text.

#### Backend requirements

The Spring Boot backend must:

- Manage guest sessions, room membership, player counts, countdowns, match start, elimination, and match completion. Identify players through their server-issued session, rather than trusting a nickname or player identifier supplied with an action.
- Keep the current map, positions, lives, bombs, power ups, and timers in memory. Advance gameplay at a documented regular rate independent of client rendering. Handle concurrent actions consistently so a bomb, pickup, or match result is processed only once.
- Validate movement, collisions, movement speed, bomb limits, and match status. Clients send intentions such as move, stop, or place bomb; they cannot set positions, lives, power ups, or results directly.
- Send an initial room snapshot when a player joins, then broadcast updates for movement, explosions, pickups, chat, countdowns, and results. Separate room traffic so two matches can run independently. A client must not control another player or receive another room's messages.
- Remove disconnected players from waiting rooms. During a match, a disconnection forfeits that player's remaining lives and triggers the usual winner check. Show a connection error to that player; refreshing requires a new lobby entry. Rejoining an active match is not required.
- Provide REST operations for creating guest sessions and retrieving completed match history and match details. Use WebSockets for live room membership, chat, and gameplay; polling must not replace real-time communication.
- Separate controllers and WebSocket handlers, game services, and persistence repositories. Use dependency injection, request/response DTOs, input validation, and understandable error responses. Keep database entities separate from public messages.
- Reject malformed or unauthorized actions without crashing or changing valid game state. Stop room timers and release in-memory state when a match finishes or a room becomes empty.

Document the HTTP operations and WebSocket message types briefly in the README: their purpose, required fields, responses or broadcasts, and errors. JSON is sufficient; a complex protocol is not expected.

#### Frontend requirements

The Angular application must provide these routed pages:

1. **Nickname page**: A validated nickname form, join action, and readable validation or connection errors.
2. **Waiting page**: Room identifier, player names, counter, waiting status, synchronized countdown, and chat.
3. **Game page**: Full board, player identities, remaining lives, bombs, flames, power ups, chat, and clear elimination feedback. Prevent gameplay shortcuts while typing in chat.
4. **Results page**: Winner or draw, each participant's result, match duration, and an action to join a new match.
5. **History page**: The latest 20 completed matches, with participants, outcome, and duration; selecting a match shows its details. Include navigation and an empty state.

Split the interface into reusable components, including the board, player information, and chat. Use Angular services for HTTP and WebSocket communication and a shared source of current room state. Release subscriptions, animation callbacks, connections, and keyboard listeners when leaving a room. Avoid opening duplicate connections on navigation.

Display server-confirmed state consistently across browsers. Show loading, disconnection, and server errors visibly. Opening a protected game route without an active room must return the user to the nickname page with an explanation.

#### Database requirements

Persist at least:

- **Player**: A generated identifier, nickname, and creation time. This represents a guest session, not an account; reusing a nickname later does not imply the same player.
- **Match**: A generated identifier, start and end times, and an outcome identifying the winner or a draw.
- **Participation**: Links between a match and its players, including starting corner, remaining lives at completion, and result: winner, eliminated, disconnected, or draw. For a draw, mark connected participants eliminated in the final update as drawn; earlier eliminations retain their result.

Derive match duration from its timestamps. Use primary keys, foreign keys, required fields, and a uniqueness constraint preventing duplicate participation for the same player and match. These are standard [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

Save a completed match and all its participation records in one transaction, exactly once. History must survive a backend restart. Live movements, bombs, countdowns, chat messages, and active rooms do not need database storage; restoring interrupted matches is not required.

Provide a repeatable database initialization method, such as versioned migrations or an SQL schema script. Configure connection settings outside source code and include an example configuration without credentials. Results pages and history must use real persisted data.

#### Bonus

Once the required game works, here are some ideas to make it even better:

- **Solo + Co-Op mode**: Add backend-controlled opponents. In solo mode, one player faces the AI; in cooperative mode, all human players win when every AI opponent is defeated.
- **More power ups**:
  - _Bomb Push_: Throw a bomb after placing it.
  - _Bomb Pass_: Pass through bombs.
  - _Block Pass_: Pass through blocks, but not walls.
  - _Detonator_: Choose when your bombs explode by pressing a key.
  - _1 Up_: Gain an extra life.
- **Release power ups after death**: When a player loses a life, drop one of their upgrades. If they have none, drop a random power up.
- **Team mode**: Support two players versus two players and record the winning team.
- **After death interaction**: Eliminated players become ghosts. Touching a living player revives the ghost with one life; an explosion eliminates that ghost permanently.

Optional modes must keep their rules on the backend and display the appropriate outcomes in the frontend and history.

This project will help you learn about:

- Angular components, routing, forms, services, and subscription management.
- Spring Boot controllers, dependency injection, validation, and scheduled game updates.
- JPA relationships, repositories, transactions, and PostgreSQL constraints.
- WebSockets, synchronization, concurrent actions, and server-controlled gameplay.
- `requestAnimationFrame`, browser rendering, FPS, and developer tools.

#### Evaluation criteria

Provide a README with prerequisites, exact startup commands, database setup, configuration, controls, chosen gameplay constants, and API/message documentation. Include focused automated tests for game rules and persistence; the checklist below covers browser behavior.

##### Functional

- [ ] Can the evaluator start PostgreSQL, Spring Boot, and Angular using the README?
- [ ] Does source inspection confirm the required stack, HTML/CSS rendering, and separation of components, services, and repositories?
- [ ] Is a nickname required, with invalid or duplicate room nicknames rejected?
- [ ] Do separate browsers show the same player counter and exchange room chat immediately?
- [ ] With two or three players, does the 10-second countdown begin after the 20-second waiting period? With four, does it begin immediately?
- [ ] Does one player keep waiting, and does a departure below two cancel the countdown?
- [ ] Do all players start together in different safe corners on the same map?
- [ ] Can players move and place bombs while walls, blocks, speed, and bomb limits are enforced?
- [ ] Do fuse timing, directional explosions, blocked flames, and chain reactions follow the rules?
- [ ] Does damage remove exactly one life, show invulnerability, and eliminate a player after three hits?
- [ ] Do destroyed blocks sometimes reveal all three required power-up types, with synchronized collection and effects?
- [ ] Does everyone see the same winner or draw, followed by the same saved results?
- [ ] Are disconnects handled, spectators unable to act, and separate rooms isolated?
- [ ] Are forged positions, invalid messages, and attempts to control another player rejected?

##### Persistence and performance

- [ ] Do match and participation records have correct relationships and outcomes, without duplicates?
- [ ] Do history and match details remain available after restarting the backend?
- [ ] Do automated tests cover collisions, bomb damage, power ups, matchmaking timers, winner/draw detection, and saving a complete result?
- [ ] Does a four-player match run around 60fps without sustained drops, with limited painting and sensible layer usage?
- [ ] Does repeated navigation avoid duplicate messages, connections, or keyboard actions?

##### Bonus

- [ ] Is Solo + Co-Op mode implemented as described?
- [ ] Are at least two additional power ups implemented?
- [ ] Are power ups released after losing a life?
- [ ] Is team mode implemented?
- [ ] Can eliminated players interact as ghosts under the stated rules?
