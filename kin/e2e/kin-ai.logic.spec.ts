import { test, expect } from "@playwright/test";
import { KIN_AI_MODEL, KIN_AI_OFF, KIN_AI_PRIVACY, kinAiRequest, textOf } from "@/lib/kin-ai";
import { healthAnswer, mayAskHealth, type HealthRows } from "@/lib/assistant/health-answer";

/** Kin AI without a key: the request every feature sends, and the health
 * answer the assistant reads from (#699). No network, no database. */

test("every Kin AI call goes to Haiku 4.5, with nothing Haiku rejects", () => {
  const req = kinAiRequest({ messages: [{ role: "user", content: "hi" }] });
  expect(KIN_AI_MODEL).toBe("claude-haiku-4-5");
  expect(req.model).toBe(KIN_AI_MODEL);
  expect(req.max_tokens).toBe(4096);
  // Haiku 4.5 has no effort levels and no server-side fallback; sending
  // either is a 400 (claude-api skill, model table). The Opus calls had both.
  expect(req.output_config?.effort).toBeUndefined();
  expect("fallbacks" in req).toBe(false);
  expect("betas" in req).toBe(false);
});

test("a caller's own settings ride along, and max_tokens can be raised", () => {
  const req = kinAiRequest({
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: { type: "object", properties: {}, additionalProperties: false } } },
    messages: [{ role: "user", content: "hi" }],
  });
  expect(req.max_tokens).toBe(1024);
  expect(req.output_config?.format?.type).toBe("json_schema");
});

test("the off and privacy lines say what Jonathan asked for", () => {
  expect(KIN_AI_OFF).toContain("Kin AI isn't switched on yet");
  expect(KIN_AI_PRIVACY).toContain("never used to train AI");
});

test("only the text blocks of an answer are read", () => {
  expect(textOf([{ type: "text", text: " Hello " }, { type: "tool_use" }, { type: "text", text: "there" }])).toBe("Hello there");
  expect(textOf([])).toBe("");
});

test("health questions are for grown-ups who are not in kid view", () => {
  expect(mayAskHealth({ role: "parent", kidView: false })).toBe(true);
  expect(mayAskHealth({ role: "adult", kidView: false })).toBe(true);
  expect(mayAskHealth({ role: "child_self", kidView: false })).toBe(false);
  expect(mayAskHealth({ role: "child_managed", kidView: false })).toBe(false);
  expect(mayAskHealth({ role: "parent", kidView: true })).toBe(false);
});

const rows: HealthRows = {
  member: {
    full_name: "Lia Santos",
    role: "child_self",
    dob: "2016-03-04",
    blood_type: "O+",
    allergies: "Peanuts, amoxicillin",
    physician_name: "Dr. Reyes",
    insurance_info: "Maxicare, card 1234",
    philhealth_number: null,
  },
  medicines: [
    { name: "Cetirizine", dose: "5 mg", times: ["20:00"], start_date: "2026-10-01", end_date: null, notes: null },
    { name: "Amoxicillin", dose: "250 mg", times: ["08:00", "20:00"], start_date: "2026-09-01", end_date: "2026-09-10", notes: null },
    { name: "Salbutamol", dose: null, times: [], start_date: "2026-01-01", end_date: null, notes: "when wheezing" },
  ],
  conditions: [
    { name: "Asthma", status: "ongoing", meta_note: "mild" },
    { name: "Chickenpox", status: "resolved", meta_note: null },
    { name: "MMR", status: "routine", meta_note: null, health_condition_entries: [{ entry_date: "2017-03-10" }] },
  ],
  vitals: [{ vital_type: "weight", reading_date: "2026-10-10", value_text: "32", unit: "kg" }],
  illness: [{ logged_at: "2026-10-15T10:00:00Z", temperature_c: 38.6, symptoms: "cough", given: "paracetamol", note: null }],
  labs: [],
  calls: [{ name: "Ana Santos", relationship: "mother", phone: "0917 000 0000" }],
  checks: [{ what: "Dental check-up", when_date: "2026-11-02", status: "due_soon" }],
  questions: ["Still wheezing at night?"],
  today: "2026-10-20",
  dayOf: (iso) => iso.slice(0, 10),
};

test("the answer has the 2 a.m. facts: allergy, blood type, medicines now with doses, HMO, who to call", () => {
  const a = healthAnswer(rows);
  expect(a.who).toBe("Lia Santos");
  expect(a.allergies).toBe("Peanuts, amoxicillin");
  expect(a.blood_type).toBe("O+");
  expect(a.hmo_or_insurance).toBe("Maxicare, card 1234");
  expect(a.usual_doctor).toBe("Dr. Reyes");
  expect(a.who_to_call).toEqual([{ name: "Ana Santos", relationship: "mother", phone: "0917 000 0000" }]);
  expect(a.health_checks_due).toEqual([{ what: "Dental check-up", when_date: "2026-11-02", status: "due_soon" }]);
  expect(a.questions_for_the_doctor).toEqual(["Still wheezing at night?"]);
});

test("only the medicines being taken today are 'now', an as-needed one says so", () => {
  const meds = healthAnswer(rows).medicines_now as { name: string; dose: string | null; times: unknown; notes?: string }[];
  expect(meds.map((m) => m.name)).toEqual(["Cetirizine", "Salbutamol"]);
  expect(meds[0]).toEqual({ name: "Cetirizine", dose: "5 mg", times: ["20:00"] });
  expect(meds[1].times).toBe("as needed");
  expect(meds[1].notes).toBe("when wheezing");
});

test("resolved conditions and vaccines are left out of conditions; a child's vaccines get their own lines", () => {
  const a = healthAnswer(rows);
  expect(a.conditions).toEqual(["Asthma (mild)"]);
  expect(Array.isArray(a.vaccines_given)).toBe(true);
  expect((a.vaccines_given as string[]).join(" ")).toContain("2017-03-10");
  expect(a.recent_readings_90_days).toEqual(["Weight: 32 kg on 2026-10-10"]);
  expect(a.recent_illness_60_days).toEqual(["2026-10-15: 38.6 °C · cough · gave paracetamol"]);
});

test("a blank is said to be unrecorded rather than left for the model to fill", () => {
  const a = healthAnswer({
    ...rows,
    member: { ...rows.member, role: "adult", dob: null, blood_type: null, allergies: "  ", insurance_info: null, physician_name: null },
    medicines: [],
    conditions: [],
    vitals: [],
    illness: [],
    calls: [],
    checks: [],
    questions: [],
  });
  expect(a.allergies).toBe("none recorded");
  expect(a.blood_type).toBe("not recorded");
  expect(a.medicines_now).toBe("none being taken");
  expect(a.conditions).toBe("none recorded");
  expect(a.hmo_or_insurance).toBe("not recorded");
  expect(a.who_to_call).toBe("nobody with a number recorded");
  expect(a.vaccines_given).toBeUndefined();
  expect(String(a.note)).toContain("parents-only or private");
});
