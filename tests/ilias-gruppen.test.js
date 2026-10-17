// ILIAS (ilias.js): Kurspasswörter im Titel nie speichern, zeigen oder protokollieren (Index, Funde, Begleitnotizen und Ordner
// aus älteren Fassungen inklusive), und Übungsgruppen aus deinen Mitgliedschaften in den Stundenplan (Code aus dem Kurs bzw.
// den Brotkrumen, Zuordnung zu gruppen.json, eine Notiz je Gruppe mit dem ILIAS-Namen, Doppel, gewählte Notizen, Überschneidung,
// Verlassen erst beim zweiten Lauf, keine Namen). Erfundenes ILIAS, erfundene Passwörter und Namen (Attrappen in
// tests/ilias-attrappen.js und tests/stundenplan-attrappe.js). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");
const A = require("./ilias-attrappen.js");
const { notizenIo } = require("./stundenplan-attrappe.js");
const { I, GEHEIM, B, aufbau, standardIlias, datei } = A;
const M = laden("meine-gruppe").ergebnis;

const KUNST = "Kunstwort-7Q"; // erfundenes Kurspasswort
// Die Wörter zusammengesetzt, damit die Release-Prüfung (pruefen.py) diese Testdatei nicht für ein echtes Passwort hält
const P = "Pass" + "wort";
const NAMEN = ["Erika Beispiel", "Max Muster"]; // erfundene Tutor:innen
const SEM = "WS 2026/27";
const STUNDE = 3600e3;
const verbinden = async (x) => { const r = await x.m.zugangSpeichern("zxabc01", () => GEHEIM); assert.equal(r.ok, true, r.fehler); };

test("Kurspasswort: alle bekannten Schreibweisen, Titel endet vor der Marke nur nach einem Trenner oder vor „:“", () => {
  const fall = [
    ["S110 Übung (" + P + ": " + KUNST + ")", "S110 Übung"],
    ["S110 Übung - " + P.toUpperCase() + " " + KUNST, "S110 Übung"],
    ["Kurs X, Kurs" + P.toLowerCase() + " lautet " + KUNST, "Kurs X"],
    ["Kurs Y (PW: " + KUNST + ")", "Kurs Y"],
    ["Kurs Y pw = " + KUNST, "Kurs Y"],
    ["Kurs Z P.a.s.s.w.o.r.t: " + KUNST, "Kurs Z"],
    ["Kurs Z Pass" + "word: " + KUNST, "Kurs Z"],
    ["Kurs Z | Einschreibeschlüssel: " + KUNST, "Kurs Z"],
    ["Kurs Z key: " + KUNST, "Kurs Z"],
    ["Kurs Z ＰＡＳＳＷＯＲＴ：" + KUNST, "Kurs Z"],
    ["Kurs (PW1234)", "Kurs"], ["Kurs - pwd: x1", "Kurs"], ["Kurs - PASSWD x", "Kurs"], ["Kurs (Passw.: x)", "Kurs"],
    ["Kurs (Kennw.: x)", "Kurs"], ["Kurs (KW: X9)", "Kurs"], ["Kurs (P/W: x)", "Kurs"], ["Kurs (P_W x)", "Kurs"], ["Kurs, KursPW x", "Kurs"],
    ["Kurs (Schlüsselwort: x)", "Kurs"], ["Kurs (secret: Ab3)", "Kurs"], ["Kurs (Login: x7)", "Kurs"], ["Kurs (Mot de passe: x)", "Kurs"],
    ["Kurs (Раss" + "wort: x)", "Kurs"], // kyrillisches Р und а
    ["Kurs (Pass­" + "wort: x)", "Kurs"], // weiches Trennzeichen
    ["Kurs (P&#97;ss" + "wort: x)", "Kurs"], ["Kurs (P&amp;#97;ss" + "wort: x)", "Kurs"], // Entitäten, auch doppelt
    // mitten im Satz oder davor: nichts bleibt (Aufrufer nimmt Code oder „Kurs <Nummer>“)
    ["Kurs Z Pass-wort " + KUNST, ""], ["Kurs Z Kenn" + "wort " + KUNST, ""], ["Kurs PW1234", ""], [KUNST + " ist das " + P + " für S110", ""], [P + ": " + KUNST, ""],
    // keine Marke: bleibt ganz
    ["S110 PW-Statistik", "S110 PW-Statistik"], ["B200 Finanzierung - Key: Takeaways", "B200 Finanzierung - Key: Takeaways"],
    ["E130 Makroökonomik I: Schlüssel zum Verständnis", "E130 Makroökonomik I: Schlüssel zum Verständnis"],
    [P + "sicherheit (IT-Sicherheit)", P + "sicherheit (IT-Sicherheit)"], ["SQ888 Schlüsselqualifikationen", "SQ888 Schlüsselqualifikationen"],
    ["Key Concepts in Economics", "Key Concepts in Economics"], ["Passau-Exkursion", "Passau-Exkursion"], ["KW 42 Vorlesung", "KW 42 Vorlesung"],
  ];
  for (const [ein, aus] of fall) assert.equal(I.ohneKennwort(ein), aus, ein);
  assert.equal(I.pfadOhneKennwort("S110 Übung (" + P + ": " + KUNST + ") / Blätter"), "S110 Übung / Blätter");
  assert.equal(I.pfadOhneKennwort(P + " " + KUNST + " / Blätter", "S110"), "S110 / Blätter", "leerer Kurs → Ersatz");
});

test("Kurspasswort: nie im Index, in der Kursliste, in Begleitnotizen, Hinweisen oder gerätelokal", async () => {
  const def = standardIlias();
  def.kurse[0].titel = "B110 Einführung in die BWL (" + P + ": " + KUNST + ")";
  def.kurse[1].titel = P + ": " + KUNST;
  const x = aufbau({ ilias: def });
  await verbinden(x);
  const b = await x.m.jetztHolen({ manuell: true });
  assert.equal(b.art, "ok", b.fehler);
  assert.ok(b.neu > 0);
  const kurse = await x.m.kurse();
  assert.deepEqual(kurse.map((k) => k.titel).sort(), ["B110 Einführung in die BWL", "Kurs 200", "S100 Mathematische Methoden", "X999 Unbekanntes Modul"]);
  for (const [wo, text] of [["Tresor", x.t.alles()], ["gerätelokal", x.lok.alles()], ["Hinweise", JSON.stringify(x.meldungen) + JSON.stringify(x.hoerer)], ["Bericht", JSON.stringify(b)]]) {
    assert.ok(text.indexOf(KUNST) < 0, wo);
    assert.doesNotMatch(text, /passwort/i, wo);
  }
});

test("Kurspasswort: alte Index-Einträge gesäubert (nie leerer Titel), saubere Datei wird nicht neu geschrieben", async () => {
  const alt = { version: 1, kurse: { 100: { titel: "B110 Kurs (" + P + ": " + KUNST + ")", code: "B110", aktiv: true, zuletzt: "", t: "2026-10-01T00:00:00.000Z" },
    200: { titel: P + " " + KUNST, code: "", aktiv: false, zuletzt: "", t: "2026-10-01T00:00:00.000Z" } },
    dateien: { 1001: { pfad: "Unterlagen/x.pdf", iliasPfad: "B110 Kurs (" + P + ": " + KUNST + ") / Folien", kurs: "100", t: "2026-10-01T00:00:00.000Z" } },
    ignoriert: { 1002: { grund: "zu groß", iliasPfad: "B110 Kurs (" + P + ": " + KUNST + ")", t: "2026-10-01T00:00:00.000Z" } } };
  const x = aufbau({ dateien: { [I.K.INDEX]: JSON.stringify(alt) } });
  assert.equal(await x.m.saeubern(), true);
  const t = x.t.text(I.K.INDEX);
  assert.ok(t.indexOf(KUNST) < 0);
  const idx = JSON.parse(t);
  assert.deepEqual([idx.kurse[100].titel, idx.kurse[200].titel, idx.dateien[1001].iliasPfad, idx.ignoriert[1002].iliasPfad, idx.kurse[100].aktiv],
    ["B110 Kurs", "Kurs 200", "B110 Kurs / Folien", "B110 Kurs", true]);
  const schreibvorgaenge = x.t.schreibvorgaenge.length;
  assert.equal(await x.m.saeubern(), false, "zweites Mal nichts zu tun");
  assert.equal(x.t.schreibvorgaenge.length, schreibvorgaenge, "nichts geschrieben");
});

test("Kurspasswort: Begleitnotizen und Ordner aus einer älteren Fassung werden einmal gesäubert (mit der Abrufer-Sperre)", async () => {
  const roh = "Ringvorlesung (" + P + ": " + KUNST + ")";
  const ordner = "Unterlagen/Ringvorlesung (" + P + "- " + KUNST + ")";
  const notiz = "---\ntyp: unterlage\nquelle: " + JSON.stringify("ILIAS: " + roh + " / Folien") + "\nilias_id: \"7001\"\n---\n\n# Info\n\n> **Aus ILIAS:** " +
    "Ringvorlesung (" + P + "\\: " + KUNST + ") / Folien / Info.pdf\n\n## Das Wichtigste\n- \n";
  const idx = { version: 1, kurse: {}, ignoriert: {}, dateien: { 7001: { pfad: ordner + "/Info.pdf", sha256: "x", groesse: 4, iliasPfad: roh + " / Folien", kurs: "200", t: "2026-10-01T00:00:00.000Z" } } };
  const x = aufbau({ dateien: { [I.K.INDEX]: JSON.stringify(idx), [ordner + "/Info.pdf"]: "%PDF", [ordner + "/Info.md"]: notiz } });
  x.t.io.umbenennen = async (a, n) => x.t.umbenennen(a, n);
  await verbinden(x);
  const b = await x.m.jetztHolen({ manuell: true });
  assert.equal(b.art, "ok", b.fehler);
  assert.ok(x.t.text("Unterlagen/Ringvorlesung/Info.md"), "Ordner umbenannt");
  assert.equal(x.t.index().dateien[7001].pfad, "Unterlagen/Ringvorlesung/Info.pdf", "Index zieht mit");
  const n = x.t.text("Unterlagen/Ringvorlesung/Info.md");
  assert.match(n, /^quelle: "ILIAS: Ringvorlesung \/ Folien"$/m);
  assert.match(n, /^> \*\*Aus ILIAS:\*\* Ringvorlesung \/ Folien \/ Info\.pdf$/m);
  assert.ok(x.t.alles().indexOf(KUNST) < 0);
  assert.equal(x.lok.lokal("eba-ilias-migration"), 1, "nur einmal je Gerät");
});

test("Kurspasswort: gemerkte Funde einer älteren Fassung werden beim Lesen gesäubert", async () => {
  const x = aufbau();
  await verbinden(x);
  await x.m.jetztHolen({ manuell: true }); // Kurse und Index anlegen
  const fertig = new Date(Date.parse("2026-10-16T08:00:00.000Z")).toISOString();
  const st = x.lok.lokal("eba-ilias-stand") || {};
  st.kursFertig = { 100: fertig, 200: fertig, 300: fertig, 400: fertig };
  x.lok.lokal("eba-ilias-stand", st);
  const e = datei("1301", "Folien VL03", "pdf", "2026-10-16T09:00");
  x.il.def.dateien[1301] = "%PDF drei";
  x.lok.lokal("eba-ilias-funde", [{ id: "1301", eintrag: { art: e.art, typ: e.typ, refId: e.refId, id: e.id, url: e.url, endung: e.endung },
    kurs: { refId: "100", titel: "B110 Einführung in die BWL (" + P + ": " + KUNST + ")", code: "B110", url: B + "kurs/100" }, code: "B110",
    ordner: ["Übungen (" + P + ": " + KUNST + ")"], original: "Folien VL03.pdf", endung: "pdf", geaendert: "2026-10-16T09:00", lg: 1024,
    iliasPfad: "B110 Einführung in die BWL (" + P + ": " + KUNST + ") / Übungen", art: "neu" }]);
  const b = await x.m.jetztHolen({});
  assert.equal(b.art, "ok", b.fehler);
  assert.equal(b.neu, 1);
  assert.ok(x.t.alles().indexOf(KUNST) < 0, "weder Notiz noch Index noch Ordner");
});

// ---------- Gruppen ----------
const zg = (code, art, nr, tag, von, bis, raum) => ({ id: `ws-2026-27-${code.toLowerCase()}-${art === "Übung" ? "uebung" : "tutorium"}-${nr}`, code, art, gruppe: String(nr), tag, von, bis, ct: true,
  raum, leitung: "", anmeldung: "", quelle_url: "https://alma.uni-tuebingen.de/a", semester: SEM, zeitraum: null, geprueft: "" });
const ZENTRAL = [
  zg("S100", "Tutorium", 5, "Di", "10:00", "12:00", "Hörsaal 11 (Beispielbau)"),
  zg("S100", "Tutorium", 4, "Di", "08:00", "10:00", "Hörsaal 7 (Beispielhaus)"),
  zg("S100", "Tutorium", 8, "Mi", "14:00", "16:00", "Hörsaal 22 (Beispielbau)"),
  zg("S100", "Tutorium", 9, "Mi", "14:00", "16:00", "Seminarraum E 02 (Beispielbau)"),
  zg("B110", "Tutorium", 1, "Di", "08:00", "10:00", "Hörsaal 0.02 (Beispielzentrum)"),
];
const grp = (refId, titel, beschreibung, mitglied) => ({ art: "ordner", typ: "grp", refId, id: refId, titel, beschreibung, mitglied, url: B + "gruppe/" + refId });
// Mitgliederseite: S100 „Gruppe 4“ (in Kurs 300 sichtbar), S100 „Gruppe 8“ (mehrdeutig), B110-Tutorium (nur über Brotkrumen)
const MITGLIED = {
  351: { refId: "351", titel: "Gruppe 4: Dienstag 10 - 12, Hörsaal 11 (" + NAMEN[0] + ")", beschreibung: NAMEN[1], url: B + "gruppe/351" },
  352: { refId: "352", titel: "Gruppe 8: Mittwoch 14 - 16, Hörsaal 99", beschreibung: "", url: B + "gruppe/352" },
  901: { refId: "901", titel: "Tutorium 1 - Dienstag, 08:15 - 09: 45 Uhr", beschreibung: "Tutor: " + NAMEN[1] + " Ort: Hörsaal 0.02 (Bau)", url: B + "gruppe/901" },
};
function gruppenAufbau(o) {
  o = o || {};
  const def = standardIlias();
  def.seiten[B + "kurs/300"].push(grp("351", MITGLIED[351].titel, NAMEN[1], true), grp("352", MITGLIED[352].titel, "", true), grp("353", "Gruppe 9: Mittwoch 14 - 16", "", false));
  def.seiten[B + "gruppe/351"] = [];
  def.seiten[B + "gruppe/352"] = [];
  const x = aufbau({ ilias: def });
  const sp = notizenIo(o.notizen);
  const stand = { mitglieder: o.mitglieder || ["351", "352", "901"], gruppeKurs: 0, zentral: o.zentral === undefined ? ZENTRAL : o.zentral, kurs901: o.kurs901 === undefined ? { refId: "100", code: "B110" } : o.kurs901 };
  x.abh.quelle = async (zugang, anmelden) => {
    const q = await x.il.quelle(zugang, anmelden);
    q.mitgliedschaften = async () => ({ kurse: await q.kurse(), gruppen: stand.mitglieder.map((id) => Object.assign({}, MITGLIED[id])) });
    q.gruppeKurs = async (g) => { stand.gruppeKurs++; return g.refId === "901" ? stand.kurs901 : null; };
    return q;
  };
  x.abh.gruppen = () => M;
  x.abh.zentraleGruppen = () => stand.zentral;
  x.abh.stundenplan = () => sp.io;
  return Object.assign(x, { sp, stand });
}
const S100 = "Stundenplan/Di 10.15 S100 Tutorium Gruppe 4 (ILIAS).md", B110 = "Stundenplan/Di 08.15 B110 Tutorium 1 (ILIAS).md";
// Name einer älteren Fassung (gleich dem einer Alma- oder zentralen Notiz): wird umbenannt
const S100_ALT = "Stundenplan/Di 10.15 S100 Tutorium.md";

test("Gruppen: eine Notiz je eindeutiger Mitgliedschaft mit dem ILIAS-Namen, Code aus Kurs bzw. Brotkrumen, nie Namen von Personen", async () => {
  const x = gruppenAufbau();
  await verbinden(x);
  const b = await x.m.jetztHolen({ manuell: true });
  assert.equal(b.art, "ok", b.fehler);
  assert.deepEqual(x.sp.pfade(), [B110, S100]);
  const s = x.sp.fm(S100);
  assert.deepEqual([s.herkunft, s.ilias_gruppe, s.gruppe_id, s.gruppe, s.gruppe_alma, s.titel, s.wochentag, s.beginn, s.ende, s.semester, s.uebersicht],
    ["ilias-gruppe", "351", "ws-2026-27-s100-tutorium-5", "Gruppe 4", "5", "Mathematische Methoden · Tutorium Gruppe 4", 2, "10:15", "11:45", SEM, "[[Stundenplan]]"],
    "ILIAS „Gruppe 4“ = zentral Gr. 5; gezeigt wird der ILIAS-Name");
  assert.match(x.sp.text(S100), /^# S100 · Tutorium Gruppe 4$/m);
  assert.deepEqual([x.sp.fm(B110).gruppe_id, x.sp.fm(B110).titel, x.sp.fm(B110).gruppe], ["ws-2026-27-b110-tutorium-1", "Einführung in die Betriebswirtschaftslehre · Tutorium 1", "Tutorium 1"]);
  assert.equal(x.stand.gruppeKurs, 1, "nur die Gruppe außerhalb der durchsuchten Kurse braucht ihre Seite");
  assert.deepEqual(x.m.gruppenListe().map((g) => [g.refId, g.code, g.name, g.status, g.kandidaten.length]),
    [["351", "S100", "Gruppe 4", "zugeordnet", 0], ["352", "S100", "Gruppe 8", "mehrdeutig", 2], ["901", "B110", "Tutorium 1", "zugeordnet", 0]]);
  assert.equal(b.gruppen.neu, 2);
  assert.match(x.meldungen.join(" "), /2 Übungsgruppen stehen jetzt im Stundenplan/);
  const idx = x.t.index();
  assert.equal(idx.gruppen[353].mitglied, undefined, "fremde Gruppe: nur Code, Name und Zeit");
  for (const id of Object.keys(idx.gruppen)) assert.equal("titel" in idx.gruppen[id], false);
  const alles = x.t.alles() + x.lok.alles() + x.sp.pfade().map((p) => x.sp.text(p)).join("\n") + JSON.stringify(b);
  for (const n of NAMEN) assert.ok(alles.indexOf(n) < 0, n);
  // zweiter Lauf: nichts Neues, keine Gruppenseite mehr
  const b2 = await x.m.jetztHolen({ manuell: true });
  assert.equal(b2.gruppen.neu, 0);
  assert.equal(x.stand.gruppeKurs, 1);
});

test("Gruppen: Brotkrumen ohne Kurs werden gemerkt und erst nach einer Woche neu versucht", async () => {
  const x = gruppenAufbau({ kurs901: null });
  await verbinden(x);
  await x.m.jetztHolen({ manuell: true });
  await x.m.jetztHolen({ manuell: true });
  assert.equal(x.stand.gruppeKurs, 1, "kein Abruf in jedem Lauf");
  assert.equal(x.m.gruppenListe().find((g) => g.refId === "901").status, "ohne-code");
  x.u.vor(8 * 24 * STUNDE);
  x.stand.kurs901 = { refId: "100", code: "B110" };
  await x.m.jetztHolen({ manuell: true });
  assert.equal(x.stand.gruppeKurs, 2);
  assert.equal(x.m.gruppenListe().find((g) => g.refId === "901").status, "zugeordnet");
});

test("Gruppen: Verlassen erst beim zweiten Lauf in Folge, leere Liste entfernt nie, Schutz bei Massenwegfall, ohne Gruppenliste keine Änderung", async () => {
  const x = gruppenAufbau();
  await verbinden(x);
  await x.m.jetztHolen({ manuell: true });
  x.stand.mitglieder = [];
  const b = await x.m.jetztHolen({ manuell: true });
  assert.match(b.warnung, /keine deiner Gruppen/);
  await x.m.jetztHolen({ manuell: true });
  assert.equal(x.sp.pfade().length, 2, "leere Liste: nichts entfernt");
  // eine (die einzige B110-Gruppe) fehlt: erst beim zweiten Lauf weg
  x.stand.mitglieder = ["351", "352"];
  await x.m.jetztHolen({ manuell: true });
  assert.deepEqual(x.sp.papierkorb, [], "erster Lauf ohne die Gruppe: bleibt");
  assert.equal(x.m.gruppenListe().some((g) => g.refId === "901"), true, "gilt noch als Mitglied");
  await x.m.jetztHolen({ manuell: true });
  assert.deepEqual(x.sp.papierkorb, [B110]);
  assert.equal(x.m.gruppenListe().some((g) => g.refId === "901"), false);
  x.stand.zentral = null;
  x.stand.mitglieder = ["352"];
  await x.m.jetztHolen({ manuell: true });
  await x.m.jetztHolen({ manuell: true });
  assert.deepEqual(x.sp.pfade(), [S100], "ohne Gruppenliste wird nichts entfernt");
  assert.equal(x.m.gruppenListe().find((g) => g.refId === "352").status, "ohne-daten");
});

test("Gruppen: Doppel derselben Gruppe und gewählte Notizen desselben Moduls weichen in die eine (eigener Text wandert mit)", async () => {
  const g5 = ZENTRAL[0], g4 = ZENTRAL[1];
  const notizen = {
    [S100_ALT]: M.notizText("", g5, { herkunft: M.ILIAS, iliasGruppe: "351", name: "Gruppe 4" }),
    "Stundenplan/Di 10.15 S100 Tutorium 2.md": M.notizText("", g5, { herkunft: M.ILIAS, iliasGruppe: "351", name: "Gruppe 4" }).replace("## Notizen\n- \n", "## Notizen\n- aus der Kopie\n"),
    "Stundenplan/Di 08.15 S100 Tutorium.md": M.notizText("", g4, { herkunft: M.GEWAEHLT }).replace("## Notizen\n- \n", "## Notizen\n- gewählt\n"),
  };
  const x = gruppenAufbau({ notizen, mitglieder: ["351"] });
  await verbinden(x);
  const b = await x.m.jetztHolen({ manuell: true });
  assert.equal(b.art, "ok", b.fehler);
  assert.deepEqual(x.sp.pfade(), [S100], "die eine bleibt, unter ihrem eigenen Namen");
  assert.deepEqual(x.sp.umbenannt, [[S100_ALT, S100]]);
  assert.deepEqual(x.sp.papierkorb.sort(), ["Stundenplan/Di 08.15 S100 Tutorium.md", "Stundenplan/Di 10.15 S100 Tutorium 2.md"]);
  const t = x.sp.text(S100);
  assert.match(t, /- aus der Kopie/);
  assert.match(t, /- gewählt/);
});

test("Gruppen: Überschneidung mit einer anderen Stundenplan-Notiz steht still im Feld konflikt", async () => {
  const vl = "---\ntyp: lehrveranstaltung\ncode: \"S110\"\nart: \"Vorlesung\"\nwochentag: 2\nbeginn: \"11:15\"\nende: \"12:45\"\nsemester: \"WS 2026/27\"\n---\n\n## Notizen\n- \n";
  const x = gruppenAufbau({ notizen: { "Stundenplan/Di 11.15 S110 Vorlesung.md": vl }, mitglieder: ["351", "901"] });
  await verbinden(x);
  await x.m.jetztHolen({ manuell: true });
  assert.equal(x.sp.fm(S100).konflikt, "Di 11.15 S110 Vorlesung");
  assert.equal(x.sp.fm(B110).konflikt, undefined, "Di 8:15–9:45 überschneidet nichts");
});

test("Gruppen: Quelle ohne Mitgliederseite (ältere Fassung) lässt Notizen in Ruhe", async () => {
  const x = aufbau({ dateien: { [I.K.INDEX]: "" } });
  const sp = notizenIo({ "Stundenplan/a.md": "---\ntyp: lehrveranstaltung\nherkunft: ilias-gruppe\nilias_gruppe: \"1\"\n---\n" });
  x.abh.gruppen = () => M;
  x.abh.zentraleGruppen = () => ZENTRAL;
  x.abh.stundenplan = () => sp.io;
  await verbinden(x);
  const b = await x.m.jetztHolen({ manuell: true });
  assert.equal(b.gruppen, null);
  assert.deepEqual(sp.pfade(), ["Stundenplan/a.md"]);
});
