// „Bitte prüfen“ auf dem Dashboard (bitte-pruefen.js, Codeblock eba-bitte-pruefen): Abschnitt im Protokoll lesen, Kästchen
// genau in der richtigen Zeile setzen, nur im eigenen Uni-Abgleich etwas zeigen, sonst samt Hülle gefaltet (nie display:none an
// der Hülle). Nur ausgedachte Texte. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));
const BP = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "bitte-pruefen.js"));

const PROTOKOLL = [
  "---",
  "typ: protokoll",
  "offen: 3",
  "---",
  "",
  "# Uni-Abgleich",
  "",
  "## Letzter Lauf · 17.10.2026 19:35",
  "",
  "Nichts Neues.",
  "",
  "### Bitte prüfen",
  "- [ ] **Raum der Probe-Übung prüfen** · X100 · offen seit 15.10.",
  "    - Die Kursseite nennt Hörsaal 2, der Stundenplan Hörsaal 3 ([[X100 Probe|X100]]).",
  "    - Neu dazu: auch die Mail vom 16.10. nennt Hörsaal 2.",
  "- [x] **Klausurtermin X110 eintragen** · X110 · offen seit 12.10.",
  "  - Laut Prüfungsplan Fr 12.02.",
  "",
  "- [ ] Punkt ohne Titel und ohne Metazeile",
  "- Hinweis ohne Kästchen",
  "",
  "Text nach der Liste gehört zu keinem Punkt.",
  "    eingerückt, aber nach dem Text",
  "",
  "#### Unterabschnitt",
  "- [ ] zählt mit (Unterabschnitt)",
  "",
  "## Frühere Läufe",
  "- [ ] zählt nicht",
].join("\n");

test("lesen: Abschnitt „Bitte prüfen“ bis zur nächsten gleich hohen Überschrift, Titel, Metazeile, Unterpunkte, Kästchen", () => {
  const d = BP.lesen(PROTOKOLL);
  assert.equal(d.punkte.length, 5);
  assert.equal(d.offen, 4, "abgehakte zählen nicht als offen, Punkte ohne Kästchen schon");
  const [a, b, c, h, u] = d.punkte;
  assert.deepEqual([a.haken, a.text, a.meta], [" ", "**Raum der Probe-Übung prüfen**", "X100 · offen seit 15.10."]);
  assert.deepEqual(a.details, ["Die Kursseite nennt Hörsaal 2, der Stundenplan Hörsaal 3 ([[X100 Probe|X100]]).", "Neu dazu: auch die Mail vom 16.10. nennt Hörsaal 2."]);
  assert.equal(a.zeile, 12);
  assert.equal(a.roh, "- [ ] **Raum der Probe-Übung prüfen** · X100 · offen seit 15.10.");
  assert.deepEqual([b.haken, b.details], ["x", ["Laut Prüfungsplan Fr 12.02."]], "Unterpunkte mit zwei Leerzeichen eingerückt");
  assert.deepEqual([c.haken, c.text, c.meta, c.details], [" ", "Punkt ohne Titel und ohne Metazeile", "", []]);
  assert.deepEqual([h.haken, h.text, h.details], [null, "Hinweis ohne Kästchen", []], "Text nach der Liste hängt nicht am Punkt davor");
  assert.equal(u.text, "zählt mit (Unterabschnitt)");
});

test("lesen: nichts zu zeigen ohne Abschnitt, mit leerem Abschnitt oder nur Text; Überschrift in jeder Ebene, Groß/klein egal", () => {
  assert.equal(BP.lesen(""), null);
  assert.equal(BP.lesen(null), null);
  assert.equal(BP.lesen("# Protokoll\n- [ ] Punkt woanders"), null);
  assert.equal(BP.lesen("## Bitte prüfen\n\nNichts zu prüfen.\n## Danach\n- [ ] nicht hier"), null);
  assert.equal(BP.lesen("## Bitte prüfen\n## Erledigt\n- [x] alt"), null);
  assert.equal(BP.lesen("---\ntitel: Bitte prüfen\n---\n- [ ] Frontmatter ist keine Überschrift"), null);
  assert.equal(BP.lesen("# bitte Prüfen\n* [ ] Stern statt Strich").punkte[0].text, "Stern statt Strich");
  assert.equal(BP.lesen("## Bitte prüfen ##\r\n- [X] groß abgehakt\r\n").offen, 0);
});

test("haken: setzt genau die Zeile des Punkts, sucht sie notfalls (eindeutig), lässt den Rest unverändert", () => {
  const d = BP.lesen(PROTOKOLL);
  const neu = BP.haken(PROTOKOLL, d.punkte[0], "x");
  const z = neu.split("\n");
  assert.equal(z[12], "- [x] **Raum der Probe-Übung prüfen** · X100 · offen seit 15.10.");
  assert.equal(neu.replace("- [x] **Raum", "- [ ] **Raum"), PROTOKOLL, "sonst nichts geändert");
  assert.equal(BP.haken(PROTOKOLL, d.punkte[1], " ").split("\n")[15], "- [ ] **Klausurtermin X110 eintragen** · X110 · offen seit 12.10.");
  // Zeile verschoben (der Abgleich hat oben etwas eingefügt): gleicher Text wird gefunden
  const verschoben = "Neue Zeile\n" + PROTOKOLL;
  assert.equal(BP.haken(verschoben, d.punkte[0], "x").split("\n")[13].slice(0, 6), "- [x] ");
  // Text geändert oder doppelt: nichts schreiben
  assert.equal(BP.haken(PROTOKOLL.replace("Raum der Probe-Übung", "Raum der Übung"), d.punkte[0], "x"), null);
  assert.equal(BP.haken("x\n" + d.punkte[0].roh + "\n" + d.punkte[0].roh, d.punkte[0], "x"), null);
  assert.equal(BP.haken(PROTOKOLL, d.punkte[0], " "), null, "schon so");
  assert.equal(BP.haken(PROTOKOLL, d.punkte[3], "x"), null, "Punkt ohne Kästchen");
  // Windows-Zeilenenden bleiben
  const crlf = PROTOKOLL.replace(/\n/g, "\r\n");
  assert.ok(BP.haken(crlf, d.punkte[0], "x").split("\r\n")[12].startsWith("- [x] **Raum"));
});

// Tresor im Speicher: welche Dateien es gibt, Einstellungen, Inhalt des Protokolls
const mit = ({ abgleichJs = false, extern = false, protokoll = PROTOKOLL } = {}) => {
  const frontmatter = { "System/Einstellungen.md": extern ? { ilias_unterlagen: "extern" } : {} };
  if (abgleichJs) frontmatter["System/Skripte/abgleich.js"] = {};
  if (protokoll != null) frontmatter[BP.PROTOKOLL] = { typ: "protokoll" };
  const { ctx, ergebnis } = laden("bitte-pruefen", { frontmatter, kontext: { user: { eba: EBA } } });
  ctx.app.vault.cachedRead = async (f) => (f.path === BP.PROTOKOLL ? protokoll : "");
  return ergebnis;
};

test("Nur im eigenen Uni-Abgleich: ohne ihn nichts, auch wenn ein Protokoll mit Punkten da ist", async () => {
  assert.equal(await mit().daten(), null, "normale Nutzer:innen: kein Block, keine leere Karte");
  assert.equal(mit().eigenerAbgleich(), false);
  assert.equal((await mit({ abgleichJs: true }).daten()).offen, 4, "abgleich.js im Tresor");
  assert.equal((await mit({ extern: true }).daten()).offen, 4, "ilias_unterlagen: extern");
  assert.equal(await mit({ abgleichJs: true, protokoll: null }).daten(), null, "ohne Protokoll");
  assert.equal(await mit({ abgleichJs: true, protokoll: "## Bitte prüfen\n\nNichts zu prüfen." }).daten(), null, "ohne Punkte");
  // ohne eba.js (Helfer fehlt) gibt es keinen eigenen Abgleich
  const ohne = laden("bitte-pruefen", { frontmatter: { "System/Skripte/abgleich.js": {}, [BP.PROTOKOLL]: {} } }).ergebnis;
  assert.equal(ohne.eigenerAbgleich(), false);
});

// Obsidian misst Abschnitte der Leseansicht; ein unsichtbarer Block wird darum auf Höhe 0 gefaltet (tests/leseansicht.test.js).
test("CSS: leerer Block samt Hülle gefaltet (Höhe 0), Live Preview ausgeblendet, Karte als Callout eba-pruefen", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "snippets", "eba-core.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const regeln = (css.match(/[^{}]+\{[^{}]*\}/g) || []).filter((r) => r.indexOf("eba-bp-aus") >= 0);
  const huelle = regeln.filter((r) => /\.el-pre:has\(> \.block-language-eba-bitte-pruefen\.eba-bp-aus\)/.test(r));
  assert.equal(huelle.length, 1);
  assert.match(huelle[0], /height: 0;/);
  assert.doesNotMatch(huelle[0], /display:\s*none/);
  assert.ok(regeln.some((r) => /\.cm-embed-block:has\(> \.block-language-eba-bitte-pruefen\.eba-bp-aus\)/.test(r) && /display: none/.test(r)));
  assert.match(fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "bitte-pruefen.js"), "utf8"),
    /setAttribute\("data-callout", "eba-pruefen"\)/);
});

test("Dashboard: nackter Codeblock als erster Block unter „Zu erledigen“, ohne Karte drumherum", () => {
  const zeilen = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "Dashboard.md"), "utf8").split("\n");
  const i = zeilen.indexOf("## Zu erledigen");
  assert.ok(i >= 0);
  assert.deepEqual(zeilen.slice(i + 1, i + 5), ["", "```eba-bitte-pruefen", "```", ""]);
  assert.equal(zeilen.filter((z) => z.indexOf("eba-bitte-pruefen") >= 0).length, 1);
});
