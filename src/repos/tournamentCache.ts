/**
 * Local SQLite cache for tournament core data (metadata, entrants, bracket).
 *
 * These tables have existed since the first tournament migration
 * (src/db/schema.ts) but went unused when tournamentRepo moved to network-only
 * reads in the 2026-08-02 cloud-sync work. This restores them as a latency
 * buffer, not an offline store: every tournament WRITE still requires a
 * connection and still fails loudly offline. See the P1 spec for why that
 * earlier decision is superseded on latency but preserved on offline.
 */
import { getDb } from "../db/db";
import {
  entrantRowToEntrant, tournamentRowFromCache,
  type EntrantNameRow, type TournamentCore,
} from "../tournament/bundle";
import { bracketMatchToRow, rowToBracketMatch, type BracketRow } from "../tournament/rows";

/**
 * Reads one tournament from cache. Entrant names are joined from
 * club_players_cache, which refreshClubs() already populates unfiltered, so no
 * network call is needed to render them.
 *
 * Returns null when this tournament has never been cached on this device —
 * the caller then shows its existing loading state, exactly as today.
 */
export async function readTournamentCore(id: string): Promise<TournamentCore | null> {
  const db = await getDb();
  if (!db) return null;

  const trow = await db.getFirstAsync<Record<string, unknown>>(
    "select * from tournaments where id = ?", id
  );
  if (!trow) return null;

  const erows = await db.getAllAsync<EntrantNameRow>(
    `select e.id, e.club_player_id, e.club_player_id_2, e.seed,
            p1.name as name1, p2.name as name2
     from tournament_entrants e
     left join club_players_cache p1 on p1.id = e.club_player_id
     left join club_players_cache p2 on p2.id = e.club_player_id_2
     where e.tournament_id = ? order by e.seed`,
    id
  );

  const brows = await db.getAllAsync<BracketRow>(
    "select * from bracket_matches where tournament_id = ? order by round, idx", id
  );

  return {
    tournament: tournamentRowFromCache(trow),
    entrants: erows.map(entrantRowToEntrant),
    bracket: brows.map(rowToBracketMatch),
  };
}

/**
 * Replaces this tournament's cached rows. Delete-then-insert scoped to one
 * tournament id, inside a transaction, mirroring refreshClubs' shape — a
 * partial write must never leave half a bracket on screen.
 *
 * Row-at-a-time inserts are fine here: a bracket caps at 63 cells for a
 * 64-draw. The batching helper in src/db/batch.ts exists for the genuinely
 * large cases (club_players_cache, attendance_cache).
 */
export async function writeTournamentCore(core: TournamentCore): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const t = core.tournament;

  await db.withTransactionAsync(async () => {
    await db.runAsync("delete from tournament_entrants where tournament_id = ?", t.id);
    await db.runAsync("delete from bracket_matches where tournament_id = ?", t.id);
    await db.runAsync("delete from tournaments where id = ?", t.id);

    await db.runAsync(
      `insert into tournaments
         (id, club_id, name, format, size, status, created_at,
          match_type, bestof, finals_bestof, courts, group_count, advance_per_group)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id, t.clubId, t.name, t.format, t.size, t.status, t.createdAt,
      t.matchType, t.bestOf, t.finalsBestOf, t.courts, t.groupCount, t.advancePerGroup
    );

    for (const e of core.entrants) {
      await db.runAsync(
        `insert into tournament_entrants (id, tournament_id, club_player_id, seed, club_player_id_2)
         values (?, ?, ?, ?, ?)`,
        e.id, t.id, e.clubPlayerId, e.seed, e.partnerClubPlayerId
      );
    }

    for (const m of core.bracket) {
      const r = bracketMatchToRow(m);
      await db.runAsync(
        `insert into bracket_matches
           (id, tournament_id, round, idx, match_id, entrant_a, entrant_b,
            winner_entrant, court, scored_by,
            win_to_match_id, win_to_slot, loss_to_match_id, loss_to_slot,
            group_idx, src_a, src_b)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.id, r.tournament_id, r.round, r.idx, r.match_id,
        r.entrant_a, r.entrant_b, r.winner_entrant, r.court, r.scored_by,
        r.win_to_match_id, r.win_to_slot, r.loss_to_match_id, r.loss_to_slot,
        r.group_idx, r.src_a, r.src_b
      );
    }
  });
}
