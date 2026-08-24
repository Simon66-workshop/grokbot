import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `0.0.0.0:8080` is the live-preview / desk-qa contract.
// The previous TanStack Start + Nitro + PGLite + auth-popup stack
// imported modules that are not in this tree (db, PWA plugin, routeTree).
// Web preview only needs to boot pet-shell, same as mac/companion.ts.
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), viteReact()],
});
