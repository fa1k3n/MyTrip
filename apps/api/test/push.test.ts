import { test } from "node:test";
import assert from "node:assert/strict";
import { b64url, fromB64url, pushRequest, vapidPublicKey } from "../src/push.ts";

const enc = new TextEncoder();
const hkdf = async (salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) =>
  new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bytes * 8));

/** The phone's side of RFC 8291: decrypt what the push service hands over. */
async function decrypt(body: Uint8Array<ArrayBuffer>, ua: CryptoKeyPair, uaPublic: Uint8Array<ArrayBuffer>, auth: Uint8Array<ArrayBuffer>) {
  const salt = body.slice(0, 16), idlen = body[20], asPublic = body.slice(21, 21 + idlen), data = body.slice(21 + idlen);
  const as = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: as }, ua.privateKey, 256));
  const ikm = await hkdf(auth, shared, new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublic, ...asPublic]), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16), nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, data));
  assert.equal(plain.at(-1), 2, "the last record ends with the delimiter 2");
  return new TextDecoder().decode(plain.slice(0, -1));
}

// REQ: NT-05 a notice is encrypted for the phone and signed with the server's VAPID key
test("NT-05 pushRequest", async () => {
  const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = JSON.stringify(await crypto.subtle.exportKey("jwk", vapid.privateKey));
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
  const sub = { endpoint: "https://web.push.apple.com/QWxhZGRpbg", keys: { p256dh: b64url(uaPublic), auth: b64url(auth) } };
  const r = await pushRequest(sub, JSON.stringify({ title: "Berlin", body: "Bo lade till en utgift" }), jwk, "https://mytrip.example.workers.dev");
  assert.equal(r.url, sub.endpoint);
  assert.equal(r.headers["Content-Encoding"], "aes128gcm");
  assert.ok(Number(r.headers.TTL) > 0);
  assert.equal(await decrypt(r.body, ua, uaPublic, auth), JSON.stringify({ title: "Berlin", body: "Bo lade till en utgift" }));
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(r.headers.Authorization)!;
  assert.equal(m[2], await vapidPublicKey(jwk), "k is the public key the browser subscribed with");
  const [h, c, s] = m[1].split(".");
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(c)));
  assert.deepEqual([JSON.parse(new TextDecoder().decode(fromB64url(h))).alg, claims.aud, claims.sub], ["ES256", "https://web.push.apple.com", "https://mytrip.example.workers.dev"]);
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, vapid.publicKey, fromB64url(s), enc.encode(`${h}.${c}`));
  assert.ok(ok, "the signature is valid");
});
