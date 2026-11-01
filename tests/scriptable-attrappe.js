// Nachbau der Teile von Scriptable (https://docs.scriptable.app), die der Zeichner der Widgets (widget.js, scriptable) benutzt.
// Streng: Eine Methode, die es in Scriptable nicht gibt, fehlt auch hier (TypeError), ein unbekanntes Feld wirft beim Setzen.
// Dazu html(): zeichnet ein Widget ungefähr so, wie Scriptable es anordnet, als HTML zum Ansehen (Stapel = Flexbox).
"use strict";

const streng = (obj, felder) => new Proxy(obj, {
  set(o, k, v) {
    if (felder.indexOf(k) < 0) throw new Error("Scriptable kennt das Feld " + String(k) + " nicht");
    o[k] = v;
    return true;
  },
});

class Size { constructor(width, height) { this.width = width; this.height = height; } }
class Color {
  constructor(hex, alpha) {
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) throw new Error("Farbe " + hex);
    this.hell = hex.replace(/^#?/, "#"); this.dunkel = this.hell; this.alpha = alpha == null ? 1 : alpha;
  }
  static dynamic(hell, dunkel) { const c = new Color(hell.hell); c.dunkel = dunkel.dunkel; return c; }
}
class Font {
  constructor(name, size) { this.name = name; this.size = size; this.gewicht = /Bold/.test(name) ? 700 : 400; }
}
const SCHNITTE = { systemFont: 400, mediumSystemFont: 500, semiboldSystemFont: 600, boldSystemFont: 700,
  regularRoundedSystemFont: 400, mediumRoundedSystemFont: 500, semiboldRoundedSystemFont: 600, boldRoundedSystemFont: 700 };
Object.keys(SCHNITTE).forEach((n) => { Font[n] = (size) => Object.assign(new Font(n, size), { gewicht: SCHNITTE[n] }); });

const TEXT = ["font", "textColor", "lineLimit", "minimumScaleFactor", "textOpacity", "url", "shadowColor", "shadowRadius", "shadowOffset"];
const BILD = ["imageSize", "tintColor", "cornerRadius", "url", "imageOpacity"];
const STAPEL = ["backgroundColor", "backgroundImage", "backgroundGradient", "spacing", "size", "cornerRadius", "borderWidth", "borderColor", "url"];
const LISTE = ["backgroundColor", "backgroundImage", "backgroundGradient", "spacing", "url", "refreshAfterDate", "addAccessoryWidgetBackground"];

const textVon = (s) => {
  const t = { art: "text", s, ausrichtung: "links" };
  t.leftAlignText = () => { t.ausrichtung = "links"; };
  t.centerAlignText = () => { t.ausrichtung = "mitte"; };
  t.rightAlignText = () => { t.ausrichtung = "rechts"; };
  return streng(t, TEXT);
};
// Gemeinsam für ListWidget und WidgetStack
const behaelter = (art) => {
  const b = { art, kinder: [], richtung: art === "liste" ? "senkrecht" : "waagerecht", ausrichtung: "oben", rand: null };
  b.addText = (s) => { if (typeof s !== "string") throw new Error("addText braucht Text"); const t = textVon(s); b.kinder.push(t); return t; };
  b.addSpacer = (n) => { if (n != null && !(n >= 0)) throw new Error("Spacer " + n); b.kinder.push({ art: "luecke", n: n == null ? null : n }); };
  b.addStack = () => { const s = stapel(); b.kinder.push(s); return s; };
  b.addImage = (bild) => { if (!bild || !bild.symbol) throw new Error("addImage braucht ein Bild"); const i = streng({ art: "bild", symbol: bild.symbol }, BILD); b.kinder.push(i); return i; };
  b.addDate = () => { throw new Error("addDate nutzt der Zeichner nicht"); };
  // gezeigt: welche Vorschau die App öffnete (presentSmall …), in der Reihenfolge
  if (art === "liste") { b.gezeigt = []; ["presentSmall", "presentMedium", "presentLarge", "presentExtraLarge"].forEach((n) => { b[n] = async () => { b.gezeigt.push(n); }; }); }
  b.setPadding = (o, l, u, r) => { [o, l, u, r].forEach((x) => { if (typeof x !== "number") throw new Error("setPadding braucht vier Zahlen"); }); b.rand = [o, l, u, r]; };
  return b;
};
const stapel = () => {
  const s = behaelter("stapel");
  s.layoutHorizontally = () => { s.richtung = "waagerecht"; };
  s.layoutVertically = () => { s.richtung = "senkrecht"; };
  s.topAlignContent = () => { s.ausrichtung = "oben"; };
  s.centerAlignContent = () => { s.ausrichtung = "mitte"; };
  s.bottomAlignContent = () => { s.ausrichtung = "unten"; };
  s.useDefaultPadding = () => {};
  return streng(s, STAPEL);
};
class ListWidget {
  constructor() { return streng(behaelter("liste"), LISTE); }
}
const SFSymbol = { named: (name) => ({ image: { symbol: name } }) };

// Dateien: { Pfad: Text } (Ordner ergeben sich aus den Pfaden); Lesezeichen: { Name: Pfad }; dokumente: Ordner der Skripte
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const dateien = (inhalt, lesezeichen = {}, dokumente = "/Skripte") => ({
  joinPath: (a, b) => a.replace(/\/$/, "") + "/" + b,
  fileExists: (p) => hat(inhalt, p),
  isDirectory: (p) => Object.keys(inhalt).some((k) => k.indexOf(p.replace(/\/$/, "") + "/") === 0),
  listContents: (p) => Object.keys(inhalt).filter((k) => k.indexOf(p + "/") === 0).map((k) => k.slice(p.length + 1).split("/")[0])
    .filter((n, i, a) => a.indexOf(n) === i),
  readString: (p) => { if (!hat(inhalt, p)) throw new Error("fehlt: " + p); return inhalt[p]; },
  writeString: (p, t) => { if (typeof t !== "string") throw new Error("writeString braucht Text"); inhalt[p] = t; },
  remove: (p) => { if (!hat(inhalt, p)) throw new Error("fehlt: " + p); delete inhalt[p]; },
  documentsDirectory: () => dokumente,
  libraryDirectory: () => "/Bibliothek",
  createDirectory: (p, zwischen) => { if (typeof p !== "string" || typeof zwischen !== "boolean") throw new Error("createDirectory(Pfad, bool)"); },
  isFileStoredIniCloud: () => false,
  isFileDownloaded: () => true,
  downloadFileFromiCloud: async () => {},
  bookmarkExists: (n) => hat(lesezeichen, n),
  bookmarkedPath: (n) => { if (!hat(lesezeichen, n)) throw new Error("kein Lesezeichen " + n); return lesezeichen[n]; },
  allFileBookmarks: () => Object.keys(lesezeichen).map((name) => ({ name, source: "host" })),
});
// Alert: antworten = Index je present() der Reihe nach (-1 = Abbrechen); gezeigt sammelt { title, message, actions }
const alerts = (antworten = [], gezeigt = []) => class Alert {
  constructor() { this.title = ""; this.message = ""; this.actions = []; }
  addAction(t) { this.actions.push(t); }
  addCancelAction(t) { this.abbrechen = t; }
  async present() { gezeigt.push({ title: this.title, message: this.message, actions: this.actions.slice() }); return antworten.length ? antworten.shift() : -1; }
};
const geraet = (pad = false, breite = 393, hoehe = 852) => ({ isPad: () => pad, screenSize: () => new Size(breite, hoehe) });

// ---------- HTML ----------
// Wie SwiftUI auf dem Gerät (gemessen an einem Foto vom iPad, 29.10.2026): Eine Lücke ohne Länge ist mindestens 8 pt lang;
// was nicht in einen Stapel fester Größe passt, ragt oben und unten gleich weit hinaus; ein Stapel fester Größe mit weniger
// Inhalt und ohne Lücke zeigt ihn mittig; das Widget selbst stellt seinen Inhalt waagerecht in die Mitte, untereinander bündig
// links (wie VStack(alignment: .leading)).
const LUECKE_MIN = 8;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const farbe = (c, dunkel) => (c ? (dunkel ? c.dunkel : c.hell) : "");
// Ein Stapel mit Lücke ohne Länge füllt seine Richtung, und mit ihm jeder Stapel darum (wie in SwiftUI)
const fuellt = (x, richtung) => x.art === "stapel" && !(x.size && (richtung === "waagerecht" ? x.size.width : x.size.height))
  && x.kinder.some((y) => (y.art === "luecke" && y.n == null && x.richtung === richtung) || fuellt(y, richtung));
const html = (w, groesse, dunkel) => {
  const knoten = (k, eltern) => {
    if (k.art === "text") {
      const f = k.font || Font.systemFont(17);
      const serif = /Iowan/.test(f.name), rund = /Rounded/.test(f.name);
      const st = [`font-size:${f.size}px`, `font-weight:${f.gewicht}`, `color:${farbe(k.textColor, dunkel) || "#000"}`, "line-height:1.2", "overflow:hidden", "flex:none",
        `font-family:${serif ? "'Iowan Old Style',Palatino,Georgia,serif" : rund ? "ui-rounded,system-ui,sans-serif" : "-apple-system,system-ui,sans-serif"}`,
        k.lineLimit === 1 ? "white-space:nowrap;text-overflow:ellipsis" : `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${k.lineLimit || 99};word-break:break-word`,
        "max-width:100%", `text-align:${k.ausrichtung === "mitte" ? "center" : "left"}`];
      // minimumScaleFactor: VERKLEINERN (unten) macht die Schrift kleiner, bis der Text passt
      return `<div style="${st.join(";")}"${k.minimumScaleFactor < 1 ? ` data-min="${k.minimumScaleFactor}"` : ""}>${esc(k.s)}</div>`;
    }
    const laenge = eltern === "waagerecht" ? "width" : "height";
    if (k.art === "luecke") return k.n == null ? `<div style="flex:1 1 0;min-${laenge}:${LUECKE_MIN}px"></div>` : `<div style="flex:none;${laenge}:${k.n}px"></div>`;
    if (k.art === "bild") {
      const g = k.imageSize ? k.imageSize.width : 12;
      return `<div title="${esc(k.symbol)}" style="flex:none;width:${g}px;height:${g}px;border:1.5px solid ${farbe(k.tintColor, dunkel) || "#888"};border-radius:2px;box-sizing:border-box"></div>`;
    }
    const st = ["display:flex", `flex-direction:${k.richtung === "senkrecht" ? "column" : "row"}`, "box-sizing:border-box", "overflow:hidden", "min-width:0", "min-height:0",
      "justify-content:center"];
    const quer = { oben: "flex-start", mitte: "center", unten: "flex-end" }[k.ausrichtung];
    st.push(k.richtung === "senkrecht" ? (k.art === "liste" ? "align-items:center" : "align-items:flex-start") : `align-items:${quer}`);
    if (k.art === "liste") {
      st.push(`width:${groesse.w}px`, `height:${groesse.h}px`, "border-radius:22px");
      // Inhalt als ein Block (bündig links), der Block in der Mitte; mit Lücke ohne Länge (auch tiefer) füllt er Höhe bzw. Breite
      const hoch = k.kinder.some((y) => (y.art === "luecke" && y.n == null) || fuellt(y, "senkrecht"));
      const breit = k.kinder.some((y) => fuellt(y, "waagerecht"));
      const innen = `<div style="display:flex;flex-direction:column;align-items:flex-start;justify-content:center;max-width:100%;min-height:0;${hoch ? "flex:1 1 0" : "flex:none"}${breit ? ";align-self:stretch" : ""}">`
        + k.kinder.map((x) => knoten(x, "senkrecht")).join("") + "</div>";
      if (k.backgroundColor) st.push(`background:${farbe(k.backgroundColor, dunkel)}`);
      st.push(k.rand ? `padding:${k.rand.join("px ")}px` : "padding:16px");
      return `<div style="${st.join(";")}">${innen}</div>`;
    }
    if (k.size) {
      if (k.size.width) st.push(`width:${k.size.width}px`, "flex-shrink:0");
      if (k.size.height) st.push(`height:${k.size.height}px`, "flex-shrink:0");
    }
    if (k.backgroundColor) st.push(`background:${farbe(k.backgroundColor, dunkel)}`);
    if (k.cornerRadius) st.push(`border-radius:${k.cornerRadius}px`);
    if (k.borderWidth) st.push(`outline:${k.borderWidth}px solid ${farbe(k.borderColor, dunkel)};outline-offset:-${k.borderWidth}px`);
    if (k.spacing) st.push(`gap:${k.spacing}px`);
    if (k.rand) st.push(`padding:${k.rand.join("px ")}px`);
    if (k.art === "stapel") {
      const quer = eltern === "waagerecht" ? "senkrecht" : "waagerecht";
      if (fuellt(k, eltern)) st.push("flex:1 1 0");
      if (fuellt(k, quer)) st.push("align-self:stretch");
    }
    return `<div style="${st.join(";")}">${k.kinder.map((x) => knoten(x, k.richtung)).join("")}</div>`;
  };
  return knoten(w, "senkrecht") + VERKLEINERN;
};
// Läuft im Browser: Text mit data-min in Schritten von 0,25 px verkleinern, solange er nicht passt (höchstens bis zum Faktor)
const VERKLEINERN = "<script>document.querySelectorAll('[data-min]').forEach(function (e) { var g = parseFloat(e.style.fontSize), f = g, m = parseFloat(e.dataset.min);"
  + " while (f > g * m && (e.scrollWidth > e.clientWidth + 0.5 || e.scrollHeight > e.clientHeight + 0.5)) { f -= 0.25; e.style.fontSize = f + 'px'; }"
  + " e.removeAttribute('data-min'); });</script>";

module.exports = { Size, Color, Font, ListWidget, SFSymbol, dateien, alerts, geraet, html };
