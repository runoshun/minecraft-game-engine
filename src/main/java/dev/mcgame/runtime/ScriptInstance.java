package dev.mcgame.runtime;

import com.mojang.math.Transformation;
import dev.mcgame.runtime.mixin.BlockDisplayAccessor;
import dev.mcgame.runtime.mixin.DisplayAccessor;
import dev.mcgame.runtime.mixin.ItemDisplayAccessor;
import dev.mcgame.runtime.mixin.TextDisplayAccessor;
import net.minecraft.ChatFormatting;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.numbers.BlankFormat;
import net.minecraft.network.protocol.common.ClientboundClearDialogPacket;
import net.minecraft.network.protocol.game.ClientboundResetScorePacket;
import net.minecraft.network.protocol.game.ClientboundSetDisplayObjectivePacket;
import net.minecraft.network.protocol.game.ClientboundSetObjectivePacket;
import net.minecraft.network.protocol.game.ClientboundSetScorePacket;
import net.minecraft.server.dialog.ActionButton;
import net.minecraft.server.dialog.CommonButtonData;
import net.minecraft.server.dialog.CommonDialogData;
import net.minecraft.server.dialog.DialogAction;
import net.minecraft.server.dialog.MultiActionDialog;
import net.minecraft.server.dialog.action.CustomAll;
import net.minecraft.server.dialog.body.DialogBody;
import net.minecraft.server.dialog.body.PlainMessage;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.Display;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.ItemLore;
import net.minecraft.world.scores.DisplaySlot;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.Scoreboard;
import net.minecraft.world.scores.criteria.ObjectiveCriteria;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.decoration.Mannequin;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
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

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.Deque;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

final class ScriptInstance {
    private static final long HARD_BUDGET_MS = 100;
    private static final long STARTUP_BUDGET_MS = 1_000;
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
    private final Map<UUID, Map<InputActionRegistry.Action, Long>> previousActions = new HashMap<>();
    private final Map<UUID, Integer> previousHotbarSlots = new HashMap<>();
    private final Map<String, Entity> actorEntities = new HashMap<>();
    private final Map<String, RenderNode> renderNodes = new HashMap<>();
    private final Map<String, Attachment> renderAttachments = new HashMap<>();
    private final Map<UUID, PanelState> panels = new HashMap<>();
    private final Map<UUID, OpenMenuState> openMenus = new HashMap<>();
    private final List<Value> menuActionCallbacks = new ArrayList<>();
    private final Deque<PendingMenuAction> pendingMenuActions = new ArrayDeque<>();

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
            runWithBudget(() -> context.eval(Source.newBuilder("js", javascript, id.toString()).buildLiteral()), STARTUP_BUDGET_MS);
        } catch (RuntimeException e) {
            context.close(true);
            throw e;
        }
    }

    Identifier id() { return id; }
    boolean disabled() { return disabled; }

    void start(MinecraftServer server) {
        primeInputState(server);
        withServer(server, 0, () -> runWithBudget(() -> {
            for (Value callback : List.copyOf(startCallbacks)) callback.execute();
        }, STARTUP_BUDGET_MS));
    }

    void tick(MinecraftServer server, long tick) {
        if (disabled || closed) return;
        buildInputSnapshot(server);
        long started = System.nanoTime();
        withServer(server, tick, () -> {
            runWithBudget(() -> {
                deliverMenuActions();
                ProxyObject tickContext = ProxyObject.fromMap(Map.of("tick", tick));
                for (Value callback : List.copyOf(tickCallbacks)) callback.execute(tickContext);
            });
            syncRenderAttachments();
            maintainActors();
            refreshPanelConnections(server);
        });
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
        for (Entity actor : actorEntities.values()) {
            if (!actor.isRemoved()) actor.discard();
        }
        actorEntities.clear();
        for (RenderNode node : renderNodes.values()) {
            if (!node.entity.isRemoved()) node.entity.discard();
        }
        renderNodes.clear();
        renderAttachments.clear();
        for (PanelState panel : List.copyOf(panels.values())) hidePanel(server, panel);
        panels.clear();
        for (OpenMenuState menu : List.copyOf(openMenus.values())) closeMenuState(server, menu);
        openMenus.clear();
        MenuActionRegistry.removeForScript(this);
        // Camera anchors and any command-fallback entities are still owner-tagged.
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
        input.put("pressed", (ProxyExecutable) args -> {
            String key = stringArg(args, 0, "input.pressed");
            String action = stringArg(args, 1, "input.pressed");
            for (PlayerSnapshot p : players) {
                if (p.uuid().toString().equals(key) || p.name().equals(key)) return p.pressedActions().contains(action);
            }
            return false;
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
        world.put("setBlocks", (ProxyExecutable) args -> { setBlocks(args); return null; });
        world.put("fill", (ProxyExecutable) args -> { fillBlocks(args); return null; });

        Map<String, Object> effects = new HashMap<>();
        effects.put("particle", (ProxyExecutable) args -> { particle(args); return null; });
        effects.put("sound", (ProxyExecutable) args -> { sound(args); return null; });

        Map<String, Object> render = new HashMap<>();
        render.put("spawn", (ProxyExecutable) args -> { spawnRender(args); return null; });
        render.put("update", (ProxyExecutable) args -> { updateRender(args); return null; });
        render.put("remove", (ProxyExecutable) args -> { removeRender(args); return null; });
        render.put("attach", (ProxyExecutable) args -> { attachRender(args); return null; });
        render.put("detach", (ProxyExecutable) args -> { detachRender(args); return null; });

        Map<String, Object> ui = new HashMap<>();
        ui.put("panel", (ProxyExecutable) args -> { setPanel(args); return null; });

        Map<String, Object> menu = new HashMap<>();
        menu.put("onAction", (ProxyExecutable) args -> {
            requireFunction(args, 0, "menu.onAction");
            menuActionCallbacks.add(args[0]);
            return null;
        });
        menu.put("open", (ProxyExecutable) args -> { openMenu(args); return null; });
        menu.put("update", (ProxyExecutable) args -> { openMenu(args); return null; });
        menu.put("close", (ProxyExecutable) args -> { closeMenu(args); return null; });

        Value bindings = context.getBindings("js");
        bindings.putMember("game", ProxyObject.fromMap(game));
        bindings.putMember("input", ProxyObject.fromMap(input));
        bindings.putMember("actors", ProxyObject.fromMap(actors));
        bindings.putMember("camera", ProxyObject.fromMap(camera));
        bindings.putMember("world", ProxyObject.fromMap(world));
        bindings.putMember("effects", ProxyObject.fromMap(effects));
        bindings.putMember("render", ProxyObject.fromMap(render));
        bindings.putMember("ui", ProxyObject.fromMap(ui));
        bindings.putMember("menu", ProxyObject.fromMap(menu));
    }

    private void maintainActors() {
        for (Entity actor : actorEntities.values()) {
            if (actor.isRemoved()) continue;
            actor.setDeltaMovement(0, 0, 0);
            actor.clearFire();
            if (actor instanceof Mob mob) mob.setNoAi(true);
        }
    }

    private void primeInputState(MinecraftServer server) {
        previousActions.clear();
        previousHotbarSlots.clear();
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            UUID uuid = player.getUUID();
            previousActions.put(uuid, InputActionRegistry.snapshot(uuid));
            previousHotbarSlots.put(uuid, player.getInventory().getSelectedSlot());
        }
    }

    private void buildInputSnapshot(MinecraftServer server) {
        List<PlayerSnapshot> next = new ArrayList<>();
        Set<UUID> online = new HashSet<>();
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            UUID uuid = player.getUUID();
            online.add(uuid);
            Input input = player.getLastClientInput();
            ButtonState now = new ButtonState(input.forward(), input.backward(), input.left(), input.right(), input.jump(), input.shift(), input.sprint());
            ButtonState old = previous.getOrDefault(uuid, ButtonState.EMPTY);
            Set<String> pressed = new HashSet<>();
            if (now.forward() && !old.forward()) pressed.add("forward");
            if (now.backward() && !old.backward()) pressed.add("backward");
            if (now.left() && !old.left()) pressed.add("left");
            if (now.right() && !old.right()) pressed.add("right");
            if (now.jump() && !old.jump()) pressed.add("jump");
            if (now.shift() && !old.shift()) pressed.add("sneak");
            if (now.sprint() && !old.sprint()) pressed.add("sprint");

            Map<InputActionRegistry.Action, Long> actionNow = InputActionRegistry.snapshot(uuid);
            Map<InputActionRegistry.Action, Long> actionOld = previousActions.getOrDefault(uuid, Map.of());
            for (InputActionRegistry.Action action : InputActionRegistry.Action.values()) {
                if (actionNow.getOrDefault(action, 0L) > actionOld.getOrDefault(action, 0L)) pressed.add(action.scriptName());
            }
            previousActions.put(uuid, actionNow);

            int hotbarSlot = player.getInventory().getSelectedSlot();
            Integer oldHotbarSlot = previousHotbarSlots.put(uuid, hotbarSlot);
            boolean hotbarChanged = oldHotbarSlot != null && oldHotbarSlot != hotbarSlot;
            if (hotbarChanged) pressed.add("hotbar_changed");

            next.add(new PlayerSnapshot(uuid, player.getGameProfile().name(), player.level().dimension().identifier().toString(),
                player.getX(), player.getY(), player.getZ(), now, now.jump() && !old.jump(), now.shift() && !old.shift(),
                now.sprint() && !old.sprint(), hotbarSlot, hotbarChanged, Set.copyOf(pressed)));
        }
        previousActions.keySet().retainAll(online);
        previousHotbarSlots.keySet().retainAll(online);
        InputActionRegistry.retainPlayers(online);
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
        map.put("hotbarSlot", p.hotbarSlot());
        map.put("hotbarChanged", p.hotbarChanged());
        map.put("pressedActions", ProxyArray.fromList(new ArrayList<>(p.pressedActions())));
        return ProxyObject.fromMap(map);
    }

    private void spawnActor(Value[] args) {
        MinecraftServer server = requireServer();
        String actorId = safeId(stringArg(args, 0, "actors.spawn"));
        Value opts = objectArg(args, 1, "actors.spawn");
        String dimension = memberResource(opts, "dimension", "minecraft:overworld");
        double x = memberDouble(opts, "x", 0), y = memberDouble(opts, "y", 0), z = memberDouble(opts, "z", 0);
        float yaw = (float) memberDouble(opts, "yaw", 0);
        float pitch = (float) memberDouble(opts, "pitch", 0);
        String entityTypeId = memberResource(opts, "entityType", "minecraft:mannequin");
        String texture = memberResource(opts, "texture", "minecraft:entity/player/wide/steve");
        boolean mannequin = "minecraft:mannequin".equals(entityTypeId);
        if (!mannequin && opts.hasMember("texture")) {
            throw new IllegalArgumentException("actors.spawn texture is only valid for minecraft:mannequin actors");
        }

        String tag = actorTag(actorId);
        ServerLevel level = requireLevel(server, dimension);
        level.getChunkAt(BlockPos.containing(x, y, z));
        if (!removeActorEntity(actorId)) {
            exec(server, "execute in " + dimension + " run kill @e[tag=" + tag + "]");
        }

        // Custom mannequin textures still use the command fallback until profile construction is direct.
        if (mannequin && !"minecraft:entity/player/wide/steve".equals(texture)) {
            exec(server, String.format(Locale.ROOT,
                "execute in %s run summon minecraft:mannequin %.4f %.4f %.4f {Tags:[\"%s\",\"%s\"],Invulnerable:1b,NoGravity:1b,Rotation:[%.2ff,%.2ff],profile:{texture:\"%s\"}}",
                dimension, x, y, z, ownerTag, tag, yaw, pitch, texture));
            return;
        }

        Entity actor;
        if (mannequin) {
            Mannequin created = EntityType.MANNEQUIN.create(level, EntitySpawnReason.COMMAND);
            if (created == null) throw new IllegalStateException("failed to create mannequin actor " + actorId);
            actor = created;
        } else {
            EntityType<?> entityType = BuiltInRegistries.ENTITY_TYPE.getOptional(Identifier.parse(entityTypeId))
                .orElseThrow(() -> new IllegalArgumentException("unknown actor entity type: " + entityTypeId));
            Entity created = entityType.create(level, EntitySpawnReason.COMMAND);
            if (!(created instanceof Mob mob)) {
                if (created != null) created.discard();
                throw new IllegalArgumentException("actors.spawn entityType must be a mob: " + entityTypeId);
            }
            mob.setNoAi(true);
            mob.setPersistenceRequired();
            actor = mob;
        }

        actor.setPos(x, y, z);
        actor.setYRot(yaw);
        actor.setXRot(pitch);
        actor.setNoGravity(true);
        actor.noPhysics = true;
        actor.setDeltaMovement(0, 0, 0);
        actor.setInvulnerable(true);
        actor.setSilent(true);
        actor.clearFire();
        actor.addTag(ownerTag);
        actor.addTag(tag);
        actor.addTag(RuntimeEntityTags.ACTOR);
        if (!level.addFreshEntity(actor)) {
            actor.discard();
            throw new IllegalStateException("failed to add actor " + actorId + " to " + dimension);
        }
        actorEntities.put(actorId, actor);
    }

    private void moveActor(Value[] args) {
        MinecraftServer server = requireServer();
        String actorId = safeId(stringArg(args, 0, "actors.move"));
        Value opts = objectArg(args, 1, "actors.move");
        Entity actor = actorEntities.get(actorId);
        if (actor == null || actor.isRemoved()) {
            // Custom-texture fallback actors are not held as Java references.
            String dimension = memberResource(opts, "dimension", "minecraft:overworld");
            double x = memberDouble(opts, "x", 0), y = memberDouble(opts, "y", 0), z = memberDouble(opts, "z", 0);
            float yaw = (float) memberDouble(opts, "yaw", 0);
            float pitch = (float) memberDouble(opts, "pitch", 0);
            exec(server, String.format(Locale.ROOT,
                "execute in %s run tp @e[tag=%s,limit=1] %.4f %.4f %.4f %.2f %.2f",
                dimension, actorTag(actorId), x, y, z, yaw, pitch));
            return;
        }

        String currentDimension = actor.level().dimension().identifier().toString();
        String dimension = memberResource(opts, "dimension", currentDimension);
        double x = memberDouble(opts, "x", actor.getX());
        double y = memberDouble(opts, "y", actor.getY());
        double z = memberDouble(opts, "z", actor.getZ());
        float yaw = (float) memberDouble(opts, "yaw", actor.getYRot());
        float pitch = (float) memberDouble(opts, "pitch", actor.getXRot());

        if (dimension.equals(currentDimension)) {
            actor.setDeltaMovement(0, 0, 0);
            ServerLevel level = (ServerLevel) actor.level();
            if (!actor.teleportTo(level, x, y, z, Set.of(), yaw, pitch, false)) {
                actorEntities.remove(actorId);
                throw new IllegalStateException("actor position update failed for " + actorId);
            }
        } else {
            ServerLevel target = requireLevel(server, dimension);
            if (!actor.teleportTo(target, x, y, z, Set.of(), yaw, pitch, false)) {
                actorEntities.remove(actorId);
                throw new IllegalStateException("actor dimension transfer failed for " + actorId);
            }
            actorEntities.put(actorId, actor);
        }
    }

    private void removeActor(Value[] args) {
        String actorId = safeId(stringArg(args, 0, "actors.remove"));
        if (!removeActorEntity(actorId)) {
            exec(requireServer(), "kill @e[tag=" + actorTag(actorId) + "]");
        }
    }

    private boolean removeActorEntity(String actorId) {
        Entity actor = actorEntities.remove(actorId);
        if (actor == null) return false;
        if (!actor.isRemoved()) actor.discard();
        return true;
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
        String blockId = memberResource(opts, "block", null);
        int x = (int) Math.floor(memberDouble(opts, "x", 0));
        int y = (int) Math.floor(memberDouble(opts, "y", 0));
        int z = (int) Math.floor(memberDouble(opts, "z", 0));

        ServerLevel level = requireLevel(server, dimension);
        Block block = BuiltInRegistries.BLOCK.getOptional(Identifier.parse(blockId))
            .orElseThrow(() -> new IllegalArgumentException("unknown block: " + blockId));
        BlockPos pos = new BlockPos(x, y, z);
        if (!level.isInWorldBounds(pos)) throw new IllegalArgumentException("block position is outside world bounds: " + pos);
        level.setBlock(pos, block.defaultBlockState(), Block.UPDATE_ALL);
    }

    private static final int FAST_BLOCK_FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SUPPRESS_DROPS;
    private static final int MAX_BULK_BLOCKS = 32768;

    private void setBlocks(Value[] args) {
        MinecraftServer server = requireServer();
        Value opts = objectArg(args, 0, "world.setBlocks");
        String dimension = memberResource(opts, "dimension", "minecraft:overworld");
        Value blocks = opts.hasMember("blocks") ? opts.getMember("blocks") : null;
        if (blocks == null || !blocks.hasArrayElements()) throw new IllegalArgumentException("world.setBlocks blocks must be an array");
        long count = blocks.getArraySize();
        if (count > MAX_BULK_BLOCKS) throw new IllegalArgumentException("world.setBlocks exceeds max block count " + MAX_BULK_BLOCKS);
        ServerLevel level = requireLevel(server, dimension);
        Map<String, Block> resolved = new HashMap<>();
        for (long i = 0; i < count; i++) {
            Value write = blocks.getArrayElement(i);
            if (write == null || !write.hasMembers()) throw new IllegalArgumentException("world.setBlocks block entry must be an object");
            String blockId = memberResource(write, "block", null);
            BlockPos pos = new BlockPos((int)Math.floor(memberDouble(write, "x", 0)), (int)Math.floor(memberDouble(write, "y", 0)), (int)Math.floor(memberDouble(write, "z", 0)));
            if (!level.isInWorldBounds(pos)) throw new IllegalArgumentException("block position is outside world bounds: " + pos);
            level.setBlock(pos, resolved.computeIfAbsent(blockId, this::requireBlock).defaultBlockState(), FAST_BLOCK_FLAGS);
        }
    }

    private void fillBlocks(Value[] args) {
        MinecraftServer server = requireServer();
        Value opts = objectArg(args, 0, "world.fill");
        String dimension = memberResource(opts, "dimension", "minecraft:overworld");
        String blockId = memberResource(opts, "block", null);
        int x1=(int)Math.floor(memberDouble(opts,"fromX",0)), x2=(int)Math.floor(memberDouble(opts,"toX",0));
        int y1=(int)Math.floor(memberDouble(opts,"fromY",0)), y2=(int)Math.floor(memberDouble(opts,"toY",0));
        int z1=(int)Math.floor(memberDouble(opts,"fromZ",0)), z2=(int)Math.floor(memberDouble(opts,"toZ",0));
        int minX=Math.min(x1,x2), maxX=Math.max(x1,x2), minY=Math.min(y1,y2), maxY=Math.max(y1,y2), minZ=Math.min(z1,z2), maxZ=Math.max(z1,z2);
        long volume=(long)(maxX-minX+1)*(maxY-minY+1)*(maxZ-minZ+1);
        if (volume > MAX_BULK_BLOCKS) throw new IllegalArgumentException("world.fill exceeds max block count " + MAX_BULK_BLOCKS);
        ServerLevel level=requireLevel(server, dimension);
        Block block=requireBlock(blockId);
        for (BlockPos pos : BlockPos.betweenClosed(minX,minY,minZ,maxX,maxY,maxZ)) {
            if (!level.isInWorldBounds(pos)) throw new IllegalArgumentException("block position is outside world bounds: " + pos);
            level.setBlock(pos, block.defaultBlockState(), FAST_BLOCK_FLAGS);
        }
    }

    private Block requireBlock(String id) {
        return BuiltInRegistries.BLOCK.getOptional(Identifier.parse(id))
            .orElseThrow(() -> new IllegalArgumentException("unknown block: " + id));
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


    void enqueueMenuAction(UUID playerId, String playerName, String menuId, String actionId) {
        if (closed || disabled) return;
        pendingMenuActions.addLast(new PendingMenuAction(playerId, playerName, menuId, actionId));
        OpenMenuState state = openMenus.get(playerId);
        if (state != null && state.menuId.equals(menuId) && state.kind == MenuKind.DIALOG) {
            openMenus.remove(playerId);
            MenuActionRegistry.removeForPlayerMenu(this, playerId, menuId);
        }
    }

    private void deliverMenuActions() {
        while (!pendingMenuActions.isEmpty()) {
            PendingMenuAction event = pendingMenuActions.removeFirst();
            ProxyObject proxy = ProxyObject.fromMap(Map.of(
                "playerId", event.playerId.toString(),
                "playerName", event.playerName,
                "menuId", event.menuId,
                "actionId", event.actionId
            ));
            for (Value callback : List.copyOf(menuActionCallbacks)) callback.execute(proxy);
        }
    }

    private void spawnRender(Value[] args) {
        MinecraftServer server = requireServer();
        String renderId = safeId(stringArg(args, 0, "render.spawn"));
        Value opts = objectArg(args, 1, "render.spawn");
        Value visualValue = memberObject(opts, "visual", "render.spawn");
        VisualSpec visual = parseVisual(visualValue, "render.spawn.visual");

        removeRenderNode(renderId);

        RenderNode node = new RenderNode(renderId);
        node.visual = visual;
        node.dimension = memberResource(opts, "dimension", "minecraft:overworld");
        node.x = memberDouble(opts, "x", 0);
        node.y = memberDouble(opts, "y", 0);
        node.z = memberDouble(opts, "z", 0);
        node.yaw = (float) memberDouble(opts, "yaw", 0);
        node.pitch = (float) memberDouble(opts, "pitch", 0);
        node.roll = (float) memberDouble(opts, "roll", 0);
        node.scale = memberScale(opts, "scale", new Vector3f(1, 1, 1));
        node.offset = memberVec3(opts, "offset", new Vector3f());
        node.billboard = memberString(opts, "billboard", "fixed");
        if (opts.hasMember("smoothing")) applySmoothing(node, memberObject(opts, "smoothing", "render.spawn"));

        ServerLevel level = requireLevel(server, node.dimension);
        node.entity = createRenderEntity(server, level, node);
        renderNodes.put(renderId, node);
        applyRenderTransform(node, true);
    }

    private void updateRender(Value[] args) {
        MinecraftServer server = requireServer();
        String renderId = safeId(stringArg(args, 0, "render.update"));
        Value opts = objectArg(args, 1, "render.update");
        RenderNode node = renderNodes.get(renderId);
        if (node == null) throw new IllegalArgumentException("unknown render node: " + renderId);
        if (node.entity == null || node.entity.isRemoved()) node.entity = resolveRenderEntity(server, node);

        VisualSpec newVisual = node.visual;
        if (opts.hasMember("visual")) {
            newVisual = parseVisual(memberObject(opts, "visual", "render.update"), "render.update.visual");
        }

        String oldDimension = node.dimension;
        node.dimension = memberResource(opts, "dimension", node.dimension);
        node.x = memberDouble(opts, "x", node.x);
        node.y = memberDouble(opts, "y", node.y);
        node.z = memberDouble(opts, "z", node.z);
        node.yaw = (float) memberDouble(opts, "yaw", node.yaw);
        node.pitch = (float) memberDouble(opts, "pitch", node.pitch);
        node.roll = (float) memberDouble(opts, "roll", node.roll);
        if (opts.hasMember("scale")) node.scale = memberScale(opts, "scale", node.scale);
        if (opts.hasMember("offset")) node.offset = memberVec3(opts, "offset", node.offset);
        node.billboard = memberString(opts, "billboard", node.billboard);
        if (opts.hasMember("smoothing")) applySmoothing(node, memberObject(opts, "smoothing", "render.update"));

        boolean visualNeedsReplacement = !node.visual.kind.equals(newVisual.kind)
            || ("character".equals(node.visual.kind) && !node.visual.resource.equals(newVisual.resource));
        if (visualNeedsReplacement) {
            Entity old = node.entity;
            if (!old.isRemoved()) old.discard();
            node.visual = newVisual;
            node.entity = createRenderEntity(server, requireLevel(server, node.dimension), node);
        } else {
            node.visual = newVisual;
            applyVisual(node.entity, newVisual);
        }

        if (!oldDimension.equals(node.dimension) && !visualNeedsReplacement) {
            ServerLevel target = requireLevel(server, node.dimension);
            if (!node.entity.teleportTo(target, node.x, node.y, node.z, Set.of(), node.yaw, node.pitch, false)) {
                throw new IllegalStateException("render dimension transfer failed for " + renderId);
            }
        }
        applyRenderTransform(node, false);
        syncAttachedChildren(renderId);
    }

    private void removeRender(Value[] args) {
        String renderId = safeId(stringArg(args, 0, "render.remove"));
        removeRenderNode(renderId);
    }

    private void attachRender(Value[] args) {
        String childId = safeId(stringArg(args, 0, "render.attach"));
        String parentId = safeId(stringArg(args, 1, "render.attach"));
        Value opts = objectArg(args, 2, "render.attach");
        if (childId.equals(parentId)) throw new IllegalArgumentException("render node cannot attach to itself");
        requireRenderNode(childId);
        requireRenderNode(parentId);

        String cursor = parentId;
        while (renderAttachments.containsKey(cursor)) {
            cursor = renderAttachments.get(cursor).parentId;
            if (childId.equals(cursor)) throw new IllegalArgumentException("render attachment cycle");
        }
        Vector3f offset = new Vector3f(
            (float) memberDouble(opts, "x", 0),
            (float) memberDouble(opts, "y", 0),
            (float) memberDouble(opts, "z", 0)
        );
        renderAttachments.put(childId, new Attachment(parentId, offset));
        syncAttachedChild(childId);
    }

    private void detachRender(Value[] args) {
        String childId = safeId(stringArg(args, 0, "render.detach"));
        renderAttachments.remove(childId);
    }

    private RenderNode requireRenderNode(String id) {
        RenderNode node = renderNodes.get(id);
        if (node == null) throw new IllegalArgumentException("unknown render node: " + id);
        if (node.entity == null || node.entity.isRemoved()) {
            node.entity = resolveRenderEntity(requireServer(), node);
        }
        return node;
    }

    private Entity resolveRenderEntity(MinecraftServer server, RenderNode node) {
        ServerLevel level = requireLevel(server, node.dimension);
        // Runtime entities persist with the chunk, but a chunk unload invalidates the old Java object.
        // Load the node's last known chunk and reacquire the live entity by the script-owned render tag.
        level.getChunkAt(BlockPos.containing(node.x, node.y, node.z));
        String tag = renderTag(node.id);
        Entity entity = switch (node.visual.kind) {
            case "character" -> level.getEntities(EntityType.MANNEQUIN, candidate -> candidate.entityTags().contains(tag)).stream().findFirst().orElse(null);
            case "model" -> level.getEntities(EntityType.ITEM_DISPLAY, candidate -> candidate.entityTags().contains(tag)).stream().findFirst().orElse(null);
            case "block" -> level.getEntities(EntityType.BLOCK_DISPLAY, candidate -> candidate.entityTags().contains(tag)).stream().findFirst().orElse(null);
            case "text" -> level.getEntities(EntityType.TEXT_DISPLAY, candidate -> candidate.entityTags().contains(tag)).stream().findFirst().orElse(null);
            default -> null;
        };
        if (entity == null) throw new IllegalArgumentException("unknown render node: " + node.id);
        entity.noPhysics = true;
        entity.setDeltaMovement(0, 0, 0);
        return entity;
    }

    private void removeRenderNode(String id) {
        List<String> children = renderAttachments.entrySet().stream()
            .filter(entry -> entry.getValue().parentId.equals(id))
            .map(Map.Entry::getKey)
            .toList();
        for (String child : children) removeRenderNode(child);
        renderAttachments.remove(id);
        RenderNode node = renderNodes.remove(id);
        if (node != null && node.entity != null && !node.entity.isRemoved()) node.entity.discard();
    }

    private Entity createRenderEntity(MinecraftServer server, ServerLevel level, RenderNode node) {
        level.getChunkAt(BlockPos.containing(node.x, node.y, node.z));
        String tag = renderTag(node.id);
        // A prior process can leave a persisted projection behind if it stopped while this chunk was unloaded.
        // Once the target chunk is loaded, clear that logical id before creating its new projection.
        exec(server, "execute in " + node.dimension + " run kill @e[tag=" + tag + "]");
        Entity entity;
        switch (node.visual.kind) {
            case "character" -> {
                String texture = node.visual.resource;
                if (texture == null || "minecraft:entity/player/wide/steve".equals(texture)) {
                    Mannequin mannequin = EntityType.MANNEQUIN.create(level, EntitySpawnReason.COMMAND);
                    if (mannequin == null) throw new IllegalStateException("failed to create character render " + node.id);
                    entity = mannequin;
                    prepareOwnedEntity(entity, tag);
                    if (!level.addFreshEntity(entity)) {
                        entity.discard();
                        throw new IllegalStateException("failed to add character render " + node.id);
                    }
                } else {
                    exec(server, String.format(Locale.ROOT,
                        "execute in %s run summon minecraft:mannequin %.4f %.4f %.4f {Tags:[\\\"%s\\\",\\\"%s\\\"],Invulnerable:1b,NoGravity:1b,profile:{texture:\\\"%s\\\"}}",
                        node.dimension, node.x, node.y, node.z, ownerTag, tag, texture));
                    entity = level.getEntities(EntityType.MANNEQUIN, candidate -> candidate.entityTags().contains(tag)).stream()
                        .findFirst()
                        .orElseThrow(() -> new IllegalStateException("failed to resolve custom character render " + node.id));
                    entity.noPhysics = true;
                    entity.setDeltaMovement(0, 0, 0);
                }
            }
            case "model" -> {
                Display.ItemDisplay display = EntityType.ITEM_DISPLAY.create(level, EntitySpawnReason.COMMAND);
                if (display == null) throw new IllegalStateException("failed to create model render " + node.id);
                entity = display;
                prepareOwnedEntity(entity, tag);
                applyVisual(entity, node.visual);
                if (!level.addFreshEntity(entity)) {
                    entity.discard();
                    throw new IllegalStateException("failed to add model render " + node.id);
                }
            }
            case "block" -> {
                Display.BlockDisplay display = EntityType.BLOCK_DISPLAY.create(level, EntitySpawnReason.COMMAND);
                if (display == null) throw new IllegalStateException("failed to create block render " + node.id);
                entity = display;
                prepareOwnedEntity(entity, tag);
                applyVisual(entity, node.visual);
                if (!level.addFreshEntity(entity)) {
                    entity.discard();
                    throw new IllegalStateException("failed to add block render " + node.id);
                }
            }
            case "text" -> {
                Display.TextDisplay display = EntityType.TEXT_DISPLAY.create(level, EntitySpawnReason.COMMAND);
                if (display == null) throw new IllegalStateException("failed to create text render " + node.id);
                entity = display;
                prepareOwnedEntity(entity, tag);
                applyVisual(entity, node.visual);
                if (!level.addFreshEntity(entity)) {
                    entity.discard();
                    throw new IllegalStateException("failed to add text render " + node.id);
                }
            }
            default -> throw new IllegalArgumentException("unsupported render visual kind: " + node.visual.kind);
        }
        return entity;
    }

    private void prepareOwnedEntity(Entity entity, String tag) {
        entity.setNoGravity(true);
        entity.noPhysics = true;
        entity.setDeltaMovement(0, 0, 0);
        entity.setInvulnerable(true);
        entity.addTag(ownerTag);
        entity.addTag(tag);
    }

    private void applyVisual(Entity entity, VisualSpec visual) {
        switch (visual.kind) {
            case "character" -> { /* profile changes require entity replacement */ }
            case "model" -> {
                if (!(entity instanceof Display.ItemDisplay display)) throw new IllegalArgumentException("render kind/entity mismatch");
                ItemStack carrier = new ItemStack(Items.PAPER);
                carrier.set(DataComponents.ITEM_MODEL, Identifier.parse(visual.resource));
                ((ItemDisplayAccessor) display).mcgame$setItemStack(carrier);
                ((ItemDisplayAccessor) display).mcgame$setItemTransform(ItemDisplayContext.FIXED);
            }
            case "block" -> {
                if (!(entity instanceof Display.BlockDisplay display)) throw new IllegalArgumentException("render kind/entity mismatch");
                Block block = BuiltInRegistries.BLOCK.getOptional(Identifier.parse(visual.resource))
                    .orElseThrow(() -> new IllegalArgumentException("unknown block: " + visual.resource));
                ((BlockDisplayAccessor) display).mcgame$setBlockState(block.defaultBlockState());
            }
            case "text" -> {
                if (!(entity instanceof Display.TextDisplay display)) throw new IllegalArgumentException("render kind/entity mismatch");
                ((TextDisplayAccessor) display).mcgame$setText(visual.text);
            }
            default -> throw new IllegalArgumentException("unsupported render visual kind: " + visual.kind);
        }
    }

    private void applyRenderTransform(RenderNode node, boolean initial) {
        Entity entity = node.entity;
        entity.setDeltaMovement(0, 0, 0);
        if (initial) {
            entity.setPos(node.x, node.y, node.z);
            entity.setYRot(node.yaw);
            entity.setXRot(node.pitch);
        } else {
            ServerLevel level = (ServerLevel) entity.level();
            if (!entity.teleportTo(level, node.x, node.y, node.z, Set.of(), node.yaw, node.pitch, false)) {
                throw new IllegalStateException("render position update failed for " + node.id);
            }
        }
        if (entity instanceof Display display) {
            DisplayAccessor access = (DisplayAccessor) display;
            access.mcgame$setPosRotInterpolationDuration(node.positionTicks);
            access.mcgame$setTransformationInterpolationDuration(node.transformTicks);
            access.mcgame$setTransformationInterpolationDelay(0);
            Quaternionf roll = new Quaternionf().rotateZ((float) Math.toRadians(node.roll));
            Transformation transform = new Transformation(
                new Vector3f(node.offset),
                roll,
                new Vector3f(node.scale),
                new Quaternionf()
            );
            access.mcgame$setTransformation(transform);
            access.mcgame$setBillboardConstraints(parseBillboard(node.billboard));
        } else if (!initial && (node.roll != 0 || !node.scale.equals(new Vector3f(1, 1, 1)) || !node.offset.equals(new Vector3f()))) {
            // Character transforms beyond position/rotation are intentionally presentation-only Display features.
        }
    }

    private void applySmoothing(RenderNode node, Value smoothing) {
        node.positionTicks = memberBoundedInt(smoothing, "positionTicks", node.positionTicks, 0, 100);
        node.transformTicks = memberBoundedInt(smoothing, "transformTicks", node.transformTicks, 0, 100);
    }

    private Display.BillboardConstraints parseBillboard(String value) {
        return switch (value) {
            case "fixed" -> Display.BillboardConstraints.FIXED;
            case "vertical" -> Display.BillboardConstraints.VERTICAL;
            case "horizontal" -> Display.BillboardConstraints.HORIZONTAL;
            case "center" -> Display.BillboardConstraints.CENTER;
            default -> throw new IllegalArgumentException("invalid billboard: " + value);
        };
    }

    private VisualSpec parseVisual(Value visual, String api) {
        String kind = memberString(visual, "kind", null);
        if (kind == null) throw new IllegalArgumentException(api + ".kind is required");
        return switch (kind) {
            case "character" -> new VisualSpec(kind, memberResource(visual, "texture", "minecraft:entity/player/wide/steve"), null);
            case "model" -> new VisualSpec(kind, memberResource(visual, "model", null), null);
            case "block" -> new VisualSpec(kind, memberResource(visual, "block", null), null);
            case "text" -> {
                if (!visual.hasMember("text")) throw new IllegalArgumentException(api + ".text is required");
                yield new VisualSpec(kind, null, toComponent(visual.getMember("text"), api + ".text"));
            }
            default -> throw new IllegalArgumentException("unsupported render visual kind: " + kind);
        };
    }

    private void syncRenderAttachments() {
        for (String childId : List.copyOf(renderAttachments.keySet())) syncAttachedChild(childId);
    }

    private void syncAttachedChildren(String parentId) {
        for (Map.Entry<String, Attachment> entry : List.copyOf(renderAttachments.entrySet())) {
            if (entry.getValue().parentId.equals(parentId)) syncAttachedChild(entry.getKey());
        }
    }

    private void syncAttachedChild(String childId) {
        Attachment attachment = renderAttachments.get(childId);
        if (attachment == null) return;
        RenderNode child = renderNodes.get(childId);
        RenderNode parent = renderNodes.get(attachment.parentId);
        if (child == null || parent == null) return;
        if (child.entity == null || child.entity.isRemoved()) child.entity = resolveRenderEntity(requireServer(), child);
        if (parent.entity == null || parent.entity.isRemoved()) parent.entity = resolveRenderEntity(requireServer(), parent);
        if (!child.entity.level().dimension().equals(parent.entity.level().dimension())) {
            if (!(parent.entity.level() instanceof ServerLevel target)) return;
            double targetX = parent.entity.getX() + attachment.offset.x;
            double targetY = parent.entity.getY() + attachment.offset.y;
            double targetZ = parent.entity.getZ() + attachment.offset.z;
            if (!child.entity.teleportTo(target, targetX, targetY, targetZ, Set.of(), child.yaw, child.pitch, false)) return;
            child.dimension = target.dimension().identifier().toString();
        }
        child.x = parent.entity.getX() + attachment.offset.x;
        child.y = parent.entity.getY() + attachment.offset.y;
        child.z = parent.entity.getZ() + attachment.offset.z;
        child.entity.setDeltaMovement(0, 0, 0);
        child.entity.setPos(child.x, child.y, child.z);
        syncAttachedChildren(childId);
    }

    private void setPanel(Value[] args) {
        MinecraftServer server = requireServer();
        ServerPlayer player = requirePlayer(server, stringArg(args, 0, "ui.panel"));
        if (args.length < 2 || args[1].isNull()) {
            PanelState old = panels.remove(player.getUUID());
            if (old != null) hidePanel(server, old);
            return;
        }

        Value opts = objectArg(args, 1, "ui.panel");
        if (!opts.hasMember("title")) throw new IllegalArgumentException("ui.panel.title is required");
        Component title = toComponent(opts.getMember("title"), "ui.panel.title");
        Value rowsValue = memberArray(opts, "rows", "ui.panel");
        int rowCount = Math.toIntExact(rowsValue.getArraySize());
        if (rowCount > 15) throw new IllegalArgumentException("ui.panel supports at most 15 rows");

        List<PanelRow> rows = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (int i = 0; i < rowCount; i++) {
            Value row = arrayObject(rowsValue, i, "ui.panel.rows");
            String rowId = safeUiId(memberString(row, "id", null), "ui.panel row id");
            if (!ids.add(rowId)) throw new IllegalArgumentException("duplicate ui.panel row id: " + rowId);
            if (!row.hasMember("label")) throw new IllegalArgumentException("ui.panel row label is required");
            Component label = toComponent(row.getMember("label"), "ui.panel row label");
            Component display = label;
            if (row.hasMember("value") && !row.getMember("value").isNull()) {
                display = Component.literal("").append(label).append(Component.literal("  ")).append(toComponent(row.getMember("value"), "ui.panel row value"));
            }
            rows.add(new PanelRow(rowId, panelOwner(rowId), display, rowCount - i));
        }

        PanelState panel = panels.get(player.getUUID());
        if (panel == null) {
            panel = new PanelState(player.getUUID(), panelObjectiveName(player.getUUID()), title);
            panels.put(player.getUUID(), panel);
            panel.rows = rows;
            sendFullPanel(player, panel);
            panel.sentPlayer = player;
            return;
        }

        if (!panel.title.equals(title)) {
            panel.title = title;
            panel.objective.setDisplayName(title);
            if (panel.sentPlayer == player) player.connection.send(new ClientboundSetObjectivePacket(panel.objective, ClientboundSetObjectivePacket.METHOD_CHANGE));
        }
        applyPanelRows(player, panel, rows);
        panel.rows = rows;
        panel.sentPlayer = player;
    }

    private void applyPanelRows(ServerPlayer player, PanelState panel, List<PanelRow> nextRows) {
        if (panel.sentPlayer != player) {
            panel.rows = nextRows;
            sendFullPanel(player, panel);
            return;
        }
        Map<String, PanelRow> oldById = new HashMap<>();
        for (PanelRow row : panel.rows) oldById.put(row.id, row);
        Map<String, PanelRow> nextById = new HashMap<>();
        for (PanelRow row : nextRows) nextById.put(row.id, row);

        for (PanelRow old : panel.rows) {
            if (!nextById.containsKey(old.id)) {
                player.connection.send(new ClientboundResetScorePacket(old.owner, panel.objectiveName));
            }
        }
        for (PanelRow row : nextRows) {
            PanelRow old = oldById.get(row.id);
            if (!row.equals(old)) sendPanelRow(player, panel, row);
        }
    }

    private void sendFullPanel(ServerPlayer player, PanelState panel) {
        panel.objective.setDisplayName(panel.title);
        player.connection.send(new ClientboundSetObjectivePacket(panel.objective, ClientboundSetObjectivePacket.METHOD_ADD));
        player.connection.send(new ClientboundSetDisplayObjectivePacket(DisplaySlot.SIDEBAR, panel.objective));
        for (PanelRow row : panel.rows) sendPanelRow(player, panel, row);
    }

    private void sendPanelRow(ServerPlayer player, PanelState panel, PanelRow row) {
        player.connection.send(new ClientboundSetScorePacket(
            row.owner,
            panel.objectiveName,
            row.score,
            Optional.of(row.display),
            Optional.of(BlankFormat.INSTANCE)
        ));
    }

    private void hidePanel(MinecraftServer server, PanelState panel) {
        ServerPlayer player = server.getPlayerList().getPlayer(panel.playerId);
        if (player != null) {
            player.connection.send(new ClientboundSetDisplayObjectivePacket(DisplaySlot.SIDEBAR, null));
            player.connection.send(new ClientboundSetObjectivePacket(panel.objective, ClientboundSetObjectivePacket.METHOD_REMOVE));
        }
        panel.sentPlayer = null;
    }

    private void refreshPanelConnections(MinecraftServer server) {
        for (PanelState panel : panels.values()) {
            ServerPlayer player = server.getPlayerList().getPlayer(panel.playerId);
            if (player == null) {
                panel.sentPlayer = null;
            } else if (panel.sentPlayer != player) {
                sendFullPanel(player, panel);
                panel.sentPlayer = player;
            }
        }
    }

    private String panelObjectiveName(UUID playerId) {
        String player = playerId.toString().replace("-", "").substring(0, 4);
        String value = "mg" + scope + player;
        return value.length() <= 16 ? value : value.substring(0, 16);
    }

    private String panelOwner(String rowId) {
        return scope + "_" + rowId;
    }

    private void openMenu(Value[] args) {
        MinecraftServer server = requireServer();
        ServerPlayer player = requirePlayer(server, stringArg(args, 0, "menu.open"));
        Value opts = objectArg(args, 1, "menu.open");
        String menuId = safeUiId(memberString(opts, "id", null), "menu id");
        String kind = memberString(opts, "kind", "items");
        if (!opts.hasMember("title")) throw new IllegalArgumentException("menu title is required");
        Component title = toComponent(opts.getMember("title"), "menu.title");
        Value entries = memberArray(opts, "entries", "menu.open");

        OpenMenuState old = openMenus.remove(player.getUUID());
        if (old != null) closeMenuState(server, old);
        MenuActionRegistry.removeForPlayerMenu(this, player.getUUID(), menuId);

        switch (kind) {
            case "items" -> openItemMenu(player, menuId, title, opts, entries);
            case "choice" -> openChoiceDialog(player, menuId, title, opts, entries);
            default -> throw new IllegalArgumentException("unsupported menu kind: " + kind);
        }
    }

    private void openItemMenu(ServerPlayer player, String menuId, Component title, Value opts, Value entries) {
        int entryCount = Math.toIntExact(entries.getArraySize());
        if (entryCount > 54) throw new IllegalArgumentException("item menu supports at most 54 entries");
        int requestedRows = memberBoundedInt(opts, "rows", 0, 0, 6);
        int maxSlot = -1;
        List<MenuItemSpec> specs = new ArrayList<>();
        Set<Integer> usedSlots = new HashSet<>();

        for (int i = 0; i < entryCount; i++) {
            Value entry = arrayObject(entries, i, "menu.entries");
            String actionId = safeUiId(memberString(entry, "id", null), "menu entry id");
            int slot = memberBoundedInt(entry, "slot", i, 0, 53);
            if (!usedSlots.add(slot)) throw new IllegalArgumentException("duplicate menu slot: " + slot);
            maxSlot = Math.max(maxSlot, slot);
            if (!entry.hasMember("label")) throw new IllegalArgumentException("menu item label is required");
            Component label = toComponent(entry.getMember("label"), "menu item label");
            Component description = entry.hasMember("description") && !entry.getMember("description").isNull()
                ? toComponent(entry.getMember("description"), "menu item description") : null;
            String itemId = memberResource(entry, "item", "minecraft:paper");
            String model = entry.hasMember("model") ? memberResource(entry, "model", null) : null;
            int count = memberBoundedInt(entry, "count", 1, 1, 64);
            specs.add(new MenuItemSpec(actionId, slot, itemId, model, label, description, count));
        }

        int rows = requestedRows > 0 ? requestedRows : Math.max(1, (maxSlot + 9) / 9);
        if (maxSlot >= rows * 9) throw new IllegalArgumentException("menu entry slot exceeds configured rows");
        SimpleContainer container = new SimpleContainer(rows * 9);
        List<String> actions = new ArrayList<>();
        for (int i = 0; i < rows * 9; i++) actions.add(null);

        for (MenuItemSpec spec : specs) {
            var item = BuiltInRegistries.ITEM.getOptional(Identifier.parse(spec.itemId))
                .orElseThrow(() -> new IllegalArgumentException("unknown item: " + spec.itemId));
            ItemStack stack = new ItemStack(item, spec.count);
            stack.set(DataComponents.CUSTOM_NAME, spec.label);
            if (spec.description != null) stack.set(DataComponents.LORE, new ItemLore(List.of(spec.description)));
            if (spec.model != null) stack.set(DataComponents.ITEM_MODEL, Identifier.parse(spec.model));
            container.setItem(spec.slot, stack);
            actions.set(spec.slot, spec.actionId);
        }

        MenuType<?> type = menuType(rows);
        UUID playerId = player.getUUID();
        OpenMenuState state = new OpenMenuState(playerId, menuId, MenuKind.CONTAINER);
        SimpleMenuProvider provider = new SimpleMenuProvider((containerId, inventory, ignored) ->
            new VirtualActionMenu(type, containerId, inventory, container, rows, actions,
                actionId -> enqueueMenuAction(playerId, player.getGameProfile().name(), menuId, actionId),
                () -> {
                    OpenMenuState current = openMenus.get(playerId);
                    if (current == state) openMenus.remove(playerId);
                }), title);
        if (player.openMenu(provider).isEmpty()) throw new IllegalStateException("failed to open item menu");
        openMenus.put(playerId, state);
    }

    private void openChoiceDialog(ServerPlayer player, String menuId, Component title, Value opts, Value entries) {
        int entryCount = Math.toIntExact(entries.getArraySize());
        if (entryCount < 1 || entryCount > 32) throw new IllegalArgumentException("choice menu requires 1..32 entries");
        List<ActionButton> buttons = new ArrayList<>();
        for (int i = 0; i < entryCount; i++) {
            Value entry = arrayObject(entries, i, "menu.entries");
            String actionId = safeUiId(memberString(entry, "id", null), "menu entry id");
            if (!entry.hasMember("label")) throw new IllegalArgumentException("menu choice label is required");
            Component label = toComponent(entry.getMember("label"), "menu choice label");
            Optional<Component> tooltip = entry.hasMember("description") && !entry.getMember("description").isNull()
                ? Optional.of(toComponent(entry.getMember("description"), "menu choice description")) : Optional.empty();
            String token = MenuActionRegistry.register(this, player.getUUID(), menuId, actionId);
            CompoundTag payload = new CompoundTag();
            payload.putString("token", token);
            ActionButton button = new ActionButton(
                new CommonButtonData(label, tooltip, memberBoundedInt(entry, "width", 150, 50, 310)),
                Optional.of(new CustomAll(MenuActionRegistry.ACTION_ID, Optional.of(payload)))
            );
            buttons.add(button);
        }

        List<DialogBody> body = new ArrayList<>();
        if (opts.hasMember("body") && !opts.getMember("body").isNull()) {
            body.add(new PlainMessage(toComponent(opts.getMember("body"), "menu.body"), 310));
        }
        CommonDialogData common = new CommonDialogData(
            title,
            Optional.empty(),
            true,
            false,
            DialogAction.CLOSE,
            body,
            List.of()
        );
        int columns = memberBoundedInt(opts, "columns", 1, 1, 4);
        MultiActionDialog dialog = new MultiActionDialog(common, buttons, Optional.empty(), columns);
        player.openDialog(Holder.direct(dialog));
        openMenus.put(player.getUUID(), new OpenMenuState(player.getUUID(), menuId, MenuKind.DIALOG));
    }

    private void closeMenu(Value[] args) {
        MinecraftServer server = requireServer();
        ServerPlayer player = requirePlayer(server, stringArg(args, 0, "menu.close"));
        String expectedId = args.length >= 2 && !args[1].isNull() ? safeUiId(stringArg(args, 1, "menu.close"), "menu id") : null;
        OpenMenuState state = openMenus.get(player.getUUID());
        if (state == null) return;
        if (expectedId != null && !expectedId.equals(state.menuId)) return;
        openMenus.remove(player.getUUID());
        closeMenuState(server, state);
    }

    private void closeMenuState(MinecraftServer server, OpenMenuState state) {
        ServerPlayer player = server.getPlayerList().getPlayer(state.playerId);
        MenuActionRegistry.removeForPlayerMenu(this, state.playerId, state.menuId);
        if (player == null) return;
        if (state.kind == MenuKind.CONTAINER) player.closeContainer();
        else player.connection.send(ClientboundClearDialogPacket.INSTANCE);
    }

    private MenuType<?> menuType(int rows) {
        return switch (rows) {
            case 1 -> MenuType.GENERIC_9x1;
            case 2 -> MenuType.GENERIC_9x2;
            case 3 -> MenuType.GENERIC_9x3;
            case 4 -> MenuType.GENERIC_9x4;
            case 5 -> MenuType.GENERIC_9x5;
            case 6 -> MenuType.GENERIC_9x6;
            default -> throw new IllegalArgumentException("rows must be 1..6");
        };
    }

    private Component toComponent(Value value, String api) {
        if (value == null || value.isNull()) return Component.empty();
        if (value.isString()) return Component.literal(value.asString());
        if (!value.hasArrayElements()) throw new IllegalArgumentException(api + " must be a string or UiSpan[]");
        MutableComponent result = Component.empty();
        long size = value.getArraySize();
        if (size > 64) throw new IllegalArgumentException(api + " has too many spans");
        for (long i = 0; i < size; i++) {
            Value span = value.getArrayElement(i);
            if (span == null || !span.hasMembers()) throw new IllegalArgumentException(api + " span must be an object");
            String text = memberString(span, "text", null);
            if (text == null) throw new IllegalArgumentException(api + " span.text is required");
            MutableComponent part = Component.literal(text);
            String tone = memberString(span, "tone", "normal");
            ChatFormatting format = switch (tone) {
                case "normal" -> ChatFormatting.WHITE;
                case "muted" -> ChatFormatting.DARK_GRAY;
                case "info" -> ChatFormatting.AQUA;
                case "success" -> ChatFormatting.GREEN;
                case "warning" -> ChatFormatting.GOLD;
                case "danger" -> ChatFormatting.RED;
                default -> throw new IllegalArgumentException("invalid UI tone: " + tone);
            };
            part.withStyle(format);
            if (memberBoolean(span, "bold", false)) part.withStyle(ChatFormatting.BOLD);
            result.append(part);
        }
        return result;
    }

    private static Value memberObject(Value object, String name, String api) {
        if (!object.hasMember(name)) throw new IllegalArgumentException(api + "." + name + " is required");
        Value value = object.getMember(name);
        if (value == null || value.isNull() || !value.hasMembers()) throw new IllegalArgumentException(api + "." + name + " must be an object");
        return value;
    }

    private static Value memberArray(Value object, String name, String api) {
        if (!object.hasMember(name)) throw new IllegalArgumentException(api + "." + name + " is required");
        Value value = object.getMember(name);
        if (value == null || value.isNull() || !value.hasArrayElements()) throw new IllegalArgumentException(api + "." + name + " must be an array");
        return value;
    }

    private static Value arrayObject(Value array, long index, String api) {
        Value value = array.getArrayElement(index);
        if (value == null || value.isNull() || !value.hasMembers()) throw new IllegalArgumentException(api + "[" + index + "] must be an object");
        return value;
    }

    private static String memberString(Value object, String name, String fallback) {
        if (!object.hasMember(name)) return fallback;
        Value value = object.getMember(name);
        if (value == null || value.isNull()) return fallback;
        if (!value.isString()) throw new IllegalArgumentException(name + " must be a string");
        return value.asString();
    }

    private static boolean memberBoolean(Value object, String name, boolean fallback) {
        if (!object.hasMember(name)) return fallback;
        Value value = object.getMember(name);
        if (value == null || value.isNull()) return fallback;
        if (!value.isBoolean()) throw new IllegalArgumentException(name + " must be boolean");
        return value.asBoolean();
    }

    private static int memberBoundedInt(Value object, String name, int fallback, int min, int max) {
        if (!object.hasMember(name)) return fallback;
        Value value = object.getMember(name);
        if (value == null || value.isNull()) return fallback;
        if (!value.fitsInInt()) throw new IllegalArgumentException(name + " must be an integer");
        int result = value.asInt();
        if (result < min || result > max) throw new IllegalArgumentException(name + " must be between " + min + " and " + max);
        return result;
    }

    private static Vector3f memberScale(Value object, String name, Vector3f fallback) {
        if (!object.hasMember(name)) return new Vector3f(fallback);
        Value value = object.getMember(name);
        if (value == null || value.isNull()) return new Vector3f(fallback);
        if (value.isNumber()) {
            float scalar = finiteFloat(value.asDouble(), name);
            if (scalar < 0 || scalar > 100) throw new IllegalArgumentException(name + " must be between 0 and 100");
            return new Vector3f(scalar, scalar, scalar);
        }
        if (!value.hasMembers()) throw new IllegalArgumentException(name + " must be a number or vec3");
        return new Vector3f(
            finiteFloat(memberDouble(value, "x", fallback.x), name + ".x"),
            finiteFloat(memberDouble(value, "y", fallback.y), name + ".y"),
            finiteFloat(memberDouble(value, "z", fallback.z), name + ".z")
        );
    }

    private static Vector3f memberVec3(Value object, String name, Vector3f fallback) {
        if (!object.hasMember(name)) return new Vector3f(fallback);
        Value value = object.getMember(name);
        if (value == null || value.isNull() || !value.hasMembers()) throw new IllegalArgumentException(name + " must be a vec3 object");
        return new Vector3f(
            finiteFloat(memberDouble(value, "x", fallback.x), name + ".x"),
            finiteFloat(memberDouble(value, "y", fallback.y), name + ".y"),
            finiteFloat(memberDouble(value, "z", fallback.z), name + ".z")
        );
    }

    private static float finiteFloat(double value, String name) {
        if (!Double.isFinite(value) || Math.abs(value) > 30_000_000) throw new IllegalArgumentException("invalid number for " + name);
        return (float) value;
    }

    private static String safeUiId(String id, String label) {
        if (id == null || !SAFE_ID.matcher(id).matches()) throw new IllegalArgumentException("invalid " + label + ": " + id);
        return id;
    }

    private String renderTag(String renderId) { return "mcg_" + scope + "_r_" + renderId; }

    private static final class RenderNode {
        final String id;
        Entity entity;
        VisualSpec visual;
        String dimension;
        double x;
        double y;
        double z;
        float yaw;
        float pitch;
        float roll;
        Vector3f scale = new Vector3f(1, 1, 1);
        Vector3f offset = new Vector3f();
        int positionTicks;
        int transformTicks;
        String billboard = "fixed";

        RenderNode(String id) { this.id = id; }
    }

    private record VisualSpec(String kind, String resource, Component text) {}
    private record Attachment(String parentId, Vector3f offset) {}
    private record PendingMenuAction(UUID playerId, String playerName, String menuId, String actionId) {}
    private record MenuItemSpec(String actionId, int slot, String itemId, String model, Component label, Component description, int count) {}
    private record PanelRow(String id, String owner, Component display, int score) {}
    private enum MenuKind { CONTAINER, DIALOG }

    private static final class OpenMenuState {
        final UUID playerId;
        final String menuId;
        final MenuKind kind;
        OpenMenuState(UUID playerId, String menuId, MenuKind kind) {
            this.playerId = playerId;
            this.menuId = menuId;
            this.kind = kind;
        }
    }

    private static final class PanelState {
        final UUID playerId;
        final String objectiveName;
        final Objective objective;
        Component title;
        List<PanelRow> rows = List.of();
        ServerPlayer sentPlayer;

        PanelState(UUID playerId, String objectiveName, Component title) {
            this.playerId = playerId;
            this.objectiveName = objectiveName;
            this.title = title;
            Scoreboard board = new Scoreboard();
            this.objective = board.addObjective(
                objectiveName,
                ObjectiveCriteria.DUMMY,
                title,
                ObjectiveCriteria.RenderType.INTEGER,
                false,
                BlankFormat.INSTANCE
            );
        }
    }

    private void runWithBudget(Runnable action) {
        runWithBudget(action, HARD_BUDGET_MS);
    }

    private void runWithBudget(Runnable action, long budgetMs) {
        AtomicBoolean running = new AtomicBoolean(true);
        ScheduledFuture<?> killer = WATCHDOG.schedule(() -> {
            if (running.compareAndSet(true, false)) {
                logger.error("mcgame script {} exceeded hard {} ms execution budget; cancelling context", id, budgetMs);
                context.close(true);
            }
        }, budgetMs, TimeUnit.MILLISECONDS);
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

    private ServerLevel requireLevel(MinecraftServer server, String id) {
        ResourceKey<Level> key = ResourceKey.create(Registries.DIMENSION, Identifier.parse(id));
        ServerLevel level = server.getLevel(key);
        if (level == null) throw new IllegalArgumentException("unknown dimension: " + id);
        return level;
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
        ButtonState buttons, boolean jumpPressed, boolean sneakPressed, boolean sprintPressed,
        int hotbarSlot, boolean hotbarChanged, Set<String> pressedActions
    ) {}
}
