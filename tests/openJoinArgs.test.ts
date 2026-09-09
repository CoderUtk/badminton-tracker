import { openJoinArgs } from "../src/session/openJoin";
import type { ClubSession } from "../src/repos/sessionRepo";

const session = (over: Partial<Pick<ClubSession, "open_join" | "max_players">> = {}) => ({
  open_join: true,
  max_players: null as number | null,
  ...over,
});

test("closing an open session with a cap of 12 still sends maxPlayers: 12, not null", () => {
  const result = openJoinArgs(session({ open_join: true, max_players: 12 }), { open: false });
  expect(result).toEqual({ open: false, maxPlayers: 12 });
});

test("opening a session with no cap sends null", () => {
  const result = openJoinArgs(session({ open_join: false, max_players: null }), { open: true });
  expect(result).toEqual({ open: true, maxPlayers: null });
});

test("an explicit cap change to 8 sends 8", () => {
  const result = openJoinArgs(session({ open_join: true, max_players: 12 }), { open: true, maxPlayers: 8 });
  expect(result).toEqual({ open: true, maxPlayers: 8 });
});

test("an explicit clear (maxPlayers: null passed deliberately) sends null", () => {
  const result = openJoinArgs(session({ open_join: true, max_players: 12 }), { open: true, maxPlayers: null });
  expect(result).toEqual({ open: true, maxPlayers: null });
});
