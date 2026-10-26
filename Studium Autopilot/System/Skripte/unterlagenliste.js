// Unterlagen auf der Modulseite (seit 18.10.2026): Codeblock ```eba-unterlagen``` unter „## Unterlagen“ jeder Modulnotiz.
// Ersetzt die Tabelle „Nach Art“ (Werkzeugleiste, Spaltenköpfe, Gruppenzeile „art Altklausur“, Spalte Art in jeder Zeile).
// Daten live aus dem metadataCache: Notizen mit typ: unterlage und dem Kürzel des Moduls (oder dem Kürzel im Codeblock).
//  1. Abschnitte je Art in fester Reihenfolge (Folien, Skripte, Mitschriften, Übungen, Tutorium, Lab, Altklausuren, Lösungen, …),
//     Name in der Mehrzahl; unbekannte Arten mit ihrem eigenen Namen vor „Sonstiges“. Tutorium ist ein eigener Bereich (seit
//     20.10.2026): alles aus dem Tutorium, auch seine Lösungen, steht dort und nicht bei den Übungen. Lab ebenso (seit 24.10.2026).
//  2. Lösungen stehen bei ihrer Übung bzw. Altklausur statt als eigene Zeile: gleiche Nummer bei Übungen, sonst gleiche Wörter
//     im Titel ohne „Lösung“, „Kurzlösung“, „Korrektur“ … (eindeutig, sonst bleibt die Lösung im Abschnitt „Lösungen“).
//  3. Folien und Übungen nach Nummer (Nummer als eigene Spalte), Altklausuren nach Semester, neueste zuerst.
//  4. Zeile: Titel (Tipp öffnet die Notiz), ✓ bei gelesen/bearbeitet („neu“ ist der Normalfall und steht nicht da; eine Übung erst,
//     wenn sie erledigt ist: abgegeben bzw. ohne Abgabe bearbeitet, ctx.modell.uebung, seit 24.10.2026), Lösung,
//     Seiten, ↗ öffnet die Datei außerhalb von Obsidian (Aktion oeffnen); ohne Datei führt ↗ zur Online-Fassung im Feld link
//     (nur https, z. B. das E-Book in der Literaturliste, seit 20.10.2026).
//  5. Zwei Fassungen derselben Unterlage (seit 24.10.2026, fassung.js familien): Hast du eine Datei bearbeitet und kam eine neue
//     Fassung daneben, stehen beide untereinander, deine zuerst, unter dem Titel beschriftet („Deine bearbeitete Fassung“, „Neue
//     Fassung vom …“). Vorher standen zwei Zeilen mit derselben Nummer und demselben Titel da.
//  6. Ohne Modul (seit 26.10.2026): ```eba-unterlagen ohne-modul``` (Argument der Kopfzeile, blockArgument) auf der Seite
//     Unterlagen zeigt alle Unterlagen ohne Kürzel
//     (Ordner „Unterlagen/Ohne Modul“), etwa Prüfungsordnung, Modulhandbuch oder Folien einer Infoveranstaltung. Vorher standen
//     sie nirgends als Liste.
// Reine Logik (artVon, woerter, semesterRang, gliedern, gehoert) für tests/unterlagenliste.test.js.
// Stil: eba-core.css Abschnitt 58.8 (eba-ul-*). iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast.
module.exports = function (ctx) {
  const app = window.app;
  const SPRACHE = "eba-unterlagen";
  const OHNE_MODUL = "ohne-modul"; // Wort im Codeblock statt eines Kürzels
  const LINK = "obsidian://studium-autopilot?aktion=";
  // Reihenfolge und Name des Abschnitts (wie ARTEN in unterlagen.js)
  const ARTEN = [
    ["Folien", "Folien"], ["Skript", "Skripte"], ["Mitschrift", "Mitschriften"], ["Übung", "Übungen"], ["Tutorium", "Tutorium"], ["Lab", "Lab"],
    ["Altklausur", "Altklausuren"], ["Lösung", "Lösungen"], ["Eigene Lösung", "Eigene Lösungen"], ["Literatur", "Literatur"],
    ["Scan", "Scans"], ["Sonstiges", "Sonstiges"],
  ];
  const LOESUNG = { "Lösung": "Lösung", "Eigene Lösung": "Eigene" }; // Art → Beschriftung bei der Aufgabe
  const ZIEL = { "Übung": true, "Altklausur": true };
  const GELESEN = { gelesen: true, bearbeitet: true };
  // Wörter, die nur sagen, dass es eine Lösung ist (beim Vergleich mit dem Titel der Aufgabe weg)
  const FUELL = /^((kurz|muster)?l(ö|oe)sung(en|s[a-zäöüß]*)?|solutions?|korrektur|eigene|meine)$/;

  const text = (v) => String(v == null ? "" : v).trim();
  const pad = (n) => String(n).padStart(2, "0");
  const nummer = (v) => (v === "" || v == null || !isFinite(Number(v)) ? null : Number(v));
  const vergleich = (a, b) => a.localeCompare(b, "de", { numeric: true, sensitivity: "base" });
  // Online-Fassung aus dem Feld link: nur https ohne Leerzeichen, sonst ""
  const webLink = (v) => { const t = text(v); return /^https:\/\/[^\s<>"]+$/i.test(t) ? t : ""; };

  // ---------- Reine Logik ----------
  // Art wie in ARTEN geschrieben („übung“ → „Übung“); leer → „Sonstiges“, Unbekanntes bleibt, wie es ist
  const artVon = (s) => {
    const t = text(s);
    if (!t) return "Sonstiges";
    const k = ARTEN.find((a) => a[0].toLowerCase() === t.toLowerCase());
    return k ? k[0] : t;
  };
  // Wörter eines Titels ohne Lösungswörter und Modulkürzel → Menge als Liste
  const woerter = (s, code) => {
    const c = text(code).toLowerCase();
    const aus = [];
    for (const w of text(s).toLowerCase().split(/[^0-9a-zäöüß]+/)) if (w && w !== c && !FUELL.test(w) && aus.indexOf(w) < 0) aus.push(w);
    return aus;
  };
  // Steht die Notiz in der Liste? code = Kürzel des Moduls oder OHNE_MODUL (dann alle Unterlagen ohne Kürzel)
  const gehoert = (fm, code) => !!fm && fm.typ === "unterlage" && (code === OHNE_MODUL ? !text(fm.code) : text(fm.code) === code);
  // Rang eines Semesters im Titel zum Sortieren (neueste zuerst): „WS 2018-19“ → 2018,5, „SS 2019“ → 2019; ohne Jahr -1
  const semesterRang = (s) => {
    const m = text(s).match(/(19|20)\d{2}/);
    if (!m) return -1;
    return Number(m[0]) + (/\b(ws|wise|wintersemester)\b/i.test(text(s)) ? 0.5 : 0);
  };

  // eintraege: [{ f, fm }], erledigt (Übung → erledigt?; ohne: status bearbeitet) →
  // [{ art, name, mitNr, mitLoesung, zeilen: [{ f, titel, nr, seiten, gelesen, datei, link, fassung, loesungen: [{ f, name, gelesen }] }] }]
  // fassung: { rolle, text, i (Platz in der Reihenfolge der Fassungen) } bei zwei Fassungen derselben Datei, sonst null
  const gliedern = (eintraege, code, erledigt) => {
    const Fa = ctx.user && ctx.user.fassung;
    const liste = (eintraege || []).filter((x) => x && x.fm);
    const fam = Fa ? Fa.familien(liste.filter((x) => x.f && x.f.path).map((x) => x.f.path)) : {};
    const alle = liste.map((x) => {
      const art = artVon(x.fm.art), nr = nummer(x.fm.nummer);
      const g = (x.f && fam[x.f.path]) || null;
      let titel = text(x.fm.titel);
      if (!titel) {
        // aus dem Dateinamen „S100 Übung 01 Blatt“ → „Blatt“; ohne Rest die Art („Übung“); ohne „neue Fassung …“
        const b = text(x.f && x.f.basename && (Fa ? Fa.fassungVon(x.f.basename).stamm : x.f.basename));
        const rest = b.split(" ").filter((w, i) => !(i === 0 && w === code)).join(" ");
        titel = text(rest.indexOf(art + " ") === 0 ? rest.slice(art.length + 1) : rest === art ? "" : rest).replace(/^\d{1,3}(\s+|$)/, "") || art;
      }
      const gelesen = art !== "Übung" ? !!GELESEN[text(x.fm.status).toLowerCase()]
        : erledigt ? !!erledigt(x) : text(x.fm.status).toLowerCase() === "bearbeitet";
      return { f: x.f, art, titel, nr, seiten: nummer(x.fm.seiten), gelesen,
        datei: !!text(x.fm.datei), link: webLink(x.fm.link), loesungen: [],
        fassung: g ? { rolle: g.rolle, text: Fa.fassungText(g, x.fm.aktualisiert), i: g.alle.indexOf(x.f.path) } : null };
    });
    // Lösungen zu ihrer Aufgabe: gleiche Nummer (Übung), sonst Titelwörter als Teilmenge mit eindeutig wenigsten Zusatzwörtern
    const ziele = alle.filter((z) => ZIEL[z.art]);
    const angehaengt = [];
    for (const l of alle) {
      if (!LOESUNG[l.art]) continue;
      let ziel = null;
      if (l.nr != null) {
        const k = ziele.filter((z) => z.art === "Übung" && z.nr === l.nr);
        if (k.length === 1) ziel = k[0];
      }
      if (!ziel) {
        const lw = woerter(l.titel, code);
        if (lw.length) {
          let best = null, bestZusatz = Infinity, gleich = false;
          for (const z of ziele) {
            const zw = woerter(z.titel, code);
            if (!lw.every((w) => zw.indexOf(w) >= 0)) continue;
            const zusatz = zw.length - lw.length;
            if (zusatz < bestZusatz) { best = z; bestZusatz = zusatz; gleich = false; } else if (zusatz === bestZusatz) gleich = true;
          }
          if (best && !gleich) ziel = best;
        }
      }
      if (ziel) { ziel.loesungen.push(l); angehaengt.push(l); }
    }
    const reihe = (art) => { const i = ARTEN.findIndex((a) => a[0] === art); return i < 0 ? ARTEN.length - 1.5 : i; };
    const gruppen = {};
    for (const z of alle) {
      if (angehaengt.indexOf(z) >= 0) continue;
      (gruppen[z.art] = gruppen[z.art] || []).push(z);
    }
    return Object.keys(gruppen)
      .sort((a, b) => reihe(a) - reihe(b) || vergleich(a, b))
      .map((art) => {
        const zeilen = gruppen[art];
        if (art === "Altklausur") zeilen.sort((a, b) => semesterRang(b.titel) - semesterRang(a.titel) || vergleich(a.titel, b.titel));
        else zeilen.sort((a, b) => (a.nr == null ? 1 : 0) - (b.nr == null ? 1 : 0) || (a.nr || 0) - (b.nr || 0) || vergleich(a.titel, b.titel)
          || (a.fassung && b.fassung ? a.fassung.i - b.fassung.i : 0));
        for (const z of zeilen) {
          z.loesungen.sort((a, b) => (a.art === "Lösung" ? 0 : 1) - (b.art === "Lösung" ? 0 : 1) || vergleich(a.titel, b.titel));
          const zahl = {};
          z.loesungen = z.loesungen.map((l) => {
            const n = LOESUNG[l.art];
            zahl[n] = (zahl[n] || 0) + 1;
            return { f: l.f, name: zahl[n] > 1 ? `${n} ${zahl[n]}` : n, gelesen: l.gelesen };
          });
        }
        const k = ARTEN.find((a) => a[0] === art);
        return { art, name: k ? k[1] : art, mitNr: zeilen.some((z) => z.nr != null), mitLoesung: zeilen.some((z) => z.loesungen.length), zeilen };
      });
  };

  // ---------- Obsidian ----------
  const fmVon = (f) => (f && app.metadataCache.getFileCache(f)?.frontmatter) || {};
  const oeffnen = (f, e) => { if (f) ctx.oeffnen(f, { neu: !!(e && (e.metaKey || e.ctrlKey)) }); };
  // Tippen ohne Sprung in den Quelltext (Bearbeitungsansicht)
  const tippen = (el, fn) => {
    el.addEventListener("mousedown", (e) => { e.stopPropagation(); });
    el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fn(e); });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); fn(e); } });
  };

  const zeichnen = (el, quelle, c) => {
    el.empty();
    const notiz = app.vault.getAbstractFileByPath(c.sourcePath);
    const fm = fmVon(notiz);
    const M = ctx.modell;
    // Argument der Kopfzeile; findet blockArgument beim Neuzeichnen den Abschnitt nicht, erkennt der Ersatztext im Block ihn
    const ohne = (M && M.blockArgument && M.blockArgument(el, c, SPRACHE, [OHNE_MODUL], "") === OHNE_MODUL) || /^Unterlagen ohne Modul/.test(text(quelle));
    const code = ohne ? OHNE_MODUL : text(quelle) || text(fm.code) || (notiz && fm.typ === "modul" ? notiz.basename.split(" ")[0] : "");
    const box = el.createDiv({ cls: "eba-ul" });
    if (!code) { box.createDiv({ cls: "eba-ul-leer", text: "Nur auf Modulseiten." }); return; }
    const eintraege = app.vault.getMarkdownFiles().map((f) => ({ f, fm: fmVon(f) })).filter((x) => gehoert(x.fm, code));
    const G = gliedern(eintraege, ohne ? "" : code, M && M.uebung ? (x) => { const u = M.uebung(x.f); return !!(u && u.erledigt); } : null);
    if (!G.length) {
      box.createDiv({ cls: "eba-ul-leer", text: ohne ? "Unterlagen ohne Modul, etwa Prüfungsordnung oder Modulhandbuch, erscheinen hier." : "Noch keine Unterlagen." });
      return;
    }
    for (const g of G) {
      const sek = box.createDiv({ cls: "eba-ul-gruppe" + (g.mitNr ? " mit-nr" : "") + (g.mitLoesung ? " mit-loesung" : "") });
      sek.createDiv({ cls: "eba-ul-kopf", text: g.name });
      for (const z of g.zeilen) {
        const r = sek.createDiv({ cls: "eba-ul-zeile" + (z.gelesen ? " gelesen" : ""), attr: { role: "link", tabindex: "0" } });
        tippen(r, (e) => oeffnen(z.f, e));
        if (g.mitNr) r.createSpan({ cls: "eba-ul-nr", text: z.nr == null ? "" : pad(z.nr) });
        const t = r.createSpan({ cls: "eba-ul-titel", text: z.titel });
        if (z.gelesen) t.createSpan({ cls: "eba-ul-ok", text: "✓", attr: { "aria-label": g.art === "Übung" ? "erledigt" : "gelesen" } });
        if (z.fassung) t.createSpan({ cls: "eba-ul-fassung " + z.fassung.rolle, text: z.fassung.text });
        if (g.mitLoesung) {
          const lo = r.createSpan({ cls: "eba-ul-loesung" });
          for (const l of z.loesungen) {
            const a = lo.createSpan({ cls: "eba-ul-link" + (l.gelesen ? " gelesen" : ""), text: l.name, attr: { role: "link", tabindex: "0" } });
            tippen(a, (e) => oeffnen(l.f, e));
          }
        }
        r.createSpan({ cls: "eba-ul-seiten", text: z.seiten ? z.seiten + " S." : "" });
        const d = r.createSpan({ cls: "eba-ul-datei" });
        // Datei geht vor; ohne Datei die Online-Fassung im Browser
        const ziel = z.datei && z.f
          ? { href: `${LINK}oeffnen&notiz=${encodeURIComponent(z.f.basename)}`, name: "Datei öffnen", attr: { "data-sa-quelle": c.sourcePath } }
          : z.link ? { href: z.link, name: "Online öffnen", attr: { target: "_blank", rel: "noopener" } } : null;
        if (ziel) {
          const a = d.createEl("a", { text: "↗", href: ziel.href,
            attr: Object.assign({ "aria-label": ziel.name, title: ziel.name }, ziel.attr) });
          a.addEventListener("mousedown", (e) => e.stopPropagation());
          a.addEventListener("click", (e) => e.stopPropagation());
        }
      }
    }
  };

  let block = null;
  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      try { zeichnen(el, quelle, c); } catch (e) { el.setText("Unterlagen: Fehler – " + e.message); console.error("Unterlagen", e); }
    });
    const bald = ctx.entprellen(() => block.neu(), 400);
    const wichtig = (f, cache) => {
      const typ = cache && cache.frontmatter && cache.frontmatter.typ;
      // Termin: Haken der Abgabe einer Übung
      return typ === "unterlage" || typ === "modul" || typ === "termin" || (f && String(f.path).indexOf("Unterlagen/") === 0);
    };
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => { if (wichtig(f, cache)) bald(); });
    ctx.an(app.metadataCache, "deleted", (f, vorher) => { if (wichtig(f, vorher)) bald(); });
    ctx.an(app.vault, "rename", (f, alt) => { if (wichtig(f, null) || String(alt).indexOf("Unterlagen/") === 0) bald(); });
    // Beim Start zeichnet Obsidian die Seite teils, bevor alle Notizen gelesen sind: einmal nachziehen
    let einmal = false;
    ctx.an(app.metadataCache, "resolved", () => { if (!einmal) { einmal = true; bald(); } });
  };

  return { registrieren, zeichnen, artVon, woerter, semesterRang, gliedern, gehoert, OHNE_MODUL };
};
