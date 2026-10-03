import { createClient } from "@supabase/supabase-js";

import { requireEnv } from "./env";

export function dashboardSupabaseAdmin() {
  return createClient(
    requireEnv("DASHBOARD_SUPABASE_URL"),
    requireEnv("DASHBOARD_SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}
