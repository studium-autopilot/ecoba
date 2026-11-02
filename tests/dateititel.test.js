// Dateinamen aus Titeln (eba.dateiTitel): Aus dem Namen leiten Skripte die Pfade vorhandener Notizen ab. Ein Titel ohne
// unsichtbare Zeichen, Punkte am Anfang oder reservierten Gerätenamen ergibt darum genau den Namen wie bis 0.7.6 (Erwartungswerte
// einmal mit dieser Fassung erzeugt); sonst entstünden Doppel oder verwaiste Notizen. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));

test("Gewöhnliche Titel: Name genau wie bisher (Umlaute, Striche, Anführungszeichen, Schrägstrich, Doppelpunkt, Emojis, lang)", () => {
  const faelle = [
    ["2026-11-12 Klausur B110", "2026-11-12 Klausur B110"],
    ["Mo 10.00 B110 Vorlesung", "Mo 10.00 B110 Vorlesung"],
    ["UB-Kurs: Zotero", "UB-Kurs – Zotero"],
    ["WS 2026/27", "WS 2026-27"],
    ["Rückmeldung zum Sommersemester 2027", "Rückmeldung zum Sommersemester 2027"],
    ["Prüfungsanmeldung S110 – Frist", "Prüfungsanmeldung S110 – Frist"],
    ["Äußerst große Übung — Öko", "Äußerst große Übung — Öko"],
    ["„Zitat“ und 'einfach' und \"doppelt\"", "„Zitat“ und 'einfach' und -doppelt-"],
    ["Frage? Antwort!", "Frage- Antwort!"],
    ["a*b|c<d>e", "a-b-c-d-e"],
    ["Pfad\\mit\\Backslash", "Pfad-mit-Backslash"],
    ["Tag #1 und ^Block", "Tag -1 und -Block"],
    ["[[Link]] und [Text]", "--Link-- und -Text-"],
    ["Kaffee ☕ mit Freunden 🎉", "Kaffee mit Freunden"],
    ["Familie 👨\u200d👩\u200d👧 und Flagge 🇩🇪", "Familie und Flagge"],
    ["Taste 1\ufe0f⃣ und Herz ❤\ufe0f", "Taste 1 und Herz"],
    ["Ende mit Punkten...", "Ende mit Punkten"],
    ["Ende mit Leerzeichen   ", "Ende mit Leerzeichen"],
    ["  Mehrfach   Leerzeichen\tund Tab  ", "Mehrfach Leerzeichen und Tab"],
    ["Zeile eins\nZeile zwei", "Zeile eins Zeile zwei"],
    ["Dr. Müller: Sprechstunde", "Dr. Müller – Sprechstunde"],
    ["12:00 Uhr", "12-00 Uhr"],
    ["Zeit 10:15–11:45", "Zeit 10-15–11-45"],
    ["B110 Einführung in die Betriebswirtschaftslehre (Vorlesung, Übung und Tutorium im Wintersemester 2026/27 an der Universität Tübingen)",
      "B110 Einführung in die Betriebswirtschaftslehre (Vorlesung, Übung und Tutorium im Wintersemester 2026-27 an der Universität Tübingen)"],
    ["E-Mail an prüfungsamt@uni-tuebingen.de", "E-Mail an prüfungsamt@uni-tuebingen.de"],
    ["50 % Rabatt & mehr", "50 % Rabatt & mehr"],
    ["Café · Résumé · naïve", "Café · Résumé · naïve"],
    ["日本語のタイトル", "日本語のタイトル"],
    ["Ελληνικά und Кириллица", "Ελληνικά und Кириллица"],
    ["Console", "Console"],
    ["Konferenz", "Konferenz"],
    ["AUXILIUM", "AUXILIUM"],
    ["COM10", "COM10"],
    ["LPT0", "LPT0"],
    ["Null", "Null"],
    ["Aux-Kurs", "Aux-Kurs"],
    ["CON 2026", "CON 2026"],
    ["", ""],
    ["   ", ""],
    [".", ""],
    ["Version 1.0.2", "Version 1.0.2"],
    ["Mitte.Punkt", "Mitte.Punkt"],
    ["§ 12 Abs. 3", "§ 12 Abs. 3"],
    ["x > 0 und f(x) = [a, b]", "x - 0 und f(x) = -a, b-"],
    ["100 € Gebühr", "100 € Gebühr"],
    ["Grüße ✓ erledigt", "Grüße erledigt"],
    ["Ankündigung ⚠ wichtig", "Ankündigung wichtig"],
    [null, ""],
    [undefined, ""],
    [2026, "2026"],
  ];
  for (const [ein, aus] of faelle) assert.equal(EBA.dateiTitel(ein), aus, JSON.stringify(ein));
});

test("Unsichtbare Zeichen fallen weg: Steuerzeichen, Breite null, Richtungszeichen, weiches Trennzeichen", () => {
  assert.equal(EBA.dateiTitel("Klau\u0000sur\u0007 B110\u001b"), "Klausur B110");
  assert.equal(EBA.dateiTitel("Ver\u00adtrag"), "Vertrag");
  assert.equal(EBA.dateiTitel("Zero\u200bWidth\u200c und\u2060 \ufeffJoiner"), "ZeroWidth und Joiner");
  assert.equal(EBA.dateiTitel("Rechnung \u202egnunhceR.pdf"), "Rechnung gnunhceR.pdf", "Richtung umkehren geht nicht");
  assert.equal(EBA.dateiTitel("a\u2066b\u2067c\u2068d\u2069e\u200ef\u200fg\u061ch\u202ai\u202bj\u202ck\u202dl"), "abcdefghijkl");
  assert.equal(EBA.dateiTitel("Ende \u0085\u009f"), "Ende");
  assert.equal(EBA.dateiTitel("\u200b"), "");
  for (const t of ["Klausur\u200b B110", "\u202eKlausur B110", "Klausur B110\u0000"]) assert.equal(EBA.dateiTitel(t), "Klausur B110", JSON.stringify(t));
});

test("Keine Punkte am Anfang (versteckte Datei) und keine von Windows reservierten Gerätenamen", () => {
  assert.equal(EBA.dateiTitel(".obsidian"), "obsidian");
  assert.equal(EBA.dateiTitel("...Fortsetzung"), "Fortsetzung");
  assert.equal(EBA.dateiTitel(" . . versteckt"), "versteckt");
  assert.equal(EBA.dateiTitel("\u200b.versteckt"), "versteckt");
  for (const [ein, aus] of [["CON", "CON-"], ["prn", "prn-"], ["Aux", "Aux-"], ["NUL", "NUL-"], ["com1", "com1-"], ["COM9", "COM9-"],
    ["LPT1", "LPT1-"], ["lpt9", "lpt9-"], ["aux.pdf", "aux-.pdf"], ["CON.txt.md", "CON-.txt.md"], ["NUL .x", "NUL- .x"],
    ["Aux. Kurs", "Aux-. Kurs"], ["con...", "con-"], ["  nul  ", "nul-"], ["NUL\u200b", "NUL-"]]) {
    assert.equal(EBA.dateiTitel(ein), aus, JSON.stringify(ein));
  }
});
