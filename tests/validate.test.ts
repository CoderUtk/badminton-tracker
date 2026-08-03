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

test("requireLetter rejects a name with no letters", () => {
  expect(validateName("123", "Display name", { requireLetter: true }))
    .toBe("Display name must contain a letter");
  expect(validateName("42", "Display name", { requireLetter: true })).not.toBeNull();
  expect(validateName("...", "Display name", { requireLetter: true })).not.toBeNull();
});

test("requireLetter accepts letters mixed with digits and punctuation", () => {
  expect(validateName("Ravi 2", "Display name", { requireLetter: true })).toBeNull();
  expect(validateName("Anna-Marie", "Display name", { requireLetter: true })).toBeNull();
  expect(validateName("O'Neil", "Display name", { requireLetter: true })).toBeNull();
});

test("requireLetter accepts non-Latin scripts", () => {
  expect(validateName("उत्कर्ष", "Display name", { requireLetter: true })).toBeNull();
  expect(validateName("张伟", "Display name", { requireLetter: true })).toBeNull();
});

test("requireLetter still reports blank and length errors first", () => {
  expect(validateName("   ", "Display name", { requireLetter: true }))
    .toBe("Display name is required");
  expect(validateName("a".repeat(51), "Display name", { requireLetter: true }))
    .toBe("Display name must be 50 characters or less");
});

test("without requireLetter a digits-only name is still allowed", () => {
  expect(validateName("123", "Club name")).toBeNull();
});
