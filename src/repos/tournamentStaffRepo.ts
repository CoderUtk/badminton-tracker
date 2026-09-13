import { supabase } from "../lib/supabase";
import type { FormatId } from "../tournament/types";

export type TournamentPreview = { id: string; name: string; maxEntrants: number; entrantCount: number };
export type RequestOutcome = "member" | "pending" | "denied";
export type TournamentJoinRequest = {
  id: string;
  tournamentId: string;
  profileId: string;
  displayName: string;
  createdAt: string;
  role: "player" | "scorer";
};
export type TournamentStaff = {
  id: string;
  tournamentId: string;
  profileId: string;
  role: "admin" | "scorer";
  displayName: string;
};

export type StaffRole = "admin" | "scorer";

/** The signed-in user's staff role for this tournament, or null if not staff. */
export async function myStaffRole(tournamentId: string): Promise<StaffRole | null> {
  if (!supabase) return null;
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("tournament_staff")
    .select("role")
    .eq("tournament_id", tournamentId)
    .eq("profile_id", uid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.role as StaffRole) ?? null;
}

export async function getTournamentPreview(tournamentId: string): Promise<TournamentPreview | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("tournament_preview", { p_tournament_id: tournamentId });
  if (error) throw new Error(error.message);
  const row = (data as { id: string; name: string; max_entrants: number; entrant_count: number }[] | null)?.[0];
  if (!row) return null;
  return { id: row.id, name: row.name, maxEntrants: row.max_entrants ?? 0, entrantCount: row.entrant_count ?? 0 };
}

export type SpectatorBracketCell = {
  round: number; idx: number; matchId: string | null;
  entrantA: string | null; entrantB: string | null; winnerEntrant: string | null;
  entrantAName: string | null; entrantBName: string | null;
  court: string | null; matchStatus: string | null;
  scoreSummary: { games: { A: number; B: number }[]; current?: { A: number; B: number } } | null;
  groupIdx: number | null; srcA: string | null; srcB: string | null;
};
export type SpectatorView = { name: string; status: string; format: FormatId; cells: SpectatorBracketCell[] };

/** Read-only bracket for the spectator join link. No membership required. */
export async function getTournamentSpectatorView(tournamentId: string): Promise<SpectatorView | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("tournament_spectator_view", { p_tournament_id: tournamentId });
  if (error) throw new Error(error.message);
  const rows = (data as {
    name: string; status: string; format: string | null;
    round: number | null; idx: number | null; match_id: string | null;
    entrant_a: string | null; entrant_b: string | null; winner_entrant: string | null;
    entrant_a_name: string | null; entrant_b_name: string | null;
    court: string | null; match_status: string | null;
    score_summary: SpectatorBracketCell["scoreSummary"];
    group_idx: number | null; src_a: string | null; src_b: string | null;
  }[] | null) ?? [];
  if (rows.length === 0) return null;
  return {
    name: rows[0].name,
    status: rows[0].status,
    // Absent (server hasn't had 0053 applied yet) or unrecognised both fall
    // back to single_elim — same "old row, old format" reasoning
    // toTournamentRow uses in tournamentRepo.ts.
    format: (rows[0].format as FormatId) ?? "single_elim",
    // A tournament with no bracket yet still returns one row (left join),
    // with round/idx null — that's "not started", not "not found".
    cells: rows[0].round == null ? [] : rows.map((r) => ({
      round: r.round as number, idx: r.idx as number, matchId: r.match_id,
      entrantA: r.entrant_a, entrantB: r.entrant_b, winnerEntrant: r.winner_entrant,
      entrantAName: r.entrant_a_name, entrantBName: r.entrant_b_name,
      court: r.court, matchStatus: r.match_status, scoreSummary: r.score_summary,
      // Absent on a pre-0053 server, same fallback as `format` above.
      groupIdx: r.group_idx ?? null, srcA: r.src_a ?? null, srcB: r.src_b ?? null,
    })),
  };
}

export async function requestJoinTournament(
  tournamentId: string,
  role: "player" | "scorer" = "player",
): Promise<RequestOutcome> {
  if (!supabase) throw new Error("Sign in to request access");
  const { data, error } = await supabase.rpc("request_tournament_join", {
    p_tournament_id: tournamentId,
    p_role: role,
  });
  if (error) throw new Error(error.message);
  return data as RequestOutcome;
}

export async function listPendingTournamentRequests(tournamentId: string): Promise<TournamentJoinRequest[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tournament_join_requests")
    .select("id, tournament_id, profile_id, created_at, role, profiles(display_name)")
    .eq("tournament_id", tournamentId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string; tournament_id: string; profile_id: string; created_at: string; role: "player" | "scorer";
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      tournamentId: row.tournament_id,
      profileId: row.profile_id,
      displayName: profile?.display_name || "Player",
      createdAt: row.created_at,
      role: row.role,
    };
  });
}

export async function approveTournamentRequest(requestId: string, clubPlayerId: string | null = null): Promise<void> {
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
    .select("id, tournament_id, profile_id, role, profiles(display_name)")
    .eq("tournament_id", tournamentId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string; tournament_id: string; profile_id: string; role: "admin" | "scorer";
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      tournamentId: row.tournament_id,
      profileId: row.profile_id,
      role: row.role,
      displayName: profile?.display_name || "Player",
    };
  });
}

export async function removeStaff(staffId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage staff");
  const { error } = await supabase.rpc("remove_tournament_staff", { p_staff_id: staffId });
  if (error) throw new Error(error.message);
}
