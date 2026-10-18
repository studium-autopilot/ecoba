// „Bitte prüfen“ auf dem Dashboard: Codeblock ```eba-bitte-pruefen``` (seit 18.10.2026, unter „Zu erledigen“). Nur für den
// eigenen Uni-Abgleich (eba.eigenerAbgleich, dieselbe Regel wie ilias.js und zentral.js: System/Skripte/abgleich.js im Tresor
// oder „ilias_unterlagen: extern“). Schreibt dieser Abgleich ein Protokoll System/Abgleich/Protokoll.md mit einem Abschnitt
// „Bitte prüfen“ (Überschrift beliebiger Ebene, bis zur nächsten gleich hohen oder höheren), zeigt der Block eine Karte:
// Titel „Bitte prüfen · n offen“ (eingeklappt, ein Tipp klappt auf; der Zustand bleibt beim Neuzeichnen), Knöpfe „Protokoll“
// und, nur wenn der eigene Abgleich die Aktion „abgleich“ anmeldet, „Jetzt abgleichen“ (dieses Skript startet keinen Abgleich
// selbst). Darunter je Punkt der Liste eine Zeile wie bei den To-dos: Kästchen (`- [ ]`/`- [x]`; ein Tipp schreibt genau diese
// Zeile des Protokolls um, der Text wird vorher geprüft), Text als Markdown (Links gehen, Wurzel ist das Protokoll), „**Titel**
// · Rest“ als Titel und Metazeile, eingerückte Unterpunkte gedämpft darunter. Abgehakte bleiben durchgestrichen stehen, bis der
// Abgleich sie wegräumt.
// Meldekanal der Quellen (seit 0.4.5, für alle; quellen.js, Quellen-Vertrag): Punkte, die eine Quelle mit Q.melden anmeldet,
// ohne Kästchen und ohne persönliche Werte, z. B. aus Noten & Anmeldungen „**Aus Alma** · neue Angaben zu B110, auf der
// Modulseite übernehmen“, aus ILIAS „**ILIAS** · 12 Dateien fehlen gerade in Unterlagen …“ oder aus dem Alma-Stundenplan
// „**Stundenplan** · … steht nicht mehr in Alma“. Ein Tipp öffnet ihr Ziel. Ohne Protokoll keine Knöpfe.
// In allen anderen Fällen (kein eigener Abgleich, kein Protokoll, kein Abschnitt, keine Punkte) zeichnet der Block nichts: Klasse
// eba-bp-aus, samt Hülle auf Höhe 0 gefaltet (eba-core.css Abschnitt 59; nie display:none an der Hülle, siehe
// tests/leseansicht.test.js). Normale Nutzer:innen sehen also keine leere Karte.
// Erweiterung: registrieren() meldet Codeblock und Ereignisse über die Helfer in ctx an (Hot-Reload ohne Neustart).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const PROTOKOLL = "System/Abgleich/Protokoll.md";
const AKTION = "abgleich";
const UEBERSCHRIFT = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/;
const PUNKT = /^([ \t]*)[-*+][ \t]+(?:\[([ xX])\](?:[ \t]+|$))?(.*)$/;
const TITEL_REST = /^(\*\*[^*]+\*\*)\s*·\s*(.+)$/;
const einrueckung = (s) => s.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;

// Text des Protokolls → { punkte: [{ zeile, roh, haken: " " | "x" | null (Punkt ohne Kästchen), text, meta, details: [] }],
// offen } oder null (kein Abschnitt „Bitte prüfen“ oder keine Punkte darin).
const lesen = (text) => {
  const z = String(text == null ? "" : text).split("\n").map((s) => s.replace(/\r$/, ""));
  let i = 0;
  if (z[0] === "---") { const e = z.indexOf("---", 1); if (e > 0) i = e + 1; }
  let ebene = 0;
  for (; i < z.length; i++) {
    const m = z[i].match(UEBERSCHRIFT);
    if (m && m[2].trim().toLowerCase() === "bitte prüfen") { ebene = m[1].length; i++; break; }
  }
  if (!ebene) return null;
  const punkte = [];
  let tiefe = null, p = null, code = false;
  for (; i < z.length; i++) {
    const s = z[i];
    if (/^[ \t]*(```|~~~)/.test(s)) code = !code;
    const h = !code && s.match(UEBERSCHRIFT);
    if (h) { if (h[1].length <= ebene) break; p = null; continue; }
    if (!s.trim()) continue;
    const e = einrueckung(s);
    const m = !code && s.match(PUNKT);
    if (m && (tiefe === null || e <= tiefe)) {
      tiefe = e;
      const haken = m[2] == null ? null : m[2].toLowerCase();
      const inhalt = m[3].trim();
      const t = inhalt.match(TITEL_REST);
      p = { zeile: i, roh: s, haken, text: t ? t[1] : inhalt, meta: t ? t[2].trim() : "", details: [] };
      punkte.push(p);
    } else if (p && tiefe !== null && e > tiefe) {
      const d = s.trim().replace(/^[-*+][ \t]+/, "");
      if (d) p.details.push(d);
    } else p = null; // Text außerhalb der Liste beendet den Punkt davor
  }
  if (!punkte.length) return null;
  return { punkte, offen: punkte.filter((x) => x.haken !== "x").length };
};

// Kästchen eines Punkts setzen (ziel " " oder "x") → neuer Text oder null (Zeile nicht mehr eindeutig da, nichts zu ändern).
// Erst die gemerkte Zeile, sonst die eine Zeile mit genau diesem Text.
const haken = (text, p, ziel) => {
  const z = String(text).split("\n");
  const passt = (s) => (s || "").replace(/\r$/, "") === p.roh;
  let i = p.zeile;
  if (!passt(z[i])) { const tr = []; z.forEach((s, j) => { if (passt(s)) tr.push(j); }); i = tr.length === 1 ? tr[0] : -1; }
  if (i < 0) return null;
  const neu = z[i].replace(/^([ \t]*[-*+][ \t]+)\[[ xX]\]/, "$1[" + ziel + "]");
  if (neu === z[i]) return null;
  z[i] = neu;
  return z.join("\n");
};

// Punkte der Quellen (Q.meldungen: [{ quelle, text: "**Titel** · Rest", pfad, anker? }]) → Punkte wie aus dem Protokoll, ohne
// Kästchen; quelle = Name der Quelle (für die Klasse und das Ziel beim Tippen)
const quellenPunkte = (liste) => (Array.isArray(liste) ? liste : []).filter((x) => x && x.text && x.pfad).map((x) => {
  const t = String(x.text).match(TITEL_REST);
  return { zeile: null, roh: "", haken: null, text: t ? t[1] : String(x.text), meta: t ? t[2].trim() : "", details: [], ziel: String(x.pfad), anker: x.anker ? String(x.anker) : "", quelle: String(x.quelle || "quelle") };
});

module.exports = function (ctx) {
  const app = window.app;
  const obs = (ctx && ctx.obsidian) || {};
  const SPRACHE = "eba-bitte-pruefen";
  const datei = (pfad) => { const f = app.vault.getAbstractFileByPath(pfad); return f && !f.children ? f : null; };
  const einstellungen = () => { const f = datei("System/Einstellungen.md"); return (f && app.metadataCache.getFileCache(f)?.frontmatter) || {}; };
  // Eigener Uni-Abgleich (eba.js); fehlt eba.js, gibt es keinen
  const eigenerAbgleich = () => {
    const f = ctx.user && ctx.user.eba && ctx.user.eba.eigenerAbgleich;
    return !!f && f((p) => !!app.vault.getAbstractFileByPath(p), einstellungen());
  };
  const jetztAbgleichen = () => !!(ctx.plugin && ctx.plugin.aktionen && ctx.plugin.aktionen[AKTION]);
  // Aufgeklappt? Gilt für alle Blöcke dieses Geräts und überlebt Neuzeichnen und Hot-Reload
  const auf = ctx.bleibend("auf", () => ({ wert: false }));

  // Daten für den Block: null = nichts zeichnen. Protokoll des eigenen Abgleichs (protokoll: true) und Punkte der Quellen
  const Q = () => (ctx.user && ctx.user.quellen) || null;
  const daten = async () => {
    let d = null;
    const f = eigenerAbgleich() ? datei(PROTOKOLL) : null;
    if (f) { try { d = lesen(await app.vault.cachedRead(f)); } catch (e) { d = null; } }
    let quellen = [];
    try { quellen = Q() ? quellenPunkte(Q().meldungen(ctx)) : []; } catch (e) { quellen = []; }
    if (!quellen.length) return d ? Object.assign(d, { protokoll: true }) : null;
    const punkte = (d ? d.punkte : []).concat(quellen);
    return { punkte, offen: punkte.filter((x) => x.haken !== "x").length, protokoll: !!d };
  };

  // Markdown in ein Element rendern, <p> auspacken; ohne Renderer reiner Text
  const md = async (text, ziel, comp) => {
    const R = obs.MarkdownRenderer;
    try {
      if (R && R.render) await R.render(app, text, ziel, PROTOKOLL, comp);
      else { ziel.setText(text); return; }
    } catch (e) { ziel.setText(text); return; }
    const p = ziel.children.length === 1 && ziel.firstElementChild.tagName === "P" ? ziel.firstElementChild : null;
    if (p) { while (p.firstChild) ziel.insertBefore(p.firstChild, p); p.remove(); }
  };

  const melden = (text) => { try { new obs.Notice(text, 5000); } catch (e) { /* ohne Obsidian */ } };
  const umschalten = async (p, box, zeile) => {
    const ziel = box.checked ? "x" : " ";
    zeile.toggleClass("is-erledigt", ziel === "x");
    const f = datei(PROTOKOLL);
    let ok = false;
    try {
      if (f) await app.vault.process(f, (alt) => { const neu = haken(alt, p, ziel); ok = neu != null; return ok ? neu : alt; });
    } catch (e) { console.error(SPRACHE, e); }
    if (!ok) {
      melden("Der Punkt hat sich im Protokoll geändert. Bitte dort abhaken.");
      box.checked = ziel !== "x";
      zeile.toggleClass("is-erledigt", ziel !== "x");
    }
  };

  // Link im Text öffnen (Wurzel: das Protokoll); fehlt die Notiz, nicht anlegen
  const linkOeffnen = (a, e) => {
    const ziel = a.getAttribute("data-href") || a.getAttribute("href") || "";
    const pfad = ziel.split("#")[0];
    if (pfad && !app.metadataCache.getFirstLinkpathDest(pfad, PROTOKOLL)) { melden(`„${pfad}“ gibt es in deinem Tresor nicht.`); return; }
    app.workspace.openLinkText(ziel, PROTOKOLL, !!(e.ctrlKey || e.metaKey));
  };
  const protokollOeffnen = (e, zeile) => {
    app.workspace.openLinkText(PROTOKOLL, "", !!(e && (e.ctrlKey || e.metaKey)), zeile == null ? undefined : { eState: { line: zeile } });
  };

  // Karte mit dem Aufbau eines Callouts (Stil der übrigen Karten), aber selbst gezeichnet: So bleibt der Klapp-Zustand beim
  // Neuzeichnen und kein Kästchen gehört zum Dashboard.
  const karte = async (doc, d, comp) => {
    const k = doc.createElement("div");
    k.className = "callout is-collapsible" + (auf.wert ? "" : " is-collapsed");
    k.setAttribute("data-callout", "eba-pruefen");
    k.setAttribute("data-callout-metadata", "");
    k.setAttribute("data-callout-fold", auf.wert ? "+" : "-");
    const titel = k.createDiv({ cls: "callout-title", attr: { role: "button", tabindex: "0", "aria-expanded": String(auf.wert) } });
    const symbol = titel.createDiv({ cls: "callout-icon" });
    if (obs.setIcon) obs.setIcon(symbol, "clipboard-check");
    titel.createDiv({ cls: "callout-title-inner", text: "Bitte prüfen · " + (d.offen ? d.offen + " offen" : "alles abgehakt") });
    const pfeil = titel.createDiv({ cls: "callout-fold" + (auf.wert ? "" : " is-collapsed") });
    if (obs.setIcon) obs.setIcon(pfeil, "chevron-down");
    const inhalt = k.createDiv({ cls: "callout-content" });
    if (!auf.wert) inhalt.style.display = "none";
    const klappen = () => {
      auf.wert = !auf.wert;
      for (const x of doc.querySelectorAll('.callout[data-callout="eba-pruefen"]')) {
        x.toggleClass("is-collapsed", !auf.wert);
        x.setAttribute("data-callout-fold", auf.wert ? "+" : "-");
        const t = x.querySelector(":scope > .callout-title");
        if (t) t.setAttribute("aria-expanded", String(auf.wert));
        const f = x.querySelector(":scope > .callout-title > .callout-fold");
        if (f) f.toggleClass("is-collapsed", !auf.wert);
        const c = x.querySelector(":scope > .callout-content");
        if (c) c.style.display = auf.wert ? "" : "none";
      }
    };
    titel.addEventListener("click", (e) => { e.preventDefault(); klappen(); });
    titel.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); klappen(); } });

    if (d.protokoll) {
      const knoepfe = inhalt.createDiv({ cls: "eba-bp-knoepfe" });
      const zum = knoepfe.createEl("a", { cls: "eba-vb-knopf", text: "Protokoll", href: "#" });
      zum.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); protokollOeffnen(e); });
      if (jetztAbgleichen()) knoepfe.createEl("a", { cls: "eba-vb-knopf cta", text: "Jetzt abgleichen", href: ctx.link(AKTION, {}) });
    }

    const liste = inhalt.createDiv({ cls: "eba-td eba-bp-liste", attr: { role: "list" } });
    const warten = [];
    for (const p of d.punkte) {
      const zeile = liste.createDiv({ cls: "eba-td-zeile" + (p.haken === "x" ? " is-erledigt" : ""), attr: { role: "listitem" } });
      if (p.haken === null) zeile.createSpan({ cls: "eba-bp-punkt", attr: { "aria-hidden": "true" } });
      else {
        const label = zeile.createEl("label", { cls: "eba-td-haken" });
        const box = label.createEl("input", { attr: { type: "checkbox", "aria-label": "Geprüft" } });
        box.checked = p.haken === "x";
        label.addEventListener("click", (e) => e.stopPropagation());
        box.addEventListener("change", (e) => { e.stopPropagation(); umschalten(p, box, zeile); });
      }
      const inh = zeile.createDiv({ cls: "eba-td-inhalt" });
      warten.push(md(p.text, inh.createDiv({ cls: "eba-td-text" }), comp));
      if (p.meta) warten.push(md(p.meta, inh.createDiv({ cls: "eba-td-meta" }), comp));
      for (const t of p.details) warten.push(md(t, inh.createDiv({ cls: "eba-bp-detail" }), comp));
      // Tipp: Link folgen (extern öffnet Obsidian selbst), sonst das Protokoll an dieser Zeile; Punkte einer Quelle: ihr Ziel
      inh.addEventListener("click", (e) => {
        const a = e.target.closest ? e.target.closest("a") : null;
        if (a && !a.classList.contains("internal-link")) return;
        e.preventDefault(); e.stopPropagation();
        if (p.quelle) app.workspace.openLinkText(p.ziel + (p.anker ? "#" + p.anker : ""), "", !!(e.ctrlKey || e.metaKey));
        else if (a) linkOeffnen(a, e); else protokollOeffnen(e, p.zeile);
      });
      if (p.quelle) zeile.addClass("eba-bp-quelle");
    }
    // Bearbeitungsansicht: ein Tipp in die Karte springt nicht in den Quelltext
    k.addEventListener("mousedown", (e) => e.stopPropagation());
    await Promise.all(warten);
    return k;
  };

  // Zeichnen: gleiche Daten → nichts tun (Klapp-Zustand und Kästchen bleiben ruhig); neu erst unsichtbar aufbauen, dann tauschen
  const zeichnen = async (inst) => {
    const { el } = inst;
    const d = await daten();
    const knopf = jetztAbgleichen();
    const sig = d ? JSON.stringify([knopf, d.protokoll, d.punkte.map((p) => [p.zeile, p.roh, p.details, p.quelle ? p.text + p.meta + p.ziel : ""])]) : "";
    if (inst.sig === sig && inst.gezeichnet) return;
    inst.sig = sig;
    if (!d) {
      el.empty();
      el.addClass("eba-bp-aus");
      inst.gezeichnet = true;
      if (inst.comp) { try { inst.comp.unload(); } catch (e) { /* schon weg */ } inst.comp = null; }
      return;
    }
    const comp = obs.MarkdownRenderChild ? new obs.MarkdownRenderChild(el) : null;
    if (comp) { if (inst.ctx && inst.ctx.addChild) inst.ctx.addChild(comp); else comp.load(); }
    const k = await karte(el.ownerDocument, d, comp);
    if (inst.sig !== sig) { if (comp) try { comp.unload(); } catch (e) { /* weg */ } return; } // inzwischen neuer gezeichnet
    if (inst.comp) { try { inst.comp.unload(); } catch (e) { /* schon weg */ } }
    inst.comp = comp;
    el.empty();
    el.removeClass("eba-bp-aus");
    el.appendChild(k);
    inst.gezeichnet = true;
  };

  let block = null;
  const alleNeu = () => { if (block) for (const i of block.instanzen()) zeichnen(i).catch((e) => console.error(SPRACHE, e)); };

  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (_q, el, _c, inst) => {
      inst.sig = null;
      inst.gezeichnet = false;
      el.addClass("eba-bp-aus"); // bis feststeht, ob es etwas zu zeigen gibt
      return zeichnen(inst).catch((e) => { console.error(SPRACHE, e); el.empty(); el.addClass("eba-bp-aus"); });
    });
    const bald = ctx.entprellen(alleNeu, 500);
    const wichtig = (p) => p === PROTOKOLL || p === "System/Einstellungen.md" || String(p).indexOf("System/Skripte/") === 0;
    ctx.an(app.metadataCache, "changed", (f) => { if (wichtig(f.path) || String(f.path).indexOf("Module/") === 0) bald(); });
    // Punkte der Quellen: neu, wenn eine Quelle meldet, dass sich ihre Punkte geändert haben (Q.meldenNeu)
    if (Q()) Q().beiMeldung(ctx, bald);
    ctx.an(app.vault, "create", (f) => { if (wichtig(f.path)) bald(); });
    ctx.an(app.vault, "delete", (f) => { if (wichtig(f.path)) bald(); });
    ctx.an(app.vault, "rename", (f, alt) => { if (wichtig(f.path) || wichtig(alt)) bald(); });
  };

  return { registrieren, zeichnen, daten, lesen, haken, eigenerAbgleich };
};
module.exports.lesen = lesen;
module.exports.quellenPunkte = quellenPunkte;
module.exports.haken = haken;
module.exports.PROTOKOLL = PROTOKOLL;
