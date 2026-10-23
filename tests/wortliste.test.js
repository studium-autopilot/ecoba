// Wortliste (docs/design.md, „Sprache“): keine verbotenen Varianten in Skripten, Seiten, Hilfe und Changelog; Hinweise nur über
// ctx.hinweis (hinweis.js), ein Satz ohne Vorsatz und Pfad; Knöpfe heißen wie ihre Befehle. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const W = require("./wortliste");
const { laden } = require("./laden");

const WURZEL = path.join(__dirname, "..");
const Q = W.quellen(WURZEL);
const regel = (name) => W.REGELN.find((r) => r.name === name);

// Noch nicht umgestellt: Datei (oder Ordner mit „/“ am Ende, zusammengezählt) → { Art: höchstens so viele Funde }. Art ist eine
// Regel der Wortliste, „notice“ (Notice statt ctx.hinweis), „befehl“ oder „knopf“. Darf nur kleiner werden.
const NOCH_OFFEN = {
};
const schluessel = (datei) => (NOCH_OFFEN[datei] ? datei : Object.keys(NOCH_OFFEN).find((k) => k.endsWith("/") && datei.startsWith(k)) || datei);
const erlaubt = (datei, art) => (NOCH_OFFEN[datei] && NOCH_OFFEN[datei][art]) || 0;

// Funde [{ datei, art, text }] → die, die über NOCH_OFFEN hinausgehen (dann alle dieser Datei und Art, zum Finden)
const zuViele = (funde) => {
  const je = new Map();
  for (const f of funde) {
    const k = schluessel(f.datei) + "\u0000" + f.art;
    if (!je.has(k)) je.set(k, []);
    je.get(k).push(f.text);
  }
  const aus = [];
  for (const [k, liste] of je) { const [datei, art] = k.split("\u0000"); if (liste.length > erlaubt(datei, art)) aus.push(...liste); }
  return aus;
};

test("Wortliste: keine neuen verbotenen Varianten", () => {
  const funde = W.funde(WURZEL, Q).map((f) => ({ datei: f.datei, art: f.regel, text: `${f.datei}:${f.zeile} „${f.treffer}“ → ${regel(f.regel).sag}` }));
  assert.deepEqual(zuViele(funde), [], "Wortliste in docs/design.md („Sprache“); steht die Variante mit Absicht dort, in AUSNAHMEN in tests/wortliste.js");
});

test("Hinweise: nur über ctx.hinweis, nie new Notice", () => {
  const funde = [];
  for (const q of Q.filter((x) => x.art === "skript" && x.datei !== "System/Skripte/hinweis.js")) {
    for (const z of W.nurCode(q.code).split("\n").map((s, k) => [s, k + 1]).filter(([s]) => /\bNotice\b/.test(s))) {
      for (let n = z[0].match(/\bNotice\b/g).length; n > 0; n--) funde.push({ datei: q.datei, art: "notice", text: `${q.datei}:${z[1]} Notice` });
    }
  }
  assert.deepEqual(zuViele(funde), []);
});

test("Hinweise: ein Satz ohne Vorsatz, ohne Pfad, ohne Fehlertext aus dem Code", () => {
  const fehler = [];
  for (const q of Q.filter((x) => x.code)) {
    for (const a of W.hinweisAufrufe(q.code)) for (const f of W.hinweisFehler(a)) fehler.push(`${q.datei}:${a.zeile} ${f}`);
  }
  assert.deepEqual(fehler, []);
});

// Befehle: <name>: { titel: "…" } in den Aktionen der Skripte
const befehle = () => {
  const aus = {};
  for (const q of Q.filter((x) => x.art === "skript")) {
    const re = /(?:^|[\s{,])"?([\w-]+)"?\s*:\s*\{\s*titel:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(q.code))) aus[m[1]] = { titel: m[2], datei: q.datei };
  }
  return aus;
};

test("Befehle: ohne Programmnamen, Vorsatz und Erklärung in Klammern", () => {
  const b = befehle();
  assert.ok(Object.keys(b).length >= 25, "Befehle gefunden");
  const funde = [];
  for (const [name, { titel, datei }] of Object.entries(b)) {
    // Obsidian setzt „Studium Autopilot:“ selbst davor
    if (/Studium Autopilot|^[^:]+: |[()]/.test(titel)) funde.push({ datei, art: "befehl", text: `${datei} ${name}: „${titel}“` });
  }
  assert.deepEqual(zuViele(funde), []);
});

test("Knöpfe auf Seiten heißen wie ihr Befehl", () => {
  const b = befehle();
  const funde = [];
  let geprueft = 0;
  for (const q of Q.filter((x) => x.art === "seite")) {
    for (const t of q.texte) {
      for (const m of t.text.matchAll(/\[([^\]]+)\]\(obsidian:\/\/studium-autopilot\?aktion=([\w-]+)[^)]*\)/g)) {
        const def = b[m[2]];
        if (!def) continue; // Aktion ohne Befehl (z. B. suchen)
        geprueft++;
        if (m[1] !== def.titel) funde.push({ datei: q.datei, art: "knopf", text: `${q.datei}:${t.zeile} „${m[1]}“ ≠ Befehl „${def.titel}“` });
      }
    }
  }
  assert.ok(geprueft >= 5, "Knöpfe gefunden");
  assert.deepEqual(zuViele(funde), []);
});

test("Wortliste: docs/design.md nennt jede Regel", () => {
  const doku = fs.readFileSync(path.join(WURZEL, "docs", "design.md"), "utf8");
  const a = doku.indexOf("## Sprache");
  assert.ok(a >= 0, "Abschnitt „Sprache“");
  const teil = doku.slice(a);
  for (const r of W.REGELN) {
    const wort = r.sag.split(/[(,;]/)[0].trim();
    assert.ok(teil.includes("**" + wort + "**"), `„${wort}“ fehlt in der Wortliste von docs/design.md`);
  }
});

test("Wortliste: die Regeln erkennen Varianten und lassen das Richtige stehen", () => {
  const trifft = (name, text) => regel(name).nicht.test(text);
  for (const [name, falsch, richtig] of [
    ["aktualisieren", ["Jetzt aktualisieren", "Aus ILIAS holen", "Stundenplan aus Alma holen", "Hier laden", "Jetzt abgleichen"], ["Aktualisieren", "Hier aktualisieren", "Stundenplan aktualisieren", "Studium Autopilot holt nur Daten"]],
    ["neue-version", ["Studium Autopilot aktualisieren"], ["Neue Version installieren"]],
    ["lehrveranstaltung", ["Neuer Stundenplan-Eintrag", "Keine Veranstaltungen", "Veranstaltung aus dem Stundenplan nehmen"], ["Keine Lehrveranstaltungen", "Lehrveranstaltung aus dem Stundenplan nehmen", "Fachschaft & Veranstaltungen"]],
    ["ects", ["(6 CP)", "12 Credits"], ["6 ECTS", "TCP-Kurs", "Transdisciplinary Course Program (TCP)"]],
    ["pruefung", ["Klausurtermin fehlt", "Klausurphasen", "Prüfungstermine"], ["Prüfungsphase", "Klausur 90 min", "Prüfungsanmeldung"]],
    ["fachsemester", ["FS 1", "bis Ende FS 4"], ["1. FS", "4. Fachsemester", "FS"]],
    ["gesamtnote", ["Notenschnitt", "Dein Wunsch-Schnitt"], ["Gesamtnote", "Zielnote"]],
    ["gruppe", ["Gr. 1", "Gr.", "die Liste Gr. "], ["Gruppe 4", "Grundstudium"]],
    ["verbinden", ["Anmeldung prüfen", "Anmeldung abgelehnt.", "Melde mich bei ILIAS an …"], ["Prüfungsanmeldung", "Anmeldung: Alma", "neu verbinden"]],
    ["passwort", ["Kennwort fehlt"], ["Passwort fehlt"]],
    ["meine-notizen", ["\n\n## Notizen\n- ", "## Notizen"], ["## Meine Notizen", "## Notizen zur Klausur"]],
    ["vorlesungsfrei", ["Ferien", "Pfingstferien"], ["vorlesungsfrei", "Pfingstpause"]],
    ["woche", ["Wochenraster", "Wochenplan"], ["Woche", "Stundenplan"]],
    ["uebersicht", ["Bereiche-Menü"], ["Übersicht", "Schwerpunktbereiche"]],
    ["deine-angaben", ["Personalisieren", "Einstellungen → Kernplugins"], ["Deine Angaben", "Einstellungen & Hilfe"]],
    ["tresor", ["deinem Vault"], ["deinem Tresor", "Vaults"]],
    ["termin-folgt", ["noch kein Termin"], ["Termin folgt"]],
    ["ohne-jargon", ["open book", "Cheat-Sheet"], ["mit Unterlagen"]],
    ["design-ohne-namen", ["Elfenbein", "Paper Elfenbein", "Design Flieder", "Klar, weiß und schlicht"], ["Design 1", "elfenbein", "eba-design-flieder", "eba-klar", "klar", "Klarheit", "unklar"]],
  ]) {
    for (const t of falsch) assert.ok(trifft(name, t), `${name}: „${t}“ muss auffallen`);
    for (const t of richtig) assert.ok(!trifft(name, t), `${name}: „${t}“ ist richtig`);
  }
});

test("Wortliste: Texte aus JavaScript ohne Kommentare und reguläre Ausdrücke", () => {
  const code = [
    "// Kennwort im Kommentar",
    "/* Notenschnitt */ const a = \"Gesamtnote\", r = /Kennwort/i;",
    "const t = `Gruppe ${n ? \"Gr. \" + n : `innen ${x}`} fertig`;",
    "const b = 'Zeile\\nzwei', c = x / 2 / y;",
  ].join("\n");
  const texte = W.zeichenketten(code).map((x) => x.text);
  assert.deepEqual(texte, ["Gesamtnote", "Gruppe ", "Gr. ", "innen ", "", " fertig", "Zeile\nzwei"]);
  assert.equal(W.zeichenketten(code).find((x) => x.text === "Gr. ").zeile, 3);
  assert.ok(!/im Kommentar|Notenschnitt|Gesamtnote|Zeile/.test(W.nurCode(code)), "nurCode ohne Kommentare und Texte");
  assert.ok(/\/Kennwort\/i/.test(W.nurCode(code)), "reguläre Ausdrücke sind Code");
  const aufrufe = W.hinweisAufrufe("ctx.hinweis(\"Studium Autopilot: System/Einstellungen.md fehlt.\", { dauer: 3000 });\nctx.hinweis(e.message);");
  assert.deepEqual(aufrufe.map((a) => W.hinweisFehler(a)), [["Vorsatz", "Dateipfad „System/“"], ["Fehlertext aus dem Code (e.message)"]]);
  assert.deepEqual(W.hinweisFehler(W.hinweisAufrufe("ctx.hinweis(`${n} Karten ausgesetzt.`, { aktion: { text: \"Rückgängig\" } })")[0]), []);
});

test("ctx.hinweis: Dauer, Knöpfe, Fortschritt", () => {
  const gezeigt = [];
  const Notice = class { constructor(t, d) { this.text = t; this.dauer = d; gezeigt.push(this); } hide() { this.weg = true; } };
  const aufrufe = [];
  const { ctx, ergebnis } = laden("hinweis", { kontext: { obsidian: { Notice }, aktion: (name, p) => aufrufe.push([name, p]) } });
  assert.equal(typeof ctx.hinweis, "function", "beim Laden gesetzt");
  assert.equal(typeof ergebnis.registrieren, "function", "Erweiterung, damit der Kern die Datei beim Start aufruft");
  const n = ctx.hinweis("Gespeichert.");
  assert.equal(n.text, "Gespeichert.");
  assert.equal(n.dauer, 5000);
  assert.equal(ctx.hinweis("Lade die neue Version …", { dauer: 0 }).dauer, 0, "Fortschritt bleibt");
  assert.equal(ergebnis.dauerVon("x".repeat(200), {}), 7000, "langer Text länger");
  assert.equal(ergebnis.dauerVon("x".repeat(2000), {}), 15000, "höchstens 15 s");
  assert.equal(ergebnis.dauerVon("Kurz.", { aktion: { text: "Rückgängig" } }), 10000, "mit Knopf länger");
  const k = ergebnis.knoepfeVon([{ text: "Verbinden", aktion: "verbinden", parameter: { id: "ilias" } }, { text: "Später", ausfuehren: () => "s" }, { text: "Drei" }], (a, p) => aufrufe.push([a, p]));
  assert.deepEqual(k.map((x) => x.text), ["Verbinden", "Später"], "höchstens zwei");
  k[0].tun();
  assert.deepEqual(aufrufe, [["verbinden", { id: "ilias" }]]);
  assert.equal(k[1].tun(), "s");
  assert.deepEqual(ergebnis.knoepfeVon(null, () => {}), []);
  // ohne Obsidian (Hülle, Test ohne Notice): nichts, kein Fehler
  const ohne = laden("hinweis", { kontext: { obsidian: {} } }).ctx;
  assert.equal(ohne.hinweis("Text."), null);
});
