// Agenda (termine.js, erzeugen): Tagesspalte mit Ziffer und Wochentag nur beim ersten Termin eines Tags, Art als Klasse für
// den Farbpunkt, Text-Pillen nur für Frist/Prüfung/freiwillig/geschätzt/erledigt, in „Diese Woche“ erst Laufendes unter
// „läuft“, dann die Marke „Heute“, dann alles ab heute. „Diese Woche“ ist am Wochenende schon die kommende (Planwoche des
// Fachmodells). Nur ausgedachte Termine. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json } = require("./laden.js");

const SEMESTER = json("semester.json");
const modell = (heute) => laden("modell", { heute, frontmatter: { "System/Daten/Semester.md": SEMESTER } }).ctx.modell;
const MODELL = modell("2026-10-17");
const TM = laden("termine", { heute: "2026-10-17", kontext: { modell: MODELL } }).ergebnis; // Samstag; Planwoche Mo 19.10. – So 25.10.
const HEUTE = new Date(2026, 9, 17);
const d = (tag, monat, jahr) => new Date(jahr || 2026, (monat || 10) - 1, tag);
let nr = 0;
const T = (von, titel, kategorie, extra) => Object.assign({
  f: { path: `Termine/${++nr} ${titel}.md` }, von, bis: null, titel, kategorie, geschaetzt: false, erledigt: false, sq: false, zeit: "", ort: "", quelle: "", geprueft: "",
}, extra || {});
// erzeugen erwartet die Termine sortiert wie lesen() (Datum, Uhrzeit als Zahl, Titel)
const min = (z) => { const n = MODELL.zeit.minuten(z); return n == null ? -1 : n; };
const erzeugen = (alle, heute) => TM.erzeugen(alle.slice().sort((a, b) => a.von - b.von || min(a.zeit) - min(b.zeit) || a.titel.localeCompare(b.titel)), heute);
const zeilen = (md) => md.split("\n");
// Zeilen eines Abschnitts bis zur nächsten Überschrift oder Sammelkarte, ohne die Leerzeile davor
const abschnitt = (md, titel) => {
  const z = zeilen(md);
  const a = z.findIndex((x) => x.startsWith(titel));
  assert.ok(a >= 0, `Abschnitt „${titel}“ fehlt`);
  let b = z.findIndex((x, i) => i > a && (x.startsWith("## ") || x.startsWith("> [!eba-t")));
  if (b < 0) b = z.length;
  while (b > a && z[b - 1] === "") b--;
  return z.slice(a, b);
};

test("art: Prüfung rot, Frist ocker, Fachschaft/Veranstaltung Akzent, Erledigtes gedämpft, Rest Uni", () => {
  assert.equal(TM.art({ kategorie: "Prüfung" }), "pruefung");
  assert.equal(TM.art({ kategorie: "Frist" }), "frist");
  assert.equal(TM.art({ kategorie: "Fachschaft" }), "event");
  assert.equal(TM.art({ kategorie: "Veranstaltung" }), "event");
  assert.equal(TM.art({ kategorie: "Lehre" }), "uni");
  assert.equal(TM.art({ kategorie: "Prüfung", erledigt: true }), "erledigt");
  assert.equal(TM.art({ kategorie: "Prüfung", titel: "Zwischentest 1 X100" }), "zwischentest");
});

test("diese Woche: Laufendes unter „läuft“ (einmal), dann die Marke „Heute“, Termine von heute ohne eigene Spalte, morgen mit „morgen“", () => {
  const md = erzeugen([
    T(d(12), "Belegungszeitraum", "Frist", { bis: d(19) }),
    T(d(14), "Anmeldung Übungsgruppen", "Frist", { bis: d(30), zeit: "15:00" }),
    T(d(17), "Vortrag heute", "Veranstaltung", { zeit: "18:00" }),
    T(d(18), "Spieleabend", "Fachschaft", { zeit: "17:00–21:00" }),
  ], HEUTE);
  const w = abschnitt(md, "## Diese Woche");
  assert.equal(w[0], "## Diese Woche · 17.–25.10.", "Samstag: ab heute bis zum Sonntag der kommenden Woche");
  assert.match(w[2], /^- <span class="eba-tag frist laeuft"><span class="eba-wt">läuft<\/span><\/span>\[\[Termine\/1 Belegungszeitraum\|Belegungszeitraum\]\] · bis Mo 19\.10\. <span class="eba-pill warn">Frist<\/span>$/);
  assert.match(w[3], /^- <span class="eba-tag frist gleich laeuft">.*15:00 · \[\[.*Anmeldung Übungsgruppen\]\] · bis Fr 30\.10\./, "zweite laufende Zeile ohne zweites „läuft“");
  assert.equal(w[4], '- <span class="eba-jetzt">Heute · Sa 17.10.</span>');
  assert.match(w[5], /^- <span class="eba-tag event gleich"><b>17<\/b><span class="eba-wt">Sa<\/span><span class="eba-rel">heute<\/span><\/span>18:00 · \[\[.*Vortrag heute\]\]$/, "heute: Spalte versteckt, keine Pille für Veranstaltung");
  assert.match(w[6], /^- <span class="eba-tag event"><b>18<\/b><span class="eba-wt">So<\/span><span class="eba-rel">morgen<\/span><\/span>17:00–21:00 · \[\[.*Spieleabend\]\]$/);
  assert.equal(w.length, 7);
});

test("diese Woche: ohne Termine ab heute keine Marke; ohne alles ein Hinweis", () => {
  const nurLaufend = abschnitt(erzeugen([T(d(12), "Zeitraum", "Frist", { bis: d(20) })], HEUTE), "## Diese Woche");
  assert.equal(nurLaufend.length, 3);
  assert.ok(!nurLaufend.some((z) => z.includes("eba-jetzt")));
  const leer = abschnitt(erzeugen([], HEUTE), "## Diese Woche");
  assert.equal(leer[2], "- Keine Termine diese Woche.");
  // Marke ganz oben, wenn nichts läuft
  const nurHeute = abschnitt(erzeugen([T(d(18), "Morgen", "Lehre")], HEUTE), "## Diese Woche");
  assert.equal(nurHeute[2], '- <span class="eba-jetzt">Heute · Sa 17.10.</span>');
  assert.match(nurHeute[3], /^- <span class="eba-tag uni"><b>18<\/b>/);
});

test("Woche an einem Werktag: Montag bis Sonntag dieser Woche", () => {
  const TMD = laden("termine", { heute: "2026-10-15", kontext: { modell: modell("2026-10-15") } }).ergebnis;
  const md = TMD.erzeugen([T(d(16), "Freitag", "Lehre"), T(d(19), "Montag", "Lehre")], d(15));
  assert.equal(abschnitt(md, "## Diese Woche")[0], "## Diese Woche · 12.–18.10.");
  assert.equal(abschnitt(md, "## Nächste Woche")[0], "## Nächste Woche · 19.–25.10.");
});

test("nächste Woche: Karte handy-zu|pc-flach, gleicher Tag nur einmal, Pillen nur für Prüfung, freiwillig, geschätzt, erledigt", () => {
  const md = erzeugen([
    T(d(26), "Übungen starten", "Lehre"),
    T(d(26), "Tutorien-Anmeldung", "Frist", { zeit: "17:00", sq: true, geschaetzt: true }),
    T(d(28), "Klausur Probe", "Prüfung", { erledigt: true }),
  ], HEUTE);
  const w = abschnitt(md, "## Nächste Woche");
  assert.equal(w[0], "## Nächste Woche · 26.10. – 01.11.");
  assert.equal(w[2], "> [!eba-karte|handy-zu|pc-flach]+ Nächste Woche · 26.10. – 01.11. · 3 Termine", "Kartentitel mit Zeitraum (iPhone blendet die ## aus)");
  assert.match(w[3], /^> - <span class="eba-tag uni"><b>26<\/b><span class="eba-wt">Mo<\/span><\/span>\[\[.*Übungen starten\]\]$/);
  assert.match(w[4], /^> - <span class="eba-tag frist gleich">.*17:00 · \[\[.*Tutorien-Anmeldung\]\] <span class="eba-pill warn">Frist<\/span> <span class="eba-pill leer">freiwillig<\/span> <span class="eba-pill leer">geschätzt<\/span>$/);
  assert.match(w[5], /^> - <span class="eba-tag erledigt"><b>28<\/b><span class="eba-wt">Mi<\/span><\/span>\[\[.*Klausur Probe\]\] <span class="eba-pill bad">Prüfung<\/span> <span class="eba-pill ok">erledigt<\/span>$/);
  assert.equal(abschnitt(erzeugen([], HEUTE), "## Nächste Woche")[3], "> - Keine Termine nächste Woche.");
});

test("Fristen danach: höchstens vier offene Fristen/Prüfungen ab übernächster Woche, mit Monat und „in n Tagen“", () => {
  const alle = [3, 5, 9, 11, 13, 20].map((t) => T(d(t, 11), `Frist ${t}`, "Frist"));
  alle.push(T(d(3, 11), "Erledigt", "Frist", { erledigt: true }), T(d(4, 11), "Vortrag", "Veranstaltung"), T(d(2, 11), "Zwischentest", "Prüfung"));
  const w = abschnitt(erzeugen(alle, HEUTE), "## Fristen danach");
  assert.equal(w[2], "> [!eba-karte|handy-zu|pc-flach]+ Fristen danach · 4 Fristen");
  assert.match(w[3], /^> - <span class="eba-tag zwischentest"><b>2<\/b><span class="eba-wt">Mo<\/span><span class="eba-rel">Nov\.<\/span><\/span>\[\[.*Zwischentest\]\] · in 16 Tagen$/);
  assert.match(w[4], /^> - <span class="eba-tag frist"><b>3<\/b><span class="eba-wt">Di<\/span><span class="eba-rel">Nov\.<\/span><\/span>\[\[.*Frist 3\]\] · in 17 Tagen$/);
  assert.equal(w.length, 7, "vier Zeilen, Erledigtes und Veranstaltungen nicht dabei");
});

test("Später und Vergangen: ruhige Sammelkarten (|sammel), Später nach Monaten, Vergangen mit Monat in der Spalte", () => {
  const md = erzeugen([
    T(d(5), "Vorkurs", "Lehre", { bis: d(9) }),
    T(d(10), "Wasen", "Fachschaft"),
    T(d(4, 11), "Infoabend", "Veranstaltung"),
    T(d(2, 12), "Klausur", "Prüfung"),
  ], HEUTE);
  const z = zeilen(md);
  const s = z.indexOf("> [!eba-t|sammel]- Später · 2 Termine");
  assert.ok(s > 0);
  assert.equal(z[s + 1], ">");
  assert.equal(z[s + 2], "> **November 2026**");
  assert.match(z[s + 3], /^> - <span class="eba-tag event"><b>4<\/b><span class="eba-wt">Mi<\/span><\/span>\[\[.*Infoabend\]\]$/);
  assert.equal(z[s + 5], "> **Dezember 2026**");
  assert.match(z[s + 6], /^> - <span class="eba-tag pruefung"><b>2<\/b><span class="eba-wt">Mi<\/span><\/span>\[\[.*Klausur\]\] <span class="eba-pill bad">Prüfung<\/span>$/);
  const v = z.indexOf("> [!eba-t|sammel]- Vergangen · 2 Termine");
  assert.ok(v > s);
  assert.match(z[v + 1], /^> - <span class="eba-tag event"><b>10<\/b><span class="eba-wt">Sa<\/span><span class="eba-rel">Okt\.<\/span><\/span>\[\[.*Wasen\]\]$/, "jüngstes zuerst");
  assert.match(z[v + 2], /^> - <span class="eba-tag uni"><b>5<\/b>.*\[\[.*Vorkurs\]\] · bis Fr 09\.10\.$/);

  // je einer: Einzahl
  const eins = zeilen(erzeugen([T(d(10), "Wasen", "Fachschaft"), T(d(4, 11), "Infoabend", "Veranstaltung")], HEUTE));
  assert.ok(eins.includes("> [!eba-t|sammel]- Später · 1 Termin"));
  assert.ok(eins.includes("> [!eba-t|sammel]- Vergangen · 1 Termin"));
});

test("kein Markdown-Fett in HTML (Live Preview zeigt sonst Sternchen), keine eba-neu-Reste", () => {
  const md = erzeugen([T(d(18), "X", "Lehre"), T(d(12), "Y", "Frist", { bis: d(19) })], HEUTE);
  for (const z of zeilen(md)) if (z.includes("<span class=\"eba-tag")) assert.ok(!z.includes("**"), z);
});

test("Zwischentest: Pille „Zwischentest“ statt „Prüfung“", () => {
  const w = abschnitt(erzeugen([T(d(27), "Zwischentest 1 X100", "Prüfung")], HEUTE), "## Nächste Woche");
  assert.match(w[3], /^> - <span class="eba-tag zwischentest">.*\[\[.*Zwischentest 1 X100\]\] <span class="eba-pill info">Zwischentest<\/span>$/);
});

// ---------- Anmeldungen (termine.js, anmeldungen; Codeblock eba-anmeldungen) ----------
// Zentrale Frist wie lesen() sie liefert; Standard: zentral, Modul X100 (also fürs Studium), ohne Ort
const F = (von, titel, extra) => T(von, titel, "Frist", Object.assign({ zentral: true, code: "X100", bereich: "", entfaellt: false }, extra || {}));
const WS_ENDE = d(31, 3, 2027);
const auswahl = (alle, extra) => TM.anmeldungen(alle, Object.assign({ heute: HEUTE, ende: WS_ENDE, aufnehmen: null, gruppen: [], semester: "WS 2026/27" }, extra || {}));
const titel = (liste) => liste.map((z) => z.t.titel);

test("Anmeldungen: nur zentrale Fristen, deren Titel Anmeldung, Belegung oder Buchung nennt", () => {
  const z = auswahl([
    F(d(19), "Tutorien-Anmeldung X110 (ILIAS)", { code: "X110" }),
    F(d(20), "Belegfrist Kurs X120"),
    F(d(21), "Buchungsstart Kurs X130"),
    F(d(22), "Anmeldeschluss Kurs X140"),
    F(d(23), "Bewerbungsfrist Stipendium Probe"),
    F(d(24), "Rückmeldung für das SS 2027"),
    T(d(25), "Anmeldung von Hand", "Frist", { code: "X100" }),
    T(d(26), "Infoabend mit Anmeldung", "Veranstaltung", { zentral: true, code: "X100" }),
    F(d(27), "Anmeldung Probe (entfällt)", { entfaellt: true }),
  ]);
  assert.deepEqual(titel(z), ["Tutorien-Anmeldung X110 (ILIAS)", "Belegfrist Kurs X120", "Buchungsstart Kurs X130", "Anmeldeschluss Kurs X140"]);
});

test("Anmeldungen: bis zum Ende des Semesters; was seit mehr als 7 Tagen vorbei ist, fällt weg, Vorbeigegangenes steht unten", () => {
  const z = auswahl([
    F(d(1), "Belegungszeitraum alt", { bis: d(9) }),
    F(d(5), "Belegungszeitraum kürzlich", { bis: d(12) }),
    F(d(12), "Belegungszeitraum läuft", { bis: d(19) }),
    F(d(10), "Anmeldeschluss vor einer Woche"),
    F(d(15), "Tutorien-Anmeldung vorgestern", { ort: "ab 18:00 · ILIAS" }),
    F(d(9), "Tutorien-Anmeldung vor 8 Tagen", { ort: "ab 18:00" }),
    F(d(8, 3, 2027), "Prüfungsanmeldung Nachholtermin", { bis: d(15, 3, 2027) }),
    F(d(31, 5, 2027), "Prüfungsanmeldung nächstes Semester", { bis: d(5, 7, 2027) }),
  ]);
  assert.deepEqual(titel(z), ["Belegungszeitraum läuft", "Tutorien-Anmeldung vorgestern", "Prüfungsanmeldung Nachholtermin", "Belegungszeitraum kürzlich", "Anmeldeschluss vor einer Woche"]);
  assert.deepEqual(z.map((x) => x.vorbei), [false, false, false, true, true], "„ab …“ ist nie vorbei, Spanne und Schluss nach ihrem Ende");
  // ohne Semesterende (kein Datenmodell): nichts nach oben begrenzt
  assert.equal(auswahl([F(d(31, 5, 2027), "Prüfungsanmeldung später", { bis: d(5, 7, 2027) })], { ende: null }).length, 1);
});

test("Anmeldungen: gefiltert wie die zentralen Termine (nur Module deines Plans)", () => {
  const modul = (code, fsEmpfohlen, fm) => ({ code, fsEmpfohlen, fm: fm || {}, f: { basename: code + " Probe" } });
  const Z = laden("zentral", {
    heute: "2026-10-17",
    kontext: { modell: { daten: () => ({ fachsemester: 1, module: [modul("X110", 1), modul("X200", 4), modul("X300", 5, { status: "angemeldet" })] }) } },
  }).ctx.zentral;
  const z = auswahl([
    F(d(19), "Tutorien-Anmeldung X110", { code: "X110" }),
    F(d(19), "Tutorien-Anmeldung X200", { code: "X200" }),
    F(d(19), "Tutorien-Anmeldung X300", { code: "X300" }),
    F(d(21), "Kurse – Belegungszeitraum", { code: "", bereich: "schluesselqualifikation", sq: true }),
  ], { aufnehmen: Z.filterBauen().aufnehmen });
  assert.deepEqual(titel(z), ["Tutorien-Anmeldung X110", "Tutorien-Anmeldung X300", "Kurse – Belegungszeitraum"]);
});

test("Anmeldungen: nur fürs Studium (Modul, Schlüsselqualifikation, TCP, Gruppen, Prüfungsanmeldung), unabhängig vom Schalter", () => {
  const ohne = { code: "" };
  const alle = [
    F(d(19), "Kursanmeldung X150", { code: "X150" }),
    F(d(19), "Sprachkurse: Anmeldung", { code: "", bereich: "schluesselqualifikation", sq: true }),
    F(d(20), "TCP – Anmeldeschluss Studienleistungen", ohne),
    F(d(20), "Übungsgruppen-Anmeldung Probe (ILIAS)", ohne),
    F(d(21), "Tutorien-Anmeldung Probe", ohne),
    F(d(22), "Prüfungsanmeldung Haupttermin", { code: "", bis: d(30) }),
    F(d(23), "Anmeldefrist Karrieremesse", ohne),
    F(d(23), "Belegfrist Kolloquium Probe", ohne),
    F(d(24), "Anmeldeschluss Seminar Verhandeln (freiwillig)", ohne),
    F(d(25), "Hochschulsport: Anmeldestart Probekurse", ohne),
  ];
  const studium = ["Kursanmeldung X150", "Sprachkurse: Anmeldung", "TCP – Anmeldeschluss Studienleistungen", "Übungsgruppen-Anmeldung Probe (ILIAS)",
    "Tutorien-Anmeldung Probe", "Prüfungsanmeldung Haupttermin"];
  assert.deepEqual(titel(auswahl(alle)), studium, "Karriere, Kolloquium, Seminare und Sport stehen nur in der Agenda");
  // „Fachschaft & Veranstaltungen“ ändert hier nichts (echter Filter der zentralen Termine, an und aus)
  for (const an of [true, false]) {
    const Z = laden("zentral", { heute: "2026-10-17", frontmatter: { "System/Einstellungen.md": { zentrale_veranstaltungen: an } },
      kontext: { modell: { daten: () => ({ fachsemester: 1, module: [{ code: "X150", fsEmpfohlen: 1, fm: {}, f: { basename: "X150 Probe" } }] }) } } }).ctx.zentral;
    assert.deepEqual(titel(auswahl(alle, { aufnehmen: Z.filterBauen().aufnehmen })), studium, "Schalter " + an);
  }
});

test("Anmeldungen: Wann aus Datum und den Zeiten im Ort, Wo ist der Rest des Orts", () => {
  const z = auswahl([
    F(d(14), "Übungsgruppen-Anmeldung X101 (ILIAS)", { bis: d(30), ort: "ab 15:00 · bis 30.10. 15:00 · ILIAS-Kurs X101 → Übungen, first come, first served" }),
    F(d(15), "Tutorien-Anmeldung X100 (ILIAS)", { ort: "ab 18:00 · ILIAS-Kurs X100, Abschnitt Tutoriengruppen" }),
    F(d(18), "Belegfrist Kurs X120", { ort: "Belegung in Alma bis 18.10." }),
    F(d(21), "Kurs X140 – Anmeldung", { ort: "bis 21.10. · Alma" }),
    F(d(23), "Anmeldestart Kurs X130", { ort: "ab 17:00 · online" }),
    F(d(24, 12), "Anmeldung Intensivkurse", { code: "", bereich: "schluesselqualifikation", bis: d(22, 1, 2027), ort: "bis 22.01., 12:00 · Alma" }),
    F(d(19), "Restplatz anmelden (freiwillig)", { code: "", bereich: "schluesselqualifikation", ort: "vor Kursbeginn · Mail an das Sprachzentrum" }),
    F(d(25), "Anmeldefrist Kurs X160", { ort: "", quelle: "https://uni-tuebingen.de/probe" }),
  ]);
  const je = {};
  for (const x of z) je[x.t.titel] = [x.wann, x.wo];
  assert.deepEqual(je["Übungsgruppen-Anmeldung X101 (ILIAS)"], ["Mi 14.10., 15:00 – Fr 30.10., 15:00", "ILIAS-Kurs X101 → Übungen, first come, first served"]);
  assert.deepEqual(je["Tutorien-Anmeldung X100 (ILIAS)"], ["ab Do 15.10., 18:00", "ILIAS-Kurs X100, Abschnitt Tutoriengruppen"]);
  assert.deepEqual(je["Belegfrist Kurs X120"], ["bis So 18.10.", "Belegung in Alma"]);
  assert.deepEqual(je["Kurs X140 – Anmeldung"], ["bis Mi 21.10.", "Alma"], "„bis …“ im Ort macht aus dem Tag einen Schluss");
  assert.deepEqual(je["Anmeldestart Kurs X130"], ["ab Fr 23.10., 17:00", "online"]);
  assert.deepEqual(je["Anmeldung Intensivkurse"], ["Do 24.12. – Fr 22.01., 12:00", "Alma"]);
  assert.deepEqual(je["Restplatz anmelden (freiwillig)"], ["Mo 19.10.", "vor Kursbeginn · Mail an das Sprachzentrum"]);
  assert.deepEqual(je["Anmeldefrist Kurs X160"], ["bis So 25.10.", ""], "ohne Ort zeigt der Block die Quelle");
  // Datumsangaben im Ort sind keine Uhrzeiten
  assert.deepEqual(TM.ortTeilen("Alma · für Kurse ab 06.11."), { ab: "", bis: "", schluss: false, zeit: "", wo: "Alma · für Kurse ab 06.11." });
});

test("Anmeldungen: „Gruppe 4“ (grün) aus deiner Gruppen-Notiz (Name wie in ILIAS, nie die Nummer der Liste)", () => {
  const g = (fm) => ({ fm: Object.assign({ typ: "lehrveranstaltung", code: "X100", art: "Tutorium", semester: "WS 2026/27", gruppe: "Gruppe 4", gruppe_alma: "5", herkunft: "ilias-gruppe" }, fm) });
  const t = F(d(15), "Tutorien-Anmeldung X100 (ILIAS)", { code: "X100" });
  const stand = (gruppen, extra) => auswahl([Object.assign({}, t, extra || {})], { gruppen })[0].status;
  assert.equal(stand([g()]), "Gruppe 4");
  assert.equal(stand([g({ herkunft: "gruppe-gewaehlt", gruppe: "Gruppe 2", gruppe_alma: "2" })]), "Gruppe 2");
  assert.equal(stand([g({ gruppe: "" })]), "angemeldet", "ohne Namen nur „angemeldet“");
  assert.equal(stand([g({ herkunft: "" }), g({ herkunft: "zentral" })]), "", "Alma, von Hand oder zentral ohne passende Gruppenzeit: kein Stand");
  assert.equal(stand([g({ semester: "SS 2027" })]), "", "anderes Semester");
  assert.equal(stand([g({ entfaellt: true })]), "", "in ILIAS verlassen");
  assert.equal(stand([g({ code: "X110" })]), "", "anderes Modul");
  assert.equal(stand([g()], { code: "" }), "", "Anmeldung ohne Modul");
  // Nennt der Titel die Art, zählt die Gruppe dieser Art; sonst jede Gruppe des Moduls
  const beide = [g({ art: "Übung", gruppe: "Gruppe 1" }), g({ gruppe: "Tutorium 3" })];
  assert.equal(stand(beide), "Tutorium 3");
  assert.equal(stand(beide, { titel: "Gruppen-Anmeldung X100" }), "Gruppe 1, Tutorium 3");
  assert.equal(stand([g({ art: "Übung" })]), "Gruppe 4", "keine Gruppe der genannten Art: die des Moduls");
});

// Notizen ohne Gruppen-Herkunft (Alma, von Hand, ein eigener Uni-Abgleich ohne Feld herkunft): angemeldet, wenn die Notiz zur
// Zeit einer Gruppe aus gruppen.json passt (Regel aus meine-gruppe.js: Code, Semester, Wochentag, Beginn und Ende ±15 Min.,
// c.t. und s.t.; Art Übung oder Tutorium). Nie über die Nummer der Gruppe.
test("Anmeldungen: „angemeldet“ auch aus einer Stundenplan-Notiz zur Zeit einer Gruppe (Alma, von Hand, ohne herkunft)", () => {
  const TMG = laden("termine", { heute: "2026-10-17", kontext: { modell: MODELL, user: { "meine-gruppe": laden("meine-gruppe").ergebnis } } }).ergebnis;
  const ZG = (extra) => Object.assign({ id: "ws-x100-uebung-2", code: "X100", art: "Übung", gruppe: "2", tag: "Mi", von: "08:00", bis: "10:00", ct: true, semester: "WS 2026/27" }, extra || {});
  const N = (fm) => ({ fm: Object.assign({ typ: "lehrveranstaltung", code: "X100", art: "Übung", wochentag: 3, beginn: "08:00", ende: "10:00", semester: "WS 2026/27" }, fm) });
  const t = F(d(14), "Übungsgruppen-Anmeldung X100 (ILIAS)", { code: "X100" });
  const stand = (gruppen, zentraleGruppen, extra, M) => (M || TMG).anmeldungen([Object.assign({}, t, extra || {})],
    { heute: HEUTE, ende: WS_ENDE, aufnehmen: null, gruppen, semester: "WS 2026/27", zentraleGruppen })[0].status;
  const zg = [ZG(), ZG({ id: "ws-x100-uebung-4", gruppe: "4", tag: "Di", von: "16:00", bis: "18:00" })];
  assert.equal(stand([N()], zg), "angemeldet", "Notiz ohne herkunft zur Zeit von Gruppe 2 (Alma-Zeit 8–10)");
  assert.equal(stand([N({ beginn: "08:15", ende: "09:45" })], zg), "angemeldet", "echte Zeit (c.t.)");
  assert.equal(stand([N({ herkunft: "alma", art: "Tutorium", gruppe: "Gruppe 4" })], zg), "Gruppe 4", "Name nur aus dem Feld gruppe der Notiz");
  assert.equal(stand([N({ ende: "11:00" })], zg), "", "Ende passt nicht");
  assert.equal(stand([N({ beginn: "08:30", ende: "10:00" })], [ZG({ ct: false })]), "", "s.t.: 08:30 ist mehr als 15 Min. daneben");
  assert.equal(stand([N({ wochentag: 4 })], zg), "", "anderer Wochentag");
  assert.equal(stand([N({ art: "Vorlesung" })], zg), "", "eine Vorlesung zur selben Zeit ist keine Gruppe");
  assert.equal(stand([N({ art: "Übungsteil" })], zg), "", "nur Übung oder Tutorium");
  assert.equal(stand([N({ herkunft: "zentral" })], zg), "", "zentrale Notizen sagen nichts über deine Anmeldung");
  assert.equal(stand([N({ semester: "SS 2027" })], zg), "", "anderes Semester");
  assert.equal(stand([N({ entfaellt: true })], zg), "", "entfallen");
  assert.equal(stand([N({ code: "X110" })], zg), "", "anderes Modul");
  assert.equal(stand([N()], []), "", "ohne Gruppenliste kein Abgleich der Zeit");
  assert.equal(stand([N()], [ZG({ code: "X110" })]), "", "Gruppe eines anderen Moduls");
  assert.equal(stand([N()], [ZG({ semester: "SS 2027" })]), "", "Gruppe eines anderen Semesters");
  const beideArten = [ZG(), ZG({ id: "ws-x100-tutorium-1", art: "Tutorium", tag: "Do" })];
  assert.equal(stand([N()], beideArten, { titel: "Tutorien-Anmeldung X100" }), "",
    "nennt der Titel Tutorium und gibt es Tutorien, zählen nur sie: Mi 8–10 ist die Übung");
  assert.equal(stand([N()], beideArten, { titel: "Gruppen-Anmeldung X100" }), "angemeldet", "ohne Art im Titel jede Gruppe");
  assert.equal(stand([N()], zg, null, TM), "", "ohne meine-gruppe.js kein Abgleich der Zeit");
  // Gemeldeter Fall (Zeiten wie in gruppen.json): E101 Mi 08:00–10:00 und S100 Di 10:00–12:00 aus einem alten Skript, ohne herkunft
  const E101 = ZG({ id: "ws-2026-27-e101-uebung-2", code: "E101", gruppe: "2" });
  const S100 = ZG({ id: "ws-2026-27-s100-tutorium-5", code: "S100", art: "Tutorium", gruppe: "5", tag: "Di", von: "10:00", bis: "12:00" });
  const notizen = [N({ code: "E101" }), N({ code: "S100", art: "Tutorium", wochentag: 2, beginn: "10:00", ende: "12:00" })];
  assert.equal(stand(notizen, [E101, S100], { code: "E101", titel: "Übungsgruppen-Anmeldung E101 VWL (ILIAS)" }), "angemeldet");
  assert.equal(stand(notizen, [E101, S100], { code: "S100", titel: "Tutorien-Anmeldung S100 Mathe (ILIAS)" }), "angemeldet");
});

test("Anmeldungen: Pillen nur für freiwillig (sofern nicht schon im Titel) und geschätzt", () => {
  const z = auswahl([
    F(d(19), "Kurse – Belegungszeitraum", { sq: true }),
    F(d(20), "Sprachkurse: Restplatz anmelden (freiwillig)", { sq: true }),
    F(d(21), "Prüfungsanmeldung Probe", { geschaetzt: true }),
    F(d(22), "Tutorien-Anmeldung X100", { code: "X100" }),
  ]);
  assert.deepEqual(z.map((x) => x.pillen), [["freiwillig"], [], ["geschätzt"], []]);
});

test("Uhrzeiten als Zahl sortiert (9:15 vor 12:15), nicht als Text (Fehler 9)", () => {
  const z = auswahl([F(d(20), "Anmeldung spät", { zeit: "12:15" }), F(d(20), "Anmeldung früh", { zeit: "9:15" })]);
  assert.deepEqual(titel(z), ["Anmeldung früh", "Anmeldung spät"]);
});
