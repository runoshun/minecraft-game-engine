package dev.mcgame.runtime;

import net.minecraft.world.Container;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.item.ItemStack;

import java.util.List;
import java.util.function.Consumer;

final class VirtualActionMenu extends ChestMenu {
    private final int actionSlots;
    private final List<String> actions;
    private final Consumer<String> onAction;
    private final Runnable onClose;

    VirtualActionMenu(
        MenuType<?> type,
        int containerId,
        Inventory inventory,
        Container container,
        int rows,
        List<String> actions,
        Consumer<String> onAction,
        Runnable onClose
    ) {
        super(type, containerId, inventory, container, rows);
        this.actionSlots = rows * 9;
        this.actions = actions;
        this.onAction = onAction;
        this.onClose = onClose;
    }

    @Override
    public void clicked(int slotIndex, int button, ContainerInput input, Player player) {
        if (slotIndex >= 0 && slotIndex < actionSlots) {
            if (slotIndex < actions.size()) {
                String action = actions.get(slotIndex);
                if (action != null && !action.isBlank()) onAction.accept(action);
            }
            return;
        }
        // This is a UI surface, not a real inventory. Ignore player-inventory manipulation too.
    }

    @Override
    public ItemStack quickMoveStack(Player player, int index) {
        return ItemStack.EMPTY;
    }

    @Override
    public boolean stillValid(Player player) {
        return true;
    }

    @Override
    public void removed(Player player) {
        super.removed(player);
        onClose.run();
    }
}
