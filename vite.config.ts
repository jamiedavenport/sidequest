import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsrxReact from "@tsrx/vite-plugin-react";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
