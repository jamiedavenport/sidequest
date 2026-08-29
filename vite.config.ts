import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsrxReact from "@tsrx/vite-plugin-react";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    include: [
      "@tanstack/hotkeys",
      "@tanstack/react-hotkeys",
      "use-sync-external-store/shim/with-selector",
    ],
  },
  server: {
    port: 3000,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tsrxReact(),
    tanstackStart({ srcDirectory: "src" }),
    viteReact(),
    tailwindcss(),
  ],
});
