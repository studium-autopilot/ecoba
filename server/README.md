# Eigener Server mit Claude

Für Technische nutzt Studium Autopilot einen eigenen, kostenlosen Server bei Oracle, auf dem Claude mit dem eigenen Abo Termine
aus Mails findet und Begleitnotizen schreibt. Seit 0.5.0 Teil jedes Releases (`studium-server.tar.gz`).

Dazu gehören die Prüfung des Oracle-Kontos (`stand.mjs`), die Schritte der Einrichtung in der Cloud Shell (`einrichten.mjs`),
der Einrichtungs-Skill (`skill/server-einrichten/`), der Platzsucher (`platzsucher.py`), der Server selbst (Installer, Web-Dienst
mit verschlüsseltem Datenkanal, Speicherreserve, Uni-Zugang, Befehle), der Abruf des Uni-Postfachs ohne KI (`abrufen.py`) und
der Claude-Lauf mit dem Skill (`lauf.mjs`, `skill/studium-autopilot/`, Prüfung `eingang.mjs`). Die Gegenstelle im Plugin ist
`server.js` (Zeile „Eigener Server“). Noch nicht: Abrufe von ILIAS-Dateien und Alma.

**Einrichtung:** Ein Claude-Skill (`skill/server-einrichten/`: `SKILL.md`, `schritte.md`, `kosten.md`) führt in Claude Code (Tab
„Code“ in Claude Desktop) durch die Schritte 0 bis 7, im eingebauten Browser von Claude Code; standardmäßig klickt Claude, auf
Wunsch sagt es an („Ich klicke selbst“). Läuft der Prompt woanders (Chat, Cowork, claude.ai, Handy), sagt Claude nur, wie man in
den Tab „Code“ wechselt; Claude in Chrome und Computer Use braucht die Einrichtung nicht. Alles im Konto und auf dem Server
erledigt ein Befehl in der Cloud Shell, `start.sh` (unten); angelegt wird nur über `einrichten.mjs`, jeder Schritt erkennt am
Stand, ob er schon erledigt ist. `tests/server-einrichten.test.js` prüft, dass jeder im Skill und in `start.sh` genannte Befehl
existiert, `tests/server-start.test.js` jeden Halt von `start.sh`.

**Eine Version für alles:** Der Prompt (README und Knopf **Prompt kopieren**) lässt Claude die Anleitung aus dem Tag des
neuesten Releases lesen, nie von `main`. `release.py` setzt genau diese Version ein: in `schritte.md` (Schritt 2) für den
Download von `start.sh`, in `start.sh` für den Download des Server-Pakets. So passen Anleitung und Paket immer zusammen, auch wenn während einer Einrichtung ein neues Release
erscheint. Ältere Prompts, die noch `main` lesen, bekommen dort die Anleitung des neuesten Releases mit derselben Bindung; der
Pfad `server/skill/server-einrichten/` bleibt darum, wo er ist.

## Ziel: nie Kosten

Wer den Free Tier von Oracle nutzt, soll nie etwas zahlen. Darum legt die Einrichtung nur an, was ganz in die freien Mengen
passt, und prüft das vorher und am Ende.

Freie Mengen laut [Oracle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) (geprüft 17.10.2026):

| Was | frei |
|---|---|
| Ampere A1 | 1.500 OCPU-Stunden und 9.000 GB-Stunden im Monat, also dauerhaft 2 OCPU und 12 GB |
| AMD E2.1.Micro | 2 Instanzen |
| Blockspeicher | 200 GB, Boot- und Block-Volumes zusammen, Leistung „Balanced“ (10 VPU) |
| Volume-Backups | 5 |
| Objektspeicher | 20 GB |

Regeln, die daraus folgen:

- **Kein Upgrade auf Pay-As-You-Go.** Ohne Upgrade kann Oracle nichts abbuchen; mit Upgrade kostet alles über den freien
  Mengen sofort Geld.
- **Der freie Blockspeicher ist ein eigener Topf.** Ein neues Volume, das nicht ganz in den Rest des Topfs passt, berechnet
  Oracle vollständig, nicht nur den Teil über 200 GB. Darum ist das Boot-Volume des Servers genau so groß wie der Rest, und es
  gibt kein zusätzliches Volume.
- **Nur Formen mit dem Hinweis „Always Free-eligible“.** Im 30-tägigen Testzeitraum bietet die Konsole auch bezahlte Formen an;
  sie würden nach dem Test gelöscht.
- **Schutz im Konto:** eine Quota-Richtlinie `nur-kostenlos` (keine bezahlten Formen, keine weiteren Volumes, höchstens 5
  Backups) und ein Budget `kostenwarnung`, das ab dem ersten Cent eine Mail schickt.
- **Fremdes bleibt unberührt.** Was die Einrichtung anlegt, trägt das Kennzeichen `studium-autopilot`; alles andere wird nie
  geändert.

## Prüfung des Kontos: `server/stand.mjs`

Läuft in der **Oracle Cloud Shell**, dort ist die OCI-Kommandozeile schon angemeldet. Das Skript ruft nur lesende Befehle auf
(`tests/stand.test.js` prüft das) und ändert nichts.

```
node stand.mjs            Übersicht
node stand.mjs --kosten   Kostenprüfung mit Exit-Code
node stand.mjs --json     Ergebnis als JSON (für den Skill)
node stand.mjs --helfer   Rest-Rechnung, solange ein Platzsucher-Helfer (Micro, 50 GB) läuft
```

Optionen: `--oci <pfad>` für eine andere OCI-Kommandozeile, `--tenancy <ocid>` für ein Konto ohne Cloud Shell (sonst
`$OCI_TENANCY` bzw. `tenancy=` aus `~/.oci/config`).

Die Übersicht nennt:

- **Kontotyp** aus den Abo-Daten (`payment-model`), sonst aus der Grenze für bezahlte Formen (Free Tier: 0);
- **Heimatregion**;
- je freier Menge **belegt / frei**. Den Rest des freien Blockspeichers meldet Oracle selbst (`total-free-storage-gb-regional`);
- **Kosten des laufenden Monats** über die Usage-API;
- **Schutz**: Quota `nur-kostenlos` und Budget `kostenwarnung` vorhanden?
- was mit `studium-autopilot` **gekennzeichnet** ist;
- ob ein **neuer Server** mit 2 OCPU, 12 GB und einem Boot-Volume aus dem Rest des Topfs passt;
- **Befunde**:
  - `kosten`: Beträge über 0 in diesem Monat;
  - `grenze`: eine freie Menge ist überschritten, eine bezahlte Form läuft oder ein Volume hat höhere Leistung;
  - `hinweis`: z. B. ein Boot-Volume ohne Instanz oder fehlender Schutz.

Exit-Code mit `--kosten`: `0` alles kostenlos, `1` Kosten oder überschrittene Grenze, `2` Prüfung unvollständig (eine Abfrage
schlug fehl, etwa wegen fehlender Rechte).

## Einrichtung in der Cloud Shell: `server/einrichten.mjs`

Das Gegenstück zu `stand.mjs`: legt an, was der Server braucht, in festen Schritten statt mit Befehlen, die Claude in einem
fremden Konto frei tippt. Jeder Schritt sucht zuerst nach dem, was schon da ist (Name und Kennzeichen), legt nur Fehlendes an
und hält die Regeln oben ein. Der Skill ruft die Schritte der Reihe nach auf; bei der Art „Ich klicke selbst“ fügt der Nutzer
denselben Befehl in die Cloud Shell ein.

```
node einrichten.mjs schutz --mail <adresse> [--ja]    Quota „nur-kostenlos“ (Kennzeichen schutz) und Budget „kostenwarnung“
node einrichten.mjs netz                              Netz, Internet-Zugang, Route, Regeln (von außen nur 22 und 443), Teilnetz
node einrichten.mjs server --schluessel <datei.pub>   A1 2 OCPU / 12 GB, Ubuntu 24.04, Boot-Volume = Rest des freien Topfs
node einrichten.mjs platzsucher [--mail <adresse>] --schluessel <datei.pub>
                                                      Mail-Thema mit Abo (ohne --mail an die Adresse des Budgets), Helfer (Micro, 50 GB) mit platzsucher-helfer.yaml,
                                                      dynamische Gruppe und Richtlinie nur für ihn
node einrichten.mjs abschliessen                      Rechte des Platzsuchers weg, Boot-Volume auf den freien Rest,
                                                      Blockspeicher der Quota auf den Stand danach
node einrichten.mjs adresse                           öffentliche IP, https://<IP>.sslip.io und SSH-Befehl
node einrichten.mjs platzsucher-beenden               Helfer beenden, seine Rechte und das Mail-Thema entfernen
node einrichten.mjs schluessel-sichern                ~/.ssh/studium_autopilot in den privaten Bucket des Kontos (siehe unten)
node einrichten.mjs schluessel-holen                  fehlt er in der Cloud Shell: aus dem Bucket zurück
--paket <studium-server.tar.gz>                       server, platzsucher: Startdaten zum Selbst-Vorbereiten (Standard: das
                                                      Paket neben server/; siehe „Server-Paket“)
```

`schutz` braucht `--mail` nur, solange das Budget noch keine Mail-Regel mit Adresse hat; danach nehmen weitere Läufe und der
Platzsucher die Adresse aus dem Budget (`stand.mjs`, `schutz.mail`). `abschliessen` wartet, bis Oracle das größere Boot-Volume
bereitgestellt hat (`--wait-for-state AVAILABLE`); erst danach startet `start.sh` den Server neu, damit Ubuntu das Dateisystem
vergrößert.

- **Schlüssel im Konto:** Den Schlüssel zum Server gibt es sonst nur in der Cloud Shell, und Oracle löscht deren Ordner nach
  sechs Monaten ohne Nutzung (60 Tage nach einer Mail an den Administrator des Kontos). `schluessel-sichern` legt darum eine
  Kopie in den Bucket `studium-autopilot-schluessel` (Objektspeicher, ein paar KB der freien 20 GB): nur mit Kennzeichen
  `schluessel` und `NoPublicAccess` (ein fremder oder öffentlicher Bucket gleichen Namens: nichts übertragen), mit
  `--no-overwrite`; liegt dort schon ein anderer Schlüssel als in der Cloud Shell, überschreibt er keinen (Exit 2).
  `schluessel-holen` holt ihn zurück, wenn er in der Cloud Shell fehlt (Rechte 600). Geschützt ist die Kopie wie das Konto
  selbst (Anmeldung, Zwei-Faktor); der Platzsucher hat keine Rechte auf Objektspeicher. Ein Schlüssel auf dem PC der Nutzerin
  oder des Nutzers wurde verworfen: Er wäre root auf dem Server ohne Passphrase, erreichbar für jede spätere Sitzung dort.

### Alles mit einem Befehl: `server/start.sh`

Die Einrichtung in der Cloud Shell als eine Zeile, die Claude tippt (Skill, Schritt 2); weiter geht es immer mit derselben Zeile,
auch Tage später in einer neuen Sitzung:

```
mkdir -p ~/studium-autopilot && curl -fsSLo ~/studium-autopilot/start.sh https://raw.githubusercontent.com/studium-autopilot/ecoba/vX.Y.Z/server/start.sh && bash ~/studium-autopilot/start.sh [--mail <adresse>] [--paket-da]
```

- **Laden:** erst in eine Datei, dann ausführen (bei `bash <(curl …)` liefe nach einem Abbruch ein leeres oder halbes Skript, und
  `curl | bash` nähme der Claude-Anmeldung die Eingabe); der ganze Inhalt steht in `main()`, das erst die letzte Zeile aufruft.
  `start.sh` lädt das Server-Paket desselben Tags und prüft es gegen die SHA-256 im Release, bevor es etwas auspackt.
  `--paket-da` nimmt das Paket in `~/studium-autopilot/server` (Testpaket vor einem Release, Tests).
- **Reihenfolge:** Paket, `stand.mjs`, `schutz`, `netz`, Schlüssel (`schluessel-holen`, sonst `ssh-keygen` RSA 4096, dann
  `schluessel-sichern`), `server` (Exit 3: `platzsucher`), `abschliessen`, `fern.sh installieren` (danach `neustart`, wenn das
  Boot-Volume wuchs), Claude auf dem Server (nur in einem Terminal), Obsidian verbinden (nur, solange noch kein Gerät abholt), erster
  Lauf, `stand.mjs --kosten`. Den Status liest es öffentlich über `https://<Adresse>/v1/status`.
- **Ende:** genau eine letzte Zeile, `[fertig]` (Exit 0) oder `[halt:<schritt>:<grund>]` (Exit 3; Exit 1 bei `…:fehler`). Jede
  steht mit dem, was Claude dann tut, in `schritte.md`, Schritt 4.
- **Entscheidungen bleiben beim Menschen:** nie `--ja`, nie `ssh-keygen -R`, nie der `cp`-Befehl von `adresse` (er könnte einen
  vorhandenen Schlüssel überschreiben), nie eigene `oci … create`, nie das Uni-Passwort.
- **Warten mit Grenze:** auf den Helfer (`abschliessen`), auf ssh (`installieren`) und nach dem Neustart je höchstens zehn
  Versuche im Minutenabstand, auf den ersten Lauf höchstens 15 Minuten; danach ein Halt statt endlosen Wartens. Zwei Läufe
  zugleich (zwei Tabs) verhindert `flock` (`[halt:start:laeuft-schon]`).

Exit-Code: `0` erledigt, `1` Fehler oder eine Kostenregel lässt es nicht zu (z. B. die freie A1-Menge ist belegt), `2`
Rückfrage nötig bzw. falscher Aufruf, `3` Oracle hat gerade keinen Platz (dann der Platzsucher).

- **Schutz in Konten mit bezahlten Ressourcen:** Die Quota würde jede weitere bezahlte Ressource blockieren. Der Schritt nennt
  sie und legt die Quota erst mit `--ja` an. Was schon läuft, bleibt erlaubt. Das Budget legt er immer an.
- **Ohne Schutz kein Server:** `server` und `platzsucher` brechen mit Exit 2 ab, solange Quota und Budget mit Mail-Regel fehlen
  (sonst hielte nichts eine zweite bezahlte Instanz auf). Ein Budget zählt nur mit Mail-Regel für echte Kosten (`stand.mjs`).
- **Wiederholen repariert:** Bricht ein Schritt mittendrin ab, ergänzt der nächste Aufruf, was fehlt (Mail-Regeln des Budgets,
  Gruppe und Richtlinie des Helfers; ein schon laufender Helfer startet dann neu und sucht weiter). Einen Helfer einer
  früheren Fassung ersetzt er (siehe Platzsucher). Den Helfer (E2.1.Micro) versucht er in jedem Bereich, weil es ihn oft nur
  in einem gibt.
- **Was nicht von der Einrichtung stammt** (Budget, Quota, Thema, Gruppe, Richtlinie gleichen Namens ohne Kennzeichen
  `schutz` bzw. `helfer`), ändert kein Schritt: Er lässt es stehen oder bricht ab.
- **Reihenfolge beim Platzsucher:** Die Regel der dynamischen Gruppe braucht die OCID des Helfers, also entstehen Gruppe und
  Richtlinie kurz nach ihm. Der Platzsucher wertet fehlende Rechte darum erst nach 30 Minuten als Grund zum Anhalten.

- **Fehlermeldungen:** Die OCI-Kommandozeile schreibt Fehler als `ServiceError:` und JSON mit sortierten Schlüsseln; die
  Nachricht steht erst nach gut 200 Zeichen. `fehlerText` in `stand.mjs` macht daraus `Code (Status): Nachricht` und kürzt erst
  dann. „Out of host capacity“ kommt bei Oracle als `InternalError (500)`; die Schritte erkennen es an der Nachricht.

Tests: `tests/server-einrichten.test.js` mit einem nachgebauten Konto, das Angelegtes behält (zweiter Lauf legt nichts an),
und mit Fehlern in der Form der echten OCI-Kommandozeile durch `ociAufrufer`. Befehle, Schalter und JSON-Felder am 18.10.2026
gegen OCI CLI 3.95.0 geprüft (nur `--help`, Abbilder und Verfügbarkeitsbereiche lesend); Quota-Sätze und Budget-Regeln wie in
einem echten Konto. Erster echter Lauf in einem neuen Konto am 20.10.2026: Stand, Schutz und Netz gingen durch (sonst hätte
`server` nicht angelegt); daraus behoben: abgeschnittene Fehler (kein Platz sah wie ein harter Fehler aus) und ed25519 in der Cloud Shell
(FIPS-Modus, jetzt RSA 4096). Der Platzsucher entstand dort mit 0.5.0; der nächste Aufruf mit einer neueren Version scheiterte
am Update der Richtlinie: `iam policy update` verlangt mit `--statements` auch `--version-date` (Prüfung in der Kommandozeile
selbst, nicht in `--help`). Die Attrappe lehnt das seit dem 22.10.2026 genauso ab. Noch offen: ob ein Helfer im echten Konto
Platz findet und sich danach beendet.

### Den Server aus der Cloud Shell bedienen: `server/fern.sh`

Ab dem Installieren geht alles auf dem Server über einen Befehl, ohne IP-Adresse und ssh von Hand:

```
bash ~/studium-autopilot/server/fern.sh installieren        Paket kopieren, installieren.sh --ip <IP> (wiederholbar)
bash ~/studium-autopilot/server/fern.sh neustart            nach „Boot-Volume … vergrößert“
bash ~/studium-autopilot/server/fern.sh claude-anmelden     claude auth login als Nutzer studium, danach zustand
bash ~/studium-autopilot/server/fern.sh <befehl …>          sonst: sudo studium-server <befehl …> (Liste unten)
```

Jeder Aufruf holt die Adresse mit `einrichten.mjs adresse` und prüft dabei den Schlüssel; er läuft aus jedem Ordner, auch in
einer neuen Cloud-Shell-Sitzung. Exit wie `adresse` (1, 2), `3` unbekannter Befehl, `4` Server nicht `RUNNING`, `5` keine
Antwort auf ssh (`ConnectTimeout=15`), `6` anderer Schlüssel des Servers als in `~/.ssh/known_hosts` (neu angelegt unter einer
schon bekannten IP; die Meldung nennt `ssh-keygen -R <IP>`), sonst der Exit auf dem Server. Nur `claude-anmelden` und `uni-zugang` lesen von der
Tastatur (im Terminal mit `-t`); alle anderen laufen mit `ssh -n`, damit ssh keine Zeilen schluckt, die danach in der Cloud
Shell laufen sollen. `neustart` startet den Server über `systemd-run` erst nach zwei Sekunden neu, damit ssh sauber
zurückkommt. Angaben sind nur Kleinbuchstaben und Bindestriche, damit nichts Fremdes in die ssh-Zeile kommt. Tests in
`tests/server-einrichten.test.js` mit nachgebautem `adresse`, ssh und scp.

## Platzsucher: `server/platzsucher.py`

Beim Anlegen des freien Servers meldet Oracle oft „Out of host capacity“, teils tagelang. Der Platzsucher versucht es darum
auf einem kleinen Helfer weiter, nicht am Rechner der Nutzerin oder des Nutzers:

- **Helfer:** `VM.Standard.E2.1.Micro` mit Ubuntu 24.04 Minimal (Always Free, fast immer verfügbar), Boot-Volume 50 GB,
  Kennzeichen `studium-autopilot=helfer`. Die
  Einrichtung gibt ihm `platzsucher-helfer.yaml` als cloud-init mit (Platzhalter `KONFIG_JSON_BASE64` = Konfiguration,
  `PLATZSUCHER_GZ_BASE64` = `platzsucher.py` gepackt, aus dem Paket in der Cloud Shell, das schon mit seiner Prüfsumme geprüft
  ist). Er installiert nur die OCI-Kommandozeile und lädt sonst nichts nach; so läuft er auch mit einem Testpaket vor einem
  Release. Weil er alle Instanzen des Kontos verwalten darf, installiert er sie samt allen Abhängigkeiten nur aus der festen
  Liste `oci-pakete.txt` in der Vorlage: je Paket genau eine Version und die SHA-256 genau eines Wheels (x86_64, Python 3.12),
  `pip install --require-hashes --no-deps --only-binary=:all:`. Eine neue Version auf PyPI oder ein übernommenes Konto dort
  ändert so nichts am Helfer; wie die Liste entsteht, steht in `docs/release.md`. Oracle nimmt höchstens 32 000 Byte
  Startdaten (mit der Liste etwa 23 000), die Einrichtung prüft das vorher.
- **Fassung:** Das zweite Kennzeichen `studium-autopilot-fassung` ist eine Prüfsumme über Vorlage und `platzsucher.py`. Läuft
  ein Helfer ohne dieses Kennzeichen oder mit einer anderen Prüfsumme, beendet `platzsucher` ihn samt Boot-Volume (wartet auf
  den Arbeitsauftrag) und legt einen neuen an: cloud-init läuft nur beim ersten Start, ein Neustart brächte weder das neue
  Skript noch eine damals gescheiterte Installation (bis 0.5.0 ohne Auslagerung). Das gilt auch für eine neue Paketliste: Die
  erste Version mit fester Liste ersetzt einen laufenden Helfer beim nächsten Aufruf, gewollt. Thema und Mail-Abo bleiben. Der
  neue Helfer sucht mit 50 GB weniger Boot-Volume, weil das alte beim Anlegen noch zählen kann; `abschliessen` gleicht das aus.
- **Rechte nur für den Helfer:** dynamische Gruppe `studium-platzsucher` mit der Regel `instance.id = '<OCID des Helfers>'` und
  eine Richtlinie im Compartment:
  `manage instance-family`, `use volume-family`, `use virtual-network-family`, `use ons-topics`, dazu `manage volume-family`
  nur mit `request.permission = 'VOLUME_DELETE'` (damit er sich samt Boot-Volume beendet; eine ältere Richtlinie bringt die
  Einrichtung auf diesen Stand, mit leerem `--version-date`, das die Kommandozeile dazu verlangt). Der Platzsucher meldet sich mit
  der Identität der Instanz an (`--auth instance_principal`), es gibt keinen Schlüssel zum Kopieren. Gruppe und Richtlinie
  entfernt die Einrichtung nach dem Erfolg wieder.
- **Versuche:** alle 2 bis 5 Minuten jeder Verfügbarkeitsbereich mit genau `VM.Standard.A1.Flex`, 2 OCPU, 12 GB, Boot-Volume
  „Balanced“ (10 VPU) in der Größe aus der Konfiguration (Rest des freien Blockspeichers, solange der Helfer lebt, also 150 GB),
  Kennzeichen `studium-autopilot=server`. Vorher prüft er jedes Mal, ob es den Server schon gibt. Nach einer unklaren Antwort
  (Zeitüberschreitung, 5xx, unlesbare Ausgabe: vielleicht doch angelegt) endet die Runde, damit nie ein zweiter entsteht.
  Höchstens 1.500 Versuche am Tag; nach „Too many requests“ verdoppelt sich die Pause bis 30 Minuten.
- **Anhalten:** Grenze oder Quota überschritten, fehlende Rechte oder falsche Konfiguration brauchen einen Menschen. Dann hält er
  an und schickt eine Mail.
- **Mails** über Oracle Notifications (Thema mit E-Mail-Abo, einmal bestätigen): „Dein Server ist da“, „Platzsucher angehalten“
  und nach 14 Tagen ohne Erfolg „Platzsucher sucht weiter“.
- **Stand am Helfer:** Stündlich und bei einem Halt sofort schreibt er Zeit, Versuche und die letzte Antwort von Oracle als
  Kennzeichen `studium-autopilot-stand` an sich selbst (`zeit=…;versuche=…;art=…;grund=…`, höchstens 256 Zeichen; seine OCID aus
  den Metadaten über IMDSv2, die anderen Kennzeichen bleiben). `stand.mjs` zeigt daraus die Zeile „Platzsucher: …“: sucht,
  startet (bis 3 Stunden nach dem Anlegen ohne Meldung), angehalten, aus (gestoppt) oder still (3 Stunden ohne Meldung: er sucht
  nicht, oder er ist von einer Version vor diesem Kennzeichen). Ohne das sah man in der Cloud Shell nur, dass der Helfer existiert.
- **Neben dem Helfer:** `einrichten.mjs server` versucht es nicht selbst, solange ein Helfer da ist (Exit 3, `[platzsucher]`):
  Ein Versuch daneben bringt nichts, und Oracle bremst dann beide. „Too many requests“ (429) beim Anlegen gilt wie kein Platz
  (Exit 3, `[gedrosselt]`), ohne weiteren Bereich. Bis 0.7.3 brach `server` dort mit `[fehler] anlegen: TooManyRequests …` ab,
  und „Weiter mit der Einrichtung“ versuchte es neben einem laufenden Helfer jedes Mal selbst.
- **`platzsucher` bei laufendem Helfer:** ersetzt ihn bei anderer Fassung (siehe oben), startet einen gestoppten (in der Konsole
  oder von Oracle angehalten), nennt ein unbestätigtes Mail-Abo (`[offen]`) und den Stand des Helfers. Angehalten oder still:
  Exit 1, das braucht einen Menschen.
- **Nach dem Erfolg** beendet der Platzsucher die Instanzen mit dem Kennzeichen des Helfers samt Boot-Volume. Danach vergrößert die Einrichtung das Boot-Volume des
  Servers auf den ganzen freien Rest.

```
python3 platzsucher.py            sucht, bis der Server da ist oder ein Mensch gebraucht wird
python3 platzsucher.py --einmal   eine Runde, Ergebnis als JSON
```

Konfiguration `/etc/studium-platzsucher/konfig.json`: `compartment`, `ads` (1 bis 3 Verfügbarkeitsbereiche), `subnet`,
`image` (Ubuntu 24.04 für Arm), `boot_gb`, `ssh_schluessel`, `user_data` (cloud-init des Servers, base64), `thema`. Stand in
`/var/lib/studium-platzsucher/stand.json`. Tests: `server/test_platzsucher.py` mit nachgebauter OCI-Kommandozeile (Befehle
und Fehlerformat am 18.10.2026 gegen OCI CLI 3.95.0 geprüft). Noch nicht geprüft: ein echter Lauf in einem neuen Konto
(dynamische Gruppe in Identity Domains, Instanz-Identität, Mail).

## Server-Paket

Ubuntu 24.04 (Arm oder x86) auf einer A1-Instanz mit 2 OCPU und 12 GB. Installiert wird als root:

```
sudo bash installieren.sh --ip <öffentliche IP>   Adresse https://<IP mit Bindestrichen>.sslip.io (Zertifikat von Let's Encrypt)
sudo bash installieren.sh --test                  ohne HTTPS und ohne Claude Code, Caddy auf :8080 (nur für Tests)
sudo bash installieren.sh --vorbereiten           alles außer Adresse und HTTPS (erster Start); eine gesetzte Adresse bleibt
```

**Selbst vorbereiten:** Legt `einrichten.mjs server` oder der Platzsucher den Server an, bekommt er Startdaten (cloud-init,
`serverStart`) mit: das Paket genau der Version aus der Cloud Shell aus dem Release laden (fünf Versuche), gegen dessen SHA-256
prüfen (die Cloud Shell hat dasselbe Paket schon gegen die Prüfsumme im Release geprüft), in einen frischen Ordner von root
auspacken und `installieren.sh --vorbereiten` (Protokoll `/var/log/studium-server-vorbereiten.log`). So ist alles Lange schon
erledigt (Pakete, Claude Code, Dienste), wenn die Mail „Dein Server ist da“ kommt. Adresse und HTTPS setzt erst `fern.sh
installieren` mit der IP aus dem Konto: Eine IP, die der Server selbst bei einem fremden Dienst erfragt, könnte falsch sein, und
an diese Adresse schickte jedes Gerät seinen Zugangsschlüssel. Bis dahin läuft Caddy nicht (nichts auf 80 und 443), `verbinden`
lehnt ohne Adresse ab, und das tägliche `aktualisieren` bereitet nur vor. Keine Geheimnisse in den Startdaten: Jeder Prozess auf
dem Server kann sie lesen. Ohne gültige Version und Prüfsumme (Testpaket) gibt es keine Startdaten; dann installiert `fern.sh
installieren` alles wie bisher, ebenso bei Servern von einem Platzsucher einer älteren Version. Zwei Läufe des Installers
zugleich (Vorbereiten und Einrichtung) verhindert eine Sperre (`flock`); der zweite wartet.

Der Installer ist wiederholbar: Jeder Schritt prüft zuerst, ob er schon erledigt ist; Schlüssel und Uni-Zugang bleiben bei
jedem weiteren Lauf erhalten. Nur vorwärts: Ist schon eine neuere Version installiert (eine Vorabversion wie `0.6.0-beta.1`
zählt weniger als `0.6.0`), bricht er ab, ohne etwas zu ändern; so ersetzt eine alte Kopie des Pakets in der Cloud Shell nie
einen neueren Stand. Einheiten `studium-server*` von systemd, die er nicht mehr schreibt (eine frühere Version legte sie an,
diese hat sie entfernt oder umbenannt), schaltet er ab und löscht sie; so läuft kein alter Dienst weiter. Er richtet ein:

| Teil | Was |
|---|---|
| Pakete | `jq`, `qrencode`, `python3`, `poppler-utils` (Claude liest damit Seitenbereiche aus PDFs), `iptables-persistent`, `unattended-upgrades` (Sicherheitsupdates automatisch, Neustart um 03:30 Uhr UTC, wenn ein Update ihn braucht; siehe „Updates der Pakete“), Caddy aus dessen offiziellem Paketarchiv, Node.js 24 von NodeSource |
| Benutzer `studium` | führt Claude-Lauf, Zustand, Speicherreserve und Gmail-Anstoß aus; Claude Code und seine Anmeldung liegen in `/var/lib/studium` (`.local/bin/claude`, `.claude/`, `.claude.json`; 0700, nur er). Nur Claude-Lauf und Zustand sehen diesen Ordner (siehe „Schutz der Dienste“) |
| Benutzer `studium-web` | nur der Web-Dienst (bis 0.7.6 lief er als `studium`): Er kann weder die Claude-Anmeldung noch Mails, Lauf-Ordner oder Uni-Zugang lesen und die Prozesse von `studium` weder beenden noch ansehen |
| Benutzer `studium-abruf` | nur der Abruf des Uni-Postfachs; nur er kann den entschlüsselten Uni-Zugang lesen (Gruppe `studium`: Der Lauf übernimmt seine Rohdaten) |
| `/opt/studium-server/<version>` | das Paket; `aktuell` zeigt auf die laufende Version. Es bleiben diese und die bisher laufende (zum Zurückgehen von Hand), alle anderen entfernt der Installer. Darin `allowed_signers`: die Schlüssel, mit denen `aktualisieren` die Signatur des nächsten Pakets prüft |
| `/etc/studium-server/dienst.json` | Adresse, Zugangsschlüssel und Datenschlüssel (je 32 Byte; `root:studium-web` 0640, lesen nur root und der Web-Dienst, allen anderen Diensten sperrt systemd den Ordner) |
| `/var/lib/studium-server` | je Teil ein eigener Ordner (siehe „Wer was liest und schreibt“): `web/` (Web-Dienst: Einmal-Codes, `geraete.json` mit den Codes aus Obsidian der letzten 24 Stunden, Zufallswerten gegen Wiederholung und den letzten 20 Verbindungen; Stand und Takt aus Obsidian), `abruf/` (Abruf: Rohdaten in `roh/`), `laeufe/` (Claude-Lauf), `eingang/` (Ergebnisse für das Plugin), `unterlagen/` (für den Lauf); im Ordner selbst Zustand und Bestand des Laufs |
| `studium-server-dienst` | Web-Dienst `dienst.mjs` als Benutzer `studium-web`, nur auf 127.0.0.1; Caddy stellt `/v1/` per HTTPS bereit, alles andere ist 404. Darf selbst nur mit 127.0.0.1 sprechen, schreibt nur in `web/`, `eingang/` und `unterlagen/` und sieht weder die Claude-Anmeldung noch die Lauf-Ordner oder die Rohdaten (siehe „Schutz der Dienste“) |
| `studium-server-speicher` | Speicherreserve `speicher-reserve.mjs` (25 % des Arbeitsspeichers), damit Oracle den Server nicht wegen Leerlaufs anhält; „an“ meldet der Zustand nur, wenn die PID in `speicher-reserve.json` lebt und laut `/proc/<pid>/cmdline` die Reserve ist (nach einem Neustart kann sie einem anderen Prozess gehören) |
| `studium-server-zustand.timer` | alle 15 Minuten `zustand.mjs`: Claude angemeldet (`claude auth status` ohne Nutzungs- und Fehlerberichte, `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`), Uni-Zugang, Reserve, LiveSync |
| `studium-server-abruf.timer` | alle 15 Minuten `abrufen.py` ohne KI: das Uni-Postfach, nur mit gespeichertem Uni-Zugang (nach der Uhr, weil ein übersprungener Dienst einen relativen Zeitgeber nicht weiterstellt). Steht in Obsidian ein Takt von 30 oder 60 Minuten, fallen die Zwischenzeiten aus, außer nach „Mails durchsuchen“. Beim ersten Start ab 06:30 Uhr der tägliche Sicherheitslauf: die Uni-Mails der letzten 24 Stunden noch einmal und ein Anstoß (Grund `taeglich`), auch ohne neue Mail |
| `studium-server-lauf.path` | startet den Claude-Lauf `lauf.mjs`, sobald ein Abruf oder Knopf einen Anstoß schreibt; Zeitgrenze 100 Minuten (ein Lauf mit Opus und der gewöhnliche, je bis 45 Minuten) |
| `studium-server-gmail.timer` | 07:30, 13:30 und 19:30 Uhr (Berlin): Anstoß mit Gmail-Suche, wenn der Takt es will (dreimal am Tag: letzte Suche über 2 Stunden her, so ersetzt der Sicherheitslauf die um 07:30; einmal: über 20 Stunden; nie: nie) |
| `studium-server-aktualisieren.timer` | täglich: Claude Code (`claude update`, nicht während eines Laufs, ohne Nutzungs- und Fehlerberichte), dann neues Server-Paket aus dem Release, nur mit passender Prüfsumme, nur mit gültiger Signatur (`studium-server.tar.gz.sig`, `ssh-keygen -Y verify` mit `allowed_signers` des laufenden Pakets, nie aus dem Download; siehe `docs/release.md`, „Signatur des Server-Pakets“) und nur vorwärts (nie auf eine ältere Version zurück). Dieselbe Version gilt nur als aktuell, wenn ihr Paket die Marke `.installiert` hat; die setzt der Installer erst nach „Prüfen“, so installiert der nächste Lauf eine abgebrochene Installation noch einmal. Die Prüfsumme nennt GitHub selbst; erst die Signatur verhindert, dass ein Release, das jemand mit dem GitHub-Konto oder einem Token anlegt, auf jedem Server als root läuft. Server mit 0.7.5 oder älter installieren das erste signierte Paket noch ohne diese Prüfung, ab dann jedes mit. Das Ergebnis (Zeit, `ok`, Zielversion, bei einem Fehler der Schritt, etwa `signatur-fehlt` oder `signatur`, letzter Erfolg) steht in `aktualisierung.json` und im Status unter `aktualisierung`; Obsidian sagt es, wenn seit mehr als 3 Tagen nichts ohne Fehler durchkam, obwohl es eine neuere Version gibt |
| Firewall | Port 443 in den iptables-Regeln des Servers (die Sicherheitsliste des Netzes legt `einrichten.mjs netz` an; die Standardliste, die Oracle mit dem Netz anlegt und die dessen Kennzeichen erbt, erlaubt nur 22 und zählt nicht als eigene) |

### Schutz der Dienste (systemd)

Jeder Dienst ohne root läuft in einem Sandkasten von systemd (`systemd-analyze security` zeigt die Wertung): keine neuen Rechte,
keine Capabilities, System schreibgeschützt (`ProtectSystem=strict`, schreiben nur in den eigenen Ordnern), eigene `/tmp` und
`/dev`, Kernel, Uhr, Hostname und Cgroups unberührt, nur die Netzarten, die er braucht, Systemaufrufe nur aus `@system-service`
ohne `@privileged` (ein gesperrter Aufruf scheitert mit `EPERM`, statt den Dienst zu beenden), fremde Prozesse unsichtbar.
`MemoryDenyWriteExecute` nur beim Abruf (Python); Node.js und Claude Code übersetzen zur Laufzeit.
Wertung von `systemd-analyze security` in Ubuntu 24.04 (systemd 255, 01.11.2026): Speicherreserve und Gmail-Anstoß 0,9
(„SAFE“), Web-Dienst 1,2, Abruf, Claude-Lauf und Zustand 1,4 („OK“; 10 wäre ungeschützt).

| Dienst | sieht nicht | Netz |
|---|---|---|
| Web-Dienst | Home von `studium` (Claude-Anmeldung, Claude Code), Lauf-Ordner (`laeufe/`, dort stehen die Rechte des Laufs), Rohdaten des Abrufs (`abruf/`), Uni-Zugang (verschlüsselt und entschlüsselt), `livesync.json` | nur 127.0.0.1 (Caddy) |
| Claude-Lauf | `/etc/studium-server` (Schlüssel des Dienstes, LiveSync), Uni-Zugang | ja (Claude, zentrale Termine) |
| Zustand | `/etc/studium-server`, entschlüsselte Zugänge (ob der Uni-Zugang gespeichert ist, sieht er am Dateinamen), `web/`, Eingang, Unterlagen | ja (`claude auth status`) |
| Abruf | Home von `studium`, `/etc/studium-server`, Lauf-Ordner, Eingang, Unterlagen, Einmal-Codes und LiveSync-Links (`web/verbinden/`, `web/livesync-links/`) | ja (IMAP) |
| Speicherreserve, Gmail-Anstoß | Home von `studium`, `/etc/studium-server`, Uni-Zugang | keins |

**Eigene Benutzer:** Der Web-Dienst nimmt Anfragen aus dem Internet an und läuft darum als eigener Benutzer `studium-web`. Ein
Fehler darin reicht so weder an die Anmeldung von Claude noch an Mails, Lauf-Ordner oder einen laufenden
Claude-Lauf: Deren Dateien gehören `studium` und sind für andere nicht lesbar, und `kill` wie auch `/proc/<PID>/` (Umgebung,
Ordner, Speicher) verlangen denselben Benutzer (`ProtectProc=invisible` blendet nur die Prozesse anderer Benutzer aus). Bis 0.7.6
liefen Web-Dienst und Claude-Lauf beide als `studium`, und nur `InaccessiblePaths` hielt den Web-Dienst von Claudes Dateien fern;
ein Fehler darin hätte über `/proc` oder Signale trotzdem einen laufenden Lauf erreicht. Zusätzlich sperrt systemd ihm diese Ordner
weiterhin. Eine Grenze bleibt: Was der Web-Dienst dem Lauf hinlegt (Stand aus Obsidian, Unterlagen, Folien), liest Claude im selben
Lauf wie Gmail, und die Ergebnisse in `eingang/` gibt der Web-Dienst aus. Ein übernommener Web-Dienst könnte dort Text unterbringen,
der Claude dazu bringen soll, Mails in die Ergebnisse zu schreiben. Claude darf in Gmail nur lesen und nur `ausgabe.json`
schreiben, das Ergebnis geht durch die Filter in `eingang.mjs`, und der Skill nimmt Quellen als Daten, nicht als Anweisungen; eine
feste Grenze wie die Benutzer ist das nicht (dafür bräuchte Gmail einen eigenen Lauf ohne die Dateien des Web-Dienstes). Jeder Teil schreibt nur in seinen Ordner, und was ein anderer lesen soll, schreibt er ausdrücklich so (Tabelle unten).
In die Gruppe `studium-web` lässt die Einheit des Laufs ihn (`SupplementaryGroups=`), nicht der Benutzer `studium`; so liest nur der
Lauf, was der Web-Dienst ihm hinlegt. Der Updater (`studium-server-aktualisieren`, root) bleibt ohne Sandkasten: Er muss alles
dürfen, was `installieren.sh` tut. Der Installer schreibt die Einheiten bei jedem Lauf neu; bestehende Server bekommen den Schutz
mit dem nächsten täglichen Update.

**Was sonst auf 127.0.0.1 lauscht:** Der Web-Dienst darf nur mit 127.0.0.1 sprechen, dort aber mit allem, was lauscht.
Caddys Admin-Schnittstelle (ohne Anmeldung; sie ersetzt auf Zuruf die ganze Konfiguration) hört darum nicht auf `localhost:2019`,
sondern nur auf dem Socket `/run/caddy/admin.sock` im Ordner von Caddy (0700; `admin` im Caddyfile, den Ordner legt
`/etc/systemd/system/caddy.service.d/studium-server.conf` an). Bis 0.7.6 hätte ein übernommener Web-Dienst über sie Caddy umleiten
und den Verkehr der Geräte abgreifen können. Beim Wechsel startet der Installer Caddy neu (ein `reload` suchte schon den neuen
Socket), danach lädt er nur neu. CouchDB (mit LiveSync, ebenfalls auf 127.0.0.1) erreicht der Web-Dienst weiter, aber nur mit dessen
Anmeldung; die Ordner von Caddy (`/var/lib/caddy`, `/run/caddy`) und CouchDB (`/opt/couchdb/etc`, `/var/lib/couchdb`) sperrt
systemd ihm.

**Umzug bestehender Server:** Bis 0.7.6 lag alles direkt in `/var/lib/studium-server`. Beim ersten Lauf des Installers danach
hält er alle Dienste, die dort schreiben, kurz an (ein laufender Claude-Lauf legt Rohdaten und Unterlagen dabei zurück), verschiebt,
was Web-Dienst und Abruf dort ablegten, in ihre Ordner (nur echte Dateien und Ordner; liegt dort schon etwas, etwa nach einem
abgebrochenen Umzug, bleibt die neuere Datei, Ordner werden zusammengeführt), setzt Besitzer und Rechte und startet die Dienste
wieder. Fertig ist der Umzug erst mit der Marke `.umzug-fertig` am Ende: Fehlt sie (ein Abbruch dazwischen) oder liegen noch alte
Namen im Ordner, hält der nächste Lauf wieder an und richtet alles noch einmal. Sonst richtet jeder weitere Lauf nur noch die
Ordner selbst (`ordnung` in `installieren.sh`, wiederholbar). Ein Zurückgehen von Hand auf
0.7.6 fände die Dateien danach nicht mehr am alten Ort.

#### Wer was liest und schreibt

Pfade in `/var/lib/studium-server`. Eine 2 vorn (setgid) heißt: Was im Ordner entsteht, bekommt dessen Gruppe.

| Pfad | Besitzer, Rechte | schreibt | liest außerdem |
|---|---|---|---|
| der Ordner selbst | `studium:studium-web`, 2711 | Claude-Lauf, Zustand, Speicherreserve, Gmail-Anstoß, `studium-server` (als `studium`) | Web-Dienst und Abruf gehen nur hindurch, auflisten können sie ihn nicht |
| `zustand.json`, `aktualisierung.json` | `studium:studium-web`, 0640 | Lauf und Zustand bzw. `studium-server aktualisieren` | Web-Dienst (Status) |
| alles andere darin (`anstoss`, `termine.json`, `kapitel.json`, `hinweise-bisher.json`, `nutzung.json`, `einstellungen.json`, `livesync-an` …) | `studium`, 0600 | Lauf, Gmail-Anstoß, `studium-server`, `livesync.sh` (als `studium`) | niemand; ob ein Anstoß wartet, sieht der Web-Dienst am Namen |
| `laeufe/` | `studium:studium`, 0700 | Lauf | niemand (Mails, Auszug aus dem Tresor, Rechte des Laufs) |
| `web/` | `studium-web:studium-web`, 2771 | Web-Dienst; `studium-server verbinden`, `schluessel-erneuern` und `livesync.sh` als `studium-web` | Lauf (Gruppe): `stand-plugin.json` (0640), nimmt den Anstoß `web/anstoss`; Lauf, Abruf und Gmail-Anstoß: `takt.json`, der Abruf auch `knopf.json` (beide 0644). `verbinden/`, `livesync-links/` und `geraete.json` nur der Web-Dienst (0700 bzw. 0600) |
| `abruf/` | `studium-abruf:studium`, 2770 | Abruf: `roh/`, `abruf-stand.json`, `uni-zugang-falsch`, `anstoss` | Lauf (Gruppe): übernimmt `roh/` und den Anstoß; Zustand: `uni-zugang-falsch` |
| `eingang/` | `studium:studium-web`, 2770 | Lauf (Ergebnisse, 0640) | Web-Dienst: gibt sie aus und löscht Übernommenes |
| `unterlagen/neu/`, `opus/`, `kapitel/` | `studium:studium-web`, 2770 (`unterlagen/` selbst 2750) | Web-Dienst (0640) | Lauf (Gruppe): übernimmt sie und legt sie nach einem Fehlschlag zurück |

Bis 0.7.6 konnte der Abruf (Gruppe `studium`) auch den Stand aus Obsidian mit dem Auszug aus dem Tresor lesen; jetzt sieht er
davon nur den Takt. Den Stand (`stand-plugin.json`) liest nur der Lauf.

**Keine Links:** Wo ein Dienst in einem Ordner liest, umbenennt oder löscht, in den ein anderer Benutzer schreibt (der Lauf in
`abruf/`, `web/` und `unterlagen/`, der Zustand bei `zustand.json`, der Abruf bei `takt.json` und `knopf.json`), nimmt er nur echte
Dateien und Ordner und folgt nie einem Link
(`dateien.mjs`: Öffnen mit `O_NOFOLLOW`, vorher `lstat`, danach derselbe Eintrag laut `fstat`; geschrieben wird über eine
Zwischendatei mit Zufallsnamen, exklusiv angelegt, und `rename`, das einen Link an der Stelle ersetzt, ohne ihm zu folgen). Was in
übernommenen Rohdaten weder Datei noch Ordner ist, löscht der Lauf, bevor Claude sie liest. Bis 0.7.6 hätte ein Link an der Stelle
von `zustand.json` den Zustand die Claude-Anmeldung lesen und in eine gewöhnliche Datei schreiben lassen. root legt im
Datenordner nichts selbst an: `studium-server` und `livesync.sh` schreiben und löschen dort als der Benutzer, dem der Ordner
gehört, und der Installer ändert Besitzer nur mit `chown -h` (der Link selbst) und Rechte über einen Deskriptor, den `open` mit
`O_NOFOLLOW` und `O_DIRECTORY` nur für einen echten Ordner bekommt.

`UMask` ist 0077, außer beim Web-Dienst (0027: Was er schreibt, liest der Lauf über die Gruppe; `takt.json` und `knopf.json`
schreibt er ausdrücklich mit 0644) und beim Abruf (0007: `roh/` und den Anstoß übernimmt der Lauf über die Gruppe `studium`).
`zustand.json` und die Ergebnisse in `eingang/` schreibt der Lauf ausdrücklich mit 0640, `aktualisierung.json` entsteht mit
`umask 027`.

### Updates der Pakete

`unattended-upgrades` installiert jede Nacht Sicherheitsupdates von Ubuntu und dazu alle Updates aus den Archiven von Caddy
(Cloudsmith), Node.js (NodeSource) und, mit LiveSync, CouchDB (Apache bei JFrog): `52studium-server-quellen` in
`/etc/apt/apt.conf.d/` mit Mustern aus deren Release-Dateien (`site=dl.cloudsmith.io,origin=cloudsmith/caddy/stable`,
`site=deb.nodesource.com,codename=nodistro`, `site=apache.jfrog.io,origin=Artifactory,codename=noble`; geprüft 01.11.2026 mit
`apt-cache policy` und `unattended-upgrade --dry-run` in Ubuntu 24.04). Braucht ein Update einen Neustart, startet der Server um
03:30 Uhr UTC neu. Bis 0.7.6 waren Caddy und CouchDB davon ausgenommen.

**Node.js:** Ubuntu 24.04 bringt Node.js 18 aus universe, seit April 2025 ohne Sicherheitsupdates. Der Installer richtet das
signierte Archiv von NodeSource für Node.js 24 ein (gepflegt bis April 2028): Schlüssel nur mit dem Fingerabdruck
`6F71F525282841EEDAF851B42F59B5F99B1BE0B4` und als einziger Schlüssel der Datei, sonst bricht der Schritt ab, ohne etwas zu ändern;
ein Pin (`/etc/apt/preferences.d/studium-server-nodejs`) hält `nodejs` bei NodeSource. Server mit Node.js 18 wechseln beim nächsten
Update; der Schritt ist wiederholbar und holt nichts, wenn Node.js 24 schon da ist. Läuft die Linie aus, `NODE_MAJOR` im Installer
erhöhen.

**Täglich:** `studium-server aktualisieren` hebt zuerst `caddy`, `nodejs` und (mit LiveSync) `couchdb` an, unabhängig von einer
neuen Version des Server-Pakets (bis 0.7.6 erst nach einer neuen Version, also fast nie). Dabei nur, was installiert ist
(`dpkg-query`, Status `installed`): Ohne LiveSync gibt es weder CouchDB noch sein Paketarchiv, und apt bräche mit „Unable to locate
package“ ab. Wartet es dafür auf ein anderes `apt`,
höchstens 10 Minuten. Danach starten Web-Dienst und Speicherreserve neu, wenn sie noch mit einem alten Node.js laufen
(`/proc/<MainPID>/exe` endet auf „ (deleted)“, weil das Update `/usr/bin/node` ersetzt hat), auch nach einem Update aus der Nacht
von `unattended-upgrades`; ein Dienst, der nicht läuft, bleibt aus. Bis 0.7.6 startete `aktualisieren` danach nichts neu.
Scheitert der Schritt, kommt das neue
Server-Paket trotzdem; der Lauf zählt dann als gescheitert (Grund `pakete` im Status).

### Web-Dienst (`dienst.mjs`)

| Weg | Wer | Was |
|---|---|---|
| `GET /v1/status` | alle | Stand aus festen Werten: Version, Claude, Gmail (`ok`, `fehlt`, `aus` bei Takt „nie“), Weiterleitung, Uni-Zugang, Reserve, LiveSync (`livesync`: `an`/`aus`), letzter Abruf, letzter Lauf, ob ein Lauf wartet oder läuft (`claude_lauf`), am Limit des Claude-Abos der nächste Versuch (`limit_wieder`, sonst `null`), die letzte neue Version (`aktualisierung`: Zeit, `ok`, `ziel`, `grund` aus fester Liste, `erfolg`; `null` ohne Ergebnis, etwa bei älteren Servern), Fehlercodes. Nie Namen, Adressen, Texte oder Schlüssel |
| `POST /v1/anstoss` | mit Zugangsschlüssel | Knopf „Mails durchsuchen“ in Obsidian: Anstoß für einen Lauf mit Gmail (Grund `knopf`), höchstens alle 10 Minuten (sonst 429 mit `wieder`); ersetzt einen wartenden Anstoß des Web-Dienstes (Unterlagen und Folien übernimmt der Lauf bei jedem Grund) |
| `GET /v1/eingang` | mit Zugangsschlüssel | noch nicht übernommene Ergebnisse, verschlüsselt; nach 30 Tagen fällt eine Datei nur weg, wenn alle ihre Termine vorbei sind, spätestens nach 180. Dazu `verbunden`: die letzten 20 Verbindungen von Geräten (Zeit, Herkunft `cloud-shell` oder `obsidian`), nur hier und nie im Status |
| `POST /v1/stand` | mit Zugangsschlüssel | verschlüsselter Stand des Plugins (Modulcodes, Studienbeginn, Variante, laufendes Semester und die Module ohne zentrale Kapitelliste (`lernplan`), Auszug aus dem Tresor: Termine mit Titel und Datum, offene To-dos; Takt aus den Einstellungen, Uni-Postfach 15, 30 oder 60 Minuten und Gmail 3-, 1- oder 0-mal am Tag, auch als `takt.json` für den Abruf; übernommene Dateien, diese löscht der Server) |
| `POST /v1/unterlagen` | mit Zugangsschlüssel | verschlüsselt bis zu 3 Textfassungen von Unterlagen (nur Folien, Skript, Übung, Tutorium, Lab, Lösung, Altklausur, Literatur; je höchstens 400 000 Zeichen) nach `unterlagen/neu/`, mit `modell: "opus"` (Knopf „Zusammenfassen“) nach `unterlagen/opus/`, mit `nur_termine` (Module ohne zentrale Termine aus Unterlagen) mit der Kopfzeile „Auftrag: nur Termine“, mit `fassung` (neue Fassung einer schon zusammengefassten Unterlage: frühere Zusammenfassung, geänderte Seiten, was unter „Zu tun“ und „Offene Fragen“ schon steht; geprüft) mit diesen Zeilen im Kopf, zusammen höchstens 30 warten (sonst 429; das Plugin schickt bis zu 3 Anfragen je Abruf, Gewünschtes zuerst); stößt einen Lauf an, wenn keiner wartet |
| `POST /v1/kapitel` | mit Zugangsschlüssel | verschlüsselt bis zu 3 Textfassungen von Folien (je höchstens 60 000 Zeichen, mit Nummer, Datum und Quelle der Unterlage) der Module, für die der Stand eine Kapitelliste für den Lernplan wünscht, nach `unterlagen/kapitel/`; höchstens 30 warten (sonst 429); stößt einen Lauf an, wenn keiner wartet |
| `POST /v1/pdf` | mit Zugangsschlüssel | verschlüsselt ein Stück (8 MB, Zweck `pdf`) einer PDF zu einer gewünschten Zusammenfassung, der Reihe nach (sonst 409); nach dem letzten und geprüftem SHA-256 liegt sie als `unterlagen/opus/<SHA-256>.pdf` da. Die Textfassung kommt gleich danach und nennt sie im Kopf, Opus liest dann die PDF. Je PDF bis 500 MB (sonst 413), höchstens 6 und zusammen 1 GB warten (sonst 429), ohne Textfassung oder halb hochgeladen verfällt eine nach einem Tag; nach einem erfolgreichen Lauf gelöscht |
| `POST /v1/verbinden` | mit Einmal-Code | Adresse, Zugangs- und Datenschlüssel für ein neues Gerät; der Code gilt einmal, auch bei gleichzeitigen Anfragen |
| `POST /v1/geraet` | mit Zugangsschlüssel und Datenschlüssel | Knopf „Weiteres Gerät verbinden“ in Obsidian: Die Anfrage ist ein Paket mit Zweck `verbinden` und `{ schema: 1, zeit, nonce }` (Zeit höchstens 2 Minuten neben der Uhr des Servers, sonst 400 `uhr`; jeder Zufallswert nur einmal, sonst 409). Zurück kommt ebenso verschlüsselt `{ code, ablauf }`: ein Einmal-Code für 10 Minuten, der den vorigen aus Obsidian zurückzieht; höchstens 3 je Stunde und 10 je Tag (sonst 429 mit `wieder`) |
| `GET /v1/livesync/<kennung>` | mit Kennung (20 Zeichen, 30 Minuten) | Seite mit dem Knopf „In Obsidian öffnen“ für den Setup-Link von LiveSync; unbekannte Kennungen zählen als Fehlversuch (siehe „LiveSync“) |

Je Absender (letzter Eintrag in `X-Forwarded-For`, den Caddy setzt) antworten die geschützten Wege nach 10 Fehlversuchen in
10 Minuten 10 Minuten lang mit 429. Ein gültiger Zugangsschlüssel wird nie gesperrt, sonst könnte jeder das Plugin aussperren.
Jeder Weg hat eine eigene Grenze für die Größe einer Anfrage (`MAX_KOERPER` in `dienst.mjs`: 1 KB bis 4 MB, ein Teil einer PDF
etwas über 8 MB); was darüber liegt, lehnt der Dienst mit 413 ab.

**Datenkanal (`kanal.mjs`):** AES-256-GCM über Web Crypto, dieselbe Schnittstelle wie im Plugin. Ein Paket ist
`{ schema, zweck, iv, daten }`. Der Zweck („eingang“, „stand“, „unterlagen“, „kapitel“, „pdf“ oder „verbinden“) ist Teil der Verschlüsselung, damit sich ein Paket nicht als
das andere ausgeben lässt.

**Verbinden:** `sudo studium-server verbinden` zeigt einen Link `obsidian://studium-autopilot?aktion=server-verbinden&…` und
einen QR-Code. Darin steht nur ein Code, der einmal und 30 Minuten gilt. Die Schlüssel holt das Plugin über HTTPS und legt sie
in den Schlüsselbund des Geräts. Auf dem Server liegt nur der SHA-256 des Codes. Wer einlöst, legt zuerst exklusiv eine Marke
`<SHA-256>.json.eingeloest` an (`O_EXCL`); lösen zwei Anfragen denselben Code zugleich ein, bekommt nur eine die Schlüssel. Ein
`rename` reichte dafür nicht: Unter Windows gelingen zwei gleichzeitige `rename` derselben Datei beide (der Test lief dort rot).

**Weiteres Gerät ohne Cloud Shell:** Ein verbundenes Gerät holt im Fenster „Eigener Server“ mit **Weiteres Gerät verbinden**
(nach einer Rückfrage) einen Code über `POST /v1/geraet` und zeigt ihn groß, bis er abläuft; das neue Gerät tippt ihn unter
**Mit Code verbinden** ein und löst ihn wie oben ein. Die Anfrage muss mit dem Datenschlüssel verschlüsselt sein: Den
Zugangsschlüssel trägt jede Anfrage im Kopf, und wer nur ihn kennt, bekäme über einen Code sonst den Datenschlüssel. Zeit und
Zufallswert verhindern, dass eine mitgeschnittene Anfrage noch einmal einen Code holt (die Zufallswerte bleiben in
`geraete.json` bis zum Ende ihres Fensters gemerkt, auch über einen Neustart). Codes aus Obsidian gelten 10 Minuten, höchstens
einer ist offen, höchstens 3 je Stunde und 10 je Tag; Codes aus der Cloud Shell zählen dabei nicht und bleiben. Jedes Einlösen
steht mit Zeit und Herkunft in `geraete.json` (die letzten 20); Obsidian zeigt das letzte im Fenster als „Zuletzt verbunden“.

**Gerät verloren:** `sudo studium-server schluessel-erneuern`
(aus der Cloud Shell: `bash ~/studium-autopilot/server/fern.sh schluessel-erneuern`) hält den Web-Dienst an, löscht alle offenen
Codes, schreibt neue Zugangs- und Datenschlüssel (32 Byte wie beim Installieren) in eine neue `dienst.json` (root:studium-web, 0640),
die die alte in einem Schritt ersetzt, und startet den Dienst wieder, auch nach einem Fehler. Danach kennt der Server kein Gerät mehr: das erste mit `studium-server verbinden`, jedes weitere
mit **Weiteres Gerät verbinden**; ein Gerät mit alten Schlüsseln bietet im Fenster selbst **Mit Code verbinden** an. Der Installer
behält die neuen Schlüssel bei jedem weiteren Lauf. **Grenze:** LiveSync hat eigene Zugangsdaten (`livesync.json`); die erneuert
dieser Befehl nicht.

### Abruf ohne KI (`abrufen.py`)

Nur Python-Standardbibliothek. Neues landet in `abruf/roh/` mit einer Zeile in `abruf/roh/INDEX.md`; nur dann gibt es einen Anstoß
für Claude (`abruf/anstoss`). Den Takt (`web/takt.json`) und den Knopf (`web/knopf.json`) des Web-Dienstes liest er nur als echte
Datei, nie über einen Link, und höchstens 64 KB. Der Server gibt Claude nur, wofür es KI braucht: Mails. Abgaben aus dem ILIAS-Kalender holt das Plugin selbst und ohne
KI (ein Schreiber je Quelle, `eba.quelleExtern`); Kurstitel mit Kurs-Passwörtern gehen so nie an Claude.

- **Uni-Postfach:** IMAP über TLS (mindestens 1.2) mit Prüfung von Zertifikat und Servername; passt eines nicht, geht kein
  Passwort raus (bis 0.7.6 nahm der Abruf den Standard von `imaplib`, einen Kontext ohne Prüfung). Nur lesend (`EXAMINE`,
  `BODY.PEEK`, nichts wird als gelesen markiert). Beim ersten Abruf die letzten 14 Tage, danach nur neue Mails (UID), höchstens 30 je Abruf. Mails werden zu Text (HTML ohne Skripte). Den
  Uni-Zugang bekommt nur dieser Dienst über `LoadCredentialEncrypted`.
- **Anhänge:** Kalender (`.ics`) stehen als eine Zeile je Termin am Ende des Texts (Titel, Beginn, Ende, Ort; höchstens 40 je
  Anhang). PDFs legt der Abruf unverändert neben die Mail (`abruf/roh/uni-postfach/<UID>-anhang-<n>.pdf`, höchstens 3 je Mail, je bis
  10 MB, zusammen bis 40 MB je Abruf; der Text nennt sie), gelesen werden sie erst im Claude-Lauf und nur, wenn eine nach
  Terminen aussieht: Dieser Dienst hat den Uni-Zugang, ein PDF-Leser hier hätte mit einer präparierten Datei Zugriff darauf.
  Nach einem erfolgreichen Lauf sind die PDFs weg. Andere Anhänge nur mit Namen; beim Nachlesen im Sicherheitslauf nur der Text.
  Über die Weiterleitung an Gmail kommen Anhänge nicht auf den Server.

### Claude-Lauf (`lauf.mjs` und `skill/`)

Je Lauf ein eigener Ordner `laeufe/<Zeit>/` mit `auftrag.md`, den Rohdaten, `bisher.json` (schon gelieferte Termine),
`stand.json` (vom Plugin), `tresor.json` (was schon in Obsidian steht: Termine mit Titel und Datum, offene To-dos mit Kennung und Notiz; geprüft wie
das Eingang, To-dos mit Zugangsdaten fallen weg; doppelte To-dos nennt Claude als Paar `todo_doppel` aus diesen Kennungen, das
Plugin macht aus dem einen einen einfachen Punkt mit Link auf das andere), `zentral.json` (die öffentlichen Termine aller EcoBA-Studierenden, damit Claude
sie nicht doppelt liefert), die ältesten Textfassungen aus `unterlagen/neu/` (bis zu 6, zusammen höchstens 200 000 Zeichen, eine größere allein; der Rest im nächsten Lauf gleich danach) (Ordner `unterlagen/`, dazu schreibt Claude
Begleitnotizen; scheitert der Lauf, kommen sie zurück, warten danach noch welche, startet gleich der nächste Lauf) und dem Skill
`studium-autopilot`. Claude Code läuft headless (`claude -p`) mit dem Abo des Nutzers, Standardmodell
Sonnet (`studium-server modell opus` für Opus). Warten Unterlagen in `unterlagen/opus/` (in Obsidian per Knopf „Zusammenfassen“
gewünscht), läuft vorher ein eigener Lauf mit Opus nur für sie (höchstens 3, ohne Mails und ohne Gmail; eine PDF daneben kommt
mit und wird nach dem Lauf gelöscht); der gewöhnliche Lauf folgt mit demselben Anstoß:

- **Werkzeuge:** nur Lesen, Suchen und Schreiben von `ausgabe.json`; kein Bash, kein Web, keine Unteragenten, nichts außerhalb
  des Lauf-Ordners (Glob und Grep ohne eigene Freigabe; mit Claude Code im Modus `dontAsk` geprüft: außerhalb verweigert). Kein
  Gesprächsprotokoll (`--no-session-persistence`): Es enthielte, was Claude in Gmail gesehen hat. Kein Gedächtnis über Läufe
  hinweg und keine Sicherungen geänderter Dateien (`CLAUDE_CODE_DISABLE_AUTO_MEMORY`, `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING`, in
  `.rechte.json` dazu `autoMemoryEnabled` und `fileCheckpointingEnabled` aus): Sonst schriebe Claude Code unter
  `/var/lib/studium/.claude` eigene Notizen bzw. frühere Fassungen von `ausgabe.json` ab, auch mit Inhalten aus Mails (ob es
  `file-history/` mit `-p` und `--no-session-persistence` überhaupt anlegt, sagt die Anleitung von Claude Code nicht). Gmail nur lesend und nur, wenn die Gmail-Suche dran ist (Uhrzeiten oben, Knopf, Sicherheitslauf, oder letzte Suche
  laut Takt lange genug her); mit Takt „nie“ gar nicht. Erlaubt sind nur `search_threads`, `get_thread`, `get_message` und
  `list_labels`; alles andere verweigert der Modus `dontAsk`, und eine Sperrliste nennt zur Sicherheit jedes Werkzeug des
  Connectors, das sendet, Entwürfe liest oder schreibt, Filter, Labels oder Spam ändert oder löscht (`create_filter`,
  `list_drafts` …; Stand 01.11.2026, Verzeichnis der Connectors auf claude.com). Ist Gmail nicht dran, lädt Claude Code die
  Connectors von claude.ai gar nicht (`ENABLE_CLAUDEAI_MCP_SERVERS=false`). `--strict-mcp-config` schiede aus: Es schaltet auch
  Gmail ab. Der Lauf sieht weder Uni-Zugang noch Schlüssel des Dienstes.
- **Gmail:** zuerst feste Suchen nach Uni-Mails (`newer_than:<n>d`, seit der letzten erfolgreichen Suche, höchstens 14 Tage),
  deren Treffer Claude ganz liest; dann ein Überblick über alle Mails seit der letzten erfolgreichen Suche (`after:<Sekunden>`,
  eine Stunde Überlappung, höchstens 3 Tage zurück; ohne soziale Netzwerke, eigene Mails und Entwürfe; höchstens 4 Seiten zu
  50): Claude sieht Absender, Betreff und Vorschau und ist angewiesen, ganz nur zu lesen, was zum Studium gehört (Uni,
  Studierendenwerk, Initiativen, Lehrende, Lernplattformen; höchstens 30 je Lauf). Erzwingen kann der Server weder diese
  Auswahl noch die Grenze: `get_thread` und `get_message` nehmen jede Kennung, und welche Mail Claude öffnet, entscheidet es
  selbst. Ein Hook vor jedem Aufruf (`PreToolUse`) hülfe nicht: Die Mails des Überblicks hat Claude selbst gefunden, und ob eine
  zum Studium gehört, lässt sich nur an ihrem Inhalt entscheiden; darum gibt es keinen. So kommen auch Mails an, die nicht von
  der Uni kommen. Was über die Grenzen hinausgeht, kommt nicht wieder dran (Uni-Mails fangen die festen Suchen auf); die 3 Tage halten den Überblick beim
  ersten Mal und nach einer Pause in seinen Grenzen. Lag die letzte erfolgreiche Suche länger zurück (Gmail auf „nie“ und wieder
  an, lange Pause), bleiben ältere Mails, die nicht von der Uni kommen, ungesehen; im gewöhnlichen Takt liegen höchstens 20
  Stunden dazwischen. Was Claude von anderen Mails sieht, soll laut Anweisung nicht in die Ausgabe (`eingang.mjs` prüft die Form
  der Ausgabe, nicht, woher ein Text stammt); kommt eine Mail nicht von einer Einrichtung
  der Uni, nennt `quelle_text` die Domain einer Organisation oder „private Adresse“ bzw. „Studierenden-Adresse“, und wer sich
  dabei als Uni ausgibt, bekommt `status: "geschätzt"`. Im Lauf-Ordner bleibt `ausgabe.json` nur in der geprüften Fassung
  (`geprueft: true`), nach einem Fehlschlag gar nicht. `protokoll.json` hat unter `gmailUeberblick` nur die
  Zahlen (`gelistet`, `gelesen`, `begrenzt`), `nutzung.json` zählt je Tag die Läufe an einer Grenze (`gmail_begrenzt`). Skill
  `termine.md`, Abschnitt „Quellen“.
- **Kapitellisten für den Lernplan:** Für Module des laufenden Semesters ohne zentrale Kapitelliste (`kapitel.json` der
  zentralen Daten) schickt das Plugin die Folien (die ersten 8 Seiten ganz, danach je Seite die erste Zeile). Liegen neue in
  `unterlagen/kapitel/`, kommen bis zu 12 (zusammen höchstens 150 000 Zeichen) in den gewöhnlichen Lauf (Ordner `kapitel/`, mit
  dem Modell des Servers, nie in den Lauf mit Opus), dazu die bisher gelieferten Listen (`kapitel-bisher.json`); Folien von Modulen,
  nach denen der Stand nicht mehr fragt, fallen vorher weg. Claude liefert je Modul die ganze Liste (Skill `lernplan.md`); der
  Server prüft sie mit denselben Regeln wie das Plugin `kapitel.json`, nimmt nur gefragte Module, legt nur Neues oder Geändertes
  ins Eingang und merkt sich die Listen in `kapitel.json` (nur das laufende Semester), damit der nächste Lauf sie berichtigt.
  Fehlt dort eine (Server neu eingerichtet), nimmt der Lauf die aus dem Stand: Nummern, Titel und Unterkapitel der
  Lernplan-Notizen, die schon vom Server stammen (geprüft wie das Eingang, zusammen höchstens 150 000 Zeichen). So bleiben die
  Titel gleich, an denen die Häkchen hängen.
- **Prüfung (`eingang.mjs`):** Jeder Termin muss die Regeln des Plugins für zentrale Termine erfüllen (Kategorien, Modulcode,
  Datum, keine Links oder Markdown im Titel); ungültige fallen einzeln weg. Links (`https://`, `www.`, `mailto:`) entfernt der
  Server aus allem, was Studierende lesen (Titel, Ort, Info, Quelle, Hinweise, Begleitnotizen); Schlüssel und Kapitellisten
  säubert er wie das Plugin. Die id leitet der Server aus Claudes `schluessel`
  ab, damit eine Änderung denselben Termin trifft. Ins Eingang kommt nur, was neu oder geändert ist; Vergangenes nur als
  Änderung eines bekannten Termins. Im Bestand (`termine.json`, daraus `bisher.json` im Auftrag) bleibt ein Termin bis 60 Tage
  nach seinem Ende.
- **Fehler:** Bei Limit oder ungültiger Ausgabe kommen die Rohdaten zurück und der nächste Lauf versucht es erneut; der Status
  meldet `claude-limit` bzw. `ausgabe-ungueltig`. Gescheitert ist ein Lauf auch, wenn Claude Code mit 0 endet, aber `is_error`
  meldet (so am Limit).
- **Limit des Claude-Abos:** Der Lauf merkt sich in `zustand.json` unter `limit`, wann der nächste Versuch dran ist: nach 30
  Minuten, nach dem zweiten Treffer in Folge nach einer Stunde, dann alle zwei Stunden (wann das Limit endet, sagt Claude Code
  nur als Satz für Menschen). Bis dahin startet kein Lauf, außer auf Knopfdruck; neue Mails und Unterlagen warten in `abruf/roh/` und
  `unterlagen/`. Hängt der Lauf mit Opus am Limit, wartet auch der gewöhnliche. Ist der Zeitpunkt da, stößt der Dienst den Lauf an
  (Grund `wiederholung`, alle 5 Minuten geprüft, nicht während eines Laufs); hing eine Gmail-Suche am Limit, sucht er Gmail mit.
  Jeder andere Ausgang beendet die Versuche. Obsidian nennt die Uhrzeit (`limit_wieder` im Status).
- **Verbrauch:** `protokoll.json` jedes Laufs hat unter `nutzung` die Token aus der JSON-Ausgabe von `claude -p` (Eingabe,
  Ausgabe, Cache, Runden, Dauer, Listenpreis der API zum Vergleich; mit dem Abo kostet es nichts extra), `nutzung.json` je Tag
  (Berlin) Läufe, Läufe mit Opus, Treffer am Limit und die Token, 30 Tage lang (`studium-server nutzung`). Der Lauf übernimmt `abruf/roh/` in einem Schritt; was der Abruf währenddessen
  holt, wartet auf den nächsten, und beim Zurücklegen wird Datei für Datei zusammengeführt. Ist nichts zu tun (keine Meldung in
  `INDEX.md`, keine Unterlagen, Gmail nicht dran), startet Claude nicht, und was in `roh/` lag, kommt zurück; bis 0.7.6 löschte
  der Lauf es dann mit seinem Ordner, etwa Mails, deren Meldung fehlte, weil der Abruf dazwischen abbrach.
- **Was bleibt:** Nach jedem Lauf leert `lauf.mjs` den Lauf-Ordner bis auf `protokoll.json`, `auftrag.md` (Anlass und Zahl der
  Mails, keine Inhalte), `.rechte.json` und `.lauf.json`, dazu nach Erfolg die geprüfte `ausgabe.json` (dieselben Ergebnisse wie
  im Eingang); Claudes ungeprüfte Ausgabe löscht er, auch nach einem Fehlschlag. Mails, PDF-Anhänge, der Auszug aus dem Tresor, Stand, Unterlagen und Folien liegen also nur während des Laufs
  im Ordner (nach einem Fehlschlag oder Abbruch wieder in `abruf/roh/` bzw. `unterlagen/`, bis der nächste Lauf sie nimmt). Die
  letzten 10 Lauf-Ordner bleiben. Bis 0.7.6 blieb alles darin, auch die Mails. Ergebnisse für Obsidian warten in `eingang/`, bis
  ein Gerät sie übernimmt (siehe `GET /v1/eingang`).
  Bricht ein Lauf ab (Zeitgrenze von systemd, Neustart, Absturz), legt `lauf.mjs` Rohdaten und Unterlagen ebenso zurück: bei
  SIGTERM sofort, sonst beim nächsten Start für jeden Lauf-Ordner ohne `protokoll.json` (Protokoll `abgebrochen`, Status
  `claude-lauf`). Neu angestoßen wird dabei nicht, damit ein Lauf, der jedes Mal zu lange braucht, nicht im Kreis läuft.

### Uni-Zugang (freiwillig)

Empfohlen ist stattdessen eine Weiterleitung der Uni-Mails an Gmail (Status `weiterleitung: ok`): Dann liegt das
Uni-Passwort, das auch für ILIAS, Alma und Noten gilt, nicht auf dem Server. Die Mails kommen dafür erst mit der nächsten
Gmail-Suche an statt alle 15 Minuten.

`sudo studium-server uni-zugang setzen` fragt Benutzername und Passwort ab; das Passwort verdeckt (`systemd-ask-password`)
und nur über Pipes, nie in einer Befehlszeile. Gespeichert wird es nur verschlüsselt mit `systemd-creds` unter
`/etc/credstore.encrypted/uni-zugang` (nur root). Entschlüsselt bekommt es nur der Abruf des Uni-Postfachs, unter eigenem
Benutzer `studium-abruf`; Web-Dienst (`studium-web`) und Claude-Lauf (`studium`) können es auch während eines Abrufs nicht lesen
(`/run/credentials` und fremde Prozesse sind für sie unsichtbar). Nach einer abgelehnten Anmeldung laufen keine automatischen Versuche mehr
(Status `falsch`, Marke `abruf/uni-zugang-falsch`), damit das Uni-Konto nicht gesperrt wird. `uni-zugang loeschen` entfernt ihn,
`uni-zugang pruefen` zeigt nur, ob er da ist.

**Grenze:** Der Schlüssel von `systemd-creds` liegt auf demselben Server. Das Passwort steht also nie lesbar in einer Datei, im
Status, im Journal oder in einer Kopie der Datei allein; wer aber root auf dem Server ist, kann es entschlüsseln. Darum: nur
Schlüssel-Anmeldung per SSH (kein Passwort, kein root), automatische Sicherheitsupdates mit Neustart, von außen nur Port 22 und 443
offen, Metadaten der Instanz nur über IMDSv2.

### LiveSync (freiwillig)

Gleicht den Tresor über den eigenen Server zwischen Windows, Mac, iPhone, iPad und Android ab, mit dem Community-Plugin
Self-hosted LiveSync. Eingerichtet wird es mit Claude (Skill `server-einrichten`, `livesync.md`); in Obsidian steht dafür im
Fenster „Eigener Server“ ein Knopf **Prompt kopieren**, aber nur auf einem verbundenen Gerät, auf dem LiveSync noch nicht läuft.

`sudo studium-server livesync` (`livesync.sh`) schaltet beim ersten Mal ein und zeigt dann einen Link für ein Gerät:

| Teil | Was |
|---|---|
| CouchDB | aus dem Paketarchiv von Apache (`couchdb-deb`, Arm und x86), ein Knoten, nur auf 127.0.0.1, Anmeldung immer nötig, CORS nur für die Obsidian-Apps (Computer, iPhone/iPad, Android) |
| Caddy | `https://obsidian.<IP mit Bindestrichen>.sslip.io` → CouchDB (`/etc/caddy/studium-server.d/livesync.caddy`, eingebunden vom Caddyfile). Nach einem IP-Wechsel zieht `livesync.sh adresse` Adresse und Caddy-Teil nach; das ruft der Installer auf, und `verbinden` tut es auch |
| `/etc/studium-server/livesync.json` | Benutzer, Passwort (32 Zeichen), Datenbank, Schlüssel der Ende-zu-Ende-Verschlüsselung von LiveSync (32 Zeichen); nur root |
| `/var/lib/studium-server/livesync-an` | Marke für den Status (`livesync: an`), angelegt als `studium` |

Der Benutzer ist der Administrator von CouchDB: LiveSync braucht diese Rechte für „Overwrite remote“, und auf dem Server liegt
nur dieser eine Tresor. In der Datenbank liegt er verschlüsselt, auch die Dateinamen.

**Link für ein Gerät:** `livesync.mjs` baut die Einstellungen (Ende-zu-Ende-Verschlüsselung, Live-Abgleich, am Computer auch mit
verborgenem Fenster, versteckte Dateien außer LiveSync selbst und der Fensteranordnung) und verschlüsselt sie wie LiveSync 1.0
(„persistent“: PBKDF2-SHA-256 mit 310 000 Runden, HKDF, AES-256-GCM) mit einem neuen Code aus 12 Zeichen. Weil der Setup-Link
für einen QR-Code im Terminal zu lang ist, legt der Server ihn 30 Minuten lang unter einer zufälligen Kennung ab (in
`web/livesync-links/`, nur für den Web-Dienst; Dateiname nur ihr SHA-256) und zeigt den kurzen Link `https://<Adresse>/v1/livesync/<kennung>` mit QR-Code. Den Code tippt man auf dem Gerät
ein; ohne ihn nützt der Link nichts. Der Code steht nur im Terminal, nie im Journal.

**Grenze:** Wie beim Uni-Zugang liegt der Schlüssel der Verschlüsselung auf dem Server (nur root). Wer root auf dem Server ist,
kann den Tresor lesen.

```
sudo studium-server livesync               einschalten (falls nötig), dann Link und Code für ein Gerät
sudo studium-server livesync einschalten   nur einschalten bzw. nachziehen (wiederholbar, Zugangsdaten bleiben)
sudo studium-server livesync verbinden     nur einen neuen Link für ein Gerät
```

### Befehle (`studium-server`)

```
studium-server status                  Stand und Dienste
studium-server verbinden               Einmal-Link und QR-Code für ein Gerät
studium-server schluessel-erneuern     neue Schlüssel, wenn ein Gerät verloren ist (siehe „Gerät verloren“)
studium-server uni-zugang setzen       Uni-Zugang verschlüsselt speichern
studium-server uni-zugang loeschen     Uni-Zugang löschen
studium-server uni-zugang pruefen      gespeichert oder nicht
studium-server zustand                 Zustand neu prüfen
studium-server jetzt                   Claude-Lauf jetzt anstoßen (mit Gmail)
studium-server modell sonnet|opus      Modell der Claude-Läufe
studium-server lauf                    Ergebnis des letzten Claude-Laufs
studium-server nutzung                 Claude-Läufe und Token je Tag (letzte 7 Tage), Treffer am Limit
studium-server aktualisieren           Pakete und Claude Code aktualisieren, Server-Paket aus dem Release (Prüfsumme, Signatur) installieren
studium-server livesync                LiveSync einschalten und ein Gerät verbinden (siehe „LiveSync“)
```

### Geprüft

Neben den Tests in `tests/server.test.js` lief der Installer (bis 0.7.6, mit Node 18) in einem frischen Ubuntu 24.04 (Arm, systemd) im
Testmodus dreimal hintereinander. Ende zu Ende über Caddy mit 27 Prüfungen: Status, Verbinden per Code, Eingang verschlüsselt
und mit Node 18 entschlüsselt, Stand mit Aufräumen, Uni-Zugang nur verschlüsselt und für `studium` unlesbar, nichts davon im
Status oder Journal, Sperre nach Fehlversuchen, Speicherreserve wirklich belegt. Claude Code ließ sich als `studium`
installieren. Noch nicht geprüft: HTTPS mit `sslip.io` an einer echten öffentlichen IP. Die eigenen Benutzer und Ordner (nach
0.7.6) prüfen bisher nur Tests, die `systemctl`, `chown` und `chmod` nachbilden (`tests/server.test.js`, Umzug und Einheiten);
ein Installer-Lauf und ein Umzug in einem echten Ubuntu stehen noch aus.

LiveSync (21.10.2026): im selben Testaufbau mit echter CouchDB 3.5 aus dem Paketarchiv von Apache, 26 Prüfungen: nur auf
127.0.0.1, ohne oder mit falscher Anmeldung 401, CORS nur für die Obsidian-Apps, große Anfragen, Status, Linkseite und Ablauf,
nichts im Journal, zweites Einschalten und Neuinstallation ohne Verlust. Den Setup-Link von der Linkseite las der echte
Decoder von LiveSync 1.0.38. Noch nicht geprüft: echte Geräte (Windows, iPhone) und das Zertifikat für `obsidian.…sslip.io`.

Abruf und Lauf: `server/test_abrufen.py` (IMAP als Attrappe), `tests/server-eingang.test.js` (auch gegen
`terminePruefen` des Plugins) und `tests/server-lauf.test.js` (Claude als Attrappe). Dazu ein echter Lauf am 18.10.2026 mit
einem echten Uni-Postfach (nur lesend), ILIAS-Kalender und Gmail, Sonnet: 16 Termine, 4 Hinweise, nichts verworfen, etwa
7,5 Minuten. Daraus kamen die Regeln für Vergangenes, zentrale Termine und Modulcodes aus Kursnamen. Den ILIAS-Kalender liest
der Server seitdem nicht mehr (siehe „Abruf ohne KI“).
