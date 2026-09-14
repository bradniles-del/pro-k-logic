import { useEffect, type ReactNode } from "react";
import type { Enums } from "../lib/api";

/** Status chip for custody_status values. */
export function StatusChip({ status }: { status: Enums["custody_status"] | string }) {
  const tone =
    status === "exception"
      ? "red"
      : status === "delivered" || status === "received" || status === "installed"
        ? "green"
        : status === "in_transit" || status === "picked_up" || status === "arrived"
          ? "blue"
          : "grey";
  return <span className={`chip chip-${tone}`}>{String(status).replace(/_/g, " ")}</span>;
}

export function ConfidenceChip({ value }: { value: number }) {
  const tone = value >= 0.8 ? "green" : value >= 0.5 ? "amber" : "red";
  return (
    <span className={`chip chip-${tone}`} title="Extraction confidence">
      {Math.round(value * 100)}%
    </span>
  );
}

export function ProvenanceBadge({ value }: { value: Enums["content_provenance"] }) {
  const tone = value === "extracted" ? "amber" : value === "structured" ? "blue" : "grey";
  return <span className={`chip chip-${tone}`}>{value}</span>;
}

export function KindChip({ kind }: { kind: Enums["update_kind"] }) {
  const tone =
    kind === "issue" || kind === "delay"
      ? "red"
      : kind === "resolved" || kind === "released_driver"
        ? "green"
        : kind === "eta_change" || kind === "departed" || kind === "at_gate" || kind === "offloading"
          ? "blue"
          : "grey";
  return <span className={`chip chip-${tone}`}>{kind.replace(/_/g, " ")}</span>;
}

/** Minimal modal dialog; closes on Escape or backdrop click. */
export function Dialog({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div
        className={`dialog${wide ? " wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="btn small" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Right-hand drawer used for the unit detail on the material page. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()} aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="btn small" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** datetime-local input value -> ISO string (or null when blank). */
export function localToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
