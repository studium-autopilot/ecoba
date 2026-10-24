// LiveSync (livesync.js): Wache auf iPhone/iPad gegen die von iOS geschlossene lokale Datenbank, Helfer für andere Skripte.
// LiveSync selbst gibt es hier nicht: Die Tests bauen die Teile von core.services nach, die livesync.js benutzt.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { laden } = require("./laden.js");

const L = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "livesync.js"));

// Nachbau von LiveSync: offen = lokale Datenbank antwortet; heilt = Neuöffnen hilft; protokoll = was aufgerufen wurde
function nachbau(o = {}) {
  const protokoll = [];
  const z = Object.assign({ fetch: 0, warteschlange: 0 }, o.zaehler);
  const st = { offen: o.offen !== false };
  const zahl = (k) => ({ get value() { return typeof z[k] === "function" ? z[k]() : z[k]; } });
  const s = {
    setting: { currentSettings: () => Object.assign({ isConfigured: true, liveSync: true }, o.cfg) },
    appLifecycle: { isReady: () => true, isSuspended: () => !!o.angehalten, onSuspending: async () => { protokoll.push("anhalten"); } },
    database: { get localDatabaseDirect() { return { localDatabase: { info: async () => {
      if (o.infoFehler) throw Object.assign(new Error("kaputt"), { name: "DataCloneError" });
      if (!st.offen) throw Object.assign(new Error("The database connection is closing."), { name: "InvalidStateError" });
      return { doc_count: 1 };
    } } }; } },
    databaseEvents: { initialiseDatabase: async (...a) => { protokoll.push("öffnen " + a.join(",")); if (o.heilt !== false) st.offen = true; return true; } },
    control: { applySettings: async () => { protokoll.push("einstellungen"); } },
    API: { addLog: (text, stufe) => { protokoll.push("log " + stufe + " " + text); } },
    replicator: { boundedRemoteActivityCount: zahl("fetch"), boundedLocalApplicationActivityCount: { value: 0 } },
    fileProcessing: { processing: zahl("warteschlange"), totalQueued: { value: 0 }, batched: { value: 0 } },
    replication: { databaseQueueCount: { value: 0 }, storageApplyingCount: { value: 0 }, replicationResultCount: { value: 0 } },
    conflict: { conflictProcessQueueCount: { value: 0 } },
  };
  if (o.ohne) delete s[o.ohne];
  const app = { plugins: {
    enabledPlugins: new Set(o.aus ? [] : [L.ID]),
    plugins: { [L.ID]: { core: { services: s } } },
    disablePlugin: async (id) => { protokoll.push("aus " + id); },
    enablePlugin: async (id) => { protokoll.push("ein " + id); st.offen = true; },
  } };
  return { s, app, st, protokoll, z };
}

// Wache mit gestellter Uhr: Zeitgeber bis 1 s laufen sofort (Uhr rückt vor), längere bleiben liegen (Frist, nächster Versuch)
function mitWache(n, o = {}) {
  const uhr = { ms: o.uhr || 1e9 };
  const liegen = [];
  const zuletzt = { ms: o.zuletzt || 0 };
  const dok = { visibilityState: o.verborgen ? "hidden" : "visible" };
  const fehler = [];
  const zeit = (f, ms) => { if (ms <= 1000) { uhr.ms += ms; Promise.resolve().then(f); return 0; } liegen.push(ms); return liegen.length; };
  const w = L.wache({ app: n.app, dok, zeit, stopp: () => {}, uhr: () => uhr.ms, zuletzt, log: () => {}, fehler: (e) => fehler.push(e), weiter: () => true });
  return { w, uhr, liegen, zuletzt, dok, fehler };
}

test("dienste: nur mit eingeschaltetem LiveSync und allen benutzten Teilen", () => {
  assert.equal(L.dienste(nachbau().app) !== null, true);
  assert.equal(L.dienste(nachbau({ aus: true }).app), null);
  assert.equal(L.dienste(nachbau({ ohne: "databaseEvents" }).app), null);
  assert.equal(L.dienste(nachbau({ ohne: "control" }).app), null);
  assert.equal(L.dienste({}), null);
  assert.equal(L.dienste({ plugins: { enabledPlugins: new Set([L.ID]), plugins: { [L.ID]: {} } } }), null);
  assert.equal(L.aktiv(nachbau().app), true);
  assert.equal(L.aktiv(nachbau({ cfg: { isConfigured: false } }).app), false);
  assert.equal(L.aktiv(nachbau({ aus: true }).app), false);
});

test("hintergrundStill: verborgenes Fenster, LiveSync pausiert (wie LiveSync selbst entscheidet)", () => {
  const sichtbar = { visibilityState: "visible", hidden: false };
  const verborgen = { visibilityState: "hidden", hidden: true };
  assert.equal(L.hintergrundStill(nachbau().app, sichtbar, false), false);
  assert.equal(L.hintergrundStill(nachbau().app, verborgen, false), true);
  assert.equal(L.hintergrundStill(nachbau({ cfg: { keepReplicationActiveInBackground: true } }).app, verborgen, false), false);
  assert.equal(L.hintergrundStill(nachbau({ cfg: { keepReplicationActiveInBackground: true, liveSync: false, periodicReplication: true } }).app, verborgen, false), false);
  assert.equal(L.hintergrundStill(nachbau({ cfg: { keepReplicationActiveInBackground: true, liveSync: false } }).app, verborgen, false), true, "ohne laufenden Abgleich gilt die Einstellung nicht");
  assert.equal(L.hintergrundStill(nachbau({ cfg: { keepReplicationActiveInBackground: true } }).app, verborgen, true), true, "iPhone/iPad: Einstellung nur am Computer");
  assert.equal(L.hintergrundStill(nachbau({ aus: true }).app, verborgen, false), false, "ohne LiveSync nichts zurückhalten");
  assert.equal(L.hintergrundStill(nachbau({ cfg: { isConfigured: false } }).app, verborgen, false), false);
  assert.equal(L.hintergrundStill(nachbau().app, null, false), false);
});

test("pruefen: offen, von iOS geschlossen, nicht bereit, anderer Fehler", async () => {
  const z = () => 0;
  assert.equal(await L.pruefen(nachbau().s, z, () => {}), "ok");
  assert.equal(await L.pruefen(nachbau({ offen: false }).s, z, () => {}), "geschlossen");
  assert.equal(await L.pruefen(nachbau({ angehalten: true }).s, z, () => {}), "nicht bereit");
  assert.equal(await L.pruefen(nachbau({ cfg: { isConfigured: false } }).s, z, () => {}), "nicht eingerichtet");
  assert.equal(await L.pruefen(nachbau({ infoFehler: true }).s, z, () => {}), "Fehler DataCloneError");
});

test("Wache: offene Datenbank bleibt in Ruhe; verborgen oder ohne LiveSync tut sie nichts", async () => {
  const n = nachbau();
  assert.equal(await mitWache(n).w.nachRueckkehr(), "ok");
  assert.deepEqual(n.protokoll, []);
  const zu = nachbau({ offen: false });
  assert.equal(await mitWache(zu, { verborgen: true }).w.nachRueckkehr(), null);
  assert.equal(await mitWache(nachbau({ offen: false, aus: true })).w.nachRueckkehr(), null);
  assert.equal(await mitWache(nachbau({ offen: false, ohne: "control" })).w.nachRueckkehr(), null, "unbekannte LiveSync-Fassung: nichts anfassen");
  assert.deepEqual(zu.protokoll, []);
});

test("Wache: geschlossene Datenbank wird neu geöffnet, Abgleich neu gestartet, Vermerk im Protokoll von LiveSync", async () => {
  const n = nachbau({ offen: false });
  const m = mitWache(n);
  assert.equal(await m.w.nachRueckkehr(), "neu geöffnet");
  assert.deepEqual(n.protokoll.slice(0, 3), ["anhalten", "öffnen false,true,false,true", "einstellungen"]);
  assert.match(n.protokoll[3], /^log 32 Studium Autopilot: lokale Datenbank von LiveSync war nach der Rückkehr geschlossen/);
  assert.equal(n.st.offen, true);
  assert.equal(m.zuletzt.ms, m.uhr.ms, "Zeitpunkt gemerkt (überlebt Neuladen über ctx.bleibend)");
});

test("Wache: höchstens alle 3 Minuten; danach neuer Versuch", async () => {
  const n = nachbau({ offen: false });
  const m = mitWache(n, { uhr: 1e9, zuletzt: 1e9 - 60e3 });
  assert.equal(await m.w.nachRueckkehr(), "warten");
  assert.deepEqual(m.liegen.filter((ms) => ms !== L.K.FRIST), [2 * 60e3 + 1000]);
  assert.equal(n.protokoll.some((z) => z.startsWith("öffnen")), false);
  assert.match(n.protokoll[0], /letzter Versuch vor weniger als 3 Minuten/);
  // Uhr zurückgestellt: zählt nicht als „vor kurzem“
  const n2 = nachbau({ offen: false });
  assert.equal(await mitWache(n2, { uhr: 1e9, zuletzt: 2e9 }).w.nachRueckkehr(), "neu geöffnet");
});

test("Wache: holt LiveSync gerade vom Server, greift sie nicht ein; stehende Warteschlange gilt nach 5 s als ruhig", async () => {
  const n = nachbau({ offen: false, zaehler: { fetch: 1 } });
  const m = mitWache(n);
  assert.equal(await m.w.nachRueckkehr(), "warten");
  assert.deepEqual(m.liegen.filter((ms) => ms !== L.K.FRIST), [L.K.NOCHMAL]);
  assert.match(n.protokoll[0], /holt vom Server/);
  assert.equal(n.protokoll.some((z) => z.startsWith("öffnen")), false);

  const steht = nachbau({ offen: false, zaehler: { warteschlange: 3 } });
  assert.equal(await mitWache(steht).w.nachRueckkehr(), "neu geöffnet");

  let i = 0;
  const wandert = nachbau({ offen: false, zaehler: { warteschlange: () => ++i } });
  const m2 = mitWache(wandert);
  assert.equal(await m2.w.nachRueckkehr(), "warten", "60 s lang in Arbeit: später");
  assert.match(wandert.protokoll[0], /Warteschlangen \d+,0,0,0,0,0,0/);
});

test("Wache: hilft das Neuöffnen nicht, wird LiveSync neu geladen; Fehler enden still", async () => {
  const n = nachbau({ offen: false, heilt: false });
  assert.equal(await mitWache(n).w.nachRueckkehr(), "neu geladen");
  assert.deepEqual(n.protokoll.filter((z) => !z.startsWith("log")).slice(-2), ["aus " + L.ID, "ein " + L.ID]);
  assert.ok(n.protokoll.some((z) => /Neuöffnen scheiterte \(danach: geschlossen\)/.test(z)));

  const kaputt = nachbau({ offen: false, heilt: false });
  kaputt.app.plugins.disablePlugin = async () => { throw new Error("geht nicht"); };
  const m = mitWache(kaputt);
  assert.equal(await m.w.nachRueckkehr(), "Fehler");
  assert.equal(m.fehler.length, 1);
});

test("Erweiterung: am Computer nichts, auf iPhone/iPad Rückkehr in die App entprellt prüfen", () => {
  const dom = [];
  laden("livesync", { kontext: { obsidian: { Platform: { isMobile: false } }, dom: (...a) => dom.push(a) } }).ergebnis.registrieren();
  assert.equal(dom.length, 0);
  const vorher = global.document;
  global.document = { visibilityState: "visible" };
  try {
    let entprellt = 0;
    laden("livesync", { kontext: { obsidian: { Platform: { isMobile: true } }, dom: (...a) => dom.push(a), entprellen: (f, ms) => { entprellt = ms; return f; } } }).ergebnis.registrieren();
    assert.equal(dom.length, 1);
    assert.equal(dom[0][1], "visibilitychange");
    assert.equal(entprellt, L.K.RUHE);
  } finally { global.document = vorher; }
});
