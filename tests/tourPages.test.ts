import { TOUR_PAGES } from "../src/lib/tourPages";

test("has exactly 6 pages: welcome plus the 5 visible tabs", () => {
  expect(TOUR_PAGES).toHaveLength(6);
  expect(TOUR_PAGES.map((p) => p.key)).toEqual([
    "welcome", "home", "sessions", "matches", "tournaments", "profile",
  ]);
});

test("the welcome page has no tab icon", () => {
  expect(TOUR_PAGES[0].icon).toBeNull();
});

test("headline and body copy matches the approved strings exactly", () => {
  expect(TOUR_PAGES.map((p) => p.headline)).toEqual([
    "Welcome to CourtSide", "Home", "Sessions", "Matches", "Tournaments", "Profile",
  ]);
  expect(TOUR_PAGES.map((p) => p.body)).toEqual([
    "A quick look at what you can do.",
    "Your next session and quick stats, at a glance.",
    "Plan practice, track attendance, run drills.",
    "Score live matches, keep history, see form.",
    "Run brackets, track standings, share results.",
    "Your stats, badges, and account settings.",
  ]);
  expect(TOUR_PAGES.map((p) => p.icon)).toEqual([
    null, "home", "calendar", "badminton", "trophy", "person",
  ]);
});
