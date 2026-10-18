// Fenster „Neu …“ (Bedien-Baustein, seit 0.4.6, Konsistenz-Audit Schritt 4): EIN Formular für alle Anlege-Aktionen (Vorlesung,
// Übungsblatt, Termin, Lehrveranstaltung, SQ-Kurs, Modul, Kartenstapel, Unterlage einordnen). Statt einer Kette aus Fragen ein
// Fenster mit allen Feldern und ihren Vorgaben; Esc, × und „Abbrechen“ legen nichts an. Gestalt wie die übrigen Fenster
// (eba-modal, eba-form; eba-core.css Abschnitte 43 und 64). Doku: docs/architektur.md, „Bedien-Bausteine“.
//   ctx.formular({ titel, text?, knopf = "Anlegen", felder, pruefen? }) → Promise<werte | null>
//   Feld: { name, titel, art, vorgabe?, optionen?, hilfe?, platzhalter?, pflicht?, fehlt?, wenn?, ct?, ganz?, min?, max?, muster?, falsch? }
//     art      "text" | "zahl" | "datum" | "zeitraum" | "uhrzeit" | "auswahl"
//     vorgabe  Text (Eingabefeld) bzw. Wert einer Option (Auswahl), oder Funktion (werte) → …: Sie folgt den anderen Feldern, bis du
//              das Feld selbst änderst (Ende = Beginn + 90 Min., ECTS je Anbieter).
//     optionen [{ wert, text, gruppe? }] (Auswahl; gruppe = Überschrift in der Liste, z. B. „Dieses Semester“)
//     hilfe    ein kurzer Satz unter dem Feld, auch als Funktion (werte) → Text
//     wenn     (werte) → bool: Feld nur zeigen, wenn …; ein verstecktes Feld liefert null
//     pflicht  leer geht nicht (fehlt = Satz dazu); ct: Uhrzeit „14“ = 14:15; ganz: nur ganze Zahlen; min, max: Grenzen;
//              muster: RegExp für Text (falsch = Satz dazu)
//   pruefen   (werte) → { feld, fehler } | null: Prüfung über mehrere Felder (z. B. Name schon vergeben)
// Ergebnis: { name: Wert }: Text getrimmt, Zahl als Number (leer: null), Datum „JJJJ-MM-TT“ (leer: ""), Zeitraum { von, bis },
// Uhrzeit „HH:MM“ (leer: ""), Auswahl der Wert der Option; null = abgebrochen.
// Tastatur (iPhone, iPad): Ist das erste Feld ein leeres Eingabefeld, liegt der Cursor darin; beginnt das Fenster mit einer
// Auswahl, springt keine Tastatur auf. Ein Feld mit Fokus rollt über die Tastatur in den sichtbaren Teil. Enter legt an; ein Fehler
// steht unter seinem Feld.
// Tests ohne Fenster (wie Eingabe und Auswahl im Kern): plugin.testAntworten, null = Esc, ein Objekt = Eingaben je Feld (fehlt
// eines, gilt die Vorgabe; Auswahl als Wert, als Teil des Texts der Option oder { index }). Geht eine Prüfung schief: null und ein
// Eintrag { formular, fehler } in plugin.testProtokoll.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const pad = (n) => String(n).padStart(2, "0");
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const UHR = /^(\d{1,2})(?:\s*[:.,]\s*(\d{2}))?\s*(?:uhr|h)?$/i;
const EINGABE = ["text", "zahl", "datum", "zeitraum", "uhrzeit"];

// „10:15“, „10.15“, „10,15“, „14 Uhr“ → „HH:MM“; nur die Stunde: volle Stunde, mit ct „14“ = 14:15 (c.t.). Sonst null.
const uhrLesen = (s, ct) => {
  const m = String(s == null ? "" : s).trim().match(UHR);
  if (!m) return null;
  const h = Number(m[1]), mi = m[2] == null ? (ct ? 15 : 0) : Number(m[2]);
  return h <= 23 && mi <= 59 ? `${pad(h)}:${pad(mi)}` : null;
};
// „6“, „7,5“, „7.5“ → Zahl, sonst null
const zahlLesen = (s) => { const t = String(s == null ? "" : s).trim().replace(",", "."); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
// Minuten zu einer Uhrzeit dazurechnen („10:15“ + 90 → „11:45“), höchstens 23:59
const uhrPlus = (u, min) => {
  const m = String(u || "").match(/^(\d{2}):(\d{2})$/);
  if (!m) return "";
  const n = Math.min(23 * 60 + 59, Number(m[1]) * 60 + Number(m[2]) + Number(min || 0));
  return `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
};

const istFunktion = (x) => typeof x === "function";
const optionen = (f) => (Array.isArray(f.optionen) ? f.optionen : []);
// Index einer Option zu einem Wert, Text oder { index } (−1: keine)
const optionIndex = (f, a) => {
  const o = optionen(f);
  if (a && typeof a === "object" && typeof a.index === "number") return a.index >= 0 && a.index < o.length ? a.index : -1;
  let i = o.findIndex((x) => x.wert === a);
  if (i < 0 && typeof a === "string" && a) i = o.findIndex((x) => String(x.text).indexOf(a) >= 0);
  return i;
};
// Vorgabe eines Felds bei den Werten so weit → Rohwert (Text für Eingabefelder, Index für Auswahl)
const vorgabeRoh = (f, werte) => {
  const v = istFunktion(f.vorgabe) ? f.vorgabe(werte || {}) : f.vorgabe;
  if (f.art === "auswahl") { const i = optionIndex(f, v); return i >= 0 ? i : (f.pflicht && optionen(f).length ? 0 : -1); }
  return v == null ? "" : String(v);
};
const sichtbar = (f, werte) => !istFunktion(f.wenn) || !!f.wenn(werte || {});

// Ein Feld lesen: Rohwert → { wert } oder { fehler }. hilfen: { datum(text) → ISO | "", zeitraum(text) → { von, bis } | null }
const lesen = (f, roh, hilfen) => {
  const h = hilfen || {};
  if (f.art === "auswahl") {
    const i = typeof roh === "number" ? roh : Number(roh);
    const o = optionen(f)[i];
    if (!o) return f.pflicht ? { fehler: f.fehlt || "Bitte wählen." } : { wert: null };
    return { wert: o.wert };
  }
  const t = String(roh == null ? "" : roh).trim();
  if (!t) {
    if (f.pflicht) return { fehler: f.fehlt || "Bitte ausfüllen." };
    return { wert: f.art === "zahl" ? null : f.art === "zeitraum" ? { von: "", bis: "" } : "" };
  }
  if (f.art === "zahl") {
    const n = zahlLesen(t);
    const grenzen = f.min != null && f.max != null ? ` von ${String(f.min).replace(".", ",")} bis ${String(f.max).replace(".", ",")}` : "";
    if (n == null || (f.ganz && !Number.isInteger(n))) return { fehler: f.falsch || (f.ganz ? `Bitte eine ganze Zahl${grenzen}.` : `Bitte eine Zahl${grenzen}, z. B. 6 oder 7,5.`) };
    if ((f.min != null && n < f.min) || (f.max != null && n > f.max)) return { fehler: f.falsch || `Bitte eine Zahl${grenzen}.` };
    return { wert: n };
  }
  if (f.art === "datum") {
    const d = istFunktion(h.datum) ? h.datum(t) : ISO.test(t) ? t : "";
    return d ? { wert: d } : { fehler: f.falsch || "Datum nicht erkannt, z. B. 27.10. oder +7." };
  }
  if (f.art === "zeitraum") {
    const z = istFunktion(h.zeitraum) ? h.zeitraum(t) : ISO.test(t) ? { von: t, bis: "" } : null;
    return z && z.von ? { wert: z } : { fehler: f.falsch || "Datum nicht erkannt, z. B. 12.11. oder 12.11.–15.11." };
  }
  if (f.art === "uhrzeit") {
    const u = uhrLesen(t, f.ct);
    return u ? { wert: u } : { fehler: f.falsch || "Uhrzeit nicht erkannt, z. B. 10:15." };
  }
  if (f.muster && !f.muster.test(t)) return { fehler: f.falsch || "Bitte prüfen." };
  return { wert: t };
};

// Alle Felder der Reihe nach: Rohwerte (fehlt einer, gilt die Vorgabe bei den Werten davor) → { roh, werte, fehler, sicht }.
// Versteckte Felder liefern null und werden nicht geprüft; streng = Fehler sammeln (sonst nur Werte, z. B. für Vorgaben).
const auswerten = (def, eingaben, hilfen, streng) => {
  const roh = {}, werte = {}, fehler = {}, sicht = {};
  const hat = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  for (const f of def.felder || []) {
    sicht[f.name] = sichtbar(f, werte);
    roh[f.name] = hat(eingaben, f.name) ? eingaben[f.name] : vorgabeRoh(f, werte);
    if (!sicht[f.name]) { werte[f.name] = null; continue; }
    const r = lesen(f, roh[f.name], hilfen);
    if (r.fehler) { werte[f.name] = f.art === "auswahl" ? null : undefined; if (streng) fehler[f.name] = r.fehler; }
    else werte[f.name] = r.wert;
  }
  if (streng && !Object.keys(fehler).length && istFunktion(def.pruefen)) {
    const p = def.pruefen(werte);
    if (p && p.feld) fehler[p.feld] = p.fehler || "Bitte prüfen.";
  }
  return { roh, werte, fehler, sicht };
};

// Antwort aus plugin.testAntworten → Rohwerte je Feld (Auswahl: Wert, Text oder { index } → Index)
const testEingaben = (def, antwort) => {
  const aus = {};
  for (const f of def.felder || []) {
    if (!Object.prototype.hasOwnProperty.call(antwort || {}, f.name)) continue;
    aus[f.name] = f.art === "auswahl" ? optionIndex(f, antwort[f.name]) : antwort[f.name];
  }
  return aus;
};

module.exports = function (ctx) {
  const obs = ctx.obsidian || {};
  const Modal = obs.Modal;
  const Platform = obs.Platform || {};
  const app = ctx.app;
  // Datum und Zeitraum lesen wie überall (eba.datumLesen: „27.10.“, „+7“, Jahr nach dem Fachmodell)
  const hilfenVon = () => {
    let e = null;
    try { e = ctx.user && istFunktion(ctx.user.eba) ? ctx.user.eba(ctx) : null; } catch (x) { e = null; }
    return {
      datum: (t) => (e && e.datumLesen ? e.datumLesen(t) : ISO.test(t) ? t : ""),
      zeitraum: (t) => (e && e.zeitraumLesen ? e.zeitraumLesen(t) : ISO.test(t) ? { von: t, bis: "" } : null),
    };
  };
  // Zeile unter einem Datum, Zeitraum oder einer Uhrzeit: was erkannt wurde („Mo 26.10. · in 7 Tagen“)
  const Z = () => (ctx.modell && ctx.modell.zeit ? ctx.modell.zeit : null);
  const erkannt = (f, wert) => {
    const z = Z();
    if (!z || wert == null || wert === "") return "";
    if (f.art === "datum") return `${z.datum(wert)} · ${z.abstand(wert)}`;
    if (f.art === "zeitraum") return wert.von ? (wert.bis ? z.spanne(wert.von, wert.bis) : `${z.datum(wert.von)} · ${z.abstand(wert.von)}`) : "";
    return "";
  };

  let fenster = null; // offenes Fenster (Tests in Obsidian: ctx.formular.fenster)
  class Fenster extends (Modal || class {}) {
    constructor(def, fertig) { super(app); this.def = def; this.fertig = fertig; this.erledigt = false; }
    onOpen() {
      fenster = this;
      const def = this.def, felder = def.felder || [], hilfen = hilfenVon();
      this.modalEl.addClass("eba-modal", "eba-modal-neu");
      this.titleEl.setText(def.titel || "");
      const c = this.contentEl;
      if (def.text) c.createEl("p", { cls: "eba-modal-text", text: def.text });
      const form = c.createDiv({ cls: "eba-form" });
      const els = {}, beruehrt = {};
      const start = auswerten(def, {}, hilfen, false);
      felder.forEach((f, n) => {
        const id = `eba-neu-${n}-${String(f.name).replace(/[^a-z0-9-]/gi, "")}`;
        const z = form.createDiv({ cls: "eba-form-zeile", attr: { "data-feld": f.name } });
        z.createEl("label", { cls: "eba-form-label", text: f.titel || f.name, attr: { for: id } });
        const box = z.createDiv({ cls: "eba-form-feld" });
        let el;
        if (f.art === "auswahl") {
          el = box.createEl("select", { cls: "dropdown eba-form-auswahl", attr: { id } });
          if (!f.pflicht && !optionen(f).some((o) => o.wert === null)) el.createEl("option", { value: "-1", text: "–" });
          let gruppe = null, ziel = el;
          optionen(f).forEach((o, i) => {
            if ((o.gruppe || "") !== (gruppe || "")) { gruppe = o.gruppe || ""; ziel = gruppe ? el.createEl("optgroup", { attr: { label: gruppe } }) : el; }
            ziel.createEl("option", { value: String(i), text: String(o.text) });
          });
          el.value = String(start.roh[f.name]);
        } else {
          const kurz = ["zahl", "datum", "uhrzeit"].indexOf(f.art) >= 0;
          el = box.createEl("input", { type: "text", cls: "eba-modal-feld" + (kurz ? " eba-form-kurz" : ""),
            attr: { id, autocomplete: "off", autocapitalize: f.art === "text" ? "sentences" : "off", spellcheck: f.art === "text" ? "true" : "false",
              enterkeyhint: "done", inputmode: f.art === "zahl" ? "decimal" : "text", placeholder: f.platzhalter || "" } });
          el.value = String(start.roh[f.name]);
        }
        const hilfe = z.createDiv({ cls: "eba-form-hilfe" });
        els[f.name] = { f, z, el, hilfe };
        el.addEventListener(f.art === "auswahl" ? "change" : "input", () => { beruehrt[f.name] = true; aktualisieren(f.name); });
        if (f.art !== "auswahl") el.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); senden(); } });
      });
      // Rohwerte aus dem Fenster; Felder, die du nicht angefasst hast und deren Vorgabe von anderen abhängt, folgen ihnen
      const rohJetzt = () => {
        const r = {};
        for (const f of felder) if (beruehrt[f.name] || !istFunktion(f.vorgabe)) r[f.name] = f.art === "auswahl" ? Number(els[f.name].el.value) : els[f.name].el.value;
        return r;
      };
      const fehlerZeigen = (name, text) => {
        const x = els[name];
        x.el.toggleClass("eba-feld-fehler", !!text);
        x.hilfe.toggleClass("fehler", !!text);
        if (text) { x.hilfe.setText(text); x.hilfe.toggle(true); }
      };
      const aktualisieren = (geaendert) => {
        const a = auswerten(def, rohJetzt(), hilfen, false);
        for (const f of felder) {
          const x = els[f.name];
          x.z.toggle(!!a.sicht[f.name]);
          if (!beruehrt[f.name] && istFunktion(f.vorgabe)) {
            const v = String(a.roh[f.name]);
            if (x.el.value !== v) x.el.value = v;
          }
          if (f.name === geaendert) fehlerZeigen(f.name, "");
          if (x.hilfe.hasClass("fehler")) continue;
          const text = istFunktion(f.hilfe) ? f.hilfe(a.werte) : f.hilfe;
          x.hilfe.setText(erkannt(f, a.werte[f.name]) || text || "");
          x.hilfe.toggle(!!x.hilfe.textContent);
        }
      };
      const k = c.createDiv({ cls: "modal-button-container" });
      const knopf = k.createEl("button", { text: def.knopf || "Anlegen", cls: "mod-cta", attr: { type: "button" } });
      k.createEl("button", { text: "Abbrechen", attr: { type: "button" } }).addEventListener("click", () => this.close());
      const senden = () => {
        if (this.erledigt) return;
        const a = auswerten(def, rohJetzt(), hilfen, true);
        const namen = Object.keys(a.fehler);
        for (const f of felder) fehlerZeigen(f.name, a.fehler[f.name] || "");
        if (namen.length) {
          aktualisieren(null);
          const erstes = els[namen[0]];
          if (erstes.f.art !== "auswahl") erstes.el.focus();
          return;
        }
        this.erledigt = true;
        this.werte = a.werte;
        this.close();
        this.fertig(a.werte);
      };
      this.senden = senden; this.felder = els;
      knopf.addEventListener("click", senden);
      aktualisieren(null);
      // Tastatur: Feld mit Fokus über der Tastatur halten (iPhone, iPad); Cursor ins erste Feld, wenn es ein leeres Eingabefeld ist
      if (Platform.isMobile) form.addEventListener("focusin", (e) => {
        const t = e.target;
        setTimeout(() => { try { if (t.isConnected) t.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (x) { /* egal */ } }, 350);
      });
      const erstes = felder.find((f) => sichtbar(f, start.werte));
      if (erstes && EINGABE.indexOf(erstes.art) >= 0 && !els[erstes.name].el.value) setTimeout(() => els[erstes.name].el.focus(), 30);
    }
    onClose() {
      this.contentEl.empty();
      if (fenster === this) fenster = null;
      if (!this.erledigt) { this.erledigt = true; this.fertig(null); }
    }
  }

  const formular = (def) => {
    const p = ctx.plugin || {};
    if (Array.isArray(p.testAntworten) && p.testAntworten.length) {
      const a = p.testAntworten.shift();
      const prot = Array.isArray(p.testProtokoll) ? p.testProtokoll : null;
      if (a == null) { if (prot) prot.push({ formular: def.titel, antwort: null }); return Promise.resolve(null); }
      const r = auswerten(def, testEingaben(def, a), hilfenVon(), true);
      const fehler = Object.keys(r.fehler).length ? r.fehler : null;
      if (prot) prot.push(fehler ? { formular: def.titel, antwort: a, fehler } : { formular: def.titel, antwort: a });
      return Promise.resolve(fehler ? null : r.werte);
    }
    if (!Modal) return Promise.resolve(null);
    return new Promise((fertig) => new Fenster(def, fertig).open());
  };
  Object.defineProperty(formular, "fenster", { get: () => fenster });

  // Für alle Skripte (docs/architektur.md, „Bedien-Bausteine“): beim Laden gesetzt, wie ctx.hinweis
  ctx.formular = formular;
  return {
    formular, lesen, auswerten, testEingaben, uhrLesen, zahlLesen, uhrPlus, optionIndex, vorgabeRoh,
    // Erweiterung, damit der Kern diese Datei beim Start aufruft und ctx.formular setzt; anzumelden gibt es nichts
    registrieren() {},
  };
};
module.exports.uhrLesen = uhrLesen;
module.exports.uhrPlus = uhrPlus;
module.exports.zahlLesen = zahlLesen;
