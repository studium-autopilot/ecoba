# Schritte der Einrichtung

Jeder Schritt beginnt mit der Prüfung „Schon erledigt, wenn …“. Ist er erledigt, sagst du das in einem Satz und gehst weiter.
Ist ein Schritt halb fertig (Server angelegt, Installation abgebrochen), gilt er als offen und wird wiederholt: Alle Befehle
sind wiederholbar und legen nichts doppelt an.

| # | Schritt | Schon erledigt, wenn … |
|---|---|---|
| 0 | Voraussetzungen und Art | – (immer, kurz) |
| 1 | Oracle-Konto | sich der Mensch bei Oracle anmelden kann |
| 2 | Bestand | – (läuft immer) |
| 3 | Schutz vor Kosten | `stand.mjs` meldet Quota „nur-kostenlos“ und Budget „kostenwarnung“ |
| 4 | Server anlegen | `stand.mjs` meldet „Server … ist schon angelegt“ |
| 5 | Paket installieren | `https://<Adresse>/v1/status` antwortet mit einer Version |
| 6 | Claude auf dem Server | Status: `claude` ist `angemeldet` |
| 7 | Gmail | Status: `gmail` ist `ok` |
| 8 | Uni-Mails | Status: `uni_zugang` ist `gespeichert` oder `weiterleitung` ist `ok` |
| 9 | Obsidian verbinden | Status: `plugin_abruf` liegt höchstens 30 Minuten zurück |
| 10 | Erster Lauf | Status: `letzter_lauf.ok` ist `true` |
| 11 | Kostenprüfung | – (läuft immer am Ende) |
| 12 | Abschluss | – |

Den Status liest du selbst (Webabruf, öffentlich, ohne persönliche Daten), der Mensch muss nichts kopieren. Die Adresse liefert
`node server/einrichten.mjs adresse`.

## 0. Voraussetzungen und Art

- Fragen: „Soll ich klicken (‚Claude klickt‘), oder klickst du selbst und ich sage an?“
- Nötig: Claude Pro oder Max (Claude läuft auf dem Server mit diesem Abo), Claude Desktop, Studium Autopilot in Obsidian
  eingerichtet. Bei „Claude klickt“ zusätzlich Computer Use und auf Windows Claude in Chrome. Fehlt etwas: sagen, wie man es
  einschaltet, und warten.
- Fenster nebeneinander anordnen (SKILL.md, „Bildschirm geteilt“).

## 1. Oracle-Konto

- Hat der Mensch schon ein Konto: anmelden lassen und weiter mit Schritt 2. Sonst: [signup.cloud.oracle.com](https://signup.cloud.oracle.com).
- Felder erklären, eintragen tut der Mensch: Name, Mail, Land. **Heimatregion** gilt für immer und lässt sich nicht ändern.
  Frankfurt ist beliebt und hat oft keinen freien Platz für den Server; eine andere Region in der EU kann schneller gehen.
- Kreditkarte: nur zur Prüfung, Oracle bucht ohne Upgrade nichts ab. Das Upgrade auf Pay-As-You-Go wird nie gemacht
  ([kosten.md](kosten.md), Regel 1).
- Zwei-Faktor einrichten lässt du den Menschen allein.

## 2. Bestand

Die **Cloud Shell** öffnen (Konsole oben rechts, Symbol **>_**). Dort ist die OCI-Kommandozeile schon angemeldet. Dann das
Server-Paket aus dem neuesten Release holen, nur mit passender Prüfsumme:

```bash
mkdir -p ~/studium-autopilot && cd ~/studium-autopilot
info=$(curl -fsSL https://api.github.com/repos/studium-autopilot/ecoba/releases/latest)
url=$(jq -r '.assets[] | select(.name == "studium-server.tar.gz") | .browser_download_url' <<<"$info")
summe=$(jq -r '.assets[] | select(.name == "studium-server.tar.gz") | .digest // empty' <<<"$info")
curl -fsSL "$url" -o studium-server.tar.gz && echo "${summe#sha256:}  studium-server.tar.gz" | sha256sum -c - && tar -xzf studium-server.tar.gz
node server/stand.mjs
```

**Testpaket** (vor einem Release, mit `testpaket.txt`): Statt von GitHub kommt das Paket aus dem Testpaket. Der Mensch lädt
`studium-server.tar.gz` über das Menü der Cloud Shell (**Upload**) hoch, die Datei landet im Home-Ordner. Dann, mit der Prüfsumme
aus `testpaket.txt`:

```bash
mkdir -p ~/studium-autopilot && cd ~/studium-autopilot && mv ~/studium-server.tar.gz .
echo "<Prüfsumme aus testpaket.txt>  studium-server.tar.gz" | sha256sum -c - && tar -xzf studium-server.tar.gz
node server/stand.mjs
```

Meldet `sha256sum` einen Fehler: nichts ausführen, neu laden, sonst anhalten. Das Ergebnis von `stand.mjs` erklärst du in zwei
Sätzen (Kontotyp, was frei ist, was von Studium Autopilot schon da ist). Bei „Ich klicke selbst“ kopiert der Mensch die
Ausgabe zurück. In jeder neuen Cloud-Shell-Sitzung zuerst `cd ~/studium-autopilot`.

## 3. Schutz vor Kosten

```bash
node server/einrichten.mjs schutz --mail <Mail-Adresse>
```

Die Mail-Adresse fragst du ab (Warnungen von Oracle gehen dorthin). Exit 2 heißt: Im Konto läuft schon etwas, das nicht
kostenlos ist. Dann nennst du es, erklärst, dass die Quota weitere bezahlte Ressourcen blockiert, und fragst. Nur mit Zustimmung
noch einmal mit `--ja`.

## 4. Server anlegen

```bash
[ -f ~/.ssh/studium_autopilot ] || ssh-keygen -t ed25519 -N "" -C studium-autopilot -f ~/.ssh/studium_autopilot
node server/einrichten.mjs netz
node server/einrichten.mjs server --schluessel ~/.ssh/studium_autopilot.pub
```

- Exit 1 mit „Neuer Server passt nicht“: Die freie Menge ist belegt (z. B. von einem eigenen Server). Erklären, nichts anlegen
  ([kosten.md](kosten.md), Regel 2).
- **Exit 3 (kein Platz):** Oracle hat in keinem Verfügbarkeitsbereich Platz. Erklären und den **Platzsucher** anbieten: Ein
  kleiner kostenloser Helfer versucht es weiter, alle paar Minuten, auch wenn der Rechner aus ist, und schickt eine Mail, sobald
  der Server da ist.

  ```bash
  node server/einrichten.mjs platzsucher --mail <Mail-Adresse> --schluessel ~/.ssh/studium_autopilot.pub
  ```

  Danach: „Bestätige die Mail von Oracle (‚Confirm subscription‘). Du kannst den Rechner jetzt ausmachen. Kommt die Mail ‚Dein
  Server ist da‘, sag mir ‚Weiter mit der Einrichtung‘.“

## 5. Paket installieren

```bash
cd ~/studium-autopilot
node server/einrichten.mjs abschliessen
IP=$(node server/einrichten.mjs adresse --json | jq -r .ip)
scp -i ~/.ssh/studium_autopilot -o StrictHostKeyChecking=accept-new studium-server.tar.gz ubuntu@$IP:
ssh -i ~/.ssh/studium_autopilot ubuntu@$IP "tar -xzf studium-server.tar.gz && sudo bash server/installieren.sh --ip $IP"
```

- `abschliessen` entfernt die Rechte eines Platzsuchers, vergrößert das Boot-Volume auf den ganzen freien Rest und setzt die
  Quota so, dass nichts Neues mehr hinzukommt. Meldet es „Boot-Volume … vergrößert“: einmal
  `ssh -i ~/.ssh/studium_autopilot ubuntu@$IP sudo reboot`, nach etwa einer Minute weiter (Ubuntu vergrößert das Dateisystem
  beim Start).
- Ist der Server gerade erst angelegt, braucht er ein bis zwei Minuten, bis SSH antwortet.
- Der Installer ist wiederholbar. Fertig ist der Schritt, wenn der Status eine Version meldet.

## 6. Claude auf dem Server

```bash
ssh -t -i ~/.ssh/studium_autopilot ubuntu@$IP "sudo -u studium -H /var/lib/studium/.local/bin/claude auth login"
```

Claude Code zeigt einen Link. Bei „Claude klickt“ öffnest du ihn im Browser; anmelden und **Autorisieren** klickt der Mensch.
Den angezeigten Code trägst du in die Cloud Shell ein (bei „Ich klicke selbst“ der Mensch). Danach
`ssh -i ~/.ssh/studium_autopilot ubuntu@$IP sudo studium-server zustand`; fertig, wenn der Status `claude: angemeldet` meldet.

## 7. Gmail

- In claude.ai: **Einstellungen → Connectors → Gmail → Verbinden**. Die Google-Zustimmung gibt der Mensch.
- Erklären: Claude sucht und liest auf dem Server nur; Senden, Entwürfe, Labels und Löschen sind dort gesperrt.
- Fertig, wenn der Status nach dem ersten Lauf `gmail: ok` meldet (Schritt 10).

## 8. Uni-Mails

Zwei Wege, der Mensch wählt:

- **Uni-Postfach direkt (empfohlen, freiwillig):** Der Server liest das Postfach der Uni nur lesend. Nutzen: alles kommt an,
  auch ohne Weiterleitung. Risiko: Das Uni-Passwort liegt verschlüsselt auf dem Server; wer dort root ist, könnte es lesen. Der
  Mensch tippt es selbst in eine verdeckte Eingabe. Bei „Claude klickt“ hältst du an und sagst: „Tipp jetzt dein Passwort, ich
  schaue nicht hin und tippe nichts.“

  ```bash
  ssh -t -i ~/.ssh/studium_autopilot ubuntu@$IP "sudo studium-server uni-zugang setzen"
  ```

- **Weiterleitung an Gmail:** [webmail.uni-tuebingen.de](https://webmail.uni-tuebingen.de/) → links **Webmail → Filter →
  Weiterleitung** → Gmail-Adresse eintragen, **„Kopien der Nachrichten in diesem Konto belassen?“ an lassen** → **Zur
  Regelliste zurückkehren** → Regel per Doppelklick aktivieren. Anmelden tut der Mensch.

## 9. Obsidian verbinden

```bash
ssh -t -i ~/.ssh/studium_autopilot ubuntu@$IP "sudo studium-server verbinden"
```

Der Server zeigt einen Einmal-Link (30 Minuten) und einen QR-Code. Am Rechner den Link öffnen: Obsidian fragt „Mit deinem Server
verbinden?“, **Verbinden** tippt der Mensch. Fürs Handy den QR-Code mit der Kamera scannen. Jedes Gerät braucht einen eigenen
Code. Unter **Einstellungen → Verbindungen** steht danach die Zeile „Eigener Server“.

## 10. Erster Lauf

```bash
ssh -i ~/.ssh/studium_autopilot ubuntu@$IP "sudo studium-server jetzt"
```

Der Lauf dauert einige Minuten. Danach `sudo studium-server lauf` (Ergebnis) und in Obsidian die Zeile „Eigener Server“ („Aktualisiert …“).
Bei „Claude klickt“ schaust du selbst in Obsidian nach, sonst fragst du. Meldet der Status `claude-limit`: Das Abo-Limit ist
erreicht, der nächste Lauf versucht es von selbst.

## 11. Kostenprüfung

```bash
cd ~/studium-autopilot && node server/stand.mjs --kosten
```

Exit 0: alles kostenlos. Exit 1: jede Zeile unter „Befunde“ mit Ursache nennen und erklären, wie man sie behebt. Exit 2: die
Prüfung war unvollständig; den Grund nennen.

## 12. Abschluss

- Was wann läuft: Der Server prüft alle 15 Minuten die Quellen ohne KI; Claude läuft nur bei Neuem und durchsucht Gmail um
  7:30, 13:30 und 19:30 Uhr. Jeden Morgen ab 6:30 Uhr liest Claude die Uni-Mails des letzten Tages noch einmal und holt
  nach, was liegen geblieben ist. Obsidian holt alle 15 Minuten ab. Wie oft der Server nachsieht, stellst du im Fenster
  „Eigener Server“ ein (Uni-Postfach alle 15, 30 oder 60 Minuten, Gmail dreimal, einmal oder nie am Tag).
- Wo der Stand steht: Obsidian → Einstellungen → Verbindungen → „Eigener Server“.
- Claude und dein Obsidian: In Claude Desktop unter **Code** den Ordner deines Tresors öffnen. Dort kennt Claude den Aufbau
  (Skill `.claude/skills/studium-autopilot/` im Tresor), findet Termine und Unterlagen, legt Notizen richtig an und bereitet
  eine Meldung an den Autor vor, wenn du sagst, dass etwas nicht geht.
- Abschalten: in Obsidian **Trennen**; auf dem Server `claude auth logout`; in claude.ai den Gmail-Connector trennen; in der
  Oracle-Konsole die Instanz „studium-autopilot-server“ beenden. Das Konto selbst kostet danach nichts.
