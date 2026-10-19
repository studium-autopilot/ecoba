// Leere Notizen automatisch löschen, wenn man sie leer verlässt. Verlässt man eine Vorlesungs- oder Übungsblatt-Notiz (typ: vorlesung | übungsblatt), in der
// außer dem Gerüst der Vorlage nichts steht (Überschriften, leere Aufzählungspunkte, Beschriftungen wie „Ansatz:“ oder
// „Kernaussagen:“, der Kopf-Codeblock, Callouts der Vorlage), wandert sie in den Vault-Papierkorb (`.trash/`, wiederherstellbar).
// Termine, Module, Stundenplan-Einträge, Begleitnotizen sind ausgenommen: ihr Inhalt steht in den Eigenschaften. Ebenso ein
// Übungsblatt mit Abgabedatum (oder verknüpften Aufgaben bzw. eigener Lösung): Seine Abgabe zählt in Fristen und Unterlagen. Und
// eine Vorlesungsnotiz mit Thema (das Fenster „Neue Vorlesungsnotiz“ fragt danach): Sie steht so auf der Modulseite.
// „Verlassen“ = eine andere Notiz wird aktiv oder der Tab schließt (Ereignis file-open; der Wechsel zu Folien, PDFs oder
// Bildern zählt nicht). Geprüft wird 2,5 s später, und nur,
// wenn die Notiz in keinem Tab mehr sichtbar ist (geteilte Ansicht, Seitenleiste am PC: nichts passiert). Text aus einem noch
// offenen Editor, sonst von der Platte (Obsidian schreibt verzögert). Alle Geräte, kein Node-API, keine Lookbehind-Regex.
// Erweiterung: registrieren() meldet das Ereignis über ctx.an an; beim Hot-Reload meldet das Plugin die alte Fassung ab.
module.exports = function (ctx) {
  const app = window.app;
  const TYPEN = ["vorlesung", "übungsblatt"];
  const WARTEN = 2500;

  // Leer = nach Frontmatter bleibt keine Zeile mit eigenem Text. Ignoriert: Überschriften, Codeblöcke, Callouts (> [!…] samt
  // Folgezeilen), leere Punkte („- “, „- [ ] “), reine Beschriftungen („- Kernaussagen:“, „- **Ansatz:**“), Templater-/Kommentarreste.
  const istLeer = (text) => {
    const z = String(text == null ? "" : text).replace(/\r/g, "").split("\n");
    let i = 0;
    if (z.length && z[0].trim() === "---") { i = 1; while (i < z.length && z[i].trim() !== "---") i++; i++; }
    let code = false, callout = false;
    for (; i < z.length; i++) {
      const s = z[i];
      if (/^\s*(```|~~~)/.test(s)) { code = !code; continue; }
      if (code) continue;
      if (/^\s*>\s*\[!/.test(s)) { callout = true; continue; }
      if (callout && /^\s*>/.test(s)) continue;
      callout = false;
      if (!s.trim() || /^\s*#{1,6}\s/.test(s)) continue;
      let r = s.replace(/^\s*(?:[-*+]|\d+[.)])(?:\s+|$)/, "").replace(/^\[[ xX]\]\s*/, ""); // auch „-“ ohne Leerzeichen
      r = r.replace(/<%[\s\S]*?%>/g, "").replace(/%%[\s\S]*?%%/g, "").trim();
      if (/^\*\*[^*\n]{1,40}\*\*:?$/.test(r) || /^[\wÄÖÜäöüß-]{1,30}:$/.test(r)) r = "";
      if (r) return false;
    }
    return true;
  };

  // Übungsblatt mit Angaben in den Eigenschaften (Abgabe, Aufgaben, eigene Lösung) oder Vorlesung mit Thema: bleibt, auch ohne Text
  const gefuellt = (fm, k) => fm[k] != null && String(fm[k]).trim() !== "";
  const hatAngaben = (fm) => {
    const typ = String((fm && fm.typ) || "").toLowerCase();
    if (typ === "vorlesung") return gefuellt(fm, "thema");
    return typ === "übungsblatt" && ["faellig", "datei", "eigene_loesung"].some((k) => gefuellt(fm, k));
  };

  const fmVon = (f) => { const c = app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
  const blaetter = (f) => app.workspace.getLeavesOfType("markdown").filter((l) => l.view && l.view.file === f);
  const textVon = async (f) => {
    const l = blaetter(f).find((x) => x.view.editor);
    return l ? l.view.editor.getValue() : await app.vault.read(f);
  };

  // Prüft eine verlassene Notiz; löscht nur typ vorlesung/übungsblatt, nur wenn nirgends mehr sichtbar und wirklich leer.
  const pruefen = async (f) => {
    try {
      if (!f || f.extension !== "md" || app.vault.getAbstractFileByPath(f.path) !== f) return false;
      if (/Unbenannt|Untitled/.test(f.basename)) return false;             // Vorlage läuft noch (Knopf); die räumt selbst auf
      const fm = fmVon(f);
      if (TYPEN.indexOf(String(fm.typ || "").toLowerCase()) < 0 || hatAngaben(fm)) return false;
      if (app.workspace.getActiveFile() === f) return false;               // doch wieder offen
      if (blaetter(f).some((l) => l.view.containerEl && l.view.containerEl.isShown && l.view.containerEl.isShown())) return false;
      if (!istLeer(await textVon(f))) return false;
      const M = ctx.modell, name = M && M.vorlesung && String(fm.typ).toLowerCase() === "vorlesung" ? M.vorlesung(f).titel : f.basename;
      const text = `„${name}“ war leer und liegt jetzt im Papierkorb.`;
      if (ctx.papierkorb) return await ctx.papierkorb(f, { text }); // mit „Rückgängig“ (papierkorb.js)
      await app.vault.trash(f, false);
      ctx.hinweis(text);
      return true;
    } catch (e) { console.error("eba leer", e); return false; }
  };

  const registrieren = () => {
    let letzte = app.workspace.getActiveFile();
    ctx.an(app.workspace, "file-open", (f) => {
      const alt = letzte; letzte = f;
      // Wechsel zu Folien oder Bildern (PDF, PNG …) zählt nicht als Verlassen: Wer vor der Mitschrift die Folien öffnet,
      // kommt zurück. Geprüft wird nur beim Wechsel zu einer anderen Notiz oder beim Schließen.
      if (alt && alt !== f && (!f || f.extension === "md")) ctx.zeit(() => pruefen(alt), WARTEN);
    });
  };

  return { registrieren, istLeer, hatAngaben, pruefen };
};
