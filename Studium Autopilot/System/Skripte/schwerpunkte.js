// Schwerpunkte im Studienverlauf (seit 17.10.2026; vorher die Seite „Schwerpunkt-Planer“): Codeblock ```eba-schwerpunkte``` auf
// Studium/Studienverlauf.md unter dem Musterstudienplan. Prüft deine Schwerpunktbereiche nach dem Besonderen Teil EcoBA: genau
// 3 Bereiche, jeder 15–30 ECTS, zusammen 75 (Economics) bzw. 63 ECTS, dazu je Variante die Seite (Economics: mind. 2 VWL-Bereiche,
// Business Administration: mind. 2 BWL-Bereiche, sonst je mind. 1; Data Science zählt für beide). Elective Studies ist ein
// Bereich ohne Seite.
// Gezählt wird, was im Plan ist (gewaehlt: true): Schwerpunktmodule im Bereich ihres Felds „anrechnung“ („Anrechnung in“),
// Module aus Profil & Vertiefung als Elective Studies, wenn das ihre Rolle in deiner Variante ist oder bei „Zählt als“ Elective
// Studies steht (nie, wo sie Pflicht sind; dieselbe Regel wie die Formel „block“ auf Noten & ECTS).
// Sichtbar ab dem 2. Fachsemester oder sobald ein Schwerpunkt- oder Profilmodul im Plan ist; sonst ist der Block leer
// (.eba-sp-aus) und eba-core.css blendet ihn samt Überschrift „Schwerpunkte“ aus. Inhalt: Balken nur für Bereiche mit ECTS
// (Achse 15 / 30, darunter „ECTS“), die Prüfliste, zugeklappt die Module je Bereich (aus dem Feld „bereiche“ der Modulnotizen, Chips öffnen
// die Notiz). Schreibt keine Datei.
// Für andere Skripte und Tests: ctx.schwerpunkte = { rechnen, sichtbar, sichtbarFuer, BEREICHE }.
// Stil: eba-core.css Abschnitte 15 (Balken, Prüfliste) und 56 (Aufbau, Achse, Module je Bereich).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const SPRACHE = "eba-schwerpunkte";
  const ES = "Elective Studies";
  const MIN = 15, MAX = 30;
  // Reihenfolge wie im Besonderen Teil: VWL-Bereiche, Data Science (VWL und BWL), BWL-Bereiche, Elective Studies
  const BEREICHE = [
    { name: "Economic History and Development Economics", kurz: "Economic History & Development", vwl: true },
    { name: "Economic Policy", vwl: true },
    { name: "Firms and Markets", vwl: true },
    { name: "International Economics", vwl: true },
    { name: "Data Science", vwl: true, bwl: true },
    { name: "Banking and Finance", bwl: true },
    { name: "Financial Accounting and Business Taxation", kurz: "Financial Accounting & Taxation", bwl: true },
    { name: "International Business", bwl: true },
    { name: "Managerial Accounting and Organisation", kurz: "Managerial Accounting & Org.", bwl: true },
    { name: "Marketing", bwl: true },
    { name: ES },
  ];
  const NAMEN = BEREICHE.map((b) => b.name);

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const zahl = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : 0; };
  const zahlText = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
  const seiteVon = (b) => (b.vwl && b.bwl ? "VWL + BWL" : b.vwl ? "VWL" : b.bwl ? "BWL" : "");
  const nachCode = (a, b) => a.code.localeCompare(b.code, "de");

  // ---------- Rechnen (rein, ohne Obsidian) ----------
  // Modul aus Profil & Vertiefung als Elective Studies?
  const profilAlsES = (m, v) => (v === "Economics" && m.rolle_economics === ES) || (v === "Business Administration" && m.rolle_ba === ES)
    || (m.anrechnung === ES && !(v === "Economics" && m.rolle_economics === "Pflicht") && !(v === "Business Administration" && m.rolle_ba === "Pflicht"));
  // Bereich, in dem ein Modul deines Plans zählt, sonst ""
  const bereichVon = (m, v) => {
    if (!m.gewaehlt) return "";
    const profil = m.gruppe === "Profil & Vertiefung" && profilAlsES(m, v);
    if (m.gruppe !== "Schwerpunkt" && !profil) return "";
    if (NAMEN.indexOf(m.anrechnung) >= 0) return m.anrechnung;
    return profil ? ES : "";
  };
  // module: [{ code, titel, ects, gruppe, anrechnung, gewaehlt, rolle_economics, rolle_ba, pfad, bereiche }]
  // → { variante, bereiche (alle, mit ects, stand leer|ok|warn, module), belegt (ects > 0), ohne (im Plan, zählt nirgends),
  //     summe, soll, vwl, bwl, seiteText, pruefung: { drei, rahmen, summe, seite }, ok }
  const rechnen = (module, variante) => {
    const v = String(variante || "").trim() || "offen";
    const bereiche = BEREICHE.map((b) => ({ name: b.name, kurz: b.kurz || b.name, vwl: !!b.vwl, bwl: !!b.bwl, seite: seiteVon(b), ects: 0, module: [] }));
    const ohne = [];
    for (const m of module) {
      const n = bereichVon(m, v);
      if (n) { const b = bereiche[NAMEN.indexOf(n)]; b.ects += m.ects; b.module.push(m); } else if (m.gewaehlt && m.gruppe === "Schwerpunkt") ohne.push(m);
    }
    for (const b of bereiche) { b.stand = !b.ects ? "leer" : b.ects < MIN || b.ects > MAX ? "warn" : "ok"; b.module.sort(nachCode); }
    const belegt = bereiche.filter((b) => b.ects > 0);
    const vwl = belegt.filter((b) => b.vwl).length, bwl = belegt.filter((b) => b.bwl).length;
    const summe = Math.round(belegt.reduce((a, b) => a + b.ects, 0) * 10) / 10;
    const soll = v === "Economics" ? 75 : 63;
    const seiteOk = v === "Economics" ? vwl >= 2 : v === "Business Administration" ? bwl >= 2 : vwl >= 1 && bwl >= 1;
    const seiteText = v === "Economics" ? `mind. 2 VWL-Bereiche (${vwl})` : v === "Business Administration" ? `mind. 2 BWL-Bereiche (${bwl})`
      : `mind. 1 VWL- und 1 BWL-Bereich (${vwl} / ${bwl})`;
    const pruefung = { drei: belegt.length === 3, rahmen: belegt.length > 0 && belegt.every((b) => b.stand === "ok"), summe: summe === soll, seite: belegt.length > 0 && seiteOk };
    return { variante: v, bereiche, belegt, ohne: ohne.sort(nachCode), summe, soll, vwl, bwl, seiteText, pruefung,
      ok: pruefung.drei && pruefung.rahmen && pruefung.summe && pruefung.seite };
  };
  // Sichtbar ab dem 2. Fachsemester oder sobald ein Schwerpunkt- oder Profilmodul im Plan ist
  const sichtbarFuer = (fachsemester, vorStart, module) => (!vorStart && fachsemester >= 2)
    || module.some((m) => m.gewaehlt && (m.gruppe === "Schwerpunkt" || m.gruppe === "Profil & Vertiefung"));

  // ---------- Daten lesen (Datenmodell modell.js, sonst direkt aus dem metadataCache) ----------
  const modulVon = (fm, pfad) => ({
    code: String(fm.code == null ? pfad.split("/").pop().split(" ")[0] : fm.code), titel: String(fm.titel == null ? "" : fm.titel),
    ects: zahl(fm.ects), gruppe: String(fm.gruppe == null ? "" : fm.gruppe), anrechnung: String(fm.anrechnung == null ? "" : fm.anrechnung).trim(),
    gewaehlt: fm.gewaehlt === true, rolle_economics: fm.rolle_economics, rolle_ba: fm.rolle_ba, pfad,
    bereiche: Array.isArray(fm.bereiche) ? fm.bereiche.map(String) : [],
  });
  const lesen = () => {
    const d = ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null;
    const module = [];
    if (d) for (const x of d.module) module.push(modulVon(x.fm, x.f.path));
    else {
      for (const f of app.vault.getMarkdownFiles()) {
        const c = app.metadataCache.getFileCache(f), fm = c && c.frontmatter;
        if (fm && fm.typ === "modul" && f.path.indexOf("Module/") === 0) module.push(modulVon(fm, f.path));
      }
    }
    const ef = app.vault.getAbstractFileByPath("System/Einstellungen.md");
    const ein = (ef && app.metadataCache.getFileCache(ef) && app.metadataCache.getFileCache(ef).frontmatter) || {};
    return { module, variante: d ? d.variante : String(ein.variante == null ? "" : ein.variante).trim() || "offen",
      fachsemester: d ? d.fachsemester : 1, vorStart: d ? !!d.vorStart : false };
  };
  const sichtbar = () => { const D = lesen(); return sichtbarFuer(D.fachsemester, D.vorStart, D.module); };

  // ---------- Zeichnen ----------
  const chip = (m, cls, title) => `<a class="eba-sp-chip${cls ? " " + cls : ""}" href="#" data-pfad="${esc(m.pfad)}" title="${esc(title)}">${esc(m.code)}</a>`;
  const balken = (b) => `<div class="eba-bereich ${b.stand}" title="${esc(b.name + ": " + b.module.map((m) => m.code).join(", "))}">`
    + `<span class="n">${esc(b.kurz)}</span><span class="t">${esc(b.seite)}</span>`
    + `<span class="bar"><i style="width:${Math.min(100, (b.ects / MAX) * 100).toFixed(1)}%"></i><em></em></span><span class="z">${zahlText(b.ects)}</span></div>`;
  // Achse in den Spalten der Balken: 15 am Strich, 30 am Ende, „ECTS“ unter den Zahlen
  const ACHSE = `<div class="eba-sp-achse" aria-hidden="true"><span></span><span></span><span class="skala"><i>${MIN}</i><i>${MAX}</i></span><span class="z">ECTS</span></div>`;
  const pruefliste = (R) => {
    const li = (ok, html) => `<li class="${ok ? "ok" : ""}">${html}</li>`;
    const p = R.pruefung;
    return `<div class="eba-pruefliste"><span class="k">Variante: ${esc(R.variante === "offen" ? "noch offen" : R.variante)}</span><ul>`
      + li(p.drei, `Genau 3 Bereiche <b>(${R.belegt.length})</b>`)
      + li(p.rahmen, `Jeder Bereich ${MIN}–${MAX} ECTS`)
      + li(p.summe, `Summe <b>${zahlText(R.summe)} / ${R.soll} ECTS</b>`)
      + li(p.seite, esc(R.seiteText)) + `</ul>`
      + (R.ohne.length ? `<p class="eba-sp-ohne">Ohne Bereich: ${R.ohne.map((m) => chip(m, "", `${m.code} ${m.titel}`)).join(" ")}</p>` : "")
      + `</div>`;
  };
  // Module je Bereich, ohne Elective Studies (dort zählt fast jedes Modul). Im Plan: in seinem Bereich markiert, sonst gestrichelt.
  const katalog = (module) => {
    let h = "";
    for (const b of BEREICHE) {
      if (b.name === ES) continue;
      const ms = module.filter((m) => m.bereiche.indexOf(b.name) >= 0).sort(nachCode);
      if (!ms.length) continue;
      h += `<div class="eba-sp-gruppe"><div class="eba-sp-gkopf"><b>${esc(b.kurz || b.name)}</b><span class="t">${esc(seiteVon(b))}</span></div><div class="eba-sp-chips">`
        + ms.map((m) => {
          const hier = m.gewaehlt && m.anrechnung === b.name;
          const anders = m.gewaehlt && !hier;
          return chip(m, hier ? "plan" : anders ? "anders" : "", `${m.code} ${m.titel}${hier ? " · im Plan" : anders ? ` · im Plan, zählt in ${m.anrechnung || "keinem Bereich"}` : ""}`);
        }).join("") + `</div></div>`;
    }
    return h ? `<details class="eba-sp-mehr"><summary>Module je Bereich</summary><div class="eba-sp-katalog">${h}</div></details>` : "";
  };

  const zeichnen = (inst) => {
    const el = inst.el;
    const D = lesen();
    if (!sichtbarFuer(D.fachsemester, D.vorStart, D.module)) { el.classList.add("eba-sp-aus"); el.innerHTML = ""; return; }
    el.classList.remove("eba-sp-aus");
    const R = rechnen(D.module, D.variante);
    const bereiche = R.belegt.length ? R.belegt.map(balken).join("") + ACHSE : `<div class="eba-sp-leer">Noch keine Module im Plan.</div>`;
    el.innerHTML = `<div class="eba-sp" lang="de"><div class="eba-bereiche">${bereiche}</div>${pruefliste(R)}${katalog(D.module)}</div>`;
    const root = el.firstElementChild;
    const mehr = root.querySelector("details");
    if (mehr) {
      if (inst.offen) mehr.open = true;
      mehr.addEventListener("toggle", () => { inst.offen = mehr.open; });
    }
    root.addEventListener("click", (e) => {
      const a = e.target.closest ? e.target.closest("[data-pfad]") : null;
      if (!a || !root.contains(a)) return;
      e.preventDefault(); e.stopPropagation();
      app.workspace.openLinkText(a.getAttribute("data-pfad"), (inst.ctx && inst.ctx.sourcePath) || "", e.ctrlKey || e.metaKey);
    });
  };

  // ---------- Registrierung (Helfer in ctx) ----------
  const registrieren = () => {
    const block = ctx.codeblock(SPRACHE, (quelle, el, c, inst) => {
      inst = inst || { el, ctx: c, quelle };
      try { zeichnen(inst); } catch (e) { console.error("eba-schwerpunkte", e); el.classList.remove("eba-sp-aus"); el.textContent = String(quelle || "Schwerpunkte"); }
    });
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(() => block.neu()));
  };

  ctx.schwerpunkte = { rechnen, sichtbar, sichtbarFuer, BEREICHE };
  return { registrieren, rechnen, sichtbarFuer };
};
