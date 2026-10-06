/** Puts a video on the phone. Where the share sheet can take a file (iPhone,
 * Android) it is used, because that is where "Save Video" to the camera roll
 * lives; elsewhere the file downloads. */
export async function saveToPhone(blob: Blob, fileName: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const safeName = fileName.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Kin video";
  const file = new File([blob], safeName, { type: blob.type || "video/mp4" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (e) {
      // Closing the share sheet is a choice, not a failure.
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // NotAllowedError: the tap that asked was too long ago (the file had
      // to be fetched first). A download still works without one.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
