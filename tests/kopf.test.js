// Kopf-Karte jeder Notiz (kopf.js): genau ein Status-Knopf je Notiztyp, Farbe aus ctx.modell.statusArt, „Besuche ich nicht“ für
// jede Lehrveranstaltung (Quelle über ihren Schlüssel in den Einstellungen, eigene Notiz über ein Feld). Das Zeichnen in Lese- und
// Bearbeitungsansicht prüft man in Obsidian (docs/tests.md). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json } = require("./laden.js");

const K = require("../Studium Autopilot/System/Skripte/kopf.js");
const SEMESTER = json("semester.json");
const modell = (heute, einstellungen = {}) => laden("modell", {
  heute, frontmatter: { "System/Daten/Semester.md": SEMESTER, "System/Einstellungen.md": einstellungen },
}).ctx.modell;
const serie = (o) => Object.assign({ typ: "lehrveranstaltung", code: "X100", wochentag: 4, beginn: "10:15", ende: "11:45", von: "2027-04-15", bis: "2027-07-22", semester: "SS 2027" }, o);

test("Genau ein Status je Notiztyp; die Vorlesung zeichnet ihren Kopf selbst (vorlesung.js), Übungen stehen in tests/uebungen.test.js", () => {
  assert.deepEqual(K.TYPEN, ["termin", "unterlage", "sq_kurs", "lehrveranstaltung"]);
  for (const typ of K.TYPEN) assert.ok(K.statusVon(typ, {}, false), typ);
  assert.equal(K.statusVon("vorlesung", {}), null);
});

test("Termin: Offen ⇄ Erledigt; Unterlage: Noch nicht gelesen ⇄ Gelesen („bearbeitet“ zählt als gelesen)", () => {
  assert.deepEqual(K.statusVon("termin", { erledigt: false }), { wert: false, text: "Offen", wort: "offen", fertig: false, neu: true });
  assert.equal(K.statusVon("termin", { erledigt: true }).neu, false);
  const u = K.statusVon("unterlage", { status: "neu" });
  assert.deepEqual([u.text, u.neu, u.fertig], ["Noch nicht gelesen", "gelesen", false]);
  assert.deepEqual([K.statusVon("unterlage", { status: "gelesen" }).neu, K.statusVon("unterlage", { status: "bearbeitet" }).text], ["neu", "Bearbeitet"]);
  assert.equal(K.statusVon("unterlage", {}).wert, "neu", "ohne Feld: neu");
});

test("SQ-Kurs: vier Stufen im Menü, unbekannt = geplant; Lehrveranstaltung: Im Stundenplan ⇄ Besuche ich nicht", () => {
  const s = K.statusVon("sq_kurs", { status: "angemeldet" });
  assert.deepEqual([s.text, s.fertig, s.menue], ["Angemeldet", false, ["geplant", "angemeldet", "zugelassen", "bestanden"]]);
  assert.equal(K.statusVon("sq_kurs", { status: "irgendwas" }).wert, "geplant");
  assert.equal(K.statusVon("sq_kurs", { status: "bestanden" }).fertig, true);
  assert.deepEqual([K.statusVon("lehrveranstaltung", {}, false).text, K.statusVon("lehrveranstaltung", {}, true).text], ["Im Stundenplan", "Besuche ich nicht"]);
});

test("Farbe aus statusArt: erledigt gefüllt, Zwischenstand getönt, offen warm, Besuche ich nicht und ungelesen leise", () => {
  const M = modell("2026-10-18");
  const klasse = (typ, fm, nicht) => { const s = K.statusVon(typ, fm, nicht); return K.klasseVon(s, M.statusArt(typ, s.wort)); };
  assert.equal(klasse("termin", { erledigt: true }), "fertig");
  assert.equal(klasse("termin", { erledigt: false }), "");
  assert.equal(klasse("unterlage", { status: "gelesen" }), "fertig");
  assert.equal(klasse("unterlage", { status: "neu" }), "leise", "jede neue Unterlage ist ungelesen, das ist keine Warnung");
  assert.equal(klasse("sq_kurs", { status: "angemeldet" }), "zwischen");
  assert.equal(klasse("sq_kurs", { status: "bestanden" }), "fertig");
  assert.equal(klasse("sq_kurs", { status: "geplant" }), "");
  assert.equal(klasse("lehrveranstaltung", {}, false), "fertig");
  assert.equal(klasse("lehrveranstaltung", {}, true), "leise");
});

test("Besuche ich nicht: zentral über die id, andere Quellen über „<herkunft>:<id>“, eigene Notiz über das Feld", () => {
  const alma = serie({ herkunft: "alma", alma_schluessel: "SS 2027|X100|4|10:15|11:45" });
  const M = modell("2027-04-20", { stundenplan_ausgeblendet: ["ss-2027-x100", "alma:SS 2027|X100|4|10:15|11:45"] });
  assert.equal(M.besuchSchluessel(serie({ herkunft: "zentral", zentral_id: "ss-2027-x100" })), "ss-2027-x100");
  assert.equal(M.besuchSchluessel(alma), "alma:SS 2027|X100|4|10:15|11:45");
  assert.equal(M.besuchSchluessel(serie()), "", "eigene Notiz: kein Schlüssel");
  assert.equal(M.findetStatt(alma, "2027-04-22").grund, "ausgeblendet");
  assert.equal(M.findetStatt(serie({ besuche_nicht: true }), "2027-04-22").grund, "ausgeblendet");
  assert.equal(M.findetStatt(serie(), "2027-04-22").statt, true);
  assert.equal(M.naechsteSitzung(alma, new Date("2027-04-20T12:00:00")), null, "keine nächste Sitzung");
  assert.equal(modell("2027-04-20").besuchtNicht(alma), false);
});

test("Übung und Tutorium im Stundenplan: Unterlagen aus dem eigenen Bereich, neueste Nummer zuerst, ohne Nummer danach, höchstens drei", () => {
  const u = (code, art, nummer, titel) => ({ f: { basename: `${code} ${art} ${titel}` }, fm: { typ: "unterlage", code, art, nummer, titel } });
  const unterlagen = [
    u("X100", "Übung", 1, "Aufgabenblatt Vorkurs"), u("X100", "Übung", "", "Aufgabenkatalog"), u("X100", "Übung", 3, "Integrale"),
    u("X100", "Lösung", 1, "Kurzlösung"), u("X100", "Folien", 2, "Ableitungen"), u("Y200", "Übung", 4, "Fremdes Modul"),
    { f: { basename: "X100 Übung 02" }, fm: { typ: "unterlage", code: "X100", art: "übung", nummer: 2 } },
    { f: { basename: "X100 Übung WS 2026" }, fm: { typ: "unterlage", code: "X100", art: "Übung" } },
    u("X100", "Tutorium", 1, "Aufgabenblatt"), u("X100", "Tutorium", "", "Vorlage Abgabe"),
    { f: { basename: "X100 Tutorium 02" }, fm: { typ: "unterlage", code: "X100", art: "Tutorium", nummer: 2 } },
  ];
  const titel = (r) => r.blaetter.map((b) => [b.nr, b.titel]);
  const tut = K.blaetterFuer(serie({ art: "Tutorium" }), unterlagen);
  assert.equal(tut.art, "Tutorium");
  assert.deepEqual(titel(tut), [[2, ""], [1, "Aufgabenblatt"], [null, "Vorlage Abgabe"]], "nur der Bereich Tutorium; ohne Titel: Dateiname ohne Kürzel, Art, Nummer");
  assert.equal(tut.mehr, 0);
  const ue = K.blaetterFuer(serie({ art: "Übung" }), unterlagen);
  assert.equal(ue.art, "Übung");
  assert.deepEqual(titel(ue), [[3, "Integrale"], [2, ""], [1, "Aufgabenblatt Vorkurs"]], "keine Tutoriumsunterlagen bei der Übung");
  assert.equal(ue.mehr, 2, "die Blätter ohne Nummer kommen über „Alle Unterlagen“");
  assert.deepEqual(titel(K.blaetterFuer(serie({ art: "Übungsteil" }), unterlagen, 10)).slice(3), [[null, "Aufgabenkatalog"], [null, "WS 2026"]]);
  assert.equal(K.blaetterFuer(serie({ art: "Vorlesung" }), unterlagen), null, "Vorlesung: keine Chips");
  assert.equal(K.blaetterFuer(serie({ art: "Tutorium", code: "" }), unterlagen), null, "ohne Modul: nichts");
  assert.deepEqual(K.blaetterFuer(serie({ art: "Tutorium", code: "Z300" }), unterlagen), { art: "Tutorium", blaetter: [], mehr: 0 });
});

test("Lab im Stundenplan: Unterlagen aus dem Bereich Lab, auch unter dem offiziellen Namen („Data Science Lab“)", () => {
  const u = (art, nummer, titel) => ({ f: { basename: `X100 ${art} ${titel}` }, fm: { typ: "unterlage", code: "X100", art, nummer, titel } });
  const unterlagen = [u("Lab", 1, "Notebook Grundlagen"), u("Lab", 2, "Regression"), u("Übung", 3, "Integrale"), u("Sonstiges", "", "Lab Daten")];
  for (const art of ["Lab", "Data Science Lab", "R Lab", "Python Labs"]) {
    const r = K.blaetterFuer(serie({ art }), unterlagen);
    assert.equal(r.art, "Lab", art);
    assert.deepEqual(r.blaetter.map((b) => [b.nr, b.titel]), [[2, "Regression"], [1, "Notebook Grundlagen"]], art);
  }
  for (const art of ["Praktikum", "Laborpraktikum", "Matlab-Kurs", "Kollaboration"]) assert.equal(K.blaetterFuer(serie({ art }), unterlagen), null, art);
  assert.equal(K.blaetterFuer(serie({ art: "Übung" }), unterlagen).art, "Übung");
});

test("Lab im Stundenplan: ein Chip je Sitzung, zum Lesen vor Notebook, Code und Daten, Lösung zuletzt; der Rest über „Alle Unterlagen“", () => {
  const u = (nummer, titel, format, datei) => ({ f: { basename: `X100 Lab ${nummer} ${titel}` }, fm: { typ: "unterlage", code: "X100", art: "Lab", nummer, titel, format, datei } });
  const unterlagen = [u(2, "Daten", "csv"), u(2, "Lösung", "pdf"), u(2, "Code", "r"), u(2, "", "html, rmd"), u(1, "Daten", "csv"), u(1, "Grundlagen", "html, rmd"), u("", "Einrichtung", "pdf")];
  const r = K.blaetterFuer(serie({ art: "Data Science Lab" }), unterlagen);
  assert.deepEqual(r.blaetter.map((b) => [b.nr, b.titel]), [[2, ""], [1, "Grundlagen"], [null, "Einrichtung"]]);
  assert.equal(r.mehr, 4, "Daten, Lösung und Code bleiben über die Modulseite erreichbar");
  // aus der ILIAS-Ablage: Notebook und HTML-Fassung getrennt, ohne „format“ zählt die Endung der Datei
  const ilias = [u(1, "Notebook Grundlagen", "rmd"), u(1, "Notebook Grundlagen mit Ausgaben", "html"), u(3, "Daten", "", "[[X100 Lab 03 Daten.csv]]"), u(3, "Notebook", "", "[[X100 Lab 03 Notebook.Rmd]]")];
  assert.deepEqual(K.blaetterFuer(serie({ art: "Lab" }), ilias).blaetter.map((b) => b.titel), ["Notebook", "Notebook Grundlagen mit Ausgaben"]);
  // eine Lösung auch als „Lsg“ oder nur im Link der Datei (mit Alias) zuletzt; „Lsg“ nur als ganzes Wort
  const lsg = [u(4, "Lsg", "pdf"), u(4, "Aufgaben", "pdf", "[[X100 Lab 04 Loesung.pdf|Aufgaben]]"), u(4, "Notebook", "", "[[X100 Lab 04 Notebook.Rmd|Notebook]]")];
  assert.deepEqual(K.blaetterFuer(serie({ art: "Lab" }), lsg).blaetter.map((b) => b.titel), ["Notebook"]);
  const ohne = [u(5, "Notebook", "rmd"), u(5, "Halsgrat", "pdf")];
  assert.deepEqual(K.blaetterFuer(serie({ art: "Lab" }), ohne).blaetter.map((b) => b.titel), ["Halsgrat"]);
  const ue = [u(3, "A", "pdf"), u(3, "B", "pdf")].map((x) => ({ f: x.f, fm: Object.assign({}, x.fm, { art: "Übung" }) }));
  assert.equal(K.blaetterFuer(serie({ art: "Übung" }), ue).blaetter.length, 2, "Übungen mit gleicher Nummer bleiben einzeln");
});

// Termin-Notizen (seit 24.10.2026): Tag, Uhrzeit und Ort in der Kopf-Karte, die erzeugte Datumszeile unter dem Titel fällt weg
test("Termin: die Datumszeile gilt nur als erzeugt, wenn Tag, bis und Ort den Eigenschaften entsprechen", () => {
  const golf = { datum: "2026-10-24", bis: "", ort: "13:30–17:00 · Golfclub Schloss Kressbach, Kressbach Hofgut 11" };
  assert.equal(K.datumsZeile("**24.10.2026** · 13:30–17:00 · Golfclub Schloss Kressbach, Kressbach Hofgut 11", golf), true);
  assert.equal(K.datumsZeile("**24.10.2026** · 13:30–17:00 · Golfclub", golf), false, "von Hand geändert: bleibt stehen");
  assert.equal(K.datumsZeile("**25.10.2026** · 13:30–17:00 · Golfclub Schloss Kressbach, Kressbach Hofgut 11", golf), false);
  const tcp = { datum: "2026-10-12", bis: "2026-10-19", ort: "Alma · für Kurse ab 06.11." };
  assert.equal(K.datumsZeile('**12.10.2026 – 19.10.2026** · Alma · für Kurse ab 06.11. · <span class="eba-pill leer">Schlüsselqualifikation · freiwillig</span>', tcp), true);
  assert.equal(K.datumsZeile("**12.10.2026** · Alma · für Kurse ab 06.11.", tcp), false, "bis fehlt");
  assert.equal(K.datumsZeile("**05.10.2026** · Raum 1\_2 \[EG\]", { datum: "2026-10-05", ort: "Raum 1_2 [EG]" }), true, "Backslashes von mdText");
  assert.equal(K.datumsZeile("**05.10.2026**", { datum: "2026-10-05", ort: "" }), true);
  assert.equal(K.datumsZeile("Am **05.10.2026**", { datum: "2026-10-05", ort: "" }), false);
});

test("Termin: Datumszeile direkt unter dem Titel und Quelle vor der ersten Überschrift finden (Zeilen der ganzen Notiz)", () => {
  const fm = { datum: "2026-10-24", ort: "Ort" };
  const z = ["---", "typ: termin", "---", "", "# Titel", "", "**24.10.2026** · Ort", "", "Info.", "", "Quelle: Flyer · geprüft am 12.10.2026", "",
    "## Meine Notizen", "", "Quelle: eigener Text"];
  assert.deepEqual(K.terminZeilen(z, fm), { datum: 6, quelle: [10] });
  assert.deepEqual(K.terminZeilen(["# Titel", "", "Geprüft am 12.10.2026"], fm), { datum: -1, quelle: [2] });
  assert.equal(K.terminZeilen(["# Titel", "", "Mein Text", "**24.10.2026** · Ort"], fm).datum, -1, "nur direkt unter dem Titel");
  assert.equal(K.terminZeilen(["# Titel", "", "## Meine Notizen", "- "], fm).datum, -1, "eigener Termin: ohne Datumszeile");
  assert.deepEqual(K.terminZeilen([], fm), { datum: -1, quelle: [] });
});

test("Termin-Kopf: Tag, daneben heute/morgen/läuft oder die Restzeit, Uhrzeit nie doppelt", () => {
  const m = modell("2026-10-24");
  const w = (fm) => K.wannVon(m.terminLesen({ f: { path: "Termine/x.md", basename: "x" }, fm: Object.assign({ typ: "termin", kategorie: "Veranstaltung" }, fm) }), m);
  assert.deepEqual(w({ datum: "2026-10-24", ort: "13:30–17:00 · Golfclub" }),
    { tag: "Samstag, 24.10.", marke: { text: "heute", alt: false }, abstand: "", zeit: "13:30–17:00", wo: "Golfclub" });
  assert.deepEqual([w({ datum: "2026-10-25" }).marke, w({ datum: "2026-10-25" }).abstand], [{ text: "morgen", alt: true }, ""]);
  assert.deepEqual([w({ datum: "2026-10-29" }).marke, w({ datum: "2026-10-29" }).abstand], [null, "in 5 Tagen"]);
  assert.deepEqual([w({ datum: "2026-10-20" }).marke, w({ datum: "2026-10-20" }).abstand], [null, ""], "vorbei: ohne beides");
  const lauf = w({ datum: "2026-10-23", bis: "2026-10-29", ort: "ab 17:00 · bis 23:59 · ILIAS-Kurs S110" });
  assert.deepEqual([lauf.tag, lauf.marke.text, lauf.zeit, lauf.wo], ["23.–29.10.", "läuft", "ab 17:00 · bis 23:59", "ILIAS-Kurs S110"]);
  assert.equal(w({ datum: "2026-10-27", ort: "ab 18:00 · bis 22:00 · Neckawa" }).zeit, "18:00–22:00", "an einem Tag als Spanne");
  assert.equal(w({ datum: "2026-10-09", ort: "bis 12:00 · Alma" }).zeit, "bis 12:00");
  assert.deepEqual([w({ datum: "2026-10-05", ort: "Mo 12:15–14:00 · HS N06" }).zeit, w({ datum: "2026-10-05", ort: "Mo 12:15–14:00 · HS N06" }).wo],
    ["", "Mo 12:15–14:00 · HS N06"], "Uhrzeit mitten im Ort bleibt dort");
  assert.deepEqual([w({ datum: "2026-10-27", uhrzeit: "14:00", ort: "Sekretariat" }).zeit, w({ datum: "2026-10-27", uhrzeit: "14:00", ort: "Sekretariat" }).wo], ["14:00", "Sekretariat"]);
});

test("Termin-Kopf: das Label nennt nur Art und Modul, der Tag steht darunter", () => {
  const Kx = laden("kopf", { kontext: { modell: modell("2026-10-24") } }).ergebnis;
  assert.equal(Kx.labelVon("termin", { path: "Termine/x.md", basename: "x" }, { typ: "termin", datum: "2026-10-27", kategorie: "Frist", code: "B110", uhrzeit: "14:00" }), "Frist · B110");
});

test("Unterlage: das Label nennt das Modul mit Namen und das Semester (ohne Umbruch); Kürzel, Art und Nummer stehen schon im Titel", () => {
  const Kx = laden("kopf").ergebnis;
  const f = { path: "Unterlagen/X100/X100 Folien 00 Einführung.md", basename: "X100 Folien 00 Einführung" };
  const fm = { typ: "unterlage", code: "X100", art: "Folien", nummer: 0, semester: "WS 2026/27" };
  assert.equal(Kx.labelVon("unterlage", f, fm, "Einführung in die Welt"), "Einführung in die Welt · WS\u00a02026/27");
  assert.equal(Kx.labelVon("unterlage", f, fm, ""), "X100 · WS\u00a02026/27", "Modulseite fehlt: das Kürzel");
  assert.equal(Kx.labelVon("unterlage", f, { typ: "unterlage", art: "Sonstiges", semester: "WS 2026/27" }), "Sonstiges · WS\u00a02026/27", "ohne Modul");
  assert.equal(Kx.labelVon("unterlage", f, { typ: "unterlage", art: "Folien", nummer: 3 }), "Folien 03");
});
