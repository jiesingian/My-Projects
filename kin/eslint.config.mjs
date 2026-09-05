import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // A "use server" file may export nothing but async functions. Exporting a
    // constant from one throws the moment the module is evaluated, which
    // takes down every action in it — and neither typecheck nor build catches
    // it, so it reaches production as a page that will not load. Types are
    // erased and are fine; values belong in a plain module next door.
    files: ["src/lib/actions/**/*.ts", "src/lib/actions/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportNamedDeclaration > VariableDeclaration",
          message:
            'A "use server" file can only export async functions. Move this constant into a plain module (src/lib/…) and import it here.',
        },
        {
          selector: "ExportNamedDeclaration > ClassDeclaration",
          message: 'A "use server" file can only export async functions.',
        },
        {
          selector: "ExportDefaultDeclaration",
          message: 'A "use server" file can only export async functions, and only as named exports.',
        },
      ],
    },
  },
]);

export default eslintConfig;
