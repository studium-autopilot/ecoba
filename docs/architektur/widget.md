# Architektur: Widgets für iPhone und iPad

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Widgets (seit 28.10.2026, `widget.js`)

Stundenplan, Fristen und Prüfungen auf dem Home-Bildschirm und dem Sperrbildschirm. Obsidian bietet Plugins keine Widgets an;
ein Widget braucht eine App mit Widget-Erweiterung. Darum zeichnet die kostenlose App [Scriptable](https://scriptable.app) sie,
aus Dateien, die das Plugin auf demselben Gerät schreibt. Verworfen: eine eigene App (Apple-Entwicklerkonto, TestFlight, für
eine Vorlage zu viel), Kurzbefehle-Widgets (zeigen nur Knöpfe, keine Inhalte), Daten vom eigenen Server (nur für wenige).

**Drei Teile:**

1. **Daten** (`datenBauen`): `.obsidian/plugins/studium-autopilot/widget-iphone.json` bzw. `widget-ipad.json`, je Gerät eine Datei
   (iPhone und iPad schreiben nie dieselbe; der Ordner des Plugins liegt nicht unter den Notizen und gehört keiner Dateiklasse des
   Updates). Inhalt: Planwoche und die zwei Wochen danach aus `wocheBauen` (`woche.js`, mit `eingaben()` dieselben Notizen,
   verdeckten Gruppen und derselbe Studienbeginn wie das Wochenraster; je Sitzung Tag, Beginn und Ende an diesem Tag, Kurzname,
   Art, Raum und Raum knapp wie im Raster der App (`raumKnapp`: „HS 0.02“ statt „Hörsaal 0.02 (VG Wilhelmstraße …)“), Modulfarbe
   1–6, Vorlesung oder Übung, online, Ausfall, Ausnahme, „ab TT.MM.“, Marke wie „Fällt aus“, Ziel), „Fristen · 30 Tage“ aus `zeilenBauen("fristen")` (`dashboard.js`; die Zeilen tragen dafür `art`, `tag`, `laeuft`,
   `ueberfaellig`), die nächsten drei Fristen wie die Kachel „Nächste Frist“ (`fristen`), die nächsten vier Prüfungen nach der Regel
   der Kachel „Nächste Prüfung“ (`naechstePruefung` je ab dem Tag nach der vorigen), Design und hell/dunkel dieses Geräts
   (`ctx.darstellung`), der Name des Tresors für Links. Keine Regel steht doppelt: Was „heute“, „morgen“, „jetzt“ und „vorbei“ ist,
   rechnet das Widget aus den Tagen selbst, damit es auch Tage nach dem letzten Öffnen von Obsidian stimmt.
2. **Zeichner** (`scriptable`, eine Funktion in `widget.js`): als Text (`toString`) in `widget-scriptable.js` neben den Daten.
   Er kommt so mit jedem Update, ohne dass jemand in Scriptable etwas ändert. Er nimmt nichts aus `widget.js` mit (ein Test führt
   ihn in einem eigenen Bereich aus) und bekommt Scriptables Bausteine als Argument (`{ ListWidget, Color, Font, Size, SFSymbol,
   Device, config, args, fm, ordner }`).
3. **Lader** (`einrichten`, als Text `lader({ tresor, ort })`): das eine Skript, das man in Scriptable einfügt. Es bleibt, wie es
   eingefügt wurde, darum steht darin nur, was vor dem Zugriff auf den Tresor nötig ist; alles andere macht der Zeichner.
   - **Erster Lauf** (in der App; eingefügt mit leerem `ART` oder als Datei übernommenes „Stundenplan“, solange Fristen und Prüfungen
     beide fehlen; ist eins davon gelöscht und das andere da, bleibt es gelöscht): legt im Ordner der Skripte (`module.filename`, iCloud oder lokal) die Skripte
     **Stundenplan**, **Fristen** und **Prüfungen** an, Kopien seines eigenen Texts mit `const ART = "…"` und Symbol im Kopf von
     Scriptable (Kalender, Sanduhr, Doktorhut). Im Widget wählt man so nur das Skript, ohne Parameter. Ein fremdes Skript mit
     demselben Namen (ohne die Marke `// Studium Autopilot: Widget`) bleibt, die Kopie heißt dann „Name (Studium Autopilot)“. Das
     eingefügte „Untitled Script“ löscht sich danach, ein selbst benanntes bleibt.
   - **Tresor finden:** jedes Datei-Lesezeichen (`allFileBookmarks`, ohne die für Kurzbefehle), der Ordner selbst oder ein Ordner
     darin, erkannt an `.obsidian/plugins/studium-autopilot/manifest.json`; unter mehreren der mit dem Namen dieses Tresors. Der Name
     des Lesezeichens ist egal, ein Lesezeichen auf den Ordner „Obsidian“ reicht.
   - **Kein Zugriff:** in der App eine Anleitung in vier Schritten (`ort`: „Auf meinem iPhone“ bzw. „iPad“ oder „iCloud Drive“, vom
     Plugin nach dem Pfad des Tresors), im Widget „Tippe hier, um das Widget einzurichten.“, das dieses Skript startet
     (`scriptable:///run/<Name>`). Kein Zeichner: „Öffne Obsidian einmal auf diesem Gerät …“.
   - Sonst lädt es `widget-scriptable.js` (aus iCloud, wenn nötig) und gibt `{ art, name, app, Alert }` mit. In der App zeigt der
     Zeichner „Alles bereit“ mit dem Weg auf den Home-Bildschirm und Vorschauen in Klein, Mittel und Groß, bis „Fertig“.
   - **Kopie:** Nach jedem Lauf mit Zugriff liegen Zeichner und Daten auch in Scriptables Library (`studium-autopilot/`, nie in der
     Liste der Skripte). Ist der Tresor gerade nicht lesbar (Lesezeichen weg, Datei noch in iCloud), zeichnet das Widget aus ihr
     statt eines Fehlers; in der App ohne Zugriff kommt trotzdem die Anleitung. Anregung aus Weather Cal und anderen Ladern.
   Ein Lader von vor dem 29.10.2026 (ein Skript mit Parameter) zeichnet weiter.

**Schreiben:** nur mit `Platform.isIosApp`, nur wenn sich der Inhalt geändert hat (Vergleich ohne `stand`; nach einem Neustart mit
der Datei auf der Platte). Anlässe: 15 s nach dem Start, `ctx.modell.beiAenderung` (entprellt 2 s), wenn Obsidian in den
Hintergrund geht (dann lädt iOS Widgets gern neu) und alle 30 Minuten. Ausnahme von „Beim Start schreibt das Plugin keine Datei“:
geschrieben wird nur in den Ordner des Plugins, nie unter die Notizen.

**Was die Widgets zeigen** (nach dem Skript, seit 29.10.2026; das Feld „Parameter“ geht vor und erkennt „Fristen“, „Prüfungen“, auch
klein, ohne Umlaut und in der Einzahl, z. B. `pruefung`):

| Skript | klein | mittel | groß (iPad auch sehr groß) | Sperrbildschirm |
|---|---|---|---|---|
| Stundenplan | Als Nächstes, das ganze Widget in der Modulfarbe: wann („In 25 Min.“, „Morgen“), groß der Kurzname, Art, Ort (Kamera bei online), unten die Zeit; läuft sie, ein Balken mit „noch 40 Min.“ und dem Ende | der erste Tag ab heute, an dem noch etwas kommt, auch ein Tag mit Ausfall: links Heute/Morgen/Wochentag und groß das Datum, rechts bis zu drei Sitzungen mit Farbstreifen, Ort, Beginn und Ende, die laufende hinterlegt | die Woche, in der noch etwas kommt (an einem freien Freitag schon die nächste), wie das Raster: Achse, Mo–Fr, heute getönt und das Datum im Kreis, Überschneidungen nebeneinander, Vorbeies blass, die laufende mit Rand; je Kasten Name, Art oder Hinweis und Raum knapp, ohne Legende | Zeit, Kurzname, Ort; rund Kurzname und Uhrzeit |
| Fristen | die nächste Frist wie die Kachel: Sanduhr und „morgen“/„in 3 Tagen“/„läuft“ in der Farbe der Dringlichkeit, groß die Frist, unten das Datum | „Fristen“ der nächsten 30 Tage, je Zeile Wochentag und Tag, Frist, Uhrzeit oder Hinweis, rechts wann (iPhone zwei, iPad drei Zeilen) | dieselbe Liste, sechs Zeilen | nächste Zeile der Liste; rund die Tage |
| Prüfungen | groß die Tage bis zur nächsten Prüfung, darunter Prüfung und Datum | die nächsten Prüfungen mit Monat und Tag, Wochentag und Uhrzeit, rechts die Tage (iPhone zwei, iPad drei) | die nächsten vier | Prüfung und Tage; rund die Tage |

Ein Tipp öffnet in Obsidian das Modul der Sitzung, die Frist oder Prüfung bzw. die Seite (`SEITEN`: Stundenplan, Termine &
Anmeldungen, Prüfungen), über `obsidian://open`. `refreshAfterDate` ist der nächste Beginn oder das nächste Ende einer Sitzung heute,
sonst Mitternacht, frühestens in 5 und spätestens in 30 Minuten (wann iOS wirklich neu zeichnet, entscheidet iOS). Die Grenze von
30 Minuten gibt es seit 30.10.2026: Was Obsidian neu schreibt, Daten oder eine neue Fassung des Zeichners, zeigt das Widget erst beim
nächsten Zeichnen. An einem Tag ohne Sitzung war das bis dahin erst um Mitternacht. 30 Minuten sind 48 Mal am Tag und liegen im
Rahmen, den iOS einem oft gesehenen Widget gibt.

**Aussehen (seit 01.11.2026, angelehnt an die App, nicht gleich):** wie die Widgets von iOS. Die Modulfarbe trägt alles: Das kleine
Widget „Als Nächstes“ ist ganz in ihr getönt (das eine kräftige Element), sonst Farbstreifen und getönte Kästen. Kein Etikett in
Großbuchstaben, keine Kästen in Kästen, keine mit „·“ verketteten Angaben; die Rangordnung kommt aus Größe, Gewicht und Farbe, Listen
haben ein Symbol (Sanduhr, Doktorhut) und einen Namen als Kopf. Datum wie im Kalender von iOS („Mi, 21. Okt.“, heute im Kreis in der
Akzentfarbe). Kasten: Kante links in der Modulfarbe, Fläche 15 % (dunkel 25 %), Übung heller (10 %, dunkel 17 %), Titel in einer
tiefen bzw. hellen Abstufung der Modulfarbe, Nebenzeile fast neutral; Ausnahme in Bernstein, Ausfall, „ab …“ und Vorbeies neutral
und blass, die laufende mit Rand in der Modulfarbe. Diese Töne sind eigene des Widgets (`TON_HELL`, `TON_DUNKEL`), nicht die des Rasters:
So erreicht jeder Text mindestens 4,5 : 1 (große Schrift 3 : 1), ein Test prüft jeden Text gegen seinen Hintergrund in jedem Widget,
Design und Modus. Bernstein als kleiner Text eine Stufe tiefer (`F.warnText`), das Bernstein des Designs hat auf Elfenbein nur
4,3 : 1. Verkleinert wird nur, wo es gesetzt ist (große Namen), damit Zeilen gleich groß bleiben. Eine Zeile über die ganze Breite
(`volleZeile`) hält den Inhalt am linken Rand, denn das Widget stellt einen schmaleren Block in die Mitte. Farben hell und dunkel
je Design (`HELL`, `DUNKEL`, wie die CSS-Dateien; dunkel seit 01.11.2026, vorher für alle die von Elfenbein), die Modulfarben
dunkel für alle (`MODUL_DUNKEL`, wie `.theme-dark` in `eba-paper-elfenbein.css`), nach der Wahl des Geräts hell, dunkel oder
automatisch (`Color.dynamic`). Große Zahlen und Namen in der Schrift des Designs: Elfenbein Iowan Old Style, Flieder rund, Klar die Systemschrift. Scriptable nennt die Größe eines
Widgets nicht; der Zeichner nimmt sie aus einer Tabelle nach der Bildschirmgröße (im Zweifel die kleinere), mit den Werten aus
Apples Human Interface Guidelines (Widgets → Specifications, beim iPad die Spalte „Canvas“). Dazu gehören iPads mit der Anzeige
„Mehr Platz“ (1192 × 1590: 412 pt, 954 bzw. 970: 350 pt). Bis 29.10.2026 fehlten sie, und das große Widget rechnete am iPad 13" mit
379 statt 412 pt: ringsum blieb Rand stehen, unten ein leerer Streifen. Scriptable kennt weder schräge Streifen noch durchgestrichenen
Text: online zeigt die Kamera, ein Ausfall steht als „Fällt aus“ da.

**Woche groß** füllt das Widget genau: Kopf, Tage und Raster haben feste Längen, die zusammen die Höhe ohne Rand ergeben. Im Raster
steht keine Lücke ohne Länge (`addSpacer()`), nur feste, denn SwiftUI macht eine Lücke ohne Länge mindestens 8 pt lang. Ein Stapel
fester Größe, dessen Inhalt nicht passt, ragt oben und unten gleich weit hinaus. Am iPad (Foto vom 29.10.2026) standen darum Spalten,
die bis zum Ende des Rasters gingen, 4 pt höher als die anderen, und der erste Kasten war oben abgeschnitten. Ein Kasten fester
Breite gibt seinem Inhalt genau die Breite neben der Kante, sonst stünde kürzerer Inhalt mittig. Die Schrift wächst mit dem Widget
(`s` = Breite/338 bzw. Höhe/354, höchstens 1,25). Im Kasten steht der Name (ein langer wird bis 80 % kleiner), dann Hinweis oder
Art, dann der Raum knapp. Was nicht in eine Zeile passt, bekommt eine zweite, wenn der Kasten hoch genug ist. Die Zeilen darunter
werden nie kleiner, damit alle Kästen gleich aussehen; vorher schrumpften abgeschnittene Räume auf 75 %. Keine Legende, denn jeder
Kasten nennt sein Modul selbst. Die Höhe bekommt das Raster. Leere Stunden (Mittag) und ein freier Freitag bleiben wie im Raster
der App.

**Veraltet:** Liegt heute nach der letzten gelieferten Woche (drei Wochen ohne Obsidian) oder fehlt die Datei, steht statt eines
falschen Stundenplans „Öffne Obsidian auf diesem Gerät …“. Fristen und Prüfungen, die vorbei sind, fallen von selbst weg.

**Einrichten:** Einstellungen & Hilfe → Hilfe → **Widgets** (nur auf iPhone und iPad, `personalisieren.js`), Aktion `widget`: Fenster
mit drei Schritten (seit 29.10.2026 nachmittags; der Schritt „Scriptable zeigt dir, wie es deinen Tresor lesen darf“ kündigte nur an,
was Scriptable selbst erklärt, jetzt „und folge den Hinweisen“ in Schritt 2; vorher vier (seit 29.10.2026; am Morgen desselben Tages sechs mit Lesezeichen, Namen und Parameter von Hand, davor vier knappe
für Technische): Scriptable laden; **In Scriptable einrichten** (schreibt die Dateien, dann `Stundenplan.scriptable` in den Ordner
des Plugins und öffnet sie über ihre file://-Adresse, `getNativePath`: iOS gibt sie ohne Auswahl Scriptable wie Safari; in Scriptable
**Add to My Scripts**, dann **Stundenplan** antippen); den Zugriff auf den Tresor erklärt Scriptable selbst und prüft ihn;
Widget hinzufügen und **Stundenplan**, **Fristen** oder **Prüfungen** wählen. Je Schritt eine Handlung, so beschriftet, wie Scriptable
und iOS es zeigen (**File Bookmarks**, **Pick Folder** englisch). Verworfen: ein Kurzbefehl (übernähme nur das Einfügen, mit eigenen
Rückfragen), Daten per Link an Scriptable (jede Änderung spränge kurz in Scriptable), Kalender-Abo (bräuchte einen Server).
Einfügen ohne Zwischenablage geht nicht: `scriptable:///add` nimmt keinen Inhalt an. Am iPad geprüft (29.10.2026) mit
`scriptName`+`script`, `name`+`content`, `scriptName`+`code` und Base64 in `script`: jedes Mal ein leeres „Untitled Script“.
Eine Datei im Format von Scriptables Skript-Dateien (`skriptDatei`: JSON mit `name`, `script`, `icon { color, glyph }`,
`always_run_in_app`, `share_sheet_inputs`) dagegen öffnet beim Antippen Scriptable mit Name, Symbol und **Add to My Scripts** (am iPad
aus Safari geprüft, 29.10.2026). Aus Obsidian am iPad geprüft (29.10.2026): nur `window.open` mit der file://-Adresse
(`getNativePath`) öffnet Scriptable direkt. `app.openWithDefaultApp` zeigt das Teilen-Menü (bleibt als Rückfall), die Dateien-App
(`shareddocuments://` auf Datei oder Ordner), Safari (`data:`) und ein Download per Blob öffneten Scriptable nicht. Fehlt beides, wie
vorher: Lader kopieren, `scriptable:///add`, einsetzen und starten. `basePath` ist auf iPhone und iPad nur der Name des Tresors; ob
er in iCloud liegt, sagt darum die file://-Adresse.

**Tests:** `tests/widget.test.js` mit einem strengen Nachbau von Scriptable (`tests/scriptable-attrappe.js`: unbekannte Methoden und
Felder werfen; `html()` zeichnet ein Widget zum Ansehen als HTML, wie SwiftUI es auf dem Gerät tat: Lücke ohne Länge mindestens
8 pt, Überstehendes mittig, der Inhalt des Widgets als Block in der Mitte, `minimumScaleFactor` per Skript im Browser). Geprüft: Daten
(Wochen, Wochenende, Farben je Modul, Ausfall, online, „ab“, Raum knapp, Fristen, Prüfungen ohne Zwischentest), Farben gleich den
CSS-Dateien, jede Art in jeder Größe in jedem Design, Inhalte zu festen Zeiten, Woche groß ohne Überstand auf sechs Bildschirmen
(auch mit einer Sitzung bis zum Ende des Rasters) und genau so hoch wie das Widget, veraltete Daten, Einrichtung (drei Skripte mit Kopf und Art, fremdes Skript gleichen Namens bleibt, eingefügtes
löscht sich, Anleitung ohne Zugriff, Tresor unter mehreren im Lesezeichen „Obsidian“, „Alles bereit“ mit Vorschauen), Lader im Widget
(ohne Zugriff, ohne Daten, alter Weg mit Parameter), Kopie in Scriptable, Ort für die Anleitung, Schreiben nur auf iPhone und iPad und nur bei Änderungen. Nicht ohne Gerät prüfbar: wie
Scriptable die Stapel genau anordnet und wie oft iOS neu zeichnet.
