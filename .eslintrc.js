module.exports = {
  env: {
    node: true,
  },
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "eslint-plugin-tsdoc"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended"
  ],
  ignorePatterns: ["**/build/*"],
};
