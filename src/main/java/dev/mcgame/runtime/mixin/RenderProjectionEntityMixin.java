package dev.mcgame.runtime.mixin;

import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(Entity.class)
public abstract class RenderProjectionEntityMixin {
    @Inject(method = "shouldBeSaved", at = @At("HEAD"), cancellable = true)
    private void mcgame$renderProjectionIsTransient(CallbackInfoReturnable<Boolean> cir) {
        Entity self = (Entity) (Object) this;
        for (String tag : self.entityTags()) {
            if (tag.startsWith("mcg_") && tag.contains("_r_")) {
                cir.setReturnValue(false);
                return;
            }
        }
    }
}
