// Deine Übungsgruppe im Stundenplan (meine-gruppe.js): Zeitfenster aus ILIAS-Text (nur Tag, Zeit, Raumnummer, nie Namen),
// Zuordnung zu gruppen.json (Code + Wochentag + Beginn/Ende ±15 Min., c.t./s.t., Raum entscheidet, dann die kleinere
// Abweichung, nie die Nummer), Notiztext fürs Wochenraster, Abgleich mit den Notizen (anlegen, aktualisieren, weichen,
// übernehmen, verlassen, Schutz), „Meine Gruppe“, Aufräumen auf zwei Geräten, Freigeben (ILIAS-Notiz wird gewählt) und eine
// Gruppe je Modul und Art (doppelt). Nur ausgedachte Daten. Läuft ohne Obsidian: node --test tests/
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

test("Zuordnung: Ende höchstens 15 Min. daneben, sonst die kleinere Abweichung; ILIAS-Gruppe ohne Raum", () => {
  // Ende: 10–12 c.t. endet 11:45; gemessen an 12:00 und an 11:45
  const di = (ende) => M.zuordnen({ tag: "Di", beginn: "10:15", ende, raum: "" }, "X100", LISTE, SEM).status;
  assert.deepEqual(["12:10", "12:15", "11:30", "12:16", "11:29"].map(di), ["zugeordnet", "zugeordnet", "zugeordnet", "ohne-treffer", "ohne-treffer"]);
  assert.equal(M.zuordnen({ tag: "Di", beginn: "10:15", raum: "" }, "X100", LISTE, SEM).status, "zugeordnet", "ohne Ende zählt nur der Beginn");
  // zwei Gruppen am selben Tag, beide in der Toleranz: die kleinere Abweichung (Beginn + Ende) gewinnt, gleich weit → mehrdeutig
  const zwei = [
    g({ id: "ws-2026-27-x100-tutorium-1", gruppe: "1", tag: "Do", von: "10:00", bis: "12:00", ct: false, raum: "Raum 1 (Beispielbau)" }),
    g({ id: "ws-2026-27-x100-tutorium-2", gruppe: "2", tag: "Do", von: "10:15", bis: "11:45", ct: false, raum: "Raum 2 (Beispielbau)" }),
  ];
  const zu = (beginn, ende, raum) => M.zuordnen({ tag: "Do", beginn, ende, raum }, "X100", zwei, SEM);
  assert.equal(zu("10:15", "11:45", "").id, "ws-2026-27-x100-tutorium-2");
  assert.equal(zu("10:05", "11:55", "").id, "ws-2026-27-x100-tutorium-1");
  assert.deepEqual(zu("10:07", "11:52", ""), { status: "mehrdeutig", kandidaten: ["ws-2026-27-x100-tutorium-1", "ws-2026-27-x100-tutorium-2"] });
  assert.equal(zu("10:15", "11:45", "9").id, "ws-2026-27-x100-tutorium-2", "Raum passt zu keiner: dann die Abweichung");
  assert.equal(zu("10:15", "11:45", "1").id, "ws-2026-27-x100-tutorium-1", "der Raum geht vor der Abweichung");
  // ILIAS nennt keinen Raum: eindeutig über die Zeit, die Notiz zeigt den Raum der Liste; gleiche Zeit ohne Raum → mehrdeutig
  const slot = M.zeitfenster("Gruppe 3: Donnerstag 10:15 - 11:45 (Erika Beispiel)");
  assert.deepEqual(slot, { tag: "Do", beginn: "10:15", ende: "11:45", raum: "" });
  const z = M.zuordnen(slot, "X100", zwei.slice(1), SEM);
  assert.equal(z.id, "ws-2026-27-x100-tutorium-2");
  assert.match(M.notizText("", zwei[1], { herkunft: M.ILIAS, iliasGruppe: "1", name: "Gruppe 3" }), /^raum: "Raum 2 \(Beispielbau\)"$/m);
  assert.equal(M.zuordnen(M.zeitfenster("Gruppe 8: Mittwoch 14 - 16"), "X100", LISTE, SEM).status, "mehrdeutig");
});

test("Notiz: Felder fürs Wochenraster (echte Zeit bei c.t.), eigene Felder und Notizen bleiben", () => {
  const t = M.notizText("", g({ zeitraum: { von: "2026-10-20", bis: "2027-02-09" } }), { herkunft: M.ILIAS, iliasGruppe: "351", modulLink: "[[X100 Beispiel]]", kurz: "Beispielökonomik" });
  const { frontmatter } = require("./stundenplan-attrappe.js");
  const fm = frontmatter(t);
  assert.deepEqual([fm.typ, fm.code, fm.art, fm.wochentag, fm.tag, fm.beginn, fm.ende, fm.semester, fm.herkunft, fm.ilias_gruppe, fm.gruppe_id, fm.uebersicht, fm.von, fm.bis],
    ["lehrveranstaltung", "X100", "Tutorium", 2, "Di", "10:15", "11:45", SEM, "ilias-gruppe", "351", "ws-2026-27-x100-tutorium-5", "[[Stundenplan]]", "2026-10-20", "2027-02-09"]);
  assert.deepEqual([fm.titel, fm.gruppe, fm.gruppe_alma], ["Beispielökonomik · Tutorium Gruppe 5", "Gruppe 5", "5"], "ohne ILIAS-Name: Nummer der Liste");
  const mitName = frontmatter(M.notizText("", g(), { herkunft: M.ILIAS, iliasGruppe: "351", name: "Gruppe 4", kurz: "Beispielökonomik" }));
  assert.deepEqual([mitName.titel, mitName.gruppe, mitName.gruppe_alma], ["Beispielökonomik · Tutorium Gruppe 4", "Gruppe 4", "5"]);
  // Überschneidungen rechnet die Woche selbst: ein altes Feld konflikt fällt beim nächsten Schreiben weg
  const mitKonflikt = t.replace("gruppe_id:", "konflikt: \"Di 10.15 X200 Vorlesung\"\ngruppe_id:");
  assert.equal(frontmatter(mitKonflikt).konflikt, "Di 10.15 X200 Vorlesung");
  assert.equal(frontmatter(M.notizText(mitKonflikt, g(), { herkunft: M.ILIAS, iliasGruppe: "351", modulLink: "[[X100 Beispiel]]", kurz: "Beispielökonomik" })).konflikt, undefined);
  assert.equal(frontmatter(M.notizText("", g(), { herkunft: M.ILIAS, name: "Tutorium 1" })).titel, "X100 · Tutorium 1", "Name beginnt mit der Art");
  assert.match(t, /^> \[!info\] Aus ILIAS: /m);
  // Dateiname nie wie eine Alma-, Oracle- oder zentrale Notiz („Di 10.15 X100 Tutorium“)
  assert.equal(M.dateiName(g(), { herkunft: M.ILIAS, name: "Gruppe 4" }), "Di 10.15 X100 Tutorium Gruppe 4 (ILIAS)");
  assert.equal(M.dateiName(g({ gruppe: "1" }), { herkunft: M.ILIAS, name: "Tutorium 1" }), "Di 10.15 X100 Tutorium 1 (ILIAS)");
  assert.equal(M.dateiName(g(), { herkunft: M.GEWAEHLT }), "Di 10.15 X100 Tutorium Gruppe 5 (gewählt)");
  // neue Notizen: „## Meine Notizen“; eine ältere mit „## Notizen“ behält Überschrift und Text
  assert.match(t, /\n## Meine Notizen\n- \n$/);
  const alt = M.notizText(t.replace("## Meine Notizen\n- \n", "## Notizen\n- Raum fragen\n"), g(), { herkunft: M.ILIAS, iliasGruppe: "351" });
  assert.match(alt, /\n## Notizen\n- Raum fragen\n$/);
  assert.equal(M.meineNotizen(alt), "- Raum fragen");
  // eigene Felder, eigener Text unter „## Meine Notizen“ und eigene Zeilen im Kopf bleiben
  const mit = t.replace("tags:", "farbe: blau\ntags:").replace("## Meine Notizen\n- \n", "## Meine Notizen\n- Blatt 2 mitbringen\n").replace("> [!info] Aus ILIAS", "Treffpunkt vor dem Eingang\n\n> [!info] Aus ILIAS");
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
  await t.io.schreiben("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md", t.text("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md").replace("## Meine Notizen\n- \n", "## Meine Notizen\n- meine Lösung\n"));
  const b4 = await M.iliasAbgleichen(t.io, [soll[0]], new Set(["351"]), { heute: "2026-10-17" });
  assert.deepEqual(b4.entfernt, []);
  const b5 = await M.iliasAbgleichen(t.io, [], new Set(), { heute: "2026-10-17" });
  assert.deepEqual([b5.entfernt, b5.entfaellt], [["Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (ILIAS).md"], []]);
  const t2 = notizenIo();
  await M.iliasAbgleichen(t2.io, soll, new Set(["351", "352"]), {});
  await t2.io.schreiben("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md", t2.text("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md").replace("## Meine Notizen\n- \n", "## Meine Notizen\n- meine Lösung\n"));
  const b6 = await M.iliasAbgleichen(t2.io, [soll[0]], new Set(["351"]), {});
  assert.deepEqual(b6.entfaellt, ["Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md"]);
  const fm = t2.fm("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md");
  assert.equal(fm.entfaellt, true);
  assert.match(fm.titel, /\(entfällt\)$/);
  assert.match(t2.text("Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md"), /meine Lösung/);
});

test("ILIAS-Abgleich: weicht Alma (eigener Text wandert mit), übernimmt eine gewählte Notiz, legt nichts an, solange Obsidian einliest", async () => {
  const t = notizenIo({ "Stundenplan/Di 10.15 X100 Tutorium.md": M.notizText("", g(), { herkunft: M.ILIAS, iliasGruppe: "351" }).replace("## Meine Notizen\n- \n", "## Meine Notizen\n- Frage zu Blatt 1\n") });
  t.m.set("Stundenplan/Di 10.15 X100 Übung.md", notiz(ALMA));
  const b = await M.iliasAbgleichen(t.io, [{ refId: "351", g: g() }], new Set(["351"]), { heute: "2026-10-17" });
  assert.deepEqual(b.gewichen, ["Stundenplan/Di 10.15 X100 Tutorium.md"]);
  assert.deepEqual(t.papierkorb, ["Stundenplan/Di 10.15 X100 Tutorium.md"]);
  assert.match(t.text("Stundenplan/Di 10.15 X100 Übung.md"), /Aus der Notiz zu deiner Gruppe übernommen \(17\.10\.2026\):\n\n- Frage zu Blatt 1/);
  // gewählte Notiz desselben Moduls (andere Gruppe) wird zur ILIAS-Notiz, deine Notizen bleiben
  const u = notizenIo({ "Stundenplan/Di 08.15 X100 Tutorium.md": M.notizText("", LISTE[1], { herkunft: M.GEWAEHLT }).replace("## Meine Notizen\n- \n", "## Meine Notizen\n- gewählt\n") });
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

test("Aufräumen: gewählte Notiz weicht, wenn ILIAS oder Alma die Gruppe liefert; Überschneidung steht nicht in der Notiz", async () => {
  const gw = M.notizText("", LISTE[1], { herkunft: M.GEWAEHLT }).replace("## Meine Notizen\n- \n", "## Meine Notizen\n- meine Frage\n");
  const t = notizenIo({ "Stundenplan/Di 08.15 X100 Tutorium.md": gw, "Stundenplan/Di 10.15 X100 Tutorium.md": M.notizText("", g(), { herkunft: M.ILIAS, iliasGruppe: "9" }) });
  assert.deepEqual(await M.gewaehltAufraeumen(t.io, "2026-10-17"), ["Stundenplan/Di 08.15 X100 Tutorium.md"]);
  assert.match(t.text("Stundenplan/Di 10.15 X100 Tutorium.md"), /- meine Frage/);
  const u = notizenIo({ "Stundenplan/a.md": gw, "Stundenplan/b.md": notiz(Object.assign({}, ALMA, { beginn: "08:15", ende: "09:45" })) });
  assert.deepEqual(await M.gewaehltAufraeumen(u.io, "2026-10-17"), ["Stundenplan/a.md"], "Alma liefert dieselbe Zeit");
  const v = notizenIo({ "Stundenplan/a.md": gw });
  assert.deepEqual(await M.gewaehltAufraeumen(v.io, "2026-10-17"), [], "nichts deckt sie: bleibt");
  // Überschneidung beim Wählen: rechnet die Woche (woche.js), die Notiz bleibt ohne Feld konflikt
  const w = notizenIo({ "Stundenplan/Di 11.15 Y300 Vorlesung.md": notiz({ typ: "lehrveranstaltung", code: "Y300", art: "Vorlesung", wochentag: 2, beginn: "11:15", ende: "12:45", semester: SEM }) });
  await M.waehlen(w.io, g());
  assert.equal(w.fm("Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (gewählt).md").konflikt, undefined);
});

test("Aufräumen auf zwei Geräten: dein Text kommt nur einmal in die andere Notiz", async () => {
  const gw = M.notizText("", LISTE[1], { herkunft: M.GEWAEHLT }).replace("## Meine Notizen\n- \n", "## Meine Notizen\n- meine Frage\n");
  const start = { "Stundenplan/a.md": gw, "Stundenplan/b.md": M.notizText("", g(), { herkunft: M.ILIAS, iliasGruppe: "9" }) };
  // zugleich, ohne Sync dazwischen: beide Geräte kommen zum selben Text (der Sync hat nichts zu mischen)
  const t1 = notizenIo(start), t2 = notizenIo(start);
  await M.gewaehltAufraeumen(t1.io, "2026-10-17");
  await M.gewaehltAufraeumen(t2.io, "2026-10-17");
  assert.equal(t1.text("Stundenplan/b.md"), t2.text("Stundenplan/b.md"));
  // nacheinander: Gerät 2 hat die Notiz mit deinem Text schon, den Papierkorb von Gerät 1 noch nicht
  const t3 = notizenIo({ "Stundenplan/a.md": gw, "Stundenplan/b.md": t1.text("Stundenplan/b.md") });
  assert.deepEqual(await M.gewaehltAufraeumen(t3.io, "2026-10-18"), ["Stundenplan/a.md"]);
  assert.equal(t3.text("Stundenplan/b.md"), t1.text("Stundenplan/b.md"), "dein Text steht genau einmal da");
  assert.equal(t3.text("Stundenplan/b.md").split("- meine Frage").length, 2);
  assert.deepEqual(t3.papierkorb, ["Stundenplan/a.md"]);
});

test("Freigeben: aus der ILIAS-Notiz wird eine gewählte (Name, Felder, dein Text bleiben), danach geht „Meine“", async () => {
  const P = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 4 (ILIAS).md", PG = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 4 (gewählt).md";
  const E = "Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (ILIAS).md";
  const il = M.notizText("", g(), { herkunft: M.ILIAS, iliasGruppe: "351", name: "Gruppe 4", kurz: "Beispielökonomik" })
    .replace("tags:", "farbe: blau\ntags:").replace("## Meine Notizen\n- \n", "## Meine Notizen\n- Blatt 2 mitbringen\n");
  const entfallen = M.notizText("", LISTE[4], { herkunft: M.ILIAS, iliasGruppe: "352" }).replace("tags:", "entfaellt: true\ntags:");
  const t = notizenIo({ [P]: il, [E]: entfallen });
  assert.equal((await M.waehlen(t.io, LISTE[1])).art, "ilias", "vorher: „Meine“ gesperrt");
  assert.deepEqual(await M.iliasFreigeben(t.io), [PG]);
  assert.deepEqual(t.umbenannt, [[P, PG]], "mit dem fileManager: Links ziehen mit");
  const fm = t.fm(PG);
  assert.deepEqual([fm.herkunft, fm.ilias_gruppe, fm.gruppe, fm.gruppe_alma, fm.gruppe_id, fm.titel, fm.beginn, fm.farbe],
    ["gruppe-gewaehlt", undefined, "Gruppe 4", "5", "ws-2026-27-x100-tutorium-5", "Beispielökonomik · Tutorium Gruppe 4", "10:15", "blau"], "der ILIAS-Name bleibt");
  assert.match(t.text(PG), /^> \[!info\] Von dir gewählt, ändern auf \[\[Termine & Anmeldungen\]\]\.$/m);
  assert.doesNotMatch(t.text(PG), /Aus ILIAS/);
  assert.match(t.text(PG), /^- Blatt 2 mitbringen$/m);
  assert.equal(t.text(E), entfallen, "entfallene bleibt, wie sie ist");
  assert.deepEqual(await M.iliasFreigeben(t.io), [], "zweites Mal: nichts zu tun");
  // ein zweites Gerät hat die gewählte Notiz schon per Sync, die alte noch: kein Doppel
  const u = notizenIo({ [P]: il, [PG]: t.text(PG) });
  assert.deepEqual(await M.iliasFreigeben(u.io), []);
  assert.deepEqual([u.pfade(), u.papierkorb], [[PG], [P]]);
  // „Meine“: eine andere Gruppe desselben Moduls ändert dieselbe Notiz, dein Text bleibt
  const r = await M.waehlen(t.io, LISTE[1]);
  assert.deepEqual([r.art, r.pfad], ["geaendert", "Stundenplan/Di 08.15 X100 Tutorium Gruppe 4 (gewählt).md"]);
  assert.deepEqual([t.fm(r.pfad).gruppe_id, t.fm(r.pfad).herkunft], ["ws-2026-27-x100-tutorium-4", "gruppe-gewaehlt"]);
  assert.match(t.text(r.pfad), /^- Blatt 2 mitbringen$/m);
});

test("Freigeben auf einem Gerät, Aufräumen auf dem anderen, solange die Umbenennung erst halb per Sync da ist: nichts geht verloren", async () => {
  const P = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 4 (ILIAS).md", PG = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 4 (gewählt).md";
  const il = M.notizText("", g(), { herkunft: M.ILIAS, iliasGruppe: "351", name: "Gruppe 4" }).replace("## Meine Notizen\n- \n", "## Meine Notizen\n- Blatt 2 mitbringen\n");
  const a = notizenIo({ [P]: il });
  assert.deepEqual(await M.iliasFreigeben(a.io), [PG]);
  // Gerät B: die neue Notiz ist schon da, die alte (noch ILIAS) auch; ihr Löschen kommt gleich. Weichen hieße: beide weg.
  const b = notizenIo({ [P]: il, [PG]: a.text(PG) });
  assert.deepEqual(await M.gewaehltAufraeumen(b.io, "2026-10-18"), [], "gewählte Notiz bleibt");
  assert.deepEqual(b.papierkorb, []);
  assert.equal(b.text(PG), a.text(PG));
  assert.equal(b.text(P), il, "die alte Notiz fasst das Aufräumen nicht an");
  // Eine echte Doppelung (andere gewählte Notiz neben der ILIAS-Notiz) räumt es weiter auf
  const gw = M.notizText("", LISTE[1], { herkunft: M.GEWAEHLT }).replace("## Meine Notizen\n- \n", "## Meine Notizen\n- meine Frage\n");
  const c = notizenIo({ [P]: il, "Stundenplan/Di 08.15 X100 Tutorium.md": gw });
  assert.deepEqual(await M.gewaehltAufraeumen(c.io, "2026-10-18"), ["Stundenplan/Di 08.15 X100 Tutorium.md"]);
  assert.match(c.text(P), /- meine Frage/);
});

test("Eine Regel „ist das deine Gruppe?“ (gehoertZu) für ILIAS, „Meine“ und „angemeldet · Gruppe 4“", () => {
  const G = g(); // Di 10:00–12:00 c.t. → echt 10:15–11:45
  const fm = (x) => Object.assign({ code: "X100", semester: "WS 2026/27", art: "Tutorium", wochentag: 2, beginn: "10:15", ende: "11:45" }, x);
  assert.equal(M.gehoertZu(fm(), G), true);
  assert.equal(M.gehoertZu(fm({ beginn: "10:00", ende: "12:00" }), G), true, "s.t.-Zeit der Liste");
  assert.equal(M.gehoertZu(fm({ beginn: "10:45" }), G), false, "Beginn mehr als 15 Min. daneben");
  assert.equal(M.gehoertZu(fm({ art: "Vorlesung" }), G), false, "nie eine Vorlesung");
  assert.equal(M.gehoertZu(fm({ art: "Veranstaltung" }), G), true, "unbestimmte Art zählt");
  assert.equal(M.gehoertZu(fm({ art: "Veranstaltung" }), G, { arten: ["Übung", "Tutorium"] }), false, "nur Übung und Tutorium");
  assert.equal(M.gehoertZu(fm({ ende: "13:00" }), G), true);
  assert.equal(M.gehoertZu(fm({ ende: "13:00" }), G, { ende: true }), false, "mit Ende");
  assert.equal(M.gehoertZu(fm({ entfaellt: true }), G), false);
  assert.equal(M.gehoertZu(fm({ wochentag: 3 }), G), false);
  // Gruppen-Notizen über ihre gruppe_id, nie über die Zeit
  assert.equal(M.gehoertZu(fm({ herkunft: "ilias-gruppe", gruppe_id: "anders", beginn: "10:15" }), G, { ueberId: true }), false);
  assert.equal(M.gehoertZu(fm({ herkunft: "gruppe-gewaehlt", gruppe_id: G.id, wochentag: 5 }), G, { ueberId: true }), true);
  assert.equal(M.deckt(fm(), G), M.gehoertZu(fm(), G));
});

// Eine Gruppe je Modul und Art (19.10.2026): Im Stundenplan standen zwei Tutorien desselben Moduls blass nebeneinander.
const T1 = g({ id: "ws-2026-27-x100-tutorium-1", gruppe: "1", tag: "Di", von: "10:00", bis: "12:00", zeitraum: { von: "2026-11-03", bis: "2027-02-02" } });
const T7 = g({ id: "ws-2026-27-x100-tutorium-7", gruppe: "7", tag: "Do", von: "08:00", bis: "10:00", zeitraum: { von: "2026-11-05", bis: "2027-02-04" } });
const P1 = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 1 (gewählt).md", P7 = "Stundenplan/Do 08.15 X100 Tutorium Gruppe 7 (gewählt).md";
const mitText = (t, text) => t.replace("## Meine Notizen\n- \n", "## Meine Notizen\n- " + text + "\n");

test("Eine Gruppe je Modul und Art: zweites „Meine“, bevor Obsidian die erste Notiz eingelesen hat, oder zwei Tipps zugleich", async () => {
  // Obsidian hat die eben angelegte Notiz noch nicht eingelesen (kein Frontmatter im metadataCache): vorher entstand eine zweite
  const t = notizenIo(), frisch = new Set(), notizen = t.io.notizen, anlegen = t.io.anlegen;
  t.io.notizen = () => notizen().map((x) => (frisch.has(x.pfad) ? { pfad: x.pfad, fm: null } : x));
  t.io.anlegen = async (p, text) => { await anlegen(p, text); frisch.add(p); };
  await M.waehlen(t.io, T1, { jetzt: "2026-10-19T10:00:00.000Z" });
  const r = await M.waehlen(t.io, T7, { jetzt: "2026-10-19T10:00:02.000Z" });
  assert.deepEqual([r.art, t.pfade()], ["geaendert", [P7]]);
  assert.equal(t.fm(P7).gewaehlt_am, "2026-10-19T10:00:02.000Z", "Zeitpunkt der Wahl");
  // zwei Tipps zugleich: Anlegen dauert (Obsidian schreibt die Datei), die Wahlen kommen nacheinander dran
  const u = notizenIo(), an = u.io.anlegen;
  u.io.anlegen = async (p, text) => { await new Promise((ok) => setTimeout(ok, 5)); await an(p, text); };
  await Promise.all([M.waehlen(u.io, T1, { jetzt: "2026-10-19T10:00:00.000Z" }), M.waehlen(u.io, T7, { jetzt: "2026-10-19T10:00:01.000Z" })]);
  assert.deepEqual(u.pfade(), [P7]);
});

test("Eine neue Wahl ersetzt jede ältere: zwei gewählte Notizen (zwei Geräte vor dem Sync) werden eine, dein Text bleibt", async () => {
  const t = notizenIo({ [P1]: mitText(M.notizText("", T1, { herkunft: M.GEWAEHLT }), "Frage A"), [P7]: mitText(M.notizText("", T7, { herkunft: M.GEWAEHLT }), "Frage B") });
  const r = await M.waehlen(t.io, LISTE[1], { jetzt: "2026-10-20T08:00:00.000Z", heute: "2026-10-20" });
  const p4 = "Stundenplan/Di 08.15 X100 Tutorium Gruppe 4 (gewählt).md";
  assert.deepEqual([r.art, r.pfad, t.pfade()], ["geaendert", p4, [p4]]);
  assert.equal(t.papierkorb.length, 1, "die zweite geht in den Papierkorb, nicht verloren");
  assert.match(t.text(p4), /- Frage A/);
  assert.match(t.text(p4), /- Frage B/);
  assert.equal(t.fm(p4).gruppe_id, "ws-2026-27-x100-tutorium-4");
  // Abwählen nimmt die Notiz der angetippten Gruppe, nicht irgendeine des Moduls
  const u = notizenIo({ [P1]: M.notizText("", T1, { herkunft: M.GEWAEHLT }), [P7]: M.notizText("", T7, { herkunft: M.GEWAEHLT }) });
  assert.equal(await M.abwaehlen(u.io, T7), true);
  assert.deepEqual([u.pfade(), u.papierkorb], [[P1], [P7]]);
});

test("Gruppe in ILIAS gewechselt: die Notiz der alten wird die der neuen (dein Text bleibt), keine zweite bis zum nächsten Lauf", async () => {
  const t = notizenIo();
  await M.iliasAbgleichen(t.io, [{ refId: "11", g: T1 }], new Set(["11"]), {});
  const alt = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 1 (ILIAS).md", neu = "Stundenplan/Do 08.15 X100 Tutorium Gruppe 7 (ILIAS).md";
  await t.io.schreiben(alt, mitText(t.text(alt), "Blatt 1"));
  // erster Lauf nach dem Wechsel: die alte Gruppe fehlt erst einmal (ilias.js entfernt sie erst beim zweiten Lauf)
  const b = await M.iliasAbgleichen(t.io, [{ refId: "17", g: T7 }], new Set(["17"]), { wegErlaubt: () => false });
  assert.deepEqual([t.pfade(), b.angelegt, b.umbenannt], [[neu], [], [neu]]);
  assert.deepEqual([t.fm(neu).ilias_gruppe, t.fm(neu).gruppe_id], ["17", "ws-2026-27-x100-tutorium-7"]);
  assert.match(t.text(neu), /- Blatt 1/);
});

test("In ILIAS in zwei Gruppen desselben Moduls: eine Notiz (die frühere in der Woche), eine schon vorhandene zweite geht in ihr auf", async () => {
  const P1I = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 1 (ILIAS).md", P7I = "Stundenplan/Do 08.15 X100 Tutorium Gruppe 7 (ILIAS).md";
  const beide = [{ refId: "17", g: T7 }, { refId: "11", g: T1 }], mitglieder = new Set(["11", "17"]);
  const protokoll = [];
  const t = notizenIo();
  t.io.protokoll = (e) => protokoll.push(e);
  await M.iliasAbgleichen(t.io, beide, mitglieder, {});
  assert.deepEqual(t.pfade(), [P1I]);
  assert.deepEqual(protokoll, [{ art: "ilias", bleibt: "ws-2026-27-x100-tutorium-1", weg: ["ws-2026-27-x100-tutorium-7"] }], "nur im Protokoll des Geräts");
  assert.deepEqual((await M.iliasAbgleichen(t.io, beide, mitglieder, {})).angelegt, [], "der nächste Lauf legt die zweite nicht an");
  // aus einer älteren Fassung liegen schon beide da, in der zweiten dein Text: er wandert in die eine
  const u = notizenIo({ [P1I]: M.notizText("", T1, { herkunft: M.ILIAS, iliasGruppe: "11" }), [P7I]: mitText(M.notizText("", T7, { herkunft: M.ILIAS, iliasGruppe: "17" }), "Blatt 2") });
  const b = await M.iliasAbgleichen(u.io, beide, mitglieder, { heute: "2026-10-19" });
  assert.deepEqual([u.pfade(), b.gewichen, u.papierkorb], [[P1I], [P7I], [P7I]]);
  assert.match(u.text(P1I), /- Blatt 2/);
  // deckt eine andere Notiz (Alma) eine der beiden zur selben Zeit, gilt diese: keine ILIAS-Notiz daneben
  const v = notizenIo({ "Stundenplan/Do 08.15 X100 Tutorium.md": notiz(Object.assign({}, ALMA, { art: "Tutorium", wochentag: 4, beginn: "08:15", ende: "09:45" })) });
  await M.iliasAbgleichen(v.io, beide, mitglieder, {});
  assert.deepEqual(v.pfade(), ["Stundenplan/Do 08.15 X100 Tutorium.md"]);
});

test("Doppelte Gruppen: es gilt ILIAS, dann die jüngere Wahl, dann die zur Gruppenliste passende, dann die frühere; zusammengeführt wird immer", async () => {
  const gw = (x, am, text) => { const s = M.notizText("", x, { herkunft: M.GEWAEHLT, gewaehltAm: am }); return text ? mitText(s, text) : s; };
  const IL = "Stundenplan/Do 08.15 X100 Tutorium Gruppe 7 (ILIAS).md";
  // ILIAS vor deiner Wahl, auch vor einer jüngeren
  const a = notizenIo({ [P1]: gw(T1, "2026-10-19T09:00:00.000Z", "Frage A"), [IL]: M.notizText("", T7, { herkunft: M.ILIAS, iliasGruppe: "17" }) });
  assert.deepEqual(M.doppelt(a.io.notizen()).verdeckt, { [P1]: IL });
  assert.deepEqual(await M.gewaehltAufraeumen(a.io, "2026-10-19"), [P1]);
  assert.match(a.text(IL), /- Frage A/);
  // die jüngere Wahl vor der älteren; eine Wahl ohne Zeitpunkt (ältere Fassung) ist die ältere
  const t = notizenIo({ [P1]: gw(T1, "2026-10-19T09:00:00.000Z", "Frage A"), [P7]: gw(T7, "2026-10-19T11:00:00.000Z") });
  const protokoll = [];
  t.io.protokoll = (e) => protokoll.push(e);
  assert.deepEqual(M.doppelt(t.io.notizen()).faelle.map((f) => [f.zeigen, f.andere]), [[P7, [P1]]]);
  assert.deepEqual(await M.gewaehltAufraeumen(t.io, "2026-10-19"), [P1]);
  assert.deepEqual([t.pfade(), t.papierkorb], [[P7], [P1]], "die andere im Papierkorb, nicht gelöscht");
  assert.match(t.text(P7), /Aus der Notiz zu deiner Gruppe übernommen \(19\.10\.2026\):\n\n- Frage A/);
  assert.deepEqual(protokoll, [{ art: "gewaehlt", bleibt: P7, weg: [P1], grund: "Reihenfolge" }]);
  assert.deepEqual(await M.gewaehltAufraeumen(t.io, "2026-10-19"), [], "einmal");
  assert.deepEqual(M.doppelt(notizenIo({ [P1]: gw(T1, ""), [P7]: gw(T7, "2026-10-19T08:00:00.000Z") }).io.notizen()).faelle[0].zeigen, P7);
  // gleich alt: die zur aktuellen Gruppenliste passt (T1 hat dort jetzt eine andere Zeit), sonst die frühere in der Woche
  const u = notizenIo({ [P7]: gw(T7, ""), [P1]: gw(T1, "") });
  assert.deepEqual(M.doppelt(u.io.notizen()).verdeckt, { [P7]: P1 });
  assert.deepEqual(M.doppelt(u.io.notizen(), [Object.assign({}, T1, { tag: "Mi" }), T7]).verdeckt, { [P1]: P7 });
  assert.deepEqual(await M.gewaehltAufraeumen(u.io, "2026-10-19", { liste: [Object.assign({}, T1, { tag: "Mi" }), T7] }), [P1]);
  assert.deepEqual(u.pfade(), [P7]);
  // zwei ILIAS-Notizen fasst nur ilias.js an (ein Schreiber); die Woche zeigt eine
  const w = notizenIo({ [IL]: M.notizText("", T7, { herkunft: M.ILIAS, iliasGruppe: "17" }), "Stundenplan/Di 10.15 X100 Tutorium Gruppe 1 (ILIAS).md": M.notizText("", T1, { herkunft: M.ILIAS, iliasGruppe: "11" }) });
  assert.deepEqual(M.doppelt(w.io.notizen()).verdeckt, { [IL]: "Stundenplan/Di 10.15 X100 Tutorium Gruppe 1 (ILIAS).md" });
  assert.deepEqual(await M.gewaehltAufraeumen(w.io, "2026-10-19"), []);
  // eine Notiz derselben Gruppe zur selben Zeit (Alma): die Gruppen-Notiz ist verdeckt; eine Übung zu anderer Zeit (etwa für
  // alle) zählt nicht, entfallene und andere Arten auch nicht
  const v = notizenIo({ [P1]: gw(T1, ""), "Stundenplan/Di 10.15 X100 Tutorium.md": notiz(Object.assign({}, ALMA, { art: "Tutorium", beginn: "10:15" })),
    "Stundenplan/Fr 10.15 X100 Tutorium.md": notiz(Object.assign({}, ALMA, { art: "Tutorium", wochentag: 5 })),
    "Stundenplan/Mi 08.15 X100 Übung (ILIAS).md": M.notizText("", g({ id: "u", art: "Übung", tag: "Mi" }), { herkunft: M.ILIAS, iliasGruppe: "9" }),
    [P7]: gw(T7, "").replace("tags:", "entfaellt: true\ntags:") });
  const dv = M.doppelt(v.io.notizen());
  assert.deepEqual([dv.verdeckt, dv.faelle], [{ [P1]: "Stundenplan/Di 10.15 X100 Tutorium.md" }, []]);
  // stabil: ein zweites Schreiben ändert den Zeitpunkt nicht, eine ILIAS-Notiz trägt keinen
  const s = gw(T1, "2026-10-19T09:00:00.000Z");
  assert.equal(M.notizText(s, T1, { herkunft: M.GEWAEHLT }), s);
  assert.doesNotMatch(M.notizText(s, T1, { herkunft: M.ILIAS, iliasGruppe: "11" }), /gewaehlt_am/);
});

test("Gewählte Notiz folgt der Gruppenliste (nur mit aktualisieren): Tag, Zeit, Raum und Name ziehen mit, dein Text bleibt", async () => {
  const P5 = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (gewählt).md", P5NEU = "Stundenplan/Do 14.15 X100 Tutorium Gruppe 5 (gewählt).md";
  const AM = "2026-10-19T09:00:00.000Z";
  const alt = mitText(M.notizText("", g(), { herkunft: M.GEWAEHLT, modulLink: "[[X100 Beispiel]]", kurz: "Beispielökonomik", gewaehltAm: AM }), "meine Frage");
  const verlegt = g({ tag: "Do", von: "14:00", bis: "16:00", raum: "Hörsaal 22 (Beispielbau)" });
  const modul = () => ({ name: "X100 Beispiel", titel: "Beispielökonomik" });
  const a = notizenIo({ [P5]: alt });
  assert.deepEqual(await M.gewaehltAufraeumen(a.io, "2026-10-24", { liste: [verlegt], modul }), []);
  assert.equal(a.text(P5), alt, "ohne aktualisieren (jedes andere Gerät): nichts");
  const b = notizenIo({ [P5]: alt });
  assert.deepEqual(await M.gewaehltAufraeumen(b.io, "2026-10-24", { liste: [verlegt], aktualisieren: true, modul }), []);
  assert.deepEqual(b.pfade(), [P5NEU]);
  const fm = b.fm(P5NEU);
  assert.deepEqual([fm.wochentag, fm.tag, fm.beginn, fm.ende, fm.raum, fm.gewaehlt_am, fm.modul, fm.titel],
    [4, "Do", "14:15", "15:45", "Hörsaal 22 (Beispielbau)", AM, "[[X100 Beispiel]]", "Beispielökonomik · Tutorium Gruppe 5"]);
  assert.match(b.text(P5NEU), /^Donnerstags, 14:15–15:45 · Hörsaal 22 \(Beispielbau\)$/m);
  assert.match(b.text(P5NEU), /- meine Frage/);
  const fertig = b.text(P5NEU);
  await M.gewaehltAufraeumen(b.io, "2026-10-24", { liste: [verlegt], aktualisieren: true, modul });
  assert.deepEqual([b.pfade(), b.text(P5NEU)], [[P5NEU], fertig], "zweiter Lauf: nichts zu tun");
  // ohne Modulnotiz bleiben Link und Kurztitel, ein Name aus ILIAS (freigegebene Notiz) bleibt
  const c = notizenIo({ "Stundenplan/Di 10.15 X100 Tutorium Gruppe 4 (gewählt).md": M.notizText("", g(), { herkunft: M.GEWAEHLT, name: "Gruppe 4", modulLink: "[[X100 Beispiel]]", kurz: "Beispielökonomik" }) });
  await M.gewaehltAufraeumen(c.io, "2026-10-24", { liste: [g({ raum: "Hörsaal 9" })], aktualisieren: true, modul: () => null });
  const fc = c.fm("Stundenplan/Di 10.15 X100 Tutorium Gruppe 4 (gewählt).md");
  assert.deepEqual([fc.raum, fc.gruppe, fc.modul, fc.titel], ["Hörsaal 9", "Gruppe 4", "[[X100 Beispiel]]", "Beispielökonomik · Tutorium Gruppe 4"]);
});

test("Gewählte Notiz, deren Gruppe aus der Liste fällt: „(entfällt)“ statt Papierkorb, zurück, sobald sie wieder da ist", async () => {
  const P5 = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (gewählt).md", P2 = "Stundenplan/Mi 08.15 Y200 Übung Gruppe 2 (gewählt).md";
  const g5 = mitText(M.notizText("", g(), { herkunft: M.GEWAEHLT, kurz: "Beispielökonomik" }), "meine Frage");
  const andere = g({ id: "ws-2026-27-z300-uebung-1", code: "Z300", art: "Übung", gruppe: "1", tag: "Mi", von: "08:00", bis: "10:00" });
  const STAND = "2026-10-20";
  const t = notizenIo({ [P5]: g5 });
  await M.gewaehltAufraeumen(t.io, "2026-10-24", { liste: [andere], stand: STAND, aktualisieren: true });
  assert.deepEqual([t.pfade(), t.papierkorb], [[P5], []]);
  assert.deepEqual([t.fm(P5).entfaellt, t.fm(P5).titel], [true, "Beispielökonomik · Tutorium Gruppe 5 (entfällt)"]);
  assert.match(t.text(P5), /- meine Frage/);
  const einmal = t.text(P5);
  await M.gewaehltAufraeumen(t.io, "2026-10-24", { liste: [andere], stand: STAND, aktualisieren: true });
  assert.equal(t.text(P5), einmal, "schon entfallen: nicht noch einmal");
  await M.gewaehltAufraeumen(t.io, "2026-10-24", { liste: [andere, g()], stand: STAND, aktualisieren: true, modul: () => ({ name: "X100 Beispiel", titel: "Beispielökonomik" }) });
  assert.deepEqual([t.fm(P5).entfaellt, t.fm(P5).titel], [undefined, "Beispielökonomik · Tutorium Gruppe 5"], "Gruppe wieder da");
  assert.match(t.text(P5), /- meine Frage/);
  // ohne Liste, ein Semester, das die Liste nicht nennt, oder mehr als die Hälfte auf einmal weg (kaputte Liste): nichts
  const g2 = M.notizText("", LISTE[4], { herkunft: M.GEWAEHLT });
  for (const [liste, grund] of [[null, "ohne Liste"], [[g({ semester: "SS 2027", id: "ss-2027-x100-tutorium-5" })], "anderes Semester"], [[andere], "beide weg"]]) {
    const u = notizenIo({ [P5]: g5, [P2]: g2 });
    await M.gewaehltAufraeumen(u.io, "2026-10-24", { liste, stand: STAND, aktualisieren: true });
    assert.deepEqual([u.text(P5), u.text(P2)], [g5, g2], grund);
  }
  // halb synchronisierte Freigabe (ILIAS-Notiz und ihre gewählte Fassung zugleich da): die gewählte bleibt unverändert
  const IL = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (ILIAS).md", il = M.notizText("", g(), { herkunft: M.ILIAS, iliasGruppe: "9" });
  const f = notizenIo({ [IL]: il });
  const [frei] = await M.iliasFreigeben(f.io);
  const v = notizenIo({ [IL]: il, [frei]: f.text(frei) });
  await M.gewaehltAufraeumen(v.io, "2026-10-24", { liste: [andere], stand: STAND, aktualisieren: true });
  assert.deepEqual([v.pfade(), v.text(frei)], [[IL, frei].sort(), f.text(frei)]);
});

test("Gewählte Notiz und Gruppenliste: dein Ausfall und dein Name bleiben, eine neuere Wahl als die Liste entfällt nicht", async () => {
  const P5 = "Stundenplan/Di 10.15 X100 Tutorium Gruppe 5 (gewählt).md";
  const basis = M.notizText("", g(), { herkunft: M.GEWAEHLT, kurz: "Beispielökonomik", gewaehltAm: "2026-10-19T09:00:00.000Z" });
  const mitAusfall = basis.replace("ausfall: []\neinzeltermin: false", "ausfall:\n  - 2026-11-03\neinzeltermin: true");
  // nichts aus der Liste geändert: kein Schreiben, dein Ausfall bleibt
  const a = notizenIo({ [P5]: mitAusfall });
  await M.gewaehltAufraeumen(a.io, "2026-10-24", { liste: [g()], stand: "2026-10-20", aktualisieren: true });
  assert.equal(a.text(P5), mitAusfall, "gleiche Felder: nichts geschrieben");
  // Raum verlegt: der Raum zieht mit, Ausfall und Einzeltermin bleiben
  await M.gewaehltAufraeumen(a.io, "2026-10-24", { liste: [g({ raum: "Hörsaal 9" })], stand: "2026-10-20", aktualisieren: true });
  assert.deepEqual([a.fm(P5).raum, a.fm(P5).ausfall, a.fm(P5).einzeltermin], ["Hörsaal 9", ["2026-11-03"], true]);
  // eine andere Gruppe (neue Wahl) beginnt ohne die Ausfälle der alten
  assert.match(M.notizText(mitAusfall, LISTE[1], { herkunft: M.GEWAEHLT }), /^ausfall: \[\]\neinzeltermin: false$/m);
  // von dir umbenannt: der Name bleibt, die Felder ziehen trotzdem mit
  const EIGEN = "Stundenplan/Mein Tutorium.md";
  const b = notizenIo({ [EIGEN]: basis });
  await M.gewaehltAufraeumen(b.io, "2026-10-24", { liste: [g({ tag: "Do" })], stand: "2026-10-20", aktualisieren: true });
  assert.deepEqual([b.pfade(), b.fm(EIGEN).tag], [[EIGEN], "Do"]);
  // erzeugter Name eines früheren Stands (älterer Name aus ILIAS) folgt dagegen
  const c = notizenIo({ [P5]: basis });
  await M.gewaehltAufraeumen(c.io, "2026-10-24", { liste: [g({ tag: "Do" })], stand: "2026-10-20", aktualisieren: true });
  assert.deepEqual(c.pfade(), ["Stundenplan/Do 10.15 X100 Tutorium Gruppe 5 (gewählt).md"]);
  // nach dem Stand der Liste gewählt (das Gerät der Wahl hatte eine neuere): fehlt nur hier, entfällt nicht
  const andere = g({ id: "ws-2026-27-z300-uebung-1", code: "Z300", art: "Übung" });
  for (const [stand, entfaellt] of [["2026-10-17", undefined], ["", undefined], ["2026-10-19", true], ["2026-10-22", true]]) {
    const d = notizenIo({ [P5]: basis });
    await M.gewaehltAufraeumen(d.io, "2026-10-24", { liste: [andere], stand, aktualisieren: true });
    assert.equal(d.fm(P5).entfaellt, entfaellt, "Stand " + (stand || "fehlt"));
  }
});

test("Alma-Notiz einer anderen Gruppe deines Kurses: deine Gruppe gilt, die Alma-Notiz ist verdeckt (nur mit Gruppenliste)", async () => {
  // Alma-Abo mit Tutorium 1 (Alma: „Übung zu …“, Art Übung, Zeit wie in Alma), deine Gruppe ist Tutorium 7
  const Y2 = g({ id: "ws-2026-27-y200-tutorium-2", code: "Y200", gruppe: "2", tag: "Di", von: "10:00", bis: "12:00" });
  const Y3 = g({ id: "ws-2026-27-y200-tutorium-3", code: "Y200", gruppe: "3", tag: "Mi", von: "14:00", bis: "16:00" });
  const LI = [T1, T7, Y2, Y3];
  const AL1 = "Stundenplan/Di 10.00 X100 Übung.md", IL7 = "Stundenplan/Do 08.15 X100 Tutorium Gruppe 7 (ILIAS).md";
  const alma = (fm) => notiz(Object.assign({}, ALMA, { beginn: "10:00", ende: "12:00", herkunft: "alma" }, fm));
  const il7 = M.notizText("", T7, { herkunft: M.ILIAS, iliasGruppe: "17" });
  const a = notizenIo({ [AL1]: alma(), [IL7]: il7 });
  assert.deepEqual(M.doppelt(a.io.notizen(), LI), { verdeckt: { [AL1]: IL7 }, faelle: [] }, "nie in faelle: das Aufräumen fasst Alma nie an");
  assert.deepEqual(M.doppelt(a.io.notizen()).verdeckt, {}, "ohne Gruppenliste bleibt sie");
  assert.deepEqual(M.doppelt(notizenIo({ [AL1]: alma(), [P7]: M.notizText("", T7, { herkunft: M.GEWAEHLT }) }).io.notizen(), LI).verdeckt, { [AL1]: P7 }, "neben deiner Wahl ebenso");
  // Alma liefert deine Gruppe selbst (gleiche Zeit): Die Gruppen-Notiz weicht wie bisher, die Alma-Notiz bleibt
  assert.deepEqual(M.doppelt(notizenIo({ [AL1]: alma(), [P1]: M.notizText("", T1, { herkunft: M.GEWAEHLT }) }).io.notizen(), LI).verdeckt, { [P1]: AL1 });
  // bleiben: eine Notiz von Hand zur Zeit von Tutorium 1, eine Übung für alle (nicht in der Liste), die Gruppe eines Kurses ohne deine
  const b = notizenIo({ [IL7]: il7, [AL1]: notiz(Object.assign({}, ALMA, { beginn: "10:00", ende: "12:00" })),
    "Stundenplan/Mo 14.00 X100 Übungsteil.md": alma({ art: "Übungsteil", wochentag: 1, beginn: "14:00", ende: "16:00" }),
    "Stundenplan/Mi 14.00 Y200 Übung.md": alma({ code: "Y200", wochentag: 3, beginn: "14:00", ende: "16:00" }) });
  assert.deepEqual(M.doppelt(b.io.notizen(), LI).verdeckt, {});
});
