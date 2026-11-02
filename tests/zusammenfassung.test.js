// Zusammenfassung eines Moduls (zusammenfassung.js): Kapitel mit Kürzel und Abschnitte aus den Überschriften, Abschnittsnummern,
// wo du gerade liest, wann die Kapitel-Leiste kommt, Zeile oben, Faltung auf dem Telefon, Formelgröße, Überschriften aus dem Text
// für die Bearbeitungsansicht. Leiste und Zeichnen
// prüft man in Obsidian (docs/tests.md). Nur ausgedachte Kapitel. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const Z = laden("zusammenfassung").ergebnis;
const h = (level, heading, line) => ({ level, heading, position: { start: { line } } });
const UEBERSCHRIFTEN = [
  h(1, "X100 Zusammenfassung", 5),
  h(2, "E · Einstieg", 20),
  h(2, "I · Erstes **Kapitel**", 40), h(3, "Daten [[X100 Folien.pdf#page=3|S. 3]]", 50), h(4, "Feinheit", 55), h(3, "[[Quantil|Quantile]]", 60),
  h(5, "Fünfte Ebene", 62),
  h(2, "Ohne Kürzel", 80), h(4, "Gleich ein Abschnitt", 82), h(3, "1. Schritt", 85), h(3, "Danach", 88),
  h(2, "Kapitel VII · zu lang für ein Kürzel", 100),
];

test("Kapitel: Kürzel vor „ · “, sonst die Nummer; ### und #### darin, #### unter ### rückt ein, Titel und ##### zählen nicht", () => {
  const k = Z.kapitelAus(UEBERSCHRIFTEN);
  assert.deepEqual(k.map((x) => [x.kurz, x.text, x.zeile]), [["E", "Einstieg", 20], ["I", "Erstes Kapitel", 40], ["3", "Ohne Kürzel", 80],
    ["4", "Kapitel VII · zu lang für ein Kürzel", 100]]);
  assert.deepEqual(k[0].unter, []);
  assert.deepEqual(k[1].unter.map((u) => [u.text, u.ebene, u.tief, u.nr]), [["Daten", 3, false, "I.1"], ["Feinheit", 4, true, ""], ["Quantile", 3, false, "I.2"]]);
  assert.deepEqual(k[2].unter.map((u) => [u.text, u.tief, u.nr]), [["Gleich ein Abschnitt", false, "3.1"], ["1. Schritt", false, ""], ["Danach", false, "3.2"]]);
  assert.deepEqual(Z.kapitelAus(undefined), []);
});

test("Abschnittsnummern je Zeile: nur Abschnitte mit Nummer", () => {
  const n = Z.nummern(UEBERSCHRIFTEN);
  assert.deepEqual(Array.from(n), [[50, "I.1"], [60, "I.2"], [82, "3.1"], [88, "3.2"]]);
});

test("Überschrift ohne Markdown: PDF-Seitenlink fällt weg, Links werden ihr Text", () => {
  assert.equal(Z.klartext("Quantile [[S110 Folien.pdf#page=40|S. 40]] und [[a|b]] `c` ==d=="), "Quantile und b c d");
  assert.equal(Z.klartext("[Text](https://x.y) [[Ziel]]"), "Text Ziel");
  assert.equal(Z.klartext(null), "");
});

test("Wo du liest: letzte Überschrift über der Zeile; vor dem ersten Kapitel keins", () => {
  const k = Z.kapitelAus(UEBERSCHRIFTEN);
  assert.deepEqual(Z.aktivBei(k, 10), { k: -1, u: -1 });
  assert.deepEqual(Z.aktivBei(k, 20), { k: 0, u: -1 });
  assert.deepEqual(Z.aktivBei(k, 45), { k: 1, u: -1 });
  assert.deepEqual(Z.aktivBei(k, 57), { k: 1, u: 1 });
  assert.deepEqual(Z.aktivBei(k, 5000), { k: 3, u: -1 });
});

test("Leiste: ab 1000 px und nur, wenn neben ihr die zwei Spalten der Abschnitte Platz haben", () => {
  assert.equal(Z.leisteAn(999, 0), false);
  assert.equal(Z.leisteAn(1000, 0), true);
  // zwei Spalten à 24em bei 16 px und 44 px Abstand: 812 px Text
  assert.equal(Z.leisteAn(1376, 812), true);
  assert.equal(Z.leisteAn(1280, 812), true);
  assert.equal(Z.leisteAn(1032, 812), false);
  assert.equal(Z.leisteAn(Z.PLATZ + 812, 812), true);
  assert.equal(Z.leisteAn(Z.PLATZ + 811, 812), false);
});

test("Wo du liest: Linie ein Viertel unter dem oberen Rand, die letzte gezeichnete Überschrift darüber zählt vor", () => {
  const k = Z.kapitelAus(UEBERSCHRIFTEN);
  assert.equal(Z.aktivZeile(52, []), 53.5);
  assert.equal(Z.aktivZeile(52, [60, 55]), 60);
  assert.equal(Z.aktivZeile(70, [60]), 71.5); // getScroll schon weiter
  assert.equal(Z.aktivZeile(21, [20, 40]), 40); // Kapitel davor zugeklappt: getScroll nennt eine Zeile darin
  assert.equal(Z.aktivZeile(undefined), 1.5);
  assert.deepEqual(Z.aktivBei(k, Z.aktivZeile(52, [60])), { k: 1, u: 2 });
});

test("Zeile oben (schmal): Abschnitt mit Nummer, im Kapitel vor dem ersten Abschnitt sein Kürzel und Titel, davor nichts", () => {
  const k = Z.kapitelAus(UEBERSCHRIFTEN);
  assert.deepEqual(Z.stelleText(k, { k: 1, u: 2 }), { nr: "I.2", text: "Quantile" });
  assert.deepEqual(Z.stelleText(k, { k: 1, u: -1 }), { nr: "I", text: "Erstes Kapitel" });
  assert.deepEqual(Z.stelleText(k, { k: 1, u: 1 }), { nr: "I", text: "Feinheit" }); // tief: ohne eigene Nummer
  assert.equal(Z.stelleText(k, { k: -1, u: -1 }), null);
});

test("Telefon: alle Kapitel zugeklappt, je ## bis vor das nächste, das letzte bis zum Ende", () => {
  assert.deepEqual(Z.kapitelFalten(UEBERSCHRIFTEN, 120), [{ from: 20, to: 39 }, { from: 40, to: 79 }, { from: 80, to: 99 }, { from: 100, to: 119 }]);
  assert.deepEqual(Z.kapitelFalten([h(1, "T", 0)], 10), []);
});

test("Formeln: passen sie, bleibt die Größe; sonst kleiner, nie unter FORMEL_MIN", () => {
  assert.equal(Z.formelSkala(300, 300), 1);
  assert.equal(Z.formelSkala(300, 200), 1);
  assert.equal(Z.formelSkala(300, 360), 0.82);
  assert.equal(Z.formelSkala(300, 1000), Z.FORMEL_MIN);
  assert.equal(Z.formelSkala(0, 500), 1); // nicht gezeichnet
  assert.ok(Z.formelSkala(300, 360) * 360 <= 298); // 2 px Luft
});

test("Sprung: Faltung an einer Überschrift geht auf, wenn das Ziel bis vor die nächste gleicher Ebene liegt", () => {
  // so gibt Obsidian die Faltung der Leseansicht an: from = Zeile der Überschrift, to = from + 1
  const folds = [{ from: 20, to: 21 }, { from: 40, to: 41 }, { from: 50, to: 51 }, { from: 90, to: 93 }];
  const bleiben = (zeile) => Z.faltungenOhne(folds, UEBERSCHRIFTEN, zeile).map((f) => f.from);
  assert.deepEqual(bleiben(56), [20, 90]); // Kapitel I (bis 79) und Abschnitt „Daten“ (bis 59) gehen auf
  assert.deepEqual(bleiben(60), [20, 50, 90]); // „Quantile“: nur Kapitel I
  assert.deepEqual(bleiben(40), [20, 50, 90]); // das Kapitel selbst
  assert.deepEqual(bleiben(92), [20, 40, 50]); // Faltung ohne Überschrift (Liste): from bis to
  assert.deepEqual(bleiben(150), [20, 40, 50, 90]); // letztes Kapitel reicht bis zum Ende, ist aber nicht gefaltet
  assert.deepEqual(Z.faltungenOhne(undefined, UEBERSCHRIFTEN, 3), []);
});

test("Bearbeitungsansicht: typ aus den Eigenschaften, Überschriften ohne Eigenschaften und Codeblöcke", () => {
  const zeilen = ["---", "typ: zusammenfassung", "code: \"X100\"", "---", "## I · Eins", "```", "### kein Abschnitt", "```",
    "### Teil", "~~~", "## auch keins", "~~~", "##ohne Leerzeichen", "## II · Zwei", "### Erster"];
  assert.equal(Z.typAus(zeilen), "zusammenfassung");
  assert.equal(Z.typAus(["---", "typ: \"vorlesung\"", "---"]), "vorlesung");
  assert.equal(Z.typAus(["# ohne Eigenschaften", "typ: zusammenfassung"]), "");
  assert.deepEqual(Z.ueberschriften(zeilen).map((x) => [x.level, x.position.start.line]), [[2, 4], [3, 8], [2, 13], [3, 14]]);
  assert.deepEqual(Array.from(Z.nummern(Z.ueberschriften(zeilen))), [[8, "I.1"], [14, "II.1"]]);
  assert.ok(Z.istZusammenfassung({ typ: "Zusammenfassung" }));
  assert.ok(!Z.istZusammenfassung({ typ: "unterlage" }) && !Z.istZusammenfassung(null));
});

test("Registrieren ohne Arbeitsfläche (Tests, früher Start) wirft nicht", () => {
  assert.doesNotThrow(() => laden("zusammenfassung").ergebnis.registrieren());
});

test("eba-core.css 72: Leiste nur mit Klasse, Rand gegen Teil 1 und 1b, Abschnitte nur unter dem aktiven Kapitel, Nummer im Text", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "snippets", "eba-core.css"), "utf8");
  const teil = css.slice(css.indexOf("/* ---------- 72."), css.indexOf("/* ---------- Ende Abschnitt 72"));
  for (const s of [".eba-zf-leiste, .eba-zf-zeile { display: none; }", ".view-content.eba-zf-mit-leiste > .eba-zf-leiste",
    "body .workspace-leaf-content .view-content.eba-zf-mit-leiste .markdown-reading-view > .markdown-preview-view",
    ".eba-zf-kap.aktiv + .eba-zf-unter { display: block; }", "content: attr(data-eba-nr)", ".eba-zf-kap > .eba-zf-text { white-space: nowrap;",
    ".view-content.eba-zf-mit-zeile > .eba-zf-zeile.is-da", "content: attr(data-label)"]) {
    assert.ok(teil.includes(s), s);
  }
  // PLATZ im Skript = Leiste + Abstand + Rand rechts im CSS
  const breit = Number(/> \.eba-zf-leiste \{[^}]*width: (\d+)px/.exec(teil)[1]);
  const [links, rechts] = /padding-left: (\d+)px !important; padding-right: (\d+)px !important/.exec(teil).slice(1).map(Number);
  assert.ok(links > breit);
  assert.equal(Z.PLATZ, links + rechts);
  // Ein Zustand: der aktive Abschnitt ohne Fläche, nur der Strich; Tabellen als Blöcke nur auf dem Telefon und nur beschriftet
  assert.ok(!/\.eba-zf-abs\.aktiv \{[^}]*background/.test(teil));
  for (const r of teil.split("}").filter((x) => x.includes("table[data-eba-spalten]"))) assert.ok(/body\.is-phone \.markdown-preview-view/.test(r), r);
});
