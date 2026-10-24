// Stundenplan aus Alma in den Tresor übernehmen (iCalendar-Abo-Link aus Alma). Quelle nach dem Quellen-Vertrag (quellen.js,
// docs/architektur/quellen.md „Quellen-Vertrag“ und docs/architektur/aktionen.md „Alma-Stundenplan“).
// Uni-Login (seit 0.4.8, uni-login.js): Den Link holt Studium Autopilot mit deinem Uni-Login auch selbst aus Alma. Zeigt ein Abruf
//   auf den Link (Alma kennt ihn nicht, kein Stundenplan), holt es höchstens einmal am Tag einen neuen und versucht es gleich damit
//   (ablauf, erneuert); beim Verbinden mit einem eingegebenen Link nie.
// Aufruf: ctx.user.alma(ctx).aktualisieren({ still }) bzw. .verbinden() (Link abfragen + importieren); seit 0.4.5 auch von selbst
// (registrieren: Zeitplan quellen.planen, stündlich, nach Fehlern früher, zurück in der App nach über einer Stunde).
// Der Abo-Link ist geheim (wer ihn hat, sieht den Stundenplan). Er liegt NUR im gerätelokalen Speicher
// von Obsidian (app.saveLocalStorage), nie im Vault und wird deshalb auch nicht synchronisiert.
// Nur Obsidian-API (requestUrl, vault, fileManager): läuft auf Windows, macOS, iPad und iPhone.
// Kommt der Stundenplan von außen (eba.quelleExtern „stundenplan“), holt und schreibt Alma nie, egal über welchen Weg
// (Befehl, Knopf, Verbindungen, Zeitplan): nie zwei Schreiber je Quelle. Gefragt bei jedem Lauf.
// Ein Schreiber: Abrufer-Sperre System/Daten/alma-abruf.json (sperre.js, Quelle „alma“), darin auch die Grabsteine „angewendet“.
//   Ein Knopf übernimmt (Hier aktualisieren), der Zeitplan nie. Status gerätelokal (eba-alma-status): Fehler bleiben stehen, bis
//   ein Abruf klappt (vorher blieb die Zeile grün). Fristen: eine Anfrage 60 s, der Abruf bis die Daten da sind 2 Min.; danach
//   ist der Lauf mit Fehler zu Ende, statt bis zum Neustart zu hängen.
// Lebenslauf der Notizen: Alma-Notizen (herkunft: alma; ältere am Kasten „Aus Alma“ erkannt und nachgetragen) fallen weg wie
//   jede erzeugte Notiz (unberührt → Papierkorb, mit deinem Text unter „## Meine Notizen“ → „(entfällt)“); von dir gelöschte kommen
//   nicht wieder, solange sich der Termin in Alma nicht ändert. Von Hand angelegte Notizen, die Alma verknüpft hat, löscht und
//   entkoppelt Alma nie: Fehlen sie in Alma, steht alma_fehlt in der Notiz und ein Punkt in „Bitte prüfen“. Neu in Alma, aber
//   schon vorbei → keine Notiz. Erste Verknüpfung einer Notiz, deren Raum mehr als in der Schreibweise von Alma abweicht →
//   Almas Raum. (Diese drei Regeln stammen aus der Hülle stundenplan-sync.mjs eines eigenen Uni-Abgleichs.)
// Raum, Änderungen und Ausfälle je Termin (seit 20.10.2026, gruppieren): Raum der Serie ist der Raum der kommenden Termine (vorher
//   der häufigste aller Termine), ein einzelner Termin in einem anderen Raum und ein auf eine andere Uhrzeit verschobener Termin
//   stehen in aenderungen („Datum|Beginn|Ende|Raum“, c.t. wie die Notiz), abgesagte Termine in ausfall, 14-tägliche Serien haben
//   rhythmus statt eines Ausfalls jede zweite Woche. Zieht die Serie dauerhaft um (zwei Läufe im Kalender, oder ein Abruf ändert
//   den Raum der Notiz), stehen raum_seit und raum_vorher in der Notiz; die Woche zeigt dann zwei Wochen lang „Neuer Raum“.
// Notizen, die Alma angelegt hat, folgen Alma ganz (seit 24.10.2026): Verlegt Alma Tag oder Zeit, ziehen Kopfzeile („Montags,
//   10:00–12:00 · Raum“, nur vor „## Meine Notizen“ und nur in der Form, die Alma schreibt) und Dateiname mit (nur, solange die
//   Notiz noch ihren abgeleiteten Namen trägt; Links ziehen mit); ein leeres modul wird verknüpft, sobald es die Modulnotiz gibt.
//   Vorher blieben Name und Kopfzeile bei der alten Zeit und modul leer. Von Hand angelegte Notizen behalten Name und Kopf.
// Ohne Semester zu einem Termin (Datenmodell noch nicht geladen, Datum nicht in deiner Semesterliste) übernimmt Alma ihn nicht
//   (gruppieren); vorher entstand ein Doppel mit leerem Semester, das kein Lauf mehr wegräumte.
// Läuft das Skript außerhalb des Plugins (eine Hülle ruft nur aktualisieren({ text }) mit window.app aus Dateien und ohne
//   ctx.user.sperre/quellen), gibt es keine Sperre, keine Grabsteine und keinen Meldekanal; geschrieben wird dann nur über
//   vault.create, vault.trash und fileManager.processFrontMatter (Namen bleiben dort, wie sie sind).
const LAUF = { p: null }; // laufender Abruf, geteilt von allen Aufrufern dieser Fassung (Zeitplan, Knöpfe, Verbindungen)
module.exports = function (ctx) {
  const app = window.app;
  const { requestUrl } = ctx.obsidian;
  // Uni-Login (uni-login.js, Bibliothek): neuen Link holen, wenn Alma den alten nicht mehr kennt; fehlt in der Hülle eines eigenen
  // Uni-Abgleichs (dort nie)
  const uni = () => { const f = ctx.user && ctx.user["uni-login"]; try { return typeof f === "function" ? f(ctx) : null; } catch (e) { return null; } };
  // Hinweise über ctx.hinweis; die Hülle eines eigenen Uni-Abgleichs (stundenplan-sync.mjs) hat keins, dort bleibt es still
  const hinweis = (text, o) => (typeof ctx.hinweis === "function" ? ctx.hinweis(text, o) : null);
  const EXTERN = "Dein Stundenplan kommt über deinen Uni-Abgleich.";
  // Regel aus eba.js über quellen.js extern (gilt auch, wenn auf diesem Gerät noch eba.js einer älteren Fassung liegt); in der
  // Hülle eines eigenen Uni-Abgleichs ohne quellen.js direkt eba.quelleExtern
  const extern = () => {
    try {
      const eba = ctx.user && ctx.user.eba, Q = ctx.user && ctx.user.quellen;
      const e = app.vault.getAbstractFileByPath("System/Einstellungen.md");
      const c = e && app.metadataCache.getFileCache(e);
      const existiert = (p) => !!app.vault.getAbstractFileByPath(p), fm = (c && c.frontmatter) || {};
      if (Q && Q.extern) return Q.extern(eba, "stundenplan", existiert, fm);
      return !!(eba && eba.quelleExtern && eba.quelleExtern("stundenplan", existiert, fm));
    } catch (x) { return false; }
  };

  // ---------- Einstellungen ----------
  const SPEICHER = "eba-alma-ics";        // Schlüssel im gerätelokalen Speicher
  const STAND = "eba-alma-stand";         // letzter erfolgreicher Abruf (gerätelokal)
  const SEIT = "eba-alma-seit";           // verbunden seit (gerätelokal)
  const ORDNER = "Stundenplan";
  const AUS_ALMA = /^> \[!info\]-? Aus Alma/m; // Kasten in jeder Notiz, die Alma selbst angelegt hat
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
    // Host genau so, danach höchstens :443 und dann „/“ (sonst ginge ein Link durch, der nach dem Host mit „:…@“ auf einen anderen Host zeigt); kein „\“
    if (/\\/.test(v) || !/^(https|webcal):\/\/alma\.uni-tuebingen\.de(:443)?\//i.test(v)) return "Das ist kein Alma-Link. Bitte den Link aus „Link kopieren“ einfügen.";
    if (/^(https|webcal):\/\/alma\.uni-tuebingen\.de\/?$/i.test(v)) return "Das ist nur die Alma-Startseite. Bitte den Link aus „Link kopieren“ einfügen.";
    return "";
  };
  const linkSetzen = async (vorgabe, still) => {
    const eingabe = vorgabe != null ? vorgabe : await ctx.system.prompt("Alma-Link einfügen. Du findest ihn in Alma unter Mein Studium → Stundenplan → „Daten für iCalendar (ics) exportieren“ → „Link kopieren“.", "");
    // Esc/Abbrechen (null) oder leere Eingabe: gespeicherten Link nicht anfassen. Löschen geht nur über Trennen (mit Rückfrage,
    // seit 0.4.6; vorher auch mit dem Wort „löschen“ in diesem Feld)
    const neu = String(eingabe ?? "").trim();
    if (!neu) return false;
    // webcal:// ist dieselbe Adresse; aktualisieren() schreibt sie beim Abruf auf https:// um
    const fehler = linkPruefen(neu);
    if (fehler) { hinweis(fehler); return false; }
    app.saveLocalStorage(SPEICHER, neu);
    if (!still) hinweis("Alma-Link auf diesem Gerät gespeichert.");
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
  // VEVENT → { NAME: Wert, …, EXDATE: [], PARAM: { NAME: "TZID=Europe/Berlin" } } (Parameter je Eigenschaft, z. B. für die
  // Zeitzone; der ILIAS-Kalender nutzt denselben Leser, ilias-kalender.js)
  const lesen = (text) => {
    const liste = [];
    let e = null, tiefe = 0;
    for (const zeile of entfalten(text).split("\n")) {
      if (zeile === "BEGIN:VEVENT") { e = { EXDATE: [], PARAM: {} }; tiefe = 0; continue; }
      if (zeile === "END:VEVENT") { if (e) liste.push(e); e = null; continue; }
      if (!e) continue;
      // eingebettete Komponenten (VALARM u. a.) überspringen, ihre Eigenschaften gehören nicht zum Termin
      if (/^BEGIN:/i.test(zeile)) { tiefe++; continue; }
      if (/^END:/i.test(zeile)) { if (tiefe) tiefe--; continue; }
      if (tiefe) continue;
      const i = zeile.indexOf(":");
      if (i < 0) continue;
      const teile = zeile.slice(0, i).split(";"), name = teile[0].toUpperCase(), wert = zeile.slice(i + 1);
      if (name === "EXDATE") e.EXDATE.push(...wert.split(","));
      else { e[name] = wert; if (teile.length > 1) e.PARAM[name] = teile.slice(1).join(";"); }
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
  // Kurztitel: bis 48 Zeichen ganz („Einführung in die Betriebswirtschaftslehre“), sonst an einer Wortgrenze gekürzt und ohne
  // Füllwörter am Ende (nie „Einführung in“)
  const FUELL = /^(für|und|in|im|der|die|das|des|dem|den|zu|zur|zum|von|vom|mit|am|an|auf|of|and|the|for|to)[,;:–-]*$/i;
  const kuerzen = (s, n = 48) => {
    s = String(s).trim();
    if (s.length <= n) return s;
    let aus = "";
    for (const w of s.split(/\s+/)) { const t = aus ? aus + " " + w : w; if (t.length > n) break; aus = t; }
    const teile = aus.split(" ");
    while (teile.length > 1 && FUELL.test(teile[teile.length - 1])) teile.pop();
    return teile.join(" ").replace(/[\s,;:–-]+$/, "") || s.slice(0, n);
  };
  // Titel, die die alte Kürzung kaputt gemacht hat („Einführung in · Veranstaltung“): Teil vor „ · “ endet auf ein Füllwort
  const titelKaputt = (t) => { const v = String(t || "").split(" · ")[0].trim().split(" "); return v.length > 1 && FUELL.test(v[v.length - 1]); };
  const sauber = (s) => String(s).replace(/[\\/:*?"<>|#^\[\]]/g, "-").replace(/\s+/g, " ").trim();

  // Raum einer Serie (seit 20.10.2026; bis dahin der häufigste Raum aller Termine): Läufe gleicher Räume nach Datum (raumNorm,
  // Termine ohne Raum zählen nicht). Raum der Serie ist der Raum des letzten Laufs mit mindestens zwei Terminen, also der Raum,
  // in dem die Serie ab jetzt bzw. am Ende stattfindet; ohne solchen Lauf der häufigste der kommenden Termine (sonst aller).
  // Liegt davor ein anderer Lauf mit mindestens zwei Terminen (einzelne Abweichungen dazwischen zählen nicht), ist das eine
  // dauerhafte Verlegung: seit = erster Termin im neuen Raum, vorher = alter Raum. Jeder Termin in einem anderen als dem
  // erwarteten Raum (vor seit der alte, sonst der neue) ist eine einzelne Abweichung → { d, raum }.
  // raumAm: Map Datum → Raum, tag: heute (ISO) → { raum, seit, vorher, abweichungen }
  const raeumeLesen = (raumAm, tag) => {
    const mit = [...raumAm.keys()].sort().map((d) => ({ d, r: raumAm.get(d), k: raumNorm(raumAm.get(d)) }));
    if (!mit.length) return { raum: "", seit: "", vorher: "", abweichungen: [] };
    const laeufe = [];
    for (const x of mit) {
      const l = laeufe[laeufe.length - 1];
      if (l && l.k === x.k) { l.daten.push(x.d); l.r = x.r; } else laeufe.push({ k: x.k, r: x.r, daten: [x.d] });
    }
    let fin = -1;
    for (let i = laeufe.length - 1; i >= 0; i--) if (laeufe[i].daten.length >= 2) { fin = i; break; }
    let raum, k, seit = "", vorher = "", vk = "";
    if (fin < 0) {
      const kommend = mit.filter((x) => x.d >= tag), pool = kommend.length ? kommend : mit;
      const zahl = new Map();
      for (const x of pool) zahl.set(x.k, (zahl.get(x.k) || 0) + 1);
      const best = pool.reduce((a, x) => (zahl.get(x.k) > zahl.get(a.k) ? x : a), pool[0]);
      raum = best.r; k = best.k;
    } else {
      raum = laeufe[fin].r; k = laeufe[fin].k;
      let anfang = fin, j = fin - 1;
      for (; j >= 0; j--) {
        if (laeufe[j].k === k) { anfang = j; continue; }
        if (laeufe[j].daten.length === 1) continue;
        break;
      }
      if (j >= 0) { seit = laeufe[anfang].daten[0]; vorher = laeufe[j].r; vk = laeufe[j].k; }
    }
    const abweichungen = mit.filter((x) => x.k !== (seit && x.d < seit ? vk : k)).map((x) => ({ d: x.d, raum: x.r }));
    return { raum, seit, vorher, abweichungen };
  };
  const tageZwischen = (a, b) => Math.round((tagObj(b) - tagObj(a)) / 864e5);

  // Einzeltermine gleicher Art (Titel, Wochentag, Uhrzeit, Semester) zu einem Eintrag zusammenfassen. tag: heute (ISO), für den
  // Raum der kommenden Termine. Seit 20.10.2026 außerdem:
  //  - abgesagte Termine (STATUS:CANCELLED, auch als Einzeltermin einer Serie) stehen als Ausfall in ihrer Serie (vorher fehlten
  //    sie nur; am Anfang oder Ende verkürzten sie die Serie);
  //  - 14-täglich: Liegen alle Termine einer Serie (mindestens drei) im Abstand von zwei Wochen, ist sie 14-täglich (rhythmus);
  //    die Wochen dazwischen sind kein Ausfall (die Woche zeigt einen Ausfall seit 20.10.2026 in Warnfarbe);
  //  - Raum je Termin (raeumeLesen): Raum der Serie, einzelne Abweichungen als Änderung, dauerhafte Verlegung (seit, vorher);
  //  - ein auf eine andere Uhrzeit verschobener Termin: Ein einzelner Termin gleichen Titels und Semesters an einem Tag, an dem
  //    genau einer Serie ihr Termin fehlt (ihr Wochentag, ihr Rhythmus, höchstens einen Schritt vor dem ersten bzw. nach dem letzten
  //    Termin), wird eine Änderung dieser Serie statt Ausfall plus eigener Notiz.
  // → [{ schluessel, titel, semester, wt, beginn, ende, gehalten (Tage mit Termin), von, bis, ausfall, raum, einzeln, rhythmus,
  //    seit, vorher, aenderungen: [{ d, beginn, ende, raum }] }]
  const gruppieren = (events, tag) => {
    const stichtag = tag || "";
    const verschoben = new Map(); // UID -> Daten, die durch RECURRENCE-ID ersetzt wurden
    for (const e of events) if (e["RECURRENCE-ID"] && e.UID) {
      const d = zeit(e["RECURRENCE-ID"])?.datum;
      if (d) verschoben.set(e.UID, [...(verschoben.get(e.UID) || []), d]);
    }
    const gruppen = new Map(), abgesagt = [];
    for (const e of events) {
      const titel = klartext(e.SUMMARY);
      if (!titel) continue;
      const raum = klartext(e.LOCATION), aus = /CANCELLED/i.test(e.STATUS || "");
      for (const t of termine(e, e["RECURRENCE-ID"] ? null : verschoben.get(e.UID))) {
        const semester = semesterVon(t.datum);
        // Ohne Semester (Datenmodell noch nicht geladen und das Datum fehlt in deiner Semesterliste) kein Termin: Schlüssel und
        // Semester passten nicht zur Notiz, der Lauf legte ein Doppel an, das kein späterer Lauf mehr wegräumte (seit 24.10.2026)
        if (!semester) continue;
        const schluessel = [semester, titel, wochentag(t.datum), t.beginn, t.ende].join("|");
        if (aus) { abgesagt.push({ schluessel, datum: t.datum }); continue; }
        if (!gruppen.has(schluessel)) {
          gruppen.set(schluessel, { schluessel, titel, semester, wt: wochentag(t.datum), beginn: t.beginn, ende: t.ende, daten: new Set(), raumAm: new Map(),
            abgesagt: new Set(), anders: new Map() });
        }
        const g = gruppen.get(schluessel);
        g.daten.add(t.datum);
        if (raum) g.raumAm.set(t.datum, raum);
      }
    }
    // Abgesagt: nur in einer Serie, die es gibt (eine ganz abgesagte Veranstaltung fehlt wie bisher)
    for (const a of abgesagt) { const g = gruppen.get(a.schluessel); if (g && !g.daten.has(a.datum)) g.abgesagt.add(a.datum); }
    // Schritt je Serie: 14 Tage, wenn alle Termine (mindestens drei) zwei Wochen oder ein Vielfaches davon auseinander liegen
    const alle = (g) => [...g.daten, ...g.abgesagt].sort();
    for (const g of gruppen.values()) {
      const d = alle(g);
      g.schritt = d.length >= 3 && d.every((x, i) => !i || tageZwischen(d[i - 1], x) % 14 === 0) ? 14 : 7;
    }
    // Verschobene Termine (andere Uhrzeit, gleicher Tag) als Änderung ihrer Serie
    const serien = [...gruppen.values()].filter((g) => g.daten.size >= 2);
    for (const e of [...gruppen.values()].filter((g) => g.daten.size === 1 && !g.abgesagt.size)) {
      const d = [...e.daten][0];
      const passt = serien.filter((g) => {
        if (g === e || g.titel !== e.titel || g.semester !== e.semester || g.wt !== e.wt || g.daten.has(d)) return false;
        const a = alle(g), n = tageZwischen(a[0], d);
        return n % g.schritt === 0 && n >= -g.schritt && tageZwischen(a[a.length - 1], d) <= g.schritt;
      });
      if (passt.length !== 1) continue;
      const g = passt[0];
      g.anders.set(d, { beginn: e.beginn, ende: e.ende, raum: e.raumAm.get(d) || "" });
      g.abgesagt.delete(d);
      gruppen.delete(e.schluessel);
    }
    return [...gruppen.values()].map((g) => {
      const daten = [...g.daten, ...g.abgesagt, ...g.anders.keys()].sort(), von = daten[0], bis = daten[daten.length - 1];
      const ausfall = [];
      for (let d = von; d <= bis; d = plus(d, g.schritt)) if (!g.daten.has(d) && !g.anders.has(d)) ausfall.push(d);
      const R = raeumeLesen(g.raumAm, stichtag);
      const erwartet = (d) => (R.seit && d < R.seit ? R.vorher : R.raum);
      const aenderungen = R.abweichungen.map((x) => ({ d: x.d, beginn: g.beginn, ende: g.ende, raum: x.raum }))
        .concat([...g.anders.entries()].map(([d, x]) => ({ d, beginn: x.beginn, ende: x.ende, raum: x.raum || erwartet(d) })))
        .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
      const gehalten = [...g.daten, ...g.anders.keys()].sort();
      return { schluessel: g.schluessel, titel: g.titel, semester: g.semester, wt: g.wt, beginn: g.beginn, ende: g.ende, gehalten, von, bis, ausfall,
        raum: R.raum, seit: R.seit, vorher: R.vorher, aenderungen, rhythmus: g.schritt === 14 ? "14-täglich" : "", einzeln: daten.length === 1 };
    });
  };

  // Automatische Stundenplan-Notizen anderer Quellen gehören nicht dazu: zentrale Vorlesungen (herkunft: zentral, zentral.js), deine
  // Gruppe (herkunft: ilias-gruppe aus ilias.js, gruppe-gewaehlt aus gruppen.js, beide über meine-gruppe.js) und jede andere
  // fremde Besitzmarke (Quellen-Vertrag, z. B. herkunft: claude). Alma übernimmt, ändert und löscht sie nie. Steht dieselbe
  // Veranstaltung oder Gruppe in Alma, legt Alma ihre eigene Notiz an; wer die andere schreibt, erkennt das und räumt sie weg
  // (eigener Text darin wandert in die Alma-Notiz). So schreibt nie mehr als ein Skript in eine Notiz.
  const HERKUNFT = "alma";
  const fremd = (fm) => { const h = String((fm && fm.herkunft) || "").trim(); return !!h && h !== HERKUNFT; };
  const vorhandene = (ordner) => app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(ordner + "/"))
    .map((f) => ({ f, fm: app.metadataCache.getFileCache(f)?.frontmatter || {} })).filter((x) => x.fm.typ === "lehrveranstaltung" && !fremd(x.fm));
  const gleich = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const liste = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String).sort();
  // Raum gleich bis auf die Schreibweise? („Kupferbau HS 25“ = „Hörsaal 25 Kupferbau“)
  const raumNorm = (r) => String(r || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/hoersaal|horsaal/g, "hs")
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).sort().join(" ");

  // ---------- Quellen-Vertrag: Status, Sperre, Grabsteine ----------
  const Q = () => (ctx.user && ctx.user.quellen) || null;
  // Ein Papierkorb für alles (quellen.js); in der Hülle eines eigenen Uni-Abgleichs ohne quellen.js (oder mit einer älteren
  // Fassung ohne papierkorb, solange der Sync nach einem Update noch läuft) der Papierkorb im Tresor
  const papierkorb = (f) => (Q() && Q().papierkorb ? Q().papierkorb(app, f) : app.vault.trash(f, false));
  const SPERRE = "System/Daten/alma-abruf.json"; // sperre.js, Quelle „alma“; dazu „angewendet“ (Grabsteine)
  const STATUS = "eba-alma-status";              // gerätelokal: { geprueft, versucht, fehler, fehlerZeit, warnungen, fehlerSerie, anderes }
  const jetzt = () => (ctx.date && ctx.date.jetzt ? ctx.date.jetzt() : new Date());
  const heute = () => {
    if (ctx.date && ctx.date.now) return ctx.date.now("YYYY-MM-DD");
    const t = berlin.formatToParts(new Date()), g = (x) => t.find((y) => y.type === x).value;
    return `${g("year")}-${g("month")}-${g("day")}`;
  };
  const lstatus = () => { const s = app.loadLocalStorage(STATUS); return Object.assign({ geprueft: "", versucht: "", fehler: "", fehlerZeit: "", warnungen: [], fehlerSerie: 0, anderes: "" }, s && typeof s === "object" ? s : {}); };
  const lstatusSetzen = (x) => app.saveLocalStorage(STATUS, Object.assign(lstatus(), x));
  // Nach einem Lauf: e = { ok: true, warnungen } | { ok: false, fehler }; geprueft = letzter Erfolg (eba-alma-stand bleibt für ältere
  // Fassungen auf demselben Gerät)
  const nachLauf = (e) => {
    const t = jetzt().toISOString(), q = Q();
    const neu = q ? q.nachLauf(lstatus(), e, t) : Object.assign(lstatus(), e.ok ? { geprueft: t, fehler: "", fehlerZeit: "", warnungen: e.warnungen || [] } : { fehler: e.fehler, fehlerZeit: t }, { versucht: t });
    app.saveLocalStorage(STATUS, Object.assign(neu, { anderes: "" }));
    if (e.ok) app.saveLocalStorage(STAND, t);
  };
  const datei = (p) => { const f = app.vault.getAbstractFileByPath(p); return f && !f.children ? f : null; };
  const textLesen = async (p) => { const f = datei(p); return f ? app.vault.read(f) : null; };
  const textSchreiben = async (p, t) => {
    const f = datei(p);
    if (f) { if ((await app.vault.read(f)) !== t) await app.vault.modify(f, t); return; }
    const o = p.slice(0, p.lastIndexOf("/"));
    if (o && !app.vault.getAbstractFileByPath(o)) { try { await app.vault.createFolder(o); } catch (e) { /* gibt es schon */ } }
    await app.vault.create(p, t);
  };
  const S = () => (ctx.user && ctx.user.sperre) || null;
  const mitSperre = () => !!(S() && Q() && app.vault.modify && app.vault.read);
  const geraetId = () => (ctx.zentral && ctx.zentral.geraetId ? ctx.zentral.geraetId() : String(app.loadLocalStorage("eba-geraet") || "g-ohne-id"));
  const sperre = () => S().erzeugen({ io: { lesen: textLesen, schreiben: textSchreiben }, quelle: HERKUNFT, geraetId, jetzt,
    mobil: !!(ctx.obsidian.Platform && ctx.obsidian.Platform.isMobile) });
  const sperrDatei = async () => { try { const o = JSON.parse((await textLesen(SPERRE)) || "null"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
  const angewendetSchreiben = async (a) => {
    const o = await sperrDatei();
    if (gleich(o.angewendet || {}, a)) return;
    o.angewendet = a;
    await textSchreiben(SPERRE, JSON.stringify(o, null, 1) + "\n");
  };
  const hashVon = (g) => (Q() ? Q().kurzHash([g.schluessel, g.von, g.bis, g.raum]) : "");
  // Eigener Text unter „## Meine Notizen“ oder „## Notizen“ (quellen.js; außerhalb des Plugins dieselbe Regel hier, leere Aufzählungspunkte zählen nicht)
  const meineNotizen = (text) => {
    if (Q()) return Q().meineNotizen(text);
    const m = /^## (?:Meine Notizen|Notizen)[ \t]*$/m.exec(String(text));
    return m ? String(text).slice(m.index + m[0].length).split(/\r?\n/).filter((z) => !/^\s*(?:[-*+]\s*)?$/.test(z)).join("\n").trim() : "";
  };
  const wegfall = (fm, text) => (Q() ? Q().wegfall(fm, text) : fm.entfaellt === true ? "bleibt" : meineNotizen(text) ? "entfaellt" : "papierkorb");
  // Text einer Notiz ändern, wo es geht (Plugin: vault.process); außerhalb des Plugins nur das Frontmatter
  const textAendern = async (f, fn) => { if (app.vault.process) await app.vault.process(f, fn); };
  const ENTFAELLT = " (entfällt)";
  // Kopfzeile, wie Alma sie schreibt: „Montags, 10:00–12:00 · Raum“ bzw. einzeln „Montag, 12.10.2026, 10:00–12:00 · Raum“
  const KOPFZEILE = /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)(s|, \d{2}\.\d{2}\.\d{4}), \d{1,2}:\d{2}–\d{1,2}:\d{2}( · .*)?$/;
  // Notiz umbenennen, wenn sie noch ihren abgeleiteten Namen alt trägt (auch „alt 2“), auf den ersten freien Namen wie beim
  // Anlegen; Links ziehen mit (fileManager.renameFile). Die Hülle eines eigenen Uni-Abgleichs hat renameFile nicht: Name bleibt.
  const umbenennen = async (f, alt, neu) => {
    const b = f.basename, ordner = f.path.slice(0, f.path.lastIndexOf("/"));
    if (alt === neu || !app.fileManager.renameFile || !(b === alt || (b.indexOf(alt + " ") === 0 && /^\d+$/.test(b.slice(alt.length + 1))))) return;
    let name = neu, i = 2;
    while (app.vault.getAbstractFileByPath(`${ordner}/${name}.md`)) name = `${neu} ${i++}`;
    await app.fileManager.renameFile(f, `${ordner}/${name}.md`);
  };

  // ---------- Hauptfunktion ----------
  // optionen: still (keine Meldung ohne Änderung), automatisch (Zeitplan: nie ein Hinweis, übernimmt nie die Sperre), text
  // (iCalendar direkt, zum Testen und für Hüllen außerhalb des Plugins), ordner (zum Testen)
  // → Bericht { termine, neu, geaendert, gleich, entfernt, entfaellt, fehlt, vorbei, geloescht, doppel, warnung } oder null
  //   (extern, nicht verbunden, Fehler, ein anderes Gerät schreibt; Grund in fehler() bzw. status())
  let letzterFehler = "";
  // Fristen (iOS-sicher: requestUrl lässt sich nicht abbrechen, eine späte Antwort wird verworfen): eine Anfrage an Alma höchstens
  // ANFRAGE_FRIST, der ganze Abruf bis die Daten da sind (Sperre, Anfrage, Lesen) höchstens LAUF_FRIST. Danach ist der Lauf zu
  // Ende (LAUF frei, Fehler im Status, Zeitplan wie nach jedem Fehler); geschrieben wird erst nach dem Abruf, nur der Tresor.
  const ANFRAGE_FRIST = 60e3, LAUF_FRIST = 120e3, FRIST = "alma-frist";
  const ZU_LANGE = "Alma hat nicht rechtzeitig geantwortet. Neuer Versuch später.";
  const mitFrist = (p, ms) => {
    if (!ctx.zeit || !ctx.stopp) return p; // Hülle außerhalb des Plugins: ohne Zeitgeber, ohne Frist
    return new Promise((ja, nein) => {
      let aus = false;
      const id = ctx.zeit(() => { if (!aus) { aus = true; nein(new Error(FRIST)); } }, ms);
      Promise.resolve(p).then((v) => { if (!aus) { aus = true; ctx.stopp(id); ja(v); } }, (e) => { if (!aus) { aus = true; ctx.stopp(id); nein(e); } });
    });
  };
  const aktualisieren = async (optionen = {}) => {
    if (LAUF.p) return LAUF.p;
    LAUF.p = ablauf(optionen);
    try { return await LAUF.p; } finally { LAUF.p = null; }
  };
  // Sperre nehmen und den Stundenplan holen → { text } | { anderes: true } | { fehler, linkFehler } (Text für Status und Hinweis;
  // linkFehler: Antwort zeigt auf den Link, Alma kennt ihn nicht oder liefert keinen Stundenplan)
  const holen = async (sp, text, automatisch, lauf) => {
    // Ein Schreiber: der Zeitplan wartet, solange ein anderes Gerät schreibt; ein Knopf übernimmt
    if (sp && !(await sp.nehmen({ erzwingen: !automatisch }))) {
      const p = await sp.pruefen();
      if (!lauf.aus) lstatusSetzen({ anderes: (p.sperre && p.sperre.zuletzt) || jetzt().toISOString(), versucht: jetzt().toISOString() });
      return { anderes: true };
    }
    if (text != null) return { text };
    let antwort;
    // Nur für Tests (docs/architektur/testeinstiege.md): plugin.testAbruf(url) → { status, text } ersetzt den Abruf (kein Netz)
    const abrufen = ctx.plugin && typeof ctx.plugin.testAbruf === "function" ? ctx.plugin.testAbruf : requestUrl;
    try { antwort = await mitFrist(abrufen({ url: link().replace(/^webcal:/i, "https:"), method: "GET", throw: false }), ANFRAGE_FRIST); }
    catch (e) { antwort = { status: 0, zuLange: !!e && e.message === FRIST }; }
    // als Bytes holen und vor dem Dekodieren entfalten (siehe bytesLesen); Rückfall auf .text
    let roh = "";
    if (antwort.status === 200) { try { roh = antwort.arrayBuffer ? bytesLesen(antwort.arrayBuffer) : antwort.text || ""; } catch (e) { roh = antwort.text || ""; } }
    if (antwort.status === 200 && /BEGIN:VCALENDAR/.test(roh)) return { text: roh };
    return { fehler: antwort.zuLange ? ZU_LANGE : antwort.status === 200 ? "Alma hat keinen Stundenplan geliefert. Bitte den Link aus „Link kopieren“ einfügen."
      : antwort.status ? `Alma antwortet nicht (Fehler ${antwort.status}). Bitte den Link in Alma neu kopieren.` : "Keine Verbindung zu Alma. Bitte Internet prüfen und erneut versuchen.",
    // 403 nicht: so bremst Alma (wie in alma-konto.js „Stopp für den Tag“), ein neuer Link hilft dann nicht
    linkFehler: !antwort.zuLange && [200, 401, 404, 410].indexOf(antwort.status) >= 0 };
  };
  const ablauf = async (optionen) => {
    const { still = false, ordner = ORDNER, automatisch = false } = optionen;
    letzterFehler = "";
    if (extern()) { letzterFehler = EXTERN; if (!still && !automatisch) hinweis(EXTERN); return null; }
    if (optionen.text == null && !link()) {
      letzterFehler = "Alma ist noch nicht verbunden.";
      if (!still && !automatisch) hinweis("Alma ist noch nicht verbunden.", { aktion: { text: "Verbinden", aktion: "verbinden", parameter: { id: "alma" } } });
      return null;
    }
    const sp = mitSperre() ? sperre() : null;
    const lauf = { aus: false };
    let h;
    try { h = await mitFrist(holen(sp, optionen.text, automatisch, lauf), LAUF_FRIST); }
    catch (e) { if (!e || e.message !== FRIST) throw e; lauf.aus = true; h = { fehler: ZU_LANGE }; }
    if (h.anderes) return null;
    // Mit deinem Uni-Login holt uni-login.js höchstens einmal am Tag einen neuen Link; damit gleich noch einmal
    const U = h.linkFehler && !optionen.erneuert && optionen.text == null ? uni() : null;
    let neu = "";
    if (U) { try { neu = await U.erneuern("alma", link()); } catch (e) { neu = ""; } }
    if (neu) { app.saveLocalStorage(SPEICHER, neu); return ablauf(Object.assign({}, optionen, { erneuert: true })); }
    if (h.fehler) {
      letzterFehler = h.fehler;
      nachLauf({ ok: false, fehler: letzterFehler });
      if (!still && !automatisch) hinweis(letzterFehler);
      return null;
    }
    const text = h.text;
    const angewendet = sp ? (await sperrDatei()).angewendet || {} : null;
    const bericht = await anwenden(text, ordner, angewendet);
    if (sp && bericht.angewendet) await angewendetSchreiben(bericht.angewendet);
    delete bericht.angewendet;
    const warnungen = [];
    if (bericht.warnung) warnungen.push(bericht.warnung);
    if (bericht.fehlt) warnungen.push(bericht.fehlt === 1 ? "Eine deiner Stundenplan-Notizen steht nicht mehr in Alma." : `${bericht.fehlt} deiner Stundenplan-Notizen stehen nicht mehr in Alma.`);
    nachLauf({ ok: true, warnungen });
    const q = Q();
    if (q) q.meldenNeu(ctx);
    const teile = [["neu", "neu"], ["geaendert", "geändert"], ["entfernt", "entfernt"], ["entfaellt", "entfallen"]].filter((x) => bericht[x[0]]).map((x) => `${bericht[x[0]]} ${x[1]}`);
    if (bericht.fehlt) teile.push(`${bericht.fehlt} fehlen in Alma`);
    if (!automatisch && (!still || teile.length)) {
      hinweis(`Stundenplan aktualisiert, ${bericht.termine} ${bericht.termine === 1 ? "Lehrveranstaltung" : "Lehrveranstaltungen"} aus Alma${teile.length ? ` (${teile.join(", ")})` : ""}.`);
    }
    return bericht;
  };

  // iCalendar → Notizen. angewendet = Grabsteine (alma_schluessel → Prüfsumme) oder null (ohne Sperre: keine Grabsteine)
  const anwenden = async (text, ordner, angewendet) => {
    const tag = heute();
    const gruppen = gruppieren(lesen(text), tag);
    const semesterImFeed = new Set(gruppen.map((g) => g.semester));
    const schluesselImFeed = new Set(gruppen.map((g) => g.schluessel));
    const ms = alleModule();
    const bericht = { termine: gruppen.length, neu: 0, geaendert: 0, gleich: 0, entfernt: 0, entfaellt: 0, fehlt: 0, vorbei: 0, geloescht: 0, doppel: 0, warnung: "" };
    // Notizen, die Obsidian gerade noch einliest (angelegt oder per Sync), fehlen im metadataCache: dann nichts anlegen
    const unfertig = app.vault.getMarkdownFiles().some((f) => f.path.startsWith(ordner + "/") && !app.metadataCache.getFileCache(f));
    let alt = vorhandene(ordner);
    // Wem gehört die Notiz? Alma (herkunft: alma; ältere Fassungen: Kasten „Aus Alma“) oder dir (von Hand, Alma hat sie nur verknüpft)
    for (const x of alt) {
      x.text = x.fm.alma_schluessel || x.fm.herkunft === HERKUNFT ? await app.vault.cachedRead(x.f) : "";
      x.eigen = x.fm.herkunft === HERKUNFT || (!!x.fm.alma_schluessel && AUS_ALMA.test(x.text));
    }
    // Doppel einer Alma-Notiz (Sync-Verzug, Konfliktkopie): zusammenführen wie jede Quelle (quellen.js dubletten)
    const q = Q();
    if (q && app.vault.modify) {
      for (const g of q.doppelGruppen(alt.filter((x) => x.eigen), (x) => x.fm.alma_schluessel)) {
        const d = q.dubletten(g.map((x) => ({ pfad: x.f.path, fm: x.fm, text: x.text })), "## Meine Notizen");
        const bleibt = g.find((x) => x.f.path === d.bleibt);
        if (d.text) { await app.vault.modify(bleibt.f, d.text); bleibt.text = d.text; }
        for (const p of d.weg) { const x = g.find((y) => y.f.path === p); await papierkorb(x.f); bericht.doppel++; }
        alt = alt.filter((x) => d.weg.indexOf(x.f.path) < 0);
      }
    }
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

    // Grabsteine nach dem Lauf: Semester, die Alma nicht geliefert hat, bleiben, wie sie sind
    const neuAngewendet = {};
    if (angewendet) for (const k of Object.keys(angewendet)) if (!semesterImFeed.has(k.split("|")[0])) neuAngewendet[k] = angewendet[k];

    for (const g of gruppen) {
      const { m, code, art } = info.get(g.schluessel);
      const treffer = zuordnung.get(g.schluessel);
      const h = hashVon(g);
      // Kurztitel für neue Notizen: Titel der Modulnotiz, sonst aus einer vorhandenen Notiz gleichen Codes (nie aus einer mit
      // anderer Art oder einem kaputt gekürzten Titel), sonst aus dem Alma-Titel
      const vorbild = alt.filter((x) => code && x.fm.code === code && x.fm.titel && !titelKaputt(x.fm.titel) && artPasst(x.fm.art, art))
        .sort((a, b) => (a.fm.art === art ? 0 : 1) - (b.fm.art === art ? 0 : 1))[0];
      const kurz = m && m.fm.titel ? kuerzen(String(m.fm.titel)) : vorbild ? String(vorbild.fm.titel).split(" · ")[0].replace(/ \(entfällt\)$/, "")
        : kuerzen(g.titel.replace(code, "").replace(/^[\s\-–:·]+/, ""));
      // Dateiname und Kopfzeile („Montags, 10:00–12:00 · Raum“, einzeln „Montag, 12.10.2026, …“) aus Tag und Zeit
      const nameVon = (einzeln, von, wt, beginn) => sauber(einzeln ? `${von} ${code || kurz} ${art}` : `${TAGE[wt - 1]} ${String(beginn).replace(":", ".")} ${code || kurz} ${art}`);
      const kopfzeile = (einzeln, von, wt, beginn, ende, raum) => `${TAGE_LANG[wt - 1]}${einzeln ? ", " + deutsch(von) : "s"}, ${beginn}–${ende}${raum ? " · " + raum : ""}`;
      // Änderungen als „Datum|Beginn|Ende|Raum“ (findetStatt); ct: die Notiz ist c.t., dann beginnt auch eine Änderung zur vollen
      // Stunde 15 Minuten später und endet 15 Minuten früher (wie die Serie). null = Feld fällt weg (leer, nicht 14-täglich …).
      const aenderungenText = (ct) => {
        const l = g.aenderungen.map((a) => {
          let b = a.beginn, e = a.ende;
          const mb = minuten(b), me = minuten(e);
          if (ct && mb != null && me != null && mb % 60 === 0 && me - mb > 30) { b = uhrPlus(b, 15); e = uhrPlus(e, -15); }
          return `${a.d}|${b}|${e}|${a.raum}`;
        });
        return l.length ? l : null;
      };
      const felder = {
        wochentag: g.wt, tag: TAGE[g.wt - 1], beginn: g.beginn, ende: g.ende, semester: g.semester,
        von: g.von, bis: g.bis, ausfall: g.ausfall, aenderungen: aenderungenText(false), rhythmus: g.rhythmus || null,
        raum_seit: g.seit || null, raum_vorher: g.vorher || null, einzeltermin: g.einzeln,
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
        const ct = nb != null && ne != null && nb === minuten(kb) + 15 && ne === minuten(ke) - 15 && ab % 60 === 0 && ae - ab > 30;
        if (ct) { neu.beginn = uhrPlus(g.beginn, 15); neu.ende = uhrPlus(g.ende, -15); }
        neu.aenderungen = aenderungenText(ct);
        // Raum: leer -> aus Alma füllen; bei der ersten Verknüpfung (noch kein alma_raum) gilt Alma, wenn er mehr als in der
        // Schreibweise abweicht; danach nur überschreiben, wenn er sich in Alma seit dem letzten Abruf geändert hat
        if (g.raum && (!fm.raum || (fm.alma_raum && fm.alma_raum !== g.raum) || (!fm.alma_raum && raumNorm(fm.raum) !== raumNorm(g.raum)))) neu.raum = g.raum;
        // Dauerhafte Verlegung (raum_seit, raum_vorher; die Woche hebt den neuen Raum zwei Wochen lang hervor): aus dem Kalender
        // (zwei Läufe, raeumeLesen); sonst, wenn dieser Abruf den Raum der Notiz mehr als in der Schreibweise ändert (Alma nennt für
        // die ganze Serie einen neuen Raum, auch für vergangene Termine, oder die erste Verknüpfung bringt einen anderen), ab dem
        // nächsten Termin mit deinem bisherigen Raum als altem; sonst bleibt eine frühere Angabe, solange sie etwas sagt.
        const naechster = g.gehalten.filter((d) => d >= tag)[0] || "";
        const seitAlt = fm.raum_seit ? String(fm.raum_seit).slice(0, 10) : "", vorherAlt = fm.raum_vorher ? String(fm.raum_vorher) : "";
        if (g.seit) Object.assign(neu, { raum_seit: g.seit, raum_vorher: g.vorher });
        else if (neu.raum && fm.raum && raumNorm(fm.raum) !== raumNorm(neu.raum) && naechster) Object.assign(neu, { raum_seit: naechster, raum_vorher: String(fm.raum) });
        else if (seitAlt && vorherAlt && raumNorm(vorherAlt) !== raumNorm(neu.raum || fm.raum)) Object.assign(neu, { raum_seit: seitAlt, raum_vorher: vorherAlt });
        else Object.assign(neu, { raum_seit: null, raum_vorher: null });
        // kaputt gekürzter Titel einer Notiz, die Alma selbst angelegt hat (Kasten „Aus Alma“; alte Fassung): neu aus dem Kurztitel.
        // Von Hand angelegte Notizen behalten ihren Titel.
        if (treffer.eigen && titelKaputt(fm.titel)) neu.titel = `${kurz} · ${fm.art || art}`;
        // Alma-Notiz kommt wieder (war „entfällt“): Titel ohne „(entfällt)“
        if (fm.entfaellt === true) neu.titel = String(neu.titel || fm.titel || "").replace(/ \(entfällt\)$/, "");
        // Modul noch leer (die Modulnotiz kam erst nach der Notiz): jetzt verknüpfen, nur in Notizen, die Alma angelegt hat
        if (treffer.eigen && m && !String(fm.modul == null ? "" : fm.modul).trim()) neu.modul = `[[${m.f.basename}]]`;
        // Alma hat Tag oder Zeit verlegt: Kopfzeile und Name ziehen mit (nur Notizen, die Alma angelegt hat). Der alte Name aus den
        // alten Feldern (Beginn wie in Alma: aus dem bisherigen alma_schluessel)
        const verlegt = treffer.eigen && (Number(fm.wochentag) !== neu.wochentag || String(fm.beginn || "") !== neu.beginn || String(fm.ende || "") !== neu.ende
          || (neu.einzeltermin && String(fm.von || "").slice(0, 10) !== neu.von));
        const nameAlt = nameVon(fm.einzeltermin === true, String(fm.von || "").slice(0, 10), Number(fm.wochentag), kb);
        const aenderung = Object.entries(neu).some(([k, v]) => k === "ausfall" || k === "aenderungen" ? !gleich(liste(fm[k]), liste(v)) : !gleich(fm[k] == null ? null : String(fm[k]), v == null ? null : String(v)))
          || fm.entfaellt === true || fm.alma_fehlt != null || (treffer.eigen && fm.herkunft !== HERKUNFT);
        if (!aenderung) bericht.gleich++;
        else {
          const raumAlt = fm.raum, warEntfallen = fm.entfaellt === true;
          await app.fileManager.processFrontMatter(treffer.f, (x) => {
            Object.assign(x, neu);
            for (const k of Object.keys(neu)) if (neu[k] == null) delete x[k]; // leere Felder fallen weg (aenderungen, rhythmus …)
            delete x.entfaellt; delete x.alma_fehlt;
            if (treffer.eigen) x.herkunft = HERKUNFT; // Besitzmarke (ältere Alma-Notizen hatten keine)
          });
          // Kopfzeile unter der Überschrift („Montags, 10:00–12:00 · Raum“) zieht mit, sonst bleibt dein Text unangetastet. Verlegt:
          // die Zeile ganz neu, aber nur vor dem ersten Abschnitt (## Meine Notizen) und nur, wenn sie so aussieht, wie Alma sie schreibt
          if (verlegt) {
            const zeile = kopfzeile(neu.einzeltermin, neu.von, neu.wochentag, neu.beginn, neu.ende, neu.raum || raumAlt);
            await textAendern(treffer.f, (t) => {
              const i = t.search(/^## /m), kopf = i < 0 ? t : t.slice(0, i);
              return kopf.split("\n").map((z) => (KOPFZEILE.test(z) ? zeile : z)).join("\n") + (i < 0 ? "" : t.slice(i));
            });
          } else if (neu.raum && raumAlt && neu.raum !== raumAlt) {
            await textAendern(treffer.f, (t) => t.split("\n").map((z) => (TAGE_LANG.some((w) => z.indexOf(w) === 0) && z.indexOf(`· ${raumAlt}`) >= 0 ? z.replace(`· ${raumAlt}`, `· ${neu.raum}`) : z)).join("\n"));
          }
          if (warEntfallen) await textAendern(treffer.f, (t) => t.replace(/^(# .*?) \(entfällt\)$/m, "$1"));
          // Name („Mo 10.00 B110 Vorlesung“) nur, solange die Notiz noch so heißt; Links ziehen mit (umbenennen)
          if (verlegt) await umbenennen(treffer.f, nameAlt, nameVon(neu.einzeltermin, neu.von, neu.wochentag, g.beginn));
          bericht.geaendert++;
        }
        if (angewendet) neuAngewendet[g.schluessel] = h;
        continue;
      }
      // Von dir gelöscht (Grabstein, Termin in Alma unverändert): bleibt weg
      if (angewendet && Q().geloescht(angewendet, g.schluessel, h)) { neuAngewendet[g.schluessel] = h; bericht.geloescht++; continue; }
      // Schon vorbei (z. B. ein Vorkurs vor Semesterbeginn): keine neue Notiz
      if (g.bis < tag) { bericht.vorbei++; continue; }
      if (unfertig) continue;
      // neu anlegen (nie leer, damit die Ordner-Automatik des Plugins nichts befüllt)
      if (!app.vault.getAbstractFileByPath(ordner)) await app.vault.createFolder(ordner);
      const basis = nameVon(g.einzeln, g.von, g.wt, g.beginn);
      let name = basis, i = 2;
      while (app.vault.getAbstractFileByPath(`${ordner}/${name}.md`)) name = `${basis} ${i++}`;
      const yaml = {
        typ: "lehrveranstaltung", titel: `${kurz} · ${art}`, code, modul: m ? `[[${m.f.basename}]]` : "", art,
        ...felder, herkunft: HERKUNFT, raum: g.raum, dozent: "", uebersicht: "[[Stundenplan]]",
      };
      const kopf = Object.entries(yaml).filter(([, v]) => v != null).map(([k, v]) => Array.isArray(v)
        ? (v.length ? `${k}:\n${v.map((x) => `  - ${x}`).join("\n")}` : `${k}: []`)
        : `${k}: ${typeof v === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? JSON.stringify(v) : v}`).join("\n");
      const inhalt = `---\n${kopf}\ntags:\n  - stundenplan\ncssclasses:\n  - eba-s-notizen\n---\n\n# ${code || kurz} · ${art}\n\n${kopfzeile(g.einzeln, g.von, g.wt, g.beginn, g.ende, g.raum)}\n\n`
        + `> [!info] Aus Alma (${g.titel}). Änderungen in Alma kommen von selbst.\n\n## Meine Notizen\n- \n`;
      await app.vault.create(`${ordner}/${name}.md`, inhalt);
      if (angewendet) neuAngewendet[g.schluessel] = h;
      bericht.neu++;
    }

    // In Alma nicht mehr vorhanden (nur Semester, die Alma geliefert hat; Ende vor mehr als 30 Tagen: unverändert):
    //   Alma-Notiz → unberührt in den Papierkorb, mit deinem Text „(entfällt)“; deine eigene Notiz → nie löschen, nie entkoppeln,
    //   nur alma_fehlt (Punkt in „Bitte prüfen“). Fehlen auf einmal mehr als die Hälfte (und mehr als 2), bleibt alles stehen.
    const weg = gruppen.length ? alt.filter((x) => x.fm.alma_schluessel && !benutzt.has(x.f.path) && semesterImFeed.has(x.fm.semester)
      && x.fm.entfaellt !== true && !(x.fm.bis && String(x.fm.bis) < plus(tag, -30))) : [];
    const verknuepft = alt.filter((x) => x.fm.alma_schluessel && semesterImFeed.has(x.fm.semester) && x.fm.entfaellt !== true).length;
    if (weg.length > 2 && weg.length > verknuepft / 2) {
      bericht.warnung = `${weg.length} Lehrveranstaltungen fehlen auf einmal in Alma – nichts entfernt.`;
      return Object.assign(bericht, { angewendet: angewendet ? Object.assign({}, angewendet, neuAngewendet) : null });
    }
    for (const x of weg) {
      if (!x.eigen) {
        if (!x.fm.alma_fehlt) await app.fileManager.processFrontMatter(x.f, (fm) => { fm.alma_fehlt = tag; });
        bericht.fehlt++;
        continue;
      }
      const w = wegfall(x.fm, x.text);
      if (w === "papierkorb") { await papierkorb(x.f); bericht.entfernt++; continue; }
      if (w !== "entfaellt") continue;
      await app.fileManager.processFrontMatter(x.f, (fm) => { fm.entfaellt = true; fm.titel = String(fm.titel || "").replace(/ \(entfällt\)$/, "") + ENTFAELLT; fm.herkunft = HERKUNFT; });
      await textAendern(x.f, (t) => t.replace(/^(# (?!.*\(entfällt\)$).*)$/m, "$1" + ENTFAELLT));
      bericht.entfaellt++;
    }
    return Object.assign(bericht, { angewendet: angewendet ? neuAngewendet : null });
  };

  // ---------- Verbindung (wiederverwendbar, z. B. für eine „Verbinden“-Karte mit Schloss) ----------
  // Status auf diesem Gerät in der gemeinsamen Form der Quellen: { zustand (extern | nicht-verbunden | laeuft | fehler |
  // anderes-geraet | an), geprueft, fehler, fehlerZeit, warnungen }, dazu verbunden, stand (= geprueft oder null), seit, anderes
  // (letzte Aktivität des anderen Geräts), laeuft, extern.
  const status = () => {
    const s = lstatus(), verbunden = hatLink(), ex = extern();
    const geprueft = s.geprueft || app.loadLocalStorage(STAND) || "";
    const zustand = ex ? "extern" : !verbunden ? "nicht-verbunden" : LAUF.p ? "laeuft" : s.fehler ? "fehler" : s.anderes ? "anderes-geraet" : "an";
    return { zustand, geprueft, fehler: s.fehler, fehlerZeit: s.fehler ? s.fehlerZeit : "", warnungen: Array.isArray(s.warnungen) ? s.warnungen : [],
      verbunden, stand: geprueft || null, seit: app.loadLocalStorage(SEIT) || null, anderes: s.anderes || "", laeuft: !!LAUF.p, extern: ex };
  };
  // Link abfragen (oder übergeben) und sofort importieren. Rückgabe: Bericht von aktualisieren() oder null (abgebrochen
  // oder gescheitert). Scheitert der erste Abruf, gilt wieder der vorherige Zustand (alter Link bzw. keiner), damit kein
  // unbrauchbarer Link gespeichert bleibt; Grund in fehler(). optionen.nurBeiErfolg (Verbinden-Fenster): keine Hinweise,
  // das Fenster zeigt das Ergebnis selbst.
  const verbinden = async (vorgabe, optionen = {}) => {
    const vorher = link(), vorherSeit = app.loadLocalStorage(SEIT) || null;
    letzterFehler = "";
    // Stundenplan von außen: gar nicht erst nach dem Link fragen
    if (extern()) { letzterFehler = EXTERN; if (!optionen.nurBeiErfolg) hinweis(EXTERN); return null; }
    if (!(await linkSetzen(vorgabe, true))) return null;
    // erneuert: beim Verbinden keinen anderen Link holen (der eingegebene soll gelten)
    const bericht = await aktualisieren({ still: !!optionen.nurBeiErfolg, erneuert: true });
    if (!bericht) { app.saveLocalStorage(SPEICHER, vorher || null); app.saveLocalStorage(SEIT, vorherSeit); if (!vorher) app.saveLocalStorage(STATUS, null); return null; }
    if (bericht && (!vorher || vorher !== link() || !vorherSeit)) app.saveLocalStorage(SEIT, new Date().toISOString());
    return bericht;
  };
  // Link auf diesem Gerät löschen (die Stundenplan-Notizen bleiben); die Sperre wird frei, ein anderes Gerät mit Link übernimmt
  const trennen = () => {
    app.saveLocalStorage(SPEICHER, null); app.saveLocalStorage(STAND, null); app.saveLocalStorage(SEIT, null); app.saveLocalStorage(STATUS, null);
    if (mitSperre()) sperre().freigeben().catch(() => {});
  };
  const fehler = () => letzterFehler || lstatus().fehler;
  // Knopf „Stundenplan aktualisieren“: mit Link aktualisieren, sonst verbinden; neuerLink = Link neu abfragen.
  // Ohne Link und bei Abbruch: verständliche Meldung statt stillem Nichts.
  const aktualisierenOderVerbinden = async ({ neuerLink = false } = {}) => {
    if (hatLink() && !neuerLink) return await aktualisieren({ still: false });
    const bericht = await verbinden();
    // verbunden: Knöpfe und Zeilen gleich ohne „Alma verbinden“, auch wenn sich am Stundenplan nichts ändert
    if (bericht && ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen();
    // abgebrochen ohne Link: erklären; gescheitert: aktualisieren() hat den Grund schon gemeldet
    if (!bericht && !hatLink() && !letzterFehler) hinweis("Alma ist noch nicht verbunden.", { aktion: { text: "Verbinden", aktion: "verbinden", parameter: { id: "alma" } } });
    return bericht;
  };

  // Punkte für „Bitte prüfen“ (quellen.js, Meldekanal): deine eigenen Stundenplan-Notizen, die in Alma fehlen (alma_fehlt,
  // synchronisiert, darum auf jedem Gerät), höchstens 14 Tage lang und nicht nach dem Ende der Veranstaltung
  const hinweise = () => {
    const t = heute(), ab = plus(t, -14);
    return app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(ORDNER + "/")).map((f) => ({ f, fm: app.metadataCache.getFileCache(f)?.frontmatter || {} }))
      .filter((x) => x.fm.alma_fehlt && String(x.fm.alma_fehlt) >= ab && !(x.fm.bis && String(x.fm.bis) < t) && !fremd(x.fm))
      .map((x) => ({ text: `**Stundenplan** · ${String(x.fm.titel || x.f.basename)} steht nicht mehr in Alma. Fällt sie aus, lösch die Notiz.`, pfad: x.f.path }));
  };

  // Zeitplan (quellen.js planen): erster Abruf 30 s + Zufall bis 2 Min. nach dem Einlesen, dann stündlich; nach einem Fehler nach
  // 5, 15, 30 Min.; zurück in der App nach über einer Stunde. Nur mit Link auf diesem Gerät und nie, wenn der Stundenplan von
  // außen kommt. Testeinstieg: plugin.testStundenplanAus = true (kein automatischer Abruf).
  const registrieren = () => {
    const q = Q();
    if (!q) return;
    q.melden(ctx, HERKUNFT, hinweise);
    const bald = ctx.entprellen(() => q.meldenNeu(ctx), 1500);
    ctx.an(app.metadataCache, "changed", (f) => { if (f && f.path.startsWith(ORDNER + "/")) bald(); });
    q.planen(ctx, { takt: 60 * 60e3, zurueck: 60 * 60e3, backoff: [5 * 60e3, 15 * 60e3, 30 * 60e3], start: [30e3, 90e3],
      versucht: () => Date.parse(lstatus().versucht || "") || 0,
      lauf: async () => {
        if ((ctx.plugin && ctx.plugin.testStundenplanAus) || !hatLink() || extern()) return null;
        const b = await aktualisieren({ still: true, automatisch: true });
        if (ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen();
        return b ? true : lstatus().fehler ? false : null;
      } });
  };

  return { registrieren, aktualisieren, linkSetzen, linkPruefen, hatLink, lesen, gruppieren, status, verbinden, trennen, aktualisierenOderVerbinden, fehler, hinweise, raumNorm,
    zeit, bytesLesen, klartext };
};
