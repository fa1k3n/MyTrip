// User accounts: password hashes, password links and Google login (US-01..US-11). Web Crypto only, so it runs in the Worker and in Node.

/** An account (US-01). Only a hash of the password and of the password link's secret is kept (US-04, US-06). */
export type User = {
  id: string; name: string; email: string; superuser: boolean; disabled: boolean; ai: boolean; createdAt: string;
  passwordHash?: string; googleId?: string; lastLogin?: string; setup?: { hash: string; expires: string };
  consentAt?: string; // when the beta notice was accepted (US-26)
  invitedBy?: string; // the account that invited it from a trip (US-30)
  sessions?: number; // the session generation: a new password moves it, so older sessions stop working (US-35)
  resets?: string[]; // when password links were mailed for a forgotten password, the last day kept (US-35)
  totp?: { secret: string; used?: number }; // the superuser's second factor and the last time step it accepted (SP-13)
  totpPending?: string; // a secret shown for setup, until its first code is given (SP-13)
  recovery?: string[]; // hashes of the unused recovery codes (SP-13)
};
/** The Google OAuth client of the instance (US-10). */
export type Google = { clientId: string; clientSecret: string };
/** The Google client when both secrets are set; otherwise Google login is off (US-10). */
export const googleOf = (clientId?: string, clientSecret?: string): Google | undefined => (clientId && clientSecret ? { clientId, clientSecret } : undefined);

export const PASSWORD_MIN = 10, SETUP_DAYS = 7, ITERATIONS = 100_000; // 100 000 is the most the Worker's PBKDF2 allows (US-06)
/** US-35: a mailed link lasts an hour; an account gets one mail per 15 minutes and three a day, the instance 50 a day. */
export const RESET_MS = 3_600_000, RESET_GAP_MS = 15 * 60_000, RESET_ACCOUNT_MAX = 3, RESET_DAY_MAX = 50;
const enc = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const b64url = (b: Uint8Array) => b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const normEmail = (s: string) => s.trim().toLowerCase();
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}
/** A salted PBKDF2-SHA-256 hash as `pbkdf2-sha256$<iterations>$<salt>$<hash>` (US-06). */
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`;
}
export async function checkPassword(password: string, stored: string) {
  const [kind, n, salt, hash] = stored.split("$");
  if (kind !== "pbkdf2-sha256" || !n || !salt || !hash) return false;
  const got = await pbkdf2(password, unb64(salt), Number(n)), want = unb64(hash);
  let d = got.length ^ want.length;
  for (let i = 0; i < Math.min(got.length, want.length); i++) d |= got[i]! ^ want[i]!;
  return d === 0;
}
export const sha256 = async (s: string) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));

/** What the superuser's list shows of an account: never a hash or a second factor's secret (US-02, SP-13). */
export const publicUser = ({ passwordHash, googleId, setup: _s, totp: _t, totpPending: _p, recovery: _r, ...u }: User) => ({ ...u, password: !!passwordHash, google: !!googleId });

// SP-13: the superuser's second factor, a time-based one-time code (RFC 6238: HMAC-SHA1, 30 seconds, 6 digits) and recovery codes.
export const TOTP_STEP_MS = 30_000, RECOVERY_CODES = 10;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(b: Uint8Array) {
  let bits = 0, n = 0, out = "";
  for (const x of b) { n = (n << 8) | x; bits += 8; while (bits >= 5) { out += B32[(n >>> (bits - 5)) & 31]; bits -= 5; } }
  return bits ? out + B32[(n << (5 - bits)) & 31] : out;
}
function unbase32(s: string) {
  let bits = 0, n = 0;
  const out: number[] = [];
  for (const ch of s.toUpperCase().replace(/[\s=]/g, "")) {
    const v = B32.indexOf(ch);
    if (v < 0) return undefined;
    n = ((n << 5) | v) & 0xffff; bits += 5;
    if (bits >= 8) { out.push((n >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
/** A new secret for an authenticator app: 160 random bits in base32 (RFC 4226 recommends 160). */
export const newTotpSecret = () => base32(crypto.getRandomValues(new Uint8Array(20)));
/** The code of one time step. */
export async function totpCode(secret: string, step: number) {
  const raw = unbase32(secret);
  if (!raw) return "";
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(step / 2 ** 32)); msg.setUint32(4, step >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg.buffer)), o = h[19]! & 15;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}
/** The step a code matches, one step either side for a clock that drifts, and only after the last used step so a code works
 * once; undefined when it does not match. */
export async function checkTotp(secret: string, code: string, now: number, used = -1) {
  if (!/^\d{6}$/.test(code)) return undefined;
  const at = Math.floor(now / TOTP_STEP_MS);
  for (const s of [at - 1, at, at + 1]) if (s > used && same6(await totpCode(secret, s), code)) return s;
  return undefined;
}
const same6 = (a: string, b: string) => { let d = a.length ^ b.length; for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
/** The link an authenticator app reads from a QR code. */
export const otpauthUri = (secret: string, email: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?${new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" })}`;
/** Recovery codes as `xxxxx-xxxxx` (50 random bits each), and how a typed one is compared: lower case, no spaces or dash. */
export const newRecoveryCodes = () => Array.from({ length: RECOVERY_CODES }, () => {
  const s = base32(crypto.getRandomValues(new Uint8Array(7))).slice(0, 10).toLowerCase();
  return `${s.slice(0, 5)}-${s.slice(5)}`;
});
export const normRecovery = (s: string) => s.toLowerCase().replace(/[\s-]/g, "");

/** The first superuser, who owns what no one else does and whom the admin password acts as (US-13, US-18). */
export const firstSuper = (users: User[]) =>
  users.filter((u) => u.superuser && !u.disabled).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];

/** A user's roles in each trip they reach: owner (US-13), and the permission of a traveler tied to their address (US-21, US-22). */
export type Membership = { role: "admin" | "owner" | "traveler" | "planner"; roles: ("owner" | "traveler" | "planner")[]; travelerId?: string; owner?: string };
export function memberships(u: User, users: User[], trips: { id: string; travelers: { id: string }[] }[], owners: Record<string, string>,
  people: { tripId: string; travelerId: string; role: "traveler" | "planner"; account?: string }[]): Record<string, Membership> {
  const first = firstSuper(users)?.id, out: Record<string, Membership> = {};
  for (const t of trips) {
    const owner = owners[t.id] ?? first, own = owner === u.id;
    const tie = people.find((l) => l.tripId === t.id && l.account === u.email && t.travelers.some((x) => x.id === l.travelerId));
    if (!u.superuser && !own && !tie) continue;
    const roles: Membership["roles"] = [...(own ? ["owner" as const] : []), ...(tie ? [tie.role] : [])];
    const ownerName = !own && u.superuser ? users.find((x) => x.id === owner)?.name : undefined;
    out[t.id] = { role: u.superuser ? "admin" : own ? "owner" : tie!.role, roles, ...(tie ? { travelerId: tie.travelerId } : {}), ...(ownerName ? { owner: ownerName } : {}) };
  }
  return out;
}

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth", TOKEN = "https://oauth2.googleapis.com/token";
/** A PKCE pair (US-09). */
export async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier)))) };
}
export const googleAuthUrl = (g: Google, redirect: string, state: string, challenge: string) => `${AUTH}?${new URLSearchParams({
  client_id: g.clientId, redirect_uri: redirect, response_type: "code", scope: "openid email", state,
  code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
})}`;
/** Exchanges the code with Google itself; the ID token comes straight from Google over TLS, so its claims are checked, not its
 * signature (OpenID Connect Core 3.1.3.7). Undefined when the answer is not a valid token for this client (US-09). */
export async function googleIdentity(g: Google, code: string, verifier: string, redirect: string, f: typeof fetch = fetch, now = Date.now()) {
  const r = await f(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({
    code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: redirect, grant_type: "authorization_code", code_verifier: verifier,
  }).toString() }).catch(() => undefined);
  const token = r?.ok ? ((await r.json().catch(() => ({}))) as { id_token?: unknown }).id_token : undefined;
  if (typeof token !== "string") return undefined;
  let c: { iss?: unknown; aud?: unknown; exp?: unknown; sub?: unknown; email?: unknown; email_verified?: unknown };
  try { c = JSON.parse(new TextDecoder().decode(unb64(token.split(".")[1] ?? ""))); } catch { return undefined; }
  const ok = (c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com") && c.aud === g.clientId
    && typeof c.exp === "number" && c.exp * 1000 > now && typeof c.sub === "string" && typeof c.email === "string";
  return ok ? { sub: c.sub as string, email: normEmail(c.email as string), verified: c.email_verified === true } : undefined;
}
