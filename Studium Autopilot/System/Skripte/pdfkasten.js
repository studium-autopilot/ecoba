// PDF-Kasten der Begleitnotizen (Bedien-Baustein, seit 19.10.2026): Der Kasten „> [!eba-pdf]- PDF“ mit der eingebetteten PDF
// verhält sich in Lese- und Bearbeitungsansicht wie ein Knopf. Ein Tipp auf die Kopfzeile klappt auf oder zu, so oft man will;
// er springt nie in den Quelltext und öffnet keine Tastatur. Rechts in der Kopfzeile „Öffnen“ (die PDF in der App des Geräts,
// Aktion oeffnen) und, wenn es eine Office-Datei daneben gibt, „Original“. Die PDF lädt erst beim ersten Aufklappen.
// Mit eigenem Server (seit 0.5.2) davor „Zusammenfassen“, solange „Das Wichtigste“ leer ist: Claude fasst die Unterlage auf dem
// Server mit Opus zusammen (server.js, zusammenfassen); danach „Wird zusammengefasst“, bis die Zusammenfassung da ist.
// Vorher war es ein gewöhnlicher Callout: In der Bearbeitungsansicht setzte ein Tipp neben den Pfeil den Cursor hinein, der Kasten
// zeigte seinen Quelltext und auf dem iPad ging die Tastatur auf (bis 19.10.2026).
// Die Notiz bleibt, wie sie ist (Markdown-Callout, der Link auf die PDF folgt Umbenennungen, ohne Plugin ein normaler Kasten):
// Der Post-Processor übernimmt den Kasten, wo Obsidian ihn zeichnet. Das gilt auch in der Bearbeitungsansicht, denn Obsidian
// zeichnet Callouts dort mit denselben Post-Processoren. Also auch für ältere Notizen und solche, die der Uni-Abgleich schreibt.
// Seitenzahl: steht sie nicht schon im Titel („Folien als PDF (164 Seiten)“), kommt sie aus dem Feld seiten der Notiz.
// Stil: eba-core.css Abschnitt 28. iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const FANGEN = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click", "dblclick"];

// Markdown eines Kasteninhalts, der nur aus Einbettungen besteht (Absätze bleiben getrennt: mehrere PDFs als Gitter, Abschnitt 29),
// sonst null (dann bleibt der Inhalt, wie Obsidian ihn gezeichnet hat). absaetze: [[src, …], …]
const nurEinbettungen = (absaetze) => {
  if (!absaetze || !absaetze.length || absaetze.some((a) => !a.length || a.some((s) => !s))) return null;
  return absaetze.map((a) => a.map((s) => "![[" + s + "]]").join("\n")).join("\n\n");
};
// Titel mit Seitenzahl: „PDF“ + seiten 37 → „PDF (37 Seiten)“; steht schon eine Zahl mit „Seite“ darin, bleibt er
const titelMitSeiten = (titel, seiten) => {
  const t = String(titel == null ? "" : titel).replace(/\s+/g, " ").trim() || "PDF";
  const n = Number(seiten);
  if (/\d\s*Seite/i.test(t) || !(n > 0) || Math.round(n) !== n) return t;
  return t + " (" + n + (n === 1 ? " Seite)" : " Seiten)");
};

module.exports = function (ctx) {
  const app = window.app;
  const O = ctx.obsidian || {};
  const fmVon = (pfad) => { const f = app.vault.getAbstractFileByPath(pfad || ""); const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
  const linkZiel = (wert, von) => {
    const s = String(wert == null ? "" : wert).replace(/^\[\[|\]\]$/g, "").split("|")[0].split("#")[0].trim();
    return s ? app.metadataCache.getFirstLinkpathDest(s, von || "") : null;
  };

  // Einbettungen je Absatz (src ohne Leerzeichen am Rand); ein Absatz mit anderem Inhalt → leerer Eintrag (dann null oben)
  const absaetzeVon = (inhalt) => Array.from(inhalt.children).map((p) => {
    if (p.tagName !== "P") return [""];
    const src = [];
    for (const n of Array.from(p.childNodes)) {
      if (n.nodeType === 3) { if (n.textContent.trim()) return [""]; continue; }
      if (n.nodeName === "BR") continue;
      if (n.classList && n.classList.contains("internal-embed")) { src.push(String(n.getAttribute("src") || "").trim()); continue; }
      return [""];
    }
    return src;
  });

  // Nach dem Auf- oder Zuklappen in der Bearbeitungsansicht: CodeMirror die neue Höhe messen lassen
  const messen = (el) => {
    const V = ctx.cm && ctx.cm.view, EV = V && V.EditorView;
    try { const ev = EV && EV.findFromDOM ? EV.findFromDOM(el) : null; if (ev) ev.requestMeasure(); } catch (e) { /* Leseansicht */ }
  };

  // Kleiner leiser Knopf in der Kopfzeile (Gestalt der Knöpfe in Zeilen, docs/design.md „Knöpfe“: Leise)
  const knopf = (eltern, text, titel, tun) => {
    const b = eltern.createEl("button", { cls: "eba-vb-knopf leise eba-pdf-knopf", text, attr: { type: "button", title: titel, "aria-label": titel } });
    for (const n of FANGEN) b.addEventListener(n, (e) => { e.stopPropagation(); if (n === "mousedown" || n === "pointerdown") e.preventDefault(); });
    b.addEventListener("click", (e) => { e.preventDefault(); tun(); });
    return b;
  };

  const uebernehmen = (callout, c) => {
    if (callout.getAttribute("data-eba-pdf") === "1") return;
    const titel = callout.querySelector(":scope > .callout-title");
    const inhalt = callout.querySelector(":scope > .callout-content");
    if (!titel || !inhalt) return;
    callout.setAttribute("data-eba-pdf", "1");
    const pfad = (c && c.sourcePath) || "";
    const fm = fmVon(pfad);
    const innen = titel.querySelector(".callout-title-inner");
    if (innen) innen.setText(titelMitSeiten(innen.textContent, fm.seiten));
    const absaetze = absaetzeVon(inhalt);
    const md = nurEinbettungen(absaetze);
    const erste = md ? absaetze[0][0].split("#")[0] : "";

    // Kopfzeile: Knöpfe vor dem Pfeil
    const fold = titel.querySelector(".callout-fold");
    const leiste = titel.ownerDocument.createElement("div");
    leiste.className = "eba-pdf-leiste";
    if (erste && pfad) knopf(leiste, "Öffnen", "PDF in einer anderen App öffnen", () => ctx.aktion("oeffnen", { notiz: pfad, datei: erste }));
    if (pfad && linkZiel(fm.original, pfad)) knopf(leiste, "Original", "Original in einer anderen App öffnen", () => ctx.aktion("oeffnen", { notiz: pfad, original: "1" }));
    const einfuegen = () => { if (!leiste.parentNode && leiste.childElementCount) titel.insertBefore(leiste, fold || null); };
    einfuegen();
    const S = ctx.server;
    if (pfad && S && S.zusammenfassenStand) {
      S.zusammenfassenStand(pfad).then((stand) => {
        if (!stand) return;
        const WARTET = "Wird zusammengefasst";
        let gewuenscht = stand === "angefordert";
        const b = knopf(leiste, gewuenscht ? WARTET : "Zusammenfassen", "Claude fasst die Unterlage mit Opus zusammen: das Wichtigste, Aufgaben und offene Fragen", () => {
          if (gewuenscht) { ctx.hinweis("Claude arbeitet schon daran. Die Zusammenfassung kommt in ein paar Minuten."); return; }
          S.zusammenfassen(pfad).then((ok) => { if (ok) { gewuenscht = true; b.setText(WARTET); } }).catch((e) => console.error("PDF-Kasten: Zusammenfassen", e));
        });
        leiste.insertBefore(b, leiste.firstChild);
        einfuegen();
      }).catch((e) => console.error("PDF-Kasten: Zusammenfassen", e));
    }

    // Spätes Laden: zugeklappt bleibt der Kasten leer, die PDF kommt beim ersten Aufklappen (nur, wenn er nur Einbettungen hat)
    let geladen = true;
    const kind = O.MarkdownRenderChild && c && typeof c.addChild === "function" ? new O.MarkdownRenderChild(callout) : null;
    if (kind) c.addChild(kind);
    if (md && kind && callout.classList.contains("is-collapsed") && O.MarkdownRenderer) { inhalt.empty(); geladen = false; }
    const laden = () => {
      if (geladen) return;
      geladen = true;
      O.MarkdownRenderer.render(app, md, inhalt, pfad, kind).then(() => messen(callout)).catch((e) => console.error("PDF-Kasten", e));
    };

    titel.setAttribute("role", "button");
    titel.setAttribute("tabindex", "0");
    const zeigen = (auf) => {
      callout.classList.toggle("is-collapsed", !auf);
      if (fold) fold.classList.toggle("is-collapsed", !auf);
      inhalt.style.display = auf ? "" : "none";
      titel.setAttribute("aria-expanded", String(auf));
      if (auf) laden();
      messen(callout);
    };
    zeigen(!callout.classList.contains("is-collapsed"));

    // Kopfzeile: vor Obsidian (Einfangen am Kasten), damit weder der Callout noch der Editor den Tipp bekommt
    for (const n of FANGEN) {
      callout.addEventListener(n, (e) => {
        if (!titel.contains(e.target) || (e.target.closest && e.target.closest(".eba-pdf-knopf"))) return;
        e.stopPropagation();
        if (n === "mousedown" || n === "pointerdown") e.preventDefault(); // kein Fokus, keine Tastatur
        if (n === "click") { e.preventDefault(); zeigen(callout.classList.contains("is-collapsed")); }
      }, true);
      // Im Inhalt (PDF-Leiste, Blättern) hat die PDF Vorrang; danach geht nichts weiter an den Editor
      callout.addEventListener(n, (e) => e.stopPropagation());
    }
    titel.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault(); e.stopPropagation();
      zeigen(callout.classList.contains("is-collapsed"));
    });
  };

  const registrieren = () => {
    ctx.postprozessor((el, c) => {
      for (const k of el.querySelectorAll('.callout[data-callout="eba-pdf"]')) {
        try { uebernehmen(k, c); } catch (e) { console.error("PDF-Kasten", e); }
      }
    });
  };

  return { registrieren, nurEinbettungen, titelMitSeiten };
};
module.exports.nurEinbettungen = nurEinbettungen;
module.exports.titelMitSeiten = titelMitSeiten;
