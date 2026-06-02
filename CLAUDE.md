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

There is no linter, no test framework, no CI. The only `package.json` declares `ws` for `server.js`. On boot `server.js` logs every LAN IPv4 it bound to, and exposes `GET /lan` returning `{ips, port}` so the in-game Host prompt can prefill the share URL.

## File map

- `index.html` — the whole game (HTML + CSS + JS in one file).
- `server.js` — Node `http.createServer` + `ws.WebSocketServer` on the same port. Serves static files from this directory, exposes `/lan`, and relays room-based messages between a host and its clients.
- `package.json` — declares the `ws` dependency.
- `.gitignore` — ignores `temp.txt` and similar local junk.
- `README.md` — player-facing controls, shop prices, day cycle, hosting.
- `HANDOFF.md` — deep architecture notes, recent changes, known gaps.

## Architecture

The game lives in `index.html`. Modifications almost always happen inside the `<script>` block at the bottom.

### Top-level state (in script order)
- `SPRITES` — inline SVG icons keyed by name (wood, stone, gold, silver, axe, sword, shield, armor, flower, …). Recently redesigned with proper shading; used in the HUD and shop menus.
- `WORLD_WIDTH = 3200`, `WORLD_HEIGHT = 2400` — fixed world size; the canvas is just a viewport.
- `camera = {x, y}` — scrolls to follow local players. Set by `updateCamera()`.
- `gameState` — shared resources (wood, stone, gold, **silver**, **flowers**, raw/cooked meat), tools (`axe`, `pickaxe`, `sword`, **`armor`**, **`shield`**), time/day, message, `caveOpenings`, four menu flags (`shopOpen`, `blueprintShopOpen`, `flowerShopOpen`, `npcMenuOpen`) + their **`*OwnerCid`** counterparts, `placingBuilding` ({type,w,h,buyer} during placement mode), `deathTriggered`, `paused`. Tools and resources are shared between all players, not per-player.
- Networking globals: `netMode` (`'offline'|'host'|'client'`), `netSocket`, `netClientId`, `netRoom`.
- `keys` — event-code keyed map, populated by global `keydown`/`keyup` listeners.
- `players`, `entities`, `cows`, `zombies`, `npcs`, `buildings`, `mainCampfire` — created by `initWorld()` (host / offline) or rebuilt from network snapshots (client). `entities` now includes `flower` and `flower_shop` types.
- `prevCaveOpen`, `prevNight` — edge-detect flags.
- `fireOutSpawnTimer` — counts frames while the campfire is dead at night; at `FIRE_OUT_SPAWN_FRAMES = 180` (3 s @ 60 FPS) drops one zombie at the cave.
- `singlePlayer` — flag from the menu button (also used by host mode so the host starts solo and clients add slots as they join).
- `nightLayer` — offscreen canvas for the night overlay. Sized by `resizeViewport()`.
- `nextNpcId`, `deathTimeoutId` — counter for stable NPC ids, handle for the solo-death timer.

### Classes
- `Player` — movement + HP + held-item system. `update()` short-circuits while `this.downed` or `isMenuOpen()`. Reads movement from `networkInput` if present, otherwise from the global `keys` map. Has `isLocal`, `remoteClientId`, `networkInput`, `heldIndex`, `downed`. Methods: `getHeldItems()` (now includes `shield`), `getHeldItem()`, `cycleItem()`, `damage()` (armor + held-shield multipliers; downed/death routing), `heal()`, `draw()` (rotated + dimmed when downed, "DOWN — press F" badge).
- `Entity` — trees, rocks, **flowers** (drawn with stem + petals + pollen), shop, **blueprint_shop**, **flower_shop**, cave. `flower` entities carry a `flowerColor`. `respawnDay` and `chopProgress` are nullable.
- `Cow` — wandering animal with HP. Tethered loosely to `spawnX/spawnY`. `takeHit()` returns true on kill.
- `Campfire` — singleton. Fuel countdown + a warm glow ring always drawn while active.
- `Building` — player-placed structure. Has a `placed` flag — `false` = blueprint preview (no collision, no shelter, dashed translucent grid render); `true` = finished building. `drawBase()` / `drawRoof()`. `contains(player)` is a rectangular footprint test (returns false when not placed). `collides()` is for players, `zombieCollides()` treats the bottom wall as solid so zombies can't follow you through the door.
- `Zombie` — emerges from the cave on opens **and** drips out every 3 s when the fire's out at night. HP 40, 10 dmg, drops 5–14g. Targets only living, non-downed players; uses `Building.zombieCollides()`.
- `NPC` — friendly helper. Has a stable `id` (from `nextNpcId`) and a `nightHome`. By day runs the task last set during the night (`idle` / `chop` / `hunt`); by night `_claimNightHome()` claims the first unclaimed placed building (one per NPC) or falls back to the campfire, and `_goHome()` walks them there.

### `checkInteractions()` priority order
For each player, on action press (consumed once per press: local via `keys[code] = false`, remote via `networkInput.actionLatch = false`). Downed players are skipped entirely.

-1. **Revive** — if a teammate within 60px is downed, F revives them to 50 HP. Highest priority so you can revive next to a shop.
0.  **Placement mode** — if `gameState.placingBuilding.buyer === player`, F drops an unplaced `Building` at the player's clamped position.
1.  Shop / blueprint_shop / flower_shop within 70px — opens overlay menu.
1.25 Standing on an unplaced blueprint within 70px — flips `placed = true`.
1.5 NPC within 60px — opens NPC management menu.
2.  Nearest enemy within 55px (zombies > cows) — 5 dmg bare-handed, 20 with sword held.
3.  Trees / rocks / **flowers** / cave within range (60 for trees/rocks/cave, 45 for flowers — checked first in the loop, no tool required).
4.  Campfire within 60px — cook raw meat if present, else add wood to refuel.
5.  Open field — eat the food the player is currently holding.

Action results depend on what the player is **holding**, not just what they own:
- Tree: axe held → 1-hit (+7 wood). Otherwise 4-hit chop (`chopProgress`) for +3 wood total.
- Rock: pickaxe held required.
- Cow / zombie: sword held → 20 dmg; otherwise 5.
- Eat: only consumes the meat type currently held.
- **Damage taken** (Player.damage): armor multiplies by 0.6 (passive); shield multiplies by 0.5 when it's the held item. Both stack. Clamped to ≥1 HP per hit.

The 55 vs 60 vs 45 gap on cows/zombies/trees/flowers is deliberate.

### Held-item system
- `Player.heldIndex` rotates through `getHeldItems()` = `[hands, axe?, pickaxe?, sword?, shield?, cookedMeat?, rawMeat?]` (skipping items not owned / count zero).
- Cycle keys: **P1 = `KeyE`**, **P2 = `KeyK`**. The cycle keydown listener has an `e.repeat` guard and a `netMode === 'client'` guard.
- Remote players: client sends `{type:'input', switchPress:true}` → host sets `networkInput.switchLatch = true` → gameLoop consumes it at the top of each tick and calls `cycleItem()` on that player.

### Menus
Four menus, each with its own DOM overlay (`#shop-menu`, `#bp-menu`, `#flower-menu`, `#npc-menu`), `gameState.*Open` flag, and **`gameState.*OwnerCid`** (0 = host, >0 = client). `isMenuOpen()` ORs all four `*Open` flags.

Each menu's digit-key handler now early-returns if the current browser doesn't own that menu (`myCid = (netMode === 'client') ? netClientId : 0`). Close keys accept the matching digit, **Esc**, **or** the player's interact key (F / L); the handler also writes `keys[code] = false` to consume the press so the next frame's `checkInteractions` doesn't immediately reopen the shop.

Specific menus:
- **Shop** — 1/2/3 sell 1/10/all wood @ 5g each; 4/5/6 buy axe (20g) / pickaxe (25g) / sword (30g); 7/Esc/F close.
- **Blueprint shop** — 1/2/3 buy small_shack (30 wood) / stone_cottage (20w + 25s) / watch_tower (15w + 40s + 20g); 4/Esc/F close. Purchase **deducts materials and enters placement mode** — `gameState.placingBuilding = { type, w, h, buyer }`. The buyer moves around with a translucent ghost rendered after the building roof pass; F drops an unplaced blueprint at their feet; Esc cancels and refunds.
- **Flower shop** — 1/2/3 sell 1/10/all flowers @ 3 silver each; 4 buys passive Armor (50 silver), 5 buys held Shield (40 silver); 6/Esc/F close.
- **NPC menu** — 1/2/3 set task to chop / hunt / idle (only at night; daytime call returns with a message and dims the buttons); 4/5/6 buy NPC axe/pickaxe/sword (any time); 7 collects 25% of NPC earnings; 8/Esc/F close. Resolves `activeNPC` from `activeNPCId` each refresh so it survives snapshot rebuilds.

### Buildings
- Drawn in two passes: bases (floor, walls, door) sort with the other world objects in the y-sort queue; roofs draw in a separate pass after the y-sort. Unplaced blueprints draw a dashed translucent grid + "BLUEPRINT / Press F to build" label and skip the roof.
- A player is "inside" a building if `Building.contains(player)` is true (and the building is placed). Inside players get their y bumped slightly so walls don't paint over them in the y-sort.
- **Roof alpha**: `1.0` when no one is inside, **`0` when any player is inside** — the building reads as a clean top-down view of the interior.
- **Zombies cannot enter buildings.** `Building.zombieCollides()` treats the bottom wall as solid; players still walk through the door via `Building.collides()`.

### Day/night lighting + countdown
- `getNightOpacity()` returns a smooth `0..0.6` alpha through dusk (18:00–20:00), full night (20:00–05:00), and dawn (5:00–7:00).
- The dark overlay is rendered to an offscreen `nightLayer` in screen coords. `destination-out` cuts halos in it (players, campfire, three shops), and `ctx.drawImage(nightLayer, 0, 0)` composites it onto the main canvas **after** the world has been rendered. Critical: putting `destination-out` directly on the main canvas would erase the world pixels and produce black holes.
- Halos: Player → r=220 crisp daylight circle. Campfire → r=360. Shop / blueprint shop / flower shop → soft 150px lantern.
- `isNightTime()` is kept for **gameplay** rules. `isCaveOpen()` returns `isNightTime() || gameState.day >= 10`.
- `timeUntilFlip()` returns real-time seconds + a `"Night in m:ss"` / `"Day in m:ss"` label; used by `updateUI` to render a colored countdown in the HUD (amber under 30 s, red under 10 s).

### Main loop (`gameLoop`)
1. Bail out if the game isn't running.
2. If `netMode !== 'client'` and `!paused`: process remote switch latches, advance time/day, run `mainCampfire.update`, `players/cows/zombies/npcs.forEach(.update())`, edge-detect cave open → spawn a wave of zombies (`1 + caveOpenings`, capped at 12) and on every 5th opening spawn an NPC near the campfire, **tick `fireOutSpawnTimer` if fire's out at night and drop one zombie every 180 frames**, trim dead zombies/npcs, respawn sweeps, `checkInteractions()`.
3. Network I/O: host broadcasts a state snapshot ~20Hz; client sends keystate ~30Hz (paused-aware).
4. `updateCamera()` (averages `players` filtered to `isLocal !== false`).
5. Compute `player.insideBuilding`.
6. Render: `ctx.save() / translate(-camera)` → ground/grid → y-sorted draw queue (entities + cows + zombies + npcs + building bases + players + campfire) → roofs (alpha 0 if any player is inside) → **placement-mode ghost** (a transient `Building` at the buyer's clamped pos) → `ctx.restore()` → composite night overlay → `updateUI()`.

### Network (host-authoritative relay)
- `server.js` is a tiny Node `http.createServer` + `ws.WebSocketServer` on the same port.
  - HTTP serves static files (traversal guard + denylist) and also responds to `GET /lan` with `{ips, port}` (IPv4 non-internal interfaces).
  - WS handles rooms (first `?role=host` socket per room owns the simulation; host messages broadcast to clients; client messages forwarded to host with an injected `clientId`).
  - Server emits `role`, `client_join`, `client_leave`, `host_left`, `error`.
  - On startup logs the LAN URLs to the terminal.
- Client (`netStart`, `async`): prompts for relay URL + room, opens the socket, waits for `{type:'role',...}`.
  - **Hosts** fetch `/lan` first to prefill the relay-URL prompt with `ws://<lan-ip>:<port>` and list http share URLs above the field. If `/lan` fails (page on `file://`, old server), falls back to `detectLanIPsViaWebRTC` (captures bare IPv4s and any `…local` mDNS hostnames). After connecting, `showHostBanner(room)` pops a persistent banner above the canvas with the share URLs + Copy button.
  - **Host**: `singlePlayer = true`; `initWorld()` seeds only the host's player. Each `client_join` calls `addRemotePlayer(clientId)`.
  - **Client**: starts empty, populates from `{type:'state',...}` by rebuilding `players`/`cows`/`zombies`/`npcs`/`entities`/`buildings` and mutating `gameState`/`mainCampfire`. NPCs preserve their `id` across snapshots so the NPC menu can resolve `activeNPCId`. Players whose `cid` matches `netClientId` get `isLocal = true`.
- Inputs from client: keystate (up/down/left/right) at ~30Hz plus one-shot `actionPress` / `switchPress` on keydown.
- **Shop UI per-client**: every `open*` function checks `player.remoteClientId`. For a remote buyer it sets `gameState.*OwnerCid = cid`, sends `{type:'menu_open', kind, cid, buyer, [npcId]}`, and **does not show the host's DOM**. The matching client's `handleRemoteMenuOpen` shows the UI. Client-side action functions (`shopBuy`, `shopSellWood`, `buyBlueprint`, `flowerSell`, `flowerBuy`, `npcSetTask`, `npcBuyTool`, `npcCollectShare`, and every close handler) detect `netMode === 'client'` and forward `{type:'shop_action', kind, action, …}` instead of running locally. Host's `handleClientShopAction` validates the sender owns the menu, then calls the real function. On close, host sends `{type:'menu_close', kind, cid}` so the client tears down its UI. The host snapshot does **not** broadcast `*Open` / `*OwnerCid` — UI visibility is purely event-driven; only `gameState` scalars (gold, silver, tools, …) ride the snapshot so an open client UI auto-refreshes after each host-side action.

### Death & revive
- `Player.damage()` applies armor (×0.6 passive) and shield (×0.5 if held), clamped to ≥1.
- At 0 HP: if `players.length > 1`, set `this.downed = true` (Player.update + Player.draw + zombie targeting + checkInteractions all skip downed); if every player is now downed, `triggerDeath(this)`. Otherwise (solo): `triggerDeath(this)`.
- `triggerDeath` shows the `#death-overlay` (`YOU DIED`), sets `gameState.deathTriggered = true`, and queues a 5-second `setTimeout` (`deathTimeoutId`) that calls `exitToMenu`. `exitToMenu` clears the timeout and the overlay.
- Co-op revive: another player walks within 60px of a downed teammate and presses F (priority -1 in `checkInteractions`). Revives to 50 HP.

### UI
- HUD: clock-day-and-countdown, encounters, resources line (wood / stone / gold / silver / flowers), food (raw / cooked), tools (held tools incl. armor / shield), per-player HP + held-item sprite + cycle-key hint, campfire fuel %, message line.
- **Pause**: button (top-right) + **P** key. Toggles `gameState.paused` — the gameLoop still runs for rendering, but skips all simulation.
- **Exit**: button (top-right, below pause). Closes the socket, resets `netMode`, resets `gameState` resources/day/tools/messages/owner cids/placing/death, hides in-game UI, shows the main menu.
- **Save**: 💾 button below Exit. Calls `saveGame()` which serializes the full world. Refuses to save while `netMode !== 'offline'`.
- **Load Saved Game**: main-menu button → `loadGame()`. Closes any active socket, switches to `netMode = 'offline'`, recreates every class from the snapshot, defensively merges `gameState.tools` to include armor/shield, and starts the loop.
- **Host banner**: appears under the canvas after `role:host` is confirmed; shows LAN URLs + Copy + ×.
- **Death overlay**: full-screen "YOU DIED" with a 5-second timer to the menu.

## Gotchas

- **`initWorld()` rebuilds the world** (resets `nextNpcId` too). Called from `startGame` (offline) and `startNetworkedGame` (host only). Calling it mid-game wipes progress. `resizeViewport()` is what's wired to the window resize event now — it only resizes the canvas (and `nightLayer`), never the world.
- **Input is keyed by `event.code`**, not `event.key`. New keybinds need codes like `'KeyF'`, `'Digit1'`, `'Numpad1'`, `'Escape'`, `'ArrowUp'`. Remote player slots use deliberately fake codes (`__net_*`) so local keypresses can't accidentally drive a remote.
- **Action key consumed once per press**: either via `keys[code] = false` (local) or by clearing `networkInput.actionLatch` (remote). Any new interact-path must follow the same pattern. Menu-close handlers also clear `keys[code]` so the shop the player is standing on doesn't immediately re-open.
- **Cycle key has two listeners**: one that calls `cycleItem` locally (skipped on client), and one that sends `switchPress` to the host (only on client). They're guarded by `netMode` — don't merge them.
- **Night halos require the offscreen `nightLayer`** — `destination-out` directly on the main canvas would also erase the world. If you refactor the lighting, keep the offscreen-then-`drawImage` pattern.
- **Buildings shelter via `zombieCollides()`** — keep the "no door gap" version intact when refactoring `Building`. Players use the regular `collides()` (with the door gap).
- **Placement mode is host-only.** `gameState.placingBuilding.buyer` is a live object reference and is **not** broadcast — so a remote client buying a blueprint won't see their own ghost. Buying still works (client sends `shop_action buy` → host enters placement → host's F drop creates the unplaced blueprint), but visualisation needs `{type,w,h,buyerCid}` serialized to fix.
- **NPCs are looked up by id** in network code and in `refreshNPCMenu` — never assume the array index is stable.
- **Shop menu ownership**: every `open*` function and every digit-key handler is `cid`-aware. Don't bypass the `OwnerCid` checks or you'll re-introduce the "host sees client's shop" bug.
- **Single-player vs co-op vs host** is decided by the menu button. Single-player → `singlePlayer=true`. Co-op → `singlePlayer=false`. Host → `singlePlayer=true` (clients add slots dynamically). Client → no `initWorld`, world arrives via state snapshots.
- **Save is single-slot and offline-only** — `localStorage['abandon_save_v1']` is overwritten on every save; there's no auto-save, no slot picker, and no save during Host/Join (`saveGame` short-circuits when `netMode !== 'offline'`).
- **No determinism** — `Math.random()` everywhere, so reloads from before the same wave produce different spawns / drops.

## Where things are documented

- **`README.md`** — player-facing: controls, shop prices, day cycle, hosting / joining, death/revive, placement, NPCs.
- **`HANDOFF.md`** — deeper architecture notes plus a "Done since last handoff" log of recent changes and a "Known gaps" list. Read this before non-trivial changes.
