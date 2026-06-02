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

`server.js` does double duty: it serves the static page over HTTP **and** runs a WebSocket relay on the same port. On startup it logs every LAN IPv4 it bound to, so you can share the right URL with a friend. It also exposes a tiny `/lan` JSON endpoint the in-game client calls so it can prefill the right share link automatically.

Friends on the same Wi-Fi can join via your LAN IP; for the internet, deploy `server.js` to Fly.io / Railway / Render, or front it with `ngrok http 8080`.

## How to play

From the main menu:
- **Start Single Player** — solo run.
- **Start Local Co-op** — two players share one keyboard.
- **Host Network Game** — you run the simulation; friends connect to your room. The prompt is prefilled with your LAN IP (auto-detected from `/lan`, falling back to a WebRTC sniff if the page is on `file://`). After connecting, a banner at the bottom of the screen shows the share URL so you can read it out at any time.
- **Join Network Game** — connect to a host's room.
- **Load Saved Game** — resume the most recent save (offline only).

### Controls

| Action               | Player 1 | Player 2     |
| -------------------- | -------- | ------------ |
| Move                 | WASD     | Arrow keys   |
| Interact             | **F**    | **L**        |
| Cycle held item      | **E**    | **K**        |
| Close any shop menu  | **F** / **L** (your interact key), digit shown in the menu, or **Esc** | |
| Pause                | **P** (or click ⏸ PAUSE) | |
| Back to main menu    | ✕ EXIT button | |
| Save game            | 💾 SAVE button (in-game) | |
| Load game            | Main menu → Load Saved Game | |

The interact key is context-sensitive — same key does all of:
- Drop a building blueprint where you stand (during placement mode)
- Confirm a placed blueprint into a real building
- Revive a downed teammate (highest priority — works even next to a shop)
- Pick a flower
- Chop a nearby tree (or mine a nearby rock with a pickaxe)
- Attack a nearby cow or zombie
- Open the shop / blueprint shop / flower shop, or talk to an NPC
- Cook raw meat at the campfire (priority) or add wood to refuel it
- Eat the food you're currently holding in open ground

### Held items

Each player picks what's "in their hands" with the cycle key (**E** / **K**). The list rotates through:
```
Hands → Axe → Pickaxe → Sword → Shield → Cooked meat → Raw meat
```
…skipping items you don't own or don't have. The currently held item appears next to the player's hand on screen and in the HUD.

**What you hold matters:**
- **Axe** held → trees fall in 1 hit (+7 wood). Bare-handed → 4 hits (+3 wood total).
- **Pickaxe** held → rocks can be mined (+2 stone). Otherwise can't.
- **Sword** held → enemies take 20 damage. Bare-handed → 5 damage.
- **Shield** held → damage you take from monsters is multiplied by ×0.5. (Doesn't apply unless it's the currently held item.)
- **Cooked meat** held → eating restores 30 HP.
- **Raw meat** held → eating damages you 20 HP (you get sick).

**Armor** is passive: once bought, all monster damage you take is multiplied by ×0.6. Stacks with the shield (×0.6 × ×0.5 = 70% reduction).

### Shop (purple building)

Walk up, press interact. Number-key menu:
- **1** — Sell 1 wood (5g each)
- **2** — Sell 10 wood
- **3** — Sell ALL wood
- **4** — Buy Axe (20g)
- **5** — Buy Pickaxe (25g)
- **6** — Buy Sword (30g)
- **7** / **Esc** / **F** — Close

Tools and resources are shared between players.

### Blueprint shop (blue building)

Walk up, press interact. Spend materials to buy a blueprint:
- **1** — Small Shack — 30 wood
- **2** — Stone Cottage — 20 wood + 25 stone
- **3** — Watch Tower — 15 wood + 40 stone + 20 gold
- **4** / **Esc** / **F** — Close

After buying, you enter **placement mode**: a translucent ghost of the building follows you wherever you walk. **Press F to drop the blueprint at your current spot.** Walk up to the dropped blueprint and press F a second time to actually build it. **Esc** during placement cancels and refunds materials.

Buildings shelter you from monsters: zombies treat the entire perimeter (including the doorway) as solid, while players can walk through the door freely. When any player steps inside a building, its roof disappears for a clean top-down view of the interior.

### Flower shop (pink cottage)

The map has scattered flowers — walk over one and press interact to pick it (+1 flower).

At the flower shop:
- **1** — Sell 1 flower (3 silver each)
- **2** — Sell 10 flowers
- **3** — Sell ALL flowers
- **4** — Buy Armor (50 silver, passive ×0.6 damage taken)
- **5** — Buy Shield (40 silver, ×0.5 damage taken *only while held*)
- **6** / **Esc** / **F** — Close

Silver is its own currency, separate from gold.

### NPCs (orange shirt + straw hat)

Every 5th cave-opening night a friendly NPC joins your camp.

- **By day:** they execute the task you set the previous night.
- **By night:** each NPC walks to an unclaimed placed building (one NPC per house) and stands there until morning. If there aren't enough buildings, the spare NPCs gather around the campfire.

Interact with one to open the green helper menu:
- **1** — Task: Chop trees (needs an axe)
- **2** — Task: Hunt animals (needs a sword)
- **3** — Task: Idle
- **4–6** — Buy that NPC an axe / pickaxe / sword from your gold
- **7** — Collect 25% of the NPC's accumulated earnings
- **8** / **Esc** / **F** — Close

**Tasks can only be assigned at night** — during the day the task buttons are dimmed. Set the daytime task at night and they'll do it the next morning.

### Food

- Kill cows with the interact key. Each kill drops **2 raw meat**.
- Stand by the campfire, interact → **cook** 1 raw → 1 cooked.
- Hold cooked meat in the open → **eat** for +30 HP. Raw meat: -20 HP.

### Death & revive

- In solo (single-player or one local player) → losing all your HP shows a **YOU DIED** screen and returns you to the main menu after 5 seconds.
- In two-player or co-op → you go **downed** (lying sideways, dimmed, with a red "DOWN — press F" badge) instead of dying. A teammate walks within 60px and presses F to revive you to 50 HP. Zombies ignore downed players, so they can't be killed again before being revived.
- If every player is simultaneously downed → game-over (same YOU DIED screen).

### Day cycle

- 1 real-time day = 3 real minutes.
- Day/night fades smoothly through **dusk (18:00–20:00)** and **dawn (5:00–7:00)**.
- At night, the player and the campfire each sit in a crisp daylight halo — anything inside the halo is fully visible.
- A countdown in the HUD ("Night in 2:14" / "Day in 0:45") shows real-time seconds until the next transition. It turns amber under 30s and red under 10s.
- **Cave**: sealed until night, but unlocks permanently from **day 10** onward (mornings included).
- **Fire-out penalty**: if the campfire burns out at night, a zombie trickles out of the cave every **3 seconds** until you relight it (or until morning).
- Trees regrow after **1 day**; rocks after **1 day**; cows respawn the next day. Flowers also respawn the next day.
- The campfire burns through 2 in-game days of fuel.

### Save & load

- In-game **💾 SAVE** button writes a full snapshot to your browser's `localStorage` under the key `abandon_save_v1` — gameState (resources including silver and flowers, time, day, tools including armor/shield, cave-opening count), every player (position, HP, held item), cows, zombies, NPCs (with task/tools/earnings), entities (active state + chop progress + flower colors), buildings (with their placed/blueprint state), and campfire fuel.
- The main menu's **Load Saved Game** button restores that snapshot and drops you back in offline mode at the saved day/time.
- Saves are offline-only — the button is hidden in Host/Join modes because the host's world is authoritative and live; the save key is also single-slot, so each save overwrites the previous one.

## Files

```
index.html      — the game
server.js       — HTTP + WebSocket relay (also serves /lan)
package.json    — ws dependency for the server
README.md       — player-facing
HANDOFF.md      — deeper architecture & known gaps
CLAUDE.md       — guidance for AI assistants editing this repo
```
