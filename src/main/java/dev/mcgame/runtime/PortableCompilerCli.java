package dev.mcgame.runtime;

import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

public final class PortableCompilerCli {
    private PortableCompilerCli() {}

    public static void main(String[] args) throws Exception {
        Arguments parsed = Arguments.parse(args);
        Path source = parsed.source.toAbsolutePath().normalize();
        Path output = parsed.output.toAbsolutePath().normalize();
        byte[] bytes = Files.readAllBytes(source);
        if (bytes.length > 1_000_000) throw new IllegalArgumentException("portable source exceeds 1 MB PoC limit");
        String ts = new String(bytes, StandardCharsets.UTF_8);

        cleanGeneratedOutput(output);
        String js;
        try (TsCompiler compiler = new TsCompiler(LoggerFactory.getLogger("mcgame-portable-compiler"))) {
            js = compiler.transpile(source.toString(), ts);
        }
        PortableProgram program = PortableProgramExtractor.extract(source.toString(), js);
        PortableDatapackCompiler.Result result = new PortableDatapackCompiler().compile(program, parsed.namespace, output);
        System.out.println("Compiled portable program");
        System.out.println("  namespace: " + result.namespace());
        System.out.println("  objective: " + result.objective());
        System.out.println("  states: " + result.stateCount());
        System.out.println("  inputs: " + result.inputCount());
        System.out.println("  projections: " + result.projectionCount());
        System.out.println("  texts: " + result.textCount());
        System.out.println("  cameras: " + result.cameraCount());
        System.out.println("  particles: " + result.particleCount());
        System.out.println("  sounds: " + result.soundCount());
        System.out.println("  huds: " + result.hudCount());
        System.out.println("  branch functions: " + result.branchFunctionCount());
        System.out.println("  output: " + output);
    }

    private static void cleanGeneratedOutput(Path output) throws IOException {
        if (!Files.exists(output)) return;
        boolean empty;
        try (var list = Files.list(output)) { empty = list.findAny().isEmpty(); }
        if (empty) return;
        if (!Files.exists(output.resolve(".mcgame-portable-generated"))) {
            throw new IllegalArgumentException("refusing to overwrite non-generated directory: " + output);
        }
        try (var walk = Files.walk(output)) {
            for (Path path : walk.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
        }
    }

    private record Arguments(Path source, String namespace, Path output) {
        static Arguments parse(String[] args) {
            Path source = null;
            String namespace = null;
            Path output = null;
            for (int i = 0; i < args.length; i++) {
                switch (args[i]) {
                    case "--source" -> source = Path.of(requireValue(args, ++i, "--source"));
                    case "--namespace" -> namespace = requireValue(args, ++i, "--namespace");
                    case "--output" -> output = Path.of(requireValue(args, ++i, "--output"));
                    default -> throw new IllegalArgumentException("unknown argument: " + args[i]);
                }
            }
            if (source == null || namespace == null || output == null) {
                throw new IllegalArgumentException("usage: --source <main.ts> --namespace <namespace> --output <directory>");
            }
            return new Arguments(source, namespace, output);
        }

        private static String requireValue(String[] args, int index, String option) {
            if (index >= args.length) throw new IllegalArgumentException(option + " requires a value");
            return args[index];
        }
    }
}
