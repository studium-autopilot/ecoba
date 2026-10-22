// Start des Vaults (früher Templater-Startskript System/Vorlagen/Start.md). Geladen vom Plugin „Studium Autopilot“ auf
// jedem Gerät, ohne Schalter. Schreibt keine Notizen. Punkte:
//  1. Dashboard als Startseite in der Leseansicht zeigen (nur beim App-Start: start()); seit 0.4.6 nicht mehr angeheftet.
//  2. Übersichtsseiten bleiben in der Leseansicht (Dashboard, Seiten in Studium/, Einstellungen, Daten; seit 17.10.2026), deine
//     Notizen öffnen von dort in der Bearbeitungsansicht (seit 0.4.6, wie ctx.oeffnen). Begleitnotizen und Volltexte öffnen in der
//     Leseansicht, ohne Sperre (zuerstLesen, seit 19.10.2026).
//  3. Seitenklasse aus dem Feld `typ` an die Ansicht hängen (Gestaltung auch für Notizen ohne `cssclasses`), dazu eba-notiz an jeder
//     Notiz des Plugins.
//  4. Optional, alle Geräte: Kapitel der Folien-Notizen beim ersten Öffnen zuklappen, ein Tipp auf die Kapitelzeile klappt auf.
//  5. Experimentell: Höhenmessung der Leseansicht korrigieren (Leerraum am Seitenende).
//  6. Klasse eba-plugin-an am body: blendet auf dem Dashboard den Hinweis „Studium Autopilot ist noch aus“ aus (eba-core.css).
//     Der Kern setzt sie schon beim Laden (main.js); hier steht sie auch, weil ein älterer Kern nach einem Update über den Sync
//     bis „Neu laden“ weiterläuft und nur die Skripte neu lädt.
// (Erweiterungen laden und Hot-Reload macht das Plugin selbst; die Agenda ist jetzt der Codeblock ```eba-agenda```,
// System/Skripte/termine.js, und schreibt keine Datei mehr.)
// registrieren() läuft beim Start und nach jeder Änderung dieser Datei (Hot-Reload). Ereignisse und Timer laufen über die
// Helfer in ctx; vor dem Neuladen meldet das Plugin sie ab und ruft abmelden() (nimmt die Messkorrektur zurück).
// Kein Node-API, keine Lookbehind-Regex (iOS).
module.exports = function (ctx) {
  const app = window.app;

  // Schalter für die optionalen Teile (false = aus).
  const FOLIEN_VORFALTEN = true; // Punkt 4
  const MESSKORREKTUR = true;    // Punkt 5

  const DASHBOARD = "Dashboard.md";
  const an = (quelle, name, fn) => ctx.an(quelle, name, fn);

  // 1. Dashboard als Startseite. Bis 0.4.5 ein angehefteter erster Tab (so schon im Startskript des Templater-Tresors, damit das
  //    Dashboard bei jedem Start da ist). Ein angehefteter Tab öffnet aber jeden Link in einem neuen Tab: Tabs stapelten sich, und
  //    Zurück führte nicht zum Dashboard (Konsistenz-Audit E6). Darum seit 0.4.6: Ist das Dashboard nicht schon offen, zeigt es der
  //    zuletzt benutzte Tab (die Notiz darin bleibt über Zurück erreichbar), sonst ein neuer; Links öffnen im selben Tab, und die
  //    Übersicht (seitenleiste.js) führt mit „Dashboard“ jederzeit zurück. Die Anheftung früherer Fassungen nimmt es einmal je Gerät zurück.
  const FREI = "eba-dashboard-frei"; // Gerätespeicher: Anheftung schon zurückgenommen (danach bleibt eine eigene Anheftung)
  const dashboardOeffnen = async () => {
    const ziel = app.vault.getAbstractFileByPath(DASHBOARD);
    if (!ziel) return;
    // Auch Tabs erkennen, die beim Start noch nicht geladen sind („deferred“, dann fehlt view.file).
    const istDashboard = (l) => ((l.view && l.view.file && l.view.file.path) || (l.getViewState().state || {}).file) === DASHBOARD;
    let blatt = app.workspace.getLeavesOfType("markdown").find(istDashboard);
    if (blatt && blatt.loadIfDeferred) await blatt.loadIfDeferred();
    if (!blatt) {
      const zuletzt = app.workspace.getMostRecentLeaf ? app.workspace.getMostRecentLeaf(app.workspace.rootSplit) : null;
      const art = zuletzt && zuletzt.view && zuletzt.view.getViewType ? zuletzt.view.getViewType() : "";
      blatt = zuletzt && !zuletzt.getViewState().pinned && (art === "markdown" || art === "empty") ? zuletzt : app.workspace.getLeaf("tab");
      await blatt.openFile(ziel, { state: { mode: "preview" } });
    }
    if (blatt.view && blatt.view.getMode && blatt.view.getMode() === "source") {
      const vs = blatt.getViewState(); vs.state = Object.assign({}, vs.state, { mode: "preview" }); await blatt.setViewState(vs);
    }
    if (!app.loadLocalStorage(FREI)) { if (blatt.getViewState().pinned) blatt.setPinned(false); app.saveLocalStorage(FREI, true); }
    const tabs = blatt.parent;
    if (tabs && tabs.children && tabs.children.indexOf(blatt) > 0) {
      tabs.children.splice(tabs.children.indexOf(blatt), 1);
      tabs.children.unshift(blatt);
      if (tabs.recomputeChildrenDimensions) tabs.recomputeChildrenDimensions();
      if (app.workspace.requestSaveLayout) app.workspace.requestSaveLayout();
    }
    app.workspace.setActiveLeaf(blatt, { focus: true });
    // Einmal neu zeichnen, wenn alle CSS-Regeln geladen sind: Bases-Listen messen ihre Höhe sonst mit dem Zwischenstand.
    setTimeout(() => { try { blatt.view.previewMode.rerender(true); } catch (e) { /* Ansicht weg */ } }, 2500);
  };

  // 2. Übersichtsseiten bleiben in der Leseansicht: Sie zeigen nur, was Skripte und Tabellen zeichnen; getippt wird dort nichts.
  //    Gesperrt sind Notizen mit `typ` dashboard, übersicht, einstellungen oder daten (auch Termine & Anmeldungen: die
  //    Anmeldungen füllen sich seit 17.10.2026 selbst). Das Feld `ansicht` geht vor: `lesen` sperrt jede Notiz,
  //    `bearbeiten` gibt sie frei (in der Seitenleiste „Eigenschaften“ änderbar, auch wenn die Notiz gesperrt ist).
  //    Gesperrt: Der Knopf zum Bearbeiten im Kopf der Ansicht ist ausgeblendet; wer trotzdem umschaltet (Strg/⌘ E, Befehl),
  //    landet sofort wieder in der Leseansicht, mit Hinweis. Geht ein Tab von einer gesperrten Seite zu deiner Notiz (Link, Liste,
  //    Kachel), öffnet sie in der Bearbeitungsansicht: Übersichten lesen, eigene Notizen bearbeiten (wie ctx.oeffnen, seit 0.4.6;
  //    vorher nur, wenn der Tab vorher eine Notiz bearbeitet hatte).
  const GESPERRT = ["dashboard", "übersicht", "einstellungen", "daten"];
  const nurLesen = (f) => {
    if (!f || !/\.md$/.test(f.path)) return false;
    const c = app.metadataCache.getFileCache(f);
    const fm = (c && c.frontmatter) || {};
    const a = String(fm.ansicht == null ? "" : fm.ansicht).trim().toLowerCase();
    if (a === "lesen") return true;
    if (a === "bearbeiten") return false;
    return f.path === DASHBOARD || (GESPERRT.indexOf(String(fm.typ || "").trim().toLowerCase()) >= 0);
  };
  // Begleitnotizen (typ unterlage, auch Folien als Markdown) und Volltexte sind zum Lesen da: Sie öffnen in der Leseansicht (ctx.oeffnen,
  // auch von einer gesperrten Seite aus), sind aber nicht gesperrt; das Buch oben schaltet zum Bearbeiten. `ansicht: bearbeiten` geht
  // vor. Seit 19.10.2026; vorher öffneten sie in der Bearbeitungsansicht, wo ein Tipp auf den PDF-Kasten die Tastatur aufgehen ließ.
  const LESEN_ZUERST = ["unterlage", "volltext"];
  const zuerstLesen = (f) => {
    if (!f || !/\.md$/.test(f.path)) return false;
    const c = app.metadataCache.getFileCache(f);
    const fm = (c && c.frontmatter) || {};
    if (String(fm.ansicht == null ? "" : fm.ansicht).trim().toLowerCase() === "bearbeiten") return false;
    return LESEN_ZUERST.indexOf(String(fm.typ || "").trim().toLowerCase()) >= 0;
  };
  const modusSetzen = (l, mode) => { const vs = l.getViewState(); vs.state = Object.assign({}, vs.state, { mode }); return l.setViewState(vs); };
  const gelesen = new WeakMap();   // Ansicht → Pfad, der zuletzt gesperrt in der Leseansicht stand (Umschalten erkennen)
  const umgestellt = new WeakSet(); // Ansichten, die eine gesperrte Seite zeigen (danach: deine Notiz in der Bearbeitung)
  const knopf = (v, aus) => { if (v.modeButtonEl) v.modeButtonEl.style.display = aus ? "none" : ""; };
  const leseansicht = () => {
    for (const l of app.workspace.getLeavesOfType("markdown")) {
      const v = l.view, f = v && v.file;
      if (!f || !v.getMode) continue;
      const sperre = nurLesen(f);
      knopf(v, sperre);
      if (!sperre) {
        gelesen.delete(v);
        if (umgestellt.has(v)) { umgestellt.delete(v); if (v.getMode() === "preview" && !zuerstLesen(f)) modusSetzen(l, "source"); }
        continue;
      }
      umgestellt.add(v);
      if (v.getMode() !== "source") { gelesen.set(v, f.path); continue; }
      if (gelesen.get(v) === f.path) ctx.hinweis("Diese Seite bleibt in der Leseansicht. Bearbeiten kannst du deine Notizen.", { dauer: 3000 });
      modusSetzen(l, "preview");
    }
  };
  ctx.leseansicht = { nurLesen, zuerstLesen }; // ctx.oeffnen im Kern und Tests (tests/leseansicht.test.js)

  // Übergang nach einem Update, bis „Neu laden“ getippt ist: Ein Kern vor 0.4.6 im Speicher öffnet mit ctx.oeffnen nur Dateien,
  // die Skripte geben seit 0.4.6 auch Pfade und Linktexte („Pfad#Überschrift“) mit { neu, quelle, zeile, cursor, modus }. Bis zum
  // Neuladen öffnet sie dieser Ersatz nach denselben Regeln wie notizOeffnen im Kern (nur ohne „im Tab des letzten Tipps“).
  const kern = String((ctx.plugin && ctx.plugin.manifest && ctx.plugin.manifest.version) || "").split(/[.-]/).map(Number);
  if (kern.length >= 3 && kern[0] === 0 && (kern[1] < 4 || (kern[1] === 4 && kern[2] < 6))) {
    ctx.oeffnen = async (ziel, optionen) => {
      const o = optionen || {};
      const { TFile } = ctx.obsidian;
      let datei = ziel, anker = "";
      if (!(ziel instanceof TFile)) {
        const s = String(ziel == null ? "" : ziel).replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
        const i = s.indexOf("#");
        const pfad = i >= 0 ? s.slice(0, i) : s;
        anker = i >= 0 ? s.slice(i) : "";
        datei = app.vault.getAbstractFileByPath(pfad) || app.vault.getAbstractFileByPath(pfad + ".md")
          || app.metadataCache.getFirstLinkpathDest(pfad, o.quelle || "");
      }
      if (!(datei instanceof TFile)) return null;
      const ws = app.workspace;
      const blatt = (!o.neu && ws.getLeavesOfType("markdown").find((l) => l.view && l.view.file === datei)) || ws.getLeaf(o.neu ? "tab" : false);
      if (datei.extension !== "md") { await blatt.openFile(datei, { active: true }); return blatt; }
      const lesen = o.modus ? o.modus === "preview" : nurLesen(datei) || zuerstLesen(datei);
      const eState = o.zeile != null ? { line: Number(o.zeile) } : anker ? { subpath: anker } : undefined;
      await blatt.openFile(datei, { active: true, state: lesen ? { mode: "preview" } : { mode: "source", source: false }, eState });
      ws.setActiveLeaf(blatt, { focus: !!o.cursor });
      const ed = o.cursor && blatt.view && blatt.view.editor;
      if (ed) { ed.setCursor(o.cursor); ed.focus(); }
      return blatt;
    };
  }
  // Beim Entladen (Hot-Reload, Plugin aus): Knöpfe wieder zeigen
  const knoepfeZeigen = () => { for (const l of app.workspace.getLeavesOfType("markdown")) if (l.view) knopf(l.view, false); };

  // 3. Seitenklasse aus dem Feld `typ` (mehrere Klassen mit Leerzeichen). Schreibt keine Datei. Dazu eba-notiz an jeder Notiz des
  //    Plugins (NOTIZ): Ihre Eigenschaften stehen nur im Kopf (eba-core.css 25, „⋯“ in kopf.js). Klassen einer vorher im selben Tab
  //    gezeigten Notiz nimmt es wieder ab (seit 19.10.2026; vorher trug eine eigene Notiz danach z. B. eba-s-termin weiter), nie aber
  //    eine, die in den cssclasses der Notiz selbst steht (die setzt Obsidian).
  const TYP = { termin: "eba-s-termin", unterlage: "eba-s-begleitnotiz", lehrveranstaltung: "eba-s-notizen", vorlesung: "eba-s-notizen eba-s-vorlesung", "übungsblatt": "eba-s-notizen eba-s-uebungsblatt" };
  const NOTIZ = ["termin", "unterlage", "lehrveranstaltung", "vorlesung", "übungsblatt", "sq_kurs", "volltext"];
  const ALLE = ["eba-notiz"].concat(Object.keys(TYP).map((t) => TYP[t]).join(" ").split(" ")).filter((k, i, a) => a.indexOf(k) === i);
  const klassenVon = (fm) => {
    const eigen = (Array.isArray(fm.cssclasses) ? fm.cssclasses : String(fm.cssclasses || "").split(/[,\s]+/)).map(String);
    const soll = eigen.indexOf("eba-folien") >= 0 || !TYP[fm.typ] ? [] : TYP[fm.typ].split(" ");
    if (NOTIZ.indexOf(String(fm.typ || "")) >= 0) soll.push("eba-notiz");
    return { soll, eigen };
  };
  const klassen = () => {
    for (const l of app.workspace.getLeavesOfType("markdown")) {
      const f = l.view && l.view.file; if (!f) continue;
      const c = app.metadataCache.getFileCache(f);
      const { soll, eigen } = klassenVon((c && c.frontmatter) || {});
      for (const el of l.view.containerEl.querySelectorAll(".markdown-preview-view, .markdown-source-view")) {
        for (const k of ALLE) if (soll.indexOf(k) < 0 && eigen.indexOf(k) < 0) el.classList.remove(k);
        for (const k of soll) el.classList.add(k);
      }
    }
  };

  // 4. Kapitel (##) der Folien-Notizen (cssclasses eba-folien) beim ersten Öffnen zuklappen, auf allen Geräten (bis 19.10.2026 nur
  //    iPhone; auf dem iPad lief ein langer Foliensatz ohne erkennbare Kapitel durch). Obsidian merkt sich Faltungen je Gerät
  //    (foldManager, lokaler Speicher); jede Notiz wird je Gerät nur einmal vorgefaltet.
  const OFFEN = ["Das Wichtigste", "Zu tun", "Offene Fragen"];
  const vorfalten = async (f) => {
    const liste = app.loadLocalStorage("eba-vorgefaltet") || [];
    if (!f || liste.indexOf(f.path) >= 0) return null;
    const c = app.metadataCache.getFileCache(f);
    if (((c && c.frontmatter && c.frontmatter.cssclasses) || []).indexOf("eba-folien") < 0) return null;
    const zeilen = (await app.vault.cachedRead(f)).split("\n").length;
    const h2 = (c.headings || []).filter((h) => h.level === 2);
    const folds = h2.map((h, i) => ({ h, from: h.position.start.line, to: (h2[i + 1] ? h2[i + 1].position.start.line : zeilen) - 1 }))
      .filter((x) => !OFFEN.some((o) => x.h.heading.startsWith(o))).map((x) => ({ from: x.from, to: x.to }));
    if (folds.length) await app.foldManager.save(f, { folds, lines: zeilen });
    liste.push(f.path); app.saveLocalStorage("eba-vorgefaltet", liste);
    return folds.length ? { folds, lines: zeilen } : null;
  };
  // Die Leseansicht faltet erst, wenn sie ihre Abschnitte kennt. Direkt nach file-open griff applyFoldInfo dort ins Leere, und
  // onMarkdownFold speicherte dann „nichts gefaltet“ über die eben gespeicherte Faltung (gesehen 19.10.2026). Darum nachfassen,
  // bis die Faltung steht (höchstens 15 × 200 ms), und erst dann speichern.
  const anwenden = (l, f, info, rest) => {
    if (!l.view || l.view.file !== f) return;
    try {
      const modus = l.view.currentMode;
      modus.applyFoldInfo(info);
      const steht = !modus.getFoldInfo || ((modus.getFoldInfo() || {}).folds || []).length > 0;
      if (!steht) { if (rest > 0) ctx.zeit(() => anwenden(l, f, info, rest - 1), 200); return; }
      if (l.view.onMarkdownFold) l.view.onMarkdownFold();
    } catch (e) { if (l.rebuildView) l.rebuildView(); }
  };
  const vorfaltenBeimOeffnen = async (f) => {
    try {
      const info = await vorfalten(f);
      if (!info) return;
      for (const l of app.workspace.getLeavesOfType("markdown").filter((x) => x.view && x.view.file === f)) anwenden(l, f, info, 15);
    } catch (e) { /* nicht vorfalten */ }
  };
  // Leseansicht: Ein Tipp irgendwo auf die Kapitelzeile klappt auf und zu, nicht nur der kleine Pfeil (eba-core.css 31).
  const kapitelTipp = (e) => {
    const h2 = e.target.closest && e.target.closest(".markdown-preview-view.eba-folien h2");
    if (!h2 || e.target.closest("a, .heading-collapse-indicator")) return;
    const pfeil = h2.querySelector(":scope > .heading-collapse-indicator");
    if (pfeil) pfeil.click();
  };

  // 5. Experimentell, alle Geräte: Die Leseansicht misst eine Bases-Tabelle in einer eingeklappten Karte manchmal mit
  //    negativer oder veralteter Höhe (Leerraum am Ende). Greift in interne Funktionen ein (measureSection, onRendered);
  //    falls nach einem Obsidian-Update etwas hakt: MESSKORREKTUR = false.
  const renderPrototyp = () => {
    const l = app.workspace.getLeavesOfType("markdown").find((x) => x.view && x.view.previewMode && x.view.previewMode.renderer);
    return l && Object.getPrototypeOf(l.view.previewMode.renderer);
  };
  // Messkorrektur zurücknehmen (Hot-Reload, Entladen des Plugins); die neue Fassung flickt dann selbst
  const entflicken = () => {
    const P = renderPrototyp();
    if (!P || !P.__ebaMessFix) return;
    P.measureSection = P.__ebaMessFix;
    if (P.__ebaMessFixR) P.onRendered = P.__ebaMessFixR;
    delete P.__ebaMessFix; delete P.__ebaMessFixR;
  };
  const flicken = () => {
    const P = renderPrototyp();
    if (!P || P.__ebaMessFix || typeof P.measureSection !== "function") return;
    const orig = P.measureSection;
    P.measureSection = function (s) {
      const erg = orig.apply(this, arguments);
      if (s && (!(s.height >= 0) || !isFinite(s.height))) s.height = s.el && s.el.isConnected ? s.el.offsetHeight : 0;
      return erg;
    };
    P.__ebaMessFix = orig;
    const origR = P.onRendered;
    if (typeof origR === "function") P.__ebaMessFixR = origR;
    if (typeof origR === "function") P.onRendered = function () {
      const erg = origR.apply(this, arguments);
      if (this.__ebaSperre) return erg;
      this.__ebaSperre = true;
      try {
        let geaendert = false;
        for (const s of this.sections || []) {
          if (!s.el || !s.el.isConnected || !s.el.offsetParent) continue;
          const cs = getComputedStyle(s.el);
          const h = s.el.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
          if (Math.abs(h - s.height) > 2) { s.height = h; geaendert = true; }
        }
        if (geaendert && this.updateVirtualDisplay) this.updateVirtualDisplay();
      } catch (e) { console.error("eba Nachmessen", e); }
      setTimeout(() => { this.__ebaSperre = false; }, 300);
      return erg;
    };
  };

  const registrieren = () => {
    const ws = app.workspace;
    document.body.classList.add("eba-plugin-an");
    an(ws, "layout-change", leseansicht);
    an(app.metadataCache, "changed", ctx.entprellen(leseansicht, 300)); // Feld `ansicht` oder `typ` geändert (ILIAS schreibt viele Dateien: entprellt)
    an(ws, "layout-change", klassen);
    an(ws, "file-open", () => ctx.zeit(klassen, 50));
    if (FOLIEN_VORFALTEN && app.foldManager) an(ws, "file-open", vorfaltenBeimOeffnen);
    if (FOLIEN_VORFALTEN) ctx.dom(document, "click", kapitelTipp);
    if (MESSKORREKTUR) { an(ws, "layout-change", flicken); ctx.zeit(flicken, 1000); }
    ctx.zeit(klassen, 500);
    ctx.zeit(leseansicht, 500);
  };

  // Nur beim App-Start (nicht beim Hot-Reload)
  const start = async () => {
    ctx.zeit(() => { dashboardOeffnen().catch((e) => console.error("Start: Dashboard", e)); }, 300);
    if (FOLIEN_VORFALTEN && app.foldManager) {
      ctx.zeit(async () => { for (const f of app.vault.getMarkdownFiles()) { try { await vorfalten(f); } catch (e) { /* nächste */ } } }, 4000);
    }
  };

  return { registrieren, start, abmelden: () => { entflicken(); knoepfeZeigen(); document.body.classList.remove("eba-plugin-an"); }, klassenVon };
};
