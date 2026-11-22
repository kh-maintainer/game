# Pixel Foundry

An incremental factory-building game with 2D pixel art. You can play solo or in **online 2-player co-op**.

Mine ore, run it along conveyors, smelt and assemble it into more valuable parts, and sell everything at the Market. Reinvest in upgrades, research and land. When growth slows, sell the company for **Patents** (prestige) and start a new map with permanent bonuses. The final goal is to feed 150 robots into a Launch Pad and launch the **Orbital Foundry**.

There are no assets or build step. All pixel art (one cohesive Sweetie 16-based palette), sound effects and music are generated in code. The world feels alive: swaying forests, shimmering ponds, drifting cloud shadows, birds, butterflies, and a day/night cycle where furnaces and lamps light up the dark, plus fireflies at night.

## Play

Open `index.html` in a browser, or serve the folder:

```sh
python -m http.server 8000   # then open http://localhost:8000
```

URL flags: `?new` ignores the save, `?demo&new` loads a pre-built test factory, and `?join=CODE` opens the join dialog with the room code filled in.

## Online co-op

1. Both players open the game and pick **Co-op**. The 👥 button in the top bar also opens it.
2. One player clicks **Host game** and shares the 5-letter room code.
3. The other player enters the code and clicks **Join**.

How it works:
- You build **one shared factory** with one wallet, and shared research, upgrades, land and prestige.
- Each player sees the other's cursor, name and building ghost. Press **Enter** to chat, and **G** or **Alt+click** to ping a tile.
- It's peer-to-peer over WebRTC using [PeerJS](https://peerjs.com/). No game server is needed, but both players need an internet connection. PeerJS's free public broker is only used to set up the connection.
- The **host is authoritative**. Guest actions are sent to the host, which checks and applies them and sends them back. The host also sends a full state sync every 2 seconds.
- The host's save is the shared world. A guest's own solo save is kept safe and comes back when they leave.

## Controls

| Input | Action |
| --- | --- |
| `1`–`9`, `0`, `P` | Select a building |
| `R` / `Shift+R` | Rotate the ghost or the building under the cursor |
| `Q` | Pipette: copy the building under the cursor |
| `Esc` | Cancel tool / close inspector |
| Left click / drag | Build (dragging conveyors bends the line to follow the cursor) |
| Right click / drag | Remove (full refund) |
| Click a building | Inspect it, pick a recipe, set a sorter filter, or swap a tunnel's entry/exit |
| `WASD` / arrows / drag ground | Pan (`Shift` = faster) |
| Wheel / `+` `-` / minimap | Zoom / jump |
| `Enter` / `G` | Chat / ping (co-op) |
| `M` / `H` | Mute / help |

## Content

**Buildings:** Conveyor (curves automatically), Miner, Smelter, Market, Splitter, Assembler, Foundry, Chest (64-item buffer), Tunnel (underground, up to 5 tiles), Sorter (item filter), Launch Pad.

**Items:** iron/copper/gold ore, stone, coal → plates, bricks, gold bars → gears, wire, circuits, steel → motors, processors → robots.

**Progression:**
- 5 repeatable upgrades and 10 research nodes.
- 7 land expansions. Gold only appears far from the centre.
- 19 guided goals with cash rewards.
- 29 achievements, each giving +2% income.
- Prestige: patents give +5% income each and can be spent on 7 permanent upgrades in the Patent Office.
- Endgame: the rocket launch, which pays 5 patents and can be repeated.

**Quality of life:**
- Autosaves every 15s, with offline earnings (50% base, up to 8h).
- Save export/import, plus volume, mute and grid settings.
- A minimap, smoke and coin particles, buildings that pop in with a dust puff, and screen shake on liftoff.
- Settings toggles for the grid and the day/night cycle.

## Code layout

```
index.html        page shell (loads PeerJS from unpkg)
css/style.css     UI styling
js/data.js        items, recipes, buildings, upgrades, research, patents, achievements, goals
js/game.js        simulation: map gen, item flow, economy, prestige, actions, save/load
js/audio.js       WebAudio synth SFX + procedural chiptune music
js/sprites.js     procedural pixel-art sprites and terrain
js/render.js      canvas renderer: camera, land, curves, particles, partner cursor, pings
js/net.js         online co-op over PeerJS (host-authoritative)
js/ui.js          DOM UI, input, panels, modals, minimap, chat
js/main.js        bootstrap and main loop
test/sim.html     headless simulation tests (open in a browser; 22 checks)
```

Every world change is a serialisable **action** (`Game.apply`). That one path is what lets solo play, the co-op host and the co-op guest share the same code.
