// Übungs- und Tutoriengruppen aus den zentralen Daten (Plan Abschnitt 20): Codeblock ```eba-gruppen``` (ohne Argument: deine
// Module) oder ```eba-gruppen alle``` (alle veröffentlichten Module). Daten: gruppen.json der zentralen Daten (docs/daten-v1.md),
// geholt und geprüft von zentral.js, nur gerätelokal gespeichert (ctx.zentral.gruppen()). Schreibt keine Datei.
// Gefiltert wie die zentralen Termine (ctx.zentral.filterBauen: Modul im eigenen Plan oder laut Musterplan im aktuellen oder
// nächsten Fachsemester) und auf das aktuelle und das nächste Semester (ctx.modell). Je Modul und Art eine aufklappbare Karte
// mit Anmeldung und kompakter Tabelle (Gr. · Tag · Zeit · Raum · Leitung; Leitung nur, wenn veröffentlicht).
// Dein „Stand“ wird nicht gespeichert: Steht eine Gruppe in deinem Stundenplan (Stundenplan/, typ lehrveranstaltung, gleicher
// Code, Semester, Wochentag, Beginn höchstens 15 Min. daneben), ist die Zeile markiert („im Stundenplan“). Was du dir zur
// Anmeldung notierst, gehört in deine eigene Notiz bzw. die Tabelle „Anmeldungen“ der Seite.
// Erweiterung: registrieren() meldet den Codeblock an und setzt ctx.gruppenAnzeige (zentral.js zeichnet damit neu, sobald neue
// Gruppen da sind). zentral.js und modell.js laden nach diesem Skript, darum alles erst beim Zeichnen nachschlagen.
// Stil: eba-core.css, Klassen eba-gr-*. iOS-sicher: kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const SPRACHE = "eba-gruppen";
  const TAGE = ["Mo", "Di", "Mi", "Do", "Fr"];
  const TITEL = { "Übung": "Übungsgruppen", "Tutorium": "Tutorien" };

  const dmy = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "");
  const minuten = (hm) => { const m = String(hm || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const md = () => { try { return ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null; } catch (e) { return null; } };

  // „8–10 c.t.“ (volle Stunden, c.t.), „8–10“ (volle Stunden), sonst „8:30–10:00“
  const zeitText = (g) => {
    const kurz = (hm) => String(Number(hm.slice(0, 2)));
    const voll = /:00$/.test(g.von) && /:00$/.test(g.bis);
    if (voll) return `${kurz(g.von)}–${kurz(g.bis)}` + (g.ct ? " c.t." : "");
    const lang = (hm) => `${Number(hm.slice(0, 2))}:${hm.slice(3, 5)}`;
    return `${lang(g.von)}–${lang(g.bis)}` + (g.ct ? " c.t." : "");
  };

  // Steht die Gruppe in deinem Stundenplan? (stundenplan = ctx.modell.daten().stundenplan: [{ fm }])
  const imStundenplan = (g, stundenplan) => (stundenplan || []).some((x) => {
    const fm = (x && x.fm) || {};
    if (String(fm.code || "") !== g.code || String(fm.semester || "") !== g.semester) return false;
    if (Number(fm.wochentag) !== TAGE.indexOf(g.tag) + 1) return false;
    const a = minuten(fm.beginn), b = minuten(g.von);
    return a != null && b != null && Math.abs(a - b) <= 15;
  });

  // Rein (testbar): liste = geprüfte Gruppen, o = { codes: { B110: true } | null (alle), semester: [Namen] | null (alle),
  // stundenplan, titel: { B110: "Einführung …" } } → [{ code, art, semester, titel, anmeldung: [Texte], quellen: [URLs],
  // geprueft, gruppen: [{ …, dein }] }] sortiert nach Semester (Reihenfolge in o.semester), Code, Art.
  const auswaehlen = (liste, o) => {
    o = o || {};
    const karten = {};
    for (const g of liste || []) {
      if (o.codes && !o.codes[g.code]) continue;
      if (o.semester && o.semester.indexOf(g.semester) < 0) continue;
      const k = [g.semester, g.code, g.art].join("|");
      const kt = karten[k] || (karten[k] = { code: g.code, art: g.art, semester: g.semester, titel: (o.titel && o.titel[g.code]) || "", anmeldung: [], quellen: [], geprueft: "", gruppen: [] });
      if (g.anmeldung && kt.anmeldung.indexOf(g.anmeldung) < 0) kt.anmeldung.push(g.anmeldung);
      if (g.quelle_url && kt.quellen.indexOf(g.quelle_url) < 0) kt.quellen.push(g.quelle_url);
      if (g.geprueft && g.geprueft > kt.geprueft) kt.geprueft = g.geprueft;
      kt.gruppen.push(Object.assign({}, g, { dein: imStundenplan(g, o.stundenplan) }));
    }
    const nr = (s) => { const m = String(s || "").match(/\d+/); return m ? Number(m[0]) : 1e6; };
    const semIndex = (s) => { const i = o.semester ? o.semester.indexOf(s) : -1; return i < 0 ? 99 : i; };
    const aus = Object.keys(karten).map((k) => karten[k]);
    for (const kt of aus) kt.gruppen.sort((a, b) => TAGE.indexOf(a.tag) - TAGE.indexOf(b.tag) || (a.von < b.von ? -1 : a.von > b.von ? 1 : 0) || nr(a.gruppe) - nr(b.gruppe) || a.id.localeCompare(b.id));
    aus.sort((a, b) => semIndex(a.semester) - semIndex(b.semester) || a.semester.localeCompare(b.semester) || a.code.localeCompare(b.code) || a.art.localeCompare(b.art));
    return aus;
  };

  // Aktuelles und nächstes Semester laut Datenmodell (vor Studienbeginn: das erste); ohne Modell: alle
  const semesterWahl = (D) => {
    const s = D && D.aktuell && D.aktuell.name;
    if (!s) return null;
    const n = ctx.modell && ctx.modell.naechster ? ctx.modell.naechster(s) : null;
    return n ? [s, n] : [s];
  };

  const hinweis = (el, text) => el.createDiv({ cls: "eba-gr-leer", text });

  const zeichnen = (el, arg) => {
    el.empty();
    const Z = ctx.zentral;
    const daten = Z && Z.gruppen ? Z.gruppen() : null;
    const box = el.createDiv({ cls: "eba-gr", attr: { lang: "de" } });
    if (!daten) {
      const aus = Z && Z.status && Z.status().an === false;
      hinweis(box, aus ? "Zentrale Daten sind ausgeschaltet. Gruppen erscheinen, sobald du sie unter Verbindungen einschaltest."
        : "Gruppen erscheinen, sobald die zentralen Daten geladen sind.");
      return;
    }
    const D = md();
    const alle = arg === "alle";
    let codes = null;
    if (!alle && Z.filterBauen && ctx.modell) { try { codes = Z.filterBauen().codes; } catch (e) { codes = null; } }
    const semester = semesterWahl(D);
    const titel = {};
    if (D) for (const m of D.module) if (!titel[m.code]) titel[m.code] = m.titel;
    const karten = auswaehlen(daten.gruppen, { codes, semester, stundenplan: D ? D.stundenplan : [], titel });
    if (!karten.length) {
      const wann = semester ? " im " + semester.join(" und ") : "";
      hinweis(box, (alle ? "Für" + wann : "Für deine Module" + wann) + " sind noch keine Gruppen veröffentlicht.");
      return;
    }
    const mehrereSemester = karten.some((k) => k.semester !== karten[0].semester);
    for (const k of karten) {
      const det = box.createEl("details", { cls: "eba-gr-modul" });
      const sum = det.createEl("summary");
      const kopf = sum.createSpan({ cls: "eba-gr-titel" });
      kopf.createEl("b", { text: k.code });
      kopf.appendText(" " + (k.titel ? k.titel + " · " : "") + (TITEL[k.art] || k.art) + (mehrereSemester ? " · " + k.semester : ""));
      const dein = k.gruppen.filter((g) => g.dein);
      sum.createSpan({ cls: "eba-gr-zahl", text: dein.length ? `im Stundenplan: ${dein.map((g) => g.gruppe ? "Gr. " + g.gruppe : g.tag).join(", ")}` : `${k.gruppen.length} ${k.gruppen.length === 1 ? "Gruppe" : "Gruppen"}` });
      const inhalt = det.createDiv({ cls: "eba-gr-inhalt" });
      for (const a of k.anmeldung) { const p = inhalt.createEl("p", { cls: "eba-gr-anmeldung" }); p.createEl("b", { text: "Anmeldung: " }); p.appendText(a); }
      const mitLeitung = k.gruppen.some((g) => g.leitung);
      const tab = inhalt.createEl("table", { cls: "eba-gr-tabelle" });
      const kz = tab.createEl("thead").createEl("tr");
      for (const t of ["Gr.", "Tag", "Zeit", "Raum"].concat(mitLeitung ? ["Leitung"] : [])) kz.createEl("th", { text: t });
      const tb = tab.createEl("tbody");
      for (const g of k.gruppen) {
        const z = tb.createEl("tr");
        if (g.dein) z.addClass("eba-gr-dein");
        const gr = z.createEl("td", { text: g.gruppe || "–" });
        if (g.dein) gr.createSpan({ cls: "eba-pill ok eba-gr-pille", text: "im Stundenplan" });
        z.createEl("td", { text: g.tag });
        z.createEl("td", { text: zeitText(g) });
        z.createEl("td", { text: g.raum || "–" });
        if (mitLeitung) z.createEl("td", { text: g.leitung || "–" });
      }
      const fuss = inhalt.createEl("p", { cls: "eba-gr-quelle" });
      const zr = k.gruppen.filter((g) => g.zeitraum).map((g) => g.zeitraum);
      if (zr.length) {
        const von = zr.map((x) => x.von).sort()[0], bis = zr.map((x) => x.bis).sort().reverse()[0];
        fuss.appendText(`${k.semester}, ${dmy(von)} – ${dmy(bis)} · `);
      } else fuss.appendText(k.semester + " · ");
      k.quellen.forEach((u, i) => {
        let host = "Quelle";
        try { host = new URL(u).hostname.replace(/^www\./, ""); } catch (e) { /* bleibt */ }
        if (i) fuss.appendText(", ");
        fuss.createEl("a", { text: i ? host : "Quelle: " + host, href: u, cls: "external-link", attr: { target: "_blank", rel: "noopener" } });
      });
      if (k.geprueft) fuss.appendText(` · geprüft am ${dmy(k.geprueft)}`);
    }
    box.createEl("p", { cls: "eba-gr-fuss", text: "Gruppennummern wie in der Quelle; im ILIAS-Kurs können sie anders heißen. Maßgeblich sind Alma und der ILIAS-Kurs."
      + (daten.stand ? ` Stand der Daten: ${dmy(daten.stand)}.` : "") });
  };

  let abo = false; // Änderungen am Datenmodell (Plan, Variante, Stundenplan) → neu zeichnen; erst beim Zeichnen möglich
  const registrieren = () => {
    const block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      if (!abo && ctx.modell && ctx.modell.beiAenderung) { abo = true; ctx.aufraeumen(ctx.modell.beiAenderung(() => block.neu())); }
      const arg = ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, SPRACHE, ["alle", "meine"], "meine") : "meine";
      try { zeichnen(el, arg); } catch (e) { console.error(SPRACHE, e); el.setText(String(quelle)); }
    });
    const anzeige = { neu: () => block.neu() };
    ctx.gruppenAnzeige = anzeige;
    ctx.aufraeumen(() => { if (ctx.gruppenAnzeige === anzeige) ctx.gruppenAnzeige = null; });
  };

  return { registrieren, auswaehlen, zeitText, imStundenplan };
};
