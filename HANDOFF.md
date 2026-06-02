# Handoff Notes

For the next session picking up this project. The game proper is `index.html`; networked play adds `server.js`.

## Architecture at a glance

### `index.html`
Single HTML file with three sections:
1. `<style>` — menu, UI, shop / blueprint / flower / NPC menu overlays, pause/exit/save buttons, death overlay, host banner.
2. `<body>` — main menu, HUD, four menu overlays, pause/exit/save buttons, host banner, pause + death overlays, canvas.
3. `<script>` — all game logic in one top-level scope.

### Top-level globals
- `gameState` — shared inventory + flags. Resources: `wood`, `stone`, `gold`, `silver`, `flowers`, `rawMeat`, `cookedMeat`. Tools: `axe`, `pickaxe`, `sword`, `armor`, `shield`. Time: `time`, `day`. Menu flags: `shopOpen`, `blueprintShopOpen`, `flowerShopOpen`, `npcMenuOpen`, plus a matching `*OwnerCid` for each (0 = host, >0 = a client) so each browser only drives its own menu. Placement: `placingBuilding` ({type, w, h, buyer}) while the player is moving a ghost around. Death: `deathTriggered`. Plus the existing `paused`, `caveOpenings`, `encounters`, `zombiesKilledTonight`, `message`, `messageTimer`.
- `players` — array of `Player`. Single-player pushes one entry; local co-op two; networked host adds one slot per remote client.
- `entities` — static world objects: trees, rocks, **flowers**, shop, blueprint shop, **flower shop**, cave. Flowers carry an extra `flowerColor`.
- `cows` / `zombies` / `npcs` — separate arrays. NPCs now carry a stable `id` (`nextNpcId` counter) for cross-network identification.
- `buildings` — player-placed structures. Each has a `placed` flag (`false` = translucent blueprint preview, `true` = finished building).
- `mainCampfire` — singleton `Campfire`.
- `keys` — `keydown`/`keyup` map keyed by `event.code`.
- `singlePlayer` — flag from the menu button (only relevant for offline modes).
- `WORLD_WIDTH` / `WORLD_HEIGHT` = `3200 × 2400`.
- `camera` — scrolls to follow the local player(s).
- Network: `netMode` ('offline' | 'host' | 'client'), `netSocket`, `netClientId`, `netRoom`.
- Spawn / loop helpers: `prevCaveOpen`, `prevNight`, `fireOutSpawnTimer`, `FIRE_OUT_SPAWN_FRAMES = 180`.
- `deathTimeoutId` — handle for the 5-second `setTimeout` that bounces solo deaths back to the menu.
- `SPRITES` — redesigned inline SVG icons (logs with rings, faceted stone, coin/silver with stamp, drumstick meat with bone, fully shaded sword/axe/pickaxe, kite shield, plated chestplate, clock with tick marks, flower with petals + leaves, etc.).
- `HELD_LABEL` — display names; includes `shield`.

### Classes
- `Player` — movement + HP + `damage()` / `heal()` + held-item cycling. `damage()` now applies armor (×0.6 passive) and shield (×0.5 only while held) before HP loss, clamps to ≥1. At 0 HP: if `players.length > 1` → `this.downed = true` (sprite rotates sideways, dims to 55% alpha, "DOWN — press F" badge drawn above); else → `triggerDeath(this)`. If *every* player is simultaneously downed, `triggerDeath` fires. A downed player is skipped by `update`, `checkInteractions`, and zombie targeting.
- `Entity` — trees, rocks, flowers (small shadow, stem, leaf, 5 petals, pollen dots, picked at <45px without a tool), shop, blueprint_shop, flower_shop, cave.
- `Cow` / `Zombie` — unchanged in shape; zombie movement collides against placed buildings via `Building.zombieCollides()` (no door gap).
- `Campfire` — singleton + warm glow ring.
- `Building` — adds `placed` flag and a `zombieCollides()` method that treats the bottom wall as solid (so the building is real shelter; players still walk through the door). `drawBase` renders blueprints as a dashed translucent grid + "BLUEPRINT / Press F to build" label; `drawRoof` early-returns if `!placed`.
- `NPC` — adds `id`, `nightHome`. `update()` checks `isNightTime()` and routes through `_claimNightHome()` (first unclaimed placed building wins per-NPC, otherwise campfire) + `_goHome()`; dawn clears `nightHome` and the previous-night task resumes. The NPC menu only allows task changes at night (`npcSetTask` rejects daytime calls with a message).

### Main loop (`gameLoop`)
1. Skip simulation entirely if `netMode === 'client'` or `gameState.paused`.
2. Consume any remote `switchLatch` flags.
3. Advance time, roll over day at 24:00.
4. Update campfire, players, cows, zombies, NPCs.
5. Cave-open edge detect → spawn waves + maybe an NPC every 5th opening.
6. **Fire-out trickle**: if `!mainCampfire.active && isNightTime()`, tick `fireOutSpawnTimer`. At 180 frames (3 s @ 60 FPS) push one zombie at the cave and reset. Reset to 0 outside the condition.
7. Encounter counter on the night→day transition.
8. Trim dead zombies/NPCs.
9. Respawn sweep (entities, cows).
10. `checkInteractions()`.
11. Host: broadcast snapshot every 3 frames (~20Hz). Client: send keystate every 2 frames (~30Hz, paused-aware).
12. `updateCamera()` (follows only `isLocal !== false` players, falling back to all).
13. Per-player `insideBuilding` for roof transparency / sort bump.
14. Translate canvas by `-camera`; render ground → grid → y-sorted (entities + cows + zombies + NPCs + building bases + players + campfire) → roofs (alpha 0 if any player is inside) → **placement-mode ghost** (a transient `Building` at the buyer's clamped position) → night overlay + halos. Flower shop joins shop & blueprint shop in getting a lantern halo.
15. `updateUI()` — HUD day line includes the **countdown** (`Night in m:ss` / `Day in m:ss`, colored amber under 30 s and red under 10 s).

### `checkInteractions` priority order
Per player, on action press (consumed once per press); the function early-returns if the player is downed.

-1. **Revive a downed teammate** within 60px (sets `other.downed = false`, `other.hp = 50`).
0.  **Placement mode** — if `gameState.placingBuilding.buyer === player`, drop an unplaced `Building` at the player's clamped position and clear `placingBuilding`. Esc anywhere on the page refunds materials.
1.  **Shop / blueprint_shop / flower_shop** within 70px — opens that menu.
1.25 **Standing on an unplaced blueprint** within 70px — flips `b.placed = true`.
1.5 **NPC** within 60px — opens the NPC menu.
2.  Nearest enemy within 55px (zombies > cows) — 5 dmg bare-handed, 20 with sword held.
3.  Trees / rocks / **flowers** / cave within range (60 for trees/rocks/cave, 45 for flowers — flowers checked first inside the loop).
4.  Campfire within 60px — cook raw meat (priority) or add wood to refuel.
5.  Open field — eat the food the player is currently holding.

Ordering is **load-bearing**. The 55 vs 60 vs 45 gaps are deliberate. Eating is keyed on what's held.

### Held-item system
- `Player.heldIndex` rotates through the list returned by `getHeldItems()`: `[hands, axe?, pickaxe?, sword?, shield?, cookedMeat?, rawMeat?]`. Optional entries are skipped when count/ownership is zero/false.
- `damage()` reads `getHeldItem() === 'shield'` for the held-shield bonus.
- Switch key: P1 = `KeyE`, P2 = `KeyK`. The global `keydown` listener (with `e.repeat` filter and a `netMode === 'client'` guard) calls `cycleItem()` on the matching local player.
- Remote players cycle by sending `{type:'input', switchPress:true}`; host queues it in `networkInput.switchLatch` and consumes it at the top of `gameLoop`.

### Day/night lighting
- `getNightOpacity()` returns a smooth 0..0.6 alpha across dusk (18–20), full night (20–05), dawn (5–7).
- `timeUntilFlip()` returns real-time seconds + a "Night in m:ss" / "Day in m:ss" label. Conversion uses `TIME_SPEED * 60` in-game minutes per real second, so the math stays correct if you tweak the speed.
- Night overlay is built on an offscreen `nightLayer` canvas with `destination-out` halos for the player(s), the campfire, and the three shops, then composited onto the main canvas. The offscreen trick keeps the halos from eating the world.

### Menus
Four menus, each with its own DOM overlay and `gameState.*Open` flag and `gameState.*OwnerCid`:
- `#shop-menu` / `shopOpen` / `shopOwnerCid` — sell wood, buy axe/pickaxe/sword.
- `#bp-menu` / `blueprintShopOpen` / `blueprintShopOwnerCid` — buy a blueprint and enter placement mode.
- `#flower-menu` / `flowerShopOpen` / `flowerShopOwnerCid` — sell flowers (3 silver each), buy armor (50 silver, passive) and shield (40 silver, held).
- `#npc-menu` / `npcMenuOpen` / `npcMenuOwnerCid` — set task (night only), buy NPC tools, collect share.

`isMenuOpen()` ORs all four `*Open` flags and freezes player movement / blocks the cycle key.

Each menu's digit-key handler now early-returns if the current browser doesn't own that menu (`myCid = (netMode === 'client') ? netClientId : 0`). Closing accepts the matching digit, **Esc**, **or** the player's interact key (F / L); on close the handler also writes `keys[code] = false` so the next frame's `checkInteractions` doesn't immediately re-open the shop the player is still standing on.

### Network model (host-authoritative relay)
- `server.js`: Node `http.createServer` + `ws.WebSocketServer` on the same port.
  - HTTP: serves static files from the project root (denylist + traversal guard). Also exposes **`GET /lan`** which returns `{ips:[…], port}` — every non-internal IPv4 the box bound to.
  - On boot it logs every LAN URL so you can copy-paste from the terminal.
  - WS: rooms keyed by `?room=`; the first `?role=host` socket owns the simulation. Messages from host broadcast to clients; client→host messages get an injected `clientId`. Server emits `role`, `client_join`, `client_leave`, `host_left`, `error`.
- Client (`netStart`, now `async`):
  - **Hosts**: fetch `/lan` first. If it fails, fall back to a `RTCPeerConnection` ICE-candidate sniff (`detectLanIPsViaWebRTC`) which captures bare IPv4s and any `<uuid>.local` mDNS hostnames (modern browsers obfuscate the raw IP unless on a secure context). Prompt text shows the share URL list; default URL in the input is prefilled with `ws://<lan-ip>:<port>` instead of the stale `ws://localhost:8080`.
  - **All roles**: prompt for relay URL + room, open socket, wait for `{type:'role',...}`.
  - **Host post-connect**: `showHostBanner(room)` pops a persistent banner above the canvas with the share URLs, a Copy URL button, and an ×. `exitToMenu` hides it.
- Inputs: client sends `{type:'input', up,down,left,right}` ~30Hz, plus one-shot `{actionPress:true}` / `{switchPress:true}` on keydown. Host applies them to that player's `networkInput`.
- **Shop UI per-client (new)**: every `open*` function checks the buyer's `remoteClientId`. If host, behave as before. If a remote client, mark `gameState.*OwnerCid = cid` and send `{type:'menu_open', kind, cid, buyer, [npcId]}` instead of showing the host DOM. The matching client's `handleRemoteMenuOpen` shows the UI locally. Client-side action functions (`shopBuy`, `shopSellWood`, `buyBlueprint`, `flowerSell`, `flowerBuy`, `npcSetTask`, `npcBuyTool`, `npcCollectShare`, the close handlers, and the Esc-cancel in placement) detect `netMode === 'client'` and forward a `{type:'shop_action', kind, action, …}` message; the host's `handleClientShopAction` validates that the sender owns the menu, then runs the real function. Close round-trip: host's `closeShop()` sends `{type:'menu_close', kind, cid}` back to the matching client.
- The host snapshot does **not** broadcast menu flags or owner cids; UI visibility on the client is purely event-driven (`menu_open` / `menu_close`). `gameState` scalars (gold, silver, tools, …) still flow via the snapshot so the open shop UI on a client auto-refreshes after every host-side action.

### UI
- HUD: clock-day + countdown + encounters; resources line (wood / stone / gold / silver / flowers); food (raw / cooked); tools (held tools list, now including armor / shield sprites); per-player HP + held-item sprite + cycle-key hint; campfire fuel %; message line.
- Pause: button + **P** key (filtered `e.repeat`, blocked while a menu is open) toggles `gameState.paused`. The gameLoop still runs (rendering + rAF) but skips simulation.
- Exit button hides UI, resets net state, resets `gameState` resources/day/tools/messages/owner cids/placing/death, clears the death `setTimeout`, hides the host banner, and shows the main menu.
- Death overlay: full-screen black-out with red "YOU DIED" + "Returning to menu..." subtitle. Triggered by `triggerDeath`, cleared by `exitToMenu`.

### Save / load
- Single-slot localStorage save under `SAVE_KEY = 'abandon_save_v1'`.
- `saveGame()` is offline-only. Serializes `gameState` (including `silver`, `flowers`, full tools object, `caveOpenings`, `encounters`, `zombiesKilledTonight`), `prevCaveOpen`, `prevNight`, mainCampfire, every `Player`, `Cow`, `Zombie`, `NPC`, `Entity` (including `flowerColor`), and every `Building` (including `placed`).
- `loadGame()` is wired to the main menu **Load Saved Game** button. Forces offline mode, recreates all class instances, defensively merges `gameState.tools` with `{axe,pickaxe,sword,armor,shield}` so older saves without armor/shield don't crash, and starts the loop.
- Save button shows in `startGame` / `loadGame` and is hidden by `exitToMenu`; deliberately not shown by `startNetworkedGame`.

## Done since last handoff
- **Better player sprite, briefly** — reverted on request, but the held-item rendering, downed sprite, and HP-bar code added at the same time remain.
- **Flowers + silver + flower shop** — 50 procedurally scattered flowers (random color), pink-cottage flower shop in the SE. Sells flowers at 3 silver each. Buys passive **Armor** (-40% damage) and held **Shield** (-50% damage when held); they stack.
- **Building free-placement** — buying a blueprint enters placement mode; the buyer drags a translucent ghost around with WASD and presses F to drop. Esc refunds. The dropped blueprint stays unplaced until another F press at the blueprint itself.
- **Buildings are real shelter** — `Building.zombieCollides()` treats the bottom wall as solid so zombies can't follow you through the door. Players still can.
- **NPC night homes** — each NPC claims one placed building per night; spillover sleeps at the campfire.
- **NPC tasks set at night only** — `npcSetTask` rejects daytime calls; the menu dims those buttons during the day with a status hint.
- **Fire-out trickle** — if the campfire's out at night, a zombie pops out of the cave every 3 seconds.
- **Death + revive** — solo death triggers a YOU DIED screen + 5 s timer to the main menu. Co-op death goes downed; teammates revive within 60px with F. Zombies skip downed players. Whole-team down triggers solo-death path.
- **F / L closes any open shop menu**, with the key consumed so it doesn't re-open on the next frame.
- **More rocks** — 30 procedural rocks on top of the 8 hand-placed ones, with min-distance against trees/landmarks/other rocks.
- **Day/night countdown** in the HUD, amber under 30 s, red under 10 s.
- **Item sprites redesigned** — multi-stop logs, faceted stone, stamped coin/silver, drumsticks, fully-shaded weapons, heater shield, plated armor, etc.
- **Host LAN URL** — `server.js` exposes `/lan`; the in-game Host prompt prefills `ws://<lan-ip>:<port>`; a banner under the canvas shows http share URLs + Copy button. If the page is on `file://` or `/lan` fails, WebRTC ICE sniff provides a fallback (real IPv4s plus any `…local` mDNS hostnames).
- **Shop UI is per-client over the network** — each menu carries an owner cid. Host never shows a remote buyer's shop on its own screen; UI travels in a `menu_open` event to the matching client, and client digit-keys forward `shop_action` messages back to the host. Stable NPC IDs (`nextNpcId`) make the NPC menu work across snapshots that rebuild the array.

## Known gaps / next steps
- **Placement ghost only renders on the host.** Buying a blueprint as a client works end-to-end (the shop sends `buy` to host → host enters placement mode → host's F drops the ghost), but the client's screen does **not** show the translucent preview because `gameState.placingBuilding.buyer` is a live object reference. Fix: serialize `{type, w, h, buyerCid}` and resolve `buyer` by cid on the client.
- **No client-side prediction / interpolation.** Remote movement is one snapshot behind.
- **Cave combat** is still flavor only after day 10 — no boss, no loot.
- **Save slot is single** — `abandon_save_v1` is overwritten on every save. No named slots, no auto-save, no save during network play.
- **Per-player inventory** — tools and resources are still shared via `gameState`.
- **No hunger/thirst, SFX, music, or win condition.**
- **Server has no auth, no rate limits, no TLS** — fine for LAN / trusted use; in front of the public internet you should at least put it behind a reverse proxy.

## Gotchas
- **`initWorld()` rebuilds the world.** Called from `startGame` / `startNetworkedGame` (host only). Resets `nextNpcId` too. `resizeViewport()` is what's wired to the window-resize event now — that only resizes the canvas (+ `nightLayer`), never the world.
- **Input is keyed by `event.code`**, not `event.key`. New keybinds need codes like `'KeyF'`, `'Digit1'`, `'Numpad1'`, `'Escape'`. Remote player slots use deliberately fake codes (`__net_*`) so local keypresses can't drive a remote.
- **Action key is consumed once per press**: either via `keys[code] = false` (local) or by clearing `networkInput.actionLatch` (remote). New interact paths must follow the same pattern. Menu-close handlers also clear `keys[code]` to avoid reopening the shop the player is standing on.
- **Cycle key has two listeners** (local / client→host). Don't merge them.
- **`buildings[]` is host-authoritative.** Clients receive the full list each snapshot and recreate `Building` instances with `placed` preserved.
- **NPC menu must look up by id**, not by reference — `applyNetworkState` rebuilds the npcs array. `refreshNPCMenu` re-resolves `activeNPC` from `activeNPCId` on each call.
- **Shop close round-trip is idempotent.** Client's close hides UI locally + sends `shop_action close`. Host's close hides its (already hidden) UI + sends `menu_close` back. Client's `handleRemoteMenuClose` is a safe no-op when the UI is already hidden.
- **`Player.damage()` references `mainCampfire`** indirectly (only via `triggerDeath` now); no longer needed for respawn, but the death path still touches global state.
- **No determinism** — `Math.random()` everywhere, save/load is the only run persistence.

## File map
- `index.html` — game
- `server.js` — HTTP + WS relay (+ `/lan` JSON endpoint)
- `package.json` — `ws` dependency
- `.gitignore` — local junk (`temp.txt`)
- `README.md` — player-facing
- `HANDOFF.md` — this file
- `CLAUDE.md` — guidance for AI assistants
