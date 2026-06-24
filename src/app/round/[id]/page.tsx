import { createSSRClient } from "@/lib/supabase/server";
import LoginPrompt from "./LoginPrompt";
import JoinView from "./JoinView";
import PlayerView from "./PlayerView";
import ObserverView from "./ObserverView";

export const dynamic = "force-dynamic";

export default async function RoundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: roundId } = await params;
  const supabase = await createSSRClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <LoginPrompt roundId={roundId} />;
  }

  const { data: participant } = await supabase
    .from("participants")
    .select("id, role, bankroll")
    .eq("round_id", roundId)
    .eq("user_id", user.id)
    .maybeSingle();

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    "User";

  if (!participant) {
    return (
      <JoinView roundId={roundId} userId={user.id} displayName={displayName} />
    );
  }

  if (participant.role === "player") {
    return (
      <PlayerView
        roundId={roundId}
        participantId={participant.id}
        displayName={displayName}
      />
    );
  }

  return (
    <ObserverView
      roundId={roundId}
      participantId={participant.id}
      initialBankroll={participant.bankroll}
      displayName={displayName}
    />
  );
}
