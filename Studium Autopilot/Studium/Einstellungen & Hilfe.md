---
typ: "übersicht"
tags:
  - "übersicht"
cssclasses:
  - "eba"
  - "eba-weit"
  - "eba-s-einstellungen"
  - "eba-s-anleitung"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><span>Studium</span></div>
<h1>Einstellungen & Hilfe</h1>
</div>

## Deine Angaben

Alles ist freiwillig. Ferien und Prüfungsphasen rechnen sich aus dem Studienbeginn: [[Studienverlauf#Semestertermine|Semestertermine]].

```eba-personalisieren angaben
Deine Angaben: erscheinen, sobald Studium Autopilot läuft. Ändern: Befehl „Personalisieren“.
```

## Verbindungen

Verbinde Alma und ILIAS, dann kommen Stundenplan und Kursdateien von selbst. Link und Zugang bleiben auf diesem Gerät, das ILIAS-Passwort verschlüsselt im Schlüsselbund von Obsidian; es geht nur an die Uni.

```eba-verbindungen
Verbindungen: erscheinen, sobald Studium Autopilot läuft.
```

## Variante

```eba-personalisieren variante
Variante: erscheint, sobald Studium Autopilot läuft. Wählen: Befehl „Variante wechseln“.
```

## Darstellung

```eba-darstellung
Darstellung: erscheint, sobald Studium Autopilot läuft. Wählen: Befehl „Darstellung wählen“.
```

## Hilfe

> [!eba-zeilen]
> > [!eba-karte|hilfe|bedienung]- Bedienung <span class="eba-zeile-unter">Knöpfe, Vorlagen, Bereiche-Menü</span>
> > | Knopf | Wo | Fragt nach | Landet in |
> > | --- | --- | --- | --- |
> > | Vorlesung | Dashboard, Modulseite | nichts, wenn laut Stundenplan oder Termin gerade etwas läuft (sonst das Modul; vom Modul-Knopf nie) | Vorlesungen/Modulcode, Name „Datum Code VL 03“ |
> > | Übungsblatt | Dashboard, Modulseite, [[Unterlagen#Übungsblätter\|Unterlagen]] | Modul, Nummer, Abgabe | Übungsblätter |
> > | Unterlagen | Dashboard, Modulseite, [[Unterlagen]] | Vorschau der neuen Namen | Unterlagen/Modul |
> > | Aus ILIAS holen | [[Unterlagen]] (sobald ILIAS verbunden ist) | nichts | Unterlagen/Modul |
> > | Termin anlegen | [[Termine & Anmeldungen]] | Titel und Datum (Art und Modul ergeben sich aus dem Titel) | Termine |
> > | Alma verbinden, danach Stundenplan aus Alma holen | [[Stundenplan]] | beim Verbinden deinen Alma-Link | Stundenplan |
> >
> > - **Bereiche-Menü:** Raster-Symbol (vier Kästchen) tippen: am PC rechts im Seitenkopf, auf iPhone und iPad oben in der Leiste jeder Notiz.
> > - **Vorlagen:** Jeder Knopf legt eine fertige Notiz an. <kbd>Strg</kbd>/<kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>N</kbd> fragt, welche Notiz entstehen soll.
> > - <kbd>Esc</kbd> überspringt eine Frage; in der ersten bricht es ab. Datum als „15.10.“ oder „15.10.2026“, gern mit Uhrzeit.
>
> > [!eba-karte|hilfe|vorlesung]- Vorlesung <span class="eba-zeile-unter">Mitschreiben, nacharbeiten</span>
> > > [!eba-raster|2]
> > > > [!eba-karte] Schnell mitschreiben
> > > > 1. Dashboard → **Vorlesung**. Läuft laut Stundenplan gerade etwas, entsteht die Notiz **sofort**; nochmal tippen öffnet **dieselbe Notiz**. Sonst wählst du das Modul.
> > > > 2. Nummer, Folien-PDF und Dozent trägt die Vorlage selbst ein, der Cursor steht unter **Mitschrift**.
> > > > 3. Stelle auf den Folien: Befehl **Seitenlink** → Seitenzahl → „S. 12“ springt auf die Seite.
> > > > 4. Prüfungsstoff: `#klausur` direkt an die Zeile schreiben.
> > >
> > > > [!eba-regel] Nacharbeiten
> > > > - Abends **Kernaussagen** ergänzen und offene Fragen klären.
> > > > - Dann **nachgearbeitet** anhaken (Eigenschaft oder Tabelle „Nachzuarbeiten“ auf dem Dashboard).
> > > > - Handschrift auf den Folien: Abschnitt „Unterlagen“ unten, „Mit dem Stift annotieren“.
> > > > - **Seitenlink aufs iPad legen (einmal):** Einstellungen → *Werkzeugleiste für Mobilgeräte* → „Studium Autopilot: Seitenlink auf die Folien einfügen“ hinzufügen.
>
> > [!eba-karte|hilfe|alltag]- Im Alltag <span class="eba-zeile-unter">Tabellen, Fragen, Markieren</span>
> > > [!eba-raster|2]
> > > > [!eba-tabelle] Tabellen bearbeiten
> > > > - **Doppelklick** auf eine Zelle, Wert eingeben, <kbd>Enter</kbd>. Ein einfacher Klick setzt nur den Cursor. Auf iPad und iPhone: Zelle antippen.
> > > > - **Status:** offen · läuft · angemeldet · bestanden · nicht bestanden · anerkannt. **Note** mit Komma, z. B. `1,7`.
> > > > - Oben links in einer Tabelle wechselst du die **Ansicht**.
> > >
> > > > [!eba-fragen] Fragen und To-dos
> > > > - Zeile schreiben, <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>L</kbd> macht daraus eine Aufgabe (iPhone/iPad: Kästchen-Symbol in der Leiste über der Tastatur).
> > > > - Endet sie mit **?** oder enthält sie `#frage`, erscheint sie auf dem Dashboard unter „Offene Fragen“, sonst unter „To-dos“.
> > > > - Abhaken, und sie verschwindet.
> > >
> > > > [!eba-karte] Markieren
> > > > - `#klausur` für Prüfungsstoff: [Alles Prüfungsrelevante](obsidian://studium-autopilot?aktion=suchen&q=tag%3A%23klausur)
> > > > - `==Text==` markiert, `[[Begriff]]` verlinkt.
> > > > - Formeln mit `$…$` oder `$$…$$` (LaTeX).
> > > > - `/` am Zeilenanfang öffnet die Befehle.
> > >
> > > > [!eba-rechner] Was sich selbst rechnet
> > > > - Aktuelles Semester, Phase und Wochenraster aus deinen Angaben oben.
> > > > - ECTS, Gesamtnote nach § 13 und Orientierungsprüfung aus den Modulen.
> > > > - Nächste Prüfung und Frist aus Modulen und Terminen.
> > > > - Termine und Fristen für alle kommen von selbst, siehe [[#Verbindungen]].
> > > > - Schwerpunktbereiche und ihre Regeln im [[Studienverlauf#Schwerpunkte|Studienverlauf]].
> >
> > | Kürzel | Wirkung |
> > | --- | --- |
> > | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>⇧</kbd> <kbd>N</kbd> | Notiz aus Vorlage |
> > | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>E</kbd> | Lesen / Bearbeiten |
> > | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>O</kbd> | Notiz öffnen |
> > | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>P</kbd> | Befehle |
>
> > [!eba-karte|hilfe|unterlagen]- Unterlagen <span class="eba-zeile-unter">Aus ILIAS, einordnen, annotieren</span>
> > Kursdateien kommen von selbst aus ILIAS, alles andere legst du in den Eingang.
> >
> > 1. Einmal unter [[#Verbindungen]] **ILIAS-Unterlagen** verbinden und deine Kurse wählen. Neue Dateien landen dann von selbst unter [[Unterlagen]], sofort mit **Aus ILIAS holen**.
> > 2. Andere Dateien (Mail, Scan, ZIP) in den Ordner **Eingang** deines Tresors legen.
> > 3. **Unterlagen einordnen** tippen, in der Vorschau **Alle übernehmen**.
> > 4. Zum Lesen und Anmerken in der Unterlage **Öffnen ↗** tippen.
> >
> > > [!eba-info]- Mehr erfahren
> > > - **ILIAS:** Ein Gerät reicht, die Dateien kommen über deinen Sync auf die anderen. Trennen: [[#Verbindungen]] → **ILIAS-Unterlagen** → **Mehr erfahren** → **Trennen**.
> > > - **Anmeldung klappt nicht:** Fragt die Uni nach deiner Zustimmung, einmal im Browser bei ILIAS anmelden und zustimmen, dann erneut **Verbinden**. Mit zweitem Faktor geht es noch nicht.
> > > - **Was nicht kommt:** Videos und Dateien über 50 MB bleiben in ILIAS. Was du löschst, kommt nicht wieder. Umbenennen und Verschieben ist sicher.
> > > - **Geänderte Dateien:** Hast du eine Datei angemerkt und der Dozent lädt sie neu hoch, bleibt deine, die neue liegt daneben als „… neue Fassung JJJJ-MM-TT“.
> > > - **In den Eingang:** Windows: im Explorer kopieren. iPhone/iPad: **Teilen → In Dateien sichern →** Ordner **Eingang**; Papier über die App **Dateien → ⋯ → Dokumente scannen**; ZIP vorher antippen, dann entpackt es sich. PowerPoint: als PDF exportieren und beide mit gleichem Namen ablegen.
> > > - **Namen:** `B110 Folien 03 Entscheidungstheorie.pdf` (Code, Art, Nummer, Titel), Ordner `Unterlagen/<Code Modulname>`, daneben je Datei eine Notiz mit Status **neu · gelesen · bearbeitet**. Eigene Lösungen werden `Eigene Lösung 03` und erscheinen im Übungsblatt mit derselben Nummer, annotierte Folien `Mitschrift`.
> > > - **Stift auf dem iPad (einmal einrichten):** Dateien-App → PDF gedrückt halten → **Informationen** → **Immer öffnen mit: Vorschau**; dann **Öffnen mit** → Haken bei **Mit Quick Look anzeigen** entfernen. Danach **Öffnen ↗** → **Markieren** → **Fertig**: Die Anmerkungen stehen in derselben PDF. Nicht über „Teilen“ öffnen, das legt eine Kopie an.
> > > - **Lesen und zitieren:** `[[Datei.pdf#page=12]]` springt auf Seite 12. Die Suche findet nur Text in Notizen, nicht in PDFs. Jede PDF belegt Platz auf jedem Gerät; ganze Bücher lieber nicht ablegen.
>
> > [!eba-karte|hilfe|karteikarten]- Karteikarten <span class="eba-zeile-unter">Anlegen, lernen, wiederholen</span>
> > Karten stehen als normale Notizen je Modul im Ordner **Karteikarten**, Studium Autopilot plant die Wiederholungen.
> >
> > 1. [[Karteikarten]] → **Stapel anlegen** und das Modul wählen.
> > 2. Karten schreiben, eine je Absatz: `Frage :: Antwort`. Oder **Neue Karte** tippen.
> > 3. **Lernen** tippen, die Antwort ansehen und ehrlich bewerten: **Nochmal**, **Schwer**, **Gut** oder **Einfach**.
> > 4. Jeden Tag lernen, was fällig ist; das Dashboard zeigt es unter „Zu erledigen“.
> >
> > > [!eba-info]- Mehr erfahren
> > > - **Kartenarten:** `Frage :: Antwort` · `Frage ::: Antwort` lernt auch die Gegenrichtung · über mehrere Zeilen: Frage, dann eine Zeile nur mit `?`, dann die Antwort (`??` mit Gegenrichtung) · Lückentext: `Die {{c1::Grenzkosten}} sind …`, jede Nummer wird eine Karte. Überschriften gliedern, Formeln und Bilder gehen.
> > > - **Wiederholungen:** nach FSRS, demselben Verfahren wie in Anki. Über jedem Knopf steht, wann die Karte wiederkommt. Am Tag höchstens 20 neue Karten und 200 Wiederholungen je Modul; ändern unter **Optionen**.
> > > - **Kürzel am Rechner:** <kbd>Leertaste</kbd> Antwort zeigen, danach Gut · <kbd>1</kbd>–<kbd>4</kbd> bewerten · <kbd>Strg</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> rückgängig · <kbd>E</kbd> bearbeiten · <kbd>-</kbd> bis morgen zurückstellen · <kbd>@</kbd> aussetzen.
> > > - **Kennung:** Beim ersten Lernen bekommt jede Karte am Ende ein Kürzel wie `^k3f9a1b`. Es verbindet Karte und Lernstand: bitte stehen lassen. Den Text davor darfst du jederzeit ändern.
> > > - **Lernstand:** liegt je Gerät in `System/Daten/Karteikarten` und kommt über deinen Sync auf die anderen Geräte. Ausgesetzte und schwierige Karten findest du unter [[Karteikarten#Alle Karten]].
>
> > [!eba-karte|hilfe|aufbau]- Aufbau <span class="eba-zeile-unter">Ordner im Tresor</span>
> > | Ordner | Inhalt |
> > | --- | --- |
> > | **Dashboard** | Startseite mit Kennzahlen, Knöpfen, Woche, Fristen und To-dos |
> > | **Studium** | Übersichtsseiten: Studienverlauf, Termine & Anmeldungen, Prüfungen, Noten & ECTS, Unterlagen (mit Übungsblättern), Karteikarten, Kontakte & Links, Einstellungen & Hilfe, Stundenplan |
> > | **Module** | 86 Module aus dem Modulhandbuch (dazu der Vorkurs SQ888), sortiert nach Grundstudium, Profil & Vertiefung, Schwerpunktkatalog, Schlüsselqualifikation & Abschluss; eigene Module unter Weitere Module |
> > | **Vorlesungen, Übungsblätter, Schlüsselqualifikationen** | deine Notizen und SQ-Kurse |
> > | **Termine, Stundenplan** | Fristen, Events und Lehrveranstaltungen, je eine Notiz |
> > | **Eingang** | neue PDFs, Folien, Scans, bevor sie eingeordnet sind |
> > | **Unterlagen** | Folien, Skripte, Übungen, Lösungen, Altklausuren je Modul (`Unterlagen/<Code> <Modultitel>/…`), daneben je Datei eine Notiz |
> > | **Karteikarten** | deine Kartenstapel, je Modul eine oder mehrere Notizen |
> > | **Anhänge** | Bilder und Screenshots, die du in Notizen ziehst oder einfügst |
> > | **System** | gespeicherte Einstellungen, Semestertermine und Musterpläne (Daten), Gerüste und Skripte |
>
> > [!eba-karte|hilfe|geraete]- Geräte <span class="eba-zeile-unter">Einrichten, Unterschiede</span>
> > > [!eba-raster|2]
> > > > [!eba-regel] Einmal pro Gerät
> > > > 1. Ordner in Obsidian **als Tresor öffnen** (Name egal).
> > > > 2. **Vertrauen und Plugins aktivieren** tippen. Das Dashboard öffnet sich, Aussehen und Dateitypen sind schon eingestellt.
> > > > 3. Unter [[#Verbindungen]] Alma und ILIAS verbinden. Beides gilt nur für dieses Gerät.
> > > > 4. **Weiteres Gerät (optional):** Liegt der Tresor in iCloud, dort nur öffnen und **Vertrauen** tippen.
> > >
> > > > [!eba-info] Unterschiede je Gerät
> > > > - **Windows:** statt <kbd>⌘</kbd> die Taste <kbd>Strg</kbd>.
> > > > - **iPad/iPhone:** Tabellenzellen **antippen** statt Doppelklick, Aufgaben über das Kästchen-Symbol über der Tastatur, breite Tabellen seitlich wischen.
> >
> > > [!eba-achtung] Bitte nicht umbenennen
> > > `System/Einstellungen.md` und die Seiten in `Studium/` (vor allem Noten & ECTS, Prüfungen, Stundenplan, Unterlagen) nicht umbenennen. Das Feld **uebersicht** in Notizen bitte stehen lassen.
>
> > [!eba-karte|hilfe|stand]- Stand der Angaben <span class="eba-zeile-unter">Regeln und Module vom 30.09.2026, manches noch geschätzt</span>
> > Termine und Semesterdaten kommen laufend über die zentralen Daten und ersetzen nach und nach, was hier noch geschätzt ist.
> >
> > **Noch geschätzt**
> > - Nachholtermin **WS 2026/27** sowie Anmeldefristen und Klausurphasen ab **SS 2027**.
> > - Erasmus-Bewerbung **November 2027** und Bachelorarbeits-Frist **Juli 2028**.
> > - Orientierungsprüfung bis **30.09.2028**: aus „Ende des 4. Fachsemesters“ abgeleitet, gilt ohne Urlaubssemester.
> >
> > **Nicht belegt oder widersprüchlich**
> > - Formale Wahl der Variante: weder PO noch Modulhandbuch regeln Wie und Wann; klärt die Studienfachberatung. Studium Autopilot empfiehlt die Wahl vor dem 3. Fachsemester, weil sich ab dann die Musterpläne unterscheiden.
> > - **B370** und **S313** ohne Modulbeschreibung, **S312** in keiner EcoBA-Studienplantabelle.
> > - Frist der Orientierungsprüfung: Modulhandbuch nennt in einem Plan Ende **FS 3**, maßgeblich ist die PO mit **FS 4**.
> > - Rücktritt bei Krankheit: BRPO „unverzüglich“, FAQ „innerhalb von drei Werktagen“; im Zweifel sofort handeln.
> > - Gesamtnote: ob nach zwei Stellen abgeschnitten wird, regelt die BRPO nicht eindeutig (**§ 35 Abs. 2** verweist nicht auf § 19 Abs. 3 Satz 3); Studium Autopilot schneidet ab.
> > - Elective Studies: fachfremde Fächer (z. B. Informatik, Mathematik, Psychologie, Recht) mit mind. **15 ECTS** je Fach.
> > - Manche Schwerpunktbereiche und Bachelorseminare setzen Module voraus (z. B. **B342**: **B240** oder **B340**); vor der Wahl die Modulbeschreibung prüfen.
> > - „Ohne Spezialisierung“ mit Data Science allein: ob VWL- und BWL-Pflicht erfüllt sind, sagt das Modulhandbuch nicht; die Prüfung unter Schwerpunkte im Studienverlauf lässt es zu.
> > - Citavi-Campuslizenz nicht belegt (Zotero und EndNote sind belegt).
> > - Kein fachbereichsweiter Leitfaden für wissenschaftliches Arbeiten belegt; es gibt Vorgaben einzelner Lehrstühle.
