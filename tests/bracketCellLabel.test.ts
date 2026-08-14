import { bracketCellLabel } from "../src/tournament/bracketLabel";

test("both entrants, winner decided (A)", () => {
  expect(bracketCellLabel({ entrantA: "a", entrantB: "b", winnerEntrant: "a" }, "Alice", "Bob")).toBe(
    "Alice versus Bob, Alice won"
  );
});

test("both entrants, winner decided (B)", () => {
  expect(bracketCellLabel({ entrantA: "a", entrantB: "b", winnerEntrant: "b" }, "Alice", "Bob")).toBe(
    "Alice versus Bob, Bob won"
  );
});

test("both entrants, no winner yet", () => {
  expect(bracketCellLabel({ entrantA: "a", entrantB: "b", winnerEntrant: null }, "Alice", "Bob")).toBe(
    "Alice versus Bob, in progress"
  );
});

test("bye: single entrant with winner already set does not announce waiting", () => {
  expect(bracketCellLabel({ entrantA: "a", entrantB: null, winnerEntrant: "a" }, "Alice", "Bob")).toBe(
    "Alice, bye"
  );
});

test("waiting for opponent: single entrant, no winner", () => {
  expect(bracketCellLabel({ entrantA: null, entrantB: "b", winnerEntrant: null }, "Alice", "Bob")).toBe(
    "Bob, waiting for opponent"
  );
});

test("empty slot", () => {
  expect(bracketCellLabel({ entrantA: null, entrantB: null, winnerEntrant: null }, "Alice", "Bob")).toBe(
    "Empty match slot"
  );
});

test("mismatched winnerEntrant id does not silently misattribute the win", () => {
  expect(bracketCellLabel({ entrantA: "a", entrantB: "b", winnerEntrant: "c" }, "Alice", "Bob")).toBe(
    "Alice versus Bob, in progress"
  );
});
