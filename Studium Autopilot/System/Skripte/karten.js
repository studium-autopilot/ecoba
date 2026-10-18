// Karteikarten (Plan Abschnitt 24.1): Stapel je Modul, Planung mit FSRS-6 (fsrs.js), Lernen wie in Anki.
// Karten stehen in normalen Notizen unter Karteikarten/. Das Modul kommt aus „code“ im Frontmatter, sonst aus dem Datei- oder
// Ordnernamen („B110 …“); mehrere Notizen je Modul sind Unterstapel. Ein Block (durch Leerzeilen getrennt) ist eine Karte:
//   Frage :: Antwort              einfach; mehrere solche Zeilen direkt untereinander sind mehrere Karten (auch als Liste)
//   Frage ::: Antwort             dazu die umgekehrte Karte
//   Frage / ? / Antwort           über mehrere Zeilen (?? = mit umgekehrter Karte)
//   … {{c1::Text::Hinweis}} …     Lückentext, eine Karte je Nummer
// Überschriften gliedern (Kapitel). Code, Kommentare (%% %%, <!-- -->), Zitate, Callouts, Tabellen und HTML zählen nicht.
// Kennung: Block-ID am Ende („ ^k1a2b3c“). Fehlt sie, setzt das Plugin sie beim Start einer Lernrunde; sonst schreibt es in
// Kartennotizen nur bei „Neue Karte“ und „Bearbeiten“.
// Lernstände: System/Daten/Karteikarten/<Gerät>.jsonl, eine JSON-Zeile je Bewertung { k, t, b (1–4), d (ms) } oder Aktion
// { k, t, a }: aus = aussetzen, an = fortsetzen, neu = zurücksetzen, zur = bis morgen zurückstellen. Jedes Gerät hängt nur an
// seine eigene Datei an, darum gibt es keine Sync-Konflikte. Der Stand jeder Karte wird aus allen Dateien neu berechnet
// (nachspielen). Nie im Release; das Update fasst den Ordner nicht an.
// Optionen: System/Einstellungen.md, Felder karten_* (Fenster „Optionen“); ohne Feld gelten die Werte wie in Anki.
// Codeblock ```eba-karten``` mit Argument: (ohne) Übersicht der Stapel · stapel (in einer Kartennotiz) · statistik · liste ·
// heute (Dashboard: Zeile nur, wenn etwas fällig ist). Aktionen: karten-lernen (code, stapel), karte-neu (stapel),
// kartenstapel (auch Ordner-Automatik in Karteikarten/), karten-optionen. Leseansicht einer Kartennotiz: jede Karte eine
// Zeile, die Antwort erst beim Antippen. Dateinamen der Stapel nie gleich dem einer anderen Notiz („S100 Karteikarten“, nicht
// wie die Modulnotiz); beim Start benennt nur der Abrufer ältere Stapel einmal um (namenPruefen), sonst schreibt er nichts.
// Stil: eba-core.css Abschnitt 52 (eba-lk-*). iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const O = ctx.obsidian || {};
  const Fenster = O.Modal || class { constructor() { this.app = app; } };
  const SPRACHE = "eba-karten";
  const ARTEN = ["uebersicht", "stapel", "statistik", "liste", "heute"];
  const ORDNER = "Karteikarten";
  const DATEN = "System/Daten/Karteikarten";
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const GERUEST = "System/Gerüste/Karteikarten.md";
  const MIN = 60e3, STD = 36e5, TAG = 864e5;
  const VORAUS = 20 * MIN;  // Lernschritte bis so weit im Voraus zeigen, statt zu warten (wie Anki)
  const MAX_DAUER = 60e3;   // gezählte Antwortzeit höchstens 60 s (wie Anki)
  const MEHR_NEU = 10;      // „Heute mehr neue Karten“
  const SEITE = 50;         // Kartenliste: Zeilen je Schritt
  const MODULCODE = /^[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?$/; // wie eba.js
  const CODE_VORN = /^([A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?)(?:\s|$)/;
  const ID_AM_ENDE = /\s\^([A-Za-z0-9-]+)\s*$/;
  const LUECKE_DA = /\{\{c(\d+)::/;
  const LUECKE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
  const LISTE = /^\s*(?:[-*+]|\d+[.)])\s+/;
  const AKTION = ["aus", "an", "neu", "zur"];
  const NAMEN = ["Nochmal", "Schwer", "Gut", "Einfach"];
  const L = { extra: "eba-karten-extra", letzter: "eba-karten-stapel", geraet: "eba-geraet" };

  const F = () => ctx.user.fsrs(ctx); // jedes Mal neu: ein Hot-Reload von fsrs.js greift sofort
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const zwei = (n) => String(n).padStart(2, "0");
  const datumText = (ms) => { const d = new Date(ms); return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.`; };
  const uhrzeit = (ms) => { const d = new Date(ms); return `${zwei(d.getHours())}:${zwei(d.getMinutes())}`; };
  const zahlText = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
  const tageText = (t) => (t < 1 ? "heute" : t === 1 ? "1 Tag" : t < 30 ? t + " Tage" : t < 365 ? zahlText(t / 30.4) + " Mon." : zahlText(t / 365) + " J.");
  const dauerText = (ms) => { const m = Math.round(ms / MIN); return m < 1 ? "unter einer Minute" : m === 1 ? "1 Minute" : m + " Minuten"; };
  const anzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;
  const kurzHash = (t) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  };
  const lokal = (k, v) => {
    if (v === undefined) { try { return app.loadLocalStorage(k) || null; } catch (e) { return null; } }
    try { app.saveLocalStorage(k, v == null ? null : v); } catch (e) { /* egal */ }
    return v;
  };
  const jetztMs = () => ctx.date.jetzt().getTime();

  // ---------- Optionen (System/Einstellungen.md, Felder karten_*) ----------
  const STANDARD = { neu: 20, wdh: 200, ziel: 0.9, schritte: "1m 10m", neuSchritte: "10m", maxIntervall: 36500, tagesbeginn: 4,
    schwierig: 8, schwierigAussetzen: true, geschwister: true, neuReihenfolge: "notiz" };
  const FELD = { neu: "karten_neu_pro_tag", wdh: "karten_wdh_pro_tag", ziel: "karten_behalten", schritte: "karten_lernschritte",
    neuSchritte: "karten_neu_lernschritte", maxIntervall: "karten_max_intervall", tagesbeginn: "karten_tagesbeginn",
    schwierig: "karten_schwierig_ab", schwierigAussetzen: "karten_schwierig_aussetzen", geschwister: "karten_geschwister",
    neuReihenfolge: "karten_neu_reihenfolge" };
  // Rein (Tests): Frontmatter → Optionen; fehlende oder ungültige Werte → Standard, Zahlen auf sinnvolle Grenzen
  const optionenAus = (fm) => {
    fm = fm || {};
    const roh = (k) => fm[FELD[k]];
    const da = (k) => roh(k) !== undefined && roh(k) !== null && String(roh(k)).trim() !== "";
    const zahl = (k, min, max) => { const n = Number(String(roh(k)).replace(",", ".")); return da(k) && isFinite(n) ? Math.min(max, Math.max(min, n)) : STANDARD[k]; };
    let ziel = da("ziel") ? Number(String(roh("ziel")).replace("%", "").replace(",", ".").trim()) : STANDARD.ziel;
    if (!isFinite(ziel)) ziel = STANDARD.ziel;
    if (ziel > 1) ziel /= 100;
    const schritte = (k) => (roh(k) === undefined || roh(k) === null ? STANDARD[k] : String(roh(k)));
    const ja = (k) => (typeof roh(k) === "boolean" ? roh(k) : STANDARD[k]);
    const f = F();
    return {
      neu: Math.round(zahl("neu", 0, 9999)), wdh: Math.round(zahl("wdh", 0, 99999)),
      ziel: Math.min(0.99, Math.max(0.7, Math.round(ziel * 100) / 100)),
      schritteText: schritte("schritte"), neuSchritteText: schritte("neuSchritte"),
      schritte: f.schritteLesen(schritte("schritte")), neuSchritte: f.schritteLesen(schritte("neuSchritte")),
      maxIntervall: Math.round(zahl("maxIntervall", 1, 36500)), tagesbeginn: Math.round(zahl("tagesbeginn", 0, 23)),
      schwierig: Math.round(zahl("schwierig", 0, 99)), schwierigAussetzen: ja("schwierigAussetzen"), geschwister: ja("geschwister"),
      neuReihenfolge: roh("neuReihenfolge") === "zufall" ? "zufall" : "notiz",
    };
  };
  const fmEinstellungen = () => { const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN); const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
  const optionen = () => optionenAus(fmEinstellungen());
  const signatur = (o) => [o.ziel, o.schritteText, o.neuSchritteText, o.maxIntervall, o.tagesbeginn, o.schwierig, o.schwierigAussetzen].join("|");

  // ---------- Tage: ein Lerntag beginnt um o.tagesbeginn Uhr (Standard 4 Uhr wie Anki) ----------
  const tagVon = (ms, beginn) => { const d = new Date(ms - beginn * STD); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / TAG); };
  const tagBeginnVon = (n, beginn) => { const d = new Date(n * TAG); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), beginn).getTime(); };
  const planerFuer = (o) => F().planer({ ziel: o.ziel, schritte: o.schritte, neuSchritte: o.neuSchritte, maxIntervall: o.maxIntervall,
    tag: (ms) => tagVon(ms, o.tagesbeginn), tagBeginn: (n) => tagBeginnVon(n, o.tagesbeginn) });
  const lernt = (st) => !!st && (st.zustand === 1 || st.zustand === 3); // Lernen oder Neu-Lernen (fsrs.js ZUSTAND)

  // ---------- Kartennotiz lesen (rein) ----------
  // Text, in dem kein Trenner zählt: Lücken, Code, Formeln (gleich lang, damit die Stellen passen)
  const verdecken = (s) => s.replace(/\{\{c\d+::[\s\S]*?\}\}/g, (m) => "x".repeat(m.length))
    .replace(/`[^`]*`/g, (m) => "x".repeat(m.length)).replace(/\$[^$]*\$/g, (m) => "x".repeat(m.length));
  // Trenner „::“ (einfach) oder „:::“ (umgekehrt) → { pos, laenge, umgekehrt } oder null
  const trenner = (zeile) => {
    const v = verdecken(String(zeile));
    let i = v.indexOf("::");
    while (i >= 0) {
      let n = 2;
      while (v.charAt(i + n) === ":") n++;
      if (n <= 3) return { pos: i, laenge: n, umgekehrt: n === 3 };
      i = v.indexOf("::", i + n);
    }
    return null;
  };
  const notizBauen = (b, art, vorne, hinten) => {
    const n = Object.assign({}, b, { art, vorne, hinten, karten: [] });
    const stamm = b.id || "?" + kurzHash(b.pfad + "\n" + b.roh.replace(ID_AM_ENDE, ""));
    const karte = (ord, suffix) => ({ basis: stamm + suffix, schluessel: stamm + suffix, suffix, nid: stamm, ord, notiz: n, ohneId: !b.id });
    if (art === "luecke") {
      const nrs = [];
      vorne.replace(LUECKE, (m, x) => { const z = Number(x); if (nrs.indexOf(z) < 0) nrs.push(z); return m; });
      nrs.sort((a, c) => a - c);
      n.karten = nrs.map((z) => karte(z, "-c" + z));
    } else n.karten = art === "umgekehrt" ? [karte(0, ""), karte(1, "-r")] : [karte(0, "")];
    return n;
  };
  const blockLesen = (block, kapitel, pfad, notizen) => {
    const erste = block[0].text.trim();
    if (/^[>|<]/.test(erste) || /^(-{3,}|\*{3,}|_{3,})$/.test(erste)) return;
    const zeilen = block.map((b) => { const m = b.text.match(ID_AM_ENDE); return { nr: b.nr, id: m ? m[1] : null, text: m ? b.text.slice(0, m.index) : b.text }; });
    const letzte = zeilen[zeilen.length - 1];
    const basis = { pfad, kapitel, von: block[0].nr, bis: letzte.nr, idZeile: letzte.nr, id: letzte.id, roh: block.map((b) => b.text).join("\n") };
    const text = (liste) => liste.map((z) => z.text).join("\n").trim();
    const sep = zeilen.findIndex((z) => z.text.trim() === "?" || z.text.trim() === "??");
    if (sep >= 0) {
      const vorne = text(zeilen.slice(0, sep)), hinten = text(zeilen.slice(sep + 1));
      if (vorne && hinten) notizen.push(notizBauen(basis, zeilen[sep].text.trim() === "??" ? "umgekehrt" : "einfach", vorne, hinten));
      return;
    }
    const ganz = text(zeilen);
    if (LUECKE_DA.test(ganz)) { notizen.push(notizBauen(basis, "luecke", ganz, "")); return; }
    const tr = zeilen.map((z) => trenner(z.text));
    if (zeilen.length > 1 && tr.every(Boolean)) {
      zeilen.forEach((z, j) => {
        const v = z.text.slice(0, tr[j].pos).replace(LISTE, "").trim(), h = z.text.slice(tr[j].pos + tr[j].laenge).trim();
        if (v && h) notizen.push(notizBauen({ pfad, kapitel, von: z.nr, bis: z.nr, idZeile: z.nr, id: z.id, roh: block[j].text }, tr[j].umgekehrt ? "umgekehrt" : "einfach", v, h));
      });
      return;
    }
    if (!tr[0]) return;
    const v = zeilen[0].text.slice(0, tr[0].pos).replace(LISTE, "").trim();
    const h = [zeilen[0].text.slice(tr[0].pos + tr[0].laenge)].concat(zeilen.slice(1).map((z) => z.text)).join("\n").trim();
    if (v && h) notizen.push(notizBauen(basis, tr[0].umgekehrt ? "umgekehrt" : "einfach", v, h));
  };
  // Text einer Kartennotiz → [{ art, vorne, hinten, id, von, bis, idZeile, kapitel, roh, karten: [{ schluessel, nid, ord }] }]
  const parsen = (text, pfad) => {
    const zeilen = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
    const notizen = [];
    let i = 0, kapitel = "", block = [], zaun = null, kommentar = false, html = false;
    if (zeilen[0] === "---") { let j = 1; while (j < zeilen.length && zeilen[j] !== "---" && zeilen[j] !== "...") j++; i = j + 1; }
    const fertig = () => { if (block.length) blockLesen(block, kapitel, pfad, notizen); block = []; };
    const ungerade = (t) => (t.match(/%%/g) || []).length % 2 === 1;
    for (; i < zeilen.length; i++) {
      const t = zeilen[i].trim();
      if (zaun) { if (t.startsWith(zaun)) zaun = null; continue; }
      if (kommentar) { if (ungerade(t)) kommentar = false; continue; }
      if (html) { if (t.indexOf("-->") >= 0) html = false; continue; }
      const z = t.match(/^(`{3,}|~{3,})/);
      if (z) { fertig(); zaun = z[1]; continue; }
      if (t.startsWith("%%")) { fertig(); kommentar = ungerade(t); continue; }
      if (t.startsWith("<!--")) { fertig(); html = t.indexOf("-->") < 0; continue; }
      if (!t) { fertig(); continue; }
      const h = t.match(/^#{1,6}\s+(.*)$/);
      if (h) { fertig(); kapitel = h[1].replace(ID_AM_ENDE, "").trim(); continue; }
      block.push({ text: zeilen[i], nr: i });
    }
    fertig();
    return notizen;
  };

  // Vorder- und Rückseite einer Karte (Markdown). Lückentext: aktive Lücke als „[…]“ bzw. hervorgehoben, andere als Text.
  const luecke = (text, nr, offen) => String(text).replace(LUECKE, (m, x, inhalt, hinweis) => {
    if (Number(x) !== nr) return inhalt;
    return offen ? `<span class="eba-lk-loesung">${inhalt}</span>` : `<span class="eba-lk-luecke">[${hinweis ? esc(hinweis) : "…"}]</span>`;
  });
  const seiten = (karte) => {
    const n = karte.notiz;
    if (n.art === "luecke") return { frage: luecke(n.vorne, karte.ord, false), antwort: luecke(n.vorne, karte.ord, true), linie: false };
    return karte.ord === 1 ? { frage: n.hinten, antwort: n.vorne, linie: true } : { frage: n.vorne, antwort: n.hinten, linie: true };
  };
  // Kurzer Klartext für Listen: ohne Markdown, Lücken als Text, Bilder als „[Bild]“
  const klartext = (s) => String(s || "").replace(LUECKE, (m, x, inhalt) => inhalt)
    .replace(/!\[\[[^\]]*\]\]/g, "[Bild]").replace(/!\[[^\]]*\]\([^)]*\)/g, "[Bild]")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "").replace(/[*_~`=$]+/g, "").replace(/\s+/g, " ").trim();
  const rohOhneId = (roh) => { const z = String(roh).split("\n"); z[z.length - 1] = z[z.length - 1].replace(ID_AM_ENDE, ""); return z.join("\n"); };

  // ---------- Kennungen (rein) ----------
  // Fehlende Kennungen anhängen; Kennungen, die einer anderen Notiz gehören (fremd) oder in dieser Notiz doppelt sind, ersetzen.
  // neueId() liefert eine unbenutzte Kennung. Rückgabe { text, neu: Anzahl }.
  const kennungenEinfuegen = (text, pfad, fremd, neueId) => {
    const roh = String(text);
    const nl = roh.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
    const zeilen = roh.replace(/\r\n?/g, "\n").split("\n");
    const gesehen = new Set();
    let neu = 0;
    for (const n of parsen(roh, pfad)) {
      if (n.id && !(fremd && fremd.has(n.id)) && !gesehen.has(n.id)) { gesehen.add(n.id); continue; }
      const id = neueId();
      gesehen.add(id);
      zeilen[n.idZeile] = zeilen[n.idZeile].replace(ID_AM_ENDE, "").replace(/\s+$/, "") + " ^" + id;
      neu++;
    }
    return { text: zeilen.join(nl), neu };
  };
  // Text eines neuen Blocks für „Neue Karte“ (leere Zeilen fallen weg, sonst zerfiele die Karte)
  const karteText = (art, vorne, hinten, id) => {
    const sauber = (s) => String(s || "").replace(/\r\n?/g, "\n").split("\n").map((z) => z.replace(/\s+$/, "")).filter((z) => z.trim()).join("\n");
    const v = sauber(vorne), h = sauber(hinten);
    if (art === "luecke") return v + " ^" + id;
    const einzeilig = v.indexOf("\n") < 0 && h.indexOf("\n") < 0 && !trenner(v) && !trenner(h) && !/^[>|<#]/.test(v);
    if (einzeilig) return `${v} ${art === "umgekehrt" ? ":::" : "::"} ${h} ^${id}`;
    return `${v}\n${art === "umgekehrt" ? "??" : "?"}\n${h} ^${id}`;
  };

  // ---------- Lerngeschichte (rein) ----------
  const zeileLesen = (z) => {
    let e;
    try { e = JSON.parse(z); } catch (x) { return null; }
    if (!e || typeof e.k !== "string" || !e.k || e.k.length > 80 || typeof e.t !== "number" || !isFinite(e.t)) return null;
    if (e.b !== undefined) return [1, 2, 3, 4].indexOf(e.b) >= 0 ? { k: e.k, t: e.t, b: e.b, d: typeof e.d === "number" && e.d > 0 ? Math.min(e.d, STD) : 0 } : null;
    return AKTION.indexOf(e.a) >= 0 ? { k: e.k, t: e.t, a: e.a } : null;
  };
  const zeilenLesen = (text) => {
    const aus = [];
    for (const z of String(text || "").split("\n")) { const e = z.trim() ? zeileLesen(z) : null; if (e) aus.push(e); }
    return aus;
  };
  // Schwierige Karten wie in Anki: beim 8. Fehler (Option), dann bei jedem weiteren halben Schwellenwert
  const schwierigPruefen = (alt, b, neu, o) => {
    if (alt.zustand !== 2 || b !== 1 || !(o.schwierig > 0)) return;
    const ueber = neu.fehler - o.schwierig;
    if (ueber >= 0 && ueber % Math.max(1, Math.ceil(o.schwierig / 2)) === 0) { neu.schwierig = true; if (o.schwierigAussetzen) neu.ausgesetzt = true; }
  };
  const logEintrag = (e, alt, neu, o) => ({ t: e.t, k: e.k, b: e.b, vor: alt.zustand, ivVor: alt.intervall || 0, iv: neu.zustand === 2 ? neu.intervall : 0, d: e.d || 0, tag: tagVon(e.t, o.tagesbeginn) });
  // Alle Ereignisse (nach Zeit sortiert) → Stand je Karte und Bewertungsprotokoll für Statistik und Tageslimits
  const nachspielen = (ereignisse, plan, o) => {
    const stand = new Map(), log = [];
    for (const e of ereignisse) {
      const alt = stand.get(e.k) || plan.leer();
      if (e.b) {
        const neu = plan.bewerten(alt, e.b, e.t, e.k);
        schwierigPruefen(alt, e.b, neu, o);
        stand.set(e.k, neu);
        log.push(logEintrag(e, alt, neu, o));
      } else if (e.a === "aus") stand.set(e.k, Object.assign({}, alt, { ausgesetzt: true }));
      else if (e.a === "an") stand.set(e.k, Object.assign({}, alt, { ausgesetzt: false, schwierig: false }));
      else if (e.a === "neu") stand.set(e.k, plan.leer());
      else if (e.a === "zur") stand.set(e.k, Object.assign({}, alt, { zurueck: tagVon(e.t, o.tagesbeginn) }));
    }
    return { stand, log };
  };

  // ---------- Was heute dran ist (rein): Tageslimits je Stapel (Modul) wie in Anki ----------
  // karten: Auswahl (Reihenfolge der Stapel), extra: { gruppe: zusätzliche neue Karten heute }
  const tagesplan = (karten, stand, log, o, jetzt, extra) => {
    const heute = tagVon(jetzt, o.tagesbeginn);
    const info = new Map(karten.map((k) => [k.schluessel, k]));
    const neuHeute = {}, wdhHeute = {}, gesehen = new Set();
    for (const e of log) {
      if (e.tag !== heute) continue;
      const k = info.get(e.k);
      if (!k) continue;
      if (e.vor === 0) neuHeute[k.gruppe] = (neuHeute[k.gruppe] || 0) + 1;
      else if (e.vor === 2) wdhHeute[k.gruppe] = (wdhHeute[k.gruppe] || 0) + 1;
      gesehen.add(k.nid);
    }
    const lernen = [], spaeter = [], faellig = [], neu = [];
    for (const k of karten) {
      const st = stand.get(k.schluessel);
      if (st && (st.ausgesetzt || st.zurueck === heute)) continue;
      if (lernt(st)) (st.faellig <= jetzt + VORAUS ? lernen : spaeter).push(k);
      else if (st && st.zustand === 2) { if (st.tagFaellig <= heute) faellig.push(k); }
      else neu.push(k);
    }
    const rang = (k) => F().zufall(k.schluessel + ":" + heute);
    faellig.sort((a, b) => stand.get(a.schluessel).tagFaellig - stand.get(b.schluessel).tagFaellig || rang(a) - rang(b));
    if (o.neuReihenfolge === "zufall") neu.sort((a, b) => rang(a) - rang(b));
    lernen.sort((a, b) => stand.get(a.schluessel).faellig - stand.get(b.schluessel).faellig);
    const genommen = new Set();
    const frei = (k) => !o.geschwister || (!gesehen.has(k.nid) && !genommen.has(k.nid));
    const restW = {}, restN = {}, aus = { faellig: [], neu: [] };
    let neuGesperrt = 0;
    for (const k of faellig) {
      if (restW[k.gruppe] === undefined) restW[k.gruppe] = Math.max(0, o.wdh - (wdhHeute[k.gruppe] || 0));
      if (restW[k.gruppe] <= 0 || !frei(k)) continue;
      restW[k.gruppe]--; genommen.add(k.nid); aus.faellig.push(k);
    }
    for (const k of neu) {
      if (restN[k.gruppe] === undefined) restN[k.gruppe] = Math.max(0, o.neu + ((extra && extra[k.gruppe]) || 0) - (neuHeute[k.gruppe] || 0));
      if (!frei(k)) continue;
      if (restN[k.gruppe] <= 0) { neuGesperrt++; continue; }
      restN[k.gruppe]--; genommen.add(k.nid); aus.neu.push(k);
    }
    const zahlen = { neu: aus.neu.length, lernen: lernen.length, faellig: aus.faellig.length };
    return { heute, lernen, spaeter, faellig: aus.faellig, neu: aus.neu, zahlen, neuGesperrt };
  };

  // ---------- Lernrunde (rein) ----------
  const sitzungBauen = (plan, stand) => {
    const karten = new Map();
    for (const k of plan.lernen.concat(plan.spaeter, plan.faellig, plan.neu)) karten.set(k.schluessel, k);
    return {
      neu: plan.neu.map((k) => k.schluessel), faellig: plan.faellig.map((k) => k.schluessel),
      lernen: new Map(plan.lernen.concat(plan.spaeter).map((k) => [k.schluessel, stand.get(k.schluessel).faellig])),
      karten, start: { neu: plan.neu.length, faellig: plan.faellig.length }, gezeigt: { neu: 0, faellig: 0 },
      verlauf: [], gelernt: 0, richtig: 0, zeit: 0, neuGesperrt: plan.neuGesperrt,
    };
  };
  // Nächste Karte: fällige Lernschritte zuerst, sonst Wiederholungen und neue Karten gleichmäßig gemischt, sonst Lernschritte
  // bis 20 Min. im Voraus. Nichts mehr: { fertig, spaeter (ms), anzahl }.
  const naechsteKarte = (s, jetzt) => {
    let erste = null, zeit = Infinity;
    for (const [k, t] of s.lernen) if (t < zeit) { erste = k; zeit = t; }
    if (erste && zeit <= jetzt) return { schluessel: erste, art: "lernen" };
    if (s.neu.length || s.faellig.length) {
      const anteil = s.start.neu / Math.max(1, s.start.neu + s.start.faellig);
      const neuDran = s.neu.length > 0 && (!s.faellig.length || s.gezeigt.neu < Math.round(anteil * (s.gezeigt.neu + s.gezeigt.faellig + 1)));
      return { schluessel: neuDran ? s.neu[0] : s.faellig[0], art: neuDran ? "neu" : "faellig" };
    }
    if (erste && zeit <= jetzt + VORAUS) return { schluessel: erste, art: "lernen" };
    return erste ? { fertig: true, spaeter: zeit, anzahl: s.lernen.size } : { fertig: true };
  };
  // Karte aus den Warteschlangen nehmen; steht sie danach in einem Lernschritt (neu), kommt sie über „lernen“ zurück
  const sitzungNehmen = (s, schluessel, art, neu, zaehlen) => {
    if (art === "neu") { s.neu = s.neu.filter((x) => x !== schluessel); if (zaehlen) s.gezeigt.neu++; }
    else if (art === "faellig") { s.faellig = s.faellig.filter((x) => x !== schluessel); if (zaehlen) s.gezeigt.faellig++; }
    if (neu && lernt(neu) && !neu.ausgesetzt) s.lernen.set(schluessel, neu.faellig);
    else s.lernen.delete(schluessel);
  };
  const sitzungZurueck = (s, v) => {
    if (v.art === "neu") { s.neu.unshift(v.schluessel); if (v.gezaehlt) s.gezeigt.neu--; }
    else if (v.art === "faellig") { s.faellig.unshift(v.schluessel); if (v.gezaehlt) s.gezeigt.faellig--; }
    if (lernt(v.vorher)) s.lernen.set(v.schluessel, v.vorher.faellig);
    else s.lernen.delete(v.schluessel);
  };

  // ---------- Statistik (rein) ----------
  const statistik = (karten, stand, log, o, jetzt) => {
    const heute = tagVon(jetzt, o.tagesbeginn);
    const dabei = new Set(karten.map((k) => k.schluessel));
    const h = { karten: 0, zeit: 0, richtig: 0 }, beh = { richtig: 0, gesamt: 0 };
    for (const e of log) {
      if (!dabei.has(e.k)) continue;
      if (e.tag === heute) { h.karten++; h.zeit += e.d; if (e.b > 1) h.richtig++; }
      if (e.vor === 2 && e.tag <= heute && heute - e.tag < 30) { beh.gesamt++; if (e.b > 1) beh.richtig++; }
    }
    const bestand = { neu: 0, lernen: 0, jung: 0, reif: 0, ausgesetzt: 0 };
    const prognose = [];
    for (let i = 0; i <= 30; i++) prognose.push(0);
    for (const k of karten) {
      const st = stand.get(k.schluessel);
      if (st && st.ausgesetzt) { bestand.ausgesetzt++; continue; }
      if (!st || st.zustand === 0) { bestand.neu++; continue; }
      if (lernt(st)) { bestand.lernen++; const t = tagVon(st.faellig, o.tagesbeginn) - heute; if (t <= 30) prognose[Math.max(0, t)]++; continue; }
      if (st.intervall >= 21) bestand.reif++; else bestand.jung++;
      const t = st.tagFaellig - heute;
      if (t <= 30) prognose[Math.max(0, t)]++;
    }
    return { heute: h, behalten: beh, bestand, prognose, gesamt: karten.length, tag: heute };
  };

  // ---------- Daten: Kartennotizen ----------
  const stapelDateien = () => app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(ORDNER + "/")).sort((a, b) => a.path.localeCompare(b.path));
  const fmVon = (f) => { const c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
  const codeVon = (f) => {
    const c = String(fmVon(f).code || "").trim().toUpperCase();
    if (MODULCODE.test(c)) return c;
    const teile = f.path.slice(ORDNER.length + 1).split("/");
    teile[teile.length - 1] = f.basename;
    for (let i = teile.length - 1; i >= 0; i--) { const m = teile[i].match(CODE_VORN); if (m) return m[1]; }
    return "";
  };
  const modulTitel = (code) => {
    try { const D = ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null; const m = D && D.module.find((x) => x.code === code); if (m) return m.titel; } catch (e) { /* ohne Modell */ }
    return "";
  };

  // ---------- Dateinamen der Stapel: nie gleich dem einer anderen Notiz ----------
  // Hieße der Stapel wie die Modulnotiz („S100 Mathematische …“), wäre jeder Link [[S100 Mathematische …]] mehrdeutig und
  // Obsidian öffnete womöglich den Stapel statt des Moduls. Darum heißt der Stapel eines Moduls „S100 Karteikarten“, weitere
  // „S100 Kapitel 2“; ist ein Name außerhalb von Karteikarten/ schon vergeben, kommt „ (Karteikarten)“ dazu.
  const ZUSATZ = " (Karteikarten)";
  // Rein (Tests): vergeben(name) → Typ der Notiz außerhalb von Karteikarten/, die so heißt („modul“, sonst etwas), oder ""
  const stapelName = (code, zusatz, vergeben) => {
    const z = String(zusatz || "").trim();
    const basis = code ? (z ? `${code} ${z}` : `${code} Karteikarten`) : z;
    return vergeben(basis) ? basis + ZUSATZ : basis;
  };
  // Rein (Tests): neuer Name eines vorhandenen Stapels, dessen Name außerhalb von Karteikarten/ vergeben ist, sonst null.
  // Heißt er wie die Modulnotiz, wird er „<Code> Karteikarten“; frei(name): keine andere Notiz im Tresor heißt so.
  const stapelUmbenennung = (name, code, vergeben, frei) => {
    const typ = vergeben(name);
    if (!typ) return null;
    const wahl = (typ === "modul" && code ? [`${code} Karteikarten`] : []).concat([name + ZUSATZ]);
    for (const n of wahl) if (!vergeben(n) && frei(n)) return n;
    return null;
  };
  // Namen aller Notizen außerhalb von Karteikarten/ (klein geschrieben, wie Obsidian Links auflöst) → Typ („modul“ gewinnt)
  const fremdeNamen = () => {
    const m = new Map();
    for (const f of app.vault.getMarkdownFiles()) {
      if (f.path.startsWith(ORDNER + "/")) continue;
      const k = f.basename.toLowerCase(), typ = String(fmVon(f).typ || "") || "notiz";
      if (!m.has(k) || typ === "modul") m.set(k, typ);
    }
    return (name) => m.get(String(name).toLowerCase()) || "";
  };
  // Einmal beim Start: ältere Stapel, die wie eine andere Notiz heißen, umbenennen (Links ziehen mit, Lernstände hängen an der
  // Kennung und bleiben). Nur der Abrufer der zentralen Daten, damit nicht zwei Geräte zugleich umbenennen.
  const namenPruefen = async () => {
    if (ctx.zentral && typeof ctx.zentral.abruferHier === "function" && !(await ctx.zentral.abruferHier())) return 0;
    const vergeben = fremdeNamen();
    const alle = new Set(app.vault.getMarkdownFiles().map((f) => f.basename.toLowerCase()));
    let n = 0;
    for (const f of stapelDateien()) {
      const neu = stapelUmbenennung(f.basename, codeVon(f), vergeben, (x) => !alle.has(x.toLowerCase()));
      if (!neu) continue;
      const ziel = (f.parent && f.parent.path && f.parent.path !== "/" ? f.parent.path + "/" : "") + neu + ".md";
      await app.fileManager.renameFile(f, ziel);
      alle.add(neu.toLowerCase());
      indexAlt = true;
      n++;
    }
    return n;
  };

  const texte = new Map(); // Pfad → { mtime, size, notizen }
  let index = null, indexAlt = true, indexLaeuft = null;
  const indexLaden = () => {
    if (index && !indexAlt) return Promise.resolve(index);
    if (indexLaeuft) return indexLaeuft;
    indexLaeuft = (async () => {
      indexAlt = false;
      const stapel = [], karten = [], besitzer = new Map();
      for (const f of stapelDateien()) {
        let c = texte.get(f.path);
        if (!c || c.mtime !== f.stat.mtime || c.size !== f.stat.size) {
          let text = "";
          try { text = await app.vault.cachedRead(f); } catch (e) { text = ""; }
          c = { mtime: f.stat.mtime, size: f.stat.size, notizen: parsen(text, f.path) };
          texte.set(f.path, c);
        }
        const code = codeVon(f);
        const st = { pfad: f.path, datei: f, name: f.basename, code, gruppe: code || "datei:" + f.path, karten: [] };
        const hier = new Set();
        for (const n of c.notizen) {
          const doppelt = !!n.id && (hier.has(n.id) || (besitzer.has(n.id) && besitzer.get(n.id) !== f.path));
          if (n.id) { hier.add(n.id); if (!besitzer.has(n.id)) besitzer.set(n.id, f.path); }
          const ersatz = doppelt ? "?" + kurzHash(f.path + "\n" + n.von + "\n" + n.roh) : null;
          for (const k of n.karten) {
            k.schluessel = ersatz ? ersatz + k.suffix : k.basis;
            k.nid = ersatz || (n.id || k.basis.slice(0, k.basis.length - k.suffix.length));
            k.ohneId = !n.id || doppelt;
            k.code = code; k.gruppe = st.gruppe; k.pfad = f.path; k.reihe = karten.length;
            st.karten.push(k); karten.push(k);
          }
        }
        stapel.push(st);
      }
      for (const p of Array.from(texte.keys())) if (!stapel.some((s) => s.pfad === p)) texte.delete(p);
      index = { stapel, karten, nach: new Map(karten.map((k) => [k.schluessel, k])), besitzer };
      return index;
    })().finally(() => { indexLaeuft = null; });
    return indexLaeuft;
  };
  // Gruppen (Module bzw. Stapel ohne Modul) in Anzeigereihenfolge
  const gruppenVon = (idx) => {
    const m = new Map();
    for (const st of idx.stapel) {
      let g = m.get(st.gruppe);
      if (!g) {
        const titel = st.code ? modulTitel(st.code) || st.name.replace(CODE_VORN, "").trim() : st.name;
        g = { gruppe: st.gruppe, code: st.code, titel, stapel: [], karten: [] };
        m.set(st.gruppe, g);
      }
      g.stapel.push(st);
      for (const k of st.karten) g.karten.push(k);
    }
    return Array.from(m.values()).sort((a, b) => (!a.code - !b.code) || (a.code || a.titel).localeCompare(b.code || b.titel));
  };
  // Umfang einer Lernrunde: { gruppe } (Modul oder Stapel ohne Modul), { pfad } (eine Notiz) oder {} (alle)
  const imUmfang = (idx, u) => idx.karten.filter((k) => (u.pfad ? k.pfad === u.pfad : u.gruppe ? k.gruppe === u.gruppe : true));
  const umfangTitel = (idx, u) => {
    if (u.pfad) { const st = idx.stapel.find((s) => s.pfad === u.pfad); return st ? st.name : "Karteikarten"; }
    if (u.gruppe) { const g = gruppenVon(idx).find((x) => x.gruppe === u.gruppe); return g ? (g.code ? `${g.code} · ${g.titel}` : g.titel) : "Karteikarten"; }
    return "Alle Stapel";
  };

  // ---------- Daten: Lernstände (eine Datei je Gerät, nur angehängt) ----------
  const geraet = () => {
    if (ctx.zentral && typeof ctx.zentral.geraetId === "function") return ctx.zentral.geraetId();
    let id = lokal(L.geraet);
    if (!id || typeof id !== "string") {
      const z = new Uint8Array(6);
      crypto.getRandomValues(z);
      id = "g-" + Array.prototype.map.call(z, (x) => x.toString(16).padStart(2, "0")).join("");
      lokal(L.geraet, id);
    }
    return id;
  };
  const eigenerPfad = () => `${DATEN}/${geraet()}.jsonl`;
  const fremdeLogs = new Map(); // Pfad → { mtime, size, eintraege }
  let eigene = null;            // Einträge dieses Geräts (im Speicher, nur dieses Gerät schreibt die Datei)
  let alle = [], logVersion = 0, logsAlt = true, logsLaeuft = null;
  const zusammenfuehren = () => {
    const quellen = [[eigenerPfad(), eigene || []]];
    for (const [p, c] of fremdeLogs) quellen.push([p, c.eintraege]);
    quellen.sort((a, b) => a[0].localeCompare(b[0]));
    const liste = [], gesehen = new Set();
    for (const q of quellen) for (const e of q[1]) {
      const s = e.k + "|" + e.t + "|" + (e.b || e.a);
      if (gesehen.has(s)) continue;
      gesehen.add(s); liste.push(e);
    }
    liste.sort((a, b) => a.t - b.t);
    alle = liste; logVersion++;
  };
  const logsLaden = () => {
    if (!logsAlt && eigene) return Promise.resolve(alle);
    if (logsLaeuft) return logsLaeuft;
    logsLaeuft = (async () => {
      logsAlt = false;
      const ordner = app.vault.getAbstractFileByPath(DATEN);
      const dateien = ordner && ordner.children ? ordner.children.filter((f) => f.extension === "jsonl") : [];
      const pfad = eigenerPfad(), da = new Set();
      for (const f of dateien) {
        da.add(f.path);
        if (f.path === pfad && eigene) continue;
        const c = fremdeLogs.get(f.path);
        if (c && c.mtime === f.stat.mtime && c.size === f.stat.size) continue;
        let text = "";
        try { text = await app.vault.cachedRead(f); } catch (e) { text = ""; }
        if (f.path === pfad) eigene = zeilenLesen(text);
        else fremdeLogs.set(f.path, { mtime: f.stat.mtime, size: f.stat.size, eintraege: zeilenLesen(text) });
      }
      for (const p of Array.from(fremdeLogs.keys())) if (!da.has(p)) fremdeLogs.delete(p);
      if (!eigene) eigene = [];
      zusammenfuehren();
      return alle;
    })().finally(() => { logsLaeuft = null; });
    return logsLaeuft;
  };
  let kette = Promise.resolve();
  const fehlerMelden = (x) => { console.error(SPRACHE, x); ctx.hinweis("Dein Lernstand ließ sich nicht speichern. Bitte noch einmal versuchen."); };
  const anhaengen = (e) => {
    (eigene || (eigene = [])).push(e);
    alle.push(e); logVersion++;
    const zeile = JSON.stringify(e) + "\n";
    kette = kette.then(async () => {
      const pfad = eigenerPfad();
      const f = app.vault.getAbstractFileByPath(pfad);
      if (f) { await app.vault.append(f, zeile); return; }
      if (!app.vault.getAbstractFileByPath(DATEN)) { try { await app.vault.createFolder(DATEN); } catch (x) { /* gibt es schon */ } }
      await app.vault.create(pfad, JSON.stringify({ v: 1, geraet: geraet(), inhalt: "Lernstand der Karteikarten (Studium Autopilot)" }) + "\n" + zeile);
    }).catch(fehlerMelden);
    return kette;
  };
  const zuruecknehmen = (e) => {
    if (eigene) { const i = eigene.lastIndexOf(e); if (i >= 0) eigene.splice(i, 1); }
    const j = alle.lastIndexOf(e);
    if (j >= 0) alle.splice(j, 1);
    logVersion++;
    const zeile = JSON.stringify(e);
    kette = kette.then(async () => {
      const f = app.vault.getAbstractFileByPath(eigenerPfad());
      if (!f) return;
      await app.vault.process(f, (text) => {
        const z = text.split("\n");
        let k = z.length - 1;
        while (k >= 0 && !z[k].trim()) k--;
        if (k >= 0 && z[k].trim() === zeile) z.splice(k, 1);
        return z.join("\n");
      });
    }).catch(fehlerMelden);
    return kette;
  };

  let stand = null, standSig = "";
  const datenLaden = async () => {
    const teile = await Promise.all([indexLaden(), logsLaden()]);
    const o = optionen();
    const sig = signatur(o) + "|" + logVersion;
    if (!stand || sig !== standSig) { stand = nachspielen(alle, planerFuer(o), o); standSig = sig; }
    return { idx: teile[0], o, stand: stand.stand, log: stand.log, jetzt: jetztMs() };
  };
  const extraLesen = (heute) => { const x = lokal(L.extra); return x && x.tag === heute && x.werte ? Object.assign({}, x.werte) : {}; };
  const extraErhoehen = (heute, gruppen) => {
    const w = extraLesen(heute);
    for (const g of gruppen) w[g] = (w[g] || 0) + MEHR_NEU;
    lokal(L.extra, { tag: heute, werte: w });
  };
  const zahlenFuer = (karten, d) => {
    const heute = tagVon(d.jetzt, d.o.tagesbeginn);
    return tagesplan(karten, d.stand, d.log, d.o, d.jetzt, extraLesen(heute));
  };

  // ---------- Schreiben in Kartennotizen ----------
  const neueIdMacher = (vergeben) => () => {
    let id;
    do id = "k" + Math.floor(Math.random() * 2176782336).toString(36).padStart(6, "0"); while (vergeben.has(id));
    vergeben.add(id);
    return id;
  };
  // Kennungen für alle Karten ohne Kennung in den Notizen dieser Karten (beim Start einer Lernrunde)
  const kennungenSetzen = async (karten) => {
    const idx = await indexLaden();
    const pfade = Array.from(new Set(karten.filter((k) => k.ohneId).map((k) => k.pfad)));
    if (!pfade.length) return 0;
    const neueId = neueIdMacher(new Set(idx.besitzer.keys()));
    let n = 0;
    for (const p of pfade) {
      const f = app.vault.getAbstractFileByPath(p);
      if (!f || !O.TFile || !(f instanceof O.TFile)) continue;
      const fremd = new Set();
      for (const [id, wer] of idx.besitzer) if (wer !== p) fremd.add(id);
      await app.vault.process(f, (text) => { const r = kennungenEinfuegen(text, p, fremd, neueId); n += r.neu; return r.text; });
    }
    indexAlt = true;
    return n;
  };
  // Block einer Karte ersetzen (Bearbeiten im Lernfenster); false, wenn sich die Notiz inzwischen geändert hat
  const blockErsetzen = async (karte, neuText) => {
    const n = karte.notiz;
    const f = app.vault.getAbstractFileByPath(karte.pfad);
    if (!f) return false;
    let ok = false;
    await app.vault.process(f, (text) => {
      const nl = text.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
      const zeilen = text.replace(/\r\n?/g, "\n").split("\n");
      if (zeilen.slice(n.von, n.bis + 1).join("\n") !== n.roh) return text;
      let neu = String(neuText).replace(/\r\n?/g, "\n").split("\n").filter((z) => z.trim()).join("\n").trim();
      if (!neu) return text;
      if (n.id) neu = rohOhneId(neu).replace(/\s+$/, "") + " ^" + n.id;
      zeilen.splice.apply(zeilen, [n.von, n.bis - n.von + 1].concat(neu.split("\n")));
      ok = true;
      return zeilen.join(nl);
    });
    indexAlt = true;
    return ok;
  };
  const karteAnhaengen = async (pfad, art, vorne, hinten) => {
    const f = app.vault.getAbstractFileByPath(pfad);
    if (!f) throw new Error("Stapel nicht gefunden");
    const idx = await indexLaden();
    const id = neueIdMacher(new Set(idx.besitzer.keys()))();
    const block = karteText(art, vorne, hinten, id);
    await app.vault.process(f, (text) => text.replace(/\s*$/, "") + "\n\n" + block + "\n");
    indexAlt = true;
    return id;
  };
  // Neuer Stapel: Frontmatter + Text aus System/Gerüste/Karteikarten.md (Platzhalter {{titel}}, erste Zeile = Hinweis)
  const stapelText = async (code, titel) => {
    const g = app.vault.getAbstractFileByPath(GERUEST);
    let koerper = "```eba-karten stapel\n```\n";
    if (g) { try { koerper = (await app.vault.read(g)).replace(/\r\n?/g, "\n").replace(/^<!--[^\n]*-->\n/, ""); } catch (e) { /* Rückfall */ } }
    const fm = ["---", "typ: karteikarten", `code: ${JSON.stringify(code || "")}`, "tags:", "  - karteikarten", "cssclasses:", "  - eba", "  - eba-s-karten-stapel", "---", "", ""];
    return fm.join("\n") + koerper.split("{{titel}}").join(titel).replace(/\s*$/, "\n\n") + (ctx.CURSOR || "");
  };
  // Fenster „Neuer Kartenstapel“ (ctx.formular): Modul (oder ohne) und Name. Ohne Modul braucht der Stapel einen Namen; hat das
  // Modul schon einen Stapel, heißt der weitere nach seinem Namen („B110 Kapitel 2“). Esc legt nichts an.
  const stapelAnlegen = async (c, oeffnen) => {
    const eba = ctx.user.eba(c);
    const vorhanden = (m) => !c.datei && !!m && stapelDateien().some((f) => codeVon(f) === String(m.fm.code || ""));
    const w = typeof ctx.formular === "function" ? await ctx.formular({ titel: "Neuer Kartenstapel", felder: [
      eba.modulFeld({ optional: true }),
      { name: "name", titel: "Name", art: "text", platzhalter: "z. B. Kapitel 2",
        hilfe: (x) => (!x.modul ? "" : vorhanden(x.modul) ? `${x.modul.fm.code} hat schon einen Stapel. Der weitere braucht einen Namen.` : "Leer lassen: Der Stapel heißt wie das Modul.") },
    ], pruefen: (x) => (!x.modul && !x.name ? { feld: "name", fehler: "Bitte einen Namen für den Stapel." }
      : !x.name && vorhanden(x.modul) ? { feld: "name", fehler: "Bitte einen Namen für den weiteren Stapel, z. B. Kapitel 2." } : null) }) : null;
    if (!w) { eba.abbrechen(); return null; }
    const m = w.modul, code = m ? String(m.fm.code || "") : "";
    const vergeben = fremdeNamen();
    let titel = m ? String(m.fm.titel || "") : w.name, name;
    if (!code) name = stapelName("", w.name, vergeben);
    else if (w.name) { name = stapelName(code, w.name, vergeben); titel = `${titel} · ${w.name}`; }
    else name = stapelName(code, "", vergeben);
    const inhalt = await stapelText(code, titel);
    indexAlt = true;
    if (oeffnen) return eba.ablegen(ORDNER, name, inhalt);
    if (!app.vault.getAbstractFileByPath(ORDNER)) { try { await app.vault.createFolder(ORDNER); } catch (e) { /* gibt es schon */ } }
    let pfad = `${ORDNER}/${eba.sauber(name)}.md`;
    for (let i = 2; app.vault.getAbstractFileByPath(pfad); i++) pfad = `${ORDNER}/${eba.sauber(name)} ${i}.md`;
    return app.vault.create(pfad, inhalt.split(ctx.CURSOR || "").join(""));
  };
  const notizZeigen = async (karte) => {
    const f = app.vault.getAbstractFileByPath(karte.pfad);
    if (f && ctx.oeffnen) await ctx.oeffnen(f, { cursor: { line: karte.notiz.von, ch: 0 } });
  };

  // ---------- Anzeige: Hilfen ----------
  // Markdown einer Kartenseite zeichnen (Formeln, Bilder, Links); komp = Component, an dem das Gezeichnete hängt
  const mdRendern = async (md, el, pfad, komp) => {
    if (O.MarkdownRenderer && komp) {
      if (typeof O.MarkdownRenderer.render === "function") await O.MarkdownRenderer.render(app, md, el, pfad, komp);
      else await O.MarkdownRenderer.renderMarkdown(md, el, pfad, komp);
    } else el.setText(md);
  };
  const knopf = (el, fn) => {
    el.addEventListener("mousedown", (e) => e.preventDefault()); // Fokus bleibt im Fenster (Tastenkürzel)
    el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fn(e); });
    return el;
  };
  const menue = (e, eintraege) => {
    if (!O.Menu) return;
    const m = new O.Menu();
    for (const x of eintraege) { if (!x) { m.addSeparator(); continue; } m.addItem((i) => { i.setTitle(x.titel); if (x.symbol) i.setIcon(x.symbol); i.onClick(x.tun); }); }
    if (e && typeof e.clientX === "number" && (e.clientX || e.clientY)) m.showAtMouseEvent(e);
    else { const r = e && e.currentTarget && e.currentTarget.getBoundingClientRect ? e.currentTarget.getBoundingClientRect() : { left: 20, bottom: 60 }; m.showAtPosition({ x: r.left, y: r.bottom }); }
  };
  const intervallText = (k, jetzt) => {
    if (lernt(k)) {
      const m = Math.max(0, Math.round((k.faellig - jetzt) / MIN));
      return m < 1 ? "< 1 Min." : m < 60 ? m + " Min." : m < 1440 ? zahlText(m / 60) + " Std." : tageText(Math.round(m / 1440));
    }
    return tageText(k.intervall);
  };
  const SYMBOL = '<svg class="eba-sym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/></svg>';
  let anzeigeNeu = () => {};

  // ---------- Lernfenster ----------
  let fenster = null; // offenes Lernfenster (Tests: ctx.karten.fenster)
  class Lernfenster extends Fenster {
    constructor(umfang) { super(app); this.umfang = umfang || {}; }
    onOpen() {
      fenster = this;
      this.modalEl.addClass("eba-modal", "eba-lk-fenster");
      this.titleEl.setText("Karteikarten");
      const c = this.contentEl;
      c.empty(); c.addClass("eba-lk");
      this.kopf = c.createDiv({ cls: "eba-lk-kopf" });
      this.flaeche = c.createDiv({ cls: "eba-lk-flaeche" });
      this.fuss = c.createDiv({ cls: "eba-lk-fuss" });
      this.flaeche.createDiv({ cls: "eba-lk-leise", text: "Karten werden geladen …" });
      this.komp = O.Component ? new O.Component() : null;
      if (this.komp) this.komp.load();
      this.modalEl.tabIndex = -1;
      this.modalEl.addEventListener("keydown", (e) => this.taste(e));
      this.starten().catch((e) => { console.error(SPRACHE, e); this.flaeche.empty(); this.flaeche.createDiv({ cls: "eba-lk-leise", text: "Fehler: " + ((e && e.message) || e) }); });
    }
    onClose() {
      if (this.komp) this.komp.unload();
      this.contentEl.empty();
      if (fenster === this) fenster = null;
      anzeigeNeu();
    }
    async starten() {
      this.fertig = false;
      let d = await datenLaden();
      let karten = imUmfang(d.idx, this.umfang);
      if (karten.some((k) => k.ohneId)) { await kennungenSetzen(karten); d = await datenLaden(); karten = imUmfang(d.idx, this.umfang); }
      this.d = d;
      this.plan = planerFuer(d.o);
      this.titleEl.setText(umfangTitel(d.idx, this.umfang));
      this.leer = !karten.length;
      const tp = tagesplan(karten, d.stand, d.log, d.o, d.jetzt, extraLesen(tagVon(d.jetzt, d.o.tagesbeginn)));
      this.s = sitzungBauen(tp, d.stand);
      this.weiter();
      this.modalEl.focus();
    }
    weiter() {
      const n = naechsteKarte(this.s, jetztMs());
      this.zahlenZeigen(n.art);
      if (n.fertig) { this.fertigZeigen(n); return; }
      this.aktuell = { karte: this.s.karten.get(n.schluessel), art: n.art, start: Date.now(), offen: false };
      this.frageZeigen();
    }
    zahlenZeigen(dran) {
      this.kopf.empty();
      const z = this.kopf.createDiv({ cls: "eba-lk-zahlen" });
      for (const [art, name, wert] of [["neu", "Neu", this.s.neu.length], ["lernen", "Lernen", this.s.lernen.size], ["faellig", "Fällig", this.s.faellig.length]]) {
        const x = z.createSpan({ cls: "eba-lk-zahl" + (art === dran ? " dran" : "") });
        x.createSpan({ text: name + " " });
        x.createEl("b", { text: String(wert) });
      }
      const mehr = this.kopf.createEl("button", { cls: "eba-lk-mehr", text: "⋯", attr: { "aria-label": "Mehr", title: "Mehr" } });
      knopf(mehr, (e) => this.menueZeigen(e));
      // Fortschritt der Runde: erledigte Bewertungen gegen das, was noch ansteht (neue Karten zählen mit ihren Lernschritten)
      const s = this.s, offen = s.neu.length * Math.max(1, this.plan.schritte.length + 1) + s.faellig.length + s.lernen.size;
      const anteil = s.gelernt + offen ? s.gelernt / (s.gelernt + offen) : 1;
      const balken = this.kopf.createDiv({ cls: "eba-lk-fortschritt", attr: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(anteil * 100)) } });
      balken.createSpan().style.width = Math.round(anteil * 100) + "%";
    }
    menueZeigen(e) {
      const a = this.aktuell;
      menue(e, [
        { titel: "Rückgängig (Strg+Z)", symbol: "undo-2", tun: () => this.rueckgaengig() },
        a ? { titel: "Bearbeiten (E)", symbol: "pencil", tun: () => this.bearbeiten() } : null,
        a ? { titel: "Bis morgen zurückstellen (-)", symbol: "eye-off", tun: () => this.beiseite("zur") } : null,
        a ? { titel: "Aussetzen (@)", symbol: "pause", tun: () => this.beiseite("aus") } : null,
        a ? { titel: "In der Notiz zeigen", symbol: "file-text", tun: () => { const k = a.karte; this.close(); notizZeigen(k); } } : null,
      ].filter(Boolean));
    }
    rendern(md, el, pfad) { return mdRendern(md, el, pfad, this.kind); }
    async frageZeigen() {
      const a = this.aktuell, k = a.karte;
      if (this.komp && O.Component) { if (this.kind) this.komp.removeChild(this.kind); this.kind = this.komp.addChild(new O.Component()); }
      this.flaeche.empty();
      const kasten = this.flaeche.createDiv({ cls: "eba-lk-karte" });
      const ort = [k.code, k.notiz.kapitel].filter(Boolean).join(" · ");
      if (ort) kasten.createDiv({ cls: "eba-lk-ort", text: ort });
      this.frageEl = kasten.createDiv({ cls: "eba-lk-frage markdown-rendered" });
      this.antwortEl = null;
      this.fuss.empty();
      knopf(this.fuss.createEl("button", { cls: "eba-lk-zeigen mod-cta", text: "Antwort zeigen" }), () => this.antwortZeigen());
      this.tastenHinweis("<kbd>Leertaste</kbd> zeigt die Antwort");
      await this.rendern(seiten(k).frage, this.frageEl, k.pfad);
    }
    async antwortZeigen() {
      const a = this.aktuell;
      if (!a || a.offen) return;
      a.offen = true;
      const s = seiten(a.karte);
      this.knoepfeZeigen();
      if (s.linie) {
        const kasten = this.frageEl.parentElement;
        kasten.createEl("hr", { cls: "eba-lk-linie" });
        this.antwortEl = kasten.createDiv({ cls: "eba-lk-antwort markdown-rendered" });
        await this.rendern(s.antwort, this.antwortEl, a.karte.pfad);
        if (this.antwortEl.scrollIntoView) this.antwortEl.scrollIntoView({ block: "nearest" });
      } else {
        this.frageEl.empty();
        await this.rendern(s.antwort, this.frageEl, a.karte.pfad);
      }
    }
    knoepfeZeigen() {
      const k = this.aktuell.karte, jetzt = jetztMs();
      const v = this.plan.vorschau(this.d.stand.get(k.schluessel) || this.plan.leer(), jetzt, k.schluessel);
      this.fuss.empty();
      const reihe = this.fuss.createDiv({ cls: "eba-lk-bewerten" });
      NAMEN.forEach((name, i) => {
        const b = reihe.createEl("button", { cls: "eba-lk-b b" + (i + 1), attr: { title: `${name} (${i + 1})` } });
        b.createSpan({ cls: "eba-lk-iv", text: intervallText(v[i + 1], jetzt) });
        b.createSpan({ cls: "eba-lk-bn", text: name });
        knopf(b, () => this.bewerten(i + 1));
      });
      this.tastenHinweis("<kbd>1</kbd>–<kbd>4</kbd> bewerten · <kbd>Leertaste</kbd> Gut · <kbd>E</kbd> bearbeiten");
    }
    // Tastenhinweis unter den Knöpfen, nur am Rechner (auf iPhone und iPad gibt es keine Tastatur)
    tastenHinweis(html) {
      if (O.Platform && O.Platform.isMobile) return;
      this.fuss.createEl("p", { cls: "eba-lk-tasten" }).innerHTML = html;
    }
    bewerten(b) {
      const a = this.aktuell;
      if (!a || !a.offen) return;
      const k = a.karte, jetzt = jetztMs(), o = this.d.o;
      const vorher = this.d.stand.get(k.schluessel);
      const alt = vorher || this.plan.leer();
      const neu = this.plan.bewerten(alt, b, jetzt, k.schluessel);
      schwierigPruefen(alt, b, neu, o);
      const e = { k: k.schluessel, t: jetzt, b, d: Math.min(MAX_DAUER, Date.now() - a.start) };
      this.d.stand.set(k.schluessel, neu);
      this.d.log.push(logEintrag(e, alt, neu, o));
      anhaengen(e);
      sitzungNehmen(this.s, k.schluessel, a.art, neu, true);
      this.s.verlauf.push({ e, schluessel: k.schluessel, art: a.art, vorher, karte: k, gezaehlt: true });
      this.s.gelernt++; this.s.zeit += e.d;
      if (b > 1) this.s.richtig++;
      if (neu.ausgesetzt && !alt.ausgesetzt) ctx.hinweis("Diese Karte war oft schwer und ist jetzt ausgesetzt. Du findest sie in der Kartenliste.");
      this.aktuell = null;
      this.weiter();
    }
    beiseite(art) {
      const a = this.aktuell;
      if (!a) return;
      const k = a.karte, jetzt = jetztMs();
      const vorher = this.d.stand.get(k.schluessel);
      const e = { k: k.schluessel, t: jetzt, a: art };
      const neu = Object.assign({}, vorher || this.plan.leer(), art === "aus" ? { ausgesetzt: true } : { zurueck: tagVon(jetzt, this.d.o.tagesbeginn) });
      this.d.stand.set(k.schluessel, neu);
      anhaengen(e);
      sitzungNehmen(this.s, k.schluessel, a.art, null, false);
      this.s.verlauf.push({ e, schluessel: k.schluessel, art: a.art, vorher, karte: k, gezaehlt: false });
      ctx.hinweis(art === "aus" ? "Karte ausgesetzt." : "Karte bis morgen zurückgestellt.", { dauer: 2500 });
      this.aktuell = null;
      this.weiter();
    }
    rueckgaengig() {
      const v = this.s && this.s.verlauf.pop();
      if (!v) { ctx.hinweis("Nichts zum Rückgängigmachen.", { dauer: 2500 }); return; }
      if (v.vorher) this.d.stand.set(v.schluessel, v.vorher); else this.d.stand.delete(v.schluessel);
      if (v.e.b) {
        const l = this.d.log[this.d.log.length - 1];
        if (l && l.t === v.e.t && l.k === v.e.k) this.d.log.pop();
        this.s.gelernt--; this.s.zeit -= v.e.d;
        if (v.e.b > 1) this.s.richtig--;
      }
      sitzungZurueck(this.s, v);
      zuruecknehmen(v.e);
      this.fertig = false;
      this.aktuell = { karte: v.karte, art: v.art, start: Date.now(), offen: false };
      this.zahlenZeigen(v.art);
      this.frageZeigen();
    }
    bearbeiten() {
      const a = this.aktuell;
      if (!a) return;
      const k = a.karte;
      this.flaeche.empty(); this.fuss.empty();
      const feld = this.flaeche.createEl("textarea", { cls: "eba-lk-text", attr: { "aria-label": "Karte bearbeiten", spellcheck: "true" } });
      feld.value = rohOhneId(k.notiz.roh);
      const meldung = this.flaeche.createEl("p", { cls: "eba-lk-leise", text: "Eine Karte je Absatz. Frage :: Antwort, Frage / ? / Antwort oder {{c1::Lücke}}." });
      const reihe = this.fuss.createDiv({ cls: "eba-lk-reihe" });
      knopf(reihe.createEl("button", { text: "Abbrechen" }), () => { a.offen = false; this.frageZeigen(); });
      knopf(reihe.createEl("button", { cls: "mod-cta", text: "Speichern" }), async () => {
        const ok = await blockErsetzen(k, feld.value);
        if (!ok) { meldung.setText("Die Notiz wurde inzwischen geändert. Bitte dort bearbeiten."); meldung.addClass("fehler"); return; }
        const idx = await indexLaden();
        const neu = idx.nach.get(k.schluessel);
        if (neu) { this.s.karten.set(k.schluessel, neu); a.karte = neu; }
        a.offen = false;
        this.frageZeigen();
      });
      setTimeout(() => feld.focus(), 30);
    }
    fertigZeigen(n) {
      this.fertig = true; this.aktuell = null;
      this.flaeche.empty(); this.fuss.empty();
      const box = this.flaeche.createDiv({ cls: "eba-lk-fertig" });
      const s = this.s;
      if (this.leer) {
        box.createEl("h3", { text: "Noch keine Karten" });
        box.createEl("p", { cls: "eba-lk-leise", text: "Lege im Stapel Karten an, dann kannst du hier lernen." });
      } else {
        box.createEl("h3", { text: s.gelernt ? "Geschafft!" : "Für heute fertig" });
        if (s.gelernt) box.createEl("p", { text: `${anzahl(s.gelernt, "Karte", "Karten")} in ${dauerText(s.zeit)}, ${Math.round((s.richtig / s.gelernt) * 100)} % gewusst.` });
        if (n.spaeter) box.createEl("p", { cls: "eba-lk-leise", text: `${anzahl(n.anzahl, "Karte kommt", "Karten kommen")} heute ab ${uhrzeit(n.spaeter)} noch einmal.` });
        else if (!s.gelernt) box.createEl("p", { cls: "eba-lk-leise", text: "Gerade ist nichts fällig." });
      }
      const reihe = this.fuss.createDiv({ cls: "eba-lk-reihe" });
      if (s.neuGesperrt > 0) {
        knopf(reihe.createEl("button", { text: `${MEHR_NEU} neue Karten mehr` }), () => {
          const heute = tagVon(jetztMs(), this.d.o.tagesbeginn);
          const gruppen = this.umfang.gruppe ? [this.umfang.gruppe] : Array.from(new Set(imUmfang(this.d.idx, this.umfang).map((k) => k.gruppe)));
          extraErhoehen(heute, gruppen);
          this.starten().catch((e) => console.error(SPRACHE, e));
        });
      }
      if (this.leer && this.umfang.pfad) knopf(reihe.createEl("button", { text: "Neue Karte" }), () => { this.close(); neuOeffnen(this.umfang.pfad); });
      knopf(reihe.createEl("button", { cls: "mod-cta", text: "Schließen" }), () => this.close());
    }
    taste(e) {
      if (e.target && /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); this.rueckgaengig(); return; }
      if (mod || e.altKey) return;
      const a = this.aktuell;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (this.fertig) this.close();
        else if (a && !a.offen) this.antwortZeigen();
        else if (a) this.bewerten(3);
        return;
      }
      if (!a) return;
      if (/^[1-4]$/.test(e.key)) { e.preventDefault(); if (a.offen) this.bewerten(Number(e.key)); return; }
      if (e.key === "e" || e.key === "E") { e.preventDefault(); this.bearbeiten(); return; }
      if (e.key === "-") { e.preventDefault(); this.beiseite("zur"); return; }
      if (e.key === "@" || e.key === "!") { e.preventDefault(); this.beiseite("aus"); }
    }
  }
  const lernen = (umfang) => new Lernfenster(umfang || {}).open();

  // ---------- Fenster „Neue Karte“ ----------
  let neuFenster = null;
  class NeuFenster extends Fenster {
    constructor(vorwahl) { super(app); this.vorwahl = vorwahl || ""; }
    onOpen() {
      neuFenster = this;
      this.modalEl.addClass("eba-modal", "eba-lk-neu");
      this.titleEl.setText("Neue Karte");
      this.aufbauen().catch((e) => console.error(SPRACHE, e));
    }
    onClose() { this.contentEl.empty(); if (neuFenster === this) neuFenster = null; anzeigeNeu(); }
    async aufbauen() {
      const c = this.contentEl;
      c.empty();
      const idx = await indexLaden();
      const form = c.createDiv({ cls: "eba-form" });
      const zeile = (label) => { const z = form.createDiv({ cls: "eba-form-zeile" }); z.createEl("label", { cls: "eba-form-label", text: label }); return z.createDiv({ cls: "eba-form-feld" }); };
      const stapel = zeile("Stapel").createEl("select", { cls: "dropdown eba-form-auswahl", attr: { "aria-label": "Stapel" } });
      const fuellen = (liste, wahl) => {
        stapel.empty();
        for (const st of liste) stapel.createEl("option", { value: st.pfad, text: st.code && st.name.indexOf(st.code) !== 0 ? `${st.code} · ${st.name}` : st.name });
        stapel.createEl("option", { value: "+", text: "Neuer Stapel …" });
        stapel.value = liste.some((s) => s.pfad === wahl) ? wahl : liste.length ? liste[0].pfad : "+";
      };
      fuellen(idx.stapel, this.vorwahl || lokal(L.letzter) || "");
      const art = zeile("Art").createEl("select", { cls: "dropdown eba-form-auswahl", attr: { "aria-label": "Art" } });
      for (const [w, t] of [["einfach", "Einfach"], ["umgekehrt", "Mit umgekehrter Karte"], ["luecke", "Lückentext"]]) art.createEl("option", { value: w, text: t });
      art.value = lokal("eba-karten-art") || "einfach";
      const zv = form.createDiv({ cls: "eba-form-zeile" });
      const lv = zv.createEl("label", { cls: "eba-form-label", text: "Vorderseite" });
      const vorne = zv.createDiv({ cls: "eba-form-feld" }).createEl("textarea", { cls: "eba-modal-feld eba-lk-eingabe", attr: { rows: "3", "aria-label": "Vorderseite" } });
      const zh = form.createDiv({ cls: "eba-form-zeile" });
      zh.createEl("label", { cls: "eba-form-label", text: "Rückseite" });
      const hinten = zh.createDiv({ cls: "eba-form-feld" }).createEl("textarea", { cls: "eba-modal-feld eba-lk-eingabe", attr: { rows: "3", "aria-label": "Rückseite" } });
      const hilfe = form.createDiv({ cls: "eba-form-hilfe eba-lk-hilfe" });
      const lueckeKnopf = hilfe.createEl("button", { cls: "eba-vb-knopf", text: "Lücke […]" });
      hilfe.createSpan({ text: " Markiere Text und tippe hier (Strg+Umschalt+C). Jede Nummer wird eine Karte." });
      const meldung = c.createEl("p", { cls: "eba-modal-meldung" });
      const k = c.createDiv({ cls: "modal-button-container" });
      const schliessen = k.createEl("button", { text: "Schließen" });
      const hinzu = k.createEl("button", { cls: "mod-cta", text: "Hinzufügen" });
      const artZeigen = () => {
        const l = art.value === "luecke";
        zh.style.display = l ? "none" : "";
        hilfe.style.display = l ? "" : "none";
        lv.setText(l ? "Text" : "Vorderseite");
        lokal("eba-karten-art", art.value);
      };
      art.addEventListener("change", artZeigen);
      artZeigen();
      const lueckeSetzen = () => {
        const t = vorne.value, a = vorne.selectionStart, b = vorne.selectionEnd;
        let max = 0;
        t.replace(LUECKE, (m, x) => { max = Math.max(max, Number(x)); return m; });
        const vor = `{{c${max + 1}::`;
        vorne.value = t.slice(0, a) + vor + t.slice(a, b) + "}}" + t.slice(b);
        vorne.focus();
        vorne.selectionStart = vorne.selectionEnd = b + vor.length + (a === b ? 0 : 2);
      };
      lueckeKnopf.addEventListener("click", (e) => { e.preventDefault(); lueckeSetzen(); });
      vorne.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "c" || e.key === "C")) { e.preventDefault(); lueckeSetzen(); } });
      stapel.addEventListener("change", async () => {
        if (stapel.value !== "+") { lokal(L.letzter, stapel.value); return; }
        const c2 = Object.create(ctx);
        c2.parameter = {}; c2.datei = null; c2.quelle = null;
        const f = await stapelAnlegen(c2, false);
        const neu = await indexLaden();
        fuellen(neu.stapel, f ? f.path : "");
        if (f) lokal(L.letzter, f.path);
      });
      const senden = async () => {
        meldung.setText(""); meldung.className = "eba-modal-meldung";
        const fehler = (t) => { meldung.setText(t); meldung.addClass("fehler"); };
        if (!stapel.value || stapel.value === "+") { fehler("Bitte zuerst einen Stapel wählen oder anlegen."); return; }
        const l = art.value === "luecke";
        if (!vorne.value.trim() || (!l && !hinten.value.trim())) { fehler(l ? "Bitte einen Text mit Lücke eingeben." : "Bitte Vorder- und Rückseite ausfüllen."); return; }
        if (l && !LUECKE_DA.test(vorne.value)) { fehler("Markiere mindestens eine Lücke mit {{c1::…}}."); return; }
        hinzu.disabled = true;
        try {
          await karteAnhaengen(stapel.value, art.value, vorne.value, hinten.value);
          lokal(L.letzter, stapel.value);
          vorne.value = ""; hinten.value = "";
          meldung.setText("Hinzugefügt.");
          vorne.focus();
        } catch (e) { fehler("Nicht gespeichert: " + ((e && e.message) || e)); }
        hinzu.disabled = false;
      };
      this.senden = senden; this.felder = { stapel, art, vorne, hinten, meldung };
      hinzu.addEventListener("click", senden);
      schliessen.addEventListener("click", () => this.close());
      for (const el of [vorne, hinten]) el.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); senden(); } });
      setTimeout(() => vorne.focus(), 30);
    }
  }
  const neuOeffnen = (vorwahl) => new NeuFenster(vorwahl).open();

  // ---------- Fenster „Optionen“ ----------
  class OptionenFenster extends Fenster {
    onOpen() {
      const c = this.contentEl, o = optionen();
      this.modalEl.addClass("eba-modal", "eba-lk-optionen");
      this.titleEl.setText("Lernoptionen");
      const w = { neu: String(o.neu), wdh: String(o.wdh), ziel: Math.round(o.ziel * 100), schritte: o.schritteText, neuSchritte: o.neuSchritteText,
        maxIntervall: String(o.maxIntervall), tagesbeginn: String(o.tagesbeginn), schwierig: String(o.schwierig),
        schwierigAussetzen: o.schwierigAussetzen, geschwister: o.geschwister, neuReihenfolge: o.neuReihenfolge };
      const box = c.createDiv({ cls: "eba-modal-schalter" });
      const S = (name, desc) => { const s = new O.Setting(box).setName(name); if (desc) s.setDesc(desc); return s; };
      const text = (k, name, desc, zahl) => S(name, desc).addText((t) => { t.setValue(w[k]).onChange((v) => { w[k] = v; }); if (zahl) t.inputEl.setAttr("inputmode", "numeric"); });
      text("neu", "Neue Karten pro Tag", "Je Modul.", true);
      text("wdh", "Wiederholungen pro Tag", "Je Modul.", true);
      S("Gewünschte Behaltensquote", "Höher heißt: öfter wiederholen, mehr behalten. 90 % passt für die meisten.")
        .addSlider((s) => s.setLimits(70, 99, 1).setValue(w.ziel).setDynamicTooltip().onChange((v) => { w.ziel = v; }));
      text("schritte", "Lernschritte", "Für neue Karten, z. B. 1m 10m.");
      text("neuSchritte", "Schritte nach einem Fehler", "Z. B. 10m.");
      text("maxIntervall", "Höchstes Intervall (Tage)", "", true);
      S("Neuer Tag beginnt um").addDropdown((dd) => { for (let h = 0; h < 24; h++) dd.addOption(String(h), `${h} Uhr`); dd.setValue(w.tagesbeginn).onChange((v) => { w.tagesbeginn = v; }); });
      S("Neue Karten").addDropdown((dd) => dd.addOption("notiz", "In der Reihenfolge der Notiz").addOption("zufall", "Zufällig").setValue(w.neuReihenfolge).onChange((v) => { w.neuReihenfolge = v; }));
      S("Verwandte Karten verteilen", "Gegenrichtung und andere Lücken derselben Karte nicht am selben Tag.").addToggle((t) => t.setValue(w.geschwister).onChange((v) => { w.geschwister = v; }));
      text("schwierig", "Schwierig ab … Fehlern", "0 = nie.", true);
      S("Schwierige Karten aussetzen", "Sonst bleiben sie nur markiert.").addToggle((t) => t.setValue(w.schwierigAussetzen).onChange((v) => { w.schwierigAussetzen = v; }));
      const k = c.createDiv({ cls: "modal-button-container" });
      k.createEl("button", { text: "Abbrechen" }).addEventListener("click", () => this.close());
      k.createEl("button", { cls: "mod-cta", text: "Speichern" }).addEventListener("click", async () => {
        const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
        if (!f) { ctx.hinweis("Deine Einstellungen fehlen im Tresor. Stell sie aus einer Sicherung wieder her."); return; }
        const z = (v) => { const n = Number(String(v).replace(",", ".")); return isFinite(n) && String(v).trim() !== "" ? n : null; };
        await app.fileManager.processFrontMatter(f, (x) => {
          x[FELD.neu] = z(w.neu); x[FELD.wdh] = z(w.wdh); x[FELD.ziel] = w.ziel / 100;
          x[FELD.schritte] = String(w.schritte).trim(); x[FELD.neuSchritte] = String(w.neuSchritte).trim();
          x[FELD.maxIntervall] = z(w.maxIntervall); x[FELD.tagesbeginn] = Number(w.tagesbeginn); x[FELD.schwierig] = z(w.schwierig);
          x[FELD.schwierigAussetzen] = !!w.schwierigAussetzen; x[FELD.geschwister] = !!w.geschwister; x[FELD.neuReihenfolge] = w.neuReihenfolge;
        });
        this.close();
        ctx.hinweis("Lernoptionen gespeichert.", { dauer: 2500 });
      });
    }
    onClose() { this.contentEl.empty(); anzeigeNeu(); }
  }

  // ---------- Codeblöcke ----------
  const zahlenZelle = (zeile, wert, art) => zeile.createSpan({ cls: "eba-lk-z " + art + (wert ? "" : " null"), text: String(wert) });
  // Mittlere Antwortzeit je Karte aus den letzten Bewertungen (Standard 8 s), für die Schätzung „etwa N Min.“
  const sekundenJeKarte = (log) => {
    const letzte = log.slice(-200).filter((e) => e.d > 0);
    if (letzte.length < 5) return 8;
    return Math.min(60, Math.max(3, letzte.reduce((a, e) => a + e.d, 0) / letzte.length / 1000));
  };
  const dauerSchaetzung = (z, o, log) => {
    const sek = sekundenJeKarte(log) * (z.faellig + z.lernen + z.neu * Math.max(1, o.schritte.length + 1));
    const min = Math.ceil(sek / 60);
    return min < 1 ? "" : min === 1 ? "etwa 1 Min." : `etwa ${min} Min.`;
  };
  let listeBlockZeigen = () => {}; // gesetzt in registrieren(): Kartenliste mit Filter auf eine Gruppe zeigen und hinscrollen

  const uebersichtZeigen = (el, d) => {
    const box = el.createDiv({ cls: "eba-lk-uebersicht" });
    if (!d.idx.stapel.length) {
      const l = box.createDiv({ cls: "eba-angaben leer" });
      l.createSpan({ cls: "eba-angaben-leer", text: "Noch keine Karteikarten." });
      l.createEl("a", { cls: "eba-vb-knopf cta", text: "Neuer Kartenstapel", href: ctx.link("kartenstapel", {}) });
      return;
    }
    const offen = ctx.bleibend("offen", () => new Set());
    const zustand = ctx.bleibend("uebersicht", () => ({ suche: "", ruhigOffen: false }));
    const gruppen = gruppenVon(d.idx).map((g) => Object.assign(g, { z: zahlenFuer(g.karten, d).zahlen }));
    const gesamt = zahlenFuer(d.idx.karten, d).zahlen;
    const faellig = gesamt.faellig + gesamt.lernen;

    // Kopfzeile: was heute ansteht, geschätzte Dauer, ein Knopf für alles
    const summe = box.createDiv({ cls: "eba-lk-summe" + (faellig || gesamt.neu ? "" : " fertig") });
    const st = summe.createDiv({ cls: "eba-lk-summe-text" });
    if (faellig || gesamt.neu) {
      const teile = [];
      if (faellig) teile.push(`${faellig} fällig`);
      if (gesamt.neu) teile.push(`${gesamt.neu} neu`);
      st.createEl("b", { text: teile.join(" · ") });
      const dauer = dauerSchaetzung(gesamt, d.o, d.log);
      const dranZahl = gruppen.filter((g) => g.z.faellig + g.z.lernen + g.z.neu > 0).length;
      st.createSpan({ text: [dauer, dranZahl > 1 ? `${dranZahl} Stapel` : ""].filter(Boolean).join(" · ") });
      summe.createEl("a", { cls: "eba-vb-knopf cta", text: "Alles lernen", href: ctx.link("karten-lernen", {}) });
    } else {
      st.createEl("b", { text: "Für heute fertig" });
      const s7 = statistik(d.idx.karten, d.stand, d.log, d.o, d.jetzt);
      const morgen = s7.prognose[1], woche = s7.prognose.slice(1, 8).reduce((a, x) => a + x, 0);
      st.createSpan({ text: morgen ? `morgen ${anzahl(morgen, "Karte", "Karten")}` : woche ? `in den nächsten 7 Tagen ${anzahl(woche, "Karte", "Karten")}` : "nichts in den nächsten 7 Tagen fällig" });
    }

    // Suche ab 6 Stapeln
    let filter = () => true;
    if (gruppen.length > 5) {
      const suche = box.createEl("input", { type: "search", cls: "eba-lk-suche eba-lk-stapelsuche", attr: { placeholder: "Stapel suchen", "aria-label": "Stapel suchen" } });
      suche.value = zustand.suche;
      suche.addEventListener("input", () => { zustand.suche = suche.value; anzeigeNeu(); });
      const q = zustand.suche.trim().toLowerCase();
      if (q) filter = (g) => (g.code + " " + g.titel + " " + g.stapel.map((x) => x.name).join(" ")).toLowerCase().indexOf(q) >= 0;
    }

    // Jede Zeile hat vorn denselben Platz für den Pfeil (nur Module mit Unterstapeln zeigen ihn), damit alle Namen bündig stehen
    const zeileBauen = (tab, titel, code, karten, z, umfang, kind, extra) => {
      const zeile = tab.createDiv({ cls: "eba-lk-zeile" + (kind ? " kind" : "") + (extra && extra.offen ? " offen" : ""), attr: { role: "button", tabindex: "0", title: `Lernen · ${anzahl(karten.length, "Karte", "Karten")}` } });
      const name = zeile.createSpan({ cls: "eba-lk-name" });
      const slot = name.createSpan({ cls: "eba-lk-slot" });
      if (extra) extra(slot);
      if (code) name.createEl("b", { text: code + " " });
      name.createSpan({ text: titel });
      name.createSpan({ cls: "eba-lk-anz", text: String(karten.length) });
      zahlenZelle(zeile, z.neu, "neu"); zahlenZelle(zeile, z.lernen, "lernen"); zahlenZelle(zeile, z.faellig, "faellig");
      const mehr = zeile.createEl("button", { cls: "eba-lk-mehr", text: "⋯", attr: { "aria-label": "Mehr", title: "Mehr" } });
      const stp = umfang.pfad ? d.idx.stapel.find((x) => x.pfad === umfang.pfad) : null;
      const gruppe = umfang.gruppe || (stp && stp.gruppe);
      mehr.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const stapel = d.idx.stapel.filter((x) => (umfang.pfad ? x.pfad === umfang.pfad : x.gruppe === gruppe));
        menue(e, [
          { titel: "Lernen", symbol: "play", tun: () => lernen(umfang) },
          { titel: "Neue Karte", symbol: "plus", tun: () => neuOeffnen(stapel[0] && stapel[0].pfad) },
          { titel: "Karten anzeigen", symbol: "list", tun: () => listeBlockZeigen(gruppe) },
          { titel: `Heute ${MEHR_NEU} neue Karten mehr`, symbol: "chevrons-up", tun: () => { extraErhoehen(tagVon(jetztMs(), d.o.tagesbeginn), [gruppe]); anzeigeNeu(); } },
        ].concat(stapel.map((x) => ({ titel: stapel.length > 1 ? `Öffnen: ${x.name}` : "Stapel öffnen", symbol: "file-text", tun: () => ctx.oeffnen(x.datei, { modus: "preview" }) }))));
      });
      const los = () => lernen(umfang);
      zeile.addEventListener("click", los);
      zeile.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); los(); } });
      return zeile;
    };
    const tabelle = (eltern, titel) => {
      const tab = eltern.createDiv({ cls: "eba-lk-tabelle" });
      const kopf = tab.createDiv({ cls: "eba-lk-zeile eba-lk-kopfzeile" });
      kopf.createSpan({ cls: "eba-lk-name", text: titel });
      for (const t of ["Neu", "Lernen", "Fällig"]) kopf.createSpan({ cls: "eba-lk-z", text: t });
      kopf.createSpan({ cls: "eba-lk-platz" });
      return tab;
    };
    const gruppeBauen = (tab, g) => {
      const mehrere = g.stapel.length > 1;
      const auf = mehrere && offen.has(g.gruppe);
      const pfeil = (slot) => {
        const t = slot.createEl("button", { cls: "eba-lk-auf" + (auf ? " offen" : ""), text: "▸", attr: { "aria-label": auf ? "Zuklappen" : "Aufklappen", "aria-expanded": String(auf), title: auf ? "Unterstapel ausblenden" : `${g.stapel.length} Unterstapel zeigen` } });
        t.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (offen.has(g.gruppe)) offen.delete(g.gruppe); else offen.add(g.gruppe); anzeigeNeu(); });
      };
      if (mehrere) pfeil.offen = auf;
      zeileBauen(tab, g.titel, g.code, g.karten, g.z, { gruppe: g.gruppe }, false, mehrere ? pfeil : null);
      if (auf) g.stapel.forEach((x, i) => {
        const zeile = zeileBauen(tab, x.name.replace(CODE_VORN, "").trim() || x.name, "", x.karten, zahlenFuer(x.karten, d).zahlen, { pfad: x.pfad }, true, null);
        if (i === g.stapel.length - 1) zeile.addClass("letzte");
      });
    };

    const sichtbar = gruppen.filter(filter);
    const dran = sichtbar.filter((g) => g.z.faellig + g.z.lernen + g.z.neu > 0)
      .sort((a, b) => (b.z.faellig + b.z.lernen) - (a.z.faellig + a.z.lernen) || b.z.neu - a.z.neu || (a.code || a.titel).localeCompare(b.code || b.titel));
    const ruhig = sichtbar.filter((g) => g.z.faellig + g.z.lernen + g.z.neu === 0);
    if (!sichtbar.length) box.createEl("p", { cls: "eba-lk-leise", text: "Kein Stapel passt zur Suche." });
    if (dran.length) { const tab = tabelle(box, "Heute dran"); for (const g of dran) gruppeBauen(tab, g); }
    if (ruhig.length) {
      // Stapel ohne fällige Karten: eingeklappt, damit die Liste bei vielen Modulen kurz bleibt
      const det = box.createEl("details", { cls: "eba-lk-ruhig" });
      if (zustand.ruhigOffen || !dran.length) det.setAttr("open", "");
      det.createEl("summary", { text: `${anzahl(ruhig.length, "Stapel", "Stapel")} ohne fällige Karten` });
      det.addEventListener("toggle", () => { zustand.ruhigOffen = det.open; });
      const tab = tabelle(det, "Stapel");
      for (const g of ruhig) gruppeBauen(tab, g);
    }
    box.createEl("p", { cls: "eba-lk-fusszeile", text: `${anzahl(d.idx.karten.length, "Karte", "Karten")} in ${anzahl(d.idx.stapel.length, "Stapel", "Stapeln")}` });
  };

  const stapelZeigen = (el, d, pfad) => {
    const box = el.createDiv({ cls: "eba-lk-stapel" });
    const st = d.idx.stapel.find((s) => s.pfad === pfad);
    if (!st) { box.createSpan({ cls: "eba-lk-leise", text: "Karten lernst du in Notizen im Ordner Karteikarten." }); return; }
    const z = zahlenFuer(st.karten, d).zahlen;
    const zahlen = box.createDiv({ cls: "eba-lk-zahlen" });
    for (const [name, wert] of [["Neu", z.neu], ["Lernen", z.lernen], ["Fällig", z.faellig]]) { const x = zahlen.createSpan({ cls: "eba-lk-zahl" }); x.createSpan({ text: name + " " }); x.createEl("b", { text: String(wert) }); }
    zahlen.createSpan({ cls: "eba-lk-leise", text: anzahl(st.karten.length, "Karte", "Karten") });
    const knoepfe = box.createDiv({ cls: "eba-vb-knoepfe" });
    knoepfe.createEl("a", { cls: "eba-vb-knopf cta", text: "Lernen", href: ctx.link("karten-lernen", { stapel: st.pfad }) });
    knoepfe.createEl("a", { cls: "eba-vb-knopf", text: "Neue Karte", href: ctx.link("karte-neu", { stapel: st.pfad }) });
    if (st.code && d.idx.stapel.filter((s) => s.gruppe === st.gruppe).length > 1) knoepfe.createEl("a", { cls: "eba-vb-knopf leise", text: "Ganzes Modul lernen", href: ctx.link("karten-lernen", { code: st.code }) });
    if (!st.karten.length) return;
    // Alle Antworten der Leseansicht auf einmal zeigen (Klasse an der Ansicht, gilt auch für Zeilen, die erst beim Scrollen kommen)
    const schalter = knoepfe.createEl("a", { cls: "eba-vb-knopf leise", href: "#", attr: { role: "button" } });
    const ansicht = () => el.closest(".markdown-preview-view");
    const beschriften = () => { const an = !!(ansicht() && ansicht().hasClass("eba-lk-k-alle")); schalter.setText(an ? "Antworten verbergen" : "Antworten zeigen"); schalter.setAttr("aria-pressed", String(an)); };
    schalter.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const v = ansicht();
      if (v) v.toggleClass("eba-lk-k-alle", !v.hasClass("eba-lk-k-alle"));
      beschriften();
    });
    beschriften();
  };

  const heuteZeigen = (el, d) => {
    const z = zahlenFuer(d.idx.karten, d).zahlen;
    const faellig = z.faellig + z.lernen;
    if (!faellig && !z.neu) { el.addClass("eba-lk-aus"); return; }
    el.removeClass("eba-lk-aus");
    const box = el.createDiv({ cls: "eba-lk-heute" });
    box.createSpan({ cls: "eba-uh-symbol" }).innerHTML = SYMBOL;
    const t = box.createSpan({ cls: "eba-lk-heute-text" });
    t.createEl("b", { text: "Karteikarten" });
    t.createSpan({ text: [faellig ? `${faellig} fällig` : "", z.neu ? `${z.neu} neu` : ""].filter(Boolean).join(", ") });
    box.createEl("a", { cls: "eba-vb-knopf cta", text: "Lernen", href: ctx.link("karten-lernen", {}) });
  };

  const statistikZeigen = (el, d) => {
    const box = el.createDiv({ cls: "eba-lk-statistik" });
    const s = statistik(d.idx.karten, d.stand, d.log, d.o, d.jetzt);
    if (!s.gesamt) { box.createSpan({ cls: "eba-lk-leise", text: "Statistik erscheint, sobald du Karten hast." }); return; }
    const kacheln = box.createDiv({ cls: "eba-lk-kacheln" });
    const kachel = (k, v, sub, akzent) => {
      const x = kacheln.createDiv({ cls: "eba-kachel" + (akzent ? " akzent" : "") });
      x.createSpan({ cls: "k", text: k }); x.createSpan({ cls: "v", text: v });
      if (sub) x.createSpan({ cls: "s", text: sub });
    };
    const h = s.heute, b = s.behalten;
    kachel("Heute gelernt", String(h.karten), h.karten ? `${dauerText(h.zeit)} · ${Math.round((h.richtig / h.karten) * 100)} % gewusst` : "", true);
    kachel("Morgen fällig", String(s.prognose[1]), `7 Tage: ${s.prognose.slice(1, 8).reduce((a, x) => a + x, 0)}`);
    kachel("Behalten", b.gesamt ? Math.round((b.richtig / b.gesamt) * 100) + " %" : "–", b.gesamt ? `Ziel ${Math.round(d.o.ziel * 100)} % · 30 Tage` : "noch keine Wiederholungen");
    kachel("Karten", String(s.gesamt), `${s.bestand.neu} neu`);
    // Prognose: eine Reihe, ein Farbton, Wert beim Zeigen oder Antippen eines Balkens
    const p = box.createDiv({ cls: "eba-lk-prognose" });
    const pk = p.createDiv({ cls: "eba-lk-p-kopf" });
    pk.createSpan({ cls: "eba-lk-p-titel", text: "Fällig in den nächsten 30 Tagen" });
    const summe = s.prognose.reduce((a, x) => a + x, 0);
    const anzeige = pk.createSpan({ cls: "eba-lk-p-wert", text: `insgesamt ${summe}` });
    const max = Math.max(1, Math.max.apply(null, s.prognose));
    const flaeche = p.createDiv({ cls: "eba-lk-p-flaeche", attr: { role: "img", "aria-label": `Fällige Karten je Tag, heute ${s.prognose[0]}, morgen ${s.prognose[1]}, in 30 Tagen insgesamt ${summe}` } });
    if (summe) flaeche.createSpan({ cls: "eba-lk-p-max", text: String(max) });
    const balken = flaeche.createDiv({ cls: "eba-lk-p-balken" });
    const tagName = (i) => (i === 0 ? "heute" : i === 1 ? "morgen" : datumText(tagBeginnVon(s.tag + i, d.o.tagesbeginn)));
    s.prognose.forEach((n, i) => {
      const x = balken.createDiv({ cls: "eba-lk-p-b" + (n ? "" : " null") });
      x.createDiv({ cls: "eba-lk-p-saeule" }).style.height = (n ? Math.max(3, Math.round((n / max) * 100)) : 0) + "%";
      const text = `${tagName(i)}${i === 0 ? " (mit überfälligen)" : ""}: ${anzahl(n, "Karte", "Karten")}`;
      x.setAttr("title", text);
      const zeigen = () => { anzeige.setText(text); for (const y of balken.children) y.removeClass("aktiv"); x.addClass("aktiv"); };
      x.addEventListener("pointerenter", zeigen);
      x.addEventListener("click", zeigen);
    });
    balken.addEventListener("pointerleave", () => { anzeige.setText(`insgesamt ${summe}`); for (const y of balken.children) y.removeClass("aktiv"); });
    const achse = p.createDiv({ cls: "eba-lk-p-achse" });
    for (const i of [0, 7, 14, 21, 30]) achse.createSpan({ text: tagName(i), attr: { style: `left: ${((i + 0.5) / 31) * 100}%` } });
    const bs = box.createDiv({ cls: "eba-lk-bestand" });
    for (const [name, wert] of [["Neu", s.bestand.neu], ["Lernen", s.bestand.lernen], ["Jung", s.bestand.jung], ["Reif", s.bestand.reif], ["Ausgesetzt", s.bestand.ausgesetzt]]) {
      const x = bs.createSpan(); x.createSpan({ text: name + " " }); x.createEl("b", { text: String(wert) });
    }
    bs.setAttr("title", "Jung: Intervall unter 21 Tagen, reif: ab 21 Tagen");
  };

  // Status einer Karte für die Liste
  const statusVon = (st, heute) => {
    if (!st || st.zustand === 0) return st && st.ausgesetzt ? { art: "aus", text: "Ausgesetzt" } : { art: "neu", text: "Neu" };
    if (st.ausgesetzt) return { art: "aus", text: st.schwierig ? "Ausgesetzt, schwierig" : "Ausgesetzt" };
    if (st.zurueck === heute) return { art: "zur", text: "Zurückgestellt" };
    if (lernt(st)) return { art: "lernen", text: "Lernen" };
    return st.tagFaellig <= heute ? { art: "faellig", text: "Fällig" } : { art: "wdh", text: "Wiederholung" };
  };
  const STATUS_TON = { neu: "akzent", lernen: "info", faellig: "warn", wdh: "ok", aus: "leer", zur: "leer" };
  const STATUS_LISTE = [["neu", "Neu"], ["lernen", "Lernen"], ["faellig", "Fällig"], ["wdh", "Wiederholung"], ["aus", "Ausgesetzt"], ["schwierig", "Schwierig"]];
  const LISTE_ANFANG = () => ({ q: "", gruppe: "", status: "", sort: "notiz", n: SEITE });
  const listeZeigen = (el, d) => {
    const z = ctx.bleibend("liste", LISTE_ANFANG);
    const box = el.createDiv({ cls: "eba-lk-liste" });
    if (!d.idx.karten.length) { box.createSpan({ cls: "eba-lk-leise", text: "Noch keine Karten." }); return; }
    const heute = tagVon(d.jetzt, d.o.tagesbeginn);
    const gruppen = gruppenVon(d.idx);
    const leiste = box.createDiv({ cls: "eba-lk-filter" });
    const suche = leiste.createEl("input", { type: "search", cls: "eba-lk-suche", attr: { placeholder: "Karten durchsuchen", "aria-label": "Karten durchsuchen" } });
    suche.value = z.q;
    const gw = leiste.createEl("select", { cls: "dropdown", attr: { "aria-label": "Stapel" } });
    gw.createEl("option", { value: "", text: "Alle Stapel" });
    for (const g of gruppen) gw.createEl("option", { value: g.gruppe, text: g.code ? `${g.code} · ${g.titel}` : g.titel });
    gw.value = gruppen.some((g) => g.gruppe === z.gruppe) ? z.gruppe : "";
    const sw = leiste.createEl("select", { cls: "dropdown", attr: { "aria-label": "Status" } });
    const so = leiste.createEl("select", { cls: "dropdown", attr: { "aria-label": "Sortierung" } });
    for (const [w, t] of [["notiz", "Wie in der Notiz"], ["faellig", "Nach Fälligkeit"], ["fehler", "Meiste Fehler zuerst"]]) so.createEl("option", { value: w, text: t });
    so.value = z.sort;
    const liste = box.createDiv({ cls: "eba-lk-zeilen" });
    const fuss = box.createDiv({ cls: "eba-lk-fusszeile" });
    const zeichnenListe = () => {
      liste.empty(); fuss.empty();
      const q = z.q.trim().toLowerCase();
      // Erst Stapel und Suche, dann Status: so zeigt die Status-Auswahl die Anzahl je Status zur aktuellen Auswahl
      const vorauswahl = d.idx.karten.filter((k) => (!z.gruppe || k.gruppe === z.gruppe) && (!q || (k.notiz.vorne + " " + k.notiz.hinten).toLowerCase().indexOf(q) >= 0));
      const zaehler = {};
      for (const k of vorauswahl) {
        const st = d.stand.get(k.schluessel), art = statusVon(st, heute).art;
        zaehler[art] = (zaehler[art] || 0) + 1;
        if (st && st.schwierig) zaehler.schwierig = (zaehler.schwierig || 0) + 1;
      }
      sw.empty();
      sw.createEl("option", { value: "", text: `Alle (${vorauswahl.length})` });
      for (const [w, t] of STATUS_LISTE) sw.createEl("option", { value: w, text: `${t} (${zaehler[w] || 0})` });
      sw.value = z.status;
      const treffer = vorauswahl.filter((k) => {
        const st = d.stand.get(k.schluessel);
        if (z.status === "schwierig") return !!(st && st.schwierig);
        return !z.status || statusVon(st, heute).art === z.status;
      });
      const faelligTag = (k) => { const st = d.stand.get(k.schluessel); return !st || st.zustand === 0 ? 1e9 : st.ausgesetzt ? 2e9 : lernt(st) ? tagVon(st.faellig, d.o.tagesbeginn) - 0.5 : st.tagFaellig; };
      if (z.sort === "faellig") treffer.sort((a, b) => faelligTag(a) - faelligTag(b) || a.reihe - b.reihe);
      else if (z.sort === "fehler") treffer.sort((a, b) => ((d.stand.get(b.schluessel) || {}).fehler || 0) - ((d.stand.get(a.schluessel) || {}).fehler || 0) || a.reihe - b.reihe);
      const jeGruppe = {};
      for (const k of treffer) jeGruppe[k.gruppe] = (jeGruppe[k.gruppe] || 0) + 1;
      let letzteGruppe = null;
      for (const k of treffer.slice(0, z.n)) {
        if (!z.gruppe && z.sort === "notiz" && k.gruppe !== letzteGruppe) {
          letzteGruppe = k.gruppe;
          const g = gruppen.find((x) => x.gruppe === k.gruppe);
          const kopf = liste.createDiv({ cls: "eba-lk-gruppe" });
          kopf.createSpan({ text: g ? (g.code ? `${g.code} ${g.titel}` : g.titel) : k.gruppe });
          kopf.createSpan({ cls: "eba-lk-anz", text: String(jeGruppe[k.gruppe]) });
        }
        const st = d.stand.get(k.schluessel), status = statusVon(st, heute), s = seiten(k);
        const zeile = liste.createDiv({ cls: "eba-lk-eintrag", attr: { role: "button", tabindex: "0" } });
        const vorne = klartext(s.frage);
        const oben = zeile.createDiv({ cls: "eba-lk-eintrag-kopf" });
        oben.createDiv({ cls: "eba-lk-vorne", text: vorne.length > 140 ? vorne.slice(0, 139) + "…" : vorne || "–" });
        oben.createSpan({ cls: "eba-pill " + (STATUS_TON[status.art] || "leer"), text: st && st.schwierig && !st.ausgesetzt ? "Schwierig" : status.text });
        const meta = [];
        if (z.gruppe || z.sort !== "notiz") meta.push(k.code || k.pfad.split("/").pop().replace(/\.md$/, ""));
        if (k.notiz.kapitel) meta.push(k.notiz.kapitel);
        if (st && st.zustand === 2 && !st.ausgesetzt) meta.push("fällig " + (st.tagFaellig <= heute ? "heute" : datumText(tagBeginnVon(st.tagFaellig, d.o.tagesbeginn))), "Intervall " + tageText(st.intervall));
        if (st && st.fehler) meta.push(anzahl(st.fehler, "Fehler", "Fehler"));
        if (k.notiz.art === "luecke") meta.push("Lücke " + k.ord);
        else if (k.ord === 1) meta.push("umgekehrt");
        zeile.createDiv({ cls: "eba-lk-meta", text: meta.join(" · ") });
        const handeln = (e) => {
          const aktion = (a, text) => async () => {
            let ziel = k;
            if (k.ohneId) {
              await kennungenSetzen([k]);
              const idx = await indexLaden();
              ziel = idx.karten.find((x) => x.pfad === k.pfad && x.notiz.von === k.notiz.von && x.ord === k.ord) || null;
              if (!ziel) return;
            }
            // Sofort, mit „Rückgängig“ im Hinweis (nimmt genau diesen Eintrag aus dem Lernstand), keine Rückfrage
            const eintrag = { k: ziel.schluessel, t: jetztMs(), a };
            anhaengen(eintrag);
            ctx.hinweis(text, { aktion: { text: "Rückgängig", ausfuehren: () => { zuruecknehmen(eintrag); anzeigeNeu(); } } });
            anzeigeNeu();
          };
          menue(e, [
            { titel: "In der Notiz zeigen", symbol: "file-text", tun: () => notizZeigen(k) },
            st && st.ausgesetzt ? { titel: "Fortsetzen", symbol: "play", tun: aktion("an", "Karte fortgesetzt.") } : { titel: "Aussetzen", symbol: "pause", tun: aktion("aus", "Karte ausgesetzt.") },
            { titel: "Bis morgen zurückstellen", symbol: "eye-off", tun: aktion("zur", "Karte bis morgen zurückgestellt.") },
            st && st.wdh ? { titel: "Als neu zurücksetzen", symbol: "rotate-ccw", tun: aktion("neu", "Karte zurückgesetzt, du lernst sie wieder als neu.") } : null,
          ].filter(Boolean));
        };
        zeile.addEventListener("click", handeln);
        zeile.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); handeln(e); } });
      }
      if (!treffer.length) liste.createDiv({ cls: "eba-lk-leise eba-lk-leer", text: "Keine Karte passt zur Auswahl." });
      fuss.setText(treffer.length > z.n ? `${z.n} von ${treffer.length} Karten` : anzahl(treffer.length, "Karte", "Karten"));
      if (treffer.length > z.n) {
        fuss.appendText(" · ");
        const m = fuss.createEl("a", { text: `${Math.min(SEITE, treffer.length - z.n)} weitere`, href: "#" });
        m.addEventListener("click", (e) => { e.preventDefault(); z.n += SEITE; zeichnenListe(); });
        fuss.appendText(" · ");
        const alle = fuss.createEl("a", { text: "Alle anzeigen", href: "#" });
        alle.addEventListener("click", (e) => { e.preventDefault(); z.n = treffer.length; zeichnenListe(); });
      }
    };
    const neuFiltern = () => { z.n = SEITE; zeichnenListe(); };
    suche.addEventListener("input", () => { z.q = suche.value; neuFiltern(); });
    gw.addEventListener("change", () => { z.gruppe = gw.value; neuFiltern(); });
    sw.addEventListener("change", () => { z.status = sw.value; neuFiltern(); });
    so.addEventListener("change", () => { z.sort = so.value; neuFiltern(); });
    zeichnenListe();
  };

  // ---------- Leseansicht einer Kartennotiz: jede Karte eine ruhige Zeile, die Antwort erst beim Antippen ----------
  // Rein (Tests): Karten eines Abschnitts der Leseansicht (Zeilen von–bis). notizen = parsen(ganzer Text), zeilen = alle Zeilen.
  // → { karten: Notizen, die hier beginnen; weiter: nur der Rest einer Karte von weiter oben } oder null, wenn im Abschnitt
  // auch anderer Text steht (dann bleibt er, wie Obsidian ihn zeichnet).
  const abschnittKarten = (notizen, zeilen, von, bis) => {
    const drin = notizen.filter((n) => n.bis >= von && n.von <= bis);
    if (!drin.length) return null;
    for (let i = von; i <= bis; i++) if (String(zeilen[i] || "").trim() && !drin.some((n) => n.von <= i && i <= n.bis)) return null;
    const karten = drin.filter((n) => n.von >= von);
    return { karten, weiter: !karten.length };
  };
  // Rein (Tests): Markdown der Zeile. Lückentext: jede Lücke als „[…]“ (oder Hinweis) und daneben die Lösung, das CSS zeigt
  // je nach Zustand eins von beiden. Sonst Vorder- und Rückseite wie geschrieben.
  const zeilenSeiten = (n) => (n.art === "luecke"
    ? { vorne: String(n.vorne).replace(LUECKE, (m, x, inhalt, hinweis) => `<span class="eba-lk-k-l"><span class="eba-lk-luecke">[${hinweis ? esc(hinweis) : "…"}]</span><span class="eba-lk-loesung">${inhalt}</span></span>`), hinten: "" }
    : { vorne: n.vorne, hinten: n.hinten });
  const karteZeile = (eltern, n, pfad, komp) => {
    const s = zeilenSeiten(n);
    const z = eltern.createDiv({ cls: "eba-lk-k" + (n.art === "luecke" ? " luecke" : ""), attr: { role: "button", tabindex: "0", "aria-expanded": "false" } });
    const inhalt = z.createDiv({ cls: "eba-lk-k-inhalt" });
    const vorne = inhalt.createDiv({ cls: "eba-lk-k-seite eba-lk-k-vorne" });
    const hinten = s.hinten ? inhalt.createDiv({ cls: "eba-lk-k-seite eba-lk-k-hinten" }) : null;
    if (n.art === "umgekehrt") z.createSpan({ cls: "eba-lk-k-beide", text: "⇄", attr: { title: "Wird auch umgekehrt gelernt", "aria-label": "auch umgekehrt" } });
    z.createSpan({ cls: "eba-lk-k-pfeil", text: "›", attr: { "aria-hidden": "true" } });
    const fehler = (e) => console.error(SPRACHE, e);
    mdRendern(s.vorne, vorne, pfad, komp).catch(fehler);
    if (hinten) mdRendern(s.hinten, hinten, pfad, komp).catch(fehler);
    const umschalten = () => { const auf = !z.hasClass("offen"); z.toggleClass("offen", auf); z.setAttr("aria-expanded", String(auf)); };
    z.addEventListener("click", (e) => {
      const sel = z.win && z.win.getSelection ? z.win.getSelection() : null;
      if (e.target.closest("a, button, input, textarea") || (sel && !sel.isCollapsed)) return; // Links öffnen, Text markieren
      umschalten();
    });
    z.addEventListener("keydown", (e) => { if (e.target === z && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); umschalten(); } });
  };
  // Der ganze Text wird einmal je Fassung gelesen, nicht für jeden Abschnitt neu
  let gelesen = { text: null, notizen: [], zeilen: [] };
  const kartenZeilen = (el, c) => {
    const info = c.getSectionInfo ? c.getSectionInfo(el) : null;
    if (!info || typeof info.text !== "string") return false;
    if (gelesen.text !== info.text) gelesen = { text: info.text, notizen: parsen(info.text, c.sourcePath), zeilen: info.text.replace(/\r\n?/g, "\n").split("\n") };
    const a = abschnittKarten(gelesen.notizen, gelesen.zeilen, info.lineStart, info.lineEnd);
    if (!a) return false;
    el.empty();
    el.addClass("eba-lk-k-abschnitt");
    if (a.weiter) { el.addClass("eba-lk-k-weiter"); return true; }
    let komp = null;
    if (O.MarkdownRenderChild && c.addChild) { komp = new O.MarkdownRenderChild(el); c.addChild(komp); }
    for (const n of a.karten) karteZeile(el, n, c.sourcePath, komp);
    return true;
  };

  // Rückfall ohne Abschnitt (z. B. Lernfenster): Trenner und Lücken sichtbar machen (nur Text, Code und Formeln bleiben)
  const SCHMUCK = /\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}|\s*(:{2,3})(?!:)\s*/g;
  const schmuecken = (el) => {
    const doc = el.ownerDocument;
    const gang = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const knoten = [];
    for (let n = gang.nextNode(); n; n = gang.nextNode()) knoten.push(n);
    for (const t of knoten) {
      const eltern = t.parentElement, s = t.nodeValue || "";
      if (!eltern || eltern.closest("code, pre, .math, .eba-lk-l, .eba-lk-trenner, .block-language-eba-karten")) continue;
      // Zeile nur mit „?“ oder „??“ zwischen Frage und Antwort
      if (/^\s*\?\??\s*$/.test(s) && t.previousSibling && t.previousSibling.nodeName === "BR") {
        const sp = doc.createElement("span");
        sp.className = "eba-lk-trenner zeile" + (s.trim() === "??" ? " beide" : "");
        sp.textContent = s.trim() === "??" ? "⇅" : "↓";
        eltern.replaceChild(sp, t);
        continue;
      }
      if (s.indexOf("::") < 0) continue;
      const frag = doc.createDocumentFragment();
      let pos = 0, m;
      SCHMUCK.lastIndex = 0;
      while ((m = SCHMUCK.exec(s))) {
        if (m.index > pos) frag.appendChild(doc.createTextNode(s.slice(pos, m.index)));
        const sp = doc.createElement("span");
        if (m[2]) { sp.className = "eba-lk-trenner" + (m[2].length === 3 ? " beide" : ""); sp.textContent = m[2].length === 3 ? " ⇄ " : " → "; }
        else { sp.className = "eba-lk-l"; sp.textContent = m[1]; }
        frag.appendChild(sp);
        pos = m.index + m[0].length;
      }
      if (!pos) continue;
      if (pos < s.length) frag.appendChild(doc.createTextNode(s.slice(pos)));
      eltern.replaceChild(frag, t);
    }
  };

  const zeichnen = async (el, art, pfad) => {
    const d = await datenLaden();
    el.empty();
    if (art === "statistik") statistikZeigen(el, d);
    else if (art === "liste") listeZeigen(el, d);
    else if (art === "heute") heuteZeigen(el, d);
    else if (art === "stapel") stapelZeigen(el, d, pfad);
    else uebersichtZeigen(el, d);
  };
  // Art des Blocks: Argument in der Kopfzeile; Rückfall (Argument beim Neuzeichnen nicht lesbar) über Ort und Ersatztext
  const artVon = (quelle, el, c) => {
    let art = ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, SPRACHE, ARTEN, "uebersicht") : "uebersicht";
    if (art !== "uebersicht") return art;
    const pfad = (c && c.sourcePath) || "", q = String(quelle || "");
    if (pfad.startsWith(ORDNER + "/")) art = "stapel";
    else if (/statistik/i.test(q)) art = "statistik";
    else if (/alle karten/i.test(q)) art = "liste";
    else if (/fällig/i.test(q)) art = "heute";
    return art;
  };

  const AKTIONEN = {
    "karten-lernen": {
      titel: "Karteikarten lernen",
      ausfuehren: async (c) => {
        const p = c.parameter || {};
        const q = c.quelle && c.quelle.path && c.quelle.path.startsWith(ORDNER + "/") ? c.quelle.path : "";
        lernen(p.stapel ? { pfad: p.stapel } : p.code ? { gruppe: p.code } : q ? { pfad: q } : {});
      },
    },
    "karte-neu": {
      titel: "Neue Karte",
      ausfuehren: async (c) => {
        const p = c.parameter || {};
        neuOeffnen(p.stapel || (c.quelle && c.quelle.path && c.quelle.path.startsWith(ORDNER + "/") ? c.quelle.path : ""));
      },
    },
    kartenstapel: { titel: "Neuer Kartenstapel", ordner: [ORDNER], ausfuehren: async (c) => stapelAnlegen(c, true) },
    "karten-optionen": { titel: "Lernoptionen", ausfuehren: async () => new OptionenFenster(app).open() },
  };

  const registrieren = () => {
    const block = ctx.codeblock(SPRACHE, (quelle, el, c, inst) => {
      inst.art = artVon(quelle, el, c);
      const pfad = (c && c.sourcePath) || "";
      return zeichnen(el, inst.art, pfad).catch((e) => { console.error(SPRACHE, e); el.empty(); el.createDiv({ cls: "sa-block-fehler", text: `${SPRACHE}: ${(e && e.message) || e}` }); });
    });
    anzeigeNeu = ctx.entprellen(() => block.neu(), 400);
    // „Karten anzeigen“ aus dem Stapel-Menü: Kartenliste auf die Gruppe stellen, neu zeichnen, hinscrollen
    listeBlockZeigen = (gruppe) => {
      const z = ctx.bleibend("liste", LISTE_ANFANG);
      z.gruppe = gruppe || ""; z.status = ""; z.n = SEITE;
      block.neu((i) => i.art === "liste");
      const inst = block.instanzen().find((i) => i.art === "liste" && i.el.offsetParent);
      if (inst) inst.el.scrollIntoView({ block: "start", behavior: "smooth" });
      else ctx.hinweis("Die Kartenliste steht auf der Seite Karteikarten.", { dauer: 3000 });
    };
    const geaendert = (f, alt) => {
      const p = String((f && f.path) || ""), a = String(alt || "");
      const karten = p.startsWith(ORDNER + "/") || a.startsWith(ORDNER + "/");
      const logs = (p.startsWith(DATEN + "/") || a.startsWith(DATEN + "/")) && p !== eigenerPfad();
      if (karten) indexAlt = true;
      if (logs) logsAlt = true;
      if (karten || logs) anzeigeNeu();
    };
    for (const n of ["modify", "create", "delete"]) ctx.an(app.vault, n, (f) => geaendert(f));
    ctx.an(app.vault, "rename", (f, alt) => geaendert(f, alt));
    ctx.an(app.metadataCache, "changed", (f) => {
      if (f && f.path === EINSTELLUNGEN) anzeigeNeu();
      else if (f && f.path && f.path.startsWith(ORDNER + "/")) { indexAlt = true; anzeigeNeu(); }
    });
    // Lernschritte werden fällig und um 4 Uhr beginnt ein neuer Tag: Zahlen alle 5 Minuten neu (die Kartenliste nicht)
    ctx.intervall(() => block.neu((i) => i.art !== "liste"), 5 * MIN);
    ctx.postprozessor((el, c) => {
      if (!c || !c.sourcePath || !c.sourcePath.startsWith(ORDNER + "/") || el.closest(".eba-lk-k-seite")) return; // nie in den eigenen Zeilen
      if (!kartenZeilen(el, c)) schmuecken(el);
    });
  };

  ctx.karten = { lernen, neuOeffnen, datenLaden, namenPruefen, get fenster() { return fenster; }, get neuFenster() { return neuFenster; } };

  // Einmal beim App-Start, wenn der metadataCache fertig ist: Stapel mit dem Namen einer anderen Notiz umbenennen
  const start = () => {
    const los = () => ctx.zeit(() => {
      namenPruefen().then((n) => { if (n) { anzeigeNeu(); ctx.hinweis(`${n} Karteikarten-Stapel umbenannt, damit Links aufs Modul eindeutig sind.`); } })
        .catch((e) => console.error(SPRACHE + ": namenPruefen", e));
    }, 5000);
    if (app.metadataCache.resolved) los();
    else { const r = ctx.an(app.metadataCache, "resolved", () => { app.metadataCache.offref(r); los(); }); }
  };

  return {
    registrieren, start, aktionen: AKTIONEN,
    // rein, für Tests (tests/karten.test.js)
    parsen, trenner, seiten, luecke, klartext, kennungenEinfuegen, karteText, zeileLesen, zeilenLesen, nachspielen, tagesplan,
    sitzungBauen, naechsteKarte, sitzungNehmen, sitzungZurueck, statistik, optionenAus, tagVon, tagBeginnVon, planerFuer, statusVon,
    stapelName, stapelUmbenennung, abschnittKarten, zeilenSeiten,
  };
};
