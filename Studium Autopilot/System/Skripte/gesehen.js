// Unterlagen „gesehen“ (seit 0.6.3): Das erste Öffnen einer Unterlage trägt das Datum als `geoeffnet` in ihre Begleitnotiz ein.
// Die Seite Unterlagen zählt damit „Neu“ (in den letzten 14 Tagen eingeordnet und noch nie geöffnet), ohne dass jemand einen
// Status pflegen muss. Vorher hing alles am Feld status (neu → gelesen), das fast niemand umschaltet: Die Seite zeigte dann
// jede Unterlage als „Noch nicht gelesen“.
// Geöffnet zählt: die Begleitnotiz selbst, die Datei daneben in Obsidian (PDF, Bild) und „Öffnen“ in einer anderen App
// (aktionen.js, Aktion oeffnen). Geschrieben wird nur einmal je Unterlage; das Feld status bleibt, wie es ist.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const WARTEN = 1000; // erst nach dem Öffnen schreiben, damit die Notiz nicht beim Zeichnen neu gezeichnet wird

  const fmVon = (f) => { const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || null; };
  const istUnterlage = (f) => { const fm = fmVon(f); return !!(fm && fm.typ === "unterlage"); };

  // Begleitnotiz zu einer Datei: die Notiz selbst oder die gleichnamige Notiz im selben Ordner, sonst null
  const notizZu = (f) => {
    if (!f || !f.path) return null;
    if (f.extension === "md") return istUnterlage(f) ? f : null;
    const ordner = f.parent && f.parent.path ? f.parent.path : f.path.slice(0, Math.max(0, f.path.lastIndexOf("/")));
    const n = app.vault.getAbstractFileByPath((ordner ? ordner + "/" : "") + f.basename + ".md");
    return n && istUnterlage(n) ? n : null;
  };

  // → true, wenn das Datum eingetragen wurde
  const vermerken = async (f) => {
    const n = notizZu(f);
    if (!n || fmVon(n).geoeffnet || !app.fileManager || !app.fileManager.processFrontMatter) return false;
    let neu = false;
    await app.fileManager.processFrontMatter(n, (fm) => {
      if (fm.geoeffnet) return;
      fm.geoeffnet = ctx.date.now("YYYY-MM-DD");
      neu = true;
    });
    return neu;
  };

  const registrieren = () => {
    ctx.an(app.workspace, "file-open", (f) => {
      if (!f || !notizZu(f)) return;
      ctx.zeit(() => { vermerken(f).catch((e) => console.error("eba gesehen", e)); }, WARTEN);
    });
  };

  return { registrieren, notizZu, vermerken };
};
