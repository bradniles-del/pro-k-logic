import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../AuthGate";
import {
  createShipment,
  listProjectOrgs,
  listShipmentsForRelease,
  type ProjectOrg,
  type ShipmentRow,
} from "../../lib/api";
import { StatusChip, fmtDate, localToIso } from "../ui";

/** Minimal shipment creation for an SRN; Phase 3 builds out assignment and tracking. */
export default function ShipmentsPanel({ projectId, releaseId }: { projectId: string; releaseId: string }) {
  const { user } = useAuth();
  const [shipments, setShipments] = useState<ShipmentRow[] | null>(null);
  const [orgs, setOrgs] = useState<ProjectOrg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [pickup, setPickup] = useState("");
  const [delivery, setDelivery] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setShipments(await listShipmentsForRelease(releaseId));
  }, [releaseId]);

  useEffect(() => {
    reload().catch((e: Error) => setError(e.message));
    listProjectOrgs(projectId)
      .then(setOrgs)
      .catch((e: Error) => setError(e.message));
  }, [reload, projectId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createShipment({
        projectId,
        releaseId,
        carrierOrgId: carrier || null,
        plannedPickupAt: localToIso(pickup),
        plannedDeliveryAt: localToIso(delivery),
        originText: origin.trim() || null,
        userId: user.id,
      });
      await reload();
      setOpen(false);
      setCarrier("");
      setPickup("");
      setDelivery("");
      setOrigin("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>Shipments ({shipments?.length ?? 0})</h2>
        <button className="btn small primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "New shipment"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {open && (
        <form onSubmit={submit} className="form inline-form">
          <div className="grid2">
            <label>
              Carrier
              <select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                <option value="">Not assigned</option>
                {orgs.map((o) => (
                  <option key={o.organization_id} value={o.organization_id}>
                    {o.organizations?.name ?? o.organization_id}
                    {o.organizations?.kind === "carrier" ? "" : ` (${o.organizations?.kind ?? "org"})`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Origin (text)
              <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Supplier yard, Nisku" />
            </label>
            <label>
              Planned pickup
              <input type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} />
            </label>
            <label>
              Planned delivery
              <input type="datetime-local" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Saving..." : "Create shipment"}
            </button>
          </div>
        </form>
      )}
      {shipments && shipments.length === 0 && !open && <p className="muted">No shipments yet.</p>}
      {shipments && shipments.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Carrier</th>
                <th>Origin</th>
                <th>Planned pickup</th>
                <th>Planned delivery</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id}>
                  <td>{s.organizations?.name ?? <span className="muted">unassigned</span>}</td>
                  <td>{s.origin_text ?? ""}</td>
                  <td>{fmtDate(s.planned_pickup_at)}</td>
                  <td>{fmtDate(s.planned_delivery_at)}</td>
                  <td>
                    <StatusChip status={s.current_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
