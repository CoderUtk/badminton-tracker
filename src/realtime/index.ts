import { LocalBackend, type RealtimeBackend } from "./backend";
import { SupabaseBackend } from "./supabaseBackend";
import { supabase } from "../lib/supabase";

let instance: RealtimeBackend | null = null;

export function getRealtimeBackend(): RealtimeBackend {
  if (!instance) instance = supabase ? new SupabaseBackend(supabase as unknown as any) : new LocalBackend();
  return instance;
}
