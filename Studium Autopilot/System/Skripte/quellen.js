// Quellen-Vertrag (seit 0.4.5): die gemeinsamen Regeln für jede Quelle, die Daten in den Tresor bringt (zentrale Daten, ILIAS,
// Alma-Stundenplan, Noten & Anmeldungen aus Alma, Volltext der PDFs; neue Quellen wie der ILIAS-Kalender oder ein eigener Server
// halten sich ebenso daran). Bibliothek: startet selbst nichts, außer planen() legt Zeitgeber über die Helfer des aufrufenden
// Skripts an (Hot-Reload räumt sie weg). Doku: docs/architektur/quellen.md, „Quellen-Vertrag“. Tests: tests/quellen.test.js.
//
// 1. Status: status() jeder Quelle liefert { zustand, geprueft, fehler, fehlerZeit, warnungen } (dazu Eigenes). statusForm()
//    bringt einen Stand in diese Form; nachLauf() schreibt den gerätelokalen Stand nach einem Lauf fort: Ein Fehler bleibt stehen
//    (mit Zeit), bis ein Lauf klappt, und „geprueft“ bleibt die Zeit des letzten Erfolgs. Die Zeile unter Verbindungen formatiert
//    verbindungen.js an einer Stelle (Zeitwörter aus vorText).
// 2. Zeitplan: planen(ctx, { takt, zurueck, backoff, start, lauf }) – erster Lauf, wenn der Tresor eingelesen ist, nach start
//    (Vorgabe 20 s + Zufall bis 2 Min.), danach im Takt; nach Fehlern nach backoff (1., 2., … Fehler in Folge; nie länger als
//    takt); zurück in der App nach mehr als zurueck seit dem letzten Versuch. Rein und testbar: zeitplan(). Ist das Fenster
//    verborgen und gleicht LiveSync so lange nicht ab (livesync.js, hintergrundStill; seit 0.6.8), wartet der Takt.
// 3. Ein Schreiber: sperre.js (ctx.user.sperre), „Hier aktualisieren“ = nehmen({ erzwingen: true }).
// 4. Quellen außerhalb des Plugins: eba.quelleExtern(schluessel, …) in JEDEM Lauf der Abruf-Funktion, nicht nur in der Oberfläche,
//    über extern(eba, …): dieselbe Regel auch, wenn auf einem Gerät noch eba.js einer älteren Fassung liegt.
// 5. Besitz einer Notiz: herkunft: <quelle> + Id-Feld (idFeld; ältere Namen bleiben gültig: zentral_id, alma_schluessel,
//    ilias_gruppe, gruppe_id, abgleich_id ohne herkunft, volltext_von: plugin). Das Feld quelle ist nur zum Lesen da.
// 6. Lebenslauf erzeugter Notizen: von dir gelöscht → Grabstein (kommt nicht wieder, bis sich der Eintrag in der Quelle ändert;
//    geloescht, kurzHash); in der Quelle weg → Papierkorb, wenn unberührt, sonst „(entfällt)“ (wegfall); dein Text unter
//    „## Meine Notizen“ bleibt immer (Stundenplan-Notizen: „## Notizen“, meineNotizen kennt beide); Massenschutz (zuViel);
//    Doppel einer id zusammenführen wie termine-sync.py des Uni-Abgleichs, erledigt gewinnt (dubletten).
// 7. Meldekanal „Bitte prüfen“: melden(ctx, quelle, fn) – fn() → [{ text: "**Titel** · Rest", pfad, anker? }] ohne persönliche
//    Werte; bitte-pruefen.js zeigt alle (meldungen) und zeichnet nach meldenNeu(ctx) neu (beiMeldung).
// Dazu für die Oberfläche (seit 0.4.7): verbindung() sagt, ob eine Quelle in diesem Tresor verbunden ist: hier, auf einem anderen
//    Gerät (dessen Sperre, höchstens 7 Tage still) oder nein.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const MIN = 60e3;
const K = Object.freeze({
  MEINE: "## Meine Notizen",          // eigener Text in Termin-Notizen
  NOTIZEN: "## Notizen",              // eigener Text in älteren Stundenplan-Notizen (neue: „## Meine Notizen“)
  ENTFAELLT: " (entfällt)",
  START: 20e3, START_ZUFALL: 2 * MIN, // erster Lauf nach dem Einlesen
  ZURUECK_WARTEN: 5e3,                // zurück in der App: so lange warten (Sync und Oberfläche zuerst)
  SYNC_WARTEN: 10 * MIN,              // Fenster verborgen und LiveSync angehalten: so lange bis zum nächsten Blick (planen)
  SYNC_ZURUECK: 30e3,                 // Fenster wieder sichtbar nach einem ausgelassenen Lauf: LiveSync holt erst den Stand
  REIHE: ["zentral", "ilias", "ilias-kalender", "alma", "alma-konto", "volltext", "server"], // Reihenfolge der Quellen in „Bitte prüfen“
  VERBUNDEN_GRENZE: 7 * 24 * 60 * MIN, // so lange still, gilt ein anderes Gerät noch als verbunden (verbindung)
});

// ---------- 1. Status ----------
const liste = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x == null ? "" : x).trim()).filter(Boolean);
// Stand → gemeinsame Form; weitere Felder bleiben. Ohne Fehler keine Fehlerzeit.
const statusForm = (x) => {
  const s = Object.assign({}, x || {});
  s.zustand = String(s.zustand == null ? "" : s.zustand);
  s.geprueft = String(s.geprueft || "");
  s.fehler = String(s.fehler || "");
  s.fehlerZeit = s.fehler ? String(s.fehlerZeit || "") : "";
  s.warnungen = liste(s.warnungen);
  return s;
};
// Gerätelokaler Stand einer Quelle nach einem Lauf. e = { ok: true, warnungen } | { ok: false, fehler } | { ok: null } (nichts
// zu tun: nur versucht). → neuer Stand { geprueft, versucht, fehler, fehlerZeit, warnungen, fehlerSerie }
const nachLauf = (alt, e, jetztIso) => {
  const s = Object.assign({ geprueft: "", versucht: "", fehler: "", fehlerZeit: "", warnungen: [], fehlerSerie: 0 }, alt || {});
  s.versucht = jetztIso;
  if (e && e.ok === true) Object.assign(s, { geprueft: jetztIso, fehler: "", fehlerZeit: "", fehlerSerie: 0, warnungen: liste(e.warnungen) });
  else if (e && e.ok === false) Object.assign(s, { fehler: String(e.fehler || "Fehler beim letzten Abruf."), fehlerZeit: jetztIso, fehlerSerie: (Number(s.fehlerSerie) || 0) + 1 });
  return s;
};
// Zeitwort für „Aktualisiert …“ (alle Zeilen gleich): „gerade eben“, „vor 5 Min.“, „vor 3 Std.“, „vor 2 Tagen“
const vorText = (iso, jetztMs) => {
  const t = Date.parse(iso || "");
  if (isNaN(t)) return "";
  const min = Math.max(0, Math.round((jetztMs - t) / MIN));
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  return h < 48 ? `vor ${h} Std.` : `vor ${Math.round(h / 24)} Tagen`;
};

// ---------- 2. Zeitplan ----------
// Rein: wann der nächste automatische Lauf kommt. backoff = Wartezeiten nach dem 1., 2., … Fehler in Folge (der letzte gilt weiter,
// keiner länger als takt); ohne backoff nach Fehlern wieder im Takt.
const zeitplan = (o) => {
  const takt = Number(o && o.takt) > 0 ? Number(o.takt) : 15 * MIN;
  const zurueck = Number(o && o.zurueck) > 0 ? Number(o.zurueck) : takt;
  const backoff = (Array.isArray(o && o.backoff) ? o.backoff : []).map(Number).filter((x) => x > 0).map((x) => Math.min(x, takt));
  return {
    takt, zurueck, backoff,
    naechster: (serie) => (serie > 0 && backoff.length ? backoff[Math.min(serie, backoff.length) - 1] : takt),
    zurueckFaellig: (versuchtMs, jetztMs) => versuchtMs > 0 && jetztMs - versuchtMs > zurueck,
  };
};
// Ergebnis eines Laufs → true (geklappt), false (Fehler), null (nichts zu tun). lauf() darf true/false/null oder { ok, naechster }
// liefern; naechster (ms) setzt den nächsten Lauf selbst (z. B. Volltext: Ruhezeit nach dem Start, nächster Stapel).
const ergebnisOk = (r) => {
  const v = r && typeof r === "object" ? r.ok : r;
  return v === true ? true : v === false ? false : null;
};
// Obsidian: Zeitgeber einer Quelle. ctx = Kontext des aufrufenden Skripts (ctx.zeit, ctx.stopp, ctx.dom, ctx.an, ctx.aufraeumen).
// o = { takt, zurueck, backoff, start: [ms, zufallMs], lauf({ grund: "takt" | "knopf" | Grund des Aufrufers }) → Promise,
//       versucht?() → ms des letzten Versuchs (gerätelokal gespeichert; sonst merkt sich planen ihn selbst), dokument?, app? }
// → { jetzt(grund) (gleich laufen), spaeter(ms) (nächsten Lauf neu setzen), stand() → { versucht, naechster, fehlerSerie, laeuft } }
// Ein Aufruf, während ein Lauf läuft, zählt nicht. Fehler im Lauf gelten als Fehler (backoff), nie als Absturz.
// LiveSync (seit 0.6.8): Ist das Fenster verborgen und gleicht LiveSync so lange nicht ab (ctx.user.livesync.hintergrundStill;
// am Computer ohne „Keep replication active in the background“), läuft der Takt nicht: Was der Lauf schriebe, auch die Sperre,
// sähen die anderen Geräte nicht; nach 80 Minuten übernähme eins die Quelle, und beide schrieben. Nach SYNC_WARTEN schaut der Takt
// wieder; wird das Fenster sichtbar, läuft er nach SYNC_ZURUECK nach (erst holt LiveSync den Stand der anderen). Knöpfe laufen immer.
const planen = (ctx, o) => {
  const p = zeitplan(o);
  const app = o.app || ctx.app || (typeof window !== "undefined" ? window.app : null);
  const dok = o.dokument || (typeof document !== "undefined" ? document : null);
  const start = Array.isArray(o.start) ? o.start : [K.START, K.START_ZUFALL];
  const mobil = !!(ctx.obsidian && ctx.obsidian.Platform && ctx.obsidian.Platform.isMobile);
  let id = null, laeuft = false, versucht = 0, serie = 0, naechster = 0, gestartet = false, aus = false, verpasst = false;
  const zuletzt = () => { const v = o.versucht ? Number(o.versucht()) || 0 : 0; return Math.max(v, versucht); };
  const still = () => { const L = ctx.user && ctx.user.livesync; return !!(L && typeof L.hintergrundStill === "function" && L.hintergrundStill(app, dok, mobil)); };
  const spaeter = (ms) => {
    if (aus) return;
    if (id != null) ctx.stopp(id);
    naechster = Date.now() + ms;
    id = ctx.zeit(() => { id = null; if (still()) { verpasst = true; spaeter(K.SYNC_WARTEN); } else jetzt("takt"); }, ms);
  };
  const jetzt = async (grund) => {
    if (laeuft || aus) return null;
    laeuft = true;
    versucht = Date.now();
    let r = null;
    try { r = await o.lauf({ grund: grund || "knopf" }); } catch (e) { r = false; }
    laeuft = false;
    const ok = ergebnisOk(r);
    if (ok === false) serie++; else if (ok === true) serie = 0;
    spaeter(r && typeof r === "object" && Number(r.naechster) > 0 ? Number(r.naechster) : p.naechster(serie));
    return r;
  };
  const los = () => { if (gestartet) return; gestartet = true; spaeter(Number(start[0]) + Math.floor(Math.random() * Math.max(0, Number(start[1]) || 0))); };
  const mc = app && app.metadataCache;
  if (!mc || mc.initialized || mc.resolved) los();
  else { const r = ctx.an(mc, "resolved", () => { mc.offref(r); los(); }); }
  // Zurück in der App (iPhone/iPad holen Obsidian aus dem Hintergrund, ohne neu zu starten): nachholen, wenn lange her oder ein
  // Lauf wegen LiveSync ausgelassen wurde
  if (dok && ctx.dom) ctx.dom(dok, "visibilitychange", () => {
    if (dok.visibilityState !== "visible" || !gestartet || laeuft) return;
    if (verpasst) { verpasst = false; spaeter(K.SYNC_ZURUECK); } else if (p.zurueckFaellig(zuletzt(), Date.now())) spaeter(K.ZURUECK_WARTEN);
  });
  if (ctx.aufraeumen) ctx.aufraeumen(() => { aus = true; });
  return { jetzt, spaeter, stand: () => ({ versucht: zuletzt(), naechster, fehlerSerie: serie, laeuft }), plan: p };
};

// ---------- 4. Quellen außerhalb des Plugins ----------
// Kommt eine Quelle von außen (eigener Uni-Abgleich, eigener Server)? Die Regel steht in eba.js (quelleExtern). Der Sync liefert
// Skripte einzeln, und eba.js bis 0.4.4 kennt nur eigenerAbgleich: Ohne eba.quelleExtern ginge sonst jede Quelle als „vom Plugin“
// durch, während ein anderes Gerät sie für extern hält (zwei Schreiber). Darum hier dieselbe Regel (tests/quellen-extern.test.js
// hält beide gleich): Liste quellen_extern, sonst beim eigenen Uni-Abgleich alles außer ilias-gruppen, sonst nichts.
const extern = (eba, schluessel, existiert, einstellungen) => {
  try {
    if (eba && typeof eba.quelleExtern === "function") return !!eba.quelleExtern(schluessel, existiert, einstellungen);
    const k = String(schluessel), v = (einstellungen || {}).quellen_extern;
    const liste = Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(",") : null;
    if (liste) return liste.some((x) => String(x == null ? "" : x).trim().toLowerCase() === k);
    return k !== "ilias-gruppen" && !!(eba && typeof eba.eigenerAbgleich === "function" && eba.eigenerAbgleich(existiert, einstellungen));
  } catch (e) { return false; }
};

// ---------- 5. Besitz ----------
// Id-Feld je herkunft; neue Quellen: <quelle>_id (Bindestriche → _). Ältere Namen bleiben gültig.
const ID_FELD = Object.freeze({
  zentral: "zentral_id", alma: "alma_schluessel", "ilias-gruppe": "ilias_gruppe", "gruppe-gewaehlt": "gruppe_id",
  abgleich: "abgleich_id", claude: "claude_id", "ilias-kalender": "ilias_kalender_id", volltext: "quelle",
});
const idFeld = (quelle) => {
  const q = String(quelle == null ? "" : quelle).trim();
  return Object.prototype.hasOwnProperty.call(ID_FELD, q) ? ID_FELD[q] : q.replace(/-/g, "_") + "_id";
};
// Wem gehört die Notiz? → { quelle, id } oder null (deine eigene Notiz). Ohne herkunft: Notiz eines eigenen Uni-Abgleichs
// (abgleich_id) bzw. Textfassung des Volltexts (volltext_von: plugin).
const besitz = (fm) => {
  if (!fm || typeof fm !== "object") return null;
  const h = String(fm.herkunft == null ? "" : fm.herkunft).trim();
  if (h) { const v = fm[idFeld(h)]; return { quelle: h, id: v == null ? "" : String(v) }; }
  if (fm.volltext_von === "plugin") return { quelle: "volltext", id: String(fm.quelle == null ? "" : fm.quelle) };
  if (fm.abgleich_id) return { quelle: "abgleich", id: String(fm.abgleich_id) };
  return null;
};
// Ein Papierkorb für alles (Bedien-Bausteine, seit 0.4.6): Obsidians Papierkorb nach deiner Einstellung „Gelöschte Dateien“
// (Papierkorb des Systems, auf iPhone und iPad .trash im Tresor), nie endgültig, auch wenn dort „Endgültig löschen“ steht. Jede
// Quelle und jede Aktion wirft nur hierüber weg (vorher drei Wege: System, .trash, endgültig). o.lokal: immer .trash (Tests,
// plugin.testPapierkorbLokal). Was du selbst wegwirfst, geht über ctx.papierkorb (papierkorb.js) mit „Rückgängig“.
const papierkorb = async (app, f, o) => {
  const lokal = !!(o && o.lokal) || !!(app.vault.getConfig && app.vault.getConfig("trashOption") === "local");
  return app.vault.trash(f, !lokal);
};

// Felder der Besitzmarke einer neuen Notiz
const marke = (quelle, id) => { const m = { herkunft: String(quelle) }; m[idFeld(quelle)] = String(id); return m; };

// ---------- 6. Lebenslauf ----------
const ABSCHNITT = /^## (?:Meine Notizen|Notizen)[ \t]*$/m;
const LEERE_ZEILE = /^\s*(?:[-*+]\s*(?:\[ \]\s*)?)?$/; // leer oder leerer Aufzählungspunkt (Platzhalter „- “)
const abschnitt = (text) => { const m = ABSCHNITT.exec(String(text == null ? "" : text)); return m ? { start: m.index, ende: m.index + m[0].length, kopf: m[0].trim() } : null; };
const eigeneZeilen = (text) => {
  const t = String(text == null ? "" : text), a = abschnitt(t);
  return a ? t.slice(a.ende).split(/\r?\n/).filter((z) => !LEERE_ZEILE.test(z)) : [];
};
// Dein Text in einer erzeugten Notiz (ohne leere Aufzählungspunkte), "" wenn keiner da ist
const meineNotizen = (text) => eigeneZeilen(text).join("\n").trim();
// Unberührt = nicht erledigt und kein eigener Text. Nur unberührte Notizen dürfen in den Papierkorb.
const unberuehrt = (fm, text) => !(fm && fm.erledigt === true) && !meineNotizen(text);
// In der Quelle weg: "papierkorb" (unberührt) | "entfaellt" (mit deinem Text oder erledigt) | "bleibt" (schon „(entfällt)“)
const wegfall = (fm, text) => (fm && fm.entfaellt === true ? "bleibt" : unberuehrt(fm, text) ? "papierkorb" : "entfaellt");
// Massenschutz: fallen mehr als min (Vorgabe 10) und mehr als die Hälfte auf einmal weg, gilt keiner als weggefallen
const zuViel = (weg, alle, min) => weg > (min == null ? 10 : min) && weg > alle / 2;
// Kurze Prüfsumme eines Eintrags (gleiche Rechnung wie bisher in zentral.js, darum bleiben alte Grabsteine gültig)
const kurzHash = (wert) => {
  const s = typeof wert === "string" ? wert : JSON.stringify(wert);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
// Grabstein: angewendet = { id: kurzHash } merkt sich, was als Notiz geschrieben wurde (synchronisiert, nur der Schreiber schreibt).
// Fehlt die Notiz und ist der Eintrag unverändert, hast du sie gelöscht: nicht neu anlegen.
const geloescht = (angewendet, id, hash) => !!angewendet && Object.prototype.hasOwnProperty.call(angewendet, id) && angewendet[id] === hash;
// Titel mit bzw. ohne „(entfällt)“
const titelEntfaellt = (t) => { const s = String(t == null ? "" : t).replace(/ \(entfällt\)$/, ""); return s + K.ENTFAELLT; };

// Eigene Zeilen anderer Notizen unter den Abschnitt dieser Notiz hängen (nur, was dort noch fehlt). Ohne Abschnitt kommt er ans
// Ende (kopf: „## Meine Notizen“ bzw. „## Notizen“). → neuer Text oder derselbe, wenn nichts fehlt
const meineMischen = (text, weitere, kopf) => {
  const t = String(text == null ? "" : text);
  const da = {};
  for (const z of eigeneZeilen(t)) da[z.trim()] = true;
  const neu = [];
  for (const w of weitere || []) for (const z of eigeneZeilen(w)) if (!da[z.trim()]) { da[z.trim()] = true; neu.push(z); }
  if (!neu.length) return t;
  const a = abschnitt(t);
  if (!a) return t.replace(/\s*$/, "") + "\n\n" + (kopf || K.MEINE) + "\n\n" + neu.join("\n") + "\n";
  // Platzhalter („- “) und Leerzeilen am Ende weg, die neuen Zeilen dahinter; was davor steht, bleibt wie es ist (auch die
  // Leerzeile unter der Überschrift eines leeren Abschnitts)
  const rest = t.slice(a.ende).split(/\r?\n/);
  const leerDanach = rest.length > 2 && !rest[1].trim();
  while (rest.length > 1 && LEERE_ZEILE.test(rest[rest.length - 1])) rest.pop();
  return t.slice(0, a.ende) + rest.join("\n") + "\n" + (rest.length === 1 && leerDanach ? "\n" : "") + neu.join("\n") + "\n";
};
// Doppel nach id gruppieren: liste = [{ pfad, fm, text }], idVon(x) → id oder "" → [[x, y, …]] (nur Gruppen mit mehr als einer Notiz)
const doppelGruppen = (liste, idVon) => {
  const je = {}, reihe = [];
  for (const x of liste || []) {
    const id = String(idVon(x) || "");
    if (!id) continue;
    if (!je[id]) { je[id] = []; reihe.push(id); }
    je[id].push(x);
  }
  return reihe.map((id) => je[id]).filter((g) => g.length > 1);
};
const name = (p) => String(p).slice(String(p).lastIndexOf("/") + 1).replace(/\.md$/i, "");
// Doppel einer id zusammenführen (wie termine-sync.py): bleibt = kürzester Dateiname, dann alphabetisch; erledigt: true gewinnt;
// eigene Zeilen der anderen kommen dazu. gruppe = [{ pfad, fm, text }] → { bleibt, weg: [Pfade], erledigt, text (neuer Text der
// bleibenden Notiz oder null, wenn unverändert) }
const dubletten = (gruppe, kopf) => {
  const g = (gruppe || []).slice().sort((a, b) => name(a.pfad).length - name(b.pfad).length || (name(a.pfad) < name(b.pfad) ? -1 : name(a.pfad) > name(b.pfad) ? 1 : 0));
  const bleibt = g[0], weg = g.slice(1);
  const erledigt = g.some((x) => x.fm && x.fm.erledigt === true);
  const text = meineMischen(bleibt.text, weg.map((x) => x.text), kopf);
  return { bleibt: bleibt.pfad, weg: weg.map((x) => x.pfad), erledigt: erledigt && !(bleibt.fm && bleibt.fm.erledigt === true), text: text === bleibt.text ? null : text };
};

// ---------- 7. Meldekanal „Bitte prüfen“ ----------
// Liegt im gemeinsamen ctx (jede Quelle meldet sich mit ihrem Skript an, Hot-Reload meldet ab). Punkte ohne persönliche Werte.
const kanal = (ctx) => {
  if (!ctx.meldekanal) ctx.meldekanal = { quellen: {}, hoerer: [] };
  return ctx.meldekanal;
};
const melden = (ctx, quelle, fn) => {
  const k = kanal(ctx), q = String(quelle);
  k.quellen[q] = fn;
  const weg = () => { if (k.quellen[q] === fn) delete k.quellen[q]; meldenNeu(ctx); };
  if (ctx.aufraeumen) ctx.aufraeumen(weg);
  return weg;
};
const meldungen = (ctx) => {
  const k = kanal(ctx), aus = [];
  const namen = Object.keys(k.quellen).sort((a, b) => {
    const ia = K.REIHE.indexOf(a), ib = K.REIHE.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : a > b ? 1 : 0);
  });
  for (const q of namen) {
    let l = [];
    try { l = k.quellen[q]() || []; } catch (e) { l = []; }
    for (const x of l) if (x && x.text && x.pfad) aus.push({ quelle: q, text: String(x.text), pfad: String(x.pfad), anker: x.anker ? String(x.anker) : "" });
  }
  return aus;
};
const meldenNeu = (ctx) => { for (const h of kanal(ctx).hoerer.slice()) { try { h(); } catch (e) { /* Hörer egal */ } } };
const beiMeldung = (ctx, fn) => {
  const k = kanal(ctx);
  k.hoerer.push(fn);
  const weg = () => { const i = k.hoerer.indexOf(fn); if (i >= 0) k.hoerer.splice(i, 1); };
  if (ctx.aufraeumen) ctx.aufraeumen(weg);
  return weg;
};

// ---------- Verbunden in diesem Tresor (seit 0.4.7) ----------
// Link und Passwort einer Quelle liegen nur auf dem Gerät, das verbunden ist; die Daten kommen über den Sync auf alle. Für die
// Oberfläche (verbindungen.js): o = { hier (dieses Gerät ist verbunden), sperre (Inhalt der Sperre der Quelle, sperre.lesenAus,
// oder null), geraet (dieses Gerät), jetztMs, grenze? } → { art: "hier" | "anderswo" | "nein", zuletzt }. anderswo: Ein anderes
// Gerät hält die Sperre, sie ist nicht frei, und es war vor höchstens grenze (K.VERBUNDEN_GRENZE, 7 Tage) aktiv; zuletzt = dann.
// Sonst nein (nie verbunden, getrennt oder länger still). Nur für die Anzeige; wer schreibt, regelt weiter sperre.js.
const verbindung = (o) => {
  const x = o || {}, s = x.sperre;
  if (x.hier) return { art: "hier", zuletzt: "" };
  const t = s ? Date.parse(s.zuletzt || "") : NaN, jetzt = typeof x.jetztMs === "number" ? x.jetztMs : Date.now();
  const grenze = x.grenze > 0 ? x.grenze : K.VERBUNDEN_GRENZE;
  const anderswo = !!s && !s.frei && !!s.geraet && s.geraet !== String(x.geraet || "") && !isNaN(t) && jetzt - t <= grenze;
  return anderswo ? { art: "anderswo", zuletzt: String(s.zuletzt) } : { art: "nein", zuletzt: "" };
};

const API = {
  K, statusForm, nachLauf, vorText, zeitplan, ergebnisOk, planen, extern, ID_FELD, idFeld, besitz, marke, meineNotizen, unberuehrt, wegfall,
  zuViel, kurzHash, geloescht, titelEntfaellt, meineMischen, doppelGruppen, dubletten, melden, meldungen, meldenNeu, beiMeldung, papierkorb,
  verbindung,
};
module.exports = function () { return API; };
Object.assign(module.exports, API);
