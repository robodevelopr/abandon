# Stranded: Island Survival

A small HTML5 canvas survival game. The game itself is a single file (`index.html`); an optional Node.js server lets you serve the page and host networked co-op.

## Run

### Solo / local co-op only

Open `index.html` directly in a browser. No build step.

For dev with auto-reload, any static server works:
```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

### With networked co-op

```sh
npm install
node server.js                # http://localhost:8080/
# PORT=9000 node server.js    # custom port
```

`server.js` does double duty: it serves the static page over HTTP **and** runs a WebSocket relay on the same port. Friends on the same Wi-Fi can join via your LAN IP; for the internet, deploy `server.js` to Fly.io / Railway / Render, or front it with `ngrok http 8080`.

## How to play

From the main menu:
- **Start Single Player** — solo run.
- **Start Local Co-op** — two players share one keyboard.
- **Host Network Game** — you run the simulation; friends connect to your room.
- **Join Network Game** — connect to a host's room.
- **Load Saved Game** — resume the most recent save (offline only).

### Controls

| Action               | Player 1 | Player 2     |
| -------------------- | -------- | ------------ |
| Move                 | WASD     | Arrow keys   |
| Interact             | **F**    | **L**        |
| Cycle held item      | **E**    | **K**        |
| Pause                | **P** (or click ⏸ PAUSE) | |
| Back to main menu    | ✕ EXIT button | |
| Save game            | 💾 SAVE button (in-game) | |
| Load game            | Main menu → Load Saved Game | |

The interact key is context-sensitive — same key does all of:
- Chop a nearby tree (or mine a nearby rock with a pickaxe)
- Attack a nearby cow
- Open the shop or blueprint-shop menu
- Cook raw meat at the campfire (priority) or add wood to refuel it
- Eat the food you're currently holding in open ground

### Held items

Each player picks what's "in their hands" with the cycle key (**E** / **K**). The list rotates through:
```
Hands → Axe → Pickaxe → Sword → Cooked meat → Raw meat
```
…skipping items you don't own or don't have. The currently held item appears next to the player's hand on screen and in the HUD.

**What you hold matters:**
- **Axe** held → trees fall in 1 hit (+7 wood). Bare-handed → 4 hits (+3 wood total).
- **Pickaxe** held → rocks can be mined (+2 stone). Otherwise can't.
- **Sword** held → cows take 20 damage. Bare-handed → 5 damage.
- **Cooked meat** held → eating restores 30 HP.
- **Raw meat** held → eating damages you 20 HP (you get sick).

### Shop (purple building)

Walk up, press interact. Number-key menu:
- **1** — Sell 1 wood (5g each)
- **2** — Sell 10 wood
- **3** — Sell ALL wood
- **4** — Buy Axe (20g)
- **5** — Buy Pickaxe (25g)
- **6** — Buy Sword (30g)
- **7** / **ESC** — Close

Tools and resources are shared between players.

### Blueprint shop (blue building)

Walk up, press interact. Spend materials to spawn a building next to you:
- **1** — Small Shack — 30 wood
- **2** — Stone Cottage — 20 wood + 25 stone
- **3** — Watch Tower — 15 wood + 40 stone + 20 gold
- **4** / **ESC** — Close

When any player steps inside a building, its roof disappears and you see a clean top-down view of the interior.

### Food

- Kill cows with the interact key. Each kill drops **2 raw meat**.
- Stand by the campfire, interact → **cook** 1 raw → 1 cooked.
- Hold cooked meat in the open → **eat** for +30 HP. Raw meat: -20 HP.
- HP 0 → respawn at the campfire with 50 HP.

### Save & load

- In-game **💾 SAVE** button writes a full snapshot to your browser's `localStorage` under the key `abandon_save_v1` — gameState (resources, time, day, tools, cave-opening count), every player (position, HP, held item), cows, zombies, NPCs (with task/tools/earnings), entities (active state + chop progress), buildings, and campfire fuel.
- The main menu's **Load Saved Game** button restores that snapshot and drops you back in offline mode at the saved day/time.
- Saves are offline-only — the button is hidden in Host/Join modes because the host's world is authoritative and live; the save key is also single-slot, so each save overwrites the previous one.

### Day cycle

- 1 real-time day = 3 real minutes.
- Day/night fades smoothly through **dusk (18:00–20:00)** and **dawn (5:00–7:00)**.
- At night, the player and the campfire each sit in a crisp daylight halo — anything inside the halo is fully visible.
- **Cave**: sealed until night, but unlocks permanently from **day 10** onward (mornings included).
- Trees regrow after **1 day**; rocks after **1 day**; cows respawn the next day.
- The campfire burns through 2 in-game days of fuel.

## Files

```
index.html      — the game
server.js       — HTTP + WebSocket relay
package.json    — ws dependency for the server
README.md       — player-facing
HANDOFF.md      — deeper architecture & known gaps
CLAUDE.md       — guidance for AI assistants editing this repo
```
