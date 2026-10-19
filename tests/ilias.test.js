// ILIAS-Unterlagen (ilias.js): ganzer Ablauf mit erfundenem ILIAS und Tresor im Speicher (tests/ilias-attrappen.js).
// Ablage mit Begleitnotiz, zweiter Lauf ohne Downloads, byte-gleiche Dateien, geänderte Dateien (ersetzen bzw. neue Fassung),
// gelöscht bleibt gelöscht, Umbenennen, Videos und große Dateien, Abrufer-Sperre, eigener Uni-Abgleich, Kurswahl, Grenzen je
// Lauf, Fehler mitten im Lauf, das Kennwort nirgends. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");
const A = require("./ilias-attrappen.js");
const { I, GEHEIM, B, enc, aufbau, datei, ordner, standardIlias } = A;

const STUNDE = 3600e3;
const B110 = "Unterlagen/B110 Einführung in die Betriebswirtschaftslehre";
const verbinden = async (x) => { const r = await x.m.zugangSpeichern("zxabc01", () => GEHEIM); assert.equal(r.ok, true, r.fehler); };
const fm = (text, k) => { const m = String(text).match(new RegExp("^" + k + ": (.*)$", "m")); return m ? m[1] : undefined; };
// ein Lauf wie der automatische (nicht manuell)
const lauf = (x, o) => x.m.jetztHolen(Object.assign({}, o || {}));

test("Erster Lauf: neue Dateien mit Begleitnotiz, Ordner je Modul, Videos und Forum übersprungen", async () => {
  const x = aufbau();
  await verbinden(x);
  const b = await lauf(x);
  assert.equal(b.art, "ok", b.fehler);
  assert.equal(b.neu, 5);
  assert.equal(b.videos, 2, "Video-Objekt und .mp4");
  assert.deepEqual(b.jeKurs, { 100: { neu: 3, videos: 2 }, 300: { neu: 2 } }, "Zähler je Kurs");
  const pfade = x.t.pfade("Unterlagen/");
  assert.deepEqual(pfade, [
    "Unterlagen/B110 Einführung in die Betriebswirtschaftslehre/B110 Folien 01 Grundlagen.md",
    "Unterlagen/B110 Einführung in die Betriebswirtschaftslehre/B110 Folien 01 Grundlagen.pdf",
    "Unterlagen/B110 Einführung in die Betriebswirtschaftslehre/B110 Folien 02 Märkte.md",
    "Unterlagen/B110 Einführung in die Betriebswirtschaftslehre/B110 Folien 02 Märkte.pptx",
    "Unterlagen/B110 Einführung in die Betriebswirtschaftslehre/B110 Übung 01.md",
    "Unterlagen/B110 Einführung in die Betriebswirtschaftslehre/B110 Übung 01.pdf",
    "Unterlagen/S100 Mathematische Methoden/S100 Sonstiges Skript Analysis.md",
    "Unterlagen/S100 Mathematische Methoden/S100 Sonstiges Skript Analysis.pdf",
    "Unterlagen/SQ888 Schreibwerkstatt/SQ888 Sonstiges Leitfaden Hausarbeit.md",
    "Unterlagen/SQ888 Schreibwerkstatt/SQ888 Sonstiges Leitfaden Hausarbeit.pdf",
  ]);
  assert.equal(x.t.text(B110 + "/B110 Folien 01 Grundlagen.pdf"), "%PDF Folien eins");
  // Begleitnotiz: Pflichtfelder und Herkunft
  const n = x.t.text(B110 + "/B110 Folien 02 Märkte.md");
  assert.equal(fm(n, "typ"), "unterlage");
  assert.equal(fm(n, "uebersicht"), '"[[Unterlagen]]"');
  assert.equal(fm(n, "original"), '"Folien VL02 Märkte.pptx"');
  assert.equal(fm(n, "quelle"), '"ILIAS: B110 Einführung in die BWL / 2026-10-20 Sitzung 2"', "Sitzung als Ordner");
  assert.equal(fm(n, "ilias_id"), '"1201"');
  assert.equal(fm(n, "modul"), '"[[B110 Einführung in die Betriebswirtschaftslehre]]"');
  assert.equal(fm(n, "datei"), '"[[B110 Folien 02 Märkte.pptx]]"');
  assert.match(n, /^> \[!eba-info\] Nur als PPTX vorhanden$/m);
  assert.match(x.t.text(B110 + "/B110 Folien 01 Grundlagen.md"), /^> !\[\[B110 Folien 01 Grundlagen\.pdf#height=560\]\]$/m);
  // Index (synchronisiert) und Abrufer-Sperre
  const idx = x.t.index();
  assert.equal(idx.version, 1);
  assert.deepEqual(Object.keys(idx.dateien).sort(), ["1001", "1101", "1201", "3001", "3101"]);
  const e = idx.dateien["1001"];
  assert.equal(e.pfad, B110 + "/B110 Folien 01 Grundlagen.pdf");
  assert.equal(e.groesse, enc("%PDF Folien eins").length);
  assert.equal(e.iliasGroesse, 1024, "Größe aus der Liste getrennt von der echten");
  assert.equal(e.geaendert, "2026-10-13T10:00");
  assert.match(e.sha256, /^[0-9a-f]{64}$/);
  assert.equal(e.iliasPfad, "B110 Einführung in die BWL");
  assert.equal(JSON.parse(x.t.text(I.K.ABRUF)).geraet, "g-ich");
  // Anfragen: Sitzung (schon aufgeklappt), Forum, Video, Link nicht geholt; zwei Seiten zugleich, der älteste Kurs zuerst
  assert.deepEqual(x.il.geholt(), [B + "kurs/100", B + "kurs/300", B + "ordner/110", B + "ordner/310"]);
  // neueste zuerst
  assert.deepEqual(x.il.geladen(), ["1201", "1101", "1001", "3001", "3101"]);
  assert.equal(x.anm.aufrufe, 1);
  const s = x.m.status();
  assert.equal(s.verbunden, true); assert.equal(s.bereit, true); assert.equal(s.dateien, 5); assert.equal(s.kurse, 2); assert.equal(s.neu, 5);
  assert.equal(x.m.protokoll().length, 1);
});

test("Zweiter Lauf lädt nichts und schreibt den Index nicht neu", async () => {
  const x = aufbau();
  await verbinden(x);
  await lauf(x);
  const vorher = x.t.text(I.K.INDEX);
  x.il.leeren(); x.t.schreibvorgaenge.length = 0;
  x.u.vor(4 * STUNDE);
  const b = await lauf(x);
  assert.equal(b.art, "unveraendert", b.fehler);
  assert.equal(x.il.anzahl("laden"), 0);
  assert.equal(x.t.text(I.K.INDEX), vorher);
  assert.ok(x.t.schreibvorgaenge.every((p) => p === I.K.ABRUF), x.t.schreibvorgaenge.join(", "));
});

test("Übungen: Code und Kurs je ref_id im Index (für den ILIAS-Kalender), nie der Titel; unverändert kein Schreiben", async () => {
  const def = standardIlias();
  def.seiten[B + "kurs/100"].push({ art: "uebung", typ: "exc", refId: "150", titel: "Erfundene Übung (Pass" + "wort: Igel42)", url: B + "uebung/150" });
  def.seiten[B + "ordner/310"].push({ art: "uebung", typ: "exc", refId: "350", titel: "Erfundene Schreibübung", url: B + "uebung/350" });
  const x = aufbau({ ilias: def });
  await verbinden(x);
  await lauf(x);
  const o = x.t.index().objekte;
  assert.deepEqual(Object.keys(o).sort(), ["150", "350"]);
  assert.deepEqual([o[150].typ, o[150].code, o[150].kurs], ["exc", "B110", "100"]);
  assert.deepEqual([o[350].code, o[350].kurs], ["SQ888", "300"], "Unterordner mit eigenem Code");
  const vorher = x.t.text(I.K.INDEX);
  assert.ok(vorher.indexOf("Igel42") < 0 && vorher.indexOf("Erfundene") < 0, "nie der Titel");
  assert.equal(x.il.geholt().filter((u) => /uebung/.test(u)).length, 0, "Übungen werden nicht geöffnet");
  x.u.vor(4 * STUNDE);
  await lauf(x, { manuell: true });
  assert.equal(x.t.text(I.K.INDEX), vorher);
});

test("Byte-gleiche Datei schon unter Unterlagen/: nur gemerkt, keine Kopie, keine Notiz", async () => {
  const x = aufbau({ dateien: { "Unterlagen/Eigenes/vl1.pdf": "%PDF Folien eins" } });
  await verbinden(x);
  const b = await lauf(x);
  assert.equal(b.vorhanden, 1); assert.equal(b.neu, 4);
  const e = x.t.index().dateien["1001"];
  assert.equal(e.pfad, "Unterlagen/Eigenes/vl1.pdf"); assert.equal(e.wie, "vorhanden");
  assert.equal(x.t.text(B110 + "/B110 Folien 01 Grundlagen.pdf"), null);
  assert.equal(x.t.text("Unterlagen/Eigenes/vl1.md"), null);
});

test("Geändert in ILIAS, im Tresor unverändert: ersetzt, Notiz bekommt „aktualisiert“", async () => {
  const x = aufbau();
  await verbinden(x);
  await lauf(x);
  const p = B110 + "/B110 Folien 01 Grundlagen.pdf";
  const alt = x.t.index().dateien["1001"];
  x.il.def.dateien["1001"] = "%PDF Folien eins, Fassung 2";
  x.il.def.seiten[B + "kurs/100"][0].geaendert = "2026-10-16T07:00";
  x.u.vor(4 * STUNDE);
  const b = await lauf(x);
  assert.equal(b.ersetzt, 1); assert.equal(b.neu, 0); assert.equal(b.fassungen, 0);
  assert.equal(x.t.text(p), "%PDF Folien eins, Fassung 2");
  assert.equal(fm(x.t.text(B110 + "/B110 Folien 01 Grundlagen.md"), "aktualisiert"), "2026-10-16");
  const e = x.t.index().dateien["1001"];
  assert.notEqual(e.sha256, alt.sha256); assert.equal(e.geaendert, "2026-10-16T07:00"); assert.equal(e.aktualisiert, "2026-10-16");
  assert.deepEqual(x.t.pfade(B110 + "/B110 Folien 01"), [B110 + "/B110 Folien 01 Grundlagen.md", p]);
  // Nur das Datum in ILIAS geändert, Inhalt gleich: nichts schreiben
  x.il.def.seiten[B + "kurs/100"][0].geaendert = "2026-10-16T08:00";
  x.u.vor(4 * STUNDE);
  const b2 = await lauf(x);
  assert.equal(b2.gleich, 1); assert.equal(b2.ersetzt, 0); assert.equal(b2.art, "unveraendert");
});

test("Geändert in ILIAS, von dir verändert: deine bleibt, neue Fassung daneben", async () => {
  const x = aufbau();
  await verbinden(x);
  await lauf(x);
  const p = B110 + "/B110 Folien 01 Grundlagen.pdf";
  x.t.setzen(p, "%PDF Folien eins MIT MEINEN ANMERKUNGEN");
  x.il.def.dateien["1001"] = "%PDF Folien eins, Fassung 2";
  x.il.def.seiten[B + "kurs/100"][0].geaendert = "2026-10-16T07:00";
  x.u.vor(4 * STUNDE);
  const b = await lauf(x);
  assert.equal(b.fassungen, 1); assert.equal(b.ersetzt, 0);
  assert.equal(x.t.text(p), "%PDF Folien eins MIT MEINEN ANMERKUNGEN");
  const neu = B110 + "/B110 Folien 01 Grundlagen neue Fassung 2026-10-16.pdf";
  assert.equal(x.t.text(neu), "%PDF Folien eins, Fassung 2");
  const n = x.t.text(B110 + "/B110 Folien 01 Grundlagen neue Fassung 2026-10-16.md");
  assert.equal(fm(n, "ilias_id"), '"1001"');
  assert.match(n, /\[\[B110 Folien 01 Grundlagen\.pdf\]\] bleibt, wie sie ist/);
  assert.deepEqual(x.t.index().dateien["1001"].fassungen, [neu]);
  assert.equal(x.t.index().dateien["1001"].pfad, p, "Eintrag zeigt weiter auf deine Datei");
  // noch eine Fassung am selben Tag → „(2)“
  x.il.def.dateien["1001"] = "%PDF Folien eins, Fassung 3";
  x.il.def.seiten[B + "kurs/100"][0].geaendert = "2026-10-16T09:00";
  x.u.vor(4 * STUNDE);
  await lauf(x);
  assert.equal(x.t.text(B110 + "/B110 Folien 01 Grundlagen neue Fassung 2026-10-16 (2).pdf"), "%PDF Folien eins, Fassung 3");
  assert.equal(x.t.index().dateien["1001"].fassungen.length, 2);
});

test("Von dir gelöscht: kommt nicht wieder, auch nicht in neuer Fassung", async () => {
  const x = aufbau();
  await verbinden(x);
  await lauf(x);
  const p = B110 + "/B110 Übung 01.pdf";
  x.t.m.delete(p); x.t.m.delete(B110 + "/B110 Übung 01.md");
  x.u.vor(4 * STUNDE); x.il.leeren();
  let b = await lauf(x);
  assert.equal(b.geloescht, 1);
  assert.equal(x.t.index().dateien["1101"].geloescht, true);
  assert.equal(x.il.anzahl("laden"), 0);
  x.il.def.dateien["1101"] = "%PDF Blatt eins, korrigiert";
  x.il.def.seiten[B + "ordner/110"][0].geaendert = "2026-10-16T07:00";
  x.u.vor(4 * STUNDE); x.il.leeren();
  b = await lauf(x);
  assert.equal(x.il.anzahl("laden"), 0, "nicht wieder geladen");
  assert.equal(x.t.text(p), null);
  assert.equal(x.m.status().dateien, 4);
});

test("Umbenannt: Index folgt (Ereignis, Ordner, Sync ohne Ereignis)", async () => {
  const x = aufbau();
  await verbinden(x);
  await lauf(x);
  const alt = B110 + "/B110 Folien 01 Grundlagen.pdf", neu = B110 + "/Einführung VL1.pdf";
  x.t.umbenennen(alt, neu);
  assert.equal(await x.m.umbenannt(neu, alt), true);
  await x.m.speichern();
  assert.equal(x.t.index().dateien["1001"].pfad, neu);
  // ganzer Ordner umbenannt
  x.t.umbenennen(B110, "Unterlagen/BWL");
  await x.m.umbenannt("Unterlagen/BWL", B110);
  await x.m.speichern();
  assert.equal(x.t.index().dateien["1001"].pfad, "Unterlagen/BWL/Einführung VL1.pdf");
  assert.equal(x.t.index().dateien["1101"].pfad, "Unterlagen/BWL/B110 Übung 01.pdf");
  // auf einem anderen Gerät umbenannt (kommt per Sync, kein Ereignis hier): der Lauf findet die Datei über die Prüfsumme
  x.t.umbenennen("Unterlagen/SQ888 Schreibwerkstatt/SQ888 Sonstiges Leitfaden Hausarbeit.pdf", "Unterlagen/Leitfaden.pdf");
  x.u.vor(4 * STUNDE);
  const b = await lauf(x);
  assert.equal(b.geloescht, 0);
  assert.equal(x.t.index().dateien["3101"].pfad, "Unterlagen/Leitfaden.pdf");
  // danach geändert in ILIAS: am neuen Ort ersetzt
  x.il.def.dateien["1001"] = "%PDF Folien eins, Fassung 2";
  x.il.def.seiten[B + "kurs/100"][0].geaendert = "2026-10-16T09:00";
  x.u.vor(4 * STUNDE);
  await lauf(x);
  assert.equal(x.t.text("Unterlagen/BWL/Einführung VL1.pdf"), "%PDF Folien eins, Fassung 2");
});

test("Videos und Dateien über 50 MB werden nicht geladen", async () => {
  const def = standardIlias();
  def.seiten[B + "kurs/100"].push(datei("1301", "Riesig laut Liste", "pdf", "2026-10-10T08:00", { groesse: 60 * 1048576 }));
  def.seiten[B + "kurs/100"].push(datei("1302", "Riesig ohne Angabe", "zip", "2026-10-09T08:00", { groesse: null }));
  def.dateien["1302"] = new Uint8Array(I.K.MAX_MB * 1048576 + 1);
  const x = aufbau({ ilias: def });
  await verbinden(x);
  const b = await lauf(x);
  assert.equal(b.zuGross, 2);
  assert.ok(x.il.geladen().indexOf("1301") < 0, "laut Liste zu groß: gar nicht geladen");
  assert.ok(x.il.geladen().indexOf("1102") < 0 && x.il.geladen().indexOf("131") < 0, "Videos nicht geladen");
  assert.ok(!x.t.pfade("Unterlagen/").some((p) => /Riesig/.test(p)), "nichts geschrieben");
  const idx = x.t.index();
  assert.equal(idx.ignoriert["1301"].grund, "zu groß"); assert.equal(idx.ignoriert["1302"].grund, "zu groß");
  const s = x.m.status();
  assert.equal(s.zuGross, 2); assert.match(s.text, /2 Dateien über 50 MB nicht geladen/);
  x.u.vor(4 * STUNDE); x.il.leeren();
  await lauf(x);
  assert.equal(x.il.anzahl("laden"), 0, "nicht jedes Mal neu versucht");
});

test("Abrufer-Sperre: anderes Gerät aktiv → nichts; still → übernehmen; ohne Zugang → nicht beteiligt", async () => {
  const frisch = JSON.stringify({ geraet: "g-anderes", seit: "2026-10-15T08:00:00.000Z", zuletzt: "2026-10-16T07:50:00.000Z" });
  let x = aufbau({ dateien: { [I.K.ABRUF]: frisch } });
  await verbinden(x);
  let b = await lauf(x);
  assert.equal(b.art, "anderes-geraet");
  assert.equal(x.il.log.length, 0, "keine Anfrage an ILIAS");
  assert.equal(x.t.text(I.K.ABRUF), frisch);
  assert.equal(x.m.status().abrufer, false);
  assert.equal(x.m.status().text, "Ein anderes Gerät lädt deine ILIAS-Unterlagen. Sie kommen über deinen Sync.");
  // Knopf mit „übernehmen“
  b = await x.m.jetztHolen({ manuell: true, uebernehmen: true });
  assert.equal(b.art, "ok", b.fehler);
  assert.equal(JSON.parse(x.t.text(I.K.ABRUF)).geraet, "g-ich");
  // seit 81 Min. still → übernehmen
  const still = JSON.stringify({ geraet: "g-anderes", seit: "2026-10-15T08:00:00.000Z", zuletzt: "2026-10-16T06:39:00.000Z" });
  x = aufbau({ dateien: { [I.K.ABRUF]: still } });
  await verbinden(x);
  b = await lauf(x);
  assert.equal(b.art, "ok", b.fehler);
  const a = JSON.parse(x.t.text(I.K.ABRUF));
  assert.equal(a.geraet, "g-ich"); assert.equal(a.seit, "2026-10-16T08:00:00.000Z");
  // Benutzer gemerkt, aber Kennwort fehlt im Schlüsselbund (z. B. zurückgesetzt): Fehler, Sperre bleibt frei
  x = aufbau();
  await verbinden(x);
  x.geheimnisse.clear();
  b = await lauf(x);
  assert.equal(b.art, "zugang"); assert.match(b.fehler, /Passwort fehlt/);
  assert.equal(x.t.text(I.K.ABRUF), null); assert.equal(x.il.log.length, 0);
  // ohne gespeicherten Zugang: kein Lauf, keine Sperre
  x = aufbau();
  b = await lauf(x);
  assert.equal(b.art, "ohne-zugang");
  assert.equal(x.t.text(I.K.ABRUF), null);
  assert.equal(x.m.status().text, "Nicht verbunden.");
  assert.equal(x.m.status().verbunden, false);
});

test("Eigener Uni-Abgleich (abgleich.js oder Einstellung): nie laden; mit Zugang nur Mitgliedschaften für die Übungsgruppen", async () => {
  for (const o of [{ dateien: { "System/Skripte/abgleich.js": "// privat" } }, { einstellungen: { ilias_unterlagen: "extern" } }]) {
    const x = aufbau(o);
    const s0 = x.m.status();
    assert.deepEqual([s0.extern, s0.text, s0.bereit], [true, "Deine Unterlagen kommen über deinen Uni-Abgleich.", false]);
    assert.equal((await lauf(x)).art, "extern", "ohne Zugang nichts");
    assert.equal(x.il.log.length, 0);
    await verbinden(x);
    const s = x.m.status();
    assert.deepEqual([s.extern, s.gruppenZugang, s.bereit, s.verbunden], [true, true, true, false]);
    const b = await lauf(x);
    assert.equal(b.art, "nur-gruppen", b.fehler);
    assert.deepEqual(x.il.log.map((e) => e.was), ["anmelden", "kurse"], "Anmeldung und Kursliste, sonst nichts");
    assert.deepEqual(x.t.pfade("Unterlagen/"), []);
    assert.deepEqual(x.il.geladen(), []);
    assert.equal(x.m.status().text, "Prüft deine Übungsgruppen, zuletzt gerade eben. Deine Unterlagen kommen über deinen Uni-Abgleich.");
  }
});

test("Liste quellen_extern: entscheidet vor dem eigenen Uni-Abgleich; Dateien und Übungsgruppen von außen → kein Lauf", async () => {
  // nur Dateien von außen, ohne abgleich.js: wie der eigene Uni-Abgleich
  let x = aufbau({ einstellungen: { quellen_extern: ["ilias-dateien"] } });
  await verbinden(x);
  assert.equal((await lauf(x)).art, "nur-gruppen");
  assert.deepEqual(x.il.geladen(), []);
  // leere Liste trotz abgleich.js: nichts von außen, das Plugin lädt
  x = aufbau({ dateien: { "System/Skripte/abgleich.js": "// privat" }, einstellungen: { quellen_extern: [] } });
  await verbinden(x);
  assert.equal(x.m.status().extern, false);
  assert.equal((await lauf(x)).art, "ok");
  assert.equal(x.il.geladen().length, 5);
  // beides von außen: auch mit Zugang keine Anfrage, nicht bereit, kein Angebot für Übungsgruppen
  x = aufbau({ einstellungen: { quellen_extern: ["ilias-dateien", "ilias-gruppen"] } });
  await verbinden(x);
  const s = x.m.status();
  assert.deepEqual([s.extern, s.gruppenExtern, s.gruppenZugang, s.bereit, s.verbunden, s.text],
    [true, true, false, false, false, "Deine Unterlagen kommen über deinen Uni-Abgleich."]);
  assert.equal((await lauf(x)).art, "extern");
  assert.equal((await x.m.jetztHolen({ manuell: true })).art, "extern");
  assert.equal(x.il.log.length, 0, "keine Anfrage an ILIAS");
  assert.equal(x.m.auftrag(), null);
});

test("Eigener Uni-Abgleich: Hinweis „Übungsgruppen geprüft“ nur nach deinem Tipp; kein Auftrag, Weitermachen bleibt still", async () => {
  const x = aufbau({ einstellungen: { ilias_unterlagen: "extern" } });
  await verbinden(x);
  assert.equal((await lauf(x)).art, "nur-gruppen");
  assert.deepEqual(x.meldungen, [], "automatischer Lauf: kein Hinweis");
  assert.equal((await x.m.jetztHolen({ manuell: true })).art, "nur-gruppen");
  assert.deepEqual(x.meldungen, ["Übungsgruppen aus ILIAS geprüft."]);
  assert.equal(x.m.auftrag(), null, "kein Auftrag");
  // Fehler nach deinem Tipp: ein Hinweis, aber kein Weitermachen (das stündliche Prüfen versucht es still wieder)
  x.abh.quelle = async () => { throw new Error("kein Netz"); };
  assert.equal((await x.m.jetztHolen({ manuell: true })).art, "fehler");
  assert.equal(x.m.auftrag(), null);
  assert.equal(x.hoerer.filter((e) => e.art === "fertig").pop().weiterIn, null);
  assert.equal(x.m.status().text, "Fehler beim Prüfen deiner Übungsgruppen. Zuletzt geklappt gerade eben.");
  // Auftrag von früher (vor dem Uni-Abgleich): das Weitermachen läuft still und räumt ihn weg
  x.abh.quelle = x.il.quelle;
  x.lok.lokal("eba-ilias-auftrag", { seit: "2026-10-16T07:00:00.000Z", versuche: 1, stapel: 0, geladen: 0 });
  const n = x.meldungen.length;
  assert.equal((await x.m.jetztHolen({ manuell: true, weiter: true })).art, "nur-gruppen");
  assert.equal(x.meldungen.length, n, "kein Hinweis");
  assert.equal(x.m.auftrag(), null);
  assert.equal(x.hoerer.filter((e) => e.art === "start").pop().manuell, false, "kein Fortschritt");
});

test("Kurswahl: an nur mit Modulnotiz; Unterordner mit Modulcode; Wahl von einem anderen Gerät bleibt", async () => {
  const x = aufbau();
  await verbinden(x);
  await lauf(x);
  const k = await x.m.kurse();
  const an = {};
  for (const e of k) an[e.refId] = e.aktiv;
  assert.deepEqual(an, { 100: true, 200: false, 300: true, 400: false });
  assert.equal(k.find((e) => e.refId === "400").code, "X999");
  assert.equal(k.find((e) => e.refId === "100").dateien, 3);
  assert.ok(x.il.geholt().indexOf(B + "kurs/200") < 0 && x.il.geholt().indexOf(B + "kurs/400") < 0);
  assert.equal(x.t.index().dateien["3101"].pfad, "Unterlagen/SQ888 Schreibwerkstatt/SQ888 Sonstiges Leitfaden Hausarbeit.pdf");
  // auf einem anderen Gerät eingeschaltet (kommt per Sync, Eintrag neuer)
  const idx = x.t.index();
  idx.kurse["200"] = Object.assign({}, idx.kurse["200"], { aktiv: true, t: "2026-10-16T09:00:00.000Z" });
  x.t.setzen(I.K.INDEX, JSON.stringify(idx));
  x.u.vor(4 * STUNDE);
  const b = await lauf(x);
  assert.equal(b.neu, 1);
  assert.ok(x.t.text("Unterlagen/Mathe-Vorkurs/Übung 01 Vorkurs.pdf") !== null, x.t.pfade("Unterlagen/Mathe").join(", "));
  assert.equal(x.t.index().kurse["200"].aktiv, true);
  // hier ausschalten
  assert.equal(await x.m.kursSetzen("100", false), true);
  assert.equal(x.t.index().kurse["100"].aktiv, false);
  x.u.vor(4 * STUNDE); x.il.leeren();
  await lauf(x);
  assert.ok(x.il.geholt().indexOf(B + "kurs/100") < 0);
});

test("Vorhandene Unterordner „Übung“ und Modulordner werden genutzt", async () => {
  const x = aufbau({ ordner: ["Unterlagen/B110 BWL", "Unterlagen/B110 BWL/Übung"] });
  await verbinden(x);
  await lauf(x);
  assert.equal(x.t.index().dateien["1101"].pfad, "Unterlagen/B110 BWL/Übung/B110 Übung 01.pdf");
  assert.equal(x.t.index().dateien["1001"].pfad, "Unterlagen/B110 BWL/B110 Folien 01 Grundlagen.pdf");
});

test("Nie überschreiben: belegter Name → „ (2)“", async () => {
  const x = aufbau({ dateien: { [B110 + "/B110 Folien 01 Grundlagen.md"]: "meine eigene Notiz" } });
  await verbinden(x);
  await lauf(x);
  assert.equal(x.t.text(B110 + "/B110 Folien 01 Grundlagen.md"), "meine eigene Notiz");
  assert.equal(x.t.text(B110 + "/B110 Folien 01 Grundlagen (2).pdf"), "%PDF Folien eins");
  assert.ok(x.t.text(B110 + "/B110 Folien 01 Grundlagen (2).md"));
});

// n Dateien in einem Kurs, Datum aufsteigend (Folien VL1 am 1., …)
const vieleDateien = (n) => {
  const def = standardIlias();
  const viele = [];
  for (let i = 1; i <= n; i++) {
    const id = String(5000 + i);
    viele.push(datei(id, "Folien VL" + i + " Teil", "pdf", "2026-" + String(9 + Math.floor((i - 1) / 28)).padStart(2, "0") + "-" + String(1 + ((i - 1) % 28)).padStart(2, "0") + "T08:00"));
    def.dateien[id] = "%PDF Teil " + i;
  }
  def.kurse = [def.kurse[0]];
  def.seiten[B + "kurs/100"] = viele;
  return def;
};

test("Grenzen je Lauf: Rest im nächsten Lauf (neueste zuerst)", async () => {
  const x = aufbau({ ilias: vieleDateien(30), mobil: true });
  x.abh.grenzen = { neu: 25 };
  await verbinden(x);
  let b = await lauf(x);
  assert.equal(b.neu, 25); assert.equal(b.rest, 5);
  assert.equal(x.il.geladen()[0], "5030", "neueste zuerst");
  assert.equal(x.m.status().rest, 5);
  x.u.vor(4 * STUNDE); x.il.leeren();
  b = await lauf(x);
  assert.equal(b.neu, 5); assert.equal(b.rest, 0);
  assert.deepEqual(x.il.geladen(), ["5005", "5004", "5003", "5002", "5001"]);
});

test("Grenzen je Lauf: erster Abruf meist in einem Lauf (iPhone/iPad 150 Downloads, PC 400)", async () => {
  assert.equal(I.K.NEU_MOBIL, 150); assert.equal(I.K.NEU_PC, 400);
  let x = aufbau({ ilias: vieleDateien(160), mobil: true });
  await verbinden(x);
  let b = await lauf(x);
  assert.equal(b.neu, 150); assert.equal(b.rest, 10);
  x = aufbau({ ilias: vieleDateien(160) });
  await verbinden(x);
  b = await lauf(x);
  assert.equal(b.neu, 160); assert.equal(b.rest, 0);
});

test("Grenzen je Lauf: Seiten-Budget; der große Kurs bleibt offen, die anderen kommen trotzdem dran", async () => {
  const def = { kurse: [{ refId: "100", titel: "B110 Riesig", url: B + "kurs/100" }, { refId: "300", titel: "S100 Klein", url: B + "kurs/300" }], seiten: {}, dateien: { 3001: "%PDF klein" } };
  def.seiten[B + "kurs/100"] = [];
  for (let i = 0; i < I.K.SEITEN + 50; i++) { def.seiten[B + "kurs/100"].push(ordner(String(10000 + i), "Ordner " + i)); def.seiten[B + "ordner/" + (10000 + i)] = []; }
  def.seiten[B + "kurs/300"] = [datei("3001", "Skript", "pdf", "2026-10-12T08:00")];
  const x = aufbau({ ilias: def });
  await verbinden(x);
  let b = await lauf(x);
  assert.equal(b.seiten, I.K.SEITEN, "nie mehr Seiten als das Budget");
  assert.equal(x.il.anzahl("inhalt"), I.K.SEITEN);
  assert.equal(b.neu, 1, "der kleine Kurs wird neben dem großen fertig");
  assert.equal(b.kurseOffen, 1);
  x.u.vor(4 * STUNDE); x.il.leeren();
  b = await lauf(x);
  assert.ok(x.il.geholt().indexOf(B + "kurs/100") >= 0, "der offene Kurs kommt im nächsten Lauf wieder dran");
});

test("Fehler mitten im Lauf: Index bleibt stimmig, nächster Lauf macht weiter", async () => {
  // a) Netz weg beim dritten Download
  let x = aufbau();
  await verbinden(x);
  let n = 0;
  x.il.stoerung.laden = () => (++n === 3 ? new Error("offline") : null);
  let b = await lauf(x);
  assert.equal(b.art, "fehler"); assert.equal(b.neu, 2);
  let idx = x.t.index();
  assert.equal(Object.keys(idx.dateien).length, 2);
  for (const id of Object.keys(idx.dateien)) { assert.ok(x.t.text(idx.dateien[id].pfad)); assert.ok(x.t.text(idx.dateien[id].pfad.replace(/\.[^.]+$/, ".md"))); }
  assert.equal(x.t.pfade("Unterlagen/").length, 4, "nur fertige Dateien mit Notiz");
  assert.ok(x.m.status().fehler);
  x.il.stoerung.laden = null;
  x.u.vor(4 * STUNDE);
  b = await lauf(x);
  assert.equal(b.art, "ok"); assert.equal(b.neu, 3);
  assert.equal(x.t.pfade("Unterlagen/").length, 10, "keine Doppelten");
  assert.equal(x.m.status().fehler, "");
  // b) Notiz lässt sich nicht schreiben → Datei wieder weg, kein Indexeintrag
  x = aufbau();
  await verbinden(x);
  x.t.stoerung = (art, p) => art === "notiz" && /Übung 01/.test(p);
  b = await lauf(x);
  assert.equal(b.art, "fehler");
  assert.equal(x.t.text(B110 + "/B110 Übung 01.pdf"), null);
  assert.equal(x.t.index().dateien["1101"], undefined);
  x.t.stoerung = null;
  x.u.vor(4 * STUNDE);
  b = await lauf(x);
  assert.equal(x.t.index().dateien["1101"].pfad, B110 + "/B110 Übung 01.pdf");
  // c) eine einzelne Datei fehlt (404): überspringen, Rest geht
  x = aufbau();
  await verbinden(x);
  delete x.il.def.dateien["3001"];
  b = await lauf(x);
  assert.equal(b.art, "ok"); assert.equal(b.neu, 4); assert.deepEqual(b.fehlerDateien, ["Skript Analysis.pdf"]);
  // d) Ordner ohne Zugriff (403): überspringen
  x = aufbau();
  await verbinden(x);
  x.il.stoerung.inhalt = (url) => { if (url === B + "ordner/110") { const e = new Error("kein Zugriff"); e.status = 403; return e; } return null; };
  b = await lauf(x);
  assert.equal(b.art, "ok"); assert.equal(b.neu, 4);
  // e) Serverfehler bei einem Ordner: überspringen; bei vielen: Lauf endet
  x = aufbau();
  await verbinden(x);
  x.il.stoerung.inhalt = (url) => { if (url === B + "ordner/110") { const e = new Error("HTTP 500"); e.status = 500; return e; } return null; };
  b = await lauf(x);
  assert.equal(b.art, "ok"); assert.equal(b.jeKurs["100"].ordnerFehler, 1);
  x = aufbau();
  await verbinden(x);
  x.il.stoerung.inhalt = (url) => { if (url !== B + "kurs/100") { const e = new Error("HTTP 500"); e.status = 500; return e; } return null; };
  for (let i = 0; i < 6; i++) { x.il.def.seiten[B + "kurs/100"].push(ordner(String(170 + i), "O" + i)); }
  b = await lauf(x);
  assert.equal(b.art, "fehler"); assert.match(b.fehler, /5 Ordner ließen sich nicht lesen/);
  // viele Ordner ohne Zugriff (fremde Gruppen): kein Abbruch
  x = aufbau();
  await verbinden(x);
  x.il.stoerung.inhalt = (url) => { if (url !== B + "kurs/100" && url !== B + "kurs/300" && url !== B + "ordner/310") { const e = new Error("kein Zugriff"); e.status = 403; return e; } return null; };
  for (let i = 0; i < 6; i++) { x.il.def.seiten[B + "kurs/100"].push(ordner(String(170 + i), "Gruppe " + i)); }
  b = await lauf(x);
  assert.equal(b.art, "ok"); assert.equal(b.jeKurs["100"].ordnerFehler, 7);
  // f) ohne Status (Netz weg beim Ordner): Lauf endet sofort
  x = aufbau();
  await verbinden(x);
  x.il.stoerung.inhalt = (url) => (url === B + "ordner/110" ? new Error("Netzwerkfehler") : null);
  b = await lauf(x);
  assert.equal(b.art, "fehler");
  // g) ilias.json unlesbar (Sync-Konflikt): Lauf endet, nichts überschrieben
  x = aufbau({ dateien: { [I.K.INDEX]: "{ kaputt" } });
  await verbinden(x);
  b = await lauf(x);
  assert.equal(b.art, "fehler"); assert.match(b.fehler, /unlesbar/);
  assert.equal(x.t.text(I.K.INDEX), "{ kaputt");
  assert.deepEqual(x.t.pfade("Unterlagen/"), []);
});

test("Kennwort taucht nirgends auf: Status, Protokoll, Fehler, Bericht, Dateien, Speicher", async () => {
  const kodiert = encodeURIComponent(GEHEIM);
  const pruefen = (x, extra) => {
    const alles = [JSON.stringify(x.m.status()), JSON.stringify(x.m.protokoll()), x.lok.alles(), x.t.alles(), JSON.stringify(x.meldungen), JSON.stringify(x.hoerer)].concat(extra || []).join("\n");
    assert.ok(alles.indexOf(GEHEIM) < 0, "Kennwort gefunden");
    assert.ok(alles.indexOf(kodiert) < 0, "Kennwort (URL-kodiert) gefunden");
  };
  // erfolgreicher Lauf (auch über den Knopf, mit Hinweis)
  let x = aufbau();
  await verbinden(x);
  let b = await x.m.jetztHolen({ manuell: true });
  assert.equal(b.art, "ok");
  pruefen(x, [JSON.stringify(b)]);
  // eine schlecht gebaute Anmeldung wirft mit dem Kennwort im Text; ein Download-Fehler mit dem Kennwort in der Adresse
  const boese = async (s, z) => { throw new Error("POST j_password=" + z.kennwortGeber() + " fehlgeschlagen"); };
  x = aufbau({ anmeldung: boese });
  await verbinden(x);
  b = await x.m.jetztHolen({ manuell: true });
  assert.equal(b.art, "fehler"); assert.match(b.fehler, /•••/);
  pruefen(x, [JSON.stringify(b)]);
  x = aufbau();
  await verbinden(x);
  x.il.stoerung.laden = () => new Error("GET https://ilias.test/x?k=" + kodiert);
  b = await lauf(x);
  assert.equal(b.art, "fehler");
  pruefen(x, [JSON.stringify(b)]);
  // Prüfen beim Speichern scheitert → nichts gespeichert, der Fehlertext enthält das Kennwort nicht
  x = aufbau({ anmeldung: boese });
  const r = await x.m.zugangSpeichern("zxabc01", () => GEHEIM, { pruefen: true });
  assert.equal(r.ok, false); assert.equal(x.geheimnisse.size, 0); assert.equal(x.m.hatZugang(), false);
  pruefen(x, [JSON.stringify(r)]);
  // Kennwort nur im Schlüsselbund, unter dem Namen dieses Tresors
  x = aufbau();
  await verbinden(x);
  assert.deepEqual(Array.from(x.geheimnisse.keys()), [I.geheimIdAus("Test-Tresor")]);
  await x.m.zugangLoeschen();
  assert.equal(x.geheimnisse.size, 0); assert.equal(x.m.hatZugang(), false);
});

test("Anmeldung abgelehnt: keine automatischen Versuche mehr, Knopf versucht es, neuer Zugang hebt es auf", async () => {
  const x = aufbau({ anmeldung: A.anmeldung("anderes Kennwort") });
  await verbinden(x);
  let b = await lauf(x);
  assert.equal(b.art, "zugang"); assert.equal(b.grund, "zugang-falsch");
  let s = x.m.status();
  assert.equal(s.gesperrt, true); assert.equal(s.bereit, false); assert.match(s.text, /stimmt nicht/);
  x.il.leeren();
  b = await lauf(x);
  assert.equal(b.art, "gesperrt"); assert.equal(x.il.log.length, 0);
  b = await x.m.jetztHolen({ manuell: true });
  assert.equal(b.art, "zugang"); assert.equal(x.il.anzahl("anmelden"), 1);
  await x.m.zugangSpeichern("zxabc01", () => GEHEIM);
  s = x.m.status();
  assert.equal(s.gesperrt, false); assert.equal(s.bereit, true);
});

test("Ohne Anmeldung (Baustein fehlt): „folgt später“, kein Lauf", async () => {
  const x = aufbau({ ohneAnmeldung: true });
  await verbinden(x);
  const s = x.m.status();
  assert.equal(s.verbunden, false); assert.equal(s.bereit, false); assert.equal(s.text, I.K.TEXT_ANMELDUNG_FOLGT);
  const b = await lauf(x);
  assert.equal(b.art, "ohne-anmeldung");
  assert.equal(x.il.log.length, 0);
  assert.deepEqual(x.m.protokoll(), []);
});

test("Kursliste ohne Downloads (für die Auswahl beim Verbinden)", async () => {
  const x = aufbau();
  await verbinden(x);
  const k = await x.m.kurseAbrufen();
  assert.equal(k.length, 4);
  assert.equal(x.il.anzahl("laden"), 0); assert.equal(x.il.anzahl("inhalt"), 0);
  assert.equal(x.t.text(I.K.ABRUF), null, "keine Abrufer-Sperre nötig");
});

test("Schlüsselbund-Name je Tresor: stabil, erlaubte Zeichen, höchstens 64", () => {
  const a = I.geheimIdAus("Studium Autopilot"), b = I.geheimIdAus("Studium Autopilot 2");
  for (const id of [a, b, I.geheimIdAus(""), I.geheimIdAus("ä".repeat(500))]) { assert.match(id, /^[a-z0-9-]+$/); assert.ok(id.length <= 64); }
  assert.equal(a, I.geheimIdAus("Studium Autopilot"));
  assert.notEqual(a, b);
  assert.ok(a.indexOf("studium-autopilot-ilias-") === 0);
});

test("Index mischen: je Eintrag gewinnt der neuere", () => {
  const p = { version: 1, kurse: { 1: { aktiv: true, t: "2026-10-16T10:00:00.000Z" } }, dateien: { a: { pfad: "x", t: "2026-10-16T09:00:00.000Z" } }, ignoriert: {} };
  const m = { version: 1, kurse: { 1: { aktiv: false, t: "2026-10-16T08:00:00.000Z" }, 2: { aktiv: true, t: "1" } }, dateien: { a: { pfad: "y", t: "2026-10-16T09:30:00.000Z" } }, ignoriert: {} };
  const r = I.mischen(p, m);
  assert.equal(r.kurse[1].aktiv, true); assert.equal(r.kurse[2].aktiv, true); assert.equal(r.dateien.a.pfad, "y");
});

test("Begleitnotiz: Pflichtfelder auch bei fremdem Notizbauer", () => {
  const t = I.pflichtfelder("---\ntyp: anders\ntags:\n  - x\n---\n\nText\n", { typ: "unterlage", ilias_id: '"7"', uebersicht: '"[[Unterlagen]]"' });
  assert.equal(t, '---\ntyp: unterlage\nilias_id: "7"\nuebersicht: "[[Unterlagen]]"\ntags:\n  - x\n---\n\nText\n');
  assert.match(I.pflichtfelder("ohne Kopf", { typ: "unterlage" }), /^---\ntyp: unterlage\n---\n\nohne Kopf$/);
  const n = I.notizText({ code: "", modul: "", art: "Sonstiges", nr: null, titel: "Info", datei: "Info.pdf", endung: "pdf", groesse: 20 * 1048576,
    original: "Info.pdf", quelle: "ILIAS: Kurs", herkunft: "Kurs / Info_[1].pdf", iliasId: "f9", semester: "WS 2026/27", datum: "2026-10-16" });
  assert.match(n, /^\*\*PDF öffnen:\*\* \[\[Info\.pdf\]\] \(20,0 MB, zu groß zum Einbetten\) · \[Öffnen ↗\]\(obsidian:\/\/studium-autopilot\?aktion=oeffnen\)$/m);
  // seit 19.10.2026: Titel, gleich darunter die Datei; kein Kasten „Eckdaten“, keine leeren Abschnitte, kein Name aus ILIAS im Text
  assert.match(n, /\n# Sonstiges · Info\n\n\*\*PDF öffnen:\*\*/);
  assert.doesNotMatch(n, /Eckdaten|Das Wichtigste|Offene Fragen|^- (\[ \] )?$|aktion=pdf|Info_/m);
});

test("Begleitnotiz: „Neue Fassung aus ILIAS“ über der Datei, auch in Notizen eines älteren Notizbauers", () => {
  const H = "Die Datei in ILIAS hat sich geändert.";
  const neu = "---\ntyp: unterlage\n---\n\n# B110 · Folien 01\n\n> [!eba-pdf]- PDF\n> ![[a.pdf#height=560]]\n";
  assert.equal(I.hinweisEinsetzen(neu, H), "---\ntyp: unterlage\n---\n\n# B110 · Folien 01\n\n> [!eba-info] Neue Fassung aus ILIAS\n> " + H +
    "\n\n> [!eba-pdf]- PDF\n> ![[a.pdf#height=560]]\n");
  const alt = "---\ntyp: unterlage\n---\n\n# T\n\n> [!eba-regel] Eckdaten\n> x\n\n## Das Wichtigste\n- \n";
  assert.match(I.hinweisEinsetzen(alt, H), /> x\n\n> \[!eba-info\] Neue Fassung aus ILIAS\n> .*\n\n## Das Wichtigste\n/, "bis 0.4.6: vor „Das Wichtigste“");
  assert.equal(I.hinweisEinsetzen(neu + "\n> [!eba-info] Neue Fassung aus ILIAS\n> " + H + "\n", H), neu + "\n> [!eba-info] Neue Fassung aus ILIAS\n> " + H + "\n", "schon da");
  assert.equal(I.hinweisEinsetzen(neu, ""), neu);
  assert.match(I.notizText({ code: "B110", art: "Folien", nr: 1, titel: "T", datei: "a.pdf", endung: "pdf", groesse: 10, hinweis: H }),
    /\n# B110 · Folien 01 · T\n\n> \[!eba-info\] Neue Fassung aus ILIAS\n> .*\n\n> \[!eba-pdf\]- PDF\n> !\[\[a\.pdf#height=560\]\]\n$/);
});

// echtes unterlagen.js (pdf.js gibt es unter Node nicht: titelAusPdf liefert dann null)
const echteUnterlagen = () => {
  const eba = laden("eba").ergebnis;
  const obs = { TFile: class {}, TFolder: class {}, Platform: { isMobile: false }, Notice: class {}, loadPdfJs: async () => { throw new Error("kein pdf.js im Test"); } };
  return laden("unterlagen", { kontext: { user: { eba: () => eba }, obsidian: obs } }).ergebnis;
};

test("Einordner aus unterlagen.js: Adapter liefert Art, Nummer und Namen mit Modulcode", async () => {
  const E = I.einordnerAus(echteUnterlagen());
  const v = await E.vorschlag("Vorlesung/Folien_VL03 Kostenrechnung.pdf", "pdf", "B110", null);
  assert.equal(v.art, "Folien"); assert.equal(v.nr, 3);
  assert.match(E.zielName("B110", v.art, v.nr, v.titel), /^B110 Folien 03/);
  // Begleitnotiz: Name in ILIAS nie als Link/„Original öffnen“, ilias_id über extra
  const n = I.pflichtfelder(E.begleitnotiz({ code: "B110", modul: "B110 Einführung", art: "Folien", nr: 3, titel: "Kostenrechnung", datei: "B110 Folien 03 Kostenrechnung.pdf",
    groesse: 2048, semester: "WS 2026/27", quelle: "ILIAS: Kurs", iliasId: "77", original: "Folien_VL03.pdf" }), { original: '"Folien_VL03.pdf"', ilias_id: '"77"' });
  assert.equal(fm(n, "original"), '"Folien_VL03.pdf"'); assert.equal(fm(n, "ilias_id"), '"77"'); assert.equal(fm(n, "nummer"), "3");
  assert.doesNotMatch(n, /Original öffnen|\*\*Original:\*\*/);
  // ohne unterlagen.js: einfacher Rückfall
  const R = I.einordnerAus(null);
  assert.equal(R.zielName("B110", "Sonstiges", null, "Info"), "B110 Sonstiges Info");
  assert.equal(R.begleitnotiz, null);
});

test("Ganzer Lauf mit dem echten unterlagen.js: Namen, Ordner, Notizen, Modul aus dem Dateinamen", async () => {
  const def = standardIlias();
  def.seiten[B + "kurs/100"].push(datei("1401", "S100_Formelsammlung", "pdf", "2026-10-09T08:00"));
  def.dateien["1401"] = "%PDF Formelsammlung";
  const x = aufbau({ ilias: def });
  x.abh.einordner = () => I.einordnerAus(echteUnterlagen());
  await verbinden(x);
  const b = await lauf(x);
  assert.equal(b.art, "ok", b.fehler);
  const idx = x.t.index();
  for (const id of Object.keys(idx.dateien)) {
    const p = idx.dateien[id].pfad, n = x.t.text(p.replace(/\.[^.]+$/, ".md"));
    assert.ok(n, "Notiz zu " + p);
    assert.equal(fm(n, "typ"), "unterlage"); assert.equal(fm(n, "ilias_id"), JSON.stringify(id)); assert.equal(fm(n, "uebersicht"), '"[[Unterlagen]]"');
    assert.equal(fm(n, "original"), JSON.stringify(idx.dateien[id].original));
    assert.doesNotMatch(n, /Original öffnen/);
  }
  assert.match(idx.dateien["1001"].pfad, /^Unterlagen\/B110 Einführung in die Betriebswirtschaftslehre\/B110 Folien 01/);
  // Datei „S100_…“ im B110-Kurs: Modul aus dem Dateinamen (unterlagen.js), weil es S100 als Modul gibt
  assert.match(idx.dateien["1401"].pfad, /^Unterlagen\/S100 Mathematische Methoden\/S100 /);
  assert.equal(fm(x.t.text(idx.dateien["1401"].pfad.replace(/\.pdf$/, ".md")), "code"), '"S100"');
});

test("Anschluss an Netz und HTML: abgelaufene Sitzung → einmal neu anmelden, dann aufgeben", async () => {
  let login = true, anmeldungen = 0;
  const seiten = { kurse: "<kurse>", inhalt: "<inhalt>" };
  const N = {
    UNI: { ilias: "https://ilias.test" },
    sitzung: () => ({ anfrage: async (o) => (o.binaer ? { status: 200, url: o.url, daten: enc("%PDF").buffer, arrayBuffer: enc("%PDF").buffer, typ: "application/pdf" }
      : { status: 200, url: o.url, text: login ? (/membership/.test(o.url) ? seiten.kurse : seiten.inhalt) : "LOGIN" }) }),
    istLoginSeite: (t) => t === "LOGIN",
  };
  const H = {
    kurse: (t) => (t === "<kurse>" ? [{ refId: "1", titel: "B110 X", code: "B110", url: "https://ilias.test/k/1" }] : []),
    inhalt: (t) => (t === "<inhalt>" ? [{ art: "datei", refId: "5", titel: "A", endung: "pdf", url: "https://ilias.test/d/5" }] : []),
    folgeUrl: () => "", seitenArt: () => "ilias", downloadUrl: (e) => e.url, dateiName: (e) => e.titel + "." + e.endung,
  };
  const Q = laden("ilias", { kontext: { user: { "ilias-netz": N, "ilias-html": H } } }).ctx.ilias;
  const anmelden = async () => { anmeldungen++; login = true; };
  const q = await Q.quelleAusNetz({ benutzer: "zxabc01", kennwortGeber: () => "x" }, anmelden);
  assert.equal(anmeldungen, 1);
  assert.equal((await q.kurse()).length, 1);
  login = false; // Sitzung abgelaufen: einmal neu anmelden, dann geht es
  assert.equal((await q.inhalt({ url: "https://ilias.test/o/2" })).length, 1);
  assert.equal(anmeldungen, 2);
  const anmeldenOhneWirkung = async () => { anmeldungen++; };
  const q2 = await Q.quelleAusNetz({ benutzer: "zxabc01", kennwortGeber: () => "x" }, anmeldenOhneWirkung);
  login = false;
  await assert.rejects(q2.inhalt({ url: "https://ilias.test/o/2" }), /abgelaufen/);
  assert.equal(anmeldungen, 4, "nur ein zweiter Versuch");
  login = true;
  const r = await q.laden({ art: "datei", refId: "5", endung: "pdf", url: "https://ilias.test/d/5" });
  assert.equal(new TextDecoder().decode(r.daten), "%PDF");
  // ohne Bausteine: klarer Fehler
  const leer = laden("ilias").ctx.ilias;
  await assert.rejects(leer.quelleAusNetz({}, anmelden), /Baustein fehlt/);
});

test("Mit echtem ilias-netz.js (Transport-Attrappe) und ilias-html.js: Kursseite → Dateien, Sitzungen, Übersprungenes", async () => {
  const fs = require("node:fs"), path = require("node:path");
  const KURS = fs.readFileSync(path.join(__dirname, "daten", "ilias-seiten", "kurs.html"), "utf8");
  const ILIAS = "https://ovidius.uni-tuebingen.de";
  const meine = `<div class="il-std-item"><img src="x/icon_crs.svg" alt="Kurs"><div class="il-item-title"><a href="${ILIAS}/goto.php/crs/1000">B110 Einführung</a></div></div>`;
  const geholt = [];
  const html = { "content-type": "text/html; charset=utf-8" };
  const transport = async (a) => {
    geholt.push(a.url);
    if (/ilmembershipoverviewgui/.test(a.url)) return { status: 200, kopf: html, text: meine };
    if (/goto\.php\/crs\/1000$|ilrepositorygui&ref_id=1000$/.test(a.url)) return { status: 200, kopf: html, text: KURS };
    const m = a.url.match(/cmd=sendfile&ref_id=(\d+)/);
    if (m && a.binaer) return { status: 200, kopf: { "content-type": "application/pdf" }, daten: enc("%PDF Datei " + m[1]).buffer };
    return { status: 200, kopf: html, text: "<html><body><div class=\"il-maincontrols-metabar\"></div></body></html>" }; // leerer Ordner
  };
  const echt = laden("ilias-netz").ergebnis;
  const N = Object.assign({}, echt, { sitzung: (o) => echt.sitzung(Object.assign({}, o, { transport })) });
  const H = laden("ilias-html").ergebnis;
  const Q = laden("ilias", { kontext: { user: { "ilias-netz": N, "ilias-html": H } } }).ctx.ilias;
  const x = aufbau({ quelle: Q.quelleAusNetz, anmeldung: async (s, z) => (s && typeof s.anfrage === "function" && z.kennwortGeber() === GEHEIM ? { ok: true } : { ok: false, grund: "zugang-falsch" }) });
  await verbinden(x);
  const b = await lauf(x);
  assert.equal(b.art, "ok", b.fehler);
  assert.equal(b.neu, 2);
  const idx = x.t.index();
  assert.deepEqual(Object.keys(idx.dateien).sort(), ["2000012", "2000032"]);
  assert.equal(idx.dateien["2000012"].original, "Skript Kapitel 1.pdf");
  assert.equal(idx.dateien["2000012"].geaendert, "2026-10-12T09:31");
  assert.equal(idx.dateien["2000012"].iliasGroesse, 1110000);
  assert.match(idx.dateien["2000032"].iliasPfad, /^B110 Einführung \/ \d{4}-\d{2}-\d{2}, 14:15 - 15:45: Übung 1$/, "Sitzung aufgeklappt (Heute = Testdatum)");
  assert.equal(x.t.text(idx.dateien["2000032"].pfad), "%PDF Datei 2000032");
  // geholt: Kursseite, Ordner, Gruppe, die Sitzung OHNE aufgeklappte Materialien; nicht: Forum, Test, Video, Link, LTI, Medienpool
  const holt = (re) => geholt.some((u) => re.test(u));
  assert.ok(holt(/ref_id=2000011$/) && holt(/ref_id=2000044$/) && holt(/ref_id=2000030/), "Ordner/Gruppe direkt, Sitzung ohne Materialien");
  assert.ok(!holt(/ref_id=2000031\b/), "Sitzung mit aufgeklappten Materialien nicht einzeln");
  assert.ok(!holt(/frm|tst|xvid|2000013|lti|2000043|deliver\.php/), geholt.join("\n"));
});

test("Kalender-Abo für den Uni-Login: Kalender-Seite, Fenster „Kalender abonnieren“, beide Links; Sitzung der Prüfung gilt weiter", async () => {
  const fs = require("node:fs"), path = require("node:path");
  const seite = (n) => fs.readFileSync(path.join(__dirname, "daten", "ilias-seiten", n + ".html"), "utf8");
  const ILIAS = "https://ovidius.uni-tuebingen.de";
  const html = { "content-type": "text/html; charset=utf-8" };
  const geholt = [];
  const transport = async (a) => {
    geholt.push(a.url.replace(ILIAS, ""));
    if (/cmd=jumpToCalendar$/.test(a.url)) return { status: 302, kopf: { location: "/ilias.php?baseClass=ildashboardgui&cmdNode=x1:y2&cmdClass=ilcalendarinboxgui&seed=2026-10-19" } };
    if (/cmdClass=ilcalendarinboxgui/.test(a.url)) return { status: 200, kopf: html, text: seite("kalender") };
    if (/cmd=getModalForSubscription/.test(a.url)) return { status: 200, kopf: html, text: seite("kalender-abo") };
    return { status: 404, kopf: html, text: "" };
  };
  const echt = laden("ilias-netz").ergebnis;
  const N = Object.assign({}, echt, { sitzung: (o) => echt.sitzung(Object.assign({}, o, { transport })) });
  const Q = laden("ilias", { kontext: { user: { "ilias-netz": N, "ilias-html": laden("ilias-html").ergebnis } } }).ctx.ilias;
  let anmeldungen = 0, klappt = true;
  const x = aufbau({ quelle: Q.quelleAusNetz, anmeldung: async (s, z) => { anmeldungen++; return klappt && z.kennwortGeber() === GEHEIM ? { ok: true } : { ok: false, grund: "zugang-falsch", hinweis: "Benutzername oder Passwort falsch." }; } });
  // Ohne Uni-Login auf diesem Gerät geht nichts hinaus
  await assert.rejects(x.m.kalenderLinks(), (e) => e.art === "ohne-zugang");
  assert.equal(geholt.length, 0);
  assert.equal((await x.m.zugangSpeichern("zxabc01", () => GEHEIM, { pruefen: true })).ok, true);
  const basis = ILIAS + "/calendar.php?client_id=pr02&token=Erfunden0Schluessel0fuer0Tests0x&limited=";
  assert.deepEqual(await x.m.kalenderLinks(), [{ url: basis + "0", begrenzt: false }, { url: basis + "1", begrenzt: true }]);
  assert.equal(anmeldungen, 1, "die Sitzung der Prüfung gilt noch: keine zweite Anmeldung");
  assert.deepEqual(geholt, ["/ilias.php?baseClass=ilDashboardGUI&cmd=jumpToCalendar", "/ilias.php?baseClass=ildashboardgui&cmdNode=x1:y2&cmdClass=ilcalendarinboxgui&seed=2026-10-19",
    "/ilias.php?baseClass=ildashboardgui&cmdNode=x1:y2&cmdClass=ilcalendarsubscriptiongui&cmd=getModalForSubscription&category_id=0&seed=2026-11-01&cmdMode=asynch"]);
  // Passwort inzwischen geändert: wie nach einem Lauf gesperrt und vermerkt; danach keine Anmeldung mehr
  Q.sitzungVergessen(); klappt = false;
  await assert.rejects(x.m.kalenderLinks(), (e) => e.art === "zugang" && e.message.indexOf(GEHEIM) < 0);
  assert.equal(x.m.stand().gesperrt, true);
  assert.equal(JSON.parse(x.t.text(I.K.UNI_ZUGANG)).dienst, "ilias");
  const vorher = anmeldungen;
  await assert.rejects(x.m.kalenderLinks(), (e) => e.art === "zugang");
  assert.equal(anmeldungen, vorher);
  // Ohne Knopf „Abonnieren“: klarer Fehler
  const ohne = laden("ilias", { kontext: { user: { "ilias-netz": Object.assign({}, echt, { sitzung: (o) => echt.sitzung(Object.assign({}, o, { transport: async () => ({ status: 200, kopf: html, text: seite("dashboard") }) })) }), "ilias-html": laden("ilias-html").ergebnis } } }).ctx.ilias;
  const q = await ohne.quelleAusNetz({ benutzer: "zxabc01", kennwortGeber: () => GEHEIM }, async () => {});
  await assert.rejects(q.kalenderAbo(), (e) => e.art === "kalender");
});

test("Automatische Läufe: Kurs höchstens alle 3 Std. durchsuchen, der Knopf immer", async () => {
  const x = aufbau();
  await verbinden(x);
  await lauf(x);
  x.u.vor(1 * STUNDE); x.il.leeren();
  let b = await lauf(x);
  assert.equal(b.art, "unveraendert");
  assert.deepEqual(x.il.geholt(), [], "vor kurzem durchsucht");
  b = await x.m.jetztHolen({ manuell: true });
  assert.ok(x.il.geholt().indexOf(B + "kurs/100") >= 0, "Knopf: alle Kurse");
  x.u.vor(3 * STUNDE + 60e3); x.il.leeren();
  await lauf(x);
  assert.ok(x.il.geholt().indexOf(B + "kurs/100") >= 0, "nach der Pause wieder");
});

test("Sitzungen: weiter als 7 Tage voraus nicht holen; Ordnername wie in ILIAS an den Einordner", async () => {
  const def = standardIlias();
  const sitzung = (refId, datum, titel) => ({ art: "sitzung", typ: "sess", refId, titel, url: B + "sitzung/" + refId, sitzung: { datum, name: datum + ", 10:15 - 11:45: " + titel } });
  def.seiten[B + "kurs/100"] = [sitzung("150", "2026-10-12", "Vorlesung 1"), sitzung("151", "2026-10-22", "Vorlesung 2"), sitzung("152", "2026-11-30", "Vorlesung 8")];
  def.seiten[B + "sitzung/150"] = [datei("1501", "EBWL_1", "pdf", "2026-10-12T08:00")];
  def.seiten[B + "sitzung/151"] = [];
  def.dateien["1501"] = "%PDF EBWL 1";
  const x = aufbau({ ilias: def });
  const rels = [];
  const E = Object.assign({}, A.EINORDNER, { vorschlag: (rel, endung, code) => { rels.push(rel); return A.EINORDNER.vorschlag(rel, endung, code); } });
  x.abh.einordner = () => E;
  await verbinden(x);
  const b = await lauf(x);
  assert.ok(x.il.geholt().indexOf(B + "sitzung/151") >= 0, "in 6 Tagen: geholt");
  assert.ok(x.il.geholt().indexOf(B + "sitzung/152") < 0, "in 6 Wochen: nicht geholt");
  assert.equal(b.jeKurs["100"].spaeter, 1);
  assert.ok(rels.indexOf("2026-10-12, 10:15 - 11:45: Vorlesung 1/EBWL_1.pdf") >= 0, rels.join(" | "));
  assert.equal(x.t.index().dateien["1501"].iliasPfad, "B110 Einführung in die BWL / 2026-10-12, 10:15 - 11:45: Vorlesung 1");
});

test("Anschluss: Permalink direkt als Repository-Adresse, relative Links ohne End-URL (iPhone) gegen die ILIAS-Wurzel", async () => {
  const geholt = [], basen = [];
  const N = {
    UNI: { ilias: "https://ovidius.uni-tuebingen.de" },
    sitzung: () => ({ anfrage: async (o) => { geholt.push(o.url); return { status: 200, url: null, text: "<seite>" }; } }),
    istLoginSeite: () => false,
  };
  const H = { kurse: (t, u) => { basen.push(u); return []; }, inhalt: (t, u) => { basen.push(u); return []; }, folgeUrl: () => "", seitenArt: () => "ilias", downloadUrl: (e) => e.url, dateiName: (e) => e.titel };
  const Q = laden("ilias", { kontext: { user: { "ilias-netz": N, "ilias-html": H } } }).ctx.ilias;
  const q = await Q.quelleAusNetz({ benutzer: "zxabc01", kennwortGeber: () => "x" }, async () => {});
  await q.inhalt({ url: "https://ovidius.uni-tuebingen.de/goto.php/fold/123" });
  await q.inhalt({ url: "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ilrepositorygui&cmd=infoScreen&ref_id=7" });
  await q.inhalt({ url: "https://andere.example/goto.php/fold/5" });
  assert.deepEqual(geholt, ["https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ilrepositorygui&ref_id=123",
    "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ilrepositorygui&cmd=infoScreen&ref_id=7", "https://andere.example/goto.php/fold/5"]);
  assert.deepEqual(basen, ["https://ovidius.uni-tuebingen.de/ilias.php", "https://ovidius.uni-tuebingen.de/ilias.php", "https://ovidius.uni-tuebingen.de/ilias.php"]);
});

test("Zugleich: zwei Seiten, am PC zwei Downloads, auf iPhone/iPad einer; geladen wird nach dem Durchsuchen", async () => {
  const tick = () => new Promise((r) => setImmediate(r));
  for (const mobil of [false, true]) {
    const z = { seiten: 0, dateien: 0, maxSeiten: 0, maxDateien: 0, gemischt: 0, optionen: [] };
    const x = aufbau({ mobil, quelle: async (zugang, anmelden, optionen) => {
      z.optionen.push(optionen);
      const q = await x.il.quelle(zugang, anmelden);
      const inhalt = q.inhalt, laden = q.laden;
      q.inhalt = async (k) => { z.seiten++; z.maxSeiten = Math.max(z.maxSeiten, z.seiten); if (z.dateien) z.gemischt++; await tick(); await tick(); z.seiten--; return inhalt(k); };
      q.laden = async (e) => { z.dateien++; z.maxDateien = Math.max(z.maxDateien, z.dateien); if (z.seiten) z.gemischt++; await tick(); await tick(); z.dateien--; return laden(e); };
      return q;
    } });
    await verbinden(x);
    const b = await lauf(x);
    assert.equal(b.art, "ok", b.fehler); assert.equal(b.neu, 5);
    assert.equal(z.maxSeiten, I.K.SUCHER, "Seiten zugleich");
    assert.equal(z.maxDateien, mobil ? I.K.LADER_MOBIL : I.K.LADER_PC, "Downloads zugleich");
    assert.equal(z.gemischt, 0, "erst durchsuchen, dann laden");
    assert.deepEqual(z.optionen, [{ wiederverwenden: true }], "der Lauf nimmt die Sitzung des letzten Laufs");
    assert.equal(x.t.pfade("Unterlagen/").length, 10, "jede Datei einmal, mit Notiz");
  }
});

test("Nicht geholt: Sitzungen ohne Materialien und Gruppen, in denen du nicht Mitglied bist", async () => {
  const def = standardIlias();
  const sitzung = (refId, eigenschaften) => ({ art: "sitzung", typ: "sess", refId, titel: "Sitzung " + refId, url: B + "sitzung/" + refId, eigenschaften,
    sitzung: { datum: "2026-10-14", name: "2026-10-14, 10:15 - 11:45: Sitzung " + refId } });
  const gruppe = (refId, mitglied) => ({ art: "ordner", typ: "grp", refId, titel: "Übung Gruppe " + refId, url: B + "gruppe/" + refId, mitglied });
  def.seiten[B + "kurs/100"] = def.seiten[B + "kurs/100"].concat([sitzung("160", []), sitzung("161", ["Materialien zur Sitzung: 1"]), sitzung("162"),
    gruppe("170", false), gruppe("171", true), gruppe("172", null)]);
  def.seiten[B + "sitzung/161"] = [datei("1611", "Folien VL03", "pdf", "2026-10-14T09:00")];
  def.seiten[B + "sitzung/162"] = [];
  def.seiten[B + "gruppe/171"] = [];
  def.seiten[B + "gruppe/172"] = [];
  def.dateien["1611"] = "%PDF drei";
  const x = aufbau({ ilias: def });
  await verbinden(x);
  const b = await lauf(x);
  const geholt = x.il.geholt();
  for (const u of ["sitzung/161", "sitzung/162", "gruppe/171", "gruppe/172"]) assert.ok(geholt.indexOf(B + u) >= 0, u + " geholt");
  for (const u of ["sitzung/160", "gruppe/170"]) assert.ok(geholt.indexOf(B + u) < 0, u + " nicht geholt");
  assert.equal(b.jeKurs["100"].ohneMaterial, 1); assert.equal(b.jeKurs["100"].fremdeGruppe, 1);
  assert.ok(x.t.index().dateien["1611"], "Material der Sitzung geladen");
});

test("Anschluss: Sitzung des letzten Laufs wiederverwenden; gleichzeitig abgemeldet → eine Anmeldung", async () => {
  let gueltig = false, sitzungen = 0, anmeldungen = 0;
  const tick = () => new Promise((r) => setImmediate(r));
  const N = {
    UNI: { ilias: "https://ilias.test" },
    drossel: () => ({ eintritt: async () => () => {} }),
    sitzung: (o) => {
      sitzungen++;
      assert.ok(o && o.drossel && typeof o.drossel.eintritt === "function", "Sitzung mit Drossel");
      return { anfrage: async (a) => { await tick(); return { status: 200, url: a.url, text: gueltig ? "<seite>" : "LOGIN" }; } };
    },
    istLoginSeite: (t) => t === "LOGIN",
  };
  const H = { kurse: () => [], inhalt: () => [], folgeUrl: () => "", seitenArt: () => "ilias", downloadUrl: (e) => e.url, dateiName: (e) => e.titel };
  const Q = laden("ilias", { kontext: { user: { "ilias-netz": N, "ilias-html": H } } }).ctx.ilias;
  let klappt = true;
  const anmelden = async () => { anmeldungen++; await tick(); if (!klappt) throw new Error("abgelehnt"); gueltig = true; };
  const z = { benutzer: "zxabc01", kennwortGeber: () => "x" };
  let q = await Q.quelleAusNetz(z, anmelden, { wiederverwenden: true });
  assert.deepEqual([sitzungen, anmeldungen], [1, 1], "erster Lauf: neue Sitzung, gleich angemeldet");
  await q.kurse();
  q = await Q.quelleAusNetz(z, anmelden, { wiederverwenden: true });
  await q.kurse();
  assert.deepEqual([sitzungen, anmeldungen], [1, 1], "zweiter Lauf: dieselbe Sitzung, keine Anmeldung");
  gueltig = false;
  q = await Q.quelleAusNetz(z, anmelden, { wiederverwenden: true });
  const listen = await Promise.all([q.inhalt({ url: "https://ilias.test/o/1" }), q.inhalt({ url: "https://ilias.test/o/2" }), q.kurse()]);
  assert.equal(listen.length, 3);
  assert.deepEqual([sitzungen, anmeldungen], [1, 2], "abgelaufen, drei Seiten zugleich: eine Anmeldung");
  await Q.quelleAusNetz({ benutzer: "zxabc02", kennwortGeber: () => "y" }, anmelden, { wiederverwenden: true });
  assert.deepEqual([sitzungen, anmeldungen], [2, 3], "anderer Benutzer: neue Sitzung");
  await Q.quelleAusNetz(z, anmelden);
  assert.deepEqual([sitzungen, anmeldungen], [3, 4], "ohne wiederverwenden (Prüfen beim Verbinden): neu angemeldet");
  Q.sitzungVergessen();
  await Q.quelleAusNetz(z, anmelden, { wiederverwenden: true });
  assert.deepEqual([sitzungen, anmeldungen], [4, 5], "nach dem Trennen: neue Sitzung");
  // gemerkte Sitzung abgelaufen und die Anmeldung scheitert: Fehler, und die Sitzung ist vergessen
  gueltig = false; klappt = false;
  q = await Q.quelleAusNetz(z, anmelden, { wiederverwenden: true });
  await assert.rejects(q.kurse(), /abgelehnt/);
  klappt = true;
  await Q.quelleAusNetz(z, anmelden, { wiederverwenden: true });
  assert.equal(sitzungen, 5, "nach gescheiterter Anmeldung neue Sitzung");
});

test("Anschluss: Ordner und Kurse über die Vorlage aus dem Reiter „Inhalt“, ohne Weiterleitung; passt sie nicht, Permalink", async () => {
  const W = "https://ovidius.uni-tuebingen.de";
  const geholt = [];
  let kaputt = false;
  const refVon = (url) => (/goto\.php\/[a-z]+\/(\d+)/.exec(url) || /ref_id=(\d+)/.exec(url) || [])[1];
  const N = {
    UNI: { ilias: W },
    sitzung: () => ({ anfrage: async (o) => {
      geholt.push(o.url.replace(W, ""));
      if (kaputt && /cmdNode/.test(o.url)) return { status: 500, url: null, text: "Fehler" };
      return { status: 200, url: null, text: "<seite ref=" + refVon(o.url) + ">" };
    } }),
    istLoginSeite: () => false,
  };
  const reiter = { 1: "yt:of&cmdClass=ilObjFolderGUI", 3: "yt:ni&cmdClass=ilObjCourseGUI" };
  const H = {
    inhalt: () => [], folgeUrl: () => "", seitenArt: (t) => (/ref=9/.test(t) ? "kein-zugriff" : "ilias"), downloadUrl: (e) => e.url, dateiName: (e) => e.titel,
    // Reiter „Inhalt“: Ordner (ref 1xx) und Kurse (3xx) haben einen, die Beitrittsseite einer Gruppe (2xx) nicht
    inhaltReiter: (t) => { const ref = /ref=(\d+)/.exec(t)[1]; return reiter[ref[0]] ? W + "/ilias.php?baseClass=ilrepositorygui&cmdNode=" + reiter[ref[0]] + "&cmd=view&ref_id=" + ref : ""; },
  };
  const Q = laden("ilias", { kontext: { user: { "ilias-netz": N, "ilias-html": H } } }).ctx.ilias;
  const q = await Q.quelleAusNetz({ benutzer: "zxabc01", kennwortGeber: () => "x" }, async () => {});
  for (const u of ["fold/101", "fold/102", "crs/301", "crs/302", "grp/201", "grp/202", "copa/401"]) await q.inhalt({ url: W + "/goto.php/" + u });
  assert.deepEqual(geholt, [
    "/ilias.php?baseClass=ilrepositorygui&ref_id=101", "/ilias.php?baseClass=ilrepositorygui&cmdNode=yt:of&cmdClass=ilObjFolderGUI&cmd=view&ref_id=102",
    "/ilias.php?baseClass=ilrepositorygui&ref_id=301", "/ilias.php?baseClass=ilrepositorygui&cmdNode=yt:ni&cmdClass=ilObjCourseGUI&cmd=view&ref_id=302",
    "/ilias.php?baseClass=ilrepositorygui&ref_id=201", "/ilias.php?baseClass=ilrepositorygui&ref_id=202", "/goto.php/copa/401",
  ]);
  // kein Zugriff über die Vorlage und über den Permalink: echtes „kein Zugriff“, die Vorlage bleibt
  geholt.length = 0;
  await assert.rejects(q.inhalt({ url: W + "/goto.php/fold/901" }), (e) => e.status === 403);
  await q.inhalt({ url: W + "/goto.php/fold/105" });
  assert.deepEqual(geholt, ["/ilias.php?baseClass=ilrepositorygui&cmdNode=yt:of&cmdClass=ilObjFolderGUI&cmd=view&ref_id=901",
    "/ilias.php?baseClass=ilrepositorygui&ref_id=901", "/ilias.php?baseClass=ilrepositorygui&cmdNode=yt:of&cmdClass=ilObjFolderGUI&cmd=view&ref_id=105"]);
  // Vorlage passt nicht mehr (Serverfehler): einmal über den Permalink, danach in dieser Sitzung ohne Vorlage
  geholt.length = 0; kaputt = true;
  await q.inhalt({ url: W + "/goto.php/fold/103" });
  await q.inhalt({ url: W + "/goto.php/fold/104" });
  assert.deepEqual(geholt, ["/ilias.php?baseClass=ilrepositorygui&cmdNode=yt:of&cmdClass=ilObjFolderGUI&cmd=view&ref_id=103",
    "/ilias.php?baseClass=ilrepositorygui&ref_id=103", "/ilias.php?baseClass=ilrepositorygui&ref_id=104"]);
});

test("Oberfläche: status().anderes nur, wenn ein anderes Gerät lädt", async () => {
  const frisch = JSON.stringify({ geraet: "g-anderes", seit: "2026-10-15T08:00:00.000Z", zuletzt: "2026-10-16T07:50:00.000Z" });
  let x = aufbau({ dateien: { [I.K.ABRUF]: frisch } });
  await verbinden(x);
  await lauf(x);
  assert.equal(x.m.status().anderes, true);
  await x.m.jetztHolen({ manuell: true, uebernehmen: true });
  assert.equal(x.m.status().anderes, false, "nach „Hier laden“ lädt dieses Gerät");
  x = aufbau();
  await verbinden(x);
  await lauf(x);
  assert.equal(x.m.status().anderes, false);
});

test("Testeinstiege in Obsidian: anmeldungSetzen und quelleSetzen ersetzen Anmeldung und ILIAS (ohne Netz)", async () => {
  const r = laden("ilias");
  const il = r.ctx.ilias;
  const app = r.ctx.app, speicher = new Map(), geheim = new Map();
  app.loadLocalStorage = (k) => (speicher.has(k) ? speicher.get(k) : null);
  app.saveLocalStorage = (k, v) => { if (v == null) speicher.delete(k); else speicher.set(k, v); };
  app.secretStorage = { getSecret: (k) => geheim.get(k) || null, setSecret: async (k, v) => { geheim.set(k, v); } };
  assert.equal(typeof il.quelleSetzen, "function");
  const falsch = A.ilias(standardIlias(), A.uhr("2026-10-16T08:00:00.000Z"));
  il.anmeldungSetzen(A.anmeldung(GEHEIM));
  il.quelleSetzen(falsch.quelle);
  let e = await il.zugangSpeichern("zxabc01", () => "falsch", { pruefen: true });
  assert.equal(e.ok, false); assert.match(e.fehler, /stimmt nicht/);
  assert.equal(falsch.anzahl("anmelden"), 1, "eingesetzte Quelle genutzt");
  assert.equal(geheim.size, 0, "nichts gespeichert");
  e = await il.zugangSpeichern("zxabc01", () => GEHEIM, { pruefen: true });
  assert.equal(e.ok, true, e.fehler);
  assert.equal(geheim.size, 1);
  assert.equal(il.status().benutzer, "zxabc01");
  // null = wieder echt: ohne Netz scheitert die Prüfung, die Attrappe wird nicht mehr gefragt
  il.quelleSetzen(null);
  falsch.leeren();
  e = await il.zugangSpeichern("zxabc01", () => GEHEIM, { pruefen: true });
  assert.equal(e.ok, false);
  assert.equal(falsch.anzahl("anmelden"), 0);
});

// ---------- Uni-Zugang (seit 0.4.5): synchronisierter Ablehnungs-Marker, gerätelokal seit/ok ----------

test("Uni-Zugang: abgelehntes Passwort setzt den Marker; ein Gerät mit altem Passwort versucht nichts, auch nicht per Knopf", async () => {
  // Gerät 2 hat sein Passwort einen Tag früher gespeichert und einmal erfolgreich gelesen
  const y = aufbau({ start: "2026-10-15T08:00:00.000Z", anmeldung: A.anmeldung(GEHEIM), geraet: "g-zwei" });
  await verbinden(y);
  assert.deepEqual([y.m.uniZugang().bestaetigt, y.m.uniZugang().ok], [false, ""], "ohne prüfende Anmeldung noch nicht bestätigt");
  assert.equal((await lauf(y)).art, "ok");
  assert.equal(y.m.uniZugang().bestaetigt, true, "ein erfolgreicher Lauf bestätigt das Passwort");
  // Die Uni hat das Passwort geändert: Gerät 1 scheitert einmal und schreibt den Marker (ohne Benutzername, ohne Passwort)
  const x = aufbau({ anmeldung: A.anmeldung("neues-Kw-1") });
  await verbinden(x);
  const b = await lauf(x);
  assert.equal(b.art, "zugang");
  const marker = JSON.parse(x.t.text(I.K.UNI_ZUGANG));
  assert.deepEqual(Object.keys(marker).sort(), ["abgelehnt", "dienst", "geraet"]);
  assert.equal(marker.dienst, "ilias");
  assert.ok(x.t.text(I.K.UNI_ZUGANG).indexOf("zxabc01") < 0 && x.t.text(I.K.UNI_ZUGANG).indexOf(GEHEIM) < 0);
  assert.equal(x.m.status().text, "Benutzername oder Kennwort stimmt nicht.", "das Gerät selbst nennt seinen Fehler");
  assert.equal(x.m.status().gesperrt, true);
  // Der Marker kommt per Sync auf Gerät 2: kein Versuch mehr, auch nicht per Knopf
  y.u.vor(2 * 24 * STUNDE);
  y.t.setzen(I.K.UNI_ZUGANG, x.t.text(I.K.UNI_ZUGANG));
  await y.m.markerLesen();
  const vorher = y.anm.aufrufe;
  assert.equal(y.m.bereit(), false);
  assert.equal(y.m.uniZugang().gesperrt, true);
  assert.equal(y.m.uniZugang().bestaetigt, false);
  const k = await y.m.jetztHolen({ manuell: true });
  assert.equal(k.art, "abgelehnt");
  assert.deepEqual(y.meldungen, [I.K.TEXT_ABGELEHNT]);
  assert.equal(y.anm.aufrufe, vorher, "keine Anmeldung");
  // Neu eingeben: genau eine prüfende Anmeldung; danach frei und bestätigt
  const neu = aufbau({ start: "2026-10-17T09:00:00.000Z", anmeldung: A.anmeldung("neues-Kw-1"), geraet: "g-zwei" });
  neu.t.setzen(I.K.UNI_ZUGANG, x.t.text(I.K.UNI_ZUGANG));
  await neu.m.markerLesen();
  const r = await neu.m.zugangSpeichern("zxabc01", () => "neues-Kw-1", { pruefen: true });
  assert.equal(r.ok, true);
  assert.equal(neu.anm.aufrufe, 1);
  assert.equal(neu.m.uniZugang().gesperrt, false);
  assert.equal(neu.m.uniZugang().bestaetigt, true);
  assert.equal(neu.m.bereit(), true);
});

test("Uni-Zugang: falsch getipptes Passwort im Fenster schreibt keinen Marker; Trennen vergisst seit/ok", async () => {
  const x = aufbau();
  const r = await x.m.zugangSpeichern("zxabc01", () => "vertippt", { pruefen: true });
  assert.equal(r.ok, false);
  assert.equal(x.t.text(I.K.UNI_ZUGANG), null);
  await verbinden(x);
  assert.notEqual(x.m.uniZugang().seit, "");
  await x.m.zugangLoeschen();
  assert.deepEqual([x.m.uniZugang().seit, x.m.uniZugang().ok, x.m.uniZugang().bestaetigt], ["", "", false]);
  assert.equal(x.lok.alles().indexOf(GEHEIM), -1);
});

test("Uni-Zugang: unlesbarer oder leerer Marker sperrt nichts; ein älterer Marker als das Passwort auch nicht", async () => {
  for (const inhalt of ["{ kaputt", "{}", JSON.stringify({ abgelehnt: "2026-10-01T08:00:00.000Z", dienst: "alma", geraet: "g-x" })]) {
    const x = aufbau({ dateien: { [I.K.UNI_ZUGANG]: inhalt } });
    await verbinden(x);
    await x.m.markerLesen();
    assert.equal(x.m.uniZugang().gesperrt, false, inhalt);
    assert.equal((await lauf(x)).art, "ok", inhalt);
  }
});

test("kurseAbrufen({ alleAus }): neue Kurse sind aus, kein Download (Verbinden aus der Zeile „Noten & Anmeldungen“)", async () => {
  const x = aufbau();
  await verbinden(x);
  const l = await x.m.kurseAbrufen({ alleAus: true });
  assert.equal(l.length, 4);
  assert.ok(l.every((k) => !k.aktiv));
  assert.equal(x.il.anzahl("laden"), 0);
  const y = aufbau();
  await verbinden(y);
  assert.deepEqual((await y.m.kurseAbrufen()).filter((k) => k.aktiv).map((k) => k.code).sort(), ["B110", "S100"], "ohne alleAus wie bisher");
});
