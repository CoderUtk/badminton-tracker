// Pure bracket-cell score helpers. No RN imports, so unit-testable in the
// plain node/jest environment (this project's jest config runs UI-free —
// see jest.config.js).
export const gamesWonBy = (games: { A: number; B: number }[], side: "A" | "B"): number =>
  games.filter((g) => (side === "A" ? g.A > g.B : g.B > g.A)).length;
