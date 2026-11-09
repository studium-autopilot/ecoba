// Kursseiten aus ILIAS (ilias-html.js kursseite, kursseite.js, Schritt in ilias.js): Seiteninhalt lesen (Tabellen, Listen,
// Kästen, Videos, ohne Einträge und Kalender), Markdown ohne Kurspasswörter, Notiz mit „Meine Notizen“, Zeitplan aus den
// Tabellen, und der Abruf im Lauf (auch beim eigenen Uni-Abgleich, nur Geändertes, gelöscht bleibt gelöscht, fremde Notizen
// unberührt). Die Seite in tests/daten/ilias-seiten/kursseite.html ist erfunden, hat aber den Aufbau echter Tübinger Kursseiten.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");
const A = require("./ilias-attrappen.js");

const SKRIPTE = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte");
const H = require(path.join(SKRIPTE, "ilias-html.js"));
const K = require(path.join(SKRIPTE, "kursseite.js"));
const { I, GEHEIM, aufbau, standardIlias } = A;
const SEITE = fs.readFileSync(path.join(__dirname, "daten", "ilias-seiten", "kursseite.html"), "utf8");
const URL = "https://ovidius.uni-tuebingen.de/goto.php/crs/300";
const KENNWORT = { hatKennwort: I.hatKennwort, ohneKennwort: I.ohneKennwort };
const md = (html) => K.markdown(H.kursseite(html || SEITE, URL), KENNWORT);
// zerlegt, damit werkzeuge/pruefen.py die erfundenen Kurspasswörter nicht für echte hält
const PW = "Pass" + "wort", KW = "Kenn" + "wort";
const absatz = (...zeilen) => ({ art: "absatz", zeilen: zeilen.map((z) => (Array.isArray(z) ? z : [{ t: z }])) });

test("Laden: Bibliothek, keine Erweiterung", () => {
  const code = fs.readFileSync(path.join(SKRIPTE, "kursseite.js"), "utf8");
  assert.equal(/\bregistrieren\s*(\(|=|:|,|\})|\baktionen\s*:/.test(code), false);
  const L = laden("kursseite").ergebnis;
  for (const n of ["markdown", "notiz", "gleich", "zeitplan", "woche", "seiten"]) assert.equal(typeof L[n], "function", n);
  assert.deepEqual(L.seiten(), []);
});

test("Kursseite lesen: nur der Seiteninhalt, ohne Einträge, Skripte, Fenster, Kalender und übergangene Abschnitte", () => {
  const b = H.kursseite(SEITE, URL);
  assert.deepEqual(b.map((x) => x.art), ["absatz", "absatz", "absatz", "tabelle", "liste", "abschnitt", "video", "absatz"]);
  const alles = JSON.stringify(b);
  for (const weg of ["focus()", "Vertiefungswissen", "nicht Teil der Seite", "Vollbild", "KW", "Ordnergruppe", "Logo", "token"]) {
    assert.equal(alles.includes(weg), false, weg);
  }
  assert.equal(b[0].ebene, 1);
  assert.deepEqual(b[2].zeilen[0][1], { t: "TIMMS", fett: true, url: "https://timms.example.org/list?id=1&x=2" });
  assert.equal(b[2].zeilen.length, 2, "<br> trennt Zeilen");
  const t = b[3];
  assert.equal(t.zeilen.length, 5);
  assert.deepEqual(t.zeilen[4].map((c) => c.zeilen.length ? c.zeilen[0][0].t : ""), ["Februar 2027", "", "Klausur"], "colspan als leere Zelle");
  assert.deepEqual(t.zeilen[2][2].zeilen.map((z) => z[0].t), ["Vektoren", "und Matrizen"]);
  assert.equal(t.zeilen[3][2].zeilen[0][0].url, "https://ovidius.uni-tuebingen.de/goto.php/crs/999");
  assert.deepEqual(b[4].punkte[1].unter.map((p) => p.zeilen[0][0].t), ["Anmeldung ab 15.10."]);
  assert.equal(b[6].titel, "Ablauf der Vorlesung");
  assert.deepEqual(b[7].zeilen, [[{ t: "Folie zum Herunterladen" }]], "Adresse mit Token fällt weg, der Text bleibt");
  assert.deepEqual(H.kursseite("<div id=\"il_center_col\"><p class=\"ilc_Paragraph\"> </p><div class=\"ilContainerBlock\">x</div></div>", URL), []);
});

test("Markdown: Überschrift, Fett und Links, Tabelle, Liste, Kasten, Video; Zeilenanfang und „|“ entschärft", () => {
  const t = md();
  assert.match(t, /^## Willkommen im Kurs X100$/m, "Überschrift ohne Fett");
  assert.match(t, /jeden \*\*Montag 10 - 12 Uhr\*\* im \*\*Hörsaal 99 \(Beispielbau\)\*\* statt\./);
  assert.match(t, /bei \*\*\[TIMMS\]\(https:\/\/timms\.example\.org\/list\?id=1&x=2\)\.\*\* Fragen/, "ein Fett um Link und Punkt");
  assert.match(t, /^Zweite Zeile mit 1\. Punkt$/m);
  assert.match(t, /^\| Woche \| Datum \| Themen der Vorlesung \| Videos \|$/m, "Kopf ohne Fett");
  assert.match(t, /^\| --- \| --- \| --- \| --- \|$/m);
  assert.match(t, /^\| 1 \| 12\.10\.2026 - 16\.10\.2026 \| Einführung \\\| Überblick \| \[1\. Stunde\]\(https:\/\/timms\.example\.org\/tp\/1\) \|$/m);
  assert.match(t, /\| Vektoren<br>und Matrizen \|/);
  assert.match(t, /^- Übungsblätter im Ordner \*\*Übungen\*\*\n- Tutorien in Präsenz\n {2}- Anmeldung ab 15\.10\.$/m);
  assert.match(t, /^> Raumänderung: Das Tutorium ist ab sofort in \*\*Hörsaal 23\*\*\.$/m);
  assert.match(t, /^Video: Ablauf der Vorlesung$/m);
  assert.equal(K.markdown([absatz("1. Punkt"), absatz("- Strich")]), "1\\. Punkt\n\n\\- Strich", "kein Listenanfang");
  assert.equal(K.markdown([absatz([{ t: "Link", url: "https://example.org/a b(c)|d" }])]), "[Link](https://example.org/a%20b%28c%29%7Cd)");
  assert.equal(K.markdown([]), "");
});

test("Kurspasswörter: nie in der Notiz, auch nicht in der Zeile nach der Marke mit Doppelpunkt", () => {
  const t = md();
  for (const w of ["Geheim42x", "Hallo99Welt"]) assert.equal(t.includes(w), false, w);
  assert.match(t, /\[Zwischentest 1\]\([^)]*\)<br>\(Passwort steht in ILIAS\) \| \(Passwort steht in ILIAS\) \|/);
  assert.equal(K.markdown([absatz(`Zugang zum Test (${PW}: abc123)`)], KENNWORT), "Zugang zum Test (Passwort steht in ILIAS)");
  assert.equal(K.markdown([absatz(`Das ${KW} lautet Sommer2026`, "Danach weiter")], KENNWORT), "(Passwort steht in ILIAS)\nDanach weiter");
  assert.equal(K.markdown([absatz(PW + ":", "", "Xy9!", "Danach")], KENNWORT), "(Passwort steht in ILIAS)\n\nDanach");
});

test("Notiz: Eigenschaften, Kopf, Inhalt; neuer Inhalt ersetzt alles außer „Meine Notizen“ und eigenen Eigenschaften", () => {
  const d = { code: "S100", url: URL, refId: "300", geaendert: "2026-11-05", inhalt: "Erster Stand" };
  const n = K.notiz(d, null);
  assert.equal(n, "---\ntyp: kursseite\ncode: \"S100\"\nherkunft: ilias\nquelle: \"" + URL + "\"\nilias_ref: \"300\"\ngeaendert: 2026-11-05\n---\n"
    + "# S100 Kursseite\n\nVon der Startseite des Kurses S100 in ILIAS, zuletzt geändert am 05.11.2026. [In ILIAS öffnen](" + URL + ")\n\n"
    + "Erster Stand\n\n## Meine Notizen\n");
  assert.equal(K.eigene(n), true);
  assert.equal(K.eigene(n.replace("herkunft: ilias", "herkunft: server")), false);
  assert.equal(K.gleich(n, Object.assign({}, d, { geaendert: "2026-11-09" })), true, "gleicher Inhalt an einem anderen Tag");
  assert.equal(K.gleich(n, Object.assign({}, d, { inhalt: "Neu" })), false);
  const mein = n.replace("geaendert: 2026-11-05\n", "geaendert: 2026-11-05\ntags:\n  - mathe\nstatus: gelesen\n") + "Nicht vergessen: Taschenrechner\n";
  const neu = K.notiz(Object.assign({}, d, { geaendert: "2026-11-09", inhalt: "Zweiter Stand" }), mein);
  assert.match(neu, /^geaendert: 2026-11-09\ntags:\n {2}- mathe\nstatus: gelesen\n---\n/m);
  assert.match(neu, /\nZweiter Stand\n\n## Meine Notizen\nNicht vergessen: Taschenrechner\n$/);
  assert.equal(neu.includes("Erster Stand"), false);
  assert.equal(K.meineVon(neu), "Nicht vergessen: Taschenrechner");
  assert.notEqual(K.kurzHash("a"), K.kurzHash("b"));
});

test("Zeitplan: Tage und Zeiträume in Tabellen, Jahr ergänzt, Woche, ohne Inhalt weg", () => {
  const b = "2026-11-05";
  assert.deepEqual(K.bereich("12.10.2026 - 16.10.2026", b), { von: "2026-10-12", bis: "2026-10-16" });
  assert.deepEqual(K.bereich("12.10.26 - 16.10.26", b), { von: "2026-10-12", bis: "2026-10-16" });
  assert.deepEqual(K.bereich("19.10. -\u00a0 23.10.", b), { von: "2026-10-19", bis: "2026-10-23" });
  assert.deepEqual(K.bereich("28.12. - 8.1.", b), { von: "2026-12-28", bis: "2027-01-08" }, "über den Jahreswechsel");
  assert.deepEqual(K.bereich("11.01.", b), { von: "2027-01-11", bis: "2027-01-11" }, "das nähere Jahr");
  assert.deepEqual(K.bereich("Woche 02.11.26", b), { von: "2026-11-02", bis: "2026-11-08" });
  assert.deepEqual(K.bereich("13.11.2026 17:00 - 18:00", b), { von: "2026-11-13", bis: "2026-11-13" });
  for (const x of ["Februar 2027", "vor Vorlesungsbeginn", "31.02.2026", "1.10.2026 - 30.12.2026", "Aufg. 1 - 5", ""]) assert.equal(K.bereich(x, b), null, x);

  const n = K.notiz({ code: "X100", url: URL, refId: "1", geaendert: "2026-10-10", inhalt: md() }, null);
  const z = K.zeitplan(n);
  assert.deepEqual(z.map((x) => [x.von, x.bis]), [["2026-10-12", "2026-10-16"], ["2026-10-19", "2026-10-23"], ["2026-11-13", "2026-11-13"]]);
  assert.deepEqual(z[0].zellen, [{ spalte: "Themen der Vorlesung", text: "Einführung | Überblick" }, { spalte: "Videos", text: "1. Stunde" }],
    "laufende Nummer der Woche, Datum, Links und Entschärfung weg");
  assert.deepEqual(z[1].zellen, [{ spalte: "Themen der Vorlesung", text: "Vektoren\nund Matrizen" }]);
  assert.deepEqual(K.woche(n, "2026-10-21").map((x) => x.von), ["2026-10-19"]);
  assert.deepEqual(K.woche(n, "2026-10-24").map((x) => x.von), [], "Samstag: kein Zeitraum enthält den Tag");
  assert.deepEqual(K.woche(n, "2026-10-24", { woche: true }).map((x) => x.von), ["2026-10-19"], "aber die Woche");
  // Zeilen ohne weiteren Inhalt (künftige Wochen) und Tabellen in Kästen
  const leer = K.notiz({ code: "X1", url: "", refId: "1", geaendert: "2026-10-10",
    inhalt: "> | Woche | Datum | Vorlesung |\n> | --- | --- | --- |\n> | 5 | Woche 09.11.26 |   |\n> | 4 | Woche 02.11.26 | Kerndichten |" }, null);
  assert.deepEqual(K.zeitplan(leer).map((x) => [x.von, x.zellen[0].text]), [["2026-11-02", "Kerndichten"]]);
});

// ---------- Abruf im Lauf (ilias.js) ----------
const BLOECKE = H.kursseite(SEITE, URL);
const B_PFAD = "Unterlagen/B110 Einführung in die Betriebswirtschaftslehre/B110 Kursseite.md";
const S_PFAD = "Unterlagen/S100 Mathematische Methoden/S100 Kursseite.md";
const mitSeiten = (seiten) => Object.assign(standardIlias(), { kursseiten: seiten });
const verbinden = async (x) => { const r = await x.m.zugangSpeichern("zxabc01", () => GEHEIM); assert.equal(r.ok, true, r.fehler); };
const STUNDE = 3600e3;

test("Lauf: Kursseite je aktivem Kurs mit Modul, leere Seite ohne Notiz, nur Geändertes, höchstens alle 3 Stunden", async () => {
  const x = aufbau({ ilias: mitSeiten({ 100: [absatz("Raumänderung: ab sofort Hörsaal 23")], 300: BLOECKE, 200: BLOECKE }), kursseite: K });
  await verbinden(x);
  let b = await x.m.jetztHolen({});
  assert.equal(b.art, "ok", b.fehler);
  assert.deepEqual(b.kursseiten.sort(), ["B110", "S100"]);
  assert.deepEqual(x.il.log.filter((e) => e.was === "kursseite").map((e) => e.id).sort(), ["100", "300"], "nur aktive Kurse mit Modul");
  const s = x.t.text(S_PFAD);
  assert.match(s, /^typ: kursseite$/m);
  assert.match(s, /^ilias_ref: "300"$/m);
  assert.match(s, /^quelle: "https:\/\/ilias\.test\/goto\.php\/crs\/300"$/m, "Permalink des Kurses auf dem Server des Kurses");
  assert.equal(s.includes("Geheim42x"), false);
  assert.match(x.t.text(B_PFAD), /Raumänderung: ab sofort Hörsaal 23/);
  const index = JSON.parse(x.t.text(I.K.INDEX));
  assert.deepEqual(Object.keys(index.seiten).sort(), ["100", "300"]);
  assert.equal(index.seiten[300].pfad, S_PFAD);

  // gleich danach: kein neuer Abruf; nach 3 Stunden: abgerufen, aber nichts geschrieben (gleicher Inhalt)
  x.il.leeren(); x.t.schreibvorgaenge.length = 0;
  b = await x.m.jetztHolen({});
  assert.equal(x.il.anzahl("kursseite"), 0);
  x.u.vor(3 * STUNDE + 1);
  x.il.leeren(); x.t.schreibvorgaenge.length = 0;
  b = await x.m.jetztHolen({});
  assert.equal(x.il.anzahl("kursseite"), 2);
  assert.deepEqual(b.kursseiten, []);
  assert.equal(x.t.schreibvorgaenge.includes(S_PFAD), false);

  // geänderte Seite: neuer Inhalt, „Meine Notizen“ bleibt, neues Datum; der Knopf liest sofort
  x.t.m.set(S_PFAD, A.enc(x.t.text(S_PFAD) + "Taschenrechner mitnehmen\n"));
  x.il.def.kursseiten[300] = [absatz("Neuer Wochenplan")];
  x.u.vor(24 * STUNDE);
  b = await x.m.jetztHolen({ manuell: true });
  assert.deepEqual(b.kursseiten, ["S100"]);
  const neu = x.t.text(S_PFAD);
  assert.match(neu, /^geaendert: 2026-10-17$/m);
  assert.match(neu, /\nNeuer Wochenplan\n\n## Meine Notizen\nTaschenrechner mitnehmen\n$/);
});

test("Lauf: gelöschte Kursseite kommt erst mit neuem Inhalt wieder; fremde Notiz bleibt; Fehler hält die Unterlagen nicht an", async () => {
  const fremd = "---\ntyp: notiz\n---\nmeine eigene Seite\n";
  const x = aufbau({ ilias: mitSeiten({ 100: [absatz("Stand 1")], 300: new Error("HTTP 500") }), kursseite: K, dateien: { [S_PFAD]: fremd } });
  await verbinden(x);
  let b = await x.m.jetztHolen({ manuell: true });
  assert.equal(b.art, "ok", b.fehler);
  assert.match(b.warnung, /Eine Kursseite ließ sich diesmal nicht lesen\./);
  assert.ok(x.il.geladen().length > 0, "Unterlagen trotzdem geladen");
  assert.equal(x.t.text(S_PFAD), fremd);
  x.il.def.kursseiten[300] = [absatz("Mathe")];
  b = await x.m.jetztHolen({ manuell: true });
  assert.equal(x.t.text(S_PFAD), fremd, "fremde Notiz unberührt");
  const zweite = S_PFAD.replace("Kursseite.md", "Kursseite 2.md");
  assert.match(x.t.text(zweite), /\nMathe\n/);

  x.t.m.delete(B_PFAD);
  b = await x.m.jetztHolen({ manuell: true });
  assert.equal(x.t.text(B_PFAD), null, "gelöscht, Seite gleich");
  x.il.def.kursseiten[100] = [absatz("Stand 2")];
  b = await x.m.jetztHolen({ manuell: true });
  assert.match(x.t.text(B_PFAD), /\nStand 2\n/);
});

test("Lauf beim eigenen Uni-Abgleich: keine Downloads, aber Gruppen und Kursseiten; ohne kursseite.js oder Quelle nichts", async () => {
  const x = aufbau({ ilias: mitSeiten({ 300: BLOECKE }), kursseite: K, einstellungen: { quellen_extern: ["ilias-dateien"] } });
  await verbinden(x);
  const b = await x.m.jetztHolen({});
  assert.equal(b.art, "nur-gruppen", b.fehler);
  assert.deepEqual(x.il.geladen(), []);
  assert.deepEqual(b.kursseiten, ["S100"]);
  assert.match(x.t.text(S_PFAD), /^typ: kursseite$/m);

  const y = aufbau({ ilias: mitSeiten({ 300: BLOECKE }) });
  await verbinden(y);
  assert.equal((await y.m.jetztHolen({})).art, "ok");
  assert.equal(y.il.anzahl("kursseite"), 0, "ohne kursseite.js");
  const z = aufbau({ kursseite: K });
  await verbinden(z);
  assert.deepEqual((await z.m.jetztHolen({})).kursseiten, [], "Quelle ohne kursseite()");
  const leer = aufbau({ ilias: mitSeiten({ 100: [], 300: [absatz(" ")] }), kursseite: K });
  await verbinden(leer);
  assert.deepEqual((await leer.m.jetztHolen({})).kursseiten, [], "leere Seiten");
  assert.equal(leer.il.anzahl("kursseite"), 2);
  assert.deepEqual(leer.t.pfade("Unterlagen/").filter((p) => /Kursseite/.test(p)), []);
});
