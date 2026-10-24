// Wochenraster auf Dashboard und Stundenplan (woche.js, Codeblock eba-woche): welche Woche (nur aus dem Gerätespeicher, nach
// 30 Minuten und nach einem Neustart wieder die aktuelle), Kästen der Woche (von/bis, Ausfälle, Pausen, Änderungen, c.t.,
// Kurzname, Art und Gruppe, Überschneidungen), leere Wochen, Wischen. Semester, Pausen, freie Tage und „findet statt“ kommen
// aus dem Fachmodell (Semesterdaten tests/daten/v1). Nur ausgedachte Stundenplan-Daten (Codes X100 …).
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden, json } = require("./laden.js");

// Ausgedachte Einstellungen: eine zentrale Vorlesung ist ausgeblendet („Besuche ich nicht“)
const EINST = { stundenplan_ausgeblendet: ["ws-2026-27-x900-vorlesung-1-fr-1000"] };
const MODELL = laden("modell", { heute: "2026-10-17", frontmatter: { "System/Daten/Semester.md": json("semester.json"), "System/Einstellungen.md": EINST } }).ctx.modell;
const W = laden("woche", { kontext: { modell: MODELL } }).ergebnis;
const tag = (s, uhr = "12:00:00") => new Date(s + "T" + uhr);

test("Aktuelle Woche: Montag bis Freitag diese, Samstag und Sonntag die nächste; Kalenderwoche nach ISO", () => {
  const m = (s, uhr) => W.aktuellerMontag(tag(s, uhr)).toDateString();
  assert.equal(m("2026-10-19"), tag("2026-10-19").toDateString()); // Montag
  assert.equal(m("2026-10-23", "23:59:00"), tag("2026-10-19").toDateString()); // Freitag spät
  assert.equal(m("2026-10-24", "00:01:00"), tag("2026-10-26").toDateString()); // Samstag
  assert.equal(m("2026-10-25"), tag("2026-10-26").toDateString()); // Sonntag, Tag der Zeitumstellung
  assert.equal(m("2026-12-31"), tag("2026-12-28").toDateString());
  assert.equal(W.kw(tag("2026-10-19")), 43);
  assert.equal(W.kw(tag("2026-12-28")), 53);
  assert.equal(W.kw(tag("2027-01-04")), 1);
});

test("Versatz: gilt nur in derselben Sitzung und höchstens 30 Minuten, Unsinn heißt aktuelle Woche", () => {
  const t = tag("2026-10-17").getTime(), s = "sitzung-a";
  assert.equal(W.versatzAus(W.versatzWert(2, t, s), t + 60000, s), 2);
  assert.equal(W.versatzAus(W.versatzWert(-1, t, s), t + 29 * 60000, s), -1);
  assert.equal(W.versatzAus(W.versatzWert(2, t, s), t + 30 * 60000, s), 0); // 30 Minuten vorbei
  assert.equal(W.versatzAus(W.versatzWert(2, t, s), t + 1000, "sitzung-b"), 0); // Obsidian neu gestartet
  assert.equal(W.versatzAus(W.versatzWert(2, t, s), t - 1000, s), 0); // Uhr zurückgestellt
  assert.equal(W.versatzAus({ versatz: 1.5, zeit: t, sitzung: s }, t, s), 0);
  assert.equal(W.versatzAus({ versatz: 99, zeit: t, sitzung: s }, t, s), 0);
  assert.equal(W.versatzAus("kein json", t, s), 0);
  assert.equal(W.versatzAus(null, t, s), 0);
  assert.equal(W.versatzWert(0, t, s), null); // aktuelle Woche: Eintrag löschen
});

test("Versatz kommt nur aus dem Gerätespeicher; ein Wechsel schreibt keine Datei", () => {
  // Notiz der früheren Lösung (abgeglichen) ist da und zeigt eine andere Woche: zählt nicht
  const L = laden("woche", { heute: "2026-10-17", frontmatter: { "System/Daten/Woche.md": { montag: "2026-11-02", gesetzt: "2026-10-17T11:59:00" } } });
  const speicher = {};
  L.ctx.app.loadLocalStorage = (k) => (k in speicher ? speicher[k] : null);
  L.ctx.app.saveLocalStorage = (k, v) => { if (v === null) delete speicher[k]; else speicher[k] = v; };
  const geschrieben = [];
  for (const k of ["create", "modify", "process", "append"]) L.ctx.app.vault[k] = () => geschrieben.push(k);
  assert.equal(L.ergebnis.versatz(), 0);
  L.ergebnis.aktionen.woche.ausfuehren({ parameter: { schritt: "1" } });
  assert.equal(L.ergebnis.versatz(), 1);
  assert.deepEqual(Object.keys(speicher), ["eba-woche-versatz"]);
  L.ergebnis.aktionen.woche.ausfuehren({ parameter: { schritt: "0" } });
  assert.equal(L.ergebnis.versatz(), 0);
  assert.deepEqual(Object.keys(speicher), []);
  assert.deepEqual(geschrieben, []);
});

// Ausgedachter Stundenplan im WS 2026/27 (Semesterdaten: Vorlesungen ab 12.10., Weihnachtspause 23.12.–6.1.)
const lv = (pfad, fm) => ({ pfad, fm: Object.assign({ typ: "lehrveranstaltung", semester: "WS 2026/27", raum: "Hörsaal 1" }, fm) });
const NOTIZEN = [
  lv("Stundenplan/Mo X110.md", { titel: "Beispieldatenanalyse · Veranstaltung", code: "X110", art: "Veranstaltung", wochentag: 1, beginn: "08:00", ende: "10:00", von: "2026-10-12", bis: "2027-02-01", modul: "[[X110 Beispieldatenanalyse]]" }),
  lv("Stundenplan/Mi X101 Übung.md", { titel: "Beispielökonomik · Übung Gruppe 2", code: "X101", art: "Übung", gruppe: "2", wochentag: 3, beginn: "08:15", ende: "09:45", von: "2026-10-21", bis: "2027-02-03" }),
  lv("Stundenplan/Mi X101.md", { titel: "Beispielökonomik · Vorlesung", code: "X101", art: "Vorlesung", wochentag: 3, beginn: "10:00", ende: "12:00", von: "2026-10-14", bis: "2027-02-03", ausfall: ["2026-12-30"] }),
  lv("Stundenplan/Di X180 Tutorium.md", { titel: "Beispielabschluss · Tutorium 1", code: "X180", art: "Tutorium", gruppe: "Tutorium 1", gruppe_alma: "5", wochentag: 2, beginn: "08:15", ende: "09:45", von: "2026-10-27", bis: "2027-02-02", herkunft: "ilias-gruppe" }),
  lv("Stundenplan/Di X100.md", { titel: "Beispielmathematik · Vorlesung", code: "X100", art: "Vorlesung", wochentag: 2, beginn: "10:00", ende: "12:00", von: "2026-10-13", bis: "2027-02-02" }),
  lv("Stundenplan/Di X100 Tutorium.md", { titel: "Beispielmathematik · Tutorium Gruppe 4", code: "X100", art: "Tutorium", gruppe: "Gruppe 4", wochentag: 2, beginn: "10:15", ende: "11:45", von: "2026-10-20", bis: "2027-02-02", herkunft: "gruppe-gewaehlt", gruppe_id: "x100-4" }),
  lv("Stundenplan/Do X200.md", { titel: "Beispielfinanzierung · Vorlesung", code: "X200", art: "Vorlesung", wochentag: 4, beginn: "10:00", ende: "12:00", von: "2026-10-15", bis: "2027-02-04", herkunft: "zentral", aenderungen: ["2026-10-22|12:15|13:45|Hörsaal 9"] }),
  lv("Stundenplan/Fr X900.md", { titel: "Ausgeblendet", code: "X900", wochentag: 5, beginn: "10:00", ende: "12:00", herkunft: "zentral", zentral_id: "ws-2026-27-x900-vorlesung-1-fr-1000" }),
  lv("Stundenplan/Fr X901.md", { titel: "Entfällt", code: "X901", wochentag: 5, beginn: "10:00", ende: "12:00", entfaellt: true }),
  lv("Stundenplan/Fr X902.md", { titel: "Anderes Semester", code: "X902", wochentag: 5, beginn: "10:00", ende: "12:00", semester: "SoSe 2027" }),
];
// Modulnotizen nach Name und Pfad (wie lesen()); ein gleichnamiger Karteikarten-Stapel darf nie das Ziel sein
const MODULPFAD = { "X110 Beispieldatenanalyse": "Module/1 Grundstudium/X110 Beispieldatenanalyse.md", "Module/1 Grundstudium/X110 Beispieldatenanalyse": "Module/1 Grundstudium/X110 Beispieldatenanalyse.md" };
const woche = (montag, jetzt = "2026-10-17T12:00:00", modulPfad = MODULPFAD) => W.wocheBauen({ notizen: NOTIZEN, kurzVonCode: { X110: "Daten", X101: "Ökonomik" }, modulPfad, modell: MODELL, montag: tag(montag), jetzt: new Date(jetzt) });
const kasten = (w, pfad) => w.kaesten.find((k) => k.pfad === pfad);

test("Woche 19.10.: was noch nicht begonnen hat, blass mit „ab TT.MM.“; Ausgeblendetes, Entfallenes und andere Semester fehlen", () => {
  const w = woche("2026-10-19");
  assert.deepEqual(w.tage, ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  assert.equal(w.kw, 43);
  assert.deepEqual(w.kaesten.map((k) => k.pfad).sort(), ["Stundenplan/Di X100 Tutorium.md", "Stundenplan/Di X100.md", "Stundenplan/Di X180 Tutorium.md",
    "Stundenplan/Do X200.md", "Stundenplan/Mi X101 Übung.md", "Stundenplan/Mi X101.md", "Stundenplan/Mo X110.md"]);
  assert.equal(w.leer, "");
  assert.equal(w.h0, 8);
  assert.equal(w.h1, 14); // die Änderung am Donnerstag reicht bis 13:45
  assert.equal(woche("2026-10-26").h1, 12);
  // das Tutorium ab 27.10. steht schon da: blass, sein Beginn statt der Uhrzeit, nie „heute“ oder „jetzt“
  const t = kasten(w, "Stundenplan/Di X180 Tutorium.md");
  assert.deepEqual([t.zeit, t.raum, t.klassen.join(" ")], ["ab 27.10.", "Hörsaal 1", "eba-ev ue spaeter"]);
  assert.match(t.titel, /· beginnt am 27\.10\.$/);
  assert.deepEqual(kasten(woche("2026-10-19", "2026-10-20T09:00:00"), "Stundenplan/Di X180 Tutorium.md").klassen, ["eba-ev", "ue", "spaeter"]);
  // eine Woche später findet es statt
  const t2 = kasten(woche("2026-10-26"), "Stundenplan/Di X180 Tutorium.md");
  assert.deepEqual([t2.zeit, t2.klassen.includes("spaeter")], ["08:15", false]);
});

test("Nach bis kein Kasten; vor von nur in Wochen, in denen etwas stattfindet", () => {
  const n = [
    lv("Stundenplan/Mo X120.md", { titel: "Beispiel · Vorlesung", code: "X120", art: "Vorlesung", wochentag: 1, beginn: "10:00", ende: "12:00", von: "2026-10-12", bis: "2026-10-26" }),
    lv("Stundenplan/Mi X120 Tutorium.md", { titel: "Beispiel · Tutorium 5", code: "X120", art: "Tutorium", wochentag: 3, beginn: "14:15", ende: "15:45", von: "2026-11-04", bis: "2027-02-03" }),
  ];
  const w = (montag) => W.wocheBauen({ notizen: n, kurzVonCode: {}, modulPfad: {}, modell: MODELL, montag: tag(montag), jetzt: new Date("2026-10-17T12:00:00") })
    .kaesten.map((k) => k.pfad + (k.klassen.includes("spaeter") ? " " + k.zeit : "")).sort();
  assert.deepEqual(w("2026-10-26"), ["Stundenplan/Mi X120 Tutorium.md ab 04.11.", "Stundenplan/Mo X120.md"]);
  assert.deepEqual(w("2026-11-02"), ["Stundenplan/Mi X120 Tutorium.md"], "nach dem letzten Termin fehlt die Vorlesung");
  assert.deepEqual(w("2026-10-05"), [], "vor Vorlesungsbeginn nur der Satz");
});

test("Kästen: Kurzname, Art und Gruppe (Name aus gruppe, nie gruppe_alma), Beginn nur bei c.t., Lage im Raster", () => {
  const w = woche("2026-10-26");
  const mo = kasten(w, "Stundenplan/Mo X110.md");
  assert.deepEqual([mo.kurz, mo.art, mo.zeit, mo.von, mo.bis, mo.klassen.join(" ")], ["Daten", "", "", 2, 10, "eba-ev vl"]);
  assert.equal(mo.notiz, "Module/1 Grundstudium/X110 Beispieldatenanalyse.md", "Modul über den vollen Pfad, nicht über den Namen");
  assert.equal(kasten(w, "Stundenplan/Mi X101.md").notiz, "Stundenplan/Mi X101.md", "ohne Modul-Link die Notiz selbst");
  assert.equal(kasten(woche("2026-10-26", undefined, {}), "Stundenplan/Mo X110.md").notiz, "Stundenplan/Mo X110.md", "Modulnotiz fehlt: nie nur der Name");
  const ue = kasten(w, "Stundenplan/Mi X101 Übung.md");
  assert.deepEqual([ue.kurz, ue.art, ue.zeit, ue.von, ue.bis, ue.klassen[1]], ["Ökonomik", "Übung Gruppe 2", "08:15", 3, 9, "ue"]);
  assert.equal(kasten(w, "Stundenplan/Di X180 Tutorium.md").art, "Tutorium 1");
  assert.equal(kasten(w, "Stundenplan/Di X100 Tutorium.md").art, "Tutorium Gruppe 4");
  assert.equal(kasten(w, "Stundenplan/Di X100.md").kurz, "X100"); // ohne Kurznamen der Code
  assert.equal(W.kurzname({ titel: "Ohne Code · Vorlesung" }, {}), "Ohne Code");
  assert.equal(W.artText({ art: "Veranstaltung", gruppe: "3" }), "");
});

test("Eine Gruppe je Modul und Art: eine zweite Gruppen-Notiz desselben Tutoriums fehlt im Raster (meine-gruppe.js doppelt)", () => {
  const MG = laden("meine-gruppe").ergebnis;
  const gr = (pfad, fm) => lv(pfad, Object.assign({ code: "X180", art: "Tutorium", modul: "", von: "2026-11-03", bis: "2027-02-04" }, fm));
  const n = [
    gr("Stundenplan/Di 10.15 X180 Tutorium Gruppe 1 (gewählt).md", { titel: "Beispielabschluss · Tutorium Gruppe 1", wochentag: 2, beginn: "10:15", ende: "11:45", herkunft: "gruppe-gewaehlt", gruppe_id: "t1" }),
    gr("Stundenplan/Do 08.15 X180 Tutorium Gruppe 7 (ILIAS).md", { titel: "Beispielabschluss · Tutorium Gruppe 7", wochentag: 4, beginn: "08:15", ende: "09:45", herkunft: "ilias-gruppe", ilias_gruppe: "17", gruppe_id: "t7", von: "2026-11-05" }),
    NOTIZEN[4],
  ];
  const w = W.wocheBauen({ notizen: n, kurzVonCode: {}, modulPfad: {}, modell: MODELL, montag: tag("2026-10-26"), jetzt: new Date("2026-10-19T12:00:00"), verdeckt: MG.doppelt(n).verdeckt });
  assert.deepEqual(w.kaesten.map((k) => k.pfad).sort(), ["Stundenplan/Di X100.md", "Stundenplan/Do 08.15 X180 Tutorium Gruppe 7 (ILIAS).md"]);
  assert.equal(W.wocheBauen({ notizen: n, kurzVonCode: {}, modulPfad: {}, modell: MODELL, montag: tag("2026-10-26"), jetzt: new Date("2026-10-19T12:00:00") }).kaesten.length, 3, "ohne Regel beide");
});

test("Alma-Notiz einer anderen Gruppe deines Kurses fehlt im Raster, und deine andere Gruppe meldet keine Überschneidung mit ihr", () => {
  // Alma-Abo mit Tutorium 1 von X180 („Übung zu …“), deine Gruppe ist Tutorium 7 (ILIAS); dein X100-Tutorium liegt zur Zeit von
  // Tutorium 1
  const MG = laden("meine-gruppe").ergebnis;
  const liste = [
    { id: "t1", code: "X180", art: "Tutorium", tag: "Di", von: "10:00", bis: "12:00", ct: true, semester: "WS 2026/27" },
    { id: "t7", code: "X180", art: "Tutorium", tag: "Do", von: "08:00", bis: "10:00", ct: true, semester: "WS 2026/27" },
  ];
  const alma = "Stundenplan/Di 10.00 X180 Übung.md", mathe = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 4 (ILIAS).md";
  const n = [
    lv(alma, { titel: "X180 · Übung", code: "X180", art: "Übung", wochentag: 2, beginn: "10:00", ende: "12:00", von: "2026-11-03", bis: "2027-02-02", herkunft: "alma" }),
    lv("Stundenplan/Do 08.15 X180 Tutorium Gruppe 7 (ILIAS).md", { titel: "Beispielabschluss · Tutorium Gruppe 7", code: "X180", art: "Tutorium", wochentag: 4, beginn: "08:15", ende: "09:45",
      von: "2026-11-05", bis: "2027-02-04", herkunft: "ilias-gruppe", ilias_gruppe: "17", gruppe_id: "t7" }),
    lv(mathe, { titel: "Beispielmathematik · Tutorium Gruppe 4", code: "X100", art: "Tutorium", wochentag: 2, beginn: "10:15", ende: "11:45", von: "2026-10-20", bis: "2027-02-02",
      herkunft: "ilias-gruppe", ilias_gruppe: "4", gruppe_id: "m4" }),
  ];
  const bauen = (verdeckt) => W.wocheBauen({ notizen: n, kurzVonCode: {}, modulPfad: {}, modell: MODELL, montag: tag("2026-11-02"), jetzt: new Date("2026-10-20T14:50:00"), verdeckt });
  const w = bauen(MG.doppelt(n, liste).verdeckt);
  assert.deepEqual(w.kaesten.map((k) => k.pfad).sort(), [mathe, "Stundenplan/Do 08.15 X180 Tutorium Gruppe 7 (ILIAS).md"]);
  const m = kasten(w, mathe);
  assert.ok(!m.klassen.includes("konflikt"));
  assert.doesNotMatch(m.titel, /überschneidet/);
  assert.equal(m.spalten, 1, "volle Breite");
  // ohne Gruppenliste (zentrale Daten aus) bleibt die Alma-Notiz, und die Überschneidung gilt
  const ohne = bauen(MG.doppelt(n).verdeckt);
  assert.equal(ohne.kaesten.length, 3);
  assert.ok(kasten(ohne, mathe).klassen.includes("konflikt"));
  assert.match(kasten(ohne, mathe).titel, /überschneidet sich mit Di 10\.00 X180 Übung$/);
});

test("Warnpunkt beim Zeichnen gerechnet: nur für Gruppen-Notizen, nur mit einer Notiz im Raster, ein altes Feld konflikt zählt nicht", () => {
  const tut = NOTIZEN[5], vl = NOTIZEN[4];
  const bauen = (n, verdeckt, pfad) => kasten(W.wocheBauen({ notizen: n, kurzVonCode: {}, modulPfad: {}, modell: MODELL, montag: tag("2026-10-26"), jetzt: new Date("2026-10-17T12:00:00"), verdeckt }), pfad || tut.pfad);
  const warnt = (n, verdeckt) => bauen(n, verdeckt).klassen.includes("konflikt");
  const am = (x, fm) => lv(x.pfad.replace(/\.md$/, " (Di).md"), Object.assign({}, x.fm, { wochentag: 2 }, fm));
  assert.ok(warnt([vl, tut]));
  assert.ok(!bauen([vl, tut], null, vl.pfad).klassen.includes("konflikt"), "die Vorlesung selbst ist keine Gruppe");
  const verlegt = lv(vl.pfad, Object.assign({}, vl.fm, { beginn: "14:00", ende: "16:00" }));
  assert.ok(!warnt([verlegt, tut]), "verlegt: keine Überschneidung mehr");
  assert.ok(!warnt([verlegt, lv(tut.pfad, Object.assign({}, tut.fm, { konflikt: "Di X100" }))]), "altes Feld konflikt");
  assert.ok(warnt([verlegt, am(NOTIZEN[0], { beginn: "11:00", ende: "12:00" }), tut]), "neue Notiz zur selben Zeit");
  assert.ok(!warnt([am(NOTIZEN[7]), tut]), "Besuche ich nicht");
  assert.ok(!warnt([am(NOTIZEN[8]), tut]), "entfällt");
  assert.ok(!warnt([vl, tut], { [vl.pfad]: "Stundenplan/Fr X900.md" }), "verdeckt");
  assert.ok(!warnt([am(NOTIZEN[0], { beginn: "10:00", ende: "12:00", einzeltermin: true, von: "2026-10-27", bis: "2026-10-27" }), tut]), "Einzeltermin");
  assert.ok(!warnt([lv(vl.pfad, Object.assign({}, vl.fm, { herkunft: "gruppe-gewaehlt", gruppe_id: "x100-4" })), tut]), "dieselbe Gruppe");
});

test("Antippen öffnet das Modul über den Pfad, auch bei Link mit Pfad, Alias oder Abschnitt", () => {
  const n = [lv("Stundenplan/Mo X110.md", Object.assign({}, NOTIZEN[0].fm, { modul: "[[Module/1 Grundstudium/X110 Beispieldatenanalyse#Prüfung|X110]]" }))];
  const w = W.wocheBauen({ notizen: n, kurzVonCode: {}, modulPfad: MODULPFAD, modell: MODELL, montag: tag("2026-10-26"), jetzt: new Date("2026-10-17T12:00:00") });
  assert.equal(w.kaesten[0].notiz, "Module/1 Grundstudium/X110 Beispieldatenanalyse.md");
});

test("Überschneidung: nebeneinander, konflikt mit Warnung im Tooltip", () => {
  const w = woche("2026-10-26");
  const a = kasten(w, "Stundenplan/Di X100.md"), b = kasten(w, "Stundenplan/Di X100 Tutorium.md"), c = kasten(w, "Stundenplan/Di X180 Tutorium.md");
  assert.deepEqual([a.spalte, a.spalten, b.spalte, b.spalten], [0, 2, 1, 2]);
  assert.equal(c.spalten, 1); // 08:15–09:45 überschneidet sich mit nichts
  assert.ok(b.klassen.includes("konflikt"));
  assert.match(b.titel, /überschneidet sich mit Di X100$/);
  const s = W.spalten([{ tag: 1, von: 2, bis: 10 }, { tag: 1, von: 4, bis: 6 }, { tag: 1, von: 5, bis: 8 }, { tag: 1, von: 10, bis: 12 }]);
  assert.deepEqual(s.map((k) => k.spalte + "/" + k.spalten), ["0/3", "1/3", "2/3", "0/1"]);
});

test("Änderung in dieser Woche: neue Zeit und neuer Raum, Kasten an der neuen Zeit, Ausnahme mit dem üblichen Wert dazu", () => {
  const d = kasten(woche("2026-10-19"), "Stundenplan/Do X200.md");
  assert.ok(d.klassen.includes("geaendert") && d.klassen.includes("ausnahme"));
  assert.deepEqual([d.zeit, d.zeitStatt, d.raum, d.von, d.bis], ["12:15", "10:00", "Hörsaal 9", 19, 25]);
  assert.deepEqual([d.marke, d.zeitNeu, d.zeitAlt, d.raumNeu, d.raumAlt], ["Geändert", true, "10:00–12:00", true, "Hörsaal 1"]);
  assert.match(d.titel, /· 12:15–13:45 · Hörsaal 9 · geändert, sonst 10:00–12:00 · Hörsaal 1$/);
  const n = kasten(woche("2026-10-26"), "Stundenplan/Do X200.md");
  assert.ok(!n.klassen.includes("geaendert") && !n.klassen.includes("ausnahme"));
  assert.deepEqual([n.marke, n.raumAlt, n.zeitAlt], ["", "", ""]);
});

// Ausnahmen (seit 20.10.2026): Ausfall dieser
// Lehrveranstaltung und Änderungen in Warnfarbe mit kurzem Text; Ausfall wegen Pause oder freiem Tag leise
const ausnahmen = (montag, extra) => W.wocheBauen({ notizen: extra, kurzVonCode: {}, modulPfad: {}, modell: MODELL, montag: tag(montag), jetzt: new Date("2026-10-19T08:00:00") });
const X = (pfad, fm) => lv(pfad, Object.assign({ code: "X400", art: "Vorlesung", beginn: "10:15", ende: "11:45", von: "2026-10-12", bis: "2027-02-05" }, fm));

test("Ausnahmen: Ausfall dieser Lehrveranstaltung in Warnfarbe mit „Fällt aus“, nicht blass wie „ab TT.MM.“", () => {
  const w = ausnahmen("2026-10-19", [X("Stundenplan/Mi X400.md", { titel: "X400 · Vorlesung", wochentag: 3, ausfall: ["2026-10-21"] })]);
  const k = w.kaesten[0];
  assert.deepEqual([k.aus, k.ausnahme, k.marke, k.grund, k.ausText], [true, true, "Fällt aus", "", "Fällt aus"]);
  assert.deepEqual(k.klassen, ["eba-ev", "vl", "ausnahme", "ausfall"]);
  assert.ok(!k.klassen.includes("spaeter"));
  assert.match(k.titel, /· fällt aus$/);
  const t = W.tageAus(w);
  assert.deepEqual(t.map((d) => [d.termine, d.ausnahme, d.hinweis]), [[false, false, ""], [false, false, ""], [false, true, "Ausfall"], [false, false, ""], [false, false, ""]]);
});

test("Ausnahmen: nur anderer Raum oder nur andere Zeit, je mit kurzem Text und dem üblichen Wert", () => {
  const raum = ausnahmen("2026-10-19", [X("Stundenplan/Di X400.md", { titel: "X400 · Vorlesung", wochentag: 2, aenderungen: ["2026-10-20|10:15|11:45|Hörsaal 21"] })]).kaesten[0];
  assert.deepEqual([raum.marke, raum.raum, raum.raumNeu, raum.raumAlt, raum.zeitNeu, raum.zeitAlt, raum.zeit], ["Anderer Raum", "Hörsaal 21", true, "Hörsaal 1", false, "", ""]);
  assert.ok(raum.klassen.includes("ausnahme"));
  const zeit = ausnahmen("2026-10-19", [X("Stundenplan/Di X400.md", { titel: "X400 · Vorlesung", wochentag: 2, aenderungen: ["2026-10-20|14:15|15:45|Hörsaal 1"] })]).kaesten[0];
  assert.deepEqual([zeit.marke, zeit.zeit, zeit.zeitStatt, zeit.zeitAlt, zeit.raumNeu, zeit.raumAlt, zeit.beginn, zeit.ende],
    ["Andere Zeit", "14:15", "10:15", "10:15–11:45", false, "", "14:15", "15:45"]);
  const ende = ausnahmen("2026-10-19", [X("Stundenplan/Di X400.md", { titel: "X400 · Vorlesung", wochentag: 2, aenderungen: ["2026-10-20|10:15|12:45|Hörsaal 1"] })]).kaesten[0];
  assert.deepEqual([ende.zeit, ende.zeitStatt], ["bis 12:45", "11:45"], "nur das Ende anders");
  // Änderung, die nichts ändert (gleiche Zeit, gleicher Raum): keine Ausnahme
  const gleich = ausnahmen("2026-10-19", [X("Stundenplan/Di X400.md", { titel: "X400 · Vorlesung", wochentag: 2, aenderungen: ["2026-10-20|10:15|11:45|Hörsaal 1"] })]).kaesten[0];
  assert.deepEqual([gleich.ausnahme, gleich.marke], [false, ""]);
  assert.deepEqual(W.tageAus(ausnahmen("2026-10-19", [X("Stundenplan/Di X400.md", { titel: "X400 · Vorlesung", wochentag: 2, aenderungen: ["2026-10-20|14:15|15:45|Hörsaal 1"] })]))[1],
    { iso: "2026-10-20", name: "Di", lang: "Dienstag", datum: "20.", heute: false, termine: true, ausnahme: true, hinweis: "Änderung" });
});

test("Ausnahmen: dauerhafte Verlegung – in den ersten zwei Wochen „Neuer Raum“ mit dem alten Raum, davor der alte, danach still", () => {
  const n = [X("Stundenplan/Mi X400.md", { titel: "X400 · Vorlesung", wochentag: 3, raum: "Hörsaal 21, Kupferbau", raum_vorher: "Hörsaal 1", raum_seit: "2026-10-28" })];
  const k = (montag) => ausnahmen(montag, n).kaesten[0];
  assert.deepEqual([k("2026-10-19").raum, k("2026-10-19").ausnahme], ["Hörsaal 1", false]);
  const a = k("2026-10-26");
  assert.deepEqual([a.raum, a.marke, a.raumNeu, a.raumAlt, a.ausnahme, a.zeit], ["Hörsaal 21, Kupferbau", "Neuer Raum", true, "Hörsaal 1", true, ""]);
  assert.match(a.titel, /· neuer Raum, vorher Hörsaal 1$/);
  assert.equal(k("2026-11-02").marke, "Neuer Raum", "zweite Woche");
  assert.deepEqual([k("2026-11-09").marke, k("2026-11-09").ausnahme], ["", false]);
});

test("Ausnahmen: Ausfall wegen Pause oder freiem Tag bleibt leise, auch wenn er in ausfall steht (Alma trägt die Weihnachtspause ein)", () => {
  const w = ausnahmen("2026-12-21", [X("Stundenplan/Mi X400.md", { titel: "X400 · Vorlesung", wochentag: 3, ausfall: ["2026-12-23", "2026-12-30"] }),
    X("Stundenplan/Mo X400.md", { titel: "X400 · Übung", art: "Übung", wochentag: 1, beginn: "08:15", ende: "09:45" })]);
  const mi = w.kaesten.find((k) => k.pfad === "Stundenplan/Mi X400.md");
  assert.deepEqual([mi.aus, mi.ausnahme, mi.grund, mi.ausText], [true, false, "Weihnachtspause", "Fällt aus (Weihnachtspause)"]);
  assert.ok(mi.klassen.includes("ausfall") && !mi.klassen.includes("ausnahme"));
  assert.deepEqual(W.tageAus(w).map((d) => d.ausnahme), [false, false, false, false, false]);
});

test("Ausfall und Pause durchgestrichen; ganze Woche frei → Satz statt Kästen; vor Vorlesungsbeginn", () => {
  const w = woche("2026-12-21"); // Pause ab Mittwoch
  assert.ok(!kasten(w, "Stundenplan/Mo X110.md").klassen.includes("ausfall"));
  assert.ok(kasten(w, "Stundenplan/Mi X101.md").klassen.includes("ausfall"));
  assert.equal(w.leer, "");
  const frei = woche("2026-12-28");
  assert.deepEqual([frei.kaesten.length, frei.leer], [0, "Weihnachtspause"]);
  assert.equal(woche("2026-10-05").leer, "Vorlesungsbeginn 12.10.");
  assert.equal(woche("2027-02-22").leer, "Vorlesungsfrei");
});

test("Vorlesungsfreier Tag (Christi Himmelfahrt) durchgestrichen, Einzeltermin nur an seinem Tag (Fehler 8)", () => {
  const ss = (pfad, fm) => lv(pfad, Object.assign({ semester: "SS 2027", von: "2027-04-12", bis: "2027-07-24" }, fm));
  const n = [
    ss("Stundenplan/Do X300 Tutorium.md", { titel: "Beispiel · Tutorium", code: "X300", art: "Tutorium", wochentag: 4, beginn: "10:15", ende: "11:45" }),
    ss("Stundenplan/Mo X300.md", { titel: "Beispiel · Vorlesung", code: "X300", art: "Vorlesung", wochentag: 1, beginn: "10:00", ende: "12:00" }),
    ss("Stundenplan/Mi X300 Einzel.md", { titel: "Beispiel · Sondertermin", code: "X300", art: "Vorlesung", wochentag: 3, beginn: "14:00", ende: "16:00", einzeltermin: true, von: "2027-05-12", bis: "2027-05-12" }),
  ];
  const w = (montag) => W.wocheBauen({ notizen: n, kurzVonCode: {}, modulPfad: {}, modell: MODELL, montag: tag(montag), jetzt: new Date("2027-05-03T12:00:00") });
  const k = w("2027-05-03").kaesten;
  assert.deepEqual(k.map((x) => x.pfad).sort(), ["Stundenplan/Do X300 Tutorium.md", "Stundenplan/Mo X300.md"], "Einzeltermin erst in seiner Woche");
  const d = k.find((x) => x.pfad === "Stundenplan/Do X300 Tutorium.md");
  assert.ok(d.klassen.includes("ausfall"));
  assert.match(d.titel, /fällt aus \(Christi Himmelfahrt\)$/);
  assert.deepEqual(w("2027-05-10").kaesten.map((x) => x.pfad + (x.klassen.includes("ausfall") ? " aus" : "")).sort(),
    ["Stundenplan/Do X300 Tutorium.md", "Stundenplan/Mi X300 Einzel.md", "Stundenplan/Mo X300.md"]);
});

test("Heute und jetzt nur in der aktuellen Woche", () => {
  const w = woche("2026-10-19", "2026-10-21T09:00:00");
  assert.equal(w.ht, true);
  assert.deepEqual(kasten(w, "Stundenplan/Mi X101 Übung.md").klassen.slice(-2), ["heute", "jetzt"]);
  assert.ok(!kasten(w, "Stundenplan/Mi X101.md").klassen.includes("jetzt"));
  assert.equal(woche("2026-10-26", "2026-10-21T09:00:00").ht, false);
});

test("Jetzt nach der Zeit dieses Tages: eine geänderte Zeit zählt, die übliche nicht", () => {
  // Do X200 am 22.10. auf 12:15–13:45 verschoben (sonst 10:00–12:00)
  const jetzt = (uhr) => kasten(woche("2026-10-19", "2026-10-22T" + uhr), "Stundenplan/Do X200.md").klassen.includes("jetzt");
  assert.deepEqual(["10:30:00", "12:10:00", "12:15:00", "13:45:00", "13:46:00"].map(jetzt), [false, false, true, true, false]);
  // eine Woche später wieder die übliche Zeit
  assert.equal(kasten(woche("2026-10-26", "2026-10-29T10:30:00"), "Stundenplan/Do X200.md").klassen.includes("jetzt"), true);
});

test("Wischen: nicht vom Bildschirmrand, Richtung erst nach 10 px, nur deutlich waagerecht und weiter als 50 px", () => {
  assert.equal(W.wischStartOk(20, 390), false); // linker Rand: Seitenleiste von Obsidian
  assert.equal(W.wischStartOk(375, 390), false); // rechter Rand
  assert.equal(W.wischStartOk(200, 390), true);
  assert.equal(W.wischAchse(6, 4), ""); // noch offen
  assert.equal(W.wischAchse(-24, 8), "h");
  assert.equal(W.wischAchse(12, 9), "v"); // eher schräg: Scrollen bleibt
  assert.equal(W.wischRichtung(-80, 10), 1);
  assert.equal(W.wischRichtung(80, -10), -1);
  assert.equal(W.wischRichtung(-50, 0), 0); // nicht weiter als 50 px
  assert.equal(W.wischRichtung(-80, 50), 0); // eher senkrecht
});

test("Seiten: Dashboard und Stundenplan zeigen das Raster über den Codeblock, keine Bases-Formeln mehr", () => {
  for (const datei of ["Dashboard.md", "Studium/Stundenplan.md"]) {
    const z = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", datei), "utf8").replace(/\r/g, "").split("\n");
    const a = z.findIndex((l) => /^> \[!eba-kennzahlen\|woche[ \]|]/.test(l));
    assert.ok(a >= 0, datei + ": Karte des Wochenrasters");
    const karte = z.slice(a, z.indexOf("", a)).join("\n");
    assert.match(karte, /^> ```eba-woche$/m, datei);
    assert.ok(!karte.includes("```base"), datei + ": noch eine Bases-Ansicht");
    assert.equal(z.filter((l) => l.includes("```eba-woche")).length, 1, datei);
    assert.ok(!z.join("\n").includes("System/Daten/Woche.md"), datei);
  }
});

// Blasse Gruppe neben einer Vorlesung und Tagesansicht für das iPhone (19.10.2026): Am iPhone halbierte ein blasses Tutorium,
// das erst in zwei Wochen beginnt, eine Vorlesung; fünf Spalten à 60 px zerbrachen Namen und schnitten Räume ab.
const TUT = lv("Stundenplan/Di 10.15 X180 Tutorium Gruppe 1 (gewählt).md", { titel: "Beispielabschluss · Tutorium Gruppe 1", code: "X180", art: "Tutorium", gruppe: "Gruppe 1",
  wochentag: 2, beginn: "10:15", ende: "11:45", von: "2026-11-03", bis: "2027-02-02", herkunft: "gruppe-gewaehlt", raum: "Seminarraum E 02" });
const mitTut = (montag, jetzt = "2026-10-27T10:30:00", extra = []) => W.wocheBauen({ notizen: NOTIZEN.concat([TUT], extra), kurzVonCode: { X180: "Abschluss" }, modulPfad: {},
  modell: MODELL, montag: tag(montag), jetzt: new Date(jetzt) });

test("Blasse Gruppe nimmt nie an der Teilung teil: schmal am Rand, die Vorlesung behält ihren Platz", () => {
  const w = mitTut("2026-10-26");
  const vl = kasten(w, "Stundenplan/Di X100.md"), tut = kasten(w, "Stundenplan/Di X100 Tutorium.md"), blass = kasten(w, TUT.pfad);
  assert.deepEqual([blass.spaeter, blass.schmal, blass.klassen.includes("schmal")], [true, true, true]);
  // Vorlesung und Tutorium (echt) teilen sich wie bisher, nur ohne den Streifen rechts; nie mit dem blassen Kasten
  assert.deepEqual([vl.spalte, vl.spalten, tut.spalte, tut.spalten], [0, 2, 1, 2]);
  assert.deepEqual([W.lage(vl), W.lage(tut), W.lage(blass)], [{ breite: 39, links: 0 }, { breite: 39, links: 39 }, { breite: 22, links: 78 }]);
  // allein mit einer Vorlesung: Vorlesung 78 %, nie die Hälfte
  const nur = W.spalten([{ tag: 2, von: 10, bis: 18 }, { tag: 2, von: 11, bis: 17, spaeter: true, klassen: ["eba-ev", "ue", "spaeter"] }]);
  assert.deepEqual(nur.map((k) => [k.spalten, W.lage(k)]), [[1, { breite: 78, links: 0 }], [1, { breite: 22, links: 78 }]]);
  // ohne echten Kasten daneben: ganze Breite; andere Tage unberührt
  assert.equal(W.lage(kasten(w, "Stundenplan/Di X180 Tutorium.md")), null);
  assert.equal(W.lage(W.spalten([{ tag: 3, von: 2, bis: 6, spaeter: true }])[0]), null);
  assert.equal(W.lage(kasten(w, "Stundenplan/Mo X110.md")), null);
});

test("Tagesansicht: fünf Tage mit Datum, heute betont, Punkt nur bei Lehrveranstaltungen, die stattfinden", () => {
  const w = mitTut("2026-10-26");
  const t = W.tageAus(w);
  assert.deepEqual(t.map((d) => d.name + " " + d.datum), ["Mo 26.", "Di 27.", "Mi 28.", "Do 29.", "Fr 30."]);
  assert.deepEqual(t.map((d) => d.heute), [false, true, false, false, false]);
  assert.deepEqual(t.map((d) => d.termine), [true, true, true, true, false]);
  assert.equal(t[1].lang, "Dienstag");
  // nur Blasses (noch nicht begonnen) oder Ausfall: kein Punkt
  const frei = W.tageAus(woche("2026-12-21"));
  assert.deepEqual(frei.map((d) => d.termine), [true, true, false, false, false], "ab Mittwoch Weihnachtspause: durchgestrichen, kein Punkt");
});

test("Tagesansicht: Kästen des Tags in Reihenfolge, voller Name, Zeit und Raum; was erst beginnt, als leise Zeile", () => {
  const w = mitTut("2026-10-26");
  const di = W.tagKaesten(w, 1);
  assert.deepEqual(di.map((k) => k.pfad), ["Stundenplan/Di X180 Tutorium.md", "Stundenplan/Di X100.md", "Stundenplan/Di X100 Tutorium.md", TUT.pfad]);
  const [t1, vl] = di;
  assert.deepEqual([t1.kurz, t1.artLang, t1.beginn, t1.ende, t1.raum], ["Abschluss", "Tutorium 1", "08:15", "09:45", "Hörsaal 1"]);
  assert.deepEqual([vl.artLang, vl.beginn, vl.ende], ["Vorlesung", "10:00", "12:00"]);
  assert.equal(di[3].leise, "Tutorium Abschluss · ab 03.11. · Di 10:15");
  assert.equal(di[3].spaeter, true);
  // heute und jetzt bleiben (Dienstag 10:30)
  assert.deepEqual(vl.klassen.slice(-2), ["heute", "jetzt"]);
  // Änderung: neue Zeit und neuer Raum; Ausfall mit Grund
  const d = W.tagKaesten(woche("2026-10-19"), 3)[0];
  assert.deepEqual([d.beginn, d.ende, d.raum, d.klassen.includes("geaendert")], ["12:15", "13:45", "Hörsaal 9", true]);
  const mi = W.tagKaesten(woche("2026-12-21"), 2).find((k) => k.pfad === "Stundenplan/Mi X101.md");
  assert.deepEqual([mi.aus, mi.ausText], [true, "Fällt aus (Weihnachtspause)"]);
  // Alma ohne erkannte Art: kein Wort dazu
  assert.equal(W.tagKaesten(w, 0)[0].artLang, "");
});

test("Tagesansicht: welcher Tag (heute, am Wochenende Montag, gewählt nur 30 Minuten in derselben Sitzung), Wischen über die Woche hinaus", () => {
  assert.equal(W.tagWahl(null, woche("2026-10-19", "2026-10-21T09:00:00")), 2, "heute Mittwoch");
  assert.equal(W.tagWahl(null, woche("2026-10-26", "2026-10-24T09:00:00")), 0, "Samstag: Montag der Planwoche");
  assert.equal(W.tagWahl(null, woche("2026-11-02", "2026-10-21T09:00:00")), 0, "andere Woche: Montag");
  assert.equal(W.tagWahl(4, woche("2026-10-19", "2026-10-21T09:00:00")), 4, "gewählt");
  const t = tag("2026-10-21").getTime(), s = "sitzung-a";
  const roh = (x, zeit = t, sitz = s) => JSON.stringify({ tag: x, zeit, sitzung: sitz });
  assert.equal(W.tagAus(roh(3), t + 60000, s), 3);
  assert.equal(W.tagAus(roh(3), t + 30 * 60000, s), null);
  assert.equal(W.tagAus(roh(3), t, "sitzung-b"), null);
  assert.equal(W.tagAus(roh(5), t, s), null);
  assert.equal(W.tagAus("kein json", t, s), null);
  assert.deepEqual(W.tagSchritt(0, 2, 1), { versatz: 0, tag: 3 });
  assert.deepEqual(W.tagSchritt(0, 4, 1), { versatz: 1, tag: 0 });
  assert.deepEqual(W.tagSchritt(1, 0, -1), { versatz: 0, tag: 4 });
});

test("„KW n“ zurück zur aktuellen Woche zeigt in der Tagesansicht wieder heute (Gerätespeicher, keine Datei)", () => {
  const L = laden("woche", { heute: "2026-10-21" });
  const speicher = { "eba-woche-tag": JSON.stringify({ tag: 4, zeit: Date.now(), sitzung: "x" }) };
  L.ctx.app.loadLocalStorage = (k) => (k in speicher ? speicher[k] : null);
  L.ctx.app.saveLocalStorage = (k, v) => { if (v === null) delete speicher[k]; else speicher[k] = v; };
  L.ergebnis.aktionen.woche.ausfuehren({ parameter: { schritt: "1" } });
  assert.ok("eba-woche-tag" in speicher, "eine andere Woche behält den Tag");
  L.ergebnis.aktionen.woche.ausfuehren({ parameter: { schritt: "0" } });
  assert.deepEqual(Object.keys(speicher), []);
});

test("Stil: unter 520 px Tagesansicht statt Raster, Wörter brechen nie mitten im Wort", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "snippets", "eba-core.css"), "utf8");
  assert.match(css, /@container eba-kz \(max-width: 520px\) \{\s*\.eba-woche\.hat-tag \{ display: none; \}\s*\.eba-wt \{ display: block; \}/);
  assert.match(css, /\.eba-wt \{ display: none;/);
  const regeln = css.match(/[^{}]*\.eba-(?:woche|wt) [^{}]*\{[^}]*\}/g) || [];
  const brechen = regeln.filter((r) => /overflow-wrap:\s*(anywhere|break-word)|word-break:\s*break-all/.test(r));
  assert.deepEqual(brechen, []);
});

test("Stil: Ausnahme in Warnfarbe (Fläche, Kante, Text), Ausfall nie blass wie „ab TT.MM.“, kein gestrichelter Rand mehr", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "snippets", "eba-core.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const regel = (sel) => { const m = css.match(new RegExp("(?:^|\\n)" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}")); return m ? m[1] : ""; };
  const a = regel(":is(.eba-woche, .eba-wt) .eba-ev.ausnahme");
  assert.match(a, /background: color-mix\(in srgb, var\(--eba-warn\)/);
  assert.match(a, /border-left: 3px solid var\(--eba-warn\)/);
  assert.match(css, /\.eba-ev\.ausnahme \.eba-ev-marke, \.eba-ev \.eba-ev-neu[^{]*\{[^}]*color: var\(--eba-warn\)/);
  assert.match(css, /\.eba-wt-tag\.ausnahme::after[^{]*\{[^}]*background: var\(--eba-warn\)/);
  assert.ok(!/\.eba-ev\.ausfall[^{]*\{[^}]*opacity/.test(css), "Ausfall nicht blass");
  assert.ok(!/\.eba-ev\.geaendert[^{]*\{[^}]*dashed/.test(css), "kein gestrichelter Rand");
});

// Seit 20.10.2026: Die Seite Stundenplan
// zeigt immer das Raster, auch auf dem iPhone hochkant; das Dashboard schmal weiter einen Tag. Am Pfad, damit es auch in Tresoren
// greift, deren Seite das Update nicht ersetzt (selbst geändert).
test("Seite Stundenplan immer als Raster, Dashboard und andere Seiten schmal als Tagesansicht", () => {
  assert.equal(W.mitTag("Studium/Stundenplan.md"), false);
  assert.equal(W.mitTag("Dashboard.md"), true);
  assert.equal(W.mitTag(""), true);
});

test("Schmales Raster: Raum gekürzt (ohne Klammerzusatz, „HS“), Name des Raums sonst unverändert", () => {
  assert.equal(W.raumKnapp("Hörsaal 1 (Keplerstraße 2)"), "HS 1");
  assert.equal(W.raumKnapp("Hörsaal 21, Kupferbau"), "HS 21, Kupferbau");
  assert.equal(W.raumKnapp("Hörsaal 11 (Universitätskasse u.a.)"), "HS 11");
  assert.equal(W.raumKnapp("Hörsaal 0.02 (VG Beispielstraße - SSC (Servicecenter))"), "HS 0.02", "verschachtelte Klammern");
  assert.equal(W.raumKnapp("Hörsaalzentrum Morgenstelle"), "Hörsaalzentrum Morgenstelle", "nur das ganze Wort");
  assert.equal(W.raumKnapp("Seminarraum 2"), "Seminarraum 2");
  assert.equal(W.raumKnapp("(nur Klammer)"), "(nur Klammer)", "nie leer");
  assert.equal(W.raumKnapp(""), "");
});

test("Stil: schmal die knappe Zeile statt der langen, Wörter brechen nur an Silben, Ausnahme mit schmaler Kante", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "snippets", "eba-core.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.eba-ev \.eba-ev-knapp \{ display: none; \}/);
  const schmal = css.slice(css.indexOf("@container eba-kz (max-width: 480px) {\n  .eba-woche .eba-ev, .eba-woche .eba-ev.ue"));
  assert.match(schmal.slice(0, 1200), /\.eba-woche \.eba-ev > b i, \.eba-ev \.eba-ev-lang \{ display: none; \}\s*\.eba-ev \.eba-ev-knapp \{ display: inline; \}/);
  assert.match(schmal.slice(0, 1200), /\.eba-woche \.eba-ev > b \{[^}]*hyphens: auto;[^}]*overflow-wrap: normal;/);
  assert.match(css, /@container eba-kz \(max-width: 480px\) \{ \.eba-woche \.eba-ev\.ausnahme \{ border-left-width: 2px; \} \}/);
});
