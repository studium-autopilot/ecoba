// Einrichtung (einrichtung.js): Zustand aus System/Einstellungen.md, seit 0.4.8 mit sieben Bildschirmen (ein Bildschirm „Dein
// Uni-Login“ statt Alma und ILIAS). Schritte aus Einrichtungen bis 0.4.7 (ohne einrichtung_fassung) werden umgerechnet; das
// Schloss für Alma und ILIAS folgt dem Übersprungenen (uni, aus alten Einrichtungen alma und ilias). Läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

// Modal-Ersatz: öffnet nichts (onOpen zeichnet nur in Obsidian), damit oeffnen() den Zustand des Fensters zeigt
class Modal { open() { this.offen = true; } close() { this.offen = false; } }
const E = (fm) => laden("einrichtung", { frontmatter: { "System/Einstellungen.md": fm }, kontext: { obsidian: { Modal } } }).ctx.einrichtung;

test("Schritte aus 0.4.7 und früher (ohne Fassung): 5 Alma und 6 ILIAS → 5 Uni-Login, 7 Darstellung → 6, 8 Fertig → 7", () => {
  const schritt = (s, fassung) => E(Object.assign({ einrichtung: "laeuft", einrichtung_schritt: s }, fassung ? { einrichtung_fassung: fassung } : {})).zustand().schritt;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => schritt(s)), [1, 2, 3, 4, 5, 5, 6, 7, 0]);
  assert.deepEqual([5, 6, 7, 8].map((s) => schritt(s, 2)), [5, 6, 7, 0], "mit Fassung 2 gilt die Zahl, wie sie ist");
  assert.equal(E({}).FASSUNG, 2);
});

test("Schloss: Uni-Login übersprungen sperrt Alma und ILIAS; alte Einträge alma und ilias gelten weiter", () => {
  const offen = (fm) => { const e = E(Object.assign({ einrichtung: "fertig", einrichtung_schritt: 7, einrichtung_fassung: 2 }, fm)); return [e.almaOffen(), e.iliasOffen()]; };
  assert.deepEqual(offen({}), [false, false]);
  assert.deepEqual(offen({ einrichtung_uebersprungen: ["uni"] }), [true, true]);
  assert.deepEqual(offen({ einrichtung_uebersprungen: ["alma"] }), [true, false]);
  assert.deepEqual(offen({ einrichtung_uebersprungen: ["ilias"] }), [false, true]);
  assert.deepEqual(offen({ einrichtung: "laeuft" }), [true, true], "nicht fertig");
});

test("Schloss für ILIAS nach einer Einrichtung aus 0.3.x (fertig bei 6 ohne Fassung), nicht nach einem erneuten Start", () => {
  const ilias = (fm) => E(Object.assign({ einrichtung: "fertig" }, fm)).iliasOffen();
  assert.equal(ilias({ einrichtung_schritt: 6 }), true, "0.3.x: Fertig war 6, ILIAS kam nie vor");
  assert.equal(ilias({ einrichtung_schritt: 7 }), false, "0.4.0–0.4.4");
  assert.equal(ilias({ einrichtung_schritt: 8 }), false, "0.4.5–0.4.7");
  assert.equal(ilias({ einrichtung_schritt: 6, einrichtung_fassung: 2 }), false, "seit 0.4.8 auf Darstellung beendet");
});

test("Erneuter Start eines Tresors aus 0.3.x: der Uni-Login gilt als übersprungen, das Schloss bleibt nach dem Speichern", () => {
  assert.deepEqual(E({ einrichtung: "fertig", einrichtung_schritt: 6 }).oeffnen({ ab: 2 }).uebersprungen, ["uni"]);
  assert.deepEqual(E({ einrichtung: "fertig", einrichtung_schritt: 8 }).oeffnen({ ab: 2 }).uebersprungen, [], "0.4.5–0.4.7: ILIAS kam vor");
  assert.deepEqual(E({ einrichtung: "fertig", einrichtung_schritt: 6, einrichtung_fassung: 2 }).oeffnen({ ab: 2 }).uebersprungen, []);
});
