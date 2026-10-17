// Teile der Seitenerkennung (Selektoren, Elementarten, Datumsformat, Sitzungsnamen) folgen PFERD
// (https://github.com/Garmelon/PFERD), MIT-Lizenz:
//   Copyright 2019-2024 Garmelon, I-Al-Istannen, danstooamerican, pavelzw,
//                       TheChristophe, Scriptim, thelukasprobst, Toorero,
//                       Mr-Pine, p-fruck, PinieP, Florian Raith
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
//   rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright
//   notice and this permission notice shall be included in all copies or substantial portions of the Software. THE
//   SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
//   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
//   OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// ILIAS-Seiten lesen (Uni Tübingen, ILIAS 10 „Ovidius“): reine Funktionen, die aus dem HTML einer ILIAS-Seite Kurse,
// Ordnerinhalte, Sitzungen, Übungen, Formulare und den Anmeldestatus herauslesen. Kein Netz, keine Zeitgeber, nichts
// passiert beim Laden. Das Holen der Seiten (Anmeldung, Cookies, Downloads) macht ilias-netz.js, das Ablegen der Dateien
// die Ablage. Dieses Skript ist eine Bibliothek, keine Erweiterung (startet nichts).
//
// Zugriff:  const H = ctx.user["ilias-html"](ctx);   (mit ctx: „heute“ für Heute/Gestern kommt aus ctx.date)
//           ctx.user["ilias-html"].inhalt(html, url)  (ohne Aufruf: „heute“ = Datum des Geräts)
//
// Lesen ohne DOMParser: Ein kleiner HTML-Zerleger (parsen) baut einen schlanken Baum { name, attrs, kinder, eltern }.
//   Grund: Obsidian (iOS-WebView, Electron) und die Node-Tests sollen GENAU denselben Code ausführen; mit DOMParser liefe
//   in Node nur ein Ersatz. Der Zerleger kennt, was ILIAS-Seiten brauchen: leere Elemente (img, input …), Rohtext (script,
//   style), Kommentare, Entitäten, „/>“, implizites Schließen von p, li, td, tr, option. Fehlerhaftes HTML führt nie zu einer
//   Ausnahme; unpassende End-Tags werden übergangen. Alle Funktionen nehmen HTML-Text ODER einen schon zerlegten Baum
//   (H.parsen(html)), damit eine Seite nur einmal zerlegt wird.
//
// Schnittstelle (Rückgaben siehe jeweilige Funktion):
//   parsen(html) → Baum                         alle/erstes/vorfahr/text/attr/hatKlasse – kleine Abfragehelfer für den Baum
//   angemeldet(html) → true/false               seitenArt(html, url) → „ilias“, „ilias-anmeldung“, „kein-zugriff“, „idp-anmeldung“ …
//   meldungen(html) → [{ art, text }]           permalink(html) → { url, typ, refId } | null
//   mitgliedschaften(html, url) → { kurse, gruppen }   kurse(html, url)   gruppen(html, url)
//   inhalt(html, url, { heute }) → [Eintrag]    folgeUrl(html, url) → URL, die statt dieser Seite zu holen ist, sonst ""
//   uebungen(html, url, { heute }) → [Aufgabe]  formulare(html, url) → [{ id, name, method, action, felder, knoepfe }]
//   dateiName(eintrag) → Dateiname              downloadUrl(eintrag, basis) → URL | ""
//   datum(text, heute) → "JJJJ-MM-TTTHH:MM" | "JJJJ-MM-TT" | ""   groesse(text) → Bytes | null   sitzung(titel, heute)
//
// Ablauf beim Abgleich (Beispiel): mitgliedschaften(Seite „Meine Kurse“) → je Kurs Kursseite holen → folgeUrl() leer? →
//   inhalt() → Einträge mit art „ordner“/„sitzung“ weiter holen, art „datei“ über downloadUrl() laden und mit dateiName()
//   benennen. Vor jedem Lesen: angemeldet() bzw. seitenArt() (abgelaufene Sitzung → Anmeldeseite, kein Zugriff →
//   Startseite mit Fehlermeldung).
//
// Gemessen an echten Seiten von Ovidius (ILIAS 10.12, Oktober 2026):
//   * Dateien verlinken direkt auf „ilias.php?…cmdClass=ilObjFileGUI&cmd=sendfile&ref_id=N“ (Antwort 200 mit
//     Content-Disposition); „goto.php/file/N/download“ leitet einmal (302) dorthin um.
//   * Sitzungen verlinken auf die Info-Seite (cmd=infoScreen); ihre Materialien stehen dort als normale Liste. Auf der
//     Kursseite sind Sitzungen eingeklappt („Materialien zur Sitzung: 3“); eine aufgeklappte Sitzung zeigt ihre Einträge
//     verschachtelt (Feld „inSitzung“, Aufbau nachgebaut, nicht erfasst).
//   * Eigenschaften einer Datei: Typ (erste Eigenschaft), Größe „1.11 MB“ (Punkt als Dezimalzeichen, 1000er-Schritte),
//     Änderungsdatum „12. Okt 2026, 09:31“, „Anzahl Seiten: 15“. Kennung: <li id="item_row_<block>-<ref>"> und
//     data-list-item-id="lg_div_<ref>_pref_<eltern>"; das Symbol einer Datei ist ein Vorschaubild (alt="Datei").
//   * „Interaktives Video“ ist ein Plugin (Typ xvid, ilObjPluginDispatchGUI&cmd=forward); es liefert keine Datei. Videos
//     im Seiteninhalt (figure.ilc_media_cont_MediaContainer) haben eine deliver.php-Adresse mit Token (typ „mob“).
//   * Objektgruppen erscheinen als Block mit data-store-url „…cont_block_id=itgr_<ref>“ (Feld „gruppe“).
//   * Kein Zugriff und nicht vorhandene Objekte: Umleitung auf die Startseite (goto.php/root/1) mit
//     „alert alert-danger“: „Sie haben keine Berechtigung, auf das Objekt zuzugreifen.“
//   * Abgelaufene Sitzung: 302 auf login.php?…cmd=force_login; die Anmeldeseite hat die Metaleiste mit login.php-Link.
//   * Übungen (exc): in den erfassten Kursen gab es im Oktober 2026 keine; uebungen() folgt PFERD und ILIAS-10-Markup, ist
//     aber noch nicht an echten Seiten geprüft.
//
// Herkunft: Selektoren und Regeln (Typerkennung, Datei = Titel + "." + erste Eigenschaft, Sitzungsnamen, Datumsformate,
//   Anmeldeprüfung, eingeklappte Sitzungen, Inhalt-Reiter, Gruppenblöcke) nach PFERD (https://github.com/Garmelon/PFERD,
//   crawl/ilias/kit_ilias_html.py, Version 3.9.4), MIT-Lizenz, Copyright (c) Garmelon und Mitwirkende. Neu geschrieben in
//   JavaScript und an Tübinger Seiten angepasst.
//
// Tests: tests/ilias-html.test.js mit erfundenen Seiten in tests/daten/ilias-seiten/ (gleicher Aufbau wie echte Seiten,
//   keine echten Namen). iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.

// ---------------------------------------------------------------------------------------------------------------- Zerleger
const LEER = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
const ROHTEXT = { script: 1, style: 1, textarea: 1, title: 1, xmp: 1 };
const SCHLIESST_P = { address: 1, article: 1, aside: 1, blockquote: 1, details: 1, div: 1, dl: 1, fieldset: 1, figcaption: 1, figure: 1,
  footer: 1, form: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, header: 1, hr: 1, main: 1, nav: 1, ol: 1, p: 1, pre: 1, section: 1,
  table: 1, ul: 1 };
const BLOCK = { address: 1, article: 1, aside: 1, blockquote: 1, br: 1, dd: 1, div: 1, dl: 1, dt: 1, fieldset: 1, figcaption: 1,
  figure: 1, footer: 1, form: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, header: 1, hr: 1, li: 1, main: 1, nav: 1, ol: 1, p: 1,
  pre: 1, section: 1, table: 1, tbody: 1, td: 1, th: 1, thead: 1, tr: 1, ul: 1 };
const OHNE_TEXT = { script: 1, style: 1, template: 1, noscript: 1 };
// Beim Öffnen von X werden offene Elemente aus SCHLIESST[X] geschlossen, solange keines aus GRENZE[X] dazwischen liegt
const SCHLIESST = { li: ["li"], dt: ["dt", "dd"], dd: ["dt", "dd"], tr: ["tr", "td", "th"], td: ["td", "th"], th: ["td", "th"],
  option: ["option"], optgroup: ["optgroup", "option"], tbody: ["tbody", "thead", "tfoot", "tr", "td", "th"],
  thead: ["tbody", "thead", "tfoot", "tr", "td", "th"], tfoot: ["tbody", "thead", "tfoot", "tr", "td", "th"] };
const GRENZE = { li: ["ul", "ol", "menu"], dt: ["dl"], dd: ["dl"], tr: ["table", "tbody", "thead", "tfoot"], td: ["tr", "table"],
  th: ["tr", "table"], option: ["select", "datalist"], optgroup: ["select"], tbody: ["table"], thead: ["table"], tfoot: ["table"] };

const ENTITAETEN = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", auml: "ä", ouml: "ö", uuml: "ü",
  Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", euro: "€", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", sbquo: "‚", copy: "©", reg: "®", trade: "™", shy: "\u00ad",
  middot: "·", bull: "•", times: "×", deg: "°", sect: "§", para: "¶", eacute: "é", egrave: "è", ecirc: "ê", aacute: "á",
  agrave: "à", acirc: "â", oacute: "ó", ograve: "ò", ocirc: "ô", uacute: "ú", ugrave: "ù", ucirc: "û", ccedil: "ç",
  ntilde: "ñ", Eacute: "É", iacute: "í", oslash: "ø", aring: "å", thinsp: "\u2009", ensp: "\u2002", emsp: "\u2003",
  zwnj: "\u200c", zwj: "\u200d", lrm: "\u200e", rlm: "\u200f", colon: ":", sol: "/", lpar: "(", rpar: ")", period: ".",
  comma: ",", excl: "!", quest: "?", num: "#", percnt: "%", plus: "+", equals: "=", lowbar: "_", hyphen: "-", dash: "‐" };

function entitaeten(s) {
  if (!s || s.indexOf("&") < 0) return s || "";
  return s.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g, (m, e) => {
    if (e.charAt(0) === "#") {
      const n = e.charAt(1) === "x" || e.charAt(1) === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!(n > 0) || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "�";
      return String.fromCodePoint(n);
    }
    return Object.prototype.hasOwnProperty.call(ENTITAETEN, e) ? ENTITAETEN[e] : m;
  });
}

const istLeerzeichen = (c) => c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f";

// Attribute ab Position i (nach dem Tag-Namen) bis „>“. Liefert { attrs, ende (Index nach „>“), selbst (/>) }.
function attributeLesen(html, i) {
  const attrs = {};
  const n = html.length;
  let selbst = false;
  while (i < n) {
    let c = html.charAt(i);
    if (istLeerzeichen(c)) { i++; continue; }
    if (c === ">") return { attrs, ende: i + 1, selbst };
    if (c === "/") { selbst = html.charAt(i + 1) === ">"; i++; continue; }
    selbst = false;
    const start = i;
    while (i < n) { c = html.charAt(i); if (istLeerzeichen(c) || c === "=" || c === ">" || (c === "/" && i > start)) break; i++; }
    if (i === start) i++; // ein einzelnes „=“ o. ä. ohne Namen überspringen
    const name = html.slice(start, i).toLowerCase();
    while (i < n && istLeerzeichen(html.charAt(i))) i++;
    let wert = "";
    if (html.charAt(i) === "=") {
      i++;
      while (i < n && istLeerzeichen(html.charAt(i))) i++;
      const q = html.charAt(i);
      if (q === '"' || q === "'") {
        const e = html.indexOf(q, i + 1);
        const bis = e < 0 ? n : e;
        wert = html.slice(i + 1, bis);
        i = bis + 1;
      } else {
        const s = i;
        while (i < n && !istLeerzeichen(html.charAt(i)) && html.charAt(i) !== ">") i++;
        wert = html.slice(s, i);
      }
    }
    if (name && !Object.prototype.hasOwnProperty.call(attrs, name)) attrs[name] = entitaeten(wert);
  }
  return { attrs, ende: n, selbst };
}

// HTML → Baum. Knoten: Element { name, attrs, kinder, eltern } oder Text { text } (Entitäten schon aufgelöst).
function parsen(html) {
  if (html && typeof html === "object" && html.name) return html; // schon zerlegt (Baum oder Element)
  html = String(html == null ? "" : html);
  const wurzel = { name: "#dokument", attrs: {}, kinder: [], eltern: null, istBaum: true };
  const stapel = [wurzel];
  const oben = () => stapel[stapel.length - 1];
  const textAnhaengen = (t) => {
    if (!t) return;
    const k = oben().kinder;
    // reine Leerzeichen nur als ein Zeichen merken (wichtig für Wortgrenzen, spart Speicher)
    const leer = !/[^ \t\n\r\f]/.test(t);
    k.push({ text: leer ? " " : entitaeten(t) });
  };
  const schliessenBis = (namen, grenzen) => {
    for (let j = stapel.length - 1; j > 0; j--) {
      const nm = stapel[j].name;
      if (grenzen && grenzen.indexOf(nm) >= 0) return;
      if (namen.indexOf(nm) >= 0) { stapel.length = j; return; }
    }
  };
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { textAnhaengen(html.slice(i)); break; }
    if (lt > i) textAnhaengen(html.slice(i, lt));
    i = lt;
    const c1 = html.charAt(i + 1);
    if (html.startsWith("<!--", i)) {
      const e = html.indexOf("-->", i + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (c1 === "!" || c1 === "?") {
      const e = html.indexOf(">", i + 2);
      i = e < 0 ? n : e + 1;
      continue;
    }
    if (c1 === "/") {
      const m = /^<\/([A-Za-z][^\s/>]*)[^>]*>?/.exec(html.slice(i, i + 200));
      if (!m) { textAnhaengen("<"); i++; continue; }
      const name = m[1].toLowerCase();
      // Ende-Tag ohne „>“ in Reichweite: bis zum nächsten „>“ springen
      const e = html.indexOf(">", i);
      i = e < 0 ? n : e + 1;
      for (let j = stapel.length - 1; j > 0; j--) {
        if (stapel[j].name === name) { stapel.length = j; break; }
      }
      continue;
    }
    const m = /^<([A-Za-z][^\s/>]*)/.exec(html.slice(i, i + 100));
    if (!m) { textAnhaengen("<"); i++; continue; }
    const name = m[1].toLowerCase();
    const a = attributeLesen(html, i + m[0].length);
    i = a.ende;
    if (SCHLIESST_P[name] && oben().name === "p") stapel.pop();
    if (SCHLIESST[name]) schliessenBis(SCHLIESST[name], GRENZE[name]);
    const el = { name, attrs: a.attrs, kinder: [], eltern: oben() };
    oben().kinder.push(el);
    if (LEER[name] || a.selbst) continue;
    if (ROHTEXT[name]) {
      const re = new RegExp("</" + name + "[\\s/>]", "ig");
      re.lastIndex = i;
      const e = re.exec(html);
      const bis = e ? e.index : n;
      const roh = html.slice(i, bis);
      if (roh) el.kinder.push({ text: name === "script" || name === "style" ? roh : entitaeten(roh) });
      const zu = e ? html.indexOf(">", bis) : -1;
      i = zu < 0 ? n : zu + 1;
      continue;
    }
    stapel.push(el);
  }
  return wurzel;
}

// ---------------------------------------------------------------------------------------------------------- Abfragehelfer
const istElement = (k) => !!(k && k.name);
const attr = (el, name) => (el && el.attrs && Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : "");
const hatKlasse = (el, k) => {
  const c = el && el.attrs && el.attrs.class;
  if (!c) return false;
  const teile = c.split(/\s+/);
  return teile.indexOf(k) >= 0;
};
// Alle Elemente unter wurzel (Tiefensuche, Dokumentreihenfolge), für die test(el) gilt
function alle(wurzel, test) {
  const aus = [];
  const w = istElement(wurzel) ? wurzel : parsen(wurzel);
  const stapel = [];
  for (let j = w.kinder.length - 1; j >= 0; j--) stapel.push(w.kinder[j]);
  while (stapel.length) {
    const k = stapel.pop();
    if (!istElement(k)) continue;
    if (!test || test(k)) aus.push(k);
    for (let j = k.kinder.length - 1; j >= 0; j--) stapel.push(k.kinder[j]);
  }
  return aus;
}
function erstes(wurzel, test) {
  const w = istElement(wurzel) ? wurzel : parsen(wurzel);
  const stapel = [];
  for (let j = w.kinder.length - 1; j >= 0; j--) stapel.push(w.kinder[j]);
  while (stapel.length) {
    const k = stapel.pop();
    if (!istElement(k)) continue;
    if (test(k)) return k;
    for (let j = k.kinder.length - 1; j >= 0; j--) stapel.push(k.kinder[j]);
  }
  return null;
}
function vorfahr(el, test) {
  let p = el ? el.eltern : null;
  while (p && p.name !== "#dokument") { if (test(p)) return p; p = p.eltern; }
  return null;
}
// Sichtbarer Text, Leerraum zusammengefasst (Blockelemente trennen Wörter)
function text(el) {
  if (!el) return "";
  if (!istElement(el)) return (el.text || "").replace(/\s+/g, " ").trim();
  const teile = [];
  const gehen = (k) => {
    if (!istElement(k)) { teile.push(k.text); return; }
    if (OHNE_TEXT[k.name]) return;
    const b = BLOCK[k.name];
    if (b) teile.push(" ");
    for (let j = 0; j < k.kinder.length; j++) gehen(k.kinder[j]);
    if (b) teile.push(" ");
  };
  gehen(el);
  return teile.join("").replace(/\s+/g, " ").trim();
}
const rohtext = (el) => (el ? el.kinder.map((k) => (istElement(k) ? rohtext(k) : k.text)).join("") : "");
const mitTag = (w, t) => alle(w, (e) => e.name === t);
const mitId = (w, id) => erstes(w, (e) => attr(e, "id") === id);
const naechstesGeschwister = (el) => {
  const k = el && el.eltern ? el.eltern.kinder : [];
  for (let j = k.indexOf(el) + 1; j < k.length; j++) if (istElement(k[j])) return k[j];
  return null;
};
const vorigesGeschwister = (el) => {
  const k = el && el.eltern ? el.eltern.kinder : [];
  for (let j = k.indexOf(el) - 1; j >= 0; j--) if (istElement(k[j])) return k[j];
  return null;
};

// ----------------------------------------------------------------------------------------------------------- URL-Helfer
function absolut(href, basis) {
  href = String(href || "").trim();
  if (!href || /^(javascript|mailto|data):/i.test(href) || href.charAt(0) === "#") return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  try { return new URL(href, basis || "https://ovidius.uni-tuebingen.de/").href; } catch (e) { return href; }
}
function parameter(url, name) {
  const m = new RegExp("[?&]" + name + "=([^&#]*)", "i").exec(url || "");
  if (!m) return "";
  try { return decodeURIComponent(m[1].replace(/\+/g, " ")); } catch (e) { return m[1]; }
}
const ursprung = (url) => { const m = /^(https?:\/\/[^/?#]+)/i.exec(url || ""); return m ? m[1] : "https://ovidius.uni-tuebingen.de"; };

// --------------------------------------------------------------------------------------------------------- Datum, Größe
const MONATE = { jan: 1, feb: 2, "mär": 3, mae: 3, mrz: 3, mar: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9,
  okt: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");
function heuteVon(heute) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(heute || "");
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
const isoTag = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function tagGueltig(j, mo, t) {
  if (!(j >= 1990 && j <= 2100) || !(mo >= 1 && mo <= 12) || !(t >= 1 && t <= 31)) return false;
  const d = new Date(j, mo - 1, t);
  return d.getMonth() === mo - 1 && d.getDate() === t;
}
// Tagesteil eines Datums: „12. Okt 2026“, „12. Okt. 2026“, „12. Oktober 2026“, „12.10.2026“, „Heute“, „Gestern“, „Morgen“
// (auch englisch). Liefert { tag: "JJJJ-MM-TT", rest } oder null.
const TAG_RE = /^\s*(?:(heute|today|gestern|yesterday|morgen|tomorrow)|(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]{3,})\.?\s+(\d{4})|(\d{1,2})\.(\d{1,2})\.(\d{4}))/i;
function tagLesen(s, heute) {
  const m = TAG_RE.exec(s || "");
  if (!m) return null;
  let tag = "";
  if (m[1]) {
    const w = m[1].toLowerCase();
    const d = heuteVon(heute);
    if (w === "gestern" || w === "yesterday") d.setDate(d.getDate() - 1);
    if (w === "morgen" || w === "tomorrow") d.setDate(d.getDate() + 1);
    tag = isoTag(d);
  } else if (m[2]) {
    const mo = MONATE[m[3].toLowerCase().slice(0, 3)];
    if (!mo || !tagGueltig(+m[4], mo, +m[2])) return null;
    tag = `${m[4]}-${pad(mo)}-${pad(+m[2])}`;
  } else {
    if (!tagGueltig(+m[7], +m[6], +m[5])) return null;
    tag = `${m[7]}-${pad(+m[6])}-${pad(+m[5])}`;
  }
  return { tag, rest: s.slice(m.index + m[0].length) };
}
// Erstes Datum (mit Uhrzeit, falls direkt dahinter) in einem Text → "JJJJ-MM-TTTHH:MM" bzw. "JJJJ-MM-TT", sonst "".
// heute: "JJJJ-MM-TT" für Heute/Gestern/Morgen (Standard: Datum des Geräts).
function datum(s, heute) {
  s = String(s || "").replace(/\s+/g, " ");
  const re = /(heute|today|gestern|yesterday|morgen|tomorrow|\d{1,2}\.)/gi;
  let m;
  while ((m = re.exec(s))) {
    // nur am Wortanfang (kein Lookbehind: Zeichen davor prüfen)
    const vor = m.index > 0 ? s.charAt(m.index - 1) : " ";
    if (/[0-9A-Za-zÄÖÜäöüß.]/.test(vor)) continue;
    const t = tagLesen(s.slice(m.index), heute);
    if (!t) continue;
    const z = /^,?\s*(\d{1,2}):(\d{2})\b/.exec(t.rest);
    if (z && +z[1] < 24 && +z[2] < 60) return `${t.tag}T${pad(+z[1])}:${z[2]}`;
    return t.tag;
  }
  return "";
}
// „1.11 MB“, „345 KB“, „1,5 GB“, „12.345 Bytes“ → Bytes (Zahl; ILIAS rechnet mit 1000er-Schritten), sonst null
function groesse(s) {
  const m = /(\d[\d.,]*)\s*(Bytes|Byte|B|KB|kB|KiB|MB|MiB|GB|GiB|TB)\b/.exec(String(s || ""));
  if (!m) return null;
  let z = m[1];
  const punkt = z.lastIndexOf("."), komma = z.lastIndexOf(",");
  if (punkt >= 0 && komma >= 0) z = punkt > komma ? z.replace(/,/g, "") : z.replace(/\./g, "").replace(",", ".");
  else if (komma >= 0) z = /,\d{3}$/.test(z) && m[2].charAt(0) === "B" ? z.replace(/,/g, "") : z.replace(",", ".");
  else if (punkt >= 0 && /\.\d{3}$/.test(z) && m[2].charAt(0) === "B") z = z.replace(/\./g, "");
  const zahl = parseFloat(z);
  if (!(zahl >= 0)) return null;
  const e = m[2].toUpperCase();
  const f = e.charAt(0) === "B" ? 1 : { K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[e.charAt(0)];
  return Math.round(zahl * f);
}

// ------------------------------------------------------------------------------------------------- Seite: Status, Fehler
// Angemeldet? (PFERD: Metaleiste ohne login.php-Link, kein Shibboleth-Knopf; sonst Merkmale des Dashboards)
function angemeldet(html) {
  const w = parsen(html);
  const meta = erstes(w, (e) => hatKlasse(e, "il-maincontrols-metabar"));
  if (meta) {
    const login = erstes(meta, (e) => /(^|\/)(login|shib_login)\.php/i.test(attr(e, "href")));
    return !login && !mitId(w, "button_shib_login");
  }
  if (erstes(w, (e) => e.name === "a" && attr(e, "href").indexOf("block_type=pditems") >= 0)) return true;
  return false;
}
// Meldungen der Seite (ILIAS: div.alert.alert-danger/-info/-success/-warning) → [{ art: "fehler"|"info"|"erfolg"|"warnung", text }]
function meldungen(html) {
  const arten = { "alert-danger": "fehler", "alert-info": "info", "alert-success": "erfolg", "alert-warning": "warnung" };
  const aus = [];
  for (const el of alle(html, (e) => hatKlasse(e, "alert"))) {
    let art = "";
    for (const k of Object.keys(arten)) if (hatKlasse(el, k)) art = arten[k];
    if (!art) continue;
    // versteckte Überschrift („Fehlermeldung“) weglassen
    const kopf = erstes(el, (e) => hatKlasse(e, "ilAccHeadingHidden"));
    let t = text(el);
    if (kopf) { const k = text(kopf); if (k && t.indexOf(k) === 0) t = t.slice(k.length).trim(); }
    if (t) aus.push({ art, text: t });
  }
  return aus;
}
// Permalink der Seite (Fußzeile: il.Footer.permalink.copyText("…/goto.php/crs/123")) → { url, typ, refId } | null
function permalink(html) {
  for (const s of mitTag(html, "script")) {
    const m = /il\.Footer\.permalink\.copyText\("([^"]+)"\)/.exec(rohtext(s));
    if (m) {
      const url = m[1].replace(/\\\//g, "/");
      const z = /goto\.php\/([a-z]+)\/(\d+)/.exec(url) || /[?&]target=([a-z]+)_(\d+)/.exec(url);
      return { url, typ: z ? z[1] : "", refId: z ? z[2] : "" };
    }
  }
  return null;
}
const KEIN_ZUGRIFF = /keine Berechtigung|kein Zugriff|nicht berechtigt|no permission|permission denied|not permitted|access denied/i;
const NICHT_DA = /nicht gefunden|existiert nicht|gelöscht|not found|does not exist|deleted/i;
// Art der Seite (für Anmeldung und Abgleich). url (optional) = End-URL nach Umleitungen.
//   "idp-anmeldung"       Anmeldeformular der Uni (Shibboleth-IdP, Feld j_username)
//   "idp-fehler"          IdP zeigt das Formular erneut mit Fehlermeldung (falsches Passwort)
//   "saml-weiterleitung"  Seite mit SAMLResponse/RelayState (automatisch abzuschicken)
//   "zustimmung"          Attributfreigabe (attributeRelease) – einmal im Browser bestätigen
//   "zwei-faktor"         Zweiter Faktor verlangt (fudiscr-form)
//   "ilias-anmeldung"     ILIAS-Anmeldeseite (abgelaufene oder fehlende Sitzung)
//   "kein-zugriff"        Fehlermeldung „keine Berechtigung“ (auch bei nicht vorhandenen Objekten)
//   "nicht-gefunden"      Fehlermeldung „nicht gefunden/gelöscht“
//   "startseite"          Magazin-Startseite (goto.php/root/1) ohne Fehlermeldung
//   "ilias"               normale Seite, angemeldet
//   "unbekannt"           nichts davon
function seitenArt(html, url) {
  const w = parsen(html);
  const feld = (n) => erstes(w, (e) => (e.name === "input" || e.name === "button") && attr(e, "name") === n);
  if (mitId(w, "attributeRelease")) return "zustimmung";
  if (mitId(w, "fudiscr-form")) return "zwei-faktor";
  if (feld("SAMLResponse") && feld("RelayState")) return "saml-weiterleitung";
  if (feld("j_username")) {
    const fehler = erstes(w, (e) => /error|fehler/i.test(attr(e, "class")) && text(e).length > 3);
    return fehler ? "idp-fehler" : "idp-anmeldung";
  }
  if (/\/login\.php/i.test(url || "") || mitId(w, "button_shib_login") || mitId(w, "shib_login_link")) return "ilias-anmeldung";
  const meta = erstes(w, (e) => hatKlasse(e, "il-maincontrols-metabar"));
  if (meta && !angemeldet(w)) return "ilias-anmeldung";
  const fehler = meldungen(w).filter((m) => m.art === "fehler");
  for (const f of fehler) {
    if (KEIN_ZUGRIFF.test(f.text)) return "kein-zugriff";
    if (NICHT_DA.test(f.text)) return "nicht-gefunden";
  }
  const p = permalink(w);
  if (p && p.typ === "root") return fehler.length ? "kein-zugriff" : "startseite";
  if (meta) return "ilias";
  return "unbekannt";
}

// -------------------------------------------------------------------------------------------------- Typerkennung (PFERD)
// ILIAS-Kurztyp eines Links (file, fold, sess, exc, webr, xvid …) aus URL und Symbol; "" wenn unbekannt.
const KLASSEN = { ilobjfilegui: "file", ilobjfoldergui: "fold", ilobjgroupgui: "grp", ilobjcoursegui: "crs", ilobjsessiongui: "sess",
  ilobjexercisegui: "exc", ilassignmentpresentationgui: "exc", ilobjforumgui: "frm", ilobjtestgui: "tst", iltestscreengui: "tst",
  "ilias\\test\\presentation\\testscreengui": "tst", ilobjlticonsumergui: "lti",
  ilobjcontentpagegui: "copa", ilobjmediacastgui: "mcst", ilobjcategorygui: "cat", ilobjwikigui: "wiki", ilobjsurveygui: "svy",
  ilobjbloggui: "blog", ilobjbookingpoolgui: "book", ilobjdatacollectiongui: "dcl", ilobjbibliographicgui: "bibl",
  ilobjindividualassessmentgui: "iass", ilobjcmixapigui: "cmix", ilobjitemgroupgui: "itgr", ilobjlinkresourcegui: "webr",
  ilobjmediapoolgui: "mep", ilobjlearningmodulegui: "lm", ilobjrootfoldergui: "root" };
const BASISKLASSEN = { illinkresourcehandlergui: "webr", ilmediapoolpresentationgui: "mep", ilwikihandlergui: "wiki",
  illmpresentationgui: "lm", ilhtlmpresentationgui: "htlm", ilsahspresentationgui: "sahs", ilexercisehandlergui: "exc",
  ilmediacasthandlergui: "mcst", ilsaml2gui: "", ildashboardgui: "" };
const ALT_TYPEN = { datei: "file", file: "file", ordner: "fold", folder: "fold", sitzung: "sess", session: "sess", "übung": "exc",
  exercise: "exc", weblink: "webr", "weblink-sammlung": "webr", forum: "frm", test: "tst", gruppe: "grp", group: "grp",
  kurs: "crs", course: "crs", "interaktives video": "xvid", inhaltsseite: "copa", "content page": "copa", mediacast: "mcst",
  medienpool: "mep", "media pool": "mep", kategorie: "cat", category: "cat", umfrage: "svy", survey: "svy", wiki: "wiki" };
function typVon(url, iconSrc, iconAlt) {
  url = url || "";
  let m = /\/goto\.php\/([a-z]+)\/(\d+)/.exec(url);
  if (m) return m[1];
  m = /[?&]target=([a-z]+)_\d+/.exec(url);
  if (m) return m[1];
  if (/[?&]cmd=sendfile\b/i.test(url) || /[?&]file_id=/i.test(url)) return "file";
  if (/[?&](cmd=calldirectlink|calldirectlink)/i.test(url)) return "webr";
  const basis = parameter(url, "baseClass").toLowerCase();
  if (basis === "ilobjplugindispatchgui") {
    const p = /icon_(x[a-z0-9]+)\.svg/i.exec(iconSrc || "");
    return p ? p[1].toLowerCase() : "plugin";
  }
  const klasse = parameter(url, "cmdClass").toLowerCase();
  if (klasse && KLASSEN[klasse]) return KLASSEN[klasse];
  m = /\/icon_([a-z0-9]+)\.svg/i.exec(iconSrc || "");
  if (m) return m[1].toLowerCase();
  const alt = String(iconAlt || "").trim().toLowerCase();
  if (alt && ALT_TYPEN[alt]) return ALT_TYPEN[alt];
  if (basis && BASISKLASSEN[basis]) return BASISKLASSEN[basis];
  return "";
}
const ARTEN = { file: "datei", fold: "ordner", grp: "ordner", copa: "ordner", itgr: "ordner", sess: "sitzung", exc: "uebung",
  webr: "link", xvid: "video", mcst: "video", xoct: "video", frm: "forum", tst: "test" };
const artVon = (typ) => ARTEN[typ] || "sonstiges";
function refIdVon(url) {
  const m = /\/goto\.php\/[a-z]+\/(\d+)/.exec(url || "") || /[?&]ref_id=(\d+)/.exec(url || "") || /[?&]target=[a-z]+_(\d+)/.exec(url || "");
  return m ? m[1] : "";
}

// -------------------------------------------------------------------------------------------------------- Sitzungsnamen
// „12. Okt 2026, 10:15 - 11:45: Vorlesung 1“ → { datum, von, bis, titel, name } wie PFERD (Datum vorn als JJJJ-MM-TT).
// Auch „Heute, 10:15 - 11:45: …“, „12. Okt 2026: …“ (ohne Zeit), mehrtägig „12. Okt 2026, 10:00 - 13. Okt 2026, 12:00: …“.
function sitzung(titel, heute) {
  const s = String(titel || "").replace(/\s+/g, " ").trim();
  const t = tagLesen(s, heute);
  if (!t) return null;
  let rest = t.rest, von = "", bis = "", bisDatum = "";
  let m = /^,\s*(\d{1,2}:\d{2})\s*-\s*/.exec(rest);
  if (m) {
    von = m[1];
    rest = rest.slice(m[0].length);
    const t2 = tagLesen(rest, heute);
    if (t2) { bisDatum = t2.tag; rest = t2.rest.replace(/^,\s*/, ""); }
    m = /^(\d{1,2}:\d{2})/.exec(rest);
    if (m) { bis = m[1]; rest = rest.slice(m[0].length); }
  }
  const titelRest = rest.replace(/^\s*:\s*/, "").trim();
  const zeitTeil = t.rest.slice(0, t.rest.length - rest.length);
  const pfx = (t.tag + zeitTeil).replace(/\s+$/, "");
  return { datum: t.tag, von, bis, bisDatum, titel: titelRest, name: titelRest ? pfx + ": " + titelRest : pfx };
}

// ----------------------------------------------------------------------------------------------------- Container-Inhalt
// Gruppenblock (Objektgruppe / eigener Block) über einem Eintrag, wie PFERD _find_upwards_folder_hierarchy
function gruppeVon(el) {
  const titel = [];
  let p = el.eltern;
  while (p && p.name !== "#dokument") {
    if (hatKlasse(p, "ilContainerItemsContainer")) {
      const store = attr(p.eltern, "data-store-url").toLowerCase();
      const eigen = store.indexOf("ilcontainerblockpropertiesstoragegui") >= 0 && store.indexOf("cont_block_id=") >= 0;
      if (eigen || hatKlasse(p, "ilNoDisplay")) {
        const kopf = vorigesGeschwister(p);
        if (kopf && hatKlasse(kopf, "ilContainerBlockHeader")) {
          const h = erstes(kopf, (e) => e.name === "h3") || erstes(kopf, (e) => e.name === "h2");
          const t = text(h || kopf);
          if (t) titel.unshift(t);
        }
      }
    }
    if (hatKlasse(p, "il_VAccordionContentDef")) {
      const kopf = erstes(p.eltern, (e) => hatKlasse(e, "ilc_va_ihead_VAccordIHead") || hatKlasse(e, "ilc_va_ihead_AccordIHead"));
      if (kopf && text(kopf)) titel.unshift(text(kopf));
    }
    p = p.eltern;
  }
  return titel.join("/");
}

const istAussen = (e) => hatKlasse(e, "ilContainerListItemOuter");
// Teile unter box, die zu DIESEM Eintrag gehören (nicht zu einem darin aufgeklappten Eintrag)
function eigeneTeile(aussen, box, test) {
  if (!box) return [];
  return alle(box, test).filter((x) => !aussen || vorfahr(x, istAussen) === aussen);
}
// Typ und ref_id eines Listeneintrags (aussen = sein ilContainerListItemOuter, a = Titel-Link, url = absolut)
function eintragKopf(aussen, a, url) {
  const iconBox = eigeneTeile(aussen, aussen, (e) => hatKlasse(e, "ilContainerListItemIcon"))[0];
  const icon = (iconBox && erstes(iconBox, (e) => e.name === "img")) ||
    eigeneTeile(aussen, aussen, (e) => e.name === "img" && (hatKlasse(e, "ilListItemIcon") || hatKlasse(e, "icon")))[0] || null;
  // Zeile <li id="item_row_<block>-<ref>">: block = Typ (nach Typ sortierte Blöcke: sess, cat …), „_other“ oder die
  // Nummer einer Objektgruppe; die Zahl am Ende ist immer die ref_id
  const zeile = vorfahr(aussen || a, (e) => e.name === "li" && /^item_row_/.test(attr(e, "id")));
  const zm = zeile ? /^item_row_([A-Za-z0-9_]+)-(\d+)$/.exec(attr(zeile, "id")) : null;
  const typ = (zm && /^[a-z]+$/.test(zm[1]) ? zm[1] : "") || typVon(url, attr(icon, "src"), attr(icon, "alt"));
  const kennung = /lg_div_(\d+)_pref_/.exec(attr(aussen, "data-list-item-id") || attr(aussen, "id"));
  const refId = refIdVon(url) || (zm ? zm[2] : "") || (kennung ? kennung[1] : "");
  return { typ, refId };
}

// Einträge einer Container-Seite (Kurs, Ordner, Sitzung/Info-Seite, Gruppe, Kategorie, Inhaltsseite) →
// [{ art, typ, titel, refId, id, url, endung, groesse, geaendert, eigenschaften, beschreibung, gruppe, inSitzung, sitzung }]
//   art          "datei" | "ordner" (fold, grp, copa, itgr) | "sitzung" | "uebung" | "link" | "video" (xvid, mcst, xoct,
//                mob) | "forum" | "test" | "sonstiges" (lti, mep, cat, crs …: bekannt, aber nichts zum Ablegen)
//   typ          ILIAS-Kurztyp (file, fold, grp, sess, exc, webr, xvid, mob, frm, tst, copa, mep, lti, cat, crs …;
//                "" = unbekannt). Dateien mit Endung mp4 o. ä. bleiben art „datei“ (Ablage entscheidet über Videos).
//   refId / id   Referenz-Nummer (aus der URL oder item_row/data-list-item-id); id = refId, bei Dateilisten in
//                Inhaltsseiten die file_id, bei Videos im Seiteninhalt "mob-<Dateiname>"
//   endung       nur Dateien (und mob): erste Eigenschaft („pdf“), klein geschrieben
//   groesse      nur Dateien: Bytes oder null; geaendert: nur Dateien, "JJJJ-MM-TTTHH:MM" (Ortszeit Tübingen) oder ""
//   eigenschaften  alle Eigenschaften als Text (["pdf", "1.11 MB", "12. Okt 2026, 09:31", "Anzahl Seiten: 15"])
//   gruppe       Titel des Objektgruppen-Blocks („00 - Vorlesung“), sonst ""
//   inSitzung    refId der Sitzung, wenn der Eintrag aufgeklappt unter einer Sitzung steht (Kursseite), sonst ""
//   sitzung      nur Sitzungen: { datum, von, bis, bisDatum, titel, name } (name wie PFERDs Ordnername)
// Einträge ohne Link (offline, noch nicht freigegeben) fehlen, wie bei PFERD.
function inhalt(html, basisUrl, optionen) {
  const w = parsen(html);
  const heute = optionen && optionen.heute;
  const aus = [];
  const gesehen = {};
  const links = alle(w, (e) => e.name === "a" && hatKlasse(e, "il_ContainerItemTitle"));
  for (const a of links) {
    const href = attr(a, "href");
    const url = absolut(href, basisUrl);
    if (!url) continue;
    const aussen = vorfahr(a, istAussen);
    const block = vorfahr(a, (e) => hatKlasse(e, "il_ContainerListItem")) || aussen;
    const eigene = (box, test) => eigeneTeile(aussen, box, test);
    const { typ, refId } = eintragKopf(aussen, a, url);
    // Steht der Eintrag aufgeklappt in einem anderen Eintrag (Sitzung auf der Kursseite)? Dann dessen refId merken.
    let inSitzung = "";
    const elternAussen = aussen ? vorfahr(aussen, istAussen) : null;
    if (elternAussen) {
      const elternLink = eigeneTeile(elternAussen, elternAussen, (e) => e.name === "a" && hatKlasse(e, "il_ContainerItemTitle"))[0];
      const k = elternLink ? eintragKopf(elternAussen, elternLink, absolut(attr(elternLink, "href"), basisUrl)) : null;
      if (k && k.typ === "sess") inSitzung = k.refId || "?";
    }
    const schluessel = (refId || url) + "|" + inSitzung;
    if (gesehen[schluessel]) continue;
    gesehen[schluessel] = true;
    const propsBox = block ? eigene(block, (e) => hatKlasse(e, "il_ItemProperties"))[0] : null;
    const props = propsBox ? alle(propsBox, (e) => hatKlasse(e, "il_ItemProperty")).map(text).filter(Boolean) : [];
    const alarm = block ? eigene(block, (e) => hatKlasse(e, "il_ItemAlertProperty")).map(text).filter(Boolean) : [];
    const beschrBox = block ? eigene(block, (e) => hatKlasse(e, "il_Description"))[0] : null;
    const titel = text(a);
    const art = artVon(typ);
    const alleProps = props.concat(alarm);
    let endung = "";
    if (typ === "file" && props.length && /^[A-Za-z0-9]{1,10}$/.test(props[0])) endung = props[0].toLowerCase();
    // Größe und Änderungsdatum nur bei Dateien (bei Gruppen o. ä. ist das erste Datum z. B. ein Anmeldeschluss)
    let gr = null, geaendert = "";
    if (typ === "file") {
      for (const p of props) {
        if (gr == null) gr = groesse(p);
        if (!geaendert) geaendert = datum(p, heute);
      }
    }
    const e = { art, typ, titel, refId, id: refId, url, endung, groesse: gr, geaendert, eigenschaften: alleProps,
      beschreibung: text(beschrBox), gruppe: gruppeVon(a), inSitzung };
    if (typ === "sess") e.sitzung = sitzung(titel, heute);
    aus.push(e);
  }
  // Dateilisten in Inhaltsseiten (copa) und Seiteninhalten (PFERD _find_copa_entries)
  for (const a of alle(w, (e) => e.name === "a" && hatKlasse(e, "ilc_flist_a_FileListItemLink"))) {
    const url = absolut(attr(a, "href"), basisUrl);
    const fid = parameter(url, "file_id");
    if (!url || !fid || gesehen["f" + fid]) continue;
    gesehen["f" + fid] = true;
    const roh = text(a);
    const gm = /\(([\d.,]+\s*[KMG]?B)\)/.exec(roh);
    const titel = roh.replace(/\([\d.,]+\s*[KMG]?B\)/, "").trim();
    const em = /\.([A-Za-z0-9]{1,10})$/.exec(titel);
    aus.push({ art: "datei", typ: "file", titel, refId: "", id: fid, url, endung: em ? em[1].toLowerCase() : "",
      groesse: gm ? groesse(gm[1]) : null, geaendert: "", eigenschaften: [], beschreibung: "", gruppe: gruppeVon(a), inSitzung: "" });
  }
  // Videos im Seiteninhalt (Medienobjekt, PFERD _find_mob_videos): nur vom selben Server. Die deliver.php-Adresse enthält
  // ein Token und gilt nur kurz – erst direkt vor dem Laden lesen.
  const host = ursprung(basisUrl);
  for (const fig of alle(w, (e) => e.name === "figure" &&
    (hatKlasse(e, "ilc_media_cont_MediaContainer") || hatKlasse(e, "ilc_media_cont_MediaContainerHighlighted")))) {
    const video = erstes(fig, (e) => e.name === "video");
    if (!video) continue;
    const quelle = erstes(video, (e) => e.name === "source" && attr(e, "type") === "video/mp4") || erstes(video, (e) => e.name === "source");
    const url = absolut(attr(quelle, "src") || attr(video, "src"), basisUrl);
    if (!url || ursprung(url) !== host) continue;
    const pfadName = decodeURIComponent((/\/([^/?#]+)(?:[?#]|$)/.exec(url) || ["", ""])[1]);
    const em = /\.([A-Za-z0-9]{1,6})$/.exec(pfadName);
    const cap = erstes(fig, (e) => e.name === "figcaption");
    const titel = text(cap) || pfadName.replace(/\.[A-Za-z0-9]{1,6}$/, "");
    const id = "mob-" + pfadName;
    if (gesehen[id]) continue;
    gesehen[id] = true;
    aus.push({ art: "video", typ: "mob", titel, refId: "", id, url, endung: em ? em[1].toLowerCase() : "mp4", groesse: null,
      geaendert: "", eigenschaften: [], beschreibung: "", gruppe: gruppeVon(fig), inSitzung: "" });
  }
  return aus;
}

// URL, die statt dieser Seite geholt werden muss (PFERD get_next_stage_element), sonst "":
//   Inhalt-Reiter nicht aktiv (Seite zeigt z. B. die Info) → Link des Reiters „Inhalt“;
//   eingeklappte Sitzungen (crs_next_sess / crs_prev_sess) → Link „alle anzeigen“.
function folgeUrl(html, basisUrl) {
  const w = parsen(html);
  const reiter = mitId(w, "tab_view_content");
  if (reiter && !hatKlasse(reiter, "active")) {
    const a = erstes(reiter, (e) => e.name === "a");
    if (a) return absolut(attr(a, "href"), basisUrl);
  }
  const mehr = erstes(w, (e) => e.name === "a" && /crs_(next|prev)_sess=1/.test(attr(e, "href")));
  return mehr ? absolut(attr(mehr, "href"), basisUrl) : "";
}

// -------------------------------------------------------------------------------------------------- Meine Kurse/Gruppen
// Seite „Meine Kurse und Gruppen“ (ilias.php?baseClass=ilmembershipoverviewgui) → { kurse, gruppen }
//   je [{ refId, titel, code, url, typ }]; code = Modulcode am Titelanfang (B110, SQ888), sonst "".
const CODE = /^\s*([A-Z]{1,3}\d{3})\b/;
function mitgliedschaften(html, basisUrl) {
  const w = parsen(html);
  const kurse = [], gruppen = [], gesehen = {};
  const titelLinks = [];
  for (const t of alle(w, (e) => hatKlasse(e, "il-item-title"))) {
    const a = erstes(t, (e) => e.name === "a" && attr(e, "href"));
    if (a) titelLinks.push(a);
  }
  for (const a of titelLinks.concat(alle(w, (e) => e.name === "a" && hatKlasse(e, "il_ContainerItemTitle")))) {
    const url = absolut(attr(a, "href"), basisUrl);
    const item = vorfahr(a, (e) => hatKlasse(e, "il-std-item") || hatKlasse(e, "ilContainerListItemOuter"));
    const icon = item ? erstes(item, (e) => e.name === "img") : null;
    const typ = typVon(url, attr(icon, "src"), attr(icon, "alt"));
    if (typ !== "crs" && typ !== "grp") continue;
    const refId = refIdVon(url);
    if (!refId || gesehen[refId]) continue;
    gesehen[refId] = true;
    const titel = text(a);
    const m = CODE.exec(titel);
    (typ === "crs" ? kurse : gruppen).push({ refId, titel, code: m ? m[1] : "", url, typ });
  }
  return { kurse, gruppen };
}
const kurse = (html, basisUrl) => mitgliedschaften(html, basisUrl).kurse;
const gruppen = (html, basisUrl) => mitgliedschaften(html, basisUrl).gruppen;

// ------------------------------------------------------------------------------------------------------------- Übungen
// Übungsseite (Übersicht oder Aufgabe) → [{ titel, assId, url, frist, fristText, eigenschaften, dateien: [{ name, url }] }]
// frist: "JJJJ-MM-TTTHH:MM" aus „Abgabetermin“/„Ende“/„Deadline“ …, sonst erstes Datum der Eigenschaften.
// Noch nicht an echten Tübinger Übungen geprüft (Oktober 2026 keine vorhanden); Aufbau nach PFERD und ILIAS-10-UI.
const FRIST = /abgabe|frist|deadline|ende|endet|bearbeitungszeit|einreichung|termin/i;
function eigenschaftenVon(box) {
  const aus = [];
  for (const n of alle(box, (e) => hatKlasse(e, "il-item-property-name"))) {
    const v = naechstesGeschwister(n);
    aus.push({ name: text(n), wert: v && hatKlasse(v, "il-item-property-value") ? text(v) : "" });
  }
  for (const n of alle(box, (e) => hatKlasse(e, "il_InfoScreenProperty"))) {
    const v = naechstesGeschwister(n);
    aus.push({ name: text(n), wert: v ? text(v) : "" });
  }
  return aus;
}
function dateiLinks(box, basisUrl) {
  const aus = [];
  for (const a of alle(box, (e) => e.name === "a" && /[?&]cmd=(download|downloadFile|sendfile)\b/i.test(attr(e, "href")))) {
    const url = absolut(attr(a, "href"), basisUrl);
    // Linktext ist der Dateiname; nur bei „Download“-Knöpfen steht der Name in der Zeile davor (PFERD)
    let name = text(a);
    if (!name || /^(download|herunterladen)$/i.test(name)) {
      name = "";
      const zeile = vorfahr(a, (e) => e.name === "tr" || hatKlasse(e, "row") || hatKlasse(e, "form-group") || hatKlasse(e, "il-item"));
      if (zeile) {
        const erst = erstes(zeile, (e) => (e.name === "div" || e.name === "td" || e.name === "span") && e !== a &&
          !erstes(e, (x) => x === a) && text(e));
        if (erst) name = text(erst);
      }
    }
    aus.push({ name, url });
  }
  return aus;
}
function uebungen(html, basisUrl, optionen) {
  const w = parsen(html);
  const heute = optionen && optionen.heute;
  const aus = [];
  const gesehen = {};
  const neu = (titel, url, box) => {
    const assId = parameter(url, "ass_id");
    const key = assId || url || titel;
    if (gesehen[key]) return;
    gesehen[key] = true;
    const eig = box ? eigenschaftenVon(box) : [];
    let frist = "", fristText = "";
    for (const p of eig) if (!frist && FRIST.test(p.name) && datum(p.wert, heute)) { frist = datum(p.wert, heute); fristText = p.wert; }
    if (!frist) for (const p of eig) if (!frist && datum(p.wert, heute)) { frist = datum(p.wert, heute); fristText = p.wert; }
    aus.push({ titel, assId, url, frist, fristText, eigenschaften: eig, dateien: box ? dateiLinks(box, basisUrl) : [] });
  };
  for (const a of alle(w, (e) => e.name === "a" && /[?&]ass_id=\d+/.test(attr(e, "href")) &&
    /ilassignmentpresentationgui/i.test(attr(e, "href")))) {
    if (!vorfahr(a, (e) => hatKlasse(e, "il-item-title")) && !hatKlasse(a.eltern, "il-item-title")) continue;
    const box = vorfahr(a, (e) => hatKlasse(e, "il-item") || hatKlasse(e, "il-std-item"));
    neu(text(a), absolut(attr(a, "href"), basisUrl), box);
  }
  // Einzelne Aufgabe (Detailseite): Titel aus der Seite, Eigenschaften aus dem Info-Bereich, Dateien mit „Download“
  if (!aus.length) {
    const box = mitId(w, "ilContentContainer") || mitId(w, "il_center_col");
    const url = absolut(basisUrl || "", basisUrl);
    if (box && /ass_id=\d+/.test(url || "")) {
      const kopf = erstes(w, (e) => hatKlasse(e, "il-page-content-header")) || erstes(w, (e) => e.name === "h1");
      neu(text(kopf), url, box);
    }
  }
  return aus;
}

// ------------------------------------------------------------------------------------------------------------ Formulare
// Alle Formulare → [{ id, name, method, action (absolut), felder: { name: wert }, knoepfe: [name] }]
// felder: input (außer submit/button/image/reset, Checkbox/Radio nur wenn checked), select (gewählte Option), textarea.
function formulare(html, basisUrl) {
  const aus = [];
  for (const f of alle(html, (e) => e.name === "form")) {
    const felder = {}, knoepfe = [];
    for (const el of alle(f, (e) => e.name === "input" || e.name === "select" || e.name === "textarea" || e.name === "button")) {
      const n = attr(el, "name");
      if (!n) continue;
      const t = attr(el, "type").toLowerCase();
      if (el.name === "button" || t === "submit" || t === "image" || t === "button" || t === "reset") { knoepfe.push(n); continue; }
      if ((t === "checkbox" || t === "radio") && !Object.prototype.hasOwnProperty.call(el.attrs, "checked")) continue;
      if (el.name === "select") {
        const opt = erstes(el, (o) => o.name === "option" && Object.prototype.hasOwnProperty.call(o.attrs, "selected")) ||
          erstes(el, (o) => o.name === "option");
        felder[n] = opt ? (Object.prototype.hasOwnProperty.call(opt.attrs, "value") ? attr(opt, "value") : text(opt)) : "";
      } else if (el.name === "textarea") felder[n] = rohtext(el);
      else felder[n] = Object.prototype.hasOwnProperty.call(el.attrs, "value") ? attr(el, "value") : (t === "checkbox" || t === "radio" ? "on" : "");
    }
    const act = attr(f, "action");
    aus.push({ id: attr(f, "id"), name: attr(f, "name"), method: (attr(f, "method") || "get").toLowerCase(),
      action: act ? absolut(act, basisUrl) : (basisUrl || ""), felder, knoepfe });
  }
  return aus;
}

// ------------------------------------------------------------------------------------------------- Dateiname, Download
const RESERVIERT = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
function utf8Laenge(s) {
  let n = 0;
  for (const z of s) { const c = z.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  return n;
}
function kuerzen(s, zeichen, bytes) {
  let aus = "";
  for (const z of s) {
    if ((aus + z).length > zeichen || utf8Laenge(aus + z) > bytes) break;
    aus += z;
  }
  return aus;
}
// Name für die Ablage: Titel + "." + Typ (PFERD: erste Eigenschaft), für Windows, macOS, iOS und Android zulässig, höchstens
// 120 Zeichen (und 240 Bytes UTF-8), Endung bleibt erhalten. Trägt der Titel die Endung schon, wird sie nicht verdoppelt.
// Andere Einträge (Ordner, Sitzungen): Titel bzw. PFERDs Sitzungsname, gleich bereinigt.
function dateiName(eintrag) {
  const e = eintrag || {};
  let basis = e.typ === "sess" && e.sitzung && e.sitzung.name ? e.sitzung.name : String(e.titel || "");
  basis = basis.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/:\s+/g, " - ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const mitEndung = e.typ === "file" || e.typ === "mob" || e.art === "datei";
  const endung = mitEndung ? String(e.endung || "").toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  if (endung && basis.toLowerCase().endsWith("." + endung)) basis = basis.slice(0, basis.length - endung.length - 1);
  basis = basis.replace(/[. ]+$/, "").replace(/^[. ]+/, "");
  if (!basis) basis = (e.art === "datei" ? "Datei " : "Eintrag ") + (e.id || e.refId || "ohne Titel");
  if (RESERVIERT.test(basis)) basis = "_" + basis;
  const anhang = endung ? "." + endung : "";
  basis = kuerzen(basis, 120 - anhang.length, 240 - anhang.length).replace(/[. ]+$/, "");
  return basis + anhang;
}
// Download-Adresse einer Datei: der Link aus der Liste (cmd=sendfile, liefert die Datei direkt; Dateilisten: file_id),
// sonst PFERDs Form goto.php/file/<ref>/download (eine Umleitung). Video im Seiteninhalt (typ "mob"): die deliver.php-
// Adresse (mit Token, gilt nur kurz). Kein Download (Ordner, Links, Interaktives Video …): "".
function downloadUrl(eintrag, basisUrl) {
  const e = eintrag || {};
  if (e.typ === "mob") return e.url || "";
  if (e.typ !== "file" && e.art !== "datei") return "";
  if (/[?&](cmd=sendfile|file_id=)/i.test(e.url || "")) return e.url;
  const ref = e.refId || refIdVon(e.url);
  return ref ? ursprung(basisUrl || e.url) + "/goto.php/file/" + ref + "/download" : "";
}

// ---------------------------------------------------------------------------------------------------------------- Export
const API = { parsen, alle, erstes, vorfahr, text, attr, hatKlasse, naechstesGeschwister, vorigesGeschwister, entitaeten,
  angemeldet, meldungen, permalink, seitenArt, typVon, artVon, mitgliedschaften, kurse, gruppen, inhalt, folgeUrl, uebungen,
  formulare, dateiName, downloadUrl, datum, groesse, sitzung, absolut };

// Aufruf mit ctx: „heute“ für Heute/Gestern/Morgen kommt aus ctx.date (Testdatum des Plugins), sonst wie ohne Aufruf.
module.exports = function (ctx) {
  const heute = () => {
    try { return ctx && ctx.date && ctx.date.now ? ctx.date.now("YYYY-MM-DD") : ""; } catch (e) { return ""; }
  };
  const mitHeute = (fn) => (html, basisUrl, optionen) => fn(html, basisUrl, Object.assign({ heute: heute() }, optionen || {}));
  return Object.assign({}, API, {
    inhalt: mitHeute(inhalt),
    uebungen: mitHeute(uebungen),
    datum: (s, h) => datum(s, h || heute()),
    sitzung: (t, h) => sitzung(t, h || heute()),
  });
};
Object.assign(module.exports, API);
