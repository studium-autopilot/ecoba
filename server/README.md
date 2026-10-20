# Eigener Server mit Claude

Für Technische nutzt Studium Autopilot einen eigenen, kostenlosen Server bei Oracle, auf dem Claude mit dem eigenen Abo Termine
aus Mails findet und Begleitnotizen schreibt. Seit 0.5.0 Teil jedes Releases (`studium-server.tar.gz`).

Dazu gehören die Prüfung des Oracle-Kontos (`stand.mjs`), die Schritte der Einrichtung in der Cloud Shell (`einrichten.mjs`),
der Einrichtungs-Skill (`skill/server-einrichten/`), der Platzsucher (`platzsucher.py`), der Server selbst (Installer, Web-Dienst
mit verschlüsseltem Datenkanal, Speicherreserve, Uni-Zugang, Befehle), der Abruf des Uni-Postfachs ohne KI (`abrufen.py`) und
der Claude-Lauf mit dem Skill (`lauf.mjs`, `skill/studium-autopilot/`, Prüfung `eingang.mjs`). Die Gegenstelle im Plugin ist
`server.js` (Zeile „Eigener Server“). Noch nicht: Abrufe von ILIAS-Dateien und Alma.

**Einrichtung:** Ein Claude-Skill (`skill/server-einrichten/`: `SKILL.md`, `schritte.md`, `kosten.md`) führt in Claude Desktop durch
die Schritte 0 bis 12, wahlweise mit Computer Use („Claude klickt“) oder mit Ansagen („Ich klicke selbst“). Angelegt wird im
Konto nur über `einrichten.mjs`; jeder Schritt erkennt am Stand, ob er schon erledigt ist. `tests/server-einrichten.test.js`
prüft, dass jeder im Skill genannte Befehl existiert.

**Eine Version für alles:** Der Prompt (README und Knopf **Prompt kopieren**) lässt Claude die Anleitung aus dem Tag des
neuesten Releases lesen, nie von `main`. `release.py` setzt in `schritte.md` (Schritt 2) genau diese Version für den Download
des Server-Pakets ein. So passen Anleitung und Paket immer zusammen, auch wenn während einer Einrichtung ein neues Release
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
node einrichten.mjs platzsucher --mail <adresse> --schluessel <datei.pub>
                                                      Mail-Thema mit Abo, Helfer (Micro, 50 GB) mit platzsucher-helfer.yaml,
                                                      dynamische Gruppe und Richtlinie nur für ihn
node einrichten.mjs abschliessen                      Rechte des Platzsuchers weg, Boot-Volume auf den freien Rest,
                                                      Blockspeicher der Quota auf den Stand danach
node einrichten.mjs adresse                           öffentliche IP, https://<IP>.sslip.io und SSH-Befehl
node einrichten.mjs platzsucher-beenden               Helfer beenden, seine Rechte und das Mail-Thema entfernen
```

Exit-Code: `0` erledigt, `1` Fehler oder eine Kostenregel lässt es nicht zu (z. B. die freie A1-Menge ist belegt), `2`
Rückfrage nötig bzw. falscher Aufruf, `3` Oracle hat gerade keinen Platz (dann der Platzsucher).

- **Schutz in Konten mit bezahlten Ressourcen:** Die Quota würde jede weitere bezahlte Ressource blockieren. Der Schritt nennt
  sie und legt die Quota erst mit `--ja` an. Was schon läuft, bleibt erlaubt. Das Budget legt er immer an.
- **Ohne Schutz kein Server:** `server` und `platzsucher` brechen mit Exit 2 ab, solange Quota und Budget mit Mail-Regel fehlen
  (sonst hielte nichts eine zweite bezahlte Instanz auf). Ein Budget zählt nur mit Mail-Regel für echte Kosten (`stand.mjs`).
- **Wiederholen repariert:** Bricht ein Schritt mittendrin ab, ergänzt der nächste Aufruf, was fehlt (Mail-Regeln des Budgets,
  Gruppe und Richtlinie des Helfers; ein schon laufender Helfer startet dann neu und sucht weiter). Den Helfer (E2.1.Micro)
  versucht er in jedem Bereich, weil es ihn oft nur in einem gibt.
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
(FIPS-Modus, jetzt RSA 4096). Noch offen: Platzsucher in einem neuen Konto.

## Platzsucher: `server/platzsucher.py`

Beim Anlegen des freien Servers meldet Oracle oft „Out of host capacity“, teils tagelang. Der Platzsucher versucht es darum
auf einem kleinen Helfer weiter, nicht am Rechner der Nutzerin oder des Nutzers:

- **Helfer:** `VM.Standard.E2.1.Micro` mit Ubuntu 24.04 Minimal (Always Free, fast immer verfügbar), Boot-Volume 50 GB,
  Kennzeichen `studium-autopilot=helfer`. Die
  Einrichtung gibt ihm `platzsucher-helfer.yaml` als cloud-init mit (Platzhalter `KONFIG_JSON_BASE64` = Konfiguration,
  `PLATZSUCHER_GZ_BASE64` = `platzsucher.py` gepackt, aus dem Paket in der Cloud Shell, das schon mit seiner Prüfsumme geprüft
  ist). Er installiert nur die OCI-Kommandozeile in fester Version und lädt sonst nichts nach; so läuft er auch mit einem
  Testpaket vor einem Release. Oracle nimmt höchstens 32 000 Byte Startdaten, die Einrichtung prüft das vorher.
- **Rechte nur für den Helfer:** dynamische Gruppe `studium-platzsucher` mit der Regel `instance.id = '<OCID des Helfers>'` und
  eine Richtlinie im Compartment:
  `manage instance-family`, `use volume-family`, `use virtual-network-family`, `use ons-topics`, dazu `manage volume-family`
  nur mit `request.permission = 'VOLUME_DELETE'` (damit er sich samt Boot-Volume beendet; eine ältere Richtlinie bringt die
  Einrichtung auf diesen Stand). Der Platzsucher meldet sich mit
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
```

Der Installer ist wiederholbar: Jeder Schritt prüft zuerst, ob er schon erledigt ist; Schlüssel und Uni-Zugang bleiben bei
jedem weiteren Lauf erhalten. Er richtet ein:

| Teil | Was |
|---|---|
| Pakete | `nodejs`, `jq`, `qrencode`, `python3`, `iptables-persistent`, `unattended-upgrades` (Sicherheitsupdates automatisch), Caddy aus dessen offiziellem Paketarchiv |
| Benutzer `studium` | führt die Dienste aus (Web-Dienst, Claude-Lauf, Zustand); Claude Code liegt in `/var/lib/studium/.local/bin/claude` |
| Benutzer `studium-abruf` | nur der Abruf des Uni-Postfachs; nur er kann den entschlüsselten Uni-Zugang lesen (Gruppe `studium` für die Rohdaten) |
| `/opt/studium-server/<version>` | das Paket; `aktuell` zeigt auf die laufende Version |
| `/etc/studium-server/dienst.json` | Adresse, Zugangsschlüssel und Datenschlüssel (je 32 Byte, nur root und `studium` lesen) |
| `/var/lib/studium-server` | Zustand, Eingang (Ergebnisse für das Plugin), Einmal-Codes |
| `studium-server-dienst` | Web-Dienst `dienst.mjs`, nur auf 127.0.0.1; Caddy stellt `/v1/` per HTTPS bereit, alles andere ist 404 |
| `studium-server-speicher` | Speicherreserve `speicher-reserve.mjs` (25 % des Arbeitsspeichers), damit Oracle den Server nicht wegen Leerlaufs anhält |
| `studium-server-zustand.timer` | alle 15 Minuten `zustand.mjs`: Claude angemeldet, Uni-Zugang, Reserve |
| `studium-server-abruf.timer` | alle 15 Minuten `abrufen.py` ohne KI: das Uni-Postfach, nur mit gespeichertem Uni-Zugang (nach der Uhr, weil ein übersprungener Dienst einen relativen Zeitgeber nicht weiterstellt). Steht in Obsidian ein Takt von 30 oder 60 Minuten, fallen die Zwischenzeiten aus, außer nach „Mails durchsuchen“. Beim ersten Start ab 06:30 Uhr der tägliche Sicherheitslauf: die Uni-Mails der letzten 24 Stunden noch einmal und ein Anstoß (Grund `taeglich`), auch ohne neue Mail |
| `studium-server-lauf.path` | startet den Claude-Lauf `lauf.mjs`, sobald ein Abruf oder Knopf einen Anstoß schreibt |
| `studium-server-gmail.timer` | 07:30, 13:30 und 19:30 Uhr (Berlin): Anstoß mit Gmail-Suche, wenn der Takt es will (dreimal am Tag: letzte Suche über 2 Stunden her, so ersetzt der Sicherheitslauf die um 07:30; einmal: über 20 Stunden; nie: nie) |
| `studium-server-aktualisieren.timer` | täglich: neues Server-Paket aus dem Release, nur mit passender Prüfsumme und nur vorwärts (nie auf eine ältere Version zurück) |
| Firewall | Port 443 in den iptables-Regeln des Servers (die Sicherheitsliste des Netzes legt `einrichten.mjs netz` an) |

### Web-Dienst (`dienst.mjs`)

| Weg | Wer | Was |
|---|---|---|
| `GET /v1/status` | alle | Stand aus festen Werten: Version, Claude, Gmail, Weiterleitung, Uni-Zugang, Reserve, letzter Abruf, letzter Lauf, ob ein Lauf wartet oder läuft (`claude_lauf`), Fehlercodes. Nie Namen, Adressen, Texte oder Schlüssel |
| `POST /v1/anstoss` | mit Zugangsschlüssel | Knopf „Mails durchsuchen“ in Obsidian: Anstoß für einen Lauf mit Gmail (Grund `knopf`), höchstens alle 10 Minuten (sonst 429 mit `wieder`); ein wartender Anstoß bleibt |
| `GET /v1/eingang` | mit Zugangsschlüssel | noch nicht übernommene Ergebnisse, verschlüsselt; nach 30 Tagen fällt eine Datei nur weg, wenn alle ihre Termine vorbei sind, spätestens nach 180 |
| `POST /v1/stand` | mit Zugangsschlüssel | verschlüsselter Stand des Plugins (Modulcodes, Studienbeginn, Variante, Auszug aus dem Tresor: Termine mit Titel und Datum, offene To-dos; Takt aus den Einstellungen, Uni-Postfach 15, 30 oder 60 Minuten und Gmail 3-, 1- oder 0-mal am Tag, auch als `takt.json` für den Abruf; übernommene Dateien, diese löscht der Server) |
| `POST /v1/unterlagen` | mit Zugangsschlüssel | verschlüsselt bis zu 3 Textfassungen von Unterlagen (nur Folien, Skript, Übung, Tutorium, Lösung, Altklausur, Literatur; je höchstens 400 000 Zeichen) nach `unterlagen/neu/`, höchstens 30 warten (sonst 429; das Plugin schickt bis zu 3 Anfragen je Abruf, neueste PDF zuerst); stößt einen Lauf an, wenn keiner wartet |
| `POST /v1/verbinden` | mit Einmal-Code | Adresse, Zugangs- und Datenschlüssel für ein neues Gerät |

Je Absender (letzter Eintrag in `X-Forwarded-For`, den Caddy setzt) antworten die geschützten Wege nach 10 Fehlversuchen in
10 Minuten 10 Minuten lang mit 429. Ein gültiger Zugangsschlüssel wird nie gesperrt, sonst könnte jeder das Plugin aussperren.
Anfragen über 64 KB werden abgelehnt.

**Datenkanal (`kanal.mjs`):** AES-256-GCM über Web Crypto, dieselbe Schnittstelle wie im Plugin. Ein Paket ist
`{ schema, zweck, iv, daten }`. Der Zweck („eingang“ oder „stand“) ist Teil der Verschlüsselung, damit sich ein Paket nicht als
das andere ausgeben lässt.

**Verbinden:** `sudo studium-server verbinden` zeigt einen Link `obsidian://studium-autopilot?aktion=server-verbinden&…` und
einen QR-Code. Darin steht nur ein Code, der einmal und 30 Minuten gilt. Die Schlüssel holt das Plugin über HTTPS und legt sie
in den Schlüsselbund des Geräts. Auf dem Server liegt nur der SHA-256 des Codes.

### Abruf ohne KI (`abrufen.py`)

Nur Python-Standardbibliothek. Neues landet in `roh/` mit einer Zeile in `roh/INDEX.md`; nur dann gibt es einen Anstoß für
Claude. Der Server gibt Claude nur, wofür es KI braucht: Mails. Abgaben aus dem ILIAS-Kalender holt das Plugin selbst und ohne
KI (ein Schreiber je Quelle, `eba.quelleExtern`); Kurstitel mit Kurs-Passwörtern gehen so nie an Claude.

- **Uni-Postfach:** IMAP über TLS, nur lesend (`EXAMINE`, `BODY.PEEK`, nichts wird als gelesen markiert). Beim ersten Abruf
  die letzten 14 Tage, danach nur neue Mails (UID), höchstens 30 je Abruf. Mails werden zu Text (HTML ohne Skripte, Anhänge nur
  mit Namen). Den Uni-Zugang bekommt nur dieser Dienst über `LoadCredentialEncrypted`.

### Claude-Lauf (`lauf.mjs` und `skill/`)

Je Lauf ein eigener Ordner `laeufe/<Zeit>/` mit `auftrag.md`, den Rohdaten, `bisher.json` (schon gelieferte Termine),
`stand.json` (vom Plugin), `tresor.json` (was schon in Obsidian steht: Termine mit Titel und Datum, offene To-dos mit Kennung und Notiz; geprüft wie
das Eingang, To-dos mit Zugangsdaten fallen weg; doppelte To-dos nennt Claude als Paar `todo_doppel` aus diesen Kennungen, das
Plugin macht aus dem einen einen einfachen Punkt mit Link auf das andere), `zentral.json` (die öffentlichen Termine aller EcoBA-Studierenden, damit Claude
sie nicht doppelt liefert), die ältesten Textfassungen aus `unterlagen/neu/` (bis zu 6, zusammen höchstens 200 000 Zeichen, eine größere allein; der Rest im nächsten Lauf gleich danach) (Ordner `unterlagen/`, dazu schreibt Claude
Begleitnotizen; scheitert der Lauf, kommen sie zurück, warten danach noch welche, startet gleich der nächste Lauf) und dem Skill
`studium-autopilot`. Claude Code läuft headless (`claude -p`) mit dem Abo des Nutzers, Standardmodell
Sonnet (`studium-server modell opus` für Opus):

- **Werkzeuge:** nur Lesen, Suchen und Schreiben von `ausgabe.json`; kein Bash, kein Web, keine Unteragenten, nichts außerhalb
  des Lauf-Ordners (Glob und Grep ohne eigene Freigabe; mit Claude Code im Modus `dontAsk` geprüft: außerhalb verweigert). Gmail nur lesend und nur, wenn die Gmail-Suche dran ist (Uhrzeiten oben, Knopf, Sicherheitslauf, oder letzte Suche
  laut Takt lange genug her); mit Takt „nie“ gar nicht. Der Lauf sieht weder Uni-Zugang noch Schlüssel des Dienstes.
- **Prüfung (`eingang.mjs`):** Jeder Termin muss die Regeln des Plugins für zentrale Termine erfüllen (Kategorien, Modulcode,
  Datum, keine Links oder Markdown im Titel); ungültige fallen einzeln weg. Die id leitet der Server aus Claudes `schluessel`
  ab, damit eine Änderung denselben Termin trifft. Ins Eingang kommt nur, was neu oder geändert ist; Vergangenes nur als
  Änderung eines bekannten Termins.
- **Fehler:** Bei Limit oder ungültiger Ausgabe kommen die Rohdaten zurück und der nächste Lauf versucht es erneut; der Status
  meldet `claude-limit` bzw. `ausgabe-ungueltig`. Der Lauf übernimmt `roh/` in einem Schritt; was der Abruf währenddessen
  holt, wartet auf den nächsten, und beim Zurücklegen wird Datei für Datei zusammengeführt. Die letzten 10 Läufe bleiben.

### Uni-Zugang (freiwillig)

`sudo studium-server uni-zugang setzen` fragt Benutzername und Passwort ab; das Passwort verdeckt (`systemd-ask-password`)
und nur über Pipes, nie in einer Befehlszeile. Gespeichert wird es nur verschlüsselt mit `systemd-creds` unter
`/etc/credstore.encrypted/uni-zugang` (nur root). Entschlüsselt bekommt es nur der Abruf des Uni-Postfachs, unter eigenem
Benutzer `studium-abruf`; Web-Dienst und Claude-Lauf (Benutzer `studium`) können es auch während eines Abrufs nicht lesen
(`/run/credentials` und fremde Prozesse sind für sie unsichtbar). Nach einer abgelehnten Anmeldung laufen keine automatischen Versuche mehr
(Status `falsch`), damit das Uni-Konto nicht gesperrt wird. `uni-zugang loeschen` entfernt ihn,
`uni-zugang pruefen` zeigt nur, ob er da ist.

**Grenze:** Der Schlüssel von `systemd-creds` liegt auf demselben Server. Das Passwort steht also nie lesbar in einer Datei, im
Status, im Journal oder in einer Kopie der Datei allein; wer aber root auf dem Server ist, kann es entschlüsseln. Darum: nur
Schlüssel-Anmeldung per SSH, automatische Sicherheitsupdates, nur Port 443 offen.

### Befehle (`studium-server`)

```
studium-server status                  Stand und Dienste
studium-server verbinden               Einmal-Link und QR-Code für ein Gerät
studium-server uni-zugang setzen       Uni-Zugang verschlüsselt speichern
studium-server uni-zugang loeschen     Uni-Zugang löschen
studium-server uni-zugang pruefen      gespeichert oder nicht
studium-server zustand                 Zustand neu prüfen
studium-server jetzt                   Claude-Lauf jetzt anstoßen (mit Gmail)
studium-server modell sonnet|opus      Modell der Claude-Läufe
studium-server lauf                    Ergebnis des letzten Claude-Laufs
studium-server aktualisieren           Server-Paket aus dem Release (Prüfsumme) installieren
```

### Geprüft

Neben den Tests in `tests/server.test.js` lief der Installer in einem frischen Ubuntu 24.04 (Arm, Node 18, systemd) im
Testmodus dreimal hintereinander. Ende zu Ende über Caddy mit 27 Prüfungen: Status, Verbinden per Code, Eingang verschlüsselt
und mit Node 18 entschlüsselt, Stand mit Aufräumen, Uni-Zugang nur verschlüsselt und für `studium` unlesbar, nichts davon im
Status oder Journal, Sperre nach Fehlversuchen, Speicherreserve wirklich belegt. Claude Code ließ sich als `studium`
installieren. Noch nicht geprüft: HTTPS mit `sslip.io` an einer echten öffentlichen IP.

Abruf und Lauf: `server/test_abrufen.py` (IMAP als Attrappe), `tests/server-eingang.test.js` (auch gegen
`terminePruefen` des Plugins) und `tests/server-lauf.test.js` (Claude als Attrappe). Dazu ein echter Lauf am 18.10.2026 mit
einem echten Uni-Postfach (nur lesend), ILIAS-Kalender und Gmail, Sonnet: 16 Termine, 4 Hinweise, nichts verworfen, etwa
7,5 Minuten. Daraus kamen die Regeln für Vergangenes, zentrale Termine und Modulcodes aus Kursnamen. Den ILIAS-Kalender liest
der Server seitdem nicht mehr (siehe „Abruf ohne KI“).
