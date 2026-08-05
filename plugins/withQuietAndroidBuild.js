const { withProjectBuildGradle, withGradleProperties } = require("@expo/config-plugins");

// Suppresses Kotlin/Java compiler deprecation noise from third-party native
// modules (react-native-screens, expo-dev-launcher, @sentry/react-native,
// etc.) in local build logs. None of it is our code — it's those libraries
// calling their own now-deprecated Android APIs — and it drowns out warnings
// that actually matter. Applied at the Gradle level so it survives
// `expo prebuild`, which regenerates android/ from scratch every time.
const SUBPROJECTS_BLOCK = `
subprojects {
  tasks.withType(JavaCompile).configureEach {
    options.compilerArgs << "-nowarn"
  }
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    kotlinOptions.freeCompilerArgs += ["-nowarn"]
  }
}
`;

module.exports = function withQuietAndroidBuild(config) {
  config = withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") return config;
    if (!config.modResults.contents.includes(SUBPROJECTS_BLOCK.trim())) {
      config.modResults.contents += `\n${SUBPROJECTS_BLOCK}`;
    }
    return config;
  });

  // Gradle's own deprecation messages (e.g. "Configuration on demand is an
  // incubating feature"), separate from javac/kotlinc compiler warnings above.
  config = withGradleProperties(config, (config) => {
    const key = "org.gradle.warning.mode";
    const exists = config.modResults.some((item) => item.type === "property" && item.key === key);
    if (!exists) {
      config.modResults.push({ type: "property", key, value: "none" });
    }
    return config;
  });

  return config;
};
