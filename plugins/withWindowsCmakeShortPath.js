const { withAppBuildGradle } = require("@expo/config-plugins");

// Windows only: ninja mirrors each native source file's absolute path under
// android/app/.cxx, and object paths for modules with long codegen paths
// (e.g. react-native-keyboard-controller's Fabric shadow nodes) routinely
// exceed the 260-char limit ninja enforces regardless of the Windows
// LongPathsEnabled registry key. A short, near-drive-root staging directory
// keeps the mirrored path under the limit no matter where the repo itself is
// checked out. Applied at the Gradle level so it survives `expo prebuild`,
// which regenerates android/ from scratch every time.
const CMAKE_BLOCK = `
    externalNativeBuild {
        cmake {
            if (org.gradle.internal.os.OperatingSystem.current().isWindows()) {
                buildStagingDirectory "C:/rncxx/\${rootProject.name}"
            }
        }
    }`;

module.exports = function withWindowsCmakeShortPath(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") return config;
    if (config.modResults.contents.includes("buildStagingDirectory")) return config;
    config.modResults.contents = config.modResults.contents.replace(
      /namespace\s+'com\.navalo\.courtside'/,
      (match) => `${match}\n${CMAKE_BLOCK}`
    );
    return config;
  });
};
