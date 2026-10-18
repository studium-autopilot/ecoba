// Modulseite (seit 17.10.2026): Codeblock ```eba-modul``` direkt unter dem Kopf jeder Modulnotiz (typ: modul). Ersetzt die
// Tabelle „Mein Stand“ und die beiden Knopfreihen. Daten live aus dem metadataCache und ctx.modell, geschrieben wird nur
// ins Frontmatter dieser Modulnotiz und nur auf Tipp.
//  1. Stand: Status als Knopf (Tipp: Menü mit Status, Note, Versuch, Semester, Plan, Anrechnung), Semester (semester_geplant
//     vor Musterplan, ctx.modell.modulSemester) mit Vorlesungswoche bzw. Fachsemester, Prüfung nach der Regel „Nächste
//     Prüfung“ (docs/architektur.md) mit Countdown erst ab 30 Tagen, bei Profil und Schwerpunkt „Zählt als“/„Anrechnung in“.
//  2. Semesterband: eine Zelle je Kalenderwoche der Vorlesungszeit des Modulsemesters (ctx.modell.vorlesungswochen): vorbei,
//     diese Woche, Pause; Punkt für Vorlesungsnotizen (voll = nachgearbeitet, Tipp öffnet die Notiz); Monate darunter;
//     Markierung in der Woche der Prüfung. Nur, wenn das Semester bekannt ist.
//  3. Als Nächstes: höchstens drei Einträge ab jetzt: die nächste Sitzung jeder Stundenplan-Serie (von/bis, ausfall,
//     aenderungen, Pausen, entfaellt) und Termin-Notizen mit diesem Kürzel, die nicht erledigt sind. Tipp öffnet die Notiz.
//  4. Knöpfe: Neue Vorlesung, Neues Übungsblatt, Karteikarten lernen (wenn es einen Stapel gibt), Unterlagen einordnen, Suchen.
// Reine Logik (sitzung, naechstes, pruefungVon, band, statusArt, noteOk, titelOhne, spanne) für tests/modul.test.js.
// Stil: eba-core.css Abschnitt 58.7 (eba-mod-*). iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const O = ctx.obsidian || {};
  const Fenster = O.Modal || class { constructor() { this.app = app; } };
  const SPRACHE = "eba-modul";
  const LINK = "obsidian://studium-autopilot?aktion=";
  const STATUS = ["offen", "läuft", "angemeldet", "bestanden", "nicht bestanden", "anerkannt"];
  const ES = "Elective Studies";
  const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
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
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const plusTage = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const tagText = (d, heute) => `${WT[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.` + (heute && d.getFullYear() !== heute.getFullYear() ? String(d.getFullYear()).slice(2) : "");
  const minuten = (s) => { const m = text(s).match(/^(\d{1,2})[:.](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const uhr = (s) => { const n = minuten(s); return n == null ? "" : `${pad(Math.floor(n / 60))}:${pad(n % 60)}`; };
  const zeitAus = (s) => (/^\d{1,2}[:.]\d{2}/.test(text(s)) ? text(s) : "");
  const tageBis = (d, heute) => Math.round((datum(d) - datum(heute)) / TAG);
  // Zeitraum eines Termins: läuft schon → „bis So 25.10.“, sonst „19.–25.10.“ bzw. „28.10.–03.11.“
  const spanne = (d, bis, heute) => (d <= datum(heute) ? "bis " + tagText(bis, heute)
    : d.getMonth() === bis.getMonth() ? `${pad(d.getDate())}.–${pad(bis.getDate())}.${pad(bis.getMonth() + 1)}.` : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.–${pad(bis.getDate())}.${pad(bis.getMonth() + 1)}.`);

  // ---------- Reine Logik ----------
  // Farbe des Status (wie die Status-Chips der Listen in tabellen.js)
  const statusArt = (s) => {
    s = text(s).toLowerCase();
    return s === "bestanden" || s === "anerkannt" ? "ok" : s === "nicht bestanden" ? "bad" : s === "angemeldet" ? "warn" : s === "läuft" ? "info" : "leer";
  };
  // Note wie 1,7: 1,0 bis 4,0 in Zehnteln oder 5,0
  const noteOk = (s) => { const m = text(s).replace(".", ",").match(/^([1-5]),(\d)$/); return !!m && (+m[1] < 5 || m[2] === "0"); };
  // Titel ohne das Kürzel des Moduls („Tutorien starten: B110 BWL“ → „Tutorien starten: BWL“)
  const titelOhne = (s, code) => text(text(s).split(code + " ").join("").split(" " + code).join(""));

  // Nächste Sitzung einer Stundenplan-Serie ab jetzt → { d, beginn, ende, raum, art, geaendert } | null.
  // fm: Notiz typ lehrveranstaltung (wochentag 1 = Montag, von, bis, ausfall[], aenderungen["Datum|Beginn|Ende|Raum"],
  // einzeltermin, entfaellt); pausen: [{ von: Date, bis: Date }]. Heute zählt, solange die Sitzung nicht vorbei ist.
  const sitzung = (fm, jetzt, pausen, tage = 35) => {
    if (!fm || fm.entfaellt === true) return null;
    const heute = datum(jetzt), nun = jetzt.getHours() * 60 + jetzt.getMinutes();
    const von = datum(fm.von), bis = datum(fm.bis), wt = Number(fm.wochentag);
    const aus = liste(fm.ausfall).map(datum).filter(Boolean).map(iso);
    const aend = liste(fm.aenderungen).map((x) => String(x).split("|")).filter((x) => x.length >= 3 && datum(x[0]));
    for (let i = 0; i <= tage; i++) {
      const d = plusTage(heute, i);
      if (fm.einzeltermin === true) { if (!von || iso(d) !== iso(von)) continue; }
      else if (!wt || ((d.getDay() + 6) % 7) + 1 !== wt) continue;
      if (von && d < von) continue;
      if (bis && d > bis) return null;
      if (aus.indexOf(iso(d)) >= 0 || (pausen || []).some((p) => p.von <= d && d <= p.bis)) continue;
      const a = aend.find((x) => iso(datum(x[0])) === iso(d));
      const beginn = uhr(a ? a[1] : fm.beginn), ende = uhr(a ? a[2] : fm.ende);
      const schluss = minuten(ende || beginn);
      if (i === 0 && schluss != null && schluss <= nun) continue;
      return { d, beginn, ende, raum: text(a && a[3] ? a[3] : fm.raum), art: text(fm.art) || "Veranstaltung", geaendert: !!a };
    }
    return null;
  };

  // Regel „Nächste Prüfung“: Termin-Notizen kategorie Prüfung mit diesem Kürzel, eintägig (ohne bis), ohne Nachhol… und
  // Zwischentests; die nächste ab heute, sonst die letzte; ohne Notiz das Feld klausur der Modulnotiz.
  const zwischentest = (t) => /zwischentest/i.test(text(t.fm.titel)) || /zwischentest/i.test(text(t.f && t.f.basename));
  const pruefungVon = ({ code, fm, termine, heute }) => {
    const h = datum(heute);
    const k = (termine || [])
      .filter((t) => t && t.fm && text(t.fm.code) === code && text(t.fm.kategorie).toLowerCase() === "prüfung" && !t.fm.bis
        && !zwischentest(t) && !/nachhol/i.test(text(t.fm.titel)))
      .map((t) => ({ d: datum(t.fm.datum), zeit: zeitAus(t.fm.ort), f: t.f || null, geschaetzt: text(t.fm.status) === "geschätzt" }))
      .filter((x) => x.d)
      .sort((a, b) => a.d - b.d);
    const kommend = k.filter((x) => x.d >= h);
    if (kommend.length) return kommend[0];
    if (k.length) return k[k.length - 1];
    const d = datum(fm && fm.klausur);
    return d ? { d, zeit: "", f: null, geschaetzt: false } : null;
  };

  // Als Nächstes → [{ d, bis, zeit, was, wo, f, art: "sitzung" | "pruefung" | "termin", geschaetzt, geaendert }], höchstens max
  const naechstes = ({ code, stundenplan, termine, pausen, jetzt, max = 3 }) => {
    const heute = datum(jetzt), aus = [];
    for (const s of stundenplan || []) {
      if (!s || !s.fm || text(s.fm.code) !== code) continue;
      const x = sitzung(s.fm, jetzt, pausen);
      if (x) aus.push({ d: x.d, bis: null, zeit: x.beginn + (x.ende ? "–" + x.ende : ""), sort: minuten(x.beginn) || 0, was: x.art,
        wo: x.raum, f: s.f || null, art: "sitzung", geschaetzt: false, geaendert: x.geaendert });
    }
    for (const t of termine || []) {
      if (!t || !t.fm || text(t.fm.code) !== code || t.fm.erledigt === true) continue;
      const d = datum(t.fm.datum), bis = datum(t.fm.bis);
      if (!d || (bis || d) < heute) continue;
      const z = zeitAus(t.fm.ort);
      const pruefung = text(t.fm.kategorie).toLowerCase() === "prüfung" && !zwischentest(t);
      aus.push({ d: d < heute ? heute : d, bis: bis && bis > d ? bis : null, zeit: z, sort: minuten(z) == null ? -1 : minuten(z),
        was: titelOhne(t.fm.titel || (t.f && t.f.basename) || "", code), wo: z ? "" : text(t.fm.ort).replace(/^bis \d{1,2}\.\d{1,2}\.(\d{2,4})?\s*(·\s*)?/, ""), f: t.f || null,
        art: pruefung ? "pruefung" : "termin", geschaetzt: text(t.fm.status) === "geschätzt", geaendert: false });
    }
    aus.sort((a, b) => a.d - b.d || a.sort - b.sort);
    return aus.slice(0, max);
  };

  // Semesterband aus den Vorlesungswochen (ctx.modell.vorlesungswochen(...).wochen: [{ mo, nr, pause }], nr 0 = Pause)
  // → { zellen: [{ mo, nr, pause, vorbei, jetzt, notizen, stand: 0 keine | 1 offen | 2 nachgearbeitet, pruefung }], monate: [{ i, name }] }
  const band = ({ wochen, notizen, heute, pruefung }) => {
    const h = datum(heute), p = datum(pruefung);
    const zellen = (wochen || []).map((w) => {
      const mo = datum(w.mo), so = plusTage(mo, 6);
      const drin = (notizen || []).filter((n) => n.d >= mo && n.d <= so);
      return { mo, nr: Number(w.nr) || 0, pause: !Number(w.nr), vorbei: so < h, jetzt: mo <= h && h <= so, notizen: drin,
        stand: drin.length ? (drin.every((n) => n.fertig) ? 2 : 1) : 0, pruefung: !!p && mo <= p && p <= so };
    });
    // Prüfung nach der Vorlesungszeit (z. B. Klausur im Februar, Vorlesungen bis Januar): eigene Zelle am Ende
    if (p && zellen.length && !zellen.some((z) => z.pruefung) && p > zellen[zellen.length - 1].mo) {
      const mo = plusTage(p, -((p.getDay() + 6) % 7));
      zellen.push({ mo, nr: 0, pause: false, nach: true, vorbei: plusTage(mo, 6) < h, jetzt: mo <= h && h <= plusTage(mo, 6), notizen: [], stand: 0, pruefung: true });
    }
    const monate = [];
    zellen.forEach((z, i) => { if (!i || z.mo.getMonth() !== zellen[i - 1].mo.getMonth()) monate.push({ i, name: MONATE[z.mo.getMonth()] }); });
    return { zellen, monate };
  };

  // ---------- Obsidian ----------
  const fmVon = (f) => (f && app.metadataCache.getFileCache(f)?.frontmatter) || {};
  const oeffnen = (f, e) => { if (f) app.workspace.getLeaf(!!(e && (e.metaKey || e.ctrlKey))).openFile(f); };
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
      const feld = c.createEl("input", { type: "text", value: this.alt || "", attr: { inputmode: "decimal", placeholder: "z. B. 1,7", "aria-label": "Note" } });
      const fehler = c.createDiv({ cls: "eba-mod-fehler" });
      const zeile = c.createDiv({ cls: "eba-mod-fenster-knoepfe" });
      const leeren = zeile.createEl("button", { text: "Keine Note" });
      const ok = zeile.createEl("button", { text: "Speichern", cls: "mod-cta" });
      const speichern = (wert) => {
        const v = text(wert).replace(".", ",");
        if (v && !noteOk(v)) { fehler.setText("Bitte wie 1,7 eingeben, von 1,0 bis 5,0."); return; }
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

  const zeichnen = (el, c) => {
    el.empty();
    const f = app.vault.getAbstractFileByPath(c.sourcePath);
    const fm = fmVon(f);
    const box = el.createDiv({ cls: "eba-mod" });
    if (!f || fm.typ !== "modul") { box.createDiv({ cls: "eba-mod-leer", text: "Nur auf Modulseiten." }); return; }
    const code = text(fm.code) || f.basename.split(" ")[0];
    const M = ctx.modell || null, D = M ? M.daten() : null;
    const jetzt = ctx.date.jetzt(), heute = datum(jetzt);
    const pausen = ((D && D.pausen) || []).map((p) => ({ von: datum(p.von), bis: datum(p.bis), name: text(p.name) })).filter((p) => p.von && p.bis);
    const semName = M && M.modulSemester ? M.modulSemester(fm) : text(fm.semester_geplant);
    const sem = D ? (D.semesterliste || []).find((s) => s.name === semName) || null : null;
    const termine = (D && D.termine) || [], stundenplan = (D && D.stundenplan) || [];
    const pr = pruefungVon({ code, fm, termine, heute });
    const st = text(fm.status).toLowerCase() || "offen";

    // 1. Stand
    const stand = box.createDiv({ cls: "eba-mod-stand" });
    const fs = feld(stand, "Status", "eba-mod-st");
    const sk = knopf(fs.createEl("button", { cls: "eba-mod-status " + statusArt(st), attr: { type: "button", "aria-haspopup": "menu" } }), () => statusMenue(sk, f, fm, D));
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
      if (sem && D && D.aktuell && D.aktuell.name === semName && M.woche) { const w = M.woche(); if (w && w.text) unter = w.text; }
      if (text(fm.semester_geplant)) unter = unter ? unter + " · eigene Planung" : "eigene Planung";
      if (unter) fsem.createDiv({ cls: "eba-mod-z", text: unter });
    } else fsem.createDiv({ cls: "eba-mod-v eba-mod-blass", text: "Nicht geplant" });
    if (mitPlan(fm)) {
      const drin = fm.gewaehlt === true;
      const a = fsem.createEl("a", { cls: "eba-mod-plan" + (drin ? " drin" : ""), text: drin ? "✓ Im Plan" : "+ Planen",
        href: `${LINK}plan&modul=${encodeURIComponent(code)}`, attr: { "data-sa-quelle": f.path } });
      a.addEventListener("mousedown", (e) => e.stopPropagation());
    }

    // Ohne Prüfung (unbenotet, „keine“) und ohne Termin: kein Feld
    const ohnePruefung = !pr && (fm.benotet === false || /^(keine|unbenotet)/i.test(text(fm.pruefung)));
    const fpr = ohnePruefung ? null : feld(stand, "Prüfung");
    if (!fpr) { /* kein Feld */ } else if (pr) {
      const v = fpr.createDiv({ cls: "eba-mod-v" + (pr.f ? " eba-mod-link" : "") });
      v.setText((pr.geschaetzt ? "ca. " : "") + tagText(pr.d, heute));
      if (pr.f) knopf(v, (e) => oeffnen(pr.f, e));
      const n = tageBis(pr.d, heute), teile = [];
      if (pr.zeit) teile.push(pr.zeit);
      if (n >= 0 && n <= 30) teile.push(n === 0 ? "heute" : n === 1 ? "morgen" : `in ${n} Tagen`);
      if (teile.length) fpr.createDiv({ cls: "eba-mod-z" + (n >= 0 && n <= 7 ? " eba-mod-bald" : ""), text: teile.join(" · ") });
    } else fpr.createDiv({ cls: "eba-mod-v eba-mod-blass", text: "Termin folgt" });

    const an = anrechnungName(fm);
    if (an) {
      const fa = feld(stand, an);
      const ak = knopf(fa.createEl("button", { cls: "eba-mod-wahl", attr: { type: "button", "aria-haspopup": "menu" } }), () => anrechnungMenue(ak, f, fm));
      ak.createSpan({ text: text(fm.anrechnung) || "Wählen" });
      symbol(ak.createSpan({ cls: "eba-mod-pfeil" }), "chevron-down");
    }

    // 2. Semesterband: im laufenden Semester des Moduls, sonst nur, wenn es darin Vorlesungsnotizen gibt
    const laeuft = !!(sem && D && D.aktuell && D.aktuell.name === sem.name);
    if (sem && sem.vb && sem.ve && M && M.vorlesungswochen) {
      const W = M.vorlesungswochen({ vb: sem.vb, ve: sem.ve, name: sem.name });
      const notizen = app.vault.getMarkdownFiles().map((x) => ({ x, m: fmVon(x) }))
        .filter(({ m }) => m.typ === "vorlesung" && text(m.code) === code && datum(m.datum))
        .map(({ x, m }) => ({ f: x, d: datum(m.datum), fertig: m.nachgearbeitet === true }));
      const B = band({ wochen: W && W.wochen, notizen, heute, pruefung: pr && pr.d });
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
            + (z.notizen.length ? ` · ${z.notizen.length === 1 ? "1 Notiz" : z.notizen.length + " Notizen"}` : "");
          const zelle = reihe.createSpan({ cls: k.join(" "), attr: { title: titel } });
          if (z.notizen.length) { zelle.addClass("eba-mod-tipp"); knopf(zelle, (e) => oeffnen(z.notizen[0].f, e)); }
        }
        const mon = b.createDiv({ cls: "eba-mod-monate", attr: { "aria-hidden": "true" } });
        for (const m of B.monate) mon.createSpan({ text: m.name, attr: { style: `grid-column-start: ${m.i + 1}` } });
      }
    }

    // 3. Als Nächstes
    const N = naechstes({ code, stundenplan, termine, pausen, jetzt, max: 3 });
    if (N.length) {
      const n = box.createDiv({ cls: "eba-mod-naechstes" });
      n.createDiv({ cls: "eba-mod-k", text: "Als Nächstes" });
      for (const x of N) {
        const z = n.createDiv({ cls: "eba-mod-zeile " + x.art + (x.f ? " eba-mod-tipp" : "") });
        z.createSpan({ cls: "eba-mod-tag", text: x.bis ? spanne(x.d, x.bis, heute) : tagText(x.d, heute) });
        z.createSpan({ cls: "eba-mod-zeit", text: x.zeit });
        const w = z.createSpan({ cls: "eba-mod-was", text: x.was });
        if (x.geschaetzt) w.createSpan({ cls: "eba-pill leer", text: "geschätzt" });
        if (x.geaendert) w.createSpan({ cls: "eba-pill warn", text: "geändert" });
        z.createSpan({ cls: "eba-mod-wo", text: x.wo });
        if (x.f) knopf(z, (e) => oeffnen(x.f, e));
      }
    }

    // 4. Knöpfe
    const k = box.createDiv({ cls: "eba-mod-knoepfe" });
    const stapel = app.vault.getMarkdownFiles().some((x) => { const m = fmVon(x); return m.typ === "karteikarten" && text(m.code) === code; });
    const q = encodeURIComponent(code);
    const knoepfe = [
      ["file-plus", "Neue Vorlesung", `vorlesung&code=${q}`],
      ["file-pen", "Neues Übungsblatt", `uebungsblatt&code=${q}`],
      stapel ? ["layers", "Karteikarten lernen", `karten-lernen&code=${q}`] : null,
      ["folder-input", "Unterlagen einordnen", `einordnen&code=${q}`],
      ["search", `In ${code} suchen`, `suchen&q=${encodeURIComponent("path:" + code + " ")}`],
    ];
    for (const x of knoepfe) {
      if (!x) continue;
      // Hervorgehoben nur im laufenden Semester des Moduls (dann entstehen Vorlesungsnotizen)
      const a = k.createEl("a", { cls: "eba-mod-knopf" + (laeuft && x === knoepfe[0] ? " haupt" : ""), href: LINK + x[2], attr: { "data-sa-quelle": f.path } });
      a.addEventListener("mousedown", (e) => e.stopPropagation());
      symbol(a.createSpan({ cls: "eba-mod-sym" }), x[0]);
      a.createSpan({ text: x[1] });
    }
  };

  let block = null;
  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
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
  };

  return { registrieren, zeichnen, sitzung, naechstes, pruefungVon, band, statusArt, noteOk, titelOhne, spanne };
};
