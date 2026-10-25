// Fails the build when the built web files contain a token or key (DP-08, AU-08).
// Usage: node check-dist.ts dist   (the secrets to look for are read from the environment)
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ENV = ["VITE_TRIP_TOKEN", "TRIP_READ_TOKEN", "TRIP_PROPOSE_TOKEN", "TRIP_ADMIN_TOKEN", "ADMIN_PASSWORD", "SESSION_KEY", "ROUTES_API_KEY", "AI_API_KEY"];
const PATTERNS: [RegExp, string][] = [[/AIza[0-9A-Za-z_-]{35}/, "a Google API key"], [/sk-ant-[0-9A-Za-z_-]{10,}/, "an Anthropic API key"]];
const MIN = 8; // shorter values (such as the one-letter dev tokens) would match ordinary text

/** One line per file and finding. */
export function findSecrets(files: { name: string; text: string }[], values: string[]) {
  const secrets = values.filter((v) => v && v.length >= MIN);
  return files.flatMap(({ name, text }) => [
    ...(secrets.some((v) => text.includes(v)) ? [`${name}: a configured secret`] : []),
    ...PATTERNS.filter(([re]) => re.test(text)).map(([, what]) => `${name}: ${what}`),
  ]);
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(js|css|html|json|map|txt)$/.test(e.name)) out.push(p);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? "dist";
  const files = await Promise.all((await walk(dir)).map(async (p) => ({ name: relative(dir, p), text: await readFile(p, "utf8") })));
  const found = findSecrets(files, ENV.map((k) => process.env[k] ?? ""));
  if (found.length) {
    console.error(`Secrets in the built web files:\n${found.join("\n")}`);
    process.exit(1);
  }
  console.log(`check-dist: ${files.length} files, no secrets`);
}
