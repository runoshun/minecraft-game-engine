package dev.mcgame.runtime;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class PortableStateMachine {
    private final PortableProgram program;
    private final Map<String, Integer> state = new LinkedHashMap<>();
    private final Map<String, Integer> inputs = new LinkedHashMap<>();

    PortableStateMachine(PortableProgram program) {
        this.program = program;
        reset();
    }

    void reset() {
        state.clear();
        state.putAll(program.initialState());
        inputs.clear();
        inputs.putAll(program.initialInputs());
    }

    void tick() {
        execute(program.tickActions());
    }

    double get(String name) {
        return program.logicalValue(raw(name));
    }

    int raw(String name) {
        Integer value = state.get(name);
        if (value == null) throw new IllegalArgumentException("unknown portable state: " + name);
        return value;
    }

    void setInput(String name, double logicalValue) {
        if (!inputs.containsKey(name)) throw new IllegalArgumentException("unknown portable input: " + name);
        inputs.put(name, program.scale(logicalValue));
    }

    double input(String name) {
        return program.logicalValue(rawInput(name));
    }

    int rawInput(String name) {
        Integer value = inputs.get(name);
        if (value == null) throw new IllegalArgumentException("unknown portable input: " + name);
        return value;
    }

    private void execute(List<PortableProgram.Action> actions) {
        for (PortableProgram.Action action : actions) {
            switch (action) {
                case PortableProgram.SetAction set -> state.put(set.target(), resolve(set.value()));
                case PortableProgram.AddAction add -> state.put(add.target(), Math.addExact(raw(add.target()), resolve(add.value())));
                case PortableProgram.SubAction sub -> state.put(sub.target(), Math.subtractExact(raw(sub.target()), resolve(sub.value())));
                case PortableProgram.NegateAction negate -> state.put(negate.target(), Math.negateExact(raw(negate.target())));
                case PortableProgram.IfAction branch -> execute(test(branch.condition()) ? branch.thenActions() : branch.elseActions());
                case PortableProgram.AabbIfAction branch -> execute(overlaps(branch.a(), branch.b()) ? branch.thenActions() : branch.elseActions());
                case PortableProgram.CircleIfAction branch -> execute(overlaps(branch.a(), branch.b()) ? branch.thenActions() : branch.elseActions());
                case PortableProgram.CircleCapsuleIfAction branch -> execute(overlaps(branch.circle(), branch.capsule()) ? branch.thenActions() : branch.elseActions());
                case PortableProgram.TriggerIfAction branch -> execute(inside(branch.trigger(), branch.point()) ? branch.thenActions() : branch.elseActions());
            }
        }
    }

    private boolean test(PortableProgram.Condition condition) {
        int left = resolve(condition.left());
        int right = resolve(condition.right());
        return switch (condition.comparison()) {
            case EQ -> left == right;
            case NE -> left != right;
            case LT -> left < right;
            case LTE -> left <= right;
            case GT -> left > right;
            case GTE -> left >= right;
        };
    }

    private boolean overlaps(PortableProgram.Aabb2d a, PortableProgram.Aabb2d b) {
        long ax = resolve(a.x());
        long ay = resolve(a.y());
        long bx = resolve(b.x());
        long by = resolve(b.y());
        return ax - a.halfWidthRaw() <= bx + b.halfWidthRaw()
            && ax + a.halfWidthRaw() >= bx - b.halfWidthRaw()
            && ay - a.halfHeightRaw() <= by + b.halfHeightRaw()
            && ay + a.halfHeightRaw() >= by - b.halfHeightRaw();
    }

    private boolean overlaps(PortableProgram.Circle2d a, PortableProgram.Circle2d b) {
        long divisor = program.collisionDivisor();
        long dx = (resolve(a.x()) - (long) resolve(b.x())) / divisor;
        long dy = (resolve(a.y()) - (long) resolve(b.y())) / divisor;
        long radius = (a.radiusRaw() + (long) b.radiusRaw()) / divisor;
        return dx * dx + dy * dy <= radius * radius;
    }

    private boolean overlaps(PortableProgram.Circle2d circle, PortableProgram.Capsule2d capsule) {
        long divisor = program.collisionDivisor();
        long px = resolve(circle.x()) / divisor;
        long py = resolve(circle.y()) / divisor;
        long ax = capsule.axRaw() / divisor;
        long ay = capsule.ayRaw() / divisor;
        long bx = capsule.bxRaw() / divisor;
        long by = capsule.byRaw() / divisor;
        long radius = (circle.radiusRaw() + (long) capsule.radiusRaw()) / divisor;
        if (px < Math.min(ax, bx) - radius || px > Math.max(ax, bx) + radius
            || py < Math.min(ay, by) - radius || py > Math.max(ay, by) + radius) {
            return false;
        }
        long vx = bx - ax;
        long vy = by - ay;
        long wx = px - ax;
        long wy = py - ay;
        long len2 = vx * vx + vy * vy;
        long dot = wx * vx + wy * vy;
        if (dot <= 0) return wx * wx + wy * wy <= radius * radius;
        if (dot >= len2) {
            long dx = px - bx;
            long dy = py - by;
            return dx * dx + dy * dy <= radius * radius;
        }
        long cross = wx * vy - wy * vx;
        return cross * cross <= radius * radius * len2;
    }

    private boolean inside(PortableProgram.Aabb2d trigger, PortableProgram.Point2d point) {
        long x = resolve(point.x());
        long y = resolve(point.y());
        long cx = resolve(trigger.x());
        long cy = resolve(trigger.y());
        return x >= cx - trigger.halfWidthRaw()
            && x <= cx + trigger.halfWidthRaw()
            && y >= cy - trigger.halfHeightRaw()
            && y <= cy + trigger.halfHeightRaw();
    }

    private int resolve(PortableProgram.ValueRef value) {
        return switch (value) {
            case PortableProgram.StateValue stateValue -> raw(stateValue.name());
            case PortableProgram.InputValue inputValue -> rawInput(inputValue.name());
            case PortableProgram.ConstantValue constantValue -> constantValue.raw();
        };
    }
}
