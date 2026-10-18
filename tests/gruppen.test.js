// Übungs- und Tutoriengruppen (gruppen.js, Codeblock eba-gruppen): Auswahl, Sortierung, Zeitangabe und die Markierung
// „im Stundenplan“. Nur ausgedachte Daten. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

// mit der einen Regel „ist das deine Gruppe?“ aus meine-gruppe.js (gehoertZu)
const G = laden("gruppen", { kontext: { user: { "meine-gruppe": laden("meine-gruppe").ergebnis } } }).ergebnis;

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

test("Markierung: eine Vorlesung zur selben Zeit markiert keine Übungsgruppe (Art zählt)", () => {
  const vl = [{ fm: { code: "X100", semester: "WS 2026/27", wochentag: 2, beginn: "08:15", art: "Vorlesung", herkunft: "zentral" } }];
  assert.equal(G.imStundenplan(g({ tag: "Di", von: "08:00" }), vl), false);
  const ue = [{ fm: { code: "X100", semester: "WS 2026/27", wochentag: 2, beginn: "08:15", art: "Übung" } }];
  assert.equal(G.imStundenplan(g({ tag: "Di", von: "08:00" }), ue), true);
  const unbestimmt = [{ fm: { code: "X100", semester: "WS 2026/27", wochentag: 2, beginn: "08:00", art: "Veranstaltung" } }];
  assert.equal(G.imStundenplan(g({ tag: "Di", von: "08:00" }), unbestimmt), true, "Alma erkennt die Art nicht immer");
});

test("Meine Gruppe: Herkunft der Markierung, ILIAS zugeordnet, mehrdeutig mit Kandidaten, Knopf nur ohne andere Quelle", () => {
  const liste = [g({ id: "a1", gruppe: "1" }), g({ id: "a2", gruppe: "2", tag: "Mi", von: "12:00", bis: "14:00" }), g({ id: "a3", gruppe: "3", tag: "Do" })];
  const gew = [{ fm: { code: "X100", semester: "WS 2026/27", herkunft: "gruppe-gewaehlt", gruppe_id: "a2", wochentag: 3, beginn: "12:15", art: "Übung" } }];
  let k = G.auswaehlen(liste, { stundenplan: gew })[0];
  assert.deepEqual(k.gruppen.map((x) => [x.id, x.woher]), [["a1", ""], ["a2", "gewaehlt"], ["a3", ""]]);
  assert.equal(k.waehlbar, true, "gewählte Gruppe lässt sich ändern");
  k = G.auswaehlen(liste, { ilias: [{ code: "X100", status: "zugeordnet", zentral: "a3", kandidaten: [] }] })[0];
  assert.deepEqual([k.gruppen.find((x) => x.id === "a3").woher, k.waehlbar, k.iliasOffen], ["ilias", false, ""]);
  k = G.auswaehlen(liste, { ilias: [{ code: "X100", status: "mehrdeutig", zentral: "", kandidaten: ["a1", "a3"] }] })[0];
  assert.deepEqual([k.gruppen.map((x) => x.kandidat), k.waehlbar, k.iliasOffen], [[true, false, true], true, "mehrdeutig"]);
  const alma = [{ fm: { code: "X100", semester: "WS 2026/27", wochentag: 2, beginn: "08:15", art: "Übung" } }];
  assert.equal(G.auswaehlen(liste, { stundenplan: alma })[0].waehlbar, false, "Alma liefert die Gruppe schon");
});

test("Meine Gruppe: Abwählen bleibt neben ILIAS, ILIAS-Name für die Anzeige", () => {
  const liste = [g({ id: "a1", gruppe: "1" }), g({ id: "a5", gruppe: "5", tag: "Mi", von: "12:00", bis: "14:00" })];
  const sp = [
    { fm: { code: "X100", semester: "WS 2026/27", herkunft: "ilias-gruppe", gruppe_id: "a5", gruppe: "Gruppe 4", wochentag: 3, beginn: "12:15", art: "Übung" } },
    { fm: { code: "X100", semester: "WS 2026/27", herkunft: "gruppe-gewaehlt", gruppe_id: "a1", wochentag: 2, beginn: "08:15", art: "Übung" } },
  ];
  const k = G.auswaehlen(liste, { stundenplan: sp })[0];
  assert.deepEqual(k.gruppen.map((x) => [x.id, x.woher, x.gewaehlt, x.iliasName]), [["a1", "gewaehlt", true, ""], ["a5", "ilias", false, "Gruppe 4"]]);
  assert.deepEqual([k.waehlbar, k.knoepfe], [false, true], "„Meine“ weg, „Abwählen“ bleibt");
  const k2 = G.auswaehlen(liste, { ilias: [{ code: "X100", status: "zugeordnet", zentral: "a5", name: "Gruppe 4", kandidaten: [] }] })[0];
  assert.equal(k2.gruppen.find((x) => x.id === "a5").iliasName, "Gruppe 4", "Name aus ILIAS, bevor die Notiz da ist");
});
