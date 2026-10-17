// Bases-Tabellen auf dem iPhone als gestapelte Liste (statt seitlich zu scrollen). Jede Zeile einer Tabellenansicht in einer Karte [!eba-tabelle] wird ein Eintrag: Titel (Spalte mit
// Link, sonst erste Spalte) und darunter eine kleine Metazeile mit den übrigen Werten („6 ECTS · offen · 06.02.27“),
// „Öffnen ↗“ rechts; Gruppen als kleines Label mit Summe („Grundstudium · 60 ECTS“), leere Tabellen nur „Leer.“.
// Die Daten kommen aus der Bases-Ansicht selbst (view.data), nicht aus den gezeichneten Zellen: Obsidian zeichnet in
// Tabellen nur Zeilen und Spalten im sichtbaren Ausschnitt, die Liste ist trotzdem vollständig. Neu gezeichnet wird bei
// jeder Datenänderung (onDataUpdated der Tabellenansicht), in Lese- und Bearbeitungsansicht gleich.
// Ein/aus nur per CSS: die Liste entsteht nur, wo die Variable --eba-tliste: 1 gilt (eba-core.css
// Abschnitt 37: body.is-phone .callout[data-callout="eba-tabelle"]); dort blendet das CSS Tabellenkopf, Zeilen und
// Summenzeile aus. PC/iPad: Variable fehlt, nichts geändert. Ausnahme per Karte: [!eba-tabelle|handy-tabelle].
// Werte nur lesen; Kontrollkästchen (z. B. Nachgearbeitet) bleiben antippbar und schreiben ins Frontmatter, erscheinen aber
// nur bei Notizen, die das Feld haben. Modulseiten zeigen die Liste auch auf iPad/PC (eba-core.css Abschnitt 58).
// Erweiterung: registrieren() erweitert die Tabellenansicht (Fabrik und Prototyp, Merker __ebaTl/__ebaTlPatch), abmelden()
// nimmt das beim Hot-Reload und beim Entladen des Plugins vollständig zurück. Post-Processor über ctx.postprozessor.
// Listen auf iOS: rechts Note („1,7“, Spalte „Note“) bzw. Status-Chip (Spalte „Status“/„Stand“), sonst
// „Öffnen ↗“; in einer Gruppe überall gleiche Werte (z. B. „Block 34 %“) einmal im Gruppenkopf; „–“ entfällt; ein in der
// ganzen Ansicht gleicher Status neben „Öffnen ↗“ entfällt („neu“ in „Zu lesen“). Dazu ein Post-Processor, der in
// Markdown-Tabellen ab 4 Spalten jeder Zelle ihren Spaltenkopf mitgibt (data-eba-k, für die gestapelte iPhone-Ansicht).
// iOS: keine Node-APIs, kein Lookbehind/.at()/findLast; jeder Schritt in try/catch, ohne CSS-Schalter bleibt die Tabelle.
module.exports = function (ctx) {
  const app = window.app;
  const Keymap = ctx?.obsidian?.Keymap;
  // Spaltennamen, deren Wert ohne Bezeichnung verständlich ist bzw. deren Bezeichnung als Einheit dahinter steht
  const OHNE = new Set(["Status", "Stand", "Modul", "Art", "Typ", "Bereich", "Bereiche", "Datum", "Termin", "Wann", "Fällig", "Hinweis",
    "Datei", "Unterlage", "Blatt", "Notiz", "Veranstaltung", "Raum", "Zeit", "Kurs", "Anbieter", "Turnus", "Sprache", "Größe", "Name",
    "Prüfungstermin", "Prüfung", "Was daraus folgt", "Aktuell"]);
  const EINHEIT = new Set(["ECTS", "Seiten"]);
  const ZUSAMMEN = { Sum: "", Average: "Ø ", Median: "Median ", Min: "min. ", Max: "max. " };

  const heute = new Date();
  const datumText = (s) => {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return `${m[3]}.${m[2]}.` + (+m[1] === heute.getFullYear() ? "" : m[1].slice(2));
  };
  const typ = (v) => (v && v.type ? String(v.type) : "Null"); // type ist teils eine Funktion mit Namen als Text
  const leer = (el) => !el.textContent.trim() && !el.querySelector("input, img, svg");

  // Wert ohne Bezeichnung in el schreiben (Text, Link, HTML …)
  const wertIn = (el, v) => {
    const t = typ(v);
    if (t === "Null") return;
    if (t === "Date") { const d = datumText(v.toString()); if (d) { el.appendText(d); return; } }
    if (t === "Number") { const s = String(v.toString()); if (/^-?\d+(\.\d+)?$/.test(s)) { el.appendText(String(Math.round(+s * 100) / 100).replace(".", ",")); return; } }
    if (t === "Boolean") { el.appendText(String(v.toString()) === "true" ? "ja" : "nein"); return; }
    v.renderTo(el, app.renderContext);
  };
  // Bezeichnung + Wert („Note 1,7“, „6 ECTS“, „offen“)
  const beschriftet = (w, name, v, vorsatz = "") => {
    const tmp = w.doc.createElement("span");
    wertIn(tmp, v);
    if (leer(tmp) || /^[–-]$/.test(tmp.textContent.trim())) return false; // „–“ (kein Wert) nicht als „Block –“ zeigen
    if (EINHEIT.has(name)) { w.appendText(vorsatz); while (tmp.firstChild) w.appendChild(tmp.firstChild); w.appendText(" " + name); }
    else {
      if (!OHNE.has(name) || vorsatz) w.createSpan({ cls: "eba-tl-k", text: (vorsatz + name).trim() });
      while (tmp.firstChild) w.appendChild(tmp.firstChild);
    }
    return true;
  };

  const summenText = (view, eintraege) => {
    const s = view.config.summaries || {};
    const teile = [];
    for (const [prop, key] of Object.entries(s)) {
      try {
        const v = view.data.getSummaryValue(view.queryController, eintraege, prop, key);
        const sp = createSpan();
        if (beschriftet(sp, view.config.getDisplayName(prop), v, ZUSAMMEN[key] ?? key + " ")) teile.push(sp);
      } catch (e) {}
    }
    return teile;
  };

  const titelSpalte = (view, order, erster) => {
    if (order.includes("file.name")) return "file.name";
    for (const p of order) { try { if (typ(erster.getValue(p)) === "Link") return p; } catch (e) {} }
    return order[0];
  };

  // Rolle einer Spalte: Status (Chip rechts), Note (Zahl rechts) oder Metazeile
  const STATUS = new Set(["Status", "Stand"]);
  const NOTE = new Set(["Note", "Ergebnis"]);
  const NOTE_RE = /^\s*[1-5]([.,][0-9]+)?\s*$/;
  // Farbe des Status-Chips aus dem Text (wie die Formeln „stand“ der Seiten)
  const chipArt = (s) => {
    s = String(s || "").toLowerCase().trim();
    if (/^(bestanden|anerkannt|abgegeben|korrigiert|erledigt|gelesen|zugelassen|durchgearbeitet)$/.test(s)) return "ok";
    if (/^(nicht bestanden|überfällig|abgelehnt)$/.test(s)) return "bad";
    if (/^(angemeldet|in arbeit)$/.test(s)) return "warn";
    if (/^(läuft|neu)$/.test(s)) return "info";
    return "leer";
  };
  // Text eines Werts (für Vergleiche „in jeder Zeile gleich“)
  const textVon = (v, doc) => { const t = doc.createElement("span"); try { wertIn(t, v); } catch (e) {} return t.textContent.trim(); };

  const zeichnen = (view, liste) => {
    const cfg = view.config, data = view.data, doc = liste.doc || document;
    liste.empty();
    const order = cfg.getOrder() || [];
    const gruppen = data.groupedData || [];
    const alle = gruppen.flatMap((g) => g.entries || []);
    if (!alle.length || !order.length) { liste.createDiv({ cls: "eba-tl-leer", text: "Leer." }); return; }
    const gb = cfg.groupBy?.property;
    const titel = titelSpalte(view, order, alle[0]);
    const rest = order.filter((p) => p !== titel && p !== gb);
    const name = {}; for (const p of rest) { try { name[p] = cfg.getDisplayName(p); } catch (e) { name[p] = p; } }
    const statusSp = rest.find((p) => STATUS.has(name[p]));
    const noteSp = rest.find((p) => NOTE.has(name[p]));
    const hatSummen = Object.keys(cfg.summaries || {}).length > 0;
    // Status, der in der ganzen Ansicht gleich ist (z. B. „neu“ in „Zu lesen“): neben „Öffnen ↗“ nicht wiederholen
    let statusGleich = false;
    if (statusSp && alle.length >= 3) {
      try { const t0 = textVon(alle[0].getValue(statusSp), doc); statusGleich = !!t0 && alle.every((e) => textVon(e.getValue(statusSp), doc) === t0); } catch (e) {}
    }
    for (const g of gruppen) {
      if (!g.entries?.length) continue;
      // Werte, die in der ganzen Gruppe gleich sind (z. B. „Block 34 %“ im Grundstudium), stehen einmal im Gruppenkopf
      const gleich = new Set();
      if (gb && g.key && g.entries.length > 1) {
        for (const p of rest) {
          if (p === statusSp || p === noteSp || (cfg.summaries || {})[p]) continue;
          try {
            const t0 = textVon(g.entries[0].getValue(p), doc);
            if (t0 && g.entries.every((e) => textVon(e.getValue(p), doc) === t0) && typ(g.entries[0].getValue(p)) !== "HTML") gleich.add(p);
          } catch (e) {}
        }
      }
      if (gb && g.key) {
        const kopf = liste.createDiv("eba-tl-gruppe");
        const n = kopf.createSpan("eba-tl-gname"); wertIn(n, g.key); if (leer(n)) n.setText("Ohne Angabe");
        for (const p of gleich) { const sp = kopf.createSpan("eba-tl-gwert"); if (!beschriftet(sp, name[p], g.entries[0].getValue(p))) sp.remove(); }
        if (hatSummen) for (const sp of summenText(view, g.entries)) { sp.addClass("eba-tl-summe"); kopf.appendChild(sp); }
      }
      for (const e of g.entries) {
        const z = liste.createDiv("eba-tl-zeile");
        z.__ebaDatei = e.file;
        const txt = z.createDiv("eba-tl-text");
        const t = txt.createDiv("eba-tl-titel");
        try {
          if (titel === "file.name") app.renderContext.renderFileLink(e.file, null, t);
          else wertIn(t, e.getValue(titel));
        } catch (x) {}
        if (leer(t)) t.setText(e.file?.basename || "–");
        const meta = txt.createDiv("eba-tl-meta");
        const ende = z.createDiv("eba-tl-ende");
        let aktion = null, chip = null, note = null;
        // Note rechts als Zahl („1,7“), wenn gültig
        if (noteSp) { try { const s = textVon(e.getValue(noteSp), doc); if (NOTE_RE.test(s)) note = s.replace(".", ","); } catch (x) {} }
        // Status rechts als Chip (fertiger Chip aus einer Formel oder Text)
        if (statusSp) {
          try {
            const v = e.getValue(statusSp);
            const tmp = doc.createElement("span"); wertIn(tmp, v);
            const p = tmp.querySelector(".eba-pill");
            if (p) chip = p;
            else { const s = tmp.textContent.trim(); if (s) { chip = doc.createElement("span"); chip.className = "eba-pill " + chipArt(s); chip.textContent = s; } }
          } catch (x) {}
        }
        for (const p of rest) {
          if (p === statusSp || p === noteSp || gleich.has(p)) continue;
          let v; try { v = e.getValue(p); } catch (x) { continue; }
          const nm = name[p];
          const feld = p.startsWith("note.") ? p.slice(5) : null;
          // Kontrollkästchen im Frontmatter: antippbar wie in der Tabelle
          if (feld && e.file?.extension === "md") {
            let art = null;
            try { const ti = app.metadataTypeManager.getTypeInfo(feld, e.getRawProperty?.(feld)); art = ti?.expected?.type || ti?.inferred?.type; } catch (x) {}
            if (art === "checkbox") {
              // Nur bei Notizen, die das Feld haben (z. B. „Nachgearbeitet“ bei Vorlesungen, nicht bei Terminen in derselben Liste)
              const fmDa = app.metadataCache.getFileCache(e.file)?.frontmatter;
              if (!fmDa || !Object.prototype.hasOwnProperty.call(fmDa, feld)) continue;
              const w = meta.createEl("label", { cls: "eba-tl-w eba-tl-check" });
              const cb = w.createEl("input", { type: "checkbox" });
              cb.checked = String(v?.toString?.()) === "true";
              w.appendText(nm);
              cb.addEventListener("change", () => { const neu = cb.checked; app.fileManager.processFrontMatter(e.file, (fm) => { fm[feld] = neu; }); });
              continue;
            }
          }
          if (typ(v) === "HTML") {
            const tmp = doc.createElement("span"); wertIn(tmp, v);
            if (leer(tmp)) continue;
            const a = tmp.querySelector("a.eba-oeffnen");
            if (a && tmp.textContent.trim() === a.textContent.trim()) { aktion = doc.createElement("div"); aktion.className = "eba-tl-aktion"; while (tmp.firstChild) aktion.appendChild(tmp.firstChild); continue; }
            // Chip aus einer weiteren Spalte (z. B. „geschätzt“) ohne Status-Spalte: rechts
            if (!chip && !statusSp && tmp.childElementCount === 1 && tmp.firstElementChild.classList.contains("eba-pill") && tmp.textContent.trim() === tmp.firstElementChild.textContent.trim()) { chip = tmp.firstElementChild; continue; }
          }
          const w = meta.createSpan("eba-tl-w");
          if (!beschriftet(w, nm, v)) w.remove();
        }
        // Rechts: Note, sonst Chip (bei Note und bestanden nur die Note); mit „Öffnen ↗“ wandert der Chip in die Metazeile
        if (note) { ende.createSpan({ cls: "eba-tl-note", text: note }); if (chip && chip.classList.contains("ok")) chip = null; }
        if (chip && aktion) { if (!statusGleich) { const w = meta.createSpan("eba-tl-w"); w.appendChild(chip); } chip = null; }
        if (chip) ende.appendChild(chip);
        if (aktion) ende.appendChild(aktion);
        else if (e.file) z.addClass("eba-tl-nav");
        if (!ende.childElementCount) ende.remove();
        if (!meta.childElementCount) meta.remove();
      }
    }
    if (hatSummen) {
      const teile = summenText(view, alle);
      if (teile.length) { const f = liste.createDiv("eba-tl-fuss"); f.createSpan({ cls: "eba-tl-k", text: "Gesamt" }); for (const sp of teile) { sp.addClass("eba-tl-summe"); f.appendChild(sp); } }
    }
  };

  const klick = (liste, view) => {
    const quelle = () => view.queryController?.currentFile?.path || "";
    liste.addEventListener("mousedown", (ev) => ev.stopPropagation()); // Bearbeitungsansicht: nicht in den Quelltext springen
    liste.addEventListener("click", (ev) => {
      if (ev.target.closest("input, label")) { ev.stopPropagation(); return; }
      const mod = Keymap ? Keymap.isModEvent(ev) : false;
      const il = ev.target.closest(".internal-link[data-href]");
      if (il) { ev.preventDefault(); ev.stopPropagation(); app.workspace.openLinkText(il.getAttribute("data-href"), quelle(), mod); return; }
      if (ev.target.closest("a")) return; // externe Links / obsidian:// (Öffnen ↗) wie bisher
      const z = ev.target.closest(".eba-tl-zeile");
      if (z && z.__ebaDatei) { ev.preventDefault(); ev.stopPropagation(); app.workspace.getLeaf(mod).openFile(z.__ebaDatei); }
    });
  };

  const aktualisieren = (view) => {
    const box = view?.containerEl?.parentElement;
    if (!box || !box.classList.contains("bases-view")) return;
    if (!box.isConnected) {
      // Leseansicht zeichnet Abschnitte teils, bevor sie im Dokument hängen: beim Einfügen nachholen (einmal)
      if (!view.__ebaTlWartet && typeof box.onNodeInserted === "function") { view.__ebaTlWartet = true; box.onNodeInserted(() => { view.__ebaTlWartet = false; aktualisieren(view); }, true); }
      return;
    }
    const an = (box.win || window).getComputedStyle(box).getPropertyValue("--eba-tliste").trim() === "1";
    let liste = view.__ebaTlEl;
    if (!an) { if (liste) { view.__ebaTlRO?.disconnect(); view.__ebaTlRO = null; liste.remove(); view.__ebaTlEl = null; } return; }
    if (!liste) {
      liste = view.__ebaTlEl = box.doc.createElement("div"); liste.className = "eba-tl"; klick(liste, view);
      // Eingeklappte Karten (z. B. „Ohne Begleitnotiz“) erst beim Aufklappen zeichnen: der Beobachter meldet die neue Größe
      // vor dem Zeichnen des Bildschirms, die Tabelle blitzt also nicht auf.
      try {
        const ro = new (box.win || window).ResizeObserver(() => { if (view.__ebaTlOffen && box.offsetParent) { view.__ebaTlOffen = false; malen(view, liste); } });
        ro.observe(box); view.__ebaTlRO = ro;
      } catch (e) {}
    }
    if (liste.parentElement !== box) box.appendChild(liste);
    if (!box.offsetParent && view.__ebaTlRO) { view.__ebaTlOffen = true; return; }
    view.__ebaTlOffen = false;
    malen(view, liste);
  };
  const malen = (view, liste) => {
    try { zeichnen(view, liste); } catch (e) { liste.empty(); liste.setText("Tabelle: Fehler – " + e.message); console.error("tabellen", e); }
  };

  // Liste einer Ansicht entfernen (Ansicht entladen, Hot-Reload)
  const listeWeg = (v) => { try { v.__ebaTlRO?.disconnect(); v.__ebaTlRO = null; v.__ebaTlEl?.remove(); v.__ebaTlEl = null; } catch (e) {} };
  // Prototyp der Tabellenansicht erweitern; eine ältere Erweiterung (frühere Fassung) vorher zurücknehmen
  const gepatcht = new Set();
  const eigen = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const entpatchen = (P) => {
    const x = P && P.__ebaTlPatch;
    if (!x) return;
    if (x.oduEigen === false) delete P.onDataUpdated; else P.onDataUpdated = x.odu;
    if (x.unlEigen === false) delete P.onunload; else P.onunload = x.unl;
    delete P.__ebaTlPatch;
    gepatcht.delete(P);
  };
  const patchen = (P) => {
    if (!P || typeof P.onDataUpdated !== "function") return;
    if (gepatcht.has(P)) return;
    entpatchen(P);
    const odu = P.onDataUpdated, unl = P.onunload;
    const x = { odu, unl, oduEigen: eigen(P, "onDataUpdated"), unlEigen: eigen(P, "onunload") };
    P.onDataUpdated = function () {
      const r = odu.apply(this, arguments);
      try { aktualisieren(this); } catch (e) { console.error("tabellen", e); }
      return r;
    };
    P.onunload = function () {
      listeWeg(this);
      return unl ? unl.apply(this, arguments) : undefined;
    };
    P.__ebaTlPatch = x;
    gepatcht.add(P);
  };

  // Alle schon geladenen Tabellenansichten (Komponentenbaum der offenen Tabs)
  const ansichten = () => {
    const aus = [], gesehen = new Set();
    const lauf = (c, t) => {
      if (!c || gesehen.has(c) || t > 30) return; gesehen.add(c);
      if (c.data && c.config && c.cellLookup) aus.push(c);
      for (const k of c._children || []) lauf(k, t + 1);
    };
    for (const l of app.workspace.getLeavesOfType("markdown")) lauf(l.view, 0);
    return aus;
  };

  // Markdown-Tabellen ab 4 Spalten in Karten: jede Zelle bekommt ihren Spaltenkopf als data-eba-k; das CSS
  // (eba-core.css) stapelt sie auf dem iPhone („Sternchen A 2.j · Bearbeiten Blatt 1“). Am PC/iPad nur ein unsichtbares Attribut.
  const mdKoepfe = (el) => {
    for (const t of el.querySelectorAll("table")) {
      const k = Array.from(t.querySelectorAll("thead th")).map((th) => th.textContent.trim());
      if (k.length < 4) continue;
      for (const tr of t.querySelectorAll("tbody tr")) Array.from(tr.children).forEach((td, i) => { if (k[i]) td.setAttribute("data-eba-k", k[i]); });
    }
  };

  const tabellenReg = () => app.internalPlugins?.plugins?.bases?.instance?.registrations?.table;
  const registrieren = () => {
    ctx.postprozessor((el) => { try { if (el.querySelector("table")) mdKoepfe(el); } catch (e) {} });
    const reg = tabellenReg();
    if (reg && typeof reg.factory === "function") {
      if (reg.__ebaTl) reg.factory = reg.__ebaTl; // ältere Fassung zurücknehmen
      const f = reg.factory;
      reg.factory = function () { const v = f.apply(this, arguments); try { patchen(Object.getPrototypeOf(v)); } catch (e) {} return v; };
      reg.__ebaTl = f;
    }
    for (const v of ansichten()) { patchen(Object.getPrototypeOf(v)); aktualisieren(v); }
  };

  // Hot-Reload/Entladen: Bases wieder im Originalzustand (Fabrik, Prototypen, keine Listen)
  const abmelden = () => {
    const reg = tabellenReg();
    if (reg && reg.__ebaTl) { reg.factory = reg.__ebaTl; delete reg.__ebaTl; }
    for (const v of ansichten()) { entpatchen(Object.getPrototypeOf(v)); listeWeg(v); }
    for (const P of Array.from(gepatcht)) entpatchen(P);
  };

  return { registrieren, abmelden, aktualisieren, zeichnen };
};
