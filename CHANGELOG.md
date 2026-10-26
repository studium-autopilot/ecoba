# Änderungen

Versionsnummern nach [Semantic Versioning](https://semver.org/lang/de/).

## 0.6.14 – Zusammenfassen mit deinem Claude-Abo

- **Neu:** Unterlagen, die zu keinem Modul gehören, etwa Modulhandbuch, Prüfungsordnung oder Folien einer Infoveranstaltung,
  stehen auf der Seite **Unterlagen** jetzt in einer eigenen Liste „Ohne Modul“.
- **Übersichtlicher:** **Eigener Server** sagt jetzt, dass er deine Unterlagen über dein Claude-Abo zusammenfasst. Ein
  Schlüssel bei Anthropic, der je Zusammenfassung extra kostet, steht nur noch für Fortgeschrittene in seinem Fenster.

## 0.6.13 – Karteikarten üben, PDFs wieder ganz lesbar

- **Neu:** Mit **Üben** gehst du die Karten eines Moduls, eines Kapitels oder nur die mit Fehlern noch einmal durch, etwa vor
  einer Prüfung. Dein Lernstand bleibt dabei, wie er war.
- **Neu:** Nach einer Prüfung nimmst du einen Stapel im Menü ⋯ mit **Pausieren** aus deinem Tagesplan. Mit **Fortsetzen**
  kommt er zurück, dein Lernstand bleibt.
- **Einfacher:** Neue Karten kommen jetzt höchstens 20 am Tag über alle Module zusammen, abwechselnd aus jedem Modul. Bisher
  waren es 20 je Modul; die Zahl stellst du in den **Lernoptionen** ein.
- **Zuverlässiger:** Karten, die du oft vergisst, werden nur noch als schwierig markiert und weiter wiederholt, statt aus dem
  Lernen zu verschwinden. Auf der Seite **Karteikarten** übst du sie gezielt.
- **Neu:** Die Statistik zeigt jedes Modul in einer eigenen Zeile und, was du an jedem der letzten 30 Tage gelernt hast.
  **Verlauf** im Menü einer Karte zeigt jede ihrer Bewertungen.
- **Übersichtlicher:** In der Kartenliste wählst du jetzt auch ein Kapitel und kannst alle angezeigten Karten auf einmal
  üben, aussetzen oder zurückstellen.
- **Einfacher:** Beim Lernen zeigt ein Tippen auf die Karte die Antwort. Ein leerer Stapel erklärt, wie du Karten schreibst,
  und auf dem iPhone sind lange Modulnamen in der Übersicht wieder lesbar.
- **Zuverlässiger:** Die **Lernoptionen** nehmen keine falschen Eingaben mehr an, sondern zeigen, welches Feld nicht stimmt.
  **Standard** setzt alle Werte zurück.
- **Behoben:** In einer Unterlage zeigte die aufgeklappte PDF nur ihre erste Seite, und du konntest nicht blättern. Jetzt
  scrollst du wieder durch alle Seiten.
- **Behoben:** Esc beim Bearbeiten einer Karte schloss das Lernfenster, und deine Änderung war weg. Jetzt bleibt es offen,
  und auch **Neue Karte** verliert keinen angefangenen Text mehr.
- **Behoben:** Mit @ ließ sich auf deutschen Tastaturen keine Karte aussetzen, doppeltes Tippen bewertete zwei Karten,
  **Rückgängig** nahm nicht alles zurück. Nach **Alles lernen** kamen zu viele neue Karten, die Zahlen hingen nach.
- **Behoben:** Die Zeile **Tresor** unter **Einstellungen & Hilfe** konnte auf iPhone und iPad nur den Tresor wechseln. Jetzt
  öffnet sie die Tresorverwaltung, dort kannst du einen Tresor auch umbenennen oder löschen.

## 0.6.12 – Offene Liste klar umrahmt

- **Übersichtlicher:** Auf dem **Dashboard** umrahmt eine Linie die offene Liste samt ihrem Knopf, wie bei einem Karteireiter.
  So siehst du gleich, ob gerade **Fristen**, **Termine**, **Nacharbeiten** oder **To-dos** offen sind.

## 0.6.11 – Beide Fassungen klar beschriftet

- **Einfacher:** In der **Literaturliste** führen jetzt mehr Bücher direkt zu ihrem Eintrag in der Unibibliothek, ohne Umweg
  über die Suche. Diese Links werden jeden Tag geprüft.
- **Übersichtlicher:** Hast du Folien beschriftet und kommt eine neue Fassung aus ILIAS, zeigt die Vorlesungsnotiz beide, klar
  beschriftet: deine bearbeitete und die neue. Auch die Modulseite und beide Notizen sagen, welche welche ist.
- **Übersichtlicher:** **Fristen**, **Termine**, **Nacharbeiten** und **To-dos** auf dem **Dashboard** sehen jetzt wie Knöpfe
  aus, mit einem kleinen Pfeil: So siehst du gleich, dass sie eine Liste aufklappen.
- **Behoben:** Nach einer langen Liste wie **Fristen** blieb unter einer kürzeren auf dem **Dashboard** viel leerer Platz.
  Jetzt endet die Seite gleich unter der offenen Liste.

## 0.6.10 – Klare Kalenderfarben in jedem Design

- **Übersichtlicher:** Prüfungen, Uni und Veranstaltungen haben im Kalender jetzt in jedem Design klar verschiedene Farben,
  auch im dunklen. Bisher sahen sich Uni und Veranstaltungen in manchen Designs zu ähnlich.

## 0.6.9 – Literaturliste und neue Fassungen von Unterlagen

- **Neu:** Die Module des ersten Semesters haben unter **Unterlagen** eine **Literaturliste**: welche Bücher die Vorlesung
  nennt, was du zu welchem Kapitel liest, mit Links zum Verlag und zur Unibibliothek. Deine Notizen darin bleiben.
- **Zuverlässiger:** Lädt der Lehrstuhl eine Unterlage neu hoch, fasst Claude die neue Fassung von selbst zusammen und sagt
  zuerst, was neu ist. Die frühere Zusammenfassung bleibt zugeklappt darunter, deine Haken und Notizen bleiben.
- **Übersichtlicher:** Kommt eine Unterlage neu aus ILIAS, steht über der PDF, welche Seiten neu oder geändert sind. Hast du die
  alte Datei beschriftet, zeigt ihre Notiz auf die neue daneben.
- **Übersichtlicher:** Im Kalender unter **Termine & Anmeldungen** erkennst du jede Art an ihrer Farbe: Prüfungen rot, Uni
  blau, Veranstaltungen grün, die Legende zeigt dieselben Farbfelder. Auf dem iPhone beginnt der Kalender weiter oben.
- **Übersichtlicher:** Die Seitenleiste auf iPhone und iPad zeigt nur noch deine Seiten und Module. Obsidians Einstellungen,
  alle Dateien und den Tresor findest du jetzt unter **Einstellungen & Hilfe** im Abschnitt **Obsidian**.
- **Neu:** Installiert dein eigener Server mehr als 3 Tage lang keine neue Version, sagt es dir die Zeile **Eigener Server**
  unter **Verbindungen**, mit dem nächsten Schritt.
- **Zuverlässiger:** Arbeitest du mit Claude in deinem Tresor, kennt Claude dessen Regeln jetzt immer auf dem Stand deiner
  Version, auch an deinen anderen Computern. Hast du die Hinweise für Claude geändert, liegt deine Fassung daneben.
- **Behoben:** Lag neben deinen beschrifteten Folien eine neue Fassung aus ILIAS, rechnete der **Lernplan** noch mit der alten.
- **Behoben:** In älteren Vorlesungsnotizen standen noch die Folien, die beim Anlegen geraten wurden, und später
  hochgeladene kamen nie dazu. Jetzt wählt Studium Autopilot auch dort die Folien der Sitzung selbst.
- **Behoben:** Am Wochenende nannte der Semesterverlauf auf dem **Dashboard** die kommende Woche noch „diese Woche“. Jetzt
  heißt sie dort „nächste Woche“, wie über deiner Woche im **Stundenplan**.

## 0.6.8 – Übungsblätter und Abgaben auf einen Blick

- **Einfacher:** Jedes Übungsblatt unter **Unterlagen** zeigt oben seine Abgabe und deine Lösung, ein Tipp auf **Offen** hakt
  Blatt und Frist zusammen ab. Der Knopf **Neues Übungsblatt** fällt weg, denn damit war dasselbe Blatt zweimal da.
- **Übersichtlicher:** Auf **Unterlagen** zeigt **Übungen**, welche Blätter du bis wann abgeben musst, auch die aus ILIAS.
  Eine verpasste Abgabe bleibt dort zwei Wochen lang rot stehen.
- **Übersichtlicher:** Jeder Termin zeigt oben in einer Karte, wann und wo er ist, groß und mit „heute“, „morgen“ oder „in 5
  Tagen“. Darunter stehen nur noch die Beschreibung, leise die Quelle und deine Notizen.
- **Übersichtlicher:** Über deiner Woche auf dem **Dashboard** und im **Stundenplan** steht jetzt, welche Woche du siehst,
  etwa „Diese Woche“ oder „In 2 Wochen“. Am Wochenende zeigt sie schon die nächste und sagt das auch.
- **Übersichtlicher:** Unter **Verbindungen** sagt jede Zeile in wenigen Wörtern, was sie tut, und rechts in einem Wort, ob
  sie an, aus oder aktuell ist. Neue Namen: **Suche in PDFs** (bisher Volltext der PDFs) und **Updates**.
- **Übersichtlicher:** Auf dem iPhone steht auf dem **Dashboard** das Datum der nächsten Frist wieder unter ihrem Namen. Rechts
  oben stand es direkt unter dem heutigen Datum und war leicht damit zu verwechseln.
- **Übersichtlicher:** Die Ordner „Eingang“ und „Übungsblätter“ werden nicht mehr gebraucht und verschwinden. Dateien aus
  „Eingang“ liegen danach in „Unterlagen/Ohne Modul“, ältere Blätter bleiben im Ordner „Übungsblätter“.
- **Übersichtlicher:** Die **Karteikarten** sind noch in Entwicklung und können sich ändern. Das steht jetzt links in der
  Übersicht neben ihnen, wie beim **Lernplan**.
- **Zuverlässiger:** Gleicht dein Tresor über deinen eigenen Server ab, kommen Änderungen auf iPhone und iPad auch nach einer
  Pause in einer anderen App wieder an. Bisher half dort manchmal nur, Obsidian neu zu starten.
- **Zuverlässiger:** Mit eigenem Server gleicht ein Computer jetzt auch ab, wenn Obsidian minimiert ist. Bei einem schon
  verbundenen Computer schaltest du in LiveSync „Keep replication active in the background“ ein.
- **Behoben:** Ein Update hielt manche Seiten wie den Studienverlauf für von dir geändert und ließ sie auf dem alten Stand.
  Jetzt bekommen sie die neue Fassung, und neben einer wirklich geänderten Seite bleibt die neue zum Vergleich stehen.
- **Behoben:** Manchmal fehlten in den Lesezeichen neue Seiten wie **Postfach**, und **Stundenplan** stand noch drin. Jetzt
  kommen sie auf jedem Gerät nach, deine eigenen Lesezeichen bleiben.

## 0.6.7 – Aufgeräumtes Dashboard

- **Übersichtlicher:** Auf dem **Dashboard** stehen **Fristen**, **Termine**, **Nacharbeiten** und **To-dos** als eine Reihe
  Knöpfe, jeder mit der Zahl seiner Einträge. Ein Tipp zeigt die Liste darunter, ein zweiter schließt sie.
- **Übersichtlicher:** Auf dem iPhone zeigt das **Dashboard** jetzt deine ganze Woche wie am PC, nicht mehr nur einen Tag.
  Darum steht **Stundenplan** links in der Übersicht auf keinem Gerät mehr.
- **Übersichtlicher:** **Einstellungen & Hilfe** ist auf allen Geräten kompakt wie die Einstellungen am iPhone: je Angabe eine
  Zeile, rechts ihr Stand wie „Verbunden“ oder „An“. Ein Tipp öffnet sie, Knöpfe wie **Aktualisieren** stehen dort.
- **Übersichtlicher:** Die Liste **Im Eingang** ist vom **Dashboard** und von **Unterlagen** verschwunden. Neue Dateien kommen nur
  noch über **Unterlagen hinzufügen** dazu, ZIP-Dateien entpackst du vorher.
- **Übersichtlicher:** Aufrufe, an Forschungsstudien teilzunehmen, stehen nicht mehr bei deinen Fristen. Dafür kommen die
  Bewerbungsfristen der studentischen Initiativen am Fachbereich, etwa von InOne Consult.
- **Behoben:** In **Termine & Anmeldungen** fehlte neben dem Datum der Wochentag und bei laufenden Fristen „läuft“. Jetzt
  steht beides wieder da.
- **Behoben:** Auf **Postfach** führte **Mit Uni-Login verbinden** auf einem zweiten Gerät nur zum Hinweis, ein Gerät reiche.
  Deine Mails kommen aber nicht von selbst auf andere Geräte, darum öffnet der Knopf jetzt gleich die Anmeldung.

## 0.6.6 – Mehr Platz auf dem iPhone

- **Übersichtlicher:** Auf dem iPhone ist oben auf dem **Dashboard** mehr zu sehen: Gruß und Datum stehen in einer Zeile, und
  die Kacheln sind rund ein Viertel flacher, ohne dass eine Angabe fehlt.
- **Übersichtlicher:** Auf dem iPhone ist **Einstellungen & Hilfe** kürzer: Knöpfe wie **Ändern** stehen rechts neben ihrer
  Zeile statt in einer eigenen Zeile darunter.
- **Übersichtlicher:** Am PC und iPad zeigt das **Dashboard** deine Woche, darum steht **Stundenplan** links in der Übersicht
  nur noch am iPhone. Die Seite zeigt jetzt nur die Woche, ohne Liste.
- **Behoben:** Ohne Studienbeginn stand in der Woche nur „Keine Lehrveranstaltungen“. Jetzt steht dort, dass deine Vorlesungen
  von selbst kommen, sobald du ihn einträgst, mit Link zum Eintragen.

## 0.6.5 – Mitzählen ohne Angaben über dich

- **Neu:** Studium Autopilot zählt, auf wie vielen Geräten eine Version läuft, ohne Angaben über dich. Ausschalten kannst du
  das unter **Verbindungen** bei Studium Autopilot unter „Mehr erfahren“ mit **Mitzählen**.

## 0.6.4 – Lab auch mit älterem Server

- **Zuverlässiger:** Hat sich dein eigener Server noch nicht aktualisiert, fasst er Unterlagen aus dem **Lab** einen Tag später
  zusammen, statt sie zu übergehen. Im Stundenplan steht beim Lab eine Lösung hinten, auch als „Lsg“.

## 0.6.3 – Zusammenfassen ohne eigenen Server

- **Neu:** **Zusammenfassen** bei einer Unterlage geht jetzt ohne eigenen Server, auf jedem Gerät. Dafür verbindest du unter
  **Verbindungen** Claude mit deinem eigenen Schlüssel von Anthropic (meist 0,05 bis 0,50 $ je Zusammenfassung).
- **Behoben:** Vorlesungsnotizen zeigten oft falsche oder gar keine Folien. Jetzt sucht Studium Autopilot sie selbst heraus,
  auch später hochgeladene, und unter **⋯** → **Andere Folien …** wählst du andere.
- **Einfacher:** Tippst du eine Unterlage an, siehst du gleich die PDF. Dateien, die du selbst in einen Modulordner unter
  **Unterlagen** kopierst, nimmt **Unterlagen hinzufügen** ohne Rückfrage auf.
- **Übersichtlicher:** Die Seite **Unterlagen** zeigt unter **Neu**, was in den letzten 14 Tagen dazukam und du noch nicht
  geöffnet hast. Abhaken musst du dafür nichts.
- **Behoben:** Ein neues Übungsblatt bekommt keine ausgedachte Abgabe mehr. Ohne Abgabedatum steht es auf der Seite
  **Unterlagen** mit „kein Datum“ da statt mit einer unsinnigen Frist.
- **Neu:** Lehrveranstaltungen außerhalb des Vorlesungsverzeichnisses, etwa das Data Science Lab, stehen unter ihrem
  offiziellen Namen im **Stundenplan**. Notebooks, Code und Daten eines Labs haben auf der Modulseite einen Bereich **Lab**.
- **Behoben:** Verlegen Uni oder Alma eine Veranstaltung oder deine Übungsgruppe, ziehen **Stundenplan**, Notiz und ihr Name
  mit, einen eigenen Namen behältst du. Die Liste blendet aus, was du nicht besuchst.
- **Zuverlässiger:** Was du gelöscht hast, bleibt gelöscht: Termine, Abgaben, Unterlagen und Lernpläne kommen nicht zurück,
  auch wenn ein anderes Gerät die Daten holt oder die Uni eine Datei neu hochlädt.
- **Behoben:** Entfernt die Uni eine Unterlage aus ILIAS oder benennt sie um, steht das jetzt in ihrer Notiz. Kommt eine neue
  Fassung, passt sich die Notiz an, und **Zusammenfassen** ist wieder da.
- **Zuverlässiger:** Bleibt Obsidian über Nacht offen, springen Kalender, Vorlesungen, To-dos, Angebote, Postfach und
  Karteikarten morgens auf den neuen Tag. Ein To-do „bis 05.10.“ bleibt überfällig, statt ins nächste Jahr zu rutschen.
- **Behoben:** Im **Lernplan** bleiben Häkchen beim richtigen Kapitel, verlängerte Karteikarten behalten ihren Lernstand.
  Nach einer bestandenen Wiederholung fragt das Modul nach der neuen Note, statt die 5,0 zu behalten.
- **Zuverlässiger:** Bricht ein Durchgang deines eigenen Servers ab, gehen keine Mails und Unterlagen mehr verloren. Ist er
  länger nicht erreichbar, sagt dir die Zeile unter Verbindungen, was zu tun ist.

## 0.6.2 – Änderungen verschwinden nach dem Besuch

- **Behoben:** Änderungen seit deinem letzten Besuch blieben auf dem Dashboard stehen, bis du **Alles gesehen** angetippt
  hast. Jetzt verschwinden sie nach dem Besuch von selbst, sobald du sie einmal aufgeklappt gesehen hast.

## 0.6.1 – Unterlagen direkt in Obsidian hinzufügen

- **Einfacher:** PDFs, Folien und Fotos bekommst du jetzt direkt in Obsidian in deinen Tresor: **Unterlagen hinzufügen**
  tippen und **Dateien auswählen**, am Computer auch hineinziehen. Der Umweg über die Dateien-App entfällt.
- **Behoben:** Unter **Offene Fragen** auf dem **Dashboard** standen Denk- und Übungsfragen von den Folien. Jetzt stehen
  dort nur Fragen, die die Unterlage wirklich offen lässt.

## 0.6.0 – Uni-Mails direkt in Obsidian

- **Neu:** Auf der Seite **Postfach** liest du deine Uni-Mails direkt in Obsidian, auf dem Computer, iPhone und iPad. Dafür
  reicht dein Uni-Login, und deine Mails bleiben bei der Uni.
- **Neu:** Auf dem Dashboard siehst du, was sich seit deinem letzten Besuch geändert hat: verschobene oder abgesagte
  Uni-Termine, Ausfälle und Raumwechsel, neue Abgaben und Dateien aus ILIAS. Ein Tipp führt hin.
- **Behoben:** Der Hinweis „Studium Autopilot ist noch aus“ nannte Menüs, die es in Obsidian nicht gibt. Jetzt steht dort
  der echte Weg: **Externe Erweiterungen** → **Eingeschränkten Modus verlassen**.
- **Behoben:** Beim Einrichten des eigenen Servers lief die zweite Zeile mancher Befehle nicht. Antwortet der Server noch
  nicht, sagt dir die Cloud Shell jetzt, dass du kurz warten sollst.
- **Einfacher:** Meldungen des eigenen Servers nennen jetzt Befehle, die in der Cloud Shell auch funktionieren.
- **Einfacher:** Die Anleitung für Windows hilft bei 7-Zip und WinRAR und findet den iCloud-Ordner unter seinem echten Namen.

## 0.5.9 – Platzsucher sucht zuverlässig weiter

- **Behoben:** Lief beim Einrichten des eigenen Servers schon ein Platzsucher aus einer älteren Version, brach die
  Einrichtung mit einer Fehlermeldung ab. Jetzt ersetzt Claude ihn durch einen neuen, der sicher weitersucht.

## 0.5.8 – Offene Fragen am richtigen Platz

- **Behoben:** Offene Fragen aus deinen Unterlagen standen auf dem Dashboard bei den To-dos, sobald ein Seitenverweis
  dahinter stand. Jetzt erscheinen sie unter **Offene Fragen**.
- **Übersichtlicher:** **Zusammenfassen** trägt Dauerhinweise wie „Folien in jede Vorlesung mitnehmen“ nicht mehr als To-do
  ein, das du nie abhaken kannst.
- **Behoben:** Unter Windows und Android ergab das Entpacken einen Ordner im Ordner, und wer den äußeren öffnete, hatte einen
  leeren Tresor. Jetzt ist der entpackte Ordner selbst dein Tresor.
- **Einfacher:** Bleibt Studium Autopilot beim ersten Öffnen ausgeschaltet, sagt dir das Dashboard jetzt, wie du es einschaltest.
- **Einfacher:** Die Anleitung zeigt für jedes weitere Gerät genau einen Weg, deinen Tresor dorthin zu bringen.
- **Einfacher:** Beim Einrichten des eigenen Servers kopierst du keine Adressen und langen Befehle mehr von Hand. Gmail ist
  dabei freiwillig.

## 0.5.7 – Tresor auf allen Geräten gleich

- **Neu:** Mit eigenem Server gleicht dein Tresor auf Wunsch zwischen Windows, iPhone und iPad ab, kostenlos und ohne iCloud.
  Im Fenster **Eigener Server** tippst du **Prompt kopieren**, und Claude richtet es mit dir ein.
- **Neu:** **Zusammenfassen** liest jetzt die PDF selbst und sieht so auch Abbildungen, Tabellen und Formeln. Bei langen
  Unterlagen fragt es vorher, ob du dafür mehr von deinem Claude-Limit einsetzen willst.
- **Behoben:** Auf deinen anderen Geräten tat **Neu laden** nach einem Update manchmal nichts, und die Zeile blieb stehen.
  Jetzt holt es fehlende Teile der neuen Version selbst, sonst sagt ein Hinweis, was zu tun ist.

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
