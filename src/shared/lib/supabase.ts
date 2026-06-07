import { createClient } from "@supabase/supabase-js";
import { env } from "@/shared/lib/env";

const supabaseUrl = env.VITE_SUPABASE_URL ?? "https://example.supabase.co";
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY ?? "development-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
