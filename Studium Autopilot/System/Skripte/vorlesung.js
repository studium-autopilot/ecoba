// Vorlesungsnotiz (typ: vorlesung) lebendig gestalten, dazu die Abschnitte eines Übungsblatts (typ: übungsblatt).
// 1. Codeblock ```eba-vorlesung``` unter dem Titel: Kopf-Karte mit Vorlesungswoche, Status „Nacharbeit offen/Nachgearbeitet“
//    (Tipp schaltet das Feld `nachgearbeitet`), Modul (Link), Thema, Datum mit Wochentag, Uhrzeit und Raum aus dem Stundenplan
//    (an diesem Tag, seit 20.10.2026 mit Änderung oder Verlegung: neuer Wert in Warnfarbe, der übliche durchgestrichen),
//    Dozent (Feld der Notiz, sonst aus dem Stundenplan-Eintrag), einer Perlenreihe der Vorlesungswochen dieses Moduls (Tipp öffnet
//    die Notiz der Woche) und Links zu den Folien dieser Sitzung (Begleitnotizen, gewählt von ctx.modell.folien; „⋯“ → „Andere
//    Folien …“, falls die Wahl danebenliegt; seit 24.10.2026 deine bearbeitete und die neue Fassung nebeneinander, beschriftet) und
//    zum Stundenplan-Eintrag. Daten live aus dem metadataCache, neu gezeichnet auch beim Tageswechsel; schreibt nur beim Tipp auf
//    den Status oder bei „Andere Folien“.
// 2. Abschnitte (## Mitschrift, ## Prüfungsrelevant, ## Offene Fragen, ## Nacharbeit) bekommen Klassen eba-vorl-h-<art> bzw.
//    eba-vorl-z-<art>: Leseansicht über einen Post-Processor, Bearbeitungsansicht (Live Preview) über eine CodeMirror-
//    Erweiterung (ViewPlugin, Decoration.line). Der Text bleibt reines Markdown (keine Callout-Präfixe beim Mitschreiben); Stil in eba-core.css.
// 3. Übungsblatt (typ: übungsblatt, bis 0.6.7 über „Neues Übungsblatt“ angelegt): Abschnitte ## Aufgabe …, ## Knackpunkte (Kasten
//    wie „Prüfungsrelevant“), ## Fürs Tutorium. Seine Kopf-Karte (Codeblock ```eba-uebungsblatt```) zeichnet seit 24.10.2026 kopf.js;
//    die Karte mit Perlen, Restzeit und Links zu Aufgaben und Lösungen gibt es nicht mehr: Das Blatt ist jetzt seine Begleitnotiz
//    (Unterlage der Art Übung, kopf.js).
// Erweiterung: registrieren() meldet Codeblock, Post-Processor, Editor-Erweiterung und Ereignisse über die Helfer in ctx an
// (ctx.codeblock, ctx.postprozessor, ctx.editor, ctx.an); beim Hot-Reload meldet das Plugin die alte Fassung ab.
// iOS-sicher: keine Node-APIs, keine Lookbehind-Regex, kein .at()/findLast/structuredClone. Fehler → Ersatztext.
module.exports = function (ctx) {
  const app = window.app;
  const basis = ctx; // zeichnen(el, ctx) überdeckt ctx mit dem Markdown-Kontext
  const SPRACHE = "eba-vorlesung";
  const TAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const TAG = 86400000;
  const pad = (n) => String(n).padStart(2, "0");
  const datum = (v) => { const m = String(v ?? "").match(/(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tm = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  const montag = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const wochen = (a, b) => Math.round((montag(b) - montag(a)) / (7 * TAG));
  const fmVon = (f) => (f && app.metadataCache.getFileCache(f)?.frontmatter) || {};
  // Wochentag einer Lehrveranstaltung kurz („Di“): Feld wochentag (1 = Montag), ältere Notizen ohne es aus dem Feld tag
  const wtKurz = (m) => { const n = Number(m.wochentag); return n >= 1 && n <= 7 ? TAGE[n % 7].slice(0, 2) : String(m.tag ?? "").trim(); };
  const ziel = (wert, von) => {
    const s = String(wert ?? "").trim();
    if (!s) return null;
    const m = s.match(/^\[\[([^\]|#]+)/);
    const p = (m ? m[1] : s).trim();
    return app.metadataCache.getFirstLinkpathDest(p, von || "") || app.vault.getAbstractFileByPath(p) || app.vault.getAbstractFileByPath(p + ".md");
  };

  // ---------- Abschnitte erkennen (Lese- und Bearbeitungsansicht) ----------
  // Je Typ die Abschnitte; „pruef“ ist der getönte Kasten, „fragen“ zählt offene Punkte in der Kopf-Karte
  const ARTEN = {
    vorlesung: [["mitschrift", /^mitschrift/i], ["pruef", /^(pr(ü|ue)fungs|klausur)relevant/i], ["fragen", /^(offene )?fragen/i], ["nacharbeit", /^(nacharbeit|zusammenfassung|kernaussagen)/i]],
    "übungsblatt": [["aufgabe", /^((teil)?aufgabe|exercise|problem)/i], ["pruef", /^(knackpunkt|merken|(pr(ü|ue)fungs|klausur)relevant)/i], ["fragen", /^(f(ü|ue)rs tutorium|f(ü|ue)r das tutorium|tutorium|(offene )?fragen)/i]],
  };
  // Typ aus dem Frontmatter, wenn er Abschnitte hat (vorlesung, übungsblatt), sonst null
  const typAus = (zeilen) => {
    if (!zeilen.length || zeilen[0].trim() !== "---") return null;
    for (let i = 1; i < Math.min(zeilen.length, 80); i++) {
      if (zeilen[i].trim() === "---") return null;
      const m = zeilen[i].match(/^typ:\s*["']?(vorlesung|übungsblatt)["']?\s*$/);
      if (m) return m[1];
    }
    return null;
  };
  // Liefert je Zeilennummer (0-basiert) die Klassen oder nichts; ohne typ gilt der aus dem Frontmatter, sonst vorlesung
  const abschnitte = (zeilen, typ) => {
    const arten = ARTEN[typ] || ARTEN[typAus(zeilen)] || ARTEN.vorlesung;
    const erg = new Array(zeilen.length);
    let i = 0;
    if (zeilen[0] && zeilen[0].trim() === "---") { i = 1; while (i < zeilen.length && zeilen[i].trim() !== "---") i++; i++; }
    let art = null, start = -1, zaun = false;
    const schliessen = (ende) => {
      if (art !== "pruef" || start < 0) return;
      let a = start, e = ende;
      while (a <= e && !zeilen[a].trim()) a++;
      while (e >= a && !zeilen[e].trim()) e--;
      for (let k = a; k <= e; k++) erg[k] = "eba-vorl-z eba-vorl-z-" + art + (k === a ? " eba-vorl-z-anfang" : "") + (k === e ? " eba-vorl-z-ende" : "");
    };
    for (; i < zeilen.length; i++) {
      const z = zeilen[i];
      if (/^\s*(```|~~~)/.test(z)) zaun = !zaun;
      if (zaun) continue;
      const h = z.match(/^(#{1,2})\s+(.*)$/);
      if (!h) continue;
      schliessen(i - 1);
      art = null; start = -1;
      if (h[1].length !== 2) continue;
      const titel = h[2].replace(/[*_=]/g, "").trim();
      const t = arten.find((x) => x[1].test(titel));
      art = t ? t[0] : "anders";
      erg[i] = "eba-vorl-h eba-vorl-h-" + art;
      start = i + 1;
    }
    schliessen(zeilen.length - 1);
    return erg;
  };

  // ---------- Symbole als eigenes SVG (setIcon blieb auf dem iPad leer, docs/architektur/verbindungen.md) ----------
  const SYM = {
    status: [["circle", { cx: 12, cy: 12, r: 9 }]],
    fertig: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "m8 12.5 2.6 2.5L16 9.5" }]],
    folien: [["path", { d: "M2 3h20" }], ["path", { d: "M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" }], ["path", { d: "m7 21 5-5 5 5" }]],
    plan: [["rect", { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ["path", { d: "M16 2v4M8 2v4M3 10h18" }]],
    frage: [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" }], ["path", { d: "M12 17h.01" }]],
    person: [["circle", { cx: 12, cy: 8, r: 4 }], ["path", { d: "M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" }]],
  };
  const symbol = (eltern, name) => {
    const NS = "http://www.w3.org/2000/svg", doc = eltern.ownerDocument;
    const svg = doc.createElementNS(NS, "svg");
    for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: "14", height: "14", fill: "none", stroke: "currentColor", "stroke-width": "2",
      "stroke-linecap": "round", "stroke-linejoin": "round", class: "eba-vorl-sym", "aria-hidden": "true" })) svg.setAttribute(k, v);
    for (const [tag, at] of SYM[name] || []) { const e = doc.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, String(at[k])); svg.appendChild(e); }
    eltern.appendChild(svg);
    return svg;
  };
  // Link in einer Kopf-Karte; öffnet das Ziel, ohne in der Bearbeitungsansicht in den Quelltext zu springen
  const verlinker = (quelle) => (eltern, ziel, cls, text) => {
    const a = eltern.createEl("a", { cls: "internal-link " + cls, href: ziel.path, attr: { "data-href": ziel.path } });
    if (text) a.setText(text);
    a.addEventListener("mousedown", (e) => e.stopPropagation());
    a.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); basis.oeffnen(ziel, { quelle, neu: e.ctrlKey || e.metaKey }); });
    return a;
  };

  // ---------- Daten ----------
  const lesen = (f) => {
    const fm = fmVon(f), pfad = f ? f.path : "";
    const modulF = ziel(fm.modul, pfad), mfm = fmVon(modulF);
    const code = String(fm.code || mfm.code || "").trim();
    const d = datum(fm.datum);
    // Veranstaltung: Feld „veranstaltung“, sonst die Vorlesung dieses Moduls am selben Wochentag laut Stundenplan
    let lv = ziel(fm.veranstaltung, pfad);
    if (!lv && code && d) {
      const wt = ((d.getDay() + 6) % 7) + 1, t = iso(d);
      const kand = app.vault.getMarkdownFiles().filter((x) => x.path.startsWith("Stundenplan/")).map((x) => ({ x, m: fmVon(x) }))
        .filter(({ m }) => m.typ === "lehrveranstaltung" && String(m.code) === code && Number(m.wochentag) === wt
          && (!m.von || String(m.von) <= t) && (!m.bis || String(m.bis) >= t));
      kand.sort((a, b) => (b.m.art === "Vorlesung") - (a.m.art === "Vorlesung"));
      lv = kand.length ? kand[0].x : null;
    }
    const lfm = fmVon(lv);
    // Folien aus dem Fachmodell (modell.js, „Folien einer Vorlesungsnotiz“): deine Wahl im Feld folien, sonst die zu dieser
    // Sitzung, bei jedem Zeichnen neu (später angekommene Folien erscheinen von selbst)
    const fo = ctx.modell && ctx.modell.folien ? ctx.modell.folien(f) : { folien: [], gewaehlt: false, alle: [] };
    // Semester und Wochen der Vorlesungszeit
    const ein = fmVon(app.vault.getAbstractFileByPath("System/Einstellungen.md"));
    let sem = null;
    // Datenmodell (modell.js): Semester zum Datum der Notiz aus den zentralen Semesterdaten
    const md = ctx.modell && ctx.modell.semesterVon ? ctx.modell : null;
    if (d && md) { const s = md.semesterVon(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); if (s) sem = { name: s.name, vb: datum(s.vb), ve: datum(s.ve) }; }
    if (d && !sem) for (const z of ein.semesterliste || []) {
      const t = String(z).split("|"), sb = datum(t[2]), se = datum(t[3]);
      if (sb && se && d >= sb && d <= se) { sem = { name: (t[1] || "").trim(), vb: datum(t[4]), ve: datum(t[5]) }; break; }
    }
    const pausenRoh = md ? md.daten().pausen.map((p) => [p.von, p.bis, p.name]) : (ein.pausen || []).map((z) => String(z).split("|"));
    const pausen = pausenRoh.map((t) => ({ von: datum(t[0]), bis: datum(t[1]), name: (t[2] || "").trim() })).filter((p) => p.von && p.bis);
    // Wochen: eine Perle je Kalenderwoche der Vorlesungszeit; nummeriert werden nur Vorlesungswochen (Regel aus modell.js:
    // eine Woche, deren Montag bis Freitag ganz in einer Pause liegt, zählt nicht) → „Vorlesungswoche X von Y“
    let perlen = null, woche = 0, wochenGesamt = 0, pauseHier = null;
    if (sem && sem.vb && sem.ve && code) {
      const kalWochen = wochen(sem.vb, sem.ve) + 1;
      const m0 = montag(sem.vb);
      const nummer = {};
      if (md && md.vorlesungswochen) {
        const W = md.vorlesungswochen({ vb: iso(sem.vb), ve: iso(sem.ve) });
        for (const w of W.wochen) nummer[w.mo] = w.nr;
        wochenGesamt = W.gesamt;
      }
      const notizen = app.vault.getMarkdownFiles().map((x) => ({ x, m: fmVon(x) }))
        .filter(({ m }) => m.typ === "vorlesung" && String(m.code) === code && datum(m.datum))
        .map(({ x, m }) => ({ f: x, d: datum(m.datum), nr: m.nummer, fertig: m.nachgearbeitet === true }))
        .filter((n) => n.d >= m0 && n.d <= new Date(sem.ve.getTime() + 6 * TAG))
        .sort((a, b) => a.d - b.d);
      const jetzt = ctx.date.jetzt(), heuteW = wochen(sem.vb, jetzt);
      perlen = [];
      let zaehler = 0;
      for (let w = 0; w < kalWochen; w++) {
        const mo = new Date(m0.getFullYear(), m0.getMonth(), m0.getDate() + 7 * w), fr = new Date(mo.getFullYear(), mo.getMonth(), mo.getDate() + 4);
        const drin = notizen.filter((n) => wochen(sem.vb, n.d) === w);
        const pause = pausen.find((p) => p.von <= mo && p.bis >= fr) || null;
        if (!pause) zaehler++;
        const nr = iso(mo) in nummer ? nummer[iso(mo)] : pause ? 0 : zaehler;
        perlen.push({ w, nr, mo, drin, pause, hier: drin.some((n) => n.f === f), jetzt: w === heuteW, vorbei: w < heuteW });
      }
      if (!wochenGesamt) wochenGesamt = zaehler;
      if (d >= m0 && d <= new Date(sem.ve.getTime() + 6 * TAG)) {
        const p = perlen[wochen(sem.vb, d)];
        woche = p ? p.nr : 0;
        pauseHier = pausen.find((q) => q.von <= d && d <= q.bis) || null;
        // Notiz in einer Pausenwoche (selten): letzte Vorlesungswoche davor
        if (p && !p.nr && !pauseHier) for (const q of perlen) if (q.w < p.w && q.nr) woche = q.nr;
      }
    }
    return { f, fm, modulF, mfm, code, d, lv, lfm, folien: fo.folien, folienGewaehlt: fo.gewaehlt, folienAlle: fo.alle, sem, perlen, woche, wochenGesamt, pauseHier };
  };

  // Offene Fragen: unerledigte Aufgaben mit Text im Abschnitt „Offene Fragen“
  const fragenZaehlen = (text) => {
    const z = text.split("\n"), k = abschnitte(z);
    let drin = false, n = 0;
    for (let i = 0; i < z.length; i++) {
      if (k[i] && k[i].indexOf("eba-vorl-h ") === 0) drin = k[i].indexOf("eba-vorl-h-fragen") > 0;
      else if (/^#{1,2}\s/.test(z[i])) drin = false;
      else if (drin && /^\s*[-*+] \[ \]\s*\S/.test(z[i])) n++;
    }
    return n;
  };

  // Name einer Vorlesungsnotiz wie überall (ctx.modell.vorlesung); fehlt modell.js noch (Sync), der Dateiname ohne Datum
  const vlName = (x) => (basis.modell && basis.modell.vorlesung ? basis.modell.vorlesung(x).titel : x.basename.replace(/^\d{4}-\d{2}-\d{2}\s+/, ""));

  // ---------- Kopf-Karte zeichnen ----------
  const zeichnen = (el, ctx) => {
    const f = app.vault.getAbstractFileByPath(ctx?.sourcePath || "");
    const x = lesen(f);
    const { fm, mfm, code, d } = x;
    const quelle = ctx?.sourcePath || "";
    const nachgearbeitet = fm.nachgearbeitet === true;
    // Zeit und Raum an diesem Tag (seit 20.10.2026 aus dem Fachmodell: Änderung, Verlegung; vorher immer die üblichen)
    const st = x.lfm.typ === "lehrveranstaltung" && d && basis.modell && basis.modell.findetStatt ? basis.modell.findetStatt(x.lfm, iso(d)) : null;
    // Nichts neu zeichnen, wenn sich nichts geändert hat (beim Tippen meldet der metadataCache jede Speicherung)
    const sig = JSON.stringify([fm, x.lv?.path, x.lfm.beginn, x.lfm.ende, x.lfm.raum, x.lfm.dozent, wtKurz(x.lfm), st,
      x.folien.map((d) => d.f.path + (d.fm.titel || "") + (d.fassung ? d.fassung.text : "")), x.folienAlle.length, x.mfm.titel,
      (x.perlen || []).map((p) => p.drin.map((n) => n.f.path + n.fertig).join() + p.jetzt + p.nr), x.woche, x.wochenGesamt, basis.date.jetzt().toDateString()]);
    if (el.__ebaSig === sig && el.childElementCount) { if (el.__ebaFragen) el.__ebaFragen(); return; }
    el.__ebaSig = sig;
    const link = verlinker(quelle);

    el.empty();
    el.addClass("eba-vorl");
    el.toggleClass("ist-fertig", nachgearbeitet);
    const karte = el.createDiv({ cls: "eba-vorl-karte" });

    // Zeile 1: Semester · Woche  |  Status
    const kopf = karte.createDiv({ cls: "eba-vorl-kopf" });
    const lab = kopf.createSpan({ cls: "eba-vorl-label" });
    const teile = [];
    if (x.sem) teile.push(x.sem.name);
    if (x.pauseHier) teile.push(x.pauseHier.name);
    else if (x.woche > 0 && x.woche <= x.wochenGesamt) teile.push(`Vorlesungswoche ${x.woche} von ${x.wochenGesamt}`);
    else if (!code) teile.push("Mitschrift");
    lab.setText(teile.join(" · ") || "Vorlesung");
    if (f) {
      const b = kopf.createEl("button", { cls: "eba-vorl-status" + (nachgearbeitet ? " fertig" : ""), attr: { type: "button", "aria-pressed": String(nachgearbeitet),
        title: nachgearbeitet ? "Als nicht nachgearbeitet markieren" : "Als nachgearbeitet markieren" } });
      symbol(b, nachgearbeitet ? "fertig" : "status");
      b.createSpan({ text: nachgearbeitet ? "Nachgearbeitet" : "Nacharbeit offen" });
      b.addEventListener("mousedown", (e) => e.stopPropagation());
      b.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        try {
          await app.fileManager.processFrontMatter(f, (m) => { m.nachgearbeitet = !(m.nachgearbeitet === true); });
        } catch (err) { console.error("Vorlesung Status", err); }
      });
      // „⋯“ mit Eigenschaften (kopf.js), dazu „Andere Folien …“, falls das Modul Folien hat (nur nötig, wenn die Wahl danebenliegt)
      const extra = x.folienAlle.length ? [{ titel: "Andere Folien …", aktion: () => folienWaehlen(f, x) }] : [];
      if (basis.kopf && basis.kopf.mehr) basis.kopf.mehr(kopf, f, extra);
    }

    // Titel: Modul (Link) bzw. Thema; darunter das Thema, wenn es etwas anderes sagt
    // Ohne Modul (Mitschrift zu einem Termin): Titel = Thema bzw. Termin, aber nicht, wenn die Überschrift # dasselbe sagt
    const h1 = String(((f && app.metadataCache.getFileCache(f)?.headings) || []).filter((h) => h.level === 1).map((h) => h.heading)[0] || "").trim();
    const titelText = x.modulF ? String(mfm.titel || x.modulF.basename.replace(/^\S+\s+/, "")) : String(fm.thema || x.lfm.titel || "").trim();
    if (x.modulF || (titelText && titelText !== h1)) {
      const titel = karte.createDiv({ cls: "eba-vorl-titel" });
      if (x.modulF) link(titel, x.modulF, "eba-vorl-modul", titelText); else titel.setText(titelText);
    }
    // Darunter der Name der Notiz wie überall („Vorlesung 1 · Mo 13.10. · Thema“, ctx.modell.vorlesung), außer der Titel # sagt
    // dasselbe (neue Notizen); ohne Modul (Mitschrift zu einem Termin) nur das Thema, wenn es etwas anderes sagt
    const thema = String(fm.thema ?? "").trim();
    const name = code && f && basis.modell && basis.modell.vorlesung ? basis.modell.vorlesung(f).titel : "";
    if (name) { if (name !== h1) karte.createDiv({ cls: "eba-vorl-thema", text: name }); }
    else if (thema && thema !== titelText && thema !== h1) karte.createDiv({ cls: "eba-vorl-thema", text: thema });

    // Datum · Uhrzeit · Raum
    const meta = karte.createDiv({ cls: "eba-vorl-meta" });
    if (d) {
      const s = meta.createSpan({ cls: "eba-vorl-datum", text: `${TAGE[d.getDay()]}, ${tm(d)}${d.getFullYear()}` });
      const h = basis.date.jetzt(), heute = new Date(h.getFullYear(), h.getMonth(), h.getDate());
      const diff = Math.round((d - heute) / TAG);
      if (diff === 0) s.createEl("b", { cls: "eba-vorl-heute", text: "heute" });
      else if (diff === -1) s.createEl("b", { cls: "eba-vorl-heute alt", text: "gestern" });
    }
    // Uhrzeit und Raum als eine Angabe (bricht auf dem iPhone als zweite Zeile um, ohne führenden Punkt). An diesem Tag geändert
    // (findetStatt): der neue Wert in Warnfarbe, der übliche durchgestrichen daneben (docs/design.md „Ausnahme im Stundenplan“)
    if (st && st.statt) {
      const o = meta.createSpan({ cls: "eba-vorl-ort" });
      const zeit = st.beginn ? st.beginn + (st.ende ? "–" + st.ende : "") : "";
      const teil = (wert, neu, alt) => {
        if (!wert) return;
        if (o.childNodes.length) o.appendText(" · ");
        if (!neu) { o.appendText(wert); return; }
        o.createSpan({ cls: "eba-vorl-neu", text: wert });
        if (alt) { o.appendText(" statt "); o.createEl("s", { text: alt }); }
      };
      teil(zeit, st.zeitGeaendert, st.zeitAlt);
      teil(st.raum, st.raumGeaendert, st.raumAlt);
      if (st.zeitGeaendert || st.raumGeaendert) o.addClass("geaendert");
      if (!o.childNodes.length) o.remove();
    } else {
      const ort = x.lfm.typ === "lehrveranstaltung"
        ? [x.lfm.beginn ? `${x.lfm.beginn}${x.lfm.ende ? "–" + x.lfm.ende : ""}` : "", String(x.lfm.raum ?? "").trim()].filter(Boolean).join(" · ")
        : String(x.lfm.ort ?? "").trim();
      if (ort) meta.createSpan({ cls: "eba-vorl-ort", text: ort });
    }
    // Dozent: Feld der Notiz (selbst eingetragen), sonst live aus dem Stundenplan-Eintrag (seit 24.10.2026; vorher beim Anlegen kopiert)
    const dozent = String(fm.dozent ?? "").trim() || (x.lfm.typ === "lehrveranstaltung" ? String(x.lfm.dozent ?? "").trim() : "");
    if (dozent) { const p = karte.createDiv({ cls: "eba-vorl-dozent" }); symbol(p, "person"); p.createSpan({ text: dozent }); }

    // Perlen: eine je Vorlesungswoche dieses Moduls
    if (x.perlen && x.perlen.length && x.woche > 0) { // nur in der Vorlesungszeit (nicht z. B. beim Vorkurs davor)
      const wo = karte.createDiv({ cls: "eba-vorl-wochen" });
      const reihe = wo.createDiv({ cls: "eba-vorl-perlen", attr: { "aria-label": "Vorlesungswochen" } });
      for (const p of x.perlen) {
        const cls = ["eba-vorl-perle"];
        if (p.drin.length) cls.push(p.drin.every((n) => n.fertig) ? "fertig" : "da");
        else if (p.pause) cls.push("pause");
        else if (p.vorbei) cls.push("leer");
        if (p.hier) cls.push("hier");
        if (p.jetzt) cls.push("jetzt");
        const text = (p.nr ? `Vorlesungswoche ${p.nr} · ab ${tm(p.mo)}` : `ab ${tm(p.mo)}`) + (p.pause ? ` · ${p.pause.name}` : "") +
          (p.drin.length ? " · " + p.drin.map((n) => vlName(n.f) + (n.fertig ? " (nachgearbeitet)" : "")).join(", ") : "");
        const ziel = p.drin.find((n) => n.f !== f) || null;
        const e = ziel && !p.hier ? link(reihe, ziel.f, cls.join(" "), "") : reihe.createSpan({ cls: cls.join(" ") });
        e.setAttr("title", text);
        e.setAttr("aria-label", text);
      }
      // Zeitachse darunter: Beginn und Ende der Vorlesungszeit, dazwischen Notizen/nachgearbeitet
      const fuss = wo.createDiv({ cls: "eba-vorl-wochen-fuss" });
      fuss.createSpan({ text: tm(x.sem.vb) });
      const alle = x.perlen.reduce((n, p) => n + p.drin.length, 0), fertig = x.perlen.reduce((n, p) => n + p.drin.filter((q) => q.fertig).length, 0);
      fuss.createSpan({ cls: "mitte", text: `${alle} ${alle === 1 ? "Notiz" : "Notizen"} · ${fertig} nachgearbeitet` });
      fuss.createSpan({ text: tm(x.sem.ve) });
    } else karte.addClass("ohne-wochen");

    // Links: Folien, Stundenplan; offene Fragen
    const links = karte.createDiv({ cls: "eba-vorl-links" });
    for (const d of x.folien) {
      const a = link(links, d.f, "eba-vorl-chip folien", "");
      symbol(a, "folien");
      a.createEl("b", { text: folienArt(d) });
      const t = String(d.fm.titel || "").trim();
      if (t) a.createSpan({ text: t });
      // Zwei Fassungen derselben Folien: deine bearbeitete und die neue, beschriftet (der Titel kürzt sich, die Beschriftung nie)
      if (d.fassung) a.createSpan({ cls: "eba-vorl-fassung " + d.fassung.rolle, text: d.fassung.text });
    }
    if (x.lv) {
      const a = link(links, x.lv, "eba-vorl-chip plan", "");
      symbol(a, "plan");
      a.createEl("b", { text: x.lfm.typ === "termin" ? "Termin" : "Stundenplan" });
      if (wtKurz(x.lfm) && x.lfm.beginn) a.createSpan({ text: `${wtKurz(x.lfm)} ${x.lfm.beginn}` });
    }
    fragenChip(el, links, f, !!(x.folien.length || x.lv), (n) => (n === 1 ? "1 Frage offen" : `${n} Fragen offen`));
  };

  // „Folien 01“ (Art und Nummer der Begleitnotiz), ohne Begleitnotiz „Folien“
  const folienArt = (d) => (d.fm.art ? `${d.fm.art}${d.fm.nummer != null && d.fm.nummer !== "" ? " " + pad(d.fm.nummer) : ""}` : "Folien");
  // „⋯“ → „Andere Folien …“: Fenster mit allen Folien des Moduls. Die Wahl steht danach im Feld folien und gilt, auch für die
  // folgenden Vorlesungen, bis neue Folien kommen; „Automatisch“ leert das Feld wieder.
  const folienWaehlen = async (f, x) => {
    if (typeof basis.formular !== "function") return;
    const text = (d) => [folienArt(d), String(d.fm.titel || d.f.basename).trim()].concat(d.fassung ? [d.fassung.text] : []).join(" · ");
    const jetzt = x.folienGewaehlt && x.folien[0] ? x.folien[0] : null;
    const liste = jetzt && !x.folienAlle.some((d) => d.f.path === jetzt.f.path) ? [jetzt].concat(x.folienAlle) : x.folienAlle;
    const w = await basis.formular({
      titel: "Folien zu dieser Vorlesung", knopf: "Übernehmen",
      felder: [{ name: "folien", titel: "Folien", art: "auswahl", vorgabe: jetzt ? jetzt.f.path : "",
        optionen: [{ wert: "", text: "Automatisch (passend zu dieser Vorlesung)" }].concat(liste.map((d) => ({ wert: d.f.path, text: text(d) }))) }],
    });
    if (!w) return;
    const d = liste.find((y) => y.f.path === w.folien);
    const wert = !d ? "" : d.f.extension === "md" ? String(d.fm.datei || "").trim() || `[[${d.f.basename}]]` : `[[${d.f.name || d.f.basename}]]`;
    try { await app.fileManager.processFrontMatter(f, (m) => { m.folien = wert; }); } catch (e) { console.error("Vorlesung Folien", e); }
  };

  // Chip mit der Zahl offener Punkte im Fragen-Abschnitt (zählt nach jeder Speicherung neu, ohne die Karte neu zu zeichnen).
  // Die Zeile der Links bleibt verborgen, wenn sonst nichts darin steht und nichts offen ist.
  const fragenChip = (el, links, f, sonst, text) => {
    const fragen = links.createSpan({ cls: "eba-vorl-chip fragen" });
    symbol(fragen, "frage");
    const fragenText = fragen.createSpan();
    fragen.hide();
    links.toggleClass("leer", !sonst);
    el.__ebaFragen = () => {
      if (!f) return;
      app.vault.cachedRead(f).then((t) => {
        const n = fragenZaehlen(t);
        fragenText.setText(text(n));
        if (n > 0) fragen.show(); else fragen.hide();
        links.toggleClass("leer", !sonst && n === 0);
      }).catch(() => {});
    };
    el.__ebaFragen();
  };

  // ---------- Bearbeitungsansicht: Zeilen-Dekorationen ----------
  // Echte CodeMirror-Erweiterung (ViewPlugin mit Decoration.line) aus ctx.cm (das Plugin reicht @codemirror/view weiter).
  // Hot-Reload: ctx.editor(…) legt die Erweiterung in das eine, vom Plugin angemeldete Array; beim Neuladen nimmt das Plugin
  // die alte heraus und konfiguriert Obsidian per updateOptions() neu. Fehlt ctx.cm, bleiben die Abschnitte schlicht (CSS).
  const editorErweiterung = () => {
    const V = ctx.cm && ctx.cm.view;
    if (!V || !V.ViewPlugin || !V.Decoration) return false;
    const { ViewPlugin, Decoration } = V;
    const bauen = (view) => {
      try {
        const doc = view.state.doc;
        const zeilen = [];
        for (let i = 1; i <= doc.lines; i++) zeilen.push(doc.line(i).text);
        const typ = typAus(zeilen);
        if (!typ) return Decoration.none;
        const k = abschnitte(zeilen, typ), r = [];
        for (let i = 0; i < k.length; i++) if (k[i]) r.push(Decoration.line({ class: k[i] }).range(doc.line(i + 1).from));
        return Decoration.set(r, true);
      } catch (e) { return Decoration.none; }
    };
    ctx.editor(ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = bauen(view); }
      update(u) { if (u.docChanged) this.decorations = bauen(u.view); }
    }, { decorations: (v) => v.decorations }));
    return true;
  };

  // ---------- Leseansicht: Klassen je Abschnitt ----------
  const merkText = { text: null, k: null };
  const nachbearbeiten = (el, ctx) => {
    const fmc = ctx?.frontmatter || fmVon(app.vault.getAbstractFileByPath(ctx?.sourcePath || ""));
    if (!ARTEN[fmc.typ]) return;
    const info = ctx.getSectionInfo?.(el);
    if (!info || typeof info.text !== "string") return;
    if (merkText.text !== info.text) { merkText.text = info.text; merkText.k = abschnitte(info.text.split("\n"), fmc.typ); }
    const k = merkText.k[info.lineStart];
    if (!k) return;
    // Liste über mehrere Zeilen: Anfang/Ende des Kastens am Abschnitt, nicht an der ersten Zeile
    const ende = merkText.k[info.lineEnd] || "";
    let cls = k;
    if (k.indexOf("eba-vorl-z ") === 0) cls = k.replace(" eba-vorl-z-ende", "") + (ende.indexOf("eba-vorl-z-ende") >= 0 ? " eba-vorl-z-ende" : "");
    for (const c of cls.split(" ")) if (c) el.addClass(c);
  };

  // ---------- Registrieren ----------
  const registrieren = () => {
    const block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      try { zeichnen(el, c); } catch (e) { el.setText("Vorlesung: Fehler – " + e.message); console.error("Vorlesung", e); }
    });
    ctx.postprozessor((el, c) => { try { nachbearbeiten(el, c); } catch (e) {} });
    try { editorErweiterung(); } catch (e) { console.error("Vorlesung Editor", e); }
    const bald = ctx.entprellen(() => block.neu(), 400);
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => {
      const typ = cache?.frontmatter?.typ;
      if (["vorlesung", "lehrveranstaltung", "unterlage"].includes(typ) || f.path === "System/Einstellungen.md" || f.path.startsWith("System/Daten/")) bald();
    });
    // Neuer Tag: „heute“, „gestern“ und die Perle dieser Woche rücken weiter (seit 24.10.2026; vorher erst, wenn sich eine Notiz
    // änderte)
    const tag = ctx.bleibend("tag", () => ({ wert: ctx.date.now("YYYY-MM-DD") }));
    ctx.intervall(() => { const h = ctx.date.now("YYYY-MM-DD"); if (h !== tag.wert) { tag.wert = h; block.neu(); } }, 5 * 60 * 1000);
  };

  return { registrieren, zeichnen, abschnitte };
};
