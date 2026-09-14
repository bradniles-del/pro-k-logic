import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Json } from "@prok/shared";
import { supabase } from "../lib/supabase";
import { StatusChip } from "../components/ui";

type Resolved =
  | { found: false }
  | {
      found: true;
      subject_type: "handling_unit";
      subject_id: string;
      token_version: number;
      voided: boolean;
      short_code: string;
      status: string;
      visible: boolean;
      detail: { description: string; project_id: string; shipment_id: string | null; zone_id: string | null } | null;
    }
  | {
      found: true;
      subject_type: "release";
      subject_id: string;
      token_version: number;
      voided: boolean;
      visible: boolean;
      detail: { number: string; project_id: string; supplier_org_id: string } | null;
    };

function parseResolved(json: Json): Resolved | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, Json | undefined>;
  if (o.found === false) return { found: false };
  if (o.found !== true) return null;
  return o as unknown as Resolved;
}

/**
 * Consignee scan landing page. Public: works signed in or out. resolve_token
 * decides what this viewer may see; we only render what it returns.
 */
export default function ScanLanding() {
  const { token } = useParams<{ token: string }>();
  const [result, setResult] = useState<Resolved | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean>(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  useEffect(() => {
    if (!token) return;
    supabase.rpc("resolve_token", { p_token: token }).then(({ data, error }) => {
      if (error) setError(error.message);
      else setResult(parseResolved(data));
    });
  }, [token]);

  const next = encodeURIComponent(`/s/${token ?? ""}`);

  return (
    <main className="page narrow scan">
      <h1>Pro-K-Logic</h1>
      {error && <p className="error">Could not resolve this label: {error}</p>}
      {result === undefined && !error && <p className="muted">Resolving label...</p>}
      {result === null && <p className="error">Unexpected response from the server.</p>}

      {result && !result.found && (
        <div className="panel">
          <h2>Label not recognized</h2>
          <p className="muted">
            This QR code does not match any shipment or handling unit. Check the short code printed under the QR and
            search for it in the app, or ask the coordinator to reprint the label.
          </p>
          {!signedIn && (
            <Link className="btn primary" to={`/sign-in?next=${next}`}>
              Sign in
            </Link>
          )}
        </div>
      )}

      {result && result.found && (
        <div className="panel">
          {result.voided && (
            <p className="banner warn">
              This label was voided and reprinted (version {result.token_version}). The item is still valid; use the
              newest label when you can.
            </p>
          )}
          {result.subject_type === "handling_unit" ? (
            <>
              <div className="small muted">Handling unit</div>
              <h2>
                <code>{result.short_code}</code>
              </h2>
              <p>
                <StatusChip status={result.status} />
              </p>
              {result.visible && result.detail ? (
                <>
                  <p>{result.detail.description || <span className="muted">no description</span>}</p>
                  <Link className="btn primary" to={`/p/${result.detail.project_id}/material?unit=${result.subject_id}`}>
                    Open in Pro-K-Logic
                  </Link>
                </>
              ) : (
                <SignInPrompt signedIn={signedIn} next={next} />
              )}
            </>
          ) : (
            <>
              <div className="small muted">Shipping release (SRN)</div>
              {result.visible && result.detail ? (
                <>
                  <h2>SRN {result.detail.number}</h2>
                  <Link className="btn primary" to={`/p/${result.detail.project_id}/srns/${result.subject_id}`}>
                    Open in Pro-K-Logic
                  </Link>
                </>
              ) : (
                <>
                  <h2>Shipping paperwork</h2>
                  <SignInPrompt signedIn={signedIn} next={next} />
                </>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}

function SignInPrompt({ signedIn, next }: { signedIn: boolean; next: string }) {
  if (signedIn) {
    return (
      <p className="muted">
        You are signed in but not a member of this item's project, so only the public summary is shown. Ask the
        project coordinator for an invitation.
      </p>
    );
  }
  return (
    <>
      <p className="muted">Sign in with a project account to see contents, location and history.</p>
      <Link className="btn primary" to={`/sign-in?next=${next}`}>
        Sign in to see details
      </Link>
    </>
  );
}
