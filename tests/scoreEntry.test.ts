import { parseGames, winnerFromGames } from "../src/lib/scoreEntry";

describe("winnerFromGames", () => {
  it("gives a single decisive game to its winner", () => {
    expect(winnerFromGames([{ A: 21, B: 15 }])).toBe("A");
    expect(winnerFromGames([{ A: 15, B: 21 }])).toBe("B");
  });

  it("decides a three-game match on games won, not points", () => {
    // B takes more total points but loses the match 2-1.
    expect(winnerFromGames([{ A: 21, B: 19 }, { A: 5, B: 21 }, { A: 21, B: 19 }])).toBe("A");
  });

  it("returns null when nobody is ahead on games", () => {
    expect(winnerFromGames([])).toBeNull();
    expect(winnerFromGames([{ A: 21, B: 15 }, { A: 18, B: 21 }])).toBeNull();
    expect(winnerFromGames([{ A: 21, B: 21 }])).toBeNull();
  });
});

describe("parseGames", () => {
  it("parses filled rows into numbers", () => {
    expect(parseGames([{ A: "21", B: "15" }, { A: "19", B: "21" }]))
      .toEqual([{ A: 21, B: 15 }, { A: 19, B: 21 }]);
  });

  it("accepts a zero score", () => {
    expect(parseGames([{ A: "21", B: "0" }])).toEqual([{ A: 21, B: 0 }]);
  });

  it("rejects rows that are empty, non-numeric, negative, or tied", () => {
    expect(parseGames([])).toBeNull();
    expect(parseGames([{ A: "21", B: "" }])).toBeNull();
    expect(parseGames([{ A: "21", B: "x" }])).toBeNull();
    expect(parseGames([{ A: "21", B: "-1" }])).toBeNull();
    expect(parseGames([{ A: "21", B: "21" }])).toBeNull();
    expect(parseGames([{ A: "21", B: "1.5" }])).toBeNull();
  });

  it("rejects the whole entry when any later game is incomplete", () => {
    expect(parseGames([{ A: "21", B: "15" }, { A: "", B: "" }])).toBeNull();
  });
});
