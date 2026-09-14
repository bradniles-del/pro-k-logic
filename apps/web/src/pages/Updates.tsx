import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../components/AuthGate";
import {
  RateLimitError,
  listProjectShipments,
  listUpdates,
  postUpdate,
  type Enums,
  type ProjectShipment,
  type UpdateRow,
} from "../lib/api";
import { KindChip, StatusChip, fmtDate, localToIso } from "../components/ui";
import { useProject } from "./ProjectLayout";

const KINDS: Enums["update_kind"][] = [
  "note",
  "delay",
  "eta_change",
  "departed",
  "at_gate",
  "offloading",
  "released_driver",
  "issue",
  "resolved",
];
const MAX = 140;

function shipmentLabel(s: ProjectShipment): string {
  const srn = s.shipping_releases?.number ?? "no SRN";
  const carrier = s.organizations?.name ? ` · ${s.organizations.name}` : "";
  return `${srn}${carrier} · ${s.current_status.replace(/_/g, " ")} · ${s.id.slice(0, 8)}`;
}

/** Shipment updates: short, typed, one per minute per shipment per author. */
export default function Updates() {
  const { project } = useProject();
  const { user } = useAuth();
  const [rows, setRows] = useState<UpdateRow[] | null>(null);
  const [shipments, setShipments] = useState<ProjectShipment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [shipmentId, setShipmentId] = useState("");
  const [kind, setKind] = useState<Enums["update_kind"]>("note");
  const [text, setText] = useState("");
  const [eta, setEta] = useState("");
  const [busy, setBusy] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRows(await listUpdates(project.id));
  }, [project.id]);

  useEffect(() => {
    reload().catch((e: Error) => setError(e.message));
    listProjectShipments(project.id)
      .then(setShipments)
      .catch((e: Error) => setError(e.message));
  }, [reload, project.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPostError(null);
    try {
      if (!shipmentId) throw new Error("Pick a shipment.");
      if (kind === "eta_change" && !eta) throw new Error("Enter the new ETA.");
      await postUpdate({
        projectId: project.id,
        shipmentId,
        kind,
        text: text.trim(),
        etaAt: kind === "eta_change" ? localToIso(eta) : null,
        userId: user.id,
      });
      setText("");
      setEta("");
      await reload();
    } catch (err) {
      setPostError(err instanceof RateLimitError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const remaining = MAX - text.length;

  return (
    <main className="page">
      <div className="page-head">
        <h1>Updates</h1>
      </div>
      {error && <p className="error">{error}</p>}

      <form onSubmit={submit} className="composer">
        <div className="grid2">
          <label>
            Shipment
            <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} required>
              <option value="">Select...</option>
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {shipmentLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as Enums["update_kind"])}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        {kind === "eta_change" && (
          <label>
            New ETA
            <input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} required />
          </label>
        )}
        <label>
          Message
          <textarea
            rows={2}
            maxLength={MAX}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            placeholder="Keep it short: what changed, and when."
          />
          <span className={`counter${remaining < 20 ? " warn" : ""}`}>{remaining} left</span>
        </label>
        {postError && <p className="error">{postError}</p>}
        {shipments.length === 0 && (
          <p className="muted small">
            No shipments on this project yet. Create one from an SRN under <Link to={`/p/${project.id}/srns`}>SRNs</Link>.
          </p>
        )}
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy || !shipmentId || shipments.length === 0}>
            {busy ? "Posting..." : "Post update"}
          </button>
        </div>
      </form>

      {!rows && !error && <p className="muted">Loading...</p>}
      {rows && rows.length === 0 && <p className="muted">No updates yet.</p>}
      <ul className="list">
        {(rows ?? []).map((u) => (
          <li key={u.id} className="update-row">
            <KindChip kind={u.kind} />
            <div className="update-body">
              <div>{u.text || <span className="muted">(no text)</span>}</div>
              {u.eta_at && <div className="small">New ETA: {fmtDate(u.eta_at)}</div>}
              <div className="muted small">
                {u.profiles?.full_name || "someone"} · {fmtDate(u.created_at)} · SRN{" "}
                {u.shipments?.shipping_releases?.number ?? "?"}
                {(() => {
                  const s = shipments.find((x) => x.id === u.shipment_id);
                  return s ? (
                    <>
                      {" "}
                      <StatusChip status={s.current_status} />
                    </>
                  ) : null;
                })()}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
