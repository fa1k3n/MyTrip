export type Op = { op: "set" | "add" | "remove"; path: string; value?: unknown };

/** Applies changes to a copy of the document. The input is never modified (dry runs rely on this). */
export function applyOps<T>(doc: T, ops: Op[]): T {
  const out: any = structuredClone(doc);
  for (const o of ops) {
    const keys = o.path.split("/").filter(Boolean);
    const last = keys.pop();
    if (last === undefined) throw new Error("Empty path");
    let cur: any = out;
    for (const k of keys) {
      if (cur === null || typeof cur !== "object" || !(k in cur)) throw new Error(`Path not found: ${o.path}`);
      cur = cur[k];
    }
    if (Array.isArray(cur)) {
      const i = last === "-" && o.op === "add" ? cur.length : Number(last);
      const max = o.op === "add" ? cur.length : cur.length - 1;
      if (!Number.isInteger(i) || i < 0 || i > max) throw new Error(`Index out of range: ${o.path}`);
      if (o.op === "add") cur.splice(i, 0, o.value);
      else if (o.op === "remove") cur.splice(i, 1);
      else cur[i] = o.value;
    } else if (cur !== null && typeof cur === "object") {
      if (o.op === "remove") {
        if (!(last in cur)) throw new Error(`Path not found: ${o.path}`);
        delete cur[last];
      } else cur[last] = o.value;
    } else throw new Error(`Path not found: ${o.path}`);
  }
  return out;
}
