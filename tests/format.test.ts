import { pickBestOf } from "../src/tournament/format";

test("finals bestOf applies from the semifinal (last two rounds)", () => {
  // size 16 => maxRound 4; semifinal = round 3, final = round 4
  expect(pickBestOf(1, 4, 3, 5)).toBe(3);
  expect(pickBestOf(2, 4, 3, 5)).toBe(3);
  expect(pickBestOf(3, 4, 3, 5)).toBe(5); // semifinal
  expect(pickBestOf(4, 4, 3, 5)).toBe(5); // final
});

test("single-match bracket uses finals config (it is the final)", () => {
  expect(pickBestOf(1, 1, 3, 5)).toBe(5);
});
