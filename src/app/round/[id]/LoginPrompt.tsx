"use client";

import { useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPrompt({ roundId }: { roundId: string }) {
  const supabaseRef = useRef(createClient());

  async function signIn() {
    await supabaseRef.current.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=/round/${roundId}`,
      },
    });
  }

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 480 }}>
      <h1 style={{ marginBottom: "0.5rem" }}>Live Bet</h1>
      <p style={{ color: "#888", marginBottom: "1.5rem" }}>
        Sign in to join the round.
      </p>
      <button
        onClick={signIn}
        style={{ padding: "0.6rem 1.2rem", cursor: "pointer" }}
      >
        Sign in with Google
      </button>
    </main>
  );
}
