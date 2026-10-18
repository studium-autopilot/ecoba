// Übungsblatt-Notiz (vorlesung.js, Kopf-Karte eba-uebungsblatt): Abschnitte, Status in drei Stufen und Abgabe relativ zu heute;
// dazu, dass ein frisch angelegtes Blatt als leer gilt (leer.js). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const { abschnitte, statusVon, naechsterStatus, abgabe } = laden("vorlesung").ergebnis;
const { istLeer } = laden("leer").ergebnis;

// wie notizen.js (Aktion „uebungsblatt“) es anlegt, Cursor-Zeichen schon entfernt
const blatt = (aufgabe = "") => `---
typ: übungsblatt
code: "S100"
modul: "[[S100 Mathematische Methoden der Wirtschaftswissenschaft]]"
nummer: 3
faellig: 2026-10-27
status: offen
datei: ""
eigene_loesung: ""
uebersicht: "[[Unterlagen]]"
tags:
  - übungsblatt
cssclasses:
  - eba-s-notizen
  - eba-s-uebungsblatt
---

# S100 · Blatt 03

\`\`\`eba-uebungsblatt
Kopf mit Modul, Abgabe, Status und Unterlagen: erscheint, sobald das Plugin „Studium Autopilot“ geladen ist.
\`\`\`

## Aufgabe 1
- ${aufgabe}

## Aufgabe 2
-

## Knackpunkte
-

## Fürs Tutorium
- [ ]
`;

const zeile = (text, anfang) => text.split("\n").findIndex((z) => z.startsWith(anfang));

test("Frisch angelegtes Übungsblatt ist leer, eigener Text nicht", () => {
  assert.equal(istLeer(blatt()), true);
  assert.equal(istLeer(blatt("Ableitung mit der Kettenregel")), false);
  assert.equal(istLeer(blatt().replace("## Knackpunkte\n-", "## Knackpunkte\n- Erst substituieren")), false);
});

test("Abschnitte des Übungsblatts: Aufgaben, Knackpunkte als Kasten, Tutorium als Fragen", () => {
  const t = blatt().replace("## Knackpunkte\n-", "## Knackpunkte\n- Erst substituieren\n- Dann ableiten");
  const k = abschnitte(t.split("\n"));
  assert.equal(k[zeile(t, "## Aufgabe 1")], "eba-vorl-h eba-vorl-h-aufgabe");
  assert.equal(k[zeile(t, "## Aufgabe 2")], "eba-vorl-h eba-vorl-h-aufgabe");
  assert.equal(k[zeile(t, "## Knackpunkte")], "eba-vorl-h eba-vorl-h-pruef");
  assert.equal(k[zeile(t, "- Erst")], "eba-vorl-z eba-vorl-z-pruef eba-vorl-z-anfang");
  assert.equal(k[zeile(t, "- Dann")], "eba-vorl-z eba-vorl-z-pruef eba-vorl-z-ende");
  assert.equal(k[zeile(t, "## Fürs Tutorium")], "eba-vorl-h eba-vorl-h-fragen");
  // Der Kopf-Codeblock und der Titel bekommen nichts
  assert.equal(k[zeile(t, "# S100")], undefined);
  assert.equal(k[zeile(t, "Kopf mit")], undefined);
});

test("Vorlesungsnotiz behält ihre Abschnitte; der Typ kommt aus dem Frontmatter", () => {
  const v = "---\ntyp: vorlesung\n---\n\n# B110 · VL 01\n\n## Mitschrift\n- a\n\n## Prüfungsrelevant\n- b\n\n## Aufgabe 1\n- c\n";
  const k = abschnitte(v.split("\n"));
  assert.equal(k[zeile(v, "## Mitschrift")], "eba-vorl-h eba-vorl-h-mitschrift");
  assert.equal(k[zeile(v, "## Prüfungsrelevant")], "eba-vorl-h eba-vorl-h-pruef");
  assert.equal(k[zeile(v, "## Aufgabe 1")], "eba-vorl-h eba-vorl-h-anders");
  // „Prüfungsrelevant“ darf auch im Übungsblatt stehen
  const b = blatt().replace("## Knackpunkte", "## Prüfungsrelevant");
  assert.equal(abschnitte(b.split("\n"))[zeile(b, "## Prüfungsrelevant")], "eba-vorl-h eba-vorl-h-pruef");
});

test("Status: drei Stufen im Kreis, Unbekanntes gilt als offen", () => {
  assert.equal(statusVon("Abgegeben "), "abgegeben");
  assert.equal(statusVon(""), "offen");
  assert.equal(statusVon(undefined), "offen");
  assert.equal(statusVon("in Arbeit"), "offen");
  assert.equal(naechsterStatus("offen"), "abgegeben");
  assert.equal(naechsterStatus("abgegeben"), "korrigiert");
  assert.equal(naechsterStatus("korrigiert"), "offen");
  assert.equal(naechsterStatus(null), "abgegeben");
});

test("Abgabe: Kennzeichen und Restzeit nur, solange das Blatt offen ist", () => {
  const heute = new Date(2026, 9, 20);
  const tag = (n) => new Date(2026, 9, 20 + n);
  assert.deepEqual(abgabe(tag(0), heute, "offen"), { text: "Abgabe Dienstag, 20.10.2026", marke: "heute", rest: "" });
  assert.deepEqual(abgabe(tag(1), heute, "offen"), { text: "Abgabe Mittwoch, 21.10.2026", marke: "morgen", rest: "" });
  assert.equal(abgabe(tag(7), heute, "offen").rest, "noch 7 Tage");
  assert.deepEqual(abgabe(tag(-1), heute, "offen"), { text: "Abgabe Montag, 19.10.2026", marke: "überfällig", rest: "seit gestern" });
  assert.equal(abgabe(tag(-3), heute, "").rest, "seit 3 Tagen");
  assert.deepEqual(abgabe(tag(-3), heute, "abgegeben"), { text: "Abgabe Samstag, 17.10.2026", marke: "", rest: "" });
  assert.deepEqual(abgabe(null, heute, "offen"), { text: "Ohne Abgabedatum", marke: "", rest: "" });
  // Zeitumstellung (25.10.2026) verschiebt die Tage nicht
  assert.equal(abgabe(new Date(2026, 9, 27), new Date(2026, 9, 24), "offen").rest, "noch 3 Tage");
});
