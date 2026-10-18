// To-dos und Offene Fragen auf dem Dashboard: Codeblock ```eba-todos``` bzw. ```eba-todos fragen``` (statt einer
// Obsidian-Suche ```query task-todo:…```, die Dateinamen-Gruppen, rohes Markdown und abgeschnittenen Text zeigt).
// Auswahl: offene Aufgaben `- [ ] Text` in allen Notizen außer in den Ordnern System/, Module/, Studium/ und im Dashboard;
// Offene Fragen = Text endet auf „?“ oder enthält #frage, To-dos = alle übrigen. Daten aus dem metadataCache (listItems,
// task " ") und den Zeilen der Notiz (cachedRead).
// Je Zeile: echtes Kästchen (Tipp hakt nach 1,5 s in der Quellnotiz ab: `- [ ]` → `- [x]` genau in dieser Zeile, Text wird
// vorher geprüft; zweiter Tipp in der Zeit nimmt es zurück), Text als Markdown (fett, Links), ohne „**Zu tun:**“,
// darunter eine Metazeile: Fälligkeit („bis Mi 21.10.“, rot überfällig, Akzent ab 2 Tagen), Quellnotiz kurz („E101 · Folien 01“)
// und die Belege hinter „→“. Tipp auf den Text öffnet die Quellnotiz an dieser Zeile. Sortiert nach Fälligkeit, dann Notiz.
// Leer: Klasse is-leer am Block. Im Raster des Dashboards (Offene Fragen | To-dos) fällt die leere Karte dann weg und die andere
// nimmt die ganze Breite; sind beide leer, bleibt nur die To-do-Karte mit „Nichts offen.“ (CSS, folgt jedem Neuzeichnen).
// Erweiterung: registrieren() meldet Codeblock, Ereignisse und Uhr über die Helfer in ctx an (Hot-Reload ohne Neustart).
// Stil: eba-core.css Abschnitt 37 (todos), Klassen eba-td-*.
// iOS-sicher: keine Node-APIs, keine Lookbehind-Regex, kein .at()/findLast/structuredClone. Fehler → Ersatztext des Blocks.
module.exports = function (ctx) {
  const app = window.app;
  const obs = (ctx && ctx.obsidian) || {};
  const SPRACHE = "eba-todos";
  const TAG = 86400000;
  // Ausgeschlossene Ordner bzw. Dateien als Pfad-Präfix (vom Vault-Stamm aus, Groß/klein egal)
  const AUSSCHLUSS = ["system/", "module/", "studium/", "dashboard.md"];
  // Modulcode am Anfang eines Notiznamens (einheitliches Muster aus System/Skripte/eba.js; fehlt eba.js: kein Kurzname)
  const MODULCODE = ctx && ctx.user && ctx.user.eba && ctx.user.eba.MODULCODE;
  const CODE_NAME = MODULCODE ? new RegExp("^(" + MODULCODE + ")\\s+(.+)$") : null;
  const KURZTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const AUFGABE = /^([\s>]*[-*+] )\[ \] +(\S.*)$/; // offene Aufgabe mit Text (auch in Zitat/Callout)
  const LEER = { todos: "Nichts zu tun.", fragen: "Keine offenen Fragen.", alles: "Nichts offen." };
  const WARTEN = 1500; // ms bis zum Schreiben nach dem Abhaken (zweiter Tipp nimmt es zurück)

  const pad = (n) => String(n).padStart(2, "0");
  const tag0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const kurz = (d) => `${KURZTAG[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  const istFrage = (t) => /\?\s*$/.test(t) || /#frage/i.test(t);
  const ausgeschlossen = (pfad) => { const p = pfad.toLowerCase(); return AUSSCHLUSS.some((a) => p.startsWith(a)); };

  // Kurzname der Quellnotiz: „E101 Folien 01 Einführung“ → „E101 · Folien 01“, „2026-10-13 S110 VL 01“ → „S110 · VL 01“
  const kurzname = (f) => {
    const b = f.basename.replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
    const m = CODE_NAME && b.match(CODE_NAME);
    if (!m) return b;
    const n = m[2].match(/^(\S+\s+\d{1,3})(\s|$)/);
    return m[1] + " · " + (n ? n[1] : m[2]);
  };

  // Text für die Anzeige: „**Zu tun:**“ weg, #frage weg, Belege hinter dem letzten „ → “ in die Metazeile
  const zerlegen = (roh, modus) => {
    let t = roh.trim();
    t = t.replace(/^\*\*\s*Zu tun\s*:?\s*\*\*\s*:?\s*/i, "").replace(/^Zu tun\s*:\s*/i, "");
    if (modus === "fragen") t = t.replace(/\s*#frage\b/gi, "").trim();
    let belege = "";
    const i = t.lastIndexOf(" → ");
    if (i > 0) { belege = t.slice(i + 3).trim(); t = t.slice(0, i).trim(); }
    return { text: t || roh.trim(), belege };
  };

  // Fälligkeit aus dem Text: Datum nach „bis“ bevorzugt, sonst das erste Datum mit Wochentag, Jahr oder „ab/am/vor/(“ davor
  const klartext = (s) => s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const faellig = (text, heute) => {
    const s = klartext(text);
    const kand = [];
    const re = /(?:(Mo|Di|Mi|Do|Fr|Sa|So)\.?,?\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2}(?!\d))?/g;
    let m;
    while ((m = re.exec(s))) {
      const tg = +m[2], mo = +m[3];
      if (tg < 1 || tg > 31 || mo < 1 || mo > 12) continue;
      const davor = s.slice(Math.max(0, m.index - 12), m.index);
      const bis = /\bbis\s*$/i.test(davor);
      if (!m[1] && !m[4] && !bis && !/(\b(ab|am|vor|zum|spätestens)\s*|\(\s*)$/i.test(davor)) continue;
      let j = m[4] ? (m[4].length === 2 ? 2000 + +m[4] : +m[4]) : heute.getFullYear();
      let d = new Date(j, mo - 1, tg);
      if (!m[4]) { if (d - heute < -180 * TAG) d = new Date(j + 1, mo - 1, tg); else if (d - heute > 185 * TAG) d = new Date(j - 1, mo - 1, tg); }
      kand.push({ d, bis });
    }
    const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = iso.exec(s))) kand.push({ d: new Date(+m[1], +m[2] - 1, +m[3]), bis: /\bbis\s*$/i.test(s.slice(Math.max(0, m.index - 6), m.index)) });
    if (!kand.length) return null;
    const b = kand.filter((k) => k.bis);
    return (b.length ? b[0] : kand[0]).d;
  };

  // Alle passenden Aufgaben (offen; dazu gerade abgehakte, deren Schreiben noch aussteht)
  // Schlüssel → { timer }. Bleibt über den Hot-Reload erhalten; die Schreib-Timer sind bewusst normale setTimeout (ein
  // Abhaken soll nicht verloren gehen, nur weil dieses Skript gerade neu geladen wird).
  const warte = ctx.bleibend("warte", () => new Map());
  const basis = ctx; // zeichnen() überdeckt ctx mit dem Markdown-Kontext
  const schluessel = (pfad, zeile) => pfad + "\n" + zeile;
  // Beide Listen in einem Durchgang ({ todos, fragen }): Der Block braucht auch die andere, um zu wissen, ob alles leer ist
  const lesenBeide = async () => {
    const heute = tag0(basis.date.jetzt());
    const aus = { todos: [], fragen: [] };
    for (const f of app.vault.getMarkdownFiles()) {
      if (ausgeschlossen(f.path)) continue;
      const items = app.metadataCache.getFileCache(f)?.listItems;
      if (!items || !items.some((li) => li.task === " ")) continue;
      let zeilen;
      try { zeilen = (await app.vault.cachedRead(f)).split("\n"); } catch (e) { continue; }
      for (const li of items) {
        if (li.task !== " ") continue;
        const nr = li.position.start.line;
        const roh = (zeilen[nr] || "").replace(/\r$/, "");
        const m = roh.match(AUFGABE);
        if (!m) continue;
        const modus = istFrage(m[2]) ? "fragen" : "todos";
        const z = zerlegen(m[2], modus);
        const fl = modus === "fragen" ? null : faellig(z.text, heute);
        // reines „(bis 02.11.)“ am Ende steht schon in der Fälligkeits-Pille
        const text = fl ? z.text.replace(/\s*\(bis\s+(?:(?:Mo|Di|Mi|Do|Fr|Sa|So)\.?,?\s+)?\d{1,2}\.\d{1,2}\.(?:\d{2,4})?\)\s*$/, "") || z.text : z.text;
        aus[modus].push({ f, nr, roh, text, belege: z.belege, faellig: fl });
      }
    }
    const ordnen = (a, b) => {
      if (a.faellig && b.faellig && a.faellig - b.faellig) return a.faellig - b.faellig;
      if (!!a.faellig !== !!b.faellig) return a.faellig ? -1 : 1;
      return a.f.path.localeCompare(b.f.path, "de") || a.nr - b.nr;
    };
    aus.todos.sort(ordnen);
    aus.fragen.sort(ordnen);
    return aus;
  };
  const lesen = async (modus) => (await lesenBeide())[modus === "fragen" ? "fragen" : "todos"];

  // Was ein Block zeigt: seine Liste, leer die Klasse is-leer (das Raster blendet die Karte aus, eba-core.css 37.todos) und
  // einen Satz. Sind auch die Fragen leer, sagt der To-do-Block „Nichts offen.“: Er steht dann allein im Raster.
  const zustand = (beide, modus) => {
    const liste = beide[modus];
    const andere = beide[modus === "fragen" ? "todos" : "fragen"];
    const leer = liste.length ? "" : modus === "todos" && !andere.length ? LEER.alles : LEER[modus];
    return { liste, leer, klasse: "eba-td eba-td-" + modus + (liste.length ? "" : " is-leer") };
  };

  // Abhaken: genau diese Zeile, nur wenn ihr Text noch stimmt (sonst einmalig gleiche Zeile suchen)
  const schreiben = async (t, ziel) => {
    let ok = false;
    await app.vault.process(t.f, (data) => {
      const z = data.split("\n");
      const passt = (s) => (s || "").replace(/\r$/, "") === t.roh;
      let i = t.nr;
      if (!passt(z[i])) { const tr = []; z.forEach((s, j) => { if (passt(s)) tr.push(j); }); i = tr.length === 1 ? tr[0] : -1; }
      if (i < 0) return data;
      const neu = z[i].replace(/^([\s>]*[-*+] )\[ \]/, "$1[" + ziel + "]");
      if (neu === z[i]) return data;
      z[i] = neu; ok = true;
      return z.join("\n");
    });
    return ok;
  };

  const umschalten = (t, zeile, box) => {
    const k = schluessel(t.f.path, t.nr);
    const w = warte.get(k);
    if (w) { clearTimeout(w.timer); warte.delete(k); zeile.removeClass("is-erledigt"); box.checked = false; return; }
    zeile.addClass("is-erledigt"); box.checked = true;
    const timer = setTimeout(async () => {
      warte.delete(k);
      let ok = false;
      try { ok = await schreiben(t, "x"); } catch (e) { console.error("To-dos abhaken", e); }
      if (!ok) {
        try { new obs.Notice("Die Aufgabe hat sich geändert und wurde nicht abgehakt: " + t.f.basename, 5000); } catch (e) {}
        zeile.removeClass("is-erledigt"); box.checked = false;
      }
      alleNeu(true);
    }, WARTEN);
    warte.set(k, { timer });
  };

  // Markdown in ein Element rendern (Links, fett …), <p> auspacken; ohne Renderer reiner Text
  const md = async (text, ziel, pfad, comp) => {
    const R = obs.MarkdownRenderer;
    try {
      if (R && R.render) await R.render(app, text, ziel, pfad, comp);
      else if (R && R.renderMarkdown) await R.renderMarkdown(text, ziel, pfad, comp);
      else { ziel.setText(text); return; }
    } catch (e) { ziel.setText(text); return; }
    const p = ziel.children.length === 1 && ziel.firstElementChild.tagName === "P" ? ziel.firstElementChild : null;
    if (p) { while (p.firstChild) ziel.insertBefore(p.firstChild, p); p.remove(); }
  };

  const oeffnen = (t, e, quelle) => {
    const neu = !!(e && (e.ctrlKey || e.metaKey));
    app.workspace.openLinkText(t.f.path, quelle || "", neu, { eState: { line: t.nr } });
  };

  const modusVon = (quelle, el, ctx) => {
    try {
      const info = ctx && ctx.getSectionInfo && ctx.getSectionInfo(el);
      if (info) { const kopf = info.text.split("\n")[info.lineStart] || ""; if (/eba-todos\s+fragen/i.test(kopf)) return "fragen"; if (/eba-todos/i.test(kopf)) return "todos"; }
    } catch (e) {}
    return /frage/i.test(quelle || "") ? "fragen" : "todos";
  };

  // Zeichnen: erst unsichtbar aufbauen (Markdown rendert asynchron), dann austauschen; gleiche Daten → nichts tun (kein Flackern)
  const zeichnen = async (inst, erzwingen) => {
    const { el, ctx } = inst;
    const modus = inst.modus;
    const { liste, leer, klasse } = zustand(await lesenBeide(), modus);
    const heute = tag0(basis.date.jetzt());
    const sig = heute.getTime() + "|" + leer + "|" + liste.map((t) => t.f.path + ":" + t.nr + ":" + t.roh + ":" + (warte.has(schluessel(t.f.path, t.nr)) ? 1 : 0)).join("\n");
    if (!erzwingen && inst.sig === sig && el.querySelector(".eba-td-liste, .eba-td-leer")) return;
    inst.sig = sig;
    if (!inst.comp) { inst.comp = obs.MarkdownRenderChild ? new obs.MarkdownRenderChild(el) : null; if (inst.comp && ctx && ctx.addChild) ctx.addChild(inst.comp); }
    let comp = null; // je Zeichnung ein Kind-Component (Links, Vorschau), beim nächsten Zeichnen entladen
    if (obs.Component) { comp = new obs.Component(); if (inst.comp) inst.comp.addChild(comp); else comp.load(); }
    const quelle = (ctx && ctx.sourcePath) || "";
    const neu = el.ownerDocument.createElement("div");
    neu.className = klasse;
    const stopp = (k) => k.addEventListener("mousedown", (e) => e.stopPropagation()); // Bearbeitungsansicht: nicht in den Quelltext springen
    if (!liste.length) neu.createDiv({ cls: "eba-td-leer", text: leer });
    else {
      const ul = neu.createDiv({ cls: "eba-td-liste", attr: { role: "list" } });
      const warten = [];
      for (const t of liste) {
        const zeile = ul.createDiv({ cls: "eba-td-zeile", attr: { role: "listitem" } });
        const haken = zeile.createEl("label", { cls: "eba-td-haken" });
        const box = haken.createEl("input", { attr: { type: "checkbox", "aria-label": modus === "fragen" ? "Frage beantwortet" : "Erledigt" } });
        if (warte.has(schluessel(t.f.path, t.nr))) { box.checked = true; zeile.addClass("is-erledigt"); }
        stopp(haken);
        haken.addEventListener("click", (e) => e.stopPropagation());
        box.addEventListener("change", (e) => { e.stopPropagation(); umschalten(t, zeile, box); });
        const inhalt = zeile.createDiv({ cls: "eba-td-inhalt" });
        const text = inhalt.createDiv({ cls: "eba-td-text" });
        warten.push(md(t.text, text, t.f.path, comp || inst.comp));
        const meta = inhalt.createDiv({ cls: "eba-td-meta" });
        if (t.faellig) {
          const n = Math.round((tag0(t.faellig) - heute) / TAG);
          const art = n < 0 ? "bad" : n <= 2 ? "akzent" : "leer";
          meta.createSpan({ cls: "eba-pill eba-td-frist " + art, text: n === 0 ? "bis heute" : n === 1 ? "bis morgen" : "bis " + kurz(t.faellig), attr: { title: n < 0 ? "überfällig" : "" } });
        }
        meta.createEl("a", { cls: "internal-link eba-td-quelle", text: kurzname(t.f), href: t.f.path, attr: { "data-href": t.f.path, title: t.f.basename } });
        if (t.belege) { const b = meta.createSpan({ cls: "eba-td-belege" }); warten.push(md(t.belege, b, t.f.path, comp || inst.comp)); }
        // Klick: Link im Text folgen, sonst die Quellnotiz an dieser Zeile öffnen
        stopp(inhalt);
        inhalt.addEventListener("click", (e) => {
          const a = e.target.closest ? e.target.closest("a") : null;
          if (a && !a.hasClass("internal-link")) return; // externe Links: Obsidian öffnet sie selbst
          e.preventDefault(); e.stopPropagation();
          if (a && !a.hasClass("eba-td-quelle")) { app.workspace.openLinkText(a.getAttr("data-href") || a.getAttr("href") || "", t.f.path, e.ctrlKey || e.metaKey); return; }
          oeffnen(t, e, quelle);
        });
      }
      await Promise.all(warten);
    }
    if (!el.isConnected && inst.drin) return;
    el.empty();
    el.addClass("eba-td-block");
    el.appendChild(neu);
    inst.drin = true;
    if (inst.compAlt) try { if (inst.comp) inst.comp.removeChild(inst.compAlt); else inst.compAlt.unload(); } catch (e) {}
    inst.compAlt = comp;
  };

  let block = null; // Codeblock-Griff (ctx.codeblock), gesetzt in registrieren()
  const alleNeu = (erzwingen) => {
    if (!block) return;
    for (const i of block.instanzen()) zeichnen(i, erzwingen).catch((e) => { console.error("To-dos", e); });
  };

  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (quelle, el, c, inst) => {
      inst.modus = modusVon(quelle, el, c);
      const ersatz = () => { el.empty(); el.createDiv({ cls: "eba-td-leer", text: String(quelle || "").trim() }); };
      try {
        return zeichnen(inst, true).catch((e) => { console.error("To-dos", e); ersatz(); });
      } catch (e) { console.error("To-dos", e); ersatz(); }
      return undefined;
    });
    const bald = ctx.entprellen(() => alleNeu(false), 700);
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => {
      if (ausgeschlossen(f.path)) return;
      const hat = cache && cache.listItems && cache.listItems.some((li) => li.task !== undefined);
      const war = block.instanzen().some((i) => i.sig && i.sig.indexOf(f.path + ":") >= 0);
      if (hat || war) bald();
    });
    ctx.an(app.metadataCache, "deleted", bald);
    ctx.an(app.vault, "rename", bald);
    ctx.intervall(() => alleNeu(false), 30 * 60 * 1000); // Tageswechsel: „bis morgen“ → „bis heute“
  };

  return { registrieren, zeichnen, lesen, lesenBeide, zustand, faellig, kurzname, zerlegen };
};
