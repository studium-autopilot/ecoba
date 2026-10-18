// ESLint für Plugin, Skripte und Tests. Kein Build: geprüft wird genau der Code, der im Tresor läuft.
// Die Regeln für iPhone und iPad (Safari 16) prüfen pruefen.py und der esbuild-Schritt in GitHub Actions.
import js from "@eslint/js";
import globals from "globals";

// Globale Helfer, die Obsidian im Fenster bereitstellt (https://docs.obsidian.md/Reference/TypeScript+API)
const obsidian = Object.fromEntries(
  ["createDiv", "createSpan", "createEl", "createFragment", "activeDocument", "activeWindow"].map((n) => [n, "readonly"]),
);

export default [
  // Ordner mit „_“ am Anfang sind lokal und nicht Teil des Repos.
  { ignores: ["_*/**", "node_modules/**"] },
  js.configs.recommended,
  {
    rules: {
      // Bewusst: Fehler bei Netz und Dateien still schlucken (`catch (e) {}`), wenn der letzte Stand bleiben soll.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { caughtErrors: "none" }],
      // Bewusst: Fremdtext wird von Steuerzeichen gereinigt (/[\u0000-\u001f]/).
      "no-control-regex": "off",
      // Stil: `\[` und `\-` in Zeichenklassen bleiben zur Lesbarkeit maskiert.
      "no-useless-escape": "off",
      // Stil: `let x = "";` vor Verzweigungen; Passwörter werden nach Gebrauch absichtlich überschrieben.
      "no-useless-assignment": "off",
    },
  },
  {
    files: ["Studium Autopilot/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.browser, ...globals.commonjs, ...obsidian },
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  // Werkzeuge für den eigenen Server (server/): Node, nicht im Tresor.
  {
    files: ["server/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
];
