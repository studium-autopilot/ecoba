// Stundenplan aus Alma in den Vault übernehmen (iCalendar-Abo-Link aus Alma).
// Aufruf in einer Aktion:  await ctx.user.alma(ctx).aktualisieren({ still: false });  bzw. .verbinden() (Link abfragen + importieren)
// Der Abo-Link ist geheim (wer ihn hat, sieht den Stundenplan). Er liegt NUR im gerätelokalen Speicher
// von Obsidian (app.saveLocalStorage), nie im Vault und wird deshalb auch nicht synchronisiert.
// Nur Obsidian-API (requestUrl, vault, fileManager): läuft auf Windows, macOS, iPad und iPhone.
// Gestartet über den Knopf „Stundenplan aktualisieren“ (Aktion „stundenplan“ in System/Skripte/aktionen.js).
module.exports = function (ctx) {
  const app = window.app;
  const { requestUrl, Notice } = ctx.obsidian;

  // ---------- Einstellungen ----------
  const SPEICHER = "eba-alma-ics";        // Schlüssel im gerätelokalen Speicher
  const STAND = "eba-alma-stand";         // letzter erfolgreicher Abruf (gerätelokal)
  const SEIT = "eba-alma-seit";           // verbunden seit (gerätelokal)
  const ORDNER = "Stundenplan";
  const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const TAGE_LANG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

  // ---------- Abo-Link ----------
  const link = () => app.loadLocalStorage(SPEICHER) || "";
  const hatLink = () => !!link();
  // vorgabe: Link direkt übergeben (z. B. aus einer Verbinden-Karte), sonst Eingabefenster
  // Link prüfen: "" = in Ordnung, sonst ein Satz, was nicht stimmt (für das Verbinden-Fenster).
  // Alma-Abo-Links beginnen mit https:// oder webcal:// und dem Server alma.uni-tuebingen.de; mehr ist über das Muster
  // nicht bekannt (der Rest enthält einen geheimen Schlüssel), darum keine strengere Prüfung.
  const linkPruefen = (s) => {
    const v = String(s == null ? "" : s).trim();
    if (!v) return "Bitte zuerst den Link aus Alma einfügen.";
    if (/\s/.test(v)) return "Im Link sind Leerzeichen. Bitte den Link neu kopieren und einfügen.";
    if (!/^(https|webcal):\/\//i.test(v)) return "Der Link ist unvollständig. Bitte den ganzen Link einfügen (beginnt mit https://).";
    if (!/^(https|webcal):\/\/alma\.uni-tuebingen\.de[:/]/i.test(v)) return "Das ist kein Alma-Link. Bitte den Link aus „Link kopieren“ einfügen.";
    if (/^(https|webcal):\/\/alma\.uni-tuebingen\.de\/?$/i.test(v)) return "Das ist nur die Alma-Startseite. Bitte den Link aus „Link kopieren“ einfügen.";
    return "";
  };
  const linkSetzen = async (vorgabe, still) => {
    const eingabe = vorgabe != null ? vorgabe : await ctx.system.prompt("Alma-Link einfügen. Du findest ihn in Alma unter Mein Studium → Stundenplan → „Daten für iCalendar (ics) exportieren“ → „Link kopieren“.", "");
    // Esc/Abbrechen (null) oder leere Eingabe: gespeicherten Link nicht anfassen
    const neu = String(eingabe ?? "").trim();
    if (!neu) return false;
    if (/^l(ö|oe)schen$/i.test(neu)) {
      if (!hatLink()) { new Notice("Auf diesem Gerät ist kein Alma-Link gespeichert.", 5000); return false; }
      app.saveLocalStorage(SPEICHER, null); new Notice("Alma-Link auf diesem Gerät gelöscht.", 5000); return false;
    }
    // webcal:// ist dieselbe Adresse; aktualisieren() schreibt sie beim Abruf auf https:// um
    const fehler = linkPruefen(neu);
    if (fehler) { new Notice(fehler, 8000); return false; }
    app.saveLocalStorage(SPEICHER, neu);
    if (!still) new Notice("Alma-Link auf diesem Gerät gespeichert.", 4000);
    return true;
  };

  // ---------- Datum ----------
  const tagObj = (s) => new Date(s + "T12:00:00Z");
  const iso = (d) => d.toISOString().slice(0, 10);
  const plus = (s, n) => { const d = tagObj(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const wochentag = (s) => ((tagObj(s).getUTCDay() + 6) % 7) + 1; // 1 = Mo … 7 = So
  const deutsch = (s) => s.split("-").reverse().join(".");
  const berlin = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  // iCalendar-Zeit -> { datum: "JJJJ-MM-TT", uhr: "HH:MM" } in Tübinger Ortszeit
  const zeit = (wert) => {
    const m = String(wert || "").trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    if (m[7]) {
      const teile = berlin.formatToParts(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])));
      const g = (t) => teile.find((x) => x.type === t).value;
      return { datum: `${g("year")}-${g("month")}-${g("day")}`, uhr: `${g("hour")}:${g("minute")}` };
    }
    return { datum: `${m[1]}-${m[2]}-${m[3]}`, uhr: m[4] ? `${m[4]}:${m[5]}` : "" };
  };

  // Uhrzeit "HH:MM" <-> Minuten seit Mitternacht
  const minuten = (u) => { const m = String(u ?? "").trim().match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const uhrPlus = (u, n) => { const t = (((minuten(u) + n) % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  // iCalendar-Dauer (z. B. PT1H30M, P1DT2H) -> Minuten, sonst null
  const dauer = (wert) => {
    const m = String(wert || "").trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) return null;
    const n = (+m[2] || 0) * 10080 + (+m[3] || 0) * 1440 + (+m[4] || 0) * 60 + (+m[5] || 0) + Math.floor((+m[6] || 0) / 60);
    return m[1] === "-" ? -n : n;
  };

  // ---------- iCalendar lesen ----------
  const entfalten = (t) => String(t).replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
  // Faltung auf Byte-Ebene entfernen und erst danach als UTF-8 lesen: Alma darf nach 75 Oktetten
  // mitten in einem Umlaut falten (RFC 5545), dann würde Dekodieren vor dem Entfalten „��“ ergeben.
  const bytesLesen = (puffer) => {
    const b = new Uint8Array(puffer), aus = new Uint8Array(b.length);
    const leer = (x) => x === 0x20 || x === 0x09;
    let n = 0;
    for (let i = 0; i < b.length; i++) {
      if (b[i] === 0x0d && b[i + 1] === 0x0a && leer(b[i + 2])) { i += 2; continue; } // CRLF + Leerzeichen/Tab
      if ((b[i] === 0x0a || b[i] === 0x0d) && leer(b[i + 1])) { i += 1; continue; }   // LF bzw. CR + Leerzeichen/Tab
      aus[n++] = b[i];
    }
    return new TextDecoder("utf-8").decode(aus.subarray(0, n));
  };
  const klartext = (v) => String(v || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").replace(/\s+/g, " ").trim();
  const lesen = (text) => {
    const liste = [];
    let e = null, tiefe = 0;
    for (const zeile of entfalten(text).split("\n")) {
      if (zeile === "BEGIN:VEVENT") { e = { EXDATE: [] }; tiefe = 0; continue; }
      if (zeile === "END:VEVENT") { if (e) liste.push(e); e = null; continue; }
      if (!e) continue;
      // eingebettete Komponenten (VALARM u. a.) überspringen, ihre Eigenschaften gehören nicht zum Termin
      if (/^BEGIN:/i.test(zeile)) { tiefe++; continue; }
      if (/^END:/i.test(zeile)) { if (tiefe) tiefe--; continue; }
      if (tiefe) continue;
      const i = zeile.indexOf(":");
      if (i < 0) continue;
      const name = zeile.slice(0, i).split(";")[0].toUpperCase(), wert = zeile.slice(i + 1);
      if (name === "EXDATE") e.EXDATE.push(...wert.split(","));
      else e[name] = wert;
    }
    return liste;
  };

  // Ein VEVENT -> Liste einzelner Termine (wöchentliche Serien werden aufgelöst)
  const termine = (e, verschoben) => {
    const s = zeit(e.DTSTART), en = zeit(e.DTEND);
    if (!s || !s.uhr) return []; // ganztägige Einträge sind keine Lehrveranstaltung
    // ohne DTEND, aber mit DURATION (z. B. PT1H30M): Ende = Beginn + Dauer
    const dauerMin = en?.uhr ? null : dauer(e.DURATION);
    const ende = en?.uhr || (dauerMin != null ? uhrPlus(s.uhr, dauerMin) : s.uhr);
    const ohne = new Set([...e.EXDATE.map((w) => zeit(w)?.datum), ...(verschoben || [])].filter(Boolean));
    const daten = [];
    const r = e.RRULE ? Object.fromEntries(e.RRULE.split(";").map((x) => x.split("="))) : null;
    if (r && r.FREQ === "WEEKLY") {
      const schritt = 7 * (Number(r.INTERVAL) || 1), bis = r.UNTIL ? zeit(r.UNTIL)?.datum : null, anzahl = Number(r.COUNT) || 0;
      for (let d = s.datum, i = 0; i < 60 && (bis ? d <= bis : i < (anzahl || 1)); d = plus(d, schritt), i++) daten.push(d);
    } else daten.push(s.datum);
    return daten.filter((d) => !ohne.has(d)).map((datum) => ({ datum, beginn: s.uhr, ende }));
  };

  // ---------- Vault ----------
  const einstellungen = () => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("System/Einstellungen.md"))?.frontmatter || {};
  // Semester zu einem Datum: aus dem Datenmodell (zentrale Semesterdaten, auch außerhalb der persönlichen Liste),
  // sonst wie bisher aus der semesterliste der Einstellungen.
  const semesterVon = (datum) => {
    if (ctx.modell && ctx.modell.semesterVon) { const s = ctx.modell.semesterVon(datum); if (s) return s.name; }
    const z = (einstellungen().semesterliste || []).map((s) => String(s).split("|")).find((s) => s[2] <= datum && s[3] >= datum);
    return z ? z[1] : "";
  };
  const alleModule = () => app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Module/"))
    .map((f) => ({ f, fm: app.metadataCache.getFileCache(f)?.frontmatter || {} })).filter((x) => x.fm.typ === "modul");
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  // Modulcode im Titel, z. B. B110, SQ100 (einheitliches Muster aus System/Skripte/eba.js)
  const CODE = new RegExp("(?:^|[^A-Z0-9])(" + ctx.user.eba.MODULCODE + ")(?=[^A-Z0-9]|$)");
  const modulFinden = (titel, ms) => {
    const c = titel.match(CODE);
    if (c) { const m = ms.find((x) => x.fm.code === c[1]); if (m) return m; }
    const t = norm(titel);
    return ms.filter((x) => x.fm.titel && norm(x.fm.titel).length > 5 && t.includes(norm(x.fm.titel)))
      .sort((a, b) => String(b.fm.titel).length - String(a.fm.titel).length)[0] || null;
  };
  // Tutorium und Übungsteil gehen wie bisher vor; sonst zählt das zuerst im Titel stehende Stichwort
  // („Vorlesung mit Übung“ = Vorlesung, „Übung zur Vorlesung …“ = Übung)
  const artFinden = (t) => {
    if (/tutori/i.test(t)) return "Tutorium";
    if (/übungsteil|uebungsteil/i.test(t)) return "Übungsteil";
    const w = (String(t).match(/übung|uebung|exercise|seminar|kolloquium|colloquium|vorlesung|lecture/i)?.[0] || "").toLowerCase();
    return !w ? "Veranstaltung" : /übung|uebung|exercise/.test(w) ? "Übung" : /vorlesung|lecture/.test(w) ? "Vorlesung" : "Seminar";
  };
  // Art passt, wenn gleich oder eine Seite keine konkrete Art hat („Veranstaltung“ bzw. leer)
  const unbestimmt = (a) => !a || a === "Veranstaltung";
  const artPasst = (a, b) => unbestimmt(a) || unbestimmt(b) || a === b;
  const kuerzen = (s, n = 40) => { s = String(s).trim(); if (s.length <= n) return s; const k = s.slice(0, n + 1); return (k.slice(0, k.lastIndexOf(" ")) || s.slice(0, n)).replace(/[\s,;:–-]+(für|und|in|der|die|das|zu|zur|zum|von|mit)?$/i, ""); };
  const sauber = (s) => String(s).replace(/[\\/:*?"<>|#^\[\]]/g, "-").replace(/\s+/g, " ").trim();

  // Einzeltermine gleicher Art (Titel, Wochentag, Uhrzeit, Semester) zu einem Eintrag zusammenfassen
  const gruppieren = (events) => {
    const verschoben = new Map(); // UID -> Daten, die durch RECURRENCE-ID ersetzt wurden
    for (const e of events) if (e["RECURRENCE-ID"] && e.UID) {
      const d = zeit(e["RECURRENCE-ID"])?.datum;
      if (d) verschoben.set(e.UID, [...(verschoben.get(e.UID) || []), d]);
    }
    const gruppen = new Map();
    for (const e of events) {
      if (/CANCELLED/i.test(e.STATUS || "")) continue;
      const titel = klartext(e.SUMMARY);
      if (!titel) continue;
      const raum = klartext(e.LOCATION);
      for (const t of termine(e, e["RECURRENCE-ID"] ? null : verschoben.get(e.UID))) {
        const semester = semesterVon(t.datum);
        const schluessel = [semester, titel, wochentag(t.datum), t.beginn, t.ende].join("|");
        if (!gruppen.has(schluessel)) gruppen.set(schluessel, { schluessel, titel, semester, wt: wochentag(t.datum), beginn: t.beginn, ende: t.ende, daten: new Set(), raeume: new Map() });
        const g = gruppen.get(schluessel);
        g.daten.add(t.datum);
        if (raum) g.raeume.set(raum, (g.raeume.get(raum) || 0) + 1);
      }
    }
    return [...gruppen.values()].map((g) => {
      const daten = [...g.daten].sort(), von = daten[0], bis = daten[daten.length - 1];
      const ausfall = [];
      for (let d = plus(von, 7); d < bis; d = plus(d, 7)) if (!g.daten.has(d)) ausfall.push(d);
      const raum = [...g.raeume.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      return { ...g, von, bis, ausfall, raum, einzeln: daten.length === 1 };
    });
  };

  const vorhandene = (ordner) => app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(ordner + "/"))
    .map((f) => ({ f, fm: app.metadataCache.getFileCache(f)?.frontmatter || {} })).filter((x) => x.fm.typ === "lehrveranstaltung");
  const gleich = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const liste = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String).sort();

  // ---------- Hauptfunktion ----------
  // optionen: still (keine Meldung ohne Änderung), text (iCalendar direkt, zum Testen), ordner (zum Testen)
  let letzterFehler = "";
  const aktualisieren = async (optionen = {}) => {
    const { still = false, ordner = ORDNER } = optionen;
    let text = optionen.text;
    letzterFehler = "";
    if (text == null) {
      const url = link();
      if (!url) { letzterFehler = "Alma ist noch nicht verbunden."; if (!still) new Notice("Alma ist noch nicht verbunden. Tippe auf der Seite Stundenplan auf „Alma verbinden“.", 8000); return null; }
      let antwort;
      // Nur für Tests (docs/architektur.md): plugin.testAbruf(url) → { status, text } ersetzt den Abruf (kein Netz)
      const abrufen = ctx.plugin && typeof ctx.plugin.testAbruf === "function" ? ctx.plugin.testAbruf : requestUrl;
      try { antwort = await abrufen({ url: url.replace(/^webcal:/i, "https:"), method: "GET", throw: false }); }
      catch (e) { antwort = { status: 0 }; }
      // als Bytes holen und vor dem Dekodieren entfalten (siehe bytesLesen); Rückfall auf .text
      let roh = "";
      if (antwort.status === 200) { try { roh = antwort.arrayBuffer ? bytesLesen(antwort.arrayBuffer) : antwort.text || ""; } catch (e) { roh = antwort.text || ""; } }
      if (antwort.status !== 200 || !/BEGIN:VCALENDAR/.test(roh)) {
        letzterFehler = antwort.status === 200 ? "Alma hat keinen Stundenplan geliefert. Bitte den Link aus „Link kopieren“ einfügen."
          : antwort.status ? `Alma antwortet nicht (Fehler ${antwort.status}). Bitte den Link in Alma neu kopieren.` : "Keine Verbindung zu Alma. Bitte Internet prüfen und erneut versuchen.";
        if (!still) new Notice(letzterFehler, 10000);
        return null;
      }
      text = roh;
    }
    const gruppen = gruppieren(lesen(text));
    const semesterImFeed = new Set(gruppen.map((g) => g.semester));
    const schluesselImFeed = new Set(gruppen.map((g) => g.schluessel));
    const ms = alleModule();
    const alt = vorhandene(ordner);
    const bericht = { neu: 0, geaendert: 0, entfernt: 0, gleich: 0, termine: gruppen.length };
    const benutzt = new Set();

    // Modul, Code und Art je Termin einmal bestimmen
    const info = new Map(gruppen.map((g) => {
      const m = modulFinden(g.titel, ms);
      const code = m?.fm.code ?? (g.titel.match(CODE)?.[1] ?? "");
      return [g.schluessel, { m, code, art: artFinden(g.titel) }];
    }));

    // Zuordnung Termin -> vorhandene Notiz, in dieser Reihenfolge:
    // 1. gleicher alma_schluessel
    // 2. von Hand angelegt (ohne alma_schluessel): gleiches Semester, Wochentag, Code; Beginn und Ende exakt oder
    //    höchstens 15 min daneben (c.t./s.t.); Art passt. Exakte Zeit vor Toleranz, gleiche Art vor unbestimmter.
    // 3. verwaiste Alma-Notiz (ihr alma_schluessel fehlt im Abruf, weil Alma Titel oder Zeit geändert hat):
    //    gleiches Semester, gleicher Code (ohne Code: gleicher Alma-Titel), Art passt; gleicher Wochentag/Beginn zuerst.
    //    Sie wird umgeschlüsselt und aktualisiert, statt eine neue Notiz anzulegen und die alte zu löschen.
    // Jede Notiz wird höchstens einmal vergeben; bei 2. und 3. gewinnt über alle Termine das am besten passende Paar.
    const zuordnung = new Map();
    for (const g of gruppen) {
      const x = alt.find((x) => !benutzt.has(x.f.path) && x.fm.alma_schluessel === g.schluessel);
      if (x) { benutzt.add(x.f.path); zuordnung.set(g.schluessel, x); }
    }
    const vergleich = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
    const paaren = (bewerten) => {
      const paare = [];
      for (const g of gruppen) if (!zuordnung.has(g.schluessel)) for (const x of alt) if (!benutzt.has(x.f.path)) {
        const r = bewerten(g, x, info.get(g.schluessel));
        if (r) paare.push({ g, x, r });
      }
      // bei Gleichstand zuerst die Notiz bzw. den Termin mit weniger Alternativen vergeben
      const anzahl = new Map();
      for (const p of paare) for (const k of [p.x.f.path, "|" + p.g.schluessel]) anzahl.set(k, (anzahl.get(k) || 0) + 1);
      for (const p of paare) p.r = [...p.r, anzahl.get(p.x.f.path), anzahl.get("|" + p.g.schluessel)];
      paare.sort((a, b) => vergleich(a.r, b.r));
      for (const { g, x } of paare) if (!zuordnung.has(g.schluessel) && !benutzt.has(x.f.path)) { benutzt.add(x.f.path); zuordnung.set(g.schluessel, x); }
    };
    const abstand = (a, b) => { const ma = minuten(a), mb = minuten(b); return ma == null || mb == null ? null : Math.abs(ma - mb); };
    paaren((g, x, { code, art }) => { // 2. Hand-Notiz
      if (x.fm.alma_schluessel || x.fm.semester !== g.semester || Number(x.fm.wochentag) !== g.wt) return null;
      if ((code && x.fm.code !== code) || !artPasst(x.fm.art, art)) return null;
      const db = abstand(x.fm.beginn, g.beginn), de = abstand(x.fm.ende, g.ende) ?? 0;
      if (db == null || db > 15 || de > 15) return null;
      return [db + de ? 1 : 0, x.fm.art === art ? 0 : 1, db + de];
    });
    paaren((g, x, { code, art }) => { // 3. verwaiste Alma-Notiz
      const s = String(x.fm.alma_schluessel || "");
      if (!s || schluesselImFeed.has(s) || x.fm.semester !== g.semester) return null;
      if ((code ? x.fm.code !== code : x.fm.alma_titel !== g.titel) || !artPasst(x.fm.art, art)) return null;
      const [ab, awt] = s.split("|").reverse().slice(1); // Schlüssel endet auf …|Wochentag|Beginn|Ende
      const wt = Number(awt) === g.wt ? 0 : 1, b = ab === g.beginn ? 0 : 1;
      return [wt + b, wt, b, abstand(ab, g.beginn) ?? 1440];
    });

    for (const g of gruppen) {
      const { m, code, art } = info.get(g.schluessel);
      const treffer = zuordnung.get(g.schluessel);
      // Kurztitel für neue Notizen: aus einer vorhandenen Notiz gleichen Codes, nie aus einer mit anderer Art
      const vorbild = alt.filter((x) => code && x.fm.code === code && x.fm.titel && artPasst(x.fm.art, art))
        .sort((a, b) => (a.fm.art === art ? 0 : 1) - (b.fm.art === art ? 0 : 1))[0];
      const kurz = vorbild ? String(vorbild.fm.titel).split(" · ")[0]
        : kuerzen(m ? String(m.fm.titel) : g.titel.replace(code, "").replace(/^[\s\-–:·]+/, ""));
      const felder = {
        wochentag: g.wt, tag: TAGE[g.wt - 1], beginn: g.beginn, ende: g.ende, semester: g.semester,
        von: g.von, bis: g.bis, ausfall: g.ausfall, einzeltermin: g.einzeln,
        quelle: "alma", alma_schluessel: g.schluessel, alma_titel: g.titel, alma_raum: g.raum,
      };
      if (treffer) {
        const fm = treffer.fm;
        const neu = { ...felder };
        // c.t. (bei c.t. beginnt die Veranstaltung 15 Minuten später): Lag die Notiz an beiden Enden genau 15 min innerhalb der
        // Alma-Zeiten (Alma 10:00–12:00, Notiz 10:15–11:45; bei Alma-Notizen gemessen an den Zeiten im bisherigen
        // alma_schluessel, sonst am aktuellen Termin), bleibt sie c.t.: Beginn +15, Ende −15 zu den Alma-Zeiten.
        // Gilt nur, wenn Alma zur vollen Stunde beginnt. alma_schluessel enthält immer die Alma-Zeiten.
        const nb = minuten(fm.beginn), ne = minuten(fm.ende);
        const [kb, ke] = fm.alma_schluessel ? String(fm.alma_schluessel).split("|").slice(-2) : [g.beginn, g.ende];
        const ab = minuten(g.beginn), ae = minuten(g.ende);
        if (nb != null && ne != null && nb === minuten(kb) + 15 && ne === minuten(ke) - 15 && ab % 60 === 0 && ae - ab > 30) {
          neu.beginn = uhrPlus(g.beginn, 15); neu.ende = uhrPlus(g.ende, -15);
        }
        // Raum: leer -> aus Alma füllen; sonst nur überschreiben, wenn er sich in Alma seit dem letzten Abruf geändert hat
        if (g.raum && (!fm.raum || (fm.alma_raum && fm.alma_raum !== g.raum))) neu.raum = g.raum;
        const aenderung = Object.entries(neu).some(([k, v]) => k === "ausfall" ? !gleich(liste(fm[k]), liste(v)) : !gleich(fm[k] == null ? null : String(fm[k]), v == null ? null : String(v)));
        if (!aenderung) { bericht.gleich++; continue; }
        await app.fileManager.processFrontMatter(treffer.f, (x) => { Object.assign(x, neu); });
        bericht.geaendert++;
        continue;
      }
      // neu anlegen (nie leer, damit die Ordner-Automatik des Plugins nichts befüllt)
      if (!app.vault.getAbstractFileByPath(ordner)) await app.vault.createFolder(ordner);
      const basis = sauber(g.einzeln ? `${g.von} ${code || kurz} ${art}` : `${TAGE[g.wt - 1]} ${g.beginn.replace(":", ".")} ${code || kurz} ${art}`);
      let name = basis, i = 2;
      while (app.vault.getAbstractFileByPath(`${ordner}/${name}.md`)) name = `${basis} ${i++}`;
      const yaml = {
        typ: "lehrveranstaltung", titel: `${kurz} · ${art}`, code, modul: m ? `[[${m.f.basename}]]` : "", art,
        ...felder, raum: g.raum, dozent: "", uebersicht: "[[Stundenplan]]",
      };
      const kopf = Object.entries(yaml).map(([k, v]) => Array.isArray(v)
        ? (v.length ? `${k}:\n${v.map((x) => `  - ${x}`).join("\n")}` : `${k}: []`)
        : `${k}: ${typeof v === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? JSON.stringify(v) : v}`).join("\n");
      const wann = g.einzeln ? `${TAGE_LANG[g.wt - 1]}, ${deutsch(g.von)}` : `${TAGE_LANG[g.wt - 1]}s`;
      const inhalt = `---\n${kopf}\ntags:\n  - stundenplan\ncssclasses:\n  - eba-s-notizen\n---\n\n# ${code || kurz} · ${art}\n\n${wann}, ${g.beginn}–${g.ende}${g.raum ? " · " + g.raum : ""}\n\n`
        + `> [!info]- Aus Alma\n> ${g.titel}\n> Aktualisiert sich mit „Stundenplan aus Alma holen“ auf der Seite [[Stundenplan]]. Deine Notizen unten bleiben.\n\n## Notizen\n- \n`;
      await app.vault.create(`${ordner}/${name}.md`, inhalt);
      bericht.neu++;
    }

    // In Alma nicht mehr vorhanden: nur Einträge, die aus Alma stammen, und nur für Semester, die Alma geliefert hat
    if (gruppen.length) for (const x of alt) {
      if (!x.fm.alma_schluessel || benutzt.has(x.f.path) || !semesterImFeed.has(x.fm.semester)) continue;
      await app.vault.trash(x.f, false); // Obsidian-Papierkorb (.trash), wiederherstellbar
      bericht.entfernt++;
    }

    app.saveLocalStorage(STAND, new Date().toISOString());
    const geaendert = bericht.neu + bericht.geaendert + bericht.entfernt;
    if (!still || geaendert) new Notice(`Fertig – ${bericht.termine} Termine aus Alma${geaendert ? ` (${bericht.neu} neu, ${bericht.geaendert} geändert, ${bericht.entfernt} entfernt)` : ""}.`, 6000);
    return bericht;
  };

  // ---------- Verbindung (wiederverwendbar, z. B. für eine „Verbinden“-Karte mit Schloss) ----------
  // Status auf diesem Gerät: verbunden (Link gespeichert) und Zeitpunkt des letzten erfolgreichen Abrufs (ISO) oder null.
  const status = () => ({ verbunden: hatLink(), stand: app.loadLocalStorage(STAND) || null, seit: app.loadLocalStorage(SEIT) || null });
  // Link abfragen (oder übergeben) und sofort importieren. Rückgabe: Bericht von aktualisieren() oder null (abgebrochen).
  // optionen.nurBeiErfolg (Verbinden-Fenster): Scheitert der erste Abruf, gilt wieder der vorherige Zustand (alter Link
  // bzw. keiner), damit kein unbrauchbarer Link gespeichert bleibt. Grund dann in fehler().
  const verbinden = async (vorgabe, optionen = {}) => {
    const vorher = link(), vorherSeit = app.loadLocalStorage(SEIT) || null;
    if (!(await linkSetzen(vorgabe, !!optionen.nurBeiErfolg))) return null;
    const bericht = await aktualisieren({ still: !!optionen.nurBeiErfolg });
    if (!bericht && optionen.nurBeiErfolg) { app.saveLocalStorage(SPEICHER, vorher || null); app.saveLocalStorage(SEIT, vorherSeit); return null; }
    if (bericht && (!vorher || vorher !== link() || !vorherSeit)) app.saveLocalStorage(SEIT, new Date().toISOString());
    return bericht;
  };
  // Link auf diesem Gerät löschen (die Stundenplan-Notizen bleiben).
  const trennen = () => { app.saveLocalStorage(SPEICHER, null); app.saveLocalStorage(STAND, null); app.saveLocalStorage(SEIT, null); };
  const fehler = () => letzterFehler;
  // Knopf „Stundenplan aktualisieren“: mit Link aktualisieren, sonst verbinden; neuerLink = Link neu abfragen.
  // Ohne Link und bei Abbruch: verständliche Meldung statt stillem Nichts.
  const aktualisierenOderVerbinden = async ({ neuerLink = false } = {}) => {
    if (hatLink() && !neuerLink) return await aktualisieren({ still: false });
    const bericht = await verbinden();
    if (!bericht && !hatLink()) new Notice("Kein Stundenplan geholt: Alma ist noch nicht verbunden. Tippe auf „Alma verbinden“.", 10000);
    return bericht;
  };

  return { aktualisieren, linkSetzen, linkPruefen, hatLink, lesen, gruppieren, status, verbinden, trennen, aktualisierenOderVerbinden, fehler };
};
