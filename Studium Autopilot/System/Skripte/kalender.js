// Kalender oben auf der Seite Studium/Termine & Anmeldungen.md: Codeblock ```eba-kalender``` (Kalender-Ansicht zuerst, die Liste
// darunter). Monatsansicht wie in gängigen Kalendern: Raster Mo–So mit Haarlinien, heute als gefüllter Kreis, Wochenende getönt.
// Termine stehen beschriftet in den Tagen: mehrtägige als getönter Balken über die Tage (Titel darin), eintägige als Zeile
// mit Farbpunkt, Uhrzeit und Titel. Farbe nach Art (wie die Pillen: Prüfung, Uni, Veranstaltung/Fachschaft).
// Fristen (kategorie: Frist) stehen NICHT im Kalender (Entscheidung 15.10.2026: Anmeldezeiträume verdeckten die Termine), sondern
// nur in der Liste darunter (termine.js: Diese Woche, Nächste Woche, Fristen danach).
// Je Woche Spuren wie bei Google/Apple, nach Relevanz (gewicht), höchstens SPUREN Zeilen je Tag, Rest als „+n weitere“.
// Ein Tipp auf einen Tag zeigt darunter dessen Termine (Uhrzeit, Titel als Link, Art). Schmale Ansicht (iPhone): Container-Query
// in eba-core.css, dann auch eintägige als getönte Blöcke ohne Uhrzeit.
// Daten live aus den Termin-Notizen (metadataCache, typ: termin), schreibt keine Datei; zeichnet bei Änderungen, Löschen und
// Umbenennen von Termin-Notizen neu, dazu an einem neuen Tag (alle 30 Min. und beim Zurückkommen in die App geprüft).
// Erweiterung: Das Plugin ruft registrieren() beim Start und nach jeder Änderung dieser Datei auf (Hot-Reload); Codeblock und
// Ereignisse laufen über ctx.codeblock/ctx.an, das Plugin meldet die alte Fassung vorher ab. Stil: eba-core.css Abschnitt 37, Klassen eba-kal-*.
module.exports = function (ctx) {
  const app = window.app;
  const SPRACHE = "eba-kalender";
  const SPUREN = 4; // sichtbare Terminzeilen je Tag (eba-core.css: grid-template-rows der .eba-kal-woche)
  const WTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const KURZTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const LANGTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const EVENT = ["Fachschaft", "Veranstaltung"];
  const ZEIT = /(?:^|\D)((?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[–-]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?)(?!\d)/; // wie termine.js, ohne Lookbehind (iOS < 16.4); Uhrzeit = Gruppe 1
  const RANG = { pruefung: 0, frist: 1, uni: 2, event: 3 };
  const PILLE = { pruefung: "bad", frist: "warn", uni: "info", event: "akzent" };

  const pad = (n) => String(n).padStart(2, "0");
  const datum = (v) => { const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const tag0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const abstand = (a, b) => Math.round((a - b) / 86400000); // ganze Tage, auch über die Zeitumstellung
  const gleich = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const kurz = (d) => `${KURZTAG[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  const lang = (d) => `${LANGTAG[d.getDay()]}, ${d.getDate()}. ${MONATE[d.getMonth()]}`;
  const art = (k) => (k === "Prüfung" ? "pruefung" : k === "Frist" ? "frist" : EVENT.includes(k) ? "event" : "uni");
  const tage = (g) => Array.from({ length: g.e - g.s + 1 }, (_, i) => g.s + i);

  const lesen = () => {
    const aus = [];
    // Termin-Notizen aus dem Datenmodell (modell.js, einmal berechnet), sonst alle Notizen durchsuchen
    const dateien = ctx.modell && ctx.modell.daten ? ctx.modell.daten().termine.map((x) => x.f) : app.vault.getMarkdownFiles();
    for (const f of dateien) {
      const fm = app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.typ !== "termin") continue;
      const von = datum(fm.datum);
      if (!von) continue;
      const bis = datum(fm.bis);
      const ort = String(fm.ort ?? "").replace(/\s+/g, " ");
      const kat = String(fm.kategorie ?? "").trim() || "Termin";
      aus.push({
        f, von, bis: bis && bis > von ? bis : null, kat, art: art(kat), erledigt: fm.erledigt === true, sq: fm.bereich === "schluesselqualifikation",
        geschaetzt: fm.status === "geschätzt", zeit: (ort.match(ZEIT) || ["", ""])[1],
        titel: String(fm.titel || f.basename).replace(/\s+/g, " ").trim(),
      });
    }
    return aus.sort((a, b) => a.von - b.von || a.zeit.localeCompare(b.zeit) || a.titel.localeCompare(b.titel));
  };

  // Relevanz für die Reihenfolge im Raster: Pflicht vor Kür. Freiwilliges (bereich: schluesselqualifikation, z. B. TCP-Belegung)
  // und Erledigtes rücken nach hinten und landen bei Platzmangel zuerst in „+n weitere“; die Tagesliste zeigt immer alles.
  const gewicht = (t) => (t.erledigt ? 9 : t.sq ? 5 : RANG[t.art]);

  // Spuren einer Woche (start = Montag): jeder Termin bekommt die niedrigste Zeile, die an all seinen Tagen frei ist.
  // Reihenfolge: Relevanz (gewicht), dann mehrtägige vor eintägigen (früher Beginn, dann länger), eintägige ganztägig vor
  // Uhrzeit. Passt ein Tag nicht in SPUREN Zeilen, bleibt dort die letzte Zeile für „+n weitere“ frei.
  const spuren = (alle, start) => {
    const ende = plus(start, 6);
    const segs = alle.filter((t) => t.von <= ende && (t.bis || t.von) >= start).map((t) => ({
      t, s: Math.max(0, abstand(t.von, start)), e: Math.min(6, abstand(t.bis || t.von, start)),
    }));
    const zeitfolge = (a, b) => a.s - b.s || (!!a.t.zeit - !!b.t.zeit) || a.t.zeit.localeCompare(b.t.zeit);
    segs.sort((a, b) => gewicht(a.t) - gewicht(b.t) || (!!b.t.bis - !!a.t.bis)
      || (a.t.bis ? a.s - b.s || (b.e - b.s) - (a.e - a.s) : zeitfolge(a, b))
      || a.t.titel.localeCompare(b.t.titel));
    const belegt = Array.from({ length: 7 }, () => []);
    for (const g of segs) {
      let z = 0;
      while (tage(g).some((c) => belegt[c][z])) z++;
      g.z = z;
      for (const c of tage(g)) belegt[c][z] = g;
    }
    const anzahl = (c) => segs.filter((g) => g.s <= c && g.e >= c).length;
    for (const g of segs) g.zeigen = g.z < SPUREN && tage(g).every((c) => anzahl(c) <= SPUREN || g.z < SPUREN - 1);
    // Jeder Tag mit verdeckten Terminen braucht die letzte Zeile frei; wiederholen, bis das überall gilt
    for (let neu = true; neu;) {
      neu = false;
      for (let c = 0; c < 7; c++) {
        const letzte = belegt[c][SPUREN - 1];
        if (letzte?.zeigen && segs.some((g) => !g.zeigen && g.s <= c && g.e >= c)) { letzte.zeigen = false; neu = true; }
      }
    }
    const mehr = Array.from({ length: 7 }, (_, c) => segs.filter((g) => !g.zeigen && g.s <= c && g.e >= c).length);
    return { segs: segs.filter((g) => g.zeigen), mehr };
  };

  // Gewählter Monat/Tag je Gerät und Sitzung (nicht im Vault)
  const zustand = ctx.bleibend("zustand", () => ({ monat: null, tag: null }));
  const basis = ctx;

  const zeichnen = (el, ctx) => {
    const heute = tag0(basis.date.jetzt());
    if (!zustand.monat) zustand.monat = new Date(heute.getFullYear(), heute.getMonth(), 1);
    if (!zustand.tag) zustand.tag = heute;
    const neu = () => zeichnen(el, ctx);
    const y = zustand.monat.getFullYear(), m = zustand.monat.getMonth();
    const alle = lesen().filter((t) => t.art !== "frist"); // Fristen nur in der Liste darunter
    const amTag = (d) => alle.filter((t) => t.von <= d && (t.bis || t.von) >= d);
    const klick = (knoten, fn) => {
      knoten.addEventListener("mousedown", (e) => e.stopPropagation()); // Bearbeitungsansicht: nicht in den Quelltext springen
      knoten.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fn(e); });
    };

    el.empty();
    el.addClass("eba-kalender");
    const kopf = el.createDiv({ cls: "eba-kal-kopf" });
    kopf.createDiv({ cls: "eba-kal-monat", text: `${MONATE[m]} ${y}` });
    const nav = kopf.createDiv({ cls: "eba-kal-nav" });
    // Beim Monatswechsel: heute, wenn im Monat; sonst der erste Tag mit Terminen; sonst der 1.
    const ersterTag = (mo) => {
      if (mo.getFullYear() === heute.getFullYear() && mo.getMonth() === heute.getMonth()) return heute;
      const ende = new Date(mo.getFullYear(), mo.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= ende; i++) { const d = new Date(mo.getFullYear(), mo.getMonth(), i); if (amTag(d).length) return d; }
      return mo;
    };
    const knopf = (ort, text, label, fn) => klick(ort.createEl("button", { text, attr: { type: "button", "aria-label": label, title: label } }), () => { fn(); neu(); });
    knopf(nav, "Heute", "Heute", () => { zustand.monat = new Date(heute.getFullYear(), heute.getMonth(), 1); zustand.tag = heute; });
    const pfeile = nav.createDiv({ cls: "eba-kal-pfeile" });
    knopf(pfeile, "‹", "Voriger Monat", () => { zustand.monat = new Date(y, m - 1, 1); zustand.tag = ersterTag(zustand.monat); });
    knopf(pfeile, "›", "Nächster Monat", () => { zustand.monat = new Date(y, m + 1, 1); zustand.tag = ersterTag(zustand.monat); });

    const raster = el.createDiv({ cls: "eba-kal-raster" });
    const wtage = raster.createDiv({ cls: "eba-kal-wtage" });
    WTAGE.forEach((w, i) => wtage.createDiv({ cls: i >= 5 ? "eba-kal-wt is-we" : "eba-kal-wt", text: w }));
    const versatz = (new Date(y, m, 1).getDay() + 6) % 7;
    const wochen = Math.ceil((versatz + new Date(y, m + 1, 0).getDate()) / 7);
    for (let w = 0; w < wochen; w++) {
      const start = new Date(y, m, 1 - versatz + w * 7);
      const woche = raster.createDiv({ cls: "eba-kal-woche" });
      for (let i = 0; i < 7; i++) {
        const d = plus(start, i);
        const ts = amTag(d);
        const label = `${lang(d)}: ${ts.length ? ts.map((t) => t.titel).join(", ") : "keine Termine"}`;
        const zelle = woche.createEl("button", { cls: "eba-kal-tag", attr: { type: "button", "aria-label": label } });
        zelle.style.gridColumn = String(i + 1);
        if (d.getMonth() !== m) zelle.addClass("is-fremd");
        if (i >= 5) zelle.addClass("is-we");
        if (gleich(d, heute)) zelle.addClass("is-heute");
        if (gleich(d, zustand.tag)) zelle.addClass("is-gewaehlt");
        zelle.createSpan({ cls: "eba-kal-zahl", text: String(d.getDate()) });
        klick(zelle, () => {
          zustand.tag = d;
          if (d.getMonth() !== m) zustand.monat = new Date(d.getFullYear(), d.getMonth(), 1);
          neu();
        });
      }
      // Termine über den Tagen: reine Anzeige (pointer-events: none), ein Tipp trifft den Tag darunter
      const { segs, mehr } = spuren(alle, start);
      for (const g of segs) {
        const t = g.t;
        const cls = ["eba-kal-ev", t.erledigt ? "erledigt" : t.art, t.bis ? "is-lang" : "is-kurz"];
        if (t.bis && t.von >= start) cls.push("anfang");
        if (t.bis && t.bis <= plus(start, 6)) cls.push("ende");
        if (tage(g).every((c) => plus(start, c).getMonth() !== m)) cls.push("is-fremd");
        if ((t.bis || t.von) < heute) cls.push("is-vorbei");
        if (t.sq) cls.push("is-freiwillig");
        const ev = woche.createDiv({ cls: cls.join(" "), attr: { "aria-hidden": "true" } });
        ev.style.gridColumn = `${g.s + 1} / ${g.e + 2}`;
        ev.style.gridRow = String(g.z + 2);
        if (!t.bis) ev.createEl("i");
        if (!t.bis && t.zeit) ev.createSpan({ cls: "eba-kal-ev-zeit", text: t.zeit.split(/\s*[–-]\s*/)[0] });
        ev.createSpan({ cls: "eba-kal-ev-titel", text: t.titel });
      }
      mehr.forEach((n, c) => {
        if (!n) return;
        const x = woche.createDiv({ cls: "eba-kal-mehr", attr: { "aria-hidden": "true" } });
        x.style.gridColumn = String(c + 1);
        x.style.gridRow = String(SPUREN + 1);
        x.createSpan({ text: `+${n}` });
        x.createSpan({ cls: "eba-kal-mehr-wort", text: " weitere" });
      });
    }

    // Legende: Farbe = Art; rechts Balken = mehrtägig, gestrichelt = freiwillig. Nur was im Monat vorkommt (Prüfung immer,
    // damit die Farbe bekannt ist).
    const imRaster = alle.filter((t) => t.von <= new Date(y, m + 1, 0) && (t.bis || t.von) >= new Date(y, m, 1));
    const legende = el.createDiv({ cls: "eba-kal-legende" });
    for (const [k, t] of [["pruefung", "Prüfung"], ["uni", "Uni"], ["event", "Veranstaltung"]]) {
      if (k !== "pruefung" && !imRaster.some((x) => x.art === k)) continue;
      const s = legende.createSpan({ cls: k }); s.createEl("i"); s.appendText(t);
    }
    const extra = legende.createSpan({ cls: "eba-kal-leg-rechts" });
    if (imRaster.some((x) => x.bis)) { const s = extra.createSpan({ cls: "eba-kal-leg-lang" }); s.createEl("i"); s.appendText("mehrtägig"); }
    if (imRaster.some((x) => x.sq)) { const s = extra.createSpan({ cls: "eba-kal-leg-frei" }); s.createEl("i"); s.appendText("freiwillig"); }

    // Termine des gewählten Tags
    const tag = zustand.tag;
    const liste = el.createDiv({ cls: "eba-kal-liste" });
    const n = abstand(tag, heute);
    liste.createDiv({ cls: "eba-kal-datum", text: `${lang(tag)}${tag.getFullYear() !== heute.getFullYear() ? " " + tag.getFullYear() : ""}${n === 0 ? " · heute" : n === 1 ? " · morgen" : ""}` });
    const ts = amTag(tag);
    const link = (ort, t) => {
      const a = ort.createEl("a", { cls: "internal-link eba-kal-link", text: t.titel, href: t.f.path, attr: { "data-href": t.f.path } });
      klick(a, (e) => app.workspace.openLinkText(t.f.path, ctx?.sourcePath || "", e.ctrlKey || e.metaKey));
    };
    // Mehrtägige Termine, die an diesem Tag weder beginnen noch enden: nur eine ruhige Sammelzeile „läuft“ am Ende
    const laufend = ts.filter((t) => t.bis && !gleich(t.von, tag) && !gleich(t.bis, tag));
    const eigen = ts.filter((t) => !laufend.includes(t));
    if (!ts.length) liste.createDiv({ cls: "eba-kal-leer", text: "Keine Termine." });
    for (const t of eigen) {
      const z = liste.createDiv({ cls: `eba-kal-eintrag ${t.erledigt ? "erledigt" : t.art}` });
      z.createSpan({ cls: "eba-kal-zeit", text: t.zeit || (t.bis ? (gleich(t.von, tag) ? "Beginn" : "letzter Tag") : "ganztägig") });
      const text = z.createSpan({ cls: "eba-kal-text" });
      link(text, t);
      if (t.bis) text.appendText(gleich(t.von, tag) ? ` · bis ${kurz(t.bis)}` : ` · seit ${kurz(t.von)}`);
      text.appendText(" ");
      text.createSpan({ cls: `eba-pill ${PILLE[t.art]}`, text: t.kat });
      // Schlüsselqualifikation (zentral.js, bereich): ruhige Pille, keine Pflicht
      if (t.sq) { text.appendText(" "); text.createSpan({ cls: "eba-pill leer", text: "Schlüsselqualifikation · freiwillig" }); }
      if (t.geschaetzt) { text.appendText(" "); text.createSpan({ cls: "eba-pill leer", text: "geschätzt" }); }
      if (t.erledigt) { text.appendText(" "); text.createSpan({ cls: "eba-pill ok", text: "erledigt" }); }
    }
    if (laufend.length) {
      const z = liste.createDiv({ cls: "eba-kal-eintrag eba-kal-laufend" });
      z.createSpan({ cls: "eba-kal-zeit", text: "läuft" });
      const text = z.createSpan({ cls: "eba-kal-text" });
      for (const t of laufend) {
        const s = text.createSpan({ cls: `eba-kal-lauf ${t.erledigt ? "erledigt" : t.art}${t.sq ? " is-freiwillig" : ""}` });
        s.createEl("i");
        link(s, t);
        s.appendText(` bis ${kurz(t.bis)}`);
      }
    }
  };

  // Alle sichtbaren Kalender neu zeichnen (nach Änderungen an Termin-Notizen); getrennte Blöcke vergessen
  const registrieren = () => {
    // Codeblock: das Plugin meldet je Sprache einen Prozessor an und ruft immer diese (aktuelle) Fassung
    const block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      try { zeichnen(el, c); } catch (e) { el.setText("Kalender: Fehler – " + e.message); console.error("Kalender", e); }
    });
    const bald = ctx.entprellen(() => block.neu(), 1500);
    const termin = (f, cache) => cache?.frontmatter?.typ === "termin" || f.path.startsWith("Termine/");
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => { if (termin(f, cache)) bald(); });
    ctx.an(app.metadataCache, "deleted", (f, vorher) => { if (termin(f, vorher)) bald(); });
    ctx.an(app.vault, "rename", (f, alt) => { if (termin(f, app.metadataCache.getFileCache(f)) || String(alt).startsWith("Termine/")) bald(); });
    // Tageswechsel (Markierung „heute“): alle 30 Minuten und beim Zurückkommen in die App, nur wenn ein neuer Tag ist
    let gezeichnetAm = ctx.date.now("YYYY-MM-DD");
    const tagNeu = () => { const h = ctx.date.now("YYYY-MM-DD"); if (h !== gezeichnetAm) { gezeichnetAm = h; block.neu(); } };
    ctx.intervall(tagNeu, 30 * 60 * 1000);
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "visible") tagNeu(); });
  };

  return { registrieren, zeichnen };
};
