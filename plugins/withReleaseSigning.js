const { withAppBuildGradle } = require("@expo/config-plugins");

// Wires release builds to the local upload keystore via env vars (never
// hardcoded — see CREDENTIALS.txt, kept outside the repo). Durable across
// `expo prebuild --clean`, which regenerates android/app/build.gradle from
// scratch and would otherwise drop any hand-edited signing config every time.
const RELEASE_SIGNING_CONFIG = `
        release {
            storeFile file(System.getenv("COURTSIDE_UPLOAD_STORE_FILE") ?: "debug.keystore")
            storePassword System.getenv("COURTSIDE_UPLOAD_STORE_PASSWORD") ?: "android"
            keyAlias System.getenv("COURTSIDE_UPLOAD_KEY_ALIAS") ?: "androiddebugkey"
            keyPassword System.getenv("COURTSIDE_UPLOAD_KEY_PASSWORD") ?: "android"
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") return config;
    let contents = config.modResults.contents;

    if (!contents.includes("COURTSIDE_UPLOAD_STORE_FILE")) {
      contents = contents.replace(/signingConfigs\s*\{/, (match) => `${match}${RELEASE_SIGNING_CONFIG}`);
    }

    // Only the release build type's signingConfig line — debug's must stay
    // untouched. Lazy match so a comment line between "release {" and the
    // signingConfig assignment (present in the default template) doesn't
    // stop the match.
    contents = contents.replace(
      /(release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.)debug/,
      "$1release",
    );

    config.modResults.contents = contents;
    return config;
  });
};
