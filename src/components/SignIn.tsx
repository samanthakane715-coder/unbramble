"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function SignIn({ linkError }: { linkError: boolean }) {
  const db = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    linkError ? "That sign-in link has expired. Enter your email for a new one." : null
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending"); setError(null);
    const { error } = await db.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setState("idle"); return; }
    setState("sent");
  }

  if (state === "sent") {
    return <p className="hint" role="status">Check {email} for a sign-in link. It works once, for one hour.</p>;
  }

  return (
    <>
      <form className="signin" onSubmit={submit}>
        <label htmlFor="email" className="visually-hidden">Email</label>
        <input id="email" type="email" required autoComplete="email" placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="hint">Not ready to sign up? <a href="/demo">Look around the demo</a>, no account needed.</p>
    </>
  );
}
