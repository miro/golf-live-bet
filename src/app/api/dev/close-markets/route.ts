import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Dev-only: manually trigger close_expired_markets() without waiting for pg_cron.
// Used to prove INV-simultaneous-close in two-tab tests.
// This route ONLY closes markets whose closes_at has already passed —
// the Postgres function enforces that; it is not a force-close bypass.
export async function POST() {
  const supabase = createServiceClient();
  const { data: closed, error } = await supabase.rpc("close_expired_markets");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, closed });
}
