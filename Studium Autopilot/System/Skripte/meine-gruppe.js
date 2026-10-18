// Deine Übungs- oder Tutoriengruppe im Stundenplan (Plan Abschnitt 27.1, Punkt 1). Bibliothek für ilias.js (Gruppen aus deinen
// ILIAS-Mitgliedschaften) und gruppen.js (Knopf „Meine“ im Codeblock eba-gruppen); startet selbst nichts. Ohne KI: Quellen sind
// nur deine ILIAS-Mitgliedschaften und gruppen.json der zentralen Daten.
//
// Zeitfenster aus ILIAS (zeitfenster): Gruppentitel und -beschreibung nennen Tag, Zeit und Raum frei formuliert („Gruppe 4:
//   Dienstag 10 - 12, Hörsaal 11 (…)“, „Gruppe 4 - Mi. 8:00 - 10:00 - Hörsaal 1 (…)“, „Tutorium 1 - Dienstag, 08:15 - 09: 45
//   Uhr“). Klammerzusätze fallen vorher weg (dort stehen oft Namen von Tutor:innen). Gelesen werden nur Wochentag, Beginn, Ende
//   und die Raumnummer hinter einem Raumwort. Nicht raten: kein oder mehr als ein Wochentag, keine oder mehr als eine Zeitspanne
//   → kein Zeitfenster. „14.10 - 16.12“ ist ein Datum, keine Uhrzeit (Punkt-Minuten nur als :00, :15, :30, :45).
// Name (gruppenName): „Gruppe 4“, „Tutorium 1“ vom Anfang des ILIAS-Titels, nie mehr. ILIAS und Alma zählen Gruppen verschieden
//   (S100: ILIAS „Gruppe 4“ = Alma Gr. 5); die Notiz zeigt den ILIAS-Namen, die Alma-Nummer steht nur in gruppe_alma.
// Zuordnung (zuordnen) zu gruppen.json: gleicher Code, gleiches Semester, gleicher Wochentag, Beginn und Ende höchstens 15 Min.
//   daneben (c.t./s.t.: gemessen an der Alma-Zeit und an der um 15 Min. verschobenen). Bleiben mehrere, entscheidet die
//   Raumnummer, dann die kleinere Abweichung; sonst „mehrdeutig“ mit den Kandidaten. Nie über die Nummer.
// Notizen in Stundenplan/ (typ lehrveranstaltung, Felder wie die zentralen Notizen, damit Wochenraster und Listen sie zeigen):
//   herkunft: ilias-gruppe (ilias_gruppe = ref_id der ILIAS-Gruppe) schreibt NUR ilias.js auf dem Gerät mit der ILIAS-Sperre;
//   herkunft: gruppe-gewaehlt schreibt gruppen.js (Knopf „Meine“, Aufräumen beim Zeichnen) und ilias.js nur beim Freigeben
//   (iliasFreigeben: Trennen, Anmeldung abgelehnt, verwaist; aus ILIAS-Notizen werden gewählte). Dateiname mit „(ILIAS)“ bzw.
//   „(gewählt)“ am Ende, nie gleich dem einer Alma-, zentralen oder anderen Notiz; ältere Namen werden umbenannt (Links ziehen
//   mit). Felder für die Anzeige: titel
//   („<Modul> · Tutorium Gruppe 4“), gruppe (Name, wie die Quelle ihn nennt), gruppe_alma (Nummer in gruppen.json), gruppe_id,
//   konflikt (Name einer anderen Stundenplan-Notiz, die sich zeitlich überschneidet; fehlt sonst).
//   Eine Regel für alle Quellen: Deckt schon eine andere Notiz dieselbe Gruppe (Alma, von Hand oder zentral: Code, Semester,
//   Wochentag, Beginn ±15 Min.), weicht die Gruppen-Notiz. Eigener Text darin wandert einmal in die andere Notiz, dann Papierkorb
//   (wie bei zentralen Vorlesungen, wenn Alma sie auch hat); steht er dort schon (ein anderes Gerät war schneller), nicht noch
//   einmal. Eine ILIAS-Notiz verdrängt gewählte Notizen desselben Moduls und
//   derselben Art (übernimmt die erste, die übrigen weichen), Doppel derselben ILIAS-Gruppe weichen in die erste.
//   alma.js und zentral.js fassen beide Herkünfte nie an.
// Eigener Text: alles unter „## Meine Notizen“ (ältere Notizen: „## Notizen“) und jede Zeile im Kopf, die nicht von hier stammt, bleibt beim Aktualisieren.
// Verlassen in ILIAS: die Notiz geht in den Papierkorb; mit eigenem Text bleibt sie als „(entfällt)“. Ob verlassen, entscheidet
//   ilias.js (zweiter Lauf in Folge, o.wegErlaubt); zusätzlich bleibt alles stehen, wenn auf einmal mindestens zwei und mehr
//   als die Hälfte fehlen (Warnung).
// Zugriff: ctx.user["meine-gruppe"](ctx) → Funktionen unten plus obsidianIo(); ohne Aufruf nur die reinen Funktionen.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.

const ORDNER = "Stundenplan";
const ILIAS = "ilias-gruppe";
const GEWAEHLT = "gruppe-gewaehlt";
const ZENTRAL = "zentral";
const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const TAGE_LANG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const TOLERANZ = 15;
const NOTIZEN = "## Meine Notizen";
const ABSCHNITT = /^## (?:Meine Notizen|Notizen)[ \t]*$/m; // auch die Überschrift älterer Notizen
const INFO_ILIAS = "> [!info] Aus ILIAS: Verlässt du die Gruppe dort, verschwindet diese Notiz.";
const INFO_GEWAEHLT = "> [!info] Von dir gewählt, ändern auf [[Termine & Anmeldungen]].";
// Arten, die eine Übungsgruppe sein können (Alma erkennt die Art nicht immer: „Veranstaltung“ oder leer), nie eine Vorlesung
const UEBUNG = ["Übung", "Tutorium", "Übungsteil", "Veranstaltung", ""];

const pad = (n) => String(n).padStart(2, "0");
const J = (v) => JSON.stringify(v == null ? "" : String(v));
const minuten = (hm) => { const m = String(hm == null ? "" : hm).match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const uhr = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const mdText = (s) => String(s).replace(/[\\`*_\[\]<>#|!$%~=^{}]/g, "\\$&");
const dmy = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
const basis = (p) => String(p).slice(String(p).lastIndexOf("/") + 1).replace(/\.md$/i, "");

// ---------- Zeitfenster aus ILIAS-Text ----------
const TAG_LANG = /(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag)s?/gi;
const TAG_KURZ = /\b(Mo|Di|Mi|Do|Fr|Sa|MO|DI|MI|DO|FR|SA)\b\.?(?=\s*,?\s*\d)/g;
const SPANNE = /(\d{1,2})(?:\s?([:.])\s?(\d{2}))?\s*(?:Uhr\s*)?(?:-|–|—|bis)\s*(\d{1,2})(?:\s?([:.])\s?(\d{2}))?(?!\d|\.\d)/g;
const VIERTEL = ["00", "15", "30", "45"];
const RAUM_WORT = /(Hörsaal|Hoersaal|Seminarraum|Übungsraum|Raum|HS|SR)(?![A-Za-zÄÖÜäöüß])/i;
const NUMMER = /[A-Z]?\d+(?:[.,]\d+)?[A-Z]?/i;
// Raumnummer zum Vergleichen: Großbuchstaben, führende Nullen je Zahl weg („001“ → „1“, „Hörsaal 0.02“ → „0.2“), ohne Klammern
const raumKern = (s) => {
  const vor = String(s == null ? "" : s).split("(")[0];
  const w = RAUM_WORT.exec(vor);
  const m = NUMMER.exec(w ? vor.slice(w.index + w[0].length) : vor);
  return m ? m[0].toUpperCase().replace(",", ".").replace(/\d+/g, (z) => String(Number(z))) : "";
};
// ILIAS-Text: Raumnummer nur hinter einem Raumwort (sonst wäre „Do 8-10 und Fr 12-14“ Raum 12)
const raumNachWort = (s) => { const vor = String(s || "").split("(")[0], w = RAUM_WORT.exec(vor); return w ? raumKern(vor.slice(w.index)) : ""; };
// text → { tag: "Mo"…"Sa", beginn: "HH:MM", ende: "HH:MM", raum: Raumnummer | "" } oder null
const zeitfenster = (text) => {
  const s = String(text == null ? "" : text).replace(/\([^()]*\)|\[[^\]]*\]/g, " ").replace(/\s+/g, " ");
  const tage = [];
  let m;
  for (const re of [TAG_LANG, TAG_KURZ]) {
    re.lastIndex = 0;
    while ((m = re.exec(s))) tage.push({ i: m.index, e: m.index + m[0].length, t: m[1].slice(0, 2).toLowerCase() });
  }
  if (!tage.length || tage.some((x) => x.t !== tage[0].t)) return null;
  tage.sort((a, b) => a.i - b.i);
  const spannen = {};
  let erste = null;
  SPANNE.lastIndex = tage[0].e;
  while ((m = SPANNE.exec(s))) {
    const punkt = m[2] === "." || m[5] === ".";
    if (punkt && (VIERTEL.indexOf(m[3] || "00") < 0 || VIERTEL.indexOf(m[6] || "00") < 0)) continue; // ein Datum, keine Uhrzeit
    const b = Number(m[1]) * 60 + Number(m[3] || 0), e = Number(m[4]) * 60 + Number(m[6] || 0);
    if (Number(m[3] || 0) > 59 || Number(m[6] || 0) > 59 || b < 7 * 60 || e > 22 * 60 || e - b < 30 || e - b > 240) continue;
    if (!erste) erste = { b, e, ende: m.index + m[0].length };
    spannen[b + "-" + e] = true;
  }
  if (!erste || Object.keys(spannen).length > 1) return null;
  return { tag: TAGE.find((x) => x.toLowerCase() === tage[0].t), beginn: uhr(erste.b), ende: uhr(erste.e), raum: raumNachWort(s.slice(erste.ende)) };
};
// Name der Gruppe am Anfang des ILIAS-Titels („Gruppe 4“, „Tutorium 1“, „Übungsgruppe 3a“), sonst ""; nie mehr vom Titel
const NAME = /^\s*(Übungsgruppe|Tutoriengruppe|Tutorengruppe|Gruppe|Tutorium|Übung|Group|Tutorial)\s*(?:Nr\.?\s*)?(\d{1,3}[a-zA-Z]?)(?![\dA-Za-z])/i;
const gruppenName = (titel) => {
  const m = NAME.exec(String(titel == null ? "" : titel));
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + " " + m[2] : "";
};

// ---------- Zuordnung zu gruppen.json ----------
// Abstand der ILIAS-Zeit zur Alma-Zeit (c.t.: auch zur verschobenen), null = mehr als TOLERANZ
const abstand = (ist, alma, ct, n) => {
  const a = minuten(ist), b = minuten(alma);
  if (a == null || b == null) return null;
  const d = Math.min(Math.abs(a - b), ct ? Math.abs(a - b - n) : Infinity);
  return d > TOLERANZ ? null : d;
};
// slot = zeitfenster(…), code, liste = geprüfte Gruppen (zentral), semester → { status: "zugeordnet", id } | { status:
// "mehrdeutig", kandidaten: [ids] } | { status: "ohne-treffer" } | { status: "ohne-zeit" } | { status: "ohne-code" }
const zuordnen = (slot, code, liste, semester) => {
  if (!code) return { status: "ohne-code" };
  if (!slot || !slot.tag || !slot.beginn) return { status: "ohne-zeit" };
  let k = [];
  for (const g of liste || []) {
    if (!g || g.code !== code || g.semester !== semester || g.tag !== slot.tag) continue;
    const db = abstand(slot.beginn, g.von, g.ct, TOLERANZ);
    const de = slot.ende ? abstand(slot.ende, g.bis, g.ct, -TOLERANZ) : 0;
    if (db == null || de == null) continue;
    k.push({ g, d: db + de });
  }
  if (!k.length) return { status: "ohne-treffer" };
  if (k.length > 1 && slot.raum) { const r = k.filter((x) => raumKern(x.g.raum) === slot.raum); if (r.length) k = r; }
  if (k.length > 1) { const min = Math.min.apply(null, k.map((x) => x.d)); const b = k.filter((x) => x.d === min); if (b.length === 1) k = b; }
  return k.length === 1 ? { status: "zugeordnet", id: k[0].g.id } : { status: "mehrdeutig", kandidaten: k.map((x) => x.g.id).sort() };
};

// ---------- Notiz ----------
// Name, wie ihn die Notiz zeigt: aus ILIAS („Gruppe 4“), sonst die Nummer aus gruppen.json („Gruppe 5“)
const nameFuer = (g, o) => (o && o.name) || (g.gruppe ? "Gruppe " + g.gruppe : "");
// „Tutorium Gruppe 4“, „Tutorium 1“ (Name beginnt schon mit der Art), „Übung“ (ohne Name)
const anzeigeFuer = (g, name) => (!name ? g.art : name.toLowerCase().indexOf(String(g.art).toLowerCase()) === 0 ? name : g.art + " " + name);
const echteZeit = (g) => ({ beginn: g.ct ? uhr(minuten(g.von) + 15) : g.von, ende: g.ct ? uhr(minuten(g.bis) - 15) : g.bis });
// Dateiname: „Di 10.15 S100 Tutorium Gruppe 4 (ILIAS)“ bzw. „… (gewählt)“. Die Klammer am Ende unterscheidet ihn immer von
// den Namen der Alma-, zentralen und anderen Stundenplan-Notizen („Di 10.15 S100 Tutorium“), so will nie ein zweiter Schreiber
// dieselbe Datei. o = { herkunft, name } wie bei notizText.
const dateiName = (g, o) => {
  o = o || {};
  const zusatz = o.herkunft === GEWAEHLT ? " (gewählt)" : " (ILIAS)";
  return `${g.tag} ${echteZeit(g).beginn.replace(":", ".")} ${g.code} ${anzeigeFuer(g, nameFuer(g, o))}${zusatz}`.replace(/[\\/:*?"<>|#^\[\]]/g, "-");
};
// Frontmatter in Blöcke je Schlüssel (Listen gehören zum Schlüssel davor) und Rest
const teilen = (text) => {
  const m = String(text || "").match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { bloecke: [], body: String(text || "") };
  const bloecke = [];
  for (const z of m[1].split(/\r?\n/)) {
    const k = z.match(/^([A-Za-z_][\w-]*):/);
    if (k || !bloecke.length) bloecke.push({ key: k ? k[1] : "", zeilen: [z] }); else bloecke[bloecke.length - 1].zeilen.push(z);
  }
  return { bloecke, body: String(text).slice(m[0].length) };
};
const EIGEN = ["typ", "titel", "code", "modul", "art", "wochentag", "tag", "beginn", "ende", "raum", "semester", "von", "bis", "ausfall",
  "einzeltermin", "gruppe", "gruppe_alma", "gruppe_id", "quelle", "herkunft", "ilias_gruppe", "konflikt", "entfaellt", "uebersicht", "tags", "cssclasses"];
const listenWerte = (b) => (b ? b.zeilen.slice(1).map((z) => z.replace(/^\s*-\s*/, "").trim().replace(/^["']|["']$/g, "")).filter(Boolean) : []);
// Kopfzeilen, die von hier stammen: Überschrift, Zeitzeile, Zeitraum, Info-Kasten (auch ältere aufklappbare mit ihren „> “-Zeilen)
const fremderKopf = (body) => {
  const i = body.search(ABSCHNITT);
  const aus = [];
  let kasten = false;
  for (const z of (i < 0 ? body : body.slice(0, i)).split(/\r?\n/)) {
    if (/^> \[!info\]/.test(z)) { kasten = true; continue; }
    if (kasten && /^>/.test(z)) continue;
    kasten = false;
    if (!z.trim() || /^# /.test(z) || /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)s, \d/.test(z) || /^\d\d\.\d\d\.\d{4} – \d\d\.\d\d\.\d{4}$/.test(z)) continue;
    aus.push(z);
  }
  return aus.join("\n").trim();
};
// Eigener Text: Zeilen im Kopf, die nicht von hier stammen, und alles unter „## Meine Notizen“ (leere Aufzählungspunkte zählen nicht)
const meineNotizen = (text) => {
  const { body } = teilen(text);
  const i = body.search(ABSCHNITT);
  const unten = i < 0 ? "" : body.slice(i).replace(/^## (?:Meine Notizen|Notizen)[ \t]*\r?\n?/, "").split(/\r?\n/).filter((z) => !/^\s*(?:[-*+]\s*)?$/.test(z)).join("\n").trim();
  return [fremderKopf(body), unten].filter(Boolean).join("\n");
};
const kurzTitel = (s, n) => {
  s = String(s || "").trim();
  if (s.length <= n) return s;
  const w = s.split(/\s+/);
  let aus = "";
  for (const x of w) { const t = aus ? aus + " " + x : x; if (t.length > n) break; aus = t; }
  const teile = aus.split(" ");
  while (teile.length > 1 && /^(für|und|in|im|der|die|das|des|dem|den|zu|zur|zum|von|vom|mit|am|an|auf|of|and|the|for|to)[,;:–-]*$/i.test(teile[teile.length - 1])) teile.pop();
  return teile.join(" ").replace(/[\s,;:–-]+$/, "") || s.slice(0, n);
};
// Inhalt einer Gruppen-Notiz. alt = bisheriger Text oder "", g = geprüfte Gruppe (gruppen.json), o = { herkunft, iliasGruppe,
// name (aus ILIAS), modulLink, kurz (Modultitel), konflikt }. Eigene Felder, Tags und eigener Text (meineNotizen) bleiben.
const notizText = (alt, g, o) => {
  o = o || {};
  const { bloecke, body } = teilen(alt || "");
  const z = echteZeit(g), wt = TAGE.indexOf(g.tag) + 1;
  const kurz = kurzTitel(o.kurz || g.code, 48), name = nameFuer(g, o), anzeige = anzeigeFuer(g, name);
  const liste = (k, werte) => (werte.length ? [k + ":"].concat(werte.map((w) => "  - " + w)) : [k + ": []"]);
  const vereinigt = (k, pflicht) => { const w = listenWerte(bloecke.find((b) => b.key === k) || null); pflicht.slice().reverse().forEach((p) => { if (w.indexOf(p) < 0) w.unshift(p); }); return w; };
  const ilias = o.herkunft === ILIAS;
  const zeilen = [
    "typ: lehrveranstaltung", "titel: " + J(kurz + " · " + anzeige), "code: " + J(g.code),
    "modul:" + (o.modulLink ? " " + J(o.modulLink) : ""), "art: " + J(g.art), "wochentag: " + wt, "tag: " + g.tag, "beginn: " + J(z.beginn),
    "ende: " + J(z.ende), "raum: " + J(g.raum), "semester: " + J(g.semester),
  ].concat(g.zeitraum ? ["von: " + g.zeitraum.von, "bis: " + g.zeitraum.bis] : [], ["ausfall: []", "einzeltermin: false", "gruppe: " + J(name),
    "gruppe_alma: " + J(g.gruppe), "gruppe_id: " + g.id, "quelle: " + J(g.quelle_url), "herkunft: " + (ilias ? ILIAS : GEWAEHLT)],
  ilias ? ["ilias_gruppe: " + J(o.iliasGruppe)] : [], o.konflikt ? ["konflikt: " + J(o.konflikt)] : [], ['uebersicht: "[[Stundenplan]]"'],
  liste("tags", vereinigt("tags", ["stundenplan"])), liste("cssclasses", vereinigt("cssclasses", ["eba-s-notizen"])));
  for (const b of bloecke) if (b.key && EIGEN.indexOf(b.key) < 0) Array.prototype.push.apply(zeilen, b.zeilen);
  const kopf = [`# ${mdText(g.code)} · ${mdText(anzeige)}`, "", `${TAGE_LANG[wt - 1]}s, ${z.beginn}–${z.ende}` + (g.raum ? " · " + mdText(g.raum) : ""), ""];
  if (g.zeitraum) kopf.push(`${dmy(g.zeitraum.von)} – ${dmy(g.zeitraum.bis)}`, "");
  kopf.push(ilias ? INFO_ILIAS : INFO_GEWAEHLT, "");
  const fremd = fremderKopf(body);
  if (fremd) kopf.push(fremd, "");
  const i = body.search(ABSCHNITT);
  return "---\n" + zeilen.join("\n") + "\n---\n\n" + kopf.join("\n") + "\n" + (i >= 0 ? body.slice(i) : NOTIZEN + "\n- \n");
};

// ---------- Abgleich mit den Notizen ----------
const herkunftVon = (fm) => String((fm && fm.herkunft) || "");
const istGruppe = (fm) => herkunftVon(fm) === ILIAS || herkunftVon(fm) === GEWAEHLT;
const gleichesModul = (fm, g) => String(fm.code || "") === g.code && String(fm.art || "") === g.art && String(fm.semester || "") === g.semester;
// Ist die Notiz (fm) deine Gruppe g aus gruppen.json? DIE eine Regel für alle (ilias.js und gruppen.js über deckt, termine.js für
// „angemeldet · Gruppe 4“, gruppen.js für „Meine“): gleicher Code und gleiches Semester, nicht entfallen, gleicher Wochentag,
// Beginn höchstens 15 Min. daneben (an der echten und an der Alma-Zeit, c.t./s.t.), Art kann eine Übung sein. Nie über die
// Nummer der Gruppe (ILIAS und Alma zählen verschieden). o = { arten (statt UEBUNG, z. B. nur Übung und Tutorium), ende (das Ende
// ebenso ±15 Min.), ueberId (Gruppen-Notizen, ilias-gruppe und gruppe-gewaehlt, über ihre gruppe_id) }
const gehoertZu = (fm, g, o) => {
  o = o || {};
  if (!fm || !g || String(fm.code || "") !== g.code || String(fm.semester || "") !== g.semester || fm.entfaellt === true) return false;
  if (o.ueberId && fm.gruppe_id && istGruppe(fm)) return String(fm.gruppe_id) === g.id;
  if ((o.arten || UEBUNG).indexOf(String(fm.art == null ? "" : fm.art)) < 0 || Number(fm.wochentag) !== TAGE.indexOf(g.tag) + 1) return false;
  if (abstand(fm.beginn, g.von, g.ct, TOLERANZ) == null) return false;
  return !o.ende || abstand(fm.ende, g.bis, g.ct, -TOLERANZ) != null;
};
// Deckt eine andere Notiz die Gruppe? (gehoertZu mit den Vorgaben)
const deckt = (fm, g) => gehoertZu(fm, g);
const lehrNotizen = (io) => io.notizen().filter((x) => x.fm && x.fm.typ === "lehrveranstaltung");
// Passt der Pfad zum gewünschten Namen (auch „… 2“, wenn der Name belegt war)?
const nameStimmt = (pfad, b) => { const n = basis(pfad); return n === b || (n.indexOf(b + " ") === 0 && /^\d+$/.test(n.slice(b.length + 1))); };
// Notiz unter ihren gewünschten Namen bringen; Links ziehen mit (io.umbenennen = fileManager.renameFile). → neuer Pfad
const umbenennen = async (io, pfad, b) => {
  if (!io.umbenennen || nameStimmt(pfad, b)) return pfad;
  const neu = freierPfad(io, b);
  await io.umbenennen(pfad, neu);
  return neu;
};
const freierPfad = (io, b) => {
  let p = `${ORDNER}/${b}.md`, i = 2;
  while (io.existiert(p)) p = `${ORDNER}/${b} ${i++}.md`;
  return p;
};
// Zeitliche Überschneidung (Konflikt): gleiches Semester, gleicher Wochentag, Zeiten überlappen; nicht entfallen, keine
// Einzeltermine, nicht dieselbe Gruppe. eigen = { semester, wochentag, b, e, id }, andere = [{ name, fm }] → Name oder ""
const zeitVon = (fm) => ({ semester: String(fm.semester || ""), wochentag: Number(fm.wochentag), b: minuten(fm.beginn), e: minuten(fm.ende), id: String(fm.gruppe_id || "") });
const konfliktFuer = (eigen, andere) => {
  for (const x of andere) {
    const fm = x.fm || {};
    if (fm.entfaellt === true || fm.einzeltermin === true) continue;
    const z = zeitVon(fm);
    if (z.b == null || z.e == null || (eigen.id && z.id === eigen.id)) continue;
    if (z.semester === eigen.semester && z.wochentag === eigen.wochentag && z.b < eigen.e && eigen.b < z.e) return x.name;
  }
  return "";
};
const zeitFuer = (g) => { const z = echteZeit(g); return { semester: g.semester, wochentag: TAGE.indexOf(g.tag) + 1, b: minuten(z.beginn), e: minuten(z.ende), id: g.id }; };
// Gruppen-Notiz weicht einer anderen Notiz: eigener Text wandert einmal dorthin, dann Papierkorb. Steht er dort schon (ein
// anderes Gerät hat dieselbe Notiz eben weichen lassen, ihr Papierkorb kam noch nicht per Sync), nicht noch einmal.
const weichen = async (io, x, ziel, heute) => {
  const meine = meineNotizen(await io.lesen(x.pfad));
  if (meine) {
    const t = await io.lesen(ziel.pfad);
    if (t.indexOf(meine) < 0) await io.schreiben(ziel.pfad, t.replace(/\s*$/, "") + `\n\nAus der Notiz zu deiner Gruppe übernommen (${dmy(heute || "")}):\n\n${meine}\n`);
  }
  await io.papierkorb(x.pfad);
};
// ILIAS (nur ilias.js, nur mit der ILIAS-Sperre). soll = [{ refId, g, name }] (zugeordnete Mitgliedschaften, name aus ILIAS),
// mitglieder = alle ref_ids, in denen du gerade Mitglied bist (auch nicht zugeordnete), o = { modul(code) → { name, titel } |
// null, heute, wegErlaubt(refId) → bool (Verlassen bestätigt), geloescht(refId, id) → bool (Grabstein: für diese Gruppe gab es
// schon eine Notiz, du hast sie gelöscht; ilias.js merkt sich das im Index) }.
// → { angelegt, aktualisiert, uebernommen, umbenannt, gewichen, entfernt, entfaellt: [Pfade], geloescht: [refIds], notizen:
//   { refId: Pfad } (Gruppen mit ILIAS-Notiz nach dem Lauf), warnung }
const iliasAbgleichen = async (io, soll, mitglieder, o) => {
  o = o || {};
  const b = { angelegt: [], aktualisiert: [], uebernommen: [], umbenannt: [], gewichen: [], entfernt: [], entfaellt: [], geloescht: [], notizen: {}, warnung: "" };
  const alle = lehrNotizen(io);
  const eigene = alle.filter((x) => herkunftVon(x.fm) === ILIAS);
  const gewaehlt = alle.filter((x) => herkunftVon(x.fm) === GEWAEHLT);
  const andere = alle.filter((x) => !istGruppe(x.fm));
  const unfertig = io.unfertig ? io.unfertig() : false;
  const benutzt = {}, plan = [];
  if (!io.existiert(ORDNER)) await io.ordnerAnlegen(ORDNER);
  // 1. Je Gruppe: weichen (eine andere Notiz hat sie) oder planen (vorhandene ILIAS-Notiz, sonst eine gewählte, sonst neu)
  for (const s of soll) {
    const g = s.g, refId = String(s.refId);
    const gleiche = eigene.filter((x) => String(x.fm.ilias_gruppe || "") === refId && !benutzt[x.pfad]);
    const gew = gewaehlt.filter((y) => !benutzt[y.pfad] && gleichesModul(y.fm, g));
    const ziel = andere.find((x) => deckt(x.fm, g));
    if (ziel) {
      for (const x of gleiche.concat(gew)) { await weichen(io, x, ziel, o.heute); benutzt[x.pfad] = true; b.gewichen.push(x.pfad); }
      continue;
    }
    const m = o.modul ? o.modul(g.code) : null;
    const opt = { herkunft: ILIAS, iliasGruppe: refId, name: s.name || "", modulLink: m ? `[[${m.name}]]` : "", kurz: m ? m.titel : "" };
    const x = gleiche[0] || gew[0] || null;
    const rest = gleiche.concat(gew).filter((y) => y !== x);
    for (const y of gleiche.concat(gew)) benutzt[y.pfad] = true;
    if (!x && unfertig) continue; // Obsidian liest Stundenplan/ noch ein (Sync): nichts doppelt anlegen
    if (!x && o.geloescht && o.geloescht(refId, g.id)) { b.geloescht.push(refId); continue; } // von dir gelöscht: bleibt weg
    plan.push({ x, g, opt, rest, uebernommen: !!x && herkunftVon(x.fm) === GEWAEHLT });
  }
  // 2. Überschneidungen mit allen anderen Notizen dieses Plans und im Stundenplan (ohne die, die gerade weichen)
  const sicht = alle.filter((x) => !benutzt[x.pfad]).map((x) => ({ name: basis(x.pfad), fm: x.fm }))
    .concat(plan.map((p) => ({ name: p.x ? basis(p.x.pfad) : dateiName(p.g, p.opt), fm: { semester: p.g.semester, wochentag: TAGE.indexOf(p.g.tag) + 1, beginn: echteZeit(p.g).beginn, ende: echteZeit(p.g).ende, gruppe_id: p.g.id } })));
  // 3. Schreiben; Doppel und übrige gewählte Notizen weichen in die eine
  for (const p of plan) {
    const eigenName = p.x ? basis(p.x.pfad) : dateiName(p.g, p.opt);
    p.opt.konflikt = konfliktFuer(zeitFuer(p.g), sicht.filter((y) => y.name !== eigenName));
    if (p.x) {
      const alt = await io.lesen(p.x.pfad), neu = notizText(alt, p.g, p.opt);
      if (neu !== alt) { await io.schreiben(p.x.pfad, neu); (p.uebernommen ? b.uebernommen : b.aktualisiert).push(p.x.pfad); }
      const pfad = await umbenennen(io, p.x.pfad, dateiName(p.g, p.opt)); // älterer Name, andere Gruppe, übernommen
      if (pfad !== p.x.pfad) { b.umbenannt.push(pfad); p.x = { pfad }; }
    } else {
      const pfad = freierPfad(io, dateiName(p.g, p.opt));
      await io.anlegen(pfad, notizText("", p.g, p.opt));
      b.angelegt.push(pfad);
      p.x = { pfad };
    }
    for (const y of p.rest) { await weichen(io, y, p.x, o.heute); b.gewichen.push(y.pfad); }
    b.notizen[String(p.opt.iliasGruppe)] = p.x.pfad;
  }
  // 4. Verlassen: nicht mehr Mitglied und von ilias.js bestätigt → Papierkorb bzw. „(entfällt)“; Schutz gegen eine leere oder
  // kaputte Mitgliederseite
  const erlaubt = o.wegErlaubt || (() => true);
  const weg = eigene.filter((x) => !benutzt[x.pfad] && !mitglieder.has(String(x.fm.ilias_gruppe || "")) && x.fm.entfaellt !== true && erlaubt(String(x.fm.ilias_gruppe || "")));
  if (weg.length >= 2 && weg.length > eigene.length / 2) {
    b.warnung = `${weg.length} Gruppen fehlen auf deiner ILIAS-Seite „Meine Kurse und Gruppen“ – nichts entfernt.`;
    return b;
  }
  for (const x of weg) {
    const text = await io.lesen(x.pfad);
    if (!meineNotizen(text)) { await io.papierkorb(x.pfad); b.entfernt.push(x.pfad); continue; }
    const t = teilen(text);
    const zeilen = t.bloecke.map((bl) => (bl.key === "titel" && !/\(entfällt\)"?$/.test(bl.zeilen[0]) ? [bl.zeilen[0].replace(/"?$/, (q) => " (entfällt)" + q)] : bl.zeilen))
      .reduce((a, z) => a.concat(z), []).filter((z) => !/^entfaellt:/.test(z)).concat(["entfaellt: true"]);
    await io.schreiben(x.pfad, "---\n" + zeilen.join("\n") + "\n---\n" + t.body.replace(/^(?!\r?\n)/, "\n"));
    b.entfaellt.push(x.pfad);
  }
  return b;
};

// „Meine Gruppe“ (nur gruppen.js, auf dem Gerät, auf dem du tippst). g = gewählte Gruppe, o = { modul(code) }.
// → { art: "angelegt" | "geaendert" | "gleich" | "ilias" (kommt schon aus ILIAS) | "gedeckt" (andere Notiz hat sie), pfad }
const waehlen = async (io, g, o) => {
  o = o || {};
  const alle = lehrNotizen(io);
  const il = alle.find((x) => herkunftVon(x.fm) === ILIAS && gleichesModul(x.fm, g) && x.fm.entfaellt !== true);
  if (il) return { art: "ilias", pfad: il.pfad };
  const ziel = alle.find((x) => !istGruppe(x.fm) && deckt(x.fm, g));
  if (ziel) return { art: "gedeckt", pfad: ziel.pfad };
  const m = o.modul ? o.modul(g.code) : null;
  const da = alle.find((x) => herkunftVon(x.fm) === GEWAEHLT && gleichesModul(x.fm, g));
  const name = da ? basis(da.pfad) : dateiName(g, { herkunft: GEWAEHLT });
  const konflikt = konfliktFuer(zeitFuer(g), alle.filter((x) => x !== da).map((x) => ({ name: basis(x.pfad), fm: x.fm })).filter((x) => x.name !== name));
  const soll = { herkunft: GEWAEHLT, modulLink: m ? `[[${m.name}]]` : "", kurz: m ? m.titel : "", konflikt };
  if (da) {
    const alt = await io.lesen(da.pfad), neu = notizText(alt, g, soll);
    if (neu !== alt) await io.schreiben(da.pfad, neu);
    const pfad = await umbenennen(io, da.pfad, dateiName(g, soll));
    return { art: neu === alt && pfad === da.pfad ? "gleich" : "geaendert", pfad };
  }
  if (!io.existiert(ORDNER)) await io.ordnerAnlegen(ORDNER);
  const pfad = freierPfad(io, dateiName(g, soll));
  await io.anlegen(pfad, notizText("", g, soll));
  return { art: "angelegt", pfad };
};
// Wahl zurücknehmen: die gewählte Notiz dieses Moduls und dieser Art geht in den Papierkorb (wiederherstellbar)
const abwaehlen = async (io, g) => {
  const x = lehrNotizen(io).find((y) => herkunftVon(y.fm) === GEWAEHLT && gleichesModul(y.fm, g));
  if (!x) return false;
  await io.papierkorb(x.pfad);
  return true;
};
// Aufräumen (nur gruppen.js): Gewählte Notizen, die eine ILIAS-Notiz desselben Moduls und derselben Art oder eine andere Notiz
// (Alma, von Hand, zentral) zur selben Zeit inzwischen abdeckt, weichen. → [Pfade]
const gewaehltAufraeumen = async (io, heute) => {
  const alle = lehrNotizen(io), aus = [];
  for (const x of alle.filter((y) => herkunftVon(y.fm) === GEWAEHLT)) {
    const fm = x.fm, g = { code: String(fm.code || ""), art: String(fm.art || ""), semester: String(fm.semester || ""), tag: TAGE[Number(fm.wochentag) - 1], von: fm.beginn, ct: false };
    const il = alle.find((y) => herkunftVon(y.fm) === ILIAS && y.fm.entfaellt !== true && gleichesModul(y.fm, g));
    // Ist sie genau die freigegebene Fassung dieser ILIAS-Notiz (iliasFreigeben auf einem anderen Gerät, Umbenennen per Sync
    // erst halb da), verschwindet die ILIAS-Notiz gleich: nicht weichen, sonst gingen beide samt deinem Text verloren.
    if (il && freigabeText(await io.lesen(il.pfad)) === (await io.lesen(x.pfad))) continue;
    const ziel = il || alle.find((y) => !istGruppe(y.fm) && deckt(y.fm, g));
    if (!ziel) continue;
    await weichen(io, x, ziel, heute);
    aus.push(x.pfad);
  }
  return aus;
};
// Text einer ILIAS-Notiz nach dem Freigeben (null: ohne Frontmatter); auch für das Aufräumen (gewaehltAufraeumen)
const freigabeText = (alt) => {
  const t = teilen(String(alt || ""));
  if (!t.bloecke.length) return null;
  const zeilen = t.bloecke.filter((bl) => bl.key !== "ilias_gruppe").map((bl) => (bl.key === "herkunft" ? ["herkunft: " + GEWAEHLT] : bl.zeilen))
    .reduce((a, z) => a.concat(z), []);
  const body = t.body.replace(/^(?!\r?\n)/, "\n"), i = body.search(ABSCHNITT);
  const kopf = (i < 0 ? body : body.slice(0, i)).replace(/^> \[!info\][^\n]*(?:\n>[^\n]*)*/m, INFO_GEWAEHLT);
  return "---\n" + zeilen.join("\n") + "\n---\n" + kopf + (i < 0 ? "" : body.slice(i));
};
// Freigeben (nur ilias.js, nur das Gerät, das die ILIAS-Notizen schreibt: Trennen, Anmeldung abgelehnt, verwaist): Aus jeder
// ILIAS-Notiz wird eine gewählte. Deine Gruppe bleibt im Stundenplan mit ihrem ILIAS-Namen, „Meine“ kann sie danach ändern.
// Geändert werden nur herkunft, ilias_gruppe (fällt weg), der Info-Kasten im Kopf und der Name („… (gewählt)“); Felder, Tags
// und eigener Text bleiben. Entfallene bleiben, wie sie sind (sie sperren nichts). Jedes Gerät kommt zum selben Text; liegt er
// unter dem neuen Namen schon da (ein anderes Gerät war schneller), geht die alte Notiz nur in den Papierkorb. → [neue Pfade]
const iliasFreigeben = async (io) => {
  const aus = [];
  for (const x of lehrNotizen(io).filter((y) => herkunftVon(y.fm) === ILIAS && y.fm.entfaellt !== true)) {
    const alt = await io.lesen(x.pfad), neu = freigabeText(alt);
    if (neu == null) continue;
    const name = basis(x.pfad).replace(/ \(ILIAS\)(?: \d+)?$/, "") + " (gewählt)", da = `${ORDNER}/${name}.md`;
    if (da !== x.pfad && io.existiert(da) && (await io.lesen(da)) === neu) { await io.papierkorb(x.pfad); continue; }
    if (neu !== alt) await io.schreiben(x.pfad, neu);
    aus.push(await umbenennen(io, x.pfad, name));
  }
  return aus;
};

const API = { ORDNER, ILIAS, GEWAEHLT, ZENTRAL, zeitfenster, raumKern, gruppenName, zuordnen, notizText, dateiName, echteZeit, meineNotizen,
  deckt, gehoertZu, istGruppe, iliasAbgleichen, waehlen, abwaehlen, gewaehltAufraeumen, iliasFreigeben, konfliktFuer, kurzTitel };

// Mit ctx: dazu obsidianIo() (Stundenplan-Notizen über die Obsidian-API; Papierkorb über quellen.js, ein Papierkorb für alles)
module.exports = function (ctx) {
  const obsidianIo = () => {
    const app = window.app, V = app.vault;
    const Q = ctx && ctx.user && ctx.user.quellen;
    const datei = (p) => { const f = V.getAbstractFileByPath(p); return f && !f.children ? f : null; };
    const inOrdner = () => V.getMarkdownFiles().filter((f) => f.path.indexOf(ORDNER + "/") === 0);
    return {
      notizen: () => inOrdner().map((f) => { const c = app.metadataCache.getFileCache(f); return { pfad: f.path, fm: (c && c.frontmatter) || null }; }),
      unfertig: () => inOrdner().some((f) => !app.metadataCache.getFileCache(f)),
      lesen: async (p) => { const f = datei(p); return f ? V.read(f) : ""; },
      schreiben: async (p, t) => { const f = datei(p); if (f) await V.modify(f, t); },
      anlegen: async (p, t) => { await V.create(p, t); },
      papierkorb: async (p) => { const f = datei(p); if (f) await (Q && Q.papierkorb ? Q.papierkorb(app, f) : V.trash(f, false)); },
      existiert: (p) => !!V.getAbstractFileByPath(p),
      ordnerAnlegen: async (p) => { try { await V.createFolder(p); } catch (e) { if (!V.getAbstractFileByPath(p)) throw e; } },
      // umbenennen mit dem fileManager: Links auf die Notiz ziehen mit
      umbenennen: async (alt, neu) => { const f = datei(alt); if (f) await app.fileManager.renameFile(f, neu); },
    };
  };
  return Object.assign({}, API, { obsidianIo });
};
Object.assign(module.exports, API);
