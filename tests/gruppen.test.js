// Übungs- und Tutoriengruppen (gruppen.js, Codeblock eba-gruppen): Auswahl, Sortierung, Zeitangabe und die Markierung
// „im Stundenplan“. Nur ausgedachte Daten. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const G = laden("gruppen").ergebnis;

const g = (anders = {}) => Object.assign({
  id: "x", code: "X100", art: "Übung", gruppe: "1", tag: "Di", von: "08:00", bis: "10:00", ct: true, raum: "HS 1", leitung: "",
  anmeldung: "Über den ILIAS-Kurs.", quelle_url: "https://alma.uni-tuebingen.de/a", semester: "WS 2026/27", zeitraum: null, geprueft: "",
}, anders);

test("Zeit: c.t., volle Stunden und Minuten", () => {
  assert.equal(G.zeitText(g()), "8–10 c.t.");
  assert.equal(G.zeitText(g({ ct: false, von: "14:00", bis: "16:00" })), "14–16");
  assert.equal(G.zeitText(g({ ct: false, von: "08:30", bis: "10:00" })), "8:30–10:00");
  assert.equal(G.zeitText(g({ ct: false, von: "12:15", bis: "13:45" })), "12:15–13:45");
});

test("Auswahl: eigene Module, aktuelles und nächstes Semester, je Modul und Art eine Karte", () => {
  const liste = [
    g({ id: "a3", gruppe: "3", tag: "Mi", von: "12:00", bis: "14:00" }),
    g({ id: "a1", gruppe: "1", tag: "Di", von: "16:00", bis: "18:00", anmeldung: "Über den ILIAS-Kurs." }),
    g({ id: "a2", gruppe: "2", tag: "Di", von: "08:00", bis: "10:00", anmeldung: "Zweiter Hinweis." }),
    g({ id: "b1", code: "Y200", art: "Tutorium", quelle_url: "https://uni-tuebingen.de/lehrstuhl" }),
    g({ id: "c1", code: "Z300" }),
    g({ id: "s1", semester: "SS 2027" }),
    g({ id: "alt", semester: "SS 2026" }),
  ];
  const k = G.auswaehlen(liste, { codes: { X100: true, Y200: true }, semester: ["WS 2026/27", "SS 2027"], titel: { X100: "Beispielmodul" } });
  assert.deepEqual(k.map((x) => [x.semester, x.code, x.art]), [["WS 2026/27", "X100", "Übung"], ["WS 2026/27", "Y200", "Tutorium"], ["SS 2027", "X100", "Übung"]]);
  assert.deepEqual(k[0].gruppen.map((x) => x.id), ["a2", "a1", "a3"], "nach Tag und Uhrzeit");
  assert.deepEqual(k[0].anmeldung, ["Über den ILIAS-Kurs.", "Zweiter Hinweis."], "gleiche Hinweise nur einmal");
  assert.equal(k[0].titel, "Beispielmodul");
  assert.deepEqual(k[1].quellen, ["https://uni-tuebingen.de/lehrstuhl"]);
  // ohne Filter (Argument „alle“, kein Datenmodell): alles
  assert.equal(G.auswaehlen(liste, {}).length, 5);
});

test("Markierung: Gruppe steht im eigenen Stundenplan (Code, Semester, Wochentag, Beginn ±15 Min.)", () => {
  const sp = [{ fm: { code: "X100", semester: "WS 2026/27", wochentag: 3, beginn: "12:15" } }];
  assert.equal(G.imStundenplan(g({ tag: "Mi", von: "12:00" }), sp), true, "c.t.: 15 Minuten später");
  assert.equal(G.imStundenplan(g({ tag: "Mi", von: "14:00" }), sp), false, "andere Uhrzeit");
  assert.equal(G.imStundenplan(g({ tag: "Di", von: "12:00" }), sp), false, "anderer Tag");
  assert.equal(G.imStundenplan(g({ tag: "Mi", von: "12:00", semester: "SS 2027" }), sp), false, "anderes Semester");
  const k = G.auswaehlen([g({ id: "m", tag: "Mi", von: "12:00", bis: "14:00" }), g({ id: "n" })], { stundenplan: sp });
  assert.deepEqual(k[0].gruppen.map((x) => [x.id, x.dein]), [["n", false], ["m", true]]);
});
