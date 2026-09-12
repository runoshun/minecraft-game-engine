package dev.mcgame.runtime;

import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.HostAccess;
import org.graalvm.polyglot.PolyglotAccess;
import org.graalvm.polyglot.Source;
import org.graalvm.polyglot.Value;
import org.graalvm.polyglot.io.IOAccess;
import org.graalvm.polyglot.proxy.ProxyExecutable;
import org.graalvm.polyglot.proxy.ProxyObject;

import java.util.HashMap;
import java.util.Map;

final class PortableProgramExtractor {
    private PortableProgramExtractor() {}

    static PortableProgram extract(String sourceName, String javascript) {
        try (Context context = Context.newBuilder("js")
            .allowHostAccess(HostAccess.NONE)
            .allowHostClassLookup(name -> false)
            .allowIO(IOAccess.NONE)
            .allowCreateThread(false)
            .allowNativeAccess(false)
            .allowPolyglotAccess(PolyglotAccess.NONE)
            .option("engine.WarnInterpreterOnly", "false")
            .build()) {

            Capture capture = new Capture();
            Value bindings = context.getBindings("js");
            bindings.putMember("portable", portableProxy(capture));
            bindings.putMember("game", proxy(Map.of(
                "onStart", noop(),
                "onBeforeTick", noop(),
                "onTick", noop(),
                "log", noop()
            )));
            bindings.putMember("menu", proxy(Map.of(
                "onAction", noop(),
                "open", unavailable("menu.open"),
                "update", unavailable("menu.update"),
                "close", unavailable("menu.close")
            )));
            bindings.putMember("input", proxy(Map.of(
                "players", unavailable("input.players"),
                "get", unavailable("input.get"),
                "pressed", unavailable("input.pressed")
            )));
            bindings.putMember("actors", unavailableMethods("actors", "spawn", "move", "remove"));
            bindings.putMember("camera", unavailableMethods("camera", "attach", "move", "detach"));
            bindings.putMember("world", unavailableMethods("world", "setBlock", "setBlocks", "fill"));
            bindings.putMember("effects", unavailableMethods("effects", "particle", "sound"));
            bindings.putMember("render", unavailableMethods("render", "spawn", "update", "remove", "attach", "detach"));
            bindings.putMember("ui", unavailableMethods("ui", "panel"));

            PortableDslSupport.install(context);
            context.eval(Source.newBuilder("js", javascript, sourceName).buildLiteral());
            if (capture.program == null) throw new IllegalArgumentException(sourceName + " does not call portable.define(...)");
            return capture.program;
        }
    }

    private static ProxyObject portableProxy(Capture capture) {
        Map<String, Object> portable = new HashMap<>();
        portable.put("define", (ProxyExecutable) args -> {
            if (args.length < 1) throw new IllegalArgumentException("portable.define requires a program object");
            if (capture.program != null) throw new IllegalArgumentException("portable.define may only be called once");
            capture.program = PortableProgramParser.parse(args[0], "portable.define");
            return null;
        });
        portable.put("get", unavailable("portable.get"));
        portable.put("raw", unavailable("portable.raw"));
        portable.put("setInput", unavailable("portable.setInput"));
        portable.put("input", unavailable("portable.input"));
        return proxy(portable);
    }

    private static ProxyObject unavailableMethods(String object, String... names) {
        Map<String, Object> methods = new HashMap<>();
        for (String name : names) methods.put(name, unavailable(object + "." + name));
        return proxy(methods);
    }

    private static ProxyExecutable noop() {
        return args -> null;
    }

    private static ProxyExecutable unavailable(String api) {
        return args -> {
            throw new IllegalStateException(api + " is unavailable while extracting portable.define; portable IR must not depend on live host state");
        };
    }

    private static ProxyObject proxy(Map<String, ?> map) {
        return ProxyObject.fromMap(new HashMap<>(map));
    }

    private static final class Capture {
        PortableProgram program;
    }
}
