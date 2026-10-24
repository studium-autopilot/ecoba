// Wochenraster auf Dashboard und Stundenplan: Codeblock ```eba-woche``` (in der Karte > [!eba-kennzahlen|woche …]).
// Zeigt eine Kalenderwoche Montag bis Freitag (die Planwoche des Fachmodells: am Samstag und Sonntag schon die nächste) mit den
// Stundenplan-Notizen (typ: lehrveranstaltung, jede Herkunft: Alma, eigener Abgleich, zentral, ILIAS-Gruppe, gewählte Gruppe,
// von Hand). Ob eine Sitzung stattfindet, sagt ctx.modell.findetStatt (eine Regel mit „Als Nächstes“ der Modulseite): ein Kasten
// bis zu bis (Einzeltermin nur an seinem Tag), vor von blass mit „ab TT.MM.“ (eine gewählte Gruppe steht gleich nach der
// Anmeldung da, nicht erst ab ihrer ersten Woche); Ausfall (ausfall, Pausen, vorlesungsfreie Tage wie Christi
// Himmelfahrt) mit durchgestrichenem Namen und „Fällt aus“, Änderung (aenderungen) mit neuer Zeit und neuem Raum („HS 9 statt
// HS 1“). Seit 20.10.2026 ist jede Ausnahme dieser Lehrveranstaltung (Ausfall aus ausfall, andere Zeit, anderer Raum; Klasse
// ausnahme) in Warnfarbe, Ausfall wegen einer Pause oder eines freien Tags bleibt leise; vorher sah ein Ausfall blass aus wie
// „ab TT.MM.“ und eine Änderung war nur gestrichelt umrandet. Überschneidungen nebeneinander. Oben kräftig der Kurzname (kurz der Notiz oder des Moduls,
// sonst Code), blass Art und Gruppe (nur Übung, Tutorium, Seminar; Name aus gruppe), darunter Raum, davor der Beginn, wenn er
// nicht zur vollen Stunde liegt. Kopfzeile rechts „‹ KW n ›“; Wischen nach links/rechts wechselt am Touch-Gerät die Woche.
// Welche Woche: nur auf diesem Gerät (app.saveLocalStorage, Schlüssel eba-woche-versatz, nie im Vault, nie abgeglichen), so
// blättern zwei Geräte unabhängig. Nach 30 Minuten ohne Wechsel und nach jedem Neustart von Obsidian wieder die aktuelle Woche
// (der Wert trägt die Sitzung). „KW n“ ist in einer anderen Woche der Weg zurück.
// Bis 17.10.2026 war das Raster eine Bases-Formel; Bases liest keinen gerätelokalen Speicher, darum jetzt hier. DOM und Klassen
// sind dieselben (eba-core.css Abschnitte 13, 33, 39, 47, 54, 55). Schreibt keine Datei. Neu gezeichnet (entprellt) bei
// Änderungen an Stundenplan-, Modul- und Einstellungsnotizen und an den Semesterdaten, beim Zurückkommen in die App und alle
// 10 Minuten.
// Je Modul und Art steht nur eine Gruppe da (meine-gruppe.js doppelt, dieselbe Reihenfolge wie beim Zusammenführen); eine
// Alma-Notiz zu einer anderen Gruppe deines Kurses fehlt ebenso (seit 20.10.2026). Den Warnpunkt einer Überschneidung hat eine
// Gruppen-Notiz (ILIAS, gewählt), deren übliche Zeit sich mit einer anderen Notiz im Raster überschneidet, nie mit einer
// verdeckten, entfallenen oder einer mit „Besuche ich nicht“; gerechnet beim Zeichnen (seit 24.10.2026, vorher Feld konflikt).
// Ein blasser Kasten (beginnt erst) teilt sich nie die Breite mit einem echten: Überschneidet er einen, steht er schmal am
// rechten Rand, eine Vorlesung wird nie halbiert (spalten).
// Schmale Karte (iPhone, unter 520 px, eba-core.css 55): Tagesansicht statt Raster (seit 19.10.2026). Kopf „KW n“ mit ‹ ›, fünf
// Tage mit Datum (heute betont, Punkt bei Lehrveranstaltungen, Strich in Warnfarbe an Tagen mit Ausfall oder Änderung), darunter
// die Lehrveranstaltungen des gewählten Tags über die ganze Breite mit vollem Namen, Zeit und Raum, bei einer Ausnahme zuerst der
// kurze Text („Fällt aus“, „Anderer Raum“ …) und der übliche Wert durchgestrichen; was erst beginnt, als leise Zeile („Tutorium
// BWL · ab 04.11. · Mi 14:15“).
// Wischen wechselt den Tag (über Freitag hinaus die Woche). Welcher Tag: wie die Woche nur auf diesem Gerät (eba-woche-tag),
// sonst heute bzw. am Wochenende Montag (Planwoche des Fachmodells). Beide Ansichten werden gezeichnet, die Breite entscheidet
// im CSS (Container-Abfrage), so passt es auch nach dem Drehen.
module.exports = function (ctx) {
  const app = window.app;
  const SPRACHE = "eba-woche";
  const SCHLUESSEL = "eba-woche-versatz";
  const TAG_SCHLUESSEL = "eba-woche-tag";
  const FRISCH_MS = 30 * 60 * 1000;
  const SCHMAL = 22; // % der Tagesspalte für einen blassen Kasten neben einem echten
  const WEIT = 60; // Wochen in jede Richtung
  const WISCHEN = 50; // px Mindestweg
  const RAND = 30; // px: Wischen vom Bildschirmrand gehört Obsidian (Seitenleisten)
  const HOEHE = { "Dashboard.md": 497 }; // Höhe des Rasters in px (am PC/iPad nur Stundenplan, Dashboard hat feste Viertelstunden)
  const HOEHE_SONST = 697;
  // Die Seite Stundenplan zeigt immer das Raster, auch schmal (seit 20.10.2026); überall sonst (Dashboard) schmal die
  // Tagesansicht. Am Pfad, nicht an einem Argument
  // im Codeblock: Hat jemand die Seite geändert, ersetzt das Update sie nicht (Klasse „seite“), der Pfad gilt trotzdem.
  const NUR_RASTER = ["Studium/Stundenplan.md"];
  const mitTag = (pfad) => NUR_RASTER.indexOf(String(pfad || "")) < 0;
  const TAGE = ["Mo", "Di", "Mi", "Do", "Fr"];
  const TAGE_LANG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
  const VORLESUNG = ["Vorlesung", "Veranstaltung"]; // „Veranstaltung“ = Alma ohne erkannte Art
  const KEINE = "Keine Lehrveranstaltungen";

  // ---------- Datum (Ortszeit, ganze Tage auch über die Zeitumstellung) ----------
  const M = () => ctx.modell; // Fachmodell (modell.js), beim Zeichnen nachgeschlagen
  const zwei = (n) => (n < 10 ? "0" : "") + n;
  const iso = (d) => d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate());
  const datum = (s) => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const tagMonat = (s) => { const d = datum(s); return zwei(d.getDate()) + "." + zwei(d.getMonth() + 1) + "."; };
  const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const liste = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

  // Montag der gezeigten Woche ohne Blättern: die Planwoche (Montag bis Freitag diese, Samstag und Sonntag die nächste)
  const aktuellerMontag = (jetzt) => datum(M().planwoche(iso(jetzt)).mo);
  // ISO-Kalenderwoche
  const kw = (d) => M().zeit.kw(iso(d));

  // ---------- Gezeigte Woche: nur auf diesem Gerät ----------
  // Sitzung: neu bei jedem Start von Obsidian (ctx.bleibend überlebt nur den Hot-Reload dieses Skripts)
  const sitzung = ctx.bleibend("sitzung", () => String(Date.now()) + "-" + Math.round(Math.random() * 1e6));
  // Rohwert aus dem Gerätespeicher → Versatz in Wochen (0 = aktuelle Woche). Gilt nur in derselben Sitzung und höchstens
  // 30 Minuten nach dem letzten Wechsel.
  const versatzAus = (roh, jetztMs, sitz) => {
    let o = roh;
    if (typeof o === "string") { try { o = JSON.parse(o); } catch (e) { return 0; } }
    if (!o || typeof o !== "object" || o.sitzung !== sitz) return 0;
    const v = Number(o.versatz), alter = jetztMs - Number(o.zeit);
    if (!isFinite(v) || Math.round(v) !== v || Math.abs(v) > WEIT || !(alter >= 0 && alter < FRISCH_MS)) return 0;
    return v;
  };
  const versatzWert = (v, jetztMs, sitz) => (v ? JSON.stringify({ versatz: v, zeit: jetztMs, sitzung: sitz }) : null);
  const versatz = () => versatzAus(app.loadLocalStorage(SCHLUESSEL), ctx.date.jetzt().getTime(), sitzung);
  const versatzSetzen = (v) => {
    const n = Math.max(-WEIT, Math.min(WEIT, Math.round(Number(v) || 0)));
    app.saveLocalStorage(SCHLUESSEL, versatzWert(n, ctx.date.jetzt().getTime(), sitzung));
  };
  // Tag der Tagesansicht (0 = Montag … 4 = Freitag): gewählt gilt wie der Versatz nur in derselben Sitzung und 30 Minuten, sonst
  // heute (in der aktuellen Woche, Montag bis Freitag) bzw. Montag (andere Woche, Wochenende: die Planwoche beginnt erst)
  const tagAus = (roh, jetztMs, sitz) => {
    let o = roh;
    if (typeof o === "string") { try { o = JSON.parse(o); } catch (e) { return null; } }
    if (!o || typeof o !== "object" || o.sitzung !== sitz) return null;
    const t = Number(o.tag), alter = jetztMs - Number(o.zeit);
    return [0, 1, 2, 3, 4].indexOf(t) >= 0 && alter >= 0 && alter < FRISCH_MS ? t : null;
  };
  const tagWahl = (gewaehlt, W) => (gewaehlt != null ? gewaehlt : W.ht ? W.wt - 1 : 0);
  const tagSetzen = (t) => app.saveLocalStorage(TAG_SCHLUESSEL, JSON.stringify({ tag: t, zeit: ctx.date.jetzt().getTime(), sitzung }));
  const tagGewaehlt = () => tagAus(app.loadLocalStorage(TAG_SCHLUESSEL), ctx.date.jetzt().getTime(), sitzung);

  // ---------- Kasten: Text ----------
  const istUebung = (fm) => !!fm.art && VORLESUNG.indexOf(String(fm.art)) < 0;
  // Kurzname: kurz der Notiz, sonst kurz des Moduls (nach Code), sonst Code, sonst der Titel vor „ · “
  const kurzname = (fm, kurzVonCode) => {
    if (fm.kurz) return String(fm.kurz);
    const code = fm.code ? String(fm.code) : "";
    if (code && kurzVonCode && kurzVonCode[code]) return String(kurzVonCode[code]);
    return code || String(fm.titel || "").split(" · ")[0];
  };
  // Art und Gruppe (nur Übung, Tutorium, Seminar …): gruppe ist der Anzeigename („Gruppe 4“, „Tutorium 1“), nie gruppe_alma.
  // Beginnt er mit der Art, steht nur er da; eine bloße Zahl wird „Gruppe n“.
  const artText = (fm) => {
    if (!istUebung(fm)) return "";
    const art = String(fm.art), g = fm.gruppe == null ? "" : String(fm.gruppe).trim();
    if (!g) return art;
    if (/^[0-9]+$/.test(g)) return art + " Gruppe " + g;
    return g.toLowerCase().indexOf(art.toLowerCase()) === 0 ? g : art + " " + g;
  };

  // ---------- Kasten: Lage ----------
  const zeit = (s) => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? { h: +m[1], m: +m[2] } : null; };
  const zeileVon = (z, h0) => (z.h - h0) * 4 + Math.floor(z.m / 15) + 2;
  const zeileBis = (z, h0) => (z.h - h0) * 4 + Math.ceil(z.m / 15) + 2;
  // Überschneidungen je Tag nebeneinander: Gruppen sich überlappender Kästen, je Kasten Spalte und Spaltenzahl der Gruppe
  // (gruppeVon: Kasten → seine Gruppe)
  const teilen = (kaesten, gruppeVon) => {
    const nachTag = {};
    for (const k of kaesten) (nachTag[k.tag] = nachTag[k.tag] || []).push(k);
    for (const tag of Object.keys(nachTag)) {
      const ks = nachTag[tag].slice().sort((a, b) => a.von - b.von || b.bis - a.bis);
      let gruppe = [], ende = -1;
      const abschliessen = () => { const n = gruppe.reduce((m, k) => Math.max(m, k.spalte + 1), 1); for (const k of gruppe) { k.spalten = n; gruppeVon.set(k, gruppe); } };
      for (const k of ks) {
        if (gruppe.length && k.von >= ende) { abschliessen(); gruppe = []; ende = -1; }
        const belegt = gruppe.filter((x) => x.bis > k.von).map((x) => x.spalte);
        let s = 0;
        while (belegt.indexOf(s) >= 0) s++;
        k.spalte = s;
        gruppe.push(k);
        ende = Math.max(ende, k.bis);
      }
      if (gruppe.length) abschliessen();
    }
  };
  // Blasse Kästen (spaeter: beginnt erst) teilen sich die Breite nie mit echten. Überschneidet eine Gruppe blasser Kästen einen
  // echten, steht sie schmal am rechten Rand (schmal, Klasse „schmal“), und die echten Gruppen daneben lassen dafür Platz (rand):
  // Eine Vorlesung wird so nie halbiert.
  const spalten = (kaesten) => {
    const gruppeVon = new Map();
    const echt = kaesten.filter((k) => !k.spaeter), blass = kaesten.filter((k) => k.spaeter);
    teilen(echt, gruppeVon);
    teilen(blass, gruppeVon);
    const ueber = (a, b) => a.tag === b.tag && a.von < b.bis && b.von < a.bis;
    for (const b of blass) {
      if (b.schmal) continue;
      const gruppe = gruppeVon.get(b);
      const daneben = echt.filter((k) => gruppe.some((x) => ueber(x, k)));
      if (!daneben.length) continue;
      for (const x of gruppe) { x.schmal = true; if (x.klassen) x.klassen.push("schmal"); }
      for (const k of daneben) for (const x of gruppeVon.get(k)) x.rand = true;
    }
    return kaesten;
  };
  // Breite und Abstand links in % der Tagesspalte (null: ganze Spalte)
  const lage = (k) => {
    const n = k.spalten || 1, s = k.spalte || 0;
    if (n === 1 && !k.schmal && !k.rand) return null;
    const breite = k.schmal ? SCHMAL : k.rand ? 100 - SCHMAL : 100, ab = k.schmal ? 100 - SCHMAL : 0;
    const r = (x) => Math.round(x * 100) / 100;
    return { breite: r(breite / n), links: r(ab + (breite * s) / n) };
  };

  // ---------- Woche berechnen (reine Logik, ohne DOM) ----------
  // notizen: [{ pfad, fm }] mit typ lehrveranstaltung; kurzVonCode: { Code: Kurzname }; modulPfad: { Name der Modulnotiz: Pfad };
  // modell: ctx.modell (Semester, Pausen, freie Tage, findetStatt); montag: Date; jetzt: Date; verdeckt: { Pfad: … } (eine Gruppe
  // je Modul und Art, meine-gruppe.js doppelt: weitere Gruppen-Notizen fehlen im Raster); ohneBeginn: Die zentralen Vorlesungen
  // warten auf den Studienbeginn (ctx.zentral.stundenplan(), verfuegbar und ohneBeginn) → beginnFehlt, wenn sonst „Keine
  // Lehrveranstaltungen“ dastünde
  const wocheBauen = ({ notizen, kurzVonCode, modulPfad, modell, montag, jetzt, verdeckt, ohneBeginn }) => {
    const tage = [0, 1, 2, 3, 4].map((i) => iso(plus(montag, i)));
    const heute = iso(jetzt), wt = jetzt.getDay() || 7;
    const ht = wt <= 5 && tage[wt - 1] === heute;
    // Semester nach dem Freitag der gezeigten Woche (deine Semesterliste, sonst zentral bzw. nach Regel)
    const sem = modell.semesterFuer(tage[4]);
    const pw = modell.daten().pausen.filter((p) => p.von <= tage[4] && p.bis >= tage[0]);
    // nie: entfallen oder „Besuche ich nicht“ (findetStatt prüft das vor dem Tag)
    const nie = (fm) => ["entfaellt", "ausgeblendet"].indexOf(modell.findetStatt(fm, tage[0]).grund) >= 0;
    const lv = notizen.filter(({ pfad, fm }) => sem && fm.semester === sem.name && !(verdeckt && verdeckt[pfad]) && !nie(fm) && zeit(fm.beginn) && zeit(fm.ende));
    // Überschneidung einer Gruppen-Notiz (ILIAS, gewählt) mit einer anderen Notiz, die das Raster zeigt: gleicher Wochentag,
    // übliche Zeiten überlappen, kein Einzeltermin, nicht dieselbe Gruppe → Name der anderen Notiz oder "". Hier gerechnet (seit
    // 24.10.2026); vorher stand sie beim Schreiben im Feld konflikt und blieb, auch wenn die andere Notiz die Zeit wechselte.
    const GRUPPE = ["ilias-gruppe", "gruppe-gewaehlt"];
    const minuten = (s) => { const z = zeit(s); return z ? z.h * 60 + z.m : null; };
    const konfliktMit = (pfad, fm) => {
      if (GRUPPE.indexOf(String(fm.herkunft || "")) < 0) return "";
      const b = minuten(fm.beginn), e = minuten(fm.ende), id = String(fm.gruppe_id || "");
      const x = lv.find((y) => y.pfad !== pfad && y.fm.einzeltermin !== true && Number(y.fm.wochentag) === Number(fm.wochentag)
        && !(id && String(y.fm.gruppe_id || "") === id) && minuten(y.fm.beginn) < e && b < minuten(y.fm.ende));
      return x ? String(x.pfad).split("/").pop().replace(/\.md$/, "") : "";
    };
    // Größe des Rasters aus allen Serien des Semesters (dazu Einzeltermine und geänderte Zeiten dieser Woche), damit es von
    // Woche zu Woche gleich bleibt
    const aenderungIn = (fm) => liste(fm.aenderungen).map((x) => String(x).split("|")).filter((x) => x.length >= 4 && tage.indexOf(x[0]) >= 0 && zeit(x[1]) && zeit(x[2]))[0] || null;
    const spannen = [];
    for (const { fm } of lv) {
      if (fm.einzeltermin !== true || tage.indexOf(M().zeit.iso(fm.von)) >= 0) spannen.push([zeit(fm.beginn), zeit(fm.ende)]);
      const a = aenderungIn(fm);
      if (a) spannen.push([zeit(a[1]), zeit(a[2])]);
    }
    const h0 = spannen.length ? Math.min.apply(null, spannen.map((s) => s[0].h)) : 8;
    const h1 = spannen.length ? Math.max.apply(null, spannen.map((s) => s[1].h + (s[1].m > 0 ? 1 : 0))) : 18;
    const rows = Math.max(1, (h1 - h0) * 4);
    // Je Notiz ihr Tag der Woche und ob sie dort stattfindet (Ausfall, Pause, freier Tag → durchgestrichen). Vor ihrem Beginn
    // (Tag vor von, etwa ein Tutorium ab der vierten Woche) blass mit „ab TT.MM.“, nach bis gar nicht.
    const AUS = ["ausfall", "pause", "frei"];
    const wl = [];
    for (const n of lv) {
      const w = Number(n.fm.wochentag);
      if (!(w >= 1 && w <= 5)) continue;
      const s = modell.findetStatt(n.fm, tage[w - 1]);
      const von = n.fm.einzeltermin === true ? "" : modell.zeit.iso(n.fm.von);
      const ab = s.grund === "ausserhalb" && von && tage[w - 1] < von ? von : "";
      if (s.statt || ab || AUS.indexOf(s.grund) >= 0) wl.push(Object.assign({ s, ab }, n));
    }
    // Fällt in der Woche alles aus, steht ein Satz da; außer eine Lehrveranstaltung fällt selbst aus (ausfall): Dann zeigt die
    // Woche ihre Kästen, damit man den Ausfall sieht
    const gehalten = wl.filter(({ s }) => s.statt || s.grund === "ausfall");
    let leer = "";
    if (!gehalten.length) {
      if (pw.length) leer = pw[0].name || "Vorlesungsfrei";
      else if (sem && sem.vb && tage[4] < sem.vb) leer = "Vorlesungsbeginn " + tagMonat(sem.vb);
      else if (sem && sem.ve && tage[0] > sem.ve) leer = "Vorlesungsfrei";
      else leer = KEINE;
    }
    const nun = jetzt.getHours() * 60 + jetzt.getMinutes();
    const kaesten = !gehalten.length ? [] : wl.map(({ pfad, fm, s, ab }) => {
      const tag = Number(fm.wochentag);
      const aen = s.geaendert;
      const b = aen ? zeit(s.beginn) : zeit(fm.beginn), e = aen ? zeit(s.ende) : zeit(fm.ende);
      const raum = s.raum; // findetStatt: der Raum an diesem Tag (Änderung, sonst der übliche)
      const zeitText = aen ? s.beginn + "–" + s.ende : String(fm.beginn) + "–" + String(fm.ende);
      const aus = !s.statt && !ab;
      // Ausnahme dieser Lehrveranstaltung (Warnfarbe): Ausfall aus ausfall (nicht Pause oder freier Tag) oder an diesem Tag ein
      // anderer Raum bzw. eine andere Zeit, auch ein neuer Raum in den ersten zwei Wochen nach einer Verlegung (neuerRaum). Kurzer
      // Text dazu (marke), in der Tagesansicht vor Raum und Zeit.
      const raumNeu = !aus && !ab && s.raumGeaendert, zeitNeu = !aus && !ab && s.zeitGeaendert;
      const ausnahme = (aus && s.grund === "ausfall") || raumNeu || zeitNeu;
      const marke = aus ? "Fällt aus" : raumNeu && zeitNeu ? "Geändert" : raumNeu ? (s.neuerRaum ? "Neuer Raum" : "Anderer Raum") : zeitNeu ? "Andere Zeit" : "";
      const klassen = ["eba-ev", istUebung(fm) ? "ue" : "vl"], konflikt = konfliktMit(pfad, fm);
      if (konflikt) klassen.push("konflikt");
      if (aen) klassen.push("geaendert");
      if (ausnahme) klassen.push("ausnahme");
      if (ab) klassen.push("spaeter");
      else if (aus) klassen.push("ausfall");
      // „jetzt“ nach der Zeit dieses Tages (bei einer Änderung die neue, seit 20.10.2026; vorher die übliche)
      else if (ht && tag === wt) { klassen.push("heute"); if (b.h * 60 + b.m <= nun && nun <= e.h * 60 + e.m) klassen.push("jetzt"); }
      // Antippen öffnet das Modul über seinen vollen Pfad, nie über den Namen (den könnte eine andere Notiz auch tragen)
      const modul = String(fm.modul || "").replace(/^\[\[|\]\]$/g, "").split("|")[0].split("#")[0].trim();
      const ziel = (modulPfad && (modulPfad[modul] || modulPfad[modul.replace(/\.md$/, "").split("/").pop()])) || pfad;
      const sonst = [zeitNeu ? s.zeitAlt : "", raumNeu ? s.raumAlt : ""].filter(Boolean).join(" · ");
      // Raster (wenig Platz): bei einer anderen Zeit der neue Beginn und „statt“ der übliche („12:15 statt 10:00“); ändert sich
      // nur das Ende, „bis 13:45 statt 12:00“
      const alt = zeitNeu ? s.zeitAlt.split("–") : [];
      const nurEnde = zeitNeu && alt[0] === s.beginn;
      return {
        tag, pfad, klassen,
        von: Math.max(2, Math.min(rows + 1, zeileVon(b, h0))), bis: Math.max(3, Math.min(rows + 2, zeileBis(e, h0))),
        titel: String(fm.titel || pfad) + " · " + zeitText + " · " + raum + (konflikt ? " · überschneidet sich mit " + konflikt : "")
          + (aus ? " · fällt aus" + (s.name ? " (" + s.name + ")" : "") : "") + (ab ? " · beginnt am " + tagMonat(ab) : "")
          + (marke && !aus ? " · " + marke.charAt(0).toLowerCase() + marke.slice(1) + (sonst ? (s.neuerRaum && !zeitNeu ? ", vorher " : ", sonst ") + sonst : "") : ""),
        notiz: ziel,
        kurz: kurzname(fm, kurzVonCode), art: artText(fm),
        // Beginn nur, wenn er nicht zur vollen Stunde liegt (c.t.) und nicht der Raum wechselt (der braucht den Platz), bei einer
        // Änderung der Zeit der neue Beginn (zeitStatt: der übliche), vor dem Beginn „ab TT.MM.“
        zeit: ab ? "ab " + tagMonat(ab) : zeitNeu ? (nurEnde ? "bis " + s.ende : s.beginn) : !raumNeu && String(fm.beginn).slice(-2) !== "00" ? String(fm.beginn) : "",
        zeitStatt: zeitNeu ? (nurEnde ? alt[1] || "" : alt[0]) : "",
        raum,
        ausnahme, marke, raumNeu, zeitNeu, raumAlt: raumNeu ? s.raumAlt : "", zeitAlt: zeitNeu ? s.zeitAlt : "", grund: aus ? s.name : "",
        // Tagesansicht: Beginn und Ende (bei einer Änderung die neuen), Art auch bei Vorlesungen, Ausfall mit Grund, vor dem Beginn
        // eine leise Zeile „Tutorium BWL · ab 04.11. · Mi 14:15“
        spaeter: !!ab, aus, beginn: aen ? s.beginn : String(fm.beginn), ende: aen ? s.ende : String(fm.ende),
        artLang: artText(fm) || (String(fm.art || "") === "Vorlesung" ? "Vorlesung" : ""),
        ausText: aus ? "Fällt aus" + (s.name ? " (" + s.name + ")" : "") : "",
        leise: ab ? [String(fm.art || "") === "Veranstaltung" ? "" : String(fm.art || ""), kurzname(fm, kurzVonCode)].filter(Boolean).join(" ")
          + " · ab " + tagMonat(ab) + " · " + TAGE[tag - 1] + " " + String(fm.beginn) : "",
      };
    });
    for (const k of kaesten) if (k.bis <= k.von) k.bis = k.von + 1;
    return { tage, ht, wt, h0, h1, rows, kaesten: spalten(kaesten), leer, beginnFehlt: !!ohneBeginn && leer === KEINE, kw: modell.zeit.kw(tage[0]) };
  };
  // Tagesansicht: die fünf Tage (Kurzname, Datum, heute, Punkt bei Lehrveranstaltungen, die stattfinden; Strich in Warnfarbe bei
  // einer Ausnahme: Ausfall oder Änderung, hinweis für Vorlesesoftware und Tooltip) und je Tag die Kästen in der Reihenfolge des
  // Tages (i = 0 Montag … 4 Freitag)
  const tageAus = (W) => W.tage.map((t, i) => {
    const ks = W.kaesten.filter((k) => k.tag === i + 1), aus = ks.some((k) => k.ausnahme && k.aus), anders = ks.some((k) => k.ausnahme && !k.aus);
    return { iso: t, name: TAGE[i], lang: TAGE_LANG[i], datum: Number(t.slice(8, 10)) + ".",
      heute: W.ht && W.wt === i + 1, termine: ks.some((k) => !k.spaeter && !k.aus), ausnahme: aus || anders,
      hinweis: aus && anders ? "Ausfall und Änderung" : aus ? "Ausfall" : anders ? "Änderung" : "" };
  });
  const tagKaesten = (W, i) => W.kaesten.filter((k) => k.tag === i + 1).sort((a, b) => a.von - b.von || a.bis - b.bis || (a.spaeter ? 1 : 0) - (b.spaeter ? 1 : 0));

  // ---------- Lesen (metadataCache) ----------
  const lesen = () => {
    const notizen = [], kurzVonCode = {}, modulPfad = {}; // Semester, Pausen und „Besuche ich nicht“ kommen aus dem Modell
    for (const f of app.vault.getMarkdownFiles()) {
      const fm = (app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (!fm) continue;
      if (fm.typ === "lehrveranstaltung") notizen.push({ pfad: f.path, fm });
      else if (fm.typ === "modul") {
        modulPfad[f.basename] = f.path;
        modulPfad[f.path.replace(/\.md$/, "")] = f.path;
        if (fm.code && fm.kurz) kurzVonCode[String(fm.code)] = String(fm.kurz);
      }
    }
    return { notizen, kurzVonCode, modulPfad };
  };

  // ---------- Zeichnen ----------
  // Satz einer leeren Woche bzw. eines leeren Tags; fehlt der Studienbeginn (beginnFehlt), stattdessen die Bitte mit Link (seit
  // 24.10.2026 hier, auf Dashboard und Stundenplan; vorher nur im Knopf über dem Raster der Seite Stundenplan)
  const leerSatz = (el, W) => {
    if (!W.beginnFehlt) { el.setText(W.leer); return; }
    el.appendText("Deine Vorlesungen kommen von selbst, sobald du deinen ");
    el.createEl("a", { text: "Studienbeginn", href: ctx.link("personalisieren", {}) });
    el.appendText(" eingetragen hast.");
  };
  const knopf = (eltern, cls, text, titel, schritt) => {
    const a = eltern.createEl("a", { cls, text, attr: { href: ctx.link("woche", { schritt }), title: titel, role: "button" } });
    return a;
  };
  const zeichnen = (el, c) => {
    const jetzt = ctx.date.jetzt();
    const v = versatz();
    const montag = plus(aktuellerMontag(jetzt), v * 7);
    const daten = lesen(), L = ctx.user && ctx.user["meine-gruppe"];
    const Z = ctx.zentral && ctx.zentral.gruppen ? ctx.zentral.gruppen() : null;
    const verdeckt = L && L.doppelt ? L.doppelt(daten.notizen, Z ? Z.gruppen : null).verdeckt : null;
    const zp = ctx.zentral && ctx.zentral.stundenplan ? ctx.zentral.stundenplan() : null;
    const W = wocheBauen(Object.assign(daten, { modell: M(), montag, jetzt, verdeckt, ohneBeginn: !!(zp && zp.verfuegbar && zp.ohneBeginn) }));
    const pfad = (c && c.sourcePath) || "";
    const zeileHoehe = Math.round(((HOEHE[pfad] || HOEHE_SONST) / (W.rows + 1)) * 100) / 100;
    el.empty();
    const tag = mitTag(pfad);
    if (tag) tagZeichnen(el, W, v, tagWahl(tagGewaehlt(), W));
    const g = el.createDiv({ cls: "eba-woche" + (tag ? " hat-tag" : ""), attr: { lang: "de", style: "grid-template-rows:34px repeat(" + (W.rows + 1) + ", " + zeileHoehe + "px)" } });
    if (W.ht) g.createEl("i", { cls: "eba-tagspalte", attr: { style: "grid-column:" + (W.wt + 1) } });
    g.createDiv({ cls: "eba-tagkopf eba-ecke", attr: { style: "grid-column:1" } });
    TAGE.forEach((t, i) => {
      const d = plus(montag, i);
      const k = g.createDiv({ cls: "eba-tagkopf" + (W.ht && W.wt === i + 1 ? " heute" : "") + (i === 4 ? " fr" : ""), text: t, attr: { style: "grid-column:" + (i + 2) } });
      const s = k.createSpan({ cls: "eba-tagdatum", text: d.getDate() + "." });
      s.createSpan({ cls: "eba-tagmonat", text: d.getMonth() + 1 + "." });
    });
    const nav = g.createDiv({ cls: "eba-wpfeile", attr: { style: "grid-column:6" } });
    knopf(nav, "eba-wpfeil", "‹", "Woche davor", v - 1);
    const kwEl = v ? knopf(nav, "eba-wkw anders", "", "Zurück zur aktuellen Woche", 0) : nav.createSpan({ cls: "eba-wkw", attr: { title: "Kalenderwoche" } });
    kwEl.createSpan({ text: "KW\u00a0" }); // geschütztes Leerzeichen: bleibt auch in inline-flex (iPhone) stehen
    kwEl.appendText(String(W.kw));
    knopf(nav, "eba-wpfeil", "›", "Woche danach", v + 1);
    for (let h = W.h0; h <= W.h1; h++) {
      const r = "grid-row:" + ((h - W.h0) * 4 + 2);
      g.createSpan({ cls: "eba-zeit", text: zwei(h), attr: { style: r } });
      g.createEl("i", { cls: "eba-linie", attr: { style: r } });
    }
    for (const k of W.kaesten) {
      let stil = "grid-column:" + (k.tag + 1) + ";grid-row:" + k.von + " / " + k.bis;
      const l = lage(k);
      if (l) stil += ";width:calc(" + l.breite + "% - 2px);margin-left:" + l.links + "%";
      const a = g.createEl("a", { cls: k.klassen.join(" "), attr: { title: k.titel, href: ctx.link("zeigen", { notiz: k.notiz }), style: stil } });
      const b = a.createEl("b", { text: k.kurz });
      if (k.art) { b.appendText(" "); b.createEl("i", { text: k.art }); }
      // Zweite Zeile zweimal, das CSS wählt nach der Breite (Abschnitt 55): lang und knapp (schmale Spalten)
      const s = a.createSpan();
      zeileZeichnen(s.createSpan({ cls: "eba-ev-lang" }), k, false);
      zeileZeichnen(s.createSpan({ cls: "eba-ev-knapp" }), k, true);
    }
    if (W.leer) leerSatz(g.createDiv({ cls: "eba-woche-leer", attr: { style: "grid-row:2 / span " + W.rows } }).createSpan(), W);
    wischen(g, v);
  };

  // Zweite Zeile eines Kastens im Raster: Ausfall „Fällt aus“ statt des Raums; sonst [Zeit ·] Raum, eine Änderung in Warnfarbe
  // mit „statt“ und dem üblichen Wert durchgestrichen. knapp (schmale Spalten, Seite Stundenplan auf dem iPhone hochkant): Zeit
  // nur bei einer Änderung und „ab TT.MM.“, Raum gekürzt (raumKnapp), ohne den Namen der Pause
  const zeileZeichnen = (el, k, knapp) => {
    if (k.aus) { el.createSpan({ cls: "eba-ev-marke", text: "Fällt aus" }); if (k.grund && !knapp) el.appendText(" · " + k.grund); return; }
    if (k.zeit && (!knapp || k.zeitNeu || k.spaeter)) {
      el.createEl("time", { cls: k.zeitNeu ? "eba-ev-neu" : undefined, text: k.zeit });
      if (k.zeitStatt) { el.appendText(" statt "); el.createEl("s", { text: k.zeitStatt }); }
      el.appendText(" · ");
    }
    raumZeichnen(el, k, knapp ? raumKnapp : null);
  };
  // Raum kurz für schmale Spalten: ohne Zusatz in Klammern (auch verschachtelt), „Hörsaal“ als „HS“ („Hörsaal 1 (Keplerstraße 2)“
  // → „HS 1“); bliebe nichts, der ganze Raum
  const raumKnapp = (r) => {
    let s = String(r || "");
    while (/\([^()]*\)/.test(s)) s = s.replace(/\s*\([^()]*\)/g, "");
    return s.replace(/Hörsaal\b/g, "HS").replace(/\s+/g, " ").replace(/[\s,]+$/, "").trim() || String(r || "");
  };
  // Raum eines Kastens: geändert in Warnfarbe, dahinter „statt“ und der übliche Raum durchgestrichen („HS 9 statt HS 1“);
  // kuerzen: raumKnapp für schmale Spalten
  const raumZeichnen = (el, k, kuerzen) => {
    const r = (x) => (kuerzen ? kuerzen(x) : x);
    if (!k.raumNeu) { el.appendText(r(k.raum)); return; }
    el.createSpan({ cls: "eba-ev-neu", text: r(k.raum) });
    if (k.raumAlt) { el.appendText(" statt "); el.createEl("s", { text: r(k.raumAlt) }); }
  };

  // Tagesansicht (schmale Karte, iPhone): Kopf, fünf Tage, Lehrveranstaltungen des Tags t über die ganze Breite
  const tagZeichnen = (el, W, v, t) => {
    const box = el.createDiv({ cls: "eba-wt", attr: { lang: "de" } });
    const kopf = box.createDiv({ cls: "eba-wt-kopf" });
    const kwEl = v ? knopf(kopf, "eba-wt-kw anders", "", "Zurück zur aktuellen Woche", 0) : kopf.createSpan({ cls: "eba-wt-kw" });
    kwEl.appendText("KW " + W.kw);
    kopf.createSpan({ cls: "eba-wt-spanne", text: M().zeit.spanne(W.tage[0], W.tage[4]) });
    const nav = kopf.createDiv({ cls: "eba-wt-pfeile" });
    knopf(nav, "eba-wt-pfeil", "‹", "Woche davor", v - 1);
    knopf(nav, "eba-wt-pfeil", "›", "Woche danach", v + 1);
    const leiste = box.createDiv({ cls: "eba-wt-tage", attr: { role: "group", "aria-label": "Tag" } });
    tageAus(W).forEach((d, i) => {
      const cls = ["eba-wt-tag"].concat(i === t ? ["gewaehlt"] : [], d.heute ? ["heute"] : [], d.termine ? ["termine"] : [], d.ausnahme ? ["ausnahme"] : []).join(" ");
      const c = leiste.createDiv({ cls, attr: { role: "button", tabindex: "0", "aria-pressed": String(i === t),
        "aria-label": d.lang + " " + d.datum + (d.heute ? ", heute" : "") + (d.hinweis ? ", " + d.hinweis : ""), title: d.hinweis || null } });
      c.createSpan({ cls: "eba-wt-name", text: d.name });
      c.createSpan({ cls: "eba-wt-datum", text: d.datum });
      const los = (e) => { e.preventDefault(); tagSetzen(i); neu(); };
      c.addEventListener("click", los);
      c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") los(e); });
    });
    const liste = box.createDiv({ cls: "eba-wt-liste" });
    const ks = W.leer ? [] : tagKaesten(W, t);
    if (!ks.length) leerSatz(liste.createDiv({ cls: "eba-wt-leer" }), W.leer ? W : { leer: KEINE });
    for (const k of ks) {
      const href = ctx.link("zeigen", { notiz: k.notiz });
      if (k.spaeter) { liste.createEl("a", { cls: "eba-wt-leise", text: k.leise, attr: { title: k.titel, href } }); continue; }
      const a = liste.createEl("a", { cls: k.klassen.filter((x) => x !== "schmal").join(" "), attr: { title: k.titel, href } });
      const uhr = a.createEl("time", { cls: "eba-wt-uhr" + (k.zeitNeu ? " eba-ev-neu" : "") });
      uhr.createSpan({ text: k.beginn });
      uhr.createSpan({ text: k.ende });
      const b = a.createEl("b", { text: k.kurz });
      if (k.artLang) { b.appendText(" "); b.createEl("i", { text: k.artLang }); }
      // Zweite Zeile: bei einer Ausnahme zuerst der kurze Text („Fällt aus“, „Anderer Raum“ …), bei einer anderen Zeit „statt“ und
      // die übliche Zeit durchgestrichen, dann der Raum („HS 9 statt HS 1“); Ausfall wegen einer Pause mit ihrem Namen
      const ort = a.createSpan({ cls: "eba-wt-ort" });
      const trennen = () => { if (ort.childNodes.length) ort.appendText(" · "); };
      if (k.aus) { ort.createSpan({ cls: "eba-ev-marke", text: "Fällt aus" }); if (k.grund) ort.appendText(" (" + k.grund + ")"); continue; }
      if (k.marke) ort.createSpan({ cls: "eba-ev-marke", text: k.marke });
      if (k.zeitAlt) { trennen(); ort.appendText("statt "); ort.createEl("s", { text: k.zeitAlt }); }
      if (k.raum) { trennen(); raumZeichnen(ort, k); }
      if (!ort.childNodes.length) ort.remove();
    }
    wischen(box, v, t);
  };

  // Wischen (Touch, Hauptweg zum Blättern am iPhone): waagerecht mehr als 50 px und mehr als doppelt so weit wie senkrecht →
  // Woche danach (nach links) bzw. davor. Nicht vom Bildschirmrand (30 px, dort zieht Obsidian die Seitenleisten auf) und
  // nicht auf einem Link oder Kasten begonnen. Ob waagerecht, entscheidet die erste Bewegung über 10 px; erst danach
  // preventDefault (und nicht weiterreichen), senkrechtes Scrollen bleibt also unberührt.
  // Tagesansicht (tag = gezeigter Tag): Wischen wechselt den Tag, über Freitag bzw. Montag hinaus die Woche (tagSchritt). Dort
  // füllen die Kästen die Breite, darum darf das Wischen auf einem Kasten beginnen (ein Tipp öffnet ihn weiter), nur nicht auf ‹ ›.
  const wischen = (g, v, tag) => {
    const tagesansicht = typeof tag === "number";
    let start = null, achse = "";
    const breite = () => (g.ownerDocument && g.ownerDocument.defaultView ? g.ownerDocument.defaultView.innerWidth : 0);
    g.addEventListener("touchstart", (e) => {
      const t = e.touches && e.touches[0];
      const aufLink = !!(e.target && e.target.closest && e.target.closest(tagesansicht ? ".eba-wt-kopf a" : "a"));
      start = t && e.touches.length === 1 && !aufLink && wischStartOk(t.clientX, breite()) ? { x: t.clientX, y: t.clientY } : null;
      achse = "";
    }, { passive: true });
    g.addEventListener("touchmove", (e) => {
      const t = start && e.touches && e.touches[0];
      if (!t) return;
      if (!achse) achse = wischAchse(t.clientX - start.x, t.clientY - start.y);
      if (achse === "v") start = null;
      else if (achse === "h") { if (e.cancelable) e.preventDefault(); e.stopPropagation(); }
    }, { passive: false });
    g.addEventListener("touchend", (e) => {
      const s = start, t = s && achse === "h" && e.changedTouches && e.changedTouches[0];
      start = null;
      if (!t) return;
      const r = wischRichtung(t.clientX - s.x, t.clientY - s.y);
      if (!r) return;
      if (tagesansicht) {
        const z = tagSchritt(v, tag, r);
        if (z.versatz !== v) versatzSetzen(z.versatz);
        tagSetzen(z.tag);
      } else versatzSetzen(v + r);
      neu();
    }, { passive: true });
  };
  // Tagesansicht: ein Tag weiter (r = 1) oder zurück (−1); nach Freitag der Montag der nächsten Woche, vor Montag der Freitag davor
  const tagSchritt = (v, tag, r) => {
    const n = tag + r;
    if (n > 4) return { versatz: v + 1, tag: 0 };
    if (n < 0) return { versatz: v - 1, tag: 4 };
    return { versatz: v, tag: n };
  };
  // Beginnt das Wischen weit genug vom linken und rechten Bildschirmrand?
  const wischStartOk = (x, breite) => x >= RAND && (!breite || x <= breite - RAND);
  // Erste deutliche Bewegung (über 10 px): "h" waagerecht (mehr als doppelt so weit wie senkrecht), "v" sonst, "" noch offen
  const wischAchse = (dx, dy) => (Math.max(Math.abs(dx), Math.abs(dy)) <= 10 ? "" : Math.abs(dx) > 2 * Math.abs(dy) ? "h" : "v");
  // Wischweg → +1 (nach links: Woche danach), −1 (nach rechts: Woche davor), 0 (kein Wischen)
  const wischRichtung = (dx, dy) => (Math.abs(dx) > WISCHEN && Math.abs(dx) > 2 * Math.abs(dy) ? (dx < 0 ? 1 : -1) : 0);

  let block = null;
  const neu = () => { if (block) block.neu(); };
  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      // Das Plugin startet die Erweiterungen alphabetisch, modell.js erst danach: bis dahin der Ersatztext des Blocks
      if (!ctx.modell || !ctx.modell.planwoche) { el.setText(String(quelle || "").trim()); return; }
      try { zeichnen(el, c); } catch (e) { el.setText("Woche: Fehler – " + e.message); console.error("Woche", e); }
    });
    const bald = ctx.entprellen(neu, 400);
    const wichtig = (f, cache) => {
      const typ = cache && cache.frontmatter && cache.frontmatter.typ;
      return typ === "lehrveranstaltung" || typ === "modul" || (f && (f.path === "System/Einstellungen.md" || String(f.path).indexOf("Stundenplan/") === 0
        || String(f.path).indexOf("System/Daten/") === 0));
    };
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => { if (wichtig(f, cache)) bald(); });
    ctx.an(app.metadataCache, "deleted", (f, vorher) => { if (wichtig(f, vorher)) bald(); });
    ctx.an(app.vault, "rename", (f, alt) => { if (wichtig(f, app.metadataCache.getFileCache(f)) || String(alt).indexOf("Stundenplan/") === 0) bald(); });
    // Zurück in der App: 30 Minuten vorbei? neuer Tag? „jetzt“ weitergerückt?
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "visible") bald(); });
    ctx.intervall(() => { if (document.visibilityState === "visible") neu(); }, 10 * 60 * 1000);
  };

  const aktionen = {
    // ‹ › und „KW n“ (Links im Raster): schritt = Versatz in Wochen (0 = aktuelle Woche)
    // „KW n“ zurück zur aktuellen Woche zeigt in der Tagesansicht auch wieder heute
    woche: { ausfuehren: (c) => { versatzSetzen(c.parameter.schritt); if (Number(c.parameter.schritt) === 0) app.saveLocalStorage(TAG_SCHLUESSEL, null); neu(); } },
  };

  return { registrieren, aktionen, aktuellerMontag, kw, versatzAus, versatzWert, versatz, wocheBauen, spalten, lage, kurzname, artText, mitTag, raumKnapp, wischStartOk, wischAchse,
    wischRichtung, tagAus, tagWahl, tageAus, tagKaesten, tagSchritt, leerSatz };
};
