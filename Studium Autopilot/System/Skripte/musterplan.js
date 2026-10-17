// Musterstudienpläne als eigene Darstellung (Phase 2b): Codeblock ```eba-musterplan <economics|ba|ohne|alle>```.
// Daten: System/Daten/Musterplan.md (Eigenschaften plaene, eintraege, hinweise; gepflegt wie die Semesterdaten).
// Raster Fachsemester × Module: je Semester eine Spalte mit Kopf (Fachsemester + dein Semester aus dem Datenmodell),
// Modul-Chips (verlinkt auf die Modulnotiz, ✓ wenn bestanden/anerkannt, „OP“ = Orientierungsprüfung), Platzhalter für
// Schwerpunkt- und Profilbildungsbereiche, ECTS-Summe je Semester; auf schmalen Bildschirmen untereinander.
// Ohne Argument: die Variante aus den Einstellungen (bei „offen“ alle drei), mit gewählter Variante darunter der Link
// „Andere Varianten ansehen →“ (System/Daten/Musterplan). Schreibt keine Datei.
// Erweiterung: Das Plugin ruft registrieren() auf (Codeblock über ctx.codeblock). Stil: eba-core.css Abschnitt 44 (Klassen eba-mp-*).
module.exports = function (ctx) {
  const app = window.app;
  const DATEN = "System/Daten/Musterplan.md";
  const VARIANTE = { "Economics": "economics", "Business Administration": "ba", "ohne Spezialisierung": "ohne" };

  const fmVon = (pfad) => { const f = app.vault.getAbstractFileByPath(pfad); const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
  const md = () => (ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null);

  const lesen = () => {
    const fm = fmVon(DATEN);
    const liste = (v) => (Array.isArray(v) ? v : []).filter((x) => x && typeof x === "object");
    return {
      stand: String(fm.stand || "").slice(0, 10), quelle: String(fm.quelle || ""),
      plaene: liste(fm.plaene).map((p) => ({ id: String(p.id), name: String(p.name) })),
      eintraege: liste(fm.eintraege).map((e) => ({ plan: String(e.plan), fs: Number(e.fs), code: String(e.code || ""), titel: String(e.titel || ""), ects: Number(e.ects) || 0, op: e.op === true, art: String(e.art || (e.code ? "modul" : "platzhalter")) })),
      hinweise: liste(fm.hinweise).map((h) => ({ plan: String(h.plan), text: String(h.text || "") })),
    };
  };

  const planZeichnen = (el, M, plan, quellePfad) => {
    const d = md();
    const module = new Map();
    if (d) for (const m of d.module) module.set(m.code, m);
    const box = el.createDiv({ cls: "eba-mp", attr: { lang: "de" } });
    if (M.plaene.length > 1) box.createDiv({ cls: "eba-mp-titel", text: `Variante ${plan.name}` });
    const raster = box.createDiv({ cls: "eba-mp-raster" });
    let gesamt = 0;
    for (let fs = 1; fs <= 6; fs++) {
      const es = M.eintraege.filter((e) => e.plan === plan.id && e.fs === fs);
      const summe = es.reduce((a, e) => a + e.ects, 0);
      gesamt += summe;
      const sem = d && d.semesterliste[fs - 1];
      const spalte = raster.createDiv({ cls: "eba-mp-spalte" + (d && d.aktuell && sem && d.aktuell.name === sem.name && !d.vorStart ? " jetzt" : "") });
      const kopf = spalte.createDiv({ cls: "eba-mp-kopf" });
      kopf.createEl("b", { text: `${fs}. FS` });
      if (sem) kopf.createSpan({ text: sem.name });
      const liste = spalte.createDiv({ cls: "eba-mp-liste" });
      for (const e of es) {
        const m = e.code ? module.get(e.code) : null;
        const fertig = m && ["bestanden", "anerkannt"].indexOf(m.status) >= 0;
        const chip = liste.createEl(m ? "a" : "div", { cls: `eba-mp-chip ${e.art}${e.op ? " op" : ""}${fertig ? " fertig" : ""}` });
        if (m) {
          chip.setAttr("href", "#"); chip.setAttr("title", `${e.code} öffnen`);
          chip.addEventListener("click", (ev) => { ev.preventDefault(); app.workspace.openLinkText(m.f.path, quellePfad || "", ev.ctrlKey || ev.metaKey); });
        }
        const text = chip.createSpan({ cls: "eba-mp-name" });
        if (e.code) text.createEl("b", { text: e.code + " " });
        text.appendText(e.code ? e.titel : e.titel.replace(/(Schwerpunkt|Profilbildungs)(bereich)/, "$1­$2")); // weiches Trennzeichen
        const rechts = chip.createSpan({ cls: "eba-mp-ects" });
        if (fertig) rechts.createSpan({ cls: "eba-mp-ok", text: "✓ " });
        rechts.appendText(String(e.ects));
        if (e.op) chip.createSpan({ cls: "eba-mp-op", text: "OP", attr: { title: "Modul der Orientierungsprüfung" } });
      }
      spalte.createDiv({ cls: "eba-mp-summe", text: `${summe} ECTS` });
    }
    box.createDiv({ cls: "eba-mp-gesamt", text: `Zusammen ${gesamt} ECTS` });
    const hs = M.hinweise.filter((h) => h.plan === "alle" || h.plan === plan.id);
    if (hs.length) { const ul = box.createEl("ul", { cls: "eba-mp-hinweise" }); for (const h of hs) ul.createEl("li", { text: h.text }); }
  };

  const zeichnen = (el, arg, quellePfad) => {
    el.empty();
    const M = lesen();
    if (!M.eintraege.length) { el.createDiv({ cls: "eba-sd-fehlt", text: "System/Daten/Musterplan.md fehlt oder ist leer." }); return; }
    let ids = [];
    let andere = false; // Link „Andere Varianten ansehen“: nur ohne Argument und mit gewählter Variante
    const a = String(arg || "").trim().toLowerCase();
    if (a === "alle") ids = M.plaene.map((p) => p.id);
    else if (a === "andere") {
      // die Varianten außer deiner; bei „offen“ stehen alle schon im Block ohne Argument
      const d = md(); const v = d ? VARIANTE[d.variante] : null;
      if (!v) { el.createDiv({ cls: "eba-mp-quelle", text: "Deine Variante ist noch offen – alle drei Pläne stehen oben." }); return; }
      ids = M.plaene.map((p) => p.id).filter((id) => id !== v);
    } else if (a) ids = [a];
    else { const d = md(); const v = d ? VARIANTE[d.variante] : null; ids = v ? [v] : M.plaene.map((p) => p.id); andere = !!v && quellePfad !== DATEN; }
    const plaene = M.plaene.filter((p) => ids.indexOf(p.id) >= 0);
    const M2 = Object.assign({}, M, { plaene });
    for (const p of plaene) planZeichnen(el, M2, p, quellePfad);
    const fuss = el.createEl("p", { cls: "eba-mp-quelle" });
    const dmy = M.stand ? `${M.stand.slice(8, 10)}.${M.stand.slice(5, 7)}.${M.stand.slice(0, 4)}` : "";
    fuss.appendText(`Quelle: Musterstudienplan des Fachbereichs${dmy ? ` (Stand ${dmy})` : ""}, eigene Darstellung · `);
    fuss.createEl("a", { text: "Studienverlaufspläne PO 2023", href: M.quelle, cls: "external-link", attr: { target: "_blank", rel: "noopener" } });
    if (andere) {
      const ziel = DATEN.replace(/\.md$/, "");
      const link = el.createEl("p", { cls: "eba-hinweis eba-mp-andere" }).createEl("a", { text: "Andere Varianten ansehen →", href: ziel, cls: "internal-link", attr: { "data-href": ziel } });
      link.addEventListener("click", (ev) => { ev.preventDefault(); app.workspace.openLinkText(ziel, quellePfad || "", ev.ctrlKey || ev.metaKey); });
    }
  };

  const registrieren = () => {
    const block = ctx.codeblock("eba-musterplan", (quelle, el, c) => {
      const arg = ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, "eba-musterplan", ["economics", "ba", "ohne", "alle", "andere"], "") : "";
      try { zeichnen(el, arg, c && c.sourcePath); } catch (e) { console.error("eba-musterplan", e); el.setText(String(quelle)); }
    });
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(() => block.neu()));
  };

  return { registrieren, lesen };
};
