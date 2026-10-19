/** A family tree file (GEDCOM 5.5.1), in and out (19 October, Kin Plus).
 *
 * Export writes the household's tree, and what the viewer can see of linked
 * households' branches, as the file MyHeritage, FamilySearch and Ancestry
 * read. Import reads one a relative made there, shows who is in it, and says
 * which of them are already on the tree -- by the same rule as "Is this the
 * same Stella?" (tree_match_suggestions, 20261006120000) -- so nothing is
 * added twice and nothing is written until a grown-up confirms.
 *
 * Living people (docs/FAMILY_TREE.md): outside the household, Kin only ever
 * says a living person's name and birth year. A file leaves Kin, so it says
 * no more than that about anyone who may be alive: no full birth date, no
 * notes. Somebody with a death on record, or born more than LIVING_YEARS ago,
 * is written in full. Pure, for the specs. */

/** Born this many years ago or fewer, with no death recorded: taken to be
 * alive, as the genealogy sites do. */
export const LIVING_YEARS = 110;
/** The most people one import adds. A tree bigger than this is a project for
 * the genealogy site, not a phone. */
export const IMPORT_MAX = 1000;
const NOTES_MAX = 500;
const NAME_MAX = 100;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// ── Reading ────────────────────────────────────────────────────────────────

export type GedcomPerson = {
  /** The file's own id, "@I12@". */
  ref: string;
  fullName: string;
  sex: "M" | "F" | null;
  /** YYYY-MM-DD when the file gives an exact day, else null. */
  dob: string | null;
  /** The birth as the file wrote it, when it is not an exact day ("ABT 1920"). */
  birthText: string | null;
  birthPlace: string | null;
  died: boolean;
  deathText: string | null;
  deathPlace: string | null;
  fatherRef: string | null;
  motherRef: string | null;
  spouseRef: string | null;
};

type Line = { level: number; ref: string | null; tag: string; value: string; children: Line[] };

/** Lines into a tree of records, CONC and CONT folded into their parent's value. */
function readLines(text: string): Line[] {
  const roots: Line[] = [];
  const stack: Line[] = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r\n|\r|\n/)) {
    const m = raw.match(/^\s*(\d+)\s+(?:(@[^@\s]+@)\s+)?(\S+)(?: (.*))?$/);
    if (!m) continue;
    const line: Line = { level: Number(m[1]), ref: m[2] ?? null, tag: m[3].toUpperCase(), value: m[4] ?? "", children: [] };
    while (stack.length && stack[stack.length - 1].level >= line.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent && (line.tag === "CONC" || line.tag === "CONT")) {
      parent.value += line.tag === "CONT" ? `\n${line.value}` : line.value;
      continue;
    }
    if (parent) parent.children.push(line);
    else if (line.level === 0) roots.push(line);
    else continue;
    stack.push(line);
  }
  return roots;
}

const child = (l: Line, tag: string) => l.children.find((c) => c.tag === tag);
const children = (l: Line, tag: string) => l.children.filter((c) => c.tag === tag);

/** "Juan /dela Cruz/ Jr." -> "Juan dela Cruz Jr." */
export function gedcomName(value: string): string {
  return value.replace(/\//g, " ").replace(/\s+/g, " ").trim();
}

/** "3 MAY 1975" -> "1975-05-03"; anything less exact ("MAY 1975", "ABT
 * 1920", "BET 1900 AND 1910", a Julian date) -> null, kept as words. */
export function gedcomExactDate(value: string): string | null {
  const m = value.trim().toUpperCase().match(/^(\d{1,2}) ([A-Z]{3}) (\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]);
  if (month < 0) return null;
  const day = Number(m[1]);
  const date = new Date(Date.UTC(Number(m[3]), month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The year in a GEDCOM date, however loose: "ABT 1920" -> "1920". */
export function gedcomYear(value: string | null): string | null {
  return value?.match(/\b(\d{4})\b/)?.[1] ?? null;
}

/** Everybody in a file, with their parents and first spouse as the file's
 * own ids. A person in two families as a child takes the first. */
export function parseGedcom(text: string): { people: GedcomPerson[]; source: string | null } {
  const roots = readLines(text);
  const head = roots.find((r) => r.tag === "HEAD");
  const sourceLine = head && child(head, "SOUR");
  const source = sourceLine ? (child(sourceLine, "NAME")?.value || sourceLine.value || null) : null;

  const fams = new Map<string, { husb: string | null; wife: string | null; kids: string[] }>();
  for (const r of roots) {
    if (r.tag !== "FAM" || !r.ref) continue;
    fams.set(r.ref, { husb: child(r, "HUSB")?.value.trim() || null, wife: child(r, "WIFE")?.value.trim() || null, kids: children(r, "CHIL").map((c) => c.value.trim()) });
  }

  const people: GedcomPerson[] = [];
  for (const r of roots) {
    if (r.tag !== "INDI" || !r.ref) continue;
    const nameLine = child(r, "NAME");
    let fullName = nameLine ? gedcomName(nameLine.value) : "";
    if (!fullName && nameLine) fullName = gedcomName(`${child(nameLine, "GIVN")?.value ?? ""} ${child(nameLine, "SURN")?.value ?? ""}`);
    const sexValue = child(r, "SEX")?.value.trim().toUpperCase();
    const birt = child(r, "BIRT");
    const deat = child(r, "DEAT");
    const birthDate = birt ? (child(birt, "DATE")?.value.trim() ?? "") : "";
    const dob = birthDate ? gedcomExactDate(birthDate) : null;

    // FAMC may be missing too; a FAM listing them as CHIL says the same.
    const famc = children(r, "FAMC").map((c) => fams.get(c.value.trim())).find(Boolean) ?? [...fams.values()].find((f) => f.kids.includes(r.ref!));
    const famsRef = children(r, "FAMS").map((c) => c.value.trim());
    // FAMS may be missing; a FAM naming this person as HUSB or WIFE is the same fact.
    const spouseFam = [...famsRef.map((f) => fams.get(f)), ...[...fams.values()].filter((f) => f.husb === r.ref || f.wife === r.ref)].find(
      (f) => f && (f.husb === r.ref ? f.wife : f.husb),
    );
    people.push({
      ref: r.ref,
      fullName: fullName.slice(0, NAME_MAX),
      sex: sexValue === "M" || sexValue === "F" ? sexValue : null,
      dob,
      birthText: birthDate && !dob ? birthDate : null,
      birthPlace: (birt && child(birt, "PLAC")?.value.trim()) || null,
      // "1 DEAT Y" says they died without saying when; so does a DEAT with a date.
      died: !!deat,
      deathText: (deat && child(deat, "DATE")?.value.trim()) || null,
      deathPlace: (deat && child(deat, "PLAC")?.value.trim()) || null,
      fatherRef: famc?.husb ?? null,
      motherRef: famc?.wife ?? null,
      spouseRef: spouseFam ? ((spouseFam.husb === r.ref ? spouseFam.wife : spouseFam.husb) ?? null) : null,
    });
  }
  // Links to somebody not in the file are dropped rather than left dangling.
  const refs = new Set(people.map((p) => p.ref));
  for (const p of people) {
    if (p.fatherRef && !refs.has(p.fatherRef)) p.fatherRef = null;
    if (p.motherRef && !refs.has(p.motherRef)) p.motherRef = null;
    if (p.spouseRef && !refs.has(p.spouseRef)) p.spouseRef = null;
  }
  return { people, source };
}

/** What Kin keeps of a birth or death it cannot hold as a date: words in
 * the tree person's notes, which is where a relative's story lives anyway. */
export function importNotes(p: GedcomPerson): string | null {
  const parts: string[] = [];
  if (p.birthText || p.birthPlace) parts.push(`Born${p.birthText ? ` ${looseDate(p.birthText)}` : ""}${p.birthPlace ? ` in ${p.birthPlace}` : ""}.`);
  if (p.died) parts.push(`Died${p.deathText ? ` ${looseDate(p.deathText)}` : ""}${p.deathPlace ? ` in ${p.deathPlace}` : ""}.`);
  return parts.length ? parts.join(" ").slice(0, NOTES_MAX) : null;
}

const WORDS: Record<string, string> = { ABT: "about", EST: "about", CAL: "about", BEF: "before", AFT: "after", BET: "between", AND: "and", FROM: "from", TO: "to" };

/** "ABT MAY 1920" -> "about May 1920": a GEDCOM date as words. */
export function looseDate(value: string): string {
  return value
    .replace(/@#D[A-Z ]+@\s*/g, "")
    .trim()
    .split(/\s+/)
    .map((w) => WORDS[w.toUpperCase()] ?? (MONTHS.includes(w.toUpperCase()) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// ── Matching ───────────────────────────────────────────────────────────────

/** The part of a name a match compares, as tree_name_key() does: the first
 * and last word, lower case, accents gone. Null for a blank name. */
export function treeNameKey(name: string | null | undefined): string | null {
  const words = (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]+|\s+/g, " ")
    .trim()
    .split(/ +/)
    .filter(Boolean);
  if (!words.length) return null;
  return words.length === 1 ? words[0] : `${words[0]} ${words[words.length - 1]}`;
}

export type OurPerson = { id: string; fullName: string; dob: string | null; fatherName: string | null; motherName: string | null };

/** Is somebody in the file somebody already on our tree? The rule "Is this
 * the same Stella?" uses: the same name, and either the same full birth
 * date (both recorded) or the same father's and mother's names (all four
 * recorded). Anything looser would merge two cousins who share a name. */
export function sameRelative(file: { fullName: string; dob: string | null; fatherName: string | null; motherName: string | null }, ours: OurPerson): boolean {
  const key = treeNameKey(file.fullName);
  if (!key || key !== treeNameKey(ours.fullName)) return false;
  if (file.dob && ours.dob && file.dob === ours.dob.slice(0, 10)) return true;
  const [ff, fm, of, om] = [file.fatherName, file.motherName, ours.fatherName, ours.motherName].map(treeNameKey);
  return !!(ff && fm && of && om && ff === of && fm === om);
}

/** For each person in the file, who they already are on our tree, if anyone.
 * One to one: a person of ours is matched at most once.
 *
 * First the "Is this the same Stella?" rule above. Then, as "Show their side"
 * draws a linked branch (matchBranch in lib/tree-merge.ts), outward from each
 * person matched: their father, mother and spouse in the file are the same
 * people as theirs on our tree when the names agree and the birth years do
 * not disagree. So importing a file twice adds nobody twice, even the
 * grandparents whose birth dates nobody knows. */
export function matchImport(people: GedcomPerson[], ours: (OurPerson & { fatherId?: string | null; motherId?: string | null; spouseId?: string | null })[]): Map<string, string> {
  const byRef = new Map(people.map((p) => [p.ref, p]));
  const oursById = new Map(ours.map((o) => [o.id, o]));
  const out = new Map<string, string>();
  const taken = new Set<string>();
  const queue: string[] = [];
  for (const p of people) {
    const view = { fullName: p.fullName, dob: p.dob, fatherName: byRef.get(p.fatherRef ?? "")?.fullName ?? null, motherName: byRef.get(p.motherRef ?? "")?.fullName ?? null };
    const hit = ours.find((o) => !taken.has(o.id) && sameRelative(view, o));
    if (hit) {
      out.set(p.ref, hit.id);
      taken.add(hit.id);
      queue.push(p.ref);
    }
  }
  const year = (p: { dob: string | null; birthText?: string | null }) => p.dob?.slice(0, 4) ?? gedcomYear(p.birthText ?? null);
  const pair = (ref: string | null, ourId: string | null | undefined) => {
    if (!ref || !ourId || out.has(ref) || taken.has(ourId)) return;
    const f = byRef.get(ref);
    const o = oursById.get(ourId);
    if (!f || !o) return;
    const key = treeNameKey(f.fullName);
    if (!key || key !== treeNameKey(o.fullName)) return;
    const [fy, oy] = [year(f), year(o)];
    if (fy && oy && fy !== oy) return;
    out.set(ref, ourId);
    taken.add(ourId);
    queue.push(ref);
  };
  while (queue.length) {
    const ref = queue.shift()!;
    const f = byRef.get(ref)!;
    const o = oursById.get(out.get(ref)!)!;
    pair(f.fatherRef, o.fatherId);
    pair(f.motherRef, o.motherId);
    pair(f.spouseRef, o.spouseId);
  }
  return out;
}

/** What the server is asked to write: the people to add, and how everybody
 * in the file links up -- each ref either a new person or one of ours. */
export type ImportPlan = {
  add: { ref: string; fullName: string; dob: string | null; notes: string | null; fatherRef: string | null; motherRef: string | null; spouseRef: string | null }[];
  /** File ref -> our person's id, for those already on the tree. */
  existing: Record<string, string>;
  /** Links onto people already on our tree, where ours has none recorded. */
  fill: { personId: string; fatherRef: string | null; motherRef: string | null; spouseRef: string | null }[];
};

/** The plan from the people chosen: `skip` are left out, `same` are already
 * on the tree as the matched person. A link to someone skipped is dropped.
 * Somebody already on the tree only gains a father, mother or spouse they
 * have none of -- the file fills gaps in our tree, it never overrules it. */
export function importPlan(people: GedcomPerson[], same: Map<string, string>, skip: Set<string>, ours: { id: string; fatherId: string | null; motherId: string | null; spouseId: string | null }[]): ImportPlan {
  const kept = people.filter((p) => !skip.has(p.ref));
  const keptRefs = new Set(kept.map((p) => p.ref));
  const link = (ref: string | null) => (ref && keptRefs.has(ref) ? ref : null);
  const oursById = new Map(ours.map((o) => [o.id, o]));
  const existing: Record<string, string> = {};
  const add: ImportPlan["add"] = [];
  const fill: ImportPlan["fill"] = [];
  for (const p of kept) {
    const ourId = same.get(p.ref);
    if (ourId) {
      existing[p.ref] = ourId;
      const o = oursById.get(ourId);
      const f = { personId: ourId, fatherRef: o?.fatherId ? null : link(p.fatherRef), motherRef: o?.motherId ? null : link(p.motherRef), spouseRef: o?.spouseId ? null : link(p.spouseRef) };
      if (f.fatherRef || f.motherRef || f.spouseRef) fill.push(f);
      continue;
    }
    add.push({ ref: p.ref, fullName: p.fullName || "Unnamed", dob: p.dob, notes: importNotes(p), fatherRef: link(p.fatherRef), motherRef: link(p.motherRef), spouseRef: link(p.spouseRef) });
  }
  // Two people of ours matched to the same pair would point at each other's
  // records; nothing links a person to themselves.
  for (const a of add) for (const k of ["fatherRef", "motherRef", "spouseRef"] as const) if (a[k] === a.ref) a[k] = null;
  return { add, existing, fill };
}

// ── Writing ────────────────────────────────────────────────────────────────

export type ExportPerson = {
  id: string;
  fullName: string;
  sex: "M" | "F" | null;
  /** YYYY-MM-DD, or only a year from a linked household's branch. */
  dob: string | null;
  birthYear: string | null;
  notes: string | null;
  fatherId: string | null;
  motherId: string | null;
  spouseId: string | null;
};

/** May this person be alive? No death in their notes, and born within
 * LIVING_YEARS -- or no birth year at all, which proves nothing. */
export function presumedLiving(p: { notes: string | null; dob: string | null; birthYear: string | null }, thisYear: number): boolean {
  if (p.notes && /(^|[.\n]\s*)(died|passed away)\b/i.test(p.notes)) return false;
  const year = Number((p.dob ?? p.birthYear ?? "").slice(0, 4));
  return !year || thisYear - year <= LIVING_YEARS;
}

/** "1975-05-03" -> "3 MAY 1975". */
export function gedcomDate(day: string): string {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** A value split to the 255-character line limit with CONC and newlines with CONT. */
function valueLines(level: number, tag: string, value: string): string[] {
  const out: string[] = [];
  value.split(/\r?\n/).forEach((para, i) => {
    const chunks = para.match(/[\s\S]{1,200}/g) ?? [""];
    chunks.forEach((c, j) => out.push(i === 0 && j === 0 ? `${level} ${tag} ${c}` : `${level + 1} ${j === 0 ? "CONT" : "CONC"} ${c}`));
  });
  return out.map((l) => l.trimEnd());
}

/** Kin keeps a name as one string, so the last word is taken as the
 * surname: "Juan Santos Reyes" -> "Juan Santos /Reyes/". */
function nameValue(full: string): string {
  const words = full.replace(/\//g, "").trim().split(/\s+/);
  if (words.length < 2) return `${words[0] ?? ""} //`.trim();
  return `${words.slice(0, -1).join(" ")} /${words[words.length - 1]}/`;
}

/** The tree as a GEDCOM 5.5.1 file. A father or mother who is not on the
 * list is left out; a couple is a family whether or not they have children. */
export function buildGedcom(people: ExportPerson[], opts: { household: string; today: string }): string {
  const thisYear = Number(opts.today.slice(0, 4));
  const ids = new Map(people.map((p, i) => [p.id, `@I${i + 1}@`]));
  const known = (id: string | null) => (id && ids.has(id) ? id : null);

  // One family per couple: parents of a child, or two people married to each other.
  const fams = new Map<string, { ref: string; husb: string | null; wife: string | null; kids: string[] }>();
  const famOf = (a: string | null, b: string | null, sexA: "M" | "F" | null) => {
    if (!a && !b) return null;
    const [husb, wife] = sexA === "F" ? [b, a] : [a, b];
    const key = `${husb ?? ""}|${wife ?? ""}`;
    const alt = `${wife ?? ""}|${husb ?? ""}`;
    const found = fams.get(key) ?? fams.get(alt);
    if (found) return found;
    const fam = { ref: `@F${fams.size + 1}@`, husb, wife, kids: [] as string[] };
    fams.set(key, fam);
    return fam;
  };
  const sexOf = (p: ExportPerson): "M" | "F" | null => p.sex ?? (people.some((c) => c.fatherId === p.id) ? "M" : people.some((c) => c.motherId === p.id) ? "F" : null);
  for (const p of people) {
    const [f, m] = [known(p.fatherId), known(p.motherId)];
    if (f || m) famOf(f, m, "M")!.kids.push(p.id);
  }
  for (const p of people) {
    const s = known(p.spouseId);
    if (s) famOf(p.id, s, sexOf(p));
  }

  const lines = [
    "0 HEAD",
    "1 SOUR KIN",
    "2 NAME Kin",
    "1 DEST ANY",
    `1 DATE ${gedcomDate(opts.today)}`,
    "1 SUBM @SUB1@",
    "1 GEDC",
    "2 VERS 5.5.1",
    "2 FORM LINEAGE-LINKED",
    "1 CHAR UTF-8",
    "0 @SUB1@ SUBM",
    ...valueLines(1, "NAME", opts.household.slice(0, 60) || "Kin"),
  ];
  const famList = [...fams.values()];
  for (const p of people) {
    const living = presumedLiving(p, thisYear);
    lines.push(`0 ${ids.get(p.id)} INDI`, ...valueLines(1, "NAME", nameValue(p.fullName || "Unnamed")));
    const sex = sexOf(p);
    if (sex) lines.push(`1 SEX ${sex}`);
    // A living person's birth is a year at most; the full day stays in Kin.
    const year = (p.dob ?? p.birthYear ?? "").slice(0, 4);
    if (p.dob && !living) lines.push("1 BIRT", `2 DATE ${gedcomDate(p.dob)}`);
    else if (/^\d{4}$/.test(year)) lines.push("1 BIRT", `2 DATE ${year}`);
    if (!living) {
      if (p.notes && /(^|[.\n]\s*)(died|passed away)\b/i.test(p.notes)) lines.push("1 DEAT Y");
      if (p.notes) lines.push(...valueLines(1, "NOTE", p.notes));
    }
    for (const f of famList) if (f.kids.includes(p.id)) lines.push(`1 FAMC ${f.ref}`);
    for (const f of famList) if (f.husb === p.id || f.wife === p.id) lines.push(`1 FAMS ${f.ref}`);
  }
  for (const f of famList) {
    lines.push(`0 ${f.ref} FAM`);
    if (f.husb) lines.push(`1 HUSB ${ids.get(f.husb)}`);
    if (f.wife) lines.push(`1 WIFE ${ids.get(f.wife)}`);
    for (const k of f.kids) lines.push(`1 CHIL ${ids.get(k)}`);
  }
  lines.push("0 TRLR");
  return `${lines.join("\r\n")}\r\n`;
}

/** "Santos family tree.ged" */
export function gedcomFileName(household: string): string {
  return `${household.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Kin"} family tree.ged`;
}
