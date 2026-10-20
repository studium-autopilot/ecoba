// Unterlagen auf der Modulseite (unterlagenliste.js, Codeblock eba-unterlagen): Art, Abschnitte, Lösungen bei ihrer Aufgabe,
// Reihenfolge. Nur ausgedachte Daten (Code X100). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const U = laden("unterlagenliste").ergebnis;
const u = (name, fm) => ({ f: { basename: "X100 " + name, path: `Unterlagen/X100 Beispiel/X100 ${name}.md` },
  fm: Object.assign({ typ: "unterlage", code: "X100", status: "neu", datei: `[[X100 ${name}.pdf]]` }, fm) });
const namen = (G) => G.map((g) => g.name);
const titel = (g) => g.zeilen.map((z) => z.titel);

test("Art: Schreibweise wie in der Liste, leer wird Sonstiges, Unbekanntes bleibt", () => {
  assert.equal(U.artVon("übung"), "Übung");
  assert.equal(U.artVon("FOLIEN"), "Folien");
  assert.equal(U.artVon(""), "Sonstiges");
  assert.equal(U.artVon("Handout"), "Handout");
});

test("Wörter: ohne Lösungswörter, Kürzel und Doppelte", () => {
  assert.deepEqual(U.woerter("Kurzlösungen Aufgabenkatalog WS 2026-27", "X100"), ["aufgabenkatalog", "ws", "2026", "27"]);
  assert.deepEqual(U.woerter("X100 Musterlösung Blatt 3 Korrektur", "X100"), ["blatt", "3"]);
  assert.deepEqual(U.woerter("Lösungshinweise", "X100"), []);
});

test("Semesterrang: Wintersemester nach dem Sommersemester desselben Jahres, ohne Jahr ans Ende", () => {
  assert.ok(U.semesterRang("WS 2019-20 Haupttermin") > U.semesterRang("SS 2019"));
  assert.ok(U.semesterRang("SS 2020") > U.semesterRang("WS 2019-20"));
  assert.equal(U.semesterRang("Probeklausur"), -1);
});

test("Abschnitte in fester Reihenfolge mit Namen in der Mehrzahl, Unbekanntes vor Sonstiges", () => {
  const G = U.gliedern([
    u("Sonstiges Formelsammlung", { art: "Sonstiges", titel: "Formelsammlung" }),
    u("Altklausur WS 2020-21", { art: "Altklausur", titel: "WS 2020-21" }),
    u("Handout Glossar", { art: "Handout", titel: "Glossar" }),
    u("Folien 01 Einführung", { art: "Folien", nummer: 1, titel: "Einführung" }),
    u("Übung 01 Blatt", { art: "Übung", nummer: 1, titel: "Blatt" }),
    u("Skript Gesamt", { art: "Skript", titel: "Gesamt" }),
  ], "X100");
  assert.deepEqual(namen(G), ["Folien", "Skripte", "Übungen", "Altklausuren", "Handout", "Sonstiges"]);
});

test("Lösungen stehen bei ihrer Aufgabe: gleiche Nummer, gleiche Titelwörter; Unklares bleibt unter Lösungen", () => {
  const G = U.gliedern([
    u("Altklausur WS 2018-19 Haupttermin", { art: "Altklausur", titel: "WS 2018-19 Haupttermin", seiten: 4 }),
    u("Altklausur WS 2018-19 Nachtermin", { art: "Altklausur", titel: "WS 2018-19 Nachtermin" }),
    u("Lösung WS 2018-19 Haupttermin", { art: "Lösung", titel: "WS 2018-19 Haupttermin", status: "gelesen" }),
    u("Altklausur Mathe WS 2022 A 2", { art: "Altklausur", titel: "Mathe WS 2022 A 2" }),
    u("Altklausur Mathe WS 2022 B 2", { art: "Altklausur", titel: "Mathe WS 2022 B 2" }),
    u("Lösung Mathe WS 2022 A", { art: "Lösung", titel: "Mathe WS 2022 A" }),
    u("Übung 01 Aufgabenblatt Vorkurs", { art: "Übung", nummer: 1, titel: "Aufgabenblatt Vorkurs" }),
    u("Lösung 01 Kurzlösung Vorkurs", { art: "Lösung", nummer: 1, titel: "Kurzlösung Vorkurs" }),
    u("Eigene Lösung 01", { art: "Eigene Lösung", nummer: 1, titel: "" }),
    u("Übung Aufgabenkatalog WS 2026-27", { art: "Übung", titel: "Aufgabenkatalog WS 2026-27" }),
    u("Lösung Kurzlösungen Aufgabenkatalog WS 2026-27", { art: "Lösung", titel: "Kurzlösungen Aufgabenkatalog WS 2026-27" }),
    u("Lösung Matrix a Day", { art: "Lösung", titel: "Matrix a Day" }),
    u("Lösung Kurzlösung", { art: "Lösung", titel: "Kurzlösung" }),
  ], "X100");
  assert.deepEqual(namen(G), ["Übungen", "Altklausuren", "Lösungen"]);
  const [ueb, alt, loe] = G;
  assert.equal(ueb.zeilen[0].titel, "Aufgabenblatt Vorkurs");
  assert.deepEqual(ueb.zeilen[0].loesungen.map((l) => l.name), ["Lösung", "Eigene"]);
  assert.deepEqual(ueb.zeilen[1].loesungen.map((l) => l.f.basename), ["X100 Lösung Kurzlösungen Aufgabenkatalog WS 2026-27"]);
  const bei = (t) => alt.zeilen.find((z) => z.titel === t).loesungen.map((l) => l.f.basename);
  assert.deepEqual(bei("WS 2018-19 Haupttermin"), ["X100 Lösung WS 2018-19 Haupttermin"]);
  assert.equal(alt.zeilen.find((z) => z.titel === "WS 2018-19 Haupttermin").loesungen[0].gelesen, true);
  assert.deepEqual(bei("WS 2018-19 Nachtermin"), []);
  assert.deepEqual(bei("Mathe WS 2022 A 2"), ["X100 Lösung Mathe WS 2022 A"]);
  assert.deepEqual(bei("Mathe WS 2022 B 2"), []);
  assert.deepEqual(titel(loe), ["Kurzlösung", "Matrix a Day"]);
  assert.equal(alt.mitLoesung, true);
  assert.equal(loe.mitLoesung, false);
});

test("Zwei gleich gute Aufgaben: die Lösung bleibt für sich", () => {
  const G = U.gliedern([
    u("Übung Blatt 3 Teil A", { art: "Übung", titel: "Blatt 3 Teil A" }),
    u("Übung Blatt 3 Teil B", { art: "Übung", titel: "Blatt 3 Teil B" }),
    u("Lösung Blatt 3", { art: "Lösung", titel: "Blatt 3" }),
  ], "X100");
  assert.deepEqual(namen(G), ["Übungen", "Lösungen"]);
});

test("Reihenfolge: Folien nach Nummer (ohne Nummer zuletzt), Altklausuren neueste zuerst, Haupt- vor Nachtermin", () => {
  const G = U.gliedern([
    u("Folien Road Map", { art: "Folien", titel: "Road Map" }),
    u("Folien 10 Ende", { art: "Folien", nummer: 10, titel: "Ende" }),
    u("Folien 02 Mitte", { art: "Folien", nummer: 2, titel: "Mitte" }),
    u("Folien 00 Start", { art: "Folien", nummer: 0, titel: "Start" }),
    u("Altklausur WS 2018-19 Nachtermin", { art: "Altklausur", titel: "WS 2018-19 Nachtermin" }),
    u("Altklausur WS 2023-24 Haupttermin", { art: "Altklausur", titel: "WS 2023-24 Haupttermin" }),
    u("Altklausur Probeklausur", { art: "Altklausur", titel: "Probeklausur" }),
    u("Altklausur WS 2018-19 Haupttermin", { art: "Altklausur", titel: "WS 2018-19 Haupttermin" }),
  ], "X100");
  assert.deepEqual(titel(G[0]), ["Start", "Mitte", "Ende", "Road Map"]);
  assert.equal(G[0].mitNr, true);
  assert.deepEqual(titel(G[1]), ["WS 2023-24 Haupttermin", "WS 2018-19 Haupttermin", "WS 2018-19 Nachtermin", "Probeklausur"]);
  assert.equal(G[1].mitNr, false);
});

test("Zeile: Titel ersatzweise aus dem Dateinamen, gelesen/bearbeitet markiert, Seiten und Datei", () => {
  const G = U.gliedern([
    u("Übung 01", { art: "Übung", nummer: 1, titel: "" }),
    u("Skript Kapitel 4", { art: "Skript", titel: "", status: "bearbeitet", seiten: 30 }),
    { f: { basename: "X100 Sonstiges Lehrvideos", path: "Unterlagen/X100 Beispiel/X100 Sonstiges Lehrvideos.md" }, fm: { typ: "unterlage", code: "X100", art: "Sonstiges", titel: "Lehrvideos" } },
  ], "X100");
  const [skr, ueb, so] = G;
  assert.deepEqual([skr.zeilen[0].titel, skr.zeilen[0].gelesen, skr.zeilen[0].seiten], ["Kapitel 4", true, 30]);
  assert.deepEqual([ueb.zeilen[0].titel, ueb.zeilen[0].nr, ueb.zeilen[0].gelesen], ["Übung", 1, false]);
  assert.equal(so.zeilen[0].datei, false);
  assert.equal(skr.zeilen[0].datei, true);
});

test("Tutorium: eigener Abschnitt nach den Übungen, Lösungen hängen nicht an Tutoriumsblättern", () => {
  const G = U.gliedern([
    u("Folien 01 Einführung", { art: "Folien", nummer: 1, titel: "Einführung" }),
    u("Tutorium 01 Aufgabenblatt", { art: "Tutorium", nummer: 1, titel: "Aufgabenblatt" }),
    u("Übung 01 Blatt", { art: "Übung", nummer: 1, titel: "Blatt" }),
    u("Lösung 01 Kurzlösung", { art: "Lösung", nummer: 1, titel: "Kurzlösung" }),
    u("Tutorium Vorlage", { art: "tutorium", titel: "Vorlage" }),
  ], "X100");
  assert.deepEqual(namen(G), ["Folien", "Übungen", "Tutorium"]);
  assert.deepEqual(titel(G[2]), ["Aufgabenblatt", "Vorlage"]);
  assert.deepEqual(G[1].zeilen[0].loesungen.map((l) => l.name), ["Lösung"], "die Lösung gehört zur Übung mit gleicher Nummer");
  assert.equal(U.artVon("TUTORIUM"), "Tutorium");
});
