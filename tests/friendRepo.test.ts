const getUser = jest.fn();
const from = jest.fn();
const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    from: (...a: unknown[]) => from(...a),
    rpc: (...a: unknown[]) => rpc(...a),
  },
}));

import { sendFriendRequest, respondToRequest, cancelRequest, removeFriend, listFriends, listIncomingRequests, listOutgoingRequests, sanitizeSearchTerm } from "../src/repos/friendRepo";

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u-me" } } });
  from.mockReset();
  rpc.mockReset();
});

test("sendFriendRequest looks up the username then inserts a pending request", async () => {
  const maybeSingle = jest.fn().mockResolvedValue({ data: { id: "u-friend" }, error: null });
  const eqLookup = jest.fn(() => ({ maybeSingle }));
  const selectLookup = jest.fn(() => ({ eq: eqLookup }));
  const insert = jest.fn().mockResolvedValue({ error: null });
  from.mockImplementation((table: string) =>
    table === "profiles" ? { select: selectLookup } : { insert }
  );

  await sendFriendRequest("Rahul_07");

  expect(eqLookup).toHaveBeenCalledWith("username", "rahul_07");
  expect(insert).toHaveBeenCalledWith({ requester_id: "u-me", addressee_id: "u-friend" });
});

test("sendFriendRequest throws when the username doesn't exist", async () => {
  const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });

  await expect(sendFriendRequest("nobody")).rejects.toThrow('No player found with username "nobody"');
});

test("sendFriendRequest throws a friendly message on a duplicate request", async () => {
  const maybeSingle = jest.fn().mockResolvedValue({ data: { id: "u-friend" }, error: null });
  const insert = jest.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
  from.mockImplementation((table: string) =>
    table === "profiles" ? { select: () => ({ eq: () => ({ maybeSingle }) }) } : { insert }
  );

  await expect(sendFriendRequest("rahul")).rejects.toThrow("Already friends or request already pending");
});

test("respondToRequest(accept) calls the accept_friend_request RPC", async () => {
  rpc.mockResolvedValue({ error: null });

  await respondToRequest("u-requester", true);

  expect(rpc).toHaveBeenCalledWith("accept_friend_request", { p_requester_id: "u-requester" });
});

test("respondToRequest(decline) deletes the row", async () => {
  const eq2 = jest.fn().mockResolvedValue({ error: null });
  const eq1 = jest.fn(() => ({ eq: eq2 }));
  const del = jest.fn(() => ({ eq: eq1 }));
  from.mockReturnValue({ delete: del });

  await respondToRequest("u-requester", false);

  expect(del).toHaveBeenCalled();
  expect(eq1).toHaveBeenCalledWith("requester_id", "u-requester");
  expect(eq2).toHaveBeenCalledWith("addressee_id", "u-me");
});

test("cancelRequest deletes the requester's own pending row", async () => {
  const eq2 = jest.fn().mockResolvedValue({ error: null });
  const eq1 = jest.fn(() => ({ eq: eq2 }));
  const del = jest.fn(() => ({ eq: eq1 }));
  from.mockReturnValue({ delete: del });

  await cancelRequest("u-addressee");

  expect(eq1).toHaveBeenCalledWith("requester_id", "u-me");
  expect(eq2).toHaveBeenCalledWith("addressee_id", "u-addressee");
});

test("removeFriend deletes the accepted row in either direction", async () => {
  const or = jest.fn().mockResolvedValue({ error: null });
  const del = jest.fn(() => ({ or }));
  from.mockReturnValue({ delete: del });

  await removeFriend("u-friend");

  expect(or).toHaveBeenCalledWith(
    "and(requester_id.eq.u-me,addressee_id.eq.u-friend),and(requester_id.eq.u-friend,addressee_id.eq.u-me)"
  );
});

test("listFriends resolves the other party's profile for each accepted row", async () => {
  const or = jest.fn().mockResolvedValue({
    data: [{ requester_id: "u-me", addressee_id: "u-friend" }],
    error: null,
  });
  const eqStatus = jest.fn(() => ({ or }));
  const selectFriendships = jest.fn(() => ({ eq: eqStatus }));
  const inProfiles = jest.fn().mockResolvedValue({
    data: [{ id: "u-friend", display_name: "Rahul", avatar_url: null }],
    error: null,
  });
  const selectProfiles = jest.fn(() => ({ in: inProfiles }));
  from.mockImplementation((table: string) =>
    table === "friendships" ? { select: selectFriendships } : { select: selectProfiles }
  );

  const result = await listFriends();

  expect(result).toEqual([{ id: "u-friend", displayName: "Rahul", avatarUrl: null }]);
});

test("listIncomingRequests returns pending rows addressed to me", async () => {
  const eqAddressee = jest.fn().mockResolvedValue({ data: [{ requester_id: "u-them" }], error: null });
  const eqStatus = jest.fn(() => ({ eq: eqAddressee }));
  const selectFriendships = jest.fn(() => ({ eq: eqStatus }));
  const inProfiles = jest.fn().mockResolvedValue({
    data: [{ id: "u-them", display_name: "Trg", avatar_url: null }],
    error: null,
  });
  from.mockImplementation((table: string) =>
    table === "friendships" ? { select: selectFriendships } : { select: () => ({ in: inProfiles }) }
  );

  const result = await listIncomingRequests();

  expect(eqStatus).toHaveBeenCalledWith("status", "pending");
  expect(eqAddressee).toHaveBeenCalledWith("addressee_id", "u-me");
  expect(result).toEqual([{ profileId: "u-them", displayName: "Trg", avatarUrl: null }]);
});

test("listOutgoingRequests returns pending rows I sent", async () => {
  const eqRequester = jest.fn().mockResolvedValue({ data: [{ addressee_id: "u-them" }], error: null });
  const eqStatus = jest.fn(() => ({ eq: eqRequester }));
  const selectFriendships = jest.fn(() => ({ eq: eqStatus }));
  const inProfiles = jest.fn().mockResolvedValue({
    data: [{ id: "u-them", display_name: "Trg", avatar_url: null }],
    error: null,
  });
  from.mockImplementation((table: string) =>
    table === "friendships" ? { select: selectFriendships } : { select: () => ({ in: inProfiles }) }
  );

  const result = await listOutgoingRequests();

  expect(eqStatus).toHaveBeenCalledWith("status", "pending");
  expect(eqRequester).toHaveBeenCalledWith("requester_id", "u-me");
  expect(result).toEqual([{ profileId: "u-them", displayName: "Trg", avatarUrl: null }]);
});

test("sanitizeSearchTerm leaves real usernames and display names unchanged", () => {
  expect(sanitizeSearchTerm("john_doe")).toBe("john_doe");
  expect(sanitizeSearchTerm("Dr. Smith")).toBe("Dr. Smith");
});

test("sanitizeSearchTerm strips characters that break out of the or() clause", () => {
  const out = sanitizeSearchTerm("a,b.c)(\"d%");
  expect(out).not.toMatch(/[,()"%]/);
});

test("sanitizeSearchTerm collapses an all-symbol input below the length-2 minimum", () => {
  expect(sanitizeSearchTerm("%%,,").length).toBeLessThan(2);
});
