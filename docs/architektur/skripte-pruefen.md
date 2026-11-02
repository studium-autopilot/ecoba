# Architektur: Prüfung der Skripte

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Prüfung der Skripte (seit 01.11.2026, `main.js`)

Der Kern führt die Skripte aus `System/Skripte/*.js` per `eval` aus ([architektur.md](../architektur.md), „Warum `eval`“). Ein
Skript hat damit alle Rechte von Obsidian, am Computer also Zugriff auf alle Dateien und Programme. In den Tresor schreiben aber
viele: der Sync von anderen Geräten, andere Plugins, Programme mit Zugriff auf den Ordner. Darum prüft der Kern jedes Skript,
bevor er es auswertet, beim Start (`skripteLaden`) und bei jedem Hot-Reload (`skriptNeuLaden`). Was die Prüfung nicht besteht,
wird nie ausgewertet, auch nicht teilweise.

### Wann ein Skript läuft

`skriptPruefen(pfad, sha)` → `liste`, `geraet`, `entwickler` oder `""` (gesperrt):

1. **`liste`:** Seine SHA-256 steht für genau diesen Pfad in einer geprüften Liste (unten).
2. **`geraet`:** Pfad und SHA-256 sind auf diesem Gerät erlaubt (Befehl „Skript auf diesem Gerät erlauben …“).
3. **`entwickler`:** Der Entwicklermodus ist auf diesem Gerät in diesem Tresor an.

Die SHA-256 geht über die Bytes, wie sie auf der Platte liegen. Angeglichen wird nur CRLF zu LF (git unter Windows, manche
Sync-Dienste); ein Byte mehr, weniger oder anders gilt als andere Fassung. Ausgewertet wird genau der geprüfte Text. Pfade
vergleicht der Kern in NFC. Skripte sind wie bisher nur `.js`-Dateien direkt in `System/Skripte/`, nie in Unterordnern.

Ein gesperrtes Skript steht in `plugin.abgelehnt` mit Grund `geaendert` (die Liste nennt den Pfad mit anderer Prüfsumme) oder
`unbekannt` (Konfliktkopie, neue Datei, untergeschoben). Die übrigen Skripte laufen; wer ein gesperrtes braucht (`ctx.user.<name>`
fehlt), meldet das wie jeden Ladefehler.

### Die geprüfte Liste

`System/Daten/system-dateien.json` (erzeugt `werkzeuge/release.py`, nennt Größe und SHA-256 jeder Datei der Version, siehe
[daten-v1.md](../daten-v1.md)) gilt nur mit ihrer Signatur `system-dateien.json.sig` daneben. Geprüft wird mit demselben Code und
denselben festen Schlüsseln wie beim Update ([„Update“](update.md), „Signatur der Liste“): Web Crypto mit Ed25519, sonst der
eingebaute Prüfer. Die Signatur kommt mit der ZIP (`release.py --zip` legt sie in den Baum) und mit jedem Update (`update.js`
schreibt sie neben die Liste). Eine Liste ohne gültige Signatur gilt nie, auch nicht beim ersten Start.

Geprüft wird die Signatur über die Bytes der Liste, wie sie auf der Platte liegen. Scheitert das und stehen CR darin (git unter
Windows, manche Sync-Dienste schreiben Zeilenenden um), prüft der Kern noch einmal mit LF statt CRLF (`listeSigniert`). Gemerkt
wird die Liste mit der SHA-256 ihrer Bytes mit LF; `update.js` vergleicht genauso. Die Signatur selbst darf CRLF haben.

`listeAuswerten()` prüft die Liste im Tresor und setzt `plugin.pruefung = { mengen, zustand, liste, version }` (`liste`: ihre
SHA-256):

| Zustand | Wann | Folge |
|---|---|---|
| `signiert` | Signatur gültig (aus dem Tresor oder aus dem Release), Version zulässig (unten) | Liste angenommen |
| `signatur-ungueltig` | eine Signatur liegt da (oder kam aus dem Release für die Version der Liste), ist aber ungültig: fremder Schlüssel, andere Bytes, falsche Form | keine neue Liste |
| `ohne-signatur` | keine Signatur im Tresor, und aus dem Release kam keine (offline, kein Asset, schon versucht) | keine neue Liste |
| `zurueck` | gültig signiert, aber älter als der laufende Kern oder als die neueste Liste, die dieses Gerät angenommen hat | keine neue Liste |
| `beta` | gültig signiert, eine Testversion (`X.Y.Z-beta.N`), auf diesem Gerät nicht freigeschaltet (unten) | keine neue Liste |
| `nicht-pruefbar` | das Gerät kann nicht prüfen (unten, „Sehr alte Geräte“) | keine neue Liste |
| `liste-ungueltig`, `keine-liste` | Liste nicht lesbar oder nicht da (etwa im Tresor dieses Repos) | keine neue Liste |

Ein Skript läuft, wenn es zu einer der angenommenen Listen passt (`mengen`), die dieses Gerät behält. Ohne neue Liste gelten die
zuvor angenommenen weiter. Hat das Gerät noch keine, läuft kein Skript.

- **Welche Listen bleiben** (`behalten`): höchstens vier, die der Version des laufenden Kerns und die drei neuesten angenommenen
  darüber (bis zur Marke), nur signierte. Ein Skript gilt, wenn es zu einer davon passt. Während ein Update über den Sync kommt,
  laufen so die Skripte des laufenden Kerns weiter, auch nach einem Neustart mittendrin. Hinkt der Kern hinterher (Kern k, der
  Tresor schon auf n), bleibt auch n: Wer danach die echte Liste n+1 in den Tresor legt, verdrängt weder k noch n, die Skripte von
  n laufen weiter, auch `update.js`. Neuere Listen verdrängen die des Kerns nie; eine der neueren fällt erst weg, wenn drei noch
  neuere angenommen sind. Kommt der neue Kern, fallen die Listen älterer Versionen weg.
- **Nie zurück:** Neu gilt eine Liste nur, wenn ihre Version nicht älter ist als die des laufenden Kerns und nicht älter als die
  neueste, die dieses Gerät je angenommen hat (Gerätespeicher `eba-skripte-hoechste`), auch echt signiert: Sonst ließen sich alte
  oder überholte Fassungen zurückholen, deren Fehler längst behoben sind. Die Liste der Version des laufenden Kerns gilt immer,
  ebenso eine, die dieses Gerät schon angenommen hat und noch behält. Im Entwicklermodus läuft ohnehin jedes Skript.
- **Testversionen:** Eine Liste mit der Version `X.Y.Z-beta.N` gilt nur, wenn auf diesem Gerät der Schalter **Beta-Versionen**
  (Fenster „Updates“, unter „Mehr erfahren“) in der App eingeschaltet wurde (`eba-skripte-beta`, über `ctx.skripte.beta`) oder der
  Entwicklermodus an ist; `update_kanal: beta` in `System/Einstellungen.md` allein reicht nie, die Datei kommt über den Sync.
  Kein Link und keine Aktion legt den Schalter um. Läuft der Kern selbst als Testversion, gilt seine Liste. Jedes Gerät braucht
  den Schalter selbst; er zeigt „an“ nur, wenn er auf diesem Gerät an ist (hat ihn ein anderes Gerät eingeschaltet, steht er
  hier aus, mit einem Satz dazu). Für die Marke zählen Testversionen nur, solange er an ist (`eba-skripte-hoechste-beta`); aus
  gilt für fertige Listen die neueste angenommene fertige Version. Bisher gab es keine Testversion.
- **Schon geprüft:** Dieselben Bytes wie eine angenommene signierte Liste gelten ohne neue Prüfung (schneller Start mit dem
  eingebauten Prüfer). Eine Signatur, die später kommt oder kaputt ist, ändert daran nichts; eine andere Liste braucht ihre eigene.
- **Für Skripte:** `ctx.skripte.listen()` gibt die signierten Listen, die gerade gelten, als `[{ version, liste }]` (neueste
  zuerst, eine Kopie, nur lesen). `update.js` nimmt Version und Prüfsummen fürs Nachholen nur aus Listen, deren Bytes eine davon
  sind ([„Update“](update.md), „Nur nach geprüften Listen“). `ctx.skripte.beta(an)` ruft nur der Schalter **Beta-Versionen**.

### Signatur aus dem Release

Fehlt die Signatur im Tresor (das Update von 0.7.6 oder älter, unten, oder der Sync bringt sie noch), holt der Kern sie von selbst
aus dem Release (`<RELEASES>/download/v<version>/system-dateien.json.sig`): erst die der Version des laufenden Kerns, dann die der
Version, die die Liste nennt, wenn diese gelten könnte. Von selbst fragt der Kern in einem Lauf nur nach der Kern-Version und
höchstens einer weiteren (`plugin.sigAndere`); Listen mit immer neuen Versionen lösen keine weiteren Anfragen aus, mehr holt erst
ein Tipp auf **Reparieren**. Eine echte Antwort (2xx oder 404) merkt sich der Kern bis zum nächsten Start (`plugin.sigGeholt`),
für diese Version fragt er dann nicht noch einmal. Ein Netzfehler, eine abgelaufene Frist (10 s) oder eine andere Antwort zählt
nicht: Die nächste Prüfung fragt wieder. Weil die Signatur der Kern-Version immer zuerst kommt, kann eine Liste, die eine andere
Version nennt, deren Abruf nicht verbrauchen. Meldet das Gerät, dass es offline ist, geht keine Anfrage raus. Kommt das Gerät
online (Ereignis `online`) und gilt die Liste im Tresor noch nicht, prüft der Kern einmal je Lauf neu und fragt dabei, was noch
keine Antwort hat. Liegt eine Signatur im Tresor, die nicht passt, holt der Kern von selbst keine; das tut erst ein Tipp auf
**Reparieren**.

Das ist eine Anfrage an GitHub wie beim Update, darum auch bei ausgeschalteten zentralen Daten
([datenschutz.md](../datenschutz.md)). Der Kern schreibt dabei nichts in den Tresor; jedes Gerät holt sie selbst.

### Sync in beliebiger Reihenfolge

Ein Update kommt auf den anderen Geräten über den Sync, Datei für Datei. Ein neues Skript, dessen Prüfsumme noch in keiner
angenommenen Liste steht, wartet gesperrt; die geladene alte Fassung läuft weiter. Ändert sich die Liste oder ihre Signatur
(anlegen, ändern, löschen, umbenennen; 1,5 s entprellt), prüft `skripteNachpruefen()` neu und lädt jedes gesperrte Skript, das
jetzt passt. Läufe kommen nacheinander. Die Ereignisse sind schon vor dem ersten Laden angemeldet (das wartet vielleicht auf das
Release); was der Sync in dieser Zeit schreibt, prüft der Kern gleich danach. Unverändert bleibt: Während eines Updates kein
Hinweis (`plugin.stillBis`), mehrere Skripte auf einmal bleiben still (`hinweisSammeln`), der Kern lädt sich nach dem Update neu,
und auf anderen Geräten steht die Zeile „Neu laden“.

### Hinweis bei gesperrten Skripten

Ein Hinweis nennt die gesperrten Skripte, beim Start nach 5 s, beim Hot-Reload nach einer Minute ohne neuen Fund (bis dahin ist
ein Update über den Sync meist ganz da), nie während eines Updates und für dieselben Fassungen nur einmal je Lauf. Er bleibt
stehen (Obsidian-Hinweis mit Dauer 0), bis nichts mehr gesperrt ist (Liste oder Signatur sind nachgekommen, Reparieren oder
Erlauben hat geklappt) oder du ihn schließt (ein Tipp darauf, auf dem iPhone auch Wegwischen). Ein neuer Stand ersetzt ihn, nie
stehen zwei. Der Text:

- Nennt eine angenommene Liste den Pfad (Grund `geaendert`): „Ein Teil der App wurde nicht gestartet, weil er nicht zur
  installierten Version passt (…).“
- Nennt keine ihn (Grund `unbekannt`): „… gehört nicht zur App und wurde nicht geladen.“ Den Befehl zum Erlauben nennt der
  Hinweis nicht; es gibt ihn trotzdem (unten).
- Ohne jede angenommene Liste und ohne Signatur (offline beim ersten Start): „Die App startet, sobald sie einmal geprüft hat, dass
  ihre Teile echt sind (…). Dafür braucht dieses Gerät einmal eine Verbindung zum Internet. Ist es verbunden, tippe auf
  „Reparieren“.“ Die Skripte warten; kommt das Gerät online, prüft der Kern von selbst neu.
- Sonst ohne jede angenommene Liste: „Die App startet nicht, weil sich die Liste ihrer Teile nicht prüfen lässt (…).“, „… weil
  im Tresor die Liste ihrer Teile fehlt (…).“ oder „… weil im Tresor die Liste einer älteren Version liegt (…).“, je mit
  Reparieren. Diese Zustände kann jeder herstellen, der in den Tresor schreibt; darum nennt der Hinweis nie den Entwicklermodus
  oder das Erlauben, nur Reparieren.
- Eine echte Testversion, die dieses Gerät nicht freigeschaltet hat (Zustand `beta`): der Satz nennt den Schalter
  **Beta-Versionen**, ohne Knopf Reparieren. Kommt ihre Liste vor ihrer Signatur (die alte liegt noch da), ist der Zustand erst
  `signatur-ungueltig` mit Reparieren; der Tipp holt zuerst die Signatur der Testversion, danach gilt dasselbe.

Der Knopf **Reparieren** steht dabei, wenn es eine echte Fassung zu holen gibt oder die Liste im Tresor nicht gilt. Hinkt der Kern
hinterher (unten, „Neu laden“), sagt ein Satz „Auf diesem Gerät läuft noch Version …; „Neu laden“ holt Version ….“, mit dem Knopf
**Neu laden** als Hauptknopf. Ist alles Gesperrte geladen (Reparieren, Erlauben, Liste nachgekommen, „Erweiterungen neu
laden“), verschwindet der Hinweis von selbst; beim Entladen des Plugins (Neu laden, Update) auch, die neue Instanz zeigt ihren
eigenen.

Geschlossen zeigt ihn der nächste Start wieder. Bis dahin führt ein Weg zurück, nur aus dem Kern (also auch, wenn `update.js`
oder `seitenleiste.js` gesperrt sind), solange etwas gesperrt ist:

- Am Computer ein Eintrag in der Statusleiste, ab dem ersten Hinweis: „Studium Autopilot wartet“ (ohne angenommene Liste und
  ohne Signatur, das Gerät braucht einmal Internet), sonst „Studium Autopilot prüfen“. Ein Klick zeigt den Hinweis mit seinen
  Knöpfen noch einmal, auch für dieselben Fassungen und während eines Updates. Ist nichts mehr gesperrt, ist der Eintrag weg.
- iPhone und iPad haben keine Statusleiste: Wer dort das Dashboard oder **Einstellungen & Hilfe** öffnet (`ABLEHNUNG_SEITEN`,
  Ereignis `file-open`), sieht den geschlossenen Hinweis wieder; nicht vor dem ersten Hinweis des Laufs, nicht während eines
  Updates, nie neben einem offenen. Ein Symbol in der Seitenleiste ginge dort nicht verlässlich: Auf dem iPhone stünde es im
  Menü hinter ≡, und das ersetzt `seitenleiste.js` durch die Übersicht.

Der Hinweis „Der Entwicklermodus ist an …“ bleibt, wie er war: einmal je Start, er geht von selbst.

### Neu laden: der Kern holt sich selbst nach

Liegt die Marke über der Version des laufenden Kerns (der Tresor ist schon auf n, auf diesem Gerät läuft noch k), holt der Kern
seine eigenen Dateien nach, ohne `update.js`: auch dann, wenn `update.js` selbst gesperrt ist. Er nimmt die angenommene Liste der
Marke; sie nennt Größe und SHA-256 von `main.js`, `styles.css` und `manifest.json` im Ordner des Plugins (gemerkt mit der Liste,
`kern`). Nach der Bestätigung „Neu laden?“ lädt `kernAufholen` jede Datei, die nicht schon so auf der Platte liegt, vom Tag
`v<n>` (`raw.githubusercontent.com`) und prüft sie. Erst wenn alle da sind: die alten in die Sicherung
`.trash/Studium Autopilot Sicherung <k> <Zeit>/`, die neuen schreiben (`manifest.json` zuletzt; ein Schreibfehler setzt das schon
Geschriebene zurück), dann das Plugin aus- und wieder einschalten. Kein Netz, falsche Prüfsumme, abgebrochen → nichts geändert;
lässt sich das Plugin nicht neu laden: „Bitte Obsidian einmal schließen und wieder öffnen.“

### Befehle

Nur in der Befehlspalette. Ein Link `obsidian://studium-autopilot?aktion=…` erreicht sie nie: Er nennt nur Aktionen
([„Aktionen“](aktionen.md)), und keine Aktion führt einen dieser Befehle aus (`tests/skripte-pruefen.test.js`).

| Befehl | Sichtbar | Wirkung |
|---|---|---|
| **Skripte reparieren …** (auch Knopf **Reparieren** im Hinweis) | etwas gesperrt | Nur der Kern, geht also auch, wenn `update.js` selbst gesperrt ist; ein Tipp darf abrufen, auch mit ausgeschalteten zentralen Daten. 1. Gilt die Liste im Tresor nicht, holt der Tipp ihre Signatur neu aus dem Release, erst die der Version, die die Liste nennt, dann die der Kern-Version, und lädt, was dann passt, ohne Download. 2. Gilt sie dann immer noch nicht (lässt sich nicht prüfen, fehlt, eine echte unter der Marke): Liste und Signatur der Zielversion aus ihrem Release (`<RELEASES>/download/v<version>/`, fester Ort, Version geprüft). Zielversion ist die höhere von Kern-Version und Marke (`zielVersion`), nie eine darunter: Ein Gerät, dessen Kern hinterherhinkt, setzt den gemeinsamen Tresor so nie zurück. Geprüft werden Signatur, Version und, hat dieses Gerät die Liste dieser Version schon angenommen, dieselbe SHA-256. 3. Fenster „Reparieren?“ mit dem, was passiert („Die Liste der App im Tresor lässt sich nicht prüfen.“, „Im Tresor fehlt die Liste der App.“ oder „Im Tresor liegt die Liste von Version …; dieses Gerät kennt schon Version …“, dann welche Liste und welche Teile von GitHub kommen), dann: Liste und Signatur aus dem Tresor in die Sicherung `.trash/Studium Autopilot Sicherung <version> <Zeit>/`, die echten schreiben, neu prüfen; für jedes gesperrte Skript, das die Liste mit anderer Prüfsumme nennt, die echte Fassung vom Tag `v<version>` (`raw.githubusercontent.com`, Pfad in NFC wie in der Liste), Größe und SHA-256 geprüft, erst wenn alle da sind deine Fassung in dieselbe Sicherung, die echte schreiben und laden. Kein Netz, falsche Prüfsumme, abgebrochen → nichts geändert. Eine Liste, die sich als echte Testversion zeigt, ersetzt Reparieren nie; dann nur der Satz zum Schalter |
| **Skript auf diesem Gerät erlauben …** | etwas gesperrt | Auswahl, dann ein Fenster mit Pfad und Warnung; erlaubt genau diese Fassung (Pfad und SHA-256). Jede spätere Änderung ist wieder gesperrt |
| **Entwicklermodus einschalten …** | aus | Fenster mit Warnung; danach läuft auf diesem Gerät in diesem Tresor jedes Skript ohne Prüfung, jede Änderung lädt sofort. Bei jedem Start ein Hinweis, dass er an ist |
| **Entwicklermodus ausschalten** | an | lädt alle Skripte neu, nur noch geprüfte |
| **Neue Version auf diesem Gerät laden …** (auch Knopf **Neu laden** im Hinweis) | der Kern hinkt hinter der Marke her | Fenster „Neu laden?“, dann die Dateien des Kerns der Marke vom Tag, geprüft mit der angenommenen Liste, alte in die Sicherung, Plugin neu laden (oben, „Neu laden“) |

Der Tresor dieses Repos hat keine Liste (sie entsteht erst beim Release); wer dort entwickelt, schaltet den Entwicklermodus ein
([CONTRIBUTING.md](../../CONTRIBUTING.md)), der Hinweis nennt ihn mit Absicht nicht. Die Tests brauchen das nicht.

### Übergang von 0.7.6 und älter

Das Update von 0.7.6 oder älter plant noch der alte `update.js`: Er legt keine Signatur in den Tresor (Releases bis 0.7.6 haben
auch keine, Stand 01.11.2026). Der neue Kern holt sie darum beim ersten Start aus dem Release seiner Version (oben, „Signatur aus
dem Release“) und merkt sich die Liste; jeder spätere Start braucht kein Netz. Dafür braucht jedes Gerät nach diesem Update
einmal eine Verbindung. Offline warten die Skripte mit dem Hinweis oben, bis das Gerät online kommt, neu startet oder du auf
**Reparieren** tippst. Eine Liste ohne gültige Signatur gilt auch in dieser Zeit nie.

### Gerätespeicher

Alles liegt in `app.loadLocalStorage` (je Gerät und Tresor, nie in einer Datei des Tresors, nie im Sync):

| Schlüssel | Inhalt |
|---|---|
| `eba-skripte-listen` | angenommene Listen nach `behalten` (die der Kern-Version und bis zu drei neuere): `{ art: signiert, version, liste (SHA-256 mit LF), skripte: pfad → { sha256, groesse }, kern: ebenso für die Dateien des Kerns }` |
| `eba-skripte-hoechste` | neueste fertige Version, deren Liste dieses Gerät angenommen hat; keine neue Liste darunter |
| `eba-skripte-hoechste-beta` | neueste Testversion, deren Liste dieses Gerät angenommen hat; zählt nur mit dem Schalter **Beta-Versionen** |
| `eba-skripte-beta` | `true`: Listen von Testversionen gelten (Schalter **Beta-Versionen** in der App) |
| `eba-skripte-erlaubt` | auf diesem Gerät erlaubte Skripte: pfad → SHA-256 |
| `eba-skripte-entwickler` | `true`: Entwicklermodus an |

Schlüssel früherer Entwicklungsstände dieser Prüfung (`eba-skripte-signiert`, `eba-skripte-tofu`) löscht der Kern beim Start.

### Was die Prüfung nicht abdeckt

- **Hinkender Kern:** Läuft noch ein älterer Kern k, gelten die echten Listen k und die bis zu drei neuesten gemerkten darüber.
  Ein Skript kann dann zwischen diesen Fassungen wechseln; alle sind echter Code eines Releases. Wer echte, neuere Releases in den
  Tresor legt, kann die Marke eines Geräts hochziehen; Reparieren legt dann die Liste dieser neueren Version in den Tresor (nie
  eine ältere).
- **Erste Liste eines Geräts:** Ein Gerät, das noch keine Liste angenommen hat, nimmt jede echte, signierte Liste ab der Version
  seines Kerns an, auch eine ältere als die neueste veröffentlichte. Erst danach gilt „nicht älter als die neueste angenommene“.
- **Schreiben ist nicht gesperrt, nur Ausführen:** Wer in den Tresor schreiben kann, etwa Claude Code im Tresor mit seiner Shell
  oder ein anderes Programm, kann weiter Dateien in `System/Skripte/` legen; der Kern führt sie nur nicht aus. Den Kern selbst
  (`main.js`), andere Plugins und den Gerätespeicher deckt die Prüfung nicht ab: Wer die ändern kann, hat Obsidian ohnehin.
- **Kern über den Sync:** Self-hosted LiveSync gleicht auf Wunsch auch versteckte Dateien ab (die Einstellungen vom eigenen
  Server schalten das ein, `server/livesync.mjs`). Ein Gerät, das mit dem Tresor abgleicht und selbst nicht mehr
  vertrauenswürdig ist, könnte so einen geänderten Kern `.obsidian/plugins/studium-autopilot/main.js` auf alle anderen Geräte
  bringen. Den Kern selbst prüft niemand.
- **Widget:** Den Zeichner `widget-scriptable.js` im Ordner des Plugins führt Scriptable aus, nicht der Kern
  ([„Widgets“](widget.md)). Er liegt außerhalb dieser Prüfung, mit den Rechten von Scriptable.
- **Sehr alte Geräte:** Der eingebaute Prüfer braucht SHA-512 aus Web Crypto und BigInt (Safari ab 14). Ohne das kann das Gerät
  nicht prüfen (der Kern lädt trotzdem): Es nimmt keine Liste an (`nicht-pruefbar`), kein Skript läuft, der Hinweis sagt es.

Tests: `tests/skripte-pruefen.test.js` mit dem Kern im Speicher (`tests/kern.js`), Prüfer: `tests/ed25519.test.js`,
`tests/update-signatur.test.js`.
