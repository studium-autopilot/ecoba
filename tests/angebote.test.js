// Angebote der Uni (angebote.js): Termine für Kalender und Agenda (nur Gewähltes, Art vorn im Titel, Buchungsstart beim
// Hochschulsport, nichts doppelt zu Termin-Notizen) und die Auswahl (Vorgabe, Einstellungen ohne die neuen Felder, Schalter
// „Fachschaft & Veranstaltungen“, unbekannte Vortragsreihen). Nur ausgedachte Daten. Läuft ohne Obsidian: node --test tests/
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

// Ein Teil der Daten: je Art ein Angebot, dazu eine zweite Vortragsreihe
const LISTE = [
  a({ id: "v1", titel: "Restitution in Europa", datum: "2026-10-26", von: "18:15", bis: "19:45" }),
  a({ id: "v2", reihe: "WiSo-Kolloquium", titel: "Märkte", datum: "2026-10-26", von: "12:15" }),
  a({ id: "u1", kategorie: "ub", reihe: "Informationen finden", titel: "Zotero", datum: "2026-10-23", von: "10:00", bis: "11:30" }),
  a({ id: "s1", kategorie: "sport", reihe: "Hochschulsport", titel: "Badminton", datum: "2026-11-02", von: "18:00", bis: "20:00", anmeldung: { ab: "2026-10-19T17:00", bis: "" } }),
  a({ id: "w1", kategorie: "welcome", reihe: "Welcome Center", titel: "Stammtisch", datum: "2026-10-29" }),
];
const ids = (ts) => ts.map((t) => t.id);

test("Termine: nur gewählte Arten und Vortragsreihen, nach Tag, Uhrzeit (ohne zuerst) und Titel", () => {
  assert.deepEqual(ids(A.termineVon(LISTE, { auswahl: A.VORGABE })), ["s1-buchung", "u1", "v2", "s1"], "Vorgabe: Sport, Unibibliothek, WiSo");
  assert.deepEqual(ids(A.termineVon(LISTE, { auswahl: ["vortrag-studium-generale", "welcome"] })), ["v1", "w1"]);
  assert.deepEqual(A.termineVon(LISTE, { auswahl: [] }), [], "nichts gewählt");
  assert.deepEqual(A.termineVon(null, { auswahl: A.VORGABE }), [], "keine Daten");
  assert.deepEqual(ids(A.termineVon([a({ id: "b", titel: "B", von: "09:00" }), a({ id: "c", titel: "A", von: "09:00" }), a({ id: "x", titel: "Z" })],
    { auswahl: ["vortrag-studium-generale"] })), ["x", "c", "b"]);
  // unbekannte Art (die Prüfung in zentral.js lässt sie nicht durch) bleibt draußen
  assert.deepEqual(A.termineVon([a({ kategorie: "party" })], { auswahl: ["party"] }), []);
});

test("Termine: Uhrzeit wie bei Termin-Notizen, Art vorn im Titel, Link zur Seite der Uni", () => {
  const [u] = A.termineVon(LISTE, { auswahl: ["ub"] });
  assert.deepEqual(u, { id: "u1", datum: "2026-10-23", zeit: "10:00–11:30", minuten: 600, titel: "Unibibliothek: Zotero",
    url: "https://uni-tuebingen.de/beispiel", kategorie: "ub", buchung: false });
  const [w] = A.termineVon(LISTE, { auswahl: ["welcome"] });
  assert.equal(w.zeit, "");
  assert.equal(w.minuten, null);
  assert.equal(w.titel, "Welcome Center: Stammtisch");
  assert.equal(A.termineVon(LISTE, { auswahl: ["vortrag-wiso"] })[0].zeit, "12:15");
  assert.equal(A.titelVon(a({ titel: "Restitution in Europa" })), "Vortrag: Restitution in Europa");
  assert.equal(A.titelVon(a({ titel: "Vortrag „Confronting Science Denial“" })), "Vortrag „Confronting Science Denial“", "Art steht schon drin");
  assert.equal(A.titelVon(a({ kategorie: "sport", titel: "Hochschulsport-Party" })), "Hochschulsport-Party");
});

test("Termine: Hochschulsport mit Buchungsstart als eigenem Termin am Tag der Buchung", () => {
  const [b, s] = A.termineVon(LISTE, { auswahl: ["sport"] });
  assert.deepEqual(b, { id: "s1-buchung", datum: "2026-10-19", zeit: "17:00", minuten: 1020, titel: "Hochschulsport: Badminton – Buchungsstart",
    url: "https://uni-tuebingen.de/beispiel", kategorie: "sport", buchung: true });
  assert.equal(s.titel, "Hochschulsport: Badminton");
  assert.equal(s.zeit, "18:00–20:00");
  const ganzerTag = A.termineVon([a({ id: "s", kategorie: "sport", datum: "2026-11-02", anmeldung: { ab: "2026-10-19", bis: "" } })], { auswahl: ["sport"] });
  assert.deepEqual(ganzerTag.map((t) => [t.datum, t.zeit, t.minuten]), [["2026-10-19", "", null], ["2026-11-02", "", null]]);
  // nur beim Hochschulsport; die Anmeldung anderer Arten steht auf der Seite der Uni
  assert.deepEqual(ids(A.termineVon([a({ id: "u", kategorie: "ub", anmeldung: { ab: "2026-10-12", bis: "" } })], { auswahl: ["ub"] })), ["u"]);
});

test("Termine: was schon als Termin-Notiz dasteht, kommt nicht doppelt", () => {
  const vorhanden = [
    { datum: "2026-10-23", titel: "UB-Kurs: Zotero", minuten: 600 },
    { datum: "2026-10-26", titel: "Restitution in Europa", minuten: null },
    { datum: "2026-10-29", titel: "Stammtisch der Fachschaft", minuten: 1200 },
  ];
  const alle = ["sport", "ub", "vortrag-studium-generale", "vortrag-wiso", "welcome"];
  // Zotero (gleiche Uhrzeit, Titel steckt drin) und der Vortrag (ohne Uhrzeit, gleicher Titel) stehen schon da; der Stammtisch
  // ohne Uhrzeit ist nicht der Stammtisch der Fachschaft
  assert.deepEqual(ids(A.termineVon(LISTE, { auswahl: alle, vorhanden })), ["s1-buchung", "v2", "w1", "s1"]);
  assert.deepEqual(ids(A.termineVon(LISTE, { auswahl: ["vortrag-studium-generale"], vorhanden: [{ datum: "2026-10-26", titel: "Vortrag: Restitution", minuten: null }] })),
    ["v1"], "ohne Uhrzeit reicht ein Teil des Titels nicht");
  // andere Uhrzeit oder anderer Tag: nicht derselbe
  assert.deepEqual(ids(A.termineVon(LISTE, { auswahl: ["ub"], vorhanden: [{ datum: "2026-10-23", titel: "UB-Kurs: Zotero", minuten: 840 }] })), ["u1"]);
  assert.deepEqual(ids(A.termineVon(LISTE, { auswahl: ["ub"], vorhanden: [{ datum: "2026-10-24", titel: "UB-Kurs: Zotero", minuten: 600 }] })), ["u1"]);
  // der Buchungsstart bleibt, auch wenn der Kurs selbst schon dasteht
  assert.deepEqual(ids(A.termineVon(LISTE, { auswahl: ["sport"], vorhanden: [{ datum: "2026-11-02", titel: "Badminton", minuten: 1080 }] })), ["s1-buchung"]);
});

test("Gleicher Titel: der kürzere steckt als ganze Wörter im längeren, mindestens 4 Zeichen, Umlaute und Zeichen egal", () => {
  assert.equal(A.gleicherTitel("UB-Kurs: Zotero", "Zotero"), true);
  assert.equal(A.gleicherTitel("Vortrag „Märkte im Wandel“", "Maerkte im Wandel"), true);
  assert.equal(A.gleicherTitel("Rotes Kreuz", "Rot"), false, "kürzer als 4 Zeichen");
  assert.equal(A.gleicherTitel("Zoterokurs", "Zotero"), false, "nur ganze Wörter");
  assert.equal(A.gleicherTitel("Einführung in R", "Einführung in Python"), false);
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
  assert.equal(e[6].name, "Welcome Center");
  assert.ok(e.every((x) => !("hinweis" in x)), "nur Namen, kein Satz darunter");
  assert.equal(e[4].name, "Antrittsvorlesungen");
  // nach „Fertig“: Angehakte in Reihenfolge der Karte; früher gewählte Reihe, die gerade fehlt, bleibt
  const haken = { sport: true, "vortrag-antrittsvorlesungen": true, welcome: false };
  assert.deepEqual(A.wahlNeu(["vortrag-alte-reihe", "welcome", "ub"], e, haken), ["sport", "vortrag-antrittsvorlesungen", "vortrag-alte-reihe"]);
  // eine neue Reihe, die nicht gewählt ist, erscheint nicht im Kalender
  assert.deepEqual(A.termineVon([a({ id: "neu", reihe: "Antrittsvorlesungen" })], { auswahl: A.VORGABE }), []);
});
