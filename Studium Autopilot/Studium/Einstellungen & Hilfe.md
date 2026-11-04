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

## Darstellung

```eba-darstellung
Darstellung: erscheint, sobald Studium Autopilot läuft. Wählen: Befehl „Darstellung wählen“.
```

## Obsidian

```eba-personalisieren obsidian
Obsidian: erscheint, sobald Studium Autopilot läuft.
```

## Hilfe

> [!eba-zeilen]
> ```eba-personalisieren hilfe
> Rundgang: erscheint, sobald Studium Autopilot läuft. Starten: Befehl „Rundgang zeigen“.
> ```
>
> > [!eba-karte|hilfe|bedienung]- Bedienung
> > - **Seiten:** Unten rechts hinter ≡ stehen alle Seiten und die Module dieses Semesters. **Dashboard** führt zurück zum Start.
> > - **Leiste daneben:** ‹ › für zurück und vor, die Suche, **+** für einen neuen Tab, deine offenen Tabs und das Zahnrad für diese Seite. Auf iPhone und iPad geht es auch mit Wischen vom linken Rand zurück.
> > - **Befehle:** Auf iPhone und iPad ≡ lange drücken, dann **Befehlspalette öffnen**. Mit Tastatur: <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>P</kbd>.
> > - **Neue Notizen:** Jeder Knopf öffnet ein Fenster, in dem jedes Feld schon einen Vorschlag hat. Datum als „15.10.“, „15.10.2026“ oder „+7“ (in einer Woche). <kbd>Esc</kbd> oder **Abbrechen** legt nichts an.
> > - **Rückgängig:** Wegwerfen und Abhaken passiert sofort, der Hinweis danach hat **Rückgängig**. Nachgefragt wird nur, wenn etwas endgültig weg ist, etwa beim **Trennen**.
> >
> > | Knopf | Wo | Fragt nach | Landet in |
> > | --- | --- | --- | --- |
> > | Neue Vorlesungsnotiz | Dashboard, Modulseite | Modul und Thema; nichts, wenn laut Stundenplan gerade etwas läuft | Vorlesungen, angezeigt als „Vorlesung 3 · Di 27.10. · Thema“ |
> > | Unterlagen hinzufügen | Dashboard, Modulseite, [[Unterlagen]] | Dateien, dann die Vorschau der neuen Namen | Unterlagen |
> > | Neuer Termin | [[Termine & Anmeldungen]], im Kalender **+ Termin** | Was, Wann, Uhrzeit, Ort; Art und Modul schlägt der Titel vor | Termine |
> > | Neuer Kartenstapel | [[Karteikarten]] | Modul | Karteikarten |
> >
> > | Kürzel | Wirkung |
> > | --- | --- |
> > | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>⇧</kbd> <kbd>N</kbd> | Notiz aus Vorlage, fragt welche |
> > | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>P</kbd> | Befehle |
> > | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>O</kbd> | Notiz öffnen |
> > | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>E</kbd> | Lesen / Bearbeiten |
> > | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>L</kbd> | Zeile wird Aufgabe |
>
> > [!eba-karte|hilfe|vorlesung]- Vorlesung
> > > [!eba-raster|2]
> > > > [!eba-karte] Mitschreiben
> > > > 1. **Neue Vorlesungsnotiz** tippen. Läuft laut Stundenplan gerade etwas, entsteht die Notiz sofort, ein zweiter Tipp öffnet dieselbe. Sonst wählst du das Modul.
> > > > 2. Nummer, Folien und Dozent trägt die Vorlage ein, der Cursor steht unter **Mitschrift**.
> > > > 3. Auf eine Folienseite verweisen: Befehl **Seitenlink**, Seitenzahl eingeben; „S. 12“ springt dorthin.
> > > > 4. Prüfungsstoff: `#klausur` an die Zeile schreiben.
> > >
> > > > [!eba-regel] Nacharbeiten
> > > > - **Kernaussagen** ergänzen und offene Fragen klären.
> > > > - Oben in der Notiz **Nacharbeit offen** tippen, dann steht dort **Nachgearbeitet**. Bis dahin steht die Vorlesung auf dem Dashboard unter „Nachzuarbeiten“.
> > > > - **Seitenlink aufs iPad legen (einmal):** Obsidian-Einstellungen → *Werkzeugleiste für Mobilgeräte* → „Studium Autopilot: Seitenlink auf die Folien einfügen“.
> > > > - Mit dem Stift auf den Folien schreiben: siehe **Unterlagen**.
>
> > [!eba-karte|hilfe|alltag]- Im Alltag
> > > [!eba-raster|2]
> > > > [!eba-karte] Status und Note eines Moduls
> > > > - Auf der Modulseite unter **Status** den Knopf tippen (z. B. **Offen**) und wählen: offen · läuft · angemeldet · bestanden · nicht bestanden · anerkannt.
> > > > - Bei **bestanden** und **nicht bestanden** fragt ein Fenster nach der Note (`1,7`). Im selben Menü: **Note eintragen …**, Versuch und **Semester planen …**.
> > > > - Tabellen und Listen zeigen nur an. Geändert wird im Kopf der Notiz, etwa **Offen** bei einem Termin oder **Noch nicht gelesen** bei einer Unterlage.
> > >
> > > > [!eba-fragen] Fragen und To-dos
> > > > - Zeile schreiben, <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>L</kbd> macht daraus eine Aufgabe (iPhone/iPad: Kästchen über der Tastatur).
> > > > - Endet sie mit **?** oder enthält sie `#frage`, steht sie auf dem Dashboard unter „Offene Fragen“, sonst unter „To-dos“.
> > > > - Abgehakt verschwindet sie.
> > >
> > > > [!eba-karte] Schreiben
> > > > - `#klausur` für Prüfungsstoff: [Alles Prüfungsrelevante](obsidian://studium-autopilot?aktion=suchen&q=tag%3A%23klausur)
> > > > - `==Text==` markiert, `[[Begriff]]` verlinkt.
> > > > - Formeln mit `$…$` oder `$$…$$` (LaTeX).
> > > > - `/` am Zeilenanfang öffnet die Befehle.
> > >
> > > > [!eba-karte] Stundenplan und Termine
> > > > - **Übungsgruppe:** [[Termine & Anmeldungen]] → Reiter **Übungen** → bei deiner Gruppe **Meine**. Mit ILIAS kommt sie von selbst.
> > > > - **Besuche ich nicht:** Im Kopf der Lehrveranstaltung **Im Stundenplan** tippen, dann fehlt sie dort.
> > > > - **Angebote der Uni:** Kurse, Vorträge und Sport stehen im Kalender unter [[Termine & Anmeldungen]]; was du siehst, wählst du im Filter.
> > > > - **Uni-Mails:** [[Postfach]] zeigt deinen Uni-Posteingang, sobald du dort auf diesem Gerät **Postfach anzeigen** tippst.
> > > > - **Widgets** (iPhone, iPad): Stundenplan, Fristen und Prüfungen auf dem Home- und Sperrbildschirm, einrichten oben unter **Widgets**.
> > >
> > > > [!eba-rechner] Was sich selbst rechnet
> > > > - Semester, Phase und Woche aus deinen Angaben oben.
> > > > - ECTS, Gesamtnote nach § 13 und Orientierungsprüfung aus den Modulen.
> > > > - Nächste Prüfung und Fristen aus Modulen und Terminen.
> > > > - Schwerpunktbereiche und ihre Regeln im [[Studienverlauf#Schwerpunkte|Studienverlauf]].
>
> > [!eba-karte|hilfe|unterlagen]- Unterlagen
> > Kursdateien kommen von selbst aus ILIAS, alles andere fügst du selbst hinzu.
> >
> > 1. Einmal unter [[#Verbindungen]] **Uni-Login** tippen, anmelden und deine Kurse wählen. Neue Dateien landen von selbst unter [[Unterlagen]], sofort mit **Unterlagen aktualisieren**.
> > 2. Andere Dateien (Mail, Scan, Foto): **Unterlagen hinzufügen** → **Dateien auswählen**. Am Computer auch ins Fenster ziehen.
> > 3. Die Vorschau der neuen Namen übernehmen.
> > 4. Zum Lesen und Anmerken in der Unterlage **Öffnen ↗** tippen.
> >
> > > [!eba-info]- Mehr erfahren
> > > - **ILIAS:** Ein Gerät reicht, die Dateien kommen über deinen Sync auf die anderen. Videos und Dateien über 50 MB bleiben in ILIAS. Was du löschst, kommt nicht wieder; Umbenennen und Verschieben ist sicher.
> > > - **Verbinden klappt nicht:** Fragt die Uni nach deiner Zustimmung, einmal im Browser bei ILIAS anmelden und zustimmen, dann erneut **Verbinden**. Mit zweitem Faktor geht es noch nicht.
> > > - **Trennen:** [[#Verbindungen]] → **Uni-Login** → **Trennen** trennt alles, was der Uni-Login auf diesem Gerät verbunden hat.
> > > - **Neue Fassung:** Lädt der Dozent eine Datei neu hoch, die du angemerkt hast, bleibt deine, die neue liegt daneben als „… neue Fassung JJJJ-MM-TT“.
> > > - **Aus Mail, Safari oder von Papier:** Auf iPhone/iPad erst **Teilen → In Dateien sichern**, Papier über **Dateien → ⋯ → Dokumente scannen**, dann **Dateien auswählen**. ZIP vorher in der Dateien-App entpacken. PowerPoint als PDF mit gleichem Namen exportieren und beide wählen.
> > > - **Namen:** `B110 Folien 03 Entscheidungstheorie.pdf` (Code, Art, Nummer, Titel) im Ordner des Moduls. Daneben liegt je Datei eine Notiz gleichen Namens, in der sich Studium Autopilot Modul, Art und Gelesen merkt.
> > > - **Übungen:** Ein Übungsblatt (`Übung 03`) zeigt oben seine Abgabe und **Offen** bzw. **Abgegeben**, das hakt auch die Frist ab. Eigene Lösungen heißen `Eigene Lösung 03`, annotierte Folien `Mitschrift`.
> > > - **Neu** auf der Seite Unterlagen ist, was in den letzten 14 Tagen kam und du noch nicht geöffnet hast.
> > > - **Stift auf dem iPad (einmal einrichten):** Dateien-App → PDF gedrückt halten → **Informationen** → **Immer öffnen mit: Vorschau**; dann **Öffnen mit** → Haken bei **Mit Quick Look anzeigen** entfernen. Danach **Öffnen ↗** → **Markieren** → **Fertig**: Die Anmerkungen stehen in derselben PDF. Nicht über „Teilen“ öffnen, das legt eine Kopie an.
> > > - **Zitieren:** `[[Datei.pdf#page=12]]` springt auf Seite 12. Jede PDF belegt Platz auf jedem Gerät; ganze Bücher lieber nicht ablegen.
>
> > [!eba-karte|hilfe|karteikarten]- Karteikarten
> > Karten sind normale Notizen im Ordner **Karteikarten**, Studium Autopilot plant die Wiederholungen.
> >
> > 1. [[Karteikarten]] → **Neuer Kartenstapel** und das Modul wählen.
> > 2. Eine Karte je Absatz: `Frage :: Antwort`. Oder **Neue Karte** tippen.
> > 3. **Lernen**, Antwort ansehen und ehrlich bewerten: **Nochmal**, **Schwer**, **Gut** oder **Einfach**.
> > 4. Jeden Tag lernen, was fällig ist; das Dashboard zeigt es unter „Zu erledigen“.
> >
> > > [!eba-info]- Mehr erfahren
> > > - **Kartenarten:** `Frage :: Antwort` · `Frage ::: Antwort` lernt auch die Gegenrichtung · über mehrere Zeilen: Frage, dann eine Zeile nur mit `?`, dann die Antwort (`??` mit Gegenrichtung) · Lückentext: `Die {{c1::Grenzkosten}} sind …`, jede Nummer wird eine Karte. Überschriften werden Kapitel, Formeln und Bilder gehen.
> > > - **Wie viel am Tag:** höchstens 20 neue Karten über alle Module zusammen und 200 Wiederholungen je Modul; ändern unter **Lernoptionen**. Über jedem Knopf steht, wann die Karte wiederkommt (FSRS, wie in Anki).
> > > - **Menü ⋯ eines Stapels:** **Ganzen Stapel lernen** statt nur der neuen von heute · **Üben …** geht ein Modul, ein Kapitel oder die schwierigen Karten durch, ohne den Lernstand zu ändern, etwa vor einer Prüfung · **Pausieren** nimmt den Stapel nach der Prüfung aus dem Tagesplan · **Stapel löschen** mit **Rückgängig**.
> > > - **Kürzel am Computer:** <kbd>Leertaste</kbd> Antwort zeigen, danach Gut · <kbd>1</kbd>–<kbd>4</kbd> bewerten · <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>Z</kbd> rückgängig · <kbd>E</kbd> bearbeiten · <kbd>-</kbd> bis morgen zurückstellen · <kbd>@</kbd> aussetzen.
> > > - **Kennung:** Beim ersten Lernen bekommt jede Karte am Ende ein Kürzel wie `^k3f9a1b`. Es verbindet Karte und Lernstand: stehen lassen. Den Text davor darfst du jederzeit ändern.
> > > - **Lernstand:** kommt über deinen Sync auf alle Geräte. Ausgesetzte und schwierige Karten findest du unter [[Karteikarten#Alle Karten]].
>
> > [!eba-karte|hilfe|lernplan]- Lernplan
> > Der [[Lernplan]] verteilt die Kapitel jedes Moduls dieses Semesters bis zur Prüfung, sobald es für das Modul eine Kapitelliste gibt. Mit eigenem Server bekommst du ihn auch für die übrigen Module.
> >
> > 1. Was diese Woche dran ist, steht im Lernplan, auf dem Dashboard und auf der Modulseite.
> > 2. Hast du ein Kapitel verstanden, hak es ab. **Folien** daneben öffnet seine Folien.
> > 3. Oben stellst du ein, nach wie viel der Zeit bis zur Prüfung alles verstanden sein soll. Danach beginnt die Klausurvorbereitung: Altklausuren, Übungsblätter und Karteikarten stehen je Modul unter **Üben**.
> >
> > > [!eba-info]- Mehr erfahren
> > > - **Vor der Vorlesung lernen** und **Zeit je Kapitel** stellst du je Modul hinter dem Regler oben rechts im Lernplan ein.
> > > - **Abhaken** heißt verstanden, nicht auswendig gelernt. Das Üben kommt in der Klausurvorbereitung.
>
> > [!eba-karte|hilfe|claude]- Claude-App
> > Mit eigenem Server fragst du Claude in der Claude-App nach deinem Studium, etwa „Was steht diese Woche an?“. Claude fragt dafür deinen Server und ändert nichts.
> >
> > 1. [[#Verbindungen]] → **Eigener Server** → **Mit der Claude-App verbinden**. Es zeigt eine Adresse und einen Code, der 10 Minuten gilt.
> > 2. In der Claude-App in den Einstellungen unter **Konnektoren** („Connectors“) einen eigenen Konnektor mit dieser Adresse hinzufügen („Add custom connector“) und zweimal **Weiter** („Continue“) tippen. Die Schritte stehen im Fenster.
> > 3. Auf der Seite deines Servers den Code eingeben und **Verbinden** tippen. Danach steht der Konnektor auch in der Claude-App auf iPhone, iPad und Computer.
> >
> > > [!eba-info]- Mehr erfahren
> > > - **Was Claude sieht:** Termine und Fristen, offene To-dos, deinen Lernplan, fällige Karteikarten je Modul, Prüfungen mit Noten, deinen Stundenplan der nächsten 14 Tage und die Hinweise deines Servers.
> > > - **Hinweis in der Claude-App:** Nutze nur Konnektoren von Entwicklern, denen du vertraust. Hier ist das dein eigener Server. Die Angaben zur Anmeldung danach lässt du, wie sie sind. Steht hinter dem Konnektor noch „Connect“, ist er nicht verbunden: antippen und einen neuen Code eingeben.
> > > - **Stand:** was dein Gerät zuletzt an den Server geschickt hat; Claude sagt dazu, wann. Fehlt etwas Neues, Obsidian kurz öffnen.
> > > - **Trennen:** im selben Fenster. Jede neue Verbindung zeigt Studium Autopilot auf allen deinen Geräten.
> > > - Bei Anmeldungen, Abgaben und Noten gelten weiter Alma und ILIAS.
>
> > [!eba-karte|hilfe|aufbau]- Aufbau
> > | Ordner | Inhalt |
> > | --- | --- |
> > | **Dashboard** | Startseite mit Kennzahlen, Knöpfen, Woche, Fristen und To-dos |
> > | **Studium** | Übersichtsseiten: Studienverlauf, Termine & Anmeldungen, Postfach, Prüfungen, Noten & ECTS, Unterlagen, Lernplan, Karteikarten, Kontakte & Links, Stundenplan, Einstellungen & Hilfe |
> > | **Module** | 86 Module aus dem Modulhandbuch und der Vorkurs SQ888; eigene Module unter Weitere Module |
> > | **Vorlesungen, Schlüsselqualifikationen** | deine Mitschriften und SQ-Kurse |
> > | **Termine, Stundenplan** | Fristen, Events und Lehrveranstaltungen, je eine Notiz |
> > | **Unterlagen** | Folien, Skripte, Übungen, Lösungen, Altklausuren je Modul, daneben je Datei eine Notiz |
> > | **Lernplan, Karteikarten** | Kapitel je Modul und deine Kartenstapel |
> > | **Anhänge** | Bilder und Screenshots, die du in Notizen einfügst |
> > | **System** | Einstellungen, Semestertermine, Gerüste und Skripte |
> >
> > > [!eba-achtung] Bitte nicht umbenennen
> > > Die Seiten im Ordner **Studium** und die Dateien im Ordner **System** nicht umbenennen. Die Eigenschaft **uebersicht** oben in deinen Notizen bitte stehen lassen: Über sie finden die Übersichten deine Notizen.
>
> > [!eba-karte|hilfe|geraete]- Geräte
> > > [!eba-raster|2]
> > > > [!eba-regel] Einmal pro Gerät
> > > > 1. In Obsidian **Ordner als Vault öffnen** und den Ordner wählen (Name egal). Der Ordner ist dein Tresor (in Obsidian: Vault).
> > > > 2. **Dem Ersteller vertrauen und Erweiterungen aktivieren** tippen. Das Dashboard öffnet sich, alles ist eingestellt.
> > > > 3. Unter [[#Verbindungen]] **Uni-Login** tippen: Er verbindet ILIAS, den ILIAS-Kalender und Alma. Ein Gerät reicht, die anderen bekommen alles über deinen Sync.
> > > > 4. **Weiteres Gerät:** Liegt der Tresor in iCloud, dort nur öffnen und **Dem Ersteller vertrauen und Erweiterungen aktivieren** tippen.
> > >
> > > > [!eba-info] Gut zu wissen
> > > > - **Neue Version:** [[#Verbindungen]] → **Updates** → **Neue Version installieren**; **Nach Updates suchen** sieht sofort nach. Die anderen Geräte bekommen sie über den Sync, dort höchstens einmal **Neu laden**.
> > > > - **Windows:** statt <kbd>⌘</kbd> die Taste <kbd>Strg</kbd>.
> > > > - **iPhone:** Tabellen stehen als Liste untereinander.
>
> > [!eba-karte|hilfe|stand]- Stand der Angaben
> > Termine und Semesterdaten kommen laufend über die zentralen Daten. Was die Uni noch nicht veröffentlicht hat, ist als geschätzt markiert; alle Semester mit ihrem Stand stehen unter [[System/Daten/Semester|Semestertermine]]. Die Frist der Orientierungsprüfung rechnet der Studienverlauf aus deinem Studienbeginn, ohne Urlaubssemester.
> >
> > **Nicht belegt oder widersprüchlich**
> > - Formale Wahl der Variante: weder PO noch Modulhandbuch regeln Wie und Wann; klärt die Studienfachberatung. Studium Autopilot empfiehlt die Wahl vor dem 3. Fachsemester, weil sich ab dann die Musterpläne unterscheiden.
> > - **B370** und **S313** ohne Modulbeschreibung, **S312** in keiner EcoBA-Studienplantabelle.
> > - Frist der Orientierungsprüfung: Modulhandbuch nennt in einem Plan das Ende des **3. Fachsemesters**, maßgeblich ist die PO mit dem **4. Fachsemester**.
> > - Rücktritt bei Krankheit: BRPO „unverzüglich“, FAQ „innerhalb von drei Werktagen“; im Zweifel sofort handeln.
> > - Gesamtnote: ob nach zwei Stellen abgeschnitten wird, regelt die BRPO nicht eindeutig (**§ 35 Abs. 2** verweist nicht auf § 19 Abs. 3 Satz 3); Studium Autopilot schneidet ab.
> > - „Ohne Spezialisierung“ mit Data Science allein: ob VWL- und BWL-Pflicht erfüllt sind, sagt das Modulhandbuch nicht; die Prüfung unter Schwerpunkte im Studienverlauf lässt es zu.
> > - Citavi-Campuslizenz nicht belegt (Zotero und EndNote sind belegt).
> > - Kein fachbereichsweiter Leitfaden für wissenschaftliches Arbeiten belegt; es gibt Vorgaben einzelner Lehrstühle.
> >
> > **Vor der Wahl prüfen**
> > - Elective Studies: fachfremde Fächer (z. B. Informatik, Mathematik, Psychologie, Recht) mit mind. **15 ECTS** je Fach.
> > - Manche Schwerpunktbereiche und Bachelorseminare setzen Module voraus (z. B. **B342**: **B240** oder **B340**); vor der Wahl die Modulbeschreibung lesen.
