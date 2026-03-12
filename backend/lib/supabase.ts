import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const { url, serviceRoleKey } = config.supabase;
    if (!url || !serviceRoleKey) {
      throw new Error("SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    client = createClient(url, serviceRoleKey);
  }
  return client;
}
