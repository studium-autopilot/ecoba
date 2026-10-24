// Mitzählen (update.js, seit 0.6.5): einmal je Gerät und Version die Datei zaehler.txt aus dem GitHub-Release der laufenden
// Version abrufen, nie bei zentralen Daten aus, Mitzählen aus, während der Einrichtung oder mit Testeinstiegen.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const EINST = "System/Einstellungen.md";
const RELEASES = "https://github.com/studium-autopilot/ecoba/releases";

// o: { version, einstellungen (Frontmatter), zentral (an?), einrichtung (offen?), antwort (status | Error), plugin (Zusätze) }
const umgebung = (o = {}) => {
  const abrufe = [], speicher = {};
  const fm = o.einstellungen || { typ: "einstellungen" };
  const { ctx } = laden("update", {
    frontmatter: { [EINST]: fm },
    kontext: {
      obsidian: {
        requestUrl: async (a) => {
          abrufe.push(a);
          if (o.antwort instanceof Error) throw o.antwort;
          return { status: o.antwort || 200 };
        },
      },
      plugin: Object.assign({ manifest: { version: o.version || "0.6.5" } }, o.plugin),
      zentral: { RELEASES, status: () => ({ an: o.zentral !== false }) },
      einrichtung: { fenster: null, sollZeigen: () => !!o.einrichtung },
    },
  });
  ctx.app.loadLocalStorage = (k) => (Object.prototype.hasOwnProperty.call(speicher, k) ? speicher[k] : null);
  ctx.app.saveLocalStorage = (k, v) => { speicher[k] = v; };
  return { U: ctx.update, ctx, abrufe, speicher, fm };
};

test("Mitzählen: fällig nur einmal je Version, mit zentralen Daten, nach der Einrichtung", () => {
  const { U } = umgebung();
  const f = (x) => U.zaehlenFaellig(Object.assign({ an: true, zentral: true, einrichtung: false, laufend: "0.6.5", gezaehlt: null }, x));
  assert.equal(f({}), true);
  assert.equal(f({ gezaehlt: "0.6.4" }), true, "neue Version");
  assert.equal(f({ laufend: "0.7.0-beta.1", gezaehlt: "0.6.5" }), true, "Beta");
  assert.equal(f({ gezaehlt: "0.6.5" }), false, "schon gezählt");
  assert.equal(f({ gezaehlt: "nie" }), false, "Test- oder Entwicklungstresor");
  assert.equal(f({ an: false }), false, "Mitzählen aus");
  assert.equal(f({ zentral: false }), false, "zentrale Daten aus");
  assert.equal(f({ einrichtung: true }), false, "Einrichtung offen");
  assert.equal(f({ laufend: "0.0" }), false, "keine Version");
});

test("Mitzählen: Adresse ist die Datei im Release der laufenden Version", () => {
  const { U } = umgebung();
  assert.equal(U.zaehlerUrl("0.6.5"), RELEASES + "/download/v0.6.5/zaehler.txt");
  assert.equal(U.zaehlerUrl("0.7.0-beta.2"), RELEASES + "/download/v0.7.0-beta.2/zaehler.txt");
});

test("Mitzählen: einmal je Gerät und Version, nur GET ohne Angaben", async () => {
  const e = umgebung();
  assert.equal(await e.U.zaehlen(), true);
  assert.equal(e.abrufe.length, 1);
  assert.deepEqual(Object.keys(e.abrufe[0]).sort(), ["method", "throw", "url"], "keine Kopfzeilen, kein Inhalt");
  assert.equal(e.abrufe[0].method, "GET");
  assert.equal(e.abrufe[0].url, RELEASES + "/download/v0.6.5/zaehler.txt");
  assert.equal(e.speicher[e.U.L_GEZAEHLT], "0.6.5");
  assert.equal(await e.U.zaehlen(), false, "zweiter Start: nichts");
  assert.equal(e.abrufe.length, 1);
  // Neue Version läuft (Update hier oder über den Sync): einmal neu
  e.ctx.plugin.manifest.version = "0.6.6";
  assert.equal(await e.U.zaehlen(), true);
  assert.equal(e.abrufe.length, 2);
  assert.equal(e.speicher[e.U.L_GEZAEHLT], "0.6.6");
});

test("Mitzählen: ohne Netz beim nächsten Start noch einmal, 404 gilt als erledigt", async () => {
  const e = umgebung({ antwort: new Error("offline") });
  assert.equal(await e.U.zaehlen(), false);
  assert.equal(e.speicher[e.U.L_GEZAEHLT], undefined, "nicht gemerkt");
  const f = umgebung({ antwort: 404 });
  assert.equal(await f.U.zaehlen(), true);
  assert.equal(f.speicher[f.U.L_GEZAEHLT], "0.6.5", "Version ohne Release: nicht bei jedem Start fragen");
});

test("Mitzählen: nie bei aus, zentralen Daten aus, Einrichtung oder Testeinstiegen", async () => {
  const faelle = [
    umgebung({ einstellungen: { typ: "einstellungen", zaehlen: false } }),
    umgebung({ zentral: false }),
    umgebung({ einrichtung: true }),
    umgebung({ plugin: { testZentralAus: true } }),
    umgebung({ plugin: { testUpdateBasis: "http://127.0.0.1:8080/" } }),
  ];
  for (const e of faelle) {
    assert.equal(await e.U.zaehlen(), false);
    assert.equal(e.abrufe.length, 0);
  }
});

test("Mitzählen: Feld zaehlen, fehlt es, ist es an", () => {
  assert.equal(umgebung().U.zaehlenAn(), true);
  assert.equal(umgebung({ einstellungen: { zaehlen: true } }).U.zaehlenAn(), true);
  assert.equal(umgebung({ einstellungen: { zaehlen: false } }).U.zaehlenAn(), false);
});

test("Mitzählen: zwei Starts gleichzeitig rufen nur einmal ab", async () => {
  const e = umgebung();
  const [a, b] = await Promise.all([e.U.zaehlen(), e.U.zaehlen()]);
  assert.deepEqual([a, b].sort(), [false, true]);
  assert.equal(e.abrufe.length, 1);
});
