// ESLint flat config. `npm run lint` calls `eslint` directly (not `next lint`).
// Scope: correctness bugs, React hook contracts and accessibility. Formatting
// belongs to Prettier and is checked only for changed files.
// Rules in `stagedWarnings` still fail on existing code; they warn until the
// listed counts reach zero and are then raised back to error (see
// docs/development-workflows.md).
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

// Existing violations when the gate was introduced (2026-10-23).
const stagedWarnings = {
  "@next/next/no-html-link-for-pages": "warn", // 11
  "react-hooks/set-state-in-effect": "warn", // 9
  "react-hooks/refs": "warn", // 7
  "jsx-a11y/no-noninteractive-tabindex": "warn", // 6
  "jsx-a11y/no-static-element-interactions": "warn", // 6
  "jsx-a11y/no-noninteractive-element-interactions": "warn", // 5
  "jsx-a11y/click-events-have-key-events": "warn", // 4
  "jsx-a11y/label-has-associated-control": "warn", // 3
  "jsx-a11y/no-redundant-roles": "warn", // 1
};

export default defineConfig([
  globalIgnores([
    "out/**",
    ".next/**",
    ".next-*/**",
    ".build/**",
    ".legacy-vite/**",
    ".review/**",
    ".wrangler/**",
    "dist/**",
    "outputs/**",
    "playwright-report/**",
    "test-results/**",
    "public/**",
    "scripts/art-data/**",
    "services/**",
    "infra/**",
    "next-env.d.ts",
  ]),
  {
    name: "compass/eslint-recommended",
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    ...js.configs.recommended,
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    name: "compass/jsx-a11y-recommended",
    files: ["**/*.{jsx,tsx}"],
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  {
    name: "compass/rules",
    rules: {
      // Leading underscores mark intentionally unused parameters and values.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // A file may opt out of type checking only with a written reason.
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-nocheck": "allow-with-description" }],
    },
  },
  {
    name: "compass/staged-warnings",
    // Same file set as eslint-config-next, which registers these plugins.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: stagedWarnings,
  },
  {
    name: "compass/commonjs-scripts",
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      // `const crypto = require("crypto")` shadows the Web Crypto global by design.
      "no-redeclare": ["error", { builtinGlobals: false }],
    },
  },
  {
    name: "compass/tests",
    files: ["tests/**"],
    rules: {
      // Japanese copy fixtures contain ideographic spaces on purpose.
      "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true }],
    },
  },
  {
    name: "compass/playwright",
    files: ["tests/responsive/**"],
    rules: {
      // Playwright fixtures receive a `use` callback that is not a React hook.
      "react-hooks/rules-of-hooks": "off",
    },
  },
]);
