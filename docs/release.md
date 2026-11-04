# Ein Release bauen

Zielgruppe: der Autor bzw. wer Releases veröffentlicht.

**Grundsatz:** Dieses Repo ist nie die Arbeitskopie. Jeder Stand entsteht frisch aus einem **Export mit Freigabeliste**: Nur
ausdrücklich freigegebene Pfade kommen in den Release-Baum, alles andere bleibt draußen. Die Arbeits-Historie wird nie
hochgeladen.

## 1. Release-Baum bauen

In der Arbeitskopie (nicht in diesem Repo) baut ein Export-Skript den Baum in einen leeren Ordner, **alles aus dem letzten
Commit** der Arbeitskopie (`git archive`):

- `Studium Autopilot/` ohne Papierkorb, gerätelokale Obsidian-Dateien, fremde Plugins und ohne die Dateien, die ein Tresor
  selbst anlegt (Abrufer-Sperren, `installiert.json`, ILIAS-Index, Lernstände, Noten aus Alma, Textfassungen der PDFs); ohne
  zentrale Termine in `Termine/`, deren Ende mehr als 30 Tage vor dem Export liegt (gleiche Grenze wie `zentral.js`, das solche
  Notizen nie mehr anfasst; sonst bekäme jede neue Installation sie für immer). Bestehende Tresore verlieren dabei nichts:
  Termine stehen nicht in der Update-Liste, ein Update fasst sie nie an;
- `docs/`, `.github/` (ohne Dateien mit „privat“ oder „intern“ im Namen) und `server/` (der eigene Server; `server/VERSION`
  wird die Plugin-Version);
- `tests/` ohne den Test für den Export selbst (`release.test.js`; `release.py` ist nicht im Release);
- an der Wurzel `README.md`, `LICENSE`, `LICENSE-INHALTE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`,
  `THIRD_PARTY_NOTICES.md` (dazu `CODE_OF_CONDUCT.md` und `CITATION.cff`, falls vorhanden) und für Tests und Lint
  `package.json`, `package-lock.json`, `eslint.config.mjs`, `ruff.toml`;
- `werkzeuge/pruefen.py`, eine eigene `.gitignore` und eine `.gitattributes` (`* -text`: Dateien byte-genau, sonst stimmen die
  Prüfsummen der Update-Liste nicht).

Die vollständige Freigabeliste steht am Anfang von `werkzeuge/release.py`.

Geänderte, aber nicht committete und neue, ungetrackte Dateien kommen nie in den Baum, auch nicht unter `docs/` oder
`tests/`. Der Export nennt sie als **WARNUNG** („nicht committet“); vor einem Release darf sie nicht erscheinen. Nur zum
Testen nimmt `--arbeitsstand` den Arbeitsordner statt des Commits; so gebaut wird nie veröffentlicht.

Dann schreibt der Export die **Update-Liste** `Studium Autopilot/System/Daten/system-dateien.json`: Version, und je Datei, die
ein Update ersetzen darf, Pfad, Klasse, Größe und SHA-256 (Regeln in `werkzeuge/pruefen.py`, `klasse_von`, gleich wie
`klasseVon` in `update.js`). Mit ihr installiert der Knopf **Neue Version installieren** im Plugin die neue Version (siehe `docs/architektur/update.md`).
Die Hinweise für Claude (`.claude/CLAUDE.md`, Skill `studium-autopilot`, Klasse `claude`) stehen im eigenen Schlüssel `weitere`
hinter `dateien`, weil Plugins bis 0.6.8 eine Liste mit ihnen in `dateien` ganz ablehnen; `pruefen.py` meldet es, wenn eine
Klasse im falschen Schlüssel steht.

Danach läuft **immer** `werkzeuge/pruefen.py` über den Baum, lokal zusätzlich mit einer privaten Sperrliste (Namen, die nie
veröffentlicht werden dürfen). Sie prüft auch, dass die Update-Liste zu den Dateien passt. Bei einem Fund bricht der Export mit
einer Liste ab; korrigiert wird in der Quelle, dann neu bauen.

Die Prüfung kennt den Tresor als **Erlaubnisliste** (`TRESOR_ERLAUBT` in `werkzeuge/pruefen.py`): Unter `Studium Autopilot/` darf
nur stehen, was die Vorlage kennt (ihre Ordner und Dateiarten; im Ordner des Plugins nur `main.js`, `manifest.json` und
`styles.css`). Jeder andere Pfad ist ein Fund, auch eine harmlos aussehende Datei. Dazu kommen Verbote für lokale und private
Dateien in jedem Ordner: `.env` und `.env.*` (Vorlagen heißen darum `env.example`), `.mcp.json`, `CLAUDE.local.md`,
`.claude/settings.local.json` und die Widget-Daten je Gerät (`widget-iphone.json`, `widget-ipad.json`). `.gitignore`, der Export
(`vault_auslassen` in `release.py`) und die Prüfung müssen dieselben Dateien meinen; `tests/release.test.js` prüft das mit
`werkzeuge/listen_pruefen.py`, wenn eine Liste geändert wird.

Mit `--zip` baut der Export zusätzlich **`Studium-Autopilot.zip`** mit dem Inhalt des Ordners `Studium Autopilot/`, ohne den
Ordner selbst: Windows („Alle extrahieren“), Android und macOS legen beim Entpacken genau einen Ordner `Studium-Autopilot` an,
der selbst der Tresor ist. (Bis 0.5.7 lag der Ordner im Archiv; unter Windows und Android entstand
`Studium-Autopilot/Studium Autopilot/`, und wer den äußeren Ordner öffnete, hatte einen leeren Tresor.) Der Name ist fest und
ohne Version: Die Anleitung und der grüne Knopf der README laden
`https://github.com/studium-autopilot/ecoba/releases/latest/download/Studium-Autopilot.zip`, der iOS-Kurzbefehl daneben
`Studium-Autopilot-iOS.zip` (der Tresor zwei Ebenen tief, siehe unten). **Beide Assets müssen bei jedem Release genau so
heißen.** Daneben entstehen `studium-server.tar.gz` mit seiner Signatur `studium-server.tar.gz.sig` (siehe „Signatur des
Server-Pakets“) und `system-dateien.json` mit ihrer Signatur `system-dateien.json.sig` (siehe „Signatur der Update-Liste“).
Assets eines früheren Laufs löscht `--zip` vorher, damit nach einem Abbruch nichts bereitliegt, was nicht zu diesem Baum gehört.

### Signatur des Server-Pakets

Jeder eigene Server installiert täglich das neueste Server-Paket als root (`studium-server aktualisieren`). Die Prüfsumme, die
GitHub zum Asset zeigt, schützt nur vor einem kaputten Download: Wer das GitHub-Konto oder ein Token des Repos hätte, könnte ein
Release mit eigenem Paket anlegen, und GitHub zeigte die passende Prüfsumme dazu. Darum signiert der Export das Paket, und der
Server installiert nur, was einer der Schlüssel in `server/allowed_signers` **des laufenden Pakets** signiert hat (nie die Datei
aus dem Download):

- `release.py --zip` signiert mit `ssh-keygen -Y sign -n studium-server` und dem Schlüssel, der auch die Commits signiert
  (`git config user.signingkey`, Pfad der `.pub`-Datei; ssh-keygen nimmt den privaten Schlüssel daneben oder aus dem ssh-agent).
  Danach prüft er die frische Signatur mit `ssh-keygen -Y verify` gegen `server/allowed_signers` im Baum, genau wie der Server.
- `server/allowed_signers` muss den Signierschlüssel nennen (Prinzipal `release@studium-autopilot`, `namespaces="studium-server"`).
  Fehlt der Schlüssel, passt die Datei nicht oder scheitert eine der Prüfungen, bricht `--zip` ab und löscht das Paket: Es gibt
  nie ein Release ohne gültige Signatur. Die Meldung nennt die Zeile, die in die Datei gehört.
- `studium-server aktualisieren` lädt `studium-server.tar.gz.sig` mit, prüft Prüfsumme und Signatur und installiert sonst nichts;
  der Grund steht im Status (`signatur-fehlt`, `signatur`). Danach muss `server/VERSION` im Paket genau der Tag ohne `v` sein
  (sonst `version`): Ein altes signiertes Paket unter einem neuen Release gilt nicht. Wann ein Server ein neues Paket nimmt
  (gestaffelt bis 48 Stunden nach der Veröffentlichung) und wann er zurückrollt: `server/README.md`, „Updates des Server-Pakets“.
- **Übergang:** Server mit 0.7.5 oder älter haben noch das alte `aktualisieren` ohne Signatur. Sie installieren das erste
  signierte Release wie bisher nur mit der Prüfsumme; erst ab dann prüft jeder Server jedes weitere Paket.
- **Ersteinrichtung:** `start.sh`, `fern.sh installieren` und die Startdaten aus `einrichten.mjs` prüfen die Signatur gegen
  Schlüssel, die fest in ihnen stehen (`SIGNIERSCHLUESSEL`), nicht gegen `allowed_signers` aus dem Paket, das sie gerade prüfen.
  `tests/paket-pruefen.test.js` verlangt dieselben Schlüssel wie in `server/allowed_signers`; ein Schlüsselwechsel ändert alle vier
  Stellen zugleich. Eine Einrichtung mit einem älteren Tag lädt das Paket dieses Tags und prüft es mit dessen Schlüsseln.
- **Test- und Beta-Pakete** im eigenen Namensraum `studium-server-test`, nie in `studium-server`: `release.py` signiert mit `--beta`
  und `--arbeitsstand` das Server-Paket in diesem Namensraum, prüft die frische Signatur gegen eine Kopie von `allowed_signers`,
  deren Zeilen ihn nennen, und setzt im Baum in `server/start.sh` `NAMENSRAUM=studium-server-test` (fehlt die Zeile
  `NAMENSRAUM=studium-server` dort, bricht es ab), damit die Einrichtung einer Beta ihr Paket annimmt. Ein Release für alle bleibt
  unverändert. Ein Server nimmt Test-Pakete nur mit der
  Zusage `/etc/studium-server/testpakete` an, die nur root auf ihm anlegt; auf einem Server von Studierenden gilt eine solche
  Signatur nie. `allowed_signers` nennt dafür keine eigene Zeile: `aktualisieren` prüft mit denselben Schlüsseln und tauscht nur den
  Namensraum (jede Zeile bleibt in der Form, die `release.py` prüft).
- **Schlüssel sperren:** `server/revoked_keys` (eine Zeile je Schlüssel wie in einer `.pub`-Datei, leer, solange keiner gesperrt
  ist) geht mit jedem Paket hinaus. Jeder Server führt daraus eine eigene Liste `/etc/studium-server/revoked_keys` (nur root), die
  nur wächst: Der Installer ergänzt sie vor allem anderen um die Datei seines Pakets, `aktualisieren` um die des laufenden und, nach
  der Prüfung, um die des neuen Pakets. Geprüft wird mit dieser Liste (`ssh-keygen -Y verify -r`). So nimmt weder ein Zurückrollen
  noch ein älteres Paket eine Sperre zurück. Nur öffentliche Schlüssel im Format einer `.pub`-Datei, vorn der Typ (keine Optionen
  wie in `authorized_keys`, die `ssh-keygen -l` durchlässt, `-Y verify -r` aber nicht), keine KRL: `release.py --zip` liest jede Zeile
  von `server/revoked_keys` so und bricht ab, wenn eine kein Schlüssel ist oder einen Schlüssel nennt, der noch in `allowed_signers`
  steht (Typ und Base64 verglichen; der gehört dort zuerst heraus). Die Signatur des Server-Pakets prüft es danach auch mit `-r` gegen
  die Liste. Auf dem Server übernimmt die Liste nur lesbare Zeilen; eine kaputte
  ließe sonst jede Prüfung mit 255 scheitern. root kann einen Schlüssel auch von Hand eintragen (dauerhaft) und die Liste reparieren
  (`server/README.md`, „Gesperrte Schlüssel wachsen nur“).
- **Mindestversion:** `server/MINDESTVERSION` (im signierten Paket; erste Zeile ohne `#`) nennt die älteste Version, auf die ein
  Server zurückrollen darf. Der Installer hält die höchste je gesehene in `/etc/studium-server/mindestversion` fest (nur root, sinkt
  nie). Scheitert eine Installation und läge das bisherige Paket darunter, rollt er nicht zurück: Der Server bleibt auf der neuen
  Version, der Status meldet `mindestversion`, und der nächste Lauf installiert sie noch einmal. Anheben, wenn ältere Pakete eine
  Lücke haben oder eine Sicherung nicht kennen, auf die ein Zurückrollen nicht verzichten darf (etwa ein Release, das eine Sperre
  einführt, die ältere Pakete nicht prüfen). `release.py` bricht ab, wenn sie über der gebauten Version liegt (nur bei Paketen,
  die Server installieren: Release mit `--zip` und Beta, nicht `--arbeitsstand`); eine Beta X.Y.Z-beta.N darf X.Y.Z nennen.
  Zurzeit die Version, mit der das Kopieren beim Zurückrollen (Quelle = Ziel) und die Liste gesperrter Schlüssel von root
  erscheinen: Ältere Installer brächen beim Zurückrollen ab. Die Schlüssel je Gerät heben sie nicht an, obwohl ältere Pakete das Ende
  des gemeinsamen Schlüssels nicht kennen: Unter sie rollt nur das erste Update auf sie zurück, und dann gibt es noch nichts zu schützen
  (`server/README.md`, „Schlüssel je Gerät“ → „Zurückrollen“). Ein Not-Aus aus der Ferne (ein Release, das Server anhält) gibt es nicht; das wäre ein
  eigener Kanal mit eigener Signatur.
- **Schlüssel wechseln:** Server prüfen mit der Datei ihres laufenden Pakets. Ein neuer Schlüssel kommt darum zuerst als zweite
  Zeile in `server/allowed_signers` und geht mit einem Release hinaus, das noch der alte signiert (`release.py` warnt dabei);
  ab dem nächsten Release signiert der neue, danach die alte Zeile löschen. Ist der alte Schlüssel verloren, nehmen Server neue
  Pakete nur noch über eine neue Einrichtung an.

### Signatur der Update-Liste

Programmteile installiert das Plugin nur nach einem Tipp auf **Neue Version installieren**, dann aber am Computer mit vollem
Zugriff auf Dateien und Schlüsselbund. Die Prüfsumme der Liste im Manifest hilft gegen ein übernommenes Konto nicht: Wer das
GitHub-Konto oder ein Token hätte, schriebe auch das Manifest. Darum signiert der Export die Liste, und das Plugin installiert
nur eine Liste, die einer der Schlüssel in `SIGNATUR_SCHLUESSEL` signiert hat, und zwar im Kern `main.js` **der installierten
Version** (`docs/architektur/update.md`, „Signatur der Liste“). Mit derselben Signatur prüft der Kern beim Start, ob die Skripte im
Tresor zu dieser Version gehören (`docs/architektur/skripte-pruefen.md`):

- `release.py --zip` signiert genau die Bytes von `system-dateien.json` mit `ssh-keygen -Y sign -n studium-autopilot-plugin` und
  demselben Schlüssel wie das Server-Paket, als Asset `system-dateien.json.sig`. Wegen des eigenen Namensraums gilt eine
  Signatur für ein Server-Paket (`studium-server`) oder einen Commit (`git`) nie als Signatur der Liste.
- Dieselbe Datei legt `--zip` byte-gleich in den Baum (`Studium Autopilot/System/Daten/system-dateien.json.sig`), bevor es die
  ZIPs baut: Ein Tresor aus der ZIP prüft seine Skripte damit vom ersten Start an. Die Liste nennt ihre eigene Signatur nicht.
- Vorher muss `main.js` im Baum den Signierschlüssel in `SIGNATUR_SCHLUESSEL` nennen, sonst lehnten Plugins dieser Version
  das nächste Update ab; die Meldung nennt den Eintrag, der hinein gehört. Danach prüft `release.py` die frische Signatur mit
  `ssh-keygen -Y verify` gegen genau diese Schlüssel. Scheitert eins, bricht `--zip` ab, Liste und Signatur sind weg.
  `SIGNATUR_SCHLUESSEL` und `server/allowed_signers` nennen dieselben Schlüssel (`tests/update-signatur.test.js`).
- Im Baum prüft `ECOBA_RELEASE=.. npm test` die echte Signatur zusätzlich mit dem Code des Kerns (`signaturPruefen` mit den
  festen Schlüsseln, siehe „2. Prüfen“) und dass die Signatur im Baum dieselbe ist wie das Asset. In GitHub Actions ist dieser
  Test übersprungen; die übrigen prüfen das Format mit Wegwerf-Schlüsseln und ssh-keygen.
- **Übergang:** Plugins bis 0.7.6 laden die Signatur nicht. Das Update auf die erste signierte Version prüfen sie wie bisher nur
  mit der Prüfsumme, ab dann prüft jedes Plugin jedes Update. Dieses eine Update legt auch keine Signatur in den Tresor; der neue
  Kern holt sie beim ersten Start aus dem Release seiner Version. Darum braucht schon das erste Release mit der Prüfung der
  Skripte das Asset `system-dateien.json.sig` (sonst startet auf keinem Gerät ein Skript, siehe skripte-pruefen.md).
- **Fehlt die Signatur im Release**, installiert kein Plugin ab der ersten signierten Version das Update („ließ sich nicht als
  echt bestätigen“). Releases sind unveränderlich: dann eine neue Version mit Signatur veröffentlichen.
- **Schlüssel wechseln:** zusammen mit dem Server-Paket (oben), nur langsamer: Plugins prüfen mit den Schlüsseln der
  installierten Version, und ein Tresor bleibt oft Wochen auf seiner. Der neue Schlüssel kommt zuerst als zweiter Eintrag in
  `SIGNATUR_SCHLUESSEL` und `server/allowed_signers`, mit Releases, die noch der alte signiert (`release.py` warnt dabei); erst
  deutlich später signiert der neue. Wer dann noch eine Version ohne ihn hat, kommt nur über die ZIP weiter; ist der alte
  Schlüssel verloren, gilt das für alle.

### Herkunft des Releases

Der Release-Baum ist kein Commit der Arbeitskopie; später ließe sich nicht mehr sagen, aus welchem Stand ein Release kam. Darum
legt `release.py --zip` für ein echtes Release (nicht `--beta`, nicht `--arbeitsstand`; Version in der Form `X.Y.Z`) die lokale
Referenz `refs/releases/vX.Y.Z` auf die volle SHA des gebauten Commits und druckt sie als „Quelle des Releases“. Die Referenz
ist nicht Teil der veröffentlichten Historie und wird nie hochgeladen.

- **Jeder echte Bau setzt die Referenz neu** (`git update-ref -m "release.py vX.Y.Z"`, mit Reflog). Hat ein anderer Chat
  committet und wird neu gebaut, zeigt sie danach auf den neuen Stand, und die Ausgabe nennt den alten: „(vorher …)“. Die
  Referenz nennt so den **letzten Bau** der Version, und der ist der gepushte, weil nur vom gebauten HEAD gepusht wird.
- Frühere Bauten bleiben im Reflog: `git reflog refs/releases/vX.Y.Z`.
- Nachsehen: `git for-each-ref refs/releases/` zeigt alle Releases mit ihrem Commit, `git log refs/releases/v0.7.7` den Stand
  dahinter.

Am Ende druckt der Export den Block für das Manifest der zentralen Daten (`release` mit `version`, `url_basis`, `sha256` der
Update-Liste, `notiz`), siehe Schritt 6.

## 2. Prüfen

```
python werkzeuge/pruefen.py .
npm ci && ECOBA_RELEASE=.. GITHUB_ACTIONS=true CI=true npm test && npm run lint
python -m ruff check werkzeuge/ server/
```

Die Tests laufen mit den Variablen der CI: Dort schreibt `pruefen.py` zu jedem Fund eine Anmerkung für GitHub, und ein Test,
der die Ausgabe liest, kann nur dort scheitern (so geschehen mit 0.6.9). `ECOBA_RELEASE=..` zeigt auf die Assets neben dem Baum:
Dann prüft `tests/update-signatur.test.js` auch die echte Signatur der Liste mit dem Code des Plugins. `tests/update.test.js` prüft dabei auch die Update-Liste im Baum (Klassen, Größen, Prüfsummen, keine Datei vergessen).
Dazu der Testdurchgang in Obsidian (siehe `docs/tests.md`): den Baum als neuen Tresor mit anderem Namen öffnen, iPhone, iPad,
Android, Windows, Mac, hell und dunkel.

Feste Werte, die Dependabot nicht sieht (je Release kurz prüfen, bei Bedarf anheben und den Stand im Kommentar daneben):
- Die Pakete der OCI-Kommandozeile in `server/platzsucher-helfer.yaml` (`oci-pakete.txt`: `oci-cli` und jedes Paket, das es
  braucht, je genau eine Version und die SHA-256 genau eines Wheels für den Helfer, x86_64 mit Python 3.12). Neueste Version
  von `oci-cli` auf PyPI; neu schreiben mit `python -X utf8 werkzeuge/oci_pakete.py --version X.Y.Z`. Das Skript lädt mit
  `pip download oci-cli==X.Y.Z --only-binary=:all: --python-version 3.12 --implementation cp --abi cp312 --platform
  manylinux_2_39_x86_64 … --platform manylinux_2_17_x86_64 --platform manylinux2014_x86_64` nur Wheels (es läuft kein Code der
  Pakete), rechnet die Abhängigkeiten aus deren Metadaten für den Helfer nach (pip wertet Bedingungen wie
  `python_version < "3.13"` für den eigenen Rechner aus), lädt Fehlendes nach und schreibt Namen, Versionen und SHA-256 der
  Wheels. Der Helfer installiert mit `pip install --require-hashes --no-deps --only-binary=:all:` genau diese Liste. Eine neue
  Liste ändert die Fassung des Helfers: Der nächste Aufruf von `platzsucher` ersetzt einen laufenden.
- Always-Free-Grenzen in `server/stand.mjs` (`FREI`) und `server/README.md` gegen die Seite „Always Free Resources“ von Oracle.
- `overrides` in `package.json`: ESLint 10.14.0 verlangt `minimatch` ^10.2.6, und alle 10.x haben eine bekannte Lücke
  (GHSA-g3hv-75wg-m249, behoben ab 11.0.1; `npm audit` meldet sie sonst). Entfernen, sobald ESLint selbst `minimatch` ab 11.0.1
  verlangt (danach `npm audit` prüfen).
- Ruff in `.github/requirements-ci.txt`: genau eine Version mit den SHA-256 aller Dateien dieser Version von PyPI (Feld `urls` in
  `https://pypi.org/pypi/ruff/<Version>/json`), die CI installiert mit `pip install --require-hashes`. Esbuild steht mit fester
  Version in `package.json` (`npm ci` prüft die Integrität). Dependabot (pip, Ordner `.github/`) schlägt neue Ruff-Versionen vor;
  ob sein PR die Prüfsummen aller Dateien der neuen Version enthält, vor dem Mergen gegen PyPI prüfen (nicht erprobt).
  `tests/ci-pins.test.js` prüft, dass jede Zeile Prüfsummen hat.
- Preise von Opus in `Studium Autopilot/System/Skripte/server.js` (`pdfKosten`, Stand im Kommentar): Der Server-Lauf nimmt den
  Alias `opus`, ein neues Modell kann andere Preise haben.

## 3. Commit

Den Baum in einen Klon dieses Repos kopieren (vorher alles außer `.git/` löschen, damit entfernte Dateien auch hier
verschwinden), prüfen, was sich geändert hat (`git status`, `git diff --stat`), und **einen** Commit mit einer kurzen
Beschreibung anlegen. Kein Force-Push (auf GitHub ohnehin gesperrt). GitHub Actions (`.github/workflows/pruefen.yml`) muss
grün sein. Commits und Tags sind signiert (SSH-Schlüssel, „Verified“ auf GitHub).

Dependabot schlägt monatlich neuere Versionen der Actions und von ESLint vor. Einen gemergten Dependabot-PR in der
Arbeitskopie nachziehen (`.github/`, `package.json`, `package-lock.json`), sonst überschreibt ihn der nächste Export.

## 4. Version und Tag

- Version in `manifest.json` des Plugins (`version`) und `CHANGELOG.md` erhöhen – in der Arbeitskopie, vor dem Export.
- Tag auf den Release-Commit: `git tag -m "Studium Autopilot EcoBA 0.2.0" v0.2.0` und `git push origin v0.2.0`. Alle Dateien
  (und die Update-Liste, wenn sie im Release fehlt) werden über `raw.githubusercontent.com/studium-autopilot/ecoba/v<version>/`
  geladen; der Tag darf danach nie verschoben werden. GitHub erzwingt das: Ein Ruleset sperrt `v*`-Tags gegen Ändern und Löschen.

## 5. GitHub-Release

Auf GitHub unter **Releases** → **Draft a new release** den Tag wählen, die Notizen aus `CHANGELOG.md` übernehmen und
**`Studium-Autopilot.zip`**, **`Studium-Autopilot-iOS.zip`**, **`studium-server.tar.gz`**, **`studium-server.tar.gz.sig`**,
**`system-dateien.json`** und **`system-dateien.json.sig`** anhängen (genau diese Namen; alle sechs aus `release.py --zip`).
Fehlt das iOS-ZIP, scheitert der Kurzbefehl auf iPhone und iPad. Fehlt `system-dateien.json`, lädt das Update die Liste vom Tag,
und GitHub zählt die Updates auf diese Version nicht (`docs/architektur/update.md`, „Mitzählen“). Fehlt
`system-dateien.json.sig`, installiert kein Plugin mit Signaturprüfung diese Version (oben, „Signatur der Update-Liste“), und
in einem Tresor nach dem Update von 0.7.6 oder älter startet kein Skript, bis die Signatur kommt; **Reparieren** holt auch die
Liste nur aus dem Release. Das
Server-Paket lädt die Einrichtung des eigenen Servers mit der Prüfsumme, die GitHub zum Asset zeigt, und täglich `studium-server
aktualisieren`, das zusätzlich die Signatur prüft; fehlt das Paket oder seine Signatur, bleibt jeder eigene Server auf seinem
Stand. Die Anleitung der Einrichtung im Baum lädt
genau das Paket ihrer Version (`release.py` setzt `releases/tags/v<version>` ein); bis das Release mit Asset öffentlich ist,
scheitert dort der Download, statt ein Paket einer anderen Version zu nehmen. Titel wie die Überschrift im Changelog:
`0.3.1 – Update-Hinweis auf dem Dashboard`. Als **Latest release** veröffentlichen. Releases sind unveränderlich (Immutable
Releases): Nach dem Veröffentlichen lassen sich Assets nicht mehr tauschen, also erst als Entwurf vollständig machen. Das ZIP enthält nur den
Tresor-Ordner, so wie Nutzer:innen ihn brauchen (siehe `docs/installation.md`).

## 6. Erst jetzt: Update anbieten (Daten-Repo)

Erst wenn Tag **und** Release mit Asset öffentlich sind, im Manifest der zentralen Daten (`ecoba-daten`, `v1/manifest.json`,
bzw. in der Konfiguration des Exports) setzen:

- `plugin_aktuell`: die neue Version;
- `release`: den Block, den `werkzeuge/release.py` gedruckt hat (`version`, `url_basis`, `sha256`), dazu `notiz` (ein Satz,
  was neu ist, höchstens 200 Zeichen).

Ab dem nächsten Abruf zeigt die Zeile „Studium Autopilot“ in **Einstellungen & Hilfe** → **Verbindungen** „Neue Version …
verfügbar“ mit dem Knopf **Neue Version installieren**. Vorher gesetzt, bekäme jemand eine Version angeboten, deren Dateien es noch nicht
gibt (das Update bricht dann ohne Schaden ab). Vertrag: `docs/daten-v1.md`, „Update-Angaben“.

**Neue Regeln für das Update wirken erst ab dem nächsten Mal.** Ein Update plant immer der `update.js`, der beim Tipp läuft,
also der der *installierten* Version. Was der alte Planer anders macht, gleicht die Reparatur des neuen `update.js` nach dem
ersten Laden aus, nur mit Dateien, die schon im Tresor liegen (`docs/architektur/update.md` → „Reparatur nach dem
Update“; erster Fall 0.4.4: von Hand geänderte Darstellung). Ändert ein Release die Update-Regeln, darum auch den Weg „alter
Planer, dann Reparatur“ prüfen, etwa mit dem Test-Tresor der Vorversion.

## Nur README und Bilder veröffentlichen (ohne Version)

Zwischen zwei Releases darf die README samt Bildern auf `main` aktualisiert werden, ohne Version, Tag und Release. Nur mit
Freigabe des Autors und nur so:

1. Frischer Klon dieses Repos (`main`) in einen leeren Ordner.
2. Nur `README.md` und Dateien unter `docs/bilder/` aus einem Commit der Arbeitskopie übernehmen (`git show <commit>:README.md`).
   Bilder, die danach nichts im Baum mehr verwendet, löschen; vorher im ganzen Baum nach dem Dateinamen suchen.
3. `git status` zeigt nur `README.md` und `docs/bilder/`: nie Dateien des Tresors, `system-dateien.json`, andere Doku, Tests
   oder `.github/`. Die README verlinkt nur auf Dateien und Anker, die es in `main` gibt, und die Bilder zeigen keine
   Funktion, die die veröffentlichte Version nicht hat.
4. `python werkzeuge/pruefen.py .` im Klon, lokal mit der privaten Sperrliste (`--sperrliste`), ohne Funde.
5. Ein signierter Commit (Identität wie oben), Push auf `main`. Kein Tag, kein Release, das Manifest der zentralen Daten
   bleibt, wie es ist. GitHub Actions muss grün sein.

Der nächste Export ersetzt `main` ohnehin durch den ganzen Stand; README und Bilder müssen darum auch in der Arbeitskopie
committet sein.

## Beta

Für Tests vor dem Release (zum Beispiel im eigenen Test-Tresor mit Kanal „Beta“):

1. `python werkzeuge/release.py --zip --beta 1` – im Baum wird die Plugin-Version `X.Y.Z` zu `X.Y.Z-beta.1` (die Quelle bleibt),
   die Update-Liste trägt diese Version, gedruckt wird ein Block `beta`.
2. Commit, nur den Tag `vX.Y.Z-beta.1` pushen, **nie `main`**: `main` zeigt immer die stabile Version.
3. GitHub-Release mit diesem Tag als **Vorab-Release** („Set as a pre-release“), **nicht** als Latest; Assets
   `Studium-Autopilot.zip`, `Studium-Autopilot-iOS.zip`, `studium-server.tar.gz`, `studium-server.tar.gz.sig`, `system-dateien.json`
   und `system-dateien.json.sig`. So laden der grüne Knopf, der iOS-Kurzbefehl, die Server-Einrichtung
   und das Update eigener Server (`releases/latest`) weiter die stabile Version. Die Server-Einrichtung einer Beta testet man
   mit dem Prompt aus dem README, nur mit `vX.Y.Z-beta.1` statt der Version aus `releases/latest`: Die Anleitung dieses Tags
   lädt genau sein Server-Paket.
4. Im Manifest der zentralen Daten `beta` setzen (nicht `release`, nicht `plugin_aktuell`).

Nur Tresore mit `update_kanal: beta` in `System/Einstellungen.md` (Schalter **Beta-Versionen** im Fenster „Studium Autopilot“
unter „Mehr erfahren“) bekommen die Beta angeboten. Nach dem fertigen Release `X.Y.Z` ist `release` wieder höher als die Beta;
die Beta-Tresore bekommen dann die fertige Version. `beta` kann stehen bleiben oder entfernt werden.

**Sechs Assets je Release:** `Studium-Autopilot.zip` (Mac, Windows, Android, Update-Prüfsummen), `Studium-Autopilot-iOS.zip`
(gleicher Inhalt in `Studium Autopilot/Studium Autopilot/`, wie bis 0.5.7) für den iOS-Kurzbefehl `docs/kurzbefehl/`,
`studium-server.tar.gz` für den eigenen Server mit seiner Signatur `studium-server.tar.gz.sig`, `system-dateien.json`, die
Update-Liste mit der Prüfsumme aus dem Block `release` (das Update lädt sie zuerst von hier, GitHub zählt die Abrufe je Version;
bis 0.7.0 lag hier `zaehler.txt`), und ihre Signatur `system-dateien.json.sig` (ohne sie installiert das Plugin nichts; dieselbe
liegt in beiden ZIPs). Die
Namen sind fest; `release.py --zip` erzeugt alle sechs.
