"use client";

// Live market board: real-time subscriptions require dynamic rendering.
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type MarketRow = {
  id: string;
  type: string;
  line: number;
  opens_at: string;
  closes_at: string;
  status: string;
  sealed_value: number | null;
};

export default function ObserverPage() {
  const [market, setMarket] = useState<MarketRow | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  function addLog(msg: string) {
    const ts = new Date().toISOString().substring(11, 23);
    setLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }

  // Display-only countdown. Never closes a market — INV-simultaneous-close.
  useEffect(() => {
    if (!market || market.status !== "open") {
      const id = setTimeout(() => setSecondsLeft(null), 0);
      return () => clearTimeout(id);
    }
    const tick = () => {
      const left = Math.round((new Date(market.closes_at).getTime() - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, left));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [market]);

  useEffect(() => {
    // Subscribe to ALL changes on markets (INSERT = new market opened, UPDATE = market closed).
    // INV-simultaneous-close: the UPDATE fires from the Postgres function on the server clock;
    // every subscriber receives it at the same instant via WAL replication.
    const channel = supabase
      .channel("market-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "markets" },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const m = payload.new as MarketRow;
            setMarket({ ...m, sealed_value: null });
            addLog(`Market opened id=${m.id.substring(0, 8)}… line=${m.line}`);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as { id: string; status: string };
            addLog(`DB change: market ${updated.id.substring(0, 8)}… → status=${updated.status}`);
            if (updated.status === "closed" || updated.status === "void") {
              // Query market_state — sealed_value is now revealed since status = 'closed'.
              // INV-sealed-value: the view returns null while open; this query only runs post-close.
              const { data, error } = await supabase
                .from("market_state")
                .select("*")
                .eq("id", updated.id)
                .single();
              if (error) { addLog(`fetch error: ${error.message}`); return; }
              setMarket(data as MarketRow);
              addLog(`REVEALED sealed_value=${data.sealed_value ?? "void"} line=${data.line}`);
            }
          }
        }
      )
      .subscribe((status) => {
        addLog(`Realtime channel: ${status}`);
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openMarket() {
    setOpening(true);
    addLog("→ POST /api/dev/open-market");
    const res = await fetch("/api/dev/open-market", { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      addLog(`ERROR: ${json.error}`);
    } else {
      const m = json.market as MarketRow;
      setMarket({ ...m, sealed_value: null });
      addLog(
        `Market opened id=${m.id.substring(0, 8)}… line=${m.line} closes=${new Date(m.closes_at).toLocaleTimeString()}`
      );
    }
    setOpening(false);
  }

  async function forceClose() {
    setClosing(true);
    addLog("→ POST /api/dev/close-markets");
    const res = await fetch("/api/dev/close-markets", { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      addLog(`ERROR: ${json.error}`);
    } else {
      const n = json.closed as number;
      if (n === 0) {
        addLog("close_expired_markets(): 0 markets closed (closes_at still in the future — wait for countdown to reach 0)");
      } else {
        addLog(`close_expired_markets(): ${n} market(s) closed — waiting for DB change event…`);
      }
    }
    setClosing(false);
  }

  async function fetchLatest() {
    const { data, error } = await supabase
      .from("market_state")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { addLog(`fetch error: ${error.message}`); return; }
    if (data) {
      setMarket(data as MarketRow);
      addLog(`Loaded market id=${data.id.substring(0, 8)}… status=${data.status}`);
    } else {
      addLog("No markets found.");
    }
  }

  const statusColor = market?.status === "open" ? "#22c55e" : market?.status === "closed" ? "#ef4444" : "#888";

  return (
    <main style={{ fontFamily: "monospace", padding: "1rem", maxWidth: 700 }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Live Bet — Step 1 Spine</h1>
      <p style={{ color: "#666", fontSize: "0.8rem", marginBottom: "1rem" }}>
        Open two tabs. Click &ldquo;Open Market&rdquo; in one tab. Both tabs subscribe to the
        same Broadcast channel. Click &ldquo;Force Close&rdquo; — both tabs must receive the
        broadcast and reveal the sealed value at the same instant.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button onClick={openMarket} disabled={opening} style={{ padding: "0.4rem 0.8rem" }}>
          {opening ? "Opening…" : "Open Market"}
        </button>
        <button onClick={forceClose} disabled={closing} style={{ padding: "0.4rem 0.8rem" }}>
          {closing ? "Closing…" : "Force Close"}
        </button>
        <button onClick={fetchLatest} style={{ padding: "0.4rem 0.8rem" }}>
          Fetch Latest
        </button>
      </div>

      {market && (
        <section style={{ border: "1px solid #ccc", padding: "0.75rem", marginBottom: "1rem" }}>
          <div style={{ marginBottom: "0.4rem" }}>
            <span style={{ fontWeight: "bold" }}>Market</span>
            {" "}
            <span style={{ color: statusColor, fontWeight: "bold" }}>{market.status.toUpperCase()}</span>
          </div>
          <pre style={{ margin: 0, fontSize: "0.78rem" }}>
{`id:           ${market.id}
type:         ${market.type}
line:         ${market.line} yards (over/under)
closes_at:    ${new Date(market.closes_at).toLocaleTimeString()}${secondsLeft !== null ? `  ← ${secondsLeft}s remaining (display only)` : ""}
sealed_value: ${market.sealed_value !== null ? `${market.sealed_value} yards ← REVEALED` : "(sealed until close)"}`}
          </pre>
        </section>
      )}

      <section>
        <strong>Event log</strong>
        <pre
          style={{
            background: "#111", color: "#0f0",
            padding: "0.5rem", fontSize: "0.72rem",
            height: 280, overflow: "auto", marginTop: "0.5rem",
          }}
        >
          {log.length === 0 ? "(waiting for events)" : log.join("\n")}
        </pre>
      </section>
    </main>
  );
}
