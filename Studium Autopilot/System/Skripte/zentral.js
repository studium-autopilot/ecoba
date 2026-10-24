// Zentrale Daten (Datenkanal, Plan Abschnitt 18): Termine, Fristen und Semesterdaten kommen als JSON von einer öffentlichen
// Seite (GitHub Pages, BASIS unten) und werden als Notizen übernommen. Geholt werden NUR Daten, nie Code.
// Vertrag (Format, Grenzen, id-Regel, Freigabelisten): docs/daten-v1.md. Überblick: docs/architektur/zentrale-daten.md.
//
// Ablauf eines Abrufs:
//   1. manifest.json holen (klein). Fehler/kein Netz → letzter Stand bleibt, Status merkt den Fehler, nichts wird geschrieben.
//      pause: true → nichts übernehmen, Status „pausiert“.
//   2. Abrufer-Sperre (System/Daten/abruf.json, synchronisiert): Nur EIN Gerät schreibt. Ein anderes Gerät übernimmt erst,
//      wenn „zuletzt“ älter als 80 Min. ist; von Hand („Jetzt aktualisieren“) sofort, außer der Abrufer hat vor weniger als
//      2 Min. abgerufen. abruf.json wird nur bei Wechsel oder spätestens alle 50 Min. (Puls) geschrieben. Wer übernimmt, schreibt
//      abruf.json (sperre.js) vor den Notizen; jeder Lauf liest sie direkt vor dem Schreiben neu und hört auf, wenn inzwischen
//      ein anderes Gerät übernommen hat.
//   3. Dateien nur bei geänderter Prüfsumme holen (Prüfsummen gerätelokal), SHA-256 gegen das Manifest prüfen (Web Crypto).
//      Ein Prüfsummenfehler → in diesem Lauf wird gar nichts übernommen.
//   4. Strenge Prüfung je Eintrag (Schema, Grenzen, Kategorien, Domains, reiner Text). Ungültige Einträge einzeln verwerfen.
//   5. Übernehmen: Termine → Notizen in Termine/ (herkunft: zentral, zentral_id); Semesterdaten → System/Daten/Semester.md.
//      Geschrieben wird nur bei inhaltlicher Änderung. Nie angefasst: Notizen ohne herkunft: zentral, das Feld erledigt,
//      alles unter „## Meine Notizen“, eigene Felder und Tags. Einzige Ausnahme, die Übergabe nach id: Eine Notiz eines eigenen
//      Uni-Abgleichs mit abgleich_id = id eines Termins übernimmt das Plugin an Ort und Stelle (abgleichNotizen).
//   Übungs- und Tutoriengruppen (gruppen.json, optional, Plan Abschnitt 20): holt JEDES Gerät selbst (vor der Abrufer-Sperre),
//      geprüft wie oben, nur gerätelokal gespeichert (eba-zentral-gruppen), keine Notizen. Anzeige: gruppen.js (eba-gruppen).
//   Angebote der Uni (angebote.json, optional: Vorträge, UB-Kurse, Hochschulsport, Welcome Center): genauso, gerätelokal
//      (eba-zentral-angebote); fehlt die Datei im Manifest, wird der Stand gelöscht. Anzeige: angebote.js (eba-angebote).
//   Kapitellisten (kapitel.json, optional, seit 19.10.2026): genauso, gerätelokal (eba-zentral-kapitel). Die Lernplan-Notizen
//      daraus schreibt lernplan.js (nur der Abrufer); dieses Skript meldet nur „neu“ an ctx.lernplanAnzeige.
//   Literaturlisten (literatur.json, optional, seit 24.10.2026): genauso, gerätelokal (eba-zentral-literatur). Die Notizen
//      „<Code> Literatur 00 Literaturliste“ schreibt literatur.js (nur der Abrufer); „neu“ geht an ctx.literaturAnzeige.
//   Zentraler Stundenplan (veranstaltungen.json, optional, Plan Abschnitt 27.1): holt und schreibt NUR der Abrufer, mit eigener
//      Fehlerbehandlung (ein Fehler hält nur den Stundenplan an). Eine Notiz je id in Stundenplan/ (typ lehrveranstaltung,
//      herkunft: zentral, zentral_id), nur für das aktuelle Fachsemester (stundenplanFilter), ohne Parallelgruppen, ohne
//      „Besuche ich nicht“ (stundenplan_ausgeblendet in den Einstellungen). Eigene Notizen (Alma oder von Hand) gewinnen
//      (eigenePaare). Ausfälle und Änderungen stehen in ausfall/aenderungen, die das Wochenraster liest. Kommt der Stundenplan
//      von außen (eba.quelleExtern „stundenplan“, ohne Liste in den Einstellungen beim eigenen Uni-Abgleich), gar nicht. Siehe
//      docs/architektur/zentrale-daten.md, „Zentraler Stundenplan“.
// Wann: beim Start (nach 20 s + Zufallsversatz 0–2 Min.), dann alle 15 Min. (seit 0.4.2; ohne Änderung nur das kleine Manifest),
//   beim Zurückkehren in die App (iPhone/iPad: Obsidian bleibt im Hintergrund geladen, Zeitgeber ruhen dort), wenn der letzte
//   Versuch über 10 Min. her ist, plus Aktion
//   „Zentrale Daten aktualisieren“.
// Testeinstiege (docs/architektur/testeinstiege.md): plugin.testZentralAus (kein automatischer Abruf), plugin.testQuelle(name) → Text,
// plugin.testZentralBasis (andere Basis-URL, z. B. lokaler Server). Gerätelokal (app.saveLocalStorage): eba-geraet,
// eba-zentral-stand, eba-zentral-daten, eba-zentral-gruppen, eba-zentral-angebote, eba-zentral-kapitel, eba-zentral-literatur,
// eba-zentral-angewendet.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;

  // ---------- Konstanten ----------
  const BASIS = "https://studium-autopilot.github.io/ecoba-daten/v1/";
  const RELEASES = "https://github.com/studium-autopilot/ecoba/releases";
  const RELEASE_ROH = "https://raw.githubusercontent.com/studium-autopilot/ecoba/"; // Dateien eines Releases (update.js)
  const ABRUF = "System/Daten/abruf.json";
  const SEMESTER = "System/Daten/Semester.md";
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const ORDNER = "Termine";
  const MEINE = "## Meine Notizen";
  const MIN = 60e3;
  const TAKT = 15 * MIN;         // automatischer Abruf; ohne Änderung nur das Manifest (Dateien nur bei neuer Prüfsumme)
  const ZURUECK = 10 * MIN;      // beim Zurückkehren in die App nachholen, wenn der letzte Versuch so lange her ist
  // Abrufer-Wechsel: Ist das abrufende Gerät aus (PC im Ruhezustand), übernimmt ein anderes nach UEBERNAHME. Der Abrufer erneuert
  // abruf.json bei jedem stündlichen Lauf (PULS unter einer Stunde), daher liegt UEBERNAHME knapp über einer Stunde (0.3.2).
  const UEBERNAHME = 80 * MIN; // anderes Gerät übernimmt, wenn der Abrufer so lange still war
  const PULS = 50 * MIN;       // Abrufer erneuert abruf.json höchstens so oft (unter UEBERNAHME, sonst Wechsel trotz Betrieb)
  const GERADE = 2 * MIN;      // „Jetzt aktualisieren“ übernimmt, außer der Abrufer hat vor weniger als GERADE abgerufen
  const GRABSTEIN_TAGE = 30;   // so lange muss eine id aus Daten und Tresor verschwunden sein, bis ihr Grabstein wegfällt
  const KATEGORIEN = ["Semester", "Vorlesungsfrei", "Prüfung", "Frist", "Einführung", "Lehre", "Fachschaft", "Veranstaltung"];
  const VERANSTALTUNG = ["Fachschaft", "Veranstaltung"];
  const STATUS = ["offiziell", "geschätzt"];
  // Optionales Feld „bereich“ (docs/daten-v1.md): erlaubte Werte → Tag in der Notiz. Ein Termin mit Bereich gilt für alle
  // (wie ohne code). Unbekannte Werte werden ignoriert (Eintrag bleibt, ohne Bereich).
  const BEREICHE = { schluesselqualifikation: "schlüsselqualifikation" };
  const BEREICH_TAGS = Object.keys(BEREICHE).map((k) => BEREICHE[k]);
  const bereichOk = (b) => typeof b === "string" && Object.prototype.hasOwnProperty.call(BEREICHE, b);
  // Erlaubte Domains für Links (inkl. Subdomains wie alma., ovidius., www.). Erweitern nur mit Begründung in docs/daten-v1.md.
  const DOMAINS = ["uni-tuebingen.de", "ffwtuebingen.de"];
  // bekannte Dateien und Höchstgröße (Bytes)
  const DATEIEN = { "termine.json": 1000000, "semester.json": 262144, "gruppen.json": 524288, "angebote.json": 524288, "veranstaltungen.json": 1500000,
    "kapitel.json": 524288, "literatur.json": 524288 };
  const GRUPPEN = "gruppen.json"; // optional, gerätelokal (nicht an die Abrufer-Sperre gebunden)
  const ANGEBOTE = "angebote.json"; // optional, gerätelokal wie die Gruppen
  const KAPITEL = "kapitel.json"; // optional, gerätelokal wie die Gruppen; die Notizen schreibt lernplan.js
  const LITERATUR = "literatur.json"; // optional, gerätelokal wie die Gruppen; die Notizen schreibt literatur.js
  const LEHRE = "veranstaltungen.json"; // optional, zentraler Stundenplan: nur der Abrufer, eigene Fehlerbehandlung
  const LEHRE_ORDNER = "Stundenplan";
  const MUSTERPLAN = "System/Daten/Musterplan.md";
  const AUSGEBLENDET = "stundenplan_ausgeblendet"; // Feld in System/Einstellungen.md: ids, die du nicht besuchst
  const G = { manifest: 16384, id: 80, titel: 120, bezeichnung: 30, ort: 120, uhrzeit: 11, info: 200, quelleText: 200, url: 500, hinweis: 200, termine: 2000, name: 60, liste: 100,
    gruppen: 1000, gruppe: 20, raum: 120, leitung: 120, anmeldung: 200, angebote: 1000, reihe: 80, lehre: 3000, ausfall: 100, aenderungen: 100,
    kapitelModule: 60, kapitel: 40, teile: 40, kapitelTitel: 140, quelle: 120 };
  // Grenzen der Literaturlisten (wie GLIT im Export, docs/daten-v1.md „literatur.json“)
  const GL = { module: 60, werke: 15, links: 4, lesen: 40, quelle: 200, hinweis: 300, werkHinweis: 200, kopf: 20, rolle: 40, angabe: 300,
    spalte: 20, suche: 120, linkText: 40, zu: 120, stellen: 80 };
  const DATUM_MIN = "2020-01-01", DATUM_MAX = "2040-12-31";
  const MODULCODE = /^[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?$/; // wie eba.js
  const L = { geraet: "eba-geraet", stand: "eba-zentral-stand", daten: "eba-zentral-daten", gruppen: "eba-zentral-gruppen", angebote: "eba-zentral-angebote",
    kapitel: "eba-zentral-kapitel", literatur: "eba-zentral-literatur", angewendet: "eba-zentral-angewendet" };

  // ---------- Kleine Helfer ----------
  const s10 = (v) => { const m = String(v == null ? "" : v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ""; };
  const dmy = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
  const jetztMs = () => Date.now();
  const heuteIso = () => ctx.date.now("YYYY-MM-DD");
  const J = (v) => JSON.stringify(v == null ? "" : v);
  // Gerätelokal speichern (Obsidian serialisiert selbst als JSON; null löscht den Schlüssel)
  const lokal = (k, v) => {
    if (v === undefined) { try { return app.loadLocalStorage(k) || null; } catch (e) { return null; } }
    app.saveLocalStorage(k, v == null ? null : v);
    return v;
  };
  const datei = (p) => app.vault.getAbstractFileByPath(p);
  const fmVon = (f) => { const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || null; };
  const plugin = () => ctx.plugin || {};

  // Gültiges Kalenderdatum im erlaubten Bereich
  const datumOk = (s) => {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s) || s < DATUM_MIN || s > DATUM_MAX) return false;
    const t = s.split("-").map(Number), d = new Date(t[0], t[1] - 1, t[2]);
    return d.getFullYear() === t[0] && d.getMonth() === t[1] - 1 && d.getDate() === t[2];
  };
  const tageZwischen = (a, b) => { const x = a.split("-").map(Number), y = b.split("-").map(Number); return Math.round((new Date(y[0], y[1] - 1, y[2]) - new Date(x[0], x[1] - 1, x[2])) / 864e5); };
  const isoZeitOk = (s) => typeof s === "string" && s.length <= 40 && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s) && datumOk(s.slice(0, 10));
  const semver = (s) => { const m = String(s || "").match(/^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/); return m ? [+m[1], +m[2], +m[3]] : null; };
  const neuer = (a, b) => { const x = semver(a), y = semver(b); if (!x || !y) return false; for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return false; };

  // ---------- Reiner Text ----------
  // Steuer- und unsichtbare Richtungszeichen; HTML-Tags; Templater-Marken; obsidian://-Links; Wikilink-Klammern; Backticks
  const STEUER = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
  const GEFAEHRLICH = /<\s*\/?\s*[a-z!]|<%|%>|obsidian:\/\/|\[\[|\]\]|`|[\r\n]|javascript:/i;
  const saeubern = (s) => String(s)
    .replace(/<%[\s\S]*?%>/g, " ").replace(/<%|%>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/obsidian:\/\/\S*/gi, " ").replace(/javascript:/gi, " ")
    .replace(/\[\[|\]\]/g, " ").replace(/`/g, "")
    .replace(STEUER, " ").replace(/\s+/g, " ").trim();
  // Text-Feld: kein String → Fehler; zu lang (nach dem Säubern) → Fehler; sonst gesäubert
  const textFeld = (v, max, pflicht) => {
    if (v == null || v === "") return pflicht ? { fehler: "fehlt" } : { wert: "" };
    if (typeof v !== "string") return { fehler: "kein Text" };
    const w = saeubern(v);
    if (pflicht && !w) return { fehler: "leer" };
    if (w.length > max) return { fehler: `zu lang (${w.length} > ${max})` };
    return { wert: w };
  };
  // Markdown im Notiztext entschärfen (Daten sind reiner Text)
  const mdText = (s) => String(s).replace(/[\\`*_\[\]<>#|!$%~=^{}]/g, "\\$&").replace(/^([-+]|\d+[.)])/, "\\$1");

  // ---------- Links ----------
  const hostOk = (h, domains) => domains.some((d) => h === d || h.slice(-(d.length + 1)) === "." + d);
  // domains: Freigabeliste (Standard DOMAINS; Angebote nur uni-tuebingen.de)
  const urlPruefen = (v, domains) => {
    if (v == null || v === "") return { wert: "" };
    if (typeof v !== "string" || v.length > G.url || /[\s"'<>`\\]/.test(v)) return { fehler: "Link ungültig" };
    let u;
    try { u = new URL(v); } catch (e) { return { fehler: "Link ungültig" }; }
    if (u.protocol !== "https:" || u.username || u.password || u.port) return { fehler: "Link nicht https" };
    if (!hostOk(u.hostname.toLowerCase(), domains || DOMAINS)) return { fehler: "Domain nicht erlaubt: " + u.hostname };
    return { wert: v.replace(/\(/g, "%28").replace(/\)/g, "%29") }; // Original behalten (keine Normalisierung → kein Scheinunterschied)
  };

  // ---------- id-Regel (docs/daten-v1.md; der Export der zentralen Daten erzeugt dieselben ids) ----------
  // Dateiname der Termin-Notiz ohne .md („JJJJ-MM-TT Titel“) → klein, ä/ö/ü/ß ausgeschrieben, Akzente weg, alles außer a–z/0–9
  // als „-“, höchstens 80 Zeichen. Einmal vergeben bleibt die id fest, auch wenn Datum oder Titel sich ändern.
  const idAusName = (name) => {
    let s = String(name || "").replace(/\.md$/i, "").toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
    try { s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); } catch (e) { /* ohne normalize */ }
    s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (s.length > G.id) s = s.slice(0, G.id).replace(/-+$/, "");
    return s;
  };
  const ID = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

  // Optionales Feld „abdeckung“ (seit 0.5.3, docs/daten-v1.md): Module, deren ILIAS-Unterlagen (Folien, Blätter, Kursseiten) der
  // Autor im laufenden Semester liest; nur deren Termine aus Unterlagen kommen zentral. Ungültig → null (das Manifest gilt trotzdem).
  const abdeckungPruefen = (a) => {
    if (!a || typeof a !== "object" || Array.isArray(a) || !datumOk(a.stand) || !Array.isArray(a.module)) return null;
    const sem = textFeld(a.semester, 40, false);
    return { stand: a.stand, semester: sem.fehler ? "" : sem.wert, module: a.module.filter((c) => typeof c === "string" && MODULCODE.test(c)).slice(0, 60) };
  };
  const ABDECKUNG_TAGE = 14; // älter: der Abgleich des Autors läuft nicht mehr, kein Modul gilt als abgedeckt
  // → { stand, semester, module, gilt } oder null (nie geholt, zentrale Daten aus)
  const abdeckungStand = () => {
    const a = stand().abdeckung;
    if (!a || !Array.isArray(a.module) || !eingeschaltet()) return null;
    const alter = (Date.now() - Date.parse(a.stand + "T12:00:00Z")) / 864e5;
    return { stand: a.stand, semester: String(a.semester || ""), module: a.module.slice(), gilt: alter <= ABDECKUNG_TAGE };
  };

  // ---------- Prüfen: Manifest ----------
  const manifestPruefen = (m) => {
    if (!m || typeof m !== "object" || Array.isArray(m)) return { fehler: "Manifest ist kein Objekt" };
    if (m.schema !== 1) return { fehler: "Manifest: schema " + J(m.schema) + " unbekannt" };
    if (!isoZeitOk(m.erstellt)) return { fehler: "Manifest: erstellt fehlt oder ungültig" };
    if (!m.dateien || typeof m.dateien !== "object" || Array.isArray(m.dateien)) return { fehler: "Manifest: dateien fehlt" };
    const dateien = {};
    for (const name of Object.keys(DATEIEN)) {
      const d = m.dateien[name];
      if (d == null) continue;
      if (typeof d !== "object" || !/^[0-9a-f]{64}$/.test(String(d.sha256 || "")) || !(Number.isInteger(d.groesse) && d.groesse > 0 && d.groesse <= DATEIEN[name])) return { fehler: "Manifest: Angaben zu " + name + " ungültig" };
      dateien[name] = { sha256: d.sha256, groesse: d.groesse };
    }
    const h = textFeld(m.hinweis, G.hinweis, false);
    return {
      wert: {
        erstellt: m.erstellt, dateien, pause: m.pause === true,
        plugin_aktuell: semver(m.plugin_aktuell) ? m.plugin_aktuell : "",
        hinweis: h.fehler ? "" : h.wert,
        release: releasePruefen(m.release, false),
        beta: releasePruefen(m.beta, true),
        abdeckung: abdeckungPruefen(m.abdeckung),
      },
    };
  };
  // Optionale Felder „release“ (stabil) und „beta“ (seit 0.2.0, docs/daten-v1.md): neue Version der Vorlage für den Knopf
  // „Aktualisieren“ (update.js). Ungültig → null (kein Fehler, das Manifest gilt trotzdem). release.version ist X.Y.Z,
  // beta.version X.Y.Z-beta.N. url_basis muss genau auf den Tag v<version> im Haupt-Repo zeigen; sha256 ist die Prüfsumme
  // von system-dateien.json dieser Version.
  const releasePruefen = (r, beta) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    const form = beta ? /^\d{1,4}\.\d{1,4}\.\d{1,4}-beta\.\d{1,4}$/ : /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
    if (typeof r.version !== "string" || !form.test(r.version) || typeof r.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(r.sha256)) return null;
    if (r.url_basis !== RELEASE_ROH + "v" + r.version + "/") return null;
    const n = textFeld(r.notiz, G.hinweis, false);
    return { version: r.version, url_basis: r.url_basis, sha256: r.sha256, notiz: n.fehler ? "" : n.wert };
  };

  // ---------- Prüfen: Termine ----------
  // → { termine: [gültig], verworfen: [{ id, grund }], ids: Set (alle Einträge mit gültiger id, auch verworfene) }
  const termineNormal = (e) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) return { fehler: "kein Objekt" };
    if (typeof e.id !== "string" || !ID.test(e.id)) return { fehler: "id ungültig" };
    // Titel: wird Dateiname und Überschrift → HTML, Links, Wikilinks, Backticks, Templater, Zeilenumbrüche ablehnen
    if (typeof e.titel !== "string" || GEFAEHRLICH.test(e.titel) || /[\[\]<>{}|\\]/.test(e.titel)) return { fehler: "titel unzulässig" };
    const titel = textFeld(e.titel, G.titel, true);
    if (titel.fehler) return { fehler: "titel " + titel.fehler };
    if (!datumOk(e.datum)) return { fehler: "datum ungültig" };
    let bis = "";
    if (e.bis != null && e.bis !== "") {
      if (!datumOk(e.bis) || e.bis < e.datum || tageZwischen(e.datum, e.bis) > 400) return { fehler: "bis ungültig" };
      bis = e.bis === e.datum ? "" : e.bis;
    }
    let uhrzeit = "";
    if (e.uhrzeit != null && e.uhrzeit !== "") {
      const m = typeof e.uhrzeit === "string" && e.uhrzeit.match(/^([01]\d|2[0-3]):([0-5]\d)(?:\s*[–-]\s*([01]\d|2[0-3]):([0-5]\d))?$/);
      if (!m) return { fehler: "uhrzeit ungültig" };
      uhrzeit = `${m[1]}:${m[2]}` + (m[3] ? `–${m[3]}:${m[4]}` : "");
    }
    const ort = textFeld(e.ort, G.ort, false);
    if (ort.fehler) return { fehler: "ort " + ort.fehler };
    if (KATEGORIEN.indexOf(e.kategorie) < 0) return { fehler: "kategorie nicht erlaubt" };
    if (STATUS.indexOf(e.status) < 0) return { fehler: "status ungültig" };
    let code = "";
    if (e.code != null && e.code !== "") { if (typeof e.code !== "string" || !MODULCODE.test(e.code)) return { fehler: "code ungültig" }; code = e.code; }
    const url = urlPruefen(e.quelle_url);
    if (url.fehler) return { fehler: "quelle_url: " + url.fehler };
    const qt = textFeld(e.quelle_text, G.quelleText, false);
    if (qt.fehler) return { fehler: "quelle_text " + qt.fehler };
    const info = textFeld(e.info, G.info, false);
    if (info.fehler) return { fehler: "info " + info.fehler };
    let geprueft = "";
    if (e.geprueft != null && e.geprueft !== "") { if (!isoZeitOk(e.geprueft)) return { fehler: "geprueft ungültig" }; geprueft = e.geprueft.slice(0, 10); }
    // Nur bekannte Felder werden übernommen; unbekannte (neuere optionale Felder) werden ignoriert, nicht abgelehnt.
    const wert = { id: e.id, titel: titel.wert, datum: e.datum, bis, uhrzeit, ort: ort.wert, kategorie: e.kategorie, status: e.status, code, quelle_url: url.wert, quelle_text: qt.wert, info: info.wert, geprueft };
    if (bereichOk(e.bereich)) wert.bereich = e.bereich; // nur wenn gesetzt (Hash der anderen bleibt)
    return { wert };
  };
  const terminePruefen = (daten) => {
    const aus = { termine: [], verworfen: [], ids: new Set() };
    if (!daten || typeof daten !== "object" || daten.schema !== 1 || !Array.isArray(daten.termine)) return { fehler: "termine.json: Format ungültig" };
    if (daten.termine.length > G.termine) return { fehler: "termine.json: zu viele Einträge" };
    const gesehen = new Set();
    for (const roh of daten.termine) {
      const id = roh && typeof roh.id === "string" && ID.test(roh.id) ? roh.id : "";
      if (id && gesehen.has(id)) { aus.verworfen.push({ id, grund: "doppelte id" }); continue; }
      if (id) { gesehen.add(id); aus.ids.add(id); }
      const r = termineNormal(roh);
      if (r.fehler) aus.verworfen.push({ id: id || "?", grund: r.fehler });
      else aus.termine.push(r.wert);
    }
    return aus;
  };

  // ---------- Prüfen: Semesterdaten (entspricht System/Daten/Semester.md) ----------
  const SEMNAME = /^(WS \d{4}\/\d{2}|SS \d{4})$/;
  const semesterPruefen = (d) => {
    if (!d || typeof d !== "object" || d.schema !== 1) return { fehler: "semester.json: Format ungültig" };
    const verworfen = [];
    const liste = (v, art, fn) => {
      if (!Array.isArray(v)) return [];
      const aus = [];
      for (const o of v.slice(0, G.liste)) {
        if (!o || typeof o !== "object") { verworfen.push(art); continue; }
        const st = STATUS.indexOf(o.status) >= 0 ? o.status : null;
        const h = textFeld(o.hinweis, G.hinweis, false);
        const w = st && !h.fehler ? fn(o) : null;
        if (!w) { verworfen.push(art + " " + J(o.name || o.art || o.fuer || "")); continue; }
        w.status = st;
        if (h.wert) w.hinweis = h.wert;
        aus.push(w);
      }
      return aus;
    };
    const name = (v) => { const t = textFeld(v, G.name, true); return t.fehler ? null : t.wert; };
    const spanne = (o) => datumOk(o.von) && datumOk(o.bis) && o.bis >= o.von;
    const aus = {
      stand: datumOk(d.stand) ? d.stand : "",
      quellen: {},
      semester: liste(d.semester, "semester", (o) => (typeof o.name === "string" && SEMNAME.test(o.name) && datumOk(o.beginn) && datumOk(o.ende) && o.ende > o.beginn
        && datumOk(o.vorlesung_beginn) && datumOk(o.vorlesung_ende) && o.vorlesung_ende > o.vorlesung_beginn
        ? { name: o.name, beginn: o.beginn, ende: o.ende, vorlesung_beginn: o.vorlesung_beginn, vorlesung_ende: o.vorlesung_ende } : null)),
      pausen: liste(d.pausen, "pause", (o) => (name(o.name) && spanne(o) ? { name: name(o.name), von: o.von, bis: o.bis } : null)),
      freie_tage: liste(d.freie_tage, "freier Tag", (o) => (name(o.name) && datumOk(o.datum) ? { name: name(o.name), datum: o.datum } : null)),
      pruefungsphasen: liste(d.pruefungsphasen, "prüfungsphase", (o) => (name(o.art) && typeof o.semester === "string" && SEMNAME.test(o.semester) && spanne(o)
        ? { art: name(o.art), semester: o.semester, von: o.von, bis: o.bis } : null)),
      rueckmeldung: liste(d.rueckmeldung, "rückmeldung", (o) => (typeof o.fuer === "string" && SEMNAME.test(o.fuer) && spanne(o) ? { fuer: o.fuer, von: o.von, bis: o.bis } : null)),
    };
    if (d.quellen && typeof d.quellen === "object") {
      for (const k of Object.keys(d.quellen).slice(0, 10)) { const u = urlPruefen(d.quellen[k]); if (/^[a-z_]{1,30}$/.test(k) && u.wert) aus.quellen[k] = u.wert; }
    }
    if (!aus.semester.length) return { fehler: "semester.json: keine gültigen Semester" };
    return { wert: aus, verworfen };
  };

  // ---------- Prüfen: Übungs- und Tutoriengruppen (gruppen.json, docs/daten-v1.md) ----------
  // → { stand, gruppen: [gültig], verworfen: [{ id, grund }] } oder { fehler } (ganze Datei abgelehnt)
  const ARTEN = ["Übung", "Tutorium"];
  const TAGE = ["Mo", "Di", "Mi", "Do", "Fr"];
  const UHR = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const gruppeNormal = (e) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) return { fehler: "kein Objekt" };
    if (typeof e.id !== "string" || !ID.test(e.id)) return { fehler: "id ungültig" };
    if (typeof e.code !== "string" || !MODULCODE.test(e.code)) return { fehler: "code ungültig" };
    if (ARTEN.indexOf(e.art) < 0) return { fehler: "art nicht erlaubt" };
    if (TAGE.indexOf(e.tag) < 0) return { fehler: "tag ungültig" };
    if (typeof e.von !== "string" || !UHR.test(e.von) || typeof e.bis !== "string" || !UHR.test(e.bis) || e.bis <= e.von) return { fehler: "von/bis ungültig" };
    if (typeof e.semester !== "string" || !SEMNAME.test(e.semester)) return { fehler: "semester ungültig" };
    if (e.gruppe != null && e.gruppe !== "" && (typeof e.gruppe !== "string" || GEFAEHRLICH.test(e.gruppe) || /[\[\]<>{}|\\]/.test(e.gruppe))) return { fehler: "gruppe unzulässig" };
    const gruppe = textFeld(e.gruppe, G.gruppe, false);
    if (gruppe.fehler) return { fehler: "gruppe " + gruppe.fehler };
    const raum = textFeld(e.raum, G.raum, false);
    if (raum.fehler) return { fehler: "raum " + raum.fehler };
    const leitung = textFeld(e.leitung, G.leitung, false);
    if (leitung.fehler) return { fehler: "leitung " + leitung.fehler };
    const anmeldung = textFeld(e.anmeldung, G.anmeldung, false);
    if (anmeldung.fehler) return { fehler: "anmeldung " + anmeldung.fehler };
    if (e.quelle_url == null || e.quelle_url === "") return { fehler: "quelle_url fehlt" };
    const url = urlPruefen(e.quelle_url);
    if (url.fehler) return { fehler: "quelle_url: " + url.fehler };
    let zeitraum = null;
    if (e.zeitraum != null && e.zeitraum !== "") {
      const z = e.zeitraum;
      if (!z || typeof z !== "object" || !datumOk(z.von) || !datumOk(z.bis) || z.bis < z.von || tageZwischen(z.von, z.bis) > 400) return { fehler: "zeitraum ungültig" };
      zeitraum = { von: z.von, bis: z.bis };
    }
    let geprueft = "";
    if (e.geprueft != null && e.geprueft !== "") { if (!isoZeitOk(e.geprueft)) return { fehler: "geprueft ungültig" }; geprueft = e.geprueft.slice(0, 10); }
    // Nur bekannte Felder; unbekannte (neuere optionale) werden ignoriert
    return { wert: { id: e.id, code: e.code, art: e.art, gruppe: gruppe.wert, tag: e.tag, von: e.von, bis: e.bis, ct: e.ct === true, raum: raum.wert,
      leitung: leitung.wert, anmeldung: anmeldung.wert, quelle_url: url.wert, semester: e.semester, zeitraum, geprueft } };
  };
  const gruppenPruefen = (daten) => {
    if (!daten || typeof daten !== "object" || daten.schema !== 1 || !Array.isArray(daten.gruppen)) return { fehler: "gruppen.json: Format ungültig" };
    if (daten.gruppen.length > G.gruppen) return { fehler: "gruppen.json: zu viele Einträge" };
    const aus = { stand: datumOk(daten.stand) ? daten.stand : "", gruppen: [], verworfen: [] };
    const gesehen = new Set();
    for (const roh of daten.gruppen) {
      const id = roh && typeof roh.id === "string" && ID.test(roh.id) ? roh.id : "";
      if (id && gesehen.has(id)) { aus.verworfen.push({ id, grund: "doppelte id" }); continue; }
      if (id) gesehen.add(id);
      const r = gruppeNormal(roh);
      if (r.fehler) aus.verworfen.push({ id: id || "?", grund: r.fehler });
      else aus.gruppen.push(r.wert);
    }
    return aus;
  };

  // ---------- Prüfen: Angebote der Uni (angebote.json, docs/daten-v1.md) ----------
  // → { stand, angebote: [gültig], verworfen: [{ id, grund }] } oder { fehler } (ganze Datei abgelehnt)
  const ANGEBOT_KATEGORIEN = ["vortrag", "ub", "sport", "welcome"];
  const ANGEBOT_DOMAINS = ["uni-tuebingen.de"]; // nur Seiten der Uni (inkl. Subdomains)
  // Zeitpunkt der Anmeldung: Datum oder Datum mit Uhrzeit (Ortszeit, ohne Zone)
  const zeitpunktOk = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/.test(s) && datumOk(s.slice(0, 10));
  const reinerText = (v) => typeof v === "string" && !GEFAEHRLICH.test(v) && !/[\[\]<>{}|\\]/.test(v); // wie titel bei Terminen
  const angebotNormal = (e) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) return { fehler: "kein Objekt" };
    if (typeof e.id !== "string" || !ID.test(e.id)) return { fehler: "id ungültig" };
    if (ANGEBOT_KATEGORIEN.indexOf(e.kategorie) < 0) return { fehler: "kategorie nicht erlaubt" };
    if (!reinerText(e.reihe)) return { fehler: "reihe unzulässig" };
    const reihe = textFeld(e.reihe, G.reihe, true);
    if (reihe.fehler) return { fehler: "reihe " + reihe.fehler };
    if (!reinerText(e.titel)) return { fehler: "titel unzulässig" };
    const titel = textFeld(e.titel, G.titel, true);
    if (titel.fehler) return { fehler: "titel " + titel.fehler };
    if (!datumOk(e.datum)) return { fehler: "datum ungültig" };
    let von = "", bis = "";
    if (e.von != null && e.von !== "") { if (typeof e.von !== "string" || !UHR.test(e.von)) return { fehler: "von ungültig" }; von = e.von; }
    if (e.bis != null && e.bis !== "") { if (!von || typeof e.bis !== "string" || !UHR.test(e.bis) || e.bis <= von) return { fehler: "bis ungültig" }; bis = e.bis; }
    const ort = textFeld(e.ort, G.ort, false);
    if (ort.fehler) return { fehler: "ort " + ort.fehler };
    if (e.url == null || e.url === "") return { fehler: "url fehlt" };
    const url = urlPruefen(e.url, ANGEBOT_DOMAINS);
    if (url.fehler) return { fehler: "url: " + url.fehler };
    let anmeldung = null;
    if (e.anmeldung != null) {
      const a = e.anmeldung;
      if (typeof a !== "object" || Array.isArray(a)) return { fehler: "anmeldung ungültig" };
      const ab = a.ab == null || a.ab === "" ? "" : a.ab, ende = a.bis == null || a.bis === "" ? "" : a.bis;
      if ((ab && !zeitpunktOk(ab)) || (ende && !zeitpunktOk(ende)) || (ab && ende && ende < ab)) return { fehler: "anmeldung ungültig" };
      if (ab || ende) anmeldung = { ab, bis: ende };
    }
    // Nur bekannte Felder; unbekannte (neuere optionale) werden ignoriert
    return { wert: { id: e.id, kategorie: e.kategorie, reihe: reihe.wert, titel: titel.wert, datum: e.datum, von, bis, ort: ort.wert,
      online: e.online === true, url: url.wert, anmeldung } };
  };
  const angebotePruefen = (daten) => {
    if (!daten || typeof daten !== "object" || daten.schema !== 1 || !Array.isArray(daten.angebote)) return { fehler: "angebote.json: Format ungültig" };
    if (daten.angebote.length > G.angebote) return { fehler: "angebote.json: zu viele Einträge" };
    const aus = { stand: isoZeitOk(daten.stand) ? daten.stand.slice(0, 10) : "", angebote: [], verworfen: [] };
    const gesehen = new Set();
    for (const roh of daten.angebote) {
      const id = roh && typeof roh.id === "string" && ID.test(roh.id) ? roh.id : "";
      if (id && gesehen.has(id)) { aus.verworfen.push({ id, grund: "doppelte id" }); continue; }
      if (id) gesehen.add(id);
      const r = angebotNormal(roh);
      if (r.fehler) aus.verworfen.push({ id: id || "?", grund: r.fehler });
      else aus.angebote.push(r.wert);
    }
    return aus;
  };

  // ---------- Prüfen: Kapitellisten (kapitel.json, docs/daten-v1.md) ----------
  // → { stand, module: [gültig], verworfen: [{ id, grund }] } oder { fehler } (ganze Datei abgelehnt). Nur Fakten: Nummer, Titel,
  // Seiten, Nummer der Folien, Link aufs Lehrbuch; ein ungültiges Kapitel verwirft sein ganzes Modul (keine halben Listen).
  const KAPITEL_DOMAINS = ["uni-tuebingen.de", "core-econ.org"]; // Uni und das freie Lehrbuch von CORE
  const KAPITEL_NR = /^[0-9A-Z][0-9A-Za-z.]{0,7}$/;
  const SEMESTER_NAME = /^(WS \d{4}\/\d{2}|SS \d{4})$/;
  const kapitelTitel = (v) => (reinerText(v) ? textFeld(v, G.kapitelTitel, true) : { fehler: "unzulässig" });
  const ganzZahl = (v, min, max) => (v == null || v === "" ? { wert: null } : Number.isInteger(v) && v >= min && v <= max ? { wert: v } : { fehler: "ungültig" });
  const kapitelNormal = (k) => {
    if (!k || typeof k !== "object" || Array.isArray(k)) return { fehler: "kein Objekt" };
    if (typeof k.nr !== "string" || !KAPITEL_NR.test(k.nr)) return { fehler: "nr ungültig" };
    const titel = kapitelTitel(k.titel);
    if (titel.fehler) return { fehler: "titel " + titel.fehler };
    const seiten = ganzZahl(k.seiten, 1, 2000), folien = ganzZahl(k.folien, 0, 99);
    if (seiten.fehler) return { fehler: "seiten ungültig" };
    if (folien.fehler) return { fehler: "folien ungültig" };
    let url = "";
    if (k.url != null && k.url !== "") { const u = urlPruefen(k.url, KAPITEL_DOMAINS); if (u.fehler) return { fehler: "url: " + u.fehler }; url = u.wert; }
    const teile = [];
    if (k.teile != null) {
      if (!Array.isArray(k.teile) || k.teile.length > G.teile) return { fehler: "teile ungültig" };
      for (const t of k.teile) {
        if (!t || typeof t !== "object" || typeof t.nr !== "string" || !KAPITEL_NR.test(t.nr)) return { fehler: "teil ungültig" };
        const tt = kapitelTitel(t.titel);
        if (tt.fehler) return { fehler: "teil " + t.nr + " titel " + tt.fehler };
        teile.push({ nr: t.nr, titel: tt.wert });
      }
    }
    return { wert: { nr: k.nr, titel: titel.wert, seiten: seiten.wert, folien: folien.wert, url, teile } };
  };
  const kapitelModulNormal = (e) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) return { fehler: "kein Objekt" };
    if (typeof e.code !== "string" || !MODULCODE.test(e.code)) return { fehler: "code ungültig" };
    if (typeof e.semester !== "string" || !SEMESTER_NAME.test(e.semester)) return { fehler: "semester ungültig" };
    if (!reinerText(e.quelle == null ? "" : e.quelle)) return { fehler: "quelle unzulässig" };
    const quelle = textFeld(e.quelle, G.quelle, false);
    if (quelle.fehler) return { fehler: "quelle " + quelle.fehler };
    if (!Array.isArray(e.kapitel) || !e.kapitel.length || e.kapitel.length > G.kapitel) return { fehler: "kapitel ungültig" };
    const kapitel = [];
    for (const k of e.kapitel) {
      const r = kapitelNormal(k);
      if (r.fehler) return { fehler: "kapitel " + (k && typeof k.nr === "string" ? k.nr : "?") + ": " + r.fehler };
      kapitel.push(r.wert);
    }
    if (new Set(kapitel.map((k) => k.nr)).size !== kapitel.length) return { fehler: "doppelte Kapitelnummer" };
    return { wert: { code: e.code, semester: e.semester, quelle: quelle.wert, stand: datumOk(e.stand) ? e.stand : "", vorlaeufig: e.vorlaeufig === true, kapitel } };
  };
  const kapitelPruefen = (daten) => {
    if (!daten || typeof daten !== "object" || daten.schema !== 1 || !Array.isArray(daten.module)) return { fehler: "kapitel.json: Format ungültig" };
    if (daten.module.length > G.kapitelModule) return { fehler: "kapitel.json: zu viele Module" };
    const aus = { stand: isoZeitOk(daten.stand) ? daten.stand.slice(0, 10) : "", module: [], verworfen: [] };
    const gesehen = new Set();
    for (const roh of daten.module) {
      const id = roh && typeof roh.code === "string" && typeof roh.semester === "string" ? `${roh.code} ${roh.semester}` : "?";
      if (gesehen.has(id)) { aus.verworfen.push({ id, grund: "doppelt" }); continue; }
      gesehen.add(id);
      const r = kapitelModulNormal(roh);
      if (r.fehler) aus.verworfen.push({ id, grund: r.fehler });
      else aus.module.push(r.wert);
    }
    return aus;
  };

  // ---------- Prüfen: Literaturlisten (literatur.json, docs/daten-v1.md) ----------
  // → { stand, module: [gültig], verworfen: [{ id, grund }] } oder { fehler } (ganze Datei abgelehnt). Nur Fakten: Angabe des Werks,
  // Rolle, Links auf Katalog und Verlag, Stellen je Kapitel, Nummer und Seite der Folien; ein ungültiger Teil verwirft sein ganzes Modul.
  const LITERATUR_DOMAINS = ["uni-tuebingen.de", "ibs-bw.de", "doi.org", "core-econ.org", "springer.com", "pearson.de", "proquest.com"];
  const LITERATUR_ARTEN = ["Folien", "Skript", "Übung", "Tutorium", "Lab", "Lösung", "Altklausur", "Literatur"];
  const WERK_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
  const KATALOG_PPN = /^\d{6,12}[\dX]$/;
  // Links mit Sitzung oder Schlüssel in der Adresse gehören einer Person
  const LINK_PERSOENLICH = /[?&;](?:[^=&#;]*(?:token|sess|ticket|signature)[^=&#;]*|sid|auth|key|api_?key|sig)=/i;
  const litText = (v, max, pflicht) => (v != null && v !== "" && !reinerText(v) ? { fehler: "unzulässig" } : textFeld(v, max, pflicht));
  // Unterlage des Moduls: { art, nummer, seite } (seite optional)
  const unterlageNormal = (u) => {
    if (!u || typeof u !== "object" || Array.isArray(u) || LITERATUR_ARTEN.indexOf(u.art) < 0) return { fehler: "ungültig" };
    const nummer = ganzZahl(u.nummer, 0, 99), seite = ganzZahl(u.seite, 1, 2000);
    if (nummer.fehler || nummer.wert == null || seite.fehler) return { fehler: "ungültig" };
    return { wert: { art: u.art, nummer: nummer.wert, seite: seite.wert } };
  };
  const literaturLinkNormal = (l) => {
    if (!l || typeof l !== "object" || Array.isArray(l)) return { fehler: "kein Objekt" };
    const text = litText(l.text, GL.linkText, true);
    if (text.fehler) return { fehler: "text " + text.fehler };
    if (l.url != null && l.url !== "") {
      const u = urlPruefen(l.url, LITERATUR_DOMAINS);
      if (u.fehler) return { fehler: u.fehler };
      if (LINK_PERSOENLICH.test(u.wert)) return { fehler: "Link mit Sitzung oder Schlüssel" };
      return { wert: { text: text.wert, url: u.wert } };
    }
    const u = unterlageNormal(l.unterlage);
    return u.fehler ? { fehler: "Ziel fehlt" } : { wert: { text: text.wert, unterlage: u.wert } };
  };
  const werkNormal = (w) => {
    if (!w || typeof w !== "object" || Array.isArray(w)) return { fehler: "kein Objekt" };
    if (typeof w.id !== "string" || !WERK_ID.test(w.id)) return { fehler: "id ungültig" };
    const f = { rolle: litText(w.rolle, GL.rolle, true), angabe: litText(w.angabe, GL.angabe, true), spalte: litText(w.spalte, GL.spalte, false),
      hinweis: litText(w.hinweis, GL.werkHinweis, false), suche: litText(w.suche, GL.suche, false) };
    for (const k of Object.keys(f)) if (f[k].fehler) return { fehler: k + " " + f[k].fehler };
    const abschnitt = w.abschnitt == null || w.abschnitt === "" ? "haupt" : w.abschnitt;
    if (abschnitt !== "haupt" && abschnitt !== "weitere") return { fehler: "abschnitt ungültig" };
    const katalog = w.katalog == null ? "" : w.katalog;
    if (katalog !== "" && (typeof katalog !== "string" || !KATALOG_PPN.test(katalog))) return { fehler: "katalog ungültig" };
    if (w.links != null && (!Array.isArray(w.links) || w.links.length > GL.links)) return { fehler: "links ungültig" };
    const links = [];
    for (const l of w.links || []) {
      const r = literaturLinkNormal(l);
      if (r.fehler) return { fehler: "link: " + r.fehler };
      links.push(r.wert);
    }
    return { wert: { id: w.id, rolle: f.rolle.wert, angabe: f.angabe.wert, abschnitt, spalte: f.spalte.wert, hinweis: f.hinweis.wert,
      katalog, suche: f.suche.wert, links } };
  };
  const lesenNormal = (z, spalten) => {
    if (!z || typeof z !== "object" || Array.isArray(z)) return { fehler: "kein Objekt" };
    const zu = litText(z.zu, GL.zu, true);
    if (zu.fehler) return { fehler: "zu " + zu.fehler };
    let beleg = null;
    if (z.beleg != null) { const b = unterlageNormal(z.beleg); if (b.fehler) return { fehler: "beleg ungültig" }; beleg = b.wert; }
    const st = z.stellen;
    if (!st || typeof st !== "object" || Array.isArray(st) || !Object.keys(st).length) return { fehler: "stellen fehlt" };
    const stellen = {};
    for (const k of Object.keys(st)) {
      if (spalten.indexOf(k) < 0) return { fehler: "Werk " + k + " ohne Spalte" };
      const t = litText(st[k], GL.stellen, true);
      if (t.fehler) return { fehler: k + " " + t.fehler };
      stellen[k] = t.wert;
    }
    return { wert: { zu: zu.wert, beleg, stellen } };
  };
  const literaturModulNormal = (e) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) return { fehler: "kein Objekt" };
    if (typeof e.code !== "string" || !MODULCODE.test(e.code)) return { fehler: "code ungültig" };
    if (typeof e.semester !== "string" || !SEMESTER_NAME.test(e.semester)) return { fehler: "semester ungültig" };
    const f = { quelle: litText(e.quelle, GL.quelle, true), hinweis: litText(e.hinweis, GL.hinweis, false), kopf: litText(e.kopf, GL.kopf, false) };
    for (const k of Object.keys(f)) if (f[k].fehler) return { fehler: k + " " + f[k].fehler };
    let beleg = null;
    if (e.beleg != null) { const b = unterlageNormal(e.beleg); if (b.fehler) return { fehler: "beleg ungültig" }; beleg = b.wert; }
    if (!Array.isArray(e.werke) || !e.werke.length || e.werke.length > GL.werke) return { fehler: "werke ungültig" };
    const werke = [];
    for (const w of e.werke) {
      const r = werkNormal(w);
      if (r.fehler) return { fehler: "werk " + (w && typeof w.id === "string" ? w.id : "?") + ": " + r.fehler };
      werke.push(r.wert);
    }
    if (new Set(werke.map((w) => w.id)).size !== werke.length) return { fehler: "doppelte Werk-id" };
    if (e.lesen != null && (!Array.isArray(e.lesen) || e.lesen.length > GL.lesen)) return { fehler: "lesen ungültig" };
    const spalten = werke.filter((w) => w.spalte).map((w) => w.id), lesen = [];
    for (const z of e.lesen || []) {
      const r = lesenNormal(z, spalten);
      if (r.fehler) return { fehler: "lesen: " + r.fehler };
      lesen.push(r.wert);
    }
    return { wert: { code: e.code, semester: e.semester, stand: datumOk(e.stand) ? e.stand : "", quelle: f.quelle.wert, hinweis: f.hinweis.wert,
      kopf: f.kopf.wert || "Kapitel", beleg, werke, lesen } };
  };
  const literaturPruefen = (daten) => {
    if (!daten || typeof daten !== "object" || daten.schema !== 1 || !Array.isArray(daten.module)) return { fehler: "literatur.json: Format ungültig" };
    if (daten.module.length > GL.module) return { fehler: "literatur.json: zu viele Module" };
    const aus = { stand: isoZeitOk(daten.stand) ? daten.stand.slice(0, 10) : "", module: [], verworfen: [] };
    const gesehen = new Set();
    for (const roh of daten.module) {
      const id = roh && typeof roh.code === "string" && typeof roh.semester === "string" ? `${roh.code} ${roh.semester}` : "?";
      if (gesehen.has(id)) { aus.verworfen.push({ id, grund: "doppelt" }); continue; }
      gesehen.add(id);
      const r = literaturModulNormal(roh);
      if (r.fehler) aus.verworfen.push({ id, grund: r.fehler });
      else aus.module.push(r.wert);
    }
    return aus;
  };

  // ---------- Prüfen: Zentraler Stundenplan (veranstaltungen.json, docs/daten-v1.md) ----------
  // Gleiche Regeln wie veranstaltung_pruefen im Export, mit zwei Abweichungen laut Vertrag: unbekannte art → „Sonstige“ (der
  // Eintrag bleibt), unbekannte Felder (auch in aenderungen) werden ignoriert statt verworfen.
  // → { stand, veranstaltungen: [gültig], verworfen: [{ id, grund }], ids: Set (alle Einträge mit gültiger id) } oder { fehler }
  const LEHRE_ARTEN = ["Vorlesung", "Übung", "Tutorium", "Seminar", "Kolloquium", "Praktikum", "Kurs", "Sonstige"];
  const BEZEICHNUNG_ARTEN = ["Kolloquium", "Praktikum", "Kurs", "Sonstige"];
  // offizieller Name gilt nur zu diesen Arten und darf nicht wie eine steuernde Art heißen („Übung“, „tutorium“)
  const bezeichnungOk = (art, b) => BEZEICHNUNG_ARTEN.indexOf(art) >= 0
    && !LEHRE_ARTEN.some((a) => BEZEICHNUNG_ARTEN.indexOf(a) < 0 && a.toLowerCase() === b.toLowerCase());
  const RHYTHMEN = ["wöchentlich", "14-täglich", "Einzeltermin"];
  const WOCHE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const pad2 = (n) => String(n).padStart(2, "0");
  const plusTage = (iso, n) => { const t = iso.split("-").map(Number), d = new Date(t[0], t[1] - 1, t[2] + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const wochentagVon = (iso) => { const t = iso.split("-").map(Number); return WOCHE[(new Date(t[0], t[1] - 1, t[2]).getDay() + 6) % 7]; };
  // Rahmen eines Semesters: WS 01.10.–31.03., SS 01.04.–30.09.
  const semesterRahmen = (name) => {
    let m = String(name).match(/^WS (\d{4})\/\d{2}$/);
    if (m) return { von: m[1] + "-10-01", bis: (Number(m[1]) + 1) + "-03-31" };
    m = String(name).match(/^SS (\d{4})$/);
    return m ? { von: m[1] + "-04-01", bis: m[1] + "-09-30" } : null;
  };
  const kurzText = (v, max, was) => { // optionaler reiner Text (Gruppe, Raum): leer erlaubt
    if (v == null || v === "") return { wert: "" };
    if (!reinerText(v)) return { fehler: was + " unzulässig" };
    const t = textFeld(v, max, false);
    return t.fehler ? { fehler: was + " " + t.fehler } : t;
  };
  const lehreNormal = (e) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) return { fehler: "kein Objekt" };
    if (typeof e.id !== "string" || !ID.test(e.id)) return { fehler: "id ungültig" };
    if (typeof e.code !== "string" || !MODULCODE.test(e.code)) return { fehler: "code ungültig" };
    if (!reinerText(e.titel)) return { fehler: "titel unzulässig" };
    const titel = textFeld(e.titel, G.titel, true);
    if (titel.fehler) return { fehler: "titel " + titel.fehler };
    const gruppe = kurzText(e.gruppe, G.gruppe, "gruppe");
    if (gruppe.fehler) return { fehler: gruppe.fehler };
    // Offizieller Name einer Lehrveranstaltung außerhalb von Alma (seit 24.10.2026, optional, z. B. „Data Science Lab“ zur art
    // „Praktikum“): steht statt der Art in Name, Titel, Kopf und Feld art der Notiz. Nur zu Arten ohne eigene Bedeutung im Plugin
    // (BEZEICHNUNG_ARTEN; Vorlesung, Übung, Tutorium und Seminar steuern Gruppen und Raster). Sonst oder ungültig → ignoriert,
    // der Eintrag bleibt.
    const bez = kurzText(e.bezeichnung, G.bezeichnung, "bezeichnung");
    if (WOCHE.indexOf(e.tag) < 0) return { fehler: "tag ungültig" };
    if (typeof e.von !== "string" || !UHR.test(e.von) || typeof e.bis !== "string" || !UHR.test(e.bis) || e.bis <= e.von) return { fehler: "von/bis ungültig" };
    if (e.ct != null && typeof e.ct !== "boolean") return { fehler: "ct ungültig" };
    if (RHYTHMEN.indexOf(e.rhythmus) < 0) return { fehler: "rhythmus nicht erlaubt" };
    const z = e.zeitraum;
    if (!z || typeof z !== "object" || !datumOk(z.von) || !datumOk(z.bis) || z.bis < z.von || tageZwischen(z.von, z.bis) > 400) return { fehler: "zeitraum ungültig" };
    if (e.rhythmus === "Einzeltermin" && z.von !== z.bis) return { fehler: "Einzeltermin mit Zeitraum" };
    if (wochentagVon(z.von) !== e.tag) return { fehler: "tag passt nicht zum ersten Datum" };
    if (typeof e.semester !== "string" || !SEMNAME.test(e.semester)) return { fehler: "semester ungültig" };
    const rahmen = semesterRahmen(e.semester);
    if (z.von < plusTage(rahmen.von, -31) || z.bis > plusTage(rahmen.bis, 31)) return { fehler: "zeitraum außerhalb des Semesters" };
    const raum = kurzText(e.raum, G.raum, "raum");
    if (raum.fehler) return { fehler: raum.fehler };
    // Dauerhafte Verlegung (seit 20.10.2026): nur beide zusammen, raum_seit im Zeitraum, der neue Raum gesetzt
    if ((e.raum_seit != null) !== (e.raum_vorher != null)) return { fehler: "raum_seit und raum_vorher nur zusammen" };
    const vorher = e.raum_vorher == null ? { wert: "" } : kurzText(e.raum_vorher, G.raum, "raum_vorher");
    if (vorher.fehler) return { fehler: vorher.fehler };
    if (e.raum_seit != null && (!datumOk(e.raum_seit) || e.raum_seit < z.von || e.raum_seit > z.bis || !raum.wert || !vorher.wert)) return { fehler: "raum_seit/raum_vorher unzulässig" };
    const ausfall = e.ausfall == null ? [] : e.ausfall;
    if (!Array.isArray(ausfall) || ausfall.length > G.ausfall) return { fehler: "ausfall ungültig" };
    for (let i = 0; i < ausfall.length; i++) {
      if (!datumOk(ausfall[i]) || ausfall[i] < z.von || ausfall[i] > z.bis || (i && ausfall[i] <= ausfall[i - 1])) return { fehler: "ausfall ungültig" };
    }
    const roh = e.aenderungen == null ? [] : e.aenderungen;
    if (!Array.isArray(roh) || roh.length > G.aenderungen) return { fehler: "aenderungen ungültig" };
    const randVon = plusTage(z.von, -31), randBis = plusTage(z.bis, 31), aenderungen = [];
    for (const x of roh) {
      if (!x || typeof x !== "object" || Array.isArray(x) || !datumOk(x.datum) || x.datum < randVon || x.datum > randBis) return { fehler: "aenderungen ungültig" };
      const a = { datum: x.datum, raum: "", von: "", bis: "", zusatz: x.zusatz === true };
      if (x.zusatz != null && x.zusatz !== true) return { fehler: "aenderungen: zusatz ungültig" };
      if (x.raum != null) {
        const r = kurzText(x.raum, G.raum, "aenderungen: raum");
        if (r.fehler || !r.wert) return { fehler: "aenderungen: raum unzulässig" };
        a.raum = r.wert;
      }
      if ((x.von != null) !== (x.bis != null)) return { fehler: "aenderungen: von/bis ungültig" };
      if (x.von != null) {
        if (typeof x.von !== "string" || !UHR.test(x.von) || typeof x.bis !== "string" || !UHR.test(x.bis) || x.bis <= x.von) return { fehler: "aenderungen: von/bis ungültig" };
        a.von = x.von; a.bis = x.bis;
      }
      if (!a.raum && !a.von && !a.zusatz) return { fehler: "aenderungen ungültig" };
      aenderungen.push(a);
    }
    if (e.quelle_url == null || e.quelle_url === "") return { fehler: "quelle_url fehlt" };
    const url = urlPruefen(e.quelle_url);
    if (url.fehler) return { fehler: "quelle_url: " + url.fehler };
    // Nur bekannte Felder; unbekannte (neuere optionale) werden ignoriert. Unbekannte Art gilt als „Sonstige“.
    return { wert: { id: e.id, code: e.code, art: LEHRE_ARTEN.indexOf(e.art) >= 0 ? e.art : "Sonstige", titel: titel.wert, gruppe: gruppe.wert,
      bezeichnung: bez.fehler || !bezeichnungOk(e.art, bez.wert) ? "" : bez.wert, tag: e.tag, von: e.von, bis: e.bis, ct: e.ct === true, rhythmus: e.rhythmus, zeitraum: { von: z.von, bis: z.bis }, raum: raum.wert,
      raum_seit: e.raum_seit || "", raum_vorher: vorher.wert, ausfall: ausfall.slice(), aenderungen, semester: e.semester, quelle_url: url.wert } };
  };
  const lehrePruefen = (daten) => {
    if (!daten || typeof daten !== "object" || daten.schema !== 1 || !Array.isArray(daten.veranstaltungen)) return { fehler: "veranstaltungen.json: Format ungültig" };
    if (daten.veranstaltungen.length > G.lehre) return { fehler: "veranstaltungen.json: zu viele Einträge" };
    const aus = { stand: datumOk(daten.stand) ? daten.stand : "", veranstaltungen: [], verworfen: [], ids: new Set() };
    const gesehen = new Set();
    for (const roh of daten.veranstaltungen) {
      const id = roh && typeof roh.id === "string" && ID.test(roh.id) ? roh.id : "";
      if (id && gesehen.has(id)) { aus.verworfen.push({ id, grund: "doppelte id" }); continue; }
      if (id) { gesehen.add(id); aus.ids.add(id); }
      const r = lehreNormal(roh);
      if (r.fehler) aus.verworfen.push({ id: id || "?", grund: r.fehler });
      else aus.veranstaltungen.push(r.wert);
    }
    return aus;
  };

  // ---------- Abruf (Netz oder Testquelle) ----------
  const basis = () => String(plugin().testZentralBasis || BASIS).replace(/\/?$/, "/");
  // Frisch vom Server (seit 19.10.2026): GitHub Pages schickt jede Datei mit „Cache-Control: max-age=600“, Gerät und
  // Zwischenspeicher gaben das Manifest darum bis zu 10 Min. alt zurück (0.4.7 erschien auf einem iPad lange nicht; eine Datei,
  // die älter ist als ihr Manifest, scheitert genauso an der Prüfsumme). Darum je Minute eine eigene Adresse: gleich viele
  // Abrufe wie vorher, Geräte in derselben Minute teilen sich den Zwischenspeicher. Dazu „Cache-Control: no-cache“; requestUrl
  // reicht Kopfzeilen auf allen Geräten durch (ilias-netz.js auf iPhone und iPad genauso). update.js nimmt beides für die Liste.
  const frischUrl = (url, ms) => url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Math.floor((ms == null ? jetztMs() : ms) / MIN);
  const FRISCH_KOPF = Object.freeze({ "Cache-Control": "no-cache" });
  const holen = async (name) => {
    const p = plugin();
    if (typeof p.testQuelle === "function") {
      const t = await p.testQuelle(name);
      if (t == null) throw new Error("nicht gefunden: " + name);
      const bytes = new TextEncoder().encode(String(t));
      return { bytes, text: String(t) };
    }
    let r = await ctx.obsidian.requestUrl({ url: frischUrl(basis() + name), method: "GET", headers: Object.assign({}, FRISCH_KOPF), throw: false });
    // 304 ohne Inhalt (Zwischenspeicher des Geräts): einmal mit Zeitstempel an der Adresse neu holen
    if (r.status === 304) r = await ctx.obsidian.requestUrl({ url: basis() + name + "?t=" + jetztMs(), method: "GET", throw: false });
    if (r.status !== 200) throw new Error("HTTP " + r.status + " (" + name + ")");
    const bytes = new Uint8Array(r.arrayBuffer);
    return { bytes, text: new TextDecoder("utf-8").decode(bytes) };
  };
  const sha256 = async (bytes) => {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    let s = "";
    for (let i = 0; i < h.length; i++) s += h[i].toString(16).padStart(2, "0");
    return s;
  };

  // ---------- Gerät und Abrufer ----------
  const geraetId = () => {
    let id = lokal(L.geraet);
    if (!id || typeof id !== "string") {
      const z = new Uint8Array(6);
      crypto.getRandomValues(z);
      id = "g-" + Array.prototype.map.call(z, (b) => b.toString(16).padStart(2, "0")).join("");
      lokal(L.geraet, id);
    }
    return id;
  };
  const abrufLesen = async () => {
    const f = datei(ABRUF);
    if (!f) return null;
    try {
      const o = JSON.parse(await app.vault.read(f));
      if (!o || typeof o !== "object" || typeof o.geraet !== "string") return null;
      return { geraet: o.geraet, seit: String(o.seit || ""), zuletzt: String(o.zuletzt || ""), mobil: o.mobil === true, angewendet: o.angewendet && typeof o.angewendet === "object" ? o.angewendet : {} };
    } catch (e) { return null; }
  };
  const alterMs = (iso) => { const t = Date.parse(iso || ""); return isNaN(t) ? Infinity : jetztMs() - t; };
  // Schreibt dieses Gerät gerade für alle? Ja, wenn es der Abrufer ist, wenn es noch keinen gibt oder wenn der Abrufer länger
  // als UEBERNAHME still war (beim nächsten Abruf übernähme es ohnehin). modell.js schreibt die abgeleiteten Semesterfelder
  // nur dann von selbst (ein Schreiber, seit 17.10.2026). a = Inhalt von abruf.json oder null, jetzt in ms.
  const abruferHierAus = (a, id, jetzt) => {
    if (!a || a.geraet === id) return true;
    const t = Date.parse(a.zuletzt || "");
    return isNaN(t) || jetzt - t > UEBERNAHME;
  };
  const abruferHier = async () => abruferHierAus(await abrufLesen(), geraetId(), jetztMs());
  const abrufDatei = async (text, bericht) => {
    const f = datei(ABRUF);
    if (f) { if ((await app.vault.read(f)) === text) return; await app.vault.modify(f, text); }
    else { if (!datei("System/Daten")) { try { await app.vault.createFolder("System/Daten"); } catch (e) { /* da */ } } await app.vault.create(ABRUF, text); }
    if (bericht && bericht.geschrieben.indexOf(ABRUF) < 0) bericht.geschrieben.push(ABRUF);
  };
  // „angewendet“ (Grabsteine) neu: in die Datei, die Felder der Sperre bleiben, wie sperre.js sie geschrieben hat. In einem Schritt
  // (process), damit ein gleichzeitiges Feld „lernplan“ (lernplan.js) nicht verloren geht
  const angewendetSchreiben = async (angewendet, bericht) => {
    const f = datei(ABRUF);
    const mit = (text) => {
      let o = {};
      try { o = text ? JSON.parse(text) || {} : {}; } catch (e) { o = {}; }
      o.angewendet = angewendet || {};
      return JSON.stringify(o, null, 1) + "\n";
    };
    if (!f) return abrufDatei(mit(""), bericht);
    let geaendert = false;
    await app.vault.process(f, (text) => { const neu = mit(text); geaendert = neu !== text; return neu; });
    if (geaendert && bericht && bericht.geschrieben.indexOf(ABRUF) < 0) bericht.geschrieben.push(ABRUF);
  };
  // Sperre schreiben: nur ihre Felder in den Stand der Datei von jetzt (process), alle anderen („angewendet“, „lernplan“) bleiben,
  // wie sie gerade sind, nicht wie sperre.js sie kurz vorher gelesen hat
  const SPERRFELDER = ["geraet", "seit", "zuletzt", "mobil", "frei"];
  const sperreSchreiben = async (text, bericht) => {
    const f = datei(ABRUF);
    let neu = null;
    try { neu = JSON.parse(text); } catch (e) { neu = null; }
    if (!f || !neu || typeof neu !== "object") return abrufDatei(text, bericht);
    let geaendert = false;
    await app.vault.process(f, (alt) => {
      let o = null;
      try { o = JSON.parse(alt); } catch (e) { o = null; }
      const rest = o && typeof o === "object" && !Array.isArray(o) ? o : neu, aus = {};
      for (const k of SPERRFELDER) if (k in neu) aus[k] = neu[k];
      for (const k of Object.keys(rest)) if (SPERRFELDER.indexOf(k) < 0) aus[k] = rest[k];
      const t = JSON.stringify(aus, null, 1) + "\n";
      geaendert = t !== alt;
      return t;
    });
    if (geaendert && bericht && bericht.geschrieben.indexOf(ABRUF) < 0) bericht.geschrieben.push(ABRUF);
  };
  // Übernahme über die gemeinsame Abrufer-Sperre (sperre.js, gleiche Werte): schreibt geraet, seit, zuletzt, mobil; „angewendet“
  // bleibt stehen
  const sperre = (bericht) => ctx.user.sperre.erzeugen({
    pfad: ABRUF, geraetId, jetzt: jetztMs, uebernahme: UEBERNAHME, puls: PULS, mobil: !!(ctx.obsidian.Platform && ctx.obsidian.Platform.isMobile),
    io: { lesen: async (p) => { const f = datei(p); return f ? app.vault.read(f) : null; }, schreiben: (p, text) => sperreSchreiben(text, bericht) },
  });

  // ---------- Einstellungen und Filter ----------
  const einstellungen = () => fmVon(datei(EINSTELLUNGEN)) || {};
  const an = (v) => v !== false && String(v).toLowerCase() !== "false";
  const eingeschaltet = () => an(einstellungen().zentrale_daten);
  const veranstaltungenZeigen = () => an(einstellungen().zentrale_veranstaltungen);
  // Termine ohne code oder mit bereich (z. B. Schlüsselqualifikation, freiwillig) → alle; mit code → nur, wenn das Modul in
  // deinem Plan ist (gewählt, selbst geplant, läuft/angemeldet) oder laut Musterplan deiner Variante im aktuellen oder
  // nächsten Fachsemester liegt (ctx.modell). Die Frist der Orientierungsprüfung gilt nur für den Jahrgang, zu dem ihr Datum
  // passt (Ende deines 4. Fachsemesters, ctx.modell.opFrist); sonst wäre sie für alle anderen falsch.
  const filterBauen = () => {
    const D = ctx.modell.daten();
    const zeigen = veranstaltungenZeigen();
    const fs = D.fachsemester || 1;
    const op = ctx.modell.opFrist ? ctx.modell.opFrist() : "";
    const codes = {};
    for (const m of D.module) {
      const st = String(m.fm.status || "").toLowerCase();
      const plan = m.fm.gewaehlt === true || !!String(m.fm.semester_geplant == null ? "" : m.fm.semester_geplant).trim() || st === "läuft" || st === "angemeldet";
      const mp = m.fsEmpfohlen === fs || m.fsEmpfohlen === fs + 1;
      if (plan || mp) codes[m.code] = true;
    }
    const module = {};
    for (const m of D.module) if (!module[m.code]) module[m.code] = m.f;
    return {
      zeigen, codes, module,
      aufnehmen: (e) => (zeigen || VERANSTALTUNG.indexOf(e.kategorie) < 0) && (!e.code || !!e.bereich || !!codes[e.code])
        && !(e.kategorie === "Frist" && /orientierungspr/i.test(String(e.titel || "")) && !!op && e.datum !== op),
      schluessel: JSON.stringify({ z: zeigen, c: Object.keys(codes).sort(), op }),
    };
  };

  // ---------- Notiz-Text ----------
  // „JJJJ-MM-TT Titel“, Titel nach der einen Regel aller Notizen (eba.dateiTitel: ohne Emojis, „: “ → „ – “, WS 2026/27 →
  // WS 2026-27, keine Punkte am Ende). Ohne eba.js (nur in Tests, die es nicht laden) dieselbe Regel ohne die Emojis.
  const dateiTitel = (t) => {
    const E = ctx.user && ctx.user.eba;
    if (E && typeof E.dateiTitel === "function") return E.dateiTitel(t);
    return String(t).replace(/\s*:\s+/g, " – ").replace(/[\\/:*?"<>|#^\[\]]/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  };
  const dateiName = (datum, titel) => `${datum} ${dateiTitel(titel)}`;
  // Neuer Name einer zentralen Notiz oder "" (bleibt): neues Datum → nach Datum und Titel; sonst nur, wenn der Name selbst nicht der
  // Regel folgt (etwa ein Emoji aus einer älteren Fassung), und dann nur gesäubert. Ein bewusst kürzerer Name bleibt.
  const neuerName = (name, datum, titel) => {
    if (name.slice(0, 10) !== datum) return dateiName(datum, titel);
    const rest = name.slice(11), sauber = dateiTitel(rest);
    return sauber !== rest && sauber ? `${datum} ${sauber}` : "";
  };
  const ENTFAELLT = " (entfällt)";
  // Frontmatter in Blöcke zerlegen: [{ key, zeilen }]
  const teilen = (text) => {
    const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
    return m ? { fm: m[1], body: String(text).slice(m[0].length) } : { fm: "", body: String(text) };
  };
  const bloecke = (fm) => {
    const aus = [];
    if (!fm) return aus;
    for (const z of fm.split(/\r?\n/)) {
      const k = z.match(/^([A-Za-z_][\w-]*)\s*:(.*)$/);
      if (k) aus.push({ key: k[1], zeilen: [z] });
      else if (aus.length) aus[aus.length - 1].zeilen.push(z);
      else aus.push({ key: "", zeilen: [z] });
    }
    return aus;
  };
  const listenWerte = (b) => {
    if (!b) return [];
    const kopf = b.zeilen[0].replace(/^[^:]*:\s*/, "").trim();
    const werte = [];
    const ohne = (s) => s.trim().replace(/^["']|["']$/g, "").trim();
    if (/^\[.*\]$/.test(kopf)) kopf.slice(1, -1).split(",").forEach((s) => { if (ohne(s)) werte.push(ohne(s)); });
    else if (kopf) werte.push(ohne(kopf));
    for (const z of b.zeilen.slice(1)) { const m = z.match(/^\s*-\s*(.+)$/); if (m && ohne(m[1])) werte.push(ohne(m[1])); }
    return werte;
  };
  // abgleich_id gehört dazu: Bei der Übergabe (abgleichNotizen) fällt sie weg, sonst hätte die Notiz zwei Schreiber
  const EIGEN = ["typ", "titel", "datum", "bis", "kategorie", "status", "ort", "modul", "code", "bereich", "erledigt", "quelle", "info", "geprueft", "herkunft", "zentral_id", "abgleich_id", "entfaellt", "uebersicht", "cssclasses", "tags"];
  // Kleine Pille im Kopf der Notiz (und in Agenda/Kalender, termine.js/kalender.js): freiwillig, keine Pflicht
  const BEREICH_PILLE = { schluesselqualifikation: '<span class="eba-pill leer">Schlüsselqualifikation · freiwillig</span>' };
  // Inhalt einer zentralen Termin-Notiz. alt = bisheriger Text (oder ""), e = geprüfter Eintrag, o = { modulLink, entfaellt }.
  // Andere Quellen schreiben ihre Termine in derselben Form (ILIAS-Kalender, ilias-kalender.js): o.herkunft und o.idFeld setzen die
  // Besitzmarke (Quellen-Vertrag), o.weg sagt im Kasten „Entfällt“, wo der Termin fehlt. Ohne sie bleibt jede zentrale Notiz Byte
  // für Byte wie bisher.
  // Ort mit Uhrzeit, wie er in der Notiz steht (auch für „Seit deinem letzten Besuch“, seit-besuch.js)
  const ortText = (e) => (e.uhrzeit && e.ort.indexOf(e.uhrzeit) < 0 ? [e.uhrzeit, e.ort].filter(Boolean).join(" · ") : e.ort);
  const notizText = (alt, e, o) => {
    o = o || {};
    const fremd = !!o.herkunft && o.herkunft !== "zentral";
    const eigenFelder = fremd ? EIGEN.concat([o.idFeld]) : EIGEN;
    const { fm, body } = teilen(alt || "");
    const bl = bloecke(fm);
    const holB = (k) => bl.find((b) => b.key === k) || null;
    const titel = e.titel + (o.entfaellt ? ENTFAELLT : "");
    const ort = ortText(e);
    const quelle = e.quelle_url || e.quelle_text || "";
    // Liste (cssclasses, tags): Pflichtwerte vorn ergänzen, eigene Werte behalten; „weg“ = verwaltete Werte, die nicht mehr gelten
    // (fehlender Pflichtwert: hinter den vorigen Pflichtwert, der erste ganz nach vorn; vorhandene bleiben, wo sie sind)
    const liste = (k, pflicht, weg) => {
      const w = listenWerte(holB(k)).filter((x) => (weg || []).indexOf(x) < 0 || pflicht.indexOf(x) >= 0);
      pflicht.forEach((p, i) => { if (w.indexOf(p) < 0) w.splice(i ? w.indexOf(pflicht[i - 1]) + 1 : 0, 0, p); });
      return [k + ":"].concat(w.map((x) => "  - " + x));
    };
    const bereich = bereichOk(e.bereich) ? e.bereich : "";
    const zeilen = [
      "typ: termin", "titel: " + J(titel), "datum: " + e.datum, "bis:" + (e.bis ? " " + e.bis : ""),
      "kategorie: " + e.kategorie, "status: " + e.status, "ort: " + J(ort), "modul:" + (o.modulLink ? " " + J(o.modulLink) : ""),
      "code: " + J(e.code),
    ].concat(bereich ? ["bereich: " + bereich] : []).concat(holB("erledigt") ? holB("erledigt").zeilen : ["erledigt: false"]).concat([
      "quelle: " + J(quelle),
    ]);
    if (e.info) zeilen.push("info: " + J(e.info));
    if (e.geprueft) zeilen.push("geprueft: " + e.geprueft);
    if (fremd) zeilen.push("herkunft: " + o.herkunft, o.idFeld + ": " + J(e.id));
    else zeilen.push("herkunft: zentral", "zentral_id: " + e.id);
    if (o.entfaellt) zeilen.push("entfaellt: true");
    zeilen.push('uebersicht: "[[Prüfungen]]"');
    Array.prototype.push.apply(zeilen, liste("cssclasses", ["eba-s-termin"]));
    Array.prototype.push.apply(zeilen, liste("tags", bereich ? ["termin", BEREICHE[bereich]] : ["termin"], BEREICH_TAGS));
    // eigene Felder der Nutzer (alles, was nicht uns gehört) unverändert dahinter
    for (const b of bl) if (b.key && eigenFelder.indexOf(b.key) < 0) Array.prototype.push.apply(zeilen, b.zeilen);
    // Text: verwalteter Kopf, dann „## Meine Notizen“ und alles darunter unverändert
    const wann = e.bis ? `${dmy(e.datum)} – ${dmy(e.bis)}` : dmy(e.datum);
    // Pille in derselben Zeile wie das Datum (die Agenda überspringt diese Zeile in der Beschreibung)
    const kopf = [`# ${mdText(titel)}`, "", `**${wann}**` + (ort ? " · " + mdText(ort) : "") + (bereich ? " · " + BEREICH_PILLE[bereich] : ""), ""];
    if (e.info) kopf.push(mdText(e.info), "");
    if (o.entfaellt) kopf.push("> [!warning] Entfällt", `> Dieser Termin steht nicht mehr ${fremd && o.weg ? o.weg : "in den zentralen Daten"}. Deine Notizen unten bleiben.`, "");
    else if (e.status === "geschätzt") kopf.push("> [!warning] Geschätzt", "> Dieses Datum ist noch nicht offiziell. Sobald die Uni es veröffentlicht, wird es hier automatisch aktualisiert.", "");
    const geprueft = e.geprueft ? `geprüft am ${dmy(e.geprueft)}` : "";
    let qz = "";
    if (e.quelle_url) { let host = ""; try { host = new URL(e.quelle_url).hostname; } catch (x) { host = "Link"; } qz = `Quelle: [${host}](${e.quelle_url})`; }
    else if (e.quelle_text) qz = "Quelle: " + mdText(e.quelle_text);
    if (qz || geprueft) kopf.push(qz ? qz + (geprueft ? " · " + geprueft : "") : "Geprüft am " + dmy(e.geprueft), "");
    const i = body.search(/^## Meine Notizen[ \t]*$/m);
    const meine = i >= 0 ? body.slice(i) : MEINE + "\n\n";
    return "---\n" + zeilen.join("\n") + "\n---\n\n" + kopf.join("\n") + "\n" + meine;
  };
  // Lebenslauf erzeugter Notizen: die Regeln des Quellen-Vertrags (quellen.js). Unberührt = nicht erledigt, kein eigener Text
  // (leere Aufzählungspunkte zählen nicht); Grabstein = kurzHash des Eintrags (gleiche Rechnung wie bis 0.4.4).
  const Q = () => ctx.user.quellen;
  const unberuehrt = (fm, text) => Q().unberuehrt(fm, text);
  const eintragHash = (e) => Q().kurzHash(e);
  // Doppel einer id (Sync-Verzug, Konfliktkopie, zwei Geräte): zusammenführen wie termine-sync.py des Uni-Abgleichs
  // (Q.dubletten): kürzester Name bleibt, erledigt: true gewinnt, eigene Zeilen der anderen kommen dazu, die anderen in den
  // Papierkorb. Nur der Abrufer, vor dem Übernehmen. lehre = Stundenplan-Notizen, sonst Termine.
  const doppelZusammenfuehren = async (lehre, bericht) => {
    const liste = app.vault.getMarkdownFiles().map((f) => ({ f, pfad: f.path, fm: fmVon(f) }))
      .filter((x) => x.fm && x.fm.herkunft === "zentral" && x.fm.zentral_id && (x.fm.typ === "lehrveranstaltung") === !!lehre);
    for (const g of Q().doppelGruppen(liste, (x) => String(x.fm.zentral_id))) {
      for (const x of g) x.text = await app.vault.read(x.f);
      const d = Q().dubletten(g, MEINE);
      const bleibt = g.find((x) => x.pfad === d.bleibt);
      if (d.text) { await app.vault.modify(bleibt.f, d.text); bericht.geschrieben.push(bleibt.pfad); }
      if (d.erledigt) await app.fileManager.processFrontMatter(bleibt.f, (fm) => { fm.erledigt = true; });
      for (const pfad of d.weg) { await papierkorb(g.find((x) => x.pfad === pfad).f); bericht.papierkorb.push(pfad); }
      bericht.doppel += d.weg.length;
    }
  };

  // ---------- Semester.md schreiben ----------
  const semKanon = (Z) => {
    const st = (o, f) => { const x = {}; for (const k of f) x[k] = String(o[k] == null ? "" : o[k]).trim(); return x; };
    const L2 = (v, f) => (Array.isArray(v) ? v : []).filter((o) => o && typeof o === "object").map((o) => { const x = st(o, f); for (const k of Object.keys(x)) if (/^(beginn|ende|vorlesung_beginn|vorlesung_ende|von|bis|datum)$/.test(k)) x[k] = s10(x[k]); x.status = /gesch/i.test(x.status) ? "geschätzt" : "offiziell"; return x; });
    const q = {};
    for (const k of Object.keys(Z.quellen || {}).sort()) q[k] = String(Z.quellen[k]);
    return JSON.stringify({
      stand: s10(Z.stand), quellen: q,
      semester: L2(Z.semester, ["name", "beginn", "ende", "vorlesung_beginn", "vorlesung_ende", "status", "hinweis"]),
      pausen: L2(Z.pausen, ["name", "von", "bis", "status", "hinweis"]),
      freie_tage: L2(Z.freie_tage, ["name", "datum", "status", "hinweis"]),
      pruefungsphasen: L2(Z.pruefungsphasen, ["art", "semester", "von", "bis", "status", "hinweis"]),
      rueckmeldung: L2(Z.rueckmeldung, ["fuer", "von", "bis", "status", "hinweis"]),
    });
  };
  const flow = (o, f) => "  - {" + f.filter((k) => o[k] != null && o[k] !== "").map((k) => `${k}: ${/^(beginn|ende|vorlesung_beginn|vorlesung_ende|von|bis|datum|status)$/.test(k) ? o[k] : J(o[k])}`).join(", ") + "}";
  const semesterSchreiben = async (S, bericht) => {
    const f = datei(SEMESTER);
    if (!f) return false;
    if (semKanon(fmVon(f) || {}) === semKanon(S)) return false;
    const alt = await app.vault.read(f);
    const { fm, body } = teilen(alt);
    const bl = bloecke(fm);
    const eigen = ["stand", "quellen", "semester", "pausen", "freie_tage", "pruefungsphasen", "rueckmeldung"];
    const neu = [];
    const block = {
      stand: S.stand ? ["stand: " + S.stand] : [],
      quellen: Object.keys(S.quellen).length ? ["quellen:"].concat(Object.keys(S.quellen).map((k) => `  ${k}: ${S.quellen[k]}`)) : [],
      semester: ["semester:"].concat(S.semester.map((o) => flow(o, ["name", "beginn", "ende", "vorlesung_beginn", "vorlesung_ende", "status", "hinweis"]))),
      pausen: ["pausen:"].concat(S.pausen.map((o) => flow(o, ["name", "von", "bis", "status", "hinweis"]))),
      freie_tage: ["freie_tage:"].concat(S.freie_tage.map((o) => flow(o, ["name", "datum", "status", "hinweis"]))),
      pruefungsphasen: ["pruefungsphasen:"].concat(S.pruefungsphasen.map((o) => flow(o, ["art", "semester", "von", "bis", "status", "hinweis"]))),
      rueckmeldung: ["rueckmeldung:"].concat(S.rueckmeldung.map((o) => flow(o, ["fuer", "von", "bis", "status", "hinweis"]))),
    };
    let eingefuegt = false;
    for (const b of bl) {
      if (eigen.indexOf(b.key) >= 0) { if (!eingefuegt) { for (const k of eigen) Array.prototype.push.apply(neu, block[k]); eingefuegt = true; } continue; }
      Array.prototype.push.apply(neu, b.zeilen);
    }
    if (!eingefuegt) for (const k of eigen) Array.prototype.push.apply(neu, block[k]);
    await app.vault.modify(f, "---\n" + neu.join("\n") + "\n---\n" + (body.charAt(0) === "\n" ? "" : "\n") + body);
    bericht.geschrieben.push(SEMESTER);
    return true;
  };

  // ---------- Übernehmen: Termine ----------
  // Zentrale Notizen im Vault: zentral_id → Datei (bei Doppelten die erste nach Pfad; die anderen bleiben unangetastet).
  // lehre = true: nur Stundenplan-Notizen (typ lehrveranstaltung), sonst nur Termine; so hält kein Teil die Notizen des
  // anderen für weggefallen.
  const zentraleNotizen = (lehre) => {
    const map = {};
    const dateien = app.vault.getMarkdownFiles().filter((f) => {
      const fm = fmVon(f);
      return fm && fm.herkunft === "zentral" && fm.zentral_id && (fm.typ === "lehrveranstaltung") === !!lehre;
    }).sort((a, b) => a.path.localeCompare(b.path));
    for (const f of dateien) { const id = String(fmVon(f).zentral_id); if (!map[id]) map[id] = f; }
    return map;
  };
  // Termin-Notizen eines eigenen Uni-Abgleichs (abgleich_id, ohne herkunft): abgleich_id → Datei. Erscheint dieselbe id in den
  // zentralen Daten, übernimmt das Plugin genau diese Notiz (Übergabe nach id, docs/daten-v1.md), statt eine zweite anzulegen
  // oder die id als „von dir gelöscht“ zu werten. Ohne eigenen Abgleich gibt es solche Notizen nicht.
  const abgleichNotizen = () => {
    const map = {};
    const dateien = app.vault.getMarkdownFiles().filter((f) => {
      const fm = fmVon(f);
      return fm && fm.abgleich_id && !fm.herkunft && fm.typ !== "lehrveranstaltung";
    }).sort((a, b) => a.path.localeCompare(b.path));
    for (const f of dateien) { const id = String(fmVon(f).abgleich_id); if (!map[id]) map[id] = f; }
    return map;
  };
  const freierPfad = (basisName, eigene, ordner) => {
    const o = ordner || ORDNER;
    let name = basisName, i = 2;
    while (datei(`${o}/${name}.md`) && datei(`${o}/${name}.md`) !== eigene) name = `${basisName} ${i++}`;
    return `${o}/${name}.md`;
  };
  // Ein Papierkorb für alles (quellen.js): nie endgültig löschen, auch wenn „Gelöschte Dateien: endgültig“ eingestellt ist.
  // Ohne quellen.js mit papierkorb (ältere Fassung, solange der Sync nach einem Update noch läuft): Obsidians Papierkorb im Tresor.
  const papierkorb = async (f) => (Q() && Q().papierkorb ? Q().papierkorb(app, f, { lokal: !!plugin().testPapierkorbLokal }) : app.vault.trash(f, false));
  const modulLink = (F, code) => { const f = code && F.module[code]; return f ? `[[${f.basename}]]` : ""; };
  // Fachliche Werte für „Seit deinem letzten Besuch“ (seit-besuch.js): alt aus dem Frontmatter vor dem Schreiben, neu aus dem Eintrag
  const sbAlt = (fm) => ({ titel: String(fm.titel || ""), datum: s10(fm.datum), bis: s10(fm.bis), ort: String(fm.ort || ""), status: String(fm.status || ""),
    entfaellt: fm.entfaellt === true, code: String(fm.code || "") });
  const sbNeu = (e) => ({ titel: e.titel, datum: e.datum, bis: e.bis || "", ort: ortText(e), status: e.status, code: e.code || "" });

  const termineAnwenden = async (T, ids, abruf, bericht) => {
    const F = filterBauen();
    const heute = heuteIso();
    await doppelZusammenfuehren(false, bericht);
    const vorhanden = zentraleNotizen();
    const abgleich = abgleichNotizen();
    const angewendet = Object.assign({}, abruf.angewendet || {});
    const imDatensatz = new Set(T.map((e) => e.id));
    // Schutz gegen kaputte Exporte: würde mehr als die Hälfte (und mehr als 10) wegfallen, nichts als entfallen behandeln
    const fehlend = Object.keys(vorhanden).filter((id) => !imDatensatz.has(id) && !ids.has(id));
    const wegfallSperre = fehlend.length > 10 && fehlend.length > Object.keys(vorhanden).length / 2;
    if (wegfallSperre) warnen(bericht, `${fehlend.length} Termine fehlen in den Daten – nicht als entfallen behandelt.`);
    if (!datei(ORDNER)) { try { await app.vault.createFolder(ORDNER); } catch (e) { /* da */ } }
    for (const e of T) {
      let f = vorhanden[e.id] || null;
      const h = eintragHash(e);
      if (!F.aufnehmen(e)) {
        // nicht (mehr) passend: unberührt → Papierkorb. Erledigt oder mit eigenem Text bleibt sie und wird weiter aktualisiert,
        // sonst stünde sie mit altem Datum oder Ort in Agenda und Kalender.
        const text = f ? await app.vault.read(f) : "";
        if (!f || unberuehrt(fmVon(f), text)) {
          if (f) { await papierkorb(f); bericht.papierkorb.push(f.path); }
          delete angewendet[e.id];
          continue;
        }
      }
      const soll = { modulLink: modulLink(F, e.code) };
      // Übergabe: Notiz des eigenen Uni-Abgleichs mit dieser id → übernehmen (erledigt, „Meine Notizen“, eigene Felder bleiben)
      const uebergabe = !f && !!abgleich[e.id];
      if (uebergabe) { f = abgleich[e.id]; bericht.uebernommen.push(f.path); }
      if (!f) {
        if (angewendet[e.id] === h) { bericht.ausgeblendet.push(e.id); continue; } // von dir gelöscht, Daten unverändert
        const pfad = freierPfad(dateiName(e.datum, e.titel), null);
        await app.vault.create(pfad, notizText("", e, soll));
        bericht.angelegt.push(pfad); bericht.geschrieben.push(pfad);
        bericht.seitBesuch.push({ art: "neu", id: e.id, neu: sbNeu(e) });
        angewendet[e.id] = h;
        continue;
      }
      const alt = await app.vault.read(f);
      const vorher = sbAlt(fmVon(f) || {}); // alte Werte für „Seit deinem letzten Besuch“, vor dem Schreiben
      const neu = notizText(alt, e, soll);
      if (neu !== alt) {
        await app.vault.modify(f, neu); bericht.aktualisiert.push(f.path); bericht.geschrieben.push(f.path);
        if (!uebergabe) bericht.seitBesuch.push({ art: "geaendert", id: e.id, alt: vorher, neu: sbNeu(e) });
      }
      // Datum geändert oder Name nicht nach der Regel → umbenennen (Nutzerteile bleiben, Links zieht Obsidian nach)
      const sollName = neuerName(f.basename, e.datum, e.titel);
      if (sollName) {
        const ziel = freierPfad(sollName, f);
        if (ziel !== f.path) { const von = f.path; await app.fileManager.renameFile(f, ziel); bericht.umbenannt.push(von + " → " + ziel); bericht.geschrieben.push(ziel); }
      }
      angewendet[e.id] = h;
    }
    // Weggefallene Termine: unberührt → Papierkorb; sonst „(entfällt)“. Ungültige Einträge (id noch da) und lange Vergangenes
    // (Ende vor mehr als 30 Tagen) bleiben unverändert.
    if (!wegfallSperre) for (const id of fehlend) {
      const f = vorhanden[id], fm = fmVon(f) || {};
      const ende = s10(fm.bis) || s10(fm.datum);
      if (ende && tageZwischen(ende, heute) > 30) continue;
      const text = await app.vault.read(f);
      if (fm.entfaellt !== true) bericht.seitBesuch.push({ art: "abgesagt", id, alt: sbAlt(fm) });
      if (unberuehrt(fm, text)) { await papierkorb(f); bericht.papierkorb.push(f.path); delete angewendet[id]; continue; }
      if (fm.entfaellt === true) continue;
      // letzter bekannter Stand aus der Notiz selbst
      const e = {
        id, titel: String(fm.titel || f.basename).replace(/ \(entfällt\)$/, ""), datum: s10(fm.datum), bis: s10(fm.bis), uhrzeit: "", ort: String(fm.ort || ""),
        kategorie: String(fm.kategorie || "Veranstaltung"), status: STATUS.indexOf(fm.status) >= 0 ? fm.status : "offiziell", code: String(fm.code || ""),
        quelle_url: /^https:\/\//.test(String(fm.quelle || "")) ? String(fm.quelle) : "", quelle_text: /^https:\/\//.test(String(fm.quelle || "")) ? "" : String(fm.quelle || ""),
        info: String(fm.info || ""), geprueft: s10(fm.geprueft),
      };
      if (bereichOk(fm.bereich)) e.bereich = fm.bereich;
      const neu = notizText(text, e, { modulLink: fm.modul ? String(fm.modul) : "", entfaellt: true });
      if (neu !== text) { await app.vault.modify(f, neu); bericht.entfaellt.push(f.path); bericht.geschrieben.push(f.path); }
      delete angewendet[id];
    }
    return { angewendet, filter: F.schluessel, geschuetzt: wegfallSperre };
  };

  // ---------- Zentraler Stundenplan: Auswahl (rein, testbar) ----------
  // Pflichtmodule eines Fachsemesters laut Musterplan (mp = Frontmatter von Musterplan.md): Plan der Variante; Variante „offen“
  // (oder unbekannt): nur Codes, die ALLE Pläne in diesem Fachsemester haben. → { Code: true }
  const pflichtCodes = (mp, variante, fs) => {
    const plaene = (Array.isArray(mp && mp.plaene) ? mp.plaene : []).filter((p) => p && p.id);
    const eintraege = Array.isArray(mp && mp.eintraege) ? mp.eintraege : [];
    const je = (id) => {
      const s = {};
      for (const e of eintraege) if (e && e.plan === id && e.code && Number(e.fs) === fs) s[String(e.code).trim()] = true;
      return s;
    };
    const plan = plaene.find((p) => String(p.name || "").trim() === variante);
    if (plan) return je(plan.id);
    if (!plaene.length) return {};
    const alle = plaene.map((p) => je(p.id)), aus = {};
    for (const c of Object.keys(alle[0])) if (alle.every((s) => s[c])) aus[c] = true;
    return aus;
  };
  // Welche Module kommen in den Stundenplan? D = ctx.modell.daten() (module, variante, fachsemester, aktuell,
  // studienbeginnStandard). Nur das aktuelle Semester. Bestanden/anerkannt nie. Läuft/angemeldet immer. Mit semester_geplant
  // nur, wenn es das aktuelle Semester ist (auch Wiederholer). Gewählt (ohne eigenes Semester), wenn sein Musterplan-Semester
  // das aktuelle ist oder es keins hat (Schwerpunkt). Sonst Pflichtmodule des aktuellen Fachsemesters laut Musterplan – aber
  // nur mit eingetragenem Studienbeginn (ohne ihn ist das Fachsemester geraten). → { semester, codes: { Code: Grund }, ohneBeginn }
  const stundenplanFilter = (D, mp) => {
    const semester = D.aktuell ? D.aktuell.name : "";
    const ohneBeginn = !!D.studienbeginnStandard;
    const pflicht = ohneBeginn ? {} : pflichtCodes(mp, D.variante, D.fachsemester || 1);
    const codes = {};
    for (const m of D.module) {
      const st = String(m.status || "").toLowerCase().trim();
      if (st === "bestanden" || st === "anerkannt") continue;
      const geplant = String(m.fm.semester_geplant == null ? "" : m.fm.semester_geplant).trim();
      if (st === "läuft" || st === "angemeldet") codes[m.code] = st;
      else if (geplant) { if (geplant === semester) codes[m.code] = "geplant"; }
      else if (m.fm.gewaehlt === true && (!m.semester || m.semester === semester)) codes[m.code] = "gewählt";
      else if (pflicht[m.code]) codes[m.code] = "musterplan";
    }
    return { semester, codes, ohneBeginn };
  };
  // Welche Einträge werden Notizen? Semester und Modul passen, nicht ausgeblendet (aus = Set der ids). Hat ein Modul für eine
  // Art mehrere Gruppennummern (Übungs- und Tutoriengruppen), ist das eine persönliche Wahl: keine dieser Gruppen wird eine
  // Notiz (deine Gruppe kommt aus Alma oder von Hand). → { notizen, gruppen (Anzahl), ausgeblendet (Anzahl) }
  const stundenplanAuswahl = (liste, F, aus) => {
    const nummern = {};
    for (const e of liste) if (e.semester === F.semester && e.gruppe) { const k = e.code + "|" + e.art; (nummern[k] = nummern[k] || {})[e.gruppe] = true; }
    const r = { notizen: [], gruppen: 0, ausgeblendet: 0 };
    for (const e of liste) {
      if (e.semester !== F.semester || !F.codes[e.code]) continue;
      if (Object.keys(nummern[e.code + "|" + e.art] || {}).length > 1) { r.gruppen++; continue; }
      if (aus && aus.has(e.id)) { r.ausgeblendet++; continue; }
      r.notizen.push(e);
    }
    return r;
  };
  // Zeiten: Daten nennen die Alma-Zeiten (z. B. 10:00–12:00) und ct; die Notiz zeigt die echte Zeit (c.t.: 10:15–11:45)
  const minutenVon = (hm) => { const m = String(hm == null ? "" : hm).match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const uhrText = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
  const ctVerschieben = (hm, ct, n) => (ct ? uhrText(minutenVon(hm) + n) : hm);
  const lehreZeit = (e) => ({ beginn: ctVerschieben(e.von, e.ct, 15), ende: ctVerschieben(e.bis, e.ct, -15) });
  // Abstand einer Notiz-Zeit zur Alma-Zeit (c.t.: auch zur verschobenen Zeit); null = keine Zeit
  const abstandZu = (hm, alma, ct, n) => {
    const a = minutenVon(hm), b = minutenVon(alma);
    if (a == null || b == null) return null;
    return Math.min(Math.abs(a - b), ct ? Math.abs(a - b - n) : Infinity);
  };
  // Art-Klassen: eine Vorlesung wird nie mit einer Übung gleichgesetzt, auch nicht direkt hintereinander im selben Modul.
  // „Übungsteil“ (Titel in Alma, die Daten führen diese Termine als Vorlesung) hat keine Klasse: Er passt wie eine unbestimmte
  // Art zu Vorlesung und Übung, aber nur bei genau passender Zeit.
  const ART_KLASSE = { "Vorlesung": "v", "Übung": "u", "Tutorium": "u", "Seminar": "s", "Kolloquium": "s", "Praktikum": "p", "Lab": "p", "Kurs": "k" };
  const artKlasse = (a) => ART_KLASSE[String(a == null ? "" : a)] || "";
  // „Alma gewinnt“: eigene Notizen (Alma oder von Hand; eigene = [{ f, fm }]) ersetzen zentrale Einträge desselben Termins.
  // Gleich heißt: Code, Semester, Wochentag; Beginn und Ende höchstens 15 Min. daneben (c.t. wie in alma.js: gemessen an der
  // Alma-Zeit und an der um 15 Min. verschobenen); Art-Klasse gleich. Kennt eine Seite die Art nicht („Veranstaltung“,
  // „Übungsteil“), nur bei genau passender Zeit. Zeitraum muss sich überschneiden; Einzeltermine: das Datum liegt im Zeitraum der
  // Notiz und nicht in ihren Ausfällen. Reihenfolge: genaue Zeit vor Toleranz, bekannte Art vor unbekannter, gleicher Raum vor
  // anderem. Jede eigene Notiz ersetzt höchstens eine zentrale Serie (wie paaren in alma.js); Einzeltermine dürfen dieselbe Notiz
  // teilen (Alma fasst gleiche Termine verschiedener Wochen zu einer Serie zusammen). → Map id → eigene Notiz
  const eigenePaare = (eintraege, eigene) => {
    const paare = [], treffer = new Map();
    for (const e of eintraege) {
      const einzeln = e.rhythmus === "Einzeltermin", wt = WOCHE.indexOf(e.tag) + 1;
      for (const x of eigene) {
        const fm = x.fm || {};
        if (!fm.code || String(fm.code) !== e.code || String(fm.semester || "") !== e.semester || Number(fm.wochentag) !== wt) continue;
        const nv = s10(fm.von), nb = s10(fm.bis);
        if (einzeln) {
          const tag = e.zeitraum.von;
          if ((nv && nv > tag) || (nb && nb < tag)) continue;
          if (fm.einzeltermin === true && nv && nv !== tag) continue;
          if (Array.isArray(fm.ausfall) && fm.ausfall.map(s10).indexOf(tag) >= 0) continue;
        } else {
          if (fm.einzeltermin === true) continue;
          if ((nv && nv > e.zeitraum.bis) || (nb && nb < e.zeitraum.von)) continue;
        }
        const ka = artKlasse(e.art), kb = artKlasse(fm.art), unbestimmt = !ka || !kb;
        if (!unbestimmt && ka !== kb) continue;
        const db = abstandZu(fm.beginn, e.von, e.ct, 15), de = abstandZu(fm.ende, e.bis, e.ct, -15);
        if (db == null || db > 15 || (de != null && de > 15)) continue;
        const d = db + (de || 0);
        if (unbestimmt && d) continue;
        const raum = String(fm.alma_raum || fm.raum || "").trim();
        const r = [d ? 1 : 0, unbestimmt ? 1 : 0, raum && e.raum && raum === e.raum ? 0 : 1, d];
        if (einzeln) { const alt = treffer.get(e.id); if (!alt || vergleichen(r, alt.r) < 0) treffer.set(e.id, { x, r }); } else paare.push({ e, x, r });
      }
    }
    // Serien eindeutig vergeben; bei Gleichstand zuerst die mit weniger Alternativen (wie paaren in alma.js)
    const anzahl = {};
    for (const p of paare) for (const k of [p.x.f.path, "|" + p.e.id]) anzahl[k] = (anzahl[k] || 0) + 1;
    paare.sort((a, b) => vergleichen(a.r.concat([anzahl[a.x.f.path], anzahl["|" + a.e.id]]), b.r.concat([anzahl[b.x.f.path], anzahl["|" + b.e.id]])));
    const aus = new Map(), benutzt = new Set();
    for (const p of paare) if (!aus.has(p.e.id) && !benutzt.has(p.x.f.path)) { benutzt.add(p.x.f.path); aus.set(p.e.id, p.x); }
    treffer.forEach((t, id) => aus.set(id, t.x));
    return aus;
  };
  const vergleichen = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

  // ---------- Zentraler Stundenplan: Notiz ----------
  const LEHRE_EIGEN = ["typ", "titel", "code", "modul", "art", "wochentag", "tag", "beginn", "ende", "raum", "raum_seit", "raum_vorher", "semester", "von",
    "bis", "rhythmus", "ausfall", "aenderungen", "einzeltermin", "quelle", "herkunft", "zentral_id", "entfaellt", "uebersicht", "cssclasses", "tags"];
  // Fassung der Notiz im Filter-Schlüssel (lehreSchluessel): Kommt ein Feld dazu, schreibt der Abrufer nach dem Update alle
  // zentralen Notizen einmal neu, auch wenn veranstaltungen.json gleich bleibt. 2 = rhythmus (seit 20.10.2026; vorher stand eine
  // 14-tägliche Veranstaltung jede Woche im Raster). 3 = raum_seit/raum_vorher (seit 20.10.2026, dauerhafte Verlegung).
  // 4 = bezeichnung (seit 24.10.2026, offizieller Name statt der Art; die Notiz wird dabei umbenannt, siehe lehreAbrufen).
  const LEHRE_FASSUNG = 4;
  const TAGE_LANG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  const dm = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}.`;
  // Kurztitel wie in alma.js (an einer Wortgrenze gekürzt)
  const kuerzen = (s, n) => {
    s = String(s).trim();
    if (s.length <= n) return s;
    const k = s.slice(0, n + 1);
    return (k.slice(0, k.lastIndexOf(" ")) || s.slice(0, n)).replace(/[\s,;:–-]+(für|und|in|der|die|das|zu|zur|zum|von|mit)?$/i, "");
  };
  // Änderungen fürs Wochenraster: „Datum|Beginn|Ende|Raum“, immer vollständig (fehlende Teile aus der Serie). Zusatztermine
  // nicht: Sie liegen außerhalb des Rhythmus und stehen nur in der Notiz.
  const aenderungenFelder = (e) => {
    const z = lehreZeit(e);
    return e.aenderungen.filter((a) => !a.zusatz).map((a) => [a.datum, a.von ? ctVerschieben(a.von, e.ct, 15) : z.beginn, a.bis ? ctVerschieben(a.bis, e.ct, -15) : z.ende, a.raum || e.raum].join("|"));
  };
  // Was in der Notiz als Art steht: der offizielle Name (bezeichnung), sonst die Art
  const lehreArt = (e) => e.bezeichnung || e.art;
  const lehreNameAus = (teil, code, art) => `${teil} ${code} ${art}`.replace(/[\\/:*?"<>|#^\[\]]/g, "-");
  const lehreDateiName = (e) => {
    const z = lehreZeit(e);
    return lehreNameAus(e.rhythmus === "Einzeltermin" ? e.zeitraum.von : `${e.tag} ${z.beginn.replace(":", ".")}`, e.code, lehreArt(e));
  };
  // Name nach der Regel, den die Notiz nach ihren Eigenschaften hat (vor dem Schreiben gelesen)
  const lehreNameVorher = (fm) => lehreNameAus(fm.einzeltermin === true ? s10(fm.von) : `${fm.tag || ""} ${String(fm.beginn || "").replace(":", ".")}`,
    String(fm.code || ""), String(fm.art || ""));
  // Inhalt einer zentralen Stundenplan-Notiz. alt = bisheriger Text (oder ""), e = geprüfter Eintrag, o = { modulLink, kurz }
  const lehreNotizText = (alt, e, o) => {
    o = o || {};
    const { fm, body } = teilen(alt || "");
    const bl = bloecke(fm);
    const z = lehreZeit(e), einzeln = e.rhythmus === "Einzeltermin";
    const kurz = kuerzen(o.kurz || e.titel, 48); // etwas länger als in alma.js: „Einführung in die Betriebswirtschaftslehre“ bleibt ganz
    const liste = (k, werte) => (werte.length ? [k + ":"].concat(werte.map((w) => "  - " + w)) : [k + ": []"]);
    const vereinigt = (k, pflicht) => { const w = listenWerte(bl.find((b) => b.key === k) || null); pflicht.slice().reverse().forEach((p) => { if (w.indexOf(p) < 0) w.unshift(p); }); return w; };
    const zeilen = [
      "typ: lehrveranstaltung", "titel: " + J(kurz + " · " + lehreArt(e)), "code: " + J(e.code), "modul:" + (o.modulLink ? " " + J(o.modulLink) : ""),
      "art: " + J(lehreArt(e)), "wochentag: " + (WOCHE.indexOf(e.tag) + 1), "tag: " + e.tag, "beginn: " + J(z.beginn), "ende: " + J(z.ende),
      "raum: " + J(e.raum),
    ].concat(e.raum_seit ? ["raum_seit: " + e.raum_seit, "raum_vorher: " + J(e.raum_vorher)] : [], [
      "semester: " + J(e.semester), "von: " + e.zeitraum.von, "bis: " + e.zeitraum.bis,
    ], e.rhythmus === "14-täglich" ? ["rhythmus: " + J(e.rhythmus)] : [], liste("ausfall", e.ausfall), liste("aenderungen", aenderungenFelder(e).map(J)), [
      "einzeltermin: " + einzeln, "quelle: " + J(e.quelle_url), "herkunft: zentral", "zentral_id: " + e.id, 'uebersicht: "[[Stundenplan]]"',
    ], liste("tags", vereinigt("tags", ["stundenplan"])), liste("cssclasses", vereinigt("cssclasses", ["eba-s-notizen"])));
    for (const b of bl) if (b.key && LEHRE_EIGEN.indexOf(b.key) < 0) Array.prototype.push.apply(zeilen, b.zeilen);
    const wann = einzeln ? `${TAGE_LANG[WOCHE.indexOf(e.tag)]}, ${dmy(e.zeitraum.von)}` : `${TAGE_LANG[WOCHE.indexOf(e.tag)]}s` + (e.rhythmus === "14-täglich" ? ", alle zwei Wochen" : "");
    const kopf = [`# ${mdText(e.code)} · ${mdText(lehreArt(e))}`, "", `${wann}, ${z.beginn}–${z.ende}` + (e.raum ? " · " + mdText(e.raum) : ""), ""];
    if (!einzeln) kopf.push(`${dmy(e.zeitraum.von)} – ${dmy(e.zeitraum.bis)}`, "");
    if (e.raum_seit) kopf.push(`Neuer Raum ab ${dm(e.raum_seit)}, vorher ${mdText(e.raum_vorher)}`, "");
    if (e.ausfall.length) kopf.push("Fällt aus: " + e.ausfall.map(dm).join(", "), "");
    const anders = e.aenderungen.filter((a) => !a.zusatz).map((a) => dm(a.datum) + (a.von ? ` ${ctVerschieben(a.von, e.ct, 15)}–${ctVerschieben(a.bis, e.ct, -15)}` : "") + (a.raum ? " in " + mdText(a.raum) : ""));
    if (anders.length) kopf.push("Anders: " + anders.join(" · "), "");
    const zusatz = e.aenderungen.filter((a) => a.zusatz).map((a) => `${wochentagVon(a.datum)} ${dm(a.datum)}` + (a.von ? ` ${ctVerschieben(a.von, e.ct, 15)}–${ctVerschieben(a.bis, e.ct, -15)}` : "") + (a.raum ? " in " + mdText(a.raum) : ""));
    if (zusatz.length) kopf.push("Zusätzlich: " + zusatz.join(" · "), "");
    let host = "Alma";
    try { host = new URL(e.quelle_url).hostname; } catch (x) { host = "Alma"; }
    kopf.push(`Quelle: [${host}](${e.quelle_url})`, ""); // „Besuche ich nicht“ steht im Kopf der Notiz (kopf.js)
    kopf.push("> [!info] Aus dem Vorlesungsverzeichnis, bleibt von selbst aktuell, auch bei Ausfällen und Raumänderungen.", "");
    // dein Text: neue Notizen „## Meine Notizen“, ältere behalten „## Notizen“
    const i = body.search(/^## (?:Meine Notizen|Notizen)[ \t]*$/m);
    const meine = i >= 0 ? body.slice(i) : MEINE + "\n- \n";
    return "---\n" + zeilen.join("\n") + "\n---\n\n" + kopf.join("\n") + "\n" + meine;
  };
  // Eigener Text unter „## Meine Notizen“ (quellen.js meineNotizen: leere Aufzählungspunkte zählen nicht)
  const lehreMeine = (text) => Q().meineNotizen(text);

  // ---------- Zentraler Stundenplan: Übernehmen (nur der Abrufer) ----------
  const ausgeblendet = () => { const v = einstellungen()[AUSGEBLENDET]; return new Set((Array.isArray(v) ? v : v ? [v] : []).map(String)); };
  // Stundenplan von außen (eba.quelleExtern „stundenplan“, ohne Liste in den Einstellungen beim eigenen Uni-Abgleich): Der
  // zentrale wird dann weder geholt noch angewendet, zentrale Notizen von früher bleiben unberührt, und die Texte versprechen
  // keine Vorlesungen.
  // (quellen.js extern: dieselbe Regel auch mit eba.js einer älteren Fassung auf diesem Gerät)
  const stundenplanExtern = () => {
    const eba = ctx.user && ctx.user.eba, existiert = (p) => !!datei(p);
    if (Q() && Q().extern) return Q().extern(eba, "stundenplan", existiert, einstellungen());
    return !!(eba && eba.quelleExtern && eba.quelleExtern("stundenplan", existiert, einstellungen()));
  };
  // Eigene Notizen (Alma oder von Hand). Notizen zu deiner Gruppe (herkunft ilias-gruppe, gruppe-gewaehlt; meine-gruppe.js)
  // zählen nicht: Sie weichen selbst, wenn eine zentrale Notiz dieselbe Gruppe zeigt, und dieses Skript schreibt nie hinein.
  const eigeneLehre = () => app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(LEHRE_ORDNER + "/"))
    .map((f) => ({ f, fm: fmVon(f) || {} })).filter((x) => x.fm.typ === "lehrveranstaltung" && ["zentral", "ilias-gruppe", "gruppe-gewaehlt"].indexOf(String(x.fm.herkunft || "")) < 0);
  const lehreFilter = () => stundenplanFilter(ctx.modell.daten(), fmVon(datei(MUSTERPLAN)) || {});
  // Filter-Schlüssel des Stundenplans: Ändert er sich (Plan, Variante, „Besuche ich nicht“, eigene Notizen per Alma oder Sync),
  // wendet der Abrufer den letzten Stand ohne Netz neu an. Zentrale Notizen selbst gehören nicht dazu (sonst Schleife).
  const lehreSchluessel = () => {
    try {
      const F = lehreFilter();
      const eigen = eigeneLehre().map((x) => [x.fm.code, x.fm.semester, x.fm.wochentag, x.fm.beginn, x.fm.ende, x.fm.art, x.fm.einzeltermin === true ? s10(x.fm.von) : ""].join(",")).sort();
      const zentral = Object.keys(zentraleNotizen(true)).sort();
      return JSON.stringify({ s: F.semester, c: Object.keys(F.codes).sort(), a: Array.from(ausgeblendet()).sort(), e: eigen, z: zentral, x: stundenplanExtern(), f: LEHRE_FASSUNG });
    } catch (e) { return ""; }
  };
  const filterSchluessel = () => filterBauen().schluessel + "|" + lehreSchluessel();
  // „Besuche ich nicht“ setzen oder zurücknehmen (System/Einstellungen.md, für alle Geräte). Alte Semester fallen dabei weg;
  // Schlüssel anderer Quellen („alma:…“, kopf.js und ctx.modell.besuchtNicht) bleiben.
  const ausblendenSetzen = async (ids, an) => {
    const f = datei(EINSTELLUNGEN);
    if (!f) return false;
    let jetzt = [];
    try { const a = ctx.modell.daten().aktuell; if (a) jetzt = [a.name, ctx.modell.naechster(a.name)].filter(Boolean).map((n) => n.toLowerCase().replace(/[ /]/g, "-")); } catch (e) { jetzt = []; }
    await app.fileManager.processFrontMatter(f, (x) => {
      const alt = (Array.isArray(x[AUSGEBLENDET]) ? x[AUSGEBLENDET] : x[AUSGEBLENDET] ? [x[AUSGEBLENDET]] : []).map(String);
      let neu = alt.filter((id) => !ID.test(id) || !jetzt.length || jetzt.some((p) => id.indexOf(p + "-") === 0));
      for (const id of ids) { if (an && neu.indexOf(id) < 0) neu.push(id); if (!an) neu = neu.filter((x2) => x2 !== id); }
      x[AUSGEBLENDET] = neu;
    });
    return true;
  };
  // Eigene Notiz gewinnt: zentrale Notiz unberührt → Papierkorb; mit eigenem Text → der Text wandert ans Ende der
  // eigenen Notiz (mit Hinweis), dann Papierkorb. So gibt es nie zwei Notizen und nie zwei Schreiber.
  const durchEigeneErsetzen = async (f, eigen, b) => {
    const meine = lehreMeine(await app.vault.read(f));
    if (meine) {
      const ziel = await app.vault.read(eigen.f);
      await app.vault.modify(eigen.f, ziel.replace(/\s*$/, "") + `\n\nAus der zentralen Notiz übernommen (${dmy(heuteIso())}):\n\n${meine}\n`);
      b.geschrieben.push(eigen.f.path);
    }
    await papierkorb(f);
    b.papierkorb.push(f.path);
  };
  // ohneAbruf: abruf.json fehlte oder war unlesbar (Tresor neu aufgebaut, Sicherung ohne System/Daten) – fehlende Notizen sind
  // dann nie von dir gelöscht
  const lehreAnwenden = async (L, ids, abruf, b, ohneAbruf) => {
    const F = lehreFilter();
    const heute = heuteIso();
    await doppelZusammenfuehren(true, b);
    const sel = stundenplanAuswahl(L, F, ausgeblendet());
    const vorhanden = zentraleNotizen(true);
    const paare = eigenePaare(sel.notizen, eigeneLehre());
    const angewendet = Object.assign({}, abruf.angewendet || {});
    const Fm = filterBauen();
    const imDatensatz = new Set(L.map((e) => e.id));
    const erledigt = new Set(), geloescht = [];
    // Liest Obsidian eine Datei in Stundenplan/ noch ein (gerade angelegt oder per Sync), fehlt sie evtl. in „vorhanden“: dann in
    // diesem Lauf nichts neu anlegen und nichts als gelöscht werten (sonst Doppel oder falsches „Besuche ich nicht“)
    const unfertig = app.vault.getMarkdownFiles().some((f) => f.path.startsWith(LEHRE_ORDNER + "/") && !app.metadataCache.getFileCache(f));
    // Gerade erst Abrufer geworden (seit unter UEBERNAHME): Der Sync dieses Geräts hat vielleicht noch nicht alle Notizen gebracht.
    // Eine fehlende, schon angelegte Notiz gilt dann nur als von dir gelöscht, wenn dieses Gerät sie beim letzten Lauf hatte
    // (lehreDa, gerätelokal); sonst „Besuche ich nicht“ auf allen Geräten, und die Notiz käme beim Eintreffen in den Papierkorb.
    const frisch = alterMs(abruf.seit) < UEBERNAHME;
    const da = new Set(ohneAbruf ? [] : stand().lehreDa || []);
    if (!datei(LEHRE_ORDNER)) { try { await app.vault.createFolder(LEHRE_ORDNER); } catch (e) { /* da */ } }
    for (const e of sel.notizen) {
      const f = vorhanden[e.id] || null;
      erledigt.add(e.id);
      const eigen = paare.get(e.id);
      if (eigen) { // Alma (oder deine eigene Notiz) gewinnt
        if (f) await durchEigeneErsetzen(f, eigen, b);
        delete angewendet[e.id];
        b.ersetzt.push(e.id);
        continue;
      }
      const m = Fm.module[e.code];
      const mfm = m ? fmVon(m) || {} : {};
      const soll = { modulLink: modulLink(Fm, e.code), kurz: mfm.titel || e.titel };
      if (!f) {
        if (unfertig) continue;
        // Schon einmal angelegt und jetzt weg: von dir gelöscht → wie „Besuche ich nicht“ (zurücknehmen im Fenster „Zentrale Daten“)
        if (angewendet[e.id]) { if (!ohneAbruf && (!frisch || da.has(e.id))) geloescht.push(e.id); continue; }
        const pfad = freierPfad(lehreDateiName(e), null, LEHRE_ORDNER);
        await app.vault.create(pfad, lehreNotizText("", e, soll));
        b.angelegt.push(pfad); b.geschrieben.push(pfad);
        angewendet[e.id] = eintragHash(e);
        da.add(e.id);
        continue;
      }
      const alt = await app.vault.read(f);
      // Name nach der Regel geändert (offizieller Name neu, „Fr 14.15 S110 Praktikum“ → „… Data Science Lab“, oder neue Zeit):
      // umbenennen, solange die Notiz noch ihren bisherigen Namen nach der Regel trägt (auch mit Zähler „… 2“), im selben Ordner.
      // Einen eigenen Namen lässt der Abrufer stehen. Links zieht Obsidian nach. Erst umbenennen, dann schreiben: Scheitert das
      // Umbenennen, steht noch die alte Regel in der Notiz und der nächste Lauf versucht es wieder.
      const nameVorher = lehreNameVorher(fmVon(f) || {});
      const sollName = lehreDateiName(e);
      const zaehler = f.basename.slice(nameVorher.length + 1);
      const regelName = f.basename === nameVorher || (f.basename.indexOf(nameVorher + " ") === 0 && /^\d{1,2}$/.test(zaehler));
      if (regelName && nameVorher !== sollName) {
        const ziel = freierPfad(sollName, f, f.path.slice(0, f.path.lastIndexOf("/")));
        if (ziel !== f.path) { const von = f.path; await app.fileManager.renameFile(f, ziel); b.umbenannt.push(von + " → " + ziel); b.geschrieben.push(ziel); }
      }
      const neu = lehreNotizText(alt, e, soll);
      if (neu !== alt) { await app.vault.modify(f, neu); b.aktualisiert.push(f.path); b.geschrieben.push(f.path); }
      angewendet[e.id] = eintragHash(e);
    }
    // Übrige zentrale Notizen: nicht mehr gewählt (Filter, „Besuche ich nicht“, Gruppen) oder aus den Daten verschwunden.
    // Schutz gegen kaputte Exporte: Fehlt auf einmal mehr als die Hälfte (und mehr als 2) der laufenden Serien, gilt keine als
    // entfallen. Serien, deren Ende über 30 Tage zurückliegt, und Notizen eines anderen Semesters bleiben unverändert (alte
    // Semester: Beim Semesterwechsel ersetzt der Export das Semester, die Vorlesungen sind dann vorbei, nicht entfallen).
    const laufend = Object.keys(vorhanden).filter((id) => {
      const fm = fmVon(vorhanden[id]) || {}, ende = s10(fm.bis);
      return String(fm.semester || "") === F.semester && (!ende || tageZwischen(ende, heute) <= 30);
    });
    const fehlend = laufend.filter((id) => !imDatensatz.has(id) && !ids.has(id));
    const sperre = fehlend.length > 2 && fehlend.length > laufend.length / 2;
    if (sperre) warnen(b, `${fehlend.length} Veranstaltungen fehlen in den Daten – nicht als entfallen behandelt.`);
    const jeId = {};
    for (const e of L) if (!jeId[e.id]) jeId[e.id] = e;
    for (const id of laufend) {
      if (erledigt.has(id)) continue;
      const weg = !imDatensatz.has(id);
      if (weg && (sperre || ids.has(id))) continue; // geschützt bzw. nur ungültig (die id steht noch in den Daten)
      const f = vorhanden[id], fm = fmVon(f) || {};
      const text = await app.vault.read(f);
      if (!lehreMeine(text)) { await papierkorb(f); b.papierkorb.push(f.path); delete angewendet[id]; continue; }
      // Mit eigenem Text und noch in den Daten (nicht mehr gewählt): Zeit, Raum, Ausfälle weiter nach den Daten, dein Text bleibt
      if (!weg) {
        const e = jeId[id], mfm = Fm.module[e.code] ? fmVon(Fm.module[e.code]) || {} : {};
        const neu = lehreNotizText(text, e, { modulLink: modulLink(Fm, e.code), kurz: mfm.titel || e.titel });
        if (neu !== text) { await app.vault.modify(f, neu); b.aktualisiert.push(f.path); b.geschrieben.push(f.path); }
        continue;
      }
      // Mit eigenem Text und weggefallen: bleibt als „(entfällt)“, dann zeigen Raster und Liste sie nicht mehr.
      if (fm.entfaellt !== true) {
        await app.fileManager.processFrontMatter(f, (x) => { x.entfaellt = true; if (!/\(entfällt\)$/.test(String(x.titel || ""))) x.titel = String(x.titel || f.basename) + ENTFAELLT; });
        b.entfaellt.push(f.path); b.geschrieben.push(f.path);
      }
      delete angewendet[id];
    }
    // Schutz wie beim Wegfall: Fehlen auf einmal mehr als die Hälfte (und mehr als 2) der gewählten Notizen, hast du sie kaum alle
    // gelöscht (Tresor neu aufgebaut, Sync unvollständig): nichts ausblenden, Grabsteine bleiben
    const massen = geloescht.length > 2 && geloescht.length > sel.notizen.length / 2;
    if (massen) { warnen(b, `${geloescht.length} Veranstaltungen fehlen im Tresor – nicht als „Besuche ich nicht“ gewertet.`); geloescht.length = 0; }
    for (const id of geloescht) delete angewendet[id];
    if (geloescht.length) { await ausblendenSetzen(geloescht, true); b.geschrieben.push(EINSTELLUNGEN); }
    // lehreDa für den nächsten Lauf: die Notizen dieses Geräts, dazu neu angelegte und fehlende, die noch einen Grabstein haben
    standSetzen({ lehreDa: Object.keys(vorhanden).concat(Array.from(da).filter((id) => !vorhanden[id] && angewendet[id])) });
    b.lehre = { notizen: sel.notizen.length - b.ersetzt.length, gruppen: sel.gruppen, ausgeblendet: sel.ausgeblendet + geloescht.length, ohneBeginn: F.ohneBeginn };
    return { angewendet, geschuetzt: sperre || massen };
  };
  // Holen und prüfen (Abrufer): → { d, sha } | { fehler }
  const lehreHolen = async (soll) => {
    let r;
    try { r = await holen(LEHRE); } catch (e) { return { fehler: "keine Verbindung (" + ((e && e.message) || e) + ")" }; }
    if (r.bytes.length !== soll.groesse || (await sha256(r.bytes)) !== soll.sha256) return { fehler: "Prüfsumme stimmt nicht – nichts übernommen" };
    let d;
    try { d = JSON.parse(r.text); } catch (e) { return { fehler: "unlesbar" }; }
    const p = lehrePruefen(d);
    if (p.fehler) return { fehler: p.fehler };
    return { d, sha: soll.sha256 };
  };
  // Für Anzeige und Texte (alle Geräte): gibt es den zentralen Stundenplan? verfuegbar = im Manifest oder Notizen da und kein
  // eigener Uni-Abgleich; anzahl = zentrale Notizen im aktuellen Raster (ohne entfallen und ausgeblendet)
  const stundenplanStand = () => {
    const aus = ausgeblendet();
    let anzahl = 0;
    const notizen = zentraleNotizen(true);
    for (const id of Object.keys(notizen)) { const fm = fmVon(notizen[id]) || {}; if (fm.entfaellt !== true && !aus.has(id)) anzahl++; }
    let ohneBeginn = false;
    try { ohneBeginn = !!(ctx.modell && ctx.modell.daten().studienbeginnStandard); } catch (e) { ohneBeginn = false; }
    return { verfuegbar: (!!stand().lehre || anzahl > 0) && !stundenplanExtern(), anzahl, ohneBeginn, ausgeblendet: Array.from(aus).filter((id) => ID.test(id)) };
  };
  // Lesbarer Name einer ausgeblendeten id: aus der Notiz, sonst aus dem letzten Stand, sonst aus der id selbst
  const lehreName = (id) => {
    const f = zentraleNotizen(true)[id];
    const fm = f ? fmVon(f) || {} : null;
    if (fm && fm.code) return `${fm.code} ${fm.art || ""} · ${fm.tag || ""} ${fm.beginn || ""}`.replace(/\s+/g, " ").trim();
    const d = (lokal(L.daten) || {})[LEHRE];
    const e = d && Array.isArray(d.veranstaltungen) ? d.veranstaltungen.find((x) => x && x.id === id) : null;
    if (e && typeof e.code === "string") return `${e.code} ${(lehreNormal(e).wert || {}).bezeichnung || e.art || ""} · ${e.tag || ""} ${e.von || ""}`.replace(/\s+/g, " ").trim();
    const m = id.match(/^(?:ws-\d{4}-\d{2}|ss-\d{4})-([a-z0-9]+)-([a-z]+)-.*?(mo|di|mi|do|fr|sa|so)-(\d{2})(\d{2})(?:-\d+)?$/);
    return m ? `${m[1].toUpperCase()} ${m[2]} · ${m[3].charAt(0).toUpperCase() + m[3].slice(1)} ${m[4]}:${m[5]}` : id;
  };

  // ---------- Status (gerätelokal) ----------
  // geprueft = letztes geprüftes Manifest (auch update.js), erfolg = letzter Lauf ohne Fehler (Quellen-Vertrag), warnung = Satz des
  // letzten Laufs
  const stand = () => Object.assign({ geprueft: "", erfolg: "", fehler: "", fehlerZeit: "", warnung: "", pause: false, hinweis: "", plugin_aktuell: "", release: null, beta: null, abdeckung: null, hashes: {}, filter: "", abrufer: false, lehre: false }, lokal(L.stand) || {});
  const standSetzen = (aend) => lokal(L.stand, Object.assign(stand(), aend));
  const protokoll = ctx.bleibend("protokoll", () => []); // Läufe (für Tests), überlebt den Hot-Reload

  const neuerBericht = (art) => ({ art, geschrieben: [], angelegt: [], aktualisiert: [], uebernommen: [], umbenannt: [], entfaellt: [], papierkorb: [], ausgeblendet: [], ersetzt: [], verworfen: [], seitBesuch: [], doppel: 0, warnung: "", fehler: "", lehre: null });
  const warnen = (b, text) => { b.warnung = b.warnung ? b.warnung + " " + text : text; };

  // ---------- Ein Abruf ----------
  // optionen: { manuell } (Notice mit Ergebnis), { nurCache } (ohne Netz aus dem letzten Stand neu anwenden, z. B. nach einer
  // Änderung am Filter; nur, wenn dieses Gerät Abrufer ist)
  let laeuft = null;
  const abrufen = (optionen) => {
    if (laeuft) return laeuft;
    laeuft = abrufenIntern(optionen || {}).then((b) => { laeuft = null; protokoll.push({ zeit: new Date().toISOString(), art: b.art, geschrieben: b.geschrieben.length }); if (protokoll.length > 50) protokoll.shift(); neuZeichnen(); return b; },
      (e) => { laeuft = null; console.error("zentral: Abruf", e); const b = neuerBericht("fehler"); b.fehler = (e && e.message) || String(e); standSetzen({ fehler: b.fehler, fehlerZeit: new Date().toISOString() }); neuZeichnen(); return b; });
    return laeuft;
  };
  const KEINE_VERBINDUNG = "Keine Verbindung zu den zentralen Daten. Dein letzter Stand bleibt.";
  const abrufenIntern = async (o) => {
    const b = neuerBericht("ok");
    const melden = (text) => { if (o.manuell) ctx.hinweis(text); };
    if (!eingeschaltet()) { b.art = "aus"; melden("Zentrale Daten sind ausgeschaltet."); return b; }
    if (!ctx.modell || !ctx.modell.daten) { b.art = "fehler"; b.fehler = "Datenmodell fehlt"; return b; }
    // text (Fehler für Zeile und Konsole) und satz (Hinweis ohne Technik)
    const fehler = (text, satz) => { b.art = "fehler"; b.fehler = text; standSetzen({ fehler: text, fehlerZeit: new Date().toISOString() }); melden(satz || "Die zentralen Daten ließen sich nicht übernehmen. Dein letzter Stand bleibt."); return b; };
    const ich = geraetId();
    const S0 = stand();
    if (o.nurCache && S0.pause) { b.art = "pausiert"; return b; }
    let manifest = null;
    if (!o.nurCache) {
      // 1. Manifest
      let roh;
      try { roh = await holen("manifest.json"); } catch (e) { return fehler("keine Verbindung (" + ((e && e.message) || e) + ")", KEINE_VERBINDUNG); }
      if (roh.bytes.length > G.manifest) return fehler("Manifest zu groß");
      let m;
      try { m = JSON.parse(roh.text); } catch (e) { return fehler("Manifest unlesbar"); }
      const mp = manifestPruefen(m);
      if (mp.fehler) return fehler(mp.fehler);
      manifest = mp.wert;
      standSetzen({ geprueft: new Date().toISOString(), hinweis: manifest.hinweis, plugin_aktuell: manifest.plugin_aktuell, release: manifest.release, beta: manifest.beta, abdeckung: manifest.abdeckung, pause: manifest.pause, lehre: !!manifest.dateien[LEHRE] });
      if (manifest.pause) { b.art = "pausiert"; standSetzen({ fehler: "", fehlerZeit: "" }); melden("Zentrale Daten sind gerade pausiert. Dein letzter Stand bleibt."); return b; }
    }
    // 1b. Gruppen (gruppen.json): jedes Gerät selbst, nur gerätelokal. Ein Fehler hält nur die Gruppen an (ihr letzter
    // Stand bleibt), nie Termine und Semesterdaten – wie beim Export (docs/daten-v1.md).
    if (manifest && manifest.dateien[GRUPPEN]) {
      const g = await gruppenHolen(manifest.dateien[GRUPPEN], o.manuell);
      if (g.fehler) warnen(b, "Gruppen: " + g.fehler);
      if (g.verworfen) b.verworfen = b.verworfen.concat(g.verworfen);
    }
    // 1c. Angebote (angebote.json): ebenso jedes Gerät selbst. Fehlt die Datei im Manifest, ist sie zurückgezogen → Stand löschen.
    if (manifest && manifest.dateien[ANGEBOTE]) {
      const g = await angeboteHolen(manifest.dateien[ANGEBOTE], o.manuell);
      if (g.fehler) warnen(b, "Angebote: " + g.fehler);
      if (g.verworfen) b.verworfen = b.verworfen.concat(g.verworfen);
    } else if (manifest && angeboteStand()) { lokal(L.angebote, null); angeboteNeuZeichnen(); }
    // 1d. Kapitellisten (kapitel.json): ebenso jedes Gerät selbst; die Notizen daraus schreibt lernplan.js (nur der Abrufer)
    if (manifest && manifest.dateien[KAPITEL]) {
      const g = await kapitelHolen(manifest.dateien[KAPITEL], o.manuell);
      if (g.fehler) warnen(b, "Kapitellisten: " + g.fehler);
      if (g.verworfen) b.verworfen = b.verworfen.concat(g.verworfen);
    } else if (manifest && kapitelStand()) { lokal(L.kapitel, null); kapitelNeu(); }
    // 1e. Literaturlisten (literatur.json): ebenso; die Notizen daraus schreibt literatur.js (nur der Abrufer)
    if (manifest && manifest.dateien[LITERATUR]) {
      const g = await literaturHolen(manifest.dateien[LITERATUR], o.manuell);
      if (g.fehler) warnen(b, "Literaturlisten: " + g.fehler);
      if (g.verworfen) b.verworfen = b.verworfen.concat(g.verworfen);
    } else if (manifest && literaturStand()) { lokal(L.literatur, null); literaturNeu(); }
    // 2. Abrufer-Sperre: Ein anderes Gerät, das vor höchstens UEBERNAHME abgerufen hat, bleibt Abrufer. „Jetzt aktualisieren“
    // übernimmt (wie „Hier laden“ bei ILIAS), außer das andere Gerät hat vor weniger als GERADE abgerufen.
    const a = await abrufLesen();
    // Grabsteine gerätelokal mitschreiben: Fehlt abruf.json später beim Übernehmen (Sync noch nicht da) oder ist sie unlesbar,
    // gilt dieser Stand statt eines leeren (unten), sonst kämen alle gelöschten Notizen zurück
    if (a && JSON.stringify(a.angewendet) !== JSON.stringify(lokal(L.angewendet) || {})) lokal(L.angewendet, a.angewendet);
    const fremd = (x) => !!x && x.geraet !== ich && alterMs(x.zuletzt) <= UEBERNAHME;
    const anderesGeraet = () => {
      b.art = "anderes-geraet"; standSetzen({ fehler: "", fehlerZeit: "", warnung: "", erfolg: new Date().toISOString(), abrufer: false });
      melden("Ein anderes Gerät hat die zentralen Daten gerade aktualisiert, deine Notizen kommen über deinen Sync.");
      return b;
    };
    if (fremd(a) && (!o.manuell || alterMs(a.zuletzt) < GERADE)) return anderesGeraet();
    if (o.nurCache && (!a || a.geraet !== ich)) { b.art = "anderes-geraet"; return b; }
    // 3. Dateien (nur bei geänderter Prüfsumme; im nurCache-Lauf gar nicht)
    const cache = lokal(L.daten) || {};
    const neu = {};
    const hashes = Object.assign({}, S0.hashes);
    // Fehlt eine Datei im Manifest, bleiben ihre Notizen beim letzten Stand (docs/daten-v1.md): nicht aus dem gerätelokalen Stand
    // neu anwenden, sonst wendete jedes Gerät seinen verschieden alten Stand an. Ohne Netz (nurCache) gilt das letzte Manifest:
    // In hashes stehen nur Dateien, die es nannte.
    const gelistet = (name) => (manifest ? !!manifest.dateien[name] : !!S0.hashes[name]);
    if (manifest) for (const name of Object.keys(hashes)) if (!manifest.dateien[name]) delete hashes[name];
    if (manifest) {
      for (const name of Object.keys(manifest.dateien)) {
        if (name === GRUPPEN || name === ANGEBOTE || name === LITERATUR || name === LEHRE) continue; // gerätelokal oben bzw. Stundenplan unten (eigene Fehler)
        const soll = manifest.dateien[name];
        if (!o.manuell && S0.hashes[name] === soll.sha256 && cache[name]) continue;
        let r;
        try { r = await holen(name); } catch (e) { return fehler("keine Verbindung (" + ((e && e.message) || e) + ")", KEINE_VERBINDUNG); }
        if (r.bytes.length !== soll.groesse || (await sha256(r.bytes)) !== soll.sha256) return fehler("Prüfsumme von " + name + " stimmt nicht – nichts übernommen");
        let d;
        try { d = JSON.parse(r.text); } catch (e) { return fehler(name + " unlesbar"); }
        neu[name] = { d, sha: soll.sha256 };
      }
    }
    // Prüfen (erst alles, dann schreiben)
    let T = null, ids = new Set(), S = null;
    const tRoh = neu["termine.json"] ? neu["termine.json"].d : gelistet("termine.json") ? cache["termine.json"] : null;
    if (tRoh) {
      const tp = terminePruefen(tRoh);
      if (tp.fehler) return fehler(tp.fehler);
      T = tp.termine; ids = tp.ids; b.verworfen = b.verworfen.concat(tp.verworfen);
    }
    const sRoh = neu["semester.json"] ? neu["semester.json"].d : gelistet("semester.json") ? cache["semester.json"] : null;
    if (sRoh) {
      const sp = semesterPruefen(sRoh);
      if (sp.fehler) return fehler(sp.fehler);
      S = sp.wert;
      if (sp.verworfen.length) b.verworfen = b.verworfen.concat(sp.verworfen.map((x) => ({ id: "semester", grund: x })));
    }
    // 3b. Zentraler Stundenplan (veranstaltungen.json): eigener Abruf und eigene Prüfung. Ein Fehler (Netz, Prüfsumme, Format)
    // hält nur den Stundenplan an (letzter Stand bleibt, Warnung im Bericht), nie Termine und Semesterdaten. Kommt der
    // Stundenplan von außen (eigener Uni-Abgleich), weder holen noch anwenden.
    const lehreAn = !stundenplanExtern();
    let lehreNeu = null, LP = null;
    if (lehreAn && manifest && manifest.dateien[LEHRE] && (o.manuell || S0.hashes[LEHRE] !== manifest.dateien[LEHRE].sha256 || !cache[LEHRE])) {
      const r = await lehreHolen(manifest.dateien[LEHRE]);
      if (r.fehler) warnen(b, "Stundenplan: " + r.fehler); else lehreNeu = r;
    }
    const lRoh = lehreNeu ? lehreNeu.d : lehreAn && gelistet(LEHRE) ? cache[LEHRE] : null;
    if (lRoh) {
      const lp = lehrePruefen(lRoh);
      if (lp.fehler) warnen(b, "Stundenplan: " + lp.fehler);
      else { LP = lp; b.verworfen = b.verworfen.concat(lp.verworfen.map((x) => ({ id: "veranstaltung " + x.id, grund: x.grund }))); }
    }
    const filter = filterSchluessel();
    const anwenden = o.manuell || o.nurCache || Object.keys(neu).length > 0 || !!lehreNeu || filter !== S0.filter || !S0.abrufer || !a || a.geraet !== ich;
    if (o.nurCache && filter === S0.filter) { b.art = "unveraendert"; return b; }
    // Direkt vor dem Schreiben abruf.json neu lesen: Hat inzwischen ein anderes Gerät übernommen oder abgerufen, schreibt dieser
    // Lauf nichts, damit nie zwei Geräte zugleich dieselben Notizen schreiben. Eine Übernahme von Hand gilt nur gegen den Stand,
    // den sie oben gesehen hat.
    const a2 = await abrufLesen();
    if (fremd(a2) && !(a && a2.geraet === a.geraet && a2.zuletzt === a.zuletzt)) return anderesGeraet();
    // Wechsel (oder noch kein Abrufer): erst abruf.json mit diesem Gerät, dann die Notizen. Sonst nur nach PULS oder mit neuem
    // „angewendet“ (nicht bei jedem Lauf schreiben).
    const wechsel = !a2 || a2.geraet !== ich;
    if (wechsel) await sperre(b).nehmen({ erzwingen: true });
    const abruf = (wechsel ? await abrufLesen() : a2) || { geraet: ich, seit: new Date().toISOString(), zuletzt: "", angewendet: (a2 && a2.angewendet) || {} };
    let angewendetNeu = false;
    // abruf.json fehlte oder war unlesbar: Die Sperre steht jetzt neu da, ohne „angewendet“. Dann gelten die Grabsteine, die dieses
    // Gerät zuletzt gesehen hat (oben), und kommen gleich wieder in die Datei. Nur, wenn noch die meisten dieser ids als zentrale
    // Notiz im Tresor stehen: Fehlen auch die Notizen (Tresor neu aufgebaut, Sicherung ohne System/Daten), sind sie nicht von dir
    // gelöscht, und der Lauf legt sie neu an wie beim ersten Abruf.
    const gemerkt = lokal(L.angewendet);
    const gemerktIds = gemerkt && typeof gemerkt === "object" ? Object.keys(gemerkt) : [];
    if (!a2 && !Object.keys(abruf.angewendet || {}).length && gemerktIds.length) {
      const notizen = Object.assign({}, zentraleNotizen(), zentraleNotizen(true));
      if (gemerktIds.filter((id) => notizen[id]).length > gemerktIds.length / 2) { abruf.angewendet = Object.assign({}, gemerkt); angewendetNeu = true; }
    }
    let geschuetzt = false; // Schutz gegen Massenwegfall hat gegriffen: keine Grabsteine aufräumen
    if (anwenden) {
      if (T) {
        // „Seit deinem letzten Besuch“: erster Lauf des Tresors (nichts angewendet) meldet nichts; ids aus dem letzten Stand dieses
        // Geräts trennen neue Termine von solchen, die nur durch deine Auswahl dazukommen
        const erster = !Object.keys(abruf.angewendet || {}).length;
        const altT = cache["termine.json"];
        const altIds = altT && Array.isArray(altT.termine) ? new Set(altT.termine.map((x) => x && x.id).filter(Boolean)) : null;
        const r = await termineAnwenden(T, ids, abruf, b);
        geschuetzt = r.geschuetzt;
        if (JSON.stringify(r.angewendet) !== JSON.stringify(abruf.angewendet || {})) { abruf.angewendet = r.angewendet; angewendetNeu = true; }
        if (ctx.seitBesuch && b.seitBesuch.length) {
          try { await ctx.seitBesuch.zentral(b.seitBesuch, { erster, altIds }); } catch (e) { console.error("zentral: Seit deinem letzten Besuch", e); }
        }
      }
      if (S) await semesterSchreiben(S, b);
      if (LP) {
        try {
          const r = await lehreAnwenden(LP.veranstaltungen, LP.ids, abruf, b, !a2);
          geschuetzt = geschuetzt || r.geschuetzt;
          if (JSON.stringify(r.angewendet) !== JSON.stringify(abruf.angewendet || {})) { abruf.angewendet = r.angewendet; angewendetNeu = true; }
        } catch (e) { geschuetzt = true; console.error("zentral: Stundenplan", e); warnen(b, "Stundenplan: " + ((e && e.message) || e)); }
      }
      // Grabsteine aufräumen (sonst wüchse abruf.json um jedes Semester): Eine id, die weder in den Daten (auch als verworfener
      // Eintrag) noch als zentrale Notiz im Tresor steht, braucht keinen mehr, sobald das GRABSTEIN_TAGE so ist (fehltSeit,
      // gerätelokal: ein kurz fehlender oder neu veröffentlichter Eintrag behält ihn). Nur mit Terminen und Stundenplan in diesem
      // Lauf, weil beide in „angewendet“ stehen, und nicht nach einem Massenwegfall (ein kaputter Export soll keine Grabsteine kosten).
      if (T && LP && !geschuetzt) {
        const bleibt = new Set(Object.keys(zentraleNotizen()).concat(Object.keys(zentraleNotizen(true)), T.map((e) => e.id), Array.from(ids),
          LP.veranstaltungen.map((e) => e.id), Array.from(LP.ids)));
        const alt = abruf.angewendet || {}, rest = {}, seit = stand().fehltSeit || {}, fehlt = {}, heute = heuteIso();
        for (const id of Object.keys(alt)) {
          if (bleibt.has(id)) { rest[id] = alt[id]; continue; }
          const ab = /^\d{4}-\d{2}-\d{2}$/.test(seit[id] || "") ? seit[id] : heute;
          if (tageZwischen(ab, heute) < GRABSTEIN_TAGE) { rest[id] = alt[id]; fehlt[id] = ab; }
        }
        standSetzen({ fehltSeit: fehlt });
        if (Object.keys(rest).length !== Object.keys(alt).length) { abruf.angewendet = rest; angewendetNeu = true; }
      }
    } else b.art = "unveraendert";
    // Puls über sperre.js (höchstens alle PULS); neue Grabsteine dazu, solange dieses Gerät die Sperre hält
    if (!wechsel && (await sperre(b).puls()) && angewendetNeu) { await angewendetSchreiben(abruf.angewendet, b); lokal(L.angewendet, abruf.angewendet); }
    else if (wechsel && angewendetNeu) { await angewendetSchreiben(abruf.angewendet, b); lokal(L.angewendet, abruf.angewendet); }
    // Stand merken (Prüfsummen nur, wenn übernommen)
    for (const name of Object.keys(neu)) { hashes[name] = neu[name].sha; cache[name] = neu[name].d; }
    if (lehreNeu) { hashes[LEHRE] = lehreNeu.sha; cache[LEHRE] = lehreNeu.d; }
    lokal(L.daten, cache);
    standSetzen({ hashes, filter, abrufer: true, fehler: "", fehlerZeit: "", warnung: b.warnung, erfolg: new Date().toISOString() });
    if (b.art === "ok" && !b.geschrieben.length) b.art = "unveraendert";
    if (o.manuell) {
      const n = b.angelegt.length + b.aktualisiert.length + b.entfaellt.length + b.papierkorb.length;
      melden((n ? `Zentrale Daten aktualisiert, ${n} ${n === 1 ? "Eintrag" : "Einträge"} geändert.` : "Die zentralen Daten sind aktuell.") + (b.warnung ? " " + b.warnung : ""));
    }
    return b;
  };

  // ---------- Optionale Dateien gerätelokal holen (gruppen.json, angebote.json, kapitel.json, literatur.json) ----------
  // soll = { sha256, groesse } aus dem Manifest. Unveränderte Prüfsumme und vorhandener Stand → nichts holen (außer manuell).
  // art = { schluessel (gerätelokal), liste (Feldname), pruefen, praefix (für verworfene ids im Bericht), neuZeichnen }
  // → {} | { verworfen: [...] } | { fehler }
  const lokalerStand = (schluessel, liste) => { const g = lokal(schluessel); return g && typeof g === "object" && Array.isArray(g[liste]) ? g : null; };
  const optionalHolen = async (name, soll, manuell, art) => {
    const alt = lokalerStand(art.schluessel, art.liste);
    if (!manuell && alt && alt.sha256 === soll.sha256) return {};
    let r;
    try { r = await holen(name); } catch (e) { return { fehler: "keine Verbindung (" + ((e && e.message) || e) + ")" }; }
    if (r.bytes.length !== soll.groesse || (await sha256(r.bytes)) !== soll.sha256) return { fehler: "Prüfsumme von " + name + " stimmt nicht – nichts übernommen" };
    let d;
    try { d = JSON.parse(r.text); } catch (e) { return { fehler: name + " unlesbar" }; }
    const p = art.pruefen(d);
    if (p.fehler) return { fehler: p.fehler };
    lokal(art.schluessel, { sha256: soll.sha256, geholt: new Date().toISOString(), stand: p.stand, [art.liste]: p[art.liste] });
    if (!alt || alt.sha256 !== soll.sha256) art.neuZeichnen();
    return { verworfen: p.verworfen.map((x) => ({ id: art.praefix + x.id, grund: x.grund })) };
  };
  // gruppen.js und angebote.js melden sich als ctx.gruppenAnzeige bzw. ctx.angeboteAnzeige an (laden vor diesem Skript, darum
  // kein Abonnement)
  const anzeigeNeu = (a) => { try { if (a && a.neu) a.neu(); } catch (e) { /* egal */ } };
  const gruppenNeuZeichnen = () => anzeigeNeu(ctx.gruppenAnzeige);
  const angeboteNeuZeichnen = () => anzeigeNeu(ctx.angeboteAnzeige);
  const kapitelNeu = () => anzeigeNeu(ctx.lernplanAnzeige);
  const literaturNeu = () => anzeigeNeu(ctx.literaturAnzeige);
  const gruppenStand = () => lokalerStand(L.gruppen, "gruppen");
  const angeboteStand = () => lokalerStand(L.angebote, "angebote");
  const kapitelStand = () => lokalerStand(L.kapitel, "module");
  const literaturStand = () => lokalerStand(L.literatur, "module");
  const gruppenHolen = (soll, manuell) => optionalHolen(GRUPPEN, soll, manuell,
    { schluessel: L.gruppen, liste: "gruppen", pruefen: gruppenPruefen, praefix: "gruppe ", neuZeichnen: gruppenNeuZeichnen });
  const angeboteHolen = (soll, manuell) => optionalHolen(ANGEBOTE, soll, manuell,
    { schluessel: L.angebote, liste: "angebote", pruefen: angebotePruefen, praefix: "angebot ", neuZeichnen: angeboteNeuZeichnen });
  const kapitelHolen = (soll, manuell) => optionalHolen(KAPITEL, soll, manuell,
    { schluessel: L.kapitel, liste: "module", pruefen: kapitelPruefen, praefix: "kapitel ", neuZeichnen: kapitelNeu });
  const literaturHolen = (soll, manuell) => optionalHolen(LITERATUR, soll, manuell,
    { schluessel: L.literatur, liste: "module", pruefen: literaturPruefen, praefix: "literatur ", neuZeichnen: literaturNeu });

  // ---------- Status (Quellen-Vertrag) ----------
  // Gemeinsame Form der Quellen: { zustand (aus | laeuft | pause | fehler | an), geprueft (letzter Lauf ohne Fehler; vor dem ersten
  // solchen Lauf das letzte geprüfte Manifest), fehler (ein Satz, bleibt bis zum nächsten Erfolg), fehlerZeit, warnungen }, dazu
  // an, pause, grund (Fehler technisch, nur für die Konsole), hinweis (aus dem Manifest), neueVersion, releases, veranstaltungen,
  // abrufer. Die Zeile unter Verbindungen formatiert verbindungen.js (standText, eine Formatierung für alle Quellen).
  const fehlerSatz = (f) => (/^keine Verbindung/.test(f) ? "Keine Verbindung zu den zentralen Daten." : "Die zentralen Daten ließen sich nicht übernehmen.");
  const status = () => {
    const s = stand(), aus = !eingeschaltet();
    const version = (ctx.plugin && ctx.plugin.manifest && ctx.plugin.manifest.version) || "0.0.0";
    const zustand = aus ? "aus" : laeuft ? "laeuft" : s.pause ? "pause" : s.fehler ? "fehler" : "an";
    return {
      zustand, geprueft: s.erfolg || s.geprueft, fehler: s.fehler ? fehlerSatz(s.fehler) : "", fehlerZeit: s.fehler ? s.fehlerZeit : "",
      warnungen: s.warnung ? [s.warnung] : [], grund: s.fehler,
      an: !aus, verbunden: !aus, pause: !!s.pause, hinweis: s.hinweis,
      neueVersion: !aus && neuer(s.plugin_aktuell, version) ? s.plugin_aktuell : "", releases: RELEASES, // aus: kein altes Angebot
      veranstaltungen: veranstaltungenZeigen(), abrufer: !!s.abrufer,
    };
  };
  // Nur das Manifest holen und prüfen (für den Knopf „Aktualisieren“ in update.js: frische Angaben zum Release). Merkt sich
  // release und plugin_aktuell im Status; schreibt keine Datei. Wirft bei Fehler.
  const manifestHolen = async () => {
    const roh = await holen("manifest.json");
    if (roh.bytes.length > G.manifest) throw new Error("Manifest zu groß");
    let m;
    try { m = JSON.parse(roh.text); } catch (e) { throw new Error("Manifest unlesbar", { cause: e }); }
    const mp = manifestPruefen(m);
    if (mp.fehler) throw new Error(mp.fehler);
    standSetzen({ plugin_aktuell: mp.wert.plugin_aktuell, release: mp.wert.release, beta: mp.wert.beta, abdeckung: mp.wert.abdeckung });
    return mp.wert;
  };
  const neuZeichnen = () => { try { if (ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen(); } catch (e) { /* egal */ } };

  // ---------- Schalter (System/Einstellungen.md, für alle Geräte gleich) ----------
  const schalten = async (feld, wert) => {
    const f = datei(EINSTELLUNGEN);
    if (!f) return;
    await app.fileManager.processFrontMatter(f, (x) => { x[feld] = wert; });
  };

  // Raster neu zeichnen: Bases rechnet beim Ändern der Einstellungen allein nicht neu (die Liste steht dort, nicht in den Notizen)
  const rasterNeu = () => ctx.zeit(() => {
    app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf && leaf.view, p = v && v.file && v.file.path;
      if ((p === "Dashboard.md" || p === "Studium/Stundenplan.md") && v.previewMode && v.previewMode.rerender) v.previewMode.rerender(true);
    });
  }, 800);

  // ---------- Erweiterung ----------
  const AKTIONEN = {
    "zentral-aktualisieren": {
      titel: "Zentrale Daten aktualisieren",
      ausfuehren: async () => abrufen({ manuell: true }),
    },
    "zentral-schalter": {
      ausfuehren: async (c) => {
        const was = String(c.parameter.was || "daten");
        // wert "1"/"0" (Schalter im Fenster „Zentrale Daten“, Knopf „Einschalten“) setzt fest; ohne wert wird umgeschaltet
        const fest = c.parameter.wert === "1" ? true : c.parameter.wert === "0" ? false : null;
        if (was === "veranstaltungen") {
          const neu = fest !== null ? fest : !veranstaltungenZeigen();
          await schalten("zentrale_veranstaltungen", neu);
          ctx.hinweis(neu ? "Fachschaft und Veranstaltungen werden wieder gezeigt." : "Fachschaft und Veranstaltungen ausgeblendet.");
        } else {
          const neu = fest !== null ? fest : !eingeschaltet();
          await schalten("zentrale_daten", neu);
          ctx.hinweis(neu ? "Zentrale Daten eingeschaltet." : "Zentrale Daten ausgeschaltet. Vorhandene Termine bleiben.");
          if (neu && !plugin().testZentralAus) ctx.zeit(() => abrufen({}), 1500);
        }
        neuZeichnen();
      },
    },
    // „Besuche ich nicht“ (Kopf jeder zentralen Stundenplan-Notiz, kopf.js, id=…; als Befehl: die geöffnete Notiz). Gilt sofort im
    // Raster (Bases-Formel liest die Liste), die Notiz räumt der Abrufer weg. Hinweis mit „Rückgängig“.
    "besuche-nicht": {
      titel: "Besuche ich nicht",
      ausfuehren: async (c) => {
        let id = String((c.parameter && c.parameter.id) || "");
        if (!id) { const fm = fmVon(app.workspace.getActiveFile()); if (fm && fm.herkunft === "zentral" && fm.typ === "lehrveranstaltung") id = String(fm.zentral_id || ""); }
        if (!ID.test(id)) { ctx.hinweis("Das geht bei Lehrveranstaltungen, die von selbst in deinen Stundenplan kamen."); return; }
        const name = lehreName(id);
        await ausblendenSetzen([id], true);
        ctx.hinweis(`${name} steht nicht mehr in deinem Stundenplan.`, { aktion: { text: "Rückgängig", aktion: "wieder-zeigen", parameter: { id } } });
        neuZeichnen();
        rasterNeu();
      },
    },
    "wieder-zeigen": {
      ausfuehren: async (c) => {
        const id = String((c.parameter && c.parameter.id) || "");
        if (!ID.test(id)) return;
        await ausblendenSetzen([id], false);
        ctx.hinweis(`${lehreName(id)} steht wieder in deinem Stundenplan.`);
        neuZeichnen();
        rasterNeu();
      },
    },
  };

  ctx.zentral = {
    abrufen, status, stand, geraetId, idAusName, notizText, dateiName, neuerName, terminePruefen, semesterPruefen, manifestPruefen, gruppenPruefen,
    angebotePruefen, kapitelPruefen, literaturPruefen, lehrePruefen, stundenplanFilter, stundenplanAuswahl, pflichtCodes, eigenePaare, lehreNotizText, lehreMeine, lehreZeit,
    aenderungenFelder, lehreDateiName, lehreName,
    // zentraler Stundenplan für Anzeige und Texte: { verfuegbar, anzahl, ohneBeginn, ausgeblendet: [ids] }
    stundenplan: stundenplanStand,
    // gerätelokaler Stand der Gruppen (gruppen.js): { stand, geholt, gruppen } oder null (noch nie geholt)
    gruppen: () => { const g = gruppenStand(); return g ? { stand: String(g.stand || ""), geholt: String(g.geholt || ""), gruppen: g.gruppen } : null; },
    // gerätelokaler Stand der Angebote (angebote.js): { stand, geholt, angebote } oder null (nie geholt, zurückgezogen oder zentrale
    // Daten aus; der Stand bleibt fürs Wiedereinschalten)
    angebote: () => { const g = eingeschaltet() && angeboteStand(); return g ? { stand: String(g.stand || ""), geholt: String(g.geholt || ""), angebote: g.angebote } : null; },
    // Module, deren Termine aus Unterlagen zentral kommen (modul.js, server.js): { stand, semester, module, gilt } oder null
    abdeckung: abdeckungStand,
    // gerätelokaler Stand der Kapitellisten (lernplan.js): { stand, sha256, module } oder null (nie geholt, zurückgezogen oder
    // zentrale Daten aus)
    kapitel: () => { const g = eingeschaltet() && kapitelStand(); return g ? { stand: String(g.stand || ""), sha256: String(g.sha256 || ""), module: g.module } : null; },
    // ebenso die Literaturlisten (literatur.js)
    literatur: () => { const g = eingeschaltet() && literaturStand(); return g ? { stand: String(g.stand || ""), sha256: String(g.sha256 || ""), module: g.module } : null; },
    semKanon, sha256, protokoll, filterBauen, manifestHolen, releasePruefen, semver, neuer, frischUrl, FRISCH_KOPF, RELEASE_ROH, BASIS, RELEASES, ABRUF, MEINE,
    abruferHier, abruferHierAus,
    get laeuft() { return !!laeuft; },
  };

  const registrieren = () => {
    // Automatischer Abruf über den gemeinsamen Zeitplan der Quellen (quellen.js planen): nach dem Einlesen 20 s + Zufallsversatz
    // 0–2 Min., dann alle TAKT (solange Obsidian offen ist), zurück in der App (iPhone/iPad holen Obsidian aus dem Hintergrund,
    // ohne neu zu starten) nach über ZURUECK seit dem letzten Versuch
    Q().planen(ctx, { takt: TAKT, zurueck: ZURUECK, lauf: async () => {
      if (plugin().testZentralAus || !eingeschaltet() || laeuft) return null;
      const b = await abrufen({});
      return b.art === "fehler" ? false : ["ok", "unveraendert", "anderes-geraet", "pausiert"].indexOf(b.art) >= 0 ? true : null;
    } });
    // Filter geändert (Variante, Plan, Schalter)? Dann aus dem letzten Stand neu anwenden – nur auf dem Abrufer-Gerät, ohne Netz
    const pruefen = ctx.entprellen(() => {
      if (plugin().testZentralAus || laeuft || !eingeschaltet() || !stand().abrufer || !ctx.modell) return;
      try { if (filterSchluessel() !== stand().filter) abrufen({ nurCache: true }); } catch (e) { console.error("zentral: Filter", e); }
    }, 5000);
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(pruefen));
  };

  return { registrieren, aktionen: AKTIONEN };
};
