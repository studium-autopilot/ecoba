// Neuigkeiten zum Update (update.js, seit 0.4.1): Abschnitte aus CHANGELOG.md, Auswahl „von (ausschließlich) bis
// (einschließlich)“, entschärftes Markdown, Abstand des Hinweises je Version, „Aktualisiert auf …“ nach einem Update und wann das
// Manifest frisch geholt wird. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const U = laden("update").ctx.update;
const MIN = 60e3, STUNDE = 60 * MIN;

const BEISPIEL = [
  "# Änderungen",
  "",
  "Versionsnummern nach Semantic Versioning.",
  "",
  "## Unveröffentlicht",
  "",
  "- Noch nicht erschienen.",
  "",
  "## 0.5.0-beta.1 – Testversion",
  "",
  "- Beta.",
  "",
  "## 0.4.1 – Neuigkeiten",
  "",
  "- Hinweis beim Öffnen.",
  "  Zweite Zeile.",
  "",
  "## 0.4.0 – Unterlagen aus ILIAS",
  "",
  "- ILIAS.",
  "",
  "Außerdem:",
  "",
  "- Mehr.",
  "",
  "## 0.3.1 - Bindestrich statt Halbgeviert",
  "- Kurz.",
  "## 0.3.0",
  "- Ohne Titel.",
].join("\n");

test("Changelog: Abschnitte je Version, andere Überschriften zählen nicht", () => {
  const a = U.changelogAbschnitte(BEISPIEL);
  assert.deepEqual(a.map((x) => x.version), ["0.5.0-beta.1", "0.4.1", "0.4.0", "0.3.1", "0.3.0"]);
  assert.equal(a[1].titel, "Neuigkeiten");
  assert.equal(a[1].text, "- Hinweis beim Öffnen.\n  Zweite Zeile.");
  assert.equal(a[2].text, "- ILIAS.\n\nAußerdem:\n\n- Mehr.");
  assert.equal(a[3].titel, "Bindestrich statt Halbgeviert");
  assert.equal(a[4].titel, "");
  assert.ok(!a.some((x) => /Noch nicht erschienen/.test(x.text)), "„Unveröffentlicht“ gehört zu keiner Version");
  assert.deepEqual(U.changelogAbschnitte(""), []);
  assert.deepEqual(U.changelogAbschnitte(null), []);
  // Windows-Zeilenenden
  assert.equal(U.changelogAbschnitte("## 1.0.0 – A\r\n\r\n- x\r\n").length, 1);
});

test("Changelog: der echte CHANGELOG.md lässt sich lesen", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md"), "utf8");
  const a = U.changelogAbschnitte(text);
  assert.ok(a.length >= 3, "mindestens drei Versionen");
  for (const x of a) assert.ok(x.text.length > 0, "Abschnitt " + x.version + " hat Text");
  assert.ok(a.some((x) => x.version === "0.4.0" && x.titel === "Unterlagen aus ILIAS"));
});

test("Changelog: Auswahl von (ausschließlich) bis (einschließlich), neueste zuerst", () => {
  const a = U.changelogAbschnitte(BEISPIEL);
  const v = (von, bis) => U.abschnitteZwischen(a, von, bis).map((x) => x.version);
  assert.deepEqual(v("0.3.0", "0.4.1"), ["0.4.1", "0.4.0", "0.3.1"]);
  assert.deepEqual(v("0.4.0", "0.4.1"), ["0.4.1"]);
  assert.deepEqual(v("0.4.1", "0.4.1"), []);
  // Beta: liegt nach 0.4.1 und vor 0.5.0
  assert.deepEqual(v("0.4.1", "0.5.0-beta.1"), ["0.5.0-beta.1"]);
  assert.deepEqual(v("0.4.0", "0.5.0"), ["0.5.0-beta.1", "0.4.1"]);
  // von unbekannt → nur bis; bis ungültig → nichts
  assert.deepEqual(v("", "0.4.0"), ["0.4.0"]);
  assert.deepEqual(v("0.4.0", "kaputt"), []);
  // Reihenfolge in der Datei egal, doppelte Überschriften zählen einmal, höchstens acht
  const gemischt = [{ version: "0.3.1", text: "a" }, { version: "0.4.0", text: "b" }, { version: "0.4.0", text: "c" }];
  assert.deepEqual(U.abschnitteZwischen(gemischt, "0.3.0", "0.4.0").map((x) => x.text), ["b", "a"]);
  const viele = [];
  for (let i = 1; i <= 12; i++) viele.push({ version: "1." + i + ".0", text: "" });
  assert.equal(U.abschnitteZwischen(viele, "0.9.0", "1.12.0").length, 8);
  assert.equal(U.abschnitteZwischen(viele, "0.9.0", "1.12.0")[0].version, "1.12.0");
});

test("Changelog: Markdown wird entschärft (kein HTML, keine Einbettungen, keine Codeblöcke)", () => {
  const s = U.markdownSicher;
  assert.equal(s("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(s("A & B"), "A &amp; B");
  assert.equal(s("![bild](https://x.test/a.png)"), "\\![bild](https://x.test/a.png)");
  assert.equal(s("![[Notiz]] und [[Link]]"), "\\!\\[\\[Notiz\\]\\] und \\[\\[Link\\]\\]");
  assert.equal(s("%%versteckt%%"), "\\%\\%versteckt\\%\\%");
  assert.equal(s("vor\n\n```eba-agenda\nx\n```\n\nnach"), "vor\n\nx\n\nnach");
  // Umbrochene Zeilen werden verbunden; Listenpunkte, Leerzeilen und Überschriften bleiben
  assert.equal(s("- Eins und\n  weiter.\n- Zwei\n\nAußerdem:\n\n- Drei\n1. Vier\n## X"), "- Eins und weiter.\n- Zwei\n\nAußerdem:\n\n- Drei\n1. Vier\n## X");
  assert.equal(s("- **fett** und [Link](https://github.com/)"), "- **fett** und [Link](https://github.com/)");
});

test("Hinweis: einmal je Version und höchstens alle 12 Stunden", () => {
  const f = U.toastFaellig;
  const jetzt = Date.parse("2026-10-17T12:00:00Z");
  assert.equal(f(null, "0.4.1", jetzt), true);
  assert.equal(f({ version: "0.4.1", zeit: jetzt - 1 * STUNDE }, "0.4.1", jetzt), false);
  assert.equal(f({ version: "0.4.1", zeit: jetzt - 11.9 * STUNDE }, "0.4.1", jetzt), false);
  assert.equal(f({ version: "0.4.1", zeit: jetzt - 12 * STUNDE }, "0.4.1", jetzt), true);
  assert.equal(f({ version: "0.4.0", zeit: jetzt - 1 * MIN }, "0.4.1", jetzt), true, "neue Version: sofort");
  assert.equal(f({ version: "0.4.1", zeit: "kaputt" }, "0.4.1", jetzt), true, "unlesbare Zeit: zeigen");
});

test("Hinweis: nach dem Fenster zu dieser Version keiner mehr, auch wenn du es nur geschlossen hast", () => {
  const f = U.toastFaellig;
  const jetzt = Date.parse("2026-10-20T12:00:00Z");
  assert.equal(f({ version: "0.4.9", zeit: jetzt - 13 * STUNDE }, "0.4.9", jetzt), true, "nur der Hinweis: nach 12 Stunden wieder");
  assert.equal(f({ version: "0.4.9", zeit: jetzt - 13 * STUNDE, fenster: true }, "0.4.9", jetzt), false, "Fenster gesehen: nie wieder");
  assert.equal(f({ version: "0.4.9", zeit: jetzt, fenster: true }, "0.5.0", jetzt), true, "nächste Version: wieder");
});

test("Nach einem Update: einmal „Aktualisiert auf …“, erster Lauf auf dem Gerät still", () => {
  const n = U.nachUpdate;
  assert.deepEqual(n("0.4.0", "0.4.1", "0.4.1"), { von: "0.4.0", bis: "0.4.1" });
  assert.deepEqual(n("0.4.0", "0.5.0-beta.1", "0.5.0-beta.1"), { von: "0.4.0", bis: "0.5.0-beta.1" });
  assert.equal(n("0.4.1", "0.4.1", "0.4.1"), null, "schon gesehen");
  assert.equal(n(null, "0.4.1", "0.4.1"), "merken", "erster Lauf auf diesem Gerät");
  assert.equal(n("0.5.0", "0.4.1", "0.4.1"), "merken", "ältere Version läuft (z. B. Sicherung zurückgespielt)");
  assert.equal(n("0.4.0", "0.4.0", "0.4.1"), null, "Neu laden steht noch aus");
  assert.equal(n("0.4.0", "0.0.x", ""), null);
});

test("Manifest frisch holen: nur, wenn die letzte Prüfung über 30 Minuten her ist", () => {
  const f = U.pruefungFaellig;
  const jetzt = Date.parse("2026-10-17T12:00:00Z");
  assert.equal(f("", null, jetzt), true, "noch nie geprüft");
  assert.equal(f(new Date(jetzt - 10 * MIN).toISOString(), null, jetzt), false, "voller Abruf vor 10 Min.");
  assert.equal(f(new Date(jetzt - 40 * MIN).toISOString(), jetzt - 5 * MIN, jetzt), false, "eigene Prüfung vor 5 Min.");
  assert.equal(f(new Date(jetzt - 40 * MIN).toISOString(), jetzt - 31 * MIN, jetzt), true);
  assert.equal(f("kaputt", "kaputt", jetzt), true);
});

test("Hinweis: nicht, solange die Dashboard-Zeile dasselbe sichtbar zeigt (zählt nicht gegen den Abstand)", () => {
  const e = U.toastEntscheiden;
  const jetzt = Date.parse("2026-10-17T12:00:00Z");
  const a = { version: "0.4.1" };
  assert.equal(e({ angebot: a, jetzt, bannerSichtbar: false }), "angebot");
  assert.equal(e({ angebot: a, jetzt, bannerSichtbar: true }), "verdeckt");
  assert.equal(e({ angebot: a, jetzt, bannerSichtbar: true, merk: { version: "0.4.1", zeit: jetzt - STUNDE } }), null, "Abstand gilt vor der Zeile");
  assert.equal(e({ angebot: a, jetzt, neuLaden: true }), null, "Neu laden steht aus");
  // „Aktualisiert auf …“ hängt nicht von der Zeile ab
  assert.equal(e({ angebot: null, jetzt, bannerSichtbar: true, nach: { von: "0.4.0", bis: "0.4.1" } }), "aktualisiert");
  assert.equal(e({ angebot: null, jetzt, nach: "merken" }), null);
  assert.equal(e({ angebot: null, jetzt, nach: null }), null);
});

// Kern (main.js) mit einem kleinen Ersatz für „obsidian“; nur hinweisSammeln, ohne onload
test("Andere Geräte: Skripte eines Updates über den Sync ohne „Aktualisiert: …“ je Datei, ein bearbeitetes Skript mit Hinweis", (t) => {
  const Module = require("node:module");
  const hinweise = [];
  const OBS = { Plugin: class {}, Modal: class {}, FuzzySuggestModal: class {}, TFile: class {}, Notice: class { constructor(text) { hinweise.push(text); } } };
  const laden0 = Module._load;
  Module._load = function (anfrage, ...rest) { return anfrage === "obsidian" ? OBS : laden0.call(this, anfrage, ...rest); };
  let Kern;
  try { Kern = require(path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "plugins", "studium-autopilot", "main.js")); } finally { Module._load = laden0; }
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1e12 });
  const k = Object.create(Kern.prototype);
  k.stillBis = 0;

  k.hinweisSammeln("woche");
  t.mock.timers.tick(3000);
  assert.deepEqual(hinweise, ["Aktualisiert: woche"], "eines: Hinweis");

  for (const n of ["zentral", "modul", "todos"]) { k.hinweisSammeln(n); t.mock.timers.tick(1000); }
  t.mock.timers.tick(3000);
  k.hinweisSammeln("termine"); // Nachzügler desselben Syncs
  t.mock.timers.tick(3000);
  assert.deepEqual(hinweise, ["Aktualisiert: woche"], "mehrere auf einmal und Nachzügler: still");

  t.mock.timers.tick(60000);
  k.hinweisSammeln("woche");
  t.mock.timers.tick(3000);
  assert.deepEqual(hinweise, ["Aktualisiert: woche", "Aktualisiert: woche"], "danach wieder je bearbeitetem Skript");

  k.stillBis = Date.now() + 120000; // während eines Updates auf diesem Gerät bzw. nach neuer installiert.json (update.js)
  k.hinweisSammeln("woche");
  t.mock.timers.tick(3000);
  assert.equal(hinweise.length, 2);
});
