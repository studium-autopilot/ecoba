// ILIAS-Kalender (seit 18.10.2026): Die Abgabetermine deiner Übungen aus dem Kalender-Abo von ILIAS stehen als Fristen unter
// Termine/. Quelle nach dem Quellen-Vertrag (quellen.js; docs/architektur/ilias-kalender.md und „Quellen-Vertrag“).
//
// Verbinden wie bei Alma: In ILIAS Persönlicher Arbeitsraum → Kalender → Abonnieren, den Link unter „iCal-URL“ kopieren. Der Link
//   enthält einen geheimen Schlüssel (wer ihn hat, sieht deinen Kalender). Er liegt NUR im gerätelokalen Speicher von Obsidian
//   (app.saveLocalStorage, eba-ilias-ics), nie in einer Datei des Tresors, nie in Status, Fehlertexten, Hinweisen oder Konsole.
//   Scheitert der erste Abruf, bleibt der vorherige Zustand (kein Link gespeichert).
// Was übernommen wird: nur Abgaben und Feedback-Fristen von Übungen (Adresse goto.php/exc/<ref>, Titel endet auf „(Abgabetermin)“
//   bzw. „(Deadline)“, „(Feedback geben bis)“ bzw. „(Feedback Deadline)“). Sitzungen (Stundenplan kommt zentral, aus Alma oder
//   von Hand), Beginn und Ende von Kursen (Titel können das Beitrittspasswort enthalten) und Anmeldefenster von Gruppen (stehen
//   zentral) fallen weg und werden nur gezählt. Tests legt ILIAS nie in den Kalender, darum entsteht hieraus nie eine Prüfung.
// Titel: nie der Titel aus ILIAS und nie ein Kurstitel, nur Modulcode, Art und Nummer („B110 Abgabe 3“, ohne Code „Abgabe 3 in
//   ILIAS“). Der Aufgabentitel dient nur zum Erkennen (Nummer, Code, Schlüssel) und wird vorher von Kurspasswörtern befreit
//   (ctx.ilias.ohneKennwort). Code: aus dem Index der ILIAS-Unterlagen (System/Daten/ilias.json, „objekte“: in welchem Kurs ilias.js
//   die Übung sah), sonst ein Code im Aufgabentitel, sonst keiner.
// Schlüssel (ilias_kalender_id): exc/<ref der Übung>/<abgabe|feedback>/<8 Zeichen SHA-256 des gesäuberten Aufgabentitels>, nie die
//   UID des Kalenders (ILIAS legt beim Ändern einer Aufgabe neue Einträge an). Zwei Aufgaben mit gleichem Titel in einer Übung:
//   nach Datum „#2“, „#3“. Verschwindet ein Schlüssel und kommt im selben Lauf ein neuer mit gleicher Übung, Art und gleichem
//   Datum, ist das dieselbe Abgabe mit neuem Titel (Haken und Text bleiben). Ändern sich Titel und Datum zugleich, entsteht
//   „(entfällt)“ bzw. Papierkorb und eine neue Notiz.
// Zeit: nur TZID=Europe/Berlin und UTC („Z“), andere Zeitzonen werden ausgelassen (Warnung). Eine Abgabe um 00:00 steht am Vortag
//   „bis 23:59 Uhr“ (seit 0.7.0 wie in den zentralen Daten; bis 0.6.14 „bis 24:00 Uhr“). Intern bleibt sie 24:00: Die Uhrzeit
//   steckt in den Grabsteinen gelöschter Abgaben, eine andere ließe sie wiederkommen.
// Notiz: dieselbe Form wie zentrale Termine (ctx.zentral.notizText mit herkunft: ilias-kalender, ilias_kalender_id), kategorie
//   Frist, ort „bis 23:55 Uhr · ILIAS“, quelle = Adresse der Übung (ohne Schlüssel), Datei „Termine/JJJJ-MM-TT <Code> Abgabe in
//   ILIAS.md“ bzw. „… Feedback in ILIAS.md“ (neues Datum, neuer Code oder neue Art → umbenannt; einen eigenen Namen benennt nur
//   ein neues Datum um). „erledigt“, „## Meine Notizen“ und eigene Felder bleiben bei jedem Schreiben.
// Keine Doppel: Steht am selben Tag mit demselben Code schon eine Frist zu einer Abgabe (zentral, eigener Uni-Abgleich, von Hand)
//   oder ein Übungsblatt mit Fälligkeit (ctx.modell.termine/abgaben), entsteht keine Notiz; eine unberührte wandert in den
//   Papierkorb (kommt wieder, wenn die andere verschwindet), eine mit deinem Text bleibt.
// Lebenslauf (Quellen-Vertrag): von dir gelöscht → Grabstein „angewendet“ in der Sperr-Datei (kommt erst wieder, wenn sich Datum,
//   Uhrzeit oder Art ändern; nicht der Code, der kommt oft erst mit dem ersten Durchsuchen der Unterlagen; ältere Grabsteine mit
//   Code gelten weiter, geloeschtVon); in ILIAS weg → nur künftige Abgaben (ILIAS lässt Altes weg): unberührt in den Papierkorb, sonst
//   „(entfällt)“; nichts entfernt, wenn der Kalender unvollständig ankam (kein END:VCALENDAR oder ab 900 KB; ILIAS bricht bei 1 MB
//   ab), keine einzige Abgabe kam, obwohl 3 oder mehr künftige bekannt sind, oder mehr als die Hälfte (und mehr als 2) fehlen.
//   Doppel einer id führt der Schreiber zusammen (Q.dubletten). Keine neue Notiz für Abgaben, die schon vorbei sind.
// Ein Schreiber: Abrufer-Sperre System/Daten/ilias-kalender-abruf.json (sperre.js), darin auch „angewendet“. Der Zeitplan wartet,
//   solange ein anderes Gerät schreibt; ein Knopf übernimmt (Hier aktualisieren). Zeitplan (Q.planen): 20 s bis 2 Min. nach dem
//   Einlesen, dann alle 2 Std.; nach Fehlern nach 15, 30, 60 Min.; zurück in der App nach über 2 Std. Nur mit Link auf diesem
//   Gerät und nie, wenn die Abgaben von außen kommen (eba.quelleExtern("ilias-kalender"), bei jedem Lauf gefragt).
// Status gerätelokal (eba-ilias-ics-status) in der gemeinsamen Form; ein Fehler bleibt stehen, bis ein Abruf klappt. Ein Link, den
//   ILIAS nicht mehr kennt, steht unter „Bitte prüfen“ (Meldekanal).
// Uni-Login (seit 0.4.8, uni-login.js): Mit deinem Uni-Login holt Studium Autopilot den Link selbst aus ILIAS (linkWaehlen nimmt
//   „iCal-URL (Google Kalender)“); kennt ILIAS einen gespeicherten Link nicht mehr, holt es höchstens einmal am Tag einen neuen
//   und versucht es gleich damit (ablauf, erneuert). Ein Link, den du selbst eingibst, wird dabei nie ersetzt, solange er geht.
// Für andere Skripte: ctx.iliasKalender = { status(), linkPruefen(link), linkWaehlen(links), verbinden(link, { nurBeiErfolg }), aktualisieren(o),
//   trennen(), fehler(), hinweise(), K } und die reinen Teile für Tests. Testeinstiege: plugin.testIliasKalenderAus (kein
//   automatischer Lauf), plugin.testKalenderAbruf({ url }) → { status, text } (kein Netz), aktualisieren({ text, vollstaendig }).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone. Web Crypto für SHA-256.
const MIN = 60e3, STUNDE = 60 * MIN;
const K = Object.freeze({
  QUELLE: "ilias-kalender", ID_FELD: "ilias_kalender_id",
  HOST: "ovidius.uni-tuebingen.de", ILIAS: "https://ovidius.uni-tuebingen.de/",
  ORDNER: "Termine", INDEX: "System/Daten/ilias.json",
  LINK: "eba-ilias-ics", STATUS: "eba-ilias-ics-status", SEIT: "eba-ilias-ics-seit",
  TAKT: 2 * STUNDE, ZURUECK: 2 * STUNDE, BACKOFF: [15 * MIN, 30 * MIN, 60 * MIN], START: [20e3, 100e3],
  GROSS: 900 * 1024,          // ab so vielen Bytes gilt der Kalender als womöglich abgeschnitten
  BEKANNT_MIN: 3,             // so viele künftige Abgaben bekannt und keine kam: nichts entfernen
  WEG_MIN: 2,                 // Massenschutz: mehr als so viele und mehr als die Hälfte fehlen → nichts entfernen
  INFO: "Gilt der allgemeine Termin; einen persönlichen Termin zeigt nur ILIAS.",
  WEG: "im ILIAS-Kalender",
  EXTERN: "Deine Abgaben aus ILIAS kommen über deinen Uni-Abgleich.",
  ZIEL: { pfad: "Studium/Einstellungen & Hilfe.md", anker: "Verbindungen" },
});

// ---------- Reine Teile (ohne Obsidian, getestet in tests/ilias-kalender.test.js) ----------
const text = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const s10 = (v) => String(v == null ? "" : v).slice(0, 10);

// Link prüfen: "" = in Ordnung, sonst ein Satz (nie mit dem Link selbst). Abo-Links von ILIAS: https://<Host>/calendar.php?
// client_id=…&token=…[&limited=0|1]; webcal:// ist dieselbe Adresse.
const linkPruefen = (s) => {
  const v = String(s == null ? "" : s).trim();
  if (!v) return "Bitte zuerst den Link aus ILIAS einfügen.";
  if (/\s/.test(v)) return "Im Link sind Leerzeichen. Bitte den Link neu kopieren und einfügen.";
  if (!/^(https|webcal):\/\//i.test(v)) return "Der Link ist unvollständig. Bitte den ganzen Link einfügen (beginnt mit https://).";
  // Host genau so im Text, direkt gefolgt von „/“: Bei „\“ oder „@“ davor lesen URL-Parser verschiedene Hosts (der Link geht roh an
  // requestUrl, mit deinem Schlüssel)
  if (/\\/.test(v) || v.replace(/^webcal:/i, "https:").toLowerCase().indexOf("https://" + K.HOST + "/") !== 0) return "Das ist kein Link aus ILIAS. Bitte den Link unter „iCal-URL“ kopieren.";
  let u = null;
  try { u = new URL(v.replace(/^webcal:/i, "https:")); } catch (e) { u = null; }
  if (!u || u.hostname.toLowerCase() !== K.HOST || u.port || u.username || u.password) return "Das ist kein Link aus ILIAS. Bitte den Link unter „iCal-URL“ kopieren.";
  if (!/\/calendar\.php$/i.test(u.pathname) || !u.searchParams.get("client_id") || !u.searchParams.get("token")) return "Das ist nicht der Link zum Kalender. Bitte den Link unter „iCal-URL“ kopieren.";
  return "";
};
const linkAdresse = (s) => String(s == null ? "" : s).trim().replace(/^webcal:/i, "https:");
// Uni-Login (uni-login.js): aus den Links im Fenster „Kalender abonnieren“ ([{ url, begrenzt }], ilias-html.js aboLinks) den,
// der für Abgaben reicht und klein bleibt: „iCal-URL (Google Kalender)“ (limited=1, ohne Termine, die älter als 30 Tage sind;
// ILIAS bricht ab 1 MB ab), sonst „iCal-URL“. Nur Links, die linkPruefen besteht. → Link | ""
const linkWaehlen = (links) => {
  const gut = (Array.isArray(links) ? links : []).filter((l) => l && typeof l.url === "string" && !linkPruefen(l.url));
  const w = gut.filter((l) => l.begrenzt)[0] || gut[0];
  return w ? w.url : "";
};

// Zusatz am Titelende → { art: "abgabe" | "feedback" | "", titel (ohne Zusatz) }. ILIAS: Titel der Aufgabe + „ (Abgabetermin)“,
// englisch „ (Deadline)“; Peer-Feedback „ (Feedback geben bis)“ bzw. „ (Feedback Deadline)“.
const ZUSATZ = /\s*\(([^()]*)\)\s*$/;
const artAus = (summary) => {
  const t = text(summary), m = t.match(ZUSATZ);
  if (!m) return { art: "", titel: t };
  const z = m[1].trim().toLowerCase();
  const art = /feedback/.test(z) ? "feedback" : /^(abgabetermin|abgabe|abgabefrist|deadline|submission deadline)$/.test(z) ? "abgabe" : "";
  return { art, titel: t.slice(0, m.index).trim() };
};

// Adresse eines Eintrags → { typ, ref }: ILIAS 10 „…/goto.php/exc/123“, ältere „goto.php?target=exc_123“ bzw. „goto_<client>_exc_123.html“
const zielAus = (url) => {
  const u = String(url == null ? "" : url).trim();
  const m = u.match(/\/goto\.php\/([a-z]+)\/(\d+)(?:[/?#]|$)/i) || u.match(/[?&]target=([a-z]+)_(\d+)(?:[_&#]|$)/i)
    || u.match(/\/goto_[^/]+?_([a-z]+)_(\d+)(?:_[a-z]+)?\.html/i);
  return m ? { typ: m[1].toLowerCase(), ref: m[2] } : { typ: "", ref: "" };
};

// Zeitpunkt eines Eintrags (zeit = alma.js zeit: iCalendar-Zeit → { datum, uhr } in Tübinger Ortszeit) → { datum, uhr } oder
// { fehlt: "zeitzone" | "zeit" }. Nur TZID=Europe/Berlin und UTC; ganztägige Einträge und Zeiten ohne Zone fallen weg.
const zeitpunktAus = (e, zeit) => {
  const feld = e.DTSTART ? "DTSTART" : e.DTEND ? "DTEND" : "";
  if (!feld) return { fehlt: "zeit" };
  const wert = String(e[feld]).trim(), p = String((e.PARAM && e.PARAM[feld]) || "");
  if (!/T\d{4}/.test(wert)) return { fehlt: "zeit" };
  const tz = ((p.match(/(?:^|;)TZID=("?)([^";]+)\1/i) || [])[2] || "").replace(/^\//, "").toLowerCase();
  if (!/Z$/.test(wert) && tz !== "europe/berlin") return { fehlt: "zeitzone" };
  const z = zeit(wert);
  return z && z.uhr ? { datum: z.datum, uhr: z.uhr } : { fehlt: "zeit" };
};
// Abgabe um 00:00 → am Vortag 24:00 (angezeigt 23:59, uhrText)
const tagVorher = (iso) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const frist = (z) => (z.uhr === "00:00" ? { datum: tagVorher(z.datum), uhr: "24:00" } : z);

// Nummer des Blatts aus dem Aufgabentitel (1–30): „Übungsblatt 3“, „Blatt 03“, „Aufgabe 2“, „Assignment 4“, „3. Übungsblatt“
const NUMMER = [
  /(?:übungs|uebungs|aufgaben)?(?:blatt|zettel)\s*(?:nr\.?\s*|no\.?\s*|#\s*)?(\d{1,2})(?!\d)/i,
  /(?:hausaufgabe|aufgabe|übung|uebung|assignment|sheet|exercise|homework|abgabe)\s*(?:nr\.?\s*|no\.?\s*|#\s*)?(\d{1,2})(?!\d)/i,
  /(?:^|\s)(\d{1,2})\.\s*(?:übungs|uebungs)?(?:blatt|zettel|übung|uebung|aufgabe|hausaufgabe|abgabe)/i,
];
const nummerAus = (titel) => {
  for (const r of NUMMER) { const m = String(titel || "").match(r); if (m) { const n = Number(m[1]); if (n >= 1 && n <= 30) return n; } }
  return 0;
};

// 8 Zeichen SHA-256 (hex) eines Texts
const sha8 = async (s) => {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
  let h = "";
  for (let i = 0; i < 4; i++) h += b[i].toString(16).padStart(2, "0");
  return h;
};

// Ereignisse (alma.js lesen) → { abgaben: [{ schluessel, ref, art, code, nummer, datum, uhr, tag }], zaehler }.
// h = { zeit, klartext, ohneKennwort?, codeVon(ref)?, codeImText? }; tag = Datum in ILIAS (vor der 24:00-Regel).
const eintraegeAus = async (events, h) => {
  const z = { abgaben: 0, sitzungen: 0, kurse: 0, gruppen: 0, andere: 0, zeitzone: 0 };
  const roh = [];
  for (const e of events || []) {
    if (/CANCELLED/i.test(e.STATUS || "")) continue;
    const ziel = zielAus(h.klartext(e.URL));
    if (ziel.typ === "sess") { z.sitzungen++; continue; }
    if (ziel.typ === "crs") { z.kurse++; continue; }
    if (ziel.typ === "grp") { z.gruppen++; continue; }
    const a = artAus(h.klartext(e.SUMMARY));
    if (ziel.typ !== "exc" || !a.art) { z.andere++; continue; }
    const t = zeitpunktAus(e, h.zeit);
    if (t.fehlt) { z[t.fehlt === "zeitzone" ? "zeitzone" : "andere"]++; continue; }
    const f = frist(t);
    const titel = text(h.ohneKennwort ? h.ohneKennwort(a.titel) : a.titel);
    const code = String((h.codeVon && h.codeVon(ziel.ref)) || (h.codeImText && h.codeImText(titel)) || "");
    roh.push({ ref: ziel.ref, art: a.art, code, nummer: nummerAus(titel), datum: f.datum, uhr: f.uhr, tag: t.datum, hash: await sha8(titel.toLowerCase()) });
  }
  roh.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.uhr < b.uhr ? -1 : a.uhr > b.uhr ? 1 : 0));
  const zahl = {};
  for (const x of roh) {
    const basis = `exc/${x.ref}/${x.art}/${x.hash}`;
    zahl[basis] = (zahl[basis] || 0) + 1;
    x.schluessel = zahl[basis] > 1 ? `${basis}#${zahl[basis]}` : basis;
    delete x.hash;
  }
  z.abgaben = roh.length;
  return { abgaben: roh, zaehler: z };
};

// Titel und Dateiname einer Abgabe: nur Code, Art und Nummer
const artWort = (x) => (x.art === "feedback" ? "Feedback" : "Abgabe");
const titelVon = (x) => [x.code, artWort(x), x.nummer ? String(x.nummer) : ""].filter(Boolean).join(" ") + (x.code ? "" : " in ILIAS");
const dateiNameVon = (x) => `${x.datum} ${x.code ? x.code + " " : ""}${artWort(x)} in ILIAS`;
const uhrText = (uhr) => (uhr === "24:00" ? "23:59" : uhr);
// Eintrag in der Form der zentralen Termine (ctx.zentral.notizText)
const eintragVon = (x) => ({
  id: x.schluessel, titel: titelVon(x), datum: x.datum, bis: "", uhrzeit: "", ort: `bis ${uhrText(x.uhr)} Uhr · ILIAS`, kategorie: "Frist",
  status: "offiziell", code: x.code, quelle_url: `${K.ILIAS}goto.php/exc/${x.ref}`, quelle_text: "", info: K.INFO, geprueft: "",
});

// Steht dieselbe Abgabe schon da? termine = ctx.modell.termine() ohne Notizen dieser Quelle, blaetter = ctx.modell.abgaben():
// gleicher Code, gleicher Tag (auch der Tag in ILIAS vor der 24:00-Regel), eine Frist zu einer Abgabe oder ein Übungsblatt.
const ABGABE_WORT = /abgabe|blatt|hausaufgabe|assignment|deadline|einreich|feedback/i;
const schonDa = (x, termine, blaetter) => {
  if (!x.code) return false;
  const tag = (d) => d === x.datum || d === x.tag;
  return (termine || []).some((t) => t.code === x.code && t.kategorie === "Frist" && (tag(t.datum) || tag(t.ende)) && ABGABE_WORT.test(String(t.titel || "")))
    || (blaetter || []).some((u) => u.code === x.code && tag(u.datum));
};

// ---------- Obsidian ----------
const LAUF = { p: null }; // laufender Abruf, geteilt von allen Aufrufern dieser Fassung (Zeitplan, Knöpfe, Verbindungen)
module.exports = function (ctx) {
  const app = window.app;
  const Q = () => (ctx.user && ctx.user.quellen) || null;
  const S = () => (ctx.user && ctx.user.sperre) || null;
  const plugin = () => ctx.plugin || {};
  // Uni-Login (uni-login.js, Bibliothek): neuen Link holen, wenn ILIAS den alten nicht mehr kennt
  const uni = () => { const f = ctx.user && ctx.user["uni-login"]; try { return typeof f === "function" ? f(ctx) : null; } catch (e) { return null; } };
  const jetzt = () => (ctx.date && ctx.date.jetzt ? ctx.date.jetzt() : new Date());
  const heute = () => ctx.date.now("YYYY-MM-DD");
  const fmVon = (f) => { const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || null; };
  const datei = (p) => { const f = app.vault.getAbstractFileByPath(p); return f && !f.children ? f : null; };
  const einstellungen = () => fmVon(datei("System/Einstellungen.md")) || {};
  // Abgaben von außen (eigener Uni-Abgleich oder Server): bei jedem Lauf gefragt
  // (quellen.js extern: dieselbe Regel auch mit eba.js einer älteren Fassung auf diesem Gerät)
  const extern = () => {
    try {
      const eba = ctx.user && ctx.user.eba, q = Q(), existiert = (p) => !!app.vault.getAbstractFileByPath(p);
      if (q && q.extern) return q.extern(eba, K.QUELLE, existiert, einstellungen());
      return !!(eba && eba.quelleExtern && eba.quelleExtern(K.QUELLE, existiert, einstellungen()));
    } catch (e) { return false; }
  };

  // ---------- Link und Status (gerätelokal) ----------
  const link = () => app.loadLocalStorage(K.LINK) || "";
  const hatLink = () => !!link();
  const lstatus = () => { const s = app.loadLocalStorage(K.STATUS); return Object.assign({ geprueft: "", versucht: "", fehler: "", fehlerZeit: "", warnungen: [], fehlerSerie: 0, anderes: "", linkFehler: false }, s && typeof s === "object" ? s : {}); };
  const lstatusSetzen = (x) => app.saveLocalStorage(K.STATUS, Object.assign(lstatus(), x));
  // Nach einem Lauf: e = { ok: true, warnungen } | { ok: false, fehler, linkFehler }
  const nachLauf = (e) => {
    const neu = Q().nachLauf(lstatus(), e, jetzt().toISOString());
    app.saveLocalStorage(K.STATUS, Object.assign(neu, { anderes: "", linkFehler: !e.ok && !!e.linkFehler }));
  };

  // ---------- Tresor ----------
  const textLesen = async (p) => { const f = datei(p); return f ? app.vault.read(f) : null; };
  const textSchreiben = async (p, t) => {
    const f = datei(p);
    if (f) { if ((await app.vault.read(f)) !== t) await app.vault.modify(f, t); return; }
    await app.vault.create(p, t);
  };
  const geraetId = () => (ctx.zentral && ctx.zentral.geraetId ? ctx.zentral.geraetId() : String(app.loadLocalStorage("eba-geraet") || "g-ohne-id"));
  const sperre = () => S().erzeugen({ io: { lesen: textLesen, schreiben: textSchreiben }, quelle: K.QUELLE, geraetId, jetzt,
    mobil: !!(ctx.obsidian.Platform && ctx.obsidian.Platform.isMobile) });
  const SPERRE = () => S().pfadVon(K.QUELLE);
  const sperrDatei = async () => { try { const o = JSON.parse((await textLesen(SPERRE())) || "null"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
  const angewendetSchreiben = async (a) => {
    const o = await sperrDatei();
    if (JSON.stringify(o.angewendet || {}) === JSON.stringify(a)) return;
    o.angewendet = a;
    await textSchreiben(SPERRE(), JSON.stringify(o, null, 1) + "\n");
  };
  // Ein Papierkorb für alles (quellen.js): nie endgültig, Einstellung „Gelöschte Dateien“ von Obsidian
  const papierkorb = async (f) => (Q() && Q().papierkorb ? Q().papierkorb(app, f) : app.vault.trash(f, false));
  const freierPfad = (basis, eigene) => {
    let name = basis, i = 2;
    while (datei(`${K.ORDNER}/${name}.md`) && datei(`${K.ORDNER}/${name}.md`) !== eigene) name = `${basis} ${i++}`;
    return `${K.ORDNER}/${name}.md`;
  };
  const dateiTitel = (t) => (ctx.user.eba && ctx.user.eba.dateiTitel ? ctx.user.eba.dateiTitel(t) : String(t));
  // Notizen dieser Quelle (Besitzmarke herkunft: ilias-kalender + ilias_kalender_id), wo immer sie liegen
  const eigeneNotizen = () => app.vault.getMarkdownFiles().map((f) => ({ f, fm: fmVon(f) }))
    .filter((x) => x.fm && x.fm.herkunft === K.QUELLE && x.fm[K.ID_FELD]).map((x) => Object.assign(x, { id: String(x.fm[K.ID_FELD]) }));
  // Modulcode einer Übung aus dem Index der ILIAS-Unterlagen (ilias.js merkt sich, in welchem Kurs sie steht)
  const objekteLesen = async () => {
    try { const o = JSON.parse((await textLesen(K.INDEX)) || "null"); return (o && o.objekte && typeof o.objekte === "object") ? o.objekte : {}; } catch (e) { return {}; }
  };
  const modulLink = (code) => { const m = code && ctx.modell && ctx.modell.modul ? ctx.modell.modul(code) : null; return m && m.f ? `[[${m.f.basename}]]` : ""; };
  const NOTIZ = { herkunft: K.QUELLE, idFeld: K.ID_FELD, weg: K.WEG };

  // ---------- Anwenden ----------
  // iCalendar → Notizen. o = { vollstaendig, angewendet (Grabsteine oder {}) } → Bericht { abgaben, neu, geaendert, gleich,
  // umbenannt, entfernt, entfaellt, geloescht, doppelt, doppel, vorbei, zaehler, warnungen, angewendet }
  const anwenden = async (ics, o) => {
    const A = ctx.user.alma(ctx), q = Q(), Z = ctx.zentral;
    const objekte = await objekteLesen();
    const codeOk = (c) => !!c && new RegExp("^" + ctx.user.eba.MODULCODE + "$").test(c);
    const { abgaben, zaehler } = await eintraegeAus(A.lesen(ics), {
      zeit: A.zeit, klartext: A.klartext, ohneKennwort: ctx.ilias && ctx.ilias.ohneKennwort,
      codeVon: (ref) => { const x = objekte[ref]; return x && x.typ === "exc" && codeOk(x.code) ? x.code : ""; },
      codeImText: ctx.user.eba.codeImText,
    });
    const tag = heute();
    const b = { abgaben: abgaben.length, neu: 0, geaendert: 0, gleich: 0, umbenannt: 0, entfernt: 0, entfaellt: 0, geloescht: 0, doppelt: 0, doppel: 0, vorbei: 0, zaehler, warnungen: [] };
    if (zaehler.zeitzone) b.warnungen.push(`${zaehler.zeitzone === 1 ? "Eine Abgabe" : zaehler.zeitzone + " Abgaben"} mit fremder Zeitzone ausgelassen. Stell in ILIAS die Zeitzone Berlin ein.`);
    // Doppel einer id (Sync-Verzug, Konfliktkopie): zusammenführen wie jede Quelle
    for (const g of q.doppelGruppen(eigeneNotizen(), (x) => x.id)) {
      for (const x of g) x.text = await app.vault.read(x.f);
      const d = q.dubletten(g.map((x) => ({ pfad: x.f.path, fm: x.fm, text: x.text })));
      const bleibt = g.find((x) => x.f.path === d.bleibt);
      if (d.text) await app.vault.modify(bleibt.f, d.text);
      if (d.erledigt) await app.fileManager.processFrontMatter(bleibt.f, (fm) => { fm.erledigt = true; });
      for (const p of d.weg) { await papierkorb(g.find((x) => x.f.path === p).f); b.doppel++; }
    }
    const eigene = eigeneNotizen();
    const jeId = {};
    for (const n of eigene) if (!jeId[n.id]) jeId[n.id] = n;
    const imFeed = {};
    for (const x of abgaben) imFeed[x.schluessel] = true;
    // Neuer Titel in ILIAS: gleiche Übung, gleiche Art, gleiches Datum → dieselbe Notiz (Haken und Text bleiben)
    const verwaist = eigene.filter((n) => !imFeed[n.id]);
    const genommen = {};
    for (const x of abgaben) {
      if (jeId[x.schluessel]) continue;
      const vor = `exc/${x.ref}/${x.art}/`;
      const n = verwaist.find((y) => !genommen[y.f.path] && y.id.indexOf(vor) === 0 && s10(y.fm.datum) === x.datum);
      if (n) { genommen[n.f.path] = true; jeId[x.schluessel] = n; }
    }
    const fremdeTermine = (ctx.modell && ctx.modell.termine ? ctx.modell.termine() : []).filter((t) => !(t.fm && t.fm.herkunft === K.QUELLE));
    const blaetter = ctx.modell && ctx.modell.abgaben ? ctx.modell.abgaben() : [];
    // Notizen, die Obsidian gerade noch einliest (angelegt oder per Sync), fehlen im metadataCache: dann nichts anlegen
    const unfertig = app.vault.getMarkdownFiles().some((f) => f.path.indexOf(K.ORDNER + "/") === 0 && !app.metadataCache.getFileCache(f));
    const angewendet = o.angewendet || {}, neuAngewendet = {}, behandelt = {};
    if (!app.vault.getAbstractFileByPath(K.ORDNER)) { try { await app.vault.createFolder(K.ORDNER); } catch (e) { /* gibt es schon */ } }
    // Grabstein ohne Code: Der Code kommt oft erst mit dem ersten Durchsuchen der Unterlagen (Index „objekte“), eine gleich nach
    // dem Verbinden gelöschte Abgabe käme sonst wieder. Ältere Grabsteine (mit dem Code von damals, auch leer) gelten weiter. Ist
    // der Code gerade unbekannt (nach neuem Verbinden ist „objekte“ leer), lässt sich ein älterer nicht prüfen: Dann gilt jeder
    // Grabstein und bleibt unverändert, bis der Code wieder da ist. → zu merkender Grabstein oder ""
    const geloeschtVon = (x, h) => {
      if (q.geloescht(angewendet, x.schluessel, h)
        || [x.code, ""].some((c) => q.geloescht(angewendet, x.schluessel, q.kurzHash([x.datum, x.uhr, x.art, c])))) return h;
      return !x.code && Object.prototype.hasOwnProperty.call(angewendet, x.schluessel) ? angewendet[x.schluessel] : "";
    };
    // Name, den diese Quelle vergeben hat („JJJJ-MM-TT <Code> Abgabe in ILIAS“, bei Gleichstand mit „ 2“); einen eigenen benennt nur
    // ein neues Datum um
    const NAME_VON_HIER = /^\d{4}-\d{2}-\d{2} (?:\S+ )?(?:Abgabe|Feedback) in ILIAS$/;
    for (const x of abgaben) {
      const h = q.kurzHash([x.datum, x.uhr, x.art]);
      const n = jeId[x.schluessel];
      const doppelt = schonDa(x, fremdeTermine, blaetter);
      const e = eintragVon(x), opt = Object.assign({ modulLink: modulLink(x.code) }, NOTIZ);
      if (n) {
        behandelt[n.f.path] = true;
        const alt = await app.vault.read(n.f);
        if (doppelt && q.unberuehrt(n.fm, alt)) { await papierkorb(n.f); b.doppelt++; continue; }
        const neu = Z.notizText(alt, e, opt);
        if (neu !== alt) { await app.vault.modify(n.f, neu); b.geaendert++; } else b.gleich++;
        // Datum, Code oder Art geändert → umbenennen (Links zieht Obsidian nach); ein eigener Name mit gleichem Datum bleibt
        const soll = dateiTitel(dateiNameVon(x)), basis = n.f.basename.replace(/ \d+$/, "");
        if (n.f.basename.slice(0, 10) !== x.datum || (NAME_VON_HIER.test(basis) && basis !== soll)) {
          const ziel = freierPfad(soll, n.f);
          if (ziel !== n.f.path) { await app.fileManager.renameFile(n.f, ziel); b.umbenannt++; }
        }
        neuAngewendet[x.schluessel] = h;
        continue;
      }
      if (doppelt) { b.doppelt++; continue; }
      const grab = geloeschtVon(x, h);
      if (grab) { neuAngewendet[x.schluessel] = grab; b.geloescht++; continue; } // von dir gelöscht
      if (x.datum < tag) { b.vorbei++; continue; }
      if (unfertig) continue;
      await app.vault.create(freierPfad(dateiTitel(dateiNameVon(x)), null), Z.notizText("", e, opt));
      neuAngewendet[x.schluessel] = h;
      b.neu++;
    }
    // In ILIAS weg: nur künftige Abgaben (ILIAS lässt Altes weg); Schutz gegen unvollständige Kalender und Massenwegfall
    const kuenftig = eigene.filter((n) => s10(n.fm.datum) >= tag && n.fm.entfaellt !== true);
    const weg = kuenftig.filter((n) => !behandelt[n.f.path]);
    const sperrGrund = !o.vollstaendig ? "Der ILIAS-Kalender kam unvollständig an, darum ist nichts entfernt."
      : !abgaben.length && kuenftig.length >= K.BEKANNT_MIN ? "Im ILIAS-Kalender stand diesmal keine Abgabe, darum ist nichts entfernt."
        : q.zuViel(weg.length, kuenftig.length, K.WEG_MIN) ? `${weg.length} Abgaben fehlen auf einmal im ILIAS-Kalender, darum ist nichts entfernt.` : "";
    if (weg.length && sperrGrund) b.warnungen.push(sperrGrund);
    else {
      for (const n of weg) {
        const alt = await app.vault.read(n.f);
        const w = q.wegfall(n.fm, alt);
        if (w === "papierkorb") { await papierkorb(n.f); b.entfernt++; continue; }
        if (w !== "entfaellt") continue;
        const e = {
          id: n.id, titel: String(n.fm.titel || n.f.basename).replace(/ \(entfällt\)$/, ""), datum: s10(n.fm.datum), bis: "", uhrzeit: "",
          ort: String(n.fm.ort || ""), kategorie: "Frist", status: "offiziell", code: String(n.fm.code || ""),
          quelle_url: /^https:\/\//.test(String(n.fm.quelle || "")) ? String(n.fm.quelle) : "", quelle_text: "", info: String(n.fm.info || ""), geprueft: "",
        };
        const neu = Z.notizText(alt, e, Object.assign({ modulLink: n.fm.modul ? String(n.fm.modul) : "", entfaellt: true }, NOTIZ));
        if (neu !== alt) { await app.vault.modify(n.f, neu); b.entfaellt++; }
      }
    }
    // Grabsteine: was im Kalender steht (unvollständig: die alten bleiben dazu)
    b.angewendet = o.vollstaendig ? neuAngewendet : Object.assign({}, angewendet, neuAngewendet);
    return b;
  };

  // ---------- Abruf ----------
  let letzterFehler = "";
  const aktualisieren = async (o) => {
    if (LAUF.p) return LAUF.p;
    LAUF.p = ablauf(o || {});
    try { return await LAUF.p; } finally { LAUF.p = null; }
  };
  // o = { automatisch (Zeitplan: kein Hinweis, übernimmt nie die Sperre), still (kein Hinweis), erneuert (keinen neuen Link über den
  // Uni-Login holen), text + vollstaendig (Tests) }
  // → Bericht oder null (extern, nicht verbunden, Fehler, ein anderes Gerät schreibt; Grund in fehler() bzw. status())
  const ablauf = async (o) => {
    const leise = !!(o.automatisch || o.still);
    letzterFehler = "";
    if (extern()) { letzterFehler = K.EXTERN; if (!leise) ctx.hinweis(K.EXTERN); return null; }
    if (o.text == null && !hatLink()) {
      letzterFehler = "Der ILIAS-Kalender ist noch nicht verbunden.";
      if (!leise) ctx.hinweis("Der ILIAS-Kalender ist noch nicht verbunden.", { aktion: { text: "Verbinden", aktion: "verbinden", parameter: { id: K.QUELLE } } });
      return null;
    }
    if (!Q() || !S() || !ctx.zentral || !ctx.zentral.notizText || !ctx.user.alma) {
      letzterFehler = "Noch nicht bereit. Bitte gleich noch einmal versuchen.";
      if (!leise) ctx.hinweis(letzterFehler);
      return null;
    }
    // Ein Schreiber: der Zeitplan wartet, solange ein anderes Gerät schreibt; ein Knopf übernimmt
    const sp = sperre();
    if (!(await sp.nehmen({ erzwingen: !o.automatisch }))) {
      const p = await sp.pruefen();
      lstatusSetzen({ anderes: (p.sperre && p.sperre.zuletzt) || jetzt().toISOString(), versucht: jetzt().toISOString() });
      return null;
    }
    let ics = o.text, vollstaendig = o.vollstaendig !== false;
    if (ics == null) {
      // Nur für Tests (docs/architektur/ilias-kalender.md): plugin.testKalenderAbruf({ url }) → { status, text } ersetzt den Abruf (kein Netz)
      const abrufen = typeof plugin().testKalenderAbruf === "function" ? plugin().testKalenderAbruf : ctx.obsidian.requestUrl;
      let antwort;
      try { antwort = await abrufen({ url: linkAdresse(link()), method: "GET", throw: false }); } catch (e) { antwort = { status: 0 }; }
      let roh = "", groesse = 0;
      if (antwort && antwort.status === 200) {
        try {
          if (antwort.arrayBuffer) { groesse = antwort.arrayBuffer.byteLength; roh = ctx.user.alma(ctx).bytesLesen(antwort.arrayBuffer); }
          else { roh = String(antwort.text || ""); groesse = roh.length; }
        } catch (e) { roh = String(antwort.text || ""); groesse = roh.length; }
      }
      const status = antwort ? Number(antwort.status) || 0 : 0;
      if (status !== 200 || !/BEGIN:VCALENDAR/.test(roh)) {
        const linkFehler = status === 200 || status === 401 || status === 403 || status === 404 || status === 410;
        // Mit deinem Uni-Login holt uni-login.js höchstens einmal am Tag einen neuen Link; damit gleich noch einmal
        const U = linkFehler && !o.erneuert ? uni() : null;
        let neu = "";
        if (U) { try { neu = await U.erneuern(K.QUELLE, link()); } catch (e) { neu = ""; } }
        if (neu) { app.saveLocalStorage(K.LINK, neu); return ablauf(Object.assign({}, o, { erneuert: true })); }
        letzterFehler = linkFehler ? "ILIAS kennt diesen Link nicht mehr. Bitte den Link in ILIAS neu kopieren."
          : status ? `ILIAS antwortet nicht (Fehler ${status}). Später kommt der nächste Versuch.` : "Keine Verbindung zu ILIAS. Bitte Internet prüfen und erneut versuchen.";
        nachLauf({ ok: false, fehler: letzterFehler, linkFehler });
        Q().meldenNeu(ctx);
        if (!leise) ctx.hinweis(letzterFehler);
        return null;
      }
      ics = roh;
      vollstaendig = /END:VCALENDAR\s*$/.test(roh) && groesse < K.GROSS;
    }
    let b;
    try {
      b = await anwenden(ics, { vollstaendig, angewendet: (await sperrDatei()).angewendet || {} });
      await angewendetSchreiben(b.angewendet);
    } catch (e) {
      letzterFehler = "Die Abgaben ließen sich diesmal nicht eintragen. Später kommt der nächste Versuch.";
      nachLauf({ ok: false, fehler: letzterFehler });
      if (!leise) ctx.hinweis(letzterFehler);
      return null;
    }
    delete b.angewendet;
    b.offen = offen();
    nachLauf({ ok: true, warnungen: b.warnungen });
    Q().meldenNeu(ctx);
    if (!leise) {
      const teile = [["neu", "neu"], ["geaendert", "geändert"], ["entfernt", "entfernt"], ["entfaellt", "entfallen"]].filter((x) => b[x[0]]).map((x) => `${b[x[0]]} ${x[1]}`);
      ctx.hinweis(`ILIAS-Kalender aktualisiert, ${b.offen === 1 ? "1 Abgabe" : b.offen + " Abgaben"} bei deinen Fristen${teile.length ? ` (${teile.join(", ")})` : ""}.`);
    }
    return b;
  };

  // Kommende, offene Abgaben aus dem ILIAS-Kalender (für Zeile und Hinweis)
  const offen = () => { const t = heute(); return eigeneNotizen().filter((n) => s10(n.fm.datum) >= t && n.fm.entfaellt !== true && n.fm.erledigt !== true).length; };

  // ---------- Verbindung ----------
  // Status in der gemeinsamen Form der Quellen: { zustand (extern | nicht-verbunden | laeuft | fehler | anderes-geraet | an), geprueft,
  // fehler, fehlerZeit, warnungen }, dazu verbunden, seit, anderes, laeuft, extern, abgaben (kommende, offene)
  const status = () => {
    const s = lstatus(), verbunden = hatLink(), ex = extern();
    const zustand = ex ? "extern" : !verbunden ? "nicht-verbunden" : LAUF.p ? "laeuft" : s.fehler ? "fehler" : s.anderes ? "anderes-geraet" : "an";
    return { zustand, geprueft: s.geprueft, fehler: s.fehler, fehlerZeit: s.fehler ? s.fehlerZeit : "", warnungen: Array.isArray(s.warnungen) ? s.warnungen : [],
      verbunden, seit: app.loadLocalStorage(K.SEIT) || null, anderes: s.anderes || "", laeuft: !!LAUF.p, extern: ex, linkFehler: !!s.linkFehler, abgaben: offen() };
  };
  // Link übernehmen und sofort abrufen; scheitert das, gilt wieder der vorherige Zustand (kein unbrauchbarer Link bleibt).
  // o.nurBeiErfolg (Verbinden-Fenster): keine Hinweise, das Fenster zeigt das Ergebnis. → Bericht oder null (Grund in fehler())
  const verbinden = async (neu, o) => {
    o = o || {};
    letzterFehler = "";
    if (extern()) { letzterFehler = K.EXTERN; if (!o.nurBeiErfolg) ctx.hinweis(K.EXTERN); return null; }
    const v = String(neu == null ? "" : neu).trim(), f = linkPruefen(v);
    if (f) { letzterFehler = f; if (!o.nurBeiErfolg) ctx.hinweis(f); return null; }
    const vorher = link(), vorherSeit = app.loadLocalStorage(K.SEIT) || null, vorherStatus = app.loadLocalStorage(K.STATUS);
    app.saveLocalStorage(K.LINK, v);
    // erneuert: beim Verbinden keinen anderen Link holen (der eingegebene soll gelten)
    const b = await aktualisieren({ still: !!o.nurBeiErfolg, erneuert: true });
    if (!b) {
      const grund = letzterFehler;
      app.saveLocalStorage(K.LINK, vorher || null); app.saveLocalStorage(K.SEIT, vorherSeit); app.saveLocalStorage(K.STATUS, vorher ? vorherStatus : null);
      letzterFehler = grund;
      return null;
    }
    if (!vorher || vorher !== v || !vorherSeit) app.saveLocalStorage(K.SEIT, jetzt().toISOString());
    return b;
  };
  // Link auf diesem Gerät löschen (die Fristen bleiben); die Sperre wird frei, ein anderes Gerät mit Link übernimmt
  const trennen = async () => {
    app.saveLocalStorage(K.LINK, null); app.saveLocalStorage(K.SEIT, null); app.saveLocalStorage(K.STATUS, null);
    if (Q()) Q().meldenNeu(ctx);
    if (S()) await sperre().freigeben().catch(() => false);
  };
  const fehler = () => letzterFehler || lstatus().fehler;
  // „Bitte prüfen“: Link gilt nicht mehr, Warnungen des letzten Laufs (nur mit Link auf diesem Gerät)
  const hinweise = () => {
    const s = status();
    if (!s.verbunden || s.extern) return [];
    // Mit Uni-Login holt „Neuen Link eingeben“ ihn selbst (uni-login.js), sonst kopierst du ihn
    const selbst = !!(uni() && uni().kannSelbst(K.QUELLE));
    if (s.fehler && s.linkFehler) return [Object.assign({ text: selbst ? "**ILIAS-Kalender** · Der Link gilt nicht mehr. Unter Verbindungen **Neuen Link eingeben** tippen, den Rest macht Studium Autopilot."
      : "**ILIAS-Kalender** · Der Link gilt nicht mehr. Kopier ihn in ILIAS neu und gib ihn unter Verbindungen ein." }, K.ZIEL)];
    return s.fehler ? [] : s.warnungen.map((w) => Object.assign({ text: "**ILIAS-Kalender** · " + w }, K.ZIEL));
  };

  const api = {
    status, linkPruefen, linkWaehlen, verbinden, aktualisieren, trennen, fehler, hinweise, K,
    // reine Teile (Tests)
    artAus, zielAus, zeitpunktAus, nummerAus, eintraegeAus, schonDa, titelVon, dateiNameVon, eintragVon, linkAdresse,
  };
  ctx.iliasKalender = api;

  const registrieren = () => {
    const q = Q();
    if (!q) return;
    q.melden(ctx, K.QUELLE, hinweise);
    q.planen(ctx, { takt: K.TAKT, zurueck: K.ZURUECK, backoff: K.BACKOFF, start: K.START,
      versucht: () => Date.parse(lstatus().versucht || "") || 0,
      lauf: async () => {
        if (plugin().testIliasKalenderAus || !hatLink() || extern()) return null;
        const b = await aktualisieren({ automatisch: true });
        if (ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen();
        return b ? true : lstatus().fehler ? false : null;
      } });
  };

  return { registrieren };
};
