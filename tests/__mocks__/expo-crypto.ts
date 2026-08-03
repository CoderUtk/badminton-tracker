// The real expo-crypto ships ESM that ts-jest cannot parse under the node test
// environment. Tests that reach tournamentRepo only need module resolution to
// succeed; the id values themselves are never asserted on.
let n = 0;
export function randomUUID(): string {
  n += 1;
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
