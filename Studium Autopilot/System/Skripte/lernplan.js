// Lernplan (seit 18.10.2026): Bereich „Lernplan“ (Codeblock ```eba-lernplan``` auf Studium/Lernplan.md) und die Zeile oben in
// jeder Lernplan-Notiz (```eba-lernplan modul```). Regel „70/100“: Nach 70 % der Zeit von Vorlesungsbeginn bis zur Klausur ist der
// ganze Stoff verstanden (nicht beherrscht), danach bleibt die Zeit für die Klausurvorbereitung (Übungen, Altklausuren, Karteikarten).
// Kapitel: Notizen unter Lernplan/ (typ: lernplan, code), je Modul eine, „<Code> Lernplan“. Quellen: die zentralen Kapitellisten
// (kapitel.json, zentral.js holt sie gerätelokal; dieses Skript schreibt daraus die Notizen mit herkunft: zentral, nur auf dem
// Abrufer, nur für Module des laufenden Semesters, Häkchen und Eigenes bleiben) oder eine eigene KI (andere herkunft,
// nie überschrieben). Gibt es keine Notiz, fehlt der Lernplan in der Übersicht (sichtbar()). Ist ein Lernplan nicht mehr dran (Modul
// bestanden oder anerkannt, Notiz für ein anderes Semester, Modul liegt jetzt anderswo), steht er ohne Plan am Ende (nichtMehrDran).
// Je Kapitel eine Aufgabe `- [ ] <Nummer> <Titel>`, danach mit „ · “ getrennt Links auf die Unterlage (`[[B110 Folien 01 …]]`), die
// Nummer der Folien (`Folien 1`, wenn sie von der Kapitelnummer abweicht) und die Seitenzahl (`118 S.`); eingerückte Aufgaben
// darunter sind Unterkapitel. Abgehakt = verstanden (bei Unterkapiteln anteilig).
// Gewicht eines Kapitels = Seiten (Angabe in der Zeile, sonst Feld `seiten` der verlinkten oder gleich nummerierten Folien, sonst
// der Mittelwert); „da“ = eine verlinkte Datei oder Folien mit dieser Nummer existieren. Wochen: Montag bis Freitag ohne Pausen und
// freie Tage aus dem Datenmodell, eine Woche ganz in einer Pause zählt 30 %. Jedes Kapitel bekommt die Woche, in der der Plan es
// erreicht (gleicher Aufwand je Woche); Stand je Modul: im Plan, voraus, hinterher, wartet (fällige Kapitel noch nicht hochgeladen),
// Klausurvorbereitung, vorbei. Klausur: die eine Regel des Datenmodells (ctx.modell.pruefungVon), ohne Prüfungstermin der Beginn
// der nächsten Prüfungsphase (geschätzt), damit der Plan ein Ende hat. Beginn: Vorlesungsbeginn, frühestens `seit`.
// Frontmatter der Notiz (optional): `seit` (Plan beginnt in dieser Woche), `verstanden_bis` (Ziel statt 70 %), `vorlaeufig: true`
// (Kapitelliste teils geschätzt, z. B. Lehrbuch-Einheiten, die die Vorlesung erst nach und nach nennt). Ein https-Link in der Zeile
// (frei zugängliches Lehrbuch) macht ein Kapitel „da“; ohne Seiten im ganzen Modul zählt die Zahl der Unterkapitel als Gewicht.
// Schreibt nur beim Tipp auf ein Kapitel: genau diese Zeile `- [ ]` ↔ `- [x]`, nur wenn ihr Text noch stimmt (wie todos.js).
// Für andere Skripte und Tests: ctx.lernplan = { kapitelLesen, gewichte, planen, zielVon, stand, kapazitaet, sichtbar }.
// Stil: eba-core.css Abschnitt 61, Klassen eba-lp-*; Zeilen wie die Verbindungen (.eba-vb-liste).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone. Fehler → Ersatztext des Blocks.
module.exports = function (ctx) {
  const app = window.app;
  const SPRACHE = "eba-lernplan";
  const ORDNER = "Lernplan/";
  const ANTEIL = 0.7;
  const MIN_KAPAZITAET = 0.3;
  const EPS = 1e-6;
  const WTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const s10 = (v) => { const m = String(v == null ? "" : v).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ""; };
  const tagObj = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const isoVon = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const plusTage = (s, n) => { const d = tagObj(s); d.setDate(d.getDate() + n); return isoVon(d); };
  const montagVon = (s) => { const d = tagObj(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoVon(d); };
  const tageZwischen = (a, b) => Math.round((tagObj(b) - tagObj(a)) / 864e5);
  const tm = (s) => `${+s.slice(8, 10)}.${+s.slice(5, 7)}.`;
  const wtm = (s) => `${WTAG[tagObj(s).getDay()]} ${tm(s)}`;
  const heuteIso = () => isoVon(ctx.date.jetzt());

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
  const ROEMISCH = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  const roemisch = (s) => {
    let n = 0;
    for (let i = 0; i < s.length; i++) { const a = ROEMISCH[s[i]], b = ROEMISCH[s[i + 1]] || 0; n += a < b ? -a : a; }
    return n;
  };
  // Nummer als Zahl (für den Abgleich mit dem Feld `nummer` der Folien): 3 → 3, IV → 4, sonst null (E, 1.2)
  const nrZahl = (nr) => (/^\d+$/.test(nr) ? +nr : /^[IVXLC]+$/.test(nr) ? roemisch(nr) : null);
  // Text einer Kapitelzeile ohne Häkchen: „1 Grundlagen · [[B110 Folien 01 Grundlagen]] · 42 S.“ → Nummer, Titel, Links, Seiten;
  // web = https-Links (`[online](https://…)`, z. B. ein frei zugängliches Lehrbuch): Das Kapitel ist dann da.
  const zeileLesen = (rest) => {
    const teile = rest.replace(/\s+\^[A-Za-z0-9-]+$/, "").split(" · ");
    const kopf = teile.shift().trim();
    const m = kopf.match(NUMMER);
    const nr = m && nummerOk(m[1]) ? m[1] : "";
    const links = [], web = [];
    let seiten = null, folien = null;
    for (const t of teile) {
      const s = t.trim().match(SEITEN);
      if (s) { seiten = +s[1]; continue; }
      const f = t.trim().match(FOLIEN);
      if (f) { folien = +f[1]; continue; }
      let l;
      LINK.lastIndex = 0;
      while ((l = LINK.exec(t))) links.push(l[1].trim());
      WEB.lastIndex = 0;
      while ((l = WEB.exec(t))) web.push(l[1]);
    }
    const titel = (nr ? m[2] : kopf).replace(LINK, (_, z, a) => a || z).trim();
    return { nr, titel, links, web, seiten, folien };
  };
  // Markdown einer Lernplan-Notiz → [{ zeile, roh, nr, titel, fertig, links, seiten, teile: [{ zeile, roh, nr, titel, fertig }] }]
  // Nur Aufgaben außerhalb von Frontmatter und Codeblöcken; ohne Einrückung = Kapitel, eingerückt = Unterkapitel des letzten.
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
  // ganz frei → 30 %
  const kapazitaet = (mo, pausen, freie) => {
    const frei = new Set((freie || []).map((t) => s10(t && t.datum ? t.datum : t)));
    let n = 0;
    for (let i = 0; i < 5; i++) {
      const d = plusTage(mo, i);
      if (!frei.has(d) && !(pausen || []).some((p) => p.von <= d && d <= p.bis)) n++;
    }
    return Math.max(MIN_KAPAZITAET, n / 5);
  };
  // „Alles verstanden bis“: Sonntag der Woche, in der anteil (70 %) der Zeit von beginn bis klausur vorbei ist, höchstens der
  // Sonntag vor der Klausurwoche
  const zielVon = (beginn, klausur, anteil) => {
    const a = anteil == null ? ANTEIL : anteil;
    const tag = plusTage(beginn, Math.round(tageZwischen(beginn, klausur) * a));
    const so = plusTage(montagVon(tag), 6), spaetestens = plusTage(montagVon(klausur), -1);
    return so < spaetestens ? so : spaetestens;
  };
  // kapitel: [{ gewicht, anteil (0–1), da }], Daten als ISO. Gleicher Aufwand je Woche: Bis Ende der Woche w ist der Anteil der
  // Kapazität bis w am gesamten Gewicht fällig. → { wochen: [{ mo, kap, soll }], faellig: [ISO-Sonntag je Kapitel], gesamt, ist, w }
  // (w = Index der Woche von heute, -1 davor, wochen.length danach)
  const planen = ({ kapitel, beginn, ziel, heute, pausen, freie }) => {
    const wochen = [];
    const ende = montagVon(ziel);
    for (let mo = montagVon(beginn); mo <= ende; mo = plusTage(mo, 7)) wochen.push({ mo, kap: kapazitaet(mo, pausen, freie), soll: 0 });
    if (!wochen.length) wochen.push({ mo: ende, kap: 1, soll: 0 });
    const gesamt = kapitel.reduce((s, k) => s + k.gewicht, 0);
    const kapSumme = wochen.reduce((s, x) => s + x.kap, 0);
    let lauf = 0;
    for (const x of wochen) { lauf += x.kap; x.soll = gesamt * lauf / kapSumme; }
    let kum = 0;
    const faellig = kapitel.map((k) => {
      kum += k.gewicht;
      const x = wochen.find((y) => y.soll >= kum - EPS) || wochen[wochen.length - 1];
      return plusTage(x.mo, 6);
    });
    const mo = montagVon(heute);
    const w = mo < wochen[0].mo ? -1 : mo > wochen[wochen.length - 1].mo ? wochen.length : wochen.findIndex((x) => x.mo === mo);
    const ist = kapitel.reduce((s, k) => s + k.gewicht * k.anteil, 0);
    return { wochen, faellig, gesamt, ist, w };
  };
  // Stand eines Moduls heute: { art, pille: { art, text } | null, woche: [Index der Kapitel bis Sonntag], naechstes: Index | -1 }
  // Pillen nach docs/design.md (Farbe = Bedeutung): ok erledigt/voraus, warn offen mit Datum, info wartet auf die Vorlesung,
  // leer neutral; „im Plan“ ist der ruhige Normalfall ohne Pille.
  // art: vorbei | vorbereitung | fertig | hinterher | wartet | voraus | plan
  const stand = ({ kapitel, plan, heute, ziel, klausur }) => {
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
      const fehlt = ueberfaellig.filter((i) => !kapitel[i].da);
      if (fehlt.length === ueberfaellig.length) return { art: "wartet", pille: { art: "info", text: `wartet auf Kapitel ${kapitel[fehlt[0]].nr || fehlt[0] + 1}` }, woche, naechstes };
      const n = ueberfaellig.length - fehlt.length;
      return { art: "hinterher", pille: { art: "warn", text: n === 1 ? "1 Kapitel hinterher" : `${n} Kapitel hinterher` }, woche, naechstes };
    }
    const voraus = kapitel.filter((k, i) => k.anteil >= 1 - EPS && plan.faellig[i] > so).length;
    if (voraus) return { art: "voraus", pille: { art: "ok", text: voraus === 1 ? "1 Kapitel voraus" : `${voraus} Kapitel voraus` }, woche, naechstes };
    return { art: "plan", pille: null, woche, naechstes };
  };

  // ---------- Daten aus dem Tresor ----------
  const fmVon = (f) => (f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter) || {};
  const codeVon = (f) => String(fmVon(f).code || f.basename.split(" ")[0]).trim();
  const lernplaene = () => app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(ORDNER) && fmVon(f).typ === "lernplan")
    .sort((a, b) => codeVon(a).localeCompare(codeVon(b), "de"));
  const sichtbar = () => app.vault.getMarkdownFiles().some((f) => f.path.startsWith(ORDNER) && fmVon(f).typ === "lernplan");

  // Klausur eines Moduls: ctx.modell.pruefungVon (eine Regel für alle Seiten); ohne Prüfungstermin der Beginn der nächsten
  // Prüfungsphase (geschätzt)
  const klausurVon = (D, code, heute) => {
    const p = ctx.modell.pruefungVon(code, { heute });
    if (p) return { datum: p.datum, geschaetzt: !!p.geschaetzt, f: p.f || null };
    const phase = D.pruefungsphasen.filter((x) => x.bis >= heute).sort((x, y) => (x.von < y.von ? -1 : 1))[0];
    return phase ? { datum: phase.von, geschaetzt: true, f: null } : null;
  };
  // Folien eines Moduls je Nummer: { nummer: { f, seiten } } (erste Datei je Nummer, Varianten „mit Anmerkungen“ zählen nicht)
  const folienVon = (code) => {
    const aus = {};
    for (const f of app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith("Unterlagen/")) continue;
      const fm = fmVon(f);
      if (fm.typ !== "unterlage" || String(fm.code || "").trim() !== code || fm.art !== "Folien") continue;
      const n = parseInt(fm.nummer, 10);
      if (!isFinite(n) || /anmerkung|video|unbeschrieben/i.test(f.basename)) continue;
      // Neue Fassung daneben (ilias.js, „<Name> neue Fassung JJJJ-MM-TT“, deine Datei hatte Anmerkungen): Der Plan rechnet mit der
      // neuesten und verlinkt sie; ihre Notiz zeigt auf deine bearbeitete (fassung.js)
      const fassung = ctx.user.fassung.fassungVon(f.basename);
      if (!aus[n] || ctx.user.fassung.fassungFolge(fassung, aus[n].fassung) > 0) aus[n] = { f, seiten: parseInt(fm.seiten, 10) || null, fassung };
    }
    return aus;
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

  // Alles für einen Lernplan: Kapitel mit Gewicht und „da“, Klausur, Ziel, Plan, Stand. Ein Lernplan, der nicht mehr dran ist, hat
  // keinen Plan (aus = Grund, Stand „nicht mehr dran“).
  const sammeln = async (f, D, heute) => {
    const text = await app.vault.cachedRead(f);
    const fm = fmVon(f), code = codeVon(f);
    const modul = D.module.find((m) => m.code === code) || null;
    const basis = { f, code, modul, vorlaeufig: fm.vorlaeufig === true };
    const roh = kapitelLesen(text);
    if (!roh.length) return Object.assign(basis, { kapitel: [], fehlt: "keine Kapitel" });
    const folien = folienVon(code);
    const kapitel = roh.map((k) => {
      const ziele = k.links.map((l) => app.metadataCache.getFirstLinkpathDest(l, f.path)).filter(Boolean);
      const n = k.folien != null ? k.folien : nrZahl(k.nr);
      const fol = n != null ? folien[n] : null;
      const verlinkt = ziele.map((z) => parseInt(fmVon(z).seiten, 10)).filter((x) => x > 0)[0] || null;
      return Object.assign({}, k, { anteil: anteilVon(k), da: ziele.length > 0 || k.web.length > 0 || !!fol,
        seitenWert: k.seiten || verlinkt || (fol && fol.seiten) || null, ziel: ziele[0] || (fol && fol.f) || null, webZiel: k.web[0] || null });
    });
    gewichte(kapitel).forEach((g, i) => { kapitel[i].gewicht = g; });
    // Beginn: das laufende Semester (eine Notiz für ein anderes Semester sortiert nichtMehrDran aus)
    const sem = ctx.modell.semesterFuer(heute);
    const aus = nichtMehrDran(fm, modul, sem && sem.name);
    if (aus) return Object.assign(basis, { kapitel, aus, stand: AUS });
    const kl = klausurVon(D, code, heute);
    if (!kl) return Object.assign(basis, { kapitel, fehlt: "keine Klausur" });
    const vb = (sem && sem.vb) || heute;
    const seit = s10(fm.seit);
    const beginn = seit && seit > vb ? seit : vb;
    const ziel = s10(fm.verstanden_bis) || zielVon(beginn, kl.datum);
    const plan = planen({ kapitel, beginn, ziel, heute, pausen: D.pausen, freie: D.freieTage });
    return Object.assign(basis, { kapitel, klausur: kl, ziel, plan, stand: stand({ kapitel, plan, heute, ziel, klausur: kl.datum }) });
  };

  // ---------- Schreiben: ein Kapitel abhaken oder zurücknehmen ----------
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

  // ---------- Zeichnen ----------
  const auf = ctx.bleibend("auf", () => ({}));
  const nurStoppen = (knoten) => knoten.addEventListener("mousedown", (e) => e.stopPropagation()); // Live Preview: nicht in den Quelltext
  const oeffnen = (f, e, quelle) => { e.preventDefault(); e.stopPropagation(); ctx.oeffnen(f, { quelle: quelle || "", neu: e.ctrlKey || e.metaKey }); };

  const kapitelName = (k, i) => (k.nr ? `Kapitel ${k.nr}` : `Kapitel ${i + 1}`);
  const namenListe = (P, idx) => {
    const n = idx.map((i) => P.kapitel[i].nr || String(i + 1));
    return n.length === 1 ? `Kapitel ${n[0]}` : `Kapitel ${n.slice(0, -1).join(", ")} und ${n[n.length - 1]}`;
  };
  // Eine Zeile Stand: „2 von 7 · diese Woche Kapitel 3 · verstanden bis So 3.1. · Klausur Sa 6.2.“
  const standText = (P) => {
    if (P.fehlt === "keine Kapitel") return "Noch keine Kapitel eingetragen.";
    const fertig = P.kapitel.filter((k) => k.anteil >= 1 - EPS).length;
    const teile = [`${fertig} von ${P.kapitel.length} Kapiteln${P.vorlaeufig ? " (Liste vorläufig)" : ""}`];
    if (P.aus) { teile.push(P.aus); return teile.join(" · "); }
    if (P.fehlt === "keine Klausur") { teile.push("Datum der Klausur fehlt"); return teile.join(" · "); }
    const S = P.stand;
    if (S.art === "vorbei") teile.push(`Klausur war am ${wtm(P.klausur.datum)}`);
    else {
      if (S.art === "vorbereitung") teile.push(`Klausurvorbereitung seit ${tm(plusTage(P.ziel, 1))}`);
      else if (S.woche.length) teile.push(`diese Woche ${namenListe(P, S.woche)}`);
      else if (S.naechstes >= 0) teile.push(`${kapitelName(P.kapitel[S.naechstes], S.naechstes)} bis ${wtm(P.plan.faellig[S.naechstes])}`);
      if (S.art !== "vorbereitung") teile.push(`verstanden bis ${wtm(P.ziel)}`);
      teile.push(`Klausur ${wtm(P.klausur.datum)}${P.klausur.geschaetzt ? " (geschätzt)" : ""}`);
    }
    return teile.join(" · ");
  };
  const titelVon = (P) => (P.modul ? `${P.code} ${P.modul.titel}` : P.f.basename);

  // Kapitel eines Moduls: Kästchen wie bei den To-dos (.eba-td-haken, ganze Zeilenhöhe als Tippfläche; halb verstanden =
  // unbestimmt), Nummer und Titel, rechts „bis Fr 23.10.“ bzw. „noch nicht da“
  const kapitelZeilen = (el, P, quelle, neu) => {
    const l = el.createDiv({ cls: "eba-lp-kapitel" });
    P.kapitel.forEach((k, i) => {
      const z = l.createDiv({ cls: "eba-lp-k" + (k.anteil >= 1 - EPS ? " is-fertig" : "") });
      const haken = z.createEl("label", { cls: "eba-td-haken" });
      const box = haken.createEl("input", { attr: { type: "checkbox", "aria-label": "Verstanden: " + k.titel } });
      box.checked = k.anteil >= 1 - EPS;
      box.indeterminate = k.anteil > EPS && k.anteil < 1 - EPS;
      nurStoppen(haken);
      haken.addEventListener("click", (e) => e.stopPropagation());
      box.addEventListener("change", async (e) => {
        e.stopPropagation();
        z.toggleClass("is-fertig", box.checked);
        try { await schreiben(P.f, k); } catch (err) { console.error("Lernplan abhaken", err); }
        neu();
      });
      const t = z.createDiv({ cls: "eba-lp-k-text" });
      t.createSpan({ cls: "eba-lp-k-nr", text: k.nr || String(i + 1) });
      const titel = t.createSpan({ cls: "eba-lp-k-titel", text: k.titel });
      if (k.teile.length && k.anteil < 1 - EPS) titel.createSpan({ cls: "eba-lp-k-teil", text: ` ${k.teile.filter((x) => x.fertig).length}/${k.teile.length}` });
      if (k.ziel || k.webZiel) {
        titel.addClass("is-link");
        nurStoppen(titel);
        titel.addEventListener("click", (e) => {
          if (k.ziel) { oeffnen(k.ziel, e, quelle); return; }
          e.preventDefault(); e.stopPropagation(); window.open(k.webZiel);
        });
      }
      const r = z.createSpan({ cls: "eba-lp-k-bis" });
      if (P.plan && k.anteil < 1 - EPS) r.setText(k.da ? `bis ${wtm(P.plan.faellig[i])}` : `bis ${wtm(P.plan.faellig[i])} · noch nicht da`);
    });
  };

  const zeile = (l, P, quelle, neu, aufklappbar) => {
    const z = l.createDiv({ cls: "eba-vb eba-lp-modul" + (aufklappbar ? " is-klappbar" : "") });
    z.setAttr("data-code", P.code);
    const p = P.stand && P.stand.pille;
    const pille = p ? ` <span class="eba-pill ${p.art}">${esc(p.text)}</span>` : "";
    z.innerHTML = `<span class="eba-vb-text"><b>${esc(titelVon(P))}${pille}</b><span class="eba-vb-status"><span class="eba-vb-stand">${esc(standText(P))}</span></span></span>`;
    if (!aufklappbar) return;
    const offen = !!auf[P.code];
    z.toggleClass("is-offen", offen);
    z.setAttr("role", "button"); z.setAttr("tabindex", "0"); z.setAttr("aria-expanded", String(offen));
    const unten = l.createDiv({ cls: "eba-lp-unten" + (offen ? "" : " is-zu") });
    if (P.kapitel.length) kapitelZeilen(unten, P, quelle, neu);
    const fuss = unten.createDiv({ cls: "eba-lp-fuss" });
    const a = fuss.createEl("a", { cls: "internal-link", text: P.f.basename, href: P.f.path, attr: { "data-href": P.f.path } });
    nurStoppen(a);
    a.addEventListener("click", (e) => oeffnen(P.f, e, quelle));
    const klappen = (e) => {
      e.preventDefault(); e.stopPropagation();
      auf[P.code] = !auf[P.code];
      z.toggleClass("is-offen", auf[P.code]); z.setAttr("aria-expanded", String(auf[P.code]));
      unten.toggleClass("is-zu", !auf[P.code]);
    };
    nurStoppen(z);
    z.addEventListener("click", klappen);
    z.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") klappen(e); });
  };

  const LEER = "Noch kein Lernplan für deine Module.";
  // In Entwicklung (seit 19.10.2026): Bereich und Lernplan-Notizen tragen oben einen Warnkasten, der Inhalt ist abgeblendet, bleibt
  // aber bedienbar (eba-core.css Abschnitt 61, .is-entwicklung). Ist der Lernplan fertig: IN_ENTWICKLUNG = false.
  const IN_ENTWICKLUNG = true;
  const ENTWICKLUNG_TITEL = "Noch nicht fertig: Lern nicht danach.";
  const ENTWICKLUNG = "Kapitel, Fristen und Fortschritt können fehlen oder falsch sein, und alles kann sich noch ändern. Plane dein Lernen weiter selbst.";
  const entwicklungHinweis = (el) => {
    if (!IN_ENTWICKLUNG) return;
    el.addClass("is-entwicklung");
    const h = el.createDiv({ cls: "eba-lp-entwicklung", attr: { role: "note" } });
    const kopf = h.createDiv({ cls: "eba-lp-entwicklung-kopf" });
    kopf.createSpan({ cls: "eba-pill warn", text: "In Entwicklung" });
    kopf.createEl("strong", { text: ENTWICKLUNG_TITEL });
    h.createDiv({ text: ENTWICKLUNG });
  };
  const NACH_KLAUSUR = { vorbei: 4, vorbereitung: 1, aus: 5 };
  const zeichnen = async (el, mdCtx, art, neu) => {
    const D = ctx.modell.daten(), heute = heuteIso(), quelle = (mdCtx && mdCtx.sourcePath) || "";
    if (art === "modul") {
      const f = app.vault.getAbstractFileByPath(quelle);
      el.empty(); el.addClass("eba-lp", "eba-lp-eine");
      if (!f || fmVon(f).typ !== "lernplan") { el.setText("Dieser Block gehört in eine Lernplan-Notiz."); return; }
      const P = await sammeln(f, D, heute);
      el.empty();
      entwicklungHinweis(el);
      zeile(el.createDiv({ cls: "eba-vb-liste" }), P, quelle, neu, false);
      return;
    }
    const alle = [];
    for (const f of lernplaene()) alle.push(await sammeln(f, D, heute));
    el.empty(); el.addClass("eba-lp");
    entwicklungHinweis(el);
    if (!alle.length) { el.createDiv({ cls: "eba-lp-leer", text: LEER }); return; }
    // Reihenfolge: was jetzt zu tun ist zuerst, dann nach Klausurdatum; vorbei ans Ende
    const rang = (P) => (P.stand ? NACH_KLAUSUR[P.stand.art] || 0 : 3);
    alle.sort((a, b) => rang(a) - rang(b) || String(a.klausur ? a.klausur.datum : "9").localeCompare(String(b.klausur ? b.klausur.datum : "9")) || a.code.localeCompare(b.code, "de"));
    const l = el.createDiv({ cls: "eba-vb-liste" });
    for (const P of alle) zeile(l, P, quelle, neu, true);
  };

  // ---------- Lernplan-Notizen aus den zentralen Kapitellisten (kapitel.json) ----------
  // Notiztext für einen Eintrag { code, semester, quelle, stand, vorlaeufig, kapitel: [{ nr, titel, seiten, folien, url, teile }] }.
  // alt = bisheriger Text oder "". Häkchen gehen mit dem Titel (ohne Groß-/Kleinschreibung und Satzzeichen; bei gleichem Titel zuerst
  // das mit gleicher Nummer): Ein Kapitel mit neuer Nummer bleibt abgehakt, ein anderes Kapitel unter derselben Nummer erbt das
  // Häkchen nicht (die Liste wird mit jeder Vorlesung berichtigt). Es bleiben auch eigene Eigenschaften (`seit`, `verstanden_bis`,
  // Tags …), eigener Text und eigene Aufgaben unter „## Kapitel“ (hinter dem Kapitel, hinter dem sie standen) und alles unter
  // „## Meine Notizen“. Eine Aufgabe gehört der Liste nur, wenn sie zu einem Kapitel der neuen Liste passt oder in der zuletzt
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
  const zentralNotiz = (e, alt, frueher) => {
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
    const fm = ["---", "typ: lernplan", `code: ${e.code}`, "herkunft: zentral", `semester: ${JSON.stringify(e.semester)}`];
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
      if (k.url) teile.push(`[online](${k.url})`);
      if (k.folien != null && k.folien !== nrZahl(k.nr)) teile.push(`Folien ${k.folien}`);
      if (k.seiten) teile.push(`${k.seiten} S.`);
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
      + '<div class="eba-kopf">\n<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a>'
      + '<a class="internal-link" data-href="Lernplan" href="Lernplan">Lernplan</a></div>\n'
      + `<h1>${e.code} Lernplan</h1>\n</div>\n\n`
      + "```eba-lernplan modul\nDer Stand erscheint, sobald Studium Autopilot läuft.\n```\n\n"
      + KAPITEL + "\n\n" + abschnitt.join("\n") + "\n\n" + meine + "\n";
  };
  // Welche Einträge zählen: Semester = das laufende, das Modul ist dran (imSemester) und nicht bestanden oder anerkannt
  const zentralAuswahl = (eintraege, D, semesterName) => eintraege.filter((e) => {
    if (e.semester !== semesterName) return false;
    const m = D.module.find((x) => x.code === e.code);
    if (!m || FERTIG.indexOf(m.status) >= 0) return false;
    return imSemester(m, e.semester);
  });
  // Notizen schreiben: nur auf dem Abrufer (ctx.zentral.abruferHier, ein Schreiber wie bei den Terminen), nur wenn sich die Liste des
  // Moduls seit dem letzten Schreiben geändert hat; dann bleiben Häkchen und Eigenes (zentralNotiz). Was geschrieben ist, steht wie
  // die Grabsteine der Termine im Tresor (Sperr-Datei des Abrufers, Feld „lernplan“: { angewendet: Code → kurzHash der Liste,
  // zeilen: Code → listeZeilen }), damit jeder Abrufer (auch nach einem Wechsel PC ↔ iPad) dasselbe weiß: Bei gleicher Liste
  // bleibt die Notiz, wie sie ist, und eine gelöschte Notiz entsteht erst wieder, wenn sich ihre Liste ändert. Eine Notiz mit
  // anderer herkunft (eigene KI) bleibt unberührt. Jedes Gerät hebt eine Kopie auf (KOPIE, wie eba-zentral-angewendet): Fehlt das
  // Feld (Datei eben neu angelegt, Sync noch nicht da), gilt sie statt eines leeren Stands; fehlt die Datei oder ist sie unlesbar,
  // schreibt der Lauf nichts. Bis 24.10.2026 stand das nur gerätelokal (eba-lernplan-zentral); das wird einmal übernommen.
  const STAND = "System/Daten/abruf.json";
  const GEMERKT = "eba-lernplan-zentral";
  const KOPIE = "eba-lernplan-angewendet";
  const standForm = (x) => {
    const o = x && typeof x === "object" && !Array.isArray(x) ? x : {};
    const map = (m) => Object.assign({}, m && typeof m === "object" && !Array.isArray(m) ? m : {});
    return { angewendet: map(o.angewendet), zeilen: map(o.zeilen) };
  };
  // Feld „lernplan“ der Sperr-Datei ({ angewendet, zeilen }, leer, wenn es fehlt); null, wenn die Datei fehlt oder unlesbar ist
  const standLesen = async () => {
    const f = app.vault.getAbstractFileByPath(STAND);
    if (!f) return null;
    try {
      const o = JSON.parse(await app.vault.read(f));
      return o && typeof o === "object" && !Array.isArray(o) ? standForm(o.lernplan) : null;
    } catch (e) { return null; }
  };
  // Nur das Feld „lernplan“ neu, alles andere (Sperre, Grabsteine der Termine) bleibt; false, wenn nichts geschrieben wurde
  const standSchreiben = async (lernplan) => {
    const f = app.vault.getAbstractFileByPath(STAND);
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
  let gleicht = false;
  const zentralAbgleichen = async () => {
    const Z = ctx.zentral, Q = ctx.user && ctx.user.quellen;
    if (gleicht || !Z || !Z.kapitel || !Q || !ctx.modell || !ctx.modell.daten) return;
    const daten = Z.kapitel();
    if (!daten || !daten.module.length || !(await Z.abruferHier())) return;
    gleicht = true;
    try {
      const D = ctx.modell.daten(), heute = heuteIso(), sem = ctx.modell.semesterFuer(heute);
      if (!sem) return;
      const gelesen = await standLesen();
      if (!gelesen) return; // ohne lesbaren Stand nichts schreiben, sonst kämen gelöschte Notizen zurück
      const kopie = standForm(app.loadLocalStorage(KOPIE));
      const s = { angewendet: Object.assign(kopie.angewendet, gelesen.angewendet), zeilen: Object.assign(kopie.zeilen, gelesen.zeilen) };
      const vorher = JSON.stringify(gelesen), angewendet = s.angewendet;
      const lokalAlt = app.loadLocalStorage(GEMERKT) || null;
      if (!app.vault.getAbstractFileByPath(ORDNER.slice(0, -1))) await app.vault.createFolder(ORDNER.slice(0, -1)).catch(() => {});
      for (const e of zentralAuswahl(daten.module, D, sem.name)) {
        const pfad = `${ORDNER}${e.code} Lernplan.md`, h = Q.kurzHash(e);
        // Übergang: Was dieses Gerät früher mit derselben Liste geschrieben hat, gilt als angewendet; die alte Liste sagt, welche
        // Aufgaben der Notiz aus ihr stammen
        let alteListe = null;
        try { alteListe = lokalAlt && lokalAlt[e.code] ? JSON.parse(lokalAlt[e.code]) : null; } catch (x) { alteListe = null; }
        if (!Object.prototype.hasOwnProperty.call(angewendet, e.code) && lokalAlt && lokalAlt[e.code] === JSON.stringify(e)) angewendet[e.code] = h;
        const frueher = s.zeilen[e.code] || (alteListe && Array.isArray(alteListe.kapitel) ? listeZeilen(alteListe) : null);
        const f = app.vault.getAbstractFileByPath(pfad);
        if (!f) {
          if (Q.geloescht(angewendet, e.code, h)) continue; // von dir gelöscht, Liste unverändert
          await app.vault.create(pfad, zentralNotiz(e, ""));
        } else {
          if (fmVon(f).herkunft !== "zentral") continue;
          if (angewendet[e.code] !== h) {
            const alt = await app.vault.read(f);
            if (zentralNotiz(e, alt, frueher) !== alt) await app.vault.process(f, (x) => zentralNotiz(e, x, frueher));
          }
        }
        angewendet[e.code] = h;
        s.zeilen[e.code] = listeZeilen(e);
      }
      app.saveLocalStorage(KOPIE, s);
      const gemerkt = JSON.stringify(s) === vorher || (await standSchreiben(s));
      if (gemerkt && lokalAlt) app.saveLocalStorage(GEMERKT, null);
    } catch (err) { console.error("Lernplan aus den Kapitellisten", err); } finally { gleicht = false; }
  };

  let block = null;
  const neuZeichnen = () => { if (block) block.neu(); };
  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      const art = ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, SPRACHE, ["modul"], "") : "";
      zeichnen(el, c, art, neuZeichnen).catch((e) => { console.error(SPRACHE, e); el.empty(); el.setText(String(quelle)); });
    });
    const relevant = (p) => p.startsWith(ORDNER) || p.startsWith("Unterlagen/") || p.startsWith("Termine/") || p.startsWith("Module/");
    const bald = ctx.entprellen(neuZeichnen, 600);
    ctx.an(app.metadataCache, "changed", (f) => { if (relevant(f.path)) bald(); });
    ctx.an(app.vault, "delete", (f) => { if (relevant(f.path)) bald(); });
    ctx.an(app.vault, "rename", (f, alt) => { if (relevant(f.path) || relevant(alt)) bald(); });
    // Fachmodell: Das Plugin startet die Erweiterungen alphabetisch, modell.js also erst nach lernplan.js; fehlt ctx.modell
    // noch, meldet sich der Lernplan kurz danach an (wie dashboard.js)
    const abo = () => { if (!ctx.modell || !ctx.modell.beiAenderung) return false; ctx.aufraeumen(ctx.modell.beiAenderung(bald)); return true; };
    if (!abo()) ctx.zeit(abo, 3000);
    // Neue Kapitellisten (zentral.js meldet sich über ctx.lernplanAnzeige): Notizen abgleichen
    const abgleichBald = ctx.entprellen(() => { zentralAbgleichen(); }, 2000);
    // Neuer Tag: Wochenziele und Stand rücken weiter; im neuen Semester (oder nach einer Änderung deines Plans) fehlen Notizen
    const tag = ctx.bleibend("tag", () => ({ wert: heuteIso() }));
    ctx.intervall(() => { const h = heuteIso(); if (h !== tag.wert) { tag.wert = h; neuZeichnen(); abgleichBald(); } }, 5 * 60 * 1000);
    ctx.lernplanAnzeige = { neu: abgleichBald };
    ctx.aufraeumen(() => { if (ctx.lernplanAnzeige && ctx.lernplanAnzeige.neu === abgleichBald) ctx.lernplanAnzeige = null; });
  };

  // Einmal beim App-Start: unveränderte Listen holt zentral.js nicht neu, also hier einmal abgleichen (fehlende Notizen eines neuen
  // Semesters), nachdem Fachmodell und zentrale Daten bereit sind
  const start = () => { ctx.zeit(() => { zentralAbgleichen(); }, 45000); };

  const api = { kapitelLesen, gewichte, planen, zielVon, stand, kapazitaet, sichtbar, zentralNotiz, zentralAuswahl, listeZeilen, nichtMehrDran, folienVon };
  ctx.lernplan = api;
  return Object.assign({ registrieren, start, zentralAbgleichen }, api);
};
