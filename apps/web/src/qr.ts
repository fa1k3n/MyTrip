// A link as a QR code (AU-31), drawn in the app so the link is never sent to another service. Byte mode, error correction
// level M, versions 1 to 10 (up to 213 bytes). Follows ISO/IEC 18004 as laid out by Project Nayuki's QR Code generator (MIT).
// Pure, so it runs under node --test.

export type Qr = { size: number; modules: boolean[][]; mask: number };

// Level M, by version 1–10: error correction codewords per block and number of blocks.
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

const rawModules = (v: number) => {
  let n = (16 * v + 128) * v + 64;
  if (v >= 2) { const a = Math.floor(v / 7) + 2; n -= (25 * a - 10) * a - 55; if (v >= 7) n -= 36; }
  return n;
};
const dataCodewords = (v: number) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v]! * BLOCKS[v]!;

const mul = (x: number, y: number) => {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
};
/** The Reed-Solomon error correction codewords for the data. */
export function rsRemainder(data: number[], degree: number): number[] {
  const div = Array<number>(degree).fill(0);
  div[degree - 1] = 1;
  for (let i = 0, root = 1; i < degree; i++, root = mul(root, 2))
    for (let j = 0; j < degree; j++) div[j] = mul(div[j]!, root) ^ (j + 1 < degree ? div[j + 1]! : 0);
  const out = Array<number>(degree).fill(0);
  for (const b of data) {
    const f = b ^ out.shift()!;
    out.push(0);
    div.forEach((d, i) => { out[i]! ^= mul(d, f); });
  }
  return out;
}

/** The 15 format bits: level M (00), the mask, BCH error correction, XOR 0x5412. */
export function formatBits(mask: number): number {
  const data = mask; // level M is 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function codewords(bytes: Uint8Array, v: number): number[] {
  const cap = dataCodewords(v), bits: number[] = [];
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);
  // Split into blocks, add error correction to each and interleave.
  const nb = BLOCKS[v]!, ecc = ECC_PER_BLOCK[v]!, raw = Math.floor(rawModules(v) / 8);
  const short = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, (k += shortLen - ecc + (i < short ? 0 : 1)));
    const e = rsRemainder(dat, ecc);
    if (i < short) dat.push(0);
    blocks.push([...dat, ...e]);
  }
  const out: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++)
    blocks.forEach((b, j) => { if (i !== shortLen - ecc || j >= short) out.push(b[i]!); });
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0, (_, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(v: number, words: number[], mask: number): boolean[][] {
  const size = v * 4 + 17;
  const m = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { m[y]![x] = dark; fixed[y]![x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const)
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, pos = [6];
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    pos.forEach((x, i) => pos.forEach((y, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
  }
  const f = formatBits(mask), bit = (b: number, i: number) => ((b >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(f, i));
  set(8, 7, bit(f, 6)); set(8, 8, bit(f, 7)); set(7, 8, bit(f, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(f, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(f, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(f, i));
  set(8, size - 8, true);
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vb = (v << 12) | rem;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(vb, i)); set(b, a, bit(vb, i)); }
  }
  // The data in two-module columns, zigzagging up and down from the bottom right, skipping the timing column.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (fixed[y]![x]) continue;
      const dark = i < words.length * 8 && bit(words[i >>> 3]!, 7 - (i & 7));
      i++;
      m[y]![x] = dark !== MASKS[mask]!(x, y);
    }
  }
  return m;
}

/** The standard's penalty score; the mask with the lowest one is used. */
function penalty(m: boolean[][]): number {
  const size = m.length;
  let p = 0, dark = 0;
  const lines = [m, m[0]!.map((_, x) => m.map((row) => row[x]!))];
  for (const rows of lines) for (const row of rows) {
    for (let i = 1, run = 1; i <= size; i++)
      if (i < size && row[i] === row[i - 1]) run++;
      else { if (run >= 5) p += run - 2; run = 1; }
    const s = row.map((d) => (d ? "1" : "0")).join("");
    p += 40 * ((`0000${s}0000`.match(/(?=00001011101|10111010000)/g) ?? []).length);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (m[y]![x]) dark++;
    if (x < size - 1 && y < size - 1 && m[y]![x] === m[y]![x + 1] && m[y]![x] === m[y + 1]![x] && m[y]![x] === m[y + 1]![x + 1]) p += 3;
  }
  return p + 10 * Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size));
}

/** The QR code for a text, in the smallest version that holds it. */
export function qr(text: string): Qr {
  const bytes = new TextEncoder().encode(text);
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((n) => bytes.length + (n < 10 ? 2 : 3) <= dataCodewords(n));
  if (!v) throw new Error("Too long for a QR code");
  const words = codewords(bytes, v);
  let best: Qr | null = null, score = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const modules = build(v, words, mask), s = penalty(modules);
    if (s < score) { score = s; best = { size: v * 4 + 17, modules, mask }; }
  }
  return best!;
}

/** One SVG path with a square per dark module, inside a quiet zone of four modules; box is the side of the viewBox. */
export function qrSvgPath({ size, modules }: Qr): { path: string; box: number } {
  let path = "";
  modules.forEach((row, y) => row.forEach((d, x) => { if (d) path += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  return { path, box: size + 8 };
}
