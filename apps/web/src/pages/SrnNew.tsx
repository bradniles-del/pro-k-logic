import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthGate";
import {
  createPlaceholderOrg,
  createPurchaseOrder,
  createRelease,
  listProjectOrgs,
  listPurchaseOrders,
  type ProjectOrg,
  type PurchaseOrder,
} from "../lib/api";
import { useProject } from "./ProjectLayout";

const NEW_PO = "__new__";

export default function SrnNew() {
  const { project } = useProject();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState<ProjectOrg[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [number, setNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [poId, setPoId] = useState("");
  const [newPoNumber, setNewPoNumber] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [notes, setNotes] = useState("");

  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierEmail, setNewSupplierEmail] = useState("");
  const [supplierBusy, setSupplierBusy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reloadOrgs() {
    const list = await listProjectOrgs(project.id);
    setOrgs(list);
    return list;
  }

  useEffect(() => {
    Promise.all([listProjectOrgs(project.id), listPurchaseOrders(project.id)])
      .then(([o, p]) => {
        setOrgs(o);
        setPos(p);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [project.id]);

  async function addSupplier() {
    setSupplierBusy(true);
    setError(null);
    try {
      const id = await createPlaceholderOrg({
        projectId: project.id,
        name: newSupplierName.trim(),
        contactEmail: newSupplierEmail.trim() || null,
        kind: "supplier",
        userId: user.id,
      });
      await reloadOrgs();
      setSupplierId(id);
      setAddingSupplier(false);
      setNewSupplierName("");
      setNewSupplierEmail("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSupplierBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      setError("Pick a supplier.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let po: string | null = poId || null;
      if (poId === NEW_PO) {
        const created = await createPurchaseOrder({
          projectId: project.id,
          number: newPoNumber.trim(),
          supplierOrgId: supplierId,
          userId: user.id,
        });
        po = created.id;
      }
      const rel = await createRelease({
        projectId: project.id,
        supplierOrgId: supplierId,
        poId: po,
        number: number.trim(),
        supplierRef: supplierRef.trim() || null,
        notes: notes.trim() || null,
        userId: user.id,
      });
      navigate(`/p/${project.id}/srns/${rel.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <div className="page-head">
        <h1>New SRN</h1>
        <Link className="btn" to={`/p/${project.id}/srns`}>
          Cancel
        </Link>
      </div>
      {loadError && <p className="error">{loadError}</p>}
      <form onSubmit={submit} className="form">
        <label>
          SRN number
          <input required value={number} onChange={(e) => setNumber(e.target.value)} autoFocus placeholder="e.g. SRN-0042" />
        </label>

        <label>
          Supplier
          <div className="row">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="">Select...</option>
              {orgs.map((o) => (
                <option key={o.organization_id} value={o.organization_id}>
                  {o.organizations?.name ?? o.organization_id}
                  {o.organizations?.is_placeholder ? " (placeholder)" : ""}
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => setAddingSupplier((v) => !v)}>
              {addingSupplier ? "Hide" : "Add supplier"}
            </button>
          </div>
        </label>
        {addingSupplier && (
          <fieldset className="inline-form">
            <legend>Placeholder supplier (they can claim it later by invitation)</legend>
            <label>
              Name
              <input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} />
            </label>
            <label>
              Contact email
              <input type="email" value={newSupplierEmail} onChange={(e) => setNewSupplierEmail(e.target.value)} />
            </label>
            <div className="row">
              <button
                type="button"
                className="btn primary"
                disabled={supplierBusy || !newSupplierName.trim()}
                onClick={addSupplier}
              >
                {supplierBusy ? "Adding..." : "Add and select"}
              </button>
            </div>
          </fieldset>
        )}

        <label>
          Purchase order (optional)
          <select value={poId} onChange={(e) => setPoId(e.target.value)}>
            <option value="">None</option>
            {pos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number}
              </option>
            ))}
            <option value={NEW_PO}>New PO number...</option>
          </select>
        </label>
        {poId === NEW_PO && (
          <label>
            New PO number
            <input required value={newPoNumber} onChange={(e) => setNewPoNumber(e.target.value)} placeholder="e.g. PO-4471" />
          </label>
        )}

        <label>
          Supplier reference
          <input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
        </label>
        <label>
          Notes
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy || !number.trim() || !supplierId}>
            {busy ? "Saving..." : "Create SRN"}
          </button>
        </div>
      </form>
    </main>
  );
}
