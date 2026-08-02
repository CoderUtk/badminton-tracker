import * as Crypto from "expo-crypto";
import { getDb } from "../db/db";
import { advanceWinner, bracketStatus, buildBracket } from "../tournament/bracket";
import type { BracketMatch, BracketSize, Entrant } from "../tournament/types";
import { bracketMatchToRow, rowToBracketMatch, changedRows, type BracketRow } from "../tournament/rows";
import { pickBestOf } from "../tournament/format";
import { buildTournamentConfig } from "../tournament/matchConfig";
import { createMatch } from "./matchRepo";

export { bracketMatchToRow, rowToBracketMatch, changedRows } from "../tournament/rows";
export type { BracketRow } from "../tournament/rows";
export type MatchType = "singles" | "doubles";
export type TournamentRow = {
  id: string; clubId: string; name: string; size: number; status: string; createdAt: number;
  matchType: MatchType; bestOf: number; finalsBestOf: number;
};

type EntrantRow = {
  id: string; club_player_id: string; club_player_id_2: string | null; seed: number;
  name1: string | null; name2: string | null;
};
const ENTRANT_SELECT = `
  select e.id, e.club_player_id, e.club_player_id_2, e.seed,
         p1.name as name1, p2.name as name2
    from tournament_entrants e
    left join club_players_cache p1 on p1.id = e.club_player_id
    left join club_players_cache p2 on p2.id = e.club_player_id_2
   where e.tournament_id = ? order by e.seed`;

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
): Promise<string> {
  const db = await getDb();
  const tid = Crypto.randomUUID();
  const ents: Entrant[] = entrants.map((e) => ({
    id: Crypto.randomUUID(), clubPlayerId: e.clubPlayerId, name: e.name, seed: e.seed,
  }));
  const bracket = buildBracket(ents, size, tid, () => Crypto.randomUUID());
  await db?.runAsync(
    `insert into tournaments (id, club_id, name, format, size, status, created_at, match_type, bestof, finals_bestof)
     values (?, ?, ?, 'single_elim', ?, 'draft', ?, ?, ?, ?)`,
    tid, clubId, name, size, Date.now(), matchType, bestOf, finalsBestOf,
  );
  for (let i = 0; i < ents.length; i++) {
    await db?.runAsync(
      "insert into tournament_entrants (id, tournament_id, club_player_id, seed, club_player_id_2) values (?, ?, ?, ?, ?)",
      ents[i].id, tid, ents[i].clubPlayerId, ents[i].seed, entrants[i].clubPlayerId2 ?? null,
    );
  }
  for (const m of bracket) {
    const r = bracketMatchToRow(m);
    await db?.runAsync(
      `insert into bracket_matches (id, tournament_id, round, idx, match_id, entrant_a, entrant_b, winner_entrant)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      r.id, r.tournament_id, r.round, r.idx, r.match_id, r.entrant_a, r.entrant_b, r.winner_entrant,
    );
  }
  return tid;
}

async function loadEntrants(tournamentId: string): Promise<Entrant[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<EntrantRow>(ENTRANT_SELECT, tournamentId);
  return rows.map((r) => ({ id: r.id, clubPlayerId: r.club_player_id, name: entrantName(r), seed: r.seed }));
}

/** Per-entrant player list (1 for singles, 2 for doubles) for building a MatchConfig. */
async function loadEntrantSides(tournamentId: string): Promise<Map<string, { club_player_id: string; name: string }[]>> {
  const db = await getDb();
  const map = new Map<string, { club_player_id: string; name: string }[]>();
  if (!db) return map;
  const rows = await db.getAllAsync<EntrantRow>(ENTRANT_SELECT, tournamentId);
  for (const r of rows) {
    const players = [{ club_player_id: r.club_player_id, name: r.name1 ?? "Player" }];
    if (r.club_player_id_2) players.push({ club_player_id: r.club_player_id_2, name: r.name2 ?? "Player" });
    map.set(r.id, players);
  }
  return map;
}

async function loadBracket(tournamentId: string): Promise<BracketMatch[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<BracketRow>(
    "select * from bracket_matches where tournament_id = ? order by round, idx",
    tournamentId,
  );
  return rows.map(rowToBracketMatch);
}

const toTournamentRow = (r: Record<string, unknown>): TournamentRow => ({
  id: r.id as string, clubId: (r.club_id as string) ?? "", name: (r.name as string) ?? "",
  size: (r.size as number) ?? 0, status: (r.status as string) ?? "draft", createdAt: (r.created_at as number) ?? 0,
  matchType: ((r.match_type as MatchType) ?? "singles"), bestOf: (r.bestof as number) ?? 3, finalsBestOf: (r.finals_bestof as number) ?? 3,
});

export async function getTournament(
  id: string,
): Promise<{ tournament: TournamentRow; entrants: Entrant[]; bracket: BracketMatch[] }> {
  const db = await getDb();
  const row = await db?.getFirstAsync<Record<string, unknown>>("select * from tournaments where id = ?", id);
  return { tournament: toTournamentRow(row ?? {}), entrants: await loadEntrants(id), bracket: await loadBracket(id) };
}

export async function listTournaments(clubId: string): Promise<TournamentRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "select * from tournaments where club_id = ? order by created_at desc", clubId,
  );
  return rows.map(toTournamentRow);
}

/** Create a real match for a bracket cell (singles or doubles), link it, return matchId. */
export async function startBracketMatch(bracketMatchId: string): Promise<string> {
  const db = await getDb();
  const cell = await db?.getFirstAsync<BracketRow>("select * from bracket_matches where id = ?", bracketMatchId);
  if (!cell || !cell.entrant_a || !cell.entrant_b) throw new Error("Bracket cell missing an entrant");
  const trow = await db?.getFirstAsync<{ club_id: string; match_type: string; bestof: number; finals_bestof: number }>(
    "select club_id, match_type, bestof, finals_bestof from tournaments where id = ?", cell.tournament_id,
  );
  const sides = await loadEntrantSides(cell.tournament_id);
  const a = sides.get(cell.entrant_a);
  const b = sides.get(cell.entrant_b);
  if (!a || !b) throw new Error("Entrant not found");
  const bracket = await loadBracket(cell.tournament_id);
  const maxRound = Math.max(...bracket.map((m) => m.round));
  const matchType = (trow?.match_type as MatchType) ?? "singles";
  const bestOf = pickBestOf(cell.round, maxRound, trow?.bestof ?? 3, trow?.finals_bestof ?? 3) as 1 | 3 | 5;
  const config = buildTournamentConfig(
    a.map((p) => ({ id: p.club_player_id, name: p.name })),
    b.map((p) => ({ id: p.club_player_id, name: p.name })),
    matchType, bestOf,
  );
  const matchId = await createMatch(
    config,
    a.map((p) => ({ club_player_id: p.club_player_id, name: p.name })),
    b.map((p) => ({ club_player_id: p.club_player_id, name: p.name })),
    trow?.club_id ?? null,
    null,
  );
  await db?.runAsync("update bracket_matches set match_id = ? where id = ?", matchId, bracketMatchId);
  return matchId;
}

/**
 * Hard-delete a tournament and its bracket structure. Matches created under
 * it survive, unlinked — SQLite has no FK cascade locally, so entrants and
 * bracket cells are removed explicitly rather than relying on the cascade
 * the Supabase schema declares (0002_tournaments.sql:12,18).
 */
export async function deleteTournament(id: string): Promise<void> {
  const db = await getDb();
  await db?.runAsync("delete from tournament_entrants where tournament_id = ?", id);
  await db?.runAsync("delete from bracket_matches where tournament_id = ?", id);
  await db?.runAsync("delete from tournaments where id = ?", id);
}

/** Record a bracket-cell winner: advance the bracket and persist changed rows + tournament status. */
export async function finishBracketMatch(bracketMatchId: string, winnerEntrant: string): Promise<void> {
  const db = await getDb();
  const cell = await db?.getFirstAsync<{ tournament_id: string }>(
    "select tournament_id from bracket_matches where id = ?", bracketMatchId,
  );
  if (!cell) return;
  const before = await loadBracket(cell.tournament_id);
  const after = advanceWinner(before, bracketMatchId, winnerEntrant);
  for (const m of changedRows(before, after)) {
    await db?.runAsync(
      "update bracket_matches set entrant_a = ?, entrant_b = ?, winner_entrant = ?, match_id = ? where id = ?",
      m.entrantA, m.entrantB, m.winnerEntrant, m.matchId, m.id,
    );
  }
  const status = bracketStatus(after).status === "done" ? "done" : "live";
  await db?.runAsync("update tournaments set status = ? where id = ?", status, cell.tournament_id);
}
