# Eigener Server

Für Technische nutzt Studium Autopilot einen eigenen, kostenlosen Server bei Oracle, auf dem Claude mit dem eigenen Abo Termine
aus Mails findet und Begleitnotizen schreibt. Seit 0.5.0 Teil jedes Releases (`studium-server.tar.gz`).

Dazu gehören die Prüfung des Oracle-Kontos (`stand.mjs`), die Schritte der Einrichtung in der Cloud Shell (`einrichten.mjs`),
der Einrichtungs-Skill (`skill/server-einrichten/`), der Platzsucher (`platzsucher.py`), der Server selbst (Installer, Web-Dienst
mit verschlüsseltem Datenkanal, Speicherreserve, Uni-Zugang, Befehle), der Abruf des Uni-Postfachs ohne KI (`abrufen.py`) und
der Claude-Lauf mit dem Skill (`lauf.mjs`, `skill/studium-autopilot/`, Prüfung `eingang.mjs`). Die Gegenstelle im Plugin ist
`server.js` (Zeile „Eigener Server“). Noch nicht: Abrufe von ILIAS-Dateien und Alma. Wer will, verbindet den Server mit der
Claude-App (claude.ai, Apps für iPhone, Android und Desktop): siehe „Connector für die Claude-App“ unten.

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
- **Grenze: ausgehender Datenverkehr.** Frei sind 10 TB im Monat. Darüber hält weder die Quota (sie begrenzt nur Ressourcen,
  keinen Verkehr) noch das Budget (es schickt nur eine Mail, es hält nichts an) etwas auf. Ohne Pay-As-You-Go kann Oracle nichts
  abbuchen; in einem Konto mit Pay-As-You-Go könnte ein übernommener Server, der mehr als 10 TB im Monat verschickt, Kosten
  machen. Dagegen hilft nur, auf die Mail des Budgets hin die Instanz zu beenden (Skill, `kosten.md`).
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
  **Ohne Passphrase, mit Absicht:** `start.sh` erzeugt den Schlüssel mit `-N ""`, weil die Einrichtung in jeder neuen Sitzung der
  Cloud Shell ohne Eingabe weiterläuft und `fern.sh` ihn bei jedem Befehl braucht; eine Passphrase müsste der Mensch jedes Mal
  tippen oder sie läge doch wieder daneben. Wer die Datei (in der Cloud Shell oder im Bucket) lesen kann, ist also root auf dem
  Server. Lesen dürfen sie nur Benutzer mit Rechten auf die Cloud Shell bzw. den Objektspeicher des Kontos; im Konto dieser
  Einrichtung ist das allein der Administrator, und der kann den Server ohnehin übernehmen (Instanz neu aufsetzen, Boot-Volume an
  eine andere Instanz hängen, Konsolenverbindung). Die Kopie gibt also niemandem etwas Neues, solange niemand sonst Rechte im
  Konto bekommt; wer weitere Benutzer oder Gruppen mit Rechten auf Objektspeicher anlegt, gibt ihnen damit auch root auf dem
  Server.

### Alles mit einem Befehl: `server/start.sh`

Die Einrichtung in der Cloud Shell als eine Zeile, die Claude tippt (Skill, Schritt 2); weiter geht es immer mit derselben Zeile,
auch Tage später in einer neuen Sitzung:

```
mkdir -p ~/studium-autopilot && curl -fsSLo ~/studium-autopilot/start.sh https://raw.githubusercontent.com/studium-autopilot/ecoba/vX.Y.Z/server/start.sh && bash ~/studium-autopilot/start.sh [--mail <adresse>] [--paket-da]
```

- **Laden:** erst in eine Datei, dann ausführen (bei `bash <(curl …)` liefe nach einem Abbruch ein leeres oder halbes Skript, und
  `curl | bash` nähme der Claude-Anmeldung die Eingabe); der ganze Inhalt steht in `main()`, das erst die letzte Zeile aufruft.
  `start.sh` lädt das Server-Paket desselben Tags mit seiner Signatur und prüft beides, bevor es etwas auspackt: die SHA-256 im
  Release, die Signatur (`ssh-keygen -Y verify`, Namensraum `studium-server`) gegen die Schlüssel, die fest in `start.sh` stehen
  (`SIGNIERSCHLUESSEL`, dieselben wie `allowed_signers`; nie aus dem Download), und dass `server/VERSION` im Paket der Tag des
  Releases ist. Sonst hält es an (`[halt:paket:signatur]`, `[halt:paket:version]`), und der bisherige Ordner `server/` bleibt. Die
  Cloud Shell kann `ssh-keygen -Y` oft nicht (FIPS-Modus: OpenSSH lehnt ed25519 ab; Oracle Linux 8 hat OpenSSH 8.0 ohne `-Y`).
  Dann prüft Node.js mit `paket-pruefen.mjs`, das `start.sh` eingebettet trägt: SSHSIG wie OpenSSH, Ed25519 über OpenSSL und,
  lehnt das im FIPS-Modus ab, mit einem eigenen Prüfer nach RFC 8032 (`tests/paket-pruefen.test.js` gegen ssh-keygen und
  node:crypto). Die Signatur bleibt als `studium-server.tar.gz.sig` neben dem Paket; `fern.sh installieren` prüft beides vor dem
  Kopieren noch einmal. `--paket-da` nimmt das Paket in `~/studium-autopilot/server` (Testpaket vor einem Release, Tests); dann
  nimmt `fern.sh` auch eine Signatur im Namensraum für Tests an (siehe `docs/release.md`).
- **Reihenfolge:** Paket, `stand.mjs`, `schutz`, `netz`, Schlüssel (`schluessel-holen`, sonst `ssh-keygen` RSA 4096, dann
  `schluessel-sichern`), `server` (Exit 3: `platzsucher`), `abschliessen`, `fern.sh installieren` (danach `neustart`, wenn das
  Boot-Volume wuchs), Claude auf dem Server (nur in einem Terminal), Obsidian verbinden (nur, solange noch kein Gerät abholt), erster
  Lauf, `stand.mjs --kosten`. Den Status liest es über ssh (`fern.sh status --json`, also `studium-server status --json` direkt
  beim Web-Dienst auf 127.0.0.1), nie über die öffentliche Adresse: Dort braucht `/v1/status` den Zugangsschlüssel, sobald ein Gerät
  verbunden ist. Vorher ruft es einmal `https://<Adresse>/` ab (jede Antwort von Caddy genügt), damit Caddy sein Zertifikat hat.
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
schon bekannten IP; die Meldung nennt `ssh-keygen -R <IP>`), `7` (nur `installieren`) `studium-server.tar.gz` ohne gültige
Signatur daneben, sonst der Exit auf dem Server. `installieren` prüft die Signatur wie `start.sh` (Schlüssel fest in `fern.sh`,
`ssh-keygen -Y verify`, sonst `node server/paket-pruefen.mjs`), bevor das Paket als root auf den Server geht; den Namensraum für
Tests nimmt es nur mit `STUDIUM_TESTPAKET=1` an (setzt `start.sh` bei `--paket-da` und für eine Beta). Nur `claude-anmelden` und `uni-zugang` lesen von der
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
- **Versuche:** alle 1 bis 2 Minuten eine Runde: jeder Verfügbarkeitsbereich mit `VM.Standard.A1.Flex`, 2 OCPU, 12 GB, und
  ist nirgends Platz, gleich danach mit 1 OCPU, 6 GB (siehe „Klein zuerst“). Boot-Volume „Balanced“ (10 VPU) in der Größe aus
  der Konfiguration (Rest des freien Blockspeichers, solange der Helfer lebt, also 150 GB), Kennzeichen
  `studium-autopilot=server`. Vorher prüft er jedes Mal, ob es den Server schon gibt. Nach einer unklaren Antwort
  (Zeitüberschreitung, 5xx, unlesbare Ausgabe: vielleicht doch angelegt) endet die Runde, damit nie ein zweiter entsteht.
  Höchstens 6.000 Versuche am Tag: In drei Bereichen hat eine Runde sechs Anfragen, das sind bis gut 5.700 am Tag (bis 0.7.7
  schickte die Kommandozeile mit ihren Wiederholungen ähnlich viele). Nach „Too many requests“ verdoppelt sich die Pause bis
  30 Minuten. Das neueste Abbild sucht er einmal am Tag, nicht jede Runde: Jeder Aufruf startet die Kommandozeile, und das
  dauert auf dem Micro.
- **Ein Versuch ist eine Anfrage:** Anlegen und Vergrößern laufen mit `--no-retry`. Ohne wiederholt die OCI-Kommandozeile jede
  5xx-Antwort selbst, also auch „Out of host capacity“ (500 `InternalError`), und jedes 429: bis zu acht Anfragen in etwa 90
  Sekunden (`DEFAULT_RETRY_STRATEGY` des SDK, nachgemessen mit 3.95.1 gegen eine Attrappe, die wie Oracle antwortet). Bis 0.7.7
  zählte ein Versuch darum bis zu acht Anfragen, und „Too many requests“ kam beim Platzsucher nie an.
- **Klein zuerst:** 1 OCPU / 6 GB passt voraussichtlich öfter auf einen fast vollen Host als 2 / 12 (Oracle: Platz hängt an
  freien OCPUs und freiem Speicher auf den Hosts; gemessen hat das niemand öffentlich) und ist ebenso kostenlos. Ist der Server so da, kommt die Mail „Dein Server ist da“ sofort, die
  Einrichtung geht weiter, und der Helfer bleibt: Er vergrößert den Server mit `compute instance update --shape-config` auf
  2 OCPU / 12 GB, nur zwischen 01 und 05 Uhr UTC und frühestens drei Stunden nach dem Anlegen, denn Oracle startet eine
  laufende Instanz dabei neu (IP, Volumes und Daten bleiben). Ohne Platz bleibt die Instanz, wie sie ist, und er versucht es
  weiter, höchstens einmal je Stunde nach einem angenommenen oder unklaren Versuch: Nimmt Oracle die Änderung an und führt sie
  nicht aus, startete er den Server sonst die ganze Nacht alle paar Minuten neu. Ist der Server nach so einem Versuch aus (auch
  der Start eines A1 kann an „Out of host capacity“ scheitern), startet er ihn jede Runde wieder, bis er läuft; nach einer
  Stunde kommt einmal die Mail „Dein Server ist aus“. Einen Server, den jemand anders angehalten hat, lässt er aus und
  vergrößert ihn nicht. Groß heißt: läuft mit 2 OCPU. Dann kommt die Mail „Dein Server ist jetzt groß“, und der Helfer beendet
  sich wie sonst. Wird der Server beendet, hält der Helfer an (Mail) und vergisst ihn; neu gestartet sucht er wieder.
  `abschliessen` läuft daneben durch, lässt aber die Rechte des Helfers und das Boot-Volume (150 GB) stehen; der nächste Lauf
  von `start.sh` danach räumt die Rechte weg und gibt dem Server die restlichen 50 GB. Solange meldet der Helfer `art=klein`.
- **Anhalten:** Grenze oder Quota überschritten, fehlende Rechte oder falsche Konfiguration brauchen einen Menschen. Dann hält er
  an und schickt eine Mail.
- **Mails** über Oracle Notifications (Thema mit E-Mail-Abo, einmal bestätigen): „Dein Server ist da“, „Platzsucher angehalten“
  und nach 14 Tagen ohne Erfolg „Platzsucher sucht weiter“.
- **Stand am Helfer:** Stündlich und bei einem Halt sofort schreibt er Zeit, Versuche und die letzte Antwort von Oracle als
  Kennzeichen `studium-autopilot-stand` an sich selbst (`zeit=…;versuche=…;art=…;grund=…`, höchstens 256 Zeichen; seine OCID aus
  den Metadaten über IMDSv2, die anderen Kennzeichen bleiben). `stand.mjs` zeigt daraus die Zeile „Platzsucher: …“: sucht,
  startet (bis 3 Stunden nach dem Anlegen ohne Meldung), klein (Server da, er vergrößert ihn nachts; tagsüber sieht er nur alle
  50 Minuten nach dem Server), angehalten, aus (gestoppt) oder still (3 Stunden ohne Meldung: er sucht
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
`serverStart`) mit: das Paket genau der Version aus der Cloud Shell samt Signatur aus dem Release laden (fünf Versuche), gegen dessen
SHA-256 prüfen (die Cloud Shell hat dasselbe Paket schon geprüft), die Signatur mit `ssh-keygen -Y verify` (OpenSSH 9.6 in Ubuntu
24.04) gegen die Schlüssel prüfen, die `einrichten.mjs` fest in die Startdaten schreibt (`SIGNIERSCHLUESSEL`), in einen frischen
Ordner von root auspacken und `installieren.sh --vorbereiten` (Protokoll `/var/log/studium-server-vorbereiten.log`). So ist alles Lange schon
erledigt (Pakete, Claude Code, Dienste), wenn die Mail „Dein Server ist da“ kommt. Adresse und HTTPS setzt erst `fern.sh
installieren` mit der IP aus dem Konto: Eine IP, die der Server selbst bei einem fremden Dienst erfragt, könnte falsch sein, und
an diese Adresse schickte jedes Gerät seinen Zugangsschlüssel. Bis dahin läuft Caddy nicht (nichts auf 80 und 443), `verbinden`
lehnt ohne Adresse ab, und das tägliche `aktualisieren` bereitet nur vor. Keine Geheimnisse in den Startdaten: Jeder Prozess auf
dem Server kann sie lesen. Ohne gültige Version und Prüfsumme (Testpaket) gibt es keine Startdaten; dann installiert `fern.sh
installieren` alles wie bisher, ebenso bei Servern von einem Platzsucher einer älteren Version und bei einer Beta (ihre Signatur
gilt dort nicht, die Startdaten prüfen nur im Namensraum `studium-server`). Zwei Läufe des Installers
zugleich (Vorbereiten und Einrichtung) verhindert eine Sperre (`flock`); der zweite wartet.

Der Installer ist wiederholbar: Jeder Schritt prüft zuerst, ob er schon erledigt ist; Schlüssel und Uni-Zugang bleiben bei
jedem weiteren Lauf erhalten, die Schlüssel außer nach einem Wechsel der Adresse (siehe „Neue Adresse“). Nur vorwärts: Ist schon eine neuere Version installiert (eine Vorabversion wie `0.6.0-beta.1`
zählt weniger als `0.6.0`), bricht er ab, ohne etwas zu ändern; so ersetzt eine alte Kopie des Pakets in der Cloud Shell nie
einen neueren Stand. Einheiten `studium-server*` von systemd, die er nicht mehr schreibt (eine frühere Version legte sie an,
diese hat sie entfernt oder umbenannt), schaltet er ab und löscht sie; so läuft kein alter Dienst weiter. Er richtet ein:

| Teil | Was |
|---|---|
| Pakete | `jq`, `qrencode`, `python3`, `poppler-utils` (Claude liest damit Seitenbereiche aus PDFs), `iptables-persistent`, `unattended-upgrades` (Sicherheitsupdates automatisch, Neustart um 03:30 Uhr UTC, wenn ein Update ihn braucht; siehe „Updates der Pakete“), Caddy aus dessen offiziellem Paketarchiv, Node.js 24 von NodeSource |
| Benutzer `studium` | führt Claude-Lauf, Zustand, Speicherreserve und Gmail-Anstoß aus; Claude Code und seine Anmeldung liegen in `/var/lib/studium` (`.local/bin/claude`, `.claude/`, `.claude.json`; 0700, nur er). Nur Claude-Lauf und Zustand sehen diesen Ordner (siehe „Schutz der Dienste“) |
| Benutzer `studium-web` | nur der Web-Dienst (bis 0.7.6 lief er als `studium`): Er kann weder die Claude-Anmeldung noch Mails, Lauf-Ordner oder Uni-Zugang lesen und die Prozesse von `studium` weder beenden noch ansehen |
| Benutzer `studium-abruf` | nur der Abruf des Uni-Postfachs; nur er kann den entschlüsselten Uni-Zugang lesen (Gruppe `studium`: Der Lauf übernimmt seine Rohdaten) |
| Benutzer `studium-zentral` | nur das Holen der zentralen Daten für den Connector (bis 03.11.2026 als `studium`): Es spricht mit dem Internet und schreibt nur `zentral/`; als `studium` sähe es über `/proc` einen laufenden Claude-Lauf und darüber die Claude-Anmeldung |
| Benutzer `studium-mcp` | nur der Connector für die Claude-App: Er sieht nur, was der Web-Dienst ihm unter `claude-app/` hinlegt, und die zentralen Daten; seine Tokens liegen in `/var/lib/studium-mcp` (0700, nur er). Auch auf Servern, die die Claude-App nie benutzen (dann läuft nichts als er) |
| `/opt/studium-server/<version>` | das Paket; `aktuell` zeigt auf die laufende Version. Es bleiben diese und die bisher laufende (zum Zurückrollen), alle anderen entfernt der Installer. Darin `allowed_signers` und `revoked_keys`: die Schlüssel, mit denen `aktualisieren` die Signatur des nächsten Pakets prüft, und gesperrte |
| `/etc/studium-server/dienst.json` | Adresse, Zugangsschlüssel und Datenschlüssel (je 32 Byte, die gemeinsamen; jedes Gerät hat seit 03.11.2026 eigene in `web/geraete-schluessel.json`, siehe „Schlüssel je Gerät“; `root:studium-web` 0640, lesen nur root und der Web-Dienst, allen anderen Diensten sperrt systemd den Ordner) |
| `/etc/studium-server-mcp/konfig.json` | Konfiguration des Connectors (Adresse für Anmeldung und Tokens, Datenordner, Zustand; `root:studium-mcp` 0640), bei jeder Installation neu |
| `/var/lib/studium-server` | je Teil ein eigener Ordner (siehe „Wer was liest und schreibt“): `web/` (Web-Dienst: Einmal-Codes, `geraete.json` mit den Codes aus Obsidian der letzten 24 Stunden, Zufallswerten gegen Wiederholung und den letzten 20 Verbindungen, `geraete-schluessel.json` mit den Geräten und ihren eigenen Schlüsseln; Stand und Takt aus Obsidian), `abruf/` (Abruf: Rohdaten in `roh/`), `laeufe/` (Claude-Lauf), `eingang/` (Ergebnisse für das Plugin), `unterlagen/` (für den Lauf), `zentral/` und `claude-app/` (Connector für die Claude-App); im Ordner selbst Zustand und Bestand des Laufs |
| `studium-server-dienst` | Web-Dienst `dienst.mjs` als Benutzer `studium-web`, nur auf 127.0.0.1; Caddy stellt `/v1/` per HTTPS bereit, alles andere ist 404. Darf selbst nur mit 127.0.0.1 sprechen, schreibt nur in `web/`, `eingang/` und `unterlagen/` und sieht weder die Claude-Anmeldung noch die Lauf-Ordner oder die Rohdaten (siehe „Schutz der Dienste“) |
| `studium-server-speicher` | Speicherreserve `speicher-reserve.mjs` (25 % des Arbeitsspeichers), damit Oracle den Server nicht wegen Leerlaufs anhält; „an“ meldet der Zustand nur, wenn die PID in `speicher-reserve.json` lebt und laut `/proc/<pid>/cmdline` die Reserve ist (nach einem Neustart kann sie einem anderen Prozess gehören) |
| `studium-server-zustand.timer` | alle 15 Minuten `zustand.mjs`: Claude angemeldet (`claude auth status` ohne Nutzungs- und Fehlerberichte, `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`), Uni-Zugang, Reserve, LiveSync |
| `studium-server-abruf.timer` | alle 15 Minuten `abrufen.py` ohne KI: das Uni-Postfach, nur mit gespeichertem Uni-Zugang (nach der Uhr, weil ein übersprungener Dienst einen relativen Zeitgeber nicht weiterstellt). Steht in Obsidian ein Takt von 30 oder 60 Minuten, fallen die Zwischenzeiten aus, außer nach „Mails durchsuchen“. Beim ersten Start ab 06:30 Uhr der tägliche Sicherheitslauf: die Uni-Mails der letzten 24 Stunden noch einmal und ein Anstoß (Grund `taeglich`), auch ohne neue Mail |
| `studium-server-lauf.path` | startet den Claude-Lauf `lauf.mjs`, sobald ein Abruf oder Knopf einen Anstoß schreibt; Zeitgrenze 100 Minuten (ein Lauf mit Opus und der gewöhnliche, je bis 45 Minuten) |
| `studium-server-gmail.timer` | 07:30, 13:30 und 19:30 Uhr (Berlin): Anstoß mit Gmail-Suche, wenn der Takt es will (dreimal am Tag: letzte Suche über 2 Stunden her, so ersetzt der Sicherheitslauf die um 07:30; einmal: über 20 Stunden; nie: nie) |
| `studium-server-aktualisieren.timer` | täglich (höchstens 30 Minuten je Lauf, `TimeoutStartSec`): Claude Code (`claude update`, nicht während eines Laufs, ohne Nutzungs- und Fehlerberichte), Pakete, dann ein neues Server-Paket aus dem Release, nur geprüft, gestaffelt und mit Zurückrollen (siehe „Updates des Server-Pakets“) |
| `studium-server-mcp` | Connector `mcp.mjs` als `studium-mcp` auf 127.0.0.1:8744, nur solange er in Obsidian an ist (`studium-server-mcp.path` und `-schalter.service`, siehe „Connector für die Claude-App“) |
| `studium-server-zentral.timer` | alle 15 Minuten `zentral.mjs` als `studium-zentral` (höchstens 256 MB Speicher), nur solange der Connector an ist: die zentralen Termine und Kapitellisten nach `zentral/` (der Connector selbst hat kein Netz) |
| Firewall | Port 443 in den iptables-Regeln des Servers (die Sicherheitsliste des Netzes legt `einrichten.mjs netz` an; die Standardliste, die Oracle mit dem Netz anlegt und die dessen Kennzeichen erbt, erlaubt nur 22 und zählt nicht als eigene) |

### Schutz der Dienste (systemd)

Jeder Dienst ohne root läuft in einem Sandkasten von systemd (`systemd-analyze security` zeigt die Wertung): keine neuen Rechte,
keine Capabilities, System schreibgeschützt (`ProtectSystem=strict`, schreiben nur in den eigenen Ordnern), eigene `/tmp` und
`/dev`, Kernel, Uhr, Hostname und Cgroups unberührt, nur die Netzarten, die er braucht, Systemaufrufe nur aus `@system-service`
ohne `@privileged` (ein gesperrter Aufruf scheitert mit `EPERM`, statt den Dienst zu beenden), fremde Prozesse unsichtbar.
`MemoryDenyWriteExecute` nur beim Abruf (Python); Node.js und Claude Code übersetzen zur Laufzeit. Einen Port öffnen darf nur der
Web-Dienst: Alle anderen Dienste (Lauf, Zustand, Abruf, Gmail-Anstoß, Speicherreserve, die Prüfung des Aufbau-Fensters von LiveSync)
haben `SocketBindDeny=any` (Verbindungen nach außen bleiben möglich), der Connector für die Claude-App dazu nur `SocketBindAllow=tcp:8744`. So kann keiner von ihnen während eines Neustarts des Web-Dienstes
dessen Port 8743 belegen und sich als er ausgeben; „Prüfen“ im Installer verlangt dazu, dass auf dem Port genau der Prozess der
Einheit lauscht (`ss -p` gegen ihre MainPID). Bleibt offen: Während eines Neustarts hält niemand den Port fest (keine
`.socket`-Einheit), ein Prozess von root oder außerhalb dieser Dienste könnte ihn in dem Moment belegen.
Wertung von `systemd-analyze security` in Ubuntu 24.04 (systemd 255, 01.11.2026): Speicherreserve und Gmail-Anstoß 0,9
(„SAFE“), Web-Dienst 1,2, Abruf, Claude-Lauf und Zustand 1,4 („OK“; 10 wäre ungeschützt). Connector und zentrale Daten sind
noch nicht gemessen.

| Dienst | sieht nicht | Netz |
|---|---|---|
| Web-Dienst | Home von `studium` (Claude-Anmeldung, Claude Code), Lauf-Ordner (`laeufe/`, dort stehen die Rechte des Laufs), Rohdaten des Abrufs (`abruf/`), Uni-Zugang (verschlüsselt und entschlüsselt), `livesync.json` | nur 127.0.0.1 (Caddy) |
| Claude-Lauf | `/etc/studium-server` (Schlüssel des Dienstes, LiveSync), Uni-Zugang | ja (Claude, zentrale Termine) |
| Zustand | `/etc/studium-server`, entschlüsselte Zugänge (ob der Uni-Zugang gespeichert ist, sieht er am Dateinamen), `web/`, Eingang, Unterlagen | ja (`claude auth status`) |
| Abruf | Home von `studium`, `/etc/studium-server`, Lauf-Ordner, Eingang, Unterlagen, Einmal-Codes und LiveSync-Links (`web/verbinden/`, `web/livesync-links/`) | ja (IMAP) |
| Speicherreserve, Gmail-Anstoß | Home von `studium`, `/etc/studium-server`, Uni-Zugang | keins |
| Connector (Claude-App) | Home von `studium`, `/etc/studium-server`, Uni-Zugang, `web/`, Eingang, Unterlagen, Lauf-Ordner, Rohdaten, die Marke in `claude-app/schalter/`, Caddy, CouchDB | nur 127.0.0.1 (Caddy), ohne den Port des Web-Dienstes (eine Regel in `iptables` nach Besitzer, `studium-server claude-app anwenden`): direkt dort gäbe der den ganzen Status ohne Schlüssel |
| zentrale Daten | Home von `studium`, `/etc/studium-server`, Uni-Zugang, `web/`, Eingang, Unterlagen, `claude-app/` | ja (GitHub Pages) |

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
| alles andere darin (`anstoss`, `termine.json`, `termine-quellen.json`, `kapitel.json`, `hinweise-bisher.json`, `nutzung.json`, `einstellungen.json`, `livesync-an` …) | `studium`, 0600 | Lauf, Gmail-Anstoß, `studium-server`, `livesync.sh` (als `studium`) | niemand; ob ein Anstoß wartet, sieht der Web-Dienst am Namen |
| `laeufe/` | `studium:studium`, 0700 | Lauf | niemand (Mails, Auszug aus dem Tresor, Rechte des Laufs) |
| `quarantaene/`, `mail-fehler.json` | `studium`, 0700 bzw. 0600 | Lauf | niemand (Mails, an denen allein zwei Läufe scheiterten, bis sie jemand wieder einreiht; Fehlschläge und Gruppe je Mail) |
| `web/` | `studium-web:studium-web`, 2771 | Web-Dienst; `studium-server verbinden`, `schluessel-erneuern`, `geraet-trennen` (nur die Marke `getrennt/<id>`, die der Dienst anwendet und löscht), `gemeinsam-beenden` (die Marke `gemeinsam-aus.json`, offene Codes des gemeinsamen Schlüssels weg) und `livesync.sh` als `studium-web` | Lauf (Gruppe): `stand-plugin.json` (0640), nimmt den Anstoß `web/anstoss`; Lauf, Abruf und Gmail-Anstoß: `takt.json`, der Abruf auch `knopf.json` (beide 0644). `verbinden/`, `livesync-links/`, `getrennt/`, `geraete.json` und `geraete-schluessel.json` nur der Web-Dienst (0700 bzw. 0600; `studium-server geraete` liest das Verzeichnis der Geräte als `studium-web`, ohne Schlüssel auszugeben) |
| `abruf/` | `studium-abruf:studium`, 2770 | Abruf: `roh/`, `abruf-stand.json`, `uni-zugang-falsch`, `anstoss` | Lauf (Gruppe): übernimmt `roh/` und den Anstoß; Zustand: `uni-zugang-falsch` |
| `eingang/` | `studium:studium-web`, 2770 | Lauf (Ergebnisse, 0640) | Web-Dienst: gibt sie aus und löscht Übernommenes |
| `unterlagen/neu/`, `opus/`, `kapitel/` | `studium:studium-web`, 2770 (`unterlagen/` selbst 2750) | Web-Dienst (0640) | Lauf (Gruppe): übernimmt sie und legt sie nach einem Fehlschlag zurück |
| `zentral/` | `studium-zentral:studium-zentral`, 0755 | zentrale Daten (`zentral-cache.json`, 0644: öffentliche Daten) | Connector |
| `claude-app/` | `root:root`, 0755 | niemand (nur root legt darin Ordner an) | jeder geht hindurch |
| `claude-app/schalter/` | `studium-web:studium-web`, 0700 | Web-Dienst (Marke `an`) | niemand; root sieht nur, ob die Marke da ist (systemd) |
| `claude-app/codes/`, `trennen/`, `daten/` | `studium-web:studium-mcp`, 2750 | Web-Dienst (Einmal-Codes nur als Hash, Wünsche zum Trennen, `lage.json`; 0640) | Connector (Gruppe), nur lesend |
| `claude-app/aus-mcp/` | `studium-mcp:studium-web`, 2750 | Connector (`verbindungen.json`, 0640) | Web-Dienst (Gruppe): gibt die Verbindungen geprüft an Obsidian |
| `/var/lib/studium-mcp` | `studium-mcp`, 0700 | Connector (`oauth.json` mit den Hashes der Tokens, eingelöste Codes) | niemand; `studium-server` löscht ihn als `studium-mcp`, wenn der Connector aus geht |

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

### Updates des Server-Pakets

`studium-server aktualisieren` (täglich über `studium-server-aktualisieren.timer`, von Hand mit `sudo`) holt das neueste Release
(`releases/latest`; Vorab-Releases nie), Paket und Signatur nur unter `https://github.com/studium-autopilot/ecoba/releases/download/`.
Grenzen: `curl` je Abruf höchstens 5 Minuten, Wiederholungen nur innerhalb von 10 Minuten; apt wartet höchstens 5 Minuten auf seine
Sperre; `claude update` höchstens 10 Minuten; die Einheit höchstens 60 Minuten. Ohne sie hielte ein hängender Schritt jeden weiteren
Tag auf. Bricht systemd an der Grenze ab (SIGTERM), zählt das als Fehler, nicht als Erfolg (`trap` auf TERM und INT in
`studium-server` und im Installer), und der nächste Lauf holt eine nicht fertige Installation bzw. ein offenes Zurückrollen nach.

- **Nur ein geprüftes Paket:** passende Prüfsumme (nennt GitHub selbst, schützt nur vor einem kaputten Download), gültige Signatur
  (`studium-server.tar.gz.sig`, `ssh-keygen -Y verify -n studium-server` mit `allowed_signers` des **laufenden** Pakets, nie aus
  dem Download) eines Schlüssels, der nicht gesperrt ist (`-r` mit `/etc/studium-server/revoked_keys`, siehe unten), und `VERSION`
  im signierten Paket genau wie der Tag des Releases ohne `v`. Ohne die letzte Prüfung ließe sich ein altes,
  einmal signiertes Paket (etwa mit einer bekannten Lücke) unter einem neuen Release noch einmal ausliefern. Erst die Signatur
  verhindert, dass ein Release, das jemand mit dem GitHub-Konto oder einem Token anlegt, auf jedem Server als root läuft. Server
  mit 0.7.5 oder älter installieren das erste signierte Paket noch ohne diese Prüfung, ab dann jedes mit; Sperren und den
  Vergleich mit dem Tag prüft erst das `aktualisieren` des Pakets, das sie mitbringt (ab dem Update danach).
- **Gesperrte Schlüssel wachsen nur:** `/etc/studium-server/revoked_keys` (nur root) ergänzt der Installer vor allem anderen um
  `revoked_keys` seines Pakets, `aktualisieren` um die des laufenden und, gleich nach der Prüfung, um die des neuen Pakets (auch wenn
  dessen Installation dann scheitert). Die Liste wird nie kürzer: Ein Zurückrollen bringt zwar die alte `allowed_signers` zurück,
  aber keine Sperre geht verloren. Übernommen wird nur eine Zeile, die mit dem Typ des Schlüssels beginnt (`ssh-ed25519 AAAA…`,
  keine Optionen wie in `authorized_keys`: `restrict`, `cert-authority`, `from="…"`) und die `ssh-keygen -l` als öffentlichen
  Schlüssel liest (Format einer `.pub`-Datei, keine KRL), bei jeder Ergänzung auch die schon gemerkten Zeilen: Eine solche Zeile
  ließe sonst jede Prüfung mit 255 scheitern, und kein Update käme mehr durch. `release.py` lässt ohnehin nur solche Zeilen ins
  Paket. **Von Hand reparieren** (nur root): `sudo nano /etc/studium-server/revoked_keys`, je Zeile ein Schlüssel in dieser Form;
  prüfen mit `sudo ssh-keygen -l -f /etc/studium-server/revoked_keys` (zeigt jeden lesbaren); eine Sperre nie löschen, nur eine
  Zeile, die gar kein Schlüssel ist.
- **Test- und Beta-Pakete** sind im eigenen Namensraum `studium-server-test` signiert (`docs/release.md`). Ein Server nimmt sie nur
  an, wenn root dort die Zusage `/etc/studium-server/testpakete` angelegt hat (`sudo touch /etc/studium-server/testpakete`; echte
  Datei, root gehört sie, nur root darf sie ändern). Ein Server von Studierenden hat sie nie, eine Signatur für Tests gilt dort also
  nicht.
- **Nur vorwärts:** nie auf eine ältere Version zurück. Dieselbe Version gilt nur als aktuell, wenn ihr Paket die Marke
  `.installiert` hat; die setzt der Installer erst nach „Prüfen“, so installiert der nächste Lauf eine abgebrochene Installation
  noch einmal. Ob es etwas zu tun gibt, entscheidet der Tag des Releases schon vor dem Download (ein falscher Tag kann nur ein
  Update ausfallen lassen).
- **Gestaffelt:** Eine neue Version installiert ein Server erst eine feste Zeit von 0 bis 48 Stunden nach ihrer Veröffentlichung
  (`published_at`). Die Zeit folgt aus einem Zufallswert, den der Installer einmal in `/etc/studium-server/staffel` legt (nur
  root); für einen Server bleibt sie gleich, über alle verteilt sie sich gleichmäßig. So trifft ein fehlerhaftes Release zuerst
  wenige Server, und bis die übrigen dran sind, kann ein berichtigtes erscheinen. Gezählt wird ab dem ältesten Release, seit dem
  der Server zurückliegt (`/opt/studium-server/.staffel-seit`), damit häufige Releases einen Server mit langer Wartezeit nicht
  immer weiter vertrösten. `sudo studium-server aktualisieren --jetzt` (aus der Cloud Shell: `fern.sh aktualisieren --jetzt`)
  installiert sofort.
- **Prüfen:** Ob ein neues Paket gilt, entscheidet nur sein Web-Dienst selbst: `/v1/status` direkt auf 127.0.0.1 (ohne Caddy, ohne
  Kopf einer Weiterleitung, also ohne Zugangsschlüssel) muss innerhalb von 30 Sekunden mit der Version des Pakets antworten. Was danach
  Dateien anderer Benutzer liest (`studium-server status` mit `takt.json` des Web-Dienstes, der Zustand), ist nur Anzeige und endet
  nie mit einem Fehler; ebenso das Löschen offener Codes in `web/verbinden/` (nur echte Dateien, `find -P`, als `studium-web`) und,
  bei einem Update, die Installation von Claude Code im Home von `studium`. Sonst könnte, wer den Web-Dienst oder den Lauf übernommen
  hat, mit einer kaputten Datei jedes Update zurückrollen lassen und den Server auf der alten Version halten.
- **Zurückrollen:** Scheitert die Installation, nachdem `/opt/studium-server/aktuell` schon auf das neue Paket zeigt (antwortet der
  neue Web-Dienst bei „Prüfen“ nicht, bricht ein Schritt davor ab oder kommt SIGTERM), stellt der Installer `aktuell` auf das
  bisherige Paket zurück und startet dessen Installer mit denselben Angaben: Er schreibt Einheiten, Caddy und
  `/usr/local/bin/studium-server` auf seinen Stand, startet die Dienste neu und prüft sie; „Alte Pakete“ räumt dabei das gescheiterte
  weg. Nur, wenn das bisherige Paket fertig installiert war (`.installiert`). Der Installer endet dann mit Exit 10 (eigener Code; Exit
  3 meint bei `fern.sh` einen unbekannten Befehl, `start.sh` hält mit `[halt:installieren:zurueckgerollt]`); `aktualisieren` merkt
  sich Version und Zeit in `/opt/studium-server/.zurueckgerollt` und versucht dieselbe Version von selbst erst nach 20 Stunden wieder
  (der Zeitgeber streut bis zu 2 Stunden; so höchstens einmal am Tag), mit `--jetzt` sofort. Vom Umschalten bis `.installiert` nennt
  `/opt/studium-server/.zurueckrollen-offen` (nur root) das Ziel; bricht der Lauf mittendrin ab (Zeitgrenze, Neustart), holt der
  nächste `aktualisieren` das Zurückrollen vor allem anderen nach. Ein Zurückrollen geht nur so weit, wie der bisherige Installer
  reicht: Was eine neue Version am Datenordner umgezogen hat, zieht er nicht zurück. Abgebrochen (SIGTERM an der Zeitgrenze,
  Strg+C) startet der Installer den bisherigen Installer nicht mehr, denn systemd beendet den Lauf gleich ganz: Er stellt nur `aktuell`
  und `/usr/local/bin/studium-server` zurück und lässt die Marke stehen; der nächste Lauf führt den bisherigen Installer dann aus
  (der schreibt auch die Einheiten wieder). Dabei zählt die Marke von root (Ziel und gescheiterte Version), nicht `.installiert` des
  Ziels; sie gilt nur für einen echten Ordner einer Version, dessen `VERSION` seinen Namen nennt, und entfällt, wenn die gescheiterte
  Version doch fertig installiert läuft. Der Installer räumt sie darum vor `.installiert` weg: Ein Abbruch genau dazwischen
  installiert dieselbe Version noch einmal, statt sie zurückzurollen. Der bisherige Installer läuft aus seinem installierten Ordner (Quelle =
  Ziel): Dann kopiert er nichts und nimmt `.installiert` erst nach dem Kopieren weg. Pakete bis 0.7.6 setzen `.installiert` nicht,
  auf sie rollt nie ein Server zurück. 0.7.7 setzt es, kennt aber weder dieses Kopieren noch die Liste gesperrter Schlüssel von root:
  Sein Installer bräche beim Zurückrollen mit „are the same file“ ab. Darum nennt `MINDESTVERSION` die Version, mit der diese Fassung
  erscheint (unten); der erste Wechsel auf sie rollt also nicht zurück (scheitert er, bleibt der Server auf ihr, und der nächste Lauf
  installiert sie noch einmal), und er läuft noch mit dem bisherigen `aktualisieren`.
- **Mindestversion:** `MINDESTVERSION` im signierten Paket nennt die älteste Version, auf die zurückgerollt werden darf; root hält die
  höchste je gesehene in `/etc/studium-server/mindestversion` fest (sinkt nie). Läge das bisherige Paket darunter, rollt der
  Installer nicht zurück, sondern bleibt auf dem neuen (Exit 11, Grund `mindestversion`, `start.sh`:
  `[halt:installieren:mindestversion]`); der nächste Lauf installiert es noch einmal (`docs/release.md`). Die Schlüssel je Gerät heben
  sie nicht an („Schlüssel je Gerät“ → „Zurückrollen“ unten).
- **Ergebnis** in `aktualisierung.json`: `zeit`, `ok`, `ziel` (Version des neuesten Releases), `installiert` (laufende Version
  danach), `grund` (wenn nicht ok), `erfolg` (zuletzt ok) und während der Staffel `warten_bis`. Der Status gibt davon unter
  `aktualisierung` die Felder weiter, die `dienst.mjs` kennt (`zeit`, `ok`, `ziel`, `grund`, `erfolg`; die laufende Version steht
  dort ohnehin unter `version`); einen Grund, den es noch nicht kennt, zeigt er als `unbekannt`.
  Nicht ok heißt nicht immer Fehler: Fehlt im neuesten Release das Paket (`kein-paket`), ist es nicht neuer als das laufende
  (`aelter`) oder wartet eine zurückgerollte Version noch (`zurueckgerollt`), endet der Lauf mit 0, aber `ok` bleibt `false` und
  `erfolg` stehen; so sieht Obsidian, dass der Server zurückbleibt. Bis 0.7.7 zählten fehlendes Paket und älteres Release als Erfolg.
  Gründe bei Fehlern: `github`, `pruefsumme-fehlt`, `signatur-fehlt`, `herunterladen`, `pruefsumme`, `signatur`, `paket` (auch: Paket
  oder Signatur nicht unter den Releases des Repos), `version` (Version ≠ Tag), `installieren`, `zurueckgerollt`, `mindestversion`,
  `pakete`. Schon aktuell und Warten auf die eigene Zeit sind ok.
  Obsidian sagt es, wenn seit mehr als 3 Tagen nichts ok war, obwohl es eine neuere Version gibt.
- **Noch nicht:** ein Notschalter, mit dem sich ein Release auf allen Servern anhalten ließe, bevor ihre Zeit kommt. Bis dahin
  hilft nur ein schnelles berichtigtes Release (es setzt die Staffel nicht zurück) oder, für ein Release ohne Paket, gar keins.

### Web-Dienst (`dienst.mjs`)

| Weg | Wer | Was |
|---|---|---|
| `GET /v1/status` | mit Zugangsschlüssel | Stand aus festen Werten: Version, Claude, Gmail (`ok`, `fehlt`, `aus` bei Takt „nie“), Weiterleitung, Uni-Zugang, Reserve, LiveSync (`livesync`: `an`/`aus`), letzter Abruf, letzter Lauf, ob ein Lauf wartet oder läuft (`claude_lauf`), am Limit des Claude-Abos der nächste Versuch (`limit_wieder`, sonst `null`), die letzte neue Version (`aktualisierung`: Zeit, `ok`, `ziel`, `grund` aus fester Liste, sonst `unbekannt`, `erfolg`; dazu `installiert` und `warten_bis` (gestaffelte Verteilung), wenn `studium-server` sie schreibt; `null` ohne Ergebnis, etwa bei älteren Servern), Fehlercodes; dazu `verbunden` und `geraete` (siehe `/v1/eingang`) und `grenzen` (Grenzen je Tag: Läufe zusammen und je Anlass mit Grenze, wartende, heute zurückgestellte oder verschobene und nicht mehr gemerkte Mails, Zeichen je Topf, Mails nach einem Fehlschlag, Mails in Quarantäne und darüber gelöschte). Nie Namen, Adressen, Texte oder Schlüssel. Direkt auf 127.0.0.1 ohne `X-Forwarded-For` und andere Kopfzeilen einer Weiterleitung (`installieren.sh`, `studium-server status`; dort fragen nur root und die Dienstbenutzer) dasselbe ohne Schlüssel. Über Caddy ohne Schlüssel 401 (zählt als Fehlversuch; mit `signatur: 1`, siehe „Anmeldung der Anfragen“), sobald ein Gerät den Status einmal mit Schlüssel geholt hat (Marke `web/status-geschuetzt.json`); bis dahin offen wie bis 0.7.7, denn Plugins bis 0.7.7 schicken den Schlüssel dort nicht mit. Danach zeigt ein solches Plugin den Server im Fenster als nicht erreichbar; Termine und Hinweise holt es über `/v1/eingang` weiter wie bisher |
| `POST /v1/anstoss` | mit Zugangsschlüssel, signiert dazu mit Beweis des Datenschlüssels | Knopf „Mails durchsuchen“ in Obsidian: Anstoß für einen Lauf mit Gmail (Grund `knopf`), höchstens alle 30 Minuten und 12-mal in 24 Stunden (`KNOPF` in `dienst.mjs`; jeder Lauf kostet Abo-Limit, und den Zugangsschlüssel trägt jede Anfrage; sonst 429 mit `wieder` und `Retry-After`); ersetzt einen wartenden Anstoß des Web-Dienstes (Unterlagen und Folien übernimmt der Lauf bei jedem Grund). Mit dem Körper `{"quarantaene":"erneut"}` (JSON, nicht verschlüsselt) reiht der Lauf dazu alle Mails der Quarantäne einmal wieder ein, jede für sich allein; Antwort dann `{ angestossen: true, quarantaene: "erneut" }`. Ohne Körper wie bisher. Eine signierte Anfrage ohne gültigen `beweis` lehnt der Dienst mit 403 `datenschluessel` ab (zählt als Fehlversuch): Wer nur den Zugangsschlüssel hat, startet so keinen Lauf. Plugins bis 0.7.7 schicken den Zugangsschlüssel selbst und keinen Beweis; das nimmt der Dienst nur an, bis hier ein Gerät gültig signiert hat (`web/signatur-gesehen.json`), danach 403 `veraltet` (siehe „Anmeldung der Anfragen“) |
| `GET /v1/eingang` | mit Zugangsschlüssel | noch nicht übernommene Ergebnisse, verschlüsselt; nach 30 Tagen fällt eine Datei nur weg, wenn alle ihre Termine vorbei sind, spätestens nach 180. Dazu `verbunden`: die letzten 20 Verbindungen von Geräten (Zeit, Herkunft `cloud-shell` oder `obsidian`, grobes Netz `netz` und Gerätename `geraet`, wenn bekannt), und `geraete`: die Geräte mit eigenen Schlüsseln (`id`, `name`, `seit`, `zuletzt`, `herkunft`, `netz`, `dieses` für das fragende; nie Schlüssel; siehe „Schlüssel je Gerät“), beides ebenso im Status mit Schlüssel, nie ohne (auch nicht direkt auf 127.0.0.1) |
| `POST /v1/stand` | mit Zugangsschlüssel | verschlüsselter Stand des Plugins (Modulcodes, Studienbeginn, Variante, laufendes Semester und die Module ohne zentrale Kapitelliste (`lernplan`), Auszug aus dem Tresor: Termine mit Titel und Datum, offene To-dos; Takt aus den Einstellungen, Uni-Postfach 15, 30 oder 60 Minuten und Gmail 3-, 1- oder 0-mal am Tag, auch als `takt.json` für den Abruf; übernommene Dateien, diese löscht der Server) |
| `POST /v1/unterlagen` | mit Zugangsschlüssel | verschlüsselt bis zu 3 Textfassungen von Unterlagen (nur Folien, Skript, Übung, Tutorium, Lab, Lösung, Altklausur, Literatur; je höchstens 400 000 Zeichen) nach `unterlagen/neu/`, mit `modell: "opus"` (Knopf „Zusammenfassen“) nach `unterlagen/opus/`, mit `nur_termine` (Module ohne zentrale Termine aus Unterlagen) mit der Kopfzeile „Auftrag: nur Termine“, mit `fassung` (neue Fassung einer schon zusammengefassten Unterlage: frühere Zusammenfassung, geänderte Seiten, was unter „Zu tun“ und „Offene Fragen“ schon steht; geprüft) mit diesen Zeilen im Kopf, zusammen höchstens 30 warten (sonst 429; das Plugin schickt bis zu 3 Anfragen je Abruf, Gewünschtes zuerst); stößt einen Lauf an, wenn keiner wartet |
| `POST /v1/kapitel` | mit Zugangsschlüssel | verschlüsselt bis zu 3 Textfassungen von Folien (je höchstens 60 000 Zeichen, mit Nummer, Datum und Quelle der Unterlage) der Module, für die der Stand eine Kapitelliste für den Lernplan wünscht, nach `unterlagen/kapitel/`; höchstens 30 warten (sonst 429); stößt einen Lauf an, wenn keiner wartet |
| `POST /v1/pdf` | mit Zugangsschlüssel | verschlüsselt ein Stück (8 MB, Zweck `pdf`) einer PDF zu einer gewünschten Zusammenfassung, der Reihe nach (sonst 409); nach dem letzten und geprüftem SHA-256 liegt sie als `unterlagen/opus/<SHA-256>.pdf` da. Die Textfassung kommt gleich danach und nennt sie im Kopf, Opus liest dann die PDF. Je PDF bis 500 MB (sonst 413), höchstens 6 und zusammen 1 GB warten (sonst 429), ohne Textfassung oder halb hochgeladen verfällt eine nach einem Tag; nach einem erfolgreichen Lauf gelöscht |
| `POST /v1/verbinden` | mit Einmal-Code | Adresse, Zugangs- und Datenschlüssel für ein neues Gerät; der Code gilt einmal, auch bei gleichzeitigen Anfragen. Ab 0.7.8 `{ schema: 2, kennung, pub, beweis }` ohne den Code, Antwort `{ schema: 2, pub, iv, daten }` verschlüsselt (siehe „Verbinden“), seit 03.11.2026 mit eigenen Schlüsseln für dieses Gerät und seiner Kennung `geraet` (siehe „Schlüssel je Gerät“; kennt der Server schon 30 Geräte: 409 `{ fehler: "zu-viele-geraete", schema: 2 }`, lässt sich das Verzeichnis nicht schreiben: 503 `{ fehler: "speichern", schema: 2 }`, der Code bleibt); bis 0.7.7 `{ code }` mit offener Antwort `{ adresse, zugang, schluessel }` (die gemeinsamen), nur solange der Bearer gilt und noch kein Gerät eigene Schlüssel hat (danach 403 `{ fehler: "veraltet", schema: 2 }`, der Code bleibt, kein Fehlversuch; siehe „Schlüssel je Gerät“). Ein gültiger Code geht immer, auch aus einem gesperrten Netz; ein falscher (oder ein falscher Beweis) zählt als Fehlversuch (gesperrt: 429, sonst 403 `{ fehler: "code", schema: 2 }`). Optional `geraet` (Name des Geräts, höchstens 40 Zeichen, gesäubert) fürs Protokoll |
| `POST /v1/geraet` | mit Zugangsschlüssel und Datenschlüssel | Knopf „Weiteres Gerät verbinden“ in Obsidian: Die Anfrage ist ein Paket mit Zweck `verbinden` und `{ schema: 1, zeit, nonce }` (Zeit höchstens 2 Minuten neben der Uhr des Servers, sonst 400 `uhr`; jeder Zufallswert nur einmal, sonst 409). Zurück kommt ebenso verschlüsselt `{ code, ablauf }`: ein Einmal-Code für 10 Minuten, der den vorigen aus Obsidian zurückzieht; höchstens 3 je Stunde und 10 je Tag (sonst 429 mit `wieder`). Mit dem Bearer (Plugins bis 0.7.7) nur, solange kein Gerät eigene Schlüssel hat, sonst 403 `veraltet` |
| `POST /v1/claude-app` | signiert mit Beweis des Datenschlüssels (sonst 403 `datenschluessel`; Bearer: 403 `veraltet`) | Connector für die Claude-App: Paket mit Zweck `claude-app` und `{ schema: 1, zeit, nonce, aktion: code \| status \| trennen \| aus, id? }` (Zeit höchstens 2 Minuten neben der Uhr, jeder Zufallswert einmal); Antwort mit Zweck `claude-app-antwort`. Einzelheiten unter „Connector für die Claude-App“ |
| `POST /v1/geraete` | signiert mit Beweis des Datenschlüssels | Geräte mit eigenen Schlüsseln (siehe „Schlüssel je Gerät“): ein Paket mit Zweck `geraete` und `{ schema: 1, zeit, nonce, aktion, id?, behalten?, name? }` (Zeit und Zufallswert wie bei `/v1/geraet`: 400 `uhr`, 409 `wiederholt`). `liste` → `{ geraete }`; `trennen` mit `id` und `behalten?` → `{ getrennt: [Kennung], geraete }` (ein Gerät, auch das fragende, mit allem, was es hereinließ, außer dem fragenden und `behalten`, siehe „Schlüssel je Gerät“; unbekannt: 404; weder Verzeichnis noch Marke geschrieben: 503 `speichern`); `umziehen` (Name in `name`, Kennung des Umzugs in `umzug`) → `{ adresse, geraet, zugang, schluessel }`: mit dem gemeinsamen Schlüssel eigene (Herkunft `umzug`; dieselbe Kennung ergibt dasselbe Gerät; ohne Kennung 400; voll: 409 `zu-viele-geraete`; über 5 je Stunde 429 `zu-viele` mit `wieder`, über 10 zusammen 409 `zu-viele-umzuege`), mit eigenen dieselben. Antwort mit Zweck `geraete-antwort` unter dem Datenschlüssel der Anfrage. Ohne gültigen Beweis (auch als Bearer) 403 `datenschluessel`, zählt als Fehlversuch |
| `GET /v1/livesync/<kennung>` | mit Kennung (20 Zeichen, 30 Minuten) | Seite mit dem Knopf „In Obsidian öffnen“ für den Setup-Link von LiveSync; unbekannte Kennungen zählen als Fehlversuch (siehe „LiveSync“) |

**Anmeldung der Anfragen (ab 0.7.8):** „Mit Zugangsschlüssel“ heißt in der Tabelle: Die Anfrage ist signiert. Das Plugin ab 0.7.8
schickt den Schlüssel nie mehr selbst, sondern im Kopf

`Authorization: Studium-Signatur v=1,zeit=<Unix-Sekunden>,nonce=<16 Zufallsbytes>,inhalt=<SHA-256 des Körpers>,signatur=<HMAC>[,beweis=<HMAC>]`

(alle Werte base64url ohne `=`, genau diese Reihenfolge, ohne Leerzeichen). Signiert werden die sechs Zeilen
`studium-autopilot/anfrage/v1`, Methode, Pfad, `zeit`, `nonce`, `inhalt` (getrennt durch `\n`) mit HMAC-SHA256 unter
HKDF-SHA256(Zugangsschlüssel, Salz leer, Info `studium-autopilot/anfrage/v1/zugang`); `beweis` ist derselbe Text unter
HKDF-SHA256(Datenschlüssel, Info `studium-autopilot/anfrage/v1/datenschluessel`) und nur beim Anstoß nötig (`kanal.mjs`). Der Dienst
prüft Signatur, Zeit (höchstens 5 Minuten neben seiner Uhr, sonst 401 `uhr`, das zählt nicht als Fehlversuch) und Zufallswert (jeder
nur einmal, sonst 401 `wiederholt`), bevor er den Körper liest, und danach dessen SHA-256 (sonst 400). Seit 03.11.2026 darf die
Signatur unter dem gemeinsamen Schlüssel aus `dienst.json` oder unter dem eigenen eines Geräts stehen (siehe „Schlüssel je Gerät“): Der
Kopf bleibt derselbe, der Dienst rechnet sie gegen jedes Paar (höchstens 31, jedes in fester Zeit verglichen), dann einmal Zeit und
Zufallswert. Das passende Paar gilt für die ganze Anfrage: Beweis, Pakete in beide Richtungen und die Signatur der Antwort. Die Zufallswerte merkt er
bis zum Ende ihres Fensters, höchstens 20 000 zugleich (`SIGNATUR`) und je Schlüssel (dem eines Geräts oder dem gemeinsamen) höchstens
ein Zwanzigstel davon; darüber fällt der älteste Wert desselben Schlüssels weg, ist der Speicher voll, der älteste des Schlüssels mit
den meisten. Was so wegfällt, gälte sonst noch einmal; darum merkt sich der Dienst je Schlüssel das späteste Fensterende eines
verdrängten Werts und nimmt unter ihm keine Anfrage an, deren Fenster nicht danach endet. Verdrängen kann nur, wer mit dem Schlüssel
signiert: Wer flutet (auch mit einer Zeit 5 Minuten voraus), sperrt nur diesen einen Schlüssel aus, bis sein Fenster vorbei ist; die
anderen Geräte gehen weiter, und kein mitgelesener Wert gilt ein zweites Mal. Mit dem gemeinsamen Schlüssel träfe das die Geräte, die
noch ihn haben, bis sie umgezogen sind. Bis 0.7.11 zählte der Dienst je Netz des Absenders und merkte sich ein Ende für alle; mit
Schlüsseln je Gerät hätte so jedes Gerät mit gut tausend Anfragen aus einem Netz alle anderen aussperren können, alle 5 Minuten neu.
Abgewiesenes mit gültiger Signatur (der gemeinsame Schlüssel nach seiner Frist, die alten nach dem Erneuern) merkt er gar nicht. Jeder
Wert steht zusätzlich in `web/nonces.log` (eine Zeile je Wert mit der Kennung seines Schlüssels, nie dem Schlüssel selbst; neu
geschrieben mit je einer Zeile `~ <Ende> <Kennung>` für die verdrängten, wenn es
mehr als doppelt so viele Zeilen hat, wie gelten); nach einem Neustart des Dienstes (Update, Neustart) lädt
er die noch gültigen, und eine mitgelesene Anfrage geht auch dann nicht noch einmal durch. Die Signatur vergleicht er als Text: Die
zwei freien Bits im letzten Zeichen von base64url machen keine zweite gültige Schreibweise. Jede 401 trägt `signatur: 1`; eine 401 ohne (Server bis
0.7.7) zeigt das Plugin als „Dein Server kann das erst nach seinem nächsten Update“, nicht als abgelehnten Schlüssel. So nützt eine
mitgelesene Anfrage nichts mehr: Sie gilt einmal, für diesen Weg, diesen Körper und 5 Minuten.

**Signierte Antworten:** Jede Antwort auf eine gültig signierte Anfrage (auch 401 `uhr`, 403, 204) trägt den Kopf
`studium-signatur: v=1,mac=<HMAC>` (unter dem Paar, mit dem die Anfrage signiert war): HMAC-SHA256 unter HKDF-SHA256(Zugangsschlüssel ‖ Datenschlüssel, Info
`studium-autopilot/anfrage/v1/antwort`) über die Zeilen `studium-autopilot/antwort/v1`, `nonce` der Anfrage, Status und SHA-256 des
Körpers (`kanal.mjs` `antwortMac`). Der Datenschlüssel gehört dazu, weil Plugins bis 0.7.7 den Zugangsschlüssel im Kopf schickten: Wer
ihn so mitlas, kann trotzdem keine Antwort fälschen. Antworten auf
Bearer und auf ungültige Signaturen tragen keinen (der Dienst kennt den Schlüssel des Absenders dann nicht). Die Antwort auf
`/v1/geraet` hat bei einer signierten Anfrage den Zweck `verbinden-antwort` (Plugins bis 0.7.7: `verbinden` wie die Anfrage), damit
sich keine Anfrage als Antwort ausgeben lässt. **Übergang:** Plugins bis 0.7.7
schicken weiter `Authorization: Bearer <Zugangsschlüssel>`. Der Dienst nimmt das an, mit zwei Schaltern, die nur in eine Richtung
gehen: Sobald hier ein Gerät gültig signiert hat (Marke `web/signatur-gesehen.json`), startet ein Bearer keinen Lauf mehr (Anstoß,
auch das neue Einreihen der Quarantäne: 403 `veraltet`); wer den Zugangsschlüssel mitlas, hat den Datenschlüssel nicht. Und kam
danach 7 Tage lang kein Bearer mehr durch (`BEARER_FRIST`, gezählt ab dem letzten erfolgreichen, `web/bearer.json`, höchstens
stündlich geschrieben; kam nie einer, ab der ersten Signatur), nimmt der Dienst auf keinem Weg mehr einen an (401 `veraltet`, kein
Fehlversuch). Spätestens 30 Tage nach der ersten Signatur ist auf jeden Fall Schluss (`BEARER_SCHLUSS`), auch wenn bis dahin alle
paar Tage ein Bearer kam, und ebenso, sobald der gemeinsame Schlüssel endet („Schlüssel je Gerät“). Das erste Nein schreibt `web/bearer-aus.json`, und die sieht der Dienst zuerst an: Es bleibt dabei, auch
wenn die Uhr des Servers zurückgeht. Scheitert das Schreiben einer dieser Marken (volle Platte), gilt sie im laufenden Dienst weiter,
und keine Anfrage scheitert daran. Bis dahin kann, wer einmal eine Anfrage eines
Plugins bis 0.7.7 mitlas (oder den Zugangsschlüssel aus dem offenen Verbinden bis 0.7.7 hat), den Zugangsschlüssel weiter benutzen,
aber nur für das, was er allein erlaubt: den verschlüsselten Eingang holen und den Status lesen. Wer sicher sein will, dass alte
Schlüssel nichts mehr nützen, erneuert sie, sobald jedes Gerät aktualisiert ist („Gerät verloren“ unten, danach jedes Gerät neu
verbinden); das Plugin schlägt es nicht von selbst vor.

**Riegel (wie HSTS, nur aufwärts):** Ein Server bis 0.7.7 (gestaffelt bekommt er das Update bis zu 48 Stunden nach dem Release,
„Updates des Server-Pakets“) kennt keine Signaturen. Das Plugin ab 0.7.8 versucht jede Anfrage zuerst signiert. Antwortet der Server,
wie nur einer bis 0.7.7 antwortet (401 ohne `signatur: 1`, oder seine Sperre 429 `zu-viele-versuche`, die ein neuer Server einer
gültigen Signatur nie gibt), und hat dieses Gerät von diesem Server noch nie gesehen, dass er Signaturen kennt, schickt es dieselbe
Anfrage noch einmal mit `Authorization: Bearer <Zugangsschlüssel>` wie bis 0.7.7 (auch den Anstoß). Der Riegel fällt nur auf einen
Beweis, den niemand ohne den Zugangsschlüssel bauen kann: eine Antwort mit gültiger Signatur (oben) oder ein Verbinden ab 0.7.8 (das
kann nur ein neuer Server; ein so verbundenes Gerät ist von Anfang an verriegelt). Danach schickt das Gerät diesem Server nie wieder
den Bearer und nimmt nur noch signierte Antworten an: Sieht eine Antwort alt aus (das wäre ein Versuch, es herabzustufen), zeigt es
„Dein Server kann das erst nach seinem nächsten Update“; jede andere ohne gültige Signatur gilt wie ein Netzfehler, nie als
Ablehnung des Schlüssels. Nach `schluessel-erneuern` sagt der Server einem Gerät mit den alten Schlüsseln 30 Tage lang, dass es
neue gibt, signiert unter den alten („Gerät verloren“); das Gerät zeigt dann gleich „Dein Server hat neue Schlüssel. Verbinde dieses
Gerät mit einem Code.“ Danach, und nach einer neuen Adresse, sieht ein verriegeltes Gerät neue Schlüssel nur als „nicht erreichbar“;
das Fenster bietet **Mit Code verbinden** dann zugeklappt an, nach 3 Tagen offen. Der Riegel liegt nur im Speicher des Geräts
(`eba-server-signatur`, nicht im Tresor: wer den Sync hat, könnte ihn sonst löschen), je Server und Schlüssel (gekürzter SHA-256 aus
Adresse und Zugangsschlüssel); scheitert das Speichern, gilt er im laufenden Plugin weiter, und es versucht es bei jeder Anfrage
neu. **Vor dem Riegel** schützt nur HTTPS, genau wie bis 0.7.7: Wer mit einem gültigen Zertifikat dazwischensitzt und wie ein alter
Server antwortet, bekommt dann den Zugangsschlüssel im Klartext und kann Antworten fälschen. Das betrifft nur Geräte, die noch nie
eine signierte Antwort ihres Servers gesehen haben (verbunden bis 0.7.7, Server noch nicht aktualisiert), und endet mit der ersten
signierten Antwort. Verbinden hat keinen solchen Rückweg: Ein neues Gerät verbindet sich nur mit einem Server ab 0.7.8.

**Warum der Status nicht mehr öffentlich ist:** Jede Adresse eines Servers steht durch sein Zertifikat in den öffentlichen
Logs der Zertifizierungsstellen; wer sie dort sammelt, sah bisher bei jedem Server Version, ob ein Uni-Passwort gespeichert ist,
wann Obsidian zuletzt abholte, wann Claude lief, Limits und gescheiterte Updates. Caddy gibt jeder Anfrage `X-Forwarded-For` mit,
und ein Absender aus dem Internet kann das nicht verhindern; darum gilt nur eine Anfrage ohne diesen Kopf direkt auf 127.0.0.1
als lokal.

Je Netz des Absenders (letzter Eintrag in `X-Forwarded-For`, den Caddy setzt; gezählt je /24 bei IPv4 und je /56 bei IPv6, nicht je
Adresse) antworten die geschützten Wege nach 10 Fehlversuchen in 10 Minuten 10 Minuten lang mit 429. Ein gültiger Zugangsschlüssel,
ein gültiger Einmal-Code und eine gültige LiveSync-Kennung gehen immer durch: Der Dienst prüft sie vor der Sperre, sonst könnte jeder
das Plugin aussperren, und in einem Campus-Netz, das viele hinter einer Adresse bündelt, sperrten fremde Fehlversuche den richtigen
Code (bis 0.7.7 kam die Sperre vor dem Code). Der Dienst merkt sich höchstens 5000 Netze; ist die Liste voll, fällt zuerst
Abgelaufenes weg, und jedes weitere Netz zählt mit allen anderen neuen unter einem gemeinsamen Eintrag. Wer viele Adressen hat, kann
so keine laufende Sperre aus der Liste drängen (bis 0.7.7 fiel bei voller Liste der älteste Eintrag weg). Die Liste ist nach dem
letzten Fehlversuch geordnet; Abgelaufenes liegt vorn und fällt weg, ohne dass der Dienst alle Einträge durchgeht. Weil ein
gültiger Code vor der Sperre geprüft wird, bremst die Sperre das Raten nicht. Das braucht es auch nicht: Der Einmal-Code hat
10 Zeichen aus 32 (50 Bit) und gilt höchstens 30 Minuten; bei 10 Versuchen je Sekunde läge die Chance in 30 Minuten unter
1 zu 50 Milliarden.
Jeder Weg hat eine eigene Grenze für die Größe einer Anfrage (`MAX_KOERPER` in `dienst.mjs`: 1 KB bis 4 MB, ein Teil einer PDF
etwas über 8 MB); was darüber liegt, lehnt der Dienst mit 413 ab.

**Datenkanal (`kanal.mjs`):** AES-256-GCM über Web Crypto, dieselbe Schnittstelle wie im Plugin. Ein Paket ist
`{ schema, zweck, iv, daten }`. Der Zweck („eingang“, „stand“, „unterlagen“, „kapitel“, „pdf“, „verbinden“, „verbinden-antwort“, „geraete“ oder
„geraete-antwort“) ist Teil der Verschlüsselung, damit sich ein Paket nicht als das andere ausgeben lässt.

**Verbinden:** `sudo studium-server verbinden` zeigt einen Link `obsidian://studium-autopilot?aktion=server-verbinden&…` und
einen QR-Code. Darin steht nur ein Code, der einmal und 30 Minuten gilt. Die Schlüssel holt das Plugin über HTTPS und legt sie
in den Schlüsselbund des Geräts. Auf dem Server liegen der SHA-256 des Codes (für Plugins bis 0.7.7) und die drei Werte unten,
nie der Code. Wer einlöst, legt zuerst exklusiv eine Marke
`<SHA-256>.json.eingeloest` an (`O_EXCL`); lösen zwei Anfragen denselben Code zugleich ein, bekommt nur eine die Schlüssel. Ein
`rename` reichte dafür nicht: Unter Windows gelingen zwei gleichzeitige `rename` derselben Datei beide (der Test lief dort rot).

**Austausch ab 0.7.8 (`verbinden.mjs`, `codeEinloesenNeu`):** Bis 0.7.7 schützte allein HTTPS für `<IP>.sslip.io` den Code und die
Schlüssel. Ein gültiges Zertifikat für diesen Namen bekommt aber auch, wer die IP nach dem Server bei Oracle zugeteilt bekommt, wer
den Dienst hinter dem Namen betreibt oder wer das DNS umlenkt; er hätte beides mitlesen oder dem Gerät eigene Schlüssel
unterschieben können. Darum bindet das Plugin ab 0.7.8 den Tausch an den Code:

1. Aus Code (10 Zeichen, groß, ohne Strich) und Host (`<IP>.sslip.io`, klein; mit Port, falls einer dasteht) macht PBKDF2-SHA256 mit
   600 000 Runden und dem Salz `studium-autopilot/verbinden/v2/code\n<host>` 32 Byte m; daraus HKDF-SHA256 (Salz leer, Info
   `studium-autopilot/verbinden/v2/<zweck>`) `kennung`, `beweis` und `antwort`. Der Server rechnet dasselbe, wenn er den Code
   erzeugt (`neuerCode` mit seiner Adresse), und legt die drei Werte neben den SHA-256.
2. Das Gerät erzeugt ein Schlüsselpaar P-256 nur für diesen Tausch und schickt `{ schema: 2, kennung, pub, beweis }`: `pub` ist sein
   öffentlicher Schlüssel (65 Byte, unkomprimiert), `beweis` HMAC-SHA256 unter `beweis` über `studium-autopilot/verbinden/v2/beweis\n<host>\n<pub>`.
3. Der Server sucht den Code mit dieser Kennung, prüft Ablauf und Beweis, erzeugt sein eigenes Schlüsselpaar und löst den Code
   erst dann ein. Er antwortet `{ schema: 2, pub, iv, daten }`: `daten` ist `{ adresse, zugang, schluessel }`, verschlüsselt mit
   AES-256-GCM unter HKDF-SHA256(ECDH-Geheimnis ‖ `antwort`, Info und Zusatzdaten
   `studium-autopilot/verbinden/v2/antwort\n<host>\n<pub des Geräts>\n<pub des Servers>`).
4. Das Gerät nimmt nur diese Form an. Eine offene Antwort wie bis 0.7.7, eine nicht zu entschlüsselnde oder eine mit anderer
   Adresse lehnt es ab und speichert nichts.

Was das bringt: Wer alles mitschneidet, bekommt weder Code noch Schlüssel (dazu fehlt ihm das Geheimnis aus dem Tausch, auch wenn
er den Code später erfährt). Wer mit gültigem Zertifikat dazwischensitzt, kann ohne den Code keine Antwort bauen, die das Gerät
annimmt; reicht er die Kennung mit eigenem Schlüssel an den echten Server weiter, scheitert er am Beweis, und der Code bleibt dem
Gerät; reicht er sie unverändert weiter, bekommt er nur eine Antwort, die er nicht entschlüsseln kann. Um den Code aus der Kennung
zu raten, müsste er bis zu 2^50 Codes mit je 600 000 Runden durchrechnen; mit einer aktuellen Grafikkarte (grob 15 000 Versuche je
Sekunde bei dieser Rundenzahl) dauerte das im Mittel über tausend Jahre; für die 30 Minuten, die ein Code gilt, bräuchte es über
zwanzig Millionen davon. Danach nützt der Code allein nichts mehr (verbraucht oder abgelaufen). Der Host im Salz: Ein Code gilt nur für den Namen, unter dem der Server ihn
ausgab; tippt man einen fremden Namen ein, löst dessen Betreiber ihn beim echten Server nicht ein. Die Runden: Node 24 braucht dafür
auf einem PC von 2018 (Ryzen 7 2700) etwa 0,15 s, mit 300 000 Runden etwa 0,07 s, gemessen mit Web Crypto wie im Plugin. Ein
Telefon braucht grob das Doppelte bis Dreifache, also unter einer Sekunde; der Server rechnet es einmal je Code. 600 000 ist die
Empfehlung von OWASP für PBKDF2-SHA256. P-256, HKDF, HMAC, PBKDF2 und AES-GCM gibt es in Web Crypto auch auf iOS 16 (X25519 nicht
überall). **Was bleibt:** Plugins bis 0.7.7 schicken den Code weiter im Klartext und bekommen die Schlüssel offen zurück (`{ code }`
ohne `schema`); dafür gilt nur HTTPS wie bisher, und der Dienst nimmt das an, bis es sie nicht mehr gibt. Ein Server bis 0.7.7 kennt
den neuen Austausch nicht (403 ohne `schema`); ein Plugin ab 0.7.8 sagt dann, dass der Server erst sein Update braucht, und
verbindet nicht auf dem alten Weg. Ein Code ohne Adresse des Servers (vor 0.7.8 erzeugt) geht nur auf dem alten Weg.

**Weiteres Gerät ohne Cloud Shell:** Ein verbundenes Gerät holt im Fenster „Eigener Server“ mit **Weiteres Gerät verbinden**
(nach einer Rückfrage) einen Code über `POST /v1/geraet` und zeigt ihn groß, bis er abläuft; das neue Gerät tippt ihn unter
**Mit Code verbinden** ein und löst ihn wie oben ein. Die Anfrage muss mit dem Datenschlüssel verschlüsselt sein: Den
Zugangsschlüssel trug bis 0.7.7 jede Anfrage im Kopf, und wer nur ihn kennt, bekäme über einen Code sonst den Datenschlüssel. Zeit und
Zufallswert verhindern, dass eine mitgeschnittene Anfrage noch einmal einen Code holt (die Zufallswerte bleiben in
`geraete.json` bis zum Ende ihres Fensters gemerkt, auch über einen Neustart; je Schlüssel, also je Gerät, höchstens 200 zugleich,
sonst 429, damit kein Gerät mit vielen Anfragen das Trennen oder die Codes der anderen aufhält). Codes aus Obsidian gelten 10 Minuten, höchstens
einer ist offen, höchstens 3 je Stunde und 10 je Tag; Codes aus der Cloud Shell zählen dabei nicht und bleiben. Jedes Einlösen
steht mit Zeit, Herkunft, grobem Netz (IPv4 /24, IPv6 /48, nie die ganze Adresse) und, wenn das Gerät einen schickt, seinem
Namen in `geraete.json` (die letzten 20), im Eingang und im Status mit Schlüssel; Obsidian bis 0.7.7 zeigt das letzte im Fenster als
„Zuletzt verbunden“.

**Schlüssel je Gerät (seit 03.11.2026, `geraete.mjs`):** Bis dahin teilten sich alle Geräte Zugangs- und Datenschlüssel aus
`dienst.json`; ein verlorenes Gerät hieß neue Schlüssel für alle. Jetzt bekommt jedes Gerät, das einen Code auf dem Weg ab 0.7.8 einlöst,
ein eigenes Paar (je 32 Zufallsbytes) und eine Kennung (16 Zufallsbytes, base64url) in der verschlüsselten Antwort. Plugins 0.7.8 bis
0.7.11 übergehen die Kennung und signieren mit den Schlüsseln, die sie bekommen; der Kopf der Anfragen ändert sich nicht.

- **Verzeichnis** `web/geraete-schluessel.json` (0600, schreibt nur der Web-Dienst, atomar): `{ schema: 1, fuer, geraete: [{ id,
  zugang, schluessel, seit, zuletzt, herkunft, von, netz?, name? }], alt? }`. `herkunft` ist `cloud-shell` oder `obsidian` (woher der Code
  kam) oder `umzug`, `von` wer das Gerät hereinließ: `cloud-shell`, die Kennung des Geräts, dessen Code es einlöste, oder `gemeinsam`
  (ein Code oder Umzug mit dem gemeinsamen Schlüssel; so stehen auch Einträge ohne `von` da). Dafür nennt jeder Code aus Obsidian
  (`web/verbinden/<SHA-256>.json`) und jeder Code der Claude-App (`claude-app/codes/`), wer ihn holte, und der Connector schreibt das zur
  Verbindung, die daraus entsteht (`aus-mcp/verbindungen.json`, `von`). `netz` ist das grobe Netz beim Verbinden (/24 bzw. /48), `name`,
  was das Gerät von sich sagt (das Plugin schickt nur seine Art wie „iPhone“; gesäubert, höchstens 40 Zeichen), `zuletzt` höchstens
  stündlich nachgetragen. Höchstens 30 Geräte: Ist es
  voll, scheitert das Einlösen nach der Prüfung des Codes mit 409 `zu-viele-geraete`, und der Code bleibt; verdrängt wird nie ein Gerät.
- **An die gemeinsamen Schlüssel gebunden:** `fuer` ist ein Fingerabdruck (gekürzter SHA-256) der gemeinsamen Schlüssel. Passt er nicht
  mehr zu `dienst.json`, gilt kein Gerät mehr. So macht `schluessel-erneuern` (und eine neue Adresse) auch alle eigenen Schlüssel
  ungültig, ohne dass etwas außer dem Dienst das Verzeichnis anfasst; der Dienst gleicht es beim Start und vor jeder signierten Anfrage
  ab. Nach `schluessel-erneuern` bleiben die Schlüssel der Geräte von damals unter `alt` (ohne Namen), solange der Dienst die alten
  gemeinsamen noch kennt (`ALT_FRIST`, 30 Tage): Sie bekommen dann wie diese 401 `{ fehler: "zugang", erneuert: 1 }`, signiert unter
  ihren eigenen, und das Gerät zeigt gleich „Dein Server hat neue Schlüssel“. Eine neue Adresse lässt keine alten stehen.
- **Trennen:** im Plugin unter „Geräte“ (`POST /v1/geraete` `trennen`) oder auf dem Server mit `sudo studium-server geraet-trennen <id>`
  (Kennung aus `sudo studium-server geraete`). **Mit dem Gerät geht, was es hereinließ:** jedes Gerät, das einen Code von ihm einlöste,
  auch über weitere Stufen (`geraete.mjs` `kaskade`), seine offenen Codes (für Geräte und für die Claude-App) und die Verbindungen der
  Claude-App, die mit einem seiner Codes entstanden (der Dienst legt dafür `claude-app/trennen/<id>` an). So verliert, wer ein Gerät
  stiehlt und damit ein zweites verbindet oder die Claude-App anmeldet, mit einem Trennen alles; ein Code, den das Gerät noch offen
  hatte, geht danach nicht mehr, auch wenn ihn das Zurückziehen nicht erreichte (beim Einlösen prüft der Dienst, ob es den Aussteller
  noch gibt). Ausgenommen sind das fragende Gerät und, was du behältst: Obsidian nennt in der Rückfrage, was mitgeht, und bietet
  **Nur „…“ trennen** an (`behalten`: die Kennungen dieser Geräte und Verbindungen); auf dem Server behält `--nur-dieses` alles, was
  es hereinließ. Trennt sich ein Gerät selbst („Dieses Gerät trennen“), geht nur es (und seine offenen Codes). Der Befehl legt nur die Marke `web/getrennt/<id>` an (als `studium-web`); der Dienst
  wendet sie vor seiner nächsten signierten Anfrage und beim Start an, ohne Neustart, und bleibt so der Einzige, der das Verzeichnis
  schreibt. Er löscht eine Marke erst, wenn der Stand ohne das Gerät in der Datei steht: Scheitert das Schreiben (volle Platte), gilt
  das Trennen im Speicher, und die Marke bringt es nach einem Neustart wieder. Trennen aus Obsidian legt zuerst dieselbe Marke an; ließ
  sich weder sie noch das Verzeichnis schreiben, antwortet der Dienst 503 `{ fehler: "speichern" }` (getrennt nur bis zu seinem
  Neustart), und Obsidian sagt das, statt „getrennt“. Ebenso gilt ein neues Gerät (Verbinden, Umzug) erst, wenn es in der Datei steht,
  sonst 503 `speichern` ohne Schlüssel, und der Code bleibt: So gibt es kein Gerät nur im Speicher, das `studium-server geraete` nicht
  zeigte. Ein getrenntes Gerät ist ein unbekannter Schlüssel: 401 ohne Signatur, gezählt als Fehlversuch seines Netzes (gültige
  Schlüssel anderer Geräte im selben Netz gehen trotzdem durch, die Sperre gilt nur für Fehlversuche).
- **Umzug** bestehender Geräte: Ein Plugin ab dieser Fassung ohne Kennung im Schlüsselbund fragt nach einer signierten Antwort einmal
  `umziehen`. Mit dem gemeinsamen Schlüssel bekommt es eigene (Herkunft `umzug`), verschlüsselt unter dem gemeinsamen Datenschlüssel; mit
  eigenen (verbunden mit 0.7.8 bis 0.7.11) dieselben samt Kennung. Danach signiert es nur noch mit ihnen, und ein Eintrag mit Kennung
  gilt im Plugin immer als verriegelt (kein Bearer mehr, auch nicht nach verlorenem Riegel). Mit dem gemeinsamen Schlüssel braucht
  `umziehen` eine **Kennung des Umzugs** (`umzug`, 16 Zufallsbytes), die das Plugin vor der Anfrage im Gerätespeicher ablegt
  (`eba-server-umzug`, je Server und Schlüssel) und nach dem Umzug löscht; der Dienst merkt sich nur ihren SHA-256. Dieselbe Kennung ergibt
  dasselbe Gerät: Geht die Antwort verloren oder scheitert der Schlüsselbund, entsteht beim nächsten Versuch kein zweites. Neue Umzüge
  höchstens 5 je Stunde (sonst 429 `{ fehler: "zu-viele", wieder }`) und 10 zu einem gemeinsamen Schlüssel (sonst 409
  `zu-viele-umzuege`; `umzuege` im Verzeichnis, mit neuen gemeinsamen Schlüsseln leer, `UMZUG` in `geraete.mjs`): Wer nur den gemeinsamen
  Schlüssel hat, etwa von einem verlorenen Gerät, das nicht umgezogen ist, legt so nicht beliebig viele Geräte an, die ihn überleben.
  Ein umgezogenes Gerät, das seine Schlüssel 7 Tage lang nie benutzt hat (`neu`, die erste Anfrage trägt es aus), fällt beim nächsten
  Abgleich weg; nicht benutzt hat es nur, wer die Antwort nie bekam.
- **Übergang des gemeinsamen Schlüssels:** Signaturen unter ihm nimmt der Dienst nur noch eine Weile an, wie den Bearer: Ab dem ersten
  Gerät mit eigenen Schlüsseln (Marke `web/geraete-seit.json`) höchstens 30 Tage (`GEMEINSAM_SCHLUSS`), und kam 7 Tage lang keine mehr
  (`GEMEINSAM_FRIST`, gezählt ab der letzten, `web/gemeinsam.json`, höchstens stündlich geschrieben; kam nie eine, ab dem ersten Gerät),
  schon früher, und sofort mit `sudo studium-server gemeinsam-beenden` (legt dieselbe Marke an, zieht die offenen Codes des gemeinsamen
  Schlüssels zurück und nennt, was mit ihm kam; ohne ein Gerät mit eigenen Schlüsseln lehnt es ab, denn dann käme keins mehr hinein).
  Danach antwortet er auf sie mit 401 `{ fehler: "zugang" }`, signiert unter dem gemeinsamen Schlüssel und ohne Fehlversuch: Ein Plugin von 0.7.8 bis 0.7.11, das nicht umzieht, zeigt dann „Dein Server kennt dieses Gerät nicht mehr. Bitte neu
  verbinden.“. Das erste Nein schreibt `web/gemeinsam-aus.json` und gilt für immer, auch wenn die Uhr zurückgeht. Ohne Gerät mit eigenen
  Schlüsseln gibt es keine Frist (wer nur Plugins bis 0.7.11 hat, merkt nichts).
- **Plugins bis 0.7.7** halten den gemeinsamen Schlüssel nicht am Leben. Der Bearer gilt nur, solange seine eigene Frist läuft
  („Übergang“ oben) und der gemeinsame Schlüssel gilt (ein Bearer zählt dort als Benutzung); danach 401 `veraltet`. Beim Verbinden (Code
  im Klartext) bekommen sie die gemeinsamen Schlüssel nur, solange der Bearer gilt und noch kein Gerät eigene Schlüssel hat
  (`web/geraete-seit.json`), und einen Code über `POST /v1/geraet` holen sie mit dem Bearer ebenso nur bis dahin: Sonst bekäme jeder,
  der den gemeinsamen Schlüssel oder einen Code hat, Schlüssel, die kein Trennen erreicht (gemeinsame) oder die den gemeinsamen
  überleben (eigene über einen Code). Danach antwortet `/v1/verbinden` 403 `{ fehler: "veraltet", schema: 2 }`, ohne den Code zu
  verbrauchen und ohne Fehlversuch, und `/v1/geraet` 403 `{ fehler: "veraltet" }`. **Ein Gerät mit Obsidian-Plugin bis 0.7.7 muss also
  erst Studium Autopilot aktualisieren**, bevor es sich neu verbindet; mit einem aktuellen Plugin geht derselbe Code. Ein schon
  verbundenes Plugin bis 0.7.7 holt weiter ab, bis der Bearer oder der gemeinsame Schlüssel endet.
- **Liste:** Eingang und Status mit Schlüssel nennen die Geräte (`geraete`, ohne Schlüssel, mit `herkunft`, `von` und `netz`, `dieses`
  für das fragende); ohne Schlüssel nie, auch nicht direkt auf 127.0.0.1. Obsidian zeigt je Gerät, woher es kam („über die Cloud
  Shell“, „über Code von „iPhone““, „über Code eines getrennten Geräts“, „von früher übernommen“), seit wann, zuletzt und den
  Anschluss (grobes Netz); `studium-server geraete` dasselbe mit Kennungen. Das Protokoll `verbunden` in `geraete.json` bleibt daneben, wie es ist.
- **Zurückrollen** auf ein Paket vor dieser Fassung: Der alte Dienst kennt nur die gemeinsamen Schlüssel, Geräte mit eigenen kommen bis
  zum nächsten Update nicht hinein (das Verzeichnis bleibt und gilt danach wieder). Er kennt auch die Marken nicht, die den gemeinsamen
  Schlüssel beenden (`gemeinsam-aus.json`) und Geräte trennen (`getrennt/`): Auf ihm gälte der gemeinsame Schlüssel wieder, auch als
  Bearer. Erreichbar ist das nur beim ersten Update auf diese Fassung, denn zurückgerollt wird immer auf das Paket, das vorher lief
  („Zurückrollen“ unter „Updates des Server-Pakets“): Ist sie einmal fertig installiert, rollt jedes spätere Update höchstens auf sie
  zurück. Beim ersten Update gibt es noch nichts davon zu schützen (das Ende des gemeinsamen Schlüssels kommt frühestens 7 Tage nach dem
  ersten Gerät mit eigenen Schlüsseln, und diese Geräte kämen auf dem alten Dienst ohnehin nicht hinein). Darum hebt diese Fassung
  `MINDESTVERSION` nicht an: Das verböte nur genau dieses Zurückrollen, und ein Server, dessen neuer Dienst nicht antwortet, bliebe bis
  zum nächsten Lauf auf ihm stehen. Wer `gemeinsam-beenden` gleich nach dem Update braucht, prüft vorher mit `sudo studium-server
  status`, dass die neue Version läuft.

**Gerät verloren:** Zuerst dieses Gerät trennen: in Obsidian auf einem anderen Gerät unter „Eigener Server“ → „Geräte“ →
**Trennen**, oder `sudo studium-server geraete` und `sudo studium-server geraet-trennen <id>`. Mit ihm gehen die Geräte, die über einen
Code von ihm verbunden wurden, und die Verbindungen der Claude-App aus seinen Codes (wer das Gerät hat, kann damit weitere verbunden
haben); was davon deins ist, behältst du in der Rückfrage (**Nur „…“ trennen**, auf dem Server `--nur-dieses`). Die übrigen bleiben
verbunden. Danach die Liste „Geräte“ und die Verbindungen der Claude-App ansehen: Was du dort nicht kennst (woher es kam, seit wann, der
Anschluss), trennst du ebenso. Hatte das verlorene Gerät noch die gemeinsamen Schlüssel (nicht umgezogen, es fehlt in der Liste):
`sudo studium-server gemeinsam-beenden`. Ab dann gilt der gemeinsame Schlüssel nicht mehr (auch nicht als Bearer), seine offenen Codes
auch nicht, und die Geräte mit eigenen Schlüsseln bleiben verbunden; ein Gerät, das noch nicht umgezogen ist, verbindet sich mit einem
Code neu. Der Befehl nennt, was mit dem gemeinsamen Schlüssel kam (Umzüge, Geräte über seine Codes, die Claude-App): Was du davon nicht
kennst, trennst du. Bist du unsicher, ob alles erwischt ist, oder sollen alle neue bekommen: `sudo studium-server schluessel-erneuern`
(aus der Cloud Shell: `bash ~/studium-autopilot/server/fern.sh schluessel-erneuern`) hält den Web-Dienst an, löscht alle offenen
Codes, schreibt neue Zugangs- und Datenschlüssel (32 Byte wie beim Installieren) in eine neue `dienst.json` (root:studium-web, 0640),
die die alte in einem Schritt ersetzt, und startet den Dienst wieder, auch nach einem Fehler. Danach kennt der Server kein Gerät mehr (auch keins mit eigenen Schlüsseln, siehe oben): das erste mit `studium-server verbinden`, jedes weitere
mit **Weiteres Gerät verbinden**; ein Gerät mit alten Schlüsseln bietet im Fenster selbst **Mit Code verbinden** an. Die alten
Schlüssel stehen danach als `zugang_alt` und `schluessel_alt` mit der Zeit `erneuert` in `dienst.json`: 30 Tage lang (`ALT_FRIST`)
bekommt eine Anfrage, deren Signatur nur unter ihnen stimmt, 401 `{ fehler: "zugang", erneuert: 1 }`, signiert unter den alten
Schlüsseln (kein Fehlversuch, Zufallswert nicht gemerkt), und das Gerät zeigt gleich „Dein Server hat neue Schlüssel“; ebenso die eigenen
Schlüssel der Geräte von damals. Mehr erlauben die alten Schlüssel nicht; wer das verlorene Gerät hat, erfährt so nur, dass es neue gibt. Der Installer
behält die neuen Schlüssel bei jedem weiteren Lauf. **Grenze:** LiveSync hat eigene Zugangsdaten (`livesync.json`); die erneuert
dieser Befehl nicht (dafür `livesync-erneuern`, siehe „LiveSync“).

**Neue Adresse:** Bekommt der Server eine andere öffentliche IP (etwa nach dem Neuanlegen der Instanz), setzt `fern.sh
installieren` die Adresse `https://<neue IP>.sslip.io`. Weicht sie von der gespeicherten ab, erzeugt der Installer auch neue
Zugangs- und Datenschlüssel und löscht alle offenen Einmal-Codes (als `studium-web`), wie `schluessel-erneuern`; damit gilt auch kein
Gerät mit eigenen Schlüsseln mehr. Grund: Die Geräte
fragen weiter bei der alten Adresse, und wer deren IP danach bei Oracle bekommt, kann für sie ein Zertifikat holen. Plugins bis 0.7.7
schicken ihm dabei den Zugangsschlüssel selbst (ab 0.7.8 nur Signaturen, die er nicht wiederverwenden kann); mit neuen Schlüsseln
nützt er ihm nichts. Die Ausgabe sagt es, und jedes Gerät verbindet sich neu (das erste
mit dem Link aus `verbinden`, weitere mit **Weiteres Gerät verbinden**). Ohne vorherige Adresse (der erste Lauf mit `--ip` nach dem
Vorbereiten) und mit `--vorbereiten` bleiben die Schlüssel. **LiveSync erneuert dabei nichts von selbst:** Es zieht nur seine
Adresse nach (`livesync.sh adresse`) und behält seine Zugangsdaten; der Installer sagt am Ende nur, dass jedes Gerät einen neuen
Link braucht und dass vorher `sudo studium-server livesync-erneuern` neue Zugangsdaten setzen sollte. Wer das auslässt, gleicht mit
den alten Zugangsdaten weiter ab, die ein Gerät noch an die alte Adresse schicken kann. Obsidian sieht nach dem Wechsel nur, dass
die alte Adresse nicht mehr antwortet (nach 3 Tagen: „Weiter mit der Einrichtung“, bei neuer Adresse neu verbinden), oder, wenn dort
schon ein anderer Server antwortet, „kennt dieses Gerät nicht mehr“.

### Abruf ohne KI (`abrufen.py`)

Nur Python-Standardbibliothek. Neues landet in `abruf/roh/` mit einer Zeile in `abruf/roh/INDEX.md`; nur dann gibt es einen Anstoß
für Claude (`abruf/anstoss`). Den Takt (`web/takt.json`) und den Knopf (`web/knopf.json`) des Web-Dienstes liest er nur als echte
Datei, nie über einen Link, und höchstens 64 KB. Der Server gibt Claude nur, wofür es KI braucht: Mails. Abgaben aus dem ILIAS-Kalender holt das Plugin selbst und ohne
KI (ein Schreiber je Quelle, `eba.quelleExtern`); Kurstitel mit Kurs-Passwörtern gehen so nie an Claude.

- **Uni-Postfach:** IMAP über TLS (mindestens 1.2) mit Prüfung von Zertifikat und Servername; passt eines nicht, geht kein
  Passwort raus (bis 0.7.6 nahm der Abruf den Standard von `imaplib`, einen Kontext ohne Prüfung). Nur lesend (`EXAMINE`,
  `BODY.PEEK`, nichts wird als gelesen markiert). Beim ersten Abruf die letzten 14 Tage, danach nur neue Mails (UID), höchstens 30 je Abruf. Mails werden zu Text (HTML ohne Skripte). Den
  Uni-Zugang bekommt nur dieser Dienst über `LoadCredentialEncrypted`.
- **Kopf jeder Mail:** Betreff, Von, Datum, `Absender-Domain` (aus From) und `Authentifiziert`, je eine Zeile. Die Domain liest der
  Abruf wie ein Mailserver aus der geparsten Adresse, nie aus dem dekodierten Text (ein kodiertes Wort mit einer Adresse darin ist
  ein Name); mehr als eine Kopfzeile From, mehr als eine Adresse oder ein Fehler beim Parsen: keine Domain. Kein Fehler sind
  veraltete Formen und ein Name mit rohen 8-Bit-Zeichen oder unbekanntem Zeichensatz, solange die Adresse selbst ASCII ist. Ein
  Zeilenumbruch in einer Kopfzeile (auch in einem kodierten Betreff) wird zum Leerzeichen, sonst stünde darin eine eigene Zeile
  „Von: …“ vor dem echten Absender. `Authentifiziert` kommt nur aus einer Kopfzeile `Authentication-Results` (RFC 8601), die
  über jeder Kopfzeile `Received` steht (der Mailserver der Uni fügt sie beim Zustellen oben ein; eine, die der Absender selbst
  mitschickt, steht immer unter den Received-Zeilen der Uni) und deren Kennung (authserv-id) auf `uni-tuebingen.de` endet; von
  mehreren die oberste. `pass` bei `dmarc=pass` mit `header.from` gleich der Domain aus From oder bei `dkim=pass` mit `header.d`
  gleich dieser Domain oder einer Subdomain davon; `fehlgeschlagen` auch bei `dmarc=pass` für eine andere Domain (dann las der
  Mailserver From anders als der Abruf), `fehlgeschlagen` bei `dkim=fail` oder `dmarc=fail`, sonst `unbekannt` (auch ohne passende Kopfzeile). Ob und
  wo der Mailserver der Uni sie setzt, ist nicht bekannt; setzt er sie nicht oder unter seine Received-Zeile, ist jedes Urteil
  `unbekannt`. Darum stuft nur `fehlgeschlagen` etwas herab (siehe „Prüfung“ beim Claude-Lauf), und `unbekannt` ändert nichts. Eine Rundmail über eine Liste, die die Signatur bricht, kann
  dadurch `fehlgeschlagen` sein; ihre Termine kommen dann als „geschätzt“, nicht als „offiziell“.
- **Anhänge:** Kalender (`.ics`) stehen als eine Zeile je Termin am Ende des Texts (Titel, Beginn, Ende, Ort; höchstens 40 je
  Anhang). PDFs legt der Abruf unverändert neben die Mail (`abruf/roh/uni-postfach/<UIDVALIDITY>-<UID>-anhang-<n>.pdf` neben `<UIDVALIDITY>-<UID>.txt`; bis zu dieser Fassung ohne UIDVALIDITY, höchstens 3 je Mail, je bis
  10 MB, zusammen bis 40 MB je Abruf; der Text nennt sie), gelesen werden sie erst im Claude-Lauf und nur, wenn eine nach
  Terminen aussieht: Dieser Dienst hat den Uni-Zugang, ein PDF-Leser hier hätte mit einer präparierten Datei Zugriff darauf.
  Nach einem erfolgreichen Lauf sind die PDFs weg (in der Quarantäne bleiben sie mit ihrer Mail, siehe Claude-Lauf).
  Andere Anhänge nur mit Namen; beim Nachlesen im Sicherheitslauf nur der Text. Über die Weiterleitung an Gmail kommen Anhänge
  nicht auf den Server.
- **Grenzen je Tag (Berlin)** gegen eine Flut von Mails (`abrufen.py`, `TAG_GRENZEN`), in zwei Töpfen, damit eine Flut von
  außen die Uni nicht verdrängt: Mails der Uni (From unter `uni-tuebingen.de`, Urteil nicht `fehlgeschlagen`) höchstens
  1 500 000 Zeichen für Claude (etwa 25 Mails mit der Höchstlänge von 60 000 Zeichen oder einige tausend gewöhnliche), 40 PDF-Anhänge
  und zusammen 300 MB; alle anderen 400 000 Zeichen, 10 PDFs und 75 MB, dazu höchstens 20 Mails je Absender (`TAG_JE_ABSENDER`,
  Adresse aus From; gezählt wird ein Kurz-Hash, nie die Adresse). Je Absender zählt nur außerhalb der Uni: ILIAS und Rundmails
  schicken an manchen Tagen mehr. Ohne Urteil der Uni (`unbekannt`) zählt die Domain, die die Mail angibt; die Trennung ist so
  stark wie das Urteil. Eine Mail über einer Grenze bleibt im Postfach und steht mit ihrer UID unter `wartend` in
  `abruf-stand.json` (Tag, ab dem sie wieder dran ist, Topf, Kurz-Hash des Absenders, Zeichen, Zahl und Größe ihrer PDFs;
  höchstens 2000, `WARTEND_MAX`; was darüber geht, zählt als `verworfen`). Am nächsten Tag kommt sie vor den neuen dran, aber 10
  der 30 Plätze je Abruf bleiben neuen Mails (`NEU_PLAETZE`); ist eine Grenze, die für sie gilt (Zeichen, PDFs oder MB ihres Topfs,
  ihr Absender), schon erreicht, wartet sie weiter, ohne dass der Abruf sie holt. Mails der Uni kommen zuerst dran, bei den
  zurückgestellten wie bei den neuen: Passen nicht alle neuen in die Plätze, liest der Abruf vorher nur die Kopfzeilen, die den
  Topf bestimmen (From, Authentication-Results, Received; `BODY.PEEK`, der jüngsten 2000, `KOEPFE_MAX`), und holt die der Uni vor
  den anderen; die übrigen holt der nächste Abruf (`letzte_uid` bleibt unter der ersten davon, die schon geholten darüber stehen
  unter `vorgezogen`, höchstens 2000, `VORGEZOGEN_MAX`, dann wieder nach UID). Damit keine liegen bleibt, wenn sehr viele Mails
  als Uni gelten, kommen neue, die seit 24 Stunden keinen Platz bekamen (`ALT_NACH`, nach den `marken` im Stand, nie nach dem Datum
  in der Mail), auf der Hälfte der Plätze vor denen der Uni. Ob Authentication-Results über Received steht, sagt bei den
  Kopfzeilen allein die Reihenfolge, in der der Server sie liefert; das entscheidet nur, was zuerst drankommt, die Grenzen gelten
  nach dem ganzen Kopf. Eine Flut von außen verzögert eine neue Mail der Uni so nicht; nur wenn mehr als 2000 neue auf einmal
  warten, kommen die älteren ohne diesen Blick nach UID dran. Eine Mail mit PDFs wartet immer ganz, nie ohne ihre PDFs: Passen sie nicht mehr in die Grenze des Tages, auf morgen; nicht
  mehr in die 40 MB dieses Abrufs oder bliebe danach weniger als 2 GB frei (`PLATZ_MIN`), auf den nächsten Abruf. Ändert sich die
  UIDVALIDITY des Postfachs (die gemerkten UIDs gelten dann nicht mehr), sucht der Abruf so weit zurück wie das älteste
  Zurückgestellte (`wartend_seit`, höchstens 60 Tage, sonst 14) und holt alles seitdem noch einmal; Doppel erkennt der Lauf. Nur
  Zurückgestelltes stößt keinen Lauf an. Die Zahlen stehen im Status unter `grenzen` (Lauf, `grenzenStand`).

### Claude-Lauf (`lauf.mjs` und `skill/`)

Je Lauf ein eigener Ordner `laeufe/<Zeit>/` mit `auftrag.md`, den Rohdaten, `bisher.json` (schon gelieferte Termine),
`stand.json` (vom Plugin), `tresor.json` (was schon in Obsidian steht: Termine mit Titel und Datum, offene To-dos mit Kennung und Notiz; geprüft wie
das Eingang, Termine und To-dos, die nach Zugangsdaten aussehen, einen Link enthalten oder wie eine Anweisung an Claude aussehen, fallen weg (Heuristiken, `docs/architektur/server.md`, „Zugangsdaten“ und „Anweisungen“; was Claude einmal in eine Notiz schrieb, käme sonst in jedem Lauf wieder); doppelte To-dos nennt Claude als Paar `todo_doppel` aus diesen Kennungen, das
Plugin macht aus dem einen einen einfachen Punkt mit Link auf das andere), `zentral.json` (die öffentlichen Termine aller EcoBA-Studierenden, damit Claude
sie nicht doppelt liefert; jeder Titel geprüft wie im Plugin: kein HTML, keine Klammern `[ ] < > { } | \`, gesäubert, nichts, was wie eine Anweisung aussieht, sonst fällt der Termin weg), die ältesten Textfassungen aus `unterlagen/neu/` (bis zu 6, zusammen höchstens 200 000 Zeichen, eine größere allein; der Rest im nächsten Lauf gleich danach) (Ordner `unterlagen/`, dazu schreibt Claude
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
  `termine.md`, Abschnitt „Quellen“. Der Skill nimmt alles im Arbeitsordner außer `auftrag.md` und `skill/` als Daten, nie als
  Anweisung (Mails, `zentral.json`, `tresor.json`, Unterlagen); Links zum Bezahlen oder Anmelden gibt Claude nie aus, und fordert
  eine Mail dazu auf, meldet es „Verdacht auf Phishing“ als Hinweis (SKILL.md, Grundregeln).
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
  ab, damit eine Änderung denselben Termin trifft. Zu jedem Termin nennt Claude die `herkunft` (Mail in `roh/`, Gmail mit Domain
  und Datum oder Unterlage); sie geht nie ins Eingang. Für eine Mail in `roh/` nimmt der Server Domain, Urteil und Datum nur
  aus ihrem Kopf, nie von Claude. Steht dort `Authentifiziert: fehlgeschlagen`, ist kein Termin daraus `offiziell`, und
  `info` beginnt mit „Absender nicht bestätigt.“ Ändert eine Lieferung Datum, Ende, Uhrzeit oder Absage eines bekannten
  Termins und stammt sie aus einer anderen Quelle als der Termin, gilt sie nur als „geschätzt“, und `info` beginnt mit
  „Geändert durch Mail von <Domain> vom <Datum>.“; das bleibt, bis die erste Quelle den Termin wieder nennt. Quelle ist die
  Domain aus From (`mail:<Domain>`; mit `fehlgeschlagen` eine eigene Quelle, damit eine gefälschte Mail nicht als derselbe
  Absender gilt), `unterlage` oder unbekannt (keine Herkunft); bestätigt ist die Domain nur mit `pass`, sonst ist es die, die
  die Mail angibt, bei Gmail die, die Claude nennt. Verglichen wird die registrierbare Domain (die letzten zwei Teile, unter
  Endungen wie `co.uk` drei): `wiwi.uni-tuebingen.de` und `uni-tuebingen.de` sind dieselbe Quelle. Ausnahme ist
  `student.uni-tuebingen.de`, denn dort hat jede und jeder Studierende eine Adresse: Eine Mail von dort ändert keinen Termin
  eines Lehrstuhls. Der Vergleich ist nur so stark wie das Urteil über den Absender: Mit `unbekannt` (der Mailserver der Uni
  setzt keine passende Kopfzeile) gilt eine Mail mit gefälschtem From als derselbe Absender; mehr lässt sich dann nicht prüfen.
  Gemerkt wird die erste Quelle je Termin in `termine-quellen.json` (nur für Termine im Bestand); ein Termin, der vor dieser
  Fassung kam, bekommt die Quelle seiner nächsten Lieferung, und diese gilt wie bisher. Ins Eingang kommt nur, was neu oder geändert ist; Vergangenes nur als
  Änderung eines bekannten Termins. Im Bestand (`termine.json`, daraus `bisher.json` im Auftrag) bleibt ein Termin bis 60 Tage
  nach seinem Ende.
- **Fehler:** Bei Limit oder ungültiger Ausgabe kommen die Rohdaten zurück und der nächste Lauf versucht es erneut; der Status
  meldet `claude-limit` bzw. `ausgabe-ungueltig`. Gescheitert ist ein Lauf auch, wenn Claude Code mit 0 endet, aber `is_error`
  meldet (so am Limit).
- **Welche Mails in einen Lauf kommen** (`rohSichten`): frische Mails zuerst; gibt es keine, eine Gruppe von Mails, mit denen
  ein Lauf schon scheiterte (die älteste); sonst die Mails mit `Authentifiziert: fehlgeschlagen` in einem eigenen Lauf ohne Gmail,
  Unterlagen und Folien. Alles aus diesem Lauf kommt nur „geschätzt“ mit „Absender nicht bestätigt.“ (auch was Claude einer
  anderen Quelle zuschreibt), Hinweise mit „Absender nicht bestätigt:“ vorn, und er liefert keine Begleitnotizen, Kapitellisten
  oder doppelten To-dos; so kann Claude eine solche Mail keiner anderen Quelle unterschieben. Das kostet einen Lauf mehr, nur an
  Tagen mit einer solchen Mail. Mails mit `unbekannt` oder `pass` laufen dagegen zusammen im gewöhnlichen Lauf: Dort kann Claude die
  Termine einer Mail einer anderen desselben Laufs zuschreiben, etwa die einer Mail von außen einer echten Mail der Uni. Der Server
  prüft nur den Kopf der Mail, die Claude als Herkunft nennt, nicht, ob der Termin wirklich aus ihr stammt; dagegen hilft nur, dass
  der Skill Mails als Daten behandelt. Was ein Lauf nicht nimmt, wartet in `abruf/roh/`; nach dem Lauf stößt er gleich den nächsten an.
  Gmail, Unterlagen und Folien („Extras“) laufen nur mit frischen Mails oder ohne Mails, nie mit Mails nach einem Fehlschlag.
- **Extras, an denen Läufe scheitern:** Scheitert ein Lauf mit Mails und Extras, zählt das nicht gegen die Mails: Sie laufen gleich
  noch einmal ohne Extras, und erst ein Fehlschlag dann zählt wie unten. Ein Extra mit Fehlschlag läuft danach allein, nie mit
  Mails; damit es an Tagen mit vielen Mails trotzdem drankommt, nimmt der tägliche Sicherheitslauf es vor den Mails.
  Unterlagen und Folien zählen je Datei wie Mails (`unterlagen-fehler.json`, Kennung aus dem SHA-256 ihres Inhalts): Ein
  gescheiterter Lauf halbiert sie, bis eine allein scheitert; scheitert sie allein zweimal, bleibt sie liegen und wird ausgelassen
  (nicht gelöscht; im Status `grenzen.unterlagen_ausgelassen` bzw. `grenzen.kapitel_ausgelassen`), die anderen laufen weiter. Eine
  neue Fassung derselben Unterlage hat einen anderen Inhalt und eine neue Chance. Gmail hat keine einzelne Mail zum Auslassen: Es
  zählt seine gescheiterten Läufe am Tag (`extra-fehler.json`) und wird nach zwei bis zum nächsten Tag nicht mehr durchsucht
  (`grenzen.fehlschlaege_gmail`, `grenzen.ausgesetzt_gmail`). So bringt eine präparierte Mail im Gmail-Überblick oder eine
  präparierte Unterlage keine Mail der Uni in die Quarantäne und hält keine andere Unterlage auf.
- **Mails, an denen jeder Lauf scheitert (Quarantäne):** Scheitert ein Lauf so, dass der Inhalt seiner Mails schuld sein kann
  (ungültige Ausgabe, oder Claude lief zu Ende und meldete einen Fehler, der nicht nach Anmeldung, Limit, Netz, Überlastung oder
  Zeitüberschreitung aussieht: „fetch failed“, „socket hang up“, `ECONNRESET`, „Request timed out“, HTTP 429 und 5xx zählen nie),
  teilt der Lauf seine Mails in zwei Gruppen (`mail-fehler.json`), und jede läuft für sich noch einmal, bis eine Mail allein
  scheitert. Scheitert sie zweimal allein, kommt sie mit ihren Anhängen in `quarantaene/` statt noch einmal in einen Lauf, ebenso,
  wenn sie im Sicherheitslauf wiederkommt. Eine Mail, die jeden Lauf scheitern lässt, bringt so keine andere in die Quarantäne
  (gute Mails einer Gruppe kommen beim Halbieren durch, Gmail und Unterlagen zählen nie gegen Mails); eine Mail mit Angriff alle
  15 Minuten kostet nur Läufe, keine Mails. Nie gezählt werden ein Abbruch (Zeitgrenze, der nächtliche Neustart,
  ein Signal), ein Lauf ohne Ergebnis, das Limit des Abos und alles, solange Claude abgemeldet ist. Die Quarantäne bleibt, bis die
  Person sie wieder einreiht (`POST /v1/anstoss` mit `{"quarantaene":"erneut"}`: jede Mail läuft einmal allein; scheitert sie
  wieder, kommt sie zurück) oder root den Ordner leert. Der Name einer Mail (`<UIDVALIDITY>-<UID>.txt`) ist ihre Kennung in
  `mail-fehler.json` und in der Quarantäne; nach einer neuen Vergabe der UIDs trifft ein alter Eintrag so keine andere Mail.
  Liegt in der Quarantäne schon eine Mail gleichen Namens, ist es dieselbe (der Name gehört zu genau einer Mail), und die neue Kopie
  fällt weg; nur bei Namen einer früheren Fassung (nur die UID) kommt sie mit `~2` dahinter dazu. Nie wird etwas überschrieben. Nur über 200 Mails oder 500 MB fallen die ältesten weg, gezählt im Status
  (`grenzen.quarantaene_geloescht`). Im Status mit Schlüssel (und mit `studium-server status`) stehen `grenzen.quarantaene` und
  `grenzen.mails_verdacht` (Mails, die nach einem Fehlschlag noch einmal laufen). Gelingt ein Lauf, sind die Zähler seiner Mails weg.
- **Läufe je Tag, je Anlass** (`GRENZEN.laeufe`, gezählt in `nutzung.json` unter `quellen`), damit keiner die Läufe eines anderen
  aufbraucht: frische Mails aus dem Abruf (auch der Sicherheitslauf) 40, danach 10 als Reserve nur für frische Mails aus dem Topf
  der Uni (`mails_uni`; 40 Mails von außen zu verschiedenen Zeiten halten so keine der Uni auf), Mails nach einem Fehlschlag und Mails nicht bestätigter
  Absender 30, Gmail 8, Unterlagen und Folien (Begleitnotizen, auch mit Opus, Kapitellisten aus `/v1/unterlagen` und `/v1/kapitel`)
  30. Ein Lauf zählt für jeden Anlass, den er erledigt; „Mails durchsuchen“ zählt nur für sich (`knopf`), darf alles und hat eigene
  Grenzen (30 Minuten, 12 am Tag). Was über der Grenze seines Anlasses liegt, wartet bis kurz nach Mitternacht (Berlin): Der Lauf
  merkt sich das in `zustand.json` unter `tagesgrenze` (mit `quellen`), und der Dienst stößt dann an wie nach dem Limit des Abos;
  die anderen Anlässe laufen weiter. Eine Flut von Mails hält so keine Begleitnotiz auf, und eine Mail, an der Läufe scheitern,
  keine frischen Mails. Ein gewöhnlicher Tag hat einige Läufe für neue Mails, drei für Gmail und einen Sicherheitslauf; bis 0.7.7
  waren bis zu 96 Läufe aus dem Abruf allein möglich. Im Status stehen je Anlass `laeufe_<anlass>` und `laeufe_<anlass>_max`.
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
| Caddy | `https://obsidian.<IP mit Bindestrichen>.sslip.io` → CouchDB, aber nur die eine Datenbank und `/` (siehe unten; `/etc/caddy/studium-server.d/livesync.caddy`, eingebunden vom Caddyfile). Nach einem IP-Wechsel zieht `livesync.sh adresse` Adresse und Caddy-Teil nach; das ruft der Installer auf, und `verbinden` tut es auch |
| `/etc/studium-server/livesync.json` | Administrator und sein Passwort, Gerätezugang (`geraet_benutzer`, `geraet_passwort`), Datenbank, Schlüssel der Ende-zu-Ende-Verschlüsselung von LiveSync (Passwörter und Schlüssel je 32 Zeichen); nur root |
| `/var/lib/studium-server/livesync-an` | Marke für den Status (`livesync: an`), angelegt als `studium` |

Auf dem Server liegt nur dieser eine Tresor, in der Datenbank verschlüsselt, auch die Dateinamen.

**Nur, was LiveSync braucht, nach außen:** Caddy gibt nur `/<Datenbank>` und `/<Datenbank>/…` (Abgleich, `_local`, `_changes`,
`_bulk_docs`, Aufbau) und `GET`/`HEAD`/`OPTIONS` auf `/` an CouchDB weiter; PouchDB liest dort bei jedem Start des Abgleichs die
Kennung des Servers. Alles andere antwortet 404: Fauxton (`/_utils`), die Einstellungen (`/_node/…`), Benutzer (`/_users`), andere
Datenbanken, `/_session`, `/_up`. Geprüft im Quelltext von Self-hosted LiveSync 1.0.44 und seiner Bibliothek `livesync-commonlib`
0.2.3: Außerhalb der Datenbank ruft LiveSync nur `/` und, im Einrichten unter „Check database configuration“, `/_node/_local/_config`
auf. Diese Prüfung zeigt jetzt Fehler; die Einstellungen setzt ohnehin `livesync.sh`. Bis 0.7.7 ging jeder Pfad an CouchDB, mit den
Zugangsdaten eines Geräts also auch Fauxton und die Einstellungen von CouchDB. Bestehende Server bekommen den neuen Caddy-Teil mit
dem nächsten Update (der Installer ruft `livesync.sh adresse` auf); die Geräte gleichen weiter ab, ihre Wege bleiben offen.

**Gerätezugang:** Die Links tragen einen eigenen Benutzer `geraet` (in `_users`, ohne Rollen), der als einziges Mitglied der
Datenbank (`_security`) Dokumente lesen und schreiben darf, aber die Datenbank weder löschen noch anlegen und weder `_security`,
Entwürfe noch die Einstellungen von CouchDB ändern. Der Administrator `admin` bleibt auf dem Server (`livesync.sh`). Bis 0.7.7 trugen
die Links den Administrator. Neue Installationen haben den Gerätezugang von Anfang an; auf bestehenden legt ihn das nächste
`livesync verbinden` an, und neue Links tragen ihn, die alten (mit `admin`) gelten weiter, bis `livesync-erneuern` läuft.

**Aufbau-Fenster:** „Initialise or overwrite the remote“ löscht die Datenbank und legt sie neu an (`tryResetRemoteDatabase` in
LiveSync); das darf in CouchDB nur ein Administrator. Darum wird derselbe Name `geraet` mit demselben Passwort für 60 Minuten auch
Administrator (über `_node/_local/_config/admins` auf 127.0.0.1; CouchDB nimmt einen Administrator aus den Einstellungen vor dem
Benutzer in `_users`), danach gilt wieder nur die Mitgliedschaft, ohne dass das Gerät etwas ändert. Wann es offen ist, steht nur in
Dateien von root, nie in der Datenbank (ein Mitglied könnte dort etwa den Meilenstein von LiveSync löschen und sich so das Fenster
wieder öffnen): Legt `livesync einschalten` die Datenbank neu an (oder `livesync-erneuern --neue-passphrase`), entsteht
`/etc/studium-server/livesync-erstes-geraet`, und das nächste `livesync verbinden` öffnet das Fenster einmal, für das erste Gerät;
sonst nur von Hand mit `livesync aufbauen`. Das Ende steht in `/etc/studium-server/livesync-aufbau`. Ein Zeitgeber (`systemd-run`,
`studium-livesync-aufbau`) schließt es; ein Neustart verliert ihn, darum prüft `livesync.sh aufbau-pruefen` das Ende beim Start
(`studium-server-livesync-aufbau.service`), jeden Tag (`studium-server aktualisieren`), bei jedem Update und bei jedem `verbinden`:
abgelaufen → zu (auch ohne Datei, falls ein Abbruch sie verlor), noch offen → ein neuer Zeitgeber für den Rest. Läuft CouchDB nicht
oder antwortet es nicht, bleibt die Datei für den nächsten Versuch; der Dienst beim Start endet dann still, prüft 15 Minuten
nach dem Start noch einmal (`studium-server-livesync-aufbau.timer`), sonst der tägliche Lauf. **Bestehende Datenbanken:** Auf einem Server, der LiveSync schon vor dieser Fassung eingeschaltet hat, gibt es die Datei
`livesync-erstes-geraet` nicht. Hat dort noch kein Gerät den Tresor aufgebaut, braucht das erste Gerät einmal `sudo studium-server
livesync aufbauen` (Cloud Shell: `fern.sh livesync aufbauen`), sonst meldet LiveSync beim Aufbau „unauthorized“.

**Zugangsdaten erneuern:** `sudo studium-server livesync-erneuern` (aus der Cloud Shell: `fern.sh livesync-erneuern`) setzt ein neues
Passwort für den Administrator (in `livesync.json` und den Einstellungen von CouchDB, Neustart), einen neuen Gerätezugang und schließt
ein offenes Aufbau-Fenster. Danach gelten alte Links und die Zugangsdaten auf den Geräten nicht mehr: Jedes Gerät braucht einen
neuen Link (`livesync verbinden`) und wählt dort „Join this device“; der Tresor auf dem Server und der Schlüssel der Verschlüsselung
bleiben. So kommen auch ältere Geräte auf den Gerätezugang und die neuen Muster für versteckte Dateien (unten). Mit
`--neue-passphrase` auch ein neuer Schlüssel der Verschlüsselung: Mit dem alten Verschlüsseltes kann kein Gerät mit dem neuen lesen,
darum leert der Befehl die Datenbank; das Gerät mit dem aktuellsten Tresor baut sie mit seinem neuen Link wieder auf
(„Initialise or overwrite the remote“, das Fenster öffnet sich dafür), jedes weitere tritt mit „Join this device“ bei. Nur, wenn
der Schlüssel bekannt geworden sein kann (etwa ein Link samt Code); sonst reicht der Befehl ohne. Nach einem Wechsel der Adresse
brauchen die Geräte ohnehin neue Links; dann ist es der richtige Moment.

**Link für ein Gerät:** `livesync.mjs` baut die Einstellungen (Gerätezugang, Ende-zu-Ende-Verschlüsselung, Live-Abgleich, am
Computer auch mit verborgenem Fenster, versteckte Dateien) und verschlüsselt sie wie LiveSync 1.0 („persistent“: PBKDF2-SHA-256
mit 310 000 Runden, HKDF, AES-256-GCM) mit einem neuen Code aus 12 Zeichen. Weil der Setup-Link für einen QR-Code im Terminal zu
lang ist, legt der Server ihn 30 Minuten lang unter einer zufälligen Kennung ab (in `web/livesync-links/`, nur für den Web-Dienst;
Dateiname nur ihr SHA-256) und zeigt den kurzen Link `https://<Adresse>/v1/livesync/<kennung>` mit QR-Code. Den Code tippt man auf
dem Gerät ein; ohne ihn nützt der Link nichts. Der Code steht nur im Terminal, nie im Journal.

**Versteckte Dateien ohne Plugins:** Versteckte Dateien (`.obsidian/`: Einstellungen, Darstellung, Snippets) gleicht LiveSync ab,
aber (anders als bis 0.7.7) keine Plugins und nicht, welche eingeschaltet sind: Muster `/plugins/` und `/community-plugins.json$`
in `syncInternalFilesIgnorePatterns`, dazu wie bisher die Fensteranordnung. Plugins laufen auf jedem Gerät mit vollem Zugriff; ein
übernommenes Gerät mit LiveSync könnte sonst einen veränderten Kern von Studium Autopilot oder ein eigenes Plugin samt Eintrag in
`community-plugins.json` an alle anderen schicken. LiveSync prüft die Muster beim Senden und beim Empfangen (reguläre Ausdrücke gegen
den Pfad im Tresor ohne führenden Schrägstrich). **Community-Plugins installiert darum jedes Gerät selbst** (LiveSync ohnehin);
Studium Autopilot kommt selbst aus dem Release: bei der Installation, mit „Neue Version installieren“ und, wenn ein anderes Gerät
aktualisiert hat, mit „Neu laden“ (lädt ihn vom Tag der Version und prüft ihn, `docs/architektur/update.md`). Ein neues Gerät
installiert also zuerst Studium Autopilot und tritt dann bei (Skill, `livesync.md`, L3). Geräte, die vorher verbunden wurden, behalten
ihre Muster, bis sie einen neuen Link öffnen (nach `livesync-erneuern`) oder man in LiveSync unter **🔄 Sync Settings → Hidden
Files** bei den Mustern zum Ignorieren `, /plugins/, /community-plugins.json$` anhängt.

**Erlang:** Das Paket von Apache legt den Erlang-Cookie von CouchDB auch in debconf ab, als Typ `string` in
`/var/cache/debconf/config.dat` (für alle Benutzer des Servers lesbar), und debconf behält die vorige Fassung in `config.dat-old`; mit
dem Cookie lässt sich über die Erlang-Verteilung auf 127.0.0.1 Code als `couchdb` ausführen. Steht er in einer der beiden Dateien,
gilt er als bekannt: `livesync.sh absichern` schreibt einen neuen, zufälligen Cookie nach `/opt/couchdb/etc/vm.args` (dort liest
CouchDB ihn; Besitzer und Rechte bleiben), leert in beiden Dateien genau diesen Eintrag (die Dateien bleiben) und startet CouchDB
einmal neu. Dazu sieht es nach, dass epmd und die Verteilung nur auf 127.0.0.1 hören (`ERL_EPMD_ADDRESS=127.0.0.1` in
`/etc/default/couchdb`, `-kernel inet_dist_use_interface {127,0,0,1}` in `vm.args`; beides setzt schon das Paket im Modus
`standalone`). Bei jedem Update von CouchDB (auch aus der Nacht) holt das Konfigurationsskript des Pakets den Cookie aus `vm.args`
zurück nach debconf; darum ruft `studium-server aktualisieren` es jeden Tag auf, wenn `/etc/studium-server/livesync.json` (root)
da ist, nicht nach der Marke `livesync-an` (die gehört `studium`). Die Dienste von Studium Autopilot sehen `/var/cache/debconf` gar
nicht (`InaccessiblePaths`). Geprüft im Quelltext von `apache/couchdb-pkg` (Vorlagen, `couchdb.config`, `postinst`), nicht an einem
laufenden Server.

**Dateien von CouchDB:** `/opt/couchdb` gehört dem Benutzer `couchdb`. root liest und schreibt dort nie selbst (ein Link an der
Stelle einer Datei oder eines Ordners könnte auf eine Datei von root zeigen, eine Named Pipe ein Lesen ewig aufhalten): `livesync.sh`
tut es als `couchdb` (`runuser -u couchdb`, mit Zeitgrenze `timeout`), liest höchstens 1 MB und schreibt die neue Datei (die
Einstellungen in `local.d/`, `vm.args`) daneben, `couchdb:couchdb` 0640, und tauscht sie mit `mv -T` ein, das einen Link an der
Stelle ersetzt statt ihm zu folgen. Ein Link führt so nur dorthin, wo `couchdb` ohnehin schreiben darf.

**Grenze:** Wie beim Uni-Zugang liegt der Schlüssel der Verschlüsselung auf dem Server (nur root). Wer root auf dem Server ist,
kann den Tresor lesen. Wer Link und Code eines Geräts hat, gleicht als dieses Gerät ab: Er liest den Tresor und kann ihn ändern
(nicht den Kern von Studium Autopilot); dagegen hilft `livesync-erneuern`.

```
sudo studium-server livesync               einschalten (falls nötig), dann Link und Code für ein Gerät
sudo studium-server livesync einschalten   nur einschalten bzw. nachziehen (wiederholbar, Zugangsdaten bleiben)
sudo studium-server livesync verbinden     nur einen neuen Link für ein Gerät
sudo studium-server livesync aufbauen      60 Minuten darf ein Gerät den Tresor auf dem Server neu aufbauen
sudo studium-server livesync-erneuern      neue Zugangsdaten, jedes Gerät braucht einen neuen Link
sudo studium-server livesync-erneuern --neue-passphrase
                                           dazu ein neuer Schlüssel der Verschlüsselung (Tresor auf dem Server neu aufbauen)
```

### Connector für die Claude-App

Wer will, liest mit der Claude-App (claude.ai, Apps für iPhone, Android und Desktop) das eigene Studium über den eigenen Server:
„Was steht diese Woche an?“. Der Connector (`mcp.mjs`, Architektur: `docs/architektur/connector.md`) ist nur lesend und hat
keine Kopie des Tresors: Er sieht, was Obsidian dem Server ohnehin schickt (Module, Termine, offene To-dos), dazu das Lagebild
aus dem Stand (Häkchen im Lernplan, fällige Karten, Prüfungen mit Anmeldung, Versuch und Note, Stundenplan der nächsten 14 Tage),
Hinweise und noch nicht abgeholte Termine aus Mails und die zentralen Termine. Werkzeuge: `ueberblick`, `fristen`, `pruefungen`,
`module`, `lernplan`, `todos`, `hinweise`, jedes nur, wenn seine Daten da sind.

**An und aus nur aus Obsidian:** Jeder Server hat seit diesem Release Benutzer, Ordner und Einheiten des Connectors, aber er ist
aus. Erst der Knopf in Obsidian (Eigener Server → Mit der Claude-App verbinden) holt über `POST /v1/claude-app` einen Code; der
Web-Dienst legt dann die Marke `claude-app/schalter/an`. Die Pfad-Einheit `studium-server-mcp.path` sieht die Änderung, und
`studium-server-mcp-schalter.service` (root) führt `studium-server claude-app anwenden` aus: Mit Marke, Adresse und Erlaubnis im
Paket schreibt es die Wege `/mcp`, `/oauth/*` und `/.well-known/oauth-*` als `/etc/caddy/studium-server.d/seite/mcp.caddy` in den
Block der Adresse, lädt Caddy neu, startet den Connector und holt die zentralen Daten. Ohne Marke (aus) entfernt es die Wege,
hält den Connector an und löscht seinen Zustand. root liest die Marke nie, nur ob sie da ist: Ein übernommener Web-Dienst kann den
Connector so höchstens ein- oder ausschalten. Solange er aus ist, gibt es unter der Adresse nichts davon (404 wie bisher).

**Übergabe:** Web-Dienst und Connector schreiben nur je in ihre eigenen Ordner unter `claude-app/` (siehe „Wer was liest und
schreibt“). Der Web-Dienst legt Einmal-Codes (`codes/<SHA-256>.json` mit `{ ablauf, von }`, 10 Minuten, höchstens einer offen, 3 je
Stunde und 10 je Tag), Wünsche zum Trennen (`trennen/<id>`, `trennen/alle`) und `daten/lage.json` hin, was der Connector zeigen darf
(nach jedem Stand und Abholen und alle 5 Minuten neu). Der Connector löst einen Code über eine exklusive Marke in seinem Zustand
ein (er kann dort nichts löschen) und meldet die Verbindungen nach `aus-mcp/verbindungen.json`, dazu die beendeten der letzten 30
Tage mit Grund (`frueher`); Obsidian sieht beides im Eingang (`claude_app`) und zeigt jede Verbindung einmal auf jedem Gerät, auch
eine, die schon wieder endete, bevor es abholte. Ein Code für die Claude-App verbindet nie ein Gerät (`/v1/verbinden` sucht nur in `web/verbinden/`).
Das Lagebild steht nur für den Connector in `web/lagebild.json` (0600), nie im Stand für den Lauf; aus geht es mit dem Connector.

**Notschalter:** Die Datei `CONNECTOR` im signierten Paket. Steht in ihrer ersten Zeile ohne `#` nicht `an`, gibt der Web-Dienst
keine Codes mehr aus (503 `abgeschaltet`) und löscht Lage, Lagebild und gemerkte Hinweise, und `studium-server claude-app anwenden`
(am Ende jeder Installation, also auch jedes täglichen Updates) schaltet ihn ganz aus wie „Ganz aus“ unten und hält alles an. Ein späteres Paket mit `an` schaltet nichts wieder ein; dafür braucht
es einen neuen Code aus Obsidian. Wegen der gestaffelten Updates erreicht ein Notschalter jeden Server erst mit dessen nächstem
Update (bis zu zwei Tage).

**Ganz aus:** `studium-server claude-app aus` oder der Knopf in Obsidian beendet alle Verbindungen (`trennen/alle`), löscht offene
Codes, Lage, Lagebild und gemerkte Hinweise und den Zustand des Connectors. `schluessel-erneuern` und eine neue Adresse tun das auch
(dann ist der Connector leer wieder an bzw. aus, und claude.ai fragt nach einem neuen Code).

### Befehle (`studium-server`)

```
studium-server status                  Stand und Dienste
studium-server verbinden               Einmal-Link und QR-Code für ein Gerät
studium-server geraete                 Geräte mit eigenen Schlüsseln (Kennung, Name, seit, zuletzt, woher, Netz; nie Schlüssel)
studium-server geraet-trennen <id>     ein Gerät trennen, mit denen, die über seine Codes kamen (siehe „Gerät verloren“)
studium-server geraet-trennen <id> --nur-dieses
                                       nur dieses Gerät trennen, die über seine Codes bleiben
studium-server gemeinsam-beenden       der gemeinsame Schlüssel gilt ab sofort nicht mehr (siehe „Gerät verloren“)
studium-server schluessel-erneuern     neue Schlüssel für alle Geräte (siehe „Gerät verloren“)
studium-server uni-zugang setzen       Uni-Zugang verschlüsselt speichern
studium-server uni-zugang loeschen     Uni-Zugang löschen
studium-server uni-zugang pruefen      gespeichert oder nicht
studium-server zustand                 Zustand neu prüfen
studium-server jetzt                   Claude-Lauf jetzt anstoßen (mit Gmail)
studium-server modell sonnet|opus      Modell der Claude-Läufe
studium-server lauf                    Ergebnis des letzten Claude-Laufs
studium-server nutzung                 Claude-Läufe und Token je Tag (letzte 7 Tage), Treffer am Limit
studium-server aktualisieren [--jetzt] Pakete und Claude Code aktualisieren, Server-Paket aus dem Release (geprüft, gestaffelt; siehe oben)
studium-server livesync                LiveSync einschalten und ein Gerät verbinden (siehe „LiveSync“)
studium-server livesync-erneuern       neue Zugangsdaten für LiveSync (siehe „LiveSync“)
studium-server claude-app              Connector für die Claude-App: im Paket erlaubt, in Obsidian an, läuft, Verbindungen
studium-server claude-app aus          Connector ganz aus: alle Verbindungen beendet, Tokens gelöscht (an nur aus Obsidian)
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

Connector für die Claude-App: `tests/mcp-server.test.js` (Quelle, zentrale Daten gegen die Prüfung im Plugin, `/v1/claude-app`, Lagebild,
der ganze Weg vom Code bis zum Trennen, `studium-server claude-app anwenden` mit nachgebildetem `systemctl` und `caddy`). Noch nicht
geprüft: die Einheiten in einem echten systemd, Caddy mit dem Fragment, die Anmeldung aus dem echten claude.ai.

Abruf und Lauf: `server/test_abrufen.py` (IMAP als Attrappe), `tests/server-eingang.test.js` (auch gegen
`terminePruefen` des Plugins) und `tests/server-lauf.test.js` (Claude als Attrappe). Dazu ein echter Lauf am 18.10.2026 mit
einem echten Uni-Postfach (nur lesend), ILIAS-Kalender und Gmail, Sonnet: 16 Termine, 4 Hinweise, nichts verworfen, etwa
7,5 Minuten. Daraus kamen die Regeln für Vergangenes, zentrale Termine und Modulcodes aus Kursnamen. Den ILIAS-Kalender liest
der Server seitdem nicht mehr (siehe „Abruf ohne KI“).
