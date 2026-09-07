import { cp, rm } from "node:fs/promises";
import { Effect, Schema } from "effect";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsrxReact from "@tsrx/vite-plugin-react";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

class WhiteboardAssetError extends Schema.TaggedError<WhiteboardAssetError>()(
  "WhiteboardAssetError",
  {
    cause: Schema.Defect(),
  },
) {}

const copyWhiteboardFonts = Effect.fn("copyWhiteboardFonts")(function* () {
  const destination = new URL("./public/excalidraw/fonts", import.meta.url);
  yield* Effect.tryPromise({
    try: () => rm(destination, { recursive: true, force: true }),
    catch: (cause) => new WhiteboardAssetError({ cause }),
  });
  yield* Effect.tryPromise({
    try: () =>
      cp(
        new URL("./node_modules/@excalidraw/excalidraw/dist/prod/fonts", import.meta.url),
        destination,
        { recursive: true },
      ),
    catch: (cause) => new WhiteboardAssetError({ cause }),
  });
});

export default defineConfig(({ mode }) => {
  const isE2E = mode === "e2e";

  return {
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      include: [
        "@tanstack/hotkeys",
        "@tanstack/react-hotkeys",
        "@tanstack/db",
        "@tanstack/react-db",
        "use-sync-external-store/shim/with-selector",
      ],
      exclude: ["@tanstack/browser-db-sqlite-persistence"],
    },
    server: {
      port: 3000,
    },
    plugins: [
      {
        name: "sidequest-whiteboard-fonts",
        configResolved: () => Effect.runPromise(copyWhiteboardFonts()),
      },
      cloudflare({
        configPath: isE2E ? "e2e/wrangler.jsonc" : undefined,
        persistState: isE2E ? { path: process.env.E2E_PERSISTENCE_PATH ?? ".wrangler/e2e" } : true,
        viteEnvironment: { name: "ssr" },
      }),
      tsrxReact(),
      tanstackStart({ srcDirectory: "src" }),
      viteReact(),
      tailwindcss(),
    ],
  };
});
