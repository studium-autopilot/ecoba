// Einrichtung beim ersten Start (seit 0.3.0, ersetzt die Personalisieren-Karte). Ein Fenster mit sieben Bildschirmen:
//   1 Willkommen · 2 Studienbeginn · 3 Variante · 4 Über dich (Name, Zielnote) · 5 Dein Uni-Login (seit 0.4.8, freiwillig:
//   verbindet ILIAS-Unterlagen, ILIAS-Kalender und Alma-Stundenplan auf einmal, uni-login.js; bis 0.4.7 je ein Bildschirm für
//   Alma mit kopiertem Link und für ILIAS) · 6 Darstellung (seit 17.10.2026: Hell · Dunkel · Automatisch, seit 18.10.2026 dazu
//   das Design als drei Vorschau-Kacheln ohne Namen; darstellung.js) · 7 Fertig
// Regeln: je Bildschirm ein Satz und eine Hauptaktion; Fortschritt „Schritt n von 6“ mit Punkten (ab Bildschirm 2);
// Zurück jederzeit, Überspringen auf 2–5 (die Darstellung hat immer einen Wert, dort nur Weiter); Esc, „Später“ oder ×
// beenden ohne Verlust (Gespeichertes bleibt, nichts wird geschrieben; Darstellung und Design gelten sofort beim Antippen und
// bleiben, sie stehen nur auf diesem Gerät, nicht in den Einstellungen); kein Autofokus (auf dem iPhone spränge sonst die
// Tastatur auf); Tippflächen mindestens 44 px; auf dem iPhone bildschirmfüllend (eba-core.css Abschnitt 45).
//
// Zustand im synchronisierten System/Einstellungen.md (gilt für alle Geräte):
//   einrichtung: offen | laeuft | fertig      (leer = offen)
//   einrichtung_schritt: 1–7                  Bildschirm, an dem es beim nächsten Start weitergeht
//   einrichtung_fassung: 2                    Zählung der Bildschirme (seit 0.4.8, bei jedem Speichern geschrieben). Fehlt sie,
//                                             stammt der Schritt aus 0.4.7 oder früher (5 Alma, 6 ILIAS, 7 Darstellung, 8 Fertig;
//                                             0.3.x: Fertig war 6, 0.4.0–0.4.4: 7) und zustand() rechnet ihn um (ab 6 eins weniger).
//   einrichtung_uebersprungen: [studienbeginn, variante, angaben, uni]   was übersprungen wurde (Fertig: „Später nachholen“);
//                                             alma und ilias stammen aus Einrichtungen bis 0.4.7 und gelten weiter
// Geschrieben wird nur nach einem Tipp auf Weiter/Überspringen/Los geht’s (Antworten sofort, kein Verlust beim Abbrechen).
//
// Automatisch (start(), nur beim App-Start, höchstens einmal je App-Sitzung): erst wenn der metadataCache fertig ist und das
// Dashboard steht. Gezeigt wird, wenn einrichtung ≠ fertig UND (laeuft ODER der Vault ist noch nicht eingerichtet: kein Name,
// kein Studienbeginn, keine Notiz in Stundenplan/). Ein schon eingerichteter Vault (z. B. Update von 0.2.0) sieht nichts;
// dabei wird nichts geschrieben. Kommt per Sync während des Willkommens-Bildschirms „fertig“ oder ein Name an, schließt das
// Fenster von selbst (zweites Gerät).
//
// Schloss (verbindungen.js): ctx.einrichtung.almaOffen() = Einrichtung nicht fertig ODER Uni-Login (bzw. bis 0.4.7 Alma)
//   übersprungen. iliasOffen() ebenso für ILIAS, dazu: fertig ohne Fassung mit gespeichertem Schritt ≤ 6 (Einrichtung aus 0.3.x
//   ohne ILIAS-Schritt; so ein Tresor sieht die Einrichtung nicht noch einmal, sondern das Schloss auf der Seite Unterlagen).
// Aktion/Befehl „einrichtung“ (Parameter ab=2: ab Studienbeginn, vorausgefüllt; Knopf in Einstellungen & Hilfe).
// Für Tests: ctx.einrichtung = { zustand, eingerichtet, sollZeigen, almaOffen, iliasOffen, oeffnen, automatisch, fenster, … };
// das Fenster hat weiter(), ueberspringen(), zurueck(), schritt und felder.
module.exports = function (ctx) {
  const app = window.app;
  const { Modal } = ctx.obsidian;
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const DASHBOARD = "Dashboard.md";
  const SITZUNG = "eba-einrichtung-gezeigt"; // sessionStorage: in dieser App-Sitzung schon automatisch gezeigt
  const LETZTER = 7;
  const UNI = 5; // Bildschirm Dein Uni-Login
  const DARSTELLUNG = 6; // Bildschirm Darstellung
  const FASSUNG = 2; // Zählung der Bildschirme seit 0.4.8 (einrichtung_fassung); ohne Feld: Zählung bis 0.4.7 (acht Bildschirme)
  const ALT_MAX = 8; // höchster gespeicherter Schritt der alten Zählung (0.4.5–0.4.7: Fertig war 8)
  const OHNE_ILIAS_BIS = 6; // fertig ohne Fassung bei Schritt ≤ 6: Einrichtung aus 0.3.x, damals ohne ILIAS-Schritt
  const PUNKT = { 2: "studienbeginn", 3: "variante", 4: "angaben", 5: "uni" }; // Schlüssel für einrichtung_uebersprungen
  // Variante: Werte, Reihenfolge und Wörter aus dem Feld-Register (felder.js), gleich wie Formular und Zeilen „Variante“. Erst bei
  // Bedarf gelesen: Kommt ein Update über den Sync, kann einrichtung.js vor felder.js ankommen
  const varianten = () => { const FV = ctx.user.felder.VARIANTE; return FV.werte.map((w) => ({ wert: w, titel: FV.titel[w], text: FV.kurz[w] })); };
  // Lucide-Linien (wie verbindungen.js), Strich in currentColor
  const SYM = {
    hut: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    haken: '<path d="M20 6 9 17l-5-5"/>',
    pfeil: '<path d="m15 18-6-6 6-6"/>',
  };
  const svg = (n, cls) => `<svg class="eba-sym${cls ? " " + cls : ""}" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SYM[n]}</svg>`;

  const txt = (x) => String(x == null ? "" : x).trim();
  const datei = () => app.vault.getAbstractFileByPath(EINSTELLUNGEN);
  const fmVon = () => { const f = datei(); const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
  const liste = (x) => (Array.isArray(x) ? x : txt(x) ? [x] : []).map((s) => txt(s).toLowerCase()).filter(Boolean);
  const P = () => ctx.personalisieren || null;
  const V = (id) => (ctx.verbindungen && ctx.verbindungen.holen ? ctx.verbindungen.holen(id || "alma") : null);
  // Uni-Login (uni-login.js, Bibliothek): verbindet nach der Anmeldung ILIAS-Kalender und Alma mit
  const uni = () => { const f = ctx.user && ctx.user["uni-login"]; try { return typeof f === "function" ? f(ctx) : null; } catch (e) { return null; } };
  const pause = (ms) => new Promise((r) => ctx.zeit(r, ms));

  // ---------- Zustand ----------
  const zustand = () => {
    const fm = fmVon(), e = txt(fm.einrichtung).toLowerCase();
    const roh = Math.round(Number(fm.einrichtung_schritt) || 0), fassung = Math.round(Number(fm.einrichtung_fassung) || 0);
    // Alte Zählung (bis 0.4.7): 5 Alma → 5 Uni-Login, 6 ILIAS → 5 Uni-Login, 7 Darstellung → 6, 8 Fertig → 7
    const s = fassung >= FASSUNG ? (roh >= 1 && roh <= LETZTER ? roh : 0) : roh >= 1 && roh <= ALT_MAX ? (roh >= 6 ? roh - 1 : roh) : 0;
    return { status: e === "fertig" || e === "laeuft" ? e : "offen", schritt: s, roh, fassung, uebersprungen: liste(fm.einrichtung_uebersprungen) };
  };
  const stundenplanDa = () => app.vault.getMarkdownFiles().some((f) => f.path.indexOf("Stundenplan/") === 0);
  // Offensichtlich schon eingerichtet (z. B. 0.2.0 mit Angaben, oder Stundenplan per Sync): Name oder Studienbeginn oder Stundenplan
  const eingerichtet = () => { const fm = fmVon(); return !!(txt(fm.name) || txt(fm.studienbeginn) || stundenplanDa()); };
  const sollZeigen = () => {
    if (!datei()) return false; // Einstellungen fehlen (z. B. Sync noch nicht fertig): nie
    const z = zustand();
    if (z.status === "fertig") return false;
    if (z.status === "laeuft") return true;
    return !eingerichtet();
  };
  // Schloss für Alma (verbindungen.js): solange die Einrichtung nicht fertig ist oder der Uni-Login (bis 0.4.7: Alma) dort
  // übersprungen wurde
  const uebersprungen = (z, p) => z.uebersprungen.indexOf(p) >= 0;
  const almaOffen = () => { const z = zustand(); return z.status !== "fertig" || uebersprungen(z, "uni") || uebersprungen(z, "alma"); };
  // Schloss für ILIAS: ebenso, und wenn die Einrichtung vor 0.4.0 fertig wurde (nie bis hinter den ILIAS-Bildschirm gekommen)
  const iliasOffen = () => { const z = zustand(); return z.status !== "fertig" || uebersprungen(z, "uni") || uebersprungen(z, "ilias") || (z.fassung < FASSUNG && z.roh <= OHNE_ILIAS_BIS); };

  const schreiben = async (werte) => {
    const f = datei();
    if (!f) throw new Error("Die Einstellungen fehlen (System/Einstellungen.md).");
    await app.fileManager.processFrontMatter(f, (x) => { for (const k of Object.keys(werte)) x[k] = werte[k]; });
  };
  const sitzungGezeigt = () => { try { return !!window.sessionStorage.getItem(SITZUNG); } catch (e) { return false; } };
  const sitzungMerken = (an) => { try { if (an) window.sessionStorage.setItem(SITZUNG, "1"); else window.sessionStorage.removeItem(SITZUNG); } catch (e) { /* egal */ } };
  // Entwurf (Eingaben ohne Weiter) überlebt Schließen und Hot-Reload in dieser Sitzung, nie in einer Datei
  const entwurf = ctx.bleibend("entwurf", () => ({}));

  // Texte mit **fett**, ohne innerHTML
  // Text mit **fett** und [Link](https://…) wie in verbindungen.js; ohne verbindungen.js nur **fett**
  const fett = (el, s) => {
    if (ctx.verbindungen && ctx.verbindungen.fett) { ctx.verbindungen.fett(el, s); return; }
    String(s || "").split("**").forEach((t, i) => { if (t) { if (i % 2) el.createEl("b", { text: t }); else el.appendText(t); } });
  };
  const dmy = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "");
  const semesterName = (beginn) => { try { return beginn && ctx.modell ? ctx.modell.semesterAusDatum(beginn) : ""; } catch (e) { return ""; } };

  // ---------- Fenster ----------
  class Fenster extends Modal {
    constructor(o) {
      super(app);
      const fm = fmVon(), z = zustand();
      this.schritt = o.schritt;
      this.min = o.min || 1;
      this.automatisch = !!o.automatisch;
      this.fertigGewesen = z.status === "fertig"; // „erneut starten“: Status bleibt fertig
      this.uebersprungen = z.uebersprungen.slice();
      // Einrichtung aus 0.3.x (fertig ohne Fassung bei Schritt ≤ 6, nie ein ILIAS-Bildschirm): gilt als Uni-Login übersprungen, damit
      // das Schloss auf Unterlagen bleibt, auch wenn ein erneuter Start vor Bildschirm 5 endet (mit Fassung entfiele die Erkennung)
      if (z.status === "fertig" && z.fassung < FASSUNG && z.roh <= OHNE_ILIAS_BIS && this.uebersprungen.indexOf("uni") < 0) this.uebersprungen.push("uni");
      const heute = ctx.modell ? ctx.modell.daten().heute : "";
      const jetzt = heute ? ctx.modell.semesterNachName(ctx.modell.semesterAusDatum(heute)) : null;
      this.werte = {
        studienbeginn: txt(fm.studienbeginn).slice(0, 10) || (jetzt ? jetzt.beginn : ""),
        variante: varianten().some((v) => v.wert === txt(fm.variante)) ? txt(fm.variante) : "offen",
        name: entwurf.name != null ? entwurf.name : txt(fm.name),
        zielnote: entwurf.zielnote != null ? entwurf.zielnote : txt(fm.zielnote),
      };
      this.gespeichert = {}; // in diesem Fenster geschriebene Antworten (der metadataCache kommt kurz danach)
      this.uni = null; // Ergebnis des Uni-Logins in diesem Fenster ({ kurse, laedt: erster Abruf gestartet, weitere: uni-login.js alleVerbinden })
      this.felder = {};
      this.laeuft = false;
    }
    onOpen() {
      this.modalEl.addClass("eba-modal", "eba-modal-einrichtung");
      this.titleEl.empty();
      this.zeigen();
    }
    onClose() {
      // Eingaben ohne Weiter merken (nur im Speicher)
      if (this.felder.name) entwurf.name = this.felder.name.value;
      if (this.felder.ziel) entwurf.zielnote = this.felder.ziel.value;
      this.contentEl.empty();
      if (fenster === this) fenster = null;
    }

    // Zum Bildschirm n (ohne zu schreiben)
    gehe(n) { this.schritt = Math.max(this.min, Math.min(LETZTER, n)); this.zeigen(); }
    zurueck() { if (this.schritt > this.min) this.gehe(this.schritt - 1); }
    // Antworten des Bildschirms + Stand speichern, dann weiter. daten: Felder für die Einstellungen; uebersprungen: true/false
    async speichernUndWeiter(daten, uebersprungen) {
      if (this.laeuft) return false;
      const punkt = PUNKT[this.schritt];
      if (punkt) {
        const i = this.uebersprungen.indexOf(punkt);
        if (uebersprungen && i < 0) this.uebersprungen.push(punkt);
        if (!uebersprungen && i >= 0) this.uebersprungen.splice(i, 1);
        // Uni-Login erledigt: auch übersprungenes Alma und ILIAS aus 0.4.7 und früher
        if (punkt === "uni" && !uebersprungen) this.uebersprungen = this.uebersprungen.filter((p) => p !== "alma" && p !== "ilias");
      }
      const naechster = Math.min(LETZTER, this.schritt + 1);
      if (naechster === LETZTER) this.fertigGewesen = true;
      const werte = Object.assign({}, daten || {}, {
        einrichtung: this.fertigGewesen ? "fertig" : "laeuft",
        einrichtung_schritt: naechster,
        einrichtung_fassung: FASSUNG,
        einrichtung_uebersprungen: PUNKT_REIHE.filter((p) => this.uebersprungen.indexOf(p) >= 0),
      });
      this.laeuft = true;
      try { await schreiben(werte); } catch (e) {
        this.laeuft = false;
        console.error("Einrichtung: speichern", e);
        ctx.hinweis("Speichern hat nicht geklappt. Bitte noch einmal versuchen.");
        return false;
      }
      this.laeuft = false;
      Object.assign(this.gespeichert, daten || {});
      if (daten && "studienbeginn" in daten && ctx.modell && ctx.modell.abgleichen) ctx.zeit(() => { ctx.modell.abgleichen("einrichtung").catch((e) => console.error(e)); }, 300);
      if (daten && "name" in daten) { delete entwurf.name; delete entwurf.zielnote; }
      this.gehe(naechster);
      return true;
    }
    // Hauptaktion des Bildschirms (Weiter, Los geht’s, Verbinden, Fertig)
    async weiter() { if (this.aktion) return this.aktion(); }
    async ueberspringen() { if (PUNKT[this.schritt]) return this.speichernUndWeiter(null, true); }
    spaeter() { this.close(); }

    // ---------- Zeichnen ----------
    zeigen() {
      const c = this.contentEl;
      c.empty();
      this.felder = {};
      this.aktion = null;
      const s = this.schritt;
      this.modalEl.setAttr("data-schritt", String(s));
      const rahmen = c.createDiv({ cls: "eba-ei" + (s === 1 ? " willkommen" : s === LETZTER ? " fertig" : "") });
      if (s > 1) {
        const kopf = rahmen.createDiv({ cls: "eba-ei-kopf" });
        kopf.createSpan({ cls: "eba-ei-stand", text: `Schritt ${s - 1} von ${LETZTER - 1}` });
        const punkte = kopf.createSpan({ cls: "eba-ei-punkte", attr: { "aria-hidden": "true" } });
        for (let i = 2; i <= LETZTER; i++) punkte.createEl("i", { cls: i < s ? "fertig" : i === s ? "jetzt" : "" });
      }
      const haupt = rahmen.createDiv({ cls: "eba-ei-haupt" });
      const fuss = rahmen.createDiv({ cls: "eba-ei-fuss" });
      const knopf = (text, art, fn) => {
        const b = fuss.createEl("button", { text, cls: "eba-ei-knopf " + art + (art === "haupt" ? " mod-cta" : "") });
        b.addEventListener("click", () => { Promise.resolve(fn()).catch((e) => { console.error("Einrichtung", e); ctx.hinweis("Das hat nicht geklappt. Bitte noch einmal versuchen."); }); });
        return b;
      };
      const titel = (t, satz) => {
        haupt.createEl("h2", { cls: "eba-ei-titel", text: t });
        if (satz) fett(haupt.createEl("p", { cls: "eba-ei-satz" }), satz);
      };
      const bild = (n) => { haupt.createDiv({ cls: "eba-ei-bild" }).innerHTML = svg(n); };

      if (s === 1) {
        bild("hut");
        titel("Willkommen", "Dein Studium an einem Ort: Termine, Prüfungen, Noten und Stundenplan.");
        this.aktion = async () => {
          if (!this.fertigGewesen) return this.speichernUndWeiter(null, false);
          this.gehe(2);
        };
        knopf("Los geht’s", "haupt", () => this.weiter());
        knopf("Später", "leise", () => this.spaeter());
        return;
      }

      // Zurück (links), Überspringen, Hauptaktion (rechts); auf dem iPhone Hauptaktion oben über die ganze Breite
      const unten = () => {
        const z = knopf("Zurück", "zurueck leise", () => this.zurueck());
        z.innerHTML = svg("pfeil") + "<span>Zurück</span>";
        if (s <= this.min) z.addClass("eba-ei-weg");
        fuss.createDiv({ cls: "eba-ei-luecke" });
      };

      if (s === 2) {
        titel("Wann hast du angefangen?", "Wähle das Semester, in dem dein Studium beginnt.");
        const feld = haupt.createDiv({ cls: "eba-ei-feld" });
        const sel = feld.createEl("select", { cls: "dropdown eba-ei-auswahl", attr: { "aria-label": "Studienbeginn" } });
        if (P() && P().semesterOptionen) P().semesterOptionen(sel, this.werte.studienbeginn, null);
        if (this.werte.studienbeginn && Array.from(sel.options).some((o) => o.value === this.werte.studienbeginn)) sel.value = this.werte.studienbeginn;
        const hilfe = feld.createEl("p", { cls: "eba-ei-hilfe" });
        const hilfeZeigen = () => {
          this.werte.studienbeginn = sel.value;
          const v = P() && P().vorschauTeile ? P().vorschauTeile(sel.value) : null;
          let t = !v ? "" : v.fs ? `Heute bist du im ${v.fs}. Fachsemester.` : v.heute ? "Dein Studium hat noch nicht begonnen." : "";
          if (v && v.hinweis) t += " " + v.hinweis;
          hilfe.setText(t);
        };
        sel.addEventListener("change", hilfeZeigen);
        hilfeZeigen();
        this.felder.sem = sel;
        this.aktion = () => this.speichernUndWeiter({ studienbeginn: sel.value || null }, false);
        unten();
        knopf("Überspringen", "leise", () => this.ueberspringen());
        knopf("Weiter", "haupt", () => this.weiter());
        return;
      }

      if (s === 3) {
        titel("Welche Richtung?", "Danach richtet sich dein Musterplan. Ändern geht jederzeit.");
        const gruppe = haupt.createDiv({ cls: "eba-ei-wahl", attr: { role: "radiogroup", "aria-label": "Variante" } });
        const radios = [];
        for (const v of varianten()) {
          const l = gruppe.createEl("label", { cls: "eba-ei-option" });
          const r = l.createEl("input", { type: "radio", attr: { name: "eba-ei-variante", value: v.wert } });
          r.checked = this.werte.variante === v.wert;
          const t = l.createSpan({ cls: "eba-ei-option-text" });
          t.createEl("b", { text: v.titel });
          t.createSpan({ text: v.text });
          r.addEventListener("change", () => { if (r.checked) this.werte.variante = v.wert; });
          radios.push(r);
        }
        this.felder.radios = radios;
        this.aktion = () => this.speichernUndWeiter({ variante: this.werte.variante || "offen" }, false);
        unten();
        knopf("Überspringen", "leise", () => this.ueberspringen());
        knopf("Weiter", "haupt", () => this.weiter());
        return;
      }

      if (s === 4) {
        titel("Über dich", "Beides ist freiwillig.");
        const form = haupt.createDiv({ cls: "eba-ei-form" });
        const zeile = (label, hilfe) => {
          const z = form.createEl("label", { cls: "eba-ei-zeile" });
          z.createSpan({ cls: "eba-ei-label", text: label });
          return { z, hilfe };
        };
        const zn = zeile("Name");
        const name = zn.z.createEl("input", { type: "text", cls: "eba-ei-eingabe", attr: { placeholder: "Vorname", autocomplete: "given-name", enterkeyhint: "next" } });
        name.value = this.werte.name || "";
        zn.z.createSpan({ cls: "eba-ei-hilfe", text: "Für die Begrüßung auf dem Dashboard." });
        const zz = zeile("Zielnote");
        const ziel = zz.z.createEl("input", { type: "text", cls: "eba-ei-eingabe kurz", attr: { placeholder: "z. B. 2,0", inputmode: "decimal", enterkeyhint: "done" } });
        ziel.value = this.werte.zielnote || "";
        zz.z.createSpan({ cls: "eba-ei-hilfe", text: "Deine Zielnote, 1,0 bis 4,0." });
        const meldung = haupt.createEl("p", { cls: "eba-ei-meldung" });
        ziel.addEventListener("input", () => { ziel.removeClass("eba-feld-fehler"); meldung.setText(""); meldung.removeClass("fehler"); });
        name.addEventListener("input", () => { this.werte.name = name.value; });
        ziel.addEventListener("input", () => { this.werte.zielnote = ziel.value; });
        this.felder.name = name; this.felder.ziel = ziel; this.felder.meldung = meldung;
        this.aktion = async () => {
          const pruefen = P() && P().zielnotePruefen ? P().zielnotePruefen : (x) => ({ ok: true, wert: txt(x) });
          const zn2 = pruefen(ziel.value);
          if (!zn2.ok) { meldung.setText(zn2.fehler); meldung.addClass("fehler"); ziel.addClass("eba-feld-fehler"); return false; }
          return this.speichernUndWeiter({ name: txt(name.value) || null, zielnote: zn2.wert || null }, false);
        };
        for (const el of [name, ziel]) el.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); this.weiter(); } });
        unten();
        knopf("Überspringen", "leise", () => this.ueberspringen());
        knopf("Weiter", "haupt", () => this.weiter());
        return;
      }

      if (s === UNI) {
        const v = V("ilias"), I = ctx.ilias, U = uni();
        const st = v ? v.status() : { verbunden: false, extern: false };
        const almaSt = V() ? V().status() : { extern: false };
        const ohne = !v || !I || st.text === I.K.TEXT_ANMELDUNG_FOLGT || !I.kannSpeichern();
        titel("Dein Uni-Login", "");
        // Ergebnis in Zeilen: ✓ verbunden, sonst leise mit dem Grund
        const zeilen = (liste) => {
          for (const z of liste) {
            const el = haupt.createDiv({ cls: "eba-ei-erfolg" + (z.ok ? "" : " leise") });
            if (z.ok) el.innerHTML = svg("haken");
            el.createSpan({ text: z.text });
          }
        };
        const weitereZeilen = (w) => (U && w ? U.QUELLEN.filter((id) => w[id]).map((id) => ({ ok: w[id].ok, text: U.zeile(id, w[id]) })) : []);
        // ILIAS-Kalender und Alma mit dem Uni-Login verbinden (uni-login.js); meldung nennt den Schritt
        const weitere = (meldung) => (U ? U.alleVerbinden({ schritt: (id) => meldung.setText(id === "alma" ? "Hole deinen Stundenplan aus Alma …" : "Verbinde deinen ILIAS-Kalender …") }) : Promise.resolve({}));
        const weiterKnopf = () => {
          this.aktion = () => this.speichernUndWeiter(null, false);
          unten();
          knopf("Weiter", "haupt", () => this.weiter());
        };
        if (this.uni) {
          const n = this.uni.kurse;
          const ilias = n == null ? [] : [{ ok: true, text: `ILIAS-Unterlagen verbunden${n ? ` – ${n} ${n === 1 ? "Kurs" : "Kurse"} gefunden` : ""}. ${this.uni.laedt ? "Deine Dateien werden jetzt geladen." : "Deine Dateien kommen von selbst."}` }];
          zeilen(ilias.concat(weitereZeilen(this.uni.weitere)));
          weiterKnopf();
          return;
        }
        // Eigener Uni-Abgleich (Unterlagen von außen) oder hier nicht möglich (Obsidian zu alt, Anmeldebaustein fehlt): ein Satz, Weiter
        if (st.extern || ohne) {
          const saetze = st.extern ? [I.K.TEXT_EXTERN].concat(almaSt.extern && ctx.verbindungen ? [ctx.verbindungen.ALMA_EXTERN] : [])
            : [!I || !v || st.text === I.K.TEXT_ANMELDUNG_FOLGT ? "Das geht in dieser Version noch nicht." : "Dafür braucht Obsidian Version 1.11.4 oder neuer."];
          zeilen(saetze.map((t) => ({ ok: !!st.extern, text: t })));
          weiterKnopf();
          return;
        }
        // Schon auf diesem Gerät gespeichert: was noch fehlt (Kalender, Alma), verbindet ein Tipp ohne Passwort
        if (st.verbunden) {
          const offen = U ? U.moeglich() : [];
          zeilen([{ ok: true, text: "Dein Uni-Login ist auf diesem Gerät gespeichert." }]);
          if (!offen.length) { weiterKnopf(); return; }
          const wo = offen.map((id) => (id === "alma" ? "Alma" : "ILIAS")).join(" und ");
          haupt.createEl("p", { cls: "eba-ei-hilfe", text: `Noch nicht verbunden: ${offen.map((id) => U.NAME[id]).join(" und ")}. Dafür meldet sich Studium Autopilot mit deinem Uni-Login bei ${wo} an.` });
          const meldung = haupt.createEl("p", { cls: "eba-ei-meldung" });
          let los = null;
          this.aktion = async () => {
            if (this.laeuft) return false;
            this.laeuft = true; los.disabled = true; los.setText("Verbinde …");
            U.zustimmen(offen);
            let w = {};
            try { w = await weitere(meldung); } catch (e) { w = {}; }
            this.laeuft = false;
            this.uni = { kurse: null, laedt: false, weitere: w };
            if (ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen();
            if (fenster === this && this.schritt === UNI) this.zeigen();
            return true;
          };
          unten();
          knopf("Überspringen", "leise", () => this.ueberspringen());
          los = knopf("Verbinden", "haupt", () => this.weiter());
          return;
        }
        fett(haupt.createEl("p", { cls: "eba-ei-satz" }), v.kurz);
        const form = haupt.createDiv({ cls: "eba-ei-form" });
        const zeile = (label) => { const z = form.createEl("label", { cls: "eba-ei-zeile" }); z.createSpan({ cls: "eba-ei-label", text: label }); return z; };
        const benutzer = zeile("Benutzername").createEl("input", { type: "text", cls: "eba-ei-eingabe", attr: { placeholder: "z. B. zxabc01", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "next" } });
        benutzer.value = st.benutzer || "";
        const geheimFeld = zeile("Passwort").createEl("input", { type: "password", cls: "eba-ei-eingabe", attr: { autocomplete: "off", enterkeyhint: "go" } });
        const schutz = haupt.createEl("p", { cls: "eba-ei-datenschutz" });
        if (ctx.verbindungen && ctx.verbindungen.svg) schutz.innerHTML = ctx.verbindungen.svg("schloss");
        schutz.createSpan({ text: v.datenschutz });
        const meldung = haupt.createEl("p", { cls: "eba-ei-meldung" });
        const leeren = () => { if (meldung.hasClass("fehler")) { meldung.setText(""); meldung.removeClass("fehler"); } };
        benutzer.addEventListener("input", leeren);
        geheimFeld.addEventListener("input", leeren);
        this.felder.benutzer = benutzer; this.felder.geheimFeld = geheimFeld; this.felder.meldung = meldung;
        let los = null;
        // Wie im Fenster unter Verbindungen (verbindungen.js): prüfen, nur bei Erfolg speichern, das Feld danach immer leeren; dann
        // Kurse lesen (erster Abruf im Hintergrund) und ILIAS-Kalender und Alma mit verbinden (uni-login.js)
        this.aktion = async () => {
          if (this.laeuft) return false;
          const name = benutzer.value.trim();
          const fehler = (t) => { meldung.setText(t); meldung.addClass("fehler"); return false; };
          if (!name) return fehler("Bitte deinen Benutzernamen eingeben.");
          if (!geheimFeld.value) return fehler("Bitte dein Passwort eingeben.");
          this.laeuft = true; los.disabled = true; los.setText("Verbinde …"); meldung.removeClass("fehler"); meldung.setText("Verbinde mit ILIAS …");
          let r;
          try { r = await I.zugangSpeichern(name, () => geheimFeld.value, { pruefen: true }); } catch (e) { r = null; }
          geheimFeld.value = "";
          if (!r || !r.ok) { this.laeuft = false; los.disabled = false; los.setText("Verbinden"); return fehler((r && r.fehler) || "Das hat nicht geklappt. Bitte noch einmal versuchen."); }
          // Zustimmung nur für das, was der Satz über den Feldern nannte (ältere Registry ohne uniQuellen: für nichts)
          if (U) U.zustimmen(v && Array.isArray(v.uniQuellen) ? v.uniQuellen : []);
          meldung.setText("Lese deine Kurse …");
          let liste = null;
          try { liste = await I.kurseAbrufen(); } catch (e) { liste = null; }
          // erster Abruf gleich, im Hintergrund (Hinweis mit Fortschritt, wie Jetzt holen), wenn ein Kurs an ist
          const laedt = Array.isArray(liste) && liste.some((k) => k.aktiv);
          if (laedt) I.jetztHolen().catch(() => null);
          let w = {};
          try { w = await weitere(meldung); } catch (e) { w = {}; }
          this.laeuft = false;
          this.uni = { kurse: Array.isArray(liste) ? liste.length : 0, laedt, weitere: w };
          if (ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen();
          if (fenster === this && this.schritt === UNI) this.zeigen();
          return true;
        };
        benutzer.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); geheimFeld.focus(); } });
        geheimFeld.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); this.weiter(); } });
        if (v.erklaerung) haupt.createEl("p", { cls: "eba-ei-hilfe", text: v.erklaerung });
        unten();
        knopf("Überspringen", "leise", () => this.ueberspringen());
        los = knopf("Verbinden", "haupt", () => this.weiter());
        return;
      }

      if (s === DARSTELLUNG) {
        // Derselbe Umschalter und dieselben Design-Kacheln wie in Einstellungen & Hilfe (darstellung.js): Antippen schaltet
        // sofort um; Weiter speichert nur den Stand der Einrichtung
        titel("Wie soll es aussehen?", "Tipp an, was dir gefällt, du siehst es sofort.");
        const D = ctx.darstellung;
        if (D) {
          this.felder.darstellung = D.schalter(haupt.createDiv({ cls: "eba-ei-feld" }));
          this.felder.designs = D.designWahl(haupt.createDiv({ cls: "eba-ei-feld" }));
        }
        this.aktion = () => this.speichernUndWeiter(null, false);
        unten();
        knopf("Weiter", "haupt", () => this.weiter());
        return;
      }

      // 8 Fertig
      bild("haken");
      titel("Alles bereit", "Ändern kannst du alles unter **Einstellungen & Hilfe**.");
      const fm = fmVon();
      const w = (k) => txt(k in this.gespeichert ? this.gespeichert[k] : fm[k]);
      const zus = haupt.createDiv({ cls: "eba-ei-liste" });
      const zeile = (k, wert) => { const z = zus.createDiv({ cls: "eba-ei-liste-zeile" }); z.createSpan({ text: k }); z.createEl("b", { text: wert }); };
      const beginn = w("studienbeginn").slice(0, 10);
      const sem = semesterName(beginn);
      let start = "";
      try { start = ctx.modell ? ctx.modell.daten().startSemester : ""; } catch (e) { start = ""; }
      zeile("Studienbeginn", sem || dmy(beginn) || start || "aktuelles Semester");
      const alle = varianten(), vari = alle.find((x) => x.wert === w("variante")) || alle[3];
      zeile("Variante", ctx.user.felder.varianteImSatz(vari.wert));
      if (w("name")) zeile("Name", w("name"));
      if (w("zielnote")) zeile("Zielnote", w("zielnote"));
      const v = V(), st = v ? v.status() : { verbunden: false, daten: 0 };
      let zentral = false;
      try { zentral = !!(ctx.zentral && ctx.zentral.stundenplan && ctx.zentral.stundenplan().verfuegbar); } catch (e) { zentral = false; }
      if (st.extern) zeile("Stundenplan", "über deinen Uni-Abgleich");
      else if (st.verbunden || st.daten) zeile("Stundenplan", st.verbunden ? "Alma verbunden" : "liegt vor");
      else if (zentral) zeile("Stundenplan", "kommt von selbst");
      const vi = V("ilias"), si = vi ? vi.status() : { verbunden: false, extern: false };
      if (si.extern) zeile("Unterlagen", "über deinen Uni-Abgleich");
      else if (si.verbunden) zeile("Unterlagen", "ILIAS verbunden");
      const vk = V("ilias-kalender"), sk = vk && ctx.iliasKalender ? vk.status() : { verbunden: false, extern: false };
      if (sk.extern) zeile("Abgaben", "über deinen Uni-Abgleich");
      else if (sk.verbunden) zeile("Abgaben", "ILIAS-Kalender verbunden");
      const dm = ctx.darstellung ? ctx.darstellung.MODI.find((m) => m.wert === ctx.darstellung.modus()) : null;
      if (dm) zeile("Darstellung", dm.titel);
      // Übersprungenes: „Später nachholen“ mit Knopf (springt zu dem Bildschirm); Alma oder ILIAS aus 0.4.7 und früher holt der
      // Uni-Login nach (erledigt, sobald ILIAS hier verbunden ist oder die Unterlagen von außen kommen)
      const NACH = { studienbeginn: [2, "Studienbeginn"], variante: [3, "Variante"], angaben: [4, "Über dich"], uni: [UNI, "Uni-Login"] };
      const ueber = this.uebersprungen.map((p) => (p === "alma" || p === "ilias" ? "uni" : p));
      const erledigt = (p) => p === "uni" && (si.verbunden || si.extern);
      const offen = Object.keys(NACH).filter((p) => ueber.indexOf(p) >= 0 && !erledigt(p));
      if (offen.length) {
        const box = haupt.createDiv({ cls: "eba-ei-nachholen" });
        box.createEl("p", { cls: "eba-ei-nachholen-titel", text: "Später nachholen" });
        for (const p of offen) {
          const z = box.createDiv({ cls: "eba-ei-nachholen-zeile" });
          z.createSpan({ text: NACH[p][1] });
          const b = z.createEl("button", { cls: "eba-ei-knopf klein", text: p === "uni" ? "Verbinden" : "Nachholen" });
          b.addEventListener("click", () => this.gehe(NACH[p][0]));
        }
      }
      this.aktion = async () => { this.close(); };
      unten();
      knopf("Fertig", "haupt", () => this.weiter());
    }
  }
  const PUNKT_REIHE = ["studienbeginn", "variante", "angaben", "uni", "alma", "ilias"]; // alma, ilias: aus 0.4.7 und früher

  let fenster = null;
  // Öffnen: ab = 2 (Einstellungen: Tipp auf die Zeile „Einrichtung“, vorausgefüllt); sonst am gespeicherten Schritt bzw. Willkommen
  const oeffnen = (o) => {
    o = o || {};
    if (fenster) return fenster;
    const z = zustand();
    const ab = Math.round(Number(o.ab) || 0);
    let schritt = 1;
    if (ab >= 1 && ab <= LETZTER) schritt = ab;
    else if (z.status === "laeuft" && z.schritt >= 1) schritt = Math.min(z.schritt, LETZTER);
    const m = new Fenster({ schritt, min: ab >= 2 ? 2 : 1, automatisch: !!o.automatisch });
    fenster = m;
    m.open();
    return m;
  };
  // Beim App-Start (einmal je Sitzung). immer: Sitzungsmerker übergehen (Tests). Schreibt nie.
  const automatisch = async (o) => {
    o = o || {};
    if (fenster) return false;
    if (!o.immer && sitzungGezeigt()) return false;
    if (!sollZeigen()) return false;
    sitzungMerken(true);
    oeffnen({ automatisch: true });
    return true;
  };
  const dashboardSteht = () => app.workspace.getLeavesOfType("markdown").some((l) => l.view && l.view.file && l.view.file.path === DASHBOARD
    && l.view.containerEl && l.view.containerEl.querySelector(".markdown-preview-section > div, .cm-content"));

  ctx.einrichtung = { zustand, eingerichtet, sollZeigen, almaOffen, iliasOffen, oeffnen, automatisch, sitzungMerken, SITZUNG, FASSUNG,
    get VARIANTEN() { return varianten(); }, get fenster() { return fenster; } };

  const registrieren = () => {
    // Zweites Gerät: kommt per Sync „fertig“ oder ein Name an, während nur das Willkommen offen ist → leise schließen
    ctx.an(app.metadataCache, "changed", (f) => {
      if (!fenster || !fenster.automatisch || fenster.schritt !== 1) return;
      if (f.path !== EINSTELLUNGEN && f.path.indexOf("Stundenplan/") !== 0) return;
      if (!sollZeigen()) fenster.close();
    });
  };

  // Nur beim App-Start: warten, bis der metadataCache fertig ist und das Dashboard steht (start.js öffnet es)
  const start = () => {
    const warten = async () => {
      for (let i = 0; i < 24 && !dashboardSteht(); i++) await pause(500);
      await pause(1200);
      await automatisch();
    };
    let gestartet = false;
    const los = () => { if (gestartet) return; gestartet = true; ctx.zeit(() => { warten().catch((e) => console.error("Einrichtung: Start", e)); }, 800); };
    // metadataCache.initialized: Cache eingelesen (Obsidian 1.14); sonst auf „resolved“ warten, spätestens nach 15 s
    if (app.metadataCache.initialized || app.metadataCache.resolved) los();
    else { const r = ctx.an(app.metadataCache, "resolved", () => { app.metadataCache.offref(r); los(); }); ctx.zeit(los, 15000); }
  };

  const AKTIONEN = {
    einrichtung: {
      titel: "Einrichtung starten",
      ausfuehren: async (c) => { oeffnen({ ab: c.parameter && c.parameter.ab }); },
    },
  };

  return { registrieren, start, aktionen: AKTIONEN, abmelden() { if (fenster) fenster.close(); } };
};
