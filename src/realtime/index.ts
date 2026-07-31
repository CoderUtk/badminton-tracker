import { LocalBackend, type RealtimeBackend } from "./backend";
let instance: RealtimeBackend | null = null;
export function getRealtimeBackend(): RealtimeBackend {
  if (!instance) instance = new LocalBackend(); // swap to SupabaseBackend later
  return instance;
}
