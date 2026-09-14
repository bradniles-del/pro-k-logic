import { useMemo, useState } from "react";
import { useAuth } from "../AuthGate";
import {
  insertReleaseLines,
  parseCandidates,
  type Candidate,
  type Document,
  type ExtractionJob,
  type ReleaseLine,
  type ReleaseLineInput,
} from "../../lib/api";
import { candidatesToCsv, type BomCandidate } from "@prok/shared";
import { downloadCsv } from "../../lib/csv";
import { ConfidenceChip } from "../ui";

type EditableCandidate = Candidate & { key: number; selected: boolean; line_no_text: string; qty_text: string };

/**
 * Inline review of an extraction job's candidates. Nothing becomes a line
 * until a person ticks it and confirms; edits here are applied to the
 * inserted lines, not written back to the job.
 */
export default function ExtractionReview({
  job,
  document,
  existingLines,
  releaseId,
  onClose,
  onConfirmed,
}: {
  job: ExtractionJob;
  document: Document | null;
  existingLines: ReleaseLine[];
  releaseId: string;
  onClose: () => void;
  onConfirmed: () => Promise<void>;
}) {
  const { user } = useAuth();
  const initial = useMemo<EditableCandidate[]>(
    () =>
      parseCandidates(job.candidates).map((c, i) => ({
        ...c,
        key: i,
        selected: c.confidence >= 0.5,
        line_no_text: c.line_no === null ? "" : String(c.line_no),
        qty_text: c.qty === null ? "" : String(c.qty),
      })),
    [job.candidates],
  );
  const [rows, setRows] = useState<EditableCandidate[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const selectedCount = rows.filter((r) => r.selected).length;

  function patch(key: number, p: Partial<EditableCandidate>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...p };
        if (p.line_no_text !== undefined) {
          const n = Number(p.line_no_text);
          next.line_no = p.line_no_text.trim() === "" || !Number.isFinite(n) ? null : n;
        }
        if (p.qty_text !== undefined) {
          const n = Number(p.qty_text);
          next.qty = p.qty_text.trim() === "" || !Number.isFinite(n) ? null : n;
        }
        return next;
      }),
    );
  }

  function setAll(selected: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, selected })));
  }

  /** Assign line numbers: keep a candidate's own if free, else next after max. */
  function buildInserts(): ReleaseLineInput[] {
    const used = new Set(existingLines.map((l) => l.line_no));
    let next = existingLines.reduce((m, l) => Math.max(m, l.line_no), 0) + 1;
    const out: ReleaseLineInput[] = [];
    for (const r of rows) {
      if (!r.selected) continue;
      const desc = r.description.trim();
      if (!desc) continue;
      let lineNo = r.line_no !== null && Number.isInteger(r.line_no) && r.line_no > 0 ? r.line_no : null;
      if (lineNo === null || used.has(lineNo)) {
        while (used.has(next)) next++;
        lineNo = next;
      }
      used.add(lineNo);
      out.push({
        line_no: lineNo,
        description: desc,
        qty: r.qty ?? 1,
        uom: (r.uom ?? "ea").trim() || "ea",
        piece_mark: r.piece_mark?.trim() || null,
        provenance: "extracted",
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        source_page: r.page,
        raw_text: r.raw,
      });
    }
    return out;
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const inserts = buildInserts();
      if (inserts.length === 0) throw new Error("Nothing selected (or selected rows have no description).");
      await insertReleaseLines(releaseId, inserts);
      await onConfirmed();
      setDone(inserts.length);
      setRows((prev) => prev.filter((r) => !r.selected));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function downloadCandidates() {
    // Shared RFC 4180 writer from @prok/shared (same format the edge function uses).
    const bom: BomCandidate[] = rows.map((r) => ({
      line_no: r.line_no,
      description: r.description,
      qty: r.qty,
      uom: r.uom,
      piece_mark: r.piece_mark,
      page: r.page ?? 0,
      raw: r.raw ?? "",
      confidence: r.confidence,
    }));
    downloadCsv(`extraction-${job.id.slice(0, 8)}.csv`, candidatesToCsv(bom));
  }

  return (
    <div className="panel">
      <div className="section-head">
        <div>
          <h3>Extraction review</h3>
          <div className="muted small">
            {document?.filename ?? "document"} · {job.method ?? "unknown method"}
            {job.pages ? ` · ${job.pages} pages` : ""} · {rows.length} candidates
          </div>
        </div>
        <div className="row">
          <button className="btn small" onClick={downloadCandidates} disabled={rows.length === 0}>
            Download CSV
          </button>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {done !== null && <p className="ok">Added {done} line{done === 1 ? "" : "s"} to this SRN.</p>}
      {error && <p className="error">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted">No candidates left to review.</p>
      ) : (
        <>
          <div className="row">
            <button className="btn small" onClick={() => setAll(true)}>
              Select all
            </button>
            <button className="btn small" onClick={() => setAll(false)}>
              Select none
            </button>
            <span className="muted small">Pre-checked when confidence is at least 50%. Edit any cell before confirming.</span>
          </div>
          <div className="table-wrap">
            <table className="editable">
              <thead>
                <tr>
                  <th></th>
                  <th className="num">Line</th>
                  <th>Piece mark</th>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th>UOM</th>
                  <th className="num">Page</th>
                  <th>Conf.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={r.selected ? "" : "dim"} title={r.raw ?? undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) => patch(r.key, { selected: e.target.checked })}
                        aria-label="Include"
                      />
                    </td>
                    <td className="num">
                      <input
                        className="cell num"
                        inputMode="numeric"
                        value={r.line_no_text}
                        onChange={(e) => patch(r.key, { line_no_text: e.target.value })}
                      />
                    </td>
                    <td>
                      <input className="cell" value={r.piece_mark ?? ""} onChange={(e) => patch(r.key, { piece_mark: e.target.value })} />
                    </td>
                    <td>
                      <input className="cell wide" value={r.description} onChange={(e) => patch(r.key, { description: e.target.value })} />
                    </td>
                    <td className="num">
                      <input
                        className="cell num"
                        inputMode="decimal"
                        value={r.qty_text}
                        onChange={(e) => patch(r.key, { qty_text: e.target.value })}
                      />
                    </td>
                    <td>
                      <input className="cell short" value={r.uom ?? ""} onChange={(e) => patch(r.key, { uom: e.target.value })} />
                    </td>
                    <td className="num">{r.page ?? ""}</td>
                    <td>
                      <ConfidenceChip value={r.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn primary" onClick={confirm} disabled={busy || selectedCount === 0}>
              {busy ? "Adding..." : `Confirm selected (${selectedCount}) → add as lines`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
