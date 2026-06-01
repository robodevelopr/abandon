# Stranded: Island Survival

A small HTML5 canvas survival game. Single-file — everything lives in `index.html`.

## Run

Open `index.html` in any modern browser. No build step, no dependencies.

For local development with auto-reload, any static server works:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## How to play

From the main menu:
- **Start Single Player** — solo run with P1 only.
- **Start Local Co-op** — two players share one keyboard.
- Network modes are stubs (need a backend).

### Controls

| Action     | Player 1 | Player 2 |
| ---------- | -------- | -------- |
| Move       | WASD     | Arrow keys |
| Interact   | **F**    | **L** |

The interact key is context-sensitive — same key does all of:
- Chop a nearby tree (or mine a nearby rock, with a pickaxe)
- Attack a nearby cow
- Open the shop menu
- Cook raw meat at the campfire (priority) or add wood to refuel it
- Eat from your stash when standing in open ground

### Shop

Walk up to the purple shop building and press your interact key. A menu pops up — controls are number keys:

- **1** — Sell all wood (2 gold each)
- **2** — Buy Axe (20g) — trees give 7 wood instead of 3
- **3** — Buy Pickaxe (25g) — required to mine rocks
- **4** — Buy Sword (30g) — 20 damage instead of 5
- **5** / **ESC** — Close

Tools are shared between players. Movement is frozen while the shop is open.

### Food

- Kill cows with the interact key (5 dmg bare-handed, 20 with sword; cow HP 30).
- Each kill drops **2 raw meat**.
- Stand by the campfire, interact → **cook** 1 raw → 1 cooked.
- Stand in open ground, interact → **eat**:
  - Cooked: +30 HP
  - Raw: -20 HP (you get sick)
- HP 0 → respawn at the campfire with 50 HP.

### Day cycle

- 1 real-time day = 3 real minutes.
- Night runs 20:00–06:00. The cave only opens at night.
- Trees regrow after **1 day**; rocks after **2 days**; cows respawn the next day.
- The campfire burns through 2 in-game days of fuel and gives a warm glow ring.

## Project structure

```
index.html   — entire game (HTML + CSS + JS)
README.md    — this file
HANDOFF.md   — architecture notes for future work
```
