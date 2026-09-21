import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: { entry: "electron/main.ts" },
      preload: { input: "electron/preload.ts" },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    watch: {
      ignored: ["**/release/**"],
    },
  },
});
