import { test, expect } from "@playwright/test";
import { deleteWithUndo, isHidden } from "@/lib/undo-delete";
import { toast } from "@/components/toast";

/** Delete with Undo (lib/undo-delete.ts, toast.undo): the row hides at once;
 * the delete runs only when the toast goes, never after Undo; a failed delete
 * brings the row back. */

// The toast store paints with requestAnimationFrame; there is no browser here.
(globalThis as { requestAnimationFrame?: (cb: () => void) => unknown }).requestAnimationFrame ??= (cb) => setTimeout(cb, 0);

const flush = () => new Promise((r) => setTimeout(r, 0));

test("the row hides at once; the delete runs when the toast goes, once", async () => {
  let calls = 0;
  const id = deleteWithUndo({ id: "row-a", message: "Deleted", remove: async () => { calls++; return { error: null }; } });
  expect(isHidden("row-a")).toBe(true);
  expect(calls).toBe(0);
  toast.dismiss(id);
  await flush();
  expect(calls).toBe(1);
  toast.dismiss(id);
  await flush();
  expect(calls).toBe(1);
  // Deleted: it stays out of the list until the refresh drops it for good.
  expect(isHidden("row-a")).toBe(true);
});

test("Undo brings the row back and nothing is deleted", async () => {
  let calls = 0;
  const id = deleteWithUndo({ id: "row-b", message: "Deleted", remove: async () => { calls++; return { error: null }; } });
  toast.takeBack(id);
  await flush();
  expect(isHidden("row-b")).toBe(false);
  expect(calls).toBe(0);
});

test("a delete that fails brings the row back", async () => {
  const id = deleteWithUndo({ id: "row-c", message: "Deleted", remove: async () => ({ error: "Kin couldn't delete that." }) });
  toast.dismiss(id);
  await flush();
  expect(isHidden("row-c")).toBe(false);
});
