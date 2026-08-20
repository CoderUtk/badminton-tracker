import type { IconName } from "../components/Icon";

export type TourPage = {
  key: string;
  icon: IconName | null;
  headline: string;
  body: string;
};

/** Welcome page plus one page per visible tab-bar item, in tab-bar order. */
export const TOUR_PAGES: TourPage[] = [
  { key: "welcome", icon: null, headline: "Welcome to CourtSide", body: "A quick look at what you can do." },
  { key: "home", icon: "home", headline: "Home", body: "Your next session and quick stats, at a glance." },
  { key: "sessions", icon: "calendar", headline: "Sessions", body: "Plan practice, track attendance, run drills." },
  { key: "matches", icon: "badminton", headline: "Matches", body: "Score live matches, keep history, see form." },
  { key: "tournaments", icon: "trophy", headline: "Tournaments", body: "Run brackets, track standings, share results." },
  { key: "profile", icon: "person", headline: "Profile", body: "Your stats, badges, and account settings." },
];
