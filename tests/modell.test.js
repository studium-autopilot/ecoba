// Datenmodell (modell.js): Semesterliste aus Studienbeginn + zentralen Daten, Semesterregel, Vorlesungswochen.
// Semesterdaten: Schnappschuss der öffentlichen zentralen Daten (tests/daten/v1/semester.json, gleiche Felder wie
// System/Daten/Semester.md). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json } = require("./laden.js");

const SEMESTER = json("semester.json");
const modell = (heute, einstellungen = {}) => laden("modell", {
  heute,
  frontmatter: { "System/Daten/Semester.md": SEMESTER, "System/Einstellungen.md": einstellungen },
}).ctx.modell;

test("Semestername aus dem Datum (WS 1.10.–31.3., SS 1.4.–30.9.)", () => {
  const M = modell("2026-10-15");
  assert.equal(M.semesterAusDatum("2026-10-15"), "WS 2026/27");
  assert.equal(M.semesterAusDatum("2027-03-31"), "WS 2026/27");
  assert.equal(M.semesterAusDatum("2027-04-01"), "SS 2027");
  assert.equal(M.semesterAusDatum("2027-09-30"), "SS 2027");
  assert.equal(M.naechster("WS 2026/27"), "SS 2027");
  assert.equal(M.naechster("SS 2027"), "WS 2027/28");
  assert.equal(M.voriger("WS 2026/27"), "SS 2026");
});

test("Standard ohne Studienbeginn: aktuelles Semester ist das 1. Fachsemester, Regelstudienzeit 6", () => {
  const D = modell("2026-10-15").daten();
  assert.equal(D.studienbeginnStandard, true);
  assert.equal(D.variante, "offen");
  assert.equal(D.semesterliste.length, 6);
  assert.deepEqual(D.semesterliste.map((s) => s.name), ["WS 2026/27", "SS 2027", "WS 2027/28", "SS 2028", "WS 2028/29", "SS 2029"]);
  assert.equal(D.fachsemester, 1);
  assert.equal(D.aktuell.vb, "2026-10-12");
});

test("Studienbeginn WS 2025/26 → im WS 2026/27 drittes Fachsemester (Semester ohne Daten nach Regel)", () => {
  const D = modell("2026-10-15", { studienbeginn: "2025-10-01" }).daten();
  assert.equal(D.semesterliste[0].name, "WS 2025/26");
  assert.equal(D.semesterliste[0].status, "geschätzt", "WS 2025/26 steht nicht in den Daten → Regel");
  assert.equal(D.fachsemester, 3);
});

test("Semesterregel für Semester ohne zentrale Daten", () => {
  const M = modell("2026-10-15");
  const ws = M.semesterNachName("WS 2035/36");
  assert.equal(ws.vb, "2035-10-15", "erster Montag ab 10.10.");
  assert.equal(ws.ve, "2036-02-09", "Samstag nach 17 Wochen");
  const ss = M.semesterNachName("SS 2036");
  assert.equal(ss.vb, "2036-04-14", "erster Montag ab 10.4.");
  assert.equal(ss.ve, "2036-07-26", "Samstag nach 15 Wochen");
});

test("Vorlesungswochen WS 2026/27: 16, die Woche 28.12.–03.01. zählt nicht", () => {
  const M = modell("2026-10-15");
  const W = M.vorlesungswochen(M.semesterNachName("WS 2026/27"));
  assert.equal(W.gesamt, 16);
  const pause = W.wochen.filter((w) => w.nr === 0).map((w) => w.mo);
  assert.deepEqual(pause, ["2026-12-28"]);
  assert.equal(W.wochen[0].mo, "2026-10-12");
});

test("Wochenanzeige an typischen Tagen", () => {
  const faelle = {
    "2026-10-01": ["vor", "noch 11 Tage bis Vorlesungsbeginn"],
    "2026-10-11": ["vor", "Vorlesungsbeginn morgen"],
    "2026-10-15": ["vorlesung", "Vorlesungswoche 1 von 16"],
    "2026-12-29": ["pause", "Weihnachtspause bis 06.01."],
    "2027-01-07": ["vorlesung", "Vorlesungswoche 12 von 16"],
    "2027-02-02": ["vorlesung", "Vorlesungswoche 16 von 16 · Prüfungsphase"],
    "2027-02-10": ["pruefung", "Prüfungsphase bis 13.02."],
  };
  for (const [tag, [art, text]] of Object.entries(faelle)) {
    const w = modell(tag).woche(tag);
    assert.equal(w.art, art, tag);
    assert.equal(w.text, text, tag);
  }
});

test("Abgeleitete Felder für die Einstellungen (Format fs|name|beginn|ende|vb|ve)", () => {
  const D = modell("2026-10-15").daten();
  assert.equal(D.abgeleitet.semesterliste[0], "1|WS 2026/27|2026-10-01|2027-03-31|2026-10-12|2027-02-06");
  assert.ok(D.abgeleitet.pausen.includes("2026-12-23|2027-01-06|Weihnachtspause"));
  assert.ok(D.abgeleitet.pruefungsphasen.includes("2027-01-29|2027-02-13|Haupttermin|offiziell"));
});

// ---------- Codeblock-Argument (blockArgument) ----------
// Nachgestellt, was Obsidian liefert: getSectionInfo(el) → { text, lineStart, lineEnd } (Zeilen ab 0). Beim Neuzeichnen
// der Leseansicht (rerender) einer Notiz ab 10240 Zeichen ist text leer, die Zeilen stimmen; in Karten der
// Bearbeitungsansicht kommt null. Geöffnete Ansichten: app.workspace.iterateAllLeaves → view.file.path, view.getViewData().
const SEMESTER_MD = [
  "---", "stand: 2026-10-14", "---", "", "<h1>Semestertermine</h1>", "",
  "```eba-semesterdaten zentral", "Semestertermine: erscheinen, sobald Studium Autopilot läuft.", "```", "", "Fuß",
].join("\n"); // Block in den Zeilen 6–8
const VERLAUF_MD = [
  "## Musterstudienplan", "", "> [!eba-karte|handy-zu]+ Dein Musterplan", "> ```eba-musterplan",
  "> Musterplan: erscheint, sobald Studium Autopilot läuft.", "> ```", "", "## Semestertermine", "",
  "> [!eba-tabelle|handy-zu|pc-flach]+ Semestertermine", "> ```eba-semesterdaten",
  "> Semestertermine: erscheinen, sobald Studium Autopilot läuft.", "> ```",
].join("\n"); // Karten in den Zeilen 2–5 und 9–12
const SD = ["eba-semesterdaten", ["zentral", "persoenlich"], "persoenlich"];
const MP = ["eba-musterplan", ["economics", "ba", "ohne", "alle", "andere"], ""];

// ansichten: { pfad: text } der geöffneten Notizen (änderbar, die Ansicht liest bei jedem Aufruf neu)
const mitAnsichten = (ansichten) => {
  const { ctx } = laden("modell");
  ctx.app.workspace.iterateAllLeaves = (fn) => {
    fn({ view: {} }); // Ansicht ohne Datei (z. B. Seitenleiste)
    for (const pfad of Object.keys(ansichten)) fn({ view: { file: { path: pfad }, getViewData: () => ansichten[pfad] } });
  };
  return ctx.modell;
};
const abschnitt = (pfad, text, von, bis) => ({ sourcePath: pfad, getSectionInfo: () => ({ text, lineStart: von, lineEnd: bis }) });
const ohneAbschnitt = (pfad) => ({ sourcePath: pfad, getSectionInfo: () => null });
const arg = (M, c, [sprache, erlaubt, vorgabe]) => M.blockArgument({}, c, sprache, erlaubt, vorgabe);

test("Codeblock-Argument aus der Kopfzeile, auch in Karten; ungültig oder ohne Argument → Vorgabe", () => {
  const M = mitAnsichten({});
  assert.equal(arg(M, abschnitt("System/Daten/Semester.md", SEMESTER_MD, 6, 8), SD), "zentral");
  assert.equal(arg(M, abschnitt("Studium/Studienverlauf.md", VERLAUF_MD, 9, 12), SD), "persoenlich");
  assert.equal(arg(M, abschnitt("Studium/Studienverlauf.md", VERLAUF_MD, 2, 5), MP), "");
  const alle = "```eba-musterplan alle\nMusterpläne: …\n```";
  assert.equal(arg(M, abschnitt("System/Daten/Musterplan.md", alle, 0, 2), MP), "alle");
  assert.equal(arg(M, abschnitt("x.md", "~~~ eba-musterplan ALLE\n~~~", 0, 1), MP), "alle", "~~~ und Großschreibung");
  assert.equal(arg(M, abschnitt("x.md", "```eba-semesterdaten quatsch\n```", 0, 1), SD), "persoenlich");
});

test("Neuzeichnen (Abschnittstext leer): Argument aus dem Text der geöffneten Ansicht", () => {
  const M = mitAnsichten({ "System/Daten/Semester.md": SEMESTER_MD, "Studium/Studienverlauf.md": VERLAUF_MD });
  assert.equal(arg(M, abschnitt("System/Daten/Semester.md", "", 6, 8), SD), "zentral");
  assert.equal(arg(M, abschnitt("Studium/Studienverlauf.md", "", 9, 12), SD), "persoenlich");
  // „Deine Angaben“ (Einstellungen & Hilfe, > 10240 Zeichen): fiel vorher auf „karte“ zurück
  const hilfe = "# Einstellungen\n\n```eba-personalisieren angaben\nDeine Angaben: …\n```\n" + "x\n".repeat(6000);
  const M2 = mitAnsichten({ "Studium/Einstellungen & Hilfe.md": hilfe });
  assert.equal(M2.blockArgument({}, abschnitt("Studium/Einstellungen & Hilfe.md", "", 2, 4), "eba-personalisieren", ["karte", "angaben"], "karte"), "angaben");
});

test("Neuzeichnen ohne geöffnete Ansicht: zuletzt an derselben Stelle gelesenes Argument, sonst Vorgabe", () => {
  const M = mitAnsichten({});
  const leer = abschnitt("System/Daten/Semester.md", "", 6, 8);
  assert.equal(arg(M, leer, SD), "persoenlich", "noch nie gelesen");
  assert.equal(arg(M, abschnitt("System/Daten/Semester.md", SEMESTER_MD, 6, 8), SD), "zentral");
  assert.equal(arg(M, leer, SD), "zentral", "gemerkt");
  assert.equal(arg(M, abschnitt("System/Daten/Semester.md", "", 20, 22), SD), "persoenlich", "andere Stelle");
  assert.equal(arg(M, abschnitt("Studium/Studienverlauf.md", "", 6, 8), SD), "persoenlich", "andere Notiz");
});

test("Ohne Abschnitt (null oder Fehler): ganze Notiz, nur bei eindeutigem Argument", () => {
  const zwei = "```eba-musterplan\n```\n\n```eba-musterplan andere\n```";
  const M = mitAnsichten({ "System/Daten/Semester.md": SEMESTER_MD, "System/Daten/Musterplan.md": "> ```eba-musterplan alle\n> ```", "zwei.md": zwei });
  assert.equal(arg(M, ohneAbschnitt("System/Daten/Semester.md"), SD), "zentral");
  assert.equal(arg(M, ohneAbschnitt("System/Daten/Musterplan.md"), MP), "alle");
  assert.equal(arg(M, { sourcePath: "System/Daten/Semester.md", getSectionInfo: () => { throw new Error("weg"); } }, SD), "zentral");
  assert.equal(arg(M, ohneAbschnitt("zwei.md"), MP), "", "mehrdeutig");
  assert.equal(arg(M, ohneAbschnitt("nicht-offen.md"), SD), "persoenlich");
  assert.equal(arg(M, null, SD), "persoenlich");
  // ohne iterateAllLeaves (z. B. ältere Fassung) kein Fehler
  assert.equal(arg(laden("modell").ctx.modell, abschnitt("System/Daten/Semester.md", "", 6, 8), SD), "persoenlich");
});

// Ein Schreiber: abgeleitete Felder fehlen in den Einstellungen, also gäbe es etwas zu schreiben
const mitSchreiber = (hier) => {
  const zentral = hier == null ? undefined : { abruferHier: async () => hier };
  const { ctx } = laden("modell", {
    heute: "2026-10-15",
    frontmatter: { "System/Daten/Semester.md": SEMESTER, "System/Einstellungen.md": { studienbeginn: "2025-10-01" } },
    kontext: zentral ? { zentral } : {},
  });
  const geschrieben = [];
  ctx.app.fileManager = { processFrontMatter: async (f, fn) => { const x = {}; fn(x); geschrieben.push(Object.keys(x).sort().join(",")); } };
  return { M: ctx.modell, geschrieben };
};

test("Ein Schreiber: von selbst (Start, Änderung) schreibt nur der Abrufer, ein Tipp auf diesem Gerät schreibt sofort", async () => {
  const anderes = mitSchreiber(false);
  assert.equal(await anderes.M.abgleichen("start"), false);
  assert.equal(await anderes.M.abgleichen("änderung System/Daten/Semester.md"), false);
  assert.deepEqual(anderes.geschrieben, [], "ein anderes Gerät ist Abrufer");
  assert.equal(await anderes.M.abgleichen("personalisieren"), true);
  assert.equal(await anderes.M.abgleichen("einrichtung"), true);
  assert.deepEqual(anderes.geschrieben, ["pausen,pruefungsphasen,semesterliste", "pausen,pruefungsphasen,semesterliste"]);
  const abrufer = mitSchreiber(true);
  assert.equal(await abrufer.M.abgleichen("start"), true);
  const ohneZentral = mitSchreiber(null);
  assert.equal(await ohneZentral.M.abgleichen("start"), true, "ohne zentral.js wie bisher");
});

test("Neuer Tag: einmal melden und die Kopien in den Einstellungen nachziehen, von selbst nur der Abrufer", async () => {
  const warten = () => new Promise((r) => setImmediate(r));
  for (const hier of [true, false]) {
    let heute = "2027-03-31";
    const { ctx } = laden("modell", {
      frontmatter: { "System/Daten/Semester.md": SEMESTER, "System/Einstellungen.md": {} },
      kontext: { zentral: { abruferHier: async () => hier } },
    });
    ctx.date = Object.assign({}, ctx.date, { now: () => heute });
    const geschrieben = [];
    ctx.app.fileManager = { processFrontMatter: async (f, fn) => { const x = {}; fn(x); geschrieben.push(x.semesterliste[0]); } };
    const M = ctx.modell;
    let gemeldet = 0;
    M.beiAenderung(() => { gemeldet++; });
    assert.equal(M.daten().semesterliste[0].name, "WS 2026/27", "ohne Studienbeginn: das laufende Semester ist das erste");
    M.ungueltig(); M.daten();
    await warten();
    assert.deepEqual([gemeldet, geschrieben], [0, []], "derselbe Tag: nichts");
    heute = "2027-04-01";
    assert.equal(M.daten().semesterliste[0].name, "SS 2027");
    M.daten();
    await warten();
    assert.equal(gemeldet, 1, "einmal je Tag");
    assert.deepEqual(geschrieben, hier ? ["1|SS 2027|2027-04-01|2027-09-30|2027-04-12|2027-07-24"] : [], hier ? "Abrufer schreibt" : "anderes Gerät nicht");
  }
});
