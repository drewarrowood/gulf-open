# Keep the Gulf Open

A present-day browser war game. You are the US Navy. Your job is to keep tanker traffic moving through the Strait of Hormuz.

This is a **game**, not a simulation of a real plan, a prediction, or a briefing. Geography is stylized so the choke is recognizable. Opposition is a pressure pattern (mines, boats, shore nests), not a named national roster.

Open `index.html` in a browser. No server. No build. Static files only.

On GitHub Pages, serve the repo root. `.nojekyll` is included so Pages will not filter the files.

## How to play

One screen. No menus to hunt through.

1. **Click a unit** on the map (or its token in the status strip).
2. **Click an action**, then a job on the map — or click a highlighted job and the game picks the action that fits.
3. Watch the **next transit** odds in the status line. Escorts and sweeps change those odds before the next clock tick.
4. Use **Pause / 1× / 2×** if you want time to think.

### Units

| Unit | What it is for |
| --- | --- |
| Escort Group | Ride with a tanker group. Cuts hit chance while committed. |
| Frigate Group | Second escort. Same job, thinner hull. |
| MCM Group | Sweep a lane. Clears mines over a few ticks. |
| Carrier Group | Strike a shore nest or hold air cover. If it is sunk, you lose. |

### Actions

- **Escort** — assign the selected escort to the holding queue / a lane. The next groups through the Strait get cover while the ship is committed.
- **Sweep** — MCM works a sector for three ticks and removes mines there.
- **Strike nest** — air/strike from the carrier suppresses a shore nest for several ticks. Cooldown afterward. The nest can shoot back.
- **Hold station** — stay put and cover that water (escorts in a lane, carrier air cover).
- **Relocate** — move to another stretch of water. Takes a tick to arrive.

### The clock

Each tick is a watch / day on the counter. Some tankers try the Strait every tick. Risk comes from mines in the lane, active swarms, and live shore nests. A hit lengthens the tanker queue and burns political/time budget.

## Win

Either of these:

- Reach **Day 36** with the queue still under the close limit, or
- Hold a **lane-open streak of 8** consecutive ticks (lane rated Open, and at least one tanker clears that tick).

## Lose

Any of these:

- Tanker queue reaches **12** — the gulf is closed.
- The **carrier group is sunk**.
- **Budget hits 0** (starts at 48; each tick costs 1, each tanker hit costs 2 more) before traffic recovers.

## Status line

- **Queue** — tankers waiting south of the choke, also drawn as a line in the holding area.
- **Lane risk** — Open / Contested / Closed pressure.
- **Next transit** — clear chance for the next group. This is the number escorts and sweeps move.
- **Budget / streak / unit state** — how much clock you have left, how long the lane has been open, and whether a ship is busy, damaged, or on cooldown.

The event log uses short concrete lines: a minefield on the inbound lane, a convoy clearing the Strait, a UAV swarm inbound.

## Files

- `index.html` — page and map
- `css/game.css` — layout and chart styling
- `js/game.js` — rules and clock
- `.nojekyll` — GitHub Pages
