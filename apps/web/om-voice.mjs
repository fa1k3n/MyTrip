// UI-19, UI-23: makes the narration of a film with ElevenLabs, one MP3 per scene: Om Basläger (public/om.html) into public/om-audio/,
// or with the argument "ai" the AI film (public/ai.html) into public/ai-audio/.
// The key is read from the environment and never written anywhere; it lives in .env.local at the root of the private repo:
//   node --env-file=../../../.env.local om-voice.mjs [ai]
// Without ELEVENLABS_VOICE it lists the voices of the account. A text already recorded with the same voice is reused, also when
// the scene has moved, so only new or changed texts cost characters.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const API = "https://api.elevenlabs.io/v1", MODEL = "eleven_v4";
const key = process.env.ELEVENLABS_API_KEY, voice = process.env.ELEVENLABS_VOICE;
if (!key) { console.error("Ingen nyckel: kör med node --env-file=../../../.env.local om-voice.mjs"); process.exit(1); }
const headers = { "xi-api-key": key, "content-type": "application/json" };

if (!voice) {
  const r = await fetch(`${API}/voices`, { headers });
  if (!r.ok) { console.error(`ElevenLabs svarade ${r.status}. Stämmer nyckeln?`); process.exit(1); }
  const { voices } = await r.json();
  console.log("Rösterna på kontot (lägg gärna till en svensk röst från Voice Library först):\n");
  for (const v of voices) console.log(`${v.voice_id}  ${v.name}  ${Object.values(v.labels ?? {}).join(", ")}`);
  console.log("\nKör igen med vald röst: ELEVENLABS_VOICE=<id> node om-voice.mjs");
  process.exit(0);
}

const film = process.argv[2] ?? "om";
if (!/^[a-z]+$/.test(film)) { console.error("Filmens namn: om eller ai."); process.exit(1); }
const page = readFileSync(new URL(`./public/${film}.html`, import.meta.url), "utf8");
const texts = [...page.matchAll(/^ {4}text: "((?:[^"\\]|\\.)*)",$/gm)].map((m) => JSON.parse(`"${m[1]}"`));
if (!texts.length) { console.error(`Hittade inga scener i public/${film}.html.`); process.exit(1); }
const dir = new URL(`./public/${film}-audio/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const indexUrl = new URL("index.json", dir);
const old = existsSync(indexUrl) ? JSON.parse(readFileSync(indexUrl, "utf8")) : { scenes: [] };

// Every recording made with this voice, by its text, read before any file is written over.
const kept = new Map(old.voice === voice ? (old.scenes ?? []).filter((x) => existsSync(new URL(x.file, dir))).map((x) => [x.text, readFileSync(new URL(x.file, dir))]) : []);
const scenes = [];
let chars = 0;
for (const [i, text] of texts.entries()) {
  const file = `${String(i + 1).padStart(2, "0")}.mp3`;
  if (kept.has(text)) { writeFileSync(new URL(file, dir), kept.get(text)); scenes.push({ file, text }); console.log(`${file} oförändrad`); continue; }
  const r = await fetch(`${API}/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: "POST", headers,
    body: JSON.stringify({ text, model_id: MODEL, language_code: "sv", apply_text_normalization: "on", previous_text: texts[i - 1], next_text: texts[i + 1],
      voice_settings: { stability: 0.5, similarity_boost: 0.75 } }), // v4 takes no style or speed
  });
  if (!r.ok) { console.error(`${file}: ElevenLabs svarade ${r.status} ${await r.text()}`); process.exit(1); }
  writeFileSync(new URL(file, dir), Buffer.from(await r.arrayBuffer()));
  chars += text.length;
  scenes.push({ file, text });
  console.log(`${file} klar (${text.length} tecken)`);
}
writeFileSync(indexUrl, JSON.stringify({ voice, model: MODEL, scenes }, null, 2) + "\n");
console.log(`\nKlart: ${scenes.length} scener i public/${film}-audio/, ${chars} tecken använda nu.`);
