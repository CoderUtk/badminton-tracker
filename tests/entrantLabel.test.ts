import { formatEntrantLabel } from "../src/lib/entrantLabel";

describe("formatEntrantLabel", () => {
  it("is grammatical at zero", () => {
    // Audit P6: an empty draft read as "0-player", which is also awkward
    // grammar on top of being the wrong number.
    expect(formatEntrantLabel(0)).toBe("0 entrants");
  });

  it("is singular at one", () => {
    expect(formatEntrantLabel(1)).toBe("1 entrant");
  });

  it("is plural above one", () => {
    expect(formatEntrantLabel(6)).toBe("6 entrants");
  });
});
