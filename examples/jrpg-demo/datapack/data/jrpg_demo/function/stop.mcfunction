# Signal the TypeScript game to release UI/camera/entities, then return the player to the plaza.
tag @s add jrpg_demo_stopping
execute in minecraft:overworld run tp @s 58.5 143 6.5
schedule function jrpg_demo:stop_finish 2t replace
