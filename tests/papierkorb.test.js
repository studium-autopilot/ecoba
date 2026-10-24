// Ein Papierkorb, Rückgängig statt Rückfrage (Bedien-Bausteine): quellen.js papierkorb (Obsidians Einstellung, nie endgültig),
// papierkorb.js (ctx.papierkorb: wegwerfen mit Hinweis und Rückgängig) und ein Wächter, dass kein Skript an der Regel vorbei
// löscht. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const SKRIPTE = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte");
const Q = require(path.join(SKRIPTE, "quellen.js"));

test("Ein Papierkorb: Obsidians Einstellung „Gelöschte Dateien“, nie endgültig; lokal = .trash im Tresor", async () => {
  const aufrufe = [];
  const app = (option) => ({ vault: { getConfig: (k) => (k === "trashOption" ? option : null), trash: async (f, system) => { aufrufe.push(system); } } });
  await Q.papierkorb(app("system"), { path: "a.md" });
  await Q.papierkorb(app("local"), { path: "a.md" });
  await Q.papierkorb(app("none"), { path: "a.md" }); // „Endgültig löschen“ eingestellt: trotzdem Papierkorb
  await Q.papierkorb(app("system"), { path: "a.md" }, { lokal: true });
  assert.deepEqual(aufrufe, [true, false, true, false]);
});

// Tresor im Speicher mit Hinweisen zum Mitlesen
const tresor = () => {
  const dateien = new Map([["Stundenplan/Di 10.15 B110 Tutorium.md", "---\nherkunft: gruppe-gewaehlt\n---\n\n## Meine Notizen\n- Raum merken\n"]]);
  const objekte = new Map(); // wie Obsidian: eine Datei ist immer dasselbe Objekt
  const datei = (p) => {
    if (!dateien.has(p)) return null;
    if (!objekte.has(p)) objekte.set(p, { path: p, basename: path.basename(p).replace(/\.[^.]+$/, ""), extension: p.split(".").pop() });
    return objekte.get(p);
  };
  const weg = [], hinweise = [];
  const app = {
    vault: {
      getAbstractFileByPath: (p) => datei(p) || (p === "Stundenplan" ? { path: p, children: [] } : null),
      read: async (f) => dateien.get(f.path), readBinary: async (f) => dateien.get(f.path),
      trash: async (f) => { weg.push(f.path); dateien.delete(f.path); },
      create: async (p, t) => { dateien.set(p, t); return datei(p); }, createBinary: async (p, b) => { dateien.set(p, b); return datei(p); },
      createFolder: async () => {}, getConfig: () => "local",
    },
  };
  const Notice = class { constructor(inhalt) { hinweise.push(inhalt); } hide() {} };
  return { dateien, datei, weg, hinweise, app, Notice };
};

test("ctx.papierkorb: sofort in den Papierkorb, Hinweis mit Rückgängig holt die Datei mit Inhalt zurück", async () => {
  const t = tresor();
  const knoepfe = [];
  const { ctx } = laden("papierkorb", { kontext: { app: t.app, hinweis: (text, o) => { t.hinweise.push(text); knoepfe.push(o && o.aktion); } } });
  const pfad = "Stundenplan/Di 10.15 B110 Tutorium.md", inhalt = t.dateien.get(pfad);
  assert.equal(await ctx.papierkorb(t.datei(pfad), { text: "Gruppe 4 steht nicht mehr in deinem Stundenplan." }), true);
  assert.deepEqual(t.weg, [pfad]);
  assert.deepEqual(t.hinweise, ["Gruppe 4 steht nicht mehr in deinem Stundenplan."]);
  assert.equal(knoepfe[0].text, "Rückgängig");
  await knoepfe[0].ausfuehren();
  assert.equal(t.dateien.get(pfad), inhalt, "dein Text ist wieder da");
  // Name inzwischen vergeben: daneben als „… 2“
  await ctx.papierkorb(t.datei(pfad), { still: true });
  t.dateien.set(pfad, "neu");
  const P = laden("papierkorb", { kontext: { app: t.app } }).ergebnis;
  await P.wiederherstellen(pfad, inhalt, true);
  assert.equal(t.dateien.get("Stundenplan/Di 10.15 B110 Tutorium 2.md"), inhalt);
  assert.equal(await ctx.papierkorb(null), false);
});

test("wiederPfad: alter Pfad, sonst mit Zahl vor der Endung", () => {
  const P = require(path.join(SKRIPTE, "papierkorb.js"));
  const da = new Set(["a/b.md", "a/b 2.md"]);
  assert.equal(P.wiederPfad("a/c.md", (p) => da.has(p)), "a/c.md");
  assert.equal(P.wiederPfad("a/b.md", (p) => da.has(p)), "a/b 3.md");
  assert.equal(P.wiederPfad("a/Folien.pdf", () => false), "a/Folien.pdf");
});

test("Wächter: gelöscht wird nur über den einen Papierkorb (Ausnahmen mit Grund)", () => {
  // Datei → erlaubte Stellen (Teil der Zeile) mit Grund
  const ERLAUBT = {
    "quellen.js": ["app.vault.trash(f, !lokal)"],                       // die Regel selbst
    "papierkorb.js": ["app.vault.trash(f, false)"],                     // ohne quellen.js (gemischte Fassungen)
    "alma.js": ["app.vault.trash(f, false)"],                           // Hülle eines eigenen Uni-Abgleichs ohne quellen.js
    "ilias-kalender.js": ["app.vault.trash(f, false)"], "meine-gruppe.js": ["V.trash(f, false)"],
    "unterlagen.js": ["app.vault.trash(f, false)", "app.vault.delete(o, true)"],   // dazu der leere Ordner „System/Neue Unterlagen“
    "volltext.js": ["V.trash(f, true)"], "leer.js": ["app.vault.trash(f, false)"],
    "zentral.js": ["app.vault.trash(f, false)"],                        // ältere quellen.js ohne papierkorb (Sync nach dem Update)
    "eba.js": ["app.vault.delete(datei)"], "notizen.js": ["app.vault.delete(leer)"], // leere Notiz der Ordner-Automatik
    "update.js": ["app.vault.delete(f)", "app.vault.delete(o, true)"],  // Update mit eigener Sicherung; alter Ordner ohne Dateien (ALTE_ORDNER)
    "ilias.js": ["V.delete(f)"],                                        // unfertiger Download nach einem Absturz
    "alma-konto.js": ["V.delete(f, true)"],                             // eigene Daten, nach Rückfrage „Daten aus Alma löschen?“
  };
  const funde = [];
  for (const n of fs.readdirSync(SKRIPTE).filter((x) => x.endsWith(".js"))) {
    const zeilen = fs.readFileSync(path.join(SKRIPTE, n), "utf8").split("\n").filter((z) => !z.trim().startsWith("//"));
    for (const z of zeilen) {
      if (!/\.trash\(|trashFile\(|vault\.delete\(|V\.delete\(/.test(z)) continue;
      if (!(ERLAUBT[n] || []).some((e) => z.indexOf(e) >= 0)) funde.push(`${n}: ${z.trim().slice(0, 100)}`);
    }
  }
  assert.deepEqual(funde, [], "wegwerfen über ctx.papierkorb (Rückgängig) oder quellen.js papierkorb");
});
