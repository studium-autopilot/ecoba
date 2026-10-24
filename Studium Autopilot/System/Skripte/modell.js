// Gemeinsames Datenmodell „ctx.modell“ (Phase 2b). Einmal berechnet aus
//   System/Daten/Semester.md   zentrale Semesterdaten (Paket B: Semester, Pausen, freie Tage, Prüfungsphasen, Rückmeldung)
//   System/Einstellungen.md    persönliche Angaben (name, studienbeginn, variante, zielnote)
//   Module/, Termine/, Stundenplan/
// und bei Änderungen im metadataCache nachgezogen: Jede Änderung markiert das Modell als veraltet, der nächste Zugriff
// rechnet neu (nie veraltete Daten). Wer neu zeichnen will, meldet sich mit beiAenderung(fn) an (entprellt, 600 ms; auch an
// einem neuen Tag).
//
// Persönliche Semesterliste: ABGELEITET aus studienbeginn + zentralen Daten (1.–6. Fachsemester, bei längerem Studium bis
// zum aktuellen Semester). Leerer studienbeginn = das aktuelle Semester (aus dem Datum) ist das 1. Fachsemester.
// Bases-Formeln können kein Plugin-JS aufrufen, darum schreibt abgleichen() die abgeleiteten Felder semesterliste, pausen,
// pruefungsphasen (altes Format „a|b|c“) nach System/Einstellungen.md – aber nur, wenn sich der berechnete Inhalt vom
// vorhandenen unterscheidet. Ausgelöst wird das, wenn sich Einstellungen.md oder Semester.md ändern, einmal beim App-Start
// (nach dem Einlesen) und an jedem neuen Tag (dann melden auch die Hörer); im Normalfall ist alles gleich und es wird nichts
// geschrieben.
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
// Termine (termine), Prüfungen (pruefungen, pruefungVon, naechstePruefung), Fristen (fristen, abgaben), Übungen (uebung, uebungen),
// Woche (kalenderwoche, planwoche; am Samstag und Sonntag gilt überall schon die kommende Woche), Stundenplan (findetStatt,
// naechsteSitzung: Pausen, freie Tage, Ausfall, Änderungen), ECTS und Noten (ects, noten), imPlan, statusArt, istZwischentest.
// Datum, Uhrzeit, Mehrzahl und HTML-Schutz in einer Schreibweise: ctx.modell.zeit (ctx.zeit selbst ist der Timer-Helfer des Kerns).
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
  // Ordner, deren Änderungen das Modell meldet (beiAenderung): dazu Übungsblätter (Abgaben bis 0.6.7) und SQ-Kurse (ECTS)
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
    const module = [], termine = [], stundenplan = [], sqKurse = [], uebungsblaetter = [], uebungen = [], loesungen = [];
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
      else if (fm.typ === "unterlage" && istUebung(fm)) uebungen.push({ f, fm });
      else if (fm.typ === "unterlage" && /^(eigene )?l(ö|oe)sung$/i.test(text(fm.art))) loesungen.push({ f, fm });
    }
    return {
      heute, zentral: Z, einstellungen: ein,
      name: String(ein.name == null ? "" : ein.name).trim(), variante, zielnote: String(ein.zielnote == null ? "" : ein.zielnote).trim(),
      studienbeginn, studienbeginnStandard: !studienbeginn, startSemester: liste.length ? liste[0].name : semesterAusDatum(heute),
      semesterliste: liste, aktuell, fachsemester: aktuell ? aktuell.fs : 1, vorStart,
      pausen: Z.pausen, freieTage: Z.freieTage, pruefungsphasen: Z.phasen, rueckmeldung: Z.rueckmeldung,
      module, termine, stundenplan, sqKurse, uebungsblaetter, uebungen, loesungen, musterSemester, musterFs, musterplanVariante: plan ? plan.id : "",
      zwischen: {}, // Zwischenergebnisse je Berechnung (Prüfungen, normierte Termine), fallen mit dem Modell weg
      abgeleitet: zeilen(Z, liste),
      personalisiert: !!(String(ein.name == null ? "" : ein.name).trim() && studienbeginn),
    };
  };

  const daten = () => {
    const h = heuteIso();
    if (!cache || cacheTag !== h) {
      const neuerTag = !!cacheTag && cacheTag !== h;
      cache = berechnen(); cacheTag = h;
      if (neuerTag) tagWechsel();
    }
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
  // Uhrzeit gilt; ohne Lookbehind (iOS < 16.4). Gruppe 1 = Uhrzeit bzw. Spanne. „24:00“ ist das Ende eines Tages (eine Abgabe
  // „bis 24:00 Uhr“ aus dem ILIAS-Kalender) und kommt nach 23:59.
  const ZEIT_RE = /(?:^|\D)((?:(?:[01]?\d|2[0-3]):[0-5]\d|24:00)(?:\s*[–-]\s*(?:(?:[01]?\d|2[0-3]):[0-5]\d|24:00))?)(?!\d)/;
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
  const UHR = "(?:(?:[01]?\\d|2[0-3]):[0-5]\\d|24:00)";
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
  // Abgaben offener Übungsblätter (typ übungsblatt, bis 0.6.7 angelegt; Status nicht abgegeben/korrigiert, mit Fälligkeit);
  // überfällige bleiben, bis sie abgegeben sind
  const abgaben = (o) => {
    o = o || {};
    const heute = s10(o.heute) || heuteIso(), grenze = o.tage != null ? plusTage(heute, Number(o.tage)) : "";
    return daten().uebungsblaetter.map(({ f, fm }) => ({ f, fm, pfad: f.path, code: text(fm.code), nummer: text(fm.nummer), datum: s10(fm.faellig),
      status: text(fm.status).toLowerCase() }))
      .filter((u) => u.datum && ["abgegeben", "korrigiert"].indexOf(u.status) < 0 && (!grenze || u.datum <= grenze))
      .map((u) => Object.assign(u, { ueberfaellig: u.datum < heute }))
      .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0) || a.code.localeCompare(b.code));
  };

  // ---------- Übungen (seit 24.10.2026) ----------
  // Ein Übungsblatt ist seine Begleitnotiz (typ unterlage, art Übung). Bis 0.6.7 führte „Neues Übungsblatt“ daneben eine eigene
  // Notiz (typ übungsblatt), die dasselbe Blatt ein zweites Mal von Hand verwaltete; ältere stehen weiter in abgaben().
  // Abgabe: die Fristen zu diesem Blatt – gleicher Code, Titel mit „Abgabe“, „Blatt“, „Hausaufgabe“ … und derselben Nummer, nicht
  // „Feedback“, im Semester der Unterlage (Feld semester); meist aus dem ILIAS-Kalender („B110 Abgabe 3“). Erledigt: mit Abgabe
  // deren Haken (ein Haken für beides; kopf.js setzt beim Tipp auch status der Begleitnotiz), ohne Abgabe status „bearbeitet“.
  // „gelesen“ heißt bei einem Blatt: noch nicht bearbeitet. Lösungen: Unterlagen der Art Lösung bzw. Eigene Lösung mit gleicher Nummer.
  const istUebung = (fm) => !!fm && /^(ü|ue)bung$/i.test(text(fm.art));
  // Nummer des Blatts im Titel einer Frist („B110 Abgabe 3“, „Abgabe Übungsblatt 03“, „3. Hausaufgabe“) → Zahl, sonst 0
  const BLATT_NR = [
    /(?:abgabe|blatt|zettel|hausaufgabe|aufgabe|assignment|sheet|homework|(?:ü|ue)bung)\s*(?:nr\.?\s*|no\.?\s*|#\s*)?0*(\d{1,2})(?!\d)/i,
    /(?:^|\s)0*(\d{1,2})\.\s*(?:(?:ü|ue)bungs|aufgaben)?(?:blatt|zettel|hausaufgabe|abgabe)/i,
  ];
  const blattNummer = (titel) => {
    for (const r of BLATT_NR) { const m = text(titel).match(r); if (m && Number(m[1]) > 0) return Number(m[1]); }
    return 0;
  };
  const ABGABE = /abgabe|blatt|zettel|hausaufgabe|assignment|einreich|sheet|homework/i;
  // Fristen zu Abgaben nach „Code|Nummer“, einmal je Berechnung
  const abgabenIndex = () => {
    const D = daten();
    if (D.zwischen.abgaben) return D.zwischen.abgaben;
    const ix = {};
    for (const t of termine()) {
      if (t.kategorie !== "Frist" || !t.code || !ABGABE.test(t.titel) || /feedback/i.test(t.titel)) continue;
      const nr = blattNummer(t.titel), k = t.code + "|" + nr;
      if (nr) (ix[k] = ix[k] || []).push(t);
    }
    return (D.zwischen.abgaben = ix);
  };
  const nummerVon = (v) => (Number(v) > 0 && Math.floor(Number(v)) === Number(v) ? Number(v) : null);
  // Gleiches Blatt: gleicher Code und gleiche Nummer, gleiches Semester, wenn beide eins haben
  const gleichesBlatt = (a, b) => text(a.code) === text(b.code) && nummerVon(a.nummer) === nummerVon(b.nummer)
    && (!text(a.semester) || !text(b.semester) || text(a.semester) === text(b.semester));
  // Begleitnotiz einer Übung ({ f, fm }) → { f, fm, pfad, code, nummer, titel, semester, abgaben (Fristen, nach Zeit), abgabe (die
  // erste offene, sonst die letzte), datum, uhr, erledigt, ueberfaellig, loesung, eigene (Begleitnotizen oder null) }
  const uebungLesen = (x, heute) => {
    const f = x.f, fm = x.fm || {}, D = daten();
    const code = text(fm.code), nummer = nummerVon(fm.nummer), semester = text(fm.semester);
    const imSemester = (t) => { const s = semester ? semesterVon(t.datum) : null; return !s || s.name === semester; };
    const abgaben = code && nummer ? (abgabenIndex()[code + "|" + nummer] || []).filter(imSemester) : [];
    const offen = abgaben.filter((t) => !t.erledigt);
    const a = offen[0] || abgaben[abgaben.length - 1] || null;
    const erledigt = abgaben.length ? !offen.length : text(fm.status).toLowerCase() === "bearbeitet";
    const loesung = (art) => (nummer ? D.loesungen.find((l) => text(l.fm.art).toLowerCase() === art && gleichesBlatt(l.fm, fm)) || null : null);
    return { f, fm, pfad: f ? f.path : "", code, nummer, titel: text(fm.titel), semester, abgaben, abgabe: a, datum: a ? a.ende : "",
      uhr: a ? a.ab || a.bisZeit || a.zeit : "", erledigt, ueberfaellig: !erledigt && !!a && a.ende < heute,
      loesung: loesung("lösung"), eigene: loesung("eigene lösung") };
  };
  // Die Übung zu einer Begleitnotiz (Datei) oder null, wenn sie keine ist
  const uebungVon = (f, o) => {
    const fm = (f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter) || {};
    return fm.typ === "unterlage" && istUebung(fm) ? uebungLesen({ f, fm }, s10(o && o.heute) || heuteIso()) : null;
  };
  // Übungen, mit Abgabe nach deren Tag zuerst, dann nach Code und Nummer (ohne Nummer danach). o: { heute, semester (Name; Standard das aktuelle,
  // alle: jedes), code, frist (die Frist, zu der sie gehören: Pfad der Termin-Notiz) }
  const uebungen = (o) => {
    o = o || {};
    const D = daten(), heute = s10(o.heute) || heuteIso();
    const sem = o.alle || o.frist ? "" : text(o.semester) || (D.aktuell ? D.aktuell.name : "");
    // ohne Feld semester zählt der Tag, an dem die Unterlage ankam (datum)
    const imSemester = (fm) => !sem || (text(fm.semester) ? text(fm.semester) === sem : !s10(fm.datum) || (semesterVon(s10(fm.datum)) || {}).name === sem);
    return D.uebungen.filter((x) => (!o.code || text(x.fm.code) === text(o.code)) && imSemester(x.fm)).map((x) => uebungLesen(x, heute))
      .filter((u) => !o.frist || u.abgaben.some((t) => t.pfad === o.frist))
      .sort((a, b) => (!a.datum) - (!b.datum) || (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0) || a.code.localeCompare(b.code)
        || (!a.nummer) - (!b.nummer) || (a.nummer || 0) - (b.nummer || 0) || a.pfad.localeCompare(b.pfad));
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

  // ---------- Stundenplan: „Besuche ich nicht“ (Kopf der Notiz, kopf.js) ----------
  // Eine Lehrveranstaltung aus einer Quelle steht mit ihrem Schlüssel in stundenplan_ausgeblendet (Einstellungen): zentral die
  // zentral_id (wie bisher), sonst „<herkunft>:<id>“ (Alma, ILIAS-Gruppe …), weil die Quelle ihre Notiz neu schreibt. Deine eigene
  // Notiz trägt besuche_nicht: true. besuchSchluessel → Schlüssel oder "" (eigene Notiz).
  const besuchSchluessel = (fm) => {
    const h = text(fm && fm.herkunft);
    const Q = ctx.user && ctx.user.quellen;
    if (!h || !Q || typeof Q.idFeld !== "function") return "";
    const id = text(fm[Q.idFeld(h)]);
    return !id ? "" : h === "zentral" ? id : `${h}:${id}`;
  };
  const besuchtNicht = (fm, einstellungen) => {
    if (!fm) return false;
    if (fm.besuche_nicht === true) return true;
    const k = besuchSchluessel(fm);
    return !!k && liste((einstellungen || daten().einstellungen).stundenplan_ausgeblendet).map(String).indexOf(k) >= 0;
  };

  // ---------- Stundenplan: findet eine Sitzung statt? ----------
  // fm: Notiz typ lehrveranstaltung (wochentag 1 = Montag, von, bis, ausfall[], aenderungen["Datum|Beginn|Ende|Raum"], einzeltermin,
  // entfaellt, herkunft/zentral_id), tag: ISO. → { statt, grund, name, beginn, ende, raum, geaendert, raumGeaendert, raumAlt,
  // zeitGeaendert, zeitAlt }. grund: "" (findet statt), "entfaellt", "ausgeblendet" (Besuche ich nicht), "anderer Tag",
  // "ausserhalb" (vor von, nach bis), "pause", "frei" (vorlesungsfreier Tag, z. B. Christi Himmelfahrt), "ausfall". name: Name der
  // Pause bzw. des freien Tags. Pause und freier Tag gehen dem Ausfall vor (seit 20.10.2026): Alma trägt die Weihnachtspause auch
  // als Ausfall ein, der Grund ist aber die Pause, nicht diese Lehrveranstaltung. Nur grund "ausfall" ist eine Ausnahme dieser
  // Lehrveranstaltung (die Woche zeigt sie in Warnfarbe). Änderung (aenderungen an diesem Tag): neue Zeit und neuer Raum, dazu was
  // sich geändert hat und der übliche Wert davor (raumAlt, zeitAlt „10:15–11:45“), damit die Anzeige „HS 9 statt HS 1“ sagen kann.
  // Dauerhafte Verlegung (raum_seit, raum_vorher; alma.js): Vor raum_seit gilt raum_vorher als üblicher Raum; die ersten zwei
  // Wochen ab raum_seit ist der Raum neu (neuerRaum, raumAlt = raum_vorher). rhythmus „14-täglich“: nur jede zweite Woche ab von,
  // dazwischen „anderer Tag“.
  const findetStatt = (fm, tag) => {
    const d = isoAus(tag);
    const aus = { statt: false, grund: "", name: "", beginn: uhrText(fm && fm.beginn), ende: uhrText(fm && fm.ende), raum: text(fm && fm.raum), geaendert: false,
      raumGeaendert: false, raumAlt: "", zeitGeaendert: false, zeitAlt: "", neuerRaum: false };
    if (!fm || !d) { aus.grund = "anderer Tag"; return aus; }
    const D = daten();
    const nein = (grund, name) => Object.assign(aus, { grund, name: name || "" });
    if (fm.entfaellt === true) return nein("entfaellt");
    if (besuchtNicht(fm, D.einstellungen)) return nein("ausgeblendet");
    const von = s10(fm.von), bis = s10(fm.bis);
    if (fm.einzeltermin === true) { if (von && d !== von) return nein("anderer Tag"); }
    else if (Number(fm.wochentag) !== wochentagVon(d)) return nein("anderer Tag");
    if ((von && d < von) || (bis && d > bis)) return nein("ausserhalb");
    if (fm.einzeltermin !== true && text(fm.rhythmus) === "14-täglich" && von && Math.round((tagObj(d) - tagObj(von)) / 864e5 / 7) % 2) return nein("anderer Tag");
    const p = D.pausen.find((x) => x.von <= d && d <= x.bis);
    if (p) return nein("pause", p.name);
    const frei = D.freieTage.find((x) => x.datum === d);
    if (frei) return nein("frei", frei.name);
    if (liste(fm.ausfall).map(isoAus).indexOf(d) >= 0) return nein("ausfall");
    const seit = s10(fm.raum_seit), vorher = text(fm.raum_vorher);
    if (seit && vorher && d < seit) aus.raum = vorher;
    const a = liste(fm.aenderungen).map((x) => String(x).split("|")).find((x) => x.length >= 3 && isoAus(x[0]) === d);
    if (a) {
      const neu = { beginn: uhrText(a[1]) || aus.beginn, ende: uhrText(a[2]) || aus.ende, raum: text(a[3]) || aus.raum };
      const zeitGeaendert = neu.beginn !== aus.beginn || neu.ende !== aus.ende, raumGeaendert = neu.raum !== aus.raum;
      Object.assign(aus, { raumGeaendert, raumAlt: raumGeaendert ? aus.raum : "", zeitGeaendert,
        zeitAlt: zeitGeaendert ? aus.beginn + (aus.ende ? "–" + aus.ende : "") : "" }, neu, { geaendert: true });
    }
    if (seit && vorher && !aus.raumGeaendert && d >= seit && d < plusTage(seit, 14) && vorher !== aus.raum) Object.assign(aus, { neuerRaum: true, raumGeaendert: true, raumAlt: vorher });
    aus.statt = true;
    return aus;
  };
  // Nächste Sitzung einer Serie ab jetzt (heute nur, solange sie nicht vorbei ist) → { d (Date), datum, beginn, ende, raum, art,
  // geaendert, raumGeaendert, raumAlt, zeitGeaendert, zeitAlt, neuerRaum } | null
  const naechsteSitzung = (fm, jetzt, tage) => {
    const j = jetzt || ctx.date.jetzt(), heute = isoVon(j), nun = j.getHours() * 60 + j.getMinutes();
    for (let i = 0; i <= (tage == null ? 35 : tage); i++) {
      const d = plusTage(heute, i), s = findetStatt(fm, d);
      if (!s.statt) { if (s.grund === "ausserhalb" && s10(fm && fm.bis) && d > s10(fm.bis)) return null; if (s.grund === "entfaellt" || s.grund === "ausgeblendet") return null; continue; }
      const schluss = minutenVon(s.ende || s.beginn);
      if (i === 0 && schluss != null && schluss <= nun) continue;
      // Art wie im Wochenraster: „Veranstaltung“ (Alma ohne erkannte Art) und leer heißen Vorlesung; „Veranstaltung“ nur für Events
      const art = text(fm.art);
      return { d: tagObj(d), datum: d, beginn: s.beginn, ende: s.ende, raum: s.raum, art: !art || art === "Veranstaltung" ? "Vorlesung" : art, geaendert: s.geaendert,
        raumGeaendert: s.raumGeaendert, raumAlt: s.raumAlt, zeitGeaendert: s.zeitGeaendert, zeitAlt: s.zeitAlt, neuerRaum: s.neuerRaum };
    }
    return null;
  };

  // Ausfälle dieser Lehrveranstaltung (grund „ausfall“, nicht Pause oder freier Tag) in den nächsten tage Tagen (Standard 14) ab
  // heute, heute nur, solange die Sitzung nicht vorbei ist (seit 20.10.2026, „Als Nächstes“ der Modulseite: naechsteSitzung
  // überspringt sie) → [{ d (Date), datum, beginn, ende, art }]
  const ausfaelle = (fm, jetzt, tage) => {
    const j = jetzt || ctx.date.jetzt(), heute = isoVon(j), nun = j.getHours() * 60 + j.getMinutes(), aus = [];
    const art = text(fm && fm.art);
    for (let i = 0; i < (tage == null ? 14 : tage); i++) {
      const d = plusTage(heute, i), s = findetStatt(fm, d);
      if (s.grund !== "ausfall") continue;
      const schluss = minutenVon(s.ende || s.beginn);
      if (i === 0 && schluss != null && schluss <= nun) continue;
      aus.push({ d: tagObj(d), datum: d, beginn: s.beginn, ende: s.ende, art: !art || art === "Veranstaltung" ? "Vorlesung" : art });
    }
    return aus;
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
    ok: ["bestanden", "anerkannt", "angemeldet", "abgegeben", "korrigiert", "erledigt", "gelesen", "bearbeitet", "zugelassen", "durchgearbeitet", "verbunden",
      "im stundenplan", "nachgearbeitet"],
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

  // ---------- Vorlesungsnotizen: ein Name überall (seit 19.10.2026) ----------
  // „Vorlesung 1 · Mo 13.10. · Thema“ auf der Modulseite, in „Nachzuarbeiten“, bei den To-dos und im Kopf der Notiz; vorher
  // stand der Dateiname „S110 VL 01“ da. Thema: Feld thema, sonst die erste Überschrift der Notiz, wenn sie mehr sagt als
  // Kürzel, Nummer und Datum, sonst der Titel der verlinkten Folien. Nie erfunden. Dateinamen („2026-10-13 S110 VL 01“) bleiben.
  const VL_LEER = /^(mitschrift|pr(ü|ue)fungsrelevant|klausurrelevant|(offene )?fragen|nacharbeit|kernaussagen|zusammenfassung|(meine )?notizen|folien|vorlesung(snotiz)?)$/i;
  // Teile ohne eigene Aussage, vorn und hinten abgeschnitten: Datum (auch mit Wochentag), „VL 03“, „Vorlesung 3“, „Folien 01“,
  // „Mitschrift“ vor einem Trennzeichen, Semester („WS 2026-27“), Modulkürzel, Trennzeichen
  const VL_TEIL = "(?:\\d{4}-\\d{2}-\\d{2}|(?:(?:Mo|Di|Mi|Do|Fr|Sa|So|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\\.?,?\\s+)?"
    + "\\d{1,2}\\.\\d{1,2}\\.(?:\\d{4}|\\d{2})?|(?:VL|Vorlesung|Vorlesungsnotiz|Folien|Slides)\\s*\\d{1,3}\\b"
    + "|(?:VL|Vorlesung|Vorlesungsnotiz|Mitschrift)(?=\\s*[·|:,;/–—-])"
    + "|(?:WS|SS|SoSe|WiSe)\\s?\\d{2,4}(?:[-/]\\d{2,4})?|[A-ZÄÖÜ]{1,4}\\d{2,4}[a-z]?\\b|[·|:,;/–—-]+)";
  const VL_VORN = new RegExp("^" + VL_TEIL + "\\s*", "i"), VL_HINTEN = new RegExp("\\s*" + VL_TEIL + "$", "i");
  // Was ein Text über Kürzel, Nummer, Datum und Semester hinaus sagt; leer, wenn nichts (oder nur der Name eines Abschnitts
  // bzw. der Titel des Moduls). Höchstens 70 Zeichen, an einer Wortgrenze gekürzt.
  const vorlesungThemaAus = (s, modulTitel) => {
    let t = text(s), alt = "";
    while (t && t !== alt) { alt = t; t = t.replace(VL_VORN, "").replace(VL_HINTEN, "").trim(); }
    if (!t || VL_LEER.test(t) || (modulTitel && t.toLowerCase() === text(modulTitel).toLowerCase())) return "";
    return t.length > 70 ? t.slice(0, 70).replace(/\s+\S*$/, "") + " …" : t;
  };
  // thema (Feld), ueberschrift (erste Überschrift der Notiz), folien (Titel der Begleitnotiz bzw. Name der PDF), modulTitel
  const vorlesungThema = (o) => {
    const x = o || {};
    return text(x.thema) || vorlesungThemaAus(x.ueberschrift, x.modulTitel) || vorlesungThemaAus(x.folien, x.modulTitel);
  };
  // Nummer: Feld nummer, sonst aus dem Dateinamen („… VL 03“)
  const vorlesungNummer = (nummer, name) => {
    const n = Number(nummer);
    if (n > 0 && Math.floor(n) === n) return n;
    const m = String(name || "").match(/\bVL\s*0*(\d{1,3})\b/i);
    return m && Number(m[1]) > 0 ? Number(m[1]) : null;
  };
  // { nummer, datum, thema, code } → „Vorlesung 1 · Mo 13.10. · Thema“ (ohne Nummer „Vorlesung“, ohne Modul „Mitschrift“)
  const vorlesungTitel = (o) => {
    const x = o || {};
    const teile = [x.nummer ? "Vorlesung " + x.nummer : x.code ? "Vorlesung" : "Mitschrift"];
    if (s10(x.datum)) teile.push(datumText(x.datum));
    if (text(x.thema)) teile.push(text(x.thema));
    return teile.join(" · ");
  };
  // ---------- Folien einer Vorlesungsnotiz (seit 24.10.2026) ----------
  // Bis 0.6.2 riet notizen.js die Folien einmal beim Anlegen (gleiche Nummer wie die Vorlesung, sonst die der letzten Notiz) und
  // schrieb sie ins Feld folien. Das traf oft daneben: Folien sind nach Kapiteln nummeriert, nicht nach Vorlesungen (Folien 00
  // zur ersten Vorlesung, ein Kapitel über mehrere Wochen, alle Kapitel schon zu Semesterbeginn online), und was nach dem Anlegen
  // ankam, erschien nie. Jetzt wählt das Modell bei jedem Zeichnen aus dem, was gerade im Tresor liegt; wählen muss niemand.
  // Feld folien = deine Wahl („⋯“ → „Andere Folien“), sie gilt immer. Sonst zur Sitzung der Notiz (ihr Tag, sonst die letzte
  // Sitzung des Moduls in den 6 Tagen davor; Sitzungen laut Stundenplan ohne Übung und Tutorium, ohne Stundenplan die Tage der
  // Vorlesungsnotizen):
  //   1. die Folien, die ILIAS dieser Sitzung zuordnet: ein Datum im Sitzungs- oder Ordnernamen (quelle), sonst im Dateinamen
  //      (original), z. B. „ILIAS: B110 / 2026-10-19, 10:15 - 11:45: Vorlesung 2“ oder „VL_1_Vektoren_22.10.2026.pdf“
  //   2. sonst die Folien, die seit der vorigen Sitzung angekommen sind (datum der Begleitnotiz); mehr als FOLIEN_MAX Nummern auf
  //      einmal sind ein Upload fürs ganze Semester und sagen nichts über diese Sitzung
  //   3. sonst die Folien der vorigen Sitzung (deine Wahl dort oder dieselbe Regel), davon die mit der höchsten Nummer
  //   4. erste Sitzung: die mit der kleinsten Nummer, die vor der nächsten Sitzung ankam
  // Folien mit dem Datum einer anderen Sitzung gehören nur zu ihr; ein Datum außerhalb des Semesters (kommentierte Fassung aus
  // dem Vorjahr) und ein anderes Semester (Feld semester) zählen nie von selbst. Ein Datum, an dem das Modul laut Stundenplan keine Sitzung hat (etwa ein Upload-Tag), ist
  // kein Sitzungsdatum. Je Nummer eine Fassung: die neueste, dann die mit mehr Seiten.
  const FOLIEN_MAX = 3; // höchstens so viele Folien je Sitzung
  const linkZiel = (wert, von) => {
    const s = text(wert);
    if (!s) return null;
    const m = s.match(/^\[\[([^\]|#]+)/), p = (m ? m[1] : s).trim();
    const mc = app.metadataCache;
    return (mc.getFirstLinkpathDest && mc.getFirstLinkpathDest(p, von || "")) || app.vault.getAbstractFileByPath(p) || app.vault.getAbstractFileByPath(p + ".md");
  };
  // Erstes Datum „22.10.2026“ oder „2026-10-22“ in einem Text → ISO, sonst ""
  const DATUM_IM_TEXT = /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\.(\d{1,2})\.(\d{4})/;
  const datumImText = (s) => {
    const m = text(s).match(DATUM_IM_TEXT);
    if (!m) return "";
    const iso = m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[6]}-${pad(m[5])}-${pad(m[4])}`;
    return isoVon(tagObj(iso)) === iso ? iso : "";
  };
  // Einmal je Berechnung: Folien (art Folien) und Vorlesungsnotizen je Modulcode; die Begleitnotiz zu einer Datei
  // (begleitnotiz(pfad)) erst, wenn eine Wahl auf eine PDF zeigt (löst dann einmal alle Links auf)
  const folienIndex = () => {
    const unterlagen = [], folien = {}, notizen = {};
    let datei = null;
    for (const f of app.vault.getMarkdownFiles()) {
      const fm = (app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (!fm) continue;
      const code = text(fm.code);
      if (fm.typ === "vorlesung" && code) { (notizen[code] = notizen[code] || []).push({ f, fm, t: s10(fm.datum) || s10(f.basename) }); continue; }
      if (fm.typ !== "unterlage" || !fm.datei) continue;
      unterlagen.push({ f, fm });
      if (!code || text(fm.art) !== "Folien") continue;
      const nr = fm.nummer === "" || fm.nummer == null || !isFinite(Number(fm.nummer)) ? null : Number(fm.nummer);
      (folien[code] = folien[code] || []).push({ f, fm, nr, datum: s10(fm.datum), semester: text(fm.semester),
        tag: datumImText(fm.quelle) || datumImText(fm.original), seiten: Number(fm.seiten) || 0 });
    }
    const begleitnotiz = (pfad) => {
      if (!datei) { datei = {}; for (const u of unterlagen) { const z = linkZiel(u.fm.datei, u.f.path); if (z) datei[z.path] = u; } }
      return datei[pfad] || null;
    };
    return { folien, notizen, begleitnotiz };
  };
  // Tage mit einer Sitzung des Moduls in der Vorlesungszeit (alles außer Übung und Tutorium), aufsteigend
  const sitzungsTage = (code, sem) => {
    const D = daten(), k = "sitzungen|" + code + "|" + sem.name;
    if (D.zwischen[k]) return D.zwischen[k];
    const lv = D.stundenplan.filter((x) => text(x.fm.code) === code && !/tutori|(ü|ue)bung/i.test(text(x.fm.art)));
    const tage = [];
    if (lv.length && sem.vb && sem.ve) for (let d = sem.vb; d <= sem.ve; d = plusTage(d, 1)) if (lv.some((x) => findetStatt(x.fm, d).statt)) tage.push(d);
    D.zwischen[k] = tage;
    return tage;
  };
  // Deine Wahl im Feld folien → { f, fm, nr } (zu einer PDF ihre Begleitnotiz) oder null (leer, Link ins Leere)
  const folienWahl = (fm, von, ix) => {
    const z = linkZiel(fm.folien, von);
    if (!z) return null;
    const b = z.extension === "md" ? { f: z, fm: (app.metadataCache.getFileCache(z) || {}).frontmatter || {} } : ix.begleitnotiz(z.path) || { f: z, fm: {} };
    const nr = Number(b.fm.nummer);
    return { f: b.f, fm: b.fm, nr: b.fm.nummer === "" || b.fm.nummer == null || !isFinite(nr) ? null : nr };
  };
  const nachNummer = (a, b) => (a.nr == null ? 1e9 : a.nr) - (b.nr == null ? 1e9 : b.nr);
  const nachPfad = (a, b) => (a.f.path < b.f.path ? -1 : a.f.path > b.f.path ? 1 : 0);
  // Je Nummer eine Fassung (siehe oben), nach Nummer sortiert
  const jeNummer = (liste) => {
    const je = {};
    for (const d of liste) { const k = d.nr == null ? "?" : String(d.nr); (je[k] = je[k] || []).push(d); }
    return Object.keys(je).map((k) => je[k].sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0) || (b.seiten - a.seiten) || nachPfad(a, b))[0])
      .sort(nachNummer);
  };
  // Vorlesungsnotiz → { folien: [{ f, fm }] (höchstens FOLIEN_MAX, nach Nummer), gewaehlt (Feld folien gilt), alle (Folien des
  // Moduls zum Wählen: nach Nummer, je Nummer neueste zuerst) }
  const folienVon = (f, index) => {
    const ix = index || folienIndex();
    const fm = (f && (app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
    const code = text(fm.code), alle = ix.folien[code] || [];
    const aus = (liste, gewaehlt) => ({ folien: liste.slice(0, FOLIEN_MAX).map((d) => ({ f: d.f, fm: d.fm })), gewaehlt,
      alle: alle.slice().sort((a, b) => nachNummer(a, b) || (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0) || nachPfad(a, b)).map((d) => ({ f: d.f, fm: d.fm })) });
    const wahl = folienWahl(fm, f ? f.path : "", ix);
    if (wahl) return aus([wahl], true);
    const t = s10(fm.datum) || s10(f && f.basename), sem = t && code && alle.length ? semesterVon(t) : null;
    if (!sem) return aus([], false);
    const plan = sitzungsTage(code, sem);
    // Sitzung zu einem Tag: der Tag selbst, sonst die letzte Sitzung in den 6 Tagen davor (Notiz erst später angelegt)
    const sitzungZu = (d) => { let s = ""; if (plan.indexOf(d) < 0) for (const p of plan) if (p < d && p >= plusTage(d, -6)) s = p; return s || d; };
    const notizen = (ix.notizen[code] || []).filter((n) => n.t && n.t >= sem.beginn && n.t <= sem.ende)
      .map((n) => ({ s: sitzungZu(n.t), wahl: folienWahl(n.fm, n.f.path, ix) }));
    const sitzungen = plan.length ? plan : notizen.map((n) => n.s).concat([t]).filter((d, i, a) => a.indexOf(d) === i).sort();
    const istSitzung = (d) => (plan.length ? plan.indexOf(d) >= 0 : true);
    const gebunden = (d) => !!d.tag && (d.tag < sem.beginn || d.tag > sem.ende || istSitzung(d.tag));
    const frei = alle.filter((d) => !gebunden(d) && (d.semester ? d.semester === sem.name : !d.datum || (d.datum >= sem.beginn && d.datum <= sem.ende)));
    const merk = {};
    const fuer = (S) => {
      if (merk[S]) return merk[S];
      // deine Wahl in einer Notiz dieser Sitzung (zwei Vorlesungen an einem Tag: beide, nach Nummer)
      const gewaehlt = notizen.filter((x) => x.s === S && x.wahl).map((x) => x.wahl).sort((a, b) => nachNummer(a, b) || nachPfad(a, b))
        .filter((w, i, a) => !i || a[i - 1].f.path !== w.f.path);
      if (gewaehlt.length) return (merk[S] = gewaehlt);
      const genau = alle.filter((d) => d.tag === S);
      if (genau.length) return (merk[S] = jeNummer(genau));
      const vor = sitzungen.filter((d) => d < S).pop() || "", danach = sitzungen.filter((d) => d > S)[0] || "";
      const neu = jeNummer(frei.filter((d) => d.datum && d.datum <= S && (!vor || d.datum > vor)));
      let r = neu.length && neu.length <= FOLIEN_MAX ? neu : [];
      if (!r.length && vor) { const v = fuer(vor); r = v.length ? [v[v.length - 1]] : []; }
      if (!r.length && neu.length) r = [neu[0]];
      // erste Sitzung, Folien erst danach angekommen: die kleinste Nummer bis zur nächsten Sitzung
      if (!r.length && !vor) r = jeNummer(frei.filter((d) => !danach || !d.datum || d.datum < danach)).slice(0, 1);
      return (merk[S] = r);
    };
    return aus(fuer(sitzungZu(t)), false);
  };
  // Eine Vorlesungsnotiz → { f, code, nummer, datum, thema, titel, nachgearbeitet }
  const vorlesungVon = (f, index) => {
    const c = (f && app.metadataCache.getFileCache(f)) || {}, fm = c.frontmatter || {};
    const code = text(fm.code), m = code ? modulNach(code) : null;
    const nummer = vorlesungNummer(fm.nummer, f && f.basename);
    const datum = s10(fm.datum) || s10(f && f.basename);
    const modulTitel = m ? m.titel : "";
    let thema = vorlesungThema({ thema: fm.thema, ueberschrift: ((c.headings || [])[0] || {}).heading, modulTitel });
    // Titel der Folien nur, wenn Feld und Überschrift nichts sagen (die Wahl der Folien durchsucht den Tresor)
    const erste = thema ? null : folienVon(f, index).folien[0];
    if (erste) thema = vorlesungThema({ folien: text(erste.fm.titel) || String(erste.f.basename || ""), modulTitel });
    return { f, code, nummer, datum, thema, titel: vorlesungTitel({ nummer, datum, thema, code }), nachgearbeitet: fm.nachgearbeitet === true };
  };
  // Alle Vorlesungsnotizen (eines Moduls), neueste zuerst (Datum, dann Nummer)
  const vorlesungen = (o) => {
    const code = text(o && o.code), index = folienIndex(), aus = [];
    for (const f of app.vault.getMarkdownFiles()) {
      const fm = (app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (fm && fm.typ === "vorlesung" && (!code || text(fm.code) === code)) aus.push(vorlesungVon(f, index));
    }
    return aus.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : (b.nummer || 0) - (a.nummer || 0)));
  };

  // ---------- Abgleich mit System/Einstellungen.md ----------
  const protokoll = ctx.bleibend("protokoll", () => []); // Schreibvorgänge (für Tests), überlebt den Hot-Reload
  // grund: „start“, „änderung …“ und „tag“ (neuer Tag) = von selbst (nur der Abrufer schreibt), sonst ein Tipp auf diesem Gerät
  // (schreibt sofort)
  const vonSelbst = (grund) => /^(start|änderung|tag)/.test(String(grund || ""));
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
  // Neuer Tag (daten() rechnet zum ersten Mal mit einem anderen Datum; sonst prüft registrieren() alle 10 Minuten): Was nur am
  // Datum hängt, ändert sich ohne Dateiänderung – die Zeile „jetzt“, „heute N. FS“, Datumsangaben, bei leerem studienbeginn die
  // ganze Semesterliste (am 1.4. und 1.10.), sonst ihre Verlängerung über das 6. FS hinaus. Darum einmal melden und die Kopien in
  // den Einstellungen nachziehen (von selbst: nur der Abrufer schreibt, und nur bei Abweichung). Erst nach dem laufenden
  // Aufruf, nie mitten in einer Berechnung.
  const tagWechsel = () => {
    Promise.resolve().then(() => { melden(); return abgleichen("tag"); }).catch((e) => console.error("modell: neuer Tag", e));
  };

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
    if (persoenlich) fuss.push(`Studienbeginn ${esc(D.startSemester)}${D.studienbeginnStandard ? " (ändern unter Deine Angaben)" : ""}`);
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
    zeit, termine, terminLesen, terminArt, ortTeilen, pruefungen, pruefungVon, naechstePruefung, fristen, abgaben, uebung: uebungVon, uebungen, blattNummer, opFrist, kalenderwoche, planwoche, findetStatt,
    naechsteSitzung, ausfaelle, imPlan, ects, noten, blockVon, statusArt, istZwischentest, istNachhol, modul: modulNach, besuchSchluessel, besuchtNicht,
    vorlesung: vorlesungVon, vorlesungen, vorlesungTitel, vorlesungThema, vorlesungNummer, folien: folienVon,
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
    // Neuer Tag, ohne dass ein Bildschirm daten() fragt (Obsidian über Nacht offen): daten() bemerkt ihn und meldet (tagWechsel)
    ctx.intervall(() => { if (cacheTag && heuteIso() !== cacheTag) daten(); }, 10 * 60e3);
  };

  // Einmal beim App-Start: wenn der metadataCache fertig ist, abgleichen (schreibt nur bei Abweichung).
  const start = () => {
    const los = () => ctx.zeit(() => { abgleichen("start").catch((e) => console.error("modell: abgleichen", e)); }, 3000);
    if (app.metadataCache.resolved) los();
    else { const r = ctx.an(app.metadataCache, "resolved", () => { app.metadataCache.offref(r); los(); }); }
  };

  return { registrieren, start };
};
