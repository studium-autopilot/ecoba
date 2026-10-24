# Architektur: Update

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Update (seit 0.2.0, `update.js`)

Zwei Kanäle bleiben getrennt: Die zentralen Daten kommen von selbst und sind nur Daten. **Programmteile kommen nur nach einem
Tipp auf „Neue Version installieren“** und Bestätigung, aus dem Haupt-Repo am Tag der Version.

```
manifest.json (ecoba-daten) ── release / beta: version, url_basis, sha256 der Liste
        │ Tipp „Neue Version installieren“ → Manifest frisch holen → Bestätigung
        ▼
url_basis + Studium Autopilot/System/Daten/system-dateien.json ── SHA-256 = release.sha256? Liste streng prüfen
        ▼
Ist-Stand lesen, Plan je Datei (gegen installiert.json) → nur geänderte Dateien laden, Größe + SHA-256 prüfen
        ▼  (alles geladen und geprüft – vorher wird nichts geschrieben)
Sicherung → .trash/Studium Autopilot Sicherung <alt> <Zeit>/ → schreiben (Fehler: alles zurück) → Kern zuletzt
        ▼
system-dateien.json + installiert.json = neue Liste → Kern geändert? Plugin neu laden (disable/loadManifests/enable)
```

**Dateiklassen** (`klasseVon` in `update.js` = `klasse_von` in `werkzeuge/pruefen.py`, beide gleich halten). Was keine Klasse
hat, fasst ein Update nie an, auch wenn die Liste es nennt (dann lehnt das Plugin die ganze Liste ab). Klassen aus `WEITERE`
(bisher nur `claude`) stehen nur im Schlüssel `weitere` der Liste, alle anderen nur in `dateien` (unten, „Hinweise für Claude“).

| Klasse | Dateien | Unverändert | Von dir geändert |
|---|---|---|---|
| `system` | `.obsidian/plugins/studium-autopilot/{main.js,manifest.json,styles.css}`, `System/Skripte/*.js`, `System/Gerüste/*.md`, `.obsidian/snippets/eba-*.css` | ersetzen | seit 0.4.4 immer die neue Fassung; deine kommt vorher als `Name (deine Fassung vor X).ext.txt` daneben (`.txt`: nie geladen), das Ergebnisfenster sagt es in einer Zeile. Bis 0.4.3 blieb deine aktiv und die neue lag als `Name (neu X).ext.txt` daneben, darum fehlten neue Teile |
| `einstellung` | `.obsidian/{app,bookmarks,community-plugins,core-plugins,hotkeys,types}.json` | ersetzen | mischen: deine Werte bleiben, fehlende Schlüssel kommen dazu, Textlisten vereinigt; eine geänderte Vorgabe (`VORGABE_NEU`, seit 0.4.6) bekommt nur, wer noch den alten Wert hat und von einer Version davor kommt |
| `seite` | `Dashboard.md`, `Studium/*.md`, `System/Daten/Musterplan.md` | ersetzen | Vorlage seit der installierten Version gleich → deine bleibt, keine Kopie (seit 0.4.4); nur abgehakt (`ohne_haken` gleich) → neue Seite mit deinen Haken; sonst deine bleibt, neue daneben `Name (neu X).md` |
| `modul` | `Module/**/*.md` | ersetzen | Vorlage seit der installierten Version gleich → deines bleibt unverändert (seit 0.4.4); sonst Frontmatter: Reihenfolge und Katalogfelder neu, persönliche Felder (`status`, `ergebnis`, `versuch`, `klausur`, `semester_geplant`, `gewaehlt`, `anrechnung`, `zusatz`, `alma_ausgeblendet`, `anmeldung_verzicht`, `alma_uebernommen`) und eigene Felder bleiben, `tags`/`aliases`/`cssclasses` vereinigt; Text neu, wenn `koerper` gleich, sonst deiner |
| `claude` (seit 0.6.9, nur in `weitere`) | `.claude/CLAUDE.md`, `.claude/skills/studium-autopilot/*.md` | ersetzen; als unverändert gilt auch eine früher ausgelieferte Fassung (`CLAUDE_FRUEHER`, Merker des Geräts) | wie `system`: immer die neue Fassung, deine kommt vorher als `Name (deine Fassung vor X).md.txt` daneben; fehlt eine, kommt sie wieder. Danach holt jeder Computer nach, was bei ihm fehlt (unten, „Hinweise für Claude“) |

Nie im Update: `System/Einstellungen.md`, `System/Daten/Semester.md` (Datenkanal), `abruf.json`, `installiert.json`, `update.json`,
`.obsidian/appearance.json` (Obsidians Grundfarbschema; Hell, Dunkel, Automatisch speichert jedes Gerät selbst), `workspace*.json`, Plugin-`data.json`, `Termine/`, `Stundenplan/`,
`Vorlesungen/`, `Übungsblätter/`, `Unterlagen/`, `Schlüsselqualifikationen/`, `Anhänge/`, `Karteikarten/`,
`System/Daten/Karteikarten/` (Lernstände), eigene Skills (`.claude/skills/<anderer Name>/`), `.claude/settings*.json` und alles
andere ohne Klasse. Ausnahmen: Ordner, die die Vorlage nicht mehr hat, und geratene Werte in Notizen älterer Versionen
(unten, „Ordner, die die Vorlage nicht mehr hat“ und „Nachträge in Notizen“).

- **„Geändert“** heißt: SHA-256 der Datei ≠ Eintrag in `installiert.json` (Liste der zuletzt installierten Version). Gleicht
  die Datei schon der neuen Fassung, ist nichts zu tun. Zeilenenden zählen nicht (seit 0.6.8, `istVon`, `passt`): Neben der
  Prüfsumme der Datei rechnet das Update dieselbe mit LF und mit CRLF (auch `koerper` und `ohne_haken`); passt eine davon,
  gilt die Datei als diese Fassung. Befund 24.10.2026: `Studium/Studienverlauf.md` lag als einzige Seite mit CRLF in der
  Vorlage, in einem Tresor kam sie nach einem Konflikt im Sync mit LF zurück. Das Update auf 0.6.3 hielt sie für selbst
  geändert und legte die neue Fassung daneben. Seitdem hat die Vorlage überall LF (`tests/zeilenenden.test.js`). Fehlt eine
  Seite oder ein Modul, das installiert war, hast du es gelöscht → nicht wieder anlegen. Neue Dateien werden angelegt.
  Dateien, die es in der neuen Version nicht mehr gibt: unverändert → in die Sicherung verschoben; geänderte Seiten und
  Module bleiben (das Ergebnisfenster nennt sie), geänderte Systemdateien gehen auch, mit `… (deine Fassung vor X).ext.txt`
  daneben (ein übrig gebliebenes Skript liefe sonst weiter). Lesezeichen in `.obsidian/bookmarks.json`, die auf so entfernte
  Dateien zeigen, fallen beim Mischen weg, auch in Gruppen (`lesezeichenOhne`); erster Fall: die Seite „Schwerpunkt-Planer“
  (17.10.2026).
- **Keine Stapel von Kopien (seit 0.4.4):** Ältere Kopien `Seite (neu X).md` (X älter als die neue Version), die der alten
  oder der neuen Vorlage gleichen, räumt das Update weg (in die Sicherung, `aufgeraeumt` im Bericht; `kopienAufraeumen`). Bleibt
  deine Seite, weil die Vorlage gleich blieb (`eigene`), bleibt die jüngste davon (seit 0.6.8): Sie ist die eine Stelle, an der
  du die Vorlage siehst. Befund 24.10.2026: Das Update auf 0.6.4 räumte die Kopie aus 0.6.3 weg, weil sie der unveränderten
  Vorlage glich; die Seite blieb auf dem alten Stand, ohne Kopie daneben. Eine Kopie, die du geändert hast, und Kopien neben
  Dateien ohne Klasse bleiben. Dafür liest `io.liste(ordner)` die Dateien neben der Seite.
- **Reparatur nach dem Update (seit 0.4.4, `heilenMit`, `heilen()`):** Das Update auf eine Version plant immer der
  *installierte* `update.js`; das Update auf 0.4.4 also noch der von 0.4.3, der eine geänderte Systemdatei wieder als
  `Name (neu 0.4.4).ext.txt` beiseitelegt und jede geänderte Seite erneut kopiert. Darum prüft der neue `update.js` 30 s nach
  dem Laden und nach jeder neuen `installiert.json` einmal je Gerät und Version (gerätelokal `eba-update-reparatur`):
  - *Systemdatei:* weicht die aktive Datei von `installiert.json` ab und liegt daneben eine Kopie `Name (neu X)…` (X höchstens
    die installierte Version) mit genau dieser Prüfsumme und Größe, wird sie aktiv; deine Fassung kommt als
    `Name (deine Fassung vor X).ext.txt` daneben. Ist die aktive Datei danach die der Liste, gehen ihre Kopien bis zu dieser
    Version weg. Liegt die neue Fassung auf dem Gerät nicht vor, passiert nichts: Programmteile kommen nie von selbst aus dem
    Netz (`docs/datenschutz.md`).
  - *Seite:* Kopien `Seite (neu X).md` älter als die installierte Version, die der jetzigen Vorlage gleichen, gehen weg; weicht
    die Seite selbst von der Vorlage ab, bleibt die jüngste Kopie mit der Vorlage (seit 0.6.8). Die Seite selbst und Kopien,
    die du geändert hast, nie.
  - `.obsidian/` gleicht jedes Gerät selbst ab (dort oft nicht synchronisiert). Synchronisierte Pfade nur auf dem Gerät, das
    für alle schreibt (`ctx.zentral.abruferHier()`, wie `modell.js`); ein anderes Gerät merkt „Version lokal“ und prüft sie,
    sobald es selbst schreibt. Alles wird vorher gelesen und geprüft, dann Sicherung nach `.trash/Studium Autopilot Sicherung
    <Version> <Zeit>/`, Schreiben mit Zurücksetzen bei Fehlern, Kern zuletzt; geht etwas schief, merkt sich das Gerät nichts
    und versucht es beim nächsten Start wieder. Danach liest Obsidian die Snippets neu (`app.customCss.requestLoadSnippets`,
    falls vorhanden), ein getauschter Kern lädt das Plugin neu, und ein Hinweis sagt in einem Satz, dass deine Fassung als
    Sicherung daneben liegt.
- **Lesezeichen der Vorlage (seit 0.6.8, `lesezeichenNachziehen`, `lesezeichenAnwenden`, `LESEZEICHEN_NEU`):** Obsidian
  schreibt `bookmarks.json` neu, sobald du ein Lesezeichen setzt, entfernst oder verschiebst. Ab dann ersetzt das Update die
  Datei nicht mehr, und Mischen lässt Listen von Objekten, wie sie sind; auf Geräten, die `.obsidian/` nicht synchronisieren,
  kommt die neue Datei gar nicht an. Befund 24.10.2026: Mit einem eigenen Lesezeichen fehlte „Postfach“ (seit 0.6.0), und
  „Stundenplan“ (gestrichen mit 0.6.7) blieb. Darum zieht `heilen()` einmal je Gerät und Version (gerätelokal
  `eba-update-lesezeichen`) jeden Eintrag nach, den die installierte Version mitbringt: `dazu` hinter das Lesezeichen `nach`
  (sonst ans Ende), aber nur, wenn noch kein Lesezeichen derselben Version aus der Vorlage da ist (dann hast du die übrigen
  selbst entfernt); `weg` nur das Lesezeichen, das die Vorlage angelegt hat (`ctime` ab `VORLAGE_CTIME`, 1790760000000 +
  0…999), keins, das du selbst neu gesetzt hast, und keins in deinen Gruppen. Danach liest Obsidians Lesezeichen-Plugin die
  Datei neu (`onExternalSettingsChange`), sonst schriebe es seine Liste aus dem Speicher zurück. Ändert die Vorlage ihre
  Lesezeichen, braucht `LESEZEICHEN_NEU` einen Eintrag: `tests/update.test.js` rechnet die Liste der Vorlage aus der von
  0.4.2 nach. Einmal kann so ein Lesezeichen wiederkommen, das du nach dem Update auf seine Version selbst entfernt hast;
  das lässt sich aus der Datei nicht unterscheiden.
- **Ordner, die die Vorlage nicht mehr hat (seit 0.6.8, `ordnerAufraeumenMit`, `ALTE_ORDNER`):** Das Update kennt nur
  Dateien mit Klasse; ein Ordner der Vorlage, der wegfällt, bliebe sonst in jedem Tresor für immer liegen (erster Fall:
  `Eingang/`, entfallen mit 0.6.7; dann `Übungsblätter/`, entfallen mit 0.6.8, ohne `nach`: nur ein leerer geht weg,
  ältere Übungsblatt-Notizen bleiben darin, `kopf.js` kennt sie weiter). Je Eintrag `{ ordner, ab, nach }` prüft `heilen()` bei jedem Lauf (vor seinem Merker),
  sobald `installiert.json` mindestens `ab` nennt: Dateien darin wandern nach `nach` (Unterordner bleiben; über
  `app.fileManager.renameFile`, damit Links mitziehen; ein belegter Name bekommt „ 2“), gelöscht wird keine. Liegt danach nur
  noch `.gitkeep`, `.DS_Store` o. Ä. darin, geht der Ordner weg. Ein Hinweis sagt je Ordner, wie viele Dateien wohin gewandert
  sind. Einmal je Tresor: Erledigtes steht in `System/Daten/aufgeraeumt.json` (synchronisiert, nicht in der Vorlage), damit
  ein Ordner, den jemand später selbst so nennt, bleibt; ein fehlender Ordner gilt ebenso als erledigt. Scheitert ein
  Verschieben, bleibt der Eintrag offen und kommt beim nächsten Lauf wieder dran. Nur auf dem Gerät, das für alle schreibt
  (`ctx.zentral.abruferHier()`). Neuer Eintrag, wenn eine Version einen Ordner der Vorlage streicht oder umbenennt
  (`tests/update.test.js` prüft, dass die Vorlage keinen davon mehr hat). Abschnitte einer Seite brauchen das nicht: Eine
  unveränderte Seite ersetzt das Update, neben eine geänderte legt es `Name (neu X).md`.
- **Nachträge in Notizen (seit 0.6.9, `nachtraege.js`, `NACHTRAEGE`, `nachtragenMit`):** Das Update fasst Notizen nie an.
  Schrieb eine ältere Version beim Anlegen einen geratenen Wert in ein Feld, das heute als deine Wahl gilt, bliebe er für
  immer. Je Fall nennt `NACHTRAEGE` eine feste `id` und `aendern(notizen, modell)` → `[{ f, felder }]` (oder `null`: geht noch
  nicht, später wieder). Bisher zwei Fälle: `folien-geraten` leert `folien` in Vorlesungsnotizen bis zum 24.10.2026, wenn der
  Wert einer der Regeln von `eba.folienZu` (bis 0.6.2) entspricht: Folien gleicher Nummer, kleinste Nummer oder die Folien
  einer früheren Notiz des Moduls; seitdem wählt das Modell die Folien der Sitzung selbst, auch später hochgeladene.
  `ausfall-pausen` nimmt aus `ausfall` von Hand angelegter Lehrveranstaltungen (ohne `quelle`, `herkunft`, `zentral_id`) die
  Tage, die in eine Pause fallen: „Neue Lehrveranstaltung“ trug sie bis 24.10.2026 dort ein, `findetStatt` prüft Pausen ohnehin,
  und nach einer Korrektur der Pausen fielen sie sonst weiter aus. Einmal je Tresor, eine Minute nach dem Start, dann
  stündlich, bis alles durch ist; nur auf dem Gerät, das für alle schreibt (`ctx.zentral.abruferHier()`). Erledigtes steht in
  `System/Daten/nachtraege.json` (synchronisiert, nicht in der Vorlage). Geschrieben wird nur über `processFrontMatter`, ohne
  Hinweis: Sichtbar ändert sich nur, was falsch war. Scheitert ein Schreiben, bleibt der Fall offen. Neuer Fall, wenn eine
  Version aufhört, einen Wert in Notizen zu raten: lieber gar nicht erst raten (leer lassen, das Modell rechnet).
- **Hinweise für Claude (seit 0.6.9, Klasse `claude`, `claudeNachholenMit`, `claudeNachholen`):** `.claude/CLAUDE.md` und der
  Skill `studium-autopilot` kamen bis 0.6.8 nur mit der Installation und blieben dann auf deren Stand. Befund 24.10.2026: Der
  Skill nannte noch den Ordner `Eingang/`, den es seit 0.6.7 nicht mehr gibt. Drei Hürden:
  - *Ältere Planer:* Jeder `update.js` bis 0.6.8 (`listePruefen`, `klasseVon` in allen Releases gleich) lehnt die ganze Liste
    ab, sobald in `dateien` ein Pfad ohne seine Klasse steht, liest aber nur `schema`, `version`, `ordner` und `dateien`. Darum
    stehen die Hinweise im eigenen Schlüssel `weitere` (`WEITERE`); geprüft mit den Planern aller Releases 0.2.0 bis 0.6.8: Sie
    nehmen die Liste an, lassen `.claude/` unberührt und schreiben sie unverändert nach `installiert.json`. Der Planer ab 0.6.9
    nimmt aus `weitere`, was er kennt (Klasse aus `WEITERE`, Pfad mit dieser Klasse, gültige Prüfsumme, kein Doppel), und
    übergeht den Rest, damit eine spätere Version dort Neues nennen kann, ohne ältere Planer zu brechen.
  - *Geändert oder nur alt?* Die Listen bis 0.6.8 nennen `.claude/` nicht, `installiert.json` hilft beim ersten Mal also nicht.
    `CLAUDE_FRUEHER` hält die SHA-256 jeder Fassung, die 0.4.7 bis 0.6.8 ausgeliefert haben (aus den Tags, eingefroren); dazu
    merkt sich jedes Gerät die Fassungen seines letzten Laufs (`eba-update-claude` = `{ version, sha }`, `claudeBekannt`), weil
    `.claude/` dort eine Version hinterherhinken kann. Eine solche Fassung gilt als unverändert (`planen`, `bekannt`); jede
    andere als deine. Deine wird nicht behalten, sondern wie eine Systemdatei gesichert: Veraltete Hinweise führen Claude in
    die Irre, und eigene Regeln gehören in einen eigenen Skill (so steht es in `CLAUDE.md`). Kennt ein Gerät eine Fassung
    nicht (z. B. per iCloud angekommen, bevor es selbst lief), liegt sie einmal unnötig als Sicherung daneben; verloren geht nichts.
  - *Jedes Gerät:* Obsidian Sync nimmt `.claude/` nicht mit. Darum gleicht `heilen()` bei jedem Lauf einmal je Computer und
    installierter Version die Klasse `claude` aus `installiert.json` ab (wie `.obsidian/` in der Reparatur je Gerät, nicht nur
    auf dem Gerät, das für alle schreibt; gleichen LiveSync oder iCloud `.claude/` doch ab, schreiben alle dieselben Bytes):
    fehlende und alte Dateien vom Tag `v<installierte Version>` laden (`tagBasis`), mit Größe und SHA-256 der Liste prüfen,
    erst dann schreiben (`schreibenSicher`: Ersetztes in die Sicherung, bei einem Fehler alles zurück). Eine früher
    ausgelieferte Datei, die die Liste nicht mehr nennt, geht weg (geändert: mit Sicherung daneben); andere Dateien unter
    `.claude/` nie. Laden nur bei eingeschalteten zentralen Daten (`docs/datenschutz.md`), sonst nur, was ohne Laden geht, und
    kein Merker, also beim nächsten Lauf noch einmal. Nicht während eines Updates, nicht, solange ein anderes Gerät gerade
    installiert (`lage`), und nicht auf iPhone, iPad und Android: Claude Code läuft nur am Computer. Liegt danach deine
    Fassung daneben, sagt es ein Hinweis in einem Satz. Das Update selbst (ab dem Planer von 0.6.9) behandelt die Klasse
    `claude` genauso, mit `bekannt` aus demselben Gerät.
- **installiert.json** (`System/Daten/`, synchronisiert, nicht im Repo): fehlt sie beim Start, legt `installiertAnlegen()` sie
  20 s nach dem Einlesen einmal als Kopie von `system-dateien.json` an (Erstinstallation; sonst keine Datei). Ohne beide Listen
  gilt jede abweichende Datei als geändert (Seiten und Module werden nicht überschrieben, Systemdateien nur mit deiner Fassung
  als Sicherung daneben).
  *Von Hand aktualisiert* (neuere ZIP über den Tresor entpackt; `installiert.json` ist nicht in der ZIP): Nennen der laufende Kern
  und `system-dateien.json` dieselbe neuere Version als `installiert.json`, gleicht jede Systemdatei der Liste (Größe, SHA-256)
  und nennt `update.json` kein Update genau dieser Version (das stellt „Update fertigstellen“ fertig), gilt sie als installiert
  (`handInstalliertMit`, in `installiertNeu`). Bis dahin zeigte die Zeile die alte Version und bot die laufende als Update an.
  Das Gerät, das für alle schreibt (`ctx.zentral.abruferHier()`), kopiert dann `system-dateien.json` nach `installiert.json`
  wie bei der Erstinstallation; andere Geräte zeigen die Version gleich, ohne zu schreiben. Mit der alten Liste sähe beim nächsten
  Update jede Systemdatei geändert aus (Sicherung daneben); mit der neuen gilt eine Seite, die von der Vorlage abweicht, als deine
  und bleibt. Nicht installiert gilt sie, solange etwas aus `installiert.json`, das die neue Liste nicht mehr hat, noch da ist und
  von einem Update entfernt würde (eine Systemdatei, oder eine Seite bzw. ein Modul unverändert): Das Entpacken löscht nichts,
  und mit der neuen Liste stünde etwa ein weggefallenes Skript in keiner Liste mehr und würde nie entfernt. Die Zeile bietet die
  Version dann weiter an; **Neue Version installieren** räumt auf. Weil Liste und Systemdateien nach dem Start per Sync kommen
  können, prüft `installiertNeu` auch bei jeder Änderung an `system-dateien.json` und, solange ein neuerer Kern läuft als
  eingetragen, an jeder Datei unter `System/` neu (entprellt).
- **Andere Geräte:** Das Update kommt per Sync. Dort zeigt `installiert.json` schon die neue Version → kein zweites Update.
  Läuft dort noch der alte Kern im Speicher (`installiert` > `plugin.manifest.version`), zeigt die Zeile „Neu laden“
  (Aktion `vorlage-neu-laden`, `neuLaden`). Seit 21.10.2026 holt sie vorher den Kern nach (`kernNachholen`): Befund iPhone,
  `installiert.json` war schon 0.5.4, der Kern im versteckten Ordner `.obsidian/plugins/` aber nicht angekommen; „Neu laden“
  lud den alten Kern von der Platte, die Zeile blieb, ohne Hinweis. Jetzt vergleicht sie die Kerndateien mit `installiert.json`,
  lädt abweichende vom Tag `v<installiert>` (Größe und SHA-256 wie beim Update, alles geprüft vor dem Schreiben, `manifest.json`
  zuletzt, Schreibfehler → zurück) und lädt dann neu. Kein Netz → „Keine Verbindung …“; läuft danach noch ein älterer Kern →
  „Bitte Obsidian einmal schließen und wieder öffnen.“ Skripte lädt der Hot-Reload ohnehin nach, ohne einen Hinweis je Datei: Kommt eine neue
  `installiert.json` an, setzt `update.js` `plugin.stillBis` für eine Minute; mehrere Skripte auf einmal schweigen ohnehin.
  Das Fenster nach dem Update sagt darum unter „Andere Geräte“: „Dort einmal auf ‚Neu laden‘ … tippen“ (ohne neuen Kern:
  „dort musst du nichts tun“).
- **Unterbrochenes Update** (seit 0.4.8, `System/Daten/update.json`, `markeLage`): Befund 19.10.2026: Ein Gerät ging mitten im
  Hochladen über LiveSync in den Hintergrund, der Tresor war auf den anderen Geräten eine Weile halb aktualisiert. Darum schreibt
  das Update als **erste** Datei `update.json` = `{ version, von, geraet, seit }` (Geräte-ID aus `ctx.zentral.geraetId`; nur, wenn
  es überhaupt etwas schreibt) und lässt sie danach liegen: Eine am Ende gelöschte Datei käme über den Sync erst nach allen anderen
  an (ein Dokument steht dort, wo es zuletzt geändert wurde). Fertig ist ein Update erst mit `installiert.json` (zuletzt, nach dem
  Kern). Ein Schreibfehler setzt auch `update.json` zurück (`schreibenSicher`). Solange `update.json` eine neuere Version nennt als
  `installiert.json`:
  - *dieses Gerät* (gleiche Geräte-ID, kein Lauf hier): Die App wurde beendet, bevor alles geschrieben war. Zeile und Dashboard
    zeigen „Das Update auf Version X ist nicht fertig geworden.“ mit **Update fertigstellen** (Aktion `vorlage-aktualisieren`):
    Derselbe Ablauf ohne zweite Frage (bietet das Manifest inzwischen eine andere Version an, wird gefragt); der Plan gegen die
    alte `installiert.json` lädt und schreibt nur, was fehlt, und ergibt denselben Stand wie ein Lauf ohne Abbruch
    (`tests/update.test.js`). Ohne Zeitgrenze, aber nur, solange das Manifest diese Version anbietet (oder nichts bekannt ist,
    z. B. zentrale Daten aus): Bietet es eine andere an (zurückgezogen oder schon eine neuere), gilt die Marke als erledigt, und
    die Zeile zeigt wie sonst das Angebot oder „Du hast die neueste Version.“ (vorher stand der Satz dann für immer da).
  - *ein anderes Gerät*, `seit` vor weniger als 1 Std. (`MARKE_STILL`): seine Dateien kommen noch über den Sync. Statt eines
    Angebots steht „Ein Update wird gerade auf einem anderen Gerät installiert.“ (Zeile nur mit „Mehr erfahren“, Dashboard ohne
    Knöpfe, kein Hinweis beim Öffnen); **Neue Version installieren** und **Nach Updates suchen** sagen es als Hinweis mit „Öffne Obsidian dort,
    dann kommt es hierher.“. Danach gilt das Gerät als weg, und hier wird wieder angeboten (ein zweiter Lauf schreibt dieselben
    Dateien).
  Gelesen beim Start und bei jeder Änderung von `update.json` (auch per Sync). Wirkt ab dem Update, das 0.4.8 plant: Das Update
  auf 0.4.8 schreibt noch der Planer von 0.4.7 (ohne `update.json`). `update.json` steht in `.gitignore`, `release.py` und
  `pruefen.py`.
- **Nach Updates suchen** (seit 0.4.8, `suchen()`, Aktion und Befehl `vorlage-suchen`): Knopf (normal, nicht Hauptknopf) in der
  Zeile „Updates“, wenn nichts angeboten wird, daneben der Textlink „Mehr erfahren“. Holt das Manifest sofort
  (`ctx.zentral.manifestHolen`, ohne die 30 Min. der frischen Prüfung und ohne den Takt von `zentral.js`; zählt als Prüfung,
  `eba-update-geprueft`) und sagt das Ergebnis: ein Angebot gleich im Fenster „Neue Version“ (seit 0.5.4, vorher ein Hinweis),
  sonst in einem Hinweis „Version X ist da. Einmal neu laden.“, „Du hast die neueste Version.“ oder „Keine Verbindung. Versuch es
  später noch einmal.“. Ein Tipp, ein Abruf: Die automatischen Prüfungen bleiben, wie sie sind. Es zählt das eben geholte
  Manifest, auch bei ausgeschalteten zentralen Daten (docs/datenschutz.md: ein Tipp darf abrufen).
- **Neustart:** Hat sich `main.js`/`manifest.json` geändert, lädt `pluginNeuLaden()` das Plugin neu
  (`app.plugins.disablePlugin` → `loadManifests` → `enablePlugin`, nicht gespeichert, also bleibt es in
  `community-plugins.json` aktiv). Danach zeichnet nur die neue Instanz. Klappt das nicht, steht im Fenster oben „Noch ein
  Schritt: Obsidian einmal schließen und wieder öffnen.“. Während des Updates zeigt der Kern beim Hot-Reload keine Hinweise (`plugin.stillBis`).
- **Sicherung** in `.trash/` (wie Obsidians Papierkorb; Obsidian zeigt ihn nicht an, Sync-Dienste gleichen ihn meist nicht ab,
  steht in `.gitignore`). Bewusst nicht in einem sichtbaren Ordner: Kopien von Modulen würden sonst in Bases als Module zählen.
  In der Dateien-App von iOS sind versteckte Ordner nicht sichtbar; wiederherstellen geht am PC/Mac.
- **Fehler:** kein Netz, falsche Prüfsumme oder Liste → nichts geschrieben, keine Sicherung; Schreibfehler → alles schon
  Geschriebene aus der Sicherung zurück. Das Fenster sagt es im Titel „Nicht installiert“ und einem Satz (`ergebnisSatz`), den
  Grund klein darunter.
- **Kanal:** `update_kanal: beta` in `System/Einstellungen.md` (Schalter „Beta-Versionen“ im Fenster „Updates“ unter
  „Mehr erfahren“; Standard stabil). Angeboten wird `release`, auf Kanal beta die höhere von `beta` und `release`, nie eine
  ältere als die installierte. Versionen `X.Y.Z` und `X.Y.Z-beta.N` (Beta vor der fertigen Version).
- **Anzeige:** `ctx.update.anzeige()` → `{ html, pille, symbol, ton, knopf }`: „Wird aktualisiert …“, „Neu laden“, „Neue
  (Beta-)Version X verfügbar.“ + Notiz + Knopf „Neue Version installieren“, Rückfall „Neue Version X verfügbar“ als Link auf die Releases
  (nur `plugin_aktuell`, kein `release`), „Version X. Du hast die neueste Version.“ oder nur „Version X.“ (ohne Angaben im
  Manifest), diese beiden mit dem Knopf **Nach Updates suchen** (`knopf.cta: false`). Zentrale Daten aus: `stand()` liefert keine
  Angaben, auch wenn ein früherer Abruf welche gemerkt hat (der Stand bleibt beim Ausschalten stehen, die Prüfung hört auf); also
  nur „Version X.“, kein Angebot, kein Hinweis auf dem Dashboard und beim Öffnen, `status().release` leer. Dazu seit 0.4.8
  „Update fertigstellen“ und „Ein Update wird gerade auf einem anderen Gerät installiert.“ (siehe „Unterbrochenes Update“). Die
  Zeile „Zentrale Daten“ zeigt den Hinweis nicht mehr.
- **Hinweis auf dem Dashboard (seit 0.3.1):** Codeblock `eba-update-hinweis` ganz oben in `Dashboard.md` (nach der Pfadzeile,
  vor den Kennzahlen). `ctx.update.hinweis()` nutzt dieselbe Logik wie `anzeige()` (Neu laden, Angebot je Kanal, Rückfall
  `plugin_aktuell` → Link „Ansehen“ auf die Releases) und liefert sonst `null`: Dann ist der Block leer (`.eba-uh-aus`) und
  samt Hülle unsichtbar. Der Hinweis zeigt nur den Titel, ohne Satz; was neu ist, zeigt das Fenster „Neue Version“. Knöpfe
  **Neue Version installieren** (öffnet das Fenster) bzw. **Neu laden**, dazu **Später** (seit 0.5.4 ohne **Was ist neu**):
  merkt die Version gerätelokal (`app.saveLocalStorage("eba-update-spaeter", version)`), bei einer anderen Version erscheint
  die Zeile wieder. Neu gezeichnet über `ctx.update.hinweisNeu()`, das `ctx.verbindungen.neuZeichnen()` mit aufruft (nach
  Abruf der zentralen Daten, Update, Kanalwechsel). CSS: Abschnitt 46 in `eba-core.css`.
- **Neuigkeiten (seit 0.4.1):** Niemand soll auf einer alten Version hängen bleiben, auch wenn iPhone/iPad Zeitgeber im
  Hintergrund anhalten.
  - *Frische Prüfung:* 4 s nach dem Einlesen holt `frischPruefen()` nur das Manifest (`ctx.zentral.manifestHolen`, ohne
    Abrufer-Sperre, schreibt keine Datei), wenn die letzte Prüfung über 30 Min. her ist (voller Abruf: `geprueft` im Stand
    von `zentral.js`; eigene: `eba-update-geprueft`). Zurück in der App nach 15 s ebenso; `zentral.js` holt nach 5 s nach,
    danach ist die Prüfung frisch, also kein zweiter Abruf. Beim Start kann der volle Abruf das Manifest (wenige KB) ein
    zweites Mal holen. Zentrale Daten aus oder `plugin.testZentralAus` → nie.
  - *Hinweis beim Öffnen* (`toastPruefen()`): Obsidian-Notice „Neue Version X ist da.“ mit einem Knopf **Neue Version
    installieren**, der das Fenster „Neue Version“ öffnet; antippen irgendwo blendet ihn aus (= später). Angebot wie `hinweis()`
    (`angebot()`, Kanal). Es gibt immer nur einen (`neuigkeit.toast`, `toastWeg()`): Er geht weg, sobald das Fenster aufgeht, ein
    Update beginnt oder die App in den Hintergrund geht (iOS hält dort seine Zeit an, er stünde sonst Stunden später noch da).
    Einmal je App-Start (`sessionStorage` `eba-update-toast-sitzung`; über 6 h im Hintergrund zählt als neuer Start) und für
    dieselbe Version höchstens alle 12 h (`eba-update-toast` = `{ version, zeit, fenster }`, `toastFaellig`). Hast du das Fenster
    zu dieser Version gesehen (`fenster: true`, auch nur geschlossen), kommt für sie nie wieder ein Hinweis: Die Zeilen auf dem
    Dashboard und unter Verbindungen bieten sie weiter an. Befund 20.10.2026 (0.5.2 auf dem iPad): Hinweis beim Start, ein
    zweiter von **Nach Updates suchen** und „Lade 4 von 7 Dateien …“ standen oben rechts, während das Fenster in der Mitte offen
    war. Zeigt die Zeile `eba-update-hinweis` das Angebot gerade sichtbar (gezeichneter Block mit Fläche in einem sichtbaren
    Fenster; ein Dashboard im Hintergrund-Tab zählt nicht), kein Hinweis und nichts gemerkt (`toastEntscheiden` → `verdeckt`);
    beim nächsten Wechsel der Seite (`active-leaf-change`, `file-open`) wird neu entschieden. „Später“ auf der Zeile blendet sie
    für diese Version aus und zählt als Antwort für diesen App-Start; beim nächsten Start (nach dem Abstand) kommt der Hinweis
    wieder. Nicht während der Einrichtung (`ctx.einrichtung.fenster` oder `sollZeigen()`), nicht, solange das Fenster offen ist,
    nicht während eines Updates oder solange „Neu laden“ aussteht. Bringt der volle Abruf das Angebot erst später, zeigt
    `hinweisNeu()` den Hinweis noch bis 10 Min. nach Start/Rückkehr.
  - *Nach einem Update:* `eba-update-gesehen` = zuletzt auf diesem Gerät gelaufene Version. Läuft eine neuere, einmal
    „Aktualisiert auf Version X.“ mit **Was ist neu** (`nachUpdate`, öffnet das Fenster in der Stufe `neu`). Erster Lauf auf
    einem Gerät: still merken. Das Gerät, das aktualisiert, merkt die Version gleich; es sieht das Ergebnis im Fenster.
  - *Änderungen aus `CHANGELOG.md`* (`abschnitteZeichnen`): vom Tag `RELEASE_ROH + "v" + bis` (wie die Update-Dateien;
    `plugin.testUpdateBasis` gilt auch hier), höchstens 256 KB. Abschnitte `## X.Y.Z – Titel` (`changelogAbschnitte`), Auswahl
    `von` (ausschließlich) bis `bis` (einschließlich), neueste zuerst, höchstens 8 (`abschnitteZwischen`). Gezeichnet mit
    `MarkdownRenderer` nach `markdownSicher` (kein HTML, keine Einbettungen, Wikilinks oder Codeblöcke, umbrochene Zeilen
    verbunden); danach bleiben nur https-Links. Fehler oder keine Abschnitte → `notiz` aus dem Manifest und Link „Auf GitHub
    ansehen“ auf das Release.
- **Mitzählen (seit 0.6.5, `zaehlen()`):** Der Autor will wissen, auf wie vielen Geräten eine Version läuft, ohne Telemetrie. Nach
  der frischen Prüfung ruft `zaehlen()` einmal je Gerät und Version `RELEASES + "/download/v" + laufend + "/zaehler.txt"` ab
  (`zaehlerUrl`, GET ohne Kopfzeilen); GitHub zählt jeden Abruf einer Release-Datei (`download_count`), sonst bleibt nichts.
  Gezählt wird der laufende Kern, also auch Geräte, die das Update über den Sync bekommen, und frische Installationen; ein
  wiederholtes Update zählt nicht doppelt. Merker `eba-update-gezaehlt` (gerätelokal) = gezählte Version; jede Antwort zählt
  als erledigt (auch 404, Entwicklungsstand ohne Release), ohne Netz beim nächsten Start. Nie bei zentralen Daten aus, Feld
  `zaehlen: false` in `System/Einstellungen.md` (Schalter **Mitzählen** unter dem Schalter **Beta-Versionen**, `zaehlenSchalter`;
  fehlt das Feld, ist es an), offener Einrichtung, `plugin.testZentralAus` oder `plugin.testUpdateBasis`
  (`zaehlenFaellig`). Test- und Entwicklungstresore zählen nie: dort steht gerätelokal `eba-update-gezaehlt` = `"nie"`
  (`app.saveLocalStorage`, einmal je Tresor und Gerät). `zaehlen` darf in der Vorlage nicht stehen (`pruefen.py`,
  `EINSTELLUNGEN_LEER`), sonst zählte nach einem Tipp im Entwicklungstresor kein neuer Tresor mehr. `release.py --zip` legt `zaehler.txt` neben die anderen Assets (`docs/release.md`). Grenzen: GitHub
  fasst Abrufe derselben IP für dasselbe Release in rund 10 Minuten zusammen (zwei Geräte im selben WLAN, die gleichzeitig
  starten, zählen einmal), und Bots, die Release-Seiten abgrasen, zählen mit. Tests: `tests/update-zaehlen.test.js`.
- **Fenster „Neue Version“** (seit 0.5.4, `fensterZeigen({ stufe, von, bis, angebot, ohneListe })`, `.eba-modal-update`): ein
  Fenster für das ganze Update, nie zwei übereinander (ein neues schließt das alte). Bis 0.5.2 kamen nacheinander das Fenster
  vor dem Update, der Hinweis „Lade …“ oben rechts und ein Ergebnisfenster, alle Teile gleich laut. Aufbau von oben (Rangfolge,
  CSS Abschnitt 51): Titel (groß), ein Satz (leise), „Wichtig“ (nur, wenn du noch etwas tun musst, auf Akzentfläche), die
  Änderungen aus `CHANGELOG.md` mit eigenem Bildlauf zwischen zwei Linien, der Fuß (klein und leise) und die Knopfreihe. Stufen
  (`data-stufe`):
  - `angebot`: „Neue (Beta-)Version X“, „Du hast Version Y.“, im Fuß „Deine Noten, Termine und Notizen bleiben. Vorher wird eine
    Sicherung angelegt.“; Knöpfe **Später** und **Neue Version installieren**. Öffnen zählt als gesehen (`eba-update-toast` mit
    `fenster: true`).
  - `laeuft`: „Version X wird installiert“, „Lass Obsidian offen, bis es fertig ist.“, im Fuß ein Balken (`role="progressbar"`)
    und der Schritt („Lade 4 von 7 Dateien …“, `fortschritt(text, anteil)` von `aktualisierenMit`); keine Knöpfe.
  - `fertig`: „Version X ist installiert“ und `ergebnisSatz`; `ergebnisZeilen` = „Noch ein Schritt“ (oben unter „Wichtig“, wenn
    der neue Kern nicht von selbst lud), im Fuß „Einstellungen“, „Deine Seiten“, „Deine Änderungen“, „Behalten“, „Andere Geräte“
    und „Sicherung“; Knopf **Fertig**.
  - `fehler`: „Nicht installiert“, ein Satz je Art (`netz`, `pruefsumme`, `liste`, `sicherung`, `schreiben`), der Grund klein im
    Fuß, ohne Änderungen; Knopf **Fertig**.
  - `neu`: „Was ist neu“, „Du hast jetzt Version X.“ (nach „Aktualisiert auf …“); Knopf **Fertig**.

  **Neue Version installieren** im Fenster wechselt gleich auf `laeuft` (keine zweite Frage); `aktualisieren(g)` schreibt
  Fortschritt und Ergebnis in dasselbe Fenster (`g.laeuft`, `g.fertig`). Kommt der Tipp von woanders (Dashboard, Verbindungen,
  Hinweis), fragt `fragen()` mit diesem Fenster und wartet auf `g.antwort`. „Update fertigstellen“ fragt nicht und öffnet es in
  `laeuft`. Hast du es während des Updates geschlossen, kommt das Ergebnis in einem neuen. Knöpfe: Hauptknopf zuletzt im DOM;
  PC und iPad nebeneinander rechts, Hauptknopf rechts; iPhone untereinander, Hauptknopf oben, ≥ 44 px (Obsidian stapelt Knöpfe
  auf iPad und iPhone sonst, `column-reverse`). Auf dem iPhone kommt es von unten wie Obsidians Bestätigungen, so hoch wie der
  Inhalt, der Titel links und mehrzeilig (Obsidian kürzt Titel dort sonst mit „…“).
- **Für Tests und andere Skripte:** `ctx.update` = `{ klasseVon, pfadOk, neuName, deineName, kopienVon, listePruefen, teilen,
  ohneHaken, seiteHaken, fmMischen, modulMischen, jsonMischenText, lesezeichenOhne, planen, aktualisierenMit(io, o),
  heilenMit(io, o), angebot, neuer, kanal, kanalSetzen, io, anzeige, hinweis, hinweisNeu, status, aktualisieren,
  installiertAnlegen, heilen, pluginNeuLaden, letzterBericht, fenster, changelogAbschnitte, abschnitteZwischen, markdownSicher,
  toastFaellig, toastEntscheiden, nachUpdate, pruefungFaellig, ergebnisSatz, ergebnisZeilen, frischPruefen, toastPruefen,
  toastWeg, toast, neuigkeitenZeigen, fensterZeigen, ergebnisZeigen, markeLage, MARKE, MARKE_STILL, markeNeu, suchen,
  zaehlenFaellig, zaehlerUrl, zaehlen, zaehlenAn, zaehlenSetzen, zaehlenSchalter, L_GEZAEHLT, ZAEHLER,
  handInstalliertMit(io, { lauf }), installiertNeu, WEITERE, CLAUDE_FRUEHER, claudeNachholenMit(io, o), claudeNachholen,
  claudeBekannt, L_CLAUDE }`
  (`fenster` = Griff des Fensters „Neue Version“ mit `m` = Obsidians Modal, `toast` = der Hinweis zum Update oder `null`).
  `aktualisierenMit` und `heilenMit` bekommen den Dateizugriff als `io` (`holen`, `lesen`, `schreiben`, `loeschen`, `liste`)
  und sind darum ohne Obsidian testbar (`tests/update.test.js`, Neuigkeiten: `tests/update-neuigkeiten.test.js`).
  `heilen(true)` startet die Reparatur und das Nachholen der Hinweise für Claude sofort, ohne die Merker des Geräts
  (`claudeNachholenMit`: `tests/update-claude.test.js`).
