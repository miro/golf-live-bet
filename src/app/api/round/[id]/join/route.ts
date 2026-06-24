import { NextRequest, NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

// POST /api/round/[id]/join
// Body: { role: 'player' | 'observer', user_id: string }
//
// Idempotent: unique constraint (round_id, user_id) means a second join for the
// same user is a no-op — the existing participant (with its bankroll) is returned.
// The bankroll is NEVER reset on revisit (INV-bankroll-scope).
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

  const { role } = await req.json();
  if (role !== "player" && role !== "observer") {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }

  // Use service_role so the insert can bypass any RLS on participants
  const supabase = createServiceClient();

  // Try to insert; ON CONFLICT means a returning participant gets DO NOTHING
  await supabase.from("participants").insert({
    round_id: roundId,
    user_id: user.id,
    role,
    bankroll: 1000,
  });
  // Ignore conflict errors (unique violation = already joined)

  // Always fetch the canonical participant row (preserves bankroll on revisit)
  const { data: participant, error } = await supabase
    .from("participants")
    .select("id, role, bankroll")
    .eq("round_id", roundId)
    .eq("user_id", user.id)
    .single();

  if (error || !participant) {
    return NextResponse.json({ error: "failed to create participant" }, { status: 500 });
  }

  return NextResponse.json(participant);
}
