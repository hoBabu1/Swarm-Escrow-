import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import type { Database } from "./types.js";

// Service-role key: server-side only, bypasses RLS. Never expose this client
// or its key to the frontend.
export const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
