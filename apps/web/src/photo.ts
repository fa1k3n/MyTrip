// Own photos for wishes are scaled down on the phone before they are sent (DB-12): the Worker cannot scale images.

export const PHOTO_MAX = 300 * 1024, PHOTO_PX = 1200;

/** The size to scale to: at most 1 200 px on the longest side, keeping the shape, never larger. */
export function fitSize(width: number, height: number, max = PHOTO_PX) {
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/** A JPEG of at most 300 kB: lower quality first, then a smaller size; null when the photo cannot be read. */
export async function shrinkPhoto(file: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { return null; }
  for (let px = PHOTO_PX; px >= 400; px = Math.round(px * 0.8)) {
    const { width, height } = fitSize(bitmap.width, bitmap.height, px);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= PHOTO_MAX) return blob;
    }
  }
  return null;
}
