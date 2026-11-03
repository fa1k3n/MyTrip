import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { swFiles, swSource } from "./sw-build.ts";

const version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;

/** Writes the service worker with the list of this build's files (PW-03, PW-11). */
const serviceWorker = (): Plugin => ({
  name: "trip-sw", apply: "build",
  generateBundle(_, bundle) { this.emitFile({ type: "asset", fileName: "sw.js", source: swSource(swFiles(Object.keys(bundle))) }); },
});

export default defineConfig({ define: { __APP_VERSION__: JSON.stringify(version) }, // US-38
  plugins: [react(), tailwindcss(), serviceWorker()], server: { proxy: { "/api": process.env.TRIP_API_URL ?? "http://localhost:8787" } } });
