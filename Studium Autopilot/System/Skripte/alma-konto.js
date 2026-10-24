// Noten & Anmeldungen aus Alma (seit 0.4.5, Beta): Das Plugin meldet sich auf einem deiner Geräte mit deinem Uni-Zugang bei
// Alma an, liest „Leistungen“ und „Belegungen“ deines Kontos und schlägt dir neue Noten (und Korrekturen, siehe vorschlagAus) auf
// der Modulseite zum Übernehmen vor. Es schreibt nie selbst in deine Modulnotizen (nur nach deinem Tipp auf Übernehmen). In der
// Anmeldephase erinnert es dich, wenn laut Alma eine Prüfungsanmeldung fehlt. Doku: docs/architektur/alma.md.
//
// Beta: läuft nur mit update_kanal: beta (System/Einstellungen.md) bzw. ALMA_KONTO_STABIL, bis echte gefüllte Seiten (Prüfungs-
//   anmeldungen aus einer Anmeldephase, erste Noten) mit dem Leser abgeglichen sind. Ohne Beta keine Anfrage; Zeile und „Daten
//   aus Alma löschen“ bleiben, solange es eine Zustimmung oder Daten gibt.
// Bausteine: alma-konto-html.js (Seiten lesen, rein), ilias-netz.js (Sitzung, Dienst „alma“: nur alma.uni-tuebingen.de),
//   sperre.js (ein Schreiber), ilias.js (Uni-Zugang: Benutzername, Passwort im Schlüsselbund, Ablehnungs-Marker).
// Zustimmung je Gerät: Fenster mit deinem Benutzernamen und „Einschalten“ (gerätelokal eba-alma-konto-an = Zeitpunkt). Erst dann
//   nutzt dieses Skript das Passwort aus dem Schlüsselbund von ILIAS, und nur unmittelbar vor dem Absenden an Alma.
// Uni-Zugang (ilias.js, uniZugang): Alma meldet sich nur an, wenn ILIAS genau dieses Passwort bestätigt hat, nie als Erste und nie,
//   solange System/Daten/uni-zugang.json eine neuere Ablehnung meldet. Lehnt Alma eindeutig ab, schreibt dieses Gerät den Marker
//   (alle Geräte mit diesem Passwort halten an). Unklare Antworten, zweiter Faktor, Zustimmungsseite: nur Alma auf diesem Gerät
//   pausiert (Erneut versuchen). Höchstens eine Anmeldung je Lauf, nie ein zweiter Versuch.
// Stundenplan-Link (seit 0.4.8, ohne Beta und ohne „Einschalten“): Für den Uni-Login (uni-login.js) holt stundenplanLink() mit
//   derselben Anmeldung den Abo-Link aus der Seite „Stundenplan“; alma.js holt damit den Stundenplan wie mit einem kopierten Link.
// Ablauf eines Laufs (Drossel: eine Anfrage zugleich, 2 s Abstand; ganzer Lauf höchstens 3 Min.): Startseite → schon angemeldet?
//   sonst Formular prüfen (Host, Pfad, Port) und POST mit Benutzername und Passwort → angemeldet nur mit Abmelde-Link →
//   Leistungen (zugeklappt: einmal „Alle aufklappen“) → Belegungen → Abmelden (type=4) in jedem Ausgang. Stopp für den Tag bei
//   429/403 oder zweimal 5xx in Folge; nach drei unerwarteten Antworten 24 Std. Pause.
// Fällig: nach geprueft (letzte vollständige Prüfung, synchronisiert): älter als 12 Std., in der Anmeldephase (zentrale Frist
//   „Prüfungsanmeldung … Haupttermin“ heute offen) älter als 3 Std.; ein Lauf, der den Anmelde-POST erreicht hat, zählt als Versuch
//   (der nächste frühestens nach 12 bzw. 3 Std.); Fehler vor dem POST → nach 30 Min. Aktualisieren jederzeit (≥ 2 Min. Abstand).
// Dateien (synchronisiert, nie im Repo, siehe .gitignore/release.py/pruefen.py):
//   System/Daten/alma-konto.json   { version, geprueft, stand, geraet, leistungen: { art, module: { <Code>: { status, note, unbenotet,
//                                  versuch, semester, datum, eindeutig, stati } } }, belegungen: { art, semester, pruefungen:
//                                  { <Code>: { status } }, unzugeordnet } } – nur der Abrufer schreibt; unlesbar → beim nächsten Lauf
//                                  neu; „unsicher“ lässt die alten Werte dieser Seite stehen und setzt geprueft nicht.
//   System/Daten/alma-konto-abruf.json  Abrufer-Sperre (sperre.js).
//   System/Daten/alma-konto-aus.json    Grabstein { geloescht, geraet }: „Daten aus Alma löschen“ auf einem Gerät schaltet jedes Gerät
//                                  aus, dessen Zustimmung älter ist. Konfliktkopien (alma-konto*.json) räumt der Abrufer weg.
// Gerätelokal: eba-alma-konto-an (Zustimmung), eba-alma-konto-stand (Versuche, Pausen), eba-alma-konto-protokoll (letzte 20 Läufe,
//   nur Art und Grund), eba-alma-konto-aufbau (Aufbau einer unsicheren Seite ohne Werte, für „Aufbau kopieren“).
// Datenschutz: Noten nur in alma-konto.json und auf der Modulseite; nie in Hinweisen (Notice), Konsole, Protokoll, Fehlern, im
//   Datenkanal oder im Release. Nie Name, Matrikelnummer, Prüfer:innen, Vermerke, Titel.
// Für andere Skripte: ctx.almaKonto (siehe api unten). Testeinstiege: erzeugen(abh) (tests/alma-konto.test.js),
//   plugin.testAlmaAus = true (kein automatischer Lauf); in Obsidian ersetzt ctx.almaKonto.testSetzen({ beta, zugang, zustand })
//   diese Werte nur im Speicher (Oberfläche ansehen ohne Alma, ohne Dateien, ohne Sync; null = wieder echt).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const ALMA_KONTO_STABIL = false;
const QUELLE = "alma-konto"; // Schlüssel der Quelle (eba.quelleExtern, sperre.js)
const STAND = "System/Daten/alma-konto.json";
const ABRUF = "System/Daten/alma-konto-abruf.json";
const AUS = "System/Daten/alma-konto-aus.json";
const DATEN = "System/Daten";
const L = { an: "eba-alma-konto-an", stand: "eba-alma-konto-stand", protokoll: "eba-alma-konto-protokoll", aufbau: "eba-alma-konto-aufbau" };
const ALMA = "https://alma.uni-tuebingen.de";
const URL_START = ALMA + "/alma/pages/cs/sys/portal/hisinoneStartPage.faces";
const URL_LEISTUNGEN = ALMA + "/alma/pages/sul/examAssessment/personExamsReadonly.xhtml?_flowId=examsOverviewForPerson-flow"
  + "&navigationPosition=hisinoneMeinStudium%2CexamAssessmentForStudent&recordRequest=true";
const URL_BELEGUNGEN = ALMA + "/alma/pages/cm/exa/enrollment/info/start.xhtml?_flowId=searchOwnEnrollmentInfo-flow"
  + "&navigationPosition=hisinoneMeinStudium%2ChisinoneOwnEnrollmentList&recordRequest=true";
const URL_ABMELDEN = ALMA + "/alma/rds?state=user&type=4&category=auth.logout";
// Mein Studium → Stundenplan (wie verbindungen.js ALMA_STUNDENPLAN): trägt den Abo-Link für den Uni-Login
const URL_STUNDENPLAN = ALMA + "/alma/pages/plan/individualTimetable.xhtml?_flowId=individualTimetableSchedule-flow";
const MIN = 60e3, STUNDE = 60 * MIN;
const NORMAL = 12 * STUNDE, PHASE = 3 * STUNDE, NETZ_WIEDER = 30 * MIN, KNOPF_ABSTAND = 2 * MIN, LAUF_MAX = 3 * MIN;
const PAUSE_UNERWARTET = 24 * STUNDE, UNERWARTET_MAX = 3, FRISCH = 26 * STUNDE, PROTOKOLL_MAX = 20;
const DROSSEL = { parallel: 1, abstand: 2000 };
const PAUSEN = ["abgelehnt-unklar", "zwei-faktor", "zustimmung"]; // nur nach deinem Tipp wieder (Erneut versuchen)
const GILT = ["angemeldet", "zugelassen", "abschnitt begonnen"]; // gültige Prüfungsanmeldung in den Belegungen

// ---------- Reine Logik (ohne Obsidian, tests/alma-konto.test.js) ----------
const zeitVon = (s) => { const t = Date.parse(s || ""); return isNaN(t) ? 0 : t; };
const text = (v) => String(v == null ? "" : v).trim();
const tag = (v) => text(v).slice(0, 10);
const plusTage = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// SHA-256 (synchron, UTF-8) für die Ausblenden-Schlüssel in der Modulnotiz (keine lesbare Note im Frontmatter)
const sha256 = (eingabe) => {
  const bytes = new TextEncoder().encode(String(eingabe));
  const k = [], h0 = [];
  for (let c = 2, n = 0; n < 64; c++) {
    let prim = true;
    for (let d = 2; d * d <= c; d++) if (c % d === 0) { prim = false; break; }
    if (!prim) continue;
    if (n < 8) h0[n] = (Math.pow(c, 1 / 2) * 4294967296) | 0;
    k[n++] = (Math.pow(c, 1 / 3) * 4294967296) | 0;
  }
  const laenge = bytes.length, gesamt = ((laenge + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(gesamt);
  m.set(bytes);
  m[laenge] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(gesamt - 4, (laenge * 8) >>> 0);
  dv.setUint32(gesamt - 8, Math.floor((laenge * 8) / 4294967296));
  const r = (x, s) => (x >>> s) | (x << (32 - s));
  const w = new Int32Array(64);
  let H = h0.slice();
  for (let i = 0; i < gesamt; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getInt32(i + j * 4);
    for (let j = 16; j < 64; j++) {
      const a = w[j - 15], b = w[j - 2];
      w[j] = (w[j - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + w[j - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) | 0;
    }
    let A = H[0], B = H[1], C = H[2], D = H[3], E = H[4], F = H[5], G = H[6], X = H[7];
    for (let j = 0; j < 64; j++) {
      const t1 = (X + (r(E, 6) ^ r(E, 11) ^ r(E, 25)) + ((E & F) ^ (~E & G)) + k[j] + w[j]) | 0;
      const t2 = ((r(A, 2) ^ r(A, 13) ^ r(A, 22)) + ((A & B) ^ (A & C) ^ (B & C))) | 0;
      X = G; G = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
    }
    H = [A, B, C, D, E, F, G, X].map((x, j) => (x + H[j]) | 0);
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
};
const ausblendSchluessel = (code, m) => sha256([code, m.status, m.note || "", m.versuch || ""].join("|")).slice(0, 8);

// Inhalt von alma-konto.json prüfen → Zustand oder null (unlesbar, halb geschrieben, fremd)
const zustandPruefen = (t) => {
  let o = null;
  try { o = typeof t === "string" ? JSON.parse(t) : t; } catch (e) { return null; }
  if (!o || typeof o !== "object" || o.version !== 1 || !o.leistungen || !o.belegungen) return null;
  const l = o.leistungen, b = o.belegungen;
  if (typeof l.module !== "object" || !l.module || typeof b.pruefungen !== "object" || !b.pruefungen) return null;
  return o;
};

// Neuer Zustand nach einem Lauf. L/B: Ergebnis der Leser; A: alma-konto-html. Unsicher → alte Werte dieser Seite bleiben.
const zustandBauen = ({ alt, L, B, codes, jetzt, geraet, A }) => {
  const a = alt || { leistungen: { art: "", module: {} }, belegungen: { art: "", semester: "", pruefungen: {}, unzugeordnet: 0 }, geprueft: "", stand: "" };
  const lesbar = (x) => x && (x.art === "ok" || x.art === "leer");
  const l = L && L.art === "ok" ? { art: "ok", module: A.zusammenfassen(A.zuordnen(L.zeilen, codes)) }
    : L && L.art === "leer" ? { art: "leer", module: {} } : { art: "unsicher", module: a.leistungen.module || {} };
  let b;
  if (B && B.art === "ok") { const z = A.pruefungenZuordnen(B.eintraege, codes); b = { art: "ok", semester: B.semester, pruefungen: z.pruefungen, unzugeordnet: z.unzugeordnet }; }
  else if (B && B.art === "leer") b = { art: "leer", semester: B.semester, pruefungen: {}, unzugeordnet: 0 };
  else b = { art: "unsicher", semester: a.belegungen.semester || "", pruefungen: a.belegungen.pruefungen || {}, unzugeordnet: a.belegungen.unzugeordnet || 0 };
  const inhalt = (x, y) => JSON.stringify([x.module, y.pruefungen, y.semester, y.unzugeordnet]);
  return {
    version: 1, geprueft: lesbar(L) && lesbar(B) ? jetzt : a.geprueft || "", stand: !a.stand || inhalt(l, b) !== inhalt(a.leistungen, a.belegungen) ? jetzt : a.stand,
    geraet, leistungen: l, belegungen: b,
  };
};

// Vorschlag für eine Modulnotiz: { code, felder, text, satz, schluessel, marke } | null. Nur eindeutige Aussagen (Modulzeile oder
// genau eine Prüfung); nichts, was schon so in der Notiz steht oder ausgeblendet ist. Note nur im Text des Modulfelds, nie in
// Hinweisen. Korrekturen (nie still, immer als Vorschlag): eine geänderte Note oder ein geänderter Status in Alma wie jede neue
// Angabe; „angemeldet“ in der Notiz, aber laut Alma zurückgetreten oder abgemeldet → „läuft“; „bestanden“/„anerkannt“ aus Alma
// übernommen (alma_uebernommen passt noch zu Status, Note und Versuch der Notiz), aber in Alma kein Ergebnis mehr → zurück auf
// „angemeldet“ bzw. „läuft“ ohne Note, nur wenn Alma noch andere Ergebnisse zeigt und höchstens ein Modul zugleich betroffen ist
// (eine gekürzte Liste in Alma soll nie viele Noten auf einmal zum Löschen anbieten). Was du selbst eingetragen hast, ohne dass
// Alma ausdrücklich widerspricht, bleibt.
const STATUS_TEXT = { "bestanden": "bestanden", "nicht bestanden": "nicht bestanden", "endgültig nicht bestanden": "endgültig nicht bestanden",
  "anerkannt": "anerkannt", "angemeldet": "angemeldet", "zurückgetreten": "zurückgetreten", "abgemeldet": "abgemeldet", "": "kein Ergebnis mehr" };
const ERGEBNIS = ["bestanden", "nicht bestanden", "endgültig nicht bestanden", "anerkannt"];
const ZURUECK = ["zurückgetreten", "abgemeldet"];
// Schlüssel der Werte einer Modulnotiz (Status, Note, Versuch), nach Übernehmen in alma_uebernommen; keine lesbare Note
const notizSchluessel = (code, fm) => sha256([code, text(fm.status).toLowerCase() || "offen", text(fm.ergebnis).replace(".", ","),
  Number(fm.versuch) || 1].join("|")).slice(0, 8);
// Ergebnis aus Alma übernommen, in Leistungen (ok, mit mindestens einem Ergebnis) aber keins mehr für den Code? Teure Prüfsumme zuletzt.
const ergebnisWeg = (fm, z) => {
  const code = text(fm && fm.code), st = text(fm && fm.status).toLowerCase();
  const l = z && z.leistungen, mod = (l && l.module) || {}, m = mod[code];
  if (!code || ["bestanden", "anerkannt"].indexOf(st) < 0 || !text(fm.alma_uebernommen) || !l || l.art !== "ok") return false;
  if (m && !(m.eindeutig && ["angemeldet"].concat(ZURUECK).indexOf(m.status) >= 0)) return false;
  if (!Object.keys(mod).some((c) => ERGEBNIS.indexOf(mod[c].status) >= 0)) return false;
  return text(fm.alma_uebernommen) === notizSchluessel(code, fm);
};
// alle() → Frontmatter aller Modulnotizen (optional; ohne nur diese Notiz): für die Grenze „höchstens ein Modul zugleich“
const vorschlagAus = (fm, z, alle) => {
  const code = text(fm && fm.code);
  if (!code || !z) return null;
  const st = text(fm.status).toLowerCase() || "offen";
  const offen = ["offen", "läuft"].indexOf(st) >= 0;
  const m = z.leistungen && z.leistungen.module ? z.leistungen.module[code] : null;
  const p = z.belegungen && z.belegungen.pruefungen ? z.belegungen.pruefungen[code] : null;
  let quelle = null, felder = null, satz = "";
  if (m && m.eindeutig && ERGEBNIS.indexOf(m.status) >= 0) {
    quelle = m;
    felder = { status: m.status === "endgültig nicht bestanden" ? "nicht bestanden" : m.status };
    if (m.note) felder.ergebnis = m.note;
    if (m.versuch) felder.versuch = m.versuch;
    if (m.status === "endgültig nicht bestanden") satz = "Endgültig: bitte mit dem Prüfungsamt sprechen.";
  } else if (m && m.eindeutig && m.status === "angemeldet" && offen) {
    quelle = m;
    felder = { status: "angemeldet" };
  } else if (p && GILT.indexOf(p.status) >= 0 && offen) {
    quelle = { status: "angemeldet", note: "", versuch: 0, datum: "" };
    felder = { status: "angemeldet" };
  } else if (st === "angemeldet" && m && m.eindeutig && ZURUECK.indexOf(m.status) >= 0 && !(p && GILT.indexOf(p.status) >= 0)) {
    quelle = m;
    felder = { status: "läuft" };
  } else if (st === "angemeldet" && p && ZURUECK.indexOf(p.status) >= 0 && !(m && (m.stati || []).some((s) => s.status === "angemeldet"))) {
    quelle = { status: p.status, note: "", versuch: 0, datum: "" };
    felder = { status: "läuft" };
  } else if (ergebnisWeg(fm, z) && (typeof alle === "function" ? alle() : [fm]).filter((x) => ergebnisWeg(x, z)).length <= 1) {
    quelle = { status: m ? m.status : "", note: "", versuch: 0, datum: m ? m.datum : "" };
    felder = { status: (m && m.status === "angemeldet") || (p && GILT.indexOf(p.status) >= 0) ? "angemeldet" : "läuft", ergebnis: "" };
  }
  if (!felder) return null;
  // Nur, was sich ändert (Versuch 1 = leeres Feld)
  const gleich = { status: (v) => v === st, ergebnis: (v) => text(fm.ergebnis).replace(".", ",") === v, versuch: (v) => (Number(fm.versuch) || 1) === v };
  for (const k of Object.keys(felder)) if (gleich[k](felder[k])) delete felder[k];
  if (!Object.keys(felder).length) return null;
  const schluessel = ausblendSchluessel(code, quelle);
  const aus = Array.isArray(fm.alma_ausgeblendet) ? fm.alma_ausgeblendet.map(String) : fm.alma_ausgeblendet ? [String(fm.alma_ausgeblendet)] : [];
  if (aus.indexOf(schluessel) >= 0) return null;
  const d = tag(quelle.datum);
  const teile = ["Alma: " + STATUS_TEXT[quelle.status]];
  if (quelle.note) teile.push(quelle.note);
  if (quelle.versuch > 1) teile.push(quelle.versuch + ". Versuch");
  if (d) teile.push("Stand " + d.slice(8, 10) + "." + d.slice(5, 7) + ".");
  // Marke für die Notiz nach Übernehmen: so erkennt ein späterer Vorschlag Werte, die aus Alma kamen
  return { code, felder, text: teile.join(" · "), satz, schluessel, marke: notizSchluessel(code, Object.assign({}, fm, felder)) };
};

// Anmeldephase: zentrale Frist „Prüfungsanmeldung … Haupttermin“, heute offen → { datum, bis } | null (Nachholtermine nicht)
const anmeldeFenster = (termine, heute) => {
  for (const t of termine || []) {
    const fm = (t && t.fm) || {};
    const titel = text(fm.titel || (t.f && t.f.basename)).toLowerCase();
    if (text(fm.kategorie) !== "Frist" || titel.indexOf("prüfungsanmeldung") < 0 || titel.indexOf("haupttermin") < 0) continue;
    const von = tag(fm.datum), bis = tag(fm.bis) || von;
    if (von && von <= heute && heute <= bis) return { datum: von, bis };
  }
  return null;
};

// Erinnerung an die Prüfungsanmeldung (nur, wenn eine fehlt): → null | { art: "selbst" } | { art: "fehlt", codes, stand }
// module: [{ code, status, semester, fm }] (ctx.modell), termine: [{ f, fm }], aktuell: { name } (aktuelles Semester),
// pruefungVon(code) → Prüfung des Moduls nach der einen Regel des Fachmodells (ctx.modell.pruefungVon: ohne Zwischentests,
// Nachholtermin nur nach „nicht bestanden“, entfallene nie) oder null. Nie „alles angemeldet“; im Zweifel „selbst“.
const fehlendeAnmeldungen = ({ module, termine, zustand, heute, jetzt, aktuell, pruefungVon }) => {
  const fenster = anmeldeFenster(termine, heute);
  if (!fenster) return null;
  const z = zustand;
  const lesbar = (x) => x && (x.art === "ok" || x.art === "leer");
  const sem = aktuell && aktuell.name ? aktuell.name : "";
  if (!z || !lesbar(z.leistungen) || !lesbar(z.belegungen) || !sem || z.belegungen.semester !== sem || z.belegungen.unzugeordnet
    || !zeitVon(z.geprueft) || jetzt - zeitVon(z.geprueft) > FRISCH) return { art: "selbst" };
  // Prüfung nach dem Beginn der Frist (bis 120 Tage nach ihrem Ende), noch nicht abgehakt
  const pruefungDa = (m) => {
    const p = typeof pruefungVon === "function" ? pruefungVon(m.code) : null;
    return !!p && !p.erledigt && tag(p.datum) >= fenster.datum && tag(p.datum) <= plusTage(fenster.bis, 120);
  };
  const angemeldet = (code) => {
    const p = z.belegungen.pruefungen[code];
    if (p && GILT.indexOf(p.status) >= 0) return true;
    const m = z.leistungen.module[code];
    return !!m && (m.stati || []).some((s) => (s.status === "angemeldet" && (!s.semester || s.semester === sem))
      || (["bestanden", "nicht bestanden", "endgültig nicht bestanden"].indexOf(s.status) >= 0 && s.semester === sem));
  };
  const fehlt = (module || []).filter((m) => {
    const st = text(m.status).toLowerCase();
    if (!m.code || ["bestanden", "anerkannt"].indexOf(st) >= 0) return false;
    if (!(st === "läuft" || m.semester === sem)) return false;
    if (m.fm && text(m.fm.anmeldung_verzicht) === sem) return false;
    return pruefungDa(m) && !angemeldet(m.code);
  }).map((m) => m.code).sort();
  return fehlt.length ? { art: "fehlt", codes: fehlt, stand: z.geprueft } : null;
};

// ---------- Motor (ohne Obsidian testbar) ----------
// abh: {
//   io: { lesenText(p), schreibenText(p, t), loeschen(p) (endgültig, nicht Papierkorb), existiert(p), liste(ordner) → [Dateiname] },
//   lokal(k, v?), sperre: sperre.js (erzeugen), zugang() → ctx.ilias.uniZugang(), kennwort() → Text (erst beim Absenden),
//   abgelehnt(dienst) → Marker schreiben (ctx.ilias.zugangAbgelehnt), quelleExtern(schluessel) → bool (eba.quelleExtern, bei
//   jedem Lauf gefragt), beta() → bool, phase() → bool,
//   netz() → ilias-netz.js, html() → alma-konto-html.js, codes() → [Modulcodes des Tresors], notizen()? → [Frontmatter der
//   Modulnotizen] (Grenze für „kein Ergebnis mehr“), jetzt() → Date, warten(ms)?,
//   mobil, geraetId(), melden(text)?, geaendert(x)? }
const erzeugen = (abh) => {
  const io = abh.io, lokal = abh.lokal;
  const ms = () => abh.jetzt().getTime();
  const iso = () => abh.jetzt().toISOString();
  const alter = (s) => { const t = zeitVon(s); return t ? ms() - t : Infinity; };
  const melden = (x) => { try { if (abh.geaendert) abh.geaendert(x || null); } catch (e) { /* Hörer egal */ } };
  const sicher = (fn, sonst) => { try { return fn(); } catch (e) { return sonst; } };
  const fehlerArt = (art, grund) => { const e = new Error(art); e.art = art; e.grund = grund || ""; return e; };
  const morgen = () => { const d = abh.jetzt(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString(); };

  // ----- gerätelokal -----
  const an = () => { const v = lokal(L.an); return typeof v === "string" ? v : ""; };
  const lstand = () => Object.assign({ versuch: "", vorPost: "", letzter: "", grund: "", pause: "", pauseBis: "", unerwartet: 0, server: 0, aus: "", ergebnis: "", fehlerZeit: "" }, lokal(L.stand) || {});
  const lsetzen = (x) => lokal(L.stand, Object.assign(lstand(), x));
  const protokoll = () => { const p = lokal(L.protokoll); return Array.isArray(p) ? p.slice() : []; };

  // ----- synchronisiert (zwischengespeichert; lesen() frischt auf) -----
  let zustand = null, grab = null, sperreInfo = null;
  const sperre = () => abh.sperre.erzeugen({ io: { lesen: (p) => io.lesenText(p), schreiben: (p, t) => io.schreibenText(p, t) }, quelle: QUELLE,
    geraetId: abh.geraetId, jetzt: abh.jetzt, mobil: !!abh.mobil });
  const kopien = () => sicher(() => io.liste(DATEN), []).filter((n) => /^alma-konto.*\.json$/i.test(n) && ["alma-konto.json", "alma-konto-abruf.json", "alma-konto-aus.json"].indexOf(n) < 0);
  const grabsteinLesen = async () => {
    let best = null;
    for (const n of sicher(() => io.liste(DATEN), []).filter((x) => /^alma-konto-aus.*\.json$/i.test(x))) {
      let o = null;
      try { o = JSON.parse((await io.lesenText(DATEN + "/" + n)) || "null"); } catch (e) { o = null; }
      if (o && zeitVon(o.geloescht) && (!best || zeitVon(o.geloescht) > zeitVon(best.geloescht))) best = { geloescht: String(o.geloescht), geraet: String(o.geraet || "") };
    }
    return best;
  };
  const lesen = async () => {
    let t = null;
    const ersatz = sicher(() => (abh.testZustand ? abh.testZustand() : undefined), undefined);
    if (ersatz === undefined) { try { t = await io.lesenText(STAND); } catch (e) { t = null; } }
    zustand = zustandPruefen(ersatz === undefined ? t : ersatz);
    grab = await grabsteinLesen();
    try { sperreInfo = await sperre().pruefen(); } catch (e) { sperreInfo = null; }
    // Auf einem anderen Gerät gelöscht (Grabstein jünger als meine Zustimmung): hier ausschalten und es sagen
    if (an() && grab && zeitVon(grab.geloescht) > zeitVon(an())) { lokal(L.an, null); lsetzen({ aus: "anderes-geraet" }); }
    return zustand;
  };

  const beta = () => ALMA_KONTO_STABIL || !!sicher(() => abh.beta(), false);
  // Quellen außerhalb des Plugins: bei jedem Lauf und jeder Anzeige neu gefragt (eigener Abgleich, eigener Server)
  const extern = () => !!sicher(() => abh.quelleExtern(QUELLE), false);
  const zugang = () => sicher(() => abh.zugang(), null) || { benutzer: "", gesperrt: false, bestaetigt: false };
  const phase = () => !!sicher(() => abh.phase(), false);
  const daten = () => !!zustand || !!sicher(() => io.existiert(STAND), false);
  const sichtbar = () => beta() || !!an() || daten();

  // ----- Zeitplan -----
  const intervall = () => (phase() ? PHASE : NORMAL);
  const faelligSonst = () => {
    const s = lstand(), z = zugang();
    if (!beta() || extern() || !an() || !z.benutzer || z.gesperrt || !z.bestaetigt) return false;
    if (s.pause || alter(s.pauseBis) < 0) return false;
    if (zustand && alter(zustand.geprueft) < intervall()) return false;
    if (alter(s.versuch) < intervall() || alter(s.vorPost) < NETZ_WIEDER) return false;
    return true;
  };
  const faellig = () => !laeuft && faelligSonst();

  // ----- Eine Sitzung bei Alma (für den Lauf und den Stundenplan-Link) -----
  // Drossel, nur alma.uni-tuebingen.de (Dienst „alma“), ganze Sitzung höchstens LAUF_MAX: Startseite → schon angemeldet? sonst
  // Formular prüfen und POST mit Benutzername und Passwort (vorPost() unmittelbar davor) → angemeldet nur mit Abmelde-Link →
  // fn(holen, A) → Abmelden (type=4, geprüft am 18.10.2026) in jedem Ausgang. b zählt anfragen, post, angemeldet.
  const mitAlma = async (b, z, vorPost, fn) => {
    const N = sicher(() => abh.netz(), null), A = sicher(() => abh.html(), null);
    if (!N || !A || typeof N.sitzung !== "function") throw fehlerArt("baustein");
    // Drossel mit der Uhr des Geräts; nur Tests geben Uhr und Warten vor
    const dr = typeof N.drossel === "function" ? N.drossel(Object.assign({}, DROSSEL, abh.warten ? { jetzt: () => ms(), warten: abh.warten } : {})) : undefined;
    const sitzung = N.sitzung({ dienst: "alma", drossel: dr, transport: abh.transport });
    const t0 = ms();
    const holen = async (a, immer) => {
      if (!immer && ms() - t0 > LAUF_MAX) throw fehlerArt("zeit");
      b.anfragen++;
      let r;
      try { r = await sitzung.anfrage(a); } catch (e) { throw fehlerArt(e && e.grund === "fremder-host" ? "unerwartet" : "netz", (e && e.grund) || "netz"); }
      if (r.status === 429 || r.status === 403) throw fehlerArt("stopp", "http-" + r.status);
      if (r.status >= 500) throw fehlerArt("server", "http-" + r.status);
      if (r.status >= 400 || typeof r.text !== "string") throw fehlerArt("unerwartet", "http-" + r.status);
      return r;
    };
    let angemeldet = false;
    try {
      let r = await holen({ url: URL_START });
      angemeldet = A.seite(r.text) === "angemeldet"; // iOS hat den letzten Lauf vor dem Abmelden beendet: keine zweite Anmeldung
      if (!angemeldet) {
        const f = A.anmeldeFormular(r.text, r.url || URL_START);
        if (!f) throw fehlerArt("unerwartet", "formular");
        const kw = sicher(() => abh.kennwort(), "");
        if (!kw) throw fehlerArt("ohne-zugang");
        if (vorPost) vorPost();
        b.post = true;
        // Das Passwort steht nur in diesem POST
        r = await holen({ url: f.action, methode: "POST", formular: f.felder.concat([["asdf", z.benutzer], ["fdsa", kw], ["submit", ""]]) });
        angemeldet = A.seite(r.text) === "angemeldet";
        if (!angemeldet) { const g = A.fehler(r.text); throw fehlerArt(g, g); }
      }
      b.angemeldet = true;
      return await fn(holen, A);
    } finally {
      if (angemeldet) { try { await holen({ url: URL_ABMELDEN }, true); } catch (e) { /* Sitzung läuft bei Alma ab */ } }
      try { if (typeof sitzung.schliessen === "function") sitzung.schliessen(); } catch (e) { /* schon zu */ }
    }
  };

  // ----- Ein Lauf -----
  let laeuft = null;
  const lauf = async (o, b) => {
    if (!beta()) { b.art = "beta-aus"; return; }
    if (extern()) { b.art = "extern"; return; }
    await lesen();
    if (!an()) { b.art = lstand().aus ? "aus-anderes-geraet" : "aus"; return; }
    const z = zugang();
    if (!z.benutzer) { b.art = "ohne-zugang"; return; }
    if (z.gesperrt) { b.art = "abgelehnt"; return; }
    if (!z.bestaetigt) { b.art = "wartet-ilias"; return; }
    const s0 = lstand();
    if (!o.manuell && !faelligSonst()) { b.art = "nicht-faellig"; return; }
    if (o.manuell && alter(s0.letzter) < KNOPF_ABSTAND) { b.art = "zu-frueh"; return; }
    const S = sperre();
    const p = await S.pruefen();
    if (p.anderes && !o.hier) { b.art = "anderes-geraet"; sperreInfo = p; return; }
    await S.nehmen({ erzwingen: !!o.hier });
    lsetzen({ letzter: iso(), pause: o.manuell ? "" : s0.pause });
    // Ab dem POST zählt der Lauf als Versuch (höchstens einer je 12 bzw. 3 Std.)
    await mitAlma(b, z, () => lsetzen({ versuch: iso() }), async (holen, A) => {
      let r = await holen({ url: URL_LEISTUNGEN });
      if (A.seite(r.text) !== "angemeldet") throw fehlerArt("unerwartet", "sitzung");
      let Lr = A.leistungen(r.text, r.url || URL_LEISTUNGEN);
      if (Lr.art === "zugeklappt" && Lr.aufklappen) {
        r = await holen({ url: Lr.aufklappen.action, methode: "POST", formular: Lr.aufklappen.felder });
        if (A.seite(r.text) !== "angemeldet") throw fehlerArt("unerwartet", "sitzung");
        Lr = A.leistungen(r.text, r.url || URL_LEISTUNGEN);
      }
      if (Lr.art === "zugeklappt") Lr = { art: "unsicher", grund: "zugeklappt", zeilen: [] };
      if (Lr.art === "unsicher") lokal(L.aufbau, A.fingerabdruck(r.text));
      r = await holen({ url: URL_BELEGUNGEN });
      if (A.seite(r.text) !== "angemeldet") throw fehlerArt("unerwartet", "sitzung");
      const Br = A.belegungen(r.text);
      if (Br.art === "unsicher") lokal(L.aufbau, A.fingerabdruck(r.text));
      b.leistungen = Lr.art; b.belegungen = Br.art;
      b.grund = Lr.art === "unsicher" ? "leistungen-" + (Lr.grund || "") : Br.art === "unsicher" ? "belegungen-" + (Br.grund || "") : "";
      b.L = Lr; b.B = Br;
    });
    // Inzwischen auf einem anderen Gerät gelöscht? Dann nichts schreiben.
    await lesen();
    if (!an()) { b.art = "aus-anderes-geraet"; return; }
    const alt = zustand;
    const neu = zustandBauen({ alt, L: b.L, B: b.B, codes: sicher(() => abh.codes(), []) || [], jetzt: iso(), geraet: abh.geraetId(), A: abh.html() });
    b.neu = Object.keys(neu.leistungen.module).filter((c) => JSON.stringify(neu.leistungen.module[c]) !== JSON.stringify(alt && alt.leistungen.module[c])).length;
    if (!alt || JSON.stringify(neu) !== JSON.stringify(alt)) await io.schreibenText(STAND, JSON.stringify(neu, null, 1) + "\n");
    zustand = neu;
    await kopienWeg();
    b.art = b.leistungen === "unsicher" || b.belegungen === "unsicher" ? "unsicher" : "ok";
    delete b.L; delete b.B;
  };
  // Konfliktkopien (alma-konto 2.json, … (conflicted copy) …) endgültig löschen: nie Noten in Kopien liegen lassen
  const kopienWeg = async () => {
    for (const n of kopien()) { try { await io.loeschen(DATEN + "/" + n); } catch (e) { /* beim nächsten Lauf */ } }
  };

  const nachLauf = (b, beginn, t0) => {
    const s = lstand(), x = { fehlerZeit: iso() };
    if (b.art === "ok" || b.art === "unsicher") Object.assign(x, { grund: "", unerwartet: 0, server: 0, pause: "", ergebnis: b.art, fehlerZeit: "" });
    else if (b.art === "zugang-falsch") Object.assign(x, { grund: b.art, ergebnis: b.art });
    else if (PAUSEN.indexOf(b.art) >= 0) Object.assign(x, { pause: b.art, grund: b.art, ergebnis: b.art });
    else if (b.art === "stopp") Object.assign(x, { pauseBis: morgen(), grund: b.art, ergebnis: b.art });
    else if (b.art === "server" || b.art === "wartung") { const n = (s.server || 0) + 1; Object.assign(x, { server: n, grund: b.art, ergebnis: b.art }, n >= 2 ? { pauseBis: morgen() } : {}); }
    else if (b.art === "netz" || b.art === "zeit") Object.assign(x, { grund: b.art, ergebnis: b.art }, b.post ? {} : { vorPost: iso() });
    else if (b.art === "unerwartet" || b.art === "fehler") {
      const n = (s.unerwartet || 0) + 1;
      Object.assign(x, { unerwartet: n, grund: "unerwartet", ergebnis: "unerwartet" }, n >= UNERWARTET_MAX ? { pauseBis: new Date(ms() + PAUSE_UNERWARTET).toISOString() } : {});
    } else return;
    lsetzen(x);
    lokal(L.protokoll, protokoll().concat([{ zeit: beginn, art: b.art, grund: b.grund || "", dauer: Math.round((ms() - t0) / 1000), anfragen: b.anfragen }]).slice(-PROTOKOLL_MAX));
  };
  const meldungText = (b) => {
    switch (b.art) {
      case "ok": return b.neu ? `Alma geprüft, ${b.neu === 1 ? "eine neue Angabe" : b.neu + " neue Angaben"} auf deinen Modulseiten.` : "Alma geprüft, nichts Neues.";
      case "unsicher": return "Die Seite von Alma sah anders aus als erwartet. Bitte in Alma selbst nachsehen.";
      case "zugang-falsch": case "abgelehnt": return "Alma hat dein Passwort abgelehnt. Bitte deinen Uni-Login neu eingeben.";
      case "abgelehnt-unklar": case "unerwartet": case "fehler": return "Alma hat anders geantwortet als erwartet.";
      case "zwei-faktor": return "Alma verlangt einen zweiten Faktor. Melde dich einmal im Browser bei Alma an.";
      case "zustimmung": return "Alma möchte eine Zustimmung. Melde dich einmal im Browser bei Alma an.";
      case "netz": case "zeit": return "Alma: keine Verbindung. Später noch einmal versuchen.";
      case "server": case "wartung": case "stopp": return "Alma ist gerade nicht erreichbar. Später noch einmal versuchen.";
      case "anderes-geraet": return "Alma: Ein anderes Gerät prüft gerade.";
      case "wartet-ilias": return "Alma wartet, bis ILIAS deinen Zugang bestätigt hat.";
      case "ohne-zugang": return "Alma braucht deinen Uni-Login.";
      case "zu-frueh": return "Alma wurde gerade erst geprüft.";
      case "beta-aus": return "Noten & Anmeldungen gibt es gerade nur mit Beta-Versionen.";
      case "extern": return "Noten & Anmeldungen kommen über deinen eigenen Abgleich.";
      case "aus-anderes-geraet": return "Noten & Anmeldungen wurden auf einem anderen Gerät ausgeschaltet.";
      default: return "";
    }
  };
  // o: { manuell (Knopf: Hinweis zum Ergebnis, Abstand 2 Min. statt Zeitplan), hier (Sperre herholen) } → Bericht
  const jetztPruefen = (o) => {
    o = o || {};
    if (laeuft) return laeuft;
    laeuft = (async () => {
      const b = { art: "", grund: "", anfragen: 0, post: false, angemeldet: false, neu: 0 }, t0 = ms(), beginn = iso();
      melden({ art: "start", manuell: !!o.manuell });
      // Holt gerade der Uni-Login den Stundenplan-Link, erst danach (eine Alma-Sitzung zugleich, siehe stundenplanLink)
      if (linkLauf) { try { await linkLauf; } catch (e) { /* egal */ } }
      try { await lauf(o, b); } catch (e) {
        b.art = (e && e.art) || "fehler";
        b.grund = b.grund || (e && e.grund) || "";
        if (b.art === "zugang-falsch") { try { await abh.abgelehnt("alma"); } catch (x) { /* Marker beim nächsten Mal */ } }
        try { console.warn("alma-konto: " + b.art + (b.grund ? " " + b.grund : "")); } catch (x) { /* egal */ }
      }
      delete b.L; delete b.B;
      try { nachLauf(b, beginn, t0); } catch (e) { /* Stand ist Nebensache */ }
      laeuft = null;
      const t = meldungText(b);
      melden({ art: "fertig", manuell: !!o.manuell, ergebnis: b.art });
      if (o.manuell && t && b.art !== "nicht-faellig" && abh.melden) { try { abh.melden(t); } catch (e) { /* egal */ } }
      return b;
    })();
    return laeuft;
  };

  // ----- Abo-Link des Stundenplans (Uni-Login, uni-login.js, seit 0.4.8) -----
  // Anmelden, die Seite „Stundenplan“ lesen, abmelden. Der Link steht dort schon im versteckten Fenster „Daten für iCalendar
  // (ics) exportieren“; nichts wird angeklickt oder erneuert. Unabhängig von Beta und „Einschalten“: Wer seinen Uni-Login eingibt,
  // stimmt dieser Anmeldung bei Alma zu (Entscheidung vom 19.10.2026). Sonst wie ein Lauf: nur, wenn ILIAS das Passwort bestätigt
  // hat und keine Ablehnung vorliegt; lehnt Alma eindeutig ab, hält der Marker alle Geräte an. Der Stand von Noten & Anmeldungen
  // bleibt unberührt. Gleichzeitige Aufrufe teilen einen Abruf. → { art: "ok", link } | { art, grund } (art wie bei einem Lauf)
  // Eine Alma-Sitzung zugleich: Auf iPhone und iPad teilen sich Sitzungen die Kekse, das Abmelden der einen beendete die andere.
  // Darum wartet der Link auf einen laufenden Lauf (und ein Lauf auf den Link, jetztPruefen). Hat Alma gebremst (pauseBis nach
  // 403/429 oder wiederholten Fehlern von Noten & Anmeldungen), meldet sich auch der Link-Abruf bis dahin nicht an.
  let linkLauf = null;
  const linkHolen = async () => {
    if (laeuft) { try { await laeuft; } catch (e) { /* egal */ } }
    const z = zugang();
    if (!z.benutzer) return { art: "ohne-zugang" };
    if (z.gesperrt) return { art: "abgelehnt" };
    if (!z.bestaetigt) return { art: "wartet-ilias" };
    if (alter(lstand().pauseBis) < 0) return { art: "stopp", grund: "pause" };
    const b = { anfragen: 0, post: false, angemeldet: false };
    try {
      const link = await mitAlma(b, z, null, async (holen, A) => {
        const r = await holen({ url: URL_STUNDENPLAN });
        if (A.seite(r.text) !== "angemeldet") throw fehlerArt("unerwartet", "sitzung");
        const l = A.stundenplanLink(r.text);
        if (!l) throw fehlerArt("unerwartet", "kein-link");
        return l;
      });
      return { art: "ok", link };
    } catch (e) {
      const art = (e && e.art) || "fehler";
      if (art === "zugang-falsch") { try { await abh.abgelehnt("alma"); } catch (x) { /* Marker beim nächsten Mal */ } }
      try { console.warn("alma-konto: Stundenplan-Link " + art + (e && e.grund && e.grund !== art ? " " + e.grund : "")); } catch (x) { /* egal */ }
      return { art, grund: (e && e.grund) || "" };
    }
  };
  const stundenplanLink = async () => {
    if (linkLauf) return linkLauf;
    linkLauf = linkHolen();
    try { return await linkLauf; } finally { linkLauf = null; }
  };

  // ----- Einschalten, Ausschalten, Löschen -----
  const einschalten = async () => {
    lokal(L.an, iso());
    lsetzen({ aus: "", pause: "", pauseBis: "", unerwartet: 0 });
    melden({ art: "an" });
    await lesen();
    // gleich prüfen, wenn ILIAS den Zugang bestätigt hat (sonst wartet die Zeile darauf)
    return zugang().bestaetigt ? jetztPruefen({ manuell: true }) : { art: "wartet-ilias" };
  };
  // Ausschalten (nur dieses Gerät): Sperre freigeben, damit ein anderes Gerät mit Zustimmung gleich übernehmen kann
  const ausschalten = () => {
    lokal(L.an, null); lsetzen({ aus: "" }); melden({ art: "aus" });
    sperre().freigeben().catch(() => {});
  };
  // Daten aus Alma löschen (jedes Gerät): Sperre her, Grabstein, Datei und alle Kopien endgültig löschen, hier aus
  const loeschen = async () => {
    try { await sperre().nehmen({ erzwingen: true }); } catch (e) { /* weiche Sperre */ }
    await io.schreibenText(AUS, JSON.stringify({ geloescht: iso(), geraet: abh.geraetId() }, null, 1) + "\n");
    try { await io.loeschen(STAND); } catch (e) { /* schon weg */ }
    await kopienWeg();
    for (const n of sicher(() => io.liste(DATEN), []).filter((x) => /^alma-konto-aus.+\.json$/i.test(x))) { try { await io.loeschen(DATEN + "/" + n); } catch (e) { /* egal */ } }
    lokal(L.an, null); lokal(L.aufbau, null); lokal(L.protokoll, null);
    lsetzen({ aus: "", pause: "", pauseBis: "", grund: "", ergebnis: "", unerwartet: 0, server: 0 });
    try { await sperre().freigeben(); } catch (e) { /* weiche Sperre */ }
    zustand = null;
    await lesen();
    melden({ art: "geloescht" });
  };

  // ----- Stand für die Oberfläche (ohne Noten) -----
  const FEHLER = {
    "abgelehnt": "Alma hat dein Passwort abgelehnt. Bitte deinen Uni-Login neu eingeben.",
    "abgelehnt-unklar": "Alma hat anders geantwortet als erwartet.", "unerwartet": "Alma hat anders geantwortet als erwartet.",
    "zwei-faktor": "Alma verlangt einen zweiten Faktor. Melde dich einmal im Browser an.",
    "zustimmung": "Alma möchte eine Zustimmung. Melde dich einmal im Browser an.",
    "pause": "Alma ist gerade nicht erreichbar, neuer Versuch morgen.",
  };
  const status = () => {
    const s = lstand(), z = zugang();
    const anderes = !!(sperreInfo && sperreInfo.anderes);
    const unsicher = !!zustand && (zustand.leistungen.art === "unsicher" || zustand.belegungen.art === "unsicher");
    let art;
    if (extern()) art = "extern";
    else if (!beta()) art = an() || daten() ? "beta-aus" : "unsichtbar";
    else if (!z.benutzer) art = "ohne-zugang";
    else if (!an()) art = s.aus === "anderes-geraet" ? "aus-anderes-geraet" : "aus";
    else if (z.gesperrt) art = "abgelehnt";
    else if (!z.bestaetigt) art = "wartet-ilias";
    else if (laeuft) art = "laeuft";
    else if (PAUSEN.indexOf(s.pause) >= 0) art = s.pause;
    else if (alter(s.pauseBis) < 0 && s.unerwartet >= UNERWARTET_MAX) art = "unerwartet";
    else if (alter(s.pauseBis) < 0) art = "pause";
    else if (unsicher) art = "unsicher";
    else if (anderes && (!zustand || zustand.geraet !== abh.geraetId())) art = "anderes-geraet";
    else art = "an";
    // Gemeinsame Form aller Quellen: { zustand, geprueft, fehler, fehlerZeit, warnungen } (Texte ohne Noten), dazu Eigenes
    const fehler = FEHLER[art] || "";
    const warnungen = [];
    if (zustand && zustand.leistungen.art === "unsicher") warnungen.push("Die Seite „Leistungen“ sah anders aus als erwartet.");
    if (zustand && zustand.belegungen.art === "unsicher") warnungen.push("Die Seite „Belegungen“ sah anders aus als erwartet.");
    if (zustand && zustand.belegungen.unzugeordnet) warnungen.push(zustand.belegungen.unzugeordnet === 1 ? "Eine Prüfungsanmeldung passt zu keinem Modul." : zustand.belegungen.unzugeordnet + " Prüfungsanmeldungen passen zu keinem Modul.");
    return { zustand: art, art, geprueft: zustand ? zustand.geprueft : "", fehler, fehlerZeit: fehler ? s.fehlerZeit : "", warnungen,
      sichtbar: art !== "unsichtbar", an: !!an(), benutzer: z.benutzer, laeuft: !!laeuft, daten: daten(), grund: s.grund,
      aufbau: typeof lokal(L.aufbau) === "string" ? lokal(L.aufbau) : "" };
  };

  return {
    jetztPruefen, faellig, einschalten, ausschalten, loeschen, lesen, status, protokoll, sichtbar, beta, extern, stundenplanLink,
    zustand: () => zustand, an, lstand,
    vorschlag: (fm) => (extern() ? null : vorschlagAus(fm, zustand, () => sicher(() => abh.notizen(), null) || [fm])),
    get laeuft() { return !!laeuft; },
  };
};

// ---------- Anschluss an Obsidian ----------
module.exports = function (ctx) {
  const app = window.app;
  const obs = ctx.obsidian || {};
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const plugin = () => ctx.plugin || {};
  const modulVon = (name) => {
    const m = ctx.user && ctx.user[name];
    if (typeof m === "function") { try { return m(ctx); } catch (e) { return null; } }
    return m || null;
  };
  const datei = (p) => { const f = app.vault.getAbstractFileByPath(p); return f && !f.children ? f : null; };
  const einstellungen = () => { const f = datei(EINSTELLUNGEN), c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
  const lokalObs = (k, v) => {
    if (v === undefined) { try { return app.loadLocalStorage(k) || null; } catch (e) { return null; } }
    app.saveLocalStorage(k, v == null ? null : v);
    return v;
  };
  const obsidianIo = () => {
    const V = app.vault;
    return {
      lesenText: async (p) => { const f = datei(p); return f ? V.read(f) : null; },
      schreibenText: async (p, t) => {
        const f = datei(p);
        if (f) { await V.modify(f, t); return; }
        const o = p.slice(0, p.lastIndexOf("/"));
        if (o && !V.getAbstractFileByPath(o)) { try { await V.createFolder(o); } catch (e) { /* gibt es schon */ } }
        await V.create(p, t);
      },
      loeschen: async (p) => { const f = datei(p); if (f) await V.delete(f, true); },
      existiert: (p) => !!datei(p),
      liste: (o) => { const d = V.getAbstractFileByPath(o); return d && d.children ? d.children.filter((k) => !k.children).map((k) => k.name) : []; },
    };
  };
  // Regel aus eba.js über quellen.js extern (auch mit eba.js einer älteren Fassung auf diesem Gerät)
  const quelleExtern = (schluessel) => {
    const eba = ctx.user && ctx.user.eba, Q = ctx.user && ctx.user.quellen, existiert = (p) => !!app.vault.getAbstractFileByPath(p);
    if (Q && Q.extern) return Q.extern(eba, schluessel, existiert, einstellungen());
    return !!(eba && eba.quelleExtern && eba.quelleExtern(schluessel, existiert, einstellungen()));
  };
  const modell = () => { try { return ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null; } catch (e) { return null; } };
  const heute = () => (ctx.date && ctx.date.now ? ctx.date.now("YYYY-MM-DD") : new Date().toISOString().slice(0, 10));
  const jetzt = () => (ctx.date && ctx.date.jetzt ? ctx.date.jetzt() : new Date());
  const geraetId = () => (ctx.zentral && ctx.zentral.geraetId ? ctx.zentral.geraetId() : ctx.ilias && ctx.ilias.geraetId ? ctx.ilias.geraetId() : "g-unbekannt");
  const hoerer = ctx.bleibend("hoerer", () => new Set());
  const beobachten = (fn) => { if (typeof fn === "function") hoerer.add(fn); return () => hoerer.delete(fn); };
  const neuZeichnen = () => {
    for (const h of Array.from(hoerer)) { try { h(); } catch (e) { /* Hörer egal */ } }
    try { if (ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen(); } catch (e) { /* egal */ }
    try { if (ctx.user && ctx.user.quellen) ctx.user.quellen.meldenNeu(ctx); } catch (e) { /* egal */ } // „Bitte prüfen“
    if (fenster && fenster.offen()) fenster.zeigen();
  };
  // Testeinstieg (nur Oberfläche in Obsidian): Werte im Speicher statt aus ILIAS, Einstellungen und alma-konto.json
  const test = ctx.bleibend("test", () => ({ w: null }));
  const tw = (k) => (test.w && test.w[k] !== undefined ? { da: true, wert: test.w[k] } : { da: false });
  const abh = {
    io: obsidianIo(), lokal: lokalObs, sperre: modulVon("sperre") || { erzeugen: () => { throw new Error("sperre.js fehlt"); } },
    zugang: () => (tw("zugang").da ? tw("zugang").wert : ctx.ilias && ctx.ilias.uniZugang ? ctx.ilias.uniZugang() : null),
    testZustand: () => (tw("zustand").da ? tw("zustand").wert : undefined),
    kennwort: () => {
      const s = app.secretStorage;
      return s && typeof s.getSecret === "function" && ctx.ilias && ctx.ilias.geheimId ? s.getSecret(ctx.ilias.geheimId()) || "" : "";
    },
    abgelehnt: (dienst) => (ctx.ilias && ctx.ilias.zugangAbgelehnt ? ctx.ilias.zugangAbgelehnt(dienst) : null),
    quelleExtern,
    beta: () => (tw("beta").da ? !!tw("beta").wert : String(einstellungen().update_kanal || "").trim().toLowerCase() === "beta"),
    phase: () => { const d = modell(); return !!(d && anmeldeFenster(d.termine, heute())); },
    netz: () => modulVon("ilias-netz"), html: () => modulVon("alma-konto-html"),
    codes: () => { const d = modell(); return d ? d.module.map((m) => m.code).filter(Boolean) : []; },
    notizen: () => { const d = modell(); return d ? d.module.map((m) => m.fm || {}) : null; },
    jetzt, mobil: !!(obs.Platform && obs.Platform.isMobile), geraetId,
    melden: (t) => ctx.hinweis(t),
    geaendert: () => neuZeichnen(),
  };
  let motorInst = null;
  const motor = () => motorInst || (motorInst = erzeugen(abh));

  // ---------- Vorschläge im Modulfeld (modul.js) und Zeiger in „Bitte prüfen“ (bitte-pruefen.js) ----------
  const fmVon = (f) => (f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter) || {};
  const uebernehmen = async (f, v) => {
    await app.fileManager.processFrontMatter(f, (m) => {
      for (const k of Object.keys(v.felder)) m[k] = v.felder[k];
      if (v.marke) m.alma_uebernommen = v.marke;
    });
    ctx.hinweis(`${v.code} aus Alma übernommen.`);
  };
  const ausblenden = async (f, v) => {
    await app.fileManager.processFrontMatter(f, (m) => {
      const l = Array.isArray(m.alma_ausgeblendet) ? m.alma_ausgeblendet.map(String) : m.alma_ausgeblendet ? [String(m.alma_ausgeblendet)] : [];
      if (l.indexOf(v.schluessel) < 0) l.push(v.schluessel);
      m.alma_ausgeblendet = l;
    });
  };
  // Modulfeld: eine Zeile unter dem Stand, nur bei offenem Vorschlag; zwei leise Knöpfe (≥ 44 px auf iPhone/iPad, CSS 62)
  const modulFeld = (box, f, fm) => {
    const v = motor().vorschlag(fm);
    if (!v) return false;
    const z = box.createDiv({ cls: "eba-mod-alma" });
    const t = z.createDiv({ cls: "eba-mod-alma-text" });
    t.createSpan({ cls: "eba-mod-alma-wert", text: v.text });
    if (v.satz) t.createSpan({ cls: "eba-mod-alma-satz", text: v.satz });
    const k = z.createDiv({ cls: "eba-mod-alma-knoepfe" });
    const knopf = (titel, cls, fn) => {
      const b = k.createEl("button", { cls: "eba-mod-alma-knopf" + (cls ? " " + cls : ""), text: titel, attr: { type: "button" } });
      b.addEventListener("mousedown", (e) => e.stopPropagation());
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); b.disabled = true; fn().catch(() => { b.disabled = false; }); });
    };
    knopf("Übernehmen", "", () => uebernehmen(f, v));
    knopf("Ausblenden", "leise", () => ausblenden(f, v));
    return true;
  };
  // Zeiger ohne Notenwert: „**Aus Alma** · neue Angaben zu B110, S100 …“, „**Prüfungsanmeldung** · laut Alma fehlen …“
  const fehlende = () => {
    const d = modell(), m = motor();
    if (!d || m.extern() || !m.zustand()) return null;
    return fehlendeAnmeldungen({ module: d.module, termine: d.termine, zustand: m.zustand(), heute: heute(), jetzt: jetzt().getTime(), aktuell: d.aktuell,
      pruefungVon: (code) => (ctx.modell.pruefungVon ? ctx.modell.pruefungVon(code, { heute: heute() }) : null) });
  };
  const hinweise = () => {
    const d = modell(), m = motor();
    if (!d || m.extern()) return [];
    const aus = [];
    // Meldekanal: Zustände, in denen nur du weiterhilfst (Passwort abgelehnt, zweiter Faktor, Zustimmung, unklare Antwort)
    const st = m.status();
    if (st.an && ["abgelehnt", "abgelehnt-unklar", "zwei-faktor", "zustimmung"].indexOf(st.zustand) >= 0 && st.fehler) {
      aus.push({ text: `**Alma** · ${st.fehler}`, pfad: "Studium/Einstellungen & Hilfe.md", anker: "Verbindungen" });
    }
    if (!m.zustand()) return aus;
    // Eine Zeile für alle Vorschläge (Codes, nie Noten); ein Modul → seine Seite, mehrere → Noten & ECTS
    const mit = d.module.filter((x) => x.f && m.vorschlag(fmVon(x.f))).sort((a, b) => a.code.localeCompare(b.code));
    if (mit.length) {
      aus.push({ text: `**Aus Alma** · ${mit.length === 1 ? "neue Angabe zu " + mit[0].code + ", auf der Modulseite" : "neue Angaben zu " + mit.map((x) => x.code).join(", ") + ", auf den Modulseiten"} übernehmen`,
        pfad: mit.length === 1 ? mit[0].f.path : "Studium/Noten & ECTS.md" });
    }
    const fa = fehlende();
    if (fa && fa.art === "fehlt") aus.push({ text: `**Prüfungsanmeldung** · laut Alma ${fa.codes.length === 1 ? "fehlt" : "fehlen"} ${fa.codes.join(", ")}`, pfad: "Studium/Termine & Anmeldungen.md", anker: "Anmeldungen" });
    return aus;
  };

  // ---------- Zeile unter Verbindungen (verbindungen.js baut daraus das HTML) ----------
  const zeitText = (s) => {
    const t = zeitVon(s);
    if (!t) return "";
    const d = new Date(t), j = jetzt(), p = (n) => String(n).padStart(2, "0");
    const tagDiff = Math.round((new Date(j.getFullYear(), j.getMonth(), j.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    const uhr = p(d.getHours()) + ":" + p(d.getMinutes());
    return tagDiff === 0 ? "heute " + uhr : tagDiff === 1 ? "gestern " + uhr : p(d.getDate()) + "." + p(d.getMonth() + 1) + ". " + uhr;
  };
  const MEHR = { aktion: "verbinden", text: "Mehr erfahren", parameter: { id: "alma-konto" } };
  // Stand als Satz: die eine Formatierung aller Quellen (verbindungen.js standText; Wörter nach Entscheidung E1)
  const standText = (s) => {
    const vb = ctx.verbindungen;
    if (vb && vb.standText) return vb.standText(s).text;
    return s.geprueft ? "Aktualisiert " + zeitText(s.geprueft) + "." : "Noch nicht aktualisiert.";
  };
  const zeile = () => {
    const s = motor().status();
    const pruefen = (text) => ({ aktion: "alma-konto-pruefen", text, cta: true, parameter: {} });
    const fenster = (text, cta) => ({ aktion: "verbinden", text, cta: !!cta, parameter: { id: "alma-konto" } });
    const ilias = { aktion: "verbinden", text: "Mit Uni-Login verbinden", cta: true, parameter: { id: "ilias", fuer: "alma" } };
    const fa = s.art === "an" ? fehlende() : null;
    switch (s.art) {
      case "unsichtbar": return null;
      case "extern": return { text: "Kommt über deinen eigenen Abgleich.", symbol: "haken", pille: "", knopf: null, link: null };
      case "beta-aus": return { text: "Gibt es gerade nur mit Beta-Versionen.", symbol: "aus", pille: "", knopf: null, link: MEHR };
      case "ohne-zugang": return { text: "Braucht deinen Uni-Login.", symbol: "schloss", pille: "", knopf: ilias, link: null };
      case "aus-anderes-geraet": return { text: "Auf einem anderen Gerät ausgeschaltet.", symbol: "aus", pille: "", knopf: fenster("Einschalten"), link: null };
      case "aus": return { text: "Liest deine Noten und Prüfungsanmeldungen aus Alma.", symbol: "aus", pille: "", knopf: fenster("Einschalten"), link: null };
      case "abgelehnt": return { text: "Alma hat dein Passwort abgelehnt. Bitte deinen Uni-Login neu eingeben.", symbol: "warnung", pille: "pruefen", knopf: ilias, link: null };
      case "wartet-ilias": return { text: "Wartet, bis ILIAS deinen Zugang bestätigt hat.", symbol: "uhr", pille: "", knopf: null, link: MEHR };
      case "laeuft": return { text: "Prüft gerade …", symbol: "uhr", pille: "an", knopf: null, link: MEHR };
      case "zwei-faktor": return { text: "Alma verlangt einen zweiten Faktor. Melde dich einmal im Browser an.", symbol: "warnung", pille: "", knopf: pruefen("Erneut versuchen"), link: MEHR };
      case "zustimmung": return { text: "Alma möchte eine Zustimmung. Melde dich einmal im Browser an.", symbol: "warnung", pille: "", knopf: pruefen("Erneut versuchen"), link: MEHR };
      case "abgelehnt-unklar": case "unerwartet": return { text: "Alma hat anders geantwortet als erwartet.", symbol: "warnung", pille: "", knopf: pruefen("Erneut versuchen"), link: MEHR };
      case "pause": return { text: "Alma ist gerade nicht erreichbar, neuer Versuch morgen.", symbol: "pause", pille: "an", knopf: pruefen("Aktualisieren"), link: MEHR };
      case "unsicher": return { text: "Alma-Seite sah anders aus. Bitte in Alma selbst nachsehen.", symbol: "warnung", pille: "", knopf: { href: URL_START, text: "In Alma öffnen" }, link: MEHR };
      case "anderes-geraet": return { text: standText({ zustand: "anderes-geraet" }), symbol: "haken", pille: "an", knopf: { aktion: "alma-konto-pruefen", text: "Hier aktualisieren", cta: true, parameter: { hier: "1" } }, link: MEHR };
      default: {
        const t = standText({ zustand: "an", geprueft: s.geprueft });
        return { text: t + (fa && fa.art === "selbst" ? " Bitte deine Prüfungsanmeldungen selbst in Alma prüfen." : ""), symbol: "haken", pille: "an", knopf: pruefen("Aktualisieren"), link: MEHR };
      }
    }
  };

  // ---------- Fenster ----------
  const { Modal } = obs;
  const bestaetigen = (titel, satz, ja) => new Promise((fertig) => {
    const m = new Modal(app);
    let erledigt = false;
    m.modalEl.addClass("eba-modal");
    m.titleEl.setText(titel);
    m.contentEl.createEl("p", { text: satz, cls: "eba-modal-text" });
    const k = m.contentEl.createDiv({ cls: "modal-button-container" });
    k.createEl("button", { text: "Abbrechen" }).addEventListener("click", () => m.close());
    k.createEl("button", { text: ja, cls: "mod-warning" }).addEventListener("click", () => { erledigt = true; m.close(); fertig(true); });
    m.onClose = () => { m.contentEl.empty(); if (!erledigt) fertig(false); };
    m.open();
  });
  const SYM_SCHLOSS = '<svg class="eba-sym" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  let fenster = null;
  class KontoFenster extends (Modal || class {}) {
    constructor() { super(app); this.meldung = null; }
    onOpen() { this.modalEl.addClass("eba-modal", "eba-modal-verbinden", "eba-modal-alma"); this.zeigen(); }
    onClose() { this.contentEl.empty(); if (fenster === this) fenster = null; }
    offen() { return fenster === this; }
    knoepfe() { return this.contentEl.createDiv({ cls: "modal-button-container" }); }
    mehr(c, mitLoeschen, aufbau) {
      const d = c.createEl("details", { cls: "eba-modal-mehr" });
      d.createEl("summary", { text: "Mehr erfahren" });
      d.createEl("p", { text: "Ein Gerät reicht: Die Angaben kommen über deinen Sync auf deine anderen Geräte. Studium Autopilot liest nur „Leistungen“ und „Belegungen“, nie deinen Namen oder deine Matrikelnummer, und schreibt nichts in Alma." });
      if (!mitLoeschen && !aufbau) return;
      const k = d.createDiv({ cls: "eba-modal-mehr-knoepfe" });
      if (aufbau) k.createEl("button", { text: "Aufbau kopieren (ohne deine Daten)" }).addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(aufbau); ctx.hinweis("Aufbau kopiert. Er enthält keine Noten und keine Namen."); } catch (e) { ctx.hinweis("Kopieren hat nicht geklappt."); }
      });
      if (mitLoeschen) k.createEl("button", { text: "Daten aus Alma löschen", cls: "mod-warning" }).addEventListener("click", async () => {
        const ok = await bestaetigen("Daten aus Alma löschen?", "Noten und Anmeldungen aus Alma verschwinden aus deinem Tresor, und Noten & Anmeldungen geht auf allen deinen Geräten aus. Was du in deine Modulseiten übernommen hast, bleibt.", "Löschen");
        if (!ok) return;
        await motor().loeschen();
        ctx.hinweis("Daten aus Alma gelöscht.");
        if (this.offen()) this.zeigen();
      });
    }
    zeigen() {
      const c = this.contentEl, s = motor().status();
      c.empty();
      this.titleEl.setText(s.an ? "Noten & Anmeldungen (Alma)" : "Noten & Anmeldungen einschalten");
      if (s.art === "extern") { c.createEl("p", { cls: "eba-modal-text", text: "Deine Noten und Prüfungsanmeldungen kommen über deinen eigenen Abgleich." }); return; }
      if (s.art === "beta-aus") {
        this.titleEl.setText("Noten & Anmeldungen (Alma)");
        c.createEl("p", { cls: "eba-modal-text", text: "Noten & Anmeldungen gibt es gerade nur mit Beta-Versionen. Ohne sie fragt Studium Autopilot nichts bei Alma ab." });
        const k = this.knoepfe();
        if (s.an) k.createEl("button", { text: "Ausschalten" }).addEventListener("click", () => { motor().ausschalten(); this.zeigen(); });
        this.mehr(c, s.daten, "");
        return;
      }
      if (!s.an) {
        c.createEl("p", { cls: "eba-modal-text", text: "Studium Autopilot liest deine Noten und Prüfungsanmeldungen aus Alma und schlägt sie dir auf der Modulseite vor." });
        if (s.art === "ohne-zugang") {
          c.createEl("p", { cls: "eba-modal-hinweis", text: "Dafür braucht es deinen Uni-Login. Deine Kurse in ILIAS bleiben dabei aus." });
          this.knoepfe().createEl("button", { text: "Mit Uni-Login verbinden", cls: "mod-cta" }).addEventListener("click", () => { this.close(); ctx.aktion("verbinden", { id: "ilias", fuer: "alma" }); });
          return;
        }
        if (s.art === "aus-anderes-geraet") c.createEl("p", { cls: "eba-modal-hinweis", text: "Auf einem anderen Gerät wurden die Daten aus Alma gelöscht." });
        const schutz = c.createEl("p", { cls: "eba-modal-datenschutz" });
        schutz.innerHTML = SYM_SCHLOSS;
        const t = schutz.createSpan();
        t.appendText("Dafür meldet sich dieses Gerät mit deinem Uni-Login ");
        t.createEl("b", { text: s.benutzer });
        t.appendText(" auch bei Alma an, höchstens zweimal am Tag, in der Anmeldephase alle 3 Stunden. Das Passwort bleibt verschlüsselt auf diesem Gerät.");
        c.createEl("p", { cls: "eba-modal-hinweis", text: "Noch Beta: Prüfe Noten und Anmeldungen bitte weiter auch selbst in Alma." });
        this.meldung = c.createEl("p", { cls: "eba-modal-meldung" });
        const k = this.knoepfe();
        const los = k.createEl("button", { text: "Einschalten", cls: "mod-cta" });
        los.addEventListener("click", async () => {
          los.disabled = true;
          this.meldung.setText("Prüft Alma …");
          await motor().einschalten();
          if (this.offen()) this.zeigen();
        });
        return;
      }
      c.createEl("p", { cls: "eba-modal-marke" }).innerHTML = `<span class="eba-pill ok">verbunden</span>`;
      const z = zeile() || { text: "" };
      c.createEl("p", { cls: "eba-modal-text", text: z.text });
      const k = this.knoepfe();
      if (!s.laeuft && ["an", "anderes-geraet", "unsicher", "pause", "zwei-faktor", "zustimmung", "abgelehnt-unklar", "unerwartet"].indexOf(s.art) >= 0) {
        const b = k.createEl("button", { text: s.art === "anderes-geraet" ? "Hier aktualisieren" : PAUSEN.indexOf(s.art) >= 0 || s.art === "unerwartet" ? "Erneut versuchen" : "Aktualisieren", cls: "mod-cta" });
        b.addEventListener("click", async () => { b.disabled = true; await motor().jetztPruefen({ manuell: true, hier: s.art === "anderes-geraet" }); if (this.offen()) this.zeigen(); });
      }
      k.createEl("button", { text: "Ausschalten" }).addEventListener("click", () => { motor().ausschalten(); ctx.hinweis("Noten & Anmeldungen auf diesem Gerät aus."); this.zeigen(); });
      this.mehr(c, true, s.art === "unsicher" ? s.aufbau : "");
    }
  }
  const fensterOeffnen = () => { const m = new KontoFenster(); fenster = m; m.open(); return m; };

  // ---------- Für andere Skripte ----------
  ctx.almaKonto = {
    status: () => motor().status(), zeile, sichtbar: () => motor().sichtbar() && motor().status().sichtbar, einschalten: () => motor().einschalten(),
    ausschalten: () => motor().ausschalten(), jetztPruefen: (o) => motor().jetztPruefen(Object.assign({ manuell: true }, o || {})),
    loeschen: () => motor().loeschen(), zustand: () => motor().zustand(), vorschlag: (fm) => motor().vorschlag(fm),
    stundenplanLink: () => motor().stundenplanLink(),
    uebernehmen, ausblenden, modulFeld, fehlendeAnmeldungen: fehlende, hinweise, fingerabdruck: () => motor().status().aufbau,
    beobachten, fensterOeffnen, URL_START,
    testSetzen: async (w) => { test.w = w || null; await motor().lesen(); neuZeichnen(); },
    get fenster() { return fenster; },
  };

  const registrieren = () => {
    // Zustand, Grabstein und Sperre lesen, sobald der Tresor eingelesen ist; dann bei jeder Änderung (auch per Sync)
    const frisch = ctx.entprellen(() => { motor().lesen().then(neuZeichnen, () => {}); }, 800);
    const unsere = (p) => String(p || "").indexOf(DATEN + "/alma-konto") === 0;
    for (const art of ["create", "modify", "delete"]) ctx.an(app.vault, art, (f) => { if (f && unsere(f.path)) frisch(); });
    ctx.an(app.vault, "rename", (f, alt) => { if ((f && unsere(f.path)) || unsere(alt)) frisch(); });
    if (app.metadataCache.resolved) frisch();
    else { const r = ctx.an(app.metadataCache, "resolved", () => { app.metadataCache.offref(r); frisch(); }); }
    // Gemeinsamer Zeitplan der Quellen (quellen.js): Blick „fällig?“ 60–180 s nach dem Einlesen, dann alle 30 Min., zurück in der
    // App nach über 60 Min.; ob wirklich gefragt wird, entscheidet faellig() (12 bzw. 3 Std., Pausen, Fehler vor dem POST)
    const Q = ctx.user && ctx.user.quellen;
    if (!Q) return;
    Q.melden(ctx, QUELLE, hinweise);
    Q.planen(ctx, { takt: 30 * MIN, zurueck: 60 * MIN, start: [60000, 120000], lauf: async () => {
      if (plugin().testAlmaAus) return null;
      const m = motor();
      await m.lesen();
      if (!m.faellig()) return null;
      const b = await m.jetztPruefen({});
      return b.art === "ok" || b.art === "unsicher" ? true : ["netz", "zeit", "server", "wartung", "stopp", "unerwartet", "fehler"].indexOf(b.art) >= 0 ? false : null;
    } });
  };

  return {
    registrieren,
    aktionen: {
      "alma-konto-pruefen": {
        // in der Befehlsübersicht erst, wenn die Funktion stabil ist; als Beta nur über Zeile, Fenster und „Bitte prüfen“
        titel: ALMA_KONTO_STABIL ? "Noten & Anmeldungen aktualisieren" : undefined,
        ausfuehren: async (c) => {
          const s = motor().status();
          if (!s.an || ["extern", "beta-aus", "ohne-zugang", "abgelehnt", "wartet-ilias"].indexOf(s.art) >= 0) { fensterOeffnen(); return; }
          await motor().jetztPruefen({ manuell: true, hier: !!(c && c.parameter && c.parameter.hier === "1") });
        },
      },
    },
  };
};
module.exports.erzeugen = erzeugen;
module.exports.vorschlagAus = vorschlagAus;
module.exports.fehlendeAnmeldungen = fehlendeAnmeldungen;
module.exports.anmeldeFenster = anmeldeFenster;
module.exports.zustandBauen = zustandBauen;
module.exports.zustandPruefen = zustandPruefen;
module.exports.sha256 = sha256;
module.exports.K = Object.freeze({ ALMA_KONTO_STABIL, STAND, ABRUF, AUS, L, URL_START, URL_LEISTUNGEN, URL_BELEGUNGEN, URL_ABMELDEN, URL_STUNDENPLAN, NORMAL, PHASE,
  NETZ_WIEDER, KNOPF_ABSTAND, LAUF_MAX, FRISCH, DROSSEL });
