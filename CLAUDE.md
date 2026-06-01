# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step, no dependencies, no test suite. Just `index.html`.

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Or open `index.html` directly in a browser.

There is no linter or test framework configured. Don't search for `package.json`, `Makefile`, or CI configs — none exist.

## Architecture

The entire game lives in **`index.html`** — HTML, CSS, and JS in one file. Modifications almost always happen inside the `<script>` block at the bottom.

### Top-level state (in script order)
- `gameState` — shared inventory (wood, stone, gold, rawMeat, cookedMeat, tools, time, day) plus `shopOpen` / `message` flags. **Tools and resources are shared between both players**, not per-player.
- `keys` — event-code keyed map, populated by global `keydown`/`keyup` listeners.
- `players`, `entities`, `cows`, `mainCampfire` — populated by `resizeCanvas()`.
- `singlePlayer` — set by menu button before `resizeCanvas()` runs.

### Classes
- **`Player`** — movement + HP + `damage()`/`heal()`. Update is short-circuited when `gameState.shopOpen` is true (movement freezes during shopping).
- **`Entity`** — trees, rocks, shop, cave. `type` field branches rendering and interaction. `respawnDay` (nullable) drives regrowth.
- **`Cow`** — wandering animal with HP. Tethered loosely to `spawnX/spawnY`. `takeHit()` returns true on kill.
- **`Campfire`** — singleton. Fuel countdown + a warm glow ring always drawn while active.

### `checkInteractions()` priority order
For each player, when the action key fires, the function tries options **in this order** and stops at the first match:

1. Shop (within 60px) — opens overlay menu, returns.
2. Nearest cow (within 55px) — attack.
3. Trees / rocks / cave (within 60px, first match wins).
4. Campfire (within 60px) — cooks raw meat if present, else refuels.
5. Open ground fallback — eat (cooked preferred, raw causes self-damage).

This ordering is **load-bearing for game feel**. The 55 vs 60 gap on cows is deliberate so trees take priority when both are in range. Reordering changes behavior.

### Shop menu
- Toggled by `gameState.shopOpen`. A **second** `keydown` listener (registered separately from the movement-keys one) handles digits 1–5 and Esc only while the menu is open.
- `refreshShopMenu()` writes labels into existing DOM nodes; it's called on open, after each purchase, and every frame from `updateUI()` (cheap text writes).

### Main loop (`gameLoop`)
Time advance → updates (campfire, players, cows) → respawn sweeps over `entities` and `cows` (compare `respawnDay` to `gameState.day`) → `checkInteractions()` → render (ground → grid → y-sorted queue of active entities + cows + players + campfire) → night overlay → `updateUI()`.

## Gotchas

- **`resizeCanvas()` rebuilds the world.** It recreates `players`, `entities`, `cows`, and `mainCampfire` from scratch — calling it mid-game wipes all progress. The window-resize listener guards against this with `if (!gameRunning)`. If you change that guard, save state first.
- **Input is keyed by `event.code`**, not `event.key`. New keybinds need codes like `'KeyF'`, `'Digit1'`, `'Numpad1'`, `'Escape'`, `'ArrowUp'`. P1 action is `KeyF`, P2 is `KeyL`.
- **Interact is consumed once per press**: `checkInteractions` does `keys[action] = false` after firing to prevent auto-repeat. Any new interact-key path should follow the same pattern.
- **`Player.damage()` references `mainCampfire`** for respawn — only safe because it's not called before gameplay starts.
- **Single-player vs co-op** is decided in `resizeCanvas()` from the `singlePlayer` flag set by the menu button. The rest of the code is player-count agnostic — it loops `players.forEach(...)`.
- **No save/load and no determinism** — `Math.random()` everywhere, refresh wipes the run.

## Where things are documented

- **`README.md`** — player-facing: controls, shop prices, day cycle.
- **`HANDOFF.md`** — deeper architecture notes, known gaps (cave combat, stone has no use, no hunger, no persistence), and reasoning behind specific magic numbers. Read this before non-trivial changes.
