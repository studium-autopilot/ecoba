// Zentrale Daten (Datenkanal, Plan Abschnitt 18): Termine, Fristen und Semesterdaten kommen als JSON von einer öffentlichen
// Seite (GitHub Pages, BASIS unten) und werden als Notizen übernommen. Geholt werden NUR Daten, nie Code.
// Vertrag (Format, Grenzen, id-Regel, Freigabelisten): docs/daten-v1.md. Überblick: docs/architektur.md, „Zentrale Daten“.
//
// Ablauf eines Abrufs:
//   1. manifest.json holen (klein). Fehler/kein Netz → letzter Stand bleibt, Status merkt den Fehler, nichts wird geschrieben.
//      pause: true → nichts übernehmen, Status „pausiert“.
//   2. Abrufer-Sperre (System/Daten/abruf.json, synchronisiert): Nur EIN Gerät schreibt. Ein anderes Gerät übernimmt erst,
//      wenn „zuletzt“ älter als 80 Min. ist. abruf.json wird nur bei Wechsel oder spätestens alle 50 Min. (Puls) geschrieben.
//   3. Dateien nur bei geänderter Prüfsumme holen (Prüfsummen gerätelokal), SHA-256 gegen das Manifest prüfen (Web Crypto).
//      Ein Prüfsummenfehler → in diesem Lauf wird gar nichts übernommen.
//   4. Strenge Prüfung je Eintrag (Schema, Grenzen, Kategorien, Domains, reiner Text). Ungültige Einträge einzeln verwerfen.
//   5. Übernehmen: Termine → Notizen in Termine/ (herkunft: zentral, zentral_id); Semesterdaten → System/Daten/Semester.md.
//      Geschrieben wird nur bei inhaltlicher Änderung. Nie angefasst: Notizen ohne herkunft: zentral, das Feld erledigt,
//      alles unter „## Meine Notizen“, eigene Felder und Tags.
//   Übungs- und Tutoriengruppen (gruppen.json, optional, Plan Abschnitt 20): holt JEDES Gerät selbst (vor der Abrufer-Sperre),
//      geprüft wie oben, nur gerätelokal gespeichert (eba-zentral-gruppen), keine Notizen. Anzeige: gruppen.js (eba-gruppen).
// Wann: beim Start (nach 20 s + Zufallsversatz 0–2 Min.), dann stündlich, beim Zurückkehren in die App (iPhone/iPad: Obsidian
//   bleibt im Hintergrund geladen, Zeitgeber ruhen dort), wenn der letzte Versuch über 30 Min. her ist, plus Aktion
//   „Zentrale Daten jetzt aktualisieren“.
// Testeinstiege (docs/architektur.md): plugin.testZentralAus (kein automatischer Abruf), plugin.testQuelle(name) → Text,
// plugin.testZentralBasis (andere Basis-URL, z. B. lokaler Server). Gerätelokal (app.saveLocalStorage): eba-geraet,
// eba-zentral-stand, eba-zentral-daten, eba-zentral-gruppen.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const { Notice } = ctx.obsidian;

  // ---------- Konstanten ----------
  const BASIS = "https://studium-autopilot.github.io/ecoba-daten/v1/";
  const RELEASES = "https://github.com/studium-autopilot/ecoba/releases";
  const RELEASE_ROH = "https://raw.githubusercontent.com/studium-autopilot/ecoba/"; // Dateien eines Releases (update.js)
  const ABRUF = "System/Daten/abruf.json";
  const SEMESTER = "System/Daten/Semester.md";
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const ORDNER = "Termine";
  const MEINE = "## Meine Notizen";
  const MIN = 60e3, STUNDE = 60 * MIN;
  // Abrufer-Wechsel: Ist das abrufende Gerät aus (PC im Ruhezustand), übernimmt ein anderes nach UEBERNAHME. Der Abrufer erneuert
  // abruf.json bei jedem stündlichen Lauf (PULS unter einer Stunde), daher liegt UEBERNAHME knapp über einer Stunde (0.3.2).
  const UEBERNAHME = 80 * MIN; // anderes Gerät übernimmt, wenn der Abrufer so lange still war
  const PULS = 50 * MIN;       // Abrufer erneuert abruf.json höchstens so oft (unter UEBERNAHME, sonst Wechsel trotz Betrieb)
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
  const DATEIEN = { "termine.json": 1000000, "semester.json": 262144, "gruppen.json": 524288 }; // bekannte Dateien und Höchstgröße (Bytes)
  const GRUPPEN = "gruppen.json"; // optional, gerätelokal (nicht an die Abrufer-Sperre gebunden)
  const G = { manifest: 16384, id: 80, titel: 120, ort: 120, uhrzeit: 11, info: 200, quelleText: 200, url: 500, hinweis: 200, termine: 2000, name: 60, liste: 100,
    gruppen: 1000, gruppe: 20, raum: 120, leitung: 120, anmeldung: 200 };
  const DATUM_MIN = "2020-01-01", DATUM_MAX = "2040-12-31";
  const MODULCODE = /^[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?$/; // wie eba.js
  const L = { geraet: "eba-geraet", stand: "eba-zentral-stand", daten: "eba-zentral-daten", gruppen: "eba-zentral-gruppen" };

  // ---------- Kleine Helfer ----------
  const s10 = (v) => { const m = String(v == null ? "" : v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ""; };
  const dmy = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
  const jetztMs = () => Date.now();
  const heuteIso = () => ctx.date.now("YYYY-MM-DD");
  const J = (v) => JSON.stringify(v == null ? "" : v);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
  const hostOk = (h) => DOMAINS.some((d) => h === d || h.slice(-(d.length + 1)) === "." + d);
  const urlPruefen = (v) => {
    if (v == null || v === "") return { wert: "" };
    if (typeof v !== "string" || v.length > G.url || /[\s"'<>`\\]/.test(v)) return { fehler: "Link ungültig" };
    let u;
    try { u = new URL(v); } catch (e) { return { fehler: "Link ungültig" }; }
    if (u.protocol !== "https:" || u.username || u.password || u.port) return { fehler: "Link nicht https" };
    if (!hostOk(u.hostname.toLowerCase())) return { fehler: "Domain nicht erlaubt: " + u.hostname };
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

  // ---------- Abruf (Netz oder Testquelle) ----------
  const basis = () => String(plugin().testZentralBasis || BASIS).replace(/\/?$/, "/");
  const holen = async (name) => {
    const p = plugin();
    if (typeof p.testQuelle === "function") {
      const t = await p.testQuelle(name);
      if (t == null) throw new Error("nicht gefunden: " + name);
      const bytes = new TextEncoder().encode(String(t));
      return { bytes, text: String(t) };
    }
    let r = await ctx.obsidian.requestUrl({ url: basis() + name, method: "GET", throw: false });
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
      return { geraet: o.geraet, seit: String(o.seit || ""), zuletzt: String(o.zuletzt || ""), angewendet: o.angewendet && typeof o.angewendet === "object" ? o.angewendet : {} };
    } catch (e) { return null; }
  };
  const alterMs = (iso) => { const t = Date.parse(iso || ""); return isNaN(t) ? Infinity : jetztMs() - t; };
  const abrufSchreiben = async (a, bericht) => {
    const text = JSON.stringify({ geraet: a.geraet, seit: a.seit, zuletzt: a.zuletzt, angewendet: a.angewendet || {} }, null, 1) + "\n";
    const f = datei(ABRUF);
    if (f) { if ((await app.vault.read(f)) === text) return; await app.vault.modify(f, text); }
    else { if (!datei("System/Daten")) { try { await app.vault.createFolder("System/Daten"); } catch (e) { /* da */ } } await app.vault.create(ABRUF, text); }
    if (bericht) bericht.geschrieben.push(ABRUF);
  };

  // ---------- Einstellungen und Filter ----------
  const einstellungen = () => fmVon(datei(EINSTELLUNGEN)) || {};
  const an = (v) => v !== false && String(v).toLowerCase() !== "false";
  const eingeschaltet = () => an(einstellungen().zentrale_daten);
  const veranstaltungenZeigen = () => an(einstellungen().zentrale_veranstaltungen);
  // Termine ohne code oder mit bereich (z. B. Schlüsselqualifikation, freiwillig) → alle; mit code → nur, wenn das Modul in
  // deinem Plan ist (gewählt, selbst geplant, läuft/angemeldet) oder laut Musterplan deiner Variante im aktuellen oder
  // nächsten Fachsemester liegt (ctx.modell).
  const filterBauen = () => {
    const D = ctx.modell.daten();
    const zeigen = veranstaltungenZeigen();
    const fs = D.fachsemester || 1;
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
      aufnehmen: (e) => (zeigen || VERANSTALTUNG.indexOf(e.kategorie) < 0) && (!e.code || !!e.bereich || !!codes[e.code]),
      schluessel: JSON.stringify({ z: zeigen, c: Object.keys(codes).sort() }),
    };
  };

  // ---------- Notiz-Text ----------
  // „JJJJ-MM-TT Titel“ wie die bestehenden Termin-Notizen: „: “ wird „ – “ (UB-Kurs: Zotero → UB-Kurs – Zotero), andere
  // unzulässige Zeichen „-“ (WS 2026/27 → WS 2026-27), keine Punkte/Leerzeichen am Ende (Windows)
  const dateiName = (datum, titel) => `${datum} ${String(titel).replace(/\s*:\s+/g, " – ").replace(/[\\/:*?"<>|#^\[\]]/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "")}`;
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
  const EIGEN = ["typ", "titel", "datum", "bis", "kategorie", "status", "ort", "modul", "code", "bereich", "erledigt", "quelle", "info", "geprueft", "herkunft", "zentral_id", "entfaellt", "uebersicht", "cssclasses", "tags"];
  // Kleine Pille im Kopf der Notiz (und in Agenda/Kalender, termine.js/kalender.js): freiwillig, keine Pflicht
  const BEREICH_PILLE = { schluesselqualifikation: '<span class="eba-pill leer">Schlüsselqualifikation · freiwillig</span>' };
  // Inhalt einer zentralen Termin-Notiz. alt = bisheriger Text (oder ""), e = geprüfter Eintrag, o = { modulLink, entfaellt }
  const notizText = (alt, e, o) => {
    o = o || {};
    const { fm, body } = teilen(alt || "");
    const bl = bloecke(fm);
    const holB = (k) => bl.find((b) => b.key === k) || null;
    const titel = e.titel + (o.entfaellt ? ENTFAELLT : "");
    const ort = e.uhrzeit && e.ort.indexOf(e.uhrzeit) < 0 ? [e.uhrzeit, e.ort].filter(Boolean).join(" · ") : e.ort;
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
    zeilen.push("herkunft: zentral", "zentral_id: " + e.id);
    if (o.entfaellt) zeilen.push("entfaellt: true");
    zeilen.push('uebersicht: "[[Prüfungen]]"');
    Array.prototype.push.apply(zeilen, liste("cssclasses", ["eba-s-termin"]));
    Array.prototype.push.apply(zeilen, liste("tags", bereich ? ["termin", BEREICHE[bereich]] : ["termin"], BEREICH_TAGS));
    // eigene Felder der Nutzer (alles, was nicht uns gehört) unverändert dahinter
    for (const b of bl) if (b.key && EIGEN.indexOf(b.key) < 0) Array.prototype.push.apply(zeilen, b.zeilen);
    // Text: verwalteter Kopf, dann „## Meine Notizen“ und alles darunter unverändert
    const wann = e.bis ? `${dmy(e.datum)} – ${dmy(e.bis)}` : dmy(e.datum);
    // Pille in derselben Zeile wie das Datum (die Agenda überspringt diese Zeile in der Beschreibung)
    const kopf = [`# ${mdText(titel)}`, "", `**${wann}**` + (ort ? " · " + mdText(ort) : "") + (bereich ? " · " + BEREICH_PILLE[bereich] : ""), ""];
    if (e.info) kopf.push(mdText(e.info), "");
    if (o.entfaellt) kopf.push("> [!warning] Entfällt", "> Dieser Termin steht nicht mehr in den zentralen Daten. Deine Notizen unten bleiben.", "");
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
  const meineNotizen = (text) => { const i = String(text).search(/^## Meine Notizen[ \t]*$/m); return i < 0 ? "" : String(text).slice(i).replace(/^## Meine Notizen[ \t]*\r?\n?/, "").trim(); };
  // Notiz unberührt? (nicht erledigt, „Meine Notizen“ leer)
  const unberuehrt = (fm, text) => !(fm && fm.erledigt === true) && !meineNotizen(text);
  const eintragHash = (e) => { let h = 0; const s = JSON.stringify(e); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

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
  // Zentrale Notizen im Vault: zentral_id → Datei (bei Doppelten die erste nach Pfad; die anderen bleiben unangetastet)
  const zentraleNotizen = () => {
    const map = {};
    const dateien = app.vault.getMarkdownFiles().filter((f) => { const fm = fmVon(f); return fm && fm.herkunft === "zentral" && fm.zentral_id; })
      .sort((a, b) => a.path.localeCompare(b.path));
    for (const f of dateien) { const id = String(fmVon(f).zentral_id); if (!map[id]) map[id] = f; }
    return map;
  };
  const freierPfad = (basisName, eigene) => {
    let name = basisName, i = 2;
    while (datei(`${ORDNER}/${name}.md`) && datei(`${ORDNER}/${name}.md`) !== eigene) name = `${basisName} ${i++}`;
    return `${ORDNER}/${name}.md`;
  };
  const papierkorb = async (f) => {
    const system = !(plugin().testPapierkorbLokal || (app.vault.getConfig && app.vault.getConfig("trashOption") === "local"));
    await app.vault.trash(f, system); // nie endgültig löschen, auch wenn „Gelöschte Dateien: endgültig“ eingestellt ist
  };
  const modulLink = (F, code) => { const f = code && F.module[code]; return f ? `[[${f.basename}]]` : ""; };

  const termineAnwenden = async (T, ids, abruf, bericht) => {
    const F = filterBauen();
    const heute = heuteIso();
    const vorhanden = zentraleNotizen();
    const angewendet = Object.assign({}, abruf.angewendet || {});
    const imDatensatz = new Set(T.map((e) => e.id));
    // Schutz gegen kaputte Exporte: würde mehr als die Hälfte (und mehr als 10) wegfallen, nichts als entfallen behandeln
    const fehlend = Object.keys(vorhanden).filter((id) => !imDatensatz.has(id) && !ids.has(id));
    const wegfallSperre = fehlend.length > 10 && fehlend.length > Object.keys(vorhanden).length / 2;
    if (wegfallSperre) warnen(bericht, `${fehlend.length} Termine fehlen in den Daten – nicht als entfallen behandelt.`);
    if (!datei(ORDNER)) { try { await app.vault.createFolder(ORDNER); } catch (e) { /* da */ } }
    for (const e of T) {
      const f = vorhanden[e.id] || null;
      const h = eintragHash(e);
      if (!F.aufnehmen(e)) {
        // nicht (mehr) passend: unberührt → Papierkorb, sonst stehen lassen
        if (f) {
          const text = await app.vault.read(f);
          if (unberuehrt(fmVon(f), text)) { await papierkorb(f); bericht.papierkorb.push(f.path); }
        }
        delete angewendet[e.id];
        continue;
      }
      const soll = { modulLink: modulLink(F, e.code) };
      if (!f) {
        if (angewendet[e.id] === h) { bericht.ausgeblendet.push(e.id); continue; } // von dir gelöscht, Daten unverändert
        const pfad = freierPfad(dateiName(e.datum, e.titel), null);
        await app.vault.create(pfad, notizText("", e, soll));
        bericht.angelegt.push(pfad); bericht.geschrieben.push(pfad);
        angewendet[e.id] = h;
        continue;
      }
      const alt = await app.vault.read(f);
      const neu = notizText(alt, e, soll);
      if (neu !== alt) { await app.vault.modify(f, neu); bericht.aktualisiert.push(f.path); bericht.geschrieben.push(f.path); }
      // Datum geändert → umbenennen (Nutzerteile bleiben, Links zieht Obsidian nach)
      if (f.basename.slice(0, 10) !== e.datum) {
        const ziel = freierPfad(dateiName(e.datum, e.titel), f);
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
    return { angewendet, filter: F.schluessel };
  };

  // ---------- Status (gerätelokal) ----------
  const stand = () => Object.assign({ geprueft: "", fehler: "", fehlerZeit: "", pause: false, hinweis: "", plugin_aktuell: "", release: null, beta: null, hashes: {}, filter: "", abrufer: false }, lokal(L.stand) || {});
  const standSetzen = (aend) => lokal(L.stand, Object.assign(stand(), aend));
  const protokoll = ctx.bleibend("protokoll", () => []); // Läufe (für Tests), überlebt den Hot-Reload

  const neuerBericht = (art) => ({ art, geschrieben: [], angelegt: [], aktualisiert: [], umbenannt: [], entfaellt: [], papierkorb: [], ausgeblendet: [], verworfen: [], warnung: "", fehler: "" });
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
  const abrufenIntern = async (o) => {
    const b = neuerBericht("ok");
    const melden = (text) => { if (o.manuell) new Notice(text, 6000); };
    if (!eingeschaltet()) { b.art = "aus"; melden("Zentrale Daten sind ausgeschaltet."); return b; }
    if (!ctx.modell || !ctx.modell.daten) { b.art = "fehler"; b.fehler = "Datenmodell fehlt"; return b; }
    const fehler = (text) => { b.art = "fehler"; b.fehler = text; standSetzen({ fehler: text, fehlerZeit: new Date().toISOString() }); melden("Zentrale Daten: " + text); return b; };
    const ich = geraetId();
    const S0 = stand();
    if (o.nurCache && S0.pause) { b.art = "pausiert"; return b; }
    let manifest = null;
    if (!o.nurCache) {
      // 1. Manifest
      let roh;
      try { roh = await holen("manifest.json"); } catch (e) { return fehler("keine Verbindung (" + ((e && e.message) || e) + ")"); }
      if (roh.bytes.length > G.manifest) return fehler("Manifest zu groß");
      let m;
      try { m = JSON.parse(roh.text); } catch (e) { return fehler("Manifest unlesbar"); }
      const mp = manifestPruefen(m);
      if (mp.fehler) return fehler(mp.fehler);
      manifest = mp.wert;
      standSetzen({ geprueft: new Date().toISOString(), hinweis: manifest.hinweis, plugin_aktuell: manifest.plugin_aktuell, release: manifest.release, beta: manifest.beta, pause: manifest.pause });
      if (manifest.pause) { b.art = "pausiert"; standSetzen({ fehler: "" }); melden("Zentrale Daten sind gerade pausiert. Dein letzter Stand bleibt."); return b; }
    }
    // 1b. Gruppen (gruppen.json): jedes Gerät selbst, nur gerätelokal. Ein Fehler hält nur die Gruppen an (ihr letzter
    // Stand bleibt), nie Termine und Semesterdaten – wie beim Export (docs/daten-v1.md).
    if (manifest && manifest.dateien[GRUPPEN]) {
      const g = await gruppenHolen(manifest.dateien[GRUPPEN], o.manuell);
      if (g.fehler) warnen(b, "Gruppen: " + g.fehler);
      if (g.verworfen) b.verworfen = b.verworfen.concat(g.verworfen);
    }
    // 2. Abrufer-Sperre
    const a = await abrufLesen();
    const frisch = a && alterMs(a.zuletzt) <= UEBERNAHME;
    if (a && a.geraet !== ich && frisch) {
      b.art = "anderes-geraet"; standSetzen({ fehler: "", abrufer: false });
      melden("Zentrale Daten: Ein anderes Gerät aktualisiert gerade. Deine Notizen kommen per Sync.");
      return b;
    }
    if (o.nurCache && (!a || a.geraet !== ich)) { b.art = "anderes-geraet"; return b; }
    const abruf = a && a.geraet === ich ? a : { geraet: ich, seit: new Date().toISOString(), zuletzt: "", angewendet: (a && a.angewendet) || {} };
    // 3. Dateien (nur bei geänderter Prüfsumme; im nurCache-Lauf gar nicht)
    const cache = lokal(L.daten) || {};
    const neu = {};
    const hashes = Object.assign({}, S0.hashes);
    if (manifest) {
      for (const name of Object.keys(manifest.dateien)) {
        if (name === GRUPPEN) continue; // oben schon geholt (gerätelokal)
        const soll = manifest.dateien[name];
        if (!o.manuell && S0.hashes[name] === soll.sha256 && cache[name]) continue;
        let r;
        try { r = await holen(name); } catch (e) { return fehler("keine Verbindung (" + ((e && e.message) || e) + ")"); }
        if (r.bytes.length !== soll.groesse || (await sha256(r.bytes)) !== soll.sha256) return fehler("Prüfsumme von " + name + " stimmt nicht – nichts übernommen");
        let d;
        try { d = JSON.parse(r.text); } catch (e) { return fehler(name + " unlesbar"); }
        neu[name] = { d, sha: soll.sha256 };
      }
    }
    // Prüfen (erst alles, dann schreiben)
    let T = null, ids = new Set(), S = null;
    const tRoh = neu["termine.json"] ? neu["termine.json"].d : cache["termine.json"];
    if (tRoh) {
      const tp = terminePruefen(tRoh);
      if (tp.fehler) return fehler(tp.fehler);
      T = tp.termine; ids = tp.ids; b.verworfen = b.verworfen.concat(tp.verworfen);
    }
    const sRoh = neu["semester.json"] ? neu["semester.json"].d : cache["semester.json"];
    if (sRoh) {
      const sp = semesterPruefen(sRoh);
      if (sp.fehler) return fehler(sp.fehler);
      S = sp.wert;
      if (sp.verworfen.length) b.verworfen = b.verworfen.concat(sp.verworfen.map((x) => ({ id: "semester", grund: x })));
    }
    const filter = filterBauen().schluessel;
    const anwenden = o.manuell || o.nurCache || Object.keys(neu).length > 0 || filter !== S0.filter || !S0.abrufer || !a || a.geraet !== ich;
    if (o.nurCache && filter === S0.filter) { b.art = "unveraendert"; return b; }
    // abruf.json: bei Wechsel des Abrufers oder spätestens nach PULS (nicht bei jedem Lauf schreiben)
    let abrufNoetig = !a || a.geraet !== ich || alterMs(a.zuletzt) >= PULS;
    if (anwenden) {
      if (T) {
        const r = await termineAnwenden(T, ids, abruf, b);
        if (JSON.stringify(r.angewendet) !== JSON.stringify(abruf.angewendet || {})) { abruf.angewendet = r.angewendet; abrufNoetig = true; }
      }
      if (S) await semesterSchreiben(S, b);
    } else b.art = "unveraendert";
    if (abrufNoetig) { abruf.zuletzt = new Date().toISOString(); await abrufSchreiben(abruf, b); }
    // Stand merken (Prüfsummen nur, wenn übernommen)
    for (const name of Object.keys(neu)) { hashes[name] = neu[name].sha; cache[name] = neu[name].d; }
    lokal(L.daten, cache);
    standSetzen({ hashes, filter, abrufer: true, fehler: "", fehlerZeit: "" });
    if (b.art === "ok" && !b.geschrieben.length) b.art = "unveraendert";
    if (o.manuell) {
      const n = b.angelegt.length + b.aktualisiert.length + b.entfaellt.length + b.papierkorb.length;
      melden((n ? `Zentrale Daten aktualisiert: ${n} ${n === 1 ? "Termin" : "Termine"} geändert.` : "Zentrale Daten: alles aktuell.") + (b.warnung ? " " + b.warnung : ""));
    }
    return b;
  };

  // ---------- Gruppen holen (gerätelokal) ----------
  // soll = { sha256, groesse } aus dem Manifest. Unveränderte Prüfsumme und vorhandener Stand → nichts holen (außer manuell).
  // → {} | { verworfen: [...] } | { fehler }
  const gruppenStand = () => { const g = lokal(L.gruppen); return g && typeof g === "object" && Array.isArray(g.gruppen) ? g : null; };
  const gruppenHolen = async (soll, manuell) => {
    const alt = gruppenStand();
    if (!manuell && alt && alt.sha256 === soll.sha256) return {};
    let r;
    try { r = await holen(GRUPPEN); } catch (e) { return { fehler: "keine Verbindung (" + ((e && e.message) || e) + ")" }; }
    if (r.bytes.length !== soll.groesse || (await sha256(r.bytes)) !== soll.sha256) return { fehler: "Prüfsumme von " + GRUPPEN + " stimmt nicht – nichts übernommen" };
    let d;
    try { d = JSON.parse(r.text); } catch (e) { return { fehler: GRUPPEN + " unlesbar" }; }
    const p = gruppenPruefen(d);
    if (p.fehler) return { fehler: p.fehler };
    lokal(L.gruppen, { sha256: soll.sha256, geholt: new Date().toISOString(), stand: p.stand, gruppen: p.gruppen });
    if (!alt || alt.sha256 !== soll.sha256) gruppenNeuZeichnen();
    return { verworfen: p.verworfen.map((x) => ({ id: "gruppe " + x.id, grund: x.grund })) };
  };
  // gruppen.js meldet sich als ctx.gruppenAnzeige an (lädt vor diesem Skript, darum kein Abonnement)
  const gruppenNeuZeichnen = () => { try { if (ctx.gruppenAnzeige && ctx.gruppenAnzeige.neu) ctx.gruppenAnzeige.neu(); } catch (e) { /* egal */ } };

  // ---------- Anzeige (für eba-verbindungen) ----------
  const vorText = (iso) => {
    const ms = alterMs(iso);
    if (!isFinite(ms)) return "";
    const min = Math.max(0, Math.round(ms / MIN));
    if (min < 1) return "gerade eben";
    if (min < 60) return `vor ${min} Min.`;
    const h = Math.round(min / 60);
    if (h < 48) return `vor ${h} Std.`;
    return `vor ${Math.round(h / 24)} Tagen`;
  };
  const status = () => {
    const s = stand(), aus = !eingeschaltet();
    const version = (ctx.plugin && ctx.plugin.manifest && ctx.plugin.manifest.version) || "0.0.0";
    return {
      an: !aus, verbunden: !aus, pause: !!s.pause, fehler: s.fehler, geprueft: s.geprueft, hinweis: s.hinweis,
      neueVersion: neuer(s.plugin_aktuell, version) ? s.plugin_aktuell : "", releases: RELEASES,
      veranstaltungen: veranstaltungenZeigen(), abrufer: !!s.abrufer,
    };
  };
  // { text, pille } für die Zeile „Zentrale Daten“; HTML (Text maskiert)
  const anzeige = () => {
    const s = status();
    let text, pille;
    if (!s.an) { text = "Ausgeschaltet. Termine für alle kommen nicht mehr an."; pille = `<span class="eba-pill leer">aus</span>`; }
    else if (s.pause) { text = "Pausiert. Dein letzter Stand bleibt."; pille = `<span class="eba-pill info">pausiert</span>`; }
    else if (s.fehler) { text = "Fehler beim letzten Abruf." + (s.geprueft ? ` Zuletzt aktualisiert ${vorText(s.geprueft)}.` : ""); pille = `<span class="eba-pill warn">Fehler</span>`; }
    else if (s.geprueft) { text = `Aktualisiert ${vorText(s.geprueft)}.`; pille = `<span class="eba-pill ok">an</span>`; }
    else { text = "Noch nicht abgerufen."; pille = `<span class="eba-pill ok">an</span>`; }
    let html = esc(text.replace(/\.\./g, ".")); // „vor 17 Min.“ + Satzpunkt: nur ein Punkt
    if (s.an && s.hinweis) html += " " + esc(s.hinweis);
    // Mit update.js (seit 0.2.0) steht die neue Version in der eigenen Zeile „Studium Autopilot“ mit Knopf
    if (s.neueVersion && !ctx.update) html += ` <a class="eba-vb-neu external-link" href="${esc(RELEASES)}" target="_blank" rel="noopener">Neue Version verfügbar</a>`;
    return { html, pille, an: s.an, veranstaltungen: s.veranstaltungen };
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
    standSetzen({ plugin_aktuell: mp.wert.plugin_aktuell, release: mp.wert.release, beta: mp.wert.beta });
    return mp.wert;
  };
  const neuZeichnen = () => { try { if (ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen(); } catch (e) { /* egal */ } };

  // ---------- Schalter (System/Einstellungen.md, für alle Geräte gleich) ----------
  const schalten = async (feld, wert) => {
    const f = datei(EINSTELLUNGEN);
    if (!f) return;
    await app.fileManager.processFrontMatter(f, (x) => { x[feld] = wert; });
  };

  // ---------- Erweiterung ----------
  const AKTIONEN = {
    "zentral-aktualisieren": {
      titel: "Zentrale Daten jetzt aktualisieren",
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
          new Notice(neu ? "Fachschaft und Veranstaltungen werden wieder gezeigt." : "Fachschaft und Veranstaltungen ausgeblendet.", 4000);
        } else {
          const neu = fest !== null ? fest : !eingeschaltet();
          await schalten("zentrale_daten", neu);
          new Notice(neu ? "Zentrale Daten eingeschaltet." : "Zentrale Daten ausgeschaltet. Vorhandene Termine bleiben.", 4000);
          if (neu && !plugin().testZentralAus) ctx.zeit(() => abrufen({}), 1500);
        }
        neuZeichnen();
      },
    },
  };

  ctx.zentral = {
    abrufen, status, anzeige, stand, geraetId, idAusName, notizText, dateiName, terminePruefen, semesterPruefen, manifestPruefen, gruppenPruefen,
    // gerätelokaler Stand der Gruppen (gruppen.js): { stand, geholt, gruppen } oder null (noch nie geholt)
    gruppen: () => { const g = gruppenStand(); return g ? { stand: String(g.stand || ""), geholt: String(g.geholt || ""), gruppen: g.gruppen } : null; },
    semKanon, sha256, protokoll, filterBauen, manifestHolen, releasePruefen, semver, neuer, RELEASE_ROH, modulLinkFuer: (code) => modulLink(filterBauen(), code), BASIS, RELEASES, ABRUF, MEINE,
    get laeuft() { return !!laeuft; },
  };

  const registrieren = () => {
    // Automatischer Abruf: nach dem Einlesen 20 s + Zufallsversatz 0–2 Min., dann stündlich (solange Obsidian offen ist)
    let versucht = 0;
    const lauf = () => { if (!plugin().testZentralAus && eingeschaltet()) { versucht = Date.now(); abrufen({}); } };
    const planen = () => ctx.zeit(() => { lauf(); ctx.intervall(lauf, STUNDE); }, 20000 + Math.floor(Math.random() * 2 * MIN));
    // Zurück in der App (iPhone/iPad holen Obsidian aus dem Hintergrund, ohne neu zu starten): nachholen, wenn lange her
    ctx.dom(document, "visibilitychange", () => {
      if (document.visibilityState === "visible" && versucht && Date.now() - versucht > 30 * MIN && !laeuft) ctx.zeit(lauf, 5000);
    });
    if (app.metadataCache.initialized || app.metadataCache.resolved) planen();
    else { const r = ctx.an(app.metadataCache, "resolved", () => { app.metadataCache.offref(r); planen(); }); }
    // Filter geändert (Variante, Plan, Schalter)? Dann aus dem letzten Stand neu anwenden – nur auf dem Abrufer-Gerät, ohne Netz
    const pruefen = ctx.entprellen(() => {
      if (plugin().testZentralAus || laeuft || !eingeschaltet() || !stand().abrufer || !ctx.modell) return;
      try { if (filterBauen().schluessel !== stand().filter) abrufen({ nurCache: true }); } catch (e) { console.error("zentral: Filter", e); }
    }, 5000);
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(pruefen));
  };

  return { registrieren, aktionen: AKTIONEN };
};
