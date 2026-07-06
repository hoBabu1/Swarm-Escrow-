import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Lazily constructed so a missing service-role key only fails requests that need it, not the build. */
export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  if (!process.env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not set — check .env.local");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — check .env.local");
  }

  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return client;
}
