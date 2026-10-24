// „Seit deinem letzten Besuch“ (seit 0.6.0, Plan 25.1 Punkt 4): eine Karte auf dem Dashboard,
// Codeblock ```eba-seit-besuch```, Titel „3 Änderungen seit deinem letzten Besuch“ (eingeklappt, ein Tipp klappt auf). Sie zeigt,
// was sich von selbst geändert hat, je Zeile mit Ziel zum Antippen, unten der Knopf „Alles gesehen“. Ohne Änderungen zeichnet der
// Block nichts (Klasse eba-sb-aus, samt Hülle auf Höhe 0 gefaltet wie „Bitte prüfen“, eba-core.css Abschnitt 68).
// Gesehen von selbst (seit 0.6.2): Was aufgeklappt in der Karte stand, merkt sich das Gerät (ANGEZEIGT) und trägt es als gesehen
// ein, sobald der Besuch vorbei ist: beim nächsten Zeichnen des Blocks (Dashboard wieder geöffnet, auch nach einem Neustart), wenn
// Obsidian in den Hintergrund geht oder ein Tab ohne die Karte aktiv wird. Vorher blieb jede Zeile stehen, bis jemand „Alles
// gesehen“ in der eingeklappten Karte fand; der Knopf bleibt als Abkürzung.
//
// Quellen:
// - Zentrale Termine (zentral.js): Nur hier geht der alte Wert beim Schreiben verloren, darum das Protokoll. Der Abrufer meldet
//   je Lauf neue, geänderte (Datum, Ende, Ort mit Uhrzeit, Titel; „geschätzt“ → „offiziell“ als „bestätigt“), wieder geltende und
//   abgesagte Termine (zentral). Nie ein Eintrag: der erste Lauf eines Tresors (nichts angewendet), Termine, die nur durch deine
//   Auswahl dazukommen oder wegfallen (id war schon in den Daten des letzten Laufs), ohne Daten des letzten Laufs gar kein „neu“,
//   Termine, die schon vorbei sind, und Felder wie Quelle, Info oder Tags. Höchstens MAX_LAUF Einträge je Lauf, dann eine
//   Sammelzeile. Der Schlüssel enthält alten und neuen Stand (hin und zurück sind zwei Änderungen); je Termin zeigt die Karte nur
//   die neueste Meldung.
// - Abgeleitet, ohne Protokoll (kein zweiter Schreiber): Ausfälle, Raum- und Zeitänderungen deines Stundenplans in den nächsten
//   VORAUS Tagen (ctx.modell.findetStatt, wie das Wochenraster), neue Abgaben aus dem ILIAS-Kalender (herkunft ilias-kalender,
//   noch offen, nicht vorbei) und neue oder aktualisierte ILIAS-Dateien der letzten ILIAS_TAGE Tage aus dem Index
//   System/Daten/ilias.json, je Modul eine Zeile; ohne die Dateien vom ersten Tag eines Kurses (erstes Laden ist keine Änderung).
//
// Speicher (synchronisiert, Ordner ORDNER):
// - <Geräte-ID>.json: { version: 1, eintraege: [{ k, t, q, art, id, titel, datum, code, aenderung: [{ feld, alt, neu }] }] }. Jedes
//   Gerät schreibt nur seine eigene Datei (Geräte-ID aus zentral.js), die Karte liest alle: Zwei Geräte, die abwechselnd
//   abrufen, überschreiben sich nie. Gleiche Änderung von zwei Geräten = gleicher Schlüssel k, steht einmal da. Beim Lesen und
//   beim Schreiben gilt dieselbe Regel: Einträge älter als TAGE zählen nicht, höchstens MAX_GERAET je Datei.
// - gesehen-<Geräte-ID>.json: { version: 1, gesehen: { <k>: <ISO-Datum> } }. Auch hier schreibt jedes Gerät nur seine Datei
//   (zwei Geräte, die vor dem Sync tippen, verlieren nichts), gelesen wird die Vereinigung aller: gesehen gilt auf allen Geräten.
//   Nie eine Uhrzeit „gesehen bis“ (ein Eintrag, der erst später ankommt, wäre sonst für immer verborgen), sondern genau die
//   Schlüssel, die aufgeklappt angezeigt waren. Schlüssel älter als GESEHEN_TAGE fallen weg.
// - ANGEZEIGT (app.saveLocalStorage, nur dieses Gerät): Schlüssel, die aufgeklappt angezeigt und noch nicht eingetragen sind.
//   Im Gerätespeicher statt im Arbeitsspeicher, damit ein von iOS beendetes Obsidian sie beim nächsten Start nachträgt.
// Kein Pfad im Protokoll (Notizen werden umbenannt): Das Ziel wird beim Zeichnen über zentral_id aufgelöst; fehlt die Notiz,
// steht die Zeile ohne Ziel da. Nichts hiervon kommt ins Release, in Updates oder den Test-Tresor (release.py, pruefen.py).
// Erweiterung: registrieren() meldet Codeblock und Ereignisse über die Helfer in ctx an (Hot-Reload ohne Neustart).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const ORDNER = "System/Daten/seit-besuch";
const GESEHEN = "gesehen-"; // Namensanfang der Dateien „gesehen“ in ORDNER
const ANGEZEIGT = "eba-seit-besuch-angezeigt"; // Gerätespeicher: aufgeklappt gesehen, noch nicht eingetragen
const ILIAS_INDEX = "System/Daten/ilias.json";
const TAGE = 60;          // Aufbewahrung der Einträge im Protokoll
const ILIAS_TAGE = 30;    // ILIAS-Dateien, die so lange neu oder aktualisiert sind
const VORAUS = 14;        // Stundenplan: Ausfälle und Änderungen ab heute
const MAX_LAUF = 30;      // Einträge je Abruf, darüber eine Sammelzeile
const MAX_GERAET = 500;   // Einträge je Gerätedatei
const GESEHEN_TAGE = 180; // gesehene Schlüssel bleiben so lange
const MAX_GESEHEN = 5000;

const s10 = (v) => { const m = String(v == null ? "" : v).match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ""; };
const text = (v) => String(v == null ? "" : v).trim();
const tagMs = (iso) => { const d = s10(iso); return d ? Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) : NaN; };
const plusTage = (iso, n) => new Date(tagMs(iso) + n * 864e5).toISOString().slice(0, 10);
const tm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const datumKurz = (d) => (s10(d) ? `${WT[new Date(tagMs(d)).getUTCDay()]} ${tm(s10(d))}` : "");
// Kurzer, fester Schlüssel aus Text (gleiche Rechnung auf allen Geräten)
const kurz = (s) => { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const ENTFAELLT = / \(entfällt\)$/;

// ---------- Zentrale Termine: Meldungen eines Laufs → Einträge (rein, testbar) ----------
// roh: [{ art: "neu" | "geaendert" | "abgesagt", id, alt: { titel, datum, bis, ort, status, entfaellt, code } | null,
//   neu: { titel, datum, bis, ort, status, code } | null }] aus termineAnwenden. o: { erster, altIds (Set | null), heute, t (ISO) }.
const FELDER = [["datum", "Datum"], ["bis", "Ende"], ["ort", "Ort"], ["titel", "Titel"]];
const zentralEintraege = (roh, o) => {
  o = o || {};
  if (o.erster || !Array.isArray(roh)) return [];
  const heute = s10(o.heute), t = String(o.t || ""), aus = [];
  for (const r of roh) {
    if (!r || !r.id) continue;
    const a = r.alt || null, n = r.neu || null;
    const basis = (x) => ({ q: "zentral", id: String(r.id), titel: text(x.titel).replace(ENTFAELLT, ""), datum: s10(x.datum), bis: s10(x.bis), code: text(x.code), t });
    const stand = n || a || {}, ende = s10(stand.bis) || s10(stand.datum);
    if (heute && ende && ende < heute) continue; // schon vorbei: keine Nachricht
    if (r.art === "neu" && n) {
      if (!o.altIds || o.altIds.has(r.id)) continue; // ohne Stand des letzten Laufs oder nur durch deine Auswahl
      aus.push(Object.assign(basis(n), { art: "neu", k: ["z", r.id, "neu", kurz([n.datum, n.titel].join("|"))].join("|") }));
    } else if (r.art === "geaendert" && a && n) {
      const neuSoll = { titel: text(n.titel), datum: s10(n.datum), bis: s10(n.bis), ort: text(n.ort) };
      const altIst = { titel: text(a.titel).replace(ENTFAELLT, ""), datum: s10(a.datum), bis: s10(a.bis), ort: text(a.ort) };
      if (a.entfaellt === true) {
        aus.push(Object.assign(basis(n), { art: "wieder", k: ["z", r.id, "wieder", kurz(JSON.stringify([altIst, neuSoll]))].join("|") }));
        continue;
      }
      const aenderung = FELDER.filter((f) => altIst[f[0]] !== neuSoll[f[0]]).map((f) => ({ feld: f[0], alt: altIst[f[0]], neu: neuSoll[f[0]] }));
      const bestaetigt = a.status === "geschätzt" && n.status === "offiziell";
      if (!aenderung.length && !bestaetigt) continue;
      aus.push(Object.assign(basis(n), { art: "geaendert", aenderung, bestaetigt,
        k: ["z", r.id, "geaendert", kurz(JSON.stringify([altIst, a.status, neuSoll, n.status]))].join("|") }));
    } else if (r.art === "abgesagt" && a) {
      // Tag der Meldung im Schlüssel: abgesagt, wieder da, erneut abgesagt sind zwei Absagen
      aus.push(Object.assign(basis(a), { art: "abgesagt", k: ["z", r.id, "abgesagt", s10(a.datum), s10(t)].join("|") }));
    }
  }
  if (aus.length <= MAX_LAUF) return aus;
  const rest = aus.length - (MAX_LAUF - 1);
  return aus.slice(0, MAX_LAUF - 1).concat([{ q: "zentral", art: "mehr", anzahl: rest, t, k: ["z", "mehr", t, rest].join("|") }]);
};

// Gerätedatei mischen: alte und neue Einträge, je Schlüssel der älteste, nichts älter als TAGE, höchstens MAX_GERAET (die neuesten)
const zuJung = (e, jetztMs) => { const ms = Date.parse(e && e.t); return !isNaN(ms) && jetztMs - ms <= TAGE * 864e5; };
const protokollMischen = (alt, neu, jetzt) => {
  const ms = Date.parse(jetzt), seen = {}, aus = [];
  for (const e of [].concat(Array.isArray(alt) ? alt : [], Array.isArray(neu) ? neu : [])) {
    if (!e || typeof e.k !== "string" || seen[e.k] || !zuJung(e, ms)) continue;
    seen[e.k] = true;
    aus.push(e);
  }
  return aus.slice(Math.max(0, aus.length - MAX_GERAET));
};

// Datei „gesehen“ mischen: Schlüssel dazu (mit heutigem Tag), alte (über GESEHEN_TAGE) fallen weg, höchstens MAX_GESEHEN
const gesehenMischen = (alt, schluessel, heute) => {
  const g = Object.assign({}, alt && typeof alt === "object" ? alt : {});
  for (const k of schluessel || []) if (typeof k === "string" && k) g[k] = heute;
  const grenze = plusTage(heute, -GESEHEN_TAGE);
  const liste = Object.keys(g).filter((k) => s10(g[k]) && s10(g[k]) >= grenze).sort((a, b) => (g[a] < g[b] ? 1 : g[a] > g[b] ? -1 : 0));
  const aus = {};
  for (const k of liste.slice(0, MAX_GESEHEN)) aus[k] = s10(g[k]);
  return aus;
};

// ---------- Abgeleitet (rein, testbar) ----------
// Stundenplan: liste [{ f, fm }] (Notizen typ lehrveranstaltung), findetStatt(fm, iso) wie ctx.modell.findetStatt, besuchtNicht(fm).
// Je Notiz und Tag der nächsten VORAUS Tage höchstens ein Eintrag; eine dauerhafte Verlegung (neuerRaum) nur einmal, mit seit =
// raum_seit, wenn der neue Raum schon gilt (sonst stünde „ab“ der nächsten Sitzung da, als käme der Wechsel erst).
const stundenplanEintraege = (liste, findetStatt, besuchtNicht, heute) => {
  const aus = [];
  for (const x of Array.isArray(liste) ? liste : []) {
    const fm = (x && x.fm) || null;
    if (!fm || fm.entfaellt === true || (besuchtNicht && besuchtNicht(fm))) continue;
    const ident = text(fm.zentral_id) || text(x.f && x.f.path);
    const titel = text(fm.titel) || text(x.f && x.f.basename);
    const pfad = (x.f && x.f.path) || "";
    let raumGemeldet = false;
    for (let i = 0; i < VORAUS; i++) {
      const d = plusTage(heute, i), s = findetStatt(fm, d) || {};
      const basis = { q: "stundenplan", titel, datum: d, pfad, code: text(fm.code) };
      if (s.grund === "ausfall") { aus.push(Object.assign(basis, { art: "ausfall", k: ["lv", ident, d, "ausfall"].join("|") })); continue; }
      if (!s.statt) continue;
      if (s.neuerRaum && !raumGemeldet) {
        raumGemeldet = true;
        const seit = s10(fm.raum_seit) && s10(fm.raum_seit) <= heute ? s10(fm.raum_seit) : "";
        aus.push(Object.assign(basis, { art: "raum", seit, raum: text(s.raum), raumAlt: text(s.raumAlt), k: ["lv", ident, "raum", text(fm.raum_seit), text(s.raum)].join("|") }));
        continue;
      }
      if (s.neuerRaum || !(s.raumGeaendert || s.zeitGeaendert)) continue;
      aus.push(Object.assign(basis, { art: "verlegt", raum: s.raumGeaendert ? text(s.raum) : "", raumAlt: s.raumGeaendert ? text(s.raumAlt) : "",
        zeit: s.zeitGeaendert ? text(s.beginn) + (s.ende ? "–" + text(s.ende) : "") : "", zeitAlt: s.zeitGeaendert ? text(s.zeitAlt) : "",
        k: ["lv", ident, d, text(s.beginn), text(s.raum)].join("|") }));
    }
  }
  return aus;
};

// Abgaben aus dem ILIAS-Kalender: termine [{ f, fm }]; nur offene, heute oder später, nicht „(entfällt)“
const abgabenEintraege = (termine, heute) => (Array.isArray(termine) ? termine : []).filter((x) => {
  const fm = x && x.fm;
  return fm && fm.herkunft === "ilias-kalender" && fm.ilias_kalender_id && fm.entfaellt !== true && fm.erledigt !== true && s10(fm.datum) >= heute;
}).map((x) => ({ q: "ilias-kalender", art: "abgabe", titel: text(x.fm.titel) || text(x.f.basename), datum: s10(x.fm.datum), ort: text(x.fm.ort),
  pfad: x.f.path, code: text(x.fm.code), k: ["ik", text(x.fm.ilias_kalender_id), s10(x.fm.datum)].join("|") }));

// ILIAS-Dateien aus dem Index: neu geladene (wie „neu“, nicht schon vorhandene) und aktualisierte der letzten ILIAS_TAGE Tage,
// nie gelöschte. Ein Eintrag je Datei; die Karte fasst sie je Modul zusammen.
const iliasEintraege = (index, heute) => {
  const aus = [], dateien = (index && index.dateien) || {}, kurse = (index && index.kurse) || {};
  const grenze = plusTage(heute, -ILIAS_TAGE);
  // Erster Tag je Kurs: Was beim ersten Laden kam, ist keine Änderung
  const ersterTag = {};
  for (const id of Object.keys(dateien)) {
    const d = dateien[id], seit = d && typeof d === "object" ? s10(d.seit) : "";
    if (seit && (!ersterTag[d.kurs] || seit < ersterTag[d.kurs])) ersterTag[d.kurs] = seit;
  }
  for (const id of Object.keys(dateien)) {
    const d = dateien[id];
    if (!d || typeof d !== "object" || d.geloescht) continue;
    const code = text(kurse[d.kurs] && kurse[d.kurs].code);
    const akt = s10(d.aktualisiert), seit = s10(d.seit);
    if (akt && akt >= grenze) aus.push({ q: "ilias", art: "aktualisiert", code, datum: akt, k: ["if", id, akt].join("|") });
    else if (d.wie === "neu" && seit && seit >= grenze && seit !== ersterTag[d.kurs]) aus.push({ q: "ilias", art: "datei", code, datum: seit, k: ["if", id, "neu"].join("|") });
  }
  return aus;
};

// ---------- Zusammenstellen (rein, testbar) ----------
// protokolle: Listen aus allen Gerätedateien, abgeleitet: Einträge von oben, gesehen: { k: Datum }, jetzt: ISO-Zeit.
// → [{ art, q, titel, meta, keys, datum, id?, pfad?, code? }] ungesehen, sortiert: Termine, Stundenplan, Abgaben, ILIAS.
const zahl = (n, eins, mehr) => `${n} ${n === 1 ? eins : mehr}`;
const metaZentral = (e) => {
  if (e.art === "neu") return "Neu · " + datumKurz(e.datum);
  if (e.art === "wieder") return "Findet wieder statt · " + datumKurz(e.datum);
  if (e.art === "abgesagt") return e.datum ? "Entfällt · " + datumKurz(e.datum) : "Entfällt";
  const teile = (e.aenderung || []).map((a) => {
    if (a.feld === "datum") return `${datumKurz(a.neu)} statt ${datumKurz(a.alt)}`;
    if (a.feld === "bis") return a.neu ? `bis ${datumKurz(a.neu)}` + (a.alt ? ` statt ${datumKurz(a.alt)}` : "") : "nur noch ein Tag";
    if (a.feld === "ort") {
      if (!a.neu) return "ohne Ort";
      if (!a.alt) return a.neu;
      // „18:00 · Hörsaal 9 statt 18:00 · Hörsaal 1“ → „Hörsaal 9 statt Hörsaal 1“: gleiche Teile vorn einmal weglassen
      const n = a.neu.split(" · "), o = a.alt.split(" · ");
      while (n.length > 1 && o.length > 1 && n[0] === o[0]) { n.shift(); o.shift(); }
      return `${n.join(" · ")} statt ${o.join(" · ")}`;
    }
    return a.alt ? `vorher „${a.alt}“` : "neuer Titel";
  });
  if (e.bestaetigt) teile.unshift(e.aenderung && e.aenderung.some((a) => a.feld === "datum") ? "Jetzt offiziell" : "Jetzt offiziell · " + datumKurz(e.datum));
  return teile.join(" · ");
};
const RANG = { zentral: 0, stundenplan: 1, "ilias-kalender": 2, ilias: 3 };
const zusammenstellen = (protokolle, abgeleitet, gesehen, jetzt) => {
  const ms = Date.parse(jetzt), g = gesehen || {}, seen = {}, zeilen = [];
  const neu = (e) => e && typeof e.k === "string" && !g[e.k] && !seen[e.k] && (seen[e.k] = true);
  // Zentrale Termine: je id zählt nur die neueste Meldung (hin und zurück zeigt den Stand von jetzt). Ist sie gesehen, steht der
  // Termin nicht da; sonst nimmt die Zeile alle ungesehenen Schlüssel der id mit, und ein ungesehenes „neu“ bleibt „Neu“.
  const jeId = {};
  for (const liste of Array.isArray(protokolle) ? protokolle : []) {
    for (const e of Array.isArray(liste) ? liste : []) {
      if (!e || typeof e.k !== "string" || !zuJung(e, ms)) continue;
      if (e.art !== "mehr") { (jeId[e.id] || (jeId[e.id] = [])).push(e); continue; }
      if (neu(e)) zeilen.push({ q: "zentral", art: "mehr", titel: zahl(e.anzahl, "weitere Änderung", "weitere Änderungen") + " an Terminen", meta: "unter Termine & Anmeldungen", keys: [e.k], datum: "", t: e.t });
    }
  }
  for (const id of Object.keys(jeId)) {
    const liste = jeId[id].sort((a, b) => String(a.t || "").localeCompare(String(b.t || "")));
    const letzte = liste[liste.length - 1];
    if (g[letzte.k]) continue;
    const keys = liste.filter((e) => !g[e.k]).map((e) => e.k).filter((k, i, alle) => alle.indexOf(k) === i);
    const e = letzte.art !== "abgesagt" && liste.some((x) => x.art === "neu" && !g[x.k]) ? Object.assign({}, letzte, { art: "neu" }) : letzte;
    zeilen.push({ q: "zentral", art: e.art, id: e.id, titel: e.titel, meta: metaZentral(e), keys, datum: e.datum, code: e.code, t: e.t });
  }
  const ilias = {};
  for (const e of Array.isArray(abgeleitet) ? abgeleitet : []) {
    if (!neu(e)) continue;
    if (e.q === "ilias") {
      const c = e.code || "";
      const z = ilias[c] || (ilias[c] = { q: "ilias", art: "dateien", code: c, neu: 0, akt: 0, keys: [], datum: "" });
      if (e.art === "aktualisiert") z.akt++; else z.neu++;
      z.keys.push(e.k);
      if (e.datum > z.datum) z.datum = e.datum;
      continue;
    }
    let meta = "";
    if (e.art === "ausfall") meta = "Fällt aus · " + datumKurz(e.datum);
    else if (e.art === "raum") meta = `Neuer Raum ${e.seit ? "seit " + datumKurz(e.seit) : "ab " + datumKurz(e.datum)} · ${e.raum}` + (e.raumAlt ? ` statt ${e.raumAlt}` : "");
    else if (e.art === "verlegt") meta = [datumKurz(e.datum), e.zeit ? `${e.zeit} statt ${e.zeitAlt}` : "", e.raum ? `${e.raum} statt ${e.raumAlt}` : ""].filter(Boolean).join(" · ");
    else if (e.art === "abgabe") meta = "Neue Abgabe · bis " + datumKurz(e.datum);
    zeilen.push({ q: e.q, art: e.art, titel: e.titel, meta, keys: [e.k], datum: e.datum, pfad: e.pfad, code: e.code });
  }
  for (const c of Object.keys(ilias).sort()) {
    const z = ilias[c];
    z.titel = c ? c + " · Unterlagen aus ILIAS" : "Unterlagen aus ILIAS";
    z.meta = [z.neu ? zahl(z.neu, "neue Datei", "neue Dateien") : "", z.akt ? zahl(z.akt, "aktualisiert", "aktualisiert") : ""].filter(Boolean).join(" · ");
    zeilen.push(z);
  }
  // Termine nach Zeitpunkt der Meldung (neueste zuerst), sonst nach Datum
  return zeilen.sort((a, b) => (RANG[a.q] - RANG[b.q]) || (a.q === "zentral" ? String(b.t || "").localeCompare(String(a.t || "")) : String(a.datum).localeCompare(String(b.datum))));
};

module.exports = function (ctx) {
  const app = window.app;
  const obs = (ctx && ctx.obsidian) || {};
  const SPRACHE = "eba-seit-besuch";
  const V = app.vault;
  const datei = (pfad) => { const f = V.getAbstractFileByPath(pfad); return f && !f.children ? f : null; };
  const heute = () => (ctx.modell && ctx.modell.zeit ? ctx.modell.zeit.heute() : ctx.date.now("YYYY-MM-DD"));
  const jetztIso = () => (ctx.date && ctx.date.jetzt ? ctx.date.jetzt() : new Date()).toISOString();
  const jsonLesen = async (pfad) => {
    const f = datei(pfad);
    if (!f) return null;
    try { return JSON.parse(await V.read(f)); } catch (e) { return null; }
  };
  const ordnerAnlegen = async () => {
    let a = "";
    for (const t of ORDNER.split("/")) {
      a = a ? a + "/" + t : t;
      if (V.getAbstractFileByPath(a)) continue;
      try { await V.createFolder(a); } catch (e) { if (!V.getAbstractFileByPath(a)) throw e; }
    }
  };
  const jsonSchreiben = async (pfad, wert) => {
    const t = JSON.stringify(wert, null, 1) + "\n";
    const f = datei(pfad);
    if (f) { await V.process(f, () => t); return; }
    await ordnerAnlegen();
    await V.create(pfad, t);
  };

  // ---------- Protokoll (nur zentral.js ruft das auf, auf dem Abrufer-Gerät) ----------
  const geraet = () => String(ctx.zentral && ctx.zentral.geraetId ? ctx.zentral.geraetId() : "geraet").replace(/[^a-z0-9-]/gi, "");
  const geraetPfad = () => ORDNER + "/" + geraet() + ".json";
  const gesehenPfad = () => ORDNER + "/" + GESEHEN + geraet() + ".json";
  const zentral = async (roh, o) => {
    const eintraege = zentralEintraege(roh, Object.assign({ heute: heute(), t: jetztIso() }, o || {}));
    if (!eintraege.length) return 0;
    const pfad = geraetPfad();
    const alt = await jsonLesen(pfad);
    await jsonSchreiben(pfad, { version: 1, eintraege: protokollMischen(alt && alt.eintraege, eintraege, jetztIso()) });
    return eintraege.length;
  };

  // ---------- Daten für die Karte ----------
  // Alle Gerätedateien: Protokolle (Listen) und die Vereinigung aller gesehen-Dateien (je Schlüssel der späteste Tag)
  const lesenAlle = async () => {
    const o = V.getAbstractFileByPath(ORDNER), protokolle = [], gesehen = {};
    if (!o || !o.children) return { protokolle, gesehen };
    for (const f of o.children) {
      if (f.children || f.extension !== "json") continue;
      const d = await jsonLesen(f.path);
      if (!d) continue;
      if (f.name.indexOf(GESEHEN) === 0) {
        const g = d.gesehen && typeof d.gesehen === "object" ? d.gesehen : {};
        for (const k of Object.keys(g)) if (!gesehen[k] || String(g[k]) > gesehen[k]) gesehen[k] = String(g[k]);
      } else if (Array.isArray(d.eintraege)) protokolle.push(d.eintraege);
    }
    return { protokolle, gesehen };
  };
  const daten = async () => {
    const M = ctx.modell;
    if (!M || !M.daten) return null;
    const D = M.daten(), h = heute();
    let abgeleitet = [];
    try { abgeleitet = abgeleitet.concat(stundenplanEintraege(D.stundenplan, M.findetStatt, (fm) => M.besuchtNicht(fm, D.einstellungen), h)); } catch (e) { console.error(SPRACHE, e); }
    abgeleitet = abgeleitet.concat(abgabenEintraege(D.termine, h));
    abgeleitet = abgeleitet.concat(iliasEintraege(await jsonLesen(ILIAS_INDEX), h));
    const alle = await lesenAlle();
    const zeilen = zusammenstellen(alle.protokolle, abgeleitet, alle.gesehen, jetztIso());
    // Ziele erst jetzt: zentrale Termine über zentral_id (Notizen werden umbenannt), ILIAS über die Modulnotiz
    const termin = {};
    for (const x of D.termine) if (x.fm.herkunft === "zentral" && x.fm.zentral_id && !termin[x.fm.zentral_id]) termin[x.fm.zentral_id] = x.f.path;
    for (const z of zeilen) {
      if (z.q === "zentral" && z.id) z.pfad = termin[z.id] || "";
      else if (z.q === "zentral" && z.art === "mehr") z.pfad = "Studium/Termine & Anmeldungen.md";
      else if (z.q === "ilias") { const m = z.code && D.module.find((x) => x.code === z.code); z.pfad = m ? m.f.path : ""; }
    }
    return zeilen.length ? { zeilen } : null;
  };

  // ---------- Gesehen ----------
  const schluesselVon = (zeilen) => { const keys = []; for (const z of zeilen || []) Array.prototype.push.apply(keys, z.keys || []); return keys; };
  const angezeigt = () => { const v = app.loadLocalStorage(ANGEZEIGT); return Array.isArray(v) ? v.filter((k) => typeof k === "string" && k) : []; };
  const angezeigtMerken = (zeilen) => {
    const alt = angezeigt(), neu = alt.slice();
    for (const k of schluesselVon(zeilen)) if (neu.indexOf(k) < 0) neu.push(k);
    if (neu.length !== alt.length) app.saveLocalStorage(ANGEZEIGT, neu.slice(Math.max(0, neu.length - MAX_GESEHEN)));
  };
  const gesehenSchreiben = async (keys) => {
    const pfad = gesehenPfad(), alt = await jsonLesen(pfad);
    await jsonSchreiben(pfad, { version: 1, gesehen: gesehenMischen(alt && alt.gesehen, keys, heute()) });
  };
  // Besuch vorbei: Angezeigtes eintragen (nie zweimal gleichzeitig), die Karte ist beim nächsten Mal wieder zu. Schlägt das
  // Schreiben fehl, bleibt alles gemerkt und kommt beim nächsten Mal dran.
  let eintragen = null;
  const besuchVorbei = () => {
    if (eintragen) return eintragen;
    const keys = angezeigt();
    if (!keys.length) return Promise.resolve(false);
    eintragen = gesehenSchreiben(keys).then(() => {
      const rest = angezeigt().filter((k) => keys.indexOf(k) < 0); // was beim Schreiben dazukam, bleibt gemerkt
      app.saveLocalStorage(ANGEZEIGT, rest.length ? rest : null);
      auf.wert = false;
      return true;
    }, (e) => { console.error(SPRACHE, e); return false; }).then((r) => { eintragen = null; return r; });
    return eintragen;
  };
  const allesGesehen = async (zeilen) => {
    try {
      await gesehenSchreiben(angezeigt().concat(schluesselVon(zeilen)));
      app.saveLocalStorage(ANGEZEIGT, null);
    } catch (e) { console.error(SPRACHE, e); try { ctx.hinweis("„Alles gesehen“ ließ sich nicht speichern."); } catch (x) { /* ohne Obsidian */ } }
    alleNeu();
  };

  // ---------- Karte ----------
  const auf = ctx.bleibend("auf", () => ({ wert: false }));
  const karte = (doc, d) => {
    const n = d.zeilen.length;
    const k = doc.createElement("div");
    k.className = "callout is-collapsible" + (auf.wert ? "" : " is-collapsed");
    k.setAttribute("data-callout", "eba-seit-besuch");
    k.setAttribute("data-callout-metadata", "");
    k.setAttribute("data-callout-fold", auf.wert ? "+" : "-");
    const titel = k.createDiv({ cls: "callout-title", attr: { role: "button", tabindex: "0", "aria-expanded": String(auf.wert) } });
    const symbol = titel.createDiv({ cls: "callout-icon" });
    if (obs.setIcon) obs.setIcon(symbol, "history");
    titel.createDiv({ cls: "callout-title-inner", text: zahl(n, "Änderung", "Änderungen") + " seit deinem letzten Besuch" });
    const pfeil = titel.createDiv({ cls: "callout-fold" + (auf.wert ? "" : " is-collapsed") });
    if (obs.setIcon) obs.setIcon(pfeil, "chevron-down");
    const inhalt = k.createDiv({ cls: "callout-content" });
    if (!auf.wert) inhalt.style.display = "none";
    const klappen = () => {
      auf.wert = !auf.wert;
      if (auf.wert) angezeigtMerken(d.zeilen);
      for (const x of doc.querySelectorAll('.callout[data-callout="eba-seit-besuch"]')) {
        x.toggleClass("is-collapsed", !auf.wert);
        x.setAttribute("data-callout-fold", auf.wert ? "+" : "-");
        const t = x.querySelector(":scope > .callout-title");
        if (t) t.setAttribute("aria-expanded", String(auf.wert));
        const f = x.querySelector(":scope > .callout-title > .callout-fold");
        if (f) f.toggleClass("is-collapsed", !auf.wert);
        const c = x.querySelector(":scope > .callout-content");
        if (c) c.style.display = auf.wert ? "" : "none";
      }
    };
    titel.addEventListener("click", (e) => { e.preventDefault(); klappen(); });
    titel.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); klappen(); } });

    const liste = inhalt.createDiv({ cls: "eba-td eba-sb-liste", attr: { role: "list" } });
    for (const z of d.zeilen) {
      const zeile = liste.createDiv({ cls: "eba-td-zeile eba-sb-" + z.art + (z.pfad ? " eba-sb-ziel" : ""), attr: { role: "listitem" } });
      zeile.createSpan({ cls: "eba-sb-punkt", attr: { "aria-hidden": "true" } });
      const inh = zeile.createDiv({ cls: "eba-td-inhalt" });
      inh.createDiv({ cls: "eba-td-text", text: z.titel });
      if (z.meta) inh.createDiv({ cls: "eba-td-meta", text: z.meta });
      if (z.pfad) inh.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); ctx.oeffnen(z.pfad, { neu: !!(e.ctrlKey || e.metaKey) }); });
    }
    const fuss = inhalt.createDiv({ cls: "eba-sb-knoepfe" });
    const gesehen = fuss.createEl("a", { cls: "eba-vb-knopf", text: "Alles gesehen", href: "#" });
    gesehen.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); allesGesehen(d.zeilen); });
    // Bearbeitungsansicht: ein Tipp in die Karte springt nicht in den Quelltext
    k.addEventListener("mousedown", (e) => e.stopPropagation());
    return k;
  };

  // Zeichnen: gleiche Zeilen → nichts tun (Klapp-Zustand bleibt ruhig)
  const zeichnen = async (inst) => {
    const { el } = inst;
    const lauf = inst.lauf = (inst.lauf || 0) + 1;
    const d = await daten();
    if (lauf !== inst.lauf) return; // ein späterer Aufruf zeichnet
    const sig = d ? JSON.stringify(d.zeilen.map((z) => [z.keys, z.titel, z.meta, z.pfad])) : "";
    if (inst.sig === sig && inst.gezeichnet) return;
    inst.sig = sig;
    el.empty();
    if (!d) { el.addClass("eba-sb-aus"); inst.gezeichnet = true; return; }
    el.removeClass("eba-sb-aus");
    el.appendChild(karte(el.ownerDocument, d));
    inst.gezeichnet = true;
    if (auf.wert) angezeigtMerken(d.zeilen); // offen gezeichnet: auch neue Zeilen stehen sichtbar da
  };

  let block = null;
  const alleNeu = () => { if (block) for (const i of block.instanzen()) zeichnen(i).catch((e) => console.error(SPRACHE, e)); };

  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (_q, el, _c, inst) => {
      inst.sig = null;
      inst.gezeichnet = false;
      el.addClass("eba-sb-aus"); // bis feststeht, ob es etwas zu zeigen gibt
      // Block neu gezeichnet = neuer Besuch: vorher Angezeigtes erst eintragen
      return besuchVorbei().then(() => zeichnen(inst)).catch((e) => { console.error(SPRACHE, e); el.empty(); el.addClass("eba-sb-aus"); });
    });
    const bald = ctx.entprellen(alleNeu, 600);
    // Termine, Stundenplan und Module meldet das Modell; die JSON-Dateien (Protokolle, gesehen, ILIAS-Index) sehen wir selbst
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(bald));
    const wichtig = (p) => String(p).indexOf(ORDNER + "/") === 0 || p === ILIAS_INDEX;
    ctx.an(V, "modify", (f) => { if (wichtig(f.path)) bald(); });
    ctx.an(V, "create", (f) => { if (wichtig(f.path)) bald(); });
    ctx.an(V, "delete", (f) => { if (wichtig(f.path)) bald(); });
    // Mitternacht: Ausfälle und Abgaben von gestern fallen weg
    ctx.intervall(bald, 15 * 60e3);
    // Besuch vorbei: Obsidian im Hintergrund (iOS: andere App) oder ein Tab ohne die Karte aktiv. Das Eintragen ändert die Datei
    // gesehen-…, „modify“ oben zeichnet die Karte dann neu.
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "hidden") besuchVorbei(); });
    ctx.an(app.workspace, "active-leaf-change", (leaf) => {
      if (!block || !angezeigt().length) return;
      const wo = leaf && leaf.view && leaf.view.containerEl;
      if (!block.instanzen().some((i) => wo && i.el && wo.contains(i.el))) besuchVorbei();
    });
  };

  ctx.seitBesuch = { zentral, daten, ORDNER, GESEHEN };
  return { registrieren, zeichnen, daten, zentral, allesGesehen, besuchVorbei, angezeigtMerken };
};
module.exports.zentralEintraege = zentralEintraege;
module.exports.protokollMischen = protokollMischen;
module.exports.gesehenMischen = gesehenMischen;
module.exports.stundenplanEintraege = stundenplanEintraege;
module.exports.abgabenEintraege = abgabenEintraege;
module.exports.iliasEintraege = iliasEintraege;
module.exports.zusammenstellen = zusammenstellen;
module.exports.ORDNER = ORDNER;
module.exports.GESEHEN = GESEHEN;
