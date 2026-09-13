/**
 * Pure mappers for the tournament read path.
 *
 * No native imports (no expo-sqlite, no supabase client) so this loads in
 * plain Jest — the same rule src/tournament/rows.ts follows.
 */
import type { BracketMatch, Entrant, FormatId } from "./types";
import { rowToBracketMatch, type BracketRow } from "./rows";
import type { MatchType, TournamentRow } from "../repos/tournamentRepo";
import type {
  StaffRole, TournamentJoinRequest, TournamentStaff,
} from "../repos/tournamentStaffRepo";

/** The part of a tournament that is cached locally. */
export type TournamentCore = {
  tournament: TournamentRow;
  entrants: Entrant[];
  bracket: BracketMatch[];
};

/**
 * Staff data. Deliberately NOT cached: admin-only, small, and not needed for
 * first paint, so it would cost two local tables for no latency benefit.
 */
export type TournamentStaffBundle = {
  myStaffRole: StaffRole | null;
  staff: TournamentStaff[];
  requests: TournamentJoinRequest[];
};

export type TournamentFull = TournamentCore & TournamentStaffBundle;

/** Entrant row shape shared by the local join and the RPC payload. */
export type EntrantNameRow = {
  id: string;
  club_player_id: string;
  club_player_id_2: string | null;
  seed: number;
  name1: string | null;
  name2: string | null;
};

export function entrantRowToEntrant(r: EntrantNameRow): Entrant {
  // Fallbacks mirror the originals in tournamentRepo: an unresolved name must
  // never blank a bracket cell.
  const name = r.club_player_id_2
    ? `${r.name1 ?? "P1"} / ${r.name2 ?? "P2"}`
    : (r.name1 ?? "Player");
  return {
    id: r.id,
    clubPlayerId: r.club_player_id,
    name,
    seed: r.seed,
    partnerClubPlayerId: r.club_player_id_2,
  };
}

/**
 * Local cache row -> TournamentRow.
 *
 * Distinct from tournamentRepo's toTournamentRow, which parses an ISO string:
 * the local created_at column is an integer millisecond timestamp and must NOT
 * be run through Date.parse. Merging the two would silently zero every cached
 * tournament's date.
 */
export function tournamentRowFromCache(r: Record<string, unknown>): TournamentRow {
  return {
    id: (r.id as string) ?? "",
    clubId: (r.club_id as string) ?? "",
    name: (r.name as string) ?? "",
    size: (r.size as number) ?? 0,
    status: (r.status as string) ?? "draft",
    createdAt: (r.created_at as number) ?? 0,
    matchType: (r.match_type as MatchType) ?? "singles",
    bestOf: (r.bestof as number) ?? 3,
    finalsBestOf: (r.finals_bestof as number) ?? 3,
    courts: (r.courts as number) ?? 4,
    format: ((r.format as FormatId) ?? "single_elim"),
    groupCount: (r.group_count as number) ?? null,
    advancePerGroup: (r.advance_per_group as number) ?? null,
  };
}

export type FullViewPayload = {
  tournament: Record<string, unknown> | null;
  entrants: EntrantNameRow[] | null;
  bracket: BracketRow[] | null;
  my_staff_role: string | null;
  staff: Record<string, unknown>[] | null;
  requests: Record<string, unknown>[] | null;
};

export function rpcToFull(p: FullViewPayload): TournamentFull {
  const t = p.tournament ?? {};
  return {
    tournament: {
      id: (t.id as string) ?? "",
      clubId: (t.club_id as string) ?? "",
      name: (t.name as string) ?? "",
      size: (t.size as number) ?? 0,
      status: (t.status as string) ?? "draft",
      createdAt: t.created_at ? Date.parse(t.created_at as string) : 0,
      matchType: (t.match_type as MatchType) ?? "singles",
      bestOf: (t.bestof as number) ?? 3,
      finalsBestOf: (t.finals_bestof as number) ?? 3,
      courts: (t.courts as number) ?? 4,
      format: ((t.format as FormatId) ?? "single_elim"),
      groupCount: (t.group_count as number) ?? null,
      advancePerGroup: (t.advance_per_group as number) ?? null,
    },
    entrants: (p.entrants ?? []).map(entrantRowToEntrant),
    bracket: (p.bracket ?? []).map(rowToBracketMatch),
    myStaffRole: (p.my_staff_role as StaffRole | null) ?? null,
    staff: (p.staff ?? []).map((s) => ({
      id: s.id as string,
      tournamentId: s.tournament_id as string,
      profileId: s.profile_id as string,
      role: s.role as "admin" | "scorer",
      // "Player" not "" — matches getTournamentStaff's existing fallback.
      displayName: (s.display_name as string) || "Player",
    })),
    requests: (p.requests ?? []).map((r) => ({
      id: r.id as string,
      tournamentId: r.tournament_id as string,
      profileId: r.profile_id as string,
      // "Player" not "" — matches listPendingTournamentRequests' fallback.
      displayName: (r.display_name as string) || "Player",
      createdAt: (r.created_at as string) ?? "",
      role: r.role as "player" | "scorer",
    })),
  };
}
