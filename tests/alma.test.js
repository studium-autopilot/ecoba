// Alma-Stundenplan (alma.js): von Hand angelegte Notizen löscht Alma nie, und ein Link, dessen erster Abruf scheitert,
// bleibt nicht gespeichert. Tresor im Speicher, nur ausgedachte Daten. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { laden } = require("./laden.js");

const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));

const MODULCODE = "[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?";
const SEM = "WS 2026/27";

// Kleiner Tresor: Frontmatter und Text je Pfad, dazu Papierkorb, angelegte Dateien, gerätelokaler Speicher und (mit dateien)
// weitere Dateien wie die Sperre. Neue Notizen bekommen ihr Frontmatter aus dem Text (einfache Felder und Listen).
// sperre: true → vault.read/modify/process und Geräte-ID, damit Sperre und Grabsteine laufen; ohneBibliotheken: wie in der Hülle
// eines eigenen Uni-Abgleichs (kein ctx.user.sperre/quellen)
const fmAusText = (t) => {
  const m = String(t).match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  let k = null;
  for (const z of m ? m[1].split("\n") : []) {
    const l = z.match(/^\s+- (.*)$/);
    if (l && k) { fm[k].push(l[1]); continue; }
    const e = z.match(/^([a-z_]+):(?: (.*))?$/);
    if (!e) continue;
    k = e[1];
    const v = e[2] == null ? "" : e[2];
    fm[k] = v === "" || v === "[]" ? [] : /^".*"$/.test(v) ? JSON.parse(v) : /^-?\d+$/.test(v) ? Number(v) : v === "true" ? true : v === "false" ? false : v;
  }
  return fm;
};
function tresor({ testAbruf, prompt, eba = {}, sperre = false, ohneBibliotheken = false, heute, zeitgeber, uni } = {}) {
  const fm = {}, text = {}, papierkorb = [], speicher = {}, dateien = {};
  const L = laden("alma", {
    frontmatter: fm,
    heute,
    kontext: {
      user: { eba: Object.assign({ MODULCODE }, eba), "uni-login": uni ? () => uni : undefined },
      modell: { semesterVon: () => ({ name: SEM }) },
      plugin: { testAbruf },
      system: { prompt: prompt || (async () => null) },
      ...(zeitgeber ? { zeit: zeitgeber.zeit, stopp: zeitgeber.stopp } : {}),
    },
  });
  if (ohneBibliotheken) { delete L.ctx.user.sperre; delete L.ctx.user.quellen; }
  const app = L.ctx.app;
  const datei = (p) => ({ path: p, basename: p.split("/").pop().replace(/\.md$/, "") });
  app.vault.getMarkdownFiles = () => Object.keys(fm).map(datei);
  app.vault.getAbstractFileByPath = (p) => (p === "Stundenplan" || fm[p] || p in dateien ? datei(p) : null);
  app.vault.cachedRead = async (f) => text[f.path] || "";
  app.vault.create = async (p, t) => { if (p.endsWith(".md")) { text[p] = t; fm[p] = fmAusText(t); } else dateien[p] = t; return datei(p); };
  app.vault.createFolder = async () => {};
  app.vault.trash = async (f) => { papierkorb.push(f.path); delete fm[f.path]; delete text[f.path]; };
  if (sperre) {
    app.vault.read = async (f) => (f.path in dateien ? dateien[f.path] : text[f.path] || "");
    app.vault.modify = async (f, t) => { if (f.path in dateien) dateien[f.path] = t; else text[f.path] = t; };
    app.vault.process = async (f, fn) => { text[f.path] = fn(text[f.path] || ""); };
    speicher["eba-geraet"] = "g-ich";
  }
  app.fileManager = { processFrontMatter: async (f, fn) => fn(fm[f.path]) };
  app.loadLocalStorage = (k) => (k in speicher ? speicher[k] : null);
  app.saveLocalStorage = (k, v) => { if (v == null) delete speicher[k]; else speicher[k] = v; };
  return { A: L.ergebnis, ctx: L.ctx, fm, text, papierkorb, speicher, dateien };
}

const ereignis = (uid, titel, start, ende, raum) => [
  "BEGIN:VEVENT", "UID:" + uid, "SUMMARY:" + titel, "DTSTART:" + start, "DTEND:" + ende, "RRULE:FREQ=WEEKLY;COUNT=3", ...(raum ? ["LOCATION:" + raum] : []), "END:VEVENT",
].join("\n");
const kalender = (...e) => ["BEGIN:VCALENDAR", ...e, "END:VCALENDAR"].join("\n");
const B110 = ereignis("1", "B110 Einführung in die BWL Vorlesung", "20261019T100000", "20261019T120000"); // Mo
const B130 = ereignis("2", "B130 Internes Rechnungswesen Übung", "20261020T140000", "20261020T160000");     // Di
const S100 = ereignis("3", "S100 Mathematik Vorlesung", "20261021T080000", "20261021T100000");             // Mi
const ALMA_KASTEN = "> [!info]- Aus Alma\n> B130 Internes Rechnungswesen Übung\n\n";

test("Wegfall in Alma: deine Notiz bleibt verknüpft und meldet sich in „Bitte prüfen“, Alma-Notiz unberührt in den Papierkorb", async () => {
  const t = tresor();
  const hand = "Stundenplan/Mo 10.15 B110 Vorlesung.md";
  t.fm[hand] = { typ: "lehrveranstaltung", code: "B110", art: "Vorlesung", wochentag: 1, beginn: "10:15", ende: "11:45", semester: SEM, titel: "BWL · Vorlesung" };
  t.text[hand] = "---\n---\n\n# B110 · Vorlesung\n\nMeine eigenen Notizen.\n";
  const alma = "Stundenplan/Di 14.00 B130 Übung.md";
  t.fm[alma] = { typ: "lehrveranstaltung", code: "B130", art: "Übung", wochentag: 2, beginn: "14:00", ende: "16:00", semester: SEM,
    quelle: "alma", alma_schluessel: `${SEM}|B130 Internes Rechnungswesen Übung|2|14:00|16:00` };
  t.text[alma] = "---\n---\n\n# B130 · Übung\n\n" + ALMA_KASTEN + "## Notizen\n- \n";

  // 1. Abruf: Alma übernimmt die Hand-Notiz (c.t. bleibt, keine Besitzmarke), die alte Alma-Notiz bekommt herkunft: alma
  const b1 = await t.A.aktualisieren({ text: kalender(B110, B130), still: true });
  assert.deepEqual([b1.neu, b1.entfernt], [0, 0]);
  assert.equal(t.fm[hand].quelle, "alma");
  assert.ok(t.fm[hand].alma_schluessel);
  assert.equal(t.fm[hand].herkunft, undefined, "deine Notiz bleibt deine");
  assert.deepEqual([t.fm[hand].beginn, t.fm[hand].ende], ["10:15", "11:45"]);
  assert.equal(t.fm[alma].herkunft, "alma", "Besitzmarke nachgetragen");

  // 2. Abruf: B110 und B130 fehlen in Alma (gleiches Semester geliefert)
  const b2 = await t.A.aktualisieren({ text: kalender(S100), still: true });
  assert.deepEqual([b2.neu, b2.entfernt, b2.fehlt], [1, 1, 1]);
  assert.deepEqual(t.papierkorb, [alma], "Alma-Notiz ohne deinen Text");
  assert.ok(t.fm[hand].alma_schluessel, "nie entkoppelt");
  assert.equal(t.fm[hand].alma_fehlt, "2026-10-15");
  assert.deepEqual(t.A.hinweise().map((x) => x.pfad), [hand]);
  assert.match(t.A.hinweise()[0].text, /^\*\*Stundenplan\*\* · BWL · Vorlesung steht nicht mehr in Alma/);
  assert.deepEqual(t.A.status().warnungen, ["Eine deiner Stundenplan-Notizen steht nicht mehr in Alma."]);

  // 3. Abruf: nichts Neues; kommt B110 zurück, ist der Punkt weg
  const b3 = await t.A.aktualisieren({ text: kalender(S100), still: true });
  assert.deepEqual([b3.entfernt, b3.fehlt], [0, 1]);
  await t.A.aktualisieren({ text: kalender(S100, B110), still: true });
  assert.equal(t.fm[hand].alma_fehlt, undefined);
  assert.deepEqual(t.A.hinweise(), []);
});

test("Wegfall in Alma: Alma-Notiz mit deinem Text wird „(entfällt)“ und ist wieder normal, wenn sie zurückkommt", async () => {
  const t = tresor({ sperre: true });
  await t.A.aktualisieren({ text: kalender(B130, S100), still: true });
  const p = Object.keys(t.fm).find((x) => /B130/.test(x));
  assert.equal(t.fm[p].herkunft, "alma");
  t.text[p] = t.text[p].replace("## Meine Notizen\n- \n", "## Meine Notizen\n- Tutor fragt nach Blatt 2\n");
  const b = await t.A.aktualisieren({ text: kalender(S100), still: true });
  assert.deepEqual([b.entfaellt, b.entfernt], [1, 0]);
  assert.equal(t.fm[p].entfaellt, true);
  assert.match(t.fm[p].titel, / \(entfällt\)$/);
  assert.match(t.text[p], /^# B130 · Übung \(entfällt\)$/m);
  assert.match(t.text[p], /Tutor fragt nach Blatt 2/);
  await t.A.aktualisieren({ text: kalender(S100), still: true });
  assert.ok(t.fm[p], "bleibt stehen");
  await t.A.aktualisieren({ text: kalender(B130, S100), still: true });
  assert.equal(t.fm[p].entfaellt, undefined);
  assert.doesNotMatch(t.fm[p].titel, /entfällt/);
  assert.match(t.text[p], /^# B130 · Übung$/m);
});

test("Von dir gelöscht: Alma-Notiz kommt nicht wieder, bis sich der Termin in Alma ändert (Grabstein in der Sperr-Datei)", async () => {
  const t = tresor({ sperre: true });
  await t.A.aktualisieren({ text: kalender(B130), still: true });
  const p = Object.keys(t.fm).find((x) => /B130/.test(x));
  const s = JSON.parse(t.dateien["System/Daten/alma-abruf.json"]);
  assert.equal(s.geraet, "g-ich");
  assert.equal(Object.keys(s.angewendet).length, 1);
  delete t.fm[p]; delete t.text[p]; // von dir gelöscht
  const b = await t.A.aktualisieren({ text: kalender(B130), still: true });
  assert.deepEqual([b.neu, b.geloescht], [0, 1]);
  assert.equal(Object.keys(t.fm).filter((x) => /B130/.test(x)).length, 0);
  // Raum geändert: kommt wieder
  const b2 = await t.A.aktualisieren({ text: kalender(ereignis("2", "B130 Internes Rechnungswesen Übung", "20261020T140000", "20261020T160000", "Hörsaal 9")), still: true });
  assert.equal(b2.neu, 1);
});

test("Schon vorbei: keine neue Notiz; erste Verknüpfung nimmt Almas Raum, auch in der Kopfzeile", async () => {
  const t = tresor({ sperre: true, heute: "2026-11-20" });
  const b = await t.A.aktualisieren({ text: kalender(B110), still: true });
  assert.deepEqual([b.neu, b.vorbei], [0, 1], "B110 endet am 02.11.");
  const u = tresor({ sperre: true });
  const hand = "Stundenplan/Mo 10.00 B110 Vorlesung.md", gleichRaum = "Stundenplan/Mi 08.00 S100 Vorlesung.md";
  u.fm[hand] = { typ: "lehrveranstaltung", code: "B110", art: "Vorlesung", wochentag: 1, beginn: "10:00", ende: "12:00", semester: SEM, raum: "HS 25" };
  u.text[hand] = "---\n---\n\n# B110 · Vorlesung\n\nMontags, 10:00–12:00 · HS 25\n\n## Notizen\n- Raum gefragt\n";
  u.fm[gleichRaum] = { typ: "lehrveranstaltung", code: "S100", art: "Vorlesung", wochentag: 3, beginn: "08:00", ende: "10:00", semester: SEM, raum: "Kupferbau HS 25" };
  u.text[gleichRaum] = "---\n---\n\n# S100\n";
  await u.A.aktualisieren({ text: kalender(ereignis("1", "B110 Einführung in die BWL Vorlesung", "20261019T100000", "20261019T120000", "Neue Aula HS 9"),
    ereignis("3", "S100 Mathematik Vorlesung", "20261021T080000", "20261021T100000", "Hörsaal 25 Kupferbau")), still: true });
  assert.equal(u.fm[hand].raum, "Neue Aula HS 9");
  assert.match(u.text[hand], /^Montags, 10:00–12:00 · Neue Aula HS 9$/m);
  assert.match(u.text[hand], /Raum gefragt/);
  assert.equal(u.fm[gleichRaum].raum, "Kupferbau HS 25", "nur anders geschrieben: bleibt");
});

test("Doppel einer Alma-Notiz (Konfliktkopie) werden zusammengeführt, dein Text bleibt", async () => {
  const t = tresor({ sperre: true });
  await t.A.aktualisieren({ text: kalender(B130), still: true });
  const p = Object.keys(t.fm).find((x) => /B130/.test(x));
  const kopie = p.replace(/\.md$/, " 2.md");
  t.fm[kopie] = Object.assign({}, t.fm[p]);
  t.text[kopie] = t.text[p].replace("## Meine Notizen\n- \n", "## Meine Notizen\n- Aus der Kopie\n");
  const b = await t.A.aktualisieren({ text: kalender(B130), still: true });
  assert.equal(b.doppel, 1);
  assert.deepEqual(t.papierkorb, [kopie]);
  assert.match(t.text[p], /Aus der Kopie/);
});

test("Status: ein Fehler bleibt stehen (Zeile nicht mehr grün), bis ein Abruf klappt; Sperre: Zeitplan wartet, Knopf übernimmt", async () => {
  let antwort = { status: 503 };
  const t = tresor({ sperre: true, testAbruf: async () => antwort });
  t.speicher["eba-alma-ics"] = "https://alma.uni-tuebingen.de/alma/ical/x";
  assert.equal(await t.A.aktualisieren({ automatisch: true }), null);
  let s = t.A.status();
  assert.deepEqual([s.zustand, s.fehler, !!s.fehlerZeit, s.geprueft], ["fehler", "Alma antwortet nicht (Fehler 503). Bitte den Link in Alma neu kopieren.", true, ""]);
  antwort = { status: 200, text: kalender(S100) };
  assert.ok(await t.A.aktualisieren({ automatisch: true }));
  s = t.A.status();
  assert.deepEqual([s.zustand, s.fehler, !!s.geprueft], ["an", "", true]);
  // ein anderes Gerät hält die Sperre: der Zeitplan wartet, ein Knopf übernimmt
  t.dateien["System/Daten/alma-abruf.json"] = JSON.stringify({ geraet: "g-anders", seit: new Date().toISOString(), zuletzt: new Date().toISOString(), angewendet: {} });
  assert.equal(await t.A.aktualisieren({ automatisch: true }), null);
  assert.equal(t.A.status().zustand, "anderes-geraet");
  assert.ok(await t.A.aktualisieren({ still: true }));
  assert.equal(JSON.parse(t.dateien["System/Daten/alma-abruf.json"]).geraet, "g-ich");
  assert.equal(t.A.status().zustand, "an");
});

test("Außerhalb des Plugins (Hülle eines eigenen Uni-Abgleichs: ohne sperre.js, quellen.js, vault.modify): gleiche Regeln, keine Sperre", async () => {
  const t = tresor({ ohneBibliotheken: true });
  await t.A.aktualisieren({ text: kalender(B130), still: true });
  const p = Object.keys(t.fm).find((x) => /B130/.test(x));
  t.text[p] = t.text[p].replace("## Meine Notizen\n- \n", "## Meine Notizen\n- eigener Text\n");
  const b = await t.A.aktualisieren({ text: kalender(S100), still: true });
  assert.deepEqual([b.entfaellt, b.entfernt], [1, 0]);
  assert.deepEqual(Object.keys(t.dateien), [], "keine Sperr-Datei");
});

test("Link prüfen: nur Alma als Host, höchstens mit :443; nichts, was ein Parser anders liest", () => {
  const A = tresor().A;
  assert.equal(A.linkPruefen("https://alma.uni-tuebingen.de/alma/ical/x"), "");
  assert.equal(A.linkPruefen("webcal://alma.uni-tuebingen.de:443/alma/pages/cm/exa/timetable/x.faces?user=u&hash=h"), "");
  for (const l of ["https://alma.uni-tuebingen.de:x" + "@evil.example/alma", "https://alma.uni-tuebingen.de\\@evil.example/alma",
    "https://alma.uni-tuebingen.de.evil.example/alma", "https://alma.uni-tuebingen.de:8443/alma"]) assert.ok(A.linkPruefen(l), l);
});

test("Verbinden: scheitert der erste Abruf, gilt wieder der vorherige Link", async () => {
  const alt = "https://alma.uni-tuebingen.de/alma/ical/alt";
  const neu = "https://alma.uni-tuebingen.de/alma/ical/neu";
  let antwort = { status: 404 };
  const t = tresor({ testAbruf: async () => antwort, prompt: async () => neu });

  // ohne vorherigen Link (Eingabefenster, nicht das Verbinden-Fenster): nichts bleibt gespeichert
  assert.equal(await t.A.verbinden(), null);
  assert.equal(t.A.hatLink(), false);
  assert.match(t.A.fehler(), /Fehler 404/);

  // mit vorherigem Link: der alte bleibt, auch über aktualisierenOderVerbinden({ neuerLink })
  t.speicher["eba-alma-ics"] = alt;
  t.speicher["eba-alma-seit"] = "2026-10-01T08:00:00.000Z";
  assert.equal(await t.A.aktualisierenOderVerbinden({ neuerLink: true }), null);
  assert.equal(t.speicher["eba-alma-ics"], alt);
  assert.equal(t.speicher["eba-alma-seit"], "2026-10-01T08:00:00.000Z");

  // Erfolg: neuer Link gespeichert
  antwort = { status: 200, text: kalender(S100) };
  const b = await t.A.verbinden(undefined, { nurBeiErfolg: true });
  assert.equal(b.neu, 1);
  assert.equal(t.speicher["eba-alma-ics"], neu);
});

test("Uni-Login: Alma kennt den Link nicht mehr → neuen holen und gleich damit; Netzfehler, Verbinden und Hülle nie", async () => {
  const alt = "https://alma.uni-tuebingen.de/alma/ical/alt", neu = "https://alma.uni-tuebingen.de/alma/ical/neu";
  const gefragt = [], abrufe = [];
  let ersatz = neu, kaputt = { status: 404 };
  const uni = { erneuern: async (id, l) => { gefragt.push([id, l]); return ersatz; } };
  const t = tresor({ uni, testAbruf: async (x) => { abrufe.push(x.url); return x.url === neu ? { status: 200, text: kalender(S100) } : kaputt; } });
  t.speicher["eba-alma-ics"] = alt;
  const b = await t.A.aktualisieren({ still: true });
  assert.equal(b.neu, 1);
  assert.deepEqual(gefragt, [["alma", alt]]);
  assert.deepEqual(abrufe, [alt, neu]);
  assert.equal(t.speicher["eba-alma-ics"], neu);
  // Alma liefert eine Seite statt des Stundenplans: auch das zeigt auf den Link
  t.speicher["eba-alma-ics"] = alt; kaputt = { status: 200, text: "<html>Anmeldung</html>" };
  assert.ok(await t.A.aktualisieren({ still: true }));
  assert.equal(gefragt.length, 2);
  // Keine Verbindung oder 403 (so bremst Alma): kein Link-Fehler, nicht fragen; kein neuer Link: der Fehler bleibt
  t.speicher["eba-alma-ics"] = alt; kaputt = { status: 0 };
  assert.equal(await t.A.aktualisieren({ still: true }), null);
  kaputt = { status: 403 };
  assert.equal(await t.A.aktualisieren({ still: true }), null);
  assert.equal(gefragt.length, 2);
  kaputt = { status: 410 }; ersatz = "";
  assert.equal(await t.A.aktualisieren({ still: true }), null);
  assert.deepEqual([gefragt.length, t.speicher["eba-alma-ics"]], [3, alt]);
  assert.match(t.A.fehler(), /Fehler 410/);
  // Ein eingegebener Link, der nicht geht: kein Ersatz über den Uni-Login
  ersatz = neu;
  assert.equal(await t.A.verbinden("https://alma.uni-tuebingen.de/alma/ical/getippt", { nurBeiErfolg: true }), null);
  assert.equal(gefragt.length, 3);
});

test("Zentrale Stundenplan-Notizen übernimmt, ändert und löscht Alma nie (eigene Notiz daneben)", async () => {
  const t = tresor();
  const zentral = "Stundenplan/Mo 10.15 B110 Vorlesung.md";
  const vorher = { typ: "lehrveranstaltung", code: "B110", art: "Vorlesung", wochentag: 1, beginn: "10:15", ende: "11:45", semester: SEM,
    herkunft: "zentral", zentral_id: "ws-2026-27-b110-vorlesung-1-mo-1000" };
  t.fm[zentral] = Object.assign({}, vorher);
  t.text[zentral] = "---\n---\n\n# B110 · Vorlesung\n\n## Notizen\n- \n";
  const b1 = await t.A.aktualisieren({ text: kalender(B110), still: true });
  assert.equal(b1.neu, 1, "Alma legt ihre eigene Notiz an (den Rest erledigt der Abrufer der zentralen Daten)");
  assert.deepEqual(t.fm[zentral], vorher, "zentrale Notiz unverändert");
  // B110 fehlt in Alma: die zentrale Notiz bleibt trotzdem, wie sie war
  await t.A.aktualisieren({ text: kalender(S100), still: true });
  assert.deepEqual(t.fm[zentral], vorher);
  assert.equal(t.papierkorb.indexOf(zentral), -1);
});

test("Notizen zu deiner Gruppe (aus ILIAS oder gewählt) übernimmt, ändert und löscht Alma nie", async () => {
  const t = tresor();
  const il = "Stundenplan/Di 14.15 B130 Übung.md", gw = "Stundenplan/Di 14.15 B130 Übung 2.md";
  const v1 = { typ: "lehrveranstaltung", code: "B130", art: "Übung", wochentag: 2, beginn: "14:15", ende: "15:45", semester: SEM,
    herkunft: "ilias-gruppe", ilias_gruppe: "9001", gruppe_id: "ws-2026-27-b130-uebung-2" };
  const v2 = { typ: "lehrveranstaltung", code: "B130", art: "Übung", wochentag: 2, beginn: "14:15", ende: "15:45", semester: SEM,
    herkunft: "gruppe-gewaehlt", gruppe_id: "ws-2026-27-b130-uebung-2" };
  t.fm[il] = Object.assign({}, v1); t.fm[gw] = Object.assign({}, v2);
  t.text[il] = t.text[gw] = "---\n---\n\n# B130 · Übung\n\n> [!info]- Aus ILIAS\n\n## Notizen\n- \n";
  const b1 = await t.A.aktualisieren({ text: kalender(B130), still: true });
  assert.equal(b1.neu, 1, "Alma legt ihre eigene Notiz an; die Gruppen-Notiz räumt ihr Schreiber weg");
  assert.deepEqual([t.fm[il], t.fm[gw]], [v1, v2]);
  await t.A.aktualisieren({ text: kalender(S100), still: true });
  assert.deepEqual([t.fm[il], t.fm[gw]], [v1, v2]);
  assert.deepEqual(t.papierkorb.filter((p) => p === il || p === gw), []);
});

test("Kurztitel: nie nach einem Füllwort abgeschnitten, Modultitel zuerst, kaputte Titel werden repariert", async () => {
  const t = tresor();
  const titel = (p) => (String(t.text[p]).match(/^titel: "(.*)"$/m) || [])[1];
  // ohne Modulnotiz: langer Alma-Titel, an einer Wortgrenze gekürzt, ohne „und“ am Ende
  await t.A.aktualisieren({ text: kalender(ereignis("9", "Einführung in die Betriebswirtschaftslehre und Unternehmensführung", "20261022T100000", "20261022T120000")), still: true });
  const neu1 = Object.keys(t.text).find((p) => /^Stundenplan\/Do 10\.00/.test(p));
  assert.equal(titel(neu1), "Einführung in die Betriebswirtschaftslehre · Veranstaltung");
  // mit Modulnotiz: deren Titel, ganz (kein „Einführung in“)
  const u = tresor();
  u.fm["Module/B110.md"] = { typ: "modul", code: "B110", titel: "Einführung in die Betriebswirtschaftslehre" };
  const alt = "Stundenplan/Mo 10.00 B110 Vorlesung.md";
  u.fm[alt] = { typ: "lehrveranstaltung", code: "B110", art: "Vorlesung", wochentag: 1, beginn: "10:00", ende: "12:00", semester: SEM,
    titel: "Einführung in · Vorlesung", quelle: "alma", alma_schluessel: `${SEM}|B110 Einführung in die BWL Vorlesung|1|10:00|12:00` };
  u.text[alt] = "---\n---\n\n# B110 · Vorlesung\n\n> [!info]- Aus Alma\n\n## Notizen\n- \n";
  await u.A.aktualisieren({ text: kalender(B110, ereignis("8", "B110 Einführung in die BWL Übung", "20261023T080000", "20261023T100000")), still: true });
  assert.equal(u.fm[alt].titel, "Einführung in die Betriebswirtschaftslehre · Vorlesung", "kaputter Titel repariert");
  const neu2 = Object.keys(u.text).find((p) => /^Stundenplan\/Fr 08\.00/.test(p));
  assert.equal((String(u.text[neu2]).match(/^titel: "(.*)"$/m) || [])[1], "Einführung in die Betriebswirtschaftslehre · Übung");
});

test("Stundenplan von außen (quellen_extern): Alma holt und schreibt nie, auch nicht über Befehle oder das Verbinden-Fenster", async () => {
  let abrufe = 0, fragen = 0;
  const alt = "https://alma.uni-tuebingen.de/alma/ical/alt";
  const t = tresor({
    testAbruf: async () => { abrufe++; return { status: 200, text: kalender(S100) }; },
    prompt: async () => { fragen++; return "https://alma.uni-tuebingen.de/alma/ical/neu"; },
    eba: { quelleExtern: EBA.quelleExtern },
  });
  t.fm["System/Einstellungen.md"] = { quellen_extern: ["stundenplan"] };
  t.speicher["eba-alma-ics"] = alt;
  assert.equal(await t.A.aktualisierenOderVerbinden(), null, "Knopf und Befehl „Stundenplan aktualisieren“");
  assert.equal(await t.A.aktualisierenOderVerbinden({ neuerLink: true }), null, "Befehl „Alma-Link ändern“");
  assert.equal(await t.A.verbinden("https://alma.uni-tuebingen.de/alma/ical/neu", { nurBeiErfolg: true }), null, "Verbinden-Fenster");
  assert.equal(t.A.fehler(), "Dein Stundenplan kommt über deinen Uni-Abgleich.");
  assert.deepEqual([abrufe, fragen], [0, 0], "kein Abruf, keine Frage nach dem Link");
  assert.equal(t.speicher["eba-alma-ics"], alt, "Link unverändert");
  assert.deepEqual(Object.keys(t.fm).filter((p) => p.startsWith("Stundenplan/")), []);

  // Liste ohne „stundenplan“: Alma holt wieder
  t.fm["System/Einstellungen.md"].quellen_extern = ["ilias-dateien"];
  assert.equal((await t.A.aktualisieren({ still: true })).neu, 1);
  assert.equal(abrufe, 1);
});

// Zeitgeber zum Weiterdrehen (ctx.zeit/ctx.stopp): alle(ms) feuert, was bis dahin fällig ist
const uhr = () => {
  const t = { jetzt: 0, offen: [], gesehen: [] };
  t.zeit = (fn, ms) => { const id = t.offen.length + 1; t.offen.push({ id, fn, bis: t.jetzt + ms }); t.gesehen.push(ms); return id; };
  t.stopp = (id) => { t.offen = t.offen.filter((x) => x.id !== id); };
  t.vor = (ms) => { t.jetzt += ms; const f = t.offen.filter((x) => x.bis <= t.jetzt); t.offen = t.offen.filter((x) => x.bis > t.jetzt); for (const x of f) x.fn(); };
  return t;
};
const tick = () => new Promise((r) => setImmediate(r));

test("Fristen: Alma antwortet nicht → nach 60 s Fehler im Status, der Lauf ist frei, die späte Antwort schreibt nichts", async () => {
  let antworten = [];
  const z = uhr();
  const t = tresor({ sperre: true, zeitgeber: z, testAbruf: () => new Promise((r) => antworten.push(r)) });
  t.speicher["eba-alma-ics"] = "https://alma.uni-tuebingen.de/alma/ical/x";
  const lauf = t.A.aktualisieren({ automatisch: true });
  await tick();
  assert.equal(t.A.status().zustand, "laeuft");
  assert.ok(z.gesehen.indexOf(60e3) >= 0 && z.gesehen.indexOf(120e3) >= 0, "Frist je Anfrage und je Abruf");
  z.vor(60e3);
  assert.equal(await lauf, null);
  let s = t.A.status();
  assert.deepEqual([s.zustand, s.fehler, !!s.fehlerZeit, s.laeuft], ["fehler", "Alma hat nicht rechtzeitig geantwortet. Neuer Versuch später.", true, false]);
  assert.deepEqual(z.offen, [], "keine Zeitgeber übrig");
  // die Antwort kommt doch noch: nichts wird geschrieben
  antworten[0]({ status: 200, text: kalender(S100) });
  await tick();
  assert.deepEqual(Object.keys(t.fm).filter((p) => p.startsWith("Stundenplan/")), []);
  // nächster Lauf geht wieder (LAUF frei) und klappt
  antworten = [];
  const zweiter = t.A.aktualisieren({ automatisch: true });
  await tick();
  antworten[0]({ status: 200, text: kalender(S100) });
  assert.equal((await zweiter).neu, 1);
  s = t.A.status();
  assert.deepEqual([s.zustand, s.fehler], ["an", ""]);
});

test("Fristen: hängt schon die Sperre (Tresor antwortet nicht), endet der Abruf nach 2 Min. mit Fehler", async () => {
  const z = uhr();
  const t = tresor({ sperre: true, zeitgeber: z, testAbruf: async () => ({ status: 200, text: kalender(S100) }) });
  t.speicher["eba-alma-ics"] = "https://alma.uni-tuebingen.de/alma/ical/x";
  t.dateien["System/Daten/alma-abruf.json"] = JSON.stringify({ geraet: "g-ich", seit: new Date().toISOString(), zuletzt: new Date().toISOString() });
  t.ctx.app.vault.read = () => new Promise(() => {}); // Sperr-Datei lesen hängt
  const lauf = t.A.aktualisieren({ still: true });
  await tick();
  z.vor(120e3);
  assert.equal(await lauf, null);
  assert.equal(t.A.status().fehler, "Alma hat nicht rechtzeitig geantwortet. Neuer Versuch später.");
  assert.equal(t.A.status().laeuft, false);
});

// Raum je Termin, verschobene und abgesagte Termine, 14-täglich, Verlegung (seit 20.10.2026).
// Bis dahin galt der häufigste Raum aller Termine, ein einzelner Termin in einem anderen
// Raum ging verloren, ein auf eine andere Uhrzeit verschobener Termin wurde Ausfall plus eigene Notiz. Nur ausgedachte Daten.
const ve = (felder) => ["BEGIN:VEVENT", ...Object.entries(felder).map(([k, v]) => k + (k === "EXDATE" ? ";TZID=Europe/Berlin:" : ":") + v), "END:VEVENT"].join("\n");
const notizVon = (t, muster) => { const p = Object.keys(t.fm).filter((x) => muster.test(x)); assert.equal(p.length, 1, p.join(", ")); return t.fm[p[0]]; };

test("Raum je Termin: einzelner Termin in anderem Raum wird eine Änderung, Raum der Serie bleibt, keine weitere Notiz", async () => {
  const t = tresor();
  await t.A.aktualisieren({ still: true, text: kalender(
    ve({ UID: "r1", SUMMARY: "X410 Beispiel Vorlesung", DTSTART: "20261019T100000", DTEND: "20261019T120000", RRULE: "FREQ=WEEKLY;COUNT=5", LOCATION: "Hörsaal 1" }),
    ve({ UID: "r1", "RECURRENCE-ID": "20261102T100000", SUMMARY: "X410 Beispiel Vorlesung", DTSTART: "20261102T100000", DTEND: "20261102T120000", LOCATION: "Hörsaal 21" })) });
  const n = notizVon(t, /X410/);
  assert.deepEqual([n.raum, n.von, n.bis, n.ausfall, n.aenderungen], ["Hörsaal 1", "2026-10-19", "2026-11-16", [], ["2026-11-02|10:00|12:00|Hörsaal 21"]]);
  assert.equal(n.raum_seit, undefined, "keine Verlegung");
});

test("Raum der Serie = Raum der kommenden Termine: dauerhafte Verlegung mit Datum und altem Raum, auch wenn der alte häufiger war", async () => {
  const t = tresor();
  const ics = kalender(
    ve({ UID: "a", SUMMARY: "X420 Beispiel Vorlesung", DTSTART: "20261021T100000", DTEND: "20261021T120000", RRULE: "FREQ=WEEKLY;COUNT=6", LOCATION: "Hörsaal 1" }),
    ve({ UID: "b", SUMMARY: "X420 Beispiel Vorlesung", DTSTART: "20261202T100000", DTEND: "20261202T120000", RRULE: "FREQ=WEEKLY;COUNT=3", LOCATION: "Hörsaal 21, Kupferbau" }));
  await t.A.aktualisieren({ still: true, text: ics });
  const n = notizVon(t, /X420/);
  assert.deepEqual([n.raum, n.raum_vorher, n.raum_seit, n.aenderungen, n.alma_raum], ["Hörsaal 21, Kupferbau", "Hörsaal 1", "2026-12-02", undefined, "Hörsaal 21, Kupferbau"]);
  assert.deepEqual([n.von, n.bis, n.ausfall], ["2026-10-21", "2026-12-16", []]);
  // nur anders geschrieben: keine Verlegung
  const u = tresor();
  await u.A.aktualisieren({ still: true, text: kalender(
    ve({ UID: "a", SUMMARY: "X421 Beispiel Vorlesung", DTSTART: "20261021T100000", DTEND: "20261021T120000", RRULE: "FREQ=WEEKLY;COUNT=3", LOCATION: "Kupferbau HS 25" }),
    ve({ UID: "b", SUMMARY: "X421 Beispiel Vorlesung", DTSTART: "20261111T100000", DTEND: "20261111T120000", RRULE: "FREQ=WEEKLY;COUNT=3", LOCATION: "Hörsaal 25 Kupferbau" })) });
  assert.equal(notizVon(u, /X421/).raum_seit, undefined);
});

test("Alma nennt für die ganze Serie einen neuen Raum: Verlegung ab dem nächsten Termin, bleibt bei weiteren Abrufen, Kopfzeile zieht mit", async () => {
  const t = tresor({ sperre: true, heute: "2026-10-27" });
  const serie = (raum) => kalender(ve({ UID: "c", SUMMARY: "X430 Beispiel Vorlesung", DTSTART: "20261021T100000", DTEND: "20261021T120000", RRULE: "FREQ=WEEKLY;COUNT=8", LOCATION: raum }));
  await t.A.aktualisieren({ still: true, text: serie("Hörsaal 1") });
  const p = Object.keys(t.fm).find((x) => /X430/.test(x));
  assert.equal(t.fm[p].raum_seit, undefined);
  await t.A.aktualisieren({ still: true, text: serie("Hörsaal 21, Kupferbau") });
  assert.deepEqual([t.fm[p].raum, t.fm[p].raum_vorher, t.fm[p].raum_seit], ["Hörsaal 21, Kupferbau", "Hörsaal 1", "2026-10-28"]);
  assert.match(t.text[p], /^Mittwochs, 10:00–12:00 · Hörsaal 21, Kupferbau$/m);
  const b = await t.A.aktualisieren({ still: true, text: serie("Hörsaal 21, Kupferbau") });
  assert.deepEqual([b.gleich, b.geaendert], [1, 0], "bleibt, ohne neu zu schreiben");
  assert.equal(t.fm[p].raum_seit, "2026-10-28");
});

test("Erste Verknüpfung mit anderem Raum: dein Raum wird der alte, ab dem nächsten Termin gilt Almas; c.t. auch für Änderungen", async () => {
  const t = tresor({ heute: "2026-10-20" });
  const hand = "Stundenplan/Mi 10.15 X440 Vorlesung.md";
  t.fm[hand] = { typ: "lehrveranstaltung", code: "X440", art: "Vorlesung", wochentag: 3, beginn: "10:15", ende: "11:45", semester: SEM, raum: "Hörsaal 1" };
  t.text[hand] = "---\n---\n\n# X440 · Vorlesung\n";
  await t.A.aktualisieren({ still: true, text: kalender(
    ve({ UID: "d", SUMMARY: "X440 Beispiel Vorlesung", DTSTART: "20261014T100000", DTEND: "20261014T120000", RRULE: "FREQ=WEEKLY;COUNT=6", LOCATION: "Hörsaal 21" }),
    ve({ UID: "d", "RECURRENCE-ID": "20261104T100000", SUMMARY: "X440 Beispiel Vorlesung", DTSTART: "20261104T100000", DTEND: "20261104T120000", LOCATION: "Audimax" })) });
  const n = t.fm[hand];
  assert.deepEqual([n.beginn, n.ende, n.raum, n.raum_vorher, n.raum_seit], ["10:15", "11:45", "Hörsaal 21", "Hörsaal 1", "2026-10-21"]);
  assert.deepEqual(n.aenderungen, ["2026-11-04|10:15|11:45|Audimax"], "c.t. wie die Serie");
});

test("Verschobener Termin (andere Uhrzeit, gleicher Tag): Änderung der Serie statt Ausfall und eigener Notiz; nicht eindeutig: wie bisher", async () => {
  const t = tresor();
  await t.A.aktualisieren({ still: true, text: kalender(
    ve({ UID: "e", SUMMARY: "X450 Beispiel Übung", DTSTART: "20261019T100000", DTEND: "20261019T120000", RRULE: "FREQ=WEEKLY;COUNT=5", EXDATE: "20261102T100000", LOCATION: "Raum 5" }),
    ve({ UID: "f", SUMMARY: "X450 Beispiel Übung", DTSTART: "20261102T140000", DTEND: "20261102T160000", LOCATION: "Raum 7" })) });
  assert.equal(Object.keys(t.fm).filter((x) => /X450/.test(x)).length, 1, "keine eigene Notiz für den verschobenen Termin");
  const n = notizVon(t, /X450/);
  assert.deepEqual([n.ausfall, n.aenderungen, n.einzeltermin], [[], ["2026-11-02|14:00|16:00|Raum 7"], false]);
  // ohne Raum: der Raum der Serie; auch der erste Termin
  const v = tresor();
  await v.A.aktualisieren({ still: true, text: kalender(
    ve({ UID: "e", SUMMARY: "X451 Beispiel Übung", DTSTART: "20261019T100000", DTEND: "20261019T120000", RRULE: "FREQ=WEEKLY;COUNT=5", EXDATE: "20261019T100000", LOCATION: "Raum 5" }),
    ve({ UID: "f", SUMMARY: "X451 Beispiel Übung", DTSTART: "20261019T080000", DTEND: "20261019T100000" })) });
  assert.deepEqual([notizVon(v, /X451/).von, notizVon(v, /X451/).aenderungen], ["2026-10-19", ["2026-10-19|08:00|10:00|Raum 5"]]);
  // zwei Serien gleichen Titels fehlen am selben Tag: nicht eindeutig, Ausfall und eigene Notiz wie bisher
  const u = tresor();
  await u.A.aktualisieren({ still: true, text: kalender(
    ve({ UID: "g", SUMMARY: "X452 Beispiel Übung", DTSTART: "20261019T100000", DTEND: "20261019T120000", RRULE: "FREQ=WEEKLY;COUNT=5", EXDATE: "20261102T100000" }),
    ve({ UID: "h", SUMMARY: "X452 Beispiel Übung", DTSTART: "20261019T140000", DTEND: "20261019T160000", RRULE: "FREQ=WEEKLY;COUNT=5", EXDATE: "20261102T140000" }),
    ve({ UID: "i", SUMMARY: "X452 Beispiel Übung", DTSTART: "20261102T170000", DTEND: "20261102T190000" })) });
  assert.equal(Object.keys(u.fm).filter((x) => /X452/.test(x)).length, 3);
  assert.ok(Object.keys(u.fm).filter((x) => /X452/.test(x)).every((x) => !u.fm[x].aenderungen));
});

test("Abgesagt (STATUS:CANCELLED) steht als Ausfall in der Serie, auch am Anfang; ganz abgesagt fehlt wie bisher", async () => {
  const t = tresor();
  await t.A.aktualisieren({ still: true, text: kalender(
    ve({ UID: "j", SUMMARY: "X460 Beispiel Vorlesung", DTSTART: "20261019T100000", DTEND: "20261019T120000", RRULE: "FREQ=WEEKLY;COUNT=4" }),
    ve({ UID: "j", "RECURRENCE-ID": "20261019T100000", SUMMARY: "X460 Beispiel Vorlesung", DTSTART: "20261019T100000", DTEND: "20261019T120000", STATUS: "CANCELLED" }),
    ve({ UID: "k", SUMMARY: "X461 Beispiel Vorlesung", DTSTART: "20261020T100000", DTEND: "20261020T120000", STATUS: "CANCELLED" })) });
  const n = notizVon(t, /X460/);
  assert.deepEqual([n.von, n.bis, n.ausfall], ["2026-10-19", "2026-11-09", ["2026-10-19"]]);
  assert.equal(Object.keys(t.fm).filter((x) => /X461/.test(x)).length, 0);
});

test("14-täglich: die Wochen dazwischen sind kein Ausfall (rhythmus), ein fehlender Termin im Rhythmus schon", async () => {
  const t = tresor();
  await t.A.aktualisieren({ still: true, text: kalender(
    ve({ UID: "l", SUMMARY: "X470 Beispiel Übung", DTSTART: "20261019T100000", DTEND: "20261019T120000", RRULE: "FREQ=WEEKLY;INTERVAL=2;COUNT=5", EXDATE: "20261116T100000" }),
    ve({ UID: "m", SUMMARY: "X471 Beispiel Übung", DTSTART: "20261020T100000", DTEND: "20261020T120000", RRULE: "FREQ=WEEKLY;INTERVAL=2;COUNT=2" })) });
  const n = notizVon(t, /X470/);
  assert.deepEqual([n.rhythmus, n.ausfall, n.von, n.bis], ["14-täglich", ["2026-11-16"], "2026-10-19", "2026-12-14"]);
  assert.deepEqual([notizVon(t, /X471/).rhythmus, notizVon(t, /X471/).ausfall], [undefined, ["2026-10-27"]], "zwei Termine: nicht sicher, wie bisher");
});

test("Hülle eines eigenen Uni-Abgleichs (ohne Bibliotheken): Änderungen und Verlegung kommen nur über die Eigenschaften", async () => {
  const t = tresor({ ohneBibliotheken: true });
  await t.A.aktualisieren({ still: true, text: kalender(
    ve({ UID: "a", SUMMARY: "X480 Beispiel Vorlesung", DTSTART: "20261021T100000", DTEND: "20261021T120000", RRULE: "FREQ=WEEKLY;COUNT=3", LOCATION: "Hörsaal 1" }),
    ve({ UID: "b", SUMMARY: "X480 Beispiel Vorlesung", DTSTART: "20261111T100000", DTEND: "20261111T120000", RRULE: "FREQ=WEEKLY;COUNT=3", LOCATION: "Hörsaal 21" })) });
  const n = notizVon(t, /X480/);
  assert.deepEqual([n.raum, n.raum_vorher, n.raum_seit], ["Hörsaal 21", "Hörsaal 1", "2026-11-11"]);
  assert.deepEqual(Object.keys(t.dateien), []);
});
