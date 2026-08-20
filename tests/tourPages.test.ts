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

test("every tab page has an icon and non-empty headline and body", () => {
  for (const page of TOUR_PAGES.slice(1)) {
    expect(page.icon).not.toBeNull();
    expect(page.headline.length).toBeGreaterThan(0);
    expect(page.body.length).toBeGreaterThan(0);
  }
});
