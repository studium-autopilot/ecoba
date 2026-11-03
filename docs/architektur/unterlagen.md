# Architektur: Unterlagen

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## ILIAS-Unterlagen (seit 0.4.0)

Kursdateien aus ILIAS (Uni Tübingen, ILIAS 10) landen von selbst unter `Unterlagen/`, je mit Begleitnotiz wie beim Einordnen.

| Skript | Aufgabe |
|---|---|
| `ilias-netz.js` | Sitzung mit Keksdose, Weiterleitungen, Drossel, nur https und nur Server der Uni, Grenze je Antwort (`maxBytes`); am PC Node-https aus Electron (Verbindungen bleiben offen, Seiten gzip), auf iPhone/iPad `requestUrl` |
| `ilias-anmeldung.js` | Anmeldung über Shibboleth; Ergebnis `{ ok, passwortGesendet, konto }` (`konto`: Kürzel im Profilbild der Seite, auf der sie endet) bzw. `{ ok: false, grund, hinweis, code, passwortGesendet }` (falsches Passwort, Zustimmung, zweiter Faktor, Netz, unerwartet). `code` = „Stelle · Gerät Version · Spur“ (je Antwort Schritt, Status, Seitenart; bei fremden Seiten die Feldnamen, am PC Server und Pfad; nie Seitentitel, Feldwerte, Query, Kekse oder Zugangsdaten), bei „unerwartet“ und „netz“ im Hinweis; Stellen und Beispiel im Kopf der Datei. Das Passwort geht mit `folgen: false` hinaus; einer Weiterleitung danach folgt die Anmeldung selbst als GET ohne Body (am PC, auch bei 307/308), nur zu den Servern der Sitzung |
| `ilias-html.js` | Kursliste und Kursinhalt aus dem HTML lesen, dazu Kürzel im Profilbild der Metaleiste (`kontoKuerzel`) und Link „Abmelden“ (`abmeldeLink`) (eigener kleiner Leser; linear auch bei feindlichem HTML: offene Elemente je Name gemerkt statt den Stapel abzusuchen, `datum` und `groesse` lesen nur die ersten 500 bzw. 200 Zeichen) |
| `ilias.js` | Zeitplan, Abrufer-Sperre, Durchsuchen, Ablage, Index; `ctx.ilias` für die Oberfläche |
| `unterlagen.js` | Namen „Code Art NN Titel“ (auch Titel aus der ersten PDF-Seite), Ordner, Begleitnotiz |
| `verbindungen.js`, `einrichtung.js` | Zeile, Fenster, Schloss, Knopf auf Unterlagen; Bildschirm 5 der Einrichtung (Uni-Login) |

- **Ablauf:** Sperre → Index lesen, Umbenennungen und Löschungen nachziehen → anmelden (gilt die Sitzung des letzten Laufs
  noch, entfällt das) → Kursliste → aktive Kurse durchsuchen (zwei Seiten zugleich, der älteste Kurs zuerst, Kurs für Kurs)
  → geänderte, dann neue Dateien laden (am PC zwei zugleich, auf iPhone/iPad eine; abgelegt wird eine nach der anderen).
  Automatisch über den gemeinsamen Zeitplan der Quellen (`Q.planen`): 20 s bis gut 2 Min. nach dem Start, dann stündlich, und
  zurück in der App nach über 60 Min. seit dem letzten Versuch; dazu der Knopf.
  Kurse mit Modulcode und Modulnotiz sind beim ersten Mal an, die anderen aus. Nach dem ersten Verbinden (Fenster,
  Einrichtung) startet der erste Abruf gleich, wenn ein Kurs an ist. Ein während des Laufs abgewählter Kurs wird nicht
  mehr durchsucht (eine Seite, die schon unterwegs ist, kommt noch) und nichts mehr aus ihm geladen.
- **Dateien im Tresor (synchronisiert):** `System/Daten/ilias.json` (Index: Kurse mit Wahl, welche ILIAS-Datei wo liegt, seit
  18.10.2026 unter `objekte` je Übung Code und Kurs, nie ihr Titel, für den ILIAS-Kalender; je Eintrag mit Zeitstempel, vor jedem
  Schreiben mit der Platte gemischt) und `System/Daten/ilias-abruf.json` (Abrufer-Sperre
  über `sperre.js`: nur ein Gerät lädt, Übernahme nach 80 Min. Stille wie bei den zentralen Daten, sofort bei `frei: true` nach
  dem Freigeben der Gruppen, siehe [„Deine Übungs- oder Tutoriengruppe“](zentrale-daten.md); ältere Fassungen lesen die Datei weiter, `mobil` ist neu).
- **Pfade im Index** (`pfadOk`): `pfad` und `fassungen` eines Eintrags gelten nur unter `Unterlagen/`, ohne leere, `.`- oder
  `..`-Teile, ohne `\`, mit der Endung des Eintrags (die seiner Datei, ohne Datei die des Namens in ILIAS) und nie mit `js`,
  `mjs`, `cjs`, `css`, `json` oder `md`. `ilias.json` wird synchronisiert und kann von jedem Gerät kommen; ein anderer `pfad`
  wird darum beim Lesen leer (der Eintrag bleibt: nichts wird neu geladen, die Datei bleibt unberührt), eine andere Fassung fällt
  weg. Vor jedem Ersetzen, Löschen, Umbenennen und jeder neuen Fassung daneben prüft der Lauf den Pfad noch einmal. Eine
  verschobene oder fehlende Datei sucht er nur unter `Unterlagen/` (gleiche Größe, Prüfsumme und Endung), nie im übrigen Tresor.
  Verschiebst du eine Datei aus `Unterlagen/` hinaus, zeigt ihr Eintrag auf keine Datei mehr, und solange sich in ILIAS nichts
  ändert, wird nichts neu geladen. Hat ILIAS eine neue Fassung, kommt sie wie eine neue Datei nach `Unterlagen/` (Bericht `neu`);
  deine verschobene Datei bleibt unberührt. Bringst du sie vorher unverändert zurück, findet der Lauf sie wieder und behandelt sie
  wie jede Datei unter `Unterlagen/`. Ebenso gilt ein Pfad, der beim Lesen leer wurde. Da nur unter `Unterlagen/` gesucht wird,
  kann eine neue Datei aus ILIAS, die du schon an anderer Stelle im Tresor hast, unter `Unterlagen/` noch einmal geladen werden.
- **Kurspasswörter (nach bestem Bemühen):** Manche Kurstitel tragen das Beitrittspasswort. `ohneKennwort` prüft eine
  gefaltete Fassung (Entitäten aufgelöst, auch doppelt; unsichtbare Zeichen weg: weiches Trennzeichen, Verbinder,
  Breiten- und Richtungszeichen, Variantenwähler, Tag-Zeichen U+E0000–E007F und Hangul-Füller; NFKC; kyrillische und
  griechische Doppelgänger lateinisch). In jedem Namen und Notiztext aus ILIAS (`textRein`) fallen Tag-Zeichen, Hangul-Füller,
  U+061C und Variantenwähler jenseits von U+FFFF ganz weg; Breiten- und Richtungszeichen werden wie früher zu Leerzeichen, und
  Variantenwähler U+FE00–FE0F bleiben. So heißen Dateien und Ordner mit Emoji im Titel weiter wie bisher und werden nicht
  unter neuem Namen noch einmal geladen. Starke Marken zählen immer, außer als Wortanfang („Passwortsicherheit“):
  Passwort/Password/Kennwort in jeder Schreibweise und als Wortende („Kurspasswort“), Passwd, Pwd, Passw., Kennw.,
  Pass-/Zugangs-/Einschreibecode, Einschreibe-/Zugangsschlüssel, Schlüsselwort, Mot de passe, Enrolment key, Zugangsdaten.
  PW-Formen (PW, P/W, P.W., KursPW) zählen mit Ziffer dahinter, mit „:“/„=“ oder nach einem Trenner („S110 PW-Statistik“
  bleibt). Schwache Wörter (Key, Code, PIN, Pass, Zugang, Login, Secret, Schlüssel, KW) nur mit „:“/„=“ und einem Wert, der wie
  ein Passwort aussieht („Key: Takeaways“ bleibt). Der Titel endet vor der Marke, wenn davor ein Trenner steht oder „:“ folgt;
  sonst bleibt nichts, und der Aufrufer nimmt Code oder „Kurs <Nummer>“ (nie ein leerer Titel). So kommen Titel in den Index,
  die Kursliste, Ordnernamen, die `quelle` der Begleitnotizen und gemerkte Funde (beim Lesen gesäubert). Alte Index-Einträge
  säubert schon das Lesen; nach dem Start (mit dem Zufallsversatz) schreibt `saeubern()` die Datei nur, wenn sich ein Eintrag
  wirklich ändert. Einmal je Gerät mit der Abrufer-Sperre (`eba-ilias-migration`) säubert der Lauf vorhandene Begleitnotizen
  (`quelle`, Zeile „Aus ILIAS:“) und benennt Ordner unter `Unterlagen/` mit Passwort-Marke um (Links und Index ziehen mit).
  Ältere Fassungen auf anderen Geräten können einen rohen Titel zurückschreiben, bis sie aktualisiert sind; in der
  Versionsgeschichte eines Sync-Dienstes bleibt er.
- **Nur auf dem Gerät:** `app.saveLocalStorage` mit `eba-ilias-benutzer`, `eba-ilias-stand`, `eba-ilias-protokoll` (letzte 20
  Läufe), `eba-ilias-auftrag` (offener Abruf, siehe „Weitermachen“), `eba-ilias-schreibt` (Datei, die gerade geschrieben
  wird), `eba-ilias-konto` (Kürzel des ILIAS-Kontos zum Benutzernamen, siehe „Konto der Sitzung“), `eba-geraet`. Das Passwort nur im Schlüsselbund von Obsidian (`app.secretStorage`, seit Obsidian 1.11.4), Eintrag
  `studium-autopilot-ilias-<Prüfsumme des Tresornamens>` (iOS teilt den Schlüsselbund zwischen Tresoren). Die Oberfläche
  gibt das Passwort nur als Funktion an `zugangSpeichern(benutzer, geber, { pruefen: true })` weiter und leert das Feld danach;
  es steht nie in Status, Protokoll, Hinweisen oder Konsole.
- **Warnungen eines Laufs** (seit 0.4.5): fehlende Dateien (Sync läuft noch), keine Übungsgruppen mehr in ILIAS, Gruppen oder
  Ordner, die sich nicht prüfen bzw. umbenennen ließen. Klar formuliert im Stand (`warnung`), bis ein Lauf ohne Warnung kommt:
  `status().text` hängt sie an „Aktualisiert …“ bzw. „Prüft deine Übungsgruppen …“ (Zeile und Fenster unter Verbindungen, die
  Zeile mit Warnsymbol), der Hinweis nach **Aktualisieren** ebenso, dazu ein Punkt „**ILIAS** · …“ in „Bitte prüfen“ auf dem
  Dashboard (Meldekanal, `hinweiseAus`; ebenso eine abgelehnte Anmeldung). Technische Einzelheiten nur im Geräte-Protokoll
  (`technik`). `status()` hat die gemeinsame Form der Quellen (`zustand`: an, laeuft, fehler, abgelehnt, anderes-geraet,
  nicht-verbunden, ohne-anmeldung, extern; `geprueft` = letzter Erfolg, `warnungen`).
- **Ablage:** Byte-gleiche Datei schon da → nur merken. Nie überschreiben (sonst „ (2)“). In ILIAS geändert und im Tresor
  unverändert → ersetzen; die Notiz bekommt `aktualisiert`, eine zur neuen Größe passende PDF-Ansicht (eingebettet oder nur
  verlinkt), keine alte Seitenzahl, und ein ausgefülltes „## Das Wichtigste“ heißt danach „## Das Wichtigste (frühere Fassung,
  bis TT.MM.JJJJ)“: Es bleibt stehen, und „Zusammenfassen“ ist für die neue Fassung wieder da (`nachErsetzen`; Zu tun, Offene
  Fragen und dein Text bleiben). Von dir verändert → deine bleibt, die neue kommt daneben als „… neue Fassung JJJJ-MM-TT“; ist
  diese Kopie bei der nächsten Fassung noch unverändert, wird sie ersetzt statt einer weiteren. Seit 0.6.9 bekommt die Notiz der
  Kopie die Zusammenfassung deiner Notiz als frühere Fassung; seit 24.10.2026 sagt sie im Kasten „Neue Fassung aus ILIAS“, dass sie
  die neue ist, und verlinkt deine, deine Notiz im Kasten „Deine bearbeitete Fassung“ die neue (siehe „Neue Fassung einer
  Unterlage“). Gelöscht bleibt gelöscht, auch
  wenn ILIAS dieselbe Datei unter neuer Kennung wieder hochlädt (gleiche Prüfsumme wie ein gelöschter Eintrag). Umbenennen und
  Verschieben im Tresor folgt der Index; in ILIAS umbenannt oder verschoben (gleiche Kennung) → Index (`original`,
  `iliasPfad`, `kurs`) und Notiz (`original`, `quelle`, nur wo noch der alte Wert steht), ohne Download.
- **Objektgruppen und Bereich** (seit 03.11.2026): ILIAS fasst Einträge eines Kurses zu Objektgruppen zusammen (Block mit
  Überschrift, Feld `gruppe` aus `ilias-html.js`), in S100 etwa „Tutoriengruppen“ über „Gruppe 4: Dienstag 10 - 12“. Der Lauf
  führt die Ordnerkette darum zweimal: `pfad` wie bisher und `mitBlock` mit den Objektgruppen (wie PFERD im Uni-Abgleich). Ergibt
  der Einordner mit `mitBlock` den Bereich Tutorium oder Lab (`bereichAusBlock`), benennt `benennen` die Datei damit; sonst bleibt
  `pfad`, damit eine Objektgruppe wie „00 - Vorlesung“ nicht als Rückfall die Art bestimmt (Verständnisfragen würden sonst Folien).
  Im `iliasPfad` und in `quelle` steht die Objektgruppe nicht, sonst änderten sich beide für alle vorhandenen Unterlagen. Bis
  02.11.2026 sah der Lauf die Objektgruppe nicht, und Blätter aus einer Tutoriumsgruppe ohne „Tutorium“ im Namen landeten als
  Übung im Modulordner. Für sie setzt `notizenNachziehen` die Art in der Notiz auf den Bereich (`bereichMerken`, nur wo noch die
  damals bestimmte Art steht); Datei und Name bleiben. Echter Lauf am 03.11.2026 (Probe gegen ILIAS): genau zwei S100-Blätter
  wechseln den Bereich, sonst keine der 112 Dateien.
- **Nicht mehr in ILIAS:** Hat ein Lauf einen Kurs ganz und ohne Ordnerfehler durchsucht und eine Datei des Index nirgends
  gesehen, bekommt ihr Eintrag `entfernt` (Datum) und ihre Notiz den Kasten „Nicht mehr in ILIAS“; die Datei bleibt. Wieder
  gesehen → Marke und Kasten weg. Ebenso zu große Dateien (`ignoriert`, mit `kurs`). Ein Kurs, in dem gar nichts zu sehen war,
  zählt nicht. Was in einem übersprungenen Behälter lag (spätere Sitzung, Sitzung ohne Materialien, Gruppe ohne
  Mitgliedschaft, zu tief; `r.ausgelassen`, Vergleich über `iliasPfad`), gilt nicht als nicht gesehen. Fehlen in einem Kurs
  mehr als die Hälfte und mehr als 10 auf einmal → in diesem Kurs nichts gemerkt, Warnung (`entfernteMerken`, Schutz je Kurs).
- **Dateitypen:** Nie geladen werden Dateien, die in Obsidian zu Notizen oder Ansichten würden (`md`, `base`, `canvas`), die
  Obsidian oder das Plugin als eigene Dateien liest (`js`, `mjs`, `cjs`, `css`, `json`; `pfadOk` nimmt sie nie als Ziel) und, als
  zusätzliche Vorsicht, was Windows oder macOS beim Öffnen ausführt, startet, installiert, einbindet oder als Laufwerk öffnet
  (`AUSFUEHRBAR`: `exe`, `com`,
  `bat`, `cmd`, `ps1`, `psm1`, `vbs`, `vbe`, `js`, `jse`, `wsf`, `wsh`, `ws`, `hta`, `scr`, `msi`, `msp`, `lnk`, `url`, `pif`,
  `cpl`, `reg`, `scf`, `inf`, `chm`, `xll`, `msc`, `iso`, `img`, `vhd`, `vhdx`, `appx`, `msix`, `appinstaller`, `application`,
  `appref-ms`, `diagcab`, `settingcontent-ms`, `library-ms`, `search-ms`; für macOS seit 02.11.2026 `command`, `tool`,
  `terminal`, `webloc`, `fileloc`, `inetloc`, `app`, `pkg`, `mpkg`, `dmg`, `scpt`, `scptd`, `applescript`, `workflow`, `action`,
  `shortcut`, `mobileconfig`, `prefpane`, `saver`, `kext`, `plugin`, `osax`, `bundle`, `dylib`, `wflow`, `xpc`; geprüft an der Endung aus ILIAS und am Ende des
  Namens, `nieLaden`). Sie zählen wie andere übersprungene Dateien (`uebersprungen`) und gelten als gesehen: Eine früher
  geladene bleibt, wie sie ist, ohne Kasten „Nicht mehr in ILIAS“. Dieselbe Regel gilt für gemerkte Funde früherer Läufe
  (`fundeLesen`), und `neuAblegen` legt eine neue Datei nur ab, wenn ihr Pfad `pfadOk` erfüllt.
  Kursdateien wie `.py`, `.R`, `.ipynb` oder `.jar` kommen weiter.
- **Grenzen:** keine Videos, Foren, Tests; Dateien über 50 MB nicht (die Zeile nennt ihre Zahl, solange die Datei in ILIAS
  ist und ihr Kurs an). Das gilt auch für eine geänderte Datei (deine bleibt, die Angaben aus ILIAS werden gemerkt, damit sie
  nicht bei jedem Lauf neu versucht wird) und für Dateien ohne Größe in der Liste: Der Download bricht ab, sobald mehr als
  50 MB kommen (am PC unterwegs, auch entpackt, auf iPhone/iPad nach dem Empfang; `maxBytes`, Fehler `zu-gross` in
  `ilias-netz.js`, Vorgabe ohne Angabe 20 MB für Seiten und 100 MB für Dateien). Auf iPhone/iPad liefert `requestUrl` die
  Antwort erst ganz und lässt sich nicht abbrechen; vor dem Download einer Datei ohne Größe in der Liste oder einer geänderten
  fragt der Lauf dort darum erst nach ihrer Größe (`groesseVorab`, `q.groesse`: `HEAD` auf denselben Download-Link,
  `Content-Length`; eine Anfrage mehr je solcher Datei). Über 50 MB → nicht geladen, wie oben gemerkt. Ohne Angabe, bei einer
  Seite statt der Datei oder einem Fehler bleibt die Größe unbekannt, und die Datei kommt wie bisher (verworfen erst nach dem
  Empfang). Wie ILIAS auf `HEAD` antwortet, ist noch nicht an echten Seiten geprüft. Je Lauf höchstens 400 Seiten
  und 150 Downloads auf iPhone/iPad, 400 am PC (der erste Abruf braucht so meist nur einen Lauf), zusammen höchstens 250 MB
  auf iPhone/iPad und 1000 MB am PC (`BUDGET_MOBIL_MB`, `BUDGET_PC_MB`: Speicher und Sync; gezählt wird, was geladen ist, und
  was unterwegs ist, mit der Größe aus der Liste; die erste Datei eines Laufs kommt immer). Was über einer Grenze liegt, zählt
  als `rest` und kommt mit dem nächsten Stapel bzw. Lauf („… weitere folgen gleich.“); automatische Läufe
  durchsuchen einen Kurs höchstens alle 3 Std. Lehnt die Uni die Anmeldung ab, gibt es keine automatischen Versuche mehr, bis
  du den Zugang neu eingibst. Kam nach dem Absenden des Passworts eine unbekannte Seite (`grund: unerwartet` mit
  `passwortGesendet`, Bericht `unklar`; etwa eine eigene Seite der Uni für ein gesperrtes Konto, die als falsches Passwort nicht
  erkennbar ist), versucht dieses Gerät es 24 Std. nicht von selbst (`PAUSE_UNKLAR`, `pauseBis` im Stand, wie Alma nach
  unerwarteten Antworten; automatische Läufe enden als `pause`, ebenso ein neuer Kalender-Link im Hintergrund,
  `kalenderLinks({ automatisch: true })` aus `uni-login.js` → `erneuern`), damit wiederholte Versuche mit demselben Passwort das Konto nicht
  sperren. Zeile und Fenster sagen es („Die Anmeldeseite der Uni sah anders aus als erwartet. Von selbst versucht Studium Autopilot
  es erst morgen wieder, mit Aktualisieren gleich.“), der Code steht weiter im Fenster. **Aktualisieren** versucht es gleich, ein
  Erfolg oder neues Verbinden hebt die Pause auf. Die Pause gilt je Gerät wie bei Alma: Jedes andere Gerät versucht es höchstens
  einmal, bevor es selbst pausiert.
- **Last für die Uni:** Die Drossel der Sitzung (`N.drossel`, `ilias-netz.js`) lässt höchstens 2 Anfragen gleichzeitig zu und
  startet sie mindestens 400 ms auseinander (höchstens 2,5 je Sekunde; eine Anfrage hält ihren Platz samt Weiterleitungen).
  Zum Vergleich PFERD mit Standard-Einstellung: eine Anfrage nach der anderen ohne Pause, bei uns gut 3,5 je Sekunde. ILIAS
  liefert weder `Last-Modified` noch `ETag` und bei Ordnern kein Änderungsdatum; unveränderte Ordner lassen sich darum nicht
  überspringen, durchsucht wird je Kurs höchstens alle 3 Std. (Knopf: alle).
- **Weniger Anfragen** (gemessen am echten Konto 17.10.2026, vorher 329 HTTP-Anfragen mit 148 Weiterleitungen für 60 Dateien):
  Permalinks `goto.php/<typ>/<ref>` leitet ILIAS zweimal weiter. Ordner, Gruppen und Kurse holt `quelleAusNetz` darum über
  die Adresse ihres Reiters „Inhalt“ (`H.inhaltReiter`, mit `cmdNode`), die es an der ersten Seite jeder Art lernt und mit der
  neuen `ref_id` füllt; passt sie nicht (Serverfehler, kein Zugriff, wo der Permalink geht), bleibt es in dieser Sitzung beim
  Permalink. Nicht geholt: Sitzungen mehr als 7 Tage voraus, Sitzungen ohne jede Eigenschaft in der Liste (wer Materialien
  hat, trägt „Materialien zur Sitzung: N“; ohne Eigenschaft war die Seite bei allen Messungen leer) und Gruppen, in denen du
  nicht Mitglied bist (`mitglied: false`, ILIAS zeigt dort nur die Beitrittsseite). Die Anmeldung prüft die Seite, auf der
  ihre Weiterleitungen enden, statt das Dashboard eigens zu holen. Die Sitzung (Kekse am PC, Drossel, gelernte Adressen)
  bleibt über Läufe im Speicher des Geräts (nie gespeichert); ob sie noch gilt, zeigt die erste Seite (sonst einmal
  anmelden, gleichzeitige Anfragen warten auf dieselbe Anmeldung). Weg ist sie beim Trennen, nach gescheiterter Anmeldung,
  bei anderem Benutzernamen und beim Entladen. Das Prüfen beim Verbinden meldet sich immer neu an, auf iPhone und iPad nach
  dem Abmelden (siehe „Konto der Sitzung“).
  Ergebnis: erster Abruf am PC 64 s statt 181 s (173 statt 329 Anfragen, 16 Weiterleitungen), auf iPhone/iPad (nachgebildet)
  1 Lauf in 64 s statt 3 Läufen in 274 s samt Stapelpausen; erneutes Durchsuchen ohne Neues 38 s statt 135 s (98 statt 269
  Anfragen, keine Anmeldung).
- **Eigener Uni-Abgleich** (`eba.quelleExtern`, Schlüssel `ilias-dateien` und `ilias-gruppen`, siehe [„Quellen außerhalb des
  Plugins“](quellen.md)): Kommen die Dateien von außen (ohne Liste: `System/Skripte/abgleich.js` im Tresor oder `ilias_unterlagen: extern`),
  lädt `ilias.js` nie Dateien (Status `K.TEXT_EXTERN` „Deine Unterlagen kommen über deinen Uni-Abgleich.“), kein Schloss.
  Kommen auch die Übungsgruppen von außen, läuft ILIAS gar nicht (nicht `bereit`, `status().gruppenExtern`; die Zeile zeigt nur
  den Satz, mit gespeichertem Zugang den Textlink Trennen); nur die Übungsgruppen von außen: Dateien wie immer, kein
  Gruppenabgleich. Mit ILIAS-Zugang prüft es sonst nur die Übungsgruppen (Lauf `nur-gruppen`, Status „Prüft deine Übungsgruppen,
  zuletzt vor 5 Min. …“), ohne Auftrag: kein Weitermachen nach Fehlern, keine Stapel; ein Auftrag von früher wird verworfen
  und sein Weitermachen läuft still. Der Hinweis „Übungsgruppen aus ILIAS geprüft.“ kommt so nur nach deinem Tipp
  (Aktualisieren, Verbinden), nie vom stündlichen Prüfen.
- **Fortschritt:** Ereignisse über `beobachten(fn)`: `start { manuell, weiter }`, `fortschritt { phase, text, erledigt,
  gesamt, code }`, `fertig { manuell, ergebnis, text, weiterIn }`. Nie Kurs- oder Dateinamen (Kurstitel können
  Einschreibepasswörter enthalten), höchstens der Modulcode. `fortschrittAnzeige(x, weiter)` macht daraus die Texte: Zeile
  und Fenster „Lädt 12 von 40“, Knopf auf Unterlagen ebenso (sonst „Lädt …“), Hinweis „ILIAS · 12 von 40“ bzw.
  „ILIAS · weiter: 26 von 40“, dazu der Anteil für den Balken. Läuft ein Abruf, den du gestartet hast (Knopf in Fenster,
  Zeile oder auf Unterlagen, Einrichtung), zeigt `ilias.js` genau **einen** Hinweis (`ctx.hinweis` mit `dauer: 0`)
  mit Text, **Stoppen** und dünnem Balken und ändert ihn an Ort und Stelle. Gewählt, weil Obsidian Hinweise auf iPhone und
  iPad oben über die volle Breite zeigt (keine Statusleiste nötig, nichts verdeckt Eingabefelder oder die Leiste unten) und
  am PC oben rechts; Wegtippen ist eingebaut. Wegtippen blendet ihn nur aus, ein weiterer Knopfdruck zeigt ihn wieder. Am
  Ende verschwindet er, dann kommt der Hinweis zum Ergebnis („12 neue Dateien aus ILIAS in Unterlagen.“, „Keine neuen
  Dateien in ILIAS.“, bei einem Fehler ein Satz ohne den Fehlertext, der in Zeile und Fenster steht). Automatische Läufe bleiben still. Er hängt am Motor, nicht an einer Ansicht, und wird
  beim Entladen über `ctx.aufraeumen` geschlossen. Ein Knopf während eines automatischen Laufs übernimmt diesen Lauf.
- **Weitermachen:** Ein Abruf, den du startest, legt einen **Auftrag** an (nur auf diesem Gerät, nie synchronisiert, damit
  andere Geräte nicht darauf reagieren). Nach jedem Lauf entscheidet `naechsterSchritt(auftrag, bericht)`: Dateien übrig
  (Grenze je Lauf) oder Kurse wegen der Seiten-Grenze offen → nächster Stapel nach 20 s (höchstens 10 Stapel); Fehler
  (z. B. kein Netz) → neuer Versuch nach 1, 5, 15 Min., danach nur noch stündlich; Plugin neu geladen → weiter beim Start;
  alles da → Auftrag erledigt. Nie weiter nach abgelehnter Anmeldung, Zustimmung, zweitem Faktor, unbekannter Seite nach dem
  Passwort (`unklar`), Trennen, **Stoppen** oder wenn ein anderes Gerät lädt. Offener Auftrag beim Start: weiter nach 20–60 s; zurück in der App: sofort, und ein Lauf ohne
  Regung seit 2 Min. (`abgestorben`; iPhone und iPad halten Skripte im Hintergrund an) wird verworfen und neu gestartet.
  Auf iPhone/iPad nach mehr als 10 s im Hintergrund: Regt sich ein Lauf mit Auftrag auch 10 s nach der Rückkehr nicht (seine
  Anfrage hat iOS liegen lassen), wird er gleich verworfen und der Auftrag macht weiter, statt bis zur Zeitgrenze zu warten.
  Jeder Lauf hat ein eigenes Stopp-Zeichen; ein verworfener, der später aufwacht, schreibt nichts mehr. Fortgesetzte Läufe
  zeigen den Hinweis wie der Knopf und zählen über die Stapel weiter, durchsuchen aber wie automatische Läufe nur Kurse, die
  nicht in den letzten 3 Std. ganz durchsucht wurden; der Knopf durchsucht alle.
- **Funde:** Was das Durchsuchen findet und noch nicht geladen ist, merkt sich das Gerät nach jedem Kurs (`eba-ilias-funde`,
  gerätelokal; vom ILIAS-Eintrag nur, was der Download braucht, keine Titel). Der nächste Lauf übernimmt die Funde der Kurse,
  die er nicht neu durchsucht, und prüft sie gegen den Index (schon geladen, gelöscht, zu groß → weg). So fängt ein Abruf,
  den iPhone oder iPad im Hintergrund angehalten haben, beim nächsten Öffnen nicht von vorn an, der nächste Stapel lädt ohne
  neues Durchsuchen, und der Rest über der Grenze je Lauf wartet nicht mehr bis zur nächsten Durchsuchung. Ein gestoppter
  oder verworfener Lauf schreibt keine Funde; Trennen löscht sie. Fehlen gemerkte Funde ganz (nach Trennen oder einem Update
  mitten im Abruf), durchsucht ein fortgesetzter Lauf wieder alle Kurse. Gibt es einen gemerkten Fund in ILIAS nicht mehr
  (HTTP 404/410), zählt er nicht als Fehler (keine Grenze von 3 Fehlern je Lauf) und fällt aus den Funden.
- **Zeitgrenzen auf iPhone/iPad:** `requestUrl` meldet keinen Fortschritt und kehrt manchmal nie zurück, wenn iOS eine
  Anfrage beim Wechsel in den Hintergrund liegen lässt. `transportMobil` bricht darum eine Seite nach 60 s und eine Datei
  nach 5 Min. ab (Fehler `zeitueberschreitung`, ohne Status: der Lauf endet, der Auftrag versucht es nach 1 Min. neu).
- **Absturz beim Schreiben:** Vor dem Schreiben einer Datei merkt sich das Gerät `{ id, pfad, art }`, nach dem Index ist es
  leer. Steht beim nächsten Lauf noch etwas da, war die Datei unfertig: Eine neue, nicht im Index, wird samt Notiz gelöscht und
  neu geladen (sonst bliebe sie halb, und daneben käme „ (2)“); eine halb ersetzte bekommt ihre Prüfsumme in den Index, damit
  der nächste Lauf sie ersetzt, statt sie für deine Änderung zu halten.
- **Oberfläche:** Zeile und Fenster lesen `ctx.ilias.status()` (fertiger Text, dazu `verbunden`, `gesperrt`, `laeuft`,
  `anderes`, `fortschritt` …); während eines Abrufs ändern Fortschritts-Ereignisse nur die Zeile und den Knopf auf Unterlagen
  (`ctx.verbindungen.iliasStand()`), statt alles neu zu zeichnen. Läuft ein Abruf, zeigt das Fenster den Stand, „Du kannst
  das Fenster schließen. Lass Obsidian dabei offen, sonst pausiert der Abruf bis zum nächsten Öffnen.“ (iPhone/iPad: „im
  Vordergrund“ statt „offen“) und die Knöpfe Schließen und Stoppen. Das Fenster zeigt nicht verbunden Schritte, zwei Felder (kein Autofokus auf
  iPhone/iPad), die Datenschutz-Zeile und die Hinweise der Anmeldung wörtlich; verbunden Stand, Kurse mit Schaltern
  (`kursSetzen`), Aktualisieren und Trennen (`zugangLoeschen`; Dateien bleiben, deine Übungsgruppe bleibt als gewählte Notiz).
  Kurstitel nur dort und nie in Hinweisen.
- **Uni-Zugang** (seit 0.4.5, gilt auch für Noten & Anmeldungen): Lehnt die Uni ein **gespeichertes** Passwort eindeutig ab
  (`zugang-falsch`), schreibt das Gerät `System/Daten/uni-zugang.json` `{ abgelehnt, dienst, geraet }` (synchronisiert, ohne
  Benutzername und Passwort). Jedes Gerät, dessen Passwort älter ist (gerätelokal `eba-uni-zugang-seit`), meldet sich danach
  nirgends mehr an, auch nicht per Knopf (`abgelehnt`, Text „Anmeldung abgelehnt. Bitte dein Passwort neu eingeben.“), bis man
  es dort neu eingibt; die Neueingabe prüft genau einmal. War das Passwort beim Ablehnen noch `ungeprueft` (siehe unten),
  hält nur dieses Gerät an (gerätelokal `eba-uni-zugang-abgelehnt-hier`, gleiche Wirkung, Trennen und Neueingabe heben es
  auf): Es könnte ein anderes sein als auf deinen übrigen Geräten, die es darum mit ihrem weiter versuchen. Ein im Fenster vertipptes Passwort schreibt keinen Marker. So scheitert
  nach einem Passwortwechsel im Normalfall nur ein Gerät, sobald der Marker per Sync da ist. `eba-uni-zugang-ok` = letzte
  ILIAS-Anmeldung, die dieses Passwort wirklich gesendet hat und angenommen bekam (`passwortGesendet` aus `ilias-anmeldung.js`;
  auch nach dem Update gesetzt, sobald ein Lauf so klappt; ein neues Passwort löscht den alten Wert). Gilt auf dem Gerät noch eine
  Sitzung bei ILIAS oder der Uni (auf iPhone und iPad hält das Gerät die Kekse selbst, auf einem geteilten iPad womöglich die einer
  anderen Person), klappt die Anmeldung ohne Passwort, und es bleibt `ungeprueft` (`eba-uni-zugang-ungeprueft`), die
  prüfende Anmeldung beim Verbinden gibt `{ ok: true, ungeprueft: true, hinweis }` zurück und zeigt den Hinweis „Dein Passwort ist
  gespeichert. ILIAS hat es diesmal nicht geprüft, …“, und Alma und das Webmail prüfen es selbst mit einer eigenen Anmeldung
  (eine bestehende Sitzung melden sie dafür erst ab). `ctx.ilias.uniZugang()` → `{ benutzer, seit, ok, abgelehnt, dienst,
  gesperrt, bestaetigt, ungeprueft }`, `ctx.ilias.zugangAbgelehnt(dienst)` schreibt den Marker (ungeprüft nur für dieses Gerät).
  Bestätigt wird ein Passwort nur von einer Anmeldung, die es gesendet hat (`zugangGeprueft(passwortGesendet)`); damit das beim
  Verbinden auch auf iPhone und iPad klappt, meldet sich die prüfende Anmeldung dort erst ab (siehe „Konto der Sitzung“).
- **Konto der Sitzung** (seit 02.11.2026, `quelleAusNetz` in `ilias.js`): Auf iPhone und iPad hält das Gerät die Kekse, auf einem
  geteilten iPad womöglich die Sitzung einer anderen Person (ILIAS oder IdP). Zwei Schutzschichten:
  - **Abmelden** (`beiUniAbmelden`): der Link „Abmelden“ der Metaleiste (`abmeldeLink`, Ovidius 10/2026:
    `ilias.php?baseClass=ilstartupgui&cmd=doLogout&rtoken=…`; ohne Seite das Dashboard), dann `Shibboleth.sso/Logout` auf dem
    ILIAS-Server (Sitzung des Shibboleth-SP; mit ihr meldete `shib_login.php` sonst ohne IdP wieder an) und `idp/profile/Logout`
    beim IdP. Nur Server der Sitzung, jeder Fehler egal. Vor der prüfenden Anmeldung beim Verbinden auf iPhone und iPad
    (`quelle(…, { abmelden: true })`; am PC beginnt diese Sitzung ohne Kekse) und beim **Trennen** (`abh.abmelden` =
    `uniAbmelden`: am PC die gemerkte Sitzung, auf iPhone und iPad sonst eine neue; das Trennen wartet nicht darauf, eine neue
    Quelle schon). Die beiden Abmelde-Adressen von SP und IdP sind die üblichen von Shibboleth, an Ovidius noch nicht geprüft;
    den Link „Abmelden“ zeigen die erfassten echten Seiten.
  - **Kürzel vergleichen** (`kontoPruefen`): Den Uni-Login zeigt keine ILIAS-Seite (ILIAS führt eigene Benutzernamen), nur das
    Profilbild aus Buchstaben in der Metaleiste trägt ein Kürzel aus zwei Zeichen (`kontoKuerzel`, Profilbilder in Foren und
    Mitgliederlisten zählen nicht); ein Foto als Profilbild gilt als eigenes Kürzel `#foto`, eine Metaleiste ohne erkennbares
    Profilbild als „nichts zu sehen“ (`""`), eine Seite ohne Metaleiste als `null`. Nach einer Anmeldung, die dein Passwort
    gesendet hat, merkt sich das Gerät das Kürzel zum Benutzernamen (`eba-ilias-konto`, aus `konto` der Anmeldung und von der
    ersten Seite). Jede andere Sitzung (die gemerkte, oder die Anmeldung kam ohne Passwort aus) muss dasselbe Kürzel zeigen
    (Foto gegen Buchstaben ist ein anderes Konto). Geprüft ist sie erst an einer Seite mit Metaleiste; zeigt die geholte Seite
    keine, kommt sie erst nach der Prüfung am Dashboard zurück, ebenso vor einem Download und vor der Frage nach seiner Größe
    (`kontoVorDatei`). Sonst: abmelden, nichts lesen, jede weitere Anfrage dieser Quelle wirft (`art: "fremd"`, `grund:
    "fremde-sitzung"`); der Lauf endet als Fehler mit dem Hinweis „ILIAS war auf diesem Gerät mit einem anderen Konto
    angemeldet. …“, der nächste meldet sich mit deinem Passwort an. Ist auf iPhone oder iPad noch kein Kürzel gemerkt (nach dem
    Update, nach Trennen, nach einer Prüfung ohne Passwort) und kam die Sitzung ohne Passwort aus, meldet die Quelle sie vor dem
    ersten Lesen ab und sich einmal mit deinem Passwort neu an (`erzwungen`; zählt nicht gegen die zwei Anmeldungen je Quelle).
    Grenzen: Zwei Zeichen können bei zwei Konten gleich sein, zwei Fotos ebenso; kommt auch die erzwungene Anmeldung ohne
    Passwort aus (das Abmelden wirkte nicht), gilt die Sitzung wie bisher. Trennen löscht das Kürzel.
  Tests: `tests/ilias-konto.test.js` (erfundene Seite `anderes-konto.html`), `tests/ilias-html.test.js`.
- **Tests:** `tests/ilias.test.js` (ganzer Ablauf mit erfundenem ILIAS und Tresor im Speicher, `tests/ilias-attrappen.js`;
  dazu Gleichzeitigkeit, nicht geholte Sitzungen und Gruppen, Sitzung über Läufe, gelernte Adressen),
  `ilias-weiter.test.js` (Fortschrittstexte, Ereignisse, Auftrag und Weitermachen, toter Lauf, Funde, Absturz beim Schreiben),
  `ilias-netz.test.js` (mit Drossel und PC-Transport), `ilias-anmeldung.test.js` (nachgespielter Server), `ilias-html.test.js`. In Obsidian ersetzen
  `ctx.ilias.anmeldungSetzen(fn)` und `ctx.ilias.quelleSetzen(fn)` Anmeldung und ILIAS (`null` = wieder echt);
  `plugin.testIliasAus = true` schaltet den stündlichen Lauf ab (das Weitermachen eines offenen Auftrags nicht).

## Volltext der PDFs (seit 0.4.5, `volltext.js`)

Zu jeder PDF unter `Unterlagen/` legt das Plugin eine Textfassung an, damit die Suche von Obsidian Wörter aus den PDFs findet,
auch auf iPhone und iPad. pdf.js von Obsidian (`loadPdfJs`) liest die Textebene auf dem Gerät; nichts geht ins Netz, keine
Texterkennung.

- **Notiz** `Unterlagen/_Volltext/<Name> (Volltext).md`, bei gleichem Namen aus einem anderen Modulordner
  `<Name> (Volltext, <Code>).md` (dann `<Code> 2` …). Frontmatter `typ: volltext`, **`volltext_von: plugin`** (Besitzmarke),
  `fassung`, `datei`, `unterlage` (nur mit Begleitnotiz), `quelle` (Pfad der PDF), `seiten`, `groesse`, `pdf_sha256`,
  `ergebnis` (`text`, `gekuerzt`, `kein-text`, `geschuetzt`, `nicht-lesbar`, `zu-gross`), nach einer neuen Fassung der PDF
  `vorher_sha256`, `geaendert` und `entfallen` (seit 0.6.9, siehe „Neue Fassung einer Unterlage“), `cssclasses: [eba-s-begleitnotiz,
  eba-s-volltext]`. Darunter je Seite mit Text eine eingeklappte Karte `> [!eba-quelle]- [[X.pdf#page=N|S. N]]` (Links über
  `generateMarkdownLink` bzw. `fileToLinktext`). Kein Zeitstempel: Dieselbe PDF ergibt auf jedem Gerät dieselbe Notiz. Scans,
  geschützte und kaputte PDFs bekommen eine kurze Notiz mit Hinweis (`eba-info`), damit sie nicht bei jedem Lauf neu versucht
  werden.
- **Entschärfen** (`entschaerfen`, seit `fassung` 2 vom 01.11.2026): Aus Text einer PDF wird kein Link in die App
  (`obsidian://`) oder auf Dateien (`file://`), kein Bild, kein Code und kein Kasten, denn ein Link in einer Notiz öffnet sich
  ohne Rückfrage. Nackte Webadressen (`https://`) bleiben anklickbar, das ist gewollt. Jede eckige Klammer und jedes `&` bekommt ein
  `\` (kein Markdown-Link, kein Bild, kein Verweis „[x]: Ziel“, keine Zeichenreferenz wie `&#58;`), `<` vor Buchstaben wird `&lt;` (kein
  HTML, kein Autolink), Backticks und `~~~` am Zeilenanfang bekommen ein `\` (kein Codeblock, der den Absatz beendet), dazu keine
  Templater-Befehle, Tags, Aufgaben, Formeln, Kommentare, Überschriften, Listen (auch „1)“), Block-ids, `obsidian://` und `file://`
  → `obsidian\://` bzw. `file\://`, `::` → `:\:` (keine Inline-Felder); Trennungen am Zeilenende zusammengefügt, unsichtbare
  Zeichen (Breite null, Richtungszeichen, Variantenwähler, Tag-Zeichen, Hangul-Füller) weg. Die Wörter bleiben, wie sie sind,
  die Suche findet sie also weiter. Den Titel in der
  Kopfzeile (Name der PDF) entschärft `kopfRein` genauso, in einer Zeile. Aus Volltext-Notizen entstehen darum keine To-dos.
  Textfassungen mit Text und `fassung` 1 schreibt `planen` als Aufgabe „fassung“ nach und nach neu (nach allem Neuen, ohne „folgt“ in der
  Zeile); eine umbenannte behält bis dahin ihre `fassung`. Damit eine neue Fassung der PDF über einer alten Notiz gleiche Seiten
  nicht als geändert meldet, vergleicht `vorherVon` beide ohne diese Escapes (`vergleichbar`).
- **Nur eigene Notizen:** Geschrieben, umbenannt oder gelöscht wird nur eine Notiz mit Besitzmarke, geprüft im Text der Datei
  (nicht nur im metadataCache). Liegt unter `Unterlagen/` eine Notiz `typ: volltext` ohne Marke (z. B. vom eigenen
  Uni-Abgleich) oder in `_Volltext/` eine andere Datei, bleibt Volltext für diesen Tresor aus („Kommt über einen anderen Weg
  (andere Textfassungen im Tresor).“). Kommt so eine Notiz mitten im Lauf per Sync, hört er vor der nächsten PDF auf; eigene
  Notizen bleiben stehen, die fremden gewinnen.
- **Wann:** Einstellung `volltext` in `System/Einstellungen.md` (fehlt oder `an` = an, `aus` = aus; `ctx.volltext.setzen`),
  `eba.quelleExtern("volltext")` falsch (siehe [„Quellen außerhalb des Plugins“](quellen.md)) und keine fremde Textfassung, geprüft bei jedem
  Lauf. Der erste Lauf kommt, wenn der metadataCache eingelesen ist und 5 Min. keine neue Datei im Tresor ankam (Erstabgleich
  eines neuen Geräts, ILIAS-Downloads); danach bei neuen, geänderten, umbenannten oder gelöschten PDFs (nach 60 s Ruhe; eine
  PDF, die jünger als 60 s ist, wartet), alle 30 Min., zurück in der App nach über 30 Min. und mit `nachholen()`. Erreicht ein
  Lauf sein Budget, folgt der nächste nach 60 s (höchstens 10 hintereinander). Alles über den gemeinsamen Zeitplan der Quellen
  (`Q.planen`; die Ruhezeit und den nächsten Stapel gibt der Lauf selbst als `naechster` zurück).
- **Ein Schreiber** (`System/Daten/volltext-abruf.json`, `{ geraet, seit, zuletzt, mobil }`): die gemeinsame Abrufer-Sperre
  (`sperre.js`; Übernahme nach 80 Min. Stille, Puls höchstens alle 50 Min.), dazu Computer-Vorrang: Ein Computer löst ein
  iPhone oder iPad sofort ab, das nach der aktuellen PDF aufhört. Die Sperre entsteht nur in Tresoren mit PDFs oder eigenen
  Textfassungen; die leere Vorlage bleibt unberührt.
- **Neu oder aktuell** (`planen`): Notiz fehlt, Größe anders oder bekannte Prüfsumme anders → neu lesen; gleiche Größe ohne
  bekannte Prüfsumme → aktuell (ein neues Gerät liest keine PDF neu). Prüfsummen aus `ilias.json` (bei gleicher Größe) oder
  aus dem Gerätespeicher (Größe und Änderungszeit gleich); eine auf diesem Gerät geänderte PDF gleicher Größe wird einmal
  gehasht. Notiz ohne PDF: PDF gleicher Größe und Prüfsumme ohne Notiz → Notiz umbenennen (Name, Quelle, Links; Text bleibt,
  die PDF wird nicht neu gelesen, eine Marke „(PDF fehlt)“ fällt weg). Doppel derselben PDF (Konfliktkopien) gehen sofort.
  Neue `fassung` → Notizen mit Text (`ergebnis` `text` oder `gekuerzt`) nach und nach neu, nach allem Neuen; Scans,
  geschützte, kaputte und zu große PDFs liest das Plugin dafür nicht noch einmal. Aktuelle Notiz ohne `unterlage`, deren Begleitnotiz inzwischen da ist
  (kam nach der Textfassung) → Link nachtragen wie beim Umbenennen, ohne die PDF neu zu lesen (`verknuepfen`).
- **Notiz ohne PDF** (seit 0.4.6, `waisenPruefen`): Fehlt die PDF nur auf diesem Gerät (noch nicht angekommen, anderer
  Sync-Umfang, Platzhalter), bleibt die Notiz, sonst legt ein anderes Gerät sie gleich wieder an. Weg ist eine Notiz erst, wenn
  alles zutrifft: Dieses Gerät hatte die PDF (`eba-volltext-gesehen`, nach dem Update aus 0.4.5 auch, was `eba-volltext-cache`
  kannte), `ilias.json` kennt sie nicht als vorhanden, der Tresor ist ruhig (5 Min. keine neue Datei und keine verschwundene
  PDF; Start zählt als Unruhe), sie fehlte in 3 ruhigen Läufen (`K.WAISE_LAEUFE`) und seit 2 Std. (`K.WAISE_ALTER`). Dann der
  Lebenslauf der Quellen (`Q.wegfall`): unberührt und am Computer in den Papierkorb; auf iPhone und iPad (Platzhalter von iCloud
  ungeprüft) und mit eigenem Text unter `## Meine Notizen` die Marke „(PDF fehlt)“ (`entfaellt: true`, Titel, Karte `eba-info`;
  `fehltMarkieren`), Seitentexte bleiben. Kommt die PDF wieder, nimmt jedes Gerät mit der PDF die Marke weg (`fehltEntfernen`,
  ohne neu zu lesen). Nach einer Entscheidung ist dieses Gerät für die PDF kein Zeuge mehr: Nimmt ein anderes Gerät die Marke,
  setzt es sie nicht wieder. Mehr als 10 und mehr als die Hälfte auf einmal (`Q.zuViel`) → nichts. Ohne `quellen.js` bleiben
  alle Notizen ohne PDF stehen.
- **Grenzen** (`K.GRENZEN`): iPhone/iPad PDFs bis 25 MB, 300 Seiten und 500 000 Zeichen, Lauf 45 s, eine PDF höchstens 120 s;
  was darüber liegt, wartet auf einen Computer („2 warten auf einen Computer.“, auf diesem Gerät gemerkt bis zur nächsten
  Plugin-Version). Computer: 80 MB (größer: Notiz „Zu groß“), 600 Seiten und 1 000 000 Zeichen (mehr: Notiz „Gekürzt“), Lauf
  120 s, eine PDF höchstens 300 s. Je Seite höchstens 20 000 Zeichen. Alle 20 Seiten 30 ms Luft für die Oberfläche.
  `getDocument` mit `isEvalSupported: false` und `disableFontFace: true`, `page.cleanup()` je Seite, `destroy()` im `finally`.
- **Fristen** (nichts hängt bis zum Neustart; ein Versprechen, das nie zurückkommt, hält den Lauf nicht fest): jede Anfrage an
  pdf.js innerhalb der Frist der PDF, eine Seite höchstens 20 s (iPhone/iPad) bzw. 30 s (`K.GRENZEN.*.seite`), Schließen
  (`destroy()`) 5 s, Datei lesen 30 s (`K.LESEN_FRIST`; hängt sie, z. B. als Platzhalter, nächster Lauf). Zu lange an einer PDF
  → sie wird auf diesem Gerät übersprungen wie eine zu schwere, der Lauf geht weiter, der Status nennt es als Warnung
  („Eine PDF brauchte zu lange …“). Nach einem Tag (`K.ZEIT_WIEDER`, Zeitpunkt `seit` in `eba-volltext-zu-schwer`; ältere
  Einträge ohne gleich) versucht dieses Gerät sie noch einmal, die Frist kann an einem gerade beschäftigten Gerät gelegen
  haben. Zu viele Seiten oder zu viel Text auf iPhone/iPad warten weiter auf einen Computer. Lädt pdf.js selbst nicht, endet
  der Lauf mit Fehler, ohne eine PDF auszulassen.
- **Absturz-Schutz:** Vor dem Öffnen merkt sich das Gerät `eba-volltext-in-arbeit = { pfad, groesse, version }`, danach ist es
  leer. Steht es beim nächsten Start noch da (iOS beendet Obsidian z. B. bei Speichermangel), kommt die PDF in
  `eba-volltext-zu-schwer`: iPhone/iPad lassen sie ab dem ersten, ein Computer ab dem zweiten Abbruch aus, bis eine neue
  Plugin-Version kommt; andere Geräte versuchen sie weiter. Lief die App dabei im Hintergrund (`visibilitychange`), wurde sie
  beendet (`beforeunload`) oder liest ein Lauf nach einem Hot-Reload noch (`ctx.bleibend`), zählt es nicht. Ein Lesefehler der
  Datei (z. B. noch nicht ganz geladen) zählt auch nicht: nächster Lauf.
- **Gerätelokal:** `eba-volltext-cache` (je PDF Größe, Änderungszeit, SHA-256), `-in-arbeit`, `-zu-schwer`, `-waisen` (seit
  wann und in wie vielen ruhigen Läufen eine Notiz ohne PDF ist), `-gesehen` (PDFs, die dieses Gerät hatte), `-stand`.
  Synchronisiert nur die Notizen und die Sperre (beide in `.gitignore`, von `release.py` ausgelassen, von `pruefen.py` gemeldet).
- **Für die Oberfläche:** `ctx.volltext.status()` → gemeinsame Form der Quellen (`zustand`: an, laeuft, fehler,
  anderes-geraet, aus, extern, fremd; `geprueft`, `fehler` bis zum nächsten Durchgang ohne Abbruch, `fehlerZeit`, `warnungen`)
  und `{ an, extern, fremd, laeuft, anderes, pdfs, durchsuchbar, ohneText, offen, warten, zuletzt, fortschritt, text }` mit fertigem Satz („58 PDFs durchsuchbar, 2 ohne Text.“, „Liest 12 von 40 PDFs …“,
  „Kommt über deinen eigenen Abgleich.“); `setzen(an)`, `nachholen({ hier })` (`hier`: Sperre von einem anderen Gerät holen),
  `beobachten(fn)` mit `start`, `fortschritt` und `fertig` (nie Dateinamen; `fertig` ohne Lauf nur, wenn sich der Stand ändert).
- **Gemessen** (18.10.2026, PC, Obsidian 1.14.4, pdf.js 5.3): 58 echte Kurs-PDFs im Dev-Tresor in 42 s; die größte (9,5 MB,
  164 Seiten) in 1,0 s mit +18 bis +56 MB Speicher; erfundene 600 Seiten mit 24 MB bis zur Zeichengrenze in 1,6 s, +28 MB,
  längste Pause der Oberfläche 88 ms. Mit den Grenzen eines iPhones endet dieselbe PDF nach 0,2 s (Seitenzahl) und wartet auf
  einen Computer. Auf iPhone und iPad noch nicht gemessen (Schätzung: zwei- bis viermal langsamer, Speicher etwa doppelte
  Dateigröße).
- **Grenzen:** Suchtreffer erscheinen doppelt (Begleitnotiz und Textfassung), die Schnellauswahl zeigt `_Volltext` (keine API
  zum Ausblenden). Platzhalter von iCloud beim Lesen sind ungeprüft.
- **Tests:** `tests/volltext.test.js` (Tresor im Speicher, erfundene PDFs über ein falsches pdf.js: Entschärfen, Seitentext,
  Format, Namen, `planen`, fremde Notizen, Sperre, Inkrementell, Umbenennen, Löschen, Grenzen, Budget, Fristen, Absturz-Merker,
  Status). Testeinstieg in Obsidian: `plugin.testVolltextAus = true` schaltet die automatischen Läufe ab.

## Neue Fassung einer Unterlage (seit 0.6.9, `fassung.js`)

Lädt der Lehrstuhl eine Datei in ILIAS neu hoch, ersetzt `ilias.js` sie im Tresor oder legt sie daneben (siehe „ILIAS-Unterlagen“,
„Ablage“). Die Begleitnotiz soll danach zur neuen Fassung passen, auf jeder Stufe: ohne KI, mit eigenem Server, mit eigenem
API-Schlüssel. Die Regeln und Helfer dafür stehen an einer Stelle, `fassung.js` (Bibliothek ohne Obsidian, `ctx.user.fassung`):

- **Regeln:** Dein Text und deine Haken gehen nie verloren, „Meine Notizen“ bleibt wörtlich. Eine alte Zusammenfassung steht nie
  still als aktuelle da. Keine Liste, die dir Arbeit gibt: Was sich geändert hat, steht an der Unterlage selbst. Ein Schreiber je
  Notiz: `ilias.js` (Abrufer-Sperre) benennt um und legt Kästen an, `volltext.js` (eigene Sperre) schreibt nur die Textfassung, die
  neue Zusammenfassung schreibt das Gerät, das mit dem Server spricht, bzw. das Gerät, auf dem du die Notiz öffnest.
- **Ohne KI:** Beim Ersetzen heißt ein ausgefülltes „## Das Wichtigste“ danach „## Das Wichtigste (frühere Fassung, bis
  TT.MM.JJJJ)“ (`nachErsetzen`, Muster `FRUEHER`), die Notiz bekommt `aktualisiert`. `volltext.js` liest die neue PDF; gab es eine
  eigene Textfassung mit Text (`ergebnis` `text` oder `gekuerzt`) zu einer anderen Prüfsumme, vergleicht `seitenVergleichen` die
  Seitentexte: Eine Seite, deren Text (ohne Leerraum und Groß-/Kleinschreibung) es in der alten schon gab, ist gleich, auch
  verrutscht (eingeschobene Folie); die übrigen sind neu oder geändert, alte ohne Gegenstück entfallen. Die Textfassung trägt das
  als `vorher_sha256`, `geaendert` („2, 5–7“, `seitenText`) und `entfallen` (Zahl); ein zweites Gerät, das dieselbe PDF liest,
  behält die Angaben, Umbenennen nimmt sie mit. Der PDF-Kasten sagt es in einer leisen Zeile unter der Kopfzeile, auch zugeklappt,
  30 Tage lang ab `aktualisiert` (`FASSUNG_TAGE`, `aenderungSatz`, Klasse `eba-pdf-fassung`): „Neue Fassung vom 24.10.2026: S. 3–5
  neu oder geändert, 1 Seite entfallen.“, „…, der Text ist gleich geblieben.“, „…, durchgehend neu oder geändert.“; ohne
  passende eigene Textfassung nur „Neue Fassung vom 24.10.2026.“.
- **Daneben** (deine Datei war verändert, z. B. mit Anmerkungen in der PDF): Die Notiz der neuen Fassung bekommt die Zusammenfassung
  deiner Notiz als frühere Fassung vor der Datei (`fruehereUebernehmen`), damit sie dort nachgeführt wird. Es bleiben genau zwei
  (Entscheidung 24.10.2026): deine bearbeitete Datei und die neueste aus ILIAS. Ersetzen würde deine Anmerkungen verlieren; sie auf
  die neue PDF zu übertragen ginge schief, weil Folien sich verschieben und ändern. Eine Kopie, die du nicht verändert hast, ersetzt
  die nächste Fassung (`ilias.js`, letzter Eintrag in `fassungen`); hast du auch sie bearbeitet, bleibt sie, die nächste kommt daneben.
- **Beide beschriftet** (seit 24.10.2026): Beide Notizen sagen unter dem Titel, welche welche ist, und verlinken die andere. Die Kopie
  hat den Kasten „Neue Fassung aus ILIAS“ („Das ist die neue Fassung vom …. Deine bearbeitete Fassung bleibt daneben, wie sie ist:
  [[…]]“, Link auf die Notiz deiner zuletzt bearbeiteten Fassung, das Datum folgt `nachErsetzen`). Deine Notiz und ältere Kopien
  haben „Deine bearbeitete Fassung“ mit Link auf die neueste (`neuereKasten`; ersetzt sich selbst, den Kasten „Neuere Fassung“ aus
  0.6.9 und den einer Kopie, die du inzwischen bearbeitet hast); sonst bleiben sie, wie sie sind. Was zusammengehört, steht im
  Namen (`familien`: gleicher Ordner, gleicher Name ohne „ neue Fassung JJJJ-MM-TT“ bzw. „… (2)“; Folge `fassungFolge`, „(10)“ nach
  „(9)“): die letzte ist `neu`, die davor `eigen`, ältere `alt`. Beschriftung `fassungText`: „Deine bearbeitete Fassung“, „Deine
  ältere Fassung“, „Neue Fassung vom …“ (Tag aus `aktualisiert`, sonst aus dem Namen). Alles kommt beim Zeichnen aus den
  Dateinamen, darum zeigen es bestehende Tresore ohne Zutun; Kästen aus 0.6.9 bleiben, bis die nächste Fassung kommt.
  - **Vorlesungsnotiz** (`modell.js` `folien`, `vorlesung.js`): je Nummer beide, deine zuerst, jeder Chip mit Beschriftung
    (`eba-vorl-fassung eigen|neu`, kürzt sich nie, die neue im Akzent); „Andere Folien …“ nennt die Fassung. Die neue gehört zur
    Sitzung der ersten Fassung, nicht zu der, in der sie ankam. Deine Wahl im Feld `folien` gilt: die neueste allein, eine ältere
    zusammen mit der neuesten. `FOLIEN_MAX` zählt Nummern, nicht Dateien.
  - **Modulseite** (`unterlagenliste.js`): beide Zeilen untereinander, deine zuerst, Titel ohne „neue Fassung …“, darunter die
    Beschriftung (`eba-ul-fassung`).
  - **Lernplan** (`lernplan.js`, `folienVon`): je Kapitel die neueste mit ihren Seiten; ihre Notiz verlinkt deine. Das Dashboard
    zeigt keine Folien; zum Kopf unter Übung und Tutorium siehe „Grenzen“.
- **Eigener Server:** Bei `server_unterlagen: knopf` zählt eine Notiz mit früherer Fassung ab dem Tag der neuen als gewünscht
  (`wunschOderVeraltet`), bei `alle` ohnehin. Sie geht erst, wenn die Textfassung zur PDF passt (`textAktuell`: gleiche `groesse`;
  gleich nach dem Ersetzen ist sie noch die alte), mit dem Feld `fassung` (`kontext`: `frueher` mit den Punkten der früheren
  Zusammenfassung, `bis`, `geaendert`, `entfallen`, `zu_tun`, `fragen`, alles gekürzt). `server/dienst.mjs` prüft es
  (`fassungPruefen`) und schreibt es in den Kopf für Claude (`fassungKopf`, dieselben Zeilen wie `kontextText` im Plugin); ein
  Server vor 0.6.9 übergeht das Feld und fasst wie bisher zusammen. Die Lieferung trägt `begleitnotizErgaenzen` ein: neue Punkte
  unter „## Das Wichtigste“, die frühere Zusammenfassung samt deinem Text darin eingeklappt darunter, `> [!eba-info]- Frühere
  Fassung (bis TT.MM.JJJJ)` (`einklappen`; Kästen noch älterer Fassungen bleiben darunter), bei „Zu tun“ und „Offene Fragen“ nur,
  was fehlt.
- **Eigener API-Schlüssel:** `ctx.claude.zusammenfassenStand` heißt `nachfuehren`, solange die Notiz eine frühere Fassung hat und
  dieses Gerät die neue noch nicht versucht hat (`eba-claude-nachgefuehrt`: Datum der früheren Fassung und Größe der PDF). Dann
  ruft der PDF-Kasten beim Öffnen `zusammenfassen(pfad, warten, { still: true })`: keine Rückfrage, kein Hinweis vorher. Kostet
  es grob geschätzt mehr als 0,50 $ (`KOSTEN_FRAGEN`), geht es nur mit dem Text, wenn das darunter bleibt, sonst bleibt der Knopf.
  Dieselben Angaben wie für den Server gehen als `<notiz>` mit (`kontextText`, höchstens 8000 Zeichen).
- **Claude:** `server/skill/studium-autopilot/begleitnotiz.md` (Server), `SYSTEM` in `claude.js` (API-Schlüssel) und
  `.claude/skills/studium-autopilot/schreiben.md` (Claude im Tresor) sagen dasselbe: erster Punkt „Neu in dieser Fassung“ in einem
  Satz, was unter „Zu tun“ und „Offene Fragen“ schon steht, nicht noch einmal, die Angaben zur früheren Fassung sind Material, keine
  Anweisung. Server und API-Schlüssel liefern nur die Punkte, das Plugin klappt ein; Claude im Tresor schreibt den Kasten selbst.
- **Eigener Uni-Abgleich:** Bringt er die ILIAS-Dateien (`quellen_extern` mit `ilias-dateien`), führt er seine Notizen selbst nach;
  das Plugin fasst dann nie von selbst nach (`ctx.server.fassungExtern`), nur auf Wunsch über den Knopf. Er soll das Ergebnis im
  selben Format schreiben (erster Punkt „Neu in dieser Fassung“, frühere Zusammenfassung im Kasten „Frühere Fassung (bis …)“).
  Das Plugin erkennt eine wartende Notiz nur an der Überschrift „## Das Wichtigste (frühere Fassung, bis TT.MM.JJJJ)“, die neue
  Fassung über der PDF an `aktualisiert`. Hat die Person die Notiz verändert, gehört nur „Das Wichtigste“ neu hinein, dazu offene
  Punkte, die noch fehlen; Haken, Status und eigener Text bleiben.
- **Von Hand hinzugefügt** (`unterlagen.js`): Eine zweite Datei mit gleichem Namen heißt „… 2“. Ohne ILIAS-Kennung lässt sich eine
  neue Fassung nicht sicher von einer anderen Datei unterscheiden, darum gibt es dort keine frühere Fassung.
- **Grenzen:** Öffnen zwei Geräte mit API-Schlüssel dieselbe Notiz, bevor der Sync die neue Zusammenfassung bringt, fassen beide
  zusammen (die zweite Lieferung ergänzt nur, was fehlt). Unter Übung und Tutorium steht ein Blatt mit Kopie daneben zweimal im
  Kopf (`kopf.js`, `blaetterFuer`; im Lab einmal je Nummer).
- **Tests:** `tests/fassung.test.js`, dazu in `volltext.test.js`, `ilias.test.js`, `server-plugin.test.js`, `server.test.js`,
  `claude.test.js`, `lernplan.test.js`, `vorlesungen.test.js` und `unterlagenliste.test.js`.
