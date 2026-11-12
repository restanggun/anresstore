import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Hanya gunakan publishable/anon key. Jangan pernah berikan service role key. */
export function createBrowserClient(url: string, publishableKey: string) {
  if (!url || !publishableKey) throw new Error("Konfigurasi Supabase publik belum diisi.");
  return createClient<Database>(url, publishableKey);
}
