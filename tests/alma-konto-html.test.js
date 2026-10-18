// Alma-Konto lesen (alma-konto-html.js): Anmeldeseite, angemeldet trotz verstecktem Anmeldeformular, Fehlerseiten, Leistungen
// und Belegungen (leer nur bei bekanntem Text und Aufbau, sonst unsicher), Zuordnung zu Modulcodes, Fingerabdruck ohne Werte.
// Alle Testseiten sind erfunden (tests/daten/alma-konto/, Aufbau nach echten Seiten bzw. nachgebaut). Läuft ohne Obsidian.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const SKRIPTE = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte");
const H = require(path.join(SKRIPTE, "ilias-html.js"));
const A = require(path.join(SKRIPTE, "alma-konto-html.js")).erzeugen(H);
const { laden } = require("./laden.js");
const seite = (name) => fs.readFileSync(path.join(__dirname, "daten", "alma-konto", name + ".html"), "utf8");
const CODES = ["B110", "B180", "S100", "SQ100", "E101", "B220"];
const START = "https://alma.uni-tuebingen.de/alma/pages/cs/sys/portal/hisinoneStartPage.faces";

test("Laden: Bibliothek ohne Netz und Zeitgeber, über ctx.user mit dem Zerleger aus ilias-html.js", () => {
  let n = 0;
  const z = () => { n++; return 0; };
  const r = laden("alma-konto-html", { kontext: { user: { "ilias-html": H }, zeit: z, intervall: z } }).ergebnis;
  assert.equal(n, 0);
  assert.equal(typeof r.leistungen, "function");
  assert.throws(() => require(path.join(SKRIPTE, "alma-konto-html.js")).erzeugen(null), /Zerleger/);
});

test("seite: anonym → anmeldung; angemeldet nur am Abmelde-Link, trotz #sessionTimeoutLoginForm", () => {
  assert.equal(A.seite(seite("start-anonym")), "anmeldung");
  for (const s of ["nach-anmeldung", "leistungen-leer", "belegungen-leer", "leistungen-voll"]) assert.equal(A.seite(seite(s)), "angemeldet", s);
  // ohne Abmelde-Link bleibt nur das versteckte Formular: keine Anmeldeseite
  const ohne = seite("nach-anmeldung").split("category=auth.logout").join("category=auth.x");
  assert.equal(A.seite(ohne), "unbekannt");
  assert.equal(A.seite(seite("anmeldung-fehler")), "anmeldung");
  assert.equal(A.seite(seite("wartung")), "unbekannt");
});

test("anmeldeFormular: #mobileLoginForm, nur versteckte Felder, action genau Alma", () => {
  const f = A.anmeldeFormular(seite("start-anonym"), START);
  assert.equal(f.action, "https://alma.uni-tuebingen.de/alma/rds?state=user&type=1&category=auth.login");
  assert.deepEqual(f.felder, [["userInfo", ""], ["ajax-token", "00000000-1111-4222-8333-444444444444"]]);
  const mit = (alt, neu) => A.anmeldeFormular(seite("start-anonym").split(alt).join(neu), START);
  const ALT = "https://alma.uni-tuebingen.de:443/alma/rds?state=user&amp;type=1&amp;category=auth.login";
  assert.equal(mit(ALT, "https://alma.uni-tuebingen.de.evil.example/alma/rds?category=auth.login"), null, "fremder Host");
  assert.equal(mit(ALT, "http://alma.uni-tuebingen.de/alma/rds?category=auth.login"), null, "kein https");
  assert.equal(mit(ALT, "https://alma.uni-tuebingen.de:8443/alma/rds?category=auth.login"), null, "anderer Port");
  assert.equal(mit(ALT, "https://x@alma.uni-tuebingen.de/alma/rds?category=auth.login"), null, "Benutzerteil");
  assert.equal(mit(ALT, "https://alma.uni-tuebingen.de/alma/anders?category=auth.login"), null, "anderer Pfad");
  assert.equal(mit(ALT, "https://alma.uni-tuebingen.de/alma/rds?category=auth.logout"), null, "nicht die Anmeldung");
  assert.equal(mit(ALT, "//evil.example/alma/rds?category=auth.login"), null, "protokollrelativ");
  assert.equal(mit('method="post"\n      action="https', 'method="get"\n      action="https'), null, "nur POST");
  assert.equal(mit(ALT, "/alma/rds?state=user&amp;type=1&amp;category=auth.login").action,
    "https://alma.uni-tuebingen.de/alma/rds?state=user&type=1&category=auth.login", "relativ zur Seite auf Alma");
  // Angemeldete Seite: nur das versteckte Formular → kein Anmeldeformular
  assert.equal(A.anmeldeFormular(seite("nach-anmeldung"), START), null);
});

test("fehler: abgelehnt (bekannte Meldung), unklar, zweiter Faktor, Zustimmung, Wartung, sonst unerwartet", () => {
  assert.equal(A.fehler(seite("anmeldung-fehler")), "zugang-falsch");
  assert.equal(A.fehler(seite("anmeldung-fehler").replace("Ihre Anmeldung war leider nicht erfolgreich.", "Etwas ist anders.")), "abgelehnt-unklar");
  assert.equal(A.fehler(seite("start-anonym")), "abgelehnt-unklar", "Formular ohne Meldung (z. B. Kekse verloren)");
  assert.equal(A.fehler(seite("zwei-faktor")), "zwei-faktor");
  assert.equal(A.fehler(seite("zustimmung")), "zustimmung");
  assert.equal(A.fehler(seite("wartung")), "wartung");
  assert.equal(A.fehler("<html><body><p>Irgendwas</p></body></html>"), "unerwartet");
});

test("Leistungen leer: nur bekannter Text und kein Baum; anderer Hinweis oder fehlender Bereich → unsicher", () => {
  assert.deepEqual(A.leistungen(seite("leistungen-leer")), { art: "leer", zeilen: [] });
  assert.deepEqual(A.leistungen(seite("leistungen-unbekannter-hinweis")), { art: "unsicher", grund: "hinweis", zeilen: [] });
  assert.equal(A.leistungen(seite("leistungen-leer").replace("Es wurden keine Datensätze gefunden.", "No records found.")).art, "unsicher", "englisch vorerst unsicher");
  assert.equal(A.leistungen(seite("leistungen-leer").replace("Es wurden keine Datensätze gefunden.", "")).grund, "aufbau");
  assert.equal(A.leistungen(seite("belegungen-leer")).grund, "aufbau", "falsche Seite");
  assert.equal(A.leistungen(seite("leistungen-leer").replace("<legend>", "<table><tr><td>x</td></tr></table><legend>")).art, "unsicher", "Tabelle ohne Baum");
});

test("Leistungen voll: Zeilen mit Ebene, Art, Status aus der Langform, Note, Versuch, Semester, Datum", () => {
  const L = A.leistungen(seite("leistungen-voll"));
  assert.equal(L.art, "ok");
  assert.equal(L.zeilen.length, 10);
  const b110 = L.zeilen[2];
  assert.deepEqual(b110, { ebene: 3, art: "modul", nummer: "B110", status: "bestanden", note: "1,7", unbenotet: false, versuch: 1,
    semester: "WS 2026/27", datum: "2027-02-12" });
  assert.equal(L.zeilen[1].status, "", "PV auf Konto-Ebene ohne Aussage");
  assert.equal(L.zeilen[5].nummer, "10010");
  assert.equal(L.zeilen[5].status, "nicht bestanden");
  assert.equal(L.zeilen[6].status, "angemeldet", "AN mit Langform angemeldet");
  assert.equal(L.zeilen[8].status, "anerkannt", "AN mit Langform anerkannt");
  assert.equal(L.zeilen[8].unbenotet, true);
  assert.equal(L.zeilen[8].semester, "SS 2026");
  assert.equal(L.zeilen[9].status, "endgültig nicht bestanden");
  assert.equal(L.zeilen[9].versuch, 3);
  // nie Titel, Vermerk, Prüfer:innen, Name, Nummer aus dem Kopf
  const alles = JSON.stringify(L);
  for (const x of ["Musterfrau", "Mustermann", "Freiversuch", "Einführung", "7654321", "Erika", "Anerkennung"]) assert.ok(alles.indexOf(x) < 0, x);
});

test("Leistungen: umsortierte und fehlende Spalten, unbekannter Kopf → id-Endung; englische Oberfläche", () => {
  const L = A.leistungen(seite("leistungen-angepasst"));
  assert.equal(L.art, "ok");
  const z = L.zeilen[2];
  assert.equal(z.nummer, "B110");
  assert.equal(z.status, "bestanden");
  assert.equal(z.note, "1,7", "Kopf „Bewertung“ unbekannt: über :grade");
  assert.equal(z.versuch, 1);
  assert.equal(z.semester, "", "Spalte fehlt");
  assert.equal(z.datum, "");
  const E = A.leistungen(seite("leistungen-englisch"));
  assert.equal(E.art, "ok");
  assert.deepEqual(E.zeilen.map((x) => x.status), ["", "", "bestanden", "bestanden", "", "nicht bestanden", "angemeldet", "angemeldet", "anerkannt", "endgültig nicht bestanden"]);
  assert.deepEqual(E.zeilen.map((x) => x.art), ["abschluss", "konto", "modul", "pruefung", "modul", "pruefung", "modul", "pruefung", "modul", "modul"]);
  assert.equal(E.zeilen[2].semester, "WS 2026/27");
  assert.equal(E.zeilen[8].unbenotet, true);
});

test("Leistungen fail-closed: Kurzform ohne Langform, unbekannter Status, ungültige Note, abgeschlossen ohne Note", () => {
  const voll = seite("leistungen-voll");
  const ohneTitel = voll.replace(' title="angemeldet">AN<', ">AN<");
  assert.deepEqual(A.leistungen(ohneTitel), { art: "unsicher", grund: "zeile", zeilen: [] }, "„AN“ ohne Langform");
  assert.equal(A.leistungen(voll.replace('title="bestanden"', 'title="vorläufig"')).art, "unsicher", "unbekannte Langform");
  assert.equal(A.leistungen(voll.replace('title="bestanden">BE', 'title="bestanden">NB')).art, "unsicher", "Kurz- und Langform widersprechen sich");
  assert.equal(A.leistungen(voll.replace(">1,7</span>", ">1,6</span>")).art, "ok", "1,6 ist eine Note in Zehnteln");
  assert.equal(A.leistungen(voll.replace(">1,7</span>", ">4,7</span>")).art, "unsicher", "über 4,0 nur 5,0");
  assert.equal(A.leistungen(voll.replace(">5,0</span>", "></span>")).art, "unsicher", "nicht bestanden ohne Note");
  assert.equal(A.leistungen(voll.replace(">BE</span>", ">vielleicht</span>").replace(' title="bestanden"', "")).art, "unsicher");
  assert.equal(A.leistungen(voll.split("treeTableCellLevel").join("zeile")).grund, "aufbau", "Zeilen ohne Ebene");
});

test("Leistungen zugeklappt: Knopf „Alle aufklappen“ mit allen versteckten Feldern; ohne Knopf kein Aufklappen", () => {
  const L = A.leistungen(seite("leistungen-zugeklappt"), "https://alma.uni-tuebingen.de/alma/pages/sul/examAssessment/personExamsReadonly.xhtml");
  assert.equal(L.art, "zugeklappt");
  assert.equal(L.aufklappen.action, "https://alma.uni-tuebingen.de/alma/pages/sul/examAssessment/personExamsReadonly.xhtml?_flowId=examsOverviewForPerson-flow&_flowExecutionKey=e1s1");
  const namen = L.aufklappen.felder.map((f) => f[0]);
  for (const n of ["authenticity_token", "javax.faces.ViewState", "examsReadonly_SUBMIT", "activePageElementId", "examsReadonly:overviewAsTreeReadonly:tree:expandAll2"]) assert.ok(namen.indexOf(n) >= 0, n);
  const ohneKnopf = seite("leistungen-zugeklappt").split(":expandAll2").join(":andererKnopf");
  assert.equal(A.leistungen(ohneKnopf).aufklappen, null);
});

test("Zuordnen: Nummer beginnt mit Modulcode (längster, danach keine Ziffer), sonst die Modulzeile darüber", () => {
  const z = A.zuordnen(A.leistungen(seite("leistungen-voll")).zeilen, CODES.concat(["B11"]));
  assert.deepEqual(z.map((x) => x.code), ["", "", "B110", "B110", "S100", "S100", "B180", "B180", "SQ100", "E101"]);
  assert.equal(A.zuordnen([{ ebene: 3, art: "modul", nummer: "B1105" }], ["B110"])[0].code, "", "B1105 ist nicht B110");
  assert.equal(A.zuordnen([{ ebene: 3, art: "modul", nummer: "B321B" }], ["B321", "B321B"])[0].code, "B321B", "längster Treffer");
  // Modul ohne Tresor-Notiz: seine Prüfungen bekommen keinen fremden Code von oben
  const o = A.zuordnen([{ ebene: 3, art: "modul", nummer: "B110" }, { ebene: 3, art: "modul", nummer: "X999" }, { ebene: 4, art: "pruefung", nummer: "123" }], ["B110"]);
  assert.deepEqual(o.map((x) => x.code), ["B110", "", ""]);
});

test("zusammenfassen: eine Aussage je Code, eindeutig nur Modulzeile oder genau eine Prüfung; Status mit Semester", () => {
  const m = A.zusammenfassen(A.zuordnen(A.leistungen(seite("leistungen-voll")).zeilen, CODES));
  assert.deepEqual(Object.keys(m).sort(), ["B110", "B180", "E101", "S100", "SQ100"]);
  assert.deepEqual(m.B110, { status: "bestanden", note: "1,7", unbenotet: false, versuch: 1, semester: "WS 2026/27", datum: "2027-02-12", eindeutig: true,
    stati: [{ status: "bestanden", semester: "WS 2026/27" }] });
  assert.equal(m.S100.status, "nicht bestanden");
  assert.equal(m.S100.eindeutig, true, "genau eine Prüfung");
  assert.equal(m.SQ100.status, "anerkannt");
  const zwei = A.zusammenfassen([
    { ebene: 3, art: "modul", nummer: "S100", status: "", code: "S100" },
    { ebene: 4, art: "pruefung", nummer: "1", status: "nicht bestanden", note: "5,0", versuch: 1, semester: "WS 2026/27", code: "S100" },
    { ebene: 4, art: "pruefung", nummer: "2", status: "angemeldet", note: "", versuch: 2, semester: "SS 2027", code: "S100" },
  ]);
  assert.equal(zwei.S100.status, "angemeldet", "der letzte Versuch");
  assert.equal(zwei.S100.versuch, 2);
  assert.equal(zwei.S100.eindeutig, false);
  assert.equal(zwei.S100.stati.length, 2);
});

test("Belegungen leer und voll; Semester aus der gewählten Option; fail-closed bei Unbekanntem", () => {
  assert.deepEqual(A.belegungen(seite("belegungen-leer")), { art: "leer", semester: "WS 2026/27", eintraege: [] });
  const B = A.belegungen(seite("belegungen-voll"));
  assert.equal(B.art, "ok");
  assert.deepEqual(B.eintraege.map((e) => [e.nummer, e.status]), [["B110", "angemeldet"], ["S100", "zurückgetreten"], ["B180K", "zugelassen"]]);
  const z = A.pruefungenZuordnen(B.eintraege, CODES);
  assert.deepEqual(z, { pruefungen: { B110: { status: "angemeldet" }, S100: { status: "zurückgetreten" }, B180: { status: "zugelassen" } }, unzugeordnet: 0 });
  assert.equal(A.pruefungenZuordnen([{ nummer: "10044", titel: "Klausur E101 Volkswirtschaft", status: "angemeldet" }], CODES).pruefungen.E101.status, "angemeldet", "Code im Titel");
  assert.equal(A.pruefungenZuordnen([{ nummer: "10044", titel: "Statistik", status: "angemeldet" }], CODES).unzugeordnet, 1);
  const leer = seite("belegungen-leer");
  assert.equal(A.belegungen(leer.replace("Sie haben bisher keine Veranstaltungen belegt und keine Prüfungen angemeldet.", "Die Anmeldung beginnt am 07.12.")).grund, "hinweis");
  assert.equal(A.belegungen(leer.replace(' selected="selected"', "")).grund, "semester");
  assert.equal(A.belegungen(leer.replace("Wintersemester 2026/27</option>", "Irgendwann</option>")).grund, "semester");
  assert.equal(A.belegungen(seite("belegungen-voll").replace(">zurückgetreten<", ">unklar<")).grund, "eintrag");
  assert.equal(A.belegungen(seite("belegungen-voll").replace("<h2>Prüfung: S100", "<h2>Etwas: S100")).grund, "eintrag");
  assert.equal(A.belegungen(seite("leistungen-leer")).grund, "aufbau");
});

test("semesterName und noteNorm", () => {
  assert.equal(A.semesterName("Wintersemester 2026/27"), "WS 2026/27");
  assert.equal(A.semesterName(" WiSe 2026/2027 "), "WS 2026/27");
  assert.equal(A.semesterName("Winter semester 2026/27"), "WS 2026/27");
  assert.equal(A.semesterName("Sommersemester 2027"), "SS 2027");
  assert.equal(A.semesterName("SoSe 2027"), "SS 2027");
  assert.equal(A.semesterName("2027"), "");
  assert.equal(A.noteNorm("1.3"), "1,3");
  assert.equal(A.noteNorm("5,0"), "5,0");
  assert.equal(A.noteNorm("5,3"), "");
  assert.equal(A.noteNorm("0,7"), "");
});

test("Fingerabdruck: Aufbau ohne Werte (keine Namen, Noten, Nummern, Titel)", () => {
  for (const s of ["leistungen-voll", "leistungen-englisch", "belegungen-voll", "leistungen-unbekannter-hinweis", "anmeldung-fehler", "nach-anmeldung"]) {
    const f = A.fingerabdruck(seite(s));
    for (const x of ["Musterfrau", "Mustermann", "Erika", "EM", "7654321", "1,7", "5,0", "B110", "S100", "10010", "Einführung", "Mathematik",
      "Freiversuch", "12.02.2027", "2027", "Parallelgruppe", "Klausur"]) assert.ok(f.indexOf(x) < 0, s + ": " + x + "\n" + f);
  }
  const f = A.fingerabdruck(seite("leistungen-voll"));
  assert.match(f, /leistungen: ok/);
  assert.match(f, /zeile: ebene 3 · art modul · status bestanden · note ja/);
  assert.match(f, /tabelle: table#examsReadonly:overviewAsTreeReadonly:tree:ExamOverviewForPersonTreeReadonly\.treeTableWithIcons \| - \| nummer \| titel/);
  assert.match(A.fingerabdruck(seite("leistungen-unbekannter-hinweis")), /hinweis: Die X steht zurzeit nicht zur X\./);
  assert.match(A.fingerabdruck(seite("anmeldung-fehler")), /meldung: Ihre Anmeldung war leider nicht erfolgreich\. Es wurden zu viele Login-Fehlversuche/);
});
