// Gemeinsames Datenmodell „ctx.modell“ (Phase 2b). Einmal berechnet aus
//   System/Daten/Semester.md   zentrale Semesterdaten (Paket B: Semester, Pausen, freie Tage, Prüfungsphasen, Rückmeldung)
//   System/Einstellungen.md    persönliche Angaben (name, studienbeginn, variante, zielnote)
//   Module/, Termine/, Stundenplan/
// und bei Änderungen im metadataCache nachgezogen: Jede Änderung markiert das Modell als veraltet, der nächste Zugriff
// rechnet neu (nie veraltete Daten). Wer neu zeichnen will, meldet sich mit beiAenderung(fn) an (entprellt, 600 ms).
//
// Persönliche Semesterliste: ABGELEITET aus studienbeginn + zentralen Daten (1.–6. Fachsemester, bei längerem Studium bis
// zum aktuellen Semester). Leerer studienbeginn = das aktuelle Semester (aus dem Datum) ist das 1. Fachsemester.
// Bases-Formeln können kein Plugin-JS aufrufen, darum schreibt abgleichen() die abgeleiteten Felder semesterliste, pausen,
// pruefungsphasen (altes Format „a|b|c“) nach System/Einstellungen.md – aber nur, wenn sich der berechnete Inhalt vom
// vorhandenen unterscheidet. Ausgelöst wird das, wenn sich Einstellungen.md oder Semester.md ändern, und einmal beim
// App-Start (nach dem Einlesen); im Normalfall ist dann alles gleich und es wird nichts geschrieben.
// Ein Schreiber (seit 17.10.2026): Von selbst (Start, Änderung) schreibt nur das Gerät, das die zentralen Daten abruft
// (ctx.zentral.abruferHier(): Abrufer, noch keiner oder der Abrufer seit 80 Min. still). So schreiben nicht mehrere Geräte
// zugleich dieselbe Datei, in der auch deine Angaben stehen (iCloud: zuletzt gespeichert gewinnt; LiveSync: Konflikt).
// Änderst du den Studienbeginn (Personalisieren, Einrichtung), schreibt das Gerät, auf dem du tippst, sofort. Der Abrufer
// wartet nach einer Änderung an Einstellungen.md darum 20 s, bis dessen Ableitung per Sync da ist, und schreibt dann
// meist nichts. Alle Geräte rechnen in daten() weiter selbst; nur Bases-Tabellen lesen die geschriebenen Felder.
//
// Musterplan (seit 2c variantengenau): Das empfohlene Fachsemester eines Moduls kommt aus System/Daten/Musterplan.md, Plan der
// gewählten Variante (kleinstes fs des Eintrags mit diesem Code). Steht das Modul nicht im Plan, gilt es nur, wenn du es
// gewählt hast (gewaehlt: true), dann mit seinem Feld „fachsemester“; sonst hat es kein Musterplan-Semester. Variante „offen“
// (oder kein Musterplan): wie bisher das Feld „fachsemester“. Schwerpunktkatalog nie. Semester = liste[fs-1].
// semester_geplant gilt nur, wenn du selbst planst (es hat dann Vorrang). Dieselbe Regel steht als Bases-Formel in den
// Modulseiten und in „Noten & ECTS“ (liest Musterplan.md direkt, darum schreibt das Plugin dafür nichts).
//
// Wochen (seit 2c einheitlich): woche(datum) → „Vorlesungswoche X von Y“ in der Vorlesungszeit, sonst Pause, Prüfungsphase,
// „noch N Tage bis Vorlesungsbeginn“ oder „vorlesungsfrei“. Vorlesungswochen zählen ab dem Montag des Vorlesungsbeginns;
// eine Woche, deren Montag bis Freitag ganz in einer Pause liegt (z. B. zwischen Weihnachten und Neujahr), zählt nicht.
// Am Samstag und Sonntag zählt schon die kommende Woche (planwoche, eine Wochenend-Regel für alle Bildschirme).
//
// Fachmodell (seit 18.10.2026, docs/architektur.md „Fachmodell“): Jeder Bildschirm fragt das Modell, statt selbst zu rechnen –
// Termine (termine), Prüfungen (pruefungen, pruefungVon, naechstePruefung), Fristen (fristen, abgaben), Woche (kalenderwoche,
// planwoche; am Samstag und Sonntag gilt überall schon die kommende Woche), Stundenplan (findetStatt, naechsteSitzung: Pausen,
// freie Tage, Ausfall, Änderungen), ECTS und Noten (ects, noten), imPlan, statusArt, istZwischentest. Datum, Uhrzeit, Mehrzahl
// und HTML-Schutz in einer Schreibweise: ctx.modell.zeit (ctx.zeit selbst ist der Timer-Helfer des Kerns).
//
// Außerdem: Codeblock ```eba-semesterdaten [zentral|persoenlich]``` (Tabelle der Semestertermine).
// Erweiterung: Das Plugin ruft registrieren() (Codeblock, Ereignisse über die Helfer in ctx) und beim App-Start start() (Abgleich) auf.
// Zugriff aus anderen Skripten: ctx.modell.daten() (Rückfall auf System/Einstellungen.md, falls dieses Skript fehlt).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const ZENTRAL = "System/Daten/Semester.md";
  const MUSTERPLAN = "System/Daten/Musterplan.md";
  const FS_REGEL = 6;      // Regelstudienzeit
  const FS_MAX = 14;       // längste Liste (Sicherung gegen Endlosschleifen)
  // Ordner, deren Änderungen das Modell meldet (beiAenderung): dazu Übungsblätter (Abgaben) und SQ-Kurse (ECTS)
  const RELEVANT = /^(System\/Einstellungen\.md|System\/Daten\/|Module\/|Termine\/|Stundenplan\/|Übungsblätter\/|Schlüsselqualifikationen\/)/;

  // ---------- Datum ----------
  const pad = (n) => String(n).padStart(2, "0");
  const s10 = (v) => { const m = String(v == null ? "" : v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ""; };
  const isoVon = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tagObj = (s) => { const t = s.split("-").map(Number); return new Date(t[0], t[1] - 1, t[2]); };
  const plusTage = (s, n) => { const d = tagObj(s); d.setDate(d.getDate() + n); return isoVon(d); };
  const heuteIso = () => ctx.date.now("YYYY-MM-DD");
  const fmVon = (pfad) => { const f = app.vault.getAbstractFileByPath(pfad); return (f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter) || {}; };
  const geschaetzt = (s) => /gesch/i.test(String(s || ""));
  const FERTIG = ["bestanden", "anerkannt"]; // Modulstatus, mit dem ein Modul (und seine Prüfung) erledigt ist
  const zahlVon = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : 0; };

  // ---------- Semesternamen ----------
  // Wintersemester 1.10.–31.3., Sommersemester 1.4.–30.9. (Baden-Württemberg)
  const semesterAusDatum = (iso) => {
    const j = Number(iso.slice(0, 4)), mo = Number(iso.slice(5, 7));
    if (mo >= 4 && mo <= 9) return `SS ${j}`;
    const b = mo >= 10 ? j : j - 1;
    return `WS ${b}/${String(b + 1).slice(-2)}`;
  };
  const zerlegeName = (name) => {
    let m = String(name).match(/^WS (\d{4})\/\d{2}$/);
    if (m) return { ws: true, j: Number(m[1]) };
    m = String(name).match(/^SS (\d{4})$/);
    return m ? { ws: false, j: Number(m[1]) } : null;
  };
  const naechster = (name) => { const z = zerlegeName(name); if (!z) return null; return z.ws ? `SS ${z.j + 1}` : `WS ${z.j}/${String(z.j + 1).slice(-2)}`; };
  const voriger = (name) => { const z = zerlegeName(name); if (!z) return null; return z.ws ? `SS ${z.j}` : `WS ${z.j - 1}/${String(z.j).slice(-2)}`; };
  // Erster Montag ab dem 10. Oktober bzw. 10. April; Vorlesungsende Samstag nach 17 (WS) bzw. 15 (SS) Wochen.
  // Passt auf alle veröffentlichten Semester 2026–2029; nur für Semester ohne zentrale Daten.
  const semesterNachRegel = (name) => {
    const z = zerlegeName(name);
    if (!z) return null;
    const beginn = z.ws ? `${z.j}-10-01` : `${z.j}-04-01`, ende = z.ws ? `${z.j + 1}-03-31` : `${z.j}-09-30`;
    let vb = z.ws ? `${z.j}-10-10` : `${z.j}-04-10`;
    while (tagObj(vb).getDay() !== 1) vb = plusTage(vb, 1);
    return { name, beginn, ende, vb, ve: plusTage(vb, z.ws ? 117 : 103), status: "geschätzt", hinweis: "Nach Regel berechnet (keine zentralen Daten)", regel: true };
  };

  // ---------- Zentrale Daten ----------
  const zentralLesen = () => {
    const fm = fmVon(ZENTRAL);
    const liste = (v) => (Array.isArray(v) ? v : []).filter((x) => x && typeof x === "object");
    const semester = liste(fm.semester).map((o) => ({
      name: String(o.name || "").trim(), beginn: s10(o.beginn), ende: s10(o.ende), vb: s10(o.vorlesung_beginn), ve: s10(o.vorlesung_ende),
      status: geschaetzt(o.status) ? "geschätzt" : "offiziell", hinweis: String(o.hinweis || ""),
    })).filter((s) => zerlegeName(s.name) && s.beginn && s.ende && s.ende > s.beginn).sort((a, b) => a.beginn.localeCompare(b.beginn));
    const pausen = liste(fm.pausen).map((o) => ({ name: String(o.name || "Pause"), von: s10(o.von), bis: s10(o.bis), status: geschaetzt(o.status) ? "geschätzt" : "offiziell", hinweis: String(o.hinweis || "") }))
      .filter((p) => p.von && p.bis && p.bis >= p.von).sort((a, b) => a.von.localeCompare(b.von));
    const freieTage = liste(fm.freie_tage).map((o) => ({ name: String(o.name || "vorlesungsfrei"), datum: s10(o.datum), status: geschaetzt(o.status) ? "geschätzt" : "offiziell", hinweis: String(o.hinweis || "") }))
      .filter((t) => t.datum).sort((a, b) => a.datum.localeCompare(b.datum));
    const phasen = liste(fm.pruefungsphasen).map((o) => ({ art: String(o.art || "Prüfungsphase"), semester: String(o.semester || ""), von: s10(o.von), bis: s10(o.bis), status: geschaetzt(o.status) ? "geschätzt" : "offiziell", hinweis: String(o.hinweis || "") }))
      .filter((p) => p.von && p.bis).sort((a, b) => a.von.localeCompare(b.von));
    const rueckmeldung = liste(fm.rueckmeldung).map((o) => ({ fuer: String(o.fuer || ""), von: s10(o.von), bis: s10(o.bis), status: geschaetzt(o.status) ? "geschätzt" : "offiziell", hinweis: String(o.hinweis || "") }))
      .filter((r) => r.von && r.bis);
    return { vorhanden: semester.length > 0, stand: s10(fm.stand), quellen: fm.quellen || {}, semester, pausen, freieTage, phasen, rueckmeldung };
  };

  // ---------- Ableitung ----------
  // studienbeginn (ISO oder leer) → persönliche Liste [{ fs, name, beginn, ende, vb, ve, status, hinweis }]
  const ableiten = (Z, studienbeginn, heute) => {
    const holen = (name) => Z.semester.find((s) => s.name === name) || semesterNachRegel(name);
    const start = semesterAusDatum(s10(studienbeginn) || heute);
    const liste = [];
    let name = start;
    for (let fs = 1; fs <= FS_MAX && name; fs++) {
      const s = holen(name);
      if (!s) break;
      liste.push(Object.assign({}, s, { fs }));
      if (fs >= FS_REGEL && s.ende >= heute) break;
      name = naechster(name);
    }
    return liste;
  };

  const zeilen = (Z, liste) => {
    const von = liste.length ? liste[0].beginn : "", bis = liste.length ? liste[liste.length - 1].ende : "";
    const namen = new Set(liste.map((s) => s.name));
    return {
      semesterliste: liste.map((s) => [s.fs, s.name, s.beginn, s.ende, s.vb, s.ve].join("|")),
      pausen: Z.pausen.filter((p) => p.bis >= von && p.von <= bis).map((p) => [p.von, p.bis, p.name].join("|")),
      pruefungsphasen: Z.phasen.filter((p) => namen.has(p.semester) || (!p.semester && p.bis >= von && p.von <= bis))
        .map((p) => [p.von, p.bis, p.art, p.status].join("|")),
    };
  };

  // ---------- Modell ----------
  let cache = null, cacheTag = "";
  const ungueltig = () => { cache = null; };

  const berechnen = () => {
    const heute = heuteIso();
    const ein = fmVon(EINSTELLUNGEN);
    const Z = zentralLesen();
    const studienbeginn = s10(ein.studienbeginn);
    const liste = ableiten(Z, studienbeginn, heute);
    const aktuellIndex = liste.findIndex((s) => s.beginn <= heute && heute <= s.ende);
    const vorStart = liste.length > 0 && heute < liste[0].beginn;
    const aktuell = liste[aktuellIndex >= 0 ? aktuellIndex : vorStart ? 0 : liste.length - 1] || null;
    const variante = String(ein.variante == null ? "" : ein.variante).trim() || "offen";
    // Musterplan der Variante: Code → kleinstes Fachsemester (SQ100 steht in zwei Semestern)
    const mp = fmVon(MUSTERPLAN);
    const plan = (Array.isArray(mp.plaene) ? mp.plaene : []).find((p) => p && String(p.name || "").trim() === variante);
    const planFs = {};
    if (plan) for (const e of Array.isArray(mp.eintraege) ? mp.eintraege : []) {
      if (!e || e.plan !== plan.id || !e.code) continue;
      const fs = Number(e.fs), code = String(e.code).trim();
      if (fs >= 1 && (!planFs[code] || fs < planFs[code])) planFs[code] = fs;
    }
    // Empfohlenes Fachsemester (Zahl) oder null
    const musterFs = (fm) => {
      if (!fm || fm.gruppe === "Schwerpunkt") return null;
      const eigen = Number(fm.fachsemester), ganz = eigen >= 1 && eigen === Math.floor(eigen) ? eigen : null;
      if (!plan) return ganz;
      const code = String(fm.code == null ? "" : fm.code).trim();
      if (planFs[code]) return planFs[code];
      return fm.gewaehlt === true ? ganz : null;
    };
    const musterSemester = (fm) => {
      const fs = musterFs(fm);
      return fs && liste[fs - 1] ? liste[fs - 1].name : "";
    };
    const module = [], termine = [], stundenplan = [], sqKurse = [], uebungsblaetter = [];
    for (const f of app.vault.getMarkdownFiles()) {
      const c = app.metadataCache.getFileCache(f), fm = c && c.frontmatter;
      if (!fm) continue;
      if (fm.typ === "modul" && f.path.startsWith("Module/")) {
        const eigen = String(fm.semester_geplant == null ? "" : fm.semester_geplant).trim(), muster = musterSemester(fm);
        const status = String(fm.status || "offen").toLowerCase().trim();
        module.push({
          f, fm, code: String(fm.code || f.basename.split(" ")[0]), titel: String(fm.titel || f.basename), gruppe: String(fm.gruppe || ""),
          fs: Number(fm.fachsemester) || null, fsEmpfohlen: musterFs(fm), status, fertig: FERTIG.indexOf(status) >= 0,
          ergebnis: String(fm.ergebnis == null ? "" : fm.ergebnis).trim(), ects: zahlVon(fm.ects), zusatz: fm.zusatz === true, op: fm.op_modul === true,
          semester: eigen || muster, semesterQuelle: eigen ? "eigen" : muster ? "musterplan" : "", musterplan: muster,
        });
      } else if (fm.typ === "termin") termine.push({ f, fm });
      else if (fm.typ === "lehrveranstaltung" && f.path.startsWith("Stundenplan/")) stundenplan.push({ f, fm });
      else if (fm.typ === "sq_kurs") sqKurse.push({ f, fm });
      else if (fm.typ === "übungsblatt") uebungsblaetter.push({ f, fm });
    }
    return {
      heute, zentral: Z, einstellungen: ein,
      name: String(ein.name == null ? "" : ein.name).trim(), variante, zielnote: String(ein.zielnote == null ? "" : ein.zielnote).trim(),
      studienbeginn, studienbeginnStandard: !studienbeginn, startSemester: liste.length ? liste[0].name : semesterAusDatum(heute),
      semesterliste: liste, aktuell, fachsemester: aktuell ? aktuell.fs : 1, vorStart,
      pausen: Z.pausen, freieTage: Z.freieTage, pruefungsphasen: Z.phasen, rueckmeldung: Z.rueckmeldung,
      module, termine, stundenplan, sqKurse, uebungsblaetter, musterSemester, musterFs, musterplanVariante: plan ? plan.id : "",
      zwischen: {}, // Zwischenergebnisse je Berechnung (Prüfungen, normierte Termine), fallen mit dem Modell weg
      abgeleitet: zeilen(Z, liste),
      personalisiert: !!(String(ein.name == null ? "" : ein.name).trim() && studienbeginn),
    };
  };

  const daten = () => {
    const h = heuteIso();
    if (!cache || cacheTag !== h) { cache = berechnen(); cacheTag = h; }
    return cache;
  };

  // Semester (zentral oder nach Regel) zu einem Datum, z. B. für den Alma-Import
  const semesterVon = (datum) => {
    const d = s10(datum);
    if (!d) return null;
    const Z = daten().zentral;
    return Z.semester.find((s) => s.beginn <= d && d <= s.ende) || semesterNachRegel(semesterAusDatum(d));
  };
  const semesterNachName = (name) => daten().zentral.semester.find((s) => s.name === name) || semesterNachRegel(name);
  const modulSemester = (fm) => {
    const eigen = String((fm && fm.semester_geplant) == null ? "" : fm.semester_geplant).trim();
    return eigen || daten().musterSemester(fm);
  };
  // Auswahl für den Studienbeginn: 8 Semester vor dem aktuellen bis 2 danach
  const semesterAuswahl = () => {
    const jetzt = semesterAusDatum(heuteIso());
    const namen = [jetzt];
    for (let i = 0; i < 8; i++) namen.unshift(voriger(namen[0]));
    for (let i = 0; i < 2; i++) namen.push(naechster(namen[namen.length - 1]));
    return namen.map((n) => semesterNachName(n)).filter(Boolean);
  };
  // Vorschau für das Formular: Liste für einen anderen Studienbeginn
  const vorschau = (studienbeginn) => ableiten(daten().zentral, studienbeginn, heuteIso());

  // ---------- Wochen (eine Regel für Dashboard, Studienverlauf, Vorlesungsnotiz) ----------
  const montagVon = (iso) => { const d = tagObj(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoVon(d); };
  const tageZwischen = (a, b) => Math.round((tagObj(b) - tagObj(a)) / 864e5);
  // Wochen der Vorlesungszeit: [{ mo, so, nr, pause }] ab dem Montag des Vorlesungsbeginns; nr = 0 für eine Pausenwoche
  // (Montag bis Freitag ganz in einer Pause). gesamt = Anzahl der Vorlesungswochen.
  const vorlesungswochen = (s) => {
    const P = daten().pausen, wochen = [];
    let nr = 0;
    if (!s || !s.vb || !s.ve) return { wochen, gesamt: 0 };
    for (let mo = montagVon(s.vb); mo <= s.ve; mo = plusTage(mo, 7)) {
      const fr = plusTage(mo, 4);
      const pause = P.find((p) => p.von <= mo && p.bis >= fr) || null;
      if (!pause) nr++;
      wochen.push({ mo, so: plusTage(mo, 6), nr: pause ? 0 : nr, pause });
    }
    return { wochen, gesamt: nr };
  };
  // Semester zu einem Datum: aus deiner Semesterliste; vor Studienbeginn das erste; sonst zentral bzw. nach Regel
  const semesterFuer = (iso) => {
    const L = daten().semesterliste;
    return L.find((s) => s.beginn <= iso && iso <= s.ende) || (L.length && iso < L[0].beginn ? L[0] : null) || semesterVon(iso);
  };
  // Lage an einem Tag (Standard heute): art "vorlesung" | "pause" | "pruefung" | "vor" | "frei", text für die Anzeige
  const woche = (datum) => {
    const d = s10(datum) || heuteIso();
    const D = daten(), s = semesterFuer(d);
    const aus = { datum: d, semester: s, art: "", nr: 0, gesamt: 0, pause: null, phase: null, tage: 0, text: "" };
    if (!s) return aus;
    const W = vorlesungswochen(s);
    aus.gesamt = W.gesamt;
    aus.pause = D.pausen.find((p) => p.von <= d && d <= p.bis) || null;
    aus.phase = D.pruefungsphasen.find((p) => p.von <= d && d <= p.bis) || null;
    const inVl = !!(s.vb && s.ve && s.vb <= d && d <= s.ve);
    if (aus.pause) { aus.art = "pause"; aus.text = `${aus.pause.name} bis ${dm(aus.pause.bis)}`; }
    else if (aus.phase && !inVl) { aus.art = "pruefung"; aus.text = `Prüfungsphase bis ${dm(aus.phase.bis)}`; }
    else if (s.vb && d < s.vb) {
      aus.art = "vor"; aus.tage = tageZwischen(d, s.vb);
      aus.text = aus.tage === 0 ? "Vorlesungsbeginn heute" : aus.tage === 1 ? "Vorlesungsbeginn morgen" : `noch ${aus.tage} Tage bis Vorlesungsbeginn`;
    } else if (inVl) {
      aus.art = "vorlesung";
      // Woche nach der einen Wochenend-Regel: am Samstag und Sonntag zählt schon die kommende Woche (planwoche)
      const pm = planwoche(d).mo;
      const w = W.wochen.filter((x) => x.mo <= pm && x.nr).pop();
      aus.nr = w ? w.nr : 1;
      aus.text = `Vorlesungswoche ${aus.nr} von ${aus.gesamt}` + (aus.phase ? " · Prüfungsphase" : "");
    } else { aus.art = "frei"; aus.text = "vorlesungsfrei"; }
    return aus;
  };

  // ---------- Zeit und Text (ctx.modell.zeit) ----------
  // Eine Schreibweise für alle Bildschirme (docs/design.md „Daten, Zahlen und Links“): „Mo 19.10.“, das Jahr nur außerhalb des
  // laufenden Studienjahrs (1.10. bis 30.9.): „06.02.2028“; Spannen „19.–25.10.“ bzw. „12.10. – 06.02.“; Abstand „heute“,
  // „morgen“, „in 5 Tagen“. „Heute“ kommt immer aus ctx.date (Tests setzen plugin.testDatum), nie aus new Date().
  const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const WT_LANG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  // Uhrzeit in einem Text („17:00–18:00 · online“, „Mo 12:15–14:00 · HS N06“): nur Doppelpunkt-Zeiten, damit „06.11.“ nie als
  // Uhrzeit gilt; ohne Lookbehind (iOS < 16.4). Gruppe 1 = Uhrzeit bzw. Spanne.
  const ZEIT_RE = /(?:^|\D)((?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[–-]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?)(?!\d)/;
  // Ein Datum ohne Jahr liegt höchstens so viele Tage zurück (sonst gilt das nächste Jahr) bzw. voraus (sonst das vorige)
  const ZURUECK = 60, VORAUS = 305;
  const isoAus = (v) => (v instanceof Date ? (isNaN(v.getTime()) ? "" : isoVon(v)) : s10(v));
  const studienjahr = (bezug) => {
    const d = s10(bezug) || heuteIso(), j = Number(d.slice(0, 4)), b = Number(d.slice(5, 7)) >= 10 ? j : j - 1;
    return { von: `${b}-10-01`, bis: `${b + 1}-09-30` };
  };
  const mitJahr = (d, o) => { if (o.jahr === true) return true; if (o.jahr === false) return false; const sj = studienjahr(o.bezug); return d < sj.von || d > sj.bis; };
  const tm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
  // „Mo 19.10.“ (wochentag: false → „19.10.“), Jahr nur außerhalb des Studienjahrs (jahr: true/false erzwingt), lang: „Montag, 19.10.“
  const datumText = (v, o) => {
    o = o || {};
    const d = isoAus(v);
    if (!d) return "";
    const s = tm(d) + (mitJahr(d, o) ? d.slice(0, 4) : "");
    if (o.wochentag === false) return s;
    const wt = tagObj(d).getDay();
    return o.lang ? `${WT_LANG[wt]}, ${s}` : `${WT[wt]} ${s}`;
  };
  const kurzText = (v, o) => datumText(v, Object.assign({}, o, { wochentag: false }));
  // „19.–25.10.“ im selben Monat, sonst „12.10. – 06.02.“; gleicher Tag: „19.10.“
  const spanneText = (a, b, o) => {
    o = o || {};
    a = isoAus(a); b = isoAus(b);
    if (!a) return "";
    if (!b || b === a) return kurzText(a, o);
    const ja = mitJahr(a, o), jb = mitJahr(b, o);
    if (a.slice(0, 7) === b.slice(0, 7) && !ja) return `${a.slice(8, 10)}.–${kurzText(b, o)}`;
    return `${tm(a)}${ja && a.slice(0, 4) !== b.slice(0, 4) ? a.slice(0, 4) : ""} – ${kurzText(b, Object.assign({}, o, { jahr: ja || jb }))}`;
  };
  const tageBis = (iso, bezug) => tageZwischen(s10(bezug) || heuteIso(), isoAus(iso));
  const abstandText = (iso, bezug) => {
    const n = tageBis(iso, bezug);
    return n === 0 ? "heute" : n === 1 ? "morgen" : n === -1 ? "gestern" : n > 1 ? `in ${n} Tagen` : `vor ${-n} Tagen`;
  };
  const minutenVon = (s) => { const m = String(s == null ? "" : s).match(/(\d{1,2})[:.](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const uhrText = (s) => { const n = minutenVon(s); return n == null ? "" : `${pad(Math.floor(n / 60))}:${pad(n % 60)}`; };
  const uhrzeitIn = (s) => (String(s == null ? "" : s).match(ZEIT_RE) || ["", ""])[1];
  const kwVon = (iso) => {
    const t = tagObj(iso);
    const u = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
    const wt = u.getUTCDay() || 7;
    u.setUTCDate(u.getUTCDate() + 4 - wt);
    return Math.ceil(((u - Date.UTC(u.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  };
  const wochentagVon = (iso) => ((tagObj(iso).getDay() + 6) % 7) + 1; // 1 = Montag … 7 = Sonntag
  const gueltigerTag = (j, mo, t) => { const d = new Date(j, mo - 1, t); return d.getFullYear() === j && d.getMonth() === mo - 1 && d.getDate() === t; };
  // Jahr zu Tag und Monat: o.ab (ISO) → erstes Vorkommen ab diesem Tag (Ende eines Zeitraums), sonst das Jahr, in dem das Datum
  // höchstens ZURUECK Tage vor und höchstens VORAUS Tage nach dem Bezugstag (Standard heute) liegt. Ungültig (31.02.) → "".
  const jahrRaten = (tag, monat, o) => {
    o = o || {};
    const t = Number(tag), mo = Number(monat);
    const iso = (j) => `${j}-${pad(mo)}-${pad(t)}`;
    let j;
    if (s10(o.ab)) { j = Number(o.ab.slice(0, 4)); if (iso(j) < s10(o.ab)) j++; }
    else {
      const bezug = s10(o.bezug) || heuteIso();
      j = Number(bezug.slice(0, 4));
      if (iso(j) < plusTage(bezug, -ZURUECK)) j++;
      else if (iso(j) > plusTage(bezug, VORAUS)) j--;
    }
    return gueltigerTag(j, mo, t) ? iso(j) : "";
  };
  const plural = (n, einzahl, mehrzahl) => `${n} ${n === 1 ? einzahl : mehrzahl}`;
  const zeit = {
    heute: () => heuteIso(), jetzt: () => ctx.date.jetzt(), iso: isoAus, tag: (v) => { const d = isoAus(v); return d ? tagObj(d) : null; },
    plus: plusTage, tage: tageZwischen, tageBis, montag: (v) => montagVon(isoAus(v) || heuteIso()), wochentag: wochentagVon, kw: kwVon, studienjahr,
    datum: datumText, kurz: kurzText, spanne: spanneText, abstand: abstandText, minuten: minutenVon, uhr: uhrText, uhrzeitIn, jahrRaten, plural,
    esc: (s) => esc(s), WT, WT_LANG, MONATE,
  };

  // ---------- Fachmodell ----------
  const text = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const liste = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
  // Zwischentest (freiwillig, unbenotet): Titel oder Dateiname enthält „Zwischentest“ (auch „Zwischen-Test“), Groß- und
  // Kleinschreibung egal. x: Text oder Notiz ({ f, fm } bzw. { titel }).
  const ZT = /zwischen-?test/i;
  const istZwischentest = (x) => {
    if (x == null) return false;
    if (typeof x === "string") return ZT.test(x);
    const fm = x.fm || {};
    return ZT.test(text(fm.titel)) || ZT.test(text(x.titel)) || ZT.test(text(x.f && x.f.basename));
  };
  const istNachhol = (x) => {
    if (x == null) return false;
    if (typeof x === "string") return /nachhol/i.test(x);
    const fm = x.fm || {};
    return /nachhol/i.test(text(fm.titel) + " " + text(x.titel) + " " + text(x.f && x.f.basename));
  };

  // Feld „ort“ eines Termins („ab 15:00 · bis 30.10. 15:00 · ILIAS-Kurs E101 → Übungen“) → { ab, bis (Uhrzeiten), schluss (ein
  // „bis …“ kam vor), zeit (reine Uhrzeit oder Spanne), wo (der Rest, ohne angehängtes „bis 18.10.“) }
  const UHR = "(?:[01]?\\d|2[0-3]):[0-5]\\d";
  const TAGMUSTER = "\\d{1,2}\\.\\d{1,2}\\.(?:\\d{2,4})?";
  const AB_ZEIT = new RegExp(`^ab\\s+(${UHR})(?:\\s*Uhr)?$`, "i");
  const BIS_ZEIT = new RegExp(`^bis\\s+(?:${TAGMUSTER}(?:,?\\s*(${UHR}))?|(${UHR}))(?:\\s*Uhr)?$`, "i");
  const NUR_ZEIT = new RegExp(`^(${UHR}(?:\\s*[–-]\\s*${UHR})?)(?:\\s*Uhr)?$`);
  const BIS_AM_ENDE = new RegExp(`\\s+bis\\s+${TAGMUSTER}(?:,?\\s*${UHR})?(?:\\s*Uhr)?$`, "i");
  const ortTeilen = (ort) => {
    const aus = { ab: "", bis: "", schluss: false, zeit: "", wo: "" };
    const wo = [];
    for (const roh of String(ort || "").split(" · ")) {
      const teil = roh.trim();
      let m;
      if (!teil) continue;
      if ((m = teil.match(AB_ZEIT))) aus.ab = m[1];
      else if ((m = teil.match(BIS_ZEIT))) { aus.schluss = true; aus.bis = m[1] || m[2] || ""; }
      else if ((m = teil.match(NUR_ZEIT))) aus.zeit = m[1];
      else {
        const w = teil.replace(BIS_AM_ENDE, "").trim();
        if (w !== teil) aus.schluss = true;
        if (w) wo.push(w);
      }
    }
    aus.wo = wo.join(" · ");
    return aus;
  };

  // Art eines Termins (Farbe im Kalender, in der Agenda und auf dem Dashboard): pruefung, zwischentest, frist, event, uni
  const EVENT = ["Fachschaft", "Veranstaltung"];
  const terminArt = (kategorie, zt) => (kategorie === "Prüfung" ? (zt ? "zwischentest" : "pruefung") : kategorie === "Frist" ? "frist" : EVENT.indexOf(kategorie) >= 0 ? "event" : "uni");
  // Termin-Notiz ({ f, fm }) → normierter Termin. Uhrzeit: eigenes Feld „uhrzeit“ (neue eigene Termine, „10:00–11:30“), sonst wie
  // bisher aus „ort“ (zentrale Notizen schreiben sie weiter dorthin, damit Bases-Formeln bearbeiteter Dashboards sie finden).
  // wo: der Ort ohne Uhrzeit und ohne angehängtes „bis 18.10.“.
  const terminLesen = (x) => {
    const f = x && x.f, fm = (x && x.fm) || {};
    const datum = s10(fm.datum);
    if (!datum) return null;
    const b = s10(fm.bis), bis = b && b > datum ? b : "";
    const titel = text(fm.titel) || (f ? f.basename : "");
    const ort = text(fm.ort), teile = ortTeilen(ort);
    const eigeneZeit = text(fm.uhrzeit);
    const zeitText = eigeneZeit || uhrzeitIn(ort);
    const kategorie = text(fm.kategorie) || "Termin";
    const zt = kategorie === "Prüfung" && istZwischentest({ f, fm });
    return {
      f, fm, pfad: f ? f.path : "", titel, datum, bis, ende: bis || datum, kategorie, art: terminArt(kategorie, zt),
      zeit: zeitText, minuten: minutenVon(zeitText), ab: teile.ab, bisZeit: teile.bis, ort, wo: teile.wo,
      code: text(fm.code), bereich: text(fm.bereich), freiwillig: fm.bereich === "schluesselqualifikation", zentral: fm.herkunft === "zentral",
      geschaetzt: geschaetzt(fm.status), erledigt: fm.erledigt === true, entfaellt: fm.entfaellt === true,
      zwischentest: zt, nachhol: istNachhol({ f, fm }), phase: kategorie === "Prüfung" && !!bis, quelle: text(fm.quelle),
    };
  };
  // Frist der Orientierungsprüfung: Ende des 4. Fachsemesters deiner Semesterliste (§§ 8, 11 BT)
  const opFrist = () => { const L = daten().semesterliste; return L[3] ? L[3].ende : ""; };
  // Die zentrale Frist „Orientierungsprüfung“ gilt nur für den Jahrgang, zu dem ihr Datum passt (sonst wäre sie für alle anderen falsch)
  const fremderJahrgang = (t, op) => t.kategorie === "Frist" && /orientierungspr/i.test(t.titel) && !!op && t.datum !== op;
  const nachZeit = (a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0)
    || ((a.minuten == null ? -1 : a.minuten) - (b.minuten == null ? -1 : b.minuten)) || a.titel.localeCompare(b.titel, "de");
  // Alle Termin-Notizen, normiert und nach Tag und Uhrzeit sortiert (Uhrzeit als Zahl: 9:15 vor 12:15). Entfallene Termine
  // (entfaellt: true) und die Frist der Orientierungsprüfung eines anderen Jahrgangs zählen nirgends; o.alle: auch sie.
  const termine = (o) => {
    const D = daten();
    if (!D.zwischen.termine) {
      const op = opFrist();
      D.zwischen.termine = D.termine.map(terminLesen).filter(Boolean).sort(nachZeit);
      D.zwischen.gueltig = D.zwischen.termine.filter((t) => !t.entfaellt && !fremderJahrgang(t, op));
    }
    return o && o.alle ? D.zwischen.termine : D.zwischen.gueltig;
  };

  const modulNach = (code) => { const c = text(code); return daten().module.find((m) => m.code === c) || null; };
  // Prüfungen: Termin-Notizen kategorie „Prüfung“ (eintägig; ein Zeitraum ist eine Prüfungsphase, die nur aus den
  // Semesterdaten kommt) und das Modulfeld „klausur“. Kürzel + Tag zählen einmal (die Termin-Notiz gewinnt, Zwischentests
  // verdecken keine Klausur). Je Prüfung: erledigt (Haken an der Notiz), fertig und ergebnis (Modul bestanden/anerkannt).
  const pruefungenAlle = () => {
    const D = daten();
    if (D.zwischen.pruefungen) return D.zwischen.pruefungen;
    const aus = [], gesehen = {};
    for (const t of termine()) {
      if (t.kategorie !== "Prüfung" || t.bis) continue;
      const m = t.code ? modulNach(t.code) : null;
      const k = t.code + "|" + t.datum + (t.zwischentest ? "|zt" : "");
      if (t.code && gesehen[k]) continue;
      gesehen[k] = true;
      aus.push({ quelle: "termin", f: t.f, pfad: t.pfad, code: t.code, titel: t.titel, datum: t.datum, zeit: t.zeit, minuten: t.minuten, wo: t.wo,
        geschaetzt: t.geschaetzt, zwischentest: t.zwischentest, nachhol: t.nachhol, erledigt: t.erledigt || (!!m && m.fertig && !t.zwischentest),
        modul: m, fertig: !!m && m.fertig, ergebnis: m ? m.ergebnis : "", status: m ? m.status : "" });
    }
    for (const m of D.module) {
      const d = s10(m.fm.klausur);
      if (!d || gesehen[m.code + "|" + d]) continue;
      gesehen[m.code + "|" + d] = true;
      aus.push({ quelle: "modul", f: m.f, pfad: m.f.path, code: m.code, titel: `${m.code} · ${m.titel}`, datum: d, zeit: "", minuten: null, wo: "",
        geschaetzt: false, zwischentest: false, nachhol: false, erledigt: m.fertig, modul: m, fertig: m.fertig, ergebnis: m.ergebnis, status: m.status });
    }
    D.zwischen.pruefungen = aus.sort((a, b) => nachZeit(a, b) || a.code.localeCompare(b.code));
    return D.zwischen.pruefungen;
  };
  // offen = kommt noch und ist weder abgehakt noch durch den Modulstatus erledigt
  const mitOffen = (p, heute) => Object.assign({}, p, { offen: !p.erledigt && p.datum >= heute });
  // o: { heute, ab, bis (ISO), code, zwischentests (Standard true) }
  const pruefungen = (o) => {
    o = o || {};
    const heute = s10(o.heute) || heuteIso();
    return pruefungenAlle().filter((p) => (!o.code || p.code === o.code) && (o.zwischentests !== false || !p.zwischentest)
      && (!o.ab || p.datum >= o.ab) && (!o.bis || p.datum <= o.bis)).map((p) => mitOffen(p, heute));
  };
  // Prüfung eines Moduls nach der einen Regel: Klausuren mit diesem Kürzel (ohne Zwischentests; Nachholtermine nur nach „nicht
  // bestanden“); die nächste offene, sonst die letzte geschriebene bzw. abgehakte. Ist das Modul bestanden oder anerkannt, nur
  // eine Prüfung, die schon war (sonst null: eine kommende Klausur ist dann keine mehr).
  const pruefungVon = (code, o) => {
    o = o || {};
    const heute = s10(o.heute) || heuteIso();
    const m = modulNach(code);
    const nachholOk = !!m && m.status === "nicht bestanden";
    const k = pruefungen({ heute, code: text(code), zwischentests: false }).filter((p) => !p.nachhol || nachholOk);
    if (m && m.fertig) { const vorbei = k.filter((p) => p.datum <= heute); return vorbei.length ? vorbei[vorbei.length - 1] : null; }
    const offen = k.filter((p) => p.offen);
    if (offen.length) return offen[0];
    return k.length ? k[k.length - 1] : null;
  };
  // Nächste Prüfung (Dashboard): früheste offene Klausur, ohne Zwischentests und Nachholtermine (außer nach „nicht bestanden“)
  const naechstePruefung = (o) => pruefungen(Object.assign({}, o, { zwischentests: false }))
    .filter((p) => p.offen && (!p.nachhol || (p.modul && p.modul.status === "nicht bestanden")))[0] || null;
  // Fristen (kategorie Frist), die noch laufen oder kommen, nicht abgehakt, sortiert nach dem nächsten Stichtag: läuft der
  // Zeitraum schon, sein Ende, sonst sein Beginn. o: { heute, tage (nur, was spätestens in so vielen Tagen beginnt) }
  const fristen = (o) => {
    o = o || {};
    const heute = s10(o.heute) || heuteIso(), grenze = o.tage != null ? plusTage(heute, Number(o.tage)) : "";
    return termine().filter((t) => t.kategorie === "Frist" && !t.erledigt && t.ende >= heute && (!grenze || t.datum <= grenze))
      .map((t) => { const laeuft = !!t.bis && t.datum < heute; return Object.assign({}, t, { laeuft, stichtag: laeuft ? t.ende : t.datum }); })
      .sort((a, b) => (a.stichtag < b.stichtag ? -1 : a.stichtag > b.stichtag ? 1 : 0) || nachZeit(a, b));
  };
  // Abgaben offener Übungsblätter (Status nicht abgegeben/korrigiert, mit Fälligkeit); überfällige bleiben, bis sie abgegeben sind
  const abgaben = (o) => {
    o = o || {};
    const heute = s10(o.heute) || heuteIso(), grenze = o.tage != null ? plusTage(heute, Number(o.tage)) : "";
    return daten().uebungsblaetter.map(({ f, fm }) => ({ f, fm, pfad: f.path, code: text(fm.code), nummer: text(fm.nummer), datum: s10(fm.faellig),
      status: text(fm.status).toLowerCase() }))
      .filter((u) => u.datum && ["abgegeben", "korrigiert"].indexOf(u.status) < 0 && (!grenze || u.datum <= grenze))
      .map((u) => Object.assign(u, { ueberfaellig: u.datum < heute }))
      .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0) || a.code.localeCompare(b.code));
  };

  // ---------- Woche: eine Wochenend-Regel ----------
  // kalenderwoche: Montag bis Sonntag, in der der Tag liegt. planwoche: die Woche, um die es geht – Montag bis Freitag die laufende,
  // am Samstag und Sonntag schon die kommende. Alles, was „diese Woche“ zeigt (Wochenraster, Leiste „Semesterverlauf“,
  // Semesterband der Modulseite, Agenda, „Vorlesungswoche n“), nimmt die Planwoche; Tagesangaben (heute, morgen) bleiben am Tag.
  const kalenderwoche = (datum) => {
    const mo = montagVon(isoAus(datum) || heuteIso());
    return { mo, fr: plusTage(mo, 4), so: plusTage(mo, 6), kw: kwVon(mo), tage: [0, 1, 2, 3, 4, 5, 6].map((i) => plusTage(mo, i)) };
  };
  const planwoche = (datum) => {
    const d = isoAus(datum) || heuteIso(), wt = wochentagVon(d);
    return Object.assign(kalenderwoche(wt >= 6 ? plusTage(d, 8 - wt) : d), { vorgezogen: wt >= 6 });
  };

  // ---------- Stundenplan: findet eine Sitzung statt? ----------
  // fm: Notiz typ lehrveranstaltung (wochentag 1 = Montag, von, bis, ausfall[], aenderungen["Datum|Beginn|Ende|Raum"], einzeltermin,
  // entfaellt, herkunft/zentral_id), tag: ISO. → { statt, grund, name, beginn, ende, raum, geaendert }. grund: "" (findet statt),
  // "entfaellt", "ausgeblendet" (Besuche ich nicht), "anderer Tag", "ausserhalb" (vor von, nach bis), "ausfall", "pause", "frei"
  // (vorlesungsfreier Tag, z. B. Christi Himmelfahrt). name: Name der Pause bzw. des freien Tags.
  const findetStatt = (fm, tag) => {
    const d = isoAus(tag);
    const aus = { statt: false, grund: "", name: "", beginn: uhrText(fm && fm.beginn), ende: uhrText(fm && fm.ende), raum: text(fm && fm.raum), geaendert: false };
    if (!fm || !d) { aus.grund = "anderer Tag"; return aus; }
    const D = daten();
    const nein = (grund, name) => Object.assign(aus, { grund, name: name || "" });
    if (fm.entfaellt === true) return nein("entfaellt");
    if (fm.herkunft === "zentral" && liste(D.einstellungen.stundenplan_ausgeblendet).map(String).indexOf(String(fm.zentral_id)) >= 0) return nein("ausgeblendet");
    const von = s10(fm.von), bis = s10(fm.bis);
    if (fm.einzeltermin === true) { if (von && d !== von) return nein("anderer Tag"); }
    else if (Number(fm.wochentag) !== wochentagVon(d)) return nein("anderer Tag");
    if ((von && d < von) || (bis && d > bis)) return nein("ausserhalb");
    if (liste(fm.ausfall).map(isoAus).indexOf(d) >= 0) return nein("ausfall");
    const p = D.pausen.find((x) => x.von <= d && d <= x.bis);
    if (p) return nein("pause", p.name);
    const frei = D.freieTage.find((x) => x.datum === d);
    if (frei) return nein("frei", frei.name);
    const a = liste(fm.aenderungen).map((x) => String(x).split("|")).find((x) => x.length >= 3 && isoAus(x[0]) === d);
    if (a) Object.assign(aus, { beginn: uhrText(a[1]) || aus.beginn, ende: uhrText(a[2]) || aus.ende, raum: text(a[3]) || aus.raum, geaendert: true });
    aus.statt = true;
    return aus;
  };
  // Nächste Sitzung einer Serie ab jetzt (heute nur, solange sie nicht vorbei ist) → { d (Date), datum, beginn, ende, raum, art,
  // geaendert } | null
  const naechsteSitzung = (fm, jetzt, tage) => {
    const j = jetzt || ctx.date.jetzt(), heute = isoVon(j), nun = j.getHours() * 60 + j.getMinutes();
    for (let i = 0; i <= (tage == null ? 35 : tage); i++) {
      const d = plusTage(heute, i), s = findetStatt(fm, d);
      if (!s.statt) { if (s.grund === "ausserhalb" && s10(fm && fm.bis) && d > s10(fm.bis)) return null; if (s.grund === "entfaellt" || s.grund === "ausgeblendet") return null; continue; }
      const schluss = minutenVon(s.ende || s.beginn);
      if (i === 0 && schluss != null && schluss <= nun) continue;
      return { d: tagObj(d), datum: d, beginn: s.beginn, ende: s.ende, raum: s.raum, art: text(fm.art) || "Veranstaltung", geaendert: s.geaendert };
    }
    return null;
  };

  // ---------- Plan, ECTS, Noten, Status ----------
  const ROLLE = { "Economics": "rolle_economics", "Business Administration": "rolle_ba", "ohne Spezialisierung": "rolle_ohne" };
  // Im Plan: gehört zu deinem Studium – selbst gewählt (+ Planen), selbst geplant (semester_geplant), schon begonnen (läuft,
  // angemeldet, bestanden, nicht bestanden, anerkannt), Grundstudium und Abschluss, in Profil & Vertiefung Pflicht deiner Variante
  // (Variante offen: Pflicht in allen). Schwerpunktmodule nur, wenn gewählt oder begonnen. Zusatzleistungen zählen nie.
  const imPlan = (x) => {
    const fm = (x && x.fm) || x || {};
    if (fm.zusatz === true) return false;
    if (fm.gewaehlt === true || text(fm.semester_geplant)) return true;
    const st = text(fm.status).toLowerCase();
    if (st && st !== "offen") return true;
    const g = text(fm.gruppe);
    if (g === "Grundstudium" || g === "Abschluss") return true;
    if (g !== "Profil & Vertiefung") return false;
    const rk = ROLLE[daten().variante];
    return rk ? fm[rk] === "Pflicht" : ["rolle_economics", "rolle_ba", "rolle_ohne"].every((k) => fm[k] === "Pflicht");
  };
  // ECTS (Regel wie auf Noten & ECTS): bestandene und anerkannte Module ohne Zusatzleistungen, dazu SQ-Kurse (höchstens 9, solange
  // SQ100 offen ist). op: bestandene Module der Orientierungsprüfung (höchstens 4).
  const ects = () => {
    const D = daten();
    const gezaehlt = D.module.filter((m) => m.fertig && !m.zusatz);
    const sq100 = D.module.find((m) => m.code === "SQ100");
    const sq = D.sqKurse.filter((x) => FERTIG.indexOf(text(x.fm.status).toLowerCase()) >= 0).reduce((a, x) => a + zahlVon(x.fm.ects), 0);
    const sqTeil = sq100 && !sq100.fertig ? Math.min(9, sq) : 0;
    return { ist: gezaehlt.reduce((a, m) => a + m.ects, 0) + sqTeil, gesamt: 180, sq, sqTeil,
      zusatz: D.module.filter((m) => m.fertig && m.zusatz).reduce((a, m) => a + m.ects, 0),
      op: Math.min(4, D.module.filter((m) => m.op && m.fertig).length), opFrist: opFrist() };
  };
  // Gesamtnote (§ 13 BT, wie die Seite Noten & ECTS): 66 % Schwerpunktblock (dazu Elective Studies), 34 % übrige benotete Module,
  // je nach ECTS gewichtet, zwei Stellen abgeschnitten. → { note ("2,34" | "–"), unter, d34, d66, w34, w66, ungueltig[] }
  const NOTE_RE = /^\s*[1-5]([.,][0-9]+)?\s*$/;
  const blockVon = (fm, variante) => {
    const es = (k) => fm[k] === "Elective Studies", pf = (k) => fm[k] === "Pflicht";
    const elective = fm.gruppe === "Profil & Vertiefung" && ((variante === "Economics" && es("rolle_economics")) || (variante === "Business Administration" && es("rolle_ba"))
      || (fm.anrechnung === "Elective Studies" && !(variante === "Economics" && pf("rolle_economics")) && !(variante === "Business Administration" && pf("rolle_ba"))));
    return elective ? "66 %" : text(fm.notenblock);
  };
  const noten = () => {
    const D = daten();
    const fertig = D.module.filter((m) => m.fertig && !m.zusatz && m.ergebnis && text(m.fm.notenblock) !== "–");
    const ungueltig = fertig.filter((m) => !NOTE_RE.test(m.ergebnis)).map((m) => m.code);
    const benotet = fertig.filter((m) => NOTE_RE.test(m.ergebnis));
    const summe = (block) => benotet.filter((m) => blockVon(m.fm, D.variante) === block).reduce((a, m) => ({ w: a.w + m.ects, s: a.s + m.ects * zahlVon(m.ergebnis) }), { w: 0, s: 0 });
    const b34 = summe("34 %"), b66 = summe("66 %");
    const d34 = b34.w > 0 ? b34.s / b34.w : 0, d66 = b66.w > 0 ? b66.s / b66.w : 0;
    const gesamt = b34.w > 0 && b66.w > 0 ? 0.66 * d66 + 0.34 * d34 : b34.w > 0 ? d34 : d66;
    const zwei = (x) => (Math.floor(x * 100 + 0.000001) / 100).toFixed(2).replace(".", ",");
    const unter = ungueltig.length ? (ungueltig.length === 1 ? "Note ungültig: " : "Noten ungültig: ") + ungueltig.join(", ")
      : b34.w + b66.w === 0 ? "noch keine Noten eingetragen" : b66.w === 0 ? "vorläufig · nur 34 %-Block" : b34.w === 0 ? "vorläufig · nur 66 %-Block" : "gewichtet nach § 13 PO";
    return { note: b34.w + b66.w === 0 ? "–" : zwei(gesamt), unter, d34, d66, w34: b34.w, w66: b66.w, ungueltig };
  };
  // Farbe (Ton einer Pille) für einen Zustand, überall gleich (docs/design.md „Bedeutung der Statusfarben“): ok erledigt,
  // bestanden, angemeldet; warn Frist, in Arbeit; bad Prüfung, nicht bestanden, überfällig; info Lehre, läuft, Zwischentest;
  // akzent Veranstaltung/Fachschaft; leer neutral (offen, neu, geschätzt, freiwillig). typ: "modul", "termin" (Wert = Kategorie
  // oder Art) oder leer (nach dem Wort).
  const TON = {
    ok: ["bestanden", "anerkannt", "angemeldet", "abgegeben", "korrigiert", "erledigt", "gelesen", "bearbeitet", "zugelassen", "durchgearbeitet", "verbunden"],
    bad: ["nicht bestanden", "überfällig", "abgelehnt", "fehler", "prüfung", "pruefung"],
    warn: ["in arbeit", "frist", "abgabe"],
    info: ["läuft", "lehre", "zwischentest", "uni", "termin"],
    akzent: ["fachschaft", "veranstaltung", "event"],
  };
  const statusArt = (typ, wert) => {
    if (wert === undefined) { wert = typ; typ = ""; }
    const w = text(wert).toLowerCase();
    if (typ === "termin" && istZwischentest(w)) return "info";
    for (const ton of Object.keys(TON)) if (TON[ton].indexOf(w) >= 0) return ton;
    return "leer";
  };

  // ---------- Abgleich mit System/Einstellungen.md ----------
  const protokoll = ctx.bleibend("protokoll", () => []); // Schreibvorgänge (für Tests), überlebt den Hot-Reload
  // grund: „start“ und „änderung …“ = von selbst (nur der Abrufer schreibt), sonst ein Tipp auf diesem Gerät (schreibt sofort)
  const vonSelbst = (grund) => /^(start|änderung)/.test(String(grund || ""));
  const abgleichen = async (grund) => {
    const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
    if (!f) return false;
    ungueltig();
    const D = daten();
    if (!D.zentral.vorhanden || !D.semesterliste.length) return false; // ohne zentrale Daten (z. B. Sync noch nicht fertig) nie schreiben
    const ist = D.einstellungen, soll = D.abgeleitet;
    const gleich = (a, b) => JSON.stringify((Array.isArray(a) ? a : []).map((x) => String(x))) === JSON.stringify(b);
    if (gleich(ist.semesterliste, soll.semesterliste) && gleich(ist.pausen, soll.pausen) && gleich(ist.pruefungsphasen, soll.pruefungsphasen)) return false;
    if (vonSelbst(grund) && ctx.zentral && ctx.zentral.abruferHier && !(await ctx.zentral.abruferHier())) return false;
    await app.fileManager.processFrontMatter(f, (x) => { x.semesterliste = soll.semesterliste; x.pausen = soll.pausen; x.pruefungsphasen = soll.pruefungsphasen; });
    protokoll.push({ zeit: new Date().toISOString(), grund: String(grund || "") });
    ungueltig();
    return true;
  };

  // ---------- Beobachter ----------
  // Hörer anderer Skripte bleiben über einen Hot-Reload dieses Skripts erhalten (ctx.bleibend). Wer sich anmeldet, gibt die
  // Rückgabe an ctx.aufraeumen, dann meldet das Plugin ihn beim Neuladen seines Skripts ab.
  const hoerer = ctx.bleibend("hoerer", () => new Set());
  const beiAenderung = (fn) => { hoerer.add(fn); return () => hoerer.delete(fn); };
  const melden = ctx.entprellen(() => { for (const fn of Array.from(hoerer)) { try { fn(); } catch (e) { console.error("modell: Hörer", e); } } }, 600);

  // ---------- Codeblock eba-semesterdaten ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const dm = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}.`;
  const dmy = (s) => `${dm(s)}${s.slice(0, 4)}`;
  const spanne = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? `${dm(a)} – ${dmy(b)}` : `${dmy(a)} – ${dmy(b)}`);
  const kurzSpanne = (a, b) => (a === b ? dm(a) : a.slice(0, 7) === b.slice(0, 7) ? `${a.slice(8, 10)}.–${dm(b)}` : `${dm(a)} – ${dm(b)}`);
  // Nur richtige Daten (Vorgabe vom 17.10.2026): Geschätztes ist markiert – das Semester mit einer ruhigen Pille, einzelne Angaben
  // mit „*“ –, der Hinweis der zentralen Daten steht als Tooltip am Wert und, damit er auch ohne Maus lesbar ist, unter der
  // Tabelle (gleiche Hinweise zusammengefasst; einer direkt, mehrere aufklappbar). Offizielles bleibt unmarkiert; die Fußnote erscheint nur, wenn etwas
  // geschätzt ist.
  const istGeschaetzt = (o) => o.status === "geschätzt";
  const pille = (o) => (istGeschaetzt(o) ? ` <span class="eba-pill warn"${o.hinweis ? ` title="${esc(o.hinweis)}"` : ""}>geschätzt</span>` : "");
  const stern = (text, o) => (istGeschaetzt(o) ? `<span class="eba-sd-g" title="geschätzt${o.hinweis ? `: ${esc(o.hinweis)}` : ""}">${text}*</span>` : text);
  const semesterTabelle = (D, persoenlich) => {
    const sems = persoenlich ? D.semesterliste : D.zentral.semester.map((s) => Object.assign({ fs: null }, s));
    const kopf = `<tr><th>Semester</th><th>Vorlesungszeit</th><th>Vorlesungsfrei</th><th>Prüfungsphasen</th><th>Rückmeldung fürs nächste</th></tr>`;
    const hinweise = []; // { text, was: [...] } je Hinweis geschätzter Einträge, in Zeilenfolge; gleicher Text = ein Eintrag
    let sterne = false;
    const merken = (was, o) => {
      if (!istGeschaetzt(o)) return;
      sterne = true;
      if (!o.hinweis) return;
      let h = hinweise.find((x) => x.text === o.hinweis);
      if (!h) { h = { text: o.hinweis, was: [] }; hinweise.push(h); }
      if (h.was.indexOf(was) < 0) h.was.push(was);
    };
    const reihen = sems.map((s) => {
      const frei = [].concat(
        D.zentral.pausen.filter((p) => p.bis >= s.beginn && p.von <= s.ende).map((p) => ({ von: p.von, t: kurzSpanne(p.von, p.bis), o: p, was: p.name })),
        D.zentral.freieTage.filter((t) => t.datum >= s.vb && t.datum <= s.ve).map((t) => ({ von: t.datum, t: dm(t.datum), o: t, was: t.name })),
      ).sort((a, b) => a.von.localeCompare(b.von));
      const phasen = D.zentral.phasen.filter((p) => p.semester === s.name);
      const rm = D.zentral.rueckmeldung.find((r) => r.fuer === naechster(s.name));
      const jetzt = D.aktuell && D.aktuell.name === s.name && !D.vorStart;
      merken(s.name, s);
      for (const x of frei) merken(`${x.was} ${s.name}`, x.o);
      for (const p of phasen) merken(`${p.art} ${s.name}`, p);
      if (rm) merken(`Rückmeldung fürs ${rm.fuer}`, rm);
      return `<tr${jetzt ? ' class="eba-sd-jetzt"' : ""}><td><b>${esc(s.name)}</b>${s.fs ? ` · FS ${s.fs}` : ""}${pille(s)}</td>`
        + `<td>${s.vb && s.ve ? spanne(s.vb, s.ve) : "–"}</td>`
        + `<td>${frei.length ? frei.map((x) => stern(esc(x.t), x.o)).join(", ") : "–"}</td>`
        + `<td>${phasen.length ? phasen.map((p) => stern(`${esc(p.art)} ${kurzSpanne(p.von, p.bis)}`, p)).join("<br>") : "–"}</td>`
        + `<td>${rm ? stern(`${kurzSpanne(rm.von, rm.bis)}${rm.bis.slice(0, 4)}`, rm) : "–"}</td></tr>`;
    }).join("");
    return { tabelle: `<table class="eba-sd-tabelle">${kopf}${reihen}</table>`, sterne, hinweise };
  };
  const zeichnen = (el, art) => {
    const D = daten();
    if (!D.zentral.vorhanden) { el.innerHTML = `<div class="eba-sd-fehlt">System/Daten/Semester.md fehlt oder ist leer.</div>`; return; }
    const persoenlich = art !== "zentral";
    const T = semesterTabelle(D, persoenlich);
    const fuss = [];
    if (T.sterne) fuss.push("* geschätzt, noch nicht offiziell");
    if (persoenlich) fuss.push(`Studienbeginn ${esc(D.startSemester)}${D.studienbeginnStandard ? " (änderbar unter Personalisieren)" : ""}`);
    else if (D.zentral.stand) fuss.push(`Stand ${dmy(D.zentral.stand)}`);
    const n = T.hinweise.length;
    // Ein Hinweis steht direkt da, erst mehrere klappen sich ein
    const zeile = (h) => `<b>${esc(h.was.join(", "))}</b>: ${esc(h.text)}`;
    const hinweise = n === 1 ? `<p class="eba-sd-fuss">${zeile(T.hinweise[0])}</p>`
      : n ? `<details class="eba-mehr eba-sd-mehr"><summary>${n} Hinweise zu den Schätzungen</summary>`
      + `<ul class="eba-sd-hinweise">${T.hinweise.map((h) => `<li>${zeile(h)}</li>`).join("")}</ul></details>` : "";
    el.innerHTML = `<div class="eba-sd">${T.tabelle}${fuss.length ? `<p class="eba-sd-fuss">${fuss.join(" · ")}</p>` : ""}${hinweise}</div>`;
  };

  // Argument eines Codeblocks aus der Kopfzeile (```eba-x <argument>```): Obsidian übergibt nur den Inhalt, darum die
  // Kopfzeile aus dem Abschnitt lesen (auch in Karten, dort mit „> “ davor). erlaubt = gültige Werte, sonst vorgabe.
  // Beim Neuzeichnen der Leseansicht (rerender) liefert getSectionInfo zwar die Zeilen, aber leeren Text, solange Obsidian
  // die Notiz neu einliest (ab 10240 Zeichen asynchron; so fiel „Deine Angaben“ auf die leere Karte zurück). Rückfall: der
  // Text der Notiz aus ihrer geöffneten Ansicht, sonst das zuletzt an derselben Stelle gelesene Argument. Ganz ohne Zeilen
  // (Karte in der Bearbeitungsansicht) gilt das Argument, wenn alle Blöcke dieser Sprache in der Notiz dasselbe haben.
  const blockArgMerk = {}; // „pfad|sprache|zeile“ → zuletzt gelesenes Argument
  const ansichtText = (pfad) => {
    let text = "";
    if (!pfad) return text;
    try {
      app.workspace.iterateAllLeaves((leaf) => {
        const v = leaf && leaf.view;
        if (text || !v || !v.file || v.file.path !== pfad) return;
        const t = typeof v.getViewData === "function" ? v.getViewData() : v.data;
        if (typeof t === "string") text = t;
      });
    } catch (e) { text = ""; }
    return text;
  };
  const blockArgument = (el, c, sprache, erlaubt, vorgabe) => {
    const muster = new RegExp("^[>\\s]*(?:```|~~~)\\s*" + sprache + "(?:\\s+(\\S+))?\\s*$");
    const pruefen = (a) => { a = String(a || "").toLowerCase(); return !erlaubt || erlaubt.indexOf(a) >= 0 ? (a || vorgabe) : vorgabe; };
    const kopfzeilen = (zeilen) => { const r = []; for (const z of zeilen) { const m = z.match(muster); if (m) r.push(String(m[1] || "").toLowerCase()); } return r; };
    let info = null;
    try { info = c && c.getSectionInfo ? c.getSectionInfo(el) : null; } catch (e) { info = null; }
    const pfad = (c && c.sourcePath) || "";
    const mitZeilen = !!info && typeof info.lineStart === "number" && typeof info.lineEnd === "number";
    const merk = pfad + "|" + sprache + "|" + (mitZeilen ? info.lineStart : "");
    const text = (info && info.text) || ansichtText(pfad);
    if (text) {
      const alle = text.split("\n");
      if (mitZeilen) {
        const r = kopfzeilen(alle.slice(info.lineStart, info.lineEnd + 1));
        if (r.length) { blockArgMerk[merk] = r[0]; return pruefen(r[0]); }
      }
      // Zeilen fehlen oder passen nicht (mehr): eindeutig nur, wenn alle Blöcke dieser Sprache dasselbe Argument haben
      const r = kopfzeilen(alle);
      if (r.length && r.every((a) => a === r[0])) return pruefen(r[0]);
    }
    if (mitZeilen && Object.prototype.hasOwnProperty.call(blockArgMerk, merk)) return pruefen(blockArgMerk[merk]);
    return vorgabe;
  };

  // ---------- Erweiterung ----------
  const api = {
    blockArgument, daten, ungueltig, semesterVon, semesterNachName, semesterAusDatum, naechster, voriger, modulSemester, semesterAuswahl, vorschau, abgleichen,
    beiAenderung, protokoll, woche, vorlesungswochen, semesterFuer,
    // Fachmodell (docs/architektur.md „Fachmodell“)
    zeit, termine, terminLesen, terminArt, ortTeilen, pruefungen, pruefungVon, naechstePruefung, fristen, abgaben, opFrist, kalenderwoche, planwoche, findetStatt,
    naechsteSitzung, imPlan, ects, noten, blockVon, statusArt, istZwischentest, istNachhol, modul: modulNach,
  };
  ctx.modell = api;

  const registrieren = () => {
    const block = ctx.codeblock("eba-semesterdaten", (quelle, el, c, inst) => {
      inst.art = blockArgument(el, c, "eba-semesterdaten", ["zentral", "persoenlich"], "persoenlich");
      try { zeichnen(el, inst.art); } catch (e) { console.error("eba-semesterdaten", e); el.setText(String(quelle)); }
    });
    // Semesterdaten neu: bald abgleichen. Einstellungen geändert: 20 s warten, denn das Gerät, auf dem du getippt hast, schreibt
    // die Ableitung selbst (Personalisieren, Einrichtung); kommt sie per Sync, ist danach alles gleich.
    const abgleich = (pfad) => { abgleichen("änderung " + pfad).catch((e) => console.error("modell: abgleichen", e)); };
    const abgleichBald = ctx.entprellen(abgleich, 1500);
    const abgleichSpaeter = ctx.entprellen(abgleich, 20000);
    const geaendert = (pfad) => {
      ungueltig();
      if (!RELEVANT.test(pfad)) return;
      melden();
      if (pfad === ZENTRAL) abgleichBald(pfad);
      else if (pfad === EINSTELLUNGEN) abgleichSpaeter(pfad);
    };
    ctx.an(app.metadataCache, "changed", (f) => geaendert(f.path));
    ctx.an(app.metadataCache, "deleted", (f) => geaendert(f.path));
    ctx.an(app.vault, "rename", (f, alt) => { geaendert(alt); geaendert(f.path); });
    // Beim ersten Öffnen (z. B. iPhone) ist der Cache evtl. noch unvollständig: nach dem Einlesen neu rechnen und melden
    const eingelesen = ctx.bleibend("eingelesen", () => ({ ja: false }));
    ctx.an(app.metadataCache, "resolved", () => { ungueltig(); if (!eingelesen.ja) { eingelesen.ja = true; melden(); } });
    // Semesterdaten-Blöcke bei Änderungen neu zeichnen
    ctx.aufraeumen(beiAenderung(() => block.neu()));
  };

  // Einmal beim App-Start: wenn der metadataCache fertig ist, abgleichen (schreibt nur bei Abweichung).
  const start = () => {
    const los = () => ctx.zeit(() => { abgleichen("start").catch((e) => console.error("modell: abgleichen", e)); }, 3000);
    if (app.metadataCache.resolved) los();
    else { const r = ctx.an(app.metadataCache, "resolved", () => { app.metadataCache.offref(r); los(); }); }
  };

  return { registrieren, start };
};
