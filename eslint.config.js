import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `backend` used to be ignored wholesale — ~11.5k lines including every auth,
  // admin and rate-limiting path, never linted once. It is covered below.
  { ignores: ["dist", "**/dist/**", "node_modules", "**/node_modules/**"] },

  // ── Shared base ────────────────────────────────────────────────────────
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
    },
    rules: {
      // Kept as a warning rather than off: the codebase still has plenty of
      // `any`, but CLAUDE.md's rule is "never use any", so new ones should be
      // visible instead of silently accepted.
      "@typescript-eslint/no-explicit-any": "warn",

      // This was "off", which is why a stray `import { MovieGrid }` sat at the
      // top of src/lib/api.ts — a module nearly every page pulls in — with
      // nothing flagging it. A leading underscore is the opt-out for
      // deliberately-unused bindings.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // ── Frontend (browser) ─────────────────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // ── Backend (node) ─────────────────────────────────────────────────────
  {
    files: ["backend/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // ── Build / test tooling (node) ────────────────────────────────────────
  {
    files: ["*.config.{ts,js}", "e2e/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // ── Targeted relaxations ───────────────────────────────────────────────
  {
    files: ["src/components/ui/**/*.{ts,tsx}", "src/context/**/*.{ts,tsx}", "src/auth/mock-auth0.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["e2e/**/*.{ts,tsx}", "src/auth/mock-auth0.tsx"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-refresh/only-export-components": "off",
    },
  }
);
