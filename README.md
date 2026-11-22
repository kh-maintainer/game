# Pixel Foundry

An incremental factory-building game with 2D pixel art. Mine ore, run it along conveyors, smelt and assemble it into more valuable parts, and sell everything at the Market. Spend the profit on upgrades and research, and keep expanding.

## Play

No build step and no dependencies. Open `index.html` in a browser.

To serve it locally instead:

```sh
python -m http.server 8000
# then open http://localhost:8000
```

URL flags:
- `?new` starts a fresh map and ignores the save.
- `?demo&new` loads a small pre-built factory for testing.

## Controls

| Input | Action |
| --- | --- |
| `1`–`7` | Select a building |
| `R` / `Shift+R` | Rotate |
| `Q` / `Esc` | Cancel tool / close inspector |
| Left click / drag | Build (dragging conveyors bends the line to follow the cursor) |
| Right click / drag | Remove (full refund) |
| Click a building | Inspect it, or pick an Assembler/Foundry recipe |
| `WASD` / arrows / drag ground | Pan |
| Mouse wheel / `+` `-` | Zoom |

## Production chain

| Building | Does |
| --- | --- |
| Miner | Placed on ore (iron, copper, stone, coal). Outputs forward. |
| Conveyor | Carries items. Accepts from behind and from the sides. |
| Smelter | Ore → plates, 2 stone → brick. Chooses its recipe automatically. |
| Assembler | Gears, copper wire, circuits, motors. |
| Foundry | 2 iron plates + coal → steel beam. |
| Splitter | Input from behind, deals items front/left/right in turn. |
| Market | Sells anything delivered to it. |

Research unlocks Splitters, Assembly, Electronics, Metallurgy and Motors. Upgrades make miners, belts and crafting faster and raise sell value. The game autosaves to `localStorage`. While you're away the factory earns 50% of its income, for up to 8 hours.

## Code layout

```
index.html        page shell
css/style.css     UI styling
js/data.js        items, recipes, buildings, upgrades, research, number formatting
js/game.js        simulation: map gen, item flow, economy, save/load
js/sprites.js     procedural pixel-art sprites and terrain
js/render.js      canvas renderer and camera
js/ui.js          DOM UI and mouse/keyboard input
js/main.js        bootstrap and main loop
test/sim.html     headless simulation tests (open in a browser)
```

## Ideas / roadmap

- Prestige layer (sell the factory for a permanent multiplier)
- Underground belts and multi-tile buildings
- Storage chests and item filters
- Sound effects and music
- Milestones and achievements
- More ore tiers, and an expanding map that costs money to unlock
