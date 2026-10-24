# Architektur: Noten & Anmeldungen (Alma)

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Noten & Anmeldungen (Alma, seit 0.4.5, Beta)

Auf einem deiner Geräte meldet sich das Plugin mit deinem Uni-Zugang bei Alma an, liest „Leistungen“ und „Belegungen“ und
schlägt neue Noten auf der Modulseite zum Übernehmen vor. In der Anmeldephase zeigt „Bitte prüfen“ auf dem Dashboard, wenn laut
Alma eine Prüfungsanmeldung fehlt. Es schreibt nie selbst in Modulnotizen und nie etwas in Alma.

| Skript | Aufgabe |
|---|---|
| `alma-konto-html.js` | reiner Leser (CommonJS ohne Obsidian, Zerleger aus `ilias-html.js`; auch für einen eigenen Server): `seite`, `anmeldeFormular`, `fehler`, `stundenplanLink` (seit 0.4.8), `leistungen`, `belegungen`, `zuordnen`, `zusammenfassen`, `pruefungenZuordnen`, `fingerabdruck`, `semesterName` |
| `alma-konto.js` | Ablauf, Zeitplan, Zustand, Vorschläge, Erinnerung, Zeile und Fenster (`ctx.almaKonto`), Aktion `alma-konto-pruefen` |
| `sperre.js` | Abrufer-Sperre der Quelle `alma-konto` (siehe [„Abrufer-Sperre“](quellen.md)) |
| `ilias-netz.js` | Sitzung mit Dienst `alma`: nur `alma.uni-tuebingen.de`, Kennung `Studium-Autopilot/<Version> (+https://github.com/studium-autopilot/ecoba)` |
| `ilias.js` | Uni-Zugang (`uniZugang`, Marker), siehe [„ILIAS-Unterlagen“](unterlagen.md) |

- **Beta:** läuft nur mit `update_kanal: beta` in `System/Einstellungen.md` (der Schalter „Beta-Versionen“) bzw. mit
  `ALMA_KONTO_STABIL = true` in `alma-konto.js`. Diese Konstante setzt erst ein eigener Commit, wenn echte gefüllte Seiten
  (Prüfungsanmeldungen aus einer Anmeldephase, erste Noten) mit dem Leser abgeglichen sind. Ohne Beta keine Anfrage; die Zeile mit
  **Ausschalten** und **Daten aus Alma löschen** bleibt, solange es eine Zustimmung oder Daten gibt.
- **Zustimmung je Gerät:** Fenster „Noten & Anmeldungen einschalten“ mit dem Benutzernamen (fett), einem Hauptknopf
  **Einschalten** (gerätelokal `eba-alma-konto-an`); erst danach liest das Skript das Passwort aus dem Schlüsselbund von ILIAS,
  und nur unmittelbar vor dem Absenden. Ohne gespeicherten Uni-Zugang: „Braucht deinen Uni-Zugang.“ und **ILIAS verbinden**.
- **Anmelden nur nach ILIAS:** `ctx.ilias.uniZugang()` muss `bestaetigt` sein (ILIAS hat genau dieses Passwort angenommen) und
  nicht `gesperrt` (Marker). Alma macht nie den ersten Versuch mit einem Passwort. Lehnt Alma ein bestätigtes Passwort mit der
  bekannten Meldung ab („Ihre Anmeldung war leider nicht erfolgreich …“), schreibt das Gerät den Marker (`dienst: alma`).
  Unklare Antwort (Formular ohne bekannte Meldung), zweiter Faktor, Zustimmungsseite: nur Alma auf diesem Gerät pausiert
  (**Erneut versuchen**), kein Marker. Höchstens eine Anmeldung je Lauf.
- **Ablauf** (Drossel 1 Anfrage zugleich, 2 s Abstand; ganzer Lauf ≤ 3 Min.): Startseite (zeigt sie schon den Abmelde-Link, weil
  iOS den letzten Lauf vor dem Abmelden beendet hat: keine zweite Anmeldung) → Formular `#mobileLoginForm` prüfen (https, Host
  `alma.uni-tuebingen.de`, Port leer/443, Pfad `/alma/rds`, `category=auth.login`; sonst geht kein Passwort hinaus) → POST mit
  den versteckten Feldern, `asdf`, `fdsa`, `submit` → angemeldet nur mit Link `category=auth.logout` (jede Seite trägt das
  versteckte `#sessionTimeoutLoginForm`) → Leistungen (zugeklappt: einmal **Alle aufklappen** mit allen versteckten Feldern,
  bleibt es zu: unsicher) → Belegungen → Abmelden (`type=4`) in jedem Ausgang nach der Anmeldung.
- **Leser fail-closed:** „leer“ nur bei bekanntem Text **und** Aufbau (Leistungen: Bereich `overviewAsTreeReadonly` ohne Baum mit
  „Es wurden keine Datensätze gefunden.“; Belegungen: gewählte Semesteroption, keine Einträge, „Sie haben bisher keine
  Veranstaltungen belegt und keine Prüfungen angemeldet.“). Jeder andere Hinweis, fehlender Bereich, unbekannter Status, „AN“
  ohne Langform, ungültige Note, abgeschlossen ohne Note → `unsicher`: alte Werte dieser Seite bleiben, `geprueft` bleibt, keine
  Erinnerung, eine leise Zeile mit **In Alma öffnen** und unter „Mehr erfahren“ **Aufbau kopieren (ohne deine Daten)**
  (`fingerabdruck`: Pfade, bekannte Spaltenköpfe, Ebenen, Status aus der bekannten Liste, geschwärzte Hinweise). Gefüllte
  Tabellen: Spalten nach Kopftext (deutsch/englisch), sonst nach id-Endung (`:elementnr`, `:grade`, `:attempt`, `:workstatus`),
  nie nach Position; Ebene aus `treeTableCellLevelN`, Art aus `img[alt]`; Belegungen je Überschrift „Prüfung: <Nummer> …“ mit
  Tabelle. Echte gefüllte Seiten und englische Texte sind noch nicht gesehen (Testseiten nachgebaut).
- **Zuordnung:** Nummer beginnt mit einem Modulcode des Tresors (längster Treffer, danach keine Ziffer; öffentlicher Katalog am
  18.10.2026: Veranstaltungen heißen wie das Modul oder hängen Buchstaben an, z. B. `B110UE`), sonst die Modulzeile darüber,
  sonst kein Vorschlag. Belegungen: Nummer, sonst Code im Titel; Unzugeordnetes zählt (`unzugeordnet`) und schaltet die
  Erinnerung auf „selbst prüfen“. Zugeordnet wird beim Lauf mit den Codes des Tresors (Titel und Zeilen ohne Modul bleiben
  nicht); eine danach angelegte Modulnotiz bekommt ihre Angaben mit dem nächsten Lauf oder **Aktualisieren**.
- **Zustand** `System/Daten/alma-konto.json` (synchronisiert, nur der Abrufer schreibt): `{ version: 1, geprueft, stand, geraet,
  leistungen: { art, module: { <Code>: { status, note, unbenotet, versuch, semester, datum, eindeutig, stati } } }, belegungen:
  { art, semester, pruefungen: { <Code>: { status } }, unzugeordnet } }`. `geprueft` = letzte vollständige Prüfung, `stand` =
  letzte inhaltliche Änderung. Kein Titel, kein Name, keine Matrikelnummer, keine Prüfer:innen, kein Vermerk. Unlesbar → wie
  nicht da, der nächste Lauf schreibt neu. Konfliktkopien (`alma-konto*.json` außer `-abruf`/`-aus`) löscht jeder Lauf endgültig.
- **Fällig** (nur Geräte mit Zustimmung, Beta, bestätigtem Zugang, nicht extern): `geprueft` älter als 12 Std., in der
  Anmeldephase (zentrale Frist „Prüfungsanmeldung … Haupttermin“ heute offen) älter als 3 Std.; ein Lauf, der den Anmelde-POST
  erreicht hat, zählt als Versuch (der nächste automatische frühestens nach 12 bzw. 3 Std.); Fehler vor dem POST → nach 30 Min.
  Blick über den gemeinsamen Zeitplan (`Q.planen`): 60–180 s nach dem Start, dann alle 30 Min., zurück in der App nach über
  60 Min. **Aktualisieren** jederzeit (≥ 2 Min.).
  429/403 oder zweimal 5xx in Folge: bis Mitternacht Pause; drei unerwartete Antworten in Folge: 24 Std.
- **Ein Schreiber:** `sperre.js` mit der Quelle `alma-konto` (`alma-konto-abruf.json`, siehe [„Abrufer-Sperre“](quellen.md)). Prüft gerade ein
  anderes Gerät: „Ein anderes Gerät aktualisiert …“ mit **Hier aktualisieren** (`erzwingen`). Ausschalten und Löschen geben sie frei.
- **Löschen** (jedes Gerät, **Daten aus Alma löschen**): Sperre her, Grabstein `System/Daten/alma-konto-aus.json` `{ geloescht,
  geraet }`, `alma-konto.json` und Kopien mit `vault.delete` (nicht Papierkorb), hier aus, Sperre frei. Jedes Gerät, dessen
  Zustimmung älter ist als der Grabstein, schaltet sich aus („Auf einem anderen Gerät ausgeschaltet.“); eine neue Zustimmung gilt
  wieder. Verläufe der Sync-Dienste kann das Plugin nicht löschen (`docs/datenschutz.md`).
- **Vorschläge** (`vorschlagAus`, Modulfeld unter dem Stand, `modul.js` → `ctx.almaKonto.modulFeld`): nur eindeutige Aussagen
  (Modulzeile oder genau eine Prüfung), nur Abweichungen; bestanden/nicht bestanden mit Note und Versuch, endgültig nicht
  bestanden → „nicht bestanden“ mit dem Satz „Endgültig: bitte mit dem Prüfungsamt sprechen.“, anerkannt, angemeldet (nur bei
  offen/läuft; auch aus den Belegungen). **Übernehmen** = ein `processFrontMatter`, dazu `alma_uebernommen: "<8 Zeichen
  SHA-256 von Code|Status|Note|Versuch der Notiz danach>"`; **Ausblenden** schreibt
  `alma_ausgeblendet: ["<8 Zeichen SHA-256 von Code|Status|Note|Versuch>"]` (keine lesbare Note im Frontmatter; eine neue Note
  ist ein neuer Vorschlag). **Korrekturen** gehen denselben Weg (nie still): eine geänderte Note oder ein geänderter Status in
  Alma ist eine Abweichung wie jede andere; Notiz „angemeldet“, aber Alma meldet ausdrücklich zurückgetreten/abgemeldet
  (Belegungen ohne gültige Anmeldung und Leistungen ohne „angemeldet“, oder die eindeutige Leistung) → „läuft“; Notiz
  „bestanden“/„anerkannt“ mit passendem `alma_uebernommen` (aus Alma übernommen und seither unverändert), aber Leistungen `ok`
  ohne Ergebnis für den Code (fehlt oder eindeutig angemeldet/zurückgetreten) → „angemeldet“ (wenn Alma eine Anmeldung zeigt)
  bzw. „läuft“, Note leer; nur, wenn die Leistungen mindestens ein anderes Ergebnis zeigen und höchstens eine Modulnotiz
  zugleich so betroffen ist (`abh.notizen()`, Frontmatter aller Modulnotizen aus `ctx.modell`): Eine gekürzte Liste in Alma
  (Filter, Studiengangswechsel) bietet so nie viele Noten auf einmal zum Löschen an. Fehlt ein Wert nur in Alma (anderes Semester in den Belegungen, Seite leer oder unsicher) oder hast
  du ihn selbst eingetragen, bleibt er.
- **Erinnerung** (`fehlendeAnmeldungen`): nur bei offener Haupttermin-Frist, beiden Seiten `ok`/`leer`, Belegungen im aktuellen
  Semester, `geprueft` höchstens 26 Std. alt und nichts unzugeordnet; Kandidaten: Status „läuft“ oder im aktuellen Semester
  geplant, nicht bestanden/anerkannt, kein `anmeldung_verzicht` für dieses Semester, die Prüfung des Moduls nach dem Fachmodell
  (`ctx.modell.pruefungVon`: ohne Zwischentests, Nachholtermin nur nach „nicht bestanden“, entfallene nie; Termin oder
  `klausur`), nicht abgehakt, nach Beginn der Frist (bis 120 Tage nach ihrem Ende); angemeldet = Belegung
  angemeldet/zugelassen oder Leistungen mit angemeldet (Semester passt oder fehlt) bzw. abgeschlossen in diesem Semester.
  Sonst nur „Bitte deine Prüfungsanmeldungen selbst in Alma prüfen.“ in der Zeile. Nie „alles angemeldet“.
- **Dashboard** (`bitte-pruefen.js`, Karte „Bitte prüfen“, auch ohne eigenen Abgleich; gemeldet über den Meldekanal der Quellen,
  `Q.melden(ctx, "alma-konto", hinweise)`): höchstens zwei Zeiger ohne Notenwert,
  „**Aus Alma** · neue Angaben zu B110, S100, auf den Modulseiten übernehmen“ (ein Modul: dessen Seite, mehrere: Noten & ECTS) und
  „**Prüfungsanmeldung** · laut Alma fehlen B180, S110“ (Termine & Anmeldungen). Kein neuer Block, keine Änderung an
  `Dashboard.md`.
- **Datenschutz:** Noten nur in `alma-konto.json` und im Modulfeld; nie in Hinweisen, Konsole (nur Grund-Codes), Protokoll
  (`eba-alma-konto-protokoll`: Zeit, Art, Grund, Dauer, Anfragen), Fehlern, im Datenkanal oder im Release (`.gitignore`,
  `release.py`, `pruefen.py`). Weiterleitungen: am PC prüft die Sitzung jeden Sprung; auf iPhone/iPad folgt `requestUrl` selbst,
  geprüft werden Startadresse und Formularadresse, ob die Antwort von Alma kommt, am Inhalt (Abmelde-Link). Einen 307/308 des
  Servers auf einen anderen Host würde iOS samt Formular weiterschicken (`tests/alma-konto.test.js` hält das fest).
- **Quellen außerhalb des Plugins:** `eba.quelleExtern("alma-konto")` (bei jedem Lauf): kein Lauf, keine Vorschläge, Zeile „Kommt
  über deinen eigenen Abgleich.“.
- **Status** in der gemeinsamen Form der Quellen: `status()` → `{ zustand, geprueft, fehler, fehlerZeit, warnungen }` (Sätze ohne
  Noten; `zustand` z. B. `an`, `aus`, `ohne-zugang`, `wartet-ilias`, `abgelehnt`, `unsicher`, `anderes-geraet`, `pause`), dazu
  `an`, `benutzer`, `laeuft`, `daten`, `aufbau`. Zustände, in denen nur du weiterhilfst (abgelehnt, zweiter Faktor, Zustimmung,
  unklare Antwort), meldet zusätzlich „Bitte prüfen“ („**Alma** · …“).
- **Stundenplan-Link** (seit 0.4.8, ohne Beta und ohne **Einschalten**, für den Uni-Login): `stundenplanLink()` meldet sich mit
  derselben Anmeldung wie ein Lauf an (`mitAlma`), liest „Stundenplan“ und meldet sich ab → `{ art: "ok", link }` oder die Art
  wie bei einem Lauf; ändert den Stand von Noten & Anmeldungen nicht. Siehe [„Uni-Login“](verbindungen.md).
- **Für die Oberfläche:** `ctx.almaKonto = { status(), zeile(), sichtbar(), einschalten(), ausschalten(), jetztPruefen({ hier }),
  loeschen(), zustand(), vorschlag(fm), stundenplanLink(), uebernehmen(f, v), ausblenden(f, v), modulFeld(box, f, fm), fehlendeAnmeldungen(),
  hinweise(), fingerabdruck(), beobachten(fn), fensterOeffnen() }`.
- **Tests:** `tests/alma-konto-html.test.js` (erfundene Testseiten `tests/daten/alma-konto/`, Aufbau aus echten Seiten bzw.
  nachgebaut), `tests/alma-konto.test.js` (erfundenes Alma, PC-Transport und `requestUrlWieIOS`: Ablauf, Passwort nur im POST an
  Alma, Abmelden, Drossel, Uni-Zugang, Zeitplan, Sperre, Grabstein, Kopien, Beta, Vorschläge, Erinnerung, Datenschutz-Spione),
  `tests/sperre.test.js`. In Obsidian: `plugin.testAlmaAus = true` (kein automatischer Lauf), `ctx.almaKonto.testSetzen({ beta,
  zugang, zustand })` ersetzt diese Werte nur im Speicher (`null` = wieder echt).
