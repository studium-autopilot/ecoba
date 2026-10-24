// Reiter (seit 24.10.2026, Codeblock ```eba-reiter```): Karten einer Seite mit „reiter=Name“ in ihren Angaben
// (`> [!eba-termin|schlicht|handy-zu|reiter=Fristen]+ Fristen · 30 Tage`) stehen nicht untereinander, sondern als eine Reihe
// Reiter in einer Karte an der Stelle des Blocks (Dashboard: Fristen, Termine, Nacharbeiten, To-dos; auf jedem Gerät, zuerst nur
// am iPhone). Ein Tipp zeigt die Karte des Reiters darunter, ein Tipp auf einen anderen wechselt, ein Tipp auf den offenen
// schließt ihn. Welcher offen ist, gilt je Seite, bis Obsidian neu startet; beim ersten Öffnen ist keiner offen. Am Knopf steht,
// wie viele Einträge die Listen des Reiters gerade zeigen (anzahl), ohne Einträge nichts, dahinter ein Pfeil: nach unten, wenn
// der Reiter zu ist, nach oben, wenn er offen ist (seit 24.10.2026; ohne ihn sah die Reihe nicht aufklappbar aus).
// Den Inhalt liest der Block aus der Notiz selbst (reiterAus): dieselbe Karte, ohne Klappen (handy-zu, „+“) und ohne „reiter=“,
// gezeichnet mit Obsidians MarkdownRenderer. Die Listen darin (eba-liste, eba-todos) zeichnen sich also selbst neu. Mehrere
// Karten mit demselben Namen bilden einen Reiter; ein Raster mit „reiter=“ kommt als Ganzes (Offene Fragen | To-dos, dort
// „[!eba-raster|2 reiter=To-dos]“ mit Leerzeichen, siehe nameAus).
// Die Abschnitte der Karten falten, solange das Plugin läuft (eba-core.css Abschnitt 69); ohne Plugin bleiben die Karten da.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const obs = (ctx && ctx.obsidian) || {};
  const SPRACHE = "eba-reiter";
  const EBENE = /^ {0,3}> ?/; // eine Zitat-Ebene
  const KOPF = /^\[!([^\]|]+)((?:\|[^\]]*)?)\]([+-]?)(.*)$/; // Kopfzeile einer Karte ohne Zitatzeichen: Art, |Angaben, Klappen, Titel
  const ZAUN = /^ {0,3}(```|~~~)/;

  // Zeile → { tiefe, rest }: Anzahl der Zitat-Ebenen und der Text dahinter
  const zerlegen = (zeile) => {
    let rest = zeile, tiefe = 0, m;
    while ((m = rest.match(EBENE))) { rest = rest.slice(m[0].length); tiefe++; }
    return { tiefe, rest };
  };
  // Name des Reiters aus den Angaben („|schlicht|reiter=Fristen“ → „Fristen“), sonst "". Angaben trennt „|“ oder ein Leerzeichen:
  // Ein Raster braucht „|2 reiter=To-dos“, denn seine Spaltenzahl liest eba-core.css als eigenes Wort (~="2").
  const nameAus = (angaben) => {
    const w = String(angaben || "").split(/[|\s]+/).filter((x) => /^reiter=./i.test(x))[0];
    return w ? w.slice(7) : "";
  };
  // Kopfzeile für den Reiter: ohne handy-zu und reiter=, nicht klappbar
  const kopfOhneKlappen = (m) => {
    const angaben = m[2].slice(1).split("|")
      .map((t) => t.split(/\s+/).filter((w) => w && w !== "handy-zu" && !/^reiter=/i.test(w)).join(" ")).filter(Boolean);
    return "[!" + m[1] + (angaben.length ? "|" + angaben.join("|") : "") + "]" + m[4];
  };

  // Notiztext → [{ name, md }] in der Reihenfolge der Seite. md = Markdown der Karte(n) als Karte oberster Ebene.
  const reiterAus = (text) => {
    const zeilen = String(text || "").replace(/\r/g, "").split("\n");
    const aus = [], nach = {};
    let zaun = "";
    for (let i = 0; i < zeilen.length; i++) {
      const z = zeilen[i];
      // Code außerhalb von Karten (z. B. ein Beispiel in einem Codeblock) enthält keine Karten
      const zm = z.match(ZAUN);
      if (zm) { if (!zaun) zaun = zm[1]; else if (zm[1] === zaun) zaun = ""; continue; }
      if (zaun) continue;
      const { tiefe, rest } = zerlegen(z);
      const m = tiefe ? rest.match(KOPF) : null;
      const name = m ? nameAus(m[2]) : "";
      if (!name) continue;
      // Die Karte reicht bis zur ersten Zeile mit weniger Zitat-Ebenen; ihre Zeilen kommen eine Ebene tief, jede Kopfzeile darin
      // (auch die der Karten in einem Raster) ohne Klappen
      const karte = [];
      let j = i;
      for (; j < zeilen.length; j++) {
        const t = zerlegen(zeilen[j]);
        if (t.tiefe < tiefe) break;
        let r = t.rest;
        for (let k = tiefe; k < t.tiefe; k++) r = "> " + r;
        const km = r.match(/^((?:> )*)(.*)$/);
        const kk = km[2].match(KOPF);
        karte.push("> " + km[1] + (kk ? kopfOhneKlappen(kk) : km[2]));
      }
      i = j - 1;
      if (!nach[name]) { nach[name] = { name, karten: [] }; aus.push(nach[name]); }
      nach[name].karten.push(karte.map((x) => x.replace(/ +$/, "")).join("\n"));
    }
    return aus.map((r) => ({ name: r.name, md: r.karten.join("\n\n") }));
  };

  // Codeblöcke im Markdown eines Reiters → [{ sprache, arg, quelle }] (arg = Rest der Kopfzeile, quelle = Text im Block)
  const bloeckeAus = (md) => {
    const aus = [];
    let b = null;
    for (const z of String(md || "").split("\n")) {
      const t = zerlegen(z).rest;
      if (b) {
        const zu = t.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
        if (zu && zu[1][0] === b.zaun[0] && zu[1].length >= b.zaun.length) { aus.push({ sprache: b.sprache, arg: b.arg, quelle: b.zeilen.join("\n") }); b = null; }
        else b.zeilen.push(t);
        continue;
      }
      const m = t.match(/^ {0,3}(`{3,}|~{3,})\s*([^\s`~]+)\s*(.*)$/);
      if (m) b = { zaun: m[1], sprache: m[2], arg: m[3].trim(), zeilen: [] };
    }
    return aus;
  };

  // Zahl am Reiter: Summe der Einträge seiner Listen, genau die Zeilen, die die Liste zeigt. Eine Erweiterung, deren Block in
  // einem Reiter stehen kann, liefert dafür in ihrer Rückgabe zaehler: { <sprache>: (arg, quelle) → Zahl | null } (auch als
  // Promise; dashboard.js, todos.js), gelesen über plugin.erweiterungen wie in server.js (nach einem Hot-Reload die neue Fassung).
  // Fehlt ein Zähler oder kennt einer die Zahl noch nicht (null), steht keine Zahl da, ebenso bei 0.
  const zaehlerFuer = (sprache) => {
    const u = (ctx && ctx.plugin && ctx.plugin.erweiterungen) || {};
    for (const k of Object.keys(u)) {
      const z = u[k] && u[k].zaehler;
      if (z && typeof z[sprache] === "function") return z[sprache];
    }
    return null;
  };
  const anzahl = async (md) => {
    const bloecke = bloeckeAus(md);
    if (!bloecke.length) return null;
    let summe = 0;
    for (const b of bloecke) {
      const z = zaehlerFuer(b.sprache);
      const n = z ? await z(b.arg, b.quelle) : null;
      if (typeof n !== "number") return null;
      summe += n;
    }
    return summe;
  };

  // ---------- Höhe in der Leseansicht ----------
  // Obsidian rechnet die Länge der Seite aus den Höhen ihrer Abschnitte, gemessen beim Zeichnen und Scrollen (min-height des
  // Sizers). Ändert sich die Reiterkarte danach (anderer Reiter, Liste darin neu gezeichnet), hielte es unter einem kurzen
  // Reiter den Platz des längeren frei, bis es wieder misst (gesehen 24.10.2026: 320 px leer unter „Termine“ nach „Fristen“).
  // Darum misst ein ResizeObserver am Block den Abschnitt nach. Interne Funktionen des Renderers wie start.js Punkt 5
  // (getSectionForElement, measureSection, updateVirtualDisplay); fehlen sie nach einem Obsidian-Update, bleibt es beim alten.
  // r = Renderer der Leseansicht, el = Block. true, wenn die Höhe neu war.
  const abschnittNachmessen = (r, el) => {
    // weggescrollt (Abschnitt ausgehängt): nicht messen, sonst hielte Obsidian ihn für 0 px hoch; es misst selbst, wenn er kommt
    if (!el || !el.isConnected || !el.offsetParent) return false;
    if (!r || typeof r.getSectionForElement !== "function" || typeof r.measureSection !== "function" ||
      typeof r.updateVirtualDisplay !== "function") return false;
    const s = r.getSectionForElement(el);
    if (!s) return false;
    const vorher = s.height;
    r.measureSection(s);
    if (!(Math.abs(s.height - vorher) > 2)) return false;
    r.updateVirtualDisplay();
    return true;
  };
  const nachmessen = (el) => {
    for (const l of app.workspace.getLeavesOfType("markdown")) {
      const r = l.view && l.view.previewMode && l.view.previewMode.renderer;
      if (r && r.previewEl && r.previewEl.contains(el)) { abschnittNachmessen(r, el); return; }
    }
  };

  // ---------- Zeichnen ----------
  const offen = ctx.bleibend("offen", () => ({})); // Pfad der Seite → Name des offenen Reiters

  const pfadVon = (inst) => (inst.ctx && inst.ctx.sourcePath) || "";
  const zeichnen = async (inst, neuLesen) => {
    const { el } = inst;
    const pfad = pfadVon(inst);
    const lauf = (inst.lauf || 0) + 1; // zwei schnelle Tipps: nur die letzte Zeichnung kommt an
    inst.lauf = lauf;
    if (neuLesen || !inst.reiter || inst.veraltet) {
      inst.veraltet = false;
      inst.neuZaehlen = true; // erst nach dem Zeichnen, das ankommt
      const f = app.vault.getAbstractFileByPath(pfad);
      inst.reiter = f && f.extension === "md" ? reiterAus(await app.vault.cachedRead(f)) : [];
    }
    const reiter = inst.reiter;
    const gewaehlt = reiter.filter((r) => r.name === offen[pfad])[0] || null;
    if (!inst.comp && obs.MarkdownRenderChild) { inst.comp = new obs.MarkdownRenderChild(el); if (inst.ctx && inst.ctx.addChild) inst.ctx.addChild(inst.comp); }
    const RO = el.ownerDocument.defaultView && el.ownerDocument.defaultView.ResizeObserver; // Popout: dessen Fenster
    if (!inst.ro && RO) {
      inst.ro = new RO(() => nachmessen(el));
      inst.ro.observe(el);
      const ro = inst.ro;
      if (inst.comp) inst.comp.register(() => ro.disconnect());
    }
    // je Zeichnung ein Kind-Component (Codeblöcke und Bases im Reiter), beim nächsten Zeichnen entladen
    const comp = obs.Component ? new obs.Component() : null;
    if (comp) { if (inst.comp) inst.comp.addChild(comp); else comp.load(); }

    const box = el.ownerDocument.createElement("div");
    box.className = "eba-rt";
    box.setAttribute("lang", "de");
    const leiste = box.createDiv({ cls: "eba-rt-leiste", attr: { role: "group", "aria-label": "Listen" } });
    for (const r of reiter) {
      const an = r === gewaehlt;
      const k = leiste.createDiv({ cls: "eba-rt-reiter" + (an ? " gewaehlt" : ""), text: r.name,
        attr: { role: "button", tabindex: "0", "aria-expanded": String(an), "data-name": r.name } });
      const pfeil = k.createSpan({ cls: "eba-rt-pfeil", attr: { "aria-hidden": "true" } });
      if (obs.setIcon) obs.setIcon(pfeil, "chevron-down");
      const los = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (an) delete offen[pfad]; else offen[pfad] = r.name;
        alleNeu((i) => pfadVon(i) === pfad, false);
      };
      k.addEventListener("mousedown", (e) => e.stopPropagation()); // Bearbeitungsansicht: nicht in den Quelltext springen
      k.addEventListener("click", los);
      k.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") los(e); });
    }
    if (gewaehlt) {
      const inhalt = box.createDiv({ cls: "eba-rt-inhalt" });
      const R = obs.MarkdownRenderer;
      if (R && R.render) await R.render(app, gewaehlt.md, inhalt, pfad, comp || inst.comp);
      else inhalt.setText(gewaehlt.md);
    }
    if (inst.lauf !== lauf) { entladen(inst, comp); return; }
    el.empty();
    el.toggleClass("eba-rt-aus", !reiter.length);
    el.appendChild(box);
    entladen(inst, inst.compAlt);
    inst.compAlt = comp;
    zahlenSetzen(inst);
    if (inst.neuZaehlen) { inst.neuZaehlen = false; zaehlen(inst).catch((e) => console.error("Reiter", e)); }
  };

  // Zahlen neu zählen und in die Knöpfe schreiben, ohne neu zu zeichnen (ein offener Reiter bleibt, wie er ist)
  const zaehlen = async (inst) => {
    const lauf = (inst.zlauf || 0) + 1;
    inst.zlauf = lauf;
    const zahlen = {};
    for (const r of inst.reiter || []) {
      try { zahlen[r.name] = await anzahl(r.md); } catch (e) { console.error("Reiter", e); zahlen[r.name] = null; }
    }
    if (inst.zlauf !== lauf) return;
    inst.zahlen = zahlen;
    zahlenSetzen(inst);
  };
  const zahlenSetzen = (inst) => {
    for (const k of inst.el.querySelectorAll(".eba-rt-reiter")) {
      const name = k.getAttribute("data-name");
      const n = (inst.zahlen || {})[name];
      let z = k.querySelector(".eba-rt-zahl");
      if (n) {
        if (!z) { z = k.createSpan({ cls: "eba-rt-zahl" }); k.insertBefore(z, k.querySelector(".eba-rt-pfeil")); } // vor den Pfeil
        z.setText(String(n));
      } else if (z) z.remove();
      k.setAttribute("aria-label", n ? name + ", " + n : name);
    }
  };
  const entladen = (inst, comp) => {
    if (!comp) return;
    try { if (inst.comp) inst.comp.removeChild(comp); else comp.unload(); } catch (e) { /* schon entladen */ }
  };

  let block = null;
  const alleNeu = (filter, neuLesen) => {
    if (!block) return;
    for (const i of block.instanzen()) if (!filter || filter(i)) zeichnen(i, neuLesen).catch((e) => console.error("Reiter", e));
  };

  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (_quelle, el, _c, inst) =>
      zeichnen(inst, true).catch((e) => { console.error("Reiter", e); el.setText("Reiter: Fehler – " + e.message); }));
    // Karten der Seite geändert: Reiter neu lesen (die Listen in den Karten zeichnen sich selbst neu)
    const bald = ctx.entprellen(() => alleNeu((i) => i.veraltet, true), 500);
    // Zahlen: wenn sich das Modell ändert (Fristen, Termine), Aufgaben oder Vorlesungsnotizen irgendwo im Tresor (To-dos,
    // Nachzuarbeiten), beim Zurückkommen in die App und alle 10 Minuten (Tageswechsel)
    const zaehlenBald = ctx.entprellen(() => {
      for (const i of block.instanzen()) zaehlen(i).catch((e) => console.error("Reiter", e));
    }, 800);
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(zaehlenBald));
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => {
      const betroffen = block.instanzen().filter((i) => pfadVon(i) === f.path);
      for (const i of betroffen) i.veraltet = true;
      if (betroffen.length) bald();
      const fm = (cache && cache.frontmatter) || {};
      if ((cache && cache.listItems && cache.listItems.some((li) => li.task !== undefined)) || fm.typ === "vorlesung") zaehlenBald();
    });
    ctx.an(app.metadataCache, "deleted", zaehlenBald);
    ctx.an(app.vault, "rename", zaehlenBald);
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "visible") zaehlenBald(); });
    ctx.intervall(zaehlenBald, 10 * 60 * 1000);
  };

  return { registrieren, reiterAus, nameAus, bloeckeAus, anzahl, abschnittNachmessen };
};
