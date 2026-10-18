// Leere Notizen (leer.js): Wann gilt eine Vorlesungs- oder Übungsblatt-Notiz als leer? Das Gerüst der Vorlage zählt nicht,
// eigener Text schon. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const { istLeer, hatAngaben } = laden("leer").ergebnis;

// wie notizen.js (Aktion „vorlesung“) sie anlegt, Cursor-Zeichen schon entfernt
const vorlesung = (mitschrift = "") => `---
typ: vorlesung
datum: 2026-10-19
code: "B110"
thema: ""
nachgearbeitet: false
---

# B110 · VL 01

\`\`\`eba-vorlesung
Kopf mit Modul, Termin, Folien und Status: erscheint, sobald das Plugin „Studium Autopilot“ geladen ist.
\`\`\`

## Mitschrift
- ${mitschrift}

## Prüfungsrelevant
-

## Offene Fragen
- [ ]

## Nacharbeit
- Kernaussagen:
`;

test("Frisch angelegte Vorlesungsnotiz ist leer (auch „-“ ohne Leerzeichen)", () => {
  assert.equal(istLeer(vorlesung()), true);
});

test("Eigener Text macht die Notiz nicht leer", () => {
  assert.equal(istLeer(vorlesung("Grenznutzen sinkt")), false);
  assert.equal(istLeer(vorlesung().replace("## Prüfungsrelevant\n-", "## Prüfungsrelevant\n- Formel für den Gewinn")), false);
  assert.equal(istLeer(vorlesung().replace("- [ ]", "- [ ] Warum ist der Grenzerlös kleiner als der Preis?")), false);
  assert.equal(istLeer(vorlesung().replace("## Nacharbeit", "-5 Grad im Hörsaal\n\n## Nacharbeit")), false);
});

test("Nur Beschriftungen, Callouts und Nummern zählen nicht", () => {
  assert.equal(istLeer("---\ntyp: übungsblatt\n---\n\n# Blatt 1\n\n1.\n2)\n- **Ansatz:**\n> [!tip] Hinweis\n> Text der Vorlage\n"), true);
});

test("Übungsblatt mit Abgabe, Aufgaben oder eigener Lösung bleibt, auch ohne Text", () => {
  assert.equal(hatAngaben({ typ: "übungsblatt", faellig: "2026-10-27", datei: "", eigene_loesung: "" }), true);
  assert.equal(hatAngaben({ typ: "übungsblatt", faellig: null, datei: "[[Blatt 3.pdf]]" }), true);
  assert.equal(hatAngaben({ typ: "übungsblatt", faellig: "", datei: "", eigene_loesung: "" }), false, "ohne Angaben: darf weg");
  assert.equal(hatAngaben({ typ: "vorlesung", datum: "2026-10-19" }), false, "Vorlesung: Datum allein hält sie nicht");
});
