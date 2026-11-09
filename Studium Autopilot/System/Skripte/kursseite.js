// Kursseiten aus ILIAS (seit 05.11.2026): Was auf der Startseite eines Kurses steht (Ablauf je Woche, Zwischentests, Raumänderungen,
// Hinweise der Lehrenden), als Notiz „<Code> Kursseite“ im Modulordner unter Unterlagen/. ilias.js holt die Seite (ilias-html.js
// kursseite liest sie) und schreibt mit diesen Funktionen; die Modulseite (modul.js) zeigt, was laut Kursseite diese Woche dran
// ist, und der Connector (server/mcp-tresor.mjs, dieselben Regeln für Tabellen und Tage) beantwortet damit „Was kommt in S100
// diese Woche dran?“. Bibliothek ohne Obsidian (ctx.user.kursseite(ctx)), startet nichts. Doku: docs/architektur/unterlagen.md,
// „Kursseiten“. Tests: tests/kursseite.test.js.
//
// Notiz: typ: kursseite, code, herkunft: ilias, quelle (Adresse des Kurses), ilias_ref, geaendert (Tag, an dem das Plugin den
//   Inhalt zuletzt anders sah). Text: „# <Code> Kursseite“, eine Zeile Herkunft, der Inhalt der Seite als Markdown (Tabellen
//   bleiben Tabellen, Kästen werden Zitate, Videos nur mit Namen), zuletzt „## Meine Notizen“. Die Notiz gehört ILIAS: Ändert sich
//   die Seite, ersetzt das Plugin alles außer „## Meine Notizen“ und deinen eigenen Eigenschaften.
// Kurspasswörter: Eine Zeile mit Passwort (dieselbe Erkennung wie bei Kurstiteln, ilias.js hatKennwort/ohneKennwort) wird zu
//   „… (Passwort steht in ILIAS)“; steht der Wert in der Zeile danach (Marke mit „:“ am Zeilenende), fällt auch die.
// Zeitplan (zeitplan, woche): Zeilen aus Tabellen, in denen eine der ersten drei Zellen einen Tag oder Zeitraum nennt
//   („12.10.2026 - 16.10.2026“, „12.10. - 16.10.“, „Woche 12.10.26“ = sieben Tage ab dann, „13.11.2026 17:00 - 18:00“ = ein Tag).
//   Ohne Jahr gilt das Jahr, das dem Tag am nächsten liegt, an dem die Seite geändert wurde. Zeilen ohne weiteren Inhalt fallen weg.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const TYP = "kursseite";
const MEINE = "## Meine Notizen";
const KENNWORT_ERSATZ = "(Passwort steht in ILIAS)";
const ZEILE_MAX = 2000, BLOECKE_MAX = 400, TEXT_MAX = 200000;

const pad = (n) => String(n).padStart(2, "0");
const MD = /[\\`*_\[\]<>#|!$%~=^{}]/g;
const mdStandard = (s) => String(s).replace(MD, "\\$&").replace(/([A-Za-z0-9._%+-])@(?=[A-Za-z0-9])/g, "$1\\@");
const urlMd = (u) => String(u).replace(/[\s()<>|]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
const J = (v) => JSON.stringify(v == null ? "" : String(v));

// ---------- Blöcke → Markdown ----------
// o: { md(text) → entschärft (ctx.zentral.mdInZeile), hatKennwort(text), ohneKennwort(text) }
function markdown(bloecke, o) {
  const md = (o && o.md) || mdStandard;
  const hatKennwort = (o && o.hatKennwort) || (() => false);
  const ohneKennwort = (o && o.ohneKennwort) || (() => "");
  const klartext = (z) => z.map((s) => s.t).join("");
  // Zeilen eines Absatzes, einer Zelle oder eines Punkts: Passwörter weg, Stücke als Markdown
  // ohneFett: Überschriften und Tabellenkopf (dort ist alles schon hervorgehoben)
  const zeilenMd = (zeilen, ohneFett) => {
    const aus = [];
    let danachWeg = false;
    for (const z of zeilen) {
      const roh = klartext(z);
      if (danachWeg && roh.trim()) { danachWeg = false; continue; }
      if (roh && hatKennwort(roh)) {
        const vor = ohneKennwort(roh);
        aus.push((vor ? md(vor) + " " : "") + KENNWORT_ERSATZ);
        danachWeg = /(?:passw|kennw|pw|code|schl(?:ü|ue)ssel)\S*\s*[:=]?\s*$/i.test(roh);
        continue;
      }
      // Stücke als Markdown; aufeinanderfolgende fette Stücke (auch Link und Text) stehen in einem „**…**“
      let zeile = "", fett = "";
      const stueck = (s) => { const t = md(s.t); return s.url && t.trim() ? `[${t}](${urlMd(s.url)})` : t; };
      const fettZu = () => {
        if (!fett) return;
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(fett);
        zeile += m[2] ? m[1] + "**" + m[2] + "**" + m[3] : fett;
        fett = "";
      };
      for (const s of z) {
        if (s.fett && !ohneFett) fett += stueck(s);
        else { fettZu(); zeile += stueck(s); }
      }
      fettZu();
      aus.push(zeile.slice(0, ZEILE_MAX));
    }
    return aus;
  };
  const anfangSicher = (t) => t.replace(/^(\d+)([.)])(\s)/, "$1\\$2$3").replace(/^([-+])(\s)/, "\\$1$2");
  const zeilen = [];
  const leer = () => { if (zeilen.length && zeilen[zeilen.length - 1] !== "") zeilen.push(""); };
  const liste = (punkte, geordnet, tiefe) => {
    punkte.forEach((p, i) => {
      const t = zeilenMd(p.zeilen);
      const vor = "  ".repeat(tiefe) + (geordnet ? `${i + 1}. ` : "- ");
      zeilen.push(vor + (t[0] || ""));
      for (const r of t.slice(1)) if (r) zeilen.push("  ".repeat(tiefe + 1) + r);
      if (p.unter && p.unter.length) liste(p.unter, false, tiefe + 1);
    });
  };
  const tabelle = (rows) => {
    const breite = Math.min(20, Math.max(...rows.map((r) => r.length)));
    // „|“ im Text hat md() schon entschärft, in Adressen urlMd
    const zelle = (c, kopfZeile) => (c ? zeilenMd(c.zeilen, kopfZeile).filter(Boolean).join("<br>") : "") || " ";
    const zeile = (r, kopfZeile) => "| " + Array.from({ length: breite }, (_, i) => zelle(r[i], kopfZeile)).join(" | ") + " |";
    zeilen.push(zeile(rows[0], true));
    zeilen.push("|" + " --- |".repeat(breite));
    for (const r of rows.slice(1)) zeilen.push(zeile(r));
  };
  const gehen = (bs) => {
    for (const b of bs.slice(0, BLOECKE_MAX)) {
      if (!b) continue;
      if (b.art === "absatz") {
        const t = zeilenMd(b.zeilen, !!b.ebene);
        if (!t.some((r) => r.trim())) continue;
        leer();
        if (b.ebene) zeilen.push("#".repeat(b.ebene + 1) + " " + t.filter(Boolean).join(" "));
        else for (const r of t) zeilen.push(anfangSicher(r));
      } else if (b.art === "liste" && b.punkte && b.punkte.length) { leer(); liste(b.punkte, !!b.geordnet, 0); }
      else if (b.art === "tabelle" && b.zeilen && b.zeilen.length) { leer(); tabelle(b.zeilen); }
      else if (b.art === "video") { leer(); zeilen.push(`Video: ${md(b.titel || "ohne Titel")}`); }
      else if (b.art === "abschnitt" && b.bloecke && b.bloecke.length) {
        const innen = markdown(b.bloecke, o);
        if (!innen) continue;
        leer();
        for (const r of innen.split("\n")) zeilen.push(r ? "> " + r : ">");
      }
    }
  };
  gehen(Array.isArray(bloecke) ? bloecke : []);
  while (zeilen.length && zeilen[zeilen.length - 1] === "") zeilen.pop();
  const text = zeilen.join("\n");
  return text.length > TEXT_MAX ? text.slice(0, text.lastIndexOf("\n", TEXT_MAX)) : text;
}

// ---------- Notiz ----------
const datumDe = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const fmVon = (text) => { const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(String(text || "")); return m; };
const kopf = (code) => `# ${code} Kursseite`;
// Inhalt, wie ihn das Plugin schreibt: alles zwischen Kopf und „## Meine Notizen“ (zum Vergleichen)
function inhaltVon(text) {
  const t = String(text || "").replace(/\r\n/g, "\n");
  const m = fmVon(t);
  const rumpf = m ? t.slice(m[0].length) : t;
  const i = rumpf.indexOf("\n" + MEINE);
  return (i >= 0 ? rumpf.slice(0, i) : rumpf).replace(/^\n+|\n+$/g, "");
}
// Dein Teil: „## Meine Notizen“ bis zum Ende (ohne Überschrift), sonst ""
function meineVon(text) {
  const t = String(text || "").replace(/\r\n/g, "\n");
  const i = t.indexOf("\n" + MEINE);
  return i >= 0 ? t.slice(i + 1 + MEINE.length).replace(/^[ \t]*\n/, "").replace(/\s+$/, "") : "";
}
// Eigenschaften, die nicht dem Plugin gehören, bleiben (Zeilen im Frontmatter der alten Notiz außer den eigenen Schlüsseln)
const EIGENE_FELDER = ["typ", "code", "herkunft", "quelle", "ilias_ref", "geaendert"];
function fremdeFelder(text) {
  const m = fmVon(text);
  if (!m) return [];
  const aus = [];
  let behalten = false;
  for (const z of m[1].split(/\r?\n/)) {
    const k = /^([A-Za-z_][\w-]*):/.exec(z);
    if (k) behalten = EIGENE_FELDER.indexOf(k[1]) < 0;
    if (behalten) aus.push(z);
  }
  return aus;
}
// Rumpf der Notiz (ohne Frontmatter): Kopf, Herkunft, Inhalt
function rumpf(d, o) {
  const md = (o && o.md) || mdStandard;
  const link = d.url ? ` [In ILIAS öffnen](${urlMd(d.url)})` : "";
  return [kopf(d.code), "", `Von der Startseite des Kurses ${md(d.code)} in ILIAS, zuletzt geändert am ${datumDe(d.geaendert)}.${link}`, "", d.inhalt].join("\n");
}
// d: { code, url, refId, geaendert (JJJJ-MM-TT), inhalt (markdown()) }; alt: bisherige Notiz oder null
function notiz(d, alt, o) {
  const fm = ["---", `typ: ${TYP}`, `code: ${J(d.code)}`, "herkunft: ilias", `quelle: ${J(d.url || "")}`, `ilias_ref: ${J(d.refId || "")}`,
    `geaendert: ${d.geaendert}`].concat(alt ? fremdeFelder(alt) : [], ["---"]);
  const meine = alt ? meineVon(alt) : "";
  return fm.join("\n") + "\n" + rumpf(d, o) + "\n\n" + MEINE + "\n" + (meine ? meine + "\n" : "");
}
// Ist der Inhalt der alten Notiz derselbe? (dann schreibt das Plugin nichts, auch nicht das Datum)
const gleich = (alt, d, o) => inhaltVon(alt) === rumpf(Object.assign({}, d, { geaendert: geaendertVon(alt) || d.geaendert }), o).replace(/\n+$/, "");
function geaendertVon(text) {
  const m = fmVon(text);
  const g = m && /^geaendert:\s*"?(\d{4}-\d{2}-\d{2})"?\s*$/m.exec(m[1]);
  return g ? g[1] : "";
}
// Gehört die Notiz dem Plugin? (typ kursseite, herkunft ilias); eine andere fasst ilias.js nie an
function eigene(text) {
  const m = fmVon(text);
  return !!m && /^typ:\s*"?kursseite"?\s*$/m.test(m[1]) && /^herkunft:\s*"?ilias"?\s*$/m.test(m[1]);
}
// Kurzer Hash des Inhalts (Index von ilias.js: eine gelöschte Notiz kommt erst wieder, wenn sich die Seite ändert)
function kurzHash(s) {
  let h = 0x811c9dc5;
  const t = String(s);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ("0000000" + h.toString(16)).slice(-8) + ":" + t.length;
}

// ---------- Zeitplan aus den Tabellen ----------
const istTag = (j, m, t) => {
  if (!(j >= 2000 && j <= 2100 && m >= 1 && m <= 12 && t >= 1 && t <= 31)) return false;
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
};
const iso = (j, m, t) => `${j}-${pad(m)}-${pad(t)}`;
const plusTage = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const tageZwischen = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
// Jahr zu Tag und Monat ohne Jahr: das, bei dem der Tag der basis am nächsten liegt
function jahrZu(m, t, basis) {
  const j0 = +String(basis).slice(0, 4);
  let best = null;
  for (const j of [j0 - 1, j0, j0 + 1]) {
    if (!istTag(j, m, t)) continue;
    const abst = Math.abs(tageZwischen(basis, iso(j, m, t)));
    if (!best || abst < best.abst) best = { j, abst };
  }
  return best ? best.j : null;
}
const TAG = /(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{4}|\d{2})(?!\d))?/g;
// Tag oder Zeitraum in einem Zellentext → { von, bis } | null
function bereich(text, basis) {
  const s = String(text || "").replace(/\u00a0/g, " ");
  const funde = [];
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(s)) && funde.length < 3) funde.push({ t: +m[1], m: +m[2], j: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null, i: m.index, ende: m.index + m[0].length });
  if (!funde.length) return null;
  const a = funde[0];
  const b = funde[1] && /^\s*(?:-|–|—|bis)\s*$/.test(s.slice(a.ende, funde[1].i)) ? funde[1] : null;
  const ja = a.j || (b && b.j) || jahrZu(a.m, a.t, basis);
  if (!ja || !istTag(ja, a.m, a.t)) return null;
  const von = iso(ja, a.m, a.t);
  if (b) {
    let jb = b.j || ja;
    if (!b.j && b.m < a.m) jb = ja + 1;
    if (!istTag(jb, b.m, b.t)) return null;
    const bis = iso(jb, b.m, b.t);
    return bis >= von && tageZwischen(von, bis) <= 62 ? { von, bis } : null;
  }
  return /\bwoche\b/i.test(s) ? { von, bis: plusTage(von, 6) } : { von, bis: von };
}
// Markdown einer Zelle → reiner Text (Links und Fett weg, „<br>“ → Zeilenumbruch, „\“-Entschärfung zurück)
const zellText = (c) => String(c).replace(/<br\s*\/?>/gi, "\n").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "")
  .replace(/\\(.)/g, "$1").split("\n").map((z) => z.trim()).filter(Boolean).join("\n");
// Zellen einer Tabellenzeile (an „|“ ohne „\“ davor)
function zellen(z) {
  const t = z.trim().replace(/^\|/, "").replace(/\|$/, "");
  const aus = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    const c = t.charAt(i);
    if (c === "\\" && i + 1 < t.length) { cur += c + t.charAt(i + 1); i++; continue; }
    if (c === "|") { aus.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  aus.push(cur.trim());
  return aus;
}
// Tabellen einer Notiz: [{ kopf: [Text], zeilen: [[Text]] }] (auch in Zitaten)
function tabellen(text) {
  const aus = [];
  let akt = null;
  for (const roh of inhaltVon(text).split("\n")) {
    const z = roh.replace(/^(?:>\s?)+/, "");
    if (/^\s*\|/.test(z)) {
      const c = zellen(z);
      if (!akt) { akt = { kopf: c.map(zellText), zeilen: [] }; aus.push(akt); continue; }
      if (c.every((x) => /^:?-{3,}:?$/.test(x))) continue;
      akt.zeilen.push(c.map(zellText));
    } else akt = null;
  }
  return aus;
}
// Zeilen mit Tag oder Zeitraum: [{ von, bis, tabelle (Nummer ab 1), zellen: [{ spalte, text }] }], nach von
function zeitplan(text, basis) {
  const b = basis || geaendertVon(text) || new Date().toISOString().slice(0, 10);
  const aus = [];
  tabellen(text).forEach((t, ti) => {
    for (const z of t.zeilen) {
      let br = null, wo = -1;
      for (let i = 0; i < Math.min(3, z.length) && !br; i++) { br = bereich(z[i], b); if (br) wo = i; }
      if (!br) continue;
      const rest = [];
      z.forEach((c, i) => {
        if (i === wo || !c) return;
        const spalte = t.kopf[i] || "";
        if (/^\d{1,2}$/.test(c) && (i < wo || /^(woche|kw|nr\.?|sitzung)$/i.test(spalte))) return; // laufende Nummer der Woche
        rest.push({ spalte, text: c });
      });
      if (rest.length) aus.push({ von: br.von, bis: br.bis, tabelle: ti + 1, zellen: rest });
    }
  });
  return aus.sort((x, y) => (x.von < y.von ? -1 : x.von > y.von ? 1 : x.tabelle - y.tabelle));
}
// Zeilen, deren Zeitraum den Tag enthält (Standard) oder die Woche (Mo–So) dieses Tages schneidet (o.woche)
function woche(text, tag, o) {
  const w = !!(o && o.woche);
  const mo = plusTage(tag, -((new Date(tag + "T00:00:00Z").getUTCDay() + 6) % 7)), so = plusTage(mo, 6);
  return zeitplan(text, o && o.basis).filter((z) => (w ? z.von <= so && z.bis >= mo : z.von <= tag && z.bis >= tag));
}

const API = { TYP, MEINE, KENNWORT_ERSATZ, markdown, notiz, gleich, inhaltVon, meineVon, geaendertVon, eigene, kurzHash, bereich, tabellen, zeitplan, woche };

module.exports = function (ctx) {
  const app = (ctx && ctx.app) || (typeof window !== "undefined" ? window.app : null);
  // Kursseiten im Tresor (für die Modulseite): [{ pfad, code, geaendert, datei }] aus dem metadataCache
  const seiten = (code) => {
    if (!app || !app.vault) return [];
    return app.vault.getMarkdownFiles().filter((f) => {
      const fm = (app.metadataCache.getFileCache(f) || {}).frontmatter;
      return fm && fm.typ === TYP && (!code || String(fm.code) === code);
    }).map((f) => {
      const fm = app.metadataCache.getFileCache(f).frontmatter;
      return { pfad: f.path, code: String(fm.code || ""), geaendert: String(fm.geaendert || ""), datei: f };
    }).sort((a, b) => (a.pfad < b.pfad ? -1 : 1));
  };
  return Object.assign({}, API, { seiten });
};
Object.assign(module.exports, API);
