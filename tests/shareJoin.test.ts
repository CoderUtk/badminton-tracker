const share = jest.fn().mockResolvedValue({});
jest.mock("react-native", () => ({ Share: { share: (...a: unknown[]) => share(...a) } }));

const createURL = jest.fn().mockImplementation((p: string) => `badminton://${p}`);
jest.mock("expo-linking", () => ({ createURL: (p: string) => createURL(p) }));

jest.mock("../src/lib/toast", () => ({ toast: jest.fn() }));

const getMyProfile = jest.fn().mockResolvedValue(null);
jest.mock("../src/repos/profileRepo", () => ({ getMyProfile: () => getMyProfile() }));

afterEach(() => {
  jest.resetModules();
  delete process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN;
  share.mockClear();
  createURL.mockClear();
  getMyProfile.mockClear();
  getMyProfile.mockResolvedValue(null);
});

test("builds an https join link when the domain is configured", async () => {
  process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN = "courtside-links.vercel.app";
  const { shareJoinLink } = require("../src/lib/shareJoin");
  await shareJoinLink("join/club/abc", 'invited you to join "Smash Club"');
  expect(share).toHaveBeenCalledWith({
    message: '🏸 Hey,\n"Someone" invited you to join "Smash Club" on CourtSide:\nhttps://courtside-links.vercel.app/join/club/abc',
  });
});

test("falls back to the custom scheme when no domain is configured", async () => {
  const { shareJoinLink } = require("../src/lib/shareJoin");
  await shareJoinLink("join/club/abc", 'invited you to join "Smash Club"');
  expect(createURL).toHaveBeenCalledWith("join/club/abc");
  expect(share).toHaveBeenCalledWith({
    message: '🏸 Hey,\n"Someone" invited you to join "Smash Club" on CourtSide:\nbadminton://join/club/abc',
  });
});

test("uses the sharer's display name when signed in", async () => {
  getMyProfile.mockResolvedValue({ displayName: "Utkarsh" });
  const { shareJoinLink } = require("../src/lib/shareJoin");
  await shareJoinLink("join/club/abc", 'invited you to join "Smash Club"');
  expect(share).toHaveBeenCalledWith({
    message: '🏸 Hey,\n"Utkarsh" invited you to join "Smash Club" on CourtSide:\nbadminton://join/club/abc',
  });
});
