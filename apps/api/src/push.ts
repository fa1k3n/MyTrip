// Web Push without libraries: the payload encrypted for the phone (RFC 8291, aes128gcm of RFC 8188) and the request signed with
// the server's VAPID key (RFC 8292). WebCrypto only, so it runs in the Worker and in Node (NT-05).

export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
type Bytes = Uint8Array<ArrayBuffer>;

export const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromB64url = (s: string): Bytes => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const enc = new TextEncoder();
const cat = (...parts: Bytes[]): Bytes => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** The public half of the VAPID key, as the browser needs it to subscribe (applicationServerKey). */
export async function vapidPublicKey(privateJwk: string) {
  const { x, y } = JSON.parse(privateJwk) as JsonWebKey;
  return b64url(cat(new Uint8Array([4]), fromB64url(x!), fromB64url(y!)));
}

/** A JWT for the push service's origin, valid for twelve hours, signed with ES256. */
async function vapidJwt(endpoint: string, privateJwk: string, subject: string) {
  const key = await crypto.subtle.importKey("jwk", JSON.parse(privateJwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const part = (o: object) => b64url(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)));
  return `${unsigned}.${b64url(sig)}`;
}

/** The payload encrypted in one aes128gcm record for the subscription's keys. */
async function encrypt(sub: Subscription, payload: string) {
  const uaPublic = fromB64url(sub.keys.p256dh), auth = fromB64url(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const ua = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ua }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, data);
}

/** The request to the push service; `subject` is the app's address, which push services may use to reach its owner. */
export async function pushRequest(sub: Subscription, payload: string, privateJwk: string, subject: string) {
  return {
    url: sub.endpoint,
    headers: {
      Authorization: `vapid t=${await vapidJwt(sub.endpoint, privateJwk, subject)}, k=${await vapidPublicKey(privateJwk)}`,
      "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal",
    },
    body: await encrypt(sub, payload),
  };
}
