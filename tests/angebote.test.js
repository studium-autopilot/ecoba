// Angebote der Uni (angebote.js, Codeblock eba-angebote): Auswahl (Vorgabe, Einstellungen ohne die neuen Felder, Schalter
// „Fachschaft & Veranstaltungen“, unbekannte Vortragsreihen), Zeitfenster, Gruppieren nach Tagen, Filter nach Art,
// Buchungsbeginn beim Hochschulsport und die Texte einer Zeile. Nur ausgedachte Daten. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const A = laden("angebote").ergebnis;

// Ein geprüftes Angebot (wie zentral.js es liefert); jeder Fall ändert nur, was er braucht
const a = (anders = {}) => Object.assign({
  id: "x", kategorie: "vortrag", reihe: "Studium Generale", titel: "Beispielvortrag", datum: "2026-10-19", von: "", bis: "",
  ort: "", online: false, url: "https://uni-tuebingen.de/beispiel", anmeldung: null,
}, anders);

// Heute: Samstag, 17.10.2026, 12:00. Fenster 14 Tage → bis Freitag 30.10., ab 31.10. „Mehr anzeigen“
const HEUTE = { heute: "2026-10-17", jetzt: "12:00" };
const LISTE = [
  a({ id: "v1", titel: "Vortrag Montag", von: "18:15", bis: "19:45", ort: "Hörsaal 9" }),
  a({ id: "v2", titel: "Vortrag November", datum: "2026-11-10", von: "18:15" }),
  a({ id: "v3", reihe: "Fachbereich", titel: "Heute vorbei", datum: "2026-10-17", von: "10:00", bis: "11:00" }),
  a({ id: "v4", reihe: "Fachbereich", titel: "Heute noch", datum: "2026-10-17", von: "14:00", bis: "15:00", online: true }),
  a({ id: "v5", titel: "Gestern", datum: "2026-10-16" }),
  a({ id: "u1", kategorie: "ub", reihe: "UB-Kurse", titel: "Literatur finden", datum: "2026-10-20", ort: "UB, Schulungsraum", anmeldung: { ab: "", bis: "2026-10-19" } }),
  a({ id: "s1", kategorie: "sport", reihe: "Hochschulsport", titel: "Badminton", datum: "2026-11-02", von: "18:00", bis: "20:00", anmeldung: { ab: "2026-10-19T17:00", bis: "" } }),
  a({ id: "w1", kategorie: "welcome", reihe: "Welcome Center", titel: "Stadtführung", datum: "2026-10-30" }),
  a({ id: "w2", kategorie: "welcome", reihe: "Welcome Center", titel: "Spieleabend", datum: "2026-10-31" }),
];
const kurz = (tage) => tage.map((t) => [t.tag, t.zeilen.map((z) => z.angebot.id + (z.art === "buchung" ? ":buchung" : ""))]);

test("Zeitfenster: heute bis 14 Tage sofort, danach „Mehr anzeigen“; Vergangenes fällt weg", () => {
  const r = A.auswaehlen(LISTE, HEUTE);
  assert.deepEqual(kurz(r.nah), [
    ["2026-10-17", ["v4"]],
    ["2026-10-19", ["s1:buchung", "v1"]],
    ["2026-10-20", ["u1"]],
    ["2026-10-30", ["w1"]],
  ]);
  assert.deepEqual(kurz(r.spaeter), [["2026-10-31", ["w2"]], ["2026-11-02", ["s1"]], ["2026-11-10", ["v2"]]]);
  assert.equal(r.spaeterZeilen, 3);
  // ohne Uhrzeit „jetzt“ bleibt ein heutiger Termin stehen; kürzeres Fenster
  assert.deepEqual(kurz(A.auswaehlen(LISTE, { heute: "2026-10-17" }).nah)[0], ["2026-10-17", ["v3", "v4"]]);
  assert.deepEqual(kurz(A.auswaehlen(LISTE, Object.assign({ tage: 3 }, HEUTE)).nah).map((t) => t[0]), ["2026-10-17", "2026-10-19"]);
});

test("Gruppieren: je Tag sortiert – ohne Uhrzeit zuerst, dann Uhrzeit, Buchungsbeginn vor Terminen gleicher Zeit", () => {
  const r = A.auswaehlen([
    a({ id: "c", titel: "C", von: "18:00" }),
    a({ id: "b", titel: "B" }),
    a({ id: "s", kategorie: "sport", titel: "Kurs", datum: "2026-11-02", anmeldung: { ab: "2026-10-19T18:00", bis: "" } }),
    a({ id: "a", titel: "A", von: "09:00" }),
  ], HEUTE);
  assert.deepEqual(kurz(r.nah), [["2026-10-19", ["b", "a", "s:buchung", "c"]]]);
});

test("Filter nach Art: ausgeschaltete Arten fehlen in der Liste, ihre Anzahl bleibt am Chip", () => {
  const alle = A.auswaehlen(LISTE, HEUTE);
  assert.deepEqual(alle.zahlen, { vortrag: 3, ub: 1, sport: 1, welcome: 2 });
  const r = A.auswaehlen(LISTE, Object.assign({ aus: ["sport", "welcome"] }, HEUTE));
  assert.deepEqual(r.zahlen, alle.zahlen);
  assert.deepEqual(kurz(r.nah), [["2026-10-17", ["v4"]], ["2026-10-19", ["v1"]], ["2026-10-20", ["u1"]]]);
  assert.deepEqual(kurz(r.spaeter), [["2026-11-10", ["v2"]]]);
  const keine = A.auswaehlen(LISTE, Object.assign({ aus: A.ARTEN.map((k) => k.id) }, HEUTE));
  assert.equal(keine.nah.length + keine.spaeter.length, 0);
});

test("Auswahl: nur gewählte Arten und Vortragsreihen, Anzahl je Art aus der Auswahl", () => {
  const r = A.auswaehlen(LISTE, Object.assign({ auswahl: ["sport", "ub", "vortrag-wiso"] }, HEUTE));
  assert.deepEqual(r.zahlen, { vortrag: 0, ub: 1, sport: 1, welcome: 0 }, "Reihe „Fachbereich“ ist nicht die WiSo-Fakultät");
  assert.deepEqual(kurz(r.nah), [["2026-10-19", ["s1:buchung"]], ["2026-10-20", ["u1"]]]);
  const sg = A.auswaehlen(LISTE, Object.assign({ auswahl: ["vortrag-studium-generale", "vortrag-fachbereich"] }, HEUTE));
  assert.deepEqual(kurz(sg.nah), [["2026-10-17", ["v4"]], ["2026-10-19", ["v1"]]]);
  assert.deepEqual(kurz(sg.spaeter), [["2026-11-10", ["v2"]]]);
  assert.equal(A.auswaehlen(LISTE, Object.assign({ auswahl: [] }, HEUTE)).nah.length, 0, "nichts gewählt");
  assert.deepEqual(A.artenDerAuswahl(["welcome", "vortrag-wiso", "sport"]), ["vortrag", "sport", "welcome"]);
  assert.deepEqual(A.artenDerAuswahl([]), []);
});

test("Auswahl: Vorgabe und Einstellungen ohne die neuen Felder (Tresor vor dieser Version)", () => {
  assert.deepEqual(A.VORGABE, ["sport", "ub", "vortrag-wiso"]);
  // alte Einstellungen: keine Auswahl gespeichert → Karte mit der Vorgabe, Fachschaft-Schalter an (Feld fehlt = an)
  assert.deepEqual(A.wahlLesen({ name: "", variante: "offen" }), { gewaehlt: false, auswahl: ["sport", "ub", "vortrag-wiso"], veranstaltungen: true });
  assert.deepEqual(A.wahlLesen(null).auswahl, A.VORGABE);
  // nur die Liste ohne „gewählt“ (z. B. von Hand angelegt) gilt noch nicht als Auswahl
  assert.equal(A.wahlLesen({ angebote_auswahl: ["welcome"] }).gewaehlt, false);
  // gespeichert, auch leer; einzelner Wert statt Liste; leere Einträge fallen weg
  assert.deepEqual(A.wahlLesen({ angebote_gewaehlt: true, angebote_auswahl: [] }).auswahl, []);
  assert.deepEqual(A.wahlLesen({ angebote_gewaehlt: true }).auswahl, []);
  assert.deepEqual(A.wahlLesen({ angebote_gewaehlt: true, angebote_auswahl: "sport" }).auswahl, ["sport"]);
  assert.deepEqual(A.wahlLesen({ angebote_gewaehlt: true, angebote_auswahl: ["ub", null, " "] }).auswahl, ["ub"]);
});

test("Auswahl: Schalter „Fachschaft & Veranstaltungen“ liest und schreibt zentrale_veranstaltungen", () => {
  // fehlt das Feld und bleibt der Schalter an: Feld kommt nicht ohne Grund dazu
  const fm = { name: "" };
  A.wahlSchreiben(fm, ["sport"], true);
  assert.deepEqual(fm, { name: "", angebote_auswahl: ["sport"], angebote_gewaehlt: true });
  // aus → false, wieder lesen → aus; wieder an → true
  A.wahlSchreiben(fm, ["sport"], false);
  assert.equal(fm.zentrale_veranstaltungen, false);
  assert.deepEqual(A.wahlLesen(fm), { gewaehlt: true, auswahl: ["sport"], veranstaltungen: false });
  A.wahlSchreiben(fm, [], true);
  assert.equal(fm.zentrale_veranstaltungen, true);
  assert.equal(A.wahlLesen(fm).veranstaltungen, true);
  // wie zentral.js: auch der Text „false“ heißt aus
  assert.equal(A.wahlLesen({ zentrale_veranstaltungen: "false" }).veranstaltungen, false);
  const unveraendert = { zentrale_veranstaltungen: "false" };
  A.wahlSchreiben(unveraendert, [], false);
  assert.equal(unveraendert.zentrale_veranstaltungen, "false", "gleicher Wert: nicht anfassen");
});

test("Auswahl für die Einrichtung: nur die Felder, die sich ändern, ohne das Frontmatter anzufassen", () => {
  const fm = { name: "", zentrale_veranstaltungen: false };
  assert.deepEqual(A.wahlFelder(fm, ["ub"], false), { angebote_auswahl: ["ub"], angebote_gewaehlt: true });
  assert.deepEqual(A.wahlFelder(fm, [], true), { angebote_auswahl: [], angebote_gewaehlt: true, zentrale_veranstaltungen: true });
  assert.deepEqual(A.wahlFelder({}, ["sport"], true), { angebote_auswahl: ["sport"], angebote_gewaehlt: true }, "fehlt = an");
  assert.deepEqual(A.wahlFelder(null, [], false).zentrale_veranstaltungen, false);
  assert.deepEqual(fm, { name: "", zentrale_veranstaltungen: false });
});

test("Auswahl: Vortragsreihen aus den Daten – bekannte erkannt, unbekannte zunächst aus und in der Karte", () => {
  assert.equal(A.wahlSchluessel(a({ reihe: "Wirtschafts- und Sozialwissenschaftliche Fakultät" })), "vortrag-wiso");
  assert.equal(A.wahlSchluessel(a({ reihe: "WiSo-Kolloquium" })), "vortrag-wiso");
  assert.equal(A.wahlSchluessel(a({ reihe: "Studium generale" })), "vortrag-studium-generale");
  assert.equal(A.wahlSchluessel(a({ reihe: "Ringvorlesung Nachhaltigkeit & Klima" })), "vortrag-ringvorlesung-nachhaltigkeit-klima");
  assert.equal(A.wahlSchluessel(a({ kategorie: "sport", reihe: "Kurse" })), "sport");
  const e = A.wahlEintraege([
    a({ reihe: "Studium Generale" }),
    a({ reihe: "Ringvorlesung Nachhaltigkeit" }), a({ id: "y", reihe: "Ringvorlesung Nachhaltigkeit" }),
    a({ reihe: "Antrittsvorlesungen" }),
    a({ kategorie: "ub", reihe: "Führungen" }),
  ]);
  assert.deepEqual(e.map((x) => [x.schluessel, x.an]), [
    ["sport", true], ["ub", true], ["vortrag-wiso", true], ["vortrag-studium-generale", false],
    ["vortrag-antrittsvorlesungen", false], ["vortrag-ringvorlesung-nachhaltigkeit", false], ["welcome", false],
  ]);
  assert.equal(e[6].hinweis, "vor allem für Promovierende und Postdocs");
  assert.equal(e[4].name, "Antrittsvorlesungen");
  // nach „Fertig“: Angehakte in Reihenfolge der Karte; früher gewählte Reihe, die gerade fehlt, bleibt
  const haken = { sport: true, "vortrag-antrittsvorlesungen": true, welcome: false };
  assert.deepEqual(A.wahlNeu(["vortrag-alte-reihe", "welcome", "ub"], e, haken), ["sport", "vortrag-antrittsvorlesungen", "vortrag-alte-reihe"]);
  // eine neue Reihe, die nicht gewählt ist, erscheint nicht in der Liste
  const r = A.auswaehlen([a({ id: "neu", reihe: "Antrittsvorlesungen" })], Object.assign({ auswahl: A.VORGABE }, HEUTE));
  assert.equal(r.nah.length, 0);
});

test("Hochschulsport: Buchungsbeginn als eigene Zeile, nur solange er nicht vorbei ist", () => {
  const sport = (ab) => a({ id: "s", kategorie: "sport", reihe: "Hochschulsport", titel: "Kurs", datum: "2026-10-26", von: "18:00", anmeldung: { ab, bis: "" } });
  assert.deepEqual(kurz(A.auswaehlen([sport("2026-10-19T17:00")], HEUTE).nah), [["2026-10-19", ["s:buchung"]], ["2026-10-26", ["s"]]]);
  assert.deepEqual(kurz(A.auswaehlen([sport("2026-10-17")], HEUTE).nah), [["2026-10-17", ["s:buchung"]], ["2026-10-26", ["s"]]], "heute ohne Uhrzeit");
  assert.deepEqual(kurz(A.auswaehlen([sport("2026-10-10T08:00")], HEUTE).nah), [["2026-10-26", ["s"]]], "Buchung schon offen");
  // nur beim Hochschulsport; andere Arten nennen den Beginn der Anmeldung in der Zeile
  const ub = a({ id: "u", kategorie: "ub", datum: "2026-10-26", anmeldung: { ab: "2026-10-19", bis: "" } });
  assert.deepEqual(kurz(A.auswaehlen([ub], HEUTE).nah), [["2026-10-26", ["u"]]]);
  // Buchungszeile zählt das Angebot nur einmal
  assert.equal(A.auswaehlen([sport("2026-10-19T17:00")], HEUTE).zahlen.sport, 1);
});

test("Texte einer Zeile: Uhrzeit, Ort und online, Anmeldung, Buchungsbeginn", () => {
  const r = A.auswaehlen(LISTE, HEUTE);
  const zeile = (id, art) => r.nah.concat(r.spaeter).reduce((x, t) => x.concat(t.zeilen), []).find((z) => z.angebot.id === id && z.art === (art || "termin"));
  assert.equal(A.zeitText(zeile("v1")), "18:15–19:45");
  assert.equal(A.zeitText(zeile("v2")), "18:15");
  assert.equal(A.zeitText(zeile("w1")), "");
  assert.equal(A.zeitText(zeile("s1", "buchung")), "ab 17:00");
  assert.equal(A.zeitText({ art: "termin", zeit: "08:30", ende: "", angebot: a() }), "8:30");
  assert.equal(A.metaText(zeile("v1"), HEUTE.heute), "Studium Generale · Hörsaal 9");
  assert.equal(A.metaText(zeile("v4"), HEUTE.heute), "Fachbereich · online");
  assert.equal(A.metaText(zeile("u1"), HEUTE.heute), "UB-Kurse · UB, Schulungsraum · Anmeldung bis 19.10.");
  assert.equal(A.metaText(zeile("s1", "buchung"), HEUTE.heute), "Buchungsstart · Hochschulsport · Kurs ab Mo 02.11.");
  assert.equal(A.ortText(a({ ort: "Neue Aula", online: true })), "Neue Aula · online");
  assert.equal(A.anmeldeText(a({ anmeldung: { ab: "2026-10-19", bis: "2026-10-26T23:59" } }), "2026-10-17"), "Anmeldung ab 19.10.");
  assert.equal(A.anmeldeText(a({ anmeldung: { ab: "2026-10-10", bis: "2026-10-26T23:59" } }), "2026-10-17"), "Anmeldung bis 26.10., 23:59");
  assert.equal(A.anmeldeText(a({ anmeldung: { ab: "", bis: "2026-10-16" } }), "2026-10-17"), "", "Anmeldung vorbei");
  assert.equal(A.anmeldeText(a({ kategorie: "sport", anmeldung: { ab: "2026-10-19T17:00", bis: "2026-10-25" } }), "2026-10-17"), "Buchung bis 25.10.");
  // mit Uhrzeit von jetzt: heute abgelaufene Anmeldung fällt weg, heute beginnende steht bis zu ihrer Uhrzeit als „ab“ da
  const heute = (anmeldung, jetzt) => A.anmeldeText(a({ anmeldung }), "2026-10-17", jetzt);
  assert.equal(heute({ ab: "", bis: "2026-10-17T12:00" }, "11:59"), "Anmeldung bis 17.10., 12:00");
  assert.equal(heute({ ab: "", bis: "2026-10-17T12:00" }, "12:00"), "");
  assert.equal(heute({ ab: "", bis: "2026-10-17T12:00" }), "Anmeldung bis 17.10., 12:00", "ohne Uhrzeit von jetzt bis Tagesende");
  assert.equal(heute({ ab: "", bis: "2026-10-17" }, "23:00"), "Anmeldung bis 17.10.", "Tag ohne Uhrzeit gilt bis zu seinem Ende");
  assert.equal(heute({ ab: "2026-10-17T14:00", bis: "2026-10-20" }, "13:00"), "Anmeldung ab 17.10., 14:00");
  assert.equal(heute({ ab: "2026-10-17T14:00", bis: "2026-10-20" }, "14:00"), "Anmeldung bis 20.10.");
  assert.equal(A.metaText(zeile("u1"), "2026-10-19", "23:00"), "UB-Kurse · UB, Schulungsraum · Anmeldung bis 19.10.");
});

test("Monatstrenner: nur der erste Tag je neuem Monat", () => {
  const { monatsMarke } = A;
  const tage = ["2026-10-28", "2026-10-30", "2026-11-02", "2026-11-05", "2026-12-01", "2027-03-03"].map((tag) => ({ tag }));
  assert.deepEqual(monatsMarke(tage, "2026-10-27"), { "2026-11-02": "Nov.", "2026-12-01": "Dez.", "2027-03-03": "März" });
  assert.deepEqual(monatsMarke([], "2026-10-27"), {});
});
