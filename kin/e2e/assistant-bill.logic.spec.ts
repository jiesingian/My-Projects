import { test, expect } from "@playwright/test";
import { ASSISTANT_TOOLS } from "@/lib/assistant/tools";

/** Kin AI's add_bill (Jonathan, 26 October): a bill is money due on a day,
 * so the tool the model is handed requires the due date and says to ask
 * for it, and Weekly is one of its repeats. Kin AI is not switched on yet
 * (28 October), so this pins what the model will be given without calling
 * it; the handler's own refusal of an undated bill is in tools.ts. */

type Tool = { name: string; input_schema: { required?: string[]; properties: Record<string, { enum?: string[]; description?: string }> } };
const addBill = (ASSISTANT_TOOLS as unknown as Tool[]).find((t) => t.name === "add_bill")!;

test("add_bill requires the day it is due, and says to ask for it", () => {
  expect(addBill, "add_bill is offered to the model").toBeTruthy();
  expect(addBill.input_schema.required).toEqual(expect.arrayContaining(["name", "amount", "due_date"]));
  expect(addBill.input_schema.properties.due_date.description).toMatch(/ask/i);
});

test("add_bill can repeat weekly", () => {
  expect(addBill.input_schema.properties.recurrence.enum).toContain("weekly");
});
