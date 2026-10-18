// Kopf-Karte jeder Notiz (Bedien-Baustein, seit 0.4.6, Konsistenz-Audit Schritt 4): Unter dem Titel einer Termin-, Stundenplan-,
// SQ- und Begleitnotiz steht eine Zeile wie der Kopf der Vorlesungsnotiz (vorlesung.js): links Art · Modul · Tag, rechts genau EIN
// Status-Knopf. Vorher ging der Status dieser Notizen nur über die Eigenschaften, die in der Leseansicht gar nicht zu sehen sind.
//   Termin             Offen ⇄ Erledigt (Feld erledigt)
//   Unterlage          Noch nicht gelesen ⇄ Gelesen (Feld status: neu, gelesen; „bearbeitet“ zählt als gelesen)
//   SQ-Kurs            geplant → angemeldet → zugelassen → bestanden (Feld status, Auswahl im Menü)
//   Lehrveranstaltung  Im Stundenplan ⇄ Besuche ich nicht (ctx.modell.besuchtNicht: Notiz einer Quelle über ihren Schlüssel in
//                      stundenplan_ausgeblendet der Einstellungen, zentral über die Aktion besuche-nicht; eigene Notiz: Feld
//                      besuche_nicht); mit Hinweis und „Rückgängig“, weil sie danach im Stundenplan fehlt.
// Vorlesung und Übungsblatt haben ihre Kopf-Karte schon im Text (Codeblöcke eba-vorlesung, eba-uebungsblatt) und bleiben, wie sie sind.
// Die Notiz selbst ändert sich dafür nicht: Leseansicht über den Post-Processor (Karte im Abschnitt des ersten # Titels),
// Bearbeitungsansicht über eine CodeMirror-Erweiterung (Block unter dem Titel). Farbe des Knopfs aus ctx.modell.statusArt: erledigt
// gefüllt (wie „Nachgearbeitet“), ein Zwischenstand getönt im Akzent, offen warm, „Besuche ich nicht“ leise. Schreibt nur nach einem
// Tipp. Stil: eba-core.css Abschnitt 64. Doku: docs/architektur.md, „Bedien-Bausteine“.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const TYPEN = ["termin", "unterlage", "sq_kurs", "lehrveranstaltung"];
const SQ = ["geplant", "angemeldet", "zugelassen", "bestanden"];
const gross = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const txt = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();

// Status einer Notiz (rein, Tests): typ, Frontmatter, nicht (Besuche ich nicht, nur Lehrveranstaltung) →
// { wert, text, wort (für statusArt), fertig (letzte Stufe), neu (Wert nach einem Tipp), menue (Stufen zur Auswahl) } oder null
const statusVon = (typ, fm, nicht) => {
  fm = fm || {};
  if (typ === "termin") {
    const an = fm.erledigt === true;
    return { wert: an, text: an ? "Erledigt" : "Offen", wort: an ? "erledigt" : "offen", fertig: an, neu: !an };
  }
  if (typ === "unterlage") {
    const s = txt(fm.status).toLowerCase();
    const gelesen = s === "gelesen" || s === "bearbeitet";
    return { wert: gelesen ? s : "neu", text: gelesen ? gross(s) : "Noch nicht gelesen", wort: gelesen ? s : "neu", fertig: gelesen, neu: gelesen ? "neu" : "gelesen" };
  }
  if (typ === "sq_kurs") {
    const s = SQ.indexOf(txt(fm.status).toLowerCase()) >= 0 ? txt(fm.status).toLowerCase() : SQ[0];
    return { wert: s, text: gross(s), wort: s, fertig: s === SQ[SQ.length - 1], neu: SQ[(SQ.indexOf(s) + 1) % SQ.length], menue: SQ.slice() };
  }
  if (typ === "lehrveranstaltung") {
    return nicht ? { wert: false, text: "Besuche ich nicht", wort: "besuche ich nicht", fertig: false, neu: true, leise: true }
      : { wert: true, text: "Im Stundenplan", wort: "im stundenplan", fertig: true, neu: false };
  }
  return null;
};
// Klasse des Knopfs aus dem Ton (statusArt): gefüllt, getönt, leise oder warm (offen)
const klasseVon = (s, ton) => (s.leise ? "leise" : ton === "ok" ? (s.fertig ? "fertig" : "zwischen") : "");

module.exports = function (ctx) {
  const app = window.app;
  const O = ctx.obsidian || {};
  const M = () => ctx.modell;
  const fmVon = (f) => { const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const pad = (n) => String(n).padStart(2, "0");

  // Linke Seite der Zeile: was die Notiz ist, in Label-Schrift („Frist · B110 · Do 05.11. · 14:00“)
  const labelVon = (typ, f, fm) => {
    const m = M(), z = m && m.zeit;
    if (typ === "termin") {
      const t = m && m.terminLesen ? m.terminLesen({ f, fm }) : null;
      if (!t) return [txt(fm.kategorie) || "Termin", txt(fm.code)].filter(Boolean).join(" · ");
      const tag = z ? (t.bis ? z.spanne(t.datum, t.bis) : z.datum(t.datum)) : t.datum;
      return [t.art === "zwischentest" ? "Zwischentest" : t.kategorie, t.code, tag, t.zeit].filter(Boolean).join(" · ");
    }
    if (typ === "unterlage") {
      const nr = fm.nummer != null && fm.nummer !== "" ? " " + pad(fm.nummer) : "";
      return [(txt(fm.art) || "Unterlage") + nr, txt(fm.code), txt(fm.semester)].filter(Boolean).join(" · ");
    }
    if (typ === "sq_kurs") return ["SQ-Kurs", txt(fm.semester), fm.ects != null && fm.ects !== "" ? String(fm.ects).replace(".", ",") + " ECTS" : ""].filter(Boolean).join(" · ");
    const gruppe = txt(fm.gruppe), art = txt(fm.art) || "Lehrveranstaltung";
    const tag = z && Number(fm.wochentag) >= 1 && Number(fm.wochentag) <= 7 ? z.WT[Number(fm.wochentag) % 7] : "";
    const zeit = [tag, txt(fm.beginn) + (fm.ende ? "–" + txt(fm.ende) : "")].filter(Boolean).join(" ");
    return [art, gruppe ? (/^\d+$/.test(gruppe) ? "Gruppe " + gruppe : gruppe) : "", txt(fm.code), zeit].filter(Boolean).join(" · ");
  };

  // ---------- Symbole als eigenes SVG (wie vorlesung.js; setIcon blieb auf dem iPad leer) ----------
  const SYM = {
    status: [["circle", { cx: 12, cy: 12, r: 9 }]],
    fertig: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "m8 12.5 2.6 2.5L16 9.5" }]],
    pfeil: [["path", { d: "m6 9 6 6 6-6" }]],
  };
  const symbol = (eltern, name) => {
    const NS = "http://www.w3.org/2000/svg", doc = eltern.ownerDocument;
    const svg = doc.createElementNS(NS, "svg");
    for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: "14", height: "14", fill: "none", stroke: "currentColor", "stroke-width": "2",
      "stroke-linecap": "round", "stroke-linejoin": "round", class: "eba-vorl-sym", "aria-hidden": "true" })) svg.setAttribute(k, v);
    for (const [tag, at] of SYM[name] || []) { const e = doc.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, String(at[k])); svg.appendChild(e); }
    eltern.appendChild(svg);
  };

  // ---------- Status setzen (nur nach einem Tipp) ----------
  const feldSetzen = async (f, feld, wert) => app.fileManager.processFrontMatter(f, (m) => { m[feld] = wert; });
  // Lehrveranstaltung in den Stundenplan bzw. heraus; nicht = true: „Besuche ich nicht“. Mit Hinweis und Rückgängig.
  const besuchen = async (f, nicht, still) => {
    const fm = fmVon(f), name = txt(fm.titel) || f.basename;
    if (fm.herkunft === "zentral" && fm.zentral_id) { await ctx.aktion(nicht ? "besuche-nicht" : "wieder-zeigen", { id: String(fm.zentral_id) }); return; }
    const schluessel = M() && M().besuchSchluessel ? M().besuchSchluessel(fm) : "";
    if (schluessel) {
      const e = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
      if (!e) return;
      await app.fileManager.processFrontMatter(e, (x) => {
        const l = (Array.isArray(x.stundenplan_ausgeblendet) ? x.stundenplan_ausgeblendet : []).map(String).filter((k) => k !== schluessel);
        if (nicht) l.push(schluessel);
        x.stundenplan_ausgeblendet = l;
      });
    } else await app.fileManager.processFrontMatter(f, (m) => { if (nicht) m.besuche_nicht = true; else delete m.besuche_nicht; });
    if (still) return;
    ctx.hinweis(nicht ? `${name} steht nicht mehr in deinem Stundenplan.` : `${name} steht wieder in deinem Stundenplan.`,
      nicht ? { aktion: { text: "Rückgängig", ausfuehren: () => besuchen(f, false, true) } } : {});
  };
  const setzen = async (typ, f, s, wert) => {
    if (typ === "termin") return feldSetzen(f, "erledigt", wert);
    if (typ === "unterlage" || typ === "sq_kurs") return feldSetzen(f, "status", wert);
    if (typ === "lehrveranstaltung") return besuchen(f, !wert);
    return undefined;
  };
  const menue = (e, typ, f, s) => {
    if (!O.Menu) return;
    const m = new O.Menu();
    for (const w of s.menue) m.addItem((i) => { i.setTitle(gross(w)); i.setChecked(w === s.wert); i.onClick(() => { setzen(typ, f, s, w).catch((x) => console.error("Kopf", x)); }); });
    const r = e.currentTarget.getBoundingClientRect();
    m.showAtPosition({ x: r.left, y: r.bottom + 4 });
  };

  // ---------- Zeichnen ----------
  const angezeigt = new Set(); // { el, pfad } aller gezeichneten Karten (Lese- und Bearbeitungsansicht), zum Neuzeichnen
  const zeichnen = (el, f) => {
    const fm = fmVon(f), typ = txt(fm.typ);
    el.empty();
    el.addClass("eba-vorl", "eba-notizkopf");
    if (TYPEN.indexOf(typ) < 0) return;
    const nicht = typ === "lehrveranstaltung" && !!(M() && M().besuchtNicht && M().besuchtNicht(fm));
    const s = statusVon(typ, fm, nicht);
    const ton = M() && M().statusArt ? M().statusArt(typ, s.wort) : "leer";
    const kopf = el.createDiv({ cls: "eba-vorl-karte" }).createDiv({ cls: "eba-vorl-kopf" });
    kopf.createSpan({ cls: "eba-vorl-label", text: labelVon(typ, f, fm) });
    const b = kopf.createEl("button", { cls: ("eba-vorl-status " + klasseVon(s, ton)).trim(),
      attr: { type: "button", "aria-label": s.menue ? `Stand: ${s.text}. Ändern` : s.text, "aria-pressed": s.menue ? null : String(!!s.fertig) } });
    symbol(b, s.fertig ? "fertig" : "status");
    b.createSpan({ text: s.text });
    if (s.menue) { symbol(b, "pfeil"); b.setAttr("aria-haspopup", "menu"); }
    b.addEventListener("mousedown", (e) => e.stopPropagation()); // Bearbeitungsansicht: nicht in den Quelltext springen
    b.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (s.menue) { menue(e, typ, f, s); return; }
      setzen(typ, f, s, s.neu).catch((x) => console.error("Kopf", x));
    });
  };
  const merken = (el, f) => {
    angezeigt.add({ el, pfad: f.path });
    if (angezeigt.size > 60) for (const x of Array.from(angezeigt)) if (!x.el.isConnected) angezeigt.delete(x);
  };
  // Neu zeichnen bei Änderungen an der Notiz oder den Einstellungen (Besuche ich nicht)
  const neu = (pfad) => {
    for (const x of Array.from(angezeigt)) {
      if (!x.el.isConnected) { angezeigt.delete(x); continue; }
      if (pfad && pfad !== EINSTELLUNGEN && x.pfad !== pfad) continue;
      const f = app.vault.getAbstractFileByPath(x.pfad);
      if (f) { try { zeichnen(x.el, f); } catch (e) { console.error("Kopf", e); } }
    }
  };
  const passt = (f) => !!f && f.extension === "md" && TYPEN.indexOf(txt(fmVon(f).typ)) >= 0;
  // Zeile des ersten # Titels (0-basiert) oder -1
  const titelZeile = (f) => {
    const c = f && app.metadataCache.getFileCache(f);
    const h = ((c && c.headings) || []).find((x) => x.level === 1);
    return h ? h.position.start.line : -1;
  };

  // Leseansicht: die Karte kommt in den Abschnitt des ersten # Titels (nicht in Einbettungen und Hover-Vorschauen)
  const nachbearbeiten = (el, mdCtx) => {
    const f = app.vault.getAbstractFileByPath((mdCtx && mdCtx.sourcePath) || "");
    if (!passt(f) || !el.querySelector(":scope > h1")) return;
    const info = mdCtx.getSectionInfo && mdCtx.getSectionInfo(el);
    if (info && info.lineStart !== titelZeile(f)) return;
    if (el.querySelector(":scope > .eba-notizkopf")) return;
    const karte = el.createDiv();
    zeichnen(karte, f);
    merken(karte, f);
    ctx.zeit(() => { if (karte.isConnected && karte.closest(".markdown-embed, .hover-popover, .popover")) karte.remove(); }, 200);
  };

  // Bearbeitungsansicht: Block unter dem ersten # Titel (StateField, Block-Widgets gehen nicht über ViewPlugin)
  const editorErweiterung = () => {
    const V = ctx.cm && ctx.cm.view, S = ctx.cm && ctx.cm.state, info = O.editorInfoField;
    if (!V || !S || !V.WidgetType || !V.Decoration || !V.EditorView || !S.StateField || !info) return;
    class Karte extends V.WidgetType {
      constructor(pfad) { super(); this.pfad = pfad; }
      eq(o) { return o.pfad === this.pfad; }
      toDOM() {
        const el = document.createElement("div");
        const f = app.vault.getAbstractFileByPath(this.pfad);
        if (f) { try { zeichnen(el, f); merken(el, f); } catch (e) { console.error("Kopf", e); } }
        return el;
      }
      ignoreEvent() { return true; }
    }
    const bauen = (state) => {
      try {
        const x = state.field(info, false), f = x && x.file;
        if (!passt(f)) return V.Decoration.none;
        const doc = state.doc;
        let i = 1;
        if (doc.lines > 1 && doc.line(1).text.trim() === "---") { i = 2; while (i <= doc.lines && doc.line(i).text.trim() !== "---") i++; i++; }
        for (const bis = Math.min(doc.lines, i + 40); i <= bis; i++) {
          const z = doc.line(i);
          if (/^#\s/.test(z.text)) return V.Decoration.set([V.Decoration.widget({ widget: new Karte(f.path), block: true, side: 1 }).range(z.to)]);
        }
      } catch (e) { /* ohne Karte */ }
      return V.Decoration.none;
    };
    ctx.editor(S.StateField.define({
      create: (state) => bauen(state),
      update: (wert, tr) => (tr.docChanged ? bauen(tr.state) : wert),
      provide: (feld) => V.EditorView.decorations.from(feld),
    }));
  };

  const registrieren = () => {
    ctx.postprozessor((el, c) => { try { nachbearbeiten(el, c); } catch (e) { console.error("Kopf", e); } });
    try { editorErweiterung(); } catch (e) { console.error("Kopf Editor", e); }
    const bald = ctx.entprellen(() => neu(null), 300);
    ctx.an(app.metadataCache, "changed", (f) => { if (f && (f.path === EINSTELLUNGEN || Array.from(angezeigt).some((x) => x.pfad === f.path))) bald(); });
  };

  return { registrieren, statusVon, klasseVon, labelVon, zeichnen, TYPEN };
};
module.exports.statusVon = statusVon;
module.exports.klasseVon = klasseVon;
module.exports.TYPEN = TYPEN;
