import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({ plugins: [react(), tailwindcss()], server: { proxy: { "/api": process.env.TRIP_API_URL ?? "http://localhost:8787" } } });
