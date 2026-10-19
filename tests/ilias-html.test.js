// ILIAS-Seiten lesen (ilias-html.js): Zerleger, Anmeldestatus, Seitenarten, Kurse, Ordnerinhalte, Sitzungen, Übungen,
// Formulare der Anmeldung, Dateinamen und Download-Adressen. Die Seiten in tests/daten/ilias-seiten/ sind erfunden, haben
// aber den Aufbau echter ILIAS-10-Seiten der Uni Tübingen (Klassen, Attribute, Verschachtelung).
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const SEITEN = path.join(__dirname, "daten", "ilias-seiten");
const SKRIPT = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "ilias-html.js");
const seite = (name) => fs.readFileSync(path.join(SEITEN, name + ".html"), "utf8");
const BASIS = "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ilrepositorygui&ref_id=2000001";
const HEUTE = "2026-10-16";

// Über den Plugin-Weg geladen (ctx.date liefert „heute“) und direkt (ohne ctx)
const H = laden("ilias-html", { heute: HEUTE }).ergebnis;
const S = require(SKRIPT);
const finde = (liste, titel) => liste.find((e) => e.titel === titel);

test("Laden: Bibliothek, keine Erweiterung; Fabrik und direkte Funktionen", () => {
  const code = fs.readFileSync(SKRIPT, "utf8");
  // dieselbe Regel wie main.js (istErweiterung): sonst würde der Kern das Skript als Erweiterung starten
  assert.equal(/\bregistrieren\s*(\(|=|:|,|\})|\baktionen\s*:/.test(code), false);
  for (const n of ["parsen", "angemeldet", "seitenArt", "meldungen", "permalink", "mitgliedschaften", "kurse", "gruppen",
    "inhalt", "folgeUrl", "inhaltReiter", "aboFenster", "aboLinks", "uebungen", "formulare", "dateiName", "downloadUrl", "datum", "groesse", "sitzung"]) {
    assert.equal(typeof H[n], "function", "Fabrik: " + n);
    assert.equal(typeof S[n], "function", "direkt: " + n);
  }
});

test("Zerleger: Entitäten, leere Elemente, Rohtext, Kommentare, kaputtes HTML", () => {
  const w = H.parsen('<!DOCTYPE html><div id="a" class=" x  y ">A&amp;B &auml;&#228;&#xE4; &unbekannt; &copy=1<br><img src="i.png">' +
    '<script>var s = "<div id=\'falsch\'>";</script><!-- <div id="kommentar"> --><span title="a > b">C</span></div>' +
    "<P>eins<P>zwei<ul><li>1<li>2</ul><table><tr><td>a<td>b<tr><td>c</table><svg><path d=\"M0\"/><circle/></svg><i>ende</b></i>");
  const a = H.erstes(w, (e) => e.attrs.id === "a");
  assert.ok(H.hatKlasse(a, "x") && H.hatKlasse(a, "y") && !H.hatKlasse(a, "z"));
  assert.equal(H.text(a), "A&B äää &unbekannt; &copy=1 C");
  assert.equal(H.erstes(w, (e) => e.attrs.id === "falsch"), null, "kein Element aus script");
  assert.equal(H.erstes(w, (e) => e.attrs.id === "kommentar"), null, "kein Element aus Kommentar");
  assert.equal(H.erstes(w, (e) => e.name === "span").attrs.title, "a > b");
  assert.equal(H.alle(w, (e) => e.name === "p").length, 2);
  assert.deepEqual(H.alle(w, (e) => e.name === "li").map(H.text), ["1", "2"]);
  assert.deepEqual(H.alle(w, (e) => e.name === "td").map(H.text), ["a", "b", "c"]);
  assert.equal(H.alle(w, (e) => e.name === "tr").length, 2);
  assert.equal(H.erstes(w, (e) => e.name === "circle").eltern.name, "svg", "/> schließt");
  assert.equal(H.text(H.erstes(w, (e) => e.name === "i")), "ende");
  // nie eine Ausnahme, auch bei Unsinn
  for (const roh of ["", "<", "<<>>", "<div", "<a href='x", "</div></div>", "<!--", "<script>", "<x y=\"", "&#xFFFFFFF;", null, 42]) {
    assert.doesNotThrow(() => { const b = H.parsen(roh); H.text(b); H.inhalt(b, BASIS); H.seitenArt(b); H.uebungen(b, BASIS); });
  }
});

test("Zerleger: ein zerlegter Baum wird nicht noch einmal zerlegt, Teilbäume sind durchsuchbar", () => {
  const w = H.parsen(seite("kurs"));
  assert.equal(H.parsen(w), w);
  const block = H.erstes(w, (e) => e.attrs.id === "bl_cntr_1");
  assert.equal(H.alle(block, (e) => e.name === "a" && H.hatKlasse(e, "il_ContainerItemTitle")).length, 4);
  // dieselben Ergebnisse aus Text und Baum
  assert.deepEqual(H.inhalt(w, BASIS), H.inhalt(seite("kurs"), BASIS));
});

test("Datum: deutsche und englische Formate, Heute/Gestern/Morgen, ungültige Tage", () => {
  const f = {
    "12. Okt 2026, 10:15": "2026-10-12T10:15",
    "1. Mär 2026, 08:00": "2026-03-01T08:00",
    "3. Mai 2027": "2027-05-03",
    "20. Apr. 2026, 9:05": "2026-04-20T09:05",
    "5. Oktober 2026, 14:00": "2026-10-05T14:00",
    "12. Oct 2026, 10:15": "2026-10-12T10:15",
    "24. Dec 2026": "2026-12-24",
    "12.10.2026, 10:15": "2026-10-12T10:15",
    "Heute, 10:15": "2026-10-16T10:15",
    "Gestern, 18:02": "2026-10-15T18:02",
    "Morgen, 12:00": "2026-10-17T12:00",
    "Yesterday, 08:00": "2026-10-15T08:00",
    "Geändert am 2. Nov 2026, 13:45 Uhr": "2026-11-02T13:45",
    "31. Feb 2026": "",
    "Anzahl Seiten: 15": "",
    "Version: 2": "",
    "": "",
  };
  for (const [ein, aus] of Object.entries(f)) assert.equal(H.datum(ein, HEUTE), aus, ein);
  // Jahreswechsel
  assert.equal(S.datum("Gestern, 23:00", "2027-01-01"), "2026-12-31T23:00");
  // Fabrik: „heute“ aus ctx.date
  assert.equal(H.datum("Heute"), HEUTE);
});

test("Größe: ILIAS-Schreibweise (Punkt als Dezimalzeichen, 1000er-Schritte) und Varianten", () => {
  const f = { "1.11 MB": 1110000, "116.63 KB": 116630, "345 Bytes": 345, "4.3 MB": 4300000, "1,5 GB": 1500000000,
    "12.345 Bytes": 12345, "1,234.5 KB": 1234500, "1.234,5 KB": 1234500, "pdf": null, "": null };
  for (const [ein, aus] of Object.entries(f)) assert.equal(H.groesse(ein), aus, ein);
});

test("Sitzungsnamen wie PFERD (Datum vorn als JJJJ-MM-TT)", () => {
  assert.deepEqual(H.sitzung("12. Okt 2026, 10:15 - 11:45: Vorlesung 1", HEUTE),
    { datum: "2026-10-12", von: "10:15", bis: "11:45", bisDatum: "", titel: "Vorlesung 1", name: "2026-10-12, 10:15 - 11:45: Vorlesung 1" });
  assert.equal(H.sitzung("6. Feb 2027, 10:00 - 11:30: Klausur Haupttermin", HEUTE).name, "2027-02-06, 10:00 - 11:30: Klausur Haupttermin");
  assert.equal(H.sitzung("12. Okt 2026: Exkursion", HEUTE).name, "2026-10-12: Exkursion");
  assert.equal(H.sitzung("Heute, 14:15 - 15:45: Übung 1", HEUTE).name, "2026-10-16, 14:15 - 15:45: Übung 1");
  const lang = H.sitzung("12. Okt 2026, 10:00 - 13. Okt 2026, 12:00: Blockseminar", HEUTE);
  assert.equal(lang.bisDatum, "2026-10-13");
  assert.equal(lang.bis, "12:00");
  assert.equal(lang.titel, "Blockseminar");
  assert.equal(H.sitzung("12. Okt 2026, 10:15 - 11:45", HEUTE).name, "2026-10-12, 10:15 - 11:45");
  assert.equal(H.sitzung("Vorlesung ohne Datum", HEUTE), null);
});

test("Angemeldet und Seitenart für jede Testseite", () => {
  const f = {
    kurs: ["ilias", true], ordner: ["ilias", true], sitzung: ["ilias", true], mitgliedschaften: ["ilias", true],
    dashboard: ["ilias", true], uebung: ["ilias", true], "uebung-aufgabe": ["ilias", true], inhaltsseite: ["ilias", true],
    "anmeldung-ilias": ["ilias-anmeldung", false], "kein-zugriff": ["kein-zugriff", true],
    "idp-anmeldung": ["idp-anmeldung", false], "idp-fehler": ["idp-fehler", false], "saml-weiterleitung": ["saml-weiterleitung", false],
  };
  for (const [name, [art, an]] of Object.entries(f)) {
    assert.equal(H.seitenArt(seite(name)), art, name);
    assert.equal(H.angemeldet(seite(name)), an, name);
  }
  // End-URL login.php genügt (abgelaufene Sitzung leitet dorthin um)
  assert.equal(H.seitenArt("<html><body></body></html>", "https://ovidius.uni-tuebingen.de/login.php?cmd=force_login"), "ilias-anmeldung");
  // Startseite ohne Fehlermeldung (ILIAS leitet unbekannte ref_id still dorthin)
  const start = seite("kein-zugriff").replace(/<div class="alert alert-danger"[\s\S]*?zuzugreifen\.<\/div>/, "");
  assert.equal(H.seitenArt(start), "startseite");
  assert.equal(H.seitenArt(""), "unbekannt");
  assert.equal(H.angemeldet(""), false);
  // Zustimmung und zweiter Faktor (Merkmale wie PFERD)
  assert.equal(H.seitenArt('<form method="post"><div id="attributeRelease"></div></form>'), "zustimmung");
  assert.equal(H.seitenArt('<form id="fudiscr-form" method="post"></form>'), "zwei-faktor");
});

test("Meldungen und Permalink", () => {
  assert.deepEqual(H.meldungen(seite("kein-zugriff")), [{ art: "fehler", text: "Sie haben keine Berechtigung, auf das Objekt zuzugreifen." }]);
  assert.deepEqual(H.meldungen(seite("dashboard")), [{ art: "info", text: "Sie haben aktuell noch keine Favoriten ausgewählt." }]);
  assert.equal(H.meldungen(seite("anmeldung-ilias"))[0].text, "Die von Ihnen gewählte Seite steht nur angemeldeten Benutzern zur Verfügung.");
  assert.deepEqual(H.permalink(seite("kurs")), { url: "https://ovidius.uni-tuebingen.de/goto.php/crs/2000001", typ: "crs", refId: "2000001" });
  assert.deepEqual(H.permalink(seite("kein-zugriff")), { url: "https://ovidius.uni-tuebingen.de/goto.php/root/1", typ: "root", refId: "1" });
  assert.equal(H.permalink(seite("dashboard")), null);
});

test("Meine Kurse und Gruppen: nur crs als Kurse, Modulcode aus dem Titel, doppelte nur einmal", () => {
  const m = H.mitgliedschaften(seite("mitgliedschaften"), "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ilmembershipoverviewgui");
  assert.deepEqual(m.kurse.map((k) => [k.refId, k.code, k.typ]), [["2000001", "B110", "crs"], ["2000002", "S100", "crs"], ["2000003", "", "crs"]]);
  assert.equal(m.kurse[0].titel, "B110 Beispielkurs Betriebswirtschaft");
  assert.equal(m.kurse[0].url, "https://ovidius.uni-tuebingen.de/goto.php/crs/2000001");
  assert.deepEqual(m.gruppen.map((g) => g.refId), ["2000044", "2000045"]);
  assert.equal(m.gruppen[1].titel, "Gruppe 4");
  assert.equal(m.gruppen[1].beschreibung, "Gruppe 4 - Mi. 8:00 - 10:00 - Hörsaal 1 (Beispielhaus 2)", "Zeit steht oft nur in der Beschreibung");
  assert.deepEqual(H.kurse(seite("mitgliedschaften")), m.kurse);
  assert.deepEqual(H.gruppen(seite("mitgliedschaften")), m.gruppen);
});

test("Kursseite: Arten, Typen, Gruppenblock, Sitzungen, aufgeklappter Inhalt, Video im Seiteninhalt", () => {
  const e = H.inhalt(seite("kurs"), BASIS);
  assert.deepEqual(e.map((x) => x.art + ":" + x.typ), ["ordner:fold", "datei:file", "link:webr", "video:xvid", "sitzung:sess",
    "sitzung:sess", "datei:file", "forum:frm", "test:tst", "sonstiges:lti", "sonstiges:mep", "ordner:grp", "video:mob"]);
  // Datei mit allen Eigenschaften
  const d = finde(e, "Skript Kapitel 1");
  assert.equal(d.refId, "2000012");
  assert.equal(d.url, "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ilrepositorygui&cmdNode=yt:oa&cmdClass=ilObjFileGUI&cmd=sendfile&ref_id=2000012");
  assert.equal(d.endung, "pdf");
  assert.equal(d.groesse, 1110000);
  assert.equal(d.geaendert, "2026-10-12T09:31");
  assert.deepEqual(d.eigenschaften, ["pdf", "1.11 MB", "12. Okt 2026, 09:31", "Anzahl Seiten: 15"]);
  assert.equal(d.gruppe, "00 - Vorlesung");
  assert.equal(d.inSitzung, "");
  // Ordner, Link, Video: Gruppe und Beschreibung, relative URL aufgelöst
  assert.equal(finde(e, "Vorlesungsfolien").beschreibung, "Folien zu jeder Vorlesung");
  assert.equal(finde(e, "Videoaufzeichnungen").url, "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ilLinkResourceHandlerGUI&ref_id=2000013&cmd=calldirectlink");
  assert.equal(finde(e, "01 Einführungsvideo").refId, "2000014");
  // Sitzungen: Typblock ist kein Gruppenblock; Name wie PFERD; „Heute“ aus ctx.date
  const s1 = e.find((x) => x.refId === "2000030");
  assert.equal(s1.gruppe, "");
  assert.equal(s1.sitzung.name, "2026-10-12, 10:15 - 11:45: Vorlesung 1");
  assert.deepEqual(s1.eigenschaften, ["Materialien zur Sitzung: 2"]);
  assert.equal(e.find((x) => x.refId === "2000031").sitzung.name, "2026-10-16, 14:15 - 15:45: Übung 1");
  // Datei aufgeklappt unter Sitzung 2000031, eigene Eigenschaften (nicht die der Sitzung)
  const inS = finde(e, "Übungsblatt 1");
  assert.equal(inS.inSitzung, "2000031");
  assert.equal(inS.geaendert, "2026-10-15T11:47");
  assert.deepEqual(inS.eigenschaften, ["pdf", "252.23 KB", "Gestern, 11:47", "Neu"]);
  // Test über TestScreenGUI-URL, Gruppe ohne Link fehlt, Bild und fremdes Video im Seiteninhalt fehlen
  assert.equal(finde(e, "Quiz 1").refId, "2000041");
  assert.equal(e.some((x) => /Tutorium 2/.test(x.titel)), false);
  const mob = e.filter((x) => x.typ === "mob");
  assert.equal(mob.length, 1);
  assert.equal(mob[0].titel, "Begrüßung zur Vorlesung");
  assert.equal(mob[0].endung, "mp4");
  // kein Eintrag aus dem Text im script-Element
  assert.equal(e.some((x) => x.titel === "kein Eintrag"), false);
});

test("Ordnerseite: Dateien mit Endung, Größe, Datum (Heute/Gestern), Video-Plugin", () => {
  const e = H.inhalt(seite("ordner"), "https://ovidius.uni-tuebingen.de/ilias.php");
  assert.deepEqual(e.map((x) => [x.art, x.refId, x.endung, x.groesse, x.geaendert]), [
    ["ordner", "2000101", "", null, ""],
    ["datei", "2000102", "pdf", 116630, "2026-10-16T10:15"],
    ["datei", "2000103", "pdf", 2500000, "2026-10-15T18:02"],
    ["datei", "2000104", "mp4", 38010000, "2026-09-15T10:52"],
    ["datei", "2000105", "zip", 345, "2026-03-01T08:00"],
    ["video", "2000106", "", null, ""],
  ]);
  assert.equal(finde(e, "Daten & Code (R)").titel, "Daten & Code (R)");
  // ohne ctx: „heute“ als Option
  assert.equal(S.inhalt(seite("ordner"), BASIS, { heute: "2027-01-01" })[1].geaendert, "2027-01-01T10:15");
});

test("Sitzungsseite (Info-Seite): Materialien als Dateien", () => {
  const e = H.inhalt(seite("sitzung"), BASIS);
  assert.deepEqual(e.map((x) => [x.art, x.refId, x.titel, x.groesse]), [
    ["datei", "2000201", "Folien Vorlesung 1", 4300000],
    ["datei", "2000202", "Folien Vorlesung 1 (beschriftet)", 3460000],
  ]);
});

test("Inhaltsseite: Dateiliste im Seiteninhalt (file_id)", () => {
  const e = H.inhalt(seite("inhaltsseite"), "https://ovidius.uni-tuebingen.de/ilias.php");
  assert.deepEqual(e.map((x) => [x.art, x.id, x.titel, x.endung, x.groesse]), [
    ["datei", "il__file_2000901", "Hinweise zur Klausur.pdf", "pdf", 12300],
    ["datei", "il__file_2000902", "Literaturliste.docx", "docx", 1200000],
  ]);
  assert.equal(H.dateiName(e[0]), "Hinweise zur Klausur.pdf");
  assert.match(H.downloadUrl(e[0]), /cmd=downloadFile&ref_id=2000900&file_id=il__file_2000901$/);
});

test("Dateiname: Titel + Endung, bereinigt, keine doppelte Endung, Länge", () => {
  const e = H.inhalt(seite("ordner"), BASIS);
  assert.deepEqual(e.map(H.dateiName), ["Lösungsvorschläge", "Übung 1 - Lösung-Teil A.pdf", "Klausur 2025.pdf",
    "EDA_02_Beispielvideo.mp4", "Daten & Code (R).zip", "02 Video Beispiel"]);
  const datei = (titel, endung) => ({ art: "datei", typ: "file", titel, endung, refId: "7" });
  assert.equal(H.dateiName(datei("a*b?c\"d<e>f|g\\h", "txt")), "a-b-c-d-e-f-g-h.txt");
  assert.equal(H.dateiName(datei("Ende mit Punkt...", "pdf")), "Ende mit Punkt.pdf");
  assert.equal(H.dateiName(datei("CON", "txt")), "_CON.txt");
  assert.equal(H.dateiName(datei("", "pdf")), "Datei 7.pdf");
  assert.equal(H.dateiName(datei("Null\u0000Breite​Richtung‮", "pdf")), "NullBreiteRichtung.pdf");
  assert.equal(H.dateiName(datei("Café", "pdf")), "Café.pdf", "NFC");
  const lang = H.dateiName(datei("Sehr lange Überschrift ".repeat(20), "pdf"));
  assert.ok(lang.length <= 120 && lang.endsWith(".pdf") && !/ \.pdf$/.test(lang), lang);
  const breit = H.dateiName(datei("\u{1F600}".repeat(100), "pdf"));
  assert.ok(Buffer.byteLength(breit) <= 240 && breit.endsWith(".pdf"));
  // Sitzung: PFERDs Name, „:“ ersetzt
  const s = H.inhalt(seite("kurs"), BASIS).find((x) => x.refId === "2000030");
  assert.equal(H.dateiName(s), "2026-10-12, 10-15 - 11-45 - Vorlesung 1");
});

test("Download-Adresse: sendfile-Link, sonst goto.php/file/<ref>/download, sonst leer", () => {
  const e = H.inhalt(seite("ordner"), BASIS);
  assert.equal(H.downloadUrl(e[1]), e[1].url);
  assert.equal(H.downloadUrl({ art: "datei", typ: "file", refId: "2000102", url: "https://ovidius.uni-tuebingen.de/goto.php/file/2000102" }),
    "https://ovidius.uni-tuebingen.de/goto.php/file/2000102/download");
  assert.equal(H.downloadUrl(e[0]), "", "Ordner");
  assert.equal(H.downloadUrl(e[5]), "", "Interaktives Video");
  const mob = H.inhalt(seite("kurs"), BASIS).find((x) => x.typ === "mob");
  assert.equal(H.downloadUrl(mob), "https://ovidius.uni-tuebingen.de/deliver.php/BEISPIELTOKEN0001/-/video0000000001.mp4");
  assert.equal(H.dateiName(mob), "Begrüßung zur Vorlesung.mp4");
});

test("Folge-URL: Inhalt-Reiter nicht aktiv, eingeklappte Sitzungen, sonst leer", () => {
  assert.equal(H.folgeUrl(seite("kurs"), BASIS), "");
  const info = seite("kurs").replace('<li id="tab_view_content" class="active"', '<li id="tab_view_content" class=""');
  assert.equal(H.folgeUrl(info, BASIS),
    "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ilrepositorygui&cmdNode=yt:ni&cmdClass=ilObjCourseGUI&cmd=view&ref_id=2000001");
  const mehr = '<div><a href="ilias.php?baseClass=ilrepositorygui&amp;ref_id=2000001&amp;crs_next_sess=1">Weitere Sitzungen</a></div>';
  assert.equal(H.folgeUrl(mehr, BASIS), "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ilrepositorygui&ref_id=2000001&crs_next_sess=1");
});

test("Reiter „Inhalt“: Adresse ohne Weiterleitung, aktiv oder nicht; ohne Reiter leer", () => {
  const ziel = "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ilrepositorygui&cmdNode=yt:ni&cmdClass=ilObjCourseGUI&cmd=view&ref_id=2000001";
  assert.equal(H.inhaltReiter(seite("kurs"), BASIS), ziel);
  assert.equal(H.inhaltReiter(seite("kurs").replace('<li id="tab_view_content" class="active"', '<li id="tab_view_content" class=""'), BASIS), ziel);
  assert.equal(H.inhaltReiter("<div><a href=\"ilias.php?ref_id=1\">x</a></div>", BASIS), "");
  assert.equal(H.inhaltReiter("", BASIS), "");
});

test("Kalender-Abo: Adresse des Fensters „Kalender abonnieren“ aus dem Skript der Kalender-Seite, Links aus dem Fenster", () => {
  const k = seite("kalender");
  const FENSTER = "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ildashboardgui&cmdNode=x1:y2&cmdClass=ilcalendarsubscriptiongui&cmd=getModalForSubscription&category_id=0&seed=2026-11-01&cmdMode=asynch";
  assert.equal(H.aboFenster(k, "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ildashboardgui&cmdClass=ilcalendarinboxgui"), FENSTER);
  assert.equal(H.aboFenster(H.parsen(k), "https://ovidius.uni-tuebingen.de/ilias.php"), FENSTER, "auch aus einem zerlegten Baum");
  // JSON-Schreibweise mit \/ und \u0026 (andere ILIAS-Fassungen)
  const json = k.replace('"ajaxRenderUrl":"ilias.php?baseClass=ildashboardgui&cmdNode=x1:y2&cmdClass=ilcalendarsubscriptiongui',
    '"ajaxRenderUrl":"\\/ilias.php?baseClass=ildashboardgui\\u0026cmdNode=x1:y2\\u0026cmdClass=ilcalendarsubscriptiongui');
  assert.ok(json.indexOf("\\u0026cmdClass") > 0);
  assert.equal(H.aboFenster(json, "https://ovidius.uni-tuebingen.de/"), FENSTER);
  // Nur das Abo-Fenster, nicht das Fenster eines Termins; ohne Knopf nichts
  assert.equal(H.aboFenster(k.split("ilcalendarsubscriptiongui").join("ilcalendarxgui"), "https://ovidius.uni-tuebingen.de/"), "");
  assert.equal(H.aboFenster(seite("dashboard"), "https://ovidius.uni-tuebingen.de/"), "");
  const L = H.aboLinks(seite("kalender-abo"));
  const basis = "https://ovidius.uni-tuebingen.de/calendar.php?client_id=pr02&token=Erfunden0Schluessel0fuer0Tests0x&limited=";
  assert.deepEqual(L, [{ url: basis + "0", begrenzt: false }, { url: basis + "1", begrenzt: true }]);
  assert.deepEqual(H.aboLinks(seite("kalender")), []);
  assert.deepEqual(H.aboLinks(seite("kalender-abo").split("token=").join("tok=")), []);
});

test("Übungen: Übersicht mit Fristen und Dateien, Aufgabenseite mit Download-Knöpfen", () => {
  const u = H.uebungen(seite("uebung"), "https://ovidius.uni-tuebingen.de/ilias.php");
  assert.deepEqual(u.map((x) => [x.titel, x.assId, x.frist]), [
    ["Übungsblatt 1", "11", "2026-10-19T23:59"], ["Übungsblatt 2", "12", "2026-10-17T12:00"], ["Zusatzaufgabe ohne Frist", "13", ""],
  ]);
  assert.equal(u[0].fristText, "19. Okt 2026, 23:59");
  assert.deepEqual(u[0].eigenschaften[0], { name: "Startzeit", wert: "12. Okt 2026, 08:00" });
  assert.deepEqual(u[1].dateien.map((d) => d.name), ["Blatt_02.pdf"]);
  assert.match(u[1].dateien[0].url, /cmd=downloadFile&ass_id=12&ref_id=2000700&file=/);
  const url = "https://ovidius.uni-tuebingen.de/ilias.php?baseClass=ilexercisehandlergui&cmdClass=ilAssignmentPresentationGUI&ass_id=11&ref_id=2000700";
  const a = H.uebungen(seite("uebung-aufgabe"), url);
  assert.equal(a.length, 1);
  assert.equal(a[0].titel, "Übungsblatt 1");
  assert.equal(a[0].frist, "2026-10-19T23:59");
  assert.deepEqual(a[0].dateien.map((d) => d.name), ["Blatt_01.pdf", "Daten_01.csv"]);
  assert.deepEqual(H.uebungen(seite("ordner"), BASIS), []);
});

test("Formulare der Anmeldung: Felder, Knöpfe, relative und kodierte Action", () => {
  const idp = "https://idp.uni-tuebingen.de/idp/profile/SAML2/Redirect/SSO?execution=e1s1";
  const [f] = H.formulare(seite("idp-anmeldung"), idp);
  assert.equal(f.method, "post");
  assert.equal(f.action, "https://idp.uni-tuebingen.de/idp/profile/SAML2/Redirect/SSO?execution=e1s1");
  assert.deepEqual(f.felder, { j_username: "", j_password: "" }, "nicht angehakte Kästchen fehlen");
  assert.deepEqual(f.knoepfe, ["_eventId_proceed"]);
  const [s] = H.formulare(seite("saml-weiterleitung"), idp);
  assert.equal(s.action, "https://ovidius.uni-tuebingen.de/Shibboleth.sso/SAML2/POST");
  assert.deepEqual(Object.keys(s.felder), ["RelayState", "SAMLResponse"]);
  assert.equal(s.felder.SAMLResponse, "QkVJU1BJRUwtQU5UV09SVA==");
  const login = H.formulare(seite("anmeldung-ilias"), "https://ovidius.uni-tuebingen.de/login.php");
  assert.deepEqual(login.map((x) => [x.name, x.action, x.felder]), [["formlogin", "https://ovidius.uni-tuebingen.de/shib_login.php", { sendLogin: "1" }]]);
  const auswahl = H.formulare('<form><select name="a"><option value="1">x</option><option value="2" selected>y</option></select>' +
    '<input type="checkbox" name="k" checked><input type="radio" name="r" value="b" checked><textarea name="t">A &amp; B</textarea></form>', idp);
  assert.deepEqual(auswahl[0].felder, { a: "2", k: "on", r: "b", t: "A & B" });
  assert.equal(auswahl[0].method, "get");
});

test("Typerkennung aus URL und Symbol", () => {
  const f = [
    ["https://ovidius.uni-tuebingen.de/goto.php/fold/1", "", "", "fold"],
    ["https://ovidius.uni-tuebingen.de/goto.php?target=exc_5&client_id=x", "", "", "exc"],
    ["ilias.php?baseClass=ilrepositorygui&cmdNode=yt:oa&cmdClass=ilObjFileGUI&cmd=sendfile&ref_id=3", "", "", "file"],
    ["ilias.php?baseClass=ilLinkResourceHandlerGUI&ref_id=3&cmd=calldirectlink", "", "", "webr"],
    ["ilias.php?baseClass=ilObjPluginDispatchGUI&cmd=forward&ref_id=3&forwardCmd=showContent", "x/templates/images/icon_xvid.svg", "", "xvid"],
    ["ilias.php?baseClass=ilrepositorygui&cmd=infoScreen&ref_id=3", "x/images/standard/icon_sess.svg", "Sitzung", "sess"],
    ["ilias.php?baseClass=ilrepositorygui&cmd=infoScreen&ref_id=3", "", "Sitzung", "sess"],
    ["ilias.php?baseClass=ilMediaPoolPresentationGUI&ref_id=3&cmd=", "", "", "mep"],
    ["ilias.php?baseClass=ilrepositorygui&ref_id=3", "", "", ""],
  ];
  for (const [url, src, alt, typ] of f) assert.equal(H.typVon(url, src, alt), typ, url);
});

test("Gruppen in einem Ordner: Mitglied über das Menü (Mitgliedschaft beenden), Beschreibung, Brotkrumen zum Kurs", () => {
  const e = H.inhalt(seite("gruppenordner"), BASIS);
  assert.deepEqual(e.map((x) => [x.typ, x.art, x.refId, x.mitglied]), [["grp", "ordner", "3000021", false], ["grp", "ordner", "3000024", true],
    ["grp", "ordner", "3000025", null]], "Beitreten = false, Mitgliedschaft beenden = true, ohne Menü = unbekannt");
  assert.equal(e[1].beschreibung, "Gruppe 4 - Mi. 8:00 - 10:00 - Hörsaal 1 (Beispielhaus 2)");
  const b = H.brotkrumen(seite("gruppenordner"), BASIS);
  assert.deepEqual(b.map((x) => x.typ + ":" + x.refId), ["fold:3000010", "crs:3000001", "cat:3000900", "root:1"]);
  assert.equal(b[1].titel, "X101 Beispielökonomik - WS26/27");
  assert.deepEqual(H.brotkrumen(seite("dashboard"), BASIS), [], "ohne Brotkrumen leer");
});
