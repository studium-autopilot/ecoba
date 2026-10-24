# Architektur: Darstellung und Personalisieren

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Darstellung: hell, dunkel, automatisch und Design

Seit 17.10.2026 hat das Farbschema Paper Elfenbein, `eba-paper-elfenbein.css`, Farben für Obsidians helles und dunkles Grundschema
(`.theme-light`, `.theme-dark`). Form und Schrift gelten in beiden (`:is(.theme-light, .theme-dark) …`), nur die Farben
wechseln. Bis dahin gab es dazu Paper, Paper Tübingen, Paper Schiefer und Graphite mit dem Befehl „Design wechseln“.

**Designs (seit 18.10.2026):** Elfenbein (Vorgabe), Flieder (`eba-flieder.css`: Lila, Akzent Violett, Rosé als zweite Farbe,
große Rundungen, runde Überschriften) und Klar (`eba-klar.css`: weiß, kühle Grautöne, Akzent Blau, Formen aus den Grundwerten
von `eba-core.css`). Form und Schrift von Flieder und Klar gelten hell und dunkel (seit 18.10.2026; vorher sah dunkel immer
aus wie Elfenbein), ihre Farben nur hell: dunkel gelten die dunklen Farben von Elfenbein, bis beide eigene haben. Gewählt wird über eine Klasse am
`body` (`eba-design-flieder`, `eba-design-klar`; Elfenbein ohne Klasse), nicht über das Ein- und Ausschalten der Bausteine:
Die eingeschalteten Bausteine stehen in `appearance.json` und kämen auf alle Geräte. Alle drei sind immer an. Die hellen
Regeln von Elfenbein (Form und Schrift) stehen darum unter `:is(.theme-light, .theme-dark):where(:not([class*="eba-design-"]))`,
die der Designs unter `.eba-design-…:where(.theme-light, .theme-dark)`, ihre Farben unter `.eba-design-….theme-light`. Alle
sind so spezifisch wie `.theme-light`: Die Ausnahmen in `eba-core.css` (Folien,
erste Überschrift unter dem Seitenkopf, iPhone) gewinnen weiter, und die Reihenfolge der Bausteine spielt keine Rolle. Ohne
geladene Skripte gilt Elfenbein; damit ein gewähltes Design beim Start nicht erst nach den Skripten erscheint, steht seine
Klasse zusätzlich in `eba-start-klassen`, und `main.js` setzt sie schon in `onload` (und nimmt sie in `onunload` wieder weg).
Seit 24.10.2026 prüft `darstellung.js` die Liste beim Laden (`startKlassenPruefen`): Die Klasse eines Designs, das es nach
einem Update nicht mehr gibt, nimmt es vom `body` und aus der Liste; andere Klassen bleiben (`startKlassenFuer`).

**Je Gerät:** Hell oder dunkel und das Design wählt jedes Gerät selbst; Name, Studienbeginn und Variante gelten dagegen überall. Darum
speichert `darstellung.js` die Wahl nur auf dem Gerät (`app.saveLocalStorage`, Schlüssel `eba-darstellung` und `eba-design`), nie im
Tresor, und schreibt Obsidians Einstellung `theme` nicht. Die steht in `.obsidian/appearance.json` (`moonstone` = Hell,
`obsidian` = Dunkel, `system` = Automatisch; Vorgabe der Vorlage `system`) und kommt mit `.obsidian/` auf alle Geräte. Sie
gilt nur, solange auf dem Gerät nichts gewählt ist. Ist etwas gewählt, setzt `anwenden()` die Klassen `theme-light`/`theme-dark`
selbst: gleich nach jedem Umschalten durch Obsidian (`css-change`, im selben Durchlauf, also ohne Flackern; der zweite Aufruf
ändert nichts mehr), bei einem Wechsel am Gerät (`prefers-color-scheme`), in neuen Fenstern (`window-open`) und für die
Statusleiste auf iPhone/iPad (`updateMobileFrameTheme`). Beim Abmelden gilt wieder Obsidians Einstellung. Bis 17.10.2026
schrieb die Wahl `appearance.json` und schaltete damit alle Geräte mit um. `appearance.json` ändert kein Update.

- Codeblock `eba-darstellung` (Einstellungen & Hilfe, Abschnitt „Darstellung“): ein Umschalter Hell · Dunkel · Automatisch
  (`.eba-ds`, `role="radiogroup"`), ohne Untertexte; am PC so breit wie nötig, auf iPhone, iPad und in der Einrichtung über
  die ganze Breite mit 44 px Tippfläche. Zeigt die Wahl des Geräts, sonst Obsidians Einstellung (neu gezeichnet bei
  `config-changed` `theme`). Bis zur Rückmeldung am 17.10.2026 waren es drei Zeilen mit „Wählen“ und Erklärsätzen.
- Darunter die Designs als drei gleiche Vorschau-Kacheln ohne Text (`designWahl()`, `.eba-dk`, `eba-core.css` Abschnitt 43,
  Baustein „Vorschau-Kacheln“ in [design.md](../design.md)): je eine Mini-Karte in den hellen Farben und der Rundung des Designs
  (Seite, Karte, Akzent, Vorschau-Variablen `--m-*`), gewählt mit Ring und Haken; `role="radiogroup"`, je Kachel ein Knopf
  `role="radio"` mit `aria-label`/`title` „Design 1“ bis „Design 3“, Tab auf die gewählte, Pfeiltasten, Pos1 und Ende wechseln
  (`designNachTaste()`); zeichnet `designSetzen()` den Block neu, bekommt die neue Kachel den Fokus. **Designs haben für
  Nutzer:innen keine Namen** (seit 18.10.2026): Elfenbein, Flieder und Klar gibt es nur in Code, CSS und dieser Doku; die
  Wortliste (`tests/wortliste.js`, Regel `design-ohne-namen`) findet sie in Texten der App. Bis 18.10.2026 stand je Design eine
  Zeile mit Namen, Farbmuster, Pille „gewählt“ oder „Wählen“ und dem Satz „dunkel mit den Farben von Elfenbein“; den Satz gibt
  es nicht mehr, hell oder dunkel wählt der Umschalter darüber.
- Aktion und Befehl `darstellung` (`wert` = `hell`, `dunkel`, `automatisch`; ohne Wert eine Auswahl), ohne Hinweis.
- Aktion und Befehl `design` (`wert` = `elfenbein`, `flieder`, `klar`; ohne Wert eine Auswahl „Design 1“ bis „Design 3“), ohne
  Hinweis.
- Beim Wählen und einmal beim Start (nur wenn `eba-core` an ist) schaltet `schemaSichern()` `eba-core` und
  `eba-paper-elfenbein`, `eba-flieder` und `eba-klar` ein und die früheren Designs aus. Sonst sähe ein Tresor, in dem eines davon gewählt war, nach dem
  Update ungestaltet aus (das Update verschiebt ihre Dateien in die Sicherung).
- Schrift auf einer Akzentfläche nimmt `var(--text-on-accent, #fff)`, nie die Kartenfarbe: dunkel wäre sie zu schwach.
- Für die Einrichtung und Tests: `ctx.darstellung = { MODI, DESIGNS, modusAus, modus, dunkelFuer, setzen, segmente, schalter, design,
  designKacheln, designNachTaste, designSetzen, designWahl, anwenden, schemaSichern }`; rein und getestet sind `modusAus()`,
  `dunkelFuer()`, `segmente()`, `designKacheln()` und `designNachTaste()`, `setzen()`, `designSetzen()`, `anwenden()` und
  `designWahl()` mit Ersatz für Gerätespeicher, `body` und Elemente (`tests/darstellung.test.js`). `schalter(el)` zeichnet den
  Umschalter, `designWahl(el)` die Kacheln.

## Personalisieren

Das Formular (Aktion und Befehl `personalisieren`, Zeilen Name, Studienbeginn und Zielnote in den Einstellungen) hat Name, Studienbeginn als
Semester-Auswahl (mit Vorschau „1. Fachsemester … · heute n. FS“ und Hinweis bei Beginn im Sommersemester), Variante und
Zielnote (1,0–4,0, Komma oder Punkt, gespeichert als „2,3“). Speichern schreibt nach `System/Einstellungen.md`; leere Felder
werden leer (`name:`), nicht `""`. Danach zieht `abgleichen()` die Semesterliste nach. Semester-Auswahl, Vorschau und
Zielnoten-Prüfung nutzt auch die Einrichtung (`ctx.personalisieren.semesterOptionen`, `vorschauTeile`, `zielnotePruefen`).

**Feld-Register** (`felder.js`, seit 0.4.5, Konsistenz-Audit Schritt 3): Angaben, die an mehreren Stellen eingegeben werden,
sind einmal beschrieben (`ctx.user.felder`, Bibliothek ohne Obsidian): `VARIANTE` (gespeicherte Werte in einer Reihenfolge
Economics, Business Administration, ohne Spezialisierung, offen; Titel „Noch offen“, im Satz „noch offen“; `varianteLesen`,
`varianteFinden`, `varianteTitel`, `varianteImSatz`), `STUDIENBEGINN` (Datum oder leer = „Aktuelles Semester“, wandert mit; die
Einrichtung trägt bewusst ein festes Datum ein; `studienbeginnLesen`, `studienbeginnLeerTitel`), `NOTE` (Modulnote 1,0–4,0 in
Zehnteln oder 5,0, mit Komma; `notePruefen`) und `ZIELNOTE` (1,0–4,0, höchstens zwei Nachkommastellen; `zielnotePruefen`).
Einrichtung, Formular, Zeilen „Variante“, Befehl „Variante wählen“ (`aktionen.js`) und Modulfeld (`modul.js`) nutzen nur das
Register; vorher hatte jede Stelle eigene Reihenfolgen und Wörter („Weiß ich noch nicht“, „noch offen“, „Noch offen“). Eine
neue Eingabe, die an mehr als einer Stelle vorkommt, kommt dorthin. Tests: `tests/felder.test.js`.

Codeblock `eba-personalisieren` (früher die Karte oben auf dem Dashboard) zeichnet seit 0.3.0 nichts mehr; er bleibt, damit
selbst geänderte ältere Dashboards keine Lücke zeigen.

Codeblock `eba-personalisieren angaben` (Einstellungen & Hilfe, „Deine Angaben“): kompakte Zeilen wie unter Verbindungen
(seit 24.10.2026, `.eba-ez`). Name, Studienbeginn (das erste Semester), Zielnote mit dem Wert rechts, leer „Eintragen“ (kurz,
damit auf dem iPhone mit großer Schrift Titel und Wert in eine Zeile passen); ein Tipp öffnet das Formular am Feld. Einrichtung
rechts „Starten“ oder „Fortsetzen“ im Akzent, fertig „Fertig“ und darunter die übersprungenen Schritte; ein Tipp startet sie
(erneut ab Schritt 2). `eba-personalisieren variante`: je Variante eine Zeile ohne Symbol, die gewählte mit Haken rechts und
dem, was daraus folgt (`FOLGE`), darunter, die übrigen wählt ein Tipp (Aktion `variante`). Bis 0.6.6 hatte jede Zeile einen
Satz und einen Knopf („Ändern“, „Erneut starten“, „Wählen“). Beim
Neuzeichnen der Leseansicht (`rerender`) liefert `getSectionInfo` oft nichts, `blockArgument()` gibt dann die Vorgabe zurück;
bis 16.10.2026 blieb die Karte deshalb unsichtbar. Seitdem gilt wie in `todos.js` ein Rückfall über den Text im Block
(„Variante: …“ → `variante`, „Deine Angaben: …“ → `angaben`), und beide nehmen die Klasse `eba-perso-aus` wieder ab. Für
Tests: `ctx.personalisieren.angabenZeilen(fm, zustand)`, `varianteZeilen(fm)`.
