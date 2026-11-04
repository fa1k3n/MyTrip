// The app's version, from the web app's package.json at build time; "dev" when not built, as under node --test (US-38).
import { sv } from "./sv.ts";
declare const __APP_VERSION__: string | undefined;
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
declare const __APP_BUILD__: string | undefined;
/** The deploy's build id, the platform's commit; empty when not built by the deploy (US-42). */
export const APP_BUILD = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "";
/** The version with the build id as semver build metadata, "0.2.0+1bca182a" (US-42). */
export const fullVersion = (version: string, build: string) => (build ? `${version}+${build}` : version);
export const APP_FULL_VERSION = fullVersion(APP_VERSION, APP_BUILD);

/** US-41: the changelog with all that is new, in the public repository. */
export const CHANGELOG_URL = "https://github.com/fa1k3n/MyTrip/blob/main/CHANGELOG.md";
/** US-43: the page "Nytt i Basläger" with the news of every version, opened from the dialog's link in a new tab. */
export const NEWS_PAGE = "/#nytt";
/** The device's last version whose news was shown (US-41). */
export const NEWS_KEY = "mytrip.newsSeen";
/** Whether version a comes after version b, number by number. */
export function laterVersion(a: string, b: string) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}
/** US-43: the versions with news, newest first. */
export function newsVersions(news: Record<string, readonly string[]>) {
  return Object.keys(news).filter((v) => news[v]!.length).sort((a, b) => (laterVersion(a, b) ? -1 : laterVersion(b, a) ? 1 : 0));
}
/** US-41: the version whose news to show: on a device that used the app before, once, when news is written for it. */
export function whatsNewFor(version: string, seen: string | null, usedBefore: boolean, news: Record<string, readonly string[]> = sv.whatsNew.news) {
  if (version === "dev" || !news[version] || !usedBefore) return undefined;
  return !seen || laterVersion(version, seen) ? version : undefined;
}
/** Whether this device has used the app: anything of Basläger kept in its storage besides the news (US-41). */
export function usedBefore() {
  try { return Object.keys(localStorage).some((k) => k.startsWith("mytrip.") && k !== NEWS_KEY); } catch { return false; }
}
