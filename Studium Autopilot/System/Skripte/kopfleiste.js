// Kopfleiste: Der Name einer Seite steht einmal (seit 0.7.0). Auf iPad und PC stand er bis 0.6.14 dreimal übereinander: im Tab,
// in Obsidians Kopfleiste und als Titel der Seite. Jetzt gilt auf jedem Gerät, was Obsidian auf dem iPhone schon tut: Zeigt eine
// Notiz ihren Titel im Text (Titel einer Seite, eigene Überschrift „# …“ oder Obsidians Inline-Titel), steht er nicht noch einmal
// in der Kopfleiste. Erst wenn der Titel beim Scrollen oben verschwindet, blendet die Kopfleiste den Namen ein, beim Zurückscrollen
// wieder aus (wie die großen Titel in iOS). So steht der Name in jedem Moment genau einmal auf dem Bildschirm.
// Dieses Skript misst nur und setzt Klassen am Tab (.workspace-leaf-content): eba-titel (die Notiz zeigt oben einen Titel),
// eba-titel-weg (der ist oben aus dem Bild), eba-h1-anfang (die Notiz beginnt mit „# …“, davor nur Eigenschaften und Leerzeilen)
// und eba-h1-oben (ebenso, ohne Eigenschaften); die beiden seit 27.10.2026, aus dem Text im Editor (anfangAus). Was sie bewirken, dazu die Tab-Leiste erst ab dem zweiten Tab: eba-core.css
// Abschnitt 70. PDFs, Canvas, Bases und leere Tabs haben keinen Titel im Text, dort bleibt der Name in der Kopfleiste. Ohne
// laufendes Plugin zeigt Obsidian alles wie gewohnt. Doku: docs/architektur/bedien-bausteine.md, „Öffnen und Navigieren“.
// Auf dem iPad (seit 26.10.2026, zweite Runde) außerdem (dazu mit einem Tab der Titel in der Zeile, eba-core.css 70.2):
//  - Tab-Leiste und Kopfleiste sind eine Zeile, auch mit zwei und mehr Tabs. Die Tabs stehen vor den Knöpfen rechts; wo sie
//    beginnen und enden, misst platzAus und setzt es als --eba-kopf-links und --eba-kopf-rechts an die Tab-Gruppe (Knöpfe
//    rechts: Lesen/Bearbeiten hat nicht jede Ansicht). Vorher zerfiel die Zeile mit dem zweiten Tab in zwei. Zurück, Vor und „+“
//    stehen seit 26.10.2026 in der Leiste unten (eba-core.css 66), bis dahin links bzw. rechts in der Zeile.
//  - Ist die linke Seitenleiste angeheftet, nimmt Obsidian seinen Umschalter ⎕ aus der Zeile; lösen ginge nur mit der Stecknadel
//    unten in ihr. Dann steht vorn in der Zeile ein gleicher Knopf (.eba-uebersicht-knopf), der Obsidians Befehl „Seitenleiste
//    links umschalten“ auslöst: Der löst die Seitenleiste und schließt sie. Obsidians eigenen Umschalter blendet eba-core.css 66
//    auf iPhone und iPad aus (seit 26.10.2026: die Seiten stehen im Menü hinter ≡ unten rechts, seitenleiste.js).
// iOS-sicher: kein Node-API, kein Lookbehind.

// Ein Titel zählt nur, wenn er oben steht: Seine Oberkante liegt höchstens so weit unter dem Anfang des Inhalts (px). Weiter unten
// ist ein „# …“ eine Überschrift im Text, kein Name der Seite; auf dem Dashboard schieben Update-Hinweis und „Seit deinem letzten
// Besuch“ den Gruß bis etwa 300 px nach unten.
const OBEN_MAX = 480;
// Ohne gefundenen Titel, aber so weit gescrollt (px): Die Leseansicht hat den Abschnitt mit dem Titel schon entladen. Dann gilt
// der Titel als weg, wenn diese Notiz vorher einen hatte.
const ENTLADEN_AB = 600;
// Was als Titel einer Notiz gilt, in der Reihenfolge im Text: Obsidians Inline-Titel, ein h1 (Seitenkopf .eba-kopf, „# …“ in der
// Leseansicht, Gruß des Dashboards), die Zeile „# …“ in der Bearbeitungsansicht
const TITEL = ".inline-title, h1, .cm-line.HyperMD-header-1";

// Zustand aus der Messung (rein, Tests). m: { titel: { oben, unten } | null (Rechteck des Titels, wie getBoundingClientRect),
//   inhaltOben (Oberkante des Inhalts im Bild, ohne Scrollen gerechnet: Rechteck der Scrollfläche oben − scrollTop),
//   linie (darüber ist nichts mehr zu sehen: Unterkante der Kopfleiste bzw. Oberkante der Scrollfläche), scroll (scrollTop),
//   vorher ({ titel, weg } dieser Notiz in diesem Tab oder null) } → { titel, weg }
const zustandAus = (m) => {
  if (!m.titel) {
    if (m.vorher && m.vorher.titel && m.scroll > ENTLADEN_AB) return { titel: true, weg: true };
    return { titel: false, weg: false };
  }
  if (m.titel.oben - m.inhaltOben > OBEN_MAX) return { titel: false, weg: false };
  return { titel: true, weg: m.titel.unten <= m.linie + 1 };
};

// Linie, über der ein Titel als weg gilt (rein, Tests). m: { scrollOben (Oberkante der Scrollfläche), kopf (Rechteck der
// Kopfleiste oder null), schwebend (die Kopfleiste liegt über dem Inhalt, schwebendAus), verschoben (px, um die Obsidian die
// schwebende Leiste beim Scrollen nach oben aus dem Bild schiebt, translateY) }. Sonst die Unterkante der Kopfleiste. Liegt sie
// über dem Inhalt, steht der Titel oben in ihrer Zeile (iPhone: eba-core.css 70.1, seit 0.7.0; iPad: 70.2, seit 26.10.2026; PC
// mit einer Tab-Gruppe: 70.2, seit 0.7.0), also über ihrer Unterkante: Dort gilt er erst als weg, wenn er über ihre Oberkante
// gescrollt ist, sonst stünde der Name von Anfang an zweimal da bzw. verdeckte die Leiste auf iPad und PC den Titel. Gemessen wird, wo die Leiste steht, wenn sie zu
// sehen ist: Beim Zurückscrollen gleitet sie herein, ohne dass ein Scrollen sie noch einmal messen ließe.
const linieAus = (m) => {
  if (!m.kopf || !(m.kopf.height > 0)) return m.scrollOben;
  const dy = m.verschoben || 0;
  return Math.max(m.scrollOben, (m.schwebend ? m.kopf.top : m.kopf.bottom) - dy);
};
// Liegt die Kopfleiste über dem Inhalt? iPhone mit Obsidians schwebender Leiste; iPad mit einem Tab und PC mit einer Tab-Gruppe
// (seit 0.7.0) auf Notizen des Plugins und, solange Obsidian den Inline-Titel zeigt, auf allen Notizen (eba-core.css 70.2 setzt
// sie dort absolut)
const schwebendAus = (kopf) => (document.body.classList.contains("is-phone") && document.body.classList.contains("is-floating-nav"))
  || (!!kopf && getComputedStyle(kopf).position === "absolute");
// translateY eines Elements (0 ohne Verschiebung)
const verschiebung = (el) => {
  const t = el ? getComputedStyle(el).transform : "none";
  return t && t !== "none" ? new DOMMatrixReadOnly(t).m42 : 0;
};

// Wie beginnt eine Notiz (rein, Tests)? zeilen: ihre ersten Zeilen (ersteZeilen) → { h1, eigenschaften }. h1: Nach den
// Eigenschaften kommt zuerst eine Zeile „# …“, davor höchstens Leerzeilen, so viele, wie Abschnitt 26 in eba-core.css zulässt (dort
// steht die Überschrift unter den ersten drei Kindern des Editors, die Eigenschaften sind eines davon). „# …“ wie CodeMirror in
// Obsidian: „#“ allein oder „# “ am Anfang der Zeile, nicht „#Wort“ (Tag) und nicht eingerückt. eigenschaften: Die Notiz beginnt
// mit Eigenschaften („---“ bis „---“). Für eba-h1-anfang und eba-h1-oben (eba-core.css 70.1). Aus dem Text: Obsidians Metadaten
// (bis 27.10.2026) folgen dem Tippen erst nach etwa 2 s, der Titel sprang darum zweimal; den Editor selbst (DOM) nicht, denn
// CodeMirror nimmt weit oben liegende Zeilen beim Scrollen aus der Seite, eine daran erkannte Klasse wechselte dann.
const H1 = /^#(?: |$)/;
const anfangAus = (zeilen) => {
  let i = 0, eigenschaften = false;
  if (zeilen[0] === "---") {
    const ende = zeilen.indexOf("---", 1);
    if (ende < 0) return { h1: false, eigenschaften: false };
    eigenschaften = true;
    i = ende + 1;
  }
  for (const bis = i + (eigenschaften ? 2 : 3); i < bis && i < zeilen.length; i++) {
    if (zeilen[i] !== "") return { h1: H1.test(zeilen[i]), eigenschaften };
  }
  return { h1: false, eigenschaften };
};
// Die ersten Zeilen der Notiz einer Ansicht (höchstens so viele, dass lange Eigenschaften hineinpassen): aus ihrem Editor, den
// Obsidian auch in der Leseansicht mit dem Text der Datei führt, sonst aus ihrem Text
const ZEILEN_MAX = 200;
const ersteZeilen = (v) => {
  const ed = v.editor;
  if (ed && typeof ed.getLine === "function" && typeof ed.lineCount === "function") {
    const z = [];
    for (let i = 0, n = Math.min(ed.lineCount(), ZEILEN_MAX); i < n; i++) z.push(ed.getLine(i));
    return z;
  }
  return String(v.data || "").split(/\r?\n/, ZEILEN_MAX);
};

// Steht der Cursor im Bild, aber unter der Kopfleiste (rein, Tests)? m: { oben (verdeckte Höhe, ueberdecktAus), cursor (Oberkante
// des Cursors im Bild), flaeche (Oberkante der Scrollfläche im Bild) }. Weiter oben, außerhalb der Scrollfläche, ist er nicht zu
// sehen, weil die Notiz woanders steht (etwa nach dem Öffnen an der gemerkten Stelle), dann bleibt alles, wie es ist.
const unterLeisteAus = (m) => m.oben > 0 && m.cursor >= m.flaeche && m.cursor < m.flaeche + m.oben;

// Wie weit eine Kopfleiste über dem Inhalt den oberen Rand der Scrollfläche verdeckt (rein, Tests), in px: m { kopf (Rechteck
// oder null), schwebend (schwebendAus), verschoben (translateY), scrollOben (Oberkante der Scrollfläche) }. Gezählt wird, wo sie
// steht, wenn sie zu sehen ist (auf dem iPhone schiebt Obsidian sie beim Scrollen nach oben weg und beim Zurückscrollen wieder
// herein). Liegt sie nicht über dem Inhalt (iPad ab zwei Tabs, PC mit geteilter Hauptfläche), 0.
const ueberdecktAus = (m) => {
  if (!m.schwebend || !m.kopf || !(m.kopf.height > 0)) return 0;
  return Math.max(0, Math.round(m.kopf.bottom - (m.verschoben || 0) - m.scrollOben));
};

// Platz der Tabs in der Zeile des iPad (rein, Tests). m: Rechtecke wie getBoundingClientRect: gruppe (die Tab-Gruppe), vorn (der
// Umschalter einer angehefteten Seitenleiste vorn in der Zeile, sonst null), aktionen (Knöpfe rechts in der Kopfleiste der
// sichtbaren Ansicht, oft leer) → { links, rechts } in px ab dem linken bzw. rechten Rand der Gruppe: neben einem Knopf mit
// ABSTAND Luft, sonst RAND wie der Text (eba-core.css: 22 px auf dem iPad); ohne Gruppe null (dann gelten die Werte aus
// eba-core.css 70.2).
const ABSTAND = 8;
const RAND = 22;
const platzAus = (m) => {
  if (!m.gruppe) return null;
  const da = (r) => !!r && r.width > 0;
  return {
    links: da(m.vorn) ? Math.round(m.vorn.right - m.gruppe.left + ABSTAND) : RAND,
    rechts: da(m.aktionen) ? Math.round(m.gruppe.right - m.aktionen.left + ABSTAND) : RAND,
  };
};

// Erster sichtbarer Titel in der Scrollfläche s, nicht in eingebetteten Notizen → { oben, unten } für zustandAus oder null
const titelIn = (s) => {
  for (const t of Array.from(s.querySelectorAll(TITEL))) {
    if (t.closest(".markdown-embed")) continue;
    const r = t.getBoundingClientRect();
    if (r.height > 0 && r.width > 0) return { oben: r.top, unten: r.bottom };
  }
  return null;
};

module.exports = function (ctx) {
  const app = window.app;
  const gemerkt = new WeakMap(); // Tab-Element → { pfad, titel, weg }
  const beobachtet = new WeakSet();

  // Sichtbare Scrollfläche der Notiz: Leseansicht oder Editor, je nach Modus
  const scrollflaeche = (v) => {
    const el = v.containerEl;
    return v.getMode && v.getMode() === "preview"
      ? el.querySelector(".markdown-reading-view .markdown-preview-view")
      : el.querySelector(".markdown-source-view .cm-scroller");
  };
  // eba-h1-anfang und eba-h1-oben am Tab, aus dem Text (anfangAus)
  const kennzeichnen = (v) => {
    const el = v && v.containerEl;
    if (!el) return;
    const a = v.getViewType && v.getViewType() === "markdown" && v.file ? anfangAus(ersteZeilen(v)) : { h1: false, eigenschaften: false };
    el.classList.toggle("eba-h1-anfang", a.h1);
    el.classList.toggle("eba-h1-oben", a.h1 && !a.eigenschaften);
  };
  const messen = (blatt) => {
    const v = blatt && blatt.view, el = v && v.containerEl;
    if (!el) return;
    const f = v.getViewType && v.getViewType() === "markdown" ? v.file : null;
    const s = f ? scrollflaeche(v) : null;
    kennzeichnen(v);
    if (!s) { el.classList.remove("eba-titel", "eba-titel-weg"); gemerkt.delete(el); return; }
    if (!beobachtet.has(el)) {
      beobachtet.add(el);
      // scroll steigt nicht auf: im Einfangen am Tab hören, so trifft es Lese- und Bearbeitungsansicht
      ctx.dom(el, "scroll", () => bald(blatt), { capture: true, passive: true });
    }
    const alt = gemerkt.get(el);
    const sr = s.getBoundingClientRect(), kopf = v.headerEl ? v.headerEl.getBoundingClientRect() : null;
    const z = zustandAus({
      titel: titelIn(s),
      inhaltOben: sr.top - s.scrollTop,
      linie: linieAus({ scrollOben: sr.top, kopf, schwebend: schwebendAus(v.headerEl), verschoben: verschiebung(v.headerEl) }),
      scroll: s.scrollTop,
      vorher: alt && alt.pfad === f.path ? alt : null,
    });
    gemerkt.set(el, { pfad: f.path, titel: z.titel, weg: z.weg });
    el.classList.toggle("eba-titel", z.titel);
    el.classList.toggle("eba-titel-weg", z.titel && z.weg);
  };

  // ---------- Zeile auf dem iPad (eba-core.css 70.2) ----------
  const rechteck = (el) => (el && el.getClientRects().length ? el.getBoundingClientRect() : null);
  const gruppen = () => Array.from(document.querySelectorAll(".workspace-split.mod-root .workspace-tabs:not(.mod-stacked)"));
  // Platz der Tabs je Gruppe: hinter dem eigenen Umschalter (falls da) bis vor die Knöpfe rechts der Ansicht, die gerade vorn ist
  const zeileMessen = () => {
    for (const g of gruppen()) {
      const blatt = Array.from(g.querySelectorAll(":scope > .workspace-tab-container > .workspace-leaf")).find((x) => x.getClientRects().length);
      const p = platzAus({
        gruppe: rechteck(g),
        vorn: rechteck(g.querySelector(":scope > .workspace-tab-header-container > ." + KNOPF)),
        aktionen: rechteck(blatt && blatt.querySelector(".view-header .view-actions")),
      });
      if (!p) continue;
      g.style.setProperty("--eba-kopf-links", p.links + "px");
      g.style.setProperty("--eba-kopf-rechts", p.rechts + "px");
    }
  };
  // Seitenleiste angeheftet: ein Umschalter wie Obsidians eigener (gleiches Markup, gleicher Platz) vorn in der Zeile der ersten Gruppe
  const KNOPF = "eba-uebersicht-knopf";
  const knopfBauen = () => {
    const k = document.createElement("div");
    k.className = "sidebar-toggle-button mod-primary mod-left " + KNOPF;
    const i = k.createDiv({ cls: "clickable-icon", attr: { role: "button", tabindex: "0", "aria-label": "Seitenleiste ausblenden" } });
    const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    for (const [a, v] of Object.entries({ width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
      "stroke-linecap": "round", "stroke-linejoin": "round", class: "svg-icon sidebar-toggle-button-icon", "aria-hidden": "true" })) svg.setAttribute(a, v);
    for (const at of [{ x: 1, y: 2, width: 22, height: 20, rx: 4, pathLength: 100, class: "sidebar-toggle-icon-outer" },
      { x: 4, y: 5, width: 2, height: 14, rx: 2, fill: "currentColor", class: "sidebar-toggle-icon-inner" }]) {
      const r = document.createElementNS(NS, "rect");
      for (const a in at) r.setAttribute(a, String(at[a]));
      svg.appendChild(r);
    }
    i.appendChild(svg);
    const los = (e) => { e.preventDefault(); e.stopPropagation(); app.commands.executeCommandById("app:toggle-left-sidebar"); };
    i.addEventListener("click", los);
    i.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") los(e); });
    return k;
  };
  const knoepfeWeg = () => { for (const k of Array.from(document.querySelectorAll("." + KNOPF))) k.remove(); };
  const uebersichtKnopf = () => {
    const schublade = document.querySelector(".workspace-drawer.mod-left");
    const angeheftet = document.body.classList.contains("is-tablet") && !!schublade && schublade.classList.contains("is-pinned");
    const zeile = angeheftet && gruppen().length ? gruppen()[0].querySelector(":scope > .workspace-tab-header-container") : null;
    for (const k of Array.from(document.querySelectorAll("." + KNOPF))) if (k.parentElement !== zeile) k.remove();
    if (zeile && !zeile.querySelector(":scope > ." + KNOPF)) zeile.prepend(knopfBauen());
  };

  // Höchstens einmal je Bild messen
  const wartend = new Set();
  let rahmen = 0, zeileFaellig = false;
  const bald = (blatt) => {
    if (blatt) wartend.add(blatt);
    if (rahmen) return;
    rahmen = requestAnimationFrame(() => {
      rahmen = 0;
      const liste = Array.from(wartend);
      wartend.clear();
      for (const b of liste) { try { messen(b); } catch (e) { console.error("Kopfleiste", e); } }
      if (!zeileFaellig) return;
      zeileFaellig = false;
      try { uebersichtKnopf(); if (document.body.classList.contains("is-tablet")) zeileMessen(); } catch (e) { console.error("Kopfleiste Zeile", e); }
    });
  };
  const alle = () => { zeileFaellig = true; bald(null); for (const b of app.workspace.getLeavesOfType("markdown")) bald(b); };
  const klassenWeg = () => {
    for (const b of app.workspace.getLeavesOfType("markdown")) {
      if (b.view && b.view.containerEl) b.view.containerEl.classList.remove("eba-titel", "eba-titel-weg", "eba-h1-anfang", "eba-h1-oben");
    }
    for (const g of gruppen()) { g.style.removeProperty("--eba-kopf-links"); g.style.removeProperty("--eba-kopf-rechts"); }
    knoepfeWeg();
  };
  // Nach dem Öffnen zeichnet Obsidian den Inhalt nach und nach: einige Male nachmessen
  const nachOeffnen = () => { alle(); for (const ms of [80, 300, 1000]) ctx.zeit(alle, ms); };

  // ---------- Sprungziele und Cursor nicht unter der Kopfleiste (seit 27.10.2026) ----------
  // Liegt die Kopfleiste über dem Inhalt (iPad mit einem Tab, 70.2; iPhone, Obsidians schwebende Leiste), verdeckt sie den oberen
  // Rand der Scrollfläche: Ein Sprung zu einer Überschrift (Link mit #, Gliederung, Rückverweis) setzte das Ziel beim Lesen genau
  // dorthin, auf dem iPad unter die Leiste (59–87 px unter 59–111), auf dem iPhone unter Statusleiste und Leiste; ebenso der Cursor
  // beim Bearbeiten, wenn er mit den Pfeiltasten nach oben wandert. CSS scroll-padding hilft nicht: Obsidian setzt beim Lesen
  // scrollTop selbst, CodeMirror rechnet mit eigenen Rändern. Am PC mit einer Tab-Gruppe ebenso (seit 0.7.0; Leiste 40–80 über der
  // Scrollfläche ab 40, ein Sprungziel landet bei 80).
  // Bearbeiten: CodeMirrors scrollMargins (über ctx.editor), so weit, wie die Leiste die Scrollfläche verdeckt. Lesen: Nach
  // einem Sprung (applyScroll mit highlight, ohne center; so ruft Obsidian ihn für Links, Gliederung und Rückverweise) rückt das
  // Ziel um dieselbe Höhe nach unten. Nur der äußerste Aufruf (applyScroll ruft sich selbst, wenn es einen Abschnitt erst zeigen
  // muss). Andere Aufrufe (Position wiederherstellen, Umschalten, Suchtreffer in der Mitte) bleiben, wie sie sind, darum wandert
  // nichts. Abmelden gibt applyScroll zurück; hat es danach noch jemand umhüllt, bleibt dessen Hülle, und unsere reicht durch.
  // Cursor gesetzt (seit 27.10.2026): Steht er danach unter der Leiste, rückt seine Zeile gleich darunter. Bis dahin tat das
  // CodeMirror erst beim ersten Tastendruck, auf dem iPhone mitten ins Tippen (um bis zu 48 px): Die Ränder oben gelten für die
  // Leiste, wie sie steht, wenn sie zu sehen ist, und Obsidian schiebt sie beim Scrollen weg und holt sie mit dem nächsten Tipp
  // zurück; ein Cursor dicht unter der Statusleiste lag so unter ihrem Platz. Nur bei Fokus, nur für einen Cursor (Markieren bleibt,
  // wie es ist), nicht beim Tippen (das rückt CodeMirror selbst) und nur, wenn er im Bild unter der Leiste steht (unterLeisteAus).
  const ueberdeckt = (s) => {
    const blatt = s && s.closest(".workspace-leaf-content");
    const kopf = blatt && blatt.querySelector(":scope > .view-header");
    if (!kopf) return 0;
    return ueberdecktAus({ kopf: kopf.getBoundingClientRect(), schwebend: schwebendAus(kopf), verschoben: verschiebung(kopf), scrollOben: s.getBoundingClientRect().top });
  };
  const sprungRaender = () => {
    const V = ctx.cm && ctx.cm.view;
    if (V && V.EditorView && V.EditorView.scrollMargins && typeof ctx.editor === "function") {
      ctx.editor(V.EditorView.scrollMargins.of((ansicht) => {
        try { const oben = ueberdeckt(ansicht.scrollDOM); return oben ? { top: oben } : null; } catch (e) { return null; }
      }));
      if (V.EditorView.updateListener && typeof V.EditorView.scrollIntoView === "function") {
        ctx.editor(V.EditorView.updateListener.of((u) => {
          if (!u.selectionSet || u.docChanged || !u.view.hasFocus || !u.state.selection.main.empty) return;
          if (u.transactions.some((t) => t.scrollIntoView)) return;
          const ansicht = u.view, stelle = u.state.selection.main.head;
          requestAnimationFrame(() => {
            try {
              const sel = ansicht.state.selection.main;
              if (!ansicht.dom.isConnected || !sel.empty || sel.head !== stelle) return;
              const oben = ueberdeckt(ansicht.scrollDOM), k = oben ? ansicht.coordsAtPos(stelle) : null;
              if (k && unterLeisteAus({ oben, cursor: k.top, flaeche: ansicht.scrollDOM.getBoundingClientRect().top })) {
                ansicht.dispatch({ effects: V.EditorView.scrollIntoView(stelle, { y: "nearest" }) });
              }
            } catch (e) { console.error("Kopfleiste: Tipp", e); }
          });
        }));
      }
    }
    const R = ctx.obsidian && ctx.obsidian.MarkdownPreviewRenderer, P = R && R.prototype;
    if (!P || typeof P.applyScroll !== "function") return;
    const alt = P.applyScroll;
    let an = true, tiefe = 0;
    const unser = function (zeile, opt, ...rest) {
      tiefe += 1;
      let r;
      try { r = alt.call(this, zeile, opt, ...rest); } finally { tiefe -= 1; }
      if (an && r && tiefe === 0 && opt && opt.highlight && !opt.center && this.previewEl) {
        try {
          const s = this.previewEl, oben = ueberdeckt(s);
          if (oben && s.scrollTop > 0) s.scrollTop = Math.max(0, s.scrollTop - oben);
        } catch (e) { console.error("Kopfleiste: Sprung", e); }
      }
      return r;
    };
    P.applyScroll = unser;
    ctx.aufraeumen(() => { an = false; if (P.applyScroll === unser) P.applyScroll = alt; });
  };

  return {
    registrieren() {
      const ws = app.workspace;
      ctx.an(ws, "layout-change", nachOeffnen);
      ctx.an(ws, "active-leaf-change", nachOeffnen);
      ctx.an(ws, "file-open", nachOeffnen);
      ctx.an(ws, "css-change", alle);
      // Tippen ändert, wie die Notiz beginnt (eba-h1-anfang, eba-h1-oben): Obsidian meldet es aus CodeMirror heraus, noch bevor
      // das Bild gezeichnet wird. Gleich kennzeichnen, so wechselt die Klasse im selben Bild, in dem CodeMirror „# “ als Überschrift
      // zeigt (eba-core.css 70.1)
      ctx.an(ws, "editor-change", (editor, ansicht) => {
        if (!ansicht || !ansicht.containerEl) return;
        try { kennzeichnen(ansicht); } catch (e) { console.error("Kopfleiste", e); }
        for (const b of ws.getLeavesOfType("markdown")) if (b.view === ansicht) bald(b);
      });
      // Rückfall: von außen geändert (Abgleich), ohne dass ein Editor es meldet
      ctx.an(app.metadataCache, "changed", (datei) => {
        for (const b of ws.getLeavesOfType("markdown")) if (b.view && b.view.file === datei) bald(b);
      });
      ctx.dom(window, "resize", alle);
      // Anheften und Lösen meldet Obsidian nicht als Ereignis: die Klasse is-pinned an der Schublade beobachten
      const schublade = document.querySelector(".workspace-drawer.mod-left");
      if (schublade && typeof MutationObserver === "function") {
        const b = new MutationObserver(alle);
        b.observe(schublade, { attributes: true, attributeFilter: ["class"] });
        ctx.aufraeumen(() => b.disconnect());
      }
      ctx.zeit(nachOeffnen, 300);
      try { sprungRaender(); } catch (e) { console.error("Kopfleiste: Sprungziele", e); }
    },
    abmelden() {
      if (rahmen) cancelAnimationFrame(rahmen);
      klassenWeg();
    },
  };
};
module.exports.zustandAus = zustandAus;
module.exports.linieAus = linieAus;
module.exports.titelIn = titelIn;
module.exports.platzAus = platzAus;
module.exports.ueberdecktAus = ueberdecktAus;
module.exports.anfangAus = anfangAus;
module.exports.ersteZeilen = ersteZeilen;
module.exports.unterLeisteAus = unterLeisteAus;
module.exports.ABSTAND = ABSTAND;
module.exports.RAND = RAND;
module.exports.OBEN_MAX = OBEN_MAX;
module.exports.ENTLADEN_AB = ENTLADEN_AB;
module.exports.TITEL = TITEL;
