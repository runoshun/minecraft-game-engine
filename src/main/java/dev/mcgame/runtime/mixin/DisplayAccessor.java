package dev.mcgame.runtime.mixin;

import com.mojang.math.Transformation;
import net.minecraft.world.entity.Display;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(Display.class)
public interface DisplayAccessor {
    @Invoker("setTransformation")
    void mcgame$setTransformation(Transformation transformation);

    @Invoker("setTransformationInterpolationDuration")
    void mcgame$setTransformationInterpolationDuration(int ticks);

    @Invoker("setTransformationInterpolationDelay")
    void mcgame$setTransformationInterpolationDelay(int ticks);

    @Invoker("setPosRotInterpolationDuration")
    void mcgame$setPosRotInterpolationDuration(int ticks);

    @Invoker("setBillboardConstraints")
    void mcgame$setBillboardConstraints(Display.BillboardConstraints constraints);
}
