package dev.mcgame.runtime;

import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Source;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

final class PortableDslSupport {
    private static final String RESOURCE = "/mcgame/portable-dsl.js";
    private static final String SOURCE = readSource();

    private PortableDslSupport() {}

    static void install(Context context) {
        context.eval(Source.newBuilder("js", SOURCE, "mcgame-portable-dsl.js").buildLiteral());
    }

    private static String readSource() {
        try (InputStream in = PortableDslSupport.class.getResourceAsStream(RESOURCE)) {
            if (in == null) throw new IllegalStateException("Bundled portable DSL is missing: " + RESOURCE);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Could not read bundled portable DSL", e);
        }
    }
}
