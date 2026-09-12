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

    private int resolve(PortableProgram.ValueRef value) {
        return switch (value) {
            case PortableProgram.StateValue stateValue -> raw(stateValue.name());
            case PortableProgram.InputValue inputValue -> rawInput(inputValue.name());
            case PortableProgram.ConstantValue constantValue -> constantValue.raw();
        };
    }
}
