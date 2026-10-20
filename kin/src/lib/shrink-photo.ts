/** Shrinks a phone photo to at most 1600px on its long side as a JPEG. A
 * 12-megapixel photo is 4-6 MB and reads no better than this; the smaller one
 * uploads in a moment on mobile data. Browser only (canvas); used by the
 * flyer and receipt scanners before the picture is sent. */
export async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
}
