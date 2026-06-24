"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Fixed seed UUIDs — must match supabase/seed.sql
const OBSERVERS = [
  { id: "00000000-0000-0000-0000-000000000041", name: "Observer A" },
  { id: "00000000-0000-0000-0000-000000000042", name: "Observer B" },
];

type MarketRow = {
  id: string;
  type: string;
  line: number;
  opens_at: string;
  closes_at: string;
  status: string;
  resolved_outcome: string | null;
  sealed_value: number | null;
};

type ParticipantRow = {
  id: string;
  user_id: string;
  display_name: string;
  bankroll: number;
};

type BetRow = {
  id: string;
  market_id: string;
  participant_id: string;
  selection: string;
  stake: number;
  payout: number | null;
};

export default function ObserverPage() {
  const [market, setMarket] = useState<MarketRow | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [bets, setBets] = useState<BetRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [stake, setStake] = useState(50);
  const [log, setLog] = useState<string[]>([]);
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [betting, setBetting] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const me = participants.find((p) => p.id === meId) ?? null;
  const myBet = bets.find((b) => b.market_id === market?.id && b.participant_id === meId) ?? null;

  function addLog(msg: string) {
    const ts = new Date().toISOString().substring(11, 23);
    setLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 60));
  }

  // Load participants + any existing bets on mount
  useEffect(() => {
    supabase
      .from("participants")
      .select("id, user_id, bankroll, users(display_name)")
      .eq("round_id", "00000000-0000-0000-0000-000000000020")
      .in("role", ["observer"])
      .then(({ data }) => {
        if (!data) return;
        setParticipants(
          data.map((p) => ({
            id: p.id,
            user_id: p.user_id,
            display_name: (p.users as unknown as { display_name: string } | null)?.display_name ?? p.id,
            bankroll: p.bankroll,
          }))
        );
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load bets for the current market when it changes
  useEffect(() => {
    if (!market) return;
    supabase
      .from("bets")
      .select("*")
      .eq("market_id", market.id)
      .then(({ data }) => { if (data) setBets(data as BetRow[]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market?.id]);

  // Display-only countdown — INV-simultaneous-close: never closes the market
  useEffect(() => {
    if (!market || market.status !== "open") {
      const id = setTimeout(() => setSecondsLeft(null), 0);
      return () => clearTimeout(id);
    }
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.round((new Date(market.closes_at).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [market]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("live-bet")
      // Markets: INSERT = new market, UPDATE = close/resolve
      .on("postgres_changes", { event: "*", schema: "public", table: "markets" },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const m = payload.new as MarketRow;
            setMarket({ ...m, sealed_value: null });
            setBets([]);
            addLog(`Market opened id=${m.id.substring(0, 8)}… line=${m.line}`);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as MarketRow;
            addLog(`Market → ${updated.status}${updated.resolved_outcome ? ` (${updated.resolved_outcome})` : ""}`);
            if (updated.status === "resolved" || updated.status === "void") {
              // Fetch revealed sealed_value now that market is closed
              const { data } = await supabase
                .from("market_state")
                .select("*")
                .eq("id", updated.id)
                .single();
              if (data) setMarket(data as MarketRow);
            }
          }
        }
      )
      // Participants: UPDATE = bankroll changed after resolution
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "participants" },
        (payload) => {
          const updated = payload.new as { id: string; bankroll: number };
          setParticipants((prev) =>
            prev.map((p) => p.id === updated.id ? { ...p, bankroll: updated.bankroll } : p)
          );
          const name = participants.find((p) => p.id === updated.id)?.display_name ?? updated.id.substring(0, 8);
          addLog(`${name} bankroll → ${updated.bankroll}`);
        }
      )
      // Bets: INSERT = new bet placed by any observer
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bets" },
        (payload) => {
          const updated = payload.new as BetRow;
          setBets((prev) => prev.map((b) => b.id === updated.id ? updated : b));
        }
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bets" },
        (payload) => {
          const inserted = payload.new as BetRow;
          setBets((prev) => [...prev.filter((b) => b.id !== inserted.id), inserted]);
          addLog(`Bet placed: ${inserted.selection} ${inserted.stake} coins`);
        }
      )
      .subscribe((status) => { addLog(`Realtime: ${status}`); });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openMarket() {
    setOpening(true);
    addLog("→ POST /api/dev/open-market");
    const res = await fetch("/api/dev/open-market", { method: "POST" });
    const json = await res.json();
    if (!res.ok) addLog(`ERROR: ${json.error}`);
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
      addLog(n === 0
        ? "0 markets closed — closes_at still in the future, wait for countdown"
        : `${n} market(s) resolved — waiting for DB change events…`);
    }
    setClosing(false);
  }

  async function placeBet(selection: "over" | "under") {
    if (!market || !meId) return;
    setBetting(true);
    addLog(`→ Betting ${stake} on ${selection}`);
    const res = await fetch("/api/dev/place-bet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ market_id: market.id, participant_id: meId, selection, stake }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      addLog(`Bet rejected: ${json.error}`);
    } else {
      addLog(`Bet accepted — bankroll now ${json.bankroll}`);
      setParticipants((prev) =>
        prev.map((p) => p.id === meId ? { ...p, bankroll: json.bankroll as number } : p)
      );
    }
    setBetting(false);
  }

  async function fetchLatest() {
    const { data } = await supabase
      .from("market_state")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setMarket(data as MarketRow);
      addLog(`Fetched market id=${data.id.substring(0, 8)}… status=${data.status}`);
      const { data: betData } = await supabase.from("bets").select("*").eq("market_id", data.id);
      if (betData) setBets(betData as BetRow[]);
    } else {
      addLog("No markets found.");
    }
  }

  const statusColor: Record<string, string> = {
    open: "#22c55e", resolved: "#3b82f6", void: "#f59e0b", closed: "#ef4444",
  };
  const isOpen = market?.status === "open";
  const canBet = isOpen && !!meId && !myBet && (secondsLeft ?? 1) > 0;

  return (
    <main style={{ fontFamily: "monospace", padding: "1rem", maxWidth: 800 }}>
      <h1 style={{ marginBottom: "0.5rem" }}>Live Bet — Step 2</h1>

      {/* ── Identity selector ── */}
      <section style={{ marginBottom: "1rem" }}>
        <strong>Who are you?</strong>{" "}
        {OBSERVERS.map((o) => (
          <button
            key={o.id}
            onClick={() => setMeId(o.id)}
            style={{
              marginLeft: "0.5rem", padding: "0.25rem 0.6rem",
              background: meId === o.id ? "#3b82f6" : undefined,
              color: meId === o.id ? "#fff" : undefined,
            }}
          >
            {o.name}
          </button>
        ))}
        {me && <span style={{ marginLeft: "0.75rem", color: "#888" }}>bankroll: {me.bankroll} coins</span>}
      </section>

      {/* ── Dev controls ── */}
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

      {/* ── Market panel ── */}
      {market && (
        <section style={{ border: "1px solid #ccc", padding: "0.75rem", marginBottom: "1rem" }}>
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>Market</strong>{" "}
            <span style={{ color: statusColor[market.status] ?? "#888", fontWeight: "bold" }}>
              {market.status.toUpperCase()}
            </span>
            {market.resolved_outcome && (
              <span style={{ marginLeft: "0.5rem", color: "#888" }}>
                → outcome: <strong>{market.resolved_outcome}</strong>
              </span>
            )}
          </div>
          <pre style={{ margin: 0, fontSize: "0.78rem" }}>
{`line:         ${market.line} yards (over / under)
closes_at:    ${new Date(market.closes_at).toLocaleTimeString()}${secondsLeft !== null ? `  ← ${secondsLeft}s (display only)` : ""}
sealed_value: ${market.sealed_value !== null ? `${market.sealed_value} yards ← REVEALED` : "(sealed until close)"}`}
          </pre>

          {/* ── Bet placement ── */}
          {isOpen && meId && (
            <div style={{ marginTop: "0.75rem", borderTop: "1px solid #eee", paddingTop: "0.75rem" }}>
              {myBet ? (
                <span style={{ color: "#888" }}>
                  Your bet: <strong>{myBet.selection}</strong> · {myBet.stake} coins
                  {myBet.payout !== null && ` · payout: ${myBet.payout}`}
                </span>
              ) : (
                <>
                  <label style={{ marginRight: "0.5rem" }}>Stake:</label>
                  <input
                    type="number"
                    value={stake}
                    min={1}
                    max={me?.bankroll ?? 1000}
                    onChange={(e) => setStake(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ width: 70, marginRight: "0.75rem" }}
                  />
                  <button
                    onClick={() => placeBet("over")}
                    disabled={!canBet || betting}
                    style={{ marginRight: "0.4rem", padding: "0.3rem 0.8rem" }}
                  >
                    Bet Over
                  </button>
                  <button
                    onClick={() => placeBet("under")}
                    disabled={!canBet || betting}
                    style={{ padding: "0.3rem 0.8rem" }}
                  >
                    Bet Under
                  </button>
                  {!meId && <span style={{ color: "#888", marginLeft: "0.5rem" }}>pick identity first</span>}
                </>
              )}
            </div>
          )}

          {/* ── Bets summary ── */}
          {bets.length > 0 && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.76rem", color: "#888" }}>
              {bets.map((b) => {
                const name = participants.find((p) => p.id === b.participant_id)?.display_name ?? b.participant_id.substring(0, 8);
                return (
                  <div key={b.id}>
                    {name}: {b.selection} · {b.stake} coins{b.payout !== null ? ` → payout ${b.payout}` : ""}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Leaderboard ── */}
      {participants.length > 0 && (
        <section style={{ border: "1px solid #ccc", padding: "0.75rem", marginBottom: "1rem" }}>
          <strong>Leaderboard</strong>
          {[...participants]
            .sort((a, b) => b.bankroll - a.bankroll)
            .map((p) => (
              <div key={p.id} style={{ marginTop: "0.25rem", fontSize: "0.82rem" }}>
                {p.display_name === (me?.display_name) ? "▶ " : "  "}
                {p.display_name}: {p.bankroll} coins
              </div>
            ))}
        </section>
      )}

      {/* ── Event log ── */}
      <section>
        <strong>Event log</strong>
        <pre style={{
          background: "#111", color: "#0f0", padding: "0.5rem",
          fontSize: "0.72rem", height: 240, overflow: "auto", marginTop: "0.5rem",
        }}>
          {log.length === 0 ? "(waiting)" : log.join("\n")}
        </pre>
      </section>
    </main>
  );
}
