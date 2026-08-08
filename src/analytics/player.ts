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
  dayStreak: number; // consecutive local calendar days with >=1 match, ending today or yesterday
  weekendWarrior: boolean; // some Saturday and its adjacent Sunday both have a match
  earlyBird: boolean; // any match created before 08:00 local time
  nightOwl: boolean; // any match created at/after 20:00 local time
  maxMatchesInMonth: number; // largest count of matches sharing a local (year, month)
  maxMatchesInDay: number; // largest count of matches sharing a local calendar day
  winStreak: number; // current win streak over full history (form is capped at 8 for display)
  longestWinStreak: number; // best win run over full history, current or not
  doublesPlayed: number; // completed matches where config.matchType === "doubles"
  flawlessVictory: boolean; // any won game where the loser scored < 5
  nailBiter: boolean; // any won game whose winning score > that match's pointsToWin
  comebackKid: boolean; // won the match after losing game 1
  venues: Set<string>; // distinct non-empty session locations (populated in Task 3)
}

type YMD = { y: number; m: number; d: number };
const ymd = (ts: number): YMD => {
  const dt = new Date(ts);
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
};
const ymdKey = (v: YMD) => `${v.y}-${v.m}-${v.d}`;
const nextDay = (v: YMD): YMD => {
  const dt = new Date(v.y, v.m, v.d + 1);
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
};
const prevDay = (v: YMD): YMD => {
  const dt = new Date(v.y, v.m, v.d - 1);
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
};

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
export function playerAnalytics(
  matches: MatchRecord[],
  name: string,
  sessionLocations: Map<string, string> = new Map(),
  now: number = Date.now()
): PlayerAnalytics {
  let wins = 0, losses = 0, played = 0;
  let gamesWon = 0, gamesLost = 0, pointsFor = 0, pointsAgainst = 0;
  const form: ("W" | "L")[] = [];
  const partners = new Map<string, PairStat>();
  const opponents = new Map<string, PairStat>();
  const recent: RecentMatch[] = [];

  const daySet = new Set<string>();
  const dayCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  let earlyBird = false;
  let nightOwl = false;
  let winStreak = 0;
  let winStreakBroken = false;
  let longestWinStreak = 0;
  let currentRun = 0;
  let doublesPlayed = 0;
  let flawlessVictory = false;
  let nailBiter = false;
  let comebackKid = false;
  const venues = new Set<string>();

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

    const day = ymd(m.created_at);
    const dayK = ymdKey(day);
    daySet.add(dayK);
    dayCounts.set(dayK, (dayCounts.get(dayK) ?? 0) + 1);
    const monthK = `${day.y}-${day.m}`;
    monthCounts.set(monthK, (monthCounts.get(monthK) ?? 0) + 1);
    const hour = new Date(m.created_at).getHours();
    if (hour < 8) earlyBird = true;
    if (hour >= 20) nightOwl = true;
    if (m.session_id) {
      const loc = sessionLocations.get(m.session_id);
      if (loc) venues.add(loc);
    }

    for (const g of games) {
      const mine = side === "A" ? g.A : g.B;
      const theirs = side === "A" ? g.B : g.A;
      if (mine > theirs) {
        if (theirs < 5) flawlessVictory = true;
        if (m.config.pointsToWin && mine > m.config.pointsToWin) nailBiter = true;
      }
    }

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
      if (won) {
        wins += 1;
        if (!winStreakBroken) winStreak += 1;
        currentRun += 1;
        if (currentRun > longestWinStreak) longestWinStreak = currentRun;
      } else {
        losses += 1;
        winStreakBroken = true;
        currentRun = 0;
      }
      if (form.length < 8) form.push(result);
      if (partner) bump(partners, partner, won);
      for (const o of oppSide) bump(opponents, o.name, won); // won === my result vs them
      if (m.config.matchType === "doubles") doublesPlayed += 1;
      if (won && games.length > 0) {
        const g0 = games[0];
        const mine0 = side === "A" ? g0.A : g0.B;
        const theirs0 = side === "A" ? g0.B : g0.A;
        if (mine0 < theirs0) comebackKid = true;
      }
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

  let dayStreak = 0;
  let cursor = ymd(now);
  if (!daySet.has(ymdKey(cursor))) cursor = prevDay(cursor);
  while (daySet.has(ymdKey(cursor))) {
    dayStreak += 1;
    cursor = prevDay(cursor);
  }

  let weekendWarrior = false;
  for (const key of daySet) {
    const [y, mo, d] = key.split("-").map(Number);
    if (new Date(y, mo, d).getDay() === 6) { // Saturday
      if (daySet.has(ymdKey(nextDay({ y, m: mo, d })))) {
        weekendWarrior = true;
        break;
      }
    }
  }

  const maxMatchesInDay = dayCounts.size ? Math.max(...dayCounts.values()) : 0;
  const maxMatchesInMonth = monthCounts.size ? Math.max(...monthCounts.values()) : 0;

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
    dayStreak,
    weekendWarrior,
    earlyBird,
    nightOwl,
    maxMatchesInMonth,
    maxMatchesInDay,
    winStreak,
    longestWinStreak,
    doublesPlayed,
    flawlessVictory,
    nailBiter,
    comebackKid,
    venues,
  };
}
