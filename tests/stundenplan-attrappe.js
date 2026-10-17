// Attrappe für Stundenplan-Notizen (meine-gruppe.js, obsidianIo): Pfad → Text im Speicher, Frontmatter wie der metadataCache
// von Obsidian (einfaches YAML: Schlüssel, Zahlen, true/false, Texte in Anführungszeichen, Listen). Papierkorb als Liste.
"use strict";

const wert = (v) => {
  v = v.trim();
  if (v === "") return null;
  if (v === "[]") return [];
  if (v === "true" || v === "false") return v === "true";
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^".*"$/.test(v)) return JSON.parse(v);
  return v;
};
function frontmatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  let liste = null;
  for (const z of m[1].split(/\r?\n/)) {
    const l = z.match(/^\s+-\s*(.*)$/);
    if (l && liste) { fm[liste].push(wert(l[1])); continue; }
    const k = z.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (!k) continue;
    fm[k[1]] = wert(k[2]);
    liste = k[2].trim() === "" ? k[1] : null;
    if (liste) fm[liste] = [];
  }
  return fm;
}

// start: { Pfad: Text }; o.unfertig: true = Obsidian liest noch ein
function notizenIo(start, o) {
  o = o || {};
  const m = new Map(Object.entries(start || {}));
  const papierkorb = [], umbenannt = [];
  const io = {
    notizen: () => Array.from(m.keys()).filter((p) => p.indexOf("Stundenplan/") === 0).map((p) => ({ pfad: p, fm: frontmatter(m.get(p)) })),
    unfertig: () => !!o.unfertig,
    lesen: async (p) => m.get(p) || "",
    schreiben: async (p, t) => { if (!m.has(p)) throw new Error("fehlt: " + p); m.set(p, t); },
    anlegen: async (p, t) => { if (m.has(p)) throw new Error("gibt es schon: " + p); m.set(p, t); },
    papierkorb: async (p) => { if (m.delete(p)) papierkorb.push(p); },
    existiert: (p) => p === "Stundenplan" || m.has(p),
    ordnerAnlegen: async () => {},
    umbenennen: async (alt, neu) => { if (m.has(neu)) throw new Error("gibt es schon: " + neu); m.set(neu, m.get(alt)); m.delete(alt); umbenannt.push([alt, neu]); },
  };
  return { io, m, papierkorb, umbenannt, text: (p) => m.get(p), fm: (p) => frontmatter(m.get(p) || ""), pfade: () => Array.from(m.keys()).sort() };
}

module.exports = { notizenIo, frontmatter };
