// Menü „Übersicht“ (bis 0.4.5 „Bereiche“, Bedien-Baustein „Start“ seit 0.4.6): ein Symbol oben in Obsidians Kopfleiste JEDER Notiz,
// auf allen Geräten (view-actions, leaf.view.addAction), öffnet eine Tafel mit allen Seiten; „Dashboard“ darin ist der Weg zurück
// zum Start. Bis 0.4.5 stand das Symbol am PC nur im Seitenkopf der eba-Seiten (Termin-, Begleit- und eigene Notizen hatten keins).
// Die Ziele stehen nur hier (ZIELE, einzige Quelle; die Lesezeichen der Vorlage folgen ihnen, tests/menue.test.js).
// Antippen öffnet, erneutes Tippen, ein Tipp daneben, Esc, Scrollen der Seite oder Tab-/Dateiwechsel schließt. Ein Ziel öffnet im
// selben Tab (ctx.oeffnen), Zurück führt zurück; Strg/⌘ öffnet einen neuen Tab. Schreibt keine Datei.
// Icons der Kacheln kommen aus eba-core.css (Kacheln > [!eba-nav], li:has(> a[data-href$=…])), deshalb ist die Tafel ein eba-nav-Callout.
// Ereignisse laufen über die Helfer in ctx; abmelden() entfernt Symbole, Stil und die offene Tafel, damit beim Hot-Reload die neue
// Fassung alles neu einsetzt. Kein Node-API (läuft auf iOS).
// Einzige Liste der Seiten (Reihenfolge = Kacheln, zwei je Reihe). Neue Seite: Notizname hier eintragen.
// Lernplan nur, wenn es Lernplan-Notizen gibt (die schreibt nur eine KI, lernplan.js sichtbar()).
const ZIELE = ["Dashboard", "Stundenplan", "Studienverlauf", "Termine & Anmeldungen", "Prüfungen", "Noten & ECTS", "Unterlagen",
  "Lernplan", "Karteikarten", "Kontakte & Links", "Einstellungen & Hilfe"];
module.exports = function (ctx) {
  const app = window.app;
  const NUR_WENN = { Lernplan: () => !!(ctx.lernplan && ctx.lernplan.sichtbar()) };

  // Symbol als eigenes SVG (Lucide „layout-grid“), nicht über setIcon: auf dem iPad blieb der Knopf damit ein leerer
  // Kasten. Farbe/Strich als Attribute (currentColor), damit es ohne Obsidians .svg-icon-Regeln sichtbar ist.
  const symbol = (el) => {
    for (const alt of el.querySelectorAll("svg")) alt.remove();
    const NS = "http://www.w3.org/2000/svg";
    const svg = el.ownerDocument.createElementNS(NS, "svg");
    for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: "18", height: "18", fill: "none", stroke: "currentColor",
      "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", class: "svg-icon lucide-layout-grid eba-menue-symbol", "aria-hidden": "true" })) svg.setAttribute(k, v);
    for (const [x, y] of [[3, 3], [14, 3], [14, 14], [3, 14]]) {
      const r = el.ownerDocument.createElementNS(NS, "rect");
      for (const [k, v] of Object.entries({ x, y, width: 7, height: 7, rx: 1 })) r.setAttribute(k, String(v));
      svg.appendChild(r);
    }
    el.appendChild(svg);
  };

  const STIL = `
.eba-kz-kopf > .eba-kz-datum { margin-left: auto; }
.view-action.eba-menue-aktion.offen { color: var(--interactive-accent); }
.eba-menue-tafel { position: fixed; z-index: var(--layer-popover, 30); box-sizing: border-box; margin: 0 !important; overflow-y: auto;
  overscroll-behavior: contain; padding: 10px !important; box-shadow: var(--eba-shadow, none) !important;
  border-color: var(--eba-border-strong, var(--background-modifier-border)) !important;
  background: var(--eba-card-bg, var(--background-primary)) !important; }
.eba-menue-tafel > .callout-content > ul { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 6px !important; }
.eba-menue-tafel > .callout-content > ul > li { grid-template-columns: 22px minmax(0, 1fr) !important; column-gap: 8px !important; min-height: 44px !important; padding: 5px 9px !important; cursor: pointer; }
.eba-menue-tafel > .callout-content > ul > li::before { width: 22px !important; height: 22px !important; }
.eba-menue-tafel > .callout-content > ul > li::after { left: 13px !important; width: 14px !important; height: 14px !important; margin-top: -7px !important; }
.eba-menue-tafel > .callout-content > ul > li > a { font-size: 13.5px; line-height: 1.25; white-space: normal !important; }
.eba-menue-tafel > .callout-content > ul > li.aktiv { border-color: color-mix(in srgb, var(--eba-accent) 55%, var(--eba-border)); }
`;

  const blattVon = (el) => {
    let b = null;
    app.workspace.iterateAllLeaves((l) => { if (!b && l.view?.containerEl?.contains(el)) b = l; });
    return b || app.workspace.getMostRecentLeaf();
  };

  let offen = null; // { knopf, tafel, lauscher } der offenen Tafel
  const schliessen = () => {
    const z = offen; if (!z) return;
    offen = null;
    z.tafel.remove(); z.knopf.classList.remove("offen"); z.knopf.setAttribute("aria-expanded", "false");
    for (const [t, n, fn] of z.lauscher) t.removeEventListener(n, fn, true);
  };

  const oeffnen = (knopf) => {
    if (offen?.knopf === knopf) { schliessen(); return; }
    schliessen();
    const doc = knopf.ownerDocument, win = doc.defaultView;
    const blatt = blattVon(knopf);
    const quelle = blatt?.view?.file?.path || "";
    const tafel = doc.body.createDiv({ cls: "callout eba-menue-tafel", attr: { "data-callout": "eba-nav", role: "menu" } });
    const ul = tafel.createDiv({ cls: "callout-content" }).createEl("ul");
    for (const ziel of ZIELE) {
      if (NUR_WENN[ziel] && !NUR_WENN[ziel]()) continue;
      const datei = app.metadataCache.getFirstLinkpathDest(ziel, quelle);
      const li = ul.createEl("li", { cls: datei && datei.path === quelle ? "aktiv" : "" });
      li.createEl("a", { cls: "internal-link", text: ziel, attr: { "data-href": ziel, href: ziel, role: "menuitem" } });
      li.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation(); schliessen();
        if (!datei) return;
        await ctx.oeffnen(datei, { neu: e.ctrlKey || e.metaKey, von: knopf }); // im Tab, in dem du das Menü geöffnet hast
      });
    }
    // Lage: unter dem Symbol, rechtsbündig, im Fenster (iPhone 390 px: 8 px Rand, volle Breite)
    const r = knopf.getBoundingClientRect(), vw = win.innerWidth, vh = win.innerHeight;
    const breite = Math.min(420, vw - 16);
    tafel.style.width = breite + "px";
    tafel.style.left = Math.max(8, Math.min(r.right - breite, vw - breite - 8)) + "px";
    tafel.style.top = Math.round(r.bottom + 6) + "px";
    tafel.style.maxHeight = Math.max(160, vh - r.bottom - 14) + "px";
    knopf.classList.add("offen"); knopf.setAttribute("aria-expanded", "true");
    const seit = Date.now();
    // pointerdown auf dem Symbol selbst schließt nicht (sonst schlösse der Tipp und der folgende click öffnete wieder)
    const ausserhalb = (e) => { if (!tafel.contains(e.target) && !knopf.contains(e.target)) schliessen(); };
    const taste = (e) => { if (e.key === "Escape") schliessen(); };
    // Scrollen der Seite schließt; nicht in den ersten 400 ms (iOS: Ausrollen nach dem Wischen) und nicht in der Tafel
    const scroll = (e) => { if (Date.now() - seit > 400 && !tafel.contains(e.target)) schliessen(); };
    const lauscher = [[doc, "pointerdown", ausserhalb], [doc, "keydown", taste], [doc, "scroll", scroll], [win, "resize", schliessen]];
    for (const [t, n, fn] of lauscher) t.addEventListener(n, fn, true);
    offen = { knopf, tafel, lauscher };
  };

  // Kopfleiste (view-actions) jeder Markdown-Ansicht, auf allen Geräten; ein Symbol je Ansicht, links neben Buch/Stift und „…“
  const aktionFuer = (leaf) => {
    const v = leaf?.view;
    if (!v || v.getViewType?.() !== "markdown" || typeof v.addAction !== "function") return;
    if (v.containerEl.querySelector(".view-actions .eba-menue-aktion")) return;
    const el = v.addAction("layout-grid", "Übersicht", () => oeffnen(el));
    el.addClass("eba-menue-aktion");
    symbol(el); // eigenes SVG, unabhängig von Obsidians Icon-Satz
    el.setAttribute("aria-haspopup", "menu"); el.setAttribute("aria-expanded", "false");
  };
  const aktionen = () => {
    app.workspace.iterateAllLeaves((l) => { try { aktionFuer(l); } catch (e) { /* nächste Ansicht */ } });
  };

  const stil = (doc) => {
    let s = doc.getElementById("eba-menue-stil");
    if (!s) { s = doc.createElement("style"); s.id = "eba-menue-stil"; doc.head.appendChild(s); }
    if (s.textContent !== STIL) s.textContent = STIL;
  };

  // Je Fenster (Hauptfenster und Popouts) der Stil der Tafel
  const docs = () => {
    const d = new Set([document]);
    app.workspace.iterateAllLeaves((l) => { const x = l.view?.containerEl?.ownerDocument; if (x) d.add(x); });
    return d;
  };

  return {
    registrieren() {
      for (const d of docs()) stil(d);
      const ws = app.workspace;
      ctx.an(ws, "window-open", (ww) => ctx.zeit(() => { if (ww.doc && ww.doc.head) stil(ww.doc); }, 300));
      ctx.an(ws, "layout-change", () => { schliessen(); aktionen(); });
      ctx.an(ws, "active-leaf-change", () => aktionen());
      ctx.an(ws, "file-open", () => schliessen());
      aktionen();
    },
    // Hot-Reload/Entladen: Tafel schließen, Symbole dieser Fassung entfernen (die neue setzt eigene ein); auch Knöpfe im
    // Seitenkopf aus Fassungen bis 0.4.5
    abmelden() {
      schliessen();
      for (const d of docs()) { try { for (const k of d.querySelectorAll(".eba-menue-knopf, .view-action.eba-menue-aktion")) k.remove(); } catch (e) { /* weg */ } }
    },
  };
};
module.exports.ZIELE = ZIELE;
