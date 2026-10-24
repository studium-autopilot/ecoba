# Architektur: Datenmodell und Fachmodell

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Datenmodell `ctx.modell` (Phase 2b)

`modell.js` rechnet einmal aus `System/Daten/Semester.md`, `System/Einstellungen.md`, `Module/`, `Termine/` und `Stundenplan/`.
Jede Änderung im metadataCache (`changed`, `deleted`, `rename`, `resolved`) markiert das Modell als veraltet; der nächste
Zugriff rechnet neu. Damit sieht kein Skript veraltete Daten. Wer bei Änderungen neu zeichnen will, meldet sich mit
`ctx.modell.beiAenderung(fn)` an (entprellt, 600 ms, nur für Änderungen in den genannten Ordnern).

**Neuer Tag (seit 24.10.2026):** Das Modell rechnet je Tag neu (`cacheTag`). Rechnet `daten()` zum ersten Mal mit einem anderen
Datum (sonst prüft ein Zeitgeber alle 10 Minuten), meldet es einmal an alle `beiAenderung`-Hörer und ruft `abgleichen("tag")`:
Was nur am Datum hängt, ändert sich ohne Dateiänderung (Zeile „jetzt“ der Semestertabelle, „heute N. FS“, Datumsangaben, bei
leerem `studienbeginn` die ganze Semesterliste am 1.4. und 1.10., sonst ihre Verlängerung über das 6. FS hinaus). Vorher zogen
die Kopien in `System/Einstellungen.md` erst beim nächsten Start nach, und Bildschirme, die nur auf `beiAenderung` hören, zeigten
den Vortag. „tag“ zählt wie „start“ als von selbst: Nur der Abrufer schreibt, und nur bei Abweichung.

| Aufruf | Ergebnis |
|---|---|
| `daten()` | `{ heute, name, variante, zielnote, studienbeginn, studienbeginnStandard, startSemester, semesterliste[], aktuell, fachsemester, vorStart, pausen[], freieTage[], pruefungsphasen[], rueckmeldung[], module[], termine[], stundenplan[], abgeleitet, personalisiert, zentral }` |
| `semesterVon(iso)` | Semester (zentral oder nach Regel) zu einem Datum, z. B. für den Alma-Import |
| `semesterNachName(name)`, `semesterAuswahl()`, `vorschau(studienbeginn)` | für das Formular |
| `modulSemester(fm)` | `semester_geplant`, sonst Musterplan-Semester der gewählten Variante |
| `woche(iso?)` | Lage an einem Tag (Standard heute): `{ art, nr, gesamt, pause, phase, tage, text, semester }`, siehe „Wochen“ |
| `vorlesungswochen(semester)` | `{ wochen: [{ mo, so, nr, pause }], gesamt }` der Vorlesungszeit (`nr` 0 = Pausenwoche) |
| `semesterFuer(iso)` | Semester eines Tages aus deiner Liste (vor Studienbeginn das erste), sonst zentral bzw. nach Regel |
| `abgleichen(grund)` | abgeleitete Felder in die Einstellungen schreiben, nur bei Abweichung; `true`, wenn geschrieben |

`semesterliste[]` enthält `{ fs, name, beginn, ende, vb, ve, status, hinweis }`, `module[]` je Modul `{ f, fm, code, fs,
fsEmpfohlen, status, semester, semesterQuelle ("eigen" | "musterplan" | ""), musterplan }`.

`ctx.modell.beiAenderung(fn)` gibt eine Abmeldefunktion zurück; Erweiterungen geben sie an `ctx.aufraeumen`. Die Hörerliste
liegt in `ctx.bleibend` und überlebt einen Hot-Reload von `modell.js`.

Nutzer: `eba.js` (`aktuellesSemester`, `semesterZeile`), `verlauf.js`, `vorlesung.js`, `klausurzeit.js`, `notizen.js`
(Stundenplan-Eintrag von Hand), `kalender.js` (Termine), `alma.js` (Semester eines Termins), `verbindungen.js`,
`personalisieren.js`, `musterplan.js`. Alle fallen auf `System/Einstellungen.md` zurück, falls `modell.js` fehlt.

**Standardwerte ohne Onboarding:** Leerer `studienbeginn` = das aktuelle Semester (aus dem Datum) ist das 1. Fachsemester.
Leere `variante` = „offen“. Leerer Name = neutrale Begrüßung (Bases-Formel `gruss`).

**Musterplan (variantengenau seit 2c):** Das empfohlene Fachsemester eines Moduls kommt aus `System/Daten/Musterplan.md`, Plan
der gewählten Variante (`plaene[].name` = `variante`), kleinstes `fs` der Einträge mit diesem `code` (SQ100 steht in zwei
Semestern). Steht ein Modul nicht im Plan der Variante (z. B. B220 Marketing bei Economics), hat es kein Musterplan-Semester,
außer du hast es gewählt (`gewaehlt: true`, Knopf „+ Planen“); dann gilt sein Feld `fachsemester`. Bei Variante „offen“ (oder
ohne Musterplan) gilt wie bisher `fachsemester`. Schwerpunktkatalog nie. Semester = `semesterliste[fs-1]`. `semester_geplant`
ist leer und gilt nur, wenn du selbst planst (hat Vorrang).

Dieselbe Regel steht als Bases-Formeln `mpid`, `mpfs`, `fsplan`, `semester` in „Noten & ECTS“ (Spalte „Semester“; eigene
Planung = `semester_geplant`). Die Modulseiten haben keine Tabelle „Mein Stand“ mehr (siehe [„Modulseite“](seiten.md)); dort rechnet
`modul.js` mit `ctx.modell`. Die Formeln lesen `Musterplan.md` und `Einstellungen.md` direkt
(`file(…).properties.eintraege.filter(value.plan == formula.mpid && value.code == code)`).
**Entscheidung 2c: Das Plugin schreibt dafür kein Frontmatter-Feld.** Bases kann die Liste aus `Musterplan.md` selbst
filtern; ein geschriebenes Feld je Modul hieße bei jedem Variantenwechsel Dutzende Modulnotizen ändern (Sync-Verkehr,
Konflikte) und eine zweite Wahrheit. `tests/bases-regeln.test.js` vergleicht die Formeln von „Noten & ECTS“ (ECTS,
Orientierungsprüfung, Gesamtnote, Termin, im Plan, Stand, Block) mit dem Modell für alle vier Varianten; die
Semester-Formeln vergleicht noch kein Test.

Nutzer der Variante im Modell: `verlauf.js` (Lupe: Module außerhalb des Plans erscheinen unter „Wählbar, nicht im Plan“ im
Semester ihres Feldes `fachsemester`), `klausurzeit.js` (Module des aktuellen Fachsemesters über `fsEmpfohlen`).

**Wochen (einheitlich seit 2c):** Überall heißt es „Vorlesungswoche X von Y“, und nur in der Vorlesungszeit. Gezählt wird ab
dem Montag des Vorlesungsbeginns; eine Woche, deren Montag bis Freitag ganz in einer Pause liegt (Weihnachten bis Neujahr),
zählt nicht (WS 2026/27: 16 Vorlesungswochen). Außerhalb: Pause → „Weihnachtspause bis 06.01.“, Prüfungsphase außerhalb der
Vorlesungszeit → „Prüfungsphase bis 13.02.“ (in der Vorlesungszeit: „Vorlesungswoche 16 von 16 · Prüfungsphase“), vor dem
Vorlesungsbeginn → „noch N Tage bis Vorlesungsbeginn“ (heute/morgen), danach → „vorlesungsfrei“. Quelle ist
`ctx.modell.woche()` (Woche nach der Planwoche: am Samstag und Sonntag zählt schon die kommende; bis 18.10.2026 stand
dieselbe Regel als Bases-Formel `wochetext` im Dashboard). Nutzer: Dashboard (Kopf des Semesterverlaufs, `dashboard.js`), `verlauf.js` (Vorlesungswoche und Resttage in der
Lupe), `vorlesung.js` (Kopf der Vorlesungsnotiz: Woche des Notizdatums, Perlen mit Vorlesungswochen; Zeit und Raum am Tag der
Notiz über `findetStatt`, seit 20.10.2026 mit Änderung oder Verlegung in Warnfarbe und dem üblichen Wert durchgestrichen). Die Leiste
„Semesterverlauf“ im Dashboard zeigt alle Kalenderwochen des Semesters als Grafik; der Studienverlauf wiederholt sie seit
17.10.2026 nicht mehr (seine Lupe zeigt dasselbe Semester als Band).

**Studienverlauf (`verlauf.js`, Design-Pass 17.10.2026):** Die Bahn ist das eine laute Element der Karte, alles andere eine
ruhige Zeile: Kopf ohne Kennzeichen „Du bist hier“ (das sagt die Nadel), Stationen später Semester nur mit „n geplant“,
ECTS und Orientierungsprüfung als Bilanz ohne Kästen, Fuß mit nächstem Meilenstein und Prognose. Kein Satz unter dem Kopf (seit
17.10.2026: keine Sprüche, kein Lagewort). Die Lupe trägt ECTS, im laufenden Semester Vorlesungswoche und Resttage der
Vorlesungszeit und die Meilensteine des Semesters (auf der Bahn stehen deren Erklärungen nur als Tooltip, also nicht auf Touch),
dazu nur hier die Rückmeldung fürs nächste Semester (das Fenster, das im gewählten Semester beginnt; verlinkt die
Termin-Notiz mit gleichem Beginn, gefüllte Raute, sobald sie abgehakt oder das Fenster vorbei ist). Vorlesungsfreie Tage der
Vorlesungszeit, die nicht schon in einer Pause liegen, stehen im Band als schmale Striche (Tooltip) und in der Legende als
eine Zeile „Frei 01.11.“ (auf Touch lesbar). Seit 17.10.2026 ersetzt die Lupe die Tabelle „Semestertermine“ der Seite: Was
die Tabelle zeigte, steht je Semester hier (Station antippen). Prüfungs-Fähnchen, deren
Beschriftungen sich überschneiden würden (typisch die Klausurphase), fasst `stapeln()` zu einem Fähnchen „n Klausuren
30.01.–12.02.“ zusammen (Einzelheiten im Tooltip und in der Modulliste); erst was dann noch kollidiert, rückt eine Stufe
höher. Stil: `eba-core.css` Abschnitt 38.

**Nur richtige Daten (Vorgabe vom 17.10.2026):** Semester, Pausen, freie Tage, Prüfungsphasen und Rückmeldung tragen in den
zentralen Daten `status` (offiziell | geschätzt) und optional `hinweis` (≤ 200 Zeichen, z. B. „Angabe der Uni
widersprüchlich, bitte kurz vorher prüfen“). Geschätztes ist überall markiert, Offizielles nie: Tabelle aller Semester auf
`System/Daten/Semester` (`modell.js`, ```` ```eba-semesterdaten zentral ````) mit Pille am Semester und „*“ am Wert (Tooltip = Hinweis), Fußnote nur bei Schätzungen, die Hinweise
zusammengefasst darunter (einer direkt, mehrere aufklappbar); Studienverlauf mit Streifen und „(geschätzt)“ in Band, Legende und an der Rückmeldung, Hinweise als
Zeile in der Lupe und „ca.“ vor Daten und Zahlen, die aus geschätzten Semesterdaten folgen (Abschluss, Resttage,
Vorlesungswochen, Frist der Orientierungsprüfung). Semester nach Regel (`semesterNachRegel`) gelten als geschätzt mit dem
Hinweis „Nach Regel berechnet“.

**Wochenraster (seit 0.4.0, seit 17.10.2026 `woche.js`):** Codeblock ```` ```eba-woche ```` in der Karte
`> [!eba-kennzahlen|woche …]` auf Dashboard und Stundenplan (vorher eine Bases-Formel; Bases liest keinen gerätelokalen
Speicher, darum jetzt Code). Das Raster zeigt eine echte Kalenderwoche, Montag bis Freitag, die Planwoche des Fachmodells (am
Samstag und Sonntag schon die nächste); im Kopf das Datum jedes Tages, darüber eine Leiste mit dem Namen der Woche und
„‹ KW n ›“ (siehe *Andere Woche*). Daten: alle Notizen mit `typ:
lehrveranstaltung` (jede Herkunft; je Modul und Art nur eine Gruppen-Notiz, siehe [„Deine Übungs- oder Tutoriengruppe“](zentrale-daten.md))
und Kurznamen aus Modulnotizen (`kurz`) aus dem metadataCache, Semester, Pausen, freie Tage
und „Besuche ich nicht“ aus dem Fachmodell (`ctx.modell.findetStatt`, seit 18.10.2026; vorher die Kopien `semesterliste`,
`pausen` in `System/Einstellungen.md`, ohne freie Tage). Gezeichnet wird nur die gezeigte Woche; neu (entprellt, 0,4 s) bei Änderungen an
Stundenplan-, Modul- und Einstellungsnotizen, beim Zurückkommen in die App und alle 10 Minuten. Schreibt keine Datei.
Ein Kasten erscheint, solange das Datum seines Wochentags nicht nach `bis` liegt (leer = unbegrenzt). Liegt es vor `von`
(Serie, kein Einzeltermin), ist der Kasten blass (`spaeter`) mit „ab TT.MM.“ statt der Uhrzeit und Tooltip „beginnt am
TT.MM.“: Eine gewählte Übungs- oder Tutoriumsgruppe steht so gleich nach der Anmeldung da, nicht erst ab ihrer ersten Woche
(seit 19.10.2026; vorher fehlte sie bis dahin). Solche Kästen zählen nicht als „findet statt“; ohne `semester` des
gezeigten Semesters (nach dem Freitag der Woche), mit
`entfaellt: true` oder ausgeblendet (`herkunft: zentral`, `zentral_id` in `stundenplan_ausgeblendet`) gar nicht, ein
Einzeltermin nur an seinem Tag. Liegt der Tag in einer Pause, auf einem vorlesungsfreien Tag oder in `ausfall`, hat der Kasten
den Namen durchgestrichen und statt des Raums „Fällt aus“ (Klasse `ausfall`, Tooltip „fällt aus (Christi Himmelfahrt)“);
`aenderungen` („Datum|Beginn|Ende|Raum“) in der Woche: an der neuen Zeit, mit neuer Zeit und neuem Raum (`geaendert`).
Was heute gerade läuft, hat die Klasse `jetzt` („· jetzt“ hinter dem Namen), nach der Zeit dieses Tages: bei einer Änderung
die neue (seit 20.10.2026; vorher die übliche, „jetzt“ stand dann zur alten Zeit am verschobenen Kasten).
*Ausnahmen* (seit 20.10.2026, weil Raumverlegungen und Ausfälle nicht genug auffielen; vorher sah ein
Ausfall blass aus wie „ab TT.MM.“ und eine Änderung hatte nur einen gestrichelten Rand): Ein Ausfall dieser Lehrveranstaltung
(`findetStatt` mit `grund` `ausfall`) und ein anderer Raum oder eine andere Zeit an diesem Tag, auch ein neuer Raum in den ersten
zwei Wochen nach einer dauerhaften Verlegung (`neuerRaum`, siehe [„Alma-Stundenplan“](aktionen.md)), haben die Klasse `ausnahme`:
Fläche und Kante links in `--eba-warn`, „Fällt aus“ bzw. der neue Wert in Warnfarbe und der übliche durchgestrichen daneben
(Raster: „Hörsaal 9 statt ~~Hörsaal 1~~“, „12:15 statt ~~10:00~~“, ändert sich nur das Ende „bis 13:45 statt ~~12:00~~“; den Beginn
bei c.t. lässt das Raster bei einem anderen Raum weg, der Raum braucht den Platz). Ein Ausfall wegen einer Pause oder eines freien
Tags bleibt leise (neutrale Fläche, „Fällt aus“ gedämpft): Pausen sind keine Überraschung, und Alma trägt die Weihnachtspause auch
in `ausfall` ein. Keine Symbole, Farbe und Wort (Felder `ausnahme`, `raumNeu`, `raumAlt`, `zeitNeu`,
`zeitStatt`, `grund` am Kasten; der kurze Text „Anderer Raum“, „Neuer Raum“, „Andere Zeit“, „Geändert“ steht im Tooltip; CSS
Abschnitt 55, „Ausnahmen“). Findet nichts statt, steht ein Satz
(Name der Pause, „Vorlesungsbeginn TT.MM.“, „Vorlesungsfrei“, „Keine Lehrveranstaltungen“). Statt „Keine Lehrveranstaltungen“ steht
„Deine Vorlesungen kommen von selbst, sobald du deinen Studienbeginn eingetragen hast.“ mit Link auf das Formular (Aktion
`personalisieren`), wenn die zentralen Vorlesungen auf den Studienbeginn warten (`ctx.zentral.stundenplan()`: `verfuegbar` und
`ohneBeginn`; `wocheBauen` → `beginnFehlt`, gezeichnet von `leerSatz`). Seit 24.10.2026;
vorher stand der Satz nur im Alma-Knopf über dem Raster der Seite Stundenplan, das Dashboard sagte „Keine
Lehrveranstaltungen“. Fällt eine Lehrveranstaltung selbst aus,
zeigt die Woche trotzdem ihre Kästen, damit man den Ausfall sieht. Stunden von–bis aus allen Serien des
Semesters (dazu Einzeltermine und geänderte Zeiten der Woche), damit das Raster von Woche zu Woche gleich bleibt; Höhe am
Stundenplan 697 px, am Dashboard feste Viertelstunden (CSS). Überschneiden sich Kästen eines Tages, stehen sie nebeneinander
(`spalten`, `lage`: Breite und Abstand links im Stil). Ein blasser Kasten (`spaeter`) teilt sich die Breite nie mit einem
echten (seit 19.10.2026; vorher halbierte ein Tutorium, das erst in zwei Wochen begann, eine Vorlesung): Überschneidet er
einen, steht er schmal am rechten Rand (22 %, Klasse `schmal`, nur der Kurzname), die echten Kästen daneben behalten 78 %.
Wörter brechen nie mitten im Wort, nur an Silben. Reine Logik als Funktionen (`wocheBauen`, `spalten`, `lage`, `kurzname`,
`artText`, `versatzAus`, `wocheText`, `raumKnapp`, `wischStartOk`, `wischAchse`,
`wischRichtung`), getestet in `tests/wochenraster.test.js`. CSS: Abschnitte 47 und 55.
*Eine Ansicht auf jeder Breite (seit 24.10.2026):* Dashboard und Seite Stundenplan zeichnen dasselbe Raster, auch auf dem
iPhone hochkant. Vom 19. bis 24.10.2026 zeigte das Dashboard unter 520 px Kartenbreite stattdessen einen Tag als Liste
(Tagesansicht: Leiste mit fünf Tagen, darunter die Lehrveranstaltungen des gewählten Tags, Wischen von Tag zu Tag), und für
die ganze Woche brauchte es die Seite Stundenplan, die 0.6.6 darum am iPhone in der Seitenleiste führte. Das waren zwei
Ansichten derselben Woche und ein Weg mehr; das schmale Raster zeigt Name, Raum und Ausnahmen inzwischen lesbar. Die Seite
Stundenplan bleibt (Kopf und Raster; die eingeklappte Liste aller Lehrveranstaltungen und der Alma-Knopf sind seit 24.10.2026
weg, Seitenleiste und Modulseiten zeigen die Module und ihre nächsten Sitzungen, Alma holt stündlich), steht aber in keiner
Seitenleiste mehr (`sichtbareZiele`, siehe [„Öffnen und Navigieren“](bedien-bausteine.md)); Lehrveranstaltungs-Notizen verweisen weiter auf sie
(`uebersicht`). *Schmales Raster* (Karte unter 480 px, also iPhone hochkant, Dashboard wie Seite Stundenplan): Spalten
von gut 60 px; der Kurzname in 10,5 px bricht nur an Silben (`hyphens: auto`, `lang="de"`, nie mitten im Wort), darunter die
knappe Zeile (`zeileZeichnen(el, k, true)`, beide Zeilen stehen im Kasten, das CSS wählt nach der Breite): Raum gekürzt
(`raumKnapp`: ohne Zusatz in Klammern, auch verschachtelt, „Hörsaal“ als „HS“, „Hörsaal 1 (Keplerstraße 2)“ → „HS 1“), Zeit nur
bei einer Änderung („18:15 statt ~~16:15~~“) und als „ab TT.MM.“, Ausfall „Fällt aus“; ein hoher Kasten zeigt drei Zeilen
(`eba-core.css` 55 und 37.stundenplan, Innenabstand seitlich 3 px). Quer (iPhone) und am iPad ist die Karte breiter: das volle
Raster.
*Andere Woche:* ‹ und › sind Links auf die Aktion `woche` (`schritt` = Wochen ab heute), „KW n“ ist in einer anderen Woche
der Link zurück (`schritt=0`). Welche Woche, merkt sich nur dieses Gerät: `app.saveLocalStorage("eba-woche-versatz")` mit
Versatz, Uhrzeit und Sitzung (`ctx.bleibend`, neu bei jedem Start von Obsidian). Gilt nur in derselben Sitzung und höchstens
30 Minuten nach dem letzten Wechsel, sonst wieder die aktuelle Woche, ohne Schreiben. Zwei Geräte blättern so unabhängig (bis
zum 17.10.2026 stand die Woche in einer abgeglichenen Notiz, und ein Gerät blätterte das andere mit). Auf Touch-Geräten,
vor allem am iPhone, blättert man durch Wischen über das Raster: waagerecht mehr als 50 px und mehr als doppelt so weit wie
senkrecht; nicht in den äußeren 30 px des Bildschirms begonnen (dort zieht Obsidian die Seitenleisten auf) und nicht auf einem
Link oder Kasten. Die erste Bewegung über 10 px entscheidet die Richtung; erst wenn sie waagerecht ist, ruft `woche.js`
`preventDefault()` (Listener `touchmove` nicht passiv) und reicht das Ereignis nicht weiter, senkrechtes Scrollen bleibt
unberührt (am Gerät noch nicht geprüft).
*Name der Woche (seit 24.10.2026):* Über den Tagen steht eine Leiste (`eba-wleiste`, im oberen Innenabstand der Karte, der dafür
um 28–30 px wächst; Zeilen, Tageslinien und Heute-Spalte bleiben unberührt). Links, in der Schrift der Kartentitel und bündig mit
„Mo“, wo die gezeigte Woche zu heute liegt (`wocheText`, nach Kalenderwochen Montag bis Sonntag): „Diese Woche“, „Nächste
Woche“, „In 2 Wochen“, „Letzte Woche“, „Vor 2 Wochen“. Am Samstag und Sonntag zeigt das Raster ohne Blättern also „Nächste
Woche“, eine Woche zurück „Diese Woche“. Rechts „‹ KW n ›“, auf jeder Breite mit „KW“; am iPad und iPhone 28 px breite Pfeile mit
Tippflächen von 44 px Höhe (der linke auch 44 px breit). Vorher blieb die Kopfzeile eine Zeile, am iPhone „‹ 44 ›“ rechts neben
Freitag, und eine eigene Zeile für Monat und Pfeile war verworfen. Dann sagte am Wochenende nichts, dass schon die nächste Woche
dasteht (kein Tag hervorgehoben), und nach dem Wischen nur die Nummer, wie weit die Woche von heute weg ist. Ein Name der Woche
passt am iPhone nicht neben Freitag, darum die Leiste.
*Kästen:* Oben kräftig der Kurzname: `kurz` der Stundenplan-Notiz, sonst `kurz` der Modulnotiz (Grundstudium-Module haben
ihn, z. B. „VWL“, „Mathe“), sonst der Code. Daneben blass Art und Gruppe, aber nur für Übung, Tutorium, Seminar: `art`
„Vorlesung“ und „Veranstaltung“ (Alma ohne erkannte Art) gelten als Vorlesung (Klasse `vl`, gefüllte Fläche, kein Wort), alles
andere als `ue` (helle Fläche, Farbkante). Die Gruppe ist `gruppe` (Anzeigename wie in ILIAS, nie `gruppe_alma`): beginnt sie
mit der Art („Tutorium 1“), steht nur sie da, eine bloße Zahl wird „Gruppe n“, sonst Art und Name („Tutorium Gruppe 4“).
Klasse `konflikt` (nur Gruppen-Notizen, `herkunft` ilias-gruppe oder gruppe-gewaehlt): Warnpunkt und „überschneidet sich mit …“
im Tooltip, wenn sich ihre übliche Zeit am selben Wochentag mit einer anderen Notiz im Raster überschneidet (nicht verdeckt,
nicht entfallen, nicht „Besuche ich nicht“, kein Einzeltermin, nicht dieselbe `gruppe_id`). Seit 24.10.2026 rechnet `woche.js`
das beim Zeichnen; vorher stand der Name im Feld `konflikt`, geschrieben nur beim Schreiben der Gruppen-Notiz, und blieb, wenn
die andere Notiz Zeit oder Tag wechselte oder eine neue dazukam. Ein altes Feld zählt nicht mehr und fällt beim nächsten
Schreiben weg. Zweite Zeile: Raum, davor der Beginn in
`<time>`, wenn er nicht zur vollen Stunde liegt (bei einer Änderung die neue Zeit; am iPhone nur dann). Voller Titel mit Zeit
und Raum im `title`, ein Tipp öffnet das Modul (Aktion `zeigen`, immer mit dem vollen Pfad der Modulnotiz aus `modulPfad`, nie
über den Namen; ohne Modulnotiz die Stundenplan-Notiz selbst). Jeder Kasten ist ein CSS-Größen-Container; was nicht in
seine Höhe passt, entfällt (Abschnitt 55).

## Fachmodell (seit 18.10.2026, `modell.js`)

Regel für jede neue Funktion: Was Prüfung, Frist, „diese Woche“, Sitzung, ECTS, Note, „im Plan“, Statusfarbe oder Datum
heißt, fragt sie `ctx.modell`, statt es selbst abzuleiten. Bis zum 18.10.2026 rechnete jeder Bildschirm selbst, und Dashboard,
Modulseite, Zeitleiste und Studienverlauf widersprachen sich (Konsistenz-Audit). Eine neue Regel kommt ins Modell, mit Test in
`tests/fachmodell.test.js`; Bases-Formeln, die eine Regel nachbilden müssen, bekommen einen Vergleich in
`tests/bases-regeln.test.js`. Ein leeres Feld fragen Bases-Formeln mit `feld.isEmpty()` ab, nie mit `!feld`: Das wertet
Bases für ein fehlendes Feld falsch aus (Filter ohne Treffer, `if()` im falschen Zweig). Derselbe Test sucht danach.

| Aufruf | Ergebnis und Regel |
|---|---|
| `zeit` | Datum und Text in einer Schreibweise (docs/design.md): `datum(iso)` „Mo 19.10.“, Jahr nur außerhalb des laufenden Studienjahrs (1.10. bis 30.9.) „06.02.2028“; `kurz`, `spanne` („19.–25.10.“, „12.10. – 06.02.“), `abstand` („heute“, „in 5 Tagen“), `uhr`, `minuten`, `uhrzeitIn(text)` („24:00“ ist das Ende des Tages und kommt nach 23:59, auch in `ortTeilen`: „bis 24:00 Uhr“ einer Abgabe aus dem ILIAS-Kalender), `kw`, `montag`, `plus`, `tage`, `jahrRaten(tag, monat, { bezug, ab })` (höchstens 60 Tage zurück, sonst das nächste Jahr; `ab`: erstes Vorkommen ab dem Beginn eines Zeitraums; die To-dos in `todos.js` raten seit 24.10.2026 mit `bezug` = Tag der Notiz (`datum`, sonst ein Datum im Dateinamen, sonst ihr Anlegedatum, wenn es weniger als 300 Tage her ist, sonst heute), damit ein offenes „bis 05.10.“ nach zwei Monaten überfällig bleibt), `plural(n, einzahl, mehrzahl)`, `esc`, `heute()` (aus `ctx.date`, also mit `plugin.testDatum`). `ctx.zeit(fn, ms)` bleibt der Timer-Helfer des Kerns. |
| `termine({ alle })` | Termin-Notizen normiert (`datum`, `bis`, `ende`, `kategorie`, `art`, `zeit`, `minuten`, `ab`, `bisZeit`, `wo`, `geschaetzt`, `erledigt`, `zwischentest`, `nachhol`, `freiwillig`, `zentral`), nach Tag und Uhrzeit als Zahl (9:15 vor 12:15, ohne Uhrzeit zuerst). Entfallene (`entfaellt: true`) und die Frist der Orientierungsprüfung eines anderen Jahrgangs zählen nirgends (`alle: true` liefert sie). Uhrzeit: Feld `uhrzeit` (neue eigene Termine), sonst aus `ort`. |
| `pruefungen({ heute, ab, bis, code, zwischentests })` | Termin-Notizen `kategorie: Prüfung` (eintägig; ein Zeitraum ist eine Prüfungsphase) und Modulfeld `klausur`; Kürzel + Tag einmal, die Notiz gewinnt, ein Zwischentest verdeckt keine Klausur. Je Prüfung `erledigt` (Haken an der Notiz oder Modul bestanden/anerkannt), `fertig`, `ergebnis`, `offen` (kommt noch, nicht erledigt). |
| `pruefungVon(code)` | Die Prüfung eines Moduls: ohne Zwischentests, Nachholtermin nur nach „nicht bestanden“; die nächste offene, sonst die letzte. Modul bestanden/anerkannt: nur eine, die schon war, sonst `null`. Lernplan, Modulseite, Studienverlauf und die Spalte „Termin“ auf Noten & ECTS nutzen sie. |
| `naechstePruefung()` | Kachel „Nächste Prüfung“: früheste offene Klausur ohne Zwischentests und Nachholtermine. |
| `fristen({ tage })`, `abgaben({ tage })` | Fristen (`kategorie: Frist`, offen, laufen noch oder kommen), sortiert nach dem nächsten Stichtag (`stichtag`: läuft der Zeitraum schon, sein Ende, sonst sein Beginn); offene Übungsblatt-Notizen (bis 0.6.7) mit Fälligkeit (überfällige bleiben bis zur Abgabe). |
| `uebungen({ heute, semester, alle, code, frist })`, `uebung(f)`, `blattNummer(titel)` | Übungen (seit 24.10.2026): Ein Übungsblatt ist seine Begleitnotiz (`typ: unterlage`, `art: Übung`), bis 0.6.7 führte „Neues Übungsblatt“ daneben eine zweite Notiz zum selben Blatt. `abgaben`: Fristen mit gleichem Code und der Nummer des Blatts im Titel („B110 Abgabe 3“ aus dem ILIAS-Kalender, „Abgabe Übungsblatt 03“, „3. Hausaufgabe“; nicht „Feedback“, nur im Semester des Blatts), `abgabe` die erste offene, sonst die letzte, dazu `datum`, `uhr`, `ueberfaellig`. `erledigt`: mit Abgabe deren Haken, ohne `status: bearbeitet` („gelesen“ heißt bei einem Blatt: noch nicht bearbeitet). `loesung`, `eigene`: Begleitnotizen der Art Lösung bzw. Eigene Lösung mit gleicher Nummer (gleiches Semester, wenn beide eins haben). Standard: das aktuelle Semester (Feld `semester`, sonst `datum`); `frist`: die Blätter zu einer Termin-Notiz. Sortiert: mit Abgabe nach Tag, dann Code und Nummer, ohne Nummer zuletzt. |
| `kalenderwoche(iso)`, `planwoche(iso)` | Montag bis Sonntag des Tages bzw. die Woche, um die es geht: **am Samstag und Sonntag schon die kommende** (`vorgezogen`). Die eine Wochenend-Regel für alles, was „diese Woche“ zeigt: Wochenraster, Leiste „Semesterverlauf“, Semesterband der Modulseite, Agenda („Diese Woche · 17.–25.10.“ ab heute) und `woche().text` („Vorlesungswoche 2 von 16“ am Sonntag vor Woche 2). Tagesangaben (heute, morgen, Countdown, „Vorlesungsbeginn morgen“) bleiben am Tag. |
| `findetStatt(fm, tag)` | Findet eine Sitzung (`typ: lehrveranstaltung`) an dem Tag statt? `{ statt, grund, name, beginn, ende, raum, geaendert, raumGeaendert, raumAlt, zeitGeaendert, zeitAlt }`; `grund`: `entfaellt`, `ausgeblendet` (Besuche ich nicht), `anderer Tag` (auch Einzeltermin), `ausserhalb` (`von`/`bis`), `pause`, `frei` (vorlesungsfreier Tag wie Christi Himmelfahrt), `ausfall` (seit 20.10.2026 in dieser Reihenfolge: Pause und freier Tag gehen dem Ausfall vor, Alma trägt die Weihnachtspause auch in `ausfall` ein); `aenderungen` setzen Zeit und Raum, `raumAlt` und `zeitAlt` („10:15–11:45“) sind dann der übliche Wert; vor `raum_seit` gilt `raum_vorher`, die ersten zwei Wochen ab `raum_seit` `neuerRaum` mit `raumAlt` = `raum_vorher`; `rhythmus: 14-täglich` nur jede zweite Woche ab `von`. Wochenraster (auch „jetzt“), Kopf der Vorlesungsnotiz (Zeit und Raum am Tag der Notiz), „Läuft gerade“ (`eba.jetztLaufend`, seit 20.10.2026; vorher nur `wochentag`, `von`, `bis` und `ausfall` mit der üblichen Zeit) und `naechsteSitzung(fm, jetzt)` („Als Nächstes“, dieselben Felder) nutzen sie. `ausfaelle(fm, jetzt, tage = 14)`: Ausfälle (`grund` `ausfall`) ab heute, heute nur bis zum Ende. |
| `imPlan(modul)` | Gehört zu deinem Studium: gewählt, selbst geplant, begonnen (Status nicht „offen“), Grundstudium und Abschluss, in Profil & Vertiefung Pflicht deiner Variante (offen: Pflicht in allen); Schwerpunkt nur gewählt oder begonnen; Zusatzleistungen nie. |
| `ects()`, `noten()`, `blockVon(fm, variante)` | ECTS = bestandene und anerkannte Module ohne Zusatz + SQ-Kurse (höchstens 9, solange SQ100 offen), `op` (höchstens 4), `opFrist` (Ende des 4. Fachsemesters); Gesamtnote nach § 13 BT wie Noten & ECTS. |
| `statusArt(typ, wert)` | Ton einer Pille nach docs/design.md: ok (bestanden, anerkannt, angemeldet, erledigt, gelesen …), warn (Frist, in Arbeit, Abgabe), bad (Prüfung, nicht bestanden, überfällig), info (läuft, Lehre, Zwischentest), akzent (Fachschaft, Veranstaltung), sonst leer (offen, neu, geschätzt). |
| `istZwischentest(x)`, `istNachhol(x)`, `terminArt(kategorie, zt)`, `ortTeilen(ort)`, `modul(code)`, `opFrist()` | Einzelregeln; Zwischentest = „Zwischentest“ (auch „Zwischen-Test“) im Titel oder Dateinamen. |
| `besuchtNicht(fm)`, `besuchSchluessel(fm)` | „Besuche ich nicht“ für jede Lehrveranstaltung (seit 0.4.6): Notiz einer Quelle über ihren Schlüssel in `stundenplan_ausgeblendet` der Einstellungen (zentral die `zentral_id`, sonst `<herkunft>:<id>`, z. B. `alma:…`, weil die Quelle ihre Notiz neu schreibt), deine eigene über das Feld `besuche_nicht: true`. `findetStatt` gibt dann `ausgeblendet`. Bis 0.4.5 nur für zentrale Notizen. |
| `vorlesung(f)`, `vorlesungen({ code })`, `vorlesungTitel(o)`, `vorlesungThema(o)` | Der eine Name einer Vorlesungsnotiz (seit 19.10.2026): „Vorlesung 1 · Mo 13.10. · Thema“ (ohne Nummer „Vorlesung“, ohne Modul „Mitschrift“). Nummer aus `nummer`, sonst aus dem Dateinamen („… VL 03“); Thema aus `thema`, sonst die erste Überschrift, wenn sie mehr sagt als Kürzel, Nummer, Datum und Modultitel, sonst der Titel der Folien dieser Sitzung (`folien(f)`, ohne Semester); nie erfunden. `vorlesungen` neueste zuerst. Nutzer: Modulseite, „Nachzuarbeiten“, To-dos, Kopf der Vorlesungsnotiz, neue Notizen. Dateinamen bleiben. |
| `folien(f)` | Die Folien einer Vorlesungsnotiz (seit 24.10.2026) → `{ folien, gewaehlt, alle }`, bei jedem Zeichnen neu aus dem, was gerade im Tresor liegt; wählen muss niemand. Feld `folien` = deine Wahl (Kopf → „⋯“ → **Andere Folien …**, „Automatisch“ leert es), sie gilt immer. Sonst zur Sitzung der Notiz (ihr Tag, sonst die letzte Sitzung in den 6 Tagen davor; Sitzungen laut Stundenplan ohne Übung und Tutorium, ohne Stundenplan die Tage der Vorlesungsnotizen): 1. Folien mit dem Datum dieser Sitzung in `quelle` (Sitzung oder Ordner in ILIAS), sonst in `original` (Dateiname); 2. sonst, was seit der vorigen Sitzung ankam (`datum` der Begleitnotiz), höchstens 3 Nummern (mehr ist ein Upload fürs ganze Semester); 3. sonst die Folien der vorigen Sitzung (deine Wahl dort oder dieselbe Regel), davon die höchste Nummer; 4. erste Sitzung: die kleinste Nummer, die vor der nächsten Sitzung ankam. Zwei Notizen einer Sitzung mit verschiedener Wahl: beide. Ein Datum außerhalb des Semesters (Vorjahr) und ein anderes `semester` zählen nie von selbst; je Nummer die neueste Fassung, dann die mit mehr Seiten. `alle` = Folien des Moduls fürs Wählen, nach Nummer. Bis 0.6.2 riet `notizen.js` beim Anlegen (`eba.folienZu`: gleiche Nummer wie die Vorlesung, sonst die der letzten Notiz) und schrieb das Feld; das traf bei Kapitel-Nummern oft daneben, und Späteres erschien nie. Solche älteren Werte gelten als Wahl. Nutzer: Kopf der Vorlesungsnotiz (ein Chip je Folien, höchstens 3), `seitenlink` (die erste), Thema im Namen. Tests: `tests/vorlesungen.test.js`. |

Prüfungsphasen kommen nur aus den Semesterdaten (`daten().pruefungsphasen`); Termin-Notizen wie „Klausurphase Haupttermin“
sind Kalendereinträge und zählen für keine Regel. Die Frist der Orientierungsprüfung aus den zentralen Daten (30.09.2028)
übernimmt `zentral.js` nur, wenn ihr Datum das Ende deines 4. Fachsemesters ist (`opFrist`). Nutzer: `dashboard.js`
(Kacheln und Listen), `termine.js`, `kalender.js`, `woche.js`, `modul.js`, `klausurzeit.js`, `verlauf.js`, `lernplan.js`,
`alma-konto.js` (Erinnerung an die Prüfungsanmeldung), `tabellen.js` (Datum, Chip-Farbe), `notizen.js` (Zwischentest ist eine
Prüfung), `eba.js` und `todos.js` (Jahr zu „TT.MM.“),
`zentral.js` (Jahrgang der Orientierungsprüfung). Die Bases-Formeln auf Noten & ECTS (Termin, „im Plan“, Stand, Block,
Kennzahlen, seit 0.4.6 auch die Tabelle „Bestanden“: Spalte ECTS = `formula.zaehlt`, ohne Zusatzleistungen, bei offenem SQ100
eine Zeile mit den gezählten SQ-Kursen, ihre Summe = `ects().ist`) folgen denselben Regeln; `tests/bases-regeln.test.js`
rechnet sie mit einem kleinen Auswerter (`tests/bases-formel.js`) auf ausgedachten Notizen aus und vergleicht sie mit dem
Modell.
