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
// Seit 19.10.2026 außerdem:
//  - Rechts im Kopf „⋯“ mit „Eigenschaften“: Die Eigenschaften der Notizen des Plugins sind in keiner Ansicht zu sehen (eba-core.css
//    Abschnitt 25, Klasse eba-notiz aus start.js), geändert wird im Kopf (Entscheidung E4). Der Menüpunkt zeigt sie für diese Notiz
//    aufgeklappt, bis man ihn noch einmal tippt oder Obsidian neu startet. Vorlesung und Übungsblatt nehmen dasselbe (ctx.kopf.mehr,
//    weitere Menüpunkte als drittes Argument [{ titel, aktion }], z. B. „Andere Folien …“ in der Vorlesungsnotiz).
//  - Der Modulcode im Kopf öffnet die Modulseite.
//  - Leere Abschnitte (rein: leereAbschnitte) sind in Notizen des Plugins nicht zu sehen: in der Leseansicht keine Überschrift mit
//    nur leeren Punkten („- “, „- [ ] “) darunter, in der Bearbeitungsansicht der Begleitnotizen auch nicht, solange der Cursor
//    nicht darin steht. Die Notiz ändert sich dafür nicht (auch ältere und vom Uni-Abgleich geschriebene sehen so ruhig aus).
//  - Der Kasten „Eckdaten“ der Begleitnotizen (bis 0.4.6 erzeugt) verschwindet: Modul, Art und Semester stehen im Kopf, die Seiten im
//    Titel des PDF-Kastens, „Öffnen“ in dessen Kopfzeile (pdfkasten.js). Nur Zeilen, die das Plugin selbst geschrieben hat
//    (eckZeileErzeugt); eigener Text darin bleibt stehen. Nur in Notizen mit PDF-Kasten (hatPdfKasten): Ohne (Word, PowerPoint,
//    Excel, ZIP, sehr große PDF) ist „Öffnen ↗“ dort der einzige Weg zur Datei, darum bleibt der Kasten; nur „Größe ⇅“ fällt weg.
// Seit 20.10.2026: Die Stundenplan-Notiz eines Tutoriums zeigt unter dem Kopf die Unterlagen aus dem Bereich Tutorium ihres Moduls,
// die einer Übung die Übungen, als Chips wie die Vorlesungsnotiz (höchstens drei, neueste Nummer zuerst; Tipp öffnet die
// Begleitnotiz), bei mehr „Alle Unterlagen“ zur Modulseite. Vorher fand man ein Blatt aus dem Ordner der eigenen Tutoriumsgruppe
// vom Tutorium aus nicht. Seit 24.10.2026 ebenso ein Lab („Data Science Lab“): die Unterlagen aus dem Bereich Lab, eine je Sitzung.
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

// Unterlagen zu einer Übung, einem Tutorium oder einem Lab im Stundenplan, jeweils aus dem eigenen Bereich: Tutorium → Unterlagen
// der Art „Tutorium“, Übung (auch „Übungsteil“) → Art „Übung“, Lab („Lab“, „Data Science Lab“, „R Lab“) → Art „Lab“, desselben
// Moduls. Höchste Nummer zuerst (das neueste Blatt), ohne Nummer (Aufgabenkatalog, Vorlage) danach; beim Lab eine je Sitzung. lfm = Eigenschaften der
// Stundenplan-Notiz, unterlagen = [{ f, fm }] → { art, blaetter: [{ f, nr, titel }] (höchstens max), mehr: wie viele darüber
// hinaus } oder null, wenn die Notiz keine Übung, kein Tutorium und kein Lab ist.
const bereichVon = (art) => (/tutori/i.test(art) ? "Tutorium" : /(ü|ue)bung/i.test(art) ? "Übung"
  : /(^|[^a-zäöüß])labs?([^a-zäöüß]|$)/i.test(art) ? "Lab" : "");
// Welche Unterlage einer Lab-Sitzung der Chip zeigt: was man liest (PDF, HTML mit Ausgaben) vor dem Notebook, vor Code, vor Daten;
// eine Lösung nach allem anderen (im Titel oder im Link der Datei samt Alias, auch „Lsg“). Endungen aus „format“, sonst aus „datei“
// („[[S110 Lab 02.Rmd]]“, „[[S110 Lab 02.Rmd|Notebook]]“).
const LOESUNG = /l(ö|oe)sung|(^|[^a-zäöüß])lsg([^a-zäöüß]|$)|solution/i;
const labRang = (fm) => {
  const datei = txt(fm.datei).replace(/^\[\[|\]\]$/g, "");
  const e = (txt(fm.format) || (datei.split("|")[0].match(/\.([a-z0-9]+)$/i) || ["", ""])[1]).toLowerCase().split(/[\s,]+/);
  const hat = (l) => l.some((x) => e.indexOf(x) >= 0);
  const r = hat(["pdf", "html"]) ? 0 : hat(["ipynb", "rmd", "qmd"]) ? 1 : hat(["r", "py", "do", "jl", "sql"]) ? 2 : 3;
  return r + (LOESUNG.test(txt(fm.titel)) || LOESUNG.test(datei) ? 10 : 0);
};
const blaetterFuer = (lfm, unterlagen, max) => {
  const code = txt(lfm && lfm.code), bereich = bereichVon(txt(lfm && lfm.art));
  if (!code || !bereich) return null;
  const nummer = (v) => (v === "" || v == null || !isFinite(Number(v)) ? null : Number(v));
  // Ohne Titel der Dateiname ohne Kürzel, Art und Nummer („S100 Übung 01 Blatt“ → „Blatt“), wie auf der Modulseite
  const ausName = (b) => {
    const w = txt(b).split(/\s+/).filter(Boolean);
    if (w[0] === code) w.shift();
    if (w.length && w[0].toLowerCase() === bereich.toLowerCase()) w.shift();
    if (w.length && /^\d{1,3}$/.test(w[0])) w.shift();
    return w.join(" ");
  };
  const alle = (unterlagen || []).filter((x) => x && x.fm && txt(x.fm.typ) === "unterlage" && txt(x.fm.code) === code
    && txt(x.fm.art).toLowerCase() === bereich.toLowerCase())
    .map((x) => ({ f: x.f, nr: nummer(x.fm.nummer), titel: txt(x.fm.titel) || ausName(x.f && x.f.basename), rang: labRang(x.fm) }));
  alle.sort((a, b) => (a.nr == null) - (b.nr == null) || (b.nr || 0) - (a.nr || 0) || (bereich === "Lab" ? a.rang - b.rang : 0)
    || a.titel.localeCompare(b.titel, "de", { numeric: true, sensitivity: "base" }));
  // Lab: ein Chip je Sitzung (Notebook, Code und Daten von „Lab 2“ sind mehrere Unterlagen mit derselben Nummer, labRang). „mehr“
  // zählt alle übrigen Unterlagen, damit „Alle Unterlagen“ zu Code und Daten führt.
  const zahl = alle.length;
  if (bereich === "Lab") for (let i = alle.length - 1; i > 0; i--) if (alle[i].nr != null && alle[i].nr === alle[i - 1].nr) alle.splice(i, 1);
  const n = max == null ? 3 : max;
  return { art: bereich, blaetter: alle.slice(0, n), mehr: Math.max(0, zahl - Math.min(n, alle.length)) };
};

// Leere Abschnitte: „## …“ mit nichts als leeren Punkten und Leerzeilen darunter, bis zur nächsten Überschrift (Ebene 1 oder 2), zum
// Ende oder, wenn leere Punkte darin stehen, bis zu einem Kasten des Plugins („> [!eba-…“) oder einer Einbettung. Ohne Punkte zählt ein
// Kasten darunter zur Überschrift. Folgt eigener Text, bleibt alles stehen. zeilen: ganze Notiz → [[von, bis]] (0-basiert, inklusive
// der Leerzeilen danach), außerhalb von Eigenschaften und Codeblöcken.
const LEERER_PUNKT = /^\s*[-*+](?:\s+\[ \])?\s*$/;
const leereAbschnitte = (zeilen) => {
  const z = zeilen || [], aus = [];
  let i = 0, zaun = false;
  if (z.length && z[0].trim() === "---") { i = 1; while (i < z.length && z[i].trim() !== "---") i++; i++; }
  for (; i < z.length; i++) {
    if (/^\s*(```|~~~)/.test(z[i])) { zaun = !zaun; continue; }
    if (zaun || !/^##\s+\S/.test(z[i])) continue;
    let j = i + 1, punkte = 0;
    while (j < z.length && (!z[j].trim() || LEERER_PUNKT.test(z[j]))) { if (z[j].trim()) punkte++; j++; }
    const t = j < z.length ? z[j] : null;
    if (t === null || /^#{1,2}\s/.test(t) || (punkte > 0 && /^(?:>\s*\[!eba-|!\[\[)/.test(t))) aus.push([i, j - 1]);
    i = j - 1;
  }
  return aus;
};
// Zeile im Kasten „Eckdaten“, die das Plugin geschrieben hat: jeder Teil (mit „ · “ getrennt) beginnt mit Modul, Art, Seiten,
// Semester, Original oder Aus ILIAS, oder er ist ein Knopf des Plugins (knoepfe: deren Texte, „Öffnen ↗“, „Größe ⇅“).
const ECKDATEN = /^(?:Modul|Art|Seiten|Semester|Original|Aus ILIAS):\s/;
const eckZeileErzeugt = (text, knoepfe) => {
  let t = String(text == null ? "" : text).replace(/\s+/g, " ");
  for (const k of knoepfe || []) if (k) t = t.split(k).join("");
  return t.split(" · ").map((x) => x.trim()).filter(Boolean).every((x) => ECKDATEN.test(x));
};
// Hat die Notiz einen PDF-Kasten, also eine PDF-Einbettung in einem Kasten („> [!eba-pdf]“)? Nur dann steht „Öffnen“ in dessen
// Kopfzeile (pdfkasten.js). cache = Obsidians Metadaten der Notiz (embeds, sections); ohne Metadaten: nein (Eckdaten bleiben).
const hatPdfKasten = (cache) => {
  const abschnitte = (cache && cache.sections) || [];
  return ((cache && cache.embeds) || []).some((e) => !!e && !!e.position && /\.pdf(?:#|$)/i.test(String(e.link || ""))
    && abschnitte.some((s) => s && s.type === "callout" && s.position.start.line <= e.position.start.line
      && e.position.end.line <= s.position.end.line));
};

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
    // „Veranstaltung“ = Alma ohne erkannte Art, wie im Wochenraster eine Vorlesung (das Wort gilt nur für Events, docs/design.md)
    const gruppe = txt(fm.gruppe), art = txt(fm.art) === "Veranstaltung" ? "Vorlesung" : txt(fm.art) || "Lehrveranstaltung";
    const tag = z && Number(fm.wochentag) >= 1 && Number(fm.wochentag) <= 7 ? z.WT[Number(fm.wochentag) % 7] : "";
    const zeit = [tag, txt(fm.beginn) + (fm.ende ? "–" + txt(fm.ende) : "")].filter(Boolean).join(" ");
    return [art, gruppe ? (/^\d+$/.test(gruppe) ? "Gruppe " + gruppe : gruppe) : "", txt(fm.code), zeit].filter(Boolean).join(" · ");
  };

  // ---------- Symbole als eigenes SVG (wie vorlesung.js; setIcon blieb auf dem iPad leer) ----------
  const SYM = {
    status: [["circle", { cx: 12, cy: 12, r: 9 }]],
    fertig: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "m8 12.5 2.6 2.5L16 9.5" }]],
    pfeil: [["path", { d: "m6 9 6 6 6-6" }]],
    blatt: [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8" }]],
    ordner: [["path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }]],
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
  // ---------- „⋯“: Eigenschaften dieser Notiz zeigen ----------
  // Gezeigt bleiben sie je Notiz bis zum Neustart (auch über Tabs und Ansichten); die Klasse am Tab schaltet eba-core.css 25 um.
  const gezeigt = ctx.bleibend("eigenschaften", () => ({ pfade: [] }));
  const eigenschaftenAnwenden = () => {
    for (const l of app.workspace.getLeavesOfType("markdown")) {
      const v = l.view, f = v && v.file;
      if (v && v.containerEl) v.containerEl.classList.toggle("eba-eigenschaften", !!f && gezeigt.pfade.indexOf(f.path) >= 0);
    }
  };
  const eigenschaftenUmschalten = (f) => {
    const i = gezeigt.pfade.indexOf(f.path);
    if (i >= 0) gezeigt.pfade.splice(i, 1); else gezeigt.pfade.push(f.path);
    eigenschaftenAnwenden();
  };
  // Knopf „⋯“ rechts im Kopf (Gestalt wie in der Kartenliste, eba-lk-mehr); Obsidians Menü mit „Eigenschaften“, danach extra
  const mehr = (eltern, f, extra) => {
    if (!f || !O.Menu) return null;
    const b = eltern.createEl("button", { cls: "eba-lk-mehr eba-kopf-mehr", text: "⋯", attr: { type: "button", title: "Mehr", "aria-label": "Mehr", "aria-haspopup": "menu" } });
    b.addEventListener("mousedown", (e) => e.stopPropagation()); // Bearbeitungsansicht: nicht in den Quelltext springen
    b.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const m = new O.Menu();
      m.addItem((i) => { i.setTitle("Eigenschaften"); i.setChecked(gezeigt.pfade.indexOf(f.path) >= 0); i.onClick(() => eigenschaftenUmschalten(f)); });
      for (const x of extra || []) m.addItem((i) => { i.setTitle(x.titel); i.onClick(() => x.aktion()); });
      const r = b.getBoundingClientRect();
      m.showAtPosition({ x: r.left, y: r.bottom + 4 });
    });
    return b;
  };

  // Modulseite zur Notiz: Link im Feld modul, sonst das Modul mit diesem Code (nur typ modul)
  const modulVon = (f, fm) => {
    const ist = (x) => !!x && txt(fmVon(x).typ) === "modul";
    const l = String(fm.modul == null ? "" : fm.modul).replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
    const z = l ? app.metadataCache.getFirstLinkpathDest(l, f.path) : null;
    if (ist(z)) return z;
    const code = txt(fm.code);
    return code ? app.vault.getMarkdownFiles().find((x) => x.path.indexOf("Module/") === 0 && ist(x) && txt(fmVon(x).code) === code) || null : null;
  };
  // Label mit dem Modulcode als Link (öffnet die Modulseite im selben Tab)
  const labelZeichnen = (lab, text, code, ziel) => {
    const teile = text.split(" · ");
    const i = code && ziel ? teile.indexOf(code) : -1;
    if (i < 0) { lab.setText(text); return; }
    if (i > 0) lab.appendText(teile.slice(0, i).join(" · ") + " · ");
    const a = lab.createEl("a", { cls: "internal-link eba-kopf-modul", text: code, attr: { href: ziel.path, "data-href": ziel.path } });
    a.addEventListener("mousedown", (e) => e.stopPropagation());
    a.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); ctx.oeffnen(ziel, { von: a, neu: e.ctrlKey || e.metaKey }); });
    if (i < teile.length - 1) lab.appendText(" · " + teile.slice(i + 1).join(" · "));
  };

  // Link-Chip wie in der Kopf-Karte der Vorlesungsnotiz (vorlesung.js); öffnet das Ziel, ohne in der Bearbeitungsansicht in den
  // Quelltext zu springen
  const chip = (eltern, ziel, sym, fett, text, quelle) => {
    const a = eltern.createEl("a", { cls: "internal-link eba-vorl-chip " + sym, attr: { href: ziel.path, "data-href": ziel.path } });
    symbol(a, sym);
    a.createEl("b", { text: fett });
    if (text) a.createSpan({ text });
    a.addEventListener("mousedown", (e) => e.stopPropagation());
    a.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); ctx.oeffnen(ziel, { quelle, neu: e.ctrlKey || e.metaKey }); });
    return a;
  };
  // Übung, Tutorium oder Lab im Stundenplan: die Unterlagen aus ihrem Bereich unter dem Kopf (neueste zuerst), sonst nichts
  const blaetterZeichnen = (karte, f, fm) => {
    const u = blaetterFuer(fm, app.vault.getMarkdownFiles().map((x) => ({ f: x, fm: fmVon(x) })).filter((x) => x.fm.typ === "unterlage"));
    if (!u || !u.blaetter.length) return;
    const links = karte.createDiv({ cls: "eba-vorl-links", attr: { "aria-label": u.art === "Übung" ? "Übungsblätter" : "Unterlagen zum " + u.art } });
    for (const b of u.blaetter) chip(links, b.f, "blatt", b.nr == null ? u.art : u.art + " " + pad(b.nr), b.titel, f.path);
    const modul = u.mehr ? modulVon(f, fm) : null;
    if (modul) chip(links, modul, "ordner", "Alle Unterlagen", "", f.path);
  };

  const angezeigt = new Set(); // { el, pfad } aller gezeichneten Karten (Lese- und Bearbeitungsansicht), zum Neuzeichnen
  const zeichnen = (el, f) => {
    const fm = fmVon(f), typ = txt(fm.typ);
    el.empty();
    el.addClass("eba-vorl", "eba-notizkopf");
    if (TYPEN.indexOf(typ) < 0) return;
    const nicht = typ === "lehrveranstaltung" && !!(M() && M().besuchtNicht && M().besuchtNicht(fm));
    const s = statusVon(typ, fm, nicht);
    const ton = M() && M().statusArt ? M().statusArt(typ, s.wort) : "leer";
    const karte = el.createDiv({ cls: "eba-vorl-karte" });
    const kopf = karte.createDiv({ cls: "eba-vorl-kopf" });
    labelZeichnen(kopf.createSpan({ cls: "eba-vorl-label" }), labelVon(typ, f, fm), txt(fm.code), modulVon(f, fm));
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
    mehr(kopf, f);
    if (typ === "lehrveranstaltung") blaetterZeichnen(karte, f, fm);
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

  // ---------- Leere Abschnitte und Eckdaten (Lese- und Bearbeitungsansicht, Stil eba-core.css 64.4) ----------
  const NOTIZ = TYPEN.concat(["vorlesung", "übungsblatt"]);
  // Formeln zählen als Inhalt: MathJax zeichnet sie ohne Text im DOM (textContent leer)
  // „- [ ]“ ohne Text macht Obsidian zu keiner Aufgabe, sondern zu einem Punkt mit dem Text „[ ]“: zählt als leer
  const leererPunkt = (li) => /^(?:\[ \])?$/.test(li.textContent.trim())
    && !li.querySelector("img, iframe, .internal-embed, .math, mjx-container");
  // „Größe ⇅“ (Aktion pdf bis 0.4.6) gibt es nicht mehr: Knopf samt Trenner davor weg
  const groesseWeg = (inhalt) => {
    for (const a of Array.from(inhalt.querySelectorAll('a[href="obsidian://studium-autopilot?aktion=pdf"]'))) {
      const vor = a.previousSibling;
      if (vor && vor.nodeType === 3) vor.textContent = vor.textContent.replace(/\s*·\s*$/, "");
      a.remove();
    }
  };
  // Kasten „Eckdaten“: erzeugte Zeilen weg (Knoten zwischen <br>); bleibt nichts, ist der Kasten unsichtbar (Klasse eba-eck-leer).
  // Ohne PDF-Kasten bleibt er samt „Öffnen ↗“, nur „Größe ⇅“ fällt weg.
  const eckdatenAus = (k, pdfKasten) => {
    const t = k.querySelector(":scope > .callout-title .callout-title-inner"), inhalt = k.querySelector(":scope > .callout-content");
    if (!t || !inhalt || t.textContent.trim() !== "Eckdaten" || k.getAttribute("data-eba-eck") === "1") return;
    k.setAttribute("data-eba-eck", "1");
    if (!pdfKasten) { groesseWeg(inhalt); return; }
    let rest = 0;
    for (const p of Array.from(inhalt.children)) {
      if (p.tagName !== "P") { rest++; continue; }
      const zeilen = [{ knoten: [], br: null }];
      for (const n of Array.from(p.childNodes)) {
        if (n.nodeName === "BR") { zeilen[zeilen.length - 1].br = n; zeilen.push({ knoten: [], br: null }); } else zeilen[zeilen.length - 1].knoten.push(n);
      }
      let bleibt = 0;
      for (const z of zeilen) {
        const knoepfe = [];
        for (const n of z.knoten) {
          const as = n.nodeType !== 1 ? [] : n.matches("a") ? [n] : Array.from(n.querySelectorAll("a"));
          for (const a of as) if (/^obsidian:\/\/studium-autopilot\?aktion=/.test(a.getAttribute("href") || "")) knoepfe.push(a.textContent.trim());
        }
        if (!eckZeileErzeugt(z.knoten.map((n) => n.textContent).join(""), knoepfe)) { bleibt++; continue; }
        for (const n of z.knoten) n.remove();
        if (z.br) z.br.remove();
      }
      while (p.lastChild && (p.lastChild.nodeName === "BR" || (p.lastChild.nodeType === 3 && !p.lastChild.textContent.trim()))) p.lastChild.remove();
      if (bleibt) rest++; else p.remove();
    }
    if (!rest) k.classList.add("eba-eck-leer");
  };
  // Leseansicht: Überschriften der Notizen des Plugins (eba-abschnitt) und Listen nur aus leeren Punkten (eba-leer); ob eine Überschrift
  // verschwindet, entscheidet das CSS am Nachbarn (bleibt richtig, wenn Obsidian nur die geänderte Liste neu zeichnet)
  const aufraeumen = (el, c) => {
    const f = app.vault.getAbstractFileByPath((c && c.sourcePath) || "");
    const typ = f ? txt(fmVon(f).typ) : "";
    if (NOTIZ.indexOf(typ) < 0) return;
    if (el.classList.contains("el-h2")) el.classList.add("eba-abschnitt");
    if (el.classList.contains("el-ul")) {
      const ul = el.querySelector(":scope > ul");
      const punkte = ul ? Array.from(ul.querySelectorAll("li")) : [];
      if (punkte.length && punkte.every(leererPunkt)) el.classList.add("eba-leer");
    }
    if (typ === "unterlage") {
      const kaesten = el.querySelectorAll('.callout[data-callout="eba-regel"]');
      const pdfKasten = kaesten.length ? hatPdfKasten(app.metadataCache.getFileCache(f)) : false;
      for (const k of kaesten) eckdatenAus(k, pdfKasten);
    }
  };
  // Bearbeitungsansicht der Begleitnotizen: leere Abschnitte auf Höhe 0, solange der Cursor nicht darin steht. Andere Notizen zeigen
  // ihre Überschriften dort weiter: Dort schreibst du hinein.
  const leerErweiterung = () => {
    const V = ctx.cm && ctx.cm.view, info = O.editorInfoField, lp = O.editorLivePreviewField;
    if (!V || !V.ViewPlugin || !V.Decoration || !info) return;
    const D = V.Decoration;
    const bauen = (view) => {
      try {
        const x = view.state.field(info, false), f = x && x.file;
        if (!f || txt(fmVon(f).typ) !== "unterlage" || (lp && !view.state.field(lp, false))) return D.none;
        const doc = view.state.doc, zeilen = [];
        for (let i = 1; i <= doc.lines; i++) zeilen.push(doc.line(i).text);
        const cursor = view.state.selection.ranges.map((r) => doc.lineAt(r.head).number - 1);
        const r = [];
        for (const [von, bis] of leereAbschnitte(zeilen)) {
          let a = von; // die Leerzeilen davor gleich mit (sonst bleibt eine Lücke, wo der Abschnitt stand)
          while (a > 0 && !zeilen[a - 1].trim()) a--;
          if (cursor.some((n) => n >= a && n <= bis)) continue;
          for (let k = a; k <= bis; k++) r.push(D.line({ class: "eba-leer-zeile" }).range(doc.line(k + 1).from));
        }
        return D.set(r, true);
      } catch (e) { return D.none; }
    };
    ctx.editor(V.ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = bauen(view); }
      update(u) { if (u.docChanged || u.selectionSet || u.transactions.length) this.decorations = bauen(u.view); }
    }, { decorations: (v) => v.decorations }));
  };

  const registrieren = () => {
    ctx.postprozessor((el, c) => { try { nachbearbeiten(el, c); aufraeumen(el, c); } catch (e) { console.error("Kopf", e); } });
    try { editorErweiterung(); } catch (e) { console.error("Kopf Editor", e); }
    try { leerErweiterung(); } catch (e) { console.error("Kopf Editor leer", e); }
    const bald = ctx.entprellen(() => neu(null), 300);
    // Neu zeichnen bei Änderungen an einer gezeigten Notiz, den Einstellungen (Besuche ich nicht) oder einer Unterlage (Chips unter Übung, Tutorium und Lab)
    const unterlage = (cache) => !!(cache && cache.frontmatter && cache.frontmatter.typ === "unterlage");
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => {
      if (f && (f.path === EINSTELLUNGEN || unterlage(cache) || Array.from(angezeigt).some((x) => x.pfad === f.path))) bald();
    });
    ctx.an(app.metadataCache, "deleted", (_f, vorher) => { if (unterlage(vorher)) bald(); });
    ctx.an(app.workspace, "file-open", eigenschaftenAnwenden);
    ctx.an(app.workspace, "layout-change", eigenschaftenAnwenden);
    eigenschaftenAnwenden();
    ctx.kopf = { mehr }; // „⋯“ auch im Kopf von Vorlesung und Übungsblatt (vorlesung.js)
  };
  const abmelden = () => {
    for (const l of app.workspace.getLeavesOfType("markdown")) if (l.view && l.view.containerEl) l.view.containerEl.classList.remove("eba-eigenschaften");
  };

  return { registrieren, abmelden, statusVon, klasseVon, labelVon, zeichnen, TYPEN, leereAbschnitte, eckZeileErzeugt, blaetterFuer };
};
module.exports.statusVon = statusVon;
module.exports.klasseVon = klasseVon;
module.exports.blaetterFuer = blaetterFuer;
module.exports.TYPEN = TYPEN;
module.exports.leereAbschnitte = leereAbschnitte;
module.exports.eckZeileErzeugt = eckZeileErzeugt;
module.exports.hatPdfKasten = hatPdfKasten;
