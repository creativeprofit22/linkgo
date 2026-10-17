import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Shared by app and test code so both get the same type-aware checks.
const typeCheckedRules = {
  "no-undef": "off",
  "@typescript-eslint/no-confusing-void-expression": "off",
  "@typescript-eslint/no-empty-object-type": "off",
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-floating-promises": "error",
  // React event props accept async handlers; every other void-return
  // position (listeners, callbacks) must not receive a promise.
  "@typescript-eslint/no-misused-promises": [
    "error",
    { checksVoidReturn: { attributes: false } },
  ],
  "@typescript-eslint/no-unused-vars": "off",
  "@typescript-eslint/no-unnecessary-condition": "off",
  "@typescript-eslint/no-unsafe-argument": "off",
  "@typescript-eslint/no-unsafe-assignment": "off",
  "@typescript-eslint/no-unsafe-call": "off",
  "@typescript-eslint/no-unsafe-member-access": "off",
  "@typescript-eslint/no-unsafe-return": "off",
  "@typescript-eslint/require-await": "off",
  "@typescript-eslint/restrict-template-expressions": "off",
};

export default tseslint.config(
  {
    ignores: ["dist", "src-tauri", "node_modules"],
  },
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...typeCheckedRules,
      "react-hooks/set-state-in-effect": "off",
      // Persistence is native-owned: the renderer calls feature-specific
      // commands through `@/lib/tauri`, never SQL.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tauri-apps/plugin-sql",
              message:
                "Renderer SQL is not allowed; add a feature-specific native command.",
            },
            {
              name: "@/lib/db",
              message:
                "The renderer database helper was removed; use a feature-specific native command.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^plugin:sql\\|/]",
          message:
            "Renderer SQL plugin commands are not allowed; add a feature-specific native command.",
        },
      ],
    },
  },
  {
    files: [
      "tests/**/*.ts",
      "tests-desktop/**/*.ts",
      "playwright.config.ts",
      "playwright.desktop.config.ts",
    ],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        project: ["./tsconfig.tests.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...typeCheckedRules,
      // The Tauri mocks mirror untyped SQL rows and bind values, so they
      // coerce defensively with String()/Number() like native row decoding.
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-unnecessary-type-conversion": "off",
      // Tauri `invoke` rejects with the raw `Err(String)` payload; mocks and
      // tests reproduce that instead of wrapping it in an Error.
      "@typescript-eslint/prefer-promise-reject-errors": "off",
    },
  },
);
