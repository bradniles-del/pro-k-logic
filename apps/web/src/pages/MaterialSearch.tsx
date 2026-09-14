import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  findMaterial,
  getUnit,
  listReleases,
  listUnitContents,
  listUnitEvents,
  projectLocationNames,
  type CustodyEvent,
  type Enums,
  type HandlingUnit,
  type LocationName,
  type MaterialHit,
  type UnitContent,
} from "../lib/api";
import { Drawer, ProvenanceBadge, StatusChip, fmtDate } from "../components/ui";
import { CUSTODY_STATUSES } from "@prok/shared";
import { useProject } from "./ProjectLayout";

/** "Where is it": find_material + client-side filters + a unit drawer. */
export default function MaterialSearch() {
  const { project } = useProject();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [hits, setHits] = useState<MaterialHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [location, setLocation] = useState("");
  const [srn, setSrn] = useState("");
  const [locations, setLocations] = useState<LocationName[]>([]);
  const [srns, setSrns] = useState<{ id: string; number: string }[]>([]);
  const [params, setParams] = useSearchParams();
  const openUnit = params.get("unit");
  const setOpenUnit = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("unit", id);
    else next.delete("unit");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    projectLocationNames(project.id).then(setLocations).catch(() => setLocations([]));
    listReleases(project.id)
      .then((rs) => setSrns(rs.map((r) => ({ id: r.id, number: r.number }))))
      .catch(() => setSrns([]));
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    findMaterial(project.id, submitted)
      .then((h) => {
        if (!cancelled) setHits(h);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, submitted]);

  function search(e: FormEvent) {
    e.preventDefault();
    setSubmitted(q.trim());
  }

  const filtered = useMemo(
    () =>
      (hits ?? []).filter(
        (h) =>
          (!status || h.status === status) &&
          (!location || h.location_name === location) &&
          (!srn || h.release_number === srn),
      ),
    [hits, status, location, srn],
  );

  return (
    <main className="page">
      <div className="page-head">
        <h1>Material</h1>
      </div>
      <form onSubmit={search} className="filters">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Short code, piece mark, description..."
          autoFocus
        />
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          {CUSTODY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location">
          <option value="">Any location</option>
          {locations.map((l) => (
            <option key={l.location_name} value={l.location_name}>
              {l.location_name} ({l.unit_count})
            </option>
          ))}
        </select>
        <select value={srn} onChange={(e) => setSrn(e.target.value)} aria-label="SRN">
          <option value="">Any SRN</option>
          {srns.map((r) => (
            <option key={r.id} value={r.number}>
              {r.number}
            </option>
          ))}
        </select>
      </form>
      {error && <p className="error">{error}</p>}
      {hits && hits.length === 0 && !loading && (
        <p className="muted">{submitted ? "No units match." : "No handling units on this project yet."}</p>
      )}
      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="clickable">
            <thead>
              <tr>
                <th>Short code</th>
                <th>Description</th>
                <th>Status</th>
                <th>Location</th>
                <th>Zone</th>
                <th>SRN</th>
                <th>PO</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr key={h.unit_id} onClick={() => setOpenUnit(h.unit_id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenUnit(h.unit_id)}>
                  <td>
                    <code>{h.short_code}</code>
                  </td>
                  <td>{h.description}</td>
                  <td>
                    <StatusChip status={h.status} />
                  </td>
                  <td>{h.location_name ?? ""}</td>
                  <td>{h.zone_name ?? ""}</td>
                  <td>{h.release_number ?? ""}</td>
                  <td>{h.po_number ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hits && hits.length > 0 && filtered.length === 0 && <p className="muted">Nothing matches those filters.</p>}
      {openUnit && <UnitDrawer unitId={openUnit} projectId={project.id} onClose={() => setOpenUnit(null)} />}
    </main>
  );
}

export function UnitDrawer({ unitId, projectId, onClose }: { unitId: string; projectId: string; onClose: () => void }) {
  const [unit, setUnit] = useState<HandlingUnit | null>(null);
  const [contents, setContents] = useState<UnitContent[]>([]);
  const [events, setEvents] = useState<CustodyEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUnit(null);
    setError(null);
    Promise.all([getUnit(unitId), listUnitContents(unitId), listUnitEvents(unitId, 20)])
      .then(([u, c, e]) => {
        setUnit(u);
        setContents(c);
        setEvents(e);
      })
      .catch((e: Error) => setError(e.message));
  }, [unitId]);

  return (
    <Drawer title={unit?.short_code ?? "Unit"} onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {!unit && !error && <p className="muted">Loading...</p>}
      {unit && (
        <>
          <p>
            <StatusChip status={unit.current_status} /> <span className="muted">{unit.kind}</span>
          </p>
          <p>{unit.description || <span className="muted">no description</span>}</p>
          <p className="muted small">
            Location: {unit.current_location_name ?? "unknown"} · Updated {fmtDate(unit.updated_at)}
          </p>
          {unit.release_id && (
            <p>
              <Link to={`/p/${projectId}/srns/${unit.release_id}`}>Open SRN</Link>
            </p>
          )}
          <h3>Contents ({contents.length})</h3>
          {contents.length === 0 ? (
            <p className="muted">No content lines.</p>
          ) : (
            <table className="compact">
              <thead>
                <tr>
                  <th>Mark</th>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th>Src</th>
                </tr>
              </thead>
              <tbody>
                {contents.map((c) => (
                  <tr key={c.id}>
                    <td>{c.piece_mark ?? ""}</td>
                    <td>{c.description}</td>
                    <td className="num">
                      {c.qty} {c.uom}
                    </td>
                    <td>
                      <ProvenanceBadge value={c.provenance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>Passport (last {events.length})</h3>
          {events.length === 0 ? (
            <p className="muted">No custody events yet.</p>
          ) : (
            <ul className="timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <div>
                    <strong>{(e.type as Enums["event_type"]).replace(/_/g, " ")}</strong>
                    {e.location_name && <span className="muted"> · {e.location_name}</span>}
                    {e.token_was_voided && <span className="chip chip-red">voided label</span>}
                  </div>
                  <div className="muted small">
                    {fmtDate(e.occurred_at)} · {e.source}
                    {e.notes ? ` · ${e.notes}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Drawer>
  );
}
