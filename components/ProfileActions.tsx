"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignInButton } from "@clerk/nextjs";

/** The profile page's sign-in button for signed-out visitors. */
export function ProfileSignIn() {
  return (
    <SignInButton mode="modal" forceRedirectUrl="/profile">
      <button type="button" className="btn btn-dark">
        Sign in with Google
      </button>
    </SignInButton>
  );
}

/** Deletes every saved interview, after a second click to confirm. */
export function DeleteHistory({ count }: { count: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/interviews", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Couldn't delete your interviews. Please try again.");
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <button type="button" className="btn btn-light btn-sm" style={{ width: "100%", marginTop: 10 }} onClick={() => setConfirming(true)}>
        Delete saved interviews
      </button>
    );
  }
  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
        Delete all {count} saved interview{count === 1 ? "" : "s"}? This can&apos;t be undone.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-sm" style={{ flex: 1, background: "#e5484d", color: "#fff" }} onClick={remove} disabled={busy} aria-busy={busy}>
          {busy ? "Deleting..." : "Delete"}
        </button>
        <button type="button" className="btn btn-light btn-sm" style={{ flex: 1 }} onClick={() => setConfirming(false)} disabled={busy}>
          Keep them
        </button>
      </div>
      {error && (
        <p className="error" role="alert" style={{ margin: "8px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  );
}
