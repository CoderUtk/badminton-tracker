const share = jest.fn().mockResolvedValue({});
jest.mock("react-native", () => ({ Share: { share: (...a: unknown[]) => share(...a) } }));

const createURL = jest.fn().mockImplementation((p: string) => `badminton://${p}`);
jest.mock("expo-linking", () => ({ createURL: (p: string) => createURL(p) }));

jest.mock("../src/lib/toast", () => ({ toast: jest.fn() }));

afterEach(() => {
  jest.resetModules();
  delete process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN;
  share.mockClear();
  createURL.mockClear();
});

test("builds an https join link when the domain is configured", async () => {
  process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN = "courtside-links.vercel.app";
  const { shareJoinLink } = require("../src/lib/shareJoin");
  await shareJoinLink("join/club/abc", "Join Smash Club on CourtSide:");
  expect(share).toHaveBeenCalledWith({
    message: "Join Smash Club on CourtSide:\nhttps://courtside-links.vercel.app/join/club/abc",
  });
});

test("falls back to the custom scheme when no domain is configured", async () => {
  const { shareJoinLink } = require("../src/lib/shareJoin");
  await shareJoinLink("join/club/abc", "Join Smash Club on CourtSide:");
  expect(createURL).toHaveBeenCalledWith("join/club/abc");
  expect(share).toHaveBeenCalledWith({
    message: "Join Smash Club on CourtSide:\nbadminton://join/club/abc",
  });
});
