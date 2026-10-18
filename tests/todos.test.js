// To-dos und Offene Fragen (todos.js, Codeblock eba-todos): Auswahl der Aufgaben, Trennung in Fragen und To-dos, Reihenfolge
// und was ein leerer Block zeigt (Klasse is-leer, Satz), dazu die Regeln, mit denen das Raster des Dashboards die leere Karte
// ausblendet. Nur ausgedachte Notizen. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

// Tresor im Speicher: { Pfad: Inhalt }; listItems wie Obsidians metadataCache (task " " = offen, "x" = erledigt)
const mitNotizen = (notizen) => {
  const { ctx, ergebnis } = laden("todos", { heute: "2026-10-18" });
  const dateien = Object.keys(notizen).map((p) => ({ path: p, basename: path.basename(p, ".md") }));
  ctx.app.vault.getMarkdownFiles = () => dateien;
  ctx.app.vault.cachedRead = async (f) => notizen[f.path];
  ctx.app.metadataCache.getFileCache = (f) => {
    const listItems = [];
    notizen[f.path].split("\n").forEach((z, i) => {
      const m = z.match(/^[\s>]*[-*+] \[(.)\]/);
      if (m) listItems.push({ task: m[1], position: { start: { line: i } } });
    });
    return { listItems };
  };
  return ergebnis;
};

const VIELE = {
  "Vorlesungen/E101/VL 01.md": "# VL 01\n- [ ] Folien 3–5 nacharbeiten\n- [x] Skript holen\n- [ ] Übung vorbereiten (bis 20.10.)",
  "Notizen/Allgemein.md": "- [ ] Bibliotheksausweis verlängern\n> - [ ] Lerngruppe fragen #frage\n- [ ] Warum ist das so?",
  "System/Daten/Semester.md": "- [ ] nie zählen",
  "Studium/Prüfungen.md": "- [ ] nie zählen?",
  "Dashboard.md": "- [ ] nie zählen",
};

test("Auswahl: offene Aufgaben außer in System/, Module/, Studium/ und Dashboard; Fragen enden auf „?“ oder tragen #frage", async () => {
  const beide = await mitNotizen(VIELE).lesenBeide();
  assert.deepEqual(beide.todos.map((t) => t.text), ["Übung vorbereiten", "Bibliotheksausweis verlängern", "Folien 3–5 nacharbeiten"]);
  assert.deepEqual(beide.fragen.map((t) => t.text), ["Lerngruppe fragen", "Warum ist das so?"]);
  assert.equal(beide.todos[0].faellig.getDate(), 20); // nach Fälligkeit zuerst, dann nach Notiz
});

test("lesen(modus) liefert dieselben Listen wie lesenBeide", async () => {
  const T = mitNotizen(VIELE);
  assert.equal((await T.lesen("todos")).length, 3);
  assert.equal((await T.lesen("fragen")).length, 2);
});

test("Leerer Block: Klasse is-leer und eigener Satz; sind beide leer, sagt der To-do-Block „Nichts offen.“", async () => {
  const T = mitNotizen(VIELE);
  const gefuellt = await T.lesenBeide();
  const z = (beide, modus) => { const s = T.zustand(beide, modus); return [s.klasse, s.leer, s.liste.length]; };
  // viele To-dos, keine Fragen: nur die Fragen-Karte ist leer
  const ohneFragen = { todos: gefuellt.todos, fragen: [] };
  assert.deepEqual(z(ohneFragen, "todos"), ["eba-td eba-td-todos", "", 3]);
  assert.deepEqual(z(ohneFragen, "fragen"), ["eba-td eba-td-fragen is-leer", "Keine offenen Fragen.", 0]);
  // Fragen, keine To-dos
  const ohneTodos = { todos: [], fragen: gefuellt.fragen };
  assert.deepEqual(z(ohneTodos, "todos"), ["eba-td eba-td-todos is-leer", "Nichts zu tun.", 0]);
  assert.deepEqual(z(ohneTodos, "fragen"), ["eba-td eba-td-fragen", "", 2]);
  // beide gefüllt: keine Klasse is-leer
  assert.deepEqual(z(gefuellt, "todos").slice(0, 2), ["eba-td eba-td-todos", ""]);
  assert.deepEqual(z(gefuellt, "fragen").slice(0, 2), ["eba-td eba-td-fragen", ""]);
  // beide leer (auch ein leerer Tresor)
  const nichts = await mitNotizen({ "Notizen/Leer.md": "- [x] erledigt\n- Punkt ohne Kästchen" }).lesenBeide();
  assert.deepEqual(nichts, { todos: [], fragen: [] });
  assert.deepEqual(z(nichts, "todos"), ["eba-td eba-td-todos is-leer", "Nichts offen.", 0]);
  assert.deepEqual(z(nichts, "fragen"), ["eba-td eba-td-fragen is-leer", "Keine offenen Fragen.", 0]);
});

// Das Raster blendet nach den Klassen aus, die zustand() setzt (eba-core.css, 37.todos). Benennt jemand eine Klasse um, bleibt
// sonst wieder die leere Karte stehen.
test("Raster: CSS blendet leere Karten nach is-leer aus, nur Karten in der Raster-Karte, nie einen Abschnitt", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "snippets", "eba-core.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const regel = (inhalt) => (css.match(/[^{}]+\{[^{}]*\}/g) || []).filter((r) => r.indexOf(inhalt) >= 0 && /eba-td[\w-]*\.is-leer/.test(r));
  const aus = regel("display: none");
  assert.equal(aus.length, 1);
  assert.match(aus[0], /> \.callout:has\(\.eba-td-fragen\.is-leer\)/);
  assert.match(aus[0], /:has\(\.eba-td-fragen:not\(\.is-leer\)\) > \.callout:has\(\.eba-td-todos\.is-leer\)/);
  for (const sel of aus[0].split("{")[0].split(",")) assert.match(sel.trim(), /^\.callout\[data-callout="eba-raster"\] > \.callout-content/);
  assert.doesNotMatch(aus[0], /\.el-|markdown-preview-sizer/);
  assert.equal(regel("grid-column: 1 / -1").length, 1);
});
