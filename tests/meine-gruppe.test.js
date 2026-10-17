// Deine Übungsgruppe im Stundenplan (meine-gruppe.js): Zeitfenster aus ILIAS-Text (nur Tag, Zeit, Raumnummer, nie Namen),
// Zuordnung zu gruppen.json (Code + Wochentag + Beginn/Ende ±15 Min., c.t./s.t., Raum entscheidet, nie die Nummer), Notiztext
// fürs Wochenraster, Abgleich mit den Notizen (anlegen, aktualisieren, weichen, übernehmen, verlassen, Schutz) und „Meine
// Gruppe“. Nur ausgedachte Daten. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");
const { notizenIo } = require("./stundenplan-attrappe.js");

const M = laden("meine-gruppe").ergebnis;
const SEM = "WS 2026/27";
const g = (anders = {}) => Object.assign({
  id: "ws-2026-27-x100-tutorium-5", code: "X100", art: "Tutorium", gruppe: "5", tag: "Di", von: "10:00", bis: "12:00", ct: true,
  raum: "Hörsaal 11 (Beispielbau)", leitung: "", anmeldung: "", quelle_url: "https://alma.uni-tuebingen.de/a", semester: SEM, zeitraum: null, geprueft: "",
}, anders);
const LISTE = [
  g(),
  g({ id: "ws-2026-27-x100-tutorium-4", gruppe: "4", tag: "Di", von: "08:00", bis: "10:00", raum: "Hörsaal 7 (Beispielhaus)" }),
  g({ id: "ws-2026-27-x100-tutorium-8", gruppe: "8", tag: "Mi", von: "14:00", bis: "16:00", raum: "Hörsaal 22 (Beispielbau)" }),
  g({ id: "ws-2026-27-x100-tutorium-9", gruppe: "9", tag: "Mi", von: "14:00", bis: "16:00", raum: "Seminarraum 0.02 (Beispielbau)" }),
  g({ id: "ws-2026-27-y200-uebung-2", code: "Y200", art: "Übung", gruppe: "2", tag: "Mi", von: "08:00", bis: "10:00", raum: "Hörsaal Beispielstr. 001 (Haus)" }),
];

test("Zeitfenster: Tag, Zeit und Raumnummer aus Titel und Beschreibung, nie Namen", () => {
  assert.deepEqual(M.zeitfenster("Gruppe 4: Dienstag 10 - 12, Hörsaal 11 (Erika Beispiel)"), { tag: "Di", beginn: "10:00", ende: "12:00", raum: "11" });
  assert.deepEqual(M.zeitfenster("Gruppe 4 · Gruppe 4 - Mi. 8:00 - 10:00 - Hörsaal 1 (Beispielhaus 2)"), { tag: "Mi", beginn: "08:00", ende: "10:00", raum: "1" });
  assert.deepEqual(M.zeitfenster("Tutorium 1 - Dienstag, 08:15 - 09: 45 Uhr · Termin: Dienstag, 08:15 - 09: 45 Uhr Tutor: Max Muster Ort: Hörsaal 0.02 (Bau)"),
    { tag: "Di", beginn: "08:15", ende: "09:45", raum: "0.2" });
  const s = JSON.stringify(M.zeitfenster("Gruppe 2: Freitags 14-16 Uhr bei Erika Beispiel"));
  assert.doesNotMatch(s, /Erika|Beispiel/);
  assert.equal(M.zeitfenster("Gruppe 4"), null, "ohne Tag und Zeit");
  // Datum ist keine Uhrzeit; Namen in Klammern setzen keinen Tag; mehrere Tage oder Zeiten: nicht raten; Raum nur nach Raumwort
  assert.deepEqual(M.zeitfenster("Dienstag, 14.10 - 16.12, 10-12 Uhr"), { tag: "Di", beginn: "10:00", ende: "12:00", raum: "" });
  assert.deepEqual(M.zeitfenster("Gruppe 2 (Anna Montag) Dienstag 10-12"), { tag: "Di", beginn: "10:00", ende: "12:00", raum: "" });
  assert.equal(M.zeitfenster("Do 8-10 und Fr 12-14"), null);
  assert.equal(M.zeitfenster("Dienstag 8-10 oder 12-14"), null);
  assert.deepEqual(M.zeitfenster("MO 10-12"), { tag: "Mo", beginn: "10:00", ende: "12:00", raum: "" });
  assert.deepEqual(M.zeitfenster("Mittwoch 10.15 - 11.45, Raum 3"), { tag: "Mi", beginn: "10:15", ende: "11:45", raum: "3" });
  assert.equal(M.gruppenName("Gruppe 4: Dienstag 10 - 12 (Erika Beispiel)"), "Gruppe 4");
  assert.equal(M.gruppenName("TUTORIUM 1 - Dienstag"), "Tutorium 1");
  assert.equal(M.gruppenName("Mathe Gruppe 4"), "", "nur am Anfang");
  assert.equal(M.zeitfenster("Gruppe 4 - 10 - 12"), null, "ohne Wochentag nie raten");
  assert.equal(M.raumKern("Hörsaal Beispielstr. 001 (Haus)"), "1");
  assert.equal(M.raumKern("Hörsaal S320 (Bau)"), "S320");
});

test("Zuordnung: Code + Wochentag + Beginn/Ende ±15 Min. (c.t./s.t.), nie über die Nummer", () => {
  // ILIAS „Gruppe 4“ ist zentral Gr. 5 (die Nummern weichen ab)
  assert.deepEqual(M.zuordnen(M.zeitfenster("Gruppe 4: Dienstag 10 - 12, Hörsaal 11"), "X100", LISTE, SEM), { status: "zugeordnet", id: "ws-2026-27-x100-tutorium-5" });
  // s.t.-Zeit im Titel, c.t. in den Daten
  assert.equal(M.zuordnen({ tag: "Di", beginn: "10:15", ende: "11:45", raum: "" }, "X100", LISTE, SEM).id, "ws-2026-27-x100-tutorium-5");
  assert.equal(M.zuordnen({ tag: "Di", beginn: "10:16", ende: "12:00", raum: "" }, "X100", LISTE, SEM).status, "zugeordnet", "15 Min. nach 10:00 c.t. = 10:15, +1");
  assert.equal(M.zuordnen({ tag: "Di", beginn: "10:31", ende: "12:00", raum: "" }, "X100", LISTE, SEM).status, "ohne-treffer");
  // gleiche Zeit: Raum entscheidet, ohne passenden Raum mehrdeutig
  assert.equal(M.zuordnen({ tag: "Mi", beginn: "14:00", ende: "16:00", raum: "0.2" }, "X100", LISTE, SEM).id, "ws-2026-27-x100-tutorium-9");
  assert.deepEqual(M.zuordnen({ tag: "Mi", beginn: "14:00", ende: "16:00", raum: "99" }, "X100", LISTE, SEM),
    { status: "mehrdeutig", kandidaten: ["ws-2026-27-x100-tutorium-8", "ws-2026-27-x100-tutorium-9"] });
  assert.equal(M.zuordnen({ tag: "Mi", beginn: "08:00", ende: "10:00", raum: "1" }, "Y200", LISTE, SEM).id, "ws-2026-27-y200-uebung-2");
  assert.equal(M.zuordnen({ tag: "Mi", beginn: "08:00", ende: "10:00" }, "", LISTE, SEM).status, "ohne-code", "Code nie aus der Uhrzeit");
  assert.equal(M.zuordnen(null, "X100", LISTE, SEM).status, "ohne-zeit");
  assert.equal(M.zuordnen({ tag: "Di", beginn: "10:00", ende: "12:00" }, "X100", LISTE, "SS 2027").status, "ohne-treffer", "anderes Semester");
});

test("Notiz: Felder fürs Wochenraster (echte Zeit bei c.t.), eigene Felder und Notizen bleiben", () => {
  const t = M.notizText("", g({ zeitraum: { von: "2026-10-20", bis: "2027-02-09" } }), { herkunft: M.ILIAS, iliasGruppe: "351", modulLink: "[[X100 Beispiel]]", kurz: "Beispielökonomik" });
  const { frontmatter } = require("./stundenplan-attrappe.js");
  const fm = frontmatter(t);
  assert.deepEqual([fm.typ, fm.code, fm.art, fm.wochentag, fm.tag, fm.beginn, fm.ende, fm.semester, fm.herkunft, fm.ilias_gruppe, fm.gruppe_id, fm.uebersicht, fm.von, fm.bis],
    ["lehrveranstaltung", "X100", "Tutorium", 2, "Di", "10:15", "11:45", SEM, "ilias-gruppe", "351", "ws-2026-27-x100-tutorium-5", "[[Stundenplan]]", "2026-10-20", "2027-02-09"]);
  assert.deepEqual([fm.titel, fm.gruppe, fm.gruppe_alma], ["Beispielökonomik · Tutorium Gruppe 5", "Gruppe 5", "5"], "ohne ILIAS-Name: Nummer der Liste");
  const mitName = frontmatter(M.notizText("", g(), { herkunft: M.ILIAS, iliasGruppe: "351", name: "Gruppe 4", kurz: "Beispielökonomik", konflikt: "Di 10.15 X200 Vorlesung" }));
  assert.deepEqual([mitName.titel, mitName.gruppe, mitName.gruppe_alma, mitName.konflikt], ["Beispielökonomik · Tutorium Gruppe 4", "Gruppe 4", "5", "Di 10.15 X200 Vorlesung"]);
  assert.equal(frontmatter(M.notizText("", g(), { herkunft: M.ILIAS, name: "Tutorium 1" })).titel, "X100 · Tutorium 1", "Name beginnt mit der Art");
  assert.match(t, /^> \[!info\] Aus ILIAS: /m);
  // Dateiname nie wie eine Alma-, Oracle- oder zentrale Notiz („Di 10.15 X100 Tutorium“)
  assert.equal(M.dateiName(g(), { herkunft: M.ILIAS, name: "Gruppe 4" }), "Di 10.15 X100 Tutorium Gruppe 4 (ILIAS)");
  assert.equal(M.dateiName(g({ gruppe: "1" }), { herkunft: M.ILIAS, name: "Tutorium 1" }), "Di 10.15 X100 Tutorium 1 (ILIAS)");
  assert.equal(M.dateiName(g(), { herkunft: M.GEWAEHLT }), "Di 10.15 X100 Tutorium Gruppe 5 (gewählt)");
  // eigene Felder, eigener Text unter „## Notizen“ und eigene Zeilen im Kopf bleiben
  const mit = t.replace("tags:", "farbe: blau\ntags:").replace("## Notizen\n- \n", "## Notizen\n- Blatt 2 mitbringen\n").replace("> [!info] Aus ILIAS", "Treffpunkt vor dem Eingang\n\n> [!info] Aus ILIAS");
  const neu = M.notizText(mit, g({ raum: "Hörsaal 12 (Beispielbau)" }), { herkunft: M.ILIAS, iliasGruppe: "351" });
  assert.match(neu, /^farbe: blau$/m);
  assert.match(neu, /^- Blatt 2 mitbringen$/m);
  assert.equal(neu.split("Treffpunkt vor dem Eingang").length, 2, "eigene Kopfzeile genau einmal");
  assert.equal(M.notizText(neu, g({ raum: "Hörsaal 12 (Beispielbau)" }), { herkunft: M.ILIAS, iliasGruppe: "351" }), neu, "stabil");
  assert.equal(M.meineNotizen(M.notizText("", g(), {}).replace("> [!info]", "Eigene Zeile\n\n> [!info]")), "Eigene Zeile", "Kopftext zählt als eigener Text");
  assert.match(neu, /^raum: "Hörsaal 12 \(Beispielbau\)"$/m);
  assert.match(M.notizText("", g(), { herkunft: M.GEWAEHLT }), /^herkunft: gruppe-gewaehlt$/m);
});

const notiz = (fm, rest) => "---\n" + Object.keys(fm).map((k) => k + ": " + (typeof fm[k] === "string" ? JSON.stringify(fm[k]) : fm[k])).join("\n") + "\n---\n\n# x\n\n## Notizen\n" + (rest || "- ") + "\n";
const ALMA = { typ: "lehrveranstaltung", code: "X100", art: "Übung", wochentag: 2, beginn: "10:15", ende: "11:45", semester: SEM, quelle: "alma" };

test("ILIAS-Abgleich: anlegen, unverändert lassen, verlassen (Papierkorb bzw. „entfällt“), Schutz gegen Massenwegfall", async () => {
  const t = notizenIo();
  const soll = [{ refId: "351", g: g() }, { refId: "352", g: LISTE[4] }];
  const b1 = await M.iliasAbgleichen(t.io, soll, new Set(["351", "352"]), { heute: "2026-10-17" });
  assert.deepEqual(b1.angelegt, ["Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (ILIAS).md", "Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md"], "eigener Name mit „(ILIAS)“, nie wie eine Alma- oder zentrale Notiz");
  const b2 = await M.iliasAbgleichen(t.io, soll, new Set(["351", "352"]), { heute: "2026-10-17" });
  assert.deepEqual([b2.angelegt, b2.aktualisiert], [[], []], "zweiter Lauf schreibt nichts");
  // beide auf einmal weg: Schutz
  const b3 = await M.iliasAbgleichen(t.io, [], new Set(), { heute: "2026-10-17" });
  assert.match(b3.warnung, /2 Gruppen fehlen/);
  assert.equal(t.pfade().length, 2);
  // eine verlassen: Papierkorb; die andere mit eigenem Text: „(entfällt)“
  await t.io.schreiben("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md", t.text("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md").replace("## Notizen\n- \n", "## Notizen\n- meine Lösung\n"));
  const b4 = await M.iliasAbgleichen(t.io, [soll[0]], new Set(["351"]), { heute: "2026-10-17" });
  assert.deepEqual(b4.entfernt, []);
  const b5 = await M.iliasAbgleichen(t.io, [], new Set(), { heute: "2026-10-17" });
  assert.deepEqual([b5.entfernt, b5.entfaellt], [["Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (ILIAS).md"], []]);
  const t2 = notizenIo();
  await M.iliasAbgleichen(t2.io, soll, new Set(["351", "352"]), {});
  await t2.io.schreiben("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md", t2.text("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md").replace("## Notizen\n- \n", "## Notizen\n- meine Lösung\n"));
  const b6 = await M.iliasAbgleichen(t2.io, [soll[0]], new Set(["351"]), {});
  assert.deepEqual(b6.entfaellt, ["Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md"]);
  const fm = t2.fm("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md");
  assert.equal(fm.entfaellt, true);
  assert.match(fm.titel, /\(entfällt\)$/);
  assert.match(t2.text("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md"), /meine Lösung/);
});

test("ILIAS-Abgleich: weicht Alma (eigener Text wandert mit), übernimmt eine gewählte Notiz, legt nichts an, solange Obsidian einliest", async () => {
  const t = notizenIo({ "Stundenplan/Di 10.15 X100 Tutorium.md": M.notizText("", g(), { herkunft: M.ILIAS, iliasGruppe: "351" }).replace("## Notizen\n- \n", "## Notizen\n- Frage zu Blatt 1\n") });
  t.m.set("Stundenplan/Di 10.15 X100 Übung.md", notiz(ALMA));
  const b = await M.iliasAbgleichen(t.io, [{ refId: "351", g: g() }], new Set(["351"]), { heute: "2026-10-17" });
  assert.deepEqual(b.gewichen, ["Stundenplan/Di 10.15 X100 Tutorium.md"]);
  assert.deepEqual(t.papierkorb, ["Stundenplan/Di 10.15 X100 Tutorium.md"]);
  assert.match(t.text("Stundenplan/Di 10.15 X100 Übung.md"), /Aus der Notiz zu deiner Gruppe übernommen \(17\.10\.2026\):\n\n- Frage zu Blatt 1/);
  // gewählte Notiz desselben Moduls (andere Gruppe) wird zur ILIAS-Notiz, deine Notizen bleiben
  const u = notizenIo({ "Stundenplan/Di 08.15 X100 Tutorium.md": M.notizText("", LISTE[1], { herkunft: M.GEWAEHLT }).replace("## Notizen\n- \n", "## Notizen\n- gewählt\n") });
  const b2 = await M.iliasAbgleichen(u.io, [{ refId: "351", g: g() }], new Set(["351"]), {});
  assert.deepEqual([b2.uebernommen, b2.angelegt, b2.umbenannt], [["Stundenplan/Di 08.15 X100 Tutorium.md"], [], ["Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (ILIAS).md"]]);
  assert.deepEqual(u.umbenannt, [["Stundenplan/Di 08.15 X100 Tutorium.md", "Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (ILIAS).md"]], "mit dem fileManager: Links ziehen mit");
  const fm = u.fm("Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (ILIAS).md");
  assert.deepEqual([fm.herkunft, fm.ilias_gruppe, fm.gruppe_id, fm.beginn], ["ilias-gruppe", "351", "ws-2026-27-x100-tutorium-5", "10:15"]);
  assert.match(u.text("Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (ILIAS).md"), /- gewählt/);
  const v = notizenIo({}, { unfertig: true });
  assert.deepEqual((await M.iliasAbgleichen(v.io, [{ refId: "351", g: g() }], new Set(["351"]), {})).angelegt, []);
});

test("Meine Gruppe: wählen, ändern, abwählen; nicht, wenn ILIAS oder Alma die Gruppe schon liefern", async () => {
  const t = notizenIo();
  assert.equal((await M.waehlen(t.io, LISTE[1])).art, "angelegt");
  const p0 = "Stundenplan/Di 08.15 X100 Tutorium Gruppe 4 (gewählt).md", p = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (gewählt).md";
  assert.equal(t.fm(p0).herkunft, "gruppe-gewaehlt");
  assert.equal((await M.waehlen(t.io, g())).art, "geaendert", "andere Gruppe desselben Moduls: dieselbe Notiz, neuer Name");
  assert.deepEqual([t.pfade(), t.fm(p).gruppe_id, t.fm(p).beginn, t.umbenannt], [[p], "ws-2026-27-x100-tutorium-5", "10:15", [[p0, p]]]);
  assert.equal(await M.abwaehlen(t.io, g()), true);
  assert.deepEqual([t.pfade(), t.papierkorb], [[], [p]]);
  const u = notizenIo({ "Stundenplan/a.md": M.notizText("", g(), { herkunft: M.ILIAS, iliasGruppe: "1" }) });
  assert.equal((await M.waehlen(u.io, LISTE[1])).art, "ilias");
  const v = notizenIo({ "Stundenplan/b.md": notiz(ALMA) });
  assert.equal((await M.waehlen(v.io, g())).art, "gedeckt");
});

test("Aufräumen: gewählte Notiz weicht, wenn ILIAS oder Alma die Gruppe liefert; Meine Gruppe mit Überschneidung", async () => {
  const gw = M.notizText("", LISTE[1], { herkunft: M.GEWAEHLT }).replace("## Notizen\n- \n", "## Notizen\n- meine Frage\n");
  const t = notizenIo({ "Stundenplan/Di 08.15 X100 Tutorium.md": gw, "Stundenplan/Di 10.15 X100 Tutorium.md": M.notizText("", g(), { herkunft: M.ILIAS, iliasGruppe: "9" }) });
  assert.deepEqual(await M.gewaehltAufraeumen(t.io, "2026-10-17"), ["Stundenplan/Di 08.15 X100 Tutorium.md"]);
  assert.match(t.text("Stundenplan/Di 10.15 X100 Tutorium.md"), /- meine Frage/);
  const u = notizenIo({ "Stundenplan/a.md": gw, "Stundenplan/b.md": notiz(Object.assign({}, ALMA, { beginn: "08:15", ende: "09:45" })) });
  assert.deepEqual(await M.gewaehltAufraeumen(u.io, "2026-10-17"), ["Stundenplan/a.md"], "Alma liefert dieselbe Zeit");
  const v = notizenIo({ "Stundenplan/a.md": gw });
  assert.deepEqual(await M.gewaehltAufraeumen(v.io, "2026-10-17"), [], "nichts deckt sie: bleibt");
  // Überschneidung beim Wählen
  const w = notizenIo({ "Stundenplan/Di 11.15 Y300 Vorlesung.md": notiz({ typ: "lehrveranstaltung", code: "Y300", art: "Vorlesung", wochentag: 2, beginn: "11:15", ende: "12:45", semester: SEM }) });
  await M.waehlen(w.io, g());
  assert.equal(w.fm("Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (gewählt).md").konflikt, "Di 11.15 Y300 Vorlesung");
});
