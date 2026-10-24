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

```eba-personalisieren angaben
Deine Angaben: erscheinen, sobald Studium Autopilot läuft. Ändern: Befehl „Deine Angaben ändern“.
```

## Verbindungen

```eba-verbindungen
Verbindungen: erscheinen, sobald Studium Autopilot läuft.
```

## Variante

```eba-personalisieren variante
Variante: erscheint, sobald Studium Autopilot läuft. Wählen: Befehl „Variante wählen“.
```

## Darstellung

```eba-darstellung
Darstellung: erscheint, sobald Studium Autopilot läuft. Wählen: Befehl „Darstellung wählen“.
```

## Hilfe

> [!eba-zeilen]
> > [!eba-karte|hilfe|bedienung]- Bedienung
> > | Knopf | Wo | Fragt nach | Landet in |
> > | --- | --- | --- | --- |
> > | Neue Vorlesungsnotiz | Dashboard, Modulseite (Abschnitt Vorlesungen), **+** (neue Notiz) | nichts, wenn laut Stundenplan oder Termin gerade etwas läuft (sonst Modul und Thema; auf der Modulseite ist das Modul gewählt) | Vorlesungen/Modulcode, Dateiname „Datum Code VL 03“, angezeigt als „Vorlesung 3 · Di 27.10. · Thema“ |
> > | Unterlagen hinzufügen | Dashboard, Modulseite, [[Unterlagen]] | Dateien, dann die Vorschau der neuen Namen | Unterlagen/Modul |
> > | Unterlagen aktualisieren | [[Unterlagen]] (sobald ILIAS verbunden ist) | nichts | Unterlagen/Modul |
> > | Neuer Termin | [[Termine & Anmeldungen]] (im Kalender **+ Termin**) | Was, Wann, Uhrzeit, Ort, Art und Modul (Art und Modul schlägt der Titel vor) | Termine |
> >
> > - **Übersicht:** steht links in der Seitenleiste, mit allen Seiten und den Modulen dieses Semesters. Auf iPhone und iPad öffnest du sie mit dem Symbol oben links. **Dashboard** darin führt zurück zum Start, **Zurück** zur vorigen Seite. Deine Woche steht auf dem **Dashboard**.
> > - **Vorlagen:** Jeder Knopf öffnet ein Fenster mit allen Angaben und legt eine fertige Notiz an. <kbd>Strg</kbd>/<kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>N</kbd> fragt, welche Notiz entstehen soll.
> > - Jedes Feld hat einen Vorschlag. <kbd>Esc</kbd> oder **Abbrechen** legt nichts an. Datum als „15.10.“, „15.10.2026“ oder „+7“ (in einer Woche), darunter steht, welcher Tag gemeint ist.
> > - **Rückgängig:** Was du wegwirfst oder abhakst, passiert sofort; der Hinweis danach hat **Rückgängig**. Nachgefragt wird nur, wenn etwas endgültig weg ist, etwa beim **Trennen**.
>
> > [!eba-karte|hilfe|vorlesung]- Vorlesung
> > > [!eba-raster|2]
> > > > [!eba-karte] Schnell mitschreiben
> > > > 1. Dashboard → **Vorlesung**. Läuft laut Stundenplan gerade etwas, entsteht die Notiz **sofort**; nochmal tippen öffnet **dieselbe Notiz**. Sonst wählst du das Modul.
> > > > 2. Nummer, Folien-PDF und Dozent trägt die Vorlage selbst ein, der Cursor steht unter **Mitschrift**.
> > > > 3. Stelle auf den Folien: Befehl **Seitenlink** → Seitenzahl → „S. 12“ springt auf die Seite.
> > > > 4. Prüfungsstoff: `#klausur` direkt an die Zeile schreiben.
> > >
> > > > [!eba-regel] Nacharbeiten
> > > > - Abends **Kernaussagen** ergänzen und offene Fragen klären.
> > > > - Dann oben in der Notiz auf **Nacharbeit offen** tippen, daraus wird **Nachgearbeitet**.
> > > > - Handschrift auf den Folien: Abschnitt „Unterlagen“ unten, „Mit dem Stift annotieren“.
> > > > - **Seitenlink aufs iPad legen (einmal):** Obsidian-Einstellungen → *Werkzeugleiste für Mobilgeräte* → „Studium Autopilot: Seitenlink auf die Folien einfügen“ hinzufügen.
>
> > [!eba-karte|hilfe|alltag]- Im Alltag
> > > [!eba-raster|2]
> > > > [!eba-karte] Status und Note eines Moduls
> > > > - Auf der Modulseite unter **Status** auf den Knopf tippen (z. B. **Offen**) und wählen: offen · läuft · angemeldet · bestanden · nicht bestanden · anerkannt.
> > > > - Bei **bestanden** und **nicht bestanden** fragt ein Fenster nach der Note (mit Komma, z. B. `1,7`). Im selben Menü: **Note eintragen …**, Versuch und **Semester planen …**.
> > > > - Tabellen und Listen zeigen nur an. Ändern geht im Kopf der Notiz: Unter dem Titel steht ihr Stand zum Antippen, z. B. **Offen** bei einem Termin oder **Noch nicht gelesen** bei einer Unterlage.
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
> > > > [!eba-karte] Stundenplan, Gruppen, Angebote
> > > > - **Übungsgruppe:** Unter [[Termine & Anmeldungen#Übungen und Tutorien]] bei deiner Gruppe **Meine** tippen, sie steht dann im Stundenplan. Mit ILIAS kommt sie von selbst.
> > > > - **Besuche ich nicht:** Im Kopf der Lehrveranstaltung auf **Im Stundenplan** tippen, dann fehlt sie im Stundenplan. Der Hinweis danach hat **Rückgängig**.
> > > > - **Angebote der Uni:** Kurse, Vorträge und Sport stehen unter [[Termine & Anmeldungen#Angebote der Uni]]. Mit **Auswahl ändern** wählst du, was du siehst.
> > > > - **Lernplan:** Mit eigenem Uni-Abgleich zeigt die Seite **Lernplan** je Modul, welches Kapitel diese Woche dran ist.
> > >
> > > > [!eba-rechner] Was sich selbst rechnet
> > > > - Aktuelles Semester, Phase und Woche aus deinen Angaben oben.
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
> > [!eba-karte|hilfe|unterlagen]- Unterlagen
> > Kursdateien kommen von selbst aus ILIAS, alles andere fügst du selbst hinzu.
> >
> > 1. Einmal unter [[#Verbindungen]] auf **Uni-Login** tippen, dich anmelden und deine Kurse wählen. Neue Dateien landen dann von selbst unter [[Unterlagen]], sofort mit **Unterlagen aktualisieren**.
> > 2. Andere Dateien (Mail, Scan, Foto): **Unterlagen hinzufügen** tippen, dann **Dateien auswählen**. Am PC kannst du sie auch ins Fenster ziehen.
> > 3. In der Vorschau **Alle übernehmen**.
> > 4. Zum Lesen und Anmerken in der Unterlage **Öffnen ↗** tippen.
> >
> > > [!eba-info]- Mehr erfahren
> > > - **ILIAS:** Ein Gerät reicht, die Dateien kommen über deinen Sync auf die anderen. Trennen: [[#Verbindungen]] → **Uni-Login** → **Trennen** (trennt alles, was der Uni-Login auf diesem Gerät verbunden hat).
> > > - **Verbinden klappt nicht:** Fragt die Uni nach deiner Zustimmung, einmal im Browser bei ILIAS anmelden und zustimmen, dann erneut **Verbinden**. Mit zweitem Faktor geht es noch nicht.
> > > - **Was nicht kommt:** Videos und Dateien über 50 MB bleiben in ILIAS. Was du löschst, kommt nicht wieder. Umbenennen und Verschieben ist sicher.
> > > - **Geänderte Dateien:** Hast du eine Datei angemerkt und der Dozent lädt sie neu hoch, bleibt deine, die neue liegt daneben als „… neue Fassung JJJJ-MM-TT“.
> > > - **Aus Mail, Safari oder von Papier:** Auf iPhone/iPad erst **Teilen → In Dateien sichern**, Papier über die App **Dateien → ⋯ → Dokumente scannen**, dann **Dateien auswählen**. ZIP vorher entpacken (in der Dateien-App antippen) und die Dateien darin wählen. PowerPoint: als PDF mit gleichem Namen exportieren und beide wählen.
> > > - **Namen:** `B110 Folien 03 Entscheidungstheorie.pdf` (Code, Art, Nummer, Titel), Ordner `Unterlagen/<Code Modulname>`. Daneben liegt je Datei eine Notiz mit gleichem Namen: Darin merkt sich Studium Autopilot Modul, Art und ob du die Datei schon geöffnet hast. Tippst du sie an, siehst du gleich die PDF. **Neu** auf der Seite Unterlagen ist, was in den letzten 14 Tagen dazukam und du noch nicht geöffnet hast. Ein Übungsblatt (`Übung 03`) zeigt oben seine Abgabe und einen Knopf **Offen** oder **Abgegeben**, der auch die Frist abhakt. Eigene Lösungen werden `Eigene Lösung 03` und erscheinen beim Übungsblatt mit derselben Nummer, annotierte Folien `Mitschrift`.
> > > - **Stift auf dem iPad (einmal einrichten):** Dateien-App → PDF gedrückt halten → **Informationen** → **Immer öffnen mit: Vorschau**; dann **Öffnen mit** → Haken bei **Mit Quick Look anzeigen** entfernen. Danach **Öffnen ↗** → **Markieren** → **Fertig**: Die Anmerkungen stehen in derselben PDF. Nicht über „Teilen“ öffnen, das legt eine Kopie an.
> > > - **Lesen und zitieren:** `[[Datei.pdf#page=12]]` springt auf Seite 12. Die Suche findet nur Text in Notizen, nicht in PDFs. Jede PDF belegt Platz auf jedem Gerät; ganze Bücher lieber nicht ablegen.
>
> > [!eba-karte|hilfe|karteikarten]- Karteikarten
> > Karten stehen als normale Notizen je Modul im Ordner **Karteikarten**, Studium Autopilot plant die Wiederholungen.
> >
> > 1. [[Karteikarten]] → **Neuer Kartenstapel** und das Modul wählen.
> > 2. Karten schreiben, eine je Absatz: `Frage :: Antwort`. Oder **Neue Karte** tippen.
> > 3. **Lernen** tippen, die Antwort ansehen und ehrlich bewerten: **Nochmal**, **Schwer**, **Gut** oder **Einfach**.
> > 4. Jeden Tag lernen, was fällig ist; das Dashboard zeigt es unter „Zu erledigen“.
> >
> > > [!eba-info]- Mehr erfahren
> > > - **Kartenarten:** `Frage :: Antwort` · `Frage ::: Antwort` lernt auch die Gegenrichtung · über mehrere Zeilen: Frage, dann eine Zeile nur mit `?`, dann die Antwort (`??` mit Gegenrichtung) · Lückentext: `Die {{c1::Grenzkosten}} sind …`, jede Nummer wird eine Karte. Überschriften gliedern, Formeln und Bilder gehen.
> > > - **Wiederholungen:** nach FSRS, demselben Verfahren wie in Anki. Über jedem Knopf steht, wann die Karte wiederkommt. Am Tag höchstens 20 neue Karten und 200 Wiederholungen je Modul; ändern unter **Lernoptionen**.
> > > - **Kürzel am Rechner:** <kbd>Leertaste</kbd> Antwort zeigen, danach Gut · <kbd>1</kbd>–<kbd>4</kbd> bewerten · <kbd>Strg</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> rückgängig · <kbd>E</kbd> bearbeiten · <kbd>-</kbd> bis morgen zurückstellen · <kbd>@</kbd> aussetzen.
> > > - **Kennung:** Beim ersten Lernen bekommt jede Karte am Ende ein Kürzel wie `^k3f9a1b`. Es verbindet Karte und Lernstand: bitte stehen lassen. Den Text davor darfst du jederzeit ändern.
> > > - **Lernstand:** liegt je Gerät in `System/Daten/Karteikarten` und kommt über deinen Sync auf die anderen Geräte. Ausgesetzte und schwierige Karten findest du unter [[Karteikarten#Alle Karten]].
>
> > [!eba-karte|hilfe|aufbau]- Aufbau
> > | Ordner | Inhalt |
> > | --- | --- |
> > | **Dashboard** | Startseite mit Kennzahlen, Knöpfen, Woche, Fristen und To-dos |
> > | **Studium** | Übersichtsseiten: Studienverlauf, Termine & Anmeldungen, Prüfungen, Noten & ECTS, Unterlagen (mit Übungen), Karteikarten, Kontakte & Links, Einstellungen & Hilfe, Stundenplan |
> > | **Module** | 86 Module aus dem Modulhandbuch (dazu der Vorkurs SQ888), sortiert nach Grundstudium, Profil & Vertiefung, Schwerpunktkatalog, Schlüsselqualifikation & Abschluss; eigene Module unter Weitere Module |
> > | **Vorlesungen, Schlüsselqualifikationen** | deine Notizen und SQ-Kurse |
> > | **Termine, Stundenplan** | Fristen, Events und Lehrveranstaltungen, je eine Notiz |
> > | **Unterlagen** | Folien, Skripte, Übungen, Lösungen, Altklausuren je Modul (`Unterlagen/<Code> <Modultitel>/…`), daneben je Datei eine Notiz |
> > | **Karteikarten** | deine Kartenstapel, je Modul eine oder mehrere Notizen |
> > | **Anhänge** | Bilder und Screenshots, die du in Notizen ziehst oder einfügst |
> > | **System** | gespeicherte Einstellungen, Semestertermine und Musterpläne (Daten), Gerüste und Skripte |
>
> > [!eba-karte|hilfe|geraete]- Geräte
> > > [!eba-raster|2]
> > > > [!eba-regel] Einmal pro Gerät
> > > > 1. In Obsidian **Ordner als Vault öffnen** und den Ordner wählen (Name egal). Der Ordner ist dein Tresor (in Obsidian: Vault).
> > > > 2. **Dem Ersteller vertrauen und Erweiterungen aktivieren** tippen. Das Dashboard öffnet sich, Aussehen und Dateitypen sind schon eingestellt.
> > > > 3. Unter [[#Verbindungen]] auf **Uni-Login** tippen und deinen Uni-Login eingeben: Er verbindet ILIAS, den ILIAS-Kalender und Alma. Ein Gerät reicht: Die anderen zeigen „verbunden“ und bekommen alles über deinen Sync.
> > > > 4. **Weiteres Gerät (optional):** Liegt der Tresor in iCloud, dort nur öffnen und **Dem Ersteller vertrauen und Erweiterungen aktivieren** tippen.
> > >
> > > > [!eba-info] Unterschiede je Gerät
> > > > - **Windows:** statt <kbd>⌘</kbd> die Taste <kbd>Strg</kbd>.
> > > > - **Neue Version:** Unter [[#Verbindungen]] auf **Updates** tippen, dann auf **Neue Version installieren**; steht dort **Nach Updates suchen**, sieht ein Tipp sofort nach. Deine anderen Geräte bekommen sie über den Sync, dort höchstens einmal **Neu laden**.
> > > > - **iPad/iPhone:** Aufgaben über das Kästchen-Symbol über der Tastatur. Tabellen stehen auf allen Geräten als Liste untereinander.
> >
> > > [!eba-achtung] Bitte nicht umbenennen
> > > Die Seiten im Ordner **Studium** (vor allem Noten & ECTS, Prüfungen, Stundenplan, Unterlagen) und die Einstellungen im Ordner **System** nicht umbenennen. Die Eigenschaft **uebersicht** oben in deinen Notizen bitte stehen lassen, über sie finden die Übersichten deine Notizen.
>
> > [!eba-karte|hilfe|stand]- Stand der Angaben
> > Termine und Semesterdaten kommen laufend über die zentralen Daten. Was die Uni noch nicht veröffentlicht hat, ist überall als geschätzt markiert; alle Semester mit ihrem Stand stehen unter [[System/Daten/Semester|Semestertermine]]. Die Frist der Orientierungsprüfung rechnet der Studienverlauf aus deinem Studienbeginn, ohne Urlaubssemester.
> >
> > **Nicht belegt oder widersprüchlich**
> > - Formale Wahl der Variante: weder PO noch Modulhandbuch regeln Wie und Wann; klärt die Studienfachberatung. Studium Autopilot empfiehlt die Wahl vor dem 3. Fachsemester, weil sich ab dann die Musterpläne unterscheiden.
> > - **B370** und **S313** ohne Modulbeschreibung, **S312** in keiner EcoBA-Studienplantabelle.
> > - Frist der Orientierungsprüfung: Modulhandbuch nennt in einem Plan das Ende des **3. Fachsemesters**, maßgeblich ist die PO mit dem **4. Fachsemester**.
> > - Rücktritt bei Krankheit: BRPO „unverzüglich“, FAQ „innerhalb von drei Werktagen“; im Zweifel sofort handeln.
> > - Gesamtnote: ob nach zwei Stellen abgeschnitten wird, regelt die BRPO nicht eindeutig (**§ 35 Abs. 2** verweist nicht auf § 19 Abs. 3 Satz 3); Studium Autopilot schneidet ab.
> > - Elective Studies: fachfremde Fächer (z. B. Informatik, Mathematik, Psychologie, Recht) mit mind. **15 ECTS** je Fach.
> > - Manche Schwerpunktbereiche und Bachelorseminare setzen Module voraus (z. B. **B342**: **B240** oder **B340**); vor der Wahl die Modulbeschreibung prüfen.
> > - „Ohne Spezialisierung“ mit Data Science allein: ob VWL- und BWL-Pflicht erfüllt sind, sagt das Modulhandbuch nicht; die Prüfung unter Schwerpunkte im Studienverlauf lässt es zu.
> > - Citavi-Campuslizenz nicht belegt (Zotero und EndNote sind belegt).
> > - Kein fachbereichsweiter Leitfaden für wissenschaftliches Arbeiten belegt; es gibt Vorgaben einzelner Lehrstühle.
