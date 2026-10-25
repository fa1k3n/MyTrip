import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { swFiles, swSource } from "./sw-build.ts";

/** Writes the service worker with the list of this build's files (PW-03, PW-11). */
const serviceWorker = (): Plugin => ({
  name: "trip-sw", apply: "build",
  generateBundle(_, bundle) { this.emitFile({ type: "asset", fileName: "sw.js", source: swSource(swFiles(Object.keys(bundle))) }); },
});

export default defineConfig({ plugins: [react(), tailwindcss(), serviceWorker()], server: { proxy: { "/api": process.env.TRIP_API_URL ?? "http://localhost:8787" } } });
