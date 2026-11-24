import js from "@eslint/js";
import security from "eslint-plugin-security";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["node_modules/**", "test-results/**", "playwright-report/**", "../internal/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  security.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ["*.mjs", "eslint.config.js"] }, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // Indexed access on arrays and maps is checked by noUncheckedIndexedAccess instead.
      "security/detect-object-injection": "off",
      "no-restricted-syntax": [
        "error",
        { selector: "AssignmentExpression[left.property.name='innerHTML']", message: "Use setHtml() in dom.ts: markup must be sanitized first." },
        { selector: "AssignmentExpression[left.property.name='outerHTML']", message: "Do not assign outerHTML." },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: "Do not use insertAdjacentHTML." },
      ],
      "no-eval": "error",
      "no-implied-eval": "error",
    },
  },
  {
    files: ["src/dom.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["tests/**", "e2e/**", "*.mjs", "*.config.*"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "no-restricted-syntax": "off",
    },
  },
);
