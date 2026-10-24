// Neue Fassung einer Unterlage (seit 0.6.9): eine Regel für alle Wege, auf denen eine Datei unter Unterlagen/ eine neuere
// Fassung bekommt (ilias.js, ein eigener Uni-Abgleich mit derselben Überschrift), und für alle drei Stufen der Begleitnotiz:
// ohne KI, mit eigenem Server, mit eigenem API-Schlüssel. Bibliothek ohne Obsidian (ctx.user.fassung), startet nichts. Doku: docs/architektur/unterlagen.md, „Neue Fassung
// einer Unterlage“. Tests: tests/fassung.test.js.
//
// 1. Was sich geändert hat (auch ohne KI): seitenVergleichen vergleicht die Seitentexte der alten und der neuen Textfassung
//    (volltext.js). Eine Seite der neuen Fassung, deren Text es in der alten schon gab, ist gleich, auch wenn sie verrutscht ist
//    (eingeschobene Folie); die übrigen sind neu oder geändert, alte ohne Gegenstück entfallen. Die Textfassung trägt das in
//    ihren Eigenschaften (vorher_sha256, geaendert, entfallen), der PDF-Kasten sagt es in einer Zeile (aenderungSatz), solange
//    die neue Fassung höchstens FASSUNG_TAGE alt ist.
// 2. Eine alte Zusammenfassung gilt nie still als aktuell: Nach dem Ersetzen heißt „## Das Wichtigste“ „## Das Wichtigste
//    (frühere Fassung, bis TT.MM.JJJJ)“ (ilias.js nachErsetzen; FRUEHER). veraltet(text) erkennt das; dann fasst der eigene
//    Server von selbst neu zusammen, mit API-Schlüssel der PDF-Kasten beim Öffnen (Grenzen in claude.js).
// 3. Kommt die neue Zusammenfassung, steht sie wieder unter „## Das Wichtigste“, die frühere darunter in einem eingeklappten
//    Kasten „Frühere Fassung (bis …)“ (einklappen; Kästen noch älterer Fassungen bleiben darunter). Auch eigener Text in diesem
//    Abschnitt steht dann im Kasten: Nichts geht verloren. Zu tun, Offene Fragen und Meine Notizen bleiben, wie sie sind.
// 4. Für Claude (Server und API-Schlüssel): kontext(text, vfm) nennt die frühere Zusammenfassung, die geänderten Seiten und was
//    unter „Zu tun“ und „Offene Fragen“ schon steht. So sagt die neue Zusammenfassung, was neu ist, und nichts kommt doppelt.
// 5. textAktuell: Eine Textfassung gehört nur zur PDF, wenn ihre Größe stimmt. Gleich nach dem Ersetzen ist sie noch die alte;
//    dann wartet die Zusammenfassung, statt die alte Fassung noch einmal zusammenzufassen.
// 6. Neue Fassung daneben (deine Datei war verändert, z. B. mit Anmerkungen): fruehereUebernehmen bringt die Zusammenfassung der
//    alten Notiz als frühere Fassung in die Notiz der neuen (dann gilt 2 auch dort), neuereKasten zeigt in der alten Notiz auf
//    die neue. Deine Datei und ihre Notiz bleiben sonst, wie sie sind.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const FASSUNG_TAGE = 30;
const FRUEHER = /^## Das Wichtigste \(frühere Fassung, bis (\d{2}\.\d{2}\.\d{4})\)[ \t]*$/;
const KASTEN = /^> \[!eba-info\][-+]? Frühere Fassung \(bis \d{2}\.\d{2}\.\d{4}\)/;
const NEUERE = /^> \[!eba-info\] Neuere Fassung\n(?:>[^\n]*(?:\n|$))*\n?/m;
// leerer Punkt oder Leerzeile (wie PLATZHALTER in server.js)
const LEER = /^\s*(?:[-*]\s*(?:\[ \]\s*)?)?$/;
const GRENZE = { punkte: 8, todos: 15, fragen: 10, zeichen: 300 };

const s = (v) => String(v == null ? "" : v);
const datumDe = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(iso)); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };
const datumIso = (de) => { const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s(de)); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };

// Notiz → { zeilen, start } (start = erste Zeile nach den Eigenschaften)
const zerlegen = (text) => {
  const zeilen = s(text).replace(/\r\n/g, "\n").split("\n");
  let start = 0;
  if (zeilen[0] === "---") { const e = zeilen.indexOf("---", 1); if (e > 0) start = e + 1; }
  return { zeilen, start };
};
const istPdf = (z) => /^>\s*\[!eba-pdf\]/.test(z);
// Abschnitt, dessen Überschrift passt → { kopf, von, bis } (bis: nächste Überschrift der Ebene 1 oder 2, PDF-Kasten, Ende) | null
const abschnitt = (zeilen, start, passt) => {
  for (let k = start; k < zeilen.length; k++) {
    if (!passt(zeilen[k].trim())) continue;
    let b = k + 1;
    while (b < zeilen.length && !/^#{1,2} /.test(zeilen[b]) && !istPdf(zeilen[b])) b++;
    return { kopf: k, von: k + 1, bis: b };
  }
  return null;
};
const gefuellt = (zeilen, a) => zeilen.slice(a.von, a.bis).some((z) => !LEER.test(z));

// Die Zusammenfassung gehört zu einer früheren Fassung: „Das Wichtigste (frühere Fassung, …)“ steht da, ein aktuelles
// „## Das Wichtigste“ mit Inhalt nicht
const veraltet = (text) => {
  const { zeilen, start } = zerlegen(text);
  if (!abschnitt(zeilen, start, (z) => FRUEHER.test(z))) return false;
  const a = abschnitt(zeilen, start, (z) => z === "## Das Wichtigste");
  return !(a && gefuellt(zeilen, a));
};
// Datum (JJJJ-MM-TT), bis zu dem die frühere Zusammenfassung galt, sonst ""
const veraltetSeit = (text) => {
  const { zeilen, start } = zerlegen(text);
  const a = abschnitt(zeilen, start, (z) => FRUEHER.test(z));
  return a ? datumIso(FRUEHER.exec(zeilen[a.kopf].trim())[1]) : "";
};

// Inhalt eines Abschnitts der früheren Fassung → { eigen: [Zeilen], kaesten: [[Zeilen eines älteren Kastens], …] }
const trennen = (zeilen) => {
  const eigen = [], kaesten = [];
  let kasten = null;
  for (const z of zeilen) {
    if (KASTEN.test(z)) { kasten = [z]; kaesten.push(kasten); continue; }
    if (kasten && /^>/.test(z)) { kasten.push(z); continue; }
    kasten = null;
    eigen.push(z);
  }
  while (eigen.length && LEER.test(eigen[0])) eigen.shift();
  while (eigen.length && LEER.test(eigen[eigen.length - 1])) eigen.pop();
  return { eigen, kaesten };
};
const kastenVon = (datum, eigen) => [`> [!eba-info]- Frühere Fassung (bis ${datum})`].concat(eigen.map((z) => (z.trim() ? "> " + z : ">")));

// Neue Punkte für „Das Wichtigste“ in eine Notiz mit früherer Fassung: Überschrift wieder „## Das Wichtigste“, darunter die neuen
// Punkte, dann die frühere Zusammenfassung eingeklappt, dann ältere Kästen. punkte: fertige Zeilen („- **Begriff:** …“)
// → neuer Text oder null (keine frühere Fassung, keine Punkte)
const einklappen = (text, punkte) => {
  if (!punkte || !punkte.length) return null;
  const { zeilen, start } = zerlegen(text);
  if (abschnitt(zeilen, start, (z) => z === "## Das Wichtigste")) return null;
  const a = abschnitt(zeilen, start, (z) => FRUEHER.test(z));
  if (!a) return null;
  const datum = FRUEHER.exec(zeilen[a.kopf].trim())[1];
  const { eigen, kaesten } = trennen(zeilen.slice(a.von, a.bis));
  const block = ["## Das Wichtigste"].concat(punkte, [""]);
  if (eigen.length) block.push(...kastenVon(datum, eigen), "");
  for (const k of kaesten) block.push(...k, "");
  zeilen.splice(a.kopf, a.bis - a.kopf, ...block);
  return zeilen.join("\n");
};

// Listenpunkt als reiner Text für Claude: ohne Aufzählungszeichen, Haken, Fettdruck und Links („[[x.pdf#page=3|S. 3]]“ → „S. 3“)
const punktRein = (z) => s(z).replace(/^\s*>?\s*[-*]\s*(?:\[[ xX]\]\s*)?/, "").replace(/\*\*/g, "")
  .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1").replace(/\[\[([^\]]*)\]\]/g, "$1").replace(/\s*→\s*/g, " ").replace(/\s+/g, " ").trim()
  .slice(0, GRENZE.zeichen);
const punkteIn = (zeilen, a, max) => (a ? zeilen.slice(a.von, a.bis).filter((z) => /^\s*[-*]\s/.test(z) && !LEER.test(z)).map(punktRein).filter(Boolean).slice(0, max) : []);

// Was Claude für eine neue Zusammenfassung wissen soll. text = Begleitnotiz, vfm = Eigenschaften der aktuellen Textfassung
// → { frueher: [Punkte der früheren Zusammenfassung], bis (JJJJ-MM-TT), geaendert ("12–14"), entfallen (Zahl), zu_tun: [...],
// fragen: [...] } ohne leere Felder, oder null, wenn nichts davon da ist
const kontext = (text, vfm) => {
  const { zeilen, start } = zerlegen(text);
  const aus = {};
  const f = abschnitt(zeilen, start, (z) => FRUEHER.test(z));
  if (f && veraltet(text)) {
    const frueher = trennen(zeilen.slice(f.von, f.bis)).eigen.filter((z) => /^\s*[-*]\s/.test(z) && !LEER.test(z)).map(punktRein).filter(Boolean).slice(0, GRENZE.punkte);
    if (frueher.length) { aus.frueher = frueher; aus.bis = datumIso(FRUEHER.exec(zeilen[f.kopf].trim())[1]); }
    const v = vfm || {};
    if (/^[0-9a-f]{64}$/.test(s(v.vorher_sha256))) {
      if (s(v.geaendert).trim()) aus.geaendert = s(v.geaendert).trim().slice(0, 200);
      if (Number(v.entfallen) > 0) aus.entfallen = Math.round(Number(v.entfallen));
    }
  }
  const t = punkteIn(zeilen, abschnitt(zeilen, start, (z) => /^## Zu tun\b/.test(z)), GRENZE.todos);
  const q = punkteIn(zeilen, abschnitt(zeilen, start, (z) => /^## Offene Fragen\b/.test(z)), GRENZE.fragen);
  if (t.length) aus.zu_tun = t;
  if (q.length) aus.fragen = q;
  return Object.keys(aus).length ? aus : null;
};

// kontext() als Text für Claude (claude.js; der eigene Server baut denselben Kopf in server/dienst.mjs) → Zeilen oder ""
const kontextText = (k) => {
  if (!k) return "";
  const z = [];
  const liste = (l) => l.map((p) => "- " + p);
  if (k.frueher) z.push(`Frühere Fassung: Die Notiz hatte eine Zusammenfassung der früheren Fassung dieser Unterlage (bis ${datumDe(k.bis)}):`, ...liste(k.frueher));
  if (k.geaendert || k.entfallen) {
    z.push([k.geaendert ? `Neu oder geändert: S. ${k.geaendert}.` : "", k.entfallen ? `Entfallen: ${k.entfallen} ${k.entfallen === 1 ? "Seite" : "Seiten"}.` : ""].filter(Boolean).join(" "));
  }
  if (k.zu_tun) z.push("Steht schon unter „Zu tun“:", ...liste(k.zu_tun));
  if (k.fragen) z.push("Steht schon unter „Offene Fragen“:", ...liste(k.fragen));
  return z.join("\n");
};

// Gehört die Textfassung (Eigenschaften vfm) zur PDF, wie sie jetzt ist? Größe in Bytes
const textAktuell = (vfm, groesse) => !!vfm && Number(groesse) > 0 && Number(vfm.groesse) === Number(groesse);

// ---------- Was sich geändert hat (ohne KI) ----------
const seiteRein = (t) => s(t).replace(/\s+/g, " ").trim().toLowerCase();
// alt, neu: [[Seitennummer, Text], …] → { neu: [Seiten neu oder geändert], weg: Zahl alter Seiten ohne Gegenstück }. Leere Seiten
// zählen nicht. Gleich ist eine Seite, deren Text es in der anderen Fassung gibt (gleich oft), auch an anderer Stelle.
const seitenVergleichen = (alt, neu) => {
  const vorrat = {};
  for (const [, t] of alt || []) { const k = seiteRein(t); if (k) vorrat[k] = (vorrat[k] || 0) + 1; }
  const aus = { neu: [], weg: 0 };
  for (const [nr, t] of neu || []) {
    const k = seiteRein(t);
    if (!k) continue;
    if (vorrat[k]) vorrat[k]--; else aus.neu.push(Number(nr));
  }
  for (const k of Object.keys(vorrat)) aus.weg += vorrat[k];
  return aus;
};
// [3, 7, 8, 9, 12] → „3, 7–9, 12“
const seitenText = (nrs) => {
  const l = (nrs || []).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  const teile = [];
  for (let i = 0; i < l.length; i++) {
    let j = i;
    while (j + 1 < l.length && l[j + 1] === l[j] + 1) j++;
    teile.push(j > i ? `${l[i]}–${l[j]}` : String(l[i]));
    i = j;
  }
  return teile.join(", ");
};
// Zeile im PDF-Kasten. x: { datum (JJJJ-MM-TT, aktualisiert der Begleitnotiz), vfm (aktuelle Textfassung oder null), seiten
// (Seiten der neuen Fassung), heute (JJJJ-MM-TT) } → Satz oder "" (keine neue Fassung oder älter als FASSUNG_TAGE)
const aenderungSatz = (x) => {
  const d = s(x && x.datum).slice(0, 10);
  if (!datumDe(d)) return "";
  if (x.heute && (Date.parse(x.heute) - Date.parse(d)) / 864e5 > FASSUNG_TAGE) return "";
  const vorne = `Neue Fassung vom ${datumDe(d)}`;
  const v = x.vfm;
  if (!v || !/^[0-9a-f]{64}$/.test(s(v.vorher_sha256))) return vorne + ".";
  const g = s(v.geaendert).trim(), weg = Math.round(Number(v.entfallen) || 0), n = Number(x.seiten) || Number(v.seiten) || 0;
  const wegText = weg ? `${weg} ${weg === 1 ? "Seite" : "Seiten"} entfallen` : "";
  if (!g && !weg) return vorne + ", der Text ist gleich geblieben.";
  if (g && n && g === (n > 1 ? `1–${n}` : "1")) return vorne + ", durchgehend neu oder geändert.";
  return vorne + ": " + [g ? `S. ${g} neu oder geändert` : "", wegText].filter(Boolean).join(", ") + ".";
};

// ---------- Neue Fassung daneben ----------
// Stelle für einen Abschnitt bzw. Kasten nach dem Titel: erste Zeile mit Inhalt nach „# …“ (sonst Ende)
const nachTitel = (zeilen, start) => {
  const t = zeilen.findIndex((z, k) => k >= start && /^# /.test(z));
  const i = t < 0 ? -1 : zeilen.findIndex((z, k) => k > t && z.trim() !== "");
  return i < 0 ? zeilen.length : i;
};
// Zusammenfassung der alten Notiz (aktuell oder schon frühere Fassung) als frühere Fassung in die Notiz der neuen, vor die
// Datei (PDF-Kasten, Link). datum (JJJJ-MM-TT): ab wann die neue Fassung da ist → neuer Text oder null (nichts zu übernehmen,
// oder die neue Notiz hat schon „Das Wichtigste“)
const fruehereUebernehmen = (altText, neuText, datum) => {
  const A = zerlegen(altText), N = zerlegen(neuText);
  if (abschnitt(N.zeilen, N.start, (z) => z === "## Das Wichtigste" || FRUEHER.test(z))) return null;
  let a = abschnitt(A.zeilen, A.start, (z) => z === "## Das Wichtigste"), bis = datumDe(datum);
  if (!a || !gefuellt(A.zeilen, a)) {
    a = abschnitt(A.zeilen, A.start, (z) => FRUEHER.test(z));
    if (a) bis = FRUEHER.exec(A.zeilen[a.kopf].trim())[1];
  }
  if (!a || !bis || !gefuellt(A.zeilen, a)) return null;
  const inhalt = A.zeilen.slice(a.von, a.bis);
  while (inhalt.length && !inhalt[inhalt.length - 1].trim()) inhalt.pop();
  const block = [`## Das Wichtigste (frühere Fassung, bis ${bis})`].concat(inhalt, [""]);
  let pos = N.zeilen.findIndex((z, k) => k >= N.start && (istPdf(z) || /^\*\*PDF öffnen:\*\*/.test(z) || /^!?\[\[/.test(z)));
  if (pos < 0) { while (N.zeilen.length > N.start && !N.zeilen[N.zeilen.length - 1].trim()) N.zeilen.pop(); pos = N.zeilen.length; }
  if (pos > N.start && N.zeilen[pos - 1].trim()) block.unshift("");
  N.zeilen.splice(pos, 0, ...block);
  return N.zeilen.join("\n");
};
// Kasten „Neuere Fassung“ in der alten Notiz setzen oder auf die neueste ändern. name: Name der neuen Notiz (ohne .md),
// datum (JJJJ-MM-TT) → neuer Text (gleich, wenn er schon so dasteht)
const neuereKasten = (text, name, datum) => {
  const kasten = `> [!eba-info] Neuere Fassung\n> Am ${datumDe(datum)} kam eine neuere Fassung dieser Unterlage: [[${name}]]. Deine Datei hier bleibt, wie sie ist.\n\n`;
  const t = s(text);
  if (NEUERE.test(t)) return t.replace(NEUERE, () => kasten);
  const { zeilen, start } = zerlegen(t);
  const i = nachTitel(zeilen, start);
  if (i >= zeilen.length) return t.replace(/\n*$/, "\n\n") + kasten.replace(/\n+$/, "\n");
  return zeilen.slice(0, i).join("\n") + (i ? "\n" : "") + kasten + zeilen.slice(i).join("\n");
};

const API = {
  FASSUNG_TAGE, FRUEHER, veraltet, veraltetSeit, einklappen, kontext, kontextText, textAktuell, seitenVergleichen, seitenText, aenderungSatz,
  fruehereUebernehmen, neuereKasten, punktRein,
};
module.exports = function () { return API; };
Object.assign(module.exports, API);
