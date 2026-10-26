// PDF tickets drawn by the app, so they open in the installed app and offline (BK-10). Loaded only when a PDF is opened (PF-01).
// pdf.js (Apache-2.0); the legacy build also runs on older iPhones.
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

/** The pages of a PDF as PNG images `width` pixels wide; at most 10 pages. */
export async function pdfPages(blob: Blob, width: number): Promise<string[]> {
  const doc = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const out: string[] = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      out.push(URL.createObjectURL(await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("canvas"))), "image/png"))));
    }
  } finally { await doc.destroy(); }
  return out;
}
