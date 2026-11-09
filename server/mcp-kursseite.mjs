// Kursseiten aus ILIAS im Connector (Werkzeug kursseiten, mcp-werkzeuge.mjs): Notizen mit typ: kursseite, die das Plugin aus der
// Startseite eines Kurses schreibt (System/Skripte/kursseite.js). Zeitplan: Zeilen ihrer Tabellen mit Tag oder Zeitraum, nach
// denselben Regeln wie dort (bereich, tabellen, zeitplan); tests/connector-kursseite.test.js prüft, dass beide gleich rechnen.
// Eigener Code statt des Skripts aus dem Tresor: Der Connector führt nie Code aus, der über den Sync kommt.
const pad = (n) => String(n).padStart(2, "0");
const MEINE = "## Meine Notizen";

const istTag = (j, m, t) => {
  if (!(j >= 2000 && j <= 2100 && m >= 1 && m <= 12 && t >= 1 && t <= 31)) return false;
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
};
const iso = (j, m, t) => `${j}-${pad(m)}-${pad(t)}`;
export const plusTage = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const tageZwischen = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
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
export function bereich(text, basis) {
  const s = String(text || "").replace(/\u00a0/g, " ");
  const funde = [];
  for (const m of s.matchAll(TAG)) {
    funde.push({ t: +m[1], m: +m[2], j: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null, i: m.index, ende: m.index + m[0].length });
    if (funde.length >= 3) break;
  }
  if (!funde.length) return null;
  const a = funde[0];
  const b = funde[1] && /^\s*(?:-|–|—|bis)\s*$/.test(s.slice(a.ende, funde[1].i)) ? funde[1] : null;
  const ja = a.j || b?.j || jahrZu(a.m, a.t, basis);
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
const zellText = (c) => String(c).replace(/<br\s*\/?>/gi, "\n").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "")
  .replace(/\\(.)/g, "$1").split("\n").map((z) => z.trim()).filter(Boolean).join("\n");
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
// Text ohne Frontmatter und ohne „## Meine Notizen“ (body: Text nach dem Frontmatter, wie mcp-tresor.mjs ihn liest)
export function inhaltVon(body) {
  const t = String(body || "").replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---[ \t]*(?:\n|$)/, "");
  const i = t.indexOf("\n" + MEINE);
  return (i >= 0 ? t.slice(0, i) : t).replace(/^\n+|\n+$/g, "");
}
export function tabellen(body) {
  const aus = [];
  let akt = null;
  for (const roh of inhaltVon(body).split("\n")) {
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
export function zeitplan(body, basis) {
  const aus = [];
  tabellen(body).forEach((t, ti) => {
    for (const z of t.zeilen) {
      let br = null, wo = -1;
      for (let i = 0; i < Math.min(3, z.length) && !br; i++) { br = bereich(z[i], basis); if (br) wo = i; }
      if (!br) continue;
      const rest = [];
      z.forEach((c, i) => {
        if (i === wo || !c) return;
        const spalte = t.kopf[i] || "";
        if (/^\d{1,2}$/.test(c) && (i < wo || /^(woche|kw|nr\.?|sitzung)$/i.test(spalte))) return;
        rest.push({ spalte, text: c });
      });
      if (rest.length) aus.push({ von: br.von, bis: br.bis, tabelle: ti + 1, zellen: rest });
    }
  });
  return aus.sort((x, y) => (x.von < y.von ? -1 : x.von > y.von ? 1 : x.tabelle - y.tabelle));
}
// Montag und Sonntag der Woche eines Tages
export function wocheVon(tag) {
  const mo = plusTage(tag, -((new Date(tag + "T00:00:00Z").getUTCDay() + 6) % 7));
  return { von: mo, bis: plusTage(mo, 6) };
}
