// Übersicht: alle Seiten (ZIELE, Symbole aus eba-core.css), darunter „Dieses Semester“ mit deinen Modulen (ctx.user.eba
// diesesSemester, wie im Fenster „Neu …“), als Menü unten rechts hinter ≡, daneben ein Zahnrad für Einstellungen & Hilfe, auf
// jedem Gerät dieselben Symbole an derselben Stelle (seit 26.10.2026, Rückmeldung: „take over the menu I circled“, „überall gleich“).
// Hervorgehoben ist die Seite, die vorn offen ist; bei Notizen mit „code“ (Unterlagen, Vorlesungen, Termine …) auch ihr Modul. Ein
// Tipp öffnet im Tab vorn (ctx.oeffnen), Strg/⌘ einen neuen Tab. „Dashboard“ führt jederzeit zurück zum Start. Schreibt keine Datei.
// iPhone und iPad: Das ≡ ist Obsidians eigenes in der Leiste unten (app.mobileNavbar); das Skript übernimmt nur den Tipp darauf
// (onRibbonMenuClick, langes Drücken zeigt weiter Obsidians Menü). Das Zahnrad steht in derselben Leiste gleich hinter Obsidians
// „+“ (zahnradEinsetzen). Auf dem iPad blendet Obsidian die Leiste aus; eba-core.css 66 zeigt sie dort mit denselben sieben
// Knöpfen wie auf dem iPhone (seit 26.10.2026; Zurück, Vor und „+“ standen vorher oben in der Zeile). PC:
// Obsidian hat dort keine Leiste unten, das Skript setzt eine eigene mit denselben sieben Knöpfen (pcLeiste, seit 27.10.2026;
// vorher nur Zahnrad und ≡). Solange das Zahnrad dasteht,
// fehlt Einstellungen & Hilfe im Menü. Wischen vom linken Rand geht auf iPhone und iPad zurück wie ‹, statt Obsidians linke
// Seitenleiste aufzuziehen (weiter innen tut Wischen nach rechts nichts), und Herunterziehen oben auf einer Seite führt keinen Befehl mehr aus (wischenUebernehmen, seit
// 26.10.2026). Am Ende einer Notiz zeigt es auf dem iPhone die Leiste wieder, die Obsidian beim Scrollen ausblendet
// (leisteAmEnde, seit 27.10.2026).
// Bis 26.10.2026 stand die Liste als eigener Tab „Übersicht“ in Obsidians linker Seitenleiste (seit 19.10.2026; ersetzte das
// Raster-Menü oben in jeder Notiz, menue.js bis 0.4.6), auf iPhone und iPad in der Schublade hinter ⎕. Solche Tabs entfernt das
// Skript beim Start; die Ansicht bleibt dafür angemeldet, Obsidian baut sie aus workspace.json sonst nicht auf. Hot-Reload:
// abmelden() meldet die Ansicht ab, gibt das ≡ zurück und nimmt Zahnrad und Leiste weg. Stil: eba-core.css Abschnitt 66
// (.eba-sl-*, .eba-nav-*). Kein Node-API.
const TYP = "eba-uebersicht";
// Symbol des Tabs als eigenes SVG (Lucide „layout-grid“ im 100er-Feld von addIcon, Strich und Farbe als Attribute): Obsidians
// Symbole über setIcon blieben auf dem iPad leer, genau dieses im Raster-Menü bis 0.4.6. Ohne addIcon bleibt „layout-grid“.
const SYMBOL = "eba-uebersicht";
const SYMBOL_SVG = '<g fill="none" stroke="currentColor" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">'
  + [[12.5, 12.5], [58.3, 12.5], [58.3, 58.3], [12.5, 58.3]].map(([x, y]) => `<rect x="${x}" y="${y}" width="29.2" height="29.2" rx="4.2"/>`).join("")
  + "</g>";
// Symbole der Leiste unten als eigene SVG aus demselben Grund, je [[Element, Attribute], …] im 24er-Feld. ≡ (Lucide „menu“) für
// Obsidians Knopf: so steht es auch dann da, wenn in Obsidian ein „Quick ribbon item“ eingestellt ist, dessen Symbol sonst den
// Knopf trüge. Zahnrad (Lucide „settings“): dasselbe wie in der Zeile „Einstellungen & Hilfe“ (eba-core.css).
const MENUE_SVG = [6, 12, 18].map((y) => ["line", { x1: "4", x2: "20", y1: String(y), y2: String(y) }]);
const ZAHNRAD_SVG = [["path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }],
  ["circle", { cx: "12", cy: "12", r: "3" }]];
// Das Zahnrad in der Leiste unten (hinter Obsidians „+“) und die Seite, die es öffnet
const ZAHNRAD = "eba-nav-zahnrad";
const EINSTELLUNGEN = "Einstellungen & Hilfe";
// Die übrigen Knöpfe der Leiste am PC (pcLeiste), wie Obsidians auf iPhone und iPad: Lucide „chevron-left“, „chevron-right“,
// „search“, „plus“ und Obsidians „tab-frame“ (der Rahmen, in dem die Zahl der Tabs steht)
const ZURUECK_SVG = [["path", { d: "m15 18-6-6 6-6" }]];
const VOR_SVG = [["path", { d: "m9 18 6-6-6-6" }]];
const SUCHE_SVG = [["path", { d: "m21 21-4.34-4.34" }], ["circle", { cx: "11", cy: "11", r: "8" }]];
const PLUS_SVG = [["path", { d: "M5 12h14" }], ["path", { d: "M12 5v14" }]];
const TABS_SVG = [["rect", { x: "1", y: "3", width: "22", height: "18", rx: "4" }]];
// Einzige Liste der Seiten (Reihenfolge = Zeilen). Neue Seite: Notizname hier eintragen; die Lesezeichen der Vorlage folgen ihr
// (tests/seitenleiste.test.js), ihr Symbol kommt nach eba-core.css (li:has(> a[data-href$=…])).
// Stundenplan fehlt seit 24.10.2026 (0.6.6: nur am iPhone): Das Dashboard zeigt die Woche auf jedem Gerät als Raster (woche.js).
const ZIELE = ["Dashboard", "Studienverlauf", "Termine & Anmeldungen", "Postfach", "Prüfungen", "Noten & ECTS",
  "Unterlagen", "Lernplan", "Karteikarten", "Kontakte & Links", "Einstellungen & Hilfe"];
// Seiten, die noch nicht fertig sind: ihre Zeile ist abgeblendet und trägt rechts „in Entwicklung“ (Lernplan seit 19.10.2026, den
// Warnkasten auf der Seite schaltet lernplan.js IN_ENTWICKLUNG; Karteikarten seit 24.10.2026). Fertig: Namen hier streichen.
const IN_ENTWICKLUNG = ["Lernplan", "Karteikarten"];
// Seiten, die gerade gelten: Lernplan nur, wenn es Lernplan-Notizen gibt (lernplan.js sichtbar())
const sichtbareZiele = (ctx) => ZIELE.filter((z) => z !== "Lernplan" || !!(ctx.lernplan && ctx.lernplan.sichtbar()));

// Modulzeilen „Dieses Semester“, nach Code sortiert: [{ f, fm }]
const moduleJetzt = (eba) => {
  const sem = eba.aktuellesSemester().name;
  return eba.alleModule().filter((x) => x.fm.code && eba.diesesSemester(x, sem))
    .sort((a, b) => String(a.fm.code).localeCompare(String(b.fm.code)));
};

// Lage des Menüs über der Leiste mit dem ≡ (rein, Tests). k: Rechteck der Leiste (wie getBoundingClientRect), breite/hoehe:
// Fenster, oben: frei zu lassen (Statusleiste) → { rechts, unten, max } in px: rechte Kante bündig mit der Leiste (mindestens RAND
// vom Rand), 8 px über ihr, höchstens bis RAND unter `oben`; mindestens MIN_HOEHE hoch, dann scrollt es.
const RAND = 12;
const MIN_HOEHE = 160;
const menueLage = (k, breite, hoehe, oben) => ({
  rechts: Math.max(RAND, Math.round(breite - k.right)),
  unten: Math.round(hoehe - k.top + 8),
  max: Math.max(MIN_HOEHE, Math.round(k.top - 8 - (oben || 0) - RAND)),
});

// Wischen nach rechts geht auf iPhone und iPad zurück wie ‹ in der Leiste (seit 26.10.2026, Rückmeldung: „Swiping from the left
// shouldn't open the sidebar but do the same as the back arrow“). Obsidian meldet jede Geste auf seiner Fläche als Ereignis
// „swipe“ der Workspace (app.js 1.14.5: workspace.trigger("swipe", g), g mit points, direction, startX, startY, x, targetEl und
// registerCallback). Die linke Seitenleiste zieht sich daraufhin auf, wenn ein Finger waagerecht zu ihr hin wischt, von überall
// auf der Fläche, und beide Seitenleisten zu oder angeheftet sind. zurueckGeste (rein, Tests): Ist g so eine Geste? z: bereit
// (Obsidian fertig geladen), richtung (1, bei Sprachen von rechts nach links -1), linksZu und rechtsZu (zu oder angeheftet),
// phone, hoehe (Fenster), unten (sicherer Rand unten; dort beginnt Obsidian auf dem iPhone keine Seitenleiste). Fehlt der Geste
// ein Feld, etwa nach einem Umbau durch Obsidian, ist es keine, und Obsidian macht, was es immer macht. Zurück geht es nur vom
// Rand (amRand).
const zurueckGeste = (g, z) => !!g && !!z.bereit && g.points === 1 && g.direction === "x"
  && [g.x, g.startX, g.startY].every((v) => typeof v === "number") && typeof g.registerCallback === "function"
  && (g.x - g.startX) * z.richtung > 0 && !!z.linksZu && !!z.rechtsZu && !(z.phone && z.hoehe - g.startY < z.unten);
// Weit genug für Zurück? weg: gewischt in px (zur Seitenleiste hin), schwung: Obsidians Hochrechnung beim Loslassen (weg plus
// 1000 × Geschwindigkeit in px/ms; danach entscheidet auch die Seitenleiste). Mindestens WISCH_MIN gewischt, so zählen ein Tipp,
// ein Zittern und das Blättern im Wochenraster nicht (woche.js reicht Obsidian nur die ersten 10 px weiter), und hochgerechnet
// WISCH_WEIT: langsam weit oder kurz und schnell.
// Nur vom Rand (seit 27.10.2026, Rückmeldung: „Nur vom linken Rand“): Zurück geht es nur, wenn die Geste im Streifen am linken Rand
// beginnt, bei Sprachen von rechts nach links am rechten. ZURUECK_RAND breit, ab dem sicheren Rand (safe-area-inset-left bzw.
// -right: iPhone quer neben der Notch, iPad). 30 px, so breit wie bei iOS das Zurück vom Rand (etwa 20 bis 30 pt), und wie RAND
// in woche.js: Ab dort blättert das Wochenraster, so bleibt dazwischen kein Spalt. Weiter innen tut so eine Geste nichts, auch
// keine Seitenleiste; Kästen im Wochenraster und breite Tabellen bleiben so unberührt. amRand (rein, Tests): x Start (clientX),
// z: richtung, breite (Fenster), sicher (sicherer Rand auf dieser Seite, px).
const ZURUECK_RAND = 30;
const amRand = (x, z) => typeof x === "number"
  && (z.richtung === 1 ? x < z.sicher + ZURUECK_RAND : x > z.breite - z.sicher - ZURUECK_RAND);
const WISCH_MIN = 40;
const WISCH_WEIT = 100;
const zurueckWeit = (weg, schwung) => weg >= WISCH_MIN && schwung >= WISCH_WEIT;
// Hinweis beim Wischen nach rechts (seit 27.10.2026, Rückmeldung: „Ich hab nur die eine spezifische Pille nicht gemocht“): Obsidians
// eigener Hinweis von Zurück mit zwei Fingern (div.pull-action.pull-out-action, Text „Zurück“, Stil aus
// Obsidians CSS und dem Design), der mit dem Finger von der Kante hereinrutscht. hinweisLage (rein, Tests): weg (px, zur
// Seitenleiste hin), richtung (1: von links), breite (des Hinweises) → anteil (0 bis 1), aktiv (mod-activated), x (translateX
// beim Wischen), ende und dauer (Hinausgleiten beim Loslassen, ms), gerechnet wie Obsidian (app.js 1.14.5), nur mit WISCH_WEIT
// statt 90 px: Ganz da und aktiv ist er ab der Strecke, ab der ein langsames Wischen sicher zurückgeht (die Hochrechnung ist
// dann etwa der Weg, und zurueckWeit verlangt WISCH_WEIT). Kurz und schnell geht es auch zurück, ohne dass er ganz da war: Die
// Geschwindigkeit kennt erst das Loslassen.
const hinweisLage = (weg, richtung, breite) => {
  const anteil = Math.min(1, Math.max(0, weg / WISCH_WEIT));
  return {
    anteil, aktiv: anteil === 1, x: (anteil - 1) * richtung * breite || 0,
    ende: -richtung * breite * breite / WISCH_WEIT || 0, dauer: 100 * anteil,
  };
};
// Herunterziehen (seit 26.10.2026, Rückmeldung: „Remove access to command palette via swiping down. No users uses it it opens often
// by mistake.“): Zieht ein Finger oben auf einer Seite nach unten, zeigt Obsidian einen Hinweis und führt beim Loslassen seine
// Schnellaktion aus (Einstellung mobilePullAction, ab Werk die Befehlspalette; app.js 1.14.5, Hörer auf „swipe“). herunterGeste
// (rein, Tests): Ist g so eine Geste? Dieselbe Regel wie Obsidian: ein Finger, senkrecht, nicht nach oben; ob sie in der
// Hauptfläche beginnt, prüft die Hülle. Fehlt der Geste ein Feld, ist es keine.
const herunterGeste = (g, z) => !!g && !!z.bereit && g.points === 1 && g.direction === "y"
  && typeof g.y === "number" && typeof g.startY === "number" && g.y >= g.startY;
// Am Seitenende (seit 27.10.2026, Rückmeldung vom iPhone: „Too much blank space“): Obsidian blendet die Leiste beim Scrollen nach
// unten aus und erst beim Scrollen nach oben oder einem Tipp wieder ein (mobileNavbar.onScroll, app.js 1.14.5). Unten in jeder
// Notiz hält eba-core.css 36d ihr den Platz frei; ohne sie stand dort eine leere Fläche. Wie Safari zeigt das Skript die Leiste,
// sobald man am Ende einer Notiz ENDE_RUHE ms nicht mehr scrollt (leisteAmEnde). amEnde (rein, Tests): s wie ein Element mit
// scrollHeight, scrollTop und clientHeight; weniger als ENDE_REST px bis unten (iOS scrollt in Bruchteilen von Pixeln).
const ENDE_REST = 4;
const ENDE_RUHE = 150;
const amEnde = (s) => s.scrollHeight - s.scrollTop - s.clientHeight < ENDE_REST;

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

  // ---------- Menü unten rechts ----------
  let menue = null; // { hinter, el, vorher } solange offen; vorher: mit der Tastatur geöffnet, bekommt den Fokus zurück
  let zahnrad = null; // das Zahnrad in der Leiste, solange es dasteht (zahnradEinsetzen)
  const menueZu = () => {
    if (!menue) return;
    menue.hinter.remove();
    menue.el.remove();
    menue = null;
  };
  const zeilenIm = (el) => Array.from(el.querySelectorAll(".eba-sl-zeile"));
  // Tasten, solange das Menü offen ist (ein Hörer für die ganze Laufzeit, über ctx.dom angemeldet, siehe registrieren): Esc
  // schließt es, ↑ und ↓ wandern durch die Zeilen (seit 27.10.2026; bis dahin erreichte die Tastatur am PC keine Zeile). Enter und
  // Leertaste öffnen die Zeile mit dem Fokus (zeile).
  const taste = (e) => {
    if (!menue) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      const vorher = menue.vorher;
      menueZu();
      if (vorher && vorher.isConnected) vorher.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const zeilen = zeilenIm(menue.el);
    if (!zeilen.length) return;
    e.preventDefault();
    e.stopPropagation();
    const i = zeilen.indexOf(document.activeElement);
    zeilen[e.key === "ArrowDown" ? (i + 1) % zeilen.length : (i <= 0 ? zeilen.length - 1 : i - 1)].focus();
  };

  const tippen = async (e, datei) => {
    e.preventDefault();
    menueZu();
    await ctx.oeffnen(datei, { neu: e.ctrlKey || e.metaKey });
  };

  // Eine Zeile: <li><a data-href="Ziel">…</a></li>, damit die Symbole der Ziele aus eba-core.css greifen (li:has(> a[data-href$=…]))
  const zeile = (ul, o) => {
    const entwicklung = IN_ENTWICKLUNG.includes(o.ziel);
    const li = ul.createEl("li", { cls: "eba-sl-zeile" + (o.aktiv ? " aktiv" : "") + (entwicklung ? " is-entwicklung" : "") });
    if (o.code) li.createSpan({ cls: "eba-sl-code", text: o.code });
    const a = li.createEl("a", { cls: "eba-sl-text", text: o.text, attr: o.ziel ? { "data-href": o.ziel } : {} });
    if (o.aktiv) a.setAttribute("aria-current", "page");
    if (entwicklung) li.createSpan({ cls: "eba-sl-entwicklung", text: "in Entwicklung" });
    const los = (e) => { tippen(e, o.datei).catch((x) => console.error("seitenleiste: öffnen", x)); };
    li.addEventListener("click", los);
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") los(e); });
  };

  // Seiten und Module in el (Inhalt des Tabs oder des Menüs); ohne: Seiten, die hier fehlen
  const zeichnen = (el, ohne = []) => {
    el.empty();
    el.addClass("eba-sl");
    const offen = vorn();
    const fm = offen ? app.metadataCache.getFileCache(offen)?.frontmatter : null;
    const code = fm && fm.code ? String(fm.code) : "";
    const seiten = el.createEl("ul", { cls: "eba-sl-liste" });
    for (const ziel of sichtbareZiele(ctx).filter((z) => !ohne.includes(z))) {
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

  // Im Menü fehlt Einstellungen & Hilfe, solange das Zahnrad in der Leiste dasteht (Rückmeldung vom 26.10.2026: „Redundant“)
  const menueOhne = () => (zahnrad ? [EINSTELLUNGEN] : []);
  // Menü über der Leiste öffnen; ein Tipp daneben (auch auf das ≡) oder Esc schließt es. perTaste: mit der Tastatur geöffnet (am
  // PC Enter oder Leertaste auf ≡), dann steht der Fokus gleich auf der offenen Seite bzw. der ersten Zeile.
  const menueAuf = (knopf, perTaste = false) => {
    if (menue) { menueZu(); return; }
    const vorher = perTaste ? document.activeElement : null;
    const hinter = document.body.createDiv({ cls: "eba-nav-hinter" });
    const el = document.body.createDiv({ cls: "eba-nav-menue", attr: { role: "menu", "aria-label": "Seiten" } });
    zeichnen(el, menueOhne());
    for (const ul of Array.from(el.querySelectorAll("ul"))) ul.setAttribute("role", "none");
    const zeilen = zeilenIm(el);
    for (const z of zeilen) {
      z.setAttribute("role", "menuitem");
      z.setAttribute("tabindex", "-1");
    }
    const oben = parseFloat(getComputedStyle(document.body).getPropertyValue("--safe-area-inset-top")) || 0;
    const lage = menueLage(knopf.getBoundingClientRect(), window.innerWidth, window.innerHeight, oben);
    el.style.right = lage.rechts + "px";
    el.style.bottom = lage.unten + "px";
    el.style.maxHeight = lage.max + "px";
    const aktiv = el.querySelector(".eba-sl-zeile.aktiv");
    if (aktiv) aktiv.scrollIntoView({ block: "nearest" });
    hinter.addEventListener("click", (e) => { e.preventDefault(); menueZu(); });
    menue = { hinter, el, vorher };
    if (perTaste && (aktiv || zeilen[0])) (aktiv || zeilen[0]).focus();
  };

  // Symbol wie Obsidians (Klasse svg-icon: Größe und Strich aus Obsidians CSS) aus Teilen wie MENUE_SVG
  const symbol = (name, teile) => {
    const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    for (const [k, v] of Object.entries({ width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
      "stroke-linecap": "round", "stroke-linejoin": "round", class: "svg-icon " + name, "aria-hidden": "true" })) svg.setAttribute(k, v);
    for (const [tag, attribute] of teile) {
      const t = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attribute)) t.setAttribute(k, v);
      svg.appendChild(t);
    }
    return svg;
  };

  // Obsidians ≡ übernehmen: Obsidian setzt Tipp und Symbol in updateRibbonMenuItem zurück (beim Start und wenn sich „Quick ribbon
  // item“ ändert), darum danach jedes Mal wieder setzen. Beim Abmelden alles zurückgeben, auch die Beschriftung für
  // Bildschirmleser: Die setzt updateRibbonMenuItem nicht (Obsidian 1.14.5), bis 27.10.2026 blieb dort „Seiten“ stehen.
  const navbarUebernehmen = () => {
    const n = app.mobileNavbar;
    if (!n || typeof n.updateRibbonMenuItem !== "function") return;
    const altTipp = n.onRibbonMenuClick;
    const altName = n.ribbonMenuItemEl ? n.ribbonMenuItemEl.getAttribute("aria-label") : null;
    const eigenesUpdate = Object.prototype.hasOwnProperty.call(n, "updateRibbonMenuItem");
    const altUpdate = n.updateRibbonMenuItem;
    const setzen = () => {
      n.onRibbonMenuClick = (e) => { if (e && e.preventDefault) e.preventDefault(); menueAuf(n.containerEl || n.ribbonMenuItemEl); };
      const i = n.ribbonMenuItemEl;
      if (!i) return;
      i.empty();
      i.appendChild(symbol("lucide-menu", MENUE_SVG));
      i.setAttribute("aria-label", "Seiten");
    };
    n.updateRibbonMenuItem = function (...a) { const r = altUpdate.apply(this, a); setzen(); return r; };
    setzen();
    ctx.aufraeumen(() => {
      if (eigenesUpdate) n.updateRibbonMenuItem = altUpdate; else delete n.updateRibbonMenuItem;
      n.onRibbonMenuClick = altTipp;
      try { n.updateRibbonMenuItem(); } catch (e) { console.error("seitenleiste: ≡ zurückgeben", e); }
      const i = n.ribbonMenuItemEl;
      if (i && altName === null) i.removeAttribute("aria-label");
      else if (i) i.setAttribute("aria-label", altName);
    });
  };

  // Zahnrad in derselben Leiste, gleich hinter „+“ (seit 26.10.2026; erst statt „+“ gedacht, dann „Keep the plus, there's
  // enough space“): öffnet Einstellungen & Hilfe. Gleiches Markup wie Obsidians Knöpfe (div.mobile-navbar-action >
  // span.clickable-icon), so sieht es gleich aus und reagiert gleich auf Tippen; es verschwindet mit der Leiste beim Scrollen und
  // bei offener Tastatur (Obsidian baut die Leiste nie neu, es hängt sie nur ein und aus). Findet das Skript „+“ nicht (Obsidian
  // hat die Leiste umgebaut), fehlt das Zahnrad, und Einstellungen & Hilfe steht wieder im Menü.
  const zahnradEinsetzen = () => {
    const leiste = app.mobileNavbar && app.mobileNavbar.containerEl;
    const plus = leiste && leiste.querySelector(".mobile-navbar-action-new-tab");
    if (!plus) return;
    const k = document.createElement("div");
    k.className = "mobile-navbar-action " + ZAHNRAD;
    const i = document.createElement("span");
    i.className = "clickable-icon";
    i.setAttribute("aria-label", EINSTELLUNGEN);
    i.appendChild(symbol("lucide-settings", ZAHNRAD_SVG));
    k.appendChild(i);
    k.addEventListener("click", (e) => {
      const datei = app.metadataCache.getFirstLinkpathDest(EINSTELLUNGEN, "");
      if (datei) tippen(e, datei).catch((x) => console.error("seitenleiste: Einstellungen", x));
    });
    plus.after(k);
    zahnrad = k;
    ctx.aufraeumen(() => { k.remove(); zahnrad = null; });
  };

  // iPad, beim Schreiben: ‹ › vorn in Obsidians Werkzeugleiste. Hat der Editor den Fokus, zeigt Obsidian unten seine
  // Werkzeugleiste (app.mobileToolbar, body.mod-toolbar-open) und nimmt die Leiste mit ‹ ›, ≡ und Zahnrad weg (mobileNavbar.hide,
  // app.js 1.14.5). Mit einer Tastatur am iPad bleibt der Fokus oft lange; dann gab es keine Navigation mehr (bis 27.10.2026,
  // vorher standen ‹ › oben in der Zeile). Die beiden stehen darum als eigene Gruppe vorn in der Werkzeugleiste, gestaltet wie
  // Obsidians Knopf für die Tastatur rechts (mobile-toolbar-floating-options, mobile-toolbar-option). Obsidian baut die
  // Werkzeugleiste nie neu (es hängt sie nur ein und aus, compileToolbar leert nur die Liste der Befehle), die Gruppe bleibt.
  // mousedown ohne Folgen wie bei Obsidians Befehlen: Der Editor behält den Fokus. Zurück und Vor wie ‹ › der Leiste
  // (history.go des aktiven Tabs), ausgegraut ohne Verlauf (aria-disabled wie dort). Auf dem iPhone blendet eba-core.css 66 sie
  // aus (die Werkzeugleiste ist dort schmal, und die Tastatur schließt man). Fehlt die Werkzeugleiste, bleibt alles bei Obsidian.
  const werkzeugPfeile = () => {
    const ws = app.workspace;
    const ort = app.mobileToolbar && app.mobileToolbar.containerEl;
    if (!ort || typeof ort.insertBefore !== "function") return;
    const gruppe = document.createElement("div");
    gruppe.className = "mobile-toolbar-floating-options mod-raised eba-nav-werkzeug";
    const verlauf = () => (ws.activeLeaf && ws.activeLeaf.history) || null;
    const knopf = (name, d, text, schritt) => {
      const k = document.createElement("div");
      k.className = "mobile-toolbar-option";
      k.setAttribute("role", "button");
      k.setAttribute("aria-label", text);
      k.appendChild(symbol(name, [["path", { d }]]));
      k.addEventListener("mousedown", (e) => e.preventDefault());
      k.addEventListener("click", (e) => {
        e.preventDefault();
        const v = verlauf();
        if (v && typeof v.go === "function") Promise.resolve(v.go(schritt)).catch((x) => console.error("seitenleiste: ‹ ›", x));
      });
      gruppe.appendChild(k);
      return k;
    };
    const zurueck = knopf("lucide-chevron-left", "m15 18-6-6 6-6", "Zurück", -1);
    const vor = knopf("lucide-chevron-right", "m9 18 6-6-6-6", "Vor", 1);
    const stand = () => {
      const v = verlauf();
      zurueck.setAttribute("aria-disabled", String(!(v && v.backHistory && v.backHistory.length)));
      vor.setAttribute("aria-disabled", String(!(v && v.forwardHistory && v.forwardHistory.length)));
    };
    stand();
    ort.insertBefore(gruppe, ort.firstChild);
    ctx.an(ws, "file-open", stand);
    ctx.an(ws, "active-leaf-change", stand);
    ctx.aufraeumen(() => gruppe.remove());
  };

  // iPad: Abstand der Hauptfläche (rootSplit) vom rechten Fensterrand als --eba-haupt-rechts an body; eba-core.css 66 rückt
  // Obsidians Leiste um so viel nach links. Eine angeheftete rechte Seitenleiste lag sonst über der Leiste, ≡ und Zahnrad waren
  // nicht zu erreichen (bis 27.10.2026). Neu bei jeder Größenänderung der Hauptfläche (ResizeObserver: Anheften, Lösen, Ziehen,
  // Drehen) und nach layout-change, dann auch an einer neuen Hauptfläche. Ohne ResizeObserver bleibt die Leiste in der Ecke.
  // Auf allen mobilen Geräten, nicht nur, wenn Obsidian beim Start als iPad zählt: Obsidian entscheidet iPhone- oder iPad-Ansicht
  // laufend nach der Fenstergröße (Split View, unter 600 px iPhone-Ansicht); begann ein iPad schmal, fehlte die Variable sonst
  // nach dem Verbreitern (bis 27.10.2026). Die Regel in eba-core.css 66 gilt nur mit body.is-tablet.
  const hauptRechts = () => {
    const ws = app.workspace;
    if (typeof ResizeObserver !== "function") return;
    let haupt = null;
    const setzen = () => {
      const h = ws.rootSplit && ws.rootSplit.containerEl;
      if (!h) return;
      if (h !== haupt) { if (haupt) ro.unobserve(haupt); haupt = h; ro.observe(h); }
      const abstand = Math.max(0, Math.round(window.innerWidth - h.getBoundingClientRect().right));
      document.body.style.setProperty("--eba-haupt-rechts", abstand + "px");
    };
    const ro = new ResizeObserver(() => setzen());
    setzen();
    ctx.an(ws, "layout-change", setzen);
    ctx.dom(window, "resize", setzen);
    ctx.aufraeumen(() => { ro.disconnect(); document.body.style.removeProperty("--eba-haupt-rechts"); });
  };

  // PC: eigene Leiste unten rechts mit denselben sieben Knöpfen wie auf iPhone und iPad, im Aussehen von Obsidians Leiste dort
  // (eba-core.css 66, .eba-nav-leiste; seit 27.10.2026, Rückmeldung: „iPad und iPhone und pc die gleichen 7 Symbole“, bis dahin
  // nur Zahnrad und ≡): Zurück, Vor, Suche, „+“, Zahnrad, Tabs, ≡. Sie tun, was Obsidians Knöpfe auf iPhone und iPad tun: Zurück
  // und Vor gehen im Verlauf des Tabs vorn in der Hauptfläche (history.go; ohne Verlauf ausgegraut, aria-disabled, ein Klick tut
  // dann nichts), Suche öffnet Obsidians Schnellwechsler, „+“ einen neuen Tab (workspace:new-tab), Tabs zeigt die offenen Tabs
  // zum Wechseln. Obsidian am PC hat keine Tab-Übersicht wie auf dem iPhone; nächstes Gleiches ist sein Menü hinter ⌄ in der
  // Tab-Leiste: dasselbe Menü (Name, Symbol, Haken am offenen), aber mit allen Tabs der Hauptfläche, über dem Knopf. Die Zahl
  // im Rahmen zählt sie wie auf dem iPhone (iterateRootLeaves), neu bei jedem layout-change. Obsidians eigene Zurück und Vor
  // (Kopfleiste) und „+“ (Tab-Leiste) blendet eba-core.css 66 am PC aus, solange das Plugin läuft. Die Knöpfe sind Obsidians
  // clickable-icon, mit der Tastatur erreichbar (Tab, Enter, Leertaste). Die Klassen eba-nav-zahnrad und eba-nav-seiten findet
  // der Rundgang (rundgang.js).
  // Sie hängt in der Hauptfläche (rootSplit, bei Obsidian position: relative), unten rechts in ihr: So folgt sie der rechten
  // Seitenleiste beim Öffnen, Schließen und Ziehen und liegt nie über ihr (seit 27.10.2026; vorher in der Fensterecke, über
  // dem Inhalt der Seitenleiste). Ersetzt Obsidian die Hauptfläche (ein anderes Layout, etwa mit dem Kern-Plugin
  // „Arbeitsbereiche“), zieht sie beim nächsten layout-change mit (einhaengen). Popout-Fenster bekommen keine: Dort steht eine
  // einzelne Notiz, Seiten und Einstellungen öffnet man im Hauptfenster; Obsidians Zurück, Vor und „+“ bleiben dort oben
  // (eba-core.css 66 blendet sie nur in der Hauptfläche mit Leiste aus).
  const pcLeiste = () => {
    const ws = app.workspace;
    const leiste = document.body.createDiv({ cls: "eba-nav-leiste" });
    const einhaengen = () => {
      const haupt = ws.rootSplit && ws.rootSplit.containerEl;
      if (haupt && leiste.parentElement !== haupt) haupt.appendChild(leiste);
    };
    const knopf = (name, teile, text, cls, los) => {
      const k = leiste.createDiv({ cls: "clickable-icon " + cls, attr: { role: "button", tabindex: "0", "aria-label": text } });
      k.appendChild(symbol(name, teile));
      const aus = (e) => { if (k.getAttribute("aria-disabled") !== "true") los(e); };
      k.addEventListener("click", aus);
      k.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aus(e); } });
      return k;
    };
    const verlauf = () => {
      const b = typeof ws.getMostRecentLeaf === "function" ? ws.getMostRecentLeaf(ws.rootSplit) : null;
      return b && b.history && typeof b.history.go === "function" ? b.history : null;
    };
    // Mit der Tastatur bleibt der Fokus danach auf dem Knopf (Obsidian gibt ihn beim Öffnen der Seite dem Tab), so geht es mit
    // Enter gleich noch einen Schritt
    const gehen = (schritt) => (e) => {
      const v = verlauf();
      if (!v) return;
      const fokus = e.type === "keydown" ? e.currentTarget : null;
      Promise.resolve(v.go(schritt)).then(() => { if (fokus && fokus.isConnected) fokus.focus(); }).catch((x) => console.error("seitenleiste: ‹ ›", x));
    };
    const zurueck = knopf("lucide-chevron-left", ZURUECK_SVG, "Zurück", "eba-nav-zurueck", gehen(-1));
    const vor = knopf("lucide-chevron-right", VOR_SVG, "Vor", "eba-nav-vor", gehen(1));
    knopf("lucide-search", SUCHE_SVG, "Suche", "eba-nav-suche", () => {
      const s = app.internalPlugins && app.internalPlugins.getPluginById("switcher");
      if (s && s.instance && typeof s.instance.onOpen === "function") s.instance.onOpen();
    });
    knopf("lucide-plus", PLUS_SVG, "Neuer Tab", "eba-nav-neu", () => app.commands.executeCommandById("workspace:new-tab"));
    zahnrad = knopf("lucide-settings", ZAHNRAD_SVG, EINSTELLUNGEN, ZAHNRAD, (e) => {
      const datei = app.metadataCache.getFirstLinkpathDest(EINSTELLUNGEN, "");
      if (datei) tippen(e, datei).catch((x) => console.error("seitenleiste: Einstellungen", x));
    });
    // Tabs: Obsidians Menü über dem Knopf, rechts bündig mit ihm und 8 px über der Leiste (wie das Menü hinter ≡); ein zweiter
    // Klick bei offenem Menü öffnet es nicht noch einmal (Obsidian schließt es mit dem Klick daneben)
    const tabs = knopf("tab-frame", TABS_SVG, "Tabs", "eba-nav-tabs", () => {
      const { Menu } = ctx.obsidian;
      if (typeof Menu !== "function" || tabs.classList.contains("has-active-menu")) return;
      const m = new Menu(), vorne = ws.getMostRecentLeaf(ws.rootSplit);
      ws.iterateRootLeaves((b) => {
        const v = b.view;
        if (v) m.addItem((i) => i.setTitle(v.getDisplayText()).setIcon(v.getIcon()).setChecked(b === vorne).onClick(() => ws.setActiveLeaf(b, { focus: true })));
      });
      m.setParentElement(tabs);
      const k = tabs.getBoundingClientRect(), l = leiste.getBoundingClientRect();
      m.showAtPosition({ x: k.left, y: l.top - 10, width: k.width, overlap: true, left: true });
      // Hat es unter dem Punkt Platz, legt Obsidian es darunter, über die Leiste; dieses gehört darüber (nicht bei Obsidians
      // Einstellung „Native Menüs“, die zeigt das System)
      const d = m.dom;
      if (d && d.isConnected && d.offsetHeight) d.style.top = Math.max(8, l.top - 8 - d.offsetHeight) + "px";
    });
    const zahl = tabs.createDiv({ cls: "eba-nav-tabs-zahl" });
    knopf("lucide-menu", MENUE_SVG, "Seiten", "eba-nav-seiten", (e) => { e.preventDefault(); menueAuf(leiste, e.type === "keydown"); });
    const stand = () => {
      const v = verlauf();
      zurueck.setAttribute("aria-disabled", String(!(v && v.backHistory && v.backHistory.length)));
      vor.setAttribute("aria-disabled", String(!(v && v.forwardHistory && v.forwardHistory.length)));
      let n = 0;
      if (typeof ws.iterateRootLeaves === "function") ws.iterateRootLeaves(() => { n += 1; });
      zahl.setText(String(n));
      tabs.setAttribute("aria-label", "Tabs, " + n + " offen");
    };
    einhaengen();
    stand();
    ctx.an(ws, "layout-change", () => { einhaengen(); stand(); });
    ctx.an(ws, "file-open", stand);
    ctx.an(ws, "active-leaf-change", stand);
    ctx.aufraeumen(() => { leiste.remove(); zahnrad = null; });
  };

  // ---------- Wischen nach rechts: zurück; Herunterziehen: nichts (iPhone und iPad) ----------
  // Umhüllt workspace.trigger an der Instanz (Obsidian schlägt es bei jeder Geste neu nach): Eine Geste, mit der Obsidian die
  // linke Seitenleiste aufzöge (zurueckGeste), erreicht Obsidians Hörer nicht. Für sie täte sonst keiner etwas: Herunterziehen
  // will senkrecht, Zurück und Vor mit zwei Fingern zwei Finger, die rechte Seitenleiste die andere Richtung. Beginnt sie in der
  // Hauptfläche (rootSplit, wie Obsidians Zurück mit zwei Fingern) und am Rand (amRand), geht es beim Loslassen zurück, wenn sie
  // weit genug war (zurueckWeit), auf demselben Weg wie ‹: history.go(-1) des aktiven Tabs; weiter innen tut sie nichts. Ist die
  // Seitenleiste angeheftet (iPad), liegt sie am Rand, nicht die Hauptfläche: Dann geht es mit ‹ zurück.
  // Nur vom Rand rutscht Obsidians Hinweis herein (hinweisAuf, hinweisLage) und ist nach dem Loslassen, Abbrechen und Abmelden weg.
  // Ebenso erreicht Herunterziehen in der Hauptfläche (herunterGeste) Obsidian nicht: kein Hinweis, keine Schnellaktion. Außer ihr
  // täte dafür keiner etwas (die Seitenleisten und zwei Finger wollen waagerecht), und Scrollen geht weiter, denn Obsidian meldet
  // eine Geste nur, wenn die Seite in diese Richtung nicht mehr scrollen kann. Obsidians Einstellung bleibt, wie sie ist.
  // Fehlt trigger, rootSplit oder history.go oder geht beim Entscheiden etwas schief, bleibt alles bei Obsidian. Abmelden gibt
  // trigger zurück; hat jemand es danach noch einmal umhüllt, bleibt dessen Hülle, und diese reicht nur noch durch.
  const wischenUebernehmen = () => {
    const ws = app.workspace;
    if (!ws || typeof ws.trigger !== "function") return;
    const eigen = Object.prototype.hasOwnProperty.call(ws, "trigger");
    const alt = ws.trigger;
    let an = true;
    const zu = (s) => !!s && (s.collapsed === true || s.isPinned === true);
    const px = (name) => parseFloat(getComputedStyle(document.body).getPropertyValue(name)) || 0;
    const lage = () => {
      const richtung = document.body.classList.contains("mod-rtl") ? -1 : 1;
      return {
        bereit: ws.layoutReady, richtung, linksZu: zu(ws.leftSplit), rechtsZu: zu(ws.rightSplit), phone: Platform.isPhone,
        hoehe: window.innerHeight, breite: window.innerWidth, unten: px("--safe-area-inset-bottom"),
        sicher: px(richtung === 1 ? "--safe-area-inset-left" : "--safe-area-inset-right"),
      };
    };
    const verlauf = () => {
      const b = ws.activeLeaf;
      return b && b.history && typeof b.history.go === "function" ? b.history : null;
    };
    // Obsidians Hinweis für eine Geste in richtung o (1: von links): wie bei Zurück mit zwei Fingern ein div an body, an der Kante,
    // mit dem Text „Zurück“. Obsidian schreibt dort den Namen des Befehls app:go-back in seiner Sprache, auf einem englischen
    // Obsidian „Navigate back“; das Plugin ist deutsch (Rückmeldung vom 27.10.2026: „Ganze app ist deutsch. Zurück anstatt navigate
    // back“). Fehlt createDiv, gibt es keinen, zurück geht es trotzdem. offen:
    // die Hinweise, die gerade dastehen (beim Abmelden weg); zwei, wenn eine Geste beginnt, während der letzte noch hinausgleitet.
    const offen = new Set();
    const hinweisAuf = (o) => {
      if (typeof document.body.createDiv !== "function") return null;
      const el = document.body.createDiv({ cls: "pull-action pull-out-action", text: "Zurück" });
      let uhr = null, vibriert = false;
      const h = {
        weg() {
          ctx.stopp(uhr);
          uhr = null;
          el.remove();
          offen.delete(h);
        },
        // Mit dem Finger, wie Obsidians move; einmal kurz vibrieren, sobald er aktiv wird (wo das Gerät es kann)
        bewegen(weg) {
          const l = hinweisLage(weg, o, h.breite);
          el.toggleClass("mod-activated", l.aktiv);
          el.style.transform = "translateX(" + l.x + "px)";
          if (!l.aktiv || vibriert) return;
          vibriert = true;
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(100);
        },
        // Beim Loslassen hinausgleiten, danach weg, wie Obsidians finish: von der Stelle aus, im nächsten Takt der Übergang
        // (ease-in-out), weg nach transitionend, spätestens 50 ms nach seinem Ende
        ausblenden(weg) {
          const l = hinweisLage(weg, o, h.breite);
          el.style.transform = "translateX(" + l.x + "px)";
          uhr = ctx.zeit(() => {
            el.getBoundingClientRect();
            el.style.transition = "all " + l.dauer + "ms ease-in-out";
            el.style.transitionProperty = "transform";
            el.style.transform = "translateX(" + l.ende + "px)";
            el.addEventListener("transitionend", (e) => { if (e.target === el) h.weg(); });
            uhr = ctx.zeit(h.weg, l.dauer + 50);
          }, 0);
        },
      };
      try {
        el.style[o === 1 ? "left" : "right"] = "0";
        h.breite = el.offsetWidth;
      } catch (e) {
        el.remove();
        throw e;
      }
      offen.add(h);
      return h;
    };
    // Ein Fehler im Hinweis stört das Zurück nicht; der Hinweis ist dann weg
    const sicher = (h, f) => {
      if (!h) return;
      try { f(); } catch (e) {
        console.error("seitenleiste: Hinweis", e);
        try { h.weg(); } catch (x) { /* schon weg */ }
      }
    };
    // Übernimmt g, wenn Obsidian damit die linke Seitenleiste aufzöge oder seine Schnellaktion ausführte; true: Obsidians Hörer
    // bekommen die Geste nicht
    const uebernehmen = (g) => {
      const haupt = ws.rootSplit && ws.rootSplit.containerEl;
      if (!haupt) return false;
      const z = lage();
      if (herunterGeste(g, z)) return haupt.contains(g.targetEl);
      if (!verlauf() || !zurueckGeste(g, z)) return false;
      if (haupt.contains(g.targetEl) && amRand(g.startX, z)) {
        let h = null;
        try { h = hinweisAuf(z.richtung); } catch (e) { console.error("seitenleiste: Hinweis", e); }
        const weg = (x) => (x - g.startX) * z.richtung;
        try {
          g.registerCallback({
            // Nach dem Abmelden tut eine Geste, die noch läuft, nichts mehr (ihr Hinweis ist schon weg)
            move: (x) => { if (an) sicher(h, () => h.bewegen(weg(x))); },
            cancel: () => sicher(h, () => h.weg()),
            finish: (x, y, schwung) => {
              if (!an) return;
              sicher(h, () => h.ausblenden(weg(x)));
              const v = verlauf();
              if (v && zurueckWeit(weg(x), schwung * z.richtung)) {
                Promise.resolve(v.go(-1)).catch((e) => console.error("seitenleiste: zurück", e));
              }
            },
          });
        } catch (e) {
          sicher(h, () => h.weg());
          throw e;
        }
      }
      return true;
    };
    // Geht dabei etwas schief, bekommt Obsidian die Geste wie immer
    const unser = function (...a) {
      let selbst = false;
      if (an && a[0] === "swipe") {
        try { selbst = uebernehmen(a[1]); } catch (e) { console.error("seitenleiste: Wischen", e); }
      }
      return selbst ? undefined : alt.apply(this, a);
    };
    ws.trigger = unser;
    ctx.aufraeumen(() => {
      an = false;
      for (const h of Array.from(offen)) h.weg();
      if (ws.trigger !== unser) return;
      if (eigen) ws.trigger = alt; else delete ws.trigger;
    });
  };

  // ---------- iPhone: am Seitenende die Leiste zeigen (amEnde) ----------
  // Hört im Einfangen am Dokument (scroll steigt nicht auf) auf die Scrollflächen der Lese- und der Bearbeitungsansicht. Ob
  // Obsidian die Leiste verborgen hat (is-hidden-nav, das gibt es nur auf dem iPhone), prüft erst der entprellte Rückruf: Im
  // Einfangen kommt das Skript vor Obsidians eigenem Hörer an der Scrollfläche, der sie im selben Ereignis verbirgt. Mit der
  // Prüfung schon beim Ereignis blieb sie nach einem einzigen Sprung ans Ende (Link zu einer Überschrift, ein langer Schritt)
  // verborgen (bis 27.10.2026). Gezeigt wird sie mit Obsidians eigenem restoreNavigation, wie nach einem Tipp; scrollt man
  // wieder nach unten, blendet Obsidian sie wie immer aus. Fehlt restoreNavigation, bleibt alles bei Obsidian.
  // Auf allen mobilen Geräten: Ob die Leiste beim Scrollen verschwindet, entscheidet Obsidian laufend (hideNavigation nur in der
  // iPhone-Ansicht, auch auf einem iPad im schmalen Split View); bis 27.10.2026 nur, wenn Obsidian beim Start als iPhone zählte.
  const leisteAmEnde = () => {
    const n = app.mobileNavbar;
    if (!n || typeof n.restoreNavigation !== "function") return;
    const verborgen = () => document.body.classList.contains("is-hidden-nav");
    const pruefen = ctx.entprellen((s) => { if (verborgen() && s.isConnected && amEnde(s)) n.restoreNavigation(); }, ENDE_RUHE);
    ctx.dom(document, "scroll", (e) => {
      const s = e.target;
      if (s && s.classList && (s.classList.contains("markdown-preview-view") || s.classList.contains("cm-scroller"))) pruefen(s);
    }, { capture: true, passive: true });
  };

  // ---------- Tab aus früheren Fassungen ----------
  const ansichten = new Set();
  const allesNeu = () => {
    for (const v of ansichten) { try { zeichnen(v.contentEl); } catch (e) { console.error("seitenleiste", e); } }
    if (menue) { try { zeichnen(menue.el, menueOhne()); } catch (e) { console.error("seitenleiste: Menü", e); } }
  };

  class Uebersicht extends ItemView {
    getViewType() { return TYP; }
    getDisplayText() { return "Übersicht"; }
    getIcon() { return eigenesSymbol ? SYMBOL : "layout-grid"; }
    async onOpen() { ansichten.add(this); zeichnen(this.contentEl); }
    async onClose() { ansichten.delete(this); }
  }

  // Kein Tab „Übersicht“ mehr (die Seiten stehen im Menü unten rechts). Mit ihm schließt sich die linke Seitenleiste, sonst bliebe
  // dort eine Leiste mit Dateien stehen: auf dem iPad, wenn sie angeheftet war, über Obsidians Befehl (löst und schließt sie), am
  // PC über collapse(). Danach öffnet Obsidian sie wie gewohnt: am PC der Umschalter, auf iPhone und iPad Einstellungen & Hilfe →
  // Obsidian → Dateien und Obsidians Befehle (Wischen vom linken Rand geht dort seit 26.10.2026 zurück, weiter innen tut Wischen
  // nach rechts nichts; wischenUebernehmen).
  const entfernen = () => {
    const da = app.workspace.getLeavesOfType(TYP);
    if (!da.length) return;
    for (const b of da) b.detach();
    const schublade = document.querySelector(".workspace-drawer.mod-left");
    const links = app.workspace.leftSplit;
    if (schublade && schublade.classList.contains("is-pinned")) app.commands.executeCommandById("app:toggle-left-sidebar");
    else if (!Platform.isMobile && links && !links.collapsed) links.collapse();
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
      // Ein offenes Menü ist beim Abmelden weg, auf jedem Gerät (am PC blieben sonst Menü und die durchsichtige Fläche über dem
      // ganzen Fenster stehen)
      ctx.aufraeumen(menueZu);
      ctx.dom(document, "keydown", taste, true);
      // Drehen, geteiltes Fenster auf dem iPad, ein schmaleres Fenster am PC: Das Menü stand an der alten Lage der Leiste, nach dem
      // Drehen des iPhones über dem oberen Rand und nicht mehr erreichbar (bis 27.10.2026). Es schließt sich; ein Tipp auf ≡
      // öffnet es an der neuen Stelle.
      ctx.dom(window, "resize", menueZu);
      if (Platform.isMobile) {
        navbarUebernehmen();
        zahnradEinsetzen();
        werkzeugPfeile();
        hauptRechts();
        wischenUebernehmen();
        leisteAmEnde();
      } else {
        pcLeiste();
      }
      // Nach dem Anmelden baut Obsidian vorhandene Tabs neu auf; erst danach entfernen
      ctx.zeit(entfernen, 1500);
    },
  };
};
module.exports.TYP = TYP;
module.exports.SYMBOL = SYMBOL;
module.exports.SYMBOL_SVG = SYMBOL_SVG;
module.exports.ZIELE = ZIELE;
module.exports.IN_ENTWICKLUNG = IN_ENTWICKLUNG;
module.exports.sichtbareZiele = sichtbareZiele;
module.exports.moduleJetzt = moduleJetzt;
module.exports.menueLage = menueLage;
module.exports.zurueckGeste = zurueckGeste;
module.exports.amRand = amRand;
module.exports.ZURUECK_RAND = ZURUECK_RAND;
module.exports.zurueckWeit = zurueckWeit;
module.exports.hinweisLage = hinweisLage;
module.exports.herunterGeste = herunterGeste;
module.exports.amEnde = amEnde;
module.exports.ENDE_REST = ENDE_REST;
module.exports.ENDE_RUHE = ENDE_RUHE;
module.exports.WISCH_MIN = WISCH_MIN;
module.exports.WISCH_WEIT = WISCH_WEIT;
module.exports.RAND = RAND;
module.exports.MIN_HOEHE = MIN_HOEHE;
