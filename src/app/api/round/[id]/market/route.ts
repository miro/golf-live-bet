import { NextRequest, NextResponse } from "next/server";
import { createSSRClient, createServiceClient } from "@/lib/supabase/server";

// POST /api/round/[id]/market
// Body: { event_type_id, hole, sealed_value, line }
//
// Creates an event (sealed_value stored server-side) and opens a market.
// Returns { market_id, sealed_value, closes_at } to the submitting player.
//
// INV-sealed-value: sealed_value is stored in events, masked by market_state
// view until close. Observers never see it until resolution.
//
// INV-betting-knowledge-wall: only participants with role='player' may call this.

const WINDOW_SECONDS = 30;
const HOUSE_SEED = 100;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roundId } = await params;

  // Verify the caller is authenticated
  const ssrClient = await createSSRClient();
  const {
    data: { user },
  } = await ssrClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  // Verify they are a player in this round
  const { data: participant } = await ssrClient
    .from("participants")
    .select("id, role")
    .eq("round_id", roundId)
    .eq("user_id", user.id)
    .single();

  if (!participant) {
    return NextResponse.json({ error: "not a participant in this round" }, { status: 403 });
  }
  if (participant.role !== "player") {
    return NextResponse.json({ error: "only players may open markets" }, { status: 403 });
  }

  const { event_type_id, hole, sealed_value, line } = await req.json();

  if (!event_type_id || sealed_value == null || !line) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // INV-noninteger-line enforced by DB CHECK; return 400 early for clearer error
  if (line === Math.floor(line)) {
    return NextResponse.json({ error: "line must be non-integer (INV-noninteger-line)" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      round_id: roundId,
      type_id: event_type_id,
      author_id: user.id,
      hole: hole ?? null,
      sealed_value: Number(sealed_value),
      value_entered_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  const closesAt = new Date(Date.now() + WINDOW_SECONDS * 1000).toISOString();

  const { data: market, error: marketError } = await supabase
    .from("markets")
    .insert({
      event_id: event.id,
      type: "over_under",
      line: Number(line),
      closes_at: closesAt,
      status: "open",
      house_seed: HOUSE_SEED,
    })
    .select("id, line, closes_at, status")
    .single();

  if (marketError) {
    return NextResponse.json({ error: marketError.message }, { status: 500 });
  }

  // Return sealed_value to the player only — this is their confirmation.
  // Observers receive NULL via market_state view until close (INV-sealed-value).
  return NextResponse.json({
    market_id: market.id,
    line: market.line,
    closes_at: market.closes_at,
    sealed_value: Number(sealed_value),
  });
}
