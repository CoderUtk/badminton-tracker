import type { EarnedBadge } from "./types";
import type { Hand } from "../repos/profileRepo";

type Analytics = {
  played: number; wins: number; losses: number; winPct: number;
  gamesWon: number; gamesLost: number; pointsFor: number; pointsAgainst: number;
  form: ("W" | "L")[];
  dayStreak: number; weekendWarrior: boolean; earlyBird: boolean; nightOwl: boolean;
  maxMatchesInMonth: number; maxMatchesInDay: number; winStreak: number; doublesPlayed: number;
  flawlessVictory: boolean; nailBiter: boolean; comebackKid: boolean; venues: Set<string>;
};

type ProfileFacts = { age: number | null; hand: Hand | null; avatarUrl: string | null };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const currentStreak = (form: ("W" | "L")[]) => {
  let n = 0;
  for (let i = 0; i < form.length && form[i] === "W"; i++) n++;
  return n;
};
const bool = (earned: boolean) => clamp01(earned ? 1 : 0);

export function evaluateBadges(a: Analytics, profile: ProfileFacts): EarnedBadge[] {
  const streak = currentStreak(a.form);
  const profileFieldsSet = [profile.avatarUrl, profile.age !== null, profile.hand !== null]
    .filter(Boolean).length;

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

    { id: "weekend_warrior", title: "Weekend Warrior", description: "Play on both Saturday and Sunday in one weekend", icon: "calendar",
      earned: a.weekendWarrior, progress: bool(a.weekendWarrior) },
    { id: "early_bird", title: "Early Bird", description: "Log a match played before 8 AM", icon: "time-outline",
      earned: a.earlyBird, progress: bool(a.earlyBird) },
    { id: "night_owl", title: "Night Owl", description: "Log a match played after 8 PM", icon: "time-outline",
      earned: a.nightOwl, progress: bool(a.nightOwl) },
    { id: "streak_7", title: "The Streak", description: "Play at least one match for 7 days in a row", icon: "flag",
      earned: a.dayStreak >= 7, progress: clamp01(a.dayStreak / 7) },
    { id: "monthly_15", title: "Monthly Regular", description: "Play 15 matches in a calendar month", icon: "calendar",
      earned: a.maxMatchesInMonth >= 15, progress: clamp01(a.maxMatchesInMonth / 15) },

    { id: "doubles_10", title: "Dynamic Duo", description: "Play 10 doubles matches", icon: "account-group",
      earned: a.doublesPlayed >= 10, progress: clamp01(a.doublesPlayed / 10) },

    { id: "flawless", title: "Flawless Victory", description: "Win a game keeping your opponent under 5 points", icon: "trophy",
      earned: a.flawlessVictory, progress: bool(a.flawlessVictory) },
    { id: "comeback", title: "Comeback Kid", description: "Win a match after losing the first game", icon: "arrow-redo",
      earned: a.comebackKid, progress: bool(a.comebackKid) },
    { id: "nail_biter", title: "Nail Biter", description: "Win a game that goes to deuce", icon: "scoreboard-outline",
      earned: a.nailBiter, progress: bool(a.nailBiter) },
    { id: "streak_10", title: "Unstoppable", description: "Win 10 matches in a row", icon: "flag",
      earned: a.winStreak >= 10, progress: clamp01(a.winStreak / 10) },

    { id: "played_100", title: "Centurion", description: "Play 100 completed matches", icon: "badminton",
      earned: a.played >= 100, progress: clamp01(a.played / 100) },
    { id: "wins_100", title: "Court Legend", description: "Win 100 matches", icon: "trophy",
      earned: a.wins >= 100, progress: clamp01(a.wins / 100) },
    { id: "venues_3", title: "Explorer", description: "Play at 3 different venues", icon: "shuffle-variant",
      earned: a.venues.size >= 3, progress: clamp01(a.venues.size / 3) },
    { id: "iron_man", title: "Iron Man", description: "Play 5 matches in a single day", icon: "flag",
      earned: a.maxMatchesInDay >= 5, progress: clamp01(a.maxMatchesInDay / 5) },

    { id: "profile_complete", title: "Setting Up Shop", description: "Complete your profile: photo, age, handedness", icon: "person",
      earned: profileFieldsSet === 3, progress: clamp01(profileFieldsSet / 3) },
    { id: "scribe_20", title: "The Scribe", description: "Log and score 20 matches", icon: "create-outline",
      earned: a.played >= 20, progress: clamp01(a.played / 20) },
  ];
}
