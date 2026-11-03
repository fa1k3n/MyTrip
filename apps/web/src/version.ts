// The app's version, from the web app's package.json at build time; "dev" when not built, as under node --test (US-38).
declare const __APP_VERSION__: string | undefined;
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
