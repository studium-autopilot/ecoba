// Bases-Formeln, die eine Regel des Fachmodells nachbilden (Noten & ECTS: Kennzahlen ECTS, Orientierungsprüfung, Gesamtnote;
// Spalten Termin, Stand, Block und der Filter „im Plan“), gegen das JavaScript des Modells (ctx.modell) auf ausgedachten
// Notizen. Bases-Formeln können kein Plugin-JS aufrufen; dieser Test hält beide Fassungen gleich. Ausgewertet mit dem kleinen
// Auswerter tests/bases-formel.js. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden, json } = require("./laden.js");
const { auswerten, formelnAus } = require("./bases-formel.js");

const NOTEN = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "Studium", "Noten & ECTS.md"), "utf8").replace(/\r/g, "");
const bloecke = NOTEN.split("```base").slice(1).map((b) => b.slice(0, b.indexOf("```")));
const KENNZAHLEN = formelnAus(bloecke[0]), MODULE = formelnAus(bloecke[1]), BESTANDEN = formelnAus(bloecke[2]), OP = formelnAus(bloecke[3]);
// Filter der Ansicht „Bestanden“ (eine Zeile unter „filters: and:“ der Ansicht)
const BESTANDEN_FILTER = (/name: Bestanden\n>\s+filters:\n>\s+and:\n>\s+- '(.*)'\n/.exec(bloecke[2]) || [])[1];
const SQ100 = "Module/4 Schlüsselqualifikation & Abschluss/SQ100 Schlüsselqualifikation.md";

const modul = (code, o) => ({ ["Module/1 Grundstudium/" + code + " Beispiel.md"]: Object.assign({ typ: "modul", code, titel: code + " Beispiel", gruppe: "Grundstudium", ects: 6, status: "offen", notenblock: "34 %" }, o) });
const termin = (datum, titel, o) => ({ ["Termine/" + datum + " " + titel + ".md"]: Object.assign({ typ: "termin", titel, datum, kategorie: "Prüfung", status: "offiziell" }, o) });
const pv = (code, o) => modul(code, Object.assign({ gruppe: "Profil & Vertiefung", rolle_economics: "Elective Studies", rolle_ba: "Pflicht", rolle_ohne: "Wahl", notenblock: "34 %" }, o));

const NOTIZEN = Object.assign({},
  modul("X100", { klausur: "2027-02-08" }),
  termin("2027-02-06", "Klausur X100", { code: "X100" }),
  modul("X110", { status: "bestanden", ergebnis: "1,7", op_modul: true }),
  termin("2026-10-02", "Klausur X110", { code: "X110" }),
  modul("X120", { status: "anerkannt", ects: 7.5, op_modul: true }),
  termin("2027-01-30", "Klausur X120", { code: "X120" }),
  modul("X130", { status: "angemeldet" }),
  termin("2027-02-10", "Klausur X130", { code: "X130", erledigt: true }),
  termin("2027-02-12", "Zwischentest X130", { code: "X130" }),
  modul("X140", { status: "nicht bestanden", ergebnis: "5,0" }),
  termin("2026-09-01", "Klausur X140", { code: "X140" }),
  termin("2027-03-30", "Nachholklausur X140", { code: "X140" }),
  modul("X150"),
  termin("2027-02-11", "Klausur X150 (entfällt)", { code: "X150", entfaellt: true }),
  modul("X160", { status: "bestanden", ergebnis: "2.3", zusatz: true }),
  modul("X170", { status: "bestanden", ergebnis: "gut", notenblock: "34 %" }),
  modul("X300", { gruppe: "Schwerpunkt", status: "bestanden", ergebnis: "1,3", ects: 9, notenblock: "66 %" }),
  modul("X310", { gruppe: "Schwerpunkt" }),
  pv("X400", { status: "bestanden", ergebnis: "2,0" }),
  pv("X410", { rolle_economics: "Pflicht", rolle_ohne: "Pflicht" }),
  pv("X420", { semester_geplant: "SS 2027" }),
  pv("X430", { anrechnung: "Elective Studies", status: "bestanden", ergebnis: "1,0", rolle_ba: "Wahl" }),
  modul("SQ100", { gruppe: "Abschluss", ects: 12 }),
  { "Schlüsselqualifikationen/SQ A.md": { typ: "sq_kurs", status: "bestanden", ects: 6 }, "Schlüsselqualifikationen/SQ B.md": { typ: "sq_kurs", status: "bestanden", ects: 4 } },
);

const welt = (heute, variante) => {
  const notizen = Object.assign({ "System/Einstellungen.md": { variante } }, NOTIZEN);
  const pfade = Object.keys(NOTIZEN);
  return {
    heute, notizen,
    rueckverweise: {
      "Studium/Noten & ECTS.md": pfade.filter((p) => NOTIZEN[p].typ === "modul"),
      "Studium/Prüfungen.md": pfade.filter((p) => NOTIZEN[p].typ === "termin"),
      [SQ100]: pfade.filter((p) => NOTIZEN[p].typ === "sq_kurs"),
    },
  };
};
const modell = (heute, variante) => laden("modell", {
  heute, notizen: NOTIZEN, frontmatter: { "System/Daten/Semester.md": json("semester.json"), "System/Einstellungen.md": { variante } },
}).ctx.modell;
const tmj = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

for (const variante of ["", "Economics", "Business Administration", "ohne Spezialisierung"]) {
  for (const heute of ["2026-10-18", "2027-02-20"]) {
    test(`Noten & ECTS = Fachmodell (Variante ${variante || "offen"}, ${heute})`, () => {
      const W = welt(heute, variante), M = modell(heute, variante);
      // Kennzahlen: ECTS, Orientierungsprüfung, Gesamtnote
      const E = M.ects(), N = M.noten();
      assert.equal(auswerten("formula.ects", W, "Studium/Noten & ECTS.md", KENNZAHLEN), E.ist, "ECTS");
      assert.equal(auswerten("formula.op", W, "Studium/Noten & ECTS.md", KENNZAHLEN), E.op, "Orientierungsprüfung");
      assert.equal(auswerten("formula.note", W, "Studium/Noten & ECTS.md", KENNZAHLEN), N.note, "Gesamtnote");
      assert.equal(auswerten("formula.notesub", W, "Studium/Noten & ECTS.md", KENNZAHLEN), N.unter, "Unterzeile");
      // Tabelle „Bestanden“: Summe der Spalte ECTS = ECTS oben (ohne Zusatzleistungen, SQ-Kurse bei offenem SQ100)
      const zeilen = Object.keys(NOTIZEN).filter((p) => NOTIZEN[p].typ === "modul" && auswerten(BESTANDEN_FILTER, W, p, BESTANDEN));
      assert.equal(zeilen.reduce((a, p) => a + auswerten("formula.zaehlt", W, p, BESTANDEN), 0), E.ist, "Summe der Tabelle Bestanden");
      // Je Modul: Termin (Prüfung nach der einen Regel), im Plan, Statusfarbe, Block
      for (const pfad of Object.keys(NOTIZEN).filter((p) => NOTIZEN[p].typ === "modul")) {
        const fm = NOTIZEN[pfad], p = M.pruefungVon(fm.code);
        for (const F of [MODULE, OP]) assert.equal(auswerten("formula.termin", W, pfad, F), tmj(p && p.datum), fm.code + " Termin");
        assert.equal(auswerten("formula.imPlan", W, pfad, MODULE), M.imPlan(fm), fm.code + " im Plan");
        const stand = String(auswerten("formula.stand", W, pfad, MODULE));
        assert.equal(stand.match(/eba-pill (\w+)/)[1], M.statusArt("modul", fm.status), fm.code + " Stand");
        assert.equal(auswerten("formula.block", W, pfad, MODULE), M.blockVon(fm, variante || "offen"), fm.code + " Block");
      }
    });
  }
}

test("Fälle, an denen sich beide Fassungen früher unterschieden", () => {
  const W = welt("2026-10-18", "Economics"), M = modell("2026-10-18", "Economics");
  const termin = (code) => auswerten("formula.termin", W, Object.keys(NOTIZEN).find((p) => NOTIZEN[p].code === code && NOTIZEN[p].typ === "modul"), MODULE);
  assert.equal(termin("X100"), "06.02.2027", "nächste Klausur, auch wenn das Feld klausur später liegt");
  assert.equal(termin("X120"), "", "anerkannt: die kommende Klausur ist keine mehr");
  assert.equal(termin("X130"), "10.02.2027", "abgehakt: das Datum bleibt, der Zwischentest zählt nicht");
  assert.equal(termin("X150"), "", "entfallen");
  assert.equal(M.pruefungVon("X140").datum, "2027-03-30", "nicht bestanden: der Nachholtermin");
  assert.equal(termin("X140"), "30.03.2027");
  // Bestanden: früher mit Zusatzleistung (X160) und ohne SQ-Kurse; jetzt eine Zeile SQ100 mit den gezählten 9 ECTS
  assert.ok(BESTANDEN_FILTER, "Filter der Ansicht Bestanden gefunden");
  const pfad = (code) => Object.keys(NOTIZEN).find((p) => NOTIZEN[p].code === code && NOTIZEN[p].typ === "modul");
  assert.equal(auswerten(BESTANDEN_FILTER, W, pfad("X160"), BESTANDEN), false, "Zusatzleistung nicht in der Summe");
  assert.equal(auswerten(BESTANDEN_FILTER, W, pfad("SQ100"), BESTANDEN), true);
  assert.equal(auswerten("formula.zaehlt", W, pfad("SQ100"), BESTANDEN), 9, "SQ-Kurse 6 + 4, höchstens 9");
  assert.equal(auswerten(BESTANDEN_FILTER, W, pfad("X100"), BESTANDEN), false, "offen");
});
