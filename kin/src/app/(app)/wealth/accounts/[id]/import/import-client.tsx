"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Blueprint, Tag } from "@/components/ui";
import { ErrorText } from "@/components/form";
import { formatCurrency } from "@/lib/format";
import { importStatementAction } from "@/lib/actions/statement-import";
import { mapStatementTextAction } from "@/lib/actions/statement-ai";
import { KIN_AI_PRIVACY } from "@/lib/kin-ai";
import {
  BANKS,
  MAX_STATEMENT_BYTES,
  MAX_STATEMENT_ROWS,
  guessMapping,
  markDuplicates,
  parseCsv,
  readRows,
  type Bank,
  type DateFormat,
  type ExistingMovement,
  type Mapping,
  type ParsedRow,
} from "@/lib/statement-import";

const label = { display: "block", fontSize: "0.71875rem", color: "var(--color-neutral-600)", marginBottom: "0.1875rem", marginTop: "0.5rem" } as const;
const field = { minHeight: "2.5rem", fontSize: "0.8125rem" } as const;
const small = { minHeight: "2.25rem", fontSize: "0.8125rem", padding: "0 0.75rem" } as const;

type Step = "pick" | "map" | "review" | "done";

/** Pick a file → check the columns → review the lines → save. Everything
 * before the save happens in this browser tab; the file is read with
 * FileReader and dropped when the tab is. */
export function StatementImporter({ accountId, existing, currency, aiReady }: { accountId: string; existing: ExistingMovement[]; currency: string; aiReady: boolean }) {
  const [step, setStep] = useState<Step>("pick");
  const [bank, setBank] = useState<Bank>("bpi");
  const [table, setTable] = useState<string[][]>([]);
  const [map, setMap] = useState<Mapping | null>(null);
  const [ticked, setTicked] = useState<boolean[]>([]);
  // A PDF's rows come from Kin AI rather than from a column mapping (#679).
  // The PDF is read on this device (lib/pdf-text.ts); only its text lines
  // are sent. GCash's PDF needs the password from GCash's email, asked for
  // here and never sent anywhere.
  const [pdfRows, setPdfRows] = useState<ParsedRow[] | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const uid = useId();

  const rows = useMemo(() => pdfRows ?? (map ? readRows(table, map) : []), [pdfRows, table, map]);
  const dup = useMemo(() => markDuplicates(rows, existing), [rows, existing]);
  const howTo = BANKS.find((b) => b.value === bank)!.howTo;

  const onFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      if (!aiReady) {
        setError("That is a PDF. Reading a PDF statement needs Kin AI, which isn't switched on yet — a CSV, where your bank offers one, imports without it.");
        return;
      }
      if (file.size > MAX_STATEMENT_BYTES * 5) {
        setError("That PDF is bigger than 10 MB. Download a shorter period.");
        return;
      }
      setPdfFile(file);
      setNeedsPassword(false);
      setPassword("");
      void readPdf(file, "");
      return;
    }
    if (file.size > MAX_STATEMENT_BYTES) {
      setError("That file is bigger than 2 MB. Download a shorter period.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPdfRows(null);
      const parsed = parseCsv(String(reader.result ?? ""));
      if (parsed.length < 2) {
        setError("That file has no lines Kin can read. Is it a CSV?");
        return;
      }
      setTable(parsed);
      setMap(guessMapping(parsed));
      setStep("map");
    };
    reader.onerror = () => setError("That file could not be read.");
    reader.readAsText(file);
  };

  const readPdf = async (file: File, pw: string) => {
    setError(null);
    setReading(true);
    try {
      const { pdfTextLines } = await import("@/lib/pdf-text");
      const read = await pdfTextLines(file, pw);
      if (!read.ok) {
        if (read.reason === "password") setNeedsPassword(true);
        else if (read.reason === "wrong-password") {
          setNeedsPassword(true);
          setError("That password didn't open it. GCash's is in the email that brought the PDF.");
        } else setError("That PDF could not be read. If it is a scan of a printout, Kin cannot read it yet.");
        return;
      }
      const r = await mapStatementTextAction(read.lines, BANKS.find((b) => b.value === bank)?.label ?? "bank");
      if (r.error) {
        setError(r.error);
        return;
      }
      const already = markDuplicates(r.rows, existing);
      setPdfRows(r.rows);
      setMap(null);
      setTicked(r.rows.map((row, i) => !row.problem && !already[i]));
      setNeedsPassword(false);
      setPdfFile(null);
      setStep("review");
    } finally {
      setReading(false);
    }
  };

  const toReview = () => {
    if (!map) return;
    if (map.amount === null && map.debit === null && map.credit === null) {
      setError("Choose the amount column, or the debit and credit columns.");
      return;
    }
    setError(null);
    const read = readRows(table, map);
    const already = markDuplicates(read, existing);
    setTicked(read.map((r, i) => !r.problem && !already[i]));
    setStep("review");
  };

  const chosen = rows.filter((r, i) => ticked[i] && !r.problem);
  const totals = chosen.reduce((t, r) => (r.direction === "in" ? { ...t, in: t.in + r.amount! } : { ...t, out: t.out + r.amount! }), { in: 0, out: 0 });

  const save = () => {
    setError(null);
    if (chosen.length > MAX_STATEMENT_ROWS) {
      setError(`Import up to ${MAX_STATEMENT_ROWS} lines at a time.`);
      return;
    }
    startTransition(async () => {
      const r = await importStatementAction(
        accountId,
        chosen.map((c) => ({ date: c.date!, direction: c.direction!, amount: c.amount!, particulars: c.particulars })),
      );
      if (r.error) setError(r.error);
      else {
        setResult({ imported: r.imported ?? 0, skipped: r.skipped ?? 0 });
        setTable([]);
        setStep("done");
        router.refresh();
      }
    });
  };

  if (step === "done" && result) {
    return (
      <Blueprint style={{ padding: "1rem" }}>
        <div style={{ font: "600 1.125rem/1.2 var(--font-heading)" }}>
          {result.imported} line{result.imported === 1 ? "" : "s"} imported
        </div>
        {result.skipped > 0 && <p style={{ fontSize: "0.84375rem", margin: "0.375rem 0 0" }}>{result.skipped} were already in the account and were left out.</p>}
        <Link href={`/wealth/accounts/${accountId}`} className="btn btn-primary" style={{ ...small, marginTop: "0.75rem" }}>
          Back to the account
        </Link>
      </Blueprint>
    );
  }

  return (
    <div>
      <ErrorText message={error} />

      {step === "pick" && (
        <Blueprint style={{ padding: "0.875rem" }}>
          <label htmlFor={`${uid}-bank`} style={{ ...label, marginTop: 0 }}>Whose statement</label>
          <select id={`${uid}-bank`} className="input" value={bank} onChange={(e) => setBank(e.target.value as Bank)} style={field}>
            {BANKS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
          <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", lineHeight: 1.45, margin: "0.5rem 0" }}>{howTo}</p>
          <label htmlFor={`${uid}-file`} style={label}>The CSV or PDF file</label>
          <input id={`${uid}-file`} type="file" accept=".csv,text/csv,.txt,application/pdf,.pdf" className="input" onChange={(e) => onFile(e.target.files?.[0])} disabled={reading} style={{ ...field, padding: "0.5rem" }} />
          {reading && <p style={{ fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>Reading the PDF…</p>}
          {needsPassword && pdfFile && (
            <div style={{ marginTop: "0.5rem" }}>
              <label htmlFor={`${uid}-pw`} style={label}>The PDF&rsquo;s password</label>
              <div style={{ display: "flex", gap: "0.375rem" }}>
                <input id={`${uid}-pw`} type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" style={{ ...field, flex: 1 }} />
                <button type="button" className="btn btn-primary" style={small} disabled={reading || !password} onClick={() => void readPdf(pdfFile, password)}>
                  Open
                </button>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.375rem 0 0" }}>Used on this phone to open the file, then forgotten. It is not sent to Kin.</p>
            </div>
          )}
          <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.5rem 0 0", lineHeight: 1.45 }}>
            A CSV is read entirely on this device. A PDF is read on this device too, and its text lines go to Kin AI to sort into rows (Kin Plus). {KIN_AI_PRIVACY}
          </p>
        </Blueprint>
      )}

      {step === "map" && map && !pdfRows && (
        <MapStep table={table} map={map} onChange={setMap} onBack={() => setStep("pick")} onNext={toReview} currency={currency} />
      )}

      {step === "review" && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "baseline", marginBottom: "0.625rem" }}>
            <span style={{ fontWeight: 600 }}>
              {chosen.length} of {rows.length} line{rows.length === 1 ? "" : "s"} ticked
            </span>
            <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
              in {formatCurrency(totals.in, currency)} · out {formatCurrency(totals.out, currency)}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "0.75rem" }}>
            {rows.map((r, i) => (
              <label
                key={r.line}
                style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.4375rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)", opacity: r.problem ? 0.6 : 1 }}
              >
                <input type="checkbox" checked={!!ticked[i] && !r.problem} disabled={!!r.problem} onChange={(e) => setTicked((t) => t.map((v, j) => (j === i ? e.target.checked : v)))} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "0.84375rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.particulars || "—"}</span>
                  <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
                    {r.date ?? `Line ${r.line}`}
                    {r.problem ? ` · ${r.problem} Left out.` : ""}
                  </span>
                </span>
                {dup[i] && <Tag variant="outline">ALREADY IN</Tag>}
                {r.amount !== null && (
                  <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.84375rem", fontWeight: 600, color: r.direction === "in" ? "var(--color-accent-700)" : undefined }}>
                    {r.direction === "in" ? "+" : "−"}
                    {formatCurrency(r.amount, currency)}
                  </span>
                )}
              </label>
            ))}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0 0 0.625rem" }}>
            Already in: the account has a movement that day, the same way, for the same amount and description. Those stay unticked, and are skipped again on saving.
          </p>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            <button type="button" className="btn btn-secondary" style={small} onClick={() => (pdfRows ? (setPdfRows(null), setStep("pick")) : setStep("map"))} disabled={pending}>
              {pdfRows ? "Another file" : "Back"}
            </button>
            <button type="button" className="btn btn-primary" style={small} onClick={save} disabled={pending || chosen.length === 0}>
              {pending ? "…" : `Import ${chosen.length} line${chosen.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MapStep({ table, map, onChange, onBack, onNext, currency }: { table: string[][]; map: Mapping; onChange: (m: Mapping) => void; onBack: () => void; onNext: () => void; currency: string }) {
  const uid = useId();
  const head = table[map.headerRow] ?? [];
  const width = Math.max(...table.slice(map.headerRow, map.headerRow + 6).map((r) => r.length), head.length);
  const columns = Array.from({ length: width }, (_, i) => ({ value: i, label: head[i] ? `${head[i]}` : `Column ${i + 1}` }));
  const preview = readRows(table, map).slice(0, 5);
  const single = map.amount !== null;

  const pick = (key: "date" | "description" | "amount" | "debit" | "credit", text: string, optional = false) => (
    <span>
      <label htmlFor={`${uid}-${key}`} style={label}>{text}</label>
      <select
        id={`${uid}-${key}`}
        className="input"
        value={map[key] === null ? "" : String(map[key])}
        onChange={(e) => onChange({ ...map, [key]: e.target.value === "" ? null : Number(e.target.value) })}
        style={field}
      >
        {optional && <option value="">—</option>}
        {columns.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    </span>
  );

  return (
    <Blueprint style={{ padding: "0.875rem" }}>
      <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Check the columns</div>
      <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: 0 }}>Kin guessed these from the file&rsquo;s header. Change any that are wrong; the preview follows.</p>
      <label htmlFor={`${uid}-header`} style={label}>Header row</label>
      <select id={`${uid}-header`} className="input" value={map.headerRow} onChange={(e) => onChange(guessMapping(table, Number(e.target.value)))} style={field}>
        {table.slice(0, 30).map((r, i) => (
          <option key={i} value={i}>
            Line {i + 1}: {r.slice(0, 4).join(" · ").slice(0, 60)}
          </option>
        ))}
      </select>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0 0.5rem" }}>
        {pick("date", "Date")}
        <span>
          <label htmlFor={`${uid}-fmt`} style={label}>Dates are written</label>
          <select id={`${uid}-fmt`} className="input" value={map.dateFormat} onChange={(e) => onChange({ ...map, dateFormat: e.target.value as DateFormat })} style={field}>
            <option value="mdy">Month first (10/19/2026)</option>
            <option value="dmy">Day first (19/10/2026)</option>
            <option value="ymd">Year first (2026-10-19)</option>
          </select>
        </span>
        {pick("description", "Description")}
        <span>
          <label htmlFor={`${uid}-shape`} style={label}>Money is in</label>
          <select
            id={`${uid}-shape`}
            className="input"
            value={single ? "one" : "two"}
            onChange={(e) => onChange(e.target.value === "one" ? { ...map, amount: map.debit ?? map.credit ?? 0, debit: null, credit: null } : { ...map, amount: null, debit: map.amount ?? 0, credit: null })}
            style={field}
          >
            <option value="two">Debit and credit columns</option>
            <option value="one">One amount column (minus is out)</option>
          </select>
        </span>
        {single ? pick("amount", "Amount") : (
          <>
            {pick("debit", "Debit (money out)", true)}
            {pick("credit", "Credit (money in)", true)}
          </>
        )}
      </div>

      <div className="kin-eyebrow" style={{ margin: "0.875rem 0 0.375rem" }}>PREVIEW</div>
      {preview.length === 0 ? (
        <p style={{ fontSize: "0.8125rem", margin: 0 }}>No lines under that header.</p>
      ) : (
        preview.map((r) => (
          <div key={r.line} style={{ display: "flex", gap: "0.5rem", fontSize: "0.8125rem", padding: "0.25rem 0" }}>
            <span style={{ width: 88, flex: "none", color: r.date ? undefined : "var(--cal-occasion)" }}>{r.date ?? "date?"}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.particulars || "—"}</span>
            <span style={{ fontFamily: "var(--font-numeric)", color: r.problem ? "var(--cal-occasion)" : undefined }}>
              {r.amount !== null ? `${r.direction === "in" ? "+" : "−"}${formatCurrency(r.amount, currency)}` : "?"}
            </span>
          </div>
        ))
      )}

      <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.75rem" }}>
        <button type="button" className="btn btn-secondary" style={small} onClick={onBack}>
          Another file
        </button>
        <button type="button" className="btn btn-primary" style={small} onClick={onNext}>
          Review the lines
        </button>
      </div>
    </Blueprint>
  );
}
