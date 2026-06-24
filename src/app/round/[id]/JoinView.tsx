"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Role = "player" | "observer";

export default function JoinView({
  roundId,
  userId,
  displayName,
}: {
  roundId: string;
  userId: string;
  displayName: string;
}) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(role: Role) {
    setJoining(true);
    setError(null);
    const res = await fetch(`/api/round/${roundId}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, user_id: userId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Join failed");
      setJoining(false);
      return;
    }
    // Trigger server component re-render with the new participant
    router.refresh();
  }

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 480 }}>
      <h1 style={{ marginBottom: "0.5rem" }}>Live Bet</h1>
      <p style={{ marginBottom: "1.5rem" }}>
        Welcome, <strong>{displayName}</strong>. How are you joining?
      </p>

      <div style={{ display: "flex", gap: "1rem" }}>
        <button
          onClick={() => join("player")}
          disabled={joining}
          style={{ padding: "0.75rem 1.5rem", cursor: "pointer", flex: 1 }}
        >
          Player
          <br />
          <small style={{ color: "#888" }}>records shots</small>
        </button>
        <button
          onClick={() => join("observer")}
          disabled={joining}
          style={{ padding: "0.75rem 1.5rem", cursor: "pointer", flex: 1 }}
        >
          Observer
          <br />
          <small style={{ color: "#888" }}>bets on outcomes</small>
        </button>
      </div>

      {error && (
        <p style={{ color: "red", marginTop: "1rem" }}>{error}</p>
      )}
    </main>
  );
}
