// Knopf-Aktionen (früher Templater-Vorlagen mit Hilfsnotiz in System/Aktionen/). Ein Knopf ist ein Link
//   obsidian://studium-autopilot?aktion=<name>&<parameter>=<wert>
// Das Plugin „Studium Autopilot“ fängt den Klick ab und ruft hier ausfuehren(c) auf: Es öffnet sich keine Seite, es
// entsteht keine Datei, die aktive Notiz bleibt (Ausnahme: „zeigen“ ist ein Link auf eine Notiz, „suchen“ öffnet die Suche).
// c.parameter = Werte aus dem Link (Strings), c.quelle = Notiz, in der der Knopf steht, c.datei = null.
// Neue Aktion: Eintrag in AKTIONEN (titel = Befehl in der Befehlspalette, ohne titel kein Befehl). Doku: docs/architektur.md.
module.exports = function (ctx) {
  const app = window.app;
  const { Notice, Platform, MarkdownView } = ctx.obsidian;

  const fmVon = (f) => { const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
  // Notiz aus dem Parameter „notiz“ (Name ohne .md) oder die Notiz mit dem Knopf
  const notizAus = (c, typ) => {
    const name = String(c.parameter.notiz || "").trim();
    if (!name) return c.quelle && c.quelle.extension === "md" ? c.quelle : null;
    const md = app.vault.getMarkdownFiles().filter((f) => f.basename === name || f.path === name || f.path === name + ".md");
    return (typ && md.find((f) => fmVon(f).typ === typ)) || md[0] || null;
  };
  const ausLink = (wert, von) => {
    const l = String(wert == null ? "" : wert).replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
    return l ? app.metadataCache.getFirstLinkpathDest(l, von) : null;
  };

  // Datei außerhalb von Obsidian öffnen: PC Standardprogramm, iPad/iPhone Dateien-App (shareddocuments://)
  const extern = (f) => {
    if (Platform.isDesktopApp) return app.openWithDefaultApp(f.path);
    const a = app.vault.adapter;
    const res = String(a.getResourcePath(f.path) || "");
    const voll = typeof a.getFullPath === "function" ? String(a.getFullPath(f.path) || "") : "";
    // getResourcePath ist sicher absolut (capacitor://localhost/_capacitor_file_/private/var/…), getFullPath nur Rückfall
    let p = /_capacitor_file_/.test(res) ? res.replace(/^.*?_capacitor_file_/, "").replace(/\?.*$/, "") : voll;
    p = p.replace(/^file:\/\//, "");
    try { p = decodeURI(p); } catch (e) { /* roh */ }
    if (p.startsWith("/var/")) p = "/private" + p;
    if (Platform.isAndroidApp) { new Notice("Auf Android bitte über die Dateien-App öffnen: " + f.path, 6000); return; }
    window.open("shareddocuments://" + encodeURI(p).replace(/#/g, "%23"));
  };

  const VARIANTEN = ["Economics", "Business Administration", "ohne Spezialisierung", "offen"];
  const varianteText = (v) => (v === "offen" ? "noch offen" : v); // gespeichert bleibt „offen“
  const SCHEMATA = { "graphite": "Graphite", "paper": "Paper", "paper-tuebingen": "Paper Tübingen", "paper-elfenbein": "Paper Elfenbein", "paper-schiefer": "Paper Schiefer" };

  const AKTIONEN = {
    // Knopf „Öffnen ↗“ (Unterlagen-Notizen und -Tabellen): Datei aus „datei“ (mit original=1: aus „original“) extern öffnen
    oeffnen: {
      titel: "Unterlage extern öffnen (aktive Notiz)",
      ausfuehren: async (c) => {
        const notiz = notizAus(c, "unterlage");
        const name = String(c.parameter.notiz || (notiz ? notiz.basename : "")).trim();
        const original = c.parameter.original === "1" || c.parameter.original === "true";
        const fm = fmVon(notiz);
        const ziel = ausLink(original ? fm.original : fm.datei, notiz ? notiz.path : "")
          || app.vault.getFiles().find((f) => f.basename === name && f.extension !== "md") || null;
        if (!ziel) { new Notice(`Keine Datei zu „${name || "dieser Notiz"}“ gefunden.`, 4000); return; }
        extern(ziel);
      },
    },

    // Knopf „Größe ⇅“: PDF-Ansicht der Notiz klein ↔ groß (eba-core.css Abschnitt 29), gespeichert in cssclasses
    pdf: {
      titel: "PDF-Größe umschalten (aktive Notiz)",
      ausfuehren: async (c) => {
        const notiz = notizAus(c, "unterlage");
        if (!notiz) { new Notice("Keine Notiz zur PDF-Größe gefunden.", 2500); return; }
        const KLEIN = "eba-pdf-klein", GROSS = "eba-pdf-gross";
        const text = await app.vault.read(notiz);
        const anzahl = (text.match(/!\[\[[^\]|#]+\.pdf(?:[#|][^\]]*)?\]\]/gi) || []).length;
        let jetzt = "";
        await app.fileManager.processFrontMatter(notiz, (fm) => {
          let k = fm.cssclasses;
          k = Array.isArray(k) ? k.map(String) : (k ? String(k).split(/[,\s]+/).filter(Boolean) : []);
          const istKlein = k.indexOf(KLEIN) >= 0 || (k.indexOf(GROSS) < 0 && anzahl > 1);
          k = k.filter((x) => x !== KLEIN && x !== GROSS);
          k.push(istKlein ? GROSS : KLEIN);
          fm.cssclasses = k;
          jetzt = istKlein ? (anzahl > 1 ? "groß untereinander" : "groß") : (anzahl > 1 ? "als Gitter" : "klein");
        });
        new Notice(`PDF ${jetzt}.`, 2500);
      },
    },

    // Knopf „+ Planen“ / „✓ Im Plan“ (Schwerpunkt-Planer, Modulseiten): „gewaehlt“ des Moduls umschalten.
    // modul = Modulcode (stabil, z. B. modul=B110) oder Notizname (nur in Bases-Formeln, dort bei jedem Zeichnen neu berechnet);
    // ohne modul: die Modulseite, auf der der Knopf steht.
    plan: {
      ausfuehren: async (c) => {
        const name = String(c.parameter.modul || "").trim();
        const modul = name ? app.vault.getMarkdownFiles().find((f) => fmVon(f).typ === "modul" && (fmVon(f).code === name || f.basename === name))
          : (fmVon(c.quelle).typ === "modul" ? c.quelle : null);
        if (!modul) { new Notice(`Modul „${name}“ nicht gefunden.`, 2500); return; }
        let jetzt = null;
        await app.fileManager.processFrontMatter(modul, (fm) => { fm.gewaehlt = !(fm.gewaehlt === true); jetzt = fm.gewaehlt; });
        new Notice(`${modul.basename.split(" ")[0]} ${jetzt ? "in den Plan aufgenommen" : "aus dem Plan entfernt"}`, 2500);
      },
    },

    // Knöpfe „Variante“ (Einstellungen): Feld „variante“ in System/Einstellungen.md
    variante: {
      titel: "Variante wechseln",
      ausfuehren: async (c) => {
        let wert = String(c.parameter.wert || "").trim();
        if (!wert) wert = (await ctx.system.suggester(VARIANTEN.map(varianteText), VARIANTEN, false, "Variante")) || "";
        if (!wert) return;
        const wahl = VARIANTEN.find((v) => v.toLowerCase() === wert.toLowerCase()) || null;
        const einstellungen = app.vault.getAbstractFileByPath("System/Einstellungen.md");
        if (!wahl) { new Notice("Unbekannte Variante: " + wert, 3000); return; }
        if (!einstellungen) { new Notice("System/Einstellungen.md fehlt.", 3000); return; }
        await app.fileManager.processFrontMatter(einstellungen, (fm) => { fm.variante = wahl; });
        new Notice("Variante: " + varianteText(wahl), 3000);
      },
    },

    // Farbschema und Grundfarbe umschalten (Snippets eba-<schema>), z. B. …?aktion=design&wert=paper-tuebingen
    design: {
      titel: "Design wechseln",
      ausfuehren: async (c) => {
        let wert = String(c.parameter.wert || "").toLowerCase().trim()
          .replace(/^design\s+/, "").replace(/ü/g, "ue").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/\s+/g, "-");
        if (!wert) wert = (await ctx.system.suggester(Object.values(SCHEMATA), Object.keys(SCHEMATA), false, "Design")) || "";
        if (!wert) return;
        const wahl = wert in SCHEMATA ? wert : "graphite";
        for (const n of Object.keys(SCHEMATA)) app.customCss.setCssEnabledStatus("eba-" + n, n === wahl);
        app.customCss.setCssEnabledStatus("eba-core", true);
        app.changeTheme(wahl.startsWith("paper") ? "moonstone" : "obsidian");
        new Notice("Design: " + SCHEMATA[wahl], 3000);
      },
    },

    // Knopf „Unterlagen einordnen“ (…&code=B110 auf Modulseiten: Modul vorgewählt)
    einordnen: {
      titel: "Unterlagen einordnen",
      ausfuehren: async (c) => { await ctx.user.unterlagen(c).einordnen(); },
    },

    // Knöpfe auf der Seite Stundenplan: aktualisieren; …&link=neu fragt den Alma-Link neu ab
    stundenplan: {
      titel: "Stundenplan aus Alma aktualisieren",
      ausfuehren: async (c) => ctx.user.alma(c).aktualisierenOderVerbinden({ neuerLink: !!c.parameter.link }),
    },
    "alma-link": {
      titel: "Alma-Link ändern (dieses Gerät)",
      ausfuehren: async (c) => ctx.user.alma(c).aktualisierenOderVerbinden({ neuerLink: true }),
    },

    // Suche öffnen, z. B. …?aktion=suchen&q=path%3AB110%20 (ersetzt die frühere Obsidian-Suche-Adresse mit Vault-Namen)
    suchen: {
      ausfuehren: async (c) => {
        const q = String(c.parameter.q || "");
        const suche = app.internalPlugins && app.internalPlugins.getPluginById && app.internalPlugins.getPluginById("global-search");
        if (suche && suche.instance && suche.instance.openGlobalSearch) suche.instance.openGlobalSearch(q);
        else new Notice("Suche ist ausgeschaltet (Einstellungen → Kernplugins → Suche).", 4000);
      },
    },

    // Link auf eine Notiz (Bases-HTML im Stundenplan-Raster), z. B. …?aktion=zeigen&notiz=B110%20…; Strg/Cmd = neuer Tab
    zeigen: {
      ausfuehren: async (c) => {
        const ziel = String(c.parameter.notiz || "").replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
        if (!ziel) return;
        await app.workspace.openLinkText(ziel, c.quelle ? c.quelle.path : "", false);
      },
    },

    // Seitenlink in einer Vorlesungsnotiz: fragt die Seite und fügt [[Folien.pdf#page=N|S. N]] an der Cursorstelle ein
    seitenlink: {
      titel: "Seitenlink auf die Folien einfügen",
      editor: true,
      ausfuehren: async () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        const f = view && view.file;
        const folien = String(fmVon(f).folien || "").replace(/^\[\[|\]\]$/g, "");
        if (!view || !folien) { new Notice("Diese Notiz hat keine Folien. Trag sie oben bei „folien“ ein.", 5000); return; }
        const s = String((await ctx.system.prompt("Seite der Folien", "")) || "").trim();
        if (/^\d+$/.test(s)) view.editor.replaceSelection(`[[${folien}#page=${s}|S. ${s}]]`);
      },
    },
  };

  return { aktionen: AKTIONEN };
};
