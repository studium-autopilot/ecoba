// Lernplan (seit 18.10.2026): Bereich „Lernplan“ (Codeblock ```eba-lernplan``` auf Studium/Lernplan.md) und die Zeile oben in
// jeder Lernplan-Notiz (```eba-lernplan modul```). Regel „70/100“: Nach 70 % der Zeit von Vorlesungsbeginn bis zur Klausur ist der
// ganze Stoff verstanden (nicht beherrscht), danach bleibt die Zeit für die Klausurvorbereitung (Übungen, Altklausuren, Karteikarten).
// Kapitel: Notizen unter Lernplan/ (typ: lernplan, code), je Modul eine, „<Code> Lernplan“. Nur eine KI schreibt sie (dein
// Uni-Abgleich oder Claude auf deinem eigenen Server); ohne KI gibt es keine, dann fehlt der Bereich im Menü (sichtbar()).
// Je Kapitel eine Aufgabe `- [ ] <Nummer> <Titel>`, danach mit „ · “ getrennt Links auf die Unterlage (`[[B110 Folien 01 …]]`) und
// die Seitenzahl (`118 S.`); eingerückte Aufgaben darunter sind Unterkapitel. Abgehakt = verstanden (bei Unterkapiteln anteilig).
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
  const obs = (ctx && ctx.obsidian) || {};
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
  const NUMMER = /^(\d+(?:\.\d+)*|[IVXLC]+|[A-Z])[.:)]?\s+(.*)$/;
  const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
  const WEB = /\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g;
  const SEITEN = /^(\d{1,4})\s*S\.?$/;
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
    const links = [], web = [];
    let seiten = null;
    for (const t of teile) {
      const s = t.trim().match(SEITEN);
      if (s) { seiten = +s[1]; continue; }
      let l;
      LINK.lastIndex = 0;
      while ((l = LINK.exec(t))) links.push(l[1].trim());
      WEB.lastIndex = 0;
      while ((l = WEB.exec(t))) web.push(l[1]);
    }
    const titel = (m ? m[2] : kopf).replace(LINK, (_, z, a) => a || z).trim();
    return { nr: m ? m[1] : "", titel, links, web, seiten };
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
      if (!aus[n]) aus[n] = { f, seiten: parseInt(fm.seiten, 10) || null };
    }
    return aus;
  };

  // Alles für einen Lernplan: Kapitel mit Gewicht und „da“, Klausur, Ziel, Plan, Stand. null, wenn nichts zu planen ist.
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
      const n = nrZahl(k.nr);
      const fol = n != null ? folien[n] : null;
      const verlinkt = ziele.map((z) => parseInt(fmVon(z).seiten, 10)).filter((x) => x > 0)[0] || null;
      return Object.assign({}, k, { anteil: anteilVon(k), da: ziele.length > 0 || k.web.length > 0 || !!fol,
        seitenWert: k.seiten || verlinkt || (fol && fol.seiten) || null, ziel: ziele[0] || (fol && fol.f) || null, webZiel: k.web[0] || null });
    });
    gewichte(kapitel).forEach((g, i) => { kapitel[i].gewicht = g; });
    const kl = klausurVon(D, code, heute);
    if (!kl) return Object.assign(basis, { kapitel, fehlt: "keine Klausur" });
    const sem = ctx.modell.semesterFuer(heute);
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
    if (!ok) try { new obs.Notice("Das Kapitel hat sich geändert und wurde nicht abgehakt: " + f.basename, 5000); } catch (e) { /* ohne Notice */ }
  };

  // ---------- Zeichnen ----------
  const auf = ctx.bleibend("auf", () => ({}));
  const nurStoppen = (knoten) => knoten.addEventListener("mousedown", (e) => e.stopPropagation()); // Live Preview: nicht in den Quelltext
  const oeffnen = (f, e, quelle) => { e.preventDefault(); e.stopPropagation(); app.workspace.openLinkText(f.path, quelle || "", e.ctrlKey || e.metaKey); };

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
    if (P.fehlt === "keine Klausur") { teile.push("Klausurtermin fehlt"); return teile.join(" · "); }
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
  const NACH_KLAUSUR = { vorbei: 4, vorbereitung: 1 };
  const zeichnen = async (el, mdCtx, art, neu) => {
    const D = ctx.modell.daten(), heute = heuteIso(), quelle = (mdCtx && mdCtx.sourcePath) || "";
    if (art === "modul") {
      const f = app.vault.getAbstractFileByPath(quelle);
      el.empty(); el.addClass("eba-lp", "eba-lp-eine");
      if (!f || fmVon(f).typ !== "lernplan") { el.setText("Dieser Block gehört in eine Lernplan-Notiz."); return; }
      const P = await sammeln(f, D, heute);
      el.empty();
      zeile(el.createDiv({ cls: "eba-vb-liste" }), P, quelle, neu, false);
      return;
    }
    const alle = [];
    for (const f of lernplaene()) alle.push(await sammeln(f, D, heute));
    el.empty(); el.addClass("eba-lp");
    if (!alle.length) { el.createDiv({ cls: "eba-lp-leer", text: LEER }); return; }
    // Reihenfolge: was jetzt zu tun ist zuerst, dann nach Klausurdatum; vorbei ans Ende
    const rang = (P) => (P.stand ? NACH_KLAUSUR[P.stand.art] || 0 : 3);
    alle.sort((a, b) => rang(a) - rang(b) || String(a.klausur ? a.klausur.datum : "9").localeCompare(String(b.klausur ? b.klausur.datum : "9")) || a.code.localeCompare(b.code, "de"));
    const l = el.createDiv({ cls: "eba-vb-liste" });
    for (const P of alle) zeile(l, P, quelle, neu, true);
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
    // Neuer Tag: Wochenziele und Stand rücken weiter
    const tag = ctx.bleibend("tag", () => ({ wert: heuteIso() }));
    ctx.intervall(() => { const h = heuteIso(); if (h !== tag.wert) { tag.wert = h; neuZeichnen(); } }, 5 * 60 * 1000);
  };

  const api = { kapitelLesen, gewichte, planen, zielVon, stand, kapazitaet, sichtbar };
  ctx.lernplan = api;
  return Object.assign({ registrieren }, api);
};
