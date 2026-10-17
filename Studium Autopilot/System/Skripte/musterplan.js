// Musterstudienpläne als eigene Darstellung (Phase 2b): Codeblock ```eba-musterplan <economics|ba|ohne|alle>```.
// Daten: System/Daten/Musterplan.md (Eigenschaften plaene, eintraege, hinweise; gepflegt wie die Semesterdaten).
// Raster Fachsemester × Module: je Semester eine Spalte mit Kopf (Fachsemester + dein Semester aus dem Datenmodell),
// Modul-Chips (verlinkt auf die Modulnotiz, ✓ wenn bestanden/anerkannt, „OP“ = Orientierungsprüfung), Platzhalter für
// Schwerpunkt- und Profilbildungsbereiche, ECTS-Summe je Semester; auf schmalen Bildschirmen untereinander.
// Mehrere Pläne (Variante offen, „alle“, „andere“; seit 17.10.2026): Die Semester, die in allen gezeigten Plänen gleich
// sind (der Stamm, bei EcoBA das 1. und 2. Fachsemester), stehen einmal; daneben steht, ab wann sich die Pläne trennen.
// Darunter je Variante nur ihre eigenen Semester (die Zweige). Ohne gemeinsamen Stamm steht jeder Plan ganz.
// Hinweise stehen einmal unter allen Plänen: erst die für alle, dann je Variante ihre eigenen.
// Ohne Argument: die Variante aus den Einstellungen (bei „offen“ alle drei), mit gewählter Variante darunter der Link
// „Andere Varianten ansehen →“ (System/Daten/Musterplan). Schreibt keine Datei.
// Erweiterung: Das Plugin ruft registrieren() auf (Codeblock über ctx.codeblock). Stil: eba-core.css Abschnitt 44 (Klassen eba-mp-*).
module.exports = function (ctx) {
  const app = window.app;
  const DATEN = "System/Daten/Musterplan.md";
  const EINSTELLUNGEN = "Studium/Einstellungen & Hilfe#Variante";
  const VARIANTE = { "Economics": "economics", "Business Administration": "ba", "ohne Spezialisierung": "ohne" };
  const SEMESTER = 6;

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

  // Gemeinsamer Stamm mehrerer Pläne: bis zu welchem Fachsemester alle gezeigten Pläne dieselben Einträge haben (gleiche
  // Reihenfolge, Code, Titel, ECTS, OP, Art). 0 = kein gemeinsames Semester (oder nur ein Plan); SEMESTER = die Pläne sind gleich.
  const stamm = (eintraege, plaene) => {
    if (plaene.length < 2) return 0;
    const schluessel = (plan, fs) => JSON.stringify(eintraege.filter((e) => e.plan === plan && e.fs === fs).map((e) => [e.code, e.titel, e.ects, e.op, e.art]));
    let bis = 0;
    for (let fs = 1; fs <= SEMESTER; fs++) {
      const k = schluessel(plaene[0].id, fs);
      if (k === "[]" || plaene.some((p) => schluessel(p.id, fs) !== k)) break;
      bis = fs;
    }
    return bis;
  };

  // Modulnotizen nach Code (für ✓ und Links), aus dem Datenmodell
  const modulKarte = () => {
    const d = md();
    const module = new Map();
    if (d) for (const m of d.module) module.set(m.code, m);
    return { d, module };
  };

  // Eine Spalte = ein Fachsemester eines Plans; liefert seine ECTS-Summe
  const spalteZeichnen = (raster, M, plan, fs, K, quellePfad) => {
    const es = M.eintraege.filter((e) => e.plan === plan.id && e.fs === fs);
    const summe = es.reduce((a, e) => a + e.ects, 0);
    const sem = K.d && K.d.semesterliste[fs - 1];
    const spalte = raster.createDiv({ cls: "eba-mp-spalte" + (K.d && K.d.aktuell && sem && K.d.aktuell.name === sem.name && !K.d.vorStart ? " jetzt" : "") });
    const kopf = spalte.createDiv({ cls: "eba-mp-kopf" });
    kopf.createEl("b", { text: `${fs}. FS` });
    if (sem) kopf.createSpan({ text: sem.name });
    const liste = spalte.createDiv({ cls: "eba-mp-liste" });
    for (const e of es) {
      const m = e.code ? K.module.get(e.code) : null;
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
    return summe;
  };

  // Ein Plan ganz: eine gewählte Variante, oder mehrere Pläne ohne gemeinsamen Stamm
  const planZeichnen = (el, M, plan, quellePfad) => {
    const K = modulKarte();
    const box = el.createDiv({ cls: "eba-mp", attr: { lang: "de" } });
    if (M.plaene.length > 1) box.createDiv({ cls: "eba-mp-titel", text: `Variante ${plan.name}` });
    const raster = box.createDiv({ cls: "eba-mp-raster" });
    let gesamt = 0;
    for (let fs = 1; fs <= SEMESTER; fs++) gesamt += spalteZeichnen(raster, M, plan, fs, K, quellePfad);
    box.createDiv({ cls: "eba-mp-gesamt", text: `Zusammen ${gesamt} ECTS` });
  };

  // Mehrere Pläne mit gemeinsamem Stamm (bis = letztes gemeinsames Fachsemester): der Stamm einmal, daneben die Gabelung,
  // darunter je Variante ihre Zweige. mitWahl: Satz mit Link zur Wahl der Variante (nur ohne Argument, nicht auf der Datenseite).
  const gabelZeichnen = (el, M, bis, quellePfad, mitWahl) => {
    const K = modulKarte();
    const box = el.createDiv({ cls: "eba-mp eba-mp-gabel", attr: { lang: "de", style: `--mp-stamm:${bis};--mp-stamm1:${bis + 1};--mp-zweig:${SEMESTER - bis}` } });
    box.createDiv({ cls: "eba-mp-titel", text: bis === 1 ? "1. Fachsemester – in allen Varianten gleich" : `1. bis ${bis}. Fachsemester – in allen Varianten gleich` });
    const stammRaster = box.createDiv({ cls: "eba-mp-raster eba-mp-stamm" });
    let stammSumme = 0;
    for (let fs = 1; fs <= bis; fs++) stammSumme += spalteZeichnen(stammRaster, M, M.plaene[0], fs, K, quellePfad);
    const gabel = stammRaster.createDiv({ cls: "eba-mp-gabelung" });
    gabel.createEl("p", { text: `Ab dem ${bis + 1}. Fachsemester trennen sich die ${M.plaene.length} Pläne: ${M.plaene.map((p) => p.name).join(", ")}.` });
    if (mitWahl) {
      const p = gabel.createEl("p");
      p.appendText("Wähle deine Variante vorher unter ");
      const a = p.createEl("a", { text: "Einstellungen & Hilfe", href: "#", cls: "internal-link" });
      a.addEventListener("click", (ev) => { ev.preventDefault(); app.workspace.openLinkText(EINSTELLUNGEN, quellePfad || "", ev.ctrlKey || ev.metaKey); });
      p.appendText("; dann steht hier nur noch dein Plan.");
    }
    for (const plan of M.plaene) {
      const zweig = box.createDiv({ cls: "eba-mp-zweig" });
      const raster = zweig.createDiv({ cls: "eba-mp-raster" });
      raster.createDiv({ cls: "eba-mp-zweigkopf" }).createDiv({ cls: "eba-mp-titel", text: `Variante ${plan.name}` });
      let summe = stammSumme;
      for (let fs = bis + 1; fs <= SEMESTER; fs++) summe += spalteZeichnen(raster, M, plan, fs, K, quellePfad);
      zweig.createDiv({ cls: "eba-mp-gesamt", text: `Zusammen ${summe} ECTS` });
    }
  };

  // Hinweise der gezeigten Pläne, damit nichts unter jedem Plan wiederholt wird: gemeinsam = plan „alle“, jePlan = je Variante
  // in Planreihenfolge (ohne leere). Bei einem Plan gehören seine Hinweise mit in die eine Liste.
  const hinweiseOrdnen = (hinweise, plaene) => {
    const texte = (plan) => hinweise.filter((h) => h.plan === plan && h.text).map((h) => h.text);
    const jePlan = plaene.map((p) => ({ id: p.id, name: p.name, texte: texte(p.id) })).filter((g) => g.texte.length);
    if (plaene.length === 1) return { gemeinsam: texte("alle").concat(jePlan.length ? jePlan[0].texte : []), jePlan: [] };
    return { gemeinsam: texte("alle"), jePlan };
  };

  const hinweiseZeichnen = (el, M, plaene) => {
    const { gemeinsam, jePlan } = hinweiseOrdnen(M.hinweise, plaene);
    if (!gemeinsam.length && !jePlan.length) return;
    const box = el.createDiv({ cls: "eba-mp-hinweisbox" });
    const liste = (ziel, texte) => { const ul = ziel.createEl("ul", { cls: "eba-mp-hinweise" }); for (const t of texte) ul.createEl("li", { text: t }); };
    if (gemeinsam.length) liste(box, gemeinsam);
    if (!jePlan.length) return;
    const raster = box.createDiv({ cls: "eba-mp-je-variante" });
    for (const g of jePlan) {
      const spalte = raster.createDiv();
      spalte.createDiv({ cls: "eba-mp-je-variante-titel", text: g.name });
      liste(spalte, g.texte);
    }
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
    const bis = stamm(M.eintraege, plaene);
    if (plaene.length > 1 && bis > 0 && bis < SEMESTER) gabelZeichnen(el, M2, bis, quellePfad, !a && quellePfad !== DATEN);
    else for (const p of plaene) planZeichnen(el, M2, p, quellePfad);
    hinweiseZeichnen(el, M, plaene);
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

  return { registrieren, lesen, hinweiseOrdnen, stamm };
};
