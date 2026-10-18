// Quellen-Vertrag (quellen.js): Status, Zeitplan, Besitz, Lebenslauf erzeugter Notizen, Meldekanal „Bitte prüfen“.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const Q = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "quellen.js"));
const MIN = 60e3;

test("Status: gemeinsame Form, Fehler bleiben bis zum nächsten Erfolg", () => {
  assert.deepEqual(Q.statusForm({ zustand: "an", warnungen: "Eine Datei fehlt.", fehlerZeit: "2026-10-18T08:00:00Z", eigen: 1 }),
    { zustand: "an", geprueft: "", fehler: "", fehlerZeit: "", warnungen: ["Eine Datei fehlt."], eigen: 1 });
  let s = Q.nachLauf(null, { ok: true, warnungen: ["W"] }, "2026-10-18T08:00:00Z");
  assert.deepEqual([s.geprueft, s.fehler, s.warnungen, s.fehlerSerie], ["2026-10-18T08:00:00Z", "", ["W"], 0]);
  s = Q.nachLauf(s, { ok: false, fehler: "Alma antwortet nicht." }, "2026-10-18T09:00:00Z");
  assert.deepEqual([s.geprueft, s.fehler, s.fehlerZeit, s.fehlerSerie, s.versucht], ["2026-10-18T08:00:00Z", "Alma antwortet nicht.", "2026-10-18T09:00:00Z", 1, "2026-10-18T09:00:00Z"]);
  s = Q.nachLauf(s, { ok: null }, "2026-10-18T09:30:00Z");
  assert.deepEqual([s.fehler, s.fehlerSerie, s.versucht], ["Alma antwortet nicht.", 1, "2026-10-18T09:30:00Z"], "nichts zu tun ändert den Fehler nicht");
  s = Q.nachLauf(s, { ok: false }, "2026-10-18T10:00:00Z");
  assert.equal(s.fehlerSerie, 2);
  s = Q.nachLauf(s, { ok: true }, "2026-10-18T11:00:00Z");
  assert.deepEqual([s.fehler, s.fehlerZeit, s.fehlerSerie, s.warnungen], ["", "", 0, []]);
});

test("Zeitwörter: eine Regel für alle Zeilen", () => {
  const j = Date.parse("2026-10-18T12:00:00Z");
  assert.equal(Q.vorText("2026-10-18T11:59:40Z", j), "gerade eben");
  assert.equal(Q.vorText("2026-10-18T11:55:00Z", j), "vor 5 Min.");
  assert.equal(Q.vorText("2026-10-18T09:00:00Z", j), "vor 3 Std.");
  assert.equal(Q.vorText("2026-10-15T12:00:00Z", j), "vor 3 Tagen");
  assert.equal(Q.vorText("", j), "");
});

test("Zeitplan: Takt, Backoff nach Fehlern (nie länger als der Takt), zurück in der App", () => {
  const p = Q.zeitplan({ takt: 60 * MIN, zurueck: 30 * MIN, backoff: [5 * MIN, 15 * MIN, 90 * MIN] });
  assert.deepEqual([p.naechster(0), p.naechster(1), p.naechster(2), p.naechster(3), p.naechster(9)], [60 * MIN, 5 * MIN, 15 * MIN, 60 * MIN, 60 * MIN]);
  assert.equal(Q.zeitplan({ takt: 15 * MIN }).naechster(4), 15 * MIN, "ohne backoff wieder im Takt");
  assert.equal(p.zurueckFaellig(0, 1e12), false, "vor dem ersten Lauf nichts nachholen");
  assert.equal(p.zurueckFaellig(1e12, 1e12 + 31 * MIN), true);
  assert.equal(p.zurueckFaellig(1e12, 1e12 + 29 * MIN), false);
  assert.deepEqual([Q.ergebnisOk(true), Q.ergebnisOk({ ok: false }), Q.ergebnisOk(null), Q.ergebnisOk(undefined)], [true, false, null, null]);
});

test("planen: Zeitgeber über die Helfer des Skripts, Backoff, kein zweiter Lauf zugleich, Abmelden", async () => {
  const timer = [], dom = {}, aufr = [];
  let id = 0;
  const ctx = {
    zeit: (fn, ms) => { const t = { id: ++id, fn, ms }; timer.push(t); return t.id; },
    stopp: (x) => { const i = timer.findIndex((t) => t.id === x); if (i >= 0) timer.splice(i, 1); },
    dom: (el, typ, fn) => { dom[typ] = fn; }, an: () => ({}), aufraeumen: (fn) => aufr.push(fn),
  };
  const dok = { visibilityState: "visible" };
  const ergebnisse = [false, false, true];
  let laeufe = 0, warten = null;
  const z = Q.planen(ctx, { takt: 60 * MIN, zurueck: 30 * MIN, backoff: [5 * MIN, 15 * MIN], start: [20e3, 0], dokument: dok, app: { metadataCache: { resolved: true } },
    lauf: async () => { laeufe++; if (warten) await warten; return ergebnisse.shift(); } });
  assert.deepEqual(timer.map((t) => t.ms), [20e3], "erster Lauf nach dem Einlesen");
  const t1 = timer.shift(); t1.fn(); await new Promise((r) => setImmediate(r));
  assert.deepEqual(timer.map((t) => t.ms), [5 * MIN], "1. Fehler → 5 Min.");
  timer.shift().fn(); await new Promise((r) => setImmediate(r));
  assert.deepEqual(timer.map((t) => t.ms), [15 * MIN], "2. Fehler → 15 Min.");
  timer.shift().fn(); await new Promise((r) => setImmediate(r));
  assert.deepEqual(timer.map((t) => t.ms), [60 * MIN], "Erfolg → Takt");
  assert.equal(z.stand().fehlerSerie, 0);
  // läuft gerade: ein zweiter Aufruf zählt nicht
  let los;
  warten = new Promise((r) => { los = r; });
  const a = z.jetzt("knopf"), b = await z.jetzt("knopf");
  assert.equal(b, null);
  los(); await a;
  assert.equal(laeufe, 4);
  // lauf setzt den nächsten Lauf selbst (Ruhezeit, nächster Stapel)
  ergebnisse.push({ ok: true, naechster: 60e3 });
  timer.length = 0;
  await z.jetzt("knopf");
  assert.deepEqual(timer.map((t) => t.ms), [60e3]);
  // zurück in der App erst nach mehr als „zurueck“ seit dem letzten Versuch
  timer.length = 0;
  dom.visibilitychange();
  assert.equal(timer.length, 0);
  // Abmelden (Hot-Reload): keine neuen Zeitgeber mehr
  for (const f of aufr) f();
  z.spaeter(1000);
  assert.equal(timer.length, 0);
});

test("Besitz: herkunft + Id-Feld, ältere Namen bleiben gültig", () => {
  assert.deepEqual(Q.besitz({ herkunft: "zentral", zentral_id: "x-1" }), { quelle: "zentral", id: "x-1" });
  assert.deepEqual(Q.besitz({ herkunft: "alma", alma_schluessel: "WS|B110|1|10:00|12:00" }), { quelle: "alma", id: "WS|B110|1|10:00|12:00" });
  assert.deepEqual(Q.besitz({ herkunft: "ilias-gruppe", ilias_gruppe: "123", gruppe_id: "g" }), { quelle: "ilias-gruppe", id: "123" });
  assert.deepEqual(Q.besitz({ herkunft: "gruppe-gewaehlt", gruppe_id: "g" }), { quelle: "gruppe-gewaehlt", id: "g" });
  assert.deepEqual(Q.besitz({ herkunft: "claude", claude_id: "c" }), { quelle: "claude", id: "c" });
  assert.deepEqual(Q.besitz({ abgleich_id: "a" }), { quelle: "abgleich", id: "a" });
  assert.deepEqual(Q.besitz({ volltext_von: "plugin", quelle: "Unterlagen/x.pdf" }), { quelle: "volltext", id: "Unterlagen/x.pdf" });
  assert.equal(Q.besitz({ typ: "lehrveranstaltung", quelle: "alma" }), null, "quelle allein ist keine Besitzmarke");
  assert.equal(Q.idFeld("ilias-kalender"), "ilias_kalender_id");
  assert.equal(Q.idFeld("neue-quelle"), "neue_quelle_id");
  assert.deepEqual(Q.marke("alma", "k"), { herkunft: "alma", alma_schluessel: "k" });
});

test("Lebenslauf: eigener Text, unberührt, Wegfall, Massenschutz, Grabstein", () => {
  const leer = "---\n---\n# X\n\n## Meine Notizen\n\n";
  const mit = "---\n---\n# X\n\n## Meine Notizen\n\nRaum gewechselt.\n";
  const stundenplan = "---\n---\n# X\n\n## Notizen\n- \n";
  assert.equal(Q.meineNotizen(leer), "");
  assert.equal(Q.meineNotizen(stundenplan), "", "Platzhalter zählt nicht");
  assert.equal(Q.meineNotizen(mit), "Raum gewechselt.");
  assert.equal(Q.meineNotizen("---\n---\n# X\n\n## Notizen\n- Klausur fragen\n"), "- Klausur fragen");
  assert.equal(Q.unberuehrt({}, leer), true);
  assert.equal(Q.unberuehrt({ erledigt: true }, leer), false);
  assert.equal(Q.wegfall({}, leer), "papierkorb");
  assert.equal(Q.wegfall({}, mit), "entfaellt");
  assert.equal(Q.wegfall({ entfaellt: true }, mit), "bleibt");
  assert.equal(Q.zuViel(11, 20), true);
  assert.equal(Q.zuViel(11, 30), false);
  assert.equal(Q.zuViel(3, 4, 2), true);
  assert.equal(Q.zuViel(2, 3, 2), false);
  const h = Q.kurzHash({ id: "a", datum: "2026-10-20" });
  assert.equal(Q.geloescht({ a: h }, "a", h), true);
  assert.equal(Q.geloescht({ a: h }, "a", Q.kurzHash({ id: "a", datum: "2026-10-21" })), false, "geändert → kommt wieder");
  assert.equal(Q.geloescht({}, "a", h), false);
  assert.equal(Q.titelEntfaellt("B110 · Übung (entfällt)"), "B110 · Übung (entfällt)");
});

test("Kurz-Prüfsumme: gleiche Rechnung wie die alten Grabsteine der zentralen Daten", () => {
  // eintragHash aus zentral.js bis 0.4.4: (h * 31 + Zeichen) | 0 über JSON.stringify, Basis 36
  const alt = (e) => { let h = 0; const s = JSON.stringify(e); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const e = { id: "2026-10-20-b110", titel: "Klausur B110 – Einführung", datum: "2026-10-20" };
  assert.equal(Q.kurzHash(e), alt(e));
});

test("Doppel: kürzester Name bleibt, erledigt gewinnt, eigene Zeilen kommen dazu", () => {
  const g = [
    { pfad: "Termine/2026-10-20 Klausur B110 2.md", fm: { erledigt: true }, text: "---\n---\n# K\n\n## Meine Notizen\n\nFormelsammlung mitnehmen.\nRaum H1\n" },
    { pfad: "Termine/2026-10-20 Klausur B110.md", fm: {}, text: "---\n---\n# K\n\n## Meine Notizen\n\nRaum H1\n" },
    { pfad: "Termine/2026-10-20 Klausur B110 3.md", fm: {}, text: "---\n---\n# K\n\n## Meine Notizen\n\n" },
  ];
  const d = Q.dubletten(g);
  assert.equal(d.bleibt, "Termine/2026-10-20 Klausur B110.md");
  assert.deepEqual(d.weg, ["Termine/2026-10-20 Klausur B110 2.md", "Termine/2026-10-20 Klausur B110 3.md"]);
  assert.equal(d.erledigt, true);
  assert.equal(d.text, "---\n---\n# K\n\n## Meine Notizen\n\nRaum H1\nFormelsammlung mitnehmen.\n");
  // nichts Neues: Text bleibt
  const d2 = Q.dubletten([{ pfad: "a.md", fm: {}, text: "x\n## Notizen\n- a\n" }, { pfad: "ab.md", fm: {}, text: "x\n## Notizen\n- a\n" }]);
  assert.deepEqual([d2.text, d2.erledigt], [null, false]);
  // Platzhalter und fehlender Abschnitt
  assert.equal(Q.meineMischen("# X\n\n## Notizen\n- \n", ["## Notizen\n- Tutorium Raum 4\n"]), "# X\n\n## Notizen\n- Tutorium Raum 4\n");
  assert.equal(Q.meineMischen("# X\n", ["## Notizen\n- a\n"], "## Notizen"), "# X\n\n## Notizen\n\n- a\n");
  assert.equal(Q.meineMischen("# X\n\n## Meine Notizen\n\n", ["## Meine Notizen\n\nb\n"]), "# X\n\n## Meine Notizen\n\nb\n", "leerer Abschnitt: Leerzeile bleibt");
  assert.deepEqual(Q.doppelGruppen([{ id: "a" }, { id: "b" }, { id: "a" }, { id: "" }, { id: "" }], (x) => x.id).map((x) => x.length), [2]);
});

test("Meldekanal: Quellen melden Punkte ohne Kästchen, fester Reihe nach, Abmelden beim Hot-Reload", () => {
  const aufr = [];
  const ctx = { aufraeumen: (fn) => aufr.push(fn) };
  let neu = 0;
  Q.beiMeldung(ctx, () => neu++);
  Q.melden(ctx, "volltext", () => [{ text: "**Volltext** · 2 PDFs warten", pfad: "Studium/Einstellungen & Hilfe.md" }]);
  Q.melden(ctx, "alma", () => [{ text: "**Stundenplan** · B110 Vorlesung steht nicht mehr in Alma", pfad: "Stundenplan/Mo 10.15 B110 Vorlesung.md" }, { text: "ohne Pfad" }]);
  Q.melden(ctx, "kaputt", () => { throw new Error("x"); });
  assert.deepEqual(Q.meldungen(ctx).map((x) => x.quelle), ["alma", "volltext"]);
  Q.meldenNeu(ctx);
  assert.equal(neu, 1);
  for (const f of aufr.splice(0)) f();
  assert.deepEqual(Q.meldungen(ctx), []);
});
