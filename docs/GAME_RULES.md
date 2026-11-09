# GAME_RULES — gameplay and lobby constants

This file is the single source of truth for numbers and edge cases. If code and this file disagree,
fix the code or update this file in the same pull request. The backend implements these rules; the
Angular app only displays them.

## 1. Match constants

| Constant | Value | Notes |
|---|---|---|
| `MIN_PLAYERS` / `MAX_PLAYERS` | 2 / 4 | A match starts with the players present when the countdown ends |
| `LIVES` | 3 | A player is eliminated at 0 |
| `COLS` × `ROWS` | 15 × 13 | Fixed map; fully visible without scrolling |
| `SERVER_TICK_MS` | 33 | ~30 authoritative updates per second |
| `INTERPOLATION_DELAY_MS` | 66 | Client renders ~2 ticks behind the newest snapshot |
| `BOMB_FUSE_MS` | 3000 | Three seconds |
| `FLAME_MS` | 500 | Half a second |
| `INVULNERABILITY_MS` | 2000 | Visible after losing a life and after respawn |
| `BASE_BOMBS` | 1 | Active bombs allowed at start |
| `BASE_RANGE` | 1 | Explosion range in tiles from the bomb cell |
| `BASE_SPEED` | 3.5 tiles/s | Same for every player at start |
| `SPEED_STEP` | 0.6 tiles/s | Per speed power-up |
| `MAX_SPEED_LEVEL` | 3 | Max speed 5.3 tiles/s |
| `MAX_BOMBS` | 5 | Power-up cap |
| `MAX_RANGE` | 6 | Power-up cap |
| `BLOCK_DENSITY` | 0.65 | Share of eligible floor cells that become blocks |
| `POWERUP_DROP_CHANCE` | 0.30 | Share of blocks hiding a power-up |
| `POWERUP_MIN_PER_TYPE` | 3 | Guaranteed hidden bombs/flames/speed power-ups on the default map |
| `SAFE_ZONE_ARM` | 3 | Cells kept clear from each spawn along both edges |
| `PLAYER_HITBOX_HALF` | 0.35 tiles | Square hitbox centred on the player |
| `CORNER_ASSIST` | 0.30 tiles | Maximum sideways nudge when turning a corner |
| `MOVEMENT_SUBSTEP` | 0.25 tiles | Maximum movement per collision sub-step |
| `WAITING_MS` | 20 000 | Starts when the first player joins a room |
| `COUNTDOWN_MS` | 10 000 | "Get ready" countdown |
| `MAX_CATCHUP_TICKS` | 5 | Server loop catch-up cap |
| `SNAPSHOT_HISTORY_MS` | 500 | Client interpolation buffer |
| `SNAPSHOT_STALE_MS` | 250 | Client snaps instead of interpolating after this |
| `NICKNAME_MIN` / `NICKNAME_MAX` | 1 / 20 | Trimmed length; control characters rejected |
| `CHAT_MAX_LEN` | 300 | Trimmed length; empty messages rejected |
| `CHAT_RATE` | 5 / 5 s | Per player |
| `MAX_WS_MESSAGE_BYTES` | 4096 | Text frame limit |
| `WS_RATE` | 60 / s | Per socket, all messages |

All durations are server-side. The client never decides when a bomb explodes, when a phase changes or
when a player dies.

## 2. Map

### 2.1 Coordinates and tile codes

- `x` goes right from 0 to 14; `y` goes down from 0 to 12; origin is top-left.
- Tile index = `y * COLS + x`.
- Positions are floats in tile units, **centre-based**: tile `(cx,cy)` covers `[cx,cx+1) × [cy,cy+1)`,
  so its centre is `(cx + 0.5, cy + 0.5)`. A sprite's top-left is `(x - 0.5, y - 0.5)` tiles.

| Code | Name | Walkable | Notes |
|---|---|---|---|
| `0` | `FLOOR` | yes | Empty cell |
| `1` | `WALL` | no | Indestructible border/pillar |
| `2` | `BLOCK` | no | Destructible; may hide a power-up |
| `3` | `BOMB` | no* | *Passable only by the owner until they leave its cell |
| `4` | `FLAME` | yes | Damages non-invulnerable players at the centre cell |
| `5` | `POWERUP_BOMB` | yes | `maxBombs + 1` |
| `6` | `POWERUP_FLAME` | yes | `range + 1` |
| `7` | `POWERUP_SPEED` | yes | `speedLevel + 1` |

The server sends the complete `COLS*ROWS` array whenever any tile changes. The client maps codes to CSS
classes; it never invents tiles.

### 2.2 Fixed layout

- The whole border is `WALL`.
- Interior pillars are `WALL` at every even `(x,y)` (`x ∈ {2,4,6,8,10,12}`, `y ∈ {2,4,6,8,10}`).
- Every other cell starts as `FLOOR`.

### 2.3 Spawns and safe zones

Slots are assigned in join order at match start:

| Slot | Corner | Spawn cell | Centre |
|---|---|---|---|
| 0 | `TOP_LEFT` | `(1,1)` | `(1.5,1.5)` |
| 1 | `BOTTOM_RIGHT` | `(13,11)` | `(13.5,11.5)` |
| 2 | `TOP_RIGHT` | `(13,1)` | `(13.5,1.5)` |
| 3 | `BOTTOM_LEFT` | `(1,11)` | `(1.5,11.5)` |

Every corner keeps a three-cell arm clear, even in a two-player match:

- top-left: `(1..4,1)` and `(1,1..4)`;
- top-right: `(10..13,1)` and `(13,1..4)`;
- bottom-left: `(1..4,11)` and `(1,7..11)`;
- bottom-right: `(10..13,11)` and `(13,7..11)`.

No block or hidden power-up is placed in a safe zone. `SAFE_ZONE_ARM (3) > BASE_RANGE (1)` and the
base speed covers the escape distance long before the 3 s fuse; this is rechecked by an engine test.

### 2.4 Blocks and hidden power-ups

1. Each eligible `FLOOR` cell outside the safe zones becomes `BLOCK` with probability 0.65.
2. If fewer than 9 blocks were produced (only possible when tests override density), convert eligible
   floor cells until there are 9.
3. Choose `min(blockCount, max(round(blockCount * 0.30), 9))` blocks to hide a power-up.
4. Build a shuffled deck containing at least 3 `POWERUP_BOMB`, 3 `POWERUP_FLAME` and 3
   `POWERUP_SPEED`; fill the rest with random types; assign one deck entry per chosen block.
5. A hidden power-up is revealed when its block is destroyed (after the destroying flame expires). The
   block tile becomes the power-up code, not `FLOOR`.

This guarantees the audit can observe all three required power-up types on the default map. The
backend uses an injected seeded RNG so tests reproduce the same map.

## 3. Players and movement

- Each player starts at the centre of their spawn cell, facing `DOWN`, with 3 lives, 1 active bomb,
  range 1 and speed level 0.
- Movement is four-directional (no diagonals). The client sends the current intent; the server moves
  the player at `BASE_SPEED + speedLevel * SPEED_STEP` tiles per second.
- The hitbox is a square centred on `(x,y)` with half-size 0.35. A move is allowed only when every cell
  overlapped by the hitbox at the new position is not solid.
- Solid cells: `WALL`, `BLOCK`, and `BOMB` (except the own-bomb pass-through below). `FLAME` and
  power-ups are walkable; other players never block movement, so players may share a tile.
- Collision movement is split into sub-steps of at most 0.25 tile so a large frame delta cannot tunnel
  through a wall.
- **Corner assist**: if the requested move is blocked and the player's offset from the centre of the
  target lane is at most 0.30, slide the player perpendicular toward the lane centre by the smaller of
  the offset and the movement distance, then retry. This makes turns around pillars feel smooth.
- **Own bomb pass-through**: when a player places a bomb, that player may leave the bomb's cell. Their
  id is in the bomb's passable set until their hitbox no longer overlaps the cell; after that the bomb
  is solid for everybody, including the owner. A player may never walk back through a bomb they have
  left.
- `direction` in snapshots is the last non-null facing. `moving` is true only when the position really
  changed during the tick (blocked movement reports false).
- Dead/eliminated players do not move, do not collide and do not take damage.

## 4. Bombs and explosions

### 4.1 Placement

- Allowed only while alive, in `PLAYING`, when `activeBombs < maxBombs`, and when the centre cell is
  `FLOOR`.
- The bomb captures the player's current `range` at placement. Later flame power-ups do not change an
  already placed bomb.
- The centre cell becomes `BOMB`, `activeBombs` increases, and the bomb is scheduled to explode after
  3000 ms.
- A bomb slot is freed when that bomb explodes, not when its flames disappear.

### 4.2 Explosion

A bomb at cell `c` with captured range `r`:

1. `c` becomes `FLAME`.
2. In each of the four directions, walk up to `r` cells:
   - `WALL` → stop; the wall is not damaged.
   - `BLOCK` → the block becomes `FLAME`, its hidden power-up (if any) is remembered for reveal after
     the flame expires, then stop that direction.
   - `BOMB` → add that bomb to the chain queue and stop that direction. The triggered bomb emits its
     own rays when resolved.
   - exposed `POWERUP_*` → destroyed, the cell becomes `FLAME`, continue.
   - `FLOOR` / `FLAME` → becomes `FLAME`, continue.
3. Each flame cell gets `expiresAt = now + 500 ms`. When flames overlap, keep the later expiry.
4. Every bomb is resolved at most once per tick, even if several rays reach it.

Chain reactions resolve in the same tick. The server broadcasts `TILES` after the whole tick, then the
snapshot.

### 4.3 Flame expiry

- When a flame expires, its cell becomes the hidden power-up if the destroyed block had one; otherwise
  it becomes `FLOOR`.
- Flames do not damage through walls or blocks. A flame stops at the first block it destroys.

## 5. Power-ups

- Each destroyed block may reveal one pre-assigned power-up (30 % of blocks on average).
- Walking onto a `POWERUP_*` cell collects it once, immediately sets the tile to `FLOOR`, and applies:
  - `POWERUP_BOMB`: `maxBombs + 1` (cap 5);
  - `POWERUP_FLAME`: `range + 1` (cap 6);
  - `POWERUP_SPEED`: `speedLevel + 1` (cap 3).
- At the cap the tile is still consumed; the stat does not increase further.
- Upgrades last until the match ends, including after losing a life, respawning and being eliminated
  (the eliminated player's stats are only for the final result).
- Power-ups are not shared: collection removes the tile for everyone.
- Flames destroy exposed power-ups and continue through them. Hidden power-ups only become tiles after
  the destroying flame expires.
- Randomness is server-side only. Clients never decide whether a block drops a power-up or which type.

## 6. Damage, lives, respawn and elimination

After bombs/flames are updated in a tick:

1. For each alive, non-invulnerable player whose **centre cell** is `FLAME`:
   - lose exactly **one** life;
   - set `invulnerableUntil = now + 2000 ms` (the client shows a blink);
   - if lives remain, respawn immediately:
     1. use the starting corner cell if it is `FLOOR` and not `FLAME`/`BOMB`;
     2. otherwise use the nearest walkable `FLOOR` cell (BFS by grid distance) that is not `FLAME` and
        not `BOMB`;
     3. if no such cell exists, use the starting corner (invulnerability prevents immediate extra
        damage).
2. If lives reach 0, set `alive = false`, keep the player in snapshots with `lives: 0`, and mark them
   eliminated. They can watch and chat but cannot move or place bombs.
3. At most one damage event is applied to a player per tick. Overlapping flames and subsequent ticks
   during the 2 s invulnerability cannot remove more lives.
4. A player can be hurt by their own bomb and by any other bomb. A player whose centre is outside the
   flame is not damaged even if the hitbox edge overlaps it.

The player keeps bombs already placed, power-ups and upgrades through respawn. Respawning does not
clear flames or bombs.

## 7. Match result

- After every complete server update (movement, power-ups, bombs, flames, damage, respawn,
  elimination), count alive players.
- If exactly one player is alive, that player wins.
- If zero players are alive, the match is a draw.
- If a disconnect reduces the alive count to one/zero, apply the same check immediately.
- The match result includes every player with final lives and a result:
  - `WINNER` — the last surviving player;
  - `ELIMINATED` — lost all lives normally;
  - `DISCONNECTED` — forfeited remaining lives by disconnecting while alive;
  - `DRAW` — was alive/connected in the final update of a draw.
- For a draw, players already eliminated or disconnected before the final update keep their earlier
  result. Connected players eliminated in the final update become `DRAW`.
- Match duration = `endedAt - startedAt` (whole seconds, floor). It is derived from timestamps, never
  stored separately.

## 8. Waiting room and countdown

These rules are implemented by the room state machine, not by the client.

1. A room enters `WAITING` when its first player joins and starts a 20 s waiting timer.
2. If the fourth player joins before the waiting timer expires, cancel it and start the 10 s
   `COUNTDOWN` immediately.
3. If the waiting timer expires with at least two players, start the 10 s countdown.
4. If the waiting timer expires with fewer than two players, keep waiting. The next join that brings
   the room to two starts the 10 s countdown.
5. Admission closes when the countdown starts. New arrivals go to another waiting room or a new room.
6. If departures during the countdown leave fewer than two players, cancel the countdown, reopen
   admission and return to `WAITING`. When two players are present again, start a **fresh** 10 s
   countdown (not a new 20 s wait).
7. If departures during `WAITING` leave one player, the room keeps waiting. If it becomes empty, close
   the room and cancel all timers.
8. When the countdown ends, start the match with the players currently present (2–4).
9. Every player in the room sees the same phase, `secondsLeft` and `endsAt`. Only the backend changes
   the phase.
10. Nickname uniqueness is checked in the target room **case-insensitively** after trimming (`Ada` and
    `ada` collide). Nicknames are not globally unique across rooms; the session/player id is the
    identity.

## 9. Chat

- Available in waiting, countdown, playing and while spectating after elimination.
- Trim the text; reject empty messages and messages longer than 300 characters. Strip control
  characters. Render as text, never as HTML.
- Messages are room-scoped and show the sender and timestamp. System messages (join/leave/eliminated)
  use a null sender and a distinct style.
- Rate limit: 5 messages per 5 seconds per player. Excess messages are dropped with `RATE_LIMITED`.
- Chat is not persisted and late joiners do not receive earlier messages.

## 10. Disconnects

- **Waiting/countdown**: remove the player, broadcast the new room state, and apply rule 6/7 above.
- **Playing**: the player forfeits all remaining lives immediately (`lives = 0`, `alive = false`,
  result `DISCONNECTED`), a system chat message is broadcast, and the winner check runs. Their bombs
  and flames remain in the world and can still affect others.
- The backend stops that player's timers and releases their session. Reconnecting mid-match is not
  supported; a refresh starts a new guest session and returns to the nickname page.
- The Angular client shows a visible connection error, stops sending input and stops animation that
  depends on stale snapshots.
- If a disconnect leaves zero alive players, the match is a draw. Disconnected participants keep
  `DISCONNECTED`; they are not converted to `DRAW`.

## 11. Randomness and reproducibility

- Map blocks, hidden power-up positions/types and any future random events are decided by the backend.
- The engine receives a seeded RNG; tests use fixed seeds and assert identical maps.
- Production may seed from `System.nanoTime()`; live state is not persisted, so the seed does not need
  to be stored.
- The client never generates gameplay randomness.

## 12. Edge-case summary

| Situation | Rule |
|---|---|
| Player places a bomb and stays on it | Bomb remains passable for them; explosion can hurt them |
| Player leaves a bomb, then tries to return | Solid; movement is blocked |
| Two flames overlap a cell | One flame with the later expiry |
| Two bombs trigger each other | Both explode in the same tick, each exactly once |
| Bomb next to a block | First block is destroyed; flame stops there |
| Bomb next to a wall | Wall stops the flame; wall is not damaged |
| Player centre outside flame, hitbox edge inside | No damage |
| Player loses a life while standing on a power-up | Respawn; upgrade was already collected and persists |
| Player loses last life in the same tick as the last opponent | Draw |
| Player disconnects with 2 lives | Forfeit to 0, result `DISCONNECTED`, winner check |
| Fourth player joins after countdown started | Goes to another room |
| Countdown falls from 2 to 1 player | Cancel, reopen, fresh 10 s when 2 again |
| Countdown falls from 4 to 3 players | Countdown continues |
| Waiting room becomes empty | Close room, stop timers |
| Nickname duplicated in the target room (case-insensitive) | Reject `JOIN` with `NICKNAME_TAKEN` |
| Chat message is only whitespace | Rejected, not broadcast |
| Chat message is 301 characters | Rejected, not broadcast |
| Client sends a forged position/life/result | Rejected; only intentions are accepted |
