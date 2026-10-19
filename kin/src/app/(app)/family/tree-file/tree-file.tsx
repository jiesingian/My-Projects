"use client";

import Link from "next/link";
import { useState } from "react";
import { exportGedcomAction, importGedcomAction } from "@/lib/actions/gedcom";
import { IMPORT_MAX, importPlan, looseDate, matchImport, parseGedcom, type GedcomPerson, type OurPerson } from "@/lib/gedcom";
import { readableDay } from "@/lib/time";
import { shareOrDownload } from "@/lib/share-file";

type Ours = OurPerson & { fatherId: string | null; motherId: string | null; spouseId: string | null };

/** Export in one tap; import as: choose the file, look at who is in it and
 * who is already on the tree, untick anyone, then add. Nothing is written
 * before that last tap. */
export function TreeFile({ ours }: { ours: Ours[] }) {
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; source: string | null; people: GedcomPerson[] } | null>(null);
  const [same, setSame] = useState<Map<string, string>>(new Map());
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ourName = new Map(ours.map((o) => [o.id, o.fullName]));
  const byRef = new Map((file?.people ?? []).map((p) => [p.ref, p]));
  const chosen = (file?.people ?? []).filter((p) => !skip.has(p.ref));
  const newCount = chosen.filter((p) => !same.has(p.ref)).length;
  const knownCount = chosen.length - newCount;

  const exportTree = async () => {
    setExporting(true);
    setExported(null);
    setError(null);
    const r = await exportGedcomAction();
    setExporting(false);
    if (r.error || !r.file || !r.name) return setError(r.error ?? "The file could not be made.");
    const how = await shareOrDownload(new File([r.file], r.name, { type: "text/plain" }), { title: r.name });
    setExported(how === "shared" ? "Shared." : `Saved as “${r.name}”.`);
  };

  const choose = async (f: File | undefined) => {
    setError(null);
    setDone(null);
    setFile(null);
    if (!f) return;
    const text = await f.text();
    const parsed = parseGedcom(text);
    if (!parsed.people.length) return setError("No people were found in that file. Is it a GEDCOM (.ged) file?");
    if (parsed.people.length > IMPORT_MAX) return setError(`That file has ${parsed.people.length} people. Kin takes up to ${IMPORT_MAX} at a time: export a smaller branch from the site it came from.`);
    setFile({ name: f.name, source: parsed.source, people: parsed.people });
    setSame(matchImport(parsed.people, ours));
    setSkip(new Set());
  };

  const toggle = (ref: string) =>
    setSkip((s) => {
      const next = new Set(s);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  const notSame = (ref: string) =>
    setSame((m) => {
      const next = new Map(m);
      next.delete(ref);
      return next;
    });

  const add = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const r = await importGedcomAction(importPlan(file.people, same, skip, ours));
    setBusy(false);
    if (r.error) return setError(r.error);
    setFile(null);
    const linked = r.linked ? `, and ${r.linked} ${r.linked === 1 ? "link" : "links"} to people already there` : "";
    setDone(`Added ${r.added} ${r.added === 1 ? "person" : "people"} to the tree${linked}.`);
  };

  const born = (p: GedcomPerson) => (p.dob ? readableDay(p.dob, { year: true }) : p.birthText ? looseDate(p.birthText) : null);

  return (
    <div className="kin-treefile">
      <section>
        <h4>Export</h4>
        <p>
          The household&apos;s tree, and the linked households&apos; sides you can already see. Anyone who may be alive goes out as a name and a birth year only; their full birthday and notes stay in Kin.
        </p>
        <button type="button" className="btn btn-secondary" onClick={exportTree} disabled={exporting}>
          {exporting ? "Making the file…" : "Download the tree file"}
        </button>
        {exported && <p role="status">{exported}</p>}
      </section>

      <section>
        <h4>Import</h4>
        <p>Choose a .ged file. You&apos;ll see who is in it, and who is already on your tree, before anything is added.</p>
        <label className="btn btn-secondary kin-treefile-pick">
          Choose a file
          <input type="file" accept=".ged,.gedcom,text/plain" onChange={(e) => choose(e.target.files?.[0])} />
        </label>

        {file && (
          <>
            <p style={{ marginTop: "0.875rem" }}>
              <strong>{file.name}</strong>
              {file.source ? ` · from ${file.source}` : ""} · {file.people.length} {file.people.length === 1 ? "person" : "people"}. {newCount} to add, {knownCount} already on your tree. Untick anyone who should stay out.
            </p>
            <ul className="kin-treefile-list">
              {file.people.map((p) => {
                const ourId = same.get(p.ref);
                const father = byRef.get(p.fatherRef ?? "")?.fullName;
                const mother = byRef.get(p.motherRef ?? "")?.fullName;
                const when = born(p);
                return (
                  <li key={p.ref} data-skipped={skip.has(p.ref)}>
                    <label>
                      <input type="checkbox" checked={!skip.has(p.ref)} onChange={() => toggle(p.ref)} />
                      <span>
                        <span className="kin-treefile-name">{p.fullName || "Unnamed"}</span>
                        <span className="kin-treefile-meta">
                          {[when ? `Born ${when}` : null, p.died ? "Died" : null, father || mother ? `Child of ${[father, mother].filter(Boolean).join(" and ")}` : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </label>
                    {ourId ? (
                      <span className="kin-treefile-same">
                        Already on your tree as {ourName.get(ourId)}.{" "}
                        <button type="button" onClick={() => notSame(p.ref)}>
                          Not the same person
                        </button>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn btn-primary" style={{ marginTop: "0.875rem" }} onClick={add} disabled={busy || chosen.length === 0}>
              {busy ? "Adding…" : newCount ? `Add ${newCount} ${newCount === 1 ? "person" : "people"} to the tree` : "Link them on the tree"}
            </button>
          </>
        )}
        {done && (
          <p role="status">
            {done} <Link href="/family?seg=tree">See the tree</Link>
          </p>
        )}
      </section>
      {error && (
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
