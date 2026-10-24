// Kalender oben auf der Seite Studium/Termine & Anmeldungen.md: Codeblock ```eba-kalender``` (Kalender-Ansicht zuerst, die Liste
// darunter). Monatsansicht wie in gängigen Kalendern: Raster Mo–So mit Haarlinien, heute als gefüllter Kreis, Wochenende getönt.
// Termine stehen beschriftet in den Tagen: mehrtägige als getönter Balken über die Tage (Titel darin), eintägige als Zeile
// mit Farbpunkt, Uhrzeit und Titel. Farbe nach Art (wie die Pillen: Prüfung, Uni, Veranstaltung/Fachschaft).
// Fristen (kategorie: Frist) stehen NICHT im Kalender (Entscheidung 15.10.2026: Anmeldezeiträume verdeckten die Termine), sondern
// nur in der Liste darunter (termine.js: Diese Woche, Nächste Woche, Fristen danach).
// Je Woche Spuren wie bei Google/Apple, nach Relevanz (gewicht), höchstens SPUREN Zeilen je Tag, Rest als „+n weitere“.
// Ein Tipp auf einen Tag zeigt darunter dessen Termine (Farbpunkt aus dem CSS, Uhrzeit, Titel als Link; Text-Pillen nur für
// Prüfung, freiwillig, geschätzt, erledigt). Im Kopf neben „Heute“ der Knopf „+ Termin“ (Aktion termin aus notizen.js, seit
// 17.10.2026; vorher eine eigene Knopf-Karte auf der Seite). Schmale Ansicht (iPhone): Container-Query in eba-core.css, dann
// auch eintägige als getönte Blöcke ohne Uhrzeit.
// Daten live aus dem Fachmodell (ctx.modell.termine(): Termin-Notizen ohne Entfallenes, Uhrzeit als Zahl sortiert, Art wie in
// Agenda und Dashboard), schreibt keine Datei; zeichnet bei Änderungen, Löschen und
// Umbenennen von Termin-Notizen neu, dazu an einem neuen Tag (alle 30 Min. und beim Zurückkommen in die App geprüft). Gewählter
// Monat und Tag gelten nur auf diesem Gerät und bis zum Tageswechsel oder 30 Minuten ohne Tipp, dann wieder heute.
// Erweiterung: Das Plugin ruft registrieren() beim Start und nach jeder Änderung dieser Datei auf (Hot-Reload); Codeblock und
// Ereignisse laufen über ctx.codeblock/ctx.an, das Plugin meldet die alte Fassung vorher ab. Stil: eba-core.css Abschnitt 37, Klassen eba-kal-*.
module.exports = function (ctx) {
  const app = window.app;
  const SPRACHE = "eba-kalender";
  const SPUREN = 4; // sichtbare Terminzeilen je Tag (eba-core.css: grid-template-rows der .eba-kal-woche)
  const WTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const LANGTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const RANG = { pruefung: 0, zwischentest: 1, frist: 1, uni: 2, event: 3 };
  const PILLE = { pruefung: "bad", zwischentest: "info", frist: "warn", uni: "info", event: "akzent" };

  const M = () => ctx.modell; // Fachmodell (modell.js), beim Zeichnen nachgeschlagen
  const tag0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const abstand = (a, b) => Math.round((a - b) / 86400000); // ganze Tage, auch über die Zeitumstellung
  const gleich = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const kurz = (d) => M().zeit.datum(d); // „Mo 19.10.“, Jahr nur außerhalb des Studienjahrs
  const lang = (d) => `${LANGTAG[d.getDay()]}, ${d.getDate()}. ${MONATE[d.getMonth()]}`;
  // Art (Farbe) nach der einen Regel des Fachmodells; Zwischentests (Titel enthält „Zwischentest“) sind keine Prüfung
  const art = (k, titel = "") => M().terminArt(k, k === "Prüfung" && M().istZwischentest(titel));
  const tage = (g) => Array.from({ length: g.e - g.s + 1 }, (_, i) => g.s + i);

  const lesen = () => M().termine().map((t) => ({
    f: t.f, von: M().zeit.tag(t.datum), bis: t.bis ? M().zeit.tag(t.bis) : null, kat: t.kategorie, art: t.art, erledigt: t.erledigt,
    sq: t.freiwillig, geschaetzt: t.geschaetzt, zeit: t.zeit, minuten: t.minuten == null ? -1 : t.minuten, titel: t.titel,
  }));

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
    const zeitfolge = (a, b) => a.s - b.s || (!!a.t.zeit - !!b.t.zeit) || a.t.minuten - b.t.minuten;
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

  // Gewählter Monat/Tag je Gerät und Sitzung (nicht im Vault). am = Tag, an dem du gewählt hast, zeit = wann (ms): An einem neuen
  // Tag oder nach 30 Minuten ohne Tipp zeigt der Kalender wieder heute (wie die Woche, woche.js; seit 24.10.2026). Vorher blieb
  // die Auswahl von gestern stehen, und am Monatsersten zeigte er noch den alten Monat.
  const FRISCH_MS = 30 * 60 * 1000;
  const zustand = ctx.bleibend("zustand", () => ({ monat: null, tag: null, am: null, zeit: 0 }));
  // Gilt die Auswahl noch? (rein, Test) z = zustand, jetzt = Date
  const frisch = (z, jetzt) => !!z.monat && !!z.tag && !!gleich(z.am, jetzt) && jetzt.getTime() - z.zeit < FRISCH_MS;
  const basis = ctx;

  const zeichnen = (el, ctx) => {
    const jetzt = basis.date.jetzt(), heute = tag0(jetzt);
    if (!frisch(zustand, jetzt)) Object.assign(zustand, { monat: new Date(heute.getFullYear(), heute.getMonth(), 1), tag: heute, am: null, zeit: 0 });
    const waehlen = (monat, tag) => Object.assign(zustand, { monat, tag, am: heute, zeit: basis.date.jetzt().getTime() });
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
    // „+ Termin“: dieselbe Aktion wie der Link obsidian://studium-autopilot?aktion=termin (fragt Titel und Datum ab);
    // auf dem iPhone nur das Plus (eba-core.css). Kein neu(): die neue Notiz löst das Neuzeichnen über den metadataCache aus.
    const neuKnopf = nav.createEl("button", { cls: "eba-kal-neu", attr: { type: "button", "aria-label": "Neuer Termin", title: "Neuer Termin" } });
    neuKnopf.createSpan({ cls: "eba-kal-neu-zeichen", text: "+" });
    neuKnopf.createSpan({ cls: "eba-kal-neu-wort", text: "Termin" });
    klick(neuKnopf, () => basis.aktion("termin", {}, { quelle: app.workspace.getActiveFile() }));
    knopf(nav, "Heute", "Heute", () => waehlen(new Date(heute.getFullYear(), heute.getMonth(), 1), heute));
    const pfeile = nav.createDiv({ cls: "eba-kal-pfeile" });
    knopf(pfeile, "‹", "Voriger Monat", () => { const mo = new Date(y, m - 1, 1); waehlen(mo, ersterTag(mo)); });
    knopf(pfeile, "›", "Nächster Monat", () => { const mo = new Date(y, m + 1, 1); waehlen(mo, ersterTag(mo)); });

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
          waehlen(d.getMonth() !== m ? new Date(d.getFullYear(), d.getMonth(), 1) : zustand.monat, d);
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
    for (const [k, t] of [["pruefung", "Prüfung"], ["zwischentest", "Zwischentest"], ["uni", "Uni"], ["event", "Veranstaltung"]]) {
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
      klick(a, (e) => basis.oeffnen(t.f, { neu: e.ctrlKey || e.metaKey }));
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
      // Art als Farbpunkt (CSS, --kal); Text nur für Prüfung und Frist (Fristen stehen nicht im Kalender, der Fall bleibt für die Vollständigkeit)
      if (t.art === "pruefung" || t.art === "frist") { text.appendText(" "); text.createSpan({ cls: `eba-pill ${PILLE[t.art]}`, text: t.kat }); }
      if (t.art === "zwischentest") { text.appendText(" "); text.createSpan({ cls: "eba-pill info", text: "Zwischentest" }); }
      // Schlüsselqualifikation (zentral.js, bereich): ruhige Pille, keine Pflicht
      if (t.sq) { text.appendText(" "); text.createSpan({ cls: "eba-pill leer", text: "freiwillig" }); }
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
      // Das Plugin startet die Erweiterungen alphabetisch, modell.js erst danach: bis dahin der Ersatztext des Blocks
      if (!ctx.modell || !ctx.modell.termine) { el.setText(String(quelle || "").trim()); return; }
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

  return { registrieren, zeichnen, art, frisch }; // art und frisch für tests/kalender.test.js
};
