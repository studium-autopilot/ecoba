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
// 3) Plugins nicht als versteckte Dateien abgleichen (seit 02.11.2026, alle Geräte): Ein übernommenes Gerät könnte sonst über
//    LiveSync einen veränderten Kern von Studium Autopilot oder ein weiteres Plugin samt community-plugins.json an alle anderen
//    schicken. Einmal je Gerät kommen die Muster MUSTER zu den Mustern für versteckte Dateien, die LiveSync ignoriert
//    (syncInternalFilesIgnorePatterns), nur wenn sie fehlen; die übrigen bleiben. Neue Links von server/livesync.mjs setzen
//    dieselben Muster in derselben Schreibweise ab der nächsten Version des Servers. Danach installiert jedes Gerät seine
//    Plugins selbst; den Kern holt es mit „Neu laden“ aus dem Release. So früh wie möglich: gleich beim Laden, sobald LiveSync
//    seine Einstellungen hat, sonst alle 2 s, später jede Minute, eine Stunde lang.
// Benutzte Teile von LiveSync (geprüft 1.0.32 bis 1.0.40): app.plugins.plugins["obsidian-livesync"].core.services mit
// setting.currentSettings(), appLifecycle.isReady/isSuspended/onSuspending, database.localDatabaseDirect.localDatabase.info(),
// databaseEvents.initialiseDatabase, control.applySettings, API.addLog; Zähler replicator.*, replication.*, fileProcessing.*,
// conflict.* (nur gelesen); für 3) setting.applyPartial(teil, true) (übernimmt und speichert wie LiveSyncs eigene Knöpfe; geprüft
// in 1.0.38). Fehlt etwas davon, macht die Datei nichts. Tests: tests/livesync.test.js. Doku: docs/architektur/livesync.md. iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const ID = "obsidian-livesync";
const K = Object.freeze({ PAUSE: 3 * 60e3, RUHE: 5000, FRIST: 10000, RUHIG_MAX: 60000, RUHIG_STILL: 5000, NOCHMAL: 60000, MUSTER_VERSUCHE: 75 });

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

// ---------- 3) Plugins nicht als versteckte Dateien abgleichen ----------
// LiveSync liest jedes Muster als regulären Ausdruck (durch Kommas getrennt, Leerzeichen am Rand zählen nicht, Groß- und
// Kleinschreibung egal, außer mit handleFilenameCaseSensitive) und prüft ihn gegen den Pfad im Tresor ohne führenden Schrägstrich,
// beim Senden und beim Empfangen. „/plugins/“ trifft also „.obsidian/plugins/…“ (und jeden versteckten Ordner „plugins“ tiefer),
// „/community-plugins.json$“ trifft „.obsidian/community-plugins.json“ (der Punkt steht dort für jedes Zeichen, das schadet nicht).
// Dieselbe Schreibweise wie server/livesync.mjs, damit ein Gerät mit neuem Link nichts doppelt bekommt.
// gerätelokal: { seit (erstes Mal), sitzung, fertig } – nach dem ersten Mal noch eine Probe in einer späteren Sitzung, dann fertig
const MARKE = "eba-livesync-plugins-ignoriert";
const MUSTER = Object.freeze(["/plugins/", "/community-plugins.json$"]);
const musterListe = (s) => String(s == null ? "" : s).split(",").map((t) => t.trim()).filter((t) => t);
// bisherige Muster (Text) + nötige → neuer Text, oder null, wenn alle schon dastehen; Reihenfolge und Schreibweise der bisherigen bleiben
const musterErgaenzen = (alt, noetig) => {
  const da = musterListe(alt), fehlt = noetig.filter((m) => da.indexOf(m) < 0);
  if (!fehlt.length) return null;
  const basis = String(alt == null ? "" : alt).replace(/[\s,]+$/, "");
  return (basis ? basis + ", " : "") + fehlt.join(", ");
};
// o = { app, lokal(k, v?) (gerätelokal), log(text), hinweis(text), sitzung (Kennung dieses Starts) } → Promise<"schon" | "aus" | "da" |
// "ergänzt" | "nicht gespeichert">. Wartet nicht, bis LiveSync ganz bereit ist (das kann nach seinem ersten Abgleich der versteckten
// Dateien sein), nur, bis es seine Einstellungen geladen hat (isConfigured); applyPartial übernimmt sie sofort, LiveSync liest die
// Muster bei jeder Datei neu. Speichert LiveSync danach noch ein älteres Einstellungsobjekt, wären sie wieder weg: Darum prüft das
// Gerät beim nächsten Start (oder nach einem Tag) noch einmal und trägt fehlende nach, ohne neuen Hinweis. Danach nie wieder: Nimmt
// jemand die Muster dann in LiveSync heraus, bleibt das so.
const pluginsNichtAbgleichen = async (o) => {
  const m = o.lokal(MARKE), probe = !!(m && typeof m === "object" && !m.fertig);
  if (m && !probe) return "schon";
  if (probe && m.sitzung === o.sitzung && Date.now() - Date.parse(m.seit || "") < 864e5) return "schon";
  const s = dienste(o.app), cfg = s && einstellungen(s);
  if (!s || !fn(s.setting, "applyPartial") || !cfg || !cfg.isConfigured) return "aus";
  const alt = cfg.syncInternalFilesIgnorePatterns;
  if (alt != null && typeof alt !== "string") return "aus";
  const neu = musterErgaenzen(alt, MUSTER);
  if (neu != null) {
    await s.setting.applyPartial({ syncInternalFilesIgnorePatterns: neu }, true);
    const jetzt = einstellungen(s);
    if (!jetzt || jetzt.syncInternalFilesIgnorePatterns !== neu) return "nicht gespeichert";
    const zeile = "Studium Autopilot: Plugins und community-plugins.json gleicht LiveSync nicht mehr ab (Muster für versteckte Dateien ergänzt)";
    try { if (s.API && fn(s.API, "addLog")) s.API.addLog(zeile, 32); } catch (e) { /* Protokoll von LiveSync fehlt */ }
    o.log(zeile);
    if (cfg.syncInternalFiles && !probe) o.hinweis("LiveSync gleicht deine Plugins jetzt nicht mehr zwischen deinen Geräten ab, damit kein fremdes Gerät sie verändern kann. Ein neues Plugin installierst du auf jedem Gerät selbst.");
  }
  o.lokal(MARKE, probe ? { seit: m.seit, fertig: true } : { seit: new Date().toISOString(), sitzung: o.sitzung });
  return neu == null ? "da" : "ergänzt";
};

module.exports = function (ctx) {
  const app = ctx.app;
  const registrieren = () => {
    let an = true;
    ctx.aufraeumen(() => { an = false; });
    // 3) auf jedem Gerät: gleich beim Laden; solange LiveSync fehlt oder seine Einstellungen noch nicht hat, 15-mal alle 2 s, dann
    // jede Minute bis eine Stunde nach dem Start (auch, wenn LiveSync erst in dieser Sitzung eingerichtet wird)
    const lokal = (k, v) => { if (v === undefined) return app.loadLocalStorage(k); app.saveLocalStorage(k, v); return v; };
    const sitzung = new Date().toISOString() + "-" + Math.random().toString(36).slice(2, 8);
    const nachtragen = (n) => {
      if (!an) return;
      pluginsNichtAbgleichen({ app, lokal, log: (zeile) => console.info(zeile), hinweis: (t) => ctx.hinweis(t), sitzung })
        .then((r) => { if ((r === "aus" || r === "nicht gespeichert") && n < K.MUSTER_VERSUCHE) ctx.zeit(() => nachtragen(n + 1), n < 15 ? 2000 : 60e3); })
        .catch((e) => console.error("Studium Autopilot: LiveSync-Muster", e));
    };
    nachtragen(0);
    const P = ctx.obsidian && ctx.obsidian.Platform;
    if (!P || !P.isMobile) return;
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
module.exports.MUSTER = MUSTER;
module.exports.musterErgaenzen = musterErgaenzen;
module.exports.pluginsNichtAbgleichen = pluginsNichtAbgleichen;
