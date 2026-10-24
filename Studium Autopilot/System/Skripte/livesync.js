// LiveSync (seit 0.6.8): Was Studium Autopilot für Tresore tut, die mit Self-hosted LiveSync abgleichen (eigener Server,
// `studium-server livesync`). Läuft nur, wenn das Plugin „obsidian-livesync“ eingeschaltet ist; sonst passiert nichts.
//
// 1) Wache auf iPhone und iPad: iOS schließt im Hintergrund die lokale Datenbank (IndexedDB) von LiveSync. LiveSync merkt das
//    nicht (PouchDB vergisst die Verbindung nur bei versionchange/abort, nie bei close; so noch in 1.0.40) und gleicht danach
//    nichts mehr ab, bis Obsidian neu startet. Nach der Rückkehr in die App (5 s Ruhe) prüft die Wache die Datenbank mit info().
//    Ist sie geschlossen, wartet sie, bis LiveSync nichts mehr holt oder verarbeitet, öffnet die Datenbank über LiveSyncs eigene
//    Dienste neu und startet den Abgleich neu; scheitert das, lädt sie LiveSync neu. Höchstens alle 3 Minuten, Vermerk im Protokoll
//    von LiveSync. Übernommen aus einer Erweiterung, die seit 20.10.2026 in einem echten Tresor lief.
// 2) Für andere Skripte (ctx.user.livesync, ohne Obsidian testbar):
//      aktiv(app) → bool                       LiveSync ist eingeschaltet und eingerichtet
//      dienste(app) → core.services | null     nur, wenn alle Teile da sind, die diese Datei benutzt (sonst nichts tun)
//      hintergrundStill(app, dok, mobil) → bool  das Fenster ist verborgen und LiveSync gleicht so lange nicht ab (Computer ohne
//                                              „Keep replication active in the background“, iPhone/iPad immer): quellen.js ruft
//                                              dann nicht von selbst ab, weil niemand außer diesem Gerät die Ergebnisse sähe
// Benutzte Teile von LiveSync (geprüft 1.0.32 bis 1.0.40): app.plugins.plugins["obsidian-livesync"].core.services mit
// setting.currentSettings(), appLifecycle.isReady/isSuspended/onSuspending, database.localDatabaseDirect.localDatabase.info(),
// databaseEvents.initialiseDatabase, control.applySettings, API.addLog; Zähler replicator.*, replication.*, fileProcessing.*,
// conflict.* (nur gelesen). Fehlt etwas davon, macht die Wache nichts. Tests: tests/livesync.test.js. Doku: docs/architektur/livesync.md. iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const ID = "obsidian-livesync";
const K = Object.freeze({ PAUSE: 3 * 60e3, RUHE: 5000, FRIST: 10000, RUHIG_MAX: 60000, RUHIG_STILL: 5000, NOCHMAL: 60000 });

const fn = (o, k) => !!o && typeof o[k] === "function";
const lsPlugin = (app) => {
  const ps = app && app.plugins;
  if (!ps || !ps.enabledPlugins || typeof ps.enabledPlugins.has !== "function" || !ps.enabledPlugins.has(ID)) return null;
  return (ps.plugins && ps.plugins[ID]) || null;
};
const dienste = (app) => {
  const p = lsPlugin(app);
  const s = p && p.core && p.core.services;
  if (!s || !fn(s.setting, "currentSettings") || !fn(s.appLifecycle, "isReady") || !fn(s.appLifecycle, "isSuspended")
    || !fn(s.appLifecycle, "onSuspending") || !s.database || !fn(s.databaseEvents, "initialiseDatabase") || !fn(s.control, "applySettings")) return null;
  return s;
};
const einstellungen = (s) => { try { return s.setting.currentSettings() || null; } catch (e) { return null; } };
const aktiv = (app) => { const s = dienste(app), cfg = s && einstellungen(s); return !!(cfg && cfg.isConfigured); };
// Wie LiveSync selbst (ModuleObsidianEvents, keepReplicationActiveInBackground): verborgenes Fenster = Abgleich pausiert, außer
// am Computer mit dieser Einstellung und laufendem Abgleich (LiveSync oder Periodic)
const hintergrundStill = (app, dok, mobil) => {
  if (!dok || !(dok.hidden || dok.visibilityState === "hidden")) return false;
  const s = dienste(app), cfg = s && einstellungen(s);
  if (!cfg || !cfg.isConfigured) return false;
  return !(cfg.keepReplicationActiveInBackground && (cfg.liveSync || cfg.periodicReplication) && !mobil);
};

// → Promise, die nach ms mit Fehler endet (zeit/stopp: Zeitgeber des Skripts)
const frist = (p, ms, zeit, stopp) => new Promise((ok, nein) => {
  const id = zeit(() => nein(new Error("keine Antwort nach " + ms + " ms")), ms);
  Promise.resolve(p).then((w) => { stopp(id); ok(w); }, (e) => { stopp(id); nein(e); });
});
// Zustand der lokalen Datenbank: "ok" | "geschlossen" | "nicht eingerichtet" | "nicht bereit" | "keine lokale Datenbank" | "Fehler …"
const pruefen = async (s, zeit, stopp) => {
  const cfg = einstellungen(s);
  if (!cfg || !cfg.isConfigured) return "nicht eingerichtet";
  if (!s.appLifecycle.isReady() || s.appLifecycle.isSuspended()) return "nicht bereit";
  const ldb = s.database.localDatabaseDirect, pdb = ldb && ldb.localDatabase;
  if (!fn(pdb, "info")) return "keine lokale Datenbank";
  try { await frist(pdb.info(), K.FRIST, zeit, stopp); return "ok"; } catch (e) {
    const t = String((e && e.name) || "") + " " + String((e && e.message) || e);
    return /InvalidStateError|connection is closing|connection is closed/i.test(t) ? "geschlossen" : "Fehler " + ((e && e.name) || "");
  }
};
// fetch: LiveSync holt gerade etwas vom Server oder baut neu auf (dann nie eingreifen); arbeit: Warteschlangen als Text
const zaehler = (s) => {
  const w = (r) => (r && typeof r.value === "number" ? r.value : 0);
  const rc = s.replicator || {}, rp = s.replication || {}, fp = s.fileProcessing || {}, kf = s.conflict || {};
  return { fetch: w(rc.boundedRemoteActivityCount) + w(rc.boundedLocalApplicationActivityCount),
    arbeit: [w(fp.processing), w(fp.totalQueued), w(fp.batched), w(rp.databaseQueueCount), w(rp.storageApplyingCount), w(rp.replicationResultCount), w(kf.conflictProcessQueueCount)].join(",") };
};

// Die Wache (Ablauf oben, Punkt 1). o = { app, dok, zeit, stopp, uhr() → ms, zuletzt: { ms }, log(text), fehler(e), weiter() → bool }
// → { nachRueckkehr() → Promise<null | "ok" | "warten" | "neu geöffnet" | "neu geladen" | "Fehler"> }
const wache = (o) => {
  let laeuft = false, spaeter = null;
  const warte = (ms) => new Promise((ok) => { o.zeit(ok, ms); });
  const sichtbar = () => o.dok.visibilityState === "visible";
  const log = (s, text) => {
    const zeile = "Studium Autopilot: " + text;
    try { if (s && s.API && fn(s.API, "addLog")) s.API.addLog(zeile, 32); } catch (e) { /* Protokoll von LiveSync fehlt */ }
    o.log(zeile);
  };
  // LiveSync ruhig: nichts wird geholt, und die Warteschlangen sind leer oder stehen 5 s still (höchstens 60 s warten)
  const ruhig = async (s) => {
    const ende = o.uhr() + K.RUHIG_MAX;
    let vorher = null, seit = o.uhr();
    while (o.weiter() && o.uhr() < ende) {
      const z = zaehler(s);
      if (z.fetch > 0) return false;
      if (/^[0,]*$/.test(z.arbeit)) return true;
      if (z.arbeit !== vorher) { vorher = z.arbeit; seit = o.uhr(); } else if (o.uhr() - seit >= K.RUHIG_STILL) return true;
      await warte(1000);
    }
    return false;
  };
  const neuOeffnen = async (s) => {
    try { await s.appLifecycle.onSuspending(); } catch (e) { /* war schon angehalten */ }
    if ((await s.databaseEvents.initialiseDatabase(false, true, false, true)) === false) throw new Error("initialiseDatabase lieferte false");
    await s.control.applySettings();
  };
  const erneut = (s, grund, ms) => {
    log(s, "lokale Datenbank von LiveSync geschlossen, " + grund + ", nächster Versuch in " + Math.round(ms / 1000) + " s");
    if (spaeter != null) o.stopp(spaeter);
    spaeter = o.zeit(() => { spaeter = null; nachRueckkehr(); }, ms);
  };
  const nachRueckkehr = async () => {
    if (laeuft || !o.weiter() || !sichtbar()) return null;
    const s = dienste(o.app);
    if (!s) return null;
    laeuft = true;
    try {
      if ((await pruefen(s, o.zeit, o.stopp)) !== "geschlossen") return "ok";
      if (o.uhr() < o.zuletzt.ms) o.zuletzt.ms = 0; // Uhr zurückgestellt
      const rest = o.zuletzt.ms + K.PAUSE - o.uhr();
      if (rest > 0) { erneut(s, "letzter Versuch vor weniger als 3 Minuten", rest + 1000); return "warten"; }
      if (!(await ruhig(s))) {
        const z = zaehler(s);
        erneut(s, "LiveSync arbeitet noch (" + (z.fetch > 0 ? "holt vom Server" : "Warteschlangen " + z.arbeit) + ")", K.NOCHMAL);
        return "warten";
      }
      if (!o.weiter() || !sichtbar() || (await pruefen(s, o.zeit, o.stopp)) !== "geschlossen") return "ok";
      o.zuletzt.ms = o.uhr();
      try {
        await neuOeffnen(s);
        const befund = await pruefen(s, o.zeit, o.stopp);
        if (befund !== "ok") throw new Error("danach: " + befund);
        log(s, "lokale Datenbank von LiveSync war nach der Rückkehr geschlossen, neu geöffnet und Abgleich neu gestartet");
        return "neu geöffnet";
      } catch (e) {
        log(s, "Neuöffnen scheiterte (" + ((e && e.message) || e) + "), LiveSync wird neu geladen");
        await o.app.plugins.disablePlugin(ID);
        await o.app.plugins.enablePlugin(ID);
        log(dienste(o.app), "LiveSync neu geladen");
        return "neu geladen";
      }
    } catch (e) { o.fehler(e); return "Fehler"; } finally { laeuft = false; }
  };
  return { nachRueckkehr };
};

module.exports = function (ctx) {
  const app = ctx.app;
  const registrieren = () => {
    const P = ctx.obsidian && ctx.obsidian.Platform;
    if (!P || !P.isMobile) return;
    let an = true;
    ctx.aufraeumen(() => { an = false; });
    const w = wache({ app, dok: document, zeit: ctx.zeit, stopp: ctx.stopp, uhr: () => Date.now(), zuletzt: ctx.bleibend("zuletzt", () => ({ ms: 0 })),
      log: (zeile) => console.info(zeile), fehler: (e) => console.error("Studium Autopilot: LiveSync-Wache", e), weiter: () => an });
    const planen = ctx.entprellen(() => { w.nachRueckkehr(); }, K.RUHE);
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "visible" && lsPlugin(app)) planen(); });
  };
  return { registrieren };
};
module.exports.ID = ID;
module.exports.K = K;
module.exports.dienste = dienste;
module.exports.aktiv = aktiv;
module.exports.hintergrundStill = hintergrundStill;
module.exports.pruefen = pruefen;
module.exports.zaehler = zaehler;
module.exports.wache = wache;
