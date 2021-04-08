module.exports = {
  reporter: ["text", "lcov"],
  "check-coverage": true,
  all: true,
  // https://reflectoring.io/100-percent-test-coverage/
  branches: 100,
  lines: 100,
  functions: 100,
  statements: 100,
  // To enable **merged** coverage report all relevant file extensions must be listed.
  // Due to issues with nyc we have to include the compiled javascript files instead of the typescript files
  extension: [".js"],
  include: ["**/src/**"],
  excludeAfterRemap: false,
};
