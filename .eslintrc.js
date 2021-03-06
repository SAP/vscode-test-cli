module.exports = {
  // Common settings for JS Files.
  extends: [
    "plugin:eslint-comments/recommended",
    "prettier",
    "eslint:recommended",
  ],
  env: {
    commonjs: true,
    mocha: true,
    node: true,
  },
  rules: {
    "eslint-comments/require-description": ["error", { ignore: [] }],
  },
  overrides: [
    {
      // For pure-java script sub-packages and general scripts (in any package).
      files: ["*.js"],
      parserOptions: {
        // The `ecmaVersion` should align to the supported features of our target runtimes (browsers / nodejs / others)
        // Consult with: https://kangax.github.io/compat-table/es2016plus/
        ecmaVersion: 2017,
      },
    },
    {
      // For sub-packages using TypeScript (libraries/VSCode Exts) && TypeScript definitions (d.ts)
      files: ["*.ts"],
      plugins: ["@typescript-eslint"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: ["./tsconfig.base.json", "./tsconfig.json"],
      },
      extends: [
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
      ],
      rules: {
        "@typescript-eslint/no-use-before-define": [
          "error",
          // These can be safely used before they are defined due to function hoisting in EcmaScript
          { functions: false, classes: false },
        ],
        "@typescript-eslint/ban-ts-comment": [
          "error",
          {
            // We only allow ts-expect-error comments to enforce removal
            // of outdated suppression comments when the underlying issue has been resolved.
            // https://devblogs.microsoft.com/typescript/announcing-typescript-3-9/#what-about-ts-ignore
            "ts-expect-error": "allow-with-description",
            "ts-ignore": true,
            "ts-nocheck": true,
            "ts-check": true,
          },
        ],
        "@typescript-eslint/no-floating-promises": [
          "error",
          { ignoreVoid: true },
        ],
        "@typescript-eslint/strict-boolean-expressions": [
          "error",
          { allowString: true, allowNullableString: true },
        ],
        "no-unused-expressions": "off",
        "@typescript-eslint/no-unused-expressions": ["error"],
      },
      overrides: [
        {
          files: ["**/test/**"],
          rules: {
            "@typescript-eslint/no-unused-expressions": "off",
          },
        },
      ],
    },
  ],
};
