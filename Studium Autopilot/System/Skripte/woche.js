// Wochenraster auf Dashboard und Stundenplan: Codeblock ```eba-woche``` (in der Karte > [!eba-kennzahlen|woche …]).
// Zeigt eine Kalenderwoche Montag bis Freitag (die Planwoche des Fachmodells: am Samstag und Sonntag schon die nächste) mit den
// Stundenplan-Notizen (typ: lehrveranstaltung, jede Herkunft: Alma, eigener Abgleich, zentral, ILIAS-Gruppe, gewählte Gruppe,
// von Hand). Ob eine Sitzung stattfindet, sagt ctx.modell.findetStatt (eine Regel mit „Als Nächstes“ der Modulseite): ein Kasten
// bis zu bis (Einzeltermin nur an seinem Tag), vor von blass mit „ab TT.MM.“ (eine gewählte Gruppe steht gleich nach der
// Anmeldung da, nicht erst ab ihrer ersten Woche); Ausfall (ausfall, Pausen, vorlesungsfreie Tage wie Christi
// Himmelfahrt) durchgestrichen, Änderung (aenderungen) gestrichelt mit neuer Zeit und neuem Raum, Überschneidungen nebeneinander. Oben kräftig der Kurzname (kurz der Notiz oder des Moduls,
// sonst Code), blass Art und Gruppe (nur Übung, Tutorium, Seminar; Name aus gruppe), darunter Raum, davor der Beginn, wenn er
// nicht zur vollen Stunde liegt. Kopfzeile rechts „‹ KW n ›“; Wischen nach links/rechts wechselt am Touch-Gerät die Woche.
// Welche Woche: nur auf diesem Gerät (app.saveLocalStorage, Schlüssel eba-woche-versatz, nie im Vault, nie abgeglichen), so
// blättern zwei Geräte unabhängig. Nach 30 Minuten ohne Wechsel und nach jedem Neustart von Obsidian wieder die aktuelle Woche
// (der Wert trägt die Sitzung). „KW n“ ist in einer anderen Woche der Weg zurück.
// Bis 17.10.2026 war das Raster eine Bases-Formel; Bases liest keinen gerätelokalen Speicher, darum jetzt hier. DOM und Klassen
// sind dieselben (eba-core.css Abschnitte 13, 33, 39, 47, 54, 55). Schreibt keine Datei. Neu gezeichnet (entprellt) bei
// Änderungen an Stundenplan-, Modul- und Einstellungsnotizen und an den Semesterdaten, beim Zurückkommen in die App und alle
// 10 Minuten.
module.exports = function (ctx) {
  const app = window.app;
  const SPRACHE = "eba-woche";
  const SCHLUESSEL = "eba-woche-versatz";
  const FRISCH_MS = 30 * 60 * 1000;
  const WEIT = 60; // Wochen in jede Richtung
  const WISCHEN = 50; // px Mindestweg
  const RAND = 30; // px: Wischen vom Bildschirmrand gehört Obsidian (Seitenleisten)
  const HOEHE = { "Dashboard.md": 497 }; // Höhe des Rasters in px (am PC/iPad nur Stundenplan, Dashboard hat feste Viertelstunden)
  const HOEHE_SONST = 697;
  const TAGE = ["Mo", "Di", "Mi", "Do", "Fr"];
  const VORLESUNG = ["Vorlesung", "Veranstaltung"]; // „Veranstaltung“ = Alma ohne erkannte Art

  // ---------- Datum (Ortszeit, ganze Tage auch über die Zeitumstellung) ----------
  const M = () => ctx.modell; // Fachmodell (modell.js), beim Zeichnen nachgeschlagen
  const zwei = (n) => (n < 10 ? "0" : "") + n;
  const iso = (d) => d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate());
  const datum = (s) => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const tagMonat = (s) => { const d = datum(s); return zwei(d.getDate()) + "." + zwei(d.getMonth() + 1) + "."; };
  const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const liste = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

  // Montag der gezeigten Woche ohne Blättern: die Planwoche (Montag bis Freitag diese, Samstag und Sonntag die nächste)
  const aktuellerMontag = (jetzt) => datum(M().planwoche(iso(jetzt)).mo);
  // ISO-Kalenderwoche
  const kw = (d) => M().zeit.kw(iso(d));

  // ---------- Gezeigte Woche: nur auf diesem Gerät ----------
  // Sitzung: neu bei jedem Start von Obsidian (ctx.bleibend überlebt nur den Hot-Reload dieses Skripts)
  const sitzung = ctx.bleibend("sitzung", () => String(Date.now()) + "-" + Math.round(Math.random() * 1e6));
  // Rohwert aus dem Gerätespeicher → Versatz in Wochen (0 = aktuelle Woche). Gilt nur in derselben Sitzung und höchstens
  // 30 Minuten nach dem letzten Wechsel.
  const versatzAus = (roh, jetztMs, sitz) => {
    let o = roh;
    if (typeof o === "string") { try { o = JSON.parse(o); } catch (e) { return 0; } }
    if (!o || typeof o !== "object" || o.sitzung !== sitz) return 0;
    const v = Number(o.versatz), alter = jetztMs - Number(o.zeit);
    if (!isFinite(v) || Math.round(v) !== v || Math.abs(v) > WEIT || !(alter >= 0 && alter < FRISCH_MS)) return 0;
    return v;
  };
  const versatzWert = (v, jetztMs, sitz) => (v ? JSON.stringify({ versatz: v, zeit: jetztMs, sitzung: sitz }) : null);
  const versatz = () => versatzAus(app.loadLocalStorage(SCHLUESSEL), ctx.date.jetzt().getTime(), sitzung);
  const versatzSetzen = (v) => {
    const n = Math.max(-WEIT, Math.min(WEIT, Math.round(Number(v) || 0)));
    app.saveLocalStorage(SCHLUESSEL, versatzWert(n, ctx.date.jetzt().getTime(), sitzung));
  };

  // ---------- Kasten: Text ----------
  const istUebung = (fm) => !!fm.art && VORLESUNG.indexOf(String(fm.art)) < 0;
  // Kurzname: kurz der Notiz, sonst kurz des Moduls (nach Code), sonst Code, sonst der Titel vor „ · “
  const kurzname = (fm, kurzVonCode) => {
    if (fm.kurz) return String(fm.kurz);
    const code = fm.code ? String(fm.code) : "";
    if (code && kurzVonCode && kurzVonCode[code]) return String(kurzVonCode[code]);
    return code || String(fm.titel || "").split(" · ")[0];
  };
  // Art und Gruppe (nur Übung, Tutorium, Seminar …): gruppe ist der Anzeigename („Gruppe 4“, „Tutorium 1“), nie gruppe_alma.
  // Beginnt er mit der Art, steht nur er da; eine bloße Zahl wird „Gruppe n“.
  const artText = (fm) => {
    if (!istUebung(fm)) return "";
    const art = String(fm.art), g = fm.gruppe == null ? "" : String(fm.gruppe).trim();
    if (!g) return art;
    if (/^[0-9]+$/.test(g)) return art + " Gruppe " + g;
    return g.toLowerCase().indexOf(art.toLowerCase()) === 0 ? g : art + " " + g;
  };

  // ---------- Kasten: Lage ----------
  const zeit = (s) => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? { h: +m[1], m: +m[2] } : null; };
  const zeileVon = (z, h0) => (z.h - h0) * 4 + Math.floor(z.m / 15) + 2;
  const zeileBis = (z, h0) => (z.h - h0) * 4 + Math.ceil(z.m / 15) + 2;
  // Überschneidungen je Tag nebeneinander: Gruppen sich überlappender Kästen, je Kasten Spalte und Spaltenzahl der Gruppe
  const spalten = (kaesten) => {
    const nachTag = {};
    for (const k of kaesten) (nachTag[k.tag] = nachTag[k.tag] || []).push(k);
    for (const tag of Object.keys(nachTag)) {
      const ks = nachTag[tag].slice().sort((a, b) => a.von - b.von || b.bis - a.bis);
      let gruppe = [], ende = -1;
      const abschliessen = () => { const n = gruppe.reduce((m, k) => Math.max(m, k.spalte + 1), 1); for (const k of gruppe) k.spalten = n; };
      for (const k of ks) {
        if (gruppe.length && k.von >= ende) { abschliessen(); gruppe = []; ende = -1; }
        const belegt = gruppe.filter((x) => x.bis > k.von).map((x) => x.spalte);
        let s = 0;
        while (belegt.indexOf(s) >= 0) s++;
        k.spalte = s;
        gruppe.push(k);
        ende = Math.max(ende, k.bis);
      }
      if (gruppe.length) abschliessen();
    }
    return kaesten;
  };

  // ---------- Woche berechnen (reine Logik, ohne DOM) ----------
  // notizen: [{ pfad, fm }] mit typ lehrveranstaltung; kurzVonCode: { Code: Kurzname }; modulPfad: { Name der Modulnotiz: Pfad };
  // modell: ctx.modell (Semester, Pausen, freie Tage, findetStatt); montag: Date; jetzt: Date
  const wocheBauen = ({ notizen, kurzVonCode, modulPfad, modell, montag, jetzt }) => {
    const tage = [0, 1, 2, 3, 4].map((i) => iso(plus(montag, i)));
    const heute = iso(jetzt), wt = jetzt.getDay() || 7;
    const ht = wt <= 5 && tage[wt - 1] === heute;
    // Semester nach dem Freitag der gezeigten Woche (deine Semesterliste, sonst zentral bzw. nach Regel)
    const sem = modell.semesterFuer(tage[4]);
    const pw = modell.daten().pausen.filter((p) => p.von <= tage[4] && p.bis >= tage[0]);
    // nie: entfallen oder „Besuche ich nicht“ (findetStatt prüft das vor dem Tag)
    const nie = (fm) => ["entfaellt", "ausgeblendet"].indexOf(modell.findetStatt(fm, tage[0]).grund) >= 0;
    const lv = notizen.filter(({ fm }) => sem && fm.semester === sem.name && !nie(fm) && zeit(fm.beginn) && zeit(fm.ende));
    // Größe des Rasters aus allen Serien des Semesters (dazu Einzeltermine und geänderte Zeiten dieser Woche), damit es von
    // Woche zu Woche gleich bleibt
    const aenderungIn = (fm) => liste(fm.aenderungen).map((x) => String(x).split("|")).filter((x) => x.length >= 4 && tage.indexOf(x[0]) >= 0 && zeit(x[1]) && zeit(x[2]))[0] || null;
    const spannen = [];
    for (const { fm } of lv) {
      if (fm.einzeltermin !== true || tage.indexOf(M().zeit.iso(fm.von)) >= 0) spannen.push([zeit(fm.beginn), zeit(fm.ende)]);
      const a = aenderungIn(fm);
      if (a) spannen.push([zeit(a[1]), zeit(a[2])]);
    }
    const h0 = spannen.length ? Math.min.apply(null, spannen.map((s) => s[0].h)) : 8;
    const h1 = spannen.length ? Math.max.apply(null, spannen.map((s) => s[1].h + (s[1].m > 0 ? 1 : 0))) : 18;
    const rows = Math.max(1, (h1 - h0) * 4);
    // Je Notiz ihr Tag der Woche und ob sie dort stattfindet (Ausfall, Pause, freier Tag → durchgestrichen). Vor ihrem Beginn
    // (Tag vor von, etwa ein Tutorium ab der vierten Woche) blass mit „ab TT.MM.“, nach bis gar nicht.
    const AUS = ["ausfall", "pause", "frei"];
    const wl = [];
    for (const n of lv) {
      const w = Number(n.fm.wochentag);
      if (!(w >= 1 && w <= 5)) continue;
      const s = modell.findetStatt(n.fm, tage[w - 1]);
      const von = n.fm.einzeltermin === true ? "" : modell.zeit.iso(n.fm.von);
      const ab = s.grund === "ausserhalb" && von && tage[w - 1] < von ? von : "";
      if (s.statt || ab || AUS.indexOf(s.grund) >= 0) wl.push(Object.assign({ s, ab }, n));
    }
    const gehalten = wl.filter(({ s }) => s.statt);
    let leer = "";
    if (!gehalten.length) {
      if (pw.length) leer = pw[0].name || "Vorlesungsfrei";
      else if (sem && sem.vb && tage[4] < sem.vb) leer = "Vorlesungsbeginn " + tagMonat(sem.vb);
      else if (sem && sem.ve && tage[0] > sem.ve) leer = "Vorlesungsfrei";
      else leer = "Keine Lehrveranstaltungen";
    }
    const jetztHm = zwei(jetzt.getHours()) + ":" + zwei(jetzt.getMinutes());
    const kaesten = !gehalten.length ? [] : wl.map(({ pfad, fm, s, ab }) => {
      const tag = Number(fm.wochentag);
      const aen = s.geaendert;
      const b = aen ? zeit(s.beginn) : zeit(fm.beginn), e = aen ? zeit(s.ende) : zeit(fm.ende);
      const raum = aen ? s.raum : fm.raum == null ? "" : String(fm.raum);
      const zeitText = aen ? s.beginn + "–" + s.ende : String(fm.beginn) + "–" + String(fm.ende);
      const aus = !s.statt && !ab;
      const klassen = ["eba-ev", istUebung(fm) ? "ue" : "vl"];
      if (fm.konflikt) klassen.push("konflikt");
      if (aen) klassen.push("geaendert");
      if (ab) klassen.push("spaeter");
      else if (aus) klassen.push("ausfall");
      else if (ht && tag === wt) { klassen.push("heute"); if (jetztHm >= String(fm.beginn) && jetztHm <= String(fm.ende)) klassen.push("jetzt"); }
      // Antippen öffnet das Modul über seinen vollen Pfad, nie über den Namen (den könnte eine andere Notiz auch tragen)
      const modul = String(fm.modul || "").replace(/^\[\[|\]\]$/g, "").split("|")[0].split("#")[0].trim();
      const ziel = (modulPfad && (modulPfad[modul] || modulPfad[modul.replace(/\.md$/, "").split("/").pop()])) || pfad;
      return {
        tag, pfad, klassen,
        von: Math.max(2, Math.min(rows + 1, zeileVon(b, h0))), bis: Math.max(3, Math.min(rows + 2, zeileBis(e, h0))),
        titel: String(fm.titel || pfad) + " · " + zeitText + " · " + raum + (fm.konflikt ? " · überschneidet sich mit " + fm.konflikt : "")
          + (aus ? " · fällt aus" + (s.name ? " (" + s.name + ")" : "") : "") + (ab ? " · beginnt am " + tagMonat(ab) : ""),
        notiz: ziel,
        kurz: kurzname(fm, kurzVonCode), art: artText(fm),
        // Beginn nur, wenn er nicht zur vollen Stunde liegt (c.t.), bei einer Änderung die neue Zeit, vor dem Beginn „ab TT.MM.“
        zeit: ab ? "ab " + tagMonat(ab) : aen ? zeitText : String(fm.beginn).slice(-2) !== "00" ? String(fm.beginn) : "",
        raum,
      };
    });
    for (const k of kaesten) if (k.bis <= k.von) k.bis = k.von + 1;
    return { tage, ht, wt, h0, h1, rows, kaesten: spalten(kaesten), leer, kw: modell.zeit.kw(tage[0]) };
  };

  // ---------- Lesen (metadataCache) ----------
  const lesen = () => {
    const notizen = [], kurzVonCode = {}, modulPfad = {}; // Semester, Pausen und „Besuche ich nicht“ kommen aus dem Modell
    for (const f of app.vault.getMarkdownFiles()) {
      const fm = (app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (!fm) continue;
      if (fm.typ === "lehrveranstaltung") notizen.push({ pfad: f.path, fm });
      else if (fm.typ === "modul") {
        modulPfad[f.basename] = f.path;
        modulPfad[f.path.replace(/\.md$/, "")] = f.path;
        if (fm.code && fm.kurz) kurzVonCode[String(fm.code)] = String(fm.kurz);
      }
    }
    return { notizen, kurzVonCode, modulPfad };
  };

  // ---------- Zeichnen ----------
  const knopf = (eltern, cls, text, titel, schritt) => {
    const a = eltern.createEl("a", { cls, text, attr: { href: ctx.link("woche", { schritt }), title: titel, role: "button" } });
    return a;
  };
  const zeichnen = (el, c) => {
    const jetzt = ctx.date.jetzt();
    const v = versatz();
    const montag = plus(aktuellerMontag(jetzt), v * 7);
    const W = wocheBauen(Object.assign(lesen(), { modell: M(), montag, jetzt }));
    const pfad = (c && c.sourcePath) || "";
    const zeileHoehe = Math.round(((HOEHE[pfad] || HOEHE_SONST) / (W.rows + 1)) * 100) / 100;
    el.empty();
    const g = el.createDiv({ cls: "eba-woche", attr: { lang: "de", style: "grid-template-rows:34px repeat(" + (W.rows + 1) + ", " + zeileHoehe + "px)" } });
    if (W.ht) g.createEl("i", { cls: "eba-tagspalte", attr: { style: "grid-column:" + (W.wt + 1) } });
    g.createDiv({ cls: "eba-tagkopf eba-ecke", attr: { style: "grid-column:1" } });
    TAGE.forEach((t, i) => {
      const d = plus(montag, i);
      const k = g.createDiv({ cls: "eba-tagkopf" + (W.ht && W.wt === i + 1 ? " heute" : "") + (i === 4 ? " fr" : ""), text: t, attr: { style: "grid-column:" + (i + 2) } });
      const s = k.createSpan({ cls: "eba-tagdatum", text: d.getDate() + "." });
      s.createSpan({ cls: "eba-tagmonat", text: d.getMonth() + 1 + "." });
    });
    const nav = g.createDiv({ cls: "eba-wpfeile", attr: { style: "grid-column:6" } });
    knopf(nav, "eba-wpfeil", "‹", "Woche davor", v - 1);
    const kwEl = v ? knopf(nav, "eba-wkw anders", "", "Zurück zur aktuellen Woche", 0) : nav.createSpan({ cls: "eba-wkw", attr: { title: "Kalenderwoche" } });
    kwEl.createSpan({ text: "KW\u00a0" }); // geschütztes Leerzeichen: bleibt auch in inline-flex (iPhone) stehen
    kwEl.appendText(String(W.kw));
    knopf(nav, "eba-wpfeil", "›", "Woche danach", v + 1);
    for (let h = W.h0; h <= W.h1; h++) {
      const r = "grid-row:" + ((h - W.h0) * 4 + 2);
      g.createSpan({ cls: "eba-zeit", text: zwei(h), attr: { style: r } });
      g.createEl("i", { cls: "eba-linie", attr: { style: r } });
    }
    for (const k of W.kaesten) {
      let stil = "grid-column:" + (k.tag + 1) + ";grid-row:" + k.von + " / " + k.bis;
      if (k.spalten > 1) stil += ";width:calc(" + Math.round(10000 / k.spalten) / 100 + "% - 2px);margin-left:" + Math.round((10000 * k.spalte) / k.spalten) / 100 + "%";
      const a = g.createEl("a", { cls: k.klassen.join(" "), attr: { title: k.titel, href: ctx.link("zeigen", { notiz: k.notiz }), style: stil } });
      const b = a.createEl("b", { text: k.kurz });
      if (k.art) { b.appendText(" "); b.createEl("i", { text: k.art }); }
      const s = a.createSpan();
      if (k.zeit) s.createEl("time", { text: k.zeit + " · " });
      s.appendText(k.raum);
    }
    if (W.leer) g.createDiv({ cls: "eba-woche-leer", attr: { style: "grid-row:2 / span " + W.rows } }).createSpan({ text: W.leer });
    wischen(g, v);
  };

  // Wischen (Touch, Hauptweg zum Blättern am iPhone): waagerecht mehr als 50 px und mehr als doppelt so weit wie senkrecht →
  // Woche danach (nach links) bzw. davor. Nicht vom Bildschirmrand (30 px, dort zieht Obsidian die Seitenleisten auf) und
  // nicht auf einem Link oder Kasten begonnen. Ob waagerecht, entscheidet die erste Bewegung über 10 px; erst danach
  // preventDefault (und nicht weiterreichen), senkrechtes Scrollen bleibt also unberührt.
  const wischen = (g, v) => {
    let start = null, achse = "";
    const breite = () => (g.ownerDocument && g.ownerDocument.defaultView ? g.ownerDocument.defaultView.innerWidth : 0);
    g.addEventListener("touchstart", (e) => {
      const t = e.touches && e.touches[0];
      const aufLink = !!(e.target && e.target.closest && e.target.closest("a"));
      start = t && e.touches.length === 1 && !aufLink && wischStartOk(t.clientX, breite()) ? { x: t.clientX, y: t.clientY } : null;
      achse = "";
    }, { passive: true });
    g.addEventListener("touchmove", (e) => {
      const t = start && e.touches && e.touches[0];
      if (!t) return;
      if (!achse) achse = wischAchse(t.clientX - start.x, t.clientY - start.y);
      if (achse === "v") start = null;
      else if (achse === "h") { if (e.cancelable) e.preventDefault(); e.stopPropagation(); }
    }, { passive: false });
    g.addEventListener("touchend", (e) => {
      const s = start, t = s && achse === "h" && e.changedTouches && e.changedTouches[0];
      start = null;
      if (!t) return;
      const r = wischRichtung(t.clientX - s.x, t.clientY - s.y);
      if (r) { versatzSetzen(v + r); neu(); }
    }, { passive: true });
  };
  // Beginnt das Wischen weit genug vom linken und rechten Bildschirmrand?
  const wischStartOk = (x, breite) => x >= RAND && (!breite || x <= breite - RAND);
  // Erste deutliche Bewegung (über 10 px): "h" waagerecht (mehr als doppelt so weit wie senkrecht), "v" sonst, "" noch offen
  const wischAchse = (dx, dy) => (Math.max(Math.abs(dx), Math.abs(dy)) <= 10 ? "" : Math.abs(dx) > 2 * Math.abs(dy) ? "h" : "v");
  // Wischweg → +1 (nach links: Woche danach), −1 (nach rechts: Woche davor), 0 (kein Wischen)
  const wischRichtung = (dx, dy) => (Math.abs(dx) > WISCHEN && Math.abs(dx) > 2 * Math.abs(dy) ? (dx < 0 ? 1 : -1) : 0);

  let block = null;
  const neu = () => { if (block) block.neu(); };
  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      // Das Plugin startet die Erweiterungen alphabetisch, modell.js erst danach: bis dahin der Ersatztext des Blocks
      if (!ctx.modell || !ctx.modell.planwoche) { el.setText(String(quelle || "").trim()); return; }
      try { zeichnen(el, c); } catch (e) { el.setText("Woche: Fehler – " + e.message); console.error("Woche", e); }
    });
    const bald = ctx.entprellen(neu, 400);
    const wichtig = (f, cache) => {
      const typ = cache && cache.frontmatter && cache.frontmatter.typ;
      return typ === "lehrveranstaltung" || typ === "modul" || (f && (f.path === "System/Einstellungen.md" || String(f.path).indexOf("Stundenplan/") === 0
        || String(f.path).indexOf("System/Daten/") === 0));
    };
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => { if (wichtig(f, cache)) bald(); });
    ctx.an(app.metadataCache, "deleted", (f, vorher) => { if (wichtig(f, vorher)) bald(); });
    ctx.an(app.vault, "rename", (f, alt) => { if (wichtig(f, app.metadataCache.getFileCache(f)) || String(alt).indexOf("Stundenplan/") === 0) bald(); });
    // Zurück in der App: 30 Minuten vorbei? neuer Tag? „jetzt“ weitergerückt?
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "visible") bald(); });
    ctx.intervall(() => { if (document.visibilityState === "visible") neu(); }, 10 * 60 * 1000);
  };

  const aktionen = {
    // ‹ › und „KW n“ (Links im Raster): schritt = Versatz in Wochen (0 = aktuelle Woche)
    woche: { ausfuehren: (c) => { versatzSetzen(c.parameter.schritt); neu(); } },
  };

  return { registrieren, aktionen, aktuellerMontag, kw, versatzAus, versatzWert, versatz, wocheBauen, spalten, kurzname, artText, wischStartOk, wischAchse, wischRichtung };
};
