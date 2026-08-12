import { buildInsert, chunkRows, MAX_VARS } from "../src/db/batch";

describe("buildInsert", () => {
  it("emits one placeholder group per row", () => {
    expect(buildInsert("t", ["a", "b"], 3))
      .toBe("insert into t (a, b) values (?, ?), (?, ?), (?, ?)");
  });

  it("handles a single row", () => {
    expect(buildInsert("t", ["a"], 1)).toBe("insert into t (a) values (?)");
  });

  it("throws on zero rows rather than emitting invalid SQL", () => {
    expect(() => buildInsert("t", ["a"], 0)).toThrow();
  });

  it("throws on zero columns", () => {
    expect(() => buildInsert("t", [], 1)).toThrow();
  });
});

describe("buildInsert conflict mode", () => {
  it("defaults to a plain insert", () => {
    expect(buildInsert("t", ["a", "b"], 1)).toBe("insert into t (a, b) values (?, ?)");
  });

  it("emits insert or ignore when asked", () => {
    expect(buildInsert("t", ["a", "b"], 2, "ignore")).toBe(
      "insert or ignore into t (a, b) values (?, ?), (?, ?)"
    );
  });

  it("emits a plain insert for an explicit fail mode", () => {
    expect(buildInsert("t", ["a"], 1, "fail")).toBe("insert into t (a) values (?)");
  });
});

describe("chunkRows", () => {
  it("keeps every chunk under the variable budget", () => {
    const rows = Array.from({ length: 500 }, (_, i) => [i, i, i, i]);
    const chunks = chunkRows(rows, 4);
    for (const c of chunks) expect(c.length * 4).toBeLessThanOrEqual(MAX_VARS);
  });

  it("preserves order and loses no rows", () => {
    const rows = Array.from({ length: 500 }, (_, i) => [i]);
    const chunks = chunkRows(rows, 1);
    expect(chunks.flat()).toEqual(rows);
  });

  it("returns one chunk when everything fits", () => {
    expect(chunkRows([[1], [2], [3]], 1)).toHaveLength(1);
  });

  it("returns no chunks for no rows", () => {
    expect(chunkRows([], 4)).toEqual([]);
  });

  it("still chunks when one row alone exceeds the budget", () => {
    // Degenerate, but must not infinite-loop or emit an empty chunk.
    const chunks = chunkRows([[1], [2]], MAX_VARS + 10);
    expect(chunks.flat()).toHaveLength(2);
    for (const c of chunks) expect(c.length).toBeGreaterThan(0);
  });

  it("collapses 200 four-column rows into a single statement", () => {
    // The refreshClubs case that motivated this: 200 runAsync calls -> 1.
    expect(chunkRows(Array.from({ length: 200 }, () => [1, 2, 3, 4]), 4)).toHaveLength(1);
  });
});
