// Login, logout, the password link, a forgotten password, Google login and the superuser's second step (AU-04, AU-05, US-04, US-05,
// US-07..10, US-35, SP-13).
import { Hono, type Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { sv } from "../../../web/src/sv.ts";
import { checkPassword, checkTotp, firstSuper, googleAuthUrl, googleIdentity, hashPassword, newRecoveryCodes, newTotpSecret, normEmail, normRecovery, otpauthUri, PASSWORD_MIN, pkce, RESET_ACCOUNT_MAX, RESET_DAY_MAX, RESET_GAP_MS, RESET_MS, sha256, validEmail, type Google, type User } from "../users.ts";
import { escapeHtml, type Mailer } from "../mailer.ts";
import { type Env, FAIL_WINDOW_MS, MAX_FAILS, SESSION_DAYS, newSecret, same } from "./shared.ts";
import type { Ctx } from "./ctx.ts";

export function authRoutes(app: Hono<Env>, k: Ctx) {
  const { store, opts, adminPassword, sessionKey, google, clock, later } = k;
  // Failures are counted in the store, so every server instance sees them (AU-05, US-08, SP-11).
  const ipOf = (c: Context<Env>) => c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "local";
  const blocked = async (key: string) => (await store.failCount(key, clock().getTime() - FAIL_WINDOW_MS)) >= MAX_FAILS;
  const failed = (key: string) => store.addFail(key, clock().getTime());
  /** The session cookie: `admin.<exp>` for the admin password, `user.<id>.<exp>.<generation>` for an account (AU-04, US-11, US-35);
   * `.2` at the end when it was made with the second step (SP-13). */
  const startSession = async (c: Context<Env>, who: string | User, strict = true, second = false) => {
    const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
    const value = (typeof who === "string" ? `${who}.${exp}` : `user.${who.id}.${exp}.${who.sessions ?? 0}`) + (second ? ".2" : "");
    await setSignedCookie(c, "session", value, sessionKey!, { httpOnly: true, secure: true, sameSite: strict ? "Strict" : "Lax", path: "/api", maxAge: SESSION_DAYS * 86400 });
  };
  const loggedIn = (u: User) => store.saveUser({ ...u, lastLogin: clock().toISOString() });

  // SP-13: a superuser's first factor (password, Google or a password link) gives no session, only a cookie for five minutes that the
  // code step reads. Failed codes count as failed logins (AU-05, SP-11), and the count is cleared only when the code is right.
  const twoStep = !!opts.auth?.secondFactor, SECOND_MS = 5 * 60_000, ISSUER = "Basläger";
  const startSecond = async (c: Context<Env>, who: "admin" | User) => {
    const exp = clock().getTime() + SECOND_MS;
    await setSignedCookie(c, "mfa", who === "admin" ? `admin.${exp}` : `user.${who.id}.${exp}`, sessionKey!, { httpOnly: true, secure: true, sameSite: "Strict", path: "/api/login", maxAge: SECOND_MS / 1000 });
    return who === "admin" || who.totp ? "code" : "enroll";
  };
  /** Who is in the middle of the second step; the admin password acts as the first superuser (US-18). */
  const pending = async (c: Context<Env>) => {
    const [kind, a, b] = ((sessionKey && await getSignedCookie(c, sessionKey, "mfa")) || "").split(".");
    if (!(Number(kind === "admin" ? a : b) > clock().getTime())) return undefined;
    const users = await store.users(), u = kind === "admin" ? firstSuper(users) : kind === "user" ? users.find((x) => x.id === a) : undefined;
    return u && u.superuser && !u.disabled ? { u, admin: kind === "admin" } : undefined;
  };

  // AU-04, AU-05: admin login with a password; US-07, US-08: an account logs in with its address and password.
  app.post("/api/login", async (c) => {
    const b = await c.req.json<{ email?: unknown; password?: unknown }>().catch(() => ({} as { email?: unknown; password?: unknown }));
    const ip = ipOf(c);
    if (typeof b.email === "string" && b.email.trim()) {
      if (!sessionKey) return c.json({ error: "login is off" }, 404);
      const email = normEmail(b.email), acct = `account:${email}`;
      if (await blocked(ip) || await blocked(acct)) return c.json({ error: "too many attempts" }, 429);
      const u = (await store.users()).find((x) => x.email === email && !x.disabled);
      const ok = !!u?.passwordHash && typeof b.password === "string" && await checkPassword(b.password, u.passwordHash);
      if (!ok) { await failed(ip); await failed(acct); return c.json({ error: "wrong address or password" }, 401); } // the same answer either way (US-07)
      if (twoStep && u!.superuser) return c.json({ second: await startSecond(c, u!) }); // SP-13
      await store.clearFails(ip); await store.clearFails(acct);
      await loggedIn(u!);
      await startSession(c, u!);
      return c.body(null, 204);
    }
    if (!adminPassword || !sessionKey) return c.json({ error: "login is off" }, 404);
    if (await blocked(ip)) return c.json({ error: "too many attempts" }, 429);
    if (typeof b.password !== "string" || !same(b.password, adminPassword)) {
      await failed(ip);
      return c.json({ error: "wrong password" }, 401);
    }
    const first = twoStep ? firstSuper(await store.users()) : undefined; // SP-13: alone only while there is no superuser account
    if (first && !first.totp) return c.json({ error: "log in with the account first" }, 403);
    if (first) return c.json({ second: await startSecond(c, "admin") });
    await store.clearFails(ip);
    await startSession(c, "admin");
    return c.body(null, 204);
  });

  // SP-13: the second step: a one-time code from the authenticator app, or a recovery code, once each.
  app.post("/api/login/code", async (c) => {
    const p = await pending(c);
    if (!p) return c.json({ error: "log in again" }, 401);
    const ip = ipOf(c), acct = `account:${p.u.email}`, u = p.u, now = clock().getTime();
    if (await blocked(ip) || await blocked(acct)) return c.json({ error: "too many attempts" }, 429);
    const b = await c.req.json<{ code?: unknown }>().catch(() => ({} as { code?: unknown }));
    const code = typeof b.code === "string" ? b.code.replace(/\s/g, "") : "";
    let next: User | undefined, answer: { left: number } | { recovery: string[] } | undefined;
    if (u.totp) {
      const at = await checkTotp(u.totp.secret, code, now, u.totp.used);
      const hash = await sha256(normRecovery(code)), left = (u.recovery ?? []).filter((x) => !same(x, hash));
      if (at !== undefined) next = { ...u, totp: { ...u.totp, used: at } };
      else if (code && left.length < (u.recovery ?? []).length) { next = { ...u, recovery: left }; answer = { left: left.length }; }
    } else if (u.totpPending && !p.admin) { // the first code turns it on and gives the recovery codes
      const at = await checkTotp(u.totpPending, code, now);
      if (at !== undefined) {
        const { totpPending: secret, ...rest } = u, codes = newRecoveryCodes();
        next = { ...rest, totp: { secret, used: at }, recovery: await Promise.all(codes.map((x) => sha256(normRecovery(x)))) };
        answer = { recovery: codes };
      }
    }
    if (!next) { await failed(ip); await failed(acct); return c.json({ error: "wrong code" }, 401); }
    await store.clearFails(ip); await store.clearFails(acct);
    await store.saveUser(p.admin ? next : { ...next, lastLogin: clock().toISOString() });
    deleteCookie(c, "mfa", { path: "/api/login", secure: true });
    await startSession(c, p.admin ? "admin" : next, true, true);
    return answer ? c.json(answer) : c.body(null, 204);
  });
  // SP-13: a superuser without a second factor sets one up: a new secret to scan, on once its first code is given.
  app.post("/api/login/enroll", async (c) => {
    const p = await pending(c);
    if (!p || p.admin) return c.json({ error: "log in again" }, 401);
    if (p.u.totp) return c.json({ error: "already on" }, 409);
    const secret = newTotpSecret();
    await store.saveUser({ ...p.u, totpPending: secret });
    return c.json({ secret, uri: otpauthUri(secret, p.u.email, ISSUER) });
  });
  app.post("/api/logout", (c) => { deleteCookie(c, "session", { path: "/api", secure: true }); return c.body(null, 204); });

  // US-04, US-05: the password link shows whose account it is, and sets the password once.
  const setupUser = async (c: Context<Env>) => {
    const b = await c.req.json<{ user?: unknown; secret?: unknown; password?: unknown; consent?: unknown }>().catch(() => ({} as { user?: unknown; secret?: unknown; password?: unknown; consent?: unknown }));
    const u = (await store.users()).find((x) => x.id === b.user);
    const valid = !!u?.setup && !u.disabled && typeof b.secret === "string" && same(await sha256(b.secret), u.setup.hash) && Date.parse(u.setup.expires) > clock().getTime();
    return { u: valid ? u : undefined, password: b.password, consent: b.consent === true };
  };
  app.post("/api/setup/info", async (c) => {
    const { u } = await setupUser(c);
    return u ? c.json({ name: u.name, email: u.email }) : c.json({ error: "gone" }, 410);
  });
  app.post("/api/setup", async (c) => {
    if (!sessionKey) return c.json({ error: "login is off" }, 404);
    const { u, password, consent } = await setupUser(c);
    if (!u) return c.json({ error: "gone" }, 410);
    if (typeof password !== "string" || [...password].length < PASSWORD_MIN) return c.json({ error: "too short" }, 400);
    const { setup: _used, ...rest } = u;
    const next: User = { ...rest, passwordHash: await hashPassword(password), lastLogin: clock().toISOString(), sessions: (u.sessions ?? 0) + 1, // US-35: the others are out
      ...(consent ? { consentAt: clock().toISOString() } : {}) }; // US-26
    await store.saveUser(next);
    if (twoStep && next.superuser) return c.json({ second: await startSecond(c, next) }); // SP-13: a new password is no way around it
    await startSession(c, next);
    return c.body(null, 204);
  });

  // US-35: a forgotten password: a mail with a password link for one hour. The answer is the same whatever the address, and the
  // work is done after it, so neither the answer nor its time tells whether there is an account.
  const resetting = new Set<string>(), DAY_MS = 86_400_000;
  async function sendReset(email: string, mail: Mailer & { appUrl: string }) {
    if (resetting.has(email)) return; // one at a time per address
    resetting.add(email);
    try {
      const now = clock().getTime(), users = await store.users(), u = users.find((x) => x.email === email && !x.disabled);
      const recent = (x: User) => (x.resets ?? []).filter((at) => now - Date.parse(at) < DAY_MS);
      if (!u || users.reduce((n, x) => n + recent(x).length, 0) >= RESET_DAY_MAX) return;
      const mine = recent(u);
      if (mine.length >= RESET_ACCOUNT_MAX || mine.some((at) => now - Date.parse(at) < RESET_GAP_MS)) return;
      const secret = newSecret(), url = `${mail.appUrl.replace(/\/+$/, "")}/#u=${u.id}.${secret}`;
      await store.saveUser({ ...u, setup: { hash: await sha256(secret), expires: new Date(now + RESET_MS).toISOString() }, resets: [...mine, new Date(now).toISOString()] });
      await mail.send({ to: u.email, name: u.name, subject: sv.resetMail.subject, text: sv.resetMail.text(u.name, url), html: sv.resetMail.html(escapeHtml(u.name), url) });
    } finally { resetting.delete(email); }
  }
  app.post("/api/reset", async (c) => {
    if (!opts.mail || !sessionKey) return c.json({ error: "off" }, 404);
    const b = await c.req.json<{ email?: unknown }>().catch(() => ({} as { email?: unknown }));
    const email = typeof b.email === "string" ? normEmail(b.email) : "";
    if (!validEmail(email)) return c.json({ error: "a valid address needed" }, 400);
    later(c, sendReset(email, opts.mail));
    return c.json({ sent: true }, 202);
  });

  // US-09, US-10: Google login, only for an existing account with Google's verified address.
  app.get("/api/auth/config", (c) => c.json({ google: !!google && !!sessionKey, ...(opts.mail && sessionKey ? { reset: true } : {}) }));
  const redirectUri = (c: Context<Env>) => `${new URL(c.req.url).origin}/api/auth/google/callback`;
  app.get("/api/auth/google", async (c) => {
    if (!google || !sessionKey) return c.json({ error: "off" }, 404);
    const state = newSecret(), { verifier, challenge } = await pkce();
    await setSignedCookie(c, "google", `${state}.${verifier}`, sessionKey, { httpOnly: true, secure: true, sameSite: "Lax", path: "/api/auth", maxAge: 600 });
    return c.redirect(googleAuthUrl(google, redirectUri(c), state, challenge), 302);
  });
  app.get("/api/auth/google/callback", async (c) => {
    if (!google || !sessionKey) return c.json({ error: "off" }, 404);
    const kept = await getSignedCookie(c, sessionKey, "google");
    deleteCookie(c, "google", { path: "/api/auth", secure: true });
    const [state, verifier] = (kept || "").split(".");
    const code = c.req.query("code");
    if (!state || !verifier || !code || !same(state, c.req.query("state") ?? "")) return c.redirect("/#login=fel", 302);
    const id = await googleIdentity(google, code, verifier, redirectUri(c), opts.fetch, clock().getTime());
    if (!id?.verified) return c.redirect("/#login=fel", 302);
    const users = await store.users();
    const u = users.find((x) => x.googleId === id.sub) ?? users.find((x) => x.email === id.email && !x.googleId);
    if (!u || u.disabled) return c.redirect("/#login=nokonto", 302);
    if (twoStep && u.superuser) { // SP-13
      await store.saveUser({ ...u, googleId: id.sub });
      return c.redirect((await startSecond(c, u)) === "code" ? "/#login=kod" : "/#login=ny", 302);
    }
    await loggedIn({ ...u, googleId: id.sub });
    await startSession(c, u);
    return c.redirect("/", 302);
  });

}
