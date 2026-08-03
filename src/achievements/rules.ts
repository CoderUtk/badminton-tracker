import type { EarnedBadge } from "./types";

type Analytics = {
  played: number; wins: number; losses: number; winPct: number;
  gamesWon: number; gamesLost: number; pointsFor: number; pointsAgainst: number;
  form: ("W" | "L")[];
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const currentStreak = (form: ("W" | "L")[]) => {
  let n = 0;
  for (let i = 0; i < form.length && form[i] === "W"; i++) n++;
  return n;
};

export function evaluateBadges(a: Analytics): EarnedBadge[] {
  const streak = currentStreak(a.form);
  return [
    { id: "first_win", title: "First Win", description: "Win your first match", icon: "trophy-outline",
      earned: a.wins >= 1, progress: clamp01(a.wins / 1) },
    { id: "played_10", title: "Regular", description: "Play 10 matches", icon: "badminton",
      earned: a.played >= 10, progress: clamp01(a.played / 10) },
    { id: "wins_10", title: "Contender", description: "Win 10 matches", icon: "trophy",
      earned: a.wins >= 10, progress: clamp01(a.wins / 10) },
    { id: "streak_5", title: "On Fire", description: "Win 5 in a row", icon: "flag",
      earned: streak >= 5, progress: clamp01(streak / 5) },
    { id: "sharp", title: "Sharp", description: "Reach a 60% win rate (min 10 games)", icon: "scoreboard-outline",
      earned: a.played >= 10 && a.winPct >= 60, progress: clamp01(Math.min(a.played / 10, a.winPct / 60)) },
  ];
}
