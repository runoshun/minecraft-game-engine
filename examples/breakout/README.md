# Breakout

A real-time Breakout/Arkanoid-style prototype implemented in a single MC Game Runtime TypeScript script.

The game rules are TypeScript-authoritative: paddle motion, ball velocity, collision, bricks, score, combo, lives, level progression, and win/loss state never depend on Minecraft physics. Minecraft is used as the renderer, input host, camera, HUD, sound, and particle system.

## Run

Copy `datapack/` into a world datapack directory (for example as `breakout/`), then run `/reload`.

As a player:

```mcfunction
/function breakout:start
```

To leave:

```mcfunction
/function breakout:stop
```

## Controls

- `A` / `D`: move the paddle left / right
- `Space`, attack, or use: launch the ball; restart after game over; advance after a cleared board

The runtime sees semantic/held vanilla input, so physical key rebinds continue to work for the corresponding vanilla actions.

## Implementation notes

- The board is made from runtime-owned `block_display` and `text_display` projections via `render.*`; no permanent arena blocks are required.
- Ball simulation runs at Minecraft's 20 TPS with four TypeScript collision substeps per tick. Display position interpolation (`positionTicks: 1`) smooths the visible paddle/ball motion on the vanilla client.
- The scene is created only after `/function breakout:start`, and every projection is spawned incrementally at one node per tick so cold starts stay within the script tick budget.
- Stop/disconnect tears down the scene; an idle `/reload` does not leave projections in an unloadable distant chunk.
- Bricks are rebuilt incrementally so a level reset does not create dozens of display entities in one script tick.
- `/reload` deterministically cleans up runtime-owned displays and camera anchors; the next explicit start builds a fresh scene.
- This example uses a fixed spectator camera. Because the current runtime does not yet provide cross-script game-session ownership, run only one camera-owning game script for a player at a time.
