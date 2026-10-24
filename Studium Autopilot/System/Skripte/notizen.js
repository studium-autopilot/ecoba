// Neue Notizen (früher Templater-Ordnervorlagen in System/Vorlagen/). Jede Aktion fragt in EINEM Fenster „Neu …“ (ctx.formular,
// formular.js) mit allen Feldern und Vorgaben und legt die fertige Notiz an, öffnet genau diese und setzt den Cursor. Esc, × und
// „Abbrechen“ legen nichts an (bis 0.4.5 eine Kette einzelner Fragen, Konsistenz-Audit Schritt 4).
// Auslöser:
//  - Knopf, z. B. obsidian://studium-autopilot?aktion=vorlesung&code=B110 (Modul vorgewählt)
//  - Befehl „Neue Notiz aus Vorlage …“ (Strg/Cmd+Umschalt+N) oder einzelne Befehle in der Befehlspalette
//  - Ordner-Automatik: Wird in einem der Ordner unter „ordner“ auf DIESEM Gerät eine leere Notiz angelegt und ist sie die
//    aktive Datei, befüllt das Plugin sie (c.datei; „Unbenannt“ wird dabei umbenannt/verschoben). Per Sync
//    ankommende Dateien werden nie befüllt.
// Parameter für Aufrufe ohne Fenster: siehe jeweilige Aktion (z. B. termin: titel und wann).
module.exports = function (ctx) {
  const app = window.app;
  const pad2 = (n) => String(n).padStart(2, "0");
  // Das Fenster „Neu …“; fehlt formular.js noch (der Sync liefert Skripte einzeln), ein Satz statt eines Fehlers
  const fenster = async (def) => {
    if (typeof ctx.formular === "function") return ctx.formular(def);
    ctx.hinweis("Dieser Teil der App lädt noch. Bitte gleich noch einmal tippen.");
    return null;
  };
  const uhrPlus = (u, min) => (ctx.user.formular && ctx.user.formular.uhrPlus ? ctx.user.formular.uhrPlus(u, min) : u);
  // „TT.MM.“ eines Tages ab heute (Vorgabe in Datumsfeldern)
  const tm = (tage) => { const d = ctx.date.now("YYYY-MM-DD", tage); return `${d.slice(8, 10)}.${d.slice(5, 7)}.`; };

  // ---------- Vorlesung ----------
  // Schnellstart mit möglichst wenig Tipps (eba.jetztLaufend: Stundenplan und Termine mit Uhrzeit):
  // - Läuft gerade genau eine Veranstaltung und ist kein Modul vorgewählt, entsteht die Notiz ohne Frage.
  // - Gibt es zu dieser Veranstaltung heute schon eine Notiz (Feld „veranstaltung“), öffnet der Knopf sie am Ende der
  //   Mitschrift, statt eine zweite anzulegen (vom Knopf auf der Modulseite noch vor dem Fenster).
  // - Sonst das Fenster „Neue Vorlesungsnotiz“: Modul (vom Knopf auf der Modulseite vorgewählt, laufende Lehrveranstaltung oben,
  //   jedes Modul wählbar) und Thema (optional, Feld thema).
  // Aufbau: Titel = Name der Notiz („Vorlesung 1 · Mo 19.10. · Thema“, ctx.modell.vorlesungTitel; der Dateiname bleibt
  // „Datum Code VL 01“), Kopf-Karte ```eba-vorlesung``` (vorlesung.js), dann ## Mitschrift, ## Prüfungsrelevant, ## Offene Fragen,
  // ## Nacharbeit. Die Überschriften nicht umbenennen (vorlesung.js und der Sprung ans Ende der Mitschrift suchen sie).
  const heutigeOeffnen = async (c, vorhanden) => {
    const leer = c.datei;
    if (leer) {
      for (const l of app.workspace.getLeavesOfType("markdown")) if (l.view && l.view.file === leer && l.view.file !== vorhanden) l.detach();
      try { if (!(await app.vault.read(leer)).trim()) await app.vault.delete(leer); } catch (e) { /* schon weg */ }
    }
    const blatt = await ctx.oeffnen(vorhanden, {});
    const ed = blatt && blatt.view && blatt.view.editor;
    if (ed) {
      const z = ed.getValue().split("\n");
      const i = z.findIndex((s) => /^##\s+Prüfungsrelevant/.test(s));
      let j = i > 0 ? i - 1 : z.length - 1;
      while (j > 0 && !z[j].trim()) j--;
      ed.setCursor({ line: j, ch: z[j].length });
      ed.focus();
    }
    ctx.hinweis("Die Notiz von heute gibt es schon, hier ist sie.", { dauer: 3000 });
    return vorhanden;
  };
  const vorlesung = async (c) => {
    const eba = ctx.user.eba(c);
    const vorwahl = eba.codeAusTitel();
    const vorModul = vorwahl ? eba.modulNachCode(vorwahl) : null;
    const laufend = eba.jetztLaufend();
    const gleich = (x) => !!(x && laufend && laufend.modul && laufend.modul.fm.code === x.fm.code);
    let m, quelle = null, thema = "";
    if (!vorModul && laufend && laufend.eindeutig) { m = laufend.modul; quelle = laufend; }
    else {
      const schon = gleich(vorModul) && eba.neu ? eba.heutigeNotiz(laufend.quelle) : null;
      if (schon) return heutigeOeffnen(c, schon);
      const w = await fenster({ titel: "Neue Vorlesungsnotiz", felder: [eba.modulFeld({ laufend, optional: true }),
        { name: "thema", titel: "Thema", art: "text", platzhalter: "z. B. Lineare Regression", hilfe: "Leer lassen, wenn du es noch nicht weißt." }] });
      if (!w) { eba.abbrechen(); return; }
      if (w.modul && w.modul === laufend) { m = laufend.modul; quelle = laufend; } else m = w.modul;
      thema = String(w.thema || "").trim();
    }
    if (!quelle && gleich(m)) quelle = laufend;

    // Heute schon eine Notiz zu dieser Veranstaltung: die öffnen, Cursor ans Ende der Mitschrift
    const vorhanden = quelle && eba.neu ? eba.heutigeNotiz(quelle.quelle) : null;
    if (vorhanden) return heutigeOeffnen(c, vorhanden);

    const code = m ? m.fm.code || "" : "";
    const termin = !m && quelle && quelle.lv.typ === "termin" ? quelle : null;
    const nr = code ? eba.naechsteVlNr(code) : 1;
    const nn = pad2(nr);
    // Dozent: Das Feld bleibt leer für einen Namen, den du selbst einträgst; sonst zeigt der Kopf den aus deinem Stundenplan
    // (vorlesung.js, live seit 24.10.2026; vorher beim Anlegen kopiert, bis 0.4.6 „verantwortlich“ der Modulseite).
    const veranstaltung = quelle ? `[[${quelle.quelle.path.replace(/\.md$/, "")}]]` : "";
    const kurztitel = termin ? (termin.titel.length > 70 ? termin.titel.slice(0, 70).replace(/\s+\S*$/, "") : termin.titel) : "";
    if (!thema && termin) thema = termin.titel;
    const M = ctx.modell;
    const titel = termin ? termin.titel
      : M && M.vorlesungTitel ? M.vorlesungTitel({ nummer: nr, datum: eba.heute, thema, code }) : `Vorlesung ${nr}${thema ? " · " + thema : ""}`;
    const inhalt = `---
typ: vorlesung
datum: ${eba.heute}
code: ${eba.J(code)}
modul: ${eba.J(eba.link(m))}
nummer: ${termin ? "" : nr}
thema: ${eba.J(thema)}
dozent: ""
folien: ""
veranstaltung: ${eba.J(veranstaltung)}
nachgearbeitet: false
tags:
  - vorlesung
cssclasses:
  - eba-s-notizen
  - eba-s-vorlesung
---

# ${titel}

\`\`\`eba-vorlesung
Kopf mit Modul, Termin, Folien und Status: erscheint, sobald das Plugin „Studium Autopilot“ geladen ist.
\`\`\`

## Mitschrift
- ${eba.CURSOR}

## Prüfungsrelevant

## Offene Fragen

## Nacharbeit
- Kernaussagen:
`;
    const f = await eba.ablegen(code ? `Vorlesungen/${code}` : "Vorlesungen",
      termin ? `${eba.heute} Mitschrift ${kurztitel}` : `${eba.heute} ${code ? code + " " : ""}VL ${nn}`, inhalt);
    if (laufend && laufend.eindeutig && quelle === laufend && !vorwahl) {
      ctx.hinweis(`Vorlesungsnotiz für ${code ? code + " · Vorlesung " + nr : kurztitel}, das läuft gerade. Für ein anderes Modul tippe auf seiner Modulseite auf „Neue Vorlesungsnotiz“.`);
    }
    return f;
  };

  // ---------- Übungsblatt ----------
  // Fenster: Modul (Parameter code wählt vor), Nummer (nächste freie des Moduls), Abgabe (leer = ohne; seit 24.10.2026 ohne Vorgabe,
  // vorher in einer Woche: Die geratene Abgabe stand wie eine echte bei den Fristen und als „überfällig“ da).
  // Aufbau wie die Vorlesungsnotiz: Titel, Kopf-Karte ```eba-uebungsblatt``` (vorlesung.js), dann ## Aufgabe 1, ## Aufgabe 2,
  // ## Knackpunkte, ## Fürs Tutorium. „datei“ = Aufgaben (setzt das Einordnen aus dem Eingang), „eigene_loesung“ ebenso.
  const uebungsblatt = async (c) => {
    const eba = ctx.user.eba(c);
    const vorhandene = (m) => (m ? app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Übungsblätter/")
      && ((app.metadataCache.getFileCache(f) || {}).frontmatter || {}).code === m.fm.code).length : 0);
    const w = await fenster({ titel: "Neues Übungsblatt", felder: [
      eba.modulFeld(),
      { name: "nummer", titel: "Nummer", art: "zahl", ganz: true, min: 1, max: 99, pflicht: true, fehlt: "Bitte die Nummer des Blatts.",
        vorgabe: (x) => String(vorhandene(x.modul) + 1) },
      { name: "faellig", titel: "Abgabe", art: "datum", platzhalter: "z. B. 27.10. oder +7", hilfe: "Leer lassen, wenn es keine Abgabe gibt oder du sie noch nicht weißt." },
    ] });
    if (!w) { eba.abbrechen(); return; }
    const m = w.modul, code = m.fm.code || "", nr = w.nummer, faellig = w.faellig;
    const nn = pad2(nr);
    const inhalt = `---
typ: übungsblatt
code: ${eba.J(code)}
modul: ${eba.J(eba.link(m))}
nummer: ${nr}
faellig: ${faellig}
status: offen
datei: ""
eigene_loesung: ""
uebersicht: "[[Unterlagen]]"
tags:
  - übungsblatt
cssclasses:
  - eba-s-notizen
  - eba-s-uebungsblatt
---

# ${code} · Blatt ${nn}

\`\`\`eba-uebungsblatt
Kopf mit Modul, Abgabe, Status und Unterlagen: erscheint, sobald das Plugin „Studium Autopilot“ geladen ist.
\`\`\`

## Aufgabe 1
- ${eba.CURSOR}

## Aufgabe 2

## Knackpunkte

## Fürs Tutorium
`;
    return await eba.ablegen("Übungsblätter", `${code} Blatt ${nn}`, inhalt);
  };

  // ---------- Termin ----------
  // Fenster: Was, Wann (Tag oder Zeitraum), Uhrzeit, Ort, Art (aus Stichwörtern im Titel vorgeschlagen), Modul (aus dem Knopf, code,
  // oder einem Modulcode im Titel). Parameter titel und wann zusammen (z. B. „12.11.“, „12.11.–15.11.“, „+7“): ohne Fenster.
  // Frist-Stichwörter zuerst, damit „Prüfungsanmeldung S110“ eine Frist ist; „test“ nur als ganzes Wort (nicht „Testat“),
  // ein Zwischentest nach der Regel des Fachmodells (ctx.modell.istZwischentest) ist eine Prüfung (Pille „Zwischentest“)
  const KATEGORIEN = ["Frist", "Prüfung", "Lehre", "Fachschaft", "Veranstaltung"];
  const kategorieAus = (titel) => (/frist|anmeld|abgabe|rückmeld|rueckmeld|deadline|beleg|bewerb/i.test(titel) ? "Frist"
    : /klausur|prüfung|pruefung|exam|\btest\b/i.test(titel) || (ctx.modell && ctx.modell.istZwischentest(titel)) ? "Prüfung"
    : /vorlesung|übung|uebung|tutorium|seminar|sprechstunde/i.test(titel) ? "Lehre"
    : /fachschaft|party|feier|kneipe|grill|spieleabend/i.test(titel) ? "Fachschaft" : "Veranstaltung");
  const termin = async (c) => {
    const eba = ctx.user.eba(c);
    const modulImTitel = (t) => { const k = eba.codeImText(t); return (k && eba.modulNachCode(k)) || null; };
    let titel, z, uhrzeit = "", ort = "", kategorie, m;
    if (c.parameter.titel != null && c.parameter.wann != null) {
      titel = String(c.parameter.titel).trim() || "Termin";
      z = eba.zeitraumLesen(c.parameter.wann) || { von: "", bis: "" };
      kategorie = kategorieAus(titel);
      m = (eba.codeAusTitel() && eba.modulNachCode(eba.codeAusTitel())) || modulImTitel(titel);
    } else {
      const modul = eba.modulFeld({ optional: true });
      const fest = modul.vorgabe;
      modul.vorgabe = (x) => fest || modul.waehlen(eba.codeImText(x.titel || ""));
      const w = await fenster({ titel: "Neuer Termin", felder: [
        { name: "titel", titel: "Was", art: "text", vorgabe: c.parameter.titel || "", pflicht: true, fehlt: "Bitte eintragen, was ansteht.", platzhalter: "z. B. Lerngruppe B110" },
        { name: "wann", titel: "Wann", art: "zeitraum", vorgabe: c.parameter.wann || tm(0), pflicht: true, platzhalter: "z. B. 12.11. oder 12.11.–15.11." },
        { name: "uhrzeit", titel: "Uhrzeit", art: "uhrzeit", platzhalter: "z. B. 14:00" },
        { name: "ort", titel: "Ort", art: "text" },
        { name: "kategorie", titel: "Art", art: "auswahl", pflicht: true, optionen: KATEGORIEN.map((k) => ({ wert: k, text: k })), vorgabe: (x) => kategorieAus(x.titel || "") },
        modul,
      ] });
      if (!w) { eba.abbrechen(); return; }
      ({ titel, uhrzeit, ort, kategorie } = w);
      z = w.wann; m = w.modul;
    }
    const datum = z.von || eba.heute;
    const inhalt = `---
typ: termin
titel: ${eba.J(titel)}
datum: ${datum}
bis: ${z.bis}
kategorie: ${kategorie}
status: offiziell
uhrzeit: ${eba.J(uhrzeit)}
ort: ${eba.J(ort)}
modul: ${eba.J(eba.link(m))}
code: ${eba.J(m ? m.fm.code || "" : "")}
erledigt: false
quelle: ""
uebersicht: "[[Prüfungen]]"
cssclasses:
  - eba-s-termin
tags:
  - termin
---

# ${titel}

## Meine Notizen
- ${eba.CURSOR}
`;
    return await eba.ablegen("Termine", `${datum} ${titel}`, inhalt);
  };

  // ---------- Lehrveranstaltung (von Hand im Stundenplan, z. B. Tutorium) ----------
  // Fenster: Modul (Parameter code wählt vor), Art, Wochentag, Beginn („14“ = 14:15, c.t.), Ende (Beginn + 90 Min.), Raum.
  // Semester, von, bis aus dem Datenmodell bzw. den Einstellungen; von und bis bleiben, sonst stünde die Lehrveranstaltung in jedem
  // späteren Semester. Pausen und freie Tage prüft ctx.modell.findetStatt bei jedem Lesen: Bis 24.10.2026 standen die Pausentage
  // beim Anlegen in „ausfall“ und fielen nach einer Korrektur der Pausen weiter aus. Den Wochentag zeigt jede Ansicht aus
  // „wochentag“ (das Feld tag fällt weg); „ausfall“ ist für Termine, die du selbst als ausgefallen einträgst.
  const ARTEN = ["Tutorium", "Übung", "Übungsteil", "Lab", "Vorlesung", "Seminar"];
  const TAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
  const lehrveranstaltung = async (c) => {
    const eba = ctx.user.eba(c);
    const heuteWt = ((ctx.date.jetzt().getDay() + 6) % 7) + 1;
    const w = await fenster({ titel: "Neue Lehrveranstaltung", felder: [
      eba.modulFeld(),
      { name: "art", titel: "Art", art: "auswahl", pflicht: true, optionen: ARTEN.map((a) => ({ wert: a, text: a })), vorgabe: "Tutorium" },
      { name: "wochentag", titel: "Wochentag", art: "auswahl", pflicht: true, optionen: TAGE.map((t, i) => ({ wert: i + 1, text: t })), vorgabe: heuteWt <= 5 ? heuteWt : 1 },
      { name: "beginn", titel: "Beginn", art: "uhrzeit", ct: true, pflicht: true, vorgabe: "10:15", hilfe: "„14“ heißt 14:15 (c.t.)." },
      { name: "ende", titel: "Ende", art: "uhrzeit", vorgabe: (x) => uhrPlus(x.beginn, 90) },
      { name: "raum", titel: "Raum", art: "text", platzhalter: "z. B. Kupferbau HS 25" },
    ], pruefen: (x) => (x.ende && x.ende <= x.beginn ? { feld: "ende", fehler: "Das Ende liegt vor dem Beginn." } : null) });
    if (!w) { eba.abbrechen(); return; }
    const m = w.modul, art = w.art, wt = w.wochentag, beginn = w.beginn, ende = w.ende || uhrPlus(w.beginn, 90), raum = w.raum;
    // Semester: das erste aus der semesterliste, dessen Vorlesungsende noch nicht vorbei ist.
    // Semesterdaten aus dem Datenmodell (modell.js), sonst aus der semesterliste der Einstellungen
    const md = eba.modell ? eba.modell() : null;
    const semZeilen = md ? md.semesterliste.map((s) => [String(s.fs), s.name, s.beginn, s.ende, s.vb, s.ve]) : (eba.einstellungen().semesterliste || []).map((s) => String(s).split("|"));
    const semZeile = semZeilen.find((s) => s[5] && s[5] >= eba.heute);
    const sem = semZeile ? semZeile[1] : eba.aktuellesSemester().name;
    const von = semZeile && semZeile[4] > eba.heute ? semZeile[4] : eba.heute;
    const bis = semZeile ? semZeile[5] : "";
    const kurz = ["Mo", "Di", "Mi", "Do", "Fr"][wt - 1];
    const code = m.fm.code || "";
    const inhalt = `---
typ: lehrveranstaltung
titel: ${eba.J(`${code} · ${art}`)}
code: ${eba.J(code)}
modul: ${eba.J(eba.link(m))}
art: ${art}
wochentag: ${wt}
beginn: ${eba.J(beginn)}
ende: ${eba.J(ende)}
raum: ${eba.J(raum)}
dozent: ""
semester: ${eba.J(sem)}
von: ${von}
bis: ${bis}
ausfall: []
uebersicht: "[[Stundenplan]]"
tags:
  - stundenplan
cssclasses:
  - eba-s-notizen
---

# ${code} · ${art}

## Meine Notizen
- ${eba.CURSOR}
`;
    return await eba.ablegen("Stundenplan", `${kurz} ${beginn.replace(":", ".")} ${code} ${art}`, inhalt);
  };

  // ---------- SQ-Kurs (eine Leistung für SQ100) ----------
  const ANBIETER = ["Transdisciplinary Course Program (TCP)", "Fremdsprachenzentrum", "Weltethos-Institut", "Fachbereich Wirtschaftswissenschaft", "Praktikum (Career Service)", "Auslandssemester", "Engagement in einer Hochschulgruppe", "Sonstiges"];
  const REGELN = {
    "Transdisciplinary Course Program (TCP)": "Kursplatz in Alma belegen (Belegungszeiträume auf [[SQ100 Schlüsselqualifikation|SQ100]]) **und** die Studienleistung in Alma anmelden (Anmeldezeitraum des jeweiligen Semesters siehe Alma). Nicht teilnehmen können: im Abmeldezeitraum abmelden, sonst Sperre für TCP-Kurse im nächsten Semester.",
    "Fremdsprachenzentrum": "Anmeldung über Alma (Außerfakultäre Veranstaltungen → Fremdsprachenzentrum). Mit Vorkenntnissen vorher Einstufungstest (C-Test). Nicht die eigene Muttersprache.",
    "Weltethos-Institut": "Anmeldung laut Kursbeschreibung in Alma; ECTS werden nach Abschluss in Alma verbucht.",
    "Fachbereich Wirtschaftswissenschaft": "Nur Kurse, die in Alma ausdrücklich für Schlüsselqualifikationen freigegeben sind; Anmeldung über Alma.",
    "Praktikum (Career Service)": "Praktikumsbericht beim Career Service einreichen; dessen Bescheinigung ans Prüfungsamt.",
    "Auslandssemester": "Ein Auslandssemester zählt 6 ECTS für SQ100; Anerkennung über das Prüfungsamt (Learning Agreement).",
    "Engagement in einer Hochschulgruppe": "Nachweis mit ECTS von der Gruppe bzw. Einrichtung besorgen und beim Prüfungsamt einreichen.",
    "Sonstiges": "Vorher mit Studienfachberatung oder Prüfungsamt klären, ob und wie viel angerechnet wird.",
  };
  // Stand eines SQ-Kurses (im Kopf der Notiz änderbar, kopf.js)
  const STAND = ["geplant", "angemeldet", "zugelassen", "bestanden"];
  const sqKurs = async (c) => {
    const eba = ctx.user.eba(c);
    const w = await fenster({ titel: "Neuer SQ-Kurs", felder: [
      { name: "titel", titel: "Kurs", art: "text", pflicht: true, fehlt: "Bitte den Kurs oder die Leistung eintragen.", platzhalter: "z. B. Spanisch A1" },
      { name: "anbieter", titel: "Anbieter", art: "auswahl", pflicht: true, optionen: ANBIETER.map((a) => ({ wert: a, text: a })), vorgabe: ANBIETER[0] },
      { name: "ects", titel: "ECTS", art: "zahl", min: 0.5, max: 30, pflicht: true, vorgabe: (x) => (x.anbieter === "Auslandssemester" ? "6" : "3") },
      { name: "status", titel: "Stand", art: "auswahl", pflicht: true, optionen: STAND.map((s) => ({ wert: s, text: s })), vorgabe: "geplant" },
    ] });
    if (!w) { eba.abbrechen(); return; }
    const { titel, anbieter, ects, status } = w;
    const semester = eba.aktuellesSemester().name;
    // ECTS und Semester zeigt der Kopf der Notiz (kopf.js) aus den Eigenschaften; im Text stünden sie nach einer Änderung falsch
    // (bis 24.10.2026 in der Zeile unter dem Titel)
    const inhalt = `---
typ: sq_kurs
code: SQ100
modul: "[[SQ100 Schlüsselqualifikation]]"
titel: ${eba.J(titel)}
anbieter: ${eba.J(anbieter)}
ects: ${ects}
semester: ${eba.J(semester)}
status: ${status}
nachweis: ""
uebersicht: "[[SQ100 Schlüsselqualifikation]]"
tags:
  - sq
---

# ${titel}

**${anbieter}** · für [[SQ100 Schlüsselqualifikation|SQ100]]

> [!eba-regel] Damit die ECTS zählen
> ${REGELN[anbieter]}

## Meine Notizen
- ${eba.CURSOR}
`;
    return await eba.ablegen("Schlüsselqualifikationen", `SQ ${titel}`, inhalt);
  };

  // ---------- Eigenes Modul (Module/5 Weitere Module) ----------
  // Fenster: Code (Parameter code als Vorgabe, muss neu sein), Titel, ECTS, Teil, Schwerpunktbereich (nur beim Teil Schwerpunkt).
  // Text-Gerüst der Seite: System/Gerüste/Modul.md (Platzhalter {{…}}), Eigenschaften hier.
  const GRUPPEN = ["Schwerpunkt", "Profil & Vertiefung", "Grundstudium", "Abschluss"];
  const BEREICHE = ["Elective Studies", "Economic History and Development Economics", "Economic Policy", "Firms and Markets", "International Economics", "Data Science", "Banking and Finance", "Financial Accounting and Business Taxation", "International Business", "Managerial Accounting and Organisation", "Marketing"];
  const modul = async (c) => {
    const eba = ctx.user.eba(c);
    const w = await fenster({ titel: "Neues eigenes Modul", felder: [
      { name: "code", titel: "Modulcode", art: "text", vorgabe: c.parameter.code || "", pflicht: true, fehlt: "Bitte den Modulcode eintragen, z. B. E385.",
        muster: new RegExp("^" + eba.MODULCODE + "$", "i"), falsch: "Ein Modulcode sieht so aus: E385, B110, SQ100.", platzhalter: "z. B. E385" },
      { name: "titel", titel: "Titel", art: "text", pflicht: true, fehlt: "Bitte den Titel des Moduls eintragen." },
      { name: "ects", titel: "ECTS", art: "zahl", min: 1, max: 30, pflicht: true, vorgabe: "6" },
      { name: "gruppe", titel: "Teil", art: "auswahl", pflicht: true, optionen: GRUPPEN.map((g) => ({ wert: g, text: g })), vorgabe: GRUPPEN[0] },
      { name: "bereich", titel: "Schwerpunktbereich", art: "auswahl", pflicht: true, optionen: BEREICHE.map((b) => ({ wert: b, text: b })), vorgabe: BEREICHE[0],
        wenn: (x) => x.gruppe === "Schwerpunkt" },
    ], pruefen: (x) => (eba.modulNachCode(String(x.code).toUpperCase()) ? { feld: "code", fehler: `${String(x.code).toUpperCase()} gibt es schon.` } : null) });
    if (!w) { eba.abbrechen(); return; }
    const code = String(w.code).toUpperCase(), titel = w.titel, ects = w.ects, gruppe = w.gruppe, bereich = w.bereich || "";
    const geruest = app.vault.getAbstractFileByPath("System/Gerüste/Modul.md");
    if (!geruest) throw new Error("System/Gerüste/Modul.md fehlt");
    // Status, Semester, Plan und Anrechnung zeigt und ändert das Modulfeld (modul.js, Codeblock eba-modul im Gerüst)
    const werte = { code, titel, gruppe, ects: String(ects).replace(".", ","), datum: ctx.date.now("DD.MM.YYYY") };
    const koerper = (await app.vault.read(geruest)).replace(/^<!--[\s\S]*?-->\r?\n?/, "").replace(/\{\{([a-z_]+)\}\}/g, (x, k) => (k in werte ? werte[k] : x));
    const kopf = `---
typ: modul
code: ${eba.J(code)}
titel: ${eba.J(titel)}
titel_en: ""
ects: ${ects}
fachsemester:
fs_empfohlen: ""
gruppe: ${eba.J(gruppe)}
rolle_economics: ""
rolle_ba: ""
rolle_ohne: ""
bereiche:${bereich ? "\n  - " + eba.J(bereich) : ""}
pruefung: ""
benotet: true
notenblock: ${eba.J(gruppe === "Schwerpunkt" || gruppe === "Abschluss" ? "66 %" : "34 %")}
sprache: ""
turnus: ""
op_modul: false
status: offen
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: true
anrechnung: ${eba.J(bereich)}
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - ${eba.J(code)}
tags:
  - modul
cssclasses:
  - eba
  - eba-s-modul
---

`;
    const f = await eba.ablegen("Module/5 Weitere Module", `${code} ${titel}`, kopf + koerper);
    return f;
  };

  return {
    aktionen: {
      vorlesung: { titel: "Neue Vorlesungsnotiz", ordner: ["Vorlesungen"], ausfuehren: vorlesung },
      uebungsblatt: { titel: "Neues Übungsblatt", ordner: ["Übungsblätter"], ausfuehren: uebungsblatt },
      termin: { titel: "Neuer Termin", ordner: ["Termine"], ausfuehren: termin },
      lehrveranstaltung: { titel: "Neue Lehrveranstaltung", ordner: ["Stundenplan"], ausfuehren: lehrveranstaltung },
      "sq-kurs": { titel: "Neuer SQ-Kurs", ordner: ["Schlüsselqualifikationen"], ausfuehren: sqKurs },
      modul: { titel: "Neues eigenes Modul", ordner: ["Module/5 Weitere Module"], ausfuehren: modul },
    },
  };
};
