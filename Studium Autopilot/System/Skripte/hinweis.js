// Hinweise (seit 0.4.6): DER Weg zu Obsidians Hinweis (Notice) für alle Skripte, ctx.hinweis(text, { aktion, dauer }).
// Regeln (docs/design.md, „Sprache“, Abschnitt „Hinweise“): ein Satz mit Punkt, danach höchstens ein Satz mit dem nächsten
// Schritt, oder der Schritt als Knopf; ohne „Studium Autopilot:“ oder einen anderen Vorsatz, ohne Dateipfade, ohne Fehlertext
// aus dem Code (e.message), keine Liste in Zeilen. tests/wortliste.test.js prüft jeden Aufruf in den Skripten.
//   text    der Hinweis (oder ein fertiges DocumentFragment, z. B. Fortschritt mit Balken und Knopf „Stoppen“)
//   aktion  nächster Schritt als Knopf: { text, aktion, parameter } (eine Aktion des Plugins, wie ein Knopf in einer Notiz) oder
//           { text, ausfuehren() }; auch eine Liste mit höchstens zwei, der erste ist der Hauptknopf. Antippen schließt den Hinweis.
//   dauer   ms; 0 = bleibt, bis der Aufrufer hide() ruft (Fortschritt, setMessage ändert den Text). Vorgabe: 5 s, mit Knopf 10 s,
//           bei langem Text eine Sekunde je 60 Zeichen mehr, höchstens 15 s
// → die Notice (setMessage, hide) oder null, wenn es keine gibt (Tests ohne Obsidian)
// Knopf-Gestalt wie der Update-Hinweis (eba-core.css, „Neuigkeiten“: .eba-toast). iOS-sicher: keine Node-APIs, kein Lookbehind.
const DAUER = 5000, DAUER_KNOPF = 10000, DAUER_MAX = 15000;

// Anzeigedauer aus Text und Knopf (dauer gesetzt → genau diese)
const dauerVon = (text, o) => {
  if (o && typeof o.dauer === "number" && o.dauer >= 0) return o.dauer;
  const basis = o && o.aktion ? DAUER_KNOPF : DAUER;
  const extra = Math.max(0, Math.ceil((String(text).length - 80) / 60)) * 1000;
  return Math.min(DAUER_MAX, basis + extra);
};

// aktion → Liste der Knöpfe [{ text, tun }] (höchstens zwei, ohne Text keiner)
const knoepfeVon = (aktion, ausfuehren) => [].concat(aktion || []).filter((a) => a && a.text).slice(0, 2).map((a) => ({
  text: String(a.text),
  tun: typeof a.ausfuehren === "function" ? a.ausfuehren : () => ausfuehren(a.aktion, a.parameter || {}),
}));

module.exports = function (ctx) {
  const obs = ctx.obsidian || {};
  const ausfuehren = (name, parameter) => (name && typeof ctx.aktion === "function" ? ctx.aktion(name, parameter) : undefined);

  const hinweis = (text, o) => {
    const Notice = obs.Notice;
    if (!Notice) return null;
    // fertiger Inhalt (Fortschritt mit eigenem Knopf, ilias.js): so, wie er ist
    if (text && typeof text === "object" && text.nodeType === 11) return new Notice(text, dauerVon("", o));
    const satz = String(text == null ? "" : text);
    const dauer = dauerVon(satz, o);
    const knoepfe = knoepfeVon(o && o.aktion, ausfuehren);
    if (!knoepfe.length || typeof document === "undefined") return new Notice(satz, dauer);
    const f = document.createDocumentFragment();
    const box = f.createDiv({ cls: "eba-toast" });
    box.createDiv({ cls: "eba-toast-text", text: satz });
    const reihe = box.createDiv({ cls: "eba-toast-knoepfe" });
    let n = null;
    knoepfe.forEach((k, i) => {
      reihe.createEl("button", { text: k.text, cls: "eba-toast-knopf" + (i === 0 ? " mod-cta" : ""), attr: { type: "button" } })
        .addEventListener("click", () => {
          try { if (n) n.hide(); } catch (e) { /* schon weg */ }
          Promise.resolve().then(k.tun).catch((e) => console.error("Hinweis: " + k.text, e));
        });
    });
    n = new Notice(f, dauer);
    return n;
  };

  // Für alle Skripte (docs/architektur.md, „Kontextobjekt ctx“): beim Laden gesetzt, vor jedem Knopf und jeder Aktion
  ctx.hinweis = hinweis;
  return {
    hinweis, dauerVon, knoepfeVon,
    // Erweiterung, damit der Kern diese Datei beim Start aufruft und ctx.hinweis setzt; anzumelden gibt es nichts
    registrieren() {},
  };
};
