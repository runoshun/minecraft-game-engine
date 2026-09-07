package dev.mcgame.runtime.mixin;

import dev.mcgame.runtime.InputActionRegistry;
import net.minecraft.network.protocol.game.ServerboundAttackPacket;
import net.minecraft.network.protocol.game.ServerboundInteractPacket;
import net.minecraft.network.protocol.game.ServerboundPickItemFromBlockPacket;
import net.minecraft.network.protocol.game.ServerboundPickItemFromEntityPacket;
import net.minecraft.network.protocol.game.ServerboundPlayerActionPacket;
import net.minecraft.network.protocol.game.ServerboundPlayerCommandPacket;
import net.minecraft.network.protocol.game.ServerboundSwingPacket;
import net.minecraft.network.protocol.game.ServerboundUseItemOnPacket;
import net.minecraft.network.protocol.game.ServerboundUseItemPacket;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.ServerGamePacketListenerImpl;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ServerGamePacketListenerImpl.class)
public abstract class ServerGamePacketListenerMixin {
    private ServerPlayer mcgame$player() {
        return ((ServerGamePacketListenerImpl) (Object) this).getPlayer();
    }

    private void mcgame$record(InputActionRegistry.Action action) {
        InputActionRegistry.record(mcgame$player(), action);
    }

    @Inject(method = "handleAnimate", at = @At("HEAD"))
    private void mcgame$handleAnimate(ServerboundSwingPacket packet, CallbackInfo ci) {
        mcgame$record(InputActionRegistry.Action.SWING);
    }

    @Inject(method = "handleAttack", at = @At("HEAD"))
    private void mcgame$handleAttack(ServerboundAttackPacket packet, CallbackInfo ci) {
        mcgame$record(InputActionRegistry.Action.ATTACK);
    }

    @Inject(method = "handleUseItem", at = @At("HEAD"))
    private void mcgame$handleUseItem(ServerboundUseItemPacket packet, CallbackInfo ci) {
        mcgame$record(InputActionRegistry.Action.USE);
    }

    @Inject(method = "handleUseItemOn", at = @At("HEAD"))
    private void mcgame$handleUseItemOn(ServerboundUseItemOnPacket packet, CallbackInfo ci) {
        mcgame$record(InputActionRegistry.Action.USE);
    }

    @Inject(method = "handleInteract", at = @At("HEAD"))
    private void mcgame$handleInteract(ServerboundInteractPacket packet, CallbackInfo ci) {
        mcgame$record(InputActionRegistry.Action.USE);
    }

    @Inject(method = "handlePickItemFromBlock", at = @At("HEAD"))
    private void mcgame$handlePickItemFromBlock(ServerboundPickItemFromBlockPacket packet, CallbackInfo ci) {
        mcgame$record(InputActionRegistry.Action.PICK);
    }

    @Inject(method = "handlePickItemFromEntity", at = @At("HEAD"))
    private void mcgame$handlePickItemFromEntity(ServerboundPickItemFromEntityPacket packet, CallbackInfo ci) {
        mcgame$record(InputActionRegistry.Action.PICK);
    }

    @Inject(method = "handlePlayerAction", at = @At("HEAD"))
    private void mcgame$handlePlayerAction(ServerboundPlayerActionPacket packet, CallbackInfo ci) {
        switch (packet.getAction()) {
            case DROP_ITEM -> mcgame$record(InputActionRegistry.Action.DROP);
            case DROP_ALL_ITEMS -> mcgame$record(InputActionRegistry.Action.DROP_STACK);
            case RELEASE_USE_ITEM -> mcgame$record(InputActionRegistry.Action.USE_RELEASE);
            case SWAP_ITEM_WITH_OFFHAND -> mcgame$record(InputActionRegistry.Action.SWAP_OFFHAND);
            case START_DESTROY_BLOCK -> {
                mcgame$record(InputActionRegistry.Action.ATTACK);
                mcgame$record(InputActionRegistry.Action.DESTROY_START);
            }
            case ABORT_DESTROY_BLOCK -> mcgame$record(InputActionRegistry.Action.DESTROY_ABORT);
            case STOP_DESTROY_BLOCK -> mcgame$record(InputActionRegistry.Action.DESTROY_STOP);
            case STAB -> mcgame$record(InputActionRegistry.Action.STAB);
        }
    }

    @Inject(method = "handlePlayerCommand", at = @At("HEAD"))
    private void mcgame$handlePlayerCommand(ServerboundPlayerCommandPacket packet, CallbackInfo ci) {
        switch (packet.getAction()) {
            case OPEN_INVENTORY -> mcgame$record(InputActionRegistry.Action.VEHICLE_INVENTORY);
            case START_RIDING_JUMP -> mcgame$record(InputActionRegistry.Action.RIDING_JUMP_START);
            case STOP_RIDING_JUMP -> mcgame$record(InputActionRegistry.Action.RIDING_JUMP_STOP);
            case START_FALL_FLYING -> mcgame$record(InputActionRegistry.Action.FALL_FLYING_START);
            case STOP_SLEEPING, START_SPRINTING, STOP_SPRINTING -> { }
        }
    }
}
