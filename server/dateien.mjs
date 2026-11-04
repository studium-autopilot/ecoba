// Dateien in Ordnern, die ein anderer Benutzer beschreiben kann (server/README.md, „Wer was liest und schreibt“): Der Lauf übernimmt
// Unterlagen und Anstoß des Web-Dienstes und die Rohdaten des Abrufs, der Zustand liest, was der Lauf schreibt. Wer dort liest,
// umbenennt oder löscht, folgt nie einem Link und nimmt nur echte Dateien und Ordner: Sonst könnte ein übernommener Web-Dienst eine
// Datei durch einen Link auf die Claude-Anmeldung ersetzen, und der Lauf läse sie und schriebe sie dorthin zurück, wo der Dienst sie
// sieht. Unter Linux sorgt O_NOFOLLOW dafür ohne Lücke zwischen Prüfen und Öffnen; lstat davor und der Vergleich mit fstat danach
// fangen dasselbe auf Systemen ohne O_NOFOLLOW (Windows, nur für die Tests).
import { randomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OHNE_LINK = constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0);

// lstat ohne Ausnahme → Stats oder null (fehlt)
export const art = (pfad) => {
  try { return lstatSync(pfad); } catch (e) { return null; }
};
// echte Datei bzw. echter Ordner; ein Link zählt als keins von beiden, auch wenn er auf eins zeigt
export const istDatei = (pfad) => !!art(pfad)?.isFile();
export const istOrdner = (pfad) => !!art(pfad)?.isDirectory();
// irgendetwas an dieser Stelle, auch ein Link ins Leere (existsSync folgte ihm und sähe nichts)
export const da = (pfad) => art(pfad) !== null;

// Inhalt einer echten Datei, höchstens max Bytes → Buffer oder null (fehlt, Link, Ordner, FIFO, zu groß, ausgetauscht)
export function dateiLesen(pfad, max = 64 * 1024 * 1024) {
  const vorher = art(pfad);
  if (!vorher || !vorher.isFile() || vorher.size > max) return null;
  let fd;
  try { fd = openSync(pfad, OHNE_LINK); } catch (e) { return null; }
  try {
    const s = fstatSync(fd);
    if (!s.isFile() || s.size > max || s.ino !== vorher.ino || s.dev !== vorher.dev) return null;
    const b = readFileSync(fd);
    return b.length > max ? null : b;
  } catch (e) {
    return null;
  } finally {
    closeSync(fd);
  }
}
// JSON aus einer echten Datei, sonst ersatz
export function jsonLesen(pfad, ersatz, max = 16 * 1024 * 1024) {
  const b = dateiLesen(pfad, max);
  if (!b) return ersatz;
  try { return JSON.parse(b.toString("utf8")); } catch (e) { return ersatz; }
}

// Schreibt fertig oder gar nicht: über eine Zwischendatei mit Zufallsnamen, exklusiv angelegt (wx: scheitert an allem, was dort
// schon liegt, auch an einem Link), dann umbenannt. rename ersetzt den Eintrag selbst, ein Link an seiner Stelle wird nicht befolgt.
// modus: Rechte der Datei, unabhängig von der UMask des Dienstes (etwa 0o640, damit der Web-Dienst über die Gruppe liest). sicher: die
// Zwischendatei vor dem Umbenennen auf die Platte (fsync), damit nach einem Absturz nie eine leere Datei übrig bleibt (für Dateien, deren
// Inhalt etwas sperrt, etwa trennen/alle)
export function schreibenAtomar(pfad, inhalt, modus, sicher = false) {
  const zwischen = `${pfad}.${randomBytes(6).toString("hex")}.neu`;
  const fd = openSync(zwischen, "wx", modus ?? 0o666);
  try {
    writeFileSync(fd, inhalt);
    if (modus != null) fchmodSync(fd, modus);
    if (sicher) fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    rmSync(zwischen, { force: true });
    throw e;
  }
  closeSync(fd);
  try { renameSync(zwischen, pfad); } catch (e) { rmSync(zwischen, { force: true }); throw e; }
}

// Was in ordner (rekursiv) weder echte Datei noch echter Ordner ist (Links, FIFOs, Sockets, Geräte), löschen. Für Ordner, die ein
// anderer Benutzer gefüllt hat, nachdem sie in einen Ordner gewandert sind, den nur dieser Dienst beschreibt (Rohdaten im Lauf-Ordner).
// → Zahl der gelöschten Einträge
export function nurDateienUndOrdner(ordner) {
  let n = 0;
  let eintraege = [];
  try { eintraege = readdirSync(ordner, { withFileTypes: true }); } catch (e) { return 0; }
  for (const e of eintraege) {
    const p = join(ordner, e.name);
    const s = art(p);
    if (s && s.isDirectory()) n += nurDateienUndOrdner(p);
    else if (s && !s.isFile()) { rmSync(p, { force: true }); n++; }
  }
  return n;
}
