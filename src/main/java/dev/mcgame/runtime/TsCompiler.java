package dev.mcgame.runtime;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.HostAccess;
import org.graalvm.polyglot.PolyglotAccess;
import org.graalvm.polyglot.Source;
import org.graalvm.polyglot.Value;
import org.graalvm.polyglot.io.IOAccess;
import org.slf4j.Logger;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

final class TsCompiler implements AutoCloseable {
    private final Logger logger;
    private final Context context;
    private final Value transpile;

    TsCompiler(Logger logger) {
        this.logger = logger;
        this.context = sandboxedContext();
        String compilerSource = readBundledCompiler();
        try {
            context.eval(Source.newBuilder("js", compilerSource, "typescript-5.9.2.js").buildLiteral());
            this.transpile = context.eval("js", """
                (name, source) => {
                  const result = ts.transpileModule(source, {
                    fileName: name,
                    compilerOptions: {
                      target: ts.ScriptTarget.ES2022,
                      module: ts.ModuleKind.None,
                      strict: true,
                      removeComments: false
                    },
                    reportDiagnostics: true
                  });
                  return JSON.stringify({
                    code: result.outputText,
                    diagnostics: (result.diagnostics || []).map(d =>
                      ts.flattenDiagnosticMessageText(d.messageText, "\\n"))
                  });
                }
                """);
            logger.info("Embedded TypeScript 5.9.2 compiler ready");
        } catch (RuntimeException e) {
            context.close(true);
            throw e;
        }
    }

    String transpile(String name, String source) {
        Value raw = transpile.execute(name, source);
        JsonObject result = JsonParser.parseString(raw.asString()).getAsJsonObject();
        JsonArray diagnostics = result.getAsJsonArray("diagnostics");
        if (diagnostics != null && !diagnostics.isEmpty()) {
            StringBuilder message = new StringBuilder("TypeScript diagnostics for ").append(name).append(':');
            diagnostics.forEach(d -> message.append("\n - ").append(d.getAsString()));
            throw new IllegalArgumentException(message.toString());
        }
        return result.get("code").getAsString();
    }

    private static Context sandboxedContext() {
        return Context.newBuilder("js")
            .allowHostAccess(HostAccess.NONE)
            .allowHostClassLookup(name -> false)
            .allowIO(IOAccess.NONE)
            .allowCreateThread(false)
            .allowNativeAccess(false)
            .allowPolyglotAccess(PolyglotAccess.NONE)
            .option("engine.WarnInterpreterOnly", "false")
            .build();
    }

    private static String readBundledCompiler() {
        try (InputStream in = TsCompiler.class.getResourceAsStream("/mcgame/typescript.js")) {
            if (in == null) throw new IllegalStateException("Bundled typescript.js is missing");
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Could not read bundled typescript.js", e);
        }
    }

    @Override
    public void close() {
        context.close(true);
    }
}
