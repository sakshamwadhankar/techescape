import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Shared ESLint flat config for TypeScript packages in this monorepo.
// Usage:
//   import base from "../../packages/config/eslint/base.mjs";
//   export default base({ files: ["src/**/*.ts"], ignores: ["dist"] });
export default function baseConfig(options = {}) {
  const files = options.files ?? ["src/**/*.ts", "src/**/*.tsx"];
  const ignores = options.ignores ?? ["dist", "node_modules", "coverage"];

  const recommended = tseslint.configs.recommended;
  const tsBase = recommended[0] ?? {};

  return [
    { ignores },
    {
      files,
      ...js.configs.recommended,
    },
    {
      files,
      ...tsBase,
      languageOptions: {
        ...tsBase.languageOptions,
      },
      rules: {
        ...tsBase.rules,
        "no-undef": "off",
        "no-unused-vars": "off",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { prefer: "type-imports", fixStyle: "inline-type-imports" },
        ],
      },
    },
  ];
}
