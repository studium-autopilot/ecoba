// Studienverlauf-Visualisierung „Studienreise“.
// Codeblock ```eba-verlauf``` auf Studium/Studienverlauf.md. Zeichnet live per JavaScript (schreibt keine Datei, kein Sync-Verkehr):
//   Reise     Kopfkarte: Fachsemester, Tag x von y des Studiums (zählt hoch), die Bahn als SVG – PC/iPad eine
//             Welle, iPhone eine Schlange (ein Studienjahr je Zeile) – mit 6 Stationen (Semesteranfang, kleiner ECTS-Ring:
//             blass geplant, voll bestanden; Beschriftung vorbei/jetzt „x / 30 ECTS“, später nur „n geplant“), zurückgelegtem
//             Weg (zeichnet sich ein), Meilensteinen (Rauten), Nadel „Du bist hier“ mit Puls und Doktorhut als Ziel; darunter
//             die Bilanz in einer Zeile (ECTS ist/geplant, Orientierungsprüfung als 4 Punkte) und der Fuß (nächster
//             Meilenstein, Prognose Abschluss). Nächste Prüfung, Notenschnitt und die Wochenleiste stehen auf dem Dashboard
//             und hier nicht doppelt (die Wochenleiste „Semester-Puls“ entfiel am 17.10.2026: die Lupe zeigt dasselbe Semester).
//   Lupe      das gewählte Semester (Station antippen): Titel, ECTS, im laufenden Semester Vorlesungswoche und
//             Resttage der Vorlesungszeit, Meilensteine des Semesters, Band mit Monaten, Prüfungen als Fähnchen (dicht
//             liegende werden zu einem Fähnchen „n Klausuren 30.01.–12.02.“ zusammengefasst, Einzelheiten in der Liste),
//             Module mit Countdown.
// Daten: System/Einstellungen.md (semesterliste, pausen, pruefungsphasen, variante), Modulnotizen (typ: modul,
// semester_geplant, ects, status, ergebnis, klausur, op_modul, rolle_*, gewaehlt, zusatz),
// Termine mit kategorie „Prüfung“ (eintägig, ohne Nachholtermine, z. B. Zwischentests), SQ-Kurse (typ: sq_kurs).
// Rechenregeln wie auf der Seite Noten & ECTS: ECTS = bestandene/anerkannte Module ohne Zusatz + SQ-Kurse (höchstens 9, solange
// SQ100 offen). Fehlendes erscheint als „offen“.
// Nur richtige Daten (Vorgabe vom 17.10.2026): Semester, Pausen und Prüfungsphasen tragen aus den zentralen Daten status
// (offiziell | geschätzt) und hinweis. Geschätztes ist überall markiert – „ca.“ vor Daten und Zahlen, die daraus folgen
// (Abschluss, Resttage, Vorlesungswochen, Frist der Orientierungsprüfung), Streifen und „(geschätzt)“ in Band und Legende
// der Lupe, der Hinweis als Tooltip und als Zeile in der Lupe (auch ohne Maus lesbar). Offizielles bleibt unmarkiert.
// iOS: Das Plugin lädt jedes Skript einzeln; ein Syntaxfehler legt trotzdem dieses Skript lahm. Daher keine Syntax neuer als Safari 16.0
// (kein Lookbehind, kein .at()/findLast/structuredClone). Die Bahn rechnet ihre Geometrie selbst (misst nichts im DOM).
// Jeder Fehler beim Zeichnen zeigt den Text des Codeblocks (Fallback), die Seite läuft weiter.
// Erweiterung: registrieren() meldet Codeblock, Ereignisse und Uhr über die Helfer in ctx an. Das Plugin hat je Sprache
// einen Prozessor, der immer die aktuell geladene Fassung ruft; neuer Code gilt also sofort nach dem Hot-Reload.
// Wochen: „Vorlesungswoche X von Y“ kommt aus ctx.modell.woche() (eine Regel
// für Dashboard, Studienverlauf und Vorlesungsnotiz). Stil: eba-core.css Abschnitt 38 (Klassen eba-vl-*).
module.exports = function (ctx) {
  const app = window.app;
  const SPRACHE = "eba-verlauf";
  const ROLLE = { "Economics": "rolle_economics", "Business Administration": "rolle_ba", "ohne Spezialisierung": "rolle_ohne" };
  const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

  // ---------- Hilfen ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pad = (n) => String(n).padStart(2, "0");
  const tag = (v) => { const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const heute = () => { const d = ctx.date.jetzt(); d.setHours(0, 0, 0, 0); return d; };
  const isoVon = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const M = () => (ctx.modell && ctx.modell.woche ? ctx.modell : null); // Datenmodell (modell.js), falls geladen
  const tage = (a, b) => Math.round((b - a) / 864e5);
  const dm = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  const dmy = (d) => `${dm(d)}${String(d.getFullYear()).slice(2)}`;
  const wdm = (d) => `${WT[d.getDay()]} ${dm(d)}`;
  const zahl = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : 0; };
  const norm = (v) => String(v ?? "").toLowerCase().trim();
  const fertig = (st) => ["bestanden", "anerkannt"].includes(norm(st));
  const relativ = (n) => (n === 0 ? "heute" : n === 1 ? "morgen" : n > 1 ? `in ${n} Tagen` : n === -1 ? "gestern" : `vor ${-n} Tagen`);
  const anteil = (d, a, b) => Math.max(0, Math.min(1, (d - a) / (b - a)));
  const pct = (x) => `${(x * 100).toFixed(3)}%`;
  const kurzSem = (n) => String(n).replace(/(\d{2})(\d{2})\/(\d{2})$/, "$2/$3").replace(/SS (\d{2})(\d{2})$/, "SS $2");
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  const ruhig = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // Unsicherheit zeigen: „ca. “ vor einem Datum oder einer Zahl aus geschätzten Semesterdaten; Zusatz für Tooltips
  const ca = (o) => (o && o.geschaetzt ? "ca. " : "");
  const unsicher = (o) => (o && o.geschaetzt ? ` (geschätzt${o.hinweis ? `: ${o.hinweis}` : ""})` : "");

  // ---------- Daten lesen ----------
  const lesen = () => {
    const ef = app.vault.getAbstractFileByPath("System/Einstellungen.md");
    const c = Object.assign({}, (ef && app.metadataCache.getFileCache(ef)?.frontmatter) || {});
    const zerlege = (liste) => (Array.isArray(liste) ? liste : []).map((z) => String(z).split("|").map((x) => x.trim()));
    // Datenmodell (modell.js): Semesterliste aus Studienbeginn + zentralen Semesterdaten, Musterplan-Semester der Module.
    // Ohne Modell wie bisher aus System/Einstellungen.md.
    const md = ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null;
    const g = (o) => ({ geschaetzt: o.status === "geschätzt", hinweis: String(o.hinweis || "") });
    let sems, pausen, phasen;
    if (md) {
      // Datenmodell: mit Status (offiziell | geschätzt) und Hinweis der zentralen Daten (Semester nach Regel: geschätzt)
      sems = md.semesterliste.map((s) => Object.assign({ fs: s.fs, name: s.name, sb: tag(s.beginn), se: tag(s.ende), vb: tag(s.vb), ve: tag(s.ve) }, g(s)));
      pausen = md.pausen.map((p) => Object.assign({ von: tag(p.von), bis: tag(p.bis), name: p.name || "Pause" }, g(p)));
      phasen = md.pruefungsphasen.map((p) => Object.assign({ von: tag(p.von), bis: tag(p.bis), art: p.art || "Prüfungen" }, g(p)));
    } else {
      sems = zerlege(c.semesterliste).filter((p) => p.length >= 6).map((p) => ({ fs: +p[0], name: p[1], sb: tag(p[2]), se: tag(p[3]), vb: tag(p[4]), ve: tag(p[5]), geschaetzt: false, hinweis: "" }));
      pausen = zerlege(c.pausen).map((p) => ({ von: tag(p[0]), bis: tag(p[1]), name: p[2] || "Pause", geschaetzt: false, hinweis: "" }));
      phasen = zerlege(c.pruefungsphasen).map((p) => ({ von: tag(p[0]), bis: tag(p[1]), art: p[2] || "Prüfungen", geschaetzt: /gesch/i.test(p[3] || ""), hinweis: "" }));
    }
    sems = sems.filter((s) => s.sb && s.se && s.se > s.sb);
    pausen = pausen.filter((p) => p.von && p.bis);
    phasen = phasen.filter((p) => p.von && p.bis);
    const variante = String(c.variante ?? "").trim() || "offen";
    const module = [], termine = [];
    let sq = 0;
    for (const f of app.vault.getMarkdownFiles()) {
      const fm = app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm) continue;
      if (fm.typ === "modul") {
        // sem: eigene Planung, sonst Musterplan der Variante (modell.js); semFs: Semester nach dem Feld fachsemester, nur für
        // die Liste „Wählbar, nicht im Plan“ (Module, die im Musterplan deiner Variante nicht vorkommen)
        const fsZahl = Number(fm.fachsemester);
        const semFs = md && fm.gruppe !== "Schwerpunkt" && fsZahl >= 1 && md.semesterliste[fsZahl - 1] ? md.semesterliste[fsZahl - 1].name : "";
        module.push({
          pfad: f.path, code: String(fm.code ?? f.basename.split(" ")[0]), titel: String(fm.titel ?? f.basename), ects: zahl(fm.ects),
          sem: md ? ctx.modell.modulSemester(fm) : String(fm.semester_geplant ?? "").trim(), semFs, status: norm(fm.status) || "offen", ergebnis: String(fm.ergebnis ?? "").trim(),
          klausur: tag(fm.klausur), op: fm.op_modul === true, zusatz: fm.zusatz === true, gewaehlt: fm.gewaehlt === true,
          gruppe: String(fm.gruppe ?? ""),
          pruefung: String(fm.pruefung ?? ""), rolle_economics: fm.rolle_economics, rolle_ba: fm.rolle_ba, rolle_ohne: fm.rolle_ohne,
        });
      } else if (fm.typ === "termin" && fm.kategorie === "Prüfung") {
        const d = tag(fm.datum), b = tag(fm.bis);
        const titel = String(fm.titel ?? f.basename.replace(/^\d{4}-\d{2}-\d{2}\s*/, ""));
        if (!d || (b && b > d) || /nachhol/i.test(titel) || /nachhol/i.test(f.basename)) continue;
        termine.push({ datum: d, titel, code: String(fm.code ?? "").trim(), geschaetzt: /gesch/i.test(String(fm.status ?? "")), pfad: f.path });
      } else if (fm.typ === "sq_kurs" && fertig(fm.status)) sq += zahl(fm.ects);
    }
    module.sort((a, b) => a.code.localeCompare(b.code, "de"));
    return { c, sems, pausen, phasen, variante, module, termine, sq };
  };

  // ---------- Rechnen ----------
  const rechnen = (D) => {
    const t = heute();
    const v = D.variante, rk = ROLLE[v];
    // Rolle im Plan: fest = zählt sicher; variante = hängt von der noch offenen Variante ab; wahl = Wahlmodul, nicht gewählt
    const art = (m) => {
      if (m.zusatz) return "zusatz";
      if (m.gruppe !== "Profil & Vertiefung" || m.gewaehlt) return "fest";
      if (rk) return m[rk] === "Pflicht" ? "fest" : "wahl";
      return ["rolle_economics", "rolle_ba", "rolle_ohne"].every((k) => m[k] === "Pflicht") ? "fest" : "variante";
    };
    for (const m of D.module) { m.art = art(m); m.fertig = fertig(m.status); }
    const gezaehlt = D.module.filter((m) => m.fertig && !m.zusatz);
    const sq100 = D.module.find((m) => m.code === "SQ100");
    const sqteil = sq100 && !sq100.fertig ? Math.min(9, D.sq) : 0;
    const ects = gezaehlt.reduce((a, m) => a + m.ects, 0) + sqteil;
    // Orientierungsprüfung (§§ 8, 11 BT): 4 der OP-Module bis Ende des 4. Fachsemesters
    const opModule = D.module.filter((m) => m.op);
    const op = Math.min(4, opModule.filter((m) => m.fertig).length);
    // Semester
    const sems = D.sems.map((s, i) => {
      const ms = D.module.filter((m) => m.sem === s.name || (!m.sem && (m.art === "wahl" || m.art === "variante") && m.semFs === s.name));
      const fest = ms.filter((m) => m.art === "fest");
      const plan = fest.reduce((a, m) => a + m.ects, 0);
      const ist = ms.filter((m) => m.fertig && !m.zusatz).reduce((a, m) => a + m.ects, 0);
      const variante = ms.filter((m) => m.art === "variante" || m.art === "wahl");
      return { ...s, i, module: ms, fest, plan, ist, variante, vorbei: s.se < t, jetzt: s.sb <= t && t <= s.se };
    });
    let cur = sems.findIndex((s) => s.jetzt);
    const vorStart = sems.length && t < sems[0].sb;
    const nachEnde = sems.length && t > sems[sems.length - 1].se;
    // Prüfungen (Fähnchen): eintägige Prüfungs-Termine (z. B. Zwischentests) und Klausurtermine der Module. Kürzel + Tag nur
    // einmal; die Termin-Notiz gewinnt, „bestanden“ kommt vom Modul (docs/architektur.md „Nächste Prüfung“)
    const pruef = [];
    // Zwischentests (Titel enthält „Zwischentest“, wie klausurzeit.js) sind nie die nächste Prüfung und verdecken keine Klausur
    const gleicherTag = (code, d, test = false) => pruef.find((p) => p.code && p.code === code && +p.datum === +d && !!p.test === test);
    for (const x of D.termine) {
      const test = /zwischentest/i.test(x.titel);
      if (gleicherTag(x.code, x.datum, test)) continue;
      const n = x.titel.match(/Zwischentest\s*(\d+)/i);
      const label = (x.code ? x.code + " " : "") + (n ? `Zwischentest ${n[1]}` : test ? "Zwischentest" : x.code ? "Prüfung" : x.titel.slice(0, 16));
      const m = D.module.find((mm) => mm.code === x.code);
      // haupt: Klausur des Moduls aus einer Termin-Notiz (kein Zwischentest) – gilt in der Modulliste der Lupe als Prüfungstermin
      pruef.push({ datum: x.datum, code: x.code, label, titel: x.titel, pfad: x.pfad, erledigt: x.datum < t, art: "test", geschaetzt: x.geschaetzt, modul: m, haupt: !!m && !test, test });
    }
    for (const m of D.module) if (m.klausur && !m.zusatz) {
      const p = gleicherTag(m.code, m.klausur);
      if (p) Object.assign(p, { label: m.code, art: "klausur", erledigt: m.fertig, modul: m });
      else pruef.push({ datum: m.klausur, code: m.code, label: m.code, titel: `${m.code} ${m.titel}`, pfad: m.pfad, erledigt: m.fertig, art: "klausur", modul: m });
    }
    pruef.sort((a, b) => a.datum - b.datum);
    const naechste = pruef.find((p) => p.datum >= t && !p.erledigt && !p.test);
    // Meilensteine (Quelle: Regeln auf der Seite Studienverlauf)
    const ms = [];
    const sFS = (n) => sems.find((s) => s.fs === n);
    if (sFS(3)) ms.push({ datum: sFS(3).sb, fs: 3, titel: "Variante wählen", info: v === "offen" ? "noch offen · vor dem 3. Fachsemester wählen" : v, ok: v !== "offen", art: "wahl" });
    if (sFS(4)) ms.push({ datum: sFS(4).se, fs: 4, titel: "Orientierungsprüfung", info: `${op} / 4 · bis ${ca(sFS(4))}${dmy(sFS(4).se)}`, ok: op >= 4, art: "frist" });
    if (sFS(5)) ms.push({ datum: new Date((+sFS(5).sb + +sFS(5).se) / 2), fs: 5, titel: "Auslandssemester", info: "empfohlen", ok: null, art: "option" });
    const ba = D.module.find((m) => m.code === "BA302");
    const sBA = sems.find((s) => ba && s.name === ba.sem) || sFS(6);
    if (sBA) ms.push({ datum: sBA.vb || sBA.sb, fs: sBA.fs, titel: "Bachelorarbeit", info: ba?.fertig ? (ba.ergebnis ? `Note ${ba.ergebnis}` : "bestanden") : `${ba?.ects || 12} ECTS`, ok: !!ba?.fertig, art: "ba", pfad: ba?.pfad });
    const sl = sems[sems.length - 1];
    if (sl) ms.push({ datum: sl.se, fs: sl.fs, titel: "Abschluss B.Sc.", info: `${ca(sl)}${dmy(sl.se)} · 180 ECTS`, ok: ects >= 180, art: "ziel" });
    for (const m of ms) m.vorbei = m.datum < t;
    return { t, sems, cur, vorStart, nachEnde, ects, op, opModule, pruef, naechste, ms, variante: v };
  };

  // Vorlesungswoche heute („Vorlesungswoche 1 von 16“), nur in der Vorlesungszeit. Eine Regel für alle Seiten:
  // ctx.modell.woche() (Vorlesungswochen ohne Pausenwochen); ohne Modell die alte Rechnung
  const vorlesungswoche = (D, R) => {
    const t = R.t, s = R.sems[R.cur];
    if (!s) return "";
    const W = M() ? M().woche(isoVon(t)) : null;
    if (W && W.art) return W.art === "vorlesung" ? `Vorlesungswoche ${W.nr} von ${ca(s)}${W.gesamt}` : "";
    if (D.pausen.some((p) => p.von <= t && t <= p.bis) || D.phasen.some((p) => p.von <= t && t <= p.bis)) return "";
    if (!s.vb || !s.ve || t < s.vb || t > s.ve) return "";
    return `Vorlesungswoche ${Math.floor(tage(s.vb, t) / 7) + 1} von ${ca(s)}${Math.ceil((tage(s.vb, s.ve) + 1) / 7)}`;
  };
  // Band eines Semesters: Vorlesungszeit, vorlesungsfrei, Pausen, Prüfungsphasen (mit Beschriftung, wenn Platz ist)
  const band = (D, s, R, beschriftet) => {
    const ende = new Date(+s.se + 864e5);
    const x = (d) => anteil(d, s.sb, ende);
    const teil = (a, b, cls, label, title) => {
      const l = x(a), r = x(new Date(+b + 864e5));
      if (r <= l) return "";
      return `<span class="eba-vl-b ${cls}" style="left:${pct(l)};width:${pct(r - l)}" title="${esc(title)}">${beschriftet && label ? `<i>${esc(label)}</i>` : ""}</span>`;
    };
    let h = "";
    const gk = (o) => (o.geschaetzt ? " geschaetzt" : "");
    if (s.vb && s.ve) h += teil(s.vb, s.ve, "vl" + gk(s), "Vorlesungszeit", `Vorlesungszeit ${dmy(s.vb)} – ${dmy(s.ve)}${unsicher(s)}`);
    for (const p of D.pausen) if (p.bis >= s.sb && p.von <= s.se) h += teil(p.von < s.sb ? s.sb : p.von, p.bis > s.se ? s.se : p.bis, "pause" + gk(p), p.name, `${p.name} ${dm(p.von)} – ${dm(p.bis)}${unsicher(p)}`);
    for (const p of D.phasen) if (p.bis >= s.sb && p.von <= s.se) h += teil(p.von < s.sb ? s.sb : p.von, p.bis > s.se ? s.se : p.bis, "pruef" + gk(p), "Prüfungen", `${p.art} ${dm(p.von)} – ${dm(p.bis)}${unsicher(p)}`);
    const t = R.t;
    const weg = s.se < t ? 1 : s.sb > t ? 0 : x(new Date(+t + 864e5 / 2));
    if (weg > 0) h += `<span class="eba-vl-weg" style="--w:${pct(weg)};--v:${(s.i * 0.18).toFixed(2)}s"></span>`;
    return { html: h, x, weg };
  };

  // ---------- Reise: Kennzahlen für den Kopf ----------
  const reiseDaten = (R) => {
    const t = R.t, s0 = R.sems[0], sn = R.sems[R.sems.length - 1];
    const gesamt = tage(s0.sb, sn.se) + 1;
    const tagNr = Math.max(0, Math.min(gesamt, tage(s0.sb, t) + 1));
    const rest = tage(t, sn.se);
    const plan = R.sems.reduce((a, s) => a + s.plan, 0);
    const fertigSem = R.sems.filter((s) => s.vorbei).length;
    let prognose;
    if (R.ects > 0 && fertigSem > 0) {
      const tempo = R.ects / fertigSem, n = Math.ceil(180 / tempo);
      prognose = n <= R.sems.length ? `im Plan · Abschluss ${esc(sn.name)}` : `bei ${Math.round(tempo)} ECTS je Semester ca. ${n} Semester`;
    } else prognose = `Regelstudienzeit · Abschluss ${ca(sn)}${dmy(sn.se)}`;
    const naechsterMs = R.ms.find((m) => m.datum >= t && !m.ok && m.art !== "ziel");
    return { gesamt, tagNr, rest, plan, prognose, naechsterMs };
  };

  // ---------- Reise: Bahn (eigene Geometrie, misst nichts im DOM, daher auch in versteckten Ansichten) ----------
  const linie = (x0, y0, x1, y1) => ({ n: 2, f: (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u] });
  const bogen = (cx, cy, r, a0, a1) => ({ n: 36, f: (u) => { const a = ((a0 + (a1 - a0) * u) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; } });
  const kurve = (x0, y0, x1, y1, x2, y2, x3, y3) => ({ n: 40, f: (u) => { const v = 1 - u; return [v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3]; } });
  const bahn = (teile) => {
    const P = [], C = [], K = [0];
    let len = 0;
    const add = (p) => { if (P.length) { const q = P[P.length - 1]; len += Math.hypot(p[0] - q[0], p[1] - q[1]); } P.push(p); C.push(len); };
    for (const sem of teile) {
      for (const pr of sem) for (let k = P.length ? 1 : 0; k <= pr.n; k++) add(pr.f(k / pr.n));
      K.push(len);
    }
    const at = (s) => {
      s = Math.max(0, Math.min(len, s));
      let lo = 0, hi = C.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (C[m] <= s) lo = m; else hi = m; }
      const u = (s - C[lo]) / ((C[hi] - C[lo]) || 1);
      return [P[lo][0] + (P[hi][0] - P[lo][0]) * u, P[lo][1] + (P[hi][1] - P[lo][1]) * u];
    };
    return { d: "M" + P.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L"), L: len, K, at };
  };
  // iPhone: Schlange, ein Studienjahr je Zeile (WS links → SS rechts, dann Kehre)
  const bahnSchmal = (n) => {
    const X = [56, 180, 304], R0 = 46, Y = (r) => 46 + r * 2 * R0, teile = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / 2), j = i % 2, y = Y(r), vor = r % 2 === 0;
      const xa = vor ? X[j] : X[2 - j], xb = vor ? X[j + 1] : X[1 - j];
      const t = [linie(xa, y, xb, y)];
      if (j === 1 && i < n - 1) t.push(vor ? bogen(X[2], y + R0, R0, -90, 90) : bogen(X[0], y + R0, R0, 270, 90));
      teile.push(t);
    }
    const B = bahn(teile);
    B.W = 360; B.H = Y(Math.floor((n - 1) / 2)) + 60; B.schmal = true;
    return B;
  };
  // PC/iPad: eine Welle, Stationen abwechselnd oben/unten
  const bahnBreit = (n) => {
    const x = (i) => 60 + (i * 880) / n, y = (i) => (i % 2 ? 114 : 64), teile = [];
    for (let i = 0; i < n; i++) {
      const dx = x(i + 1) - x(i);
      teile.push([kurve(x(i), y(i), x(i) + dx * 0.5, y(i), x(i + 1) - dx * 0.5, y(i + 1), x(i + 1), y(i + 1))]);
    }
    const B = bahn(teile);
    B.W = 1000; B.H = 178; B.schmal = false;
    return B;
  };
  // Datum → Strecke auf der Bahn (jedes Semester = ein Abschnitt zwischen zwei Stationen)
  const stelle = (R, B, d) => {
    const S = R.sems;
    if (d < S[0].sb) return 0;
    for (let i = 0; i < S.length; i++) if (d <= S[i].se) return B.K[i] + anteil(d, S[i].sb, new Date(+S[i].se + 864e5)) * (B.K[i + 1] - B.K[i]);
    return B.L;
  };

  const MSKURZ = { "Variante wählen": "Variante", "Orientierungsprüfung": "Orientierung", "Auslandssemester": "Ausland", "Bachelorarbeit": "Bachelorarbeit", "Abschluss B.Sc.": "B.Sc." };
  // Beschriftung unter der Station: vorbei und jetzt „x / 30 ECTS“ (jetzt, breit: dazu „· n geplant“), später nur „n geplant“
  // oder „offen“ – der Ring zeigt den Plan ohnehin, und sechsmal „0 / 30 ECTS“ sagt nichts
  const stEcts = (s, schmal) => (s.vorbei || s.jetzt ? `${s.ist} / 30 ECTS${!schmal && s.jetzt && s.plan && s.plan !== s.ist ? ` · ${s.plan} geplant` : ""}` : s.plan ? `${s.plan} geplant` : "offen");
  const strasse = (D, R, B, sel) => {
    const f = (v) => v.toFixed(1);
    const n = R.sems.length;
    const heuteS = R.vorStart ? 0 : R.nachEnde ? B.L : stelle(R, B, new Date(+R.t + 864e5 / 2));
    const p = B.L ? (heuteS / B.L) * 1000 : 0;
    let h = `<svg class="eba-vl-svg ${B.schmal ? "schmal" : "breit"}" viewBox="0 0 ${B.W} ${B.H}" role="group" aria-label="Studienverlauf: ${n} Semester, heute ${esc(wdm(R.t))}">`;
    h += `<path class="eba-vl-rest" d="${B.d}"/>`;
    h += `<path class="eba-vl-glut" d="${B.d}" pathLength="1000" style="stroke-dashoffset:${f(1000 - p)}"/>`;
    h += `<path class="eba-vl-strich" d="${B.d}" pathLength="1000" style="stroke-dashoffset:${f(1000 - p)}"/>`;
    // Meilensteine (ohne Abschluss, den zeigt das Ziel); auf einer Station → ein Stück weiter
    const fs = B.schmal ? 9.5 : 11.5;
    // Beschriftungen ohne Überlappung: belegte Kästen merken (Stationsnamen, Nadel), Meilenstein-Text sonst unter die Bahn
    const belegt = [];
    const frei = (x, y, w, hh) => !belegt.some((b) => Math.abs(b[0] - x) < (b[2] + w) / 2 + 2 && Math.abs(b[1] - y) < (b[3] + hh) / 2);
    const fz = B.schmal ? 9.5 : 11;
    R.sems.forEach((s, i) => {
      const q = B.at(B.K[i]), unten = B.schmal || i % 2 === 1;
      const lang = Math.max(kurzSem(s.name).length, stEcts(s, B.schmal).length);
      belegt.push([q[0], unten ? q[1] + 38 : q[1] - 34, Math.max(50, lang * fz * 0.56), 26]);
      belegt.push([q[0], q[1], 30, 30]);
    });
    { const q = B.at(B.L); belegt.push([q[0], q[1], 40, 40]); }
    let pinUnten = false, pinBi = -1;
    if (!R.nachEnde) {
      const q = B.at(heuteS);
      if (!B.schmal) { let bi = 0; B.K.forEach((k, i) => { if (Math.abs(k - heuteS) < Math.abs(B.K[bi] - heuteS)) bi = i; }); pinUnten = bi % 2 === 0 && Math.abs(B.K[bi] - heuteS) < 90; if (pinUnten) pinBi = bi; }
      belegt.push([q[0] + 40, pinUnten ? q[1] + 24 : q[1] - 22, 110, 22]);
    }
    // erst alle Rauten setzen (auch sie dürfen nicht überschrieben werden), dann die Texte
    const rauten = [];
    for (const m of R.ms) {
      if (m.art === "ziel") continue;
      let s = stelle(R, B, m.datum), rand = 0;
      for (const k of B.K) if (Math.abs(s - k) < 24) { s = k + (B.schmal ? 26 : 40); rand = 1; }
      const q = B.at(s);
      rauten.push({ m, s, rand, x: q[0], y: q[1] });
      belegt.push([q[0], q[1], 12, 12]);
    }
    for (const r of rauten) {
      const { m, s, rand, x, y } = r;
      // nach einer Station: Text läuft in Fahrtrichtung von der Station weg
      const q2 = B.at(s + 2), rechts = q2[0] >= x;
      const anker = rand ? (rechts ? "start" : "end") : "middle";
      const label = MSKURZ[m.titel] || m.titel, lw = label.length * fs * 0.56;
      const tx = anker === "start" ? x - 3 : anker === "end" ? x + 3 : x;
      const mx = anker === "start" ? tx + lw / 2 : anker === "end" ? tx - lw / 2 : tx;
      const runter = q2[1] > y + 0.2, hoch = q2[1] < y - 0.2;
      const zuerstOben = B.schmal || (rechts ? runter : hoch) || (!runter && !hoch && y > 90);
      let ty = null;
      for (const o of zuerstOben ? [y - 11, y + 21] : [y + 21, y - 11]) if (ty === null && frei(mx, o - fs / 3, lw, fs + 2)) ty = o;
      if (ty !== null) belegt.push([mx, ty - fs / 3, lw, fs + 2]);
      h += `<g class="eba-vl-ms ${m.art}${m.ok ? " ok" : ""}${m.vorbei ? " vorbei" : ""}"${m.pfad ? ` data-pfad="${esc(m.pfad)}"` : ""}><title>${esc(m.titel)} · ${esc(m.info)}</title>`
        + `<rect x="${f(x - 4.5)}" y="${f(y - 4.5)}" width="9" height="9" transform="rotate(45 ${f(x)} ${f(y)})"/>`
        + (ty !== null ? `<text x="${f(tx)}" y="${f(ty)}" style="font-size:${fs}px;text-anchor:${anker}">${esc(label)}</text>` : "")
        + `</g>`;
    }
    // Stationen = Semesteranfänge, mit kleinem ECTS-Ring (blass = geplant, voll = bestanden)
    R.sems.forEach((s, i) => {
      const [x, y] = B.at(B.K[i]);
      const cls = s.jetzt ? "jetzt" : s.vorbei ? "vorbei" : "spaeter";
      const pl = Math.min(100, (s.plan / 30) * 100), ist = Math.min(100, (s.ist / 30) * 100);
      const unten = B.schmal || i % 2 === 1;
      const ly = unten ? y + 34 : y - 37 - (i === pinBi ? 12 : 0); // Nadel steht davor: Beschriftung etwas höher
      h += `<g class="eba-vl-st s${i} ${cls}${i === sel ? " gewaehlt" : ""}" data-sem="${i}" role="button" tabindex="0" aria-pressed="${i === sel}" aria-label="${s.fs}. Fachsemester ${esc(s.name)}, ${s.ist} von 30 ECTS">`
        + `<g class="eba-vl-knoten" style="--v:${(0.25 + i * 0.16).toFixed(2)}s" transform="translate(${f(x)} ${f(y)})">`
        + `<circle class="wahl" r="20"/><circle class="grund" r="15"/><circle class="spur" r="11"/>`
        + (pl ? `<circle class="plan" r="11" pathLength="100" style="stroke-dasharray:${f(pl)} 100"/>` : "")
        + (ist ? `<circle class="ist" r="11" pathLength="100" style="stroke-dasharray:${f(ist)} 100"/>` : "")
        + `<text class="nr" y="4">${s.fs}</text></g>`
        + `<text class="eba-vl-stname" x="${f(x)}" y="${f(ly)}">${esc(kurzSem(s.name))}</text>`
        + `<text class="eba-vl-stects" x="${f(x)}" y="${f(ly + (B.schmal ? 12 : 14))}">${stEcts(s, B.schmal)}</text>`
        + `</g>`;
    });
    // Ziel: Doktorhut
    const [gx, gy] = B.at(B.L);
    const sn = R.sems[n - 1];
    const gunten = B.schmal || n % 2 === 1;
    h += `<g class="eba-vl-ziel${R.ects >= 180 ? " ok" : ""}"><title>Abschluss B.Sc. · ${ca(sn)}${dmy(sn.se)} · 180 ECTS${unsicher(sn)}</title><g class="eba-vl-knoten" style="--v:${(0.3 + n * 0.16).toFixed(2)}s" transform="translate(${f(gx)} ${f(gy)})">`
      + `<circle class="hof" r="21"/><circle class="grund" r="16"/>`
      + `<path class="hut" d="M-10 -3L0 -8L10 -3L0 2Z"/><path class="hut" d="M-5.5 0V4.5Q0 8 5.5 4.5V0L0 2.5Z"/><path class="quaste" d="M10 -3V4"/></g>`
      + `<text class="eba-vl-stname" x="${f(gx)}" y="${f(gunten ? gy + 35 : gy - 39)}">B.Sc.</text>`
      + `<text class="eba-vl-stects" x="${f(gx)}" y="${f(gunten ? gy + 35 + (B.schmal ? 12 : 14) : gy - 25)}">${ca(sn)}${dmy(sn.se)}</text></g>`;
    // Du bist hier: Nadel mit Puls
    if (!R.nachEnde) {
      const [px, py] = B.at(heuteS);
      const txt = "Du bist hier", tw = txt.length * (B.schmal ? 5.6 : 6.4) + 14;
      const links = px + 12 + tw > B.W - 4, sy = pinUnten ? 14 : -31;
      const lx = links ? -12 - tw : 12;
      h += `<g class="eba-vl-nadel" transform="translate(${f(px)} ${f(py)})"><g class="fall">`
        + `<circle class="welle" r="7"/><circle class="welle w2" r="7"/>`
        + `<path class="kopf" d="M0 0C-2 -6 -8 -12 -8 -19A8 8 0 1 1 8 -19C8 -12 2 -6 0 0Z"/><circle class="auge" cy="-19" r="3.2"/>`
        + `<g class="schild"><rect x="${f(lx)}" y="${sy}" width="${f(tw)}" height="17" rx="8.5"/><text x="${f(lx + tw / 2)}" y="${sy + 12}">${txt}</text></g>`
        + `</g></g>`;
    }
    return h + `</svg>`;
  };

  // Posten der Bilanz: Zahl im Satz („60 von 180 ECTS“), kleine Grafik, Zeile darunter – keine Kästen in der Karte
  const posten = (z, s, p, grafik) => `<div class="eba-vl-posten"${p ? ` data-pfad="${esc(p)}" role="link" tabindex="0"` : ""}><span class="z">${z}</span>${grafik || ""}<span class="s">${s}</span></div>`;

  const reise = (D, R, sel) => {
    const Z = reiseDaten(R);
    const s = R.sems[R.cur];
    // Kopfzeile
    const ort = s ? `${s.fs}. Fachsemester · ${esc(s.name)}` : R.vorStart ? "Vor dem Studium" : "Nach der Regelstudienzeit";
    let gross, unter;
    if (R.vorStart) { const d = tage(R.t, R.sems[0].sb); gross = `Noch <b data-zahl="${d}">${d}</b> Tage`; unter = `bis zum Studienbeginn am ${dmy(R.sems[0].sb)}`; }
    else if (R.nachEnde) { gross = `<b data-zahl="${R.ects}">${R.ects}</b> ECTS`; unter = "Regelstudienzeit abgeschlossen"; }
    else { const sn = R.sems[R.sems.length - 1]; gross = `Tag <b data-zahl="${Z.tagNr}">${Z.tagNr}</b>`; unter = `von ${ca(sn)}${Z.gesamt} · noch ${ca(sn)}${Z.rest} Tage bis zum B.Sc.`; }
    // Kopf ohne Kennzeichen „Du bist hier“: das sagt die Nadel auf der Bahn
    let h = `<div class="eba-vl-reise">`
      + `<div class="eba-vl-ort">${ort}</div>`
      + `<div class="eba-vl-tag"><span class="gross">${gross}</span><span class="unter">${unter}</span></div>`
      + `<div class="eba-vl-bahn">${strasse(D, R, bahnBreit(R.sems.length), sel)}${strasse(D, R, bahnSchmal(R.sems.length), sel)}</div>`;
    // Bilanz: ECTS und Orientierungsprüfung in einer Zeile (Nächste Prüfung und Notenschnitt stehen auf dem Dashboard)
    const ectsBalken = `<span class="eba-vl-mini"><i class="plan" style="width:${pct(Math.min(1, Z.plan / 180))}"></i><i class="ist" style="width:${pct(Math.min(1, R.ects / 180))}"></i></span>`;
    const s4 = R.sems.find((x) => x.fs === 4);
    const op = `<span class="eba-vl-op">${[0, 1, 2, 3].map((i) => `<i class="${i < R.op ? "ok" : ""}"></i>`).join("")}</span>`;
    h += `<div class="eba-vl-bilanz">`
      + posten(`<b data-zahl="${R.ects}">${R.ects}</b> von 180 ECTS`, `${Z.plan} eingeplant`, "Studium/Noten & ECTS.md", ectsBalken)
      + posten(`<b>${R.op}</b> von 4 bestanden`, `Orientierungsprüfung${s4 ? ` bis ${ca(s4)}${dmy(s4.se)}` : ""}`, null, op)
      + `</div>`;
    // Fuß: nächster Meilenstein, Prognose
    const m = Z.naechsterMs;
    h += `<div class="eba-vl-fuss">`
      + (m ? `<span><i class="raute"></i>Nächster Meilenstein: <b>${esc(m.titel)}</b> ${relativ(tage(R.t, m.datum))}</span>` : "")
      + `<span><i class="flagge"></i>Prognose: <b>${Z.prognose}</b></span></div>`;
    return h + `</div>`;
  };

  // Lupe: das gewählte Semester vergrößert (Band mit Monaten, Prüfungen als Fähnchen, Module)
  const lupe = (D, R, s) => {
    const b = band(D, s, R, false);
    let mon = "";
    for (let d = new Date(s.sb.getFullYear(), s.sb.getMonth(), 1); d <= s.se; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      if (d < s.sb) continue;
      mon += `<span style="left:${pct(b.x(d))}">${MON[d.getMonth()]}${d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : ""}</span>`;
    }
    const f = R.pruef.filter((p) => p.datum >= s.sb && p.datum <= s.se);
    // Klausur (für „n Klausuren“ im Gruppen-Fähnchen): Modulprüfung, deren Prüfungsform keine andere nennt; Zwischentests nicht
    const klausur = (p) => (p.art === "klausur" || !!p.haupt) && !(p.modul && p.modul.pruefung && !/klausur/i.test(p.modul.pruefung));
    const fl = f.map((p) => {
      const d = tage(R.t, p.datum);
      const next = R.naechste === p;
      const txt = esc(p.label) + (next ? ` · ${d === 0 ? "heute" : d === 1 ? "morgen" : `${d} T.`}` : "");
      const cls = `eba-vl-fahne ${p.art}${p.erledigt ? " erledigt" : ""}${p.datum < R.t ? " vorbei" : ""}${next ? " naechste" : ""}${p.geschaetzt ? " geschaetzt" : ""}`;
      return { x: b.x(new Date(+p.datum + 864e5 / 2)), html: `<span class="${cls}" data-pfad="${esc(p.pfad)}" data-tag="${dm(p.datum)}" data-art="${klausur(p) ? "klausur" : "test"}" title="${esc(p.titel)} · ${wdm(p.datum)}${p.datum.getFullYear()} · ${relativ(d)}"><span class="mast"></span><span class="tuch">${p.modul && p.modul.fertig ? "✓ " : ""}${txt}</span></span>` };
    });
    if (s.jetzt) fl.push({ x: b.x(new Date(+R.t + 864e5 / 2)), heute: true, html: `<span class="eba-vl-fahne hier" title="Heute, ${wdm(R.t)}"><span class="mast"></span><span class="tuch">heute</span></span>` });
    fl.sort((a, c) => a.x - c.x || (a.heute ? -1 : 1));
    const fahnen = fl.map((q) => q.html.replace("<span class=\"eba-vl-fahne", `<span style="left:${pct(q.x)}" class="eba-vl-fahne`)).join("");
    const punkt = s.jetzt ? `<span class="eba-vl-hierpunkt" style="left:${pct(b.weg)}"><i></i></span>` : "";
    // Legende: Geschätztes mit Streifen und „(geschätzt)“, der Hinweis als Tooltip; darunter die Hinweise als Zeile (auch auf Touch)
    const leg = (cls, txt, o) => `<span class="eba-vl-leg"${o && o.geschaetzt && o.hinweis ? ` title="${esc(o.hinweis)}"` : ""}><i class="eba-vl-b ${cls}${o && o.geschaetzt ? " geschaetzt" : ""}"></i>${txt}${o && o.geschaetzt ? " (geschätzt)" : ""}</span>`;
    let legende = s.vb && s.ve ? leg("vl", `Vorlesungen ${dm(s.vb)} – ${dm(s.ve)}`, s) : leg("", "Vorlesungszeit offen");
    const pa = D.pausen.filter((p) => p.bis >= s.sb && p.von <= s.se);
    for (const p of pa) legende += leg("pause", `${esc(p.name)} ${dm(p.von)} – ${dm(p.bis)}`, p);
    const ph = D.phasen.filter((p) => p.bis >= s.sb && p.von <= s.se);
    for (const p of ph) legende += leg("pruef", `${esc(p.art)} ${dm(p.von)} – ${dm(p.bis)}`, p);
    if (!ph.some((p) => /haupt/i.test(p.art) && p.von >= s.sb)) legende += leg("pruef geschaetzt", "Prüfungsphase noch offen");
    const hinweise = []; // { text, was: [...] }: gleicher Hinweis nur einmal, davor alle Einträge, für die er gilt
    for (const o of [s].concat(pa, ph)) {
      if (!o.geschaetzt || !o.hinweis) continue;
      let h = hinweise.find((x) => x.text === o.hinweis);
      if (!h) { h = { text: o.hinweis, was: [] }; hinweise.push(h); }
      const was = o.art ? `${o.art} ${dm(o.von)} – ${dm(o.bis)}` : o.von ? `${o.name} ${dm(o.von)} – ${dm(o.bis)}` : o.name; // wie in der Legende
      if (h.was.indexOf(was) < 0) h.was.push(was);
    }
    const hinweis = !s.module.length ? "noch nichts geplant" : s.plan < 30 && s.variante.length ? `${s.plan} geplant · Rest je nach Variante` : s.plan < 30 ? `${s.plan} geplant · Rest offen` : `${s.plan} geplant`;
    // Laufendes Semester: Vorlesungswoche und Resttage der Vorlesungszeit (die Woche stand bis 17.10.2026 als Satz im Kopf)
    const woche = s.jetzt ? vorlesungswoche(D, R) : "";
    const rest = !s.jetzt ? "" : s.vb && s.ve && R.t <= s.ve ? (R.t < s.vb ? ` · Vorlesungen ab ${ca(s)}${dm(s.vb)}` : `${woche ? ` · ${woche}` : ""} · noch ${ca(s)}<b>${tage(R.t, s.ve)}</b> Tage Vorlesungszeit`) : " · Vorlesungszeit vorbei";
    // Meilensteine dieses Semesters als Zeile: auf der Bahn tragen die Rauten ihre Erklärung nur als Tooltip (nicht auf Touch)
    const ms = R.ms.filter((m) => m.fs === s.fs).map((m) => `<span${m.pfad ? ` data-pfad="${esc(m.pfad)}" role="link" tabindex="0"` : ""}><i class="raute${m.ok ? " ok" : ""}${m.art === "option" ? " option" : ""}"></i><b>${esc(m.titel)}</b>: ${esc(m.info)}</span>`).join("");
    return `<div class="eba-vl-lupe" data-sem="${s.i}">`
      + `<div class="eba-vl-lkopf"><div class="eba-vl-ltitel"><span class="t">${s.fs}. Fachsemester · ${esc(s.name)}</span></div>`
      + `<div class="eba-vl-lects"><b>${s.ist}</b> / 30 ECTS · ${hinweis}${rest}</div>`
      + (ms ? `<div class="eba-vl-lms">${ms}</div>` : "")
      + `<div class="eba-vl-ldaten">${legende}</div>`
      + (hinweise.length ? `<div class="eba-vl-lhinweis">${hinweise.map((h) => `<span><b>${esc(h.was.join(", "))}</b> (geschätzt): ${esc(h.text)}</span>`).join("")}</div>` : "") + `</div>`
      + `<div class="eba-vl-fahnen" data-anzahl="${fl.length}">${fahnen}</div>`
      + `<div class="eba-vl-lband">${b.html}${punkt}</div>`
      + `<div class="eba-vl-monate">${mon}</div>`
      + modulListe(R, s) + `</div>`;
  };
  const statusPill = (m) => {
    const st = m.status;
    if (m.fertig) return `<span class="eba-pill ok">${m.ergebnis ? esc(m.ergebnis) : st === "anerkannt" ? "anerkannt" : "bestanden"}</span>`;
    if (st === "nicht bestanden") return `<span class="eba-pill bad">nicht bestanden</span>`;
    if (st === "angemeldet") return `<span class="eba-pill info">angemeldet</span>`;
    if (st === "läuft") return `<span class="eba-pill akzent">läuft</span>`;
    return `<span class="eba-vl-offen">${esc(st || "offen")}</span>`;
  };

  // Prüfungstermin eines Moduls: Feld klausur, sonst die Klausur aus einer Termin-Notiz (nächste, sonst letzte; „eine Regel“ wie
  // klausurzeit.js und das Dashboard, docs/architektur.md „Nächste Prüfung“). Ohne beides: null → „Termin folgt“.
  const klausurVon = (R, m) => {
    if (m.klausur) return m.klausur;
    const l = R.pruef.filter((p) => p.haupt && p.modul === m);
    const k = l.find((p) => p.datum >= R.t) || l[l.length - 1];
    return k ? k.datum : null;
  };
  const modulZeile = (R, m) => {
    let pr;
    const kl = klausurVon(R, m);
    if (m.zusatz) pr = "Zusatz, zählt nicht";
    else if (m.fertig) pr = kl ? `${wdm(kl)}${String(kl.getFullYear()).slice(2)}` : "";
    else if (kl) { const d = tage(R.t, kl); pr = `${wdm(kl)} · <b>${relativ(d)}</b>`; }
    else pr = /^\s*klausur/i.test(m.pruefung) || !m.pruefung ? "Termin folgt" : esc(m.pruefung.length > 34 ? m.pruefung.slice(0, 32) + " …" : m.pruefung);
    return `<div class="eba-vl-mz${m.fertig ? " fertig" : ""}${m.zusatz ? " zusatz" : ""}" data-pfad="${esc(m.pfad)}" role="link" tabindex="0">`
      + `<span class="eba-vl-mcode">${esc(m.code)}</span><span class="eba-vl-mtitel">${esc(m.titel)}</span>`
      + `<span class="eba-vl-mmeta"><span class="eba-vl-mects">${m.ects ? `${String(m.ects).replace(".", ",")} ECTS` : "0 ECTS"}</span>${statusPill(m)}<span class="eba-vl-mpr">${pr}</span></span></div>`;
  };

  const modulListe = (R, s) => {
    const fest = s.module.filter((m) => m.art === "fest").sort((a, b) => (klausurVon(R, a) || 9e15) - (klausurVon(R, b) || 9e15) || a.code.localeCompare(b.code));
    const zus = s.module.filter((m) => m.art === "zusatz");
    const varr = s.variante;
    let h = `<div class="eba-vl-module">`;
    // Verweis auf den Abschnitt „Schwerpunkte“ (schwerpunkte.js) nur, wenn er zu sehen ist (ab dem 2. Fachsemester oder mit Plan)
    const sp = ctx.schwerpunkte && ctx.schwerpunkte.sichtbar && ctx.schwerpunkte.sichtbar();
    if (!fest.length && !varr.length && !zus.length) h += `<div class="eba-vl-leer">Noch keine Module für ${esc(s.name)} geplant (offen).${sp ? ` Schwerpunktmodule findest du unter <span class="eba-vl-link" data-pfad="Studium/Studienverlauf.md#Schwerpunkte">Schwerpunkte</span>.` : ""}</div>`;
    h += fest.map((m) => modulZeile(R, m)).join("");
    if (varr.length) {
      const e = varr.reduce((a, m) => a + m.ects, 0);
      const titel = R.variante === "offen" ? "Je nach Variante" : "Wählbar, nicht im Plan";
      h += `<details class="eba-vl-mehr"><summary>${titel} · ${plural(varr.length, "Modul", "Module")} · ${e} ECTS</summary>${varr.map((m) => modulZeile(R, m)).join("")}</details>`;
    }
    h += zus.map((m) => modulZeile(R, m)).join("");
    return h + `</div>`;
  };
  // Fähnchen der Lupe ohne Überlappung. Prüfungen, deren Beschriftungen sich überschneiden würden (typisch die fünf Klausuren
  // der Prüfungsphase), werden zu einem Fähnchen „n Klausuren 30.01.–12.02.“ zusammengefasst statt zu einem Turm gestapelt;
  // Einzelheiten stehen im Tooltip und in der Modulliste. „heute“ bleibt eigen. Was dann noch kollidiert, rückt eine Stufe
  // höher. Braucht echte Pixelbreite (ResizeObserver), läuft bei jeder Größenänderung neu und räumt vorher auf.
  const aufdecken = (lane) => { for (const g of lane.querySelectorAll(".eba-vl-fahne.gruppe")) g.remove(); for (const f of lane.querySelectorAll(".eba-vl-fahne")) f.classList.remove("verdeckt"); };
  const stapeln = (lane) => {
    // Fehler hier wären stumm (ResizeObserver): dann lieber alle Fähnchen einzeln zeigen als gar keine
    try { stapelnRoh(lane); } catch (e) { console.error("Verlauf: Fähnchen", e); aufdecken(lane); }
  };
  const stapelnRoh = (lane) => {
    const W = lane.clientWidth;
    if (!W) return;
    const STUFE = 19, LUFT = 6;
    aufdecken(lane);
    const alle = [...lane.querySelectorAll(".eba-vl-fahne")];
    const x = (f) => (parseFloat(f.style.left) / 100) * W;
    const w = (f) => f.querySelector(".tuch").offsetWidth;
    const gruppen = [];
    for (const f of alle.filter((e) => !e.classList.contains("hier")).sort((a, b) => x(a) - x(b))) {
      const g = gruppen[gruppen.length - 1];
      if (g && x(f) < g.ende + LUFT) { g.liste.push(f); g.ende = Math.max(g.ende, x(f) + w(f)); }
      else gruppen.push({ liste: [f], ende: x(f) + w(f) });
    }
    const sichtbar = alle.filter((e) => e.classList.contains("hier"));
    for (const g of gruppen) {
      if (g.liste.length < 2) { sichtbar.push(g.liste[0]); continue; }
      const l = g.liste, n = l.length;
      for (const f of l) f.classList.add("verdeckt");
      const e = lane.ownerDocument.createElement("span");
      e.className = "eba-vl-fahne gruppe" + (l.some((f) => f.classList.contains("naechste")) ? " naechste" : "")
        + (l.every((f) => f.classList.contains("vorbei")) ? " vorbei" : "") + (l.every((f) => f.classList.contains("erledigt")) ? " erledigt" : "");
      e.style.left = l[0].style.left;
      e.title = l.map((f) => f.title).join("\n");
      e.innerHTML = `<span class="mast"></span><span class="tuch">${n} ${l.every((f) => f.dataset.art === "klausur") ? "Klausuren" : "Prüfungen"} ${esc(l[0].dataset.tag)}–${esc(l[n - 1].dataset.tag)}</span>`;
      lane.appendChild(e);
      sichtbar.push(e);
    }
    sichtbar.sort((a, b) => x(a) - x(b) || (a.classList.contains("hier") ? -1 : 1));
    const enden = [];
    let max = 0;
    for (const f of sichtbar) {
      const tw = w(f), fx = x(f);
      const links = fx + tw > W - 2;
      const a = links ? fx - tw : fx, b = links ? fx : fx + tw;
      let st = 0;
      while (st < enden.length && enden[st] > a - LUFT) st++;
      enden[st] = b;
      f.classList.toggle("links", links);
      f.style.setProperty("--stufe", st);
      max = Math.max(max, st);
    }
    lane.style.height = sichtbar.length ? `${(max + 1) * STUFE + 8}px` : "4px";
  };

  const zaehlen = (root) => {
    for (const e of root.querySelectorAll("[data-zahl]")) {
      const z = +e.dataset.zahl;
      if (!(z > 1)) continue;
      const t0 = performance.now();
      const schritt = (t) => { const p = Math.min(1, (t - t0) / 1100); e.textContent = String(Math.round(z * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(schritt); };
      e.textContent = "0";
      requestAnimationFrame(schritt);
    }
  };

  // Animation nur beim ersten Zeichnen einer Seite (nicht bei jedem Neuzeichnen nach Datenänderung oder beim Scrollen)
  const animieren = (pfad) => {
    const m = ctx.bleibend("zuletzt", () => ({}));
    const jetzt = Date.now(), alt = m[pfad] || 0;
    m[pfad] = jetzt;
    return jetzt - alt > 60 * 1000;
  };

  // ---------- Zeichnen ----------
  const ersatz = (el, quelle, e) => {
    // Fallback: der Text des Codeblocks bleibt lesbar, die Seite läuft weiter
    try {
      el.innerHTML = "";
      const d = document.createElement("div");
      d.className = "eba-vl-fehlt";
      d.textContent = String(quelle || "Studienverlauf").trim() + (e ? ` (Grafik-Fehler: ${e.message || e})` : "");
      el.appendChild(d);
    } catch (x) {}
  };

  const zeichnen = (inst, anim) => {
    const D = lesen();
    const el = inst.el;
    if (!D.sems.length) { el.innerHTML = `<div class="eba-vl eba-vl-fehlt">Studienverlauf: In System/Einstellungen.md fehlt die semesterliste.</div>`; return; }
    const R = rechnen(D);
    const z = inst.zustand;
    const std = R.cur >= 0 ? R.cur : R.vorStart ? 0 : R.sems.length - 1;
    const sel = z.sel === undefined || z.sel === null || !R.sems[z.sel] ? std : z.sel;
    const anim2 = anim && !ruhig();
    el.innerHTML = `<div class="eba-vl${anim2 ? " eba-vl-anim" : ""}" lang="de">${reise(D, R, sel)}${lupe(D, R, R.sems[sel])}</div>`;
    const root = el.firstElementChild;
    inst.tag = +R.t;
    // Bedienung: Station wählt das Semester der Lupe, Module/Prüfungen öffnen die Notiz
    const aktion = (e) => {
      const ziel = e.target.closest ? e.target.closest("[data-pfad], [data-sem]") : null;
      if (!ziel || !root.contains(ziel) || e.target.closest("summary")) return;
      if (ziel.dataset && ziel.dataset.pfad) {
        e.preventDefault(); e.stopPropagation();
        app.workspace.openLinkText(ziel.dataset.pfad, (inst.ctx && inst.ctx.sourcePath) || "", e.ctrlKey || e.metaKey);
        return;
      }
      if (ziel.classList.contains("eba-vl-lupe")) return;
      e.preventDefault(); e.stopPropagation();
      z.sel = +ziel.getAttribute("data-sem");
      zeichnen(inst, false);
      try { const lu = inst.el.querySelector(".eba-vl-lupe"); if (lu && lu.classList) lu.classList.add("neu"); } catch (x) {}
    };
    root.addEventListener("click", aktion);
    root.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") aktion(e); });
    root.addEventListener("mousedown", (e) => { if (e.target.closest && e.target.closest("[data-pfad], [data-sem]")) e.stopPropagation(); });
    // Fähnchen ohne Überlappung stapeln (braucht echte Pixelbreite; neu bei jeder Größenänderung)
    for (const lane of root.querySelectorAll(".eba-vl-fahnen")) {
      try {
        // ResizeObserver des Fensters, in dem der Block steht (Popout-Fenster am PC haben ein eigenes)
        const w = (lane.ownerDocument && lane.ownerDocument.defaultView) || window;
        if (w.ResizeObserver) new w.ResizeObserver(() => stapeln(lane)).observe(lane);
        setTimeout(() => stapeln(lane), 60);
      } catch (x) {}
    }
    if (anim2) try { zaehlen(root); } catch (x) {}
  };

  // ---------- Codeblock ----------
  const rendern = (quelle, el, c, inst) => {
    inst = inst || { el, ctx: c, quelle };
    inst.zustand = inst.zustand || {};
    try { zeichnen(inst, animieren((c && c.sourcePath) || "")); }
    catch (e) { console.error("Verlauf", e); ersatz(el, quelle, e); }
  };
  let block = null; // Codeblock-Griff (ctx.codeblock), gesetzt in registrieren()
  const alleNeu = (nurTageswechsel) => {
    if (!block) return;
    for (const i of block.instanzen()) {
      if (nurTageswechsel && i.tag === +heute()) continue;
      try { zeichnen(i, false); } catch (e) { console.error("Verlauf", e); ersatz(i.el, i.quelle, e); }
    }
  };

  // ---------- Registrierung (Plugin „Studium Autopilot“, Helfer in ctx) ----------
  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, rendern);
    // Neu zeichnen bei Änderungen an Modulen, Prüfungs-Terminen, SQ-Kursen, Einstellungen und zentralen Daten (gedrosselt)
    const bald = ctx.entprellen(() => alleNeu(), 1500);
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => {
      const typ = cache && cache.frontmatter && cache.frontmatter.typ;
      if (f.path === "System/Einstellungen.md" || f.path.startsWith("System/Daten/") || typ === "modul" || typ === "termin" || typ === "sq_kurs") bald();
    });
    ctx.an(app.vault, "delete", (f) => { if (/^(Module|Termine|Schlüsselqualifikationen)\//.test(f.path)) bald(); });
    // Tageswechsel: „Du bist hier“ und Countdowns weiterrücken (alle 30 min und beim Zurückkommen in die App)
    ctx.intervall(() => alleNeu(true), 30 * 60 * 1000);
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "visible") alleNeu(true); });
  };

  return { registrieren, rendern, alleNeu, rechnen }; // rechnen für tests/verlauf.test.js
};
