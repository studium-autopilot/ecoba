// Unterlagen benennen (unterlagen.js): Art, Nummer, Code und Titel aus Pfad und Dateiname (Eingang und ILIAS-Ablage),
// schwacher Titel, Titel aus der ersten PDF-Seite (reine Auswahl ohne pdf.js) und die Begleitnotiz.
// Alle Namen sind erfunden, nach Mustern echter Kursdateien. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const kontext = { obsidian: { Platform: { isMobile: false }, Notice: class { setMessage() {} hide() {} }, TFile: class {}, TFolder: class {} } };
const eba = laden("eba").ergebnis;
kontext.user = { eba: () => eba };
const U = laden("unterlagen", { kontext }).ergebnis;

// Name nach dem Schema „<Code> <Art> <NN> <Titel>“ für einen Pfad unterhalb des Eingangs bzw. des Kurses
const name = (rel, code = "B110") => {
  const endung = ((rel.match(/\.([^.]+)$/) || [])[1] || "").toLowerCase();
  const v = U.vorschlag(rel, endung, code);
  return U.zielName(v.code, v.art, v.nr, v.titel);
};
const art = (rel, code = "B110") => U.vorschlag(rel, ((rel.match(/\.([^.]+)$/) || [])[1] || "").toLowerCase(), code).art;
const nr = (rel, code = "B110") => U.vorschlag(rel, ((rel.match(/\.([^.]+)$/) || [])[1] || "").toLowerCase(), code).nr;

test("bisherige Benennung im Eingang bleibt", () => {
  const faelle = {
    "VL03_Kostenrechnung.pdf": "B110 Folien 03 Kostenrechnung",
    "Vorlesung 5 - Spieltheorie.pdf": "B110 Folien 05 Spieltheorie",
    "Kapitel 3 Optimierung.pdf": "B110 Folien 03 Optimierung",
    "Übungsblatt_04.pdf": "B110 Übung 04",
    "Blatt 5 Lösung.pdf": "B110 Lösung 05",
    "Lösungen/Blatt_05.pdf": "B110 Lösung 05",
    "Probeklausur.pdf": "B110 Altklausur Probeklausur",
    "Meine Lösung Blatt 3.pdf": "B110 Eigene Lösung 03",
    "Skript Statistik.pdf": "B110 Skript Statistik",
    "Deskriptive Statistik.pdf": "B110 Sonstiges Deskriptive Statistik",
    "01_Einfuehrung.pdf": "B110 Folien 01 Einfuehrung",
    "03_Kostenrechnung/Folien.pdf": "B110 Folien 03",
    "Woche 3/slides.pdf": "B110 Folien 03",
    "JA VL 1.pdf": "B110 Folien 01",
    "WS2627_VL1.pdf": "B110 Folien 01",
    "VL5-6.pdf": "B110 Folien 05 bis 06",
    "VL03 2.pdf": "B110 Folien 03",
    "Lecture 7 Game Theory.pdf": "B110 Folien 07 Game Theory",
    "Paper Smith 2019.pdf": "B110 Literatur Paper Smith 2019",
    "Klausurinfos.pdf": "B110 Sonstiges Klausurinfos",
    "Teil 2.pdf": "B110 Sonstiges Teil 2",
  };
  for (const [rel, soll] of Object.entries(faelle)) assert.equal(name(rel), soll, rel);
  assert.equal(art("Scan 12.10.2026.pdf"), "Scan");
  assert.equal(art("IMG_2034.jpg"), "Scan");
});

test("Klausurlösungen sind Lösungen, die Klausur selbst bleibt Altklausur", () => {
  assert.equal(art("Altklausuren/MatheWS1819A_KL.pdf", "S100"), "Lösung");
  assert.equal(art("Altklausuren/MatheWS1819A.pdf", "S100"), "Altklausur");
  assert.equal(art("Altklausuren/MatheWS2023A_Korrektur.pdf", "S100"), "Altklausur");
  assert.equal(art("Altklausuren/MatheWS2022A_2.pdf", "S100"), "Altklausur");
  assert.equal(nr("Altklausuren/MatheWS2022A_2.pdf", "S100"), null, "„_2“ ist eine Fassung, keine Nummer");
  assert.equal(art("Klausurlösung SS22.pdf"), "Lösung");
  assert.equal(art("Klausur Lösung 2023.pdf"), "Lösung");
  assert.equal(art("Altklausuren/Lösung 2023.pdf"), "Lösung");
  assert.equal(art("Exam 2022 solutions.pdf"), "Lösung");
  assert.equal(art("Klausur WS2223 mit Lösungen.pdf"), "Altklausur");
  assert.equal(art("Meine Lösung Probeklausur.pdf"), "Eigene Lösung");
  assert.equal(art("Altklausuren/Aufgaben 2019.pdf"), "Altklausur");
  assert.equal(name("Altklausuren/MatheWS1819A_KL.pdf", "S100"), "S100 Lösung Mathe WS 2018-19 A", "„KL“ fällt aus dem Titel");
});

test("Zusatzmaterial und Autor-Jahr-Namen sind Literatur (nur Dokumente)", () => {
  assert.equal(art("01 - Übungsmaterialien/Zusatzmaterial/Quantile_bestimmen.pdf", "S110"), "Literatur");
  assert.equal(art("01 - Übungsmaterialien/Zusatzmaterial/MusterSchulzeBeispiel2022.pdf", "S110"), "Literatur");
  assert.equal(name("MusterSchulzeBeispiel2022.pdf", "S110"), "S110 Literatur Muster Schulze Beispiel 2022");
  assert.equal(art("Zusatzmaterial/Daten.xlsx"), "Sonstiges", "Daten sind kein Lesestoff");
  assert.equal(art("Readings/Week 2 article.pdf"), "Folien", "Art-Wort im Namen geht vor");
  assert.equal(art("Einfuehrung_2019.pdf"), "Sonstiges", "ein Wort und ein Jahr ist kein Autor-Jahr-Name");
});

test("Formelsammlung, FAQ, Vorlagen, Organisatorisches → Sonstiges", () => {
  assert.equal(art("Unterlagen der Vorlesung/Formelsammlung.pdf", "S100"), "Sonstiges");
  assert.equal(art("Formelsammlung Klausur.pdf"), "Sonstiges");
  assert.equal(name("Allgemeines/FAQ_B110_WS2627.pdf"), "B110 Sonstiges FAQ WS 2026-27", "Code mitten im Namen fällt weg");
  assert.equal(art("Infos zur Klausur.pdf"), "Sonstiges");
  assert.equal(art("Cheat Sheet.pdf"), "Sonstiges");
  assert.equal(art("Organisatorisches.pdf"), "Sonstiges");
  assert.equal(art("01_Organisatorisches.pdf"), "Folien", "nummeriert: wie Folien ohne Art-Wort");
  assert.equal(art("VL0 Organisatorisches.pdf"), "Folien");
  assert.equal(art("Vorlesung/Organisatorisches.pdf"), "Folien", "schwacher Hinweis im Namen, Ordner entscheidet");
  assert.equal(art("Organisatorisches/01_Einfuehrung.pdf"), "Folien");
});

test("Tutorium ist ein eigener Bereich: alles aus Tutoriumsordnern und mit „Tutorium“ im Namen, auch Lösungen und Vorlagen", () => {
  assert.equal(art("Tutoriumsunterlagen/Case Study & Vorlagen/Abgabe_TBX_DATUM_GRUPPE.docx"), "Tutorium", "Vorlage aus dem Tutorium");
  assert.equal(name("Tutoriengruppen/Gruppe 4: Dienstag 10 - 12, Hörsaal 11/Aufgabenblatt.pdf", "S100"), "S100 Tutorium Aufgabenblatt",
    "keine Nummer aus dem Ordner der Gruppe");
  assert.equal(name("Unterlagen zu den Tutorien/Woche 10/JA_Tutorium10.pdf", "B180"), "B180 Tutorium 10");
  assert.equal(name("Unterlagen zu den Tutorien/Woche 3/Lösung.pdf", "B180"), "B180 Tutorium 03 Lösung", "Lösung bleibt im Tutorium");
  assert.equal(nr("Tutoriumsunterlagen/Tutorium 5 | Name | Mittwoch 14-16/Tutoriumsblatt II/Blatt.pdf"), null, "Gruppennummer ist keine Blattnummer");
  assert.equal(art("Tutorium 3 Folien.pdf"), "Tutorium");
  assert.equal(art("2026-10-14, 12:15 - 13:45: Vorlesung 4/Aufgaben Tutorium.pdf"), "Tutorium");
  assert.notEqual(art("Chatbot-Tutor/Die KI-Tutorin zur Vorlesung/Readme.pdf", "E101"), "Tutorium", "Tutorin ist kein Tutorium");
  assert.equal(art("Software/R Tutorial.pdf", "S110"), "Sonstiges", "Tutorial ist eine Anleitung");
  assert.equal(art("Übungsmaterialien/Übungsunterlagen/1. Übung/Aufgabenblatt_1.pdf", "S100"), "Übung", "Übung bleibt Übung");
  assert.equal(name("Übungsgruppen/Gruppe 2/Blatt_3.pdf", "E101"), "E101 Übung 03");
  assert.equal(nr("Übungsgruppen/Gruppe 2/Blatt.pdf", "E101"), null);
});

test("Lab ist ein eigener Bereich: alles aus Lab-Ordnern und mit „Lab“ im Namen, auch Daten, Aufzeichnungen und Lösungen", () => {
  const LAB1 = "03 - Data Science Lab/Codes-Skripte-Daten-Aufzeichnungen aus dem Data Science Lab/R Lab 1/";
  assert.equal(name(LAB1 + "Lab1.Rmd", "S110"), "S110 Lab 01", "nicht Skript (Ordner „Codes-Skripte-…“), Nummer aus „Lab1“");
  assert.equal(name(LAB1 + "WS2012_HT_HF_U20_BW.csv", "S110"), "S110 Lab 01 WS 2012 HT HF U20 BW", "Daten: Nummer aus dem Ordner „R Lab 1“");
  assert.equal(name("03 - Data Science Lab/Aufzeichnung R Lab 2.mp4", "S110"), "S110 Lab 02 Aufzeichnung", "„R Lab“ ist kein Titel");
  assert.equal(name("03 - Data Science Lab/Einführung.pdf", "S110"), "S110 Lab Einführung", "03 ist die Gliederung des Kurses");
  assert.equal(nr("02 R Lab/Notebook.Rmd", "S110"), 2, "„02 R Lab“ ist das zweite Lab");
  assert.equal(name("R_Lab_3_Loesung.R", "S110"), "S110 Lab 03 Loesung", "Lösung bleibt im Lab");
  assert.equal(name("Python Labs/Lab02 Pandas.ipynb", "S110"), "S110 Lab 02 Pandas");
  assert.equal(art("2026-10-23, 14:15 - 15:45: Data Science Lab/Folien.pdf", "S110"), "Lab", "Folien aus dem Lab");
  for (const kein of ["Matlab Einführung.pdf", "Syllabus.pdf", "Label Guide.pdf", "Labor 3.pdf", "Experimente im Labor/Versuch.pdf",
    "Falk_Heckman_2009_Lab_Experiments.pdf", "Lab vs Field.pdf", "Paper/Lab-in-the-field evidence.pdf", "Collaboration.pdf"]) {
    assert.notEqual(art(kein, "S110"), "Lab", kein);
  }
});

test("Lab: nur ein Name, der das Lab nennt; eigene Arbeit, Lesestoff und Laborexperimente bleiben, was sie sind", () => {
  const faelle = {
    // zusammengeschrieben, mit Sprache davor, als erstes Wort
    "RLab1.Rmd": "S110 Lab 01",
    "DataScienceLab_03.Rmd": "S110 Lab 03",
    "RLab_2.R": "S110 Lab 02",
    "R Lab Organisatorisches.pdf": "S110 Lab Organisatorisches",
    "Lab Orga.pdf": "S110 Lab Orga",
    "Lab VS Code Setup.pdf": "S110 Lab VS Code Setup",
    "R Lab Settings.pdf": "S110 Lab Settings",
    // ILIAS-Sitzungsordner: Nummer auch fürs Lab
    "2026-10-23, 14:15 - 15:45: R Lab 1/script.R": "S110 Lab 01 script",
    // Gliederung des Kurses mit Strich, „02 R Lab“ ohne Strich ist das zweite Lab
    "03 - R Lab/Einführung.pdf": "S110 Lab Einführung",
    "03 - Data Science Lab Materialien/Einführung.pdf": "S110 Lab Einführung",
    "05 - Labs/Einführung.pdf": "S110 Lab Einführung",
    "02 Python Lab/Einführung.pdf": "S110 Lab 02 Einführung",
    // R-Notebook: „.nb“ ist kein Titel
    "R Lab 1/Lab1.nb.html": "S110 Lab 01",
  };
  for (const [rel, soll] of Object.entries(faelle)) assert.equal(name(rel, "S110"), soll, rel);
  const andere = {
    "Literatur/Charness 2012 Lab Participants.pdf": "Literatur",
    "Evidence from the Lab.pdf": "Sonstiges",
    "Online_vs_Lab.pdf": "Sonstiges",
    "Experimente im Lab.pdf": "Sonstiges",
    "Scan Lab Notizen.jpg": "Scan",
    "Meine Lösung Lab 3.pdf": "Eigene Lösung",
    "Mitschrift Lab 3.pdf": "Mitschrift",
    "Data Science Lab/Mitschrift R Lab 2.pdf": "Mitschrift",
    "Altklausur WS2425/Aufgabe 3 Lab.pdf": "Altklausur",
    "Python Labs/Reading/Pandas Paper.pdf": "Literatur",
    "Lab Experiments.pdf": "Sonstiges",
    "Charness Lab 2012.pdf": "Sonstiges",
  };
  for (const [rel, soll] of Object.entries(andere)) assert.equal(art(rel, "S110"), soll, rel);
});

test("Lab: ändert nichts an Unterlagen außerhalb eines Labs; „Lab 2“ ist nur im Lab eine Nummer", () => {
  // Namen wie vor dem Bereich Lab (Stand 0.6.1)
  const gleich = {
    "Mitschrift Lab 2.pdf": "S110 Mitschrift Lab 2",
    "eigene Lösung Lab 3.pdf": "S110 Eigene Lösung Lab 3",
    "Tutorium/Lab 1.pdf": "S110 Tutorium 01 Lab",
    "Tutorium/R Lab 1.R": "S110 Tutorium R Lab 1",
    "Literatur/Smith 2019 Lab 5 results.pdf": "S110 Literatur Smith 2019 Lab 5 results",
    "Altklausuren/Klausur Lab 3.pdf": "S110 Altklausur Lab 3",
    "Scan Lab 3.jpg": "S110 Scan Lab 3",
    "Lab 3 Scan.pdf": "S110 Scan Lab 3",
    "Lab Participants.pdf": "S110 Sonstiges Lab Participants",
    "Lab meets Field.pdf": "S110 Sonstiges Lab meets Field",
    "Lab 2012 Annual Report.pdf": "S110 Sonstiges Lab 2012 Annual Report",
  };
  for (const [rel, soll] of Object.entries(gleich)) assert.equal(name(rel, "S110"), soll, rel);
  // eigene Arbeit in einem Ordner bleibt eigene Arbeit (geht nie an den eigenen Server)
  const eigen = { "Mitschriften/R Lab 2.pdf": "Mitschrift", "Notizen/Lab 3.pdf": "Mitschrift", "Meine Lösungen/Lab 3.R": "Eigene Lösung",
    "Meine Lösungen/Data Science Lab/Lab 2.pdf": "Eigene Lösung", "Data Science Lab/Eigene Lösungen/Lab 2.pdf": "Eigene Lösung", "Scans/Lab 3.jpg": "Scan" };
  for (const [rel, soll] of Object.entries(eigen)) assert.equal(art(rel, "S110"), soll, rel);
  // im Lab zählt die Nummer hinter dem Lab-Wort; Lesestoff über dem Lab-Ordner ändert nichts (alles im Ordner gleich)
  assert.equal(name("Kapitel 3 Lab 2.pdf", "S110"), "S110 Lab 02 Kapitel 3");
  assert.equal(name("VL 3 Lab 2.pdf", "S110"), "S110 Lab 02 VL 3");
  assert.equal(name("Literatur/R Lab 2/Lab2.Rmd", "S110"), "S110 Lab 02");
  assert.equal(name("Literatur/R Lab 2/Notebook.Rmd", "S110"), "S110 Lab 02 Notebook");
  // ILIAS-Sitzung „…: Lab“, SPSS
  assert.equal(name("2026-10-23, 14:15 - 15:45: Lab/script.R", "S110"), "S110 Lab script");
  assert.equal(name("SPSS Lab 2.sav", "S110"), "S110 Lab 02");
  // Gliederung eines Lab-Ordners zählt nur für das Lab; was nicht Lab ist, heißt wie vorher (Stand 0.6.2)
  const ordner = {
    "05 Lab/Mitschrift.pdf": "S110 Mitschrift " + eba.heute,
    "5 Lab/Literatur/Paper.pdf": "S110 Literatur Paper",
    "Tutorium/03 - Data Science Lab/Blatt.pdf": "S110 Tutorium 03 Blatt",
    "03 - Data Science Lab/Literatur/Paper.pdf": "S110 Literatur 03 Paper",
    "02 - Python Lab/Altklausuren/Klausur.pdf": "S110 Altklausur 02",
    // Fotos ohne Lab im Namen, eigene Notizen und Abgaben bleiben, was sie sind
    "R Lab 3/IMG_0012.jpg": "S110 Scan " + eba.heute,
    "Data Science Lab/My Notes.pdf": "S110 Sonstiges My Notes",
    "Data Science Lab/Abgaben/Lab 2.R": "S110 Folien 02 Lab",
    // „&“, „+“ und „,“ wie „und“: Laborexperimente als Thema
    "Lab & Field Experiments.pdf": "S110 Sonstiges Lab & Field Experiments",
    "Lab, Field and Evidence.pdf": "S110 Sonstiges Lab, Field and Evidence",
    "Lab + Feld.pdf": "S110 Sonstiges Lab + Feld",
  };
  for (const [rel, soll] of Object.entries(ordner)) assert.equal(name(rel, "S110"), soll, rel);
  assert.equal(name("Lab 1 bis 3.pdf", "S110"), "S110 Lab 01 bis 03");
  assert.equal(name("R Lab 3/Lab 3 Tafel.jpg", "S110"), "S110 Lab 03 Tafel", "ein Bild mit Lab im Namen gehört zum Lab");
});

test("Lab: R-Notebook und seine HTML-Fassung sind eine Unterlage, die HTML-Fassung wird gezeigt", () => {
  const f = (basename, extension) => ({ basename, extension, name: basename + "." + extension, path: "Eingang/R Lab 2/" + basename + "." + extension, parent: { path: "Eingang/R Lab 2" } });
  const st = U.stapeln([f("Lab2", "Rmd"), f("Lab2.nb", "html"), f("Daten", "csv")]);
  assert.deepEqual(st.map((s) => s.dateien.map((x) => x.name).sort()), [["Daten.csv"], ["Lab2.Rmd", "Lab2.nb.html"]]);
  assert.equal(st[1].haupt.name, "Lab2.nb.html");
  assert.equal(st[1].ausgaben, false);
  // „Lab2.html“ (Knit) und „Lab2.nb.html“ (Vorschau) zugleich: zwei HTML gehören nicht in einen Stapel (gleicher Zielname),
  // die Notebook-Fassung wird eine eigene Unterlage „… mit Ausgaben“
  const zwei = U.stapeln([f("Lab2", "Rmd"), f("Lab2", "html"), f("Lab2.nb", "html")]);
  assert.deepEqual(zwei.map((s) => [s.dateien.map((x) => x.name).sort(), s.ausgaben]), [[["Lab2.nb.html"], true], [["Lab2.Rmd", "Lab2.html"], false]]);
  assert.equal(U.titelMitZusatz("S110", "Lab", 2, "", "mit Ausgaben"), "mit Ausgaben");
  const lang = U.titelMitZusatz("S110", "Lab", 2, "Explorative Datenanalyse mit dem Tidyverse und ggplot2 für Fortgeschrittene", "mit Ausgaben");
  assert.match(U.zielName("S110", "Lab", 2, lang), /^S110 Lab 02 Explorative .+ mit Ausgaben$/);
  assert.ok(U.zielName("S110", "Lab", 2, lang).length <= 80);
});

test("Nummern: Kürzel mit Nummer, Tag N, Sitzungs- und Sammelordner", () => {
  assert.equal(name("EBWL_0.pdf"), "B110 Folien 00");
  assert.equal(name("Mikro_05.pdf"), "B110 Folien 05 Mikro");
  assert.equal(nr("Kopie 2.pdf"), null);
  assert.equal(name("Folien Vorkurs/Mathe_Vorkurs_Tag_3.pdf", "SQ888"), "SQ888 Folien 03 Mathe Vorkurs");
  assert.equal(nr("Montag 3 Notizen.pdf"), null, "„Tag“ nur als eigenes Wort");
  // ILIAS-Sitzung: Nummer aus dem Ordner nur für Folien, die selbst keine haben
  assert.equal(nr("2026-10-12, 10:15 - 11:45: Vorlesung 4/Handout.pdf"), 4);
  assert.equal(nr("2026-10-12, 10:15 - 11:45: Vorlesung 4/EBWL_3.pdf"), 3, "Nummer im Namen geht vor");
  assert.equal(nr("2026-10-14, 12:15 - 13:45: Vorlesung 4/Aufgaben Tutorium.pdf"), null, "Tutorium im Sitzungsordner");
  assert.equal(nr("14.10.2026, 12:15 - 13:45: Vorlesung 4/Lösung.pdf"), null);
  // Gliederung eines Sammelordners ist keine Nummer, Ordinalzahl und Themenordner schon
  assert.equal(nr("00 - Vorlesung/Die Folien zur Vorlesung/Datenanalyse.pdf", "S110"), null);
  assert.equal(nr("01 - Übungsmaterialien/Zusatzmaterial/Quantile.pdf", "S110"), null);
  assert.equal(nr("Unterlagen/03 - Material/x.pdf"), null);
  assert.equal(nr("1. Übung/Kurzlösung_1.pdf", "S100"), 1);
  assert.equal(name("1. Übung/Kurzlösung_1.pdf", "S100"), "S100 Lösung 01 Kurzlösung", "Nummer aus dem Ordner nicht doppelt im Titel");
  assert.equal(nr("03_Kostenrechnung/Folien.pdf"), 3);
  assert.equal(nr("2 Vorlesung Kostenrechnung/Folien.pdf"), 2, "Thema nach dem Art-Wort");
});

test("Modulcode aus einem Ordner geht vor dem Kurscode", () => {
  const v = U.vorschlag("Übungsmaterialien/SQ888 Propädeutikum/Arbeitsblätter/Übungsblatt 2.pdf", "pdf", "S100");
  assert.equal(v.code, "SQ888");
  assert.equal(v.eigenerCode, null);
  assert.equal(v.name, "SQ888 Übung 02");
  assert.equal(U.vorschlag("S100_VL1.pdf", "pdf", "B110").code, "S100", "Code im Dateinamen");
  assert.equal(U.vorschlag("Woche 2/VL2.pdf", "pdf", "B110").code, "B110");
});

test("Titel: Semester einheitlich, lange Wörter getrennt, Kürzel und Gliederung vorn weg", () => {
  assert.equal(name("Unterlagen zur Vorlesung/0_JA_Einführung_WS26_27.pdf", "B180"), "B180 Folien 00 JA Einführung WS 2026-27");
  assert.equal(name("Unterlagen zur Vorlesung/1_JA_Kap 1_WS 26_27.pdf", "B180"), "B180 Folien 01 WS 2026-27");
  assert.equal(name("Statistik_WS26_27_Kap5.pdf"), "B110 Folien 05 Statistik WS 2026-27");
  assert.equal(name("Klausur_WS2324.pdf"), "B110 Altklausur WS 2023-24");
  assert.equal(name("Aufgaben_SoSe26.pdf"), "B110 Übung SS 2026");
  assert.equal(name("Altklausuren/MatheWS2024B.pdf", "S100"), "S100 Altklausur Mathe WS 2024 B", "einzelnes WS-Jahr bleibt");
});

test("schwacherTitel", () => {
  for (const t of ["", "Opt 1Var", "OPT u NB", "Fkt mehrerer Var", "komp stat", "post", "erste", "WS 2026-27", "1 JA WS 2026-27", "A matrix a day"]) {
    assert.equal(U.schwacherTitel(t), true, `schwach: „${t}“`);
  }
  for (const t of ["Lineare Algebra", "Zusatzübung Part1", "JA Einführung WS 2026-27", "Opt Envelope Theorem", "Kurzlösung", "Formelsammlung", "Mathe Vorkurs", "Einfuehrung Live"]) {
    assert.equal(U.schwacherTitel(t), false, `nicht schwach: „${t}“`);
  }
  assert.equal(U.schwacherTitel("EBWL", "EBWL"), true, "nur der Kurzname des Kurses");
  assert.equal(U.vorschlag("VL_3_Opt_1Var.pdf", "pdf", "S100").schwach, true);
  assert.equal(U.vorschlag("VL_1_Lineare_Algebra.pdf", "pdf", "S100").schwach, false);
  assert.equal(U.vorschlag("VL5-6.pdf", "pdf", "B110").schwach, false, "Bereich: Titel „bis 06“ bleibt");
});

// Textstücke einer ersten Seite wie aus pdf.js (y von unten, g = Schriftgröße)
const zeile = (s, y, g, x = 40) => ({ s, x, y, g });
const beamer = (thema, meta) => ({
  titel: meta || "",
  stuecke: [
    zeile("Mathematische Methoden der", 230, 14.3), zeile("Wirtschaftswissenschaft", 212, 14.3),
    zeile("Wintersemester 2026/27", 195, 10.9), zeile(thema, 167, 12),
    zeile("Dr. Erika Musterfrau", 125, 10.9), zeile("Ökonometrie und Statistik", 105, 10.9), zeile("1/37", 5, 6),
  ],
});
const S100 = { code: "S100", modulTitel: "Mathematische Methoden der Wirtschaftswissenschaft" };

test("Titel aus der PDF: Modultitel, Namen, Semester und Aufzählung fallen weg", () => {
  assert.equal(U.pdfTitelWaehlen(beamer("3. Optimierung von Funktionen einer Variable"), S100), "Optimierung von Funktionen einer Variable");
  // Metadaten-Titel mit Beamer-Abstand: seine Schreibweise gewinnt, wenn er auf der Seite steht (verlorene Ligatur „ff“)
  const lig = beamer("2. Dierentiation und ihre Anwendung", "Mathematische Methoden der Wirtschaftswissenschaft - Wintersemester 2026/27 [0.5cm] 2. Differentiation und ihre Anwendung");
  assert.equal(U.pdfTitelWaehlen(lig, S100), "Differentiation und ihre Anwendung");
  // Metadaten aus einer alten Vorlage, die nicht auf der Seite steht, zählen nicht
  assert.equal(U.pdfTitelWaehlen(beamer("4. Integralrechnung", "Kostenrechnung im Handel"), S100), "Integralrechnung");
  assert.equal(U.pdfTitelWaehlen(beamer("Tag 1", "Microsoft PowerPoint - Folien.pptx"), S100), null, "nur „Tag 1“");
});

test("Titel aus der PDF: Großschrift, Kapitel, Deckblatt, Klausur", () => {
  const folien = { titel: "PowerPoint-Präsentation", stuecke: [
    zeile("Wirtschafts- und Sozialwissenschaftliche Fakultät", 500, 11.4), zeile("KAPITEL 2 – GRUNDLAGEN", 173, 28),
    zeile("B110", 391, 14), zeile("Einführung in die Betriebswirtschaftslehre", 364, 14), zeile("Wintersemester 2026-2027", 337, 14),
    zeile("Vorlesung", 310, 14), zeile("Prof. Dr. Max Mustermann", 45, 14),
  ] };
  assert.equal(U.pdfTitelWaehlen(folien, { code: "B110", modulTitel: "Einführung in die Betriebswirtschaftslehre" }), "Grundlagen");
  const blatt = { titel: "Übung 1", stuecke: [
    zeile("ÜBUNG 1", 717, 16), zeile("GRUNDLEGENDE KONZEPTE DER VOLKSWIRTSCHAFT", 685, 13), zeile("Vorbereitung", 636, 13),
    zeile("Lesen Sie vor der Übung die folgenden Kapitel im Lehrbuch:", 616, 11), zeile("Aufgabe 1: Das Bruttoinlandsprodukt", 542, 13),
    zeile("Erklären Sie den Unterschied zwischen nominalem und realem Bruttoinlandsprodukt in eigenen Worten.", 520, 11),
    zeile("Berechnen Sie die Wachstumsrate für die folgenden Jahre und begründen Sie Ihr Vorgehen kurz.", 500, 11),
  ] };
  assert.equal(U.pdfTitelWaehlen(blatt, { code: "E101", modulTitel: "Einführung in die Volkswirtschaftslehre" }), "Grundlegende Konzepte der Volkswirtschaft");
  const deckblatt = { stuecke: [
    zeile("Eberhard Karls Universität Tübingen", 729, 17.2), zeile("Wirtschaftswissenschaftliche Fakultät", 707, 17.2),
    zeile("Mathematische Methoden der Wirtschaftswissenschaft", 571, 17.2), zeile("Formelsammlung", 549, 17.2),
  ] };
  assert.equal(U.pdfTitelWaehlen(deckblatt, S100), "Formelsammlung", "Modultitel als Wortfolge weg");
  const klausur = { stuecke: [
    zeile("EBERHARD KARLS UNIVERSIT¨ AT T ¨ UBINGEN", 761, 12), zeile("Dr. Erika Musterfrau", 717, 12),
    zeile("Klausur zur Vorlesung", 632, 14.3), zeile("Mathematische Methoden der Wirtschaftswissenschaft", 614, 14.3),
    zeile("am Montag, den 11. Februar 2019 von 10:00 bis 11:30 Uhr", 596, 14.3),
    zeile("Name:", 500, 12), zeile("Bearbeitungszeit 90 Minuten, erlaubte Hilfsmittel: Formelsammlung und Taschenrechner.", 450, 10.9),
    zeile("Bitte schreiben Sie auf jedes Blatt Ihren Namen und Ihre Matrikelnummer.", 430, 10.9),
  ] };
  assert.equal(U.pdfTitelWaehlen(klausur, S100), null, "Deckblatt einer Klausur: nichts Eindeutiges");
  assert.equal(U.pdfTitelWaehlen({ titel: "New Document", stuecke: [] }, S100), null, "Scan ohne Text");
  const lang = { stuecke: [zeile("Estimating the infection fatality rate of a new virus by data", 599, 13), zeile("combination: the case of a first wave", 580, 13), zeile("1. INTRODUCTION", 153, 11), zeile("x".repeat(400), 100, 10)] };
  const t = U.pdfTitelWaehlen(lang, {});
  assert.ok(t && t.length <= 60 && t.startsWith("Estimating the infection"), t);
});

test("Titel aus der PDF ersetzt einen schwachen Titel, Semester aus dem Namen bleibt", () => {
  assert.equal(U.titelMitPdf("Mathe WS 2018-19 A", "Kurzlösung zur Klausur"), "Kurzlösung zur Klausur WS 2018-19");
  assert.equal(U.titelMitPdf("Mathe WS 2018-19 A", "Klausur vom 11.02.2019"), "Klausur vom 11.02.2019", "PDF nennt schon ein Jahr");
  assert.equal(U.titelMitPdf("Opt 1Var", "Optimierung"), "Optimierung");
  assert.equal(U.titelMitPdf("Opt 1Var", null), "Opt 1Var");
});

const datei = (n, size) => ({ name: n, basename: n.replace(/\.[^.]+$/, ""), extension: n.split(".").pop(), stat: { size } });

test("Begleitnotiz: Eigenschaften in fester Reihenfolge, Zusatzfelder nach „quelle“", () => {
  const md = U.begleitnotiz({
    code: "S100", modul: "S100 Mathematische Methoden der Wirtschaftswissenschaft", art: "Folien", nummer: 3, titel: "Optimierung",
    datei: "S100 Folien 03 Optimierung.pdf", groesse: 2e6, seiten: 37, semester: "WS 2026/27", quelle: "ILIAS",
    extra: { ilias_id: "file_123", ilias_pfad: "Vorlesung/VL_3.pdf", typ: "überschreiben verboten", "kein schlüssel": 1 },
  });
  const fm = md.split("\n---\n")[0].split("\n").slice(1);
  const schluessel = fm.filter((z) => /^[a-z_]+:/.test(z)).map((z) => z.split(":")[0]);
  assert.deepEqual(schluessel, ["typ", "code", "modul", "art", "nummer", "titel", "datei", "original", "format", "seiten", "semester", "status", "datum", "quelle", "ilias_id", "ilias_pfad", "uebersicht", "cssclasses", "tags"]);
  assert.ok(fm.includes('typ: unterlage') && fm.includes('modul: "[[S100 Mathematische Methoden der Wirtschaftswissenschaft]]"'));
  assert.ok(fm.includes('nummer: 3') && fm.includes('format: "pdf"') && fm.includes('quelle: "ILIAS"') && fm.includes('ilias_id: "file_123"'));
  // Titel, gleich darunter der PDF-Kasten mit der Seitenzahl im Titel (seit 19.10.2026): kein Kasten „Eckdaten“ (steht im Kopf der
  // Notiz), keine leeren Abschnitte, kein Knopf „Größe“
  const text = md.slice(md.indexOf("\n---\n") + 5);
  assert.equal(text, "\n# S100 · Folien 03 · Optimierung\n\n> [!eba-pdf]- PDF (37 Seiten)\n> ![[S100 Folien 03 Optimierung.pdf#height=560]]\n");
  assert.doesNotMatch(md, /Eckdaten|Das Wichtigste|Offene Fragen|aktion=pdf|^- (\[ \] )?$/m);
  const hinweis = U.begleitnotiz({ code: "B110", art: "Folien", nummer: 1, titel: "T", datei: "a.pdf", groesse: 1, hinweis: "Geändert\nin ILIAS." });
  assert.match(hinweis, /\n# B110 · Folien 01 · T\n\n> \[!eba-info\] Neue Fassung aus ILIAS\n> Geändert in ILIAS\.\n\n> \[!eba-pdf\]- PDF\n/);
});

test("Begleitnotiz: Dateiobjekt und Dateiname geben dasselbe, Original und große PDF", () => {
  const modul = { f: { basename: "B110 Einführung in die Betriebswirtschaftslehre" } };
  const a = U.begleitnotiz({ code: "B110", modul, art: "Folien", nummer: 0, titel: "Einführung", datei: datei("B110 Folien 00 Einführung.pdf", 12e6),
    original: datei("B110 Folien 00 Einführung.pptx", 1), semester: "WS 2026/27" });
  const b = U.begleitnotiz({ code: "B110", modul: modul.f.basename, art: "Folien", nummer: 0, titel: "Einführung", datei: "B110 Folien 00 Einführung.pdf",
    groesse: 12e6, original: "B110 Folien 00 Einführung.pptx", semester: "WS 2026/27" });
  assert.equal(a, b);
  assert.ok(a.includes('format: "pdf, pptx"') && a.includes('original: "[[B110 Folien 00 Einführung.pptx]]"') && a.includes('quelle: ""'));
  // zu groß zum Einbetten: Link, dahinter „Öffnen“ und „Original öffnen“ (eingebettet stehen sie in der Kopfzeile des PDF-Kastens)
  assert.ok(a.includes("**PDF öffnen:** [[B110 Folien 00 Einführung.pdf]] (11,4 MB, zu groß zum Einbetten) · [Öffnen ↗](obsidian://studium-autopilot?aktion=oeffnen)"
    + " · [Original öffnen ↗](obsidian://studium-autopilot?aktion=oeffnen&original=1)"));
  const ohne = U.begleitnotiz({ art: "Scan", datei: "Unterlage 2026-10-15.jpg", semester: "WS 2026/27" });
  assert.ok(ohne.includes('code: ""') && ohne.includes("\n# Scan\n\n![[Unterlage 2026-10-15.jpg]]\n"));
  const pptx = U.begleitnotiz({ code: "B110", art: "Folien", datei: datei("B110 Folien 01.pptx", 5), weitere: ["B110 Folien 01.zip"] });
  assert.match(pptx, /\n\[\[B110 Folien 01\.pptx\]\] · \[Öffnen ↗\]\(obsidian:\/\/studium-autopilot\?aktion=oeffnen\)\n\n> \[!eba-info\] Nur als PPTX vorhanden\n/);
  assert.match(pptx, /\n\n\*\*Weitere Dateien:\*\* \[\[B110 Folien 01\.zip\]\]\n$/);
});

test("Unterlagen hinzufügen: Name im Eingang", () => {
  const vorhanden = new Set(["blatt 1.pdf", "blatt 1 2.pdf", "notiz"]);
  assert.equal(U.eingangName(vorhanden, "Folien.pdf"), "Folien.pdf");
  assert.equal(U.eingangName(vorhanden, "Blatt 1.pdf"), "Blatt 1 3.pdf");
  assert.equal(U.eingangName(vorhanden, "Notiz"), "Notiz 2");
  assert.equal(U.eingangName(new Set(), "VL #3: Kosten [neu].pdf"), "VL 3 Kosten neu.pdf");
  assert.equal(U.eingangName(new Set(), "Übung.pdf".normalize("NFD")), "Übung.pdf");
  assert.equal(U.eingangName(new Set(), ""), "Datei");
});
