// ILIAS-Unterlagen (ilias.js): Fortschritt im Hintergrund und Weitermachen. Texte des Fortschritts (ohne Kurstitel), Ereignisse,
// offener Auftrag (nächster Stapel, Fehler mit Wartezeit, nie nach abgelehnter Anmeldung, Trennen, Stoppen, anderem Gerät),
// toter Lauf (verwerfen), Funde (Fortsetzung ohne neues Durchsuchen), Absturz mitten im Schreiben. Attrappen aus
// tests/ilias-attrappen.js. Läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { I, GEHEIM, B, aufbau, datei, standardIlias } = require("./ilias-attrappen.js");

const MIN = 60e3;
const B110 = "Unterlagen/B110 Einführung in die Betriebswirtschaftslehre";
const verbinden = async (x) => { const r = await x.m.zugangSpeichern("zxabc01", () => GEHEIM); assert.equal(r.ok, true, r.fehler); };
const knopf = (x, o) => x.m.jetztHolen(Object.assign({ manuell: true }, o || {}));
const ereignisse = (x, art) => x.hoerer.filter((e) => e && e.art === art);
const ticks = async (bed) => { for (let i = 0; i < 200 && !bed(); i++) await new Promise((r) => setImmediate(r)); return bed(); };
// 30 Dateien in einem Kurs (für die Grenze je Lauf)
const dreissig = () => {
  const def = standardIlias();
  const viele = [];
  for (let i = 1; i <= 30; i++) { const id = String(5000 + i); viele.push(datei(id, "Folien VL" + i + " Teil", "pdf", "2026-10-" + String(i).padStart(2, "0") + "T08:00")); def.dateien[id] = "%PDF Teil " + i; }
  def.kurse = [def.kurse[0]];
  def.seiten[B + "kurs/100"] = viele;
  return def;
};

test("Fortschritt: kurze Texte, Anteil, nie ein Kurstitel", () => {
  const F = I.fortschrittAnzeige;
  assert.deepEqual(F({ phase: "laden", erledigt: 11, gesamt: 40 }), { text: "Lädt 12 von 40", kurz: "ILIAS · 12 von 40", knopf: "Lädt 12 von 40", anteil: 11 / 40 });
  assert.equal(F({ phase: "laden", erledigt: 25, gesamt: 40 }, true).kurz, "ILIAS · weiter: 26 von 40");
  assert.deepEqual(F({ phase: "durchsuchen", code: "B110", erledigt: 1, gesamt: 4 }), { text: "B110 wird durchsucht …", kurz: "ILIAS · B110 wird durchsucht", knopf: "Lädt …", anteil: 0.25 });
  assert.equal(F({ phase: "durchsuchen", code: "B110 Einführung PW: geheim", erledigt: 0, gesamt: 2 }).kurz, "ILIAS · Kurse werden durchsucht", "kein Code → kein Text aus ILIAS");
  assert.deepEqual(F({ phase: "anmelden" }), { text: "Anmeldung …", kurz: "ILIAS · Anmeldung", knopf: "Lädt …", anteil: null });
  assert.equal(F({ phase: "kurse" }).text, "Kurse werden gelesen …");
  assert.equal(F(null).kurz, "ILIAS · Wird vorbereitet");
  assert.equal(F({ phase: "laden", erledigt: 99, gesamt: 3 }).kurz, "ILIAS · 3 von 3", "nie über gesamt");
});

test("Ereignisse eines Knopf-Laufs: start manuell, Fortschritt ohne Titel und Dateinamen, fertig mit Hinweis", async () => {
  const x = aufbau();
  await verbinden(x);
  const b = await knopf(x);
  assert.equal(b.art, "ok", b.fehler);
  assert.deepEqual(ereignisse(x, "start"), [{ art: "start", manuell: true, weiter: false }]);
  const fort = ereignisse(x, "fortschritt");
  const json = JSON.stringify(fort);
  for (const wort of ["Einführung", "Mathematische", "Vorkurs", "Folien", "Blatt", "Skript"]) assert.ok(json.indexOf(wort) < 0, wort);
  assert.deepEqual(fort.filter((e) => e.phase === "laden").map((e) => [e.erledigt, e.gesamt]), [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5]]);
  assert.deepEqual(fort.filter((e) => e.phase === "durchsuchen").map((e) => e.code).filter((c, i, l) => l.indexOf(c) === i), ["B110", "S100"]);
  const fertig = ereignisse(x, "fertig");
  assert.equal(fertig.length, 1);
  assert.equal(fertig[0].text, "ILIAS: 5 neue Dateien in Unterlagen."); assert.equal(fertig[0].weiterIn, null);
  assert.deepEqual(x.meldungen, ["ILIAS: 5 neue Dateien in Unterlagen."]);
  assert.equal(x.m.auftrag(), null, "alles geladen: kein offener Auftrag");
  // nichts Neues
  x.u.vor(5 * MIN);
  await knopf(x);
  assert.equal(x.meldungen[1], "ILIAS: keine neuen Dateien.");
});

test("Status während eines Laufs: kurzer Text und Fortschritt", async () => {
  const x = aufbau();
  await verbinden(x);
  let mitte = null;
  const p = knopf(x, { fortschritt: (f) => { if (f.phase === "laden" && f.erledigt === 2) mitte = x.m.status(); } });
  await p;
  assert.equal(mitte.laeuft, true);
  assert.equal(mitte.text, "Lädt 3 von 5");
  assert.equal(mitte.fortschritt.knopf, "Lädt 3 von 5");
  assert.equal(x.m.status().fortschritt, null);
});

test("Weitermachen: Entscheidung nach einem Lauf und tote Läufe", () => {
  const N = I.naechsterSchritt, K = I.K;
  const a = { seit: "2026-10-16T08:00:00.000Z", versuche: 0, stapel: 0, geladen: 0 };
  assert.deepEqual(N(null, { art: "ok", rest: 3 }), { auftrag: null, inMs: null }, "ohne Auftrag nie");
  assert.deepEqual(N(a, { art: "ok", rest: 5, geladen: 25 }), { auftrag: Object.assign({}, a, { stapel: 1, geladen: 25 }), inMs: K.STAPEL_PAUSE });
  assert.equal(N(a, { art: "ok", rest: 0, kurseOffen: 1 }).inMs, K.STAPEL_PAUSE, "Kurs wegen Anfragen-Grenze offen");
  assert.deepEqual(N(a, { art: "unveraendert", rest: 0, kurseOffen: 0 }), { auftrag: null, inMs: null }, "fertig");
  assert.equal(N(Object.assign({}, a, { stapel: K.STAPEL_MAX - 1 }), { art: "ok", rest: 5 }).auftrag, null, "höchstens STAPEL_MAX Stapel");
  // Fehler: 1, 5, 15 Min., dann stündlich (Auftrag weg)
  let x = a;
  const warten = [];
  for (let i = 0; i < 4; i++) { const n = N(x, { art: "fehler" }); warten.push(n.inMs); x = n.auftrag; }
  assert.deepEqual(warten, [1 * MIN, 5 * MIN, 15 * MIN, null]);
  assert.equal(x, null);
  assert.equal(N(Object.assign({}, a, { versuche: 2 }), { art: "ok", rest: 1 }).auftrag.versuche, 0, "Erfolg setzt die Versuche zurück");
  // nie weiter
  for (const art of ["zugang", "anderes-geraet", "extern", "ohne-zugang", "ohne-anmeldung", "gesperrt"]) assert.deepEqual(N(a, { art }), { auftrag: null, inMs: null }, art);
  // Plugin neu geladen: Auftrag bleibt, weiter beim Start; Knopf während des Kurse-Lesens: gleich danach
  assert.deepEqual(N(a, { art: "abgebrochen", geladen: 3 }), { auftrag: Object.assign({}, a, { geladen: 3 }), inMs: null });
  assert.equal(N(a, { art: "kurse" }).inMs, 1000);
  // tot: länger als STILL ohne Regung
  const t = Date.parse("2026-10-16T08:00:00Z");
  assert.equal(I.abgestorben(0, t), false);
  assert.equal(I.abgestorben(t, t + K.STILL), false);
  assert.equal(I.abgestorben(t, t + K.STILL + 1), true);
});

test("Stapel: Grenze je Lauf erreicht → Auftrag bleibt, nächster Lauf zählt weiter, dann erledigt", async () => {
  const x = aufbau({ ilias: dreissig(), mobil: true });
  await verbinden(x);
  let b = await knopf(x);
  assert.equal(b.neu, I.K.NEU_MOBIL); assert.equal(b.rest, 5);
  assert.deepEqual(x.m.auftrag(), { seit: "2026-10-16T08:00:00.000Z", versuche: 0, stapel: 1, geladen: 25 });
  assert.equal(ereignisse(x, "fertig")[0].weiterIn, I.K.STAPEL_PAUSE);
  assert.equal(x.meldungen[0], "ILIAS: 25 neue Dateien in Unterlagen. 5 weitere folgen gleich.");
  const laden1 = ereignisse(x, "fortschritt").filter((e) => e.phase === "laden");
  assert.deepEqual([laden1[0].erledigt, laden1[0].gesamt], [0, 30], "gesamt = alle, die fehlen");
  x.u.vor(I.K.STAPEL_PAUSE); x.hoerer.length = 0; x.il.leeren();
  b = await knopf(x, { weiter: true });
  assert.equal(b.neu, 5); assert.equal(b.rest, 0);
  assert.deepEqual(x.il.geholt(), [], "zweiter Stapel durchsucht nicht noch einmal");
  assert.equal(ereignisse(x, "start")[0].weiter, true);
  const laden2 = ereignisse(x, "fortschritt").filter((e) => e.phase === "laden");
  assert.equal(I.fortschrittAnzeige(laden2[0], true).kurz, "ILIAS · weiter: 26 von 30");
  assert.equal(x.m.auftrag(), null);
  assert.equal(x.meldungen[1], "ILIAS: 5 neue Dateien in Unterlagen.");
  // automatische Läufe legen keinen Auftrag an
  x.u.vor(4 * 60 * MIN);
  await x.m.jetztHolen({});
  assert.equal(x.m.auftrag(), null);
});

test("Fehler (kein Netz): neuer Versuch nach 1, 5, 15 Min., danach nur noch stündlich", async () => {
  const x = aufbau();
  await verbinden(x);
  x.il.stoerung.laden = () => new Error("offline");
  const warten = [];
  let b = await knopf(x);
  assert.equal(b.art, "fehler");
  warten.push(ereignisse(x, "fertig").pop().weiterIn);
  assert.match(x.meldungen[0], /^ILIAS: Fehler beim Abruf\. offline Neuer Versuch in 1 Min\.$/);
  for (let i = 0; i < 3; i++) { x.u.vor(MIN); b = await knopf(x, { weiter: true }); warten.push(ereignisse(x, "fertig").pop().weiterIn); }
  assert.deepEqual(warten, [MIN, 5 * MIN, 15 * MIN, null]);
  assert.equal(x.m.auftrag(), null);
  assert.equal(x.m.bereit(), true, "automatische Läufe gehen weiter");
  // Netz wieder da: der Knopf holt alles, nichts doppelt
  x.il.stoerung.laden = null;
  b = await knopf(x);
  assert.equal(b.neu, 5);
  assert.equal(x.t.pfade("Unterlagen/").filter((p) => / \(2\)\./.test(p)).length, 0);
});

test("Nie weiter: abgelehnte Anmeldung, anderes Gerät, Trennen, Stoppen", async () => {
  // abgelehnte Anmeldung (Kennwort geändert)
  let x = aufbau();
  await verbinden(x);
  x.geheimnisse.set(I.geheimIdAus("Test-Tresor"), "falsch");
  let b = await knopf(x);
  assert.equal(b.art, "zugang"); assert.equal(x.m.auftrag(), null); assert.equal(x.m.bereit(), false);
  assert.equal(ereignisse(x, "fertig")[0].weiterIn, null);
  // anderes Gerät lädt
  const frisch = JSON.stringify({ geraet: "g-anderes", seit: "2026-10-15T08:00:00.000Z", zuletzt: "2026-10-16T07:50:00.000Z" });
  x = aufbau({ dateien: { [I.K.ABRUF]: frisch } });
  await verbinden(x);
  b = await knopf(x);
  assert.equal(b.art, "anderes-geraet"); assert.equal(x.m.auftrag(), null);
  // Trennen mitten im Lauf: Lauf endet, Auftrag weg, kein zweiter Hinweis
  x = aufbau();
  await verbinden(x);
  let p = knopf(x);
  assert.ok(x.m.auftrag());
  await x.m.zugangLoeschen();
  b = await p;
  assert.equal(b.art, "abgebrochen"); assert.equal(x.m.auftrag(), null); assert.deepEqual(x.meldungen, []);
  // Stoppen
  x = aufbau();
  await verbinden(x);
  p = knopf(x);
  x.m.stoppen();
  b = await p;
  assert.equal(b.art, "abgebrochen"); assert.equal(x.m.auftrag(), null);
  assert.deepEqual(x.meldungen, ["ILIAS: gestoppt."]);
  assert.equal(x.t.pfade("Unterlagen/").length, 0);
});

test("Knopf während eines automatischen Laufs: derselbe Lauf, jetzt mit Fortschritt, Hinweis und Auftrag", async () => {
  const x = aufbau();
  await verbinden(x);
  const auto = x.m.jetztHolen({});
  assert.equal(x.m.auftrag(), null);
  const k = knopf(x);
  assert.equal(k, auto, "kein zweiter Lauf");
  assert.deepEqual(ereignisse(x, "start").map((e) => e.manuell), [false, true]);
  const b = await k;
  assert.equal(b.neu, 5);
  assert.deepEqual(x.meldungen, ["ILIAS: 5 neue Dateien in Unterlagen."]);
  assert.equal(x.m.auftrag(), null);
});

test("Kurs während des Laufs abgewählt: nicht mehr durchsucht, nichts geladen", async () => {
  const x = aufbau();
  await verbinden(x);
  let einmal = true;
  const b = await knopf(x, { fortschritt: (f) => { if (einmal && f.phase === "durchsuchen" && f.code === "B110") { einmal = false; x.m.kursSetzen("300", false); } } });
  assert.equal(b.neu, 3);
  assert.ok(x.il.geholt().indexOf(B + "kurs/300") < 0);
  assert.equal(x.t.pfade("Unterlagen/S100").length + x.t.pfade("Unterlagen/SQ888").length, 0);
});

test("Toter Lauf (im Hintergrund gestorben): verwerfen, neu starten; wacht er auf, schreibt er nichts", async () => {
  let haenger = null, gerufen = false;
  const x = aufbau({ quelle: async (zugang, anmelden) => {
    const q = await x.il.quelle(zugang, anmelden);
    const laden = q.laden;
    q.laden = (e) => { if (!gerufen) { gerufen = true; return new Promise((r) => { haenger = () => r(laden(e)); }); } return laden(e); };
    return q;
  } });
  await verbinden(x);
  const p1 = knopf(x);
  assert.ok(await ticks(() => gerufen), "erster Download hängt");
  assert.equal(x.m.still(), false);
  x.u.vor(I.K.STILL + 1);
  assert.equal(x.m.still(), true);
  x.m.verwerfen();
  assert.equal(x.m.laeuft, false); assert.ok(x.m.auftrag(), "Auftrag bleibt");
  x.il.leeren();
  const b2 = await knopf(x, { weiter: true });
  assert.equal(b2.neu, 5, b2.fehler);
  assert.deepEqual(x.il.geholt(), [], "fertig durchsucht: gleich laden");
  haenger();
  const b1 = await p1;
  assert.equal(b1.art, "abgebrochen");
  assert.equal(x.t.pfade("Unterlagen/").length, 10, "5 Dateien + 5 Notizen, nichts doppelt");
  assert.equal(x.m.auftrag(), null);
});

test("Obsidian beim Durchsuchen geschlossen: Fortsetzung durchsucht fertige Kurse nicht noch einmal", async () => {
  let haenger = null, gerufen = false;
  const x = aufbau({ quelle: async (zugang, anmelden) => {
    const q = await x.il.quelle(zugang, anmelden);
    const inhalt = q.inhalt;
    q.inhalt = (k) => { if (!gerufen && k.url === B + "kurs/300") { gerufen = true; return new Promise((r) => { haenger = () => r(inhalt(k)); }); } return inhalt(k); };
    return q;
  } });
  await verbinden(x);
  const p1 = knopf(x);
  assert.ok(await ticks(() => gerufen), "zweiter Kurs hängt");
  const funde = x.lok.lokal("eba-ilias-funde");
  assert.deepEqual(funde.map((c) => c.id).sort(), ["1001", "1101", "1201"], "Funde des ersten Kurses gemerkt");
  for (const c of funde) assert.deepEqual(Object.keys(c.eintrag).sort(), ["art", "endung", "id", "refId", "typ", "url"], "vom Eintrag nur, was der Download braucht");
  x.u.vor(I.K.STILL + 1);
  x.m.verwerfen();
  x.il.leeren();
  const b2 = await knopf(x, { weiter: true });
  assert.equal(b2.neu, 5, b2.fehler);
  assert.deepEqual(x.il.geholt(), [B + "kurs/300", B + "ordner/310"], "nur der Kurs, der noch fehlte");
  assert.deepEqual(x.lok.lokal("eba-ilias-funde"), [], "alles geladen: keine Funde mehr");
  haenger();
  assert.equal((await p1).art, "abgebrochen");
  assert.equal(x.t.pfade("Unterlagen/").length, 10, "5 Dateien + 5 Notizen, nichts doppelt");
});

test("Automatischer Lauf bricht beim Laden ab: der nächste lädt den Rest, ohne neu zu durchsuchen", async () => {
  const x = aufbau();
  await verbinden(x);
  let n = 0;
  x.il.stoerung.laden = () => (++n === 3 ? new Error("offline") : null);
  let b = await x.m.jetztHolen({});
  assert.equal(b.art, "fehler"); assert.equal(b.neu, 2);
  x.il.stoerung.laden = null;
  x.u.vor(60 * MIN); x.il.leeren();
  b = await x.m.jetztHolen({});
  assert.equal(b.neu, 3, b.fehler);
  assert.deepEqual(x.il.geholt(), [], "Kurse vor kurzem durchsucht");
  assert.equal(x.t.pfade("Unterlagen/").filter((p) => / \(2\)\./.test(p)).length, 0);
  // gestoppt: der Fund bleibt; abgewählter Kurs: nichts geladen, der Fund fällt weg
  x.il.def.dateien["3002"] = "%PDF Nachtrag";
  x.il.def.seiten[B + "kurs/300"].push(datei("3002", "Nachtrag", "pdf", "2026-10-16T09:00"));
  await knopf(x, { fortschritt: (f) => { if (f.phase === "laden") x.m.stoppen(); } });
  assert.deepEqual(x.lok.lokal("eba-ilias-funde").map((c) => c.id), ["3002"]);
  await x.m.kursSetzen("300", false);
  x.u.vor(60 * MIN); x.il.leeren();
  await x.m.jetztHolen({});
  assert.deepEqual(x.il.geladen(), []);
  assert.deepEqual(x.lok.lokal("eba-ilias-funde"), []);
});

test("Fortsetzung ohne gemerkte Funde (Update mitten im Abruf): alle Kurse durchsuchen, nichts fehlt", async () => {
  const x = aufbau({ ilias: dreissig(), mobil: true });
  await verbinden(x);
  await knopf(x);
  x.lok.lokal("eba-ilias-funde", null); // wie eine ältere Fassung, die keine Funde kannte
  x.u.vor(I.K.STAPEL_PAUSE); x.il.leeren();
  const b = await knopf(x, { weiter: true });
  assert.equal(b.neu, 5, b.fehler);
  assert.deepEqual(x.il.geholt(), [B + "kurs/100"]);
  assert.equal(x.m.auftrag(), null);
});

test("Trennen räumt die Funde weg; ein verworfener Lauf, der aufwacht, schreibt keine", async () => {
  const x = aufbau();
  await verbinden(x);
  await knopf(x, { fortschritt: (f) => { if (f.phase === "laden") x.m.stoppen(); } });
  assert.equal(x.lok.lokal("eba-ilias-funde").length, 5);
  await x.m.zugangLoeschen();
  assert.equal(x.lok.lokal("eba-ilias-funde"), null);
  // verworfen, während er den letzten Kurs durchsucht
  let haenger = null, gerufen = false;
  const y = aufbau({ quelle: async (zugang, anmelden) => {
    const q = await y.il.quelle(zugang, anmelden);
    const inhalt = q.inhalt;
    q.inhalt = (k) => { if (!gerufen && k.url === B + "ordner/310") { gerufen = true; return new Promise((r) => { haenger = () => r(inhalt(k)); }); } return inhalt(k); };
    return q;
  } });
  await verbinden(y);
  const p = knopf(y);
  assert.ok(await ticks(() => gerufen));
  y.u.vor(I.K.STILL + 1);
  y.m.verwerfen();
  y.lok.lokal("eba-ilias-funde", null);
  haenger();
  assert.equal((await p).art, "abgebrochen");
  assert.equal(y.lok.lokal("eba-ilias-funde"), null);
});

test("Absturz beim Schreiben einer neuen Datei: halbe Datei wird ersetzt, kein „ (2)“", async () => {
  const x = aufbau();
  await verbinden(x);
  const echt = x.t.io.anlegenBinaer;
  let einmal = true;
  x.t.io.anlegenBinaer = async (p, by) => {
    if (einmal && /Folien 02/.test(p)) { einmal = false; x.t.setzen(p, by.slice(0, 4)); throw new Error("Obsidian beendet"); }
    return echt(p, by);
  };
  const p = B110 + "/B110 Folien 02 Märkte.pptx";
  let b = await knopf(x);
  assert.equal(b.art, "fehler");
  assert.equal(x.t.text(p), "PPTX", "halbe Datei liegt da");
  assert.ok(x.lok.lokal("eba-ilias-schreibt"));
  x.u.vor(MIN);
  b = await knopf(x, { weiter: true });
  assert.equal(b.art, "ok", b.fehler);
  assert.equal(x.t.text(p), "PPTX Folien zwei");
  assert.deepEqual(x.t.pfade(B110 + "/B110 Folien 02"), [B110 + "/B110 Folien 02 Märkte.md", p]);
  assert.equal(x.t.index().dateien["1201"].pfad, p);
  assert.equal(x.lok.lokal("eba-ilias-schreibt"), null);
});

test("Absturz beim Ersetzen: halb ersetzte Datei gilt nicht als deine Änderung, der nächste Lauf ersetzt sie", async () => {
  const x = aufbau();
  await verbinden(x);
  await knopf(x);
  const p = B110 + "/B110 Folien 01 Grundlagen.pdf";
  x.il.def.dateien["1001"] = "%PDF Folien eins, Fassung 2";
  x.il.def.seiten[B + "kurs/100"][0].geaendert = "2026-10-16T07:00";
  const echt = x.t.io.ersetzenBinaer;
  let einmal = true;
  x.t.io.ersetzenBinaer = async (q, by) => {
    if (einmal) { einmal = false; x.t.setzen(q, by.slice(0, 6)); throw new Error("Obsidian beendet"); }
    return echt(q, by);
  };
  x.u.vor(MIN);
  let b = await knopf(x);
  assert.equal(b.art, "fehler");
  assert.equal(x.t.text(p), "%PDF F");
  x.u.vor(MIN);
  b = await knopf(x, { weiter: true });
  assert.equal(b.ersetzt, 1, b.fehler); assert.equal(b.fassungen, 0);
  assert.equal(x.t.text(p), "%PDF Folien eins, Fassung 2");
  assert.equal(x.t.pfade(B110).filter((q) => /neue Fassung/.test(q)).length, 0);
});
