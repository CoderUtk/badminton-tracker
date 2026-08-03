import * as Crypto from "expo-crypto";
import { getDb } from "../db/db";
import { supabase } from "../lib/supabase";
import { buildBracket } from "../tournament/bracket";
import type { BracketMatch, BracketSize, Entrant } from "../tournament/types";
import { bracketMatchToRow, rowToBracketMatch, type BracketRow } from "../tournament/rows";
import { pickBestOf } from "../tournament/format";
import { buildTournamentConfig } from "../tournament/matchConfig";
import { createMatch } from "./matchRepo";
import { listClubs } from "./clubRepo";

export { bracketMatchToRow, rowToBracketMatch, changedRows } from "../tournament/rows";
export type { BracketRow } from "../tournament/rows";
export type MatchType = "singles" | "doubles";
export type TournamentRow = {
  id: string; clubId: string; name: string; size: number; status: string; createdAt: number;
  matchType: MatchType; bestOf: number; finalsBestOf: number; courts: number;
};

type EntrantRow = {
  id: string; club_player_id: string; club_player_id_2: string | null; seed: number;
  name1: string | null; name2: string | null;
};
const entrantName = (r: EntrantRow) =>
  r.club_player_id_2 ? `${r.name1 ?? "P1"} / ${r.name2 ?? "P2"}` : (r.name1 ?? "Player");

// --- async persistence ------------------------------------------------------

export async function createTournament(
  clubId: string,
  name: string,
  size: BracketSize,
  matchType: MatchType,
  bestOf: number,
  finalsBestOf: number,
  entrants: { clubPlayerId: string; clubPlayerId2?: string | null; name: string; seed: number }[],
  courts = 4,
): Promise<string> {
  if (!supabase) throw new Error("Sign in to create a tournament");
  const tid = Crypto.randomUUID();
  const ents: Entrant[] = entrants.map((e) => ({
    id: Crypto.randomUUID(), clubPlayerId: e.clubPlayerId, name: e.name, seed: e.seed,
  }));
  const bracket = buildBracket(ents, size, tid, () => Crypto.randomUUID());

  const { error: tErr } = await supabase.from("tournaments").insert({
    id: tid, club_id: clubId, name, format: "single_elim", size, status: "draft",
    match_type: matchType, bestof: bestOf, finals_bestof: finalsBestOf, courts,
  });
  if (tErr) throw new Error(tErr.message);

  const { error: eErr } = await supabase.from("tournament_entrants").insert(
    ents.map((e, i) => ({
      id: e.id, tournament_id: tid, club_player_id: e.clubPlayerId, seed: e.seed,
      club_player_id_2: entrants[i].clubPlayerId2 ?? null,
    })),
  );
  if (eErr) throw new Error(eErr.message);

  const { error: bErr } = await supabase.from("bracket_matches").insert(
    bracket.map((m) => bracketMatchToRow(m)),
  );
  if (bErr) throw new Error(bErr.message);

  return tid;
}

async function loadEntrantNames(playerIds: string[]): Promise<Map<string, string>> {
  if (!supabase || playerIds.length === 0) return new Map();
  const { data } = await supabase.from("club_players").select("id, name").in("id", playerIds);
  return new Map((data ?? []).map((p) => [p.id as string, p.name as string]));
}

async function loadEntrants(tournamentId: string): Promise<Entrant[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("tournament_entrants")
    .select("id, club_player_id, club_player_id_2, seed")
    .eq("tournament_id", tournamentId)
    .order("seed");
  const rows = (data ?? []) as EntrantRow[];
  const ids = rows.flatMap((r) => [r.club_player_id, r.club_player_id_2].filter((x): x is string => !!x));
  const names = await loadEntrantNames(ids);
  return rows.map((r) => ({
    id: r.id,
    clubPlayerId: r.club_player_id,
    name: entrantName({ ...r, name1: names.get(r.club_player_id) ?? null, name2: r.club_player_id_2 ? names.get(r.club_player_id_2) ?? null : null }),
    seed: r.seed,
  }));
}

/** Per-entrant player list (1 for singles, 2 for doubles) for building a MatchConfig. */
async function loadEntrantSides(tournamentId: string): Promise<Map<string, { club_player_id: string; name: string }[]>> {
  if (!supabase) return new Map();
  const { data } = await supabase
    .from("tournament_entrants")
    .select("id, club_player_id, club_player_id_2")
    .eq("tournament_id", tournamentId);
  const rows = (data ?? []) as EntrantRow[];
  const ids = rows.flatMap((r) => [r.club_player_id, r.club_player_id_2].filter((x): x is string => !!x));
  const names = await loadEntrantNames(ids);
  const map = new Map<string, { club_player_id: string; name: string }[]>();
  for (const r of rows) {
    const players = [{ club_player_id: r.club_player_id, name: names.get(r.club_player_id) ?? "Player" }];
    if (r.club_player_id_2) players.push({ club_player_id: r.club_player_id_2, name: names.get(r.club_player_id_2) ?? "Player" });
    map.set(r.id, players);
  }
  return map;
}

async function loadBracket(tournamentId: string): Promise<BracketMatch[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("bracket_matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("round")
    .order("idx");
  return (data ?? []).map((row) => rowToBracketMatch(row as BracketRow));
}

const toTournamentRow = (r: Record<string, unknown>): TournamentRow => ({
  id: r.id as string, clubId: (r.club_id as string) ?? "", name: (r.name as string) ?? "",
  size: (r.size as number) ?? 0, status: (r.status as string) ?? "draft",
  createdAt: r.created_at ? new Date(r.created_at as string).getTime() : 0,
  matchType: ((r.match_type as MatchType) ?? "singles"), bestOf: (r.bestof as number) ?? 3, finalsBestOf: (r.finals_bestof as number) ?? 3,
  // 4 matches both the column default and the court count the ops screen used
  // to hardcode, so a row read before 0009 lands behaves as it always did.
  courts: (r.courts as number) ?? 4,
});

/**
 * Update a tournament's editable settings. Admins only (enforced by RLS in
 * 0009). Format and draw size are deliberately absent: changing either would
 * invalidate the bracket and its entrants.
 *
 * bestOf/finalsBestOf affect only matches started after the change, since
 * startBracketMatch snapshots the config when it creates the match.
 */
export async function updateTournament(
  id: string,
  patch: { name: string; courts: number; bestOf: number; finalsBestOf: number },
): Promise<void> {
  if (!supabase) throw new Error("Sign in to edit a tournament");
  const { data, error } = await supabase
    .from("tournaments")
    .update({
      name: patch.name, courts: patch.courts,
      bestof: patch.bestOf, finals_bestof: patch.finalsBestOf,
    })
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  // A policy-blocked update returns success with zero rows.
  if (!data || data.length === 0) throw new Error("Could not update tournament");
}

export async function getTournament(
  id: string,
): Promise<{ tournament: TournamentRow; entrants: Entrant[]; bracket: BracketMatch[] }> {
  if (!supabase) return { tournament: toTournamentRow({}), entrants: [], bracket: [] };
  const { data: row, error } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
  // Without this the screen renders a blank tournament on any read failure,
  // which looks like a deleted tournament rather than an error.
  if (error) throw new Error(error.message);
  return {
    tournament: toTournamentRow((row as Record<string, unknown>) ?? {}),
    entrants: await loadEntrants(id),
    bracket: await loadBracket(id),
  };
}

export async function listTournaments(clubId: string): Promise<TournamentRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toTournamentRow(row as Record<string, unknown>));
}

export type TournamentListRow = TournamentRow & { clubName: string };

/**
 * Every tournament across all of the user's clubs, newest first.
 *
 * The Cups tab is top-level with no club in its route, so it cannot be
 * club-scoped. It previously used clubs[0], hiding every other club's
 * tournaments — and with an empty clubs_cache the id was "", making
 * .eq("club_id", "") a uuid type error that the old code swallowed into an
 * empty list.
 */
export async function listAllTournaments(): Promise<TournamentListRow[]> {
  if (!supabase) return [];
  const clubs = await listClubs();
  // The one legitimate empty case. It must not reach the query: an empty `in`
  // list is pointless and an empty string is a type error.
  if (clubs.length === 0) return [];
  const nameOf = new Map(clubs.map((c) => [c.id, c.name]));
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .in("club_id", clubs.map((c) => c.id))
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const t = toTournamentRow(row as Record<string, unknown>);
    return { ...t, clubName: nameOf.get(t.clubId) ?? "" };
  });
}

/** Create a real match for a bracket cell (singles or doubles), link it, return matchId. */
export async function startBracketMatch(bracketMatchId: string): Promise<string> {
  if (!supabase) throw new Error("Sign in to start a match");
  const { data: cellRow } = await supabase.from("bracket_matches").select("*").eq("id", bracketMatchId).maybeSingle();
  const cell = cellRow ? rowToBracketMatch(cellRow as BracketRow) : null;
  if (!cell || !cell.entrantA || !cell.entrantB) throw new Error("Bracket cell missing an entrant");

  const { data: trow } = await supabase
    .from("tournaments")
    .select("club_id, match_type, bestof, finals_bestof")
    .eq("id", cell.tournamentId)
    .maybeSingle();
  if (!trow) throw new Error("Tournament not found");

  const sides = await loadEntrantSides(cell.tournamentId);
  const a = sides.get(cell.entrantA);
  const b = sides.get(cell.entrantB);
  if (!a || !b) throw new Error("Entrant not found");

  const bracket = await loadBracket(cell.tournamentId);
  const maxRound = Math.max(...bracket.map((m) => m.round));
  const matchType = (trow.match_type as MatchType) ?? "singles";
  const bestOf = pickBestOf(cell.round, maxRound, trow.bestof ?? 3, trow.finals_bestof ?? 3) as 1 | 3 | 5;
  const sideA = a.map((p) => ({ club_player_id: p.club_player_id, name: p.name }));
  const sideB = b.map((p) => ({ club_player_id: p.club_player_id, name: p.name }));
  const config = buildTournamentConfig(
    sideA.map((p) => ({ id: p.club_player_id, name: p.name })),
    sideB.map((p) => ({ id: p.club_player_id, name: p.name })),
    matchType, bestOf,
  );

  // Local row first (offline-capable point scoring once the match exists),
  // then push the match's own row to Supabase synchronously — bracket_matches
  // has a foreign key to matches(id), so it must exist there before it can be
  // linked. Only match_events (points) still queue through the regular
  // offline-first sync path in src/sync/runner.ts.
  const matchId = await createMatch(config, sideA, sideB, trow.club_id as string, null);

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in to start a match");
  const { error: mErr } = await supabase.from("matches").insert({
    id: matchId, club_id: trow.club_id, session_id: null,
    config, side_a: sideA, side_b: sideB, status: "live", created_by: uid,
  });
  if (mErr) throw new Error(mErr.message);
  const db = await getDb();
  await db?.runAsync("update matches set synced = 1 where id = ?", matchId);

  const { data: linkedRow, error: linkErr } = await supabase
    .from("bracket_matches")
    .update({ match_id: matchId })
    .eq("id", bracketMatchId)
    .is("match_id", null)
    .select();
  if (linkErr) throw new Error(linkErr.message);
  if (!linkedRow || linkedRow.length === 0) throw new Error("This match was already started");
  return matchId;
}

/**
 * Hard-delete a tournament and its bracket structure. `tournament_entrants`
 * and `bracket_matches` cascade from `tournaments` in Supabase
 * (0002_tournaments.sql:12,18), so deleting the parent row is sufficient.
 * The DELETE policy on `tournaments` (0006_tournament_sync.sql) means a
 * blocked delete returns zero rows with no error — we treat that as failure
 * rather than letting the UI navigate away believing it worked.
 */
export async function deleteTournament(id: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to delete a tournament");
  const { data, error } = await supabase.from("tournaments").delete().eq("id", id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not delete tournament");
  // Cleanup for any pre-migration tournament that still has a local row.
  const db = await getDb();
  await db?.runAsync("delete from tournament_entrants where tournament_id = ?", id);
  await db?.runAsync("delete from bracket_matches where tournament_id = ?", id);
  await db?.runAsync("delete from tournaments where id = ?", id);
}

/** Record a bracket-cell winner: advance the bracket via atomic RPC. */
export async function finishBracketMatch(bracketMatchId: string, winnerEntrant: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to record a result");
  const { error } = await supabase.rpc("finish_bracket_match", {
    p_bracket_match_id: bracketMatchId, p_winner_entrant: winnerEntrant,
  });
  if (error) throw new Error(error.message);
}

/** Assign a court to a match before or while it runs. Null clears it. */
export async function assignBracketMatchCourt(bracketMatchId: string, court: string | null): Promise<void> {
  if (!supabase) throw new Error("Sign in to assign a court");
  const { error } = await supabase.from("bracket_matches").update({ court }).eq("id", bracketMatchId);
  if (error) throw new Error(error.message);
}

/** Lock a match to a scorer. Scorer must be a tournament staff/admin or just profile_id. */
export async function claimBracketMatch(bracketMatchId: string, profileId: string | null): Promise<void> {
  if (!supabase) throw new Error("Sign in to claim a match");
  const { error } = await supabase.from("bracket_matches").update({ scored_by: profileId }).eq("id", bracketMatchId);
  if (error) throw new Error(error.message);
}
