// Studium Autopilot – schlanker Kern des Vaults (ersetzt Templater). Handgeschrieben, kein Build-Schritt.
// Aufgaben:
//  1. Beim Start alle Skripte aus System/Skripte/*.js laden (CommonJS, per eval) und die Erweiterungen starten
//     (Skripte mit `registrieren(` oder `aktionen:`). Jedes Skript bekommt das Kontextobjekt `ctx` (siehe kontextBauen).
//  2. Aktionen ausführen: Knöpfe `obsidian://studium-autopilot?aktion=<name>&…` (Klick wird im Capture-Modus abgefangen,
//     zusätzlich Protokoll-Handler), Befehle in der Befehlspalette, Ordner-Automatik für neue leere Notizen.
//  3. Hot-Reload: Geänderte Skripte werden ohne Neustart neu geladen. Vorher meldet der Kern alles ab, was die alte Fassung
//     über die Helfer in ctx angemeldet hat (ctx.an, ctx.dom, ctx.intervall, ctx.zeit, ctx.codeblock, ctx.postprozessor,
//     ctx.editor, ctx.aufraeumen), und entfernt ihre Aktionen und Befehle. Beim Entladen des Plugins dasselbe für alle Skripte.
// Fehler einer Erweiterung oder Aktion stoppen nie den Rest; sie erscheinen als Hinweis (Notice) und in der Konsole.
// iOS-sicher: keine Node-APIs, kein Regex-Lookbehind, kein .at()/findLast/structuredClone.
// Doku für Entwickler: docs/architektur.md im Projektordner.
"use strict";
const obsidian = require("obsidian");
const { Plugin, Modal, FuzzySuggestModal, Notice, TFile } = obsidian;

const SKRIPTE = "System/Skripte/";
const PROTOKOLL = "studium-autopilot";
const LINK = "obsidian://" + PROTOKOLL;
const CURSOR = String.fromCharCode(0xE000); // Platzhalter für die Cursor-Position in erzeugten Notizen (siehe eba.js, ablegen)
// CodeMirror 6 stellt Obsidian Plugins per require bereit (auch auf Mobilgeräten); für echte Editor-Erweiterungen.
const cmLaden = (name) => { try { return require(name); } catch (e) { return null; } };
const CM = { view: cmLaden("@codemirror/view"), state: cmLaden("@codemirror/state") };

// ---------- Eingabefenster (ersetzt tp.system.prompt) ----------
class Eingabe extends Modal {
  constructor(app, frage, vorschlag, fertig) {
    super(app);
    this.frage = String(frage == null ? "" : frage);
    this.vorschlag = String(vorschlag == null ? "" : vorschlag);
    this.fertig = fertig;
    this.erledigt = false;
  }
  onOpen() {
    this.modalEl.addClass("sa-eingabe");
    this.contentEl.createEl("p", { text: this.frage, cls: "sa-frage" });
    const feld = this.contentEl.createEl("input", { type: "text", cls: "sa-feld" });
    feld.value = this.vorschlag;
    feld.style.width = "100%";
    const knoepfe = this.contentEl.createDiv({ cls: "modal-button-container" });
    const ok = knoepfe.createEl("button", { text: "OK", cls: "mod-cta" });
    const ab = knoepfe.createEl("button", { text: "Abbrechen" });
    const senden = () => { this.erledigt = true; const w = feld.value; this.close(); this.fertig(w); };
    ok.addEventListener("click", senden);
    ab.addEventListener("click", () => this.close());
    feld.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); senden(); } });
    setTimeout(() => { feld.focus(); feld.select(); }, 30);
  }
  onClose() { this.contentEl.empty(); if (!this.erledigt) { this.erledigt = true; this.fertig(null); } }
}

// ---------- Auswahlliste (ersetzt tp.system.suggester) ----------
class Auswahl extends FuzzySuggestModal {
  constructor(app, texte, werte, platzhalter, fertig) {
    super(app);
    this.texte = texte; this.werte = werte; this.fertig = fertig; this.erledigt = false;
    if (platzhalter) this.setPlaceholder(String(platzhalter));
  }
  getItems() { return this.werte.map((w, i) => i); }
  getItemText(i) { return String(this.texte[i]); }
  // Obsidian schließt das Fenster VOR onChooseItem; darum hier merken, dass gewählt wurde (sonst meldet onClose „Esc“)
  selectSuggestion(wert, evt) { this.erledigt = true; this.close(); this.onChooseSuggestion(wert, evt); }
  onChooseItem(i) { this.fertig(this.werte[i]); }
  onClose() { if (!this.erledigt) { this.erledigt = true; this.fertig(null); } }
}

// Query-Teil eines Links lesen. Eigene Zerlegung statt URLSearchParams: „+“ bleibt „+“ (Bases-Formeln kodieren als %2B).
const parameterAus = (href) => {
  const p = {};
  const q = String(href || "").split("?").slice(1).join("?").split("#")[0];
  for (const teil of q.split("&")) {
    if (!teil) continue;
    const i = teil.indexOf("=");
    const k = i < 0 ? teil : teil.slice(0, i), v = i < 0 ? "" : teil.slice(i + 1);
    let kk = k, vv = v;
    try { kk = decodeURIComponent(k); } catch (e) { /* roh lassen */ }
    try { vv = decodeURIComponent(v); } catch (e) { /* roh lassen */ }
    p[kk] = vv;
  }
  return p;
};

module.exports = class StudiumAutopilot extends Plugin {
  async onload() {
    this.skripte = {};       // Name → module.exports jedes Skripts (ctx.user)
    this.quellen = {};       // Name → Quelltext (für Hot-Reload: nur bei Änderung neu laden)
    this.erweiterungen = {}; // Name → Rückgabe der Fabrik (registrieren, start, aktionen …)
    this.aktionen = {};      // Aktionsname → { titel, ausfuehren, ordner, editor, skript }
    this.laufend = new Set(); // gerade laufende Aktionen (Doppelklick-Schutz)
    this.testAntworten = [];  // Nur für Tests: vorbereitete Antworten für Eingabe/Auswahl (siehe docs/architektur.md)
    this.testProtokoll = [];
    this.stillBis = 0;        // bis zu diesem Zeitpunkt (ms) keine Hinweise beim Hot-Reload (setzt update.js während des Updates)
    this.testDatum = null;    // Nur für Tests: "YYYY-MM-DD" ersetzt das heutige Datum in ctx.date (Uhrzeit bleibt)
    // Aufräumen je Skript (Helfer in ctx, siehe skriptKontext)
    this.kontexte = {};      // Skript → eigener Kontext (Proxy auf ctx mit den Helfern)
    this.aufraeumer = {};    // Skript → [Funktion], beim Abmelden rückwärts aufgerufen
    this.timer = {};         // Skript → Set offener Timer/Intervalle
    this.zustaende = {};     // "Skript/Schlüssel" → Wert, überlebt den Hot-Reload (ctx.bleibend)
    this.bloecke = {};       // Codeblock-Sprache → { fn, skript, instanzen }: EIN Prozessor je Sprache und Plugin-Instanz
    this.nachbearbeiter = []; // [{ skript, fn }] für den einen gemeinsamen Post-Processor
    this.editorErw = [];     // CodeMirror-Erweiterungen; das Array ist einmal angemeldet, Inhalt wird getauscht
    this.befehle = {};       // Befehls-ID → Skript (zum Entfernen beim Hot-Reload)
    this.ctx = this.kontextBauen();
    // Klassen am body, die ein Skript für dieses Gerät gemerkt hat (Gerätespeicher „eba-start-klassen“, z. B. das Design aus
    // darstellung.js): gleich jetzt setzen, nicht erst nach dem Laden der Skripte, sonst springt das Aussehen beim Start um
    const start = this.app.loadLocalStorage("eba-start-klassen");
    this.startKlassen = (Array.isArray(start) ? start : []).filter((k) => /^eba-[a-z0-9-]+$/.test(String(k)));
    for (const k of this.startKlassen) document.body.classList.add(k);

    // Knöpfe: Klick im Capture-Modus abfangen, bevor Obsidian den Link selbst behandelt (Lese-/Bearbeitungsansicht,
    // Bases-html(), Callouts, Hover-Vorschau, auf allen Geräten). Protokoll-Handler als Rückfall (Link von außen).
    this.klickAbfangen(document);
    this.registerEvent(this.app.workspace.on("window-open", (ww) => { try { this.klickAbfangen(ww.doc); } catch (e) { console.error(e); } }));
    // Gerenderte Knöpfe merken sich ihre Notiz (auch in Einbettungen und Hover-Vorschauen, wo kein Tab dazugehört)
    this.registerMarkdownPostProcessor((el, c) => {
      for (const a of el.querySelectorAll('a[href^="' + LINK + '"]')) if (c && c.sourcePath) a.setAttribute("data-sa-quelle", c.sourcePath);
    });
    // Ein gemeinsamer Post-Processor für alle Skripte (ctx.postprozessor); ruft immer die aktuell angemeldeten Fassungen
    this.registerMarkdownPostProcessor((el, c) => {
      for (const n of this.nachbearbeiter.slice()) { try { n.fn(el, c); } catch (e) { console.error("Studium Autopilot: Post-Processor " + n.skript, e); } }
    });
    // Ein gemeinsames Array für Editor-Erweiterungen (ctx.editor); Obsidian liest es bei updateOptions() neu
    this.registerEditorExtension(this.editorErw);
    this.registerObsidianProtocolHandler(PROTOKOLL, (p) => {
      this.aktionAusfuehren(p.aktion, p, { quelle: this.app.workspace.getActiveFile() });
    });

    this.addCommand({ id: "neue-notiz", name: "Neue Notiz aus Vorlage …", callback: () => this.neueNotizWaehlen() });
    this.addCommand({ id: "erweiterungen-neu-laden", name: "Erweiterungen neu laden", callback: () => this.skripteLaden(false) });

    this.app.workspace.onLayoutReady(() => this.starten());
  }

  onunload() {
    // Ab jetzt nichts mehr anmelden: ein noch laufendes await (Hot-Reload, Start) darf nach dem Entladen keinen Codeblock-
    // Prozessor o. Ä. registrieren – der bliebe sonst für immer angemeldet, und die nächste Instanz (Plugin neu laden,
    // Update) bekäme „already registered“.
    this.entladen = true;
    // Je Skript: abmelden() der Erweiterung, dann alles, was über die Helfer in ctx angemeldet wurde.
    // Codeblock-Prozessoren, Post-Processor, Editor-Array und Befehle meldet Obsidian beim Entladen des Plugins selbst ab.
    for (const name of Object.keys(this.erweiterungen).concat(Object.keys(this.aufraeumer))) this.skriptAbmelden(name);
    for (const k of this.startKlassen || []) document.body.classList.remove(k);
    this.zustaende = {};
  }

  // ---------- Kontextobjekt (ersetzt Templaters „tp“) ----------
  // Datum für ctx.date: heute, im Test (this.testDatum = "YYYY-MM-DD") dieser Tag mit der aktuellen Uhrzeit
  jetzt() {
    const d = new Date();
    const m = this.testDatum && String(this.testDatum).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], d.getHours(), d.getMinutes(), d.getSeconds()) : d;
  }

  // Kontext je Skript: alles aus ctx plus Helfer, die sich merken, was dieses Skript angemeldet hat. Zuweisungen
  // (z. B. ctx.modell = …) landen im gemeinsamen ctx; Ableitungen per Object.create bekommen eigene Felder.
  skriptKontext(name) {
    if (this.kontexte[name]) return this.kontexte[name];
    const plugin = this;
    const merken = (fn) => { (plugin.aufraeumer[name] = plugin.aufraeumer[name] || []).push(fn); return fn; };
    const timer = (plugin.timer[name] = plugin.timer[name] || new Set());
    const eigen = {
      skript: name,
      // beliebige Aufräumfunktion (z. B. die Rückgabe von ctx.modell.beiAenderung)
      aufraeumen: (fn) => { if (typeof fn === "function") merken(fn); return fn; },
      // Ereignis von app.workspace, app.vault oder app.metadataCache (wie registerEvent)
      an: (quelle, ereignis, fn) => { const ref = quelle.on(ereignis, fn); merken(() => quelle.offref(ref)); return ref; },
      // DOM-Ereignis auf einem langlebigen Element (document, window, Popout-Dokument)
      dom: (el, typ, fn, opt) => { el.addEventListener(typ, fn, opt); merken(() => el.removeEventListener(typ, fn, opt)); return fn; },
      intervall: (fn, ms) => { const id = setInterval(fn, ms); timer.add(id); return id; },
      zeit: (fn, ms) => { const id = setTimeout(() => { timer.delete(id); fn(); }, ms); timer.add(id); return id; },
      stopp: (id) => { if (id == null) return; clearTimeout(id); clearInterval(id); timer.delete(id); },
      // entprellte Funktion: ruft fn erst, wenn ms lang kein weiterer Aufruf kam
      entprellen: (fn, ms) => { let id = null; return function () { const a = arguments; eigen.stopp(id); id = eigen.zeit(() => { id = null; fn.apply(null, a); }, ms); }; },
      codeblock: (sprache, fn) => plugin.codeblockAnmelden(name, sprache, fn, merken),
      postprozessor: (fn) => {
        const e = { skript: name, fn };
        plugin.nachbearbeiter.push(e);
        merken(() => { const i = plugin.nachbearbeiter.indexOf(e); if (i >= 0) plugin.nachbearbeiter.splice(i, 1); });
      },
      editor: (ext) => {
        plugin.editorErw.push(ext);
        plugin.editorAktualisieren();
        merken(() => { const i = plugin.editorErw.indexOf(ext); if (i >= 0) plugin.editorErw.splice(i, 1); plugin.editorAktualisieren(); });
      },
      // Wert, der den Hot-Reload überlebt (z. B. gewählter Monat), beim Entladen des Plugins vergessen
      bleibend: (schluessel, anfang) => {
        const k = name + "/" + schluessel;
        if (!Object.prototype.hasOwnProperty.call(plugin.zustaende, k)) plugin.zustaende[k] = typeof anfang === "function" ? anfang() : anfang;
        return plugin.zustaende[k];
      },
    };
    const hat = (k) => Object.prototype.hasOwnProperty.call(eigen, k);
    const p = new Proxy(this.ctx, {
      get: (t, k, r) => (hat(k) ? eigen[k] : Reflect.get(t, k, r)),
      set: (t, k, v, r) => {
        if (r !== p) return Reflect.defineProperty(r, k, { value: v, writable: true, enumerable: true, configurable: true });
        if (hat(k)) return false;
        t[k] = v;
        return true;
      },
      has: (t, k) => hat(k) || k in t,
    });
    this.kontexte[name] = p;
    return p;
  }

  // Alles abmelden, was ein Skript angemeldet hat: abmelden() der Erweiterung, Helfer (rückwärts), Timer, Aktionen, Befehle
  skriptAbmelden(name) {
    const m = this.erweiterungen[name];
    if (m && typeof m.abmelden === "function") { try { m.abmelden(); } catch (e) { console.error("Studium Autopilot: abmelden " + name, e); } }
    const liste = this.aufraeumer[name] || [];
    delete this.aufraeumer[name];
    for (let i = liste.length - 1; i >= 0; i--) { try { liste[i](); } catch (e) { console.error("Studium Autopilot: aufräumen " + name, e); } }
    const t = this.timer[name];
    if (t) { for (const id of t) { clearTimeout(id); clearInterval(id); } t.clear(); }
    this.aktionenEntfernen(name);
    delete this.erweiterungen[name];
  }

  editorAktualisieren() { try { this.app.workspace.updateOptions(); } catch (e) { /* ältere Fassung */ } }

  // ---------- Codeblöcke: ein Prozessor je Sprache, ruft immer die aktuelle Fassung ----------
  codeblockAnmelden(skript, sprache, fn, merken) {
    if (this.entladen) return { sprache, instanzen: () => [], neu: () => {} };
    let b = this.bloecke[sprache];
    if (!b) {
      b = this.bloecke[sprache] = { sprache, fn: null, skript: null, instanzen: new Set() };
      this.registerMarkdownCodeBlockProcessor(sprache, (quelle, el, c) => this.codeblockNeu(b, quelle, el, c));
    }
    if (b.fn && b.skript !== skript) console.warn(`Studium Autopilot: Codeblock ${sprache} von ${b.skript} wird durch ${skript} ersetzt`);
    b.fn = fn; b.skript = skript;
    merken(() => { if (b.fn === fn) { b.fn = null; b.skript = null; } });
    const plugin = this;
    return {
      sprache,
      // angezeigte Blöcke dieser Sprache: [{ quelle, el, ctx, sprache, … }]; Skripte dürfen eigene Felder anhängen
      instanzen: () => plugin.codeblockInstanzen(b),
      // alle (oder die mit filter(inst) === true) mit der aktuellen Fassung neu zeichnen
      neu: (filter) => { for (const i of plugin.codeblockInstanzen(b)) if (!filter || filter(i)) plugin.codeblockAufrufen(b, i); },
    };
  }

  codeblockNeu(b, quelle, el, c) {
    const inst = { quelle, el, ctx: c, sprache: b.sprache };
    b.instanzen.add(inst);
    // Vergessen, sobald Obsidian den Abschnitt entlädt (neu zeichnen, Tab zu)
    try { if (c && typeof c.addChild === "function" && obsidian.MarkdownRenderChild) { const k = new obsidian.MarkdownRenderChild(el); k.register(() => b.instanzen.delete(inst)); c.addChild(k); } } catch (e) { /* dann über isConnected */ }
    if (b.instanzen.size > 100) for (const i of Array.from(b.instanzen)) if (i !== inst && !i.el.isConnected) b.instanzen.delete(i);
    return this.codeblockAufrufen(b, inst);
  }

  codeblockInstanzen(b) { return Array.from(b.instanzen).filter((i) => i.el.isConnected); }

  codeblockAufrufen(b, inst) {
    const el = inst.el;
    const fehler = (e) => {
      console.error("Studium Autopilot: Codeblock " + b.sprache, e);
      try { el.empty(); el.createDiv({ cls: "sa-block-fehler", text: `${b.sprache}: Fehler – ${(e && e.message) || e}` }); } catch (x) { /* egal */ }
    };
    if (!b.fn) { // Skript fehlt oder ist nicht geladen: Text des Blocks zeigen
      try { el.empty(); el.createDiv({ cls: "sa-block-ersatz", text: String(inst.quelle || "").trim() || b.sprache }); } catch (x) { /* egal */ }
      return undefined;
    }
    try {
      const r = b.fn(inst.quelle, el, inst.ctx, inst);
      if (r && typeof r.then === "function") return r.catch(fehler);
    } catch (e) { fehler(e); }
    return undefined;
  }

  kontextBauen() {
    const plugin = this;
    return {
      app: this.app,
      obsidian,
      plugin,
      user: this.skripte,
      cm: CM, // { view: @codemirror/view, state: @codemirror/state } für registerEditorExtension
      system: {
        prompt: (frage, vorschlag) => plugin.eingabe(frage, vorschlag),
        suggester: (texte, werte, _fehlerBeiAbbruch, platzhalter) => plugin.auswahl(texte, werte, platzhalter),
      },
      date: {
        now: (format, tage) => obsidian.moment(plugin.jetzt()).add(Number(tage) || 0, "days").format(format || "YYYY-MM-DD"),
        jetzt: () => plugin.jetzt(), // Date-Objekt (statt new Date(), damit Tests ein Datum vorgeben können)
      },
      // Je Aktionsaufruf überschrieben (Object.create): Parameter des Knopfs, zu befüllende Datei, Notiz mit dem Knopf
      parameter: {},
      datei: null,
      quelle: null,
      CURSOR,
      aktion: (name, parameter, extra) => plugin.aktionAusfuehren(name, parameter, extra),
      link: (aktion, parameter) => plugin.linkBauen(aktion, parameter),
      oeffnen: (datei, optionen) => plugin.notizOeffnen(datei, optionen),
      neuZeichnen: (pfade) => plugin.neuZeichnen(pfade),
    };
  }

  // ---------- Eingabe/Auswahl ----------
  eingabe(frage, vorschlag) {
    if (this.testAntworten.length) {
      const a = this.testAntworten.shift();
      this.testProtokoll.push({ frage: String(frage), antwort: a });
      return Promise.resolve(a == null ? null : String(a));
    }
    return new Promise((fertig) => new Eingabe(this.app, frage, vorschlag, fertig).open());
  }

  auswahl(texte, werte, platzhalter) {
    texte = typeof texte === "function" ? werte.map(texte) : texte;
    if (this.testAntworten.length) {
      const a = this.testAntworten.shift();
      this.testProtokoll.push({ frage: String(platzhalter || ""), antwort: a });
      if (a == null) return Promise.resolve(null);
      if (typeof a === "object" && "index" in a) return Promise.resolve(werte[a.index]);
      let i = werte.findIndex((w) => w === a);
      if (i < 0) i = texte.findIndex((t) => String(t).includes(String(a)));
      return Promise.resolve(i < 0 ? null : werte[i]);
    }
    return new Promise((fertig) => new Auswahl(this.app, texte, werte, platzhalter, fertig).open());
  }

  // ---------- Start ----------
  async starten() {
    await this.skripteLaden(true);
    if (this.entladen) return;
    // Hot-Reload: geänderte/neue Skripte nach kurzer Pause neu laden (Sync schreibt evtl. in mehreren Schritten)
    const warten = {};
    const geaendert = (f) => {
      if (!this.istSkript(f)) return;
      clearTimeout(warten[f.path]);
      warten[f.path] = setTimeout(() => { delete warten[f.path]; this.skriptNeuLaden(f); }, 1500);
    };
    this.register(() => { for (const k of Object.keys(warten)) clearTimeout(warten[k]); });
    this.registerEvent(this.app.vault.on("modify", geaendert));
    this.registerEvent(this.app.vault.on("create", geaendert));
    this.registerEvent(this.app.vault.on("delete", (f) => { if (this.istSkript(f)) this.skriptEntfernen(f.basename); }));
    this.registerEvent(this.app.vault.on("rename", (f, alt) => {
      const a = String(alt || "");
      if (a.startsWith(SKRIPTE) && /\.js$/.test(a) && a.slice(SKRIPTE.length).indexOf("/") < 0) this.skriptEntfernen(a.slice(SKRIPTE.length, -3));
      geaendert(f);
    }));
    // Ordner-Automatik: erst nach dem Start anmelden (beim Einlesen des Vaults meldet Obsidian jede Datei als „create“)
    this.registerEvent(this.app.vault.on("create", (f) => this.neueDatei(f)));
  }

  istSkript(f) {
    return f && f.path && f.path.startsWith(SKRIPTE) && f.extension === "js" && f.path.slice(SKRIPTE.length).indexOf("/") < 0;
  }

  // Erweiterung = liefert registrieren oder aktionen (Funktion, Kurzschreibweise im Rückgabeobjekt oder aktionen: …)
  istErweiterung(code) { return /\bregistrieren\s*(\(|=|:|,|\})|\baktionen\s*:/.test(code); }

  auswerten(code, pfad) {
    const modul = { exports: {} };
    // require für Skripte: Obsidians Plugin-require (obsidian, @codemirror/*), am PC ersatzweise window.require
    const req = (n) => { try { return require(n); } catch (e) { return window.require ? window.require(n) : undefined; } };
    const fn = window.eval("(function anonymous(require, module, exports){" + code + "\n})\n//# sourceURL=" + encodeURI(pfad));
    fn(req, modul, modul.exports);
    return modul.exports;
  }

  // Alle Skripte laden, dann die Erweiterungen starten (alphabetisch; Abhängigkeiten laufen über ctx.user, das zu
  // diesem Zeitpunkt schon vollständig ist).
  async skripteLaden(start) {
    const fehler = [];
    // „Erweiterungen neu laden“: erst alles abmelden, was die laufenden Fassungen angemeldet haben
    if (!start) for (const name of Object.keys(this.erweiterungen)) this.skriptAbmelden(name);
    const dateien = this.app.vault.getFiles().filter((f) => this.istSkript(f)).sort((a, b) => a.basename.localeCompare(b.basename));
    for (const f of dateien) {
      try {
        const code = await this.app.vault.read(f);
        if (this.entladen) return fehler;
        this.skripte[f.basename] = this.auswerten(code, f.path);
        this.quellen[f.basename] = code;
      } catch (e) { console.error("Studium Autopilot: Skript " + f.path, e); fehler.push(`${f.basename} (${(e && e.message) || e})`); }
    }
    for (const f of dateien) {
      if (this.entladen) return fehler;
      if (!this.quellen[f.basename] || !this.istErweiterung(this.quellen[f.basename])) continue;
      try { await this.erweiterungStarten(f.basename, start); } catch (e) {
        console.error("Studium Autopilot: Erweiterung " + f.basename, e); fehler.push(`${f.basename} (${(e && e.message) || e})`);
      }
    }
    if (fehler.length) new Notice("Studium Autopilot – nicht geladen: " + fehler.join(", "), 10000);
    this.neuZeichnen();
    return fehler;
  }

  async erweiterungStarten(name, start) {
    const fabrik = this.skripte[name];
    if (typeof fabrik !== "function") throw new Error("kein module.exports = function (ctx) {…}");
    const m = await fabrik(this.skriptKontext(name));
    if (this.entladen) return;
    if (!m) throw new Error("Fabrik liefert nichts");
    this.erweiterungen[name] = m;
    if (m.aktionen) this.aktionenUebernehmen(name, m.aktionen);
    if (typeof m.registrieren === "function") await m.registrieren(this);
    if (start && typeof m.start === "function") {
      // start() läuft nur beim App-Start (nicht beim Hot-Reload); Fehler darin melden, aber nicht weiterreichen
      Promise.resolve().then(() => m.start()).catch((e) => { console.error("Studium Autopilot: start " + name, e); new Notice(`Studium Autopilot – ${name}: ${(e && e.message) || e}`, 8000); });
    }
  }

  async skriptNeuLaden(f) {
    try {
      const code = await this.app.vault.read(f);
      if (this.entladen || code === this.quellen[f.basename]) return;
      const neu = this.auswerten(code, f.path); // Syntaxfehler: alte Fassung läuft weiter
      // Alte Fassung vollständig abmelden (abmelden(), Helfer, Timer, Aktionen, Befehle), dann die neue starten
      this.skriptAbmelden(f.basename);
      this.skripte[f.basename] = neu;
      this.quellen[f.basename] = code;
      if (this.istErweiterung(code)) await this.erweiterungStarten(f.basename, false);
      this.neuZeichnen();
      if (!(this.stillBis > Date.now())) new Notice("Aktualisiert: " + f.basename, 2000); // still während eines Updates (update.js)
    } catch (e) {
      console.error("Studium Autopilot: neu laden " + f.path, e);
      new Notice(`Studium Autopilot – ${f.basename} nicht geladen: ${(e && e.message) || e}`, 8000);
    }
  }

  // Skriptdatei gelöscht oder umbenannt: abmelden und vergessen
  skriptEntfernen(name) {
    this.skriptAbmelden(name);
    delete this.skripte[name]; delete this.quellen[name];
    this.neuZeichnen();
  }

  // Offene Notizen neu zeichnen (Codeblöcke der Erweiterungen erscheinen sofort)
  neuZeichnen(pfade) {
    for (const l of this.app.workspace.getLeavesOfType("markdown")) {
      const p = l.view && l.view.file && l.view.file.path;
      if (pfade && pfade.indexOf(p) < 0) continue;
      try {
        if (l.view.getMode && l.view.getMode() === "source") { if (l.rebuildView) l.rebuildView(); }
        else if (l.view.previewMode && l.view.previewMode.rerender) l.view.previewMode.rerender(true);
      } catch (e) { /* nächste Ansicht */ }
    }
  }

  // ---------- Aktionen ----------
  // Befehle: je Aktion mit titel einer (ID „aktion-<name>“, gleiche ID ersetzt, also keine Doppelten). checkCallback blendet
  // den Befehl aus, falls die Aktion inzwischen fehlt; beim Abmelden eines Skripts werden seine Befehle entfernt.
  aktionenUebernehmen(skript, aktionen) {
    for (const name of Object.keys(aktionen)) {
      let def = aktionen[name];
      if (typeof def === "function") def = { ausfuehren: def };
      if (!def || typeof def.ausfuehren !== "function") continue;
      const alt = this.aktionen[name];
      if (alt && alt.skript !== skript) console.warn(`Studium Autopilot: Aktion „${name}“ aus ${alt.skript} wird durch ${skript} ersetzt`);
      this.aktionen[name] = Object.assign({}, def, { skript });
      if (!def.titel) continue;
      const id = "aktion-" + name;
      const da = () => !!(this.aktionen[name] && this.aktionen[name].titel);
      const pruefen = (checking) => { if (!da()) return false; if (!checking) this.aktionAusfuehren(name, {}); return true; };
      if (def.editor) this.addCommand({ id, name: def.titel, editorCheckCallback: (checking) => pruefen(checking) });
      else this.addCommand({ id, name: def.titel, checkCallback: (checking) => pruefen(checking) });
      this.befehle[id] = skript;
    }
  }

  aktionenEntfernen(skript) {
    for (const k of Object.keys(this.aktionen)) if (this.aktionen[k].skript === skript) delete this.aktionen[k];
    for (const id of Object.keys(this.befehle)) {
      if (this.befehle[id] !== skript) continue;
      delete this.befehle[id];
      try {
        if (typeof this.removeCommand === "function") this.removeCommand(id); // API ab 1.7.2
        else if (this.app.commands && this.app.commands.removeCommand) this.app.commands.removeCommand(this.manifest.id + ":" + id);
      } catch (e) { /* checkCallback blendet ihn aus */ }
    }
  }

  // Führt eine Aktion aus. parameter: Werte aus dem Knopf-Link (Strings) oder vom Aufrufer; extra.datei: leere Notiz, die
  // befüllt werden soll (Ordner-Automatik); extra.quelle: Notiz, in der der Knopf steht.
  async aktionAusfuehren(name, parameter, extra) {
    const def = this.aktionen[name];
    if (!def) {
      new Notice(name ? `Der Knopf „${name}“ geht gerade nicht. Bitte kurz warten oder Obsidian neu starten.` : "Studium Autopilot: Knopf ohne Aktion.", 6000);
      return undefined;
    }
    const schluessel = name + JSON.stringify(parameter || {});
    if (this.laufend.has(schluessel)) return undefined; // Doppelklick
    this.laufend.add(schluessel);
    const c = Object.create(this.kontexte[def.skript] || this.ctx);
    c.parameter = Object.assign({}, parameter || {});
    c.datei = (extra && extra.datei) || null;
    c.quelle = (extra && extra.quelle) || this.app.workspace.getActiveFile();
    try {
      return await def.ausfuehren(c);
    } catch (e) {
      console.error("Studium Autopilot: Aktion " + name, e);
      new Notice(`${def.titel || name}: ${(e && e.message) || e}`, 10000);
      return undefined;
    } finally {
      this.laufend.delete(schluessel);
    }
  }

  linkBauen(aktion, parameter) {
    let s = LINK + "?aktion=" + encodeURIComponent(aktion);
    for (const k of Object.keys(parameter || {})) {
      const v = parameter[k];
      if (v === undefined || v === null || v === false || v === "") continue;
      s += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(v === true ? "1" : String(v));
    }
    return s;
  }

  // Klicks auf Knöpfe abfangen: Capture-Modus auf document, damit weder Obsidian noch CodeMirror noch Bases den Link
  // zuerst bekommen. Kein Umweg über das Betriebssystem, kein Tab, keine Hilfsnotiz.
  klickAbfangen(doc) {
    if (!doc || doc.__studiumAutopilot) return;
    doc.__studiumAutopilot = true;
    const knopf = (e) => {
      const t = e.target;
      return t && typeof t.closest === "function" ? t.closest('a[href^="' + LINK + '"]') : null;
    };
    const sperren = (e) => { if (knopf(e)) { e.preventDefault(); e.stopPropagation(); } };
    for (const typ of ["mousedown", "mouseup", "pointerdown", "auxclick", "contextmenu"]) this.registerDomEvent(doc, typ, sperren, { capture: true });
    this.registerDomEvent(doc, "click", (e) => {
      const a = knopf(e);
      if (!a) return;
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const p = parameterAus(a.getAttribute("href"));
      this.aktionAusfuehren(p.aktion, p, { quelle: this.dateiVon(a) });
    }, { capture: true });
    this.register(() => { try { delete doc.__studiumAutopilot; } catch (e) { doc.__studiumAutopilot = false; } });
  }

  // Notiz, zu der ein Knopf gehört: 1. vom Post-Processor gemerkte Quelle (Leseansicht, Einbettung, Hover-Vorschau),
  // 2. Notiz des Tabs, in dem er steht (Live Preview, Bases-html()), 3. die aktive Notiz.
  dateiVon(el) {
    const q = el.closest && el.closest("[data-sa-quelle]");
    const gemerkt = q && this.app.vault.getAbstractFileByPath(q.getAttribute("data-sa-quelle"));
    if (gemerkt instanceof TFile) return gemerkt;
    let datei = null;
    this.app.workspace.iterateAllLeaves((l) => {
      if (!datei && l.view && l.view.file && l.view.containerEl && l.view.containerEl.contains(el)) datei = l.view.file;
    });
    return datei || this.app.workspace.getActiveFile();
  }

  // Befehl „Neue Notiz aus Vorlage …“ (Strg/Cmd+Umschalt+N): alle Aktionen, die eine Notiz anlegen (mit „ordner“)
  async neueNotizWaehlen() {
    const liste = Object.keys(this.aktionen).filter((k) => this.aktionen[k].ordner && this.aktionen[k].titel);
    if (!liste.length) { new Notice("Studium Autopilot: keine Notiz-Aktionen geladen.", 5000); return; }
    const wahl = await this.auswahl(liste.map((k) => this.aktionen[k].titel), liste, "Welche Notiz?");
    if (wahl) await this.aktionAusfuehren(wahl, {});
  }

  // ---------- Ordner-Automatik ----------
  aktionFuerPfad(pfad) {
    let beste = null, laenge = -1;
    for (const k of Object.keys(this.aktionen)) {
      for (const o of [].concat(this.aktionen[k].ordner || [])) {
        if ((pfad.startsWith(o + "/")) && o.length > laenge) { beste = k; laenge = o.length; }
      }
    }
    return beste;
  }

  // Neue LEERE Notiz in einem Aktionsordner, die auf DIESEM Gerät angelegt wurde und gerade aktiv ist → Aktion befüllt sie.
  // Per Sync ankommende Dateien sind nicht die aktive Datei und werden darum nie befüllt.
  neueDatei(f) {
    if (!(f instanceof TFile) || f.extension !== "md") return;
    const aktion = this.aktionFuerPfad(f.path);
    if (!aktion) return;
    let versuche = 0;
    const pruefen = async () => {
      if (this.app.vault.getAbstractFileByPath(f.path) !== f) return;
      const aktiv = this.app.workspace.getActiveFile();
      if (!aktiv || aktiv.path !== f.path) { if (++versuche < 4) setTimeout(pruefen, 400); return; }
      try { if ((await this.app.vault.read(f)).trim()) return; } catch (e) { return; }
      this.aktionAusfuehren(aktion, {}, { datei: f, quelle: f });
    };
    setTimeout(pruefen, 300);
  }

  // Notiz öffnen (Bearbeitungsansicht, Live Preview) und Cursor setzen. Schon offen: in diesem Tab bleiben.
  async notizOeffnen(datei, optionen) {
    const o = optionen || {};
    let blatt = this.app.workspace.getLeavesOfType("markdown").find((l) => l.view && l.view.file === datei);
    if (!blatt) blatt = this.app.workspace.getLeaf(false);
    await blatt.openFile(datei, { active: true, state: o.modus === "preview" ? { mode: "preview" } : { mode: "source", source: false } });
    this.app.workspace.setActiveLeaf(blatt, { focus: true });
    if (o.cursor) {
      const setzen = () => { const ed = blatt.view && blatt.view.editor; if (!ed) return false; ed.setCursor(o.cursor); ed.focus(); return true; };
      if (!setzen()) setTimeout(setzen, 200);
    }
    return blatt;
  }
};
