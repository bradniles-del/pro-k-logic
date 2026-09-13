import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Json } from "@prok/shared";
import { supabase } from "../lib/supabase";

/**
 * Consignee scan landing page. A plain camera scan of a label opens
 * https://<host>/s/<token>; we resolve the token server-side (resolve_token
 * decides what this viewer may see) and render the result. Phase 0 shows raw JSON.
 */
export default function ScanLanding() {
  const { token } = useParams<{ token: string }>();
  const [result, setResult] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    supabase.rpc("resolve_token", { p_token: token }).then(({ data, error }) => {
      if (error) setError(error.message);
      else setResult(data);
    });
  }, [token]);

  return (
    <main>
      <h1>Pro-K-Logic</h1>
      <p className="muted">Token: {token}</p>
      {error && <p className="error">{error}</p>}
      {result === null && !error && <p className="muted">Resolving...</p>}
      {result !== null && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </main>
  );
}
