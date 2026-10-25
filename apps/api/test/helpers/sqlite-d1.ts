// A Cloudflare D1 look-alike over Node's built-in SQLite, so the D1 store runs under node --test (DP-06).
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Like, D1Stmt, R2Like } from "../../src/d1-store.ts";

type Stmt = D1Stmt & { exec(): unknown };

const MIGRATIONS = new URL("../../migrations/", import.meta.url);

/** A fresh in-memory database with every migration applied, in order. */
export function sqliteD1(migrations = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()): D1Like & { db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  for (const m of migrations) db.exec(readFileSync(new URL(m, MIGRATIONS), "utf8"));
  const stmt = (sql: string, args: SQLInputValue[] = []): Stmt => ({
    bind: (...a: unknown[]) => stmt(sql, a as SQLInputValue[]),
    first: async <T>() => (db.prepare(sql).get(...args) as T | undefined) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...args) as T[] }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    exec: () => db.prepare(sql).run(...args),
  });
  return {
    db,
    prepare: (sql) => stmt(sql),
    async batch(list) { // all or nothing, like D1
      db.exec("BEGIN");
      try {
        const out = (list as Stmt[]).map((s) => s.exec());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

export const memoryR2 = (files: Record<string, Uint8Array> = {}): R2Like => ({
  get: async (key) => (files[key] ? { arrayBuffer: async () => files[key].slice().buffer as ArrayBuffer } : null),
});
