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

test("Erweiterung: am Computer keine Wache, auf iPhone/iPad Rückkehr in die App entprellt prüfen", () => {
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

// Plugins nicht als versteckte Dateien abgleichen: Nachbau mit Einstellungen, die applyPartial übernimmt und speichert
function mitMustern(cfg, o = {}) {
  const n = nachbau({ angehalten: o.angehalten });
  const stand = Object.assign({ isConfigured: true, liveSync: true, syncInternalFiles: true }, cfg);
  const gespeichert = [];
  n.s.setting = {
    currentSettings: () => stand,
    applyPartial: async (teil, sofort) => { if (o.speichertNicht) return; Object.assign(stand, teil); gespeichert.push([teil, sofort]); },
  };
  if (o.ohneApply) delete n.s.setting.applyPartial;
  n.app.vault = { configDir: o.configDir || ".obsidian" };
  const lokal = new Map(o.lokal || []);
  const hinweise = [], logs = [];
  const opt = { app: n.app, lokal: (k, v) => { if (v === undefined) return lokal.get(k) || null; lokal.set(k, v); return v; },
    log: (z) => logs.push(z), hinweis: (t) => hinweise.push(t) };
  return { n, stand, gespeichert, lokal, hinweise, logs, opt };
}

test("Muster für versteckte Dateien: Plugins und community-plugins.json einmal je Gerät dazu, Schreibweise wie der Server, die eigenen bleiben", async () => {
  assert.deepEqual(L.MUSTER, ["/plugins/", "/community-plugins.json$"]);
  // so prüft LiveSync: jedes Muster als regulärer Ausdruck gegen den Pfad ohne führenden Schrägstrich, Groß- und Kleinschreibung egal
  const re = L.MUSTER.map((m) => new RegExp(m, "i"));
  const trifft = (p) => re.some((r) => r.test(p));
  for (const p of [".obsidian/plugins/studium-autopilot/main.js", ".obsidian/plugins/dataview/manifest.json", ".obsidian/community-plugins.json",
    ".obsidian/Plugins/x/data.json"]) assert.equal(trifft(p), true, p);
  for (const p of [".obsidian/app.json", ".obsidian/snippets/plugins.css", ".obsidian/community-plugins.json.bak", ".obsidian/core-plugins.json"]) assert.equal(trifft(p), false, p);

  // ein Gerät mit altem Link (nur der Kern): beide dazu
  const vorlage = "/node_modules/, /.git/, /obsidian-livesync/, /workspace(-mobile)?.json$, /plugins/studium-autopilot/";
  const m = mitMustern({ syncInternalFilesIgnorePatterns: vorlage });
  assert.equal(await L.pluginsNichtAbgleichen(m.opt), "ergänzt");
  assert.equal(m.stand.syncInternalFilesIgnorePatterns, vorlage + ", /plugins/, /community-plugins.json$");
  assert.deepEqual(m.gespeichert.map((g) => g[1]), [true], "über LiveSyncs eigenes Speichern, einmal");
  assert.equal(m.hinweise.length, 1);
  assert.match(m.hinweise[0], /Ein neues Plugin installierst du auf jedem Gerät selbst\.$/);
  assert.ok(m.n.protokoll.some((z) => /^log 32 Studium Autopilot: Plugins/.test(z)), "Vermerk im Protokoll von LiveSync");
  // einmal je Gerät: Nimmt jemand sie wieder heraus, bleibt das so
  m.stand.syncInternalFilesIgnorePatterns = vorlage;
  assert.equal(await L.pluginsNichtAbgleichen(m.opt), "schon");
  assert.equal(m.stand.syncInternalFilesIgnorePatterns, vorlage);

  // neuer Link des Servers (dieselben Muster, andere Leerzeichen): nichts geschrieben, kein Hinweis, gemerkt
  const da = mitMustern({ syncInternalFilesIgnorePatterns: "/node_modules/, /.git/, /workspace(-mobile)?.json$,/plugins/ , /community-plugins.json$" });
  assert.equal(await L.pluginsNichtAbgleichen(da.opt), "da");
  assert.deepEqual([da.gespeichert.length, da.hinweise.length, !!da.lokal.get("eba-livesync-plugins-ignoriert")], [0, 0, true]);
  // eins fehlt, Komma am Ende
  const halb = mitMustern({ syncInternalFilesIgnorePatterns: "/x/, /plugins/, " });
  assert.equal(await L.pluginsNichtAbgleichen(halb.opt), "ergänzt");
  assert.equal(halb.stand.syncInternalFilesIgnorePatterns, "/x/, /plugins/, /community-plugins.json$");
  // leer oder nie gesetzt; versteckte Dateien aus (etwa gleich nach dem Beitritt): Muster trotzdem, aber ohne Hinweis
  const leer = mitMustern({ syncInternalFiles: false });
  assert.equal(await L.pluginsNichtAbgleichen(leer.opt), "ergänzt");
  assert.deepEqual([leer.stand.syncInternalFilesIgnorePatterns, leer.hinweise.length], ["/plugins/, /community-plugins.json$", 0]);
  // LiveSync noch nicht ganz bereit (oder angehalten), seine Einstellungen aber geladen: schon jetzt, vor dem ersten Abgleich
  const frueh = mitMustern({}, { angehalten: true });
  assert.equal(await L.pluginsNichtAbgleichen(frueh.opt), "ergänzt");
});

test("Muster für versteckte Dateien: ohne LiveSync, nicht eingerichtet oder ohne applyPartial nichts; nicht gespeichert heißt später noch einmal", async () => {
  const ohne = mitMustern({});
  ohne.n.app.plugins.enabledPlugins = new Set();
  assert.equal(await L.pluginsNichtAbgleichen(ohne.opt), "aus");
  const nicht = mitMustern({ isConfigured: false });
  assert.equal(await L.pluginsNichtAbgleichen(nicht.opt), "aus");
  assert.equal(nicht.lokal.size, 0, "nichts gemerkt");
  assert.equal(await L.pluginsNichtAbgleichen(mitMustern({}, { ohneApply: true }).opt), "aus");
  assert.equal(await L.pluginsNichtAbgleichen(mitMustern({ syncInternalFilesIgnorePatterns: ["/x/"] }).opt), "aus", "unbekannte Form");
  const fest = mitMustern({ syncInternalFilesIgnorePatterns: "/x/" }, { speichertNicht: true });
  assert.equal(await L.pluginsNichtAbgleichen(fest.opt), "nicht gespeichert");
  assert.deepEqual([fest.lokal.size, fest.hinweise.length], [0, 0]);
});

test("Erweiterung: Muster gleich beim Laden; ohne eingerichtetes LiveSync 15-mal alle 2 s, dann jede Minute, eine Stunde lang", async () => {
  const m = mitMustern({ isConfigured: false });
  const zeiten = [];
  let naechster = null;
  m.n.app.loadLocalStorage = (k) => m.lokal.get(k) || null;
  m.n.app.saveLocalStorage = (k, v) => { m.lokal.set(k, v); };
  laden("livesync", { kontext: { app: m.n.app, obsidian: { Platform: { isMobile: false } }, zeit: (f, ms) => { zeiten.push(ms); naechster = f; return zeiten.length; } } }).ergebnis.registrieren();
  await new Promise((ok) => setImmediate(ok));
  assert.equal(zeiten.length, 1, "der erste Versuch lief gleich, ohne Wartezeit");
  for (let i = 0; i < 80; i++) { const f = naechster; naechster = null; if (f) f(); await new Promise((ok) => setImmediate(ok)); }
  assert.deepEqual(zeiten, Array(15).fill(2000).concat(Array(60).fill(60e3)));
  // in dieser Sitzung eingerichtet: beim nächsten Versuch dazu
  const n = mitMustern({ isConfigured: false });
  const z2 = [];
  let f2 = null;
  n.n.app.loadLocalStorage = (k) => n.lokal.get(k) || null;
  n.n.app.saveLocalStorage = (k, v) => { n.lokal.set(k, v); };
  laden("livesync", { kontext: { app: n.n.app, obsidian: { Platform: { isMobile: false } }, zeit: (f, ms) => { z2.push(ms); f2 = f; return z2.length; } } }).ergebnis.registrieren();
  await new Promise((ok) => setImmediate(ok));
  n.stand.isConfigured = true;
  f2();
  await new Promise((ok) => setImmediate(ok));
  assert.equal(n.stand.syncInternalFilesIgnorePatterns, "/plugins/, /community-plugins.json$");
  assert.equal(z2.length, 1, "danach kein weiterer Versuch");
});

test("Muster für versteckte Dateien: beim nächsten Start einmal nachsehen, verlorene still nachtragen, danach nie wieder", async () => {
  const vorlage = "/node_modules/, /.git/";
  const m = mitMustern({ syncInternalFilesIgnorePatterns: vorlage });
  const start = (sitzung) => Object.assign({}, m.opt, { sitzung });
  assert.equal(await L.pluginsNichtAbgleichen(start("s1")), "ergänzt");
  assert.equal(m.hinweise.length, 1);
  // LiveSync speichert danach ein älteres Einstellungsobjekt: die Muster sind weg
  m.stand.syncInternalFilesIgnorePatterns = vorlage;
  assert.equal(await L.pluginsNichtAbgleichen(start("s1")), "schon", "in derselben Sitzung nicht noch einmal");
  assert.equal(await L.pluginsNichtAbgleichen(start("s2")), "ergänzt", "beim nächsten Start nachgetragen");
  assert.equal(m.stand.syncInternalFilesIgnorePatterns, vorlage + ", /plugins/, /community-plugins.json$");
  assert.equal(m.hinweise.length, 1, "ohne zweiten Hinweis");
  // danach fertig: wer sie jetzt herausnimmt, behält das
  m.stand.syncInternalFilesIgnorePatterns = vorlage;
  assert.equal(await L.pluginsNichtAbgleichen(start("s3")), "schon");
  assert.equal(m.stand.syncInternalFilesIgnorePatterns, vorlage);
  // sind sie bei der Probe noch da: nur fertig, nichts geschrieben
  const n = mitMustern({ syncInternalFilesIgnorePatterns: vorlage });
  await L.pluginsNichtAbgleichen(Object.assign({}, n.opt, { sitzung: "a" }));
  const vorher = n.gespeichert.length;
  assert.equal(await L.pluginsNichtAbgleichen(Object.assign({}, n.opt, { sitzung: "b" })), "da");
  assert.deepEqual([n.gespeichert.length, n.lokal.get("eba-livesync-plugins-ignoriert").fertig], [vorher, true]);
});
