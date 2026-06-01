# Handoff Notes

For the next session picking up this project. The game proper is `index.html`; networked play adds `server.js`.

## Architecture at a glance

### `index.html`
Single HTML file with three sections:
1. `<style>` — menu, UI, shop & blueprint-menu overlays, pause/exit buttons.
2. `<body>` — main menu, HUD, shop menu, blueprint menu, pause/exit buttons, pause overlay, canvas.
3. `<script>` — all game logic in one top-level scope.

### Top-level globals
- `gameState` — shared inventory + flags (wood, stone, gold, raw/cooked meat, tools, time, day, message, `shopOpen`, `blueprintShopOpen`, `paused`).
- `players` — array of `Player`. Single-player pushes one entry; local co-op two; networked host adds one slot per remote client.
- `entities` — static world objects: trees, rocks, shop, blueprint shop, cave.
- `cows` — animals (separate array because they wander).
- `buildings` — player-built structures from the blueprint shop.
- `mainCampfire` — singleton `Campfire`.
- `keys` — `keydown`/`keyup` map keyed by `event.code`.
- `singlePlayer` — flag from the menu button (only relevant for offline modes).
- `WORLD_WIDTH` / `WORLD_HEIGHT` = `3200 × 2400` — fixed world size.
- `camera = {x, y}` — scrolls to follow the local player(s).
- Network: `netMode` ('offline' | 'host' | 'client'), `netSocket`, `netClientId`, `netRoom`.
- `SPRITES` — inline SVG icons keyed by name (used in HUD and shop menus).
- `HELD_LABEL` — display names for held items.

### Classes
- `Player` — movement + HP + `damage()`/`heal()` + held-item cycling (`heldIndex`, `getHeldItems`, `getHeldItem`, `cycleItem`). `isLocal` and `networkInput` are set for remote-controlled slots. Update is short-circuited by `isMenuOpen()`.
- `Entity` — trees, rocks, shop, blueprint_shop, cave. `type` field branches rendering and interaction. `respawnDay` and `chopProgress` are nullable.
- `Cow` — wandering AI (random direction every 1–4s, loose tether), HP, `takeHit()` returns true on kill.
- `Campfire` — fuel countdown + warm glow ring (always drawn while active).
- `Building` — `drawBase()` for floor/walls/door, `drawRoof()` for the roof. `contains(player)` is the rectangular footprint test.

### Main loop (`gameLoop`)
1. Skip simulation entirely if `netMode === 'client'` or `gameState.paused`.
2. Consume any remote `switchLatch` flags (each calls `player.cycleItem`).
3. Advance time, roll over day at 24:00.
4. Update campfire, players, cows.
5. Sweep `entities` and `cows` for respawn.
6. `checkInteractions()`.
7. Host: broadcast a state snapshot every 3 frames (~20Hz). Client: send keystate every 2 frames (~30Hz, paused-aware).
8. `updateCamera()` (follows only `isLocal !== false` players, falling back to all if none).
9. Compute per-player `insideBuilding` for roof transparency / sort bump.
10. Translate canvas by `-camera`, then render: ground → grid → y-sorted (entities + cows + building bases + players + campfire) → roofs (alpha 0 if any player is inside, else 1) → night overlay + halos.
11. `updateUI()`.

### `checkInteractions` priority order
Per player, on action press (consumed once per press):
1. Shop / blueprint_shop within 70px — opens menu.
2. Nearest cow within 55px — attack (5 dmg bare-handed, 20 with sword held).
3. Trees / rocks / cave within 60px — chop / mine / cave-prompt.
4. Campfire within 60px — cook raw meat (priority) or add wood to refuel.
5. Open field — eat the food the player is currently holding.

Ordering is **load-bearing**. The 55 vs 60 gap on cows is deliberate. Eating is keyed on what's held (not "whatever you have"), so cycling to the right food matters.

### Held-item system
- `Player.heldIndex` rotates through the list returned by `getHeldItems()`: `[hands, axe?, pickaxe?, sword?, cookedMeat?, rawMeat?]`. Optional entries are skipped when count/ownership is zero/false.
- Switch key: P1 = `KeyE`, P2 = `KeyK`. The global `keydown` listener (with `e.repeat` filter and a `netMode === 'client'` guard) calls `cycleItem()` on the matching local player.
- Remote players cycle by sending `{type:'input', switchPress:true}`; host queues it in `networkInput.switchLatch` and consumes it at the top of `gameLoop`.

### Day/night lighting
- `getNightOpacity()` returns a smooth 0..0.6 alpha across dusk (18–20), full night (20–05), dawn (5–7).
- The night overlay is built on an **offscreen `nightLayer` canvas** (sized by `resizeViewport()`), then composited onto the main canvas with `ctx.drawImage` after the world is rendered. This is critical: `destination-out` on the main canvas would also erase the underlying world pixels, leaving black holes. Doing the cuts on the offscreen layer means only the overlay is erased — daytime visuals show through the halos.
- Cutouts on `nightLayer` use **screen coords** (`world - camera`):
  - Each player → solid clear circle (r=220, hard rim at 96–100%).
  - Campfire → same shape, r=360.
  - Shop / blueprint shop → soft 150px lantern.
- `isNightTime()` is kept for **gameplay** (camp/shop checks); `isCaveOpen()` returns `isNightTime() || gameState.day >= 10`.

### Shop & blueprint shop
- Both have their own DOM overlay (`#shop-menu`, `#bp-menu`).
- Shop digit keys: 1–3 sell wood (1 / 10 / all @ 5g each), 4–6 buy axe/pickaxe/sword, 7 / Esc close.
- Blueprint digit keys: 1–3 buy small shack / stone cottage / watch tower, 4 / Esc close. Purchase spawns a new `Building` south of the buyer, clamped to world bounds.
- Each menu sets a `gameState.*Open` flag; `isMenuOpen()` freezes movement and gates the cycle key.

### Network model (host-authoritative relay)
- `server.js`: a Node `http.createServer` + `ws.WebSocketServer` on the same port.
  - HTTP: serves static files from the project root, with denylist + traversal guard.
  - WS: rooms keyed by `?room=`; the first `?role=host` socket owns the simulation. Messages from host broadcast to clients; client→host messages get an injected `clientId`. Server emits `role`, `client_join`, `client_leave`, `host_left`, `error`.
- Client (`netStart`): prompts for relay URL (defaults to same-origin `ws[s]://location.host`) and room, opens the socket, waits for `{type:'role',...}`.
  - **Host**: `singlePlayer=true` so `initWorld` only seeds the host's own player; each `client_join` calls `addRemotePlayer(clientId)` which creates a `Player` with `isLocal=false`, `remoteClientId`, fake control codes, and a `networkInput` object.
  - **Client**: starts with empty arrays + a placeholder campfire; on `{type:'state',...}` it rebuilds `players`/`cows`/`entities`/`buildings` and mutates `gameState`/`mainCampfire`. Players whose `cid` matches `netClientId` get `isLocal=true` so the camera follows them.
- Inputs: client sends `{type:'input', up,down,left,right}` ~30Hz, plus one-shot `{actionPress:true}` / `{switchPress:true}` on keydown. Host applies them to that player's `networkInput`; `Player.update` reads from it; `checkInteractions` consumes `actionLatch`; the gameLoop consumes `switchLatch`.

### UI
- HUD: clock-day, resources line, food line, tools (held tools list), per-player HP + held-item sprite + cycle-key hint, campfire fuel %, message line.
- Pause: button + **P** key (filtered `e.repeat`, blocked while a menu is open) toggles `gameState.paused`. The gameLoop still runs (rendering + rAF) but skips simulation. Exit button hides UI, resets net state, resets `gameState` resources/day/tools, shows the main menu.

## Done since last handoff
- World 3200×2400 with scrolling camera (was canvas-sized).
- 70 procedurally scattered trees, 8 hand-placed rocks, blueprint shop.
- Trees take 4 hits without an axe (`chopProgress`). Rocks respawn 1d (was 2d).
- Shop sells wood at 5g (was 2g); sell-1 / sell-10 / sell-all options.
- Inline SVG `SPRITES` table; HUD and shop rows render icons inline.
- Held-item system + cycle keys (E / K) — action/eat behavior now depends on what's held.
- Blueprint shop with three buildings; buildings spawn south of the buyer.
- Building roofs vanish when a player is inside (top-down view of the interior).
- Day/night smooth fade via `getNightOpacity` (dusk/dawn windows).
- Crisp daylight halos around the player and campfire at night (no warm bloom / haze).
- Cave unlocks permanently from day 10 (`isCaveOpen()`).
- Pause button + P key; exit button returns to main menu and disconnects.
- Improved shop sprite; new blueprint-shop sprite.
- New `server.js` (HTTP + WebSocket relay on one port); `Host`/`Join` menu buttons work end-to-end.

## Known gaps / next steps
- **Shop UI doesn't sync over the network** — only the host sees and drives the menu. Remote clients pressing interact near a shop will open it on the host's screen but can't navigate it. Fix: serialize `shopOpen` / `blueprintShopOpen` + open-buyer and let the client render its own menu.
- **No client-side prediction / interpolation** — remote movement is a beat behind. Lerp between snapshots is the right next step.
- **Cave combat** — still just a flavor message after day 10.
- **Stone has limited use** — only blueprints consume it. No furnace / upgrades.
- **No save/load** — exit-to-menu resets `gameState`; refresh wipes the run.
- **Per-player inventory** — tools and resources are still shared via `gameState`.
- **No hunger/thirst, SFX, music, or win condition.**
- **Server has no auth, no rate limits, no TLS** — fine for LAN / trusted use; in front of the public internet you should at least put it behind a reverse proxy.

## Gotchas
- **`initWorld()` rebuilds the world.** Called from `startGame` / `startNetworkedGame` (host only). `resizeViewport()` is what's wired to the window-resize event now — that only resizes the canvas, never the world. Don't call `initWorld()` mid-game.
- **Input is keyed by `event.code`**, not `event.key`. New keybinds need codes like `'KeyF'`, `'Digit1'`, `'Numpad1'`, `'Escape'`, `'ArrowUp'`. Remote player slots use deliberately fake codes (`__net_*`) so local keypresses can't drive a remote.
- **Action key is consumed once per press**: either via `keys[code] = false` (local) or by clearing `networkInput.actionLatch` (remote). New interact paths must follow the same pattern.
- **`Player.damage()` references `mainCampfire`** for respawn — only safe because it's not called before gameplay starts.
- **Cycle key has two listeners**: one that calls `cycleItem` for local players (skipped on client), and one that sends `switchPress` to the host (only on client). Don't merge them — they're guarded by `netMode`.
- **`buildings[]` is host-authoritative** in networked mode. Clients receive the full list each snapshot and recreate `Building` instances; methods are reattached automatically.
- **No save/load and no determinism** — `Math.random()` everywhere, refresh wipes the run.

## File map
- `index.html` — game
- `server.js` — HTTP + WS relay
- `package.json` — `ws` dependency
- `.gitignore` — local junk (`temp.txt`)
- `README.md` — player-facing
- `HANDOFF.md` — this file
- `CLAUDE.md` — guidance for AI assistants
