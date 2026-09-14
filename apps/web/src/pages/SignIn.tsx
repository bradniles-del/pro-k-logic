import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

/** Email one-time-code sign-in: send the code, then verify it. */
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setError(error.message);
    // On success App's onAuthStateChange re-renders /sign-in, which honours ?next=.
  }

  return (
    <main className="page narrow">
      <h1>Pro-K-Logic</h1>
      <p className="muted">Sign in with your work email. We send a one-time code; there is no password.</p>
      {!sent ? (
        <form onSubmit={sendCode} className="form">
          <label>
            Work email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Sending..." : "Send sign-in code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="form">
          <p>We sent a code to {email}.</p>
          <label>
            Code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Checking..." : "Verify"}
          </button>
          <button className="btn" type="button" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
