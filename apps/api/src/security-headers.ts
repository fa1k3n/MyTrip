// SP-12: the security headers of every API answer; the static pages get the same from apps/web/public/_headers.
import type { MiddlewareHandler } from "hono";

/** The third parties of SP-07 the browser itself reaches: the map embed, weather and places, currency rates. */
const MAP = ["https://maps.google.com", "https://www.google.com"]; // PL-07, TR-*: the embedded map, which may redirect to www
const DATA = ["https://api.open-meteo.com", "https://geocoding-api.open-meteo.com", "https://api.frankfurter.dev"];

/** The Content-Security-Policy; the pages add the hashes of the film pages' inline scripts to script-src. */
export const csp = (scriptHashes: string[] = []) => [
  "default-src 'self'",
  ["script-src 'self'", ...scriptHashes].join(" "),
  "style-src 'self' 'unsafe-inline'", // the film pages' own styles and React style props; no scripts
  "img-src 'self' data: blob:", // wish pictures and tickets come through the API as data: and blob: (DB-07, BK-10)
  `connect-src 'self' ${DATA.join(" ")}`,
  `frame-src ${MAP.join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS = {
  "Content-Security-Policy": csp(),
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
} as const;

/** Sets the headers on every answer, also on errors and on answers from routes registered before other middleware. */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(k, v);
};
