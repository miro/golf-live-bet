import { redirect } from "next/navigation";

// Dev round — matches the fixed UUID in supabase/seed.sql
const DEV_ROUND_ID = "00000000-0000-0000-0000-000000000020";

export default function Home() {
  redirect(`/round/${DEV_ROUND_ID}`);
}
