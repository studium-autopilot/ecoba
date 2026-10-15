// Start des Vaults (früher Templater-Startskript System/Vorlagen/Start.md). Geladen vom Plugin „Studium Autopilot“ auf
// jedem Gerät, ohne Schalter. Schreibt keine Notizen. Punkte:
//  1. Dashboard als ersten, angepinnten Tab in der Leseansicht öffnen (nur beim App-Start: start()).
//  2. Dashboard bleibt in der Leseansicht.
//  3. Seitenklasse aus dem Feld `typ` an die Ansicht hängen (Gestaltung auch für Notizen ohne `cssclasses`).
//  4. Optional, nur iPhone: Kapitel der Folien-Notizen beim ersten Öffnen zuklappen.
//  5. Experimentell: Höhenmessung der Leseansicht korrigieren (Leerraum am Seitenende).
// (Erweiterungen laden und Hot-Reload macht das Plugin selbst; die Agenda ist jetzt der Codeblock ```eba-agenda```,
// System/Skripte/termine.js, und schreibt keine Datei mehr.)
// registrieren() läuft beim Start und nach jeder Änderung dieser Datei (Hot-Reload). Ereignisse und Timer laufen über die
// Helfer in ctx; vor dem Neuladen meldet das Plugin sie ab und ruft abmelden() (nimmt die Messkorrektur zurück).
// Kein Node-API, keine Lookbehind-Regex (iOS).
module.exports = function (ctx) {
  const app = window.app;
  const { Platform } = ctx.obsidian;

  // Schalter für die optionalen Teile (false = aus).
  const FOLIEN_VORFALTEN = true; // Punkt 4
  const MESSKORREKTUR = true;    // Punkt 5

  const DASHBOARD = "Dashboard.md";
  const an = (quelle, name, fn) => ctx.an(quelle, name, fn);

  // 1. Dashboard als ersten, angepinnten Tab in der Leseansicht öffnen.
  const dashboardOeffnen = async () => {
    const ziel = app.vault.getAbstractFileByPath(DASHBOARD);
    if (!ziel) return;
    // Auch Tabs erkennen, die beim Start noch nicht geladen sind („deferred“, dann fehlt view.file).
    const istDashboard = (l) => ((l.view && l.view.file && l.view.file.path) || (l.getViewState().state || {}).file) === DASHBOARD;
    let blatt = app.workspace.getLeavesOfType("markdown").find(istDashboard);
    if (blatt && blatt.loadIfDeferred) await blatt.loadIfDeferred();
    if (!blatt) {
      const erstes = app.workspace.getLeavesOfType("markdown")[0] || app.workspace.getLeavesOfType("empty")[0];
      blatt = erstes && !erstes.getViewState().pinned && erstes.view && erstes.view.getViewType && erstes.view.getViewType() === "empty" ? erstes : app.workspace.getLeaf("tab");
      await blatt.openFile(ziel, { state: { mode: "preview" } });
    }
    if (blatt.view && blatt.view.getMode && blatt.view.getMode() === "source") {
      const vs = blatt.getViewState(); vs.state = Object.assign({}, vs.state, { mode: "preview" }); await blatt.setViewState(vs);
    }
    blatt.setPinned(true);
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

  // 2. Dashboard bleibt in der Leseansicht.
  const dashboardLesen = () => {
    for (const l of app.workspace.getLeavesOfType("markdown")) {
      if (l.view && l.view.file && l.view.file.path === DASHBOARD && l.view.getMode && l.view.getMode() === "source") {
        const vs = l.getViewState(); vs.state = Object.assign({}, vs.state, { mode: "preview" }); l.setViewState(vs);
      }
    }
  };

  // 3. Seitenklasse aus dem Feld `typ` (mehrere Klassen mit Leerzeichen). Schreibt keine Datei.
  const TYP = { termin: "eba-s-termin", unterlage: "eba-s-begleitnotiz", lehrveranstaltung: "eba-s-notizen", vorlesung: "eba-s-notizen eba-s-vorlesung" };
  const klassen = () => {
    for (const l of app.workspace.getLeavesOfType("markdown")) {
      const f = l.view && l.view.file; if (!f) continue;
      const c = app.metadataCache.getFileCache(f);
      const fm = (c && c.frontmatter) || {};
      const k = TYP[fm.typ]; if (!k || (fm.cssclasses || []).indexOf("eba-folien") >= 0) continue;
      for (const el of l.view.containerEl.querySelectorAll(".markdown-preview-view, .markdown-source-view")) el.classList.add(...k.split(" "));
    }
  };

  // 4. Nur iPhone: Kapitel (##) der Folien-Notizen (cssclasses eba-folien) beim ersten Öffnen zuklappen. Obsidian merkt sich
  //    Faltungen je Gerät (foldManager, lokaler Speicher); jede Notiz wird je Gerät nur einmal vorgefaltet.
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
  const vorfaltenBeimOeffnen = async (f) => {
    try {
      const info = await vorfalten(f);
      if (!info) return;
      for (const l of app.workspace.getLeavesOfType("markdown").filter((x) => x.view && x.view.file === f)) {
        try { l.view.currentMode.applyFoldInfo(info); if (l.view.onMarkdownFold) l.view.onMarkdownFold(); } catch (e) { if (l.rebuildView) l.rebuildView(); }
      }
    } catch (e) { /* nicht vorfalten */ }
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
    an(ws, "layout-change", dashboardLesen);
    an(ws, "layout-change", klassen);
    an(ws, "file-open", () => ctx.zeit(klassen, 50));
    if (FOLIEN_VORFALTEN && Platform.isPhone && app.foldManager) an(ws, "file-open", vorfaltenBeimOeffnen);
    if (MESSKORREKTUR) { an(ws, "layout-change", flicken); ctx.zeit(flicken, 1000); }
    ctx.zeit(klassen, 500);
  };

  // Nur beim App-Start (nicht beim Hot-Reload)
  const start = async () => {
    ctx.zeit(() => { dashboardOeffnen().catch((e) => console.error("Start: Dashboard", e)); }, 300);
    if (FOLIEN_VORFALTEN && Platform.isPhone && app.foldManager) {
      ctx.zeit(async () => { for (const f of app.vault.getMarkdownFiles()) { try { await vorfalten(f); } catch (e) { /* nächste */ } } }, 4000);
    }
  };

  return { registrieren, start, abmelden: entflicken };
};
