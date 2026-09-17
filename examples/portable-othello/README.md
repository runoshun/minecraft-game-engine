# Portable Othello

A two-player Othello/Reversi reference game for the vanilla-first Portable DSL.

## What it exercises

- an 8x8 runtime `Grid` as authoritative board state;
- a `GridWorld` projection for the visible board;
- 60 direct-click cell interactions (the four permanent initial center cells do not need hitboxes);
- two player-local seat/color assignments plus bounded player reductions for seat presence;
- v27 `game.condition.all(...)` plus ordered `choose` and `match` control-flow helpers;
- one generic move processor shared by all cell interactions instead of duplicating eight-direction rules 60 times;
- bounded eight-direction capture/flip scans;
- automatic no-legal-move pass detection using an incremental board scan;
- score tracking, game-over detection, winner display, HUD, particle, and sound feedback.

## Play

The board is centered around `820,64,820` in the Overworld. One player right-clicks **BLACK SEAT**, another right-clicks **WHITE SEAT**. Once both seats are occupied, Black moves first. Right-click an empty board cell to place a stone; only the player whose assigned color matches the current turn can submit a move.

After a valid move the engine incrementally checks whether the next color has any legal move. If not, that turn is passed automatically. Two consecutive automatic passes end the game and the higher score wins. The red **RESET** interaction restores the initial four stones while keeping the current player seat assignments; if both seated players remain online, play resumes on the next tick.

Seat identity is player-local scoreboard state and is reload-scoped like other Portable player state. This example does not add persistent/offline identity or matchmaking.
