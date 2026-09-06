package dev.mcgame.runtime;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Input;
import net.minecraft.resources.Identifier;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.HostAccess;
import org.graalvm.polyglot.PolyglotAccess;
import org.graalvm.polyglot.Source;
import org.graalvm.polyglot.Value;
import org.graalvm.polyglot.io.IOAccess;
import org.graalvm.polyglot.proxy.ProxyArray;
import org.graalvm.polyglot.proxy.ProxyExecutable;
import org.graalvm.polyglot.proxy.ProxyObject;
import org.slf4j.Logger;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

final class ScriptInstance {
    private static final long HARD_BUDGET_MS = 100;
    private static final ScheduledExecutorService WATCHDOG = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "mcgame-script-watchdog");
        thread.setDaemon(true);
        return thread;
    });
    private static final Pattern SAFE_ID = Pattern.compile("[A-Za-z0-9_-]{1,32}");
    private static final Pattern RESOURCE_ID = Pattern.compile("[a-z0-9_.-]+:[a-z0-9_./-]+");

    private final Identifier id;
    private final Logger logger;
    private final String scope;
    private final String ownerTag;
    private final Context context;
    private final List<Value> startCallbacks = new ArrayList<>();
    private final List<Value> tickCallbacks = new ArrayList<>();
    private final Set<UUID> attachedPlayers = new HashSet<>();
    private final Map<UUID, ButtonState> previous = new HashMap<>();

    private List<PlayerSnapshot> players = List.of();
    private MinecraftServer currentServer;
    private long currentTick;
    private boolean disabled;
    private boolean closed;

    ScriptInstance(Identifier id, String javascript, Logger logger) {
        this.id = id;
        this.logger = logger;
        this.scope = Integer.toUnsignedString(id.toString().hashCode(), 36);
        this.ownerTag = "mcg_owner_" + scope;
        this.context = Context.newBuilder("js")
            .allowHostAccess(HostAccess.NONE)
            .allowHostClassLookup(name -> false)
            .allowIO(IOAccess.NONE)
            .allowCreateThread(false)
            .allowNativeAccess(false)
            .allowPolyglotAccess(PolyglotAccess.NONE)
            .option("engine.WarnInterpreterOnly", "false")
            .build();

        installBindings();
        try {
            runWithBudget(() -> context.eval(Source.newBuilder("js", javascript, id.toString()).buildLiteral()));
        } catch (RuntimeException e) {
            context.close(true);
            throw e;
        }
    }

    Identifier id() { return id; }
    boolean disabled() { return disabled; }

    void start(MinecraftServer server) {
        withServer(server, 0, () -> runWithBudget(() -> {
            for (Value callback : List.copyOf(startCallbacks)) callback.execute();
        }));
    }

    void tick(MinecraftServer server, long tick) {
        if (disabled || closed) return;
        buildInputSnapshot(server);
        long started = System.nanoTime();
        withServer(server, tick, () -> runWithBudget(() -> {
            ProxyObject tickContext = ProxyObject.fromMap(Map.of("tick", tick));
            for (Value callback : List.copyOf(tickCallbacks)) callback.execute(tickContext);
        }));
        long elapsedMicros = (System.nanoTime() - started) / 1_000;
        if (elapsedMicros > 10_000) {
            logger.warn("mcgame script {} used {} ms in one tick", id, elapsedMicros / 1000.0);
        }
        previous.clear();
        for (PlayerSnapshot p : players) previous.put(p.uuid(), p.buttons());
    }

    void disable(MinecraftServer server) {
        disabled = true;
        close(server);
    }

    void close(MinecraftServer server) {
        if (closed) return;
        closed = true;
        for (UUID uuid : List.copyOf(attachedPlayers)) {
            ServerPlayer player = server.getPlayerList().getPlayer(uuid);
            if (player != null) exec(server, "execute as " + player.getGameProfile().name() + " run spectate");
        }
        attachedPlayers.clear();
        exec(server, "kill @e[tag=" + ownerTag + "]");
        context.close(true);
    }

    private void installBindings() {
        Map<String, Object> game = new HashMap<>();
        game.put("onStart", (ProxyExecutable) args -> {
            requireFunction(args, 0, "game.onStart");
            startCallbacks.add(args[0]);
            return null;
        });
        game.put("onTick", (ProxyExecutable) args -> {
            requireFunction(args, 0, "game.onTick");
            tickCallbacks.add(args[0]);
            return null;
        });
        game.put("log", (ProxyExecutable) args -> {
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < args.length; i++) {
                if (i > 0) out.append(' ');
                out.append(args[i].isString() ? args[i].asString() : args[i].toString());
            }
            logger.info("[{}] {}", id, out);
            return null;
        });

        Map<String, Object> input = new HashMap<>();
        input.put("players", (ProxyExecutable) args -> {
            List<Object> result = new ArrayList<>();
            for (PlayerSnapshot p : players) result.add(playerProxy(p));
            return ProxyArray.fromList(result);
        });
        input.put("get", (ProxyExecutable) args -> {
            String key = stringArg(args, 0, "input.get");
            for (PlayerSnapshot p : players) {
                if (p.uuid().toString().equals(key) || p.name().equals(key)) return playerProxy(p);
            }
            return null;
        });

        Map<String, Object> actors = new HashMap<>();
        actors.put("spawn", (ProxyExecutable) args -> { spawnActor(args); return null; });
        actors.put("move", (ProxyExecutable) args -> { moveActor(args); return null; });
        actors.put("remove", (ProxyExecutable) args -> { removeActor(args); return null; });

        Map<String, Object> camera = new HashMap<>();
        camera.put("attach", (ProxyExecutable) args -> { attachCamera(args); return null; });
        camera.put("move", (ProxyExecutable) args -> { moveCamera(args); return null; });
        camera.put("detach", (ProxyExecutable) args -> { detachCamera(args); return null; });

        Map<String, Object> world = new HashMap<>();
        world.put("setBlock", (ProxyExecutable) args -> { setBlock(args); return null; });

        Map<String, Object> effects = new HashMap<>();
        effects.put("particle", (ProxyExecutable) args -> { particle(args); return null; });
        effects.put("sound", (ProxyExecutable) args -> { sound(args); return null; });

        Value bindings = context.getBindings("js");
        bindings.putMember("game", ProxyObject.fromMap(game));
        bindings.putMember("input", ProxyObject.fromMap(input));
        bindings.putMember("actors", ProxyObject.fromMap(actors));
        bindings.putMember("camera", ProxyObject.fromMap(camera));
        bindings.putMember("world", ProxyObject.fromMap(world));
        bindings.putMember("effects", ProxyObject.fromMap(effects));
    }

    private void buildInputSnapshot(MinecraftServer server) {
        List<PlayerSnapshot> next = new ArrayList<>();
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            Input input = player.getLastClientInput();
            ButtonState now = new ButtonState(
                input.forward(), input.backward(), input.left(), input.right(),
                input.jump(), input.shift(), input.sprint()
            );
            ButtonState old = previous.getOrDefault(player.getUUID(), ButtonState.EMPTY);
            next.add(new PlayerSnapshot(
                player.getUUID(), player.getGameProfile().name(),
                player.level().dimension().identifier().toString(),
                player.getX(), player.getY(), player.getZ(), now,
                now.jump() && !old.jump(),
                now.shift() && !old.shift(),
                now.sprint() && !old.sprint()
            ));
        }
        players = List.copyOf(next);
    }

    private ProxyObject playerProxy(PlayerSnapshot p) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", p.uuid().toString());
        map.put("name", p.name());
        map.put("dimension", p.dimension());
        map.put("x", p.x()); map.put("y", p.y()); map.put("z", p.z());
        map.put("forward", p.buttons().forward());
        map.put("backward", p.buttons().backward());
        map.put("left", p.buttons().left());
        map.put("right", p.buttons().right());
        map.put("jump", p.buttons().jump());
        map.put("sneak", p.buttons().shift());
        map.put("sprint", p.buttons().sprint());
        map.put("jumpPressed", p.jumpPressed());
        map.put("sneakPressed", p.sneakPressed());
        map.put("sprintPressed", p.sprintPressed());
        return ProxyObject.fromMap(map);
    }

    private void spawnActor(Value[] args) {
        MinecraftServer server = requireServer();
        String actorId = safeId(stringArg(args, 0, "actors.spawn"));
        Value opts = objectArg(args, 1, "actors.spawn");
        String dimension = memberResource(opts, "dimension", "minecraft:overworld");
        double x = memberDouble(opts, "x", 0), y = memberDouble(opts, "y", 0), z = memberDouble(opts, "z", 0);
        float yaw = (float) memberDouble(opts, "yaw", 0);
        String texture = memberResource(opts, "texture", "minecraft:entity/player/wide/steve");
        String tag = actorTag(actorId);
        exec(server, "kill @e[tag=" + tag + "]");
        exec(server, String.format(Locale.ROOT,
            "execute in %s run summon minecraft:mannequin %.4f %.4f %.4f {Tags:[\"%s\",\"%s\"],Invulnerable:1b,NoGravity:1b,Rotation:[%.2ff,0f],profile:{texture:\"%s\"}}",
            dimension, x, y, z, ownerTag, tag, yaw, texture));
    }

    private void moveActor(Value[] args) {
        MinecraftServer server = requireServer();
        String actorId = safeId(stringArg(args, 0, "actors.move"));
        Value opts = objectArg(args, 1, "actors.move");
        String dimension = memberResource(opts, "dimension", "minecraft:overworld");
        double x = memberDouble(opts, "x", 0), y = memberDouble(opts, "y", 0), z = memberDouble(opts, "z", 0);
        float yaw = (float) memberDouble(opts, "yaw", 0);
        float pitch = (float) memberDouble(opts, "pitch", 0);
        exec(server, String.format(Locale.ROOT,
            "execute in %s run tp @e[type=minecraft:mannequin,tag=%s,limit=1] %.4f %.4f %.4f %.2f %.2f",
            dimension, actorTag(actorId), x, y, z, yaw, pitch));
    }

    private void removeActor(Value[] args) {
        exec(requireServer(), "kill @e[tag=" + actorTag(safeId(stringArg(args, 0, "actors.remove"))) + "]");
    }

    private void attachCamera(Value[] args) {
        MinecraftServer server = requireServer();
        ServerPlayer player = requirePlayer(server, stringArg(args, 0, "camera.attach"));
        Value opts = objectArg(args, 1, "camera.attach");
        String dimension = memberResource(opts, "dimension", player.level().dimension().identifier().toString());
        double x = memberDouble(opts, "x", player.getX()), y = memberDouble(opts, "y", player.getY()), z = memberDouble(opts, "z", player.getZ());
        float yaw = (float) memberDouble(opts, "yaw", 0);
        float pitch = (float) memberDouble(opts, "pitch", 90);
        String tag = cameraTag(player.getUUID());
        String name = player.getGameProfile().name();
        exec(server, "kill @e[tag=" + tag + "]");
        exec(server, String.format(Locale.ROOT,
            "execute in %s run summon minecraft:armor_stand %.4f %.4f %.4f {Tags:[\"%s\",\"%s\"],Invisible:1b,Invulnerable:1b,NoGravity:1b,Marker:1b,Rotation:[%.2ff,%.2ff]}",
            dimension, x, y, z, ownerTag, tag, yaw, pitch));
        exec(server, "gamemode spectator " + name);
        exec(server, "spectate @e[type=minecraft:armor_stand,tag=" + tag + ",limit=1] " + name);
        attachedPlayers.add(player.getUUID());
    }

    private void moveCamera(Value[] args) {
        MinecraftServer server = requireServer();
        ServerPlayer player = requirePlayer(server, stringArg(args, 0, "camera.move"));
        Value opts = objectArg(args, 1, "camera.move");
        String dimension = memberResource(opts, "dimension", player.level().dimension().identifier().toString());
        double x = memberDouble(opts, "x", player.getX()), y = memberDouble(opts, "y", player.getY()), z = memberDouble(opts, "z", player.getZ());
        float yaw = (float) memberDouble(opts, "yaw", 0);
        float pitch = (float) memberDouble(opts, "pitch", 90);
        exec(server, String.format(Locale.ROOT,
            "execute in %s run tp @e[type=minecraft:armor_stand,tag=%s,limit=1] %.4f %.4f %.4f %.2f %.2f",
            dimension, cameraTag(player.getUUID()), x, y, z, yaw, pitch));
    }

    private void detachCamera(Value[] args) {
        MinecraftServer server = requireServer();
        ServerPlayer player = requirePlayer(server, stringArg(args, 0, "camera.detach"));
        String name = player.getGameProfile().name();
        exec(server, "execute as " + name + " run spectate");
        exec(server, "gamemode adventure " + name);
        exec(server, "kill @e[tag=" + cameraTag(player.getUUID()) + "]");
        attachedPlayers.remove(player.getUUID());
    }

    private void setBlock(Value[] args) {
        MinecraftServer server = requireServer();
        Value opts = objectArg(args, 0, "world.setBlock");
        String dimension = memberResource(opts, "dimension", "minecraft:overworld");
        String block = memberResource(opts, "block", null);
        int x = (int) Math.floor(memberDouble(opts, "x", 0));
        int y = (int) Math.floor(memberDouble(opts, "y", 0));
        int z = (int) Math.floor(memberDouble(opts, "z", 0));
        exec(server, "execute in " + dimension + " run setblock " + x + " " + y + " " + z + " " + block);
    }

    private void particle(Value[] args) {
        MinecraftServer server = requireServer();
        Value opts = objectArg(args, 0, "effects.particle");
        String dimension = memberResource(opts, "dimension", "minecraft:overworld");
        String particle = memberResource(opts, "particle", null);
        double x = memberDouble(opts, "x", 0), y = memberDouble(opts, "y", 0), z = memberDouble(opts, "z", 0);
        exec(server, String.format(Locale.ROOT,
            "execute in %s run particle %s %.4f %.4f %.4f 0 0 0 0 1 force",
            dimension, particle, x, y, z));
    }

    private void sound(Value[] args) {
        MinecraftServer server = requireServer();
        Value opts = objectArg(args, 0, "effects.sound");
        String dimension = memberResource(opts, "dimension", "minecraft:overworld");
        String sound = memberResource(opts, "sound", null);
        double x = memberDouble(opts, "x", 0), y = memberDouble(opts, "y", 0), z = memberDouble(opts, "z", 0);
        double volume = memberDouble(opts, "volume", 1), pitch = memberDouble(opts, "pitch", 1);
        exec(server, String.format(Locale.ROOT,
            "execute in %s run playsound %s master @a %.4f %.4f %.4f %.3f %.3f",
            dimension, sound, x, y, z, volume, pitch));
    }

    private void runWithBudget(Runnable action) {
        AtomicBoolean running = new AtomicBoolean(true);
        ScheduledFuture<?> killer = WATCHDOG.schedule(() -> {
            if (running.compareAndSet(true, false)) {
                logger.error("mcgame script {} exceeded hard {} ms execution budget; cancelling context", id, HARD_BUDGET_MS);
                context.close(true);
            }
        }, HARD_BUDGET_MS, TimeUnit.MILLISECONDS);
        try {
            action.run();
        } finally {
            running.set(false);
            killer.cancel(false);
        }
    }

    private void withServer(MinecraftServer server, long tick, Runnable callback) {
        currentServer = server;
        currentTick = tick;
        try { callback.run(); }
        finally { currentServer = null; }
    }

    private MinecraftServer requireServer() {
        if (currentServer == null) throw new IllegalStateException("Minecraft API may only be called from game callbacks");
        return currentServer;
    }

    private ServerPlayer requirePlayer(MinecraftServer server, String key) {
        try {
            UUID uuid = UUID.fromString(key);
            ServerPlayer player = server.getPlayerList().getPlayer(uuid);
            if (player != null) return player;
        } catch (IllegalArgumentException ignored) {}
        ServerPlayer byName = server.getPlayerList().getPlayerByName(key);
        if (byName != null) return byName;
        throw new IllegalArgumentException("player is not online: " + key);
    }

    private String actorTag(String actorId) { return "mcg_" + scope + "_a_" + actorId; }
    private String cameraTag(UUID uuid) { return "mcg_" + scope + "_c_" + uuid.toString().replace("-", "").substring(0, 12); }

    private static String safeId(String id) {
        if (!SAFE_ID.matcher(id).matches()) throw new IllegalArgumentException("invalid actor id: " + id);
        return id;
    }

    private static String stringArg(Value[] args, int index, String api) {
        if (args.length <= index || !args[index].isString()) throw new IllegalArgumentException(api + " requires string argument " + index);
        return args[index].asString();
    }

    private static Value objectArg(Value[] args, int index, String api) {
        if (args.length <= index || args[index].isNull() || !args[index].hasMembers()) throw new IllegalArgumentException(api + " requires object argument " + index);
        return args[index];
    }

    private static void requireFunction(Value[] args, int index, String api) {
        if (args.length <= index || !args[index].canExecute()) throw new IllegalArgumentException(api + " requires a function");
    }

    private static double memberDouble(Value object, String name, double fallback) {
        if (!object.hasMember(name)) return fallback;
        Value value = object.getMember(name);
        if (value == null || !value.isNumber()) throw new IllegalArgumentException(name + " must be a number");
        double result = value.asDouble();
        if (!Double.isFinite(result) || Math.abs(result) > 30_000_000) throw new IllegalArgumentException("invalid number for " + name);
        return result;
    }

    private static String memberResource(Value object, String name, String fallback) {
        String result = fallback;
        if (object.hasMember(name)) {
            Value value = object.getMember(name);
            if (value == null || !value.isString()) throw new IllegalArgumentException(name + " must be a string");
            result = value.asString();
        }
        if (result == null) throw new IllegalArgumentException(name + " is required");
        if (!RESOURCE_ID.matcher(result).matches()) throw new IllegalArgumentException("invalid resource id for " + name + ": " + result);
        return result;
    }

    private static void exec(MinecraftServer server, String command) {
        server.getCommands().performPrefixedCommand(server.createCommandSourceStack().withSuppressedOutput(), command);
    }

    private record ButtonState(boolean forward, boolean backward, boolean left, boolean right, boolean jump, boolean shift, boolean sprint) {
        private static final ButtonState EMPTY = new ButtonState(false, false, false, false, false, false, false);
    }

    private record PlayerSnapshot(
        UUID uuid, String name, String dimension, double x, double y, double z,
        ButtonState buttons, boolean jumpPressed, boolean sneakPressed, boolean sprintPressed
    ) {}
}
