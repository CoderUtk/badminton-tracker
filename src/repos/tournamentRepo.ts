import * as Crypto from "expo-crypto";
import { getDb } from "../db/db";
import { supabase } from "../lib/supabase";
import type { BracketMatch, Entrant } from "../tournament/types";
import { rowToBracketMatch, bracketMatchToRow, type BracketRow } from "../tournament/rows";
import { pickBestOf } from "../tournament/format";
import { buildTournamentConfig } from "../tournament/matchConfig";
import { buildBracket } from "../tournament/bracket";
import { drawSizeFor, courtForIndex } from "../tournament/draw";
import { createMatch } from "./matchRepo";
import { listClubs, addGuestPlayer, listPlayers } from "./clubRepo";
import { readTournamentCore, writeTournamentCore } from "./tournamentCache";
import {
  rpcToFull, type FullViewPayload, type TournamentCore, type TournamentFull,
} from "../tournament/bundle";

export { bracketMatchToRow, rowToBracketMatch, changedRows } from "../tournament/rows";
export type { BracketRow } from "../tournament/rows";
export type MatchType = "singles" | "doubles";
export type TournamentRow = {
  id: string; clubId: string; name: string; size: number; status: string; createdAt: number;
  matchType: MatchType; bestOf: number; finalsBestOf: number; courts: number;
};

// --- async persistence ------------------------------------------------------

export async function createTournament(
  name: string,
  matchType: MatchType,
  bestOf: number,
  finalsBestOf: number,
  entrants: { clubPlayerId: string; clubPlayerId2?: string | null; name: string; seed: number }[],
  courts = 4,
): Promise<string> {
  if (!supabase) throw new Error("Sign in to create a tournament");
  const club = (await listClubs()).find((c) => c.personal);
  if (!club) throw new Error("No personal club — sign out and back in");
  const tid = Crypto.randomUUID();
  const ents: Entrant[] = entrants.map((e) => ({
    id: Crypto.randomUUID(), clubPlayerId: e.clubPlayerId, name: e.name, seed: e.seed,
    partnerClubPlayerId: e.clubPlayerId2 ?? null,
  }));

  // The draw is not known yet — no bracket exists until the tournament starts.
  const { error: tErr } = await supabase.from("tournaments").insert({
    id: tid, club_id: club.id, name, format: "single_elim", size: 0, status: "draft",
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

  return tid;
}

/**
 * Build the bracket for a draft and start it. buildBracket is the same tested
 * function used before this split; it already resolves byes, so an entrant
 * count short of the draw auto-advances.
 */
export async function startTournament(id: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to start a tournament");
  // Refresh rather than read: starting a tournament builds the bracket from
  // the entrant list, and building it from a stale cache would seed the draw
  // with entrants who have since been removed.
  const full = await refreshTournament(id);
  if (!full) throw new Error("Tournament not found");
  const { tournament, entrants } = full;
  const size = drawSizeFor(entrants.length);
  const bracket = buildBracket(entrants, size, id, () => Crypto.randomUUID());
  // Later rounds stay courtless and are assigned from Live Ops once their
  // feeders resolve.
  const withCourts = bracket.map((m) =>
    m.round === 1 ? { ...m, court: courtForIndex(m.index, tournament.courts) } : m,
  );
  const { error } = await supabase.rpc("start_tournament", {
    p_tournament_id: id,
    p_bracket: withCourts.map((m) => bracketMatchToRow(m)),
  });
  if (error) throw new Error(error.message);
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

/** Remove an entrant from a draft. Refused once a bracket exists. */
export async function removeEntrant(entrantId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to edit entrants");
  const { data, error } = await supabase
    .from("tournament_entrants").delete().eq("id", entrantId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not remove that player");
}

/** Set or clear an entrant's doubles partner. */
export async function pairEntrants(
  entrantId: string, partnerClubPlayerId: string | null,
): Promise<void> {
  if (!supabase) throw new Error("Sign in to edit entrants");
  const { data, error } = await supabase
    .from("tournament_entrants")
    .update({ club_player_id_2: partnerClubPlayerId })
    .eq("id", entrantId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not update that pair");
}

/**
 * Add a non-registered player to the club and enter them in the tournament.
 * addGuestPlayer returns void, so the new row is found by name in the refreshed
 * roster — the same approach the create screen already uses.
 */
export async function addGuestEntrant(
  tournamentId: string, clubId: string, name: string,
): Promise<void> {
  if (!supabase) throw new Error("Sign in to add players");
  const trimmed = name.trim();
  await addGuestPlayer(clubId, trimmed);
  const added = (await listPlayers(clubId)).find((p) => p.name === trimmed);
  if (!added) throw new Error("Could not add that player");

  const { data: seeds } = await supabase
    .from("tournament_entrants").select("seed")
    .eq("tournament_id", tournamentId).order("seed", { ascending: false }).limit(1);
  const nextSeed = ((seeds?.[0]?.seed as number) ?? 0) + 1;

  const { data, error } = await supabase
    .from("tournament_entrants")
    .insert({ id: Crypto.randomUUID(), tournament_id: tournamentId, club_player_id: added.id, seed: nextSeed })
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not add that player");
}

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

/** Cache-only read. Never touches the network. Null when never cached here. */
export async function readTournament(id: string): Promise<TournamentCore | null> {
  return readTournamentCore(id);
}

// One in-flight refresh per tournament id. Two screens (bracket + ops) plus a
// poll tick can all ask at once; without this they stampede the RPC and race
// each other's cache writes. Mirrors clubRepo's module-level `refreshing`
// guard, widened to a per-id map because tournaments are per-entity.
const inFlight = new Map<string, Promise<TournamentFull | null>>();

/**
 * One RPC, written through to the local cache.
 *
 * Returns the full bundle including staff data, which is deliberately NOT
 * cached (admin-only, not needed for first paint) — callers hold it in
 * component state.
 */
export async function refreshTournament(id: string): Promise<TournamentFull | null> {
  const existing = inFlight.get(id);
  if (existing) return existing;

  const run = (async (): Promise<TournamentFull | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("tournament_full_view", {
      p_tournament_id: id,
    });
    if (error) throw new Error(error.message);
    const row = (data as FullViewPayload[] | null)?.[0];
    if (!row) return null;
    const full = rpcToFull(row);
    await writeTournamentCore({
      tournament: full.tournament,
      entrants: full.entrants,
      bracket: full.bracket,
    });
    return full;
  })();

  inFlight.set(id, run);
  try {
    return await run;
  } finally {
    inFlight.delete(id);
  }
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
  // Personal clubs are hidden from the user, so a tournament in one shows no
  // club name rather than leaking "Personal" onto the row.
  const nameOf = new Map(clubs.map((c) => [c.id, c.personal ? "" : c.name]));
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

  // Everything up to the two writes below comes from cache. This used to be
  // five serial network reads (cell, tournament row, entrants, entrant names,
  // full bracket) before the scoring screen could open.
  const db = await getDb();
  const cellRow = await db?.getFirstAsync<BracketRow>(
    "select * from bracket_matches where id = ?", bracketMatchId
  );
  if (!cellRow) throw new Error("Bracket cell missing an entrant");
  const cell = rowToBracketMatch(cellRow);
  if (!cell.entrantA || !cell.entrantB) throw new Error("Bracket cell missing an entrant");

  let core = await readTournament(cell.tournamentId);
  if (!core) {
    const full = await refreshTournament(cell.tournamentId);
    if (!full) throw new Error("Tournament not found");
    core = full;
  }

  const byId = new Map(core.entrants.map((e) => [e.id, e]));
  const a = byId.get(cell.entrantA);
  const b = byId.get(cell.entrantB);
  if (!a || !b) throw new Error("Entrant not found");

  // An entrant's side is its own player plus, for doubles, its partner.
  // Entrant.name is the pre-joined "Ana / Bo" display string, so the two names
  // are recovered by splitting it. Fallbacks match the originals so a cold
  // roster still produces a startable match.
  const sideOf = (e: Entrant) => {
    const parts = e.name.split(" / ");
    const players = [{ club_player_id: e.clubPlayerId, name: parts[0] ?? "Player" }];
    if (e.partnerClubPlayerId) {
      players.push({ club_player_id: e.partnerClubPlayerId, name: parts[1] ?? "Player" });
    }
    return players;
  };
  const sideA = sideOf(a);
  const sideB = sideOf(b);

  const maxRound = Math.max(...core.bracket.map((m) => m.round));
  const bestOf = pickBestOf(
    cell.round, maxRound, core.tournament.bestOf, core.tournament.finalsBestOf
  ) as 1 | 3 | 5;
  const config = buildTournamentConfig(
    sideA.map((p) => ({ id: p.club_player_id, name: p.name })),
    sideB.map((p) => ({ id: p.club_player_id, name: p.name })),
    core.tournament.matchType, bestOf,
  );

  // Local row first (offline-capable point scoring once the match exists),
  // then push the match's own row to Supabase synchronously — bracket_matches
  // has a foreign key to matches(id), so it must exist there before it can be
  // linked. Only match_events (points) still queue through the regular
  // offline-first sync path in src/sync/runner.ts.
  const matchId = await createMatch(config, sideA, sideB, core.tournament.clubId, null);

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in to start a match");
  const { error: mErr } = await supabase.from("matches").insert({
    id: matchId, club_id: core.tournament.clubId, session_id: null,
    config, side_a: sideA, side_b: sideB, status: "live", created_by: uid,
  });
  if (mErr) throw new Error(mErr.message);
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

/** Assign a court before a match starts. Refused once the match is live — the RPC enforces it. */
export async function assignBracketMatchCourt(bracketMatchId: string, court: string | null): Promise<void> {
  if (!supabase) throw new Error("Sign in to assign a court");
  const { error } = await supabase.rpc("assign_bracket_court", {
    p_bracket_match_id: bracketMatchId, p_court: court,
  });
  if (error) throw new Error(error.message);
}

/** Lock a match to a scorer. Scorer must be a tournament staff/admin or just profile_id. */
export async function claimBracketMatch(bracketMatchId: string, profileId: string | null): Promise<void> {
  if (!supabase) throw new Error("Sign in to claim a match");
  const { error } = await supabase.from("bracket_matches").update({ scored_by: profileId }).eq("id", bracketMatchId);
  if (error) throw new Error(error.message);
}
