// Darstellung: hell, dunkel oder automatisch wie das Gerät (seit 17.10.2026) und das Design (seit 18.10.2026), beides je Gerät.
//   Designs: Paper Elfenbein (.obsidian/snippets/eba-paper-elfenbein.css, Vorgabe, hell und dunkel), Flieder (eba-flieder.css)
//   und Klar (eba-klar.css). Flieder und Klar gelten nur hell; dunkel sieht immer aus wie Elfenbein. Gewählt wird ein Design
//   über eine Klasse am body (eba-design-flieder, eba-design-klar; Elfenbein ohne Klasse), damit es je Gerät gilt: Obsidians
//   eingeschaltete CSS-Bausteine stehen in appearance.json und kämen auf alle Geräte. Alle drei Bausteine sind immer an.
//   Gespeichert wird nur auf diesem Gerät (app.saveLocalStorage „eba-darstellung“ und „eba-design“), nie im Tresor: Name,
//   Studienbeginn und Variante gelten auf allen Geräten, hell oder dunkel und das Design nicht. Obsidians eigene Einstellung
//   „theme“ (appearance.json, wird mit .obsidian/ synchronisiert) schreibt Studium Autopilot darum nicht; sie gilt nur, solange
//   auf diesem Gerät nichts gewählt ist (Vorlage: system = automatisch). Ist etwas gewählt, setzt anwenden() die Klassen selbst:
//   nach jedem Umschalten durch Obsidian (css-change, im selben Durchlauf, also ohne Flackern), bei einem Wechsel am Gerät
//   (prefers-color-scheme) und in neuen Fenstern (window-open). Bis 17.10.2026 schrieb die Wahl appearance.json und schaltete
//   damit alle Geräte mit um.
//   Beim Start: Die Klasse des Designs steht zusätzlich in „eba-start-klassen“. Die setzt das Plugin (main.js) schon beim
//   Laden, nicht erst nach den Skripten; sonst zeigte jeder Start erst Elfenbein und spränge dann um.
//   ```eba-darstellung```  „Darstellung“ (Einstellungen & Hilfe): ein Umschalter Hell · Dunkel · Automatisch, ohne Untertexte
//                          (Stil eba-core.css Abschnitt 43, .eba-ds), darunter je Design eine Zeile wie bei der Variante
//                          (Farbmuster, gewählt mit Pille, sonst „Wählen“). Denselben Umschalter zeigt die Einrichtung
//                          (schalter()), die Designs dort als Auswahl wie die Variante (einrichtung.js).
//   Aktion/Befehl „darstellung“  wert = hell | dunkel | automatisch; ohne wert eine Auswahl.
//   Aktion/Befehl „design“       wert = elfenbein | flieder | klar; ohne wert eine Auswahl.
//   Schema sichern (beim Wählen und einmal beim Start): eba-core und die drei Designs an, die bis 0.4.x wählbaren
//   Designs (Befehl „Design wechseln“: Graphite, Paper, Paper Tübingen, Paper Schiefer) aus. Sonst sähe ein Tresor, in dem
//   eines davon gewählt war, nach dem Update ungestaltet aus. Beim Start nur, wenn eba-core an ist.
// Für die Einrichtung (einrichtung.js) und Tests: ctx.darstellung = { MODI, DESIGNS, modusAus, modus, dunkelFuer, setzen, segmente,
// schalter, design, designZeilen, designSetzen, anwenden, schemaSichern }. modusAus(), dunkelFuer(), segmente() und
// designZeilen() sind rein (tests/darstellung.test.js).
module.exports = function (ctx) {
  const app = window.app;
  const { Notice } = ctx.obsidian;
  const Platform = ctx.obsidian.Platform || {};
  const SPEICHER = "eba-darstellung";
  const DESIGN_SPEICHER = "eba-design";
  const START_KLASSEN = "eba-start-klassen"; // liest main.js beim Laden des Plugins
  const MODI = [
    { wert: "hell", theme: "moonstone", titel: "Hell" },
    { wert: "dunkel", theme: "obsidian", titel: "Dunkel" },
    { wert: "automatisch", theme: "system", titel: "Automatisch" },
  ];
  // Reihenfolge der Zeilen; text = die gedämpfte Zeile in Einstellungen & Hilfe und in der Einrichtung
  const DESIGNS = [
    { wert: "elfenbein", titel: "Elfenbein", text: "Warmes Papier, Überschriften wie im Buch" },
    { wert: "flieder", titel: "Flieder", text: "Zartes Lila, weiche Formen · im Dunkelmodus Elfenbein" },
    { wert: "klar", titel: "Klar", text: "Weiß und schlicht · im Dunkelmodus Elfenbein" },
  ];
  const SCHEMA = ["eba-core", "eba-paper-elfenbein", "eba-flieder", "eba-klar"];
  const FRUEHER = ["eba-graphite", "eba-paper", "eba-paper-tuebingen", "eba-paper-schiefer"];
  const DUNKEL_ABFRAGE = "(prefers-color-scheme: dark)";

  // Obsidians Wert → hell | dunkel | automatisch. Wie Obsidian selbst: nur „obsidian“ ist dunkel, nur „system“ folgt dem Gerät.
  const modusAus = (theme) => (theme === "obsidian" ? "dunkel" : theme === "system" ? "automatisch" : "hell");
  const gewaehlt = () => { const w = app.loadLocalStorage(SPEICHER); return MODI.some((m) => m.wert === w) ? w : null; };
  // Was gilt: die Wahl dieses Geräts, sonst Obsidians Einstellung
  const modus = () => gewaehlt() || modusAus(app.vault.getConfig("theme"));
  // Dunkel oder hell für eine Wahl; geraetDunkel = das Gerät steht gerade auf dunkel
  const dunkelFuer = (wahl, geraetDunkel) => (wahl === "dunkel" ? true : wahl === "hell" ? false : !!geraetDunkel);
  // Gerät dunkel? Wie Obsidian: prefers-color-scheme, am Linux-Rechner Electrons nativeTheme
  const geraetDunkel = () => {
    let d = !!(window.matchMedia && window.matchMedia(DUNKEL_ABFRAGE).matches);
    if (Platform.isDesktopApp && !Platform.isMacOS && !Platform.isWin) {
      try { d = !!window.electron.remote.nativeTheme.shouldUseDarkColors; } catch (e) { /* wie prefers-color-scheme */ }
    }
    return d;
  };
  // Die Segmente des Umschalters, genau eines an
  const segmente = (ist) => MODI.map((m) => ({ wert: m.wert, titel: m.titel, an: m.wert === ist }));

  // Design dieses Geräts (ohne Wahl Elfenbein) und die Klasse dafür am body (Elfenbein: keine)
  const design = () => { const w = app.loadLocalStorage(DESIGN_SPEICHER); return DESIGNS.some((d) => d.wert === w) ? w : "elfenbein"; };
  const klasseVon = (wert) => (wert === "elfenbein" ? null : "eba-design-" + wert);
  // Zeilen für Einstellungen & Hilfe und Einrichtung, genau eine gewählt
  const designZeilen = (ist) => DESIGNS.map((d) => ({ wert: d.wert, titel: d.titel, text: d.text, gewaehlt: d.wert === ist }));

  // Klassen in einem Dokument setzen; true, wenn sich etwas geändert hat
  const klassen = (doc, dunkel) => {
    const b = doc && doc.body;
    if (!b || b.classList.contains("theme-dark") === dunkel) return false;
    b.classList.toggle("theme-dark", dunkel);
    b.classList.toggle("theme-light", !dunkel);
    return true;
  };
  const designKlassen = (doc, wert) => {
    const b = doc && doc.body;
    if (!b) return false;
    let anders = false;
    for (const d of DESIGNS) {
      const k = klasseVon(d.wert);
      if (!k || b.classList.contains(k) === (d.wert === wert)) continue;
      b.classList.toggle(k, d.wert === wert);
      anders = true;
    }
    return anders;
  };
  const fenster = new Set(); // Dokumente geöffneter Zusatzfenster (window-open), werden mit umgeschaltet
  // Wahl dieses Geräts durchsetzen: das Design immer, hell oder dunkel nur, wenn gewählt (sonst macht Obsidian das selbst)
  const anwenden = () => {
    const dokumente = [document, ...fenster];
    const d = design();
    let anders = false;
    for (const doc of dokumente) anders = designKlassen(doc, d) || anders;
    const w = gewaehlt();
    if (w) {
      const dunkel = dunkelFuer(w, geraetDunkel());
      for (const doc of dokumente) anders = klassen(doc, dunkel) || anders;
      if (typeof app.updateMobileFrameTheme === "function") app.updateMobileFrameTheme(dunkel); // Statusleiste auf iPhone/iPad
    }
    if (anders) app.workspace.trigger("css-change");
    return anders;
  };

  const schemaSichern = () => {
    const css = app.customCss;
    if (!css || !css.enabledSnippets || typeof css.setCssEnabledStatus !== "function") return false;
    let geaendert = false;
    for (const n of SCHEMA) if (!css.enabledSnippets.has(n)) { css.setCssEnabledStatus(n, true); geaendert = true; }
    for (const n of FRUEHER) if (css.enabledSnippets.has(n)) { css.setCssEnabledStatus(n, false); geaendert = true; }
    return geaendert;
  };

  let block = null; // Codeblock-Griff (ctx.codeblock), gesetzt in registrieren()
  const neuZeichnen = () => { if (block) block.neu(); };
  // Wählen: nur auf diesem Gerät, sofort sichtbar, ohne Hinweis (die Farben wechseln). Rückgabe: der gewählte Modus oder null
  const setzen = (wert) => {
    const m = MODI.find((x) => x.wert === String(wert || "").trim().toLowerCase());
    if (!m) return null;
    schemaSichern();
    app.saveLocalStorage(SPEICHER, m.wert);
    anwenden();
    neuZeichnen();
    return m;
  };
  // Design wählen, ebenso. Rückgabe: das gewählte Design oder null
  const designSetzen = (wert) => {
    const d = DESIGNS.find((x) => x.wert === String(wert || "").trim().toLowerCase());
    if (!d) return null;
    schemaSichern();
    app.saveLocalStorage(DESIGN_SPEICHER, d.wert);
    app.saveLocalStorage(START_KLASSEN, klasseVon(d.wert) ? [klasseVon(d.wert)] : []);
    anwenden();
    neuZeichnen();
    return d;
  };

  // Umschalter in el zeichnen (Einstellungen & Hilfe, Einrichtung); Tippen wählt und markiert sofort
  const schalter = (el) => {
    const g = el.createDiv({ cls: "eba-ds", attr: { role: "radiogroup", "aria-label": "Darstellung" } });
    const knoepfe = segmente(modus()).map((s) => {
      const b = g.createEl("button", { cls: "eba-ds-wahl", text: s.titel, attr: { type: "button", role: "radio", "aria-checked": String(s.an), "data-wert": s.wert } });
      b.addEventListener("click", () => {
        if (!setzen(s.wert)) return;
        for (const k of knoepfe) k.setAttr("aria-checked", String(k === b));
      });
      return b;
    });
    return g;
  };
  // Designs als Zeilenliste wie die Variante (personalisieren.js): Farbmuster, Titel, gedämpfte Zeile, „Wählen“
  const designListe = (el) => {
    const l = el.createDiv({ cls: "eba-vb-liste eba-dz", attr: { role: "list", "aria-label": "Design" } });
    for (const z of designZeilen(design())) {
      const zeile = l.createDiv({ cls: "eba-vb", attr: { role: "listitem", "data-id": z.wert } });
      zeile.createSpan({ cls: "eba-vb-symbol eba-dz-muster", attr: { "data-design": z.wert, "aria-hidden": "true" } });
      const t = zeile.createSpan({ cls: "eba-vb-text" });
      const b = t.createEl("b", { text: z.titel });
      if (z.gewaehlt) b.createSpan({ cls: "eba-pill ok", text: "gewählt" });
      t.createSpan({ cls: "eba-vb-status" }).createSpan({ cls: "eba-vb-stand", text: z.text });
      const k = zeile.createSpan({ cls: "eba-vb-knoepfe" });
      if (!z.gewaehlt) k.createEl("a", { cls: "eba-vb-knopf", text: "Wählen", href: ctx.link("design", { wert: z.wert }) });
    }
    return l;
  };

  const AKTIONEN = {
    darstellung: {
      titel: "Darstellung wählen (hell, dunkel, automatisch)",
      ausfuehren: async (c) => {
        let wert = String((c && c.parameter && c.parameter.wert) || "").trim();
        if (!wert) wert = (await ctx.system.suggester(MODI.map((m) => m.titel), MODI.map((m) => m.wert), false, "Darstellung")) || "";
        if (wert && !setzen(wert)) new Notice("Unbekannte Darstellung: " + wert, 3000);
      },
    },
    design: {
      titel: "Design wählen (Elfenbein, Flieder, Klar)",
      ausfuehren: async (c) => {
        let wert = String((c && c.parameter && c.parameter.wert) || "").trim();
        if (!wert) wert = (await ctx.system.suggester(DESIGNS.map((d) => d.titel), DESIGNS.map((d) => d.wert), false, "Design")) || "";
        if (wert && !designSetzen(wert)) new Notice("Unbekanntes Design: " + wert, 3000);
      },
    },
  };

  ctx.darstellung = { MODI, DESIGNS, modusAus, modus, dunkelFuer, setzen, segmente, schalter, design, designZeilen, designSetzen, anwenden, schemaSichern };

  const registrieren = () => {
    block = ctx.codeblock("eba-darstellung", (quelle, el) => {
      el.empty();
      try { schalter(el); designListe(el); } catch (e) { console.error("eba-darstellung", e); }
    });
    // Obsidian schaltet nach seiner Einstellung um (Sync, Gerät, Obsidians Einstellungen): gleich danach die Wahl wieder
    // durchsetzen. anwenden() löst selbst css-change aus, ändert beim zweiten Mal aber nichts mehr.
    ctx.an(app.workspace, "css-change", () => { anwenden(); });
    ctx.an(app.vault, "config-changed", (k) => { if (k === "theme") neuZeichnen(); });
    ctx.an(app.workspace, "window-open", (ww) => { if (ww && ww.doc) { fenster.add(ww.doc); anwenden(); } });
    ctx.an(app.workspace, "window-close", (ww) => { if (ww && ww.doc) fenster.delete(ww.doc); });
    const mq = window.matchMedia ? window.matchMedia(DUNKEL_ABFRAGE) : null;
    if (mq && mq.addEventListener) {
      const wechsel = () => { anwenden(); };
      mq.addEventListener("change", wechsel);
      ctx.aufraeumen(() => mq.removeEventListener("change", wechsel));
    }
    // Abmelden (Plugin aus, Skript neu geladen): wieder Obsidians eigene Einstellung und Elfenbein
    ctx.aufraeumen(() => {
      for (const doc of [document, ...fenster]) designKlassen(doc, "elfenbein");
      if (typeof app.updateTheme === "function") app.updateTheme();
    });
    anwenden();
  };
  const start = () => {
    const css = app.customCss;
    if (css && css.enabledSnippets && css.enabledSnippets.has("eba-core")) schemaSichern();
  };

  return { registrieren, start, aktionen: AKTIONEN };
};
