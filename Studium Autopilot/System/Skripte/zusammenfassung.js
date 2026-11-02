// Zusammenfassung eines Moduls lesen (typ: zusammenfassung, seit 02.11.2026, im Entwurf): Navigation, Abschnittsnummern,
// Formeln und Tabellen. Gestaltung: eba-core.css 72. Doku: docs/architektur/seiten.md, „Zusammenfassung eines Moduls“.
// 1. Navigation durch die Kapitel (Kürzel „E“, „I“, „II“ … aus dem Text vor „ · “ der ##-Überschrift, wie zfMeta in
//    unterlagenliste.js) und ihre Abschnitte (### und ####), je nach Breite der Ansicht:
//    - Kapitel-Leiste links (leisteAn: mindestens BREIT, und neben der Leiste bleibt Platz für die zwei Spalten der
//      Abschnitte; iPad quer, PC): alle Kapitel, das, in dem du liest, hervorgehoben und darunter seine Abschnitte.
//    - Schmaler (iPhone, iPad hoch): eine dünne Zeile oben mit der Stelle, an der du liest („III.4 Streudiagramm“), sobald du
//      im ersten Kapitel bist; ein Tipp darauf öffnet von unten dieselbe Liste. Auf dem Telefon öffnet die Notiz beim ersten
//      Mal auf diesem Gerät mit allen Kapiteln zugeklappt, wenn Obsidian für sie keine Faltung gespeichert hat: Der erste
//      Bildschirm zeigt die Kapitel.
//    Wo du liest, zählt eine Linie ein Viertel unter dem oberen Rand (aktivZeile), nicht der obere Rand: Sonst blieb ein
//    Abschnitt hervorgehoben, während der nächste schon den Bildschirm füllte. Ein Tipp auf einen Eintrag klappt das Kapitel
//    oder den Abschnitt auf, falls er zugeklappt ist, und springt hin (Lese- und Bearbeitungsansicht).
// 2. Abschnittsnummer „I.2“ an jedem Abschnitt (data-eba-nr; CSS setzt sie vor den Titel, die Navigation zeigt dieselbe) und die
//    Zeile jeder Überschrift (data-eba-zeile, für aktivZeile): Leseansicht über den Post-Processor, Bearbeitungsansicht über eine
//    CodeMirror-Erweiterung (Decoration.line), wie die Abschnitte in vorlesung.js.
// 3. Formeln, die breiter sind als ihr Platz (iPhone), werden kleiner gesetzt, höchstens auf FORMEL_MIN; reicht das nicht,
//    rollen sie seitlich wie bisher (formelSkala).
// 4. Tabellen der Leseansicht bekommen an jeder Zelle den Kopf ihrer Spalte (data-label): Auf dem Telefon steht jede Zeile als
//    kleiner Block untereinander, die erste Zelle als Titel, die anderen mit ihrem Spaltenkopf davor. Sonst fielen Spalten rechts
//    aus dem Bild.
// Schreibt keine Datei; Faltungen speichert Obsidian je Gerät wie beim Tipp auf den Pfeil.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const TYP = "zusammenfassung";
  const BREIT = 1000; // Breite der Ansicht in px, ab der die Leiste überhaupt kommt
  const PLATZ = 316; // was die Leiste dem Text nimmt: 260 px Leiste, 28 px Abstand, 28 px Rand rechts (eba-core.css 72)
  const ZEILE_HOEHE = 34; // Zeile oben in der schmalen Ansicht (eba-core.css 72.2)
  const FORMEL_MIN = 0.75; // kleiner wird eine Formel nicht, sonst ist sie nicht mehr lesbar
  const txt = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const istZusammenfassung = (fm) => txt(fm && fm.typ).toLowerCase() === TYP;
  // Überschrift ohne Markdown: Seitenlinks auf PDFs fallen weg (Chip im Titel), [[Ziel|Text]] → Text, **fett**, ==markiert==, `Code`
  const klartext = (s) => txt(String(s == null ? "" : s)
    .replace(/\[\[[^\]]*\.pdf(#[^\]]*)?\]\]/gi, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/(\*\*|__|==|`)/g, ""));
  // „I · Verteilung einer Variablen“ → Kürzel „I“ und Titel; ohne „ · “ (oder Kürzel länger als 6 Zeichen) kein Kürzel
  const teilen = (s) => {
    const t = klartext(s), i = t.indexOf(" · ");
    return i > 0 && i <= 6 ? { kurz: t.slice(0, i), titel: t.slice(i + 3) } : { kurz: "", titel: t };
  };
  const zeileVon = (h) => (h.position && h.position.start ? h.position.start.line : 0);

  // Kapitel aus den Überschriften des metadataCache: ## = Kapitel, ### und #### darin = Abschnitte; #### unter einem ### rückt
  // ein (tief). Überschriften vor dem ersten ## gehören zu keinem Kapitel. Ein Kapitel ohne Kürzel zählt mit seiner Nummer.
  // Jeder Abschnitt (nicht tief) bekommt die Nummer „Kürzel.n“ (nr), außer seine Überschrift beginnt schon mit einer Zahl.
  const kapitelAus = (headings) => {
    const k = [];
    let h3 = false, n = 0;
    for (const h of headings || []) {
      const zeile = zeileVon(h);
      if (h.level === 2) {
        const t = teilen(h.heading);
        k.push({ kurz: t.kurz || String(k.length + 1), text: t.titel, zeile, unter: [] });
        h3 = false; n = 0;
        continue;
      }
      if (!k.length || (h.level !== 3 && h.level !== 4)) continue;
      if (h.level === 3) h3 = true;
      const text = klartext(h.heading), tief = h.level === 4 && h3;
      const nr = tief || /^\d/.test(text) ? "" : k[k.length - 1].kurz + "." + (++n);
      k[k.length - 1].unter.push({ text, zeile, ebene: h.level, tief, nr });
    }
    return k;
  };
  // Zeile → Abschnittsnummer, für Post-Processor und Bearbeitungsansicht
  const nummern = (headings) => {
    const r = new Map();
    for (const k of kapitelAus(headings)) for (const u of k.unter) if (u.nr) r.set(u.zeile, u.nr);
    return r;
  };
  // Kapitel und Abschnitt, in dem Zeile zeile liegt (letzte Überschrift darüber); -1 = keins
  const aktivBei = (kapitel, zeile) => {
    let k = -1, u = -1;
    for (let i = 0; i < kapitel.length; i++) if (kapitel[i].zeile <= zeile) k = i;
    if (k >= 0) { const un = kapitel[k].unter; for (let j = 0; j < un.length; j++) if (un[j].zeile <= zeile) u = j; }
    return { k, u };
  };
  // Zeile, an der du liest: die oberste sichtbare (oben, von getScroll) oder die Zeile der letzten gezeichneten Überschrift über
  // der Linie ein Viertel unter dem oberen Rand (darueber), je nachdem, was weiter unten liegt. Die Überschriften zählen vor:
  // Sind Kapitel zugeklappt, nennt getScroll eine Zeile im zugeklappten Kapitel davor.
  const aktivZeile = (oben, darueber) => Math.max((Number(oben) || 0) + 1.5, ...(darueber || []));
  // Text der Zeile oben (schmale Ansicht): „III.4 Streudiagramm“, im Kapitel vor seinem ersten Abschnitt „III · Titel“
  const stelleText = (kapitel, a) => {
    const k = a && a.k >= 0 ? kapitel[a.k] : null;
    if (!k) return null;
    const u = a.u >= 0 ? k.unter[a.u] : null;
    return u ? { nr: u.nr || k.kurz, text: u.text } : { nr: k.kurz, text: k.text };
  };
  // Welche Faltungen nach einem Sprung zu zeile bleiben: Eine Faltung an einer Überschrift reicht bis vor die nächste
  // Überschrift gleicher oder höherer Ebene (Obsidian gibt in der Leseansicht nur from = Zeile der Überschrift und to = from + 1
  // an); liegt zeile darin, geht sie auf. Andere Faltungen (Listen) zählen von from bis to.
  const faltungenOhne = (folds, headings, zeile) => {
    const hs = (headings || []).map((h) => ({ level: h.level, zeile: h.position && h.position.start ? h.position.start.line : -1 }));
    return (folds || []).filter((f) => {
      const i = hs.findIndex((h) => h.zeile === f.from);
      let bis = f.to;
      if (i >= 0) {
        bis = Infinity;
        for (let j = i + 1; j < hs.length; j++) if (hs[j].level <= hs[i].level) { bis = hs[j].zeile - 1; break; }
      }
      return !(f.from <= zeile && zeile <= bis);
    });
  };
  // Alle Kapitel zugeklappt (Telefon, erste Öffnung): je ## von seiner Zeile bis vor das nächste ## bzw. bis zum Ende
  const kapitelFalten = (headings, zeilen) => {
    const h2 = (headings || []).filter((h) => h.level === 2).map(zeileVon);
    return h2.map((z, i) => ({ from: z, to: (i + 1 < h2.length ? h2[i + 1] : zeilen) - 1 }));
  };
  // Leiste an? Ansicht mindestens BREIT, und neben der Leiste bleibt für den Text, was die Spalten der Abschnitte brauchen
  // (bedarf in px, 0 = unbekannt): Sonst stünden die Abschnitte am iPad hoch in einer Spalte.
  const leisteAn = (breite, bedarf) => breite >= BREIT && breite - PLATZ >= (bedarf || 0);
  // Schriftgröße einer Formel relativ zur jetzigen: 1, wenn sie passt, sonst so klein, dass sie passt, aber nie unter FORMEL_MIN
  const formelSkala = (breite, noetig) => {
    if (!(breite > 0) || !(noetig > breite)) return 1;
    return Math.max(FORMEL_MIN, Math.floor(((breite - 2) / noetig) * 100) / 100); // 2 px Luft: sonst blieb oft 1 px zum Rollen
  };
  // Für die Bearbeitungsansicht aus dem Text: typ aus den Eigenschaften oben
  const typAus = (zeilen) => {
    if (!zeilen.length || zeilen[0].trim() !== "---") return "";
    for (let i = 1; i < zeilen.length; i++) {
      if (zeilen[i].trim() === "---") return "";
      const m = /^typ:\s*["']?([^"'#]+?)["']?\s*$/.exec(zeilen[i]);
      if (m) return m[1];
    }
    return "";
  };
  // Überschriften aus dem Text in der Form des metadataCache, ohne Eigenschaften und Codeblöcke (``` oder ~~~)
  const ueberschriften = (zeilen) => {
    const r = [];
    let i = 0, zaun = "";
    if (zeilen.length && zeilen[0].trim() === "---") { i = 1; while (i < zeilen.length && zeilen[i].trim() !== "---") i++; i++; }
    for (; i < zeilen.length; i++) {
      const m = /^\s*(```|~~~)/.exec(zeilen[i]);
      if (m) { if (!zaun) zaun = m[1]; else if (m[1] === zaun) zaun = ""; continue; }
      if (zaun) continue;
      const h = /^(#{1,6}) +(\S.*)$/.exec(zeilen[i]);
      if (h) r.push({ level: h[1].length, heading: h[2], position: { start: { line: i } } });
    }
    return r;
  };

  const fmVon = (f) => (f && app.metadataCache.getFileCache(f)?.frontmatter) || {};
  const headingsVon = (f) => (app.metadataCache.getFileCache(f) || {}).headings;
  const istTelefon = (view) => view.contentEl.ownerDocument.body.classList.contains("is-phone"); // Fenster der Ansicht
  // Ansicht → { view, W, kapitel, schluessel, a, nav, liste, zeile, blatt, blattListe, ro, beimScrollen, bild, bedarf }
  const zustand = new Map();

  // ---------- Springen ----------
  // Zugeklappte Bereiche um die Zeile aufklappen, dann dorthin scrollen. Nach dem Aufklappen misst die Leseansicht die Abschnitte
  // neu, ein Sprung landete dann oft an der Überschrift des Kapitels (gefunden 02.11.2026): bis zu viermal nachsetzen.
  const springen = (view, zeile) => {
    const m = view.currentMode;
    let auf = false;
    try {
      const info = m.getFoldInfo && m.getFoldInfo();
      const folds = (info && info.folds) || [];
      const rest = faltungenOhne(folds, headingsVon(view.file), zeile);
      if (rest.length !== folds.length) { m.applyFoldInfo({ folds: rest, lines: info.lines }); if (view.onMarkdownFold) view.onMarkdownFold(); auf = true; }
    } catch (e) { /* ohne Faltung weiter */ }
    const hin = () => { try { view.currentMode.applyScroll(zeile); } catch (e) { view.setEphemeralState({ line: zeile }); } };
    // Danach die Überschrift genau unter Obsidians Kopfleiste (wenn sie über dem Inhalt liegt) und die Zeile oben rücken:
    // applyScroll ließ sie am Telefon rund 50 px über dem Rand stehen (gemessen 02.11.2026). Ist sie nicht gezeichnet, nur um
    // die Höhe von Kopfleiste und Zeile zurück.
    const frei = () => {
      const c = view.contentEl, box = bereich(view);
      if (!box) return;
      const v = (parseFloat(c.style.getPropertyValue("--eba-zf-oben")) || 0) + (c.hasClass("eba-zf-mit-zeile") ? ZEILE_HOEHE : 0) + 8;
      const el = box.querySelector('[data-eba-zeile="' + zeile + '"]'), k = el && el.getBoundingClientRect();
      if (k && k.height > 0) box.scrollTop = Math.max(0, box.scrollTop + k.top - box.getBoundingClientRect().top - v);
      else box.scrollTop = Math.max(0, box.scrollTop - v);
    };
    let n = 0;
    const nach = () => {
      hin();
      // Angekommen, wenn die Überschrift oben steht; ist sie nicht gezeichnet, nach getScroll (das bei zugeklappten Kapiteln
      // davor danebenliegt, darum zuerst die Überschrift)
      let da = true;
      try {
        const box = bereich(view), el = box && box.querySelector('[data-eba-zeile="' + zeile + '"]');
        const k = el && el.getBoundingClientRect();
        da = k && k.height > 0 ? Math.abs(k.top - box.getBoundingClientRect().top) < 120 : Math.abs(Number(view.currentMode.getScroll()) - zeile) < 1;
      } catch (e) { /* ohne Messung nicht nachsetzen */ }
      if (auf && !da && ++n <= 4) ctx.zeit(nach, 150 * n);
      else frei();
    };
    hin();
    ctx.zeit(nach, 120);
  };

  // ---------- Liste der Kapitel (Leiste und Blatt von unten) ----------
  const listeBauen = (eltern, z, danach) => {
    const eintrag = (el, cls, zeile, titel) => {
      const a = el.createEl("a", { cls, attr: { href: "#", title: titel } });
      a.addEventListener("click", (e) => { e.preventDefault(); if (danach) danach(); springen(z.view, zeile); });
      return a;
    };
    const L = [];
    for (const k of z.kapitel) {
      const a = eintrag(eltern, "eba-zf-kap", k.zeile, k.text);
      a.createSpan({ cls: "eba-zf-kap-nr", text: k.kurz });
      a.createSpan({ cls: "eba-zf-text", text: k.text });
      const unter = eltern.createDiv({ cls: "eba-zf-unter" });
      L.push({ a, u: k.unter.map((u) => {
        const e = eintrag(unter, "eba-zf-abs ebene-" + u.ebene + (u.tief ? " tief" : ""), u.zeile, u.text);
        if (u.nr) e.createSpan({ cls: "eba-zf-abs-nr", text: u.nr });
        e.createSpan({ cls: "eba-zf-text", text: u.text });
        return e;
      }) });
    }
    return L;
  };
  const listeMarkieren = (L, a) => L.forEach((k, i) => {
    k.a.toggleClass("aktiv", i === a.k);
    k.u.forEach((u, j) => u.toggleClass("aktiv", i === a.k && j === a.u));
  });
  // Aktiven Eintrag in seinem Rollbereich sichtbar halten
  const insBild = (box, L, a) => {
    const el = a.k >= 0 ? (a.u >= 0 ? L[a.k].u[a.u] : L[a.k].a) : null;
    if (!el || !box.isConnected) return;
    const oben = el.offsetTop, unten = oben + el.offsetHeight;
    if (oben < box.scrollTop + 40) box.scrollTop = Math.max(0, oben - 40);
    else if (unten > box.scrollTop + box.clientHeight - 40) box.scrollTop = unten - box.clientHeight + 40;
  };

  // Gerade sichtbarer Bereich, das Element, das rollt: Leseansicht (.markdown-preview-view in previewMode.containerEl, der
  // Hülle .markdown-reading-view) oder Editor der Ansicht
  const bereich = (view) => {
    try {
      if (view.getMode && view.getMode() === "preview") {
        const h = view.previewMode.containerEl;
        return h.querySelector(".markdown-preview-view") || h;
      }
    } catch (e) { /* Editor */ }
    return view.contentEl.querySelector(".markdown-source-view .cm-scroller");
  };
  const wo = (z) => {
    let oben = 0;
    try { oben = Number(z.view.currentMode.getScroll()) || 0; } catch (e) { return { k: -1, u: -1 }; }
    const box = bereich(z.view), darueber = [];
    if (box) {
      const r = box.getBoundingClientRect(), grenze = r.top + r.height / 4;
      for (const el of box.querySelectorAll("[data-eba-zeile]")) {
        const k = el.getBoundingClientRect();
        if (k.height > 0 && k.top <= grenze) darueber.push(Number(el.getAttribute("data-eba-zeile"))); // Höhe 0: zugeklappt
      }
    }
    return aktivBei(z.kapitel, aktivZeile(oben, darueber));
  };
  const markieren = (z) => {
    if (!z.kapitel.length) return;
    const a = wo(z);
    if (z.a && a.k === z.a.k && a.u === z.a.u) return;
    z.a = a;
    listeMarkieren(z.liste, a);
    if (z.blattListe) listeMarkieren(z.blattListe, a);
    if (z.view.contentEl.hasClass("eba-zf-mit-leiste")) insBild(z.nav, z.liste, a);
    const s = stelleText(z.kapitel, a);
    z.zeile.toggleClass("is-da", !!s);
    if (s) { z.zeileNr.setText(s.nr); z.zeileText.setText(s.text); }
  };
  const blattZu = (z) => { if (z.blatt) { z.blatt.remove(); z.blatt = null; z.blattListe = null; } };
  const blattAuf = (z) => {
    blattZu(z);
    const huelle = z.view.contentEl.createDiv({ cls: "eba-zf-blatt-huelle" });
    huelle.addEventListener("click", (e) => { if (e.target === huelle) blattZu(z); });
    const blatt = huelle.createDiv({ cls: "eba-zf-blatt", attr: { role: "dialog", "aria-label": "Kapitel" } });
    blatt.createDiv({ cls: "eba-zf-blatt-griff" });
    z.blatt = huelle;
    z.blattListe = listeBauen(blatt, z, () => blattZu(z));
    const a = z.a || wo(z);
    listeMarkieren(z.blattListe, a);
    insBild(blatt, z.blattListe, a);
  };

  // ---------- Formeln und Tabellen ----------
  // Formeln, die nicht in ihre Zeile passen, kleiner setzen (gemerkt je Breite, beim Drehen oder Ändern der Breite neu)
  const formelnEinpassen = (box) => {
    for (const el of box.querySelectorAll('mjx-container[display="true"]')) {
      const breite = el.clientWidth;
      if (!breite || el.getAttribute("data-eba-breite") === String(breite)) continue;
      el.style.fontSize = "";
      const s = formelSkala(breite, el.scrollWidth);
      if (s < 1) el.style.fontSize = (parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).fontSize) * s).toFixed(2) + "px";
      el.setAttribute("data-eba-breite", String(breite));
    }
  };
  // Spaltenkopf an jede Zelle (data-label), nur in der Leseansicht: Den Editor zeichnet CodeMirror selbst
  const tabellenBeschriften = (box) => {
    for (const t of box.querySelectorAll("table:not([data-eba-spalten])")) {
      const kopf = Array.from(t.querySelectorAll("thead th")).map((th) => txt(th.textContent));
      for (const tr of t.querySelectorAll("tbody tr")) Array.from(tr.children).forEach((td, i) => { if (kopf[i]) td.setAttribute("data-label", kopf[i]); });
      t.setAttribute("data-eba-spalten", String(kopf.length));
    }
  };
  const durchgang = (z) => {
    const box = bereich(z.view);
    if (!box) return;
    formelnEinpassen(box);
    if (box.classList.contains("markdown-preview-view")) tabellenBeschriften(box);
  };

  // ---------- Breite: Leiste oder Zeile oben ----------
  // Was zwei Spalten eines Abschnitts brauchen (Kasten eba-zf-abschnitt, columns in CSS): gemessen an einem unsichtbaren
  // Probekasten in der Ansicht, so gilt die Schriftgröße des Geräts, und kein Abschnitt muss schon gezeichnet sein (sonst kam
  // die Leiste am iPad hoch kurz und verschwand mit dem ersten Abschnitt). 0, solange die Ansicht die Klasse der Notiz noch nicht
  // trägt (dann prüft jedes Scrollen nach); -1: gemessen, keine Spalten.
  const bedarf = (z) => {
    if (z.bedarf) return z.bedarf;
    const wirt = z.view.contentEl.querySelector(":is(.markdown-preview-view, .markdown-source-view).eba-zusammenfassung");
    if (!wirt) return 0;
    const probe = wirt.createDiv({ cls: "callout", attr: { "data-callout": "eba-zf-abschnitt", style: "position:absolute;visibility:hidden" } });
    const el = probe.createDiv({ cls: "callout-content" });
    const s = z.W.getComputedStyle(el), n = parseInt(s.columnCount, 10), w = parseFloat(s.columnWidth), g = parseFloat(s.columnGap) || 0;
    probe.remove();
    z.bedarf = n > 1 && w > 0 ? n * w + (n - 1) * g : -1;
    return z.bedarf;
  };
  const breite = (z) => {
    const c = z.view.contentEl, da = z.kapitel.length > 0;
    const leiste = da && leisteAn(c.clientWidth, Math.max(0, bedarf(z)));
    c.toggleClass("eba-zf-mit-leiste", leiste);
    c.toggleClass("eba-zf-mit-zeile", da && !leiste);
    // Liegt Obsidians Kopfleiste über dem Inhalt (iPad mit einem Tab, iPhone; eba-core.css 70), steht die Zeile darunter
    let oben = 0;
    const kopf = z.view.headerEl;
    if (kopf && kopf.isConnected) {
      const k = kopf.getBoundingClientRect(), r = c.getBoundingClientRect();
      if (k.bottom > r.top && k.top <= r.top + 4) oben = Math.round(k.bottom - r.top);
    }
    c.style.setProperty("--eba-zf-oben", oben + "px");
    if (leiste) blattZu(z);
    z.a = null;
    markieren(z);
    durchgang(z);
  };
  const aufbauen = (view) => {
    const W = view.contentEl.ownerDocument.defaultView || window; // Fenster der Ansicht (am PC auch ein eigenes Fenster)
    const z = { view, W, kapitel: [], schluessel: null, a: null, liste: [], blatt: null, blattListe: null, bild: 0, bedarf: 0 };
    z.nav = view.contentEl.createEl("nav", { cls: "eba-zf-leiste", attr: { "aria-label": "Kapitel" } });
    z.zeile = view.contentEl.createDiv({ cls: "eba-zf-zeile", attr: { role: "button", tabindex: "0", "aria-label": "Kapitel" } });
    z.zeileNr = z.zeile.createSpan({ cls: "eba-zf-zeile-nr" });
    z.zeileText = z.zeile.createSpan({ cls: "eba-zf-zeile-text" });
    ctx.obsidian.setIcon(z.zeile.createSpan({ cls: "eba-zf-zeile-pfeil" }), "chevron-down");
    z.zeile.addEventListener("click", () => blattAuf(z));
    z.beimScrollen = (e) => {
      if (z.bild || (e && z.blatt && z.blatt.contains(e.target))) return;
      z.bild = W.requestAnimationFrame(() => { z.bild = 0; if (z.bedarf) { markieren(z); durchgang(z); } else breite(z); });
    };
    view.contentEl.addEventListener("scroll", z.beimScrollen, true); // scroll steigt nicht auf: Leseansicht und Editor über capture
    if (typeof W.ResizeObserver === "function") { z.ro = new W.ResizeObserver(() => breite(z)); z.ro.observe(view.contentEl); }
    return z;
  };
  const abbauen = (view) => {
    const z = zustand.get(view);
    if (!z) return;
    zustand.delete(view);
    view.contentEl.removeEventListener("scroll", z.beimScrollen, true);
    if (z.ro) z.ro.disconnect();
    if (z.bild) z.W.cancelAnimationFrame(z.bild);
    blattZu(z);
    z.nav.remove();
    z.zeile.remove();
    view.contentEl.removeClass("eba-zf-mit-leiste");
    view.contentEl.removeClass("eba-zf-mit-zeile");
    view.contentEl.style.removeProperty("--eba-zf-oben");
  };

  // Telefon: beim ersten Öffnen auf diesem Gerät alle Kapitel zuklappen, wenn Obsidian für die Notiz keine Faltung gespeichert hat.
  // Nur einmal je Gerät, gemerkt in derselben Liste wie die vorgefalteten Folien (start.js, eba-vorgefaltet; start.js hält sie
  // bei Umbenennen und Löschen aktuell): Obsidian speichert „alles aufgeklappt“ als keine Faltung, ohne Merker klappte die Notiz
  // sonst bei jedem Öffnen wieder zu. Die Leseansicht faltet erst, wenn sie ihre Abschnitte kennt: nachfassen wie start.js
  // (höchstens 15 × 200 ms), dann speichert onMarkdownFold die Faltung.
  const VORGEFALTET = "eba-vorgefaltet";
  const merken = (f) => {
    const liste = app.loadLocalStorage(VORGEFALTET) || [];
    if (liste.indexOf(f.path) < 0) { liste.push(f.path); app.saveLocalStorage(VORGEFALTET, liste); }
  };
  const telefonFalten = async (view, f) => {
    if (!istTelefon(view) || !app.foldManager || (app.loadLocalStorage(VORGEFALTET) || []).indexOf(f.path) >= 0) return;
    if (await app.foldManager.load(f)) { merken(f); return; }
    const zeilen = (await app.vault.cachedRead(f)).split("\n").length;
    const info = { folds: kapitelFalten(headingsVon(f), zeilen), lines: zeilen };
    if (!info.folds.length) return;
    const anwenden = (rest) => {
      if (view.file !== f) return;
      try {
        const m = view.currentMode;
        m.applyFoldInfo(info);
        const steht = !m.getFoldInfo || ((m.getFoldInfo() || {}).folds || []).length > 0;
        if (!steht) { if (rest > 0) ctx.zeit(() => anwenden(rest - 1), 200); return; }
        if (view.onMarkdownFold) view.onMarkdownFold();
        merken(f);
      } catch (e) { /* offen lassen */ }
    };
    anwenden(15);
  };

  // Alle offenen Notizen: Navigation auf- oder abbauen, Kapitel aus dem metadataCache nachziehen
  const pflegen = () => {
    const offen = new Set();
    for (const l of app.workspace.getLeavesOfType("markdown")) {
      const v = l.view, f = v && v.file;
      if (!f || !v.contentEl || !istZusammenfassung(fmVon(f))) continue;
      offen.add(v);
      let z = zustand.get(v);
      if (z && z.datei !== f) { abbauen(v); z = null; }
      if (!z) {
        z = aufbauen(v); z.datei = f; zustand.set(v, z);
        telefonFalten(v, f).catch(() => {});
      }
      const kapitel = kapitelAus(headingsVon(f));
      const schluessel = kapitel.map((k) => k.zeile + k.kurz + k.text + "|" + k.unter.map((u) => u.zeile + u.text).join("|")).join("\n");
      if (schluessel !== z.schluessel) {
        z.kapitel = kapitel; z.schluessel = schluessel; z.bedarf = 0;
        z.nav.empty();
        z.liste = listeBauen(z.nav, z);
        blattZu(z);
      }
      breite(z);
    }
    for (const v of Array.from(zustand.keys())) if (!offen.has(v)) abbauen(v);
  };

  // ---------- Leseansicht und Editor: Attribute an den Überschriften ----------
  const nachbearbeiten = (el, c, bald) => {
    const f = app.vault.getAbstractFileByPath((c && c.sourcePath) || "");
    if (!f || !istZusammenfassung((c && c.frontmatter) || fmVon(f))) return;
    if (el.querySelector && el.querySelector('table, mjx-container[display="true"]')) {
      tabellenBeschriften(el);
      bald(); // Formeln messen, sobald der Abschnitt im Bild ist
    }
    const h = el.querySelector && el.querySelector(":scope > :is(h2, h3, h4)");
    const info = h && c.getSectionInfo && c.getSectionInfo(el);
    if (!info) return;
    h.setAttribute("data-eba-zeile", String(info.lineStart));
    const nr = nummern(headingsVon(f)).get(info.lineStart);
    if (nr) h.setAttribute("data-eba-nr", nr);
  };
  const editorErweiterung = () => {
    const V = ctx.cm && ctx.cm.view;
    if (!V || !V.ViewPlugin || !V.Decoration) return;
    const { ViewPlugin, Decoration } = V;
    const bauen = (view) => {
      try {
        const doc = view.state.doc, zeilen = [];
        for (let i = 1; i <= doc.lines; i++) zeilen.push(doc.line(i).text);
        if (!istZusammenfassung({ typ: typAus(zeilen) })) return Decoration.none;
        const hs = ueberschriften(zeilen), nr = nummern(hs), r = [];
        for (const h of hs) {
          if (h.level < 2 || h.level > 4) continue;
          const z = zeileVon(h), a = { "data-eba-zeile": String(z) };
          if (nr.has(z)) a["data-eba-nr"] = nr.get(z);
          r.push(Decoration.line({ attributes: a }).range(doc.line(z + 1).from));
        }
        return Decoration.set(r, true);
      } catch (e) { return Decoration.none; }
    };
    ctx.editor(ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = bauen(view); }
      update(u) { if (u.docChanged) this.decorations = bauen(u.view); }
    }, { decorations: (v) => v.decorations }));
  };

  const registrieren = () => {
    const nachziehen = ctx.entprellen(() => { for (const z of zustand.values()) { try { durchgang(z); } catch (e) { /* nächste */ } } }, 120);
    ctx.postprozessor((el, c) => { try { nachbearbeiten(el, c, nachziehen); } catch (e) { /* ohne Nummer */ } });
    try { editorErweiterung(); } catch (e) { console.error("Zusammenfassung: Editor", e); }
    if (!app.workspace || typeof app.workspace.getLeavesOfType !== "function") return;
    const bald = ctx.entprellen(() => { try { pflegen(); } catch (e) { console.error("Zusammenfassung: Navigation", e); } }, 80);
    ctx.an(app.workspace, "layout-change", bald);
    ctx.an(app.workspace, "file-open", bald);
    ctx.an(app.workspace, "active-leaf-change", bald);
    ctx.an(app.metadataCache, "changed", (f) => {
      for (const z of zustand.values()) if (z.view.file === f) { bald(); return; }
      if (istZusammenfassung(fmVon(f))) bald();
    });
    ctx.dom(document, "keydown", (e) => { if (e.key === "Escape") for (const z of zustand.values()) if (z.blatt) blattZu(z); });
    ctx.aufraeumen(() => { for (const v of Array.from(zustand.keys())) abbauen(v); });
    bald();
  };

  return {
    registrieren, kapitelAus, nummern, aktivBei, aktivZeile, stelleText, leisteAn, faltungenOhne, kapitelFalten, formelSkala, typAus,
    ueberschriften, klartext, istZusammenfassung, BREIT, PLATZ, FORMEL_MIN,
  };
};
