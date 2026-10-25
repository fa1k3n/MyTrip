// Share links and the credentials sent to the API (AU-01, AU-02, AU-08). Pure, so it runs under node --test.

export type LinkHash = { kind: "link"; key: string; tripId: string } | { kind: "admin" } | null;

/** The secret goes after #, so it is never sent in a request path or a Referer header (AU-01). */
export const shareUrl = (origin: string, tripId: string, secret: string) => `${origin}/#l=${tripId}.${secret}`;

export function parseLinkHash(hash: string): LinkHash {
  if (hash === "#admin") return { kind: "admin" };
  const m = /^#l=([a-z0-9][a-z0-9-]*)\.([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? { kind: "link", key: `link.${m[1]}.${m[2]}`, tripId: m[1] } : null;
}

/** A share link wins over the development token; with neither, the admin session cookie does the work. */
export const authHeader = (devToken: string, link: string | null) =>
  link ? `Bearer ${link}` : devToken ? `Bearer ${devToken}` : undefined;
