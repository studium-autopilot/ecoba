// Bereiche-Menü: ein Symbol oben auf der Seite öffnet eine Tafel mit allen Bereichen, statt bis ans Seitenende scrollen
// zu müssen. Die Ziele stehen nur hier (ZIELE, einzige Quelle).
// Symbol „layout-grid“ an genau einer Stelle je Gerät, es öffnet die Kachel-Tafel (Dashboard + alle Bereiche):
//  - am PC im Kopf jeder eba-Seite: rechts im Pfad der Unterseiten (.eba-pfad) und in der Gruß-Zeile des Dashboards
//    (.eba-kz-kopf); kostet keine Höhe (Symbol in vorhandener Zeile).
//  - auf iPhone/iPad nur in Obsidians Kopfleiste jeder Notiz (view-actions, leaf.view.addAction): immer oben sichtbar,
//    auch weit unten auf der Seite und auf Notizen ohne Pfad (Termin-Notizen, Begleitnotizen, Mitschriften). Nicht zusätzlich
//    im Seitenkopf, sonst steht es dort zweimal untereinander.
// Antippen öffnet, erneutes Tippen, ein Tipp daneben, Esc, Scrollen der Seite oder Tab-/Dateiwechsel schließt. Schreibt keine Datei.
// Icons der Kacheln kommen aus eba-core.css (Kacheln > [!eba-nav], li:has(> a[data-href$=…])), deshalb ist die Tafel ein eba-nav-Callout.
// Lese- und Bearbeitungsansicht, alle Geräte: Post-Processor (Leseansicht) + MutationObserver je Fenster (Bases-HTML im
// Dashboard-Kopf und Live Preview werden ohne Post-Processor gezeichnet). Post-Processor, Ereignisse und Beobachter laufen über
// die Helfer in ctx; abmelden() entfernt Beobachter, Knöpfe und die offene Tafel, damit beim Hot-Reload die neue Fassung
// alles neu einsetzt. Kein Node-API (läuft auf iOS).
module.exports = function (ctx) {
  const app = window.app;
  const { Platform } = ctx.obsidian;
  // Einzige Liste der Bereiche (Reihenfolge = Kacheln, zwei je Reihe). Neuer Bereich: Notizname hier eintragen.
  // Lernplan nur, wenn es Lernplan-Notizen gibt (die schreibt nur eine KI, lernplan.js sichtbar()).
  const ZIELE = ["Dashboard", "Studienverlauf", "Termine & Anmeldungen", "Prüfungen", "Noten & ECTS", "Unterlagen",
    "Lernplan", "Karteikarten", "Kontakte & Links", "Einstellungen & Hilfe"];
  const NUR_WENN = { Lernplan: () => !!(ctx.lernplan && ctx.lernplan.sichtbar()) };
  const ZIELE_SEL = ".eba-pfad:not(.eba-pfad-start), .eba-kz-kopf";
  // Symbol in Obsidians Kopfleiste statt im Seitenkopf: iPhone und iPad (am PC zum Ausprobieren über window.ebaMenueKopfImmer)
  const imKopf = () => Platform.isMobile || window.ebaMenueKopfImmer === true;

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
button.eba-menue-knopf { display: inline-flex; align-items: center; justify-content: center; flex: none; box-sizing: border-box;
  width: 34px; height: 30px; margin: -7px 0 -7px auto; padding: 0; border: 1px solid var(--eba-border); border-radius: var(--eba-radius-s, 6px);
  background: var(--eba-card-bg, var(--background-primary)); color: var(--eba-muted); box-shadow: none; cursor: pointer;
  touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
button.eba-menue-knopf:hover, button.eba-menue-knopf.offen { color: var(--eba-accent-text); border-color: color-mix(in srgb, var(--eba-accent) 55%, var(--eba-border)); }
button.eba-menue-knopf > svg.eba-menue-symbol { display: block; flex: none; width: 17px; height: 17px; stroke: currentColor; stroke-width: 1.9; fill: none; opacity: 1; visibility: visible; }
.eba .eba-pfad > button.eba-menue-knopf::before { content: none; display: none; }
button.eba-menue-knopf { position: relative; z-index: 3; }
/* Bearbeitungsansicht: Obsidians Knopf „Block bearbeiten“ (</>) lag genau über dem Symbol und fing den Tipp ab (Quelltext statt Menü) */
.markdown-source-view.is-live-preview .cm-html-embed:has(.eba-menue-knopf) .edit-block-button { display: none; }
/* Bearbeitungsansicht: der HTML-Block schneidet über- und unterstehende Teile ab, deshalb dort ohne negativen Rand */
.markdown-source-view.is-live-preview .eba-pfad > button.eba-menue-knopf { margin-top: 0; margin-bottom: 0; }
.eba-kz-kopf > .eba-kz-datum { margin-left: auto; }
.eba-kz-kopf > button.eba-menue-knopf { margin: 0 0 0 4px; align-self: center; }
@container eba-kz (max-width: 760px) {
  .eba-kz-kopf:has(> button.eba-menue-knopf) { position: relative; padding-right: 42px; }
  .eba-kz-kopf > .eba-kz-datum { margin-left: 0; }
  .eba-kz-kopf > button.eba-menue-knopf { position: absolute; top: 2px; right: 0; width: 36px; height: 32px; }
}
.view-action.eba-menue-aktion.offen { color: var(--interactive-accent); }
.eba-menue-tafel { position: fixed; z-index: var(--layer-popover, 30); box-sizing: border-box; margin: 0 !important; overflow-y: auto;
  overscroll-behavior: contain; padding: 10px !important; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18) !important;
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
        const neu = e.ctrlKey || e.metaKey;
        if (neu || !blatt) await app.workspace.openLinkText(ziel, quelle, neu);
        else await blatt.openFile(datei);
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

  const knopfFuer = (ziel) => {
    const da = ziel.querySelector(":scope > .eba-menue-knopf");
    if (da) { if (!da.querySelector("svg.eba-menue-symbol")) symbol(da); return; } // Knopf einer älteren Fassung: Symbol nachrüsten
    const k = ziel.createEl("button", { cls: "eba-menue-knopf", attr: { type: "button", "aria-label": "Bereiche", "aria-haspopup": "menu", "aria-expanded": "false", title: "Bereiche" } });
    symbol(k);
    // Bearbeitungsansicht: nicht in den Quelltext springen
    k.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
    k.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); oeffnen(k); });
  };

  const einsetzen = (wurzel) => {
    if (imKopf() || !wurzel?.querySelectorAll) return;
    if (wurzel.matches?.(ZIELE_SEL)) knopfFuer(wurzel);
    for (const z of wurzel.querySelectorAll(ZIELE_SEL)) knopfFuer(z);
  };

  // Kopfleiste (view-actions) jeder Markdown-Ansicht; ein Symbol je Ansicht, links neben Buch/Stift und „…“
  const aktionFuer = (leaf) => {
    const v = leaf?.view;
    if (!v || v.getViewType?.() !== "markdown" || typeof v.addAction !== "function") return;
    if (v.containerEl.querySelector(".view-actions .eba-menue-aktion")) return;
    const el = v.addAction("layout-grid", "Bereiche", () => oeffnen(el));
    el.addClass("eba-menue-aktion");
    symbol(el); // gleiches SVG wie im Seitenkopf, unabhängig von Obsidians Icon-Satz
    el.setAttribute("aria-haspopup", "menu"); el.setAttribute("aria-expanded", "false");
  };
  const aktionen = () => {
    if (!imKopf()) return;
    app.workspace.iterateAllLeaves((l) => { try { aktionFuer(l); } catch (e) { /* nächste Ansicht */ } });
  };

  const stil = (doc) => {
    let s = doc.getElementById("eba-menue-stil");
    if (!s) { s = doc.createElement("style"); s.id = "eba-menue-stil"; doc.head.appendChild(s); }
    if (s.textContent !== STIL) s.textContent = STIL;
  };

  // Je Fenster (Hauptfenster und Popouts): Stil + Beobachter, der neu gezeichnete Köpfe ergänzt
  const beobachter = new Map(); // Dokument → MutationObserver (dieser Fassung)
  const beobachten = (doc) => {
    if (!doc?.body) return;
    stil(doc);
    if (beobachter.has(doc)) return;
    let geplant = false;
    const obs = new MutationObserver(() => {
      if (geplant) return; geplant = true;
      ctx.zeit(() => { geplant = false; einsetzen(doc.body); }, 60);
    });
    obs.observe(doc.body, { childList: true, subtree: true });
    beobachter.set(doc, obs);
    einsetzen(doc.body);
  };
  const docs = () => {
    const d = new Set([document]);
    app.workspace.iterateAllLeaves((l) => { const x = l.view?.containerEl?.ownerDocument; if (x) d.add(x); });
    return d;
  };

  return {
    registrieren() {
      for (const d of docs()) { stil(d); beobachten(d); }
      const ws = app.workspace;
      ctx.an(ws, "window-open", (ww) => ctx.zeit(() => beobachten(ww.doc), 300));
      ctx.an(ws, "layout-change", () => { schliessen(); aktionen(); });
      ctx.an(ws, "active-leaf-change", () => aktionen());
      ctx.an(ws, "file-open", () => schliessen());
      ctx.postprozessor((el) => einsetzen(el));
      aktionen();
    },
    // Hot-Reload/Entladen: Tafel schließen, Beobachter trennen, Knöpfe dieser Fassung entfernen (die neue setzt eigene ein)
    abmelden() {
      schliessen();
      for (const obs of beobachter.values()) { try { obs.disconnect(); } catch (e) { /* weg */ } }
      beobachter.clear();
      for (const d of docs()) { try { for (const k of d.querySelectorAll(".eba-menue-knopf, .view-action.eba-menue-aktion")) k.remove(); } catch (e) { /* weg */ } }
    },
  };
};
