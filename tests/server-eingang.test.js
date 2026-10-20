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

test("Begleitnotizen und Hinweise: nur Pfade unter Unterlagen/, Listen begrenzt, leere verworfen", async () => {
  const { eingangNormal } = await laden();
  const { eingang, verworfen } = eingangNormal({
    begleitnotizen: [
      { datei: "Unterlagen/B110/Vorlesung/B110 Folien 02.pdf", wichtigste: [{ text: "Begriff: Ziel", seite: 5 }, "Zweiter Punkt",
        { begriff: "**Organisation:**", text: "90 Minuten", seite: 3, bis: 4, frist: "2026-10-30" }, { text: "Bereich verkehrt", seite: 6, bis: 2 }],
        zu_tun: [{ text: "Blatt 2 lösen", frist: "2026-10-30", seite: 9, begriff: "x" }], fragen: ["Was ist X?", { text: "Warum?", seite: 2, frist: "2026-10-30" }] },
      { datei: "../System/Einstellungen.md", wichtigste: ["x"] }, { datei: "Unterlagen/a.pdf" }, { datei: "Notizen/a.pdf", fragen: ["y"] },
    ],
    hinweise: [{ text: "Raumänderung prüfen", quelle: "Mail, 17.10.2026" }, "nur Text", { text: "" }],
  }, { jetzt: JETZT });
  assert.equal(eingang.begleitnotizen.length, 1);
  assert.deepEqual(eingang.begleitnotizen[0].wichtigste, [{ text: "Begriff: Ziel", seite: 5 }, { text: "Zweiter Punkt" },
    { text: "90 Minuten", seite: 3, bis: 4, begriff: "Organisation" }, { text: "Bereich verkehrt", seite: 6 }]);
  assert.deepEqual(eingang.begleitnotizen[0].zu_tun, [{ text: "Blatt 2 lösen", seite: 9, frist: "2026-10-30" }]);
  assert.deepEqual(eingang.begleitnotizen[0].fragen, [{ text: "Was ist X?" }, { text: "Warum?", seite: 2 }]);
  assert.deepEqual(eingang.hinweise, [{ text: "Raumänderung prüfen", quelle: "Mail, 17.10.2026" }, { text: "nur Text" }]);
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
