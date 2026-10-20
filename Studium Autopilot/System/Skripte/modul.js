// Modulseite (seit 17.10.2026): Codeblock ```eba-modul``` direkt unter dem Kopf jeder Modulnotiz (typ: modul). Ersetzt die
// Tabelle „Mein Stand“ und die beiden Knopfreihen. Daten live aus dem metadataCache und ctx.modell, geschrieben wird nur
// ins Frontmatter dieser Modulnotiz und nur auf Tipp.
//  1. Stand: Status als Knopf (Tipp: Menü mit Status, Note, Versuch, Semester, Plan, Anrechnung), Semester (semester_geplant
//     vor Musterplan, ctx.modell.modulSemester) mit Vorlesungswoche bzw. Fachsemester, Prüfung nach der einen Regel
//     (ctx.modell.pruefungVon: Modulstatus, erledigt, entfällt) mit Countdown erst ab 30 Tagen, bei Profil und Schwerpunkt
//     „Zählt als“/„Anrechnung in“. Statusfarbe aus ctx.modell.statusArt.
//  2. Semesterband: eine Zelle je Kalenderwoche der Vorlesungszeit des Modulsemesters (ctx.modell.vorlesungswochen): vorbei,
//     diese Woche (Planwoche des Fachmodells), Pause; Punkt für Vorlesungsnotizen (voll = nachgearbeitet, Tipp öffnet die Notiz); Monate darunter;
//     Markierung in der Woche der Prüfung. Nur, wenn das Semester bekannt ist.
//  3. Als Nächstes: höchstens drei Einträge ab jetzt: die nächste Sitzung jeder Stundenplan-Serie (ctx.modell.naechsteSitzung:
//     von/bis, ausfall, aenderungen, Pausen, freie Tage, entfaellt) und Termin-Notizen mit diesem Kürzel (ctx.modell.termine),
//     die nicht erledigt sind. Tipp öffnet die Notiz. Seit 20.10.2026 auch Ausfälle der nächsten 14 Tage (ctx.modell.ausfaelle;
//     vorher übersprang die Liste sie still) mit Pille „fällt aus“, und eine geänderte Sitzung mit Pille „anderer Raum“, „neuer
//     Raum“, „andere Zeit“ oder „geändert“, neuem Wert in Warnfarbe und dem üblichen durchgestrichen (wie die Woche).
//  3b. Abdeckung (seit 0.5.3): Termine aus Folien und ILIAS-Dateien kommen zentral nur für Module, deren Unterlagen der Autor
//     liest (ctx.zentral.abdeckung). Im laufenden Semester steht bei jedem anderen Modul ein Satz darüber; mit eigenem Server liest
//     der die neuen Unterlagen des Moduls nach Terminen (server.js).
//  4. Knöpfe: Neues Übungsblatt, Karteikarten lernen (wenn es einen Stapel gibt), Unterlagen einordnen, Suchen.
//  5. Vorlesungen (seit 19.10.2026): eigener Abschnitt direkt unter dem Modulfeld, über „Unterlagen“, ohne Codeblock in den
//     Modulnotizen. Deine Vorlesungsnotizen, neueste zuerst, als Zeilen wie die Unterlagen; Name aus ctx.modell.vorlesung
//     („Vorlesung 1 · Mo 13.10. · Thema“), „nachgearbeitet“ als Pille. Darunter „Neue Vorlesungsnotiz“ (Fenster mit diesem
//     Modul vorgewählt, im laufenden Semester hervorgehoben); ohne Notizen ein Satz davor. Ab sechs Notizen erst die fünf neuesten.
//  Unter dem Stand (seit 0.4.5, Beta): ein offener Vorschlag aus Alma („Alma: bestanden · 1,7 · Stand 12.02.“ mit Übernehmen und
//     Ausblenden), gezeichnet von alma-konto.js (ctx.almaKonto.modulFeld); neu gezeichnet, wenn sich die Daten aus Alma ändern.
// Reine Logik (naechstes, band, noteOk, titelOhne, spanne) für tests/modul.test.js.
// Stil: eba-core.css Abschnitt 58.7 (eba-mod-*). iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const O = ctx.obsidian || {};
  const Fenster = O.Modal || class { constructor() { this.app = app; } };
  const SPRACHE = "eba-modul";
  const LINK = "obsidian://studium-autopilot?aktion=";
  const STATUS = ["offen", "läuft", "angemeldet", "bestanden", "nicht bestanden", "anerkannt"];
  const ES = "Elective Studies";
  const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const TAG = 86400000;

  const pad = (n) => String(n).padStart(2, "0");
  const text = (v) => String(v == null ? "" : v).trim();
  const liste = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
  const datum = (v) => {
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    const m = text(v).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const plusTage = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const Z = () => ctx.modell.zeit; // Datum in einer Schreibweise (docs/design.md): „Mo 19.10.“, Jahr nur außerhalb des Studienjahrs
  const tagText = (d) => Z().datum(d);
  const minuten = (s) => (ctx.modell ? Z().minuten(s) : null);
  const tageBis = (d, heute) => Math.round((datum(d) - datum(heute)) / TAG);
  // Zeitraum eines Termins: läuft schon → „bis So 25.10.“, sonst „19.–25.10.“ bzw. „28.10. – 03.11.“
  const spanne = (d, bis, heute) => (d <= datum(heute) ? "bis " + tagText(bis) : Z().spanne(d, bis));

  // ---------- Reine Logik ----------
  // Note wie 1,7: 1,0 bis 4,0 in Zehnteln oder 5,0 (Feld-Register felder.js, eine Regel)
  const noteOk = (s) => { const r = ctx.user.felder.notePruefen(s); return r.ok && !!r.wert; };
  // Titel ohne das Kürzel des Moduls („Tutorien starten: B110 BWL“ → „Tutorien starten: BWL“)
  const titelOhne = (s, code) => text(text(s).split(code + " ").join("").split(" " + code).join(""));

  // Als Nächstes → [{ d, bis, zeit, was, wo, f, art: "sitzung" | "pruefung" | "termin", geschaetzt, geaendert, ausfall, marke,
  // raumNeu, raumAlt, zeitNeu, zeitAlt }], höchstens max. M = ctx.modell; stundenplan: [{ f, fm }]; termine: ctx.modell.termine()
  // (ohne Entfallenes). Prüfungen eines bestandenen oder anerkannten Moduls und Zwischentests als Termin (blau), nie als Prüfung.
  // Ausfall (ausfall): Sitzung der nächsten 14 Tage, die ausfällt (nicht wegen Pause); marke: kurzer Text der Pille.
  const naechstes = ({ M, code, stundenplan, termine, jetzt, max = 3 }) => {
    const heute = datum(jetzt), aus = [];
    const m = M.modul(code), fertig = !!m && m.fertig;
    for (const s of stundenplan || []) {
      if (!s || !s.fm || text(s.fm.code) !== code) continue;
      for (const a of M.ausfaelle ? M.ausfaelle(s.fm, jetzt, 14) : []) {
        aus.push({ d: a.d, bis: null, zeit: a.beginn + (a.ende ? "–" + a.ende : ""), sort: minuten(a.beginn) || 0, was: a.art, wo: "",
          f: s.f || null, art: "sitzung", geschaetzt: false, geaendert: false, ausfall: true, marke: "fällt aus" });
      }
      const x = M.naechsteSitzung(s.fm, jetzt);
      if (!x) continue;
      const raumNeu = !!x.raumGeaendert, zeitNeu = !!x.zeitGeaendert;
      aus.push({ d: x.d, bis: null, zeit: x.beginn + (x.ende ? "–" + x.ende : ""), sort: minuten(x.beginn) || 0, was: x.art,
        wo: x.raum, f: s.f || null, art: "sitzung", geschaetzt: false, geaendert: x.geaendert, ausfall: false,
        marke: raumNeu && zeitNeu ? "geändert" : raumNeu ? (x.neuerRaum ? "neuer Raum" : "anderer Raum") : zeitNeu ? "andere Zeit" : "",
        raumNeu, raumAlt: raumNeu ? x.raumAlt || "" : "", zeitNeu, zeitAlt: zeitNeu ? x.zeitAlt || "" : "" });
    }
    for (const t of termine || []) {
      if (!t || t.code !== code || t.erledigt) continue;
      const d = datum(t.datum), bis = t.bis ? datum(t.bis) : null;
      if ((bis || d) < heute) continue;
      const pruefung = t.kategorie === "Prüfung" && !t.zwischentest;
      if (pruefung && fertig) continue;
      aus.push({ d: d < heute ? heute : d, bis: bis && bis > d ? bis : null, zeit: t.zeit, sort: t.minuten == null ? -1 : t.minuten,
        was: titelOhne(t.titel, code), wo: t.wo, f: t.f || null, art: pruefung ? "pruefung" : "termin", geschaetzt: t.geschaetzt, geaendert: false,
        ausfall: false, marke: "" });
    }
    aus.sort((a, b) => a.d - b.d || a.sort - b.sort);
    return aus.slice(0, max);
  };

  // Semesterband aus den Vorlesungswochen (ctx.modell.vorlesungswochen(...).wochen: [{ mo, nr, pause }], nr 0 = Pause); woche =
  // Montag der Planwoche (ctx.modell.planwoche: am Wochenende schon die kommende), die Zelle „jetzt“; alles davor ist vorbei.
  // → { zellen: [{ mo, nr, pause, vorbei, jetzt, notizen, stand: 0 keine | 1 offen | 2 nachgearbeitet, pruefung }], monate: [{ i, name }] }
  const band = ({ wochen, notizen, woche, pruefung }) => {
    const wm = datum(woche), p = datum(pruefung);
    const zellen = (wochen || []).map((w) => {
      const mo = datum(w.mo), so = plusTage(mo, 6);
      const drin = (notizen || []).filter((n) => n.d >= mo && n.d <= so);
      return { mo, nr: Number(w.nr) || 0, pause: !Number(w.nr), vorbei: mo < wm, jetzt: +mo === +wm, notizen: drin,
        stand: drin.length ? (drin.every((n) => n.fertig) ? 2 : 1) : 0, pruefung: !!p && mo <= p && p <= so };
    });
    // Prüfung nach der Vorlesungszeit (z. B. Klausur im Februar, Vorlesungen bis Januar): eigene Zelle am Ende
    if (p && zellen.length && !zellen.some((z) => z.pruefung) && p > zellen[zellen.length - 1].mo) {
      const mo = plusTage(p, -((p.getDay() + 6) % 7));
      zellen.push({ mo, nr: 0, pause: false, nach: true, vorbei: mo < wm, jetzt: +mo === +wm, notizen: [], stand: 0, pruefung: true });
    }
    const monate = [];
    zellen.forEach((z, i) => { if (!i || z.mo.getMonth() !== zellen[i - 1].mo.getMonth()) monate.push({ i, name: MONATE[z.mo.getMonth()] }); });
    return { zellen, monate };
  };

  // ---------- Obsidian ----------
  const fmVon = (f) => (f && app.metadataCache.getFileCache(f)?.frontmatter) || {};
  const oeffnen = (f, e) => { if (f) ctx.oeffnen(f, { neu: !!(e && (e.metaKey || e.ctrlKey)) }); };
  const symbol = (el, name) => { try { if (O.setIcon) O.setIcon(el, name); } catch (e) { /* ohne Symbol */ } };
  const schreiben = (f, felder) => app.fileManager.processFrontMatter(f, (m) => { for (const k of Object.keys(felder)) m[k] = felder[k]; });
  // Tippen ohne Fokuswechsel und ohne Sprung in den Quelltext (Bearbeitungsansicht)
  const knopf = (el, fn) => {
    el.addEventListener("mousedown", (e) => { e.stopPropagation(); });
    el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fn(e); });
    return el;
  };
  const menue = (anker, eintraege) => {
    if (!O.Menu) return;
    const m = new O.Menu();
    for (const x of eintraege) {
      if (!x) { m.addSeparator(); continue; }
      m.addItem((i) => { i.setTitle(x.titel); if (x.an && i.setChecked) i.setChecked(true); if (x.symbol) i.setIcon(x.symbol); i.onClick(x.tun); });
    }
    const r = anker.getBoundingClientRect();
    m.showAtPosition({ x: r.left, y: r.bottom + 4 });
  };

  class NotenFenster extends Fenster {
    constructor(alt, fertig) { super(app); this.alt = alt; this.fertig = fertig; }
    onOpen() {
      const c = this.contentEl;
      c.addClass("eba-mod-fenster");
      c.createEl("h3", { text: "Note" });
      const feld = c.createEl("input", { type: "text", value: this.alt || "", attr: { inputmode: "decimal", placeholder: ctx.user.felder.NOTE.beispiel, "aria-label": "Note" } });
      const fehler = c.createDiv({ cls: "eba-mod-fehler" });
      const zeile = c.createDiv({ cls: "eba-mod-fenster-knoepfe" });
      const leeren = zeile.createEl("button", { text: "Keine Note" });
      const ok = zeile.createEl("button", { text: "Speichern", cls: "mod-cta" });
      const speichern = (wert) => {
        const v = text(wert).replace(".", ",");
        if (v && !noteOk(v)) { fehler.setText(ctx.user.felder.NOTE.fehler); return; }
        this.fertig(v);
        this.close();
      };
      ok.addEventListener("click", () => speichern(feld.value));
      leeren.addEventListener("click", () => speichern(""));
      feld.addEventListener("keydown", (e) => { if (e.key === "Enter") speichern(feld.value); });
      ctx.zeit(() => feld.focus(), 60);
    }
    onClose() { this.contentEl.empty(); }
  }

  const statusMenue = (anker, f, fm, D) => {
    const st = text(fm.status).toLowerCase() || "offen";
    const benotet = fm.benotet !== false;
    const note = () => new NotenFenster(text(fm.ergebnis), (v) => schreiben(f, { ergebnis: v })).open();
    const e = STATUS.map((s) => ({
      titel: s.charAt(0).toUpperCase() + s.slice(1), an: s === st,
      tun: async () => { await schreiben(f, { status: s }); if (benotet && (s === "bestanden" || s === "nicht bestanden") && !text(fm.ergebnis)) note(); },
    }));
    e.push(null);
    if (benotet) e.push({ titel: text(fm.ergebnis) ? `Note ${text(fm.ergebnis)} ändern …` : "Note eintragen …", symbol: "pencil", tun: note });
    e.push({ titel: `${Number(fm.versuch) || 1}. Versuch …`, symbol: "rotate-ccw", tun: () => menue(anker, [1, 2, 3].map((n) => ({
      titel: n + ". Versuch", an: (Number(fm.versuch) || 1) === n, tun: () => schreiben(f, { versuch: n }),
    }))) });
    if (D && D.semesterliste && D.semesterliste.length) {
      const eigen = text(fm.semester_geplant);
      e.push({ titel: "Semester planen …", symbol: "calendar", tun: () => {
        const muster = ctx.modell && ctx.modell.modulSemester ? ctx.modell.modulSemester(Object.assign({}, fm, { semester_geplant: "" })) : "";
        const w = [{ titel: muster ? `Wie im Musterplan (${muster})` : "Ohne eigene Planung", an: !eigen, tun: () => schreiben(f, { semester_geplant: "" }) }, null];
        for (const s of D.semesterliste) w.push({ titel: `${s.name} · ${s.fs}. Fachsemester`, an: eigen === s.name, tun: () => schreiben(f, { semester_geplant: s.name }) });
        menue(anker, w);
      } });
    }
    menue(anker, e);
  };

  const mitPlan = (fm) => fm.gruppe === "Schwerpunkt" || fm.gruppe === "Profil & Vertiefung";
  const anrechnungName = (fm) => (fm.gruppe === "Schwerpunkt" ? "Anrechnung in" : fm.gruppe === "Profil & Vertiefung" ? "Zählt als" : "");
  const anrechnungMenue = (anker, f, fm) => {
    const jetzt = text(fm.anrechnung);
    const optionen = fm.gruppe === "Schwerpunkt" ? liste(fm.bereiche).map(text).filter(Boolean).concat([ES]) : [ES];
    const w = optionen.filter((x, i, a) => a.indexOf(x) === i).map((x) => ({ titel: x, an: x === jetzt, tun: () => schreiben(f, { anrechnung: x }) }));
    w.push(null, { titel: "Keine Angabe", an: !jetzt, tun: () => schreiben(f, { anrechnung: "" }) });
    menue(anker, w);
  };

  const feld = (el, k, cls) => { const b = el.createDiv({ cls: "eba-mod-feld" + (cls ? " " + cls : "") }); b.createDiv({ cls: "eba-mod-k", text: k }); return b; };

  // 5. Vorlesungen: Abschnitt mit Überschrift wie ## (gleiche Gestalt durch .eba h2), Zeilen wie die Unterlagen (.eba-ul-*).
  // liste = ctx.modell.vorlesungen({ code }) (neueste zuerst); laeuft = laufendes Semester des Moduls (Knopf hervorgehoben).
  const VL_ERST = 5;
  const vlAlle = ctx.bleibend("modul-vl-alle", () => ({})); // Code → alle zeigen (je Gerät, überlebt den Hot-Reload)
  const vorlesungenZeichnen = (el, { code, pfad, liste, laeuft }) => {
    const s = el.createDiv({ cls: "eba-mod-vl" + (vlAlle[code] ? " alle" : "") });
    s.createEl("h2", { cls: "eba-mod-vl-titel", text: "Vorlesungen" });
    if (liste.length) {
      const l = s.createDiv({ cls: "eba-ul eba-mod-vl-liste" });
      liste.forEach((v, i) => {
        const z = l.createDiv({ cls: "eba-ul-zeile" + (i >= VL_ERST && liste.length > VL_ERST + 1 ? " eba-mod-vl-alt" : ""),
          attr: { role: "link", tabindex: "0", "data-pfad": v.f.path } });
        z.createSpan({ cls: "eba-ul-titel", text: v.titel });
        if (v.nachgearbeitet) z.createSpan({ cls: "eba-pill " + ctx.modell.statusArt("nachgearbeitet"), text: "nachgearbeitet" });
        knopf(z, (e) => oeffnen(v.f, e));
        z.addEventListener("keydown", (e) => { if (e.key === "Enter") oeffnen(v.f, e); });
      });
    }
    const fuss = s.createDiv({ cls: "eba-mod-vl-fuss" });
    if (!liste.length) fuss.createSpan({ cls: "eba-ul-leer", text: "Noch keine Vorlesungsnotizen." });
    const a = fuss.createEl("a", { cls: "eba-mod-knopf" + (laeuft ? " haupt" : ""), href: `${LINK}vorlesung&code=${encodeURIComponent(code)}`,
      attr: { "data-sa-quelle": pfad } });
    a.addEventListener("mousedown", (e) => e.stopPropagation());
    symbol(a.createSpan({ cls: "eba-mod-sym" }), "plus");
    a.createSpan({ text: "Neue Vorlesungsnotiz" });
    if (liste.length > VL_ERST + 1) {
      const mehr = fuss.createEl("button", { cls: "eba-vb-knopf leise eba-mod-vl-mehr", attr: { type: "button" } });
      const beschriften = () => mehr.setText(vlAlle[code] ? "Weniger zeigen" : `Alle ${liste.length} zeigen`);
      beschriften();
      knopf(mehr, () => { vlAlle[code] = !vlAlle[code]; s.toggleClass("alle", !!vlAlle[code]); beschriften(); });
    }
    return s;
  };

  const zeichnen = (el, c) => {
    el.empty();
    const f = app.vault.getAbstractFileByPath(c.sourcePath);
    const fm = fmVon(f);
    const box = el.createDiv({ cls: "eba-mod" });
    if (!f || fm.typ !== "modul") { box.createDiv({ cls: "eba-mod-leer", text: "Nur auf Modulseiten." }); return; }
    const code = text(fm.code) || f.basename.split(" ")[0];
    const M = ctx.modell, D = M.daten();
    const jetzt = ctx.date.jetzt(), heute = datum(jetzt);
    const semName = M.modulSemester(fm);
    const sem = (D.semesterliste || []).find((s) => s.name === semName) || null;
    const pr = M.pruefungVon(code);
    const st = text(fm.status).toLowerCase() || "offen";
    const fertig = ["bestanden", "anerkannt"].indexOf(st) >= 0;

    // 1. Stand
    const stand = box.createDiv({ cls: "eba-mod-stand" });
    const fs = feld(stand, "Status", "eba-mod-st");
    const sk = knopf(fs.createEl("button", { cls: "eba-mod-status " + M.statusArt("modul", st), attr: { type: "button", "aria-haspopup": "menu" } }), () => statusMenue(sk, f, fm, D));
    sk.createSpan({ cls: "eba-mod-punkt" });
    sk.createSpan({ text: st.charAt(0).toUpperCase() + st.slice(1) });
    symbol(sk.createSpan({ cls: "eba-mod-pfeil" }), "chevron-down");
    const mehr = [];
    if (text(fm.ergebnis)) fs.createDiv({ cls: "eba-mod-note", text: text(fm.ergebnis).replace(".", ",") });
    if (Number(fm.versuch) > 1) mehr.push(`${Number(fm.versuch)}. Versuch`);
    if (mehr.length) fs.createDiv({ cls: "eba-mod-z", text: mehr.join(" · ") });

    const fsem = feld(stand, "Semester");
    if (semName) {
      fsem.createDiv({ cls: "eba-mod-v", text: semName });
      let unter = sem ? `${sem.fs}. Fachsemester` : "";
      if (sem && D.aktuell && D.aktuell.name === semName) { const w = M.woche(); if (w && w.text) unter = w.text; }
      if (text(fm.semester_geplant)) unter = unter ? unter + " · eigene Planung" : "eigene Planung";
      if (unter) fsem.createDiv({ cls: "eba-mod-z", text: unter });
    } else fsem.createDiv({ cls: "eba-mod-v eba-mod-blass", text: "Nicht geplant" });
    if (mitPlan(fm)) {
      const drin = fm.gewaehlt === true;
      const a = fsem.createEl("a", { cls: "eba-mod-plan" + (drin ? " drin" : ""), text: drin ? "✓ Im Plan" : "+ Planen",
        href: `${LINK}plan&modul=${encodeURIComponent(code)}`, attr: { "data-sa-quelle": f.path } });
      a.addEventListener("mousedown", (e) => e.stopPropagation());
    }

    // Ohne Prüfung (unbenotet, „keine“) und ohne Termin: kein Feld; bestanden oder anerkannt ohne geschriebene Prüfung ebenso
    const ohnePruefung = !pr && (fertig || fm.benotet === false || /^(keine|unbenotet)/i.test(text(fm.pruefung)));
    const fpr = ohnePruefung ? null : feld(stand, "Prüfung");
    if (!fpr) { /* kein Feld */ } else if (pr) {
      const d = datum(pr.datum);
      const v = fpr.createDiv({ cls: "eba-mod-v" + (pr.f ? " eba-mod-link" : "") + (pr.offen ? "" : " eba-mod-blass") });
      v.setText((pr.geschaetzt && pr.offen ? "ca. " : "") + tagText(d));
      if (pr.f) knopf(v, (e) => oeffnen(pr.f, e));
      // Countdown nur für eine offene Prüfung; abgehakt („erledigt“) oder durch den Modulstatus erledigt: ohne Countdown
      const n = tageBis(d, heute), teile = [];
      if (pr.zeit) teile.push(pr.zeit);
      if (pr.offen && n >= 0 && n <= 30) teile.push(n === 0 ? "heute" : n === 1 ? "morgen" : `in ${n} Tagen`);
      else if (!pr.offen && !pr.fertig && pr.erledigt) teile.push("erledigt");
      if (teile.length) fpr.createDiv({ cls: "eba-mod-z" + (pr.offen && n >= 0 && n <= 7 ? " eba-mod-bald" : ""), text: teile.join(" · ") });
    } else fpr.createDiv({ cls: "eba-mod-v eba-mod-blass", text: "Termin folgt" });

    // Vorschlag aus Alma (alma-konto.js): nur bei offenem Vorschlag, schreibt erst nach Tipp
    if (ctx.almaKonto && ctx.almaKonto.modulFeld) { try { ctx.almaKonto.modulFeld(box, f, fm); } catch (e) { console.warn("Modul: Alma " + ((e && e.message) || e)); } }

    const an = anrechnungName(fm);
    if (an) {
      const fa = feld(stand, an);
      const ak = knopf(fa.createEl("button", { cls: "eba-mod-wahl", attr: { type: "button", "aria-haspopup": "menu" } }), () => anrechnungMenue(ak, f, fm));
      ak.createSpan({ text: text(fm.anrechnung) || "Wählen" });
      symbol(ak.createSpan({ cls: "eba-mod-pfeil" }), "chevron-down");
    }

    // 2. Semesterband: im laufenden Semester des Moduls, sonst nur, wenn es darin Vorlesungsnotizen gibt
    const laeuft = !!(sem && D.aktuell && D.aktuell.name === sem.name);
    const vl = M.vorlesungen ? M.vorlesungen({ code }) : []; // fehlt, solange der Sync ein älteres modell.js hat
    if (sem && sem.vb && sem.ve) {
      const W = M.vorlesungswochen({ vb: sem.vb, ve: sem.ve, name: sem.name });
      const notizen = vl.filter((v) => datum(v.datum)).map((v) => ({ f: v.f, d: datum(v.datum), fertig: v.nachgearbeitet, titel: v.titel }));
      const B = band({ wochen: W && W.wochen, notizen, woche: M.planwoche().mo, pruefung: pr && pr.offen ? pr.datum : null });
      if (B.zellen.length && (laeuft || B.zellen.some((z) => z.stand))) {
        const b = box.createDiv({ cls: "eba-mod-band", attr: { style: `--eba-mod-n: ${B.zellen.length}` } });
        const reihe = b.createDiv({ cls: "eba-mod-zellen", attr: { role: "img", "aria-label": `Vorlesungszeit ${sem.name}` } });
        for (const z of B.zellen) {
          const k = ["eba-mod-w"];
          if (z.vorbei) k.push("vorbei");
          if (z.jetzt) k.push("jetzt");
          if (z.pause) k.push("pause");
          if (z.nach) k.push("nach");
          if (z.pruefung) k.push("pruefung");
          if (z.stand) k.push("n" + z.stand);
          const titel = (z.nr ? `Vorlesungswoche ${z.nr}` : z.pruefung ? "Prüfung" : "Pause") + ` · ${pad(z.mo.getDate())}.${pad(z.mo.getMonth() + 1)}.`
            + (z.notizen.length ? " · " + z.notizen.map((n) => n.titel).join(", ") : "");
          const zelle = reihe.createSpan({ cls: k.join(" "), attr: { title: titel } });
          if (z.notizen.length) { zelle.addClass("eba-mod-tipp"); knopf(zelle, (e) => oeffnen(z.notizen[0].f, e)); }
        }
        const mon = b.createDiv({ cls: "eba-mod-monate", attr: { "aria-hidden": "true" } });
        for (const m of B.monate) mon.createSpan({ text: m.name, attr: { style: `grid-column-start: ${m.i + 1}` } });
      }
    }

    // 3. Als Nächstes
    const N = naechstes({ M, code, stundenplan: D.stundenplan, termine: M.termine(), jetzt, max: 3 });
    if (N.length) {
      const n = box.createDiv({ cls: "eba-mod-naechstes" });
      n.createDiv({ cls: "eba-mod-k", text: "Als Nächstes" });
      for (const x of N) {
        const z = n.createDiv({ cls: "eba-mod-zeile " + x.art + (x.f ? " eba-mod-tipp" : "") + (x.ausfall ? " ausfall" : "") });
        z.createSpan({ cls: "eba-mod-tag", text: x.bis ? spanne(x.d, x.bis, heute) : tagText(x.d) });
        z.createSpan({ cls: "eba-mod-zeit" + (x.zeitNeu ? " eba-mod-neu" : ""), text: x.zeit });
        const w = z.createSpan({ cls: "eba-mod-was" });
        w.createSpan({ cls: "eba-mod-text", text: x.was });
        if (x.geschaetzt) w.createSpan({ cls: "eba-pill leer", text: "geschätzt" });
        if (x.marke) w.createSpan({ cls: "eba-pill warn", text: x.marke });
        // Ort: bei einer Änderung „statt“ und die übliche Zeit, dann der neue Raum in Warnfarbe und der übliche durchgestrichen
        const wo = z.createSpan({ cls: "eba-mod-wo" });
        if (x.zeitAlt) { wo.appendText("statt "); wo.createEl("s", { text: x.zeitAlt }); if (x.wo) wo.appendText(" · "); }
        if (x.raumNeu && x.wo) {
          wo.createSpan({ cls: "eba-mod-neu", text: x.wo });
          if (x.raumAlt) { wo.appendText(" statt "); wo.createEl("s", { text: x.raumAlt }); }
        } else if (x.wo) wo.appendText(x.wo);
        if (x.f) knopf(z, (e) => oeffnen(x.f, e));
      }
    }

    // 3b. Abdeckung
    const A = laeuft && ctx.zentral && ctx.zentral.abdeckung ? ctx.zentral.abdeckung() : null;
    if (A && !(A.gilt && A.module.indexOf(code) >= 0)) {
      const server = !!(ctx.server && ctx.server.terminsucheAn && ctx.server.terminsucheAn());
      box.createDiv({ cls: "eba-mod-abdeckung", text: "Termine aus Folien und ILIAS-Dateien dieses Moduls kommen nicht über die zentralen Daten. " +
        (server ? "Dein Server liest neue Unterlagen des Moduls dafür nach Terminen." : "Achte selbst auf Abgaben und Termine in den Unterlagen.") });
    }

    // 4. Knöpfe
    const k = box.createDiv({ cls: "eba-mod-knoepfe" });
    const stapel = app.vault.getMarkdownFiles().some((x) => { const m = fmVon(x); return m.typ === "karteikarten" && text(m.code) === code; });
    const q = encodeURIComponent(code);
    const knoepfe = [
      ["file-pen", "Neues Übungsblatt", `uebungsblatt&code=${q}`],
      stapel ? ["layers", "Karteikarten lernen", `karten-lernen&code=${q}`] : null,
      ["folder-input", "Unterlagen einordnen", `einordnen&code=${q}`],
      ["search", `In ${code} suchen`, `suchen&q=${encodeURIComponent("path:" + code + " ")}`],
    ];
    for (const x of knoepfe) {
      if (!x) continue;
      const a = k.createEl("a", { cls: "eba-mod-knopf", href: LINK + x[2], attr: { "data-sa-quelle": f.path } });
      a.addEventListener("mousedown", (e) => e.stopPropagation());
      symbol(a.createSpan({ cls: "eba-mod-sym" }), x[0]);
      a.createSpan({ text: x[1] });
    }

    // 5. Vorlesungen: direkt unter dem Modulfeld (über „## Unterlagen“); im laufenden Semester ist „Neue Vorlesungsnotiz“ der Hauptknopf
    if (M.vorlesungen) vorlesungenZeichnen(el, { code, pfad: f.path, liste: vl, laeuft });
  };

  let block = null;
  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      if (!ctx.modell || !ctx.modell.pruefungVon) { el.setText("Das Modulfeld erscheint, sobald Studium Autopilot die Daten gelesen hat."); return; }
      try { zeichnen(el, c); } catch (e) { el.setText("Modul: Fehler – " + e.message); console.error("Modul", e); }
    });
    const bald = ctx.entprellen(() => block.neu(), 400);
    const wichtig = (f, cache) => {
      const typ = cache && cache.frontmatter && cache.frontmatter.typ;
      return ["modul", "lehrveranstaltung", "termin", "vorlesung", "karteikarten"].indexOf(typ) >= 0
        || (f && (f.path === "System/Einstellungen.md" || String(f.path).indexOf("System/Daten/") === 0));
    };
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => { if (wichtig(f, cache)) bald(); });
    ctx.an(app.metadataCache, "deleted", (f, vorher) => { if (wichtig(f, vorher)) bald(); });
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "visible") bald(); });
    ctx.intervall(() => { if (document.visibilityState === "visible") block.neu(); }, 10 * 60 * 1000);
    // Daten aus Alma (JSON, kein metadataCache-Ereignis): alma-konto.js meldet Änderungen
    if (ctx.almaKonto && ctx.almaKonto.beobachten) ctx.aufraeumen(ctx.almaKonto.beobachten(bald));
  };

  return { registrieren, zeichnen, vorlesungenZeichnen, naechstes, band, noteOk, titelOhne, spanne };
};
