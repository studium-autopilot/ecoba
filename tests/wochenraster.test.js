// Wochenraster auf Dashboard und Stundenplan (woche.js, Codeblock eba-woche): welche Woche (nur aus dem Gerätespeicher, nach
// 30 Minuten und nach einem Neustart wieder die aktuelle), Kästen der Woche (von/bis, Ausfälle, Pausen, Änderungen, c.t.,
// Kurzname, Art und Gruppe, Überschneidungen), leere Wochen, Wischen. Nur ausgedachte Daten (Codes X100 …).
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const W = laden("woche").ergebnis;
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

// Ausgedachter Stundenplan (WS 2026/27, Vorlesungen ab 12.10., Weihnachtspause 23.12.–6.1.)
const EINST = {
  semesterliste: ["1|WS 2026/27|2026-10-01|2027-03-31|2026-10-12|2027-02-12"],
  pausen: ["2026-12-23|2027-01-06|Weihnachtspause"],
  stundenplan_ausgeblendet: ["ws-2026-27-x900-vorlesung-1-fr-1000"],
};
const lv = (pfad, fm) => ({ pfad, fm: Object.assign({ typ: "lehrveranstaltung", semester: "WS 2026/27", raum: "Hörsaal 1" }, fm) });
const NOTIZEN = [
  lv("Stundenplan/Mo X110.md", { titel: "Beispieldatenanalyse · Veranstaltung", code: "X110", art: "Veranstaltung", wochentag: 1, beginn: "08:00", ende: "10:00", von: "2026-10-12", bis: "2027-02-01", modul: "[[X110 Beispieldatenanalyse]]" }),
  lv("Stundenplan/Mi X101 Übung.md", { titel: "Beispielökonomik · Übung Gruppe 2", code: "X101", art: "Übung", gruppe: "2", wochentag: 3, beginn: "08:15", ende: "09:45", von: "2026-10-21", bis: "2027-02-03" }),
  lv("Stundenplan/Mi X101.md", { titel: "Beispielökonomik · Vorlesung", code: "X101", art: "Vorlesung", wochentag: 3, beginn: "10:00", ende: "12:00", von: "2026-10-14", bis: "2027-02-03", ausfall: ["2026-12-30"] }),
  lv("Stundenplan/Di X180 Tutorium.md", { titel: "Beispielabschluss · Tutorium 1", code: "X180", art: "Tutorium", gruppe: "Tutorium 1", gruppe_alma: "5", wochentag: 2, beginn: "08:15", ende: "09:45", von: "2026-10-27", bis: "2027-02-02", herkunft: "ilias-gruppe" }),
  lv("Stundenplan/Di X100.md", { titel: "Beispielmathematik · Vorlesung", code: "X100", art: "Vorlesung", wochentag: 2, beginn: "10:00", ende: "12:00", von: "2026-10-13", bis: "2027-02-02" }),
  lv("Stundenplan/Di X100 Tutorium.md", { titel: "Beispielmathematik · Tutorium Gruppe 4", code: "X100", art: "Tutorium", gruppe: "Gruppe 4", wochentag: 2, beginn: "10:15", ende: "11:45", von: "2026-10-20", bis: "2027-02-02", konflikt: "Di X100" }),
  lv("Stundenplan/Do X200.md", { titel: "Beispielfinanzierung · Vorlesung", code: "X200", art: "Vorlesung", wochentag: 4, beginn: "10:00", ende: "12:00", von: "2026-10-15", bis: "2027-02-04", herkunft: "zentral", aenderungen: ["2026-10-22|12:15|13:45|Hörsaal 9"] }),
  lv("Stundenplan/Fr X900.md", { titel: "Ausgeblendet", code: "X900", wochentag: 5, beginn: "10:00", ende: "12:00", herkunft: "zentral", zentral_id: "ws-2026-27-x900-vorlesung-1-fr-1000" }),
  lv("Stundenplan/Fr X901.md", { titel: "Entfällt", code: "X901", wochentag: 5, beginn: "10:00", ende: "12:00", entfaellt: true }),
  lv("Stundenplan/Fr X902.md", { titel: "Anderes Semester", code: "X902", wochentag: 5, beginn: "10:00", ende: "12:00", semester: "SoSe 2027" }),
];
const woche = (montag, jetzt = "2026-10-17T12:00:00") => W.wocheBauen({ notizen: NOTIZEN, kurzVonCode: { X110: "Daten", X101: "Ökonomik" }, einst: EINST, montag: tag(montag), jetzt: new Date(jetzt) });
const kasten = (w, pfad) => w.kaesten.find((k) => k.pfad === pfad);

test("Woche 19.10.: nur, was zwischen von und bis liegt; Ausgeblendetes, Entfallenes und andere Semester fehlen", () => {
  const w = woche("2026-10-19");
  assert.deepEqual(w.tage, ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  assert.equal(w.kw, 43);
  assert.deepEqual(w.kaesten.map((k) => k.pfad).sort(), ["Stundenplan/Di X100 Tutorium.md", "Stundenplan/Di X100.md", "Stundenplan/Do X200.md",
    "Stundenplan/Mi X101 Übung.md", "Stundenplan/Mi X101.md", "Stundenplan/Mo X110.md"]);
  assert.equal(w.leer, "");
  assert.equal(w.h0, 8);
  assert.equal(w.h1, 14); // die Änderung am Donnerstag reicht bis 13:45
  assert.equal(woche("2026-10-26").h1, 12);
  // eine Woche später ist das Tutorium ab 27.10. dabei
  assert.ok(kasten(woche("2026-10-26"), "Stundenplan/Di X180 Tutorium.md"));
});

test("Kästen: Kurzname, Art und Gruppe (Name aus gruppe, nie gruppe_alma), Beginn nur bei c.t., Lage im Raster", () => {
  const w = woche("2026-10-26");
  const mo = kasten(w, "Stundenplan/Mo X110.md");
  assert.deepEqual([mo.kurz, mo.art, mo.zeit, mo.von, mo.bis, mo.klassen.join(" ")], ["Daten", "", "", 2, 10, "eba-ev vl"]);
  assert.equal(mo.notiz, "X110 Beispieldatenanalyse");
  const ue = kasten(w, "Stundenplan/Mi X101 Übung.md");
  assert.deepEqual([ue.kurz, ue.art, ue.zeit, ue.von, ue.bis, ue.klassen[1]], ["Ökonomik", "Übung Gruppe 2", "08:15", 3, 9, "ue"]);
  assert.equal(kasten(w, "Stundenplan/Di X180 Tutorium.md").art, "Tutorium 1");
  assert.equal(kasten(w, "Stundenplan/Di X100 Tutorium.md").art, "Tutorium Gruppe 4");
  assert.equal(kasten(w, "Stundenplan/Di X100.md").kurz, "X100"); // ohne Kurznamen der Code
  assert.equal(W.kurzname({ titel: "Ohne Code · Vorlesung" }, {}), "Ohne Code");
  assert.equal(W.artText({ art: "Veranstaltung", gruppe: "3" }), "");
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

test("Änderung in dieser Woche: neue Zeit und neuer Raum, Kasten an der neuen Zeit, gestrichelt", () => {
  const d = kasten(woche("2026-10-19"), "Stundenplan/Do X200.md");
  assert.ok(d.klassen.includes("geaendert"));
  assert.deepEqual([d.zeit, d.raum, d.von, d.bis], ["12:15–13:45", "Hörsaal 9", 19, 25]);
  assert.match(d.titel, /· 12:15–13:45 · Hörsaal 9$/);
  assert.ok(!kasten(woche("2026-10-26"), "Stundenplan/Do X200.md").klassen.includes("geaendert"));
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

test("Heute und jetzt nur in der aktuellen Woche", () => {
  const w = woche("2026-10-19", "2026-10-21T09:00:00");
  assert.equal(w.ht, true);
  assert.deepEqual(kasten(w, "Stundenplan/Mi X101 Übung.md").klassen.slice(-2), ["heute", "jetzt"]);
  assert.ok(!kasten(w, "Stundenplan/Mi X101.md").klassen.includes("jetzt"));
  assert.equal(woche("2026-10-26", "2026-10-21T09:00:00").ht, false);
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
