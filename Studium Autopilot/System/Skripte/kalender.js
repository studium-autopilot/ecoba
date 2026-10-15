// Kalender oben auf der Seite Studium/Termine & Anmeldungen.md: Codeblock ```eba-kalender``` (Kalender-Ansicht zuerst, die Liste
// darunter). Monatsraster Mo–So, heute hervorgehoben, je Tag farbige Punkte
// nach Art (Farben wie die Pillen: Frist, Prüfung, Lehre/Uni, Veranstaltung/Fachschaft), mehrtägige Termine als Balken,
// Monat vor/zurück; ein Tipp auf einen Tag zeigt darunter dessen Termine (Uhrzeit, Titel als Link, Art).
// Daten live aus den Termin-Notizen (metadataCache, typ: termin), schreibt keine Datei; zeichnet bei Änderungen neu.
// Erweiterung: Das Plugin ruft registrieren() beim Start und nach jeder Änderung dieser Datei auf (Hot-Reload); Codeblock und
// Ereignisse laufen über ctx.codeblock/ctx.an, das Plugin meldet die alte Fassung vorher ab. Stil: eba-core.css Abschnitt 37, Klassen eba-kal-*.
module.exports = function (ctx) {
  const app = window.app;
  const SPRACHE = "eba-kalender";
  const WTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const KURZTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const EVENT = ["Fachschaft", "Veranstaltung"];
  const ZEIT = /(?:^|\D)((?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[–-]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?)(?!\d)/; // wie termine.js, ohne Lookbehind (iOS < 16.4); Uhrzeit = Gruppe 1
  const RANG = { pruefung: 0, frist: 1, uni: 2, event: 3, erledigt: 4 };
  const PILLE = { pruefung: "bad", frist: "warn", uni: "info", event: "akzent" };

  const pad = (n) => String(n).padStart(2, "0");
  const datum = (v) => { const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const tag0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const gleich = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const kurz = (d) => `${KURZTAG[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  const art = (k) => (k === "Prüfung" ? "pruefung" : k === "Frist" ? "frist" : EVENT.includes(k) ? "event" : "uni");

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

  // Gewählter Monat/Tag je Gerät und Sitzung (nicht im Vault)
  const zustand = ctx.bleibend("zustand", () => ({ monat: null, tag: null }));
  const basis = ctx;

  const zeichnen = (el, ctx) => {
    const heute = tag0(basis.date.jetzt());
    if (!zustand.monat) zustand.monat = new Date(heute.getFullYear(), heute.getMonth(), 1);
    if (!zustand.tag) zustand.tag = heute;
    const neu = () => zeichnen(el, ctx);
    const y = zustand.monat.getFullYear(), m = zustand.monat.getMonth();
    const alle = lesen();
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
    const knopf = (text, label, fn) => klick(nav.createEl("button", { text, attr: { type: "button", "aria-label": label } }), () => { fn(); neu(); });
    knopf("‹", "Voriger Monat", () => { zustand.monat = new Date(y, m - 1, 1); zustand.tag = ersterTag(zustand.monat); });
    knopf("Heute", "Heute", () => { zustand.monat = new Date(heute.getFullYear(), heute.getMonth(), 1); zustand.tag = heute; });
    knopf("›", "Nächster Monat", () => { zustand.monat = new Date(y, m + 1, 1); zustand.tag = ersterTag(zustand.monat); });

    const raster = el.createDiv({ cls: "eba-kal-raster" });
    for (const w of WTAGE) raster.createDiv({ cls: "eba-kal-wt", text: w });
    const versatz = (new Date(y, m, 1).getDay() + 6) % 7;
    const wochen = Math.ceil((versatz + new Date(y, m + 1, 0).getDate()) / 7);
    for (let i = 0; i < wochen * 7; i++) {
      const d = new Date(y, m, 1 - versatz + i);
      const wt = i % 7;
      const ts = amTag(d);
      const zelle = raster.createEl("button", { cls: "eba-kal-tag", attr: { type: "button", "aria-label": `${kurz(d)}: ${ts.length} ${ts.length === 1 ? "Termin" : "Termine"}` } });
      if (d.getMonth() !== m) zelle.addClass("is-fremd");
      if (wt >= 5) zelle.addClass("is-we");
      if (gleich(d, heute)) zelle.addClass("is-heute");
      if (gleich(d, zustand.tag)) zelle.addClass("is-gewaehlt");
      zelle.createSpan({ cls: "eba-kal-zahl", text: String(d.getDate()) });
      // Punkte: eintägige Termine, nach Wichtigkeit (Prüfung, Frist, Uni, Veranstaltung), höchstens 4
      const einzel = ts.filter((t) => !t.bis).map((t) => (t.erledigt ? "erledigt" : t.art)).sort((a, b) => RANG[a] - RANG[b]);
      const punkte = zelle.createSpan({ cls: "eba-kal-punkte" });
      for (const a of einzel.slice(0, 4)) punkte.createEl("i", { cls: a });
      if (einzel.length > 4) punkte.createSpan({ cls: "eba-kal-mehr", text: "+" });
      // Balken: mehrtägige Termine, durchgehend über die Tage (Anfang/Ende abgerundet, auch am Wochenrand)
      const lang = ts.filter((t) => t.bis).sort((a, b) => RANG[a.art] - RANG[b.art] || a.von - b.von).slice(0, 2);
      if (lang.length) {
        const balken = zelle.createSpan({ cls: "eba-kal-balken" });
        for (const t of lang) {
          const b = balken.createEl("i", { cls: t.erledigt ? "erledigt" : t.art });
          if (gleich(d, t.von) || wt === 0) b.addClass("anfang");
          if (gleich(d, t.bis) || wt === 6) b.addClass("ende");
        }
      }
      klick(zelle, () => {
        zustand.tag = d;
        if (d.getMonth() !== m) zustand.monat = new Date(d.getFullYear(), d.getMonth(), 1);
        neu();
      });
    }

    // Legende der Punktfarben (eine kleine Zeile unter dem Raster)
    const legende = el.createDiv({ cls: "eba-kal-legende" });
    for (const [k, t] of [["pruefung", "Prüfung"], ["frist", "Frist"], ["uni", "Uni"], ["event", "Veranstaltung"]]) {
      const s = legende.createSpan(); s.createEl("i", { cls: k }); s.appendText(t);
    }

    // Termine des gewählten Tags
    const tag = zustand.tag;
    const liste = el.createDiv({ cls: "eba-kal-liste" });
    const n = Math.round((tag - heute) / 86400000);
    liste.createDiv({ cls: "eba-kal-datum", text: `${kurz(tag)}${tag.getFullYear() !== heute.getFullYear() ? tag.getFullYear() : ""}${n === 0 ? " · heute" : n === 1 ? " · morgen" : ""}` });
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
      z.createSpan({ cls: "eba-kal-zeit", text: t.zeit || (t.bis ? (gleich(t.von, tag) ? "Beginn" : "letzter Tag") : "") });
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
      laufend.forEach((t, i) => {
        const s = text.createSpan({ cls: `eba-kal-lauf ${t.erledigt ? "erledigt" : t.art}` });
        if (i) s.appendText(" · ");
        s.createEl("i");
        link(s, t);
        s.appendText(` bis ${kurz(t.bis)}`);
      });
    }
  };

  // Alle sichtbaren Kalender neu zeichnen (nach Änderungen an Termin-Notizen); getrennte Blöcke vergessen
  const registrieren = () => {
    // Codeblock: das Plugin meldet je Sprache einen Prozessor an und ruft immer diese (aktuelle) Fassung
    const block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      try { zeichnen(el, c); } catch (e) { el.setText("Kalender: Fehler – " + e.message); console.error("Kalender", e); }
    });
    const bald = ctx.entprellen(() => block.neu(), 1500);
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => {
      if (cache?.frontmatter?.typ === "termin" || f.path.startsWith("Termine/")) bald();
    });
  };

  return { registrieren, zeichnen };
};
