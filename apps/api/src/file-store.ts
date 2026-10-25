// The store for the local Node server: one file per trip, <dir>/<id>.trip.json, and cover images in <dir>/img/.
// settings.json, links.json (share link secrets, AU-01), person-links.json (AU-11), push-subs.json (NT-03), proposals.json and log.jsonl sit beside them (DP-04).
import { appendFile, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Settings, Trip } from "@trip/schema";
import { bySubscriber, pushMatch, type LogEntry, type PersonLink, type Proposal, type PushSub, type Store } from "./app.ts";

const isId = (id: string) => /^[a-z0-9][a-z0-9-]*$/.test(id);
const missing = (e: unknown) => (e as { code?: string }).code === "ENOENT";

export function fileStore(dir: string): Store {
  const file = (id: string) => join(dir, `${id}.trip.json`);
  const path = (name: string) => join(dir, name);
  const readJson = async <T>(name: string, fallback: T): Promise<T> => {
    try {
      return JSON.parse(await readFile(path(name), "utf8")) as T;
    } catch (e) {
      if (missing(e)) return fallback;
      throw e;
    }
  };
  const writeJson = (name: string, v: unknown) => writeFile(path(name), JSON.stringify(v, null, 2) + "\n");
  // Writes run one at a time, so a revision check and its write cannot interleave with another change (DP-03).
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(f: () => Promise<T>): Promise<T> => {
    const next = queue.then(f, f);
    queue = next.catch(() => {});
    return next;
  };

  const store: Store = {
    async list() {
      const names = (await readdir(dir)).filter((n) => n.endsWith(".trip.json")).sort();
      return (await Promise.all(names.map((n) => store.load(n.slice(0, -".trip.json".length))))).filter((t) => t !== undefined);
    },
    async load(id) {
      if (!isId(id)) return undefined;
      try {
        return Trip.parse({ ...JSON.parse(await readFile(file(id), "utf8")), id });
      } catch (e) {
        if (missing(e)) return undefined;
        throw e;
      }
    },
    save: (t, base) => serial(async () => {
      if (base !== undefined && (await store.load(t.id))?.revision !== base) return false;
      await writeFile(file(t.id), JSON.stringify(t, null, 2) + "\n");
      return true;
    }),
    remove: (id) => serial(async () => {
      if (!isId(id) || !(await store.load(id))) return false;
      await rm(file(id));
      return true;
    }),
    async image(name) {
      try {
        return new Uint8Array(await readFile(join(dir, "img", name))); // name is checked by the schema
      } catch (e) {
        if (missing(e)) return undefined;
        throw e;
      }
    },
    loadSettings: async () => Settings.parse(await readJson("settings.json", {})),
    saveSettings: (s) => writeJson("settings.json", s),
    links: () => readJson<Record<string, string>>("links.json", {}),
    saveLinks: (l) => writeJson("links.json", l),
    personLinks: () => readJson<PersonLink[]>("person-links.json", []),
    savePersonLinks: (l) => writeJson("person-links.json", l),
    pushSubs: async (tripId) => (await readJson<PushSub[]>("push-subs.json", [])).filter((x) => x.tripId === tripId).sort(bySubscriber),
    savePushSub: (x) => serial(async () => {
      const all = await readJson<PushSub[]>("push-subs.json", []);
      await writeJson("push-subs.json", [...all.filter((y) => !(y.tripId === x.tripId && y.endpoint === x.endpoint)), x]);
    }),
    removePushSubs: (tripId, m) => serial(async () => {
      await writeJson("push-subs.json", (await readJson<PushSub[]>("push-subs.json", [])).filter((x) => !(x.tripId === tripId && pushMatch(x, m))));
    }),
    proposals: async (tripId) => (await readJson<Proposal[]>("proposals.json", [])).filter((p) => p.tripId === tripId),
    saveProposal: (p) => serial(async () => {
      const all = await readJson<Proposal[]>("proposals.json", []);
      const i = all.findIndex((x) => x.id === p.id);
      await writeJson("proposals.json", i < 0 ? [...all, p] : all.map((x, n) => (n === i ? p : x)));
    }),
    appendLog: (e) => appendFile(path("log.jsonl"), JSON.stringify(e) + "\n"),
    async log() {
      try {
        return (await readFile(path("log.jsonl"), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l) as LogEntry);
      } catch (e) {
        if (missing(e)) return [];
        throw e;
      }
    },
  };
  return store;
}
