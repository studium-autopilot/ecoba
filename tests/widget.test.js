// Widgets für iPhone und iPad (widget.js): Daten für Scriptable aus dem Fachmodell (Woche wie das Wochenraster, Fristen wie das
// Dashboard, nächste Prüfungen), Farben gleich den Designs (CSS), der Zeichner in einem Nachbau von Scriptable für jede Art und
// Größe, hell und dunkel, der Lader zum Kopieren und das Schreiben nur auf iPhone und iPad und nur bei Änderungen.
// Nur ausgedachte Daten (Codes X100 …). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden, json } = require("./laden.js");
const SC = require("./scriptable-attrappe.js");

const SNIPPETS = path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "snippets");
const lv = (pfad, fm) => ({ ["Stundenplan/" + pfad + ".md"]: Object.assign({ typ: "lehrveranstaltung", semester: "WS 2026/27", raum: "Hörsaal 1", von: "2026-10-12", bis: "2027-02-05" }, fm) });
const termin = (datum, titel, o) => ({ ["Termine/" + datum + " " + titel + ".md"]: Object.assign({ typ: "termin", titel, datum, status: "offiziell", erledigt: false }, o) });
const NOTIZEN = Object.assign({},
  lv("Mo X100 Vorlesung", { titel: "Beispielmathematik", code: "X100", art: "Vorlesung", wochentag: 1, beginn: "10:15", ende: "11:45" }),
  lv("Di X100 Übung", { titel: "Beispielmathematik · Übung", code: "X100", art: "Übung", gruppe: "2", wochentag: 2, beginn: "14:15", ende: "15:45", raum: "Raum 036" }),
  lv("Di X110 Vorlesung", { titel: "Beispieldatenanalyse", code: "X110", art: "Vorlesung", wochentag: 2, beginn: "10:00", ende: "12:00", raum: "per Zoom" }),
  lv("Di X120 Vorlesung", { titel: "Beispielökonomik", code: "X120", art: "Vorlesung", wochentag: 2, beginn: "10:15", ende: "11:45", raum: "Hörsaal 9" }),
  lv("Do X130 Vorlesung", { titel: "Beispielrecht", code: "X130", art: "Vorlesung", wochentag: 4, beginn: "08:15", ende: "09:45", ausfall: ["2026-10-22"] }),
  lv("Fr X140 Tutorium", { titel: "Beispielabschluss · Tutorium", code: "X140", art: "Tutorium", wochentag: 5, beginn: "12:15", ende: "13:45", von: "2026-11-06" }),
  termin("2026-10-23", "Rückmeldung zum Sommersemester", { kategorie: "Frist" }),
  termin("2026-10-21", "Abgabe Essay", { kategorie: "Frist", ort: "bis 17:00 Uhr" }),
  termin("2027-02-10", "Klausur X100", { kategorie: "Prüfung", code: "X100" }),
  termin("2027-02-15", "Klausur X110", { kategorie: "Prüfung", code: "X110" }),
  termin("2026-12-01", "Zwischentest X120", { kategorie: "Prüfung", code: "X120" }),
);
const EINGABEN = { notizen: Object.keys(NOTIZEN).filter((p) => p.indexOf("Stundenplan/") === 0).map((pfad) => ({ pfad, fm: NOTIZEN[pfad] })),
  kurzVonCode: { X100: "Mathe" }, modulPfad: {}, modulName: { X100: "Beispielmathematik" }, verdeckt: null, ohneBeginn: false };

const umgebung = (heute) => {
  const M = laden("modell", { heute, notizen: NOTIZEN, frontmatter: { "System/Daten/Semester.md": json("semester.json"), "System/Einstellungen.md": {} } }).ctx.modell;
  const W = laden("woche", { heute, kontext: { modell: M } }).ergebnis;
  const D = laden("dashboard", { heute, kontext: { modell: M } }).ergebnis;
  const G = laden("widget", { heute, kontext: { modell: M } }).ergebnis;
  return { M, W, D, G };
};
const daten = (jetzt, o = {}) => {
  const U = umgebung(jetzt.slice(0, 10));
  return U.G.datenBauen(Object.assign({ W: U.W, D: U.D, M: U.M, eingaben: EINGABEN, jetzt: new Date(jetzt), tresor: "Studium Autopilot", design: "elfenbein", modus: "automatisch" }, o));
};

test("Daten: Planwoche und zwei Wochen danach, Sitzungen mit Tag, Zeit, Farbe des Moduls, Ausfall, online und „ab“", () => {
  const d = daten("2026-10-20T09:00:00");
  assert.equal(d.format, 1);
  assert.deepEqual(d.wochen.map((w) => w.mo), ["2026-10-19", "2026-10-26", "2026-11-02"]);
  const w = d.wochen[0], s = (kurz, tag) => w.sitzungen.find((x) => x.kurz === kurz && (!tag || x.tag === tag));
  assert.equal(w.kw, 43);
  assert.deepEqual(w.sitzungen.map((x) => x.tag + " " + x.beginn), ["2026-10-19 10:15", "2026-10-20 10:00", "2026-10-20 10:15", "2026-10-20 14:15", "2026-10-22 08:15", "2026-10-23 12:15"],
    "nach Tag und Beginn");
  assert.deepEqual([s("Mathe", "2026-10-19").farbe, s("X110").farbe, s("X120").farbe], [1, 2, 3], "Farbe je Modul wie im Raster (Code sortiert)");
  assert.equal(s("Mathe", "2026-10-20").art, "Übung Gruppe 2");
  assert.equal(s("Mathe", "2026-10-20").ue, true);
  assert.equal(s("X110").online, true);
  assert.deepEqual([s("X130").aus, s("X130").ausnahme, s("X130").marke], [true, true, "Fällt aus"]);
  assert.deepEqual([s("X140").spaeter, s("X140").marke], [true, "ab 06.11."]);
  assert.equal(s("X140", "2026-10-23").ende, "13:45");
  assert.deepEqual([s("X120").raum, s("X120").raumKnapp], ["Hörsaal 9", "HS 9"], "Raum knapp wie im Raster der App (raumKnapp)");
  assert.equal(w.legende, undefined, "keine Legende: jeder Kasten nennt sein Modul");
  assert.equal(d.wochen[1].sitzungen.find((x) => x.kurz === "X130").aus, false, "der Ausfall gilt nur an seinem Tag");
});

test("Daten: Samstag zeigt die nächste Woche zuerst, wie das Raster", () => {
  assert.equal(daten("2026-10-24T12:00:00").wochen[0].mo, "2026-10-26");
});

test("Daten: Fristen wie „Fristen · 30 Tage“ mit Art und Tag, nächste Frist, nächste Prüfungen ohne Zwischentest", () => {
  const d = daten("2026-10-20T09:00:00");
  assert.deepEqual(d.fristen.map((f) => [f.art, f.tag, f.was]), [["frist", "2026-10-21", "Abgabe Essay"], ["frist", "2026-10-23", "Rückmeldung zum Sommersemester"]]);
  assert.equal(d.fristen[0].uhr, "17:00");
  assert.equal(d.naechsteFristen[0].was, "Abgabe Essay");
  assert.deepEqual(d.pruefungen.map((p) => p.tag + " " + p.was), ["2027-02-10 Klausur X100", "2027-02-15 Klausur X110"]);
  assert.deepEqual(d.seiten, laden("widget").ergebnis.SEITEN);
  for (const s of Object.values(d.seiten)) assert.ok(fs.existsSync(path.join(__dirname, "..", "Studium Autopilot", s)), "Seite fehlt: " + s);
});

test("Gleich ist gleich: ohne den Zeitpunkt vergleichen", () => {
  const { G } = umgebung("2026-10-20");
  const a = JSON.stringify(daten("2026-10-20T09:00:00"), null, 1), b = JSON.stringify(daten("2026-10-20T09:40:00"), null, 1);
  assert.notEqual(a, b);
  assert.equal(G.ohneStand(a), G.ohneStand(b));
});

// ---------- Farben ----------
const cssBlock = (datei, kopf) => {
  const t = fs.readFileSync(path.join(SNIPPETS, datei), "utf8"), i = t.indexOf(kopf + " {");
  assert.ok(i >= 0, "Block fehlt: " + kopf);
  return t.slice(i, t.indexOf("\n}", i));
};
// Wert einer Variablen (Farbe oder Prozent); Kommentare wie „--eba-modul-ton: Fläche einer Vorlesung“ zählen nicht
const wert = (block, name) => { const m = block.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6}|[0-9.]+%)\\s*;")); return m ? m[1] : null; };

test("Farben des Zeichners = Farben der Designs (hell und dunkel je Design, Modulfarben; Töne sind eigene des Widgets)", () => {
  const quelle = laden("widget").ergebnis.scriptable.toString();
  const KERN = cssBlock("eba-core.css", "body");
  const OHNE = ":not([class*=\"eba-design-\"])";
  const HELL = { elfenbein: cssBlock("eba-paper-elfenbein.css", ".theme-light" + OHNE),
    flieder: cssBlock("eba-flieder.css", ".eba-design-flieder.theme-light"), klar: cssBlock("eba-klar.css", ".eba-design-klar.theme-light") };
  // dunkel seit 01.11.2026 je Design (bis dahin für alle die Farben von Elfenbein)
  const DUNKEL = { elfenbein: cssBlock("eba-paper-elfenbein.css", ".theme-dark" + OHNE),
    flieder: cssBlock("eba-flieder.css", ".eba-design-flieder.theme-dark"), klar: cssBlock("eba-klar.css", ".eba-design-klar.theme-dark") };
  const NAMEN = { bg: "eba-bg", karte: "eba-card-bg", rand: "eba-border", text: "eba-text", muted: "eba-muted", faint: "eba-faint", akzentText: "eba-accent-text",
    warn: "eba-warn", bad: "eba-bad", info: "eba-info" };
  const hz = quelle.slice(quelle.indexOf("const HELL"), quelle.indexOf("const MODUL_HELL"));
  const dz = quelle.slice(quelle.indexOf("const DUNKEL"), quelle.indexOf("const MODUL_DUNKEL"));
  for (const [modus, BLOCK, teil] of [["hell", HELL, hz], ["dunkel", DUNKEL, dz]]) {
    for (const d of Object.keys(BLOCK)) {
      const zeile = teil.split("\n").map((z, i, a) => (z.trim().indexOf(d + ": {") === 0 ? z + a[i + 1] : "")).filter(Boolean)[0];
      assert.ok(zeile, "Design fehlt im Zeichner: " + modus + " " + d);
      for (const k of Object.keys(NAMEN)) {
        assert.ok(zeile.indexOf(k + ": \"" + wert(BLOCK[d], NAMEN[k]) + "\"") >= 0, modus + " " + d + " " + k + " ≠ " + wert(BLOCK[d], NAMEN[k]));
      }
      for (let n = 1; n <= 6; n++) {
        const eigen = wert(BLOCK[d], "eba-modul-" + n);
        if (eigen) assert.ok(zeile.indexOf(n + ": \"" + eigen + "\"") >= 0, modus + " " + d + " Modulfarbe " + n);
      }
    }
  }
  const hellModul = [1, 2, 3, 4, 5, 6].map((n) => "\"" + wert(KERN, "eba-modul-" + n) + "\"").join(", ");
  assert.ok(quelle.indexOf("MODUL_HELL = [" + hellModul + "]") >= 0, "Modulfarben hell");
  const ALLE = cssBlock("eba-paper-elfenbein.css", ".theme-dark");
  const dunkelModul = [1, 2, 3, 4, 5, 6].map((n) => "\"" + wert(ALLE, "eba-modul-" + n) + "\"").join(", ");
  assert.ok(quelle.indexOf("MODUL_DUNKEL = [" + dunkelModul + "]") >= 0, "Modulfarben dunkel");
});

// ---------- Zeichner im Nachbau von Scriptable ----------
const ORDNER = "/Tresor/.obsidian/plugins/studium-autopilot";
const zeichner = () => new Function("return " + laden("widget").ergebnis.scriptable.toString())(); // eigener Bereich: nichts aus widget.js
const zeichnen = async (d, o = {}) => {
  const dateien = {};
  if (d) dateien[ORDNER + "/widget-" + (o.pad ? "ipad" : "iphone") + ".json"] = JSON.stringify(d);
  return zeichner()({ ListWidget: SC.ListWidget, Color: SC.Color, Font: SC.Font, Size: SC.Size, SFSymbol: SC.SFSymbol, Device: SC.geraet(!!o.pad),
    config: { widgetFamily: o.familie, runsInWidget: true }, args: { widgetParameter: o.parameter || null }, fm: SC.dateien(dateien), ordner: ORDNER,
    jetzt: new Date(o.jetzt || "2026-10-20T09:00:00") });
};
const texte = (k) => (k.art === "text" ? [k.s] : (k.kinder || []).reduce((a, x) => a.concat(texte(x)), []));
const symbole = (k) => (k.art === "bild" ? [k.symbol] : (k.kinder || []).reduce((a, x) => a.concat(symbole(x)), []));
const GROESSEN = ["small", "medium", "large", "extraLarge", "accessoryRectangular", "accessoryInline", "accessoryCircular"];

test("Zeichner: jede Art in jeder Größe, jedes Design, hell, dunkel, automatisch; wann er neu zeichnen soll", async () => {
  for (const design of ["elfenbein", "flieder", "klar"]) {
    for (const modus of ["hell", "dunkel", "automatisch"]) {
      const d = daten("2026-10-20T09:00:00", { design, modus });
      for (const parameter of [null, "fristen", "Fristen", "pruefung", "Prüfung", "Prüfungen"]) {
        for (const familie of GROESSEN) {
          const w = await zeichnen(d, { parameter, familie, pad: familie === "extraLarge" });
          assert.ok(texte(w).length, [design, modus, parameter, familie].join(" "));
          assert.ok(w.refreshAfterDate instanceof Date);
        }
      }
    }
  }
  const neu = async (jetzt) => (await zeichnen(daten("2026-10-20T09:00:00"), { familie: "small", jetzt })).refreshAfterDate.getTime();
  assert.equal(await neu("2026-10-20T09:45:00"), new Date("2026-10-20T10:00:00").getTime(), "neu, wenn die nächste Sitzung beginnt");
  assert.equal(await neu("2026-10-20T09:00:00"), new Date("2026-10-20T09:30:00").getTime(), "spätestens nach 30 Minuten");
  assert.equal(await neu("2026-10-24T13:00:00"), new Date("2026-10-24T13:30:00").getTime(), "auch an einem freien Tag, nicht erst um Mitternacht");
  assert.equal(await neu("2026-10-20T09:58:00"), new Date("2026-10-20T10:03:00").getTime(), "frühestens nach 5 Minuten");
});

test("Stundenplan klein: Als Nächstes in der Farbe des Moduls, mit Abstand, Ort und online; jetzt mit Balken und Restzeit", async () => {
  const d = daten("2026-10-20T09:00:00");
  let w = await zeichnen(d, { familie: "small" }), t = texte(w);
  assert.deepEqual(t.slice(0, 2), ["In 1 Std.", "X110"]);
  assert.ok(t.indexOf("10:00 – 12:00") >= 0 && t.indexOf("per Zoom") >= 0);
  assert.notEqual(w.backgroundColor.hell, "#faf6ee", "getönt in der Modulfarbe, nicht der Grund des Designs");
  t = texte(await zeichnen(d, { familie: "small", jetzt: "2026-10-20T11:00:00" }));
  assert.deepEqual([t[0], t.indexOf("noch 1 Std.") >= 0], ["Jetzt", true]);
  t = texte(await zeichnen(d, { familie: "small", jetzt: "2026-10-20T16:00:00" }));
  assert.deepEqual(t.slice(0, 2), ["Mo, 26. Okt.", "Mathe"], "nie der Ausfall am Donnerstag, nie das Tutorium, das erst im November beginnt");
});

test("Stundenplan mittel: der Tag mit Uhrzeiten, Ausfall sichtbar; groß: die Woche mit Kopf, Tagen und knappem Raum", async () => {
  const d = daten("2026-10-20T09:00:00");
  let t = texte(await zeichnen(d, { familie: "medium" }));
  assert.deepEqual(t.slice(0, 3), ["Heute", "20", "Dienstag"]);
  assert.ok(t.indexOf("X110") >= 0 && t.indexOf("und 1 weitere") < 0, "drei Sitzungen passen");
  t = texte(await zeichnen(d, { familie: "medium", jetzt: "2026-10-21T18:00:00" }));
  assert.deepEqual(t.slice(0, 2), ["Morgen", "22"], "Mittwochabend: Donnerstag, auch wenn dort nur etwas ausfällt");
  assert.ok(t.indexOf("X130") >= 0 && t.indexOf("Fällt aus") >= 0, "der Ausfall steht da");
  t = texte(await zeichnen(d, { familie: "large" }));
  assert.equal(t[0], "Diese Woche");
  assert.match(t[1], /^Vorlesungswoche \d+ von \d+$/);
  assert.equal(t[2], "KW 43");
  assert.ok(["Mo", "19", "Di", "20", "Fr", "23"].every((x) => t.indexOf(x) >= 0));
  assert.ok(["Mathe", "X110", "X120", "per Zoom", "HS 9"].every((x) => t.indexOf(x) >= 0), "jeder Kasten mit Modul und Raum, knapp wie im Raster");
  assert.ok(t.indexOf("Hörsaal 9") < 0 && t.indexOf("online") < 0, "keine Legende, kein langer Raum");
  t = texte(await zeichnen(d, { familie: "large", jetzt: "2026-10-24T09:00:00" }));
  assert.equal(t[0], "Nächste Woche");
  t = texte(await zeichnen(d, { familie: "large", jetzt: "2026-10-23T18:00:00" }));
  assert.equal(t[0], "Nächste Woche", "Freitagabend: in dieser Woche kommt nichts mehr");
});

test("Fristen und Prüfungen: Kachel, Liste, Tage bis zur Prüfung; Vorbeiges fällt weg, auch ohne neues Öffnen", async () => {
  const d = daten("2026-10-20T09:00:00");
  let t = texte(await zeichnen(d, { familie: "small", parameter: "fristen" }));
  assert.deepEqual(t, ["morgen", "Abgabe Essay", "Mittwoch, 21. Okt."]);
  t = texte(await zeichnen(Object.assign({}, d, { naechsteFristen: [] }), { familie: "small", parameter: "fristen", jetzt: "2026-10-22T09:00:00" }));
  assert.deepEqual(t.slice(0, 2), ["morgen", "Rückmeldung zum Sommersemester"], "kurze Liste aufgebraucht: aus der 30-Tage-Liste");
  t = texte(await zeichnen(d, { familie: "medium", parameter: "fristen", jetzt: "2026-10-22T09:00:00" }));
  assert.deepEqual(t, ["Fristen", "30 Tage", "Fr", "23", "Rückmeldung zum Sommersemester", "morgen"]);
  t = texte(await zeichnen(d, { familie: "small", parameter: "pruefung" }));
  assert.deepEqual(t, ["113", "Tage", "Klausur X100", "Mi, 10. Feb."]);
  t = texte(await zeichnen(d, { familie: "medium", parameter: "pruefung", jetzt: "2027-02-11T09:00:00" }));
  assert.deepEqual(t.slice(0, 6), ["Prüfungen", "Feb.", "15", "Klausur X110", "Montag", "4"]);
  t = texte(await zeichnen(d, { familie: "accessoryCircular", parameter: "pruefung" }));
  assert.deepEqual(t, ["113", "Tage"]);
});

test("Ohne Daten oder nach drei Wochen ohne Obsidian: ein Satz statt eines falschen Stundenplans", async () => {
  assert.match(texte(await zeichnen(null, { familie: "large" }))[0], /^Öffne Obsidian/);
  assert.match(texte(await zeichnen(daten("2026-10-20T09:00:00"), { familie: "large", jetzt: "2026-11-09T09:00:00" }))[0], /^Öffne Obsidian/);
  assert.match(texte(await zeichnen(daten("2026-10-20T09:00:00"), { familie: "small", jetzt: "2026-11-09T09:00:00" }))[0], /^Öffne Obsidian/);
});

// Was in einem Stapel fester Länge mindestens Platz braucht: feste Lücken, Stapel fester Länge, Abstände und je Lücke ohne
// Länge 8 pt (so viel nimmt SwiftUI mindestens). Text zählt nicht mit, seine Länge kennt nur das Gerät.
const ueberlaeufe = (k, aus = []) => {
  const waag = k.richtung === "waagerecht", soll = k.size && (waag ? k.size.width : k.size.height);
  if (soll) {
    const teile = k.kinder.filter((x) => x.art !== "text");
    const min = teile.reduce((a, x) => a + (x.art === "luecke" ? (x.n == null ? 8 : x.n) : (x.size && (waag ? x.size.width : x.size.height)) || 0), 0)
      + (k.spacing || 0) * Math.max(0, k.kinder.length - 1) + (k.rand ? (waag ? k.rand[1] + k.rand[3] : k.rand[0] + k.rand[2]) : 0);
    if (min > soll + 0.5) aus.push((waag ? "Breite " : "Höhe ") + min.toFixed(1) + " > " + soll.toFixed(1));
  }
  (k.kinder || []).forEach((x) => ueberlaeufe(x, aus));
  return aus;
};

test("Woche groß füllt das Widget genau: nichts ragt hinaus, auch wenn eine Sitzung bis zum Ende des Rasters geht", async () => {
  const d = daten("2026-10-20T09:00:00");
  // Wie die Woche auf dem iPad am 29.10.2026: eine Sitzung endet zur vollen Stunde am Ende des Rasters
  const letzte = d.wochen[0].sitzungen.filter((s) => s.tag === "2026-10-20").pop();
  letzte.ende = d.wochen[0].h1 + ":00";
  for (const [pad, b, h] of [[false, 393, 852], [false, 375, 667], [true, 1192, 1590], [true, 1024, 1366], [true, 834, 1194], [true, 744, 1133]]) {
    for (const familie of pad ? ["large", "extraLarge"] : ["large"]) {
      const w = await zeichner()({ ListWidget: SC.ListWidget, Color: SC.Color, Font: SC.Font, Size: SC.Size, SFSymbol: SC.SFSymbol, Device: SC.geraet(pad, b, h),
        config: { widgetFamily: familie, runsInWidget: true }, args: { widgetParameter: null },
        fm: SC.dateien({ [ORDNER + "/widget-" + (pad ? "ipad" : "iphone") + ".json"]: JSON.stringify(d) }), ordner: ORDNER, jetzt: new Date("2026-10-20T09:00:00") });
      assert.deepEqual(ueberlaeufe(w), [], [b, familie].join(" "));
      // Kopf, Tage und Raster zusammen so hoch wie das Widget ohne Rand (keine Lücke darunter)
      const hoehe = w.kinder.reduce((a, x) => a + (x.art === "luecke" ? x.n : x.size.height), 0);
      const g = { 1192: 412, 1024: 378.5, 834: 342, 744: 305.5, 393: 354, 375: 324 }[b];
      assert.ok(Math.abs(hoehe + 24 - g) < 0.5, b + " " + familie + ": " + hoehe);
    }
  }
});

// Kontrast nach WCAG: jeder Text gegen den Hintergrund des nächsten Stapels mit Farbe darüber, hell und dunkel; 4,5 : 1, große
// Schrift (ab 18 pt, fett ab 14 pt) 3 : 1
const leucht = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const kontrast = (a, b) => { const x = leucht(a), y = leucht(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const schwach = (k, grund, aus = []) => {
  const hier = k.backgroundColor || grund;
  if (k.art === "text") {
    const gross = k.font.size >= 18 || (k.font.size >= 14 && k.font.gewicht >= 600);
    for (const m of ["hell", "dunkel"]) {
      const r = kontrast(k.textColor[m], hier[m]);
      if (r < (gross ? 3 : 4.5)) aus.push(m + " " + r.toFixed(2) + " „" + k.s + "“");
    }
  }
  (k.kinder || []).forEach((x) => schwach(x, hier, aus));
  return aus;
};

test("Kontrast und Überstand: jeder Text in jedem Widget, jedem Design, hell und dunkel, auch laufend, vorbei, Ausfall und auf der Modulfarbe", async () => {
  const fehler = new Set();
  for (const design of ["elfenbein", "flieder", "klar"]) {
    for (const jetzt of ["2026-10-20T09:00:00", "2026-10-20T11:00:00", "2026-10-21T18:00:00", "2026-10-22T09:00:00"]) {
      const d = daten(jetzt, { design, modus: "automatisch" });
      for (const parameter of [null, "fristen", "pruefung"]) {
        for (const familie of ["small", "medium", "large", "extraLarge"]) {
          const w = await zeichnen(d, { parameter, familie, jetzt, pad: familie === "extraLarge" });
          schwach(w, w.backgroundColor).forEach((f) => fehler.add([design, parameter || "stundenplan", familie, f].join(" ")));
          ueberlaeufe(w).forEach((f) => fehler.add([design, parameter || "stundenplan", familie, "Überstand", f].join(" ")));
        }
      }
    }
  }
  assert.deepEqual([...fehler], []);
});

test("HTML-Nachbau zeichnet jede Größe (zum Ansehen beim Entwickeln)", async () => {
  const w = await zeichnen(daten("2026-10-20T09:00:00"), { familie: "large" });
  assert.match(SC.html(w, { w: 338, h: 354 }, true), /^<div style="display:flex;flex-direction:column/);
});

// ---------- Lader und Einrichtung in Scriptable ----------
const KOPF = "// Variables used by Scriptable.\n// These must be at the very top of the file. Do not edit.\n// icon-color: deep-gray; icon-glyph: magic;\n";
const PLUGIN = "/.obsidian/plugins/studium-autopilot/";
// Ein Skript aus dem Ordner der Skripte so ausführen, wie Scriptable es tut (oberste Ebene mit await, Bausteine als Globale)
const scriptableLauf = async (datei, o) => {
  const Async = Object.getPrototypeOf(async function () {}).constructor;
  const gesetzt = [], alerts = [], erzeugt = [];
  const fm = SC.dateien(o.dateien, o.lesezeichen || {});
  function ListWidget() { const w = new SC.ListWidget(); erzeugt.push(w); return w; }
  const G = { ListWidget, Color: SC.Color, Font: SC.Font, Size: SC.Size, SFSymbol: SC.SFSymbol, Device: SC.geraet(o.pad), Alert: SC.alerts(o.antworten || [], alerts),
    config: o.widget ? { widgetFamily: o.widget, runsInWidget: true } : { runsInApp: true }, args: { widgetParameter: o.parameter || null },
    FileManager: { local: () => fm, iCloud: () => { throw new Error("iCloud aus"); } }, Script: { setWidget: (w) => gesetzt.push(w), complete: () => {} },
    module: { filename: datei } };
  await new Async(...Object.keys(G), o.dateien[datei])(...Object.values(G));
  return { widget: gesetzt[0], gesetzt, alerts, erzeugt };
};
const tresor = (wurzel, mitDaten) => {
  const d = { [wurzel + PLUGIN + "manifest.json"]: "{}" };
  if (mitDaten) {
    d[wurzel + PLUGIN + "widget-scriptable.js"] = "(" + laden("widget").ergebnis.scriptable.toString() + ")\n";
    d[wurzel + PLUGIN + "widget-iphone.json"] = JSON.stringify(daten(new Date().toISOString().slice(0, 10) + "T09:00:00", { tresor: "Studium Autopilot Dev" }));
  }
  return d;
};

test("Einrichtung: das eingefügte Skript legt Stundenplan, Fristen und Prüfungen an, löscht sich und erklärt den Zugriff", async () => {
  const G = laden("widget").ergebnis;
  const dateien = { "/Skripte/Untitled Script.js": KOPF + G.lader({ tresor: "Studium Autopilot Dev", ort: "Auf meinem iPad" }),
    "/Skripte/Stundenplan.js": "// ein eigenes Skript mit demselben Namen", "/Skripte/Mein Skript.js": "// bleibt" };
  const r = await scriptableLauf("/Skripte/Untitled Script.js", { dateien });
  assert.deepEqual(Object.keys(dateien).sort(), ["/Skripte/Fristen.js", "/Skripte/Mein Skript.js", "/Skripte/Prüfungen.js", "/Skripte/Stundenplan (Studium Autopilot).js",
    "/Skripte/Stundenplan.js"], "das eingefügte ist weg, das fremde „Stundenplan“ bleibt");
  assert.equal(dateien["/Skripte/Stundenplan.js"], "// ein eigenes Skript mit demselben Namen");
  const fristen = dateien["/Skripte/Fristen.js"];
  assert.match(fristen, /^\/\/ Variables used by Scriptable\.\n\/\/ These must be at the very top of the file\. Do not edit\.\n\/\/ icon-color: orange; icon-glyph: hourglass-half;\n\/\/ Studium Autopilot: Widget/);
  assert.equal(fristen.match(/^\/\/ Variables used by Scriptable\./gm).length, 1, "nur ein Kopf, der eingefügte ist weg");
  assert.match(fristen, /\nconst ART = "fristen";\n/);
  assert.match(dateien["/Skripte/Prüfungen.js"], /\nconst ART = "pruefung";\n/);
  assert.match(dateien["/Skripte/Stundenplan (Studium Autopilot).js"], /\nconst ART = "stundenplan";\n/);
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].title, "Noch ein Schritt");
  assert.match(r.alerts[0].message, /File Bookmarks, dann auf \+ und Pick Folder\.\n3\. Tippe auf Auf meinem iPad, dann auf den Ordner Obsidian/);
  assert.match(r.alerts[0].message, /tippe in der Liste auf Stundenplan\.$/);
  assert.equal(r.gesetzt.length, 0);
  // Ein selbst benanntes Skript (Anleitung bis 29.10.2026) bleibt stehen und legt die drei trotzdem an
  const alt = { "/Skripte/Studium Autopilot.js": G.lader({ tresor: "X" }) };
  await scriptableLauf("/Skripte/Studium Autopilot.js", { dateien: alt });
  assert.deepEqual(Object.keys(alt).sort(), ["/Skripte/Fristen.js", "/Skripte/Prüfungen.js", "/Skripte/Studium Autopilot.js", "/Skripte/Stundenplan.js"]);
});

test("Einrichtung: findet den Tresor im Lesezeichen „Obsidian“ unter mehreren, zeigt „Alles bereit“ und jede Größe als Vorschau", async () => {
  const G = laden("widget").ergebnis;
  const dateien = Object.assign({ "/Skripte/Untitled Script.js": G.lader({ tresor: "Studium Autopilot Dev", ort: "Auf meinem iPhone" }) },
    tresor("/O/Anderer", false), tresor("/O/Studium Autopilot Dev", true));
  await scriptableLauf("/Skripte/Untitled Script.js", { dateien, lesezeichen: { Obsidian: "/O" }, antworten: [-1] });
  // Fristen im Widget: ohne Parameter, nur über das Skript
  const w = await scriptableLauf("/Skripte/Fristen.js", { dateien, lesezeichen: { Obsidian: "/O" }, widget: "small" });
  assert.deepEqual(symbole(w.widget), ["hourglass"], "der Tresor mit dem Namen, nicht der andere ohne Daten");
  const p = await scriptableLauf("/Skripte/Prüfungen.js", { dateien, lesezeichen: { "Mein Name": "/O/Studium Autopilot Dev" }, widget: "accessoryCircular" });
  assert.deepEqual(texte(p.widget).slice(1), ["Tage"], "Name des Lesezeichens egal, Lesezeichen direkt auf den Tresor");
  // In der App: „Alles bereit“, dann Groß und Klein ansehen, dann Fertig
  const a = await scriptableLauf("/Skripte/Stundenplan.js", { dateien, lesezeichen: { Obsidian: "/O" }, antworten: [2, 0, -1] });
  assert.deepEqual(a.alerts.map((x) => x.title), ["Alles bereit", "Noch eine Größe ansehen?", "Noch eine Größe ansehen?"]);
  assert.match(a.alerts[0].message, /^„Stundenplan“ liest jetzt deinen Tresor „Studium Autopilot Dev“\./);
  assert.match(a.alerts[0].message, /bei Script „Stundenplan“ wählen/);
  assert.deepEqual(a.alerts[0].actions, ["Klein", "Mittel", "Groß"]);
  assert.deepEqual(a.erzeugt.map((x) => x.gezeigt).filter((g) => g.length), [["presentLarge"], ["presentSmall"]]);
  assert.equal(a.gesetzt.length, 0);
});

test("Lader im Widget: ohne Zugriff ein Satz, der die Einrichtung startet; ohne Daten „Öffne Obsidian“; alter Weg mit Parameter", async () => {
  const G = laden("widget").ergebnis;
  const dateien = { "/Skripte/Prüfungen.js": G.lader({ tresor: "T" }).replace('const ART = "";', 'const ART = "pruefung";') };
  let r = await scriptableLauf("/Skripte/Prüfungen.js", { dateien, widget: "small" });
  assert.deepEqual(texte(r.widget), ["Tippe hier, um das Widget einzurichten."]);
  assert.equal(r.widget.url, "scriptable:///run/Pr%C3%BCfungen");
  r = await scriptableLauf("/Skripte/Prüfungen.js", { dateien: Object.assign(dateien, tresor("/T", false)), lesezeichen: { T: "/T" }, widget: "small" });
  assert.match(texte(r.widget)[0], /^Öffne Obsidian einmal auf diesem Gerät/);
  const alt = Object.assign({ "/Skripte/Studium Autopilot.js": G.lader({ tresor: "T" }) }, tresor("/T", true));
  r = await scriptableLauf("/Skripte/Studium Autopilot.js", { dateien: alt, lesezeichen: { "Studium Autopilot": "/T" }, widget: "small", parameter: "Fristen" });
  assert.deepEqual(symbole(r.widget), ["hourglass"]);
});

test("Datei für Scriptable: „Stundenplan“ mit Symbol; ihr erster Lauf legt Fristen und Prüfungen an, ein gelöschtes bleibt weg", async () => {
  const G = laden("widget").ergebnis;
  const d = JSON.parse(G.skriptDatei({ tresor: "Studium Autopilot Dev", ort: "Auf meinem iPad" }));
  assert.deepEqual(Object.keys(d).sort(), ["always_run_in_app", "icon", "name", "script", "share_sheet_inputs"], "Format wie Scriptables Skript-Dateien");
  assert.deepEqual([d.name, d.icon, d.always_run_in_app, d.share_sheet_inputs], ["Stundenplan", { color: "deep-blue", glyph: "calendar-alt" }, false, []]);
  assert.match(d.script, /\nconst ART = "stundenplan";\nconst TRESOR = "Studium Autopilot Dev";\nconst ORT = "Auf meinem iPad";\n/);
  // So legt Scriptable sie mit „Add to My Scripts“ ab: Kopf aus dem Symbol, dann der Text
  const dateien = { "/Skripte/Stundenplan.js": "// Variables used by Scriptable.\n// These must be at the very top of the file. Do not edit.\n// icon-color: deep-blue; icon-glyph: calendar-alt;\n" + d.script };
  const vorher = dateien["/Skripte/Stundenplan.js"];
  const r = await scriptableLauf("/Skripte/Stundenplan.js", { dateien });
  assert.deepEqual(Object.keys(dateien).sort(), ["/Skripte/Fristen.js", "/Skripte/Prüfungen.js", "/Skripte/Stundenplan.js"]);
  assert.equal(dateien["/Skripte/Stundenplan.js"], vorher, "sich selbst schreibt es nicht neu");
  assert.match(dateien["/Skripte/Prüfungen.js"], /\nconst ART = "pruefung";\n/);
  assert.equal(r.alerts[0].title, "Noch ein Schritt");
  delete dateien["/Skripte/Prüfungen.js"];
  await scriptableLauf("/Skripte/Stundenplan.js", { dateien });
  assert.ok(!("/Skripte/Prüfungen.js" in dateien), "gelöscht bleibt gelöscht, solange Fristen noch da ist");
});

test("Kopie in Scriptable: nach jedem Lauf mit Zugriff aufgefrischt, das Widget zeichnet aus ihr, wenn der Tresor nicht lesbar ist", async () => {
  const G = laden("widget").ergebnis;
  const dateien = Object.assign({ "/Skripte/Fristen.js": G.lader({ tresor: "T" }).replace('const ART = "";', 'const ART = "fristen";') }, tresor("/T", true));
  await scriptableLauf("/Skripte/Fristen.js", { dateien, lesezeichen: { T: "/T" }, widget: "small" });
  const KOPIE = "/Bibliothek/studium-autopilot/";
  assert.equal(dateien[KOPIE + "widget-scriptable.js"], dateien["/T" + PLUGIN + "widget-scriptable.js"]);
  assert.equal(dateien[KOPIE + "widget-iphone.json"], dateien["/T" + PLUGIN + "widget-iphone.json"]);
  assert.ok(!(KOPIE + "widget-ipad.json" in dateien), "nur, was es gibt");
  // Lesezeichen weg: das Widget zeichnet aus der Kopie
  let r = await scriptableLauf("/Skripte/Fristen.js", { dateien, widget: "small" });
  assert.deepEqual(symbole(r.widget), ["hourglass"]);
  // Tresor da, aber ohne Dateien (etwa noch in iCloud): auch aus der Kopie
  for (const k of Object.keys(dateien)) if (k.indexOf("/T" + PLUGIN + "widget-") === 0) delete dateien[k];
  r = await scriptableLauf("/Skripte/Fristen.js", { dateien, lesezeichen: { T: "/T" }, widget: "small" });
  assert.deepEqual(symbole(r.widget), ["hourglass"]);
  // In der App ohne Zugriff: die Anleitung, nicht die Kopie
  r = await scriptableLauf("/Skripte/Fristen.js", { dateien, antworten: [0] });
  assert.equal(r.alerts[0].title, "Noch ein Schritt");
  // Kopie nie unter den Skripten
  assert.ok(Object.keys(dateien).every((k) => k.indexOf("/Skripte/") !== 0 || /\/(Fristen|Prüfungen|Stundenplan)/.test(k)));
});

test("Ort für die Anleitung: iCloud Drive oder auf dem Gerät", () => {
  const G = laden("widget").ergebnis;
  assert.equal(G.ort("/private/var/mobile/Library/Mobile Documents/iCloud~md~obsidian/Documents/Studium"), "iCloud Drive");
  assert.equal(G.ort("file:///private/var/mobile/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Studium/x.scriptable"), "iCloud Drive");
  // So meldet ein iPad einen Tresor auf dem Gerät (getNativePath, 29.10.2026)
  assert.equal(G.ort("file:///var/mobile/Containers/Data/Application/F3659AB9/Documents/Studium%20Autopilot%20Dev/Widget-Test%20Stundenplan.scriptable"), "Auf meinem iPhone");
  assert.equal(G.ort("/var/mobile/Containers/Data/Application/X/Documents/Studium"), "Auf meinem iPhone");
  assert.equal(G.ort(""), "Auf meinem iPhone");
});

// ---------- Schreiben ----------
test("Schreiben: nur auf iPhone und iPad, in den Ordner des Plugins, je Gerät eine Datei, nur wenn sich etwas geändert hat", async () => {
  const heute = "2026-10-20";
  const U = umgebung(heute);
  const geschrieben = [];
  const platte = {};
  const mit = (Platform) => {
    const r = laden("widget", { heute, kontext: { modell: U.M, obsidian: { Platform }, darstellung: { design: () => "klar", modus: () => "dunkel" },
      user: { woche: () => Object.assign({}, U.W, { eingaben: () => EINGABEN }), dashboard: () => U.D } } });
    r.ctx.app.vault.configDir = ".obsidian";
    r.ctx.app.vault.getName = () => "Studium Autopilot";
    r.ctx.app.vault.adapter = {
      exists: async (p) => Object.prototype.hasOwnProperty.call(platte, p),
      read: async (p) => platte[p],
      write: async (p, t) => { platte[p] = t; geschrieben.push(p); },
    };
    return r.ergebnis;
  };
  await mit({ isIosApp: false, isDesktopApp: true }).exportieren();
  assert.deepEqual(geschrieben, [], "am Computer nichts");
  await mit({ isIosApp: true, isPhone: true }).exportieren();
  assert.deepEqual(geschrieben.sort(), [".obsidian/plugins/studium-autopilot/widget-iphone.json", ".obsidian/plugins/studium-autopilot/widget-scriptable.js"]);
  const d = JSON.parse(platte[".obsidian/plugins/studium-autopilot/widget-iphone.json"]);
  assert.deepEqual([d.design, d.modus, d.tresor], ["klar", "dunkel", "Studium Autopilot"]);
  assert.equal(typeof new Function("return " + platte[".obsidian/plugins/studium-autopilot/widget-scriptable.js"])(), "function");
  geschrieben.length = 0;
  await mit({ isIosApp: true, isPhone: true }).exportieren();
  assert.deepEqual(geschrieben, [], "gleicher Inhalt: nichts geschrieben, auch nach einem Neustart (liest die Datei)");
  await mit({ isIosApp: true, isTablet: true }).exportieren();
  assert.deepEqual(geschrieben, [".obsidian/plugins/studium-autopilot/widget-ipad.json"], "das iPad schreibt seine eigene Datei");
});
