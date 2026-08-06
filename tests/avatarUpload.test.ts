const getUser = jest.fn();
const upload = jest.fn();
const remove = jest.fn();
const getPublicUrl = jest.fn();
const update = jest.fn();
const eq = jest.fn();
const from = jest.fn();
const readAsStringAsync = jest.fn();

jest.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    storage: { from: (...a: unknown[]) => ({ upload: (...b: unknown[]) => upload(...b), remove: (...b: unknown[]) => remove(...b), getPublicUrl: (...b: unknown[]) => getPublicUrl(...b) }) },
    from: (...a: unknown[]) => from(...a),
  },
}));
jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: (...a: unknown[]) => readAsStringAsync(...a),
  EncodingType: { Base64: "base64" },
}));

import { uploadAvatar, removeAvatar } from "../src/repos/profileRepo";

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u-1" } } });
  upload.mockReset().mockResolvedValue({ error: null });
  remove.mockReset().mockResolvedValue({ error: null });
  getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: "https://x/avatars/u-1/avatar.jpg" } });
  readAsStringAsync.mockReset().mockResolvedValue("base64data");
  eq.mockReset().mockResolvedValue({ error: null });
  update.mockReset().mockReturnValue({ eq });
  from.mockReset().mockReturnValue({ update });
});

test("uploadAvatar uploads to the user's path and writes avatar_url", async () => {
  const url = await uploadAvatar("file:///tmp/pic.jpg");
  expect(upload).toHaveBeenCalledWith("u-1/avatar.jpg", expect.anything(), { contentType: "image/jpeg", upsert: true });
  expect(from).toHaveBeenCalledWith("profiles");
  expect(update).toHaveBeenCalledWith({ avatar_url: expect.stringContaining("https://x/avatars/u-1/avatar.jpg") });
  expect(eq).toHaveBeenCalledWith("id", "u-1");
  expect(url).toContain("https://x/avatars/u-1/avatar.jpg");
});

test("uploadAvatar throws on storage error without touching the profile row", async () => {
  upload.mockResolvedValue({ error: { message: "storage full" } });
  await expect(uploadAvatar("file:///tmp/pic.jpg")).rejects.toThrow("storage full");
  expect(from).not.toHaveBeenCalled();
});

test("removeAvatar deletes the storage object and clears avatar_url", async () => {
  await removeAvatar();
  expect(remove).toHaveBeenCalledWith(["u-1/avatar.jpg"]);
  expect(update).toHaveBeenCalledWith({ avatar_url: null });
  expect(eq).toHaveBeenCalledWith("id", "u-1");
});
