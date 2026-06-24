"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type EventType = {
  id: string;
  key: string;
  label: string;
  resolution_mode: string;
};

type SubmittedMarket = {
  market_id: string;
  line: number;
  closes_at: string;
  sealed_value: number;
};

export default function PlayerView({
  roundId,
  participantId,
  displayName,
}: {
  roundId: string;
  participantId: string;
  displayName: string;
}) {
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [hole, setHole] = useState(1);
  const [selectedType, setSelectedType] = useState<EventType | null>(null);
  const [value, setValue] = useState("");
  const [lineStr, setLineStr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedMarket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    supabaseRef.current
      .from("event_types")
      .select("id, key, label, resolution_mode")
      .eq("active", true)
      .eq("resolution_mode", "measured_pool")
      .then(({ data }) => {
        if (data) setEventTypes(data as EventType[]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown display for the open market window
  useEffect(() => {
    if (!submitted) {
      setSecondsLeft(null);
      return;
    }
    const tick = () =>
      setSecondsLeft(
        Math.max(0, Math.round((new Date(submitted.closes_at).getTime() - Date.now()) / 1000))
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [submitted]);

  async function submit() {
    if (!selectedType || !value) return;

    const numValue = parseFloat(value);
    const numLine = parseFloat(lineStr);
    if (isNaN(numValue) || numValue <= 0) {
      setError("Enter a valid positive distance");
      return;
    }
    if (isNaN(numLine) || numLine <= 0 || numLine === Math.floor(numLine)) {
      setError("Line must be a positive non-integer (e.g. 250.5)");
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/round/${roundId}/market`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event_type_id: selectedType.id,
        hole,
        sealed_value: numValue,
        line: numLine,
      }),
    });

    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to open market");
      return;
    }

    setSubmitted(json as SubmittedMarket);
  }

  function reset() {
    setSubmitted(null);
    setSelectedType(null);
    setValue("");
    setLineStr("");
    setError(null);
  }

  // Post-submit confirmation: player sees their value, locked, no editing
  if (submitted) {
    return (
      <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 560 }}>
        <h1 style={{ marginBottom: "0.25rem" }}>Live Bet — Player</h1>
        <p style={{ color: "#888", marginBottom: "1.5rem" }}>{displayName} · Hole {hole}</p>

        <section style={{ border: "1px solid #22c55e", padding: "1rem", marginBottom: "1.5rem" }}>
          <div style={{ color: "#22c55e", fontWeight: "bold", marginBottom: "0.5rem" }}>
            Market open
          </div>
          <pre style={{ margin: 0, fontSize: "0.82rem" }}>
{`event:        ${selectedType?.label ?? ""}
your value:   ${submitted.sealed_value} yards  ← confirmed, sealed from observers
line:         ${submitted.line} yards
closes in:    ${secondsLeft !== null ? `${secondsLeft}s` : "…"}`}
          </pre>
          <p style={{ color: "#888", fontSize: "0.78rem", marginTop: "0.75rem", marginBottom: 0 }}>
            Observers cannot see your value until the market closes.
          </p>
        </section>

        <button onClick={reset} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
          Record next shot
        </button>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 560 }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Live Bet — Player</h1>
      <p style={{ color: "#888", marginBottom: "1.5rem" }}>{displayName}</p>

      {/* Hole selector */}
      <section style={{ marginBottom: "1.5rem" }}>
        <strong>Hole</strong>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button
            onClick={() => setHole((h) => Math.max(1, h - 1))}
            style={{ padding: "0.3rem 0.7rem", cursor: "pointer" }}
          >
            −
          </button>
          <span style={{ fontSize: "1.4rem", minWidth: 30, textAlign: "center" }}>{hole}</span>
          <button
            onClick={() => setHole((h) => Math.min(18, h + 1))}
            style={{ padding: "0.3rem 0.7rem", cursor: "pointer" }}
          >
            +
          </button>
        </div>
      </section>

      {/* Event type buttons */}
      <section style={{ marginBottom: "1.5rem" }}>
        <strong>Shot type</strong>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
          {eventTypes.length === 0 && (
            <span style={{ color: "#888" }}>Loading…</span>
          )}
          {eventTypes.map((et) => (
            <button
              key={et.id}
              onClick={() => setSelectedType(et)}
              style={{
                padding: "0.5rem 1rem",
                cursor: "pointer",
                background: selectedType?.id === et.id ? "#3b82f6" : undefined,
                color: selectedType?.id === et.id ? "#fff" : undefined,
              }}
            >
              {et.label}
            </button>
          ))}
        </div>
      </section>

      {/* Value + line inputs — only when event type is selected */}
      {selectedType && (
        <section style={{ marginBottom: "1.5rem" }}>
          <div style={{ marginBottom: "0.75rem" }}>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>
              Measured distance (yards)
            </label>
            <input
              type="number"
              value={value}
              min={1}
              step="any"
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 275"
              style={{ width: 140, padding: "0.3rem 0.4rem" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>
              Betting line (non-integer, e.g. 250.5)
            </label>
            <input
              type="number"
              value={lineStr}
              min={1}
              step="0.5"
              onChange={(e) => setLineStr(e.target.value)}
              placeholder="e.g. 250.5"
              style={{ width: 140, padding: "0.3rem 0.4rem" }}
            />
          </div>
        </section>
      )}

      {error && (
        <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>
      )}

      <button
        onClick={submit}
        disabled={!selectedType || !value || !lineStr || submitting}
        style={{ padding: "0.6rem 1.2rem", cursor: "pointer" }}
      >
        {submitting ? "Opening market…" : "Submit & open market"}
      </button>

      {/* Dev controls */}
      <details style={{ marginTop: "2rem" }}>
        <summary style={{ cursor: "pointer", color: "#888", fontSize: "0.82rem" }}>Dev tools</summary>
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={async () => {
              const res = await fetch("/api/dev/close-markets", { method: "POST" });
              const json = await res.json();
              alert(json.closed === 0 ? "0 closed — window still open" : `${json.closed} closed`);
            }}
            style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
          >
            Force Close
          </button>
        </div>
      </details>
    </main>
  );
}
