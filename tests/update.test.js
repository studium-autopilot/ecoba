// Update der Vorlage (update.js): Dateiklassen, Prüfung der Dateiliste, Entscheidung je Datei (ersetzen, neue Fassung daneben,
// Felder mischen), alles oder nichts (kein Netz, falsche Prüfsumme, Schreibfehler → alter Stand) und das Feld „release“ im
// Manifest der zentralen Daten (zentral.js). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const U = laden("update").ctx.update;
const Z = laden("zentral").ctx.zentral;
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder("utf-8").decode(b);
const KERN = ".obsidian/plugins/studium-autopilot/";

test("Dateiklassen: was ein Update ersetzen darf", () => {
  const faelle = {
    [KERN + "main.js"]: "system", [KERN + "manifest.json"]: "system", [KERN + "styles.css"]: "system", [KERN + "data.json"]: "",
    ".obsidian/plugins/anderes/main.js": "",
    "System/Skripte/zentral.js": "system", "System/Skripte/unter/x.js": "", "System/Skripte/notiz.md": "",
    "System/Gerüste/Modul.md": "system", ".obsidian/snippets/eba-core.css": "system", ".obsidian/snippets/eigen.css": "",
    ".claude/CLAUDE.md": "", ".claude/skills/studium-autopilot/SKILL.md": "", ".claude/skills/studium-autopilot/unter/x.md": "",
    ".claude/skills/eigener/SKILL.md": "", ".claude/settings.json": "", ".claude/settings.local.json": "",
    ".obsidian/app.json": "einstellung", ".obsidian/types.json": "einstellung", ".obsidian/community-plugins.json": "einstellung",
    ".obsidian/appearance.json": "", ".obsidian/workspace.json": "", ".obsidian/workspace-mobile.json": "",
    "Dashboard.md": "seite", "Studium/Prüfungen.md": "seite", "Studium/Unter/x.md": "", "System/Daten/Musterplan.md": "seite",
    "Module/1 Grundstudium/B110 Einführung in die Betriebswirtschaftslehre.md": "modul", "Module/x.txt": "",
    "System/Einstellungen.md": "", "System/Daten/Semester.md": "", "System/Daten/abruf.json": "", "System/Daten/installiert.json": "",
    "System/Daten/system-dateien.json": "", "Termine/2026-10-12 Vorlesungsbeginn.md": "", "Stundenplan/x.md": "",
    "Vorlesungen/x.md": "", "Übungsblätter/x.md": "", "Unterlagen/x.md": "", "Eingang/x.md": "", "Anhänge/x.png": "",
    "Schlüsselqualifikationen/x.md": "", "Eigene Notiz.md": "",
    "../Dashboard.md": "", "/Dashboard.md": "", "Module/../Dashboard.md": "", "Module\\x.md": "", ".trash/Module/x.md": "",
    "Module/x /y.md": "", "Module/a:b.md": "", "Module/a?.md": "",
  };
  for (const [p, k] of Object.entries(faelle)) assert.equal(U.klasseVon(p), k, p);
  // Unicode: zerlegte Umlaute (macOS) zählen wie zusammengesetzte
  assert.equal(U.klasseVon("System/Gerüste/Modul.md"), "system");
});

test("Name der neuen Fassung neben deiner", () => {
  assert.equal(U.neuName("Dashboard.md", "0.3.0"), "Dashboard (neu 0.3.0).md");
  assert.equal(U.neuName("Studium/Noten & ECTS.md", "0.3.0"), "Studium/Noten & ECTS (neu 0.3.0).md");
  assert.equal(U.neuName("System/Skripte/zentral.js", "0.3.0"), "System/Skripte/zentral (neu 0.3.0).js.txt");
  assert.equal(U.neuName(".obsidian/snippets/eba-core.css", "1.0.0"), ".obsidian/snippets/eba-core (neu 1.0.0).css.txt");
  // Die Kopie eines Skripts wird nie als Skript geladen
  assert.equal(U.klasseVon(U.neuName("System/Skripte/zentral.js", "0.3.0")), "");
  // Sicherung deiner Systemdatei: immer mit .txt, nie geladen, nie im Update
  assert.equal(U.deineName(".obsidian/snippets/eba-core.css", "0.4.4"), ".obsidian/snippets/eba-core (deine Fassung vor 0.4.4).css.txt");
  assert.equal(U.deineName("System/Gerüste/Modul.md", "0.4.4", 2), "System/Gerüste/Modul (deine Fassung vor 0.4.4, 2).md.txt");
  for (const p of [KERN + "main.js", "System/Skripte/zentral.js", ".obsidian/snippets/eba-core.css", "System/Gerüste/Modul.md"]) {
    assert.equal(U.klasseVon(U.deineName(p, "0.4.4")), "", p);
  }
  // Kopien neben einer Datei erkennen (auch mit zerlegten Umlauten wie auf iPhone und Mac), sonst nichts
  const namen = ["Studium/Prüfungen (neu 0.4.2).md", "Studium/Prüfungen (neu 0.4.1-beta.1).md", "Studium/Prüfungen.md",
    "Studium/Prüfungen (neu x).md", "Studium/Prüfungen (neu 0.4.3).md.txt", "Studium/Prüfungen (deine Fassung vor 0.4.4).md.txt",
    "Studium/Noten (neu 0.4.2).md"];
  assert.deepEqual(U.kopienVon("Studium/Prüfungen.md", namen), [{ pfad: namen[0], version: "0.4.2" }, { pfad: namen[1], version: "0.4.1-beta.1" }]);
  assert.deepEqual(U.kopienVon("System/Skripte/zentral.js", ["System/Skripte/zentral (neu 0.4.1).js.txt", "System/Skripte/zentral (neu 0.4.1).js"]),
    [{ pfad: "System/Skripte/zentral (neu 0.4.1).js.txt", version: "0.4.1" }]);
  assert.deepEqual(U.kopienVon("Dashboard.md", ["Dashboard (neu 0.3.0).md", "Studium/Dashboard (neu 0.3.0).md"]),
    [{ pfad: "Dashboard (neu 0.3.0).md", version: "0.3.0" }]);
});

// ---------- Hilfen: Liste und Speicher wie in Obsidian ----------
const HAT_AUFGABE = /^[ \t>]*[-*+] \[[ xX]\]/m;
async function listeBauen(version, dateien) {
  const liste = { schema: 1, version, ordner: "Studium Autopilot", erstellt: "2026-10-15T12:00:00Z", dateien: [] };
  for (const pfad of Object.keys(dateien).sort()) {
    const by = enc(dateien[pfad]);
    const e = { pfad, klasse: U.klasseVon(pfad), groesse: by.length, sha256: await U.sha256(by) };
    if (e.klasse === "modul") e.koerper = await U.sha256(enc(U.teilen(dateien[pfad]).koerper));
    if (e.klasse === "seite" && HAT_AUFGABE.test(dateien[pfad])) e.ohne_haken = await U.sha256(enc(U.ohneHaken(dateien[pfad])));
    liste.dateien.push(e);
  }
  return liste;
}
const BASIS = (v) => `https://raw.githubusercontent.com/studium-autopilot/ecoba/v${v}/`;
// Release-Quelle: Dateien des neuen Stands unter BASIS/Studium Autopilot/…; stoerung(pfad) → "netz" | "kaputt" | undefined
function quelle(version, dateien, listeText, stoerung) {
  const praefix = BASIS(version) + "Studium%20Autopilot/";
  const geholt = [], frisch = [];
  return {
    geholt, frisch,
    holen: async (url, o) => {
      assert.ok(url.startsWith(praefix), url);
      const pfad = url.slice(praefix.length).split("/").map(decodeURIComponent).join("/");
      geholt.push(pfad);
      if (o && o.frisch) frisch.push(pfad);
      const s = stoerung && stoerung(pfad);
      if (s === "netz") throw new Error("offline");
      if (pfad === U.LISTE) return enc(listeText);
      if (!Object.prototype.hasOwnProperty.call(dateien, pfad)) throw new Error("HTTP 404");
      return enc(s === "kaputt" ? dateien[pfad] + "x" : dateien[pfad]);
    },
  };
}
function speicher(dateien, kaputtBei) {
  const m = new Map(Object.entries(dateien).map(([k, v]) => [k, enc(v)]));
  let schreibvorgaenge = 0;
  const reihe = []; // Schreibreihenfolge außerhalb der Sicherung
  return {
    m, reihe,
    text: (p) => (m.has(p) ? dec(m.get(p)) : null),
    stand: () => JSON.stringify(Array.from(m.keys()).filter((k) => !k.startsWith(".trash/")).sort().map((k) => [k, dec(m.get(k))])),
    get schreibvorgaenge() { return schreibvorgaenge; },
    lesen: async (p) => (m.has(p) ? m.get(p) : null),
    schreiben: async (p, b) => {
      if (!p.startsWith(".trash/")) { schreibvorgaenge++; reihe.push(p); if (kaputtBei && kaputtBei(p, schreibvorgaenge)) throw new Error("Platte voll"); }
      m.set(p, b);
    },
    loeschen: async (p) => { m.delete(p); },
    // Dateien direkt im Ordner ("" = Wurzel), wie io.liste in Obsidian
    liste: async (o) => Array.from(m.keys()).filter((k) => {
      const rest = o ? (k.startsWith(o + "/") ? k.slice(o.length + 1) : null) : k;
      return rest != null && rest.indexOf("/") < 0;
    }),
  };
}
async function update(alt, neu, ist, o) {
  o = o || {};
  const altListe = await listeBauen("0.2.0", alt);
  const neuListe = await listeBauen("0.3.0", neu);
  const listeText = JSON.stringify(neuListe, null, 1);
  const q = quelle("0.3.0", neu, listeText, o.stoerung);
  const sp = speicher(Object.assign({}, ist, { "System/Daten/installiert.json": JSON.stringify(altListe) }), o.kaputtBei);
  const release = { version: "0.3.0", url_basis: BASIS("0.3.0"), sha256: o.falscheListe ? "0".repeat(64) : await U.sha256(enc(listeText)), notiz: "" };
  const io = { holen: q.holen, lesen: sp.lesen, schreiben: sp.schreiben, loeschen: sp.loeschen, liste: sp.liste };
  const vorher = sp.stand();
  const b = await U.aktualisierenMit(io, { release, alt: U.listePruefen(altListe).wert, altVersion: "0.2.0", zeit: new Date(2026, 9, 15, 14, 5), marke: o.marke });
  return { b, sp, q, vorher, listeText, release, io };
}

// Ein kleiner Vault: Kern, Skript, Seite mit Checkliste, Modul
const MODUL = (o) => `---
typ: modul
code: B110
titel: Einführung in die BWL
ects: ${o.ects || 6}
verantwortlich: ${o.wer || "Prof. A"}
status: ${o.status || "\"offen\""}
ergebnis:${o.ergebnis ? " " + o.ergebnis : ""}
versuch:
klausur:
semester_geplant: ""
zusatz: false
tags:
  - modul
${o.eigenerTag ? "  - " + o.eigenerTag + "\n" : ""}cssclasses:
  - eba
${o.eigenesFeld ? o.eigenesFeld + "\n" : ""}---

${o.text || "<div>Mein Stand</div>"}
`;
const SEITE = (haken, extra) => `---
cssclasses:
  - eba
---

# Einstellungen & Hilfe

- [${haken ? "x" : " "}] Obsidian öffnen
- [ ] Alma verbinden
${extra || ""}`;
const ALT = {
  [KERN + "main.js"]: "// kern 0.2.0\n", [KERN + "manifest.json"]: '{"version":"0.2.0"}\n',
  "System/Skripte/zentral.js": "// zentral alt\n", "System/Skripte/weg.js": "// fällt weg\n", "System/Skripte/weg2.js": "// fällt weg, geändert\n",
  "Studium/Einstellungen & Hilfe.md": SEITE(false), "Dashboard.md": "# Dashboard alt\n", "Studium/Prüfungen.md": "# Prüfungen alt\n",
  "Module/1 Grundstudium/B110 BWL.md": MODUL({}), "Module/1 Grundstudium/E101 VWL.md": MODUL({ text: "VWL" }),
  ".obsidian/app.json": JSON.stringify({ alwaysUpdateLinks: true }, null, 2),
};
const NEU = {
  [KERN + "main.js"]: "// kern 0.3.0\n", [KERN + "manifest.json"]: '{"version":"0.3.0"}\n',
  "System/Skripte/zentral.js": "// zentral neu\n", "System/Skripte/neu.js": "// ganz neu\n",
  "Studium/Einstellungen & Hilfe.md": SEITE(false, "- [ ] Neu in 0.3.0\n"), "Dashboard.md": "# Dashboard neu\n", "Studium/Prüfungen.md": "# Prüfungen neu\n",
  "Module/1 Grundstudium/B110 BWL.md": MODUL({ ects: 9, wer: "Prof. B", text: "<div>Mein Stand v2</div>" }),
  "Module/1 Grundstudium/E101 VWL.md": MODUL({ ects: 8, text: "VWL v2" }),
  "Module/2 Profil/B220 Marketing.md": MODUL({ text: "Marketing" }),
  ".obsidian/app.json": JSON.stringify({ alwaysUpdateLinks: true, neueEinstellung: 1 }, null, 2),
};

test("Liste prüfen: nur erlaubte Dateien, sonst wird die ganze Liste abgelehnt", async () => {
  const l = await listeBauen("0.3.0", NEU);
  assert.ok(U.listePruefen(l, "0.3.0").wert);
  assert.match(U.listePruefen(l, "0.4.0").fehler, /Version/);
  const mit = (eintrag) => Object.assign({}, l, { dateien: l.dateien.concat([eintrag]) });
  const e = { pfad: "System/Einstellungen.md", klasse: "seite", groesse: 1, sha256: "a".repeat(64) };
  assert.match(U.listePruefen(mit(e)).fehler, /nicht erlaubt/);
  assert.match(U.listePruefen(mit(Object.assign({}, e, { pfad: "../x.md" }))).fehler, /nicht erlaubt/);
  assert.match(U.listePruefen(mit(Object.assign({}, e, { pfad: "Dashboard.md" }))).fehler, /doppelt/);
  assert.match(U.listePruefen(mit(Object.assign({}, e, { pfad: "Studium/X.md", klasse: "system" }))).fehler, /nicht erlaubt/);
  assert.match(U.listePruefen(mit(Object.assign({}, e, { pfad: "Studium/X.md", sha256: "xyz" }))).fehler, /sha256/);
  assert.match(U.listePruefen(Object.assign({}, l, { dateien: l.dateien.filter((x) => x.pfad !== KERN + "main.js") })).fehler, /Kern/);
  assert.match(U.listePruefen(Object.assign({}, l, { ordner: "anders" })).fehler, /ordner/);
  assert.match(U.listePruefen(Object.assign({}, l, { schema: 2 })).fehler, /schema/);
});

test("Haken: nur abgehakte Seite bekommt die neue Fassung mit deinen Haken", () => {
  assert.equal(U.ohneHaken(SEITE(true)), SEITE(false));
  const t = U.seiteHaken(SEITE(true), SEITE(false, "- [ ] Neu in 0.3.0\n"));
  assert.equal(t, SEITE(true, "- [ ] Neu in 0.3.0\n"));
});

test("Modul mischen: Katalog neu, deine Felder, Tags und Text bleiben", () => {
  const neu = NEU["Module/1 Grundstudium/B110 BWL.md"];
  // unverändert → genau die neue Fassung
  assert.equal(U.modulMischen(ALT["Module/1 Grundstudium/B110 BWL.md"], neu, true), neu);
  assert.equal(U.modulMischen(neu, neu, true), neu);
  const deine = MODUL({ status: "bestanden", ergebnis: "1,7", eigenerTag: "lieblingsfach", eigenesFeld: "notiz_eigen: hallo", text: "<div>Mein Stand</div>\n\nMeine Notizen" });
  const mitText = U.modulMischen(deine, neu, false);
  const fm = U.teilen(mitText);
  assert.match(fm.yaml, /^ects: 9$/m);
  assert.match(fm.yaml, /^verantwortlich: Prof\. B$/m);
  assert.match(fm.yaml, /^status: bestanden$/m);
  assert.match(fm.yaml, /^ergebnis: 1,7$/m);
  assert.match(fm.yaml, /^tags:\n {2}- modul\n {2}- lieblingsfach$/m);
  assert.match(fm.yaml, /^notiz_eigen: hallo$/m);
  assert.equal(fm.koerper, U.teilen(deine).koerper, "geänderter Text bleibt");
  const ohneText = U.modulMischen(MODUL({ status: "bestanden" }), neu, true);
  assert.equal(U.teilen(ohneText).koerper, U.teilen(neu).koerper, "unveränderter Text wird neu");
  assert.equal(ohneText, neu.replace('status: "offen"', "status: bestanden"));
  for (const k of U.PERSOENLICH) assert.ok(typeof k === "string");
});

test("Einstellungen (.obsidian/*.json): deine Werte bleiben, Neues kommt dazu", () => {
  const r = JSON.parse(U.jsonMischenText(JSON.stringify({ a: 1, b: { x: 1 }, liste: ["eigen"] }), JSON.stringify({ a: 2, b: { x: 2, y: 3 }, c: 4, liste: ["studium-autopilot"] })));
  assert.deepEqual(r, { a: 1, b: { x: 1, y: 3 }, liste: ["eigen", "studium-autopilot"], c: 4 });
  assert.equal(U.jsonMischenText(JSON.stringify({ a: 1, c: 2 }), JSON.stringify({ a: 2 })), null, "nichts zu tun");
  assert.equal(U.jsonMischenText("{kaputt", '{"a":1}'), '{"a":1}');
  assert.deepEqual(JSON.parse(U.jsonMischenText(JSON.stringify(["a", "b"]), JSON.stringify(["studium-autopilot"]))), ["a", "b", "studium-autopilot"]);
});

test("Einstellungen: geänderte Vorgaben (app.json seit 0.4.6) nur für den alten Wert und nur beim Update von davor", () => {
  const vorlage = JSON.stringify({ newFileLocation: "folder", newFileFolderPath: "Vorlesungen", showUnsupportedFiles: false, promptDelete: false });
  const alt = JSON.stringify({ newFileLocation: "root", newFileFolderPath: "Vorlesungen", showUnsupportedFiles: true, promptDelete: true });
  const r = JSON.parse(U.jsonMischenText(alt, vorlage, ".obsidian/app.json", "0.4.5"));
  assert.deepEqual([r.newFileLocation, r.showUnsupportedFiles, r.promptDelete], ["folder", false, true], "alte Vorgaben wechseln, deine übrigen Werte bleiben");
  const eigen = JSON.parse(U.jsonMischenText(JSON.stringify({ newFileLocation: "current", showUnsupportedFiles: true }), vorlage, ".obsidian/app.json", "0.4.5"));
  assert.equal(eigen.newFileLocation, "current", "selbst gewählt bleibt");
  assert.equal(U.jsonMischenText(JSON.stringify({ newFileLocation: "root", newFileFolderPath: "Vorlesungen", showUnsupportedFiles: true, promptDelete: false }), vorlage, ".obsidian/app.json", "0.4.6"),
    null, "von 0.4.6 an: deine Werte bleiben, auch wenn sie den alten Vorgaben gleichen");
  assert.equal(U.jsonMischenText(alt, vorlage, ".obsidian/core-plugins.json", "0.4.5"), null, "nur die genannte Datei");
});

test("Einstellungen: Reparatur setzt geänderte Vorgaben einmal je Gerät, nur für den alten Wert (Update mit älterem Planer)", () => {
  const r = laden("update");
  const speicher = {};
  r.ctx.app.loadLocalStorage = (k) => (k in speicher ? speicher[k] : null);
  r.ctx.app.saveLocalStorage = (k, v) => { speicher[k] = v; };
  const W = r.ctx.update;
  const config = { newFileLocation: "root", showUnsupportedFiles: false, promptDelete: true };
  const vault = { getConfig: (k) => config[k], setConfig: (k, v) => { config[k] = v; } };
  assert.deepEqual(W.vorgabenAnwenden("0.4.5", vault), [], "Version ohne die Vorgabe: nichts");
  assert.deepEqual(W.vorgabenAnwenden("0.4.6", vault), ["newFileLocation"]);
  assert.deepEqual(config, { newFileLocation: "folder", showUnsupportedFiles: false, promptDelete: true }, "nur der alte Wert wechselt");
  config.newFileLocation = "root";
  assert.deepEqual(W.vorgabenAnwenden("0.4.7", vault), [], "einmal je Gerät: danach selbst Gewähltes bleibt");
  assert.equal(config.newFileLocation, "root");
  assert.deepEqual(laden("update").ctx.update.vorgabenAnwenden("0.4.6", {}), [], "ohne getConfig: nichts");
});

test("Plan: Entscheidung je Datei", async () => {
  const alt = U.listePruefen(await listeBauen("0.2.0", ALT)).wert;
  const neu = U.listePruefen(await listeBauen("0.3.0", NEU)).wert;
  const ist = {};
  const setzen = async (p, text) => {
    const k = U.klasseVon(p);
    ist[p] = { sha: await U.sha256(enc(text)) };
    if (k === "modul") ist[p].koerper = await U.sha256(enc(U.teilen(text).koerper));
    if (k === "seite" && U.hatAufgaben(text)) ist[p].ohneHaken = await U.sha256(enc(U.ohneHaken(text)));
  };
  for (const p of Object.keys(ALT)) await setzen(p, ALT[p]);
  await setzen("Dashboard.md", "# Mein Dashboard\n");                         // selbst geändert
  await setzen("Studium/Einstellungen & Hilfe.md", SEITE(true));              // nur abgehakt
  await setzen("Module/1 Grundstudium/B110 BWL.md", MODUL({ status: "läuft" })); // Feld geändert
  delete ist["Studium/Prüfungen.md"];                                          // gelöscht
  await setzen("System/Skripte/weg2.js", "// fällt weg, von mir geändert\n");
  await setzen(".obsidian/app.json", JSON.stringify({ alwaysUpdateLinks: false }, null, 2));
  ist["System/Skripte/neu.js"] = undefined; delete ist["System/Skripte/neu.js"];
  const art = {};
  for (const s of U.planen(neu, alt, ist)) art[s.pfad] = s.art + (s.koerperNeu ? "+text" : "");
  assert.deepEqual(art, {
    [KERN + "main.js"]: "ersetzen", [KERN + "manifest.json"]: "ersetzen", "System/Skripte/zentral.js": "ersetzen",
    "System/Skripte/neu.js": "anlegen", "Dashboard.md": "behalten-neu", "Studium/Einstellungen & Hilfe.md": "seite-haken",
    "Studium/Prüfungen.md": "uebersprungen", "Module/1 Grundstudium/B110 BWL.md": "modul-mischen+text",
    "Module/1 Grundstudium/E101 VWL.md": "ersetzen", "Module/2 Profil/B220 Marketing.md": "anlegen",
    ".obsidian/app.json": "json-mischen", "System/Skripte/weg.js": "entfernen", "System/Skripte/weg2.js": "entfernen-sichern",
  });
  // Ohne installierte Liste: nichts gilt als unverändert, also wird nichts Geändertes ohne Sicherung überschrieben
  const ohne = U.planen(neu, null, ist);
  assert.ok(ohne.every((s) => s.art !== "ersetzen" && s.art !== "entfernen" && s.art !== "uebersprungen"));
});

// Systemdateien, Vorlage unverändert, schon neu (seit 0.4.4)
const ALT2 = {
  [KERN + "main.js"]: "// kern 0.2.0\n", [KERN + "manifest.json"]: '{"version":"0.2.0"}\n', ".obsidian/snippets/eba-core.css": "/* alt */\n",
  "System/Skripte/zentral.js": "// zentral alt\n", "Studium/Prüfungen.md": "# Prüfungen\n", "Dashboard.md": "# Dashboard alt\n",
  "Studium/Noten.md": "# Noten alt\n", "Module/1 Grundstudium/B110 BWL.md": MODUL({}),
};
const NEU2 = Object.assign({}, ALT2, {
  [KERN + "main.js"]: "// kern 0.3.0\n", [KERN + "manifest.json"]: '{"version":"0.3.0"}\n', ".obsidian/snippets/eba-core.css": "/* neu */\n",
  "System/Skripte/zentral.js": "// zentral neu\n", "Dashboard.md": "# Dashboard neu\n", "Studium/Noten.md": "# Noten neu\n",
}); // Prüfungen und B110 bleiben in der Vorlage gleich

test("Plan: Systemdateien kommen immer neu, unveränderte Vorlage lässt deine Seite in Ruhe", async () => {
  const alt = U.listePruefen(await listeBauen("0.2.0", ALT2)).wert;
  const neu = U.listePruefen(await listeBauen("0.3.0", NEU2)).wert;
  const ist = {};
  for (const [p, t] of Object.entries(Object.assign({}, ALT2, {
    ".obsidian/snippets/eba-core.css": "/* von Hand */\n",       // selbst geändert
    [KERN + "main.js"]: "// kern, von Hand\n",                    // selbst geändert
    "Studium/Prüfungen.md": "# Prüfungen\n\nalte Fußzeile\n",     // geändert, Vorlage gleich
    "Module/1 Grundstudium/B110 BWL.md": MODUL({ status: "läuft" }), // geändert, Vorlage gleich
    "Dashboard.md": "# Dashboard neu\n",                          // schon gleich der neuen Fassung
  }))) {
    ist[p] = { sha: await U.sha256(enc(t)) };
    if (U.klasseVon(p) === "modul") ist[p].koerper = await U.sha256(enc(U.teilen(t).koerper));
  }
  const art = {};
  for (const s of U.planen(neu, alt, ist)) art[s.pfad] = s.art;
  assert.deepEqual(art, {
    [KERN + "main.js"]: "ersetzen-sichern", [KERN + "manifest.json"]: "ersetzen", ".obsidian/snippets/eba-core.css": "ersetzen-sichern",
    "System/Skripte/zentral.js": "ersetzen", "Studium/Prüfungen.md": "eigene", "Module/1 Grundstudium/B110 BWL.md": "eigene",
    "Dashboard.md": "gleich", "Studium/Noten.md": "ersetzen",
  });
  // Ohne installierte Liste: Systemdateien trotzdem neu (mit Sicherung), Seiten bekommen die neue Fassung daneben
  const ohne = {};
  for (const s of U.planen(neu, null, ist)) ohne[s.pfad] = s.art;
  assert.equal(ohne[".obsidian/snippets/eba-core.css"], "ersetzen-sichern");
  assert.equal(ohne["Studium/Prüfungen.md"], "behalten-neu");
});

test("Update: selbst geänderte Darstellung und Programmteile werden ersetzt, deine Fassung liegt daneben", async () => {
  const CSS = ".obsidian/snippets/eba-core.css", CSS_DEIN = ".obsidian/snippets/eba-core (deine Fassung vor 0.3.0).css.txt";
  const MAIN_DEIN = KERN + "main (deine Fassung vor 0.3.0).js.txt";
  const ist = Object.assign({}, ALT2, { [CSS]: "/* von Hand */\n", [KERN + "main.js"]: "// kern, von Hand\n" });
  const { b, sp, listeText, q } = await update(ALT2, NEU2, ist);
  assert.equal(b.ok, true, b.fehler);
  assert.equal(sp.text(CSS), NEU2[CSS], "die neue Darstellung ist aktiv");
  assert.equal(sp.text(CSS_DEIN), "/* von Hand */\n", "deine Fassung als Sicherung daneben");
  assert.equal(sp.text(KERN + "main.js"), NEU2[KERN + "main.js"]);
  assert.equal(sp.text(MAIN_DEIN), "// kern, von Hand\n");
  assert.equal(sp.text(".obsidian/snippets/eba-core (neu 0.3.0).css.txt"), null, "keine neue Fassung mehr beiseite");
  assert.deepEqual(b.gesichert, [{ pfad: KERN + "main.js", sicherung: MAIN_DEIN }, { pfad: CSS, sicherung: CSS_DEIN }]);
  assert.deepEqual(b.neuKopien.map((x) => x.pfad), []);
  assert.equal(sp.text(b.sicherung + "/" + CSS), "/* von Hand */\n");
  // Sicherung vor der neuen Fassung, Kern zuletzt (vor den Listen)
  const r = sp.reihe;
  assert.ok(r.indexOf(CSS_DEIN) < r.indexOf(CSS) && r.indexOf(MAIN_DEIN) < r.indexOf(KERN + "main.js"));
  assert.deepEqual(r.slice(-4), [KERN + "main.js", KERN + "manifest.json", U.LISTE, U.INSTALLIERT]);
  // Zweiter Lauf derselben Version: nichts mehr zu tun, keine zweite Sicherung
  const vorher = sp.stand();
  const b2 = await U.aktualisierenMit({ holen: q.holen, lesen: sp.lesen, schreiben: sp.schreiben, loeschen: sp.loeschen, liste: sp.liste },
    { release: { version: "0.3.0", url_basis: BASIS("0.3.0"), sha256: await U.sha256(enc(listeText)) }, alt: U.listePruefen(JSON.parse(listeText)).wert, altVersion: "0.3.0", zeit: new Date() });
  assert.equal(b2.ok, true);
  assert.equal(b2.gesichert.length + b2.geaendert.length, 0);
  assert.equal(sp.stand(), vorher);
  // Name schon mit anderem Inhalt belegt → nächster freier Name, nichts geht verloren
  const r2 = await update(ALT2, NEU2, Object.assign({}, ist, { [CSS_DEIN]: "/* ältere Sicherung */\n" }));
  assert.equal(r2.sp.text(CSS_DEIN), "/* ältere Sicherung */\n");
  assert.equal(r2.sp.text(".obsidian/snippets/eba-core (deine Fassung vor 0.3.0, 2).css.txt"), "/* von Hand */\n");
});

test("Update: keine Kopie, wenn die Vorlage gleich blieb oder deine Seite schon neu ist; alte Kopien gehen weg", async () => {
  const P = "Studium/Prüfungen.md", D = "Dashboard.md";
  const ist = Object.assign({}, ALT2, {
    [P]: "# Prüfungen\n\nalte Fußzeile\n",                            // geändert, Vorlage gleich → bleibt, keine Kopie
    "Studium/Prüfungen (neu 0.1.0).md": ALT2[P],                       // alte Kopie = Vorlage → weg
    "Studium/Prüfungen (neu 0.1.5).md": "# Prüfungen\n\nmeine Notiz\n", // Kopie, die du geändert hast → bleibt
    [D]: "# Mein Dashboard\n",                                         // geändert, Vorlage neu → Kopie daneben
    "Dashboard (neu 0.2.0).md": ALT2[D],                               // Kopie der alten Vorlage → weg
    "Studium/Noten.md": NEU2["Studium/Noten.md"],                      // schon die neue Fassung → nichts
    "Studium/Eigene (neu 0.1.0).md": "# eigene Seite\n",               // keine Seite der Vorlage → nie angefasst
  });
  const { b, sp } = await update(ALT2, NEU2, ist);
  assert.equal(b.ok, true, b.fehler);
  assert.equal(sp.text(P), ist[P], "deine Seite bleibt");
  assert.equal(sp.text("Studium/Prüfungen (neu 0.3.0).md"), null, "keine Kopie ohne neue Vorlage");
  assert.equal(sp.text("Studium/Prüfungen (neu 0.1.0).md"), null);
  assert.equal(sp.text("Studium/Prüfungen (neu 0.1.5).md"), ist["Studium/Prüfungen (neu 0.1.5).md"]);
  assert.equal(sp.text("Dashboard (neu 0.3.0).md"), NEU2[D]);
  assert.equal(sp.text("Dashboard (neu 0.2.0).md"), null);
  assert.equal(sp.text("Studium/Noten (neu 0.3.0).md"), null);
  assert.equal(sp.text("Studium/Eigene (neu 0.1.0).md"), "# eigene Seite\n");
  assert.equal(sp.text("Module/1 Grundstudium/B110 BWL.md"), ALT2["Module/1 Grundstudium/B110 BWL.md"]);
  assert.deepEqual(b.neuKopien, [{ pfad: D, kopie: "Dashboard (neu 0.3.0).md" }]);
  assert.deepEqual(b.aufgeraeumt.sort(), ["Dashboard (neu 0.2.0).md", "Studium/Prüfungen (neu 0.1.0).md"]);
  assert.equal(sp.text(b.sicherung + "/Studium/Prüfungen (neu 0.1.0).md"), ALT2[P], "weggeräumte Kopie liegt in der Sicherung");
  assert.ok(sp.reihe.indexOf("Studium/Noten.md") < 0);
});

// ---------- Reparatur nach dem Update auf 0.4.4 (heilenMit) ----------
const REL = {
  [KERN + "main.js"]: "// kern 0.4.4\n", [KERN + "manifest.json"]: '{"version":"0.4.4"}\n', ".obsidian/snippets/eba-core.css": "/* 0.4.4 */\n",
  "System/Skripte/zentral.js": "// zentral 0.4.4\n", "System/Skripte/termine.js": "// termine 0.4.4\n", "System/Skripte/ilias.js": "// ilias 0.4.4\n",
  "Studium/Prüfungen.md": "# Prüfungen 0.4.4\n", "Dashboard.md": "# Dashboard 0.4.4\n",
};
// So sah ein Tresor nach dem Update auf 0.4.4 aus, das der alte update.js (0.4.3) geplant hat
const NACH_043 = Object.assign({}, REL, {
  ".obsidian/snippets/eba-core.css": "/* von Hand */\n",
  ".obsidian/snippets/eba-core (neu 0.4.4).css.txt": REL[".obsidian/snippets/eba-core.css"],
  ".obsidian/snippets/eba-core (neu 0.4.1).css.txt": "/* 0.4.1 */\n",
  ".obsidian/snippets/eba-core (neu 0.4.5).css.txt": "/* kommt gerade per Sync */\n",
  [KERN + "main.js"]: "// kern, von Hand\n", [KERN + "main (neu 0.4.4).js.txt"]: REL[KERN + "main.js"],
  "System/Skripte/zentral.js": "// zentral, von Hand\n", "System/Skripte/zentral (neu 0.4.4).js.txt": REL["System/Skripte/zentral.js"],
  "System/Skripte/termine (neu 0.4.2).js.txt": "// termine 0.4.2\n",                   // aktive Datei ist schon richtig
  "System/Skripte/ilias.js": "// ilias, anders\n", "System/Skripte/ilias (neu 0.4.3).js.txt": "// ilias 0.4.3\n", // neue Fassung fehlt
  "Studium/Prüfungen.md": "# Prüfungen 0.4.4\n\nalte Fußzeile\n",
  "Studium/Prüfungen (neu 0.4.2).md": REL["Studium/Prüfungen.md"],      // = jetzige Vorlage, älter → weg
  "Studium/Prüfungen (neu 0.4.3).md": "# Prüfungen\n\nmeine Notiz\n",    // selbst geändert → bleibt
  "Studium/Prüfungen (neu 0.4.4).md": REL["Studium/Prüfungen.md"],      // diese Version → bleibt
  "Dashboard (neu 0.4.1).md": REL["Dashboard.md"],                      // = jetzige Vorlage, älter → weg
  "Studium/Eigene (neu 0.4.1).md": "# eigene Seite\n",                  // keine Seite der Vorlage
});
async function heilen(dateien, o) {
  o = o || {};
  const liste = U.listePruefen(await listeBauen("0.4.4", REL)).wert;
  const sp = o.sp || speicher(dateien, o.kaputtBei);
  const vorher = sp.stand();
  const b = await U.heilenMit({ lesen: sp.lesen, schreiben: sp.schreiben, loeschen: sp.loeschen, liste: sp.liste },
    { liste, synchron: !!o.synchron, zeit: new Date(2026, 9, 18, 9, 30) });
  return { b, sp, vorher };
}

test("Reparatur: beiseitegelegte neue Fassung wird aktiv, deine liegt als Sicherung daneben", async () => {
  const CSS = ".obsidian/snippets/eba-core.css";
  // Gerät, das nicht für alle schreibt: nur seine eigenen .obsidian-Dateien
  let { b, sp } = await heilen(NACH_043);
  assert.equal(b.ok, true, b.fehler);
  assert.equal(sp.text(CSS), REL[CSS]);
  assert.equal(sp.text(".obsidian/snippets/eba-core (deine Fassung vor 0.4.4).css.txt"), "/* von Hand */\n");
  assert.equal(sp.text(".obsidian/snippets/eba-core (neu 0.4.4).css.txt"), null);
  assert.equal(sp.text(".obsidian/snippets/eba-core (neu 0.4.1).css.txt"), null, "ältere beiseitegelegte Fassung weg");
  assert.equal(sp.text(".obsidian/snippets/eba-core (neu 0.4.5).css.txt"), "/* kommt gerade per Sync */\n", "neuere bleibt");
  assert.equal(sp.text(KERN + "main.js"), REL[KERN + "main.js"]);
  assert.equal(sp.text(KERN + "main (deine Fassung vor 0.4.4).js.txt"), "// kern, von Hand\n");
  assert.equal(b.plugin, true);
  assert.equal(sp.reihe[sp.reihe.length - 1], KERN + "main.js", "Kern zuletzt");
  assert.equal(sp.text(b.sicherung + "/.obsidian/snippets/eba-core (neu 0.4.1).css.txt"), "/* 0.4.1 */\n");
  assert.equal(b.sicherung, ".trash/Studium Autopilot Sicherung 0.4.4 2026-10-18 09-30");
  for (const p of ["System/Skripte/zentral.js", "System/Skripte/zentral (neu 0.4.4).js.txt", "Studium/Prüfungen (neu 0.4.2).md", "Dashboard (neu 0.4.1).md"]) {
    assert.equal(sp.text(p), NACH_043[p], "synchronisiert: nicht auf diesem Gerät " + p);
  }
  // Das Gerät, das für alle schreibt: auch Skripte und alte Kopien von Seiten
  ({ b, sp } = await heilen(null, { sp, synchron: true }));
  assert.equal(b.ok, true, b.fehler);
  assert.equal(sp.text("System/Skripte/zentral.js"), REL["System/Skripte/zentral.js"]);
  assert.equal(sp.text("System/Skripte/zentral (deine Fassung vor 0.4.4).js.txt"), "// zentral, von Hand\n");
  assert.equal(sp.text("System/Skripte/zentral (neu 0.4.4).js.txt"), null);
  assert.equal(sp.text("System/Skripte/termine (neu 0.4.2).js.txt"), null, "aktive Datei richtig → alte Fassung weg");
  assert.equal(sp.text("System/Skripte/termine.js"), REL["System/Skripte/termine.js"]);
  assert.equal(sp.text("System/Skripte/ilias.js"), "// ilias, anders\n", "ohne neue Fassung auf dem Gerät: nichts");
  assert.equal(sp.text("System/Skripte/ilias (neu 0.4.3).js.txt"), "// ilias 0.4.3\n");
  assert.deepEqual(b.getauscht, [{ pfad: "System/Skripte/zentral.js", sicherung: "System/Skripte/zentral (deine Fassung vor 0.4.4).js.txt" }]);
  assert.equal(b.plugin, false);
  // Seiten: nie die Seite selbst, nur unveränderte ältere Kopien
  assert.equal(sp.text("Studium/Prüfungen.md"), NACH_043["Studium/Prüfungen.md"]);
  assert.equal(sp.text("Studium/Prüfungen (neu 0.4.2).md"), null);
  assert.equal(sp.text("Studium/Prüfungen (neu 0.4.3).md"), NACH_043["Studium/Prüfungen (neu 0.4.3).md"]);
  assert.equal(sp.text("Studium/Prüfungen (neu 0.4.4).md"), REL["Studium/Prüfungen.md"]);
  assert.equal(sp.text("Dashboard (neu 0.4.1).md"), null);
  assert.equal(sp.text("Studium/Eigene (neu 0.4.1).md"), "# eigene Seite\n");
  // Zweiter Lauf: nichts mehr zu tun
  const n = sp.schreibvorgaenge, stand = sp.stand();
  ({ b } = await heilen(null, { sp, synchron: true }));
  assert.equal(b.ok, true);
  assert.equal(b.getauscht.length + b.entfernt.length, 0);
  assert.equal(sp.schreibvorgaenge, n);
  assert.equal(sp.stand(), stand);
});

test("Reparatur: ohne beiseitegelegte Fassung nichts; Schreibfehler setzt alles zurück", async () => {
  // Gerät ohne Kopien (z. B. ein anderes iPad): nichts anfassen
  const ohne = Object.assign({}, REL, { ".obsidian/snippets/eba-core.css": "/* alt */\n", "Studium/Prüfungen.md": "# meins\n" });
  let r = await heilen(ohne, { synchron: true });
  assert.equal(r.b.ok, true);
  assert.equal(r.sp.schreibvorgaenge, 0);
  assert.equal(r.sp.stand(), r.vorher);
  // Schreibfehler beim Kern (zuletzt) → Sicherung und neue Fassung wieder zurück, nichts entfernt
  r = await heilen(NACH_043, { synchron: true, kaputtBei: (p) => p === KERN + "main.js" });
  assert.equal(r.b.ok, false);
  assert.equal(r.b.art, "schreiben");
  assert.equal(r.b.zurueckgesetzt, true);
  assert.equal(r.sp.stand(), r.vorher);
});

test("Update: ganzer Ablauf mit Sicherung, Kopien und Mischen", async () => {
  const ist = Object.assign({}, ALT, {
    "Dashboard.md": "# Mein Dashboard\n", "Studium/Einstellungen & Hilfe.md": SEITE(true),
    "Module/1 Grundstudium/B110 BWL.md": MODUL({ status: "läuft", ergebnis: "2,0" }),
    "System/Skripte/weg2.js": "// fällt weg, von mir geändert\n",
    "System/Daten/Semester.md": "nie anfassen", "System/Einstellungen.md": "name: Ich", "Termine/2026-10-12 X.md": "eigener Termin",
  });
  delete ist["Studium/Prüfungen.md"];
  const { b, sp, q, listeText } = await update(ALT, NEU, ist);
  assert.equal(b.ok, true, b.fehler);
  assert.equal(sp.text(KERN + "main.js"), NEU[KERN + "main.js"]);
  assert.equal(sp.text("System/Skripte/neu.js"), NEU["System/Skripte/neu.js"]);
  assert.equal(sp.text("Dashboard.md"), "# Mein Dashboard\n", "deine Seite bleibt");
  assert.equal(sp.text("Dashboard (neu 0.3.0).md"), NEU["Dashboard.md"], "neue Fassung daneben");
  assert.equal(sp.text("Studium/Einstellungen & Hilfe.md"), SEITE(true, "- [ ] Neu in 0.3.0\n"));
  assert.equal(sp.text("Studium/Prüfungen.md"), null, "gelöschte Seite kommt nicht wieder");
  const b110 = sp.text("Module/1 Grundstudium/B110 BWL.md");
  assert.match(b110, /^ects: 9$/m); assert.match(b110, /^status: läuft$/m); assert.match(b110, /^ergebnis: 2,0$/m); assert.match(b110, /Mein Stand v2/);
  assert.equal(sp.text("Module/2 Profil/B220 Marketing.md"), NEU["Module/2 Profil/B220 Marketing.md"]);
  assert.deepEqual(JSON.parse(sp.text(".obsidian/app.json")), { alwaysUpdateLinks: true, neueEinstellung: 1 });
  assert.equal(sp.text("System/Skripte/weg.js"), null, "unverändert weggefallen → nur noch in der Sicherung");
  // Weggefallenes Skript, selbst geändert: würde sonst weiter geladen → weg, deine Fassung als .txt daneben
  assert.equal(sp.text("System/Skripte/weg2.js"), null);
  assert.equal(sp.text("System/Skripte/weg2 (deine Fassung vor 0.3.0).js.txt"), "// fällt weg, von mir geändert\n");
  assert.deepEqual(b.gesichert, [{ pfad: "System/Skripte/weg2.js", sicherung: "System/Skripte/weg2 (deine Fassung vor 0.3.0).js.txt" }]);
  for (const p of ["System/Daten/Semester.md", "System/Einstellungen.md", "Termine/2026-10-12 X.md"]) assert.equal(sp.text(p), ist[p], p);
  assert.equal(sp.text(U.LISTE), listeText); assert.equal(sp.text(U.INSTALLIERT), listeText);
  // Sicherung
  assert.equal(b.sicherung, ".trash/Studium Autopilot Sicherung 0.2.0 2026-10-15 14-05");
  assert.equal(sp.text(b.sicherung + "/" + KERN + "main.js"), ALT[KERN + "main.js"]);
  assert.equal(sp.text(b.sicherung + "/System/Skripte/weg.js"), ALT["System/Skripte/weg.js"]);
  assert.equal(sp.text(b.sicherung + "/Module/1 Grundstudium/B110 BWL.md"), ist["Module/1 Grundstudium/B110 BWL.md"]);
  // nur geänderte Dateien geladen, Kern zuletzt geschrieben
  assert.ok(q.geholt.indexOf("Studium/Prüfungen.md") < 0);
  assert.equal(b.plugin, true);
  assert.deepEqual(b.neuKopien, [{ pfad: "Dashboard.md", kopie: "Dashboard (neu 0.3.0).md" }]);
  // Ein zweiter Lauf mit derselben Version (z. B. zweites Gerät nach dem Sync) ändert nichts mehr
  const alt2 = U.listePruefen(JSON.parse(listeText)).wert;
  const vorher = sp.stand();
  const b2 = await U.aktualisierenMit({ holen: q.holen, lesen: sp.lesen, schreiben: sp.schreiben, loeschen: sp.loeschen },
    { release: { version: "0.3.0", url_basis: BASIS("0.3.0"), sha256: await U.sha256(enc(listeText)) }, alt: alt2, altVersion: "0.3.0", zeit: new Date() });
  assert.equal(b2.ok, true);
  assert.equal(b2.geaendert.length + b2.angelegt.length + b2.gemischt.length + b2.neuKopien.length, 0);
  assert.equal(sp.stand(), vorher);
});

test("Weggefallene Seite: unverändert in die Sicherung, Lesezeichen darauf fallen weg; selbst geändert bleibt sie", async () => {
  const PLANER = "Studium/Schwerpunkt-Planer.md", LZ = ".obsidian/bookmarks.json";
  const lz = (pfade) => JSON.stringify({ items: pfade.map((p, i) => ({ type: "file", ctime: i, path: p, title: p })) }, null, 2);
  const alt = Object.assign({}, ALT, { [PLANER]: "# Planer\n", [LZ]: lz(["Dashboard.md", PLANER]) });
  const neu = Object.assign({}, NEU, { [LZ]: lz(["Dashboard.md"]) });
  // Lesezeichen selbst ergänzt (mit Gruppe): Die Datei wird gemischt, deine Lesezeichen bleiben, die auf den Planer fallen weg
  const deine = JSON.stringify({ items: [{ type: "file", ctime: 0, path: "Dashboard.md", title: "Dashboard" },
    { type: "group", ctime: 5, title: "Meins", items: [{ type: "file", ctime: 6, path: PLANER }, { type: "file", ctime: 7, path: "Termine/X.md" }] },
    { type: "file", ctime: 1, path: PLANER, title: "Planer" }] }, null, 2);
  let r = await update(alt, neu, Object.assign({}, alt, { [LZ]: deine }));
  assert.equal(r.b.ok, true, r.b.fehler);
  assert.equal(r.sp.text(PLANER), null);
  assert.equal(r.sp.text(r.b.sicherung + "/" + PLANER), "# Planer\n");
  assert.equal(r.sp.text(r.b.sicherung + "/" + LZ), deine);
  const L = JSON.parse(r.sp.text(LZ));
  assert.deepEqual(L.items.map((x) => x.path || x.title), ["Dashboard.md", "Meins"]);
  assert.deepEqual(L.items[1].items.map((x) => x.path), ["Termine/X.md"]);
  assert.ok(r.b.einstellungen.indexOf(LZ) >= 0);
  // Planer selbst geändert: bleibt samt Lesezeichen, das Ergebnisfenster nennt ihn
  r = await update(alt, neu, Object.assign({}, alt, { [PLANER]: "# Mein Planer\n", [LZ]: deine }));
  assert.equal(r.b.ok, true, r.b.fehler);
  assert.equal(r.sp.text(PLANER), "# Mein Planer\n");
  assert.deepEqual(r.b.behalten, [PLANER]);
  assert.equal(r.sp.text(LZ), deine);
  // Lesezeichen unverändert: Die neue Fassung ersetzt sie
  r = await update(alt, neu, alt);
  assert.equal(r.sp.text(LZ), neu[LZ]);
  // Hilfe allein: nichts zu tun ohne Treffer, kaputter Text, keine Liste
  assert.equal(U.lesezeichenOhne(lz(["Dashboard.md"]), [PLANER]), null);
  assert.equal(U.lesezeichenOhne("{kaputt", [PLANER]), null);
  assert.equal(U.lesezeichenOhne(lz([PLANER]), []), null);
});

test("Alles oder nichts: falsche Prüfsumme, kein Netz, Schreibfehler", async () => {
  let r = await update(ALT, NEU, ALT, { falscheListe: true });
  assert.equal(r.b.ok, false); assert.equal(r.b.art, "pruefsumme"); assert.equal(r.sp.schreibvorgaenge, 0); assert.equal(r.sp.stand(), r.vorher);

  r = await update(ALT, NEU, ALT, { stoerung: (p) => (p === "Module/2 Profil/B220 Marketing.md" ? "kaputt" : undefined) });
  assert.equal(r.b.ok, false); assert.equal(r.b.art, "pruefsumme"); assert.equal(r.sp.schreibvorgaenge, 0); assert.equal(r.sp.stand(), r.vorher);

  r = await update(ALT, NEU, ALT, { stoerung: (p) => (p === "System/Skripte/neu.js" ? "netz" : undefined) });
  assert.equal(r.b.ok, false); assert.equal(r.b.art, "netz"); assert.equal(r.sp.schreibvorgaenge, 0); assert.equal(r.sp.stand(), r.vorher);

  r = await update(ALT, NEU, ALT, { stoerung: (p) => (p === U.LISTE ? "netz" : undefined) });
  assert.equal(r.b.art, "netz"); assert.equal(r.sp.stand(), r.vorher);

  // Schreibfehler mitten drin → alles zurück (auch neu angelegte Dateien wieder weg)
  r = await update(ALT, NEU, ALT, { kaputtBei: (_p, n) => n === 5 });
  assert.equal(r.b.ok, false); assert.equal(r.b.art, "schreiben"); assert.equal(r.b.zurueckgesetzt, true);
  assert.equal(r.sp.stand(), r.vorher);
});

test("Neu laden: Kern, den der Sync nicht geliefert hat, kommt aus dem Release dieser Version, geprüft, manifest.json zuletzt", async () => {
  const liste = U.listePruefen(await listeBauen("0.3.0", NEU)).wert;
  const kern = (o) => Object.assign({}, NEU, { [KERN + "main.js"]: ALT[KERN + "main.js"], [KERN + "manifest.json"]: ALT[KERN + "manifest.json"] }, o);
  const lauf = async (ist, o) => {
    o = o || {};
    const q = quelle("0.3.0", NEU, "", o.stoerung);
    const sp = speicher(ist, o.kaputtBei);
    const vorher = sp.stand();
    const r = await U.kernNachholen({ holen: q.holen, lesen: sp.lesen, schreiben: sp.schreiben, loeschen: sp.loeschen }, { liste, basis: BASIS("0.3.0") });
    return { r, q, sp, vorher };
  };
  // Alter Kern auf der Platte (Befund iPhone 21.10.2026): beide Dateien neu, manifest.json zuletzt, sonst nichts geholt
  let x = await lauf(kern());
  assert.equal(x.r.ok, true);
  assert.deepEqual(x.q.geholt, [KERN + "main.js", KERN + "manifest.json"]);
  assert.deepEqual(x.sp.reihe, [KERN + "main.js", KERN + "manifest.json"]);
  assert.equal(x.sp.text(KERN + "manifest.json"), NEU[KERN + "manifest.json"]);
  // Kern schon da (der Sync war schneller): nichts laden, nichts schreiben
  x = await lauf(NEU);
  assert.equal(x.r.ok, true); assert.deepEqual(x.q.geholt, []); assert.equal(x.sp.schreibvorgaenge, 0);
  // Falsche Prüfsumme, kein Netz: nichts geschrieben
  x = await lauf(kern(), { stoerung: (p) => (p === KERN + "manifest.json" ? "kaputt" : undefined) });
  assert.equal(x.r.art, "pruefsumme"); assert.equal(x.sp.schreibvorgaenge, 0);
  x = await lauf(kern(), { stoerung: () => "netz" });
  assert.equal(x.r.art, "netz"); assert.equal(x.sp.schreibvorgaenge, 0);
  // Schreibfehler bei manifest.json: main.js wieder alt
  x = await lauf(kern(), { kaputtBei: (p) => p === KERN + "manifest.json" });
  assert.equal(x.r.art, "schreiben"); assert.equal(x.sp.stand(), x.vorher);
});

test("Manifest der zentralen Daten: Feld release (optional, streng)", () => {
  const m = { schema: 1, erstellt: "2026-10-15T07:53:49Z", dateien: {}, plugin_aktuell: "0.2.0" };
  const rel = { version: "0.2.0", url_basis: "https://raw.githubusercontent.com/studium-autopilot/ecoba/v0.2.0/", sha256: "a".repeat(64), notiz: "Update-Knopf <b>neu</b>" };
  let w = Z.manifestPruefen(Object.assign({}, m, { release: rel })).wert;
  assert.deepEqual(w.release, { version: "0.2.0", url_basis: rel.url_basis, sha256: rel.sha256, notiz: "Update-Knopf neu" });
  assert.equal(Z.manifestPruefen(m).wert.release, null, "fehlt → null");
  for (const anders of [{ url_basis: "https://raw.githubusercontent.com/studium-autopilot/ecoba/v0.3.0/" }, { url_basis: "https://example.org/v0.2.0/" },
    { url_basis: "http://raw.githubusercontent.com/studium-autopilot/ecoba/v0.2.0/" }, { sha256: "A".repeat(64) }, { version: "0.2" }]) {
    w = Z.manifestPruefen(Object.assign({}, m, { release: Object.assign({}, rel, anders) })).wert;
    assert.ok(w, "Manifest bleibt gültig"); assert.equal(w.release, null, JSON.stringify(anders));
  }
  assert.equal(Z.manifestPruefen(Object.assign({}, m, { release: Object.assign({}, rel, { notiz: "x".repeat(201) }) })).wert.release.notiz, "");
});

// Im veröffentlichten Repo liegt system-dateien.json im Vault (von werkzeuge/release.py erzeugt). Dann muss sie zu den Dateien
// passen: gleiche Klasse wie klasseVon, Größe und SHA-256 stimmen, jede Datei mit Klasse steht drin.
const VAULT = path.join(__dirname, "..", "Studium Autopilot");
const LISTE_DATEI = path.join(VAULT, "System", "Daten", "system-dateien.json");
test("system-dateien.json passt zum Vault", { skip: !fs.existsSync(LISTE_DATEI) && "keine system-dateien.json (Arbeitskopie)" }, async () => {
  const roh = JSON.parse(fs.readFileSync(LISTE_DATEI, "utf8"));
  const lp = U.listePruefen(roh);
  assert.ok(lp.wert, lp.fehler);
  const version = JSON.parse(fs.readFileSync(path.join(VAULT, ".obsidian", "plugins", "studium-autopilot", "manifest.json"), "utf8")).version;
  assert.equal(lp.wert.version, version);
  const gelistet = {};
  for (const e of lp.wert.dateien) {
    const by = new Uint8Array(fs.readFileSync(path.join(VAULT, ...e.pfad.split("/"))));
    assert.equal(by.length, e.groesse, e.pfad);
    assert.equal(await U.sha256(by), e.sha256, e.pfad);
    if (e.klasse === "modul") assert.equal(await U.sha256(enc(U.teilen(dec(by)).koerper)), e.koerper, e.pfad);
    gelistet[e.pfad] = true;
  }
  const alle = (ordner, rel) => fs.readdirSync(ordner, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? alle(path.join(ordner, d.name), rel + d.name + "/") : [rel + d.name]));
  for (const p of alle(VAULT, "")) if (U.klasseVon(p)) assert.ok(gelistet[p.normalize("NFC")], "fehlt in der Liste: " + p);
});

test("Kanal stabil/beta: Versionsvergleich und angebotene Version", () => {
  const n = U.neuer;
  assert.ok(n("0.3.0", "0.3.0-beta.2") && n("0.3.0-beta.2", "0.3.0-beta.1") && n("0.3.1-beta.1", "0.3.0") && n("0.10.0", "0.9.9"));
  assert.ok(!n("0.3.0-beta.9", "0.3.0") && !n("0.3.0", "0.3.0") && !n("0.3", "0.2.0"));
  const r = (v) => ({ version: v });
  // Kanal stabil ignoriert beta
  assert.equal(U.angebot(r("0.2.0"), r("0.3.0-beta.1"), "stabil", "0.2.0"), null);
  assert.equal(U.angebot(r("0.3.0"), r("0.3.0-beta.1"), "stabil", "0.2.0").version, "0.3.0");
  // Kanal beta nimmt die Beta, wenn sie höher ist
  assert.equal(U.angebot(r("0.2.0"), r("0.3.0-beta.1"), "beta", "0.2.0").version, "0.3.0-beta.1");
  assert.equal(U.angebot(null, r("0.3.0-beta.1"), "beta", "0.2.0").version, "0.3.0-beta.1");
  // nach dem fertigen Release ist stabil wieder höher als die alte Beta
  assert.equal(U.angebot(r("0.3.0"), r("0.3.0-beta.2"), "beta", "0.3.0-beta.2").version, "0.3.0");
  assert.equal(U.angebot(r("0.3.0"), r("0.3.0-beta.2"), "beta", "0.3.0"), null);
  // nie zurück: wer eine Beta hat und auf stabil wechselt, bekommt erst die nächste fertige Version
  assert.equal(U.angebot(r("0.2.0"), r("0.3.0-beta.1"), "stabil", "0.3.0-beta.1"), null);
});

test("Manifest: Feld beta (X.Y.Z-beta.N), release nur fertige Versionen", () => {
  const m = { schema: 1, erstellt: "2026-10-15T07:53:49Z", dateien: {} };
  const basis = (v) => "https://raw.githubusercontent.com/studium-autopilot/ecoba/v" + v + "/";
  const b = { version: "0.3.0-beta.1", url_basis: basis("0.3.0-beta.1"), sha256: "b".repeat(64), notiz: "" };
  let w = Z.manifestPruefen(Object.assign({}, m, { beta: b })).wert;
  assert.equal(w.beta.version, "0.3.0-beta.1");
  w = Z.manifestPruefen(Object.assign({}, m, { release: b, beta: Object.assign({}, b, { version: "0.3.0", url_basis: basis("0.3.0") }) })).wert;
  assert.equal(w.release, null, "Beta im Feld release abgelehnt");
  assert.equal(w.beta, null, "fertige Version im Feld beta abgelehnt");
  assert.ok(U.listePruefen(Object.assign({}, { schema: 1, version: "0.3.0-beta.1", ordner: "Studium Autopilot", dateien: [
    { pfad: KERN + "main.js", klasse: "system", groesse: 1, sha256: "a".repeat(64) },
    { pfad: KERN + "manifest.json", klasse: "system", groesse: 1, sha256: "a".repeat(64) }] }), "0.3.0-beta.1").wert);
});

// ---------- Unterbrochenes Update (update.json, seit 0.4.8) und Nach Updates suchen ----------
test("Unterbrochen: was dieses und ein anderes Gerät sehen (markeLage)", () => {
  const jetzt = Date.parse("2026-10-19T12:00:00Z");
  const m = (anders) => Object.assign({ version: "0.4.9", von: "0.4.8", geraet: "g-a", seit: "2026-10-19T11:40:00Z" }, anders);
  const o = (anders) => Object.assign({ installiert: "0.4.8", ich: "g-a", jetzt, laeuft: false }, anders);
  assert.equal(U.markeLage(m(), o()), "fertigstellen", "hier begonnen, installiert.json zeigt noch die alte Version");
  assert.equal(U.markeLage(m({ seit: "2026-10-01T00:00:00Z" }), o()), "fertigstellen", "auf diesem Gerät ohne Zeitgrenze");
  assert.equal(U.markeLage(m(), o({ laeuft: true })), null, "läuft gerade hier");
  assert.equal(U.markeLage(m(), o({ installiert: "0.4.9" })), null, "fertig");
  assert.equal(U.markeLage(m(), o({ installiert: "0.5.0" })), null);
  assert.equal(U.markeLage(m(), o({ ich: "g-b" })), "anderes", "anderes Gerät, vor 20 Min.: seine Dateien kommen noch");
  assert.equal(U.markeLage(m({ seit: "2026-10-19T10:59:00Z" }), o({ ich: "g-b" })), null, "über eine Stunde still: hier darf wieder installiert werden");
  assert.equal(U.markeLage(m({ seit: "" }), o({ ich: "g-b" })), null);
  assert.equal(U.MARKE_STILL, 60 * 60e3);
  for (const kaputt of [null, "x", [], m({ version: "neu" }), m({ geraet: "" }), m({ geraet: 3 })]) assert.equal(U.markeLage(kaputt, o()), null, JSON.stringify(kaputt));
  assert.equal(U.klasseVon(U.MARKE), "", "update.json kommt nie aus einem Update");
});

test("Unterbrochen: update.json als erste Datei und danach liegen lassen; Schreibfehler setzt sie zurück; nichts zu tun → keine", async () => {
  const marke = { geraet: "g-a", seit: "2026-10-19T11:40:00Z" };
  let r = await update(ALT, NEU, ALT, { marke });
  assert.equal(r.b.ok, true, r.b.fehler);
  assert.equal(r.sp.reihe[0], U.MARKE, "zuerst, vor jeder anderen Datei");
  assert.deepEqual(r.sp.reihe.slice(-2), [U.LISTE, U.INSTALLIERT], "installiert.json zuletzt");
  assert.deepEqual(JSON.parse(r.sp.text(U.MARKE)), { version: "0.3.0", von: "0.2.0", geraet: "g-a", seit: marke.seit });
  assert.deepEqual(r.q.frisch, [U.LISTE], "die Liste kommt nie aus dem Zwischenspeicher");
  // Zweiter Lauf derselben Version: nichts zu schreiben, also auch keine neue Marke
  const vorher = r.sp.stand();
  const b2 = await U.aktualisierenMit(r.io, { release: r.release, alt: U.listePruefen(JSON.parse(r.listeText)).wert, altVersion: "0.3.0", zeit: new Date(),
    marke: { geraet: "g-b", seit: "2026-10-19T12:00:00Z" } });
  assert.equal(b2.ok, true);
  assert.equal(r.sp.stand(), vorher);
  // Schreibfehler: alles zurück, auch die Marke (fehlte sie vorher, ist sie wieder weg; sonst der alte Inhalt)
  r = await update(ALT, NEU, ALT, { marke, kaputtBei: (_p, n) => n === 5 });
  assert.equal(r.b.art, "schreiben"); assert.equal(r.sp.stand(), r.vorher); assert.equal(r.sp.text(U.MARKE), null);
  const alteMarke = JSON.stringify({ version: "0.2.0", von: "0.1.0", geraet: "g-b", seit: "2026-09-01T10:00:00Z" });
  r = await update(ALT, NEU, Object.assign({}, ALT, { [U.MARKE]: alteMarke }), { marke, kaputtBei: (_p, n) => n === 5 });
  assert.equal(r.sp.text(U.MARKE), alteMarke);
  // Ohne Marke (kein Gerät bekannt) wie bisher
  r = await update(ALT, NEU, ALT);
  assert.equal(r.sp.text(U.MARKE), null);
});

test("Unterbrochen: App mitten im Schreiben beendet → dieses Gerät sieht „fertigstellen“, ein zweiter Lauf ergibt denselben Stand", async () => {
  const marke = { geraet: "g-a", seit: "2026-10-19T11:40:00Z" };
  const altListe = await listeBauen("0.2.0", ALT), neuListe = await listeBauen("0.3.0", NEU);
  const listeText = JSON.stringify(neuListe, null, 1);
  const release = { version: "0.3.0", url_basis: BASIS("0.3.0"), sha256: await U.sha256(enc(listeText)), notiz: "" };
  const start = Object.assign({}, ALT, { [U.INSTALLIERT]: JSON.stringify(altListe) });
  const lauf = (sp, alt) => U.aktualisierenMit({ holen: quelle("0.3.0", NEU, listeText).holen, lesen: sp.lesen, schreiben: sp.schreiben, loeschen: sp.loeschen, liste: sp.liste },
    { release, alt: U.listePruefen(alt).wert, altVersion: "0.2.0", zeit: new Date(2026, 9, 19, 11, 40), marke });
  const ganz = speicher(start);
  assert.equal((await lauf(ganz, altListe)).ok, true);
  const n = ganz.reihe.length;
  const ohneSicherung = (m) => Object.fromEntries(Array.from(m).filter(([k]) => !k.startsWith(".trash/")).map(([k, v]) => [k, dec(v)]));
  for (const k of [2, Math.floor(n / 2), n]) {
    // Stand nach k − 1 Schreibvorgängen: so bleibt der Tresor, wenn iOS die App beendet (nichts wird zurückgesetzt)
    let sp = null, halb = null;
    sp = speicher(start, (_p, nr) => { if (nr === k && !halb) halb = ohneSicherung(sp.m); return false; });
    await lauf(sp, altListe);
    assert.ok(halb, "Abbruch bei " + k);
    assert.equal(JSON.parse(halb[U.INSTALLIERT]).version, "0.2.0", "installiert.json kommt zuletzt");
    assert.equal(U.markeLage(JSON.parse(halb[U.MARKE]), { installiert: "0.2.0", ich: "g-a", jetzt: Date.parse(marke.seit), laeuft: false }), "fertigstellen");
    assert.equal(U.markeLage(JSON.parse(halb[U.MARKE]), { installiert: "0.2.0", ich: "g-b", jetzt: Date.parse(marke.seit) + 60e3, laeuft: false }), "anderes");
    // Update fertigstellen: gleicher Plan gegen die alte installiert.json, nur was fehlt
    const weiter = speicher(halb);
    const b = await lauf(weiter, JSON.parse(halb[U.INSTALLIERT]));
    assert.equal(b.ok, true, b.fehler);
    assert.equal(weiter.stand(), ganz.stand(), "Abbruch bei " + k + ": gleicher Stand wie ohne Abbruch");
  }
});

// Ersatz für Obsidians Elemente (createEl/createDiv/createSpan, setText, setAttr, addClass, empty, Klick) und Fenster (Modal):
// genug für das Fenster „Neue Version“ (fensterZeigen), ohne Browser
const knoten = (tag, o) => {
  const k = { tag, cls: String((o && o.cls) || "").split(" ").filter(Boolean), attr: Object.assign({}, o && o.attr), text: (o && o.text) || "",
    kinder: [], an: {}, style: {}, isConnected: true };
  k.createEl = (t, p) => { const c = knoten(t, p); k.kinder.push(c); return c; };
  k.createDiv = (p) => k.createEl("div", p);
  k.createSpan = (p) => k.createEl("span", p);
  k.setText = (t) => { k.text = String(t); };
  k.setAttr = (n, v) => { k.attr[n] = String(v); };
  k.addClass = (...c) => { k.cls.push(...c); };
  k.empty = () => { k.kinder = []; };
  k.addEventListener = (e, f) => { k.an[e] = f; };
  k.alle = () => k.kinder.flatMap((c) => [c, ...c.alle()]);
  k.mit = (klasse) => k.alle().filter((c) => c.cls.includes(klasse));
  return k;
};
const fensterKlasse = (fenster) => class {
  constructor() { this.modalEl = knoten("div"); this.titleEl = knoten("div"); this.contentEl = knoten("div"); fenster.push(this); }
  open() { this.offen = true; }
  close() { if (!this.offen) return; this.offen = false; if (this.onClose) this.onClose(); }
};
// Was das Fenster zeigt: Stufe, Titel, Satz, Knöpfe (Hauptknopf mit *), Zeilen „Wichtig“ und im Fuß, Schritt
const ansicht = (m) => {
  const c = m.contentEl, eins = (k) => c.mit(k)[0];
  const zeilen = (el) => (el ? el.mit("eba-up-zeile").map((z) => z.kinder[0].text) : []);
  return { stufe: m.modalEl.attr["data-stufe"], titel: m.titleEl.text, satz: eins("eba-up-satz").text,
    knoepfe: eins("modal-button-container").kinder.map((b) => b.text + (b.cls.includes("mod-cta") ? "*" : "")),
    wichtig: zeilen(eins("eba-up-wichtig")), fuss: zeilen(eins("eba-up-fuss")), schritt: (eins("eba-up-schritt") || {}).text };
};
const tippen = (m, text) => eineVon(m.contentEl.mit("modal-button-container")[0].kinder.filter((b) => b.text === text)).an.click();
const eineVon = (l) => { assert.equal(l.length, 1); return l[0]; };

// update.js mit erfundenem Tresor (dateien: Pfad → Text), Manifest (release) und Geräte-ID; Hinweise als Text (hinweise) und
// als Notice (notices, mit weg = ausgeblendet), Fenster (fenster), Gerätespeicher (speicher). netz(p): eigene Antwort auf Abrufe.
function geraet(o) {
  const dateien = Object.assign({}, o.dateien), hinweise = [], notices = [], anfragen = [], fenster = [], speicher = new Map();
  const rel = (v) => (v ? { version: v, url_basis: BASIS(v), sha256: "a".repeat(64), notiz: "" } : null);
  const zaehler = { manifest: 0 };
  const L = laden("update", { kontext: {
    obsidian: {
      Notice: class { constructor(t) { hinweise.push(String(t)); notices.push(this); this.text = String(t); this.weg = false; } setMessage() {} hide() { this.weg = true; } },
      Modal: fensterKlasse(fenster),
      requestUrl: async (p) => { anfragen.push(p); if (o.netz) return o.netz(p); throw new Error("kein Netz im Test"); },
    },
    plugin: Object.assign({ manifest: { version: o.lauf || "0.4.8" } }, o.plugin),
    zentral: {
      geraetId: () => o.ich || "g-ich", stand: () => ({ release: rel(o.release), beta: null, plugin_aktuell: "" }), status: () => ({ an: !o.zentralAus }),
      manifestHolen: async () => { zaehler.manifest++; if (o.offline) throw new Error("offline"); return { release: rel(o.release), beta: null }; },
      abruferHier: async () => o.abrufer !== false,
      frischUrl: (u) => u + "?t=7", FRISCH_KOPF: { "Cache-Control": "no-cache" },
    },
  } });
  const hat = (p) => Object.prototype.hasOwnProperty.call(dateien, p);
  L.ctx.app.vault.adapter = { stat: async (p) => (hat(p) ? { type: "file" } : null), readBinary: async (p) => enc(dateien[p]).buffer,
    exists: async (p) => hat(p) || Object.keys(dateien).some((k) => k.startsWith(p + "/")), mkdir: async () => {},
    writeBinary: async (p, b) => { dateien[p] = dec(new Uint8Array(b)); } };
  L.ctx.app.loadLocalStorage = (k) => (speicher.has(k) ? speicher.get(k) : null);
  L.ctx.app.saveLocalStorage = (k, v) => { speicher.set(k, v); };
  L.ctx.app.metadataCache.initialized = true;
  return { U: L.ctx.update, aktionen: L.ergebnis.aktionen, hinweise, notices, anfragen, zaehler, fenster, speicher, dateien };
}
const vorMin = (min) => new Date(Date.now() - min * 60e3).toISOString();
const markeText = (geraetId, version, seit) => JSON.stringify({ version, von: "0.4.8", geraet: geraetId, seit });

test("Nach Updates suchen: Knopf in der Zeile, Befehl; eine neue Version gleich im Fenster, sonst ein Hinweis", async () => {
  let G = geraet({ release: "0.4.8" });
  assert.equal(G.aktionen["vorlage-suchen"].titel, "Nach Updates suchen", "Knopf und Befehl heißen gleich");
  const a = G.U.anzeige();
  assert.equal(a.html, "Version 0.4.8. Du hast die neueste Version.");
  assert.deepEqual(a.knopf, { aktion: "vorlage-suchen", text: "Nach Updates suchen", cta: false });
  assert.equal(await G.U.suchen(), "aktuell");
  assert.equal(G.zaehler.manifest, 1, "sofort geholt, ohne Wartezeit");
  assert.deepEqual(G.hinweise, ["Du hast die neueste Version."]);
  // Ohne Angaben (zentrale Daten aus): trotzdem der Knopf
  assert.equal(geraet({}).U.anzeige().knopf.text, "Nach Updates suchen");
  // Neue Version: das Fenster mit den Änderungen und „Neue Version installieren“, kein Hinweis; die Zeile zeigt den Hauptknopf
  G = geraet({ release: "0.4.9" });
  assert.equal(await G.U.suchen(), "angebot");
  assert.deepEqual(G.hinweise, []);
  assert.equal(G.fenster.length, 1);
  assert.deepEqual(ansicht(G.fenster[0]), { stufe: "angebot", titel: "Neue Version 0.4.9", satz: "Du hast Version 0.4.8.",
    knoepfe: ["Später", "Neue Version installieren*"], wichtig: [], fuss: [], schritt: undefined });
  assert.deepEqual(G.U.anzeige().knopf, { aktion: "vorlage-aktualisieren", text: "Neue Version installieren" });
  // Kein Netz: ein Satz, kein Fehlertext
  G = geraet({ release: "0.4.9", offline: true });
  const fehler = console.error; console.error = () => {};
  try { assert.equal(await G.U.suchen(), "fehler"); } finally { console.error = fehler; }
  assert.deepEqual(G.hinweise, ["Keine Verbindung. Versuch es später noch einmal."]);
});

test("Unterbrochen: Zeile, Dashboard und Knöpfe auf diesem und auf einem anderen Gerät", async () => {
  const ANDERES = "Ein Update wird gerade auf einem anderen Gerät installiert.";
  // Anderes Gerät hat vor 10 Min. begonnen, seine Dateien kommen noch: kein zweites Update
  let G = geraet({ release: "0.4.9", plugin: { testUpdateAntwort: true }, dateien: { [U.MARKE]: markeText("g-anders", "0.4.9", vorMin(10)) } });
  await G.U.markeNeu();
  assert.deepEqual([G.U.anzeige().html, G.U.anzeige().knopf], [ANDERES, null]);
  assert.deepEqual(G.U.hinweis(), { art: "anderes", version: "0.4.9", text: ANDERES, knopf: "", symbol: "uhr" });
  assert.equal(await G.U.aktualisieren(), null);
  assert.equal(G.zaehler.manifest, 0, "nichts geholt, nichts installiert");
  assert.equal(await G.U.suchen(), "anderes");
  assert.deepEqual(G.hinweise, [ANDERES + " Öffne Obsidian dort, dann kommt es hierher.", ANDERES + " Öffne Obsidian dort, dann kommt es hierher."]);
  // Über eine Stunde still: wieder das Angebot
  G = geraet({ release: "0.4.9", dateien: { [U.MARKE]: markeText("g-anders", "0.4.9", vorMin(61)) } });
  await G.U.markeNeu();
  assert.equal(G.U.anzeige().knopf.text, "Neue Version installieren");
  // Schon fertig (installiert.json zeigt die Version): nichts Besonderes
  G = geraet({ lauf: "0.4.9", release: "0.4.9", dateien: { [U.MARKE]: markeText("g-anders", "0.4.9", vorMin(1)) } });
  await G.U.markeNeu();
  assert.equal(G.U.hinweis(), null);

  // Dieses Gerät hat begonnen und wurde beendet: „Update fertigstellen“ fragt nicht noch einmal und holt die Liste frisch
  G = geraet({ release: "0.4.9", plugin: { testUpdateAntwort: false }, dateien: { [U.MARKE]: markeText("g-ich", "0.4.9", vorMin(300)) } });
  await G.U.markeNeu();
  const a = G.U.anzeige();
  assert.equal(a.html, "Das Update auf Version 0.4.9 ist nicht fertig geworden.");
  assert.deepEqual(a.knopf, { aktion: "vorlage-aktualisieren", text: "Update fertigstellen" });
  assert.deepEqual(G.U.hinweis(), { art: "fertig", version: "0.4.9", text: a.html, knopf: "Update fertigstellen", symbol: "laden" });
  const b = await G.U.aktualisieren();
  assert.equal(b && b.art, "netz", "ohne zweite Frage weiter bis zum Laden (im Test ohne Netz)");
  assert.deepEqual(G.hinweise, [], "Fortschritt und Ergebnis im Fenster, kein Hinweis");
  assert.equal(G.fenster.length, 1);
  assert.deepEqual([ansicht(G.fenster[0]).stufe, ansicht(G.fenster[0]).titel, ansicht(G.fenster[0]).knoepfe], ["fehler", "Nicht installiert", ["Fertig*"]]);
  // Die Liste kommt frisch; das Fenster holt daneben die Änderungen (CHANGELOG.md am Tag)
  const liste = eineVon(G.anfragen.filter((x) => x.url.includes("system-dateien.json")));
  assert.equal(liste.url, BASIS("0.4.9") + "Studium%20Autopilot/System/Daten/system-dateien.json?t=7");
  assert.deepEqual(liste.headers, { "Cache-Control": "no-cache" });
  assert.deepEqual(G.anfragen.map((x) => x.url).filter((u) => u.endsWith("CHANGELOG.md")), [BASIS("0.4.9") + "CHANGELOG.md"]);
  // Bietet das Manifest inzwischen eine andere Version an, wird wie sonst gefragt
  G = geraet({ release: "0.5.0", plugin: { testUpdateAntwort: false }, dateien: { [U.MARKE]: markeText("g-ich", "0.4.9", vorMin(5)) } });
  await G.U.markeNeu();
  assert.equal(await G.U.aktualisieren(), null, "Frage mit Nein beantwortet");
  assert.deepEqual(G.hinweise, []);
});

test("Unterbrochen: bietet das Manifest eine andere Version an (zurückgezogen oder neuer), gibt es nichts fertigzustellen", async () => {
  const jetzt = Date.parse("2026-10-19T12:00:00Z");
  const m = { version: "0.4.9", von: "0.4.8", geraet: "g-a", seit: "2026-10-19T11:40:00Z" };
  const o = (angeboten) => ({ installiert: "0.4.8", ich: "g-a", jetzt, laeuft: false, angeboten });
  assert.equal(U.markeLage(m, o("0.4.9")), "fertigstellen");
  assert.equal(U.markeLage(m, o("")), "fertigstellen", "unbekannt (zentrale Daten aus, noch nie geholt): wie bisher");
  assert.equal(U.markeLage(m, o("0.4.8")), null, "zurückgezogen, das Manifest bietet wieder die alte an");
  assert.equal(U.markeLage(m, o("0.5.0")), null, "schon eine neuere: die wird angeboten");
  // Zeile und Dashboard: kein „nicht fertig geworden“ mehr für eine zurückgezogene Version
  const G = geraet({ release: "0.4.8", dateien: { [U.MARKE]: markeText("g-ich", "0.4.9", vorMin(300)) } });
  await G.U.markeNeu();
  assert.equal(G.U.anzeige().html, "Version 0.4.8. Du hast die neueste Version.");
  assert.equal(G.U.hinweis(), null);
});

test("Zentrale Daten aus: keine Angaben zum Release, Nach Updates suchen holt trotzdem", async () => {
  const G = geraet({ release: "0.4.9", zentralAus: true });
  const a = G.U.anzeige();
  assert.equal(a.html, "Version 0.4.8.", "kein altes Angebot, kein „neueste Version“");
  assert.deepEqual(a.knopf, { aktion: "vorlage-suchen", text: "Nach Updates suchen", cta: false });
  assert.equal(G.U.hinweis(), null);
  assert.equal(G.U.status().release, null);
  assert.equal(G.U.toastPruefen(), null);
  // Ein Tipp holt das Manifest und zeigt, was es anbietet
  assert.equal(await G.U.suchen(), "angebot");
  assert.equal(G.zaehler.manifest, 1);
  assert.equal(ansicht(G.fenster[0]).titel, "Neue Version 0.4.9");
});

test("Von Hand aktualisiert (ZIP entpackt): laufende Version gilt, wenn Kern, Liste und Systemdateien übereinstimmen", async () => {
  const altListe = JSON.stringify(await listeBauen("0.2.0", ALT)), neuListe = JSON.stringify(await listeBauen("0.3.0", NEU));
  const tresor = (anders) => Object.assign({}, NEU, { [U.INSTALLIERT]: altListe, [U.LISTE]: neuListe }, anders);
  const hand = (dateien, lauf) => U.handInstalliertMit(speicher(dateien), { lauf: lauf || "0.3.0" });
  const h = await hand(tresor());
  assert.equal(h && h.version, "0.3.0");
  assert.equal(dec(h.bytes), neuListe);
  assert.ok(await hand(tresor({ "Dashboard.md": "# Mein Dashboard\n" })), "eine eigene Seite zählt nicht");
  assert.equal(await hand(tresor({ "System/Skripte/zentral.js": "// zentral alt\n" })), null, "eine Systemdatei fehlt noch (Sync)");
  const ohne = tresor(); delete ohne["System/Skripte/neu.js"];
  assert.equal(await hand(ohne), null, "eine neue Systemdatei fehlt");
  assert.equal(await hand(tresor(), "0.2.0"), null, "der alte Kern läuft noch");
  assert.equal(await hand(tresor({ [U.INSTALLIERT]: neuListe })), null, "schon eingetragen");
  assert.equal(await hand(tresor({ [U.MARKE]: markeText("g-a", "0.3.0", vorMin(5)) })), null, "Update dieser Version unterbrochen: fertigstellen");
  assert.ok(await hand(tresor({ [U.MARKE]: markeText("g-a", "0.2.0", vorMin(500)) })), "Marke eines früheren Updates");
  // Was die neue Version nicht mehr hat und ein Update entfernen würde, ließ das Entpacken liegen: weiter anbieten
  assert.equal(await hand(tresor({ "System/Skripte/weg.js": "// fällt weg\n" })), null, "altes Skript noch da");
  assert.equal(await hand(tresor({ "System/Skripte/weg2.js": "// von dir geändert\n" })), null, "auch geändert (käme als Sicherung weg)");
  const mitSeite = JSON.stringify(await listeBauen("0.2.0", Object.assign({}, ALT, { "Studium/Alt.md": "# Alt\n" })));
  assert.equal(await hand(tresor({ [U.INSTALLIERT]: mitSeite, "Studium/Alt.md": "# Alt\n" })), null, "unveränderte alte Seite");
  assert.ok(await hand(tresor({ [U.INSTALLIERT]: mitSeite, "Studium/Alt.md": "# Meine Seite\n" })), "deine geänderte Seite bleibt ohnehin");
  // Zeile: die laufende Version, kein Angebot derselben; das Gerät, das für alle schreibt, trägt sie in installiert.json ein
  let G = geraet({ lauf: "0.3.0", release: "0.3.0", dateien: tresor() });
  await G.U.installiertNeu();
  assert.equal(G.U.anzeige().html, "Version 0.3.0. Du hast die neueste Version.");
  assert.equal(G.dateien[U.INSTALLIERT], neuListe);
  G = geraet({ lauf: "0.3.0", release: "0.3.0", abrufer: false, dateien: tresor() });
  await G.U.installiertNeu();
  assert.equal(G.U.anzeige().html, "Version 0.3.0. Du hast die neueste Version.", "andere Geräte zeigen sie gleich");
  assert.equal(G.dateien[U.INSTALLIERT], altListe, "und schreiben nichts");
  // Ohne Übereinstimmung bleibt es beim Eintrag in installiert.json
  G = geraet({ lauf: "0.3.0", release: "0.3.0", dateien: tresor({ "System/Skripte/zentral.js": "// zentral alt\n" }) });
  await G.U.installiertNeu();
  assert.equal(G.U.anzeige().html, "Neue Version 0.3.0 verfügbar.");
});

// ---------- Fenster „Neue Version“ (seit 0.5.4): ein Fenster für das ganze Update, höchstens ein Hinweis ----------
const bericht = (o) => Object.assign({ ok: true, art: "", fehler: "", version: "0.4.9", geaendert: [], angelegt: [], neuKopien: [], gesichert: [],
  gemischt: [], haken: [], einstellungen: [], uebersprungen: [], entfernt: [], behalten: [], aufgeraeumt: [], sicherung: "", plugin: false }, o);

test("Ergebnis: ein Satz unter dem Titel, Zeilen darunter; was du noch tun musst, steht oben", () => {
  assert.equal(U.ergebnisSatz(bericht({ geaendert: ["a"], angelegt: ["b", "c"] })), "3 Dateien aktualisiert. Deine Einträge sind geblieben.");
  assert.equal(U.ergebnisSatz(bericht({ haken: ["a"] })), "1 Datei aktualisiert. Deine Einträge sind geblieben.");
  assert.equal(U.ergebnisSatz(bericht({})), "Alles war schon aktuell.");
  assert.equal(U.ergebnisSatz({ ok: false, art: "pruefsumme" }), "Die neue Version kam nicht vollständig an. Es wurde nichts geändert. Versuch es später noch einmal.");
  assert.equal(U.ergebnisSatz({ ok: false, art: "?" }), U.ergebnisSatz({ ok: false, art: "netz" }), "unbekannte Art: wie kein Netz");
  assert.deepEqual(U.ergebnisZeilen({ ok: false, art: "netz" }), [], "Fehler: nur der Satz und der Grund");
  const z = U.ergebnisZeilen(bericht({ plugin: true, neuGeladen: false, einstellungen: ["app.json"], sicherung: ".sicherung/0.4.8",
    neuKopien: [{ pfad: "Studium Autopilot/Studium/Dashboard.md" }], behalten: ["Studium Autopilot/Studium/Alt.md"] }));
  assert.deepEqual(z.map((x) => [x.titel, !!x.wichtig]), [["Noch ein Schritt", true], ["Deine Seiten", false], ["Behalten", false],
    ["Andere Geräte", false], ["Sicherung", false]]);
  assert.match(z[1].text, /\(„neu 0\.4\.9“\): Dashboard\.$/);
  assert.match(z[2].text, /: Alt\.$/);
  assert.match(z[3].text, /„Neu laden“/, "neuer Kern: andere Geräte laden einmal neu");
  // Kern neu geladen: kein Schritt mehr, dafür der Satz zu den Einstellungen
  assert.deepEqual(U.ergebnisZeilen(bericht({ plugin: true, neuGeladen: true, einstellungen: ["app.json"] })).map((x) => x.titel), ["Einstellungen", "Andere Geräte"]);
  assert.deepEqual(U.ergebnisZeilen(bericht({})).map((x) => x.text), ["Das Update kommt von selbst, dort musst du nichts tun."]);
});

test("Fenster „Neue Version“: Hinweis geht weg, Angebot und Fehler im selben Fenster, danach kein Hinweis mehr", async () => {
  const G = geraet({ release: "0.4.9" });
  // Beim Start fällig: genau ein Hinweis
  assert.equal(G.U.toastPruefen(), "angebot");
  assert.deepEqual(G.hinweise, ["Neue Version 0.4.9 ist da."]);
  assert.equal(G.U.toast, G.notices[0]);
  // Nach Updates suchen öffnet das Fenster: der Hinweis geht weg, es kommt keiner dazu, und die Version gilt als gesehen
  assert.equal(await G.U.suchen(), "angebot");
  assert.deepEqual([G.notices[0].weg, G.U.toast, G.hinweise.length], [true, null, 1]);
  assert.equal(G.fenster.length, 1);
  const m = G.fenster[0];
  assert.equal(G.U.fenster.m, m);
  assert.equal(G.speicher.get(U.L_TOAST).fenster, true);
  // Später: Fenster zu; der Hinweis kommt für diese Version nicht wieder (auch nicht nach 12 Stunden), die Zeilen bieten sie an
  tippen(m, "Später");
  assert.deepEqual([m.offen, G.U.fenster], [false, null]);
  assert.equal(G.U.toastPruefen(), null);
  G.speicher.set(U.L_TOAST, Object.assign({}, G.speicher.get(U.L_TOAST), { zeit: Date.now() - 13 * 3600e3 }));
  assert.equal(G.U.toastPruefen(), null);
  assert.deepEqual(G.hinweise, ["Neue Version 0.4.9 ist da."]);
  // Ein zweites Fenster ersetzt das erste (nie zwei übereinander)
  const g1 = G.U.fensterZeigen({ stufe: "angebot", von: "0.4.8", bis: "0.4.9", angebot: { version: "0.4.9", notiz: "" } });
  const g2 = G.U.fensterZeigen({ stufe: "neu", von: "0.4.8", bis: "0.4.9" });
  assert.deepEqual([g1.offen, g2.offen, G.U.fenster === g2], [false, true, true]);
  assert.deepEqual(ansicht(g2.m), { stufe: "neu", titel: "Was ist neu", satz: "Du hast jetzt Version 0.4.9.", knoepfe: ["Fertig*"],
    wichtig: [], fuss: [], schritt: undefined });
  g2.m.close();
  // Neue Version installieren im Fenster: keine zweite Frage, Fortschritt und Ergebnis im selben Fenster, kein Hinweis
  const g = G.U.fensterZeigen({ stufe: "angebot", von: "0.4.8", bis: "0.4.9", angebot: { version: "0.4.9", notiz: "" } });
  const fehler = console.error; console.error = () => {};
  try {
    tippen(g.m, "Neue Version installieren");
    assert.equal(ansicht(g.m).stufe, "laeuft", "sofort sichtbar, dass es losgeht");
    assert.deepEqual([ansicht(g.m).titel, ansicht(g.m).satz, ansicht(g.m).knoepfe, ansicht(g.m).schritt],
      ["Version 0.4.9 wird installiert", "Lass Obsidian offen, bis es fertig ist.", [], "Prüfe die neue Version …"]);
    for (let i = 0; i < 20 && ansicht(g.m).stufe === "laeuft"; i++) await new Promise((r) => setTimeout(r, 5));
  } finally { console.error = fehler; }
  assert.equal(G.fenster.length, 4, "kein weiteres Fenster");
  assert.deepEqual([ansicht(g.m).stufe, ansicht(g.m).titel, ansicht(g.m).knoepfe], ["fehler", "Nicht installiert", ["Fertig*"]]);
  assert.equal(ansicht(g.m).satz, U.ergebnisSatz({ ok: false, art: "netz" }));
  assert.deepEqual(G.hinweise, ["Neue Version 0.4.9 ist da."]);
});

test("Fenster „Neue Version“: Fortschritt als Balken, Ergebnis mit „Noch ein Schritt“ oben und den anderen Zeilen im Fuß", () => {
  const G = geraet({ release: "0.4.9" });
  const g = G.U.fensterZeigen({ stufe: "laeuft", von: "0.4.8", bis: "0.4.9", ohneListe: true });
  g.laeuft("Lade 4 von 7 Dateien …", 0.5);
  assert.equal(ansicht(g.m).schritt, "Lade 4 von 7 Dateien …");
  const balken = g.m.contentEl.mit("eba-up-balken")[0];
  assert.deepEqual([balken.attr.role, balken.attr["aria-valuenow"], g.m.contentEl.mit("eba-up-fuellung")[0].style.width], ["progressbar", "50", "50%"]);
  g.laeuft("", 2);
  assert.deepEqual([ansicht(g.m).schritt, balken.attr["aria-valuenow"]], ["Lade 4 von 7 Dateien …", "100"], "ohne Text bleibt der Schritt");
  assert.equal(G.U.ergebnisZeigen(bericht({ plugin: true, neuGeladen: false, geaendert: ["a", "b"], sicherung: ".sicherung/0.4.8" }), g), g);
  assert.deepEqual(ansicht(g.m), { stufe: "fertig", titel: "Version 0.4.9 ist installiert", satz: "2 Dateien aktualisiert. Deine Einträge sind geblieben.",
    knoepfe: ["Fertig*"], wichtig: ["Noch ein Schritt"], fuss: ["Andere Geräte", "Sicherung"], schritt: undefined });
  // Fenster während des Updates geschlossen: das Ergebnis kommt in einem neuen Fenster
  g.m.close();
  const f = G.U.ergebnisZeigen(Object.assign(bericht({}), { vorher: "0.4.8" }));
  assert.deepEqual([f !== g, ansicht(f.m).stufe, ansicht(f.m).satz], [true, "fertig", "Alles war schon aktuell."]);
  // Fehler: der Grund klein im Fuß
  const e = G.U.ergebnisZeigen({ ok: false, art: "schreiben", fehler: "EACCES", version: "0.4.9" });
  assert.deepEqual([ansicht(e.m).stufe, e.m.contentEl.mit("eba-up-grund")[0].text], ["fehler", "EACCES"]);
  assert.deepEqual(G.hinweise, []);
});
