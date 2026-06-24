import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Fixed dev seed IDs (must match supabase/seed.sql)
const DEV_ROUND_ID    = "00000000-0000-0000-0000-000000000020";
const DEV_AUTHOR_ID   = "00000000-0000-0000-0000-000000000010";
const DEV_DRIVE_TYPE  = "00000000-0000-0000-0000-000000000030";

// INV-noninteger-line: line is always non-integer
const DRIVE_LINE_YARDS = 250.5;

// Window duration for step-1 demo.
// 30s is short enough to verify quickly; pg_cron still sweeps within 60s
// so auto-close fires within one extra minute if Force Close isn't used.
const WINDOW_SECONDS = 30;

// INV-sealed-value: value is set server-side and stored in events.sealed_value.
// It is never returned to the client; only revealed via market_state after close.
const DEV_SEALED_YARDS = 275.3;

export async function POST() {
  const supabase = createServiceClient();

  // Create the event with the sealed value
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      round_id:         DEV_ROUND_ID,
      type_id:          DEV_DRIVE_TYPE,
      author_id:        DEV_AUTHOR_ID,
      sealed_value:     DEV_SEALED_YARDS,
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
      event_id:  event.id,
      type:      "over_under",
      line:      DRIVE_LINE_YARDS,
      closes_at: closesAt,
      status:    "open",
      house_seed: 100,
    })
    .select("id, type, line, opens_at, closes_at, status")
    .single();

  if (marketError) {
    return NextResponse.json({ error: marketError.message }, { status: 500 });
  }

  return NextResponse.json({ market });
}
