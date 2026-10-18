// Übungs- und Tutoriengruppen aus den zentralen Daten (Plan Abschnitt 20): Codeblock ```eba-gruppen``` (ohne Argument: deine
// Module) oder ```eba-gruppen alle``` (alle veröffentlichten Module). Daten: gruppen.json der zentralen Daten (docs/daten-v1.md),
// geholt und geprüft von zentral.js, nur gerätelokal gespeichert (ctx.zentral.gruppen()).
// Gefiltert wie die zentralen Termine (ctx.zentral.filterBauen: Modul im eigenen Plan oder laut Musterplan im aktuellen oder
// nächsten Fachsemester) und auf das aktuelle und das nächste Semester (ctx.modell). Je Modul und Art eine aufklappbare Karte
// mit Anmeldung und kompakter Tabelle (Gr. · Tag · Zeit · Raum · Leitung; Leitung nur, wenn veröffentlicht).
// Steht eine Gruppe in deinem Stundenplan (Stundenplan/, typ lehrveranstaltung, gleicher Code, Semester, Wochentag, Beginn
// höchstens 15 Min. daneben, Art keine Vorlesung oder Seminar; Notizen zu deiner Gruppe über gruppe_id), ist die Zeile
// markiert: „aus ILIAS“ (herkunft ilias-gruppe, ilias.js), „deine Gruppe“ (gewählt) oder „im Stundenplan“ (Alma, von Hand,
// zentral). Die Art zählt, weil eine Vorlesung oft direkt vor oder zur selben Zeit wie eine Übungsgruppe liegt.
// „Meine Gruppe“ (Rückfall ohne ILIAS): Knopf „Meine“ je Zeile legt eine Notiz mit herkunft gruppe-gewaehlt an (meine-gruppe.js;
// synchronisiert wie jede Notiz), „Abwählen“ legt sie in den Papierkorb. „Meine“ fehlt, wenn die Gruppe schon aus ILIAS, Alma oder
// einer eigenen Notiz kommt; „Abwählen“ bleibt, solange es eine gewählte Notiz gibt. Gewählte Notizen, die inzwischen ILIAS, Alma
// oder eine eigene Notiz liefert, weichen beim Zeichnen (höchstens einmal je Minute). Trennst du ILIAS (oder lehnt ILIAS die
// Anmeldung ab), macht ilias.js aus der ILIAS-Notiz eine gewählte: „Meine“ ist dann wieder da. Gruppen aus ILIAS heißen wie in
// ILIAS („in ILIAS Gruppe 4“), weil ILIAS und Alma anders zählen. Ist ILIAS nicht eindeutig (ctx.ilias.gruppen(): Status
// mehrdeutig, ohne Treffer, ohne Zeit, ohne Code), sagt die Karte das und markiert die möglichen Gruppen.
// Erweiterung: registrieren() meldet den Codeblock an und setzt ctx.gruppenAnzeige (zentral.js zeichnet damit neu, sobald neue
// Gruppen da sind). zentral.js und modell.js laden nach diesem Skript, darum alles erst beim Zeichnen nachschlagen.
// Stil: eba-core.css, Klassen eba-gr-*. iOS-sicher: kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const SPRACHE = "eba-gruppen";
  const TAGE = ["Mo", "Di", "Mi", "Do", "Fr"];
  const TITEL = { "Übung": "Übungsgruppen", "Tutorium": "Tutorien" };

  const dmy = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "");
  const md = () => { try { return ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null; } catch (e) { return null; } };

  // „8–10 c.t.“ (volle Stunden, c.t.), „8–10“ (volle Stunden), sonst „8:30–10:00“
  const zeitText = (g) => {
    const kurz = (hm) => String(Number(hm.slice(0, 2)));
    const voll = /:00$/.test(g.von) && /:00$/.test(g.bis);
    if (voll) return `${kurz(g.von)}–${kurz(g.bis)}` + (g.ct ? " c.t." : "");
    const lang = (hm) => `${Number(hm.slice(0, 2))}:${hm.slice(3, 5)}`;
    return `${lang(g.von)}–${lang(g.bis)}` + (g.ct ? " c.t." : "");
  };

  // Steht die Gruppe in deinem Stundenplan? (stundenplan = ctx.modell.daten().stundenplan: [{ fm }]). Die eine Regel aus
  // meine-gruppe.js (gehoertZu): Notizen, die eine Übung sein können (nie eine Vorlesung), Beginn ±15 Min. (c.t./s.t.);
  // Gruppen-Notizen (ILIAS, gewählt) über ihre gruppe_id. Ohne meine-gruppe.js: keine.
  const HERKUNFT = { "ilias-gruppe": "ilias", "gruppe-gewaehlt": "gewaehlt" };
  const passt = (g, fm) => { const L = ctx.user && ctx.user["meine-gruppe"]; return !!(L && L.gehoertZu) && L.gehoertZu(fm, g, { ueberId: true }); };
  // Woher kommt die Gruppe in deinem Stundenplan? "ilias" | "gewaehlt" | "stundenplan" (Alma, von Hand, zentral) | ""
  const deinVon = (g, stundenplan) => {
    let aus = "";
    for (const x of stundenplan || []) {
      const fm = (x && x.fm) || {};
      if (!passt(g, fm)) continue;
      const h = HERKUNFT[String(fm.herkunft || "")] || "stundenplan";
      if (h === "ilias") return h;
      if (!aus || h === "stundenplan") aus = h;
    }
    return aus;
  };
  const imStundenplan = (g, stundenplan) => !!deinVon(g, stundenplan);

  // Rein (testbar): liste = geprüfte Gruppen, o = { codes: { B110: true } | null (alle), semester: [Namen] | null (alle),
  // stundenplan, titel: { B110: "Einführung …" }, ilias: [{ code, status, zentral, kandidaten }] (ctx.ilias.gruppen()) } →
  // [{ code, art, semester, titel, anmeldung: [Texte], quellen: [URLs], geprueft, iliasOffen ("" oder Status einer nicht
  // eindeutigen ILIAS-Gruppe dieses Moduls), waehlbar (Knopf „Meine“), gruppen: [{ …, dein, woher ("ilias" | "gewaehlt" |
  // "stundenplan" | ""), kandidat }] }] sortiert nach Semester (Reihenfolge in o.semester), Code, Art.
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
      const woher = deinVon(g, o.stundenplan);
      // gewählt: es gibt eine Notiz „Meine Gruppe“ für genau diese Gruppe (Knopf „Abwählen“ bleibt, auch wenn ILIAS oder Alma
      // die Gruppe inzwischen liefern); iliasName: wie ILIAS die Gruppe nennt („Gruppe 4“)
      const notizen = (o.stundenplan || []).map((x) => (x && x.fm) || {}).filter((fm) => String(fm.gruppe_id || "") === g.id && fm.entfaellt !== true);
      const gewaehlt = notizen.some((fm) => fm.herkunft === "gruppe-gewaehlt");
      const il = notizen.find((fm) => fm.herkunft === "ilias-gruppe");
      kt.gruppen.push(Object.assign({}, g, { dein: !!woher, woher, kandidat: false, gewaehlt, iliasName: il ? String(il.gruppe || "") : "" }));
    }
    // ILIAS: zugeordnete Gruppen sind „aus ILIAS“ (die Notiz kommt mit dem Abruf), nicht eindeutige markieren ihre Kandidaten
    const il = (o.ilias || []).filter((x) => x && x.code);
    for (const k of Object.keys(karten)) {
      const kt = karten[k];
      const hier = (x) => x.status !== "mehrdeutig" || x.kandidaten.some((id) => kt.gruppen.some((g) => g.id === id));
      const offen = il.filter((x) => x.code === kt.code && x.status !== "zugeordnet" && hier(x));
      for (const g of kt.gruppen) {
        const treffer = il.find((x) => x.status === "zugeordnet" && x.zentral === g.id);
        if (treffer && !g.iliasName) g.iliasName = treffer.name || "";
        if (!g.dein && treffer) { g.dein = true; g.woher = "ilias"; }
        g.kandidat = !g.dein && offen.some((x) => x.status === "mehrdeutig" && x.kandidaten.indexOf(g.id) >= 0);
      }
      kt.iliasOffen = offen.length && !kt.gruppen.some((g) => g.woher === "ilias") ? offen[0].status : "";
      kt.waehlbar = !kt.gruppen.some((g) => g.woher === "ilias" || g.woher === "stundenplan");
      kt.knoepfe = kt.waehlbar || kt.gruppen.some((g) => g.gewaehlt);
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
  const PILLE = { ilias: "aus ILIAS", gewaehlt: "deine Gruppe", stundenplan: "im Stundenplan" };
  const OFFEN = {
    "mehrdeutig": "In ILIAS bist du in einer der markierten Gruppen, welche genau, ist nicht eindeutig. Tippe bei deiner auf „Meine“.",
    "ohne-treffer": "In ILIAS bist du in einer Gruppe dieses Moduls, die hier nicht eindeutig steht. Tippe bei deiner auf „Meine“.",
    "ohne-zeit": "In ILIAS bist du in einer Gruppe dieses Moduls, aber ohne Tag und Zeit. Tippe bei deiner auf „Meine“.",
    "ohne-daten": "In ILIAS bist du in einer Gruppe dieses Moduls. Sie kommt in deinen Stundenplan, sobald die Gruppenliste geladen ist.",
  };
  let neuZeichnen = () => {};
  // Gewählte Notizen, die inzwischen ILIAS, Alma oder eine eigene Notiz liefert, weichen (meine-gruppe.js); höchstens einmal je
  // Minute, beim Zeichnen, auf jedem Gerät. Zwei Geräte zugleich schaden nicht: Steht dein Text schon in der anderen Notiz,
  // übernimmt ihn das zweite nicht noch einmal.
  let aufgeraeumt = 0;
  const aufraeumen = () => {
    if (Date.now() - aufgeraeumt < 60000) return;
    aufgeraeumt = Date.now();
    const L = ctx.user && typeof ctx.user["meine-gruppe"] === "function" ? ctx.user["meine-gruppe"](ctx) : null;
    if (!L || !L.gewaehltAufraeumen) return;
    let heute = "";
    try { heute = ctx.date.now("YYYY-MM-DD"); } catch (e) { heute = ""; }
    L.gewaehltAufraeumen(L.obsidianIo(), heute).then((weg) => { if (weg.length) neuZeichnen(); }, (e) => console.error(SPRACHE, e));
  };
  // Knopf „Meine“ bzw. „Abwählen“: Notiz mit herkunft gruppe-gewaehlt (meine-gruppe.js), geschrieben auf diesem Gerät
  const waehlen = async (g, ab, D) => {
    const Notice = ctx.obsidian && ctx.obsidian.Notice;
    const melden = (t) => { if (Notice) new Notice(t, 5000); };
    const L = ctx.user && typeof ctx.user["meine-gruppe"] === "function" ? ctx.user["meine-gruppe"](ctx) : null;
    if (!L) { melden("Das geht gerade nicht. Bitte Obsidian neu starten."); return; }
    const nr = g.gruppe ? "Gruppe " + g.gruppe : "Die Gruppe";
    if (ab) { if (await L.abwaehlen(L.obsidianIo(), g)) melden(`${nr} steht nicht mehr in deinem Stundenplan. Die Notiz liegt im Papierkorb.`); return; }
    const m = D ? D.module.find((x) => x.code === g.code) : null;
    const r = await L.waehlen(L.obsidianIo(), g, { modul: () => (m && m.f ? { name: m.f.basename, titel: m.titel || "" } : null) });
    if (r.art === "ilias") melden("Deine Gruppe kommt schon aus ILIAS. Wechseln kannst du sie dort.");
    else if (r.art === "gedeckt") melden(`${nr} steht schon in deinem Stundenplan.`);
    else melden(`${nr} steht jetzt in deinem Stundenplan.`);
  };

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
    let ilias = [];
    try { ilias = ctx.ilias && ctx.ilias.gruppen ? ctx.ilias.gruppen() : []; } catch (e) { ilias = []; }
    if (D && D.stundenplan.some((x) => x.fm && x.fm.herkunft === "gruppe-gewaehlt")) aufraeumen();
    const karten = auswaehlen(daten.gruppen, { codes, semester, stundenplan: D ? D.stundenplan : [], titel, ilias });
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
      const wo = dein.some((g) => g.woher === "ilias") ? "aus ILIAS" : dein.some((g) => g.woher === "gewaehlt") ? "deine Gruppe" : "im Stundenplan";
      // ILIAS zählt anders als Alma: für Gruppen aus ILIAS deren Name („Gruppe 4“), sonst die Nummer der Liste
      const nameVon = (g) => (g.woher === "ilias" && g.iliasName ? g.iliasName : g.gruppe ? "Gr. " + g.gruppe : g.tag);
      sum.createSpan({ cls: "eba-gr-zahl", text: dein.length ? `${wo}: ${dein.map(nameVon).join(", ")}` : `${k.gruppen.length} ${k.gruppen.length === 1 ? "Gruppe" : "Gruppen"}` });
      const inhalt = det.createDiv({ cls: "eba-gr-inhalt" });
      if (k.iliasOffen) inhalt.createEl("p", { cls: "eba-gr-ilias", text: OFFEN[k.iliasOffen] || OFFEN["ohne-treffer"] });
      for (const a of k.anmeldung) { const p = inhalt.createEl("p", { cls: "eba-gr-anmeldung" }); p.createEl("b", { text: "Anmeldung: " }); p.appendText(a); }
      const mitLeitung = k.gruppen.some((g) => g.leitung);
      const tab = inhalt.createEl("table", { cls: "eba-gr-tabelle" });
      const kz = tab.createEl("thead").createEl("tr");
      for (const t of ["Gr.", "Tag", "Zeit", "Raum"].concat(mitLeitung ? ["Leitung"] : [], k.knoepfe ? [""] : [])) kz.createEl("th", { text: t });
      const tb = tab.createEl("tbody");
      for (const g of k.gruppen) {
        const z = tb.createEl("tr");
        if (g.dein) z.addClass("eba-gr-dein");
        else if (g.kandidat) z.addClass("eba-gr-kandidat");
        const gr = z.createEl("td", { text: g.gruppe || "–" });
        if (g.dein) gr.createSpan({ cls: "eba-pill ok eba-gr-pille", text: g.woher === "ilias" && g.iliasName ? "in ILIAS " + g.iliasName : PILLE[g.woher] || PILLE.stundenplan,
          attr: g.woher === "ilias" && g.iliasName ? { title: `ILIAS nennt sie ${g.iliasName}, die Liste Gr. ${g.gruppe || "–"}` } : {} });
        else if (g.kandidat) gr.createSpan({ cls: "eba-pill leer eba-gr-pille", text: "laut ILIAS möglich" });
        z.createEl("td", { text: g.tag });
        z.createEl("td", { text: zeitText(g) });
        z.createEl("td", { text: g.raum || "–" });
        if (mitLeitung) z.createEl("td", { text: g.leitung || "–" });
        if (k.knoepfe && !k.waehlbar && !g.gewaehlt) z.createEl("td", { cls: "eba-gr-knopf" });
        else if (k.knoepfe) {
          const ab = g.gewaehlt;
          const knopf = z.createEl("td", { cls: "eba-gr-knopf" }).createEl("button", { cls: "eba-gr-wahl", text: ab ? "Abwählen" : "Meine",
            attr: { "aria-label": (ab ? "Nicht mehr meine Gruppe: " : "Meine Gruppe: ") + k.code + (g.gruppe ? " Gr. " + g.gruppe : "") } });
          knopf.addEventListener("click", (ev) => {
            ev.preventDefault();
            knopf.disabled = true;
            waehlen(g, ab, D).then(() => neuZeichnen(), (e) => { console.error(SPRACHE, e); knopf.disabled = false; });
          });
        }
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
  };

  let abo = false; // Änderungen am Datenmodell (Plan, Variante, Stundenplan) → neu zeichnen; erst beim Zeichnen möglich
  const registrieren = () => {
    const block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      neuZeichnen = () => ctx.zeit(() => block.neu(), 400); // nach dem Schreiben: Obsidian liest die Notiz erst ein
      if (!abo && ctx.modell && ctx.modell.beiAenderung) { abo = true; ctx.aufraeumen(ctx.modell.beiAenderung(() => block.neu())); }
      const arg = ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, SPRACHE, ["alle", "meine"], "meine") : "meine";
      try { zeichnen(el, arg); } catch (e) { console.error(SPRACHE, e); el.setText(String(quelle)); }
    });
    const anzeige = { neu: () => block.neu() };
    ctx.gruppenAnzeige = anzeige;
    ctx.aufraeumen(() => { if (ctx.gruppenAnzeige === anzeige) ctx.gruppenAnzeige = null; });
  };

  return { registrieren, auswaehlen, zeitText, imStundenplan, deinVon };
};
