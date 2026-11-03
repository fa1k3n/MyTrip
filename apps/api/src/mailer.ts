// Mail the app sends itself: only the password link of a forgotten password (US-35), through Brevo's API with its key as a secret.

export type Mail = { to: string; name: string; subject: string; text: string; html?: string };
/** Sends one mail; false when it could not be sent. */
export type Mailer = { send(m: Mail): Promise<boolean> };

/** Text for HTML. */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** "Baslager <noreply@example.org>" or a bare address as Brevo's sender. */
function sender(from: string) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1]!.replace(/^"|"$/g, ""), email: m[2]!.trim() } : { email: from.trim() };
}

/** Brevo's transactional mail API (US-35). */
export function brevoMailer(cfg: { apiKey: string; from: string }, f: typeof fetch = fetch): Mailer {
  return {
    async send(m) {
      const body = { sender: sender(cfg.from), to: [{ email: m.to, name: m.name }], subject: m.subject, textContent: m.text, ...(m.html ? { htmlContent: m.html } : {}) };
      try {
        const res = await f("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": cfg.apiKey, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) console.error(`Brevo: ${res.status}`);
        return res.ok;
      } catch (e) { console.error(`Brevo: ${(e as Error).message}`); return false; }
    },
  };
}
