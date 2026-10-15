// Lädt ein Skript aus „Studium Autopilot/System/Skripte/“ außerhalb von Obsidian, mit einem minimalen Ersatz für die
// Teile von Obsidian und vom Plugin-Kontext (ctx), die beim Laden gebraucht werden. Nur für reine Logik (Prüfen, Rechnen);
// alles mit Oberfläche, Dateien oder Netz testet man in Obsidian selbst (siehe docs/tests.md).
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const WURZEL = path.join(__dirname, "..");
const SKRIPTE = path.join(WURZEL, "Studium Autopilot", "System", "Skripte");
const DATEN = path.join(__dirname, "daten", "v1");

// frontmatter: { "System/Daten/Semester.md": { … }, … } – was der metadataCache für diese Notizen liefern würde
function laden(name, { heute = "2026-10-15", frontmatter = {}, kontext = {} } = {}) {
  const code = fs.readFileSync(path.join(SKRIPTE, name + ".js"), "utf8");
  const app = {
    vault: {
      getAbstractFileByPath: (p) => (Object.prototype.hasOwnProperty.call(frontmatter, p) ? { path: p, basename: path.basename(p, ".md") } : null),
      getMarkdownFiles: () => [],
    },
    metadataCache: {
      getFileCache: (f) => (f && frontmatter[f.path] ? { frontmatter: frontmatter[f.path] } : null),
      on: () => ({}), offref: () => {},
    },
    workspace: { on: () => ({}) },
    loadLocalStorage: () => null,
    saveLocalStorage: () => {},
  };
  const ctx = Object.assign({
    app,
    obsidian: { Notice: class { constructor() {} setMessage() {} hide() {} }, requestUrl: async () => { throw new Error("kein Netz im Test"); } },
    plugin: {},
    user: {},
    date: {
      now: (format) => {
        if (format !== "YYYY-MM-DD") throw new Error("Testersatz kennt nur YYYY-MM-DD, nicht " + format);
        return heute;
      },
      jetzt: () => new Date(heute + "T12:00:00"),
    },
    bleibend: (_k, anfang) => (typeof anfang === "function" ? anfang() : anfang),
    entprellen: (fn) => fn,
    zeit: () => 0, intervall: () => 0, stopp: () => {},
    an: () => ({}), dom: () => {}, aufraeumen: () => {}, postprozessor: () => {}, editor: () => {},
    codeblock: () => ({ instanzen: () => [], neu: () => {} }),
  }, kontext);
  const modul = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function("module", "exports", "window", code)(modul, modul.exports, { app });
  const ergebnis = modul.exports(ctx);
  return { ctx, ergebnis };
}

function json(name) {
  return JSON.parse(fs.readFileSync(path.join(DATEN, name), "utf8"));
}

function bytes(name) {
  return new Uint8Array(fs.readFileSync(path.join(DATEN, name)));
}

module.exports = { laden, json, bytes, DATEN };
