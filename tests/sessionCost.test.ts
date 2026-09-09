import { splitCost, type Attendance } from "../src/repos/sessionRepo";
import { formatMoney, parseMoney } from "../src/lib/money";

const player = (id: string, name: string, status: Attendance["status"], settled = false): Attendance => ({
  id, name, status, settled, club_id: "c1", profile_id: null, avatar_url: null,
});

const session = (cost: number, paidBy: string | null = null, shuttles = 0) => ({
  cost_total_cents: cost, shuttles, paid_by: paidBy,
});

describe("splitCost", () => {
  it("splits evenly across everyone checked in", () => {
    const split = splitCost(session(80000), [
      player("a", "Asha", "in"),
      player("b", "Bala", "in"),
      player("c", "Chetan", "out"),
    ]);
    expect(split.headCount).toBe(2);
    expect(split.shares.map((s) => s.cents)).toEqual([40000, 40000]);
  });

  it("distributes the remainder so shares sum to exactly the total", () => {
    // 800.00 across 3 is 266.666… — the classic place a per-head round
    // silently loses or invents a unit.
    const split = splitCost(session(80000), [
      player("a", "Asha", "in"),
      player("b", "Bala", "in"),
      player("c", "Chetan", "in"),
    ]);
    expect(split.shares.map((s) => s.cents)).toEqual([26667, 26667, 26666]);
    expect(split.shares.reduce((n, s) => n + s.cents, 0)).toBe(80000);
  });

  it("never counts the payer as owing, and marks their share settled", () => {
    const split = splitCost(session(30000, "b"), [
      player("a", "Asha", "in"),
      player("b", "Bala", "in"),
      player("c", "Chetan", "in"),
    ]);
    const bala = split.shares.find((s) => s.playerId === "b")!;
    expect(bala.isPayer).toBe(true);
    expect(bala.settled).toBe(true);
    expect(split.outstandingCents).toBe(20000); // Asha + Chetan only
  });

  it("drops settled players from the outstanding total", () => {
    const split = splitCost(session(30000, "c"), [
      player("a", "Asha", "in", true),
      player("b", "Bala", "in"),
      player("c", "Chetan", "in"),
    ]);
    expect(split.outstandingCents).toBe(10000); // Bala alone
  });

  it("returns no shares when nobody is checked in or nothing was spent", () => {
    expect(splitCost(session(80000), [player("a", "Asha", "out")]).shares).toEqual([]);
    expect(splitCost(session(0), [player("a", "Asha", "in")]).shares).toEqual([]);
    expect(splitCost(session(0), [player("a", "Asha", "in")]).outstandingCents).toBe(0);
  });

  it("ignores a negative or fractional stored total rather than propagating it", () => {
    expect(splitCost(session(-500), [player("a", "Asha", "in")]).totalCents).toBe(0);
    expect(splitCost(session(1234.7), [player("a", "Asha", "in")]).shares[0].cents).toBe(1234);
  });

  it("orders shares by id, so the extra unit lands on the same player every read", () => {
    const roster = [player("b", "Bala", "in"), player("a", "Asha", "in"), player("c", "Chetan", "in")];
    const split = splitCost(session(100), roster);
    expect(split.shares.map((s) => s.playerId)).toEqual(["a", "b", "c"]);
    expect(split.shares.map((s) => s.cents)).toEqual([34, 33, 33]);
    // Same roster in a different order must produce an identical split.
    const reordered = splitCost(session(100), [...roster].reverse());
    expect(reordered.shares).toEqual(split.shares);
  });
});

describe("money", () => {
  it("round-trips typed amounts through minor units", () => {
    expect(parseMoney("800")).toBe(80000);
    expect(parseMoney("1,250.50")).toBe(125050);
    expect(parseMoney("₹1,250.50")).toBe(125050);
  });

  it("rejects amounts it cannot use rather than defaulting to zero", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.2.3")).toBeNull();
  });

  it("drops the fraction when the amount is whole, keeps both digits when not", () => {
    expect(formatMoney(80000)).toBe("800");
    // Grouping and decimal separators are locale-dependent, so assert on the
    // digits rather than pinning the test to en-US punctuation.
    expect(formatMoney(125050).replace(/\D/g, "")).toBe("125050");
    expect(formatMoney(125000).replace(/\D/g, "")).toBe("1250");
  });
});
