// Wegwerfen mit „Rückgängig“ (Bedien-Baustein, seit 0.4.6, Konsistenz-Audit Schritt 4): Was du selbst wegwirfst (eine leere
// Mitschrift, eine gewählte Übungsgruppe), geht sofort in den Papierkorb, und der Hinweis danach hat „Rückgängig“. Eine Rückfrage
// gibt es nur, wo etwas endgültig verloren ist (Trennen: Passwort bzw. Link sind auf dem Gerät weg; Daten aus Alma löschen).
//   ctx.papierkorb(datei, { text, still }) → Promise<bool>
// Ablauf: Inhalt merken, Datei in den einen Papierkorb (quellen.js papierkorb: Obsidians Einstellung „Gelöschte Dateien“, nie
// endgültig), Hinweis „„Name“ liegt im Papierkorb.“ (oder text) mit Rückgängig. Rückgängig legt die Datei mit demselben Inhalt am
// selben Ort wieder an (Ordner notfalls neu; ist der Name inzwischen vergeben, „Name 2“). still: ohne Hinweis.
// Doku: docs/architektur/bedien-bausteine.md. iOS-sicher: keine Node-APIs, kein Lookbehind.

// Pfad zum Wiederherstellen: der alte, sonst „Name 2.md“, „Name 3.md“ … (existiert(pfad) → bool); null, wenn keiner frei ist
const wiederPfad = (pfad, existiert) => {
  if (!existiert(pfad)) return pfad;
  const m = String(pfad).match(/^(.*?)(\.[^./]+)?$/);
  for (let i = 2; i < 100; i++) { const p = `${m[1]} ${i}${m[2] || ""}`; if (!existiert(p)) return p; }
  return null;
};

module.exports = function (ctx) {
  const app = ctx.app;
  const wegwerfen = async (f) => {
    const Q = ctx.user && ctx.user.quellen;
    if (Q && Q.papierkorb) return Q.papierkorb(app, f, { lokal: !!(ctx.plugin && ctx.plugin.testPapierkorbLokal) });
    return app.vault.trash(f, false);
  };
  const wiederherstellen = async (pfad, inhalt, text) => {
    const ziel = wiederPfad(pfad, (p) => !!app.vault.getAbstractFileByPath(p));
    if (!ziel) return null;
    const ordner = ziel.split("/").slice(0, -1).join("/");
    if (ordner && !app.vault.getAbstractFileByPath(ordner)) { try { await app.vault.createFolder(ordner); } catch (e) { /* gibt es schon */ } }
    return text ? app.vault.create(ziel, inhalt) : app.vault.createBinary(ziel, inhalt);
  };
  const papierkorb = async (f, o) => {
    o = o || {};
    if (!f || app.vault.getAbstractFileByPath(f.path) !== f) return false;
    const pfad = f.path, text = f.extension === "md";
    const inhalt = text ? await app.vault.read(f) : await app.vault.readBinary(f);
    await wegwerfen(f);
    if (!o.still) {
      ctx.hinweis(o.text || `„${f.basename}“ liegt im Papierkorb.`, { aktion: { text: "Rückgängig",
        ausfuehren: () => wiederherstellen(pfad, inhalt, text).catch((e) => { console.error("Papierkorb", e); ctx.hinweis("Das ließ sich nicht zurückholen. Die Datei liegt im Papierkorb."); }) } });
    }
    return true;
  };

  // Für alle Skripte (docs/architektur/bedien-bausteine.md): beim Laden gesetzt, wie ctx.hinweis
  ctx.papierkorb = papierkorb;
  return {
    papierkorb, wiederherstellen, wiederPfad,
    // Erweiterung, damit der Kern diese Datei beim Start aufruft und ctx.papierkorb setzt; anzumelden gibt es nichts
    registrieren() {},
  };
};
module.exports.wiederPfad = wiederPfad;
