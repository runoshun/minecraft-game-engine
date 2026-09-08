package dev.mcgame.runtime.mixin;

import dev.mcgame.runtime.RuntimeEntityTags;
import net.minecraft.world.entity.Mob;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Mob.class)
public abstract class MobMixin {
    @Inject(method = "checkDespawn", at = @At("HEAD"), cancellable = true)
    private void mcgame$keepScriptOwnedActors(CallbackInfo ci) {
        Mob self = (Mob) (Object) this;
        if (self.entityTags().contains(RuntimeEntityTags.ACTOR)) {
            ci.cancel();
        }
    }
}
