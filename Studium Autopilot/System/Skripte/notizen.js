// Neue Notizen (früher Templater-Ordnervorlagen in System/Vorlagen/). Jede Aktion fragt mit Obsidian-Fenstern (Eingabe,
// Auswahl) und legt die fertige Notiz an, öffnet genau diese und setzt den Cursor. Esc in der ersten Frage bricht ab,
// ohne dass eine Datei entsteht.
// Auslöser:
//  - Knopf, z. B. obsidian://studium-autopilot?aktion=vorlesung&code=B110 (Modul vorgewählt)
//  - Befehl „Neue Notiz aus Vorlage …“ (Strg/Cmd+Umschalt+N) oder einzelne Befehle in der Befehlspalette
//  - Ordner-Automatik: Wird in einem der Ordner unter „ordner“ auf DIESEM Gerät eine leere Notiz angelegt und ist sie die
//    aktive Datei, befüllt das Plugin sie (c.datei; „Unbenannt“ wird dabei umbenannt/verschoben). Per Sync
//    ankommende Dateien werden nie befüllt.
// Parameter für Tests/Aufrufe ohne Fragen: siehe jeweilige Aktion (z. B. termin: titel, wann).
module.exports = function (ctx) {
  const app = window.app;
  const { Notice } = ctx.obsidian;
  const pad2 = (n) => String(n).padStart(2, "0");

  // ---------- Vorlesung ----------
  // Schnellstart mit möglichst wenig Tipps (eba.jetztLaufend: Stundenplan und Termine mit Uhrzeit):
  // - Läuft gerade genau eine Veranstaltung, entsteht die Notiz ohne Frage.
  // - Gibt es zu dieser Veranstaltung heute schon eine Notiz (Feld „veranstaltung“), öffnet der Knopf sie am Ende der
  //   Mitschrift, statt eine zweite anzulegen.
  // - Knopf auf der Modulseite = Modul fest. Sonst Auswahl: laufende Veranstaltung oben, jedes Modul wählbar.
  // Aufbau: Titel, Kopf-Karte ```eba-vorlesung``` (vorlesung.js), dann ## Mitschrift, ## Prüfungsrelevant, ## Offene Fragen,
  // ## Nacharbeit. Die Überschriften nicht umbenennen (vorlesung.js und der Sprung ans Ende der Mitschrift suchen sie).
  const vorlesung = async (c) => {
    const eba = ctx.user.eba(c);
    const vorwahl = eba.codeAusTitel();
    const laufend = eba.jetztLaufend();
    let m, quelle = null;
    if (vorwahl && eba.modulNachCode(vorwahl)) m = eba.modulNachCode(vorwahl);
    else if (laufend && laufend.eindeutig) { m = laufend.modul; quelle = laufend; }
    else {
      const wahl = await eba.modulWaehlen("Welche Vorlesung? ▶ läuft gerade · ● aktuelles Semester", true, laufend);
      if (wahl === undefined) { eba.abbrechen(); return; }
      if (wahl && wahl === laufend) { m = laufend.modul; quelle = laufend; } else m = wahl;
    }
    if (!quelle && m && laufend && laufend.modul && laufend.modul.fm.code === m.fm.code) quelle = laufend;

    // Heute schon eine Notiz zu dieser Veranstaltung: die öffnen, Cursor ans Ende der Mitschrift
    const vorhanden = quelle && eba.neu ? eba.heutigeNotiz(quelle.quelle) : null;
    if (vorhanden) {
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
      new Notice(`Heute schon angelegt: ${vorhanden.basename}`, 3000);
      return vorhanden;
    }

    const code = m ? m.fm.code || "" : "";
    const termin = !m && quelle && quelle.lv.typ === "termin" ? quelle : null;
    const nr = code ? eba.naechsteVlNr(code) : 1;
    const nn = pad2(nr);
    const folien = code ? eba.folienZu(code, nr) : "";
    // Dozent: aus dem Stundenplan, wenn das Modul gerade läuft; sonst „verantwortlich“ aus dem Modul
    const dozent = (quelle && quelle.dozent) || (m && m.fm.verantwortlich) || "";
    const veranstaltung = quelle ? `[[${quelle.quelle.path.replace(/\.md$/, "")}]]` : "";
    const kurztitel = termin ? (termin.titel.length > 70 ? termin.titel.slice(0, 70).replace(/\s+\S*$/, "") : termin.titel) : "";
    const titel = termin ? termin.titel : (code ? code + " · " : "") + "VL " + nn;
    const inhalt = `---
typ: vorlesung
datum: ${eba.heute}
code: ${eba.J(code)}
modul: ${eba.J(eba.link(m))}
nummer: ${termin ? "" : nr}
thema: ${eba.J(termin ? termin.titel : "")}
dozent: ${eba.J(dozent)}
folien: ${eba.J(folien ? `[[${folien}]]` : "")}
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
-

## Offene Fragen
- [ ]

## Nacharbeit
- Kernaussagen:
`;
    const f = await eba.ablegen(code ? `Vorlesungen/${code}` : "Vorlesungen",
      termin ? `${eba.heute} Mitschrift ${kurztitel}` : `${eba.heute} ${code ? code + " " : ""}VL ${nn}`, inhalt);
    if (laufend && laufend.eindeutig && quelle === laufend && !vorwahl) {
      new Notice(`${code ? code + " · VL " + nn : kurztitel}: läuft gerade${quelle.lv.typ === "termin" ? " (Termin)" : ""}. Anderes Modul: Knopf auf der Modulseite.`, 4000);
    }
    return f;
  };

  // ---------- Übungsblatt ----------
  // Parameter: code (Modul vorgewählt). Esc in der ersten angezeigten Frage bricht ab.
  const uebungsblatt = async (c) => {
    const eba = ctx.user.eba(c);
    const vorwahl = eba.codeAusTitel() && eba.modulNachCode(eba.codeAusTitel());
    const m = vorwahl || await eba.modulWaehlen("Zu welchem Modul gehört das Übungsblatt? ● = aktuelles Semester", false);
    if (m === undefined || m === null) { eba.abbrechen(); return; }
    const code = m.fm.code || "";
    const vorhandene = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Übungsblätter/")
      && ((app.metadataCache.getFileCache(f) || {}).frontmatter || {}).code === code).length;
    // Nummer: nur ganze Zahlen; sonst noch einmal fragen. Leer = Vorschlag; Esc = Vorschlag (bzw. Abbruch, wenn erste Frage).
    let nr = null, hinweis = "";
    while (nr === null) {
      const e = await ctx.system.prompt(hinweis + "Nummer des Blatts", String(vorhandene + 1));
      if (e == null && vorwahl) { eba.abbrechen(); return; }
      const s = String(e == null ? "" : e).trim();
      if (!s) nr = vorhandene + 1;
      else if (/^\d+$/.test(s)) nr = Number(s) || vorhandene + 1;
      else hinweis = "Bitte nur eine Zahl. ";
    }
    const faellig = await eba.datumFragen("Abgabe am? z. B. 27.10. oder +7 (in einer Woche)", "+7");
    const nn = pad2(nr);
    const inhalt = `---
typ: übungsblatt
code: ${eba.J(code)}
modul: ${eba.J(eba.link(m))}
nummer: ${nr}
faellig: ${faellig}
status: offen
eigene_loesung: ""
uebersicht: "[[Unterlagen]]"
tags:
  - übungsblatt
cssclasses:
  - eba-s-notizen
---

# ${code} · Blatt ${nn}

## Aufgabe 1
- **Ansatz:** ${eba.CURSOR}
- **Ergebnis:**
- **Knackpunkt:**

## Aufgabe 2
- **Ansatz:**
- **Ergebnis:**
- **Knackpunkt:**

## Fürs Tutorium
- [ ]
`;
    return await eba.ablegen("Übungsblätter", `${code} Blatt ${nn}`, inhalt);
  };

  // ---------- Termin ----------
  // Zwei Fragen: Was? Wann? Art aus Stichwörtern, Modul aus dem Knopf (code) oder einem Modulcode im Titel.
  // Parameter: titel, wann (z. B. „12.11.“, „12.11.–15.11.“, „+7“), code.
  const termin = async (c) => {
    const eba = ctx.user.eba(c);
    const eingabe = c.parameter.titel != null ? c.parameter.titel : await ctx.system.prompt("Was steht an?", "");
    if (eingabe == null) { eba.abbrechen(); return; }
    const titel = String(eingabe).trim() || "Termin";
    let z;
    if (c.parameter.wann != null) {
      const teile = String(c.parameter.wann).split(/\s*[–—]\s*/);
      const von = eba.datumLesen(teile[0]);
      const bis = teile[1] ? eba.datumLesen(teile[1], von) : "";
      z = { von, bis: bis && bis > von ? bis : "" };
    } else z = await eba.zeitraumFragen("Wann? z. B. 12.11. · 12.11.–15.11. · +7", "");
    const datum = z.von || eba.heute;
    // Frist-Stichwörter zuerst, damit „Prüfungsanmeldung S110“ eine Frist ist; „test“ nur als ganzes Wort (nicht „Testat“)
    const kategorie = /frist|anmeld|abgabe|rückmeld|rueckmeld|deadline|beleg|bewerb/i.test(titel) ? "Frist"
      : /klausur|prüfung|pruefung|exam|\btest\b/i.test(titel) ? "Prüfung"
      : /vorlesung|übung|uebung|tutorium|seminar|sprechstunde/i.test(titel) ? "Lehre"
      : /fachschaft|party|feier|kneipe|grill|spieleabend/i.test(titel) ? "Fachschaft" : "Veranstaltung";
    const codeTitel = eba.codeImText(titel);
    const m = (eba.codeAusTitel() && eba.modulNachCode(eba.codeAusTitel())) || (codeTitel && eba.modulNachCode(codeTitel)) || null;
    const inhalt = `---
typ: termin
titel: ${eba.J(titel)}
datum: ${datum}
bis: ${z.bis}
kategorie: ${kategorie}
status: offiziell
ort: ""
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

- ${eba.CURSOR}
`;
    return await eba.ablegen("Termine", `${datum} ${titel}`, inhalt);
  };

  // ---------- Lehrveranstaltung (Stundenplan-Eintrag von Hand, z. B. Tutorium) ----------
  // Modul (entfällt mit code), Art, Tag, Beginn. Ende = Beginn + 90 min. Semester, von, bis, ausfall aus den Einstellungen.
  const lehrveranstaltung = async (c) => {
    const eba = ctx.user.eba(c);
    const vorwahl = eba.codeAusTitel() && eba.modulNachCode(eba.codeAusTitel());
    const m = vorwahl || await eba.modulWaehlen("Zu welchem Modul? ● = aktuelles Semester", false);
    if (m === undefined || m === null) { eba.abbrechen(); return; }
    const arten = ["Tutorium", "Übung", "Übungsteil", "Vorlesung", "Seminar"];
    const artWahl = await ctx.system.suggester(arten, arten, false, "Art");
    if (artWahl == null && vorwahl) { eba.abbrechen(); return; }
    const art = artWahl || "Tutorium";
    const tage = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
    const wt = (await ctx.system.suggester(tage, [1, 2, 3, 4, 5], false, "Wochentag")) || 1;
    // Beginn: ungültige Eingabe → noch einmal fragen. Leer oder Esc = 10:15.
    let bMin = null, hinweis = "";
    while (bMin === null) {
      const roh = String((await ctx.system.prompt(hinweis + "Beginn, z. B. 10:15 oder 14 (= 14:15, c.t.)", "10:15")) || "").trim() || "10:15";
      const mm = roh.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
      const minuten = mm ? Number(mm[2] == null ? 15 : mm[2]) : 99;
      if (mm && Number(mm[1]) <= 23 && minuten <= 59) bMin = Number(mm[1]) * 60 + minuten;
      else hinweis = "Uhrzeit nicht erkannt. ";
    }
    const hhmm = (x) => `${pad2(Math.floor(x / 60))}:${pad2(x % 60)}`;
    const beginn = hhmm(bMin), ende = hhmm(bMin + 90);
    // Semester: das erste aus der semesterliste, dessen Vorlesungsende noch nicht vorbei ist.
    const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    // Semesterdaten aus dem Datenmodell (modell.js), sonst aus der semesterliste der Einstellungen
    const md = eba.modell ? eba.modell() : null;
    const semZeilen = md ? md.semesterliste.map((s) => [String(s.fs), s.name, s.beginn, s.ende, s.vb, s.ve]) : (eba.einstellungen().semesterliste || []).map((s) => String(s).split("|"));
    const semZeile = semZeilen.find((s) => s[5] && s[5] >= eba.heute);
    const sem = semZeile ? semZeile[1] : eba.aktuellesSemester().name;
    const von = semZeile && semZeile[4] > eba.heute ? semZeile[4] : eba.heute;
    const bis = semZeile ? semZeile[5] : "";
    const ausfall = [];
    if (bis) {
      const pausen = md ? md.pausen.map((p) => [p.von, p.bis, p.name]) : (eba.einstellungen().pausen || []).map((p) => String(p).split("|"));
      const t = von.split("-").map(Number);
      for (let d = new Date(t[0], t[1] - 1, t[2]); iso(d) <= bis; d.setDate(d.getDate() + 1)) {
        const tag = iso(d);
        if (((d.getDay() + 6) % 7) + 1 === wt && pausen.some((p) => p[0] <= tag && tag <= p[1])) ausfall.push(tag);
      }
    }
    const kurz = ["Mo", "Di", "Mi", "Do", "Fr"][wt - 1];
    const code = m.fm.code || "";
    const hinweisText = bis ? "Raum und Ende oben in den Eigenschaften ergänzen."
      : "Raum, Ende und letzten Termin (`bis`) oben in den Eigenschaften ergänzen.";
    const inhalt = `---
typ: lehrveranstaltung
titel: ${eba.J(`${code} · ${art}`)}
code: ${eba.J(code)}
modul: ${eba.J(eba.link(m))}
art: ${art}
wochentag: ${wt}
tag: ${kurz}
beginn: ${eba.J(beginn)}
ende: ${eba.J(ende)}
raum: ""
dozent: ""
semester: ${eba.J(sem)}
von: ${von}
bis: ${bis}
ausfall:${ausfall.length ? ausfall.map((d) => "\n  - " + d).join("") : " []"}
uebersicht: "[[Stundenplan]]"
tags:
  - stundenplan
cssclasses:
  - eba-s-notizen
---

# ${code} · ${art}

${tage[wt - 1]}, ${beginn}–${ende}. ${hinweisText}${eba.CURSOR}
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
  const sqKurs = async (c) => {
    const eba = ctx.user.eba(c);
    const ein = await ctx.system.prompt("Welcher Kurs bzw. welche Leistung?", "");
    if (ein == null) { eba.abbrechen(); return; }
    const titel = String(ein).trim() || "SQ-Kurs";
    const anbieter = (await ctx.system.suggester(ANBIETER, ANBIETER, false, "Anbieter")) || "Sonstiges";
    const vorschlag = anbieter === "Auslandssemester" ? "6" : "3";
    const ects = Number(String((await ctx.system.prompt("ECTS", vorschlag)) || vorschlag).replace(",", ".")) || 0;
    const STAND = ["geplant", "angemeldet", "zugelassen", "bestanden"];
    const status = (await ctx.system.suggester(STAND, STAND, false, "Stand")) || "geplant";
    const semester = eba.aktuellesSemester().name;
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

**${anbieter}** · ${String(ects).replace(".", ",")} ECTS · ${semester} · für [[SQ100 Schlüsselqualifikation|SQ100]]

> [!eba-regel] Damit die ECTS zählen
> ${REGELN[anbieter]}
> Stand in den Eigenschaften pflegen: geplant → angemeldet → zugelassen → bestanden.

## Notizen
- ${eba.CURSOR}
`;
    return await eba.ablegen("Schlüsselqualifikationen", `SQ ${titel}`, inhalt);
  };

  // ---------- Eigenes Modul (Module/5 Weitere Module) ----------
  // Text-Gerüst der Seite: System/Gerüste/Modul.md (Platzhalter {{…}}), Eigenschaften hier.
  const GRUPPEN = ["Schwerpunkt", "Profil & Vertiefung", "Grundstudium", "Abschluss"];
  const BEREICHE = ["Elective Studies", "Economic History and Development Economics", "Economic Policy", "Firms and Markets", "International Economics", "Data Science", "Banking and Finance", "Financial Accounting and Business Taxation", "International Business", "Managerial Accounting and Organisation", "Marketing"];
  const modul = async (c) => {
    const eba = ctx.user.eba(c);
    const codeEingabe = c.parameter.code != null ? c.parameter.code : await ctx.system.prompt("Modulcode, z. B. E385", "");
    if (codeEingabe == null) { eba.abbrechen(); return; }
    const code = (String(codeEingabe).trim() || "X000").toUpperCase();
    const titel = (await ctx.system.prompt("Titel des Moduls", "")) || "Neues Modul";
    let ects = null, hinweis = "";
    while (ects === null) {
      const s = String((await ctx.system.prompt(hinweis + "ECTS", "6")) || "").trim().replace(",", ".");
      if (!s) ects = 6;
      else if (/^\d+(\.\d+)?$/.test(s)) ects = Number(s);
      else hinweis = "Bitte eine Zahl, z. B. 6 oder 7,5. ";
    }
    const gruppe = (await ctx.system.suggester(GRUPPEN, GRUPPEN, false, "Bereich")) || "Schwerpunkt";
    const bereich = gruppe === "Schwerpunkt" ? ((await ctx.system.suggester(BEREICHE, BEREICHE, false, "Schwerpunktbereich")) || "Elective Studies") : "";
    const geruest = app.vault.getAbstractFileByPath("System/Gerüste/Modul.md");
    if (!geruest) throw new Error("System/Gerüste/Modul.md fehlt");
    const mitPlan = gruppe === "Schwerpunkt" || gruppe === "Profil & Vertiefung";
    // Spalte für das Feld „anrechnung“: Schwerpunkt „Anrechnung in“ (Bereich), Profil & Vertiefung „Zählt als“ (Elective Studies)
    const anrechnung = gruppe === "Schwerpunkt" ? "Anrechnung in" : gruppe === "Profil & Vertiefung" ? "Zählt als" : "";
    const werte = {
      code, titel, gruppe, ects: String(ects).replace(".", ","), code_url: encodeURIComponent(code),
      datum: ctx.date.now("DD.MM.YYYY"),
      plan_eigenschaft: (mitPlan ? "\n>   formula.plan:\n>     displayName: Im Plan" : "") + (anrechnung ? "\n>   note.anrechnung:\n>     displayName: " + anrechnung : ""),
      plan_spalte: (mitPlan ? "\n>       - formula.plan" : "") + (anrechnung ? "\n>       - anrechnung" : ""),
    };
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
      lehrveranstaltung: { titel: "Neuer Stundenplan-Eintrag (Tutorium, Übung …)", ordner: ["Stundenplan"], ausfuehren: lehrveranstaltung },
      "sq-kurs": { titel: "Neuer SQ-Kurs", ordner: ["Schlüsselqualifikationen"], ausfuehren: sqKurs },
      modul: { titel: "Neues eigenes Modul", ordner: ["Module/5 Weitere Module"], ausfuehren: modul },
    },
  };
};
