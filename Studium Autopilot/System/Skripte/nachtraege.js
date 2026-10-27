// Nachträge in Notizen (seit 0.6.9). Ändert eine Version, was Studium Autopilot beim Anlegen in eine Notiz schreibt, bleibt in
// Notizen älterer Versionen der alte Wert stehen: Das Update fasst Notizen nie an (docs/architektur/update.md). Meist schadet
// das nicht, weil die Ansichten neu rechnen. Steht dort aber ein geratener Wert in einem Feld, das heute als deine Wahl gilt,
// bleibt er für immer. Dafür nennt NACHTRAEGE je Fall, welche Notizen welche Felder zurückbekommen.
// Jeder Nachtrag läuft einmal je Tresor: auf dem Gerät, das für alle schreibt (ctx.zentral.abruferHier, wie modell.js), eine
// Minute nach dem Start, danach stündlich, bis er durch ist (ein anderes Gerät schrieb gerade, Daten fehlten noch); erledigte
// stehen in System/Daten/nachtraege.json (synchronisiert, nicht in der Vorlage). Felder ändert er über processFrontMatter. Den Text
// einer Notiz nur dort, wo ein Block noch genau so dasteht, wie eine ältere Version ihn erzeugt hat (seit 0.7.0, erst
// folien-kopf); was du geschrieben hast, bleibt. Scheitert ein Schreiben, bleibt der Nachtrag offen und läuft beim nächsten Mal
// noch einmal (schon Geändertes trifft er dann nicht mehr).
// Neuer Fall: Eintrag in NACHTRAEGE mit id (nie ändern) und aendern(notizen, M) → [{ f, felder }] bzw. [{ f, text }] (text =
// Funktion alter Text → neuer Text; gibt sie ihn unverändert zurück, schreibt nichts) oder null (geht noch nicht, später wieder);
// notizen = alle Notizen [{ f, fm }], vor dem Nachtrag gelesen, M = ctx.modell. Doku: docs/architektur/update.md, „Nachträge in
// Notizen“. Kein Node-API, keine Lookbehind-Regex.
module.exports = function (ctx) {
  const app = window.app;
  const DATEI = "System/Daten/nachtraege.json";
  const WARTEN = 60e3; // nach dem Start: Notizen und Datenmodell sind dann gelesen
  const WIEDER = 60 * 60e3;

  const text = (v) => (v == null ? "" : String(v).trim());
  const s10 = (v) => text(v).slice(0, 10);
  const liste = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
  const nfc = (s) => { try { return s.normalize("NFC"); } catch (e) { return s; } };
  // Link oder Pfad → vergleichbarer Name: ohne [[ ]], Anzeigetext und Abschnitt
  const linkName = (v) => { const s = text(v), m = s.match(/^\[\[([^\]|#]+)/); return nfc((m ? m[1] : s).trim()); };
  const nummer = (fm) => { const z = Number(fm.nummer); return text(fm.nummer) !== "" && isFinite(z) ? z : Infinity; };
  const klassen = (fm) => liste(fm.cssclasses).join(" ").split(/[\s,]+/).filter(Boolean);
  // Seitenkopf aus HTML, wie ihn die Lesefassung der Folien bis 19.10.2026 schrieb, direkt nach den Eigenschaften: Pfad (Modul,
  // Unterlagen, „Folien 00 · Einführung“), als Titel der Name des Moduls, darunter Dozent und Lehrstuhl
  const KOPF_ALT = /^(---\r?\n[\s\S]*?\r?\n---\r?\n\s*)<div class="eba-kopf">\r?\n<div class="eba-pfad">.*<\/div>\r?\n<h1>[^<\n]*<\/h1>\r?\n(?:<div class="eba-meta">.*<\/div>\r?\n)?<\/div>\r?\n/;
  // Titel einer Begleitnotiz wie unterlagen.js (begleitnotiz): „B110 · Folien 00 · Einführung“
  const titelZeile = (fm) => [text(fm.code), [text(fm.art), text(fm.nummer) !== "" ? text(fm.nummer).padStart(2, "0") : ""].filter(Boolean).join(" "),
    text(fm.titel)].filter(Boolean).join(" · ");
  const folienKopf = (t, fm) => { const z = titelZeile(fm); return z ? String(t).replace(KOPF_ALT, (alles, vorn) => vorn + "# " + z + "\n") : t; };
  // Spalte „Notiz“ in „Zum Modul“ auf der Modulseite, wie sie bis 0.6.14 jede Modulnotiz bekam: Name aus dem Dateinamen, darin
  // „–“ statt „:“ („Tutorien starten – BWL“) und „Mo 14.15“. Seit 0.7.0 der Titel eines Termins, die Uhrzeit mit Doppelpunkt.
  const NOTIZ_ALT = `notiz: 'file.asLink(file.basename.replace(/^\\d{4}-\\d{2}-\\d{2}\\s+/, "").replace(code + " ", ""))'`;
  const NOTIZ_NEU = `notiz: 'file.asLink(if(typ == "termin" && titel, titel.toString().replace(code + " ", ""), file.basename.replace(/^\\d{4}-\\d{2}-\\d{2}\\s+/, "").replace(/^(\\S+ \\d{1,2})\\.(\\d{2}) /, "$1:$2 ").replace(code + " ", "")))'`;
  const notizSpalte = (t) => String(t).split(NOTIZ_ALT).join(NOTIZ_NEU);
  // Reihenfolge in „Zum Modul“: bis 0.6.14 nach Datum absteigend, also Termine rückwärts und der Stundenplan (ohne Datum) in
  // zufälliger Folge. Seit 0.7.0 nach Datum aufsteigend, dann nach Wochentag und Beginn.
  const REIHE_ALT = ">     sort:\n>       - property: formula.wann\n>         direction: DESC\n>     columnSize:";
  const REIHE_NEU = ">     sort:\n>       - property: formula.wann\n>         direction: ASC\n>       - property: wochentag\n>         direction: ASC\n>       - property: beginn\n>         direction: ASC\n>     columnSize:";
  const reihenfolge = (t) => String(t).split(REIHE_ALT).join(REIHE_NEU);

  const NACHTRAEGE = [
    // Bis 0.6.2 riet notizen.js die Folien beim Anlegen (eba.folienZu): die Folien gleicher Nummer, sonst die der vorigen
    // Vorlesungsnotiz des Moduls, sonst die mit der kleinsten Nummer. Seit 0.6.3 (24.10.2026) gilt das Feld folien als deine
    // Wahl, darum erschienen in diesen Notizen später hochgeladene Folien nie (modell.js folienVon). Leer wählt das Modell
    // selbst. Nur Notizen bis zum 24.10.2026 (datum ist dort der Tag des Anlegens); ein Wert, der keiner der drei Regeln
    // entspricht, hast du selbst eingetragen und bleibt.
    { id: "folien-geraten", aendern: (notizen) => {
      const folien = notizen.filter((n) => text(n.fm.typ) === "unterlage" && text(n.fm.art) === "Folien" && text(n.fm.datei));
      const vorl = notizen.filter((n) => text(n.fm.typ) === "vorlesung" && text(n.fm.code));
      const aus = [];
      for (const n of vorl) {
        const wert = linkName(n.fm.folien), code = text(n.fm.code), datum = s10(n.fm.datum), nr = nummer(n.fm);
        if (!wert || !datum || datum > "2026-10-24") continue;
        const eigene = folien.filter((x) => text(x.fm.code) === code)
          .sort((a, b) => nummer(a.fm) - nummer(b.fm) || (s10(a.fm.datum) < s10(b.fm.datum) ? -1 : s10(a.fm.datum) > s10(b.fm.datum) ? 1 : 0));
        const vorher = (v) => s10(v.fm.datum) < datum || (s10(v.fm.datum) === datum && nummer(v.fm) < nr);
        const geraten = eigene.filter((x) => nr !== Infinity && nummer(x.fm) === nr).concat(eigene.slice(0, 1)).map((x) => linkName(x.fm.datei))
          .concat(vorl.filter((v) => v !== n && text(v.fm.code) === code && vorher(v)).map((v) => linkName(v.fm.folien)));
        if (geraten.indexOf(wert) >= 0) aus.push({ f: n.f, felder: { folien: "" } });
      }
      return aus;
    } },
    // Bis 24.10.2026 schrieb „Neue Lehrveranstaltung“ (notizen.js) die Pausentage beim Anlegen in ausfall; nach einer Korrektur
    // der Pausen fielen sie weiter aus. Pausen prüft ctx.modell.findetStatt ohnehin, darum gehen Tage, die in eine Pause fallen,
    // aus ausfall weg; andere Tage bleiben. Nur Notizen ohne Quelle (von Hand): Alma und die zentralen Daten schreiben ausfall
    // bei jedem Abgleich selbst. Ohne Pausen im Datenmodell (noch nicht gelesen) später wieder.
    { id: "ausfall-pausen", aendern: (notizen, M) => {
      const kandidaten = notizen.filter((n) => text(n.fm.typ) === "lehrveranstaltung" && !text(n.fm.quelle) && !text(n.fm.herkunft)
        && !text(n.fm.zentral_id) && liste(n.fm.ausfall).length);
      if (!kandidaten.length) return [];
      let D = null;
      try { D = M && typeof M.findetStatt === "function" && typeof M.daten === "function" ? M.daten() : null; } catch (e) { D = null; }
      if (!D || !Array.isArray(D.pausen) || !D.pausen.length) return null;
      const aus = [];
      for (const n of kandidaten) {
        const tage = liste(n.fm.ausfall).map(s10), bleibt = tage.filter((d) => M.findetStatt(n.fm, d).grund !== "pause");
        if (bleibt.length < tage.length) aus.push({ f: n.f, felder: { ausfall: bleibt } });
      }
      return aus;
    } },
    // Bis 19.10.2026 schrieb die Lesefassung der Folien (Skill lesefassung.md) über den Text einen eigenen Seitenkopf: als Titel den
    // Namen des Moduls, welche Folien es sind, nur im Pfad darüber. Seit 0.7.0 steht über einem Titel kein Pfad mehr und
    // Obsidians Kopfleiste nennt den Namen der Notiz nicht noch einmal; dort stand also nirgends mehr, welche Folien man liest. Der
    // Kopf wird der Titel jeder Begleitnotiz („# B110 · Folien 00 · Einführung“), darunter zeigt kopf.js das Modul mit Namen, das
    // Semester und „Gelesen“. Dozent und Lehrstuhl stehen auf der Modulseite. Nur der Block, wie er erzeugt wurde.
    { id: "folien-kopf", aendern: (notizen) => notizen
      .filter((n) => text(n.fm.typ) === "unterlage" && klassen(n.fm).indexOf("eba-folien") >= 0 && titelZeile(n.fm))
      .map((n) => ({ f: n.f, text: (t) => folienKopf(t, n.fm) })) },
    // Spalte „Notiz“ der Modulseite (seit 0.7.0): nur wo die Formel noch genau so dasteht, wie sie bis 0.6.14 kam
    { id: "modul-notizspalte", aendern: (notizen) => notizen
      .filter((n) => text(n.fm.typ) === "modul")
      .map((n) => ({ f: n.f, text: notizSpalte })) },
    // Reihenfolge in „Zum Modul“ (seit 0.7.0): nur wo die Sortierung noch genau so dasteht, wie sie bis 0.6.14 kam
    { id: "modul-reihenfolge", aendern: (notizen) => notizen
      .filter((n) => text(n.fm.typ) === "modul")
      .map((n) => ({ f: n.f, text: reihenfolge })) },
  ];

  // Ein Lauf ohne Dateien. o: { notizen, erledigt (ids), M, setzen(f, felder), textSetzen(f, fn) → geändert?, liste? (Test: statt
  // NACHTRAEGE) } → { geaendert: [{ id, pfad }], neu: [ids], erledigt: [ids], fehler }
  const nachtragenMit = async (o) => {
    const erledigt = o.erledigt.slice(), b = { geaendert: [], neu: [], erledigt, fehler: "" };
    for (const n of o.liste || NACHTRAEGE) {
      if (erledigt.indexOf(n.id) >= 0) continue;
      const aenderungen = n.aendern(o.notizen, o.M);
      if (!aenderungen) continue;
      try {
        for (const a of aenderungen) {
          let geaendert = true;
          if (a.text) geaendert = await o.textSetzen(a.f, a.text); else await o.setzen(a.f, a.felder);
          if (geaendert) b.geaendert.push({ id: n.id, pfad: a.f.path });
        }
      } catch (e) { b.fehler = n.id + ": " + ((e && e.message) || e); continue; }
      erledigt.push(n.id);
      b.neu.push(n.id);
    }
    return b;
  };

  const zustand = ctx.bleibend("zustand", () => ({ laeuft: false }));
  let fertig = false; // nicht bleibend: eine neue Fassung dieses Skripts kann neue Nachträge mitbringen
  const erledigtLesen = async () => {
    try {
      const m = JSON.parse(await app.vault.adapter.read(DATEI));
      return m && Array.isArray(m.erledigt) ? m.erledigt.filter((x) => typeof x === "string") : [];
    } catch (e) { return []; }
  };
  const erledigtSchreiben = async (ids) => {
    const t = JSON.stringify({ erledigt: ids }, null, 2) + "\n", f = app.vault.getAbstractFileByPath(DATEI);
    if (f && !f.children) await app.vault.modify(f, t); else await app.vault.create(DATEI, t);
  };
  const alleErledigt = (ids) => NACHTRAEGE.every((n) => ids.indexOf(n.id) >= 0);
  // → Bericht | null (nicht dieses Gerät, läuft schon, alles erledigt)
  const lauf = async () => {
    if (zustand.laeuft || fertig) return null;
    const Z = ctx.zentral;
    try { if (!Z || typeof Z.abruferHier !== "function" || !(await Z.abruferHier())) return null; } catch (e) { return null; }
    zustand.laeuft = true;
    try {
      const erledigt = await erledigtLesen();
      if (alleErledigt(erledigt)) { fertig = true; return null; }
      const notizen = app.vault.getMarkdownFiles().map((f) => ({ f, fm: ((app.metadataCache.getFileCache(f) || {}).frontmatter) || {} }));
      const b = await nachtragenMit({ notizen, erledigt, M: ctx.modell,
        setzen: (f, felder) => app.fileManager.processFrontMatter(f, (fm) => { for (const k of Object.keys(felder)) fm[k] = felder[k]; }),
        // Erst lesen: Bleibt der Text gleich, wird nicht geschrieben (sonst ginge jede Notiz des Falls durch den Sync)
        textSetzen: async (f, fn) => {
          const alt = await app.vault.read(f);
          if (fn(alt) === alt) return false;
          await app.vault.process(f, fn);
          return true;
        } });
      if (b.neu.length) await erledigtSchreiben(b.erledigt);
      if (b.fehler) console.error("Nachträge", b.fehler);
      fertig = alleErledigt(b.erledigt);
      return b;
    } catch (e) { console.error("Nachträge", e); return null; } finally { zustand.laeuft = false; }
  };

  const registrieren = () => { ctx.zeit(lauf, WARTEN); ctx.intervall(lauf, WIEDER); };

  return { registrieren, lauf, nachtragenMit, NACHTRAEGE, linkName, folienKopf, notizSpalte, NOTIZ_ALT, NOTIZ_NEU, reihenfolge, REIHE_ALT, REIHE_NEU, DATEI };
};
