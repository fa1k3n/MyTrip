// Copies the example trips into a data folder: npm run seed [-- <dir>] [-- --force]
import { copyFile, mkdir, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exists = (p: string) => access(p).then(() => true, () => false);

/** Copies *.trip.json and img/* from `from` to `to`. Existing files are kept unless `force` is set. */
export async function copyExamples(from: string, to: string, { force = false } = {}) {
  const files = [
    ...(await readdir(from)).filter((n) => n.endsWith(".trip.json")).sort(),
    ...(await readdir(join(from, "img")).catch(() => [])).sort().map((n) => `img/${n}`),
  ];
  const copied: string[] = [], skipped: string[] = [];
  await mkdir(join(to, "img"), { recursive: true });
  for (const f of files) {
    if (!force && (await exists(join(to, f)))) { skipped.push(f); continue; }
    await copyFile(join(from, f), join(to, f));
    copied.push(f);
  }
  return { copied, skipped };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const to = args.find((a) => !a.startsWith("--")) ?? process.env.TRIP_DIR ?? join(root, "data");
  const { copied, skipped } = await copyExamples(join(root, "examples"), to, { force });
  console.log(`Example trips -> ${to}`);
  for (const f of copied) console.log(`  copied  ${f}`);
  for (const f of skipped) console.log(`  kept    ${f} (exists, use --force to overwrite)`);
}
