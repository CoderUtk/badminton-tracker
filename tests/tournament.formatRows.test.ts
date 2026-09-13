import { formatRows } from "../src/tournament/estimate";
import { FORMATS } from "../src/tournament/formats";

test("all four formats appear, in FORMATS order, with Knockout first", () => {
  const rows = formatRows(8, 3, 4);
  expect(rows.map((r) => r.id)).toEqual(Object.keys(FORMATS));
  expect(rows[0].id).toBe("single_elim");
  expect(rows[0].label).toBe("Knockout");
});

test("a 16-entrant round-robin is flagged long, a 16-entrant knockout is not", () => {
  const rows = formatRows(16, 3, 4);
  const rr = rows.find((r) => r.id === "round_robin")!;
  const ko = rows.find((r) => r.id === "single_elim")!;
  expect(rr.matches).toBe(120);
  expect(rr.long).toBe(true);
  expect(ko.long).toBe(false);
});

test("the warning names a genuinely cheaper format and quotes its own estimate, and is null when nothing is long", () => {
  const long = formatRows(16, 3, 4).find((r) => r.id === "round_robin")!;
  expect(long.warning).not.toBeNull();
  expect(long.warning).toMatch(/Long for one night/);
  // The named format must itself be a non-long row, and the warning must
  // quote that row's own duration text, not an arbitrary string.
  const rows16 = formatRows(16, 3, 4);
  const cheapest = rows16.filter((r) => !r.long).sort((a, b) => a.minutes - b.minutes)[0];
  expect(long.warning).toContain(cheapest.label);
  expect(cheapest.long).toBe(false);

  const short = formatRows(4, 3, 4).find((r) => r.id === "round_robin")!;
  expect(short.long).toBe(false);
  expect(short.warning).toBeNull();
});

test("the estimate text changes with entrant count and with court count", () => {
  const small = formatRows(4, 3, 4).find((r) => r.id === "single_elim")!;
  const big = formatRows(8, 3, 4).find((r) => r.id === "single_elim")!;
  expect(small.estimateText).not.toBe(big.estimateText);

  const fewCourts = formatRows(8, 3, 1).find((r) => r.id === "single_elim")!;
  const manyCourts = formatRows(8, 3, 8).find((r) => r.id === "single_elim")!;
  expect(fewCourts.estimateText).not.toBe(manyCourts.estimateText);

  // Exact literal, not just "some number changed" — would catch a dropped
  // "matches", "courts" swapped for "games", or fields reordered.
  const ko8 = formatRows(8, 3, 4).find((r) => r.id === "single_elim")!;
  expect(ko8.estimateText).toBe("≈ 7 matches · ~53m on 4 courts");
});

test("when every format is long, every row still gets a warning naming the limit, not a cheaper one", () => {
  const rows = formatRows(64, 3, 1);
  expect(rows.every((r) => r.long)).toBe(true);
  for (const r of rows) {
    expect(r.warning).not.toBeNull();
    expect(r.warning).toMatch(/Long for one night/);
    expect(r.warning).toBe("Long for one night — even the fastest format runs long on 1 courts.");
  }
});

test("a long round-robin is pointed at Groups → knockout when that fits, not the globally cheapest", () => {
  const rr = formatRows(8, 3, 4).find((r) => r.id === "round_robin")!;
  const gk = formatRows(8, 3, 4).find((r) => r.id === "groups_knockout")!;
  expect(rr.long).toBe(true);
  expect(gk.long).toBe(false);
  expect(rr.warning).toContain("Groups → knockout");
  expect(rr.warning).not.toContain("about");
});

test("the warning never says 'about' — the duration's own tilde is the hedge", () => {
  const rr = formatRows(16, 3, 4).find((r) => r.id === "round_robin")!;
  expect(rr.warning).not.toBeNull();
  expect(rr.warning).not.toContain("about");
  expect(rr.warning).toContain("~");
});
