import js from "@eslint/js";
import ts from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Only the two stable hook rules apply. The newer compiler-oriented rules
      // (e.g. set-state-in-effect) flag standard async fetch-on-mount patterns,
      // which this app uses deliberately for client-side data loading.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-undef": "off",
    },
    ignores: [".next/**", "node_modules/**", "data/**"],
  },
);
