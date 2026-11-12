import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Untuk server Next.js. Backend NestJS membuat client di modul server tersendiri. */
export function createServiceClient(url: string, serviceRoleKey: string) {
  if (!url || !serviceRoleKey) throw new Error("Konfigurasi Supabase server belum diisi.");
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
