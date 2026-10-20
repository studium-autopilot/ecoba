# Änderungen

Versionsnummern nach [Semantic Versioning](https://semver.org/lang/de/).

## 0.5.6 – Kürzere Zusammenfassungen

- **Übersichtlicher:** **Zusammenfassen** schreibt jetzt 3 bis 5 Punkte statt bis zu 10, jeder mit fettem Stichwort und den
  Seiten, auf denen es steht. Auch bei „Zu tun“ und „Offene Fragen“ führt ein Link zur passenden Seite.
- **Übersichtlicher:** Steht eine Aufgabe aus den Folien schon in deinen To-dos, kommt sie nicht noch einmal dazu. Unter
  „Offene Fragen“ steht nur noch, was die Unterlage wirklich offen lässt.

## 0.5.5 – Claude-Anmeldung auf dem Server

- **Behoben:** Beim Einrichten des eigenen Servers brach Claude die Anmeldung manchmal mit einem Fehler ab, obwohl
  sie beim nächsten Versuch klappte. Jetzt prüft Claude nach jedem Versuch, ob du angemeldet bist, und versucht es sonst neu.

## 0.5.4 – Server erreichbar, Update in einem Fenster

- **Behoben:** Nach dem Einrichten des eigenen Servers war er von außen nicht erreichbar. Richtest du ihn noch einmal ein,
  geht es jetzt durch, ohne den Server neu anzulegen.
- **Zuverlässiger:** Dein eigener Server startet nach wichtigen Sicherheitsupdates nachts von selbst neu, damit sie wirklich
  wirken. Er ist dann ein paar Minuten nicht erreichbar.
- **Neu:** Zieht eine Lehrveranstaltung in einen anderen Raum, zeigt dein **Stundenplan** das auch ohne Alma-Login zwei Wochen
  lang als „Neuer Raum“. Räume, die nur eine Kursmail nennt, stehen jetzt auch drin.
- **Übersichtlicher:** Der **Lernplan** ist noch nicht fertig, und das siehst du jetzt deutlich: Oben steht ein gelber
  Warnkasten, die Liste ist stärker abgeblendet, und in der Seitenleiste steht neben „Lernplan“ „in Entwicklung“.
- **Übersichtlicher:** Ein Update läuft jetzt in einem Fenster: erst was neu ist, dann der Fortschritt, dann das Ergebnis.
  Oben rechts stapeln sich keine Hinweise mehr, und nach dem Fenster kommt für diese Version keiner mehr.
- **Übersichtlicher:** Im geteilten iPad-Fenster und auf dem iPhone quer stehen Gruß und Datum auf dem **Dashboard** in einer
  Zeile. So siehst du mehr vom Semester, ohne zu scrollen.

## 0.5.3 – Termine aus Unterlagen

- **Neu:** Auf der Modulseite steht jetzt, wenn Termine aus Folien und ILIAS-Dateien dieses Moduls nicht zentral kommen. Mit
  eigenem Server sucht Claude in neuen Unterlagen solcher Module nach Abgaben und Terminen.
- **Behoben:** Wurde eine Lehrveranstaltung an einem Tag auf eine andere Uhrzeit verlegt, stand „jetzt“ in der **Woche** zur
  alten Uhrzeit, und **Neue Vorlesungsnotiz** erkannte sie nicht. Jetzt gilt die neue Uhrzeit.
- **Neu:** Liegt Literatur online, etwa als E-Book, öffnet das ↗ in ihrer Zeile unter **Unterlagen** sie direkt.
- **Behoben:** Vorlesungen, die von selbst im **Stundenplan** stehen und nur alle zwei Wochen stattfinden, standen in der
  **Woche** jede Woche. Jetzt stehen sie nur in ihren Wochen.
- **Behoben:** Kommt eine Zusammenfassung später, steht „Das Wichtigste“ jetzt oben, über „Zu tun“ und „Offene Fragen“.

## 0.5.2 – Zusammenfassen auf Wunsch

- **Neu:** Mit eigenem Server tippst du in einer Unterlage auf **Zusammenfassen**, und Claude fasst sie gründlich mit Opus
  zusammen. Von selbst fasst er nichts mehr zusammen, das spart dein Claude-Limit.

## 0.5.1 – Server-Einrichtung in neuen Oracle-Konten

- **Behoben:** Stand in Alma ein anderes Tutorium als deins, zeigte der Stundenplan beide, und dein Tutorium meldete eine
  Überschneidung. Jetzt steht nur deine Gruppe da.
- **Behoben:** Beim Einrichten des eigenen Servers in einem neuen Oracle-Konto blieb Claude mit einer abgeschnittenen
  Meldung stehen. Jetzt geht es durch, und hat Oracle gerade keinen Platz, sucht ein kleiner Helfer von selbst weiter.
- **Behoben:** Ist dein Server da, räumt der Helfer hinter sich auf. Klappt das nicht, bekommst du eine Mail.
- **Einfacher:** Hat die Einrichtung schon einmal angefangen, setzt Claude sie im selben Chat fort und räumt Reste früherer
  Versuche auf.

## 0.5.0 – Eigener Server mit Claude

- **Neu:** Für Technische: Ein eigener kostenloser Server mit Claude sucht in deinen Uni-Mails nach Terminen, die nur dich
  betreffen. Sie landen von selbst unter **Termine**, ohne Doppel zu den Terminen für alle.
- **Einfacher:** Claude richtet dir den Server Schritt für Schritt ein und klickt auf Wunsch selbst. Den Stand siehst du unter
  **Einstellungen & Hilfe** in der Zeile **Eigener Server**.
- **Neu:** Mit eigenem Server fasst Claude neue Folien und Unterlagen für dich zusammen. „Das Wichtigste“, Aufgaben und offene
  Fragen stehen dann von selbst in der Notiz neben der PDF, mit Seitenzahlen.
- **Einfacher:** Mit **Mails durchsuchen** schaust du sofort nach neuen Terminen, und wie oft dein Server von selbst nachsieht,
  stellst du im Fenster **Eigener Server** ein.
- **Übersichtlicher:** Steht dieselbe Aufgabe in zwei Notizen, bleibt sie mit eigenem Server nur einmal unter **To-dos**. Die
  andere Stelle zeigt dann, wo die Aufgabe steht.
- **Behoben:** Im geteilten iPad-Fenster und auf dem iPhone quer blieb rechts die halbe Breite leer, die Mitschrift begann erst
  am unteren Rand. Jetzt nutzt die Notiz die ganze Breite, und ihr Kopf rückt in drei Zeilen zusammen.

## 0.4.10 – Ausfälle und Raumwechsel fallen auf

- **Übersichtlicher:** Alles aus deinem Tutorium steht jetzt in einem eigenen Bereich **Tutorium**, getrennt von Vorlesung und
  Übung, auf der Modulseite und im Ordner des Moduls.
- **Übersichtlicher:** Dein Tutorium und deine Übung im **Stundenplan** zeigen oben ihre Unterlagen, das neueste Blatt zuerst.
  Ein Tipp öffnet es.
- **Behoben:** Auf dem iPhone trennten Knöpfe Wörter an falscher Stelle, etwa „Neue Vorlesung-snotiz“ auf dem **Dashboard**.
  Jetzt brechen sie nur zwischen ganzen Wörtern um, und kein Knopf ragt mehr über den Rand.
- **Übersichtlicher:** Fällt eine Lehrveranstaltung aus oder wechselt sie Raum oder Zeit, zeigt die **Woche** das jetzt farbig,
  etwa „Fällt aus“ oder „Hörsaal 9 statt Hörsaal 1“. Auf dem iPhone markiert ein Strich den Tag.
- **Übersichtlicher:** Zieht eine Lehrveranstaltung dauerhaft in einen anderen Raum, zeigt die **Woche** zwei Wochen lang
  „Neuer Raum“ mit dem alten Raum daneben, damit du nicht vor der falschen Tür stehst.
- **Behoben:** Aus Alma fehlte ein Raumwechsel an einem einzelnen Tag, und ein auf eine andere Uhrzeit verschobener Termin stand
  als Ausfall und noch einmal extra da. Jetzt zeigt die **Woche** beides als Änderung des Tages.
- **Übersichtlicher:** Auf der Modulseite steht unter „Als Nächstes“ jetzt auch, wenn eine Sitzung in den nächsten zwei Wochen
  ausfällt oder woanders stattfindet, mit dem alten Raum durchgestrichen.
- **Übersichtlicher:** Die Seite **Stundenplan** zeigt auf dem iPhone wieder die ganze Woche, mit kurzen Namen und Räumen.
  Das **Dashboard** zeigt dort weiter einen Tag auf einmal.

## 0.4.9 – Stundenplan passt aufs iPhone

- **Übersichtlicher:** Auf dem iPhone zeigt die **Woche** einen Tag auf einmal, mit vollem Namen, Zeit und Raum. Oben tippst
  du auf einen Tag, Wischen blättert zum nächsten.
- **Behoben:** Eine Gruppe, die erst später beginnt, halbierte in der **Woche** eine Vorlesung zur selben Zeit. Jetzt steht
  sie schmal daneben, und Namen brechen nicht mehr mitten im Wort um.
- **Behoben:** Manchmal standen zwei Tutorien desselben Moduls blass im Stundenplan, etwa nach einem Gruppenwechsel in ILIAS.
  Jetzt steht dort nur eine, die aus ILIAS oder sonst deine letzte Wahl, und deine Notizen zur anderen ziehen mit.

## 0.4.8 – Ein Uni-Login für alles

- **Neu:** **Nach Updates suchen** unter **Einstellungen & Hilfe** in der Zeile **Studium Autopilot** sagt dir sofort, ob es
  eine neue Version gibt.
- **Einfacher:** Deinen Uni-Login gibst du nur noch einmal ein. Damit verbindet Studium Autopilot ILIAS, den ILIAS-Kalender und
  deinen Stundenplan aus Alma, ohne dass du Links kopierst.
- **Übersichtlicher:** Unter **Einstellungen & Hilfe** → **Verbindungen** steht dafür nur noch eine Zeile **Uni-Login**.
  **Aktualisieren** holt alles auf einmal, **Mehr erfahren** zeigt jede Quelle einzeln.
- **Übersichtlicher:** Folien, die als Text in ihrer Notiz stehen, zeigen ihre Kapitel jetzt auch auf iPad und Computer erst
  zugeklappt, wie ein Inhaltsverzeichnis. Ein Tipp auf ein Kapitel klappt es auf.
- **Zuverlässiger:** Gilt der Link zu deinem Stundenplan oder ILIAS-Kalender nicht mehr, holt Studium Autopilot mit deinem
  Uni-Login selbst einen neuen.
- **Zuverlässiger:** Bricht ein künftiges Update ab, etwa weil die App in den Hintergrund ging, zeigt dieses Gerät **Update
  fertigstellen**. Deine anderen Geräte installieren es so lange nicht ein zweites Mal.
- **Behoben:** Seit 0.4.7 verschwanden zugeklappte Kapitel solcher Folien auf dem iPhone ganz. Jetzt stehen sie wieder da.
- **Behoben:** Manchmal zeigte ein Gerät eine neue Version erst lange nach den anderen an. Jetzt erscheint sie, sobald
  Studium Autopilot das nächste Mal nach neuen Terminen schaut.

## 0.4.7 – Seitenleiste, Vorlesungsnotizen und ruhigere Unterlagen

- **Neu:** Für die Module des ersten Semesters steht der **Lernplan** jetzt von selbst bereit und zeigt, welches Kapitel diese
  Woche dran ist. Er ist noch in Entwicklung und kann sich ändern.
- **Einfacher:** Die **Übersicht** steht jetzt links in der Seitenleiste statt hinter dem Raster-Symbol, mit allen Seiten und den
  Modulen dieses Semesters. Auf iPhone und iPad öffnest du sie oben links.
- **Übersichtlicher:** Eine gewählte Übungs- oder Tutoriumsgruppe steht gleich nach der Anmeldung im **Stundenplan**, blass
  mit ihrem ersten Termin („ab 04.11.“), nicht erst ab der Woche, in der sie beginnt.
- **Übersichtlicher:** Deine Vorlesungsnotizen stehen oben auf jeder Modulseite, neueste zuerst, mit **Neue Vorlesungsnotiz**.
  Überall heißen sie jetzt „Vorlesung 1 · Mo 13.10.“, mit Thema, wenn es bekannt ist.
- **Übersichtlicher:** Unterlagen öffnen zum Lesen: oben Stand und Modul, gleich darunter die PDF mit **Öffnen**. Doppelte
  Angaben, der Knopf „Größe“ und leere Abschnitte mit einsamem Punkt oder Kästchen sind weg, auch in älteren Notizen.
- **Zuverlässiger:** Klappt die Anmeldung bei ILIAS nicht, steht ein Code für deine Meldung im Hinweis. Ist Alma oder ILIAS auf
  einem deiner Geräte verbunden, zeigen die anderen jetzt „verbunden“ statt **Verbinden**.
- **Einheitlicher:** Unter „Als Nächstes“ auf der Modulseite heißt die Vorlesung jetzt Vorlesung statt Veranstaltung, und eine
  leere Liste unter „Zum Modul“ fällt weg.
- **Behoben:** Ein Tipp auf den PDF-Kasten zeigte manchmal seinen Text und öffnete die Tastatur. Jetzt klappt er bei jedem
  Tipp nur auf oder zu.
- **Behoben:** Über Terminen, Unterlagen und anderen Notizen von Studium Autopilot stand oft ein leerer Bereich
  „Eigenschaften“. Du findest ihn jetzt oben in der Notiz unter **⋯** → **Eigenschaften**.
- **Behoben:** Auf dem iPhone fehlte der Rahmen um die Lehrveranstaltung, die gerade läuft, und eine Gruppe vor ihrem ersten
  Termin zeigte kein „ab 04.11.“. Beides steht jetzt auf allen Geräten.

## 0.4.6 – Abgaben aus ILIAS und einfachere Bedienung

- **Neu:** Verbindest du unter **Einstellungen & Hilfe** den **ILIAS-Kalender**, stehen die Abgabetermine deiner Übungen bei
  deinen Fristen. Was dort schon steht, kommt nicht doppelt.
- **Neu:** Die Vorlesungen deiner Module stehen in diesem Semester von selbst im **Stundenplan**, auch ohne Alma, samt Ausfällen
  und Raumänderungen. Was du nicht besuchst, blendest du oben in der Notiz mit **Besuche ich nicht** aus.
- **Einfacher:** Neues legst du in einem Fenster mit allen Angaben und Vorschlägen an, vom Termin mit Uhrzeit und Ort bis zum
  eigenen Modul. Abbrechen legt nichts an.
- **Einfacher:** Oben in Terminen, Unterlagen, SQ-Kursen und Lehrveranstaltungen steht ihr Stand zum Antippen, etwa **Erledigt**
  oder **Gelesen**. Listen auf den Seiten sind nur zum Lesen, ein Tipp öffnet die Notiz.
- **Übersichtlicher:** Das Menü **Übersicht** steht oben in jeder Notiz, jetzt mit **Stundenplan**. Vom **Dashboard** aus öffnet
  alles im selben Tab, auch die Kacheln.
- **Einfacher:** Was du wegwirfst, abhakst oder abwählst, holst du mit **Rückgängig** im Hinweis zurück, statt vorher eine Frage
  zu beantworten. Gelöschtes landet immer im Papierkorb.
- **Einheitlicher:** Überall dieselben Wörter: **Aktualisieren** holt neue Daten, **Neue Version installieren** das Update, und
  die Modulseiten zählen wie Alma in ECTS. Hinweise sind ein kurzer Satz, oft mit dem nächsten Schritt als Knopf.
- **Übersichtlicher:** Prüfungen sind überall rot und Fristen ocker, auch im Semesterverlauf auf dem **Dashboard** und im
  **Studienverlauf**. In Fenstern steht der wichtigste Knopf immer an derselben Stelle.
- **Einfacher:** Auf iPhone und iPad triffst du kleine Knöpfe wie **Ändern**, **Meine** oder die Pfeile im Kalender jetzt
  leichter. Ein Tipp auf eine Übungsgruppe öffnet ihre Notiz.
- **Behoben:** Nach dem Start stand kurz ein Fehlertext in Woche, Kalender und **Dashboard**, und Alma oder das Lesen einer PDF
  hing manchmal bis zum Neustart.
- **Behoben:** Textfassungen von PDFs verschwanden und kamen wieder, wenn ein Gerät die PDF noch nicht hatte.
- **Behoben:** Auf **Noten & ECTS** zählte „Bestanden“ Zusatzleistungen mit, und die Erinnerung an die Prüfungsanmeldung kam
  auch für entfallene Prüfungen.

## 0.4.5 – PDF-Suche und Seiten aus einem Guss

- **Neu:** Die Suche findet jetzt auch Wörter in deinen PDFs. Zu jeder PDF unter **Unterlagen** entsteht eine Textfassung mit
  Link auf jede Seite, auch auf iPhone und iPad.
- **Neu:** Mit eigenem Uni-Abgleich gibt es den Bereich **Lernplan**. Er zeigt je Modul, welches Kapitel diese Woche dran ist,
  damit du alles früh verstanden hast und Zeit für Altklausuren bleibt.
- **Neu (Beta):** Mit Beta-Versionen schaltest du unter **Einstellungen & Hilfe** **Noten & Anmeldungen (Alma)** ein. Neue Noten
  stehen dann zum Übernehmen auf der Modulseite, eine fehlende Prüfungsanmeldung meldet das **Dashboard**.
- **Übersichtlicher:** Alle Seiten wie aus einem Guss: Listen stehen überall als ruhige Zeilen, Pfeile zum Aufklappen rechts,
  Symbole nur, wo sie etwas sagen. Jedes Design behält auch dunkel seine Form und Schrift.
- **Behoben:** Ein Tipp auf **Aktualisieren** bei den zentralen Daten meldete oft nur, ein anderes Gerät aktualisiere gerade,
  und holte nichts. Jetzt geht der Knopf auf jedem Gerät.
- **Behoben:** Fiel ein Kurs in Alma weg, verschwand deine Stundenplan-Notiz samt deinem Text, und gelöschte kamen wieder. Jetzt
  bleibt dein Text, und dein Stundenplan aus Alma aktualisiert sich von selbst.
- **Übersichtlicher:** Jede Verbindung unter **Einstellungen & Hilfe** zeigt ihren Stand gleich, ein Fehler bleibt stehen, bis
  es wieder klappt. Was nur du lösen kannst, steht unter **Bitte prüfen** auf dem **Dashboard**.
- **Behoben:** Ein leeres Übungsblatt mit Abgabe verschwand beim Verlassen samt Frist, und Esc in einer späteren Frage legte
  trotzdem eine Notiz an. Beides passiert nicht mehr.
- **Behoben:** Nach einem Update meldeten deine anderen Geräte jede Datei einzeln, ab dem nächsten kommt dort nur eine Zeile zum
  Neu laden. Zahlen in Spalten stehen bündig, und Hinweise von ILIAS siehst du unter **Einstellungen & Hilfe**.
- **Behoben:** **Dashboard**, Modulseite, **Prüfungen** und **Studienverlauf** zeigten oft verschiedene nächste Prüfungen, auch
  abgehakte, entfallene oder anerkannte. Jetzt rechnen alle gleich, am Wochenende mit der kommenden Woche.
- **Behoben:** An Feiertagen wie Christi Himmelfahrt standen Sitzungen im Stundenplan wie sonst, 12:15 kam vor 9:15, und die
  Frist der Orientierungsprüfung galt für jeden Studienbeginn. Das stimmt jetzt.

## 0.4.4 – Modulseiten, neue Designs und schnelleres ILIAS

- **Neu:** Zwei weitere Designs zur Auswahl. Du wählst sie in der Einrichtung oder unter **Einstellungen & Hilfe**, auf jedem
  Gerät für sich; dunkel bleibt alles wie gewohnt.
- **Neu:** Jede Modulseite zeigt oben deinen Stand, die Prüfung, deine Woche im Semester und was als Nächstes ansteht. Den
  Status änderst du mit einem Tipp, Unterlagen und Notizen stehen als Listen darunter.
- **Neu:** Hast du einen eigenen Uni-Abgleich, zeigt das **Dashboard** unter **Zu erledigen** seine Punkte zum Prüfen. Du
  hakst sie dort ab, **Protokoll** öffnet alle Einzelheiten.
- **Übersichtlicher:** Die Unterlagen eines Moduls stehen nach Art getrennt, Folien mit ihrer Nummer, Altklausuren neueste
  zuerst. Die Lösung steht direkt neben ihrer Klausur oder Übung, so siehst du gleich, wo eine fehlt.
- **Übersichtlicher:** Übungsblätter zeigen oben die Abgabe, den Status zum Antippen, alle Blätter des Moduls und Links zu
  Aufgaben, Lösung und Tutorium. Darunter schreibst du Aufgaben, Knackpunkte und Fragen fürs Tutorium.
- **Schneller:** Deine Kursdateien aus ILIAS sind beim ersten Mal in wenigen Minuten da, auf iPhone und iPad in einem Rutsch
  statt in mehreren Etappen. Wechselst du kurz in eine andere App, geht es beim Zurückkommen gleich weiter.
- **Übersichtlicher:** Im **Studienverlauf** steht keine eigene Tabelle der Semestertermine mehr. Tippst du ein Semester an,
  siehst du dort alles, jetzt auch die Rückmeldung fürs nächste Semester und die freien Tage.
- **Übersichtlicher:** Auf dem **Dashboard** zeigt die erste Kachel wieder deine nächste Frist, **Termine · 14 Tage** auch
  Fachschaft und Veranstaltungen von heute und morgen. Neben deinen To-dos steht kein leerer Kasten mehr.
- **Übersichtlicher:** Unter **Einstellungen & Hilfe** sagt jede Verbindung in einem Satz, wie es steht, und zeigt nur den Knopf,
  den du brauchst. Kommt dein Stundenplan schon über ein anderes Gerät, steht dort kein „nicht verbunden“ mehr.
- **Behoben:** Nach dem Trennen von ILIAS ließ sich deine Übungsgruppe nicht mehr ändern, nur von Hand löschen. Jetzt bleibt sie
  im Stundenplan, und auf **Termine & Anmeldungen** wählst du mit **Meine** eine andere.
- **Behoben:** Deine Notizen zu einer selbst gewählten Übungsgruppe standen manchmal doppelt im Stundenplan, und unter
  **Anmeldungen** stand „offen“, obwohl deine Gruppe schon im Stundenplan stand. Beides stimmt jetzt.
- **Behoben:** Updates bringen Darstellung und Programmteile jetzt immer ganz mit; hattest du sie geändert, liegt deine Fassung
  als Sicherung daneben. Kopien mit „neu“ im Namen kommen nur noch, wenn sich die Seite geändert hat.

## 0.4.3 – Studienverlauf und Karteikarten behoben

- **Behoben:** Im **Studienverlauf** blieb unter **Semestertermine** die Seite leer, vor allem im ersten Semester auf dem iPad.
  Die Tabelle und die **Regeln** darunter erscheinen wieder.
- **Behoben:** Im **Studienverlauf** zählte ein Fähnchen Zwischentests zu den Klausuren mit, etwa bei „6 Prüfungen“.
  Zwischentests haben jetzt ein eigenes Fähnchen.
- **Behoben:** Ein Tipp auf eine Veranstaltung im **Stundenplan** öffnete manchmal den Karteikarten-Stapel statt des Moduls.
  Stapel heißen darum nicht mehr genau wie ihr Modul, vorhandene benennt die App einmal um.
- **Übersichtlicher:** In einem Karteikarten-Stapel steht jede Karte als eigene Zeile, die Antwort erscheint erst beim
  Antippen. Mit **Antworten zeigen** siehst du alle auf einmal.

## 0.4.2 – Karteikarten, Uni-Angebote und Dunkelmodus

- **Neu:** **Karteikarten** als eigener Bereich: Stapel je Modul, gelernt wird direkt in Obsidian, auch auf iPhone und iPad. Wann
  eine Karte wiederkommt, plant das Verfahren aus Anki, damit du mit wenig Wiederholen viel behältst.
- **Neu:** Auf **Termine & Anmeldungen** siehst du Hochschulsport mit Buchungsstart, UB-Kurse und Vorträge der Uni. Was dich
  interessiert, wählst du beim ersten Mal selbst und änderst es jederzeit unter **Auswahl ändern**.
- **Neu:** Deine Übungsgruppe aus ILIAS steht von selbst im **Stundenplan**; ohne ILIAS wählst du sie mit **Meine**. Bald
  kommen auch deine Vorlesungen von selbst dazu, mit Ausfällen und Raumänderungen.
- **Neu:** Alles gibt es jetzt auch dunkel, angenehm am Abend. Unter **Einstellungen & Hilfe** stellst du auf jedem Gerät
  **Hell**, **Dunkel** oder **Automatisch** ein, und die Einrichtung fragt beim ersten Start danach.
- **Schneller:** Neue Uni-Termine erscheinen jetzt spätestens eine Viertelstunde, nachdem sie veröffentlicht sind, solange
  Obsidian offen ist.
- **Zuverlässiger:** Schließt du Obsidian, während Dateien aus ILIAS laden, geht es beim nächsten Öffnen dort weiter, wo es
  aufgehört hat, statt alle Kurse noch einmal zu durchsuchen.
- **Übersichtlicher:** Das Fenster vor einem Update ist kürzer und sagt in einfachen Worten, was neu ist. Der Hinweis
  oben auf dem Dashboard hört nicht mehr mitten im Wort auf.
- **Übersichtlicher:** Der Schwerpunkt-Planer ist im **Studienverlauf** aufgegangen: Dort prüft die App, ob deine Schwerpunkte
  die Regeln der Prüfungsordnung erfüllen. Die Reise zeigt er ohne Sprüche, nahe Prüfungen teilen sich ein Fähnchen.
- **Übersichtlicher:** **Einstellungen & Hilfe** zeigt alles in gleichen Zeilen, und Übersichten bleiben in der Leseansicht.
  Ist deine Variante offen, zeigt der **Musterstudienplan**, wie sich die drei ab dem dritten Semester unterscheiden.
- **Zuverlässiger:** Geschätzte Semestertermine erkennst du überall an Streifen, „ca.“ oder „geschätzt“. Warum eine Angabe
  geschätzt ist, steht als Hinweis dabei und unter der Tabelle **Semestertermine**.
- **Übersichtlicher:** Auf **Termine & Anmeldungen** steht jeder Tag mit großer Ziffer am Rand, die Anmeldungen kommen von selbst,
  mit deiner Gruppe. Zwischentests sind dort, auf **Prüfungen** und dem **Dashboard** blau und beschriftet.
- **Übersichtlicher:** Auf iPhone und iPad steht das Symbol für alle Bereiche nur noch einmal, oben in der Leiste jeder Notiz.
  Im **Stundenplan** zeigt jeder Kasten kurz Fach und Raum, und mit ‹ › oder Wischen siehst du andere Wochen.

## 0.4.1 – ILIAS lädt im Hintergrund weiter

- **Neu:** Gibt es eine neue Version, sagt dir Obsidian das gleich beim Öffnen. Unter **Was ist neu** steht in einfachen Worten,
  was sich für dich ändert.
- **Neu:** Deine Kursdateien aus ILIAS laden weiter, auch wenn du das Fenster schließt. Oben siehst du, wie weit es ist, und
  bricht es ab, macht es später von selbst weiter.
- **Einfacher:** Beim Verbinden mit Alma bringt dich ein Tipp direkt zu deinem Stundenplan, du musst ihn nicht mehr im Menü
  suchen.
- **Übersichtlicher:** Im Musterstudienplan stehen die Hinweise nur noch einmal, und die Varianten sind leichter zu
  unterscheiden.
- **Behoben:** Neue Uni-Termine kamen manchmal nicht an, wenn bei den Übungsgruppen etwas nicht stimmte. Jetzt kommen die
  Termine trotzdem.
- **Behoben:** Stundenplan-Einträge, die du selbst angelegt hast, landeten manchmal im Papierkorb. Sie bleiben jetzt, und ein
  falsch kopierter Alma-Link wird nicht mehr gespeichert.
- **Behoben:** Steht deine Klausur schon als Termin fest, zeigen Studienverlauf und Prüfungen jetzt dasselbe Datum wie das
  Dashboard.
- **Behoben:** Leere Vorlesungsnotizen blieben liegen. Jetzt verschwinden sie, wenn du nichts hineinschreibst.
- **Behoben:** Kalender und Prüfungen zeigten nach dem Löschen oder Umbenennen eines Termins manchmal noch den alten Stand.
- **Behoben:** Ohne Alma war „Woche danach“ auf **Stundenplan** leer, jetzt steht dort, wie du Alma verbindest. In
  **Noten & ECTS** siehst du bei „Bestanden“, wie stark ein Modul in deine Note zählt.

## 0.4.0 – Unterlagen aus ILIAS

- Neu: **ILIAS verbinden** (Einstellungen & Hilfe → Verbindungen, freiwillig auch in der Einrichtung). Einmal Benutzername
  und Passwort eingeben und deine Kurse wählen; Kurse mit Modulcode sind schon an.
- Deine Kursdateien landen von selbst unter **Unterlagen**, je Modul in einem Ordner und mit Notiz. Ein Gerät reicht, die
  anderen bekommen sie über deinen Sync. Sofort holen: **Aus ILIAS holen** auf der Seite Unterlagen.
- Bessere Namen beim Einordnen: Art, Nummer und Modul werden zuverlässiger erkannt, der Titel kommt wenn möglich aus der
  ersten Seite der PDF.
- Was du umbenennst oder löschst, bleibt so. Ändert der Dozent eine Datei, die du angemerkt hast, bleibt deine, und die neue
  liegt daneben. Videos und Dateien über 50 MB bleiben in ILIAS.
- Dein Passwort bleibt verschlüsselt auf diesem Gerät und geht nur an die Uni. Trennen löscht es.

Außerdem:

- Neu: Übungs- und Tutoriengruppen kommen aus den zentralen Daten, gefiltert nach deinen Modulen; Gruppen in deinem
  Stundenplan sind markiert.
- Aufgeräumt: In **Einstellungen & Hilfe** fallen die Checkliste fürs erste Semester, der doppelte Abschnitt „Semester und
  Prüfungsphasen“ und Ratschläge ohne Bezug zur App weg. Auch auf den anderen Seiten stehen weniger Erklärsätze und keine
  Angaben mehr doppelt; auf **Termine & Anmeldungen** steht **Termin anlegen** jetzt oben. Modulnotizen wiederholen die
  Prüfungsregeln nicht mehr, Übersichtsseiten haben keine versteckten Fußzeilen mehr.
- Noten & ECTS: Die Spalte „Termin“ zeigt den Klausurtermin aus den Termin-Notizen (wie „Nächste Prüfung“).
- Studienverlauf: „Andere Varianten ansehen →“ steht nur noch, wenn du eine Variante gewählt hast.
- Leere Tabellen zeigen kein abgeschnittenes „ein Wert“ mehr.
- Behoben: „Deine Angaben“ in **Einstellungen & Hilfe** blieb manchmal unsichtbar.
- Behoben: Auf **Prüfungen** und im **Studienverlauf** stand „Termin folgt“ bei Modulen, deren Klausurtermin schon bekannt
  ist. Jetzt steht dort das Datum.
- Behoben: Die Knopf-Tabelle der Hilfe war in der Zeile „Übungsblatt“ verrutscht, auf dem iPhone passten die Beschriftungen
  nicht zu den Spalten.
- Der KI-Assistent in den Verbindungen sagt jetzt ehrlich, dass er erst noch kommt.
- Die Hilfe zu Unterlagen ist kürzer: ein Satz, vier Schritte, alles Weitere unter „Mehr erfahren“.
- Der Stundenplan zeigt eine echte Kalenderwoche (am Wochenende schon die nächste), mit Datum je Tag und „KW“. Tutorien und
  Übungen erscheinen erst ab der Woche, in der sie beginnen, und nach ihrem letzten Termin nicht mehr. Ausfälle und Pausen
  sind durchgestrichen; in Wochen ohne Veranstaltung steht zum Beispiel „Weihnachtspause“. Auf der Seite Stundenplan
  gibt es dazu die Karte **Woche danach**, und die Liste zeigt statt der Art den Zeitraum jeder Veranstaltung.
- iPhone und iPad holen die zentralen Daten jetzt auch, wenn du Obsidian aus dem Hintergrund zurückholst (letzter Versuch über
  30 Minuten her). Beim Start geht es nach spätestens gut 2 Minuten los statt nach bis zu 10.
- Ist das Gerät aus, das sonst abruft (zum Beispiel der PC im Ruhezustand), übernimmt ein anderes nach 80 Minuten statt nach
  3 Stunden.

## 0.3.1 – Update-Hinweis auf dem Dashboard

- Gibt es eine neue Version, steht oben auf dem Dashboard eine schmale Zeile mit **Aktualisieren** und **Später** (blendet
  sie für diese Version auf diesem Gerät aus). Ist nach einem Update „Neu laden“ nötig, steht es dort ebenso.

## 0.3.0 – Einrichtung beim ersten Start

- Beim ersten Öffnen führt eine kurze Einrichtung durch Studienbeginn, Variante, Name und Zielnote und das Verbinden von
  Alma. Jeder Schritt lässt sich überspringen; „Später“ setzt beim nächsten Start am selben Schritt fort. Auf weiteren
  Geräten erscheint sie nicht noch einmal, ein schon eingerichteter Tresor (Update von 0.2.0) sieht sie nicht.
- Schlösser nur noch für Übersprungenes: Das Schloss im Wochenplan erscheint nur, wenn Alma übersprungen wurde (oder die
  Einrichtung noch offen ist) und kein Stundenplan da ist.
- Die Karte „Personalisieren“ auf dem Dashboard entfällt. In **Einstellungen & Hilfe** gibt es **Einrichtung erneut starten**.
- Behoben: Auf der Seite Stundenplan standen auch bei verbundenem Alma „Alma verbinden“ und der Hinweis dazu. Jetzt
  erscheint verbunden nur **Stundenplan aus Alma holen**.
- Behoben: In **Unterlagen** wurde das Datum in der Spalte „Fällig“ abgeschnitten („20.10.202…“), am PC und auf dem iPhone.

## 0.2.0 – Update mit einem Tipp

- Neue Versionen holst du in Obsidian: **Einstellungen & Hilfe** → **Verbindungen** → **Studium Autopilot** → **Aktualisieren**.
  Jede Datei wird geprüft, vorher entsteht eine Sicherung; kein Netz oder ein Fehler ändert nichts.
- Deine Einträge bleiben: Noten, Termine, Notizen, Angaben. Selbst geänderte Seiten bleiben, die neue Fassung liegt daneben;
  bei Modulen bleiben Status, Note, Versuch, Prüfungstermin und Planung.
- Auf weiteren Geräten kommt das Update über den Sync („Neu laden“, falls nötig).
- Schalter **Beta-Versionen** (unter „Mehr erfahren“) für alle, die neue Versionen früher testen möchten.
- Installation: iOS-Kurzbefehl, Anleitung je Gerät, eigener Abschnitt „Weiteres Gerät verbinden“ (iCloud, Obsidian Sync,
  Syncthing); Download immer unter dem festen Namen `Studium-Autopilot.zip`.
- Termine & Anmeldungen: echter Monatskalender.
- Studienverlauf im hellen Design des übrigen Vaults, alle Funktionen erhalten.

## 0.1.0 – erster öffentlicher Stand

- Fertiger Obsidian-Tresor für den B.Sc. Economics and Business Administration (PO 2023), läuft nach „Vertrauen und Plugins aktivieren“ ohne weitere Einstellungen auf iPhone, iPad, Android, Windows und Mac.
- Eigenes Plugin „Studium Autopilot“ statt Templater: Knöpfe, Vorlagen für neue Notizen, Bereiche-Menü.
- Dashboard mit nächster Prüfung, Semester, ECTS, Notenschnitt, Semesterverlauf, Fristen und To-dos.
- Neun Bereiche: Studienverlauf, Termine & Anmeldungen, Prüfungen, Noten & ECTS, Unterlagen, Schwerpunkt-Planer, Kontakte & Links, Einstellungen & Hilfe und Stundenplan.
- Modulkatalog mit 86 Modulen und Mathe-Vorkurs; Musterstudienpläne je Variante; Gesamtnote, ECTS und Orientierungsprüfung rechnen sich selbst.
- Zentrale Daten: Termine, Fristen und Semesterdaten kommen etwa stündlich aus `studium-autopilot/ecoba-daten`; das Plugin prüft sie und lässt eigene Häkchen und Notizen unberührt.
- Sinnvolle Standardwerte statt Pflicht-Einrichtung; optional Personalisieren (Name, Studienbeginn, Variante, Zielnote).
- Alma-Stundenplan per Kalender-Link, gespeichert nur auf dem Gerät.
- Vorlesungsnotizen, Übungsblätter und Unterlagen einordnen mit einem Klick.
- Hell und dunkel, mehrere Farbschemata.
