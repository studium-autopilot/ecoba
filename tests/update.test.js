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
  const geholt = [];
  return {
    geholt,
    holen: async (url) => {
      assert.ok(url.startsWith(praefix), url);
      const pfad = url.slice(praefix.length).split("/").map(decodeURIComponent).join("/");
      geholt.push(pfad);
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
  return {
    m,
    text: (p) => (m.has(p) ? dec(m.get(p)) : null),
    stand: () => JSON.stringify(Array.from(m.keys()).filter((k) => !k.startsWith(".trash/")).sort().map((k) => [k, dec(m.get(k))])),
    get schreibvorgaenge() { return schreibvorgaenge; },
    lesen: async (p) => (m.has(p) ? m.get(p) : null),
    schreiben: async (p, b) => {
      if (!p.startsWith(".trash/")) { schreibvorgaenge++; if (kaputtBei && kaputtBei(p, schreibvorgaenge)) throw new Error("Platte voll"); }
      m.set(p, b);
    },
    loeschen: async (p) => { m.delete(p); },
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
  const io = { holen: q.holen, lesen: sp.lesen, schreiben: sp.schreiben, loeschen: sp.loeschen };
  const vorher = sp.stand();
  const b = await U.aktualisierenMit(io, { release, alt: U.listePruefen(altListe).wert, altVersion: "0.2.0", zeit: new Date(2026, 9, 15, 14, 5) });
  return { b, sp, q, vorher, listeText };
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
    ".obsidian/app.json": "json-mischen", "System/Skripte/weg.js": "entfernen", "System/Skripte/weg2.js": "bleibt",
  });
  // Ohne installierte Liste: nichts gilt als unverändert, also wird nichts Geändertes überschrieben
  const ohne = U.planen(neu, null, ist);
  assert.ok(ohne.every((s) => s.art !== "ersetzen" && s.art !== "entfernen" && s.art !== "uebersprungen"));
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
  assert.equal(sp.text("System/Skripte/weg2.js"), "// fällt weg, von mir geändert\n");
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
