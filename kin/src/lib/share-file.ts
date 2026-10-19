/** Hand a file the phone made to the share sheet where there is one (Viber,
 * Messenger, Photos, Files), and as a download where there is not or the
 * person cancels. Browser only. Returns how it went, for the button's words. */
export async function shareOrDownload(file: File, share?: { title?: string; text?: string }): Promise<"shared" | "downloaded"> {
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], ...share });
      return "shared";
    } catch {
      // Cancelled, or refused: save it instead.
    }
  }
  const href = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = href;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return "downloaded";
}
