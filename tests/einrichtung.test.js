// Einrichtung (einrichtung.js): Zustand aus System/Einstellungen.md, seit 25.10.2026 mit acht Bildschirmen (Angebote der Uni
// vor der Darstellung), von 0.4.8 an sieben (ein Bildschirm „Dein Uni-Login“ statt Alma und ILIAS). Schritte älterer Zählungen
// (einrichtung_fassung 2 oder ohne) werden umgerechnet; das Schloss für Alma und ILIAS folgt dem Übersprungenen (uni, aus alten
// Einrichtungen alma und ilias). Läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

// Modal-Ersatz: öffnet nichts (onOpen zeichnet nur in Obsidian), damit oeffnen() den Zustand des Fensters zeigt
class Modal { open() { this.offen = true; } close() { this.offen = false; } }
const E = (fm) => laden("einrichtung", { frontmatter: { "System/Einstellungen.md": fm }, kontext: { obsidian: { Modal } } }).ctx.einrichtung;

test("Schritte älterer Zählungen: Fertig bleibt Fertig, wer bei der Darstellung stand, kommt zu den Angeboten", () => {
  const schritt = (s, fassung) => E(Object.assign({ einrichtung: "laeuft", einrichtung_schritt: s }, fassung ? { einrichtung_fassung: fassung } : {})).zustand().schritt;
  // bis 0.4.7 (ohne Fassung): 5 Alma und 6 ILIAS → 5 Uni-Login, 7 Darstellung → 6 Angebote, 8 Fertig → 8
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => schritt(s)), [0, 1, 2, 3, 4, 5, 5, 6, 8, 0]);
  // Fassung 2 (sieben Bildschirme): 6 Darstellung → 6 Angebote, 7 Fertig → 8
  assert.deepEqual([1, 5, 6, 7, 8].map((s) => schritt(s, 2)), [1, 5, 6, 8, 0]);
  assert.deepEqual([1, 5, 6, 7, 8, 9].map((s) => schritt(s, 3)), [1, 5, 6, 7, 8, 0], "mit Fassung 3 gilt die Zahl, wie sie ist");
  assert.equal(E({}).FASSUNG, 3);
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
  assert.equal(ilias({ einrichtung_schritt: 3, einrichtung_fassung: 2 }), false, "Fassung 2 nach einem erneuten Start");
  assert.equal(ilias({ einrichtung_schritt: 6, einrichtung_fassung: 3 }), false);
});

test("Erneuter Start eines Tresors aus 0.3.x: der Uni-Login gilt als übersprungen, das Schloss bleibt nach dem Speichern", () => {
  assert.deepEqual(E({ einrichtung: "fertig", einrichtung_schritt: 6 }).oeffnen({ ab: 2 }).uebersprungen, ["uni"]);
  assert.deepEqual(E({ einrichtung: "fertig", einrichtung_schritt: 8 }).oeffnen({ ab: 2 }).uebersprungen, [], "0.4.5–0.4.7: ILIAS kam vor");
  assert.deepEqual(E({ einrichtung: "fertig", einrichtung_schritt: 6, einrichtung_fassung: 2 }).oeffnen({ ab: 2 }).uebersprungen, []);
  assert.deepEqual(E({ einrichtung: "fertig", einrichtung_schritt: 4, einrichtung_fassung: 3 }).oeffnen({ ab: 2 }).uebersprungen, []);
});

test("Eine laufende Einrichtung geht an ihrem Bildschirm weiter, auch aus einer älteren Zählung", () => {
  const ab = (fm) => E(Object.assign({ einrichtung: "laeuft" }, fm)).oeffnen().schritt;
  assert.equal(ab({ einrichtung_schritt: 6, einrichtung_fassung: 3 }), 6, "Angebote");
  assert.equal(ab({ einrichtung_schritt: 7, einrichtung_fassung: 3 }), 7, "Darstellung");
  assert.equal(ab({ einrichtung_schritt: 6, einrichtung_fassung: 2 }), 6, "Fassung 2 bei der Darstellung: erst die Angebote");
  assert.equal(ab({ einrichtung_schritt: 0 }), 1);
});
