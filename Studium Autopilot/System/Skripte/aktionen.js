// Knopf-Aktionen (früher Templater-Vorlagen mit Hilfsnotiz in System/Aktionen/). Ein Knopf ist ein Link
//   obsidian://studium-autopilot?aktion=<name>&<parameter>=<wert>
// Das Plugin „Studium Autopilot“ fängt den Klick ab und ruft hier ausfuehren(c) auf: Es öffnet sich keine Seite, es
// entsteht keine Datei, die aktive Notiz bleibt (Ausnahme: „zeigen“ ist ein Link auf eine Notiz, „suchen“ öffnet die Suche).
// c.parameter = Werte aus dem Link (Strings), c.quelle = Notiz, in der der Knopf steht, c.datei = null.
// Neue Aktion: Eintrag in AKTIONEN (titel = Befehl in der Befehlspalette, ohne titel kein Befehl). Doku: docs/architektur/aktionen.md.
module.exports = function (ctx) {
  const app = window.app;
  const { Platform, MarkdownView } = ctx.obsidian;

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
    if (Platform.isAndroidApp) { ctx.hinweis(`Auf Android öffnest du „${f.name}“ über die Dateien-App.`); return; }
    window.open("shareddocuments://" + encodeURI(p).replace(/#/g, "%23"));
  };

  // Variante: Werte, Reihenfolge und Wörter aus dem Feld-Register (felder.js); gespeichert bleibt „offen“
  const F = () => ctx.user.felder;

  const AKTIONEN = {
    // Knopf „Öffnen“ (Kopfzeile des PDF-Kastens, pdfkasten.js; Unterlagen-Tabellen): Datei aus „datei“ (mit original=1: aus
    // „original“) extern öffnen; der PDF-Kasten nennt die eingebettete Datei selbst (Parameter datei, Link relativ zur Notiz)
    oeffnen: {
      titel: "Unterlage öffnen",
      ausfuehren: async (c) => {
        const notiz = notizAus(c, "unterlage");
        const name = notiz ? notiz.basename : String(c.parameter.notiz || "").trim(); // im Hinweis nie ein Pfad
        const original = c.parameter.original === "1" || c.parameter.original === "true";
        const fm = fmVon(notiz);
        const ziel = (!original && c.parameter.datei ? ausLink(c.parameter.datei, notiz ? notiz.path : "") : null)
          || ausLink(original ? fm.original : fm.datei, notiz ? notiz.path : "")
          || app.vault.getFiles().find((f) => f.basename === name && f.extension !== "md") || null;
        if (!ziel) { ctx.hinweis(`Keine Datei zu „${name || "dieser Notiz"}“ gefunden.`); return; }
        extern(ziel);
        if (ctx.user.gesehen) ctx.user.gesehen(c).vermerken(notiz || ziel).catch((e) => console.error("eba gesehen", e)); // zählt nicht mehr als neu
      },
    },

    // Knopf „+ Planen“ / „✓ Im Plan“ (Modulseiten): „gewaehlt“ des Moduls umschalten.
    // modul = Modulcode (stabil, z. B. modul=B110) oder Notizname (nur in Bases-Formeln, dort bei jedem Zeichnen neu berechnet);
    // ohne modul: die Modulseite, auf der der Knopf steht.
    plan: {
      ausfuehren: async (c) => {
        const name = String(c.parameter.modul || "").trim();
        const modul = name ? app.vault.getMarkdownFiles().find((f) => fmVon(f).typ === "modul" && (fmVon(f).code === name || f.basename === name))
          : (fmVon(c.quelle).typ === "modul" ? c.quelle : null);
        if (!modul) { ctx.hinweis(`Modul „${name}“ nicht gefunden.`); return; }
        let jetzt = null;
        await app.fileManager.processFrontMatter(modul, (fm) => { fm.gewaehlt = !(fm.gewaehlt === true); jetzt = fm.gewaehlt; });
        ctx.hinweis(`${modul.basename.split(" ")[0]} ${jetzt ? "ist jetzt in deinem Plan" : "ist nicht mehr in deinem Plan"}.`, { dauer: 2500 });
      },
    },

    // Knöpfe „Variante“ (Einstellungen): Feld „variante“ in System/Einstellungen.md
    variante: {
      titel: "Variante wählen",
      ausfuehren: async (c) => {
        let wert = String(c.parameter.wert || "").trim();
        if (!wert) wert = (await ctx.system.suggester(F().VARIANTE.werte.map(F().varianteTitel), F().VARIANTE.werte.slice(), false, "Variante")) || "";
        if (!wert) return;
        const wahl = F().varianteFinden(wert);
        const einstellungen = app.vault.getAbstractFileByPath("System/Einstellungen.md");
        if (!wahl) { ctx.hinweis(`„${wert}“ ist keine Variante.`); return; }
        if (!einstellungen) { ctx.hinweis("Deine Einstellungen fehlen im Tresor. Stell sie aus einer Sicherung wieder her."); return; }
        await app.fileManager.processFrontMatter(einstellungen, (fm) => { fm.variante = wahl; });
        ctx.hinweis(`Variante: ${F().varianteImSatz(wahl)}.`, { dauer: 3000 });
      },
    },

    // Knopf „Unterlagen hinzufügen“ (…&code=B110 auf Modulseiten: Modul vorgewählt)
    einordnen: {
      titel: "Unterlagen hinzufügen",
      ausfuehren: async (c) => { await ctx.user.unterlagen(c).hinzufuegen(); },
    },

    // Knöpfe auf der Seite Stundenplan: aktualisieren; …&link=neu fragt den Alma-Link neu ab
    stundenplan: {
      titel: "Stundenplan aktualisieren",
      ausfuehren: async (c) => ctx.user.alma(c).aktualisierenOderVerbinden({ neuerLink: !!c.parameter.link }),
    },
    "alma-link": {
      titel: "Alma-Link ändern",
      ausfuehren: async (c) => ctx.user.alma(c).aktualisierenOderVerbinden({ neuerLink: true }),
    },

    // Suche öffnen, z. B. …?aktion=suchen&q=path%3AB110%20 (ersetzt die frühere Obsidian-Suche-Adresse mit Vault-Namen)
    suchen: {
      ausfuehren: async (c) => {
        const q = String(c.parameter.q || "");
        const suche = app.internalPlugins && app.internalPlugins.getPluginById && app.internalPlugins.getPluginById("global-search");
        if (suche && suche.instance && suche.instance.openGlobalSearch) suche.instance.openGlobalSearch(q);
        else ctx.hinweis("Die Suche ist in Obsidian ausgeschaltet. Einschalten unter Obsidian-Einstellungen → Obsidian-Erweiterungen → Suchen.");
      },
    },

    // Link auf eine Notiz (Bases-HTML im Stundenplan-Raster), z. B. …?aktion=zeigen&notiz=B110%20…; Strg/Cmd = neuer Tab
    zeigen: {
      ausfuehren: async (c) => {
        const ziel = String(c.parameter.notiz || "").replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
        if (!ziel) return;
        await ctx.oeffnen(ziel, { quelle: c.quelle ? c.quelle.path : "" });
      },
    },

    // Seitenlink in einer Vorlesungsnotiz: fragt die Seite und fügt [[Folien.pdf#page=N|S. N]] an der Cursorstelle ein
    seitenlink: {
      titel: "Seitenlink auf die Folien einfügen",
      editor: true,
      ausfuehren: async () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        const f = view && view.file;
        // dieselben Folien wie im Kopf der Notiz (ctx.modell.folien: deine Wahl, sonst die zu dieser Sitzung); verlinkt wird die PDF
        const d = f && ctx.modell && ctx.modell.folien ? ctx.modell.folien(f).folien[0] : null;
        const folien = !d ? "" : d.f.extension === "md" ? String(d.fm.datei || "").replace(/^\[\[|\]\]$/g, "") : d.f.name || d.f.path;
        if (!view || !folien) { ctx.hinweis("Zu dieser Vorlesung gibt es noch keine Folien."); return; }
        const s = String((await ctx.system.prompt("Seite der Folien", "")) || "").trim();
        if (/^\d+$/.test(s)) view.editor.replaceSelection(`[[${folien}#page=${s}|S. ${s}]]`);
      },
    },
  };

  return { aktionen: AKTIONEN };
};
