// Lernplan (seit 18.10.2026): Bereich „Lernplan“ (Codeblock ```eba-lernplan``` auf Studium/Lernplan.md), die Zeile oben in
// jeder Lernplan-Notiz (```eba-lernplan modul```), seit 31.10.2026 die Zeile auf dem Dashboard (```eba-lernplan woche```) und die
// auf der Modulseite (modulZeile, modul.js). Regel „70/100“: Nach 70 % der Zeit von Vorlesungsbeginn bis zur Klausur ist der
// ganze Stoff verstanden (nicht beherrscht), danach bleibt die Zeit für die Klausurvorbereitung (Übungen, Altklausuren, Karteikarten).
// Mit Zielnote bis 1,5 schon nach 60 %, ab 2,6 erst nach 80 % (anteilAusZielnote).
// Kapitel: Notizen unter Lernplan/ (typ: lernplan, code), je Modul eine, „<Code> Lernplan“. Quellen: die zentralen Kapitellisten
// (kapitel.json, zentral.js holt sie gerätelokal; dieses Skript schreibt daraus die Notizen mit herkunft: zentral, nur auf dem
// Abrufer, nur für Module des laufenden Semesters, Häkchen und Eigenes bleiben), seit 31.10.2026 die Listen des eigenen Servers
// (serverListen, herkunft: server, nur für Module ohne zentrale Liste; eine spätere zentrale Liste übernimmt die Notiz) oder eine
// eigene KI (andere herkunft, nie überschrieben). Gibt es keine Notiz, fehlt der Lernplan in der Übersicht (sichtbar()). Ist ein
// Lernplan nicht mehr dran (Modul bestanden oder anerkannt, Notiz für ein anderes Semester, Modul liegt jetzt anderswo), steht er
// ohne Plan am Ende (nichtMehrDran).
// Je Kapitel eine Aufgabe `- [ ] <Nummer> <Titel>`, danach mit „ · “ getrennt Links auf die Unterlage (`[[B110 Folien 01 …|Folien]]`),
// die Nummer der Folien (`Folien 1`, wenn es noch keine Folien gibt und sie von der Kapitelnummer abweicht), die Seitenzahl
// (`118 S.`), der Tag der ersten Vorlesung zum Kapitel (`Vorlesung 19.10.2026`) und des ersten Zwischentests, der es abfragt
// (`Zwischentest 13.11.2026`); eingerückte Aufgaben darunter sind Unterkapitel. Abgehakt = verstanden (bei Unterkapiteln anteilig).
// Gewicht eines Kapitels = Seiten (Angabe in der Zeile, sonst Feld `seiten` der verlinkten oder gleich nummerierten Folien, sonst
// der Mittelwert); „da“ = eine verlinkte Datei oder Folien mit dieser Nummer existieren. Wochen: Montag bis Freitag ohne Pausen und
// freie Tage aus dem Datenmodell, eine Woche ganz in einer Pause zählt 30 %, dazu deine Wochen mit weniger Zeit (System/Einstellungen.md,
// lernplan_wochen). Der Plan verteilt die Kapitel so gleichmäßig, wie die Zwischentests es erlauben (planen); Stand je Modul: im Plan,
// voraus, hinterher (nur Kapitel, die die Vorlesung schon hatte), vorlernen (fällig, aber noch vor seiner Vorlesung), wartet
// (fällige Kapitel noch nicht hochgeladen), Klausurvorbereitung, vorbei. Klausur: die eine Regel des Datenmodells
// (ctx.modell.pruefungVon), ohne Prüfungstermin der Beginn der nächsten Prüfungsphase (geschätzt), damit der Plan ein Ende hat.
// Beginn: Vorlesungsbeginn, frühestens `seit`.
// Frontmatter der Notiz (optional): `seit` (Plan beginnt in dieser Woche), `verstanden_bis` (Ziel statt 70 %), `vorlaeufig: true`
// (Kapitelliste teils geschätzt, z. B. Lehrbuch-Einheiten, die die Vorlesung erst nach und nach nennt), `vorlernen: false` (ein
// Kapitel ist frühestens eine Woche nach seiner Vorlesung dran; Schalter im Bereich), `zeit_je_kapitel: true` mit `kapitel_zeit`
// (Schalter „Zeit je Kapitel“, standardmäßig aus; siehe zeitStufe). Ein https-Link in der Zeile (frei zugängliches
// Lehrbuch) macht ein Kapitel „da“; ohne Seiten im ganzen Modul zählt die Zahl der Unterkapitel als Gewicht.
// Klausurvorbereitung (Für die Klausur): Altklausuren des Moduls (bearbeitet = status bearbeitet), nach dem Ziel auf die Wochen bis
// zur Klausur verteilt, die neueste offene für den Tag davor; Übungsblätter dieses Semesters; heute fällige Karteikarten (ctx.karten).
// Schreibt beim Tipp auf ein Kapitel genau diese Zeile `- [ ]` ↔ `- [x]`, nur wenn ihr Text noch stimmt (wie todos.js), beim Schalter
// „Vor der Vorlesung lernen“ das Feld vorlernen der Notiz, bei „Zeit“ einer Woche lernplan_wochen in System/Einstellungen.md.
// Für andere Skripte und Tests: ctx.lernplan = { kapitelLesen, gewichte, planen, zielVon, stand, kapazitaet, sichtbar, modulZeile,
// serverListen, … }.
// Stil: eba-core.css Abschnitt 61, Klassen eba-lp-*; Zeilen wie die Verbindungen (.eba-vb-liste), Dashboard-Zeile wie die der
// Karteikarten (.eba-lk-heute, Abschnitt 52).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone. Fehler → Ersatztext des Blocks.
module.exports = function (ctx) {
  const app = window.app;
  const O = ctx.obsidian || {};
  const SPRACHE = "eba-lernplan";
  const ORDNER = "Lernplan/";
  const BEREICH = "Studium/Lernplan.md";
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const FELD_WOCHEN = "lernplan_wochen";
  const FELD_ANTEIL = "lernplan_anteil";
  const ANTEIL = 0.7;
  const MIN_KAPAZITAET = 0.3;
  const EPS = 1e-6;
  const WTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  const s10 = (v) => { const m = String(v == null ? "" : v).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ""; };
  const tagObj = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const isoVon = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const plusTage = (s, n) => { const d = tagObj(s); d.setDate(d.getDate() + n); return isoVon(d); };
  const montagVon = (s) => { const d = tagObj(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoVon(d); };
  const tageZwischen = (a, b) => Math.round((tagObj(b) - tagObj(a)) / 864e5);
  const tm = (s) => `${+s.slice(8, 10)}.${+s.slice(5, 7)}.`;
  const wtm = (s) => `${WTAG[tagObj(s).getDay()]} ${tm(s)}`;
  const heuteIso = () => isoVon(ctx.date.jetzt());
  // „19.10.2026“ ↔ „2026-10-19“ (Tag der Vorlesung, des Zwischentests in der Kapitelzeile)
  const deVon = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
  const isoAusDe = (s) => { const m = String(s).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
  // „2.–8.11.“ bzw. „28.12.–3.1.“: Montag bis Sonntag einer Woche
  const wocheText = (mo) => { const so = plusTage(mo, 6); return mo.slice(5, 7) === so.slice(5, 7) ? `${+mo.slice(8, 10)}.–${tm(so)}` : `${tm(mo)}–${tm(so)}`; };

  // ---------- Kapitel lesen (rein) ----------
  const AUFGABE = /^([ \t]*)[-*+] \[([ xX])\] (.*)$/;
  // Erstes Wort in der Form der Kapitelnummern von kapitel.json (zentral.js, KAPITEL_NR), ohne Punkt am Ende; Nummer ist es nur
  // mit Ziffer (1, 2.3, 1a, E1, A.1), als römische Zahl oder als einzelner Großbuchstabe, nie ein gewöhnliches Wort („Ohne“)
  const NUMMER = /^([0-9A-Z](?:[0-9A-Za-z.]{0,6}[0-9A-Za-z])?)[.:)]?\s+(.*)$/;
  const nummerOk = (s) => /\d/.test(s) || /^(?:[IVXLC]+|[A-Z])$/.test(s);
  const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
  const WEB = /\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g;
  const SEITEN = /^(\d{1,4})\s*S\.?$/;
  const FOLIEN = /^Folien (\d{1,2})$/;
  const VORLESUNG = /^Vorlesung (\d{1,2}\.\d{1,2}\.\d{4})$/;
  const ZWISCHENTEST = /^Zwischentest (\d{1,2}\.\d{1,2}\.\d{4})$/;
  const ALTKLAUSUREN = /^in (\d{1,2}) von (\d{1,2}) Altklausuren$/;
  const ROEMISCH = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  const roemisch = (s) => {
    let n = 0;
    for (let i = 0; i < s.length; i++) { const a = ROEMISCH[s[i]], b = ROEMISCH[s[i + 1]] || 0; n += a < b ? -a : a; }
    return n;
  };
  // Nummer als Zahl (für den Abgleich mit dem Feld `nummer` der Folien): 3 → 3, IV → 4, sonst null (E, 1.2)
  const nrZahl = (nr) => (/^\d+$/.test(nr) ? +nr : /^[IVXLC]+$/.test(nr) ? roemisch(nr) : null);
  // Text einer Kapitelzeile ohne Häkchen: „1 Grundlagen · [[B110 Folien 01 Grundlagen|Folien]] · 42 S. · Vorlesung 19.10.2026“ →
  // Nummer, Titel, Links, Seiten, Tag der Vorlesung und des Zwischentests (ISO), Klausurrelevanz („in 9 von 12 Altklausuren“ →
  // { in, von }); web = https-Links (`[online](https://…)`, z. B. ein frei zugängliches Lehrbuch): Das Kapitel ist dann da.
  const zeileLesen = (rest) => {
    const teile = rest.replace(/\s+\^[A-Za-z0-9-]+$/, "").split(" · ");
    const kopf = teile.shift().trim();
    const m = kopf.match(NUMMER);
    const nr = m && nummerOk(m[1]) ? m[1] : "";
    const links = [], web = [];
    let seiten = null, folien = null, vorlesung = "", zwischentest = "", altklausuren = null;
    for (const t of teile) {
      const x = t.trim();
      const s = x.match(SEITEN);
      if (s) { seiten = +s[1]; continue; }
      const f = x.match(FOLIEN);
      if (f) { folien = +f[1]; continue; }
      const v = x.match(VORLESUNG);
      if (v) { vorlesung = isoAusDe(v[1]); continue; }
      const z = x.match(ZWISCHENTEST);
      if (z) { zwischentest = isoAusDe(z[1]); continue; }
      const a = x.match(ALTKLAUSUREN);
      if (a && +a[1] <= +a[2]) { altklausuren = { in: +a[1], von: +a[2] }; continue; }
      let l;
      LINK.lastIndex = 0;
      while ((l = LINK.exec(t))) links.push(l[1].trim());
      WEB.lastIndex = 0;
      while ((l = WEB.exec(t))) web.push(l[1]);
    }
    const titel = (nr ? m[2] : kopf).replace(LINK, (_, z, a) => a || z).trim();
    return { nr, titel, links, web, seiten, folien, vorlesung, zwischentest, altklausuren };
  };
  // Markdown einer Lernplan-Notiz → [{ zeile, roh, nr, titel, fertig, links, seiten, vorlesung, zwischentest, teile: [{ zeile, roh,
  // nr, titel, fertig }] }]. Nur Aufgaben außerhalb von Frontmatter und Codeblöcken; ohne Einrückung = Kapitel, eingerückt =
  // Unterkapitel des letzten.
  const kapitelLesen = (text) => {
    const zeilen = String(text == null ? "" : text).split("\n");
    const kapitel = [];
    let i = 0, code = false;
    if (/^---\s*$/.test(zeilen[0] || "")) { i = 1; while (i < zeilen.length && !/^---\s*$/.test(zeilen[i])) i++; i++; }
    for (; i < zeilen.length; i++) {
      const roh = zeilen[i].replace(/\r$/, "");
      if (/^\s*(```|~~~)/.test(roh)) { code = !code; continue; }
      if (code) continue;
      const m = roh.match(AUFGABE);
      if (!m) continue;
      const tiefe = m[1].replace(/\t/g, "    ").length;
      const z = Object.assign({ zeile: i, roh, fertig: m[2] !== " " }, zeileLesen(m[3]));
      if (tiefe === 0) kapitel.push(Object.assign(z, { teile: [] }));
      else if (kapitel.length) kapitel[kapitel.length - 1].teile.push(z);
    }
    return kapitel;
  };
  // Verstanden-Anteil eines Kapitels: abgehakt 1, sonst abgehakte Unterkapitel / alle
  const anteilVon = (k) => (k.fertig ? 1 : k.teile.length ? k.teile.filter((t) => t.fertig).length / k.teile.length : 0);
  // Gewicht je Kapitel ([{ seitenWert, teile }]): Seiten, sobald ein Kapitel des Moduls Seiten hat (fehlende = Mittelwert);
  // ganz ohne Seiten (Lehrbuch online) die Zahl der Unterkapitel; sonst alle gleich
  const gewichte = (kapitel) => {
    const wert = kapitel.some((k) => k.seitenWert) ? (k) => k.seitenWert : (k) => k.teile.length || null;
    const bekannt = kapitel.map(wert).filter((x) => x > 0);
    const mittel = bekannt.length ? bekannt.reduce((a, x) => a + x, 0) / bekannt.length : 1;
    return kapitel.map((k) => wert(k) || mittel);
  };

  // ---------- Wochen und Plan (rein) ----------
  // Anteil einer Woche am üblichen Pensum: Montag–Freitag ohne Pausen ([{ von, bis }]) und freie Tage ([ISO] oder [{ datum }]);
  // ganz frei → 30 %; faktor (0–1, deine Angabe „weniger Zeit“) nimmt davon noch einen Teil
  const arbeitstage = (mo, pausen, freie) => {
    const frei = new Set((freie || []).map((t) => s10(t && t.datum ? t.datum : t)));
    let n = 0;
    for (let i = 0; i < 5; i++) {
      const d = plusTage(mo, i);
      if (!frei.has(d) && !(pausen || []).some((p) => p.von <= d && d <= p.bis)) n++;
    }
    return n;
  };
  const kapazitaet = (mo, pausen, freie, faktor) => Math.max(MIN_KAPAZITAET, arbeitstage(mo, pausen, freie) / 5) * (faktor == null ? 1 : faktor);
  // „Alles verstanden bis“: Sonntag der Woche, in der anteil (70 %) der Zeit von beginn bis klausur vorbei ist, höchstens der
  // Sonntag vor der Klausurwoche
  const zielVon = (beginn, klausur, anteil) => {
    const a = anteil == null ? ANTEIL : anteil;
    const tag = plusTage(beginn, Math.round(tageZwischen(beginn, klausur) * a));
    const so = plusTage(montagVon(tag), 6), spaetestens = plusTage(montagVon(klausur), -1);
    return so < spaetestens ? so : spaetestens;
  };
  // Strenge nach der Zielnote (Döbele: Priorität der Noten): bis 1,5 alles verstanden nach 60 % der Zeit (mehr Zeit für
  // Altklausuren), bis 2,5 nach 70 %, schlechter nach 80 %; ohne gültige Zielnote 70 %
  const anteilAusZielnote = (zielnote) => {
    const n = parseFloat(String(zielnote == null ? "" : zielnote).replace(",", "."));
    if (!isFinite(n) || n < 1 || n > 4) return ANTEIL;
    return n <= 1.5 ? 0.6 : n <= 2.5 ? 0.7 : 0.8;
  };
  // Deine Wochen mit weniger Zeit aus System/Einstellungen.md (lernplan_wochen: ["2026-11-16 50", …], Montag und Prozent) →
  // { ISO-Montag: 0–1 }; anderes fällt weg
  const faktorenLesen = (liste) => {
    const aus = {};
    for (const x of Array.isArray(liste) ? liste : []) {
      const m = String(x == null ? "" : x).trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,3})\s*%?$/);
      if (m && +m[2] <= 100 && isFinite(tagObj(m[1]).getTime())) aus[montagVon(m[1])] = +m[2] / 100;
    }
    return aus;
  };
  // kapitel: [{ gewicht, anteil (0–1), da, frist? (ISO-Sonntag: bis dahin verstanden, etwa vor einem Zwischentest) }], Daten als
  // ISO, faktoren wie faktorenLesen. Gleicher Aufwand je Woche, so weit die Fristen es zulassen: Vom erreichten Stand aus nimmt
  // der Plan die Frist (oder das Ziel), die den höchsten Takt verlangt (Gewicht je Kapazität), verteilt bis dorthin gleichmäßig
  // und macht von dort aus weiter. Ohne Fristen ist bis Ende der Woche w der Anteil der Kapazität bis w am Gesamtgewicht fällig.
  // Deine Wochen mit weniger Zeit zählen nur ab ihrer eigenen Woche, in drei Läufen: die Wochen vor dieser mit voller Zeit für
  // alles, was noch kommt, dann diese Woche ebenso, dann der Rest mit deinen Angaben. So rückt eine spätere Woche mit weniger Zeit
  // nichts in vergangene Wochen und nichts in diese, die schon läuft. Jedes Kapitel bekommt den Sonntag der Woche, in der der Plan
  // es erreicht.
  // → { wochen: [{ mo, kap, soll }], faellig: [ISO-Sonntag je Kapitel], gesamt, ist, w } (w = Index der Woche von heute, -1 davor,
  // wochen.length danach)
  const planen = ({ kapitel, beginn, ziel, heute, pausen, freie, faktoren }) => {
    const F = faktoren || {};
    const wochen = [];
    const ende = montagVon(ziel);
    for (let mo = montagVon(beginn); mo <= ende; mo = plusTage(mo, 7)) wochen.push({ mo, kap: kapazitaet(mo, pausen, freie, F[mo]), voll: kapazitaet(mo, pausen, freie), soll: 0 });
    if (!wochen.length) wochen.push({ mo: ende, kap: 1, voll: 1, soll: 0 });
    if (!wochen.some((x) => x.kap > EPS)) wochen.forEach((x) => { x.kap = 1; });
    const gesamt = kapitel.reduce((s, k) => s + k.gewicht, 0);
    const letzte = wochen.length - 1;
    const mo = montagVon(heute);
    const w = mo < wochen[0].mo ? -1 : mo > wochen[letzte].mo ? wochen.length : wochen.findIndex((x) => x.mo === mo);
    const wocheVon = (so) => { const m = montagVon(so); let i = letzte; while (i > 0 && wochen[i].mo > m) i--; return i; };
    const marken = [];
    let kum = 0;
    for (const k of kapitel) { kum += k.gewicht; if (k.frist) marken.push({ w: wocheVon(k.frist), summe: kum }); }
    marken.push({ w: letzte, summe: gesamt });
    // Verteilt ab Woche w0 + 1 (Stand c0 bis w0) mit der Kapazität kap(Woche, Index)
    const verteilen = (kap, w0, c0) => {
      const C = [0]; // C[i + 1] = Kapazität der Wochen 0 bis i
      wochen.forEach((x, i) => C.push(C[i] + kap(x, i)));
      while (w0 < letzte) {
        let beste = null;
        for (const m of marken) {
          if (m.w <= w0) continue;
          const spanne = C[m.w + 1] - C[w0 + 1];
          const takt = spanne > EPS ? (m.summe - c0) / spanne : (m.summe > c0 + EPS ? Infinity : 0);
          if (!beste || takt > beste.takt + EPS || (Math.abs(takt - beste.takt) <= EPS && m.w > beste.w)) beste = { w: m.w, takt, summe: Math.max(m.summe, c0), spanne };
        }
        for (let i = w0 + 1; i <= beste.w; i++) {
          wochen[i].soll = beste.spanne > EPS ? c0 + (beste.summe - c0) * (C[i + 1] - C[w0 + 1]) / beste.spanne : beste.summe;
        }
        w0 = beste.w; c0 = beste.summe;
      }
    };
    // Bis Woche bis mit deinen Angaben, danach volle Zeit; ab Woche w0 + 1
    const lauf = (bis, w0) => verteilen((x, i) => (i <= bis ? x.kap : x.voll), w0, w0 < 0 ? 0 : wochen[w0].soll);
    if (w >= 0 && w < letzte) { lauf(w - 1, -1); lauf(w, w - 1); lauf(letzte, w); } else lauf(letzte, -1);
    kum = 0;
    const faellig = kapitel.map((k) => {
      kum += k.gewicht;
      const x = wochen.find((y) => y.soll >= kum - EPS) || wochen[letzte];
      return plusTage(x.mo, 6);
    });
    const ist = kapitel.reduce((s, k) => s + k.gewicht * k.anteil, 0);
    return { wochen, faellig, gesamt, ist, w };
  };
  // Ohne Vorlernen (vorlernen: false): Ein Kapitel ist frühestens am Sonntag der Woche nach seiner Vorlesung dran. Kapitel ohne
  // Vorlesung schätzt der Plan: Die Vorlesung schafft den Rest gleichmäßig nach Gewicht bis zum Vorlesungsende, das Kapitel, an
  // dem sie gerade ist, zählt mit; ein übersprungenes Kapitel vor der letzten Vorlesung gilt mit dem nächsten als behandelt.
  // kapitel: [{ gewicht, vorlesung }], vb/ve: Vorlesungsbeginn und -ende → [{ tag: ISO-Sonntag, geschaetzt }]
  const nachVorlesung = (kapitel, vb, ve) => {
    let letzte = -1;
    kapitel.forEach((k, i) => { if (k.vorlesung) letzte = i; });
    const ab = letzte >= 0 ? kapitel[letzte].vorlesung : vb;
    const vorn = letzte >= 0 ? kapitel[letzte].gewicht : 0;
    const rest = kapitel.slice(letzte + 1).reduce((s, k) => s + k.gewicht, 0);
    const spanne = Math.max(0, tageZwischen(ab, ve || ab));
    const sonntagDanach = (tag) => plusTage(montagVon(tag), 13);
    let lauf = vorn;
    return kapitel.map((k, i) => {
      if (k.vorlesung) return { tag: sonntagDanach(k.vorlesung), geschaetzt: false };
      if (i < letzte) { const n = kapitel.slice(i + 1).filter((x) => x.vorlesung)[0]; return { tag: sonntagDanach(n.vorlesung), geschaetzt: false }; }
      const tag = plusTage(ab, Math.round(spanne * lauf / ((vorn + rest) || 1)));
      lauf += k.gewicht;
      return { tag: sonntagDanach(tag), geschaetzt: true };
    });
  };
  // Stand eines Moduls heute: { art, pille: { art, text } | null, woche: [Index der Kapitel bis Sonntag], naechstes: Index | -1 }
  // Pillen nach docs/design.md (Farbe = Bedeutung): ok erledigt/voraus, warn offen mit Datum, info wartet auf die Vorlesung oder
  // kann vorgelernt werden, leer neutral; „im Plan“ ist der ruhige Normalfall ohne Pille. Hinterher ist nur, wer ein Kapitel offen
  // hat, das da ist und das die Vorlesung schon hatte (kapitel[i].erreicht; ohne Angabe gilt es als erreicht); ist es noch vor
  // seiner Vorlesung, heißt es „vorlernen“ (mit vorlernen: false „wartet“). Die Pille sagt „überfällig“ wie die Kapitelzeilen.
  // art: vorbei | vorbereitung | fertig | hinterher | vorlernen | wartet | voraus | plan
  const stand = ({ kapitel, plan, heute, ziel, klausur, vorlernen }) => {
    const so = plusTage(montagVon(heute), 6), mo = montagVon(heute);
    const offen = kapitel.map((k, i) => i).filter((i) => kapitel[i].anteil < 1 - EPS);
    const naechstes = offen.length ? offen[0] : -1;
    const woche = offen.filter((i) => plan.faellig[i] <= so);
    if (klausur && heute > klausur) return { art: "vorbei", pille: { art: "leer", text: "Klausur vorbei" }, woche: [], naechstes };
    if (heute > ziel) {
      return offen.length ? { art: "vorbereitung", pille: { art: "warn", text: offen.length === 1 ? "1 Kapitel offen" : `${offen.length} Kapitel offen` }, woche: offen, naechstes }
        : { art: "vorbereitung", pille: { art: "leer", text: "Klausurvorbereitung" }, woche: [], naechstes };
    }
    if (!offen.length) return { art: "fertig", pille: { art: "ok", text: "alles verstanden" }, woche: [], naechstes };
    const ueberfaellig = offen.filter((i) => plan.faellig[i] < mo);
    if (ueberfaellig.length) {
      const hinter = ueberfaellig.filter((i) => kapitel[i].da && kapitel[i].erreicht !== false);
      if (hinter.length) return { art: "hinterher", pille: { art: "warn", text: hinter.length === 1 ? "1 Kapitel überfällig" : `${hinter.length} Kapitel überfällig` }, woche, naechstes };
      const vor = vorlernen === false ? [] : ueberfaellig.filter((i) => kapitel[i].da);
      if (vor.length) return { art: "vorlernen", pille: { art: "info", text: vor.length === 1 ? "1 Kapitel vorlernen" : `${vor.length} Kapitel vorlernen` }, woche, naechstes };
      const i = ueberfaellig[0];
      return { art: "wartet", pille: { art: "info", text: `wartet auf Kapitel ${kapitel[i].nr || i + 1}` }, woche, naechstes };
    }
    const voraus = kapitel.filter((k, i) => k.anteil >= 1 - EPS && plan.faellig[i] > so).length;
    if (voraus) return { art: "voraus", pille: { art: "ok", text: voraus === 1 ? "1 Kapitel voraus" : `${voraus} Kapitel voraus` }, woche, naechstes };
    return { art: "plan", pille: null, woche, naechstes };
  };
  // Altklausuren in der Klausurvorbereitung (Döbele, Notencoach: auf Zeit, am Tag vor der Klausur eine ungesehene): die offenen von
  // alt nach neu auf die Wochen bis zur Klausur verteilt, die neueste offene bleibt für den Vortag. alt: [{ titel, fertig, … }] von
  // alt nach neu. → { offen, fertig, dieseWoche, naechste, vortag }
  const altklausurPlan = (alt, heute, klausur) => {
    const offen = alt.filter((a) => !a.fertig);
    const vortag = offen.length > 1 ? offen[offen.length - 1] : null;
    const rest = vortag ? offen.slice(0, -1) : offen;
    const wochen = klausur ? Math.max(1, Math.round(tageZwischen(montagVon(heute), montagVon(klausur)) / 7)) : 1;
    return { offen, fertig: alt.length - offen.length, dieseWoche: rest.length ? Math.ceil(rest.length / wochen) : 0, naechste: rest[0] || vortag || null, vortag };
  };
  // Reihenfolge der Altklausuren von alt nach neu aus dem Titel („WS 2023/24 Haupttermin“, „SS 2020 Nachtermin“), sonst nach Titel
  const altersSchluessel = (titel) => {
    const t = String(titel || ""), m = t.match(/(WS|SS|WiSe|SoSe)\s*(\d{4})/i), j = t.match(/(\d{4})/);
    const jahr = m ? +m[2] + (/^(WS|WiSe)$/i.test(m[1]) ? 0.75 : 0.25) : j ? +j[1] : 0;
    return jahr + (/nach|wiederhol/i.test(t) ? 0.1 : 0);
  };
  // Bild des Semesters für den Semesterplan: Zeitachse von Montag der ersten Planwoche bis Sonntag der Woche der letzten Klausur,
  // Lagen als Anteil 0–1 davon. Je Woche, was in ihr fällig ist, als Last: Anteil des Kapitels an seinem Modul mal dessen ECTS
  // (Döbele: Fächer nach ECTS gewichtet), geteilt in verstanden, offen und überfällig (vor dieser Woche fällig, da und von der
  // Vorlesung erreicht), insgesamt und je Modul (module[j], mit seiner Farbe). Je Modul eine Bahn: Beginn, Stand (wo der Plan bei deinem Fortschritt ist, innerhalb einer Woche
  // gleichmäßig), überfällig bis heute (nur wenn der Stand des Moduls es sagt), Ziel (Ende seines Sonntags), Klausur, Zwischentests.
  // module: aktive Lernpläne ({ ects, ziel, klausur, stand, plan: { wochen, gesamt, ist, faellig }, kapitel }), pausen: [{ von, bis,
  // name }] → { von, tage, heute (null außerhalb), jetzt (Index dieser Woche, -1 außerhalb), wochen: [{ mo, fertig, offen, ueber, module }],
  // max, monate: [{ x, text }], pausen: [{ a, b, name }], bahnen: [{ P, beginn, stand, ueber (bis wohin, sonst null), ziel, klausur,
  // tests }] } oder null ohne Module
  const MONAT =["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const planBild = (module, heute, pausen) => {
    if (!module.length) return null;
    let von = module[0].plan.wochen[0].mo, bis = montagVon(module[0].klausur.datum);
    for (const P of module) {
      if (P.plan.wochen[0].mo < von) von = P.plan.wochen[0].mo;
      if (montagVon(P.klausur.datum) > bis) bis = montagVon(P.klausur.datum);
    }
    const tage = tageZwischen(von, bis) + 7, ende = plusTage(bis, 6), mo0 = montagVon(heute);
    const x = (tag, plus) => Math.min(1, Math.max(0, (tageZwischen(von, tag) + (plus || 0)) / tage));
    const wochen = [];
    for (let mo = von; mo <= bis; mo = plusTage(mo, 7)) wochen.push({ mo, fertig: 0, offen: 0, ueber: 0, module: [] });
    const bahnen = module.map((P, j) => {
      const g = P.plan.gesamt || 1, e = P.ects || 5;
      P.kapitel.forEach((k, i) => {
        const mo = montagVon(P.plan.faellig[i]), w = wochen[tageZwischen(von, mo) / 7];
        if (!w) return;
        const last = (k.gewicht / g) * e, rest = last * (1 - k.anteil), ueber = mo < mo0 && k.da && k.erreicht !== false;
        const m = w.module[j] || (w.module[j] = { farbe: P.farbe || 0, fertig: 0, offen: 0, ueber: 0 });
        w.fertig += last * k.anteil; m.fertig += last * k.anteil;
        if (ueber) { w.ueber += rest; m.ueber += rest; } else { w.offen += rest; m.offen += rest; }
      });
      const W = P.plan.wochen, ist = P.plan.ist, ziel = x(P.ziel, 1), jetzt = x(heute, 0.5);
      let stand = x(W[0].mo), vorher = 0;
      if (ist >= P.plan.gesamt - EPS) stand = ziel;
      else for (const w of W) {
        if (w.soll > vorher + EPS && w.soll >= ist - EPS) { stand = x(w.mo, (7 * (ist - vorher)) / (w.soll - vorher)); break; }
        vorher = w.soll;
      }
      const hinterher = P.stand.art === "hinterher" || (P.stand.art === "vorbereitung" && ist < P.plan.gesamt - EPS);
      const tests = [];
      P.kapitel.forEach((k) => { if (k.zwischentest && tests.indexOf(k.zwischentest) < 0) tests.push(k.zwischentest); });
      return { P, beginn: x(W[0].mo), stand, ueber: hinterher && jetzt > stand + EPS ? Math.min(jetzt, ziel) : null, ziel,
        klausur: x(P.klausur.datum, 0.5), tests: tests.sort().map((t) => x(t, 0.5)) };
    });
    // Monate: je Monatsanfang eine Marke, der erste Monat am Anfang nur, wenn bis zum nächsten mindestens zwei Wochen Platz sind
    const monate = [], naechster = (d) => plusTage(d.slice(0, 8) + "01", 32).slice(0, 8) + "01";
    let d = naechster(von);
    if (tageZwischen(von, d) >= 14) monate.push({ x: 0, text: MONAT[+von.slice(5, 7) - 1] });
    for (; d <= ende; d = naechster(d)) monate.push({ x: x(d), text: MONAT[+d.slice(5, 7) - 1] });
    const P2 = (pausen || []).filter((p) => p.von <= ende && p.bis >= von)
      .map((p) => ({ a: x(p.von < von ? von : p.von), b: x(p.bis > ende ? ende : p.bis, 1), name: p.name || "" }));
    const max = Math.max.apply(null, wochen.map((w) => w.fertig + w.offen + w.ueber).concat([EPS]));
    const drin = heute >= von && heute <= ende;
    return { von, tage, heute: drin ? x(heute, 0.5) : null, jetzt: wochen.findIndex((w) => w.mo === mo0), wochen, max, monate, pausen: P2, bahnen };
  };
  // Wo der Plan eines Moduls heute steht (Gewicht 0 bis gesamt): innerhalb einer Woche gleichmäßig
  const sollHeute = (P, heute) => {
    const W = P.plan.wochen;
    let vorher = 0;
    for (const w of W) {
      const tag = tageZwischen(w.mo, heute);
      if (tag < 0) return vorher;
      if (tag < 7) return vorher + ((w.soll - vorher) * (tag + 0.5)) / 7;
      vorher = w.soll;
    }
    return P.plan.gesamt;
  };
  // Stand über alle Module für den Kopf des Bereichs. module: aktive Lernpläne (wie planBild), ueberfaellig(P, i): Kapitel i ist
  // überfällig (bisText). → { ist, soll (Anteil 0–1, je Modul nach ECTS gewichtet; soll = wo der Plan heute steht), rueckstand
  // (Kapitel überfällig), vorsprung (verstanden, aber erst nach diesem Sonntag fällig), woche: { fertig, gesamt } (in dieser Woche
  // fällig), aufholen: { extra (Kapitel je Woche), bis (Sonntag) } | null, klausur: { P, datum, tage } | null (die nächste),
  // alleFertig }
  const heldDaten = (module, heute, ueberfaellig) => {
    let e = 0, ist = 0, soll = 0, rueckstand = 0, vorsprung = 0, alleFertig = true;
    const mo = montagVon(heute), so = plusTage(mo, 6), woche = { fertig: 0, gesamt: 0 };
    let klausur = null;
    for (const P of module) {
      const g = P.plan.gesamt || 1, ects = P.ects || 5;
      e += ects; ist += (ects * P.plan.ist) / g; soll += (ects * sollHeute(P, heute)) / g;
      P.kapitel.forEach((k, i) => {
        const fertig = k.anteil >= 1 - EPS, d = P.plan.faellig[i];
        if (!fertig) alleFertig = false;
        if (!fertig && ueberfaellig(P, i)) rueckstand++;
        if (fertig && d > so) vorsprung++;
        if (d >= mo && d <= so) { woche.gesamt++; if (fertig) woche.fertig++; }
      });
      if (P.klausur.datum >= heute && (!klausur || P.klausur.datum < klausur.datum)) klausur = { P, datum: P.klausur.datum, tage: tageZwischen(heute, P.klausur.datum) };
    }
    // Aufholen: bis drei Kapitel in dieser Woche, mehr verteilt auf diese und die zwei nächsten
    const aufholen = !rueckstand ? null : rueckstand <= 2 ? { extra: rueckstand, bis: so } : { extra: Math.ceil(rueckstand / 3), bis: plusTage(so, 14) };
    return { ist: e ? ist / e : 0, soll: e ? soll / e : 0, rueckstand, vorsprung, woche, aufholen, klausur, alleFertig: module.length > 0 && alleFertig };
  };
  // Die Lage als Überschrift und Satz: Rückstand mit dem Weg zurück in den Plan, Vorsprung, im Plan, alles verstanden → { titel, satz }
  const heldText = (H) => {
    if (H.alleFertig) return { titel: "Alles verstanden.", satz: "Jetzt zählen Altklausuren auf Zeit und deine Karteikarten." };
    if (H.rueckstand) {
      // Wochentag und Datum mit festem Leerzeichen: Auf dem iPhone brach der Satz zwischen „So“ und „22.11.“
      const A = H.aufholen, bis = wtm(A.bis).replace(" ", "\u00a0");
      return { titel: `${H.rueckstand} Kapitel im Rückstand`, satz: H.rueckstand <= 2
        ? `Hol ${H.rueckstand === 1 ? "es" : "sie"} bis ${bis} nach, dann bist du wieder im Plan.`
        : `Mit ${A.extra} ${A.extra === 1 ? "Kapitel" : "Kapiteln"} mehr pro Woche bist du bis ${bis} wieder im Plan.` };
    }
    const rest = H.woche.gesamt - H.woche.fertig;
    const woche = !H.woche.gesamt ? "" : rest === 1 ? "Diese Woche ist noch 1 Kapitel dran." : rest ? `Diese Woche sind noch ${rest} Kapitel dran.` : "Diese Woche ist geschafft.";
    if (H.vorsprung) return { titel: `${H.vorsprung} Kapitel Vorsprung`, satz: woche || "Was du früher verstehst, bleibt dir an Zeit für Altklausuren." };
    return { titel: "Du liegst im Plan.", satz: woche };
  };
  // Wann alles verstanden sein soll (seit 1.11.2026): deine Wahl im Lernplan (lernplan_anteil in den Einstellungen: 60, 70 oder 80),
  // sonst nach der Zielnote (anteilAusZielnote) → { anteil, quelle: "wahl" | "zielnote" | "" (weder noch: 70 %) }
  const ANTEILE = [0.6, 0.7, 0.8];
  const anteilWahl = (wert, zielnote) => {
    const n = Number(String(wert == null ? "" : wert).replace("%", "").trim());
    if (ANTEILE.some((a) => Math.round(a * 100) === n)) return { anteil: n / 100, quelle: "wahl" };
    const z = parseFloat(String(zielnote == null ? "" : zielnote).replace(",", "."));
    return { anteil: anteilAusZielnote(zielnote), quelle: isFinite(z) && z >= 1 && z <= 4 ? "zielnote" : "" };
  };
  // „Verstanden bis“ eines Moduls bei einem Anteil; hält die Vorlesung das Ziel schon später (vorlernen aus), nicht früher als jetzt
  const zielBei = (P, anteil) => {
    const z = zielVon(P.beginn, P.klausur.datum, anteil);
    return P.zielPlan && P.ziel > P.zielPlan && P.ziel > z ? P.ziel : z;
  };
  // Was ein Anteil für die Module hieße: frühestes und spätestes „verstanden bis“ und wie viele Wochen danach bis zur Klausur
  // bleiben (Module mit eigenem verstanden_bis zählen nicht). → { von, bis, wochenVon, wochenBis } | null
  const zielVorschau = (module, anteil) => {
    const Z = module.filter((P) => !P.eigenesZiel && P.beginn).map((P) => {
      const z = zielBei(P, anteil);
      return { z, w: Math.max(0, Math.round(tageZwischen(z, P.klausur.datum) / 7)) };
    });
    if (!Z.length) return null;
    const zs = Z.map((x) => x.z).sort(), ws = Z.map((x) => x.w).sort((a, b) => a - b);
    return { von: zs[0], bis: zs[zs.length - 1], wochenVon: ws[0], wochenBis: ws[ws.length - 1] };
  };
  // Was ein Anteil heißt, in Teilen ({ text, wert }; wert = fett): „alles verstanden bis So 3.1., danach 4 Wochen
  // Klausurvorbereitung.“ Mehrere Module: „zwischen 17.1. und 28.2.“, die Tage ohne Wochentag (bis 2.11.2026 „bis 17.1.–28.2.“, ohne
  // zu sagen, was bis dahin). V wie zielVorschau.
  const spanne = (a, b) => (a === b ? String(a) : `${a}–${b}`);
  const zielTeile = (V) => {
    if (!V) return [{ text: "deine Module haben ein eigenes Datum, bis wann alles verstanden sein soll." }];
    const wann = V.von === V.bis ? [{ text: "alles verstanden bis " }, { text: wtm(V.bis), wert: true }]
      : [{ text: "alles verstanden zwischen " }, { text: tm(V.von), wert: true }, { text: " und " }, { text: tm(V.bis), wert: true }];
    const wochen = V.wochenVon === V.wochenBis && V.wochenBis === 1 ? "1\u00a0Woche" : `${spanne(V.wochenVon, V.wochenBis)}\u00a0Wochen`;
    return [...wann, { text: ", danach " }, { text: wochen, wert: true }, { text: " Klausurvorbereitung." }];
  };

  // ---------- Heute (seit 3.11.2026) ----------
  // Was heute dran ist, so viel, wie deine Lernzeit an diesem Wochentag hergibt (lernplan_tageszeit in den Einstellungen: Minuten
  // je Wochentag, Montag zuerst; eingestellt unter „Lernplan einstellen“). Gemischt aus Kapiteln, To-dos der Unterlagen mit naher
  // Frist und den heute fälligen Karteikarten. Die Zeit eines Kapitels schätzt minutenVon aus seinen Seiten.
  const FELD_TAG = "lernplan_tageszeit";
  const FELD_EINSTIEG = "lernplan_einstieg";
  const TAG_VORGABE = [120, 120, 120, 120, 120, 60, 0];
  const TAG_WAHL = [0, 30, 60, 90, 120, 150, 180, 240, 300];
  const TAG_NAME = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  const MIN_SEITE = 2, MIN_UNTERKAPITEL = 20, MIN_KAPITEL = 45, MIN_AUFGABE = 30;
  const tageszeitLesen = (v) => {
    const l = Array.isArray(v) ? v : [];
    return TAG_VORGABE.map((x, i) => { const n = parseInt(l[i], 10); return n >= 0 && n <= 720 ? n : x; });
  };
  const tagIndex = (iso) => (tagObj(iso).getDay() + 6) % 7;
  const runden5 = (n) => Math.max(5, Math.round(n / 5) * 5);
  // Minuten für ein Kapitel: 2 je Seite, ohne Seiten 20 je Unterkapitel, sonst 45; mal die Zeit je Kapitel, wenn sie an ist.
  // → { ganz, rest } (rest: was bei halb verstandenen Unterkapiteln noch fehlt)
  const minutenVon = (k) => {
    const basis = k.seitenWert ? k.seitenWert * MIN_SEITE : k.teile && k.teile.length ? k.teile.length * MIN_UNTERKAPITEL : MIN_KAPITEL;
    const ganz = runden5(Math.max(15, basis * ((k.zeit && ZEIT_FAKTOR[k.zeit.stufe]) || 1)));
    const a = k.anteil || 0;
    return { ganz, rest: a > EPS && a < 1 - EPS ? runden5(ganz * (1 - a)) : ganz };
  };
  const BRUCH = ["", "¼", "½", "¾"];
  const dauerText = (min) => {
    if (min < 60) return `${min}\u00a0Min.`;
    const v = Math.round(min / 15);
    return `${Math.floor(v / 4)}${BRUCH[v % 4]}\u00a0Std.`;
  };
  // Reihenfolge für heute (rang): 0 überfällige Kapitel, 1 To-dos bis morgen (auch bis zu einer Woche überfällige), 2 Kapitel dieser
  // Woche eines Moduls mit Kurs heute oder morgen, 3 die übrigen Kapitel dieser Woche, 4 To-dos der nächsten Tage, 5 Kapitel der
  // nächsten Woche (nur mit „Mehr für heute“). Was noch nicht hochgeladen ist, fehlt. A: aktive Lernpläne; todos: [{ id, code, text,
  // frist (ISO), quelle, t }]; kurs: Code → { heute: "14:15 Vorlesung" | "", morgen: bool }
  const kandidatenVon = (A, todos, kurs, heute) => {
    const so = plusTage(montagVon(heute), 6), aus = [];
    for (const P of A) {
      const K = kurs[P.code] || {};
      P.kapitel.forEach((k, i) => {
        if (!k.da || k.anteil >= 1 - EPS) return;
        const d = P.plan.faellig[i], b = bisText(P, i);
        const rang = b.ueberfaellig ? 0 : d <= so ? (K.heute || K.morgen ? 2 : 3) : d <= plusTage(so, 7) ? 5 : -1;
        if (rang < 0) return;
        aus.push({ id: `k|${P.f.path}|${titelSchluessel(k.titel)}`, art: "kapitel", rang, datum: d, minuten: minutenVon(k).rest, P, i });
      });
    }
    for (const t of todos) {
      if (!t.frist || t.frist < plusTage(heute, -7)) continue;
      const rang = t.frist <= plusTage(heute, 1) ? 1 : t.frist <= plusTage(heute, 4) ? 4 : -1;
      if (rang >= 0) aus.push({ id: `t|${t.id}`, art: "aufgabe", rang, datum: t.frist, minuten: MIN_AUFGABE, t });
    }
    return aus.sort((a, b) => a.rang - b.rang || (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0) || (a.id < b.id ? -1 : 1));
  };
  // Füllt den Tag: der Reihe nach, solange noch Zeit offen ist (eines immer, wenn Zeit da ist); Rang 5 nie von selbst. Ein großes
  // Kapitel, das weit über die restliche Zeit ginge, kommt nur mit einem Teil (teil: Minuten heute, mindestens eine halbe Stunde);
  // sonst darf das letzte etwas darüber gehen. schon: Minuten, die heute schon erledigt sind
  const heuteFuellen = (kand, budget, schon) => {
    const aus = [];
    let summe = schon || 0;
    for (const x of kand) {
      if (x.rang >= 5 || summe >= budget) break;
      const offen = budget - summe;
      if (x.art === "kapitel" && x.minuten > 60 && x.minuten > offen + 15) {
        const teil = Math.max(30, runden5(offen));
        aus.push(Object.assign({}, x, { teil })); summe += teil;
      } else { aus.push(x); summe += x.minuten; }
    }
    return aus;
  };
  // Freie Zeit zwischen den Kursen eines Tages (8 bis 20 Uhr, Lücken ab einer Stunde): sitzungen [{ beginn: "10:15", ende: "11:45" }]
  // → „12–14:15 Uhr und ab 15:45 Uhr“ (leer ohne Kurse oder ohne Lücke)
  const minVon = (s) => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const uhrVon = (n) => `${Math.floor(n / 60)}${n % 60 ? ":" + String(n % 60).padStart(2, "0") : ""}`;
  const luecken = (sitzungen) => {
    const S = sitzungen.map((s) => ({ a: minVon(s.beginn), e: minVon(s.ende) })).filter((s) => s.a != null && s.e != null && s.e > s.a).sort((x, y) => x.a - y.a);
    if (!S.length) return "";
    const frei = [];
    let ende = 8 * 60;
    for (const s of S) {
      if (s.a - ende >= 60) frei.push(`${uhrVon(ende)}–${uhrVon(s.a)}\u00a0Uhr`);
      if (s.e > ende) ende = s.e;
    }
    if (20 * 60 - ende >= 60) frei.push(`ab ${uhrVon(ende)}\u00a0Uhr`);
    return aufzaehlen(frei);
  };

  // ---------- Daten aus dem Tresor ----------
  const fmVon = (f) => (f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter) || {};
  const codeVon = (f) => String(fmVon(f).code || f.basename.split(" ")[0]).trim();
  const lernplaene = () => app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(ORDNER) && fmVon(f).typ === "lernplan")
    .sort((a, b) => codeVon(a).localeCompare(codeVon(b), "de"));
  const sichtbar = () => app.vault.getMarkdownFiles().some((f) => f.path.startsWith(ORDNER) && fmVon(f).typ === "lernplan");
  const einstellungen = () => fmVon(app.vault.getAbstractFileByPath(EINSTELLUNGEN));

  // Klausur eines Moduls im Haupt- oder Nachholtermin (nachhol): ctx.modell.pruefungVon (eine Regel für alle Seiten); ohne
  // Prüfungstermin der Beginn der nächsten Prüfungsphase, im Nachholtermin der nächsten Nachholphase (geschätzt, phase: true)
  const klausurVon = (D, code, heute, nachhol) => {
    const p = ctx.modell.pruefungVon(code, { heute, termin: nachhol ? "nachhol" : "haupt" });
    if (p) return { datum: p.datum, geschaetzt: !!p.geschaetzt, f: p.f || null };
    const phase = D.pruefungsphasen.filter((x) => x.bis >= heute && (!nachhol || /nachhol/i.test(x.art))).sort((x, y) => (x.von < y.von ? -1 : 1))[0];
    return phase ? { datum: phase.von, geschaetzt: true, phase: true, f: null } : null;
  };
  const imNachhol = (modul) => !!(ctx.modell.imNachhol && ctx.modell.imNachhol(modul));
  // Folien eines Moduls: { nr: { nummer: { f, seiten, fassung } }, ohne: [{ f, seiten }] } (je Nummer die neueste Fassung,
  // Varianten „mit Anmerkungen“, „unbeschrieben“, „zum Video“ zählen nicht; ohne = Folien ohne Nummer)
  const folienSammeln = (code) => {
    const aus = { nr: {}, ohne: [] };
    for (const f of app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith("Unterlagen/")) continue;
      const fm = fmVon(f);
      if (fm.typ !== "unterlage" || String(fm.code || "").trim() !== code || fm.art !== "Folien") continue;
      if (/anmerkung|video|unbeschrieben/i.test(f.basename)) continue;
      const n = parseInt(fm.nummer, 10), seiten = parseInt(fm.seiten, 10) || null;
      const titel = String(fm.titel || f.basename.replace(/^\S+\s+Folien\s+\d*\s*/, ""));
      if (!isFinite(n)) { aus.ohne.push({ f, seiten, titel }); continue; }
      // Neue Fassung daneben (ilias.js, „<Name> neue Fassung JJJJ-MM-TT“, deine Datei hatte Anmerkungen): Der Plan rechnet mit der
      // neuesten und verlinkt sie; ihre Notiz zeigt auf deine bearbeitete (fassung.js)
      const fassung = ctx.user.fassung.fassungVon(f.basename);
      if (!aus.nr[n] || ctx.user.fassung.fassungFolge(fassung, aus.nr[n].fassung) > 0) aus.nr[n] = { f, seiten, fassung, titel };
    }
    return aus;
  };
  const folienVon = (code) => folienSammeln(code).nr;
  // Folien zur Nummer n; hat das Modul gar keine nummerierten Folien, aber genau eine Folien-Unterlage ohne Nummer (eine PDF für
  // alle Kapitel, etwa aus dem ILIAS-Abruf des Plugins), gilt sie für jedes Kapitel
  const folieZu = (S, n) => (n != null && S.nr[n]) || (!Object.keys(S.nr).length && S.ohne.length === 1 ? S.ohne[0] : null);
  // Folien je Kapitel. Zuerst nach dem Titel: Folien gehören zu dem Kapitel, mit dem ihr Titel die meisten Wörter ab vier
  // Buchstaben teilt, wenn das genau eines ist. Dann nach der Nummer (Feld folien bzw. Kapitelnummer, folieZu), aber nie Folien,
  // die nach ihrem Titel zu einem anderen Kapitel gehören: Der ILIAS-Abruf des Plugins nummeriert nach den Dateien der Vorlesung
  // („EBWL_2_post.pdf“ → Folien 02, noch Kapitel 1), die Kapitellisten zählen Kapitel. Trägt die Liste `folien` nur an manchen
  // Kapiteln (E101: Lehrbuch, Folien je Vorlesung), haben die übrigen keine nach der Nummer. nurTitel: ohne Nummer (Notizen aus
  // Kapitellisten: Der Abgleich hat die Folien mit der ganzen Liste schon verlinkt). kapitel: [{ nr, titel, folien }] →
  // [Folien | null] je Kapitel
  const NICHT_WORT = ["oder", "einer", "eines", "einem", "über", "unter", "folien", "kapitel", "teil", "vorlesung", "anmerkungen", "fassung"];
  const woerter = (t) => titelSchluessel(t).split(" ").filter((w) => w.length >= 4 && NICHT_WORT.indexOf(w) < 0);
  const folienZuordnen = (kapitel, S, nurTitel) => {
    const alle = Object.keys(S.nr).map((n) => S.nr[n]).concat(S.ohne);
    const kw = kapitel.map((k) => woerter(k.titel));
    const nachTitel = new Map();
    for (const x of alle) {
      const fw = woerter(x.titel);
      const treffer = kw.map((w) => fw.filter((a) => w.indexOf(a) >= 0).length);
      const max = Math.max.apply(null, [0].concat(treffer));
      if (max && treffer.filter((n) => n === max).length === 1) nachTitel.set(x, treffer.indexOf(max));
    }
    const teils = kapitel.some((k) => k.folien != null) && kapitel.some((k) => k.folien == null);
    return kapitel.map((k, i) => {
      const eigene = alle.filter((x) => nachTitel.get(x) === i)[0];
      if (eigene) return eigene;
      if (nurTitel || (teils && k.folien == null)) return null;
      const x = folieZu(S, k.folien != null ? k.folien : nrZahl(k.nr));
      return x && !nachTitel.has(x) ? x : null;
    });
  };

  // Ein Modul ist im Semester dran, wenn es laut deinem Plan dort liegt, läuft oder angemeldet ist (eine Regel für das Anlegen der
  // Notizen und die Anzeige)
  const FERTIG = ["bestanden", "anerkannt"];
  const imSemester = (m, name) => m.semester === name || ["läuft", "angemeldet"].indexOf(m.status) >= 0;
  // Warum ein Lernplan nicht mehr dran ist, sonst "": Modul bestanden oder anerkannt (dann gibt es keine kommende Klausur mehr), die
  // Notiz gehört zu einem anderen Semester (Feld `semester`) oder das Modul ist nicht mehr in diesem Semester dran. Notizen ohne
  // `semester` (eigene KI) prüft nur das Erste.
  const nichtMehrDran = (fm, modul, semesterName) => {
    if (modul && FERTIG.indexOf(modul.status) >= 0) return `Modul ${modul.status}`;
    const sem = String((fm && fm.semester) || "").trim();
    if (!sem || !semesterName) return "";
    if (sem !== semesterName) return `Plan für ${sem}`;
    if (modul && !imSemester(modul, sem)) return modul.semester ? `liegt jetzt in ${modul.semester}` : "nicht mehr in deinem Plan";
    return "";
  };
  const AUS = { art: "aus", pille: { art: "leer", text: "nicht mehr dran" }, woche: [], naechstes: -1 };
  // Semester, für das ein Lernplan gerade zählt: das laufende (jetzt). Wer im Nachholtermin schreibt, lernt nach dem Ende des
  // Semesters der Notiz (notiz) weiter für dessen Klausur, bis NACHHOL_TAGE danach.
  const NACHHOL_TAGE = 45;
  const planSemester = (jetzt, notiz, nachhol, heute) => (nachhol && notiz && jetzt && notiz.name !== jetzt.name && notiz.ende < heute
    && heute <= plusTage(notiz.ende, NACHHOL_TAGE) ? notiz : jetzt);
  // Das nächste Semester nach semName aus der Semesterliste, in dem das Modul angeboten wird (turnus „WS“, „SS“, „WS, SS“; ohne
  // Angabe jedes) → Name oder ""
  const spaeterSemester = (turnus, semName, liste) => {
    const t = String(turnus || ""), L = liste || [], i = L.findIndex((s) => s.name === semName);
    if (i < 0) return "";
    return (L.slice(i + 1).find((s) => !/WS|SS/.test(t) || t.indexOf(s.name.slice(0, 2)) >= 0) || { name: "" }).name;
  };
  // Wofür du dich bei einem Modul entschieden hast: "haupt" (Klausur im Haupttermin), "nachhol" (im Nachholtermin), "spaeter" (in
  // ein späteres Semester gelegt); null, wo es nichts zu wählen gibt (fertig, Notiz für ein anderes Semester, ohne Modulnotiz oder
  // ohne Kapitel)
  const terminWahl = (P) => {
    if (!P.modul || !P.modul.f || P.fehlt === "keine Kapitel") return null;
    if (P.aus) return /^(liegt jetzt in|nicht mehr in deinem Plan)/.test(P.aus) ? "spaeter" : null;
    return P.nachhol ? "nachhol" : "haupt";
  };
  // Wann eine Klausur ist, kurz für die Wahl: „Sa 30.1.“, geschätzt „ca. Do 1.4.“, nur die Phase „ab 30.3.“
  const terminText = (k) => (!k ? "Termin fehlt" : k.phase ? `ab ${tm(k.datum)}` : `${k.geschaetzt ? "ca. " : ""}${wtm(k.datum)}`);

  // Material für die Klausur: Altklausuren des Moduls (von alt nach neu; bearbeitet = status bearbeitet) und Übungsblätter dieses
  // Semesters (bearbeitet oder erledigt). Lösungen zählen nicht.
  const vorbereitungVon = (code, semesterName) => {
    const alt = [], uebung = [];
    for (const f of app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith("Unterlagen/")) continue;
      const fm = fmVon(f);
      if (fm.typ !== "unterlage" || String(fm.code || "").trim() !== code) continue;
      const fertig = fm.status === "bearbeitet" || fm.erledigt === true;
      if (fm.art === "Altklausur") alt.push({ f, titel: String(fm.titel || f.basename).trim(), fertig });
      else if (fm.art === "Übung" && (!semesterName || !fm.semester || String(fm.semester).trim() === semesterName)) uebung.push({ f, fertig });
    }
    alt.sort((a, b) => altersSchluessel(a.titel) - altersSchluessel(b.titel) || a.titel.localeCompare(b.titel, "de"));
    return { alt, uebung };
  };

  // Alles für einen Lernplan: Kapitel mit Gewicht, „da“ und „erreicht“, Klausur, Ziel, Plan, Stand, Material für die Klausur. Ein
  // Lernplan, der nicht mehr dran ist, hat keinen Plan (aus = Grund, Stand „nicht mehr dran“). o: { faktoren, anteil }
  const sammeln = async (f, D, heute, o) => {
    const text = await app.vault.cachedRead(f);
    const fm = fmVon(f), code = codeVon(f);
    const modul = D.module.find((m) => m.code === code) || null;
    const basis = { f, code, modul, heute, herkunft: String(fm.herkunft || ""), vorlaeufig: fm.vorlaeufig === true, vorlernen: fm.vorlernen !== false,
      ects: (modul && modul.ects) || 5 };
    const roh = kapitelLesen(text);
    if (!roh.length) return Object.assign(basis, { kapitel: [], fehlt: "keine Kapitel" });
    const folien = folienZuordnen(roh, folienSammeln(code), !!fm.herkunft);
    // Führt die Liste Vorlesungstage, hat die Vorlesung ein Kapitel ohne Tag noch nicht erreicht; sonst gilt jedes als erreicht
    const verfolgt = roh.some((k) => k.vorlesung);
    const kapitel = roh.map((k, i) => {
      const ziele = k.links.map((l) => app.metadataCache.getFirstLinkpathDest(l, f.path)).filter(Boolean);
      const fol = folien[i];
      const verlinkt = ziele.map((z) => parseInt(fmVon(z).seiten, 10)).filter((x) => x > 0)[0] || null;
      return Object.assign({}, k, { anteil: anteilVon(k), da: ziele.length > 0 || k.web.length > 0 || !!fol,
        erreicht: verfolgt ? !!k.vorlesung && k.vorlesung <= heute : true,
        seitenWert: k.seiten || verlinkt || (fol && fol.seiten) || null, ziel: ziele[0] || (fol && fol.f) || null, webZiel: k.web[0] || null });
    });
    const wahl = zeitWahlLesen(fm.kapitel_zeit), zeitAn = fm.zeit_je_kapitel === true;
    basis.zeitAn = zeitAn;
    gewichte(kapitel).forEach((g, i) => { const z = zeitStufe(kapitel[i], wahl, zeitAn); kapitel[i].zeit = z; kapitel[i].gewicht = g * ZEIT_FAKTOR[z.stufe]; });
    // Beginn: das Semester des Plans (planSemester; eine Notiz für ein anderes Semester sortiert nichtMehrDran aus). Die Klausur im
    // Haupt- und im Nachholtermin, damit du wählen kannst; es gilt deine Wahl.
    const nachhol = imNachhol(modul), semName = String(fm.semester || "").trim();
    const sem = planSemester(ctx.modell.semesterFuer(heute), semName && ctx.modell.semesterNachName ? ctx.modell.semesterNachName(semName) : null, nachhol, heute);
    const termine = { haupt: klausurVon(D, code, heute, false), nachhol: klausurVon(D, code, heute, true) };
    Object.assign(basis, { nachhol, semester: sem ? sem.name : "", termine });
    const aus = nichtMehrDran(fm, modul, sem && sem.name);
    if (aus) return Object.assign(basis, { kapitel, aus, stand: AUS });
    const kl = termine[nachhol ? "nachhol" : "haupt"];
    if (!kl) return Object.assign(basis, { kapitel, fehlt: "keine Klausur" });
    const vb = (sem && sem.vb) || heute;
    const seit = s10(fm.seit);
    const beginn = seit && seit > vb ? seit : vb;
    const eigenesZiel = s10(fm.verstanden_bis);
    const ziel = eigenesZiel || zielVon(beginn, kl.datum, o.anteil);
    // Zwischentest: verstanden bis zum Sonntag vor seiner Woche
    kapitel.forEach((k) => { k.frist = k.zwischentest ? plusTage(montagVon(k.zwischentest), -1) : ""; });
    let plan = planen({ kapitel, beginn, ziel, heute, pausen: D.pausen, freie: D.freieTage, faktoren: o.faktoren });
    let geschaetzt = null, zielAnzeige = ziel;
    if (!basis.vorlernen) {
      const ve = sem && sem.ve && sem.ve < kl.datum ? sem.ve : kl.datum;
      const grenze = nachVorlesung(kapitel, vb, ve), spaetestens = plusTage(montagVon(kl.datum), -1);
      const faellig = plan.faellig.map((d, i) => { const x = d > grenze[i].tag ? d : grenze[i].tag; return x < spaetestens ? x : spaetestens; });
      geschaetzt = faellig.map((d, i) => grenze[i].geschaetzt && d === grenze[i].tag);
      plan = Object.assign({}, plan, { faellig });
      faellig.forEach((d) => { if (d > zielAnzeige) zielAnzeige = d; });
    }
    const S = stand({ kapitel, plan, heute, ziel: zielAnzeige, klausur: kl.datum, vorlernen: basis.vorlernen });
    const V = vorbereitungVon(code, sem && sem.name);
    return Object.assign(basis, { kapitel, klausur: kl, beginn, ziel: zielAnzeige, zielPlan: ziel, eigenesZiel: !!eigenesZiel, plan, geschaetzt, stand: S,
      vorb: V, alt: altklausurPlan(V.alt, heute, kl.datum) });
  };
  // Was für alle Lernpläne gilt: deine Wochen mit weniger Zeit, wann alles verstanden sein soll (anteilWahl)
  const optionen = (D) => {
    const ein = einstellungen(), W = anteilWahl(ein[FELD_ANTEIL], D.zielnote);
    return { faktoren: faktorenLesen(ein[FELD_WOCHEN]), anteil: W.anteil, anteilQuelle: W.quelle };
  };
  const allesSammeln = async (D, heute) => {
    const o = optionen(D);
    const alle = [];
    for (const f of lernplaene()) alle.push(await sammeln(f, D, heute, o));
    const farbe = modulFarben(alle.map((P) => P.code));
    for (const P of alle) P.farbe = farbe[P.code] || 0;
    return { alle, o };
  };
  const aktiv = (P) => !!(P.plan && P.stand && P.stand.art !== "vorbei" && P.stand.art !== "aus");
  // Für die Claude-App (server.js, Lagebild im Stand an den eigenen Server, nur solange sie an ist): je Lernplan, der noch dran ist
  // (ohne nichtMehrDran), jedes Kapitel mit Nummer, Titel, verstanden (abgehakt bzw. alle Unterkapitel) und dem Montag der Woche, in
  // der der Plan es vorsieht → [{ modul, kapitel: [{ titel, nummer?, verstanden, woche? }] }]
  const kapitelStand = async () => {
    if (!ctx.modell || typeof ctx.modell.daten !== "function") return [];
    const { alle } = await allesSammeln(ctx.modell.daten(), heuteIso());
    return alle.filter((P) => !P.aus && P.kapitel.length).map((P) => ({ modul: P.code, kapitel: P.kapitel.map((k, i) => Object.assign(
      { titel: k.titel, verstanden: anteilVon(k) >= 1 - EPS }, k.nr ? { nummer: k.nr } : {}, P.plan && P.plan.faellig[i] ? { woche: montagVon(P.plan.faellig[i]) } : {})) }));
  };
  // Farbe je Modul wie im Stundenplan (woche.js; 1–6, --eba-modul-n); Module ohne Stundenplan bekommen die nächsten Farben, in der
  // Reihenfolge ihrer Kürzel
  const modulFarben = (codes) => {
    let farbe = {};
    try { farbe = Object.assign({}, ctx.woche && ctx.woche.modulFarben ? ctx.woche.modulFarben() : {}); } catch (e) { farbe = {}; }
    let n = Object.keys(farbe).length;
    for (const c of codes.slice().sort()) if (!farbe[c]) farbe[c] = (n++ % 6) + 1;
    return farbe;
  };

  // ---------- Schreiben ----------
  // Ein Kapitel abhaken oder zurücknehmen
  const schreiben = async (f, k) => {
    let ok = false;
    await app.vault.process(f, (data) => {
      const z = data.split("\n");
      const passt = (s) => (s || "").replace(/\r$/, "") === k.roh;
      let i = k.zeile;
      if (!passt(z[i])) { const tr = []; z.forEach((s, j) => { if (passt(s)) tr.push(j); }); i = tr.length === 1 ? tr[0] : -1; }
      if (i < 0) return data;
      const neu = z[i].replace(/^([ \t]*[-*+] )\[[ xX]\]/, "$1[" + (k.fertig ? " " : "x") + "]");
      if (neu === z[i]) return data;
      z[i] = neu; ok = true;
      return z.join("\n");
    });
    if (!ok) try { ctx.hinweis(`„${f.basename}“ hat sich inzwischen geändert und ist nicht abgehakt. Bitte noch einmal tippen.`); } catch (e) { /* ohne Obsidian */ }
  };
  // Zeit einer Woche (Anteil 0–1; 1 = volle Zeit, Eintrag fällt weg) in System/Einstellungen.md
  const zeitSchreiben = async (mo, anteil) => {
    const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
    if (!f) return;
    await app.fileManager.processFrontMatter(f, (fm) => {
      const liste = (Array.isArray(fm[FELD_WOCHEN]) ? fm[FELD_WOCHEN] : []).filter((x) => !String(x).trim().startsWith(mo));
      if (anteil < 1) liste.push(`${mo} ${Math.round(anteil * 100)}`);
      liste.sort();
      if (liste.length) fm[FELD_WOCHEN] = liste; else delete fm[FELD_WOCHEN];
    });
  };
  // Deine Wahl zur Klausur in die Modulnotiz (wie die Modulseite): Haupttermin (klausurtermin fällt weg) oder Nachholtermin, beides in
  // diesem Semester (semester_geplant leer, wenn der Musterplan das Modul ohnehin hierhin legt); später = das nächste Semester, in
  // dem es angeboten wird (spaeterSemester)
  const terminSchreiben = async (P, wahl) => {
    const f = P.modul && P.modul.f, M = ctx.modell;
    if (!f || !P.semester) return;
    await app.fileManager.processFrontMatter(f, (fm) => {
      if (wahl === "spaeter") {
        const s = spaeterSemester(fm.turnus, P.semester, M.daten().semesterliste);
        if (s) { fm.semester_geplant = s; delete fm.klausurtermin; }
        return;
      }
      if (wahl === "nachhol") fm.klausurtermin = "Nachholtermin"; else delete fm.klausurtermin;
      if (M.modulSemester(fm) !== P.semester) fm.semester_geplant = M.modulSemester(Object.assign({}, fm, { semester_geplant: "" })) === P.semester ? "" : P.semester;
    });
  };

  // ---------- Zeichnen ----------
  const auf = ctx.bleibend("auf", () => ({}));
  const nurStoppen = (knoten) => knoten.addEventListener("mousedown", (e) => e.stopPropagation()); // Live Preview: nicht in den Quelltext
  const oeffnen = (f, e, quelle) => { e.preventDefault(); e.stopPropagation(); ctx.oeffnen(f, { quelle: quelle || "", neu: e.ctrlKey || e.metaKey }); };
  const linkZu = (el, text, f, quelle) => {
    const a = el.createEl("a", { cls: "internal-link", text, href: f.path, attr: { "data-href": f.path } });
    nurStoppen(a);
    a.addEventListener("click", (e) => oeffnen(f, e, quelle));
    return a;
  };

  const kapitelName = (k, i) => (k.nr ? `Kapitel ${k.nr}` : `Kapitel ${i + 1}`);
  const nummern = (P, idx) => idx.map((i) => P.kapitel[i].nr || String(i + 1));
  const namenListe = (P, idx) => {
    const n = nummern(P, idx);
    return n.length === 1 ? `Kapitel ${n[0]}` : `Kapitel ${n.slice(0, -1).join(", ")} und ${n[n.length - 1]}`;
  };
  const altText = (n) => (n === 1 ? "1 Altklausur" : `${n} Altklausuren`);
  // Teile einer Zeile verbinden: Der Punkt hängt am Teil davor, bricht die Zeile um, steht kein „·“ am Zeilenanfang
  const verbinden = (teile) => teile.join("\u00a0· ");
  // Stand in Teilen: „2 von 7 Kapiteln“, „diese Woche Kapitel 3“, „verstanden bis So 3.1.“, „Klausur Sa 6.2.“; klausur = auf der
  // Modulseite weggelassen (dort steht die Prüfung). Jeder Teil bricht nicht mitten um (feste Leerzeichen), nur der Satz ohne Kapitel.
  const standTeile = (P) => standRoh(P).map((x) => (x.satz ? x : Object.assign({}, x, { text: x.text.split(" ").join("\u00a0") })));
  const standRoh = (P) => {
    if (P.fehlt === "keine Kapitel") return [{ text: "Noch keine Kapitel eingetragen.", satz: true }];
    const fertig = P.kapitel.filter((k) => k.anteil >= 1 - EPS).length;
    const teile = [{ text: `${fertig} von ${P.kapitel.length} Kapiteln${P.vorlaeufig ? " (Liste vorläufig)" : ""}` }];
    if (P.aus) return teile.concat({ text: P.aus });
    if (P.fehlt === "keine Klausur") return teile.concat({ text: "Datum der Klausur fehlt" });
    const S = P.stand;
    if (S.art === "vorbei") return teile.concat({ text: `Klausur war am ${wtm(P.klausur.datum)}` });
    if (S.art === "vorbereitung") {
      // Sagt die Pille schon „Klausurvorbereitung“, nur seit wann
      const seit = wtm(plusTage(P.ziel, 1));
      teile.push({ text: S.pille && S.pille.text === "Klausurvorbereitung" ? `seit ${seit}` : `Klausurvorbereitung seit ${seit}` });
      if (P.vorb.alt.length) teile.push({ text: `${P.alt.fertig} von ${altText(P.vorb.alt.length)}` });
    } else {
      // Was diese Woche fällig wird; Überfälliges sagt die Pille, sonst das nächste Kapitel mit Datum
      const mo = montagVon(P.heute), so = plusTage(mo, 6);
      const jetzt = S.woche.filter((i) => P.plan.faellig[i] >= mo);
      const spaeter = P.kapitel.map((k, i) => i).filter((i) => P.kapitel[i].anteil < 1 - EPS && P.plan.faellig[i] > so)[0];
      if (jetzt.length) teile.push({ text: `diese Woche ${namenListe(P, jetzt)}` });
      else if (spaeter != null) teile.push({ text: `${kapitelName(P.kapitel[spaeter], spaeter)} bis ${wtm(P.plan.faellig[spaeter])}` });
      teile.push({ text: `verstanden bis ${wtm(P.ziel)}` });
    }
    return teile.concat({ text: `Klausur ${wtm(P.klausur.datum)}${P.klausur.geschaetzt ? " (geschätzt)" : ""}`, klausur: true });
  };
  const titelVon = (P) => (P.modul ? `${P.code} ${P.modul.titel}` : P.f.basename);

  // Neben einem offenen Kapitel: „bis So 8.11.“ (geschätzt „bis ca.“), „überfällig seit So 18.10.“ (fällig, da und die Vorlesung
  // hatte es), dazu „noch nicht da“, bis Sonntag „vor der Vorlesung“ und der Zwischentest. Vor dieser Woche fällig, aber nicht
  // überfällig (noch nicht da, die Vorlesung hatte es noch nicht): ohne Datum, das vorbei ist („bis So 25.10.“ las sich wie ein
  // Fehler), nur der Grund → { text, ueberfaellig }
  const bisText = (P, i) => {
    const k = P.kapitel[i], d = P.plan.faellig[i], mo = montagVon(P.heute);
    const ueberfaellig = d < mo && k.da && k.erreicht !== false, vorbei = d < mo && !ueberfaellig;
    const teile = ueberfaellig ? [`überfällig seit ${wtm(d)}`] : vorbei ? [] : [`bis ${P.geschaetzt && P.geschaetzt[i] ? "ca. " : ""}${wtm(d)}`];
    if (!k.da) teile.push("noch nicht da");
    else if (k.erreicht === false && (vorbei || (P.vorlernen && d <= plusTage(mo, 6)))) teile.push(P.vorlernen ? "vor der Vorlesung" : "nach der Vorlesung");
    if (k.zwischentest && k.zwischentest >= P.heute) teile.push(`Zwischentest ${wtm(k.zwischentest)}`);
    return { text: verbinden(teile), ueberfaellig };
  };
  // Heute in „Diese Woche“ abgehakte Kapitel bleiben dort bis morgen stehen (zum Zurücknehmen), gerätelokal; zuletzt: das eben
  // abgehakte Kapitel und wann (es leuchtet kurz auf, auch über das neue Zeichnen hinweg)
  const abgehakt = ctx.bleibend("abgehakt", () => ({ tag: "", keys: {}, zuletzt: null }));
  const LEUCHTEN = 1600;
  const abgehaktKey = (P, k) => `${P.f.path}|${titelSchluessel(k.titel)}`;
  const abgehaktHeute = (P, k) => abgehakt.tag === P.heute && !!abgehakt.keys[abgehaktKey(P, k)];
  // Fälligkeit neben dem Titel (PC, iPad) bzw. darunter (iPhone); auf dem iPhone steht dort auch das Kürzel mit der Nummer des
  // Kapitels („B110 1“), vorn hätte der Titel sonst kaum Platz
  const unterTitel = (inhalt, code, text, ueberfaellig) => {
    const s = inhalt.createSpan({ cls: "eba-lp-k-bis" + (ueberfaellig ? " is-ueberfaellig" : "") + (text ? "" : " is-leer") });
    if (code) s.createSpan({ cls: "eba-lp-k-code-unten", text: code });
    if (text) s.appendText(text);
  };
  // Ein Kapitel: Kästchen wie bei den To-dos (.eba-td-haken, ganze Zeilenhöhe als Tippfläche; halb verstanden = unbestimmt),
  // Kürzel des Moduls mit seiner Farbe (mitCode, in der gewählten Woche), Nummer, dann Titel (Tipp öffnet die Folien bzw. das
  // Lehrbuch) und bisText. Eben abgehakt: Die Zeile leuchtet auf (.is-frisch; nach dem neuen Zeichnen läuft das Leuchten weiter).
  const kapitelZeile = (l, P, i, quelle, neu, mitCode) => {
    const k = P.kapitel[i];
    const z = l.createDiv({ cls: `eba-lp-k modul-${P.farbe || 0}` + (k.anteil >= 1 - EPS ? " is-fertig" : "") });
    const Z = abgehakt.zuletzt, seit = Z && Z.key === abgehaktKey(P, k) && k.anteil >= 1 - EPS ? Date.now() - Z.zeit : LEUCHTEN;
    if (seit < LEUCHTEN) { z.addClass("is-frisch"); z.style.animationDelay = `-${seit}ms`; }
    const haken = z.createEl("label", { cls: "eba-td-haken" });
    const box = haken.createEl("input", { attr: { type: "checkbox", "aria-label": "Verstanden: " + (mitCode ? P.code + " " : "") + k.titel } });
    box.checked = k.anteil >= 1 - EPS;
    box.indeterminate = k.anteil > EPS && k.anteil < 1 - EPS;
    nurStoppen(haken);
    haken.addEventListener("click", (e) => e.stopPropagation());
    box.addEventListener("change", async (e) => {
      e.stopPropagation();
      z.toggleClass("is-fertig", box.checked);
      if (box.checked) {
        abgehakt.zuletzt = { key: abgehaktKey(P, k), zeit: Date.now() };
        z.addClass("is-frisch");
      }
      if (box.checked && mitCode) {
        if (abgehakt.tag !== P.heute) { abgehakt.tag = P.heute; abgehakt.keys = {}; }
        abgehakt.keys[abgehaktKey(P, k)] = true;
      }
      try { await schreiben(P.f, k); } catch (err) { console.error("Lernplan abhaken", err); }
      neu();
    });
    const t = z.createDiv({ cls: "eba-lp-k-text" });
    if (mitCode) t.createSpan({ cls: "eba-lp-k-code", text: P.code });
    t.createSpan({ cls: "eba-lp-k-nr", text: k.nr || String(i + 1) });
    const inhalt = t.createDiv({ cls: "eba-lp-k-inhalt" });
    // Name eigens (nur er ist als Link unterstrichen), davor ein festes Leerzeichen statt Rand: Die Zahl der Unterkapitel bricht
    // mit dem letzten Wort um (seit 2.11.2026; vorher stand „0 von 10“ allein in einer Zeile)
    const titel = inhalt.createSpan({ cls: "eba-lp-k-titel" });
    titel.createSpan({ cls: "eba-lp-k-name", text: k.titel });
    if (k.teile.length && k.anteil < 1 - EPS) { titel.appendText("\u00a0"); titel.createSpan({ cls: "eba-lp-k-teil", text: `${k.teile.filter((x) => x.fertig).length} von ${k.teile.length}` }); }
    if (k.ziel || k.webZiel) {
      titel.addClass("is-link");
      nurStoppen(titel);
      titel.addEventListener("click", (e) => {
        if (k.ziel) { oeffnen(k.ziel, e, quelle); return; }
        e.preventDefault(); e.stopPropagation(); window.open(k.webZiel);
      });
    }
    const b = P.plan && k.anteil < 1 - EPS ? bisText(P, i) : null;
    // Im aufgeklappten Modul „mehr Zeit“ bzw. „weniger Zeit“ hinter der Frist (die Wahl steht seit 2.11.2026 unter „Lernplan einstellen“)
    const teile = [b ? b.text : "", !mitCode && k.zeit && k.zeit.stufe !== "normal" ? `${k.zeit.stufe} Zeit` : ""].filter(Boolean);
    if (teile.length || mitCode) unterTitel(inhalt, mitCode && `${P.code} ${k.nr || String(i + 1)}`, verbinden(teile), !!(b && b.ueberfaellig));
  };
  // Weniger, Normal, Mehr für ein Kapitel (Segmentschalter wie in der Darstellung); was dem Vorschlag aus den Altklausuren entspricht,
  // steht nicht in der Notiz, so gilt ein neuer Vorschlag später wieder
  const zeitWahlZeichnen = (el, P, k, neu) => {
    const vorschlag = relevanzStufe(k.altklausuren) || "normal";
    const g = el.createDiv({ cls: "eba-ds eba-lp-zeitwahl", attr: { role: "radiogroup", "aria-label": `Zeit für ${k.nr} ${k.titel}` } });
    for (const [wert, titel] of [["weniger", "Weniger"], ["normal", "Normal"], ["mehr", "Mehr"]]) {
      const an = k.zeit.stufe === wert;
      const b = g.createEl("button", { cls: "eba-ds-wahl", text: titel, attr: { type: "button", role: "radio", "aria-checked": String(an) } });
      nurStoppen(b);
      b.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (an) return;
        try { await app.vault.process(P.f, (x) => zeitSetzen(x, k.nr, wert === vorschlag ? "" : wert) || x); } catch (err) { console.error("Lernplan Zeit je Kapitel", err); }
        neu();
      });
    }
  };
  // Schalter „Zeit je Kapitel“ (seit 1.11.2026, aus, bis du ihn einschaltest; seit 2.11.2026 unter „Lernplan einstellen“, vorher im
  // aufgeklappten Modul mit „Anpassen“, das die Wahl unter jedes Kapitel legte): darunter, woher die Zeit kommt bzw. was „an“ hieße;
  // eingeschaltet folgt im Fenster je Kapitel Weniger, Normal, Mehr
  const zeitZeile = (el, P, neu) => {
    const z = el.createEl("label", { cls: "eba-lp-schalter eba-lp-zeitje" });
    const t = z.createSpan({ cls: "eba-lp-schalter-text" });
    t.createSpan({ text: "Zeit je Kapitel" });
    t.createSpan({ cls: "eba-lp-schalter-hilfe", text: zeitSatz(P.kapitel, P.zeitAn) });
    const box = umschalter(z, P.zeitAn);
    nurStoppen(z);
    z.addEventListener("click", (e) => e.stopPropagation());
    box.addEventListener("change", async () => {
      try {
        let ok = true;
        await app.vault.process(P.f, (x) => { const n = zeitAnSetzen(x, box.checked); ok = n != null; return ok ? n : x; });
        if (!ok) await app.fileManager.processFrontMatter(P.f, (fm) => { if (box.checked) fm.zeit_je_kapitel = true; else delete fm.zeit_je_kapitel; });
      }
      catch (err) { console.error("Lernplan Zeit je Kapitel", err); }
      neu();
    });
  };
  // Der Satz dazu. Eingeschaltet aus den Kapiteln mit ihrer Zeit (zeitStufe): „Nach 12 Altklausuren: mehr Zeit für 4 und 7, weniger
  // für 1. Von dir geändert: 3.“ bzw. „Nach den Seiten der Kapitel.“; aus, was das Einschalten brächte
  const zeitSatz = (kapitel, an) => {
    const und = (l) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} und ${l[l.length - 1]}`);
    const nrn = (f) => und(kapitel.filter(f).map((k) => k.nr || k.titel));
    const von = Math.max(0, ...kapitel.map((k) => (k.altklausuren ? k.altklausuren.von : 0)));
    if (!an) {
      const mehr = nrn((k) => relevanzStufe(k.altklausuren) === "mehr"), weniger = nrn((k) => relevanzStufe(k.altklausuren) === "weniger");
      const was = [mehr ? `mehr Zeit für ${mehr}` : "", weniger ? `weniger für ${weniger}` : ""].filter(Boolean).join(", ");
      return "Alle Kapitel zählen nach ihren Seiten. " + (von >= ALT_MIN && was ? `Eingeschaltet nach ${von} Altklausuren ${was}.`
        : "Eingeschaltet gibst du einzelnen Kapiteln mehr oder weniger Zeit.");
    }
    const alt = (s) => (k) => k.zeit && k.zeit.quelle === "altklausuren" && k.zeit.stufe === s;
    const teile = [];
    if (von >= ALT_MIN) {
      const mehr = nrn(alt("mehr")), weniger = nrn(alt("weniger"));
      const was = [mehr ? `mehr Zeit für ${mehr}` : "", weniger ? `weniger für ${weniger}` : ""].filter(Boolean).join(", ");
      teile.push(`Nach ${von} Altklausuren: ${was || "alle Kapitel etwa gleich oft dran"}.`);
    } else teile.push("Nach den Seiten der Kapitel.");
    const eigen = nrn((k) => k.zeit && k.zeit.quelle === "wahl");
    if (eigen) teile.push(`Von dir geändert: ${eigen}.`);
    return teile.join(" ");
  };

  // Üben (aufgeklapptes Modul; bis 2.11.2026 „Für die Klausur“, zu nah an „Klausur“, dem Termin darüber): Altklausuren (wie viele bearbeitet, in der Klausurvorbereitung wie viele diese Woche
  // und welche als Nächstes, die neueste für den Vortag), Übungsblätter, heute fällige Karteikarten mit „Lernen“
  const vorbereitungZeichnen = (el, P, karten, quelle) => {
    const V = P.vorb, A = P.alt, kz = karten && karten[P.code];
    if (!V || (!V.alt.length && !V.uebung.length && !kz)) return;
    const box = el.createDiv({ cls: "eba-lp-vorb" });
    box.createDiv({ cls: "eba-lp-vorb-titel", text: "Üben" });
    const zeile = (titel, text) => {
      const z = box.createDiv({ cls: "eba-lp-v" });
      z.createSpan({ cls: "eba-lp-v-titel", text: titel });
      return z.createSpan({ cls: "eba-lp-v-text", text });
    };
    if (V.alt.length) {
      const vorbereitung = P.stand && P.stand.art === "vorbereitung";
      const teile = [`${A.fertig} von ${V.alt.length} bearbeitet`];
      if (vorbereitung && A.dieseWoche) teile.push(`diese Woche ${A.dieseWoche} auf Zeit`);
      else if (!vorbereitung && A.offen.length && P.stand && P.stand.art !== "vorbei") teile.push(`auf Zeit ab\u00a0${wtm(plusTage(P.ziel, 1)).replace(/ /g, "\u00a0")}`);
      const t = zeile("Altklausuren", verbinden(teile));
      if (A.naechste) { t.appendText("\u00a0· als Nächstes "); linkZu(t, A.naechste.titel, A.naechste.f, quelle); }
      if (A.vortag) box.createDiv({ cls: "eba-lp-v-hilfe", text: `Die neueste, ${A.vortag.titel}, bleibt für den Tag vor der Klausur.` });
    }
    if (V.uebung.length) zeile("Übungsblätter", `${V.uebung.filter((u) => u.fertig).length} von ${V.uebung.length} bearbeitet`);
    if (kz) {
      const n = kz.faellig + kz.lernen + kz.neu;
      const t = zeile("Karteikarten", n ? `${n} heute dran` : "heute nichts dran");
      if (n) { t.appendText("\u00a0· "); const a = t.createEl("a", { text: "Lernen", href: ctx.link("karten-lernen", { code: P.code }) }); nurStoppen(a); }
    }
  };
  // vorlernen: false setzen (an = false) oder löschen, nur diese Zeile im Frontmatter: processFrontMatter schriebe das ganze
  // Frontmatter neu (Anführungszeichen um semester und quelle fielen weg). Ohne Frontmatter → null
  const VORN = /^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/;
  // Die Zeile, auf die feld passt, löschen und zeile (falls nicht leer) ans Ende des Frontmatters
  const zeileSetzen = (text, feld, zeile) => {
    const m = VORN.exec(text);
    if (!m) return null;
    const zeilen = m[1].split(/\r?\n/).filter((z) => !feld.test(z));
    if (zeile) zeilen.push(zeile);
    const nl = m[0].indexOf("\r\n") >= 0 ? "\r\n" : "\n";
    return `---${nl}${zeilen.join(nl)}${nl}---${text.slice(m[0].length)}`;
  };
  const vorlernenSetzen = (text, an) => zeileSetzen(text, /^vorlernen\s*:/, an ? "" : "vorlernen: false");
  // Schalter „Zeit je Kapitel“: an = zeit_je_kapitel: true, aus = Zeile weg (deine Wahl in kapitel_zeit bleibt für später)
  const zeitAnSetzen = (text, an) => zeileSetzen(text, /^zeit_je_kapitel\s*:/, an ? "zeit_je_kapitel: true" : "");

  // ---------- Zeit je Kapitel (seit 1.11.2026) ----------
  // Wie viel Zeit ein Kapitel im Plan bekommt: „mehr“ (×1,5), „normal“ oder „weniger“ (×0,5), nur wenn du es für das Modul
  // einschaltest (zeit_je_kapitel: true in der Notiz, standardmäßig aus; aus zählt jedes Kapitel nur nach seinen Seiten).
  // Deine Wahl (kapitel_zeit) geht vor; sonst die Klausurrelevanz aus der Kapitelliste („in 9 von 12 Altklausuren“, ausgezählt vom
  // Uni-Abgleich), aber erst ab ALT_MIN Altklausuren: ab drei Vierteln mehr, bis zu einem Viertel weniger.
  // → { stufe, quelle: "wahl" | "altklausuren" | "" }
  const ZEIT_FAKTOR = { mehr: 1.5, normal: 1, weniger: 0.5 };
  const ALT_MIN = 5;
  const relevanzStufe = (a) => (!a || a.von < ALT_MIN ? "" : a.in / a.von >= 0.75 ? "mehr" : a.in / a.von <= 0.25 ? "weniger" : "normal");
  const zeitStufe = (k, wahl, an) => {
    if (!an) return { stufe: "normal", quelle: "" };
    const w = wahl && k.nr ? wahl[k.nr] : "";
    if (w) return { stufe: w, quelle: "wahl" };
    const r = relevanzStufe(k.altklausuren);
    return r ? { stufe: r, quelle: "altklausuren" } : { stufe: "normal", quelle: "" };
  };
  // kapitel_zeit (["3 mehr", "IV weniger"]) → { 3: "mehr", IV: "weniger" }
  const ZEIT_WAHL = /^(\S{1,8})\s+(mehr|normal|weniger)$/;
  const zeitWahlLesen = (v) => {
    const aus = {};
    for (const x of Array.isArray(v) ? v : []) { const m = String(x).trim().match(ZEIT_WAHL); if (m) aus[m[1]] = m[2]; }
    return aus;
  };
  // Deine Wahl für Kapitel nr in die Notiz schreiben, nur die Zeile kapitel_zeit (wie vorlernenSetzen); stufe "" nimmt sie zurück
  // (dann gilt wieder die Klausurrelevanz). Liest die Liste in der Form, in der sie steht (eine Zeile `[…]` oder darunter `  - …`).
  // Ohne Frontmatter → null
  const zeitSetzen = (text, nr, stufe) => {
    const m = VORN.exec(text);
    if (!m) return null;
    const alt = m[1].split(/\r?\n/), zeilen = [], vorher = [];
    for (let i = 0; i < alt.length; i++) {
      if (!/^kapitel_zeit\s*:/.test(alt[i])) { zeilen.push(alt[i]); continue; }
      const eine = alt[i].replace(/^kapitel_zeit\s*:\s*/, "");
      if (eine.charAt(0) === "[") { try { vorher.push(...JSON.parse(eine)); } catch (err) { vorher.length = 0; } }
      while (i + 1 < alt.length && /^\s+-\s/.test(alt[i + 1])) vorher.push(alt[++i].replace(/^\s+-\s+/, "").replace(/^["']|["']$/g, ""));
    }
    const wahl = zeitWahlLesen(vorher);
    if (stufe) wahl[nr] = stufe; else delete wahl[nr];
    const liste = Object.keys(wahl).map((k) => `${k} ${wahl[k]}`);
    if (liste.length) zeilen.push(`kapitel_zeit: ${JSON.stringify(liste)}`);
    const nl = m[0].indexOf("\r\n") >= 0 ? "\r\n" : "\n";
    return `---${nl}${zeilen.join(nl)}${nl}---${text.slice(m[0].length)}`;
  };
  // Schalter „Vor der Vorlesung lernen“ (aufgeklapptes Modul): aus = vorlernen: false in der Notiz
  // Ein Schalter an/aus rechts in einer Einstellungszeile (seit 2.11.2026; vorher das Kästchen der Kapitel links: Ein
  // eingeschalteter Schalter sah aus wie ein verstandenes Kapitel). Ein Kästchen mit role="switch", in CSS Schiene und Knopf
  const umschalter = (z, an) => {
    const box = z.createEl("input", { cls: "eba-lp-umschalter", attr: { type: "checkbox", role: "switch" } });
    box.checked = an;
    return box;
  };
  const schalterZeichnen = (el, P, neu) => {
    const z = el.createEl("label", { cls: "eba-lp-schalter" });
    const t = z.createSpan({ cls: "eba-lp-schalter-text" });
    t.createSpan({ text: "Vor der Vorlesung lernen" });
    const spaeter = !P.vorlernen && P.zielPlan && P.ziel > P.zielPlan ? ` Alles verstanden erst am ${wtm(P.ziel)} statt am ${wtm(P.zielPlan)}` : "";
    t.createSpan({ cls: "eba-lp-schalter-hilfe", text: P.vorlernen ? "Die Kapitel sind gleichmäßig verteilt, auch vor ihrer Vorlesung."
      : "Ein Kapitel ist frühestens eine Woche nach seiner Vorlesung dran." + spaeter });
    const box = umschalter(z, P.vorlernen);
    nurStoppen(z);
    z.addEventListener("click", (e) => e.stopPropagation());
    box.addEventListener("change", async () => {
      try {
        let ok = true;
        await app.vault.process(P.f, (t) => { const n = vorlernenSetzen(t, box.checked); ok = n != null; return ok ? n : t; });
        if (!ok) await app.fileManager.processFrontMatter(P.f, (fm) => { if (box.checked) delete fm.vorlernen; else fm.vorlernen = false; });
      }
      catch (err) { console.error("Lernplan vorlernen", err); }
      neu();
    });
  };

  // Aufgeklappt (Lernplan-Seite und Lernplan-Notiz): zuerst der Klausurtermin (seit 2.11.2026 wieder oben: unter „Für die Klausur“
  // nach allen Kapiteln war er auf dem iPhone 920 px unter dem Tipp vergraben), dann die Kapitel und „Üben“; auf der Seite zuletzt
  // der Verweis auf die Notiz (inNotiz: ohne, er zeigte auf sich selbst). Die Einstellungen des Moduls stehen seit 2.11.2026 unter
  // „Lernplan einstellen“ (Regler im Kopf)
  const modulInhalt = (unten, P, quelle, neu, karten, inNotiz) => {
    const wahl = terminWahl(P);
    if (wahl) wahlZeichnen(unten.createDiv({ cls: "eba-lp-termin" }), P, wahl);
    if (P.kapitel.length) { const kl = unten.createDiv({ cls: "eba-lp-kapitel" }); P.kapitel.forEach((k, i) => kapitelZeile(kl, P, i, quelle, neu, false)); }
    vorbereitungZeichnen(unten, P, karten, quelle);
    if (inNotiz) return;
    // „Thema → Seite“ wie Verweise sonst (docs/design.md, Grundsatz 2; bis 2.11.2026 nur der Name, kaum als Link zu erkennen)
    const fuss = unten.createDiv({ cls: "eba-lp-fuss" });
    fuss.appendText("Kapitelliste → ");
    linkZu(fuss, P.f.basename, P.f, quelle);
  };

  // Was diese Woche dran ist, über alle Module: offene Kapitel bis Sonntag (auch überfällige), in der Klausurvorbereitung die
  // Altklausuren; mitAbgehakten: dazu die heute hier abgehakten (bleiben bis morgen stehen)
  const dieseWoche = (alle, mitAbgehakten) => {
    const kapitel = [], vorbereitung = [];
    for (const P of alle.filter(aktiv)) {
      if (P.stand.art === "vorbereitung" && P.alt.dieseWoche) vorbereitung.push(P);
      const so = plusTage(montagVon(P.heute), 6);
      const fertig = mitAbgehakten ? P.kapitel.map((k, i) => i).filter((i) => P.kapitel[i].anteil >= 1 - EPS && P.plan.faellig[i] <= so && abgehaktHeute(P, P.kapitel[i])) : [];
      P.stand.woche.concat(fertig).sort((a, b) => a - b).forEach((i) => kapitel.push({ P, i }));
    }
    return { kapitel, vorbereitung };
  };
  // Kurz fürs Dashboard, in Teilen: bis zu drei Kapitel mit Namen („B110 Kapitel 2“, „S100 Kapitel 1 und 2“), mehr als Zahl („8
  // Kapitel, davon 4 überfällig“); dazu die Altklausuren der Klausurvorbereitung („2 Altklausuren S100“)
  const kurzTeile = (W) => {
    const teile = [];
    if (W.kapitel.length > 3) {
      const ueber = W.kapitel.filter((x) => bisText(x.P, x.i).ueberfaellig).length;
      teile.push(`${W.kapitel.length} Kapitel${ueber ? `, davon ${ueber} überfällig` : ""}`);
    } else {
      const je = [];
      for (const x of W.kapitel) {
        const g = je.filter((y) => y.P === x.P)[0];
        if (g) g.idx.push(x.i); else je.push({ P: x.P, idx: [x.i] });
      }
      for (const g of je) teile.push(`${g.P.code} ${namenListe(g.P, g.idx)}`);
    }
    for (const P of W.vorbereitung) teile.push(`${altText(P.alt.dieseWoche)} ${P.code}`);
    return teile;
  };
  // Teile als Stücke, die nicht mitten umbrechen (CSS inline-block); der Punkt hängt am Stück davor, umbrochen wird dahinter.
  // → das letzte Stück (oder null)
  const stuecke = (el, teile, cls) => {
    let s = null;
    teile.forEach((x, j) => {
      s = el.createSpan({ cls: cls + (x.cls ? " " + x.cls : ""), text: x.text });
      if (j < teile.length - 1) { s.createSpan({ cls: "eba-lp-punkt", text: " ·" }); el.appendText(" "); }
    });
    return s;
  };

  // Zeit einer Woche mit Menü (volle, ¾, halbe, ¼, keine Zeit): volle Zeit als leise Uhr, weniger als Wahlpille (docs/design.md:
  // Derselbe Wert in jeder Woche gehört nicht in eine Pille)
  const ZEIT = [[1, "volle Zeit"], [0.75, "¾ Zeit"], [0.5, "halbe Zeit"], [0.25, "¼ Zeit"], [0, "keine Zeit"]];
  const zeitText = (a) => (ZEIT.filter((x) => Math.abs(x[0] - a) < EPS)[0] || [a, `${Math.round(a * 100)} % Zeit`])[1];
  // Das offene Menü der Zeit; beim neuen Zeichnen zu, sonst bliebe es stehen, wo sein Knopf war, während die Seite darunter
  // springt (gesehen am 1.11.2026 auf dem iPad, als eine neue Fassung des Skripts ankam). In ctx.bleibend, damit auch die neue
  // Fassung das Menü der alten schließt.
  const offenesMenue = ctx.bleibend("zeitMenue", () => ({ m: null }));
  const zeitMenueZu = () => { const m = offenesMenue.m; offenesMenue.m = null; if (m) m.hide(); };
  const zeitKnopf = (el, mo, o, neu) => {
    const a = o.faktoren[mo] == null ? 1 : o.faktoren[mo];
    const zeit = el.createEl("button", { cls: "eba-lp-zeit" + (a < 1 ? " is-weniger" : ""), attr: { type: "button", "aria-haspopup": "menu", "aria-label": `Zeit in der Woche ${wocheText(mo)}: ${zeitText(a)}`, title: zeitText(a) } });
    if (a < 1) zeit.createSpan({ text: zeitText(a) });
    else zeit.createSpan({ cls: "eba-lp-zeit-uhr" }).innerHTML = UHR;
    zeit.createSpan({ cls: "eba-lp-zeit-pfeil" }).innerHTML = PFEIL;
    nurStoppen(zeit);
    zeit.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!O.Menu) return;
      const m = new O.Menu();
      for (const x of ZEIT) m.addItem((i) => { i.setTitle(x[1]); if (Math.abs(x[0] - a) < EPS && i.setChecked) i.setChecked(true); i.onClick(async () => { try { await zeitSchreiben(mo, x[0]); } catch (err) { console.error("Lernplan Zeit", err); } neu(); }); });
      const r = zeit.getBoundingClientRect();
      zeitMenueZu();
      offenesMenue.m = m;
      if (m.onHide) m.onHide(() => { if (offenesMenue.m === m) offenesMenue.m = null; });
      m.showAtPosition({ x: r.left, y: r.bottom + 4 });
    });
  };

  // Was beim letzten Zeichnen stand (gerätelokal): Bahnen und Ring gleiten nach einer Änderung (Häkchen, Zielnote) von dort zum
  // neuen Stand
  const vorher = ctx.bleibend("vorher", () => ({ bahnen: null, ring: null }));
  const planGezeigt = ctx.bleibend("planGezeigt", () => ({ ja: false }));
  const nachKlausur = (a, b) => (a.klausur.datum < b.klausur.datum ? -1 : a.klausur.datum > b.klausur.datum ? 1 : 0);
  const pct = (v) => `${(v * 100).toFixed(3)}%`;
  const lage = (div, a, breite) => { div.style.left = pct(a); if (breite != null) div.style.width = pct(Math.max(0, breite)); return div; };
  // Zahl und Einheit mit festem Leerzeichen, so bricht „98 / Tagen“ nicht um
  const tageText = (n) => (n === 0 ? "heute" : n === 1 ? "morgen" : `in ${n}\u00a0Tagen`);
  const balken = (el, anteil) => { const b = el.createSpan({ cls: "eba-lp-balken" }); b.createSpan({ cls: "eba-lp-balken-voll" }).style.width = pct(Math.min(1, anteil)); return b; };
  const wocheName = (B, i) => (i === B.jetzt ? "Diese Woche" : B.jetzt >= 0 && i === B.jetzt + 1 ? "Nächste Woche"
    : B.jetzt >= 0 && i === B.jetzt - 1 ? "Letzte Woche" : wocheText(B.wochen[i].mo));
  // Was in einer Woche fällig ist, kurz für Tooltip und Vorlesesoftware: „B110 Kapitel 2 · S100 Kapitel 1“
  const wocheKurz = (A, mo) => A.map((P) => {
    const idx = P.kapitel.map((k, i) => i).filter((i) => montagVon(P.plan.faellig[i]) === mo);
    return idx.length ? `${P.code} ${namenListe(P, idx)}` : "";
  }).filter(Boolean).join(" · ");

  // Kopf des Bereichs (seit 1.11.2026): ein Ring mit deinem Stand über alle Module (nach ECTS gewichtet), daneben die Lage als Satz
  // (heldText), diese Woche als Balken und die nächste Klausur
  const heldZeichnen = (wurzel, A, heute) => {
    if (!A.length) return;
    const H = heldDaten(A, heute, (P, i) => bisText(P, i).ueberfaellig), T = heldText(H);
    const karte = wurzel.createDiv({ cls: "eba-lp-held" + (H.rueckstand ? " is-hinterher" : H.alleFertig ? " is-fertig" : ""), attr: { role: "group", "aria-label": "Dein Stand" } });
    ringZeichnen(karte, H.ist, H.soll);
    const text = karte.createDiv({ cls: "eba-lp-held-text" });
    text.createDiv({ cls: "eba-lp-held-titel", text: T.titel });
    if (T.satz) text.createDiv({ cls: "eba-lp-held-satz", text: T.satz });
    // Unter dem Satz die nächste Klausur (seit 2.11.2026 ohne „Diese Woche“: Das sagt der Kopf der Woche im Semesterplan, und rechts
    // hinter einer Linie ließen beide eine Lücke von einem Drittel der Karte)
    const zahlen = karte.createDiv({ cls: "eba-lp-held-zahlen" });
    const zahl = (name) => { const z = zahlen.createDiv({ cls: "eba-lp-held-zahl" }); z.createDiv({ cls: "eba-lp-held-zahl-name", text: name }); return z.createDiv({ cls: "eba-lp-held-zahl-wert" }); };
    if (H.klausur) {
      const w = zahl("Nächste Klausur"), P = H.klausur.P;
      w.createSpan({ cls: `eba-lp-farbpunkt modul-${P.farbe || 0}`, attr: { "aria-hidden": "true" } });
      w.createSpan({ text: `${P.code} ${tageText(H.klausur.tage)}` });
      w.createSpan({ cls: "eba-lp-held-zahl-datum", text: wtm(H.klausur.datum) });
    }
  };
  // Ring: verstanden (ab 12 Uhr im Uhrzeigersinn), dahinter bis zum Plan der Rückstand in Warnfarbe, Strich = wo der Plan heute
  // steht; in der Mitte der Anteil. Gleitet vom letzten Stand (vorher.ring) zum neuen.
  const SVG_NS = "http://www.w3.org/2000/svg", RING_R = 42, RING_U = 2 * Math.PI * RING_R;
  let schraffurNr = 0;
  const svgEl = (name, attr, eltern) => {
    const x = document.createElementNS(SVG_NS, name);
    for (const a of Object.keys(attr)) x.setAttribute(a, String(attr[a]));
    if (eltern) eltern.appendChild(x);
    return x;
  };
  const ringZeichnen = (el, ist, soll) => {
    const box = el.createDiv({ cls: "eba-lp-ring", attr: { role: "img", "aria-label": `${Math.round(ist * 100)} % verstanden, laut Plan heute ${Math.round(soll * 100)} %` } });
    const svg = svgEl("svg", { viewBox: "0 0 100 100", "aria-hidden": "true" });
    // Der Rückstand schraffiert wie in den Bahnen und Säulen (seit 2.11.2026; voll in Warnfarbe las er sich bei 0 % wie Fortschritt).
    // Streifen um 45° gedreht; die Gruppe des Rings steht um 90° gedreht, darum −45°
    schraffurNr += 1;
    const id = `eba-lp-schraffur-${schraffurNr}`;
    const muster = svgEl("pattern", { id, patternUnits: "userSpaceOnUse", width: 5.2, height: 5.2, patternTransform: "rotate(-45)" }, svgEl("defs", {}, svg));
    svgEl("rect", { width: 2.6, height: 5.2, class: "eba-lp-ring-streif" }, muster);
    svgEl("rect", { x: 2.6, width: 2.6, height: 5.2, class: "eba-lp-ring-streif is-hell" }, muster);
    const g = svgEl("g", { transform: "rotate(-90 50 50)" }, svg);
    const kreis = (cls) => svgEl("circle", { cx: 50, cy: 50, r: RING_R, class: cls }, g);
    kreis("eba-lp-ring-spur");
    const rueck = kreis("eba-lp-ring-rueck"), voll = kreis("eba-lp-ring-voll");
    rueck.style.stroke = `url(#${id})`;
    // Strich „Plan heute“ so breit wie der Ring (bis 2.11.2026 ragte er 4 Einheiten je Seite heraus)
    const strich = svgEl("line", { x1: 50 + RING_R - 5, x2: 50 + RING_R + 5, y1: 50, y2: 50, class: "eba-lp-ring-soll" }, g);
    box.appendChild(svg);
    const mitte = box.createDiv({ cls: "eba-lp-ring-mitte", attr: { "aria-hidden": "true" } });
    mitte.createDiv({ cls: "eba-lp-ring-zahl", text: `${Math.round(ist * 100)} %` });
    mitte.createDiv({ cls: "eba-lp-ring-name", text: "verstanden" });
    const setzen = (i, s) => {
      voll.style.strokeDasharray = `${i * RING_U} ${RING_U}`;
      voll.style.opacity = i > 0.002 ? "1" : "0";
      rueck.style.strokeDasharray = `${Math.max(0, s - i) * RING_U} ${RING_U}`;
      rueck.style.strokeDashoffset = String(-i * RING_U);
      strich.style.transform = `rotate(${s * 360}deg)`;
    };
    const alt = vorher.ring;
    setzen(alt ? alt.ist : ist, alt ? alt.soll : soll);
    if (alt && (Math.abs(alt.ist - ist) > EPS || Math.abs(alt.soll - soll) > EPS)) void box.getBoundingClientRect();
    setzen(ist, soll);
    vorher.ring = { ist, soll };
  };

  // Semesterplan (seit 1.11.2026; vorher „Diese Woche“ als Liste und „Wochen“ als Zeilen): eine Karte mit dem Bild aus planBild,
  // oben die Zielnote (zielZeichnen). Je Woche eine Säule, gestapelt je Modul in seiner Farbe (verstanden voll, offen getönt,
  // überfällig in Warnfarbe), je Modul eine Bahn in seiner Farbe (dicker Balken = Kapitel verstehen, gefüllt bis zu deinem Stand,
  // dahinter bis heute überfällig; Strich = alles verstanden; dünne Linie = Klausurvorbereitung; Raute = Klausur; Ring =
  // Zwischentest), dahinter Pausen, diese Woche, die gewählte Woche und die Linie „heute“; Achse mit Monaten, Legende in derselben
  // Form wie die Marken. Darunter die gewählte Woche (gerätelokal bis morgen; sonst diese). Eine Woche wählt ein Tipp auf ihre
  // Säule, ‹ › oder die Pfeiltasten; ein Tipp auf eine Bahn klappt das Modul unter „Module“ auf. Beim ersten Zeichnen je Start
  // wachsen Säulen und Bahnen einmal, danach gleiten die Bahnen vom letzten Stand zum neuen.
  // Last einer Woche als Säule, gestapelt je Modul in seiner Farbe (verstanden, überfällig, offen); Höhe im Verhältnis zur
  // vollsten Woche
  const stapelZeichnen = (el, w, max) => {
    const summe = w.fertig + w.offen + w.ueber;
    if (summe <= EPS) return;
    const stapel = el.createDiv({ cls: "eba-lp-s-stapel" });
    stapel.style.height = pct(summe / max);
    w.module.forEach((m) => {
      const s = m.fertig + m.offen + m.ueber;
      if (s <= EPS) return;
      const gruppe = stapel.createDiv({ cls: `eba-lp-s-modul modul-${m.farbe}` });
      gruppe.style.flexGrow = String(s);
      for (const [wert, cls] of [[m.fertig, "is-fertig"], [m.ueber, "is-ueber"], [m.offen, "is-offen"]]) {
        if (wert > EPS) gruppe.createDiv({ cls: "eba-lp-s-teil " + cls }).style.flexGrow = String(wert);
      }
    });
  };
  // Welche Wochen die Wochenleiste zeigt: höchstens sieben, die gewählte möglichst in der Mitte → [Index der ersten, Index nach der
  // letzten]
  const leisteFenster = (anzahl, i, breite = 7) => {
    const n = Math.min(breite, anzahl), von = Math.max(0, Math.min(anzahl - n, i - Math.floor(n / 2)));
    return [von, von + n];
  };
  // Wochenleiste (seit 1.11.2026, schmal statt der Säulen; welche gilt, entscheidet CSS): sieben Wochen um die gewählte als Knöpfe
  // mit dem Montag und der Säule der Woche, diese Woche im Akzent, vorlesungsfreie getönt, eine mit Klausur mit roter Raute. Ein
  // Tipp (oder ← →) wählt die Woche, das Fenster wandert mit. Auf dem iPhone waren die Säulen 8 px breit (lasen sich wie ein
  // Strichcode) und kaum zu treffen. Bewusst keine Leiste zum Wischen: Waagerechtes Wischen ist in Obsidian von überall auf der
  // Fläche eine Geste (Seitenleisten, in Studium Autopilot zurück; seitenleiste.js seitenGeste).
  const leisteZeichnen = (el, A, B, D, i, knoepfe, waehlen) => {
    el.empty();
    const [von, bis] = leisteFenster(B.wochen.length, i);
    for (let j = von; j < bis; j++) {
      const w = B.wochen[j], so = plusTage(w.mo, 6);
      const frei = !arbeitstage(w.mo, D.pausen, D.freieTage), klausur = A.some((P) => P.klausur.datum >= w.mo && P.klausur.datum <= so);
      const b = el.createEl("button", { cls: "eba-lp-wl-w" + (j === B.jetzt ? " is-jetzt" : "") + (frei ? " is-frei" : "") + (j === i ? " is-wahl" : ""),
        attr: { type: "button", "aria-pressed": String(j === i), "aria-label": knoepfe[j].getAttr("aria-label") } });
      b.createSpan({ cls: "eba-lp-wl-datum", text: tm(w.mo) });
      stapelZeichnen(b.createDiv({ cls: "eba-lp-wl-saeule" }), w, B.max);
      if (klausur) b.createSpan({ cls: "eba-lp-wl-klausur" });
      nurStoppen(b);
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); waehlen(j, "leiste"); });
      b.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault(); waehlen(j + (e.key === "ArrowRight" ? 1 : -1), "leiste");
      });
    }
  };
  const planZeichnen = (wurzel, A, alle, o, D, heute, quelle, neu) => {
    const B = planBild(A, heute, D.pausen);
    if (!B) return;
    const karte = wurzel.createDiv({ cls: "eba-lp-plan", attr: { role: "group", "aria-label": "Semesterplan" } });
    if (!planGezeigt.ja) { karte.addClass("is-anim"); planGezeigt.ja = true; }
    const kopf = karte.createDiv({ cls: "eba-lp-plan-kopf" });
    const titel = kopf.createDiv({ cls: "eba-lp-plan-titelzeile" });
    titel.createSpan({ cls: "eba-lp-plan-titel", text: "Semesterplan" });
    // Schmal (iPhone) steht die Legende hinter ⓘ (seit 1.11.2026, eine Bildschirmhöhe weniger); breit ist der Knopf unsichtbar
    const info = titel.createEl("button", { cls: "eba-lp-info", attr: { type: "button", "aria-expanded": "false", "aria-label": "Was die Zeichen bedeuten" } });
    info.innerHTML = INFO;
    nurStoppen(info);
    info.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const an = !karte.hasClass("zeigt-legende");
      karte.toggleClass("zeigt-legende", an); info.setAttr("aria-expanded", String(an));
      // Offen gleich unter dem Kopf, bei ⓘ (seit 2.11.2026; unter dem Bild ging sie am unteren Rand des iPhones auf, und scheinbar
      // geschah nichts). Nur schmal sichtbar, breit steht sie wie immer unter dem Bild
      const leg = karte.querySelector(".eba-lp-plan-legende"), satz = karte.querySelector(".eba-lp-ziel-satz");
      if (an && leg && satz) satz.after(leg);
    });
    const ziel = kopf.createDiv({ cls: "eba-lp-ziel" });
    const satz = karte.createDiv({ cls: "eba-lp-ziel-satz", attr: { "aria-live": "polite" } });

    const flaeche = karte.createDiv({ cls: "eba-lp-plan-flaeche" });
    const baender = flaeche.createDiv({ cls: "eba-lp-plan-baender", attr: { "aria-hidden": "true" } });
    const breite = 7 / B.tage;
    for (const p of B.pausen) lage(baender.createDiv({ cls: "eba-lp-plan-pause" }), p.a, p.b - p.a);
    if (B.jetzt >= 0) lage(baender.createDiv({ cls: "eba-lp-plan-jetzt" }), B.jetzt * breite, breite);
    const wahlBand = baender.createDiv({ cls: "eba-lp-plan-wahl" });
    // Schmal: die sieben Wochen der Leiste als Band in den Bahnen, so sieht man, welcher Teil des Semesters die Leiste ist
    const fensterBand = baender.createDiv({ cls: "eba-lp-plan-fenster" });
    if (B.heute != null) lage(baender.createDiv({ cls: "eba-lp-plan-heute" }), B.heute);
    // „heute“ oben an seiner Linie (seit 2.11.2026; in der Achse verdrängte die Pille den Monat daneben, auf dem iPhone zwei)
    if (B.heute != null) {
      lage(baender.createSpan({ cls: "eba-lp-plan-heute-pille" + (B.heute < 0.05 ? " is-links" : B.heute > 0.95 ? " is-rechts" : ""), text: "heute" }), B.heute);
    }

    const saeulen = flaeche.createDiv({ cls: "eba-lp-saeulen", attr: { role: "group", "aria-label": "Wochen" } });
    const knoepfe = B.wochen.map((w, i) => {
      const kurz = wocheKurz(A, w.mo), name = wocheName(B, i);
      const titel = `${name}${name === wocheText(w.mo) ? "" : ` (${wocheText(w.mo)})`}: ${kurz || "nichts fällig"}`;
      const b = saeulen.createEl("button", { cls: "eba-lp-s", attr: { type: "button", "aria-pressed": "false", "aria-label": titel, title: titel } });
      stapelZeichnen(b, w, B.max);
      return b;
    });

    // Teile einer Bahn von a bis b (b null: eine Marke), erst an ihrer Stelle vom letzten Mal (alt), dann an der neuen
    const bahnen = flaeche.createDiv({ cls: "eba-lp-bahnen" });
    const wege = [], geister = [];
    const teil = (z, cls, a, b, altA, altB) => { const d = z.createDiv({ cls }); wege.push({ d, a, b, altA, altB }); return d; };
    for (const x of B.bahnen) {
      const P = x.P, stand = verbinden(standTeile(P).map((t) => t.text)), v = (vorher.bahnen && vorher.bahnen[P.code]) || x;
      const z = bahnen.createDiv({ cls: `eba-lp-bahn modul-${P.farbe || 0}`, attr: { role: "button", tabindex: "0", "aria-label": `${P.code}: ${stand}`, title: `${titelVon(P)}: ${stand}` } });
      z.createSpan({ cls: "eba-lp-bahn-code", text: P.code });
      teil(z, "eba-lp-bahn-lernen", x.beginn, x.ziel, v.beginn, v.ziel);
      teil(z, "eba-lp-bahn-ist", x.beginn, Math.max(x.beginn, x.stand), v.beginn, Math.max(v.beginn, v.stand));
      teil(z, "eba-lp-bahn-ueber", x.stand, x.ueber == null ? x.stand : x.ueber, v.stand, v.ueber == null ? v.stand : v.ueber);
      teil(z, "eba-lp-bahn-vorb", x.ziel, Math.max(x.ziel, x.klausur), v.ziel, Math.max(v.ziel, v.klausur));
      const geist = lage(z.createDiv({ cls: "eba-lp-bahn-geist is-zu" }), x.beginn, x.ziel - x.beginn);
      geister.push({ P, x, geist });
      teil(z, "eba-lp-bahn-ziel", x.ziel, null, v.ziel, null);
      for (const t of x.tests) lage(z.createDiv({ cls: "eba-lp-bahn-test" }), t);
      teil(z, "eba-lp-bahn-klausur", x.klausur, null, v.klausur, null);
      const zeigen = (e) => { e.preventDefault(); e.stopPropagation(); modulZeigen(wurzel, P.code); };
      nurStoppen(z);
      z.addEventListener("click", zeigen);
      z.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") zeigen(e); });
    }
    // Erst die alte Lage, ein Stil-Durchlauf, dann die neue: Die Übergänge in CSS spielen den Weg
    const setzen = (w, a, b) => lage(w.d, a, b == null ? null : b - a);
    for (const w of wege) setzen(w, w.altA, w.altB);
    if (wege.some((w) => Math.abs(w.a - w.altA) > EPS || (w.b != null && Math.abs(w.b - w.altB) > EPS))) void karte.getBoundingClientRect();
    for (const w of wege) setzen(w, w.a, w.b);
    vorher.bahnen = {};
    for (const x of B.bahnen) vorher.bahnen[x.P.code] = { beginn: x.beginn, stand: x.stand, ueber: x.ueber, ziel: x.ziel, klausur: x.klausur };
    zielZeichnen(ziel, satz, A, B, D, o, karte, geister);

    // Achse mit den Monaten (in px; noch ohne Breite in Anteilen der Achse)
    const achse = karte.createDiv({ cls: "eba-lp-plan-achse", attr: { "aria-hidden": "true" } });
    const px = achse.getBoundingClientRect().width;
    // Ein Monat ganz rechts steht links vom Strich, sonst ragte er aus der Karte („Apr“ auf dem iPhone); stieße er dort an den Monat
    // davor („MärApr“), fällt er weg
    const rand = (m) => (px ? (1 - m.x) * px < 36 : m.x > 0.95);
    let zuletzt = null;
    for (const m of B.monate) {
      const r = rand(m);
      if (r && zuletzt && (px ? (m.x - zuletzt.x) * px < 70 : m.x - zuletzt.x < 0.06)) continue;
      lage(achse.createSpan(r ? { cls: "is-rechts", text: m.text } : { text: m.text }), m.x);
      zuletzt = m;
    }

    const leg = karte.createDiv({ cls: "eba-lp-plan-legende" });
    const eintrag = (cls, text) => { const s = leg.createSpan({ cls: "eba-lp-leg" }); s.createSpan({ cls: "eba-lp-leg-zeichen " + cls }); s.appendText(text); };
    eintrag("is-fertig", "verstanden");
    eintrag("is-offen", "offen");
    if (B.bahnen.some((x) => x.ueber != null) || B.wochen.some((w) => w.ueber > EPS)) eintrag("is-ueber", "überfällig");
    eintrag("is-ziel", "alles verstanden");
    eintrag("is-vorb", "Klausurvorbereitung");
    eintrag("is-klausur", "Klausur");
    if (B.bahnen.some((x) => x.tests.length)) eintrag("is-test", "Zwischentest");
    const pausen = B.pausen.map((p) => p.name).filter((p, j, l) => p && l.indexOf(p) === j);
    if (B.pausen.length) eintrag("is-pause", pausen.join(", ") || "Pause");
    eintrag("is-fenster", "Wochen unten");

    const leiste = karte.createDiv({ cls: "eba-lp-wl", attr: { role: "group", "aria-label": "Wochen" } });
    // Die gewählte Woche unter der Karte in einem eigenen Raster (seit 2.11.2026): breit stehen rechts daneben die Module, sonst
    // schließt sie bündig an die Karte an wie vorher in ihr (eba-core.css Abschnitt 61)
    const woche = wurzel.createDiv({ cls: "eba-lp-raster" }).createDiv({ cls: "eba-lp-plan-woche", attr: { role: "group", "aria-label": "Woche" } });
    const waehlen = (i, fokus) => {
      i = Math.max(0, Math.min(B.wochen.length - 1, i));
      auf[":woche"] = { mo: B.wochen[i].mo, tag: heute };
      knoepfe.forEach((k, j) => { k.toggleClass("is-wahl", j === i); k.setAttr("aria-pressed", String(j === i)); });
      leisteZeichnen(leiste, A, B, D, i, knoepfe, waehlen);
      lage(wahlBand, i * breite, breite);
      const [von, bis] = leisteFenster(B.wochen.length, i);
      lage(fensterBand, von * breite, (bis - von) * breite);
      wocheZeichnen(woche, alle, A, B, i, o, D, quelle, neu, waehlen);
      // Die Leiste ist neu gezeichnet: der Fokus geht auf ihre gewählte Woche, nicht verloren
      const ziel = fokus === "leiste" ? leiste.querySelector(".is-wahl") : fokus ? knoepfe[i] : null;
      if (ziel) ziel.focus();
    };
    knoepfe.forEach((k, i) => {
      nurStoppen(k);
      k.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); waehlen(i); });
      k.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault(); waehlen(i + (e.key === "ArrowRight" ? 1 : -1), true);
      });
    });
    const gemerkt = auf[":woche"] && auf[":woche"].tag === heute ? B.wochen.findIndex((w) => w.mo === auf[":woche"].mo) : -1;
    waehlen(gemerkt >= 0 ? gemerkt : B.jetzt >= 0 ? B.jetzt : 0);
  };

  // Wann alles verstanden sein soll, im Kopf des Semesterplans (seit 1.11.2026; zuerst als Zielnote mit zehn Noten): ein Satz mit
  // drei Knöpfen, „Alles verstanden nach [60 %] [70 %] [80 %] der Zeit“, darunter, was das heißt (zielTeile; kommt der Anteil noch
  // aus der Zielnote, steht sie davor). Zeigen oder Fokus auf einen anderen Anteil zeigt, was er hieße: der Satz und gestrichelt die
  // Bahnen, die sich ändern würden. Ein Tipp schreibt lernplan_anteil in System/Einstellungen.md (anteilSchreiben); der Bereich
  // zeichnet sich danach neu, die Bahnen gleiten.
  const anteilSchreiben = async (a) => {
    const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
    if (f) await app.fileManager.processFrontMatter(f, (fm) => { fm[FELD_ANTEIL] = Math.round(a * 100); });
  };
  const zielZeichnen = (el, satz, A, B, D, o, karte, geister) => {
    const jetzt = (a) => Math.abs(a - o.anteil) < EPS;
    el.createSpan({ cls: "eba-lp-ziel-label", text: "Alles verstanden nach" });
    const skala = el.createDiv({ cls: "eba-lp-ziel-skala", attr: { role: "group", "aria-label": "Alles verstanden nach … der Zeit" } });
    el.createSpan({ cls: "eba-lp-ziel-label", text: "der Zeit" });
    const knoepfe = ANTEILE.map((a) => {
      const b = skala.createEl("button", { cls: "eba-lp-note" + (jetzt(a) ? " is-an" : ""), text: `${Math.round(a * 100)} %`,
        attr: { type: "button", "aria-pressed": String(jetzt(a)), "aria-label": `Alles verstanden nach ${Math.round(a * 100)} % der Zeit` } });
      return { b, a };
    });
    const satzZeigen = (a) => {
      satz.empty();
      const andere = a != null && !jetzt(a);
      if (andere) { satz.appendText("Mit "); satz.createEl("b", { text: `${Math.round(a * 100)} %` }); satz.appendText(": "); }
      else if (o.anteilQuelle === "zielnote") satz.appendText(`Nach deiner Zielnote ${String(D.zielnote).trim()}: `);
      const T = zielTeile(zielVorschau(A, andere ? a : o.anteil));
      T.forEach((t, i) => {
        const text = i === 0 && !andere && o.anteilQuelle !== "zielnote" ? t.text.charAt(0).toUpperCase() + t.text.slice(1) : t.text;
        if (t.wert) satz.createEl("b", { text }); else satz.appendText(text);
      });
    };
    // Gestrichelt, wie lange das Verstehen bei diesem Anteil dauerte; ohne Unterschied (oder mit eigenem Ziel) unsichtbar
    const geisterZeigen = (a) => {
      const an = a != null && !jetzt(a);
      karte.toggleClass("is-vorschau", an);
      for (const g of geister) {
        const z = an && !g.P.eigenesZiel ? zielBei(g.P, a) : "";
        const bis = z ? Math.min(1, Math.max(0, (tageZwischen(B.von, z) + 1) / B.tage)) : g.x.ziel;
        g.geist.toggleClass("is-zu", !z);
        lage(g.geist, g.x.beginn, bis - g.x.beginn);
      }
    };
    let fokus = null;
    const zeigen = (a) => { satzZeigen(a); geisterZeigen(a); };
    knoepfe.forEach((k, j) => {
      nurStoppen(k.b);
      k.b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") zeigen(k.a); });
      k.b.addEventListener("focus", () => { fokus = k; zeigen(k.a); });
      k.b.addEventListener("blur", () => { fokus = null; zeigen(null); });
      k.b.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        knoepfe[Math.max(0, Math.min(knoepfe.length - 1, j + (e.key === "ArrowRight" ? 1 : -1)))].b.focus();
      });
      k.b.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (jetzt(k.a) && o.anteilQuelle === "wahl") return;
        knoepfe.forEach((x) => { x.b.toggleClass("is-an", x === k); x.b.setAttr("aria-pressed", String(x === k)); });
        zeigen(k.a);
        try { await anteilSchreiben(k.a); } catch (err) { console.error("Lernplan Anteil", err); }
      });
    });
    skala.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") zeigen(fokus ? fokus.a : null); });
    zeigen(null);
  };

  // Die gewählte Woche unter dem Bild: ‹ Name ›, rechts wie viel ihrer Kapitel verstanden sind (diese und frühere Wochen; geschafft:
  // ein Haken) und ihre Zeit, dann Klausurvorbereitung, Pausen und Klausuren als Stücke, ihre Kapitel als Zeilen zum Abhaken (diese
  // Woche wie bisher „Diese Woche“: auch Überfälliges und heute Abgehaktes, in der Klausurvorbereitung die Altklausuren)
  const wocheZeichnen = (el, alle, A, B, i, o, D, quelle, neu, waehlen) => {
    el.empty();
    const w = B.wochen[i], mo = w.mo, so = plusTage(mo, 6), jetzt = i === B.jetzt;
    const kopf = el.createDiv({ cls: "eba-lp-pw-kopf" });
    const nav = (svg, label, an, j) => {
      const b = kopf.createEl("button", { cls: "eba-lp-pw-nav", attr: { type: "button", "aria-label": label } });
      b.innerHTML = svg;
      if (!an) b.setAttr("disabled", "");
      nurStoppen(b);
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); waehlen(j, false); });
    };
    nav(LINKS, "Woche davor", i > 0, i - 1);
    const t = kopf.createDiv({ cls: "eba-lp-pw-titel" });
    const name = wocheName(B, i);
    t.createSpan({ cls: "eba-lp-pw-name" + (jetzt ? " is-jetzt" : ""), text: name });
    if (name !== wocheText(mo)) t.createSpan({ cls: "eba-lp-pw-datum", text: wocheText(mo) });
    nav(RECHTS, "Woche danach", i < B.wochen.length - 1, i + 1);
    const W = jetzt ? dieseWoche(alle, true) : null;
    // Noch nicht hochgeladene Kapitel stehen in dieser Woche nicht als Zeile zum Abhaken, sondern leise in einer Zeile darunter
    // (seit 3.11.2026: Vier von zwölf Zeilen ließen sich nicht erledigen)
    const nichtDa = (x) => !x.P.kapitel[x.i].da && x.P.kapitel[x.i].anteil < 1 - EPS;
    const kommt = W ? W.kapitel.filter(nichtDa) : [];
    if (W) W.kapitel = W.kapitel.filter((x) => !nichtDa(x));
    const faellig = [];
    for (const P of A) P.kapitel.forEach((k, j) => { if (montagVon(P.plan.faellig[j]) === mo) faellig.push(k); });
    const fertig = faellig.filter((k) => k.anteil >= 1 - EPS).length;
    const altOffen = W ? W.kapitel.filter((x) => x.P.kapitel[x.i].anteil < 1 - EPS && montagVon(x.P.plan.faellig[x.i]) < mo).length : 0;
    const rechts = kopf.createDiv({ cls: "eba-lp-pw-rechts" });
    if (faellig.length) {
      const stand = rechts.createSpan({ cls: "eba-lp-pw-stand" });
      if (B.jetzt >= 0 && i > B.jetzt) stand.setText(`${faellig.length} Kapitel`);
      else if (fertig === faellig.length && !altOffen) { stand.addClass("is-geschafft"); stand.createSpan({ cls: "eba-lp-pw-haken" }).innerHTML = HAKEN; stand.appendText("geschafft"); }
      // „0 von 3“ statt „0/3“ (seit 2.11.2026): „0/13“ hinter einem Titel zählt seine Unterkapitel, das war leicht zu verwechseln
      else { balken(stand, fertig / faellig.length); stand.appendText(`${fertig} von ${faellig.length}`); stand.setAttr("aria-label", `${fertig} von ${faellig.length} Kapiteln verstanden`); }
    }
    if (B.jetzt < 0 || i >= B.jetzt) zeitKnopf(rechts, mo, o, neu);
    // Was die Woche sonst prägt: Klausurvorbereitung, Pausen, Klausuren (nach Datum); „viel zu tun“ neben dem Namen, wenn sie mehr
    // als anderthalbmal so viel trägt wie der Schnitt der Wochen mit Last (seit 2.11.2026; vorher eine Warnpille allein in einer Zeile)
    const teile = [];
    const vorb = A.filter((P) => P.ziel < mo && P.klausur.datum > so).map((P) => P.code);
    if (vorb.length) teile.push({ text: `Klausurvorbereitung ${vorb.join(", ")}` });
    for (const p of (D.pausen || []).filter((x) => x.von <= so && x.bis >= mo)) teile.push({ text: p.name, cls: "is-pause" });
    for (const P of A) if (P.klausur.datum >= mo && P.klausur.datum <= so) teile.push({ text: `Klausur ${P.code} ${wtm(P.klausur.datum)}`, cls: "is-klausur" });
    const lasten = B.wochen.map((x) => x.fertig + x.offen + x.ueber).filter((x) => x > EPS);
    const schnitt = lasten.length ? lasten.reduce((s, x) => s + x, 0) / lasten.length : 0;
    const viel = schnitt && w.fertig + w.offen + w.ueber > 1.5 * schnitt;
    // Breit rechts vor dem Stand (zwischen Namen und › ließ die Pille den Pfeil je nach Woche springen); schmal unter dem Namen,
    // rechts drückte sie „Diese Woche“ in zwei Zeilen. Welche gilt, entscheidet CSS
    if (viel) {
      rechts.prepend(rechts.createSpan({ cls: "eba-pill eba-lp-pw-viel is-breit", text: "viel zu tun" }));
      t.createSpan({ cls: "eba-pill eba-lp-pw-viel is-schmal", text: "viel zu tun" });
    }
    if (teile.length) stuecke(el.createDiv({ cls: "eba-lp-pw-was" }), teile, "eba-lp-w-teil");
    const kl = el.createDiv({ cls: "eba-lp-woche" }).createDiv({ cls: "eba-lp-kapitel" });
    let zeilen = 0;
    if (W) {
      // Erst die Kapitel dieser Woche (die zählt der Kopf), dann „Von früher“: Stand oben „0/2“ über acht Zeilen, passte das nicht
      const frueher = (x) => montagVon(x.P.plan.faellig[x.i]) < mo;
      for (const x of W.kapitel.filter((y) => !frueher(y))) { kapitelZeile(kl, x.P, x.i, quelle, neu, true); zeilen++; }
      const alt = W.kapitel.filter(frueher);
      if (alt.length) {
        // Schmal (iPhone) zu, bis man es aufklappt (seit 1.11.2026, gerätelokal bis zum Neustart); breit immer offen, dann nur Label
        const zu = auf[":frueher"] !== true, ueber = alt.filter((x) => bisText(x.P, x.i).ueberfaellig).length;
        const t = kl.createEl("button", { cls: "eba-lp-k-trenner" + (zu ? " is-zu" : ""), attr: { type: "button", "aria-expanded": String(!zu) } });
        t.createSpan({ cls: "eba-lp-k-trenner-name", text: "Von früher" });
        // „6 Kapitel · 4 überfällig“: nur der überfällige Teil in Warnfarbe (bis 2.11.2026 die ganze Zahl, obwohl nicht alle es waren)
        const zahl = t.createSpan({ cls: "eba-lp-k-trenner-zahl", text: alt.length === 1 ? "1 Kapitel" : `${alt.length} Kapitel` });
        if (ueber) { zahl.appendText(" · "); zahl.createSpan({ cls: "is-ueberfaellig", text: `${ueber} überfällig` }); }
        t.createSpan({ cls: "eba-lp-k-trenner-pfeil", attr: { "aria-hidden": "true" } });
        const gruppe = kl.createDiv({ cls: "eba-lp-frueher" + (zu ? " is-zu" : "") });
        for (const x of alt) { kapitelZeile(gruppe, x.P, x.i, quelle, neu, true); zeilen++; }
        nurStoppen(t);
        t.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          auf[":frueher"] = t.hasClass("is-zu"); // war zu: jetzt auf
          t.toggleClass("is-zu", !auf[":frueher"]); gruppe.toggleClass("is-zu", !auf[":frueher"]); t.setAttr("aria-expanded", String(auf[":frueher"]));
        });
      }
      for (const P of W.vorbereitung) { vorbereitungZeile(kl, P, quelle); zeilen++; }
      if (kommt.length) {
        const je = [];
        for (const x of kommt) { const g = je.filter((y) => y.P === x.P)[0]; if (g) g.idx.push(x.i); else je.push({ P: x.P, idx: [x.i] }); }
        kl.createDiv({ cls: "eba-lp-k-kommt", text: `Noch nicht hochgeladen: ${je.map((g) => `${g.P.code} ${namenListe(g.P, g.idx)}`).join(" · ")}` });
      }
    } else {
      for (const P of A) P.kapitel.forEach((k, j) => { if (montagVon(P.plan.faellig[j]) === mo) { kapitelZeile(kl, P, j, quelle, neu, true); zeilen++; } });
    }
    if (!zeilen && !kommt.length) kl.createDiv({ cls: "eba-lp-k eba-lp-k-leer", text: faellig.length ? "Alles für diese Woche verstanden." : arbeitstage(mo, D.pausen, D.freieTage) ? "Nichts fällig." : "Vorlesungsfrei, nichts fällig." });
    haftenPruefen(el);
  };
  // Zwei Spalten (iPad quer): Die Woche bleibt beim Scrollen oben stehen, solange rechts ein langes Modul offen ist, aber nur, wenn
  // sie ganz ins Fenster passt (is-passt; sonst wäre ihr Ende erst am Schluss der Seite zu sehen). Seit 2.11.2026: links blieb sonst
  // eine Fläche von 725 × 860 px leer
  const haftenPruefen = (w) => {
    const fenster = w.ownerDocument && w.ownerDocument.defaultView;
    if (!fenster) return;
    fenster.requestAnimationFrame(() => {
      const s = w.closest(".markdown-preview-view");
      w.toggleClass("is-passt", !!s && w.offsetHeight + 80 <= s.clientHeight);
    });
  };
  // In der Klausurvorbereitung diese Woche: „2 Altklausuren auf Zeit, zuerst …“ (ohne Kästchen, der Platz bleibt)
  const vorbereitungZeile = (kl, P, quelle) => {
    const z = kl.createDiv({ cls: `eba-lp-k eba-lp-k-vorb modul-${P.farbe || 0}` });
    z.createSpan({ cls: "eba-td-haken", attr: { "aria-hidden": "true" } }).createEl("input", { attr: { type: "checkbox", tabindex: "-1", disabled: "" } });
    const t = z.createDiv({ cls: "eba-lp-k-text" });
    t.createSpan({ cls: "eba-lp-k-code", text: P.code });
    t.createSpan({ cls: "eba-lp-k-nr" });
    const inhalt = t.createDiv({ cls: "eba-lp-k-inhalt" });
    const titel = inhalt.createSpan({ cls: "eba-lp-k-titel", text: `${altText(P.alt.dieseWoche)} auf Zeit` });
    if (P.alt.naechste) { titel.appendText(", zuerst "); linkZu(titel, P.alt.naechste.titel, P.alt.naechste.f, quelle); }
    unterTitel(inhalt, P.code, `Klausur ${wtm(P.klausur.datum)}`, false);
  };

  // Module als Zeilen in einem Rahmen (seit 2.11.2026; vom 1.11. an Karten im Raster: fünf gleiche Kästen mit großen Namen waren
  // lauter als die Woche, docs/design.md Grundsatz 4 „Zeilen für Gleichartiges“). Links das Kürzel mit Farbpunkt, daneben der Name
  // und die Pille bei einem Zustand, darunter ein kleiner Balken in der Farbe des Moduls (mit dem Strich, wo der Plan heute steht)
  // und der Stand kurz; rechts der gewählte Termin (breit) und der Pfeil. Ein Tipp klappt darunter das Modul auf (modulInhalt;
  // gerätelokal gemerkt, immer nur eins).
  const modulAnteil = (P) => {
    if (P.plan) return P.plan.gesamt ? P.plan.ist / P.plan.gesamt : 0;
    const g = P.kapitel.reduce((s, k) => s + (k.gewicht || 0), 0);
    return g ? P.kapitel.reduce((s, k) => s + (k.gewicht || 0) * k.anteil, 0) / g : 0;
  };
  // Rechts in der Zeile, was du für die Klausur gewählt hast, einmal mit den Tagen bis dahin (seit 2.11.2026 abends; vorher stand
  // „Klausur in 98 Tagen“ links im Stand und der Tag rechts): „Haupttermin Mo 8.2. · in 98 Tagen“, „Nachholtermin ab 30.3. · …“,
  // „verschoben“
  const terminKurz = (P, wahl, heute) => {
    const t = wahl === "haupt" ? `Haupttermin ${terminText(P.termine && P.termine.haupt)}`
      : wahl === "nachhol" ? `Nachholtermin ${terminText(P.termine && P.termine.nachhol)}` : wahl === "spaeter" ? "verschoben" : "";
    return t && wahl !== "spaeter" && heute && aktiv(P) ? `${t} · ${tageText(tageZwischen(heute, P.klausur.datum))}` : t;
  };
  // Kopf eines Moduls: Kürzel, Name mit Pille, Balken und Stand, rechts der Termin. In der Lernplan-Notiz (inNotiz, seit 2.11.2026;
  // vorher eine eigene Zeile mit „·“-Kette über einer zweiten Karte) fest offen, ohne Pfeil und ohne Kürzel (der Titel der Notiz
  // nennt es), der Name ein Link zur Modulseite → die Zeile
  const modulKopf = (liste, P, quelle, heute, inNotiz) => {
    const an = aktiv(P), offen = inNotiz || !!auf[P.code], wahl = terminWahl(P);
    const z = liste.createDiv({ cls: `eba-lp-mz modul-${P.farbe || 0}` + (an ? "" : " is-ruhig") + (offen ? " is-offen" : "") + (inNotiz ? " is-fest" : ""),
      attr: inNotiz ? { "data-code": P.code } : { role: "button", tabindex: "0", "aria-expanded": String(offen), "data-code": P.code } });
    if (!inNotiz) z.createSpan({ cls: "eba-lp-mk-code eba-lp-mz-code", text: P.code });
    const titel = z.createDiv({ cls: "eba-lp-mz-titel" });
    const name = titel.createSpan({ cls: "eba-lp-mz-name" });
    if (inNotiz && P.modul && P.modul.f) linkZu(name, P.modul.titel, P.modul.f, quelle);
    else name.setText(P.modul ? P.modul.titel : P.f.basename);
    // „nicht mehr dran“ sagt bei einem Modul, das du verschoben hast, schon „verschoben“ rechts
    const p = P.stand && P.stand.pille;
    if (p && wahl !== "spaeter") titel.createSpan({ cls: "eba-pill " + p.art, text: p.text });
    const meta = z.createDiv({ cls: "eba-lp-mz-meta" });
    const bal = meta.createSpan({ cls: "eba-lp-mk-balken", attr: { "aria-hidden": "true" } });
    bal.createSpan({ cls: "eba-lp-mk-voll" }).style.width = pct(Math.min(1, modulAnteil(P)));
    if (an) lage(bal.createSpan({ cls: "eba-lp-mk-soll" }), Math.min(1, sollHeute(P, heute) / (P.plan.gesamt || 1)));
    const fertig = P.kapitel.filter((x) => x.anteil >= 1 - EPS).length;
    const stand = (an ? [`${fertig} von ${P.kapitel.length}\u00a0Kapiteln`] : standRoh(P).map((x) => x.text)).map((text) => ({ text }));
    // Schmal steht der Zustand in seiner Farbe hinter dem Stand statt als Pille neben dem Namen (seit 2.11.2026; eine Zeile weniger),
    // breit bleibt die Pille (eba-core.css Abschnitt 61, Module)
    if (an && p && wahl !== "spaeter") stand.push({ text: p.text, cls: "eba-lp-mz-zustand is-" + p.art });
    stuecke(meta.createSpan({ cls: "eba-lp-mz-stand" }), stand, "eba-lp-w-teil");
    const wert = terminKurz(P, wahl, heute);
    if (wert) z.createSpan({ cls: "eba-lp-mz-wert", text: wert });
    if (!inNotiz) z.createSpan({ cls: "eba-lp-mk-pfeil", attr: { "aria-hidden": "true" } });
    return z;
  };
  const modulZeileZeichnen = (liste, P, quelle, neu, karten, heute) => {
    const z = modulKopf(liste, P, quelle, heute, false), offen = !!auf[P.code];
    const mehr = liste.createDiv({ cls: `eba-lp-unten eba-lp-mz-mehr modul-${P.farbe || 0}` + (offen ? "" : " is-zu"), attr: { "data-code": P.code } });
    modulInhalt(mehr, P, quelle, neu, karten);
    const klappen = (e) => {
      e.preventDefault(); e.stopPropagation();
      const aufmachen = !auf[P.code];
      offenSetzen(liste, aufmachen ? P.code : "");
      if (!aufmachen) return;
      // Steht das Aufgeklappte fast unten oder darunter, rückt die Zeile nach oben
      const fenster = liste.ownerDocument.defaultView;
      if (fenster && mehr.getBoundingClientRect().top > fenster.innerHeight * 0.75) {
        const ruhig = fenster.matchMedia && fenster.matchMedia("(prefers-reduced-motion: reduce)").matches;
        z.scrollIntoView({ block: "start", behavior: ruhig ? "auto" : "smooth" });
      }
    };
    nurStoppen(z);
    z.addEventListener("click", klappen);
    z.addEventListener("keydown", (e) => { if (e.target === z && (e.key === "Enter" || e.key === " ")) klappen(e); });
  };
  // Wann du die Klausur schreibst (seit 1.11.2026; seit 2.11. oben im Aufgeklappten): Haupttermin oder Nachholtermin mit ihrem Tag
  // als zwei Knöpfe, daneben leise „Ins WS 2027/28 verschieben“ (das nächste Semester, in dem es angeboten wird). Ein verschobenes Modul fällt aus
  // dem Plan; keiner der zwei Knöpfe ist dann gewählt, einer holt es mit seinem Termin zurück, und statt „Ins … verschieben“ steht
  // „Zurück ins WS 2026/27“ (holt es in den Haupttermin). Gleich nach dem Verschieben sagt ein Hinweis, wohin es ging, mit
  // „Rückgängig“ (seit 2.11.2026: Wer sich vertippt hatte, sah nicht, dass die zwei Knöpfe ohne Wahl es zurückholen). Ein Tipp
  // schreibt die Modulnotiz (terminSchreiben); der Bereich zeichnet sich danach neu, Plan und Bahnen gleiten zum neuen Termin.
  const wahlZeichnen = (el, P, wahl) => {
    const box = el.createDiv({ cls: "eba-lp-v eba-lp-mk-wahl" });
    box.createSpan({ cls: "eba-lp-v-titel", text: "Klausur" });
    const knoepfe = [];
    const waehlen = async (wert, b) => {
      knoepfe.forEach((x) => { x.b.toggleClass("is-an", x.b === b); x.b.setAttr("aria-checked", String(x.b === b)); });
      try { await terminSchreiben(P, wert); } catch (err) { console.error("Lernplan Prüfung", err); }
    };
    const termine = box.createDiv({ cls: "eba-lp-wahl-termine", attr: { role: "radiogroup", "aria-label": `Klausur ${P.code}` } });
    const knopf = (wert, name, k) => {
      const b = termine.createEl("button", { cls: "eba-lp-wahl" + (wert === wahl ? " is-an" : ""),
        attr: { type: "button", role: "radio", "aria-checked": String(wert === wahl), "aria-label": `${name}: ${terminText(k)}` } });
      b.createSpan({ cls: "eba-lp-wahl-name", text: name });
      b.createSpan({ cls: "eba-lp-wahl-wann", text: terminText(k) });
      if (!k) b.setAttr("disabled", "");
      nurStoppen(b);
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (wert !== wahl && k) waehlen(wert, b); });
      knoepfe.push({ b });
    };
    knopf("haupt", "Haupttermin", P.termine && P.termine.haupt);
    knopf("nachhol", "Nachholtermin", P.termine && P.termine.nachhol);
    if (wahl === "spaeter") {
      const z = box.createEl("button", { cls: "eba-lp-verschieben is-zurueck", text: `Zurück ins ${P.semester}`, attr: { type: "button" } });
      nurStoppen(z);
      z.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); z.setAttr("disabled", ""); waehlen("haupt", knoepfe[0].b); });
      return;
    }
    const spaeter = spaeterSemester(P.modul.fm && P.modul.fm.turnus, P.semester, ctx.modell.daten().semesterliste);
    if (!spaeter) return;
    const v = box.createEl("button", { cls: "eba-lp-verschieben", text: `Ins ${spaeter} verschieben`, attr: { type: "button" } });
    nurStoppen(v);
    v.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); v.setAttr("disabled", "");
      waehlen("spaeter", null);
      ctx.hinweis(`${P.code} liegt jetzt im ${spaeter}.`, { aktion: { text: "Rückgängig", ausfuehren: () => {
        terminSchreiben(P, wahl).catch((err) => console.error("Lernplan Prüfung", err));
      } } });
    });
  };
  // Neben „Module“, wie viele Klausuren wann: „4 im Haupttermin, 1 im Nachholtermin, 1 verschoben“
  const wahlText = (alle) => {
    const W = alle.map(terminWahl).filter(Boolean), n = (w) => W.filter((x) => x === w).length, teile = [];
    if (n("haupt")) teile.push(`${n("haupt")} im Haupttermin`);
    if (n("nachhol")) teile.push(`${n("nachhol")} im Nachholtermin`);
    if (n("spaeter")) teile.push(`${n("spaeter")} verschoben`);
    return teile.length ? `Klausuren: ${teile.join(", ")}` : "";
  };
  // Tipp auf eine Bahn: das Modul unter „Module“ aufklappen und dorthin rollen
  const modulZeigen = (wurzel, code) => {
    const k = Array.prototype.filter.call(wurzel.querySelectorAll(".eba-lp-mz"), (x) => x.getAttribute("data-code") === code)[0];
    if (!k) return;
    if (!k.classList.contains("is-offen")) k.click();
    const ruhig = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    k.scrollIntoView({ block: "start", behavior: ruhig ? "auto" : "smooth" });
  };

  const LEER = "Noch kein Lernplan für deine Module.";
  // Geprüft sind nur die zentralen Kapitellisten (kapitel.json, die Kurse des Autors). Bis 2.11.2026 hieß der ganze Lernplan
  // „In Entwicklung“ (Warnkasten, Inhalt abgeblendet); seitdem warnt oben ein Kasten nur, wenn ein Modul des laufenden Semesters
  // keine hat: Seine Kapitel kommen vom eigenen Server oder einer eigenen KI (herkunft nicht zentral), oder es hat keinen Lernplan.
  // Es zählen nur Module, die einen Plan brauchen: nicht bestanden oder anerkannt, kein Zusatzmodul, ECTS nicht 0 (Vorkurse).
  // alle = gesammelte Lernpläne, module = D.module → { ungeprueft: [Codes], ohne: [Codes] }
  const ungeprueft = (alle, module, semName) => {
    const da = new Set(alle.map((P) => P.code));
    return {
      ungeprueft: alle.filter((P) => !P.aus && P.herkunft !== "zentral").map((P) => P.code).sort(),
      ohne: semName ? module.filter((m) => m.code && !da.has(m.code) && FERTIG.indexOf(m.status) < 0 && !m.zusatz && m.ects !== 0
        && imSemester(m, semName)).map((m) => m.code).sort() : [],
    };
  };
  const aufzaehlen = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} und ${xs[xs.length - 1]}`);
  // Text des Kastens → { titel, text } oder null (alles geprüft); eine = in der Lernplan-Notiz des Moduls
  const warnungTeile = (U, eine) => {
    const u = U.ungeprueft, o = U.ohne, haben = (xs) => (xs.length === 1 ? "hat" : "haben");
    if (!u.length && !o.length) return null;
    const vorweg = "Geprüfte Kapitellisten gibt es bisher nur für einige Module.";
    const pruefen = "Kapitel und Fristen können fehlen oder falsch sein: Vergleich sie mit den Folien.";
    if (eine) return { titel: "Die Kapitel sind nicht geprüft.", text: `${vorweg} ${pruefen}` };
    if (u.length) {
      return { titel: `Die Kapitel von ${aufzaehlen(u)} sind nicht geprüft.`,
        text: [vorweg, pruefen].concat(o.length ? [`${aufzaehlen(o)} ${haben(o)} keinen Lernplan.`] : []).join(" ") };
    }
    return { titel: `${aufzaehlen(o)} ${haben(o)} keinen Lernplan.`,
      text: `${vorweg} Der Plan rechnet ohne ${o.length === 1 ? "dieses Modul: Plane es" : "diese Module: Plane sie"} selbst.` };
  };
  const warnungZeichnen = (el, U, eine) => {
    const w = warnungTeile(U, eine);
    if (!w) return;
    const h = el.createDiv({ cls: "eba-lp-warnung", attr: { role: "note" } });
    h.createEl("strong", { cls: "eba-lp-warnung-titel", text: w.titel });
    h.createDiv({ text: w.text });
  };
  // Heute fällige Karteikarten je Modul (karten.js), ohne Karteikarten leer
  const kartenHeute = async () => {
    try { return ctx.karten && ctx.karten.heuteJeModul ? await ctx.karten.heuteJeModul() : {}; } catch (e) { return {}; }
  };

  const NACH_KLAUSUR = { vorbei: 4, vorbereitung: 1, aus: 5 };
  // Reihenfolge der Module: was jetzt zu tun ist zuerst, dann nach Klausurdatum; vorbei ans Ende
  const nachRang = (a, b) => {
    const rang = (P) => (P.stand ? NACH_KLAUSUR[P.stand.art] || 0 : 3);
    return rang(a) - rang(b) || String(a.klausur ? a.klausur.datum : "9").localeCompare(String(b.klausur ? b.klausur.datum : "9")) || a.code.localeCompare(b.code, "de");
  };

  // ---------- Heute zeichnen (seit 3.11.2026) ----------
  // Kurse heute und morgen je Modul (Stundenplan über ctx.modell.findetStatt: Ausfall, Pause, freie Tage zählen) und alle Sitzungen
  // heute → { kurs: Code → { heute: "14:15 Vorlesung", morgen: "Vorlesung" }, sitzungen }
  const kurseVon = (D, heute) => {
    const kurs = {}, sitzungen = [], morgen = plusTage(heute, 1), beginn = {};
    const statt = (fm, tag) => { try { return ctx.modell.findetStatt ? ctx.modell.findetStatt(fm, tag) : null; } catch (e) { return null; } };
    for (const x of D.stundenplan || []) {
      const code = String(x.fm.code || "").trim(), art = String(x.fm.art || "Kurs").trim();
      const K = kurs[code] || (kurs[code] = { heute: "", morgen: "" });
      const s = statt(x.fm, heute), m = statt(x.fm, morgen);
      if (s && s.statt) {
        sitzungen.push(s);
        const a = minVon(s.beginn);
        if (a != null && (beginn[code] == null || a < beginn[code])) { beginn[code] = a; K.heute = `${uhrVon(a)} ${art}`; }
      }
      if (m && m.statt && !K.morgen) K.morgen = art;
    }
    return { kurs, sitzungen };
  };
  // Offene To-dos der Unterlagen deiner Module (todos.js) mit Frist als ISO
  const todosVon = async (codes) => {
    let liste = [];
    try { liste = ctx.todos && ctx.todos.lesen ? await ctx.todos.lesen("todos") : []; } catch (e) { liste = []; }
    return liste.map((t) => ({ id: `${t.f.path}|${t.roh}`, code: String(fmVon(t.f).code || "").trim(), text: t.text, frist: t.faellig ? isoVon(t.faellig) : "",
      quelle: t.quelle, t })).filter((x) => codes.indexOf(x.code) >= 0);
  };
  // Eine Aufgabe kurz: ohne Links und Auszeichnung, bis zur ersten Klammer oder zum ersten Semikolon, höchstens etwa 80 Zeichen
  const aufgabeKurz = (text) => {
    let s = String(text || "").replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]/g, "").trim();
    const m = s.search(/ \(|; | – /);
    if (m > 15) s = s.slice(0, m);
    return s.length > 80 ? s.slice(0, 78).replace(/\s+\S*$/, "") + " …" : s;
  };
  // Der Tag je Gerät (localStorage): welche Einträge heute dran sind, damit die Liste den Tag über gleich bleibt und Erledigtes
  // durchgestrichen stehen bleibt; snap: wie ein Eintrag aussah (für Erledigtes, das aus den Listen verschwindet)
  const TAG_SPEICHER = "eba-lp-heute";
  const tagLesen = () => { try { const v = app.loadLocalStorage(TAG_SPEICHER); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const tagMerken = (v) => { try { app.saveLocalStorage(TAG_SPEICHER, JSON.stringify(v)); } catch (e) { /* ohne Obsidian */ } };
  const kapitelId = (P, k) => `k|${P.f.path}|${titelSchluessel(k.titel)}`;
  // Wie ein Eintrag aussieht: Titel, darunter Kürzel und Kapitel, überfällig, Seiten, Kurs heute oder morgen; rechts die Zeit
  const eintragVon = (x, kurs, heute, farben, teil) => {
    if (x.art === "kapitel") {
      const P = x.P, k = P.kapitel[x.i], b = bisText(P, x.i), K = kurs[P.code] || {};
      const unter = [{ text: `${P.code} ${kapitelName(k, x.i)}` }];
      if (b.ueberfaellig) unter.push({ text: b.text, cls: "is-ueberfaellig" });
      else if (x.rang === 5) unter.push({ text: b.text });
      if (k.seitenWert) unter.push({ text: `${k.seitenWert}\u00a0S.` });
      if (K.heute) unter.push({ text: `heute ${K.heute}` }); else if (K.morgen) unter.push({ text: `morgen ${K.morgen}` });
      if (teil) unter.push({ text: `heute ein Teil von ${dauerText(x.minuten)}` });
      return { art: "kapitel", titel: k.titel, unter, minuten: teil || x.minuten, farbe: P.farbe || 0 };
    }
    const t = x.t;
    const unter = [{ text: t.quelle || t.code }];
    unter.push(t.frist < heute ? { text: `überfällig seit ${wtm(t.frist)}`, cls: "is-ueberfaellig" } : { text: t.frist === heute ? "bis heute" : `bis ${wtm(t.frist)}` });
    return { art: "aufgabe", titel: aufgabeKurz(t.text), unter, minuten: x.minuten, farbe: (farben && farben[t.code]) || 0, code: t.code, pfad: t.t.f.path, nr: t.t.nr, roh: t.t.roh };
  };
  // Eine Zeile: Kästchen wie bei den To-dos, Titel mit Farbpunkt (Tipp öffnet Folien bzw. Notiz), darunter die Teile, rechts die Zeit
  const tagZeile = (l, e, fertig, umschalten, aufmachen) => {
    const z = l.createDiv({ cls: `eba-lp-tz modul-${e.farbe || 0}` + (fertig ? " is-fertig" : "") });
    const haken = z.createEl("label", { cls: "eba-td-haken" });
    if (umschalten) {
      const box = haken.createEl("input", { attr: { type: "checkbox", "aria-label": (e.art === "kapitel" ? "Verstanden: " : "Erledigt: ") + e.titel } });
      box.checked = fertig;
      nurStoppen(haken);
      haken.addEventListener("click", (ev) => ev.stopPropagation());
      box.addEventListener("change", (ev) => { ev.stopPropagation(); z.toggleClass("is-fertig", box.checked); umschalten(box.checked); });
    } else haken.setAttr("aria-hidden", "true");
    const t = z.createDiv({ cls: "eba-lp-tz-text" });
    const titel = t.createDiv({ cls: "eba-lp-tz-titel" });
    titel.createSpan({ cls: "eba-lp-farbpunkt" + (e.farbe ? "" : " is-leer"), attr: { "aria-hidden": "true" } });
    const name = titel.createSpan({ cls: "eba-lp-tz-name", text: e.titel });
    if (aufmachen) { name.addClass("is-link"); nurStoppen(name); name.addEventListener("click", aufmachen); }
    if (e.unter && e.unter.length) stuecke(t.createDiv({ cls: "eba-lp-tz-unter" }), e.unter, "eba-lp-tz-teil");
    z.createSpan({ cls: "eba-lp-tz-dauer", text: fertig && e.art === "karten" ? "erledigt" : dauerText(e.minuten) });
  };
  const heuteZeichnen = async (wurzel, A, D, heute, quelle, neu, karten) => {
    if (!A.length) return;
    const budget = tageszeitLesen(einstellungen()[FELD_TAG])[tagIndex(heute)];
    const { kurs, sitzungen } = kurseVon(D, heute);
    const todos = await todosVon(A.map((P) => P.code));
    const kand = kandidatenVon(A, todos, kurs, heute);
    const kapitelNachId = {}, todoNachId = {}, kandNachId = {};
    for (const P of A) P.kapitel.forEach((k, i) => { kapitelNachId[kapitelId(P, k)] = { P, i }; });
    for (const t of todos) todoNachId[`t|${t.id}`] = t;
    for (const x of kand) kandNachId[x.id] = x;
    const farben = {};
    for (const P of A) farben[P.code] = P.farbe || 0;
    const fertigVon = (id) => { const x = kapitelNachId[id]; return id.slice(0, 2) === "k|" ? !!x && x.P.kapitel[x.i].anteil >= 1 - EPS : !todoNachId[id]; };
    let T = tagLesen();
    if (!T || T.tag !== heute || !Array.isArray(T.ids)) T = { tag: heute, ids: [], snap: {}, teil: {}, budget: -1, karten: 0 };
    T.snap = T.snap || {};
    T.teil = T.teil || {};
    // Was es nicht mehr gibt, fällt weg (ein Kapitel aus der Liste gestrichen; ein offenes To-do, das nicht mehr offen ist, gilt als erledigt)
    T.ids = T.ids.filter((id) => (id.slice(0, 2) === "k|" ? !!kapitelNachId[id] : !!T.snap[id]));
    if (T.budget !== budget) {
      // Neuer Tag oder andere Lernzeit: Erledigtes bleibt, der Rest wird neu gefüllt
      const fertig = T.ids.filter(fertigVon), schon = fertig.reduce((s, id) => s + ((T.snap[id] && T.snap[id].minuten) || 0), 0);
      const dazu = heuteFuellen(kand.filter((x) => fertig.indexOf(x.id) < 0), budget, schon);
      T.ids = fertig.concat(dazu.map((x) => x.id));
      for (const x of dazu) { if (x.teil) T.teil[x.id] = x.teil; else delete T.teil[x.id]; }
      T.budget = budget;
    }
    const eintraege = T.ids.map((id) => {
      const x = kandNachId[id];
      if (x && !fertigVon(id)) { T.snap[id] = eintragVon(x, kurs, heute, farben, T.teil[id]); return { id, e: T.snap[id], fertig: false, x }; }
      const s = T.snap[id];
      if (!s) { const y = kapitelNachId[id]; return y ? { id, e: eintragVon({ art: "kapitel", P: y.P, i: y.i, rang: 0, minuten: minutenVon(y.P.kapitel[y.i]).ganz }, kurs, heute, farben), fertig: fertigVon(id) } : null; }
      return { id, e: s, fertig: fertigVon(id) };
    }).filter(Boolean);
    // Karteikarten: alles, was heute dran ist, eine Zeile (eine halbe Minute je Karte); erledigt, wenn nichts mehr dran ist
    let n = 0;
    for (const c of Object.keys(karten || {})) { const z = karten[c]; n += (z.faellig || 0) + (z.lernen || 0) + (z.neu || 0); }
    if (n) T.karten = Math.max(T.karten || 0, runden5(n / 2));
    const kartenZeile = n || T.karten ? { e: { art: "karten", titel: "Karteikarten", unter: n ? [{ text: n === 1 ? "1 Karte dran" : `${n} Karten dran` }] : [], minuten: T.karten }, fertig: !n } : null;
    const keep = {}, teile = {};
    for (const id of T.ids) { if (T.snap[id]) keep[id] = T.snap[id]; if (T.teil[id]) teile[id] = T.teil[id]; }
    T.snap = keep; T.teil = teile;
    tagMerken(T);

    const alle = eintraege.concat(kartenZeile ? [kartenZeile] : []);
    const gesamt = alle.reduce((s, x) => s + x.e.minuten, 0), erledigt = alle.filter((x) => x.fertig).reduce((s, x) => s + x.e.minuten, 0);
    const karte = wurzel.createDiv({ cls: "eba-lp-tag", attr: { role: "group", "aria-label": "Heute" } });
    const kopf = karte.createDiv({ cls: "eba-lp-tag-kopf" });
    const titel = kopf.createDiv({ cls: "eba-lp-tag-titel" });
    titel.createSpan({ cls: "eba-lp-tag-name", text: "Heute" });
    titel.createSpan({ cls: "eba-lp-tag-datum", text: wtm(heute) });
    const rechts = kopf.createDiv({ cls: "eba-lp-tag-rechts" });
    if (gesamt) {
      const stand = rechts.createSpan({ cls: "eba-lp-tag-stand" });
      if (erledigt) { balken(stand, erledigt / gesamt); stand.appendText(`${dauerText(erledigt)} von ${dauerText(gesamt)}`); }
      else stand.setText(`etwa ${dauerText(gesamt)}`);
    }
    const zeit = rechts.createEl("button", { cls: "eba-lp-zeit eba-lp-tag-zeit", attr: { type: "button", "aria-label": `Lernzeit heute: ${budget ? dauerText(budget) : "frei"}. Lernzeit einstellen`, title: "Lernzeit einstellen" } });
    zeit.createSpan({ text: budget ? `${dauerText(budget)} Lernzeit` : "heute frei" });
    zeit.createSpan({ cls: "eba-lp-zeit-pfeil" }).innerHTML = PFEIL;
    nurStoppen(zeit);
    zeit.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (Modal) new EinstellFenster("").open(); });
    const frei = luecken(sitzungen);
    if (frei && budget) karte.createDiv({ cls: "eba-lp-tag-frei", text: `Frei zwischen deinen Kursen: ${frei}.` });
    const liste = karte.createDiv({ cls: "eba-lp-tag-liste" });
    for (const y of eintraege) {
      const e = y.e;
      let aufmachen = null;
      if (e.art === "kapitel" && kapitelNachId[y.id]) {
        const { P, i } = kapitelNachId[y.id], k = P.kapitel[i];
        if (k.ziel) aufmachen = (ev) => oeffnen(k.ziel, ev, quelle);
        else if (k.webZiel) aufmachen = (ev) => { ev.preventDefault(); ev.stopPropagation(); window.open(k.webZiel); };
      } else if (e.art === "aufgabe") {
        const f = app.vault.getAbstractFileByPath(e.pfad);
        if (f) aufmachen = (ev) => oeffnen(f, ev, quelle);
      }
      tagZeile(liste, e, y.fertig, async (an) => {
        try {
          if (e.art === "kapitel") {
            const z = kapitelNachId[y.id];
            if (!z) return;
            const k = z.P.kapitel[z.i];
            if (an) {
              abgehakt.zuletzt = { key: abgehaktKey(z.P, k), zeit: Date.now() };
              if (abgehakt.tag !== heute) { abgehakt.tag = heute; abgehakt.keys = {}; }
              abgehakt.keys[abgehaktKey(z.P, k)] = true;
            }
            if (an !== (k.anteil >= 1 - EPS)) await schreiben(z.P.f, k);
          } else if (e.art === "aufgabe" && ctx.todos) {
            const f = app.vault.getAbstractFileByPath(e.pfad);
            if (!f) return;
            if (an && y.x) { if (!(await ctx.todos.abhaken(y.x.t.t))) ctx.hinweis(`Die Aufgabe in „${f.basename}“ hat sich inzwischen geändert und ist nicht abgehakt. Bitte noch einmal tippen.`); }
            else if (!an) await ctx.todos.zuruecknehmen({ f, nr: e.nr, roh: e.roh });
          }
        } catch (err) { console.error("Lernplan heute", err); }
        neu();
      }, aufmachen);
    }
    if (kartenZeile) tagZeile(liste, kartenZeile.e, kartenZeile.fertig, null, n && ctx.karten && ctx.karten.lernen
      ? (ev) => { ev.preventDefault(); ev.stopPropagation(); ctx.karten.lernen({}); } : null);
    if (!alle.length) liste.createDiv({ cls: "eba-lp-tag-leer", text: budget ? "Für heute ist nichts offen." : "Heute hast du keine Lernzeit eingestellt." });
    else if (alle.every((x) => x.fertig)) liste.createDiv({ cls: "eba-lp-tag-leer is-geschafft", text: "Für heute geschafft." });
    // Mehr für heute: der nächste Eintrag der Reihe (auch aus der nächsten Woche)
    const naechster = kand.filter((x) => T.ids.indexOf(x.id) < 0)[0];
    if (naechster) {
      const fuss = karte.createDiv({ cls: "eba-lp-tag-fuss" });
      const b = fuss.createEl("button", { cls: "eba-vb-knopf leise", text: !budget && !alle.length ? "Trotzdem etwas lernen" : naechster.rang >= 5 ? "Vorarbeiten" : "Mehr für heute", attr: { type: "button" } });
      nurStoppen(b);
      b.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const U = tagLesen() || T;
        if (U.ids.indexOf(naechster.id) < 0) U.ids.push(naechster.id);
        tagMerken(U);
        neu();
      });
    }
  };

  // Einstieg (seit 3.11.2026): Wer noch nichts abgehakt hat, liegt sonst gleich zu Beginn „im Rückstand“, weil der Plan mit der ersten
  // Vorlesung beginnt. Einmal fragen: ab heute planen (seit = Montag dieser Woche in jeder Lernplan-Notiz, die früher beginnt) oder
  // schon Gelerntes abhaken (das erste Modul geht auf). Gemerkt in lernplan_einstieg (Einstellungen).
  const einstiegSchreiben = async (heute) => {
    const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
    if (f) await app.fileManager.processFrontMatter(f, (fm) => { fm[FELD_EINSTIEG] = heute; });
  };
  const einstiegZeichnen = (wurzel, A, heute, neu) => {
    if (einstellungen()[FELD_EINSTIEG] || A.some((P) => P.kapitel.some((k) => k.anteil > EPS))) return;
    const rueck = A.reduce((s, P) => s + P.kapitel.filter((k, i) => bisText(P, i).ueberfaellig).length, 0);
    if (!rueck) return;
    const mo = montagVon(heute);
    const box = wurzel.createDiv({ cls: "eba-lp-start", attr: { role: "group", "aria-label": "Einstieg" } });
    box.createDiv({ cls: "eba-lp-start-titel", text: "Wo stehst du?" });
    box.createDiv({ cls: "eba-lp-start-text", text: `Der Plan beginnt mit der ersten Vorlesung. Weil du noch nichts abgehakt hast, sieht es aus, als lägst du ${rueck} Kapitel zurück.` });
    box.createDiv({ cls: "eba-lp-start-hilfe", text: "So geht’s: Der Plan verteilt die Kapitel bis zur Klausur. Hak ein Kapitel ab, wenn du es erklären kannst. Danach übst du mit Altklausuren." });
    const knoepfe = box.createDiv({ cls: "eba-lp-start-knoepfe" });
    const knopf = (text, cls, tun) => {
      const b = knoepfe.createEl("button", { cls: "eba-vb-knopf " + cls, text, attr: { type: "button" } });
      nurStoppen(b);
      b.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        b.setAttr("disabled", "");
        try { await tun(); } catch (err) { console.error("Lernplan Einstieg", err); }
        neu();
      });
    };
    knopf("Ab heute planen", "cta", async () => {
      for (const P of A) if (P.beginn < mo) await app.vault.process(P.f, (t) => zeileSetzen(t, /^seit\s*:/, `seit: ${mo}`) || t);
      await einstiegSchreiben(heute);
    });
    knopf("Ich habe schon gelernt", "leise", async () => {
      await einstiegSchreiben(heute);
      const P = A.filter((x) => x.kapitel.some((k, i) => bisText(x, i).ueberfaellig))[0];
      if (P) for (const x of A) auf[x.code] = x === P;
    });
  };

  // ---------- Lernplan einstellen (seit 2.11.2026) ----------
  // Ein eigener Bereich für die Einstellungen je Modul, ein Fenster hinter dem Regler rechts neben dem Titel des Lernplans (in einer
  // Lernplan-Notiz nur ihr Modul): „Vor der Vorlesung lernen“, „Zeit je Kapitel“ und eingeschaltet je Kapitel Weniger, Normal, Mehr.
  // Bis dahin standen sie im aufgeklappten Modul, und „Anpassen“ legte die Wahl unter jedes Kapitel (am iPhone etwa 3700 px).
  // Jede Änderung schreibt sofort in die Notiz; das Fenster zeichnet sich neu, sobald Obsidian sie neu gelesen hat, und folgt
  // jeder weiteren Änderung, solange es offen ist (EinstellFenster).
  // Dateien, von denen ein Lernplan abhängt (Notizen, Folien, Klausurtermine, Module, Einstellungen)
  const relevant = (p) => p.startsWith(ORDNER) || p.startsWith("Unterlagen/") || p.startsWith("Termine/") || p.startsWith("Module/") || p === EINSTELLUNGEN;
  // Ein Kapitel im Fenster: Nummer, Titel, wie oft es in Altklausuren vorkam, daneben Weniger, Normal, Mehr
  const kapitelWahl = (l, P, k, i, neu) => {
    const z = l.createDiv({ cls: "eba-lp-einst-k" });
    const t = z.createDiv({ cls: "eba-lp-einst-k-text" });
    t.createSpan({ cls: "eba-lp-k-nr", text: k.nr || String(i + 1) });
    const n = t.createDiv({ cls: "eba-lp-einst-k-name" });
    n.createSpan({ text: k.titel });
    const a = k.altklausuren;
    if (a) n.createSpan({ cls: "eba-lp-schalter-hilfe", text: `in ${a.in} von ${a.von} Altklausuren` });
    zeitWahlZeichnen(z, P, k, neu);
  };
  // Inhalt des Fensters: je Modul mit Plan (nur = ein Kürzel) Kopf, die zwei Schalter, eingeschaltet die Kapitel
  const einstellungenZeichnen = async (c, nur, neu) => {
    const D = ctx.modell.daten(), heute = heuteIso();
    const { alle } = await allesSammeln(D, heute);
    const liste = alle.filter((P) => P.plan && !P.aus && (!nur || P.code === nur)).sort(nachRang);
    c.empty();
    const box = c.createDiv({ cls: "eba-lp eba-lp-einst" });
    if (!liste.length) { box.createDiv({ cls: "eba-lp-leer", text: "Kein Modul hat gerade einen Plan." }); return; }
    if (!nur) tageszeitZeichnen(box, neu);
    for (const P of liste) {
      const m = box.createDiv({ cls: `eba-lp-einst-modul modul-${P.farbe || 0}` });
      const kopf = m.createDiv({ cls: "eba-lp-einst-kopf" });
      kopf.createSpan({ cls: "eba-lp-mk-code", text: P.code });
      kopf.createSpan({ cls: "eba-lp-einst-name", text: P.modul ? P.modul.titel : P.f.basename });
      const n = () => neu(P.f);
      schalterZeichnen(m, P, n);
      if (!P.kapitel.length) continue;
      zeitZeile(m, P, n);
      if (!P.zeitAn) continue;
      m.createDiv({ cls: "eba-lp-einst-hilfe", text: "„Mehr“ ist anderthalbmal so viel Zeit, „Weniger“ halb so viel." });
      const kl = m.createDiv({ cls: "eba-lp-einst-kapitel" });
      P.kapitel.forEach((k, i) => { if (k.nr && k.zeit) kapitelWahl(kl, P, k, i, n); });
    }
  };
  // Lernzeit je Wochentag (seit 3.11.2026): so viel füllt „Heute“; schreibt lernplan_tageszeit in die Einstellungen
  const tageszeitZeichnen = (box, neu) => {
    const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
    const werte = tageszeitLesen(einstellungen()[FELD_TAG]);
    const m = box.createDiv({ cls: "eba-lp-einst-modul eba-lp-einst-tag" });
    m.createDiv({ cls: "eba-lp-einst-kopf" }).createSpan({ cls: "eba-lp-einst-name", text: "Lernzeit am Tag" });
    m.createDiv({ cls: "eba-lp-einst-hilfe", text: "So viel nimmt sich der Lernplan unter „Heute“ vor, ohne deine Kurse." });
    TAG_NAME.forEach((name, i) => {
      const z = m.createEl("label", { cls: "eba-lp-schalter eba-lp-tagzeit" });
      z.createSpan({ cls: "eba-lp-schalter-text", text: name });
      const s = z.createEl("select", { cls: "dropdown eba-lp-tagzeit-wahl", attr: { "aria-label": `Lernzeit am ${name}` } });
      const wahl = TAG_WAHL.indexOf(werte[i]) >= 0 ? TAG_WAHL : TAG_WAHL.concat([werte[i]]).sort((a, b) => a - b);
      for (const v of wahl) {
        const o = s.createEl("option", { text: v ? dauerText(v).replace("\u00a0", " ") : "frei", attr: { value: String(v) } });
        if (v === werte[i]) o.selected = true;
      }
      nurStoppen(z);
      z.addEventListener("click", (e) => e.stopPropagation());
      s.addEventListener("change", async () => {
        if (!f) return;
        try { await app.fileManager.processFrontMatter(f, (fm) => { const l = tageszeitLesen(fm[FELD_TAG]); l[i] = +s.value; fm[FELD_TAG] = l; }); }
        catch (err) { console.error("Lernplan Lernzeit", err); }
        neu(f);
      });
    });
  };
  const Modal = O.Modal;
  class EinstellFenster extends (Modal || class {}) {
    constructor(nur) { super(app); this.nur = nur || ""; this.offen = false; }
    onOpen() {
      this.offen = true;
      this.modalEl.addClass("eba-modal", "eba-lp-einst-fenster");
      this.titleEl.setText(this.nur ? `Lernplan ${this.nur} einstellen` : "Lernplan einstellen");
      this.inhalt = this.contentEl.createDiv();
      const k = this.contentEl.createDiv({ cls: "modal-button-container" });
      k.createEl("button", { cls: "mod-cta", text: "Fertig" }).addEventListener("click", () => this.close());
      // Folgt jeder Änderung, solange es offen ist (seit 3.11.2026; vorher zeichnete es nur einmal nach der eigenen Änderung neu:
      // Erwischte das einen Zwischenstand, fehlten auf einem iPad die Module, bis die App neu startete)
      this.lauf = 0;
      this.bald = ctx.entprellen(() => { if (this.offen) this.zeichnen(); }, 400);
      const bei = (f) => { if (f && relevant(f.path)) this.bald(); };
      this.refs = [[app.metadataCache, app.metadataCache.on("changed", bei)], [app.vault, app.vault.on("delete", bei)],
        [app.vault, app.vault.on("rename", (f, alt) => { bei(f); if (relevant(alt)) this.bald(); })]];
      this.zeichnen();
    }
    // In ein neues Element zeichnen und es erst danach eintauschen; ein älterer Lauf, der später fertig wird, überschreibt nichts
    async zeichnen() {
      const nr = ++this.lauf, neu = document.createElement("div");
      try { await einstellungenZeichnen(neu, this.nur, () => this.bald()); }
      catch (e) { console.error("Lernplan einstellen", e); return; }
      if (!this.offen || nr !== this.lauf) return;
      const oben = this.modalEl.scrollTop;
      this.inhalt.replaceWith(neu);
      this.inhalt = neu;
      this.modalEl.scrollTop = oben;
    }
    onClose() { this.offen = false; for (const [q, r] of this.refs) q.offref(r); this.refs = []; this.contentEl.empty(); }
  }
  // Regler rechts neben dem Titel (.eba-kopf derselben Leseansicht); bei jedem Zeichnen wieder eingesetzt, falls Obsidian den Kopf
  // neu gezeichnet hat. nur: Kürzel in einer Lernplan-Notiz
  const kopfRegler = (el, nur) => {
    const sizer = el.closest ? el.closest(".markdown-preview-sizer") : null;
    const kopf = sizer && sizer.querySelector(".eba-kopf");
    if (!kopf || !Modal) return;
    let b = kopf.querySelector("button.eba-lp-einst");
    if (!b) {
      b = kopf.createEl("button", { cls: "eba-lp-einst", attr: { type: "button", "aria-label": "Lernplan einstellen", title: "Lernplan einstellen" } });
      b.innerHTML = REGLER;
      // Vor dem Titel: rechts schwebend wie der Platzhalter für Obsidians Knopf (eba-core.css 70.1/70.2), der Titel bricht davor um
      kopf.insertBefore(b, kopf.firstChild);
    }
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); new EinstellFenster(nur).open(); };
  };
  const zeichnen = async (el, mdCtx, art, neu) => {
    zeitMenueZu();
    const D = ctx.modell.daten(), heute = heuteIso(), quelle = (mdCtx && mdCtx.sourcePath) || "";
    if (art === "modul") {
      const f = app.vault.getAbstractFileByPath(quelle);
      el.empty(); el.addClass("eba-lp", "eba-lp-eine");
      if (!f || fmVon(f).typ !== "lernplan") { el.setText("Dieser Block gehört in eine Lernplan-Notiz."); return; }
      const P = await sammeln(f, D, heute, optionen(D));
      const karten = await kartenHeute();
      el.empty();
      if (!P.aus && P.herkunft !== "zentral") warnungZeichnen(el, { ungeprueft: [P.code], ohne: [] }, true);
      // Dasselbe wie das aufgeklappte Modul auf der Lernplan-Seite, in seiner Farbe (seit 2.11.2026); die Liste unter „Kapitel“ ist die
      // Quelle und steht nur beim Bearbeiten (eba-core.css Abschnitt 61, Lernplan-Notiz)
      P.farbe = modulFarben(lernplaene().map(codeVon))[P.code] || 0;
      const rahmen = el.createDiv({ cls: "eba-lp-module eba-lp-notiz-modul" });
      modulKopf(rahmen, P, quelle, heute, true);
      if (P.plan || P.kapitel.length) modulInhalt(rahmen.createDiv({ cls: `eba-lp-unten eba-lp-mz-mehr modul-${P.farbe}` }), P, quelle, neu, karten, true);
      if (P.plan && !P.aus) kopfRegler(el, P.code);
      return;
    }
    if (art === "woche") return dashboardZeichnen(el, D, heute);
    const { alle, o } = await allesSammeln(D, heute);
    const karten = alle.length ? await kartenHeute() : {};
    el.empty(); el.addClass("eba-lp");
    if (!alle.length) { el.createDiv({ cls: "eba-lp-leer", text: LEER }); return; }
    const sem = ctx.modell.semesterFuer(heute);
    warnungZeichnen(el, ungeprueft(alle, D.module, sem ? sem.name : ""), false);
    // Oben was heute dran ist (seit 3.11.2026; beim ersten Mal davor der Einstieg), dann dein Stand, das Semester mit dem Anteil der
    // Zeit und der gewählten Woche, darunter die Module
    const A = alle.filter(aktiv).sort(nachKlausur);
    einstiegZeichnen(el, A, heute, neu);
    await heuteZeichnen(el, A, D, heute, quelle, neu, karten);
    heldZeichnen(el, A, heute);
    planZeichnen(el, A, alle, o, D, heute, quelle, neu);
    kopfRegler(el, "");
    const raster = el.querySelector(":scope > .eba-lp-raster");
    const spalte = (raster || el).createDiv({ cls: "eba-lp-spalte" });
    // „Module“ als Kopf im Rahmen der Liste wie „Semesterplan“ in seiner Karte (seit 2.11.2026; davor ein Label darüber, in zwei
    // Spalten begann die Liste so 36 px tiefer als die Woche)
    const liste = spalte.createDiv({ cls: "eba-lp-module" });
    const label = liste.createDiv({ cls: "eba-lp-module-kopf" });
    label.createSpan({ cls: "eba-lp-module-titel", text: "Module" });
    const w = wahlText(alle);
    if (w) label.createSpan({ cls: "eba-lp-module-wahl", text: w });
    alle.sort(nachRang);
    for (const P of alle) modulZeileZeichnen(liste, P, quelle, neu, karten, heute);
    const offen = alle.filter((P) => auf[P.code])[0];
    offenSetzen(liste, offen ? offen.code : "");
  };
  // Immer nur ein Modul offen (seit 1.11.2026; code: das offene, "" keins): Mehrere offene machten die Liste unübersichtlich
  const offenSetzen = (liste, code) => {
    for (const z of liste.querySelectorAll(".eba-lp-mz")) {
      const c = z.getAttribute("data-code"), an = c === code;
      auf[c] = an;
      z.toggleClass("is-offen", an); z.setAttr("aria-expanded", String(an));
    }
    for (const m of liste.querySelectorAll(".eba-lp-mz-mehr")) m.toggleClass("is-zu", m.getAttribute("data-code") !== code);
  };

  // Dashboard (```eba-lernplan woche```): eine Zeile wie die der Karteikarten, nur wenn diese Woche etwas dran ist; Tipp öffnet den
  // Lernplan. Sonst samt Hülle unsichtbar (.eba-lp-aus).
  const dashboardZeichnen = async (el, D, heute) => {
    const { alle } = sichtbar() ? await allesSammeln(D, heute) : { alle: [] };
    const W = dieseWoche(alle, false);
    el.empty();
    if (!W.kapitel.length && !W.vorbereitung.length) { el.addClass("eba-lp-aus"); return; }
    el.removeClass("eba-lp-aus");
    const box = el.createDiv({ cls: "eba-lk-heute eba-lp-heute" });
    box.createSpan({ cls: "eba-uh-symbol" }).innerHTML = SYMBOL;
    const t = box.createSpan({ cls: "eba-lk-heute-text" });
    // Leerzeichen statt Rand: Bricht die Zeile um, beginnt die neue bündig
    t.createEl("b", { text: "Lernplan" });
    t.appendText(" ");
    stuecke(t.createSpan({ cls: "eba-lp-heute-was" }), kurzTeile(W).map((text) => ({ text })), "eba-lp-heute-teil");
    const f = app.vault.getAbstractFileByPath(BEREICH);
    if (!f) return;
    const a = box.createEl("a", { cls: "eba-vb-knopf", text: "Öffnen", href: f.path });
    nurStoppen(a);
    a.addEventListener("click", (e) => oeffnen(f, e, "Dashboard.md"));
  };
  // Pfeile der Wahlpille und der Wochen, Uhr (volle Zeit), Haken (Woche geschafft) als eigenes SVG (setIcon blieb auf dem iPad
  // leer, wie kopf.js)
  const HAKEN = '<svg class="eba-sym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const LINKS = '<svg class="eba-sym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  const RECHTS = '<svg class="eba-sym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  const UHR = '<svg class="eba-sym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  // Regler (Lucide sliders-horizontal, seit 2.11.2026): das Zahnrad unten rechts öffnet Einstellungen & Hilfe der ganzen App, ein
  // zweites Zahnrad im Kopf sah aus wie derselbe Weg
  const REGLER = '<svg class="eba-sym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/></svg>';
  const INFO = '<svg class="eba-sym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
  const PFEIL ='<svg class="eba-sym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const SYMBOL = '<svg class="eba-sym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>';

  // Modulseite (modul.js): Abschnitt „Lernplan“ mit dem Stand wie im Bereich, Tipp öffnet die Lernplan-Notiz; ohne Notiz nichts.
  // Zeichnet in einen eigenen Kasten, der sich füllt, sobald die Notiz gelesen ist.
  const modulZeile = (el, code, quelle) => {
    const f = lernplaene().filter((x) => codeVon(x) === code)[0];
    if (!f || !ctx.modell || !ctx.modell.daten) return;
    const box = el.createDiv({ cls: "eba-mod-lernplan" });
    const D = ctx.modell.daten();
    sammeln(f, D, heuteIso(), optionen(D)).then((P) => {
      const k = box.createDiv({ cls: "eba-mod-k" });
      k.appendText("Lernplan");
      const z = box.createDiv({ cls: "eba-mod-lp-zeile" });
      const p = P.stand && P.stand.pille;
      const inhalt = z.createDiv({ cls: "eba-mod-lp-inhalt" });
      if (p) inhalt.createSpan({ cls: "eba-pill " + p.art, text: p.text });
      inhalt.createSpan({ cls: "eba-mod-lp-text", text: verbinden(standTeile(P).filter((x) => !x.klausur).map((x) => x.text)) });
      z.createSpan({ cls: "eba-mod-lp-pfeil", attr: { "aria-hidden": "true" } });
      z.setAttr("role", "link"); z.setAttr("tabindex", "0");
      nurStoppen(z);
      z.addEventListener("click", (e) => oeffnen(f, e, quelle));
      z.addEventListener("keydown", (e) => { if (e.key === "Enter") oeffnen(f, e, quelle); });
    }).catch((e) => { console.error("Lernplan Modulseite", e); box.remove(); });
  };

  // ---------- Lernplan-Notizen aus Kapitellisten (kapitel.json, eigener Server) ----------
  // Notiztext für einen Eintrag { code, semester, quelle, stand, vorlaeufig, kapitel: [{ nr, titel, seiten, folien, url, vorlesung,
  // zwischentest, teile }] }. alt = bisheriger Text oder "", ziele = je Kapitel der Name der Folien-Notiz oder "" (zieleVon),
  // herkunft = zentral | server. Häkchen gehen mit dem Titel (ohne Groß-/Kleinschreibung und Satzzeichen; bei gleichem Titel zuerst
  // das mit gleicher Nummer): Ein Kapitel mit neuer Nummer bleibt abgehakt, ein anderes Kapitel unter derselben Nummer erbt das
  // Häkchen nicht (die Liste wird mit jeder Vorlesung berichtigt). Es bleiben auch eigene Eigenschaften (`seit`, `verstanden_bis`,
  // `vorlernen`, Tags …), eigener Text und eigene Aufgaben unter „## Kapitel“ (hinter dem Kapitel, hinter dem sie standen) und alles
  // unter „## Meine Notizen“. Eine Aufgabe gehört der Liste nur, wenn sie zu einem Kapitel der neuen Liste passt oder in der zuletzt
  // geschriebenen stand (frueher = listeZeilen dieser Liste); sonst ist sie deine, auch mit Nummer („3 Altklausuren rechnen“).
  const MEINE = "## Meine Notizen";
  const KAPITEL = "## Kapitel";
  const LISTE_FELDER = ["typ", "code", "herkunft", "semester", "quelle", "stand", "vorlaeufig", "cssclasses"];
  const titelSchluessel = (t) => String(t == null ? "" : t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  // Kurz-Prüfsumme einer Kapitelzeile („Anhang Literatur“ liest kapitelLesen ohne Nummer, ergibt aber dieselbe Summe)
  const zeilenHash = (nr, titel) => ctx.user.quellen.kurzHash(titelSchluessel(`${nr} ${titel}`));
  // Alle (Unter-)Kapitel eines Eintrags als Prüfsummen: was die Notiz nach dem Schreiben an Aufgaben aus der Liste enthält
  const listeZeilen = (e) => [].concat(...e.kapitel.map((k) => [zeilenHash(k.nr, k.titel)].concat((k.teile || []).map((t) => zeilenHash(t.nr, t.titel)))));
  // Altes (Unter-)Kapitel zu nr und titel aus kandidaten: gleicher Titel, bei mehreren das mit gleicher Nummer; jedes nur einmal
  const partner = (kandidaten, nr, titel, vergeben) => {
    const t = titelSchluessel(titel);
    const gleich = kandidaten.filter((k) => !vergeben.has(k) && titelSchluessel(k.titel) === t);
    const k = gleich.filter((x) => x.nr === nr)[0] || gleich[0] || null;
    if (k) vergeben.add(k);
    return k;
  };
  // Eigene Eigenschaften der alten Notiz: die Zeilen jedes Felds, das nicht aus der Liste kommt, samt Folgezeilen
  const eigeneFelder = (alt) => {
    const m = String(alt || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const aus = [];
    let behalten = false;
    if (m) for (const roh of m[1].split("\n")) {
      const z = roh.replace(/\r$/, ""), feld = z.match(/^([^\s:#-][^:]*):/);
      if (feld) behalten = LISTE_FELDER.indexOf(feld[1].trim()) < 0;
      if (behalten) aus.push(z);
    }
    return aus;
  };
  // Eigenes unter „## Kapitel“ (Zeilen von–bis): alles außer den Zeilen der Liste (ausListe) und den Unterkapiteln der Liste in
  // ihren Kapiteln. → { vor: [Zeilen vor dem ersten Kapitel], nach: Map(altes Kapitel → [Zeilen dahinter]) }
  const eigenesLesen = (zeilen, von, bis, kapitel, ausListe) => {
    const an = {};
    for (const k of kapitel) { an[k.zeile] = { k, unter: false }; for (const t of k.teile) an[t.zeile] = { k: t, unter: true }; }
    const vor = [], nach = new Map();
    let anker = null, eigen = false;
    for (let i = von; i < bis; i++) {
      const x = an[i], liste = !!x && ausListe(x.k);
      if (x && !x.unter) { eigen = !liste; if (liste) { anker = x.k; continue; } } else if (x && !eigen && liste) continue;
      const z = zeilen[i].replace(/\r$/, "");
      if (!anker) vor.push(z);
      else { if (!nach.has(anker)) nach.set(anker, []); nach.get(anker).push(z); }
    }
    return { vor, nach };
  };
  // Link auf die Folien nur mit einem Namen, den Obsidian als Link lesen kann
  const LINK_OK = /^[^[\]|#^]+$/;
  const zentralNotiz = (e, alt, frueher, ziele, herkunft) => {
    const zeilenAlt = String(alt || "").split("\n");
    const kopf = zeilenAlt.findIndex((z) => z.replace(/\s+$/, "") === KAPITEL);
    const ende = kopf < 0 ? -1 : zeilenAlt.findIndex((z, j) => j > kopf && z.startsWith(MEINE));
    const von = kopf + 1, bis = ende < 0 ? zeilenAlt.length : ende;
    const vorher = kapitelLesen(alt || "").filter((k) => kopf < 0 || (k.zeile >= von && k.zeile < bis));
    const vergeben = new Set();
    const paare = e.kapitel.map((k) => { const z = zeileLesen(`${k.nr} ${k.titel}`); return partner(vorher, z.nr, z.titel, vergeben); });
    const bekannt = new Set(frueher || []);
    const ausListe = (k) => vergeben.has(k) || bekannt.has(zeilenHash(k.nr, k.titel));
    const unterAlt = vorher.filter(ausListe);
    const fm = ["---", "typ: lernplan", `code: ${e.code}`, `herkunft: ${herkunft || "zentral"}`, `semester: ${JSON.stringify(e.semester)}`];
    if (e.quelle) fm.push(`quelle: ${JSON.stringify(e.quelle)}`);
    if (e.stand) fm.push(`stand: ${e.stand}`);
    if (e.vorlaeufig) fm.push("vorlaeufig: true");
    fm.push(...eigeneFelder(alt), "cssclasses:", "  - eba", "  - eba-s-lernplan-notiz", "---");
    const haken = (x) => (x && x.fertig ? "[x]" : "[ ]");
    const T = e.kapitel.map((k, j) => (k.teile || []).map((t) => {
      const z = zeileLesen(`${t.nr} ${t.titel}`), eltern = paare[j] ? paare[j].teile : [];
      return partner(eltern.concat(...unterAlt.filter((x) => x !== paare[j]).map((x) => x.teile)), z.nr, z.titel, vergeben);
    }));
    const eigenes = kopf < 0 ? { vor: [], nach: new Map() } : eigenesLesen(zeilenAlt, von, bis, vorher, ausListe);
    const zeilen = [];
    // Eigene Zeilen wie gefunden, ohne Leerzeilen am Ende; nach Text eine Leerzeile vor dem nächsten Kapitel
    const eigeneDazu = (g) => {
      const z = g.slice();
      while (z.length && !z[z.length - 1].trim()) z.pop();
      zeilen.push(...z);
      if (z.length && !/^\s/.test(z[z.length - 1])) zeilen.push("");
    };
    eigeneDazu(eigenes.vor);
    e.kapitel.forEach((k, j) => {
      const teile = [`${k.nr} ${k.titel}`];
      const ziel = ziele && ziele[j] && LINK_OK.test(ziele[j]) ? ziele[j] : "";
      if (k.url) teile.push(`[online](${k.url})`);
      if (ziel) teile.push(`[[${ziel}|Folien]]`);
      else if (k.folien != null && k.folien !== nrZahl(k.nr)) teile.push(`Folien ${k.folien}`);
      if (k.seiten) teile.push(`${k.seiten} S.`);
      if (k.vorlesung) teile.push(`Vorlesung ${deVon(k.vorlesung)}`);
      if (k.zwischentest) teile.push(`Zwischentest ${deVon(k.zwischentest)}`);
      if (e.altklausuren && k.in_altklausuren != null) teile.push(`in ${k.in_altklausuren} von ${e.altklausuren} Altklausuren`);
      zeilen.push(`- ${haken(paare[j])} ${teile.join(" · ")}`);
      (k.teile || []).forEach((t, n) => zeilen.push(`  - ${haken(T[j][n])} ${t.nr} ${t.titel}`));
      if (paare[j] && eigenes.nach.has(paare[j])) { eigeneDazu(eigenes.nach.get(paare[j])); eigenes.nach.delete(paare[j]); }
    });
    // Eigenes hinter einem Kapitel, das es nicht mehr gibt: ans Ende
    for (const rest of eigenes.nach.values()) { zeilen.push(""); eigeneDazu(rest); }
    // Leerzeilen: höchstens eine am Stück, keine am Anfang und am Ende
    const abschnitt = [];
    for (const z of zeilen) if (z.trim() || (abschnitt.length && abschnitt[abschnitt.length - 1])) abschnitt.push(z.trim() ? z : "");
    while (abschnitt.length && !abschnitt[abschnitt.length - 1]) abschnitt.pop();
    const i = String(alt || "").indexOf("\n" + MEINE);
    const meine = i >= 0 ? String(alt).slice(i + 1).replace(/\s+$/, "") : MEINE;
    return fm.join("\n") + "\n\n"
      + `<div class="eba-kopf">\n<h1>${e.code} Lernplan</h1>\n</div>\n\n`
      + "```eba-lernplan modul\nDer Stand erscheint, sobald Studium Autopilot läuft.\n```\n\n"
      + KAPITEL + "\n\n" + abschnitt.join("\n") + "\n\n" + meine + "\n";
  };
  // Je Kapitel eines Eintrags der Name der Folien-Notiz, auf die die Zeile zeigt (folienZuordnen), oder ""
  const zieleVon = (e) => folienZuordnen(e.kapitel, folienSammeln(e.code)).map((x) => (x ? x.f.basename : ""));
  // Welche Einträge zählen: Semester = das laufende, das Modul ist dran (imSemester) und nicht bestanden oder anerkannt
  const zentralAuswahl = (eintraege, D, semesterName) => eintraege.filter((e) => {
    if (e.semester !== semesterName) return false;
    const m = D.module.find((x) => x.code === e.code);
    if (!m || FERTIG.indexOf(m.status) >= 0) return false;
    return imSemester(m, e.semester);
  });
  // Was geschrieben ist, steht im Tresor in der Sperr-Datei der Quelle (zentral: abruf.json, Server: server-abruf.json; je ein
  // Schreiber), Feld „lernplan“: { angewendet: Code → kurzHash der Liste, zeilen: Code → listeZeilen, ziele: Code → kurzHash der
  // Folien-Links }. So weiß jeder Abrufer (auch nach einem Wechsel PC ↔ iPad) dasselbe: Bei gleicher Liste und gleichen Folien
  // bleibt die Notiz, wie sie ist, und eine gelöschte Notiz entsteht erst wieder, wenn sich ihre Liste ändert.
  const STAND = "System/Daten/abruf.json";
  const SERVER_STAND = "System/Daten/server-abruf.json";
  const GEMERKT = "eba-lernplan-zentral";
  const KOPIE = "eba-lernplan-angewendet";
  const standForm = (x) => {
    const o = x && typeof x === "object" && !Array.isArray(x) ? x : {};
    const map = (m) => Object.assign({}, m && typeof m === "object" && !Array.isArray(m) ? m : {});
    return { angewendet: map(o.angewendet), zeilen: map(o.zeilen), ziele: map(o.ziele) };
  };
  // Feld „lernplan“ einer Sperr-Datei ({ angewendet, zeilen, ziele }, leer, wenn es fehlt); null, wenn die Datei fehlt oder unlesbar ist
  const standLesen = async (pfad) => {
    const f = app.vault.getAbstractFileByPath(pfad);
    if (!f) return null;
    try {
      const o = JSON.parse(await app.vault.read(f));
      return o && typeof o === "object" && !Array.isArray(o) ? standForm(o.lernplan) : null;
    } catch (e) { return null; }
  };
  // Nur das Feld „lernplan“ neu, alles andere (Sperre, Grabsteine der Termine) bleibt; false, wenn nichts geschrieben wurde
  const standSchreiben = async (pfad, lernplan) => {
    const f = app.vault.getAbstractFileByPath(pfad);
    let ok = false;
    if (f) await app.vault.process(f, (text) => {
      let o = null;
      try { o = JSON.parse(text); } catch (e) { o = null; }
      if (!o || typeof o !== "object" || Array.isArray(o)) return text;
      o.lernplan = lernplan; ok = true;
      return JSON.stringify(o, null, 1) + "\n";
    });
    return ok;
  };
  const ordnerAnlegen = async () => { if (!app.vault.getAbstractFileByPath(ORDNER.slice(0, -1))) await app.vault.createFolder(ORDNER.slice(0, -1)).catch(() => {}); };
  // Eine Notiz nach einem Eintrag: anlegen (außer du hast sie gelöscht und die Liste ist dieselbe), sonst neu schreiben, wenn sich
  // Liste oder Folien geändert haben. Notizen anderer Herkunft bleiben; nur die zentrale Liste übernimmt eine vom Server
  // (frueherServer = deren listeZeilen). s = Stand der Quelle, wird nachgeführt. → true, wenn geschrieben
  const notizAbgleichen = async (e, s, herkunft, frueherServer) => {
    const Q = ctx.user.quellen;
    const pfad = `${ORDNER}${e.code} Lernplan.md`, h = Q.kurzHash(e), ziele = zieleVon(e), zh = Q.kurzHash(ziele);
    const f = app.vault.getAbstractFileByPath(pfad);
    let geschrieben = false;
    if (!f) {
      if (Q.geloescht(s.angewendet, e.code, h)) return false; // von dir gelöscht, Liste unverändert
      // Derselbe Name in anderer Groß- und Kleinschreibung oder Unicode-Form (ctx.zentral.existiert): nicht daneben anlegen
      if (ctx.zentral && ctx.zentral.existiert && ctx.zentral.existiert(pfad)) return false;
      await app.vault.create(pfad, zentralNotiz(e, "", null, ziele, herkunft));
      geschrieben = true;
    } else {
      const her = fmVon(f).herkunft, uebernahme = herkunft === "zentral" && her === "server";
      if (her !== herkunft && !uebernahme) return false;
      if (uebernahme || s.angewendet[e.code] !== h || s.ziele[e.code] !== zh) {
        const frueher = uebernahme ? frueherServer : s.zeilen[e.code];
        const alt = await app.vault.read(f);
        if (zentralNotiz(e, alt, frueher, ziele, herkunft) !== alt) {
          await app.vault.process(f, (x) => zentralNotiz(e, x, frueher, ziele, herkunft));
          geschrieben = true;
        }
      }
    }
    s.angewendet[e.code] = h; s.zeilen[e.code] = listeZeilen(e); s.ziele[e.code] = zh;
    return geschrieben;
  };
  // Nur die (Unter-)Kapitel einer Notiz, die aus der zuletzt geschriebenen Liste stammen (zeilen = listeZeilen dieser Liste, etwa aus
  // serverStand()); ohne zeilen alle. Für server.js: Nach einer Neueinrichtung bekommt der Server seine Listen aus den Notizen zurück,
  // eigene Aufgaben mit Nummer vorn („3 Altklausuren rechnen“) gehen dabei nicht als Kapitel mit.
  const listeLesen = (text, zeilen) => {
    const K = kapitelLesen(text);
    if (!Array.isArray(zeilen)) return K;
    const z = new Set(zeilen), drin = (k) => z.has(zeilenHash(k.nr, k.titel));
    return K.filter(drin).map((k) => Object.assign({}, k, { teile: k.teile.filter(drin) }));
  };
  // Stand der Listen des eigenen Servers ({ angewendet, zeilen, ziele } aus server-abruf.json) oder null
  const serverStand = () => standLesen(SERVER_STAND);
  // Läufe nacheinander (zentral und Server schreiben in denselben Ordner)
  let kette = Promise.resolve();
  const einzeln = (fn) => { const p = kette.then(fn, fn); kette = p.catch(() => {}); return p; };

  // Notizen aus den zentralen Listen: nur auf dem Abrufer (ctx.zentral.abruferHier, ein Schreiber wie bei den Terminen). Jedes
  // Gerät hebt eine Kopie des Stands auf (KOPIE, wie eba-zentral-angewendet): Fehlt das Feld (Datei eben neu angelegt, Sync noch
  // nicht da), gilt sie statt eines leeren Stands; fehlt die Datei oder ist sie unlesbar, schreibt der Lauf nichts. Bis 24.10.2026
  // stand das nur gerätelokal (eba-lernplan-zentral); das wird einmal übernommen.
  const zentralLauf = async (daten) => {
    const Z = ctx.zentral, Q = ctx.user.quellen;
    if (!(await Z.abruferHier())) return;
    const D = ctx.modell.daten(), heute = heuteIso(), sem = ctx.modell.semesterFuer(heute);
    if (!sem) return;
    const gelesen = await standLesen(STAND);
    if (!gelesen) return; // ohne lesbaren Stand nichts schreiben, sonst kämen gelöschte Notizen zurück
    const kopie = standForm(app.loadLocalStorage(KOPIE));
    const s = { angewendet: Object.assign(kopie.angewendet, gelesen.angewendet), zeilen: Object.assign(kopie.zeilen, gelesen.zeilen),
      ziele: Object.assign(kopie.ziele, gelesen.ziele) };
    const vorher = JSON.stringify(gelesen);
    const lokalAlt = app.loadLocalStorage(GEMERKT) || null;
    const server = (await standLesen(SERVER_STAND)) || standForm(null);
    await ordnerAnlegen();
    for (const e of zentralAuswahl(daten.module, D, sem.name)) {
      // Übergang: Was dieses Gerät früher mit derselben Liste geschrieben hat, gilt als angewendet; die alte Liste sagt, welche
      // Aufgaben der Notiz aus ihr stammen
      let alteListe = null;
      try { alteListe = lokalAlt && lokalAlt[e.code] ? JSON.parse(lokalAlt[e.code]) : null; } catch (x) { alteListe = null; }
      if (!Object.prototype.hasOwnProperty.call(s.angewendet, e.code) && lokalAlt && lokalAlt[e.code] === JSON.stringify(e)) s.angewendet[e.code] = Q.kurzHash(e);
      if (!s.zeilen[e.code] && alteListe && Array.isArray(alteListe.kapitel)) s.zeilen[e.code] = listeZeilen(alteListe);
      await notizAbgleichen(e, s, "zentral", server.zeilen[e.code]);
    }
    app.saveLocalStorage(KOPIE, s);
    const gemerkt = JSON.stringify(s) === vorher || (await standSchreiben(STAND, s));
    if (gemerkt && lokalAlt) app.saveLocalStorage(GEMERKT, null);
  };
  let gleicht = false;
  const zentralAbgleichen = async () => {
    const Z = ctx.zentral, Q = ctx.user && ctx.user.quellen;
    if (gleicht || !Z || !Z.kapitel || !Q || !ctx.modell || !ctx.modell.daten) return;
    const daten = Z.kapitel();
    if (!daten || !daten.module.length) return;
    gleicht = true;
    try { await einzeln(() => zentralLauf(daten)); } catch (err) { console.error("Lernplan aus den Kapitellisten", err); } finally { gleicht = false; }
  };

  // Listen des eigenen Servers (server.js, Eingang „kapitel“, Form wie kapitel.json): geprüft wie die zentralen
  // (ctx.zentral.kapitelPruefen), Notizen mit herkunft: server nur für Module des laufenden Semesters ohne zentrale Liste. Aufruf nur
  // auf dem Gerät, das den Eingang übernimmt (Abrufer des Servers); der Stand steht in dessen Sperr-Datei.
  // → { geschrieben, verworfen: [{ id, grund }] }
  const serverListen = async (module) => {
    const aus = { geschrieben: 0, verworfen: [] };
    const Z = ctx.zentral, Q = ctx.user && ctx.user.quellen;
    if (!Z || !Z.kapitelPruefen || !Q || !ctx.modell || !ctx.modell.daten) return aus;
    const g = Z.kapitelPruefen({ schema: 1, module: Array.isArray(module) ? module : [] });
    if (g.fehler) { aus.verworfen.push({ id: "kapitel", grund: g.fehler }); return aus; }
    aus.verworfen = g.verworfen.slice();
    await einzeln(async () => {
      const D = ctx.modell.daten(), sem = ctx.modell.semesterFuer(heuteIso());
      if (!sem) return;
      const s = await standLesen(SERVER_STAND);
      if (!s) return;
      const vorher = JSON.stringify(s);
      const zentral = Z.kapitel ? Z.kapitel() : null;
      const zentralCodes = new Set(zentral ? zentralAuswahl(zentral.module, D, sem.name).map((e) => e.code) : []);
      await ordnerAnlegen();
      for (const e of zentralAuswahl(g.module, D, sem.name)) {
        if (zentralCodes.has(e.code)) { aus.verworfen.push({ id: `${e.code} ${e.semester}`, grund: "zentrale Liste" }); continue; }
        if (await notizAbgleichen(e, s, "server")) aus.geschrieben++;
      }
      if (JSON.stringify(s) !== vorher) await standSchreiben(SERVER_STAND, s);
    });
    return aus;
  };

  let block = null;
  const neuZeichnen = () => { if (block) block.neu(); };
  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      const art = ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, SPRACHE, ["modul", "woche"], "") : "";
      zeichnen(el, c, art, neuZeichnen).catch((e) => { console.error(SPRACHE, e); el.empty(); el.setText(String(quelle)); });
    });
    const bald = ctx.entprellen(neuZeichnen, 600);
    // Neue Kapitellisten (zentral.js meldet sich über ctx.lernplanAnzeige) und neue Folien (Links in den Notizen): abgleichen
    const abgleichBald = ctx.entprellen(() => { zentralAbgleichen(); }, 2000);
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => {
      if (!relevant(f.path)) return;
      bald();
      const fm = cache && cache.frontmatter;
      if (fm && fm.typ === "unterlage" && fm.art === "Folien") abgleichBald();
    });
    ctx.an(app.vault, "delete", (f) => { if (relevant(f.path)) bald(); });
    ctx.an(app.vault, "rename", (f, alt) => { if (relevant(f.path) || relevant(alt)) bald(); });
    // Fachmodell: Das Plugin startet die Erweiterungen alphabetisch, modell.js also erst nach lernplan.js; fehlt ctx.modell
    // noch, meldet sich der Lernplan kurz danach an (wie dashboard.js)
    const abo = () => { if (!ctx.modell || !ctx.modell.beiAenderung) return false; ctx.aufraeumen(ctx.modell.beiAenderung(bald)); return true; };
    if (!abo()) ctx.zeit(abo, 3000);
    // Neuer Tag: Wochenziele und Stand rücken weiter; im neuen Semester (oder nach einer Änderung deines Plans) fehlen Notizen
    const tag = ctx.bleibend("tag", () => ({ wert: heuteIso() }));
    ctx.intervall(() => { const h = heuteIso(); if (h !== tag.wert) { tag.wert = h; neuZeichnen(); abgleichBald(); } }, 5 * 60 * 1000);
    ctx.lernplanAnzeige = { neu: abgleichBald };
    ctx.an(app.workspace, "resize", () => document.querySelectorAll(".eba-lp-plan-woche").forEach(haftenPruefen));
    ctx.aufraeumen(() => { if (ctx.lernplanAnzeige && ctx.lernplanAnzeige.neu === abgleichBald) ctx.lernplanAnzeige = null; });
  };

  // Einmal beim App-Start: unveränderte Listen holt zentral.js nicht neu, also hier einmal abgleichen (fehlende Notizen eines neuen
  // Semesters), nachdem Fachmodell und zentrale Daten bereit sind
  const start = () => { ctx.zeit(() => { zentralAbgleichen(); }, 45000); };

  const api = { kapitelLesen, gewichte, planen, zielVon, stand, kapazitaet, sichtbar, zentralNotiz, zentralAuswahl, listeZeilen, nichtMehrDran,
    folienVon, anteilAusZielnote, faktorenLesen, nachVorlesung, altklausurPlan, altersSchluessel, planBild, modulZeile, serverListen,
    listeLesen, serverStand, kapitelStand, vorlernenSetzen, sollHeute, heldDaten, heldText, ANTEILE, anteilWahl, zielBei, zielVorschau, zielTeile, modulFarben,
    planSemester, spaeterSemester, terminWahl, terminText, bisText, leisteFenster, ungeprueft, warnungTeile,
    ZEIT_FAKTOR, relevanzStufe, zeitStufe, zeitWahlLesen, zeitSetzen, zeitAnSetzen, zeitSatz,
    TAG_VORGABE, tageszeitLesen, tagIndex, minutenVon, dauerText, kandidatenVon, heuteFuellen, luecken, aufgabeKurz };
  ctx.lernplan = api;
  return Object.assign({ registrieren, start, zentralAbgleichen }, api);
};
