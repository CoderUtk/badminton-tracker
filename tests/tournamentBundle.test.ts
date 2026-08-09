import { rpcToFull, entrantRowToEntrant, tournamentRowFromCache } from "../src/tournament/bundle";

describe("entrantRowToEntrant", () => {
  it("joins a doubles pair into one display name", () => {
    expect(entrantRowToEntrant({
      id: "e1", club_player_id: "p1", club_player_id_2: "p2", seed: 1,
      name1: "Ana", name2: "Bo",
    })).toEqual({
      id: "e1", clubPlayerId: "p1", name: "Ana / Bo", seed: 1, partnerClubPlayerId: "p2",
    });
  });

  it("uses the single name for singles", () => {
    expect(entrantRowToEntrant({
      id: "e1", club_player_id: "p1", club_player_id_2: null, seed: 2, name1: "Ana", name2: null,
    }).name).toBe("Ana");
  });

  it("falls back when a name is missing from the local roster", () => {
    expect(entrantRowToEntrant({
      id: "e1", club_player_id: "p1", club_player_id_2: null, seed: 1, name1: null, name2: null,
    }).name).toBe("Player");
  });

  it("falls back per-side for a partially resolved pair", () => {
    expect(entrantRowToEntrant({
      id: "e1", club_player_id: "p1", club_player_id_2: "p2", seed: 1, name1: "Ana", name2: null,
    }).name).toBe("Ana / P2");
  });
});

describe("tournamentRowFromCache", () => {
  it("reads integer created_at directly and maps snake_case columns", () => {
    expect(tournamentRowFromCache({
      id: "t1", club_id: "c1", name: "Cup", size: 8, status: "live",
      created_at: 1700000000000, match_type: "doubles", bestof: 3,
      finals_bestof: 5, courts: 2,
    })).toEqual({
      id: "t1", clubId: "c1", name: "Cup", size: 8, status: "live",
      createdAt: 1700000000000, matchType: "doubles", bestOf: 3,
      finalsBestOf: 5, courts: 2,
    });
  });

  it("applies defaults for a row written before later migrations", () => {
    const r = tournamentRowFromCache({ id: "t1", club_id: "c1", name: "Cup" });
    expect(r.courts).toBe(4);
    expect(r.matchType).toBe("singles");
    expect(r.bestOf).toBe(3);
    expect(r.finalsBestOf).toBe(3);
    expect(r.status).toBe("draft");
  });
});

describe("rpcToFull", () => {
  const payload = {
    tournament: {
      id: "t1", club_id: "c1", name: "Cup", size: 4, status: "live",
      created_at: "2026-08-09T10:00:00Z", match_type: "singles",
      bestof: 3, finals_bestof: 3, courts: 2,
    },
    entrants: [
      { id: "e1", club_player_id: "p1", club_player_id_2: null, seed: 1, name1: "Ana", name2: null },
      { id: "e2", club_player_id: "p2", club_player_id_2: null, seed: 2, name1: "Bo", name2: null },
    ],
    bracket: [
      { id: "b1", tournament_id: "t1", round: 1, idx: 0, match_id: null,
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null, court: "1", scored_by: null },
    ],
    my_staff_role: "admin",
    staff: [{ id: "s1", tournament_id: "t1", profile_id: "u1", role: "admin", display_name: "Ana" }],
    requests: [{ id: "r1", tournament_id: "t1", profile_id: "u2",
                 display_name: "Bo", created_at: "2026-08-09T09:00:00Z", role: "player" }],
  };

  it("maps every collection", () => {
    const full = rpcToFull(payload);
    expect(full.tournament.clubId).toBe("c1");
    expect(full.tournament.createdAt).toBe(Date.parse("2026-08-09T10:00:00Z"));
    expect(full.entrants.map((e) => e.name)).toEqual(["Ana", "Bo"]);
    expect(full.bracket[0].index).toBe(0);
    expect(full.bracket[0].court).toBe("1");
    expect(full.myStaffRole).toBe("admin");
    expect(full.staff[0].displayName).toBe("Ana");
    expect(full.requests[0].role).toBe("player");
  });

  it("tolerates null collections from a tournament with no bracket yet", () => {
    const full = rpcToFull({ ...payload, entrants: null, bracket: null, staff: null, requests: null });
    expect(full.entrants).toEqual([]);
    expect(full.bracket).toEqual([]);
    expect(full.staff).toEqual([]);
    expect(full.requests).toEqual([]);
  });

  it("returns an empty request list for a non-admin", () => {
    const full = rpcToFull({ ...payload, my_staff_role: null, requests: null });
    expect(full.myStaffRole).toBeNull();
    expect(full.requests).toEqual([]);
  });
});
