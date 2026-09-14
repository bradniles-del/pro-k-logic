import { useState, type ReactNode } from "react";
import { deleteReleaseLine, insertReleaseLines, updateReleaseLine, type ReleaseLine } from "../../lib/api";
import { downloadCsv, toCsv } from "../../lib/csv";
import { ProvenanceBadge } from "../ui";

type Draft = { line_no: string; piece_mark: string; description: string; qty: string; uom: string };

function toDraft(l: ReleaseLine): Draft {
  return {
    line_no: String(l.line_no),
    piece_mark: l.piece_mark ?? "",
    description: l.description,
    qty: String(l.qty),
    uom: l.uom,
  };
}

const EMPTY: Draft = { line_no: "", piece_mark: "", description: "", qty: "1", uom: "ea" };

/** Editable release lines: add, inline edit, delete, CSV export. */
export default function LinesTable({
  releaseId,
  releaseNumber,
  lines,
  onChanged,
}: {
  releaseId: string;
  releaseNumber: string;
  lines: ReleaseLine[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextLineNo = lines.reduce((m, l) => Math.max(m, l.line_no), 0) + 1;

  function parse(d: Draft): { line_no: number; piece_mark: string | null; description: string; qty: number; uom: string } {
    const line_no = d.line_no.trim() === "" ? nextLineNo : Number(d.line_no);
    const qty = d.qty.trim() === "" ? 1 : Number(d.qty);
    if (!Number.isInteger(line_no) || line_no <= 0) throw new Error("Line number must be a positive whole number.");
    if (!Number.isFinite(qty)) throw new Error("Quantity must be a number.");
    if (!d.description.trim()) throw new Error("Description is required.");
    return {
      line_no,
      piece_mark: d.piece_mark.trim() || null,
      description: d.description.trim(),
      qty,
      uom: d.uom.trim() || "ea",
    };
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setError(null);
    try {
      await updateReleaseLine(id, parse(draft));
      await onChanged();
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveNew() {
    setBusy(true);
    setError(null);
    try {
      await insertReleaseLines(releaseId, [{ ...parse(draft), provenance: "manual" }]);
      await onChanged();
      setDraft({ ...EMPTY, line_no: "" });
      setAdding(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(l: ReleaseLine) {
    if (!window.confirm(`Delete line ${l.line_no} (${l.description})?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteReleaseLine(l.id);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const csv = toCsv(
      ["line_no", "piece_mark", "description", "qty", "uom", "provenance", "source_page", "confirmed_at"],
      lines.map((l) => [l.line_no, l.piece_mark, l.description, l.qty, l.uom, l.provenance, l.source_page, l.confirmed_at]),
    );
    downloadCsv(`srn-${releaseNumber}-lines.csv`, csv);
  }

  const editorRow = (onSave: () => void, onCancel: () => void) => (
    <tr className="editing">
      <td className="num">
        <input className="cell num" inputMode="numeric" value={draft.line_no} placeholder={String(nextLineNo)} onChange={(e) => setDraft({ ...draft, line_no: e.target.value })} />
      </td>
      <td>
        <input className="cell" value={draft.piece_mark} onChange={(e) => setDraft({ ...draft, piece_mark: e.target.value })} />
      </td>
      <td>
        <input
          className="cell wide"
          value={draft.description}
          autoFocus
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
        />
      </td>
      <td className="num">
        <input className="cell num" inputMode="decimal" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
      </td>
      <td>
        <input className="cell short" value={draft.uom} onChange={(e) => setDraft({ ...draft, uom: e.target.value })} />
      </td>
      <td></td>
      <td className="actions">
        <button className="btn small primary" onClick={onSave} disabled={busy}>
          Save
        </button>
        <button className="btn small" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </td>
    </tr>
  );

  return (
    <section className="section">
      <div className="section-head">
        <h2>Lines ({lines.length})</h2>
        <div className="row">
          <button className="btn small" onClick={exportCsv} disabled={lines.length === 0}>
            Download CSV
          </button>
          <button
            className="btn small primary"
            onClick={() => {
              setEditing(null);
              setDraft({ ...EMPTY });
              setAdding(true);
            }}
            disabled={adding}
          >
            Add line
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {lines.length === 0 && !adding && (
        <p className="muted">No lines yet. Add them by hand or extract them from an uploaded packing list.</p>
      )}
      {(lines.length > 0 || adding) && (
        <div className="table-wrap">
          <table className="editable">
            <thead>
              <tr>
                <th className="num">Line</th>
                <th>Piece mark</th>
                <th>Description</th>
                <th className="num">Qty</th>
                <th>UOM</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) =>
                editing === l.id ? (
                  <LineEditor key={l.id}>{editorRow(() => saveEdit(l.id), () => setEditing(null))}</LineEditor>
                ) : (
                  <tr key={l.id}>
                    <td className="num">{l.line_no}</td>
                    <td>{l.piece_mark ?? ""}</td>
                    <td title={l.raw_text ?? undefined}>{l.description}</td>
                    <td className="num">{l.qty}</td>
                    <td>{l.uom}</td>
                    <td>
                      <ProvenanceBadge value={l.provenance} />
                      {l.source_page ? <span className="muted small"> p.{l.source_page}</span> : null}
                    </td>
                    <td className="actions">
                      <button
                        className="btn small"
                        onClick={() => {
                          setAdding(false);
                          setEditing(l.id);
                          setDraft(toDraft(l));
                        }}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button className="btn small danger" onClick={() => remove(l)} disabled={busy}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {adding && <LineEditor>{editorRow(saveNew, () => setAdding(false))}</LineEditor>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Fragment wrapper so an editor row can carry a key inside the map. */
function LineEditor({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
