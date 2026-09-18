# Portable Othello

A two-player Othello/Reversi reference game for the vanilla-first Portable DSL.

## What it exercises

- an 8x8 runtime `Grid` as authoritative board state;
- a framed green 8x8 board with a 9x9 Display-entity grid overlay;
- a `GridWorld` stone layer using inset blackstone / iron pressure plates so adjacent pieces remain visually separated;
- 60 direct-click cell interactions (the four permanent initial center cells do not need hitboxes);
- two player-local seat/color assignments plus bounded player reductions for seat presence;
- v27 `game.condition.all(...)` plus ordered `choose` and `match` control-flow helpers;
- one generic move processor shared by all cell interactions instead of duplicating eight-direction rules 60 times;
- bounded eight-direction capture/flip scans;
- automatic no-legal-move pass detection using an incremental board scan;
- explicit seat availability, current-turn, checking, automatic-pass, score, and winner presentation;
- positive move feedback plus red particle / bass feedback for occupied, illegal, seatless, or out-of-turn board clicks.

## Play

The board is centered around `820,64,820` in the Overworld. One player right-clicks **BLACK SEAT**, another right-clicks **WHITE SEAT**. The side labels change from **OPEN** to **READY** as seats are taken. Once both seats are occupied, Black moves first. The south status panel shows the score and names the current color instead of exposing the internal numeric turn value.

Right-click a board cell to submit a move. Stones are rendered one block above the green board as inset pressure-plate pieces, with thin black Display lines marking every cell boundary. Illegal, occupied, seatless, and out-of-turn clicks produce red angry particles and a low bass note instead of failing silently. While the next turn is being checked the status panel says **CHECKING NEXT MOVES...**; an automatic pass is announced for about two seconds.

After a valid move the engine incrementally checks whether the next color has any legal move. If not, that turn is passed automatically. Two consecutive automatic passes end the game and the higher score wins. The red **RESET GAME** interaction restores the initial four stones while keeping the current player seat assignments; if both seated players remain online, play resumes on the next tick.

Seat identity is player-local scoreboard state and is reload-scoped like other Portable player state. This example does not add persistent/offline identity or matchmaking.
