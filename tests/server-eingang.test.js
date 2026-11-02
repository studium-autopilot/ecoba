// Tests für server/eingang.mjs (Eingang v1). Kernprüfung: Was der Server ins Eingang legt, nimmt das Plugin mit seiner eigenen
// Prüfung (terminePruefen in zentral.js) ohne Verwerfen an. Ohne server/ (noch nicht im Release) übersprungen.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const { laden: skriptLaden } = require("./laden.js");

const DATEI = path.join(__dirname, "..", "server", "eingang.mjs");
const test = (name, fn) => require("node:test")(name, { skip: !fs.existsSync(DATEI) && "server/ fehlt in diesem Baum" }, fn);
const laden = () => import(pathToFileURL(DATEI).href);
const JETZT = new Date("2026-10-18T07:30:00Z");

const termin = (x = {}) => ({ schluessel: "mail:abc@uni#1", titel: "Anmeldung Tutorium B110", datum: "2026-10-27", uhrzeit: "10:00", ort: "ILIAS",
  kategorie: "Frist", status: "offiziell", code: "B110", quelle_text: "Mail des Lehrstuhls, 17.10.2026", info: "", ...x });

test("Termine: gültige werden zu termine.json-Einträgen mit id aus dem Schlüssel; das Plugin nimmt alle an", async () => {
  const { eingangNormal, idAus } = await laden();
  const { eingang, verworfen } = eingangNormal({
    quellen: ["gmail", "erfunden"],
    termine: [termin(), termin({ schluessel: "uni-postfach:u2", titel: "Abgabe Übungsblatt 2", datum: "2026-11-03", bis: "2026-11-03", code: "", uhrzeit: "" }),
      termin({ schluessel: "mail:x#2", titel: "Probeklausur", kategorie: "Prüfung", status: "geschätzt", info: "Datum aus dem Stundenplan abgeleitet." })],
  }, { jetzt: JETZT, lauf: "test" });
  assert.deepEqual(verworfen, []);
  assert.deepEqual(eingang.quellen, ["gmail"]);
  assert.equal(eingang.termine[0].id, idAus("mail:abc@uni#1"));
  assert.match(eingang.termine[0].id, /^c-[0-9a-f]{20}$/);
  assert.equal(eingang.termine[1].bis, "", "eintägig");
  assert.equal(eingang.termine[0].geprueft, "2026-10-18");

  const Z = skriptLaden("zentral").ctx.zentral;
  const geprueft = Z.terminePruefen({ schema: 1, termine: eingang.termine });
  assert.deepEqual(geprueft.verworfen, [], "Plugin verwirft nichts");
  assert.equal(geprueft.termine.length, 3);
});

test("Termine: unsichere oder falsche Angaben werden einzeln verworfen, der Rest bleibt", async () => {
  const { eingangNormal } = await laden();
  const { eingang, verworfen } = eingangNormal({ termine: [
    termin({ titel: "<script>x</script>" }), termin({ schluessel: "a", titel: "[[Link]]" }), termin({ schluessel: "b", datum: "2026-02-30" }),
    termin({ schluessel: "c", kategorie: "Party" }), termin({ schluessel: "d", status: "vielleicht" }), termin({ schluessel: "e", code: "b110" }),
    termin({ schluessel: "f", uhrzeit: "25:00" }), termin({ schluessel: "g", bis: "2026-10-01" }), termin({ schluessel: "h", info: "x".repeat(201) }),
    termin({ schluessel: "" }), termin({ schluessel: "ok" }), termin({ schluessel: "ok" }),
  ] }, { jetzt: JETZT });
  assert.equal(eingang.termine.length, 1);
  assert.deepEqual(verworfen.map((v) => v.grund), ["titel unzulässig", "titel unzulässig", "datum ungültig", "kategorie nicht erlaubt",
    "status ungültig", "code ungültig", "uhrzeit ungültig", "bis ungültig", "info zu lang", "schluessel fehlt", "doppelter schluessel"]);
});

test("Säubern: HTML, Templater, Links und Steuerzeichen fallen weg", async () => {
  const { eingangNormal } = await laden();
  const { eingang } = eingangNormal({ termine: [termin({ ort: "Raum <b>1</b> obsidian://open?x <% tp.x %>\u202eHS", info: "a`b`c\n d" })] }, { jetzt: JETZT });
  assert.equal(eingang.termine[0].ort, "Raum 1 HS");
  assert.equal(eingang.termine[0].info, "a b c d");
});

test("Säubern: fremde Links werden zum Domainnamen, Unicode-Tags und Worttrenner fallen weg; Texte für Studierende ganz ohne Links", async () => {
  const { eingangNormal, saeubern } = await laden();
  const tag = String.fromCodePoint(0xe0041, 0xe0042); // unsichtbarer Text „AB“
  assert.equal(saeubern("Anmeldung: https://alma.uni-tuebingen.de/x?a=1 oder https://evil.example.com/login?u=1 und www.phish.example.org" + tag, 300, false).wert,
    "Anmeldung: https://alma.uni-tuebingen.de/x?a=1 oder evil.example.com und phish.example.org");
  assert.equal(saeubern("https://uni-tuebingen.de.evil.example/x https://alma.uni-tuebingen.de" + "@evil.example.net/", 300, false).wert,
    "uni-tuebingen.de.evil.example evil.example.net");
  assert.equal(saeubern("Notizen/www.example.com Ideen.md", 240, false, null).wert, "Notizen/www.example.com Ideen.md", "Pfade bleiben, wie sie sind");
  // Was ohneLinks nicht erkennt, entschärft der Filter ohne erlaubte Domain: auch ein Uni-Link ohne Schema wird keiner
  const { eingang } = eingangNormal({ termine: [termin({
    info: "Anmeldung alma.uni-tuebingen.de/x und evil.com/login" + tag, ort: "Raum" + String.fromCharCode(0x2060) + " 1" })],
  begleitnotizen: [{ datei: "Unterlagen/E101/E101 Folien 01.pdf", wichtigste: ["Lehrbuch core-econ.org/the-economy und https://doi.org/10.1/x"] }] },
  { jetzt: JETZT });
  assert.equal(eingang.termine[0].info, "Anmeldung alma.uni-tuebingen.de /x und evil.com /login");
  assert.equal(eingang.termine[0].ort, "Raum 1");
  assert.deepEqual(eingang.begleitnotizen[0].wichtigste, [{ text: "Lehrbuch core-econ.org /the-economy und" }]);
});

test("Begleitnotizen und Hinweise: nur Pfade unter Unterlagen/, Listen begrenzt, leere verworfen", async () => {
  const { eingangNormal } = await laden();
  const { eingang, verworfen } = eingangNormal({
    begleitnotizen: [
      { datei: "Unterlagen/B110/Vorlesung/B110 Folien 02.pdf", wichtigste: [{ text: "Begriff: Ziel", seite: 5 }, "Zweiter Punkt",
        { begriff: "**Organisation:**", text: "90 Minuten", seite: 3, bis: 4, frist: "2026-10-30" }, { text: "Bereich verkehrt", seite: 6, bis: 2 }],
        zu_tun: [{ text: "Blatt 2 lösen", frist: "2026-10-30", seite: 9, begriff: "x" }], fragen: ["Was ist X?", { text: "Warum?", seite: 2, frist: "2026-10-30" }] },
      { datei: "../System/Einstellungen.md", wichtigste: ["x"] }, { datei: "Unterlagen/a.pdf" }, { datei: "Notizen/a.pdf", fragen: ["y"] },
    ],
    hinweise: [{ text: "Raumänderung prüfen", quelle: "Mail, 17.10.2026" }, "nur Text", { text: "" },
      { text: "Übung E101 diese Woche online", code: "E101" }, { text: "Code falsch", code: "e101; rm" }],
  }, { jetzt: JETZT });
  assert.equal(eingang.begleitnotizen.length, 1);
  assert.deepEqual(eingang.begleitnotizen[0].wichtigste, [{ text: "Begriff: Ziel", seite: 5 }, { text: "Zweiter Punkt" },
    { text: "90 Minuten", seite: 3, bis: 4, begriff: "Organisation" }, { text: "Bereich verkehrt", seite: 6 }]);
  assert.deepEqual(eingang.begleitnotizen[0].zu_tun, [{ text: "Blatt 2 lösen", seite: 9, frist: "2026-10-30" }]);
  assert.deepEqual(eingang.begleitnotizen[0].fragen, [{ text: "Was ist X?" }, { text: "Warum?", seite: 2 }]);
  assert.deepEqual(eingang.hinweise, [{ text: "Raumänderung prüfen", quelle: "Mail, 17.10.2026" }, { text: "nur Text" },
    { text: "Übung E101 diese Woche online", code: "E101" }, { text: "Code falsch" }], "ein ungültiger Modulcode fällt weg, der Hinweis bleibt");
  assert.deepEqual(verworfen.map((v) => `${v.art}:${v.grund}`).sort(),
    ["begleitnotiz:datei unzulässig", "begleitnotiz:datei unzulässig", "begleitnotiz:leer", "hinweis:fehlt"]);
});

test("Bestand: nur neue oder geänderte Termine gehen raus; gleicher Schlüssel = Änderung desselben Termins", async () => {
  const { eingangNormal, nurNeueOderGeaenderte, istLeer } = await laden();
  const a = eingangNormal({ termine: [termin(), termin({ schluessel: "zwei", titel: "Zwei" })] }, { jetzt: JETZT }).eingang;
  const erst = nurNeueOderGeaenderte(a, {});
  assert.equal(erst.eingang.termine.length, 2);
  const wieder = eingangNormal({ termine: [termin(), termin({ schluessel: "zwei", titel: "Zwei" })] }, { jetzt: new Date("2026-10-19T07:30:00Z") }).eingang;
  const zweit = nurNeueOderGeaenderte(wieder, erst.bestand);
  assert.equal(zweit.eingang.termine.length, 0, "nur geprueft anders: keine Änderung");
  assert.ok(istLeer(zweit.eingang));
  const geaendert = eingangNormal({ termine: [termin({ datum: "2026-10-28" })] }, { jetzt: JETZT }).eingang;
  const dritt = nurNeueOderGeaenderte(geaendert, zweit.bestand);
  assert.equal(dritt.eingang.termine.length, 1);
  assert.equal(dritt.eingang.termine[0].id, erst.eingang.termine[0].id, "gleiche id");
  assert.equal(dritt.bestand[dritt.eingang.termine[0].id].datum, "2026-10-28");
});

test("Bestand: Vergangenes kommt nur als Änderung eines bekannten Termins durch", async () => {
  const { eingangNormal, nurNeueOderGeaenderte } = await laden();
  const bekannt = eingangNormal({ termine: [termin({ schluessel: "alt", datum: "2026-10-16" })] }, { jetzt: new Date("2026-10-15T07:30:00Z") }).eingang;
  const bestand = nurNeueOderGeaenderte(bekannt, {}).bestand;
  const e = eingangNormal({ termine: [
    termin({ schluessel: "alt", datum: "2026-10-16", entfaellt: true }),
    termin({ schluessel: "neu-vorbei", datum: "2026-10-12" }),
    termin({ schluessel: "laeuft", datum: "2026-10-12", bis: "2026-10-20" }),
    termin({ schluessel: "heute", datum: "2026-10-18" }),
  ] }, { jetzt: JETZT }).eingang;
  const r = nurNeueOderGeaenderte(e, bestand);
  assert.deepEqual(r.eingang.termine.map((t) => t.schluessel), ["alt", "laeuft", "heute"]);
  assert.ok(!Object.values(r.bestand).some((t) => t.schluessel === "neu-vorbei"), "nicht in den Bestand");
});

test("Bestand: Vergangenes fällt 60 Tage nach seinem Ende weg; meldet Claude es noch einmal, bleibt es draußen", async () => {
  const { eingangNormal, nurNeueOderGeaenderte } = await laden();
  const bestand = nurNeueOderGeaenderte(eingangNormal({ termine: [
    termin({ schluessel: "lange-vorbei", datum: "2026-08-18" }),
    termin({ schluessel: "grenze", datum: "2026-08-19" }),
    termin({ schluessel: "mehrtaegig", datum: "2026-08-01", bis: "2026-09-30" }),
  ] }, { jetzt: new Date("2026-08-01T07:30:00Z") }).eingang, {}).bestand;
  const e = eingangNormal({ termine: [termin({ schluessel: "neu" })] }, { jetzt: JETZT }).eingang;
  const r = nurNeueOderGeaenderte(e, bestand);
  assert.deepEqual(Object.values(r.bestand).map((t) => t.schluessel).sort(), ["grenze", "mehrtaegig", "neu"]);
  const wieder = eingangNormal({ termine: [termin({ schluessel: "lange-vorbei", datum: "2026-08-18" })] }, { jetzt: JETZT }).eingang;
  const r2 = nurNeueOderGeaenderte(wieder, r.bestand);
  assert.deepEqual([r2.eingang.termine.length, Object.keys(r2.bestand).length], [0, 3]);
});

test("Eine Regel: Server und Plugin nehmen dieselben Termine an und säubern sie gleich", async () => {
  const { terminNormal, idAus } = await laden();
  const Z = skriptLaden("zentral").ctx.zentral;
  const unsichtbar = String.fromCharCode(0x200b);
  const faelle = [
    {}, { titel: "<b>Fett</b>" }, { titel: "Vorlesung [[B110]]" }, { titel: "Termin <% tp.date %>" }, { titel: "Abgabe" + unsichtbar + " Blatt 2" },
    { titel: "x".repeat(121) }, { titel: "" }, { ort: "<b>HS 21</b>" }, { ort: "Hörsaal obsidian://open?vault=x" }, { uhrzeit: "10:00-12:00" },
    { uhrzeit: "9:00" }, { uhrzeit: "25:00" }, { bis: "2026-10-27" }, { bis: "2026-10-20" }, { bis: "2028-01-01" }, { datum: "2041-01-01" },
    { datum: "2026-02-30" }, { code: "B11X" }, { code: "b110" }, { code: "SQ888" }, { kategorie: "Party" }, { status: "vielleicht" },
    { info: "x".repeat(201) }, { info: "Siehe javascript:alert(1) unten" }, { quelle_text: "Mail <i>des</i> Lehrstuhls" },
    { quelle_text: "y".repeat(201) },
    // Unicode-Tags und Worttrenner fallen weg (Links: tests/link-filter.test.js; Texte vom Server sind ganz ohne Links)
    { info: "Tag" + String.fromCodePoint(0xe0041, 0xe0042) + "text" }, { ort: "Raum" + String.fromCharCode(0x2060) + "1" },
  ];
  const FELDER = ["titel", "datum", "bis", "uhrzeit", "ort", "kategorie", "status", "code", "quelle_text", "info"];
  for (const f of faelle) {
    const roh = termin(f);
    const server = terminNormal(roh, "2026-10-18");
    const plugin = Z.terminePruefen({ schema: 1, termine: [Object.assign({ id: idAus(roh.schluessel) }, roh)] });
    const wo = JSON.stringify(f);
    assert.equal(!server.fehler, plugin.termine.length === 1, "gleich angenommen bzw. verworfen: " + wo);
    if (!server.fehler) for (const k of FELDER) assert.equal(server.wert[k], plugin.termine[0][k], `${k} gleich gesäubert: ${wo}`);
  }
});

test("Kategorien und Modulcode-Regel gleich wie im Plugin (zentral.js)", async () => {
  const { KATEGORIEN } = await laden();
  const quelle = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "zentral.js"), "utf8");
  const m = /const KATEGORIEN = (\[[^\]]*\]);/.exec(quelle);
  assert.deepEqual(KATEGORIEN, JSON.parse(m[1]));
  assert.ok(quelle.includes("const MODULCODE = /^[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?$/;"));
});

test("Doppelte To-dos: nur Paare aus Kennungen, keine Ketten, jedes To-do höchstens einmal weg; zählt als Ergebnis", async () => {
  const { eingangNormal, istLeer } = await laden("eingang.mjs");
  const { eingang, verworfen } = eingangNormal({ termine: [], todo_doppel: [
    { behalten: "t-aaa", weg: "t-bbb" },
    { behalten: "t-ccc", weg: "t-bbb" },            // dasselbe noch einmal weg
    { behalten: "t-bbb", weg: "t-ddd" },            // Kette: was weg ist, bleibt nicht
    { behalten: "t-eee", weg: "t-aaa" },            // Kette: was bleibt, geht nicht weg
    { behalten: "t-fff", weg: "t-fff" }, { behalten: "c-123", weg: "t-ggg" }, "t-hhh",
    { behalten: "t-iii", weg: "t-jjj" },
  ] }, { jetzt: new Date("2026-10-19T05:00:00Z") });
  assert.deepEqual(eingang.todo_doppel, [{ behalten: "t-aaa", weg: "t-bbb" }, { behalten: "t-iii", weg: "t-jjj" }]);
  assert.equal(verworfen.filter((v) => v.art === "todo_doppel").length, 6);
  assert.equal(istLeer(eingang), false, "ein Paar ist ein Ergebnis");
  assert.deepEqual(eingangNormal({ termine: [] }).eingang.todo_doppel, []);
  assert.equal(istLeer(eingangNormal({ termine: [] }).eingang), true);
});

// ---------- Kapitellisten (Lernplan) ----------
const liste = (x = {}) => ({ code: "B110", semester: "WS 2026/27", quelle: "Folien 00 Einführung, S. 9", stand: "2026-10-16",
  kapitel: [{ nr: "1", titel: "Grundlagen", seiten: 42, folien: 1, vorlesung: "2026-10-14", teile: [{ nr: "1.1", titel: "Grundbegriffe" }] },
    { nr: "2", titel: "Kosten und Erlöse", folien: 2, zwischentest: "2026-12-02" },
    { nr: "E", titel: "Lehrbuch", url: "https://books.core-econ.org/the-economy-v1/book/de/text/03.html" }], ...x });

test("Kapitellisten: Form von kapitel.json (leere Felder weg), ungültiges Kapitel verwirft sein Modul; das Plugin nimmt sie an", async () => {
  const { eingangNormal, istLeer } = await laden();
  const { eingang, verworfen } = eingangNormal({ termine: [], kapitel: [
    liste(),
    liste({ code: "E101", stand: "", vorlaeufig: true, kapitel: [{ nr: "1", titel: "Märkte", vorlesung: "2026-10-30" }, { nr: "2", titel: "Preise", seiten: null }] }),
    liste({ code: "S100", kapitel: [{ nr: "1", titel: "Ok" }, { nr: "2", titel: "Mit [[Link]]" }] }),
    liste({ code: "S110", kapitel: [{ nr: "1", titel: "A" }, { nr: "1", titel: "B" }] }),
    liste({ code: "B180", kapitel: [{ nr: "1", titel: "A", url: "https://example.com/buch" }] }),
    liste(), liste({ code: "B111", semester: "WiSe 26" }),
  ] }, { jetzt: JETZT });
  assert.deepEqual(eingang.kapitel.map((e) => e.code), ["B110", "E101"]);
  assert.deepEqual(eingang.kapitel[0], { code: "B110", semester: "WS 2026/27", quelle: "Folien 00 Einführung, S. 9", stand: "2026-10-16", vorlaeufig: false,
    kapitel: [{ nr: "1", titel: "Grundlagen", seiten: 42, folien: 1, teile: [{ nr: "1.1", titel: "Grundbegriffe" }], vorlesung: "2026-10-14" },
      { nr: "2", titel: "Kosten und Erlöse", folien: 2, zwischentest: "2026-12-02" },
      { nr: "E", titel: "Lehrbuch", url: "https://books.core-econ.org/the-economy-v1/book/de/text/03.html" }] });
  assert.deepEqual(eingang.kapitel[1].kapitel, [{ nr: "1", titel: "Märkte" }, { nr: "2", titel: "Preise" }], "Vorlesung nach dem Lauf fällt weg, nicht das Kapitel");
  assert.deepEqual([eingang.kapitel[1].stand, eingang.kapitel[1].vorlaeufig], ["2026-10-18", true], "ohne stand: Tag des Laufs");
  assert.deepEqual(verworfen.map((v) => `${v.id}: ${v.grund}`), ["S100 WS 2026/27: kapitel 2: titel unzulässig", "S110 WS 2026/27: doppelte Kapitelnummer",
    "B180 WS 2026/27: kapitel 1: url: Domain nicht erlaubt", "B110 WS 2026/27: doppelt", "B111 WiSe 26: semester ungültig"]);
  assert.ok(verworfen.every((v) => v.art === "kapitel"));
  assert.equal(istLeer(eingang), false, "eine Liste ist ein Ergebnis");

  const Z = skriptLaden("zentral").ctx.zentral;
  const p = Z.kapitelPruefen({ schema: 1, module: eingang.kapitel });
  assert.deepEqual(p.verworfen, [], "Plugin verwirft nichts");
  assert.deepEqual(p.module.map((e) => e.kapitel.map((k) => [k.nr, k.titel, k.seiten, k.folien, k.url, k.vorlesung, k.zwischentest])),
    eingang.kapitel.map((e) => e.kapitel.map((k) => [k.nr, k.titel, k.seiten == null ? null : k.seiten, k.folien == null ? null : k.folien, k.url || "",
      k.vorlesung || "", k.zwischentest || ""])));
});

test("Eine Regel für Kapitellisten: Server und Plugin nehmen dieselben Module an und säubern Titel und Quelle gleich", async () => {
  const { kapitelModulNormal } = await laden();
  const Z = skriptLaden("zentral").ctx.zentral;
  const k = (x) => liste({ kapitel: [Object.assign({ nr: "1", titel: "Grundlagen" }, x)] });
  const faelle = [
    liste(), liste({ quelle: "" }), liste({ quelle: "q".repeat(121) }), liste({ quelle: "Folie <b>3</b>" }), liste({ code: "b110" }), liste({ semester: "SS 2027" }),
    liste({ semester: "WS 2026" }), liste({ kapitel: [] }), liste({ kapitel: Array.from({ length: 41 }, (_, i) => ({ nr: String(i + 1), titel: "K" + i })) }),
    k({ nr: "IV" }), k({ nr: "2.3b" }), k({ nr: "a1" }), k({ nr: "123456789" }), k({ nr: 1 }), k({ titel: "" }), k({ titel: "t".repeat(141) }),
    k({ titel: "A  \t B" }), k({ titel: "A | B" }), k({ titel: "A {B}" }), k({ titel: "A \\ B" }), k({ seiten: 0 }), k({ seiten: 2001 }), k({ seiten: 1.5 }),
    k({ folien: 0 }), k({ folien: 100 }), k({ vorlesung: "2026-02-30" }), k({ zwischentest: "morgen" }), k({ url: "http://uni-tuebingen.de/x" }),
    k({ url: "https://uni-tuebingen.de:8443/x" }), k({ url: "https://www.wiwi.uni-tuebingen.de/x(1)" }), k({ url: "https://uni-tuebingen.de.example.com/" }),
    k({ teile: [{ nr: "1.1", titel: "Teil" }] }), k({ teile: [{ nr: "1.1", titel: "<i>x</i>" }] }), k({ teile: "1.1" }),
    k({ teile: Array.from({ length: 41 }, (_, i) => ({ nr: "1." + i, titel: "T" })) }),
  ];
  for (const f of faelle) {
    const server = kapitelModulNormal(f, "2026-10-18");
    const plugin = Z.kapitelPruefen({ schema: 1, module: [f] });
    const wo = JSON.stringify(f).slice(0, 160);
    assert.equal(!server.fehler, plugin.module.length === 1, "gleich angenommen bzw. verworfen: " + wo);
    if (server.fehler) continue;
    assert.equal(server.wert.quelle, plugin.module[0].quelle, "quelle gleich: " + wo);
    assert.deepEqual(server.wert.kapitel.map((x) => [x.titel, x.url || "", (x.teile || []).map((t) => t.titel)]),
      plugin.module[0].kapitel.map((x) => [x.titel, x.url, x.teile.map((t) => t.titel)]), "Titel und Link gleich: " + wo);
  }
});

test("Kapitellisten: nur gefragte Module, nur neue oder geänderte (stand zählt nicht), im Bestand nur das laufende Semester", async () => {
  const { eingangNormal, nurNeueKapitel } = await laden();
  const lernplan = { semester: "WS 2026/27", module: ["B110", "E101"] };
  const a = eingangNormal({ kapitel: [liste(), liste({ code: "E101" }), liste({ code: "S100" }), liste({ code: "B180", semester: "SS 2027" })] }, { jetzt: JETZT }).eingang;
  const alt = { "B110 SS 2026": liste({ semester: "SS 2026" }) };
  const erst = nurNeueKapitel(a.kapitel, alt, lernplan);
  assert.deepEqual(erst.kapitel.map((e) => e.code), ["B110", "E101"]);
  assert.deepEqual(erst.verworfen.map((v) => `${v.id}: ${v.grund}`), ["S100 WS 2026/27: nicht gefragt", "B180 SS 2027: nicht gefragt"]);
  assert.deepEqual(Object.keys(erst.bestand).sort(), ["B110 WS 2026/27", "E101 WS 2026/27"], "anderes Semester fällt weg");
  const gleich = eingangNormal({ kapitel: [liste({ stand: "2026-10-17" })] }, { jetzt: JETZT }).eingang;
  const zweit = nurNeueKapitel(gleich.kapitel, erst.bestand, lernplan);
  assert.deepEqual([zweit.kapitel, zweit.bestand["B110 WS 2026/27"].stand], [[], "2026-10-16"], "nur stand anders: keine Änderung, alter Stand bleibt");
  const umbenannt = liste();
  umbenannt.kapitel[1] = Object.assign({}, umbenannt.kapitel[1], { titel: "Kosten, Erlöse und Gewinn" });
  const dritt = nurNeueKapitel(eingangNormal({ kapitel: [umbenannt] }, { jetzt: JETZT }).eingang.kapitel, zweit.bestand, lernplan);
  assert.equal(dritt.kapitel.length, 1);
  assert.equal(dritt.bestand["B110 WS 2026/27"].kapitel[1].titel, "Kosten, Erlöse und Gewinn");
  assert.deepEqual(nurNeueKapitel(a.kapitel, {}, null).kapitel, [], "ohne lernplan im Stand (älteres Plugin) nichts");
});

test("Gmail-Überblick: nur ganze Zahlen von 0 bis 10 000, gelesen höchstens gelistet, begrenzt nur bei true, sonst null", async () => {
  const { gmailUeberblick } = await laden();
  assert.deepEqual(gmailUeberblick({ gmail_ueberblick: { gelistet: 0, gelesen: 0 } }), { gelistet: 0, gelesen: 0, begrenzt: false });
  assert.deepEqual(gmailUeberblick({ gmail_ueberblick: { gelistet: 200, gelesen: 30, begrenzt: true, betreff: "privat" } }),
    { gelistet: 200, gelesen: 30, begrenzt: true }, "andere Felder fallen weg");
  for (const u of [undefined, null, "23", [], { gelistet: 1 }, { gelistet: -1, gelesen: 0 }, { gelistet: 1.5, gelesen: 0 },
    { gelistet: "3", gelesen: 1 }, { gelistet: 10001, gelesen: 0 }, { gelistet: 3, gelesen: 4 }]) {
    assert.equal(gmailUeberblick({ gmail_ueberblick: u }), null, JSON.stringify(u));
  }
  assert.equal(gmailUeberblick(null), null);
});

test("Links fallen aus Texten weg, die Studierende lesen (https, www., mailto); Schlüssel bleiben, wie das Plugin sie säubert", async () => {
  const { eingangNormal, saeubern, ohneLinks, idAus } = await laden();
  const lesen = (t, pflicht = false) => saeubern(ohneLinks(t), 200, pflicht);
  assert.deepEqual(lesen("Anmeldung über https://phish.example/login?x=1 bis Freitag"), { wert: "Anmeldung über bis Freitag" });
  assert.deepEqual(lesen("Infos auf www.example.org und bei mailto:x" + "@example.org"), { wert: "Infos auf und bei" }); // getrennt für pruefen.py
  assert.deepEqual(lesen("HTTPS://EXAMPLE.ORG", true), { fehler: "leer" });
  assert.deepEqual(lesen("Raum im www-Pool, z. B. www"), { wert: "Raum im www-Pool, z. B. www" }, "kein Link");
  assert.equal(ohneLinks(42), 42);
  const { eingang } = eingangNormal({
    termine: [termin({ ort: "https://uni-tuebingen.zoom.us/j/1", info: "Link: https://example.org/a", quelle_text: "Mail von www.example.org" }),
      termin({ schluessel: "unterlage:Skript www.x.de#2", titel: "Abgabe siehe https://x.de", datum: "2026-10-28" })],
    hinweise: [{ text: "Neue Folien, siehe www.example.org", quelle: "Kursmail, https://example.org" }],
    begleitnotizen: [{ datei: "Unterlagen/B110/Skript.pdf", wichtigste: [{ begriff: "www.x.de", text: "Mehr unter https://x.de" }], zu_tun: [], fragen: [] }],
  }, { jetzt: JETZT });
  const [a, b] = eingang.termine;
  assert.deepEqual([a.ort, a.info, a.quelle_text, b.titel], ["", "Link:", "Mail von", "Abgabe siehe"]);
  assert.deepEqual(eingang.hinweise[0], { text: "Neue Folien, siehe", quelle: "Kursmail," });
  assert.deepEqual(eingang.begleitnotizen[0].wichtigste[0], { text: "Mehr unter" });
  assert.equal(b.id, idAus("unterlage:Skript www.x.de#2"), "die id hängt am unveränderten Schlüssel");
});
