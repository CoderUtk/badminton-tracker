import type { TeamId } from "../engine";
import type { MatchRecord } from "../repos/matchRepo";

export interface PairStat {
  name: string;
  played: number;
  wins: number;
  losses: number;
}

export interface RecentMatch {
  id: string;
  partner: string | null;
  opponents: string;
  result: "W" | "L" | "—";
  summary: string;
  date: number;
}

export interface PlayerAnalytics {
  name: string;
  played: number; // completed matches with a decided winner
  wins: number;
  losses: number;
  winPct: number; // 0..100 (integer)
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  form: ("W" | "L")[]; // newest first, up to 8
  bestPartner: PairStat | null; // most wins alongside
  toughestOpponent: PairStat | null; // most losses against
  recent: RecentMatch[]; // newest first, up to 10
}

function sideOf(m: MatchRecord, name: string): TeamId | null {
  if (m.side_a.some((p) => p.name === name)) return "A";
  if (m.side_b.some((p) => p.name === name)) return "B";
  return null;
}

/**
 * Per-player analytics derived from the match history. `matches` is expected
 * newest-first (as returned by listMatches), which makes `form`/`recent`
 * naturally newest-first. Pure — no I/O — so it's unit tested directly.
 */
export function playerAnalytics(matches: MatchRecord[], name: string): PlayerAnalytics {
  let wins = 0, losses = 0, played = 0;
  let gamesWon = 0, gamesLost = 0, pointsFor = 0, pointsAgainst = 0;
  const form: ("W" | "L")[] = [];
  const partners = new Map<string, PairStat>();
  const opponents = new Map<string, PairStat>();
  const recent: RecentMatch[] = [];

  const bump = (map: Map<string, PairStat>, key: string, won: boolean) => {
    const stat = map.get(key) ?? { name: key, played: 0, wins: 0, losses: 0 };
    stat.played += 1;
    if (won) stat.wins += 1;
    else stat.losses += 1;
    map.set(key, stat);
  };

  for (const m of matches) {
    if (m.status !== "completed") continue;
    const side = sideOf(m, name);
    if (!side) continue;
    const mySide = side === "A" ? m.side_a : m.side_b;
    const oppSide = side === "A" ? m.side_b : m.side_a;
    const partner = mySide.find((p) => p.name !== name)?.name ?? null;
    const games = m.score_summary?.games ?? [];

    for (const g of games) {
      const mine = side === "A" ? g.A : g.B;
      const theirs = side === "A" ? g.B : g.A;
      pointsFor += mine;
      pointsAgainst += theirs;
      if (mine > theirs) gamesWon += 1;
      else if (theirs > mine) gamesLost += 1;
    }

    let result: "W" | "L" | "—" = "—";
    if (m.winner) {
      played += 1;
      const won = m.winner === side;
      result = won ? "W" : "L";
      if (won) wins += 1;
      else losses += 1;
      if (form.length < 8) form.push(result);
      if (partner) bump(partners, partner, won);
      for (const o of oppSide) bump(opponents, o.name, won); // won === my result vs them
    }

    if (recent.length < 10) {
      recent.push({
        id: m.id,
        partner,
        opponents: oppSide.map((p) => p.name).join(" / "),
        result,
        summary: games.map((g) => `${side === "A" ? g.A : g.B}–${side === "A" ? g.B : g.A}`).join(", "),
        date: m.created_at,
      });
    }
  }

  const bestPartner = [...partners.values()].sort(
    (a, b) => b.wins - a.wins || b.wins / b.played - a.wins / a.played || b.played - a.played
  )[0] ?? null;
  const toughestOpponent = [...opponents.values()].sort(
    (a, b) => b.losses - a.losses || b.losses / b.played - a.losses / a.played || b.played - a.played
  )[0] ?? null;

  return {
    name,
    played,
    wins,
    losses,
    winPct: played ? Math.round((wins / played) * 100) : 0,
    gamesWon,
    gamesLost,
    pointsFor,
    pointsAgainst,
    form,
    bestPartner: bestPartner && bestPartner.wins > 0 ? bestPartner : null,
    toughestOpponent: toughestOpponent && toughestOpponent.losses > 0 ? toughestOpponent : null,
    recent,
  };
}
