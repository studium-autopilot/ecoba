// Personalisieren (Phase 2b): der Vault ist ohne Angaben sofort nutzbar. Seit 0.3.0 fragt die Einrichtung (einrichtung.js)
// beim ersten Start; dieses Formular bleibt für „Ändern“.
// Standard ohne Angaben: Studienbeginn = aktuelles Semester (1. FS), Variante „offen“, neutrale Begrüßung.
//   ```eba-personalisieren```  früher die Karte oben auf dem Dashboard; seit 0.3.0 leer (die Einrichtung ersetzt sie). Der
//                              Block zeichnet nichts, damit ältere, selbst geänderte Dashboards keine Lücke zeigen.
//   ```eba-personalisieren angaben```   „Deine Angaben“ (Einstellungen & Hilfe): Zeilen Name, Studienbeginn, Zielnote und
//                              Einrichtung, je mit einem Knopf („Ändern“ öffnet das Formular am passenden Feld; Einrichtung:
//                              Starten, Fortsetzen oder Erneut starten).
//   ```eba-personalisieren variante```  „Variante“: je Variante eine Zeile mit dem, was daraus folgt; die gewählte mit Haken,
//                              die übrigen mit „Wählen“ (Aktion „variante“ in aktionen.js).
//   Beide in derselben Zeilenliste wie die Verbindungen (.eba-vb-*, verbindungen.js): Symbol, Titel, gedämpfte Zeile, ein Knopf.
//   Inhalt der Zeilen: angabenZeilen() und varianteZeilen() (rein, getestet in tests/personalisieren.test.js).
//   Aktion „personalisieren“   EIN Formular-Fenster (Name, Studienbeginn als Semester-Auswahl, Variante, Zielnote 1,0–4,0),
//                              speichert nach System/Einstellungen.md. Auch als Befehl. Parameter feld=name|studienbeginn|
//                              zielnote setzt den Cursor in dieses Feld.
// Nach dem Speichern zieht das Datenmodell (modell.js) Semesterliste, Pausen und Prüfungsphasen in den Einstellungen nach.
// Erweiterung: Das Plugin ruft registrieren() auf (Codeblock über ctx.codeblock) und übernimmt die aktionen. Stil: eba-core.css Abschnitt 43
// (eba-vb-*, eba-modal-personalisieren; die Karten-Klassen eba-perso* sind seit der Aufräumrunde 16.10.2026 entfernt). Bis
// 17.10.2026 standen die Angaben in einem eigenen Kasten und die Variante als Chips mit Tabelle.
module.exports = function (ctx) {
  const app = window.app;
  const { Modal } = ctx.obsidian;
  const EINSTELLUNGEN = "System/Einstellungen.md";
  // Variante, Studienbeginn und Zielnote: eine Beschreibung für alle Stellen (felder.js, Feld-Register)
  const F = () => ctx.user.felder;
  const VARIANTEN = F().VARIANTE.werte;
  // Was aus der Variante folgt (PO 2023, Modulhandbuch); Reihenfolge der Zeilen unter „Variante“
  const FOLGE = {
    "Economics": "Pflicht: E230, E210, S220, B240 · Schwerpunkte 75 ECTS, mind. 2 VWL-Bereiche",
    "Business Administration": "Pflicht: B220, J200, B250, B240 · Profil 12 ECTS · Schwerpunkte 63 ECTS, mind. 2 BWL-Bereiche",
    "ohne Spezialisierung": "Profil 18 ECTS VWL + 18 ECTS BWL · Schwerpunkte 63 ECTS, je mind. 1 VWL- und BWL-Bereich",
    "offen": "Vor dem 3. Fachsemester wählen; bis dahin rechnet Studium Autopilot ohne Variante",
  };
  // Übersprungene Schritte der Einrichtung (einrichtung_uebersprungen) in Worten; alma und ilias aus Einrichtungen bis 0.4.7
  const SCHRITTE = { studienbeginn: "Studienbeginn", variante: "Variante", angaben: "Name und Zielnote", uni: "Uni-Login", alma: "Alma", ilias: "ILIAS" };
  // Symbole der Zeilen (Lucide, 24er-Raster, Strich in currentColor; wie verbindungen.js)
  const SYMBOLE = {
    person: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    kalender: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    ziel: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    hut: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    wegweiser: '<path d="M12 3v3"/><path d="M18.5 13h-13L2 9.5 5.5 6h13L22 9.5Z"/><path d="M12 13v8"/>',
    haken: '<path d="M20 6 9 17l-5-5"/>',
    uhr: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  };
  const svg = (name) => `<svg class="eba-sym" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SYMBOLE[name] || SYMBOLE.haken}</svg>`;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const dmy = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "");
  const D = () => (ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null);
  const fmVon = () => { const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN); const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };

  // Zielnote: leer erlaubt; sonst 1,0–4,0 mit höchstens zwei Nachkommastellen → Text mit Komma („2“ → „2,0“) (felder.js)
  const zielnotePruefen = (s) => F().zielnotePruefen(s);

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
    constructor(feld) { super(app); this.feld = feld || "name"; }
    onOpen() {
      const c = this.contentEl, d = D(), fm = fmVon();
      this.modalEl.addClass("eba-modal", "eba-modal-personalisieren");
      this.titleEl.setText("Deine Angaben");
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
      semesterOptionen(sem, gesetzt, F().studienbeginnLeerTitel(jetzt));
      sem.value = gesetzt && Array.from(sem.options).some((o) => o.value === gesetzt) ? gesetzt : "";
      const vorschau = zs.h || zs.z.createEl("div", { cls: "eba-form-hilfe" });
      const vorschauZeigen = () => vorschau.setText(vorschauText(sem.value));
      sem.addEventListener("change", vorschauZeigen);
      vorschauZeigen();
      // Variante
      const zv = zeile("Variante", "Wähle sie vor dem 3. Fachsemester.");
      const vari = zv.feld.createEl("select", { cls: "dropdown eba-form-auswahl", attr: { "aria-label": "Variante" } });
      for (const v of VARIANTEN) vari.createEl("option", { value: v, text: F().varianteTitel(v) });
      vari.value = F().varianteLesen(fm);
      // Zielnote
      const zz = zeile("Zielnote", F().ZIELNOTE.hilfe);
      const ziel = zz.feld.createEl("input", { type: "text", cls: "eba-modal-feld eba-form-kurz", attr: { placeholder: F().ZIELNOTE.beispiel, inputmode: "decimal", "aria-label": "Zielnote" } });
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
        ctx.hinweis("Gespeichert" + (werte.name ? `, ${werte.name}` : "") + ".", { dauer: 3000 });
        // Semesterliste usw. sofort nachziehen (sonst nach 1,5 s über das Änderungsereignis)
        if (ctx.modell && ctx.modell.abgleichen) setTimeout(() => ctx.modell.abgleichen("personalisieren").catch((e) => console.error(e)), 300);
      };
      this.senden = senden; this.felder = { name, sem, vari, ziel, meldung };
      speichern.addEventListener("click", senden);
      ab.addEventListener("click", () => this.close());
      for (const el of [name, ziel]) el.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); senden(); } });
      const fokus = { studienbeginn: sem, zielnote: ziel }[this.feld] || name;
      setTimeout(() => fokus.focus(), 30);
    }
    onClose() { this.contentEl.empty(); if (fenster === this) fenster = null; }
  }
  let fenster = null; // offenes Formular (für Tests: ctx.personalisieren.fenster)

  // ---------- Zeilen (Einstellungen & Hilfe) ----------
  const txt = (x) => String(x == null ? "" : x).trim();
  const varianteVon = (fm) => F().varianteLesen(fm);
  const einrichtungVon = (fm) => {
    if (ctx.einrichtung && ctx.einrichtung.zustand) return ctx.einrichtung.zustand();
    const e = txt(fm.einrichtung).toLowerCase();
    return { status: e === "fertig" || e === "laeuft" ? e : "offen", uebersprungen: [] };
  };
  // Eine Zeile: { id, symbol, ton ("akzent" | "ok" | "leise"), titel, pille? ({ text, art }), wert (Angabe, in Textfarbe),
  //   text (Ergänzung, gedämpft), knopf? ({ text, aktion, parameter, cta }) }. Leere Angabe: wert "", text „Nicht eingetragen.“
  const angabenZeilen = (fm, ez) => {
    fm = fm || {};
    ez = ez || einrichtungVon(fm);
    const name = txt(fm.name), beginn = txt(fm.studienbeginn).slice(0, 10), ziel = txt(fm.zielnote);
    const aendern = (feld) => ({ text: "Ändern", aktion: "personalisieren", parameter: { feld } });
    const v = vorschauTeile(beginn);
    const heute = v.fs ? `heute ${v.fs}. Fachsemester` : v.heute;
    const zeilen = [
      { id: "name", symbol: "person", ton: name ? "akzent" : "leise", titel: "Name", wert: name, text: name ? "" : "Nicht eingetragen.", knopf: aendern("name") },
      { id: "studienbeginn", symbol: "kalender", ton: beginn ? "akzent" : "leise", titel: "Studienbeginn",
        wert: beginn ? v.erstes || dmy(beginn) : "",
        text: beginn ? heute : v.erstes ? `Nicht eingetragen, es gilt ${v.erstes}.` : "Nicht eingetragen.", knopf: aendern("studienbeginn") },
      { id: "zielnote", symbol: "ziel", ton: ziel ? "akzent" : "leise", titel: "Zielnote", wert: ziel, text: ziel ? "" : "Nicht eingetragen.", knopf: aendern("zielnote") },
    ];
    const ueber = (ez.uebersprungen || []).map((p) => SCHRITTE[p]).filter(Boolean);
    const e = { id: "einrichtung", symbol: "hut", titel: "Einrichtung", wert: "" };
    if (ez.status === "fertig") Object.assign(e, { ton: "ok", pille: { text: "fertig", art: "ok" }, text: ueber.length ? `Übersprungen: ${ueber.join(", ")}.` : "Alle Schritte erledigt.",
      knopf: { text: "Erneut starten", aktion: "einrichtung", parameter: { ab: "2" } } });
    else if (ez.status === "laeuft") Object.assign(e, { ton: "leise", pille: { text: "angefangen", art: "warn" }, text: "Noch nicht abgeschlossen.",
      knopf: { text: "Fortsetzen", aktion: "einrichtung", parameter: {}, cta: true } });
    else Object.assign(e, { ton: "leise", pille: { text: "offen", art: "leer" }, text: "Führt durch Studienbeginn, Variante, Name, Uni-Login und Darstellung.",
      knopf: { text: "Starten", aktion: "einrichtung", parameter: { ab: "2" }, cta: true } });
    zeilen.push(e);
    return zeilen;
  };
  // Je Variante eine Zeile; die gewählte ohne Knopf (bei „noch offen“ mit Uhr statt Haken)
  const varianteZeilen = (fm) => {
    const ist = varianteVon(fm || {});
    return VARIANTEN.map((v) => {
      const gewaehlt = v === ist, titel = F().varianteTitel(v);
      if (!gewaehlt) return { id: v, symbol: "wegweiser", ton: "leise", titel, wert: "", text: FOLGE[v], knopf: { text: "Wählen", aktion: "variante", parameter: { wert: v } } };
      return v === "offen" ? { id: v, symbol: "uhr", ton: "leise", titel, pille: { text: "aktuell", art: "leer" }, wert: "", text: FOLGE[v] }
        : { id: v, symbol: "haken", ton: "ok", titel, pille: { text: "gewählt", art: "ok" }, wert: "", text: FOLGE[v] };
    });
  };
  // Zeilenliste wie die Übersicht der Verbindungen (verbindungen.js, uebersicht)
  const liste = (el, zeilen) => {
    const l = el.createDiv({ cls: "eba-vb-liste" });
    for (const z of zeilen) {
      const pille = z.pille ? ` <span class="eba-pill ${z.pille.art}">${esc(z.pille.text)}</span>` : "";
      const stand = (z.wert ? `<span class="eba-vb-wert">${esc(z.wert)}</span>` : "") + (z.wert && z.text ? " · " : "") + esc(z.text);
      const knopf = z.knopf ? `<a class="eba-vb-knopf${z.knopf.cta ? " cta" : ""}" href="${ctx.link(z.knopf.aktion, z.knopf.parameter)}">${esc(z.knopf.text)}</a>` : "";
      const zeile = l.createDiv({ cls: "eba-vb" });
      zeile.setAttr("data-id", z.id);
      zeile.innerHTML = `<span class="eba-vb-symbol ${z.ton}" aria-hidden="true">${svg(z.symbol)}</span>`
        + `<span class="eba-vb-text"><b>${esc(z.titel)}${pille}</b><span class="eba-vb-status"><span class="eba-vb-stand">${stand}</span></span></span>`
        + `<span class="eba-vb-knoepfe">${knopf}</span>`;
    }
  };

  let block = null; // Codeblock-Griff (ctx.codeblock), gesetzt in registrieren()
  // Ohne Argument (früher die Karte auf dem Dashboard, seit 0.3.0 leer): nichts zeichnen. Bei den übrigen eba-perso-aus entfernen:
  // Wurde derselbe Block vorher leer gezeichnet (Argument nicht erkannt, siehe registrieren), bliebe die Klasse sonst hängen.
  const karte = (el) => { el.empty(); el.addClass("eba-perso-aus"); };
  const angaben = (el) => { el.empty(); el.removeClass("eba-perso-aus"); liste(el, angabenZeilen(fmVon())); };
  const variante = (el) => { el.empty(); el.removeClass("eba-perso-aus"); liste(el, varianteZeilen(fmVon())); };
  const neuZeichnen = () => { if (block) block.neu(); };

  const AKTIONEN = {
    personalisieren: {
      titel: "Deine Angaben ändern",
      ausfuehren: async (c) => { const m = new Formular(c && c.parameter ? c.parameter.feld : ""); fenster = m; m.open(); },
    },
  };

  ctx.personalisieren = { zielnotePruefen, semesterOptionen, vorschauTeile, vorschauText, VARIANTEN, FOLGE, Formular, angabenZeilen, varianteZeilen,
    angaben, variante, neuZeichnen, get fenster() { return fenster; } };

  const registrieren = () => {
    block = ctx.codeblock("eba-personalisieren", (quelle, el, c, inst) => {
      inst.art = ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, "eba-personalisieren", ["karte", "angaben", "variante"], "karte") : "karte";
      // Beim Neuzeichnen der Leseansicht (rerender) liefert getSectionInfo oft nichts, dann käme „karte“ (leer, unsichtbar).
      // Rückfall wie todos.js über den Text im Block: „Variante: …“ bzw. „Deine Angaben: …“, der alte Dashboard-Block hat keinen.
      const q = String(quelle || "");
      if (inst.art === "karte") inst.art = /variante/i.test(q) ? "variante" : /angaben/i.test(q) ? "angaben" : "karte";
      try { if (inst.art === "angaben") angaben(el); else if (inst.art === "variante") variante(el); else karte(el); } catch (e) { console.error("eba-personalisieren", e); }
    });
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(() => neuZeichnen()));
  };

  return { registrieren, aktionen: AKTIONEN };
};
