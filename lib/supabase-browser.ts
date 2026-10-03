"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_DASHBOARD_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_DASHBOARD_SUPABASE_ANON_KEY;
let browserClient: ReturnType<typeof createClient> | null = null;

export function hasBrowserSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function supabaseBrowser() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_DASHBOARD_SUPABASE_URL or NEXT_PUBLIC_DASHBOARD_SUPABASE_ANON_KEY"
    );
  }

  browserClient ??= createClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
}
