# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

The game itself is one HTML file. There is also an optional Node.js server for networked co-op that **also** serves the static files.

```sh
# Solo / local co-op only
python3 -m http.server 8000     # then open http://localhost:8000
# or just open index.html directly in a browser

# Networked co-op (single command — also serves the page)
npm install
node server.js                  # http://localhost:8080/
# PORT=9000 node server.js      # custom port
```

There is no linter, no test framework, no CI. The only `package.json` declares `ws` for `server.js`.

## File map

- `index.html` — the whole game (HTML + CSS + JS in one file).
- `server.js` — Node `http.createServer` + `ws.WebSocketServer` on the same port. Serves static files from this directory and relays room-based messages between a host and its clients.
- `package.json` — declares the `ws` dependency.
- `.gitignore` — ignores `temp.txt` and similar local junk.
- `README.md` — player-facing controls, shop prices, day cycle, hosting.
- `HANDOFF.md` — deep architecture notes, recent changes, known gaps.

## Architecture

The game lives in `index.html`. Modifications almost always happen inside the `<script>` block at the bottom.

### Top-level state (in script order)
- `SPRITES` — inline SVG icons keyed by name (wood, stone, gold, axe, …). Used in the HUD and shop menus.
- `WORLD_WIDTH = 3200`, `WORLD_HEIGHT = 2400` — fixed world size; the canvas is just a viewport.
- `camera = {x, y}` — scrolls to follow local players. Set by `updateCamera()`.
- `gameState` — shared resources/flags (wood, stone, gold, raw/cooked meat, tools, time, day, message, `shopOpen`, `blueprintShopOpen`, `paused`). **Tools and resources are shared between all players**, not per-player.
- Networking globals: `netMode` (`'offline'|'host'|'client'`), `netSocket`, `netClientId`, `netRoom`.
- `keys` — event-code keyed map, populated by global `keydown`/`keyup` listeners.
- `players`, `entities`, `cows`, `buildings`, `mainCampfire` — created by `initWorld()` (host / offline) or rebuilt from network snapshots (client).
- `singlePlayer` — flag from the menu button (also used by host mode so the host starts solo and clients add slots as they join).
- `nightLayer` — offscreen canvas for the night overlay. Sized by `resizeViewport()`.

### Classes
- `Player` — movement + HP + held-item system. `update()` short-circuits while `isMenuOpen()` (any shop or blueprint shop) is true. Reads movement from `networkInput` if present, otherwise from the global `keys` map. Has `isLocal`, `remoteClientId`, `networkInput`, `heldIndex`. Methods: `getHeldItems()`, `getHeldItem()`, `cycleItem()`, `damage()`, `heal()`, `draw()`.
- `Entity` — trees, rocks, shop, **blueprint_shop**, cave. `type` field branches rendering and interaction. `respawnDay` and `chopProgress` are nullable.
- `Cow` — wandering animal with HP. Tethered loosely to `spawnX/spawnY`. `takeHit()` returns true on kill.
- `Campfire` — singleton. Fuel countdown + a warm glow ring always drawn while active.
- `Building` — player-built structure. `drawBase()` for floor/walls/door; `drawRoof()` for the roof. `contains(player)` is a rectangular footprint test.

### `checkInteractions()` priority order
For each player, on action press (consumed once per press: local via `keys[code] = false`, remote via `networkInput.actionLatch = false`):
1. Shop / blueprint_shop within 70px — opens overlay menu, returns.
2. Nearest cow within 55px — attack (5 dmg bare-handed, **20 with sword *held***).
3. Trees / rocks / cave within 60px (first match wins).
4. Campfire within 60px — cook raw meat if present, else add wood to refuel.
5. Open field — eat the food the player is currently holding.

Action results depend on what the player is **holding**, not just what they own:
- Tree: axe held → 1-hit (+7 wood). Otherwise 4-hit chop (`chopProgress`) for +3 wood total.
- Rock: pickaxe held required.
- Cow: sword held → 20 dmg; otherwise 5.
- Eat: only consumes the meat type currently held.

The 55 vs 60 gap on cows is deliberate (trees take priority when both are in range). Reordering changes feel.

### Held-item system
- `Player.heldIndex` rotates through `getHeldItems()` = `[hands, axe?, pickaxe?, sword?, cookedMeat?, rawMeat?]` (skipping items not owned / count zero).
- Cycle keys: **P1 = `KeyE`**, **P2 = `KeyK`**. The cycle keydown listener has an `e.repeat` guard and a `netMode === 'client'` guard.
- Remote players: client sends `{type:'input', switchPress:true}` → host sets `networkInput.switchLatch = true` → gameLoop consumes it at the top of each tick and calls `cycleItem()` on that player.

### Shop & blueprint shop
- Each has its own DOM overlay (`#shop-menu`, `#bp-menu`) toggled by `gameState.*Open`.
- Shop digits: 1–3 sell wood (1 / 10 / all @ 5g each); 4–6 buy axe (20g) / pickaxe (25g) / sword (30g); 7/Esc close.
- Blueprint digits: 1–3 buy small_shack (30 wood) / stone_cottage (20w + 25s) / watch_tower (15w + 40s + 20g); 4/Esc close. Purchase spawns a `Building` south of the buyer, clamped to world bounds.
- `isMenuOpen()` freezes player movement and disables the cycle key while a menu is open.

### Buildings
- Buildings are drawn in two passes: bases (floor, walls, door) sort with the other world objects in the y-sort queue; roofs draw in a separate pass **after** the y-sort.
- A player is considered "inside" a building if `Building.contains(player)` is true. Inside players get their y bumped slightly so walls don't paint over them in the y-sort.
- **Roof alpha**: `1.0` when no one is inside, **`0` when any player is inside** — the roof is fully removed so the building reads as a clean top-down view of the interior.

### Day/night lighting
- `getNightOpacity()` returns a smooth `0..0.6` alpha through dusk (18:00–20:00), full night (20:00–05:00), and dawn (5:00–7:00).
- The dark overlay is rendered to an **offscreen `nightLayer`** in screen coords. `destination-out` cuts halos in it (player/campfire/shop), and `ctx.drawImage(nightLayer, 0, 0)` composites it onto the main canvas **after** the world has been rendered. The offscreen layer is essential — putting `destination-out` directly on the main canvas would also erase the world pixels and produce black holes.
- Halos:
  - Player → crisp daylight circle (r=220, alpha=1 out to 96% of radius).
  - Campfire → same shape, r=360.
  - Shops → soft 150px lantern (still a destination-out gradient, but with a softer falloff).
- `isNightTime()` is kept for **gameplay** rules. `isCaveOpen()` returns `isNightTime() || gameState.day >= 10` — cave unlocks permanently from day 10 onward.

### Main loop (`gameLoop`)
1. Bail out if the game isn't running.
2. If `netMode !== 'client'` and `!paused`: process remote switch latches, advance time/day, run `mainCampfire.update`, `players.forEach(p => p.update())`, `cows.forEach`, respawn sweeps, `checkInteractions()`.
3. Network I/O: host broadcasts a state snapshot ~20Hz; client sends keystate ~30Hz (paused-aware).
4. `updateCamera()` (averages `players` filtered to `isLocal !== false`).
5. Compute `player.insideBuilding`.
6. Render: `ctx.save() / translate(-camera)` → ground/grid → y-sorted draw queue (entities + cows + building bases + players + campfire) → roofs (alpha 0 if inside) → `ctx.restore()` → composite night overlay → `updateUI()`.

### Network (host-authoritative relay)
- `server.js` is a tiny Node `http.createServer` + `ws.WebSocketServer` on the same port. HTTP serves static files (with traversal guard + denylist); WS handles rooms (first `?role=host` socket per room owns the simulation; host messages broadcast to clients; client messages forwarded to host with an injected `clientId`). Server emits `role`, `client_join`, `client_leave`, `host_left`, `error`.
- Client (`netStart`) prompts for relay URL (defaults to same-origin `ws[s]://location.host`) and room, opens the socket, waits for `{type:'role',...}`.
- **Host**: `singlePlayer = true`; `initWorld()` seeds only the host's player. Each `client_join` calls `addRemotePlayer(clientId)` which creates a `Player` with `isLocal=false`, `remoteClientId`, fake control codes (`__net_*`), and a `networkInput = {up,down,left,right,actionLatch,switchLatch}`.
- **Client**: starts empty, populates from `{type:'state',...}` by rebuilding `players`/`cows`/`entities`/`buildings` and mutating `gameState`/`mainCampfire`. Players whose `cid` matches `netClientId` get `isLocal = true` so the camera follows them.
- Inputs from client: keystate (up/down/left/right) at ~30Hz plus one-shot `actionPress` / `switchPress` on keydown.

### UI
- HUD: clock-day, resources, food, tools, per-player HP + held-item sprite + cycle-key hint, campfire fuel %, message line.
- **Pause**: button (top-right) + **P** key. `e.repeat`-filtered, blocked while a menu is open. Toggles `gameState.paused` — the gameLoop still runs for rendering, but skips all simulation.
- **Exit**: button (top-right, below pause). Closes the socket, resets `netMode`, resets `gameState` resources/day/tools/messages, hides in-game UI, shows the main menu.

## Gotchas

- **`initWorld()` rebuilds the world.** Called from `startGame` (offline) and `startNetworkedGame` (host only). Calling it mid-game wipes progress. `resizeViewport()` is what's wired to the window resize event now — it only resizes the canvas (and the `nightLayer`), never the world.
- **Input is keyed by `event.code`**, not `event.key`. New keybinds need codes like `'KeyF'`, `'Digit1'`, `'Numpad1'`, `'Escape'`, `'ArrowUp'`. Remote player slots use deliberately fake codes (`__net_*`) so local keypresses can't accidentally drive a remote.
- **Action key consumed once per press**: either via `keys[code] = false` (local) or by clearing `networkInput.actionLatch` (remote). Any new interact-path must follow the same pattern.
- **Cycle key has two listeners**: one that calls `cycleItem` locally (skipped on client), and one that sends `switchPress` to the host (only on client). They're guarded by `netMode` — don't merge them.
- **`Player.damage()` references `mainCampfire`** for respawn — only safe because it's not called before gameplay starts.
- **Night halos require the offscreen `nightLayer`** — `destination-out` directly on the main canvas would also erase the world. If you refactor the lighting, keep the offscreen-then-`drawImage` pattern.
- **Single-player vs co-op vs host** is decided by the menu button. Single-player → `singlePlayer=true`. Co-op → `singlePlayer=false`. Host → `singlePlayer=true` (clients add slots dynamically). Client → no `initWorld`, world arrives via state snapshots.
- **No save/load and no determinism** — `Math.random()` everywhere, refresh wipes the run.
- **Shop UI doesn't sync across the network yet** — only the host can navigate a shop menu.

## Where things are documented

- **`README.md`** — player-facing: controls, shop prices, day cycle, hosting / joining.
- **`HANDOFF.md`** — deeper architecture notes plus a "Done since last handoff" log of recent changes and a "Known gaps" list. Read this before non-trivial changes.
