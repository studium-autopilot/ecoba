// Verbindungen und Schloss-System (Phase 2b).
// Alles, was eine Verbindung braucht, zeigt ein Schloss. Ein Klick erklärt, was fehlt, und verbindet direkt.
// Symbole (seit 15.10.2026): ruhige Lucide-Linien als inline-SVG in currentColor (SYMBOLE), keine Emojis; setIcon blieb auf
// dem iPad leer (siehe menue.js). Farbe über die Klasse am Rahmen (eba-core.css 43).
// Links (z. B. der Alma-Kalenderlink) und der ILIAS-Benutzername liegen NUR gerätelokal (app.saveLocalStorage), nie in einer
// Datei des Vaults. Passwörter: nur das ILIAS-Passwort (seit 0.4.0), und nur im Schlüsselbund von Obsidian auf diesem Gerät
// (ilias.js, app.secretStorage: verschlüsselt, nie synchronisiert). Dieses Skript reicht es nur als Funktion an
// ctx.ilias.zugangSpeichern weiter und leert danach das Feld. Kein Mail-Passwort (kein IMAP), nichts davon im Vault.
//
// Registry VERBINDUNGEN: { id, name, satz, kurz?, erklaerung, schritte, art ("link" | "anmeldung" | "zentral" | "vorlage" | "claude"), status(), gesperrt(),
//   vorschau? ("woche": Schloss liegt auf einem ausgegrauten Beispiel-Stundenplan), anreiz? (Überschrift dazu), schlossKnopf? (Text
//   des Knopfs der Schloss-Karte), trennenText? (Rückfrage beim Trennen), pruefen(link)?, verbinden(link)?, trennen()?, aktualisieren(parameter)? }
// Texte (auch für Nicht-Techniker): satz = ein Satz Nutzen (Schloss-Karte); kurz = höchstens ein Satz im Fenster;
//   schritte = kurze Schritte, Verb vorn, **fett** = Bedienelement genau wie in Alma/Obsidian; erklaerung = Hintergrund,
//   nur eingeklappt unter „Mehr erfahren“ (höchstens drei kurze Sätze).
// Codeblöcke:
//   ```eba-schloss <id>```  Solange gesperrt: Karte mit Schloss-Symbol, einem Satz und Knopf „Verbinden“ (mit vorschau: über dem Beispielraster). Steht der Block in einer Karte
//                           (Callout), blendet CSS den übrigen Inhalt der Karte aus (z. B. das Wochenraster). Sonst leer.
//   ```eba-verbindungen```  Übersicht (Einstellungen): je Verbindung Symbol, Status und höchstens EIN Knopf (Verbinden,
//                           Aktualisieren, Jetzt holen, Hier laden, Jetzt aktualisieren, Einschalten, Neu laden oder Mehr erfahren). Zeile „Studium
//                           Autopilot“ (art vorlage): Version und Update, Text und Knopf aus ctx.update.anzeige() (update.js). Alles Weitere (Trennen, neuer
//                           Link, Kurswahl, Schalter der zentralen Daten) steht im Fenster hinter dem Textlink „Mehr erfahren“.
//   ```eba-alma-knoepfe```  Knopf auf der Seite Stundenplan (seit 0.3.0): verbunden → „Stundenplan aus Alma holen“, sonst
//                           „Alma verbinden“ mit einem Satz dazu.
//   ```eba-ilias-knopf```   Steht in der Knopf-Karte der Seite Unterlagen (seit 0.4.0) und zeichnet nichts. Ist ILIAS auf diesem
//                           Gerät verbunden, trägt er die Klasse eba-ilias-an; dann zeigt CSS (eba-core.css 49) den festen Knopf
//                           „Aus ILIAS holen“ derselben Karte, sonst ist er ausgeblendet. So bleiben alle Knöpfe normales Markdown.
// Schloss (seit 0.3.0): nur, wenn der Schritt in der Einrichtung übersprungen wurde oder die Einrichtung nicht fertig ist
//   (ctx.einrichtung.almaOffen() bzw. iliasOffen(); ILIAS auch, wenn die Einrichtung aus 0.3.x ohne ILIAS-Schritt stammt), keine
//   Daten da sind (Stundenplan bzw. Unterlagen aus ILIAS, z. B. per Sync) und dieses Gerät nicht verbunden ist. ILIAS im
//   eigenen Uni-Abgleich (ilias.js „extern“): nie ein Schloss, Zeile ohne Knopf.
// Aktionen (Knöpfe obsidian://studium-autopilot?aktion=…&id=alma): verbinden, verbindung-aktualisieren (ILIAS: uebernehmen=1
//   lädt hier, auch wenn ein anderes Gerät gerade lädt), trennen, ilias-holen (Knopf „Aus ILIAS holen“ auf der Seite Unterlagen).
// Hilfsfunktion für andere Skripte: ctx.verbindungen.schlossKarte(el, id) zeichnet die Schloss-Karte, gesperrt(id).
// Erweiterung: Das Plugin ruft registrieren() auf (Codeblöcke über ctx.codeblock) und übernimmt die aktionen.
// Stil: eba-core.css Abschnitt 43 (Klassen eba-schloss*, eba-vb-*, eba-modal*), Abschnitt 49 (ILIAS: Fenster, Knopf auf Unterlagen).
module.exports = function (ctx) {
  const app = window.app;
  const { Modal, Notice, Platform } = ctx.obsidian;
  const moment = window.moment;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const zeitText = (iso) => (iso ? moment(iso).format("DD.MM.YYYY, HH:mm") : "");
  const tagText = (iso) => (iso ? moment(iso).format("DD.MM.YYYY") : "");
  const alma = () => ctx.user.alma(Object.create(ctx));
  // Schloss nur für Schritte, die in der Einrichtung übersprungen wurden (einrichtung.js); ohne einrichtung.js wie früher
  const almaOffen = () => (ctx.einrichtung && ctx.einrichtung.almaOffen ? ctx.einrichtung.almaOffen() : true);
  const stundenplanAnzahl = () => app.vault.getMarkdownFiles().filter((f) => {
    if (!f.path.startsWith("Stundenplan/")) return false;
    const c = app.metadataCache.getFileCache(f);
    return !!(c && c.frontmatter && c.frontmatter.typ === "lehrveranstaltung");
  }).length;
  // ILIAS (ilias.js, seit 0.4.0): Schloss wie bei Alma nur für Übersprungenes (einrichtung.js); Daten = Begleitnotizen mit ilias_id
  const iliasOffen = () => (ctx.einrichtung && ctx.einrichtung.iliasOffen ? ctx.einrichtung.iliasOffen() : true);
  const iliasAnzahl = () => app.vault.getMarkdownFiles().filter((f) => {
    if (!f.path.startsWith("Unterlagen/")) return false;
    const c = app.metadataCache.getFileCache(f);
    return !!(c && c.frontmatter && c.frontmatter.ilias_id);
  }).length;
  // Anmeldebaustein fehlt (ilias-anmeldung.js nicht geladen): nichts anbieten, was nicht geht
  const iliasOhneAnmeldung = (s) => !ctx.ilias || s.text === ctx.ilias.K.TEXT_ANMELDUNG_FOLGT;
  const mobil = !!(Platform && Platform.isMobile);

  // ---------- Symbole (Lucide, 24er-Raster, Strich in currentColor) ----------
  const SYMBOLE = {
    schloss: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    haken: '<path d="M20 6 9 17l-5-5"/>',
    uhr: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    extern: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    warnung: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    aus: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
    laden: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    "neu-laden": '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  };
  const svg = (name) => `<svg class="eba-sym" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SYMBOLE[name] || SYMBOLE.haken}</svg>`;

  // ---------- Registry ----------
  const VERBINDUNGEN = {
    alma: {
      id: "alma", name: "Alma-Stundenplan", art: "link",
      satz: "Verbinde Alma, dann siehst du hier deine Woche.",
      vorschau: "woche", anreiz: "Deine Woche auf einen Blick",
      erklaerung: "Der Link enthält kein Passwort und zeigt nur deinen Stundenplan. Er bleibt nur auf diesem Gerät. In Alma kannst du ihn jederzeit erneuern.",
      schritte: [
        "**Alma** öffnen und anmelden.",
        "**Mein Studium** → **Stundenplan** öffnen.",
        "**Daten für iCalendar (ics) exportieren** wählen.",
        "**Link kopieren** und unten einfügen.",
      ],
      platzhalter: "Link hier einfügen",
      trennenText: "Dein Stundenplan bleibt, wird aber nicht mehr aktualisiert.",
      status() {
        const s = alma().status();
        return { verbunden: !!s.verbunden, seit: s.seit, stand: s.stand, daten: stundenplanAnzahl() };
      },
      // Gesperrt nur, wenn weder ein Link auf diesem Gerät noch Stundenplan-Notizen (z. B. per Sync) da sind UND Alma in der
      // Einrichtung offen blieb (übersprungen, „Später“ oder Einrichtung nicht fertig; einrichtung.js, seit 0.3.0)
      gesperrt() { const s = this.status(); return !s.verbunden && !s.daten && almaOffen(); },
      pruefen(link) { return alma().linkPruefen(link); },
      async verbinden(link) {
        const a = alma();
        const bericht = await a.verbinden(link, { nurBeiErfolg: true });
        if (!bericht) return { ok: false, fehler: a.fehler() || "Das hat nicht geklappt. Bitte noch einmal versuchen." };
        return { ok: true, text: `${bericht.termine} ${bericht.termine === 1 ? "Veranstaltung" : "Veranstaltungen"} übernommen.` };
      },
      async aktualisieren() { return alma().aktualisieren({ still: false }); },
      trennen() { alma().trennen(); },
    },
    // ILIAS-Unterlagen (ilias.js, seit 0.4.0): Benutzername + Passwort, Kurswahl, Dateien nach Unterlagen/. Eigenes Fenster
    // (IliasFenster). Im eigenen Uni-Abgleich nur eine Zeile ohne Knopf, nie ein Schloss.
    ilias: {
      id: "ilias", name: "ILIAS-Unterlagen", art: "anmeldung",
      satz: "Verbinde ILIAS, dann landen deine Kursdateien von selbst hier.",
      schlossKnopf: "ILIAS verbinden",
      kurz: "Deine Kursdateien aus ILIAS landen automatisch in Unterlagen.",
      schritte: [
        "Benutzername und Passwort von ILIAS eingeben.",
        "**Verbinden** tippen.",
        "Kurse wählen. Kurse mit Modulcode sind schon an.",
        "**Jetzt holen** tippen. Danach kommen neue Dateien von selbst.",
      ],
      datenschutz: "Dein Passwort bleibt verschlüsselt auf diesem Gerät und geht nur an die Uni.",
      erklaerung: "Ein Gerät reicht, die Dateien kommen über deinen Sync auf die anderen. Videos und Dateien über 50 MB bleiben in ILIAS. Umbenennen ist sicher, und was du löschst, kommt nicht wieder.",
      trennenText: "Passwort und Benutzername werden auf diesem Gerät gelöscht. Deine Dateien bleiben.",
      // ctx.ilias.status() + daten (Unterlagen aus ILIAS im Vault, auch per Sync von einem anderen Gerät)
      status() {
        const s = ctx.ilias ? ctx.ilias.status() : { verbunden: false, extern: false, text: "Wird geladen …" };
        return Object.assign({}, s, { daten: iliasAnzahl() });
      },
      gesperrt() { const s = this.status(); return !s.verbunden && !s.extern && !s.daten && !iliasOhneAnmeldung(s) && iliasOffen(); },
      // Knopf: Ergebnis zeigt ilias.js selbst als Hinweis; uebernehmen = hier laden, obwohl ein anderes Gerät dran ist
      async aktualisieren(p) { return ctx.ilias.jetztHolen({ uebernehmen: !!(p && (p.uebernehmen === true || p.uebernehmen === "1")) }); },
      async trennen() { await ctx.ilias.zugangLoeschen(); },
    },
    // Zentrale Daten (zentral.js): ohne Schloss, Standard an. Schalter in System/Einstellungen.md (gilt für alle deine Geräte,
    // weil nur ein Gerät die Termine schreibt – ein Schalter nur auf einem Gerät würde nichts abschalten).
    zentral: {
      id: "zentral", name: "Zentrale Daten", art: "zentral",
      satz: "Termine und Fristen für alle kommen automatisch.",
      kurz: "Termine, Fristen und Semesterdaten für alle EcoBA-Studierenden kommen etwa stündlich von selbst.",
      schritte: [
        "Nicht warten? **Jetzt aktualisieren** tippen.",
        "Keine Partys und Vorträge? Unten **Fachschaft & Veranstaltungen** ausschalten.",
      ],
      erklaerung: "Studium Autopilot holt nur Daten (keine Programme) von einer öffentlichen Seite auf GitHub. Von dir wird nichts gesendet; GitHub sieht nur deine IP-Adresse, wie bei jeder Webseite. Dein Häkchen „erledigt“ und alles unter „Meine Notizen“ bleiben immer erhalten.",
      status() { return ctx.zentral ? ctx.zentral.status() : { verbunden: false }; },
      gesperrt() { return false; },
      async aktualisieren() { if (ctx.zentral) await ctx.zentral.abrufen({ manuell: true }); },
    },
    // Die Vorlage selbst (update.js, seit 0.2.0): Version und Knopf „Aktualisieren“, wenn eine neue Version da ist
    vorlage: {
      id: "vorlage", name: "Studium Autopilot", art: "vorlage",
      satz: "Neue Versionen holst du mit einem Tipp.",
      kurz: "Gibt es eine neue Version, steht hier **Aktualisieren**. Ein Tipp holt sie, deine Einträge bleiben.",
      schritte: [
        "**Aktualisieren** tippen und bestätigen.",
        "Auf deinen anderen Geräten kommt das Update über deinen Sync. Dort nicht noch einmal tippen.",
      ],
      erklaerung: "Neue Programmteile lädt Studium Autopilot nur nach deinem Tipp, direkt aus dem öffentlichen Projekt auf GitHub. Jede Datei wird mit einer Prüfsumme geprüft; passt etwas nicht, wird nichts geändert. Vorher legt das Update eine Sicherung an.",
      status() { return ctx.update ? ctx.update.status() : { verbunden: true }; },
      gesperrt() { return false; },
    },
    assistent: {
      id: "assistent", name: "KI-Assistent", art: "claude",
      // Noch nicht gebaut (README „Noch im Aufbau“, docs/installation.md „Mit Claude Code“: kommt bald) – Texte sagen das ehrlich
      satz: "Soll bald Termine in deinen Uni-Mails finden. Braucht dann Claude Code auf deinem Rechner.",
      kurz: "Der KI-Assistent soll Termine in deinen Uni-Mails finden. Er kommt bald und läuft dann mit Claude Code auf deinem Rechner, nicht in Obsidian.",
      schritte: [],
      erklaerung: "In Obsidian gibt es dafür nichts zu verbinden. Hier wird kein Passwort gespeichert, auch nicht für deine Mails.",
      status() { return { verbunden: false }; },
      gesperrt() { return true; },
    },
  };
  const holen = (id) => VERBINDUNGEN[String(id || "").trim().toLowerCase()] || null;

  // ---------- Anzeige aktualisieren ----------
  const bloecke = []; // Codeblock-Griffe (ctx.codeblock), gesetzt in registrieren()
  // auch den Update-Hinweis auf dem Dashboard (update.js, ```eba-update-hinweis```): gleicher Anlass (Abruf, Update, Kanal)
  const neuZeichnen = () => { for (const b of bloecke) b.neu(); try { if (ctx.update && ctx.update.hinweisNeu) ctx.update.hinweisNeu(); } catch (e) { /* egal */ } };

  // ---------- Fenster ----------
  // Ja/Nein-Frage → Promise<boolean>
  const bestaetigen = (titel, text, ja) => new Promise((fertig) => {
    const m = new Modal(app);
    let erledigt = false;
    m.modalEl.addClass("eba-modal");
    m.titleEl.setText(titel);
    m.contentEl.createEl("p", { text, cls: "eba-modal-text" });
    const k = m.contentEl.createDiv({ cls: "modal-button-container" });
    const ok = k.createEl("button", { text: ja || "OK", cls: "mod-warning" });
    const ab = k.createEl("button", { text: "Abbrechen" });
    ok.addEventListener("click", () => { erledigt = true; m.close(); fertig(true); });
    ab.addEventListener("click", () => m.close());
    m.onClose = () => { m.contentEl.empty(); if (!erledigt) fertig(false); };
    m.open();
  });

  // Text mit **fett** (Bedienelemente), ohne innerHTML
  const fett = (el, s) => { String(s || "").split("**").forEach((t, i) => { if (t) { if (i % 2) el.createEl("b", { text: t }); else el.appendText(t); } }); };
  const schritteZeigen = (c, v) => {
    if (!v.schritte || !v.schritte.length) return;
    const ol = c.createEl("ol", { cls: "eba-modal-schritte" });
    for (const s of v.schritte) fett(ol.createEl("li"), s);
  };
  // „Mehr erfahren“: Hintergrund eingeklappt
  const mehrZeigen = (c, text) => {
    if (!text) return;
    const d = c.createEl("details", { cls: "eba-modal-mehr" });
    d.createEl("summary", { text: "Mehr erfahren" });
    d.createEl("p", { text });
    return d;
  };

  // Schalter der zentralen Daten (im Fenster statt in der Zeile): schreiben den Wert direkt (Parameter wert), damit zweimal
  // schnell Tippen nicht am noch alten metadataCache scheitert.
  const zentralSchalter = (c) => {
    const st = ctx.zentral ? ctx.zentral.status() : { an: false, veranstaltungen: false };
    const box = c.createDiv({ cls: "eba-modal-schalter" });
    let tVer = null;
    const zeile = (name, desc, wert, was, nachher) => new ctx.obsidian.Setting(box).setName(name).setDesc(desc).addToggle((t) => {
      if (was === "veranstaltungen") tVer = t;
      t.setValue(!!wert).onChange(async (neu) => {
        await ctx.aktion("zentral-schalter", { was, wert: neu ? "1" : "0" });
        if (nachher) nachher(neu);
        neuZeichnen();
      });
    });
    zeile("Zentrale Daten", "Aus: Es kommen keine neuen Termine. Vorhandene bleiben.", st.an, "daten", (neu) => { if (tVer) tVer.setDisabled(!neu); });
    zeile("Fachschaft & Veranstaltungen", "Partys, Vorträge und Infoabende.", st.veranstaltungen, "veranstaltungen");
    if (tVer) tVer.setDisabled(!st.an);
  };

  // Erklärung ohne Eingabe (KI-Assistent, zentrale Daten mit Schaltern, Studium Autopilot)
  class InfoFenster extends Modal {
    constructor(v) { super(app); this.v = v; }
    onOpen() {
      const v = this.v;
      this.modalEl.addClass("eba-modal", "eba-modal-verbinden");
      this.titleEl.setText(v.name);
      const marke = v.art === "claude" ? `<span class="eba-pill leer">für Fortgeschrittene</span>` : "";
      if (marke) this.contentEl.createEl("p", { cls: "eba-modal-marke" }).innerHTML = marke;
      if (v.kurz) fett(this.contentEl.createEl("p", { cls: "eba-modal-text" }), v.kurz);
      schritteZeigen(this.contentEl, v);
      if (v.art === "zentral") zentralSchalter(this.contentEl);
      const mehr = mehrZeigen(this.contentEl, v.erklaerung);
      // Studium Autopilot: Schalter „Beta-Versionen“ bewusst nur unter „Mehr erfahren“ (update.js)
      if (v.art === "vorlage" && mehr && ctx.update && ctx.update.kanalSchalter) ctx.update.kanalSchalter(mehr.createDiv({ cls: "eba-modal-schalter" }));
      const k = this.contentEl.createDiv({ cls: "modal-button-container" });
      k.createEl("button", { text: v.art === "zentral" ? "Fertig" : "Verstanden", cls: "mod-cta" }).addEventListener("click", () => this.close());
    }
    onClose() { this.contentEl.empty(); if (fenster === this) fenster = null; }
  }

  // Verbunden (Alma): Stand, Hintergrund und die seltenen Knöpfe (neuer Link, Trennen) – in der Zeile steht nur „Aktualisieren“
  class VerwaltenFenster extends Modal {
    constructor(v) { super(app); this.v = v; }
    onOpen() {
      const v = this.v, c = this.contentEl, s = v.status();
      this.modalEl.addClass("eba-modal", "eba-modal-verbinden");
      this.titleEl.setText(v.name);
      c.createEl("p", { cls: "eba-modal-marke" }).innerHTML = `<span class="eba-pill ok">verbunden</span>`;
      c.createEl("p", { cls: "eba-modal-text", text: [s.seit ? `Verbunden seit ${tagText(s.seit)}.` : "", s.stand ? `Zuletzt aktualisiert ${zeitText(s.stand)}.` : "Noch nicht aktualisiert."].filter(Boolean).join(" ") });
      const ol = c.createEl("ol", { cls: "eba-modal-schritte" });
      fett(ol.createEl("li"), "Neu holen: **Aktualisieren** tippen.");
      fett(ol.createEl("li"), "Neuer Link aus Alma? **Neuen Link eingeben** tippen.");
      mehrZeigen(c, v.erklaerung);
      const k = c.createDiv({ cls: "modal-button-container" });
      const neu = k.createEl("button", { text: "Neuen Link eingeben" });
      const weg = k.createEl("button", { text: "Trennen", cls: "mod-warning" });
      k.createEl("button", { text: "Fertig", cls: "mod-cta" }).addEventListener("click", () => this.close());
      neu.addEventListener("click", () => { this.close(); const m = new VerbindenFenster(v); fenster = m; m.open(); });
      weg.addEventListener("click", () => { this.close(); ctx.aktion("trennen", { id: v.id }); });
    }
    onClose() { this.contentEl.empty(); if (fenster === this) fenster = null; }
  }

  // Link eingeben, prüfen, verbinden, sofort importieren, Ergebnis zeigen
  class VerbindenFenster extends Modal {
    constructor(v) { super(app); this.v = v; this.laeuft = false; }
    onOpen() {
      const v = this.v, c = this.contentEl;
      this.modalEl.addClass("eba-modal", "eba-modal-verbinden");
      this.titleEl.setText(`${v.name} verbinden`);
      if (v.kurz) fett(c.createEl("p", { cls: "eba-modal-text" }), v.kurz);
      schritteZeigen(c, v);
      const feld = c.createEl("input", { type: "text", cls: "eba-modal-feld", attr: { inputmode: "url", placeholder: v.platzhalter || "https://…", autocomplete: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Link" } });
      const meldung = c.createEl("p", { cls: "eba-modal-meldung" });
      mehrZeigen(c, v.erklaerung);
      const k = c.createDiv({ cls: "modal-button-container" });
      const los = k.createEl("button", { text: "Verbinden", cls: "mod-cta" });
      const ab = k.createEl("button", { text: "Abbrechen" });
      this.feld = feld; this.meldung = meldung; this.los = los;
      const zeigen = (text, art) => { meldung.setText(text || ""); meldung.className = "eba-modal-meldung" + (art ? " " + art : ""); };
      feld.addEventListener("input", () => { if (meldung.hasClass("fehler")) zeigen(""); });
      const senden = async () => {
        if (this.laeuft) return;
        const link = feld.value.trim();
        const fehler = v.pruefen ? v.pruefen(link) : "";
        if (fehler) { zeigen(fehler, "fehler"); feld.focus(); return; }
        this.laeuft = true; los.disabled = true; los.setText("Verbinde …"); zeigen("Stundenplan wird geholt …", "");
        let r;
        try { r = await v.verbinden(link); } catch (e) { r = { ok: false, fehler: (e && e.message) || String(e) }; }
        this.laeuft = false;
        if (!r || !r.ok) { los.disabled = false; los.setText("Verbinden"); zeigen((r && r.fehler) || "Das hat nicht geklappt. Bitte noch einmal versuchen.", "fehler"); return; }
        // Erfolg: Fenster zeigt das Ergebnis, Eingabe weg
        c.empty();
        c.createEl("p", { cls: "eba-modal-erfolg", text: `✓ Verbunden${r.text ? " – " + r.text : "."}` });
        fett(c.createEl("p", { cls: "eba-modal-hinweis" }), "Später neu holen: **Stundenplan aus Alma holen** auf der Seite Stundenplan.");
        const k2 = c.createDiv({ cls: "modal-button-container" });
        k2.createEl("button", { text: "Fertig", cls: "mod-cta" }).addEventListener("click", () => this.close());
        new Notice(`${v.name} verbunden${r.text ? " – " + r.text : "."}`, 6000);
        neuZeichnen();
      };
      this.senden = senden;
      los.addEventListener("click", senden);
      ab.addEventListener("click", () => this.close());
      feld.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); senden(); } });
      setTimeout(() => feld.focus(), 30);
    }
    onClose() { this.contentEl.empty(); if (fenster === this) fenster = null; }
  }

  // ILIAS-Unterlagen (seit 0.4.0): ein Fenster für alles; zeigen() zeichnet es je nach Stand neu.
  //   Nicht verbunden oder Anmeldung abgelehnt: Satz, Schritte, Benutzername, Passwort, Datenschutz-Zeile, Meldung, Verbinden.
  //   Verbunden: Stand, Fortschritt eines laufenden Abrufs, Kurse mit Schaltern, Jetzt holen (bzw. Hier laden), Trennen.
  //   Eigener Uni-Abgleich, Obsidian zu alt (kein Schlüsselbund) oder Anmeldebaustein fehlt: nur ein Satz.
  // Passwort – steht nur im Feld (type=password). zugangSpeichern bekommt eine Funktion, die das Feld beim Senden liest, prüft
  // den Zugang mit einer Anmeldung und speichert nur bei Erfolg; danach wird das Feld geleert (auch bei Fehler). Die Hinweise
  // aus ilias.js (falsches Passwort, Zustimmungsseite, Zwei-Faktor) stehen wörtlich in der Meldung. Kein Autofokus auf
  // iPhone/iPad (sonst springt die Tastatur auf). Kurstitel (können Einschreibepasswörter enthalten) nur hier und in der Zeile,
  // nie in Hinweisen oder in der Konsole.
  class IliasFenster extends Modal {
    constructor(v) { super(app); this.v = v; this.verbindet = false; this.ansicht = ""; this.meldung = null; this.felder = null; this.weg = null; }
    onOpen() {
      this.modalEl.addClass("eba-modal", "eba-modal-verbinden", "eba-modal-ilias");
      // Abruf (auch ein automatischer), während das Fenster offen ist: Fortschritt zeigen, an Start und Ende neu zeichnen
      if (ctx.ilias && ctx.ilias.beobachten) this.weg = ctx.ilias.beobachten((x) => this.ereignis(x));
      this.zeigen();
    }
    onClose() { if (this.weg) this.weg(); this.weg = null; this.felder = null; this.contentEl.empty(); if (fenster === this) fenster = null; }
    offen() { return fenster === this; }
    ereignis(x) {
      if (!x || !this.offen()) return;
      if (x.art === "fortschritt") { if (this.ansicht === "verwalten" || this.verbindet) this.melden(x.text || "", ""); return; }
      if ((x.art === "start" || x.art === "fertig") && this.ansicht === "verwalten" && !this.verbindet) this.zeigen();
    }
    melden(text, art) { if (!this.meldung) return; this.meldung.setText(text || ""); this.meldung.className = "eba-modal-meldung" + (art ? " " + art : ""); }
    zeigen() {
      const s = this.v.status();
      this.contentEl.empty();
      this.meldung = null; this.felder = null;
      if (s.extern || iliasOhneAnmeldung(s) || !ctx.ilias.kannSpeichern()) this.infoZeigen(s);
      else if (!s.verbunden || s.gesperrt) this.anmeldenZeigen(s);
      else this.verwaltenZeigen(s);
    }
    knoepfe() { return this.contentEl.createDiv({ cls: "modal-button-container" }); }
    infoZeigen(s) {
      this.ansicht = "info";
      this.titleEl.setText(this.v.name);
      const text = s.extern ? "Deine ILIAS-Unterlagen kommen über deinen Uni-Abgleich."
        : iliasOhneAnmeldung(s) ? (/[.…]$/.test(s.text) ? s.text : `${s.text}.`) : "Dafür braucht Obsidian Version 1.11.4 oder neuer. Bitte Obsidian aktualisieren.";
      this.contentEl.createEl("p", { cls: "eba-modal-text", text });
      this.knoepfe().createEl("button", { text: "Verstanden", cls: "mod-cta" }).addEventListener("click", () => this.close());
    }
    anmeldenZeigen(s) {
      const v = this.v, c = this.contentEl;
      this.ansicht = "anmelden";
      this.titleEl.setText(`${v.name} verbinden`);
      fett(c.createEl("p", { cls: "eba-modal-text" }), v.kurz);
      schritteZeigen(c, v);
      const form = c.createDiv({ cls: "eba-modal-zugang" });
      const zeile = (text) => { const l = form.createEl("label", { cls: "eba-modal-zeile" }); l.createSpan({ cls: "eba-modal-label", text }); return l; };
      const benutzer = zeile("Benutzername").createEl("input", { type: "text", cls: "eba-modal-feld", attr: { placeholder: "z. B. zxabc01", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "next" } });
      benutzer.value = s.benutzer || "";
      const geheimFeld = zeile("Passwort").createEl("input", { type: "password", cls: "eba-modal-feld", attr: { autocomplete: "off", enterkeyhint: "go" } });
      const schutz = c.createEl("p", { cls: "eba-modal-datenschutz" });
      schutz.innerHTML = svg("schloss");
      schutz.createSpan({ text: v.datenschutz });
      this.meldung = c.createEl("p", { cls: "eba-modal-meldung" });
      // Anmeldung abgelehnt (falsches Passwort, Zustimmungsseite, Zwei-Faktor): den Hinweis gleich zeigen
      if (s.verbunden && s.gesperrt) this.melden(s.text, "fehler");
      mehrZeigen(c, v.erklaerung);
      const k = this.knoepfe();
      const los = k.createEl("button", { text: "Verbinden", cls: "mod-cta" });
      if (s.verbunden) k.createEl("button", { text: "Trennen", cls: "mod-warning" }).addEventListener("click", () => { this.close(); ctx.aktion("trennen", { id: v.id }); });
      else k.createEl("button", { text: "Abbrechen" }).addEventListener("click", () => this.close());
      this.felder = { benutzer, geheimFeld, los };
      const leeren = () => { if (this.meldung && this.meldung.hasClass("fehler")) this.melden("", ""); };
      benutzer.addEventListener("input", leeren);
      geheimFeld.addEventListener("input", leeren);
      benutzer.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); geheimFeld.focus(); } });
      geheimFeld.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); this.senden(); } });
      los.addEventListener("click", () => this.senden());
      if (!mobil) setTimeout(() => { if (this.felder) (benutzer.value ? geheimFeld : benutzer).focus(); }, 30);
    }
    // Verbinden: Zugang prüfen und speichern, dann die Kursliste holen (ohne Downloads) und die Kurse zeigen
    async senden() {
      const f = this.felder;
      if (this.verbindet || !f) return;
      const name = f.benutzer.value.trim();
      if (!name) { this.melden("Bitte deinen Benutzernamen eingeben.", "fehler"); return; }
      if (!f.geheimFeld.value) { this.melden("Bitte dein Passwort eingeben.", "fehler"); return; }
      this.verbindet = true; f.los.disabled = true; f.los.setText("Verbinde …");
      this.melden("Melde mich bei ILIAS an …", "");
      let r = null;
      try { r = await ctx.ilias.zugangSpeichern(name, () => f.geheimFeld.value, { pruefen: true }); } catch (e) { r = null; }
      f.geheimFeld.value = "";
      if (!r || !r.ok) {
        this.verbindet = false; f.los.disabled = false; f.los.setText("Verbinden");
        this.melden((r && r.fehler) || "Das hat nicht geklappt. Bitte noch einmal versuchen.", "fehler");
        if (!mobil && this.felder === f) f.geheimFeld.focus();
        return;
      }
      this.melden("Lese deine Kurse …", "");
      let liste = null;
      try { liste = await ctx.ilias.kurseAbrufen(); } catch (e) { liste = null; }
      this.verbindet = false;
      new Notice(`${this.v.name} verbunden.`, 5000);
      neuZeichnen();
      if (!this.offen()) return;
      this.contentEl.empty();
      this.meldung = null; this.felder = null;
      this.verwaltenZeigen(this.v.status(), Array.isArray(liste) ? liste : null, true);
    }
    verwaltenZeigen(s, liste, neu) {
      const v = this.v, c = this.contentEl;
      this.ansicht = "verwalten";
      this.titleEl.setText(v.name);
      c.createEl("p", { cls: "eba-modal-marke" }).innerHTML = `<span class="eba-pill ok">verbunden</span>`;
      if (neu) {
        const n = liste ? liste.length : 0;
        c.createEl("p", { cls: "eba-modal-erfolg", text: `✓ Verbunden${n ? ` – ${n} ${n === 1 ? "Kurs" : "Kurse"} gefunden.` : "."}` });
      }
      c.createEl("p", { cls: "eba-modal-text", text: [s.laeuft ? "" : s.text, s.benutzer ? `Angemeldet als ${s.benutzer}.` : ""].filter(Boolean).join(" ") });
      this.meldung = c.createEl("p", { cls: "eba-modal-meldung" });
      if (s.laeuft) this.melden(s.text, "");
      c.createEl("p", { cls: "eba-modal-abschnitt", text: "Deine Kurse" });
      const box = c.createDiv({ cls: "eba-modal-schalter eba-modal-kurse" });
      const kurseZeigen = (l) => {
        box.empty();
        if (!l || !l.length) { fett(box.createEl("p", { cls: "eba-modal-leer" }), "Noch keine Kurse. **Jetzt holen** liest sie aus ILIAS."); return; }
        for (const k of l) {
          const n = k.dateien;
          new ctx.obsidian.Setting(box).setName(k.titel).setDesc([k.code || "ohne Modul", n ? `${n} ${n === 1 ? "Datei" : "Dateien"}` : ""].filter(Boolean).join(" · "))
            .addToggle((t) => t.setValue(!!k.aktiv).onChange(async (an) => {
              try { await ctx.ilias.kursSetzen(k.refId, an); } catch (e) { new Notice("Das hat nicht geklappt. Bitte noch einmal versuchen.", 5000); }
            }));
        }
      };
      if (liste) kurseZeigen(liste);
      else ctx.ilias.kurse().then((l) => { if (this.offen()) kurseZeigen(l); }, () => kurseZeigen([]));
      mehrZeigen(c, v.erklaerung);
      const k = this.knoepfe();
      const los = k.createEl("button", { text: s.anderes ? "Hier laden" : "Jetzt holen", cls: "mod-cta" });
      if (s.laeuft) { los.disabled = true; los.setText("Lädt …"); }
      k.createEl("button", { text: "Trennen", cls: "mod-warning" }).addEventListener("click", () => { this.close(); ctx.aktion("trennen", { id: v.id }); });
      // Start und Ende des Abrufs zeichnen das Fenster über ereignis() neu; den Hinweis zum Ergebnis zeigt ilias.js
      los.addEventListener("click", () => {
        if (los.disabled) return;
        los.disabled = true; los.setText("Lädt …");
        ctx.ilias.jetztHolen({ uebernehmen: !!s.anderes }).catch(() => null).then(() => { neuZeichnen(); if (this.offen() && this.ansicht === "verwalten") this.zeigen(); });
      });
    }
  }

  let fenster = null; // offenes Fenster (für Tests: ctx.verbindungen.fenster)
  const fensterOeffnen = (v) => {
    const m = v.art === "anmeldung" ? new IliasFenster(v) : v.art !== "link" ? new InfoFenster(v) : v.status().verbunden ? new VerwaltenFenster(v) : new VerbindenFenster(v);
    fenster = m;
    m.open();
    return m;
  };

  // ---------- Zeichnen ----------
  const knopf = (aktion, id, text, art) => `<a class="eba-vb-knopf${art ? " " + art : ""}" href="${ctx.link(aktion, { id })}">${esc(text)}</a>`;

  // Beispielwoche hinter dem Schloss: gleiche Klassen wie das echte Raster (Stundenplan.md, formula.karte), damit sie auf jedem
  // Gerät genauso aussieht; CSS graut sie aus. [Tag 1–5, Beginn, Ende, Vorlesung?, Titel]
  const BEISPIEL = [[1, 10, 12, 1, "Mathematik"], [1, 14, 16, 0, "Statistik"], [2, 8, 10, 0, "Buchführung"], [2, 10, 12, 1, "VWL"],
    [3, 8, 10, 0, "VWL"], [3, 12, 14, 1, "BWL"], [4, 10, 12, 1, "Statistik"], [4, 14, 16, 0, "Mathematik"], [5, 10, 12, 1, "Buchführung"]];
  const beispielWoche = () => {
    const h0 = 8, h1 = 18, z = (h) => (h - h0) * 4 + 2;
    let html = `<div class="eba-woche" style="grid-template-rows:34px repeat(${(h1 - h0) * 4 + 1}, var(--eba-zeile))">`
      + `<div class="eba-tagkopf eba-ecke" style="grid-column:1"></div>`
      + ["Mo", "Di", "Mi", "Do", "Fr"].map((t, i) => `<div class="eba-tagkopf" style="grid-column:${i + 2}">${t}</div>`).join("");
    for (let h = h0; h <= h1; h += 2) html += `<span class="eba-zeit" style="grid-row:${z(h)}">${h < 10 ? "0" : ""}${h}</span><i class="eba-linie" style="grid-row:${z(h)}"></i>`;
    for (const [tag, b, e, vl, titel] of BEISPIEL) {
      const zeit = `${b < 10 ? "0" : ""}${b}:00–${e}:00`;
      html += `<span class="eba-ev ${vl ? "vl" : "ue"}" style="grid-column:${tag + 1};grid-row:${z(b)} / ${z(e)}"><b>${titel} · ${vl ? "Vorlesung" : "Übung"}</b>`
        + `<span>${zeit} · Hörsaal</span><em class="eba-ev-kurz">${titel}</em><small class="eba-ev-raum">Hörsaal</small></span>`;
    }
    return html + "</div>";
  };

  // Schloss-Karte in el (für ```eba-schloss <id>``` und für andere Skripte). Rückgabe: gesperrt?
  const schlossKarte = (el, id) => {
    const v = holen(id);
    el.empty();
    if (!v) { el.setText(`Unbekannte Verbindung „${id}“.`); return false; }
    const zu = v.gesperrt();
    el.toggleClass("eba-schloss-zu", zu);
    if (!zu) return false;
    if (v.vorschau === "woche") {
      const karte = el.createDiv({ cls: "eba-schloss mit-vorschau" });
      karte.innerHTML = `<div class="eba-schloss-vorschau" aria-hidden="true">${beispielWoche()}</div>`
        + `<div class="eba-schloss-auflage"><span class="eba-schloss-symbol" aria-hidden="true">${svg("schloss")}</span>`
        + `<span class="eba-schloss-text"><b>${esc(v.anreiz || v.name)}</b><span>${esc(v.satz)}</span></span>`
        + knopf("verbinden", v.id, `${v.name.split("-")[0]} verbinden`, "cta") + `</div>`;
      return true;
    }
    const karte = el.createDiv({ cls: "eba-schloss" });
    const eingabe = v.art === "link" || v.art === "anmeldung";
    karte.innerHTML = `<span class="eba-schloss-symbol" aria-hidden="true">${svg(v.art === "claude" ? "extern" : "schloss")}</span>`
      + `<span class="eba-schloss-text"><b>${esc(v.name)}</b><span>${esc(v.satz)}</span></span>`
      + knopf("verbinden", v.id, v.schlossKnopf || (eingabe ? "Verbinden" : "Mehr erfahren"), "cta");
    return true;
  };

  // Zeile je Verbindung: symbol (SYMBOLE) + ton (Farbe: ok | warn | leise), Text, Pille
  const statusZeile = (v) => {
    if (v.art === "zentral") {
      if (!ctx.zentral) return { zu: false, text: "Wird geladen …", pille: `<span class="eba-pill leer">…</span>`, symbol: "uhr", ton: "leise" };
      const a = ctx.zentral.anzeige(), s = ctx.zentral.status();
      const symbol = !a.an ? "aus" : s.pause ? "pause" : s.fehler ? "warnung" : "haken";
      return { zu: false, html: a.html, pille: a.pille, an: a.an, veranstaltungen: a.veranstaltungen, symbol, ton: symbol === "haken" ? "ok" : symbol === "warnung" ? "warn" : "leise" };
    }
    if (v.art === "vorlage") {
      if (!ctx.update) return { zu: false, text: "Wird geladen …", pille: `<span class="eba-pill leer">…</span>`, symbol: "uhr", ton: "leise" };
      const a = ctx.update.anzeige();
      return { zu: false, html: a.html, pille: a.pille, symbol: a.symbol, ton: a.ton, knopf: a.knopf };
    }
    if (v.art === "anmeldung") return iliasZeile(v);
    if (v.art === "claude") return { zu: true, text: "Kommt bald. Braucht dann Claude Code auf deinem Rechner.", pille: `<span class="eba-pill leer">für Fortgeschrittene</span>`, symbol: "extern", ton: "leise" };
    const s = v.status();
    if (s.verbunden) {
      const teile = [s.seit ? `verbunden seit ${tagText(s.seit)}` : "verbunden", s.stand ? `zuletzt aktualisiert ${zeitText(s.stand)}` : "noch nicht aktualisiert"];
      return { zu: false, text: teile.join(" · "), pille: `<span class="eba-pill ok">verbunden</span>`, symbol: "haken", ton: "ok" };
    }
    if (s.daten) return { zu: false, text: `Auf diesem Gerät nicht verbunden. Dein Stundenplan liegt vor (${s.daten} Einträge).`, pille: `<span class="eba-pill leer">nicht verbunden</span>`, symbol: "haken", ton: "leise" };
    return { zu: true, text: "Nicht verbunden.", pille: `<span class="eba-pill leer">nicht verbunden</span>`, symbol: "schloss", ton: "leise" };
  };

  // ILIAS: Text aus ctx.ilias.status() (fertig formuliert); Symbol und Pille je Stand
  const iliasZeile = (v) => {
    const s = v.status();
    const nicht = `<span class="eba-pill leer">nicht verbunden</span>`;
    if (s.extern) return { zu: false, text: s.text, pille: "", symbol: "haken", ton: "ok" };
    if (iliasOhneAnmeldung(s)) return { zu: false, text: s.text, pille: "", symbol: "uhr", ton: "leise" };
    if (s.verbunden && s.gesperrt) return { zu: false, text: s.text, pille: `<span class="eba-pill warn">Anmeldung prüfen</span>`, symbol: "warnung", ton: "warn" };
    if (s.verbunden) {
      const symbol = s.laeuft ? "uhr" : s.fehler ? "warnung" : "haken";
      return { zu: false, text: s.text, pille: `<span class="eba-pill ok">verbunden</span>`, symbol, ton: symbol === "warnung" ? "warn" : symbol === "haken" ? "ok" : "leise" };
    }
    if (s.daten) return { zu: false, text: `Auf diesem Gerät nicht verbunden. ${s.daten === 1 ? "1 Unterlage aus ILIAS liegt" : `${s.daten} Unterlagen aus ILIAS liegen`} vor.`, pille: nicht, symbol: "haken", ton: "leise" };
    return { zu: true, text: "Nicht verbunden.", pille: nicht, symbol: "schloss", ton: "leise" };
  };

  const uebersicht = (el) => {
    el.empty();
    const liste = el.createDiv({ cls: "eba-vb-liste" });
    for (const v of Object.values(VERBINDUNGEN)) {
      const st = statusZeile(v);
      const s = v.art === "link" || v.art === "anmeldung" ? v.status() : {};
      // Höchstens EIN Knopf; führt er nicht ins Fenster, steht „Mehr erfahren“ als Textlink im Status (Fenster mit dem Rest)
      let knoepfe = "", mehr = false;
      if (v.art === "zentral") {
        knoepfe = st.an ? knopf("zentral-aktualisieren", "", "Jetzt aktualisieren", "cta")
          : `<a class="eba-vb-knopf cta" href="${ctx.link("zentral-schalter", { was: "daten", wert: "1" })}">Einschalten</a>`;
        mehr = true;
      } else if (v.art === "vorlage") {
        if (st.knopf) { knoepfe = `<a class="eba-vb-knopf cta" href="${ctx.link(st.knopf.aktion, {})}">${esc(st.knopf.text)}</a>`; mehr = true; }
        else knoepfe = knopf("verbinden", v.id, "Mehr erfahren", "");
      } else if (v.art === "anmeldung") {
        // Eigener Uni-Abgleich oder Anmeldebaustein fehlt: kein Knopf. Verbunden: Jetzt holen (bzw. Hier laden), Rest im Fenster.
        if (s.extern || iliasOhneAnmeldung(s)) knoepfe = "";
        else if (s.verbunden && !s.gesperrt) {
          knoepfe = s.anderes ? `<a class="eba-vb-knopf cta" href="${ctx.link("verbindung-aktualisieren", { id: v.id, uebernehmen: "1" })}">Hier laden</a>`
            : knopf("verbindung-aktualisieren", v.id, "Jetzt holen", "cta");
          mehr = true;
        } else knoepfe = knopf("verbinden", v.id, "Verbinden", "cta");
      } else if (v.art === "link" && s.verbunden) { knoepfe = knopf("verbindung-aktualisieren", v.id, "Aktualisieren", "cta"); mehr = true; }
      else knoepfe = knopf("verbinden", v.id, v.art === "link" ? "Verbinden" : "Mehr erfahren", v.art === "link" ? "cta" : "");
      const zeile = liste.createDiv({ cls: "eba-vb" + (st.zu ? " zu" : "") });
      zeile.setAttr("data-id", v.id);
      zeile.innerHTML = `<span class="eba-vb-symbol ${st.ton || "leise"}" aria-hidden="true">${svg(st.symbol)}</span>`
        + `<span class="eba-vb-text"><b>${esc(v.name)} ${st.pille}</b><span class="eba-vb-status">${st.html != null ? st.html : esc(st.text)}`
        + (mehr ? ` <a class="eba-vb-mehr" href="${ctx.link("verbinden", { id: v.id })}">Mehr erfahren</a>` : "") + `</span></span>`
        + `<span class="eba-vb-knoepfe">${knoepfe}</span>`;
    }
  };

  // Knöpfe der Seite Stundenplan (```eba-alma-knoepfe```, seit 0.3.0): verbunden → nur „Stundenplan aus Alma holen“, sonst nur
  // „Alma verbinden“ und ein Satz dazu. Den Satz nicht, solange das Schloss gilt: Dann erklärt die Schloss-Karte darunter dasselbe
  // (Aufräumrunde 16.10.2026). Gleiche Gestalt wie eine Knopf-Karte > [!eba-neu|ohne-titel] (eba-core.css 6).
  const almaKnoepfe = (el) => {
    el.empty();
    const verbunden = !!VERBINDUNGEN.alma.status().verbunden;
    el.toggleClass("eba-alma-verbunden", verbunden);
    const karte = el.createDiv({ cls: "callout eba-alma-knoepfe", attr: { "data-callout": "eba-neu", "data-callout-metadata": "ohne-titel" } });
    const li = karte.createDiv({ cls: "callout-content" }).createEl("ul").createEl("li");
    if (verbunden) li.createEl("a", { text: "Stundenplan aus Alma holen", href: ctx.link("stundenplan", {}) });
    else {
      li.createEl("a", { text: "Alma verbinden", href: ctx.link("verbinden", { id: "alma" }) });
      if (!VERBINDUNGEN.alma.gesperrt()) fett(el.createEl("p", { cls: "eba-alma-hinweis" }), "Einmal **Alma verbinden**, dann holst du deinen Stundenplan hier mit einem Tipp.");
    }
  };

  const zeichnen = (inst) => {
    if (inst.art === "uebersicht") uebersicht(inst.el);
    else if (inst.art === "alma-knoepfe") almaKnoepfe(inst.el);
    else if (inst.art === "ilias-knopf") inst.el.toggleClass("eba-ilias-an", !!VERBINDUNGEN.ilias.status().verbunden);
    else schlossKarte(inst.el, inst.id);
  };

  // ---------- Aktionen ----------
  const waehlen = async (c, frage) => {
    let v = holen(c.parameter.id);
    if (!v) {
      const liste = Object.values(VERBINDUNGEN);
      v = await ctx.system.suggester(liste.map((x) => x.name), liste, false, frage);
    }
    return v || null;
  };
  const AKTIONEN = {
    verbinden: {
      titel: "Verbindung herstellen …",
      ausfuehren: async (c) => { const v = await waehlen(c, "Was verbinden?"); if (v) fensterOeffnen(v); },
    },
    "verbindung-aktualisieren": {
      titel: "Verbindung jetzt aktualisieren …",
      ausfuehren: async (c) => {
        const v = await waehlen(c, "Was aktualisieren?");
        if (!v) return;
        const st = v.status();
        if (!v.aktualisieren || !st.verbunden || st.gesperrt) { fensterOeffnen(v); return; }
        await v.aktualisieren(c.parameter || {});
        neuZeichnen();
      },
    },
    trennen: {
      titel: "Verbindung trennen (dieses Gerät) …",
      ausfuehren: async (c) => {
        const v = await waehlen(c, "Was trennen?");
        if (!v || !v.trennen) return;
        if (!v.status().verbunden) { new Notice(`${v.name}: auf diesem Gerät nicht verbunden.`, 4000); return; }
        const ok = await bestaetigen(`${v.name} trennen?`, v.trennenText || "Deine Daten bleiben, werden aber nicht mehr aktualisiert.", "Trennen");
        if (!ok) return;
        await v.trennen();
        new Notice(`${v.name} getrennt.`, 4000);
        neuZeichnen();
      },
    },
    // Knopf „Aus ILIAS holen“ (Seite Unterlagen): verbunden → holen (Hinweis zum Ergebnis zeigt ilias.js), sonst das Fenster
    "ilias-holen": {
      titel: "Unterlagen aus ILIAS holen",
      ausfuehren: async () => {
        const v = VERBINDUNGEN.ilias, s = v.status();
        if (!s.verbunden || s.gesperrt || s.extern) { fensterOeffnen(v); return; }
        await ctx.ilias.jetztHolen();
        neuZeichnen();
      },
    },
  };

  // Für andere Skripte (z. B. ein Raster, das selbst zeichnet)
  ctx.verbindungen = { liste: VERBINDUNGEN, holen, svg, gesperrt: (id) => { const v = holen(id); return v ? v.gesperrt() : false; }, schlossKarte, fensterOeffnen, neuZeichnen,
    get fenster() { return fenster; } }; // offenes Verbinden-/Info-Fenster (für Tests)

  const registrieren = () => {
    bloecke.length = 0;
    bloecke.push(ctx.codeblock("eba-schloss", (quelle, el, c, inst) => {
      inst.art = "schloss";
      inst.id = ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, "eba-schloss", Object.keys(VERBINDUNGEN), "alma") : "alma";
      try { zeichnen(inst); } catch (e) { console.error("eba-schloss", e); }
    }));
    bloecke.push(ctx.codeblock("eba-verbindungen", (quelle, el, c, inst) => {
      inst.art = "uebersicht";
      try { zeichnen(inst); } catch (e) { console.error("eba-verbindungen", e); el.setText(String(quelle)); }
    }));
    bloecke.push(ctx.codeblock("eba-alma-knoepfe", (quelle, el, c, inst) => {
      inst.art = "alma-knoepfe";
      try { zeichnen(inst); } catch (e) { console.error("eba-alma-knoepfe", e); el.setText(String(quelle)); }
    }));
    bloecke.push(ctx.codeblock("eba-ilias-knopf", (quelle, el, c, inst) => {
      inst.art = "ilias-knopf";
      el.addClass("eba-ilias-knopf");
      try { zeichnen(inst); } catch (e) { console.error("eba-ilias-knopf", e); }
    }));
    // Schloss auf Unterlagen: verschwindet, sobald Unterlagen aus ILIAS da sind (auch per Sync)
    const unterlagenBald = ctx.entprellen(neuZeichnen, 1500);
    ctx.an(app.metadataCache, "changed", (f) => { if (f.path.startsWith("Unterlagen/")) unterlagenBald(); });
    // Neu zeichnen, wenn sich der Stundenplan ändert (Import, Sync) – über das Datenmodell, sonst direkt
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(() => neuZeichnen()));
    else {
      const bald = ctx.entprellen(neuZeichnen, 800);
      ctx.an(app.metadataCache, "changed", (f) => { if (f.path.startsWith("Stundenplan/")) bald(); });
    }
  };

  return { registrieren, aktionen: AKTIONEN };
};
