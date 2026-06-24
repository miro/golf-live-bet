import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

// Service-role client — bypasses RLS; for privileged server-side writes only.
// Never use this on auth-gated routes to read user-specific data.
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// SSR client — uses the anon key + the request's session cookies.
// auth.uid() is resolvable inside RLS policies for authenticated users.
// Use this in Server Components and Route Handlers that need to know who the
// logged-in user is without bypassing RLS.
export async function createSSRClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is a no-op inside Server Components; middleware handles refresh.
          }
        },
      },
    }
  );
}
