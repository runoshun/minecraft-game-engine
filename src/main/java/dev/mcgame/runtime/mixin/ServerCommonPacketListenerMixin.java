package dev.mcgame.runtime.mixin;

import dev.mcgame.runtime.MenuActionRegistry;
import net.minecraft.network.protocol.common.ServerboundCustomClickActionPacket;
import net.minecraft.server.network.ServerCommonPacketListenerImpl;
import net.minecraft.server.network.ServerGamePacketListenerImpl;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ServerCommonPacketListenerImpl.class)
public abstract class ServerCommonPacketListenerMixin {
    @Inject(
        method = "handleCustomClickAction",
        at = @At(
            value = "INVOKE",
            target = "Lnet/minecraft/server/MinecraftServer;handleCustomClickAction(Lnet/minecraft/resources/Identifier;Ljava/util/Optional;)V"
        ),
        cancellable = true
    )
    private void mcgame$handleCustomClickAction(ServerboundCustomClickActionPacket packet, CallbackInfo ci) {
        Object self = this;
        if (self instanceof ServerGamePacketListenerImpl game
            && MenuActionRegistry.handle(game.getPlayer(), packet.id(), packet.payload())) {
            ci.cancel();
        }
    }
}
