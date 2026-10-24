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
  const { ctx, ergebnis } = laden("todos", { heute: "2026-10-18", kontext: { modell: laden("modell", { heute: "2026-10-18" }).ctx.modell } });
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
  "Lernplan/E101 Lernplan.md": "- [ ] 1 Einführung\n  - [ ] 1.1 Knappheit",
  "Dashboard.md": "- [ ] nie zählen",
  // Begleitnotiz: unter „Offene Fragen“ ist alles Frage, auch ohne „?“ und mit Belegen hinter „ → “
  "Unterlagen/B180 Folien 02.md": "## Zu tun\n- [ ] Haus-Aufgabe lösen → [[F.pdf#page=34|S. 34]]\n\n## Offene Fragen\n- [ ] Tesla-Beispiel: Frage auf der Folie → [[F.pdf#page=5|S. 5]]\n- [ ] Welcher Typ ist es? → [[F.pdf#page=18|S. 18]]",
  // Frage am Textende vor den Belegen, ohne Abschnitt
  "Notizen/Belege.md": "- [ ] Gilt das auch langfristig? → [[F.pdf#page=2|S. 2]]",
};

test("Auswahl: offene Aufgaben außer in System/, Module/, Studium/, Lernplan/ und Dashboard; Fragen stehen unter „Offene Fragen“, enden vor den Belegen auf „?“ oder tragen #frage", async () => {
  const beide = await mitNotizen(VIELE).lesenBeide();
  assert.deepEqual(beide.todos.map((t) => t.text), ["Übung vorbereiten", "Bibliotheksausweis verlängern", "Haus-Aufgabe lösen", "Folien 3–5 nacharbeiten"]);
  assert.deepEqual(beide.fragen.map((t) => t.text), ["Lerngruppe fragen", "Warum ist das so?", "Gilt das auch langfristig?", "Tesla-Beispiel: Frage auf der Folie", "Welcher Typ ist es?"]);
  assert.equal(beide.todos[0].faellig.getDate(), 20); // nach Fälligkeit zuerst, dann nach Notiz
});

test("lesen(modus) liefert dieselben Listen wie lesenBeide", async () => {
  const T = mitNotizen(VIELE);
  assert.equal((await T.lesen("todos")).length, 4);
  assert.equal((await T.lesen("fragen")).length, 5);
});

test("Zahl am Reiter (reiter.js): zaehler zählt wie lesen, mit Argument „fragen“ die Fragen", async () => {
  const T = mitNotizen(VIELE);
  assert.equal(await T.zaehler["eba-todos"]("", "To-dos erscheinen, sobald Studium Autopilot läuft."), 4);
  assert.equal(await T.zaehler["eba-todos"]("fragen", "Offene Fragen erscheinen, sobald Studium Autopilot läuft."), 5);
});

test("Leerer Block: Klasse is-leer und eigener Satz; sind beide leer, sagt der To-do-Block „Nichts offen.“", async () => {
  const T = mitNotizen(VIELE);
  const gefuellt = await T.lesenBeide();
  const z = (beide, modus) => { const s = T.zustand(beide, modus); return [s.klasse, s.leer, s.liste.length]; };
  // viele To-dos, keine Fragen: nur die Fragen-Karte ist leer
  const ohneFragen = { todos: gefuellt.todos, fragen: [] };
  assert.deepEqual(z(ohneFragen, "todos"), ["eba-td eba-td-todos", "", 4]);
  assert.deepEqual(z(ohneFragen, "fragen"), ["eba-td eba-td-fragen is-leer", "Keine offenen Fragen.", 0]);
  // Fragen, keine To-dos
  const ohneTodos = { todos: [], fragen: gefuellt.fragen };
  assert.deepEqual(z(ohneTodos, "todos"), ["eba-td eba-td-todos is-leer", "Nichts zu tun.", 0]);
  assert.deepEqual(z(ohneTodos, "fragen"), ["eba-td eba-td-fragen", "", 5]);
  // beide gefüllt: keine Klasse is-leer
  assert.deepEqual(z(gefuellt, "todos").slice(0, 2), ["eba-td eba-td-todos", ""]);
  assert.deepEqual(z(gefuellt, "fragen").slice(0, 2), ["eba-td eba-td-fragen", ""]);
  // beide leer (auch ein leerer Tresor)
  const nichts = await mitNotizen({ "Notizen/Leer.md": "- [x] erledigt\n- Punkt ohne Kästchen" }).lesenBeide();
  assert.deepEqual(nichts, { todos: [], fragen: [] });
  assert.deepEqual(z(nichts, "todos"), ["eba-td eba-td-todos is-leer", "Nichts offen.", 0]);
  assert.deepEqual(z(nichts, "fragen"), ["eba-td eba-td-fragen is-leer", "Keine offenen Fragen.", 0]);
});

test("Datum ohne Jahr zählt ab dem Tag der Notiz: Ein offenes „bis 05.10.“ bleibt im Dezember überfällig (24.10.2026)", async () => {
  const heute = "2026-12-05", VL = "Vorlesungen/X100/2026-10-01 X100 VL 01.md";
  const fm = { [VL]: { typ: "vorlesung", code: "X100", datum: "2026-10-01", nummer: 1, thema: "Einführung" } };
  const M = laden("modell", { heute, notizen: fm }).ctx.modell;
  const { ctx, ergebnis: T } = laden("todos", { heute, kontext: { modell: M } });
  const notizen = { [VL]: "- [ ] Blatt abgeben bis 05.10.", "Notizen/Alt.md": "- [ ] Anmelden bis 03.10.", "Notizen/Neu.md": "- [ ] Lesen bis 01.10." };
  const ctime = { "Notizen/Alt.md": new Date(2026, 9, 1, 9).getTime() };
  ctx.app.vault.getMarkdownFiles = () => Object.keys(notizen).map((p) => ({ path: p, basename: path.basename(p, ".md"), stat: ctime[p] ? { ctime: ctime[p] } : undefined }));
  ctx.app.vault.cachedRead = async (f) => notizen[f.path];
  ctx.app.metadataCache.getFileCache = (f) => ({ frontmatter: fm[f.path], listItems: [{ task: " ", position: { start: { line: 0 } } }] });
  const iso = (d) => M.zeit.iso(d);
  const t = (await T.lesenBeide()).todos;
  assert.deepEqual(t.map((x) => [x.text, iso(x.faellig)]), [
    ["Anmelden bis 03.10.", "2026-10-03"], // ohne datum: Tag, an dem die Notiz entstand
    ["Blatt abgeben bis 05.10.", "2026-10-05"], // Feld datum der Notiz; bis 24.10.2026: 2027-10-05, nicht mehr überfällig, ganz hinten
    ["Lesen bis 01.10.", "2027-10-01"], // weder noch: wie bisher ab heute (mehr als 60 Tage zurück: nächstes Jahr)
  ]);
  assert.equal(iso(T.faellig("bis 05.10.", new Date(2026, 11, 5), "2026-10-01")), "2026-10-05");
  // Der Kurzname der Quellnotiz trägt das Thema und gehört zur Signatur des Blocks: Ändert sich das Thema, zeichnet er neu
  assert.equal(t[1].quelle, "X100 · Vorlesung 1 · Do 01.10. · Einführung");
  fm[VL].thema = "Grundbegriffe";
  assert.equal((await T.lesenBeide()).todos[1].quelle, "X100 · Vorlesung 1 · Do 01.10. · Grundbegriffe");
});

test("Notiz, die du über Jahre führst: ein neues „bis 15.11.“ zählt ab heute, nicht ab dem Anlegen; ein Datum im Dateinamen gilt", async () => {
  const heute = "2027-10-20";
  const M = laden("modell", { heute }).ctx.modell;
  const { ctx, ergebnis: T } = laden("todos", { heute, kontext: { modell: M } });
  const notizen = { "Notizen/Notizen.md": "- [ ] Bericht bis 15.11.", "Notizen/2027-07-01 Treffen.md": "- [ ] Protokoll bis 03.07.", "Notizen/Sommer.md": "- [ ] Lesen bis 05.08." };
  const ctime = { "Notizen/Notizen.md": new Date(2026, 9, 1, 9).getTime(), "Notizen/2027-07-01 Treffen.md": new Date(2025, 0, 1).getTime(), "Notizen/Sommer.md": new Date(2027, 7, 1, 9).getTime() };
  ctx.app.vault.getMarkdownFiles = () => Object.keys(notizen).map((p) => ({ path: p, basename: path.basename(p, ".md"), stat: { ctime: ctime[p] } }));
  ctx.app.vault.cachedRead = async (f) => notizen[f.path];
  ctx.app.metadataCache.getFileCache = () => ({ frontmatter: {}, listItems: [{ task: " ", position: { start: { line: 0 } } }] });
  const t = (await T.lesenBeide()).todos;
  assert.deepEqual(t.map((x) => [x.text, M.zeit.iso(x.faellig)]), [
    ["Protokoll bis 03.07.", "2027-07-03"], // Datum im Dateinamen geht der Anlegezeit vor (ab heute: 2028)
    ["Lesen bis 05.08.", "2027-08-05"], // angelegt vor 80 Tagen: ab da (ab heute: 2028)
    ["Bericht bis 15.11.", "2027-11-15"], // angelegt vor über 300 Tagen: ab heute, nicht 2026-11-15 (ein Jahr überfällig)
  ]);
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
