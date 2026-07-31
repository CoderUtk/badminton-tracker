import * as Crypto from "expo-crypto";
import { getDb } from "../db/db";
import { advanceWinner, bracketStatus, buildBracket } from "../tournament/bracket";
import type { BracketMatch, BracketSize, Entrant } from "../tournament/types";
import { bracketMatchToRow, rowToBracketMatch, changedRows, type BracketRow } from "../tournament/rows";
import { defaultConfig } from "../engine";
import { createMatch } from "./matchRepo";

export { bracketMatchToRow, rowToBracketMatch, changedRows } from "../tournament/rows";
export type { BracketRow } from "../tournament/rows";
export type TournamentRow = { id: string; clubId: string; name: string; size: number; status: string; createdAt: number };

// --- async persistence ------------------------------------------------------

export async function createTournament(
  clubId: string,
  name: string,
  size: BracketSize,
  entrants: { clubPlayerId: string; name: string; seed: number }[],
): Promise<string> {
  const db = await getDb();
  const tid = Crypto.randomUUID();
  const ents: Entrant[] = entrants.map((e) => ({
    id: Crypto.randomUUID(), clubPlayerId: e.clubPlayerId, name: e.name, seed: e.seed,
  }));
  const bracket = buildBracket(ents, size, tid, () => Crypto.randomUUID());
  await db?.runAsync(
    `insert into tournaments (id, club_id, name, format, size, status, created_at)
     values (?, ?, ?, 'single_elim', ?, 'draft', ?)`,
    tid, clubId, name, size, Date.now(),
  );
  for (const e of ents) {
    await db?.runAsync(
      "insert into tournament_entrants (id, tournament_id, club_player_id, seed) values (?, ?, ?, ?)",
      e.id, tid, e.clubPlayerId, e.seed,
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
  const rows = await db.getAllAsync<{ id: string; club_player_id: string; seed: number; name: string | null }>(
    `select e.id, e.club_player_id, e.seed, p.name as name
       from tournament_entrants e
       left join club_players_cache p on p.id = e.club_player_id
      where e.tournament_id = ? order by e.seed`,
    tournamentId,
  );
  return rows.map((r) => ({ id: r.id, clubPlayerId: r.club_player_id, name: r.name ?? "Player", seed: r.seed }));
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

export async function getTournament(
  id: string,
): Promise<{ tournament: TournamentRow; entrants: Entrant[]; bracket: BracketMatch[] }> {
  const db = await getDb();
  const row = await db?.getFirstAsync<Record<string, unknown>>("select * from tournaments where id = ?", id);
  const tournament: TournamentRow = {
    id: row?.id as string, clubId: (row?.club_id as string) ?? "", name: (row?.name as string) ?? "",
    size: (row?.size as number) ?? 0, status: (row?.status as string) ?? "draft", createdAt: (row?.created_at as number) ?? 0,
  };
  return { tournament, entrants: await loadEntrants(id), bracket: await loadBracket(id) };
}

export async function listTournaments(clubId: string): Promise<TournamentRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "select * from tournaments where club_id = ? order by created_at desc", clubId,
  );
  return rows.map((r) => ({
    id: r.id as string, clubId: (r.club_id as string) ?? "", name: (r.name as string) ?? "",
    size: (r.size as number) ?? 0, status: (r.status as string) ?? "draft", createdAt: (r.created_at as number) ?? 0,
  }));
}

/** Create a real match for a bracket cell (singles), link it, return matchId. */
export async function startBracketMatch(bracketMatchId: string): Promise<string> {
  const db = await getDb();
  const cell = await db?.getFirstAsync<BracketRow>("select * from bracket_matches where id = ?", bracketMatchId);
  if (!cell || !cell.entrant_a || !cell.entrant_b) throw new Error("Bracket cell missing an entrant");
  const entrants = await loadEntrants(cell.tournament_id);
  const byId = new Map(entrants.map((e) => [e.id, e]));
  const a = byId.get(cell.entrant_a);
  const b = byId.get(cell.entrant_b);
  if (!a || !b) throw new Error("Entrant not found");
  const trow = await db?.getFirstAsync<{ club_id: string }>("select club_id from tournaments where id = ?", cell.tournament_id);
  const config = defaultConfig({
    matchType: "singles",
    teams: { A: [{ id: "a0", name: a.name }], B: [{ id: "b0", name: b.name }] },
  });
  const matchId = await createMatch(
    config,
    [{ club_player_id: a.clubPlayerId, name: a.name }],
    [{ club_player_id: b.clubPlayerId, name: b.name }],
    trow?.club_id ?? null,
    null,
  );
  await db?.runAsync("update bracket_matches set match_id = ? where id = ?", matchId, bracketMatchId);
  return matchId;
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
