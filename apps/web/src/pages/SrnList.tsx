import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listReleases, type ReleaseListRow } from "../lib/api";
import { StatusChip, fmtDate } from "../components/ui";
import { useProject } from "./ProjectLayout";

/** Roll a release's shipments into one status label. */
export function rollupStatus(r: ReleaseListRow): { label: string; status: string | null } {
  if (r.shipments.length === 0) return { label: "no shipment", status: null };
  const distinct = Array.from(new Set(r.shipments.map((s) => s.current_status)));
  if (distinct.length === 1) return { label: distinct[0], status: distinct[0] };
  return { label: `mixed (${r.shipments.length})`, status: null };
}

export default function SrnList() {
  const { project } = useProject();
  const [rows, setRows] = useState<ReleaseListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [supplier, setSupplier] = useState("");

  useEffect(() => {
    listReleases(project.id).then(setRows).catch((e: Error) => setError(e.message));
  }, [project.id]);

  const suppliers = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows ?? []) m.set(r.supplier_org_id, r.organizations?.name ?? "unknown");
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (supplier && r.supplier_org_id !== supplier) return false;
      if (!needle) return true;
      return (
        r.number.toLowerCase().includes(needle) ||
        (r.organizations?.name ?? "").toLowerCase().includes(needle) ||
        (r.purchase_orders?.number ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, supplier]);

  const base = `/p/${project.id}/srns`;

  return (
    <main className="page">
      <div className="page-head">
        <h1>SRNs</h1>
        <Link className="btn primary" to={`${base}/new`}>
          New SRN
        </Link>
      </div>
      <div className="filters">
        <input
          type="search"
          placeholder="Search number, supplier, PO"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier">
          <option value="">All suppliers</option>
          {suppliers.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading...</p>}
      {rows && rows.length === 0 && <p className="muted">No SRNs yet. Create the first one.</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SRN</th>
                <th>Supplier</th>
                <th>PO</th>
                <th>Issued</th>
                <th className="num">Lines</th>
                <th className="num">Units</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const roll = rollupStatus(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <Link to={`${base}/${r.id}`}>
                        <strong>{r.number}</strong>
                      </Link>
                    </td>
                    <td>{r.organizations?.name ?? "unknown"}</td>
                    <td>{r.purchase_orders?.number ?? ""}</td>
                    <td>{fmtDate(r.issued_at)}</td>
                    <td className="num">{r.release_lines.length}</td>
                    <td className="num">{r.handling_units.length}</td>
                    <td>{roll.status ? <StatusChip status={roll.status} /> : <span className="muted">{roll.label}</span>}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    Nothing matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
