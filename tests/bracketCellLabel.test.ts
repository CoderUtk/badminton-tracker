import { bracketCellLabel, srcSlotLabel } from "../src/tournament/bracketLabel";

const noSrc = { srcA: null, srcB: null };

test("both entrants, winner decided (A)", () => {
  expect(bracketCellLabel({ entrantA: "a", entrantB: "b", winnerEntrant: "a", ...noSrc }, "Alice", "Bob")).toBe(
    "Alice versus Bob, Alice won"
  );
});

test("both entrants, winner decided (B)", () => {
  expect(bracketCellLabel({ entrantA: "a", entrantB: "b", winnerEntrant: "b", ...noSrc }, "Alice", "Bob")).toBe(
    "Alice versus Bob, Bob won"
  );
});

test("both entrants, no winner yet", () => {
  expect(bracketCellLabel({ entrantA: "a", entrantB: "b", winnerEntrant: null, ...noSrc }, "Alice", "Bob")).toBe(
    "Alice versus Bob, in progress"
  );
});

test("bye: single entrant with winner already set does not announce waiting", () => {
  expect(bracketCellLabel({ entrantA: "a", entrantB: null, winnerEntrant: "a", ...noSrc }, "Alice", "Bob")).toBe(
    "Alice, bye"
  );
});

test("waiting for opponent: single entrant, no winner", () => {
  expect(bracketCellLabel({ entrantA: null, entrantB: "b", winnerEntrant: null, ...noSrc }, "Alice", "Bob")).toBe(
    "Bob, waiting for opponent"
  );
});

test("empty slot", () => {
  expect(bracketCellLabel({ entrantA: null, entrantB: null, winnerEntrant: null, ...noSrc }, "Alice", "Bob")).toBe(
    "Empty match slot"
  );
});

test("mismatched winnerEntrant id does not silently misattribute the win", () => {
  expect(bracketCellLabel({ entrantA: "a", entrantB: "b", winnerEntrant: "c", ...noSrc }, "Alice", "Bob")).toBe(
    "Alice versus Bob, in progress"
  );
});

test("a slot awaiting its group is named, not blank", () => {
  expect(
    bracketCellLabel(
      { entrantA: null, entrantB: null, winnerEntrant: null, srcA: "G1#2", srcB: null },
      "Alice",
      "Bob"
    )
  ).toBe("2nd, Group B");
});

test("srcSlotLabel: 'G1#2' becomes '2nd, Group B'", () => {
  expect(srcSlotLabel("G1#2")).toBe("2nd, Group B");
});

test("srcSlotLabel: 'G0#1' becomes '1st, Group A'", () => {
  expect(srcSlotLabel("G0#1")).toBe("1st, Group A");
});

test("srcSlotLabel: null token returns null", () => {
  expect(srcSlotLabel(null)).toBeNull();
});

test("srcSlotLabel: unrecognised token returns null", () => {
  expect(srcSlotLabel("nonsense")).toBeNull();
});
