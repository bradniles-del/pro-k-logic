import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthGate";
import {
  createUnits,
  listUnitsForRelease,
  renderUnitLabels,
  type HandlingUnit,
  type LabelFormat,
  type NewUnitSpec,
  type ReleaseLine,
} from "../../lib/api";
import { Dialog, StatusChip } from "../ui";

const UNIT_KINDS = ["crate", "bundle", "skid", "spool", "piece", "module", "other"];
type Mode = "per_line" | "single" | "n";

export default function UnitsPanel({
  projectId,
  releaseId,
  lines,
}: {
  projectId: string;
  releaseId: string;
  lines: ReleaseLine[];
}) {
  const { user } = useAuth();
  const [units, setUnits] = useState<HandlingUnit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<LabelFormat>("thermal-4x6");
  const [labels, setLabels] = useState<{ busy: boolean; url?: string; error?: string }>({ busy: false });
  const [showGen, setShowGen] = useState(false);

  const reload = useCallback(async () => {
    setUnits(await listUnitsForRelease(releaseId));
  }, [releaseId]);

  useEffect(() => {
    reload().catch((e: Error) => setError(e.message));
  }, [reload]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!units) return;
    setSelected((prev) => (prev.size === units.length ? new Set() : new Set(units.map((u) => u.id))));
  }

  async function printLabels() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setLabels({ busy: true });
    try {
      const res = await renderUnitLabels(ids, format);
      setLabels({ busy: false, url: res.url });
      window.open(res.url, "_blank", "noopener");
    } catch (e) {
      setLabels({ busy: false, error: (e as Error).message });
    }
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>Handling units ({units?.length ?? 0})</h2>
        <div className="row">
          <button className="btn small primary" onClick={() => setShowGen(true)} disabled={lines.length === 0}>
            Generate units from lines
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {lines.length === 0 && (units?.length ?? 0) === 0 && (
        <p className="muted">Add lines first, then generate the crates / bundles / skids they ship in.</p>
      )}
      {units && units.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={selected.size === units.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th>Short code</th>
                  <th>Kind</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} aria-label={u.short_code} />
                    </td>
                    <td>
                      <code>{u.short_code}</code>
                    </td>
                    <td>{u.kind}</td>
                    <td>{u.description}</td>
                    <td>
                      <StatusChip status={u.current_status} />
                    </td>
                    <td>{u.current_location_name ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <label className="inline">
              Label format
              <select value={format} onChange={(e) => setFormat(e.target.value as LabelFormat)}>
                <option value="thermal-4x6">Thermal 4x6</option>
                <option value="letter-grid">Letter grid</option>
              </select>
            </label>
            <button className="btn primary" onClick={printLabels} disabled={selected.size === 0 || labels.busy}>
              {labels.busy ? "Rendering..." : `Print labels (${selected.size})`}
            </button>
            {labels.url && (
              <a className="btn" href={labels.url} target="_blank" rel="noopener noreferrer">
                Open PDF
              </a>
            )}
          </div>
          {labels.error && <p className="error">{labels.error}</p>}
        </>
      )}
      {showGen && (
        <GenerateDialog
          lines={lines}
          onClose={() => setShowGen(false)}
          onGenerate={async (specs) => {
            await createUnits({ projectId, releaseId, userId: user.id, specs });
            await reload();
            setShowGen(false);
          }}
        />
      )}
    </section>
  );
}

function GenerateDialog({
  lines,
  onClose,
  onGenerate,
}: {
  lines: ReleaseLine[];
  onClose: () => void;
  onGenerate: (specs: NewUnitSpec[]) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>("per_line");
  const [kind, setKind] = useState("crate");
  const [n, setN] = useState("2");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildSpecs(): NewUnitSpec[] {
    const sorted = [...lines].sort((a, b) => a.line_no - b.line_no);
    if (mode === "per_line") {
      return sorted.map((l) => ({
        kind,
        description: description.trim() || `${l.piece_mark ? l.piece_mark + " " : ""}${l.description}`.slice(0, 200),
        lines: [l],
      }));
    }
    if (mode === "single") {
      return [
        {
          kind,
          description: description.trim() || `${sorted.length} line${sorted.length === 1 ? "" : "s"}`,
          lines: sorted,
        },
      ];
    }
    const count = Number(n);
    if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("Enter a whole number of units between 1 and 500.");
    // N empty-of-lines units, except lines are spread round-robin so nothing is lost.
    return Array.from({ length: count }, (_, i) => ({
      kind,
      description: description.trim() ? `${description.trim()} ${i + 1}/${count}` : `${kind} ${i + 1} of ${count}`,
      lines: sorted.filter((_, j) => j % count === i),
    }));
  }

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const specs = buildSpecs();
      if (specs.length === 0) throw new Error("Nothing to generate.");
      await onGenerate(specs);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  let preview = "";
  try {
    const s = buildSpecs();
    preview = `${s.length} unit${s.length === 1 ? "" : "s"} will be created.`;
  } catch {
    preview = "";
  }

  return (
    <Dialog title="Generate handling units" onClose={onClose}>
      <div className="form">
        <fieldset>
          <legend>How should the {lines.length} lines be packed?</legend>
          <label className="radio">
            <input type="radio" checked={mode === "per_line"} onChange={() => setMode("per_line")} /> One unit per line
          </label>
          <label className="radio">
            <input type="radio" checked={mode === "single"} onChange={() => setMode("single")} /> One unit for all lines
          </label>
          <label className="radio">
            <input type="radio" checked={mode === "n"} onChange={() => setMode("n")} /> A set number of units
            {mode === "n" && (
              <input className="short" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} aria-label="Number of units" />
            )}
          </label>
          {mode === "n" && <p className="muted small">Lines are spread across the units; adjust contents on the phone when packing.</p>}
        </fieldset>
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {UNIT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description (optional; defaults to the line description)
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {preview && <p className="muted">{preview} Each gets a short code and QR token automatically.</p>}
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn primary" onClick={go} disabled={busy}>
            {busy ? "Creating..." : "Create units"}
          </button>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}
