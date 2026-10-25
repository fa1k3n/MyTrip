// Whether this phone can get notices for a trip, and why not (NT-03). Pure, so it runs under node --test.

export type NoticeState = "on" | "off" | "install" | "unsupported" | "denied" | "serverOff";
/** push: the browser has Web Push; iphone and installed: an iPhone gets it only in the app on the home screen (PW-01);
 * key: the server has a VAPID key (NT-05); on: notices were turned on here. */
export function noticeState(x: { push: boolean; iphone: boolean; installed: boolean; permission: NotificationPermission; key: boolean; on: boolean }): NoticeState {
  if (!x.push) return x.iphone && !x.installed ? "install" : "unsupported";
  if (!x.key) return "serverOff";
  if (x.permission === "denied") return "denied";
  return x.on && x.permission === "granted" ? "on" : "off";
}

/** The server's public key as bytes, for subscribing (applicationServerKey). */
export const keyBytes = (b64url: string) =>
  Uint8Array.from(atob(b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4)), (c) => c.charCodeAt(0));
/** Notices turned on for a trip on this phone. */
export const noticesKey = (tripId: string) => `mytrip.notices.${tripId}`;
