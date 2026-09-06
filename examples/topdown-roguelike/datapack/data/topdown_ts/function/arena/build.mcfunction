# Static level geometry only. Gameplay rules live in data/topdown_ts/mcgame/main.ts.
fill -10 100 -10 10 106 30 minecraft:air

# Room 1.
fill -8 100 -8 8 100 8 minecraft:polished_deepslate
fill -8 101 -8 -8 104 8 minecraft:deepslate_bricks
fill 8 101 -8 8 104 8 minecraft:deepslate_bricks
fill -8 101 -8 8 104 -8 minecraft:deepslate_bricks
fill -8 101 8 8 104 8 minecraft:deepslate_bricks
fill -2 100 -2 2 100 2 minecraft:cracked_deepslate_tiles
fill -1 101 8 1 103 8 minecraft:polished_blackstone_bricks
setblock -6 100 -6 minecraft:sea_lantern
setblock 6 100 -6 minecraft:sea_lantern
setblock -6 100 6 minecraft:sea_lantern
setblock 6 100 6 minecraft:sea_lantern

# Corridor.
fill -2 100 9 2 100 11 minecraft:stone_bricks
fill -3 101 9 -3 103 11 minecraft:deepslate_bricks
fill 3 101 9 3 103 11 minecraft:deepslate_bricks

# Room 2.
fill -8 100 12 8 100 28 minecraft:deepslate_tiles
fill -8 101 12 -8 104 28 minecraft:deepslate_bricks
fill 8 101 12 8 104 28 minecraft:deepslate_bricks
fill -8 101 12 8 104 12 minecraft:deepslate_bricks
fill -8 101 28 8 104 28 minecraft:deepslate_bricks
fill -1 101 12 1 103 12 minecraft:air
fill -1 101 28 1 103 28 minecraft:polished_blackstone_bricks
fill -2 100 18 2 100 22 minecraft:cracked_deepslate_tiles
setblock -6 100 14 minecraft:sea_lantern
setblock 6 100 14 minecraft:sea_lantern
setblock -6 100 26 minecraft:sea_lantern
setblock 6 100 26 minecraft:sea_lantern
