// Mirrors apps/dashboard/lib/supabase/client.ts's anon-key-only pattern
// (SR-2: never the service-role key). AsyncStorage persists the session
// across app restarts; detectSessionInUrl is web-only and not applicable
// to a native client.
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
