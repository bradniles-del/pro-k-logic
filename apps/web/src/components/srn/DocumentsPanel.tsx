import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "../AuthGate";
import {
  deleteExtractionJob,
  getExtractionJob,
  listDocuments,
  listExtractionJobs,
  requestExtraction,
  signedDocumentUrl,
  uploadDocument,
  type Document,
  type Enums,
  type ExtractionJob,
  type ReleaseLine,
} from "../../lib/api";
import { fmtDate } from "../ui";
import ExtractionReview from "./ExtractionReview";

const DOC_KINDS: Enums["document_kind"][] = ["packing_list", "bill_of_lading", "mtr", "drawing", "customs", "other"];
const POLL_MS = 2000;
const POLL_MAX_MS = 120_000;
/** A queued/running job older than this is considered stuck and may be retried. */
const STUCK_MS = 10 * 60 * 1000;

function isPdf(d: Document): boolean {
  return d.mime_type === "application/pdf" || /\.pdf$/i.test(d.filename);
}

function isRetryable(job: ExtractionJob, now: number): boolean {
  if (job.status === "failed") return true;
  if (job.status !== "queued" && job.status !== "running") return false;
  const since = job.status === "running" && job.started_at ? job.started_at : job.created_at;
  return now - new Date(since).getTime() > STUCK_MS;
}

export default function DocumentsPanel({
  projectId,
  releaseId,
  existingLines,
  onLinesChanged,
}: {
  projectId: string;
  releaseId: string;
  existingLines: ReleaseLine[];
  onLinesChanged: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Document[] | null>(null);
  const [jobs, setJobs] = useState<ExtractionJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Enums["document_kind"]>("packing_list");
  const [uploading, setUploading] = useState(false);
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<Map<string, number>>(new Map());

  const reload = useCallback(async () => {
    const [d, j] = await Promise.all([listDocuments(releaseId), listExtractionJobs(releaseId)]);
    setDocs(d);
    setJobs(j);
    return j;
  }, [releaseId]);

  useEffect(() => {
    reload().catch((e: Error) => setError(e.message));
    const map = timers.current;
    return () => {
      for (const t of map.values()) window.clearTimeout(t);
      map.clear();
    };
  }, [reload]);

  /** Poll one job every 2 s until it finishes or 2 minutes pass. */
  const poll = useCallback((jobId: string, startedAt: number) => {
    const tick = async () => {
      try {
        const job = await getExtractionJob(jobId);
        setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
        if (job.status === "done" || job.status === "failed") {
          timers.current.delete(jobId);
          if (job.status === "done") setReviewJobId(job.id);
          return;
        }
      } catch (e) {
        setError((e as Error).message);
      }
      if (Date.now() - startedAt > POLL_MAX_MS) {
        timers.current.delete(jobId);
        setError("Extraction is taking longer than two minutes. Refresh the page later to check on it.");
        return;
      }
      timers.current.set(jobId, window.setTimeout(tick, POLL_MS));
    };
    timers.current.set(jobId, window.setTimeout(tick, POLL_MS));
  }, []);

  // Resume polling for jobs that were still running when the page loaded.
  useEffect(() => {
    for (const j of jobs) {
      if ((j.status === "queued" || j.status === "running") && !timers.current.has(j.id)) {
        poll(j.id, new Date(j.created_at).getTime());
      }
    }
  }, [jobs, poll]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDocument({ projectId, releaseId, file, kind, userId: user.id });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function download(d: Document) {
    try {
      const url = await signedDocumentUrl(d.storage_path);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function extract(d: Document) {
    setError(null);
    try {
      const job = await requestExtraction({ projectId, documentId: d.id, releaseId, userId: user.id });
      setJobs((prev) => [job, ...prev]);
      poll(job.id, Date.now());
    } catch (err) {
      setError((err as Error).message);
      await reload().catch(() => undefined);
    }
  }

  /** Drops a stuck/failed job (when RLS lets us) and requests a fresh one. */
  async function retry(d: Document, job: ExtractionJob) {
    setError(null);
    try {
      const t = timers.current.get(job.id);
      if (t !== undefined) {
        window.clearTimeout(t);
        timers.current.delete(job.id);
      }
      // A stale `running` job cannot be deleted by the requester; the edge
      // function re-claims it instead, so we only remove queued/failed rows.
      if (job.status === "queued" || job.status === "failed") {
        await deleteExtractionJob(job.id);
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
      }
      const fresh = await requestExtraction({ projectId, documentId: d.id, releaseId, userId: user.id });
      setJobs((prev) => [fresh, ...prev]);
      poll(fresh.id, Date.now());
    } catch (err) {
      setError((err as Error).message);
      await reload().catch(() => undefined);
    }
  }

  const now = Date.now();
  const latestJobFor = (docId: string) => jobs.find((j) => j.document_id === docId);
  const reviewJob = reviewJobId ? jobs.find((j) => j.id === reviewJobId) : undefined;

  return (
    <section className="section">
      <div className="section-head">
        <h2>Documents</h2>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value as Enums["document_kind"])} aria-label="Document kind">
            {DOC_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={onFile}
            disabled={uploading}
            hidden
            id={`doc-upload-${releaseId}`}
          />
          <label className="btn primary" htmlFor={`doc-upload-${releaseId}`}>
            {uploading ? "Uploading..." : "Upload PDF / JPG / PNG"}
          </label>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!docs && !error && <p className="muted">Loading...</p>}
      {docs && docs.length === 0 && <p className="muted">No documents yet. Upload the packing list to extract its lines.</p>}
      {docs && docs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Kind</th>
                <th>Uploaded</th>
                <th>Extraction</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const job = latestJobFor(d.id);
                const running = job && (job.status === "queued" || job.status === "running");
                const retryable = job !== undefined && isRetryable(job, now);
                return (
                  <tr key={d.id}>
                    <td>{d.filename}</td>
                    <td>{d.kind.replace(/_/g, " ")}</td>
                    <td>{fmtDate(d.created_at)}</td>
                    <td>
                      {job ? (
                        <JobStatus job={job} onReview={() => setReviewJobId(job.id)} />
                      ) : (
                        <span className="muted">not run</span>
                      )}
                    </td>
                    <td className="actions">
                      <button className="btn small" onClick={() => download(d)}>
                        Download
                      </button>
                      {isPdf(d) && !retryable && (
                        <button className="btn small" onClick={() => extract(d)} disabled={!!running}>
                          {running ? "Extracting..." : job ? "Extract again" : "Extract BOM"}
                        </button>
                      )}
                      {isPdf(d) && retryable && job && (
                        <button
                          className="btn small"
                          onClick={() => retry(d, job)}
                          title={running ? "This job looks stuck; start a new one" : undefined}
                        >
                          Retry extraction
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {reviewJob && reviewJob.status === "done" && (
        <ExtractionReview
          job={reviewJob}
          document={docs?.find((d) => d.id === reviewJob.document_id) ?? null}
          existingLines={existingLines}
          releaseId={releaseId}
          onClose={() => setReviewJobId(null)}
          onConfirmed={async () => {
            await onLinesChanged();
          }}
        />
      )}
    </section>
  );
}

function JobStatus({ job, onReview }: { job: ExtractionJob; onReview: () => void }) {
  const count = Array.isArray(job.candidates) ? job.candidates.length : 0;
  switch (job.status) {
    case "queued":
      return <span className="chip chip-grey">queued</span>;
    case "running":
      return <span className="chip chip-blue">running</span>;
    case "failed":
      return (
        <span className="chip chip-red" title={job.error ?? undefined}>
          failed{job.error ? `: ${job.error.slice(0, 60)}` : ""}
        </span>
      );
    case "done":
      return (
        <span className="row tight">
          <span className="chip chip-green">done · {count} candidates</span>
          <button className="btn small" onClick={onReview}>
            Review
          </button>
        </span>
      );
  }
}
