import { supabase } from "../lib/supabase";

export type TournamentPreview = { id: string; name: string; maxEntrants: number; entrantCount: number };
export type RequestOutcome = "member" | "pending" | "denied";
export type TournamentJoinRequest = {
  id: string;
  tournamentId: string;
  profileId: string;
  displayName: string;
  createdAt: string;
};
export type TournamentStaff = {
  id: string;
  tournamentId: string;
  profileId: string;
  role: "admin" | "scorer";
};

export async function getTournamentPreview(tournamentId: string): Promise<TournamentPreview | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("tournament_preview", { p_tournament_id: tournamentId });
  if (error) throw new Error(error.message);
  const row = (data as { id: string; name: string; max_entrants: number; entrant_count: number }[] | null)?.[0];
  if (!row) return null;
  return { id: row.id, name: row.name, maxEntrants: row.max_entrants ?? 0, entrantCount: row.entrant_count ?? 0 };
}

export async function requestJoinTournament(tournamentId: string): Promise<RequestOutcome> {
  if (!supabase) throw new Error("Sign in to request access");
  const { data, error } = await supabase.rpc("request_tournament_join", { p_tournament_id: tournamentId });
  if (error) throw new Error(error.message);
  return data as RequestOutcome;
}

export async function listPendingTournamentRequests(tournamentId: string): Promise<TournamentJoinRequest[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tournament_join_requests")
    .select("id, tournament_id, profile_id, created_at, profiles(display_name)")
    .eq("tournament_id", tournamentId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string; tournament_id: string; profile_id: string; created_at: string;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      tournamentId: row.tournament_id,
      profileId: row.profile_id,
      displayName: profile?.display_name || "Player",
      createdAt: row.created_at,
    };
  });
}

export async function approveTournamentRequest(requestId: string, clubPlayerId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage requests");
  const { error } = await supabase.rpc("approve_tournament_join", { p_request_id: requestId, p_club_player_id: clubPlayerId });
  if (error) throw new Error(error.message);
}

export async function denyTournamentRequest(requestId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage requests");
  const { error } = await supabase.rpc("deny_tournament_join", { p_request_id: requestId });
  if (error) throw new Error(error.message);
}

// Staff / Live ops management
export async function getTournamentStaff(tournamentId: string): Promise<TournamentStaff[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tournament_staff")
    .select("id, tournament_id, profile_id, role")
    .eq("tournament_id", tournamentId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    tournamentId: r.tournament_id,
    profileId: r.profile_id,
    role: r.role as "admin" | "scorer",
  }));
}
