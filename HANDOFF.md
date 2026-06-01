# Handoff Notes

For the next session picking up this project. The whole game is in `index.html`.

## Architecture at a glance

Single HTML file with three sections:
1. `<style>` — menu, UI, shop overlay
2. `<body>` — main menu, in-game UI HUD, shop menu overlay, canvas
3. `<script>` — game logic (one IIFE-free top-level scope)

### Top-level globals
- `gameState` — shared inventory + flags (wood, stone, gold, rawMeat, cookedMeat, tools, time, day, shopOpen, message).
- `players` — array of `Player`. Single-player mode pushes only one entry.
- `entities` — static world objects: trees, rocks, shop, cave.
- `cows` — animals (separate array so they can wander/update each frame).
- `mainCampfire` — singleton `Campfire`.
- `keys` — `keydown`/`keyup` map keyed by `event.code`.
- `singlePlayer` — flag set by the menu button.

### Classes
- `Player` — movement, HP, `damage()`/`heal()`. Frozen while `gameState.shopOpen`.
- `Entity` — trees, rocks, shop, cave. Has `respawnDay` (nullable). Render branches on `type`.
- `Cow` — wandering AI (random direction every 1–4s, loose tether to spawn point), HP, `takeHit()` returns true on kill.
- `Campfire` — fuel countdown + warm glow ring (always drawn while active).

### Main loop (`gameLoop`)
1. Advance time, roll over day at 24:00.
2. Update campfire, players, cows.
3. Sweep `entities` and `cows` for respawn (compare `respawnDay` to `gameState.day`).
4. `checkInteractions()` — handles action-key presses, prioritized.
5. Render ground → grid → render queue (sorted by `y` for fake depth) → night overlay.
6. `updateUI()` — refresh HUD + shop menu if open.

### `checkInteractions` priority order
For each player, on action keypress:
1. Shop (opens menu, returns)
2. Cow attack (nearest within 55px)
3. Tree / rock / cave (within 60px, first match wins)
4. Campfire (within 60px) — cooks if raw meat present, else refuels
5. Open field — eat (cooked preferred, raw causes damage)

This ordering is load-bearing. Eating only happens if **nothing else** matched.

### Shop menu
- Pops up centered, frozen-game-style (players can't move).
- A second `keydown` listener handles digits 1–5 + Esc only when `gameState.shopOpen`.
- `refreshShopMenu()` re-renders option labels; called on open, on every purchase, and every frame via `updateUI` (cheap, just DOM text writes).

## Done in last session
- Single-player menu option + `singlePlayer` flag.
- Interact key remapped: P1 → **F**, P2 → **L**.
- Shop sells wood (2g/each) and sells tools (axe 20g, pickaxe 25g, sword 30g).
- Shop menu overlay UI with number-key selection.
- Campfire warm glow ring on the ground (visible day and night).
- HP system on players + respawn at campfire on death.
- Cows: wander, take damage, drop 2 raw meat, respawn next day.
- Rocks: require pickaxe, yield 2 stone, respawn after 2 days.
- Trees: yield depends on axe (3 → 7 wood), respawn after 1 day.
- Cooking on campfire: 1 raw → 1 cooked.
- Eating: cooked heals 30 HP, raw damages 20 HP.
- HUD now shows food, tools, and per-player HP.

## Known gaps / possible next steps
- **Cave combat** — cave opens at night but there's no monster spawn or combat encounter inside yet. Cave is just a flavor message. Cave-day-10 “trembles” event message exists but doesn't do anything.
- **Stone has no use** — mining works, but nothing consumes stone. Add stone-cost recipes (e.g., furnace, walls, upgrades).
- **No save/load** — refresh wipes everything.
- **Network modes** — buttons exist but alert that a backend is needed.
- **No hunger/thirst** — only HP. The food system is healing-only, not survival pressure.
- **Per-player inventory** — currently everything is shared (`gameState`). If true co-op feel is wanted, split tools/resources per player.
- **No SFX or music**.
- **No win condition** — day 10 message is the only late-game hook.

## Gotchas
- `resizeCanvas()` re-creates `players`, `entities`, `cows`, and `mainCampfire` from scratch — so a window resize mid-game **wipes progress in-place**. The `gameRunning` guard on resize prevents this once the game starts; if you change that, be careful.
- `Player.damage()` references `mainCampfire` — only safe because it's only called during gameplay.
- The shop's `keydown` listener is registered globally (no removal). Fine for a single-page game, but don't forget if you ever split files.
- Cow attack range (55) is intentionally smaller than tree/rock range (60) — keeps tree-chopping from accidentally hitting a cow that wandered into the same spot. Reversing the priority would change the feel.
- All randomness uses `Math.random()` — no seed. Replays won't be deterministic.

## File map
- `index.html` — game
- `README.md` — player-facing
- `HANDOFF.md` — this file
