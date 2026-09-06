type PlayerInput = {
  id: string;
  name: string;
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
};

const player = { x: 0.5, y: 101, z: 0.5, yaw: 0 };
const attached = new Set<string>();
const speed = 0.12;

game.onStart(() => {
  game.log("demo started");
  actors.spawn("hero", player);
});

game.onTick(() => {
  const p = input.players()[0] as PlayerInput | undefined;
  if (!p) return;

  if (!attached.has(p.id)) {
    camera.attach(p.id, { x: 0.5, y: 115, z: 0.5, yaw: 0, pitch: 90 });
    attached.add(p.id);
  }

  if (p.forward) player.z += speed;
  if (p.backward) player.z -= speed;
  if (p.left) player.x += speed;
  if (p.right) player.x -= speed;

  actors.move("hero", player);

  if (p.jumpPressed) {
    effects.particle({
      particle: "minecraft:sweep_attack",
      x: player.x,
      y: player.y + 1,
      z: player.z
    });
    effects.sound({
      sound: "minecraft:entity.player.attack.sweep",
      x: player.x,
      y: player.y,
      z: player.z,
      volume: 0.8,
      pitch: 1.1
    });
  }
});
