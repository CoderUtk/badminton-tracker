import { validateName } from "../src/lib/validate";

test("rejects empty and whitespace-only names", () => {
  expect(validateName("", "Club name")).toBe("Club name is required");
  expect(validateName("   ", "Club name")).toBe("Club name is required");
});

test("accepts a trimmed non-empty name", () => {
  expect(validateName("  Smash Club  ", "Club name")).toBeNull();
});

test("rejects names longer than 50 characters", () => {
  expect(validateName("x".repeat(51), "Tournament name")).toBe("Tournament name must be 50 characters or less");
  expect(validateName("x".repeat(50), "Tournament name")).toBeNull();
});
