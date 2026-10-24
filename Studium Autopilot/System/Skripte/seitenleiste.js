// Seitenleiste „Übersicht“ (seit 19.10.2026; ersetzt das Raster-Menü oben in jeder Notiz, menue.js bis 0.4.6): ein eigener Tab in
// Obsidians linker Seitenleiste, auf dem PC daneben, auf iPhone und iPad die Schublade hinter dem Symbol oben links. Oben die Seiten
// (ZIELE, Symbole aus eba-core.css), darunter „Dieses Semester“ mit deinen Modulen (ctx.user.eba diesesSemester, wie im Fenster
// „Neu …“). Hervorgehoben ist die Seite, die vorn offen ist; bei Notizen mit „code“ (Unterlagen, Vorlesungen, Termine …) auch ihr
// Modul. Ein Tipp öffnet im Tab vorn (ctx.oeffnen, nie in der Seitenleiste) und schließt auf iPhone und iPad die Schublade, solange
// sie nicht angeheftet ist; Strg/⌘ öffnet einen neuen Tab. „Dashboard“ führt jederzeit zurück zum Start. Schreibt keine Datei.
// Den Tab legt registrieren() einmal an, wenn er fehlt: als ersten Tab der linken Seitenleiste, dort gleich ausgewählt (Obsidian
// merkt sich die Lage je Gerät in workspace.json bzw. workspace-mobile.json). Wer ihn schließt, bekommt ihn beim nächsten Start
// zurück. Hot-Reload: abmelden() meldet die Ansicht ab, Obsidian hält den Tab leer offen und baut ihn mit der neuen Fassung
// wieder auf, sobald sie sich anmeldet („view-registered“). Stil: eba-core.css Abschnitt 66 (.eba-sl-*). Kein Node-API.
const TYP = "eba-uebersicht";
// Symbol des Tabs als eigenes SVG (Lucide „layout-grid“ im 100er-Feld von addIcon, Strich und Farbe als Attribute): Obsidians
// Symbole über setIcon blieben auf dem iPad leer, genau dieses im Raster-Menü bis 0.4.6. Ohne addIcon bleibt „layout-grid“.
const SYMBOL = "eba-uebersicht";
const SYMBOL_SVG = '<g fill="none" stroke="currentColor" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">'
  + [[12.5, 12.5], [58.3, 12.5], [58.3, 58.3], [12.5, 58.3]].map(([x, y]) => `<rect x="${x}" y="${y}" width="29.2" height="29.2" rx="4.2"/>`).join("")
  + "</g>";
// Einzige Liste der Seiten (Reihenfolge = Zeilen). Neue Seite: Notizname hier eintragen; die Lesezeichen der Vorlage folgen ihr
// (tests/seitenleiste.test.js), ihr Symbol kommt nach eba-core.css (li:has(> a[data-href$=…])).
// Stundenplan fehlt seit 24.10.2026 (0.6.6: nur am iPhone): Das Dashboard zeigt die Woche auf jedem Gerät als Raster (woche.js).
const ZIELE = ["Dashboard", "Studienverlauf", "Termine & Anmeldungen", "Postfach", "Prüfungen", "Noten & ECTS",
  "Unterlagen", "Lernplan", "Karteikarten", "Kontakte & Links", "Einstellungen & Hilfe"];
// Seiten, die gerade gelten: Lernplan nur, wenn es Lernplan-Notizen gibt (lernplan.js sichtbar())
const sichtbareZiele = (ctx) => ZIELE.filter((z) => z !== "Lernplan" || !!(ctx.lernplan && ctx.lernplan.sichtbar()));

// Modulzeilen „Dieses Semester“, nach Code sortiert: [{ f, fm }]
const moduleJetzt = (eba) => {
  const sem = eba.aktuellesSemester().name;
  return eba.alleModule().filter((x) => x.fm.code && eba.diesesSemester(x, sem))
    .sort((a, b) => String(a.fm.code).localeCompare(String(b.fm.code)));
};

module.exports = function (ctx) {
  const app = window.app;
  const { ItemView, Platform, addIcon } = ctx.obsidian;
  const eigenesSymbol = typeof addIcon === "function";

  // Datei, die vorn offen ist (nicht die Seitenleiste selbst)
  const vorn = () => {
    const ws = app.workspace;
    const blatt = ws.getMostRecentLeaf(ws.rootSplit);
    return (blatt && blatt.view && blatt.view.file) || null;
  };

  const tippen = async (e, datei) => {
    e.preventDefault();
    const ws = app.workspace;
    await ctx.oeffnen(datei, { neu: e.ctrlKey || e.metaKey });
    if (Platform.isMobile && ws.leftSplit && !ws.leftSplit.isPinned && typeof ws.leftSplit.collapse === "function") ws.leftSplit.collapse();
  };

  // Eine Zeile: <li><a data-href="Ziel">…</a></li>, damit die Symbole der Ziele aus eba-core.css greifen (li:has(> a[data-href$=…]))
  const zeile = (ul, o) => {
    const li = ul.createEl("li", { cls: "eba-sl-zeile" + (o.aktiv ? " aktiv" : "") });
    if (o.code) li.createSpan({ cls: "eba-sl-code", text: o.code });
    const a = li.createEl("a", { cls: "eba-sl-text", text: o.text, attr: o.ziel ? { "data-href": o.ziel } : {} });
    if (o.aktiv) a.setAttribute("aria-current", "page");
    li.addEventListener("click", (e) => { tippen(e, o.datei).catch((x) => console.error("seitenleiste: öffnen", x)); });
  };

  const zeichnen = (ansicht) => {
    const el = ansicht.contentEl;
    el.empty();
    el.addClass("eba-sl");
    const offen = vorn();
    const fm = offen ? app.metadataCache.getFileCache(offen)?.frontmatter : null;
    const code = fm && fm.code ? String(fm.code) : "";
    const seiten = el.createEl("ul", { cls: "eba-sl-liste" });
    for (const ziel of sichtbareZiele(ctx)) {
      const datei = app.metadataCache.getFirstLinkpathDest(ziel, "");
      if (datei) zeile(seiten, { ziel, text: ziel, datei, aktiv: datei === offen });
    }
    const eba = ctx.user.eba ? ctx.user.eba(ctx) : null;
    const module = eba && eba.diesesSemester ? moduleJetzt(eba) : []; // eba.js vor 0.4.7 (Sync noch nicht fertig): ohne Module
    if (!module.length) return;
    el.createDiv({ cls: "eba-sl-label", text: "Dieses Semester" });
    const ul = el.createEl("ul", { cls: "eba-sl-liste eba-sl-module" });
    for (const m of module) {
      zeile(ul, { code: String(m.fm.code), text: String(m.fm.titel || m.f.basename), datei: m.f, aktiv: m.f === offen || String(m.fm.code) === code });
    }
  };

  const ansichten = new Set();
  const allesNeu = () => { for (const v of ansichten) { try { zeichnen(v); } catch (e) { console.error("seitenleiste", e); } } };

  class Uebersicht extends ItemView {
    getViewType() { return TYP; }
    getDisplayText() { return "Übersicht"; }
    getIcon() { return eigenesSymbol ? SYMBOL : "layout-grid"; }
    async onOpen() { ansichten.add(this); zeichnen(this); }
    async onClose() { ansichten.delete(this); }
  }

  // Tab anlegen, wenn er fehlt; doppelte (z. B. nach einem Sync der Lage) schließen
  const anlegen = async () => {
    const ws = app.workspace, links = ws.leftSplit;
    if (!links) return;
    const da = ws.getLeavesOfType(TYP);
    for (const b of da.slice(1)) b.detach();
    if (da.length) return;
    const vorher = ws.getMostRecentLeaf(ws.rootSplit);
    const kinder = links.children || [];
    // PC: erste Tab-Gruppe der Seitenleiste; iPhone/iPad: die Schublade selbst (ihre Kinder sind die Tabs)
    const gruppe = kinder[0] && Array.isArray(kinder[0].children) ? kinder[0] : links;
    const blatt = gruppe.children && gruppe.children.length ? ws.createLeafInParent(gruppe, 0) : ws.getLeftLeaf(false);
    if (!blatt) return;
    await blatt.setViewState({ type: TYP, active: false });
    const i = (gruppe.children || []).indexOf(blatt);
    if (i >= 0 && typeof gruppe.selectTabIndex === "function") gruppe.selectTabIndex(i);
    if (vorher) ws.setActiveLeaf(vorher, { focus: false }); // createLeafInParent macht den neuen Tab aktiv
  };

  return {
    registrieren() {
      const vr = app.viewRegistry;
      if (vr && vr.viewByType && vr.viewByType[TYP]) vr.unregisterView(TYP);
      if (eigenesSymbol) addIcon(SYMBOL, SYMBOL_SVG);
      ctx.plugin.registerView(TYP, (blatt) => new Uebersicht(blatt));
      ctx.aufraeumen(() => { if (app.viewRegistry) app.viewRegistry.unregisterView(TYP); });
      const bald = ctx.entprellen(allesNeu, 150);
      const ws = app.workspace;
      ctx.an(ws, "active-leaf-change", bald);
      ctx.an(ws, "file-open", bald);
      if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(bald));
      // Nach dem Anmelden baut Obsidian vorhandene Tabs neu auf; erst danach prüfen, ob einer fehlt
      ctx.zeit(() => { anlegen().catch((e) => console.error("seitenleiste: anlegen", e)); }, 1500);
    },
  };
};
module.exports.TYP = TYP;
module.exports.SYMBOL = SYMBOL;
module.exports.SYMBOL_SVG = SYMBOL_SVG;
module.exports.ZIELE = ZIELE;
module.exports.sichtbareZiele = sichtbareZiele;
module.exports.moduleJetzt = moduleJetzt;
