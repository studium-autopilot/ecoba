// FSRS-6 und Lernschritte der Karteikarten (fsrs.js). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden");

const F = laden("fsrs").ergebnis;
const { ZUSTAND } = F;
const MIN = 60e3, TAG = 864e5;
// Tagnummer ohne Zeitzone: Tag beginnt um 0 Uhr UTC (die echte Rechnung mit Tagesbeginn 4 Uhr steht in karten.js)
const tag = (ms) => Math.floor(ms / TAG);
const tagBeginn = (n) => n * TAG;
const planer = (o) => F.planer(Object.assign({ tag, tagBeginn }, o || {}));
const T0 = Date.UTC(2026, 9, 17, 9, 0, 0);
const nah = (a, b, eps, text) => assert.ok(Math.abs(a - b) <= eps, `${text}: ${a} statt ${b}`);

test("FSRS: Vergessenskurve und Intervallfaktor", () => {
  nah(F.abrufbarkeit(F.W, 10, 10), 0.9, 1e-6, "nach s Tagen 90 %");
  nah(F.abrufbarkeit(F.W, 0, 5), 1, 1e-9, "sofort 100 %");
  assert.ok(F.abrufbarkeit(F.W, 30, 10) < F.abrufbarkeit(F.W, 20, 10));
  nah(F.intervallFaktor(F.W, 0.9), 1, 1e-6, "Ziel 90 % → Intervall = Stabilität");
  assert.ok(F.intervallFaktor(F.W, 0.8) > 1 && F.intervallFaktor(F.W, 0.95) < 1);
});

test("FSRS: Startwerte und Wiederholung (von Hand nachgerechnet)", () => {
  const gut = F.gedaechtnis(F.W, null, 0, 3);
  nah(gut.s, 2.3065, 1e-9, "Startstabilität Gut = w2");
  nah(gut.d, 6.4133 - Math.exp(2 * 0.8334) + 1, 1e-6, "Startschwierigkeit Gut");
  assert.equal(F.gedaechtnis(F.W, null, 0, 1).s, 0.212);
  // d = 5, s = 10, nach 10 Tagen (R = 0,9) „Gut“: s' = 10 · (1 + e^1,8722 · 6 · 10^-0,1666 · (e^0,0796 − 1)) ≈ 32,03
  const w = F.gedaechtnis(F.W, { d: 5, s: 10 }, 10, 3);
  nah(w.s, 32.03, 0.05, "Stabilität nach Gut");
  nah(w.d, 5 * 0.999 + 0.001 * (6.4133 - Math.exp(3 * 0.8334) + 1), 1e-6, "Schwierigkeit nach Gut (nur Rückkehr zum Mittel)");
  const n = F.gedaechtnis(F.W, { d: 5, s: 10 }, 10, 1);
  assert.ok(n.s < 10 && n.s > 0, "Vergessen senkt die Stabilität");
  assert.ok(n.d > 5, "Vergessen macht die Karte schwerer");
  // Am selben Tag: kurzfristige Formel, bei Gut nie kleiner
  assert.ok(F.gedaechtnis(F.W, { d: 5, s: 2 }, 0, 3).s >= 2);
  assert.ok(F.gedaechtnis(F.W, { d: 5, s: 2 }, 0, 1).s < 2);
});

test("Lernschritte wie in Anki: 1 Min., 5,5 Min., 10 Min., dann Wiederholung", () => {
  const p = planer({ streuung: false });
  const k = p.leer();
  const v = p.vorschau(k, T0, "k1");
  assert.equal(v[1].zustand, ZUSTAND.LERNEN); assert.equal(v[1].faellig - T0, 1 * MIN);
  assert.equal(v[2].faellig - T0, 5.5 * MIN);
  assert.equal(v[3].zustand, ZUSTAND.LERNEN); assert.equal(v[3].schritt, 1); assert.equal(v[3].faellig - T0, 10 * MIN);
  assert.equal(v[4].zustand, ZUSTAND.WIEDERHOLEN);
  assert.equal(v[4].intervall, 8, "Einfach: Startstabilität 8,3 Tage");
  // Gut im letzten Schritt am selben Tag: Abschluss mit round(s) = 2 Tagen
  const k2 = p.bewerten(k, 3, T0, "k1");
  const k3 = p.bewerten(k2, 3, T0 + 10 * MIN, "k1");
  assert.equal(k3.zustand, ZUSTAND.WIEDERHOLEN);
  assert.equal(k3.intervall, 2);
  assert.equal(k3.tagFaellig, tag(T0) + 2);
  assert.equal(k3.wdh, 2);
  // Schwer im zweiten Schritt wiederholt den Schritt
  assert.equal(p.vorschau(k2, T0 + 10 * MIN, "k1")[2].faellig - (T0 + 10 * MIN), 10 * MIN);
  // Nochmal geht zurück auf Schritt 1
  assert.equal(p.vorschau(k2, T0 + 10 * MIN, "k1")[1].schritt, 0);
});

test("Nur ein Lernschritt: Schwer = 1,5-fach, Gut schließt ab; ohne Schritte direkt Wiederholung", () => {
  const p = planer({ streuung: false, schritte: [10] });
  const v = p.vorschau(p.leer(), T0, "k");
  assert.equal(v[2].faellig - T0, 15 * MIN);
  assert.equal(v[3].zustand, ZUSTAND.WIEDERHOLEN);
  const ohne = planer({ streuung: false, schritte: [] }).vorschau(p.leer(), T0, "k");
  for (let b = 1; b <= 4; b++) assert.equal(ohne[b].zustand, ZUSTAND.WIEDERHOLEN);
  assert.ok(ohne[2].intervall <= ohne[3].intervall && ohne[3].intervall < ohne[4].intervall);
});

test("Wiederholung: Schwer < Gut < Einfach, Nochmal → Neu-Lernen mit Fehler", () => {
  const p = planer({ streuung: true });
  const k = Object.assign(p.leer(), { zustand: ZUSTAND.WIEDERHOLEN, s: 12, d: 6, letzte: T0 - 12 * TAG, intervall: 12, tagFaellig: tag(T0), wdh: 5 });
  const v = p.vorschau(k, T0, "kx");
  assert.ok(v[2].intervall < v[3].intervall && v[3].intervall < v[4].intervall, `${v[2].intervall} ${v[3].intervall} ${v[4].intervall}`);
  assert.ok(v[3].intervall > 12, "Gut nach pünktlicher Wiederholung verlängert");
  assert.equal(v[1].zustand, ZUSTAND.NEU_LERNEN);
  assert.equal(v[1].fehler, 1);
  assert.equal(v[1].faellig - T0, 10 * MIN);
  // Neu-Lernen: Gut schließt ab, Intervall aus der gesunkenen Stabilität
  const r = p.bewerten(v[1], 3, T0 + 10 * MIN, "kx");
  assert.equal(r.zustand, ZUSTAND.WIEDERHOLEN);
  assert.ok(r.intervall >= 1 && r.intervall < 12);
});

test("Reproduzierbar: gleiche Geschichte, gleiches Ergebnis; Streuung im Rahmen", () => {
  const p = planer();
  const k = Object.assign(p.leer(), { zustand: ZUSTAND.WIEDERHOLEN, s: 40, d: 5, letzte: T0 - 40 * TAG, wdh: 7 });
  assert.deepEqual(p.bewerten(k, 3, T0, "abc"), p.bewerten(k, 3, T0, "abc"));
  const ivs = new Set();
  for (let i = 0; i < 200; i++) ivs.add(p.bewerten(k, 3, T0, "karte" + i).intervall);
  assert.ok(ivs.size > 3, "Streuung verteilt Karten auf mehrere Tage");
  const ohne = planer({ streuung: false }).bewerten(k, 3, T0, "abc").intervall;
  for (const iv of ivs) assert.ok(Math.abs(iv - ohne) <= Math.ceil(1 + 0.15 * 4.5 + 0.1 * 13 + 0.05 * (ohne - 20)) + 1, `${iv} weit weg von ${ohne}`);
  assert.equal(F.streuen(2, 1, 100, 0.99, true), 2, "unter 2,5 Tagen keine Streuung");
  for (const f of [0, 0.5, 0.999]) assert.ok(F.streuen(500, 1, 100, f, true) <= 100, "nie über das Höchstintervall");
  assert.equal(F.streuen(500, 1, 100, 0.5, false), 100);
});

test("Gewünschte Behaltensquote: höher → kürzere Intervalle", () => {
  const k = { zustand: ZUSTAND.WIEDERHOLEN, schritt: 0, s: 30, d: 5, faellig: 0, tagFaellig: 0, letzte: T0 - 30 * TAG, intervall: 30, wdh: 4, fehler: 0 };
  const iv = (ziel) => planer({ ziel, streuung: false }).bewerten(k, 3, T0, "k").intervall;
  assert.ok(iv(0.95) < iv(0.9) && iv(0.9) < iv(0.8));
});

test("Lernschritte lesen", () => {
  assert.deepEqual(F.schritteLesen("1m 10m"), [1, 10]);
  assert.deepEqual(F.schritteLesen("10"), [10]);
  assert.deepEqual(F.schritteLesen("1h, 1d"), [60, 1440]);
  assert.deepEqual(F.schritteLesen("30s 2,5m"), [0.5, 2.5]);
  assert.deepEqual(F.schritteLesen("x -3 0m"), []);
  assert.deepEqual(F.schritteLesen(""), []);
});
