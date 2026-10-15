// Personalisieren (Phase 2b): der Vault ist ohne Onboarding sofort nutzbar; Angaben kommen nach und nach.
// Standard ohne Angaben: Studienbeginn = aktuelles Semester (1. FS), Variante „offen“, neutrale Begrüßung.
//   ```eba-personalisieren```  dezente Karte (Dashboard oben): verschwindet, sobald Name UND Studienbeginn gesetzt sind
//                              oder „Ausblenden“ geklickt wurde (gerätelokal, app.saveLocalStorage).
//   ```eba-personalisieren angaben```  „Deine Angaben“ (Einstellungen & Hilfe): solange Name UND Studienbeginn leer sind, eine
//                              kleine Karte „Noch nichts eingetragen.“ + Knopf „Personalisieren“; sonst Name, Zielnote,
//                              Studienbeginn (leere Werte „–“) + Knopf „Ändern“. Ersetzt seit 15.10.2026 die Bases-Tabelle,
//                              die leer nur Spaltenköpfe zeigte.
//   Aktion „personalisieren“   EIN Formular-Fenster (Name, Studienbeginn als Semester-Auswahl, Variante, Zielnote 1,0–4,0),
//                              speichert nach System/Einstellungen.md. Auch als Befehl und Knopf in den Einstellungen.
// Nach dem Speichern zieht das Datenmodell (modell.js) Semesterliste, Pausen und Prüfungsphasen in den Einstellungen nach.
// Erweiterung: Das Plugin ruft registrieren() auf (Codeblock über ctx.codeblock) und übernimmt die aktionen. Stil: eba-core.css Abschnitt 43.
module.exports = function (ctx) {
  const app = window.app;
  const { Modal, Notice } = ctx.obsidian;
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const AUS = "eba-personalisieren-aus"; // gerätelokal: Karte ausgeblendet
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
      sem.createEl("option", { value: "", text: `Aktuelles Semester${jetzt ? ` (${jetzt})` : ""}` });
      const auswahl = d ? ctx.modell.semesterAuswahl() : [];
      const gesetzt = String(fm.studienbeginn == null ? "" : fm.studienbeginn).slice(0, 10);
      if (gesetzt && d && !auswahl.some((s) => s.beginn === gesetzt)) {
        const s = ctx.modell.semesterNachName(ctx.modell.semesterAusDatum(gesetzt));
        if (s) auswahl.unshift(Object.assign({}, s, { beginn: gesetzt }));
      }
      for (const s of auswahl) sem.createEl("option", { value: s.beginn, text: `${s.name} (ab ${dmy(s.beginn)})` });
      sem.value = gesetzt && Array.from(sem.options).some((o) => o.value === gesetzt) ? gesetzt : "";
      const vorschau = zs.h || zs.z.createEl("div", { cls: "eba-form-hilfe" });
      const vorschauZeigen = () => {
        if (!d) { vorschau.setText(""); return; }
        const liste = ctx.modell.vorschau(sem.value);
        const heute = d.heute, akt = liste.find((s) => s.beginn <= heute && heute <= s.ende);
        let t = liste.length ? `1. Fachsemester: ${liste[0].name}` : "";
        t += akt ? ` · heute ${akt.fs}. FS` : liste.length && heute < liste[0].beginn ? " · Studium hat noch nicht begonnen" : "";
        if (liste.length && /^SS/.test(liste[0].name)) t += ". Der Musterplan ist für einen Start im Wintersemester gedacht.";
        vorschau.setText(t);
      };
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

  // ---------- Karte ----------
  const ausgeblendet = () => !!app.loadLocalStorage(AUS);
  let block = null; // Codeblock-Griff (ctx.codeblock), gesetzt in registrieren()
  const karte = (el) => {
    el.empty();
    const d = D(), fm = fmVon();
    const fertig = String(fm.name == null ? "" : fm.name).trim() && String(fm.studienbeginn == null ? "" : fm.studienbeginn).trim();
    const zeigen = !fertig && !ausgeblendet();
    el.toggleClass("eba-perso-aus", !zeigen);
    if (!zeigen) return;
    const k = el.createDiv({ cls: "eba-perso" });
    const sem = d ? d.startSemester : "dem aktuellen Semester";
    k.innerHTML = `<span class="eba-perso-symbol" aria-hidden="true">✦</span>`
      + `<span class="eba-perso-text"><b>Personalisieren</b><span>Trag Name und Studienbeginn ein, dann passt alles zu dir.</span></span>`
      + `<span class="eba-perso-knoepfe"><a class="eba-vb-knopf cta" href="${ctx.link("personalisieren", {})}">Jetzt eintragen</a>`
      + `<a class="eba-vb-knopf leise" href="${ctx.link("personalisieren-ausblenden", {})}">Ausblenden</a></span>`;
  };
  // „Deine Angaben“ (Einstellungen & Hilfe)
  const angaben = (el) => {
    el.empty();
    const fm = fmVon();
    const txt = (x) => String(x == null ? "" : x).trim();
    const name = txt(fm.name), beginn = txt(fm.studienbeginn).slice(0, 10), ziel = txt(fm.zielnote);
    const link = ctx.link("personalisieren", {});
    if (!name && !beginn) {
      el.createDiv({ cls: "eba-angaben leer" }).innerHTML = `<span class="eba-angaben-leer">Noch nichts eingetragen.</span>`
        + `<a class="eba-vb-knopf cta" href="${link}">Personalisieren</a>`;
      return;
    }
    let sem = "";
    try { sem = beginn && ctx.modell && ctx.modell.semesterAusDatum ? ctx.modell.semesterAusDatum(beginn) : ""; } catch (e) { sem = ""; }
    const beginnText = beginn ? (sem ? `${sem} (ab ${dmy(beginn)})` : dmy(beginn)) : "";
    const feld = (titel, wert) => `<div class="eba-angaben-feld"><span>${titel}</span><b${wert ? "" : ' class="leer"'}>${wert ? esc(wert) : "–"}</b></div>`;
    el.createDiv({ cls: "eba-angaben" }).innerHTML = `<div class="eba-angaben-liste">${feld("Name", name)}${feld("Zielnote", ziel)}${feld("Studienbeginn", beginnText)}</div>`
      + `<a class="eba-vb-knopf" href="${link}">Ändern</a>`;
  };
  const neuZeichnen = () => { if (block) block.neu(); };

  const AKTIONEN = {
    personalisieren: {
      titel: "Personalisieren (Name, Studienbeginn, Variante, Zielnote)",
      ausfuehren: async () => { const m = new Formular(); fenster = m; m.open(); },
    },
    "personalisieren-ausblenden": {
      ausfuehren: async () => { app.saveLocalStorage(AUS, "1"); neuZeichnen(); new Notice("Ausgeblendet. Du findest es weiter in den Einstellungen.", 4000); },
    },
    "personalisieren-zeigen": {
      titel: "Personalisieren-Karte wieder anzeigen (dieses Gerät)",
      ausfuehren: async () => { app.saveLocalStorage(AUS, null); neuZeichnen(); },
    },
  };

  ctx.personalisieren = { zielnotePruefen, Formular, angaben, get fenster() { return fenster; } };

  const registrieren = () => {
    block = ctx.codeblock("eba-personalisieren", (quelle, el, c, inst) => {
      inst.art = ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, "eba-personalisieren", ["karte", "angaben"], "karte") : "karte";
      try { if (inst.art === "angaben") angaben(el); else karte(el); } catch (e) { console.error("eba-personalisieren", e); }
    });
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(() => neuZeichnen()));
  };

  return { registrieren, aktionen: AKTIONEN };
};
