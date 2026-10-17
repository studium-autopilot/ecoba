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
// Dieselbe Regel steht als Bases-Formel „wochetext“ im Dashboard.
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
  const RELEVANT = /^(System\/Einstellungen\.md|System\/Daten\/|Module\/|Termine\/|Stundenplan\/)/;

  // ---------- Datum ----------
  const pad = (n) => String(n).padStart(2, "0");
  const s10 = (v) => { const m = String(v == null ? "" : v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ""; };
  const isoVon = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tagObj = (s) => { const t = s.split("-").map(Number); return new Date(t[0], t[1] - 1, t[2]); };
  const plusTage = (s, n) => { const d = tagObj(s); d.setDate(d.getDate() + n); return isoVon(d); };
  const heuteIso = () => ctx.date.now("YYYY-MM-DD");
  const fmVon = (pfad) => { const f = app.vault.getAbstractFileByPath(pfad); return (f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter) || {}; };
  const geschaetzt = (s) => /gesch/i.test(String(s || ""));

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
    const module = [], termine = [], stundenplan = [];
    for (const f of app.vault.getMarkdownFiles()) {
      const c = app.metadataCache.getFileCache(f), fm = c && c.frontmatter;
      if (!fm) continue;
      if (fm.typ === "modul" && f.path.startsWith("Module/")) {
        const eigen = String(fm.semester_geplant == null ? "" : fm.semester_geplant).trim(), muster = musterSemester(fm);
        module.push({
          f, fm, code: String(fm.code || f.basename.split(" ")[0]), titel: String(fm.titel || f.basename), gruppe: String(fm.gruppe || ""),
          fs: Number(fm.fachsemester) || null, fsEmpfohlen: musterFs(fm), status: String(fm.status || "offen").toLowerCase().trim(),
          semester: eigen || muster, semesterQuelle: eigen ? "eigen" : muster ? "musterplan" : "", musterplan: muster,
        });
      } else if (fm.typ === "termin") termine.push({ f, fm });
      else if (fm.typ === "lehrveranstaltung" && f.path.startsWith("Stundenplan/")) stundenplan.push({ f, fm });
    }
    return {
      heute, zentral: Z, einstellungen: ein,
      name: String(ein.name == null ? "" : ein.name).trim(), variante, zielnote: String(ein.zielnote == null ? "" : ein.zielnote).trim(),
      studienbeginn, studienbeginnStandard: !studienbeginn, startSemester: liste.length ? liste[0].name : semesterAusDatum(heute),
      semesterliste: liste, aktuell, fachsemester: aktuell ? aktuell.fs : 1, vorStart,
      pausen: Z.pausen, freieTage: Z.freieTage, pruefungsphasen: Z.phasen, rueckmeldung: Z.rueckmeldung,
      module, termine, stundenplan, musterSemester, musterFs, musterplanVariante: plan ? plan.id : "",
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
      const w = W.wochen.filter((x) => x.mo <= d && x.nr).pop();
      aus.nr = w ? w.nr : 1;
      aus.text = `Vorlesungswoche ${aus.nr} von ${aus.gesamt}` + (aus.phase ? " · Prüfungsphase" : "");
    } else { aus.art = "frei"; aus.text = "vorlesungsfrei"; }
    return aus;
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
  const api = { blockArgument, daten, ungueltig, semesterVon, semesterNachName, semesterAusDatum, naechster, voriger, modulSemester, semesterAuswahl, vorschau, abgleichen, beiAenderung, protokoll, woche, vorlesungswochen, semesterFuer };
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
