import type {
  MatchConfig,
  MatchEvent,
  MatchState,
  Positions,
  TeamId,
} from "./types";

const other = (t: TeamId): TeamId => (t === "A" ? "B" : "A");

function initialState(config: MatchConfig): MatchState {
  const startPositions = (team: TeamId): Positions => {
    if (config.matchType === "singles") return { right: 0, left: 0 };
    // The first server / first receiver start in the right court (score 0 = even).
    const first =
      team === config.firstServer.team ? config.firstServer.playerIndex : 0;
    return { right: first, left: first === 0 ? 1 : 0 };
  };
  return {
    config,
    phase: "playing",
    game: 1,
    score: { A: 0, B: 0 },
    gamesWon: { A: 0, B: 0 },
    gameHistory: [],
    servingTeam: config.firstServer.team,
    servingPlayer: config.firstServer.playerIndex,
    positions: { A: startPositions("A"), B: startPositions("B") },
    intervalTaken: false,
    rallies: [],
    winner: null,
  };
}

function isGameOver(s: MatchState, score: Record<TeamId, number>): TeamId | null {
  const { pointsToWin, cap } = s.config;
  for (const t of ["A", "B"] as TeamId[]) {
    const mine = score[t];
    const theirs = score[other(t)];
    if (mine === cap) return t;
    if (mine >= pointsToWin && mine - theirs >= 2) return t;
  }
  return null;
}

function applyRally(s: MatchState, by: TeamId): MatchState {
  if (s.phase !== "playing") {
    throw new Error(`Cannot score a rally while phase is "${s.phase}"`);
  }
  const score = { ...s.score, [by]: s.score[by] + 1 };
  const rallies = [...s.rallies, by];
  let { servingTeam, servingPlayer } = s;
  const positions = { A: { ...s.positions.A }, B: { ...s.positions.B } };

  if (s.config.matchType === "doubles") {
    if (by === servingTeam) {
      // Serving side scores: same player serves again from the alternate
      // court, so the serving pair swap service courts.
      const p = positions[by];
      [p.right, p.left] = [p.left, p.right];
    } else {
      // Side-out: nobody moves; the new server is whichever receiver stands
      // in the court matching the new serving side's score parity.
      servingTeam = by;
      const court = score[by] % 2 === 0 ? "right" : "left";
      servingPlayer = positions[by][court];
    }
  } else {
    if (by !== servingTeam) servingTeam = by;
    servingPlayer = 0;
  }

  const gameWinner = isGameOver(s, score);
  if (gameWinner) {
    const gamesWon = { ...s.gamesWon, [gameWinner]: s.gamesWon[gameWinner] + 1 };
    const needed = Math.floor(s.config.bestOf / 2) + 1;
    const matchOver = gamesWon[gameWinner] === needed;
    return {
      ...s,
      score,
      rallies,
      servingTeam,
      servingPlayer,
      positions,
      gamesWon,
      gameHistory: [...s.gameHistory, { score, winner: gameWinner }],
      phase: matchOver ? "match_over" : "game_over",
      winner: matchOver ? gameWinner : null,
    };
  }

  const { intervalAt } = s.config;
  const hitInterval =
    intervalAt > 0 &&
    !s.intervalTaken &&
    (score.A === intervalAt || score.B === intervalAt);

  return {
    ...s,
    score,
    rallies,
    servingTeam,
    servingPlayer,
    positions,
    intervalTaken: s.intervalTaken || hitInterval,
    phase: hitInterval ? "interval" : "playing",
  };
}

function startNextGame(s: MatchState): MatchState {
  if (s.phase !== "game_over") {
    throw new Error(`Cannot start next game while phase is "${s.phase}"`);
  }
  // Winner of the previous game serves first in the next game.
  const lastWinner = s.gameHistory[s.gameHistory.length - 1].winner;
  const reset = initialState(s.config);
  return {
    ...s,
    phase: "playing",
    game: s.game + 1,
    score: { A: 0, B: 0 },
    rallies: [],
    intervalTaken: false,
    servingTeam: lastWinner,
    servingPlayer:
      s.config.matchType === "doubles" ? s.positions[lastWinner].right : 0,
    positions: reset.positions,
  };
}

export function reduce(s: MatchState | null, e: MatchEvent): MatchState {
  if (e.type === "MATCH_STARTED") return initialState(e.config);
  if (!s) throw new Error("First event must be MATCH_STARTED");
  switch (e.type) {
    case "RALLY_WON":
      return applyRally(s, e.by);
    case "INTERVAL_ENDED":
      if (s.phase !== "interval") {
        throw new Error(`No interval in progress (phase "${s.phase}")`);
      }
      return { ...s, phase: "playing" };
    case "GAME_STARTED":
      return startNextGame(s);
    case "MATCH_FORFEITED":
      return { ...s, phase: "match_over", winner: other(e.by) };
  }
}

/** Replay an event log into a state. The log is the single source of truth. */
export function replay(events: MatchEvent[]): MatchState {
  if (events.length === 0 || events[0].type !== "MATCH_STARTED") {
    throw new Error("Event log must begin with MATCH_STARTED");
  }
  return events.slice(1).reduce(reduce, reduce(null, events[0]));
}

/** Undo: drop the last non-MATCH_STARTED event. Returns a new log. */
export function undo(events: MatchEvent[]): MatchEvent[] {
  return events.length > 1 ? events.slice(0, -1) : events;
}

// ---- selectors ----

/** Service court for the current server, from the serving side's score parity. */
export function serviceCourt(s: MatchState): "right" | "left" {
  return s.score[s.servingTeam] % 2 === 0 ? "right" : "left";
}

export function serverName(s: MatchState): string {
  return s.config.teams[s.servingTeam][s.servingPlayer].name;
}

/** "game" | "match" point for a team currently one rally from winning, else null. */
export function pointSituation(
  s: MatchState
): { team: TeamId; kind: "game" | "match" } | null {
  if (s.phase !== "playing" && s.phase !== "interval") return null;
  for (const t of ["A", "B"] as TeamId[]) {
    const next = { ...s.score, [t]: s.score[t] + 1 };
    if (isGameOver(s, next)) {
      const needed = Math.floor(s.config.bestOf / 2) + 1;
      const kind = s.gamesWon[t] + 1 === needed ? "match" : "game";
      return { team: t, kind };
    }
  }
  return null;
}

export function defaultConfig(
  overrides: Partial<MatchConfig> = {}
): MatchConfig {
  return {
    matchType: "doubles",
    bestOf: 3,
    pointsToWin: 21,
    cap: 30,
    intervalAt: 11,
    teams: {
      A: [
        { id: "a0", name: "Player A0" },
        { id: "a1", name: "Player A1" },
      ],
      B: [
        { id: "b0", name: "Player B0" },
        { id: "b1", name: "Player B1" },
      ],
    },
    firstServer: { team: "A", playerIndex: 0 },
    ...overrides,
  };
}
