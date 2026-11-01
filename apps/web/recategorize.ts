// Converts the former category Mat/Fritid in trip files once (MI-31): a dry run by default, `--write` saves with the next revision.
// Usage: node apps/web/recategorize.ts [--write] <trip.json>...
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { applyOps, checkTrip, Trip } from "@trip/schema";
import { recategorizeOps } from "./src/money.ts";

const write = process.argv.includes("--write");
for (const file of process.argv.slice(2).filter((a) => a !== "--write")) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const t = Trip.parse({ id: basename(file).replace(/\.trip\.json$/, ""), ...raw }); // an example has no id until it is seeded
  const ops = recategorizeOps(t);
  if (!ops.length) { console.log(`${file}: nothing to convert`); continue; }
  const after = Trip.parse(applyOps(t, ops));
  const before = new Set(checkTrip(t)), added = checkTrip(after).filter((x) => !before.has(x));
  if (added.length) { console.log(`${file}: not converted, new problems:`, added); continue; }
  for (const o of ops) console.log(`${file}: ${o.path} -> ${"value" in o ? o.value : ""}`);
  if (write) {
    const out = applyOps(raw, ops) as typeof raw; // only the categories change; a stored trip gets the next revision, an example keeps its own
    if (raw.id) out.revision = t.revision + 1;
    writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    console.log(`${file}: saved${raw.id ? ` as revision ${out.revision}` : ""}`);
  }
}
