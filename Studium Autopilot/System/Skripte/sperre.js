// Abrufer-Sperre (seit 0.4.5): DER gemeinsame Schreiber-Lock aller Quellen. Eine kleine synchronisierte Datei je Quelle sorgt
// dafür, dass nur ein Gerät abruft und schreibt („ein Schreiber“). Regeln wie bisher in zentral.js (abruf.json) und ilias.js
// (ilias-abruf.json); neue Quellen nehmen diese Bibliothek statt eigener Regeln (Noten & Anmeldungen, Volltext, ILIAS-Kalender),
// die vorhandenen ziehen nach. Doku: docs/architektur/quellen.md, „Abrufer-Sperre“.
//
// Aufruf (Bibliothek, startet nichts, kein Netz, keine Zeitgeber):
//   const S = ctx.user.sperre.erzeugen({
//     io: { lesen(pfad) → Promise<Text | null>, schreiben(pfad, text) → Promise },
//     quelle,               // Schlüssel der Quelle, z. B. "alma-konto" → Datei System/Daten/alma-konto-abruf.json
//     pfad,                 // statt quelle: Datei selbst (z. B. "System/Daten/abruf.json" der zentralen Daten)
//     geraetId() → "g-…",   // dieses Gerät (ctx.zentral.geraetId)
//     jetzt() → Date | ms,  // Uhr (Tests geben sie vor)
//     mobil,                // dieses Gerät ist ein iPhone/iPad
//     uebernahme = 80 Min., // so lange still (zuletzt), gilt die Sperre eines anderen Geräts als verlassen: Übernahme erlaubt
//     puls = 50 Min.,       // der Halter erneuert die Datei höchstens so oft (unter uebernahme)
//     computerVorrang = false, // ein Computer löst ein iPhone/iPad sofort ab (Volltext: PDFs lesen am PC)
//   });
//   await S.pruefen()  → { hier, anderes, darf, sperre }   hier: dieses Gerät hält die Sperre; anderes: ein anderes Gerät hält
//                         sie und war vor höchstens uebernahme aktiv (dann nicht laufen, außer „Hier laden“); darf = !anderes;
//                         sperre: Inhalt der Datei ({ geraet, seit, zuletzt, mobil, frei }) oder null
//   await S.nehmen({ erzwingen }) → true | false   nimmt die Sperre, wenn darf (erzwingen = Knopf „Hier laden“/„Hier prüfen“:
//                         auch gegen ein anderes Gerät); schreibt nur, wenn nötig (Wechsel, frei, Gerätart, älter als puls)
//   await S.puls()      → true | false   während eines langen Laufs: erneuert die Datei, wenn sie älter als puls ist; false,
//                         wenn ein anderes Gerät übernommen hat (Lauf beenden, nichts mehr schreiben)
//   await S.freigeben({ erzwingen }) → true | false   frei: true (ein anderes Gerät darf sofort übernehmen); nur die eigene
//                         Sperre, mit erzwingen auch eine fremde (der Aufrufer hat geprüft, dass ihr Halter schweigt; ILIAS gibt
//                         so verwaiste Gruppen-Notizen frei) – dann steht sie frei auf diesem Gerät
// Datei: { geraet, seit, zuletzt, mobil, frei? }. Weitere Felder einer Quelle in derselben Datei (z. B. „angewendet“ der zentralen
// Daten) bleiben beim Schreiben erhalten. Keine Namen, keine Daten der Quelle.
// Weiche Sperre: Zwei Geräte können sich über einen langsamen Sync kurz überschneiden. Darum schreibt jede Quelle nur Ergebnisse,
// die aus denselben Eingaben gleich herauskommen. Unlesbare Datei = keine Sperre.
// Tests: tests/sperre.test.js (auch: Vorgaben gleich ilias.js). iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at().
const MIN = 60e3;
const K = Object.freeze({ UEBERNAHME: 80 * MIN, PULS: 50 * MIN, ORDNER: "System/Daten" });
const FELDER = ["geraet", "seit", "zuletzt", "mobil", "frei"];

// Pfad der Sperre einer Quelle (Schlüssel aus Kleinbuchstaben, Ziffern und Bindestrich)
const pfadVon = (quelle) => {
  const q = String(quelle == null ? "" : quelle);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(q)) throw new Error("sperre: ungültige Quelle");
  return K.ORDNER + "/" + q + "-abruf.json";
};
const roh = (text) => {
  if (text == null) return null;
  try { const o = JSON.parse(String(text)); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch (e) { return null; }
};
const lesenAus = (text) => {
  const o = roh(text);
  if (!o || typeof o.geraet !== "string" || !o.geraet) return null;
  return { geraet: o.geraet, seit: String(o.seit || ""), zuletzt: String(o.zuletzt || ""), mobil: o.mobil === true, frei: o.frei === true };
};

const erzeugen = (o) => {
  if (!o || !o.io || typeof o.io.lesen !== "function" || typeof o.io.schreiben !== "function") throw new Error("sperre: io fehlt");
  const pfad = o.pfad || pfadVon(o.quelle);
  const uebernahme = o.uebernahme > 0 ? o.uebernahme : K.UEBERNAHME;
  const puls = o.puls > 0 ? Math.min(o.puls, uebernahme) : Math.min(K.PULS, uebernahme);
  const ms = () => { const t = o.jetzt ? o.jetzt() : Date.now(); return typeof t === "number" ? t : t.getTime(); };
  const iso = () => new Date(ms()).toISOString();
  const ich = () => String(o.geraetId());
  const alter = (s) => { const t = Date.parse(s || ""); return isNaN(t) ? Infinity : ms() - t; };
  const datei = async () => { try { return await o.io.lesen(pfad); } catch (e) { return null; } };
  // Schreiben: Sperrfelder neu, alle anderen Felder der Datei bleiben (z. B. „angewendet“ der zentralen Daten)
  const schreiben = async (a, alt) => {
    const rest = {};
    const r = roh(alt);
    if (r) for (const k of Object.keys(r)) if (FELDER.indexOf(k) < 0) rest[k] = r[k];
    const neu = Object.assign({ geraet: a.geraet, seit: a.seit, zuletzt: a.zuletzt, mobil: !!a.mobil }, a.frei ? { frei: true } : {}, rest);
    await o.io.schreiben(pfad, JSON.stringify(neu, null, 1) + "\n");
  };
  const stand = (a) => {
    const hier = !!a && a.geraet === ich() && !a.frei;
    // anderes: ein anderes Gerät war vor kurzem aktiv (nicht frei); ein Computer verdrängt ein iPhone/iPad (computerVorrang)
    const anderes = !!a && a.geraet !== ich() && !a.frei && alter(a.zuletzt) <= uebernahme && !(o.computerVorrang && !o.mobil && a.mobil);
    return { hier, anderes, darf: !anderes, sperre: a };
  };

  const pruefen = async () => stand(lesenAus(await datei()));
  const nehmen = async (x) => {
    const t = await datei(), a = lesenAus(t), p = stand(a);
    if (p.anderes && !(x && x.erzwingen)) return false;
    if (!p.hier || alter(a.zuletzt) >= puls || a.mobil !== !!o.mobil) await schreiben({ geraet: ich(), seit: p.hier && a.seit ? a.seit : iso(), zuletzt: iso(), mobil: o.mobil }, t);
    return true;
  };
  const pulsSchlagen = async () => {
    const t = await datei(), a = lesenAus(t), p = stand(a);
    if (a && !a.frei && a.geraet !== ich()) return false;
    if (!p.hier || alter(a.zuletzt) >= puls) await schreiben({ geraet: ich(), seit: p.hier && a.seit ? a.seit : iso(), zuletzt: iso(), mobil: o.mobil }, t);
    return true;
  };
  const freigeben = async (x) => {
    const t = await datei(), a = lesenAus(t), mein = !!a && a.geraet === ich();
    if (!(x && x.erzwingen) && (!mein || a.frei)) return false;
    await schreiben({ geraet: ich(), seit: mein && a.seit ? a.seit : iso(), zuletzt: iso(), mobil: o.mobil, frei: true }, t);
    return true;
  };
  return { pruefen, nehmen, puls: pulsSchlagen, freigeben, pfad, uebernahme, pulsMs: puls };
};

module.exports = function () { return { erzeugen, lesenAus, pfadVon, K }; };
module.exports.erzeugen = erzeugen;
module.exports.lesenAus = lesenAus;
module.exports.pfadVon = pfadVon;
module.exports.K = K;
