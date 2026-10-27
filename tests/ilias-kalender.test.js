// ILIAS-Kalender (ilias-kalender.js): Abgaben aus dem Kalender-Abo von ILIAS als Fristen unter Termine/.
// Erfundene Testdaten: Alle Kalender, Titel, Objektnummern, Links und Schlüssel sind ausgedacht; nur der Aufbau folgt ILIAS 10
// (Export ilCalendarExport: UID, URL goto.php/<typ>/<ref>, TZID, Zusatz „(Abgabetermin)“). Tresor im Speicher.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { laden } = require("./laden.js");
const { I } = require("./ilias-attrappen.js");

const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));
const Z = laden("zentral").ctx.zentral;
const ALMA = laden("alma", { kontext: { user: { eba: EBA } } }).ergebnis;

// Erfundener Abo-Link; der Schlüssel darf nirgends auftauchen außer im gerätelokalen Speicher des Links
const SCHLUESSEL = "Erfunden0Schluessel0fuer0Tests0x";
const LINK = `https://ovidius.uni-tuebingen.de/calendar.php?client_id=pr02&token=${SCHLUESSEL}&limited=1`;
const SPERRE = "System/Daten/ilias-kalender-abruf.json";
const PW = "Pass" + "wort"; // zerlegt, damit werkzeuge/pruefen.py die erfundenen Kurspasswörter nicht für echte hält

// ---------- Kalender bauen ----------
const URL_ILIAS = "https://ovidius.uni-tuebingen.de/goto.php";
// e = { uid, titel, start ("20261103T235500"), tz ("Europe/Berlin" | "Z" | anderes | "" ohne Zone), typ, ref }
const ereignis = (e) => {
  const zeit = (w) => (e.tz === "Z" ? `:${w}Z` : e.tz ? `;TZID=${e.tz}:${w}` : `:${w}`);
  return ["BEGIN:VEVENT", "DTSTAMP:20261018T080000Z", `UID:${e.uid || Math.random().toString(36).slice(2)}_pr02@https://ovidius.uni-tuebingen.de`,
    "LAST-MODIFIED:20261017T120000Z", `DTSTART${zeit(e.start)}`, `DTEND${zeit(e.ende || e.start)}`, `SUMMARY:${e.titel}`,
    `URL;VALUE=URI:${URL_ILIAS}/${e.typ || "exc"}/${e.ref}`, "END:VEVENT"].join("\r\n");
};
const ZONE = ["BEGIN:VTIMEZONE", "TZID:Europe/Berlin", "BEGIN:STANDARD", "DTSTART:19701025T030000", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "END:STANDARD", "END:VTIMEZONE"].join("\r\n");
const kalender = (...e) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ilias.de/NONSGML ILIAS Calendar V4.4//EN", ZONE, ...e, "END:VCALENDAR"].join("\r\n");
const abgabe = (ref, titel, start, o) => ereignis(Object.assign({ ref, titel: `${titel} (Abgabetermin)`, start, tz: "Europe/Berlin" }, o));
// Wie ein echter Kalender im Oktober: Sitzungen, Kursbeginn mit Passwort im Titel, Anmeldefenster einer Gruppe, keine Übung
const WIE_ECHT = [
  ereignis({ typ: "sess", ref: 7101, titel: "Vorlesung 1", start: "20261019T101500", ende: "20261019T114500", tz: "Europe/Berlin" }),
  ereignis({ typ: "sess", ref: 7102, titel: "Übung 1", start: "20261021T141500", ende: "20261021T154500", tz: "Europe/Berlin" }),
  ereignis({ typ: "sess", ref: 7103, titel: "Vorlesung 2", start: "20261026T101500", ende: "20261026T114500", tz: "Europe/Berlin" }),
  ereignis({ typ: "crs", ref: 7201, titel: `B110 Erfundener Kurs (${PW}: Igel42) (Kursbeginn)`, start: "20261012T080000", tz: "Europe/Berlin" }),
  ereignis({ typ: "crs", ref: 7202, titel: "S100 Erfundener Kurs (Kursende)", start: "20270212T180000", tz: "Europe/Berlin" }),
  ereignis({ typ: "grp", ref: 7301, titel: "Tutorium 1 (Beginn der Anmeldung)", start: "20261015T120000", tz: "Europe/Berlin" }),
];

// ---------- Tresor im Speicher ----------
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
    fm[k] = v === "" || v === "[]" ? [] : /^".*"$/.test(v) ? JSON.parse(v) : v === "true" ? true : v === "false" ? false : v;
  }
  return fm;
};
// o = { heute, termine (ctx.modell.termine()), blaetter (ctx.modell.abgaben()), objekte (Index der ILIAS-Unterlagen), abruf
// (plugin.testKalenderAbruf), einstellungen, uni (Attrappe von uni-login.js) }
function tresor(o) {
  o = o || {};
  const fm = {}, text = {}, dateien = {}, papierkorb = [], speicher = { "eba-geraet": "g-ich" }, hinweise = [], abrufe = [];
  if (o.einstellungen) fm["System/Einstellungen.md"] = o.einstellungen;
  if (o.objekte) dateien["System/Daten/ilias.json"] = JSON.stringify({ version: 1, kurse: {}, dateien: {}, ignoriert: {}, gruppen: {}, objekte: o.objekte });
  const modul = (c) => (c === "B110" ? { code: c, f: { basename: "B110 Erfundenes Modul" } } : null);
  const L = laden("ilias-kalender", {
    heute: o.heute || "2026-10-20",
    frontmatter: fm,
    kontext: {
      obsidian: { Notice: class { constructor(t) { hinweise.push(String(t)); } }, Platform: {}, requestUrl: async () => { throw new Error("kein Netz im Test"); } },
      user: { eba: EBA, alma: () => ALMA, "uni-login": o.uni ? () => o.uni : undefined },
      zentral: { notizText: Z.notizText, geraetId: () => "g-ich" },
      ilias: { ohneKennwort: I.ohneKennwort },
      modell: { termine: () => o.termine || [], abgaben: () => o.blaetter || [], modul },
      plugin: { testKalenderAbruf: o.abruf ? async (x) => { abrufe.push(x.url); return o.abruf(x); } : undefined },
    },
  });
  const app = L.ctx.app;
  const datei = (p) => ({ path: p, basename: p.split("/").pop().replace(/\.md$/, "") });
  app.vault.getMarkdownFiles = () => Object.keys(fm).filter((p) => p.endsWith(".md") && p !== "System/Einstellungen.md").map(datei);
  app.vault.getAbstractFileByPath = (p) => (p === "Termine" ? { path: p, children: [] } : fm[p] || p in dateien ? datei(p) : null);
  app.vault.read = async (f) => (f.path in dateien ? dateien[f.path] : text[f.path] || "");
  const setzen = (p, t) => { if (p.endsWith(".md")) { text[p] = t; fm[p] = fmAusText(t); } else dateien[p] = t; };
  app.vault.create = async (p, t) => { if (fm[p] || p in dateien) throw new Error("gibt es schon: " + p); setzen(p, t); return datei(p); };
  app.vault.modify = async (f, t) => setzen(f.path, t);
  app.vault.createFolder = async () => {};
  app.vault.trash = async (f) => { papierkorb.push(f.path); delete fm[f.path]; delete text[f.path]; };
  app.fileManager = {
    renameFile: async (f, ziel) => { fm[ziel] = fm[f.path]; text[ziel] = text[f.path]; delete fm[f.path]; delete text[f.path]; },
    processFrontMatter: async (f, fn) => { fn(fm[f.path]); text[f.path] = text[f.path].replace(/^erledigt: .*$/m, "erledigt: " + fm[f.path].erledigt); },
  };
  app.loadLocalStorage = (k) => (k in speicher ? speicher[k] : null);
  app.saveLocalStorage = (k, v) => { if (v == null) delete speicher[k]; else speicher[k] = v; };
  const notizen = () => Object.keys(fm).filter((p) => p.indexOf("Termine/") === 0).sort();
  const sperre = () => JSON.parse(dateien[SPERRE] || "{}");
  return { K: L.ctx.iliasKalender, ctx: L.ctx, fm, text, dateien, papierkorb, speicher, hinweise, abrufe, notizen, sperre };
}
const lauf = (t, ics, o) => t.K.aktualisieren(Object.assign({ text: ics, still: true }, o));

// ---------- Reine Teile ----------
test("Link prüfen: nur der Abo-Link von ILIAS; die Sätze nennen den Link nie", () => {
  const K = tresor().K;
  assert.equal(K.linkPruefen(LINK), "");
  assert.equal(K.linkPruefen(LINK.replace("https:", "webcal:")), "");
  assert.equal(K.linkAdresse(LINK.replace("https:", "webcal:")), LINK);
  const falsch = [
    "", "https://ovidius.uni-tuebingen.de/calendar.php?client_id=pr02&token=a b", "ovidius.uni-tuebingen.de/calendar.php?token=x",
    `https://ilias.example.org/calendar.php?client_id=pr02&token=${SCHLUESSEL}`, `https://ovidius.uni-tuebingen.de:8443/calendar.php?client_id=pr02&token=${SCHLUESSEL}`,
    `https://jemand@ovidius.uni-tuebingen.de/calendar.php?client_id=pr02&token=${SCHLUESSEL}`, "https://ovidius.uni-tuebingen.de/calendar.php?client_id=pr02",
    `https://ovidius.uni-tuebingen.de/ilias.php?client_id=pr02&token=${SCHLUESSEL}`, "https://ovidius.uni-tuebingen.de/",
    // Host, den ein anderer Parser anders liest (\ und @ vor dem Pfad)
    `https://ovidius.uni-tuebingen.de\\@evil.example/calendar.php?client_id=pr02&token=${SCHLUESSEL}`,
    `https://ovidius.uni-tuebingen.de${"@"}evil.example/calendar.php?client_id=pr02&token=${SCHLUESSEL}`,
  ];
  for (const l of falsch) {
    const s = K.linkPruefen(l);
    assert.ok(s, l);
    assert.ok(s.indexOf(SCHLUESSEL) < 0 && s.indexOf("calendar.php") < 0, "Satz ohne Link");
  }
});

test("Erkennen: Art am Zusatz (deutsch und englisch), Ziel an der Adresse, Nummer des Blatts", () => {
  const K = tresor().K;
  assert.deepEqual(K.artAus("Übungsblatt 3 (Abgabetermin)"), { art: "abgabe", titel: "Übungsblatt 3" });
  assert.deepEqual(K.artAus("Sheet 2 (Deadline)"), { art: "abgabe", titel: "Sheet 2" });
  assert.deepEqual(K.artAus("Blatt 4 (Teil A) (Feedback geben bis)"), { art: "feedback", titel: "Blatt 4 (Teil A)" });
  assert.equal(K.artAus("Essay (Feedback Deadline)").art, "feedback");
  assert.equal(K.artAus("Vorlesung 1").art, "");
  assert.equal(K.artAus("Tutorium 1 (Beginn der Anmeldung)").art, "");
  assert.deepEqual(K.zielAus(`${URL_ILIAS}/exc/9001`), { typ: "exc", ref: "9001" });
  assert.deepEqual(K.zielAus("https://ovidius.uni-tuebingen.de/goto.php?target=exc_9002&client_id=pr02"), { typ: "exc", ref: "9002" });
  assert.deepEqual(K.zielAus("https://ovidius.uni-tuebingen.de/goto_pr02_exc_9003.html"), { typ: "exc", ref: "9003" });
  assert.deepEqual(K.zielAus("https://ovidius.uni-tuebingen.de/"), { typ: "", ref: "" });
  const n = ["Übungsblatt 3", "Blatt 03", "Aufgabe 2", "Assignment 4", "3. Übungsblatt", "Hausaufgabe Nr. 7", "Problem Sheet #5", "Essay", "Blatt 31", "Blatt 0"].map(K.nummerAus);
  assert.deepEqual(n, [3, 3, 2, 4, 3, 7, 5, 0, 0, 0]);
});

test("Zeit: Berlin und UTC; fremde Zone, ohne Zone und ganztägig fallen weg; 00:00 → Vortag bis 23:59 (intern 24:00)", async () => {
  const K = tresor().K;
  const z = (start, tz) => K.zeitpunktAus(ALMA.lesen(kalender(abgabe(9001, "Blatt 1", start, { tz })))[0], ALMA.zeit);
  assert.deepEqual(z("20261103T235500", "Europe/Berlin"), { datum: "2026-11-03", uhr: "23:55" });
  assert.deepEqual(z("20261103T225500", "Z"), { datum: "2026-11-03", uhr: "23:55" }, "UTC in Ortszeit (MEZ)");
  assert.deepEqual(z("20261103T235500", "America/New_York"), { fehlt: "zeitzone" });
  assert.deepEqual(z("20261103T235500", ""), { fehlt: "zeitzone" });
  const ganz = ["BEGIN:VEVENT", "UID:9_pr02@x", "DTSTART;VALUE=DATE:20261103", "SUMMARY:Blatt 1 (Abgabetermin)", `URL;VALUE=URI:${URL_ILIAS}/exc/9001`, "END:VEVENT"].join("\r\n");
  assert.deepEqual(K.zeitpunktAus(ALMA.lesen(kalender(ganz))[0], ALMA.zeit), { fehlt: "zeit" });
  const r = await K.eintraegeAus(ALMA.lesen(kalender(abgabe(9001, "Blatt 1", "20261104T000000"), abgabe(9001, "Blatt 2", "20261103T235500", { tz: "Asia/Tokyo" }))),
    { zeit: ALMA.zeit, klartext: ALMA.klartext });
  assert.deepEqual(r.abgaben.map((x) => [x.datum, x.uhr, x.tag]), [["2026-11-03", "24:00", "2026-11-04"]]);
  assert.equal(K.eintragVon(Object.assign({ schluessel: "exc/9001/abgabe/x", ref: "9001", art: "abgabe" }, r.abgaben[0])).ort, "bis 23:59 Uhr · ILIAS",
    "angezeigt wie in den zentralen Daten; intern 24:00, denn die Uhrzeit steckt in den Grabsteinen");
  assert.equal(r.zaehler.zeitzone, 1);
});

// ---------- Ablauf im Tresor ----------
test("Kalender wie echt (Sitzungen, Kurse, Gruppen, keine Übung) → keine Notiz, nur gezählt", async () => {
  const t = tresor();
  const b = await lauf(t, kalender(...WIE_ECHT));
  assert.deepEqual([b.abgaben, b.neu], [0, 0]);
  assert.deepEqual(b.zaehler, { abgaben: 0, sitzungen: 3, kurse: 2, gruppen: 1, andere: 0, zeitzone: 0 });
  assert.deepEqual(t.notizen(), []);
  assert.ok(JSON.stringify(t).indexOf("Igel42") < 0, "Kurstitel mit Passwort nirgends");
});

test("Abgaben werden Fristen: Code aus dem Index der ILIAS-Unterlagen, nie Titel aus ILIAS, Form der zentralen Termine", async () => {
  const t = tresor({ objekte: { 9001: { typ: "exc", code: "B110", kurs: "7201", t: "x" } } });
  const ics = kalender(...WIE_ECHT,
    abgabe(9001, "Übungsblatt 3: Erfundene Kostenrechnung", "20261103T235500"),
    ereignis({ ref: 9001, titel: "Übungsblatt 3: Erfundene Kostenrechnung (Feedback geben bis)", start: "20261110T120000", tz: "Europe/Berlin" }),
    abgabe(9002, "Essay S100 Erfunden", "20261105T120000"),
    abgabe(9003, `Hausaufgabe 2 – ${PW}: Fuchs77`, "20261106T120000"));
  const b = await lauf(t, ics);
  assert.deepEqual([b.abgaben, b.neu], [4, 4]);
  assert.deepEqual(t.notizen(), [
    "Termine/2026-11-03 B110 Abgabe in ILIAS.md", "Termine/2026-11-05 S100 Abgabe in ILIAS.md",
    "Termine/2026-11-06 Abgabe in ILIAS.md", "Termine/2026-11-10 B110 Feedback in ILIAS.md",
  ]);
  const p = "Termine/2026-11-03 B110 Abgabe in ILIAS.md", f = t.fm[p];
  assert.deepEqual([f.typ, f.titel, f.datum, f.kategorie, f.status, f.ort, f.code, f.modul, f.erledigt, f.herkunft],
    ["termin", "B110 Abgabe 3", "2026-11-03", "Frist", "offiziell", "bis 23:55 Uhr · ILIAS", "B110", "[[B110 Erfundenes Modul]]", false, "ilias-kalender"]);
  assert.match(f.ilias_kalender_id, /^exc\/9001\/abgabe\/[0-9a-f]{8}$/);
  assert.equal(f.quelle, "https://ovidius.uni-tuebingen.de/goto.php/exc/9001");
  assert.match(t.text[p], /^# B110 Abgabe 3\n\n\*\*03\.11\.2026\*\* · bis 23:55 Uhr · ILIAS\n\nGilt der allgemeine Termin; einen persönlichen Termin zeigt nur ILIAS\.\n/m);
  assert.match(t.text[p], /\n## Meine Notizen\n/);
  assert.equal(t.fm["Termine/2026-11-10 B110 Feedback in ILIAS.md"].titel, "B110 Feedback 3");
  assert.equal(t.fm["Termine/2026-11-05 S100 Abgabe in ILIAS.md"].titel, "S100 Abgabe", "Code aus dem Aufgabentitel");
  assert.equal(t.fm["Termine/2026-11-06 Abgabe in ILIAS.md"].titel, "Abgabe 2 in ILIAS", "ohne Code");
  const alles = JSON.stringify([t.fm, t.text, t.dateien, t.speicher, t.hinweise, b]);
  for (const w of ["Kostenrechnung", "Fuchs77", PW, "Igel42", "Essay"]) assert.ok(alles.indexOf(w) < 0, `„${w}“ steht nirgends`);
  // Zweiter Lauf: nichts ändert sich, nichts wird geschrieben
  const b2 = await lauf(t, ics);
  assert.deepEqual([b2.neu, b2.geaendert, b2.gleich], [0, 0, 4]);
  assert.equal(Object.keys(t.sperre().angewendet).length, 4, "Grabsteine in der Sperr-Datei");
  assert.equal(t.sperre().geraet, "g-ich");
});

test("Stabiler Schlüssel: neue UID und neues Datum → dieselbe Notiz wird umbenannt, Haken und Text bleiben", async () => {
  const t = tresor({ objekte: { 9001: { typ: "exc", code: "B110" } } });
  await lauf(t, kalender(abgabe(9001, "Blatt 3", "20261103T235500", { uid: "501" })));
  const alt = "Termine/2026-11-03 B110 Abgabe in ILIAS.md";
  t.fm[alt].erledigt = true;
  t.text[alt] = t.text[alt].replace("erledigt: false", "erledigt: true") + "- Aufgabe 2 nachfragen\n";
  const b = await lauf(t, kalender(abgabe(9001, "Blatt 3", "20261105T235500", { uid: "777" })));
  assert.deepEqual([b.neu, b.umbenannt, b.entfernt, b.entfaellt], [0, 1, 0, 0]);
  const neu = "Termine/2026-11-05 B110 Abgabe in ILIAS.md";
  assert.deepEqual(t.notizen(), [neu]);
  assert.equal(t.fm[neu].erledigt, true);
  assert.equal(t.fm[neu].datum, "2026-11-05");
  assert.match(t.text[neu], /- Aufgabe 2 nachfragen\n$/);
});

test("Neuer Titel am selben Tag → dieselbe Notiz mit neuem Schlüssel; zwei gleiche Titel in einer Übung → „#2“", async () => {
  const t = tresor({ objekte: { 9001: { typ: "exc", code: "B110" } } });
  await lauf(t, kalender(abgabe(9001, "Blatt 3", "20261103T235500")));
  const p = "Termine/2026-11-03 B110 Abgabe in ILIAS.md", id = t.fm[p].ilias_kalender_id;
  t.text[p] += "- eigener Text\n";
  const b = await lauf(t, kalender(abgabe(9001, "Übungsblatt 3 (neu)", "20261103T235500")));
  assert.deepEqual([b.neu, b.entfernt, b.entfaellt], [0, 0, 0]);
  assert.deepEqual(t.notizen(), [p]);
  assert.notEqual(t.fm[p].ilias_kalender_id, id);
  assert.match(t.text[p], /- eigener Text\n$/);

  const u = tresor({ objekte: { 9001: { typ: "exc", code: "B110" } } });
  await lauf(u, kalender(abgabe(9001, "Kurzaufgabe", "20261110T120000"), abgabe(9001, "Kurzaufgabe", "20261103T120000")));
  const ids = u.notizen().map((x) => u.fm[x].ilias_kalender_id);
  assert.equal(ids.length, 2);
  assert.ok(!/#/.test(ids[0]) && /#2$/.test(ids[1]), "nach Datum: das spätere bekommt #2");
  assert.equal(ids[1], ids[0] + "#2");
});

test("Von dir gelöscht: kommt nicht wieder, bis sich Datum oder Uhrzeit in ILIAS ändern", async () => {
  const t = tresor({ objekte: { 9001: { typ: "exc", code: "B110" } } });
  await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T235500")));
  const p = t.notizen()[0];
  delete t.fm[p]; delete t.text[p];
  const b = await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T235500")));
  assert.deepEqual([b.neu, b.geloescht], [0, 1]);
  assert.deepEqual(t.notizen(), []);
  const b2 = await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T120000")));
  assert.deepEqual([b2.neu, b2.geloescht], [1, 0]);
});

test("Von dir gelöscht, bevor der Code bekannt war: kommt auch mit Code nicht wieder; ältere Grabsteine mit Code gelten weiter", async () => {
  const t = tresor();
  await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T235500")));
  const p = t.notizen()[0];
  assert.equal(p, "Termine/2026-11-03 Abgabe in ILIAS.md", "ohne Code");
  delete t.fm[p]; delete t.text[p];
  // Das erste Durchsuchen der Unterlagen kennt jetzt den Code der Übung
  t.dateien["System/Daten/ilias.json"] = JSON.stringify({ version: 1, objekte: { 9001: { typ: "exc", code: "B110" } } });
  const b = await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T235500")));
  assert.deepEqual([b.neu, b.geloescht], [0, 1]);
  assert.deepEqual(t.notizen(), []);
  // Grabstein einer älteren Fassung (mit Code): gilt weiter und wird in die neue Form gebracht
  const id = Object.keys(t.sperre().angewendet)[0];
  const Q = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "quellen.js"));
  const neu = t.sperre().angewendet[id];
  t.dateien[SPERRE] = JSON.stringify(Object.assign(t.sperre(), { angewendet: { [id]: Q.kurzHash(["2026-11-03", "23:55", "abgabe", "B110"]) } }));
  const b2 = await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T235500")));
  assert.deepEqual([b2.neu, b2.geloescht], [0, 1]);
  assert.equal(t.sperre().angewendet[id], neu);
});

test("Älterer Grabstein mit Code, Code gerade unbekannt (neu verbunden): kommt nicht wieder, bis der Code wieder da ist", async () => {
  const t = tresor({ objekte: { 9001: { typ: "exc", code: "S100" } } });
  await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T235500")));
  const p = t.notizen()[0];
  delete t.fm[p]; delete t.text[p];
  const id = Object.keys(t.sperre().angewendet)[0];
  const Q = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "quellen.js"));
  const alt = Q.kurzHash(["2026-11-03", "23:55", "abgabe", "S100"]);
  t.dateien[SPERRE] = JSON.stringify(Object.assign(t.sperre(), { angewendet: { [id]: alt } }));
  // Neu verbunden: der Index „objekte“ ist leer, der Code also unbekannt
  t.dateien["System/Daten/ilias.json"] = JSON.stringify({ version: 1, objekte: {} });
  const b = await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T235500")));
  assert.deepEqual([b.neu, b.geloescht], [0, 1]);
  assert.deepEqual(t.notizen(), []);
  assert.equal(t.sperre().angewendet[id], alt, "Grabstein bleibt, wie er war");
  // Code wieder bekannt: der ältere Grabstein greift wie gewohnt, ein neues Datum bringt die Abgabe zurück
  t.dateien["System/Daten/ilias.json"] = JSON.stringify({ version: 1, objekte: { 9001: { typ: "exc", code: "S100" } } });
  const b2 = await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T235500")));
  assert.deepEqual([b2.neu, b2.geloescht], [0, 1]);
  const b3 = await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261104T120000")));
  assert.deepEqual([b3.neu, b3.geloescht], [1, 0]);
});

test("Neuer Code: die Notiz wird umbenannt (Links ziehen mit); einen eigenen Namen benennt nur ein neues Datum um", async () => {
  const t = tresor();
  await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T235500"), abgabe(9002, "Blatt 1", "20261110T235500")));
  assert.deepEqual(t.notizen(), ["Termine/2026-11-03 Abgabe in ILIAS.md", "Termine/2026-11-10 Abgabe in ILIAS.md"]);
  t.fm["Termine/2026-11-10 Mein Blatt.md"] = t.fm["Termine/2026-11-10 Abgabe in ILIAS.md"];
  t.text["Termine/2026-11-10 Mein Blatt.md"] = t.text["Termine/2026-11-10 Abgabe in ILIAS.md"];
  delete t.fm["Termine/2026-11-10 Abgabe in ILIAS.md"]; delete t.text["Termine/2026-11-10 Abgabe in ILIAS.md"];
  t.dateien["System/Daten/ilias.json"] = JSON.stringify({ version: 1, objekte: { 9001: { typ: "exc", code: "B110" }, 9002: { typ: "exc", code: "B110" } } });
  const b = await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T235500"), abgabe(9002, "Blatt 1", "20261110T235500")));
  assert.deepEqual([b.neu, b.umbenannt], [0, 1]);
  assert.deepEqual(t.notizen(), ["Termine/2026-11-03 B110 Abgabe in ILIAS.md", "Termine/2026-11-10 Mein Blatt.md"]);
  assert.equal(t.fm["Termine/2026-11-03 B110 Abgabe in ILIAS.md"].titel, "B110 Abgabe 1");
  // unverändert: kein zweites Umbenennen
  const b2 = await lauf(t, kalender(abgabe(9001, "Blatt 1", "20261103T235500"), abgabe(9002, "Blatt 1", "20261110T235500")));
  assert.equal(b2.umbenannt, 0);
});

test("Wegfall: nur künftige Abgaben; unberührt → Papierkorb, mit deinem Text → „(entfällt)“; vergangene bleiben", async () => {
  const t = tresor({ heute: "2026-10-20", objekte: { 9001: { typ: "exc", code: "B110" } } });
  const ics = kalender(abgabe(9001, "Blatt 1", "20261103T235500"), abgabe(9001, "Blatt 2", "20261110T235500"), abgabe(9001, "Blatt 3", "20261117T235500"),
    abgabe(9001, "Blatt 4", "20261124T235500"), abgabe(9001, "Blatt 5", "20261201T235500"));
  await lauf(t, ics);
  assert.equal(t.notizen().length, 5);
  const zwei = "Termine/2026-11-10 B110 Abgabe in ILIAS.md";
  t.text[zwei] += "- mit Lerngruppe\n";
  // Blatt 1 und 2 fehlen (2 von 5: kein Massenwegfall); Blatt 1 liegt aus Sicht des Laufs schon in der Vergangenheit
  const spaeter = tresor({ heute: "2026-11-05", objekte: { 9001: { typ: "exc", code: "B110" } } });
  Object.assign(spaeter.fm, t.fm); Object.assign(spaeter.text, t.text); Object.assign(spaeter.dateien, t.dateien);
  const b = await lauf(spaeter, kalender(abgabe(9001, "Blatt 3", "20261117T235500"), abgabe(9001, "Blatt 4", "20261124T235500"), abgabe(9001, "Blatt 5", "20261201T235500")));
  assert.deepEqual([b.entfernt, b.entfaellt], [0, 1]);
  assert.ok(spaeter.fm["Termine/2026-11-03 B110 Abgabe in ILIAS.md"], "vergangene Abgabe bleibt unverändert");
  assert.equal(spaeter.fm[zwei].entfaellt, true);
  assert.equal(spaeter.fm[zwei].titel, "B110 Abgabe 2 (entfällt)");
  assert.match(spaeter.text[zwei], /Dieser Termin steht nicht mehr im ILIAS-Kalender\. Deine Notizen unten bleiben\./);
  assert.match(spaeter.text[zwei], /- mit Lerngruppe\n$/);
  // unberührte künftige Abgabe fehlt → Papierkorb
  const b2 = await lauf(spaeter, kalender(abgabe(9001, "Blatt 3", "20261117T235500"), abgabe(9001, "Blatt 4", "20261124T235500")));
  assert.deepEqual([b2.entfernt, b2.entfaellt], [1, 0]);
  assert.deepEqual(spaeter.papierkorb, ["Termine/2026-12-01 B110 Abgabe in ILIAS.md"]);
  // kommt eine entfallene zurück, ist sie wieder normal
  await lauf(spaeter, kalender(abgabe(9001, "Blatt 2", "20261110T235500"), abgabe(9001, "Blatt 3", "20261117T235500"), abgabe(9001, "Blatt 4", "20261124T235500")));
  assert.equal(spaeter.fm[zwei].entfaellt, undefined);
  assert.equal(spaeter.fm[zwei].titel, "B110 Abgabe 2");
});

test("Schutz: unvollständiger Kalender, leerer Kalender trotz bekannter Abgaben und Massenwegfall entfernen nichts", async () => {
  const t = tresor({ objekte: { 9001: { typ: "exc", code: "B110" } } });
  const alle = [1, 2, 3, 4].map((n) => abgabe(9001, "Blatt " + n, `202611${String(n * 5).padStart(2, "0")}T235500`));
  await lauf(t, kalender(...alle));
  assert.equal(t.notizen().length, 4);
  // ohne END:VCALENDAR (abgeschnitten)
  let b = await lauf(t, kalender(alle[0]).replace(/\r\nEND:VCALENDAR$/, ""), { vollstaendig: false });
  assert.deepEqual([b.entfernt, b.entfaellt], [0, 0]);
  assert.match(b.warnungen.join(" "), /unvollständig/);
  assert.equal(Object.keys(t.sperre().angewendet).length, 4, "Grabsteine bleiben");
  // keine einzige Abgabe, obwohl vier künftige bekannt sind
  b = await lauf(t, kalender(...WIE_ECHT));
  assert.deepEqual([b.entfernt, b.warnungen.length], [0, 1]);
  // drei von vier fehlen auf einmal
  b = await lauf(t, kalender(alle[0]));
  assert.deepEqual([b.entfernt, b.entfaellt], [0, 0]);
  assert.match(b.warnungen[0], /^3 Abgaben fehlen auf einmal/);
  assert.equal(t.notizen().length, 4);
  assert.deepEqual(t.K.status().warnungen, b.warnungen);
  assert.deepEqual(t.K.hinweise(), [], "„Bitte prüfen“ nur auf dem Gerät mit Link");
  t.speicher["eba-ilias-ics"] = LINK;
  assert.deepEqual(t.K.hinweise().map((x) => [x.pfad, x.anker]), [["Studium/Einstellungen & Hilfe.md", "Verbindungen"]]);
});

test("Keine Doppel: zentrale oder eigene Frist zur Abgabe und Übungsblatt am selben Tag mit demselben Code", async () => {
  const objekte = { 9001: { typ: "exc", code: "B110" }, 9002: { typ: "exc", code: "S100" }, 9003: { typ: "exc", code: "B130" } };
  const ics = kalender(abgabe(9001, "Blatt 1", "20261103T235500"), abgabe(9002, "Blatt 1", "20261104T000000"), abgabe(9003, "Blatt 1", "20261105T120000"));
  const termine = [
    { titel: "B110 Abgabe Übungsblatt 1", kategorie: "Frist", code: "B110", datum: "2026-11-03", ende: "2026-11-03", fm: { herkunft: "zentral" } },
    { titel: "B130 Anmeldung Tutorium", kategorie: "Frist", code: "B130", datum: "2026-11-05", ende: "2026-11-05", fm: {} },
  ];
  const blaetter = [{ code: "S100", datum: "2026-11-04" }];
  const t = tresor({ objekte, termine, blaetter });
  const b = await lauf(t, ics);
  assert.deepEqual([b.neu, b.doppelt], [1, 2]);
  assert.deepEqual(t.notizen(), ["Termine/2026-11-05 B130 Abgabe in ILIAS.md"], "eine Anmeldefrist ist keine Abgabe");
  // Kommt die zentrale Frist später: unberührte Notiz in den Papierkorb, mit deinem Text bleibt sie
  const u = tresor({ objekte });
  await lauf(u, ics);
  u.text["Termine/2026-11-03 S100 Abgabe in ILIAS.md"] += "- eigener Text\n";
  const v = tresor({ objekte, termine, blaetter });
  Object.assign(v.fm, u.fm); Object.assign(v.text, u.text); Object.assign(v.dateien, u.dateien);
  const b2 = await lauf(v, ics);
  assert.equal(b2.doppelt, 1, "die mit deinem Text zählt nicht");
  assert.deepEqual(v.papierkorb, ["Termine/2026-11-03 B110 Abgabe in ILIAS.md"]);
  assert.ok(v.fm["Termine/2026-11-03 S100 Abgabe in ILIAS.md"], "mit deinem Text bleibt sie (Abgabe um 00:00 am Vortag)");
  // … und ist die zentrale Frist wieder weg, kommt die Abgabe zurück (kein Grabstein)
  const w = tresor({ objekte });
  Object.assign(w.fm, v.fm); Object.assign(w.text, v.text); Object.assign(w.dateien, v.dateien);
  const b3 = await lauf(w, ics);
  assert.equal(b3.neu, 1);
  assert.ok(w.fm["Termine/2026-11-03 B110 Abgabe in ILIAS.md"]);
});

test("Doppel einer id (Konfliktkopie): zusammengeführt, erledigt gewinnt, eigene Zeilen bleiben", async () => {
  const t = tresor({ objekte: { 9001: { typ: "exc", code: "B110" } } });
  const ics = kalender(abgabe(9001, "Blatt 1", "20261103T235500"));
  await lauf(t, ics);
  const p = t.notizen()[0], kopie = p.replace(".md", " 2.md");
  t.fm[kopie] = Object.assign({}, t.fm[p], { erledigt: true });
  t.text[kopie] = t.text[p].replace("erledigt: false", "erledigt: true") + "- aus der Kopie\n";
  const b = await lauf(t, ics);
  assert.equal(b.doppel, 1);
  assert.deepEqual(t.notizen(), [p]);
  assert.equal(t.fm[p].erledigt, true);
  assert.match(t.text[p], /- aus der Kopie\n/);
});

test("Uni-Login: Link gilt nicht mehr → neuen holen und gleich damit; beim Verbinden und ohne neuen Link nicht", async () => {
  const NEU = LINK.replace("Erfunden0Schluessel0fuer0Tests0x", "Erfunden0Schluessel0fuer0Tests0y");
  const gefragt = [];
  let neu = NEU;
  const uni = { erneuern: async (id, alt) => { gefragt.push([id, alt]); return neu; }, kannSelbst: () => true };
  const gut = { status: 200, text: kalender(...WIE_ECHT, abgabe(9001, "Blatt 1", "20261103T235500")) };
  const t = tresor({ uni, abruf: (x) => (x.url === NEU ? gut : { status: 404, text: "" }), objekte: { 9001: { typ: "exc", code: "B110" } } });
  // Ein eingegebener Link, der nicht geht: kein Ersatz über den Uni-Login
  assert.equal(await t.K.verbinden(LINK, { nurBeiErfolg: true }), null);
  assert.deepEqual(gefragt, []);
  t.speicher["eba-ilias-ics"] = LINK; // wie nach einem Verbinden, bei dem der Link noch ging
  const b = await t.K.aktualisieren({ still: true });
  assert.equal(b.offen, 1);
  assert.deepEqual(gefragt, [["ilias-kalender", LINK]]);
  assert.deepEqual(t.abrufe, [LINK, LINK, NEU]);
  assert.equal(t.speicher["eba-ilias-ics"], NEU);
  assert.equal(t.K.status().zustand, "an");
  // Kein neuer Link zu haben: der Fehler bleibt, „Bitte prüfen“ sagt, wo es weitergeht
  neu = "";
  t.speicher["eba-ilias-ics"] = LINK;
  assert.equal(await t.K.aktualisieren({ still: true }), null);
  assert.equal(gefragt.length, 2);
  assert.deepEqual([t.K.status().linkFehler, t.speicher["eba-ilias-ics"]], [true, LINK]);
  assert.match(t.K.hinweise()[0].text, /Neuen Link eingeben\*\* tippen, den Rest macht Studium Autopilot\.$/);
});

test("Abruf: der Schlüssel im Link steht nirgends; abgelaufener Link → Fehler bleibt, „Bitte prüfen“, nichts geändert", async () => {
  let antwort = { status: 200, text: kalender(...WIE_ECHT, abgabe(9001, "Blatt 1", "20261103T235500")) };
  const t = tresor({ abruf: () => antwort, objekte: { 9001: { typ: "exc", code: "B110" } } });
  const b = await t.K.verbinden(LINK, { nurBeiErfolg: true });
  assert.equal(b.offen, 1);
  assert.deepEqual(t.abrufe, [LINK]);
  assert.equal(t.K.status().zustand, "an");
  assert.ok(t.K.status().seit);
  const ohneLink = () => JSON.stringify([t.fm, t.text, t.dateien, t.hinweise, t.K.status(), t.K.hinweise(),
    Object.keys(t.speicher).filter((k) => k !== "eba-ilias-ics").map((k) => t.speicher[k])]);
  assert.ok(ohneLink().indexOf(SCHLUESSEL) < 0);
  assert.equal(t.speicher["eba-ilias-ics"], LINK, "nur gerätelokal");
  // ILIAS kennt den Link nicht mehr
  antwort = { status: 404, text: "" };
  assert.equal(await t.K.aktualisieren({}), null);
  const s = t.K.status();
  assert.deepEqual([s.zustand, s.linkFehler], ["fehler", true]);
  assert.match(s.fehler, /Link in ILIAS neu kopieren/);
  assert.equal(t.K.hinweise().length, 1);
  assert.match(t.K.hinweise()[0].text, /^\*\*ILIAS-Kalender\*\* · Der Link gilt nicht mehr/);
  assert.equal(t.notizen().length, 1, "nichts entfernt");
  assert.ok(ohneLink().indexOf(SCHLUESSEL) < 0);
  // HTML statt Kalender, kein Netz
  antwort = { status: 200, text: "<html>Anmeldung</html>" };
  await t.K.aktualisieren({ still: true });
  assert.equal(t.K.status().linkFehler, true);
  antwort = { status: 0 };
  await t.K.aktualisieren({ still: true });
  assert.deepEqual([t.K.status().linkFehler, t.K.hinweise().length], [false, 0]);
  assert.match(t.K.status().fehler, /Keine Verbindung zu ILIAS/);
  // klappt es wieder, ist der Fehler weg
  antwort = { status: 200, text: kalender(abgabe(9001, "Blatt 1", "20261103T235500")) };
  await t.K.aktualisieren({ still: true });
  assert.deepEqual([t.K.status().zustand, t.K.status().fehler], ["an", ""]);
  // Trennen: Link weg, Fristen bleiben, Sperre frei
  await t.K.trennen();
  assert.equal(t.speicher["eba-ilias-ics"], undefined);
  assert.equal(t.notizen().length, 1);
  assert.equal(t.sperre().frei, true);
});

test("Verbinden: falscher Link oder gescheiterter erster Abruf → kein Link gespeichert", async () => {
  const t = tresor({ abruf: () => ({ status: 403, text: "" }) });
  assert.equal(await t.K.verbinden("https://ilias.example.org/calendar.php?client_id=x&token=y", { nurBeiErfolg: true }), null);
  assert.deepEqual(t.abrufe, [], "ein falscher Link wird gar nicht erst abgerufen");
  assert.equal(await t.K.verbinden(LINK, { nurBeiErfolg: true }), null);
  assert.match(t.K.fehler(), /Link in ILIAS neu kopieren/);
  assert.equal(t.speicher["eba-ilias-ics"], undefined);
  assert.equal(t.K.status().zustand, "nicht-verbunden");
});

test("Ein Schreiber: hält ein anderes Gerät die Sperre, wartet der Zeitplan; dein Tipp übernimmt", async () => {
  const t = tresor({ abruf: () => ({ status: 200, text: kalender(abgabe(9001, "Blatt 1", "20261103T235500")) }) });
  t.speicher["eba-ilias-ics"] = LINK;
  const vorhin = new Date("2026-10-20T11:50:00").toISOString(); // 10 Min. vor der Testuhr
  t.dateien[SPERRE] = JSON.stringify({ geraet: "g-anderes", seit: vorhin, zuletzt: vorhin, mobil: false, angewendet: {} });
  assert.equal(await t.K.aktualisieren({ automatisch: true }), null);
  assert.deepEqual(t.abrufe, [], "kein Abruf");
  assert.equal(t.K.status().zustand, "anderes-geraet");
  const b = await t.K.aktualisieren({ still: true });
  assert.equal(b.neu, 1);
  assert.equal(t.sperre().geraet, "g-ich");
  assert.equal(t.K.status().zustand, "an");
});

test("Von außen (quellen_extern bzw. eigener Uni-Abgleich): kein Abruf, keine Notiz, nur der Satz", async () => {
  for (const einstellungen of [{ quellen_extern: ["ilias-kalender"] }, { ilias_unterlagen: "extern" }]) {
    const t = tresor({ einstellungen, abruf: () => ({ status: 200, text: kalender(abgabe(9001, "Blatt 1", "20261103T235500")) }) });
    t.speicher["eba-ilias-ics"] = LINK;
    assert.equal(await t.K.aktualisieren({}), null);
    assert.equal(await t.K.verbinden(LINK, {}), null);
    assert.deepEqual([t.abrufe.length, t.notizen().length], [0, 0]);
    assert.equal(t.K.status().zustand, "extern");
    assert.deepEqual(t.hinweise, [t.K.K.EXTERN, t.K.K.EXTERN]);
  }
  const t = tresor({ einstellungen: { quellen_extern: ["volltext"] }, abruf: () => ({ status: 200, text: kalender() }) });
  t.speicher["eba-ilias-ics"] = LINK;
  assert.ok(await t.K.aktualisieren({ still: true }), "die Liste nennt den Kalender nicht → er läuft");
});

test("Zentrale Notizen bleiben Byte für Byte gleich; andere Quellen tragen nur ihre Besitzmarke", () => {
  const e = { id: "2026-11-03-erfundene-frist", titel: "Erfundene Frist", datum: "2026-11-03", bis: "", uhrzeit: "", ort: "bis 12:00 Uhr", kategorie: "Frist",
    status: "offiziell", code: "B110", quelle_url: "https://uni-tuebingen.de/", quelle_text: "", info: "", geprueft: "2026-10-14" };
  const zentral = Z.notizText("", e, {});
  assert.equal(Z.notizText("", e, { herkunft: "zentral", idFeld: "zentral_id", weg: "anders" }), zentral);
  assert.match(zentral, /\nherkunft: zentral\nzentral_id: 2026-11-03-erfundene-frist\n/);
  const fremd = Z.notizText("", e, { herkunft: "ilias-kalender", idFeld: "ilias_kalender_id", weg: "im ILIAS-Kalender" });
  assert.equal(fremd, zentral.replace("herkunft: zentral\nzentral_id: 2026-11-03-erfundene-frist", 'herkunft: ilias-kalender\nilias_kalender_id: "2026-11-03-erfundene-frist"'));
  // Wiederholtes Schreiben verdoppelt das Id-Feld nicht
  assert.equal(Z.notizText(fremd, e, { herkunft: "ilias-kalender", idFeld: "ilias_kalender_id" }), fremd);
  const weg = Z.notizText(fremd, e, { herkunft: "ilias-kalender", idFeld: "ilias_kalender_id", weg: "im ILIAS-Kalender", entfaellt: true });
  assert.match(weg, /> Dieser Termin steht nicht mehr im ILIAS-Kalender\./);
  assert.match(Z.notizText(zentral, e, { entfaellt: true }), /> Dieser Termin steht nicht mehr in den zentralen Daten\./);
});
