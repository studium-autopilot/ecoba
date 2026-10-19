// Alma-Konto lesen (HISinOne, Uni Tübingen, seit 0.4.5, Beta): reine Funktionen für die Seiten „Leistungen“ und „Belegungen“
// deines Kontos und für die Anmeldung. Kein Netz, keine Zeitgeber, nichts passiert beim Laden; den Ablauf macht alma-konto.js.
// Bibliothek (CommonJS ohne Obsidian), damit ein eigener Server denselben Leser nehmen kann.
//
// Aufruf in Obsidian:  const A = ctx.user["alma-konto-html"](ctx);   (nutzt den Zerleger aus ilias-html.js)
// Ohne Obsidian:       require("alma-konto-html.js").erzeugen(require("ilias-html.js"))
//
// Schnittstelle:
//   seite(html) → "angemeldet" | "anmeldung" | "unbekannt"
//   anmeldeFormular(html, basisUrl) → { action, felder: [[name, wert]] } | null   (nur versteckte Felder; Benutzername und
//       Passwort setzt alma-konto.js erst beim Absenden ein). null, wenn das Formular nicht genau zu Alma passt.
//   fehler(html) → "zugang-falsch" | "abgelehnt-unklar" | "zwei-faktor" | "zustimmung" | "wartung" | "unerwartet"
//   stundenplanLink(html) → Abo-Link des Stundenplans (iCalendar) | ""   (Uni-Login, seit 0.4.8; Seite „Stundenplan“)
//   leistungen(html, basisUrl) → { art: "leer" | "ok" | "zugeklappt" | "unsicher", grund?, zeilen, aufklappen? }
//   belegungen(html) → { art: "leer" | "ok" | "unsicher", grund?, semester, eintraege }
//   zuordnen(zeilen, codes) → zeilen mit code     zusammenfassen(zeilen) → { <Code>: { status, note, versuch, semester, datum,
//       eindeutig, stati } }     pruefungenZuordnen(eintraege, codes) → { pruefungen: { <Code>: { status } }, unzugeordnet }
//   fingerabdruck(html) → Text ohne Werte („Aufbau kopieren (ohne deine Daten)“)     semesterName(text) → "WS 2026/27" | "SS 2027" | ""
//
// Befunde an echten Seiten (18.10.2026, einmal, nur Aufbau; Testseiten in tests/daten/alma-konto/ sind erfunden):
//   * Anmeldung: Formular #mobileLoginForm, action https://alma.uni-tuebingen.de:443/alma/rds?…category=auth.login, versteckt
//     userInfo und ajax-token, Felder asdf (Benutzer) und fdsa (Passwort). #loginForm ist leer.
//   * Angemeldet: Jede angemeldete Seite trägt zusätzlich das versteckte #sessionTimeoutLoginForm (asdf, fdsa) und den Satz
//     „Ihre Sitzung ist aus Sicherheitsgründen abgelaufen“. Angemeldet erkennt man nur am Link mit category=auth.logout.
//   * Abgelehnt (erfundener Benutzername): Formular wieder da, darüber .error_infobox mit „Ihre Anmeldung war leider nicht
//     erfolgreich. …“. Ob ein falsches Passwort eines echten Kontos genauso aussieht, ist ungeprüft.
//   * Leer: Leistungen ohne Tabelle mit dem Hinweis „Es wurden keine Datensätze gefunden.“; Belegungen ohne Einträge mit „Sie
//     haben bisher keine Veranstaltungen belegt und keine Prüfungen angemeldet.“; eine gewählte Semesteroption.
//   * Stundenplan (19.10.2026, angemeldet, Link dabei nicht verändert): Das Fenster „Daten für iCalendar (ics) exportieren“ steht
//     versteckt in der Seite; der Link (…/individualTimetableCalendarExport.faces?user=…&hash=…&termgroup=, mit „:443“) im Feld
//     textarea …:ical:cal_add und in dessen data-page-permalink. Im selben Fenster „Sicherheitsmaßnahmen erneuern“: erneuert
//     den Schlüssel im Link, darum schickt Studium Autopilot dort nie etwas ab.
//   * Gefüllte Tabellen, englische Texte: noch nicht gesehen. Der Leser folgt dem, was öffentliche HISinOne-Leser beschreiben
//     (Tabelle treeTableWithIcons, Zeilen treeTableCellLevelN, Werte nach Spaltenkopf oder id-Endung, Art aus img[alt]), und
//     liefert im Zweifel „unsicher“, nie „leer“ (fail-closed). Bis zum Abgleich mit echten Seiten nur als Beta.
// Datenschutz: Aus den Seiten kommen nie Kopfzeile, Name, Initialen, Matrikelnummer, Geburtsdatum, Prüfer:innen oder Vermerke;
//   je Zeile nur Nummer, Ebene, Art, Status, Note, Versuch, Semester, Datum. Titel nur zum Zuordnen, sie bleiben nicht.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const HOST = "alma.uni-tuebingen.de";
const EXPORT_PFAD = "/alma/pages/cm/exa/timetable/individualTimetableCalendarExport.faces"; // Abo-Link des Stundenplans
const LEER_LEISTUNGEN = ["Es wurden keine Datensätze gefunden."];
const LEER_BELEGUNGEN = ["Sie haben bisher keine Veranstaltungen belegt und keine Prüfungen angemeldet."];
// Anfang der Meldung nach einer abgelehnten Anmeldung (V-A1, 18.10.2026)
const ANMELDUNG_ABGELEHNT = ["Ihre Anmeldung war leider nicht erfolgreich"];
const ID_LEISTUNGEN = "examsReadonly:overviewAsTreeReadonly";
const ID_BELEGUNGEN = "studentOverviewForm:enrollmentsDiv:termEnrollmentDiv:termResult";
const ID_SEMESTER = "studentOverviewForm:enrollmentsDiv:termSelector:termPeriodDropDownList_input";

// Status der Leistungen: Langform (title oder Text) entscheidet; Kurzform nur mit passender Langform
const STATUS = {
  "bestanden": "bestanden", "passed": "bestanden",
  "nicht bestanden": "nicht bestanden", "failed": "nicht bestanden", "not passed": "nicht bestanden",
  "endgültig nicht bestanden": "endgültig nicht bestanden", "finally failed": "endgültig nicht bestanden",
  "definitively failed": "endgültig nicht bestanden",
  "angemeldet": "angemeldet", "registered": "angemeldet",
  "anerkannt": "anerkannt", "recognised": "anerkannt", "recognized": "anerkannt", "credited": "anerkannt",
  "zurückgetreten": "zurückgetreten", "withdrawn": "zurückgetreten",
};
const KURZ = { BE: ["bestanden"], NB: ["nicht bestanden"], EN: ["endgültig nicht bestanden"], AN: ["angemeldet", "anerkannt"],
  RT: ["zurückgetreten"], ZU: ["zurückgetreten"] };
const ABGESCHLOSSEN = ["bestanden", "nicht bestanden", "endgültig nicht bestanden"];
// Status der Belegungen (Prüfungsanmeldungen)
const BELEGUNG = { "zugelassen": "zugelassen", "admitted": "zugelassen", "angemeldet": "angemeldet", "registered": "angemeldet",
  "zurückgetreten": "zurückgetreten", "withdrawn": "zurückgetreten", "abgemeldet": "abgemeldet", "deregistered": "abgemeldet",
  "abschnitt begonnen": "abschnitt begonnen" };
const ARTEN = { "abschluss": "abschluss", "degree": "abschluss", "konto": "konto", "account": "konto", "modul": "modul",
  "module": "modul", "prüfung": "pruefung", "examination": "pruefung", "exam": "pruefung" };
// Spalten nach Kopftext (klein) bzw. nach id-Endung
const KOEPFE = {
  nummer: ["nummer", "nr.", "nr", "number", "no."], titel: ["titel", "title", "bezeichnung"], semester: ["semester", "term"],
  note: ["note", "grade"], status: ["status"], versuch: ["versuch", "attempt"], datum: ["prüfungsdatum", "datum", "exam date", "date"],
};
const ENDUNG = { nummer: "elementnr", titel: "defaulttext", note: "grade", status: "workstatus", versuch: "attempt" };
const UNBENOTET = ["unbenotet", "ungraded", "ohne note", "o. n.", "o.n.", "without grade"];
const PRAEFIX_PRUEFUNG = ["prüfung", "examination", "exam"];
const PRAEFIX_VERANSTALTUNG = ["veranstaltung", "course", "lecture"];

const norm = (s) => String(s == null ? "" : s).replace(/[\s\u00a0]+/g, " ").trim();
const klein = (s) => norm(s).toLowerCase();
// Note wie 1,7: 1,0 bis 4,0 in Zehnteln oder 5,0
const noteNorm = (s) => { const m = norm(s).replace(".", ",").match(/^([1-5]),(\d)$/); return m && (+m[1] < 4 || m[2] === "0") ? m[1] + "," + m[2] : ""; };
const datumIso = (s) => { const m = norm(s).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2) : ""; };
// „Wintersemester 2026/27“, „WiSe 2026/27“, „Winter semester 2026/27“, „WS 2026/27“ → „WS 2026/27“; Sommer ebenso → „SS 2027“
const semesterName = (s) => {
  const t = klein(s);
  let m = t.match(/^(?:wintersemester|winter semester|winter term|winter|wise|ws)\s*(\d{4})\s*\/\s*(\d{2}|\d{4})$/);
  if (m) return "WS " + m[1] + "/" + m[2].slice(-2);
  m = t.match(/^(?:sommersemester|summer semester|summer term|sommer|summer|sose|ss)\s*(\d{4})$/);
  return m ? "SS " + m[1] : "";
};

const erzeugen = (H) => {
  if (!H || typeof H.parsen !== "function") throw new Error("alma-konto-html: Zerleger aus ilias-html.js fehlt");
  const { parsen, alle, erstes, text, attr, hatKlasse } = H;
  const baumVon = (html) => (html && typeof html === "object" && html.name ? html : parsen(html));
  const mitId = (w, id) => erstes(w, (e) => attr(e, "id") === id);
  const endetMit = (s, e) => s.length >= e.length && s.slice(s.length - e.length) === e;

  // ---------- Anmeldung ----------
  const abmeldeLink = (b) => !!erstes(b, (e) => e.name === "a" && /[?&]category=auth\.logout(?:&|$)/.test(attr(e, "href")));
  // Formulare mit dem Passwortfeld, ohne das versteckte Formular jeder angemeldeten Seite
  const loginFormulare = (b) => alle(b, (e) => e.name === "form" && attr(e, "id") !== "sessionTimeoutLoginForm"
    && !!erstes(e, (x) => x.name === "input" && attr(x, "name") === "fdsa"));
  const seite = (html) => {
    const b = baumVon(html);
    if (abmeldeLink(b)) return "angemeldet";
    return loginFormulare(b).length ? "anmeldung" : "unbekannt";
  };
  // action muss https, Host alma.uni-tuebingen.de, Port leer/443, Pfad /alma/rds, category=auth.login sein (sonst geht kein
  // Passwort hinaus). Relative action gegen basisUrl (nur Alma).
  const actionPruefen = (roh, basisUrl) => {
    const a = norm(roh);
    let u;
    try { u = new URL(a, basisUrl || "https://" + HOST + "/"); } catch (e) { return ""; }
    const m = /^https:\/\/([^/?#@]+)(\/[^?#]*)(\?[^#]*)?$/.exec(u.href);
    if (!m || u.protocol !== "https:" || u.hostname !== HOST || (u.port !== "" && u.port !== "443") || u.username || u.password) return "";
    if (u.pathname !== "/alma/rds" || !/[?&]category=auth\.login(?:&|$)/.test(u.search)) return "";
    return u.href;
  };
  const versteckt = (form) => alle(form, (e) => e.name === "input" && klein(attr(e, "type")) === "hidden" && attr(e, "name"))
    .map((e) => [attr(e, "name"), attr(e, "value")]);
  const anmeldeFormular = (html, basisUrl) => {
    const b = baumVon(html);
    const liste = loginFormulare(b);
    const f = liste.filter((x) => attr(x, "id") === "mobileLoginForm")[0] || liste[0];
    if (!f || klein(attr(f, "method")) !== "post") return null;
    const action = actionPruefen(attr(f, "action"), basisUrl);
    if (!action) return null;
    if (!erstes(f, (x) => x.name === "input" && attr(x, "name") === "asdf")) return null;
    return { action, felder: versteckt(f).filter((p) => p[0] !== "asdf" && p[0] !== "fdsa") };
  };
  const meldungen = (b) => {
    const kasten = alle(b, (e) => hatKlasse(e, "error_infobox") || klein(attr(e, "data-infobox-type")) === "error");
    const aus = [];
    for (const k of kasten) for (const li of alle(k, (e) => e.name === "li")) { const t = norm(text(li)); if (t) aus.push(t); }
    return aus;
  };
  const fehler = (html) => {
    const b = baumVon(html);
    if (seite(b) === "anmeldung") {
      const m = meldungen(b);
      return m.some((t) => ANMELDUNG_ABGELEHNT.some((a) => t.indexOf(a) === 0)) ? "zugang-falsch" : "abgelehnt-unklar";
    }
    const sichtbar = alle(b, (e) => e.name === "input" && ["text", "number", "tel", ""].indexOf(klein(attr(e, "type"))) >= 0);
    if (sichtbar.some((e) => /otp|totp|einmal|zwei|second|mfa|2fa|\btan\b/i.test(attr(e, "name") + " " + attr(e, "id") + " " + attr(e, "autocomplete")))) return "zwei-faktor";
    const ganz = klein(text(b));
    if (alle(b, (e) => e.name === "form").length && /zustimm|einverstanden|nutzungsbedingungen|akzeptier|consent|terms of use|i agree/.test(ganz)) return "zustimmung";
    if (/wartung|maintenance|nicht erreichbar|nicht verfügbar|temporarily unavailable/.test(ganz)) return "wartung";
    return "unerwartet";
  };

  // ---------- Stundenplan: Abo-Link (Uni-Login, uni-login.js) ----------
  // Nur ein Link nach diesem Muster gilt: https, HOST, Port leer/443, Pfad EXPORT_PFAD, user und hash nicht leer.
  const exportLink = (roh) => {
    const s = norm(roh);
    let u;
    try { u = new URL(s); } catch (e) { return ""; }
    if (u.protocol !== "https:" || u.hostname !== HOST || (u.port !== "" && u.port !== "443") || u.username || u.password) return "";
    if (u.pathname !== EXPORT_PFAD || !u.searchParams.get("user") || !u.searchParams.get("hash")) return "";
    return s;
  };
  // Seite „Stundenplan“ → Abo-Link wie hinter „Link kopieren“ | "". Er steht schon in der Seite, im versteckten Fenster
  // „Daten für iCalendar (ics) exportieren“: als Text des schreibgeschützten Felds (textarea …:ical:cal_add) und in dessen
  // data-page-permalink. Zwei verschiedene Links → "" (fail-closed).
  const stundenplanLink = (html) => {
    const b = baumVon(html), gefunden = {};
    for (const e of alle(b, (x) => x.name === "textarea" || !!attr(x, "data-page-permalink"))) {
      for (const roh of [e.name === "textarea" ? text(e) : "", attr(e, "data-page-permalink")]) { const l = exportLink(roh); if (l) gefunden[l] = true; }
    }
    const l = Object.keys(gefunden);
    return l.length === 1 ? l[0] : "";
  };

  // ---------- Leistungen ----------
  const infoTexte = (w) => alle(w, (e) => hatKlasse(e, "infoBox") || hatKlasse(e, "fieldsetMessageText")).map((e) => norm(text(e))).filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i);
  const spaltenVon = (tabelle) => {
    const kopf = erstes(tabelle, (e) => e.name === "thead") || erstes(tabelle, (e) => e.name === "tr");
    const ths = kopf ? alle(kopf, (e) => e.name === "th" || e.name === "td") : [];
    const sp = {};
    ths.forEach((th, i) => {
      if (attr(th, "colspan") && attr(th, "colspan") !== "1") sp.colspan = true;
      const t = klein(text(th));
      for (const k of Object.keys(KOEPFE)) if (!(k in sp) && KOEPFE[k].indexOf(t) >= 0) sp[k] = i;
    });
    sp.anzahl = ths.length;
    return sp;
  };
  const zellen = (tr) => tr.kinder.filter((k) => k && (k.name === "td" || k.name === "th"));
  // Wert einer Spalte: nach Kopftext, sonst nach id-Endung (nie nach Position)
  const zelleVon = (tr, sp, feld) => {
    const z = zellen(tr);
    if (feld in sp && !sp.colspan && z.length === sp.anzahl) return z[sp[feld]] || null;
    const e = ENDUNG[feld];
    return e ? erstes(tr, (x) => endetMit(attr(x, "id"), ":" + e)) : null;
  };
  const statusAus = (zelle) => {
    if (!zelle) return { status: "", roh: "" };
    const mitTitel = attr(zelle, "title") ? zelle : erstes(zelle, (e) => !!attr(e, "title"));
    const lang = klein(mitTitel ? attr(mitTitel, "title") : "");
    const t = norm(text(zelle));
    if (lang) {
      const s = STATUS[lang];
      if (!s) return { status: "", unsicher: "status" };
      if (t && KURZ[t.toUpperCase()] && KURZ[t.toUpperCase()].indexOf(s) < 0 && STATUS[klein(t)] !== s) return { status: "", unsicher: "status" };
      return { status: s };
    }
    if (!t) return { status: "" };
    if (STATUS[klein(t)]) return { status: STATUS[klein(t)] };
    if (t.toUpperCase() === "PV") return { status: "", pv: true };
    return { status: "", unsicher: "status" }; // Kurzform ohne Langform (z. B. „AN“: angemeldet oder anerkannt?)
  };
  const ebeneVon = (tr) => { const m = /(?:^|\s)treeTableCellLevel(\d+)(?:\s|$)/.exec(attr(tr, "class")); return m ? +m[1] : 0; };
  const zeileLesen = (tr, sp) => {
    const z = { ebene: ebeneVon(tr), art: "", nummer: "", status: "", note: "", unbenotet: false, versuch: 0, semester: "", datum: "" };
    const img = erstes(tr, (e) => e.name === "img" && !!attr(e, "alt"));
    z.art = img ? (ARTEN[klein(attr(img, "alt"))] || "") : "";
    z.nummer = norm(text(zelleVon(tr, sp, "nummer")));
    const st = statusAus(zelleVon(tr, sp, "status"));
    z.status = st.status;
    const n = norm(text(zelleVon(tr, sp, "note")));
    z.note = noteNorm(n);
    z.unbenotet = UNBENOTET.indexOf(klein(n)) >= 0;
    const v = norm(text(zelleVon(tr, sp, "versuch")));
    z.versuch = /^[1-9]$/.test(v) ? +v : 0;
    if ("semester" in sp) z.semester = semesterName(text(zelleVon(tr, sp, "semester")));
    if ("datum" in sp) z.datum = datumIso(text(zelleVon(tr, sp, "datum")));
    // Pflicht: Nummer; bekannter Status; abgeschlossen → gültige Note oder ausdrücklich unbenotet; PV nur über Prüfungen
    if (!z.nummer) z.unsicher = "nummer";
    else if (st.unsicher) z.unsicher = st.unsicher;
    else if (st.pv && z.art === "pruefung") z.unsicher = "status";
    else if (ABGESCHLOSSEN.indexOf(z.status) >= 0 && !z.note && !z.unbenotet) z.unsicher = "note";
    else if (n && !z.note && !z.unbenotet) z.unsicher = "note";
    else if (z.art === "pruefung" && !z.status) z.unsicher = "status";
    return z;
  };
  const leistungen = (html, basisUrl) => {
    const b = baumVon(html);
    const bereich = mitId(b, ID_LEISTUNGEN);
    if (!bereich) return { art: "unsicher", grund: "aufbau", zeilen: [] };
    const tabelle = erstes(bereich, (e) => e.name === "table" && hatKlasse(e, "treeTableWithIcons"));
    const knopf = erstes(bereich, (e) => (e.name === "button" || e.name === "input") && endetMit(attr(e, "name"), ":expandAll2"));
    if (!tabelle) {
      const hinweise = infoTexte(bereich);
      if (hinweise.length === 1 && LEER_LEISTUNGEN.indexOf(hinweise[0]) >= 0 && !erstes(bereich, (e) => e.name === "table")) return { art: "leer", zeilen: [] };
      return { art: "unsicher", grund: hinweise.length ? "hinweis" : "aufbau", zeilen: [] };
    }
    const sp = spaltenVon(tabelle);
    const trs = alle(tabelle, (e) => e.name === "tr" && /(?:^|\s)treeTableCellLevel\d+(?:\s|$)/.test(attr(e, "class")));
    if (!trs.length) return { art: "unsicher", grund: "aufbau", zeilen: [] };
    const zeilen = trs.map((tr) => zeileLesen(tr, sp));
    const zu = trs.some((tr) => !!erstes(tr, (e) => hatKlasse(e, "iconfont-arrow_thin_right")));
    if (zu) {
      const form = alle(b, (e) => e.name === "form" && attr(e, "id") === "examsReadonly")[0];
      const aufklappen = knopf && form ? { action: absolut(attr(form, "action"), basisUrl), felder: versteckt(form).concat([[attr(knopf, "name"), attr(knopf, "value")]]) } : null;
      return { art: "zugeklappt", zeilen: [], aufklappen: aufklappen && aufklappen.action ? aufklappen : null };
    }
    const unsicher = zeilen.filter((z) => z.unsicher);
    if (unsicher.length) return { art: "unsicher", grund: "zeile", zeilen: [] };
    return { art: "ok", zeilen };
  };
  // Formular-action nur auf Alma (relativ zur Seite); sonst ""
  const absolut = (roh, basisUrl) => {
    try {
      const u = new URL(norm(roh), basisUrl || "https://" + HOST + "/alma/");
      return u.protocol === "https:" && u.hostname === HOST && (u.port === "" || u.port === "443") && !u.username && !u.password ? u.href : "";
    } catch (e) { return ""; }
  };

  // Codes zuordnen: Nummer beginnt mit einem Modulcode des Tresors (längster Treffer, danach keine Ziffer), sonst die nächste
  // Zeile darüber mit kleinerer Ebene und Code (die Modulzeile), sonst keiner.
  const codeAus = (nummer, codes) => {
    let best = "";
    for (const c of codes || []) {
      const s = String(c);
      if (s && nummer.indexOf(s) === 0 && !/^[0-9]/.test(nummer.slice(s.length)) && s.length > best.length) best = s;
    }
    return best;
  };
  const zuordnen = (zeilen, codes) => {
    const stapel = [];
    return (zeilen || []).map((z) => {
      while (stapel.length && stapel[stapel.length - 1].ebene >= z.ebene) stapel.pop();
      let code = codeAus(z.nummer, codes);
      if (!code) for (let i = stapel.length - 1; i >= 0; i--) if (stapel[i].code) { code = stapel[i].code; break; }
      const aus = Object.assign({}, z, { code });
      stapel.push({ ebene: z.ebene, code: codeAus(z.nummer, codes) ? code : (z.art === "modul" ? "" : code) });
      return aus;
    });
  };
  // Je Code eine Aussage: Modulzeile mit Status, sonst die letzte Prüfung (Versuch, Datum). eindeutig: Modulzeile oder genau
  // eine Prüfung. stati: alle Status mit Semester (ohne Noten), für die Erinnerung an die Prüfungsanmeldung.
  const zusammenfassen = (zeilen) => {
    const aus = {};
    const je = {};
    for (const z of zeilen || []) if (z.code && (z.status || z.art === "modul")) (je[z.code] = je[z.code] || []).push(z);
    for (const code of Object.keys(je)) {
      const l = je[code];
      const modul = l.filter((z) => z.art === "modul" && z.status && codeAus(z.nummer, [code]) === code)[0];
      const pr = l.filter((z) => z.art !== "modul" && z.status);
      const sortiert = pr.slice().sort((a, b) => (a.versuch - b.versuch) || String(a.datum).localeCompare(String(b.datum)));
      const basis = modul || sortiert[sortiert.length - 1];
      if (!basis) continue;
      const stati = [];
      for (const z of l) if (z.status && !stati.some((s) => s.status === z.status && s.semester === z.semester)) stati.push({ status: z.status, semester: z.semester });
      aus[code] = { status: basis.status, note: basis.note, unbenotet: !!basis.unbenotet, versuch: basis.versuch || 0, semester: basis.semester,
        datum: basis.datum, eindeutig: !!modul || pr.length === 1, stati };
    }
    return aus;
  };

  // ---------- Belegungen ----------
  const belegungen = (html) => {
    const b = baumVon(html);
    const form = alle(b, (e) => e.name === "form" && attr(e, "id") === "studentOverviewForm")[0];
    if (!form) return { art: "unsicher", grund: "aufbau", semester: "", eintraege: [] };
    const sel = mitId(form, ID_SEMESTER);
    const opt = sel ? erstes(sel, (e) => e.name === "option" && Object.prototype.hasOwnProperty.call(e.attrs, "selected")) : null;
    const semester = opt ? semesterName(text(opt)) : "";
    if (!semester) return { art: "unsicher", grund: "semester", semester: "", eintraege: [] };
    const bereich = mitId(form, ID_BELEGUNGEN);
    if (!bereich) return { art: "unsicher", grund: "aufbau", semester, eintraege: [] };
    const ueber = alle(bereich, (e) => /^h[1-6]$/.test(e.name));
    if (!ueber.length) {
      const hinweise = infoTexte(bereich);
      if (hinweise.length === 1 && LEER_BELEGUNGEN.indexOf(hinweise[0]) >= 0 && !erstes(bereich, (e) => e.name === "table")) return { art: "leer", semester, eintraege: [] };
      return { art: "unsicher", grund: hinweise.length ? "hinweis" : "aufbau", semester, eintraege: [] };
    }
    // Jede Überschrift „Prüfung: <Nummer> <Titel>“ mit der Tabelle bis zur nächsten Überschrift
    const reihe = alle(bereich, (e) => /^h[1-6]$/.test(e.name) || e.name === "table");
    const eintraege = [];
    for (let i = 0; i < reihe.length; i++) {
      const h = reihe[i];
      if (!/^h[1-6]$/.test(h.name)) continue;
      const t = norm(text(h)), k = t.indexOf(":");
      const praefix = k > 0 ? klein(t.slice(0, k)) : "";
      if (PRAEFIX_VERANSTALTUNG.indexOf(praefix) >= 0) continue;
      if (PRAEFIX_PRUEFUNG.indexOf(praefix) < 0) return { art: "unsicher", grund: "eintrag", semester, eintraege: [] };
      const rest = norm(t.slice(k + 1)), nummer = rest.split(" ")[0];
      const tab = reihe[i + 1] && reihe[i + 1].name === "table" ? reihe[i + 1] : null;
      let status = "";
      if (tab) {
        const sp = spaltenVon(tab);
        const zeile = alle(tab, (e) => e.name === "tr" && !!erstes(e, (x) => x.name === "td"))[0];
        const z = zeile ? zellen(zeile) : [];
        if ("status" in sp && z.length === sp.anzahl) status = BELEGUNG[klein(text(z[sp.status]))] || "";
      }
      if (!nummer || !status) return { art: "unsicher", grund: "eintrag", semester, eintraege: [] };
      eintraege.push({ nummer, titel: rest.slice(nummer.length).trim(), status });
    }
    return { art: "ok", semester, eintraege };
  };
  // Prüfungsanmeldungen je Code (Nummer beginnt mit dem Code, sonst der erste Code im Titel); nie Titel im Ergebnis
  const pruefungenZuordnen = (eintraege, codes) => {
    const pruefungen = {};
    let unzugeordnet = 0;
    for (const e of eintraege || []) {
      let code = codeAus(e.nummer, codes);
      if (!code) for (const c of codes || []) if (new RegExp("(?:^|[^A-Z0-9])" + c + "(?:[^A-Z0-9]|$)").test(e.titel || "")) { code = c; break; }
      if (!code) { unzugeordnet++; continue; }
      // mehrere Einträge zu einem Code: eine gültige Anmeldung gewinnt über zurückgetreten/abgemeldet
      const gilt = (s) => s === "angemeldet" || s === "zugelassen" || s === "abschnitt begonnen";
      if (!pruefungen[code] || (!gilt(pruefungen[code].status) && gilt(e.status))) pruefungen[code] = { status: e.status };
    }
    return { pruefungen, unzugeordnet };
  };

  // ---------- „Aufbau kopieren (ohne deine Daten)“ ----------
  // Pfade tag#id.klasse (Ziffern → #), Spaltenköpfe nur aus der Wortliste, Zeilen je Ebene mit Art und Status nur aus den
  // bekannten Listen, Hinweise nur geschwärzt (Ziffern → #, unbekannte großgeschriebene Wörter → X). Nie Namen, Noten, Nummern.
  const WORTE = ["Es", "Sie", "Ihre", "Die", "Der", "Das", "Ein", "Eine", "Kein", "Keine", "Bitte", "Datensätze", "Veranstaltungen", "Prüfungen", "Prüfung", "Anmeldung", "Login-Fehlversuche",
    "Zugangsdaten", "Funktion", "Leistungen", "Belegungen", "Semester", "Alma", "No", "There", "You", "Your", "The", "Please",
    "Records", "Courses", "Examinations", "Exams", "Login"];
  const schwaerzen = (s) => norm(s).replace(/[0-9]/g, "#").replace(/[A-ZÄÖÜ][\wäöüßÄÖÜ-]*/g, (w) => (WORTE.indexOf(w) >= 0 ? w : "X")).slice(0, 200);
  const pfad = (e) => e.name + (attr(e, "id") ? "#" + attr(e, "id").replace(/[0-9]+/g, "#") : "")
    + (attr(e, "class") ? "." + attr(e, "class").split(/\s+/).filter(Boolean).slice(0, 3).join(".") : "");
  const kopfWorte = [].concat.apply([], Object.keys(KOEPFE).map((k) => KOEPFE[k])).concat(["credits", "ects", "vermerk", "remark", "prüfer/-in", "examiner"]);
  const fingerabdruck = (html) => {
    const b = baumVon(html);
    const z = ["seite: " + seite(b), "sprache: " + ((erstes(b, (e) => e.name === "html") && klein(attr(erstes(b, (e) => e.name === "html"), "lang"))) || "?")];
    const L = leistungen(b), B = belegungen(b);
    z.push("leistungen: " + L.art + (L.grund ? " (" + L.grund + ")" : ""), "belegungen: " + B.art + (B.grund ? " (" + B.grund + ")" : ""));
    for (const id of [ID_LEISTUNGEN, ID_BELEGUNGEN]) {
      const w = mitId(b, id);
      if (!w) { z.push("fehlt: " + id); continue; }
      z.push("bereich: " + pfad(w));
      for (const t of infoTexte(w)) z.push("  hinweis: " + schwaerzen(t));
      for (const tab of alle(w, (e) => e.name === "table")) {
        const ths = alle(tab, (e) => e.name === "th").map((th) => { const t = klein(text(th)); return t ? (kopfWorte.indexOf(t) >= 0 ? t : "?") : "-"; });
        z.push("  tabelle: " + pfad(tab) + " | " + ths.join(" | "));
        for (const tr of alle(tab, (e) => e.name === "tr" && !!erstes(e, (x) => x.name === "td"))) {
          const sp = spaltenVon(tab), st = statusAus(zelleVon(tr, sp, "status"));
          const img = erstes(tr, (e) => e.name === "img" && !!attr(e, "alt"));
          const note = norm(text(zelleVon(tr, sp, "note")));
          z.push("    zeile: ebene " + ebeneVon(tr) + " · art " + (img ? ARTEN[klein(attr(img, "alt"))] || "?" : "-") + " · status "
            + (st.status || (st.pv ? "PV" : st.unsicher ? "?" : "-")) + " · note " + (noteNorm(note) ? "ja" : note ? (UNBENOTET.indexOf(klein(note)) >= 0 ? "unbenotet" : "?") : "-")
            + " · zellen " + zellen(tr).length);
        }
      }
      for (const h of alle(w, (e) => /^h[1-6]$/.test(e.name))) {
        const t = norm(text(h)), k = t.indexOf(":");
        z.push("  überschrift: " + (k > 0 ? schwaerzen(t.slice(0, k)) + ": …" : "…"));
      }
    }
    for (const m of meldungen(b)) z.push("meldung: " + schwaerzen(m));
    return z.join("\n");
  };

  return { seite, anmeldeFormular, fehler, stundenplanLink, leistungen, belegungen, zuordnen, zusammenfassen, pruefungenZuordnen, fingerabdruck,
    semesterName, noteNorm, HOST, ABGESCHLOSSEN };
};

module.exports = function (ctx) {
  const H = ctx && ctx.user && ctx.user["ilias-html"];
  return erzeugen(H);
};
module.exports.erzeugen = erzeugen;
module.exports.semesterName = semesterName;
