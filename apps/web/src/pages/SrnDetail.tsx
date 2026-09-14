import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getCurrentToken,
  getRelease,
  listReleaseLines,
  renderReleasePaperwork,
  type QrToken,
  type ReleaseDetail,
  type ReleaseLine,
} from "../lib/api";
import { fmtDate } from "../components/ui";
import DocumentsPanel from "../components/srn/DocumentsPanel";
import LinesTable from "../components/srn/LinesTable";
import UnitsPanel from "../components/srn/UnitsPanel";
import ShipmentsPanel from "../components/srn/ShipmentsPanel";
import { useProject } from "./ProjectLayout";

/** The core screen: header + token, documents/extraction, lines, units, shipments. */
export default function SrnDetail() {
  const { project } = useProject();
  const { releaseId } = useParams<{ releaseId: string }>();
  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [token, setToken] = useState<QrToken | null>(null);
  const [lines, setLines] = useState<ReleaseLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paperwork, setPaperwork] = useState<{ busy: boolean; url?: string; error?: string }>({ busy: false });

  const reloadLines = useCallback(async () => {
    if (!releaseId) return;
    setLines(await listReleaseLines(releaseId));
  }, [releaseId]);

  useEffect(() => {
    if (!releaseId) return;
    setError(null);
    Promise.all([getRelease(releaseId), getCurrentToken("release", releaseId), listReleaseLines(releaseId)])
      .then(([r, t, l]) => {
        setRelease(r);
        setToken(t);
        setLines(l);
      })
      .catch((e: Error) => setError(e.message));
  }, [releaseId]);

  if (error) {
    return (
      <main className="page">
        <p className="error">{error}</p>
        <Link to={`/p/${project.id}/srns`}>Back to SRNs</Link>
      </main>
    );
  }
  if (!release || !releaseId) return <main className="page muted">Loading SRN...</main>;
  if (release.project_id !== project.id) {
    return (
      <main className="page">
        <p className="error">This SRN belongs to a different project.</p>
        <Link to={`/p/${project.id}/srns`}>Back to SRNs</Link>
      </main>
    );
  }

  const shortLink = token ? `${window.location.origin}/s/${token.token}` : null;

  async function copyLink() {
    if (!shortLink) return;
    try {
      await navigator.clipboard.writeText(shortLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", shortLink);
    }
  }

  async function printPaperwork() {
    setPaperwork({ busy: true });
    try {
      const res = await renderReleasePaperwork(release!.id);
      setPaperwork({ busy: false, url: res.url });
      window.open(res.url, "_blank", "noopener");
    } catch (e) {
      setPaperwork({ busy: false, error: (e as Error).message });
    }
  }

  return (
    <main className="page">
      <p className="crumbs">
        <Link to={`/p/${project.id}/srns`}>SRNs</Link> / {release.number}
      </p>
      <div className="page-head">
        <div>
          <h1>SRN {release.number}</h1>
          <div className="muted">
            {release.organizations?.name ?? "unknown supplier"}
            {release.purchase_orders && <> · PO {release.purchase_orders.number}</>}
            {release.supplier_ref && <> · ref {release.supplier_ref}</>}
            {" · issued "}
            {fmtDate(release.issued_at)}
          </div>
          {release.notes && <p className="notes">{release.notes}</p>}
        </div>
      </div>

      <section className="token-box">
        <div>
          <div className="small muted">Paperwork QR link</div>
          {shortLink ? (
            <code className="token-link">{shortLink}</code>
          ) : (
            <span className="muted">No token yet.</span>
          )}
          {token && token.voided_at && <span className="chip chip-red">voided</span>}
        </div>
        <div className="row">
          <button className="btn" onClick={copyLink} disabled={!shortLink}>
            {copied ? "Copied" : "Copy link"}
          </button>
          <button className="btn primary" onClick={printPaperwork} disabled={paperwork.busy}>
            {paperwork.busy ? "Rendering..." : "Print paperwork block"}
          </button>
          {paperwork.url && (
            <a className="btn" href={paperwork.url} target="_blank" rel="noopener noreferrer">
              Open PDF
            </a>
          )}
        </div>
        {paperwork.error && <p className="error">{paperwork.error}</p>}
      </section>

      <DocumentsPanel projectId={release.project_id} releaseId={releaseId} existingLines={lines} onLinesChanged={reloadLines} />

      <LinesTable releaseId={releaseId} releaseNumber={release.number} lines={lines} onChanged={reloadLines} />

      <UnitsPanel projectId={release.project_id} releaseId={releaseId} lines={lines} />

      <ShipmentsPanel projectId={release.project_id} releaseId={releaseId} />
    </main>
  );
}
