// Personalisieren (Phase 2b): der Vault ist ohne Angaben sofort nutzbar. Seit 0.3.0 fragt die Einrichtung (einrichtung.js)
// beim ersten Start; dieses Formular bleibt für „Ändern“.
// Standard ohne Angaben: Studienbeginn = aktuelles Semester (1. FS), Variante „offen“, neutrale Begrüßung.
//   ```eba-personalisieren```  früher die Karte oben auf dem Dashboard; seit 0.3.0 leer (die Einrichtung ersetzt sie). Der
//                              Block zeichnet nichts, damit ältere, selbst geänderte Dashboards keine Lücke zeigen.
//   ```eba-personalisieren angaben```  „Deine Angaben“ (Einstellungen & Hilfe): solange Name UND Studienbeginn leer sind, eine
//                              kleine Karte „Noch nichts eingetragen.“ + Knopf „Einrichtung starten“; sonst Name, Zielnote,
//                              Studienbeginn (leere Werte „–“) + Knöpfe „Ändern“ und „Einrichtung erneut starten“.
//   Aktion „personalisieren“   EIN Formular-Fenster (Name, Studienbeginn als Semester-Auswahl, Variante, Zielnote 1,0–4,0),
//                              speichert nach System/Einstellungen.md. Auch als Befehl und Knopf in den Einstellungen.
// Nach dem Speichern zieht das Datenmodell (modell.js) Semesterliste, Pausen und Prüfungsphasen in den Einstellungen nach.
// Erweiterung: Das Plugin ruft registrieren() auf (Codeblock über ctx.codeblock) und übernimmt die aktionen. Stil: eba-core.css Abschnitt 43.
module.exports = function (ctx) {
  const app = window.app;
  const { Modal, Notice } = ctx.obsidian;
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const VARIANTEN = ["offen", "Economics", "Business Administration", "ohne Spezialisierung"];

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const dmy = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "");
  const D = () => (ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null);
  const fmVon = () => { const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN); const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };

  // Zielnote: leer erlaubt; sonst 1,0–4,0 mit höchstens zwei Nachkommastellen → Text mit Komma („2“ → „2,0“).
  const zielnotePruefen = (s) => {
    const v = String(s == null ? "" : s).trim();
    if (!v) return { ok: true, wert: "" };
    const m = v.match(/^([1-4])(?:[.,](\d{1,2}))?$/);
    if (!m) return { ok: false, fehler: "Das ist keine Note. Bitte eine Zahl von 1,0 bis 4,0 eingeben." };
    const n = Number(m[1] + "." + (m[2] || "0"));
    if (n < 1 || n > 4) return { ok: false, fehler: "Die Note muss zwischen 1,0 und 4,0 liegen." };
    return { ok: true, wert: `${m[1]},${m[2] || "0"}` };
  };

  // Semester-Auswahl für den Studienbeginn füllen (auch für die Einrichtung). leer: Text der Option „Aktuelles Semester“
  // (Wert "") oder null = ohne diese Option. Rückgabe: Liste der Semester ({ name, beginn, … }).
  const semesterOptionen = (sel, gesetzt, leer) => {
    const d = D();
    const auswahl = d ? ctx.modell.semesterAuswahl() : [];
    gesetzt = String(gesetzt == null ? "" : gesetzt).slice(0, 10);
    if (gesetzt && d && !auswahl.some((s) => s.beginn === gesetzt)) {
      const s = ctx.modell.semesterNachName(ctx.modell.semesterAusDatum(gesetzt));
      if (s) auswahl.unshift(Object.assign({}, s, { beginn: gesetzt }));
    }
    if (leer != null) sel.createEl("option", { value: "", text: leer });
    for (const s of auswahl) sel.createEl("option", { value: s.beginn, text: `${s.name} (ab ${dmy(s.beginn)})` });
    return auswahl;
  };
  // Vorschau zum Studienbeginn als Liste der Teile: „1. Fachsemester: WS 2026/27“, „heute 1. FS“, Hinweis bei Beginn im
  // Sommersemester (Formular und Einrichtung)
  const vorschauTeile = (beginn) => {
    const d = D();
    if (!d) return { erstes: "", heute: "", hinweis: "" };
    const liste = ctx.modell.vorschau(beginn || "");
    const heute = d.heute, akt = liste.find((s) => s.beginn <= heute && heute <= s.ende);
    return {
      erstes: liste.length ? liste[0].name : "",
      fs: akt ? akt.fs : 0,
      heute: akt ? `heute ${akt.fs}. FS` : liste.length && heute < liste[0].beginn ? "Studium hat noch nicht begonnen" : "",
      hinweis: liste.length && /^SS/.test(liste[0].name) ? "Der Musterplan ist für einen Start im Wintersemester gedacht." : "",
    };
  };
  const vorschauText = (beginn) => {
    const v = vorschauTeile(beginn);
    let t = v.erstes ? `1. Fachsemester: ${v.erstes}` : "";
    if (v.heute) t += ` · ${v.heute}`;
    if (v.hinweis) t += `. ${v.hinweis}`;
    return t;
  };

  // ---------- Formular ----------
  class Formular extends Modal {
    constructor() { super(app); }
    onOpen() {
      const c = this.contentEl, d = D(), fm = fmVon();
      this.modalEl.addClass("eba-modal", "eba-modal-personalisieren");
      this.titleEl.setText("Personalisieren");
      c.createEl("p", { cls: "eba-modal-text", text: "Alles ist freiwillig und jederzeit änderbar." });
      const form = c.createDiv({ cls: "eba-form" });
      const zeile = (label, hilfe) => {
        const z = form.createDiv({ cls: "eba-form-zeile" });
        z.createEl("label", { text: label, cls: "eba-form-label" });
        const feld = z.createDiv({ cls: "eba-form-feld" });
        const h = hilfe ? z.createEl("div", { cls: "eba-form-hilfe", text: hilfe }) : null;
        return { z, feld, h };
      };
      // Name
      const zn = zeile("Name", "Für die Begrüßung auf dem Dashboard.");
      const name = zn.feld.createEl("input", { type: "text", cls: "eba-modal-feld", attr: { placeholder: "Vorname", autocomplete: "given-name", "aria-label": "Name" } });
      name.value = String(fm.name == null ? "" : fm.name);
      // Studienbeginn
      const zs = zeile("Studienbeginn", "");
      const sem = zs.feld.createEl("select", { cls: "dropdown eba-form-auswahl", attr: { "aria-label": "Studienbeginn" } });
      const jetzt = d ? ctx.modell.semesterAusDatum(d.heute) : "";
      const gesetzt = String(fm.studienbeginn == null ? "" : fm.studienbeginn).slice(0, 10);
      semesterOptionen(sem, gesetzt, `Aktuelles Semester${jetzt ? ` (${jetzt})` : ""}`);
      sem.value = gesetzt && Array.from(sem.options).some((o) => o.value === gesetzt) ? gesetzt : "";
      const vorschau = zs.h || zs.z.createEl("div", { cls: "eba-form-hilfe" });
      const vorschauZeigen = () => vorschau.setText(vorschauText(sem.value));
      sem.addEventListener("change", vorschauZeigen);
      vorschauZeigen();
      // Variante
      const zv = zeile("Variante", "Wähle sie vor dem 3. Fachsemester.");
      const vari = zv.feld.createEl("select", { cls: "dropdown eba-form-auswahl", attr: { "aria-label": "Variante" } });
      for (const v of VARIANTEN) vari.createEl("option", { value: v, text: v });
      const vist = String(fm.variante == null ? "" : fm.variante).trim();
      vari.value = VARIANTEN.indexOf(vist) >= 0 ? vist : "offen";
      // Zielnote
      const zz = zeile("Zielnote", "Dein Wunsch-Notenschnitt (1,0 bis 4,0).");
      const ziel = zz.feld.createEl("input", { type: "text", cls: "eba-modal-feld eba-form-kurz", attr: { placeholder: "z. B. 2,0", inputmode: "decimal", "aria-label": "Zielnote" } });
      ziel.value = String(fm.zielnote == null ? "" : fm.zielnote);
      const meldung = c.createEl("p", { cls: "eba-modal-meldung" });
      const k = c.createDiv({ cls: "modal-button-container" });
      const speichern = k.createEl("button", { text: "Speichern", cls: "mod-cta" });
      const ab = k.createEl("button", { text: "Abbrechen" });
      ziel.addEventListener("input", () => { ziel.removeClass("eba-feld-fehler"); meldung.setText(""); meldung.className = "eba-modal-meldung"; });
      const senden = async () => {
        const zn2 = zielnotePruefen(ziel.value);
        if (!zn2.ok) { meldung.setText(zn2.fehler); meldung.className = "eba-modal-meldung fehler"; ziel.addClass("eba-feld-fehler"); ziel.focus(); return; }
        const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
        if (!f) { meldung.setText("Die Einstellungen fehlen (System/Einstellungen.md). Bitte die Vorlage prüfen."); meldung.className = "eba-modal-meldung fehler"; return; }
        speichern.disabled = true;
        const werte = { name: name.value.trim() || null, studienbeginn: sem.value || null, variante: vari.value || "offen", zielnote: zn2.wert || null };
        await app.fileManager.processFrontMatter(f, (x) => { x.name = werte.name; x.studienbeginn = werte.studienbeginn; x.variante = werte.variante; x.zielnote = werte.zielnote; });
        this.gespeichert = werte;
        this.close();
        new Notice("Gespeichert" + (werte.name ? `, ${werte.name}` : "") + ".", 3000);
        // Semesterliste usw. sofort nachziehen (sonst nach 1,5 s über das Änderungsereignis)
        if (ctx.modell && ctx.modell.abgleichen) setTimeout(() => ctx.modell.abgleichen("personalisieren").catch((e) => console.error(e)), 300);
      };
      this.senden = senden; this.felder = { name, sem, vari, ziel, meldung };
      speichern.addEventListener("click", senden);
      ab.addEventListener("click", () => this.close());
      for (const el of [name, ziel]) el.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); senden(); } });
      setTimeout(() => name.focus(), 30);
    }
    onClose() { this.contentEl.empty(); if (fenster === this) fenster = null; }
  }
  let fenster = null; // offenes Formular (für Tests: ctx.personalisieren.fenster)

  // ---------- Karte (seit 0.3.0 leer: die Einrichtung ersetzt sie) ----------
  let block = null; // Codeblock-Griff (ctx.codeblock), gesetzt in registrieren()
  const karte = (el) => { el.empty(); el.addClass("eba-perso-aus"); };
  // „Deine Angaben“ (Einstellungen & Hilfe)
  const angaben = (el) => {
    el.empty();
    const fm = fmVon();
    const txt = (x) => String(x == null ? "" : x).trim();
    const name = txt(fm.name), beginn = txt(fm.studienbeginn).slice(0, 10), ziel = txt(fm.zielnote);
    const link = ctx.link("personalisieren", {});
    const einrichtung = ctx.link("einrichtung", { ab: "2" });
    if (!name && !beginn) {
      el.createDiv({ cls: "eba-angaben leer" }).innerHTML = `<span class="eba-angaben-leer">Noch nichts eingetragen.</span>`
        + `<a class="eba-vb-knopf cta" href="${einrichtung}">Einrichtung starten</a>`;
      return;
    }
    let sem = "";
    try { sem = beginn && ctx.modell && ctx.modell.semesterAusDatum ? ctx.modell.semesterAusDatum(beginn) : ""; } catch (e) { sem = ""; }
    const beginnText = beginn ? (sem ? `${sem} (ab ${dmy(beginn)})` : dmy(beginn)) : "";
    const feld = (titel, wert) => `<div class="eba-angaben-feld"><span>${titel}</span><b${wert ? "" : ' class="leer"'}>${wert ? esc(wert) : "–"}</b></div>`;
    el.createDiv({ cls: "eba-angaben" }).innerHTML = `<div class="eba-angaben-liste">${feld("Name", name)}${feld("Zielnote", ziel)}${feld("Studienbeginn", beginnText)}</div>`
      + `<span class="eba-angaben-knoepfe"><a class="eba-vb-knopf" href="${link}">Ändern</a>`
      + `<a class="eba-vb-knopf leise" href="${einrichtung}">Einrichtung erneut starten</a></span>`;
  };
  const neuZeichnen = () => { if (block) block.neu(); };

  const AKTIONEN = {
    personalisieren: {
      titel: "Personalisieren (Name, Studienbeginn, Variante, Zielnote)",
      ausfuehren: async () => { const m = new Formular(); fenster = m; m.open(); },
    },
  };

  ctx.personalisieren = { zielnotePruefen, semesterOptionen, vorschauTeile, vorschauText, VARIANTEN, Formular, angaben, neuZeichnen,
    get fenster() { return fenster; } };

  const registrieren = () => {
    block = ctx.codeblock("eba-personalisieren", (quelle, el, c, inst) => {
      inst.art = ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, "eba-personalisieren", ["karte", "angaben"], "karte") : "karte";
      try { if (inst.art === "angaben") angaben(el); else karte(el); } catch (e) { console.error("eba-personalisieren", e); }
    });
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(() => neuZeichnen()));
  };

  return { registrieren, aktionen: AKTIONEN };
};
