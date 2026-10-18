// Neue Notizen (notizen.js mit den Fragen aus eba.js): Esc in irgendeiner Frage bricht das Anlegen ganz ab, es entsteht
// nichts; eine leere Eingabe nimmt den Vorschlag. Antworten wie im Fenster: Text, "" (leer bestätigt) oder null (Esc).
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const MODUL = { f: { basename: "B110 Einführung in die BWL", path: "Module/1 Grundstudium/B110 Einführung in die BWL.md" }, fm: { code: "B110", titel: "Einführung in die BWL" } };

// Ein Aufruf einer Aktion: antworten der Reihe nach für Eingabe und Auswahl; Modul gewählt (erste Frage). → { angelegt, abgebrochen }
async function anlegen(aktion, antworten) {
  const rest = antworten.slice();
  const system = { prompt: async () => rest.shift(), suggester: async () => rest.shift() };
  const E = laden("eba", { kontext: { system } }).ergebnis;
  const angelegt = [];
  let abgebrochen = 0;
  const eba = Object.assign({}, E, {
    modulWaehlen: async () => MODUL,
    abbrechen: () => { abgebrochen++; },
    ablegen: async (ordner, name, inhalt) => { angelegt.push({ ordner, name, inhalt }); return { path: ordner + "/" + name + ".md" }; },
  });
  const N = laden("notizen", { kontext: { system, user: { eba: () => eba } } }).ergebnis;
  await N.aktionen[aktion].ausfuehren({ parameter: {}, datei: null });
  assert.deepEqual(rest, [], "alle Antworten verbraucht, keine Frage zu viel");
  return { angelegt, abgebrochen };
}

test("Esc in einer späteren Frage: nichts entsteht, auch keine Vorgabe", async () => {
  const faelle = [
    ["uebungsblatt", [null]],                                   // Nummer
    ["uebungsblatt", ["3", null]],                              // Abgabe
    ["termin", ["Lerngruppe", null]],                           // Wann
    ["lehrveranstaltung", [null]],                              // Art
    ["lehrveranstaltung", ["Tutorium", null]],                  // Wochentag
    ["lehrveranstaltung", ["Tutorium", 1, null]],               // Beginn
    ["sq-kurs", ["Spanisch A1", null]],                         // Anbieter
    ["sq-kurs", ["Spanisch A1", "Fremdsprachenzentrum", null]], // ECTS
    ["sq-kurs", ["Spanisch A1", "Fremdsprachenzentrum", "3", null]], // Stand
    ["modul", ["E385", null]],                                  // Titel
    ["modul", ["E385", "Spieltheorie", null]],                  // ECTS
    ["modul", ["E385", "Spieltheorie", "6", null]],             // Bereich
    ["modul", ["E385", "Spieltheorie", "6", "Schwerpunkt", null]], // Schwerpunktbereich
  ];
  for (const [aktion, antworten] of faelle) {
    const r = await anlegen(aktion, antworten);
    assert.deepEqual([r.angelegt.length, r.abgebrochen], [0, 1], aktion + " " + JSON.stringify(antworten));
  }
});

test("Leere Eingabe nimmt den Vorschlag (Nummer, Abgabe, Beginn)", async () => {
  const b = await anlegen("uebungsblatt", ["", ""]);
  assert.equal(b.abgebrochen, 0);
  assert.equal(b.angelegt[0].name, "B110 Blatt 01");
  assert.match(b.angelegt[0].inhalt, /^faellig: $/m, "Abgabe leer gelassen: ohne Datum");
  const t = await anlegen("termin", ["Lerngruppe", ""]);
  assert.equal(t.angelegt[0].name, "2026-10-15 Lerngruppe", "ohne Datum: heute");
  const l = await anlegen("lehrveranstaltung", ["Tutorium", 2, ""]);
  assert.equal(l.abgebrochen, 0);
  assert.match(l.angelegt[0].inhalt, /^beginn: "?10:15"?$/m);
});
