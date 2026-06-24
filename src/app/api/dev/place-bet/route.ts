import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { market_id, participant_id, selection, stake } = await req.json();

  if (!market_id || !participant_id || !selection || !stake) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("place_bet", {
    p_market_id:      market_id,
    p_participant_id: participant_id,
    p_selection:      selection,
    p_stake:          stake,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // place_bet returns { error } on validation failure or { bet_id, bankroll } on success
  const result = data as Record<string, unknown>;
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json(result);
}
