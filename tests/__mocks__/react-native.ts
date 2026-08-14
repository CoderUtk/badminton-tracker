// Jest manual mock: the real react-native package ships code that cannot be
// parsed under the node test environment, and tests only need the env-gated
// logic that checks Platform.OS.
export const Platform = {
  OS: "ios",
};
