// Feld-Register (seit 0.4.5, Konsistenz-Audit Schritt 3): Angaben, die du an mehreren Stellen machst (Einrichtung, Formular
// „Deine Angaben“, Zeilen „Variante“, Befehl „Variante wählen“, Modulfeld), haben EINE Beschreibung: gespeicherter Wert,
// Reihenfolge, Wörter und Prüfung. Bibliothek ohne Obsidian (ctx.user.felder), startet nichts. Doku: docs/architektur.md,
// „Feld-Register“. Tests: tests/felder.test.js. Neue Eingaben, die an mehr als einer Stelle vorkommen, kommen hierher.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const text = (v) => String(v == null ? "" : v).trim();

// ---------- Variante (System/Einstellungen.md, variante) ----------
// Gespeichert wird der Wert („offen“, solange du nicht gewählt hast); gezeigt der Titel, im Satz kleingeschrieben („noch offen“).
const VARIANTE = Object.freeze({
  feld: "variante",
  vorgabe: "offen",
  werte: Object.freeze(["Economics", "Business Administration", "ohne Spezialisierung", "offen"]), // Reihenfolge überall
  titel: Object.freeze({ Economics: "Economics", "Business Administration": "Business Administration", "ohne Spezialisierung": "Ohne Spezialisierung", offen: "Noch offen" }),
  kurz: Object.freeze({
    Economics: "Mehr Volkswirtschaftslehre", "Business Administration": "Mehr Betriebswirtschaftslehre",
    "ohne Spezialisierung": "Von beidem etwas", offen: "Du wählst sie vor dem 3. Fachsemester.",
  }),
});
// Gespeicherter Wert aus dem Frontmatter; Unbekanntes gilt als „offen“
const varianteLesen = (fm) => { const v = text(fm && fm.variante); return VARIANTE.werte.indexOf(v) >= 0 ? v : VARIANTE.vorgabe; };
// Eingabe (Wert oder Titel, Groß- und Kleinschreibung egal, auch „noch offen“) → Wert oder null
const varianteFinden = (s) => {
  const v = text(s).toLowerCase();
  if (!v) return null;
  for (const w of VARIANTE.werte) if (w.toLowerCase() === v || VARIANTE.titel[w].toLowerCase() === v) return w;
  return null;
};
const varianteTitel = (w) => VARIANTE.titel[w] || VARIANTE.titel.offen;
// im Satz: „Variante: noch offen“, „Variante: ohne Spezialisierung“
const varianteImSatz = (w) => (w === "offen" ? "noch offen" : w === "ohne Spezialisierung" ? w : varianteTitel(w));

// ---------- Studienbeginn (System/Einstellungen.md, studienbeginn) ----------
// Gespeichert: Datum JJJJ-MM-TT (Beginn eines Semesters). Leer heißt „Aktuelles Semester“ und wandert mit (Formular); die
// Einrichtung trägt dagegen bewusst ein festes Datum ein (der Studienbeginn soll beim Semesterwechsel nicht mitwandern).
const STUDIENBEGINN = Object.freeze({ feld: "studienbeginn", leer: "Aktuelles Semester" });
const studienbeginnLesen = (fm) => { const v = text(fm && fm.studienbeginn).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; };
const studienbeginnLeerTitel = (jetzt) => STUDIENBEGINN.leer + (jetzt ? ` (${jetzt})` : "");

// ---------- Noten ----------
// Note eines Moduls (Modulfeld, Frontmatter note): 1,0 bis 4,0 in Zehnteln oder 5,0; gespeichert mit Komma. Leer = keine Note.
const NOTE = Object.freeze({ feld: "note", beispiel: "z. B. 1,7", fehler: "Bitte wie 1,7 eingeben, von 1,0 bis 5,0." });
const notePruefen = (s) => {
  const v = text(s).replace(".", ",");
  if (!v) return { ok: true, wert: "" };
  const m = v.match(/^([1-5]),(\d)$/);
  return m && (+m[1] < 5 || m[2] === "0") ? { ok: true, wert: v } : { ok: false, fehler: NOTE.fehler };
};
// Zielnote (Einstellungen, zielnote): 1,0 bis 4,0 mit höchstens zwei Nachkommastellen; „2“ → „2,0“. Leer erlaubt.
const ZIELNOTE = Object.freeze({ feld: "zielnote", beispiel: "z. B. 2,0", hilfe: "Deine Zielnote (1,0 bis 4,0)." });
const zielnotePruefen = (s) => {
  const v = text(s);
  if (!v) return { ok: true, wert: "" };
  const m = v.match(/^([1-4])(?:[.,](\d{1,2}))?$/);
  if (!m) return { ok: false, fehler: "Das ist keine Note. Bitte eine Zahl von 1,0 bis 4,0 eingeben." };
  const n = Number(m[1] + "." + (m[2] || "0"));
  if (n < 1 || n > 4) return { ok: false, fehler: "Die Note muss zwischen 1,0 und 4,0 liegen." };
  return { ok: true, wert: `${m[1]},${m[2] || "0"}` };
};

const API = { VARIANTE, varianteLesen, varianteFinden, varianteTitel, varianteImSatz, STUDIENBEGINN, studienbeginnLesen, studienbeginnLeerTitel,
  NOTE, notePruefen, ZIELNOTE, zielnotePruefen };
module.exports = function () { return API; };
Object.assign(module.exports, API);
